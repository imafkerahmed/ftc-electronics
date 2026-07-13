import { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Award, Truck, CreditCard, Store, Users, CheckCircle2 } from 'lucide-react';
import { OrganizationJsonLd } from '@/components/seo/json-ld';

export const metadata: Metadata = {
  title: 'About Us | FTC Electronics Sri Lanka',
  description: 'Learn about FTC Electronics — Sri Lanka’s trusted authorized retailer for laptops, smartphones, audio gear, and gaming hardware.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/about' },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <OrganizationJsonLd />

      {/* Hero Header */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-card via-card to-blue-955/30 border border-border px-6 py-12 sm:px-12 sm:py-16 mb-16 text-center sm:text-left">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
        <div className="pointer-events-none absolute -top-12 -right-12 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="max-w-3xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold tracking-wider uppercase mb-4">
            <Award className="h-4 w-4" /> Authorized Sri Lankan Tech Retailer
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-foreground leading-tight">
            Empowering Sri Lanka with Next-Gen Technology
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mt-4">
            At FTC Electronics, we connect tech enthusiasts, gamers, and professionals with 100% genuine electronics backed by official agent warranties and flexible payment options.
          </p>
        </div>
      </div>

      {/* 4 Pillars of Trust */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <div className="p-6 rounded-2xl bg-card border border-border/70 flex flex-col items-start hover:border-blue-500/40 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-4">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">100% Authentic</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All products are sourced directly from authorized agent distributors with official Sri Lankan warranties.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border/70 flex flex-col items-start hover:border-blue-500/40 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-4">
            <CreditCard className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">0% Installments</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Buy now and pay later in 3 interest-free monthly installments using Koko or Mintpay debit cards.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border/70 flex flex-col items-start hover:border-blue-500/40 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-4">
            <Truck className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">Islandwide Shipping</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Fast, secure, and insured delivery to your doorstep anywhere across Sri Lanka within 1 to 3 business days.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border/70 flex flex-col items-start hover:border-blue-500/40 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-4">
            <Store className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground mb-1">Physical Store</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Visit our physical experience store in Colombo to demo products and receive expert advice before purchasing.
          </p>
        </div>
      </div>

      {/* Our Story & Guarantee */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center mb-16">
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Why FTC Electronics?
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Founded with a commitment to transparency and technical excellence, FTC Electronics has grown to become one of Sri Lanka&apos;s leading destinations for premium computing and mobile hardware.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Whether you are looking for high-performance gaming laptops from Asus and MSI, flagships from Xiaomi and Apple, or workspace peripherals from Keychron, we ensure that every customer receives uncompromised quality and dedicated after-sales support.
          </p>

          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              'Direct Brand Partnerships',
              'Dedicated Tech Specialists',
              'Hassle-Free Warranty Claims',
              'Transparent Pricing (No Hidden Fees)',
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 p-8 rounded-3xl bg-card border border-border space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-xl font-black">
              FTC
            </div>
            <div>
              <h4 className="text-base font-bold text-foreground">FTC Experience Center</h4>
              <p className="text-xs text-muted-foreground">Colombo, Sri Lanka</p>
            </div>
          </div>
          <div className="border-t border-border/60 pt-4 space-y-2 text-xs text-muted-foreground">
            <p><strong className="text-foreground">Opening Hours:</strong> Mon - Sat: 9:30 AM - 7:00 PM</p>
            <p><strong className="text-foreground">Support Line:</strong> +94 77 123 4567</p>
            <p><strong className="text-foreground">Email:</strong> support@ftcelectronics.lk</p>
          </div>
          <Link
            href="/contact"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl py-3 transition-colors"
          >
            Get In Touch
          </Link>
        </div>
      </div>
    </div>
  );
}
