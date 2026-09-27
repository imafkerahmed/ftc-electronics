-- ==============================================================================
-- FTC Electronics: Wholesale Cheque Register, Lifecycle Tracking & Metrics
-- Migration: 20260924180000_cheque_register_tracking.sql
-- ==============================================================================

-- 1. Index on cheque tracking
CREATE INDEX IF NOT EXISTS idx_sale_payments_cheque_tracking 
ON public.sale_payments(payment_method, status, cheque_date);

-- 2. Drop prior versions if exist to prevent overloading ambiguities
DROP FUNCTION IF EXISTS public.admin_get_cheque_register(text, text, text, int, int);
DROP FUNCTION IF EXISTS public.admin_get_cheque_register_metrics(text);

-- 3. Dedicated Cheque Register Paginated Read RPC
CREATE OR REPLACE FUNCTION public.admin_get_cheque_register(
    p_search TEXT DEFAULT '',
    p_filter TEXT DEFAULT 'all',
    p_sort TEXT DEFAULT 'actionable_priority',
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    sale_id UUID,
    cheque_number TEXT,
    bank_name TEXT,
    amount NUMERIC,
    status TEXT,
    payment_date TIMESTAMPTZ,
    cheque_date DATE,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ,
    cleared_by TEXT,
    cleared_at TIMESTAMPTZ,
    invoice_number TEXT,
    receipt_number TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_email TEXT,
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
            sp.cheque_number,
            sp.bank_name,
            sp.amount,
            sp.status,
            sp.payment_date,
            sp.cheque_date,
            sp.notes,
            sp.created_by,
            sp.created_at,
            sp.cleared_by,
            sp.cleared_at,
            s.invoice_number,
            COALESCE(NULLIF(TRIM(s.receipt_number), ''), 'FTC-POS-' || UPPER(SUBSTRING(s.id::text FROM 1 FOR 6))) AS receipt_number,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            s.customer_phone,
            s.customer_email,
            COALESCE(s.total, 0) AS invoice_total,
            COALESCE(sale_summary.cleared_paid, 0) AS invoice_cleared_paid,
            COALESCE(sale_summary.pending_clearance, 0) AS invoice_pending_clearance,
            GREATEST(0, COALESCE(s.total, 0) - COALESCE(sale_summary.cleared_paid, 0)) AS invoice_balance_due,
            CASE 
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN COALESCE(sale_summary.cleared_paid, 0) <= 0 THEN 'UNPAID'
                WHEN COALESCE(sale_summary.cleared_paid, 0) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
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
                COALESCE(SUM(sp_sum.amount) FILTER (WHERE sp_sum.status = 'cleared'), 0) AS cleared_paid,
                COALESCE(SUM(sp_sum.amount) FILTER (WHERE sp_sum.payment_method = 'cheque' AND sp_sum.status = 'pending'), 0) AS pending_clearance
            FROM public.sale_payments sp_sum
            WHERE sp_sum.sale_id = s.id
        ) sale_summary ON true
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
                OR bc.bank_name ILIKE v_search
                OR (bc.customer_phone IS NOT NULL AND bc.customer_phone ILIKE v_search)
            )
    ),
    counted AS (
        SELECT COUNT(*) AS total_rows FROM filtered
    )
    SELECT
        f.id,
        f.sale_id,
        f.cheque_number,
        f.bank_name,
        f.amount,
        f.status,
        f.payment_date,
        f.cheque_date,
        f.notes,
        f.created_by,
        f.created_at,
        f.cleared_by,
        f.cleared_at,
        f.invoice_number,
        f.receipt_number,
        f.customer_name,
        f.customer_phone,
        f.customer_email,
        f.invoice_total,
        f.invoice_cleared_paid,
        f.invoice_pending_clearance,
        f.invoice_balance_due,
        f.invoice_payment_status,
        f.operational_state,
        f.days_diff,
        f.days_overdue,
        c.total_rows AS total_count
    FROM filtered f
    CROSS JOIN counted c
    ORDER BY 
        CASE 
            WHEN p_sort = 'actionable_priority' THEN
                CASE 
                    WHEN f.status = 'pending' AND f.cheque_date < CURRENT_DATE THEN 1
                    WHEN f.status = 'pending' AND f.cheque_date = CURRENT_DATE THEN 2
                    WHEN f.status = 'pending' AND f.cheque_date > CURRENT_DATE THEN 3
                    ELSE 4
                END
            ELSE 1
        END ASC,
        CASE 
            WHEN p_sort = 'actionable_priority' AND f.status = 'pending' THEN f.cheque_date
            ELSE NULL
        END ASC,
        CASE WHEN p_sort = 'cheque_date_asc' THEN f.cheque_date END ASC NULLS LAST,
        CASE WHEN p_sort = 'cheque_date_desc' THEN f.cheque_date END DESC NULLS LAST,
        CASE WHEN p_sort = 'amount_desc' THEN f.amount END DESC,
        CASE WHEN p_sort = 'amount_asc' THEN f.amount END ASC,
        CASE WHEN p_sort = 'received_desc' THEN f.payment_date END DESC,
        f.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 4. Dedicated Cheque Register Summary Metrics RPC
CREATE OR REPLACE FUNCTION public.admin_get_cheque_register_metrics(
    p_search TEXT DEFAULT ''
)
RETURNS TABLE (
    pending_amount NUMERIC,
    pending_count BIGINT,
    due_today_amount NUMERIC,
    due_today_count BIGINT,
    upcoming_amount NUMERIC,
    upcoming_count BIGINT,
    overdue_amount NUMERIC,
    overdue_count BIGINT,
    cleared_this_month_amount NUMERIC,
    cleared_this_month_count BIGINT,
    bounced_this_month_amount NUMERIC,
    bounced_this_month_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_search TEXT := '%' || TRIM(COALESCE(p_search, '')) || '%';
BEGIN
    RETURN QUERY
    WITH matching_cheques AS (
        SELECT 
            sp.id,
            sp.amount,
            sp.status,
            sp.cheque_date,
            sp.cleared_at,
            sp.updated_at
        FROM public.sale_payments sp
        JOIN public.sales s ON s.id = sp.sale_id
        WHERE sp.payment_method = 'cheque'
          AND (
              p_search = ''
              OR sp.cheque_number ILIKE v_search
              OR (s.invoice_number IS NOT NULL AND s.invoice_number ILIKE v_search)
              OR s.receipt_number ILIKE v_search
              OR s.customer_name ILIKE v_search
              OR sp.bank_name ILIKE v_search
          )
    )
    SELECT
        -- Pending Clearance
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        
        -- Due Today
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND cheque_date = CURRENT_DATE), 0) AS due_today_amount,
        COUNT(*) FILTER (WHERE status = 'pending' AND cheque_date = CURRENT_DATE) AS due_today_count,
        
        -- Upcoming (Post-dated)
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND cheque_date > CURRENT_DATE), 0) AS upcoming_amount,
        COUNT(*) FILTER (WHERE status = 'pending' AND cheque_date > CURRENT_DATE) AS upcoming_count,
        
        -- Overdue For Review
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND cheque_date < CURRENT_DATE), 0) AS overdue_amount,
        COUNT(*) FILTER (WHERE status = 'pending' AND cheque_date < CURRENT_DATE) AS overdue_count,
        
        -- Cleared This Month
        COALESCE(SUM(amount) FILTER (WHERE status = 'cleared' AND date_trunc('month', COALESCE(cleared_at, updated_at)) = date_trunc('month', CURRENT_DATE)), 0) AS cleared_this_month_amount,
        COUNT(*) FILTER (WHERE status = 'cleared' AND date_trunc('month', COALESCE(cleared_at, updated_at)) = date_trunc('month', CURRENT_DATE)) AS cleared_this_month_count,
        
        -- Bounced This Month
        COALESCE(SUM(amount) FILTER (WHERE status = 'bounced' AND date_trunc('month', updated_at) = date_trunc('month', CURRENT_DATE)), 0) AS bounced_this_month_amount,
        COUNT(*) FILTER (WHERE status = 'bounced' AND date_trunc('month', updated_at) = date_trunc('month', CURRENT_DATE)) AS bounced_this_month_count
    FROM matching_cheques;
END;
$$;

-- 5. Security & Access Control
REVOKE ALL ON FUNCTION public.admin_get_cheque_register(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_cheque_register_metrics(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_cheque_register(TEXT, TEXT, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_cheque_register_metrics(TEXT) TO service_role;
