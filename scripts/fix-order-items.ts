import { getAdminPb } from '../src/lib/pb-admin';
import { OrderItem } from '../src/types/order';

async function main() {
  const isApply = process.argv.includes('--apply');
  const targetOrderId = process.argv.find((arg) => arg.startsWith('--order='))?.split('=')[1] || 'ORD-546489-334';

  const adminPb = await getAdminPb();
  const orderRecord = await adminPb.collection('orders').getFirstListItem(
    adminPb.filter('orderId = {:targetOrderId} || id = {:targetOrderId}', { targetOrderId })
  ).catch(() => null);

  if (!orderRecord) {
    console.log(`[fix-order-items] Order ${targetOrderId} not found.`);
    return;
  }

  // Redacted diagnostic logging
  console.log(`[fix-order-items] Order found: ID=${orderRecord.id}, OrderNo=${orderRecord.orderId}, Status=${orderRecord.status}`);

  if (!Array.isArray(orderRecord.items) || orderRecord.items.length === 0) {
    console.log('[fix-order-items] Order has no items to consolidate.');
    return;
  }

  const consolidated: OrderItem[] = [];
  for (const item of orderRecord.items) {
    if (!item || typeof item !== 'object') continue;

    const productId = String(item.productId || item.product || item.id || '');
    const name = String(item.name || 'Product');
    const slug = String(item.slug || productId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const price = Number(item.price || 0);
    const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    const image = typeof item.image === 'string' ? item.image : '';

    const key = productId || name;
    const existing = consolidated.find((x) => (x.productId || x.id || x.name) === key);

    if (existing) {
      existing.quantity += quantity;
    } else {
      consolidated.push({
        id: productId || item.id || `item-${consolidated.length + 1}`,
        productId,
        name,
        slug,
        price,
        quantity,
        image,
      });
    }
  }

  console.log(`[fix-order-items] Item count before: ${orderRecord.items.length}, after consolidation: ${consolidated.length}`);

  if (!isApply) {
    console.log('[fix-order-items] DRY RUN complete. Run with --apply to apply updates to PocketBase.');
    return;
  }

  await adminPb.collection('orders').update(orderRecord.id, {
    items: consolidated,
  });

  console.log(`✅ [fix-order-items] Successfully updated order ${orderRecord.orderId || orderRecord.id}.`);
}

main().catch(console.error);
