'use client';

import React, { useEffect, useState } from 'react';
import { Product } from '@/types/product';
import ProductCard from '@/components/product/product-card';
import { History } from 'lucide-react';

interface RecentlyViewedProps {
  currentProduct?: Product;
}

const RECENTLY_VIEWED_KEY = 'ftc_recently_viewed';

export default function RecentlyViewed({ currentProduct }: RecentlyViewedProps) {
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);

  const productId = currentProduct?.id;

  useEffect(() => {
    try {
      // 1. Load existing items from localStorage
      const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
      let items: Product[] = stored ? JSON.parse(stored) : [];

      // 2. Add current product if present
      if (currentProduct) {
        items = items.filter((p) => p.id !== currentProduct.id);
        items.unshift(currentProduct);
        // Keep last 8 items
        items = items.slice(0, 8);
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(items));
      }

      // Filter out current product from display list
      const filtered = productId
        ? items.filter((p) => p.id !== productId).slice(0, 4)
        : items.slice(0, 4);

      React.startTransition(() => {
        setRecentProducts(filtered);
      });
    } catch (e) {
      console.error('Failed to update recently viewed items', e);
    }
  }, [currentProduct, productId]);

  if (recentProducts.length === 0) return null;

  return (
    <div className="border-t border-border mt-16 pt-12">
      <div className="flex items-center gap-2 mb-6">
        <History className="h-5 w-5 text-blue-500" />
        <h3 className="text-xl font-black tracking-tight text-foreground">
          Recently Viewed
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        {recentProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
