'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User, ShoppingBag, LogOut, ArrowLeft } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { pb } from '@/lib/pocketbase';
import { clearAllClientSessions } from '@/lib/clear-client-storage';

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await logoutAction();
    } catch (err) {
      console.error('Failed to invalidate server session:', err);
    }

    pb.authStore.clear();
    clearAllClientSessions();
    // Immediately tell the navbar to re-check auth state
    window.dispatchEvent(new Event('auth-change'));
    router.refresh();
    router.push('/');
  };

  const menuItems = [
    { name: 'My Profile', href: '/account/profile', icon: User },
    { name: 'Order History', href: '/account/orders', icon: ShoppingBag },
  ];

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8 lg:px-8 text-foreground">
      {/* Account Page Header */}
      <div className="border-b border-border pb-4 mb-6 sm:mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">Customer Account</h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
            Manage your personal profile and view order history.
          </p>
        </div>
        <Link
          href="/"
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Store
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
        {/* Navigation Bar / Sidebar */}
        <nav className="w-full md:w-64 shrink-0 bg-card border border-border rounded-xl p-2.5 sm:p-4 flex flex-row md:flex-col gap-1.5 justify-between md:justify-start overflow-x-auto">
          <div className="flex flex-row md:flex-col gap-1.5 flex-1 min-w-0">
            <Link
              href="/"
              className="flex md:hidden items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border/60 shrink-0"
              aria-label="Back to Store"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Store</span>
            </Link>

            {menuItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center md:justify-start gap-2 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-colors border-l md:border-l-0 md:border-t border-border pl-3 md:pl-3 md:pt-4 md:mt-2 cursor-pointer shrink-0"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline md:inline">Sign Out</span>
          </button>
        </nav>

        {/* Dynamic Inner Page */}
        <div className="flex-1 w-full bg-card border border-border rounded-xl p-4 sm:p-6 md:p-8 min-h-[360px]">
          {children}
        </div>
      </div>
    </div>
  );
}
