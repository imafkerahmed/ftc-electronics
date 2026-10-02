import { getAdminSupabase } from '../src/lib/supabase-admin';

async function main() {
  const adminSupabase = getAdminSupabase();
  const { data: orderRecord, error } = await adminSupabase
    .from('orders')
    .select('*')
    .eq('order_id', 'ORD-211103-993')
    .single();

  if (error || !orderRecord) {
    console.log('Order ORD-211103-993 not found');
    return;
  }

  // Deduplicate array elements
  const singleItem = [
    {
      image: 'anker_power_bank_moslnnsjx0.jpg',
      name: 'Anker MagGo Power Bank (10K)',
      price: 21500,
      productId: 'p5d7r0m00vcz0ch',
      quantity: 1,
      slug: 'anker-maggo-power-bank-10k'
    }
  ];

  await adminSupabase.from('orders').update({
    items: singleItem,
  }).eq('id', orderRecord.id);

  console.log('✅ Updated order ORD-211103-993 items to 1 unit');
}

main().catch(console.error);
