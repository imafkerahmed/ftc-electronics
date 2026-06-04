'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, ShoppingBag, LogOut } from 'lucide-react';

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const menuItems = [
    { name: 'My Profile', href: '/account/profile', icon: User },
    { name: 'Order History', href: '/account/orders', icon: ShoppingBag },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      {/* Title */}
      <div className="border-b border-border pb-5 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Customer Portal</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Navigation Sidebar */}
        <nav className="w-full md:w-64 shrink-0 bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
          {menuItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
          
          <Link
            href="/coming-soon"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-red-650 transition-colors mt-4 border-t border-border pt-4"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Link>
        </nav>

        {/* Dynamic Inner Page */}
        <div className="flex-1 w-full bg-card border border-border rounded-xl p-6 md:p-8 min-h-[400px]">
          {children}
        </div>
      </div>
    </div>
  );
}
