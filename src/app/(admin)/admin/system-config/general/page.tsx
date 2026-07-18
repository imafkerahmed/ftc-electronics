'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Globe,
  Mail,
  Clock,
  Save,
  Store,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pbSiteSettings } from '@/lib/pb-collections';
import { updateSiteSettingsAction } from '@/app/actions/admin';

export default function GeneralSettingsPage() {
  const [siteName, setSiteName] = useState('FTC Electronics');
  const [tagline, setTagline] = useState('Premium Electronics Store & Authorized Reseller');
  const [phone, setPhone] = useState('+94 77 123 4567');
  const [email, setEmail] = useState('info@ftc.lk');
  const [whatsapp, setWhatsapp] = useState('+94 77 123 4567');
  const [hours, setHours] = useState('9:00 AM - 7:00 PM Daily');
  const [currency, setCurrency] = useState('LKR');
  const [taxRate, setTaxRate] = useState('15');

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    async function loadData() {
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
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const payload = {
        siteName,
        tagline,
        currency,
        taxRate: parseFloat(taxRate) || 0,
        storeHoursCopy: hours,
        contactInfo: { phone, email, whatsapp },
      };
      const res = await updateSiteSettingsAction('general', payload);
      if (res.success) {
        showToast('General store settings saved successfully!');
      } else {
        showToast(res.error || 'Failed to save settings.', 'error');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {toast.msg}
        </div>
      )}

      {/* Header with Back button */}
      <div className="border-b border-border pb-5">
        <Link
          href="/admin/system-config"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to System Configurations
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
            <Store className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">General & Store Information</h1>
            <p className="text-xs text-muted-foreground">Configure storefront identity, contact numbers, tax rates, and operating hours.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-2xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading general settings...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Brand Info */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-blue-500" /> Branding & Identity
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Storefront Name</label>
                <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="h-8.5 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Tagline</label>
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} className="h-8.5 text-xs" />
              </div>
            </div>

            {/* Currency & Taxes */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-indigo-500" /> Regional & Tax
              </h3>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Base Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full h-8.5 px-3 rounded-lg border border-border bg-background text-xs font-medium focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                >
                  <option value="LKR">LKR (Sri Lankan Rupee)</option>
                  <option value="USD">USD (United States Dollar)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Default Tax Rate (%)</label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="h-8.5 text-xs" />
              </div>
            </div>

            {/* Contacts */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4 md:col-span-2 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-emerald-500" /> Customer Support & Contacts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">Support Email</label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8.5 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">Phone Hotline</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8.5 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">WhatsApp Number</label>
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="h-8.5 text-xs" />
                </div>
              </div>
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Store Operating Hours
                </label>
                <Input value={hours} onChange={(e) => setHours(e.target.value)} className="h-8.5 text-xs" />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 px-5 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Store Information
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
