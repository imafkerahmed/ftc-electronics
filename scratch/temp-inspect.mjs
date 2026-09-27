import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/package.json');
const { createClient } = require('@supabase/supabase-js');
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);
async function inspectSchema() {
  const { data: cData, error: cErr } = await supabase.from('customers').select('*').limit(1);
  if (cErr) console.log('customers error:', cErr);
  else console.log('customers columns:', Object.keys(cData[0] || {}));

  const { data: dData, error: dErr } = await supabase.from('wholesale_dealers').select('*').limit(1);
  if (dErr) console.log('wholesale_dealers error:', dErr);
  else console.log('wholesale_dealers columns:', Object.keys(dData[0] || {}));

  // also profile for customers
  const { data: pData } = await supabase.from('profiles').select('*').limit(1);
  console.log('profiles columns:', Object.keys(pData[0] || {}));
}
inspectSchema();
