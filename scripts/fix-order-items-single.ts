import { getAdminPb } from '../src/lib/pb-admin';

async function main() {
  const adminPb = await getAdminPb();
  const orderRecord = await adminPb.collection('orders').getFirstListItem(`orderId = "ORD-211103-993"`);

  if (!orderRecord) {
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

  await adminPb.collection('orders').update(orderRecord.id, {
    items: singleItem,
  });

  console.log('✅ Updated order ORD-211103-993 items to 1 unit');
}

main().catch(console.error);
