import { getAdminPb } from '../src/lib/pb-admin';

async function main() {
  const adminPb = await getAdminPb();

  // Reset STK-CZ0CH-86291-2 and STK-CZ0CH-86453-3 back to available
  const barcodesToReset = ['STK-CZ0CH-86291-2', 'STK-CZ0CH-86453-3'];

  for (const barcode of barcodesToReset) {
    try {
      const record = await adminPb.collection('stock_management').getFirstListItem(`barcode = "${barcode}"`);
      if (record) {
        await adminPb.collection('stock_management').update(record.id, {
          status: 'available',
          orderId: '',
          notes: 'Restored to available stock after manual serial reassignment',
        });
        console.log(`✅ Restored unit ${barcode} to status = available`);
      }
    } catch (err) {
      console.error(`Failed to update ${barcode}:`, err);
    }
  }
}

main().catch(console.error);
