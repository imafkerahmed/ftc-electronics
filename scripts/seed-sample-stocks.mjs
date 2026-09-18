import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site/';
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || 'admin@ftc.lk';
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD;

async function seedSampleStocks() {
  console.log('📦 Seeding sample stock purchases and unit barcodes...');
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
  console.log(`Found ${products.length} products.`);

  for (const prod of products) {
    console.log(`Processing stock for: ${prod.name} (Current Stock: ${prod.countInStock})`);
    
    // Check existing stock purchases
    const existingPurchases = await pb.collection('stock_purchases').getList(1, 5, {
      filter: `product = "${prod.id}"`,
    });

    if (existingPurchases.items.length === 0) {
      const batchNo = `PO-2026-${prod.name.slice(0, 3).toUpperCase()}-01`;
      const stockQty = prod.countInStock || 15;

      // Create Inbound Purchase Record
      await pb.collection('stock_purchases').create({
        product: prod.id,
        batchNumber: batchNo,
        quantity: stockQty,
        unitCost: Math.round(prod.price * 0.7),
        supplier: `${prod.brand || 'Official'} Dist. Lanka`,
        purchaseDate: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
        notes: 'Initial inventory stock receipt',
      });

      // Create Outbound Sample Sale Record
      await pb.collection('stock_purchases').create({
        product: prod.id,
        batchNumber: `SALE-ORD-89401`,
        quantity: -2,
        unitCost: prod.price,
        supplier: 'Customer Online Sale',
        purchaseDate: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
        notes: 'Online customer purchase #ORD-89401',
      });

      console.log(`  ✓ Created stock purchase records for ${prod.name}`);
    }

    // Check existing stock management unit barcodes
    const existingUnits = await pb.collection('stock_management').getList(1, 5, {
      filter: `product = "${prod.id}"`,
    });

    if (existingUnits.items.length === 0) {
      const brandCode = (prod.name || 'FTC').slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
      const totalUnits = Math.min(10, prod.countInStock || 10);

      for (let i = 1; i <= totalUnits; i++) {
        const barcode = `STK-${brandCode}-${prod.id.slice(-4).toUpperCase()}-${1000 + i}`;
        const serialNumber = `SN-${brandCode}-${Date.now().toString().slice(-4)}-${i}`;
        const status = i > totalUnits - 2 ? 'sold' : 'available';

        try {
          await pb.collection('stock_management').create({
            product: prod.id,
            barcode,
            serialNumber,
            status,
            batchNumber: `PO-2026-${brandCode}-01`,
            notes: status === 'sold' ? 'Sold online order #ORD-89401' : 'In stock ready for dispatch',
          });
        } catch (err) {
          // Ignore unique barcode collisions if any
        }
      }

      console.log(`  ✓ Generated ${totalUnits} unit barcodes for ${prod.name}`);
    }
  }

  console.log('🎉 Sample stock seeding complete!');
}

seedSampleStocks();
