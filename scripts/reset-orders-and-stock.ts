import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site/';
const adminEmail = process.env.POCKETBASE_SUPERUSER_EMAIL || 'admin@ftc.lk';
const adminPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD || 'Admin123';

async function resetSystemOrdersAndStock() {
  console.log('🚀 Starting PocketBase backend reset script...');
  console.log(`📡 Connecting to PocketBase at: ${pbUrl}`);

  const pb = new PocketBase(pbUrl);

  try {
    // Authenticate as Superuser/Admin
    await pb.admins.authWithPassword(adminEmail, adminPassword);
    console.log(`✅ Authenticated successfully as superuser: ${adminEmail}\n`);

    // 1. Clear all records from 'orders' collection
    console.log('🗑️  Step 1: Clearing all orders...');
    let deletedOrdersCount = 0;
    try {
      const orders = await pb.collection('orders').getFullList();
      for (const order of orders) {
        await pb.collection('orders').delete(order.id);
        deletedOrdersCount++;
      }
      console.log(`   └─ Successfully deleted ${deletedOrdersCount} order(s).`);
    } catch (err: any) {
      console.warn(`   └─ Warning clearing orders: ${err?.message || err}`);
    }

    // 2. Clear outbound sales logs from 'stock_purchases' collection
    console.log('\n🗑️  Step 2: Clearing outbound sales logs from stock_purchases...');
    let deletedSalesLogsCount = 0;
    try {
      const purchases = await pb.collection('stock_purchases').getFullList();
      for (const p of purchases) {
        if (p.quantity < 0 || p.batchNumber?.startsWith('SALE-') || p.batchNumber?.startsWith('POS-')) {
          await pb.collection('stock_purchases').delete(p.id);
          deletedSalesLogsCount++;
        }
      }
      console.log(`   └─ Successfully deleted ${deletedSalesLogsCount} sales log record(s).`);
    } catch (err: any) {
      console.warn(`   └─ Warning clearing sales logs: ${err?.message || err}`);
    }

    // 3. Reset all records in 'stock_management' collection to 'available'
    console.log('\n🔄 Step 3: Resetting stock_management units to available...');
    let resetUnitsCount = 0;
    try {
      const units = await pb.collection('stock_management').getFullList();
      for (const unit of units) {
        await pb.collection('stock_management').update(unit.id, {
          status: 'available',
          orderId: '',
          notes: 'Restored to available inventory upon backend system reset',
        });
        resetUnitsCount++;
      }
      console.log(`   └─ Successfully reset ${resetUnitsCount} inventory serial unit(s) to 'available'.`);
    } catch (err: any) {
      console.warn(`   └─ Warning resetting stock units: ${err?.message || err}`);
    }

    // 4. Update product countInStock based on available stock_management units or positive purchase quantities
    console.log('\n📦 Step 4: Restoring product stock counts in products collection...');
    let updatedProductsCount = 0;
    try {
      const products = await pb.collection('products').getFullList();
      for (const prod of products) {
        let availableCount = 0;
        try {
          const availUnits = await pb.collection('stock_management').getFullList({
            filter: `product = "${prod.id}" && status = "available"`,
          });
          availableCount = availUnits.length;
        } catch {}

        if (availableCount > 0) {
          await pb.collection('products').update(prod.id, { countInStock: availableCount });
          updatedProductsCount++;
          console.log(`   ├─ Product "${prod.name}": countInStock restored to ${availableCount}`);
        } else {
          // If no units exist in stock_management, calculate total from positive stock_purchases
          let purchaseSum = 0;
          try {
            const purchases = await pb.collection('stock_purchases').getFullList({
              filter: `product = "${prod.id}" && quantity > 0`,
            });
            purchaseSum = purchases.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0);
          } catch {}

          const restoredStock = purchaseSum > 0 ? purchaseSum : Math.max(10, prod.countInStock || 10);
          await pb.collection('products').update(prod.id, { countInStock: restoredStock });
          updatedProductsCount++;
          console.log(`   ├─ Product "${prod.name}": countInStock set to ${restoredStock}`);
        }
      }
      console.log(`   └─ Successfully updated stock counts for ${updatedProductsCount} product(s).`);
    } catch (err: any) {
      console.warn(`   └─ Warning updating product stock counts: ${err?.message || err}`);
    }

    console.log('\n🎉 Backend System Reset Complete!');
    console.log(`   • Orders Deleted: ${deletedOrdersCount}`);
    console.log(`   • Sales Logs Deleted: ${deletedSalesLogsCount}`);
    console.log(`   • Serial Units Restored: ${resetUnitsCount}`);
    console.log(`   • Products Restored: ${updatedProductsCount}`);

  } catch (err: any) {
    console.error('❌ Failed to run backend reset script:', err?.message || err);
    process.exit(1);
  }
}

void resetSystemOrdersAndStock();
