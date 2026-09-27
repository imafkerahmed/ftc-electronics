import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const adminSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: sales, error: sErr } = await adminSupabase
    .from('sales')
    .select('id, invoice_number, receipt_number, total, payment_method, status')
    .limit(5);

  console.log('Sample sales:', sales);

  if (sales && sales.length > 0) {
    const s = sales[0];
    const { data: res, error: rErr } = await adminSupabase.rpc('admin_get_unified_sales', {
      p_search: s.receipt_number || '',
      p_limit: 5,
    });
    console.log('RPC search by receipt_number result:', res, 'Error:', rErr);
  }
}

main().catch(console.error);
