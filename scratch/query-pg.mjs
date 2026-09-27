import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function runQuery(sql) {
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Query error ${res.status}: ${text}`);
  }

  return await res.json();
}

async function main() {
  console.log('=== INSPECTING VIA SUPABASE /pg/query ===\n');

  // 1. Column info
  const cols = await runQuery(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotations'
    ORDER BY ordinal_position;
  `);
  console.log('Quotations columns:');
  console.table(cols);

  // 2. Constraints
  const constraints = await runQuery(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'public.quotations'::regclass;
  `);
  console.log('\nQuotations constraints:');
  console.table(constraints);

  // 3. Foreign keys referencing quotations or referenced by quotations
  const fks = await runQuery(`
    SELECT
      tc.table_schema, 
      tc.constraint_name, 
      tc.table_name, 
      kcu.column_name, 
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE (tc.table_name = 'quotations' OR ccu.table_name = 'quotations')
      AND tc.constraint_type = 'FOREIGN KEY';
  `);
  console.log('\nQuotation FKs:');
  console.table(fks);

  // 4. Function definitions for quotation-related RPCs
  const funcs = await runQuery(`
    SELECT proname, pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname IN ('admin_get_unified_quotations', 'admin_get_unified_quotations_metrics', 'convert_quotation_to_sale_atomic');
  `);
  for (const f of funcs) {
    console.log(`\n================ FUNCTION: ${f.proname} ================\n`);
    console.log(f.def);
  }

  // 5. Existing quotations data
  const quotes = await runQuery(`
    SELECT id, quote_number, customer_name, customer_company, status, total_amount, valid_until, created_at, updated_at
    FROM public.quotations
    ORDER BY created_at DESC;
  `);
  console.log('\nExisting quotations:');
  console.table(quotes);

  // 6. Check sales table for quotation_id
  const salesQuotes = await runQuery(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name ILIKE '%quote%';
  `);
  console.log('\nSales columns with quote:');
  console.table(salesQuotes);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
