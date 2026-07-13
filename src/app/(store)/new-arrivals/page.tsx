import { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, Package } from 'lucide-react';
import { getCollectionProducts } from '@/lib/db';
import ProductCard from '@/components/product/product-card';

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

      <div className="flex items-center justify-between py-3 mb-6 border-b border-border/60">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-bold text-foreground tabular-nums">{products.length}</span> new arrivals
        </p>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-border rounded-2xl bg-card/30">
          <Package className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-lg font-black text-foreground mb-2">No new arrivals listed today</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">Browse our full product line!</p>
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
