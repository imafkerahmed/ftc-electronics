import crypto from 'crypto';
import { getAdminSupabase, writeAuditLog } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import { sendInvoiceEmailForOrder } from '@/lib/order-email';
import { deductStockForConfirmedOrderAction } from '@/app/actions/checkout';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const params = new URLSearchParams(body);

    const merchant_id = params.get('merchant_id') || '';
    const order_id = params.get('order_id') || '';
    const payhere_amount = params.get('payhere_amount') || '';
    const payhere_currency = params.get('payhere_currency') || '';
    const status_code = params.get('status_code') || '';
    const md5sig = params.get('md5sig') || '';
    const payment_id = params.get('payment_id') || '';
    const method = params.get('method') || '';

    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    if (!merchantSecret) {
      console.error('[PayHere Notify] PAYHERE_MERCHANT_SECRET is not configured.');
      return new Response('Server configuration error', { status: 500 });
    }

    const secretHash = crypto
      .createHash('md5')
      .update(merchantSecret)
      .digest('hex')
      .toUpperCase();

    const expectedSig = crypto
      .createHash('md5')
      .update(merchant_id + order_id + payhere_amount + payhere_currency + status_code + secretHash)
      .digest('hex')
      .toUpperCase();

    const sigBuffer = Buffer.from((md5sig || '').toUpperCase(), 'utf-8');
    const expectedBuffer = Buffer.from(expectedSig, 'utf-8');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      console.warn('[PayHere Notify] Invalid MD5 signature received for order:', order_id);
      return new Response('Invalid signature', { status: 400 });
    }

    const supabase = getAdminSupabase();
    const cleanOrderId = (order_id || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) {
      return new Response('OK', { status: 200 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
    } else {
      query = query.eq('order_id', cleanOrderId);
    }
    const { data: orderRecord, error: fetchErr } = await query.maybeSingle();

    if (fetchErr || !orderRecord) {
      console.warn('[PayHere Notify] Order record not found:', cleanOrderId);
      return new Response('OK', { status: 200 });
    }

    // Idempotent handling: if already paid, do not repeat side-effects
    if (orderRecord.is_paid) {
      return new Response('OK', { status: 200 });
    }

    const statusInt = parseInt(status_code, 10);

    if (statusInt === 2) {
      const expectedAmount = Number(orderRecord.total || 0);
      const receivedAmount = Number(payhere_amount);
      const expectedCurrency = (orderRecord.currency || 'LKR').toUpperCase();
      const receivedCurrency = (payhere_currency || '').toUpperCase();

      if (
        receivedCurrency !== expectedCurrency ||
        !Number.isFinite(receivedAmount) ||
        Math.abs(receivedAmount - expectedAmount) > 0.01
      ) {
        console.warn('[PayHere Notify] Payment amount or currency mismatch:', {
          orderId: orderRecord.id,
          expectedAmount,
          receivedAmount,
          expectedCurrency,
          receivedCurrency,
        });
        return new Response('OK', { status: 200 });
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
          status: 'processing',
          payment_details: {
            ...(orderRecord.payment_details || {}),
            method: 'payhere',
            status: 'paid',
            paymentId: payment_id,
            payhereMethod: method,
            amount: payhere_amount,
            currency: payhere_currency,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderRecord.id);

      if (updateError) {
        console.error('[PayHere Notify] Failed to mark order paid:', updateError);
        return new Response('Internal Server Error', { status: 500 });
      }

      try {
        await deductStockForConfirmedOrderAction(orderRecord.id);
      } catch (stockErr) {
        console.error('[PayHere Notify] Stock deduction error:', stockErr);
      }

      try {
        await sendInvoiceEmailForOrder(orderRecord.id);
      } catch (emailErr) {
        console.error('[PayHere Notify] Failed to send invoice email after payment:', emailErr);
      }
    }

    revalidatePath('/admin/orders');
    return new Response('OK', { status: 200 });
  } catch (err: any) {
    console.error('[PayHere Notify] Error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
