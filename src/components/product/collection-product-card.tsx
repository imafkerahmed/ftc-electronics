"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Check } from "lucide-react";
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
    brand,
    category,
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
      return `Rs.${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

  // Subtitle (Category & Brand)
  const subTitleText = category && brand 
    ? `${category.charAt(0).toUpperCase() + category.slice(1)}, ${brand}` 
    : category || brand || "";

  // Badge Text
  const getBadgeText = () => {
    if (isOutOfStock) return "Out of Stock";
    if (hasDiscount) return "On Sale";
    if (product.isFeatured) return "Featured";
    return "New Arrival";
  };

  // Badge Color matching section color
  const getBadgeColorClass = () => {
    if (isOutOfStock) {
      return "bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400";
    }
    switch (themeColor) {
      case "red":
        return "bg-red-500 text-white";
      case "purple":
        return "bg-violet-500 text-white";
      case "teal":
        return "bg-teal-600 text-white";
      case "blue":
      default:
        return "bg-blue-600 text-white";
    }
  };

  // 3-Month Installment Split
  const getInstallmentAmount = () => {
    const activePrice = discountPrice || price;
    const installmentAmt = Math.round(activePrice / 3);
    if (currency === "LKR") {
      return `Rs.${installmentAmt.toLocaleString("en-US")}`;
    }
    return `$${(activePrice / 3).toFixed(2)}`;
  };

  const getHoverShadowClass = () => {
    return "hover:shadow-[0_4px_12px_rgba(0,0,0,0.03)] dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:border-neutral-300 dark:hover:border-neutral-700";
  };

  return (
    <Link
      href={`/products/${slug}`}
      className={`group flex flex-col w-full min-w-0 select-none cursor-pointer relative p-4 rounded-xl border border-neutral-200/50 dark:border-neutral-800/50 bg-white dark:bg-neutral-900/20 transition-all duration-300 z-10 ${getHoverShadowClass()}`}
    >
      {/* Top Details Block */}
      <div className="flex flex-col items-start mb-3">
        {/* Brand / Category Subtitle */}
        {subTitleText && (
          <span className="text-[10px] font-medium text-neutral-450 dark:text-neutral-500 mb-0.5 leading-none">
            {subTitleText}
          </span>
        )}

        {/* Product Title */}
        <h4 className="text-xs sm:text-[13px] font-bold text-blue-650 dark:text-blue-400 line-clamp-2 leading-snug min-h-[36px] group-hover:text-blue-800 dark:group-hover:text-blue-300 transition-colors duration-300">
          {name}
        </h4>

        {/* Badge tag below Title */}
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md mt-1.5 w-fit ${getBadgeColorClass()}`}>
          {getBadgeText()}
        </span>
      </div>

      {/* Image Stage Container with seamless background */}
      <div className="relative aspect-[4/3] w-full overflow-hidden flex items-center justify-center mb-3 bg-neutral-50/40 dark:bg-neutral-950/40 rounded-md border border-neutral-100 dark:border-neutral-900/30">
        {/* Discount Badge overlaid bottom-left */}
        {hasDiscount && (
          <div className="absolute bottom-2 left-2 bg-emerald-600 dark:bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10">
            -{Math.round(((price - discountPrice) / price) * 100)}%
          </div>
        )}

        {/* Primary Image */}
        <Image
          src={images[0]}
          alt={name}
          fill
          className={`object-contain p-1.5 transition-all duration-300 ease-out group-hover:scale-105 ${
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
            className="object-contain p-1.5 absolute inset-0 opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300 ease-out"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            priority={false}
          />
        )}

        {/* Sold out overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-neutral-950/70 backdrop-blur-[2px] z-25 rounded-md">
            <span className="rounded-lg bg-white/90 dark:bg-neutral-900/90 border border-neutral-200 dark:border-neutral-800 px-3.5 py-1.5 text-[9px] font-black text-neutral-850 dark:text-neutral-200 uppercase tracking-widest shadow-sm">
              Sold Out
            </span>
          </div>
        )}
      </div>

      {/* Pricing & CTA Block */}
      <div className="flex flex-col w-full">
        {/* Price & Star Rating Row */}
        <div className="pt-2.5 border-t border-neutral-100 dark:border-neutral-850/50 flex items-end justify-between">
          {/* Price Container */}
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-450 dark:text-neutral-500 font-medium leading-none mb-1">
              Starting
            </span>
            <div className="flex items-baseline gap-1">
              {hasDiscount && (
                <span className="text-[9px] text-neutral-400 line-through leading-none mr-1 font-medium">
                  {formatPriceVal(price)}
                </span>
              )}
              <span className="text-sm sm:text-base font-black text-red-500 dark:text-red-400 leading-none">
                {formatPriceVal(discountPrice || price)}
              </span>
            </div>
          </div>

          {/* Star Rating on the right */}
          <div className="flex items-center gap-1 mb-0.5">
            <div className="flex items-center text-amber-400">
              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            </div>
            <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 leading-none">
              {rating ? rating.toFixed(1) : "5.0"}
            </span>
          </div>
        </div>

        {/* Quick-add Full-Width Buy Now Button */}
        <div className="mt-3 w-full">
          {isOutOfStock ? (
            <span className="w-full h-9 rounded-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800/40 text-neutral-400 dark:text-neutral-600 border border-neutral-200/50 dark:border-neutral-800/50 text-[10px] font-bold uppercase tracking-wider">
              Out of Stock
            </span>
          ) : (
            <motion.button
              onClick={handleQuickAdd}
              className={`w-full h-9 rounded-full flex items-center justify-center gap-1.5 border transition-all duration-200 focus:outline-none cursor-pointer ${
                isAdding
                  ? "bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-500 dark:border-emerald-500"
                  : "bg-neutral-950 border-neutral-950 text-white dark:bg-neutral-50 dark:border-neutral-50 dark:text-neutral-950 hover:bg-neutral-850 dark:hover:bg-neutral-200"
              }`}
              whileTap={{ scale: 0.98 }}
              aria-label="Buy Now"
            >
              <AnimatePresence mode="wait">
                {isAdding ? (
                  <motion.div
                    key="added"
                    className="flex items-center justify-center gap-1.5"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Added</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="buy"
                    className="flex items-center justify-center gap-1.5"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">Buy Now</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          )}
        </div>

        {/* Installment Plan widget */}
        <div className="w-full bg-neutral-50 dark:bg-neutral-900/30 rounded-lg py-1.5 px-2 mt-2.5 text-center border border-neutral-100/50 dark:border-neutral-850/50 flex items-center justify-center gap-1 flex-wrap">
          <span className="text-[9px] font-medium text-neutral-500 dark:text-neutral-400">
            or 3 X {getInstallmentAmount()} with
          </span>
          <span className="text-[9px] font-black italic tracking-tight text-indigo-600 dark:text-indigo-400 select-none">
            KOKO
          </span>
          <span className="text-[9px] font-medium text-neutral-400 dark:text-neutral-500">
            or
          </span>
          <span className="text-[9px] font-black italic tracking-tight text-sky-500 dark:text-sky-400 select-none">
            mintpay
          </span>
        </div>
      </div>
    </Link>
  );
}
