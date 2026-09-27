-- ====================================================================
-- MIGRATION: 20260925143000_sales_management_status_cleanup.sql
-- DESCRIPTION: Clean up Sales Management payment / lifecycle mapping
--   1. Ensures counter POS sales with status='completed' resolve authoritatively to PAID (cleared_paid = total, balance_due = 0)
--   2. Prevents commercial zero-payment / unpaid invoices from inheriting false payment methods
--   3. Aggregates multi-payment methods from sale_payments for settled invoices
--   4. Refines unified revenue metrics to accurately include completed POS transactions
-- ====================================================================

-- 1. Drop old function overloads
DROP FUNCTION IF EXISTS public.admin_get_unified_sales(text, text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int);

-- 2. Create updated admin_get_unified_sales
CREATE OR REPLACE FUNCTION public.admin_get_unified_sales(
    p_search text DEFAULT '',
    p_source text DEFAULT 'All',
    p_payment_status text DEFAULT 'All',
    p_status text DEFAULT 'All',
    p_payment_method text DEFAULT 'All',
    p_lifecycle text DEFAULT 'all',
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
    customer_company text,
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
    is_revoked boolean,
    invoice_revoked_at timestamptz,
    invoice_revoked_by text,
    invoice_revoke_reason text,
    invoice_revoke_notes text,
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
    WITH raw_sales AS (
        SELECT 
            s.*,
            (
                s.invoice_number IS NOT NULL 
                OR s.customer_company IS NOT NULL 
                OR COALESCE(s.invoice_snapshot->>'customer_company', '') != ''
                OR COALESCE(s.receipt_number, '') LIKE 'FTC-WHOLESALE-%' 
                OR COALESCE(s.notes, '') LIKE 'Converted from Quotation%'
            ) AS is_wholesale
        FROM public.sales s
    ),
    combined AS (
        -- POS / Wholesale Sales with Aggregated Payments & Reversals
        SELECT 
            s.id,
            COALESCE(NULLIF(TRIM(s.receipt_number), ''), 'FTC-POS-' || UPPER(SUBSTRING(s.id::text FROM 1 FOR 6))) AS receipt_number,
            s.invoice_number,
            COALESCE(s.date, s.created_at) AS date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(s.customer_company, s.invoice_snapshot->>'customer_company') AS customer_company,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.items_count, 1) AS items_count,
            COALESCE(s.total, 0) AS total,
            COALESCE(s.discount, 0) AS discount,
            -- Authoritative Payment Method:
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL THEN NULL
                WHEN s.is_wholesale THEN
                    CASE 
                        WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) > 0 THEN 
                            COALESCE(sp.methods_agg, NULLIF(TRIM(s.payment_method), 'unpaid'))
                        WHEN COALESCE(sp.pending_clearance, 0) > 0 THEN 
                            COALESCE(sp.pending_methods_agg, 'cheque')
                        ELSE NULL
                    END
                ELSE -- POS Counter
                    CASE 
                        WHEN COALESCE(sp.payment_count, 0) > 0 THEN COALESCE(sp.methods_agg, s.payment_method)
                        WHEN s.status = 'completed' THEN COALESCE(NULLIF(TRIM(s.payment_method), ''), 'cash')
                        ELSE NULLIF(TRIM(s.payment_method), '')
                    END
            END AS payment_method,
            COALESCE(s.status, 'completed') AS status,
            CASE 
                WHEN s.is_wholesale THEN 'Wholesale'
                ELSE 'POS Terminal'
            END AS source,
            -- is_paid:
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL OR s.status = 'voided' THEN false
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    (s.status = 'completed')
                ELSE (GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) >= COALESCE(s.total, 0))
            END AS is_paid,
            -- is_revenue_eligible:
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL OR s.status = 'voided' THEN false
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    (s.status = 'completed' AND COALESCE(s.total, 0) > 0)
                ELSE (GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) > 0)
            END AS is_revenue_eligible,
            -- Payment calculations:
            CASE 
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN COALESCE(s.total, 0) ELSE 0 END
                ELSE COALESCE(sp.gross_cleared_paid, 0)
            END AS gross_cleared_paid,
            COALESCE(spr.returned_amount, 0) AS returned_amount,
            CASE 
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN COALESCE(s.total, 0) ELSE 0 END
                ELSE GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0))
            END AS cleared_paid,
            COALESCE(sp.pending_clearance, 0) AS pending_clearance,
            CASE 
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN 0 ELSE COALESCE(s.total, 0) END
                ELSE GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)))
            END AS balance_due,
            CASE 
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN 0
                ELSE GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) - COALESCE(sp.pending_clearance, 0))
            END AS available_to_record,
            -- Authoritative Payment Status:
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL THEN 'REVOKED'
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN 'PAID' ELSE 'UNPAID' END
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) <= 0 THEN 'UNPAID'
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS payment_status,
            s.payment_terms,
            COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) AS due_date,
            -- Collection Status:
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL THEN 'REVOKED'
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN 'SETTLED' ELSE 'OVERDUE' END
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) >= COALESCE(s.total, 0) THEN 'SETTLED'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE + 3 THEN 'NOT DUE'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) > CURRENT_DATE AND COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) <= CURRENT_DATE + 3 THEN 'DUE SOON'
                WHEN COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) = CURRENT_DATE THEN 'DUE TODAY'
                ELSE 'OVERDUE'
            END AS collection_status,
            CASE 
                WHEN s.status != 'voided' AND s.invoice_revoked_at IS NULL AND GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) < COALESCE(s.total, 0) AND COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date) < CURRENT_DATE THEN
                    (CURRENT_DATE - COALESCE(s.due_date, (s.created_at AT TIME ZONE 'UTC')::date))::int
                ELSE 0
            END AS days_overdue,
            (s.invoice_revoked_at IS NOT NULL) AS is_revoked,
            s.invoice_revoked_at,
            s.invoice_revoked_by,
            s.invoice_revoke_reason,
            s.invoice_revoke_notes
        FROM raw_sales s
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(sp_inner.id) AS payment_count,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS gross_cleared_paid,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.payment_method = 'cheque' AND sp_inner.status = 'pending'), 0) AS pending_clearance,
                string_agg(DISTINCT sp_inner.payment_method, ' + ') FILTER (WHERE sp_inner.status = 'cleared') AS methods_agg,
                string_agg(DISTINCT sp_inner.payment_method, ' + ') FILTER (WHERE sp_inner.status = 'pending') AS pending_methods_agg
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
            o.customer->>'company' AS customer_company,
            COALESCE(NULLIF(TRIM(o.customer->>'email'), ''), '—') AS customer_email,
            COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END), 1) AS items_count,
            COALESCE(o.total, 0) AS total,
            0 AS discount,
            COALESCE(NULLIF(TRIM(o.payment_details->>'method'), ''), 'online') AS payment_method,
            COALESCE(o.status, 'pending') AS status,
            'Online Store' AS source,
            COALESCE(o.is_paid, false) AS is_paid,
            (COALESCE(o.is_paid, false) = true AND COALESCE(o.status, 'pending') NOT IN ('cancelled', 'voided', 'returned', 'refunded')) AS is_revenue_eligible,
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
            'due_on_receipt' AS payment_terms,
            (o.created_at AT TIME ZONE 'UTC')::date AS due_date,
            CASE 
                WHEN o.status IN ('cancelled', 'voided') THEN 'VOIDED'
                WHEN COALESCE(o.is_paid, false) THEN 'SETTLED'
                ELSE 'NOT DUE'
            END AS collection_status,
            0 AS days_overdue,
            false AS is_revoked,
            NULL::timestamptz AS invoice_revoked_at,
            NULL::text AS invoice_revoked_by,
            NULL::text AS invoice_revoke_reason,
            NULL::text AS invoice_revoke_notes
        FROM public.orders o
    ),
    filtered AS (
        SELECT 
            c.*,
            COUNT(*) OVER() AS total_count
        FROM combined c
        WHERE 
            -- Lifecycle Filter
            (
                p_lifecycle = 'all'
                OR (p_lifecycle = 'active' AND NOT c.is_revoked AND c.status != 'voided')
                OR (p_lifecycle = 'revoked' AND c.is_revoked)
            )
            -- Text Search
            AND (
                p_search = '' 
                OR c.receipt_number ILIKE v_search
                OR (c.invoice_number IS NOT NULL AND c.invoice_number ILIKE v_search)
                OR c.customer_name ILIKE v_search
                OR (c.customer_company IS NOT NULL AND c.customer_company ILIKE v_search)
                OR c.customer_email ILIKE v_search
            )
            -- Source / Channel Filter
            AND (
                p_source = 'All' 
                OR c.source ILIKE p_source
            )
            -- Payment Status Filter
            AND (
                p_payment_status = 'All'
                OR c.payment_status = UPPER(p_payment_status)
            )
            -- Order / Sale Status Filter
            AND (
                p_status = 'All'
                OR c.status ILIKE p_status
            )
            -- Payment Method Filter
            AND (
                p_payment_method = 'All'
                OR (c.payment_method IS NOT NULL AND c.payment_method ILIKE '%' || p_payment_method || '%')
            )
            -- Date Range Filter
            AND (p_date_from IS NULL OR c.date >= p_date_from)
            AND (p_date_to IS NULL OR c.date <= p_date_to)
            -- Amount Range Filter
            AND (p_min_amount IS NULL OR c.total >= p_min_amount)
            AND (p_max_amount IS NULL OR c.total <= p_max_amount)
    )
    SELECT *
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

REVOKE ALL ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_sales(text, text, text, text, text, text, timestamptz, timestamptz, numeric, numeric, text, int, int) TO service_role;


-- 3. Update Unified Sales Metrics RPC
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
    WITH raw_sales AS (
        SELECT 
            s.*,
            (
                s.invoice_number IS NOT NULL 
                OR s.customer_company IS NOT NULL 
                OR COALESCE(s.invoice_snapshot->>'customer_company', '') != ''
                OR COALESCE(s.receipt_number, '') LIKE 'FTC-WHOLESALE-%' 
                OR COALESCE(s.notes, '') LIKE 'Converted from Quotation%'
            ) AS is_wholesale
        FROM public.sales s
    ),
    combined AS (
        SELECT 
            s.id,
            COALESCE(NULLIF(TRIM(s.receipt_number), ''), 'FTC-POS-' || UPPER(SUBSTRING(s.id::text FROM 1 FOR 6))) AS receipt_number,
            s.invoice_number,
            COALESCE(s.date, s.created_at) AS date,
            COALESCE(NULLIF(TRIM(s.customer_name), ''), 'Walk-in Customer') AS customer_name,
            COALESCE(s.customer_company, s.invoice_snapshot->>'customer_company') AS customer_company,
            COALESCE(NULLIF(TRIM(s.customer_email), ''), '—') AS customer_email,
            COALESCE(s.total, 0) AS total,
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL THEN NULL
                WHEN s.is_wholesale THEN
                    CASE 
                        WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) > 0 THEN 
                            COALESCE(sp.methods_agg, NULLIF(TRIM(s.payment_method), 'unpaid'))
                        ELSE NULL
                    END
                ELSE
                    COALESCE(NULLIF(TRIM(s.payment_method), ''), 'cash')
            END AS payment_method,
            COALESCE(s.status, 'completed') AS status,
            CASE 
                WHEN s.is_wholesale THEN 'Wholesale'
                ELSE 'POS Terminal'
            END AS source,
            CASE 
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN COALESCE(s.total, 0) ELSE 0 END
                ELSE COALESCE(sp.gross_cleared_paid, 0)
            END AS gross_cleared_paid,
            COALESCE(spr.returned_amount, 0) AS returned_amount,
            CASE 
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN COALESCE(s.total, 0) ELSE 0 END
                ELSE GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0))
            END AS cleared_paid,
            CASE 
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN 0 ELSE COALESCE(s.total, 0) END
                ELSE GREATEST(0, COALESCE(s.total, 0) - GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)))
            END AS balance_due,
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL THEN 'REVOKED'
                WHEN s.status = 'voided' THEN 'VOIDED'
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    CASE WHEN s.status = 'completed' THEN 'PAID' ELSE 'UNPAID' END
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) <= 0 THEN 'UNPAID'
                WHEN GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) < COALESCE(s.total, 0) THEN 'BALANCE PENDING'
                ELSE 'PAID'
            END AS payment_status,
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL OR s.status = 'voided' THEN false
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    (s.status = 'completed')
                ELSE (GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) >= COALESCE(s.total, 0))
            END AS is_paid,
            CASE 
                WHEN s.invoice_revoked_at IS NOT NULL OR s.status = 'voided' THEN false
                WHEN NOT s.is_wholesale AND COALESCE(sp.payment_count, 0) = 0 THEN
                    (s.status = 'completed' AND COALESCE(s.total, 0) > 0)
                ELSE (GREATEST(0, COALESCE(sp.gross_cleared_paid, 0) - COALESCE(spr.returned_amount, 0)) > 0)
            END AS is_revenue_eligible,
            (s.invoice_revoked_at IS NOT NULL) AS is_revoked
        FROM raw_sales s
        LEFT JOIN LATERAL (
            SELECT 
                COUNT(sp_inner.id) AS payment_count,
                COALESCE(SUM(sp_inner.amount) FILTER (WHERE sp_inner.status = 'cleared'), 0) AS gross_cleared_paid,
                string_agg(DISTINCT sp_inner.payment_method, ' + ') FILTER (WHERE sp_inner.status = 'cleared') AS methods_agg
            FROM public.sale_payments sp_inner
            WHERE sp_inner.sale_id = s.id
        ) sp ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(spr_inner.amount), 0) AS returned_amount
            FROM public.sale_payment_reversals spr_inner
            WHERE spr_inner.sale_id = s.id
        ) spr ON true

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
            o.customer->>'company' AS customer_company,
            COALESCE(NULLIF(TRIM(o.customer->>'email'), ''), '—') AS customer_email,
            COALESCE(o.total, 0) AS total,
            COALESCE(NULLIF(TRIM(o.payment_details->>'method'), ''), 'online') AS payment_method,
            COALESCE(o.status, 'pending') AS status,
            'Online Store' AS source,
            CASE WHEN COALESCE(o.is_paid, false) THEN COALESCE(o.total, 0) ELSE 0 END AS gross_cleared_paid,
            0 AS returned_amount,
            CASE WHEN COALESCE(o.is_paid, false) THEN COALESCE(o.total, 0) ELSE 0 END AS cleared_paid,
            CASE WHEN COALESCE(o.is_paid, false) THEN 0 ELSE COALESCE(o.total, 0) END AS balance_due,
            CASE 
                WHEN o.status IN ('cancelled', 'voided') THEN 'VOIDED'
                WHEN COALESCE(o.is_paid, false) THEN 'PAID'
                ELSE 'UNPAID'
            END AS payment_status,
            COALESCE(o.is_paid, false) AS is_paid,
            (COALESCE(o.is_paid, false) = true AND COALESCE(o.status, 'pending') NOT IN ('cancelled', 'voided', 'returned', 'refunded')) AS is_revenue_eligible,
            false AS is_revoked
        FROM public.orders o
    ),
    filtered AS (
        SELECT c.*
        FROM combined c
        WHERE 
            -- Text Search
            (
                p_search = '' 
                OR c.receipt_number ILIKE v_search
                OR (c.invoice_number IS NOT NULL AND c.invoice_number ILIKE v_search)
                OR c.customer_name ILIKE v_search
                OR (c.customer_company IS NOT NULL AND c.customer_company ILIKE v_search)
                OR c.customer_email ILIKE v_search
            )
            -- Source / Channel Filter
            AND (
                p_source = 'All' 
                OR c.source ILIKE p_source
            )
            -- Payment Status Filter
            AND (
                p_payment_status = 'All'
                OR c.payment_status = UPPER(p_payment_status)
            )
            -- Order / Sale Status Filter
            AND (
                p_status = 'All'
                OR c.status ILIKE p_status
            )
            -- Payment Method Filter
            AND (
                p_payment_method = 'All'
                OR (c.payment_method IS NOT NULL AND c.payment_method ILIKE '%' || p_payment_method || '%')
            )
            -- Date Range Filter
            AND (p_date_from IS NULL OR c.date >= p_date_from)
            AND (p_date_to IS NULL OR c.date <= p_date_to)
            -- Amount Range Filter
            AND (p_min_amount IS NULL OR c.total >= p_min_amount)
            AND (p_max_amount IS NULL OR c.total <= p_max_amount)
    )
    SELECT 
        COALESCE(SUM(f.cleared_paid) FILTER (WHERE f.is_revenue_eligible), 0) AS total_revenue,
        COALESCE(SUM(f.cleared_paid) FILTER (WHERE f.is_revenue_eligible AND f.source = 'POS Terminal'), 0) AS pos_revenue,
        COALESCE(SUM(f.cleared_paid) FILTER (WHERE f.is_revenue_eligible AND f.source = 'Online Store'), 0) AS online_revenue,
        COUNT(f.id) FILTER (WHERE f.is_paid)::int AS paid_transactions,
        COUNT(f.id) FILTER (WHERE f.is_paid AND f.source = 'POS Terminal')::int AS paid_pos_transactions,
        COUNT(f.id) FILTER (WHERE f.is_paid AND f.source = 'Online Store')::int AS paid_online_transactions,
        COALESCE(SUM(f.balance_due) FILTER (WHERE NOT f.is_revoked AND f.status != 'voided'), 0) AS outstanding_amount,
        COUNT(f.id) FILTER (WHERE f.balance_due > 0 AND NOT f.is_revoked AND f.status != 'voided')::int AS outstanding_transactions,
        COALESCE(
            (SELECT COUNT(spr_all.id)::int FROM public.sale_payment_reversals spr_all),
            0
        ) AS returned_refunded_count,
        CASE 
            WHEN COUNT(f.id) FILTER (WHERE f.is_paid) > 0 THEN
                COALESCE(SUM(f.cleared_paid) FILTER (WHERE f.is_revenue_eligible) / COUNT(f.id) FILTER (WHERE f.is_paid), 0)
            ELSE 0
        END AS average_paid_transaction,
        COUNT(f.id)::int AS total_transactions
    FROM filtered f;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_unified_sales_metrics(text, text, text, text, text, timestamptz, timestamptz, numeric, numeric) TO service_role;
