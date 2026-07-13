"use client";

import Link from "next/link";
import { ArrowUp, MessageCircle, Share2, Play, Send } from "lucide-react";

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
  const currentYear = new Date().getFullYear();

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
              className="text-3xl sm:text-4xl font-black tracking-widest text-white uppercase flex items-center gap-3"
            >
              <span className="text-blue-500">FTC</span>
              <span className="text-white/20 font-light">|</span>
              <span className="text-sm sm:text-base font-bold tracking-widest text-white/60 uppercase">
                Electronics
              </span>
            </Link>
            <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
              Sri Lanka&apos;s premier destination for premium consumer
              electronics, mobile gear, and computer hardware.
            </p>
          </div>

          {/* Social icons + Back to top */}
          <div className="flex items-center gap-3">
            {socialLinks.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 w-9 rounded-xl border border-white/8 bg-white/4 hover:bg-white/10 hover:border-white/15 flex items-center justify-center transition-all duration-250 hover:scale-105 text-neutral-400 hover:text-white"
              >
                {s.icon}
              </a>
            ))}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-8">
          {/* About Column */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-neutral-500">
              About FTC
            </h3>
            <p className="text-sm text-neutral-500 leading-relaxed">
              High-performance consumer electronics, premium computer hardware,
              and state-of-the-art mobile gear. Engineered for the future.
              Backed by local expertise.
            </p>
          </div>

          {/* Shop Column */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-neutral-500">
              Shop
            </h3>
            <ul className="space-y-2.5 text-sm">
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
          <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-neutral-500">
              Support
            </h3>
            <ul className="space-y-2.5 text-sm">
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

          {/* Newsletter Column */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-neutral-500">
              Stay Updated
            </h3>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Exclusive deals and new product drops straight to your inbox.
            </p>
            <form
              className="flex flex-col gap-2.5"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="your@email.com"
                required
                className="w-full px-3.5 py-2.5 text-sm bg-white/5 border border-white/8 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500/40 focus:bg-white/8 transition-all"
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
      <div className="border-t border-white/5 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-600">
          <p>© {currentYear} FTC Electronics (Pvt) Ltd. All rights reserved.</p>

          {/* Payment method indicators */}
          <div className="flex items-center gap-2">
            <span className="text-neutral-700 text-[10px] uppercase tracking-wider font-mono">
              We Accept
            </span>
            {["VISA", "MC", "AMEX", "KOKO"].map((card) => (
              <span
                key={card}
                className="inline-flex items-center px-2 py-0.5 rounded border border-white/8 bg-white/4 text-neutral-500 text-[9px] font-mono font-bold tracking-wider"
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
