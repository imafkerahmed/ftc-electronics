import crypto from 'crypto';
import { headers } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';

const globalForHashRateLimit = globalThis as unknown as {
  __hashRateLimitStore?: Map<string, { count: number; windowStart: number }>;
};

const rateLimitStore = (globalForHashRateLimit.__hashRateLimitStore ??= new Map<
  string,
  { count: number; windowStart: number }
>());

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 20;

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

export async function POST(req: Request) {
  try {
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

    const cleanOrderId = order_id.trim().replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) {
      return Response.json({ error: 'Valid order_id is required' }, { status: 400 });
    }

    let orderAmount: number;
    try {
      const supabase = getAdminSupabase();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
      let query = supabase.from('orders').select('*');
      if (isUuid) {
        query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
      } else {
        query = query.eq('order_id', cleanOrderId);
      }
      const { data: orderRecord } = await query.maybeSingle();

      if (!orderRecord) throw new Error('Order not found');
      orderAmount = Number(orderRecord.total || 0);
    } catch {
      return Response.json({ error: 'Order record not found' }, { status: 404 });
    }

    if (!orderAmount || isNaN(orderAmount) || orderAmount <= 0) {
      return Response.json({ error: 'Invalid order amount on server record' }, { status: 400 });
    }

    const formattedAmount = orderAmount.toFixed(2);

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
