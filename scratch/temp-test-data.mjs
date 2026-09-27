import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/package.json');
const { createClient } = require('@supabase/supabase-js');
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
  const { data: cData } = await supabase.from('customers').select('*').limit(2);
  console.log("Customer Rows:", cData);

  const { data: dData } = await supabase.from('wholesale_dealers').select('*').limit(2);
  console.log("Dealer Rows:", dData);
}
test();
