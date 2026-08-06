export interface ShippingAddress {
  firstName: string;
  lastName: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface PaymentDetails {
  method: 'stripe' | 'paypal' | 'payhere' | 'bank_transfer' | 'cash_pickup' | 'cash_delivery' | 'cod';
  paymentId?: string;
  status: 'pending' | 'paid' | 'failed';
  paymentSlipUrl?: string; // Bank transfer slip uploaded by customer
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  quantity: number;
  image: string;
}

export interface Order {
  id: string;
  userId?: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  paymentDetails: PaymentDetails;
  subtotal: number;
  shippingPrice: number;
  taxPrice: number;
  totalPrice: number;
  status: 'pending_payment' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  isPaid: boolean;
  paidAt?: string;
  isDelivered: boolean;
  deliveredAt?: string;
  createdAt: string;
}
