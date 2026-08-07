import { getAdminPb } from '../src/lib/pb-admin';

async function main() {
  const adminPb = await getAdminPb();
  const units = await adminPb.collection('stock_management').getFullList();

  console.log(`Total stock_management units in PocketBase: ${units.length}`);
  units.forEach((u, i) => {
    console.log(`\nUnit #${i + 1}:`);
    console.log(`  id: ${u.id}`);
    console.log(`  product: ${u.product}`);
    console.log(`  barcode: ${u.barcode}`);
    console.log(`  serialNumber: ${u.serialNumber}`);
    console.log(`  status: ${u.status}`);
    console.log(`  orderId: ${u.orderId}`);
    console.log(`  created: ${u.created}`);
  });
}

main().catch(console.error);
