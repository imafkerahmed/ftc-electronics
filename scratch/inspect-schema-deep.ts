import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function inspectSchema() {
  // Let's inspect all sales
  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('*');

  console.log('--- SALES (Raw) ---');
  if (salesErr) console.error(salesErr);
  console.log(`Count: ${sales?.length || 0}`);
  if (sales && sales.length > 0) {
    console.log('First sale sample columns:', Object.keys(sales[0]));
    console.log('All sales summary:');
    sales.forEach(s => {
      console.log(` - ID: ${s.id}, Invoice#: ${s.invoice_number}, Receipt#: ${s.receipt_number}, Type: ${s.sale_type}, Status: ${s.status}, PaymentStatus: ${s.payment_status}, RevokedAt: ${s.invoice_revoked_at}, CreatedAt: ${s.created_at}, Customer: ${s.customer_name || s.customer_email}`);
    });
  }

  // Let's inspect sale_items
  const { data: saleItems, error: itemsErr } = await supabase
    .from('sale_items')
    .select('*');

  console.log('\n--- SALE ITEMS (Raw) ---');
  if (itemsErr) console.error(itemsErr);
  console.log(`Count: ${saleItems?.length || 0}`);
  if (saleItems && saleItems.length > 0) {
    console.log('Sample item:', saleItems[0]);
    saleItems.forEach(item => {
      console.log(` - SaleID: ${item.sale_id}, ProductID: ${item.product_id}, Name: ${item.product_name || item.name}, Qty: ${item.quantity}, Price: ${item.unit_price || item.price}`);
    });
  }

  // Let's inspect sale_payments
  const { data: payments, error: payErr } = await supabase
    .from('sale_payments')
    .select('*');

  console.log('\n--- SALE PAYMENTS (Raw) ---');
  if (payErr) console.error(payErr);
  console.log(`Count: ${payments?.length || 0}`);
  if (payments && payments.length > 0) {
    console.log('Sample payment:', payments[0]);
    payments.forEach(p => {
      console.log(` - PaymentID: ${p.id}, SaleID: ${p.sale_id}, Amount: ${p.amount}, Method: ${p.payment_method}, Status: ${p.status}, Chq#: ${p.cheque_number}, Bank: ${p.bank_name}, Created: ${p.created_at}`);
    });
  }

  // Let's inspect sale_payment_reversals
  const { data: reversals, error: revErr } = await supabase
    .from('sale_payment_reversals')
    .select('*');

  console.log('\n--- SALE PAYMENT REVERSALS (Raw) ---');
  if (revErr) console.error(revErr);
  console.log(`Count: ${reversals?.length || 0}`);
  if (reversals && reversals.length > 0) {
    console.log('Sample reversal:', reversals[0]);
    reversals.forEach(r => {
      console.log(` - RevID: ${r.id}, PaymentID: ${r.payment_id}, SaleID: ${r.sale_id}, Rev#: ${r.reversal_number}, Amount: ${r.amount}, Reason: ${r.reason}, Created: ${r.created_at}`);
    });
  }

  // Let's inspect quotations
  const { data: quotations, error: qErr } = await supabase
    .from('quotations')
    .select('*');

  console.log('\n--- QUOTATIONS (Raw) ---');
  if (qErr) console.error(qErr);
  console.log(`Count: ${quotations?.length || 0}`);
  if (quotations && quotations.length > 0) {
    console.log('Sample quotation:', quotations[0]);
    quotations.forEach(q => {
      console.log(` - QID: ${q.id}, Q#: ${q.quote_number || q.quotation_number || q.number}, Status: ${q.status}, Customer: ${q.customer_name}, Total: ${q.total_amount || q.total}, ConvertedSaleID: ${q.converted_sale_id || q.sale_id}`);
    });
  }

  // Let's inspect orders
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('*');

  console.log('\n--- ORDERS (Raw) ---');
  if (ordErr) console.error(ordErr);
  console.log(`Count: ${orders?.length || 0}`);
  if (orders && orders.length > 0) {
    console.log('Sample order:', orders[0]);
    orders.forEach(o => {
      console.log(` - OrderID: ${o.id}, Status: ${o.status}, PaymentStatus: ${o.payment_status}, CustomerID: ${o.customer_id || o.user_id}, Total: ${o.total || o.total_price || o.total_amount}`);
    });
  }

  // Check inventory deduction logic / stock_management / products
  console.log('\n--- INVENTORY & STOCK MANAGEMENT TABLES ---');
  const { data: stockMgmt, error: smErr } = await supabase
    .from('stock_management')
    .select('*');
  if (smErr) console.log('stock_management error:', smErr.message);
  else console.log(`stock_management count: ${stockMgmt?.length || 0}`);

  // Let's check products
  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, count_in_stock')
    .order('name');
  console.log(`Total Products in catalog: ${products?.length || 0}`);
  console.log('Sample products:');
  (products || []).slice(0, 10).forEach(p => {
    console.log(` - [${p.sku || 'NO-SKU'}] ${p.name}: count_in_stock = ${p.count_in_stock}`);
  });
}

inspectSchema();
