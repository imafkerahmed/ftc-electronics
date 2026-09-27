import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

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

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP error: ${res.status} ${text}`);
    throw new Error(text);
  }
  return text;
}

async function main() {
  const sqlFile = path.resolve('supabase/migrations/20260924200000_payment_reversal_ledger.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('Applying migration 20260924200000_payment_reversal_ledger.sql...');
  const result = await runSql(sql);
  console.log('Result:', result);
  console.log('Migration successfully applied!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
