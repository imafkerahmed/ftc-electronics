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

async function inspectSalesColumns() {
  const query = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'sales'
    ORDER BY ordinal_position;
  `;

  const results = await runSql(query);
  console.log('PUBLIC.SALES COLUMNS:');
  console.table(results);
}

inspectSalesColumns();
