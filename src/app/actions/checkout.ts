'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { sbProducts } from '@/lib/supabase-collections';
import { sendInvoiceEmailForOrder, verifySlipUploadToken, generateSlipUploadToken } from '@/lib/order-email';
import { getCurrentUserSessionAction } from '@/app/actions/auth';
import { headers } from 'next/headers';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { ensureInvoiceForPaidOrder } from '@/lib/invoice-service';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import type { ShippingAddress } from '@/types/order';

const globalForOrderVerifyRateLimit = globalThis as unknown as {
  __orderVerifyRateLimitStore?: Map<string, { count: number; windowStart: number }>;
};

const verifyRateLimitStore = (globalForOrderVerifyRateLimit.__orderVerifyRateLimitStore ??= new Map<
  string,
  { count: number; windowStart: number }
>());

function checkOrderVerifyRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 20;

  if (verifyRateLimitStore.size > 2000) {
    for (const [key, entry] of verifyRateLimitStore.entries()) {
      if (now - entry.windowStart > windowMs) {
        verifyRateLimitStore.delete(key);
      }
    }
  }

  const entry = verifyRateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    verifyRateLimitStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  return { allowed: true };
}

export interface CartItemInput {
  productId: string;
  name?: string;
  price?: number;
  quantity: number;
}

export interface CheckoutProductRow {
  id: string;
  name: string;
  slug: string;
  price: number;
  discount_price: number | null;
  count_in_stock: number | null;
  images: string[] | null;
  status: string;
}

export type OnlinePaymentMethod = 'payhere' | 'bank_transfer' | 'cash_pickup' | 'cash_delivery';

/**
 * Deterministically derives a v4-formatted UUID from an order string using MD5.
 * ASSUMPTION: The input orderId string (e.g. `ORD-XXXXXX-XXXX`) is already generated with unique
 * entropy (timestamp + crypto random suffix) before hashing to prevent primary key collisions.
 */
function pbIdToUuid(pbId: string): string {
  if (!pbId || typeof pbId !== 'string') return pbId;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(pbId)) return pbId;
  const hash = crypto.createHash('md5').update(pbId).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

export async function processCheckoutOrderAction(data: {
  customerName: string;
  customerEmail: string;
  shippingAddress: string | Partial<ShippingAddress>;
  phone?: string;
  items: CartItemInput[];
  paymentMethod?: OnlinePaymentMethod;
}) {
  try {
    const supabase = getAdminSupabase();
    const uniqueSuffix = crypto.randomUUID().slice(0, 4).toUpperCase();
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${uniqueSuffix}`;
    const paymentMethod = data.paymentMethod || 'bank_transfer';

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      return { success: false, error: 'Your cart is empty.' };
    }

    if (!data.customerName || !data.customerEmail) {
      return { success: false, error: 'Customer name and email are required.' };
    }

    // Validate every incoming item BEFORE consolidation
    const consolidatedItemsMap = new Map<string, CartItemInput>();
    for (const item of data.items) {
      if (!item || !item.productId || typeof item.productId !== 'string' || !item.productId.trim()) {
        return { success: false, error: 'Invalid product item in cart.' };
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return { success: false, error: 'Invalid product quantity in cart.' };
      }
      if (item.quantity > 10000) {
        return { success: false, error: 'Requested quantity exceeds maximum allowed limit.' };
      }

      const cleanProductId = item.productId.trim();
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_REGEX.test(cleanProductId)) {
        return {
          success: false,
          error: `"${item.name || 'A product in your cart'}" is no longer available in the catalog. Please remove it and add the updated product to your cart.`,
        };
      }

      const existing = consolidatedItemsMap.get(cleanProductId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        consolidatedItemsMap.set(cleanProductId, { ...item, productId: cleanProductId });
      }
    }
    const itemsToProcess = Array.from(consolidatedItemsMap.values());
    const productIds = itemsToProcess.map((i) => i.productId);

    // Query trusted products directly by primary key IDs
    const { data: dbProducts, error: prodErr } = await supabase
      .from('products')
      .select('id, name, slug, price, discount_price, count_in_stock, images, status')
      .in('id', productIds);

    if (prodErr || !dbProducts) {
      console.error('[processCheckoutOrderAction] Product fetch error:', {
        message: prodErr?.message,
        code: prodErr?.code,
        details: prodErr?.details,
        hint: prodErr?.hint,
      });
      return { success: false, error: 'Failed to verify cart items. Please try again.' };
    }

    const productMap = new Map<string, CheckoutProductRow>();
    for (const p of (dbProducts as CheckoutProductRow[])) {
      productMap.set(p.id, p);
    }

    // Validate existence, active status, and requested stock quantities
    for (const item of itemsToProcess) {
      const product = productMap.get(item.productId);
      if (!product || product.status !== 'published') {
        return {
          success: false,
          error: `"${item.name || 'A selected product'}" is no longer available.`,
        };
      }

      if (item.quantity <= 0) {
        return {
          success: false,
          error: `Invalid quantity requested for "${product.name}".`,
        };
      }

      const availableStock = typeof product.count_in_stock === 'number' ? product.count_in_stock : 0;
      if (availableStock < item.quantity) {
        return {
          success: false,
          error: availableStock <= 0
            ? `Sorry, "${product.name}" is currently out of stock.`
            : `Only ${availableStock} unit(s) of "${product.name}" remain in stock (requested: ${item.quantity}).`,
        };
      }
    }

    // Calculate pricing strictly from trusted server database values
    let totalAmount = 0;
    const orderItems: Array<{ productId: string; name: string; slug: string; price: number; quantity: number; image: string }> = [];

    for (const item of itemsToProcess) {
      const product = productMap.get(item.productId)!;
      const regularPrice = typeof product.price === 'number' ? product.price : 0;
      const discountPrice =
        typeof product.discount_price === 'number' && product.discount_price > 0
          ? product.discount_price
          : null;
      const unitPrice = discountPrice !== null ? discountPrice : regularPrice;

      totalAmount += unitPrice * item.quantity;

      const slug = product.slug || '';
      const image = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '';

      orderItems.push({
        productId: product.id,
        name: product.name,
        slug,
        price: unitPrice,
        quantity: item.quantity,
        image,
      });
    }

    const isCash = paymentMethod === 'cash_pickup' || paymentMethod === 'cash_delivery';
    const isPayHere = paymentMethod === 'payhere';
    const isBankTransfer = paymentMethod === 'bank_transfer';
    const orderStatus = isCash ? 'processing' : 'pending';

    const paymentMethodLabel = {
      payhere: 'PayHere (Card/Wallet)',
      bank_transfer: 'Bank Transfer',
      cash_pickup: 'Cash on Pickup',
      cash_delivery: 'Cash on Delivery',
    }[paymentMethod] || paymentMethod;

    let shippingObj: Partial<ShippingAddress> = {};
    if (typeof data.shippingAddress === 'object' && data.shippingAddress !== null) {
      shippingObj = data.shippingAddress;
    } else if (typeof data.shippingAddress === 'string') {
      const addressParts = data.shippingAddress.split(',').map((s) => s.trim());
      shippingObj = {
        addressLine1: addressParts[0] || data.shippingAddress,
        city: addressParts[1] || 'Colombo',
        country: addressParts[2] || 'Sri Lanka',
      };
    }

    let userId: string | undefined = undefined;
    let customerId: string | undefined = undefined;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        userId = sessionRes.user.id;
        const { data: custRow } = await supabase
          .from('customers')
          .select('id')
          .eq('profile_id', userId)
          .maybeSingle();
        if (custRow) {
          customerId = custRow.id;
        }
      }
    } catch {
      // guest checkout
    }

    const uuid = pbIdToUuid(orderId);

    const { data: orderRecord, error } = await supabase
      .from('orders')
      .insert({
        id: uuid,
        order_id: orderId,
        user_id: userId || null,
        customer_id: customerId || null,
        customer: {
          userId,
          name: data.customerName,
          email: data.customerEmail,
          phone: data.phone || shippingObj.phone || '',
        },
        items: orderItems,
        shipping_address: {
          firstName: shippingObj.firstName || data.customerName.split(' ')[0] || data.customerName,
          lastName: shippingObj.lastName || data.customerName.split(' ').slice(1).join(' ') || '',
          email: shippingObj.email || data.customerEmail,
          addressLine1: shippingObj.addressLine1 || '',
          addressLine2: shippingObj.addressLine2 || '',
          city: shippingObj.city || 'Colombo',
          state: shippingObj.state || '',
          postalCode: shippingObj.postalCode || '',
          country: shippingObj.country || 'Sri Lanka',
          phone: shippingObj.phone || data.phone || '',
        },
        payment_details: {
          method: paymentMethod,
          status: isPayHere ? 'draft' : 'pending',
        },
        subtotal: totalAmount,
        shipping: 0,
        tax: 0,
        total: totalAmount,
        status: orderStatus,
        is_paid: false,
        is_delivered: false,
        notes: `Payment method: ${paymentMethodLabel}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !orderRecord) {
      console.error('Supabase order insert error:', error);
      if (error?.code === '23505') {
        return { success: false, error: 'An order with this reference already exists. Please try submitting again.' };
      }
      return { success: false, error: 'Failed to process order. Please try again later.' };
    }

    if (isPayHere) {
      console.log(`[Checkout Action] PayHere order created as draft ${orderId}. Waiting for payment webhook completion.`);
    } else {
      try {
        await sendInvoiceEmailForOrder(orderRecord.id);
      } catch (emailErr) {
        console.error('[Checkout Action] Failed to send order confirmation email:', emailErr);
      }
    }

    try {
      revalidatePath('/admin/inventory');
      revalidatePath('/admin/orders');
      revalidatePath('/admin/products');
      revalidatePath('/products');
    } catch {
      // Ignored outside request context (e.g. tests or isolated execution)
    }

    const slipUploadToken = isBankTransfer ? generateSlipUploadToken(orderId) : undefined;

    return {
      success: true,
      orderId: orderRecord.id,
      orderNumber: orderId,
      total: totalAmount,
      slipUploadToken,
    };
  } catch (err: any) {
    console.error('Failed to process checkout order:', err);
    return { success: false, error: err.message || 'Failed to process order.' };
  }
}

export async function verifyOrderForSlipUploadAction(orderNumber: string, email?: string, token?: string) {
  try {
    const headersList = await headers();
    const clientIp = getTrustedClientIp(headersList);
    const rateLimit = checkOrderVerifyRateLimit(clientIp);

    if (!rateLimit.allowed) {
      return {
        success: false,
        isAuthorized: false,
        error: 'Too many verification attempts. Please try again later.',
      };
    }

    const supabase = getAdminSupabase();
    const cleanOrderNumber = (orderNumber || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderNumber) {
      return { success: false, isAuthorized: false, error: 'Invalid order reference.' };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderNumber);
    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderNumber},order_id.eq.${cleanOrderNumber}`);
    } else {
      query = query.eq('order_id', cleanOrderNumber);
    }
    const { data: orderRecord, error } = await query.maybeSingle();

    if (error || !orderRecord) {
      return { success: false, isAuthorized: false, error: 'Order not found.' };
    }

    // Ownership Verification:
    // Check if caller is authenticated session owner or has valid signed upload token
    let isOwner = false;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        const orderUserId = orderRecord.customer?.userId || orderRecord.user_id;
        if (orderUserId && sessionRes.user.id === orderUserId) {
          isOwner = true;
        }
      }
    } catch {
      // not logged in
    }

    if (!isOwner && token) {
      const orderNum = orderRecord.order_id || '';
      const orderDbId = orderRecord.id || '';
      if (
        (orderNum && verifySlipUploadToken(orderNum, token)) ||
        (orderDbId && verifySlipUploadToken(orderDbId, token)) ||
        verifySlipUploadToken(cleanOrderNumber, token)
      ) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      return {
        success: false,
        isAuthorized: false,
        error: 'Verification required. Please log in with the account that placed this order or use the secure link sent to your email.',
      };
    }

    const isBankTransfer = orderRecord.payment_details?.method === 'bank_transfer';
    const isAuthorized = Boolean(isBankTransfer && !orderRecord.is_paid);

    const verifiedToken = token || (isBankTransfer ? generateSlipUploadToken(orderRecord.order_id || orderRecord.id) : undefined);

    return {
      success: true,
      isAuthorized,
      order: {
        orderNumber: orderRecord.order_id || orderRecord.id,
        orderId: orderRecord.id,
        paymentMethod: orderRecord.payment_details?.method || 'bank_transfer',
        customerEmail: orderRecord.customer?.email || '',
        total: Number(orderRecord.total || 0),
        slipUploadToken: verifiedToken,
      },
    };
  } catch {
    return { success: false, isAuthorized: false, error: 'Failed to verify order.' };
  }
}

const ALLOWED_SLIP_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export async function uploadPaymentSlipAction(formData: FormData) {
  try {
    const supabase = getAdminSupabase();
    const orderNumber = formData.get('orderNumber') as string | null;
    const slip = formData.get('slip') as File | null;
    const tokenInput = (formData.get('token') || formData.get('guestAccessToken')) as string | null;

    if (!slip || !orderNumber) {
      return { success: false, error: 'Missing slip file or order number.' };
    }

    // Validate MIME type
    const mime = slip.type;
    const ext = ALLOWED_SLIP_MIME_TYPES[mime];
    if (!ext) {
      return { success: false, error: 'Only PNG, JPEG, WEBP, or PDF slips are accepted.' };
    }

    // Validate maximum size (10MB)
    if (slip.size > 10 * 1024 * 1024) {
      return { success: false, error: 'The slip file must be 10 MB or smaller.' };
    }

    const cleanOrderNumber = orderNumber.replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderNumber) {
      return { success: false, error: 'Invalid order number.' };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderNumber);
    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderNumber},order_id.eq.${cleanOrderNumber}`);
    } else {
      query = query.eq('order_id', cleanOrderNumber);
    }
    const { data: targetOrder, error } = await query.maybeSingle();

    if (error || !targetOrder) {
      return { success: false, error: `Order ${orderNumber} not found in system.` };
    }

    // Validate payment method and payment state
    const isBankTransfer = targetOrder.payment_details?.method === 'bank_transfer';
    if (!isBankTransfer) {
      return { success: false, error: 'Payment slip upload is only permitted for Bank Transfer orders.' };
    }
    if (targetOrder.is_paid) {
      return { success: false, error: 'This order is already marked as paid. Slip upload is not allowed.' };
    }

    // Verify ownership before accepting upload:
    // Authenticated users: canonical user_id ownership check.
    // Guest orders: cryptographic HMAC token verification.
    let isAuthorized = false;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        const orderUserId = targetOrder.user_id || targetOrder.customer?.userId;
        if (orderUserId && sessionRes.user.id === orderUserId) {
          isAuthorized = true;
        }
      }
    } catch {
      // not logged in
    }

    if (!isAuthorized && tokenInput) {
      const orderNum = targetOrder.order_id || '';
      const orderDbId = targetOrder.id || '';
      if (
        (orderNum && verifySlipUploadToken(orderNum, tokenInput)) ||
        (orderDbId && verifySlipUploadToken(orderDbId, tokenInput)) ||
        verifySlipUploadToken(cleanOrderNumber, tokenInput)
      ) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Unauthorized: You must be logged into the account that placed this order or provide a valid verification link.',
      };
    }

    // Upload to private Supabase Storage bucket: ftc-payment-slips
    const buf = await slip.arrayBuffer();
    const uniqueFileId = crypto.randomUUID();
    const privateObjectPath = `orders/${targetOrder.id}/${uniqueFileId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('ftc-payment-slips')
      .upload(privateObjectPath, buf, { contentType: mime, upsert: false });

    if (uploadErr) {
      console.error('Failed to upload slip to private storage:', uploadErr);
      return { success: false, error: 'Failed to upload slip file to secure storage.' };
    }

    const existingPaymentDetails = targetOrder.payment_details || targetOrder.paymentDetails || {};
    const oldSlipPath = existingPaymentDetails.paymentSlipPath;
    const oldSlipUrl = existingPaymentDetails.paymentSlipUrl;

    const existingNotes = targetOrder.notes || '';
    const slipNote = `Payment slip uploaded on ${new Date().toLocaleString()}`;
    const newNotes = existingNotes ? `${existingNotes} | ${slipNote}` : slipNote;

    const newPaymentDetails = {
      ...existingPaymentDetails,
      paymentSlipPath: privateObjectPath,
    };
    delete newPaymentDetails.paymentSlipUrl;

    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        notes: newNotes,
        payment_details: newPaymentDetails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetOrder.id);

    if (updateErr) {
      console.error('Failed to update order with payment slip path:', updateErr);
      return { success: false, error: 'Failed to attach the slip to the order.' };
    }

    // Safely remove previous replaced object if one existed
    if (oldSlipPath && oldSlipPath !== privateObjectPath) {
      try {
        await supabase.storage.from('ftc-payment-slips').remove([oldSlipPath]);
      } catch (cleanupErr) {
        console.warn('Failed to delete old replaced payment slip from private storage:', cleanupErr);
      }
    } else if (oldSlipUrl && typeof oldSlipUrl === 'string' && oldSlipUrl.includes('ftc-media/slips/')) {
      try {
        const pathPart = oldSlipUrl.split('ftc-media/')[1];
        if (pathPart) {
          await supabase.storage.from('ftc-media').remove([decodeURIComponent(pathPart)]);
        }
      } catch (cleanupErr) {
        console.warn('Failed to delete old historical payment slip from public storage:', cleanupErr);
      }
    }

    try {
      revalidatePath('/admin/orders');
    } catch {
      // safe fallback outside request store
    }
    return { success: true };
  } catch (err: unknown) {
    console.error('Failed to upload payment slip:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed. Please try again.' };
  }
}

export async function getCustomerPaymentSlipSignedUrlAction(
  orderIdRecord: string,
  guestAccessToken?: string
): Promise<{ success: boolean; signedUrl?: string; error?: string }> {
  try {
    const supabase = getAdminSupabase();
    const cleanOrderId = (orderIdRecord || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) return { success: false, error: 'Invalid order reference.' };

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

    // 1. Authenticated User Authorization
    let isAuthorized = false;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        const orderUserId = order.user_id || order.customer?.userId;
        if (orderUserId && sessionRes.user.id === orderUserId) {
          isAuthorized = true;
        }
      }
    } catch {
      // not logged in
    }

    // 2. Guest Order Token Authorization
    if (!isAuthorized && guestAccessToken) {
      const orderNum = order.order_id || '';
      const orderDbId = order.id || '';
      if (
        (orderNum && verifySlipUploadToken(orderNum, guestAccessToken)) ||
        (orderDbId && verifySlipUploadToken(orderDbId, guestAccessToken)) ||
        verifySlipUploadToken(cleanOrderId, guestAccessToken)
      ) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return { success: false, error: 'Unauthorized: You do not have permission to view this payment slip.' };
    }

    const slipPath = order.payment_details?.paymentSlipPath;
    const slipUrl = order.payment_details?.paymentSlipUrl;

    if (slipPath) {
      const { data, error: signErr } = await supabase.storage
        .from('ftc-payment-slips')
        .createSignedUrl(slipPath, 120); // 120s TTL

      if (signErr || !data?.signedUrl) {
        return { success: false, error: 'Failed to generate secure viewing link.' };
      }
      return { success: true, signedUrl: data.signedUrl };
    }

    if (slipUrl) {
      return { success: true, signedUrl: slipUrl };
    }

    return { success: false, error: 'No payment slip found for this order.' };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to view payment slip.' };
  }
}

export async function deductStockForConfirmedOrderAction(orderIdRecord: string) {
  try {
    const supabase = getAdminSupabase();
    const cleanOrderId = (orderIdRecord || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) return { success: false, error: 'Invalid order ID.' };

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
    } else {
      query = query.eq('order_id', cleanOrderId);
    }
    const { data: order, error: orderErr } = await query.maybeSingle();

    if (orderErr || !order) return { success: false, error: 'Order not found.' };

    // Idempotency check:
    // 1. Check if order payment_details already has stock_deducted: true
    // 2. OR check if stock_management already has units marked 'sold' with order_id = order.id
    if (order.payment_details?.stock_deducted) {
      return { success: true, alreadyDeducted: true };
    }

    const { data: existingUnits } = await supabase
      .from('stock_management')
      .select('id')
      .eq('order_id', order.id);

    if (existingUnits && existingUnits.length > 0) {
      return { success: true, alreadyDeducted: true };
    }

    const items: Array<{ productId?: string; quantity?: number }> = Array.isArray(order.items) ? order.items : [];
    const unitBackedProductIds = new Set<string>();
    const counterDeductions = new Map<string, number>();

    for (const item of items) {
      const pId = item.productId;
      const qty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
      if (!pId) continue;

      // Find available units in stock_management
      const { data: availUnits, error: availErr } = await supabase
        .from('stock_management')
        .select('id')
        .eq('product_id', pId)
        .eq('status', 'available')
        .limit(qty);

      if (availErr) {
        throw new Error(`Failed to query stock units for product ${pId}: ${availErr.message}`);
      }

      if (availUnits && availUnits.length > 0) {
        // Unit-backed product
        if (availUnits.length < qty) {
          throw new Error(`Insufficient unit stock for product ${pId}. Required: ${qty}, Available: ${availUnits.length}`);
        }
        unitBackedProductIds.add(pId);
        const unitIds = availUnits.map((u) => u.id);
        const { data: claimed, error: updateUnitErr } = await supabase
          .from('stock_management')
          .update({
            status: 'sold',
            order_id: order.id,
            notes: `Sold for Order ${order.order_id || order.id}`,
            updated_at: new Date().toISOString(),
          })
          .in('id', unitIds)
          .eq('status', 'available')
          .select('id');

        if (updateUnitErr) throw updateUnitErr;
        if ((claimed?.length ?? 0) !== unitIds.length) {
          throw new Error(`One or more stock units for product ${pId} were already claimed.`);
        }
      } else {
        // Counter-only product: verify current count_in_stock
        const { data: prod, error: prodErr } = await supabase
          .from('products')
          .select('count_in_stock')
          .eq('id', pId)
          .single();

        if (prodErr || !prod) {
          throw new Error(`Product ${pId} not found for stock deduction.`);
        }
        const currentStock = prod.count_in_stock ?? 0;
        if (currentStock < qty) {
          throw new Error(`Insufficient counter stock for product ${pId}. Required: ${qty}, Available: ${currentStock}`);
        }
        counterDeductions.set(pId, (counterDeductions.get(pId) || 0) + qty);
      }
    }

    // Apply counter deductions directly without zeroing them in recount
    for (const [pId, qtyToDeduct] of counterDeductions.entries()) {
      const { data: prod, error: pGetErr } = await supabase
        .from('products')
        .select('count_in_stock')
        .eq('id', pId)
        .single();
      if (pGetErr) throw pGetErr;
      const currentStock = prod?.count_in_stock ?? 0;
      if (currentStock < qtyToDeduct) {
        throw new Error(`Insufficient stock for product ${pId} at deduction time.`);
      }
      const newStock = Math.max(0, currentStock - qtyToDeduct);
      const { error: pUpdErr } = await supabase
        .from('products')
        .update({ count_in_stock: newStock })
        .eq('id', pId);
      if (pUpdErr) throw pUpdErr;
    }

    // Recalculate remaining count_in_stock ONLY for unit-backed products
    if (unitBackedProductIds.size > 0) {
      const pIdList = Array.from(unitBackedProductIds);
      const { data: remainingUnits, error: remErr } = await supabase
        .from('stock_management')
        .select('product_id')
        .in('product_id', pIdList)
        .eq('status', 'available');

      if (remErr) throw remErr;

      const countMap = new Map<string, number>();
      for (const pId of pIdList) countMap.set(pId, 0);
      for (const u of remainingUnits || []) {
        if (u.product_id) countMap.set(u.product_id, (countMap.get(u.product_id) || 0) + 1);
      }

      for (const [pId, count] of countMap.entries()) {
        const { error: countUpdErr } = await supabase.from('products').update({ count_in_stock: count }).eq('id', pId);
        if (countUpdErr) throw countUpdErr;
      }
    }

    // Mark order as paid, processing, and record stock_deducted flag
    const updatedPaymentDetails = {
      ...(order.payment_details || {}),
      stock_deducted: true,
      deducted_at: new Date().toISOString(),
    };

    const { error: updateOrderErr } = await supabase
      .from('orders')
      .update({
        is_paid: true,
        status: order.status === 'pending' || order.status === 'checkout_draft' ? 'processing' : order.status,
        payment_details: updatedPaymentDetails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (updateOrderErr) throw updateOrderErr;

    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/products');

    return { success: true };
  } catch (err: any) {
    console.error('[deductStockForConfirmedOrderAction] Error:', err);
    return { success: false, error: err.message || 'Failed to deduct stock.' };
  }
}

export async function confirmPayHereReturnAction(orderNumber: string) {
  try {
    const supabase = getAdminSupabase();
    const cleanOrderNumber = (orderNumber || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderNumber) {
      return { success: false, error: 'Invalid order number', status: 'invalid' };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderNumber);
    let query = supabase.from('orders').select('id, order_id, is_paid, status, payment_details');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderNumber},order_id.eq.${cleanOrderNumber}`);
    } else {
      query = query.eq('order_id', cleanOrderNumber);
    }
    const { data: orderRecord, error } = await query.maybeSingle();

    if (error || !orderRecord) {
      return { success: false, error: 'Order not found', status: 'not_found' };
    }

    if (orderRecord.is_paid) {
      return { success: true, isPaid: true, status: 'paid' };
    }

    // Read-only check: return current status (authoritative state is set by the PayHere notify webhook)
    return {
      success: true,
      isPaid: false,
      status: orderRecord.status === 'cancelled' ? 'cancelled' : 'pending',
    };
  } catch (err: any) {
    console.error('[confirmPayHereReturnAction] Error:', err);
    return { success: false, error: 'Failed to verify payment status.', status: 'error' };
  }
}

/**
 * Customer Invoice PDF Download Action.
 * Securely authorizes the authenticated customer against the requested order using
 * canonical immutable UUID relationships (user_id / profile_id), or a verified cryptographic
 * HMAC token for guest orders. Plain email matching is explicitly disallowed.
 */
export async function downloadCustomerInvoicePdfAction(
  orderId: string,
  guestAccessToken?: string
): Promise<{
  success: boolean;
  filename?: string;
  pdfBase64?: string;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) {
      return { success: false, error: 'Invalid order identifier.' };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    const adminSb = getAdminSupabase();
    let query = adminSb.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
    } else {
      query = query.eq('order_id', cleanOrderId);
    }
    const { data: order, error: orderErr } = await query.maybeSingle();

    if (orderErr || !order) {
      return { success: false, error: 'Order not found.' };
    }

    // 1. Authenticated User Authorization: Canonical immutable UUID verification
    let isAuthorized = false;

    if (user) {
      const orderUserId = order.user_id || order.customer?.userId;
      if (orderUserId && orderUserId === user.id) {
        isAuthorized = true;
      } else if (order.customer_id) {
        // Verify customer record link to profile
        const { data: custRecord } = await adminSb
          .from('customers')
          .select('id')
          .eq('id', order.customer_id)
          .eq('profile_id', user.id)
          .maybeSingle();

        if (custRecord) {
          isAuthorized = true;
        }
      }
    }
    // 2. Guest Order Authorization: Cryptographic HMAC-SHA256 token verification
    else if (guestAccessToken) {
      const orderNum = order.order_id || '';
      const orderDbId = order.id || '';
      const tokenValid = (orderNum && verifySlipUploadToken(orderNum, guestAccessToken)) ||
                         (orderDbId && verifySlipUploadToken(orderDbId, guestAccessToken));

      if (tokenValid) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      if (!user && !guestAccessToken) {
        return { success: false, error: 'Please sign in to access your invoice.' };
      }
      return { success: false, error: 'Access denied: You do not have permission to download this invoice.' };
    }

    const isPaid = order.is_paid === true || order.payment_status === 'paid' || order.status === 'delivered' || order.status === 'completed';
    if (!isPaid) {
      return { success: false, error: 'Official Invoice is only available after payment has been confirmed.' };
    }

    const invoiceResult = await ensureInvoiceForPaidOrder(order.id);
    if (!invoiceResult.success || !invoiceResult.data) {
      return { success: false, error: invoiceResult.error || 'Failed to issue or retrieve invoice.' };
    }

    const pdfBuffer = await generateInvoicePdf(invoiceResult.data);
    return {
      success: true,
      filename: `FTC-Invoice-${invoiceResult.data.invoiceNumber}.pdf`,
      pdfBase64: pdfBuffer.toString('base64'),
    };
  } catch (err: any) {
    console.error('[downloadCustomerInvoicePdfAction] Error:', err);
    return { success: false, error: err.message || 'Failed to generate invoice PDF.' };
  }
}
