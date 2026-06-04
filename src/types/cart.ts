import { Product } from './product';

export interface CartItem {
  id: string; // usually product id
  product: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'discountPrice' | 'images' | 'brand' | 'countInStock'>;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
  cartCount: number;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}

export interface CartStoreState extends CartState {
  // Zustand specific actions
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}
