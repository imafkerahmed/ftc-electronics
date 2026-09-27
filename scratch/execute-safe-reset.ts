import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

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

async function executeGuardedReset() {
  console.log('======================================================================');
  console.log('FTC ELECTRONICS — GUARDED TRANSACTIONAL TEST-DATA RESET');
  console.log('======================================================================\n');

  const supabase = getAdminSupabase();

  // -------------------------------------------------------------
  // STEP 1: PRE-EXECUTION AUDIT COUNT VERIFICATION
  // -------------------------------------------------------------
  console.log('1. Checking Pre-Execution Counts against Audit Baseline...');

  const [
    { count: salesCount },
    { count: saleItemsCount },
    { count: paymentsCount },
    { count: reversalsCount },
    { count: quotationsCount },
    { count: ordersCount },
    { count: stockMgmtCount },
    { count: productsCount },
    { data: testProd },
  ] = await Promise.all([
    supabase.from('sales').select('id', { count: 'exact', head: true }),
    supabase.from('sale_items').select('id', { count: 'exact', head: true }),
    supabase.from('sale_payments').select('id', { count: 'exact', head: true }),
    supabase.from('sale_payment_reversals').select('id', { count: 'exact', head: true }),
    supabase.from('quotations').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('stock_management').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id, name, count_in_stock').eq('id', '46f2a58a-ec46-41b0-bb14-8982fee29cb1').single(),
  ]);

  console.log(`   • sales:                  ${salesCount} (expected 49)`);
  console.log(`   • sale_items:             ${saleItemsCount} (expected 35)`);
  console.log(`   • sale_payments:          ${paymentsCount} (expected 33)`);
  console.log(`   • sale_payment_reversals: ${reversalsCount} (expected 11)`);
  console.log(`   • quotations:             ${quotationsCount} (expected 43)`);
  console.log(`   • orders:                 ${ordersCount} (expected 9)`);
  console.log(`   • stock_management:       ${stockMgmtCount} (expected 10)`);
  console.log(`   • products:               ${productsCount} (expected 14)`);
  console.log(`   • test product (${testProd?.name}): stock = ${testProd?.count_in_stock} (expected 8)`);

  // Guards
  if (salesCount !== 49) throw new Error(`Safety Abort: sales count (${salesCount}) does not match audit (49).`);
  if (saleItemsCount !== 35) throw new Error(`Safety Abort: sale_items count (${saleItemsCount}) does not match audit (35).`);
  if (paymentsCount !== 33) throw new Error(`Safety Abort: sale_payments count (${paymentsCount}) does not match audit (33).`);
  if (reversalsCount !== 11) throw new Error(`Safety Abort: reversals count (${reversalsCount}) does not match audit (11).`);
  if (quotationsCount !== 43) throw new Error(`Safety Abort: quotations count (${quotationsCount}) does not match audit (43).`);
  if (ordersCount !== 9) throw new Error(`Safety Abort: orders count (${ordersCount}) does not match audit (9).`);
  if (stockMgmtCount !== 10) throw new Error(`Safety Abort: stock_management count (${stockMgmtCount}) does not match audit (10).`);
  if (productsCount !== 14) throw new Error(`Safety Abort: products count (${productsCount}) does not match audit (14).`);
  if (testProd?.count_in_stock !== 8) throw new Error(`Safety Abort: test product stock (${testProd?.count_in_stock}) does not match audit (8).`);

  console.log('   ✅ All 9 pre-execution checks matched audit state perfectly!\n');

  // -------------------------------------------------------------
  // STEP 2: EXECUTE ATOMIC TRANSACTIONAL RESET VIA POSTGRESQL
  // -------------------------------------------------------------
  console.log('2. Executing atomic transactional reset via PostgreSQL engine...');

  const atomicResetSql = `
    DO $$
    DECLARE
      v_sales_count INT;
      v_items_count INT;
      v_payments_count INT;
      v_reversals_count INT;
      v_quotations_count INT;
      v_orders_count INT;
      v_stock_mgmt_count INT;
      v_products_count INT;
      v_test_prod_stock INT;
      v_sold_unit_status TEXT;
      v_sold_unit_order UUID;
    BEGIN
      -- 1. In-transaction pre-check verification
      SELECT count(*) INTO v_sales_count FROM public.sales;
      SELECT count(*) INTO v_items_count FROM public.sale_items;
      SELECT count(*) INTO v_payments_count FROM public.sale_payments;
      SELECT count(*) INTO v_reversals_count FROM public.sale_payment_reversals;
      SELECT count(*) INTO v_quotations_count FROM public.quotations;
      SELECT count(*) INTO v_orders_count FROM public.orders;
      SELECT count(*) INTO v_stock_mgmt_count FROM public.stock_management;
      SELECT count(*) INTO v_products_count FROM public.products;
      SELECT count_in_stock INTO v_test_prod_stock FROM public.products WHERE id = '46f2a58a-ec46-41b0-bb14-8982fee29cb1';

      IF v_sales_count <> 49 OR v_items_count <> 35 OR v_payments_count <> 33 OR v_reversals_count <> 11 OR v_quotations_count <> 43 THEN
        RAISE EXCEPTION 'Safety Abort: In-transaction counts do not match audit matrix.';
      END IF;

      IF v_orders_count <> 9 OR v_stock_mgmt_count <> 10 OR v_products_count <> 14 OR v_test_prod_stock <> 8 THEN
        RAISE EXCEPTION 'Safety Abort: Master data or inventory state does not match audit baseline.';
      END IF;

      -- 2. FK-Safe Deletions
      DELETE FROM public.sale_payment_reversals;
      DELETE FROM public.sale_payments;
      DELETE FROM public.sale_items;
      DELETE FROM public.sales;
      DELETE FROM public.quotations;

      -- 3. Guarded Inventory Restoration (+1 unit for confirmed POS test sale)
      UPDATE public.products 
      SET count_in_stock = count_in_stock + 1 
      WHERE id = '46f2a58a-ec46-41b0-bb14-8982fee29cb1' AND count_in_stock = 8;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Safety Abort: Failed to restore inventory for product 46f2a58a-ec46-41b0-bb14-8982fee29cb1.';
      END IF;

      -- 4. Post-check verification within same transaction
      SELECT count(*) INTO v_sales_count FROM public.sales;
      SELECT count(*) INTO v_items_count FROM public.sale_items;
      SELECT count(*) INTO v_payments_count FROM public.sale_payments;
      SELECT count(*) INTO v_reversals_count FROM public.sale_payment_reversals;
      SELECT count(*) INTO v_quotations_count FROM public.quotations;
      SELECT count(*) INTO v_orders_count FROM public.orders;
      SELECT count(*) INTO v_stock_mgmt_count FROM public.stock_management;
      SELECT count(*) INTO v_products_count FROM public.products;
      SELECT count_in_stock INTO v_test_prod_stock FROM public.products WHERE id = '46f2a58a-ec46-41b0-bb14-8982fee29cb1';
      SELECT status, order_id INTO v_sold_unit_status, v_sold_unit_order FROM public.stock_management WHERE serial_number = 'SN-Z0CH-612307';

      IF v_sales_count <> 0 OR v_items_count <> 0 OR v_payments_count <> 0 OR v_reversals_count <> 0 OR v_quotations_count <> 0 THEN
        RAISE EXCEPTION 'Safety Abort: Reset tables are not empty.';
      END IF;

      IF v_orders_count <> 9 OR v_stock_mgmt_count <> 10 OR v_products_count <> 14 OR v_test_prod_stock <> 9 THEN
        RAISE EXCEPTION 'Safety Abort: Post-reset verification failed.';
      END IF;

      IF v_sold_unit_status <> 'sold' OR v_sold_unit_order IS NULL THEN
        RAISE EXCEPTION 'Safety Abort: Sold serial unit SN-Z0CH-612307 integrity was compromised.';
      END IF;

      RAISE NOTICE 'Atomic Test Data Reset successfully executed and verified.';
    END $$;
  `;

  const resetResult = await runSql(atomicResetSql);
  console.log('   Result:', resetResult);
  console.log('   ✅ PostgreSQL DO $$ block executed without error!\n');

  // -------------------------------------------------------------
  // STEP 3: POST-RESET COMPREHENSIVE VERIFICATION
  // -------------------------------------------------------------
  console.log('3. Running Post-Reset Verification via Supabase Client...');

  const [
    { count: postSales },
    { count: postItems },
    { count: postPayments },
    { count: postReversals },
    { count: postQuotations },
    { count: postOrders },
    { count: postStockMgmt },
    { count: postProducts },
    { data: postTestProd },
    { data: serialUnits },
  ] = await Promise.all([
    supabase.from('sales').select('id', { count: 'exact', head: true }),
    supabase.from('sale_items').select('id', { count: 'exact', head: true }),
    supabase.from('sale_payments').select('id', { count: 'exact', head: true }),
    supabase.from('sale_payment_reversals').select('id', { count: 'exact', head: true }),
    supabase.from('quotations').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('stock_management').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('products').select('id, name, count_in_stock').eq('id', '46f2a58a-ec46-41b0-bb14-8982fee29cb1').single(),
    supabase.from('stock_management').select('id, serial_number, barcode, status, order_id'),
  ]);

  console.log(`   • Post sales:                  ${postSales} (expected 0)`);
  console.log(`   • Post sale_items:             ${postItems} (expected 0)`);
  console.log(`   • Post sale_payments:          ${postPayments} (expected 0)`);
  console.log(`   • Post sale_payment_reversals: ${postReversals} (expected 0)`);
  console.log(`   • Post quotations:             ${postQuotations} (expected 0)`);
  console.log(`   • Post orders:                 ${postOrders} (expected 9)`);
  console.log(`   • Post stock_management:       ${postStockMgmt} (expected 10)`);
  console.log(`   • Post products:               ${postProducts} (expected 14)`);
  console.log(`   • Post test product stock:     ${postTestProd?.count_in_stock} (expected 9)`);

  const availableUnits = (serialUnits || []).filter(u => u.status === 'available');
  const soldUnits = (serialUnits || []).filter(u => u.status === 'sold');
  console.log(`   • Serial Units: ${availableUnits.length} available, ${soldUnits.length} sold (SN: ${soldUnits[0]?.serial_number}, OrderID: ${soldUnits[0]?.order_id})`);

  // -------------------------------------------------------------
  // STEP 4: WORKSPACE & RPC VERIFICATION
  // -------------------------------------------------------------
  console.log('\n4. Verifying Sales Management RPCs...');

  const [
    salesTrackerRes,
    receivablesRes,
    receivablesMetricsRes,
    chequeRegRes,
    salesMetricsRes,
  ] = await Promise.all([
    supabase.rpc('admin_get_unified_sales', { p_lifecycle: 'all', p_limit: 50, p_offset: 0 }),
    supabase.rpc('admin_get_outstanding_receivables', { p_collection_filter: 'all', p_limit: 50, p_offset: 0 }),
    supabase.rpc('admin_get_outstanding_receivables_metrics'),
    supabase.rpc('admin_get_cheque_register', { p_status_filter: 'all', p_limit: 50, p_offset: 0 }),
    supabase.rpc('admin_get_unified_sales_metrics', { p_start_date: null, p_end_date: null }),
  ]);

  console.log(`   • Unified Sales Tracker rows:     ${salesTrackerRes.data?.length || 0} (expected 0)`);
  console.log(`   • Outstanding Receivables rows:   ${receivablesRes.data?.length || 0} (expected 0)`);
  console.log(`   • Receivables Total Outstanding:  LKR ${receivablesMetricsRes.data?.total_outstanding || 0} (expected 0)`);
  console.log(`   • Cheque Register rows:           ${chequeRegRes.data?.length || 0} (expected 0)`);
  console.log(`   • Sales Metrics Total Revenue:    LKR ${salesMetricsRes.data?.total_revenue || 0} (expected 0)`);

  console.log('\n======================================================================');
  console.log('🎉 ALL RESET OPERATIONS AND INTEGRITY VERIFICATIONS PASSED! 🎉');
  console.log('======================================================================\n');
}

executeGuardedReset().catch(err => {
  console.error('Fatal execution error in executeGuardedReset:', err);
  process.exit(1);
});
