import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function testSearch(search: string) {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  let query = s.from('orders').select('id', { count: 'exact' }).limit(1);
  
  // Try wrapping in double quotes
  query = query.or(`order_id.ilike."%${search}%",customer->>email.ilike."%${search}%"`);
  
  const sq = await query;
  console.log(`Search "${search}": Success: ${!sq.error}, Error: ${sq.error?.message || null}`);
}

async function run() {
  await testSearch(',');
  await testSearch('(');
  await testSearch(')');
  await testSearch('"');
}

run();
