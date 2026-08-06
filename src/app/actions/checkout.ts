'use server';

import { revalidatePath } from 'next/cache';
import { getAdminPb } from '@/lib/pb-admin';
import { pbProducts } from '@/lib/pb-collections';
import { sendInvoiceEmailForOrder } from '@/lib/order-email';
import { getCurrentUserSessionAction } from '@/app/actions/auth';

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
  shippingAddress: string;
  phone?: string;
  items: CartItemInput[];
  paymentMethod?: OnlinePaymentMethod;
}) {
  try {
    const adminPb = await getAdminPb();
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
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

    // Fetch product details concurrently
    const products = await Promise.all(
      itemsToProcess.map((item) => pbProducts.getById(item.productId))
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

    // Process each purchased item
    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      const product = products[i];
      totalAmount += item.price * item.quantity;

      const slug = product?.slug || '';
      const image = product?.images && product.images.length > 0 ? product.images[0] : '';

      orderItems.push({
        productId: item.productId,
        name: item.name,
        slug,
        price: item.price,
        quantity: item.quantity,
        image,
      });
    }

    // Note: Stock deduction is deferred until payment confirmation (deductStockForConfirmedOrderAction)
    // to prevent abandoned/failed checkout attempts from leaking inventory stock.

    // Determine payment status based on method
    // payhere/bank_transfer → 'pending' until webhook/admin confirms
    // cash methods → 'processing' immediately (payment on delivery/pickup)
    const isCash = paymentMethod === 'cash_pickup' || paymentMethod === 'cash_delivery';

    // Use only valid PocketBase OrderStatus values: pending | processing | shipped | delivered | cancelled | refunded
    const orderStatus = isCash ? 'processing' : 'pending';
    const isPaid = false; // Nothing is paid until webhook/admin confirms

    const paymentMethodLabel = {
      payhere: 'PayHere (Card/Wallet)',
      bank_transfer: 'Bank Transfer',
      cash_pickup: 'Cash on Pickup',
      cash_delivery: 'Cash on Delivery',
    }[paymentMethod] || paymentMethod;

    // Parse shipping address from string back to structured object for PocketBase schema
    // data.shippingAddress is a comma-joined string like "123 Main St, Colombo, Sri Lanka"
    const addressParts = data.shippingAddress.split(',').map((s) => s.trim());

    // Check if customer is logged in to associate order with user account
    let userId: string | undefined = undefined;
    try {
      const sessionRes = await getCurrentUserSessionAction();
      if (sessionRes.success && sessionRes.user) {
        userId = sessionRes.user.id;
      }
    } catch {
      // guest checkout
    }

    // Create Order Record — must match PBOrder / PBShippingAddress schema exactly
    const orderRecord = await adminPb.collection('orders').create({
      orderId,
      user: userId,
      customer: {
        userId,
        name: data.customerName,
        email: data.customerEmail,
        phone: data.phone || '',
      },
      items: orderItems,
      shippingAddress: {
        firstName: data.customerName.split(' ')[0] || data.customerName,
        lastName: data.customerName.split(' ').slice(1).join(' ') || '',
        email: data.customerEmail,
        addressLine1: addressParts[0] || data.shippingAddress,
        city: addressParts[1] || 'Colombo',
        state: '',
        postalCode: '',
        country: addressParts[2] || 'Sri Lanka',
        phone: data.phone || '',
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

    // Send confirmation email ONLY for Cash orders (COD/Pickup) since they are confirmed orders.
    // Online (PayHere) and Bank Transfer orders will get their confirmation email when payment is confirmed.
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

    return { success: true, orderId: orderRecord.id, orderNumber: orderId };
  } catch (err: any) {
    console.error('Failed to process checkout order:', err);
    return { success: false, error: err.message || 'Failed to process order.' };
  }
}

/**
 * Upload a payment slip for a bank transfer order.
 * The order record is updated with the slip file reference and status changes to 'pending'.
 */
export async function uploadPaymentSlipAction(formData: FormData) {
  try {
    const adminPb = await getAdminPb();
    const slip = formData.get('slip') as File | null;
    const orderNumber = formData.get('orderNumber') as string;
    const orderId = formData.get('orderId') as string;

    if (!slip || !orderNumber) {
      return { success: false, error: 'Missing slip file or order number.' };
    }

    // Validate file
    if (slip.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File too large. Maximum size is 10MB.' };
    }

    // Find order by orderId or by searching orderId field
    let targetId = orderId;
    if (!targetId) {
      try {
        const found = await adminPb.collection('orders').getFirstListItem(
          `orderId = "${orderNumber}"`
        );
        targetId = found.id;
      } catch {
        return { success: false, error: `Order ${orderNumber} not found in system.` };
      }
    }

    // Upload slip file to the order record
    const slipFormData = new FormData();
    slipFormData.append('paymentSlip', slip, slip.name);
    slipFormData.append('paymentDetails.paymentSlipUploadedAt', new Date().toISOString());

    // PocketBase file upload via multipart
    const updated = await adminPb.collection('orders').update(targetId, slipFormData);

    // Also mark as pending (awaiting admin verification) if still pending_payment
    if (updated.status === 'pending_payment') {
      await adminPb.collection('orders').update(targetId, {
        status: 'pending',
        notes: `Payment slip uploaded by customer on ${new Date().toLocaleString()}`,
      });
    }

    revalidatePath('/admin/orders');
    return { success: true };
  } catch (err: any) {
    console.error('Failed to upload payment slip:', err);
    return { success: false, error: err.message || 'Upload failed. Please try again.' };
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
      orderRecord = await adminPb.collection('orders').getFirstListItem(`orderId = "${orderNumber}"`);
    } catch {
      return { success: false, error: 'Order not found' };
    }

    // If order is already paid, just return success
    if (orderRecord.isPaid) {
      return { success: true, alreadyPaid: true };
    }

    // Update order status to paid / processing
    await adminPb.collection('orders').update(orderRecord.id, {
      isPaid: true,
      paidAt: new Date().toISOString(),
      status: 'processing',
      paymentDetails: {
        method: 'payhere',
        status: 'paid',
      },
    });

    // Deduct inventory stock upon confirmed payment
    try {
      await deductStockForConfirmedOrderAction(orderRecord.id);
    } catch (stockErr) {
      console.error('[confirmPayHereReturnAction] Stock deduction error:', stockErr);
    }

    // Send confirmation email to customer
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

    // Idempotency check: don't deduct stock twice
    if (order.stockDeducted) {
      return { success: true, alreadyDeducted: true };
    }

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
            filter: `product = "${productId}" && status = "available"`,
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

    // Mark stockDeducted = true on order record
    await adminPb.collection('orders').update(order.id, { stockDeducted: true });

    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/products');

    return { success: true };
  } catch (err: any) {
    console.error('[deductStockForConfirmedOrderAction] Error:', err);
    return { success: false, error: err.message };
  }
}

