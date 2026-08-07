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

  const tax = 0;
  const shipping = subtotal >= 50000 || subtotal === 0 ? 0 : 0;
  const total = Math.round(subtotal);

  return {
    cartCount,
    subtotal: Math.round(subtotal),
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
          if (
            !Number.isFinite(quantity) ||
            !Number.isInteger(quantity) ||
            product.countInStock <= 0 ||
            quantity <= 0
          ) {
            return state;
          }

          const targetId = product.id;
          const existingIndex = state.items.findIndex(
            (item) => item.id === targetId || item.product?.id === targetId
          );

          let newItems = [...state.items];

          if (existingIndex > -1) {
            const currentItem = newItems[existingIndex];
            const newQuantity = currentItem.quantity + quantity;
            const finalQty = Math.min(newQuantity, product.countInStock);

            if (finalQty <= 0) {
              newItems.splice(existingIndex, 1);
            } else {
              newItems[existingIndex] = {
                ...currentItem,
                id: targetId,
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
                quantity: finalQty,
              };
            }

            // Remove any stray duplicate entries of the same product
            newItems = newItems.filter(
              (item, index) =>
                index === existingIndex ||
                (item.id !== targetId && item.product?.id !== targetId)
            );
          } else {
            const finalQty = Math.min(quantity, product.countInStock);
            if (finalQty > 0) {
              newItems.push({
                id: targetId,
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
                quantity: finalQty,
              });
            }
          }

          // Filter out any 0-quantity items
          newItems = newItems.filter((item) => item.quantity > 0);

          const totals = calculateTotals(newItems);
          return { items: newItems, ...totals };
        }),

      removeItem: (productId: string) =>
        set((state) => {
          const newItems = state.items.filter(
            (item) => item.id !== productId && item.product?.id !== productId
          );
          const totals = calculateTotals(newItems);
          return { items: newItems, ...totals };
        }),

      updateQuantity: (productId: string, quantity: number) =>
        set((state) => {
          if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
            return state;
          }

          let newItems = state.items
            .map((item) => {
              if (item.id === productId || item.product?.id === productId) {
                const finalQty = Math.min(quantity, item.product.countInStock);
                return { ...item, quantity: finalQty };
              }
              return item;
            })
            .filter((item) => item.quantity > 0);

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
      name: 'ftc-cart-storage',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return { items: [], cartCount: 0, subtotal: 0, tax: 0, shipping: 0, total: 0 };
        }
        const stateObj = persistedState as Record<string, unknown>;
        if (version === 0 || !version) {
          if (Array.isArray(stateObj.items)) {
            stateObj.items = stateObj.items
              .filter((item: unknown): item is Record<string, any> =>
                Boolean(item && typeof item === 'object' && (item as Record<string, any>).product)
              )
              .map((item: Record<string, any>) => ({
                ...item,
                id: item.product?.id || item.id,
              }));
          } else {
            stateObj.items = [];
          }
        }
        return stateObj;
      },
    }
  )
);
