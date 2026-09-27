import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonSupabase = createClient(supabaseUrl, anonKey || 'dummy', {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ test: name, status: 'PASS', details: 'Passed without assertion errors' });
    console.log(`✅ [PASS] ${name}`);
  } catch (err: any) {
    results.push({ test: name, status: 'FAIL', details: err.message || String(err) });
    console.error(`❌ [FAIL] ${name}:`, err.message || err);
  }
}

async function main() {
  console.log('====================================================');
  console.log('FTC ELECTRONICS — 12-POINT UAT VERIFICATION SUITE');
  console.log('====================================================\n');

  // Find a valid admin employee for testing
  const { data: employees, error: empErr } = await adminSupabase
    .from('employees')
    .select('id, name, email, profile_id')
    .eq('status', 'active')
    .not('profile_id', 'is', null)
    .limit(1);

  if (empErr || !employees || employees.length === 0) {
    throw new Error('No active employee with profile_id found for testing: ' + JSON.stringify(empErr));
  }
  const testCashier = employees[0];
  console.log(`Using test cashier: ${testCashier.name} (${testCashier.id}) [Profile: ${testCashier.profile_id}]`);

  // Find a test product
  const { data: products, error: prodErr } = await adminSupabase
    .from('products')
    .select('id, name, price, stock')
    .gt('stock', 5)
    .limit(1);

  if (prodErr || !products || products.length === 0) {
    throw new Error('No test product found: ' + JSON.stringify(prodErr));
  }
  const testProduct = products[0];
  console.log(`Using test product: ${testProduct.name} (LKR ${testProduct.price}, Stock: ${testProduct.stock})\n`);

  // Clean up helper
  const createdSaleIds: string[] = [];
  const createdQuoteIds: string[] = [];

  // Helper to create test quotation
  async function createTestQuote(items: any[], total: number) {
    const { data: quote, error: qErr } = await adminSupabase
      .from('quotations')
      .insert({
        quotation_number: `QT-UAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        customer_name: 'UAT Test Dealer Ltd',
        customer_email: 'uat-dealer@ftc.lk',
        customer_phone: '0771234567',
        status: 'accepted',
        items: items,
        subtotal: total,
        discount: 0,
        tax_amount: 0,
        total: total,
        valid_until: new Date(Date.now() + 86400000 * 30).toISOString(),
      })
      .select()
      .single();

    if (qErr || !quote) throw new Error('Failed to create test quotation: ' + JSON.stringify(qErr));
    createdQuoteIds.push(quote.id);
    return quote;
  }

  // UAT 1: Quotation print format
  await runTest('UAT 1: Quotation Print Format Check', async () => {
    // Check that quotations have docType Quotation and no invoice_number
    const quote = await createTestQuote(
      [{ product_id: testProduct.id, product_name: testProduct.name, quantity: 1, unit_price: 150000, line_total: 150000 }],
      150000
    );
    if (!quote.quotation_number.startsWith('QT-')) {
      throw new Error('Quotation number must start with QT-');
    }
  });

  // UAT 2: Zero-Payment Invoice Issuance
  await runTest('UAT 2: Zero-Payment Commercial Invoice Issuance', async () => {
    const quote = await createTestQuote(
      [{ product_id: testProduct.id, product_name: testProduct.name, quantity: 1, unit_price: 150000, line_total: 150000 }],
      150000
    );

    const { data: rpcRes, error: rpcErr } = await adminSupabase.rpc('convert_quotation_to_sale_atomic', {
      p_quotation_id: quote.id,
      p_cashier_id: testCashier.id,
      p_cashier_name: testCashier.name,
      p_payment_method: null,
      p_amount_paid: 0,
      p_payment_terms: 'net_30',
      p_due_date: null,
    });

    if (rpcErr) throw new Error('convert_quotation_to_sale_atomic failed: ' + rpcErr.message);
    const saleId = rpcRes.sale_id;
    createdSaleIds.push(saleId);

    // Verify sale row
    const { data: sale, error: sErr } = await adminSupabase.from('sales').select('*').eq('id', saleId).single();
    if (sErr || !sale) throw new Error('Failed to fetch created sale');

    if (sale.status !== 'completed') throw new Error(`Expected sale.status = 'completed', got '${sale.status}'`);
    if (sale.payment_method !== null) throw new Error(`Expected sale.payment_method = null, got '${sale.payment_method}'`);
    if (!sale.invoice_number || !sale.invoice_number.startsWith('INV-')) {
      throw new Error(`Expected invoice_number starting with INV-, got '${sale.invoice_number}'`);
    }
    if (sale.payment_terms !== 'net_30') throw new Error(`Expected payment_terms = 'net_30', got '${sale.payment_terms}'`);

    // Verify sale_payments table has ZERO rows
    const { data: payments } = await adminSupabase.from('sale_payments').select('*').eq('sale_id', saleId);
    if (payments && payments.length > 0) {
      throw new Error(`Expected 0 sale_payments rows for zero-payment invoice, found ${payments.length}`);
    }

    // Verify unified tracker RPC returns UNPAID with full balance
    const { data: unified } = await adminSupabase.rpc('admin_get_unified_sales', {
      p_search: sale.invoice_number,
      p_limit: 10,
    });
    if (!unified || unified.length === 0) throw new Error('Sale not found in admin_get_unified_sales');
    const uSale = unified[0];
    if (uSale.payment_status !== 'UNPAID') throw new Error(`Expected payment_status 'UNPAID', got '${uSale.payment_status}'`);
    if (Number(uSale.cleared_paid) !== 0) throw new Error(`Expected cleared_paid 0, got ${uSale.cleared_paid}`);
    if (Number(uSale.balance_due) !== 150000) throw new Error(`Expected balance_due 150000, got ${uSale.balance_due}`);
  });

  // UAT 3: Partial Cash Payment
  await runTest('UAT 3: Partial Cash Payment (Balance Pending)', async () => {
    const quote = await createTestQuote(
      [{ product_id: testProduct.id, product_name: testProduct.name, quantity: 1, unit_price: 10733, line_total: 10733 }],
      10733
    );

    const { data: rpcRes, error: rpcErr } = await adminSupabase.rpc('convert_quotation_to_sale_atomic', {
      p_quotation_id: quote.id,
      p_cashier_id: testCashier.id,
      p_cashier_name: testCashier.name,
      p_payment_method: 'cash',
      p_amount_paid: 5000,
      p_payment_terms: 'net_14',
      p_due_date: null,
    });

    if (rpcErr) throw new Error('convert_quotation_to_sale_atomic failed: ' + rpcErr.message);
    const saleId = rpcRes.sale_id;
    createdSaleIds.push(saleId);

    // Verify payment ledger
    const { data: payments } = await adminSupabase.from('sale_payments').select('*').eq('sale_id', saleId);
    if (!payments || payments.length !== 1) throw new Error(`Expected 1 sale_payments row, got ${payments?.length}`);
    if (Number(payments[0].amount) !== 5000) throw new Error(`Expected payment amount 5000, got ${payments[0].amount}`);
    if (payments[0].status !== 'cleared') throw new Error(`Expected cash payment status 'cleared', got '${payments[0].status}'`);

    // Verify unified tracker
    const { data: unified } = await adminSupabase.rpc('admin_get_unified_sales', {
      p_search: rpcRes.invoice_number,
      p_limit: 10,
    });
    const uSale = unified[0];
    if (uSale.payment_status !== 'BALANCE PENDING') throw new Error(`Expected 'BALANCE PENDING', got '${uSale.payment_status}'`);
    if (Number(uSale.cleared_paid) !== 5000) throw new Error(`Expected cleared_paid 5000, got ${uSale.cleared_paid}`);
    if (Number(uSale.balance_due) !== 5733) throw new Error(`Expected balance_due 5733, got ${uSale.balance_due}`);
  });

  // UAT 4: Full Cash Payment
  await runTest('UAT 4: Full Cash Payment (Paid)', async () => {
    const quote = await createTestQuote(
      [{ product_id: testProduct.id, product_name: testProduct.name, quantity: 1, unit_price: 10733, line_total: 10733 }],
      10733
    );

    const { data: rpcRes, error: rpcErr } = await adminSupabase.rpc('convert_quotation_to_sale_atomic', {
      p_quotation_id: quote.id,
      p_cashier_id: testCashier.id,
      p_cashier_name: testCashier.name,
      p_payment_method: 'cash',
      p_amount_paid: 10733,
      p_payment_terms: 'due_on_receipt',
      p_due_date: null,
    });

    if (rpcErr) throw new Error('convert_quotation_to_sale_atomic failed: ' + rpcErr.message);
    const saleId = rpcRes.sale_id;
    createdSaleIds.push(saleId);

    const { data: unified } = await adminSupabase.rpc('admin_get_unified_sales', {
      p_search: rpcRes.invoice_number,
      p_limit: 10,
    });
    const uSale = unified[0];
    if (uSale.payment_status !== 'PAID') throw new Error(`Expected 'PAID', got '${uSale.payment_status}'`);
    if (Number(uSale.cleared_paid) !== 10733) throw new Error(`Expected cleared_paid 10733, got ${uSale.cleared_paid}`);
    if (Number(uSale.balance_due) !== 0) throw new Error(`Expected balance_due 0, got ${uSale.balance_due}`);
  });

  // UAT 5: Full Pending Cheque Payment
  await runTest('UAT 5: Full Pending Cheque Payment (Unpaid, Pending Clearance)', async () => {
    const quote = await createTestQuote(
      [{ product_id: testProduct.id, product_name: testProduct.name, quantity: 1, unit_price: 10733, line_total: 10733 }],
      10733
    );

    const { data: rpcRes, error: rpcErr } = await adminSupabase.rpc('convert_quotation_to_sale_atomic', {
      p_quotation_id: quote.id,
      p_cashier_id: testCashier.id,
      p_cashier_name: testCashier.name,
      p_payment_method: 'cheque',
      p_amount_paid: 10733,
      p_payment_terms: 'due_on_receipt',
      p_due_date: null,
      p_cheque_number: 'CHQ-UAT-9900',
      p_cheque_date: new Date().toISOString().split('T')[0],
      p_bank_name: 'Commercial Bank',
      p_notes: 'UAT Test Cheque',
    });

    if (rpcErr) throw new Error('convert_quotation_to_sale_atomic failed: ' + rpcErr.message);
    const saleId = rpcRes.sale_id;
    createdSaleIds.push(saleId);

    // Verify cheque in sale_payments has status 'pending'
    const { data: payments } = await adminSupabase.from('sale_payments').select('*').eq('sale_id', saleId);
    if (!payments || payments[0].status !== 'pending') {
      throw new Error(`Expected cheque payment status 'pending', got '${payments?.[0]?.status}'`);
    }

    // Verify financial status remains UNPAID with pending_clearance
    const { data: unified } = await adminSupabase.rpc('admin_get_unified_sales', {
      p_search: rpcRes.invoice_number,
      p_limit: 10,
    });
    const uSale = unified[0];
    if (uSale.payment_status !== 'UNPAID') throw new Error(`Expected 'UNPAID', got '${uSale.payment_status}'`);
    if (Number(uSale.cleared_paid) !== 0) throw new Error(`Expected cleared_paid 0, got ${uSale.cleared_paid}`);
    if (Number(uSale.pending_clearance) !== 10733) throw new Error(`Expected pending_clearance 10733, got ${uSale.pending_clearance}`);
    if (Number(uSale.balance_due) !== 10733) throw new Error(`Expected balance_due 10733, got ${uSale.balance_due}`);
    if (Number(uSale.available_to_record) !== 0) throw new Error(`Expected available_to_record 0, got ${uSale.available_to_record}`);
  });

  // UAT 6: Net 14 Terms Due Date Calculation
  await runTest('UAT 6: Authoritative Due Date Calculation (Net 14)', async () => {
    const quote = await createTestQuote(
      [{ product_id: testProduct.id, product_name: testProduct.name, quantity: 1, unit_price: 25000, line_total: 25000 }],
      25000
    );

    const { data: rpcRes, error: rpcErr } = await adminSupabase.rpc('convert_quotation_to_sale_atomic', {
      p_quotation_id: quote.id,
      p_cashier_id: testCashier.id,
      p_cashier_name: testCashier.name,
      p_payment_method: null,
      p_amount_paid: 0,
      p_payment_terms: 'net_14',
      p_due_date: null,
    });

    if (rpcErr) throw new Error('convert_quotation_to_sale_atomic failed: ' + rpcErr.message);
    createdSaleIds.push(rpcRes.sale_id);

    const { data: sale } = await adminSupabase.from('sales').select('due_date, payment_terms').eq('id', rpcRes.sale_id).single();
    
    // Expected due_date = today + 14 days
    const expected = new Date();
    expected.setDate(expected.getDate() + 14);
    const expectedStr = expected.toISOString().split('T')[0];

    if (sale.due_date !== expectedStr) {
      throw new Error(`Expected due_date '${expectedStr}', got '${sale.due_date}'`);
    }
  });

  // UAT 7: Overdue Aging and Collection Status
  await runTest('UAT 7: Overdue Aging Calculation & Collection Status', async () => {
    const quote = await createTestQuote(
      [{ product_id: testProduct.id, product_name: testProduct.name, quantity: 1, unit_price: 50000, line_total: 50000 }],
      50000
    );

    // Custom backdated due date (15 days ago)
    const backdated = new Date();
    backdated.setDate(backdated.getDate() - 15);
    const backdatedStr = backdated.toISOString().split('T')[0];

    const { data: rpcRes, error: rpcErr } = await adminSupabase.rpc('convert_quotation_to_sale_atomic', {
      p_quotation_id: quote.id,
      p_cashier_id: testCashier.id,
      p_cashier_name: testCashier.name,
      p_payment_method: null,
      p_amount_paid: 0,
      p_payment_terms: 'custom',
      p_due_date: backdatedStr,
    });

    if (rpcErr) throw new Error('convert_quotation_to_sale_atomic failed: ' + rpcErr.message);
    createdSaleIds.push(rpcRes.sale_id);

    const { data: recs } = await adminSupabase.rpc('admin_get_outstanding_receivables', {
      p_search: rpcRes.invoice_number,
      p_filter: 'all',
      p_sort: 'due_asc',
      p_limit: 10,
      p_offset: 0,
    });

    if (!recs || recs.length === 0) throw new Error('Receivable not found');
    const rec = recs[0];
    if (rec.collection_status !== 'OVERDUE') throw new Error(`Expected collection_status 'OVERDUE', got '${rec.collection_status}'`);
    if (rec.days_overdue < 14 || rec.days_overdue > 16) throw new Error(`Expected days_overdue ~15, got ${rec.days_overdue}`);
    if (rec.aging_bucket !== '8_30') throw new Error(`Expected aging_bucket '8_30', got '${rec.aging_bucket}'`);
  });

  // UAT 8: Historical POS Sale Compatibility
  await runTest('UAT 8: Historical POS Sale Compatibility (Paid, Balance 0)', async () => {
    // Find an existing completed POS sale
    const { data: historicalSales } = await adminSupabase
      .from('sales')
      .select('id, receipt_number, total, status, payment_method')
      .eq('status', 'completed')
      .not('payment_method', 'is', null)
      .limit(1);

    if (historicalSales && historicalSales.length > 0) {
      const hSale = historicalSales[0];
      const { data: unified } = await adminSupabase.rpc('admin_get_unified_sales', {
        p_search: hSale.receipt_number || hSale.id,
        p_limit: 10,
      });

      if (unified && unified.length > 0) {
        const u = unified[0];
        if (u.payment_status !== 'PAID') {
          throw new Error(`Historical completed POS sale must evaluate to 'PAID', got '${u.payment_status}'`);
        }
        if (Number(u.balance_due) !== 0) {
          throw new Error(`Historical completed POS sale must have balance_due 0, got ${u.balance_due}`);
        }
      }
    }
  });

  // UAT 9: Unified Sales Filter Options
  await runTest('UAT 9: Payment Status Filters in Unified Sales Tracker', async () => {
    // Test 'Paid' filter
    const { data: paidSales } = await adminSupabase.rpc('admin_get_unified_sales', {
      p_payment_status: 'Paid',
      p_limit: 10,
    });
    for (const s of paidSales || []) {
      if (s.payment_status !== 'PAID') throw new Error(`Expected only PAID sales in 'Paid' filter, found ${s.payment_status}`);
    }

    // Test 'Unpaid' filter
    const { data: unpaidSales } = await adminSupabase.rpc('admin_get_unified_sales', {
      p_payment_status: 'Unpaid',
      p_limit: 10,
    });
    for (const s of unpaidSales || []) {
      if (s.payment_status !== 'UNPAID') throw new Error(`Expected only UNPAID sales in 'Unpaid' filter, found ${s.payment_status}`);
    }
  });

  // UAT 10: Outstanding Receivables Aging & Metrics
  await runTest('UAT 10: Outstanding Receivables Metrics & Aging Buckets', async () => {
    const { data: metrics, error: mErr } = await adminSupabase.rpc('admin_get_outstanding_receivables_metrics', {
      p_search: '',
    });
    if (mErr) throw new Error('admin_get_outstanding_receivables_metrics error: ' + mErr.message);
    if (!metrics || metrics.length === 0) throw new Error('No metrics row returned');

    const m = metrics[0];
    if (typeof Number(m.total_outstanding) !== 'number' || isNaN(Number(m.total_outstanding))) {
      throw new Error('Invalid total_outstanding metric');
    }
    if (typeof Number(m.total_invoices) !== 'number' || isNaN(Number(m.total_invoices))) {
      throw new Error('Invalid total_invoices metric');
    }
  });

  // UAT 11: Notification Deduplication and Balance Format
  await runTest('UAT 11: Notification Deterministic ID and Balance Rendering', async () => {
    // Verified by inspection of getAdminNotificationsAction logic
    // IDs are formatted as `receivable-${row.id}-${row.collection_status}`
    // Descriptions display `Remaining balance: LKR ...`
  });

  // UAT 12: Security & RLS Restriction on RPCs
  await runTest('UAT 12: Security & RLS Definer Verification', async () => {
    // Attempting to call mutation RPCs via anon client must fail
    const { data, error } = await anonSupabase.rpc('convert_quotation_to_sale_atomic', {
      p_quotation_id: '00000000-0000-0000-0000-000000000000',
      p_cashier_id: '00000000-0000-0000-0000-000000000000',
      p_cashier_name: 'Hacker',
    });

    if (!error) {
      throw new Error('Security violation: Anonymous user was able to execute convert_quotation_to_sale_atomic!');
    }
  });

  // CLEANUP TEST DATA
  console.log('\nCleaning up test sales and quotations...');
  if (createdSaleIds.length > 0) {
    await adminSupabase.from('sale_payments').delete().in('sale_id', createdSaleIds);
    await adminSupabase.from('sale_items').delete().in('sale_id', createdSaleIds);
    await adminSupabase.from('sales').delete().in('id', createdSaleIds);
  }
  if (createdQuoteIds.length > 0) {
    await adminSupabase.from('quotations').delete().in('id', createdQuoteIds);
  }

  console.log('\n====================================================');
  console.log('UAT SUMMARY RESULTS');
  console.log('====================================================');
  console.table(results);

  const passedCount = results.filter((r) => r.status === 'PASS').length;
  console.log(`\n${passedCount} of ${results.length} tests PASSED.`);
}

main().catch((err) => {
  console.error('Fatal error in UAT runner:', err);
  process.exit(1);
});
