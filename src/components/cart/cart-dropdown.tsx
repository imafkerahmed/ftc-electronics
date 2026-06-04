'use client';

import Link from 'next/link';
import { X, ShoppingCart, ArrowRight } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { useUiStore } from '@/store/use-ui-store';
import { Button } from '@/components/ui/button';
import CartItemRow from './cart-item';

export default function CartDropdown() {
  const { items, subtotal } = useCart();
  const isOpen = useUiStore((state) => state.isCartDrawerOpen);
  const setCartDrawerOpen = useUiStore((state) => state.setCartDrawerOpen);

  const closeDrawer = () => setCartDrawerOpen(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={closeDrawer}
      />

      {/* Drawer Body */}
      <div className="relative flex w-full max-w-md flex-col bg-background border-l border-border text-foreground shadow-2xl animate-in slide-in-from-right duration-250">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-bold tracking-wide">Your Cart</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={closeDrawer}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable list items */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4" data-lenis-prevent>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-base font-semibold text-muted-foreground">Your cart is empty</p>
              <p className="text-xs text-muted-foreground/80 mt-1 max-w-[200px]">
                Add items from our catalog to get started.
              </p>
              <Button
                onClick={closeDrawer}
                className="mt-6 bg-secondary hover:bg-secondary/80 border border-border text-foreground"
              >
                Continue Shopping
              </Button>
            </div>
          ) : (
            items.map((item) => (
              <CartItemRow key={item.id} item={item} />
            ))
          )}
        </div>

        {/* Checkout Summaries and CTAs */}
        {items.length > 0 && (
          <div className="border-t border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold text-foreground">${subtotal}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Shipping, taxes, and coupons calculated at checkout.
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/checkout/shipping" onClick={closeDrawer} className="w-full">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-5 cursor-pointer flex items-center justify-center gap-2">
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/cart" onClick={closeDrawer} className="w-full">
                <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground py-5">
                  View Full Cart
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
