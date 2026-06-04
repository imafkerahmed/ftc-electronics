'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, ChevronRight } from 'lucide-react';

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const steps = [
    { name: 'Shipping', active: pathname.includes('/shipping') || pathname.includes('/payment') || pathname.includes('/confirmation') },
    { name: 'Payment', active: pathname.includes('/payment') || pathname.includes('/confirmation') },
    { name: 'Confirmation', active: pathname.includes('/confirmation') },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground flex flex-col justify-between font-sans">
      {/* Premium Background Grid & Gradients */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(120,119,198,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,119,198,0.02)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)]" />

      {/* Checkout Minimal Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md py-4 relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-wider">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FTC</span>
            <span className="text-muted-foreground font-light"> | </span>
            <span className="text-xs uppercase text-foreground/80 tracking-widest">Checkout</span>
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold bg-muted/60 border border-border px-3 py-1.5 rounded-full">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Secure 256-bit SSL</span>
          </div>
        </div>
      </header>

      {/* Checkout Progress Bar Indicators */}
      <div className="bg-muted/40 border-b border-border py-3 text-xs relative z-10">
        <div className="mx-auto max-w-xl px-4 flex items-center justify-center gap-4 text-muted-foreground">
          {steps.map((step, idx) => (
            <div key={step.name} className="flex items-center gap-4">
              <span className={`font-semibold ${step.active ? 'text-blue-650' : 'text-muted-foreground/60'}`}>
                {step.name}
              </span>
              {idx < steps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
            </div>
          ))}
        </div>
      </div>

      {/* Main Checkout Area */}
      <main className="flex-grow py-8 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 relative z-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground/80 relative z-10">
        <p>© {new Date().getFullYear()} FTC Electronics. All transactions are securely processed.</p>
      </footer>
    </div>
  );
}
