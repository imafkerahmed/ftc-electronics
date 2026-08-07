'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { ShoppingBag, Check } from 'lucide-react';
import { Product } from '@/types/product';
import { formatPrice } from '@/lib/utils';
import { useCart } from '@/hooks/use-cart';

import { useUiStore } from '@/store/use-ui-store';

interface StickyBuyBarProps {
  product: Product;
}

export default function StickyBuyBar({ product }: StickyBuyBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [addedAnimation, setAddedAnimation] = useState(false);
  const { addItem } = useCart();
  const setStickyBuyBarVisible = useUiStore((state) => state.setStickyBuyBarVisible);

  useEffect(() => {
    const handleScroll = () => {
      const visible = window.scrollY > 450;
      setIsVisible(visible);
      setStickyBuyBarVisible(visible);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      setStickyBuyBarVisible(false);
    };
  }, [setStickyBuyBarVisible]);

  if (!isVisible) return null;

  const activePrice = product.discountPrice || product.price;
  const currency = product.currency || 'LKR';
  const isOutOfStock = product.countInStock === 0;

  const handleAddToCart = () => {
    addItem(product);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1500);
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border p-3 sm:p-4 shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between gap-4">
        {/* Left: Thumbnail & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-900 border border-border">
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-foreground truncate max-w-[180px] sm:max-w-sm">
              {product.name}
            </h4>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">
              {product.brand} • {product.category}
            </span>
          </div>
        </div>

        {/* Right: Price & Add to Cart */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-base font-black text-foreground">
              {formatPrice(activePrice, currency)}
            </span>
            <span className="text-[10px] text-emerald-500 font-bold">In Stock</span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={`h-10 px-5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              addedAnimation
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20'
            }`}
          >
            {addedAnimation ? (
              <>
                <Check className="h-4 w-4" />
                <span>Added!</span>
              </>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4" />
                <span>Add to Cart</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
