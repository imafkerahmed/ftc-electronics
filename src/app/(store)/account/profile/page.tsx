'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ProfilePage() {
  const [profile, setProfile] = useState({
    name: 'Alex Johnson',
    email: 'alex.johnson@example.com',
    phone: '+1 (555) 019-2834',
    address: '123 Tech Drive, Silicon Valley, CA 94025',
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Simulate API update delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSaving(false);
    console.log('[Account] Saving profile:', profile);
  };

  return (
    <div className="space-y-6 text-foreground">
      <div>
        <h2 className="text-xl font-bold tracking-wide">My Profile</h2>
        <p className="text-xs text-muted-foreground mt-1">Manage your customer details and default shipping options.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div className="flex items-center gap-4 bg-secondary/40 p-4 rounded-lg border border-border">
          <div className="h-12 w-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold">
            AJ
          </div>
          <div>
            <h4 className="text-sm font-semibold">{profile.name}</h4>
            <p className="text-xs text-muted-foreground">Customer since June 2026</p>
          </div>
        </div>

        <div>
          <label htmlFor="profile-name" className="block text-xs text-muted-foreground mb-2">Full Name</label>
          <Input
            id="profile-name"
            value={profile.name}
            onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="profile-email" className="block text-xs text-muted-foreground mb-2">Email Address</label>
          <Input
            id="profile-email"
            type="email"
            value={profile.email}
            onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="profile-phone" className="block text-xs text-muted-foreground mb-2">Phone Number</label>
          <Input
            id="profile-phone"
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            className="h-10 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="profile-address" className="block text-xs text-muted-foreground mb-2">Default Shipping Address</label>
          <Input
            id="profile-address"
            value={profile.address}
            onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
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
