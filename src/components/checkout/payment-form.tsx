'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Package,
  Bike,
  CreditCard,
  ShieldCheck,
  ChevronRight,
  Loader2,
  AlertCircle,
  Lock,
} from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { processCheckoutOrderAction } from '@/app/actions/checkout';

export type PaymentMethod = 'payhere' | 'bank_transfer' | 'cash_pickup' | 'cash_delivery';

const PAYMENT_METHODS = [
  {
    id: 'payhere' as PaymentMethod,
    label: 'Pay Online',
    sublabel: 'Visa / Mastercard / Amex / Wallet — Powered by PayHere',
    icon: CreditCard,
    color: 'text-violet-500',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/5',
    badge: 'Recommended',
  },
  {
    id: 'bank_transfer' as PaymentMethod,
    label: 'Bank Transfer',
    sublabel: 'Transfer to our account & upload your slip',
    icon: Building2,
    color: 'text-blue-500',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/5',
    badge: null,
  },
  {
    id: 'cash_pickup' as PaymentMethod,
    label: 'Cash on Pickup',
    sublabel: 'Pay cash when you collect in-store',
    icon: Package,
    color: 'text-emerald-500',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/5',
    badge: null,
  },
  {
    id: 'cash_delivery' as PaymentMethod,
    label: 'Cash on Delivery',
    sublabel: 'Pay cash when courier delivers to you',
    icon: Bike,
    color: 'text-amber-500',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/5',
    badge: null,
  },
];

const PAYHERE_MODE = process.env.NEXT_PUBLIC_PAYHERE_MODE || 'sandbox';
const PAYHERE_CHECKOUT_URL =
  PAYHERE_MODE === 'sandbox'
    ? 'https://sandbox.payhere.lk/pay/checkout'
    : 'https://www.payhere.lk/pay/checkout';

export default function PaymentForm() {
  const router = useRouter();
  const { items, total, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('payhere');

  // Hidden PayHere form ref — submitted programmatically after hash is ready
  const payhereFormRef = useRef<HTMLFormElement>(null);
  const [payhereData, setPayhereData] = useState<Record<string, string> | null>(null);

  const getShippingData = () => {
    try {
      const raw = sessionStorage.getItem('ftc_checkout_shipping');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  // ─── PayHere Card Payment ───────────────────────────────────────────────────
  const handlePayHere = async (orderId: string, orderNumber: string) => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const shippingData = getShippingData();

    // 1. Request hash from secure server-side endpoint
    const hashRes = await fetch('/api/payhere/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderNumber, amount: total, currency: 'LKR' }),
    });

    if (!hashRes.ok) {
      throw new Error('Failed to generate payment hash. Please try again.');
    }

    const { hash, merchant_id } = await hashRes.json();

    // 2. Build the PayHere form data
    const formFields: Record<string, string> = {
      merchant_id,
      return_url: `${siteUrl}/checkout/confirmation?order=${orderNumber}&method=payhere`,
      cancel_url: `${siteUrl}/checkout/payment?cancelled=true`,
      notify_url: `${siteUrl}/api/payhere/notify`,
      order_id: orderNumber,
      items: items.map((i) => i.product.name).join(', ').substring(0, 255),
      currency: 'LKR',
      amount: total.toFixed(2),
      first_name: shippingData.firstName || 'Customer',
      last_name: shippingData.lastName || '',
      email: shippingData.email || '',
      phone: shippingData.phone || '',
      address: shippingData.addressLine1 || '',
      city: shippingData.city || 'Colombo',
      country: 'Sri Lanka',
      hash,
    };

    setPayhereData(formFields);

    // 3. Submit the hidden form on the next render tick
    setTimeout(() => {
      payhereFormRef.current?.submit();
    }, 100);
  };

  // ─── Main Order Handler ─────────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (items.length === 0) {
      setError('Your cart is empty. Please add items before placing an order.');
      return;
    }

    setLoading(true);
    setError(null);

    const shippingData = getShippingData();
    const customerName = shippingData.firstName
      ? `${shippingData.firstName} ${shippingData.lastName || ''}`.trim()
      : 'Customer';
    const customerEmail = shippingData.email || 'guest@ftc.lk';
    const shippingAddress = [shippingData.addressLine1, shippingData.city, shippingData.country]
      .filter(Boolean)
      .join(', ') || 'Sri Lanka';

    const cartInput = items.map((i) => ({
      productId: i.product.id,
      name: i.product.name,
      price: i.product.discountPrice || i.product.price,
      quantity: i.quantity,
    }));

    // Create the order record first (regardless of payment method)
    const result = await processCheckoutOrderAction({
      customerName,
      customerEmail,
      shippingAddress,
      phone: shippingData.phone || '',
      items: cartInput,
      paymentMethod: selectedMethod === 'payhere' ? 'payhere' : selectedMethod,
    });

    if (!result.success) {
      setError(result.error || 'Failed to place order. Please try again.');
      setLoading(false);
      return;
    }

    // Save order info for confirmation page (fail-safe in case redirect fails)
    try {
      sessionStorage.setItem(
        'ftc_last_order',
        JSON.stringify({
          orderNumber: result.orderNumber,
          orderId: result.orderId,
          paymentMethod: selectedMethod,
          customerEmail,
          total,
        })
      );
      sessionStorage.removeItem('ftc_checkout_shipping');
    } catch { /* ignore */ }

    // Clear cart immediately upon successful order creation in database
    clearCart();

    if (selectedMethod === 'payhere') {
      try {
        await handlePayHere(result.orderId!, result.orderNumber!);
      } catch (payhereErr: any) {
        setError(payhereErr.message || 'Failed to redirect to PayHere. Please try another method.');
        setLoading(false);
      }
    } else {
      router.push(`/checkout/confirmation?order=${result.orderNumber}&method=${selectedMethod}`);
    }
  };

  const selectedDef = PAYMENT_METHODS.find((m) => m.id === selectedMethod)!;

  return (
    <>
      {/* Hidden PayHere POST form — submitted programmatically */}
      {payhereData && (
        <form
          ref={payhereFormRef}
          method="POST"
          action={PAYHERE_CHECKOUT_URL}
          className="hidden"
        >
          {Object.entries(payhereData).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        </form>
      )}

      <div className="space-y-5 text-foreground">
        {/* Payment Method Selector */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-bold tracking-wide">Choose Payment Method</h3>
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
          </div>

          {/* Total */}
          <div className="rounded-lg bg-secondary/40 p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Amount Due</span>
            <span className="text-lg font-bold text-blue-500">
              LKR {total.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {/* Method Cards */}
          <div className="space-y-3">
            {PAYMENT_METHODS.map((method) => {
              const Icon = method.icon;
              const isActive = selectedMethod === method.id;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedMethod(method.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer ${
                    isActive
                      ? `${method.border} ${method.bg}`
                      : 'border-border hover:border-border/80 hover:bg-secondary/30'
                  }`}
                >
                  {/* Radio */}
                  <div
                    className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isActive ? `${method.color} border-current` : 'border-muted-foreground/40'
                    }`}
                  >
                    {isActive && <div className={`h-1.5 w-1.5 rounded-full ${method.color} bg-current`} />}
                  </div>

                  <Icon className={`h-5 w-5 shrink-0 ${isActive ? method.color : 'text-muted-foreground'}`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {method.label}
                      </span>
                      {method.badge && (
                        <span className="text-[9px] bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          {method.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{method.sublabel}</div>
                  </div>

                  {isActive && <ChevronRight className={`h-4 w-4 shrink-0 ${method.color}`} />}
                </button>
              );
            })}
          </div>

          {/* PayHere info panel */}
          {selectedMethod === 'payhere' && (
            <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-violet-400" />
                <p className="text-xs font-bold text-violet-400">Secure Online Payment via PayHere</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                You will be redirected to PayHere&apos;s secure, PCI-compliant payment page to complete your payment.
                FTC Electronics never sees your card details.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Visa', 'Mastercard', 'Amex', 'Genie', 'Frimi', 'eZcash'].map((brand) => (
                  <span key={brand} className="text-[10px] bg-card border border-border px-2 py-1 rounded font-semibold text-muted-foreground">
                    {brand}
                  </span>
                ))}
              </div>
              {PAYHERE_MODE === 'sandbox' && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-[10px] text-amber-400 font-medium">
                  🧪 Sandbox Mode — Use test card: <span className="font-mono font-bold">4916217501611292</span>
                </div>
              )}
            </div>
          )}

          {/* Bank Transfer info */}
          {selectedMethod === 'bank_transfer' && (
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4 space-y-3">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-widest">Bank Account Details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  ['Bank', 'Commercial Bank of Ceylon'],
                  ['Account Name', 'FTC Electronics'],
                  ['Account No.', '8001234567'],
                  ['Branch', 'Colombo 03'],
                  ['Branch Code', '003'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span className="text-muted-foreground block">{label}</span>
                    <span className="font-bold text-foreground font-mono">{value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground pt-1 border-t border-blue-500/15">
                After placing your order, you&apos;ll be able to upload your payment slip.
              </p>
            </div>
          )}

          {selectedMethod === 'cash_pickup' && (
            <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 text-xs space-y-1">
              <p className="font-bold text-emerald-400 uppercase tracking-widest text-[10px]">Collection Information</p>
              <p className="text-foreground font-medium">FTC Electronics — Colombo Showroom</p>
              <p className="text-muted-foreground">Bring your order confirmation when collecting. Open Mon–Sat, 9:00 AM – 6:00 PM.</p>
            </div>
          )}

          {selectedMethod === 'cash_delivery' && (
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 text-xs space-y-1">
              <p className="font-bold text-amber-400 uppercase tracking-widest text-[10px]">Cash on Delivery</p>
              <p className="text-muted-foreground">A delivery fee may apply. Our team will contact you to confirm delivery schedule. Have exact cash ready.</p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Place Order Button */}
        <Button
          type="button"
          onClick={handlePlaceOrder}
          disabled={loading || items.length === 0}
          className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm cursor-pointer transition-colors disabled:opacity-50 rounded-xl"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {selectedMethod === 'payhere' ? 'Redirecting to PayHere...' : 'Placing Order...'}
            </span>
          ) : selectedMethod === 'payhere' ? (
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Pay Securely — LKR {total.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
            </span>
          ) : (
            `Place Order — LKR ${total.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`
          )}
        </Button>

        <p className="text-[10px] text-center text-muted-foreground">
          {selectedMethod === 'payhere'
            ? 'You will be redirected to PayHere\'s secure payment page. Your card details are never stored by FTC Electronics.'
            : 'By placing your order, you agree to our Terms & Conditions. Order details will be sent to your email.'}
        </p>
      </div>
    </>
  );
}
