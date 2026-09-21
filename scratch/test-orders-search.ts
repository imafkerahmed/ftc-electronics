import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function testSearch(search: string) {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  let query = s.from('orders').select(`
        id,
        order_id,
        created_at,
        customer,
        total,
        status,
        is_paid,
        is_delivered,
        payment_details->method
      `, { count: 'exact' }).limit(10);
      
  if (search) {
    query = query.or(`order_id.ilike.%${search}%,customer->>email.ilike.%${search}%,customer->>name.ilike.%${search}%`);
  }
  
  const sq = await query;
  console.log(`Search "${search}": Success: ${!sq.error}, Total: ${sq.count || 0}, Error: ${sq.error?.message || null}`);
}

async function run() {
  await testSearch('');
  await testSearch('ORD-231500-060C');
  await testSearch('ORD-23');
  await testSearch('ord-23'); // case insensitive
  await testSearch('NONEXISTENT123');
  
  await testSearch('Afker'); // Customer name partial
  await testSearch('imafkerahmed@gmail.com'); // Customer email full
  await testSearch('gmail'); // Customer email partial
  
  // Special characters
  await testSearch("'");
  await testSearch("%");
  await testSearch("_");
  await testSearch(",");
  await testSearch("(");
  await testSearch(")");
}

run();
