import ShippingForm from '@/components/checkout/shipping-form';
import OrderSummary from '@/components/cart/order-summary';

export default function ShippingCheckoutPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      {/* Address Form (Left Side) */}
      <div className="lg:col-span-2">
        <ShippingForm />
      </div>

      {/* Cart Summary List (Right Side) */}
      <div className="space-y-4">
        <OrderSummary showItems={true} />
      </div>
    </div>
  );
}
