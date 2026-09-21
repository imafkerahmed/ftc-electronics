import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

async function run() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // 1. Get a row to see what columns actually exist
  const { data: sampleOrder } = await s.from('orders').select('*').limit(1).single();
  if (sampleOrder) {
    console.log('Columns in orders table:', Object.keys(sampleOrder));
  }

  // 2. Test exact PostgREST select query from the code
  const sq = await s.from('orders').select(`
        id,
        order_id,
        created_at,
        customer,
        total,
        status,
        is_paid,
        is_delivered,
        payment_details->method
      `, { count: 'exact' }).limit(1);
      
  console.log('PostgREST select error:', sq.error);
  if (sq.data && sq.data.length > 0) {
    console.log('PostgREST returned sample:', sq.data[0]);
  }
}
run();
