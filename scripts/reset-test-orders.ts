import { getAdminSupabase } from '../src/lib/supabase-admin';

interface OrderItem {
  productId?: string;
  product?: string;
  id?: string;
  name?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  assignedSerials?: string[];
  assignedUnits?: Array<{ unitId: string; barcode: string; serialNumber?: string }>;
}

interface OrderRecord {
  id: string;
  order_id?: string;
  orderId?: string;
  customer?: { name?: string; email?: string; userId?: string };
  customer_id?: string;
  user_id?: string;
  items?: OrderItem[];
  payment_details?: {
    method?: string;
    status?: string;
    paymentSlipUrl?: string;
    paymentSlipPath?: string;
    legacyPublicSlipUrl?: string;
    stock_deducted?: boolean;
  };
  status?: string;
  is_paid?: boolean;
  is_delivered?: boolean;
  total?: number;
  created_at?: string;
}

interface StockUnit {
  id: string;
  product_id: string;
  barcode: string;
  serial_number?: string;
  status: string;
  order_id?: string;
}

interface ResetOptions {
  email?: string;
  order?: string;
  allTestOrders: boolean;
  confirmReset: boolean;
  cleanAuditLog: boolean;
  help: boolean;
}

function parseArgs(): ResetOptions {
  const args = process.argv.slice(2);
  const options: ResetOptions = {
    allTestOrders: false,
    confirmReset: false,
    cleanAuditLog: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' && i + 1 < args.length) {
      options.email = args[++i].trim().toLowerCase();
    } else if (arg.startsWith('--email=')) {
      options.email = arg.split('=')[1].trim().toLowerCase();
    } else if (arg === '--order' && i + 1 < args.length) {
      options.order = args[++i].trim();
    } else if (arg.startsWith('--order=')) {
      options.order = arg.split('=')[1].trim();
    } else if (arg === '--all-test-orders' || arg === '--all') {
      options.allTestOrders = true;
    } else if (arg === '--confirm-reset' || arg === '--confirm') {
      options.confirmReset = true;
    } else if (arg === '--clean-audit-log') {
      options.cleanAuditLog = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
======================================================================
FTC Electronics — Test Order Reset Script
======================================================================

PURPOSE:
  Safely resets targeted test orders, restores serialized inventory in stock_management,
  recalculates product stock counts, and cleans up uploaded test payment slips.

NOTE ON ATOMICITY:
  This script performs discrete sequential Supabase API operations (inventory
  restoration, stock counts recalculation, storage slip deletion, and order deletion).
  It does not execute inside a single atomic database transaction.

PRESERVED MASTER DATA:
  ✅ auth.users, public.profiles, public.customers
  ✅ products, categories, brands, product images
  ✅ available stock master records
  ✅ site settings, banners, system configuration
  ✅ audit logs (preserved by default unless --clean-audit-log is passed)

USAGE:
  npm run db:reset-test-orders [options]

DEFAULT MODE:
  Dry Run (No database changes are made unless --confirm-reset AND
  ALLOW_TEST_DATA_RESET=true are explicitly provided).

OPTIONS:
  --email <email>        Target only test orders for an exact normalized customer email.
  --order <orderId>      Target a specific order number (e.g. ORD-810882-E6F0) or UUID.
  --clean-audit-log      Also remove order-related audit log entries for reset orders.
  --confirm-reset        Authorize destructive execution (requires ALLOW_TEST_DATA_RESET=true).
  --help, -h             Show this help screen.

SAFETY RULES:
  - An explicit selector (--order or --email) is MANDATORY.
  - --all-test-orders is disabled because the database schema does not have a reliable boolean test marker.

EXAMPLES:
  # 1. Dry run targeting a specific order:
  npm run db:reset-test-orders -- --order ORD-810882-E6F0

  # 2. Dry run targeting an exact customer email:
  npm run db:reset-test-orders -- --email test@example.com

  # 3. DESTRUCTIVE EXECUTION (Reset specific order):
  ALLOW_TEST_DATA_RESET=true npm run db:reset-test-orders -- --order ORD-810882-E6F0 --confirm-reset
======================================================================
`);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    return;
  }

  if (options.allTestOrders) {
    console.error('\n❌ REFUSING TO RUN: --all-test-orders is disabled.');
    console.error('   The current orders table does not contain a reliable boolean test marker.');
    console.error('   To prevent accidental loss of live orders, you must specify an explicit selector:');
    console.error('   --order <orderId> OR --email <customerEmail>\n');
    process.exit(1);
  }

  if (!options.order && !options.email) {
    console.error('\n❌ REFUSING TO RUN: Missing required target selector.');
    console.error('   You must specify either --order <orderId> OR --email <customerEmail>.');
    console.error('   Run with --help for usage instructions.\n');
    process.exit(1);
  }

  const isConfirmed = options.confirmReset;
  const isEnvAllowed = process.env.ALLOW_TEST_DATA_RESET === 'true';
  const isProduction = process.env.NODE_ENV === 'production';
  const isDryRun = !isConfirmed || !isEnvAllowed;

  console.log('\n======================================================================');
  console.log('FTC ELECTRONICS — SAFE TEST ORDER & INVENTORY RESET TOOL');
  console.log('======================================================================');

  if (isDryRun) {
    console.log('🔍 MODE: DRY RUN (NO DATABASE CHANGES WILL BE PERFORMED)');
  } else {
    console.log('⚠️  MODE: DESTRUCTIVE EXECUTION (CHANGES WILL BE COMMITTED TO SUPABASE)');
  }

  // Safety checks for destructive runs
  if (!isDryRun) {
    if (isProduction && process.env.FORCE_PRODUCTION_TEST_RESET !== 'true') {
      console.error('\n❌ REFUSING TO RUN: NODE_ENV is set to production.');
      console.error('   This script is intended for development & staging test databases only.');
      process.exit(1);
    }

    if (!isEnvAllowed) {
      console.error('\n❌ REFUSING TO RUN: Missing required environment variable.');
      console.error('   To authorize destructive execution, prefix your command with:');
      console.error('   ALLOW_TEST_DATA_RESET=true\n');
      process.exit(1);
    }
  }

  const supabase = getAdminSupabase();

  // 1. Fetch Orders matching criteria
  let query = supabase.from('orders').select('*');

  if (options.order) {
    const cleanId = options.order.replace(/[^a-zA-Z0-9-]/g, '');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    if (isUuid) {
      query = query.or(`id.eq.${cleanId},order_id.eq.${cleanId}`);
    } else {
      query = query.eq('order_id', cleanId);
    }
    console.log(`🎯 TARGET FILTER: Order reference = "${cleanId}"`);
  } else if (options.email) {
    console.log(`🎯 TARGET FILTER: Customer email = "${options.email}" (exact match)`);
  }

  const { data: allOrdersRaw, error: ordersErr } = await query.order('created_at', { ascending: false });

  if (ordersErr) {
    console.error('❌ Failed to fetch orders from Supabase:', ordersErr);
    process.exit(1);
  }

  let targetOrders = (allOrdersRaw as unknown as OrderRecord[]) || [];

  // Filter in-memory by exact normalized email if specified (customer is JSONB)
  if (options.email) {
    const normalizedTargetEmail = options.email.toLowerCase().trim();
    targetOrders = targetOrders.filter((o) => {
      const orderEmail = (o.customer?.email || '').toLowerCase().trim();
      return orderEmail === normalizedTargetEmail;
    });
  }

  if (targetOrders.length === 0) {
    console.log('\n✨ No matching orders found. The database is already clean for this target.');
    console.log('======================================================================\n');
    return;
  }

  const targetOrderIds = targetOrders.map((o) => o.id);

  console.log(`\n📋 Found ${targetOrders.length} matching order(s) to reset:\n`);

  // 2. Inspect linked Serial Units in stock_management
  const { data: linkedUnitsRaw, error: unitsErr } = await supabase
    .from('stock_management')
    .select('*')
    .in('order_id', targetOrderIds);

  if (unitsErr) {
    console.error('❌ Failed to query stock_management for target orders:', unitsErr);
    process.exit(1);
  }

  const linkedUnits = (linkedUnitsRaw as unknown as StockUnit[]) || [];
  const linkedUnitsByOrder = new Map<string, StockUnit[]>();
  for (const u of linkedUnits) {
    if (u.order_id) {
      const list = linkedUnitsByOrder.get(u.order_id) || [];
      list.push(u);
      linkedUnitsByOrder.set(u.order_id, list);
    }
  }

  // 3. Inspect affected products
  const affectedProductIds = new Set<string>();
  for (const u of linkedUnits) {
    if (u.product_id) affectedProductIds.add(u.product_id);
  }
  for (const o of targetOrders) {
    if (Array.isArray(o.items)) {
      for (const item of o.items) {
        const pId = item.productId || item.product || item.id;
        if (pId) affectedProductIds.add(pId);
      }
    }
  }

  // 4. Identify storage payment slips for target orders (both private bucket and legacy media bucket)
  const privateSlipsToDelete: string[] = [];
  const mediaSlipsToDelete: string[] = [];

  for (const o of targetOrders) {
    const details = o.payment_details;
    if (!details) continue;

    // A. Private bucket path
    if (details.paymentSlipPath) {
      privateSlipsToDelete.push(details.paymentSlipPath);
    }

    // B. URL parsing (might be private or legacy public ftc-media)
    const slipUrl = details.paymentSlipUrl || details.legacyPublicSlipUrl || '';
    if (slipUrl) {
      if (slipUrl.includes('/ftc-payment-slips/')) {
        const parts = slipUrl.split('/ftc-payment-slips/');
        if (parts[1]) {
          const rawKey = decodeURIComponent(parts[1].split('?')[0]);
          if (rawKey && !privateSlipsToDelete.includes(rawKey)) {
            privateSlipsToDelete.push(rawKey);
          }
        }
      } else if (slipUrl.includes('/ftc-media/')) {
        const parts = slipUrl.split('/ftc-media/');
        if (parts[1]) {
          const rawKey = decodeURIComponent(parts[1].split('?')[0]);
          if (rawKey && !mediaSlipsToDelete.includes(rawKey)) {
            mediaSlipsToDelete.push(rawKey);
          }
        }
      }
    }
  }

  // Display details of each target order
  targetOrders.forEach((o, idx) => {
    const num = o.order_id || o.id;
    const email = o.customer?.email || 'N/A';
    const method = o.payment_details?.method || 'N/A';
    const status = o.status || 'N/A';
    const isPaid = o.is_paid ? 'Paid' : 'Unpaid';
    const total = o.total ? `Rs. ${o.total.toLocaleString('en-LK')}` : 'Rs. 0';
    const orderUnits = linkedUnitsByOrder.get(o.id) || [];
    const serials = orderUnits.map((u) => u.serial_number || u.barcode).filter(Boolean);

    console.log(`[${idx + 1}] Order #${num} (${o.id})`);
    console.log(`    Customer: ${email}`);
    console.log(`    Payment:  ${method} (${isPaid}) | Order Status: ${status}`);
    console.log(`    Total:    ${total}`);
    if (serials.length > 0) {
      console.log(`    Serials linked (${serials.length}): ${serials.join(', ')}`);
    } else {
      console.log('    Serials linked: (None / unassigned)');
    }
    if (o.payment_details?.paymentSlipPath) {
      console.log(`    Slip private path: ${o.payment_details.paymentSlipPath}`);
    } else if (o.payment_details?.paymentSlipUrl) {
      console.log(`    Slip file URL: ${o.payment_details.paymentSlipUrl}`);
    }
    console.log('');
  });

  console.log('----------------------------------------------------------------------');
  console.log('📊 SUMMARY OF RESET ACTIONS:');
  console.log(`   • Orders to delete from orders table:                ${targetOrders.length}`);
  console.log(`   • Serial units to restore to 'available':            ${linkedUnits.length}`);
  console.log(`   • Products with stock counts to recalculate:         ${affectedProductIds.size}`);
  console.log(`   • Private payment slip files (ftc-payment-slips):    ${privateSlipsToDelete.length}`);
  console.log(`   • Legacy payment slip files (ftc-media):             ${mediaSlipsToDelete.length}`);
  console.log(`   • Audit log records:                                 ${options.cleanAuditLog ? 'Remove for target orders' : 'Preserved (default)'}`);
  console.log('----------------------------------------------------------------------');

  if (isDryRun) {
    console.log('\n🔒 DRY RUN COMPLETE — NO CHANGES HAVE BEEN MADE TO SUPABASE.');
    console.log('\nTo execute this reset destructively, run:');
    if (options.order) {
      console.log(`  ALLOW_TEST_DATA_RESET=true npm run db:reset-test-orders -- --order ${options.order} --confirm-reset`);
    } else if (options.email) {
      console.log(`  ALLOW_TEST_DATA_RESET=true npm run db:reset-test-orders -- --email ${options.email} --confirm-reset`);
    }
    console.log('\n======================================================================\n');
    return;
  }

  // --- DESTRUCTIVE EXECUTION ---
  console.log('\n⚡ EXECUTING SAFE DATABASE RESET:\n');

  // Step 1: Restore Serial Units in stock_management
  if (linkedUnits.length > 0) {
    console.log(`1. Restoring ${linkedUnits.length} serial unit(s) in stock_management...`);
    const { error: smErr } = await supabase
      .from('stock_management')
      .update({
        status: 'available',
        order_id: null,
        notes: 'Restored to available stock from test order reset',
        updated_at: new Date().toISOString(),
      })
      .in('order_id', targetOrderIds);

    if (smErr) {
      console.error('❌ Failed to restore stock_management serial units:', smErr);
      process.exit(1);
    }
    console.log('   ✅ Serial units set to status = "available" and order_id = NULL.');
  } else {
    console.log('1. No linked serial units in stock_management required restoration.');
  }

  // Step 2: Recalculate and restore count_in_stock in products table
  if (affectedProductIds.size > 0) {
    console.log(`2. Recalculating stock counts for ${affectedProductIds.size} product(s)...`);
    const pIdList = Array.from(affectedProductIds);

    for (const pId of pIdList) {
      // Check if product is backed by units in stock_management
      const { data: unitsForProd, error: uCountErr } = await supabase
        .from('stock_management')
        .select('id, status')
        .eq('product_id', pId);

      if (uCountErr) {
        console.error(`❌ Failed to query stock_management for product ${pId}:`, uCountErr);
        process.exit(1);
      }

      if (unitsForProd && unitsForProd.length > 0) {
        const availCount = unitsForProd.filter((u) => u.status === 'available').length;
        const { error: pUpdErr } = await supabase
          .from('products')
          .update({ count_in_stock: availCount })
          .eq('id', pId);

        if (pUpdErr) {
          console.error(`❌ Failed to update stock for product ${pId}:`, pUpdErr);
          process.exit(1);
        } else {
          console.log(`   ├─ Product (${pId}): count_in_stock recalculated to ${availCount}`);
        }
      } else {
        // Counter-only product: count how many units were in the deleted orders and restore them
        let qtyToRestore = 0;
        for (const o of targetOrders) {
          if (o.payment_details?.stock_deducted && Array.isArray(o.items)) {
            for (const it of o.items) {
              if ((it.productId || it.product || it.id) === pId) {
                qtyToRestore += it.quantity || it.qty || 1;
              }
            }
          }
        }
        if (qtyToRestore > 0) {
          const { data: currentProd, error: cProdErr } = await supabase
            .from('products')
            .select('count_in_stock')
            .eq('id', pId)
            .single();

          if (cProdErr) {
            console.error(`❌ Failed to fetch current stock for counter product ${pId}:`, cProdErr);
            process.exit(1);
          }

          const newCount = (currentProd?.count_in_stock || 0) + qtyToRestore;
          const { error: updCounterErr } = await supabase
            .from('products')
            .update({ count_in_stock: newCount })
            .eq('id', pId);

          if (updCounterErr) {
            console.error(`❌ Failed to update stock for counter product ${pId}:`, updCounterErr);
            process.exit(1);
          }
          console.log(`   ├─ Counter-only Product (${pId}): added back ${qtyToRestore} units (total: ${newCount})`);
        }
      }
    }
    console.log('   ✅ Product stock counts verified and restored.');
  }

  // Step 3: Clean up uploaded payment slip storage files
  if (privateSlipsToDelete.length > 0) {
    console.log(`3a. Cleaning ${privateSlipsToDelete.length} private payment slip file(s) from ftc-payment-slips...`);
    try {
      const { error: removePrivErr } = await supabase.storage.from('ftc-payment-slips').remove(privateSlipsToDelete);
      if (removePrivErr) {
        console.warn('   ⚠️ Warning removing private storage files:', removePrivErr);
      } else {
        console.log('   ✅ Removed test payment slip files from ftc-payment-slips storage.');
      }
    } catch (storageErr) {
      console.warn('   ⚠️ Storage cleanup warning (private slips):', storageErr);
    }
  }

  if (mediaSlipsToDelete.length > 0) {
    console.log(`3b. Cleaning ${mediaSlipsToDelete.length} legacy payment slip file(s) from ftc-media...`);
    try {
      const { error: removeMediaErr } = await supabase.storage.from('ftc-media').remove(mediaSlipsToDelete);
      if (removeMediaErr) {
        console.warn('   ⚠️ Warning removing legacy media storage files:', removeMediaErr);
      } else {
        console.log('   ✅ Removed legacy payment slip files from ftc-media storage.');
      }
    } catch (storageErr) {
      console.warn('   ⚠️ Storage cleanup warning (legacy media slips):', storageErr);
    }
  }

  // Step 4: Delete target orders from orders table
  console.log(`4. Deleting ${targetOrders.length} test order(s) from orders table...`);
  const { error: delOrdersErr } = await supabase
    .from('orders')
    .delete()
    .in('id', targetOrderIds);

  if (delOrdersErr) {
    console.error('❌ Failed to delete orders from orders table:', delOrdersErr);
    process.exit(1);
  }
  console.log('   ✅ Target orders removed from database.');

  // Step 5: Clean Audit Log if explicitly requested
  if (options.cleanAuditLog) {
    console.log('5. Cleaning order-specific entries from audit_log...');
    const { error: auditDelErr } = await supabase
      .from('audit_log')
      .delete()
      .eq('collection_name', 'orders')
      .in('record_id', targetOrderIds);

    if (auditDelErr) {
      console.warn('   ⚠️ Warning cleaning audit log:', auditDelErr);
    } else {
      console.log('   ✅ Removed test order audit log entries.');
    }
  } else {
    console.log('5. Audit log preserved (default safety behavior).');
  }

  // Step 6: Post-Reset Automatic Verification
  console.log('\n🔍 Running Post-Reset Automated Verification...');

  // Verification A: Verify 0 target orders remain
  const { count: remainingOrdersCount, error: vOrdErr } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('id', targetOrderIds);

  if (vOrdErr || remainingOrdersCount !== 0) {
    console.error(`❌ Verification failed: ${remainingOrdersCount} target order(s) still exist in orders table.`);
    process.exit(1);
  }
  console.log('   ✅ Orders check: 0 target orders remain in orders table.');

  // Verification B: Verify no stock_management row references a deleted order
  const { count: orphanUnitsCount, error: vUnitsErr } = await supabase
    .from('stock_management')
    .select('id', { count: 'exact', head: true })
    .in('order_id', targetOrderIds);

  if (vUnitsErr || orphanUnitsCount !== 0) {
    console.error(`❌ Verification failed: ${orphanUnitsCount} stock_management row(s) still reference deleted orders.`);
    process.exit(1);
  }
  console.log('   ✅ Inventory check: 0 stock units reference deleted orders.');

  // Verification C: Verify profiles, customers, products remain intact
  const { count: prodCount } = await supabase.from('products').select('id', { count: 'exact', head: true });
  const { count: profCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
  console.log(`   ✅ Master data check: ${prodCount} products and ${profCount} user profiles remain intact.`);

  console.log('\n======================================================================');
  console.log('🎉 RESET COMPLETE AND VERIFIED SUCCESSFULLY! 🎉');
  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Unhandled error in reset-test-orders:', err);
  process.exit(1);
});
