FTC ELECTRONICS — OPTIMIZE QUOTATION STATUS / CONVERSION DISPLAY

The Quotations workspace currently displays "Invoiced" as the status for
quotations that have already been converted to commercial invoices.

I want this section optimized so the quotation lifecycle and resulting
invoice/payment state are clear.

DO NOT redesign the financial architecture.
DO NOT change payment calculations.
DO NOT change invoice revocation rules.
NO COMMIT.
NO PUSH.

==================================================
1. AUDIT CURRENT QUOTATION STATUS MODEL FIRST
==================================================

Inspect the actual quotation schema, conversion RPC/actions, and UI.

Determine the exact meaning of existing values such as:

draft
accepted
rejected
expired

Determine how the UI currently derives:

"Invoiced"

Specifically determine whether "Invoiced" comes from:

- quotations.status
- accepted status
- existence of a linked sale
- invoice_number
- frontend mapping
- another field

Do not assume.

==================================================
2. TARGET DOCUMENT LIFECYCLE
==================================================

The quotation table should primarily communicate the QUOTATION lifecycle.

Preferred user-facing terminology:

DRAFT
ACTIVE
CONVERTED
REJECTED
EXPIRED

Where:

CONVERTED = this quotation has generated an invoice.

Do not use "Invoiced" as the primary quotation status.

If existing database value remains "accepted" for compatibility, that is
fine.

Do NOT perform unnecessary database migrations just to rename a UI label.

Map the existing authoritative state to the clearer user-facing label:

CONVERTED

only when an invoice was actually issued.

==================================================
3. DO NOT CONFUSE QUOTATION WITH INVOICE PAYMENT
==================================================

After conversion:

Quotation lifecycle remains:

CONVERTED

The linked invoice independently has payment status:

UNPAID
BALANCE PENDING
PAID
REVOKED

Payment changes must NOT mutate the quotation back and forth.

Example:

Quotation:
CONVERTED

Linked invoice:
UNPAID

After partial payment:

Quotation:
CONVERTED

Linked invoice:
BALANCE PENDING

After full payment:

Quotation:
CONVERTED

Linked invoice:
PAID

After invoice revocation:

Quotation:
CONVERTED

Linked invoice:
REVOKED

The quotation remains part of the historical provenance.

==================================================
4. STATUS CELL DESIGN
==================================================

For converted quotations, display:

CONVERTED

as the primary badge.

If a reliable linked invoice is available without introducing N+1
queries, show a small secondary invoice state.

Examples:

[ CONVERTED ]
UNPAID

[ CONVERTED ]
BALANCE PENDING

[ CONVERTED ]
PAID

[ CONVERTED ]
REVOKED

Do NOT query payment history individually for every quotation row.

If invoice/payment status cannot be obtained efficiently from the current
list query/RPC, report that before introducing expensive requests.

Prefer a lightweight server-side projection/join/aggregate.

==================================================
5. LINKED INVOICE NUMBER
==================================================

Audit whether the converted quotation can efficiently resolve its linked
commercial invoice.

If yes, display the invoice number subtly:

CONVERTED
INV-2026-xxxxx
UNPAID

The invoice number should be clickable/deep-linkable to:

/admin/sales?view=sales&saleId=<id>

if the existing Sales workspace supports that pattern.

Do not expose internal IDs.

==================================================
6. FILTERS
==================================================

Current UI includes:

All
Active
Accepted
Rejected
Expired

Audit actual status semantics.

Preferred user-facing filters:

All
Draft
Active
Converted
Rejected
Expired

However:

Do NOT blindly remove Accepted if it represents a legitimate separate
business state before conversion.

If the actual lifecycle is:

Draft
→ Accepted
→ Converted

then retain both:

All
Draft
Active
Accepted
Converted
Rejected
Expired

If "accepted" currently means "converted/invoiced", present it as
Converted rather than showing duplicate concepts.

Report which model actually exists.

==================================================
7. DELETE PROTECTION
==================================================

The screenshot currently shows a delete/trash action on converted
quotations.

Audit this behavior.

A quotation that has already generated an invoice should normally NOT be
hard-deleted from the admin UI because it is part of the commercial audit
chain:

Quotation
→ Invoice
→ Payments
→ Cheques
→ Returns/Reversals
→ possible Revocation

For a quotation with a linked invoice:

disable/remove Delete.

Do NOT delete the linked invoice.

Do NOT cascade-delete financial records.

If deletion is currently server-side permitted for converted quotations,
harden the server action as well.

UI protection alone is insufficient.

For unconverted Draft quotations, existing deletion behavior may remain
if legitimate.

==================================================
8. EDIT PROTECTION
==================================================

Also audit the Edit icon shown for converted quotations.

Once an invoice has been issued, editing the historical quotation should
not silently modify the already-issued invoice.

Determine current behavior.

Preferred behavior:

DRAFT / eligible unconverted quotation
→ Edit enabled

CONVERTED quotation
→ financial/content editing disabled

Historical quotation may still be viewed/printed.

If the system intentionally supports amendment/revision, report the
existing architecture instead of inventing one.

==================================================
9. PRINT BEHAVIOR
==================================================

Quotation Print must remain historically correct.

Before conversion:

QUOTATION

After conversion:

Printing the original quotation should still represent the quotation,
not silently turn it into an invoice.

Invoice printing belongs to the linked Sales/Invoice record.

Do not mix quotation and invoice document types.

==================================================
10. KPI CARDS
==================================================

Audit these cards:

TOTAL QUOTATIONS
WHOLESALE B2B QUOTES
DIRECT CUSTOMER QUOTES
TOTAL QUOTED VALUE

Determine whether converted/rejected/expired quotations are included in
TOTAL QUOTED VALUE.

Do NOT change semantics without reporting them.

Recommend the clearest meaning.

For example, if TOTAL QUOTED VALUE means historical value of all quotes,
that is fine.

If it is intended to represent currently open pipeline value, converted,
rejected, and expired quotes should likely not be included.

Report the current calculation and recommendation before changing KPI
semantics.

==================================================
11. TABLE ITEM COUNT
==================================================

The screenshot currently shows "—" under ITEMS.

Audit whether quotation items are intentionally omitted from the list
projection for performance.

Do NOT reintroduce the full items JSONB into every list row merely to
calculate item count.

If item count can be obtained cheaply/server-side, use it.

Otherwise retain the lightweight list and report why.

Performance optimization must be preserved.

==================================================
12. CUSTOMER / COMPANY PRESENTATION
==================================================

For Wholesale B2B quotations:

company/dealer should be the primary commercial identity where
appropriate.

Example:

Codix
Afker · +947...

rather than making the contact person appear to be the company.

For Direct Customer:

customer name remains primary.

Audit existing snapshot fields before changing mappings.

Historical quotation display should not depend exclusively on current
dealer data if snapshot data exists.

==================================================
13. EXPECTED EXAMPLE
==================================================

A converted wholesale quotation should approximately display:

QUO-2026-2173
Wholesale B2B

Codix
Afker · +94718777703

Valid Until
9 Oct 2026

LKR 23,275

CONVERTED
INV-2026-xxxxx
UNPAID

Actions:

Print Quotation
View Invoice

No destructive Delete action.

Do not overload the row if responsive layout becomes cluttered.

==================================================
14. PERFORMANCE
==================================================

Preserve the optimized quotation architecture:

- server-side pagination
- bounded projections
- debounced search
- no full items JSONB in list unless actually necessary
- no N+1 invoice/payment requests
- lazy workspace loading
- stable query keys
- existing permission checks

Any linked invoice state shown in the table must be retrieved efficiently.

==================================================
15. VALIDATION
==================================================

Test:

1. New draft quotation
2. Active/sent quotation if supported
3. Converted quotation with zero-payment invoice
4. Converted quotation with partial payment
5. Converted quotation with fully paid invoice
6. Converted quotation whose invoice was revoked
7. Rejected quotation
8. Expired quotation
9. Direct Customer quotation
10. Wholesale B2B quotation

Verify converted quotation remains CONVERTED regardless of invoice payment
changes.

Verify converted quotation cannot be destructively deleted.

Verify invoice payment/revocation architecture remains unchanged.

Run:

git diff --check
npm run typecheck
npm run typecheck:scripts
npm run build

NO COMMIT.
NO PUSH.

==================================================
FINAL REPORT
==================================================

Report:

1. Actual quotation lifecycle/status model
2. Exact source of current "Invoiced" label
3. Whether accepted and converted are distinct

4. Final user-facing status mapping
5. Final filters
6. Linked invoice number/status implementation
7. Delete behavior before/after conversion
8. Edit behavior before/after conversion
9. Print behavior
10. KPI calculation semantics
11. Items column decision
12. Wholesale company/contact mapping
13. Query/performance impact
14. Regression results
15. typecheck/build results
16. NO COMMIT
17. NO PUSHimport { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log('====================================================');
  console.log('DATABASE AUDIT: COMMERCIAL & SALES TEST DATA');
  console.log('====================================================\n');

  // 1. Sales & Invoices count & breakdown
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select(`
      id,
      receipt_number,
      invoice_number,
      source,
      status,
      sale_type,
      total_amount,
      payment_method,
      customer_name,
      customer_email,
      created_at,
      invoice_issued_at,
      invoice_revoked_at,
      invoice_revoke_reason,
      quotation_id
    `)
    .order('created_at', { ascending: false });

  if (salesErr) console.error('Sales error:', salesErr);
  console.log(`Total Sales records: ${sales?.length || 0}`);

  // Breakdown by source / sale_type
  const salesBySource: Record<string, number> = {};
  const salesByStatus: Record<string, number> = {};
  const commercialInvoices: any[] = [];
  const posSales: any[] = [];

  (sales || []).forEach((s) => {
    const src = s.source || (s.invoice_number ? 'commercial_invoice' : 'pos_or_other');
    salesBySource[src] = (salesBySource[src] || 0) + 1;
    salesByStatus[s.status] = (salesByStatus[s.status] || 0) + 1;

    if (s.invoice_number || s.quotation_id || s.sale_type === 'wholesale' || s.source === 'commercial_invoice' || s.source === 'quotation') {
      commercialInvoices.push(s);
    } else {
      posSales.push(s);
    }
  });

  console.log('Sales by source:', salesBySource);
  console.log('Sales by status:', salesByStatus);
  console.log(`Commercial / Wholesale Invoices: ${commercialInvoices.length}`);
  console.log(`POS / Direct Sales: ${posSales.length}`);

  // 2. Sale Items
  const { data: saleItems, error: itemsErr } = await supabase
    .from('sale_items')
    .select('id, sale_id, product_id, product_name, quantity, unit_price, total_price');

  if (itemsErr) console.error('Sale Items error:', itemsErr);
  console.log(`\nTotal Sale Items records: ${saleItems?.length || 0}`);

  // 3. Sale Payments
  const { data: payments, error: payErr } = await supabase
    .from('sale_payments')
    .select(`
      id,
      sale_id,
      amount,
      payment_method,
      status,
      payment_number,
      cheque_number,
      cheque_date,
      bank_name,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (payErr) console.error('Payments error:', payErr);
  console.log(`\nTotal Sale Payments records: ${payments?.length || 0}`);
  const paymentsByMethod: Record<string, number> = {};
  const paymentsByStatus: Record<string, number> = {};
  (payments || []).forEach((p) => {
    paymentsByMethod[p.payment_method] = (paymentsByMethod[p.payment_method] || 0) + 1;
    paymentsByStatus[p.status] = (paymentsByStatus[p.status] || 0) + 1;
  });
  console.log('Payments by method:', paymentsByMethod);
  console.log('Payments by status:', paymentsByStatus);

  // 4. Sale Payment Reversals
  const { data: reversals, error: revErr } = await supabase
    .from('sale_payment_reversals')
    .select(`
      id,
      payment_id,
      sale_id,
      reversal_number,
      amount,
      reason,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (revErr) console.error('Reversals error:', revErr);
  console.log(`\nTotal Sale Payment Reversals: ${reversals?.length || 0}`);

  // 5. Quotations
  const { data: quotations, error: qErr } = await supabase
    .from('quotations')
    .select(`
      id,
      quotation_number,
      customer_name,
      customer_email,
      total_amount,
      status,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (qErr) console.error('Quotations error:', qErr);
  console.log(`\nTotal Quotations: ${quotations?.length || 0}`);

  // 6. Quotation Items
  const { data: quotationItems, error: qItemsErr } = await supabase
    .from('quotation_items')
    .select('id, quotation_id, product_id, product_name, quantity, unit_price, total_price');

  if (qItemsErr) console.error('Quotation Items error:', qItemsErr);
  console.log(`Total Quotation Items: ${quotationItems?.length || 0}`);

  // 7. Orders (Storefront)
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select(`
      id,
      customer_id,
      status,
      total_amount,
      payment_status,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (ordErr) console.error('Orders error:', ordErr);
  console.log(`\nTotal Storefront Orders: ${orders?.length || 0}`);

  // 8. Serialized Inventory / Unit State
  // Check if serial_numbers or serialized_inventory table exists
  const { data: serials, error: serErr } = await supabase
    .from('serial_numbers')
    .select('id, serial_number, product_id, status, sale_id, order_id, created_at')
    .limit(100);

  if (serErr) {
    console.log('Serial numbers table check:', serErr.message);
  } else {
    console.log(`\nTotal Serial Numbers inspected: ${serials?.length || 0}`);
    const serialsByStatus: Record<string, number> = {};
    (serials || []).forEach(s => {
      serialsByStatus[s.status] = (serialsByStatus[s.status] || 0) + 1;
    });
    console.log('Serial numbers by status:', serialsByStatus);
  }

  // 9. Stock movements / Inventory audit
  const { data: stockMovements, error: smErr } = await supabase
    .from('stock_movements')
    .select('id, product_id, change_amount, reason, reference_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (smErr) {
    console.log('Stock movements table check:', smErr.message);
  } else {
    console.log(`\nTotal Stock Movements inspected: ${stockMovements?.length || 0}`);
  }

  // 10. Check products affected by sales
  const affectedProductIds = new Set((saleItems || []).map(item => item.product_id).filter(Boolean));
  console.log(`\nUnique products referenced in sale_items: ${affectedProductIds.size}`);

  if (affectedProductIds.size > 0) {
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, count_in_stock, sku')
      .in('id', Array.from(affectedProductIds));

    console.log('\nSample affected products & current count_in_stock:');
    (prods || []).slice(0, 10).forEach(p => {
      console.log(` - [${p.sku || p.id}] ${p.name}: count_in_stock = ${p.count_in_stock}`);
    });
  }

  // 11. Sequences and Triggers
  // Let's inspect sequence / counter tables if any
  const { data: seqData, error: seqErr } = await supabase
    .from('system_sequences')
    .select('*');

  if (seqErr) {
    console.log('System sequences check:', seqErr.message);
  } else {
    console.log('System sequences:', seqData);
  }
}

runAudit();
