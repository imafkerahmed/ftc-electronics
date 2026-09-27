import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function inspectFirstRecord() {
  const { data } = await supabase.rpc('admin_get_unified_sales', { p_lifecycle: 'all', p_limit: 1, p_offset: 0 });
  console.log('FIRST UNIFIED SALES ROW:');
  console.log(JSON.stringify(data?.[0], null, 2));
}

inspectFirstRecord();
