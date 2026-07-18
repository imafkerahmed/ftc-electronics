import React from 'react';
import Link from 'next/link';
import { Settings2, Store, Printer, Palette, ChevronRight, ArrowRight } from 'lucide-react';

export default function SystemConfigHubPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title Header */}
      <div className="border-b border-border pb-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 bg-violet-500/10 rounded-xl flex items-center justify-center">
            <Settings2 className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">System Configurations</h1>
            <p className="text-xs text-muted-foreground">Select a configuration category below to manage store settings, branding, themes, and printing layouts.</p>
          </div>
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">

        {/* Card 1: General & Store Information */}
        <Link
          href="/admin/system-config/general"
          className="group bg-card border border-border hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-200 rounded-2xl p-6 flex flex-col justify-between space-y-6 cursor-pointer"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 bg-blue-500/10 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                <Store className="h-6 w-6 text-blue-500" />
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground group-hover:text-blue-500 transition-colors">
                General & Store Information
              </h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Configure storefront identity, contact emails, phone hotlines, operating hours, base currency, and default tax rates.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
            <span>Manage Store Settings</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Card 2: Personalization & Theme */}
        <Link
          href="/admin/system-config/personalization"
          className="group bg-card border border-border hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-200 rounded-2xl p-6 flex flex-col justify-between space-y-6 cursor-pointer"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 bg-purple-500/10 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                <Palette className="h-6 w-6 text-purple-500" />
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground group-hover:text-purple-500 transition-colors">
                Personalization & Theme
              </h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Customize store logos, primary accent color palette, fonts, corner radius, design aesthetic, and announcement banners.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-purple-600 dark:text-purple-400">
            <span>Customize Theme & Logos</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

        {/* Card 3: Printer Presets */}
        <Link
          href="/admin/system-config/printer-presets"
          className="group bg-card border border-border hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-200 rounded-2xl p-6 flex flex-col justify-between space-y-6 cursor-pointer"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                <Printer className="h-6 w-6 text-emerald-500" />
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground group-hover:text-emerald-500 transition-colors">
                Printer Presets
              </h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Configure barcode sticker label sizes, 3-up sticker rolls, 80mm POS receipts, and A4 Sales Invoices & Quotations.
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span>Configure Labels & Receipts</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>

      </div>
    </div>
  );
}
