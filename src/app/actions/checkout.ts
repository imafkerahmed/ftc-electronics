'use server';

import { revalidatePath } from 'next/cache';
import { getAdminPb } from '@/lib/pb-admin';
import { pbProducts } from '@/lib/pb-collections';
import { sendOrderInvoiceEmail } from '@/lib/email';

export interface CartItemInput {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export async function processCheckoutOrderAction(data: {
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  items: CartItemInput[];
}) {
  try {
    const adminPb = await getAdminPb();
    const orderId = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    let totalAmount = 0;
    const orderItems: Array<{ productId: string; name: string; slug: string; price: number; quantity: number; image: string }> = [];

    // Fetch product details concurrently
    const products = await Promise.all(
      data.items.map((item) => pbProducts.getById(item.productId))
    );

    // Process each purchased item
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
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

      if (product) {
        // 1. Calculate & update reduced countInStock
        const currentStock = product.countInStock || 0;
        const newStockCount = Math.max(0, currentStock - item.quantity);
        await adminPb.collection('products').update(item.productId, { countInStock: newStockCount });

        // 2. Log Outbound Sale record in stock_purchases collection
        await adminPb.collection('stock_purchases').create({
          product: item.productId,
          batchNumber: `SALE-${orderId}`,
          quantity: -item.quantity, // Negative quantity indicates stock reduction / sale
          unitCost: item.price,
          supplier: `Customer Online Sale (${data.customerEmail})`,
          purchaseDate: new Date().toISOString().split('T')[0],
          notes: `Customer Online Purchase - Order ${orderId}`,
        });

        // 3. Update status of available unit barcodes in stock_management collection to 'sold'
        try {
          const availableUnits = await adminPb.collection('stock_management').getList(1, item.quantity, {
            filter: `product = "${item.productId}" && status = "available"`,
          });

          await Promise.all(
            availableUnits.items.map((unit) =>
              adminPb.collection('stock_management').update(unit.id, {
                status: 'sold',
                orderId,
                notes: `Sold online to ${data.customerName}`,
              })
            )
          );
        } catch (unitErr) {
          console.warn('Failed to update stock_management unit barcodes:', unitErr);
        }
      }
    }

    // Create Order Record in orders collection using correct schema keys
    const orderRecord = await adminPb.collection('orders').create({
      orderId,
      customer: {
        name: data.customerName,
        email: data.customerEmail,
      },
      items: orderItems,
      shippingAddress: {
        address: data.shippingAddress,
        city: 'Colombo', // Default city
        country: 'Sri Lanka',
      },
      paymentDetails: {
        method: 'stripe',
        status: 'paid',
      },
      subtotal: totalAmount,
      shipping: 0,
      tax: 0,
      total: totalAmount,
      status: 'processing',
      isPaid: true,
      paidAt: new Date().toISOString(),
    });

    // Try to automatically email invoice/receipt to customer
    try {
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
      } catch (err) {
        console.warn('Failed to load store print config for online order email:', err);
      }

      await sendOrderInvoiceEmail({
        to: data.customerEmail,
        orderNumber: orderId,
        customerName: data.customerName,
        shippingAddress: data.shippingAddress,
        items: data.items.map((item) => ({
          name: item.name,
          qty: item.quantity,
          unitPrice: item.price,
          discount: 0,
        })),
        totalAmount,
        paymentMethod: 'Stripe Credit Card (Online)',
        storeName,
        storePhone,
        storeEmail,
        storeAddress,
      });
    } catch (emailErr) {
      console.error('Failed to send automated online order invoice email:', emailErr);
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
