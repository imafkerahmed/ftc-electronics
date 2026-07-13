"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, ShoppingBag, Heart, Check, Eye } from "lucide-react";
import { Product } from "@/types/product";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import QuickViewModal from "@/components/product/quick-view-modal";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const [isHovered, setIsHovered] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const [addedAnimation, setAddedAnimation] = useState(false);

  const {
    name,
    slug,
    price,
    discountPrice,
    images,
    brand,
    category,
    rating,
    numReviews,
    countInStock,
    currency,
  } = product;

  const hasDiscount = discountPrice !== undefined && discountPrice < price;
  const isOutOfStock = countInStock === 0;
  const activePrice = discountPrice || price;

  const discountPercent = hasDiscount
    ? Math.round(((price - discountPrice!) / price) * 100)
    : 0;

  const installmentAmount = Math.round(activePrice / 3);
  const secondaryImage = images.length > 1 ? images[1] : images[0];

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1500);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWishlisted(!isWishlisted);
  };

  const handleOpenQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsQuickViewOpen(true);
  };

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xs p-3.5 transition-all duration-300 hover:border-blue-500/40 hover:bg-card hover:shadow-xl hover:shadow-blue-500/10"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Product Image Link with Hover Swap */}
      <Link
        href={`/products/${slug}`}
        className="relative aspect-square w-full overflow-hidden rounded-xl bg-neutral-900/40 block"
      >
        <Image
          src={isHovered && secondaryImage ? secondaryImage : images[0]}
          alt={name}
          fill
          className="object-cover object-center transition-all duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={false}
        />

        {/* Badges (Top-Left) */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
          {hasDiscount && (
            <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white uppercase tracking-wider shadow-sm">
              -{discountPercent}%
            </span>
          )}
          {product.badges?.includes("new-arrival") && !hasDiscount && (
            <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-extrabold text-white uppercase tracking-wider shadow-sm">
              NEW
            </span>
          )}
        </div>

        {/* Action Buttons (Top-Right) */}
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
          <button
            onClick={handleOpenQuickView}
            type="button"
            aria-label="Quick View"
            title="Quick View"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-background/75 backdrop-blur-md text-foreground transition-all duration-200 hover:bg-background hover:scale-110 active:scale-95"
          >
            <Eye className="h-3.5 w-3.5 text-foreground/80" />
          </button>

          <button
            onClick={handleToggleWishlist}
            type="button"
            aria-label="Add to Wishlist"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-background/75 backdrop-blur-md text-foreground transition-all duration-200 hover:bg-background hover:scale-110 active:scale-95"
          >
            <Heart
              className={`h-3.5 w-3.5 ${
                isWishlisted
                  ? "fill-rose-500 text-rose-500"
                  : "text-foreground/80"
              }`}
            />
          </button>
        </div>

        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-xs z-10">
            <span className="rounded-lg bg-neutral-900 border border-border px-3 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Sold Out
            </span>
          </div>
        )}
      </Link>

      {/* Product Information */}
      <div className="mt-3 flex flex-col flex-1">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium tracking-wide uppercase">
          <Link
            href={`/brands/${brand.toLowerCase()}`}
            className="hover:text-blue-500 transition-colors"
          >
            {brand}
          </Link>
          <span>•</span>
          <Link
            href={`/products/${category.toLowerCase()}`}
            className="hover:text-blue-500 transition-colors capitalize"
          >
            {category}
          </Link>
        </div>

        <h3 className="mt-1 text-xs sm:text-sm font-bold text-foreground line-clamp-2 leading-snug group-hover:text-blue-500 transition-colors">
          <Link href={`/products/${slug}`}>{name}</Link>
        </h3>

        {/* Rating Row */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="flex text-amber-400">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Star
                key={idx}
                className={`h-3 w-3 ${
                  idx < Math.floor(rating)
                    ? "fill-current"
                    : "text-muted-foreground/25"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] font-bold text-foreground">
            {rating.toFixed(1)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            ({numReviews})
          </span>
        </div>

        {/* Price & Installments Block */}
        <div className="mt-2.5 pt-2 border-t border-border/40 flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm sm:text-base font-black text-foreground">
              {formatPrice(activePrice, currency)}
            </span>
            {hasDiscount && (
              <span className="text-[11px] text-muted-foreground line-through">
                {formatPrice(price, currency)}
              </span>
            )}
          </div>

          <div className="text-[9px] text-muted-foreground font-medium flex items-center gap-1">
            <span>or 3x</span>
            <span className="font-bold text-foreground">
              {formatPrice(installmentAmount, currency)}
            </span>
            <span>with Koko/Mintpay</span>
          </div>
        </div>

        {/* Full-Width Add to Cart CTA */}
        <div className="mt-3 pt-1">
          <Button
            size="sm"
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`w-full h-9 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer ${
              addedAnimation
                ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
            }`}
          >
            {addedAnimation ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Added to Cart!</span>
              </>
            ) : (
              <>
                <ShoppingBag className="h-3.5 w-3.5" />
                <span>Add to Cart</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Quick View Modal */}
      <QuickViewModal
        product={product}
        isOpen={isQuickViewOpen}
        onClose={() => setIsQuickViewOpen(false)}
      />
    </div>
  );
}
