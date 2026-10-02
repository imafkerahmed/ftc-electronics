-- ==============================================================================
-- FTC Electronics: Wholesale Multi-Payment System & Cheque Clearance Tracking
-- Migration: 20260922180000_wholesale_multi_payment_tracking.sql
-- ==============================================================================

-- 0. Update sales table payment_method check constraint to support wholesale cheque & bank_transfer
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check 
    CHECK (payment_method IN ('cash', 'card', 'qr', 'split', 'cheque', 'bank_transfer'));

-- 1. Create sale_payments table
CREATE TABLE IF NOT EXISTS public.sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'cheque', 'bank_transfer', 'split', 'qr')),
    status TEXT NOT NULL DEFAULT 'cleared' CHECK (status IN ('cleared', 'pending', 'bounced', 'cancelled')),
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reference TEXT,
    -- Cheque-specific structured fields
    cheque_number TEXT,
    cheque_date DATE,
    bank_name TEXT,
    notes TEXT,
    -- Audit fields
    created_by TEXT NOT NULL DEFAULT 'System',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_by TEXT,
    cleared_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_cheque_details CHECK (
        payment_method <> 'cheque' OR (
            NULLIF(TRIM(cheque_number), '') IS NOT NULL AND
            cheque_date IS NOT NULL AND
            NULLIF(TRIM(bank_name), '') IS NOT NULL
        )
    )
);

-- 2. Create optimized indexes
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_status ON public.sale_payments(sale_id, status);
CREATE INDEX IF NOT EXISTS idx_sale_payments_quotation_id ON public.sale_payments(quotation_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_created_at ON public.sale_payments(created_at DESC);

-- 3. Enable RLS and Staff-Scoped Security
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

-- Drop prior policies if exist
DROP POLICY IF EXISTS "Staff can read sale payments" ON public.sale_payments;
DROP POLICY IF EXISTS "Staff can insert sale payments" ON public.sale_payments;
DROP POLICY IF EXISTS "Staff can update sale payments" ON public.sale_payments;
DROP POLICY IF EXISTS "Staff can view sale payments" ON public.sale_payments;

-- Revoke direct mutation permissions from anon and authenticated
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sale_payments FROM anon, authenticated;

-- Staff-scoped SELECT policy (storefront/customer authenticated users cannot view payment records)
CREATE POLICY "Staff can view sale payments"
    ON public.sale_payments
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'superadmin', 'manager', 'cashier', 'staff')
        )
    );

GRANT SELECT ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;

-- 4. Historical Backfill for existing completed sales
-- For genuinely completed historical sales, amount is authoritative sale total (NOT inflated cash_tendered)
INSERT INTO public.sale_payments (
    sale_id,
    amount,
    payment_method,
    status,
    payment_date,
    created_by,
    created_at,
    notes
)
SELECT
    s.id,
    COALESCE(s.total, 0),
    CASE 
        WHEN s.payment_method IN ('cash', 'card', 'cheque', 'bank_transfer', 'qr', 'split') THEN s.payment_method
        ELSE 'cash'
    END,
    CASE 
        WHEN s.status = 'voided' THEN 'cancelled'
        ELSE 'cleared'
    END,
    COALESCE(s.date, s.created_at, NOW()),
    COALESCE(s.cashier_name, 'System Backfill'),
    COALESCE(s.created_at, NOW()),
    'Legacy sales payment backfill'
FROM public.sales s
WHERE NOT EXISTS (
    SELECT 1 FROM public.sale_payments sp WHERE sp.sale_id = s.id
)
AND COALESCE(s.total, 0) > 0;

-- 5. Atomic Payment Recording RPC
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
    v_cleared_paid NUMERIC(12, 2);
    v_reserved_pending NUMERIC(12, 2);
    v_available NUMERIC(12, 2);
    v_initial_status TEXT;
    v_payment_id UUID;
    v_new_cleared NUMERIC(12, 2);
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

    -- 2. Authoritative calculations
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'cheque' AND status = 'pending'), 0)
    INTO v_cleared_paid, v_reserved_pending
    FROM public.sale_payments
    WHERE sale_id = p_sale_id;

    v_available := GREATEST(0, v_sale.total - v_cleared_paid - v_reserved_pending);

    -- 3. Payment amount validation
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero.');
    END IF;

    IF p_amount > v_available THEN
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
    INTO v_new_cleared, v_new_pending
    FROM public.sale_payments
    WHERE sale_id = p_sale_id;

    v_new_balance := GREATEST(0, v_sale.total - v_new_cleared);

    IF v_new_cleared <= 0 THEN
        v_payment_status := 'UNPAID';
    ELSIF v_new_cleared < v_sale.total THEN
        v_payment_status := 'BALANCE PENDING';
    ELSE
        v_payment_status := 'PAID';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'summary', jsonb_build_object(
            'invoice_total', v_sale.total,
            'cleared_paid', v_new_cleared,
            'pending_clearance', v_new_pending,
            'balance_due', v_new_balance,
            'available_to_record', GREATEST(0, v_sale.total - v_new_cleared - v_new_pending),
            'payment_status', v_payment_status
        )
    );
END;
$$;

-- 6. Atomic Cheque Status Transition RPC
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
    v_cleared_paid NUMERIC(12, 2);
    v_new_cleared NUMERIC(12, 2);
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

    -- 3. If transitioning to cleared, verify overpayment protection
    IF p_new_status = 'cleared' THEN
        SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'cleared'), 0)
        INTO v_cleared_paid
        FROM public.sale_payments
        WHERE sale_id = v_payment.sale_id;

        IF (v_cleared_paid + v_payment.amount) > (v_sale.total + 0.01) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Clearing this cheque would cause an overpayment. Current cleared: LKR ' || v_cleared_paid::text || ', Cheque: LKR ' || v_payment.amount::text || ', Invoice total: LKR ' || v_sale.total::text
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
    INTO v_new_cleared, v_new_pending
    FROM public.sale_payments
    WHERE sale_id = v_payment.sale_id;

    v_new_balance := GREATEST(0, v_sale.total - v_new_cleared);

    IF v_new_cleared <= 0 THEN
        v_payment_status := 'UNPAID';
    ELSIF v_new_cleared < v_sale.total THEN
        v_payment_status := 'BALANCE PENDING';
    ELSE
        v_payment_status := 'PAID';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'summary', jsonb_build_object(
            'invoice_total', v_sale.total,
            'cleared_paid', v_new_cleared,
            'pending_clearance', v_new_pending,
            'balance_due', v_new_balance,
            'available_to_record', GREATEST(0, v_sale.total - v_new_cleared - v_new_pending),
            'payment_status', v_payment_status
        )
    );
END;
$$;

-- 7. Atomic Quotation to Sale Conversion RPC
CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale_atomic(
    p_quote_id UUID,
    p_actor_id TEXT,
    p_actor_name TEXT,
    p_payment_method TEXT,
    p_amount NUMERIC,
    p_cheque_number TEXT DEFAULT NULL,
    p_cheque_date DATE DEFAULT NULL,
    p_bank_name TEXT DEFAULT NULL,
    p_cheque_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote RECORD;
    v_sale_id UUID;
    v_receipt_no TEXT;
    v_initial_status TEXT;
    v_payment_id UUID;
    v_items_count INT := 0;
    v_item RECORD;
    v_cleared_paid NUMERIC(12, 2) := 0;
    v_pending_clearance NUMERIC(12, 2) := 0;
    v_balance_due NUMERIC(12, 2) := 0;
    v_payment_status TEXT;
    v_cashier_id UUID := NULL;
    v_cashier_name TEXT := NULL;
BEGIN
    -- 1. Lock quotation row to prevent concurrent duplicate conversion
    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quotation not found.');
    END IF;

    IF v_quote.status = 'accepted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This quotation has already been converted to a sale.');
    END IF;

    -- 2. Validate amount
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount must be greater than zero.');
    END IF;

    IF p_amount > v_quote.total_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment amount (LKR ' || p_amount::text || ') cannot exceed quotation total (LKR ' || v_quote.total_amount::text || ').');
    END IF;

    -- 3. Validate payment method & cheque fields
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

    -- 4. Authoritative Cashier Resolution
    -- Check if p_actor_id matches an employee profile_id
    SELECT id, name INTO v_cashier_id, v_cashier_name
    FROM public.employees
    WHERE profile_id = CASE WHEN p_actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_actor_id::uuid ELSE NULL END
      AND (is_active IS NULL OR is_active = true)
    LIMIT 1;

    -- Also check if p_actor_id directly matches an employee ID (trusted employee identity caller)
    IF v_cashier_id IS NULL THEN
        SELECT id, name INTO v_cashier_id, v_cashier_name
        FROM public.employees
        WHERE id = CASE WHEN p_actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN p_actor_id::uuid ELSE NULL END
          AND (is_active IS NULL OR is_active = true)
        LIMIT 1;
    END IF;

    -- If no linked active employee record exists, FAIL CLOSED
    IF v_cashier_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Your admin profile is not linked to an active employee record. Please link your staff account before converting quotations.'
        );
    END IF;

    -- 5. Generate receipt number and calculate total items count
    v_receipt_no := 'FTC-WHOLESALE-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 8));
    
    IF v_quote.items IS NOT NULL AND jsonb_typeof(v_quote.items) = 'array' THEN
        SELECT COALESCE(SUM((elem->>'qty')::int), 0)
        INTO v_items_count
        FROM jsonb_array_elements(v_quote.items) elem;
    END IF;
    IF v_items_count <= 0 THEN v_items_count := 1; END IF;

    -- 6. Insert Sale row
    INSERT INTO public.sales (
        receipt_number,
        date,
        cashier_name,
        cashier_id,
        customer_name,
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
        created_at,
        updated_at
    ) VALUES (
        v_receipt_no,
        NOW(),
        COALESCE(NULLIF(TRIM(v_cashier_name), ''), NULLIF(TRIM(p_actor_name), ''), 'Admin User'),
        v_cashier_id,
        v_quote.customer_name,
        COALESCE(v_quote.customer_phone, ''),
        v_quote.customer_email,
        COALESCE(v_quote.subtotal, 0),
        COALESCE(v_quote.discount_amount, 0),
        COALESCE(v_quote.tax_amount, 0),
        COALESCE(v_quote.total_amount, 0),
        p_payment_method,
        p_amount,
        0,
        v_items_count,
        'completed',
        'Converted from Quotation #' || v_quote.quote_number,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_sale_id;

    -- 6. Insert Line Items
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

    -- 7. Insert Initial Payment Record
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
        p_amount,
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

    -- 8. Mark quotation accepted
    UPDATE public.quotations
    SET
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_quote_id;

    -- 9. Calculate derived payment summary
    IF v_initial_status = 'cleared' THEN
        v_cleared_paid := p_amount;
        v_pending_clearance := 0;
    ELSE
        v_cleared_paid := 0;
        v_pending_clearance := p_amount;
    END IF;

    v_balance_due := GREATEST(0, v_quote.total_amount - v_cleared_paid);

    IF v_cleared_paid <= 0 THEN
        v_payment_status := 'UNPAID';
    ELSIF v_cleared_paid < v_quote.total_amount THEN
        v_payment_status := 'BALANCE PENDING';
    ELSE
        v_payment_status := 'PAID';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'receipt_number', v_receipt_no,
        'payment_id', v_payment_id,
        'summary', jsonb_build_object(
            'invoice_total', v_quote.total_amount,
            'cleared_paid', v_cleared_paid,
            'pending_clearance', v_pending_clearance,
            'balance_due', v_balance_due,
            'available_to_record', GREATEST(0, v_quote.total_amount - v_cleared_paid - v_pending_clearance),
            'payment_status', v_payment_status
        )
    );
END;
$$;

-- 8. RPC Grants & Permissions (Strictly Server-Only Execution via service_role)
REVOKE EXECUTE ON FUNCTION public.record_sale_payment_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale_payment_atomic(UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_cheque_status_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_cheque_status_atomic(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT) TO service_role;
