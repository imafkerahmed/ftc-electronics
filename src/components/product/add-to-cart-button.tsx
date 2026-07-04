'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart } from 'lucide-react';
import { Product } from '@/types/product';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';

interface AddToCartButtonProps {
  product: Product;
}

export default function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);

  const isOutOfStock = product.countInStock === 0;

  const handleAddToCart = () => {
    addItem(product, quantity);
  };

  const handleBuyNow = () => {
    addItem(product, quantity);
    router.push('/checkout/shipping');
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Quantity Selector */}
      {!isOutOfStock && (
        <div className="flex items-center space-x-3">
          <span className="text-sm text-muted-foreground">Quantity:</span>
          <div className="flex items-center border border-border/80 rounded bg-muted/40">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
            >
              -
            </button>
            <span className="px-4 text-sm font-semibold text-foreground min-w-[30px] text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => Math.min(product.countInStock, q + 1))}
              disabled={quantity >= product.countInStock}
              className="px-3 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-row gap-2 sm:gap-3 w-full">
        {isOutOfStock ? (
          <Button
            disabled={true}
            className="w-full py-5 sm:py-6 text-xs sm:text-sm bg-neutral-850 text-neutral-500 font-bold rounded-lg flex items-center justify-center gap-2"
          >
            Sold Out
          </Button>
        ) : (
          <>
            <Button
              onClick={handleAddToCart}
              variant="outline"
              className="flex-1 py-5 sm:py-6 px-2 sm:px-4 border border-border/85 hover:border-foreground text-foreground text-xs sm:text-sm font-bold cursor-pointer rounded-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-colors active:scale-98"
            >
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
              Add to Cart
            </Button>
            <Button
              onClick={handleBuyNow}
              className="flex-1 py-5 sm:py-6 px-2 sm:px-4 bg-[#2056d4] hover:bg-[#1a4bb8] text-white text-xs sm:text-sm font-bold cursor-pointer rounded-lg flex items-center justify-center gap-1.5 sm:gap-2 transition-colors active:scale-98"
            >
              Buy Now
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
