import { Metadata } from 'next';
import { Truck, RotateCcw, CheckCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Shipping & Returns Policy | FTC Electronics Sri Lanka',
  description: 'Learn about islandwide delivery times, shipping rates, and our 30-day hassle-free return policy at FTC Electronics.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/support/shipping-returns' },
};

export default function ShippingReturnsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-3">
          Shipping & Returns Policy
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          At FTC Electronics, we strive to deliver your tech orders safely and promptly across Sri Lanka. Read our delivery schedules and return guidelines below.
        </p>
      </div>

      <div className="space-y-8">
        {/* Shipping Section */}
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border space-y-4">
          <div className="flex items-center gap-3 text-blue-500">
            <Truck className="h-6 w-6" />
            <h2 className="text-xl font-bold text-foreground">Islandwide Delivery</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We partner with premier courier services (Pronto, Domex, Prompt Xpress) to deliver insured packages to all 25 districts in Sri Lanka.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
            <div className="p-4 rounded-xl bg-background border border-border/80">
              <span className="font-bold text-foreground block mb-1">Greater Colombo Area</span>
              <span className="text-muted-foreground">Same-day or Next-day Delivery (LKR 350 or FREE on orders over LKR 50,000)</span>
            </div>
            <div className="p-4 rounded-xl bg-background border border-border/80">
              <span className="font-bold text-foreground block mb-1">Outstation Districts</span>
              <span className="text-muted-foreground">1 to 3 Business Days (Standard courier rate calculated at checkout)</span>
            </div>
          </div>
        </div>

        {/* Returns Section */}
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border space-y-4">
          <div className="flex items-center gap-3 text-emerald-500">
            <RotateCcw className="h-6 w-6" />
            <h2 className="text-xl font-bold text-foreground">Returns & Exchanges (7-Day Policy)</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            If your item arrives dead on arrival (DOA), defective, or damaged in transit, you are eligible for an immediate replacement or full refund within 7 days of delivery.
          </p>

          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Conditions for Return:</h4>
            {[
              'Item must be in original factory packaging with all seal tags intact',
              'Included accessories, manuals, and warranty cards must be present',
              'Proof of purchase (invoice or digital receipt) must be presented',
              'Defects caused by liquid damage, physical drops, or unauthorized tampering are excluded',
            ].map((condition, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{condition}</span>
              </div>
            ))}
          </div>
        </div>

        {/* How to Initiate Return */}
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border space-y-3">
          <h3 className="text-base font-bold text-foreground">How to Initiate a Return</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Contact our support helpline at <strong className="text-foreground">+94 77 123 4567</strong> or email <strong className="text-foreground">support@ftcelectronics.lk</strong> with your order number and photos of the issue. Our team will arrange a courier pickup or instruct you to bring the unit to our Colombo store.
          </p>
        </div>
      </div>
    </div>
  );
}
