import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false }});

async function run() {
  const { data: sales, error: sErr } = await supabase.from('sales').select('*').limit(1);
  console.log('--- SALES SCHEMA ---');
  if (sErr) console.error(sErr);
  else console.log(Object.keys(sales[0] || {}).join(', '));
  console.log('Sample:', sales[0]);

  const { data: orders, error: oErr } = await supabase.from('orders').select('*').limit(1);
  console.log('\n--- ORDERS SCHEMA ---');
  if (oErr) console.error(oErr);
  else console.log(Object.keys(orders[0] || {}).join(', '));
  console.log('Sample:', orders[0]);
}

run();
