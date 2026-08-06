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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      {/* Title */}
      <div className="border-b border-border pb-5 mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Customer Account</h1>
          <p className="text-xs text-muted-foreground mt-1">View your profile details and order history.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Navigation Sidebar */}
        <nav className="w-full md:w-64 shrink-0 bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mb-2 border-b border-border pb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Store
          </Link>
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

          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors mt-4 border-t border-border pt-4 cursor-pointer text-left w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </nav>

        {/* Dynamic Inner Page */}
        <div className="flex-1 w-full bg-card border border-border rounded-xl p-6 md:p-8 min-h-[400px]">
          {children}
        </div>
      </div>
    </div>
  );
}
