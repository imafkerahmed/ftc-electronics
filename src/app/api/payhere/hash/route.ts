import crypto from 'crypto';

/**
 * POST /api/payhere/hash
 * Generates the secure PayHere payment hash on the server.
 * This MUST be server-side — merchant_secret must never be exposed to the client.
 *
 * Body: { order_id: string, amount: number, currency: string }
 * Returns: { hash: string, merchant_id: string }
 */
export async function POST(req: Request) {
  try {
    const { order_id, amount, currency } = await req.json();

    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

    if (!merchantId || !merchantSecret) {
      return Response.json(
        { error: 'PayHere credentials not configured. Set PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET in .env.local' },
        { status: 500 }
      );
    }

    if (!order_id || !amount || !currency) {
      return Response.json({ error: 'Missing required fields: order_id, amount, currency' }, { status: 400 });
    }

    // Format amount to exactly 2 decimal places (PayHere requirement)
    const formattedAmount = Number(amount).toFixed(2);

    // Hash formula: MD5(merchant_id + order_id + amount + currency + MD5(merchant_secret).toUpperCase())
    const secretHash = crypto
      .createHash('md5')
      .update(merchantSecret)
      .digest('hex')
      .toUpperCase();

    const hash = crypto
      .createHash('md5')
      .update(merchantId + order_id + formattedAmount + currency + secretHash)
      .digest('hex')
      .toUpperCase();

    return Response.json({ hash, merchant_id: merchantId });
  } catch (err: any) {
    console.error('[PayHere Hash] Error generating hash:', err);
    return Response.json({ error: 'Failed to generate payment hash' }, { status: 500 });
  }
}
