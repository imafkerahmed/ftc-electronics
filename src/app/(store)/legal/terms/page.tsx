import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | FTC Electronics Sri Lanka',
  description: 'Terms and conditions governing purchases, pricing, installment payments, and site usage at FTC Electronics.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/legal/terms' },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <div className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">
          Terms of Service
        </h1>
        <p className="text-xs text-muted-foreground">Last updated: July 2026</p>
      </div>

      <div className="space-y-6 text-xs text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">1. Terms of Sale</h2>
          <p>
            All products displayed on FTC Electronics are subject to stock availability. Prices listed are in Sri Lankan Rupees (LKR) or USD as specified and include applicable local taxes unless otherwise stated.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">2. Pricing & Typographical Errors</h2>
          <p>
            While we strive for 100% pricing accuracy, in the rare event of a system glitch or typographical error resulting in an incorrect price, FTC Electronics reserves the right to cancel or modify orders prior to dispatch, with full refund issued immediately.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">3. Installment Payment Terms (Koko / Mintpay)</h2>
          <p>
            Installment plans processed via Koko or Mintpay are subject to the respective provider&apos;s credit assessment and terms. Failure to meet installment due dates may incur late charges assessed directly by Koko or Mintpay.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">4. Intellectual Property</h2>
          <p>
            All brand logos, trademarks, images, and content displayed on this website belong to their respective manufacturer owners or FTC Electronics and may not be reproduced without written consent.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">5. Governing Law</h2>
          <p>
            These terms are governed by and construed in accordance with the laws of the Democratic Socialist Republic of Sri Lanka.
          </p>
        </section>
      </div>
    </div>
  );
}
