'use server';

import { revalidatePath } from 'next/cache';
import { getAdminPb, writeAuditLog } from '@/lib/pb-admin';
import { checkPermission } from '@/app/actions/admin';
import { sendOrderShippingEmail } from '@/lib/email';
import { pbOrders } from '@/lib/pb-collections';

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
  shippingAddress: any;
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

/**
 * Fetches order details along with available stock_management units for each item product in the order.
 */
export async function getAvailableUnitsForOrderAction(orderId: string): Promise<{
  success: boolean;
  fulfillmentDetails?: OrderFulfillmentDetails;
  error?: string;
}> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();
    let order: any = null;

    try {
      order = await adminPb.collection('orders').getOne(orderId);
    } catch {
      try {
        order = await adminPb.collection('orders').getFirstListItem(`orderId = "${orderId}"`);
      } catch {
        return { success: false, error: 'Order not found.' };
      }
    }

    const itemsRaw = Array.isArray(order.items) ? order.items : [];
    const fulfillmentItems: OrderFulfillmentItem[] = [];

    for (const item of itemsRaw) {
      const productId = item.productId || item.product || item.id || '';
      const qty = item.quantity || item.qty || 1;
      const orderIdStr = order.orderId || '';
      const recordIdStr = order.id || '';

      let availableUnits: AvailableUnitInfo[] = [];
      if (productId) {
        try {
          // Query units matching product and available/reserved OR linked to this order by order.id or order.orderId
          const units = await adminPb.collection('stock_management').getFullList({
            filter: `product = "${productId}" && (status = "available" || status = "reserved" || orderId = "${recordIdStr}" || orderId = "${orderIdStr}")`,
          });

          availableUnits = units.map((u: any) => ({
            id: u.id,
            productId: u.product,
            barcode: u.barcode || '',
            serialNumber: u.serialNumber || u.barcode || '',
            batchNumber: u.batchNumber || '',
          }));
        } catch (err) {
          console.warn(`[getAvailableUnitsForOrderAction] Failed fetching units for product ${productId}:`, err);
        }
      }

      // If no units exist in stock_management yet for this product, generate fallback candidates
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
        orderNumber: order.orderId || order.id,
        customerName,
        customerEmail,
        shippingAddress: order.shippingAddress,
        items: fulfillmentItems,
      },
    };
  } catch (err: any) {
    console.error('[getAvailableUnitsForOrderAction] Error:', err);
    return { success: false, error: err.message || 'Failed to load fulfillment data.' };
  }
}

/**
 * Fulfills an order by assigning specific physical unit barcodes/serial numbers, updating status to 'shipped',
 * marking units as 'sold', and sending the customer shipping notification email.
 */
export async function shipOrderWithSerialsAction(payload: SerialAssignmentPayload): Promise<{
  success: boolean;
  error?: string;
}> {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();
    const order = await adminPb.collection('orders').getOne(payload.orderId);

    if (!order) {
      return { success: false, error: 'Order record not found.' };
    }

    const itemsRaw = Array.isArray(order.items) ? order.items : [];
    let totalRequiredQty = 0;
    for (const i of itemsRaw) {
      totalRequiredQty += i.quantity || i.qty || 1;
    }

    if (payload.assignments.length < totalRequiredQty) {
      return {
        success: false,
        error: `Please assign serial numbers for all ${totalRequiredQty} required unit(s). Currently assigned: ${payload.assignments.length}`,
      };
    }

    // 0. Release any previously linked units for this order that were NOT selected in this shipment assignment
    const selectedUnitIds = new Set(payload.assignments.map((a) => a.unitId).filter(Boolean));
    try {
      const filterStr = order.orderId ? `orderId = "${order.id}" || orderId = "${order.orderId}"` : `orderId = "${order.id}"`;
      const previouslyLinked = await adminPb.collection('stock_management').getFullList({
        filter: filterStr,
      });

      for (const prevUnit of previouslyLinked) {
        if (!selectedUnitIds.has(prevUnit.id)) {
          await adminPb.collection('stock_management').update(prevUnit.id, {
            status: 'available',
            orderId: '',
            notes: `Released back to available stock on serial reassignment for Order ${order.orderId || order.id}`,
          });
        }
      }
    } catch (releaseErr) {
      console.warn('[shipOrderWithSerialsAction] Warning releasing unselected units:', releaseErr);
    }

    // 1. Update each assigned stock_management unit to 'sold' (or create if custom entry)
    for (const assign of payload.assignments) {
      if (assign.unitId && !assign.unitId.startsWith('custom_')) {
        try {
          await adminPb.collection('stock_management').update(assign.unitId, {
            status: 'sold',
            orderId: order.id,
            notes: `Shipped for Order ${order.orderId || order.id} on ${new Date().toLocaleString()}`,
          });
        } catch (unitErr) {
          console.warn(`[shipOrderWithSerialsAction] Failed to update unit ${assign.unitId}:`, unitErr);
        }
      } else {
        // Create unit on the fly if custom scanned/entered
        try {
          await adminPb.collection('stock_management').create({
            product: assign.productId,
            barcode: assign.barcode || assign.serialNumber,
            serialNumber: assign.serialNumber || assign.barcode,
            status: 'sold',
            orderId: order.id,
            notes: `Auto-created and shipped for Order ${order.orderId || order.id} on ${new Date().toLocaleString()}`,
          });
        } catch (createErr) {
          console.warn('[shipOrderWithSerialsAction] Failed to auto-create unit:', createErr);
        }
      }
    }

    // 2. Attach serial assignments to items in order record
    const updatedItems = itemsRaw.map((item: any) => {
      const pId = item.productId || item.product || '';
      const matched = payload.assignments.filter((a) => a.productId === pId);

      return {
        ...item,
        assignedSerials: matched.map((m) => m.serialNumber || m.barcode).filter(Boolean),
        assignedUnits: matched.map((m) => ({
          unitId: m.unitId,
          barcode: m.barcode,
          serialNumber: m.serialNumber,
        })),
      };
    });

    const updateData: Record<string, any> = {
      status: 'shipped',
      items: updatedItems,
      courierName: payload.courierName || 'Standard Courier',
      trackingNumber: payload.trackingNumber || '',
    };

    const updatedOrder = await pbOrders.update(order.id, updateData);

    // 3. Write Audit Log
    await writeAuditLog(
      check.actorEmail!,
      'update',
      'orders',
      order.id,
      { status: order.status },
      { status: 'shipped', courierName: payload.courierName, trackingNumber: payload.trackingNumber, serialAssignments: payload.assignments },
      { ip: check.ip, userAgent: check.userAgent }
    );

    // 4. Send Shipping Email to Customer with itemized Serial Numbers
    try {
      const customerEmail = order.customer?.email || order.customerEmail || order.email;
      if (customerEmail) {
        await sendOrderShippingEmail({
          to: customerEmail,
          orderNumber: order.orderId || order.id,
          customerName: order.customer?.name || order.customerName || 'Customer',
          shippingAddress: order.shippingAddress,
          courierName: payload.courierName || 'Standard Courier',
          trackingNumber: payload.trackingNumber || '',
          items: updatedItems.map((i: any) => ({
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
    revalidatePath('/account/orders');

    return { success: true };
  } catch (err: any) {
    console.error('[shipOrderWithSerialsAction] Error:', err);
    return { success: false, error: err.message || 'Failed to process shipping fulfillment.' };
  }
}
