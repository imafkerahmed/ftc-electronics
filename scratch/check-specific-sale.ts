import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function checkSpecificSale() {
  const { data } = await supabase.rpc('admin_get_unified_sales', {
    p_search: '598AE575',
    p_lifecycle: 'all',
  });
  console.log('Result for 598AE575:');
  console.log(JSON.stringify(data, null, 2));
}

checkSpecificSale();
