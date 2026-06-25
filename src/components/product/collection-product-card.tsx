"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Plus, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Product } from "@/types/product";
import { useCart } from "@/hooks/use-cart";
import { useUiStore } from "@/store/use-ui-store";

interface CollectionProductCardProps {
  product: Product;
  themeColor?: "red" | "purple" | "teal" | "blue";
}

export default function CollectionProductCard({
  product,
  themeColor = "blue",
}: CollectionProductCardProps) {
  const {
    name,
    slug,
    price,
    discountPrice,
    images,
    rating,
    numReviews,
    brand,
    currency,
    countInStock,
  } = product;

  const { addItem } = useCart();
  const setCartDrawerOpen = useUiStore((state) => state.setCartDrawerOpen);

  const [isAdding, setIsAdding] = useState(false);
  const hasDiscount = discountPrice !== undefined;
  const isOutOfStock = countInStock === 0;
  const hasMultipleImages = images.length > 1;

  // Format price helper
  const formatPriceVal = (value: number) => {
    if (currency === "LKR") {
      return `Rs.${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${value.toFixed(2)}`;
  };

  // Quick Add handler
  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isOutOfStock) return;

    setIsAdding(true);
    addItem(product);

    // Trigger cart drawer slide-in
    setCartDrawerOpen(true);

    setTimeout(() => {
      setIsAdding(false);
    }, 1200);
  };

  // Glow shadow map for hovered state
  const getHoverShadowClass = () => {
    switch (themeColor) {
      case "red":
        return "hover:shadow-[0_15px_30px_rgba(239,68,68,0.08)] hover:border-red-500/40 dark:hover:border-red-500/40";
      case "purple":
        return "hover:shadow-[0_15px_30px_rgba(139,92,246,0.08)] hover:border-violet-500/40 dark:hover:border-violet-500/40";
      case "teal":
        return "hover:shadow-[0_15px_30px_rgba(20,184,166,0.08)] hover:border-teal-500/40 dark:hover:border-teal-500/40";
      case "blue":
      default:
        return "hover:shadow-[0_15px_30px_rgba(59,130,246,0.08)] hover:border-blue-500/40 dark:hover:border-blue-500/40";
    }
  };

  return (
    <Link
      href={`/products/${slug}`}
      className={`group flex flex-col w-full min-w-0 select-none cursor-pointer relative p-4 rounded-2xl border border-neutral-200/70 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/60 backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 z-10 ${getHoverShadowClass()}`}
    >
      {/* Image Container with seamless background and dynamic glow */}
      <div className="relative aspect-[4/3] w-full overflow-hidden flex items-center justify-center mb-4">
        {/* Soft background ambient circle glow */}
        <div
          className={`absolute w-28 h-28 rounded-full blur-[24px] opacity-10 dark:opacity-15 pointer-events-none -z-10 transition-transform duration-500 group-hover:scale-110 ${
            themeColor === "red"
              ? "bg-red-500"
              : themeColor === "purple"
                ? "bg-purple-500"
                : themeColor === "teal"
                  ? "bg-teal-500"
                  : "bg-blue-500"
          }`}
        />

        {/* Primary Image */}
        <Image
          src={images[0]}
          alt={name}
          fill
          className={`object-contain p-2 transition-all duration-500 group-hover:scale-105 ${
            hasMultipleImages
              ? "opacity-100 group-hover:opacity-0"
              : "opacity-100"
          }`}
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
          priority={false}
        />

        {/* Secondary Hover Image */}
        {hasMultipleImages && (
          <Image
            src={images[1]}
            alt={`${name} secondary view`}
            fill
            className="object-contain p-2 absolute inset-0 opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            priority={false}
          />
        )}

        {/* Sold out overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] z-10 rounded-xl">
            <span className="rounded-md bg-background border border-border px-3 py-1 text-[10px] font-bold text-foreground uppercase tracking-widest shadow-sm">
              Sold Out
            </span>
          </div>
        )}
      </div>

      {/* Product Details Section */}
      <div className="flex flex-col flex-grow">
        {/* Brand Name Tag */}
        {brand && (
          <span className="text-[10px] font-extrabold tracking-wider uppercase text-neutral-450 dark:text-neutral-500 mb-1">
            {brand}
          </span>
        )}

        {/* Product Title (2-line clamp ensures alignment) */}
        <h4 className="text-xs sm:text-[13px] font-bold text-neutral-850 dark:text-neutral-200 line-clamp-2 leading-snug min-h-[36px] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-200">
          {name}
        </h4>

        {/* Interactive Star Rating Row */}
        <div className="flex items-center gap-1.5 mt-1.5 mb-3.5">
          <div className="flex items-center text-amber-400">
            {Array.from({ length: 5 }).map((_, i) => {
              const starVal = i + 1;
              const isFilled = rating >= starVal;
              return (
                <Star
                  key={i}
                  className={`h-3 w-3 ${
                    isFilled
                      ? "fill-amber-400 text-amber-400"
                      : "text-neutral-250 dark:text-neutral-750"
                  }`}
                />
              );
            })}
          </div>
          <span className="text-[10px] font-medium text-neutral-450 dark:text-neutral-500">
            {rating ? rating.toFixed(1) : "5.0"} ({numReviews || 0})
          </span>
        </div>

        {/* Pricing & Quick Action Row */}
        <div className="mt-auto pt-3.5 border-t border-neutral-100 dark:border-neutral-800/50 flex items-center justify-between gap-4">
          {/* Price Container */}
          <div className="flex flex-col">
            {hasDiscount ? (
              <>
                <span className="text-[10px] text-neutral-400 line-through leading-none mb-1">
                  {formatPriceVal(price)}
                </span>
                <span
                  className={`text-sm sm:text-base font-black leading-none ${
                    themeColor === "red"
                      ? "text-red-500 dark:text-red-400"
                      : themeColor === "purple"
                        ? "text-violet-500 dark:text-violet-400"
                        : themeColor === "teal"
                          ? "text-teal-600 dark:text-teal-400"
                          : "text-blue-500 dark:text-blue-400"
                  }`}
                >
                  {formatPriceVal(discountPrice)}
                </span>
              </>
            ) : (
              <span className="text-sm sm:text-base font-black text-neutral-900 dark:text-white leading-none">
                {formatPriceVal(price)}
              </span>
            )}
          </div>

          {/* Quick-add Circular Icon Button */}
          <div className="shrink-0">
            {isOutOfStock ? (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-neutral-50 dark:bg-neutral-900/60 text-neutral-400 dark:text-neutral-600 border border-neutral-200/50 dark:border-neutral-800/50">
                Out
              </span>
            ) : (
              <motion.button
                onClick={handleQuickAdd}
                className={`h-9 w-9 rounded-full flex items-center justify-center border transition-all duration-300 focus:outline-none cursor-pointer ${
                  isAdding
                    ? themeColor === "red"
                      ? "bg-red-500 border-red-500 text-white"
                      : themeColor === "purple"
                        ? "bg-violet-500 border-violet-500 text-white"
                        : themeColor === "teal"
                          ? "bg-teal-500 border-teal-500 text-white"
                          : "bg-blue-500 border-blue-500 text-white"
                    : `bg-neutral-50 border-neutral-200 text-neutral-800 dark:bg-neutral-800/50 dark:border-neutral-800 dark:text-neutral-300 hover:scale-105 active:scale-95 ${
                        themeColor === "red"
                          ? "hover:bg-red-500 hover:border-red-500 hover:text-white dark:hover:bg-red-500 dark:hover:border-red-500 dark:hover:text-white shadow-md shadow-red-500/5"
                          : themeColor === "purple"
                            ? "hover:bg-violet-500 hover:border-violet-500 hover:text-white dark:hover:bg-violet-500 dark:hover:border-violet-500 dark:hover:text-white shadow-md shadow-violet-500/5"
                            : themeColor === "teal"
                              ? "hover:bg-teal-500 hover:border-teal-500 hover:text-white dark:hover:bg-teal-500 dark:hover:border-teal-500 dark:hover:text-white shadow-md shadow-teal-500/5"
                              : "hover:bg-blue-500 hover:border-blue-500 hover:text-white dark:hover:bg-blue-500 dark:hover:border-blue-500 dark:hover:text-white shadow-md shadow-blue-500/5"
                      }`
                }`}
                whileTap={{ scale: 0.9 }}
                aria-label="Add directly to cart"
              >
                <AnimatePresence mode="wait">
                  {isAdding ? (
                    <motion.div
                      key="added"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Check className="h-4 w-4 stroke-[3]" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="add"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Plus className="h-4.5 w-4.5 stroke-[2.5]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
