CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale_atomic(p_quote_id uuid, p_actor_id text, p_actor_name text, p_payment_method text DEFAULT NULL::text, p_amount numeric DEFAULT 0, p_cheque_number text DEFAULT NULL::text, p_cheque_date date DEFAULT NULL::date, p_bank_name text DEFAULT NULL::text, p_cheque_notes text DEFAULT NULL::text, p_payment_terms text DEFAULT 'due_on_receipt'::text, p_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_quote record;
    v_sale_id uuid;
    v_payment_id uuid := NULL;
    v_invoice_num text;
    v_receipt_no text;
    v_cashier_id uuid;
    v_cashier_name text;
    v_items_count int := 0;
    v_initial_status text;
    v_final_terms text;
    v_calc_due_date date;
    v_has_payment boolean := false;
    v_cleared_paid numeric := 0;
    v_pending_clearance numeric := 0;
    v_balance_due numeric := 0;
    v_payment_status text := 'UNPAID';
    v_payment_amt numeric := COALESCE(p_amount, 0);
    v_snapshot jsonb;
BEGIN
    -- 1. Fetch & Lock Quotation
    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quotation not found.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.sales s 
        WHERE (s.notes = 'Converted from Quotation #' || v_quote.quote_number OR s.invoice_snapshot->>'quote_number' = v_quote.quote_number)
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This quotation has already been converted to an invoice.');
    END IF;

    -- 2. Validate Payment Terms & Authoritative Due Date
    IF p_payment_terms IS NOT NULL AND p_payment_terms = ANY (ARRAY['due_on_receipt', 'net_7', 'net_14', 'net_30', 'custom']) THEN
        v_final_terms := p_payment_terms;
    ELSE
        v_final_terms := 'due_on_receipt';
    END IF;

    CASE v_final_terms
        WHEN 'net_7' THEN
            v_calc_due_date := CURRENT_DATE + INTERVAL '7 days';
        WHEN 'net_14' THEN
            v_calc_due_date := CURRENT_DATE + INTERVAL '14 days';
        WHEN 'net_30' THEN
            v_calc_due_date := CURRENT_DATE + INTERVAL '30 days';
        WHEN 'custom' THEN
            v_calc_due_date := COALESCE(p_due_date, CURRENT_DATE);
        ELSE
            -- due_on_receipt
            v_calc_due_date := CURRENT_DATE;
    END CASE;

    -- 3. Validate Payment Amount if provided
    IF v_payment_amt < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount cannot be negative.');
    END IF;

    IF v_payment_amt > 0 THEN
        v_has_payment := true;
        IF v_payment_amt > v_quote.total_amount THEN
            RETURN jsonb_build_object('success', false, 'error', 'Payment amount (LKR ' || v_payment_amt::text || ') cannot exceed invoice total (LKR ' || v_quote.total_amount::text || ').');
        END IF;

        IF p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card', 'cheque', 'bank_transfer') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method: ' || COALESCE(p_payment_method, 'null'));
        END IF;

        IF p_payment_method = 'cheque' THEN
            IF NULLIF(TRIM(p_cheque_number), '') IS NULL OR p_cheque_date IS NULL OR NULLIF(TRIM(p_bank_name), '') IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Cheque number, cheque date, and bank name are required for cheque payments.');
            END IF;
            v_initial_status := 'pending';
        ELSE
            v_initial_status := 'cleared';
        END IF;
    END IF;

    -- 4. Authoritative Cashier Resolution
    SELECT id, name INTO v_cashier_id, v_cashier_name
    FROM public.employees
    WHERE profile_id = CASE WHEN p_actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_actor_id::uuid ELSE NULL END
      AND (is_active IS NULL OR is_active = true)
    LIMIT 1;

    IF v_cashier_id IS NULL THEN
        SELECT id, name INTO v_cashier_id, v_cashier_name
        FROM public.employees
        WHERE id = CASE WHEN p_actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_actor_id::uuid ELSE NULL END
          AND (is_active IS NULL OR is_active = true)
        LIMIT 1;
    END IF;

    IF v_cashier_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Your admin profile is not linked to an active employee record. Please link your staff account before issuing invoices.'
        );
    END IF;

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
        'items', v_quote.items
    );

    -- 6. Insert Sale Row
    INSERT INTO public.sales (
        receipt_number,
        invoice_number,
        invoiced_at,
        date,
        cashier_name,
        cashier_id,
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
        v_receipt_no,
        v_invoice_num,
        NOW(),
        NOW(),
        COALESCE(NULLIF(TRIM(v_cashier_name), ''), NULLIF(TRIM(p_actor_name), ''), 'Admin User'),
        v_cashier_id,
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
        v_calc_due_date,
        v_snapshot,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_sale_id;

    -- 7. Insert Line Items
    IF v_quote.items IS NOT NULL AND jsonb_typeof(v_quote.items) = 'array' THEN
        INSERT INTO public.sale_items (
            sale_id,
            product_id,
            product_name,
            sku,
            unit_price,
            item_discount,
            quantity,
            line_total
        )
        SELECT
            v_sale_id,
            NULL,
            COALESCE(elem->>'product_name', elem->>'name', 'Line Item'),
            COALESCE(elem->>'sku', 'QUOTE-ITEM'),
            COALESCE((elem->>'unit_price')::numeric, (elem->>'unitPrice')::numeric, 0),
            COALESCE((elem->>'item_discount')::numeric, (elem->>'discount')::numeric, 0),
            COALESCE((elem->>'quantity')::int, (elem->>'qty')::int, 1),
            COALESCE(
                (elem->>'line_total')::numeric,
                (elem->>'total')::numeric,
                COALESCE((elem->>'unit_price')::numeric, (elem->>'unitPrice')::numeric, 0) * COALESCE((elem->>'quantity')::int, (elem->>'qty')::int, 1),
                0
            )
        FROM jsonb_array_elements(v_quote.items) elem;
    END IF;

    -- 8. Insert Initial Payment Record ONLY IF v_has_payment is true (amount > 0)
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
            created_by,
            created_at,
            updated_at
        ) VALUES (
            v_sale_id,
            p_quote_id,
            v_payment_amt,
            p_payment_method,
            v_initial_status,
            NOW(),
            CASE WHEN p_payment_method = 'cheque' THEN TRIM(p_cheque_number) ELSE NULL END,
            CASE WHEN p_payment_method = 'cheque' THEN p_cheque_date ELSE NULL END,
            CASE WHEN p_payment_method = 'cheque' THEN TRIM(p_bank_name) ELSE NULL END,
            p_cheque_notes,
            COALESCE(p_actor_name, 'Admin User'),
            NOW(),
            NOW()
        )
        RETURNING id INTO v_payment_id;

        IF v_initial_status = 'cleared' THEN
            v_cleared_paid := v_payment_amt;
            v_pending_clearance := 0;
        ELSE
            v_cleared_paid := 0;
            v_pending_clearance := v_payment_amt;
        END IF;
    END IF;

    -- 9. Calculate Financial Summary
    v_balance_due := GREATEST(0, v_quote.total_amount - v_cleared_paid);

    IF v_cleared_paid >= v_quote.total_amount THEN
        v_payment_status := 'PAID';
    ELSIF v_cleared_paid > 0 THEN
        v_payment_status := 'BALANCE PENDING';
    ELSE
        v_payment_status := 'UNPAID';
    END IF;

    -- 10. Update Quotation Status
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
        'summary', jsonb_build_object(
            'invoice_total', v_quote.total_amount,
            'cleared_paid', v_cleared_paid,
            'pending_clearance', v_pending_clearance,
            'balance_due', v_balance_due,
            'available_to_record', GREATEST(0, v_quote.total_amount - v_cleared_paid - v_pending_clearance),
            'payment_status', v_payment_status,
            'payment_terms', v_final_terms,
            'due_date', v_calc_due_date,
            'is_revoked', false
        )
    );
END;
$function$
