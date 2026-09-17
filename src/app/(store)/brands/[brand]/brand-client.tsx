'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import ProductCard from '@/components/product/product-card';
import { productKeys } from '@/lib/query-keys';
import type { Product } from '@/types/product';
import type { Brand } from '@/types/product';

interface BrandClientProps {
  brandSlug: string;
  initialProducts: Product[];
  initialBrand: Brand | null;
}

async function fetchBrandData(slug: string): Promise<{ brand: Brand | null; products: Product[] }> {
  const res = await fetch(`/api/products/brand/${slug}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch brand products');
  return res.json();
}

export default function BrandClient({ brandSlug, initialProducts, initialBrand }: BrandClientProps) {
  const { data } = useQuery({
    queryKey: [...productKeys.lists(), 'brand', brandSlug],
    queryFn: () => fetchBrandData(brandSlug),
    initialData: { brand: initialBrand, products: initialProducts },
    refetchOnWindowFocus: true,
    refetchInterval: 8000,
  });

  const products = data?.products ?? initialProducts;
  const brand = data?.brand ?? initialBrand;
  const displayName = brand ? brand.name : brandSlug.replace(/-/g, ' ');

  return (
    <>
      <div className="flex items-center justify-between gap-4 py-3 mb-6 border-b border-border/60">
        <p className="text-sm text-muted-foreground">
          Showing{' '}
          <span className="font-bold text-foreground tabular-nums">{products.length}</span>{' '}
          products from{' '}
          <span className="capitalize font-semibold text-foreground">{displayName}</span>
        </p>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-border rounded-2xl bg-card/30">
          <h3 className="text-lg font-black text-foreground mb-2">No {displayName} products listed</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">Explore our full product catalog for available devices.</p>
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
