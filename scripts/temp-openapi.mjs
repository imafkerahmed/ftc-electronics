import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/';
  const res = await fetch(url, { headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY }});
  const data = await res.json();
  
  const schemas = data.definitions || data.components?.schemas;
  
  if (!schemas) {
    console.log('No schemas found!', data);
    return;
  }
  
  console.log('Available tables/views:', Object.keys(schemas));
  
  console.log('\n--- SALES SCHEMA (RAW JSON) ---');
  console.log(JSON.stringify(schemas['sales'] || schemas['pos_sales'] || schemas['pos_sale'], null, 2));
  
  console.log('\n--- ORDERS SCHEMA (RAW JSON) ---');
  console.log(JSON.stringify(schemas['orders'], null, 2));
}

run();
