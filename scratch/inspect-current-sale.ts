import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function inspectCurrentSale() {
  console.log('=== INSPECT CURRENT TEST SALE & QUOTATION ===\n');

  // Quotations
  const { data: quotes, error: qErr } = await supabase
    .from('quotations')
    .select('*');
  console.log('Quotations:', quotes);

  // Sales
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('*');
  console.log('\nSales:', sales);

  // Wholesale Dealers
  const { data: dealers } = await supabase
    .from('wholesale_dealers')
    .select('*');
  console.log('\nWholesale Dealers:', dealers);

  // Sale Items
  const { data: items } = await supabase
    .from('sale_items')
    .select('*');
  console.log('\nSale Items:', items);
}

inspectCurrentSale().catch(err => {
  console.error(err);
  process.exit(1);
});
