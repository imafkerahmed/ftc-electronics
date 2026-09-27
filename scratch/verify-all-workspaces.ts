import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function comprehensivePostResetAudit() {
  console.log('=== COMPREHENSIVE POST-RESET WORKSPACE AUDIT ===\n');

  // 1. Table Counts
  const [
    { count: salesCount },
    { count: saleItemsCount },
    { count: paymentsCount },
    { count: reversalsCount },
    { count: quotationsCount },
    { count: ordersCount },
    { count: stockMgmtCount },
    { count: productsCount },
    { count: profilesCount },
    { count: customersCount },
    { count: dealersCount },
  ] = await Promise.all([
    supabase.from('sales').select('id', { count: 'exact', head: true }),
    supabase.from('sale_items').select('id', { count: 'exact', head: true }),
    supabase.from('sale_payments').select('id', { count: 'exact', head: true }),
    supabase.from('sale_payment_reversals').select('id', { count: 'exact', head: true }),
    supabase.from('quotations').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('stock_management').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase.from('wholesale_dealers').select('id', { count: 'exact', head: true }),
  ]);

  console.log('1. DATABASE ROW COUNTS:');
  console.log(`   • public.sales:                  ${salesCount}`);
  console.log(`   • public.sale_items:             ${saleItemsCount}`);
  console.log(`   • public.sale_payments:          ${paymentsCount}`);
  console.log(`   • public.sale_payment_reversals: ${reversalsCount}`);
  console.log(`   • public.quotations:             ${quotationsCount}`);
  console.log(`   • public.orders (Storefront):    ${ordersCount}`);
  console.log(`   • public.stock_management:       ${stockMgmtCount}`);
  console.log(`   • public.products (Catalog):     ${productsCount}`);
  console.log(`   • public.profiles:               ${profilesCount}`);
  console.log(`   • public.customers:              ${customersCount}`);
  console.log(`   • public.wholesale_dealers:      ${dealersCount}`);

  // 2. Inventory check across all 14 products
  console.log('\n2. INVENTORY SNAPSHOT (ALL 14 PRODUCTS):');
  const { data: products } = await supabase.from('products').select('id, name, count_in_stock, price').order('name');
  (products || []).forEach(p => {
    console.log(`   • ${p.name}: count_in_stock = ${p.count_in_stock} (Price: ${p.price})`);
  });

  // 3. Serialized inventory check
  console.log('\n3. SERIALIZED INVENTORY (stock_management):');
  const { data: serials } = await supabase.from('stock_management').select('id, serial_number, barcode, status, order_id, notes');
  (serials || []).forEach(s => {
    console.log(`   • SN: ${s.serial_number || 'N/A'} | Barcode: ${s.barcode} | Status: ${s.status} | OrderID: ${s.order_id || 'NONE'}`);
  });

  // 4. Receivables & Cheques RPC outputs
  console.log('\n4. WORKSPACES METRICS & LIVE QUERIES:');
  const { data: recRows } = await supabase.rpc('admin_get_outstanding_receivables', { p_collection_filter: 'all' });
  const { data: recMetrics } = await supabase.rpc('admin_get_outstanding_receivables_metrics');
  const { data: chqRows } = await supabase.rpc('admin_get_cheque_register', { p_status_filter: 'all' });
  const { data: salesMetrics } = await supabase.rpc('admin_get_unified_sales_metrics', { p_start_date: null, p_end_date: null });

  console.log(`   • Outstanding Receivables Rows: ${recRows?.length || 0}`);
  console.log(`   • Receivables Metrics:`, recMetrics);
  console.log(`   • Cheque Register Rows: ${chqRows?.length || 0}`);
  console.log(`   • Unified Sales Metrics:`, salesMetrics);

  // 5. Storefront orders check
  console.log('\n5. PRESERVED STOREFRONT ORDERS (public.orders):');
  const { data: orders } = await supabase.from('orders').select('id, order_id, status, is_paid, total, created_at').order('created_at', { ascending: false });
  (orders || []).forEach(o => {
    console.log(`   • Order ${o.order_id} (${o.id}): Status = ${o.status}, Paid = ${o.is_paid}, Total = ${o.total}, Created = ${o.created_at}`);
  });

  console.log('\n====================================================');
}

comprehensivePostResetAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
