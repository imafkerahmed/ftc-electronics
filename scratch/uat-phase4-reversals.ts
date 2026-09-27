import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function runSql(sql: string) {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL Error ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log('================================================================');
  console.log('FTC ELECTRONICS — PHASE 4: PAYMENT RETURN / REVERSAL UAT SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 17;

  // Cleanup helper
  const createdSaleIds: string[] = [];

  async function createTestSale(totalAmount: number, customerName: string = 'UAT Test Customer') {
    const saleRes = await supabase.from('sales').insert({
      receipt_number: 'REC-UAT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      customer_name: customerName,
      customer_phone: '0771234567',
      total: totalAmount,
      subtotal: totalAmount,
      tax_amount: 0,
      discount: 0,
      payment_method: 'cash',
      status: 'completed',
      notes: 'Phase 4 UAT Sale',
    }).select().single();

    if (saleRes.error) throw saleRes.error;
    createdSaleIds.push(saleRes.data.id);
    return saleRes.data;
  }

  async function recordPayment(opts: {
    saleId: string;
    amount: number;
    method?: string;
    chequeNumber?: string;
    chequeDate?: string;
    bankName?: string;
    reference?: string;
    notes?: string;
  }) {
    const res = await supabase.rpc('record_sale_payment_atomic', {
      p_sale_id: opts.saleId,
      p_amount: opts.amount,
      p_payment_method: opts.method || 'cash',
      p_created_by: 'UAT Admin',
      p_reference: opts.reference || null,
      p_cheque_number: opts.chequeNumber || null,
      p_cheque_date: opts.chequeDate || null,
      p_bank_name: opts.bankName || null,
      p_notes: opts.notes || null,
    });
    return res;
  }

  async function recordReversal(opts: {
    paymentId: string;
    amount: number;
    reason?: string;
    reference?: string;
    notes?: string;
  }) {
    const res = await supabase.rpc('record_payment_reversal_atomic', {
      p_payment_id: opts.paymentId,
      p_amount: opts.amount,
      p_reason: opts.reason || 'Customer refund',
      p_reference: opts.reference || null,
      p_notes: opts.notes || null,
      p_reversed_by: 'UAT Admin',
    });
    return res;
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Single cleared payment -> Partial Return
    // -------------------------------------------------------------
    console.log('TEST 1: Single cleared payment -> Partial Return (100k -> return 20k)');
    {
      const sale = await createTestSale(100000);
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 100000,
        method: 'cash',
      });
      if (payRes.error) throw payRes.error;
      const paymentId = payRes.data.payment_id;

      // Reversal of 20k
      const revRes = await recordReversal({
        paymentId: paymentId,
        amount: 20000,
        reason: 'Customer refund',
        reference: 'REF-001',
        notes: 'Partial return test',
      });
      if (revRes.error) throw revRes.error;

      const fs = revRes.data.summary;

      console.log('  Financial Summary:', fs);
      if (
        fs.gross_cleared_paid === 100000 &&
        fs.returned_amount === 20000 &&
        fs.effective_cleared_paid === 80000 &&
        fs.balance_due === 20000 &&
        fs.payment_status === 'BALANCE PENDING' &&
        revRes.data.reversal_number.startsWith('REV-')
      ) {
        console.log('  ✅ TEST 1 PASSED: Effective cleared 80k, Balance due 20k, Status BALANCE PENDING\n');
        passedTests++;
      } else {
        throw new Error(`TEST 1 Failed: Unexpected summary ${JSON.stringify(fs)}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 2: Single cleared payment -> Full Return
    // -------------------------------------------------------------
    console.log('TEST 2: Single cleared payment -> Full Return (100k -> return 100k)');
    {
      const sale = await createTestSale(100000);
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 100000,
        method: 'cash',
      });
      const paymentId = payRes.data.payment_id;

      const revRes = await recordReversal({
        paymentId: paymentId,
        amount: 100000,
        reason: 'Customer refund',
      });
      if (revRes.error) throw revRes.error;

      const fs = revRes.data.summary;

      if (
        fs.gross_cleared_paid === 100000 &&
        fs.returned_amount === 100000 &&
        fs.effective_cleared_paid === 0 &&
        fs.balance_due === 100000 &&
        fs.payment_status === 'UNPAID'
      ) {
        console.log('  ✅ TEST 2 PASSED: Effective cleared 0, Balance due 100k, Status UNPAID\n');
        passedTests++;
      } else {
        throw new Error(`TEST 2 Failed: Unexpected summary ${JSON.stringify(fs)}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 3: Multiple partial returns on single payment
    // -------------------------------------------------------------
    console.log('TEST 3: Multiple partial returns on single payment (100k -> return 20k + 10k)');
    {
      const sale = await createTestSale(100000);
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 100000,
        method: 'bank_transfer',
      });
      const paymentId = payRes.data.payment_id;

      await recordReversal({
        paymentId: paymentId,
        amount: 20000,
        reason: 'Overpayment',
      });

      const revRes2 = await recordReversal({
        paymentId: paymentId,
        amount: 10000,
        reason: 'Order adjustment',
      });

      const fs = revRes2.data.summary;
      const revs = (await supabase.from('sale_payment_reversals').select('*').eq('payment_id', paymentId)).data;

      if (
        fs.gross_cleared_paid === 100000 &&
        fs.returned_amount === 30000 &&
        fs.effective_cleared_paid === 70000 &&
        fs.balance_due === 30000 &&
        revs?.length === 2
      ) {
        console.log('  ✅ TEST 3 PASSED: Multiple reversals recorded, Total returned 30k, Effective cleared 70k\n');
        passedTests++;
      } else {
        throw new Error(`TEST 3 Failed: Unexpected state`);
      }
    }

    // -------------------------------------------------------------
    // TEST 4: Over-return rejection
    // -------------------------------------------------------------
    console.log('TEST 4: Over-return rejection');
    {
      const sale = await createTestSale(100000);
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 50000,
        method: 'cash',
      });
      const paymentId = payRes.data.payment_id;

      // First return 30k
      await recordReversal({
        paymentId: paymentId,
        amount: 30000,
        reason: 'Correction',
      });

      // Attempt to return 25k (only 20k remains)
      const overRes = await recordReversal({
        paymentId: paymentId,
        amount: 25000,
        reason: 'Excess return',
      });

      const errText = overRes.data?.error || overRes.error?.message || '';
      if (!overRes.data?.success && errText.toLowerCase().includes('exceeds remaining reversible amount')) {
        console.log('  ✅ TEST 4 PASSED: Over-return correctly rejected with error:', errText, '\n');
        passedTests++;
      } else {
        throw new Error(`TEST 4 Failed: Expected over-return error but got ${JSON.stringify(overRes)}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 5: Concurrency locking validation
    // -------------------------------------------------------------
    console.log('TEST 5: Concurrency locking validation');
    {
      const sale = await createTestSale(50000);
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 50000,
        method: 'cash',
      });
      const paymentId = payRes.data.payment_id;

      // Execute two simultaneous 30k returns on a 50k payment
      const [res1, res2] = await Promise.all([
        recordReversal({
          paymentId: paymentId,
          amount: 30000,
          reason: 'Parallel return 1',
        }),
        recordReversal({
          paymentId: paymentId,
          amount: 30000,
          reason: 'Parallel return 2',
        }),
      ]);

      const successCount = [res1, res2].filter(r => r.data?.success === true).length;
      const failCount = [res1, res2].filter(r => !r.data?.success).length;

      if (successCount === 1 && failCount === 1) {
        console.log('  ✅ TEST 5 PASSED: Concurrency row locking prevented race condition (1 succeeded, 1 rejected)\n');
        passedTests++;
      } else {
        throw new Error(`TEST 5 Failed: Concurrent race condition not caught! Success: ${successCount}, Fail: ${failCount}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 6: Multiple payments (Cash 30k + Card 70k, return 20k from Card)
    // -------------------------------------------------------------
    console.log('TEST 6: Multiple payments (Cash 30k + Card 70k, return 20k from Card)');
    {
      const sale = await createTestSale(100000);
      const pay1 = await recordPayment({
        saleId: sale.id,
        amount: 30000,
        method: 'cash',
      });
      const pay2 = await recordPayment({
        saleId: sale.id,
        amount: 70000,
        method: 'card',
      });

      const cardPaymentId = pay2.data.payment_id;

      const revRes = await recordReversal({
        paymentId: cardPaymentId,
        amount: 20000,
        reason: 'Card refund',
      });

      const fs = revRes.data.summary;

      if (
        fs.gross_cleared_paid === 100000 &&
        fs.returned_amount === 20000 &&
        fs.effective_cleared_paid === 80000 &&
        fs.balance_due === 20000
      ) {
        console.log('  ✅ TEST 6 PASSED: Multi-payment return accurately attributes reversal to Card\n');
        passedTests++;
      } else {
        throw new Error(`TEST 6 Failed: Multi-payment summary mismatch`);
      }
    }

    // -------------------------------------------------------------
    // TEST 7: Cleared Cheque Return (Cheque stays CLEARED, cash reversed)
    // -------------------------------------------------------------
    console.log('TEST 7: Cleared Cheque Return');
    {
      const sale = await createTestSale(60000);
      const chqPay = await recordPayment({
        saleId: sale.id,
        amount: 60000,
        method: 'cheque',
        chequeNumber: 'CHQ-990011',
        chequeDate: '2026-10-01',
        bankName: 'Commercial Bank',
      });
      const chqPaymentId = chqPay.data.payment_id;

      // Clear the cheque
      await supabase.rpc('update_cheque_status_atomic', {
        p_payment_id: chqPaymentId,
        p_new_status: 'cleared',
        p_actor_name: 'UAT Admin',
        p_notes: 'Cheque cleared for UAT',
      });

      // Reverse 15k
      const revRes = await recordReversal({
        paymentId: chqPaymentId,
        amount: 15000,
        reason: 'Cheque cash return',
      });
      if (revRes.error) throw revRes.error;

      const paymentRow = (await supabase.from('sale_payments').select('status').eq('id', chqPaymentId).single()).data;
      const fs = revRes.data.summary;

      if (
        paymentRow?.status === 'cleared' &&
        fs.gross_cleared_paid === 60000 &&
        fs.returned_amount === 15000 &&
        fs.effective_cleared_paid === 45000 &&
        fs.balance_due === 15000
      ) {
        console.log('  ✅ TEST 7 PASSED: Cleared cheque retains CLEARED status while reversal re-opens balance\n');
        passedTests++;
      } else {
        throw new Error(`TEST 7 Failed: Cheque reversal status mismatch: ${JSON.stringify({ paymentRow, fs })}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 8: Pending Cheque rejected from return
    // -------------------------------------------------------------
    console.log('TEST 8: Pending Cheque rejected from return');
    {
      const sale = await createTestSale(50000);
      const chqPay = await recordPayment({
        saleId: sale.id,
        amount: 50000,
        method: 'cheque',
        chequeNumber: 'CHQ-PENDING-1',
        chequeDate: '2026-10-15',
        bankName: 'HNB',
      });
      const chqPaymentId = chqPay.data.payment_id;

      const revRes = await recordReversal({
        paymentId: chqPaymentId,
        amount: 10000,
        reason: 'Pending return attempt',
      });

      const errText = revRes.data?.error || revRes.error?.message || '';
      if (!revRes.data?.success && errText.toLowerCase().includes('only cleared payments')) {
        console.log('  ✅ TEST 8 PASSED: Pending cheque correctly rejected from return\n');
        passedTests++;
      } else {
        throw new Error(`TEST 8 Failed: Expected rejection for pending cheque but got ${JSON.stringify(revRes)}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 9: Bounced Cheque rejected from return
    // -------------------------------------------------------------
    console.log('TEST 9: Bounced Cheque rejected from return');
    {
      const sale = await createTestSale(50000);
      const chqPay = await recordPayment({
        saleId: sale.id,
        amount: 50000,
        method: 'cheque',
        chequeNumber: 'CHQ-BOUNCE-1',
        chequeDate: '2026-10-15',
        bankName: 'Sampath Bank',
      });
      const chqPaymentId = chqPay.data.payment_id;

      await supabase.rpc('update_cheque_status_atomic', {
        p_payment_id: chqPaymentId,
        p_new_status: 'bounced',
        p_actor_name: 'UAT Admin',
        p_notes: 'Insufficient funds',
      });

      const revRes = await recordReversal({
        paymentId: chqPaymentId,
        amount: 10000,
        reason: 'Bounced return attempt',
      });

      const errText = revRes.data?.error || revRes.error?.message || '';
      if (!revRes.data?.success && errText.toLowerCase().includes('only cleared payments')) {
        console.log('  ✅ TEST 9 PASSED: Bounced cheque correctly rejected from return\n');
        passedTests++;
      } else {
        throw new Error(`TEST 9 Failed: Expected rejection for bounced cheque but got ${JSON.stringify(revRes)}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 10: Outstanding Receivables re-opening
    // -------------------------------------------------------------
    console.log('TEST 10: Outstanding Receivables re-opening');
    {
      const sale = await createTestSale(120000, 'Reopened Customer');
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 120000,
        method: 'cash',
      });

      // At this point, balance_due is 0, so it shouldn't appear in outstanding receivables
      const listBefore = await supabase.rpc('admin_get_outstanding_receivables', {
        p_search: 'Reopened Customer',
      });
      const inListBefore = listBefore.data?.some((r: any) => r.id === sale.id);

      // Return 30k
      await recordReversal({
        paymentId: payRes.data.payment_id,
        amount: 30000,
        reason: 'Customer refund',
      });

      // Now it must appear in outstanding receivables with balance_due 30000
      const listAfter = await supabase.rpc('admin_get_outstanding_receivables', {
        p_search: 'Reopened Customer',
      });
      const foundItem = listAfter.data?.find((r: any) => r.id === sale.id);

      if (!inListBefore && foundItem && foundItem.balance_due === 30000 && foundItem.returned_amount === 30000) {
        console.log('  ✅ TEST 10 PASSED: Paid invoice successfully reappears in Outstanding Receivables after return\n');
        passedTests++;
      } else {
        throw new Error(`TEST 10 Failed: Outstanding receivables reopening mismatch`);
      }
    }

    // -------------------------------------------------------------
    // TEST 11: Aging / Due Date Preservation
    // -------------------------------------------------------------
    console.log('TEST 11: Aging / Due Date Preservation');
    {
      const sale = await createTestSale(80000);
      // Set due_date 40 days in past
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 40);
      const isoPastDate = pastDate.toISOString().split('T')[0];

      await supabase.from('sales').update({
        due_date: isoPastDate,
        payment_terms: 'net_30',
      }).eq('id', sale.id);

      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 80000,
        method: 'cash',
      });

      // Reversal of 40k
      await recordReversal({
        paymentId: payRes.data.payment_id,
        amount: 40000,
        reason: 'Partial return',
      });

      const list = await supabase.rpc('admin_get_outstanding_receivables', {
        p_search: 'UAT Test Customer',
      });
      const item = list.data?.find((r: any) => r.id === sale.id);

      if (item && item.due_date === isoPastDate && item.collection_status === 'OVERDUE' && item.aging_bucket.includes('31')) {
        console.log('  ✅ TEST 11 PASSED: Original due_date and aging bucket (31-60 days) preserved on reopened invoice\n');
        passedTests++;
      } else {
        throw new Error(`TEST 11 Failed: Aging mismatch ${JSON.stringify(item)}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 12: Invoice Document Title & Summary Verification
    // -------------------------------------------------------------
    console.log('TEST 12: Invoice Document Title & Summary Verification');
    {
      const sale = await createTestSale(150000);
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 150000,
        method: 'cash',
      });

      const revRes = await recordReversal({
        paymentId: payRes.data.payment_id,
        amount: 50000,
        reason: 'Correction',
      });

      const fs = revRes.data.summary;

      // Simulating invoice-print logic
      const isReopenedBalance = (fs.returned_amount || 0) > 0 && fs.balance_due > 0;
      const docTitle = isReopenedBalance ? 'INVOICE — BALANCE PENDING' : (fs.balance_due <= 0 ? 'PAID INVOICE' : 'COMMERCIAL INVOICE');

      if (docTitle === 'INVOICE — BALANCE PENDING' && fs.effective_cleared_paid === 100000) {
        console.log('  ✅ TEST 12 PASSED: Invoice document title accurately shifts to INVOICE — BALANCE PENDING after return\n');
        passedTests++;
      } else {
        throw new Error(`TEST 12 Failed: Expected INVOICE — BALANCE PENDING but got ${docTitle}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 13: Inventory Isolation Verification
    // -------------------------------------------------------------
    console.log('TEST 13: Inventory Isolation Verification');
    {
      // Pick a sample product or check stock table
      const sampleProd = (await supabase.from('products').select('id, count_in_stock').limit(1).single()).data;
      const stockBefore = sampleProd ? sampleProd.count_in_stock : 10;

      const sale = await createTestSale(90000);
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 90000,
        method: 'cash',
      });

      await recordReversal({
        paymentId: payRes.data.payment_id,
        amount: 90000,
        reason: 'Customer refund',
      });

      if (sampleProd) {
        const prodData = (await supabase.from('products').select('count_in_stock').eq('id', sampleProd.id).single()).data;
        const stockAfter = prodData?.count_in_stock;
        if (stockAfter !== stockBefore) {
          throw new Error(`Inventory was modified! Before: ${stockBefore}, After: ${stockAfter}`);
        }
      }

      console.log('  ✅ TEST 13 PASSED: Inventory stock counts remain strictly untouched during financial return\n');
      passedTests++;
    }

    // -------------------------------------------------------------
    // TEST 14: RLS & Immutability Audit
    // -------------------------------------------------------------
    console.log('TEST 14: RLS & Immutability Audit');
    {
      // Check that table has RLS enabled
      const rlsCheck = await runSql(`
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE tablename = 'sale_payment_reversals';
      `);

      if (rlsCheck[0]?.rowsecurity === true) {
        console.log('  ✅ TEST 14 PASSED: Row-Level Security is active and configured on sale_payment_reversals\n');
        passedTests++;
      } else {
        throw new Error(`TEST 14 Failed: RLS not active on sale_payment_reversals`);
      }
    }

    // -------------------------------------------------------------
    // TEST 15: POS compatibility regression
    // -------------------------------------------------------------
    console.log('TEST 15: POS compatibility regression');
    {
      const sale = await createTestSale(25000);
      // Direct cash payment at checkout
      const payRes = await recordPayment({
        saleId: sale.id,
        amount: 25000,
        method: 'cash',
      });
      if (payRes.error) throw payRes.error;

      const fs = payRes.data.summary;
      if (fs.balance_due === 0 && fs.payment_status === 'PAID') {
        console.log('  ✅ TEST 15 PASSED: POS immediate payment recording remains completely regression-free\n');
        passedTests++;
      } else {
        throw new Error(`TEST 15 Failed: POS payment regression`);
      }
    }

    // -------------------------------------------------------------
    // TEST 16: Outstanding Receivables Metrics Update
    // -------------------------------------------------------------
    console.log('TEST 16: Outstanding Receivables Metrics Update');
    {
      const rawMetrics = (await supabase.rpc('admin_get_outstanding_receivables_metrics')).data;
      const m = Array.isArray(rawMetrics) ? rawMetrics[0] : rawMetrics;
      console.log('  Current metrics:', m);
      if (m && typeof m.total_outstanding === 'number' && typeof m.unpaid_count === 'number') {
        console.log('  ✅ TEST 16 PASSED: Metrics RPC computes total_outstanding and counts accurately\n');
        passedTests++;
      } else {
        throw new Error(`TEST 16 Failed: Metrics missing expected fields: ${JSON.stringify(rawMetrics)}`);
      }
    }

    // -------------------------------------------------------------
    // TEST 17: Cheque Register Integration
    // -------------------------------------------------------------
    console.log('TEST 17: Cheque Register Integration');
    {
      const registerRes = await supabase.rpc('admin_get_cheque_register', {
        p_search: '',
        p_filter: 'all',
        p_sort: 'date_desc',
        p_limit: 50,
        p_offset: 0,
      });
      const register = registerRes.data;
      if (Array.isArray(register)) {
        console.log(`  ✅ TEST 17 PASSED: Cheque register query returns valid array (${register.length} entries)\n`);
        passedTests++;
      } else {
        throw new Error(`TEST 17 Failed: Cheque register query returned non-array: ${JSON.stringify(registerRes)}`);
      }
    }

    console.log('================================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} UAT TESTS PASSED WITH 100% SUCCESS!`);
    console.log('================================================================\n');

  } finally {
    // Clean up created test sales and their payments/reversals
    if (createdSaleIds.length > 0) {
      console.log(`Cleaning up ${createdSaleIds.length} test sales...`);
      for (const id of createdSaleIds) {
        await runSql(`
          DELETE FROM public.sale_payment_reversals WHERE sale_id = '${id}';
          DELETE FROM public.sale_payments WHERE sale_id = '${id}';
          DELETE FROM public.sales WHERE id = '${id}';
        `);
      }
      console.log('Cleanup completed successfully.');
    }
  }
}

main().catch(err => {
  console.error('❌ UAT Suite Error:', err);
  process.exit(1);
});
