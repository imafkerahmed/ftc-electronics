'use client';

import { formatPrice } from '@/lib/utils';
import Image from 'next/image';
import { Trash2, Plus, Minus } from 'lucide-react';
import { CartItem } from '@/types/cart';
import { useCart } from '@/hooks/use-cart';
import { Button } from '@/components/ui/button';

interface CartItemRowProps {
  item: CartItem;
}

export default function CartItemRow({ item }: CartItemRowProps) {
  const { updateQuantity, removeItem } = useCart();
  const { id, product, quantity } = item;

  const displayPrice = product.discountPrice ?? product.price;

  const handleIncrement = () => {
    updateQuantity(id, quantity + 1);
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      updateQuantity(id, quantity - 1);
    }
  };

  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-b-0">
      
      {/* Product Image */}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted relative">
        <Image
          src={product.images[0]}
          alt={product.name}
          fill
          className="object-cover object-center"
          sizes="64px"
        />
      </div>

      {/* Title / Description info */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{product.brand}</p>
        <h4 className="text-sm font-semibold text-foreground truncate mt-0.5">{product.name}</h4>
        
        {/* Quantity controller buttons */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center border border-border rounded bg-background">
            <button
              onClick={handleDecrement}
              disabled={quantity <= 1}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="px-2 text-xs font-semibold text-foreground min-w-[20px] text-center">
              {quantity}
            </span>
            <button
              onClick={handleIncrement}
              disabled={quantity >= product.countInStock}
              className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          
          <span className="text-xs text-muted-foreground font-light">
            In Stock: {product.countInStock}
          </span>
        </div>
      </div>

      {/* Pricing / Delete */}
      <div className="flex flex-col items-end gap-1.5 justify-between self-stretch">
        <span className="text-sm font-bold text-foreground">
          {formatPrice(displayPrice * quantity)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => removeItem(id)}
          className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-muted"
          aria-label="Remove item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

    </div>
  );
}
