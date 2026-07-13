'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Settings, Save, Globe, Mail, Clock, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pbSiteSettings } from '@/lib/pb-collections';
import { updateSiteSettingsAction } from '@/app/actions/admin';

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState('FTC Electronics');
  const [tagline, setTagline] = useState('Premium Electronics Store & Authorized Reseller');
  const [phone, setPhone] = useState('+94 77 123 4567');
  const [email, setEmail] = useState('info@ftc.lk');
  const [whatsapp, setWhatsapp] = useState('+94 77 123 4567');
  const [hours, setHours] = useState('9:00 AM - 7:00 PM Daily');
  const [currency, setCurrency] = useState('LKR');
  const [taxRate, setTaxRate] = useState('15');

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      const settings = await pbSiteSettings.get<any>('general');
      if (settings) {
        setSiteName(settings.siteName || '');
        setTagline(settings.tagline || '');
        setPhone(settings.contactInfo?.phone || '');
        setEmail(settings.contactInfo?.email || '');
        setWhatsapp(settings.contactInfo?.whatsapp || '');
        setHours(settings.storeHoursCopy || '');
        setCurrency(settings.currency || 'LKR');
        setTaxRate(settings.taxRate?.toString() || '15');
      }
    } catch (err: any) {
      console.warn('Site settings not populated yet, using defaults:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    React.startTransition(() => {
      void loadData();
    });
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);

    startTransition(async () => {
      const payload = {
        siteName,
        tagline,
        currency,
        taxRate: parseFloat(taxRate) || 0,
        storeHoursCopy: hours,
        contactInfo: {
          phone,
          email,
          whatsapp,
        },
      };

      const res = await updateSiteSettingsAction('general', payload);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || 'Failed to update site settings.');
      }
    });
  };

  return (
    <div className="space-y-6 text-foreground max-w-4xl">
      {/* Title */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <Settings className="h-6 w-6 text-slate-500" />
            Global Site Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure contact info, regional options, storefront SEO templates, and hours.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {success && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 animate-fade-in">
              <CheckCircle2 className="h-4 w-4" /> Settings Saved
            </div>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-500 animate-fade-in">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}
          <Button
            onClick={handleSave}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5 h-9 px-4 cursor-pointer"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Settings
          </Button>
        </div>
      </div>

      {/* Grid segments */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading general configurations...
        </div>
      ) : (
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Brand Info */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 border-b border-border pb-2">
              <Globe className="h-4 w-4 text-blue-500" /> Identity & Branding
            </h3>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Storefront Name</label>
              <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="bg-background/40" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Tagline</label>
              <Input value={tagline} onChange={(e) => setTagline(e.target.value)} className="bg-background/40" />
            </div>
          </div>

          {/* Regional & Financial options */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 border-b border-border pb-2">
              <FileText className="h-4 w-4 text-indigo-500" /> Locality & Taxes
            </h3>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Base Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background/40 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="LKR">LKR (Sri Lankan Rupee)</option>
                <option value="USD">USD (United States Dollar)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Tax Rate (%)</label>
              <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="bg-background/40" />
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4 md:col-span-2">
            <h3 className="text-sm font-bold flex items-center gap-2 border-b border-border pb-2">
              <Mail className="h-4 w-4 text-emerald-500" /> Customer Support Contacts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Support Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background/40" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Phone Hotline</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-background/40" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">WhatsApp Number</label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="bg-background/40" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Store Hours Copy
                </label>
                <Input value={hours} onChange={(e) => setHours(e.target.value)} className="bg-background/40" />
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
