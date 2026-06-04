'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OrderConfirmationPage() {
  const [orderNumber, setOrderNumber] = useState('');

  useEffect(() => {
    // Generate a mock order number asynchronously to avoid synchronous setState warnings
    const timer = setTimeout(() => {
      const randomNum = Math.floor(10000 + Math.random() * 90000);
      setOrderNumber(`FTC-${randomNum}`);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-xl mx-auto text-center space-y-6 bg-card border border-border rounded-xl p-8 md:p-12 text-foreground">
      {/* Icon */}
      <div className="flex justify-center">
        <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-500">
          <CheckCircle2 className="h-10 w-10 animate-bounce" />
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Order Confirmed!</h1>
        <p className="text-sm text-muted-foreground">
          Thank you for shopping with FTC Electronics. Your order has been successfully placed.
        </p>
      </div>

      {/* Details Box */}
      <div className="bg-secondary/40 border border-border rounded-lg p-5 max-w-sm mx-auto space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Order Number:</span>
          <span className="font-mono font-bold text-foreground">{orderNumber || 'Generating...'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Estimated Delivery:</span>
          <span className="text-foreground font-semibold">3-5 Business Days</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Notification:</span>
          <span className="text-foreground font-semibold">Confirmation sent to your email</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
        <Link href="/account/orders">
          <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer py-5 px-6 flex items-center justify-center gap-1.5 rounded-lg transition-colors">
            <ShoppingBag className="h-4 w-4" />
            View Order Status
          </Button>
        </Link>
        <Link href="/">
          <Button variant="ghost" className="w-full sm:w-auto text-muted-foreground hover:text-foreground py-5 px-6 rounded-lg">
            Back to Storefront
          </Button>
        </Link>
      </div>
    </div>
  );
}
