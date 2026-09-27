import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function detailedAudit() {
  console.log('=== DETAILED AUDIT FOR TEST RESET ===\n');

  // 1. Sales
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`Total Sales: ${sales?.length || 0}`);
  const salesList = sales || [];

  // Categorize sales
  const uatTestSales: any[] = [];
  const manualTestSales: any[] = [];
  const otherSales: any[] = [];

  salesList.forEach((s) => {
    const isUat = (s.customer_name && s.customer_name.includes('UAT')) ||
                  (s.receipt_number && s.receipt_number.includes('UAT')) ||
                  (s.invoice_number && s.invoice_number.includes('UAT')) ||
                  (s.customer_email && s.customer_email.includes('uat'));
    
    if (isUat) {
      uatTestSales.push(s);
    } else {
      manualTestSales.push(s);
    }
  });

  console.log(` - UAT Automated Test Sales: ${uatTestSales.length}`);
  console.log(` - Manual / Other Sales: ${manualTestSales.length}`);

  console.log('\n--- LIST OF ALL SALES ---');
  salesList.forEach((s, idx) => {
    console.log(`[#${idx + 1}] ID: ${s.id} | Inv: ${s.invoice_number || 'NONE'} | Rec: ${s.receipt_number || 'NONE'} | Type: ${s.sale_type} | Cust: ${s.customer_name || s.customer_email || 'N/A'} | Total: ${s.total_amount} | Status: ${s.status} | PayStatus: ${s.payment_status} | Revoked: ${s.invoice_revoked_at ? 'YES (' + s.invoice_revoke_reason + ')' : 'NO'} | Created: ${s.created_at}`);
  });

  // 2. Sale items & stock deduction audit
  const { data: saleItems } = await supabase.from('sale_items').select('*');
  console.log(`\nTotal Sale Items: ${saleItems?.length || 0}`);

  const saleItemProductMap: Record<string, { qty: number; product_name: string }> = {};
  (saleItems || []).forEach((item) => {
    const pid = item.product_id;
    if (!saleItemProductMap[pid]) {
      saleItemProductMap[pid] = { qty: 0, product_name: item.product_name || item.name || 'Unknown' };
    }
    saleItemProductMap[pid].qty += (item.quantity || 1);
  });

  console.log('\nProduct quantities referenced in sale_items:');
  for (const [pid, info] of Object.entries(saleItemProductMap)) {
    console.log(` - Product [${pid}] (${info.product_name}): Total Qty in sale_items = ${info.qty}`);
  }

  // 3. Sale Payments
  const { data: payments } = await supabase.from('sale_payments').select('*').order('created_at', { ascending: false });
  console.log(`\nTotal Sale Payments: ${payments?.length || 0}`);
  (payments || []).forEach((p, idx) => {
    console.log(`[Pay #${idx + 1}] ID: ${p.id} | SaleID: ${p.sale_id} | Amount: ${p.amount} | Method: ${p.payment_method} | Status: ${p.status} | Chq#: ${p.cheque_number || 'N/A'} | Bank: ${p.bank_name || 'N/A'}`);
  });

  // 4. Sale Payment Reversals
  const { data: reversals } = await supabase.from('sale_payment_reversals').select('*').order('created_at', { ascending: false });
  console.log(`\nTotal Sale Payment Reversals: ${reversals?.length || 0}`);
  (reversals || []).forEach((r, idx) => {
    console.log(`[Rev #${idx + 1}] ID: ${r.id} | PayID: ${r.payment_id} | SaleID: ${r.sale_id} | Rev#: ${r.reversal_number} | Amount: ${r.amount} | Reason: ${r.reason}`);
  });

  // 5. Quotations
  const { data: quotations } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
  console.log(`\nTotal Quotations: ${quotations?.length || 0}`);
  (quotations || []).forEach((q, idx) => {
    console.log(`[Quo #${idx + 1}] ID: ${q.id} | Quote#: ${q.quote_number || q.number} | Cust: ${q.customer_name} | Total: ${q.total_amount} | Status: ${q.status} | Created: ${q.created_at}`);
  });

  // 6. Orders
  const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
  console.log(`\nTotal Storefront Orders: ${orders?.length || 0}`);
  (orders || []).forEach((o, idx) => {
    console.log(`[Order #${idx + 1}] ID: ${o.id} | OrderID: ${o.order_id} | Total: ${o.total} | Status: ${o.status} | Paid: ${o.is_paid} | Invoiced: ${o.invoice_number || 'NONE'} | Cust: ${o.customer?.name || o.customer?.email} | Created: ${o.created_at}`);
  });

  // 7. Stock Management table
  const { data: stockMgmt } = await supabase.from('stock_management').select('*');
  console.log(`\nTotal Stock Management rows: ${stockMgmt?.length || 0}`);
  (stockMgmt || []).forEach((sm) => {
    console.log(` - ProductID: ${sm.product_id}, Stock: ${sm.current_stock || sm.stock_quantity || sm.quantity || JSON.stringify(sm)}`);
  });

  // 8. Products
  const { data: products } = await supabase.from('products').select('id, name, sku, count_in_stock');
  console.log(`\nProducts in DB: ${products?.length || 0}`);
  (products || []).forEach(p => {
    console.log(` - Product [${p.id}]: ${p.name} (SKU: ${p.sku}) | count_in_stock = ${p.count_in_stock}`);
  });
}

detailedAudit();
