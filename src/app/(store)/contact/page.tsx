import { Metadata } from 'next';
import { Mail, Phone, MapPin, Clock, MessageSquare } from 'lucide-react';
import LocationMap from '@/components/layout/location-map';

export const metadata: Metadata = {
  title: 'Contact Us | FTC Electronics Sri Lanka',
  description: 'Get in touch with FTC Electronics. Visit our store in Colombo, call our support line, or send us a message on WhatsApp.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/contact' },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <div className="relative mb-12 rounded-3xl overflow-hidden bg-card border border-border px-6 py-10 sm:px-10">
        <div className="mb-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400" />
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
          Contact Us
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          Have a question about product specifications, warranty, or order status? We are here to help. Contact our team or visit our store in Colombo.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
        {/* Left Column: Contact Details */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-card border border-border/70 space-y-6">
            <h3 className="text-lg font-bold text-foreground">Customer Support</h3>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Store Address</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  123 Tech Avenue, Majestic City / Liberty Plaza Area, Colombo 03, Sri Lanka
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Phone Hotline</h4>
                <p className="text-xs text-muted-foreground mt-1">+94 77 123 4567 / +94 11 234 5678</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Email Inquiry</h4>
                <p className="text-xs text-muted-foreground mt-1">support@ftcelectronics.lk</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Store Hours</h4>
                <p className="text-xs text-muted-foreground mt-1">Monday - Saturday: 9:30 AM - 7:00 PM</p>
                <p className="text-xs text-muted-foreground">Sunday: Closed</p>
              </div>
            </div>
          </div>

          <a
            href="https://wa.me/94771234567?text=Hi%20FTC%20Electronics%2C%20I%20have%20an%20inquiry"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl py-3.5 transition-colors shadow-lg shadow-emerald-600/20"
          >
            <MessageSquare className="h-4 w-4" />
            Chat on WhatsApp
          </a>
        </div>

        {/* Right Column: Contact Form */}
        <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl bg-card border border-border">
          <h3 className="text-lg font-bold text-foreground mb-6">Send Us a Message</h3>
          <form className="space-y-4">
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
                Subject
              </label>
              <input
                type="text"
                required
                placeholder="Inquiry about laptop warranty / stock"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground uppercase tracking-wider mb-1.5">
                Message
              </label>
              <textarea
                rows={5}
                required
                placeholder="Write your message here..."
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl py-3.5 transition-colors cursor-pointer"
            >
              Submit Message
            </button>
          </form>
        </div>
      </div>

      {/* Store Location Map */}
      <div className="border-t border-border pt-12">
        <h3 className="text-xl font-bold text-foreground mb-6">Find Our Store</h3>
        <LocationMap />
      </div>
    </div>
  );
}
