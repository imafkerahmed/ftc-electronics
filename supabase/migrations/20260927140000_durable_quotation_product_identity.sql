-- Migration: 20260927140000_durable_quotation_product_identity.sql
-- Description:
--   Hardens convert_quotation_to_sale_atomic to verify catalog-backed products
--   referenced on quotations still exist in public.products before converting.
--   If a product was deleted, the RPC fails explicitly rather than silently creating
--   sale_items with NULL product_id or causing foreign key discrepancies.

CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale_atomic(
    p_quote_id UUID,
    p_actor_id TEXT DEFAULT NULL,
    p_actor_name TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT NULL,
    p_amount NUMERIC DEFAULT 0,
    p_cheque_number TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_bank_name TEXT DEFAULT NULL,
    p_cheque_notes TEXT DEFAULT NULL,
    p_payment_terms TEXT DEFAULT 'due_on_receipt',
    p_due_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote RECORD;
    v_sale_id UUID;
    v_payment_id UUID;
    v_invoice_num TEXT;
    v_receipt_no TEXT;
    v_items_count INT := 0;
    v_final_terms TEXT := 'due_on_receipt';
    v_final_due_date DATE;
    v_issued_by_profile_id UUID;
    v_issued_by_name TEXT;
    v_has_payment BOOLEAN := false;
    v_balance_due NUMERIC := 0;
    v_payment_status TEXT := 'UNPAID';
    v_payment_amt NUMERIC := COALESCE(p_amount, 0);
    v_snapshot JSONB;
BEGIN
    -- 1. Fetch & Lock Quotation
    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quotation not found.');
    END IF;

    -- Reject if draft
    IF v_quote.status = 'draft' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Draft quotations cannot be converted directly to an invoice. The quotation must first be formally issued.');
    END IF;

    -- Check durable quotation_id first, then legacy fallback (Converted status takes absolute precedence)
    IF EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.quotation_id = p_quote_id
           OR (s.quotation_id IS NULL AND (
               s.invoice_snapshot->>'quote_number' = v_quote.quote_number
               OR s.notes = 'Converted from Quotation #' || v_quote.quote_number
               OR s.notes LIKE 'Converted from Quotation #' || v_quote.quote_number || '%'
           ))
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This quotation has already been converted to an invoice.');
    END IF;

    -- Reject if voided
    IF v_quote.status = 'voided' OR v_quote.voided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot convert a voided quotation.');
    END IF;

    -- Reject if rejected
    IF v_quote.status = 'rejected' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot convert a rejected quotation.');
    END IF;

    -- Reject if expired
    IF v_quote.status = 'expired' OR (v_quote.valid_until IS NOT NULL AND v_quote.valid_until < NOW()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot convert an expired quotation. Please create a new quotation.');
    END IF;

    -- Reject if catalog-backed line items reference deleted/missing products
    IF v_quote.items IS NOT NULL AND jsonb_typeof(v_quote.items) = 'array' THEN
        IF EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_quote.items) elem
            WHERE (elem->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND NOT EXISTS (
                  SELECT 1 FROM public.products p
                  WHERE p.id = (elem->>'product_id')::uuid
              )
        ) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Quotation contains a catalog product that is no longer available. Update the quotation before issuing the invoice.'
            );
        END IF;
    END IF;

    -- 2. Validate Payment Terms & Authoritative Due Date
    IF p_payment_terms IS NOT NULL AND p_payment_terms = ANY (ARRAY['due_on_receipt', 'net_7', 'net_14', 'net_30', 'custom']) THEN
        v_final_terms := p_payment_terms;
    END IF;

    IF v_final_terms = 'custom' THEN
        IF p_due_date IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Due date is required when payment terms are Custom.');
        END IF;
        IF p_due_date < CURRENT_DATE THEN
            RETURN jsonb_build_object('success', false, 'error', 'Due date cannot be in the past for new invoices.');
        END IF;
        v_final_due_date := p_due_date;
    ELSIF v_final_terms = 'net_7' THEN
        v_final_due_date := CURRENT_DATE + 7;
    ELSIF v_final_terms = 'net_14' THEN
        v_final_due_date := CURRENT_DATE + 14;
    ELSIF v_final_terms = 'net_30' THEN
        v_final_due_date := CURRENT_DATE + 30;
    ELSE
        -- due_on_receipt
        v_final_due_date := CURRENT_DATE;
    END IF;

    -- 3. Validate Initial Payment (Optional)
    IF v_payment_amt > 0 THEN
        IF p_payment_method IS NULL OR LENGTH(TRIM(p_payment_method)) = 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Payment method is required when recording an initial payment.');
        END IF;

        IF v_payment_amt > COALESCE(v_quote.total_amount, 0) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Initial payment amount (LKR ' || v_payment_amt || ') exceeds quotation total (LKR ' || v_quote.total_amount || ').'
            );
        END IF;

        v_has_payment := true;
        IF p_payment_method = 'cheque' THEN
            IF p_cheque_number IS NULL OR LENGTH(TRIM(p_cheque_number)) = 0 THEN
                RETURN jsonb_build_object('success', false, 'error', 'Cheque number is required for cheque payments.');
            END IF;
            IF p_cheque_date IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Cheque date is required for cheque payments.');
            END IF;
            IF p_bank_name IS NULL OR LENGTH(TRIM(p_bank_name)) = 0 THEN
                RETURN jsonb_build_object('success', false, 'error', 'Bank name is required for cheque payments.');
            END IF;
            v_payment_status := 'pending';
        ELSE
            v_payment_status := 'cleared';
        END IF;
    END IF;

    -- 4. Authoritative Commercial Invoice Issuer Resolution (Decoupled from POS employees)
    v_issued_by_profile_id := CASE
        WHEN p_actor_id IS NOT NULL AND p_actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN p_actor_id::uuid
        ELSE NULL
    END;

    v_issued_by_name := COALESCE(NULLIF(TRIM(p_actor_name), ''), 'Admin Staff');

    -- 5. Generate Authoritative Invoice Number and Receipt Number
    v_invoice_num := public.generate_next_invoice_number();
    v_receipt_no := 'FTC-WHOLESALE-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 8));

    IF v_quote.items IS NOT NULL AND jsonb_typeof(v_quote.items) = 'array' THEN
        SELECT COALESCE(SUM((elem->>'qty')::int), 0)
        INTO v_items_count
        FROM jsonb_array_elements(v_quote.items) elem;
    END IF;
    IF v_items_count <= 0 THEN v_items_count := 1; END IF;

    -- Build Snapshot
    v_snapshot := jsonb_build_object(
        'quote_number', v_quote.quote_number,
        'customer_company', v_quote.customer_company,
        'customer_name', v_quote.customer_name,
        'customer_email', v_quote.customer_email,
        'customer_phone', v_quote.customer_phone,
        'customer_address', v_quote.customer_address,
        'subtotal', v_quote.subtotal,
        'discount_amount', v_quote.discount_amount,
        'tax_amount', v_quote.tax_amount,
        'total_amount', v_quote.total_amount,
        'issued_by_name', v_issued_by_name,
        'issued_by_profile_id', v_issued_by_profile_id,
        'items', v_quote.items
    );

    -- 6. Insert Sale Row (Including quotation_id, issued_by_profile_id, issued_by_name; cashier_id = NULL)
    INSERT INTO public.sales (
        quotation_id,
        receipt_number,
        invoice_number,
        invoiced_at,
        date,
        cashier_name,
        cashier_id,
        issued_by_profile_id,
        issued_by_name,
        customer_name,
        customer_company,
        customer_phone,
        customer_email,
        subtotal,
        discount,
        tax_amount,
        total,
        payment_method,
        cash_tendered,
        change_due,
        items_count,
        status,
        notes,
        payment_terms,
        due_date,
        invoice_snapshot,
        created_at,
        updated_at
    ) VALUES (
        p_quote_id,
        v_receipt_no,
        v_invoice_num,
        NOW(),
        NOW(),
        NULL, -- Not a POS register cashier
        NULL, -- Not a POS register cashier
        v_issued_by_profile_id,
        v_issued_by_name,
        v_quote.customer_name,
        v_quote.customer_company,
        COALESCE(v_quote.customer_phone, ''),
        v_quote.customer_email,
        COALESCE(v_quote.subtotal, 0),
        COALESCE(v_quote.discount_amount, 0),
        COALESCE(v_quote.tax_amount, 0),
        COALESCE(v_quote.total_amount, 0),
        CASE WHEN v_has_payment THEN p_payment_method ELSE NULL END,
        v_payment_amt,
        0,
        v_items_count,
        'completed',
        'Converted from Quotation #' || v_quote.quote_number,
        v_final_terms,
        v_final_due_date,
        v_snapshot,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_sale_id;

    -- 7. Insert Line Items Snapshot
    IF v_quote.items IS NOT NULL AND jsonb_typeof(v_quote.items) = 'array' THEN
        INSERT INTO public.sale_items (
            sale_id,
            product_id,
            product_name,
            sku,
            quantity,
            unit_price,
            item_discount,
            line_total,
            created_at,
            updated_at
        )
        SELECT
            v_sale_id,
            CASE
                WHEN (elem->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (elem->>'product_id')::uuid
                ELSE NULL
            END,
            COALESCE(elem->>'product_name', elem->>'name', elem->>'title', 'Line Item'),
            COALESCE(elem->>'sku', 'QUOTE-ITEM'),
            COALESCE((elem->>'quantity')::int, (elem->>'qty')::int, 1),
            COALESCE((elem->>'unit_price')::numeric, (elem->>'unitPrice')::numeric, 0),
            COALESCE((elem->>'item_discount')::numeric, (elem->>'discount')::numeric, 0),
            COALESCE(
                (elem->>'line_total')::numeric,
                (elem->>'total')::numeric,
                COALESCE((elem->>'unit_price')::numeric, (elem->>'unitPrice')::numeric, 0) * COALESCE((elem->>'quantity')::int, (elem->>'qty')::int, 1)
            ),
            NOW(),
            NOW()
        FROM jsonb_array_elements(v_quote.items) elem;
    END IF;

    -- 8. Insert Initial Payment if Provided
    IF v_has_payment THEN
        INSERT INTO public.sale_payments (
            sale_id,
            quotation_id,
            amount,
            payment_method,
            status,
            payment_date,
            cheque_number,
            cheque_date,
            bank_name,
            notes,
            created_by
        ) VALUES (
            v_sale_id,
            p_quote_id,
            v_payment_amt,
            p_payment_method,
            v_payment_status,
            NOW(),
            p_cheque_number,
            p_cheque_date,
            p_bank_name,
            p_cheque_notes,
            v_issued_by_name
        )
        RETURNING id INTO v_payment_id;
    END IF;

    -- 9. Update Quotation Status to Accepted
    UPDATE public.quotations
    SET
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_quote_id;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'invoice_number', v_invoice_num,
        'receipt_number', v_receipt_no,
        'payment_id', v_payment_id,
        'issued_by_name', v_issued_by_name,
        'issued_by_profile_id', v_issued_by_profile_id,
        'due_date', v_final_due_date,
        'payment_terms', v_final_terms,
        'items_count', v_items_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, DATE) TO service_role;
