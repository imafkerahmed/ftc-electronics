import crypto from 'crypto';
import { headers } from 'next/headers';
import { getAdminPb } from '@/lib/pb-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';

// In-memory rate limiting store for API route protection (max 20 requests per IP per minute)
const globalForHashRateLimit = globalThis as unknown as {
  __hashRateLimitStore?: Map<string, { count: number; windowStart: number }>;
};

const rateLimitStore = (globalForHashRateLimit.__hashRateLimitStore ??= new Map<
  string,
  { count: number; windowStart: number }
>());

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const maxRequests = 20;

  // Cleanup expired entries periodically if store grows large
  if (rateLimitStore.size > 2000) {
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart > windowMs) {
        rateLimitStore.delete(key);
      }
    }
  }

  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count += 1;
  return { allowed: true };
}

/**
 * POST /api/payhere/hash
 * Generates the secure PayHere payment hash on the server.
 * Reads the authoritative order total directly from the PocketBase server record.
 * This MUST be server-side — merchant_secret must never be exposed to the client.
 *
 * Body: { order_id: string, currency?: string }
 * Returns: { hash: string, merchant_id: string, amount: string }
 */
export async function POST(req: Request) {
  try {
    // 1. IP Rate Limiting Check
    const headersList = await headers();
    const clientIp = getTrustedClientIp(headersList);
    const rateLimit = checkRateLimit(clientIp);

    if (!rateLimit.allowed) {
      return Response.json(
        { error: 'Too many payment hash requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfter || 60) },
        }
      );
    }

    // 2. Validate JSON Request Body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Request body must be a valid JSON object' }, { status: 400 });
    }

    const { order_id, currency: rawCurrency } = body;

    if (!order_id || typeof order_id !== 'string' || !order_id.trim() || order_id.length > 120) {
      return Response.json(
        { error: 'Missing or invalid required field: order_id' },
        { status: 400 }
      );
    }

    const currency = typeof rawCurrency === 'string' && rawCurrency.trim()
      ? rawCurrency.trim().toUpperCase()
      : 'LKR';

    if (currency !== 'LKR') {
      return Response.json({ error: 'PayHere payment gateways currently support LKR currency only.' }, { status: 400 });
    }

    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

    if (!merchantId || !merchantSecret) {
      return Response.json(
        { error: 'PayHere credentials not configured on server.' },
        { status: 500 }
      );
    }

    const cleanOrderId = order_id.trim();

    // 3. Look up order in PocketBase for authoritative server-side total
    let orderAmount: number;
    try {
      const adminPb = await getAdminPb();
      const orderRecord = await adminPb.collection('orders').getFirstListItem(
        adminPb.filter('orderId = {:orderId}', { orderId: cleanOrderId })
      );
      orderAmount = Number(orderRecord.total || orderRecord.totalAmount || 0);
    } catch {
      return Response.json({ error: 'Order record not found' }, { status: 404 });
    }

    if (!orderAmount || isNaN(orderAmount) || orderAmount <= 0) {
      return Response.json({ error: 'Invalid order amount on server record' }, { status: 400 });
    }

    // 4. Format amount to exactly 2 decimal places (PayHere requirement)
    const formattedAmount = orderAmount.toFixed(2);

    // Hash formula: MD5(merchant_id + order_id + amount + currency + MD5(merchant_secret).toUpperCase())
    const secretHash = crypto
      .createHash('md5')
      .update(merchantSecret)
      .digest('hex')
      .toUpperCase();

    const hash = crypto
      .createHash('md5')
      .update(merchantId + cleanOrderId + formattedAmount + currency + secretHash)
      .digest('hex')
      .toUpperCase();

    return Response.json({ hash, merchant_id: merchantId, amount: formattedAmount });
  } catch (err: unknown) {
    console.error('[PayHere Hash] Error generating hash:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to generate payment hash' },
      { status: 500 }
    );
  }
}
