import { useCartStore } from '@/store/use-cart-store';

/**
 * Clears all client-side sessions across Admin, Store, and POS.
 * Wipes sessionStorage, localStorage (carts, POS drafts, auth tokens), and resets Zustand cart state.
 */
export function clearAllClientSessions() {
  if (typeof window === 'undefined') return;

  // 1. Wipe sessionStorage completely
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }

  // 2. Wipe Zustand cart store state
  try {
    useCartStore.getState().clearCart();
  } catch {
    /* ignore */
  }

  // 3. Clear localStorage items for Admin, Store, and POS
  try {
    const keysToRemove = [
      'ftc-cart-storage',
      'ftc_pos_cart_v1',
      'pos_employee_session_v1',
      'ftc_last_order',
      'ftc_checkout_shipping',
      'ftc_nav_data',
      'pb_auth',
    ];

    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Scan for any remaining ftc, pos, or pb keys
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith('ftc') ||
          key.startsWith('pos_') ||
          key.startsWith('ftc_pos') ||
          key.startsWith('pb_') ||
          key.startsWith('pocketbase'))
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}
