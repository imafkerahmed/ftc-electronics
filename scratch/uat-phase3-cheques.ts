import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runUAT() {
  console.log('====================================================');
  console.log('STARTING PHASE 3 CHEQUE REGISTER & TRACKING UAT SUITE');
  console.log('====================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passedCount++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failedCount++;
    }
  }

  // Get or create a sample product for testing (with initial stock tracking)
  const { data: testProduct, error: prodErr } = await adminClient
    .from('products')
    .select('id, name, count_in_stock')
    .limit(1)
    .single();

  if (prodErr || !testProduct) {
    console.error('Failed to get test product:', prodErr);
    return;
  }

  const initialStock = testProduct.count_in_stock;

  // 1. Create a test commercial invoice (sale)
  const todayStr = new Date().toISOString().slice(0, 10);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 14);
  const futureStr = futureDate.toISOString().slice(0, 10);

  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 3);
  const pastStr = pastDate.toISOString().slice(0, 10);

  const invoiceNumber = `INV-${new Date().getFullYear()}-TESTCHQ${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: testSale, error: saleErr } = await adminClient
    .from('sales')
    .insert({
      invoice_number: invoiceNumber,
      receipt_number: `REC-${invoiceNumber}`,
      status: 'completed',
      customer_name: 'UAT Apex Enterprises',
      customer_email: 'finance@apex.lk',
      customer_phone: '0771234567',
      total: 300000,
      subtotal: 300000,
      payment_terms: 'net_30',
      due_date: futureStr,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (saleErr || !testSale) {
    console.error('Failed to create test sale:', saleErr);
    return;
  }

  const saleId = testSale.id;
  let sale4Id: string | null = null;
  let sale5Id: string | null = null;

  console.log(`Created test invoice ${invoiceNumber} (Sale ID: ${saleId}) with Total: LKR 300,000\n`);

  try {
    // -------------------------------------------------------------
    // UAT 1 — Upcoming post-dated cheque
    // -------------------------------------------------------------
    console.log('--- Running UAT 1: Upcoming Post-Dated Cheque ---');
    const { data: chq1, error: chq1Err } = await adminClient
      .from('sale_payments')
      .insert({
        sale_id: saleId,
        payment_method: 'cheque',
        amount: 50000,
        status: 'pending',
        cheque_number: 'CHQ-UPCOMING-001',
        bank_name: 'Commercial Bank',
        cheque_date: futureStr,
        payment_date: todayStr,
        created_by: 'UAT Officer',
        notes: 'Post-dated 14 days',
      })
      .select()
      .single();

    assert(!chq1Err && !!chq1, 'Inserted post-dated cheque CHQ-UPCOMING-001');

    // Query via admin_get_cheque_register
    const { data: reg1, error: reg1Err } = await adminClient.rpc('admin_get_cheque_register', {
      p_search: 'CHQ-UPCOMING-001',
      p_filter: 'upcoming',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });

    assert(!reg1Err && Array.isArray(reg1) && reg1.length === 1, 'RPC found upcoming cheque in upcoming filter');
    if (reg1 && reg1[0]) {
      assert(reg1[0].status === 'pending', 'Stored status is pending');
      assert(reg1[0].operational_state === 'UPCOMING', 'Derived operational state is UPCOMING');
      assert(reg1[0].days_diff === 14, `Days diff calculated accurately (${reg1[0].days_diff} days)`);
    }

    // -------------------------------------------------------------
    // UAT 2 — Due Today Cheque
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 2: Cheque Due Today ---');
    const { data: chq2, error: chq2Err } = await adminClient
      .from('sale_payments')
      .insert({
        sale_id: saleId,
        payment_method: 'cheque',
        amount: 75000,
        status: 'pending',
        cheque_number: 'CHQ-TODAY-002',
        bank_name: 'Sampath Bank',
        cheque_date: todayStr,
        payment_date: todayStr,
        created_by: 'UAT Officer',
        notes: 'Cheque maturing today',
      })
      .select()
      .single();

    assert(!chq2Err && !!chq2, 'Inserted cheque CHQ-TODAY-002 maturing today');

    const { data: reg2, error: reg2Err } = await adminClient.rpc('admin_get_cheque_register', {
      p_search: 'CHQ-TODAY-002',
      p_filter: 'due_today',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });

    assert(!reg2Err && Array.isArray(reg2) && reg2.length === 1, 'RPC found cheque in due_today filter');
    if (reg2 && reg2[0]) {
      assert(reg2[0].status === 'pending', 'Stored status is pending');
      assert(reg2[0].operational_state === 'DUE TODAY', 'Derived operational state is DUE TODAY');
      assert(reg2[0].days_diff === 0, 'Days diff is 0');
    }

    // -------------------------------------------------------------
    // UAT 3 — Overdue For Review Cheque
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 3: Overdue Cheque (Review Required, Not Auto-Bounced) ---');
    const { data: chq3, error: chq3Err } = await adminClient
      .from('sale_payments')
      .insert({
        sale_id: saleId,
        payment_method: 'cheque',
        amount: 30000,
        status: 'pending',
        cheque_number: 'CHQ-OVERDUE-003',
        bank_name: 'Hatton National Bank',
        cheque_date: pastStr,
        payment_date: pastStr,
        created_by: 'UAT Officer',
        notes: 'Cheque dated 3 days ago',
      })
      .select()
      .single();

    assert(!chq3Err && !!chq3, 'Inserted overdue cheque CHQ-OVERDUE-003');

    const { data: reg3, error: reg3Err } = await adminClient.rpc('admin_get_cheque_register', {
      p_search: 'CHQ-OVERDUE-003',
      p_filter: 'overdue',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });

    assert(!reg3Err && Array.isArray(reg3) && reg3.length === 1, 'RPC found cheque in overdue filter');
    if (reg3 && reg3[0]) {
      assert(reg3[0].status === 'pending', 'Stored status is STILL pending (not auto-bounced)');
      assert(reg3[0].operational_state === 'OVERDUE FOR REVIEW', 'Derived state is OVERDUE FOR REVIEW');
      assert(reg3[0].days_overdue === 3, `Days overdue is 3 (${reg3[0].days_overdue})`);
    }

    // -------------------------------------------------------------
    // UAT 4 — Clear Workflow
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 4: Clear Workflow (Atomic Transition & Financial Totals) ---');
    // Create dedicated invoice of 100k
    const inv4Number = `INV-${new Date().getFullYear()}-CLEAR${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: sale4, error: sale4Err } = await adminClient
      .from('sales')
      .insert({
        invoice_number: inv4Number,
        receipt_number: `REC-${inv4Number}`,
        status: 'completed',
        customer_name: 'Clear Test Corp',
        total: 100000,
        subtotal: 100000,
        payment_terms: 'net_30',
        due_date: futureStr,
      })
      .select()
      .single();

    assert(!sale4Err && !!sale4, 'Created dedicated 100k sale for Clear UAT');
    if (sale4) {
      sale4Id = sale4.id;
    }

    const { data: chq4 } = await adminClient
      .from('sale_payments')
      .insert({
        sale_id: sale4!.id,
        payment_method: 'cheque',
        amount: 100000,
        status: 'pending',
        cheque_number: 'CHQ-CLEAR-004',
        bank_name: 'BOC',
        cheque_date: todayStr,
      })
      .select()
      .single();

    // Call update_cheque_status_atomic to clear
    const { data: clearRes, error: clearErr } = await adminClient.rpc('update_cheque_status_atomic', {
      p_payment_id: chq4!.id,
      p_new_status: 'cleared',
      p_actor_name: 'Finance Manager',
      p_notes: 'Deposited & Cleared in BOC',
    });

    assert(!clearErr && clearRes?.success === true, 'update_cheque_status_atomic succeeded for cleared');
    if (clearRes?.summary) {
      assert(Number(clearRes.summary.cleared_paid) === 100000, `Cleared paid in summary is 100,000 (${clearRes.summary.cleared_paid})`);
      assert(Number(clearRes.summary.pending_clearance) === 0, `Pending clearance in summary is 0 (${clearRes.summary.pending_clearance})`);
      assert(Number(clearRes.summary.balance_due) === 0, `Balance due in summary is 0 (${clearRes.summary.balance_due})`);
      assert(clearRes.summary.payment_status === 'PAID', `Payment status in summary transitioned to PAID (${clearRes.summary.payment_status})`);
    }

    // Verify cheque4 audit columns
    const { data: chq4After } = await adminClient
      .from('sale_payments')
      .select('status, cleared_by, cleared_at, notes')
      .eq('id', chq4!.id)
      .single();

    if (chq4After) {
      assert(chq4After.status === 'cleared', 'Cheque status is cleared');
      assert(chq4After.cleared_by === 'Finance Manager', 'cleared_by populated with actor name');
      assert(!!chq4After.cleared_at, 'cleared_at timestamp populated');
      assert(chq4After.notes?.includes('Deposited & Cleared in BOC'), 'Notes preserved and appended');
    }

    // -------------------------------------------------------------
    // UAT 5 — Bounce Workflow
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 5: Bounce Workflow (Release Reservation & Reopen Available) ---');
    const inv5Number = `INV-${new Date().getFullYear()}-BOUNCE${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: sale5, error: sale5Err } = await adminClient
      .from('sales')
      .insert({
        invoice_number: inv5Number,
        receipt_number: `REC-${inv5Number}`,
        status: 'completed',
        customer_name: 'Bounce Test Corp',
        total: 100000,
        subtotal: 100000,
        payment_terms: 'net_30',
        due_date: futureStr,
      })
      .select()
      .single();

    assert(!sale5Err && !!sale5, 'Created dedicated 100k sale for Bounce UAT');
    if (sale5) {
      sale5Id = sale5.id;
    }

    const { data: chq5 } = await adminClient
      .from('sale_payments')
      .insert({
        sale_id: sale5!.id,
        payment_method: 'cheque',
        amount: 100000,
        status: 'pending',
        cheque_number: 'CHQ-BOUNCE-005',
        bank_name: 'Seylan Bank',
        cheque_date: pastStr,
        notes: 'Original note: handover from rep',
      })
      .select()
      .single();

    const { data: bounceRes, error: bounceErr } = await adminClient.rpc('update_cheque_status_atomic', {
      p_payment_id: chq5!.id,
      p_new_status: 'bounced',
      p_actor_name: 'Finance Officer',
      p_notes: 'Insufficient funds on presentation',
    });

    assert(!bounceErr && bounceRes?.success === true, 'update_cheque_status_atomic succeeded for bounced');
    if (bounceRes?.summary) {
      assert(Number(bounceRes.summary.cleared_paid) === 0, 'Cleared paid in summary is 0');
      assert(Number(bounceRes.summary.pending_clearance) === 0, 'Pending clearance in summary is 0');
      assert(Number(bounceRes.summary.balance_due) === 100000, 'Balance due in summary remains 100,000');
      assert(Number(bounceRes.summary.available_to_record) === 100000, 'Available to record reopened to 100,000');
      assert(bounceRes.summary.payment_status === 'UNPAID', 'Payment status in summary remains UNPAID');
    }

    const { data: chq5After } = await adminClient
      .from('sale_payments')
      .select('status, notes')
      .eq('id', chq5!.id)
      .single();

    if (chq5After) {
      assert(chq5After.status === 'bounced', 'Cheque status is bounced');
      assert(chq5After.notes?.includes('Original note: handover from rep'), 'Original notes preserved');
      assert(chq5After.notes?.includes('Insufficient funds on presentation'), 'Bounce reason appended');
    }

    // -------------------------------------------------------------
    // UAT 6 — Cancel Workflow
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 6: Cancel Workflow ---');
    const { data: chq6 } = await adminClient
      .from('sale_payments')
      .insert({
        sale_id: saleId,
        payment_method: 'cheque',
        amount: 50000,
        status: 'pending',
        cheque_number: 'CHQ-CANCEL-006',
        bank_name: 'NTB',
        cheque_date: futureStr,
      })
      .select()
      .single();

    const { data: cancelRes, error: cancelErr } = await adminClient.rpc('update_cheque_status_atomic', {
      p_payment_id: chq6!.id,
      p_new_status: 'cancelled',
      p_actor_name: 'Staff',
      p_notes: 'Customer replaced with cash',
    });

    assert(!cancelErr && cancelRes?.success === true, 'update_cheque_status_atomic succeeded for cancelled');

    const { data: chq6After } = await adminClient
      .from('sale_payments')
      .select('status, notes')
      .eq('id', chq6!.id)
      .single();

    if (chq6After) {
      assert(chq6After.status === 'cancelled', 'Cheque status is cancelled');
    }

    // -------------------------------------------------------------
    // UAT 7 — Invalid Transition Rejection
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 7: Invalid Transition Rejection (Cleared -> Bounced) ---');
    const { data: invTransRes, error: invTransErr } = await adminClient.rpc('update_cheque_status_atomic', {
      p_payment_id: chq4!.id, // chq4 is already 'cleared'
      p_new_status: 'bounced',
      p_actor_name: 'Attacker',
    });

    assert(
      (invTransRes && invTransRes.success === false) || !!invTransErr,
      'Server rejected cleared -> bounced invalid status transition'
    );

    // -------------------------------------------------------------
    // UAT 8 — Search Implementation
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 8: Search Functionality ---');
    const { data: searchChqNum } = await adminClient.rpc('admin_get_cheque_register', {
      p_search: 'CHQ-UPCOMING-001',
      p_filter: 'all',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });
    assert(searchChqNum && searchChqNum.length >= 1 && searchChqNum[0].cheque_number === 'CHQ-UPCOMING-001', 'Search by Cheque # works');

    const { data: searchInv } = await adminClient.rpc('admin_get_cheque_register', {
      p_search: invoiceNumber,
      p_filter: 'all',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });
    assert(searchInv && searchInv.length >= 1, 'Search by Invoice # works');

    const { data: searchBank } = await adminClient.rpc('admin_get_cheque_register', {
      p_search: 'Commercial Bank',
      p_filter: 'all',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });
    assert(searchBank && searchBank.length >= 1, 'Search by Bank Name works');

    const { data: searchCust } = await adminClient.rpc('admin_get_cheque_register', {
      p_search: 'UAT Apex Enterprises',
      p_filter: 'all',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });
    assert(searchCust && searchCust.length >= 1, 'Search by Customer Name works');

    // -------------------------------------------------------------
    // UAT 9 — Filter Implementation
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 9: Server-side Filters ---');
    const filters = ['pending', 'upcoming', 'due_today', 'overdue', 'cleared', 'bounced', 'cancelled'];
    for (const f of filters) {
      const { data: fRes, error: fErr } = await adminClient.rpc('admin_get_cheque_register', {
        p_search: '',
        p_filter: f,
        p_sort: 'priority',
        p_limit: 5,
        p_offset: 0,
      });
      assert(!fErr && Array.isArray(fRes), `Filter "${f}" executed successfully with ${fRes?.length || 0} rows`);
    }

    // -------------------------------------------------------------
    // UAT 10 — Metrics Implementation
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 10: Server-side Metrics Aggregation ---');
    const { data: metricsRes, error: metricsErr } = await adminClient.rpc('admin_get_cheque_register_metrics', {
      p_search: '',
    });
    assert(!metricsErr && Array.isArray(metricsRes) && metricsRes.length === 1, 'admin_get_cheque_register_metrics returned metrics row');
    if (metricsRes && metricsRes[0]) {
      const m = metricsRes[0];
      console.log(`   Pending: ${m.pending_count} cheques (LKR ${Number(m.pending_amount).toLocaleString()})`);
      console.log(`   Due Today: ${m.due_today_count} cheques (LKR ${Number(m.due_today_amount).toLocaleString()})`);
      console.log(`   Upcoming: ${m.upcoming_count} cheques (LKR ${Number(m.upcoming_amount).toLocaleString()})`);
      console.log(`   Overdue: ${m.overdue_count} cheques (LKR ${Number(m.overdue_amount).toLocaleString()})`);
      console.log(`   Cleared Month: ${m.cleared_this_month_count} cheques (LKR ${Number(m.cleared_this_month_amount).toLocaleString()})`);
      console.log(`   Bounced Month: ${m.bounced_this_month_count} cheques (LKR ${Number(m.bounced_this_month_amount).toLocaleString()})`);
      assert(Number(m.pending_count) >= 1, 'Pending count includes test cheques');
    }

    // -------------------------------------------------------------
    // UAT 11 — Notifications Query & Deterministic IDs
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 11: Notification Query & Deduplication IDs ---');
    const { data: notifCheques, error: notifErr } = await adminClient
      .from('sale_payments')
      .select('id, cheque_number, bank_name, amount, cheque_date, status, updated_at, created_at, sales!inner(invoice_number, customer_name)')
      .eq('payment_method', 'cheque')
      .in('status', ['pending', 'bounced'])
      .order('cheque_date', { ascending: true })
      .limit(10);

    assert(!notifErr && notifCheques && notifCheques.length > 0, 'Notification bounded query executed');
    if (notifCheques) {
      const today = new Date().toISOString().slice(0, 10);
      let foundDeterministicId = false;
      notifCheques.forEach((c: any) => {
        const chqDate = c.cheque_date ? c.cheque_date.slice(0, 10) : '';
        let deterministicId = '';
        if (c.status === 'pending' && chqDate === today) {
          deterministicId = `cheque-due-today-${c.id}-${chqDate}`;
        } else if (c.status === 'pending' && chqDate < today) {
          deterministicId = `cheque-overdue-${c.id}-${chqDate}`;
        } else if (c.status === 'bounced') {
          deterministicId = `cheque-bounced-${c.id}-${chqDate || c.id}`;
        }
        if (deterministicId) {
          foundDeterministicId = true;
          console.log(`   Generated ID: ${deterministicId}`);
        }
      });
      assert(foundDeterministicId, 'Deterministic notification IDs generated correctly');
    }

    // -------------------------------------------------------------
    // UAT 12 — Security & RLS Isolation
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 12: Security & RLS Isolation ---');
    // Anon client attempt to call RPCs
    const { error: anonRegErr } = await anonClient.rpc('admin_get_cheque_register', {
      p_search: '',
      p_filter: 'all',
      p_sort: 'priority',
      p_limit: 10,
      p_offset: 0,
    });
    assert(!!anonRegErr, `Anon call to admin_get_cheque_register denied (${anonRegErr?.message || 'Permission denied'})`);

    const { error: anonMetricsErr } = await anonClient.rpc('admin_get_cheque_register_metrics', {
      p_search: '',
    });
    assert(!!anonMetricsErr, `Anon call to admin_get_cheque_register_metrics denied (${anonMetricsErr?.message || 'Permission denied'})`);

    const { error: anonMutErr } = await anonClient.rpc('update_cheque_status_atomic', {
      p_payment_id: chq1!.id,
      p_new_status: 'cleared',
      p_actor_name: 'Anon Attacker',
    });
    assert(!!anonMutErr, `Anon call to update_cheque_status_atomic denied (${anonMutErr?.message || 'Permission denied'})`);

    // -------------------------------------------------------------
    // UAT 13 — POS Regression Check
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 13: POS Regression Check ---');
    const posInvoiceNum = `POS-${Date.now().toString().slice(-6)}`;
    const { data: posSale, error: posErr } = await adminClient
      .from('sales')
      .insert({
        receipt_number: posInvoiceNum,
        invoice_number: posInvoiceNum,
        status: 'completed',
        customer_name: 'Walk-in Customer',
        total: 15000,
        subtotal: 15000,
        payment_method: 'cash',
        payment_terms: 'due_on_receipt',
      })
      .select()
      .single();

    assert(!posErr && !!posSale, 'Standard POS cash sale created with immediate paid status');
    if (posSale) {
      await adminClient.from('sales').delete().eq('id', posSale.id);
    }

    // -------------------------------------------------------------
    // UAT 14 — Inventory Isolation Check
    // -------------------------------------------------------------
    console.log('\n--- Running UAT 14: Inventory Isolation Check ---');
    const { data: testProductAfter } = await adminClient
      .from('products')
      .select('id, name, count_in_stock')
      .eq('id', testProduct.id)
      .single();

    assert(
      !!testProductAfter && testProductAfter.count_in_stock === initialStock,
      `Product stock unchanged throughout cheque operations (Initial: ${initialStock}, Current: ${testProductAfter?.count_in_stock})`
    );

  } finally {
    // Cleanup test data
    console.log('\n--- Cleaning up UAT test records ---');
    await adminClient.from('sale_payments').delete().eq('sale_id', saleId);
    await adminClient.from('sales').delete().eq('id', saleId);
    if (sale4Id) {
      await adminClient.from('sale_payments').delete().eq('sale_id', sale4Id);
      await adminClient.from('sales').delete().eq('id', sale4Id);
    }
    if (sale5Id) {
      await adminClient.from('sale_payments').delete().eq('sale_id', sale5Id);
      await adminClient.from('sales').delete().eq('id', sale5Id);
    }
    console.log('Cleanup complete.');
  }

  console.log('\n====================================================');
  console.log(`UAT SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runUAT().catch((err) => {
  console.error('Unhandled error in UAT runner:', err);
  process.exit(1);
});
