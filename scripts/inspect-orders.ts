import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '.env.local'), override: true });

import { getAdminSupabase } from '../src/lib/supabase-admin';

async function main() {
  const supabase = getAdminSupabase();
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch orders:', error);
    return;
  }

  console.log(`Total orders in Supabase: ${orders?.length || 0}`);
  (orders || []).forEach((o: any, i: number) => {
    console.log(`\nOrder #${i + 1}:`);
    console.log(`  id: ${o.id}`);
    console.log(`  orderId: ${o.order_id}`);
    console.log(`  status: ${o.status}`);
    console.log(`  isPaid: ${o.is_paid}`);
    console.log(`  customer: ${JSON.stringify(o.customer)}`);
    console.log(`  user_id: ${o.user_id}`);
    console.log(`  items (${o.items?.length}):`, JSON.stringify(o.items, null, 2));
    console.log(`  created_at: ${o.created_at}`);
  });
}

main().catch(console.error);
