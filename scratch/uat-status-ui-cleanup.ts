import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface UATResult {
  step: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: UATResult[] = [];

function record(step: number, name: string, passed: boolean, details: string) {
  results.push({ step, name, passed, details });
  const badge = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n[UAT ${step.toString().padStart(2, '0')}] ${badge} - ${name}`);
  console.log(`       Details: ${details}`);
}

async function run() {
  console.log('====================================================');
  console.log('  STARTING STATUS & PAYMENT UI CLEANUP 10-POINT UAT  ');
  console.log('====================================================\n');

  // -------------------------------------------------------------
  // UAT 1: Wholesale invoice — zero payment
  // Expected UNPAID / ACTIVE
  // -------------------------------------------------------------
  try {
    const invNum1 = `INV-UAT-ZERO-${Date.now().toString().slice(-6)}`;
    const { data: s1 } = await adminClient.from('sales').insert({
      receipt_number: `REC-${invNum1}`,
      invoice_number: invNum1,
      total: 25000,
      subtotal: 25000,
      status: 'completed',
      customer_name: 'Zero Payment Dealer',
      payment_method: null
    }).select().single();

    const { data: unified1 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: invNum1
    });
    const row1 = unified1?.[0];

    const passed1 = row1 && row1.payment_status === 'UNPAID' && row1.balance_due === 25000 && row1.cleared_paid === 0 && row1.payment_method === null;
    record(1, 'Wholesale invoice zero payment resolves to UNPAID without false method', !!passed1,
      `PaymentStatus: ${row1?.payment_status}, BalanceDue: ${row1?.balance_due}, Method: ${row1?.payment_method}`);
  } catch (err: any) {
    record(1, 'Wholesale zero payment', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 2: Wholesale invoice — partial payment
  // Expected BALANCE PENDING / ACTIVE
  // -------------------------------------------------------------
  try {
    const invNum2 = `INV-UAT-PART-${Date.now().toString().slice(-6)}`;
    const { data: s2 } = await adminClient.from('sales').insert({
      receipt_number: `REC-${invNum2}`,
      invoice_number: invNum2,
      total: 30000,
      subtotal: 30000,
      status: 'completed',
      customer_name: 'Partial Dealer'
    }).select().single();

    await adminClient.rpc('record_sale_payment_atomic', {
      p_sale_id: s2.id,
      p_amount: 10000,
      p_payment_method: 'bank_transfer',
      p_created_by: 'UAT Admin'
    });

    const { data: unified2 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: invNum2
    });
    const row2 = unified2?.[0];

    const passed2 = row2 && row2.payment_status === 'BALANCE PENDING' && row2.cleared_paid === 10000 && row2.balance_due === 20000 && row2.payment_method === 'bank_transfer';
    record(2, 'Wholesale invoice partial payment resolves to BALANCE PENDING', !!passed2,
      `PaymentStatus: ${row2?.payment_status}, ClearedPaid: ${row2?.cleared_paid}, BalanceDue: ${row2?.balance_due}, Method: ${row2?.payment_method}`);
  } catch (err: any) {
    record(2, 'Wholesale partial payment', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 3: Wholesale invoice — fully paid
  // Expected PAID / ACTIVE
  // -------------------------------------------------------------
  try {
    const invNum3 = `INV-UAT-PAID-${Date.now().toString().slice(-6)}`;
    const { data: s3 } = await adminClient.from('sales').insert({
      receipt_number: `REC-${invNum3}`,
      invoice_number: invNum3,
      total: 45000,
      subtotal: 45000,
      status: 'completed',
      customer_name: 'Full Paid Dealer'
    }).select().single();

    await adminClient.rpc('record_sale_payment_atomic', {
      p_sale_id: s3.id,
      p_amount: 45000,
      p_payment_method: 'cash',
      p_created_by: 'UAT Admin'
    });

    const { data: unified3 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: invNum3
    });
    const row3 = unified3?.[0];

    const passed3 = row3 && row3.payment_status === 'PAID' && row3.cleared_paid === 45000 && row3.balance_due === 0 && row3.payment_method === 'cash';
    record(3, 'Wholesale invoice fully paid resolves to PAID with ledger method', !!passed3,
      `PaymentStatus: ${row3?.payment_status}, ClearedPaid: ${row3?.cleared_paid}, BalanceDue: ${row3?.balance_due}, Method: ${row3?.payment_method}`);
  } catch (err: any) {
    record(3, 'Wholesale full payment', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 4: Wholesale invoice — revoked
  // Expected REVOKED
  // -------------------------------------------------------------
  try {
    const invNum4 = `INV-UAT-REV-${Date.now().toString().slice(-6)}`;
    const { data: s4 } = await adminClient.from('sales').insert({
      receipt_number: `REC-${invNum4}`,
      invoice_number: invNum4,
      total: 50000,
      subtotal: 50000,
      status: 'completed',
      customer_name: 'Revoke Test Dealer'
    }).select().single();

    await adminClient.rpc('revoke_invoice_atomic', {
      p_sale_id: s4.id,
      p_reason: 'CUSTOMER_CANCELLED',
      p_revoked_by: 'UAT Admin'
    });

    const { data: unified4 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: invNum4,
      p_lifecycle: 'all'
    });
    const row4 = unified4?.[0];

    const passed4 = row4 && row4.is_revoked && row4.payment_status === 'REVOKED' && row4.payment_method === null;
    record(4, 'Wholesale invoice revoked resolves to REVOKED without false payment text', !!passed4,
      `IsRevoked: ${row4?.is_revoked}, PaymentStatus: ${row4?.payment_status}, Method: ${row4?.payment_method}`);
  } catch (err: any) {
    record(4, 'Wholesale revoked', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 5: POS cash sale
  // Expected authoritative PAID + COMPLETED
  // -------------------------------------------------------------
  try {
    const posNum5 = `POS-COUNTER-${Date.now().toString().slice(-6)}`;
    const { data: s5 } = await adminClient.from('sales').insert({
      receipt_number: posNum5,
      total: 5000,
      subtotal: 5000,
      status: 'completed',
      payment_method: 'cash',
      customer_name: 'Walk-in Customer'
    }).select().single();

    const { data: unified5 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: posNum5
    });
    const row5 = unified5?.[0];

    const passed5 = row5 && row5.source === 'POS Terminal' && row5.payment_status === 'PAID' && row5.cleared_paid === 5000 && row5.balance_due === 0 && row5.payment_method === 'cash' && row5.status === 'completed' && row5.is_revenue_eligible === true;
    record(5, 'POS cash sale resolves authoritatively to PAID + COMPLETED + Revenue Eligible', !!passed5,
      `Source: ${row5?.source}, Status: ${row5?.status}, PaymentStatus: ${row5?.payment_status}, ClearedPaid: ${row5?.cleared_paid}, BalanceDue: ${row5?.balance_due}, Method: ${row5?.payment_method}, RevenueEligible: ${row5?.is_revenue_eligible}`);
  } catch (err: any) {
    record(5, 'POS cash sale', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 6: POS void
  // Expected VOIDED
  // -------------------------------------------------------------
  try {
    const posNum6 = `POS-VOID-${Date.now().toString().slice(-6)}`;
    const { data: s6 } = await adminClient.from('sales').insert({
      receipt_number: posNum6,
      total: 8000,
      subtotal: 8000,
      status: 'voided',
      payment_method: 'cash',
      customer_name: 'Walk-in Customer'
    }).select().single();

    const { data: unified6 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: posNum6,
      p_lifecycle: 'all'
    });
    const row6 = unified6?.[0];

    const passed6 = row6 && row6.source === 'POS Terminal' && row6.payment_status === 'VOIDED' && row6.status === 'voided' && row6.cleared_paid === 0 && row6.is_revenue_eligible === false;
    record(6, 'POS void resolves to VOIDED status and zero revenue contribution', !!passed6,
      `Status: ${row6?.status}, PaymentStatus: ${row6?.payment_status}, RevenueEligible: ${row6?.is_revenue_eligible}`);
  } catch (err: any) {
    record(6, 'POS void', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 7: Online Store order
  // Existing lifecycle unaffected
  // -------------------------------------------------------------
  try {
    const onlNum7 = `FTC-ONL-${Date.now().toString().slice(-6)}`;
    const { data: s7 } = await adminClient.from('orders').insert({
      order_id: onlNum7,
      total: 12500,
      subtotal: 12500,
      status: 'shipped',
      is_paid: true,
      payment_details: { method: 'card' },
      customer: { name: 'E-commerce Shopper', email: 'shopper@example.com' }
    }).select().single();

    const { data: unified7 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: onlNum7
    });
    const row7 = unified7?.[0];

    const passed7 = row7 && row7.source === 'Online Store' && row7.status === 'shipped' && row7.payment_status === 'PAID' && row7.is_paid === true;
    record(7, 'Online Store order preserves e-commerce lifecycle and payment status', !!passed7,
      `Source: ${row7?.source}, Status: ${row7?.status}, PaymentStatus: ${row7?.payment_status}, IsPaid: ${row7?.is_paid}`);
  } catch (err: any) {
    record(7, 'Online Store order', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 8: Pending cheque invoice
  // Must not appear PAID
  // -------------------------------------------------------------
  try {
    const invNum8 = `INV-UAT-CHQ-${Date.now().toString().slice(-6)}`;
    const { data: s8 } = await adminClient.from('sales').insert({
      receipt_number: `REC-${invNum8}`,
      invoice_number: invNum8,
      total: 70000,
      subtotal: 70000,
      status: 'completed',
      customer_name: 'Cheque Pending Dealer'
    }).select().single();

    await adminClient.rpc('record_sale_payment_atomic', {
      p_sale_id: s8.id,
      p_amount: 70000,
      p_payment_method: 'cheque',
      p_cheque_number: `CHQ-PEND-${Date.now().toString().slice(-4)}`,
      p_bank_name: 'Commercial Bank',
      p_cheque_date: '2026-11-15',
      p_created_by: 'UAT Admin'
    });

    const { data: unified8 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: invNum8
    });
    const row8 = unified8?.[0];

    const passed8 = row8 && row8.payment_status === 'UNPAID' && row8.pending_clearance === 70000 && row8.cleared_paid === 0 && row8.is_paid === false;
    record(8, 'Pending cheque invoice does not appear PAID (remains UNPAID / Pending)', !!passed8,
      `PaymentStatus: ${row8?.payment_status}, PendingClearance: ${row8?.pending_clearance}, ClearedPaid: ${row8?.cleared_paid}, IsPaid: ${row8?.is_paid}`);
  } catch (err: any) {
    record(8, 'Pending cheque', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 9: Cleared cheque completes balance
  // Must become PAID
  // -------------------------------------------------------------
  try {
    const invNum9 = `INV-UAT-CLR-${Date.now().toString().slice(-6)}`;
    const { data: s9 } = await adminClient.from('sales').insert({
      receipt_number: `REC-${invNum9}`,
      invoice_number: invNum9,
      total: 80000,
      subtotal: 80000,
      status: 'completed',
      customer_name: 'Cheque Clear Dealer'
    }).select().single();

    const { data: chq9 } = await adminClient.rpc('record_sale_payment_atomic', {
      p_sale_id: s9.id,
      p_amount: 80000,
      p_payment_method: 'cheque',
      p_cheque_number: `CHQ-CLR-${Date.now().toString().slice(-4)}`,
      p_bank_name: 'HNB Bank',
      p_cheque_date: '2026-10-01',
      p_created_by: 'UAT Admin'
    });

    // Clear the cheque
    await adminClient.rpc('update_cheque_status_atomic', {
      p_payment_id: chq9.payment_id,
      p_new_status: 'cleared',
      p_actor_name: 'UAT Admin',
      p_notes: 'Cheque cleared at branch'
    });

    const { data: unified9 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: invNum9
    });
    const row9 = unified9?.[0];

    const passed9 = row9 && row9.payment_status === 'PAID' && row9.cleared_paid === 80000 && row9.balance_due === 0 && row9.is_paid === true && row9.payment_method === 'cheque';
    record(9, 'Cleared cheque completes balance and transitions invoice to PAID', !!passed9,
      `PaymentStatus: ${row9?.payment_status}, ClearedPaid: ${row9?.cleared_paid}, BalanceDue: ${row9?.balance_due}, Method: ${row9?.payment_method}`);
  } catch (err: any) {
    record(9, 'Cleared cheque', false, err.message);
  }

  // -------------------------------------------------------------
  // UAT 10: Payment return / reversal
  // PAID -> BALANCE PENDING / UNPAID as effective paid decreases
  // -------------------------------------------------------------
  try {
    const invNum10 = `INV-UAT-REVRT-${Date.now().toString().slice(-6)}`;
    const { data: s10 } = await adminClient.from('sales').insert({
      receipt_number: `REC-${invNum10}`,
      invoice_number: invNum10,
      total: 60000,
      subtotal: 60000,
      status: 'completed',
      customer_name: 'Reversal Dealer'
    }).select().single();

    const { data: pay10 } = await adminClient.rpc('record_sale_payment_atomic', {
      p_sale_id: s10.id,
      p_amount: 60000,
      p_payment_method: 'bank_transfer',
      p_created_by: 'UAT Admin'
    });

    // Reverse 20,000 (partial return)
    await adminClient.rpc('record_payment_reversal_atomic', {
      p_payment_id: pay10.payment_id,
      p_amount: 20000,
      p_reason: 'CUSTOMER_OVERPAYMENT',
      p_reversed_by: 'UAT Admin',
      p_notes: 'Partial return of 20000'
    });

    const { data: unified10 } = await adminClient.rpc('admin_get_unified_sales', {
      p_search: invNum10
    });
    const row10 = unified10?.[0];

    const passed10 = row10 && row10.payment_status === 'BALANCE PENDING' && row10.cleared_paid === 40000 && row10.balance_due === 20000;
    record(10, 'Payment reversal decreases effective paid and reopens balance (PAID -> BALANCE PENDING)', !!passed10,
      `PaymentStatus: ${row10?.payment_status}, ClearedPaid: ${row10?.cleared_paid}, BalanceDue: ${row10?.balance_due}`);
  } catch (err: any) {
    record(10, 'Payment reversal return', false, err.message);
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n====================================================');
  console.log('                 UAT RUN SUMMARY                    ');
  console.log('====================================================');
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed:      ${passCount}`);
  console.log(`Failed:      ${failCount}`);
  console.log(`Success rate: ${(passCount / results.length * 100).toFixed(0)}%\n`);

  if (failCount > 0) {
    console.error('❌ SOME UAT TESTS FAILED:');
    results.filter(r => !r.passed).forEach(r => console.error(` - UAT ${r.step}: ${r.name} (${r.details})`));
    process.exit(1);
  } else {
    console.log('✨ ALL 10 UAT TESTS PASSED PERFECTLY!');
  }
}

run().catch(err => {
  console.error('Fatal error in UAT suite:', err);
  process.exit(1);
});
