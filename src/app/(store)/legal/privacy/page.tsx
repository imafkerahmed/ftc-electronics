import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | FTC Electronics Sri Lanka',
  description: 'Read the FTC Electronics privacy policy regarding data collection, payment security, and customer privacy.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/legal/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <div className="mb-8 border-b border-border pb-6">
        <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">
          Privacy Policy
        </h1>
        <p className="text-xs text-muted-foreground">Last updated: July 2026</p>
      </div>

      <div className="space-y-6 text-xs text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">1. Information We Collect</h2>
          <p>
            When you place an order, create an account, or contact customer service at FTC Electronics, we collect personal information necessary to process your transaction, including your name, shipping address, phone number, email address, and order details.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">2. Payment Security</h2>
          <p>
            Payment processing for credit cards, debit cards, Koko, and Mintpay installments is handled by PCI-DSS compliant payment gateways. FTC Electronics does not store your credit card numbers or banking passwords on our servers.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">3. How We Use Your Information</h2>
          <p>
            Your information is used strictly for order fulfillment, courier delivery updates via SMS/email, warranty verification, and customer service inquiries. We do not sell or trade customer personal data to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">4. Cookies & Analytics</h2>
          <p>
            We use essential session cookies and anonymous web analytics (Google Analytics / Microsoft Clarity) to improve site performance, search UX, and browsing experience.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-2">5. Contact Us Regarding Privacy</h2>
          <p>
            If you have questions about your personal data or wish to request account data deletion, please contact privacy@ftcelectronics.lk.
          </p>
        </section>
      </div>
    </div>
  );
}
