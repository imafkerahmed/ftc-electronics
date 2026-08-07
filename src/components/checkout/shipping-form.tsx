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
    let isMounted = true;

    async function loadUserOrSession() {
      // 1. Check if user already typed in shipping form during this checkout session
      try {
        const stored = sessionStorage.getItem('ftc_checkout_shipping');
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<ShippingAddress>;
          if (isMounted) {
            setFormData((prev) => ({ ...prev, ...parsed }));
          }
          return;
        }
      } catch { /* ignore */ }

      // 2. Fetch logged-in user profile from session if available
      try {
        const res = await getCurrentUserSessionAction();
        if (!isMounted) return;

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
    return () => {
      isMounted = false;
    };
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

      {/* Name Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="shipping-firstname" className="text-xs font-semibold text-muted-foreground">First Name *</label>
          <Input
            id="shipping-firstname"
            name="firstName"
            required
            value={formData.firstName || ''}
            onChange={handleChange}
            placeholder="John"
            className="h-10 bg-background border-border text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="shipping-lastname" className="text-xs font-semibold text-muted-foreground">Last Name *</label>
          <Input
            id="shipping-lastname"
            name="lastName"
            required
            value={formData.lastName || ''}
            onChange={handleChange}
            placeholder="Doe"
            className="h-10 bg-background border-border text-xs"
          />
        </div>
      </div>

      {/* Contact Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="shipping-email" className="text-xs font-semibold text-muted-foreground">Email Address *</label>
          <Input
            id="shipping-email"
            name="email"
            type="email"
            required
            value={formData.email || ''}
            onChange={handleChange}
            placeholder="john@example.com"
            className="h-10 bg-background border-border text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="shipping-phone" className="text-xs font-semibold text-muted-foreground">Phone Number *</label>
          <Input
            id="shipping-phone"
            name="phone"
            type="tel"
            required
            value={formData.phone || ''}
            onChange={handleChange}
            placeholder="+94 77 123 4567"
            className="h-10 bg-background border-border text-xs"
          />
        </div>
      </div>

      {/* Address Line 1 */}
      <div className="space-y-1.5">
        <label htmlFor="shipping-address1" className="text-xs font-semibold text-muted-foreground">Street Address *</label>
        <Input
          id="shipping-address1"
          name="addressLine1"
          required
          value={formData.addressLine1 || ''}
          onChange={handleChange}
          placeholder="123 Tech Street, Suite A"
          className="h-10 bg-background border-border text-xs"
        />
      </div>

      {/* Address Line 2 */}
      <div className="space-y-1.5">
        <label htmlFor="shipping-address2" className="text-xs font-semibold text-muted-foreground">Apartment, suite, unit, etc. (optional)</label>
        <Input
          id="shipping-address2"
          name="addressLine2"
          value={formData.addressLine2 || ''}
          onChange={handleChange}
          placeholder="Floor 2, Apt 4B"
          className="h-10 bg-background border-border text-xs"
        />
      </div>

      {/* City, State, Postal Code */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="shipping-city" className="text-xs font-semibold text-muted-foreground">City *</label>
          <Input
            id="shipping-city"
            name="city"
            required
            value={formData.city || ''}
            onChange={handleChange}
            placeholder="Colombo"
            className="h-10 bg-background border-border text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="shipping-state" className="text-xs font-semibold text-muted-foreground">District / Province *</label>
          <Input
            id="shipping-state"
            name="state"
            required
            value={formData.state || ''}
            onChange={handleChange}
            placeholder="Western Province"
            className="h-10 bg-background border-border text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="shipping-postalcode" className="text-xs font-semibold text-muted-foreground">Postal Code *</label>
          <Input
            id="shipping-postalcode"
            name="postalCode"
            required
            value={formData.postalCode || ''}
            onChange={handleChange}
            placeholder="00300"
            className="h-10 bg-background border-border text-xs"
          />
        </div>
      </div>

      {/* Country */}
      <div className="space-y-1.5">
        <label htmlFor="shipping-country" className="text-xs font-semibold text-muted-foreground">Country</label>
        <Input
          id="shipping-country"
          name="country"
          readOnly
          value={formData.country || 'Sri Lanka'}
          className="h-10 bg-muted border-border text-xs text-muted-foreground cursor-not-allowed"
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider cursor-pointer rounded-xl transition-colors"
        >
          Continue to Payment
        </Button>
      </div>
    </form>
  );
}
