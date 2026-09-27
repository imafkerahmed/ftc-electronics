import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local' });
config({ path: '.env' });

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DIRECT_URL;
if (!dbUrl) {
  console.error('No direct DB url found');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function inspectQuotations() {
  await client.connect();
  console.log('=== INSPECTING QUOTATIONS IN POSTGRES DIRECTLY ===\n');

  // 1. Column info
  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotations'
    ORDER BY ordinal_position;
  `);
  console.log('Quotations columns:');
  console.table(columns.rows);

  // 2. Constraints
  const constraints = await client.query(`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'public.quotations'::regclass;
  `);
  console.log('\nQuotations constraints:');
  console.table(constraints.rows);

  // 3. Triggers
  const triggers = await client.query(`
    SELECT tgname, pg_get_triggerdef(oid) as def
    FROM pg_trigger
    WHERE tgrelid = 'public.quotations'::regclass;
  `);
  console.log('\nQuotations triggers:');
  console.table(triggers.rows);

  // 4. Function definitions for quotation-related RPCs
  const funcs = await client.query(`
    SELECT proname, pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname IN ('admin_get_unified_quotations', 'admin_get_unified_quotations_metrics', 'convert_quotation_to_sale_atomic');
  `);
  for (const f of funcs.rows) {
    console.log(`\n================ FUNCTION: ${f.proname} ================\n`);
    console.log(f.def);
  }

  // 5. Existing quotations data
  const quotes = await client.query(`
    SELECT id, quote_number, customer_name, customer_company, status, total_amount, valid_until, created_at, updated_at
    FROM public.quotations
    ORDER BY created_at DESC;
  `);
  console.log('\nExisting quotations:');
  console.table(quotes.rows);

  await client.end();
}

inspectQuotations().catch(err => {
  console.error(err);
  process.exit(1);
});
