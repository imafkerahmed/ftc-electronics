import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/package.json');
const { createClient } = require('@supabase/supabase-js');
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
  const cleanQ = "a";
  const { data, error } = await supabase
    .from('wholesale_dealers')
    .select('id, company_name, contact_name, email, phone')
    .or(`company_name.ilike.%${cleanQ}%,contact_name.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`)
    .limit(20);
  console.log("Dealer Data:", data?.length);

  const { data: cData, error: cErr } = await supabase
    .from('customers')
    .select('id, name, email, phone')
    .or(`name.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`)
    .limit(20);
  console.log("Customer Data:", cData?.length);
}
test();
