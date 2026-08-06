"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShoppingBag, Check } from "lucide-react";
import { Product } from "@/types/product";
import { useCart } from "@/hooks/use-cart";
import { useUiStore } from "@/store/use-ui-store";

interface CollectionProductCardProps {
  product: Product;
  themeColor?: "red" | "purple" | "teal" | "blue";
}

export default function CollectionProductCard({
  product,
}: CollectionProductCardProps) {
  const {
    name,
    slug,
    price,
    discountPrice,
    images,
    brand,
    currency,
    countInStock,
  } = product;

  const { addItem } = useCart();
  const setCartDrawerOpen = useUiStore((state) => state.setCartDrawerOpen);
  const [added, setAdded] = useState(false);

  const hasDiscount = discountPrice !== undefined && discountPrice < price;
  const isOutOfStock = countInStock === 0;
  const activePrice = discountPrice || price;
  const secondaryImage = images.length > 1 ? images[1] : images[0];

  const discountPercent = hasDiscount
    ? Math.round(((price - discountPrice!) / price) * 100)
    : 0;

  const formatPriceVal = (value: number) => {
    if (currency === "LKR") {
      return `Rs.${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `$${value.toFixed(2)}`;
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;
    addItem(product);
    setCartDrawerOpen(true);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="group flex flex-col w-full min-w-0 select-none relative rounded-2xl border border-neutral-200/90 dark:border-white/10 bg-white dark:bg-neutral-900/90 p-3 sm:p-3.5 shadow-2xs hover:shadow-xl hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:-translate-y-1 transition-all duration-300">
      <Link
        href={`/products/${slug}`}
        className="flex flex-col w-full min-w-0 cursor-pointer"
      >
        {/* ── Seamless Image Stage Container ── */}
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl flex items-center justify-center p-2">
          {/* Discount Badge */}
          {hasDiscount && (
            <span className="absolute top-2.5 left-2.5 z-10 bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider shadow-2xs">
              -{discountPercent}%
            </span>
          )}

          {/* Primary Image */}
          <Image
            src={images[0]}
            alt={name}
            fill
            className="object-contain p-2 transition-transform duration-500 ease-out group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={false}
          />

          {/* Secondary Hover Image */}
          {secondaryImage && secondaryImage !== images[0] && (
            <Image
              src={secondaryImage}
              alt={`${name} secondary`}
              fill
              className="object-contain p-1 absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={false}
            />
          )}

          {/* Sold out overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-black/70 backdrop-blur-xs z-10 rounded-xl">
              <span className="rounded-md bg-neutral-900 dark:bg-white px-2.5 py-0.5 text-[9px] font-black text-white dark:text-black uppercase tracking-widest">
                Sold Out
              </span>
            </div>
          )}
        </div>

        {/* ── Product Details ── */}
        <div className="mt-2.5 flex flex-col items-start text-left">
          {brand && (
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500 leading-none mb-1">
              {brand}
            </span>
          )}
          <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100 line-clamp-1 leading-snug tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200">
            {name}
          </h3>

          <div className="mt-1 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
            <span className="text-sm sm:text-base font-extrabold text-neutral-900 dark:text-white tracking-tight">
              {formatPriceVal(activePrice)}
            </span>
            {hasDiscount && (
              <span className="text-xs text-neutral-400 line-through font-normal">
                {formatPriceVal(price)}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Hover Add to Cart Button (Positioned over image stage outside Link) */}
      {!isOutOfStock && (
        <div className="absolute top-[calc(60%-1.5rem)] inset-x-5 z-20 opacity-0 translate-y-3 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 ease-out pointer-events-auto">
          <button
            type="button"
            onClick={handleAddToCart}
            className={`w-full py-2 px-3 rounded-xl text-xs font-bold tracking-wide flex items-center justify-center gap-1.5 transition-all duration-200 shadow-md cursor-pointer ${
              added
                ? "bg-emerald-600 text-white"
                : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-100"
            }`}
          >
            {added ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Added to Cart</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Add to Cart</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
