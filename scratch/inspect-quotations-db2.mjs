import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/package.json');
const { createClient } = require('@supabase/supabase-js');
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);
async function inspectSchema() {
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'quotations' });
  if (error) {
     const { data: d2 } = await supabase.from('quotations').select('*').limit(10);
     const keys = new Set();
     d2.forEach(row => Object.keys(row).forEach(k => keys.add(k)));
     console.log(Array.from(keys));
  }
}
inspectSchema();
