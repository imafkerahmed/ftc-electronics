import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

const supabase = getAdminSupabase();

async function auditSalesAndStock() {
  console.log('=== DEEP SALES & INVENTORY TRACE ===\n');

  // 1. Fetch all sales with sale_items
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select(`
      id,
      receipt_number,
      invoice_number,
      cashier_name,
      customer_name,
      customer_email,
      total,
      payment_method,
      status,
      payment_terms,
      due_date,
      invoice_revoked_at,
      invoice_revoke_reason,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (sErr) throw sErr;

  const { data: saleItems, error: siErr } = await supabase
    .from('sale_items')
    .select('*');
  if (siErr) throw siErr;

  const { data: payments, error: pErr } = await supabase
    .from('sale_payments')
    .select('*');
  if (pErr) throw pErr;

  const { data: reversals, error: rErr } = await supabase
    .from('sale_payment_reversals')
    .select('*');
  if (rErr) throw rErr;

  const { data: stockUnits, error: suErr } = await supabase
    .from('stock_management')
    .select('*');
  if (suErr) throw suErr;

  console.log(`Total Sales: ${sales.length}`);
  console.log(`Total Sale Items: ${saleItems.length}`);
  console.log(`Total Sale Payments: ${payments.length}`);
  console.log(`Total Reversals: ${reversals.length}`);
  console.log(`Total Serialized Units: ${stockUnits.length}\n`);

  // Map items to sales
  const itemsBySale = new Map<string, any[]>();
  saleItems.forEach(item => {
    const list = itemsBySale.get(item.sale_id) || [];
    list.push(item);
    itemsBySale.set(item.sale_id, list);
  });

  // Map payments to sales
  const paymentsBySale = new Map<string, any[]>();
  payments.forEach(p => {
    const list = paymentsBySale.get(p.sale_id) || [];
    list.push(p);
    paymentsBySale.set(p.sale_id, list);
  });

  // Map reversals to sales
  const reversalsBySale = new Map<string, any[]>();
  reversals.forEach(r => {
    const list = reversalsBySale.get(r.sale_id) || [];
    list.push(r);
    reversalsBySale.set(r.sale_id, list);
  });

  // Map stock_management to order_id / sale_id
  const stockUnitsByOrder = new Map<string, any[]>();
  stockUnits.forEach(u => {
    if (u.order_id) {
      const list = stockUnitsByOrder.get(u.order_id) || [];
      list.push(u);
      stockUnitsByOrder.set(u.order_id, list);
    }
  });

  // Print all sales with their items, payments, reversals, and stock impact
  sales.forEach((s, idx) => {
    const items = itemsBySale.get(s.id) || [];
    const pays = paymentsBySale.get(s.id) || [];
    const revs = reversalsBySale.get(s.id) || [];
    const linkedUnits = stockUnitsByOrder.get(s.id) || [];

    console.log(`[#${idx + 1}] Sale ID: ${s.id}`);
    console.log(`     Invoice#: ${s.invoice_number || 'NONE'} | Receipt#: ${s.receipt_number || 'NONE'} | Total: ${s.total}`);
    console.log(`     Customer: ${s.customer_name || s.customer_email || 'Walk-in'} | Status: ${s.status} | Revoked: ${s.invoice_revoked_at ? 'YES' : 'NO'}`);
    console.log(`     Created: ${s.created_at}`);
    console.log(`     Items (${items.length}): ${items.map(i => `${i.product_name} (Qty: ${i.quantity}, Unit: ${i.unit_price}, ProdID: ${i.product_id || 'null'})`).join('; ')}`);
    console.log(`     Payments (${pays.length}): ${pays.map(p => `${p.payment_method} (${p.amount}, Status: ${p.status}, Chq: ${p.cheque_number || 'N/A'})`).join('; ')}`);
    console.log(`     Reversals (${revs.length}): ${revs.map(r => `${r.reversal_number} (${r.amount}, Reason: ${r.reason})`).join('; ')}`);
    console.log(`     Linked Stock Units in stock_management: ${linkedUnits.length > 0 ? linkedUnits.map(u => u.serial_number || u.barcode).join(', ') : 'NONE'}`);
    console.log('----------------------------------------------------------------------');
  });
}

auditSalesAndStock().catch(err => {
  console.error(err);
  process.exit(1);
});
