CREATE OR REPLACE FUNCTION public.admin_get_unified_quotations(p_search text DEFAULT ''::text, p_status text DEFAULT 'All'::text, p_quote_type text DEFAULT 'all'::text, p_sort text DEFAULT 'newest'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, quote_number text, quote_type text, customer_name text, customer_company text, customer_email text, customer_phone text, customer_address text, subtotal numeric, tax_amount numeric, discount_amount numeric, discount_type text, discount_value numeric, total_amount numeric, valid_until timestamp with time zone, notes text, status text, created_at timestamp with time zone, updated_at timestamp with time zone, items_count integer, line_items_count integer, is_converted boolean, linked_sale_id uuid, linked_invoice_number text, linked_payment_status text, linked_invoice_revoked_at timestamp with time zone, total_count bigint)
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
            SELECT DISTINCT ON (q_ref)
                COALESCE(
                    s.invoice_snapshot->>'quote_number',
                    SUBSTRING(s.notes FROM 'Converted from Quotation #([^ ]+)')
                ) AS q_ref,
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
            FROM public.sales s
            LEFT JOIN sale_payment_agg spa ON spa.sale_id = s.id
            LEFT JOIN sale_reversal_agg sra ON sra.sale_id = s.id
            WHERE s.notes LIKE 'Converted from Quotation%' 
               OR s.invoice_snapshot->>'quote_number' IS NOT NULL
            ORDER BY q_ref, s.created_at DESC
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
                ls.invoice_revoked_at AS linked_invoice_revoked_at
            FROM public.quotations q
            LEFT JOIN linked_sales ls ON ls.q_ref = q.quote_number
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
                -- Status Filter
                AND (
                    p_status = 'All'
                    OR (p_status = 'draft' AND rq.status = 'draft' AND NOT rq.is_converted)
                    OR (p_status IN ('active', 'sent') AND rq.status IN ('active', 'sent') AND NOT rq.is_converted AND (rq.valid_until IS NULL OR rq.valid_until >= NOW()))
                    OR (p_status = 'accepted' AND rq.status = 'accepted' AND NOT rq.is_converted)
                    OR (p_status = 'converted' AND rq.is_converted)
                    OR (p_status = 'rejected' AND rq.status = 'rejected')
                    OR (p_status = 'expired' AND (rq.status = 'expired' OR (NOT rq.is_converted AND rq.status NOT IN ('rejected') AND rq.valid_until < NOW())))
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
            f.created_at,
            f.updated_at,
            f.items_count,
            f.line_items_count,
            f.is_converted,
            f.linked_sale_id,
            f.linked_invoice_number,
            f.linked_payment_status,
            f.linked_invoice_revoked_at,
            f.total_count
        FROM filtered f
        ORDER BY 
            CASE WHEN p_sort = 'oldest' THEN f.created_at END ASC,
            CASE WHEN p_sort <> 'oldest' THEN f.created_at END DESC
        LIMIT p_limit OFFSET p_offset;
    END;
    $function$
