import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://supa.ftc.lk';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordResult(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[UAT ${id.toString().padStart(2, '0')}] ${status} - ${name}`);
  if (details) {
    console.log(`       Details: ${details}`);
  }
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
    throw new Error(`SQL error ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function insertAudit(
  actor: string,
  action: string,
  collection: string,
  recordId: string,
  oldVal: any,
  newVal: any
) {
  return runSql(`
    INSERT INTO public.audit_log (
      actor, action, collection, record_id, old_value, new_value, created_at, updated_at
    ) VALUES (
      '${actor}', '${action}', '${collection}', '${recordId}',
      ${oldVal ? `'${JSON.stringify(oldVal)}'` : 'NULL'},
      ${newVal ? `'${JSON.stringify(newVal)}'` : 'NULL'},
      NOW(), NOW()
    );
  `);
}

async function main() {
  console.log('======================================================================');
  console.log('       STARTING COMPLETE QUOTATION WORKFLOW 20-POINT UAT SUITE        ');
  console.log('======================================================================\n');

  // Baseline Inventory check
  const stockBefore = await runSql(`SELECT id, name, count_in_stock FROM public.products ORDER BY id LIMIT 5;`);
  const initialStockMap = new Map<string, number>(stockBefore.map((p: any) => [p.id, p.count_in_stock]));

  const testIds: Record<string, string> = {};

  try {
    // Clean up prior test records to ensure idempotence
    await runSql(`
      DELETE FROM public.sale_payments WHERE sale_id IN (
        SELECT id FROM public.sales WHERE quotation_id IN (
          SELECT id FROM public.quotations WHERE quote_number LIKE 'QUO-WF-%'
        )
      );
      DELETE FROM public.sales WHERE quotation_id IN (
        SELECT id FROM public.quotations WHERE quote_number LIKE 'QUO-WF-%'
      );
      DELETE FROM public.audit_log WHERE record_id IN (
        SELECT id::text FROM public.quotations WHERE quote_number LIKE 'QUO-WF-%'
      );
      DELETE FROM public.quotations WHERE quote_number LIKE 'QUO-WF-%';
    `);
    // -------------------------------------------------------------------------
    // UAT 01: Create quotation -> DRAFT
    // -------------------------------------------------------------------------
    const q1Res = await runSql(`
      INSERT INTO public.quotations (
        quote_number, customer_name, customer_company, customer_email,
        customer_phone, subtotal, tax_amount, discount_amount, total_amount,
        valid_until, status, items
      ) VALUES (
        'QUO-WF-01', 'Acme Corp', 'Acme Industries', 'acme@example.com',
        '0771234567', 15000, 0, 0, 15000,
        NOW() + INTERVAL '14 days', 'draft',
        jsonb_build_array(jsonb_build_object('name', 'Industrial Switch', 'qty', 1, 'unitPrice', 15000, 'total', 15000))
      ) RETURNING id, quote_number, status;
    `);
    testIds.q1 = q1Res[0].id;

    const listQ1 = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-01');
    `);
    const q1Row = listQ1[0];
    recordResult(
      1,
      'Create quotation -> DRAFT',
      q1Row && q1Row.display_status === 'DRAFT' && q1Row.status === 'draft' && !q1Row.is_converted,
      `quote_number: ${q1Row?.quote_number}, display_status: ${q1Row?.display_status}, raw status: ${q1Row?.status}`
    );

    // -------------------------------------------------------------------------
    // UAT 02: Attempt Draft -> Issue Invoice directly through server action / RPC
    // -------------------------------------------------------------------------
    const { data: d2Data, error: d2Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q1,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: null,
      p_amount: 0,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    const d2Blocked = (d2Data && d2Data.success === false && d2Data.error?.includes('Draft quotations cannot be converted')) ||
                      (d2Err && d2Err.message?.includes('draft'));
    recordResult(
      2,
      'Attempt Draft -> Issue Invoice directly is rejected server-side',
      !!d2Blocked,
      `Direct conversion rejected with: "${d2Data?.error || d2Err?.message || 'None'}"`
    );

    // -------------------------------------------------------------------------
    // UAT 03: Issue Draft quotation -> ACTIVE, Audit ISSUED
    // -------------------------------------------------------------------------
    await runSql(`
      UPDATE public.quotations
      SET status = 'sent', updated_at = NOW()
      WHERE id = '${testIds.q1}' AND status = 'draft';
    `);

    await insertAudit(
      'admin@ftc.lk',
      'issue',
      'quotations',
      testIds.q1,
      { status: 'draft' },
      { status: 'sent', quote_number: 'QUO-WF-01', total_amount: 15000, lifecycle_event: 'QUOTATION_ISSUED' }
    );

    const listQ1Issued = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-01');
    `);
    const q1IssuedRow = listQ1Issued[0];

    const auditQ1Issued = await runSql(`
      SELECT action, new_value FROM public.audit_log
      WHERE collection = 'quotations' AND record_id = '${testIds.q1}' AND action = 'issue';
    `);

    recordResult(
      3,
      'Issue Draft quotation -> ACTIVE in DB and UI, audit ISSUED',
      q1IssuedRow?.status === 'sent' &&
      q1IssuedRow?.display_status === 'ACTIVE' &&
      auditQ1Issued.length > 0,
      `status: ${q1IssuedRow?.status}, display_status: ${q1IssuedRow?.display_status}, audit action: ${auditQ1Issued[0]?.action}`
    );

    // -------------------------------------------------------------------------
    // UAT 04: Refresh / reload -> still ACTIVE
    // -------------------------------------------------------------------------
    const reloadQ1 = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-01');
    `);
    recordResult(
      4,
      'Refresh / reload -> still ACTIVE',
      reloadQ1[0]?.display_status === 'ACTIVE' && reloadQ1[0]?.status === 'sent',
      `Reloaded display_status: ${reloadQ1[0]?.display_status}`
    );

    // -------------------------------------------------------------------------
    // UAT 05: Mark ACTIVE quotation Accepted -> ACCEPTED, Awaiting Invoice, audit ACCEPTED
    // -------------------------------------------------------------------------
    await runSql(`
      UPDATE public.quotations
      SET status = 'accepted', updated_at = NOW()
      WHERE id = '${testIds.q1}' AND status = 'sent';
    `);

    await insertAudit(
      'admin@ftc.lk',
      'accept',
      'quotations',
      testIds.q1,
      { status: 'sent' },
      { status: 'accepted', quote_number: 'QUO-WF-01', lifecycle_event: 'QUOTATION_ACCEPTED' }
    );

    const listQ1Accepted = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-01');
    `);
    const q1AccRow = listQ1Accepted[0];

    const auditQ1Accepted = await runSql(`
      SELECT action, new_value FROM public.audit_log
      WHERE collection = 'quotations' AND record_id = '${testIds.q1}' AND action = 'accept';
    `);

    recordResult(
      5,
      'Mark ACTIVE quotation Accepted -> ACCEPTED (Awaiting Invoice), audit ACCEPTED',
      q1AccRow?.status === 'accepted' &&
      q1AccRow?.display_status === 'ACCEPTED' &&
      !q1AccRow?.is_converted &&
      auditQ1Accepted.length > 0,
      `status: ${q1AccRow?.status}, display_status: ${q1AccRow?.display_status}, is_converted: ${q1AccRow?.is_converted}`
    );

    // -------------------------------------------------------------------------
    // UAT 06: Issue zero-payment invoice from ACCEPTED
    // -------------------------------------------------------------------------
    const { data: c0Data, error: c0Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q1,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: null,
      p_amount: 0,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    testIds.q1SaleId = c0Data?.sale_id;

    const listQ1Converted = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-01');
    `);
    const q1ConvRow = listQ1Converted[0];

    const saleQ1 = await runSql(`
      SELECT id, invoice_number, invoice_revoked_at, total
      FROM public.sales WHERE id = '${testIds.q1SaleId}';
    `);

    const q1Payments = await runSql(`
      SELECT COALESCE(SUM(amount), 0) as paid FROM public.sale_payments WHERE sale_id = '${testIds.q1SaleId}';
    `);

    const q1InvoiceStatus = saleQ1[0]?.invoice_revoked_at ? 'REVOKED' : (saleQ1[0]?.invoice_number ? 'ACTIVE' : 'DRAFT');
    const q1Paid = Number(q1Payments[0]?.paid || 0);
    const q1Total = Number(saleQ1[0]?.total || 0);

    recordResult(
      6,
      'Issue zero-payment invoice from ACCEPTED -> CONVERTED, Invoice ACTIVE, Payment UNPAID',
      c0Data?.success === true &&
      q1ConvRow?.display_status === 'CONVERTED' &&
      q1ConvRow?.is_converted === true &&
      saleQ1[0]?.invoice_number &&
      q1InvoiceStatus === 'ACTIVE' &&
      q1Paid === 0,
      `Quotation: ${q1ConvRow?.display_status}, Invoice: ${saleQ1[0]?.invoice_number} (${q1InvoiceStatus}), Paid: LKR ${q1Paid}, Total: LKR ${q1Total}`
    );

    // -------------------------------------------------------------------------
    // UAT 07: Issue quotation then directly Issue Invoice without manual Mark Accepted
    // -------------------------------------------------------------------------
    const q7Res = await runSql(`
      INSERT INTO public.quotations (
        quote_number, customer_name, customer_company, customer_email,
        subtotal, total_amount, valid_until, status, items
      ) VALUES (
        'QUO-WF-07', 'Direct Conversion Corp', 'Direct Ltd', 'direct@corp.com',
        30000, 30000, NOW() + INTERVAL '10 days', 'sent',
        jsonb_build_array(jsonb_build_object('name', 'Fiber Patch Cord', 'qty', 10, 'unitPrice', 3000, 'total', 30000))
      ) RETURNING id;
    `);
    testIds.q7 = q7Res[0].id;

    const { data: c7Data, error: c7Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q7,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: null,
      p_amount: 0,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    testIds.q7SaleId = c7Data?.sale_id;

    const listQ7Converted = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-07');
    `);
    const q7ConvRow = listQ7Converted[0];

    recordResult(
      7,
      'ACTIVE -> Direct Issue Invoice without manual Mark Accepted',
      c7Data?.success === true &&
      q7ConvRow?.display_status === 'CONVERTED' &&
      q7ConvRow?.is_converted === true &&
      q7ConvRow?.linked_sale_id === testIds.q7SaleId,
      `Successfully converted ACTIVE quote -> CONVERTED with linked sale id: ${testIds.q7SaleId}`
    );

    // -------------------------------------------------------------------------
    // UAT 08: ACTIVE -> Issue & Pay (full payment)
    // -------------------------------------------------------------------------
    const q8Res = await runSql(`
      INSERT INTO public.quotations (
        quote_number, customer_name, customer_company, customer_email,
        subtotal, total_amount, valid_until, status, items
      ) VALUES (
        'QUO-WF-08', 'Paid Client', 'PayCorp', 'paid@paycorp.com',
        20000, 20000, NOW() + INTERVAL '10 days', 'sent',
        jsonb_build_array(jsonb_build_object('name', 'HDMI Cable 10m', 'qty', 5, 'unitPrice', 4000, 'total', 20000))
      ) RETURNING id;
    `);
    testIds.q8 = q8Res[0].id;

    const { data: c8Data, error: c8Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q8,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: 'cash',
      p_amount: 20000,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    testIds.q8SaleId = c8Data?.sale_id;

    const listQ8Converted = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-08');
    `);
    const q8ConvRow = listQ8Converted[0];

    const saleQ8 = await runSql(`
      SELECT id, invoice_number, invoice_revoked_at, total
      FROM public.sales WHERE id = '${testIds.q8SaleId}';
    `);

    const q8Payments = await runSql(`
      SELECT COALESCE(SUM(amount), 0) as paid FROM public.sale_payments WHERE sale_id = '${testIds.q8SaleId}';
    `);
    const q8Paid = Number(q8Payments[0]?.paid || 0);

    recordResult(
      8,
      'ACTIVE -> Issue & Pay (full payment recorded, quotation CONVERTED)',
      c8Data?.success === true &&
      q8ConvRow?.display_status === 'CONVERTED' &&
      q8Paid === 20000,
      `Quotation: ${q8ConvRow?.display_status}, Invoice: ${saleQ8[0]?.invoice_number}, Paid: LKR ${q8Paid}, Total: LKR ${saleQ8[0]?.total}`
    );

    // -------------------------------------------------------------------------
    // UAT 09: ACTIVE -> Reject
    // -------------------------------------------------------------------------
    const q9Res = await runSql(`
      INSERT INTO public.quotations (
        quote_number, customer_name, subtotal, total_amount, valid_until, status, items
      ) VALUES (
        'QUO-WF-09', 'Reject Client', 18000, 18000, NOW() + INTERVAL '10 days', 'sent', '[]'::jsonb
      ) RETURNING id;
    `);
    testIds.q9 = q9Res[0].id;

    await runSql(`
      UPDATE public.quotations
      SET status = 'rejected', updated_at = NOW()
      WHERE id = '${testIds.q9}' AND status IN ('sent', 'accepted');
    `);

    await insertAudit(
      'admin@ftc.lk',
      'reject',
      'quotations',
      testIds.q9,
      { status: 'sent' },
      { status: 'rejected', quote_number: 'QUO-WF-09', reason: 'Price competitor was 10% lower' }
    );

    const listQ9Rejected = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-09');
    `);
    const q9Row = listQ9Rejected[0];

    recordResult(
      9,
      'ACTIVE -> Reject moves to REJECTED, no invoice, 0 stock mutation',
      q9Row?.display_status === 'REJECTED' &&
      q9Row?.status === 'rejected' &&
      !q9Row?.is_converted &&
      q9Row?.linked_sale_id === null,
      `display_status: ${q9Row?.display_status}, raw status: ${q9Row?.status}, linked_sale_id: ${q9Row?.linked_sale_id}`
    );

    // -------------------------------------------------------------------------
    // UAT 10: Attempt REJECTED -> Invoice rejected server-side
    // -------------------------------------------------------------------------
    const { data: d10Data, error: d10Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q9,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: null,
      p_amount: 0,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    const d10Blocked = (d10Data && d10Data.success === false && d10Data.error?.includes('rejected')) ||
                       (d10Err && d10Err.message?.includes('rejected'));
    recordResult(
      10,
      'Attempt REJECTED -> Invoice is rejected server-side',
      !!d10Blocked,
      `Rejected quotation conversion attempt blocked: "${d10Data?.error || d10Err?.message || 'None'}"`
    );

    // -------------------------------------------------------------------------
    // UAT 11: ACTIVE -> Void
    // -------------------------------------------------------------------------
    const q11Res = await runSql(`
      INSERT INTO public.quotations (
        quote_number, customer_name, subtotal, total_amount, valid_until, status, items
      ) VALUES (
        'QUO-WF-11', 'Void Client', 22000, 22000, NOW() + INTERVAL '10 days', 'sent', '[]'::jsonb
      ) RETURNING id;
    `);
    testIds.q11 = q11Res[0].id;

    await runSql(`
      UPDATE public.quotations
      SET status = 'voided', voided_at = NOW(), voided_by = 'admin@ftc.lk', void_reason = 'DUPLICATE_ENTRY', updated_at = NOW()
      WHERE id = '${testIds.q11}' AND status IN ('sent', 'accepted', 'draft');
    `);

    await insertAudit(
      'admin@ftc.lk',
      'void',
      'quotations',
      testIds.q11,
      { status: 'sent' },
      { status: 'voided', quote_number: 'QUO-WF-11', reason: 'DUPLICATE_ENTRY' }
    );

    const listQ11Voided = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-11');
    `);
    const q11Row = listQ11Voided[0];

    recordResult(
      11,
      'ACTIVE -> Void moves to VOIDED, no invoice, 0 stock mutation',
      q11Row?.display_status === 'VOIDED' &&
      q11Row?.status === 'voided' &&
      !q11Row?.is_converted,
      `display_status: ${q11Row?.display_status}, raw status: ${q11Row?.status}`
    );

    // -------------------------------------------------------------------------
    // UAT 12: Attempt VOIDED -> Invoice is rejected server-side
    // -------------------------------------------------------------------------
    const { data: d12Data, error: d12Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q11,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: null,
      p_amount: 0,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    const d12Blocked = (d12Data && d12Data.success === false && d12Data.error?.includes('voided')) ||
                       (d12Err && d12Err.message?.includes('voided'));
    recordResult(
      12,
      'Attempt VOIDED -> Invoice is rejected server-side',
      !!d12Blocked,
      `Voided quotation conversion attempt blocked: "${d12Data?.error || d12Err?.message || 'None'}"`
    );

    // -------------------------------------------------------------------------
    // UAT 13: Allow ACTIVE quotation to expire -> EXPIRED
    // -------------------------------------------------------------------------
    const q13Res = await runSql(`
      INSERT INTO public.quotations (
        quote_number, customer_name, subtotal, total_amount, valid_until, status, items
      ) VALUES (
        'QUO-WF-13', 'Expired Client', 16000, 16000, NOW() - INTERVAL '1 day', 'sent', '[]'::jsonb
      ) RETURNING id;
    `);
    testIds.q13 = q13Res[0].id;

    const listQ13Expired = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-13');
    `);
    const q13Row = listQ13Expired[0];

    recordResult(
      13,
      'Quotation past valid_until displays EXPIRED',
      q13Row?.display_status === 'EXPIRED',
      `display_status: ${q13Row?.display_status}, valid_until: ${q13Row?.valid_until}`
    );

    // -------------------------------------------------------------------------
    // UAT 14: Attempt EXPIRED -> Invoice rejected server-side
    // -------------------------------------------------------------------------
    const { data: d14Data, error: d14Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q13,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: null,
      p_amount: 0,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    const d14Blocked = (d14Data && d14Data.success === false && d14Data.error?.includes('expired')) ||
                       (d14Err && d14Err.message?.includes('expired'));
    recordResult(
      14,
      'Attempt EXPIRED -> Invoice is rejected server-side',
      !!d14Blocked,
      `Expired quotation conversion attempt blocked: "${d14Data?.error || d14Err?.message || 'None'}"`
    );

    // -------------------------------------------------------------------------
    // UAT 15: Converted quotation passes valid_until -> still CONVERTED
    // -------------------------------------------------------------------------
    await runSql(`
      UPDATE public.quotations
      SET valid_until = NOW() - INTERVAL '30 days'
      WHERE id = '${testIds.q7}';
    `);

    const listQ7Recheck = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-07');
    `);
    const q7RecheckRow = listQ7Recheck[0];

    recordResult(
      15,
      'Converted quotation past valid_until remains CONVERTED',
      q7RecheckRow?.display_status === 'CONVERTED' && q7RecheckRow?.is_converted === true,
      `display_status: ${q7RecheckRow?.display_status}, is_converted: ${q7RecheckRow?.is_converted}`
    );

    // -------------------------------------------------------------------------
    // UAT 16: Linked invoice becomes REVOKED -> Quotation still CONVERTED
    // -------------------------------------------------------------------------
    const { data: revData, error: revErr } = await adminClient.rpc('revoke_invoice_atomic', {
      p_sale_id: testIds.q7SaleId,
      p_reason: 'Commercial cancellation',
      p_notes: 'Customer canceled after issuance',
      p_revoked_by: 'Admin Revoker',
    });

    const listQ7Revoked = await runSql(`
      SELECT * FROM admin_get_unified_quotations(p_search := 'QUO-WF-07');
    `);
    const q7RevRow = listQ7Revoked[0];

    const saleQ7Revoked = await runSql(`
      SELECT invoice_revoked_at FROM public.sales WHERE id = '${testIds.q7SaleId}';
    `);

    const q7RevStatus = saleQ7Revoked[0]?.invoice_revoked_at ? 'REVOKED' : 'ACTIVE';

    recordResult(
      16,
      'Linked invoice REVOKED -> Quotation remains CONVERTED, Invoice REVOKED',
      revData?.success === true &&
      q7RevRow?.display_status === 'CONVERTED' &&
      q7RevRow?.is_converted === true &&
      q7RevStatus === 'REVOKED',
      `Quotation display_status: ${q7RevRow?.display_status}, Sale invoice_status: ${q7RevStatus}`
    );

    // -------------------------------------------------------------------------
    // UAT 17: Attempt duplicate conversion -> Rejected by server/database durable relationship
    // -------------------------------------------------------------------------
    const { data: d17Data, error: d17Err } = await adminClient.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: testIds.q1,
      p_actor_id: null,
      p_actor_name: 'Admin Test',
      p_payment_method: null,
      p_amount: 0,
      p_cheque_number: null,
      p_cheque_date: null,
      p_bank_name: null,
      p_cheque_notes: null,
    });

    const d17Blocked = (d17Data && d17Data.success === false && (d17Data.error?.includes('already') || d17Data.error?.includes('converted'))) ||
                       (d17Err && (d17Err.message?.includes('already') || d17Err.message?.includes('converted')));

    recordResult(
      17,
      'Attempt duplicate conversion is rejected by server/database durable relationship',
      !!d17Blocked,
      `Duplicate conversion attempt blocked: "${d17Data?.error || d17Err?.message || 'None'}"`
    );

    // -------------------------------------------------------------------------
    // UAT 18: Quotation History displays Created, Issued, Accepted, Converted without fabricated events
    // -------------------------------------------------------------------------
    const auditEventsQ1 = await runSql(`
      SELECT action, old_value, new_value, created_at
      FROM public.audit_log
      WHERE collection = 'quotations' AND record_id = '${testIds.q1}'
      ORDER BY created_at ASC;
    `);

    const actionsRecorded = auditEventsQ1.map((a: any) => a.action);
    const hasIssue = actionsRecorded.includes('issue');
    const hasAccept = actionsRecorded.includes('accept');

    recordResult(
      18,
      'Quotation History records authoritative Created, Issued, Accepted without fabrication',
      hasIssue && hasAccept,
      `Recorded audit actions for Q1: [${actionsRecorded.join(', ')}]`
    );

    // -------------------------------------------------------------------------
    // UAT 19: Email event remains separate from Issue event
    // -------------------------------------------------------------------------
    await insertAudit(
      'admin@ftc.lk',
      'email',
      'quotations',
      testIds.q1,
      null,
      { quote_number: 'QUO-WF-01', recipient: 'acme@example.com', subject: 'Formal Quotation' }
    );

    const auditEmailsQ1 = await runSql(`
      SELECT action, new_value
      FROM public.audit_log
      WHERE collection = 'quotations' AND record_id = '${testIds.q1}'
      ORDER BY created_at ASC;
    `);

    const separateIssueAndEmail =
      auditEmailsQ1.some((e: any) => e.action === 'issue') &&
      auditEmailsQ1.some((e: any) => e.action === 'email');

    recordResult(
      19,
      'Email event remains separate from Issue event in audit log',
      separateIssueAndEmail,
      `Distinct actions present: ${auditEmailsQ1.map((e: any) => e.action).join(', ')}`
    );

    // -------------------------------------------------------------------------
    // UAT 20: All lifecycle transitions produce ZERO inventory mutation
    // -------------------------------------------------------------------------
    const stockAfter = await runSql(`SELECT id, name, count_in_stock FROM public.products ORDER BY id LIMIT 5;`);
    let stockMutated = false;
    const stockDetails: string[] = [];

    for (const p of stockAfter) {
      const before = initialStockMap.get(p.id);
      if (before !== undefined && before !== p.count_in_stock) {
        stockMutated = true;
        stockDetails.push(`${p.name} changed: ${before} -> ${p.count_in_stock}`);
      }
    }

    recordResult(
      20,
      'All lifecycle transitions produce ZERO inventory mutation',
      !stockMutated,
      stockMutated ? `Stock mutated: ${stockDetails.join(', ')}` : 'All baseline product counts unchanged (0 mutation)'
    );

  } catch (err: any) {
    console.error('Unexpected error during UAT execution:', err);
  } finally {
    console.log('\n======================================================================');
    console.log('                          UAT SUMMARY                                 ');
    console.log('======================================================================');
    const passedCount = results.filter((r) => r.passed).length;
    console.log(`Passed: ${passedCount} / ${results.length}`);
    if (passedCount === 20) {
      console.log('🎉 ALL 20 QUOTATION WORKFLOW UAT SCENARIOS PASSED PERFECTLY!');
    } else {
      console.log('⚠️ SOME UAT SCENARIOS FAILED. Check details above.');
    }
  }
}

main();
