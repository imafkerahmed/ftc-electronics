'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Plus, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product } from '@/types/product';
import { useCart } from '@/hooks/use-cart';
import { useUiStore } from '@/store/use-ui-store';

interface CollectionProductCardProps {
  product: Product;
}

export default function CollectionProductCard({ product }: CollectionProductCardProps) {
  const { 
    name, 
    slug, 
    price, 
    discountPrice, 
    images, 
    rating, 
    numReviews, 
    isPreOrder, 
    currency, 
    countInStock,
    specs 
  } = product;

  const { addItem } = useCart();
  const setCartDrawerOpen = useUiStore((state) => state.setCartDrawerOpen);
  
  const [isAdding, setIsAdding] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const hasDiscount = discountPrice !== undefined;
  const isOutOfStock = countInStock === 0;
  const isLowStock = countInStock > 0 && countInStock <= 5;
  const hasMultipleImages = images.length > 1;

  // Format price helper
  const formatPriceVal = (value: number) => {
    if (currency === 'LKR') {
      return `Rs.${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    
    // Automatically trigger cart drawer slide-in
    setCartDrawerOpen(true);

    setTimeout(() => {
      setIsAdding(false);
    }, 1200);
  };

  // Extract first 2 specs for monospace tags
  const displaySpecs = Object.values(specs || {})
    .slice(0, 2);

  return (
    <Link 
      href={`/products/${slug}`} 
      className="group flex flex-col w-full min-w-0 select-none cursor-pointer relative"
    >
      {/* Image Container with light gray bg */}
      <div className="relative aspect-square w-full overflow-hidden rounded-sm bg-[#f5f5f5] dark:bg-neutral-900/40">
        
        {/* Primary Image */}
        <Image
          src={images[0]}
          alt={name}
          fill
          className={`object-cover object-center transition-all duration-500 group-hover:scale-105 ${
            hasMultipleImages ? 'opacity-100 group-hover:opacity-0' : 'opacity-100'
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
            className="object-cover object-center absolute inset-0 opacity-0 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            priority={false}
          />
        )}
        
        {/* Absolute Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          {hasDiscount && (
            <span className="rounded-[2px] bg-[#ff0000] px-2 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-wider shadow-sm">
              Sale!
            </span>
          )}
          {isPreOrder && (
            <span className="rounded-[2px] bg-[#008000] px-2 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-wider shadow-sm">
              Pre-Order
            </span>
          )}
        </div>

        {/* Sold out overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[2px] z-10">
            <span className="rounded-[2px] bg-background border border-border px-2.5 py-0.5 text-[9px] font-bold text-foreground uppercase tracking-widest">
              Sold Out
            </span>
          </div>
        )}

        {/* Hover Quick-Add Action Button */}
        {!isOutOfStock && (
          <div className="absolute bottom-2.5 right-2.5 z-20">
            <motion.button
              onMouseEnter={() => setIsButtonHovered(true)}
              onMouseLeave={() => setIsButtonHovered(false)}
              onClick={handleQuickAdd}
              disabled={isOutOfStock}
              className={`h-8 rounded-full border shadow-md flex items-center justify-center transition-colors focus:outline-none cursor-pointer overflow-hidden opacity-100 sm:opacity-0 translate-y-0 sm:translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 duration-300 ${
                isAdding 
                  ? 'bg-blue-600 border-blue-600 text-white' 
                  : 'bg-white hover:bg-blue-600 text-neutral-800 hover:text-white border-neutral-200/80 hover:border-blue-600'
              }`}
              animate={{ 
                width: isAdding ? 96 : isButtonHovered ? 116 : 32,
              }}
              transition={{ type: "spring", stiffness: 350, damping: 24 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Add item directly to cart"
            >
              <div className="flex items-center justify-center w-full h-full px-2">
                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <AnimatePresence mode="wait">
                    {isAdding ? (
                      <motion.div
                        key="check"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-center shrink-0"
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="plus"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center justify-center shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5 stroke-[3]" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {(isButtonHovered || isAdding) && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-[9px] font-black uppercase tracking-wider select-none leading-none"
                      >
                        {isAdding ? 'Added' : 'Add to Cart'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.button>
          </div>
        )}
      </div>

      {/* Product Information Details */}
      <div className="mt-3 flex flex-col">
        {/* Product Title */}
        <h4 className="text-xs sm:text-[13px] md:text-sm font-normal text-neutral-800 dark:text-neutral-200 line-clamp-2 leading-relaxed min-h-[36px] group-hover:text-blue-600 transition-colors">
          {name}
        </h4>

        {/* Monospace Tech Spec Tags */}
        {displaySpecs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {displaySpecs.map((spec, index) => (
              <span 
                key={index} 
                className="font-mono text-[9px] font-medium bg-neutral-100 dark:bg-neutral-800/80 text-neutral-500 dark:text-neutral-450 px-1.5 py-0.5 rounded-[2px] max-w-[120px] truncate"
              >
                {spec}
              </span>
            ))}
          </div>
        )}

        {/* Pricing Info */}
        <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
          {hasDiscount ? (
            <>
              <span className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                {formatPriceVal(discountPrice)}
              </span>
              <span className="text-[10px] sm:text-xs text-neutral-450 line-through">
                {formatPriceVal(price)}
              </span>
            </>
          ) : (
            <span className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
              {formatPriceVal(price)}
            </span>
          )}
        </div>

        {/* Star Rating & Reviews */}
        {numReviews > 0 && (
          <div className="mt-1 flex items-center gap-1.5">
            <div className="flex text-amber-500">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Star
                  key={idx}
                  className={`h-3 w-3 ${
                    idx < Math.floor(rating) ? 'fill-current' : 'text-neutral-200 dark:text-neutral-700'
                  }`}
                />
              ))}
            </div>
            <span className="text-[10px] text-neutral-500 font-medium">({numReviews})</span>
          </div>
        )}

        {/* Low Stock Urgency warning */}
        {isLowStock && (
          <span className="mt-1.5 text-[9px] sm:text-[10px] font-bold text-red-600 dark:text-red-500 uppercase tracking-wider animate-pulse">
            Only {countInStock} left in stock!
          </span>
        )}
      </div>
    </Link>
  );
}
