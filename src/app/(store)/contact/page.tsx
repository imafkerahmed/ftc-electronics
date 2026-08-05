'use client';

import React, { useState, useEffect } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  MessageSquare,
  UserPlus,
  Share2,
  ChevronRight,
  ShieldCheck,
  Send,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faInstagram,
  faFacebook,
  faTiktok,
  faYoutube,
  faLinkedin,
  faXTwitter,
  faTelegram,
  faViber,
} from '@fortawesome/free-brands-svg-icons';
import LocationMap from '@/components/layout/location-map';
import { pbSiteSettings, pbProducts } from '@/lib/pb-collections';
import {
  InstagramEmbed,
  FacebookEmbed,
  TikTokEmbed,
  YouTubeEmbed,
  XEmbed,
  LinkedInEmbed,
} from 'react-social-media-embed';

export default function ContactPage() {
  const [settings, setSettings] = useState<any>(null);
  const [storeImages, setStoreImages] = useState<string[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [formSent, setFormSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [settingsRes, productsRes] = await Promise.all([
          pbSiteSettings.get<any>('general').catch(() => null),
          pbProducts.getAll({ perPage: 12 }).catch(() => null),
        ]);
        if (settingsRes) setSettings(settingsRes);
        if (productsRes && productsRes.items) {
          const imgs = productsRes.items
            .flatMap((p: any) => p.images || [])
            .filter((img: string) => Boolean(img && img.trim()));
          setStoreImages(imgs);
        }
      } catch {
        // fallback
      } finally {
        setLoadingSettings(false);
      }
    }
    void loadData();
  }, []);

  const siteName = settings?.siteName || 'FTC Electronics';
  const tagline = settings?.tagline || 'Premium Electronics Store & Authorized Reseller';
  const phone = settings?.contactInfo?.phone || '+94 77 123 4567';
  const email = settings?.contactInfo?.email || 'info@ftc.lk';
  const whatsapp = settings?.contactInfo?.whatsapp || '+94 77 123 4567';
  const cleanWhatsapp = whatsapp.replace(/[^0-9+]/g, '');
  const hours = settings?.storeHoursCopy || '9:30 AM - 7:00 PM Daily';
  const address = settings?.location?.address || '123 Tech Avenue, Colombo 03, Sri Lanka';
  const city = settings?.location?.city || 'Colombo';
  const googleMapsUrl = settings?.location?.googleMapsUrl || 'https://maps.google.com';

  const socialLinks = settings?.socialLinks || {};

  const getSocialInfo = (val: any, defaultUrl: string) => {
    if (!val) return { enabled: false, url: defaultUrl };
    if (typeof val === 'string') return { enabled: val.trim().length > 0, url: val.trim() || defaultUrl };
    return { enabled: val.enabled === true, url: (val.url && val.url.trim()) || defaultUrl };
  };

  const socialButtons = [
    {
      name: 'Instagram',
      handle: '@ftcelectronics',
      data: getSocialInfo(socialLinks.instagram, 'https://instagram.com/ftcelectronics'),
      faIcon: faInstagram,
      textColor: 'text-pink-500',
      bgColor: 'bg-pink-500/10 border-pink-500/20',
      tag: 'Photos & Deals',
    },
    {
      name: 'Facebook',
      handle: 'FTC Electronics',
      data: getSocialInfo(socialLinks.facebook, 'https://facebook.com/ftcelectronics'),
      faIcon: faFacebook,
      textColor: 'text-blue-500',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      tag: 'Community Hub',
    },
    {
      name: 'TikTok',
      handle: '@ftcelectronics',
      data: getSocialInfo(socialLinks.tiktok, 'https://tiktok.com/@ftcelectronics'),
      faIcon: faTiktok,
      textColor: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
      tag: 'Short Videos',
    },
    {
      name: 'YouTube',
      handle: 'FTC Electronics',
      data: getSocialInfo(socialLinks.youtube, 'https://youtube.com/@ftcelectronics'),
      faIcon: faYoutube,
      textColor: 'text-red-500',
      bgColor: 'bg-red-500/10 border-red-500/20',
      tag: 'Product Reviews',
    },
    {
      name: 'Telegram',
      handle: '@ftcelectronics',
      data: getSocialInfo(socialLinks.telegram, 'https://t.me/ftcelectronics'),
      faIcon: faTelegram,
      textColor: 'text-sky-400',
      bgColor: 'bg-sky-500/10 border-sky-500/20',
      tag: 'Deals & Drops',
    },
    {
      name: 'LinkedIn',
      handle: 'FTC Electronics',
      data: getSocialInfo(socialLinks.linkedin, 'https://linkedin.com/company/ftcelectronics'),
      faIcon: faLinkedin,
      textColor: 'text-sky-500',
      bgColor: 'bg-sky-500/10 border-sky-500/20',
      tag: 'Corporate & B2B',
    },
    {
      name: 'X (Twitter)',
      handle: '@ftcelectronics',
      data: getSocialInfo(socialLinks.twitter, 'https://x.com/ftcelectronics'),
      faIcon: faXTwitter,
      textColor: 'text-neutral-400',
      bgColor: 'bg-neutral-500/10 border-neutral-500/20',
      tag: 'Announcements',
    },
    {
      name: 'Viber',
      handle: 'FTC Electronics',
      data: getSocialInfo(socialLinks.viber, 'https://viber.com'),
      faIcon: faViber,
      textColor: 'text-purple-500',
      bgColor: 'bg-purple-500/10 border-purple-500/20',
      tag: 'Hotline Chat',
    },
  ].filter((item) => item.data.enabled && Boolean(item.data.url && item.data.url.trim()));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setFormSent(true);
    }, 800);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground space-y-10">
      {/* ── Top Hero Card ── */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-card via-card to-blue-500/5 border border-border px-6 py-8 sm:px-10 sm:py-10 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Official Contact & Digital Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
            Contact & Connect with Us
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Have a question about product specifications, warranty, wholesale inquiries, or order status? Save our contact card, reach out via WhatsApp, visit our store, or send us a message below.
          </p>
        </div>

        {/* Quick Action Pill Buttons */}
        <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-auto shrink-0">
          <a
            href="/api/vcard"
            download="FTC_Electronics.vcf"
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-md transition-all hover:scale-[1.02] cursor-pointer"
          >
            <UserPlus className="h-4 w-4" /> Save Contact to Phone (.vcf)
          </a>
          {whatsapp && (
            <a
              href={`https://wa.me/${cleanWhatsapp.replace(/^\+/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-md transition-all hover:scale-[1.02]"
            >
              <MessageSquare className="h-4 w-4" /> Chat on WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* ── Social Profiles & Live Channel Glimpses ── */}
      {(loadingSettings || socialButtons.length > 0) && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Share2 className="h-5 w-5 text-blue-500" /> Official Channels & Live Glimpses
              </h2>
              <p className="text-xs text-muted-foreground">Get a live preview of our official store channels, unboxing videos, and exclusive flash deals.</p>
            </div>
            <span className="text-xs text-muted-foreground font-semibold hidden sm:inline">Live Previews</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loadingSettings
              ? Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx} className="h-64 rounded-3xl bg-card border border-border p-5 animate-pulse space-y-4">
                    <div className="h-10 w-full bg-muted rounded-xl" />
                    <div className="h-32 w-full bg-muted rounded-2xl" />
                    <div className="h-9 w-full bg-muted rounded-xl" />
                  </div>
                ))
              : socialButtons.map((social) => {
                  return (
                    <div
                      key={social.name}
                      className="bg-card border border-border hover:border-blue-500/30 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                    >
                      {/* Card Top Header */}
                      <div className="p-5 pb-3 flex items-center justify-between border-b border-border/40 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className={`h-11 w-11 rounded-2xl ${social.bgColor} border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                            <FontAwesomeIcon icon={social.faIcon} className={`h-5 w-5 ${social.textColor}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">{social.name}</span>
                              <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 fill-blue-500/20" />
                            </div>
                            <span className="text-[11px] text-muted-foreground font-mono">{social.handle}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-background border border-border text-foreground/80 shadow-2xs">
                          {social.name === 'YouTube' && '25K Subs'}
                          {social.name === 'Instagram' && '12.4K Followers'}
                          {social.name === 'TikTok' && '35.2K Likes'}
                          {social.name === 'Facebook' && '18K Likes'}
                          {social.name === 'Telegram' && '8.5K Members'}
                          {social.name === 'LinkedIn' && '500+ Conn.'}
                          {social.name === 'X (Twitter)' && 'Official Updates'}
                          {social.name === 'Viber' && 'Online'}
                        </span>
                      </div>

                      {/* Card Body - Platform Specific Glimpse Preview */}
                      <div className="p-4 flex-1 flex flex-col justify-center">
                        {/* Instagram Embed */}
                        {social.name === 'Instagram' && (
                          <div className="w-full rounded-2xl overflow-hidden border border-pink-500/20 flex items-center justify-center bg-background p-1 shadow-2xs">
                            <InstagramEmbed url={social.data.url} width="100%" />
                          </div>
                        )}

                        {/* YouTube Embed */}
                        {social.name === 'YouTube' && (
                          <div className="w-full rounded-2xl overflow-hidden border border-red-500/20 aspect-video flex items-center justify-center bg-black shadow-2xs">
                            <YouTubeEmbed url={social.data.url} width="100%" height={260} />
                          </div>
                        )}

                        {/* TikTok Embed */}
                        {social.name === 'TikTok' && (
                          <div className="w-full rounded-2xl overflow-hidden border border-cyan-500/20 flex items-center justify-center bg-background p-1 shadow-2xs">
                            <TikTokEmbed url={social.data.url} width="100%" />
                          </div>
                        )}

                        {/* Facebook Embed */}
                        {social.name === 'Facebook' && (
                          <div className="w-full rounded-2xl overflow-hidden border border-blue-500/20 flex items-center justify-center bg-background p-1 shadow-2xs">
                            <FacebookEmbed url={social.data.url} width="100%" />
                          </div>
                        )}

                        {/* X (Twitter) Embed */}
                        {social.name === 'X (Twitter)' && (
                          <div className="w-full rounded-2xl overflow-hidden border border-border flex items-center justify-center bg-background p-1 shadow-2xs">
                            <XEmbed url={social.data.url} width="100%" />
                          </div>
                        )}

                        {/* LinkedIn Embed */}
                        {social.name === 'LinkedIn' && (
                          <div className="w-full rounded-2xl overflow-hidden border border-sky-600/20 flex items-center justify-center bg-background p-1 shadow-2xs">
                            <LinkedInEmbed url={social.data.url} width="100%" />
                          </div>
                        )}

                        {/* Telegram Preview */}
                        {social.name === 'Telegram' && (
                          <div className="p-3.5 rounded-2xl bg-sky-500/5 border border-sky-500/20 space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-sky-500">
                              <span>📢 Telegram Channel</span>
                              <span className="text-[10px] text-muted-foreground font-mono">LIVE</span>
                            </div>
                            <p className="text-[11px] text-foreground bg-background/60 p-2.5 rounded-xl border border-border/60 leading-relaxed font-mono">
                              🔥 Daily Flash Deal: Instant alerts on limited stock PowerBanks & Laptops!
                            </p>
                          </div>
                        )}

                        {/* LinkedIn Preview */}
                        {social.name === 'LinkedIn' && (
                          <div className="p-3.5 rounded-2xl bg-sky-600/5 border border-sky-600/20 space-y-2">
                            <span className="text-xs font-bold text-sky-600 block">Corporate & B2B Wholesale</span>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              Connect with FTC Electronics (Pvt) Ltd for bulk corporate procurement, dealer partnerships, and business inquiries.
                            </p>
                          </div>
                        )}

                        {/* X (Twitter) Preview */}
                        {social.name === 'X (Twitter)' && (
                          <div className="p-3.5 rounded-2xl bg-neutral-500/5 border border-border space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-foreground">
                              <span>@ftcelectronics</span>
                              <span className="text-[10px] text-muted-foreground">Pinned</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed font-mono">
                              All authorized store locations are open daily 9:30 AM - 7:00 PM. Instant delivery across Sri Lanka!
                            </p>
                          </div>
                        )}

                        {/* Viber Preview */}
                        {social.name === 'Viber' && (
                          <div className="p-3.5 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-2">
                            <div className="flex items-center justify-between text-xs font-bold text-purple-500">
                              <span>Hotline Viber Channel</span>
                              <span className="text-[10px] text-emerald-500 font-bold">Online</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              Send instant product inquiries, stock availability checks, or invoice queries directly via Viber.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Card Footer Button */}
                      <div className="p-4 pt-0">
                        <a
                          href={social.data.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 px-4 rounded-2xl bg-muted/60 hover:bg-blue-600 hover:text-white text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all border border-border/60 hover:border-blue-600 shadow-2xs group/btn"
                        >
                          <span>Visit {social.name}</span>
                          <ChevronRight className="h-3.5 w-3.5 group-hover/btn:translate-x-1 transition-transform" />
                        </a>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      )}

      {/* ── Main Details & Form Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Contact Cards */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-card border border-border space-y-6 shadow-sm">
            <h3 className="text-lg font-bold text-foreground border-b border-border pb-3">Customer Support Details</h3>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Store Address</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{address}</p>
                {city && <p className="text-xs text-muted-foreground">{city}</p>}
                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline font-semibold mt-1.5"
                  >
                    Open in Google Maps <ChevronRight className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Phone Hotline</h4>
                <a href={`tel:${phone}`} className="text-xs text-muted-foreground hover:text-blue-500 block mt-1 font-semibold">{phone}</a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Email Support</h4>
                <a href={`mailto:${email}`} className="text-xs text-muted-foreground hover:text-blue-500 block mt-1 font-semibold">{email}</a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Operating Hours</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{hours}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Contact Form */}
        <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl bg-card border border-border shadow-sm">
          <h3 className="text-lg font-bold text-foreground mb-6">Send Us a Direct Message</h3>
          
          {formSent ? (
            <div className="p-6 text-center space-y-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl animate-fade-in">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-bold text-foreground">Message Sent Successfully!</h4>
              <p className="text-xs text-muted-foreground">Thank you for reaching out to {siteName}. Our support team will get back to you shortly.</p>
              <button
                type="button"
                onClick={() => setFormSent(false)}
                className="text-xs text-blue-500 hover:underline font-semibold pt-2 block mx-auto"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+94 77 123 4567"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                  Message / Inquiry
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="How can we help you today?"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl py-3.5 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── Location Map ── */}
      <LocationMap />
    </div>
  );
}
