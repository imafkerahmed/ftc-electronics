-- ==============================================================================
-- FTC Electronics: Phase 4 Payment Returns & Reversal Ledger
-- Migration: 20260924200000_payment_reversal_ledger.sql
-- ==============================================================================

-- 1. Reversal Numbering Sequence & Generator
CREATE SEQUENCE IF NOT EXISTS public.reversal_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION public.generate_reversal_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_year TEXT := to_char(CURRENT_DATE, 'YYYY');
    v_seq BIGINT;
BEGIN
    v_seq := nextval('public.reversal_number_seq');
    RETURN 'REV-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
END;
$$;

-- 2. Sale Payment Reversals Ledger Table
CREATE TABLE IF NOT EXISTS public.sale_payment_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reversal_number TEXT NOT NULL UNIQUE,
    payment_id UUID NOT NULL REFERENCES public.sale_payments(id) ON DELETE RESTRICT,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    reference TEXT NULL,
    notes TEXT NULL,
    reversed_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sale_payment_reversals_payment_id ON public.sale_payment_reversals(payment_id);
CREATE INDEX IF NOT EXISTS idx_sale_payment_reversals_sale_id ON public.sale_payment_reversals(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payment_reversals_created_at ON public.sale_payment_reversals(created_at);

-- 4. RLS & Security on sale_payment_reversals
ALTER TABLE public.sale_payment_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read sale payment reversals" ON public.sale_payment_reversals;
CREATE POLICY "Staff can read sale payment reversals"
ON public.sale_payment_reversals
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'finance', 'superadmin', 'cashier', 'staff')
    )
);

-- Deny direct mutation from non-service_role
REVOKE INSERT, UPDATE, DELETE ON public.sale_payment_reversals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sale_payment_reversals TO service_role;

-- 5. Atomic Payment Reversal Mutation RPC
CREATE OR REPLACE FUNCTION public.record_payment_reversal_atomic(
    p_payment_id UUID,
    p_amount NUMERIC,
    p_reason TEXT,
    p_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_reversed_by TEXT DEFAULT 'Staff'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_sale RECORD;
    v_already_reversed NUMERIC(12, 2) := 0;
    v_remaining_reversible NUMERIC(12, 2) := 0;
    v_reversal_id UUID;
    v_reversal_number TEXT;
    v_clean_reason TEXT;
    
    -- Recalculation variables
    v_gross_cleared NUMERIC(12, 2) := 0;
    v_total_returned NUMERIC(12, 2) := 0;
    v_effective_cleared NUMERIC(12, 2) := 0;
    v_pending_clearance NUMERIC(12, 2) := 0;
    v_balance_due NUMERIC(12, 2) := 0;
    v_available_to_record NUMERIC(12, 2) := 0;
    v_payment_status TEXT;
BEGIN
    -- 1. Lock payment row exclusively
    SELECT * INTO v_payment
    FROM public.sale_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment record not found.');
    END IF;

    -- 2. Verify payment status is CLEARED (only cleared payments can be reversed)
    IF v_payment.status <> 'cleared' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Only cleared payments are eligible for reversal. Current status is ' || UPPER(v_payment.status) || '.'
        );
    END IF;

    -- 3. Lock associated sale row exclusively
    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = v_payment.sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Associated sale record not found.');
    END IF;

    IF v_sale.status = 'voided' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot reverse payment for a voided sale.');
    END IF;

    -- 4. Calculate existing reversals for this payment
    SELECT COALESCE(SUM(amount), 0)
    INTO v_already_reversed
    FROM public.sale_payment_reversals
    WHERE payment_id = p_payment_id;

    v_remaining_reversible := v_payment.amount - v_already_reversed;

    -- 5. Validate reversal amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reversal amount must be greater than zero.');
    END IF;

    IF p_amount > (v_remaining_reversible + 0.001) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Reversal amount (LKR ' || p_amount::text || ') exceeds remaining reversible amount (LKR ' || v_remaining_reversible::text || ').'
        );
    END IF;

    -- 6. Validate reason
    v_clean_reason := TRIM(COALESCE(p_reason, ''));
    IF LENGTH(v_clean_reason) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A valid reason for reversal is required.');
    END IF;

    -- 7. Generate Reversal Number
    v_reversal_number := public.generate_reversal_number();

    -- 8. Insert into sale_payment_reversals
    INSERT INTO public.sale_payment_reversals (
        reversal_number,
        payment_id,
        sale_id,
        amount,
        reason,
        reference,
        notes,
        reversed_by,
        created_at
    ) VALUES (
        v_reversal_number,
        p_payment_id,
        v_payment.sale_id,
        p_amount,
        v_clean_reason,
        NULLIF(TRIM(p_reference), ''),
        NULLIF(TRIM(p_notes), ''),
        COALESCE(NULLIF(TRIM(p_reversed_by), ''), 'Staff'),
        NOW()
    )
    RETURNING id INTO v_reversal_id;

    -- 9. Authoritative Recalculation across the Sale
    SELECT 
        COALESCE(SUM(sp.amount) FILTER (WHERE sp.status = 'cleared'), 0),
        COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_method = 'cheque' AND sp.status = 'pending'), 0)
    INTO v_gross_cleared, v_pending_clearance
    FROM public.sale_payments sp
    WHERE sp.sale_id = v_payment.sale_id;

    SELECT COALESCE(SUM(spr.amount), 0)
    INTO v_total_returned
    FROM public.sale_payment_reversals spr
    WHERE spr.sale_id = v_payment.sale_id;

    v_effective_cleared := GREATEST(0, v_gross_cleared - v_total_returned);
    v_balance_due := GREATEST(0, v_sale.total - v_effective_cleared);
    v_available_to_record := GREATEST(0, v_sale.total - v_effective_cleared - v_pending_clearance);

    IF v_effective_cleared <= 0 THEN
        v_payment_status := 'UNPAID';
    ELSIF v_effective_cleared < v_sale.total THEN
        v_payment_status := 'BALANCE PENDING';
    ELSE
        v_payment_status := 'PAID';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'reversal_id', v_reversal_id,
        'reversal_number', v_reversal_number,
        'summary', jsonb_build_object(
            'invoice_total', v_sale.total,
            'gross_cleared_paid', v_gross_cleared,
            'returned_amount', v_total_returned,
            'effective_cleared_paid', v_effective_cleared,
            'cleared_paid', v_effective_cleared,
            'pending_clearance', v_pending_clearance,
            'balance_due', v_balance_due,
            'available_to_record', v_available_to_record,
            'payment_status', v_payment_status
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_reversal_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_reversal_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- 6. Update Atomic Payment Recording RPC (Accounts for Reversals)
CREATE OR REPLACE FUNCTION public.record_sale_payment_atomic(
    p_sale_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT,
    p_created_by TEXT,
    p_reference TEXT DEFAULT NULL,
    p_cheque_number TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_bank_name TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sale RECORD;
    v_gross_cleared NUMERIC(12, 2);
    v_returned_amount NUMERIC(12, 2);
    v_effective_cleared NUMERIC(12, 2);
    v_reserved_pending NUMERIC(12, 2);
    v_available NUMERIC(12, 2);
    v_initial_status TEXT;
    v_payment_id UUID;
    v_new_gross_cleared NUMERIC(12, 2);
    v_new_effective_cleared NUMERIC(12, 2);
    v_new_pending NUMERIC(12, 2);
    v_new_balance NUMERIC(12, 2);
    v_payment_status TEXT;
BEGIN
    -- 1. Exclusive row-level lock on sales row
    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = p_sale_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sale not found.');
    END IF;

    IF v_sale.status = 'voided' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot record payment for a voided sale.');
    END IF;

    -- 2. Authoritative calculations including reversals
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cheque' AND status = 'pending'), 0)
    INTO v_gross_cleared, v_reserved_pending
    FROM public.sale_payments
    WHERE sale_id = p_sale_id;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_returned_amount
    FROM public.sale_payment_reversals
    WHERE sale_id = p_sale_id;

    v_effective_cleared := GREATEST(0, v_gross_cleared - v_returned_amount);
    v_available := GREATEST(0, v_sale.total - v_effective_cleared - v_reserved_pending);

    -- 3. Payment amount validation
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero.');
    END IF;

    IF p_amount > (v_available + 0.001) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment amount (LKR ' || p_amount::text || ') exceeds available amount to record (LKR ' || v_available::text || ').'
        );
    END IF;

    -- 4. Validate payment method and cheque requirements
    IF p_payment_method NOT IN ('cash', 'card', 'cheque', 'bank_transfer') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method: ' || p_payment_method);
    END IF;

    IF p_payment_method = 'cheque' THEN
        IF NULLIF(TRIM(p_cheque_number), '') IS NULL OR p_cheque_date IS NULL OR NULLIF(TRIM(p_bank_name), '') IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cheque number, cheque date, and bank name are required for cheque payments.');
        END IF;
        v_initial_status := 'pending';
    ELSE
        v_initial_status := 'cleared';
    END IF;

    -- 5. Insert payment record
    INSERT INTO public.sale_payments (
        sale_id,
        amount,
        payment_method,
        status,
        payment_date,
        reference,
        cheque_number,
        cheque_date,
        bank_name,
        notes,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        p_sale_id,
        p_amount,
        p_payment_method,
        v_initial_status,
        NOW(),
        p_reference,
        CASE WHEN p_payment_method = 'cheque' THEN TRIM(p_cheque_number) ELSE NULL END,
        CASE WHEN p_payment_method = 'cheque' THEN p_cheque_date ELSE NULL END,
        CASE WHEN p_payment_method = 'cheque' THEN TRIM(p_bank_name) ELSE NULL END,
        p_notes,
        COALESCE(p_created_by, 'Admin'),
        NOW(),
        NOW()
    )
    RETURNING id INTO v_payment_id;

    -- 6. Recalculate summary
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cheque' AND status = 'pending'), 0)
    INTO v_new_gross_cleared, v_new_pending
    FROM public.sale_payments
    WHERE sale_id = p_sale_id;

    v_new_effective_cleared := GREATEST(0, v_new_gross_cleared - v_returned_amount);
    v_new_balance := GREATEST(0, v_sale.total - v_new_effective_cleared);

    IF v_new_effective_cleared <= 0 THEN
        v_payment_status := 'UNPAID';
    ELSIF v_new_effective_cleared < v_sale.total THEN
        v_payment_status := 'BALANCE PENDING';
    ELSE
        v_payment_status := 'PAID';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'summary', jsonb_build_object(
            'invoice_total', v_sale.total,
            'gross_cleared_paid', v_new_gross_cleared,
            'returned_amount', v_returned_amount,
            'effective_cleared_paid', v_new_effective_cleared,
            'cleared_paid', v_new_effective_cleared,
            'pending_clearance', v_new_pending,
            'balance_due', v_new_balance,
            'available_to_record', GREATEST(0, v_sale.total - v_new_effective_cleared - v_new_pending),
            'payment_status', v_payment_status
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_sale_payment_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale_payment_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) TO service_role;


-- 7. Update Atomic Cheque Status Transition RPC (Accounts for Reversals)
CREATE OR REPLACE FUNCTION public.update_cheque_status_atomic(
    p_payment_id UUID,
    p_new_status TEXT,
    p_actor_name TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_sale RECORD;
    v_gross_cleared NUMERIC(12, 2);
    v_returned_amount NUMERIC(12, 2);
    v_effective_cleared NUMERIC(12, 2);
    v_new_gross_cleared NUMERIC(12, 2);
    v_new_effective_cleared NUMERIC(12, 2);
    v_new_pending NUMERIC(12, 2);
    v_new_balance NUMERIC(12, 2);
    v_payment_status TEXT;
BEGIN
    -- 1. Lock payment record
    SELECT * INTO v_payment
    FROM public.sale_payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment record not found.');
    END IF;

    IF v_payment.payment_method <> 'cheque' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only cheque payments have clearance workflows.');
    END IF;

    IF v_payment.status <> 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cheque status cannot be modified once ' || v_payment.status || '.');
    END IF;

    IF p_new_status NOT IN ('cleared', 'bounced', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid target status: ' || p_new_status);
    END IF;

    -- 2. Lock parent sale
    SELECT * INTO v_sale
    FROM public.sales
    WHERE id = v_payment.sale_id
    FOR UPDATE;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_returned_amount
    FROM public.sale_payment_reversals
    WHERE sale_id = v_payment.sale_id;

    -- 3. If transitioning to cleared, verify overpayment protection against effective cleared
    IF p_new_status = 'cleared' THEN
        SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0)
        INTO v_gross_cleared
        FROM public.sale_payments
        WHERE sale_id = v_payment.sale_id;

        v_effective_cleared := GREATEST(0, v_gross_cleared - v_returned_amount);

        IF (v_effective_cleared + v_payment.amount) > (v_sale.total + 0.01) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Clearing this cheque would cause an overpayment. Current effective cleared: LKR ' || v_effective_cleared::text || ', Cheque: LKR ' || v_payment.amount::text || ', Invoice total: LKR ' || v_sale.total::text
            );
        END IF;
    END IF;

    -- 4. Update status and audit trail
    UPDATE public.sale_payments
    SET
        status = p_new_status,
        cleared_by = CASE WHEN p_new_status = 'cleared' THEN COALESCE(p_actor_name, 'Admin') ELSE cleared_by END,
        cleared_at = CASE WHEN p_new_status = 'cleared' THEN NOW() ELSE cleared_at END,
        notes = CASE 
            WHEN p_notes IS NOT NULL AND LENGTH(TRIM(p_notes)) > 0 
            THEN COALESCE(notes, '') || E'\n[' || UPPER(p_new_status) || ' on ' || to_char(NOW(), 'YYYY-MM-DD HH24:MI') || ' by ' || COALESCE(p_actor_name, 'Admin') || ']: ' || p_notes
            ELSE notes
        END,
        updated_at = NOW()
    WHERE id = p_payment_id;

    -- 5. Recalculate summary
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cheque' AND status = 'pending'), 0)
    INTO v_new_gross_cleared, v_new_pending
    FROM public.sale_payments
    WHERE sale_id = v_payment.sale_id;

    v_new_effective_cleared := GREATEST(0, v_new_gross_cleared - v_returned_amount);
    v_new_balance := GREATEST(0, v_sale.total - v_new_effective_cleared);

    IF v_new_effective_cleared <= 0 THEN
        v_payment_status := 'UNPAID';
    ELSIF v_new_effective_cleared < v_sale.total THEN
        v_payment_status := 'BALANCE PENDING';
    ELSE
        v_payment_status := 'PAID';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'summary', jsonb_build_object(
            'invoice_total', v_sale.total,
            'gross_cleared_paid', v_new_gross_cleared,
            'returned_amount', v_returned_amount,
            'effective_cleared_paid', v_new_effective_cleared,
            'cleared_paid', v_new_effective_cleared,
            'pending_clearance', v_new_pending,
            'balance_due', v_new_balance,
            'available_to_record', GREATEST(0, v_sale.total - v_new_effective_cleared - v_new_pending),
            'payment_status', v_payment_status
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_cheque_status_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_cheque_status_atomic(UUID, TEXT, TEXT, TEXT) TO service_role;


-- 8. Update Unified Sales Pagination RPC (Effective Cleared Paid Calculation)
DROP FUNCTION IF EXISTS public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int);

CREATE OR REPLACE FUNCTION public.admin_get_unified_sales(
    p_search text DEFAULT '',
    p_source text DEFAULT 'All',
    p_payment_status text DEFAULT 'All',
    p_status text DEFAULT 'All',
    p_payment_method text DEFAULT 'All',
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_min_amount numeric DEFAULT NULL,
    p_max_amount numeric DEFAULT NULL,
    p_sort text DEFAULT 'newest',
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    receipt_number text,
    invoice_number text,
    date timestamptz,
    customer_name text,
    customer_email text,
    items_count int,
    total numeric,
    discount numeric,
    payment_method text,
    status text,
    source text,
    is_paid boolean,
    is_revenue_eligible boolean,
    gross_cleared_paid numeric,
    returned_amount numeric,
    cleared_paid numeric,
    pending_clearance numeric,
    balance_due numeric,
    available_to_record numeric,
    payment_status text,
    payment_terms text,
    due_date date,
    collection_status text,
    days_overdue int,
    total_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search text;
BEGIN
    v_search := '%' || p_search || '%';

    RETURN QUERY
    WITH combined AS (
        -- POS / Wholesale Sales with Aggregated Payments & Reversals
        SELECT 
            s.id,
            COALESCE(NULLIF(TRIM(s.receipt_number), ''), 'FTC-POS-' || UPPER(SUBSTRING(s.id::text FROM 1 FOR 6))) AS receipt_number,
            s.invoice_number,
            COALESCE(s.date, s.created_at) AS date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.items_count, 1) AS items_count,
            COALESCE(s.total, 0) AS total,
            COALESCE(s.discount, 0) AS discount,
            COALESCE(NULLIF(TRIM(s.payment_method), ''), 'unpaid') AS payment_method,
            COALESCE(s.status, 'completed') AS status,
            'POS Terminal' AS source,
            -- Payment calculations
            COALESCE(sp.gross_cleared_paid, 0) AS gross_cleared_paid,
            COALESCE(spr.returned_amount, 0) AS returned_amount,
            GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) AS cleared_paid,
            COALESCE(sp.pending_clearance, 0) AS pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0))) AS balance_due,
            GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) - COALESCE(sp.pending_clearance, 0)) AS available_to_record,
            CASE 
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) <= 0 THEN 'UNPAID'
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS payment_status,
            (GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) >= COALESCE(s.total, 0) AND COALESCE(s.status, 'completed') != 'voided') AS is_paid,
            (GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) > 0 AND COALESCE(s.status, 'completed') != 'voided') AS is_revenue_eligible,
            s.payment_terms,
            COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) AS due_date,
            -- Collection Status
            CASE 
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) >= COALESCE(s.total, 0) THEN 'SETTLED'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE + 3 THEN 'NOT DUE'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE AND COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) <= CURRENT_DATE + 3 THEN 'DUE SOON'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) = CURRENT_DATE THEN 'DUE TODAY'
                ELSE 'OVERDUE'
            END AS collection_status,
            CASE 
                WHEN s.status != 'voided' AND GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) < COALESCE(s.total, 0) AND COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) < CURRENT_DATE THEN
                    (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date))::int
                ELSE 0
            END AS days_overdue
        FROM public.sales s
        LEFT JOIN LATERAL (
            SELECT 
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS gross_cleared_paid,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.payment_method = 'cheque' AND sp_inner.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(spr_inner.amount), 0) AS returned_amount
            FROM public.sale_payment_reversals spr_inner
            WHERE spr_inner.sale_id = s.id
        ) spr ON true

        UNION ALL

        -- Online Orders
        SELECT 
            o.id,
            COALESCE(NULLIF(TRIM(o.order_id), ''), 'FTC-ONL-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 6))) AS receipt_number,
            o.invoice_number,
            o.created_at AS date,
            COALESCE(
                NULLIF(TRIM(o.customer->>'name'), ''),
                NULLIF(TRIM((o.shipping_address->>'firstName') || ' ' || COALESCE(o.shipping_address->>'lastName', '')), ''),
                'Online Customer'
            ) AS customer_name,
            COALESCE(NULLIF(TRIM(o.customer->>'email'), ''), '—') AS customer_email,
            COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END), 1) AS items_count,
            COALESCE(o.total, 0) AS total,
            0 AS discount,
            COALESCE(NULLIF(TRIM(o.payment_details->>'method'), ''), 'online') AS payment_method,
            COALESCE(o.status, 'pending') AS status,
            'Online Store' AS source,
            CASE WHEN COALESCE(o.is_paid, false) THEN COALESCE(o.total, 0) ELSE 0 END AS gross_cleared_paid,
            0 AS returned_amount,
            CASE WHEN COALESCE(o.is_paid, false) THEN COALESCE(o.total, 0) ELSE 0 END AS cleared_paid,
            0 AS pending_clearance,
            CASE WHEN COALESCE(o.is_paid, false) THEN 0 ELSE COALESCE(o.total, 0) END AS balance_due,
            CASE WHEN COALESCE(o.is_paid, false) THEN 0 ELSE COALESCE(o.total, 0) END AS available_to_record,
            CASE 
                WHEN o.status IN ('cancelled', 'voided') THEN 'VOIDED'
                WHEN COALESCE(o.is_paid, false) THEN 'PAID'
                ELSE 'UNPAID'
            END AS payment_status,
            COALESCE(o.is_paid, false) AS is_paid,
            (COALESCE(o.is_paid, false) = true AND COALESCE(o.status, 'pending') NOT IN ('cancelled', 'voided', 'returned', 'refunded')) AS is_revenue_eligible,
            'due_on_receipt' AS payment_terms,
            (o.created_at AT TIME ZONE 'UTC')::date AS due_date,
            CASE 
                WHEN o.status IN ('cancelled', 'voided') THEN 'VOIDED'
                WHEN COALESCE(o.is_paid, false) THEN 'SETTLED'
                WHEN (o.created_at AT TIME ZONE 'UTC')::date = CURRENT_DATE THEN 'DUE TODAY'
                ELSE 'OVERDUE'
            END AS collection_status,
            CASE 
                WHEN COALESCE(o.is_paid, false) = false AND (o.created_at AT TIME ZONE 'UTC')::date < CURRENT_DATE THEN
                    (CURRENT_DATE - (o.created_at AT TIME ZONE 'UTC')::date)::int
                ELSE 0
            END AS days_overdue
        FROM public.orders o
    ),
    filtered AS (
        SELECT c.*
        FROM combined c
        WHERE 
            (p_source = 'All' OR c.source = p_source)
            AND (
                p_payment_status = 'All' 
                OR (p_payment_status = 'Paid' AND c.payment_status = 'PAID')
                OR (p_payment_status = 'Unpaid' AND c.payment_status = 'UNPAID')
                OR (p_payment_status = 'Balance Pending' AND c.payment_status = 'BALANCE PENDING')
                OR (p_payment_status = 'Voided' AND c.payment_status = 'VOIDED')
            )
            AND (p_status = 'All' OR c.status ILIKE p_status)
            AND (p_payment_method = 'All' OR c.payment_method ILIKE p_payment_method)
            AND (p_date_from IS NULL OR c.date >= p_date_from)
            AND (p_date_to IS NULL OR c.date < p_date_to)
            AND (p_min_amount IS NULL OR c.total >= p_min_amount)
            AND (p_max_amount IS NULL OR c.total <= p_max_amount)
            AND (
                p_search = '' 
                OR c.receipt_number ILIKE v_search
                OR (c.invoice_number IS NOT NULL AND c.invoice_number ILIKE v_search)
                OR c.customer_name ILIKE v_search
                OR c.customer_email ILIKE v_search
                OR c.payment_method ILIKE v_search
            )
    )
    SELECT 
        f.id,
        f.receipt_number,
        f.invoice_number,
        f.date,
        f.customer_name,
        f.customer_email,
        f.items_count,
        f.total,
        f.discount,
        f.payment_method,
        f.status,
        f.source,
        f.is_paid,
        f.is_revenue_eligible,
        f.gross_cleared_paid,
        f.returned_amount,
        f.cleared_paid,
        f.pending_clearance,
        f.balance_due,
        f.available_to_record,
        f.payment_status,
        f.payment_terms,
        f.due_date,
        f.collection_status,
        f.days_overdue,
        (SELECT COUNT(*) FROM filtered) AS total_count
    FROM filtered f
    ORDER BY 
        CASE WHEN p_sort = 'newest' THEN f.date END DESC,
        CASE WHEN p_sort = 'oldest' THEN f.date END ASC,
        CASE WHEN p_sort = 'highest' THEN f.total END DESC,
        CASE WHEN p_sort = 'lowest' THEN f.total END ASC,
        f.date DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) TO service_role;


-- 9. Update Outstanding Receivables Query RPC (Effective Cleared Paid Calculation)
DROP FUNCTION IF EXISTS public.admin_get_outstanding_receivables(text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.admin_get_outstanding_receivables(
    p_search text DEFAULT '',
    p_filter text DEFAULT 'all',
    p_sort text DEFAULT 'due_asc',
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    invoice_number text,
    receipt_number text,
    invoice_date timestamptz,
    due_date date,
    customer_name text,
    customer_phone text,
    customer_email text,
    items_count int,
    invoice_total numeric,
    gross_cleared_paid numeric,
    returned_amount numeric,
    cleared_paid numeric,
    pending_clearance numeric,
    balance_due numeric,
    available_to_record numeric,
    payment_status text,
    collection_status text,
    days_overdue int,
    aging_bucket text,
    payment_terms text,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search text;
BEGIN
    v_search := '%' || p_search || '%';

    RETURN QUERY
    WITH base_receivables AS (
        SELECT 
            s.id,
            COALESCE(s.invoice_number, s.receipt_number) AS invoice_number,
            s.receipt_number,
            COALESCE(s.invoiced_at, s.date, s.created_at) AS invoice_date,
            COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) AS due_date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(s.customer_phone, '—') AS customer_phone,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.items_count, 1) AS items_count,
            COALESCE(s.total, 0) AS invoice_total,
            COALESCE(sp.gross_cleared_paid, 0) AS gross_cleared_paid,
            COALESCE(spr.returned_amount, 0) AS returned_amount,
            GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) AS cleared_paid,
            COALESCE(sp.pending_clearance, 0) AS pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0))) AS balance_due,
            GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) - COALESCE(sp.pending_clearance, 0)) AS available_to_record,
            CASE 
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) <= 0 THEN 'UNPAID'
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS payment_status,
            CASE 
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) >= COALESCE(s.total, 0) THEN 'SETTLED'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE + 3 THEN 'NOT DUE'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE AND COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) <= CURRENT_DATE + 3 THEN 'DUE SOON'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) = CURRENT_DATE THEN 'DUE TODAY'
                ELSE 'OVERDUE'
            END AS collection_status,
            CASE 
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) < CURRENT_DATE THEN
                    (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date))::int
                ELSE 0
            END AS days_overdue,
            CASE 
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) >= CURRENT_DATE THEN 'Current / Not Due'
                WHEN (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date)) BETWEEN 1 AND 7 THEN '1–7 Days Overdue'
                WHEN (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date)) BETWEEN 8 AND 30 THEN '8–30 Days Overdue'
                WHEN (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date)) BETWEEN 31 AND 60 THEN '31–60 Days Overdue'
                WHEN (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date)) BETWEEN 61 AND 90 THEN '61–90 Days Overdue'
                ELSE '90+ Days Overdue'
            END AS aging_bucket,
            COALESCE(s.payment_terms, 'due_on_receipt') AS payment_terms
        FROM public.sales s
        LEFT JOIN LATERAL (
            SELECT 
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS gross_cleared_paid,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.payment_method = 'cheque' AND sp_inner.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(spr_inner.amount), 0) AS returned_amount
            FROM public.sale_payment_reversals spr_inner
            WHERE spr_inner.sale_id = s.id
        ) spr ON true
        WHERE COALESCE(s.status, 'completed') NOT IN ('voided', 'cancelled')
          AND GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0))) > 0
    ),
    filtered AS (
        SELECT r.*
        FROM base_receivables r
        WHERE (
            p_search = ''
            OR r.invoice_number ILIKE v_search
            OR r.receipt_number ILIKE v_search
            OR r.customer_name ILIKE v_search
            OR r.customer_phone ILIKE v_search
            OR r.customer_email ILIKE v_search
        )
        AND (
            p_filter = 'all'
            OR (p_filter = 'unpaid' AND r.payment_status = 'UNPAID')
            OR (p_filter = 'balance_pending' AND r.payment_status = 'BALANCE PENDING')
            OR (p_filter = 'not_due' AND r.collection_status = 'NOT DUE')
            OR (p_filter = 'due_soon' AND r.collection_status = 'DUE SOON')
            OR (p_filter = 'due_today' AND r.collection_status = 'DUE TODAY')
            OR (p_filter = 'overdue' AND r.collection_status = 'OVERDUE')
            OR (p_filter = '1-7' AND r.days_overdue BETWEEN 1 AND 7)
            OR (p_filter = '8-30' AND r.days_overdue BETWEEN 8 AND 30)
            OR (p_filter = '31-60' AND r.days_overdue BETWEEN 31 AND 60)
            OR (p_filter = '61-90' AND r.days_overdue BETWEEN 61 AND 90)
            OR (p_filter = '90+' AND r.days_overdue > 90)
        )
    )
    SELECT 
        f.id,
        f.invoice_number,
        f.receipt_number,
        f.invoice_date,
        f.due_date,
        f.customer_name,
        f.customer_phone,
        f.customer_email,
        f.items_count,
        f.invoice_total,
        f.gross_cleared_paid,
        f.returned_amount,
        f.cleared_paid,
        f.pending_clearance,
        f.balance_due,
        f.available_to_record,
        f.payment_status,
        f.collection_status,
        f.days_overdue,
        f.aging_bucket,
        f.payment_terms,
        (SELECT COUNT(*) FROM filtered) AS total_count
    FROM filtered f
    ORDER BY 
        CASE WHEN p_sort = 'due_asc' THEN f.due_date END ASC,
        CASE WHEN p_sort = 'due_desc' THEN f.due_date END DESC,
        CASE WHEN p_sort = 'amount_desc' THEN f.balance_due END DESC,
        CASE WHEN p_sort = 'amount_asc' THEN f.balance_due END ASC,
        CASE WHEN p_sort = 'overdue_desc' THEN f.days_overdue END DESC,
        f.due_date ASC,
        f.id DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_outstanding_receivables(text, text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_outstanding_receivables(text, text, text, int, int) TO service_role;


-- 10. Update Outstanding Receivables Metrics RPC (Effective Cleared Paid Calculation)
DROP FUNCTION IF EXISTS public.admin_get_outstanding_receivables_metrics(text);

CREATE OR REPLACE FUNCTION public.admin_get_outstanding_receivables_metrics(
    p_search text DEFAULT ''
)
RETURNS TABLE (
    total_outstanding numeric,
    total_invoices int,
    unpaid_amount numeric,
    unpaid_count int,
    balance_pending_amount numeric,
    balance_pending_count int,
    pending_cheques numeric,
    pending_cheques_count int,
    due_today_amount numeric,
    due_today_count int,
    due_next_7_days_amount numeric,
    due_next_7_days_count int,
    overdue_amount numeric,
    overdue_count int,
    overdue_30_plus_amount numeric,
    overdue_30_plus_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search text;
BEGIN
    v_search := '%' || p_search || '%';

    RETURN QUERY
    WITH base_receivables AS (
        SELECT 
            s.id,
            COALESCE(s.invoice_number, s.receipt_number) AS invoice_number,
            s.receipt_number,
            COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) AS due_date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(s.customer_phone, '—') AS customer_phone,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.total, 0) AS invoice_total,
            GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) AS cleared_paid,
            COALESCE(sp.pending_clearance, 0) AS pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0))) AS balance_due,
            CASE 
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) <= 0 THEN 'UNPAID'
                ELSE 'BALANCE PENDING'
            END AS payment_status,
            CASE 
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) < CURRENT_DATE THEN
                    (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date))::int
                ELSE 0
            END AS days_overdue
        FROM public.sales s
        LEFT JOIN LATERAL (
            SELECT 
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS gross_cleared_paid,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.payment_method = 'cheque' AND sp_inner.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(spr_inner.amount), 0) AS returned_amount
            FROM public.sale_payment_reversals spr_inner
            WHERE spr_inner.sale_id = s.id
        ) spr ON true
        WHERE COALESCE(s.status, 'completed') NOT IN ('voided', 'cancelled')
          AND GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0))) > 0
    ),
    filtered AS (
        SELECT r.*
        FROM base_receivables r
        WHERE (
            p_search = ''
            OR r.invoice_number ILIKE v_search
            OR r.receipt_number ILIKE v_search
            OR r.customer_name ILIKE v_search
            OR r.customer_phone ILIKE v_search
            OR r.customer_email ILIKE v_search
        )
    )
    SELECT 
        COALESCE(SUM(f.balance_due), 0) AS total_outstanding,
        COUNT(f.id)::int AS total_invoices,
        COALESCE(SUM(f.balance_due) FILTER (WHERE f.payment_status = 'UNPAID'), 0) AS unpaid_amount,
        COUNT(f.id) FILTER (WHERE f.payment_status = 'UNPAID')::int AS unpaid_count,
        COALESCE(SUM(f.balance_due) FILTER (WHERE f.payment_status = 'BALANCE PENDING'), 0) AS balance_pending_amount,
        COUNT(f.id) FILTER (WHERE f.payment_status = 'BALANCE PENDING')::int AS balance_pending_count,
        COALESCE(SUM(f.pending_clearance), 0) AS pending_cheques,
        COUNT(f.id) FILTER (WHERE f.pending_clearance > 0)::int AS pending_cheques_count,
        COALESCE(SUM(f.balance_due) FILTER (WHERE f.due_date = CURRENT_DATE), 0) AS due_today_amount,
        COUNT(f.id) FILTER (WHERE f.due_date = CURRENT_DATE)::int AS due_today_count,
        COALESCE(SUM(f.balance_due) FILTER (WHERE f.due_date > CURRENT_DATE AND f.due_date <= CURRENT_DATE + 7), 0) AS due_next_7_days_amount,
        COUNT(f.id) FILTER (WHERE f.due_date > CURRENT_DATE AND f.due_date <= CURRENT_DATE + 7)::int AS due_next_7_days_count,
        COALESCE(SUM(f.balance_due) FILTER (WHERE f.due_date < CURRENT_DATE), 0) AS overdue_amount,
        COUNT(f.id) FILTER (WHERE f.due_date < CURRENT_DATE)::int AS overdue_count,
        COALESCE(SUM(f.balance_due) FILTER (WHERE f.days_overdue > 30), 0) AS overdue_30_plus_amount,
        COUNT(f.id) FILTER (WHERE f.days_overdue > 30)::int AS overdue_30_plus_count
    FROM filtered f;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_outstanding_receivables_metrics(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_outstanding_receivables_metrics(text) TO service_role;


-- 11. Update Cheque Register Query RPC (Effective Cleared Paid Calculation)
DROP FUNCTION IF EXISTS public.admin_get_cheque_register(TEXT, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.admin_get_cheque_register(
    p_search TEXT DEFAULT '',
    p_filter TEXT DEFAULT 'all',
    p_sort TEXT DEFAULT 'priority',
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    sale_id UUID,
    invoice_number TEXT,
    receipt_number TEXT,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    dealer_company TEXT,
    dealer_contact TEXT,
    cheque_number TEXT,
    bank_name TEXT,
    amount NUMERIC,
    payment_date TIMESTAMPTZ,
    cheque_date DATE,
    status TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ,
    cleared_by TEXT,
    cleared_at TIMESTAMPTZ,
    invoice_total NUMERIC,
    invoice_cleared_paid NUMERIC,
    invoice_pending_clearance NUMERIC,
    invoice_balance_due NUMERIC,
    invoice_payment_status TEXT,
    operational_state TEXT,
    days_diff INT,
    days_overdue INT,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search TEXT := '%' || TRIM(COALESCE(p_search, '')) || '%';
BEGIN
    RETURN QUERY
    WITH base_cheques AS (
        SELECT 
            sp.id,
            sp.sale_id,
            s.invoice_number,
            s.receipt_number,
            s.customer_name,
            s.customer_email,
            s.customer_phone,
            wd.company_name AS dealer_company,
            wd.contact_name AS dealer_contact,
            sp.cheque_number,
            sp.bank_name,
            sp.amount,
            sp.payment_date,
            sp.cheque_date,
            sp.status,
            sp.notes,
            sp.created_by,
            sp.created_at,
            sp.cleared_by,
            sp.cleared_at,
            COALESCE(s.total, 0) AS invoice_total,
            GREATEST(0, COALESCE(sale_summary.gross_cleared_paid, 0) - COALESCE(sale_reversals.returned_amount, 0)) AS invoice_cleared_paid,
            COALESCE(sale_summary.pending_clearance, 0) AS invoice_pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sale_summary.gross_cleared_paid, 0) - COALESCE(sale_reversals.returned_amount, 0))) AS invoice_balance_due,
            CASE 
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN GREATEST(0, COALESCE(sale_summary.gross_cleared_paid, 0) - COALESCE(sale_reversals.returned_amount, 0)) <= 0 THEN 'UNPAID'
                WHEN GREATEST(0, COALESCE(sale_summary.gross_cleared_paid, 0) - COALESCE(sale_reversals.returned_amount, 0)) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS invoice_payment_status,
            -- Derived Operational State
            CASE 
                WHEN sp.status = 'cleared' THEN 'CLEARED'
                WHEN sp.status = 'bounced' THEN 'BOUNCED'
                WHEN sp.status = 'cancelled' THEN 'CANCELLED'
                WHEN sp.status = 'pending' AND sp.cheque_date > CURRENT_DATE THEN 'UPCOMING'
                WHEN sp.status = 'pending' AND sp.cheque_date = CURRENT_DATE THEN 'DUE TODAY'
                WHEN sp.status = 'pending' AND sp.cheque_date < CURRENT_DATE THEN 'OVERDUE FOR REVIEW'
                ELSE 'PENDING'
            END AS operational_state,
            -- Days Difference (positive = future, negative = past)
            CASE 
                WHEN sp.status = 'pending' AND sp.cheque_date IS NOT NULL THEN (sp.cheque_date - CURRENT_DATE)::int
                ELSE 0
            END AS days_diff,
            -- Days Overdue (positive = overdue, 0 = not overdue)
            CASE 
                WHEN sp.status = 'pending' AND sp.cheque_date < CURRENT_DATE THEN (CURRENT_DATE - sp.cheque_date)::int
                ELSE 0
            END AS days_overdue
        FROM public.sale_payments sp
        JOIN public.sales s ON s.id = sp.sale_id
        LEFT JOIN LATERAL (
            SELECT 
                COALESCE(SUM(sp_sum.amount) FILTER (WHERE sp_sum.status = 'cleared'), 0) AS gross_cleared_paid,
                COALESCE(SUM(sp_sum.amount) FILTER (WHERE sp_sum.payment_method = 'cheque' AND sp_sum.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_sum
            WHERE sp_sum.sale_id = s.id
        ) sale_summary ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(spr_sum.amount), 0) AS returned_amount
            FROM public.sale_payment_reversals spr_sum
            WHERE spr_sum.sale_id = s.id
        ) sale_reversals ON true
        LEFT JOIN public.wholesale_dealers wd ON wd.id = s.customer_id
        WHERE sp.payment_method = 'cheque'
    ),
    filtered AS (
        SELECT bc.*
        FROM base_cheques bc
        WHERE 
            -- Filter logic
            (
                p_filter = 'all'
                OR (p_filter = 'pending' AND bc.status = 'pending')
                OR (p_filter = 'upcoming' AND bc.status = 'pending' AND bc.cheque_date > CURRENT_DATE)
                OR (p_filter = 'due_today' AND bc.status = 'pending' AND bc.cheque_date = CURRENT_DATE)
                OR (p_filter = 'overdue' AND bc.status = 'pending' AND bc.cheque_date < CURRENT_DATE)
                OR (p_filter = 'cleared' AND bc.status = 'cleared')
                OR (p_filter = 'bounced' AND bc.status = 'bounced')
                OR (p_filter = 'cancelled' AND bc.status = 'cancelled')
            )
            -- Search logic
            AND (
                p_search = ''
                OR bc.cheque_number ILIKE v_search
                OR (bc.invoice_number IS NOT NULL AND bc.invoice_number ILIKE v_search)
                OR bc.receipt_number ILIKE v_search
                OR bc.customer_name ILIKE v_search
                OR (bc.dealer_company IS NOT NULL AND bc.dealer_company ILIKE v_search)
                OR (bc.dealer_contact IS NOT NULL AND bc.dealer_contact ILIKE v_search)
                OR bc.bank_name ILIKE v_search
            )
    )
    SELECT 
        f.id,
        f.sale_id,
        f.invoice_number,
        f.receipt_number,
        f.customer_name,
        f.customer_email,
        f.customer_phone,
        f.dealer_company,
        f.dealer_contact,
        f.cheque_number,
        f.bank_name,
        f.amount,
        f.payment_date,
        f.cheque_date,
        f.status,
        f.notes,
        f.created_by,
        f.created_at,
        f.cleared_by,
        f.cleared_at,
        f.invoice_total,
        f.invoice_cleared_paid,
        f.invoice_pending_clearance,
        f.invoice_balance_due,
        f.invoice_payment_status,
        f.operational_state,
        f.days_diff,
        f.days_overdue,
        (SELECT COUNT(*) FROM filtered) AS total_count
    FROM filtered f
    ORDER BY 
        CASE WHEN p_sort = 'priority' THEN 
            CASE 
                WHEN f.operational_state = 'OVERDUE FOR REVIEW' THEN 1
                WHEN f.operational_state = 'DUE TODAY' THEN 2
                WHEN f.operational_state = 'UPCOMING' THEN 3
                WHEN f.status = 'pending' THEN 4
                WHEN f.status = 'cleared' THEN 5
                WHEN f.status = 'bounced' THEN 6
                WHEN f.status = 'cancelled' THEN 7
                ELSE 8
            END
        END ASC,
        CASE WHEN p_sort = 'priority' AND f.status = 'pending' THEN f.cheque_date END ASC,
        CASE WHEN p_sort = 'priority' AND f.status != 'pending' THEN f.created_at END DESC,
        CASE WHEN p_sort = 'cheque_date_asc' THEN f.cheque_date END ASC,
        CASE WHEN p_sort = 'cheque_date_desc' THEN f.cheque_date END DESC,
        CASE WHEN p_sort = 'amount_desc' THEN f.amount END DESC,
        CASE WHEN p_sort = 'amount_asc' THEN f.amount END ASC,
        CASE WHEN p_sort = 'payment_date_desc' THEN f.payment_date END DESC,
        f.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_cheque_register(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_cheque_register(TEXT, TEXT, TEXT, INT, INT) TO service_role;
