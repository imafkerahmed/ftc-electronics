'use client';

import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/30 text-muted-foreground">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Logo and Description */}
          <div className="flex flex-col space-y-4">
            <Link href="/" className="text-xl font-bold tracking-wider text-foreground">
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FTC</span>
              <span className="text-muted-foreground font-light">|</span>
              <span className="text-xs uppercase tracking-widest text-foreground/80">Electronics</span>
            </Link>
            <p className="text-sm text-muted-foreground/80">
              High-performance consumer electronics, premium computer hardware, and state-of-the-art mobile gear. Engineered for the future.
            </p>
          </div>

          {/* Shop Categories */}
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Shop</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/products?category=laptops" className="hover:text-foreground transition-colors">Laptops</Link></li>
              <li><Link href="/products?category=phones" className="hover:text-foreground transition-colors">Phones</Link></li>
              <li><Link href="/products?category=audio" className="hover:text-foreground transition-colors">Audio & Sound</Link></li>
              <li><Link href="/products?category=keyboards" className="hover:text-foreground transition-colors">Keyboards</Link></li>
            </ul>
          </div>

          {/* Customer Service Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Support</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/coming-soon" className="hover:text-foreground transition-colors">Track Order</Link></li>
              <li><Link href="/coming-soon" className="hover:text-foreground transition-colors">Shipping & Returns</Link></li>
              <li><Link href="/coming-soon" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
              <li><Link href="/coming-soon" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
            </ul>
          </div>

          {/* Newsletter signup */}
          <div>
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Stay Updated</h3>
            <p className="text-sm text-muted-foreground/80 mb-3">Subscribe to receive exclusive deals and new product releases.</p>
            <form className="flex space-x-2" onSubmit={(e) => e.preventDefault()}>
              <input
                type="email"
                placeholder="Enter email..."
                required
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded text-foreground focus:outline-none focus:border-blue-600 placeholder-muted-foreground/60"
              />
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold uppercase bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors cursor-pointer"
              >
                Join
              </button>
            </form>
          </div>
        </div>

        {/* Copyright section */}
        <div className="border-t border-border/40 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground/60">
          <p>© {currentYear} FTC Electronics. All rights reserved.</p>
          <div className="flex space-x-6 mt-4 sm:mt-0">
            <Link href="/admin/dashboard" className="hover:text-foreground transition-colors">Admin Portal</Link>
            <Link href="/coming-soon" className="hover:text-foreground transition-colors">Sitemap</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
