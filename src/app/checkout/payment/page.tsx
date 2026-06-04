import PaymentForm from '@/components/checkout/payment-form';
import OrderSummary from '@/components/cart/order-summary';

export default function PaymentCheckoutPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      {/* Card Form (Left Side) */}
      <div className="lg:col-span-2">
        <PaymentForm />
      </div>

      {/* Cart Summary List (Right Side) */}
      <div className="space-y-4">
        <OrderSummary showItems={true} />
      </div>
    </div>
  );
}
