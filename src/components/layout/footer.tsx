"use client";

import Link from "next/link";
import { ArrowUp, MessageCircle, Share2, Play, Send } from "lucide-react";

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
);
const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
);
const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
);
const YoutubeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2.5 7.1C2.5 7.1 2.3 5.4 3.1 4.6 4 3.7 5.1 3.7 5.6 3.6 8.7 3.4 12 3.4 12 3.4s3.3 0 6.4.2c.5.1 1.6.1 2.5 1 1 1 1.2 2.5 1.2 2.5s.2 2 .2 4.1v1.4c0 2.1-.2 4.1-.2 4.1s-.2 1.5-1.2 2.5c-1 1-2.2 1-2.7 1.1-3.6.3-6.2.3-6.2.3s-3.3 0-6.4-.2c-.5-.1-1.6-.1-2.5-1-1-1-1.2-2.5-1.2-2.5s-.2-2-.2-4.1V11.2c0-2.1.2-4.1.2-4.1z"/><path d="m9.7 15.5 6.3-3.6-6.3-3.6z"/></svg>
);
import { useSiteBranding } from "@/components/providers/site-branding-provider";

const shopLinks = [
  { label: "Laptops", href: "/products/laptops" },
  { label: "Smartphones", href: "/products/phones" },
  { label: "Audio & Sound", href: "/products/audio" },
  { label: "Keyboards", href: "/products/keyboards" },
  { label: "On Sale", href: "/deals" },
];

const supportLinks = [
  { label: "Track Order", href: "/support/track-order" },
  { label: "Shipping & Returns", href: "/support/shipping-returns" },
  { label: "Warranty Claims", href: "/support/warranty" },
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Terms of Service", href: "/legal/terms" },
];

const socialLinks = [
  { icon: <MessageCircle className="h-4 w-4" />, href: "#", label: "WhatsApp" },
  { icon: <Share2 className="h-4 w-4" />, href: "#", label: "Facebook" },
  { icon: <Play className="h-4 w-4" />, href: "#", label: "YouTube" },
  { icon: <Send className="h-4 w-4" />, href: "#", label: "Telegram" },
];

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export default function Footer() {
  const { logoUrl, darkLogoUrl, siteName, tagline, digitalCardEnabled } = useSiteBranding();
  const currentYear = new Date().getFullYear();
  const footerLogo = darkLogoUrl || logoUrl;

  return (
    <footer className="bg-neutral-950 text-neutral-400 relative overflow-hidden">
      {/* ── Ambient background orbs ── */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[200px] rounded-full blur-[120px] bg-blue-600/6 pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[150px] rounded-full blur-[100px] bg-indigo-600/5 pointer-events-none" />

      {/* ── Dot texture ── */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* ── Big Brand Name Band ── */}
      <div className="relative border-b border-white/5 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-8 sm:py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Logo + tagline */}
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 py-1 text-xl font-bold tracking-wider text-white select-none"
            >
              <div className="flex items-center gap-2 sm:gap-2.5">
                <span className="text-blue-500 font-black text-2xl sm:text-3xl tracking-tight leading-none">
                  FTC
                </span>
                <span className="hidden sm:inline-block h-5 sm:h-6 w-[1.5px] bg-neutral-400/50 dark:bg-neutral-600 rounded-full" />
                <span className="hidden sm:inline-block text-[11px] sm:text-sm font-bold tracking-[0.22em] sm:tracking-[0.28em] text-neutral-300 dark:text-neutral-300 uppercase leading-none">
                  ELECTRONICS
                </span>
              </div>
            </Link>
            <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
              {tagline || "Sri Lanka's premier destination for premium consumer electronics, mobile gear, and computer hardware."}
            </p>
          </div>

          {/* Social icons + Digital Card link + Back to top */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-2 hidden sm:flex">
              <Link href="#" className="h-9 w-9 rounded-full border border-white/5 bg-white/5 hover:bg-blue-500/20 flex items-center justify-center text-neutral-400 hover:text-blue-400 transition-colors">
                <FacebookIcon className="h-4 w-4" />
              </Link>
              <Link href="#" className="h-9 w-9 rounded-full border border-white/5 bg-white/5 hover:bg-pink-500/20 flex items-center justify-center text-neutral-400 hover:text-pink-400 transition-colors">
                <InstagramIcon className="h-4 w-4" />
              </Link>
              <Link href="#" className="h-9 w-9 rounded-full border border-white/5 bg-white/5 hover:bg-sky-500/20 flex items-center justify-center text-neutral-400 hover:text-sky-400 transition-colors">
                <TwitterIcon className="h-4 w-4" />
              </Link>
              <Link href="#" className="h-9 w-9 rounded-full border border-white/5 bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-neutral-400 hover:text-red-400 transition-colors">
                <YoutubeIcon className="h-4 w-4" />
              </Link>
            </div>
            
            {digitalCardEnabled && (
              <Link
                href="/contact"
                className="h-9 px-3.5 rounded-xl border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-xs font-semibold text-blue-400 hover:text-white flex items-center gap-1.5 transition-all duration-250 hover:scale-105"
                title="Digital Visiting Card & QR Link Hub"
              >
                <Share2 className="h-3.5 w-3.5 text-blue-400" />
                <span>Digital Card</span>
              </Link>
            )}
            <div className="w-px h-6 bg-white/8 mx-1" />
            <button
              onClick={scrollToTop}
              className="h-9 w-9 rounded-xl border border-white/8 bg-white/4 hover:bg-blue-600/20 hover:border-blue-500/30 flex items-center justify-center transition-all duration-250 hover:scale-105 text-neutral-400 hover:text-blue-400 cursor-pointer"
              aria-label="Back to top"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Footer Grid ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-8 sm:py-16">
        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-8 lg:gap-8">
          {/* About Column */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-neutral-400">
              About FTC
            </h3>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed max-w-md">
              High-performance consumer electronics, premium computer hardware,
              and state-of-the-art mobile gear. Engineered for the future.
              Backed by local expertise.
            </p>
          </div>

          {/* Shop & Support Columns Side-by-Side on Mobile */}
          <div className="grid grid-cols-2 gap-6 lg:contents">
            {/* Shop Column */}
            <div className="flex flex-col gap-3">
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-neutral-400">
                Shop
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm">
                {shopLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-neutral-400 hover:text-white transition-colors duration-200 flex items-center gap-1.5 group"
                    >
                      <span className="w-0 group-hover:w-2 h-px bg-blue-500 transition-all duration-300 overflow-hidden" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Support Column */}
            <div className="flex flex-col gap-3">
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-neutral-400">
                Support
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm">
                {supportLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-neutral-400 hover:text-white transition-colors duration-200 flex items-center gap-1.5 group"
                    >
                      <span className="w-0 group-hover:w-2 h-px bg-blue-500 transition-all duration-300 overflow-hidden" />
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter Column */}
          <div className="flex flex-col gap-3 pt-2 lg:pt-0 border-t border-white/5 lg:border-t-0">
            <h3 className="text-[11px] font-mono font-bold uppercase tracking-[0.2em] text-neutral-400">
              Stay Updated
            </h3>
            <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
              Exclusive deals and new product drops straight to your inbox.
            </p>
            <form
              className="flex flex-col gap-2.5 mt-1"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="your@email.com"
                required
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
              <button
                type="submit"
                className="w-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all cursor-pointer hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98]"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Bottom Bar ── */}
      <div className="border-t border-white/5 relative bg-neutral-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-6 pb-12 sm:pb-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <p className="text-center sm:text-left">© {currentYear} FTC Electronics (Pvt) Ltd. All rights reserved.</p>

          {/* Payment method indicators */}
          <div className="flex items-center gap-2">
            <span className="text-neutral-600 text-[10px] uppercase tracking-wider font-mono">
              We Accept
            </span>
            {["VISA", "MC", "AMEX", "KOKO"].map((card) => (
              <span
                key={card}
                className="inline-flex items-center px-2 py-0.5 rounded border border-white/10 bg-white/5 text-neutral-400 text-[9px] font-mono font-bold tracking-wider"
              >
                {card}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
