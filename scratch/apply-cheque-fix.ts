import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function runSql(sql: string) {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY!,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP error: ${res.status} ${text}`);
    throw new Error(text);
  }
  return text;
}

const fixChequesSql = `
DROP FUNCTION IF EXISTS public.admin_get_cheque_register(text, text, text, int, int);

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
            COALESCE(s.customer_company, s.invoice_snapshot->>'customer_company', wd.company_name) AS dealer_company,
            COALESCE(s.customer_name, wd.contact_name) AS dealer_contact,
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
                WHEN s.invoice_revoked_at IS NOT NULL THEN 'REVOKED'
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
                WHEN f.status = 'pending' AND f.cheque_date <= CURRENT_DATE THEN 1
                WHEN f.status = 'pending' THEN 2
                ELSE 3
            END
        END ASC,
        CASE WHEN p_sort = 'date_asc' THEN f.cheque_date END ASC,
        CASE WHEN p_sort = 'date_desc' THEN f.cheque_date END DESC,
        CASE WHEN p_sort = 'amount_desc' THEN f.amount END DESC,
        CASE WHEN p_sort = 'amount_asc' THEN f.amount END ASC,
        f.cheque_date ASC,
        f.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_cheque_register(TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_cheque_register(TEXT, TEXT, TEXT, INT, INT) TO service_role;
`;

async function main() {
  console.log('Applying Cheque Register SQL fixes...');
  const res = await runSql(fixChequesSql);
  console.log('Result:', res);
  console.log('Cheque register SQL successfully executed!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
