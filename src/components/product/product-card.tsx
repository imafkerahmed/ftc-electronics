'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Star, ShoppingCart } from 'lucide-react';
import { Product } from '@/types/product';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const { name, slug, price, discountPrice, images, brand, rating, countInStock, currency } = product;

  const hasDiscount = discountPrice !== undefined;
  const isOutOfStock = countInStock === 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault(); // prevent navigation to product detail page
    addItem(product);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:border-border/80 hover:shadow-lg hover:shadow-blue-500/5">
      
      {/* Product Image Link */}
      <Link href={`/products/${slug}`} className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted block">
        <Image
          src={images[0]}
          alt={name}
          fill
          className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority={false}
        />
        {hasDiscount && (
          <span className="absolute top-2 left-2 rounded-full bg-blue-650 px-2.5 py-0.5 text-[10px] font-semibold text-white uppercase tracking-wider z-10">
            Sale
          </span>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] z-10">
            <span className="rounded bg-background border border-border px-3 py-1 text-xs font-bold text-foreground uppercase tracking-widest">
              Sold Out
            </span>
          </div>
        )}
      </Link>

      {/* Product Metadata Info */}
      <div className="mt-4 flex flex-col flex-1">
        <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase">{brand}</p>
        <h3 className="mt-1 text-sm font-semibold text-foreground line-clamp-1 group-hover:text-blue-600 transition-colors">
          <Link href={`/products/${slug}`}>{name}</Link>
        </h3>

        {/* Rating Stars */}
        <div className="mt-1.5 flex items-center gap-1">
          <div className="flex text-amber-500">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Star
                key={idx}
                className={`h-3 w-3 ${
                  idx < Math.floor(rating) ? 'fill-current' : 'text-muted-foreground/30'
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">({product.numReviews})</span>
        </div>

        {/* Pricing & Add to Cart button */}
        <div className="mt-auto pt-4 flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            {hasDiscount && discountPrice !== undefined ? (
              <>
                <span className="text-sm sm:text-base font-black text-foreground whitespace-nowrap truncate">
                  {formatPrice(discountPrice, currency)}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground line-through whitespace-nowrap truncate">
                  {formatPrice(price, currency)}
                </span>
              </>
            ) : (
              <span className="text-sm sm:text-base font-black text-foreground whitespace-nowrap truncate">
                {formatPrice(price, currency)}
              </span>
            )}
          </div>

          <Button
            size="sm"
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className="h-8 w-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white p-0 flex items-center justify-center cursor-pointer transition-colors shrink-0"
            aria-label="Add to Cart"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
