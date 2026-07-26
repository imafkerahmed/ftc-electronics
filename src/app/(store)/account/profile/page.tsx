'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentUserSessionAction, updateUserProfilePageAction, type CustomerProfileData } from '@/app/actions/auth';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      setLoading(true);
      const res = await getCurrentUserSessionAction();
      if (res.success && res.user) {
        setProfile(res.user);
      } else {
        router.push('/');
      }
      setLoading(false);
    }
    void loadUser();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSuccess(null);
    setError(null);

    const res = await updateUserProfilePageAction({
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
    });

    setSaving(false);
    if (res.success) {
      setSuccess('Profile details saved successfully.');
      // Instantly notify navbar to fetch/refresh the display name and avatar letter
      window.dispatchEvent(new Event('auth-change'));
    } else {
      setError(res.error || 'Failed to update profile.');
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
        <h2 className="text-xl font-bold tracking-wide">My Profile</h2>
        <p className="text-xs text-muted-foreground mt-1">Manage your customer details and default shipping options.</p>
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

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div className="flex items-center gap-4 bg-secondary/40 p-4 rounded-lg border border-border">
          <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold shrink-0">
            {initials}
          </div>
          <div>
            <h4 className="text-sm font-semibold">{profile.name}</h4>
            <p className="text-xs text-muted-foreground">Customer since {memberSince}</p>
          </div>
        </div>

        <div>
          <label htmlFor="profile-name" className="block text-xs text-muted-foreground mb-2">Full Name</label>
          <Input
            id="profile-name"
            value={profile.name}
            onChange={(e) => setProfile((p) => (p ? { ...p, name: e.target.value } : null))}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="profile-email" className="block text-xs text-muted-foreground mb-2">Email Address</label>
          <Input
            id="profile-email"
            type="email"
            readOnly
            disabled
            value={profile.email}
            className="h-10 bg-muted/60 border-border text-muted-foreground text-sm cursor-not-allowed"
          />
        </div>

        <div>
          <label htmlFor="profile-phone" className="block text-xs text-muted-foreground mb-2">Phone Number</label>
          <Input
            id="profile-phone"
            type="tel"
            placeholder="+94 77 123 4567"
            value={profile.phone || ''}
            onChange={(e) => setProfile((p) => (p ? { ...p, phone: e.target.value } : null))}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="profile-address" className="block text-xs text-muted-foreground mb-2">Default Shipping Address</label>
          <Input
            id="profile-address"
            placeholder="No. 123 Main Street, Colombo 03, Sri Lanka"
            value={profile.address || ''}
            onChange={(e) => setProfile((p) => (p ? { ...p, address: e.target.value } : null))}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer px-6 transition-colors"
        >
          {saving ? 'Saving changes...' : 'Save Profile Details'}
        </Button>
      </form>
    </div>
  );
}
