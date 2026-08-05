// Configuration and initialization setup for Stripe payments.
// In production, this would initialize the Stripe backend package ('stripe').
// For this layout structure, we export a mock handler to process checkout sessions.

export interface StripeSessionConfig {
  items: Array<{ id: string; quantity: number; price: number; name: string }>;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export const stripeClientConfig = {
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_mock_ftc_electronics',
  currency: 'usd',
};

/**
 * Creates a mock checkout session and simulates Stripe's API.
 * Useful for validating frontend checkout flows and forms.
 */
export async function createCheckoutSession(config: StripeSessionConfig) {
  // Simulate Stripe API Latency
  await new Promise((resolve) => setTimeout(resolve, 600));

  console.log('[Stripe SDK] Creating checkout session with configuration:', config);

  // Return a mock session ID and URL
  return {
    sessionId: `sess_${Math.random().toString(36).substring(2, 15)}`,
    url: `${config.successUrl}?session_id=mock_session_active`,
  };
}

/**
 * Processes a mock Payment Intent (for card processing)
 */
export async function createPaymentIntent(amount: number) {
  await new Promise((resolve) => setTimeout(resolve, 800));

  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const randomHex = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');

  return {
    clientSecret: `pi_${randomHex.substring(0, 12)}_secret_${randomHex.substring(12)}`,
    amount,
    status: 'requires_payment_method',
  };
}
