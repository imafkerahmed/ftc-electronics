-- Phase 2 Sales Tracker Optimization
-- RPCs for Unified Sales Pagination and KPI Metrics (Augmented for Phase 3)

-- 1. Unified Sales Pagination RPC
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
    total_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_search text;
BEGIN
    v_search := '%' || p_search || '%';

    RETURN QUERY
    WITH combined AS (
        -- POS Sales
        SELECT 
            s.id,
            COALESCE(NULLIF(TRIM(s.receipt_number), ''), 'FTC-POS-' || UPPER(SUBSTRING(s.id::text FROM 1 FOR 6))) AS receipt_number,
            COALESCE(s.date, s.created_at) AS date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.items_count, 1) AS items_count,
            COALESCE(s.total, 0) AS total,
            COALESCE(s.discount, 0) AS discount,
            COALESCE(NULLIF(TRIM(s.payment_method), ''), 'unknown') AS payment_method,
            COALESCE(s.status, 'completed') AS status,
            'POS Terminal' AS source,
            (COALESCE(s.status, 'completed') = 'completed') AS is_paid,
            (COALESCE(s.status, 'completed') = 'completed') AS is_revenue_eligible
        FROM public.sales s

        UNION ALL

        -- Online Orders
        SELECT 
            o.id,
            COALESCE(NULLIF(TRIM(o.order_id), ''), 'FTC-ONL-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 6))) AS receipt_number,
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
            COALESCE(NULLIF(TRIM(o.payment_details->>'method'), ''), 'unknown') AS payment_method,
            COALESCE(o.status, 'pending') AS status,
            'Online Store' AS source,
            COALESCE(o.is_paid, false) AS is_paid,
            (COALESCE(o.is_paid, false) = true AND COALESCE(o.status, 'pending') NOT IN ('cancelled', 'voided', 'returned', 'refunded')) AS is_revenue_eligible
        FROM public.orders o
    ),
    filtered AS (
        SELECT c.*
        FROM combined c
        WHERE 
            (p_source = 'All' OR c.source = p_source)
            AND (p_payment_status = 'All' OR (p_payment_status = 'Paid' AND c.is_paid = true) OR (p_payment_status = 'Unpaid' AND c.is_paid = false))
            AND (p_status = 'All' OR c.status ILIKE p_status)
            AND (p_payment_method = 'All' OR c.payment_method ILIKE p_payment_method)
            AND (p_date_from IS NULL OR c.date >= p_date_from)
            AND (p_date_to IS NULL OR c.date < p_date_to)
            AND (p_min_amount IS NULL OR c.total >= p_min_amount)
            AND (p_max_amount IS NULL OR c.total <= p_max_amount)
            AND (
                p_search = '' 
                OR c.receipt_number ILIKE v_search
                OR c.customer_name ILIKE v_search
                OR c.customer_email ILIKE v_search
                OR c.payment_method ILIKE v_search
            )
    )
    SELECT 
        f.id,
        f.receipt_number,
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
        (SELECT COUNT(*) FROM filtered) AS total_count
    FROM filtered f
    ORDER BY 
        CASE WHEN p_sort = 'oldest' THEN f.date END ASC,
        CASE WHEN p_sort = 'lowest' THEN f.total END ASC,
        CASE WHEN p_sort = 'highest' THEN f.total END DESC,
        f.date DESC, -- Default fallback for 'newest' and general sorting
        f.id DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Secure execution
REVOKE ALL ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) TO service_role;


-- 2. Unified Sales Metrics RPC
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
SET search_path = ''
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
            COALESCE(s.date, s.created_at) AS date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.total, 0) AS total,
            COALESCE(NULLIF(TRIM(s.payment_method), ''), 'unknown') AS payment_method,
            COALESCE(s.status, 'completed') AS status,
            'POS Terminal' AS source,
            (COALESCE(s.status, 'completed') = 'completed') AS is_paid,
            (COALESCE(s.status, 'completed') = 'completed') AS is_revenue_eligible
        FROM public.sales s

        UNION ALL

        SELECT 
            o.id,
            COALESCE(NULLIF(TRIM(o.order_id), ''), 'FTC-ONL-' || UPPER(SUBSTRING(o.id::text FROM 1 FOR 6))) AS receipt_number,
            o.created_at AS date,
            COALESCE(
                NULLIF(TRIM(o.customer->>'name'), ''),
                NULLIF(TRIM((o.shipping_address->>'firstName') || ' ' || COALESCE(o.shipping_address->>'lastName', '')), ''),
                'Online Customer'
            ) AS customer_name,
            COALESCE(NULLIF(TRIM(o.customer->>'email'), ''), '—') AS customer_email,
            COALESCE(o.total, 0) AS total,
            COALESCE(NULLIF(TRIM(o.payment_details->>'method'), ''), 'unknown') AS payment_method,
            COALESCE(o.status, 'pending') AS status,
            'Online Store' AS source,
            COALESCE(o.is_paid, false) AS is_paid,
            (COALESCE(o.is_paid, false) = true AND COALESCE(o.status, 'pending') NOT IN ('cancelled', 'voided', 'returned', 'refunded')) AS is_revenue_eligible
        FROM public.orders o
    ),
    filtered AS (
        SELECT c.*
        FROM combined c
        WHERE 
            (p_source = 'All' OR c.source = p_source)
            AND (p_payment_status = 'All' OR (p_payment_status = 'Paid' AND c.is_paid = true) OR (p_payment_status = 'Unpaid' AND c.is_paid = false))
            AND (p_status = 'All' OR c.status ILIKE p_status)
            AND (p_payment_method = 'All' OR c.payment_method ILIKE p_payment_method)
            AND (p_date_from IS NULL OR c.date >= p_date_from)
            AND (p_date_to IS NULL OR c.date < p_date_to)
            AND (p_min_amount IS NULL OR c.total >= p_min_amount)
            AND (p_max_amount IS NULL OR c.total <= p_max_amount)
            AND (
                p_search = '' 
                OR c.receipt_number ILIKE v_search
                OR c.customer_name ILIKE v_search
                OR c.customer_email ILIKE v_search
                OR c.payment_method ILIKE v_search
            )
    )
    SELECT 
        COALESCE(SUM(f.total) FILTER (WHERE f.is_revenue_eligible), 0) AS total_revenue,
        COALESCE(SUM(f.total) FILTER (WHERE f.source = 'POS Terminal' AND f.is_revenue_eligible), 0) AS pos_revenue,
        COALESCE(SUM(f.total) FILTER (WHERE f.source = 'Online Store' AND f.is_revenue_eligible), 0) AS online_revenue,
        COUNT(f.id) FILTER (WHERE f.is_revenue_eligible)::int AS paid_transactions,
        COUNT(f.id) FILTER (WHERE f.source = 'POS Terminal' AND f.is_revenue_eligible)::int AS paid_pos_transactions,
        COUNT(f.id) FILTER (WHERE f.source = 'Online Store' AND f.is_revenue_eligible)::int AS paid_online_transactions,
        
        COALESCE(SUM(f.total) FILTER (WHERE f.is_paid = false AND f.status NOT IN ('cancelled', 'voided', 'returned', 'refunded')), 0) AS outstanding_amount,
        COUNT(f.id) FILTER (WHERE f.is_paid = false AND f.status NOT IN ('cancelled', 'voided', 'returned', 'refunded'))::int AS outstanding_transactions,
        
        COUNT(f.id) FILTER (WHERE f.status IN ('cancelled', 'voided', 'returned', 'refunded'))::int AS returned_refunded_count,
        
        CASE 
            WHEN COUNT(f.id) FILTER (WHERE f.is_revenue_eligible) > 0 THEN
                COALESCE(SUM(f.total) FILTER (WHERE f.is_revenue_eligible), 0) / COUNT(f.id) FILTER (WHERE f.is_revenue_eligible)
            ELSE 0
        END AS average_paid_transaction,
        
        COUNT(f.id)::int AS total_transactions
    FROM filtered f;
END;
$$;

-- Secure execution
REVOKE ALL ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) TO service_role;
