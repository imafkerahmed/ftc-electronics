import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });
config({ path: '.env' });

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DIRECT_URL;

if (!dbUrl) {
  console.error('No direct DB url found');
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

async function fullInspection() {
  console.log('=== FULL POSTGRESQL DIRECT AUDIT ===\n');

  // Tables & row counts
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log('Public tables found:', tables.map(t => t.table_name));

  for (const t of tables) {
    const countRes = await sql.unsafe(`SELECT count(*) as count FROM public."${t.table_name}"`);
    console.log(` - ${t.table_name}: ${countRes[0].count} rows`);
  }

  // Sequences
  console.log('\n--- SEQUENCES ---');
  const sequences = await sql`
    SELECT sequence_name, last_value, start_value, increment_by
    FROM information_schema.sequences
    WHERE sequence_schema = 'public';
  `;
  console.log('Sequences:', sequences);

  // Check any invoice/quotation sequence values or settings
  const invoiceSeq = await sql`
    SELECT * FROM information_schema.sequences WHERE sequence_name ILIKE '%invoice%' OR sequence_name ILIKE '%quote%' OR sequence_name ILIKE '%sale%' OR sequence_name ILIKE '%payment%';
  `;
  console.log('Matching sequence objects:', invoiceSeq);

  // Let's inspect products
  const products = await sql`SELECT id, name, sku, count_in_stock FROM public.products ORDER BY name`;
  console.log(`\nProducts in public.products: ${products.length}`);
  products.forEach(p => {
    console.log(` - [${p.sku || 'NO-SKU'}] ${p.name} (ID: ${p.id}): count_in_stock = ${p.count_in_stock}`);
  });

  await sql.end();
}

fullInspection();
