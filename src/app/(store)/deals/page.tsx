import { Metadata } from 'next';
import { getCollectionProducts } from '@/lib/db';
import DealsClient from './deals-client';

export const metadata: Metadata = {
  title: 'On-Sale Tech Deals Sri Lanka | FTC Electronics',
  description: 'Shop exclusive electronics discounts and tech deals in Sri Lanka. Save on laptops, smartphones, and audio gear at FTC Electronics.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/deals' },
};

export default async function DealsPage() {
  const products = await getCollectionProducts('on-sale');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      <div className="relative mb-8 rounded-3xl overflow-hidden bg-card border border-border px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
            On-Sale Tech Deals
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed max-w-lg">
            Save big on genuine laptops, smartphones, and accessories with official warranty and 0% interest 3-month installment plans.
          </p>
        </div>
      </div>

      {/* Live-updating product grid via TanStack Query */}
      <DealsClient initialProducts={products} />
    </div>
  );
}
