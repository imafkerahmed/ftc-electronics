'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentUserSessionAction, updateUserProfilePageAction, type CustomerProfileData } from '@/app/actions/auth';
import { CheckCircle2, AlertCircle, Loader2, MapPin } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadUser() {
      setLoading(true);
      try {
        const res = await getCurrentUserSessionAction();
        if (!isMounted) return;
        if (res.success && res.user) {
          setProfile(res.user);
        } else {
          router.push('/');
        }
      } catch {
        if (isMounted) router.push('/');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void loadUser();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSuccess(null);
    setError(null);

    try {
      const res = await updateUserProfilePageAction({
        firstName: profile.firstName,
        lastName: profile.lastName,
        name: profile.name,
        phone: profile.phone,
        addressLine1: profile.addressLine1,
        addressLine2: profile.addressLine2,
        city: profile.city,
        state: profile.state,
        postalCode: profile.postalCode,
        country: profile.country || 'Sri Lanka',
      });

      if (res.success) {
        setSuccess('Profile and default shipping address saved successfully.');
        window.dispatchEvent(new Event('auth-change'));
      } else {
        setError(res.error || 'Failed to update profile.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="text-xs">Loading account profile...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-600 rounded-lg text-xs">
        {error || 'Unable to access profile session. Please sign in again.'}
      </div>
    );
  }

  const initials = profile.name
    ? profile.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
    : 'CU';

  const memberSince = profile.created
    ? new Date(profile.created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Member';

  return (
    <div className="space-y-6 text-foreground">
      <div>
        <h2 className="text-lg sm:text-xl font-bold tracking-wide">My Profile & Shipping Address</h2>
        <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
          Save your personal details and default shipping address so your checkout is automatically pre-filled every time.
        </p>
      </div>

      {success && (
        <div role="status" className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl bg-card p-4 sm:p-6 rounded-xl border border-border">
        {/* Account Header */}
        <div className="flex items-center gap-3 sm:gap-4 bg-secondary/40 p-3.5 sm:p-4 rounded-xl border border-border">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm sm:text-lg font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs sm:text-sm font-semibold truncate">{profile.name}</h4>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">Customer since {memberSince}</p>
          </div>
        </div>

        {/* Personal Details */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Personal Information</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label htmlFor="firstName" className="block text-xs text-muted-foreground mb-1.5">First Name</label>
              <Input
                id="firstName"
                value={profile.firstName || ''}
                onChange={(e) => setProfile((p) => (p ? { ...p, firstName: e.target.value } : null))}
                className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-xs text-muted-foreground mb-1.5">Last Name</label>
              <Input
                id="lastName"
                value={profile.lastName || ''}
                onChange={(e) => setProfile((p) => (p ? { ...p, lastName: e.target.value } : null))}
                className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label htmlFor="profile-email" className="block text-xs text-muted-foreground mb-1.5">Email Address</label>
              <Input
                id="profile-email"
                type="email"
                readOnly
                value={profile.email}
                className="h-10 bg-muted/60 border-border text-muted-foreground text-sm cursor-not-allowed"
              />
            </div>
            <div>
              <label htmlFor="profile-phone" className="block text-xs text-muted-foreground mb-1.5">Phone Number</label>
              <Input
                id="profile-phone"
                type="tel"
                placeholder="+94 77 123 4567"
                value={profile.phone || ''}
                onChange={(e) => setProfile((p) => (p ? { ...p, phone: e.target.value } : null))}
                className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Shipping Address Section */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Default Shipping Address</h4>
          </div>

          <div>
            <label htmlFor="addressLine1" className="block text-xs text-muted-foreground mb-1.5">Address Line 1</label>
            <Input
              id="addressLine1"
              placeholder="No. 123 Main Street"
              value={profile.addressLine1 || ''}
              onChange={(e) => setProfile((p) => (p ? { ...p, addressLine1: e.target.value } : null))}
              className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="addressLine2" className="block text-xs text-muted-foreground mb-1.5">Address Line 2 (Optional)</label>
            <Input
              id="addressLine2"
              placeholder="Apartment, suite, unit, etc."
              value={profile.addressLine2 || ''}
              onChange={(e) => setProfile((p) => (p ? { ...p, addressLine2: e.target.value } : null))}
              className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div>
              <label htmlFor="city" className="block text-xs text-muted-foreground mb-1.5">City</label>
              <Input
                id="city"
                placeholder="Colombo"
                value={profile.city || ''}
                onChange={(e) => setProfile((p) => (p ? { ...p, city: e.target.value } : null))}
                className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-xs text-muted-foreground mb-1.5">State / Province</label>
              <Input
                id="state"
                placeholder="Western Province"
                value={profile.state || ''}
                onChange={(e) => setProfile((p) => (p ? { ...p, state: e.target.value } : null))}
                className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="postalCode" className="block text-xs text-muted-foreground mb-1.5">Postal Code</label>
              <Input
                id="postalCode"
                placeholder="00300"
                value={profile.postalCode || ''}
                onChange={(e) => setProfile((p) => (p ? { ...p, postalCode: e.target.value } : null))}
                className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="country" className="block text-xs text-muted-foreground mb-1.5">Country</label>
            <Input
              id="country"
              value={profile.country || 'Sri Lanka'}
              onChange={(e) => setProfile((p) => (p ? { ...p, country: e.target.value } : null))}
              className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="w-full h-11 sm:h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer transition-colors rounded-xl text-xs sm:text-sm shadow-md"
        >
          {saving ? 'Saving Profile Details...' : 'Save Profile & Default Shipping Address'}
        </Button>
      </form>
    </div>
  );
}
