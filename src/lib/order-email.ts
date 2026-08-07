import { getAdminPb } from '@/lib/pb-admin';
import { sendOrderInvoiceEmail } from '@/lib/email';

interface OrderItemRecord {
  name?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  unitPrice?: number;
  discount?: number;
}

interface OrderRecord {
  id: string;
  orderId?: string;
  customer?: { email?: string; name?: string };
  customerEmail?: string;
  customerName?: string;
  email?: string;
  total?: number;
  shippingAddress?: string;
  items?: OrderItemRecord[];
  paymentDetails?: { method?: string; status?: string };
  isPaid?: boolean;
}

/**
 * Helper to fetch order details, load store print config, and send order invoice/confirmation email.
 * Can be called by checkout actions, webhooks, or admin actions when payment is confirmed.
 */
export async function sendInvoiceEmailForOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminPb = await getAdminPb();
    let order: OrderRecord | null = null;

    // Try by PocketBase record ID first, then by human-readable orderId field with secure filter binding
    try {
      order = await adminPb.collection('orders').getOne<OrderRecord>(orderId);
    } catch {
      try {
        const filter = adminPb.filter('orderId = {:orderId}', { orderId });
        order = await adminPb.collection('orders').getFirstListItem<OrderRecord>(filter);
      } catch {
        console.error('[sendInvoiceEmailForOrder] Could not find order:', orderId);
        return { success: false, error: 'Order not found' };
      }
    }

    const customerEmail = order.customer?.email || order.customerEmail || order.email;
    if (!customerEmail) {
      console.warn('[sendInvoiceEmailForOrder] No customer email found for order:', orderId);
      return { success: false, error: 'No customer email address on order' };
    }

    const customerName = order.customer?.name || order.customerName || 'Customer';

    let storeName = 'FTC Electronics';
    let storePhone = '';
    let storeEmail = '';
    let storeAddress = '';

    try {
      const presets = await adminPb.collection('system_configurations').getFullList({
        filter: 'category = "invoice_print"',
        sort: '-isDefault',
      });
      if (presets.length > 0) {
        const config = JSON.parse(presets[0].config);
        storeName = config.storeName || storeName;
        storePhone = config.headerPhone || storePhone;
        storeEmail = config.headerEmail || storeEmail;
        storeAddress = config.headerAddress || storeAddress;
      }
    } catch (err: unknown) {
      console.warn('[sendInvoiceEmailForOrder] Failed to load store print config:', err);
    }

    let items: Array<{ name: string; qty: number; unitPrice: number; discount: number }> = [];
    if (Array.isArray(order.items) && order.items.length > 0) {
      items = order.items.map((item) => ({
        name: item.name || 'Order Item',
        qty: item.quantity || item.qty || 1,
        unitPrice: item.price || item.unitPrice || 0,
        discount: item.discount || 0,
      }));
    } else {
      items = [{ name: `Order ${order.orderId || order.id}`, qty: 1, unitPrice: order.total || 0, discount: 0 }];
    }

    const method = order.paymentDetails?.method || 'online';
    const status = order.paymentDetails?.status || (order.isPaid ? 'paid' : 'pending');
    const paymentMethodLabel = `${method.toUpperCase()} (${status})`;

    const emailResult = await sendOrderInvoiceEmail({
      to: customerEmail,
      orderNumber: order.orderId || order.id,
      customerName,
      shippingAddress: order.shippingAddress || '',
      items,
      totalAmount: order.total || 0,
      paymentMethod: paymentMethodLabel,
      storeName,
      storePhone,
      storeEmail,
      storeAddress,
    });

    if (emailResult.success) {
      console.log(`[sendInvoiceEmailForOrder] ✅ Confirmation email sent for order #${order.orderId || order.id}`);
    } else {
      console.error(`[sendInvoiceEmailForOrder] ❌ Failed sending email for order #${order.orderId || order.id}:`, emailResult.error);
    }

    return emailResult;
  } catch (err: unknown) {
    console.error('[sendInvoiceEmailForOrder] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send order email' };
  }
}
