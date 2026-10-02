-- ====================================================================
-- MIGRATION: 20260925190000_quotation_lifecycle_hardening.sql
-- DESCRIPTION: Quotation Lifecycle Hardening & Durable Invoice Linkage
--   1. Adds public.sales.quotation_id FK to public.quotations(id) with unique index
--   2. Performs safe 1-to-1 legacy backfill
--   3. Adds void columns & check constraint to public.quotations
--   4. Creates void_quotation_atomic RPC with security and immutability checks
--   5. Updates convert_quotation_to_sale_atomic to enforce durable FK linkage
--   6. Updates admin_get_unified_quotations to return display_status and void audit
--   7. Updates admin_get_unified_quotations_metrics to respect voided state
-- ====================================================================

-- 1. Add quotation_id to public.sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES public.quotations(id) ON DELETE RESTRICT;

-- Create unique index ensuring a quotation produces at most ONE commercial invoice
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_quotation_id ON public.sales(quotation_id)
WHERE quotation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotation_id_lookup ON public.sales(quotation_id);

-- 2. Safe 1-to-1 Legacy Backfill
WITH candidates AS (
  SELECT 
    s.id as sale_id,
    q.id as quotation_id,
    COUNT(*) OVER(PARTITION BY s.id) as quote_count_for_sale,
    COUNT(*) OVER(PARTITION BY q.id) as sale_count_for_quote
  FROM public.sales s
  JOIN public.quotations q ON (
    s.invoice_snapshot->>'quote_number' = q.quote_number
    OR s.notes = 'Converted from Quotation #' || q.quote_number
    OR s.notes LIKE 'Converted from Quotation #' || q.quote_number || '%'
  )
  WHERE s.quotation_id IS NULL
)
UPDATE public.sales s
SET quotation_id = c.quotation_id
FROM candidates c
WHERE s.id = c.sale_id
  AND c.quote_count_for_sale = 1
  AND c.sale_count_for_quote = 1;

-- 3. Add Void Audit Columns to public.quotations
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS voided_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS void_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS void_notes TEXT NULL;

-- Extend quotations status constraint
ALTER TABLE public.quotations
  DROP CONSTRAINT IF EXISTS quotations_status_check;

ALTER TABLE public.quotations
  ADD CONSTRAINT quotations_status_check
  CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'voided'));

-- 4. Atomic Void RPC
CREATE OR REPLACE FUNCTION public.void_quotation_atomic(
    p_quote_id UUID,
    p_reason TEXT,
    p_notes TEXT DEFAULT NULL,
    p_voided_by TEXT DEFAULT 'Staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote RECORD;
    v_clean_reason TEXT;
    v_clean_notes TEXT;
    v_actor TEXT;
    v_has_linked_sale BOOLEAN := false;
BEGIN
    -- Lock quotation exclusively
    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quotation not found.');
    END IF;

    -- Reject if already voided
    IF v_quote.status = 'voided' OR v_quote.voided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'This quotation is already voided.');
    END IF;

    -- Reject if converted (check durable FK and legacy fallback)
    SELECT EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.quotation_id = p_quote_id
           OR (s.quotation_id IS NULL AND (
               s.invoice_snapshot->>'quote_number' = v_quote.quote_number
               OR s.notes = 'Converted from Quotation #' || v_quote.quote_number
               OR s.notes LIKE 'Converted from Quotation #' || v_quote.quote_number || '%'
           ))
    ) INTO v_has_linked_sale;

    IF v_has_linked_sale THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot void a converted quotation. Converted commercial documents must be managed via Invoice Revocation.');
    END IF;

    -- Reject terminal states
    IF v_quote.status = 'rejected' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot void a rejected quotation.');
    END IF;

    IF v_quote.status = 'expired' OR (v_quote.valid_until IS NOT NULL AND v_quote.valid_until < NOW()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot void an expired quotation.');
    END IF;

    -- Validate Reason & Notes
    v_clean_reason := UPPER(TRIM(COALESCE(p_reason, '')));
    IF v_clean_reason NOT IN (
        'CUSTOMER_CANCELLED',
        'PRICING_ERROR',
        'DUPLICATE_QUOTATION',
        'INCORRECT_CUSTOMER',
        'TERMS_CHANGED',
        'REPLACED_BY_NEW_QUOTATION',
        'ADMINISTRATIVE_ERROR',
        'OTHER'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid void reason: ' || v_clean_reason);
    END IF;

    v_clean_notes := NULLIF(TRIM(COALESCE(p_notes, '')), '');
    IF v_clean_reason = 'OTHER' AND v_clean_notes IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Notes are required when selecting reason "Other".');
    END IF;

    v_actor := COALESCE(NULLIF(TRIM(p_voided_by), ''), 'Staff');

    -- Update Quotation Status
    UPDATE public.quotations
    SET
        status = 'voided',
        voided_at = NOW(),
        voided_by = v_actor,
        void_reason = v_clean_reason,
        void_notes = v_clean_notes,
        updated_at = NOW()
    WHERE id = p_quote_id;

    RETURN jsonb_build_object(
        'success', true,
        'quotation_id', p_quote_id,
        'status', 'voided',
        'voided_at', NOW(),
        'voided_by', v_actor,
        'void_reason', v_clean_reason,
        'void_notes', v_clean_notes
    );
END;
$$;

REVOKE ALL ON FUNCTION public.void_quotation_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_quotation_atomic(UUID, TEXT, TEXT, TEXT) TO service_role;

-- 5. Update convert_quotation_to_sale_atomic
CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale_atomic(
    p_quote_id uuid,
    p_actor_id text,
    p_actor_name text,
    p_payment_method text DEFAULT NULL::text,
    p_amount numeric DEFAULT 0,
    p_cheque_number text DEFAULT NULL::text,
    p_cheque_date date DEFAULT NULL::date,
    p_bank_name text DEFAULT NULL::text,
    p_cheque_notes text DEFAULT NULL::text,
    p_payment_terms text DEFAULT 'due_on_receipt'::text,
    p_due_date date DEFAULT NULL::date
)
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
        SELECT id, name INTO v_cashier_id, v_cashier_name
        FROM public.employees
        WHERE (is_active IS NULL OR is_active = true)
        ORDER BY created_at ASC
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

    -- 6. Insert Sale Row (Including quotation_id)
    INSERT INTO public.sales (
        quotation_id,
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
        p_quote_id,
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
$function$;

REVOKE ALL ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, DATE) TO service_role;

-- 6. Update admin_get_unified_quotations
DROP FUNCTION IF EXISTS public.admin_get_unified_quotations(text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_get_unified_quotations(
    p_search text DEFAULT ''::text,
    p_status text DEFAULT 'All'::text,
    p_quote_type text DEFAULT 'all'::text,
    p_sort text DEFAULT 'newest'::text,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    id uuid,
    quote_number text,
    quote_type text,
    customer_name text,
    customer_company text,
    customer_email text,
    customer_phone text,
    customer_address text,
    subtotal numeric,
    tax_amount numeric,
    discount_amount numeric,
    discount_type text,
    discount_value numeric,
    total_amount numeric,
    valid_until timestamp with time zone,
    notes text,
    status text,
    display_status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    items_count integer,
    line_items_count integer,
    is_converted boolean,
    linked_sale_id uuid,
    linked_invoice_number text,
    linked_payment_status text,
    linked_invoice_revoked_at timestamp with time zone,
    voided_at timestamp with time zone,
    voided_by text,
    void_reason text,
    void_notes text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_search text;
BEGIN
    v_search := '%' || TRIM(p_search) || '%';

    RETURN QUERY
    WITH sale_payment_agg AS (
        SELECT 
            sp.sale_id,
            COUNT(sp.id) AS payment_count,
            COALESCE(SUM(sp.amount) FILTER (WHERE sp.status = 'cleared'), 0) AS gross_cleared_paid,
            COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method = 'cheque' AND sp.status = 'pending'), 0) AS pending_clearance
        FROM public.sale_payments sp
        GROUP BY sp.sale_id
    ),
    sale_reversal_agg AS (
        SELECT 
            spr.sale_id,
            COALESCE(SUM(spr.amount), 0) AS returned_amount
        FROM public.sale_payment_reversals spr
        GROUP BY spr.sale_id
    ),
    linked_sales AS (
        SELECT DISTINCT ON (q.id)
            q.id AS quotation_id,
            s.id AS sale_id,
            s.invoice_number,
            s.total,
            s.invoice_revoked_at,
            s.status AS sale_status,
            CASE
                WHEN s.invoice_revoked_at IS NOT NULL THEN 'REVOKED'
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN GREATEST(0, COALESCE(spa.gross_cleared_paid, 0) - COALESCE(sra.returned_amount, 0)) >= COALESCE(s.total, 0) THEN 'PAID'
                WHEN GREATEST(0, COALESCE(spa.gross_cleared_paid, 0) - COALESCE(sra.returned_amount, 0)) > 0 THEN 'BALANCE PENDING'
                ELSE 'UNPAID'
            END AS payment_status
        FROM public.quotations q
        JOIN public.sales s ON (
            s.quotation_id = q.id 
            OR (
                s.quotation_id IS NULL AND (
                    s.invoice_snapshot->>'quote_number' = q.quote_number
                    OR s.notes = 'Converted from Quotation #' || q.quote_number
                    OR s.notes LIKE 'Converted from Quotation #' || q.quote_number || '%'
                )
            )
        )
        LEFT JOIN sale_payment_agg spa ON spa.sale_id = s.id
        LEFT JOIN sale_reversal_agg sra ON sra.sale_id = s.id
        ORDER BY q.id, s.created_at DESC
    ),
    raw_quotations AS (
        SELECT 
            q.id,
            q.quote_number,
            CASE 
                WHEN q.customer_company IS NOT NULL AND TRIM(q.customer_company) != '' THEN 'wholesale'
                ELSE 'direct'
            END AS quote_type,
            q.customer_name,
            q.customer_company,
            q.customer_email,
            q.customer_phone,
            q.customer_address,
            COALESCE(q.subtotal, 0) AS subtotal,
            COALESCE(q.tax_amount, 0) AS tax_amount,
            COALESCE(q.discount_amount, 0) AS discount_amount,
            COALESCE(q.discount_type, 'flat') AS discount_type,
            COALESCE(q.discount_value, 0) AS discount_value,
            COALESCE(q.total_amount, 0) AS total_amount,
            q.valid_until,
            q.notes,
            COALESCE(q.status, 'draft') AS status,
            -- Authoritative Display Status Precedence:
            CASE 
                WHEN ls.invoice_number IS NOT NULL THEN 'CONVERTED'
                WHEN q.status = 'voided' THEN 'VOIDED'
                WHEN q.status = 'rejected' THEN 'REJECTED'
                WHEN q.valid_until IS NOT NULL AND q.valid_until < NOW() THEN 'EXPIRED'
                WHEN q.status = 'accepted' THEN 'ACCEPTED'
                WHEN q.status = 'sent' THEN 'ACTIVE'
                ELSE 'DRAFT'
            END AS display_status,
            q.created_at,
            q.updated_at,
            COALESCE((
                SELECT SUM(COALESCE((elem->>'qty')::int, (elem->>'quantity')::int, 1))
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END) elem
            ), 0)::int AS items_count,
            COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END), 0)::int AS line_items_count,
            (ls.invoice_number IS NOT NULL) AS is_converted,
            ls.sale_id AS linked_sale_id,
            ls.invoice_number AS linked_invoice_number,
            ls.payment_status AS linked_payment_status,
            ls.invoice_revoked_at AS linked_invoice_revoked_at,
            q.voided_at,
            q.voided_by,
            q.void_reason,
            q.void_notes
        FROM public.quotations q
        LEFT JOIN linked_sales ls ON ls.quotation_id = q.id
    ),
    filtered AS (
        SELECT 
            rq.*,
            COUNT(*) OVER() AS total_count
        FROM raw_quotations rq
        WHERE 
            -- Search Filter
            (
                p_search = ''
                OR rq.quote_number ILIKE v_search
                OR rq.customer_name ILIKE v_search
                OR COALESCE(rq.customer_company, '') ILIKE v_search
                OR COALESCE(rq.customer_phone, '') ILIKE v_search
                OR COALESCE(rq.customer_email, '') ILIKE v_search
                OR COALESCE(rq.linked_invoice_number, '') ILIKE v_search
            )
            -- Type Filter
            AND (
                p_quote_type = 'all'
                OR rq.quote_type = p_quote_type
            )
            -- Status Filter matching authoritative display_status definitions
            AND (
                p_status = 'All'
                OR (p_status = 'draft' AND rq.display_status = 'DRAFT')
                OR (p_status IN ('active', 'sent') AND rq.display_status = 'ACTIVE')
                OR (p_status = 'accepted' AND rq.display_status = 'ACCEPTED')
                OR (p_status = 'converted' AND rq.display_status = 'CONVERTED')
                OR (p_status = 'rejected' AND rq.display_status = 'REJECTED')
                OR (p_status = 'expired' AND rq.display_status = 'EXPIRED')
                OR (p_status = 'voided' AND rq.display_status = 'VOIDED')
            )
    )
    SELECT 
        f.id,
        f.quote_number,
        f.quote_type,
        f.customer_name,
        f.customer_company,
        f.customer_email,
        f.customer_phone,
        f.customer_address,
        f.subtotal,
        f.tax_amount,
        f.discount_amount,
        f.discount_type,
        f.discount_value,
        f.total_amount,
        f.valid_until,
        f.notes,
        f.status,
        f.display_status,
        f.created_at,
        f.updated_at,
        f.items_count,
        f.line_items_count,
        f.is_converted,
        f.linked_sale_id,
        f.linked_invoice_number,
        f.linked_payment_status,
        f.linked_invoice_revoked_at,
        f.voided_at,
        f.voided_by,
        f.void_reason,
        f.void_notes,
        f.total_count
    FROM filtered f
    ORDER BY 
        CASE WHEN p_sort = 'oldest' THEN f.created_at END ASC,
        CASE WHEN p_sort <> 'oldest' THEN f.created_at END DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_unified_quotations(text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_quotations(text, text, text, text, integer, integer) TO service_role;

-- 7. Update admin_get_unified_quotations_metrics
CREATE OR REPLACE FUNCTION public.admin_get_unified_quotations_metrics()
RETURNS TABLE(
    total_quotations bigint,
    wholesale_count bigint,
    direct_count bigint,
    total_quoted_value numeric,
    active_pipeline_value numeric,
    converted_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH linked_sales AS (
        SELECT DISTINCT ON (q.id)
            q.id AS quotation_id,
            s.invoice_number
        FROM public.quotations q
        JOIN public.sales s ON (
            s.quotation_id = q.id 
            OR (
                s.quotation_id IS NULL AND (
                    s.invoice_snapshot->>'quote_number' = q.quote_number
                    OR s.notes = 'Converted from Quotation #' || q.quote_number
                    OR s.notes LIKE 'Converted from Quotation #' || q.quote_number || '%'
                )
            )
        )
        ORDER BY q.id, s.created_at DESC
    ),
    annotated AS (
        SELECT 
            q.id,
            q.total_amount,
            CASE 
                WHEN q.customer_company IS NOT NULL AND TRIM(q.customer_company) != '' THEN 'wholesale'
                ELSE 'direct'
            END AS quote_type,
            (ls.invoice_number IS NOT NULL) AS is_converted,
            COALESCE(q.status, 'draft') AS status,
            (q.valid_until IS NOT NULL AND q.valid_until < NOW()) AS is_expired
        FROM public.quotations q
        LEFT JOIN linked_sales ls ON ls.quotation_id = q.id
    )
    SELECT 
        COUNT(*)::bigint AS total_quotations,
        COUNT(*) FILTER (WHERE a.quote_type = 'wholesale')::bigint AS wholesale_count,
        COUNT(*) FILTER (WHERE a.quote_type = 'direct')::bigint AS direct_count,
        COALESCE(SUM(a.total_amount), 0)::numeric AS total_quoted_value,
        COALESCE(SUM(a.total_amount) FILTER (
            WHERE NOT a.is_converted 
              AND a.status NOT IN ('rejected', 'voided') 
              AND NOT a.is_expired
        ), 0)::numeric AS active_pipeline_value,
        COALESCE(SUM(a.total_amount) FILTER (WHERE a.is_converted), 0)::numeric AS converted_value
    FROM annotated a;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_unified_quotations_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_quotations_metrics() TO service_role;
