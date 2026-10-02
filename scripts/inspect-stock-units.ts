import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '.env.local'), override: true });

import { getAdminSupabase } from '../src/lib/supabase-admin';

async function main() {
  const supabase = getAdminSupabase();
  const { data: units, error } = await supabase
    .from('stock_management')
    .select('*');

  if (error) {
    console.error('Failed to fetch stock units:', error);
    return;
  }

  console.log(`Total stock_management units in Supabase: ${units?.length || 0}`);
  (units || []).forEach((u: any, i: number) => {
    console.log(`\nUnit #${i + 1}:`);
    console.log(`  id: ${u.id}`);
    console.log(`  product: ${u.product_id}`);
    console.log(`  barcode: ${u.barcode}`);
    console.log(`  serialNumber: ${u.serial_number}`);
    console.log(`  status: ${u.status}`);
    console.log(`  orderId: ${u.order_id}`);
    console.log(`  created_at: ${u.created_at}`);
  });
}

main().catch(console.error);
