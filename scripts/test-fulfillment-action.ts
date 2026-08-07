import { getAdminPb } from '../src/lib/pb-admin';

async function main() {
  const adminPb = await getAdminPb();
  const order = await adminPb.collection('orders').getFirstListItem('');
  console.log(`Testing with order: ${order.orderId} (id: ${order.id})`);

  const item = order.items[0];
  const productId = item.productId;
  console.log(`Item productId: ${productId}`);

  const units = await adminPb.collection('stock_management').getFullList({
    filter: `product = "${productId}" && (status = "available" || status = "reserved" || orderId = "${order.id}" || orderId = "${order.orderId}")`,
  });

  console.log(`Found ${units.length} units for fulfillment dropdown:`);
  units.forEach((u) => {
    console.log(`  - Barcode: ${u.barcode} | S/N: ${u.serialNumber} | Status: ${u.status}`);
  });
}

main().catch(console.error);
