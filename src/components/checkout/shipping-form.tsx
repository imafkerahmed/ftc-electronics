'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShippingAddress } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentUserSessionAction } from '@/app/actions/auth';
import { UserCheck } from 'lucide-react';

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
    country: 'Sri Lanka',
    phone: '',
  });

  const [loggedInUser, setLoggedInUser] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    async function loadUserOrSession() {
      // 1. Check if user already typed in shipping form during this checkout session
      try {
        const stored = sessionStorage.getItem('ftc_checkout_shipping');
        if (stored) {
          setFormData(JSON.parse(stored));
          return;
        }
      } catch { /* ignore */ }

      // 2. Fetch logged-in user profile from session if available
      try {
        const res = await getCurrentUserSessionAction();
        if (res.success && res.user) {
          const u = res.user;
          const nameParts = (u.name || '').trim().split(' ');
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          setFormData((prev) => ({
            ...prev,
            firstName: prev.firstName || u.firstName || firstName,
            lastName: prev.lastName || u.lastName || lastName,
            email: prev.email || u.email || '',
            phone: prev.phone || u.phone || '',
            addressLine1: prev.addressLine1 || u.addressLine1 || u.address || '',
            addressLine2: prev.addressLine2 || u.addressLine2 || '',
            city: prev.city || u.city || '',
            state: prev.state || u.state || '',
            postalCode: prev.postalCode || u.postalCode || '',
            country: prev.country || u.country || 'Sri Lanka',
          }));

          setLoggedInUser({
            name: u.name || firstName || 'Account User',
            email: u.email,
          });
        }
      } catch { /* ignore */ }
    }

    void loadUserOrSession();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Persist shipping data to sessionStorage so the payment form can access it
    try {
      sessionStorage.setItem('ftc_checkout_shipping', JSON.stringify(formData));
    } catch {
      // ignore if storage unavailable
    }
    router.push('/checkout/payment');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-foreground bg-card p-6 rounded-xl border border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold tracking-wide">Shipping Address</h3>
      </div>

      {/* Logged in user info alert */}
      {loggedInUser && (
        <div className="flex items-center gap-2.5 p-3.5 bg-blue-500/10 border border-blue-500/25 rounded-xl text-xs text-blue-400">
          <UserCheck className="h-4 w-4 shrink-0 text-blue-500" />
          <span>
            Logged in as <strong>{loggedInUser.name}</strong> ({loggedInUser.email}). Your profile details have been pre-filled.
          </span>
        </div>
      )}

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
