import { getAdminSupabase } from '../src/lib/supabase-admin';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function resetSystemOrdersAndStock() {
  console.log('🚀 Starting Supabase backend reset script...');

  const isEnvAllowed = process.env.ALLOW_DATA_RESET === 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isEnvAllowed) {
    console.error('\n❌ REFUSING TO RUN: Missing required environment variable.');
    console.error('   To authorize destructive execution, prefix your command with:');
    console.error('   ALLOW_DATA_RESET=true\n');
    process.exit(1);
  }

  if (isProduction && process.env.FORCE_PRODUCTION_DATA_RESET !== 'true') {
    console.error('\n❌ REFUSING TO RUN: NODE_ENV is set to production.');
    console.error('   This script is intended for development & staging databases only.\n');
    process.exit(1);
  }

  const supabase = getAdminSupabase();

  try {
    // 1. Clear all records from 'orders' collection
    console.log('🗑️  Step 1: Clearing all orders...');
    let deletedOrdersCount = 0;
    const { data: orders, error: fetchOrdersErr } = await supabase.from('orders').select('id');
    if (fetchOrdersErr) {
      throw new Error(`Failed to fetch orders: ${fetchOrdersErr.message}`);
    }
    if (orders && orders.length > 0) {
      const { error: delOrdersErr } = await supabase.from('orders').delete().in('id', orders.map(o => o.id));
      if (delOrdersErr) {
        throw new Error(`Failed to delete orders: ${delOrdersErr.message}`);
      }
      deletedOrdersCount = orders.length;
    }
    console.log(`   └─ Successfully deleted ${deletedOrdersCount} order(s).`);

    // 2. Clear outbound sales logs from 'stock_purchases'
    console.log('\n🗑️  Step 2: Clearing outbound sales logs from stock_purchases...');
    let deletedSalesLogsCount = 0;
    const { data: purchases, error: fetchPurchasesErr } = await supabase.from('stock_purchases').select('id, quantity, batch_number');
    if (fetchPurchasesErr) {
      throw new Error(`Failed to fetch stock_purchases: ${fetchPurchasesErr.message}`);
    }
    if (purchases) {
      const toDelete = purchases.filter(p => (p.quantity < 0 || p.batch_number?.startsWith('SALE-') || p.batch_number?.startsWith('POS-'))).map(p => p.id);
      if (toDelete.length > 0) {
        const { error: delPurchasesErr } = await supabase.from('stock_purchases').delete().in('id', toDelete);
        if (delPurchasesErr) {
          throw new Error(`Failed to delete sales logs: ${delPurchasesErr.message}`);
        }
        deletedSalesLogsCount = toDelete.length;
      }
    }
    console.log(`   └─ Successfully deleted ${deletedSalesLogsCount} sales log record(s).`);

    // 3. Reset all records in 'stock_management' collection to 'available'
    console.log('\n🔄 Step 3: Resetting stock_management units to available...');
    let resetUnitsCount = 0;
    const { data: units, error: resetErr } = await supabase.from('stock_management').update({
      status: 'available',
      order_id: null,
      notes: 'Restored to available inventory upon backend system reset',
      updated_at: new Date().toISOString(),
    }).neq('id', '00000000-0000-0000-0000-000000000000').select('id');
    if (resetErr) {
      throw new Error(`Failed to reset stock units: ${resetErr.message}`);
    }
    resetUnitsCount = units ? units.length : 0;
    console.log(`   └─ Successfully reset ${resetUnitsCount} inventory serial unit(s) to 'available'.`);

    console.log('\n🎉 Backend System Reset Complete!');
    console.log(`   • Orders Deleted: ${deletedOrdersCount}`);
    console.log(`   • Sales Logs Deleted: ${deletedSalesLogsCount}`);
    console.log(`   • Serial Units Restored: ${resetUnitsCount}`);

  } catch (err: any) {
    console.error('❌ Failed to run backend reset script:', err?.message || err);
    process.exit(1);
  }
}

void resetSystemOrdersAndStock();
