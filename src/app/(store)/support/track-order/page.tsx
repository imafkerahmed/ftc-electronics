import { Metadata } from 'next';
import { Truck, Search, PackageCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Track Your Order | FTC Electronics Sri Lanka',
  description: 'Track the real-time status of your FTC Electronics order with your order ID and email address.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/support/track-order' },
};

export default function TrackOrderPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <div className="text-center mb-10">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 mb-4">
          <Truck className="h-7 w-7" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
          Track Your Order
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Enter your Order ID (found in your confirmation email or SMS) to get live tracking updates.
        </p>
      </div>

      <div className="p-6 sm:p-10 rounded-3xl bg-card border border-border shadow-xl">
        <form className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
              Order ID / Reference Number
            </label>
            <input
              type="text"
              required
              placeholder="e.g. FTC-84920"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
              Email Address or Phone Number
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 0771234567 or email@domain.com"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl py-4 transition-colors cursor-pointer"
          >
            <Search className="h-4 w-4" />
            Track Order Status
          </button>
        </form>

        <div className="mt-8 border-t border-border/60 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-xs text-muted-foreground">
          <div className="flex flex-col items-center">
            <PackageCheck className="h-5 w-5 text-blue-500 mb-1" />
            <span className="font-semibold text-foreground">1. Order Processing</span>
            <span className="text-[10px]">Verified & Dispatched</span>
          </div>
          <div className="flex flex-col items-center">
            <Truck className="h-5 w-5 text-blue-500 mb-1" />
            <span className="font-semibold text-foreground">2. Courier Transit</span>
            <span className="text-[10px]">Pronto / Domex / Prompt</span>
          </div>
          <div className="flex flex-col items-center">
            <PackageCheck className="h-5 w-5 text-emerald-500 mb-1" />
            <span className="font-semibold text-foreground">3. Doorstep Delivery</span>
            <span className="text-[10px]">1-3 Business Days</span>
          </div>
        </div>
      </div>
    </div>
  );
}
