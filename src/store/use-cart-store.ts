import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Product } from '@/types/product';
import { CartItem, CartStoreState, CartState } from '@/types/cart';

// Helper to compute totals
const calculateTotals = (items: CartItem[]): Omit<CartState, 'items'> => {
  const subtotal = items.reduce((sum, item) => {
    const activePrice = item.product.discountPrice ?? item.product.price;
    return sum + activePrice * item.quantity;
  }, 0);

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // 8% tax rate
  const tax = Math.round(subtotal * 0.08 * 100) / 100;

  // Free shipping over $500, else $15
  const shipping = subtotal > 500 || subtotal === 0 ? 0 : 15;
  const total = Math.round((subtotal + tax + shipping) * 100) / 100;

  return {
    cartCount,
    subtotal: Math.round(subtotal * 100) / 100,
    tax,
    shipping,
    total,
  };
};

export const useCartStore = create<CartStoreState>()(
  persist(
    (set) => ({
      items: [],
      cartCount: 0,
      subtotal: 0,
      tax: 0,
      shipping: 0,
      total: 0,

      addItem: (product: Product, quantity = 1) =>
        set((state) => {
          const existingItemIndex = state.items.findIndex(
            (item) => item.id === product.id
          );

          const newItems = [...state.items];

          if (existingItemIndex > -1) {
            const currentItem = state.items[existingItemIndex];
            const newQuantity = currentItem.quantity + quantity;

            // Cap at stock quantity if available
            const finalQty = Math.min(newQuantity, product.countInStock);

            newItems[existingItemIndex] = {
              ...currentItem,
              quantity: finalQty,
            };
          } else {
            newItems.push({
              id: product.id,
              product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                discountPrice: product.discountPrice,
                images: product.images,
                brand: product.brand,
                countInStock: product.countInStock,
              },
              quantity: Math.min(quantity, product.countInStock),
            });
          }

          const totals = calculateTotals(newItems);
          return { items: newItems, ...totals };
        }),

      removeItem: (productId: string) =>
        set((state) => {
          const newItems = state.items.filter((item) => item.id !== productId);
          const totals = calculateTotals(newItems);
          return { items: newItems, ...totals };
        }),

      updateQuantity: (productId: string, quantity: number) =>
        set((state) => {
          const newItems = state.items.map((item) => {
            if (item.id === productId) {
              const finalQty = Math.min(
                Math.max(1, quantity),
                item.product.countInStock
              );
              return { ...item, quantity: finalQty };
            }
            return item;
          });

          const totals = calculateTotals(newItems);
          return { items: newItems, ...totals };
        }),

      clearCart: () =>
        set(() => ({
          items: [],
          cartCount: 0,
          subtotal: 0,
          tax: 0,
          shipping: 0,
          total: 0,
        })),
    }),
    {
      name: 'ftc-cart-storage', // key in local storage
    }
  )
);
