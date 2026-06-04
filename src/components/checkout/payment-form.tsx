'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PaymentForm() {
  const router = useRouter();
  const { total, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cardName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate payment transaction delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log('[Checkout] Processing payment for amount:', total);
    setLoading(false);
    
    // Clear shopping cart state after successful purchase
    clearCart();
    
    // Redirect to confirmation success page
    router.push('/checkout/confirmation?success=true');
  };

  return (
    <form onSubmit={handlePayment} className="space-y-6 text-foreground bg-card p-6 rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="text-base font-bold tracking-wide">Secure Payment Details</h3>
        <ShieldCheck className="h-5 w-5 text-emerald-550" />
      </div>

      <div className="rounded-lg bg-secondary/40 p-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total Amount Due</span>
        <span className="text-lg font-bold text-blue-600">${total.toFixed(2)}</span>
      </div>

      <div>
        <label htmlFor="cardName" className="block text-xs text-muted-foreground mb-2">Cardholder Name</label>
        <Input
          id="cardName"
          name="cardName"
          required
          value={formData.cardName}
          onChange={handleChange}
          placeholder="John Doe"
          className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="cardNumber" className="block text-xs text-muted-foreground mb-2">Card Number</label>
        <div className="relative">
          <Input
            id="cardNumber"
            name="cardNumber"
            required
            value={formData.cardNumber}
            onChange={handleChange}
            placeholder="•••• •••• •••• ••••"
            maxLength={19}
            className="h-10 bg-background border-border pl-10 text-foreground text-sm focus-visible:ring-blue-500"
          />
          <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="cardExpiry" className="block text-xs text-muted-foreground mb-2">Expiration Date</label>
          <Input
            id="cardExpiry"
            name="cardExpiry"
            required
            value={formData.cardExpiry}
            onChange={handleChange}
            placeholder="MM/YY"
            maxLength={5}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="cardCvc" className="block text-xs text-muted-foreground mb-2">CVC / CVV</label>
          <Input
            id="cardCvc"
            name="cardCvc"
            required
            value={formData.cardCvc}
            onChange={handleChange}
            placeholder="•••"
            maxLength={4}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full h-11 bg-blue-650 hover:bg-blue-600 text-white font-semibold cursor-pointer transition-colors"
      >
        {loading ? 'Processing Transaction...' : `Pay $${total.toFixed(2)} Now`}
      </Button>

      <p className="text-[10px] text-center text-muted-foreground">
        Your transaction is secured by SSL-encryption keys. We do not store credit card details.
      </p>
    </form>
  );
}
