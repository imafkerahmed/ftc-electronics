import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function inspectSalesColumns() {
  const { data } = await supabase.rpc('admin_get_unified_sales', { p_lifecycle: 'all', p_limit: 10, p_offset: 0 });
  console.log('admin_get_unified_sales result keys & sample:');
  console.log(data);
}

inspectSalesColumns();
