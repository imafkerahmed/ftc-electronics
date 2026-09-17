'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { sbProducts } from '@/lib/supabase-collections';
import { sendInvoiceEmailForOrder, verifySlipUploadToken } from '@/lib/order-email';
import { getCurrentUserSessionAction } from '@/app/actions/auth';
import { headers } from 'next/headers';
import { getTrustedClientIp } from '@/lib/get-client-ip';
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
  is_active: boolean | null;
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
      .select('id, name, slug, price, discount_price, count_in_stock, images, is_active')
      .in('id', productIds);

    if (prodErr || !dbProducts) {
      console.error('[processCheckoutOrderAction] Product fetch error:', prodErr);
      return { success: false, error: 'Failed to verify cart items. Please try again.' };
    }

    const productMap = new Map<string, CheckoutProductRow>();
    for (const p of (dbProducts as CheckoutProductRow[])) {
      productMap.set(p.id, p);
    }

    // Validate existence, active status, and requested stock quantities
    for (const item of itemsToProcess) {
      const product = productMap.get(item.productId);
      if (!product || product.is_active === false) {
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
    const orderStatus = isPayHere ? 'checkout_draft' : isCash ? 'processing' : 'pending';

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
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        userId = sessionRes.user.id;
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
    } else if (paymentMethod === 'bank_transfer') {
      try {
        await sendInvoiceEmailForOrder(orderRecord.id);
      } catch (emailErr) {
        console.error('[Checkout Action] Failed to send bank transfer instructions email:', emailErr);
      }
    }

    revalidatePath('/admin/inventory');
    revalidatePath('/admin/orders');
    revalidatePath('/admin/products');
    revalidatePath('/products');

    return { success: true, orderId: orderRecord.id, orderNumber: orderId, total: totalAmount };
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
    // Check if caller is authenticated session owner, has valid signed upload token, or supplied matching email
    let isOwner = false;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        const orderUserId = orderRecord.customer?.userId || orderRecord.user_id;
        const orderEmail = (orderRecord.customer?.email || orderRecord.email || '').toLowerCase().trim();
        if (
          (orderUserId && sessionRes.user.id === orderUserId) ||
          (orderEmail && sessionRes.user.email?.toLowerCase().trim() === orderEmail)
        ) {
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

    if (!isOwner && email) {
      const orderEmail = (orderRecord.customer?.email || orderRecord.email || '').toLowerCase().trim();
      if (orderEmail && email.toLowerCase().trim() === orderEmail) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      return {
        success: false,
        isAuthorized: false,
        error: 'Verification required. Please log in with your account, use the link from your email, or verify with your order email.',
      };
    }

    const isBankTransfer = orderRecord.payment_details?.method === 'bank_transfer';
    const isAuthorized = Boolean(isBankTransfer && !orderRecord.is_paid);

    return {
      success: true,
      isAuthorized,
      order: {
        orderNumber: orderRecord.order_id || orderRecord.id,
        orderId: orderRecord.id,
        paymentMethod: orderRecord.payment_details?.method || 'bank_transfer',
        customerEmail: orderRecord.customer?.email || '',
        total: Number(orderRecord.total || 0),
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
    const customerEmailInput = formData.get('customerEmail') as string | null;

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

    // Verify ownership before accepting upload
    let isOwner = false;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        const orderUserId = targetOrder.customer?.userId || targetOrder.user_id;
        const orderEmail = (targetOrder.customer?.email || targetOrder.email || '').toLowerCase().trim();
        if (
          (orderUserId && sessionRes.user.id === orderUserId) ||
          (orderEmail && sessionRes.user.email?.toLowerCase().trim() === orderEmail)
        ) {
          isOwner = true;
        }
      }
    } catch {
      // not logged in
    }

    if (!isOwner && customerEmailInput) {
      const orderEmail = (targetOrder.customer?.email || targetOrder.email || '').toLowerCase().trim();
      if (orderEmail && customerEmailInput.toLowerCase().trim() === orderEmail) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      return { success: false, error: 'Unauthorized. You do not have permission to upload a slip for this order.' };
    }

    // Upload to Supabase Storage with server-generated unique file path
    const buf = await slip.arrayBuffer();
    const uniqueFileId = crypto.randomUUID();
    const fName = `slips/order-${targetOrder.id}-${Date.now()}-${uniqueFileId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('ftc-media')
      .upload(fName, buf, { contentType: mime, upsert: false });

    if (uploadErr) {
      console.error('Failed to upload slip to storage:', uploadErr);
      return { success: false, error: 'Failed to upload slip file to storage.' };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const fullPublicUrl = `${supabaseUrl}/storage/v1/object/public/ftc-media/${fName}`;

    const existingNotes = targetOrder.notes || '';
    const slipNote = `Payment slip uploaded on ${new Date().toLocaleString()}`;
    const newNotes = existingNotes ? `${existingNotes} | ${slipNote}` : slipNote;

    const existingPaymentDetails = targetOrder.payment_details || targetOrder.paymentDetails || {};
    const newPaymentDetails = { ...existingPaymentDetails, paymentSlipUrl: fullPublicUrl };

    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        notes: newNotes,
        payment_details: newPaymentDetails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetOrder.id);

    if (updateErr) {
      console.error('Failed to update order with payment slip URL:', updateErr);
      return { success: false, error: 'Failed to attach the slip to the order.' };
    }

    revalidatePath('/admin/orders');
    return { success: true };
  } catch (err: unknown) {
    console.error('Failed to upload payment slip:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed. Please try again.' };
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
