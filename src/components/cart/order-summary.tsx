'use client';

import { useCart } from '@/hooks/use-cart';

interface OrderSummaryProps {
  showItems?: boolean;
}

export default function OrderSummary({ showItems = false }: OrderSummaryProps) {
  const { items, subtotal, tax, shipping, total } = useCart();

  return (
    <div className="bg-card border border-border rounded-xl p-6 text-foreground space-y-6">
      <h3 className="text-base font-bold tracking-wide">Order Summary</h3>

      {/* Cart items list (Optional) */}
      {showItems && items.length > 0 && (
        <div className="border-b border-border pb-4 max-h-48 overflow-y-auto space-y-3">
          {items.map((item) => {
            const price = item.product.discountPrice ?? item.product.price;
            return (
              <div key={item.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate max-w-[200px]">
                  {item.product.name} <span className="text-muted-foreground/60">x{item.quantity}</span>
                </span>
                <span className="font-semibold">${(price * item.quantity).toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtotal, Shipping, Tax */}
      <div className="space-y-3 border-b border-border pb-4 text-sm text-muted-foreground">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="text-foreground font-medium">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Estimated Shipping</span>
          <span className="text-foreground font-medium">
            {shipping === 0 ? <span className="text-blue-500 font-semibold">Free</span> : `$${shipping.toFixed(2)}`}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Sales Tax (8%)</span>
          <span className="text-foreground font-medium">${tax.toFixed(2)}</span>
        </div>
      </div>

      {/* Total cost */}
      <div className="flex justify-between text-base font-bold">
        <span>Total</span>
        <span className="text-blue-500 font-extrabold">${total.toFixed(2)}</span>
      </div>

      {/* Promo Code placeholder */}
      <div className="pt-2">
        <label htmlFor="promo" className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Have a promo code?
        </label>
        <div className="flex space-x-2">
          <input
            id="promo"
            type="text"
            placeholder="FTC-SPECIAL"
            className="w-full bg-background border border-border text-xs px-3 py-2 rounded focus:outline-none focus:border-blue-500 text-foreground placeholder-muted-foreground/50"
          />
          <button className="bg-secondary hover:bg-secondary/80 text-xs text-foreground px-3 py-2 border border-border rounded transition-colors cursor-pointer">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
