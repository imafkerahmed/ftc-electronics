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
  MapPin,
  Share2,
  QrCode,
  Download,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');

  // Social Links with Enable/Disable switches
  const [instagram, setInstagram] = useState({ enabled: true, url: '' });
  const [facebook, setFacebook] = useState({ enabled: true, url: '' });
  const [tiktok, setTiktok] = useState({ enabled: true, url: '' });
  const [youtube, setYoutube] = useState({ enabled: true, url: '' });
  const [linkedin, setLinkedin] = useState({ enabled: true, url: '' });
  const [twitter, setTwitter] = useState({ enabled: true, url: '' });
  const [telegram, setTelegram] = useState({ enabled: true, url: '' });
  const [viber, setViber] = useState({ enabled: true, url: '' });

  const [originUrl, setOriginUrl] = useState('https://ftc.lk');

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const parseSocial = (val: any, defaultUrl: string) => {
    if (!val) return { enabled: true, url: defaultUrl };
    if (typeof val === 'string') return { enabled: val.trim().length > 0, url: val.trim() || defaultUrl };
    return {
      enabled: val.enabled === true,
      url: typeof val.url === 'string' ? val.url : defaultUrl,
    };
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }
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
          setAddress(settings.location?.address || '');
          setCity(settings.location?.city || '');
          setGoogleMapsUrl(settings.location?.googleMapsUrl || '');

          setInstagram(parseSocial(settings.socialLinks?.instagram, 'https://instagram.com/ftcelectronics'));
          setFacebook(parseSocial(settings.socialLinks?.facebook, 'https://facebook.com/ftcelectronics'));
          setTiktok(parseSocial(settings.socialLinks?.tiktok, 'https://tiktok.com/@ftcelectronics'));
          setYoutube(parseSocial(settings.socialLinks?.youtube, 'https://youtube.com/@ftcelectronics'));
          setLinkedin(parseSocial(settings.socialLinks?.linkedin, 'https://linkedin.com/company/ftcelectronics'));
          setTwitter(parseSocial(settings.socialLinks?.twitter, 'https://x.com/ftcelectronics'));
          setTelegram(parseSocial(settings.socialLinks?.telegram, 'https://t.me/ftcelectronics'));
          setViber(parseSocial(settings.socialLinks?.viber, 'https://viber.com'));
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
      let cleanGoogleMapsUrl = googleMapsUrl.trim();
      if (cleanGoogleMapsUrl.includes('<iframe') || cleanGoogleMapsUrl.startsWith('<iframe')) {
        const match = cleanGoogleMapsUrl.match(/src=["']([^"']+)["']/);
        if (match && match[1]) {
          cleanGoogleMapsUrl = match[1];
        }
      }

      if (cleanGoogleMapsUrl) {
        try {
          const parsed = new URL(cleanGoogleMapsUrl);
          const isGoogleMaps = parsed.protocol === 'https:' && (
            parsed.hostname.endsWith('.google.com') ||
            parsed.hostname === 'google.com' ||
            parsed.hostname.endsWith('.google.lk') ||
            parsed.hostname === 'google.lk' ||
            parsed.hostname === 'maps.google.com'
          );
          if (!isGoogleMaps) {
            throw new Error('invalid map URL');
          }
        } catch {
          showToast('Enter a valid HTTPS Google Maps URL.', 'error');
          return;
        }
      }

      const payload = {
        siteName,
        tagline,
        currency,
        taxRate: parseFloat(taxRate) || 0,
        storeHoursCopy: hours,
        contactInfo: { phone, email, whatsapp },
        location: { address, city, googleMapsUrl: cleanGoogleMapsUrl },
        socialLinks: {
          instagram: { enabled: instagram.enabled, url: instagram.url.trim() },
          facebook: { enabled: facebook.enabled, url: facebook.url.trim() },
          tiktok: { enabled: tiktok.enabled, url: tiktok.url.trim() },
          youtube: { enabled: youtube.enabled, url: youtube.url.trim() },
          linkedin: { enabled: linkedin.enabled, url: linkedin.url.trim() },
          twitter: { enabled: twitter.enabled, url: twitter.url.trim() },
          telegram: { enabled: telegram.enabled, url: telegram.url.trim() },
          viber: { enabled: viber.enabled, url: viber.url.trim() },
        },
      };
      const res = await updateSiteSettingsAction('general', payload);
      if (res.success) {
        setGoogleMapsUrl(cleanGoogleMapsUrl);
        showToast('General store settings saved successfully!');
      } else {
        showToast(res.error || 'Failed to save settings.', 'error');
      }
    });
  };

  const connectPageUrl = `${originUrl}/contact`;

  const downloadQRCode = () => {
    const svgEl = document.getElementById('visiting-card-qr');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onerror = () => showToast('Failed to render the QR code image.', 'error');
    img.onload = () => {
      canvas.width = 1000;
      canvas.height = 1000;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, 1000, 1000);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = 'ftc-electronics-visiting-card-qr.png';
        downloadLink.href = pngFile;
        downloadLink.click();
      }
      URL.revokeObjectURL(objectUrl);
    };

    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    img.src = objectUrl;
  };

  const copyConnectUrl = async () => {
    try {
      await navigator.clipboard.writeText(connectPageUrl);
      showToast('Copied digital card URL to clipboard!');
    } catch {
      showToast('Failed to copy the URL. Copy it manually.', 'error');
    }
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

            {/* Store Physical Location */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4 md:col-span-2 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-rose-500" /> Store Physical Location
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-foreground/80">Street Address</label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. No. 45, Galle Road, Colombo 03"
                    className="h-8.5 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80">City / Region</label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Colombo, Sri Lanka"
                    className="h-8.5 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1">
                    Google Maps Embed / Link URL
                    <span className="text-muted-foreground font-normal">(shown on storefront map)</span>
                  </label>
                  <Input
                    value={googleMapsUrl}
                    onChange={(e) => setGoogleMapsUrl(e.target.value)}
                    placeholder="https://maps.google.com/maps?q=... or embed src URL"
                    className="h-8.5 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Paste the Google Maps <strong>embed URL</strong> (from Share → Embed a map → copy the <code>src</code>) or a plain directions link.
                  </p>
                </div>
              </div>
            </div>

            {/* Social Media Channels */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4 md:col-span-2 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Share2 className="h-3.5 w-3.5 text-purple-500" /> Social Media Profiles & Channels
                </h3>
                <span className="text-[10px] text-muted-foreground">Toggle switches ON/OFF to control storefront visibility</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Instagram */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">Instagram</label>
                    <button
                      type="button"
                      onClick={() => setInstagram((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        instagram.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {instagram.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={instagram.url}
                    onChange={(e) => setInstagram((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!instagram.enabled}
                    placeholder="https://instagram.com/ftcelectronics"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>

                {/* Facebook */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">Facebook</label>
                    <button
                      type="button"
                      onClick={() => setFacebook((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        facebook.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {facebook.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={facebook.url}
                    onChange={(e) => setFacebook((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!facebook.enabled}
                    placeholder="https://facebook.com/ftcelectronics"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>

                {/* TikTok */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">TikTok</label>
                    <button
                      type="button"
                      onClick={() => setTiktok((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        tiktok.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {tiktok.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={tiktok.url}
                    onChange={(e) => setTiktok((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!tiktok.enabled}
                    placeholder="https://tiktok.com/@ftcelectronics"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>

                {/* YouTube */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">YouTube</label>
                    <button
                      type="button"
                      onClick={() => setYoutube((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        youtube.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {youtube.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={youtube.url}
                    onChange={(e) => setYoutube((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!youtube.enabled}
                    placeholder="https://youtube.com/@ftcelectronics"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>

                {/* LinkedIn */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">LinkedIn</label>
                    <button
                      type="button"
                      onClick={() => setLinkedin((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        linkedin.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {linkedin.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={linkedin.url}
                    onChange={(e) => setLinkedin((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!linkedin.enabled}
                    placeholder="https://linkedin.com/company/ftcelectronics"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>

                {/* X / Twitter */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">X (Twitter)</label>
                    <button
                      type="button"
                      onClick={() => setTwitter((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        twitter.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {twitter.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={twitter.url}
                    onChange={(e) => setTwitter((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!twitter.enabled}
                    placeholder="https://x.com/ftcelectronics"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>

                {/* Telegram */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">Telegram Channel</label>
                    <button
                      type="button"
                      onClick={() => setTelegram((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        telegram.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {telegram.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={telegram.url}
                    onChange={(e) => setTelegram((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!telegram.enabled}
                    placeholder="https://t.me/ftcelectronics"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>

                {/* Viber */}
                <div className="space-y-1.5 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground">Viber Channel</label>
                    <button
                      type="button"
                      onClick={() => setViber((prev) => ({ ...prev, enabled: !prev.enabled }))}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        viber.enabled ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30' : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {viber.enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                  <Input
                    value={viber.url}
                    onChange={(e) => setViber((prev) => ({ ...prev, url: e.target.value }))}
                    disabled={!viber.enabled}
                    placeholder="https://viber.com"
                    className="h-8.5 text-xs bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Visiting Card QR Code Generator */}
            <div className="bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-card border border-blue-500/20 rounded-2xl p-5 space-y-4 md:col-span-2 shadow-sm">
              <div className="flex items-center justify-between border-b border-blue-500/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <QrCode className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Digital Visiting Card & QR Generator</h3>
                    <p className="text-[10px] text-muted-foreground">Print this QR code on physical business cards for instant customer scans.</p>
                  </div>
                </div>
                <Link
                  href="/contact"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
                >
                  Preview Card Page <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-6 pt-1">
                {/* QR Code Container */}
                <div className="p-3 bg-white rounded-xl shadow-md border border-slate-200 flex-shrink-0">
                  <QRCodeSVG
                    id="visiting-card-qr"
                    value={connectPageUrl}
                    size={135}
                    level="H"
                    marginSize={4}
                  />
                </div>

                <div className="space-y-3 text-center sm:text-left flex-1">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Target QR Landing Page</span>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <code className="text-xs bg-muted px-2.5 py-1 rounded-md text-foreground font-mono border border-border">{connectPageUrl}</code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copyConnectUrl}
                        className="h-7 text-xs px-2.5 flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    When customers scan this QR code on your printed business cards, they land on your high-converting digital card with direct WhatsApp chat, call hotline, location directions, and all your social channels.
                  </p>

                  <div className="pt-1">
                    <Button
                      type="button"
                      onClick={downloadQRCode}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8.5 px-4 inline-flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Printable High-Res QR PNG
                    </Button>
                  </div>
                </div>
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
