import 'dotenv/config';
import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '.env.local'), override: true });

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log('====================================================');
  console.log('FTC Electronics: Bank Transfer Slip Storage Migration');
  console.log(`Mode: ${isApply ? '🚀 APPLY (Live Migration)' : '🔍 DRY-RUN (Safe Scan Only)'}`);
  console.log('====================================================\n');

  const { getAdminSupabase } = await import('../src/lib/supabase-admin');
  const supabase = getAdminSupabase();

  // Ensure target private bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const targetBucketExists = buckets?.some((b) => b.id === 'ftc-payment-slips');
  if (!targetBucketExists) {
    if (isApply) {
      console.log('Creating private bucket "ftc-payment-slips"...');
      const { error: createErr } = await supabase.storage.createBucket('ftc-payment-slips', {
        public: false,
        fileSizeLimit: 10485760,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
      });
      if (createErr) {
        throw new Error('Failed to create target private bucket: ' + createErr.message);
      }
    } else {
      console.log('ℹ️ Note: Target bucket "ftc-payment-slips" will be created upon apply.');
    }
  }

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('id, order_id, payment_details, notes');

  if (ordersErr) {
    throw new Error('Failed to load orders: ' + ordersErr.message);
  }

  const stats = {
    ordersScanned: orders?.length || 0,
    alreadyPrivateSlips: 0,
    publicSlipsFound: 0,
    missingObjects: 0,
    objectsCopied: 0,
    recordsUpdated: 0,
    publicOriginalsDeleted: 0,
    failures: 0,
  };

  for (const order of orders || []) {
    const pd = order.payment_details || {};
    const slipPath = pd.paymentSlipPath;
    const slipUrl = pd.paymentSlipUrl || pd.paymentSlip;

    if (slipPath) {
      stats.alreadyPrivateSlips++;
      continue;
    }

    if (!slipUrl || typeof slipUrl !== 'string') {
      continue;
    }

    // Detect public slip reference
    stats.publicSlipsFound++;
    console.log(`[Order ${order.order_id || order.id}] Found public slip reference: ${slipUrl}`);

    // Extract storage key from URL
    let sourceBucket = 'ftc-media';
    let sourcePath = '';

    if (slipUrl.includes('ftc-media/')) {
      sourceBucket = 'ftc-media';
      sourcePath = decodeURIComponent(slipUrl.split('ftc-media/')[1] || '');
    } else if (slipUrl.includes('payment-slips/')) {
      sourceBucket = 'ftc-media';
      const after = decodeURIComponent(slipUrl.split('payment-slips/')[1] || '');
      sourcePath = `payment-slips/${after}`;
    } else if (slipUrl.startsWith('slips/')) {
      sourceBucket = 'ftc-media';
      sourcePath = slipUrl;
    } else {
      // Fallback: check if raw filename
      sourcePath = slipUrl.replace(/^\/+/, '');
    }

    if (!sourcePath) {
      console.warn(` - Warning: Unable to parse storage path from "${slipUrl}". Skipping.`);
      stats.missingObjects++;
      continue;
    }

    // Determine target private path: orders/{orderId}/{uniqueId}.ext
    const ext = sourcePath.split('.').pop() || 'png';
    const targetPath = `orders/${order.id}/${crypto.randomUUID()}.${ext}`;

    if (!isApply) {
      console.log(` - [DRY-RUN] Would migrate "${sourceBucket}/${sourcePath}" -> "ftc-payment-slips/${targetPath}"`);
      continue;
    }

    // ── LIVE APPLY ──
    try {
      // 1. Download from public storage
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from(sourceBucket)
        .download(sourcePath);

      if (downloadErr || !fileData) {
        console.error(` - ❌ Missing object in source bucket: ${downloadErr?.message || 'Empty data'}`);
        stats.missingObjects++;
        stats.failures++;
        continue;
      }

      // 2. Upload to private storage
      const buffer = await fileData.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from('ftc-payment-slips')
        .upload(targetPath, buffer, {
          contentType: fileData.type || 'image/png',
          upsert: false,
        });

      if (uploadErr) {
        console.error(` - ❌ Failed to upload to private bucket: ${uploadErr.message}`);
        stats.failures++;
        continue;
      }
      stats.objectsCopied++;

      // 3. Delete old public original
      const { error: deleteErr } = await supabase.storage
        .from(sourceBucket)
        .remove([sourcePath]);

      if (deleteErr) {
        console.warn(` - ⚠️ Warning: Migrated to private storage but failed to remove source object: ${deleteErr.message}`);
      } else {
        stats.publicOriginalsDeleted++;
        console.log(` - ✅ Migrated & deleted public original successfully.`);
      }

      // 4. Update database record
      const updatedPd: Record<string, any> = { ...pd, paymentSlipPath: targetPath };
      if (!deleteErr) {
        delete updatedPd.paymentSlipUrl;
        delete updatedPd.paymentSlip;
        delete updatedPd.legacyPublicSlipUrl;
      } else {
        updatedPd.legacyPublicSlipUrl = slipUrl;
      }

      const { error: dbErr } = await supabase
        .from('orders')
        .update({
          payment_details: updatedPd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);

      if (dbErr) {
        console.error(` - ❌ Failed to update DB record: ${dbErr.message}`);
        stats.failures++;
        continue;
      }
      stats.recordsUpdated++;
    } catch (opErr: any) {
      console.error(` - ❌ Operation error on order ${order.id}:`, opErr.message || opErr);
      stats.failures++;
    }
  }

  console.log('\n====================================================');
  console.log('MIGRATION SUMMARY:');
  console.log(`- Orders Scanned:            ${stats.ordersScanned}`);
  console.log(`- Already Private Slips:     ${stats.alreadyPrivateSlips}`);
  console.log(`- Public Slips Found:        ${stats.publicSlipsFound}`);
  console.log(`- Missing/Unreachable:       ${stats.missingObjects}`);
  console.log(`- Objects Copied:            ${stats.objectsCopied}`);
  console.log(`- Records Updated in DB:     ${stats.recordsUpdated}`);
  console.log(`- Public Originals Deleted:  ${stats.publicOriginalsDeleted}`);
  console.log(`- Failures:                  ${stats.failures}`);
  console.log('====================================================\n');

  if (!isApply && stats.publicSlipsFound > 0) {
    console.log('💡 To apply the migration, re-run with:');
    console.log('   npm run migrate:payment-slips -- --apply');
  }
}

main().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
