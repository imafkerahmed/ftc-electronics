import { Metadata } from 'next';
import { Sparkles } from 'lucide-react';
import { getCollectionProducts } from '@/lib/db';
import NewArrivalsClient from './new-arrivals-client';

export const metadata: Metadata = {
  title: 'New Arrivals | FTC Electronics Sri Lanka',
  description: 'Discover the newest laptops, gaming gear, smartphones, and accessories newly stocked at FTC Electronics.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/new-arrivals' },
};

export default async function NewArrivalsPage() {
  const products = await getCollectionProducts('new-arrivals');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      <div className="relative mb-8 rounded-3xl overflow-hidden bg-gradient-to-r from-blue-955/40 via-card to-indigo-955/30 border border-blue-500/20 px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute -top-12 -right-12 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold tracking-wider uppercase mb-3">
          <Sparkles className="h-4 w-4" /> Fresh Drops
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
          New Arrivals
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          Be the first to experience the latest flagships and computing hardware newly arrived in Sri Lanka.
        </p>
      </div>

      {/* Live-updating product grid via TanStack Query */}
      <NewArrivalsClient initialProducts={products} />
    </div>
  );
}
