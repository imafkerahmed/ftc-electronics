'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { useUiStore } from '@/store/use-ui-store';
import { Button } from '@/components/ui/button';

export default function MobileNav() {
  const pathname = usePathname();
  const isOpen = useUiStore((state) => state.isMobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);

  const closeMenu = () => setMobileNavOpen(false);

  if (!isOpen) return null;

  const links = [
    { name: 'Home', href: '/' },
    { name: 'Shop All', href: '/products' },
    { name: 'Laptops', href: '/products?category=laptops' },
    { name: 'Phones', href: '/products?category=phones' },
    { name: 'Audio', href: '/products?category=audio' },
    { name: 'My Account', href: '/account/profile' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex md:hidden">
      {/* Semi-transparent Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={closeMenu}
      />

      {/* Drawer Panel */}
      <div className="relative flex w-full max-w-xs flex-col bg-background border-r border-border p-6 text-foreground shadow-2xl animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-lg font-bold tracking-wider" onClick={closeMenu}>
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FTC</span>
            <span className="text-muted-foreground/45 font-light"> | </span>
            <span className="text-xs uppercase text-foreground/80">Electronics</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={closeMenu}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* Menu Links */}
        <nav className="flex flex-col space-y-6">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                onClick={closeMenu}
                className={`text-lg font-medium transition-colors hover:text-blue-650 ${
                  active ? 'text-blue-650' : 'text-muted-foreground'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Utility (Admin Portal Shortcut) */}
        <div className="mt-auto border-t border-border pt-6">
          <Link
            href="/admin/dashboard"
            onClick={closeMenu}
            className="block text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            Merchant Panel
          </Link>
        </div>
      </div>
    </div>
  );
}
