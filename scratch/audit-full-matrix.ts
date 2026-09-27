import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function runMatrixAudit() {
  console.log('======================================================================');
  console.log('FTC ELECTRONICS — COMPREHENSIVE SALES & INVENTORY AUDIT MATRIX');
  console.log('======================================================================\n');

  // 1. All Sales
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });

  if (sErr) throw sErr;
  console.log(`TOTAL SALES: ${sales?.length || 0}`);

  // 2. All Sale Items
  const { data: saleItems, error: siErr } = await supabase
    .from('sale_items')
    .select('*');
  if (siErr) throw siErr;
  console.log(`TOTAL SALE ITEMS: ${saleItems?.length || 0}`);

  // 3. All Sale Payments
  const { data: payments, error: pErr } = await supabase
    .from('sale_payments')
    .select('*')
    .order('created_at', { ascending: false });
  if (pErr) throw pErr;
  console.log(`TOTAL SALE PAYMENTS: ${payments?.length || 0}`);

  // 4. All Sale Payment Reversals
  const { data: reversals, error: rErr } = await supabase
    .from('sale_payment_reversals')
    .select('*')
    .order('created_at', { ascending: false });
  if (rErr) throw rErr;
  console.log(`TOTAL PAYMENT REVERSALS: ${reversals?.length || 0}`);

  // 5. All Quotations
  const { data: quotations, error: qErr } = await supabase
    .from('quotations')
    .select('*')
    .order('created_at', { ascending: false });
  if (qErr) throw qErr;
  console.log(`TOTAL QUOTATIONS: ${quotations?.length || 0}`);

  // 6. All Orders
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (oErr) throw oErr;
  console.log(`TOTAL STOREFRONT ORDERS: ${orders?.length || 0}`);

  // 7. Stock Management
  const { data: stockUnits, error: suErr } = await supabase
    .from('stock_management')
    .select('*');
  if (suErr) throw suErr;
  console.log(`TOTAL SERIALIZED STOCK UNITS (stock_management): ${stockUnits?.length || 0}`);

  // 8. Products
  const { data: products, error: prodErr } = await supabase
    .from('products')
    .select('id, name, count_in_stock, price');
  if (prodErr) throw prodErr;
  console.log(`TOTAL PRODUCTS IN CATALOG: ${products?.length || 0}`);

  // 9. Document Sequence Inspection
  // Let's check max invoice number in sales and orders
  const invNumbersSales = (sales || []).map(s => s.invoice_number).filter(Boolean);
  const invNumbersOrders = (orders || []).map(o => o.invoice_number).filter(Boolean);
  const quoNumbers = (quotations || []).map(q => q.quote_number || q.quotation_number).filter(Boolean);
  const revNumbers = (reversals || []).map(r => r.reversal_number).filter(Boolean);

  console.log('\n--- DOCUMENT SEQUENCES & IDENTIFIERS ---');
  console.log('Highest / Existing Invoices in sales:', invNumbersSales);
  console.log('Highest / Existing Invoices in orders:', invNumbersOrders);
  console.log('Quotations sample numbers:', quoNumbers.slice(0, 10));
  console.log('Reversal numbers:', revNumbers);

  // 10. Breakdown of Sales
  console.log('\n--- DETAILED SALES BREAKDOWN ---');
  const posSales: any[] = [];
  const wholesaleInvoices: any[] = [];
  const testUatSales: any[] = [];

  (sales || []).forEach(s => {
    const isUat = (s.customer_name?.includes('UAT')) ||
                  (s.receipt_number?.includes('UAT')) ||
                  (s.notes?.includes('UAT')) ||
                  (s.invoice_revoke_reason?.includes('UAT'));
    
    if (isUat) {
      testUatSales.push(s);
    } else if (s.invoice_number || s.receipt_number?.startsWith('FTC-WHOLESALE-')) {
      wholesaleInvoices.push(s);
    } else {
      posSales.push(s);
    }
  });

  console.log(`\n• Test/UAT Sales: ${testUatSales.length}`);
  testUatSales.forEach(s => {
    console.log(`   - [UAT] ID: ${s.id} | Inv#: ${s.invoice_number} | Rec#: ${s.receipt_number} | Cust: ${s.customer_name} | Total: ${s.total} | Revoked: ${s.invoice_revoked_at ? 'YES' : 'NO'}`);
  });

  console.log(`\n• Commercial/Wholesale Invoices: ${wholesaleInvoices.length}`);
  wholesaleInvoices.forEach(s => {
    console.log(`   - [WHOLESALE] ID: ${s.id} | Inv#: ${s.invoice_number} | Rec#: ${s.receipt_number} | Cust: ${s.customer_name || s.customer_email} | Total: ${s.total} | Status: ${s.status} | Revoked: ${s.invoice_revoked_at ? 'YES' : 'NO'}`);
  });

  console.log(`\n• POS / Retail Sales: ${posSales.length}`);
  posSales.forEach(s => {
    console.log(`   - [POS] ID: ${s.id} | Rec#: ${s.receipt_number} | Cust: ${s.customer_name || s.customer_email || 'Walk-in'} | Total: ${s.total} | Status: ${s.status}`);
  });

  // 11. Payments breakdown
  console.log('\n--- PAYMENTS BREAKDOWN ---');
  (payments || []).forEach(p => {
    console.log(`   - PayID: ${p.id} | SaleID: ${p.sale_id} | Amount: ${p.amount} | Method: ${p.payment_method} | Status: ${p.status} | Chq#: ${p.cheque_number || 'N/A'}`);
  });

  // 12. Reversals breakdown
  console.log('\n--- REVERSALS BREAKDOWN ---');
  (reversals || []).forEach(r => {
    console.log(`   - RevID: ${r.id} | PayID: ${r.payment_id} | SaleID: ${r.sale_id} | Num: ${r.reversal_number} | Amount: ${r.amount} | Reason: ${r.reason}`);
  });

  // 13. Quotations breakdown
  console.log('\n--- QUOTATIONS BREAKDOWN ---');
  const uatQuotes: any[] = [];
  const manualQuotes: any[] = [];
  (quotations || []).forEach(q => {
    if (q.customer_name?.includes('UAT') || q.quote_number?.includes('UAT') || q.quote_number?.includes('TEST')) {
      uatQuotes.push(q);
    } else {
      manualQuotes.push(q);
    }
  });
  console.log(`• UAT/Test Quotations: ${uatQuotes.length}`);
  uatQuotes.forEach(q => {
    console.log(`   - [UAT-QUO] ID: ${q.id} | Num: ${q.quote_number} | Cust: ${q.customer_name} | Total: ${q.total_amount} | Status: ${q.status}`);
  });
  console.log(`• Manual / Other Quotations: ${manualQuotes.length}`);
  manualQuotes.forEach(q => {
    console.log(`   - [MANUAL-QUO] ID: ${q.id} | Num: ${q.quote_number} | Cust: ${q.customer_name} | Total: ${q.total_amount} | Status: ${q.status} | Created: ${q.created_at}`);
  });

  // 14. Stock management units linked to sales vs orders
  console.log('\n--- STOCK MANAGEMENT (SERIALIZED UNITS) STATUS ---');
  (stockUnits || []).forEach(u => {
    console.log(`   - Unit [${u.id}]: SN: ${u.serial_number || 'NO-SN'} | Barcode: ${u.barcode} | Status: ${u.status} | Order/Sale ID: ${u.order_id || 'NONE'} | Notes: ${u.notes || 'NONE'}`);
  });

  // 15. Products current stock
  console.log('\n--- PRODUCTS CATALOG & STOCK COUNTS ---');
  (products || []).forEach(p => {
    console.log(`   - ${p.name} (ID: ${p.id}): Price: ${p.price} | count_in_stock: ${p.count_in_stock}`);
  });
}

runMatrixAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
