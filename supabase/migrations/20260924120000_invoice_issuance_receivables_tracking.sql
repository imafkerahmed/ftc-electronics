-- ==============================================================================
-- FTC Electronics: Phase 1 & 2 Invoice Issuance, Payment Terms & Receivables Tracking
-- Migration: 20260924120000_invoice_issuance_receivables_tracking.sql
-- ==============================================================================

-- 1. Schema Extensions for Sales (Payment Terms & Due Date)
ALTER TABLE public.sales 
    ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'due_on_receipt',
    ADD COLUMN IF NOT EXISTS due_date DATE DEFAULT NULL;

-- Payment Terms Check Constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sales_payment_terms_check'
    ) THEN
        ALTER TABLE public.sales
            ADD CONSTRAINT sales_payment_terms_check
            CHECK (payment_terms = ANY (ARRAY['due_on_receipt'::text, 'net_7'::text, 'net_14'::text, 'net_30'::text, 'custom'::text]));
    END IF;
END $$;

-- 2. Performance Indexes for Receivables and Payment Aggregations
CREATE INDEX IF NOT EXISTS idx_sales_due_date ON public.sales(due_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_invoiced_at ON public.sales(invoiced_at);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_status ON public.sale_payments(sale_id, status);
CREATE INDEX IF NOT EXISTS idx_sale_payments_payment_date ON public.sale_payments(payment_date);

-- 3. Atomic Quotation to Invoice Conversion RPC (Supports Zero Payment & Payment Terms)
DROP FUNCTION IF EXISTS public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, DATE);

CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale_atomic(
    p_quote_id UUID,
    p_actor_id TEXT,
    p_actor_name TEXT,
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
    v_receipt_no TEXT;
    v_invoice_num TEXT;
    v_initial_status TEXT;
    v_payment_id UUID := NULL;
    v_items_count INT := 0;
    v_cleared_paid NUMERIC(12, 2) := 0;
    v_pending_clearance NUMERIC(12, 2) := 0;
    v_balance_due NUMERIC(12, 2) := 0;
    v_payment_status TEXT;
    v_cashier_id UUID := NULL;
    v_cashier_name TEXT := NULL;
    v_final_terms TEXT := 'due_on_receipt';
    v_calc_due_date DATE;
    v_payment_amt NUMERIC := COALESCE(p_amount, 0);
    v_has_payment BOOLEAN := false;
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

    -- 6. Insert Sale Row (With invoice_number, invoiced_at, payment_terms, and due_date)
    INSERT INTO public.sales (
        receipt_number,
        invoice_number,
        invoiced_at,
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
        payment_terms,
        due_date,
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
    ELSE
        v_cleared_paid := 0;
        v_pending_clearance := 0;
    END IF;

    -- 9. Mark quotation accepted
    UPDATE public.quotations
    SET
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_quote_id;

    -- 10. Calculate authoritative financial status
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
        'invoice_number', v_invoice_num,
        'payment_id', v_payment_id,
        'summary', jsonb_build_object(
            'invoice_total', v_quote.total_amount,
            'cleared_paid', v_cleared_paid,
            'pending_clearance', v_pending_clearance,
            'balance_due', v_balance_due,
            'available_to_record', GREATEST(0, v_quote.total_amount - v_cleared_paid - v_pending_clearance),
            'payment_status', v_payment_status,
            'payment_terms', v_final_terms,
            'due_date', v_calc_due_date
        )
    );
END;
$$;

-- Secure execution
REVOKE ALL ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale_atomic(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT, TEXT, TEXT, DATE) TO service_role;


-- 4. Update Unified Sales Pagination RPC (Server-Side Aggregated Financial Status)
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
        -- POS / Wholesale Sales with Aggregated Payments
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
            COALESCE(sp.cleared_paid, 0) AS cleared_paid,
            COALESCE(sp.pending_clearance, 0) AS pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0)) AS balance_due,
            GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0) - COALESCE(sp.pending_clearance, 0)) AS available_to_record,
            CASE 
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN COALESCE(sp.cleared_paid, 0) <= 0 THEN 'UNPAID'
                WHEN COALESCE(sp.cleared_paid, 0) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS payment_status,
            (COALESCE(sp.cleared_paid, 0) >= COALESCE(s.total, 0) AND COALESCE(s.status, 'completed') != 'voided') AS is_paid,
            (COALESCE(sp.cleared_paid, 0) > 0 AND COALESCE(s.status, 'completed') != 'voided') AS is_revenue_eligible,
            s.payment_terms,
            COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) AS due_date,
            -- Collection Status
            CASE 
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN COALESCE(sp.cleared_paid, 0) >= COALESCE(s.total, 0) THEN 'SETTLED'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE + 3 THEN 'NOT DUE'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE AND COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) <= CURRENT_DATE + 3 THEN 'DUE SOON'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) = CURRENT_DATE THEN 'DUE TODAY'
                ELSE 'OVERDUE'
            END AS collection_status,
            CASE 
                WHEN s.status != 'voided' AND COALESCE(sp.cleared_paid, 0) < COALESCE(s.total, 0) AND COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) < CURRENT_DATE THEN
                    (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date))::int
                ELSE 0
            END AS days_overdue
        FROM public.sales s
        LEFT JOIN LATERAL (
            SELECT 
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS cleared_paid,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.payment_method = 'cheque' AND sp_inner.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true

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
            COALESCE(
                NULLIF(TRIM(o.customer->>'email'), ''),
                '—'
            ) AS customer_email,
            COALESCE((
                SELECT sum((item->>'quantity')::int)
                FROM jsonb_array_elements(
                    CASE 
                        WHEN jsonb_typeof(o.items) = 'array' THEN o.items
                        ELSE '[]'::jsonb
                    END
                ) AS item
            ), 1)::int AS items_count,
            COALESCE(o.total, 0) AS total,
            0 AS discount,
            COALESCE(NULLIF(TRIM(o.payment_details->>'method'), ''), 'online') AS payment_method,
            COALESCE(o.status, 'pending') AS status,
            'Online Store' AS source,
            -- Payment calculations
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
                ELSE 'NOT DUE'
            END AS collection_status,
            0 AS days_overdue
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
        CASE WHEN p_sort = 'oldest' THEN f.date END ASC,
        CASE WHEN p_sort = 'lowest' THEN f.total END ASC,
        CASE WHEN p_sort = 'highest' THEN f.total END DESC,
        f.date DESC,
        f.id DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) TO service_role;


-- 5. Update Unified Sales Metrics RPC (Authoritative Financial Summaries)
DROP FUNCTION IF EXISTS public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric);

CREATE OR REPLACE FUNCTION public.admin_get_unified_sales_metrics(
    p_search text DEFAULT '',
    p_source text DEFAULT 'All',
    p_payment_status text DEFAULT 'All',
    p_status text DEFAULT 'All',
    p_payment_method text DEFAULT 'All',
    p_date_from timestamptz DEFAULT NULL,
    p_date_to timestamptz DEFAULT NULL,
    p_min_amount numeric DEFAULT NULL,
    p_max_amount numeric DEFAULT NULL
)
RETURNS TABLE (
    total_revenue numeric,
    pos_revenue numeric,
    online_revenue numeric,
    paid_transactions int,
    paid_pos_transactions int,
    paid_online_transactions int,
    outstanding_amount numeric,
    outstanding_transactions int,
    returned_refunded_count int,
    average_paid_transaction numeric,
    total_transactions int
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
        SELECT 
            s.id,
            COALESCE(NULLIF(TRIM(s.receipt_number), ''), 'FTC-POS-' || UPPER(SUBSTRING(s.id::text FROM 1 FOR 6))) AS receipt_number,
            s.invoice_number,
            COALESCE(s.date, s.created_at) AS date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.total, 0) AS total,
            COALESCE(NULLIF(TRIM(s.payment_method), ''), 'unpaid') AS payment_method,
            COALESCE(s.status, 'completed') AS status,
            'POS Terminal' AS source,
            COALESCE(sp.cleared_paid, 0) AS cleared_paid,
            GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0)) AS balance_due,
            CASE 
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN COALESCE(sp.cleared_paid, 0) <= 0 THEN 'UNPAID'
                WHEN COALESCE(sp.cleared_paid, 0) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS payment_status,
            (COALESCE(sp.cleared_paid, 0) >= COALESCE(s.total, 0) AND COALESCE(s.status, 'completed') != 'voided') AS is_paid,
            (COALESCE(sp.cleared_paid, 0) > 0 AND COALESCE(s.status, 'completed') != 'voided') AS is_revenue_eligible
        FROM public.sales s
        LEFT JOIN LATERAL (
            SELECT 
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS cleared_paid
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true

        UNION ALL

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
            COALESCE(o.total, 0) AS total,
            COALESCE(NULLIF(TRIM(o.payment_details->>'method'), ''), 'online') AS payment_method,
            COALESCE(o.status, 'pending') AS status,
            'Online Store' AS source,
            CASE WHEN COALESCE(o.is_paid, false) THEN COALESCE(o.total, 0) ELSE 0 END AS cleared_paid,
            CASE WHEN COALESCE(o.is_paid, false) THEN 0 ELSE COALESCE(o.total, 0) END AS balance_due,
            CASE 
                WHEN o.status IN ('cancelled', 'voided') THEN 'VOIDED'
                WHEN COALESCE(o.is_paid, false) THEN 'PAID'
                ELSE 'UNPAID'
            END AS payment_status,
            COALESCE(o.is_paid, false) AS is_paid,
            (COALESCE(o.is_paid, false) = true AND COALESCE(o.status, 'pending') NOT IN ('cancelled', 'voided', 'returned', 'refunded')) AS is_revenue_eligible
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
        COALESCE(SUM(f.cleared_paid) FILTER (WHERE f.is_revenue_eligible), 0) AS total_revenue,
        COALESCE(SUM(f.cleared_paid) FILTER (WHERE f.source = 'POS Terminal' AND f.is_revenue_eligible), 0) AS pos_revenue,
        COALESCE(SUM(f.cleared_paid) FILTER (WHERE f.source = 'Online Store' AND f.is_revenue_eligible), 0) AS online_revenue,
        COUNT(f.id) FILTER (WHERE f.is_paid)::int AS paid_transactions,
        COUNT(f.id) FILTER (WHERE f.source = 'POS Terminal' AND f.is_paid)::int AS paid_pos_transactions,
        COUNT(f.id) FILTER (WHERE f.source = 'Online Store' AND f.is_paid)::int AS paid_online_transactions,
        
        COALESCE(SUM(f.balance_due) FILTER (WHERE f.status NOT IN ('cancelled', 'voided', 'returned', 'refunded')), 0) AS outstanding_amount,
        COUNT(f.id) FILTER (WHERE f.balance_due > 0 AND f.status NOT IN ('cancelled', 'voided', 'returned', 'refunded'))::int AS outstanding_transactions,
        
        COUNT(f.id) FILTER (WHERE f.status IN ('cancelled', 'voided', 'returned', 'refunded'))::int AS returned_refunded_count,
        
        CASE 
            WHEN COUNT(f.id) FILTER (WHERE f.is_paid) > 0 THEN
                COALESCE(SUM(f.total) FILTER (WHERE f.is_paid), 0) / COUNT(f.id) FILTER (WHERE f.is_paid)
            ELSE 0
        END AS average_paid_transaction,
        
        COUNT(f.id)::int AS total_transactions
    FROM filtered f;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) TO service_role;


-- 6. Outstanding Receivables Query RPC (Phase 2C)
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
            COALESCE(sp.cleared_paid, 0) AS cleared_paid,
            COALESCE(sp.pending_clearance, 0) AS pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0)) AS balance_due,
            GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0) - COALESCE(sp.pending_clearance, 0)) AS available_to_record,
            CASE 
                WHEN COALESCE(sp.cleared_paid, 0) <= 0 THEN 'UNPAID'
                WHEN COALESCE(sp.cleared_paid, 0) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS payment_status,
            CASE 
                WHEN COALESCE(sp.cleared_paid, 0) >= COALESCE(s.total, 0) THEN 'SETTLED'
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
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS cleared_paid,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.payment_method = 'cheque' AND sp_inner.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true
        WHERE COALESCE(s.status, 'completed') NOT IN ('voided', 'cancelled')
          AND GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0)) > 0
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


-- 7. Outstanding Receivables Metrics RPC (Phase 2D)
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
            COALESCE(sp.cleared_paid, 0) AS cleared_paid,
            COALESCE(sp.pending_clearance, 0) AS pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0)) AS balance_due,
            CASE 
                WHEN COALESCE(sp.cleared_paid, 0) <= 0 THEN 'UNPAID'
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
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS cleared_paid,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.payment_method = 'cheque' AND sp_inner.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true
        WHERE COALESCE(s.status, 'completed') NOT IN ('voided', 'cancelled')
          AND GREATEST(0, COALESCE(s.total, 0) - COALESCE(sp.cleared_paid, 0)) > 0
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
