import { config } from 'dotenv';
config({ path: '.env.local' });
import { getAdminSupabase } from '../src/lib/supabase-admin';

async function test() {
  const supabase = getAdminSupabase();

  // 1. inquiries
  const { data: inquiries, error: inqErr } = await supabase
    .from('contact_inquiries')
    .select('id, name, message, status, read, created_at')
    .or('status.eq.new,read.eq.false')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Inquiries:', inquiries, inqErr);

  // 2. orders
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id, order_id, customer, total, status, is_paid, payment_details, created_at')
    .not('status', 'in', '("cancelled","refunded","returned")')
    .or('status.eq.pending,status.eq.processing,is_paid.is.false')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Orders:', orders?.length, ordErr);

  // 3. quotations
  const { data: quotes, error: qErr } = await supabase
    .from('quotations')
    .select('id, customer_name, items, status, created_at')
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Quotations:', quotes?.length, qErr);

  // 4. products
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, count_in_stock, updated_at, created_at')
    .gte('count_in_stock', 0)
    .lte('count_in_stock', 3)
    .order('count_in_stock', { ascending: true })
    .limit(5);
  console.log('Products:', products?.length, pErr);
}

test().catch(console.error);
