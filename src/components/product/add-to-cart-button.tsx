'use client';

import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Product } from '@/types/product';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';

interface AddToCartButtonProps {
  product: Product;
}

export default function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);

  const isOutOfStock = product.countInStock === 0;

  const handleAddToCart = () => {
    addItem(product, quantity);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Quantity Selector */}
      {!isOutOfStock && (
        <div className="flex items-center space-x-3">
          <span className="text-sm text-neutral-400">Quantity:</span>
          <div className="flex items-center border border-neutral-800 rounded bg-neutral-900">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="px-3 py-1.5 text-neutral-450 hover:text-white disabled:opacity-20"
            >
              -
            </button>
            <span className="px-4 text-sm font-semibold text-neutral-205 min-w-[30px] text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => Math.min(product.countInStock, q + 1))}
              disabled={quantity >= product.countInStock}
              className="px-3 py-1.5 text-neutral-450 hover:text-white disabled:opacity-20"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleAddToCart}
          disabled={isOutOfStock}
          className="flex-1 sm:flex-none sm:px-8 py-6 bg-blue-650 hover:bg-blue-600 text-white font-bold cursor-pointer rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <ShoppingCart className="h-5 w-5" />
          {isOutOfStock ? 'Sold Out' : 'Add to Cart'}
        </Button>
      </div>
    </div>
  );
}
