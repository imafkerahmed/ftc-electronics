import crypto from 'node:crypto';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { sendOrderInvoiceEmail, sendPaidInvoiceEmail, sendBankTransferInstructionsEmail, sendCashOrderEmail } from '@/lib/email';
import { ensureInvoiceForPaidOrder } from '@/lib/invoice-service';

/**
 * Generates an HMAC-SHA256 signed token for guest slip uploads valid for 14 days.
 */
export function generateSlipUploadToken(orderIdentifier: string): string {
  const secret = process.env.AUTH_CACHE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'ftc-slip-upload-secret';
  const cleanId = (orderIdentifier || '').trim().toLowerCase();
  const expiry = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60; // 14 days TTL
  const payload = `${cleanId}:${expiry}`;
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${expiry}.${mac}`;
}

/**
 * Validates the HMAC-SHA256 signed slip upload token against an order identifier.
 */
export function verifySlipUploadToken(orderIdentifier: string, token: string): boolean {
  if (!orderIdentifier || !token) return false;
  try {
    const secret = process.env.AUTH_CACHE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'ftc-slip-upload-secret';
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [expiryStr, mac] = parts;
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) {
      return false; // Expired
    }
    const cleanId = orderIdentifier.trim().toLowerCase();
    const payload = `${cleanId}:${expiryStr}`;
    const expectedMac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const macBuf = Buffer.from(mac, 'hex');
    const expectedBuf = Buffer.from(expectedMac, 'hex');
    if (macBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(macBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function requiresPaymentBeforeShipment(method?: string | null): boolean {
  if (!method) return true;
  const clean = method.toLowerCase().trim();
  return (
    clean === 'bank_transfer' ||
    clean === 'online_payment' ||
    clean === 'payhere' ||
    clean === 'stripe' ||
    clean === 'paypal'
  );
}

export function isCashPaymentMethod(method?: string | null): boolean {
  if (!method) return false;
  const clean = method.toLowerCase().trim();
  return clean === 'cash_delivery' || clean === 'cod' || clean === 'cash' || clean === 'cash_pickup' || clean === 'pickup';
}

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
  order_id?: string;
  orderId?: string;
  customer?: { email?: string; name?: string };
  customerEmail?: string;
  customerName?: string;
  email?: string;
  total?: number;
  shipping_address?: string;
  shippingAddress?: string;
  items?: OrderItemRecord[];
  payment_details?: { method?: string; status?: string };
  paymentDetails?: { method?: string; status?: string };
  is_paid?: boolean;
  isPaid?: boolean;
}

/**
 * Helper to fetch order details from Supabase and send invoice/confirmation email.
 * - If order is unpaid: sends appropriate Order Confirmation & payment instructions.
 * - If order is paid: atomically ensures invoice issuance, generates PDF, and sends finalized Invoice email.
 */
export async function sendInvoiceEmailForOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminSupabase();
    let order: OrderRecord | null = null;

    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) {
      return { success: false, error: 'Invalid order ID' };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
    } else {
      query = query.eq('order_id', cleanOrderId);
    }
    const { data } = await query.maybeSingle();

    if (data) {
      order = {
        id: data.id,
        orderId: data.order_id || data.id,
        customer: data.customer || {},
        items: data.items || [],
        shippingAddress: data.shipping_address || '',
        paymentDetails: data.payment_details || {},
        total: data.total,
        isPaid: Boolean(data.is_paid || data.payment_details?.status === 'paid'),
      };
    } else {
      console.error('[sendInvoiceEmailForOrder] Could not find order:', orderId);
      return { success: false, error: 'Order not found' };
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
      const { data: presets } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('category', 'invoice_print')
        .order('is_default', { ascending: false });

      if (presets && presets.length > 0) {
        const config = typeof presets[0].config === 'string' ? JSON.parse(presets[0].config) : presets[0].config;
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

    const method = order.paymentDetails?.method || 'bank_transfer';
    const orderNum = order.orderId || order.id;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ftc.lk';

    let emailResult: { success: boolean; error?: string };

    // 1. UNPAID BANK TRANSFER: Send Deposit Instructions & Slip Upload Link
    if (!order.isPaid && method === 'bank_transfer') {
      const slipToken = generateSlipUploadToken(orderNum);
      const uploadSlipUrl = `${siteUrl}/checkout/confirmation?order=${orderNum}&uploadSlip=true&token=${slipToken}`;
      emailResult = await sendBankTransferInstructionsEmail({
        to: customerEmail,
        orderNumber: orderNum,
        customerName,
        shippingAddress: order.shippingAddress || '',
        items,
        totalAmount: order.total || 0,
        uploadSlipUrl,
        storeName,
        storePhone,
        storeEmail,
        storeAddress,
      });
    }
    // 2. UNPAID CASH / ONLINE / OTHER: Send Order Confirmation (Amount Due / Pending)
    else if (!order.isPaid) {
      emailResult = await sendCashOrderEmail({
        to: customerEmail,
        orderNumber: orderNum,
        customerName,
        shippingAddress: order.shippingAddress || '',
        items,
        totalAmount: order.total || 0,
        paymentMethod: method,
        storeName,
        storePhone,
        storeEmail,
        storeAddress,
      });
    }
    // 3. AUTHORITATIVELY PAID ORDER (order.isPaid === true): Issue final PAID Invoice & attach PDF
    else {
      const invoiceRes = await ensureInvoiceForPaidOrder(order.id);
      if (!invoiceRes.success || !invoiceRes.invoiceData) {
        console.error('[sendInvoiceEmailForOrder] Failed to ensure invoice for paid order:', invoiceRes.error);
        return { success: false, error: invoiceRes.error || 'Failed to issue invoice.' };
      }

      emailResult = await sendPaidInvoiceEmail({
        to: customerEmail,
        invoiceData: invoiceRes.invoiceData,
        pdfBuffer: invoiceRes.pdfBuffer,
      });
    }

    if (emailResult.success) {
      console.log(`[sendInvoiceEmailForOrder] ✅ Email sent for order #${orderNum} (${method})`);
    } else {
      console.error(`[sendInvoiceEmailForOrder] ❌ Failed sending email for order #${orderNum}:`, emailResult.error);
    }

    return emailResult;
  } catch (err: unknown) {
    console.error('[sendInvoiceEmailForOrder] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to send order email' };
  }
}
