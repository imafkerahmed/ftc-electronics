'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShippingAddress } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ShippingForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<Partial<ShippingAddress>>({
    firstName: '',
    lastName: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'United States',
    phone: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Checkout] Submitting shipping details:', formData);
    
    // In production, save this address details to the DB or state store.
    // For our structure, we redirect directly to the payment page.
    router.push('/checkout/payment');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-foreground bg-card p-6 rounded-xl border border-border">
      <h3 className="text-base font-bold tracking-wide">Shipping Address</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-xs text-muted-foreground mb-2">First Name</label>
          <Input
            id="firstName"
            name="firstName"
            required
            value={formData.firstName}
            onChange={handleChange}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-xs text-muted-foreground mb-2">Last Name</label>
          <Input
            id="lastName"
            name="lastName"
            required
            value={formData.lastName}
            onChange={handleChange}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-xs text-muted-foreground mb-2">Email Address</label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          value={formData.email}
          onChange={handleChange}
          className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="addressLine1" className="block text-xs text-muted-foreground mb-2">Address Line 1</label>
        <Input
          id="addressLine1"
          name="addressLine1"
          required
          value={formData.addressLine1}
          onChange={handleChange}
          className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="addressLine2" className="block text-xs text-muted-foreground mb-2">Address Line 2 (Optional)</label>
        <Input
          id="addressLine2"
          name="addressLine2"
          value={formData.addressLine2}
          onChange={handleChange}
          className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="city" className="block text-xs text-muted-foreground mb-2">City</label>
          <Input
            id="city"
            name="city"
            required
            value={formData.city}
            onChange={handleChange}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="state" className="block text-xs text-muted-foreground mb-2">State / Prov</label>
          <Input
            id="state"
            name="state"
            required
            value={formData.state}
            onChange={handleChange}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="postalCode" className="block text-xs text-muted-foreground mb-2">Postal Code</label>
          <Input
            id="postalCode"
            name="postalCode"
            required
            value={formData.postalCode}
            onChange={handleChange}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className="block text-xs text-muted-foreground mb-2">Phone Number</label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            value={formData.phone}
            onChange={handleChange}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="country" className="block text-xs text-muted-foreground mb-2">Country</label>
          <Input
            id="country"
            name="country"
            required
            value={formData.country}
            onChange={handleChange}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer transition-colors"
      >
        Continue to Payment
      </Button>
    </form>
  );
}
