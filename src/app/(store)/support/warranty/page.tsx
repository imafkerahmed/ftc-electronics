import { Metadata } from 'next';
import { ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Warranty Policy & Claims | FTC Electronics Sri Lanka',
  description: 'Understand FTC Electronics official agent warranty terms, coverage details, and claim procedures for hardware.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/support/warranty' },
};

export default function WarrantyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <div className="mb-10">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 mb-4">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-3">
          Official Agent Warranty Policy
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every device sold by FTC Electronics carries authentic Sri Lankan agent warranty or direct manufacturer warranty coverage.
        </p>
      </div>

      <div className="space-y-8">
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border space-y-4">
          <h2 className="text-xl font-bold text-foreground">Standard Coverage Terms</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-background border border-border/80">
              <span className="font-bold text-foreground block mb-1">Laptops & Desktops</span>
              <span className="text-muted-foreground">1 to 2 Years Hardware & Motherboard Warranty</span>
            </div>
            <div className="p-4 rounded-xl bg-background border border-border/80">
              <span className="font-bold text-foreground block mb-1">Smartphones & Tablets</span>
              <span className="text-muted-foreground">1 Year Official Agent Warranty</span>
            </div>
            <div className="p-4 rounded-xl bg-background border border-border/80">
              <span className="font-bold text-foreground block mb-1">Accessories & Peripherals</span>
              <span className="text-muted-foreground">6 Months to 1 Year Replacement Warranty</span>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border space-y-4">
          <h3 className="text-base font-bold text-foreground">What Is Covered?</h3>
          <div className="space-y-2">
            {[
              'Internal hardware failures under normal intended operation',
              'Display panel defects (lines, dead pixels exceeding manufacturer thresholds)',
              'Battery failures occurring within the 6-month battery warranty period',
              'Power supply unit (PSU) and charging adapter defects',
            ].map((covered, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{covered}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border space-y-4">
          <div className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-base font-bold text-foreground">Warranty Exclusions</h3>
          </div>
          <div className="space-y-2">
            {[
              'Physical damage resulting from drops, accidents, or misuse',
              'Liquid ingress, corrosion, or exposure to moisture',
              'Power surges or electrical damage caused by un-grounded outlets',
              'Software glitches, OS corruption, or virus/malware issues',
              'Removal or tampering of warranty void security stickers',
            ].map((exclusion, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-rose-500 font-bold shrink-0">•</span>
                <span>{exclusion}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border space-y-3">
          <h3 className="text-base font-bold text-foreground">How to Claim Warranty</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Bring your device along with the serial number and original invoice to our Colombo service desk. For outstation customers, you can ship the unit directly to our service center after contacting <strong className="text-foreground">support@ftcelectronics.lk</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
