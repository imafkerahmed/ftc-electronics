import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function checkPayments() {
  const { data } = await supabase.from('sale_payments').select('*');
  console.log('SALE PAYMENTS IN DB:', data);
}

checkPayments();
