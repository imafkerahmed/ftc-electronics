import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/package.json');
const { createClient } = require('@supabase/supabase-js');
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);
async function inspectSchema() {
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) console.log(error);
  else console.log(Object.keys(data[0]));
}
inspectSchema();
