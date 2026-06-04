'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, Search, Menu, User } from 'lucide-react';
import { useCart } from '@/hooks/use-cart';
import { useUiStore } from '@/store/use-ui-store';
import { Button } from '@/components/ui/button';

export default function Navbar() {
  const pathname = usePathname();
  const { cartCount } = useCart();
  const toggleCartDrawer = useUiStore((state) => state.toggleCartDrawer);
  const toggleMobileNav = useUiStore((state) => state.toggleMobileNav);

  const isActive = (path: string) => pathname === path;

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Shop All', href: '/products' },
    { name: 'Laptops', href: '/products?category=laptops' },
    { name: 'Phones', href: '/products?category=phones' },
    { name: 'Audio', href: '/products?category=audio' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Mobile Hamburger menu */}
        <div className="flex items-center md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMobileNav}
            aria-label="Toggle Mobile Menu"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        {/* Brand Logo */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-wider text-foreground">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FTC</span>
            <span className="text-muted-foreground font-light">|</span>
            <span className="text-xs uppercase tracking-widest text-foreground/80">Electronics</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-8">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-foreground ${
                  active ? 'text-blue-600' : 'text-muted-foreground'
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Right side utility icons */}
        <div className="flex items-center space-x-4">
          
          {/* Quick search input trigger */}
          <Link href="/products" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Search Catalog">
            <Search className="h-5 w-5" />
          </Link>

          {/* Account portal Link */}
          <Link href="/account/profile" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="User Account">
            <User className="h-5 w-5" />
          </Link>

          {/* Cart triggers Zustand Cart Slider Drawer */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCartDrawer}
            className="relative text-muted-foreground hover:text-foreground hover:bg-muted/50"
            aria-label="Open Shopping Cart"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-background">
                {cartCount}
              </span>
            )}
          </Button>

        </div>
      </div>
    </header>
  );
}
