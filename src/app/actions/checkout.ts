'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { getAdminPb } from '@/lib/pb-admin';
import { pbProducts } from '@/lib/pb-collections';
import { sendInvoiceEmailForOrder } from '@/lib/order-email';
import { getCurrentUserSessionAction } from '@/app/actions/auth';
import type { ShippingAddress } from '@/types/order';

export interface CartItemInput {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export type OnlinePaymentMethod = 'payhere' | 'bank_transfer' | 'cash_pickup' | 'cash_delivery';

export async function processCheckoutOrderAction(data: {
  customerName: string;
  customerEmail: string;
  shippingAddress: string | Partial<ShippingAddress>;
  phone?: string;
  items: CartItemInput[];
  paymentMethod?: OnlinePaymentMethod;
}) {
  try {
    const adminPb = await getAdminPb();
    const uniqueSuffix = crypto.randomUUID().slice(0, 4).toUpperCase();
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${uniqueSuffix}`;
    const paymentMethod = data.paymentMethod || 'bank_transfer';

    let totalAmount = 0;
    const orderItems: Array<{ productId: string; name: string; slug: string; price: number; quantity: number; image: string }> = [];

    // Consolidate duplicate items by productId
    const consolidatedItemsMap = new Map<string, CartItemInput>();
    for (const item of data.items) {
      const existing = consolidatedItemsMap.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        consolidatedItemsMap.set(item.productId, { ...item });
      }
    }
    const itemsToProcess = Array.from(consolidatedItemsMap.values());

    // Fetch product details concurrently (safely handling missing/deleted products)
    const products = await Promise.all(
      itemsToProcess.map((item) => pbProducts.getById(item.productId).catch(() => null))
    );

    // 1. Strict Stock Validation: Ensure no 0-stock or out-of-stock items can be ordered
    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const product = products[i];
      const availableStock = product?.countInStock ?? 0;

      if (!product || availableStock <= 0) {
        return {
          success: false,
          error: `Sorry, "${item.name}" is currently out of stock and cannot be ordered.`,
        };
      }

      if (availableStock < item.quantity) {
        return {
          success: false,
          error: `Sorry, only ${availableStock} unit(s) of "${item.name}" are available in stock (Requested: ${item.quantity}).`,
        };
      }
    }

    // Process each purchased item using authoritative database prices
    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const product = products[i]!;
      const unitPrice =
        typeof product.discountPrice === 'number' && product.discountPrice > 0
          ? product.discountPrice
          : product.price;

      totalAmount += unitPrice * item.quantity;

      const slug = product.slug || '';
      const image = product.images && product.images.length > 0 ? product.images[0] : '';

      orderItems.push({
        productId: item.productId,
        name: product.name || item.name,
        slug,
        price: unitPrice,
        quantity: item.quantity,
        image,
      });
    }

    // Determine payment status based on method
    const isCash = paymentMethod === 'cash_pickup' || paymentMethod === 'cash_delivery';
    const orderStatus = isCash ? 'processing' : 'pending';

    const paymentMethodLabel = {
      payhere: 'PayHere (Card/Wallet)',
      bank_transfer: 'Bank Transfer',
      cash_pickup: 'Cash on Pickup',
      cash_delivery: 'Cash on Delivery',
    }[paymentMethod] || paymentMethod;

    // Parse shipping address
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

    // Check if customer is logged in
    let userId: string | undefined = undefined;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        userId = sessionRes.user.id;
      }
    } catch {
      // guest checkout
    }

    // Create Order Record — matching PBOrder / PBShippingAddress schema exactly
    const orderRecord = await adminPb.collection('orders').create({
      orderId,
      user: userId,
      customer: {
        userId,
        name: data.customerName,
        email: data.customerEmail,
        phone: data.phone || shippingObj.phone || '',
      },
      items: orderItems,
      shippingAddress: {
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
      paymentDetails: {
        method: paymentMethod,
        status: 'pending',
      },
      subtotal: totalAmount,
      shipping: 0,
      tax: 0,
      total: totalAmount,
      status: orderStatus,
      isPaid: false,
      isDelivered: false,
      notes: `Payment method: ${paymentMethodLabel}`,
    });

    if (isCash) {
      try {
        await sendInvoiceEmailForOrder(orderRecord.id);
      } catch (emailErr) {
        console.error('Failed to send cash order confirmation email:', emailErr);
      }
    } else {
      console.log(`[Checkout Action] Skipping confirmation email for pending order ${orderId} (${paymentMethod}). Will send upon payment completion.`);
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

/**
 * Server action to verify order existence and user authorization for payment slip upload.
 */
export async function verifyOrderForSlipUploadAction(orderNumber: string) {
  try {
    const adminPb = await getAdminPb();
    let orderRecord: any;
    try {
      orderRecord = await adminPb.collection('orders').getFirstListItem(
        adminPb.filter('orderId = {:orderNumber}', { orderNumber })
      );
    } catch {
      return { success: false, isAuthorized: false, error: 'Order not found.' };
    }

    const sessionRes = await getCurrentUserSessionAction().catch(() => null);
    const currentUser = sessionRes?.success ? sessionRes.user : null;

    let isAuthorized = false;
    if (currentUser) {
      const isOwnerUser = orderRecord.user === currentUser.id || orderRecord.customer?.userId === currentUser.id;
      const orderEmail = (orderRecord.customer?.email || orderRecord.shippingAddress?.email || '').toLowerCase();
      const isOwnerEmail = orderEmail && orderEmail === (currentUser.email || '').toLowerCase();
      isAuthorized = Boolean(isOwnerUser || isOwnerEmail);
    }

    return {
      success: true,
      isAuthorized,
      order: {
        orderNumber: orderRecord.orderId,
        orderId: orderRecord.id,
        paymentMethod: orderRecord.paymentDetails?.method || 'bank_transfer',
        customerEmail: orderRecord.customer?.email || orderRecord.shippingAddress?.email || '',
        total: Number(orderRecord.total || 0),
      },
    };
  } catch {
    return { success: false, isAuthorized: false, error: 'Failed to verify order.' };
  }
}

/**
 * Uploads a bank transfer payment slip for an existing order.
 * Verifies caller authorization (logged in user ownership or matching checkout session customer email).
 * The order record is updated with the slip file reference and status changes to 'pending'.
 */
export async function uploadPaymentSlipAction(formData: FormData) {
  try {
    const adminPb = await getAdminPb();
    const slip = formData.get('slip') as File | null;
    const orderNumber = formData.get('orderNumber') as string;
    const orderId = formData.get('orderId') as string;
    const customerEmail = ((formData.get('customerEmail') as string) || '').trim().toLowerCase();

    if (!slip || !orderNumber) {
      return { success: false, error: 'Missing slip file or order number.' };
    }

    if (slip.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File too large. Maximum size is 10MB.' };
    }

    let found: any;
    try {
      if (orderId) {
        found = await adminPb.collection('orders').getOne(orderId);
      } else {
        found = await adminPb.collection('orders').getFirstListItem(
          adminPb.filter('orderId = {:orderNumber}', { orderNumber })
        );
      }
    } catch {
      return { success: false, error: `Order ${orderNumber} not found in system.` };
    }

    const sessionRes = await getCurrentUserSessionAction().catch(() => null);
    const currentUser = sessionRes?.success ? sessionRes.user : null;

    const orderOwnerEmail = (found.customer?.email || found.shippingAddress?.email || '').toLowerCase();
    const isOwnerUser = currentUser && (found.user === currentUser.id || found.customer?.userId === currentUser.id);
    const isOwnerEmail = currentUser && orderOwnerEmail && orderOwnerEmail === (currentUser.email || '').toLowerCase();
    const isMatchingProvidedEmail = customerEmail && orderOwnerEmail && customerEmail === orderOwnerEmail;

    if (!isOwnerUser && !isOwnerEmail && !isMatchingProvidedEmail) {
      return { success: false, error: 'Unauthorized to upload payment slip for this order. Please log in to your account.' };
    }

    const targetId = found.id;
    const existingNotes = found.notes || '';

    const slipFormData = new FormData();
    slipFormData.append('paymentSlip', slip, slip.name);
    slipFormData.append('paymentDetails.paymentSlipUploadedAt', new Date().toISOString());

    const updated = await adminPb.collection('orders').update(targetId, slipFormData);

    const slipNote = `Payment slip uploaded by customer on ${new Date().toLocaleString()}`;
    const newNotes = existingNotes
      ? `${existingNotes} | ${slipNote}`
      : updated.notes
      ? `${updated.notes} | ${slipNote}`
      : slipNote;

    if (updated.status === 'pending' || updated.status === 'pending_payment') {
      await adminPb.collection('orders').update(targetId, {
        status: 'pending',
        notes: newNotes,
      });
    }

    revalidatePath('/admin/orders');
    return { success: true };
  } catch (err: unknown) {
    console.error('Failed to upload payment slip:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Upload failed. Please try again.' };
  }
}

/**
 * Verifies and confirms a PayHere order upon redirect back to confirmation page.
 * Acts as a fallback for local development (localhost) where PayHere webhook cannot reach local machine.
 */
export async function confirmPayHereReturnAction(orderNumber: string) {
  try {
    const adminPb = await getAdminPb();
    let orderRecord: any = null;

    try {
      orderRecord = await adminPb.collection('orders').getFirstListItem(
        adminPb.filter('orderId = {:orderNumber}', { orderNumber })
      );
    } catch {
      return { success: false, error: 'Order not found' };
    }

    if (orderRecord.isPaid) {
      return { success: true, alreadyPaid: true };
    }

    // Security guard: in production, require PayHere webhook notification for payment confirmation
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        error: 'Payment confirmation is processing via secure PayHere notification.',
      };
    }

    await adminPb.collection('orders').update(orderRecord.id, {
      isPaid: true,
      paidAt: new Date().toISOString(),
      status: 'processing',
      paymentDetails: {
        method: 'payhere',
        status: 'paid',
      },
    });

    try {
      await deductStockForConfirmedOrderAction(orderRecord.id);
    } catch (stockErr) {
      console.error('[confirmPayHereReturnAction] Stock deduction error:', stockErr);
    }

    try {
      await sendInvoiceEmailForOrder(orderRecord.id);
    } catch (emailErr) {
      console.error('[confirmPayHereReturnAction] Email error:', emailErr);
    }

    revalidatePath('/admin/orders');
    return { success: true, newlyPaid: true };
  } catch (err: any) {
    console.error('[confirmPayHereReturnAction] Error:', err);
    return { success: false, error: err.message || 'Failed to confirm payment.' };
  }
}

/**
 * Deducts stock levels and marks inventory serial units as sold when an order payment is confirmed.
 * Implements deferred stock deduction (stock is ONLY deducted once order payment is confirmed/paid).
 */
export async function deductStockForConfirmedOrderAction(orderIdRecord: string) {
  try {
    const adminPb = await getAdminPb();
    const order = await adminPb.collection('orders').getOne(orderIdRecord);
    if (!order) return { success: false, error: 'Order not found.' };

    // Security check: only paid or processing (COD/pickup) orders can consume stock
    if (!order.isPaid && order.status !== 'processing') {
      return { success: false, error: 'Order payment is not confirmed.' };
    }

    // Idempotency check: don't deduct stock twice
    if (order.stockDeducted) {
      return { success: true, alreadyDeducted: true };
    }

    // Mark stockDeducted = true IMMEDIATELY to prevent concurrent double-deduction race conditions
    await adminPb.collection('orders').update(order.id, { stockDeducted: true });

    const items = Array.isArray(order.items) ? order.items : [];
    const customerEmail = order.customer?.email || order.customerEmail || order.email || 'Customer';

    for (const item of items) {
      const productId = item.productId || item.product || item.id;
      const qty = item.quantity || item.qty || 1;
      const price = item.price || item.unit_price || 0;

      if (productId) {
        // 1. Calculate & update reduced countInStock
        try {
          const product = await pbProducts.getById(productId);
          if (product) {
            const currentStock = product.countInStock || 0;
            const newStockCount = Math.max(0, currentStock - qty);
            await adminPb.collection('products').update(productId, { countInStock: newStockCount });
          }
        } catch (prodErr) {
          console.warn(`[deductStockForConfirmedOrderAction] Failed updating countInStock for product ${productId}:`, prodErr);
        }

        // 2. Log Outbound Sale record in stock_purchases collection
        try {
          await adminPb.collection('stock_purchases').create({
            product: productId,
            batchNumber: `SALE-${order.orderId || order.id}`,
            quantity: -qty, // Negative quantity indicates stock reduction / sale
            unitCost: price,
            supplier: `Customer Online Sale (${customerEmail})`,
            purchaseDate: new Date().toISOString().split('T')[0],
            notes: `Confirmed Customer Sale - Order ${order.orderId || order.id}`,
          });
        } catch (purErr) {
          console.warn('[deductStockForConfirmedOrderAction] Failed creating stock_purchase sale record:', purErr);
        }

        // 3. Update status of available unit barcodes in stock_management collection to 'sold'
        try {
          const availableUnits = await adminPb.collection('stock_management').getList(1, qty, {
            filter: adminPb.filter('product = {:productId} && status = "available"', { productId }),
          });

          await Promise.all(
            availableUnits.items.map((unit) =>
              adminPb.collection('stock_management').update(unit.id, {
                status: 'sold',
                orderId: order.id,
                notes: `Sold online to ${order.customer?.name || customerEmail}`,
              })
            )
          );
        } catch (unitErr) {
          console.warn('[deductStockForConfirmedOrderAction] Failed updating stock_management units:', unitErr);
        }
      }
    }

    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/products');

    return { success: true };
  } catch (err: any) {
    console.error('[deductStockForConfirmedOrderAction] Error:', err);
    return { success: false, error: err.message };
  }
}
