import { config } from 'dotenv';
config({ path: '.env.local' });
import { getAdminOrdersAction } from '../src/app/actions/admin';
import { createClient } from '@supabase/supabase-js';

async function run() {
  console.time('actionDuration');
  const res = await getAdminOrdersAction({ page: 1, pageSize: 10, search: 'ORD-23' });
  console.timeEnd('actionDuration');
  
  if (!res.success) {
    console.error('ACTION FAILED:', res.error);
  } else {
    console.log('Action SUCCESS!');
    console.log(`Total: ${res.total}, Returned: ${res.data.length}`);
    if (res.data.length > 0) {
      console.log('Sample order:', res.data[0]);
    }
  }

  // test raw supabase query
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  console.time('supabaseDuration');
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
  console.timeEnd('supabaseDuration');
  if (sq.error) {
    console.error('SUPABASE ERROR:', sq.error);
  } else {
    console.log('Supabase SUCCESS!');
  }
}

run();
