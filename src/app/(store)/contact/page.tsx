'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  MessageSquare,
  UserPlus,
  ChevronRight,
  ShieldCheck,
  Send,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import LocationMap from '@/components/layout/location-map';
import { pbSiteSettings } from '@/lib/pb-collections';
import { submitContactFormAction } from '@/app/actions/contact';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faInstagram,
  faFacebook,
  faTiktok,
  faYoutube,
  faTelegram,
  faLinkedin,
  faXTwitter,
  faViber,
} from '@fortawesome/free-brands-svg-icons';

const STATIC_SOCIAL_PLATFORMS = [
  {
    key: 'instagram',
    name: 'Instagram',
    handle: '@ftcelectronics',
    icon: faInstagram,
    defaultUrl: 'https://instagram.com/ftcelectronics',
    gradient: 'from-pink-500 to-fuchsia-600',
    ring: 'ring-pink-500/30',
    iconColor: 'text-pink-500',
    bg: 'bg-pink-500/8 hover:bg-pink-500/15',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    handle: 'FTC Electronics',
    icon: faFacebook,
    defaultUrl: 'https://facebook.com/ftcelectronics',
    gradient: 'from-blue-500 to-blue-700',
    ring: 'ring-blue-500/30',
    iconColor: 'text-blue-500',
    bg: 'bg-blue-500/8 hover:bg-blue-500/15',
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    handle: '@ftcelectronics',
    icon: faTiktok,
    defaultUrl: 'https://tiktok.com/@ftcelectronics',
    gradient: 'from-neutral-700 to-neutral-900',
    ring: 'ring-neutral-400/30',
    iconColor: 'text-foreground',
    bg: 'bg-neutral-500/8 hover:bg-neutral-500/15',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    handle: 'FTC Electronics',
    icon: faYoutube,
    defaultUrl: 'https://youtube.com/@ftcelectronics',
    gradient: 'from-red-500 to-rose-700',
    ring: 'ring-red-500/30',
    iconColor: 'text-red-500',
    bg: 'bg-red-500/8 hover:bg-red-500/15',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    handle: '@ftcelectronics',
    icon: faTelegram,
    defaultUrl: 'https://t.me/ftcelectronics',
    gradient: 'from-sky-400 to-cyan-600',
    ring: 'ring-sky-400/30',
    iconColor: 'text-sky-500',
    bg: 'bg-sky-500/8 hover:bg-sky-500/15',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    handle: 'FTC Electronics',
    icon: faLinkedin,
    defaultUrl: 'https://linkedin.com/company/ftcelectronics',
    gradient: 'from-blue-600 to-sky-700',
    ring: 'ring-blue-600/30',
    iconColor: 'text-blue-600',
    bg: 'bg-blue-600/8 hover:bg-blue-600/15',
  },
  {
    key: 'twitter',
    name: 'X',
    handle: '@ftcelectronics',
    icon: faXTwitter,
    defaultUrl: 'https://x.com/ftcelectronics',
    gradient: 'from-neutral-600 to-neutral-800',
    ring: 'ring-neutral-400/30',
    iconColor: 'text-foreground/80',
    bg: 'bg-neutral-500/8 hover:bg-neutral-500/15',
  },
  {
    key: 'viber',
    name: 'Viber',
    handle: 'FTC Electronics',
    icon: faViber,
    defaultUrl: 'https://viber.com',
    gradient: 'from-purple-500 to-violet-700',
    ring: 'ring-purple-500/30',
    iconColor: 'text-purple-500',
    bg: 'bg-purple-500/8 hover:bg-purple-500/15',
  },
] as const;

export default function ContactPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [formSent, setFormSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  useEffect(() => {
    async function loadData() {
      try {
        const settingsRes = await pbSiteSettings.get<any>('general').catch(() => null);
        if (settingsRes) setSettings(settingsRes);
      } catch {
        // fallback
      } finally {
        setLoadingSettings(false);
      }
    }
    void loadData();
  }, []);

  const siteName = settings?.siteName || 'FTC Electronics';
  const phone = settings?.contactInfo?.phone || '+94 77 123 4567';
  const email = settings?.contactInfo?.email || 'info@ftc.lk';
  const whatsapp = settings?.contactInfo?.whatsapp || '+94 77 123 4567';
  const cleanWhatsapp = whatsapp.replace(/[^0-9+]/g, '');
  const hours = settings?.storeHoursCopy || '9:30 AM - 7:00 PM Daily';
  const address = settings?.location?.address || '123 Tech Avenue, Colombo 03, Sri Lanka';
  const city = settings?.location?.city || 'Colombo';
  const googleMapsUrl = settings?.location?.googleMapsUrl || 'https://maps.google.com';

  const socialLinks = settings?.socialLinks;

  const allSocials = useMemo(() => {
    const toHttpsUrl = (value: unknown): string | undefined => {
      if (typeof value !== 'string' || !value.trim()) return undefined;
      try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' ? url.href : undefined;
      } catch {
        return undefined;
      }
    };

    const getSocialInfo = (val: unknown, defaultUrl: string) => {
      if (!val) return { enabled: false, url: defaultUrl };
      if (typeof val === 'string') {
        const url = toHttpsUrl(val);
        return { enabled: Boolean(url), url: url ?? '' };
      }
      if (typeof val !== 'object' || Array.isArray(val)) {
        return { enabled: false, url: defaultUrl };
      }

      const { enabled, url } = val as { enabled?: unknown; url?: unknown };
      const resolvedUrl =
        typeof url === 'string' && url.trim() ? toHttpsUrl(url) : defaultUrl;
      return { enabled: enabled === true && Boolean(resolvedUrl), url: resolvedUrl ?? '' };
    };

    return STATIC_SOCIAL_PLATFORMS.map((platform) => {
      const val = socialLinks ? socialLinks[platform.key] : undefined;
      return {
        ...platform,
        data: getSocialInfo(val, platform.defaultUrl),
      };
    }).filter((s) => s.data.enabled && Boolean(s.data.url?.trim()));
  }, [socialLinks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await submitContactFormAction(formData);
      if (res.success) {
        setFormSent(true);
        setFormData({ name: '', email: '', phone: '', message: '' });
      } else {
        setErrorMessage(res.error || 'Failed to submit message.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="text-foreground py-8 space-y-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-10">
        {/* ── Top Hero Card ── */}
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-card via-card to-blue-500/5 border border-border px-6 py-8 sm:px-10 sm:py-10 shadow-sm">
          <div className="space-y-3 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
              Contact &amp; Connect with Us
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Have a question about product specifications, warranty, wholesale inquiries, or order status? Visit our store location or send us a message below.
            </p>
          </div>
        </div>

        {/* ── Socials Section ── */}
        {(loadingSettings || allSocials.length > 0) && (
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
            {/* Centered Header */}
            <div className="text-center space-y-1.5 max-w-xl mx-auto">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-500">Official Socials</span>
              <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">
                Connect With Us
              </h2>
              <p className="text-xs text-muted-foreground">
                Follow our official channels for the latest product drops, announcements, and store updates.
              </p>
            </div>

            {/* Centered Social Cards */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              {loadingSettings ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-36 w-48 rounded-2xl bg-muted animate-pulse" />
                ))
              ) : (
                allSocials.map((social) => (
                  <a
                    key={social.name}
                    href={social.data.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col items-center text-center rounded-2xl border border-border/70 bg-background/50 hover:bg-background hover:border-blue-500/40 p-5 shadow-2xs hover:shadow-md transition-all duration-300 hover:-translate-y-1 w-full sm:w-48 cursor-pointer"
                  >
                    {/* Platform Icon */}
                    <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${social.gradient} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform duration-300 mb-3`}>
                      <FontAwesomeIcon icon={social.icon} className="h-6 w-6 text-white" />
                    </div>

                    {/* Name & Handle */}
                    <div className="text-sm font-bold text-foreground group-hover:text-blue-500 transition-colors">
                      {social.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {social.handle}
                    </div>

                    {/* Follow Link */}
                    <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-500 group-hover:underline">
                      <span>Follow</span>
                      <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Direct Message Section (2 Columns: Clean Animated Text on Left, Form Card on Right) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Clean Animated Title Only */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="lg:col-span-5 space-y-3 py-2"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-blue-500">Fast &amp; Direct Support</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight leading-tight">
              We&apos;re Here to Help With Any Inquiry
            </h2>
          </motion.div>

          {/* Right Column: Direct Message Form Card */}
          <div className="lg:col-span-7 p-6 sm:p-8 rounded-3xl bg-card border border-border shadow-sm">
            <h3 className="text-xl font-bold text-foreground mb-6">Send Us a Direct Message</h3>

            {formSent ? (
              <div className="p-6 text-center space-y-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <h4 className="text-sm font-bold text-foreground">Message Sent Successfully!</h4>
                <p className="text-xs text-muted-foreground">Thank you for reaching out to {siteName}. Our support team has received your message and will reply soon.</p>
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
                {errorMessage && (
                  <div className="p-3 text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    {errorMessage}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                      Your Name
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="John Doe"
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john@example.com"
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-phone" className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                    Phone Number
                  </label>
                  <input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+94 77 123 4567"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="contact-message" className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                    Message / Inquiry
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={4}
                    required
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
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
      </div>

      {/* ── Location Map (Full width flush to footer) ── */}
      <div className="-mb-8">
        <LocationMap
          settings={{
            address,
            city,
            phone,
            email,
            hours,
            googleMapsLink: googleMapsUrl,
            whatsappLink: whatsapp ? (whatsapp.startsWith('http') ? whatsapp : `https://wa.me/${cleanWhatsapp.replace(/^\+/, '')}`) : undefined,
          }}
        />
      </div>
    </div>
  );
}
