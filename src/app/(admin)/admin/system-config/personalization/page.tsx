'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Palette,
  Sparkles,
  Type,
  Image as ImageIcon,
  Upload,
  Trash2,
  Bell,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pbSiteSettings } from '@/lib/pb-collections';
import { updateSiteSettingsAction, uploadMediaAction } from '@/app/actions/admin';

function ImageUploadField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', `${label} - ${file.name}`);

      const res = await uploadMediaAction(formData);
      if (res.success && res.data) {
        const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
        const uploadedUrl = `${pbUrl}/api/files/${res.data.collectionId}/${res.data.id}/${res.data.file}`;
        onChange(uploadedUrl);
      }
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-foreground/80 flex items-center justify-between">
        <span>{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </label>

      {/* Image Preview Card */}
      {value ? (
        <div className="relative border border-border rounded-xl p-2.5 bg-muted/20 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
            <img src={value} alt={label} className="h-full w-full object-contain p-1" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-foreground truncate">{value}</p>
            <p className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" /> Image ready
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-7 text-[10px] px-2.5 cursor-pointer shrink-0"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Replace
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || '/logo.svg or upload file...'}
            className="h-8.5 text-xs flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-8.5 text-xs px-3 cursor-pointer shrink-0 flex items-center gap-1.5"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

export default function PersonalizationSettingsPage() {
  // Brand Logos
  const [logoUrl, setLogoUrl] = useState('');
  const [darkLogoUrl, setDarkLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');

  // Primary Brand Color Accent
  const [primaryColor, setPrimaryColor] = useState('#2563eb');

  // Typography & UI Options
  const [fontFamily, setFontFamily] = useState('Inter');
  const [borderRadius, setBorderRadius] = useState('rounded-xl');

  // Top Announcement Bar
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [announcementText, setAnnouncementText] = useState('🚀 Free Delivery on orders over LKR 50,000 | Authorized Reseller');
  const [announcementLink, setAnnouncementLink] = useState('/products');
  const [announcementBg, setAnnouncementBg] = useState('#1e293b');

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
        const settings = await pbSiteSettings.get<any>('personalization');
        if (settings) {
          setLogoUrl(settings.logoUrl || '');
          setDarkLogoUrl(settings.darkLogoUrl || '');
          setFaviconUrl(settings.faviconUrl || '');
          setPrimaryColor(settings.primaryColor || '#2563eb');
          setFontFamily(settings.fontFamily || 'Inter');
          setBorderRadius(settings.borderRadius || 'rounded-xl');
          setShowAnnouncement(settings.announcement?.show ?? true);
          setAnnouncementText(settings.announcement?.text || '');
          setAnnouncementLink(settings.announcement?.link || '');
          setAnnouncementBg(settings.announcement?.bgColor || '#1e293b');
        }
      } catch {
        // Fall back to defaults
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
        logoUrl,
        darkLogoUrl,
        faviconUrl,
        primaryColor,
        fontFamily,
        borderRadius,
        announcement: {
          show: showAnnouncement,
          text: announcementText,
          link: announcementLink,
          bgColor: announcementBg,
        },
      };
      const res = await updateSiteSettingsAction('personalization', payload);
      if (res.success) {
        showToast('Personalization settings saved successfully!');
      } else {
        showToast(res.error || 'Failed to save settings.', 'error');
      }
    });
  };

  const colorPresets = [
    { name: 'Royal Blue', hex: '#2563eb' },
    { name: 'Electric Violet', hex: '#7c3aed' },
    { name: 'Emerald Green', hex: '#059669' },
    { name: 'Amber Gold', hex: '#d97706' },
    { name: 'Rose Red', hex: '#e11d48' },
    { name: 'Slate Dark', hex: '#0f172a' },
  ];

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
          <div className="h-9 w-9 bg-purple-500/10 rounded-xl flex items-center justify-center">
            <Palette className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Personalization & Branding</h1>
            <p className="text-xs text-muted-foreground">Manage store logos, primary accent color, font family, corner radius, and announcement banners.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-2xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-purple-500" />
          Loading personalization settings...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">

          {/* Section 1: Store Branding Logos */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-blue-500" /> Store Branding & Logos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ImageUploadField
                label="Primary Store Logo"
                value={logoUrl}
                onChange={setLogoUrl}
                placeholder="/logo.svg or upload..."
              />
              <ImageUploadField
                label="Dark Mode Logo"
                value={darkLogoUrl}
                onChange={setDarkLogoUrl}
                placeholder="/logo-dark.svg or upload..."
              />
              <ImageUploadField
                label="Favicon Icon"
                value={faviconUrl}
                onChange={setFaviconUrl}
                placeholder="/favicon.ico or upload..."
              />
            </div>
          </div>

          {/* Section 2: Primary Accent Color */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Primary Brand Color Accent
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground/80 block">Select Primary Brand Accent Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-border cursor-pointer p-0.5"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-32 text-xs font-mono uppercase"
                />
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {colorPresets.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setPrimaryColor(c.hex)}
                      title={c.name}
                      style={{ backgroundColor: c.hex }}
                      className={`h-7 w-7 rounded-full transition-transform cursor-pointer border border-white/20 ${
                        primaryColor.toLowerCase() === c.hex.toLowerCase() ? 'scale-115 ring-2 ring-purple-500 ring-offset-2' : 'hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Typography & Radius */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-emerald-500" /> Font Family & Corner Radius
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Font Family</label>
                <select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full h-8.5 px-3 rounded-lg border border-border bg-background text-xs font-medium cursor-pointer"
                >
                  <option value="Inter">Inter (Clean System Sans)</option>
                  <option value="Outfit">Outfit (Modern Geometric)</option>
                  <option value="Roboto">Roboto (Classic Corporate)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Component Corner Radius</label>
                <select
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(e.target.value)}
                  className="w-full h-8.5 px-3 rounded-lg border border-border bg-background text-xs font-medium cursor-pointer"
                >
                  <option value="rounded-xl">Standard Curved (12px / 16px)</option>
                  <option value="rounded-2xl">Soft Extra Curved (16px / 24px)</option>
                  <option value="rounded-md">Subtle Rounded (6px / 8px)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 4: Storefront Announcement Bar */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-purple-500" /> Top Announcement Banner
              </h3>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground/80">
                <input
                  type="checkbox"
                  checked={showAnnouncement}
                  onChange={(e) => setShowAnnouncement(e.target.checked)}
                  className="rounded"
                />
                Show Top Banner
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Banner Copy / Announcement Text</label>
                <Input value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} className="h-8.5 text-xs" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">CTA Destination Link</label>
                <Input value={announcementLink} onChange={(e) => setAnnouncementLink(e.target.value)} placeholder="/products" className="h-8.5 text-xs" />
              </div>
            </div>

            {/* Live Banner Preview */}
            <div className="pt-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">Live Banner Preview</label>
              <div
                style={{ backgroundColor: announcementBg }}
                className="w-full py-2 px-4 rounded-xl text-white text-xs font-medium flex items-center justify-between shadow-xs"
              >
                <span>{announcementText || 'Your announcement message will appear here...'}</span>
                <span className="text-[10px] underline opacity-80">Learn More &rarr;</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs h-9 px-5 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Personalization
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
