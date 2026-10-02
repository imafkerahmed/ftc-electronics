import { NextResponse } from 'next/server';

/**
 * Stripe webhook endpoint (DISABLED)
 * Stripe is not currently configured or integrated as a payment provider for FTC Electronics.
 * This route is strictly disabled to prevent unauthorized status changes or mock payloads.
 */
export async function POST() {
  console.warn('[Stripe Webhook] Rejected POST request: Stripe webhook endpoint is disabled.');
  return NextResponse.json(
    {
      error: 'Stripe webhook endpoint is disabled. Stripe is not configured as an active payment gateway.',
    },
    { status: 404 }
  );
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
