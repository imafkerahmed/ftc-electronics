import crypto from 'crypto';
import { getAdminPb, writeAuditLog } from '@/lib/pb-admin';
import { revalidatePath } from 'next/cache';
import { sendInvoiceEmailForOrder } from '@/lib/order-email';
import { deductStockForConfirmedOrderAction } from '@/app/actions/checkout';

/**
 * POST /api/payhere/notify
 *
 * PayHere calls this endpoint server-to-server after every payment attempt.
 * This is the ONLY trusted source of payment truth — never rely solely on return_url.
 *
 * PayHere sends application/x-www-form-urlencoded (not JSON).
 * This endpoint must be publicly reachable (deployed URL or ngrok).
 *
 * status_code reference:
 *   2  = Success
 *   0  = Pending (eWallet / internet banking still processing)
 *  -1  = Cancelled by customer
 *  -2  = Failed
 *  -3  = Chargedback
 */
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

    console.log('[PayHere Notify] Received notification:', {
      order_id,
      status_code,
      payhere_amount,
      payhere_currency,
      payment_id,
      method,
    });

    // ─── Step 1: Verify the MD5 signature ─────────────────────────────────────
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

    // Constant-time signature comparison to prevent timing attacks
    const sigBuffer = Buffer.from(md5sig.toUpperCase(), 'utf-8');
    const expectedBuffer = Buffer.from(expectedSig, 'utf-8');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      console.warn('[PayHere Notify] ⚠️ Signature mismatch! Possible fraudulent request.', {
        expected: expectedSig,
        received: md5sig,
      });
      return new Response('Invalid signature', { status: 400 });
    }

    console.log('[PayHere Notify] ✅ Signature verified for order:', order_id);

    // ─── Step 2: Find the order in PocketBase with Parameter Binding ──────────
    const adminPb = await getAdminPb();
    let orderRecord: any;

    try {
      orderRecord = await adminPb.collection('orders').getFirstListItem(
        adminPb.filter('orderId = {:orderId}', { orderId: order_id })
      );
    } catch (findErr) {
      console.error('[PayHere Notify] Order not found in DB:', order_id);
      return new Response('OK', { status: 200 });
    }

    // ─── Step 3: Process based on status_code ─────────────────────────────────
    const statusInt = parseInt(status_code, 10);
    const existingPaymentDetails =
      typeof orderRecord.paymentDetails === 'object' && orderRecord.paymentDetails
        ? orderRecord.paymentDetails
        : {};

    // Ignore non-success status notifications for an order that is already paid (except chargebacks -3)
    if (orderRecord.isPaid && statusInt !== 2 && statusInt !== -3) {
      console.log(`[PayHere Notify] Order ${order_id} is already paid; ignoring status_code ${statusInt}.`);
      return new Response('OK', { status: 200 });
    }

    if (statusInt === 2) {
      // Validate payment amount & currency
      const paidAmount = Number(payhere_amount);
      const expectedAmount = Number(orderRecord.total);

      if (
        payhere_currency !== 'LKR' ||
        !Number.isFinite(paidAmount) ||
        Math.abs(paidAmount - expectedAmount) > 0.01
      ) {
        console.error('[PayHere Notify] Payment Amount mismatch:', {
          order_id,
          paidAmount,
          expectedAmount,
          payhere_currency,
        });

        const existingNotes = orderRecord.notes || '';
        const mismatchNote = `PAYMENT AMOUNT MISMATCH — received ${payhere_currency} ${payhere_amount}, expected LKR ${expectedAmount}. Manual review required.`;
        await adminPb.collection('orders').update(orderRecord.id, {
          notes: existingNotes ? `${existingNotes} | ${mismatchNote}` : mismatchNote,
        });
        return new Response('OK', { status: 200 });
      }

      // Idempotency: prevent duplicate email sending on repeated PayHere notifications
      if (orderRecord.isPaid) {
        console.log('[PayHere Notify] Order already marked as PAID, skipping duplicate processing:', order_id);
        return new Response('OK', { status: 200 });
      }

      // ✅ PAYMENT SUCCESSFUL
      await adminPb.collection('orders').update(orderRecord.id, {
        isPaid: true,
        paidAt: new Date().toISOString(),
        status: 'processing',
        paymentDetails: {
          ...existingPaymentDetails,
          method: 'payhere',
          status: 'paid',
          paymentId: payment_id || existingPaymentDetails.paymentId,
          payhereMethod: method || existingPaymentDetails.payhereMethod,
          amount: payhere_amount,
          currency: payhere_currency,
        },
      });
      console.log('[PayHere Notify] ✅ Order marked as PAID:', order_id);

      // Deduct inventory stock NOW that payment is confirmed
      try {
        await deductStockForConfirmedOrderAction(orderRecord.id);
      } catch (stockErr) {
        console.error('[PayHere Notify] Stock deduction error:', stockErr);
      }

      // Send confirmation email NOW that payment has been completed successfully
      try {
        await sendInvoiceEmailForOrder(orderRecord.id);
      } catch (emailErr) {
        console.error('[PayHere Notify] Failed to send invoice email after payment:', emailErr);
      }

    } else if (statusInt === 0) {
      // ⏳ PENDING (eWallet / internet banking still in progress)
      await adminPb.collection('orders').update(orderRecord.id, {
        status: 'pending',
        paymentDetails: {
          ...existingPaymentDetails,
          method: 'payhere',
          status: 'pending',
          paymentId: payment_id || existingPaymentDetails.paymentId,
        },
      });
      console.log('[PayHere Notify] ⏳ Order payment PENDING:', order_id);

    } else if (statusInt === -1) {
      // ❌ CANCELLED by customer — don't mark as failed, just leave as pending
      console.log('[PayHere Notify] ❌ Payment CANCELLED by customer for order:', order_id);

    } else if (statusInt === -2) {
      // ❌ FAILED
      await adminPb.collection('orders').update(orderRecord.id, {
        paymentDetails: {
          ...existingPaymentDetails,
          method: 'payhere',
          status: 'failed',
          paymentId: payment_id || existingPaymentDetails.paymentId,
        },
      });
      console.log('[PayHere Notify] ❌ Payment FAILED for order:', order_id);

    } else if (statusInt === -3) {
      // ⚠️ CHARGEDBACK — flag for manual review and record admin audit log
      const existingNotes = orderRecord.notes || '';
      const chargebackNote = `CHARGEBACK RECEIVED via PayHere on ${new Date().toLocaleString()}. Payment ID: ${payment_id}. Requires manual inventory & financial reconciliation.`;

      await adminPb.collection('orders').update(orderRecord.id, {
        isPaid: false,
        status: 'cancelled',
        notes: existingNotes ? `${existingNotes} | ${chargebackNote}` : chargebackNote,
        paymentDetails: {
          ...existingPaymentDetails,
          method: 'payhere',
          status: 'failed',
          paymentId: payment_id || existingPaymentDetails.paymentId,
          chargedback: true,
        },
      });

      await writeAuditLog(
        'system',
        'update',
        'orders',
        orderRecord.id,
        { isPaid: orderRecord.isPaid, status: orderRecord.status },
        { isPaid: false, status: 'cancelled', chargedback: true, paymentId: payment_id },
        {}
      ).catch(() => null);

      console.warn('[PayHere Notify] ⚠️ Chargeback received for order:', order_id);
    }

    revalidatePath('/admin/orders');

    // PayHere expects a 200 OK response on successful notification processing
    return new Response('OK', { status: 200 });
  } catch (err: any) {
    console.error('[PayHere Notify] Unexpected infrastructure error:', err);
    // Return 500 for infrastructure failures so PayHere retries notification delivery
    return new Response('Internal Server Error', { status: 500 });
  }
}
