import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site/';
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || 'admin@ftc.lk';
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD;

async function clearSampleStocks() {
  console.log('🧹 Clearing sample stock purchase records and stock management unit barcodes...');
  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  try {
    await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
    console.log('🔑 Authenticated as superuser.');
  } catch (err) {
    console.error('Failed to auth as superuser:', err);
    process.exit(1);
  }

  // 1. Clear stock_purchases
  const purchases = await pb.collection('stock_purchases').getFullList();
  console.log(`Found ${purchases.length} stock purchase records to remove.`);
  for (const pur of purchases) {
    try {
      await pb.collection('stock_purchases').delete(pur.id);
    } catch (e) {
      console.warn(`Failed to delete stock_purchases record ${pur.id}:`, e);
    }
  }
  console.log('✓ Cleared all stock_purchases records.');

  // 2. Clear stock_management
  const units = await pb.collection('stock_management').getFullList();
  console.log(`Found ${units.length} stock management unit barcodes to remove.`);
  for (const unit of units) {
    try {
      await pb.collection('stock_management').delete(unit.id);
    } catch (e) {
      console.warn(`Failed to delete stock_management record ${unit.id}:`, e);
    }
  }
  console.log('✓ Cleared all stock_management barcode units.');

  console.log('✨ Dummy stock data successfully wiped!');
}

clearSampleStocks();
