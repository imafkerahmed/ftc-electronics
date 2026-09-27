import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20260924180000_cheque_register_tracking.sql'),
    'utf-8'
  );

  console.log('Applying migration: 20260924180000_cheque_register_tracking.sql ...');

  const res = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.json();
  console.log('Migration result:', body);
}

main().catch(console.error);
