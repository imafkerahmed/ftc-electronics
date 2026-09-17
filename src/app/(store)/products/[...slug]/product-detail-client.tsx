'use client';

import { useQuery } from '@tanstack/react-query';
import { Star, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import AddToCartButton from '@/components/product/add-to-cart-button';
import WhatsAppOrderButton from '@/components/product/whatsapp-order-button';
import StickyBuyBar from '@/components/product/sticky-buy-bar';
import { formatPrice } from '@/lib/utils';
import { productKeys } from '@/lib/query-keys';
import type { Product } from '@/types/product';

interface ProductDetailClientProps {
  initialProduct: Product;
  slug: string;
  categorySlug: string;
}

async function fetchProductBySlug(slug: string): Promise<Product> {
  const res = await fetch(`/api/products/${slug}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch product');
  return res.json();
}

export default function ProductDetailClient({
  initialProduct,
  slug,
  categorySlug,
}: ProductDetailClientProps) {
  const { data: product = initialProduct } = useQuery<Product>({
    queryKey: productKeys.detail(slug),
    queryFn: () => fetchProductBySlug(slug),
    initialData: initialProduct,
    // staleTime inherits the global value (0), so refetchOnWindowFocus fires immediately
    // when the user switches back from the admin tab.
    // refetchInterval acts as a safety net — auto-refreshes every 8s in the background.
    refetchOnWindowFocus: true,
    refetchInterval: 8000,
  });

  const hasDiscount =
    product.discountPrice !== undefined && product.discountPrice < product.price;
  const discountPercent =
    hasDiscount && product.discountPrice !== undefined
      ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
      : 0;

  const currency = product.currency || 'LKR';
  const activePrice = product.discountPrice || product.price;

  return (
    <>
      {/* Product Meta */}
      <div className="flex flex-col space-y-5 lg:col-span-6 xl:col-span-6 max-w-lg">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-foreground leading-tight">
            {product.name}
          </h1>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex text-amber-500">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Star
                  key={idx}
                  className={`h-3.5 w-3.5 ${idx < Math.floor(product.rating) ? 'fill-current' : 'text-muted-foreground/30'}`}
                />
              ))}
            </div>
            <span className="text-xs font-semibold text-foreground">{product.rating}</span>
            <span className="text-xs text-muted-foreground">
              ({product.numReviews} customer reviews)
            </span>
          </div>

          {/* Stock Tracker */}
          <div className="mt-4 flex items-center gap-2">
            {product.countInStock === 0 ? (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground bg-neutral-900 border border-border px-2.5 py-1 rounded-lg">
                Out of Stock
              </div>
            ) : product.countInStock <= 5 ? (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-500 bg-rose-955/15 border border-rose-500/25 px-2.5 py-1 rounded-lg animate-pulse">
                Only {product.countInStock} items left in stock - order soon!
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500 bg-emerald-955/15 border border-emerald-500/25 px-2.5 py-1 rounded-lg">
                In Stock (Ready to Ship)
              </div>
            )}
          </div>

          {/* Pricing */}
          <div className="mt-6 flex flex-col gap-1">
            {hasDiscount ? (
              <>
                <span className="text-3xl font-black text-foreground tracking-tight whitespace-nowrap">
                  {formatPrice(product.discountPrice!, currency)}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-medium text-muted-foreground line-through whitespace-nowrap">
                    {formatPrice(product.price, currency)}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md whitespace-nowrap">
                    SAVE {discountPercent}%
                  </span>
                </div>
              </>
            ) : (
              <span className="text-3xl font-black text-foreground tracking-tight whitespace-nowrap">
                {formatPrice(product.price, currency)}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-border/65 pt-6 flex flex-col gap-4">
          <AddToCartButton product={product} />
          <WhatsAppOrderButton
            productName={product.name}
            productPrice={formatPrice(activePrice, currency)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 pt-6 border-t border-border/65 text-center">
          <div className="p-3 bg-card/30 border border-border/60 rounded-xl flex flex-col items-center justify-center hover:bg-card/50 transition-colors">
            <ShieldCheck className="h-5 w-5 text-blue-500 mb-1.5" />
            <span className="text-[10px] font-bold text-foreground">100% Genuine</span>
            <span className="text-[8px] text-muted-foreground mt-0.5">Official Warranty</span>
          </div>
          <div className="p-3 bg-card/30 border border-border/60 rounded-xl flex flex-col items-center justify-center hover:bg-card/50 transition-colors">
            <Truck className="h-5 w-5 text-blue-500 mb-1.5" />
            <span className="text-[10px] font-bold text-foreground">Fast Delivery</span>
            <span className="text-[8px] text-muted-foreground mt-0.5">Islandwide Shipping</span>
          </div>
          <div className="p-3 bg-card/30 border border-border/60 rounded-xl flex flex-col items-center justify-center hover:bg-card/50 transition-colors">
            <RotateCcw className="h-5 w-5 text-blue-500 mb-1.5" />
            <span className="text-[10px] font-bold text-foreground">Easy Returns</span>
            <span className="text-[8px] text-muted-foreground mt-0.5">30-Day Policy</span>
          </div>
        </div>

        <div className="border-t border-border/65 pt-4 flex flex-wrap items-center gap-y-2 gap-x-4 text-[10px] text-muted-foreground font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-foreground/50 tracking-wider uppercase font-semibold">SKU:</span>
            <span className="text-foreground/90 font-medium">{product.id}</span>
          </div>
          <div className="h-3 w-[1px] bg-border/80 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-foreground/50 tracking-wider uppercase font-semibold">Category:</span>
            <Link
              href={`/products/${categorySlug}`}
              className="text-foreground/90 hover:text-blue-500 transition-colors font-medium capitalize"
            >
              {product.category}
            </Link>
          </div>
          <div className="h-3 w-[1px] bg-border/80 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-foreground/50 tracking-wider uppercase font-semibold">Brand:</span>
            <Link
              href={`/brands/${product.brand.toLowerCase()}`}
              className="text-foreground/90 hover:text-blue-500 transition-colors font-medium capitalize"
            >
              {product.brand}
            </Link>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Buy Bar — re-uses live product data */}
      <StickyBuyBar product={product} />
    </>
  );
}
