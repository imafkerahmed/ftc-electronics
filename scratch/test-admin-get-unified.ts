import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function testRpc() {
  const { data: sales } = await supabase.from('sales').select('*');
  console.log('Raw sales in table:', sales);

  const { data: payments } = await supabase.from('sale_payments').select('*');
  console.log('Raw payments in table:', payments);

  const { data: unified, error } = await supabase.rpc('admin_get_unified_sales', {
    p_lifecycle: 'all',
    p_limit: 10,
    p_offset: 0,
  });

  if (error) console.error(error);
  console.log('Unified sales result:', unified);
}

testRpc();
