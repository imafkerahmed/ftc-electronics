import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runSql(sql: string) {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY!,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  return res.json();
}

async function inspectFunctions() {
  const query = `
    SELECT 
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args,
      pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname IN ('admin_get_unified_sales', 'convert_quotation_to_sale_atomic', 'admin_get_outstanding_receivables')
    ORDER BY p.proname;
  `;

  const results = await runSql(query);
  console.log('Functions found:', results.length);
  results.forEach((r: any) => {
    console.log(`\n======================================================`);
    console.log(`Function: ${r.proname}(${r.args})`);
    console.log(`======================================================`);
    console.log(r.def.slice(0, 500) + '...\n');
  });
}

inspectFunctions();
