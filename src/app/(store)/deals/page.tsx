import { Metadata } from 'next';
import Link from 'next/link';
import { Tag, Sparkles } from 'lucide-react';
import { getCollectionProducts } from '@/lib/db';
import ProductCard from '@/components/product/product-card';

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

      <div className="flex items-center justify-between py-3 mb-6 border-b border-border/60">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-bold text-foreground tabular-nums">{products.length}</span> active deals
        </p>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-border rounded-2xl bg-card/30">
          <Tag className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-black text-foreground mb-2">No active sale items right now</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">Check back soon for upcoming promotion drops!</p>
          <Link href="/products" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl px-6 py-3.5 transition-colors">
            View All Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
