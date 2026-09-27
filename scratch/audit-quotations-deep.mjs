import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  console.log('=== AUDITING POSTGRES SCHEMA FOR QUOTATIONS ===');

  // Let's use direct query or RPC to get column metadata, constraints, etc.
  // Check if we can execute pg query via rpc or check postgres info
  const { data: cols, error: colsErr } = await supabase.from('quotations').select('*').limit(1);
  console.log('Sample quotation row:', cols);

  // Check rows count and distribution of statuses in quotations
  const { data: allQuotes, error: quotesErr } = await supabase
    .from('quotations')
    .select('id, quote_number, status, total_amount, valid_until, created_at, user_id');
  console.log('Total quotations in DB:', allQuotes?.length);
  console.log('Quotations summary:', allQuotes);

  // Check sales table for quotation_id references
  const { data: salesWithQuotes, error: sqErr } = await supabase
    .from('sales')
    .select('id, invoice_number, receipt_number, quotation_id, sale_type, status, total_amount')
    .not('quotation_id', 'is', null);
  console.log('Sales linked to quotation_id:', salesWithQuotes);

  // Check audit_logs table
  const { data: auditLogs, error: alErr } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('entity_type', 'quotations')
    .limit(5);
  console.log('Audit logs for quotations:', auditLogs, alErr?.message);

  // Check audit_logs schema by inspecting one row
  const { data: anyLog } = await supabase.from('audit_logs').select('*').limit(1);
  console.log('Sample audit log row:', anyLog);
}

run();
