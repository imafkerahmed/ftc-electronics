import { useEffect, useState } from 'react';
import { useCartStore } from '@/store/use-cart-store';

export function useCart() {
  const [isHydrated, setIsHydrated] = useState(false);

  // Hook state selection
  const items = useCartStore((state) => state.items);
  const cartCount = useCartStore((state) => state.cartCount);
  const subtotal = useCartStore((state) => state.subtotal);
  const tax = useCartStore((state) => state.tax);
  const shipping = useCartStore((state) => state.shipping);
  const total = useCartStore((state) => state.total);

  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);

  // Sync state hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return {
    items: isHydrated ? items : [],
    cartCount: isHydrated ? cartCount : 0,
    subtotal: isHydrated ? subtotal : 0,
    tax: isHydrated ? tax : 0,
    shipping: isHydrated ? shipping : 0,
    total: isHydrated ? total : 0,
    isHydrated,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };
}
