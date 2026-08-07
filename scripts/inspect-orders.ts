import { getAdminPb } from '../src/lib/pb-admin';

async function main() {
  const adminPb = await getAdminPb();
  const orders = await adminPb.collection('orders').getFullList({
    sort: '-created',
  });

  console.log(`Total orders in PocketBase: ${orders.length}`);
  orders.forEach((o, i) => {
    console.log(`\nOrder #${i + 1}:`);
    console.log(`  id: ${o.id}`);
    console.log(`  orderId: ${o.orderId}`);
    console.log(`  status: ${o.status}`);
    console.log(`  isPaid: ${o.isPaid}`);
    console.log(`  customer: ${JSON.stringify(o.customer)}`);
    console.log(`  user: ${o.user}`);
    console.log(`  items (${o.items?.length}):`, JSON.stringify(o.items, null, 2));
    console.log(`  created: ${o.created}`);
  });
}

main().catch(console.error);
