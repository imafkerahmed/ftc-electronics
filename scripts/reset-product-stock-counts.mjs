import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site/';
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || 'admin@ftc.lk';
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD;

async function resetProductStockCounts() {
  console.log('🔄 Resetting product countInStock to 0 across PocketBase products collection...');
  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  try {
    await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
    console.log('🔑 Authenticated as superuser.');
  } catch (err) {
    console.error('Failed to auth as superuser:', err);
    process.exit(1);
  }

  const products = await pb.collection('products').getFullList();
  console.log(`Found ${products.length} products to update stock count.`);

  for (const prod of products) {
    try {
      await pb.collection('products').update(prod.id, { countInStock: 0 });
      console.log(`  ✓ Reset countInStock to 0 for ${prod.name}`);
    } catch (err) {
      console.warn(`Failed to update ${prod.name}:`, err);
    }
  }

  console.log('✨ All product stock counts reset to 0!');
}

resetProductStockCounts();
