import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

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

async function inspectFullDef() {
  const query = `
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname = 'admin_get_unified_sales';
  `;

  const results = await runSql(query);
  console.log('FULL DEFINITION OF admin_get_unified_sales:');
  console.log(results[0].def);
}

inspectFullDef();
