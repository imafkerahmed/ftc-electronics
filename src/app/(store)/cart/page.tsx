'use client';

import Link from 'next/link';
import { ShoppingBag, ArrowRight, ArrowLeft } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import CartItemRow from '@/components/cart/cart-item';
import OrderSummary from '@/components/cart/order-summary';

export default function CartPage() {
  const { items, clearCart } = useCart();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      {/* Title */}
      <div className="border-b border-border pb-5 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Shopping Cart</h1>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-xl p-8">
          <ShoppingBag className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-bold text-foreground">Your cart is empty</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
            It looks like you haven&apos;t added anything to your cart yet. Browse our products to find best deals!
          </p>
          <Link href="/products" className="mt-8">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-5 cursor-pointer">
              Start Shopping
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Items List (Left Side) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                <span className="text-sm text-muted-foreground font-medium">Cart Items ({items.length})</span>
                <button
                  onClick={clearCart}
                  className="text-xs text-muted-foreground hover:text-red-650 transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              <div className="divide-y divide-border">
                {items.map((item) => (
                  <CartItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>

            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors pl-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Continue Shopping
            </Link>
          </div>

          {/* Pricing & Checkout summary (Right Side) */}
          <div className="space-y-4">
            <OrderSummary />
            <Link href="/checkout/shipping" className="block w-full">
              <Button className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer rounded-lg flex items-center justify-center gap-2 transition-all">
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
