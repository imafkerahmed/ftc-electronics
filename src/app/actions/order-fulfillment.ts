'use server';

import { revalidatePath } from 'next/cache';
import { getAdminSupabase, writeAuditLog } from '@/lib/supabase-admin';
import { checkPermission } from '@/app/actions/admin';
import { sendOrderShippingEmail } from '@/lib/email';
import type { ShippingAddress } from '@/types/order';

interface StockUnitRecord {
  id: string;
  product_id: string;
  barcode?: string | null;
  serial_number?: string | null;
  batch_number?: string | null;
  status?: string | null;
}

export interface AvailableUnitInfo {
  id: string;
  productId: string;
  barcode: string;
  serialNumber?: string;
  batchNumber?: string;
}

export interface OrderFulfillmentItem {
  productId: string;
  name: string;
  quantity: number;
  availableUnits: AvailableUnitInfo[];
  assignedUnits: Array<{ unitId: string; barcode: string; serialNumber?: string }>;
}

export interface OrderFulfillmentDetails {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string | Partial<ShippingAddress> | null;
  items: OrderFulfillmentItem[];
}

export interface SerialAssignmentPayload {
  orderId: string;
  courierName?: string;
  trackingNumber?: string;
  assignments: Array<{
    productId: string;
    unitId: string;
    barcode: string;
    serialNumber?: string;
  }>;
}

export async function getAvailableUnitsForOrderAction(orderId: string): Promise<{
  success: boolean;
  fulfillmentDetails?: OrderFulfillmentDetails;
  error?: string;
}> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) {
      return { success: false, error: 'Invalid order ID.' };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
    } else {
      query = query.eq('order_id', cleanOrderId);
    }
    const { data: order, error } = await query.maybeSingle();

    if (error || !order) {
      return { success: false, error: 'Order not found.' };
    }

    const itemsRaw = Array.isArray(order.items) ? order.items : [];
    const fulfillmentItems: OrderFulfillmentItem[] = [];

    for (const item of itemsRaw) {
      const productId = item.productId || item.product || item.id || '';
      const qty = item.quantity || item.qty || 1;
      const orderIdStr = order.order_id || '';
      const recordIdStr = order.id || '';

      let availableUnits: AvailableUnitInfo[] = [];
      if (productId) {
        try {
          const { data: units } = await supabase
            .from('stock_management')
            .select('*')
            .eq('product_id', productId)
            .eq('status', 'available');

          availableUnits = ((units as unknown as StockUnitRecord[]) || []).map((u) => ({
            id: u.id,
            productId: u.product_id,
            barcode: u.barcode || '',
            serialNumber: u.serial_number || u.barcode || '',
            batchNumber: u.batch_number || '',
          }));
        } catch (err) {
          console.warn(`[getAvailableUnitsForOrderAction] Failed fetching units for product ${productId}:`, err);
        }
      }

      if (availableUnits.length === 0) {
        for (let uIdx = 1; uIdx <= qty; uIdx++) {
          const generatedSn = `SN-${(item.name || 'PROD').replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}-${(orderIdStr || 'ORD').slice(-6)}-0${uIdx}`;
          availableUnits.push({
            id: `custom_${productId}_${uIdx}`,
            productId,
            barcode: generatedSn,
            serialNumber: generatedSn,
            batchNumber: `AUTO-${orderIdStr}`,
          });
        }
      }

      fulfillmentItems.push({
        productId,
        name: item.name || 'Product',
        quantity: qty,
        availableUnits,
        assignedUnits: Array.isArray(item.assignedUnits) ? item.assignedUnits : [],
      });
    }

    const customerEmail = order.customer?.email || order.customerEmail || order.email || '';
    const customerName = order.customer?.name || order.customerName || 'Customer';

    return {
      success: true,
      fulfillmentDetails: {
        orderId: order.id,
        orderNumber: order.order_id || order.id,
        customerName,
        customerEmail,
        shippingAddress: order.shipping_address || null,
        items: fulfillmentItems,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load fulfillment data.';
    console.error('[getAvailableUnitsForOrderAction] Error:', err);
    return { success: false, error: message };
  }
}

export async function shipOrderWithSerialsAction(payload: SerialAssignmentPayload): Promise<{
  success: boolean;
  error?: string;
}> {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', payload.orderId)
      .maybeSingle();

    if (error || !order) {
      return { success: false, error: 'Order record not found.' };
    }

    const itemsRaw: Array<{
      productId?: string;
      product?: string;
      id?: string;
      name?: string;
      quantity?: number;
      qty?: number;
      assignedSerials?: string[];
      assignedUnits?: Array<{ unitId: string; barcode: string; serialNumber?: string }>;
    }> = Array.isArray(order.items) ? order.items : [];

    if (itemsRaw.length === 0) {
      return { success: false, error: 'Order contains no items to fulfill.' };
    }

    // 1. Consolidate required quantities by product ID
    const requiredByProduct = new Map<string, { qty: number; name: string }>();
    for (const item of itemsRaw) {
      const pId = (item.productId || item.product || item.id || '').trim();
      const rawQty = item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : 1);
      if (!pId) {
        return { success: false, error: 'Order contains an item with a missing product identifier.' };
      }
      if (!Number.isInteger(rawQty) || rawQty <= 0) {
        return { success: false, error: `Invalid item quantity (${rawQty}) for product "${item.name || pId}".` };
      }
      const prev = requiredByProduct.get(pId);
      requiredByProduct.set(pId, {
        qty: (prev?.qty || 0) + rawQty,
        name: item.name || prev?.name || pId,
      });
    }

    // 2. Validate physical unit uniqueness across entire payload
    const seenUnits = new Set<string>();
    for (const assignment of payload.assignments || []) {
      const key = (assignment.unitId || assignment.barcode || assignment.serialNumber || '').trim();
      if (key) {
        if (seenUnits.has(key)) {
          return {
            success: false,
            error: `Duplicate physical unit assignment detected: "${key}". Each physical unit can only be assigned once.`,
          };
        }
        seenUnits.add(key);
      }
    }

    // 3. Group assignments by product and reject unknown products not in the order
    const assignmentsByProduct = new Map<string, typeof payload.assignments>();
    for (const assignment of payload.assignments || []) {
      const pId = (assignment.productId || '').trim();
      if (!pId) {
        return { success: false, error: 'Each assignment must specify a valid productId.' };
      }
      if (!requiredByProduct.has(pId)) {
        return {
          success: false,
          error: `Assignment contains product (${pId}) which is not part of this order.`,
        };
      }
      const list = assignmentsByProduct.get(pId) || [];
      list.push(assignment);
      assignmentsByProduct.set(pId, list);
    }

    // 4. Validate exact cardinality for each required product
    for (const [pId, req] of requiredByProduct.entries()) {
      const assigned = assignmentsByProduct.get(pId) || [];
      if (assigned.length !== req.qty) {
        return {
          success: false,
          error: `Product "${req.name}" requires ${req.qty} assigned serial unit(s), but ${assigned.length} were provided.`,
        };
      }
    }

    // 5. Construct updatedItems distributing assigned units across duplicate order lines without reusing units
    const productAssignmentCursors = new Map<string, number>();
    for (const pId of requiredByProduct.keys()) {
      productAssignmentCursors.set(pId, 0);
    }

    const updatedItems = itemsRaw.map((item) => {
      const pId = (item.productId || item.product || item.id || '').trim();
      const lineQty = item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : 1);
      const allAssignments = assignmentsByProduct.get(pId) || [];
      const cursor = productAssignmentCursors.get(pId) || 0;
      const lineAssignments = allAssignments.slice(cursor, cursor + lineQty);
      productAssignmentCursors.set(pId, cursor + lineQty);

      return {
        ...item,
        assignedSerials: lineAssignments.map((m) => m.serialNumber || m.barcode).filter(Boolean),
        assignedUnits: lineAssignments.map((m) => ({
          unitId: m.unitId,
          barcode: m.barcode,
          serialNumber: m.serialNumber,
        })),
      };
    });

    // 6. Atomically claim physical units in stock_management BEFORE changing order status
    const realUnitIds: string[] = [];
    const barcodeAssignments: Array<{ barcode: string; productId: string }> = [];

    for (const assignment of payload.assignments || []) {
      const uId = (assignment.unitId || '').trim();
      if (uId && !uId.startsWith('custom_') && /^[0-9a-f-]{36}$/i.test(uId)) {
        realUnitIds.push(uId);
      } else if (assignment.barcode && !assignment.barcode.startsWith('SN-')) {
        barcodeAssignments.push({ barcode: assignment.barcode.trim(), productId: assignment.productId.trim() });
      }
    }

    const claimedUnitIds: string[] = [];

    if (realUnitIds.length > 0) {
      const { data: claimed, error: claimErr } = await supabase
        .from('stock_management')
        .update({ status: 'sold', order_id: order.id })
        .in('id', realUnitIds)
        .eq('status', 'available')
        .select('id');

      if (claimErr || (claimed?.length ?? 0) !== realUnitIds.length) {
        if (claimed && claimed.length > 0) {
          await supabase
            .from('stock_management')
            .update({ status: 'available', order_id: null })
            .in('id', claimed.map((c) => c.id))
            .eq('order_id', order.id);
        }
        return {
          success: false,
          error: 'One or more serial units are no longer available or were claimed concurrently.',
        };
      }
      claimedUnitIds.push(...claimed.map((c) => c.id));
    }

    // Claim barcode-only physical assignments
    for (const bAssignment of barcodeAssignments) {
      const { data: claimedB, error: bClaimErr } = await supabase
        .from('stock_management')
        .update({ status: 'sold', order_id: order.id })
        .eq('barcode', bAssignment.barcode)
        .eq('product_id', bAssignment.productId)
        .eq('status', 'available')
        .select('id');

      if (bClaimErr || !claimedB || claimedB.length === 0) {
        // Roll back any previously claimed units
        if (claimedUnitIds.length > 0) {
          await supabase
            .from('stock_management')
            .update({ status: 'available', order_id: null })
            .in('id', claimedUnitIds)
            .eq('order_id', order.id);
        }
        return {
          success: false,
          error: `Barcode unit (${bAssignment.barcode}) is no longer available.`,
        };
      }
      claimedUnitIds.push(...claimedB.map((c) => c.id));
    }

    // 7. Update count_in_stock for affected unit-backed products
    const affectedProductIds = Array.from(requiredByProduct.keys());
    for (const pId of affectedProductIds) {
      const { count, error: countErr } = await supabase
        .from('stock_management')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', pId)
        .eq('status', 'available');

      if (!countErr && typeof count === 'number') {
        const { data: hasAnyUnits } = await supabase
          .from('stock_management')
          .select('id')
          .eq('product_id', pId)
          .limit(1);

        if (hasAnyUnits && hasAnyUnits.length > 0) {
          await supabase.from('products').update({ count_in_stock: count }).eq('id', pId);
        }
      }
    }

    // 8. Update order status and items now that inventory mutations succeeded
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        items: updatedItems,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('[shipOrderWithSerialsAction] Order update failed, rolling back inventory:', updateError);
      // Compensating rollback for inventory
      if (claimedUnitIds.length > 0) {
        await supabase
          .from('stock_management')
          .update({ status: 'available', order_id: null })
          .in('id', claimedUnitIds)
          .eq('order_id', order.id);
      }
      // Revert product counts
      for (const pId of affectedProductIds) {
        const { count } = await supabase
          .from('stock_management')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', pId)
          .eq('status', 'available');
        if (typeof count === 'number') {
          await supabase.from('products').update({ count_in_stock: count }).eq('id', pId);
        }
      }
      return {
        success: false,
        error: 'Failed to update order to shipped state. Inventory was rolled back.',
      };
    }

    // 9. Write audit log ONLY on complete success
    await writeAuditLog(
      check.actorEmail!,
      'update',
      'orders',
      order.id,
      { status: order.status },
      { status: 'shipped', courierName: payload.courierName, trackingNumber: payload.trackingNumber },
      { ip: check.ip, userAgent: check.userAgent }
    );

    // 10. Send shipping email
    try {
      const customerEmail = order.customer?.email || order.customerEmail || order.email;
      if (customerEmail) {
        await sendOrderShippingEmail({
          to: customerEmail,
          orderNumber: order.order_id || order.id,
          customerName: order.customer?.name || 'Customer',
          shippingAddress: order.shipping_address,
          courierName: payload.courierName || 'Standard Courier',
          trackingNumber: payload.trackingNumber || '',
          items: updatedItems.map((i) => ({
            name: i.name || 'Product',
            qty: i.quantity || i.qty || 1,
            serials: Array.isArray(i.assignedSerials) ? i.assignedSerials : [],
          })),
        });
      }
    } catch (emailErr) {
      console.error('[shipOrderWithSerialsAction] Failed sending shipping email:', emailErr);
    }

    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/admin/products');
    revalidatePath('/account/orders');
    revalidatePath('/products');

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process shipping fulfillment.';
    console.error('[shipOrderWithSerialsAction] Error:', err);
    return { success: false, error: message };
  }
}
