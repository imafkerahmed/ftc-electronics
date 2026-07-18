'use server';

import { revalidatePath } from 'next/cache';
import { getAdminPb } from '@/lib/pb-admin';
import { pbProducts } from '@/lib/pb-collections';

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
    const orderItems: Array<{ productId: string; name: string; quantity: number; price: number }> = [];

    // Process each purchased item
    for (const item of data.items) {
      totalAmount += item.price * item.quantity;
      orderItems.push({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      });

      // Fetch product to update stock
      const product = await pbProducts.getById(item.productId);
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

          for (const unit of availableUnits.items) {
            await adminPb.collection('stock_management').update(unit.id, {
              status: 'sold',
              orderId,
              notes: `Sold online to ${data.customerName}`,
            });
          }
        } catch (unitErr) {
          console.warn('Failed to update stock_management unit barcodes:', unitErr);
        }
      }
    }

    // Create Order Record in orders collection
    const orderRecord = await adminPb.collection('orders').create({
      orderNumber: orderId,
      customerEmail: data.customerEmail,
      customerName: data.customerName,
      items: orderItems,
      totalAmount,
      status: 'paid',
      isPaid: true,
      shippingAddress: data.shippingAddress,
    });

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
