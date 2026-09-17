'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Tag } from 'lucide-react';
import ProductCard from '@/components/product/product-card';
import { productKeys } from '@/lib/query-keys';
import type { Product } from '@/types/product';

async function fetchDeals(): Promise<Product[]> {
  const res = await fetch('/api/products/collection/on-sale', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch deals');
  return res.json();
}

export default function DealsClient({ initialProducts }: { initialProducts: Product[] }) {
  const { data: products = initialProducts } = useQuery<Product[]>({
    queryKey: [...productKeys.lists(), 'collection', 'on-sale'],
    queryFn: fetchDeals,
    initialData: initialProducts,
    refetchOnWindowFocus: true,
    refetchInterval: 8000,
  });

  return (
    <>
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
    </>
  );
}
