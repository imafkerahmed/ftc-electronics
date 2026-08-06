'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Tag,
  Star,
  Megaphone,
  LayoutTemplate,
  Settings,
  Settings2,
  Users,
  Image as ImageIcon,
  ChevronLeft,
  LogOut,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ScrollText,
  Boxes,
  Palette,
  ShoppingBag,
  FileText,
  Building2,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/app/actions/auth';
import { clearAllClientSessions } from '@/lib/clear-client-storage';
import { useSiteBranding } from '@/components/providers/site-branding-provider';

interface NavItem {
  name: string;
  href?: string;
  icon: React.ElementType;
  children?: { name: string; href: string }[];
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { name: 'Sales Tracker', href: '/admin/sales', icon: ScrollText },
  { name: 'Quotations', href: '/admin/quotations', icon: FileText },
  { name: 'Wholesale Dealers', href: '/admin/wholesale-dealers', icon: Building2 },
  { name: 'Customer Inquiries', href: '/admin/inquiries', icon: MessageSquare },
  {
    name: 'Catalog',
    icon: Package,
    children: [
      { name: 'Products', href: '/admin/products' },
      { name: 'Categories', href: '/admin/categories' },
      { name: 'Brands', href: '/admin/brands' },
    ],
  },
  { name: 'Stock Management', href: '/admin/inventory', icon: Boxes },
  { name: 'Store POS', href: '/pos', icon: ShoppingBag },
  { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
  { name: 'Customers', href: '/admin/customers', icon: Users },
  { name: 'Reviews', href: '/admin/reviews', icon: Star },
  { name: 'Promotions', href: '/admin/promotions', icon: Tag },
  { name: 'Announcements', href: '/admin/announcements', icon: Megaphone },
  { name: 'Homepage Builder', href: '/admin/homepage', icon: LayoutTemplate },
  { name: 'Media Library', href: '/admin/media', icon: ImageIcon },
  { name: 'Audit Log', href: '/admin/audit-log', icon: ScrollText },
  { name: 'System Configurations', href: '/admin/system-config', icon: Settings2 },
];

import AdminNotificationBell from '@/components/admin/notification-bell';
import { getAdminNotificationsAction } from '@/app/actions/admin';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { logoUrl, darkLogoUrl, siteName } = useSiteBranding();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Catalog: true });
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [newInquiriesCount, setNewInquiriesCount] = useState(0);

  const activeLogo = darkLogoUrl || logoUrl;

  useEffect(() => {
    async function loadAlerts() {
      try {
        const res = await getAdminNotificationsAction();
        if (res.success && res.notifications) {
          setPendingOrdersCount(res.notifications.filter((n) => n.type === 'order').length);
          setNewInquiriesCount(res.notifications.filter((n) => n.type === 'inquiry').length);
        }
      } catch {}
    }
    void loadAlerts();
    const interval = setInterval(() => void loadAlerts(), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutAction();
    } catch { /* ignore */ }
    clearAllClientSessions();
    router.push('/auth');
    router.refresh();
  };

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const isGroupActive = (item: NavItem) =>
    item.children?.some((c) => isActive(c.href)) ?? false;

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground font-sans">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(120,119,198,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,119,198,0.02)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)]" />

      {/* Sidebar */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 border-r border-border bg-card/60 backdrop-blur-md flex flex-col justify-between relative z-10 transition-all duration-300 h-full overflow-y-auto`}
      >
        {/* Logo + collapse toggle */}
        <div>
          <div className="h-14 flex items-center justify-between px-4 border-b border-border">
            {!collapsed && (
              <Link href="/admin/dashboard" className="text-lg font-bold tracking-wider">
                <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">FTC</span>
                <span className="text-muted-foreground font-light mx-1">|</span>
                <span className="text-[11px] uppercase text-foreground/70 tracking-widest">Admin</span>
              </Link>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Toggle sidebar"
            >
              <ChevronLeft className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Nav */}
          <nav className="p-2 space-y-0.5 mt-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              // Group with children
              if (item.children) {
                const groupOpen = openGroups[item.name] ?? false;
                const groupActive = isGroupActive(item);

                return (
                  <div key={item.name}>
                    <button
                      onClick={() => !collapsed && toggleGroup(item.name)}
                      title={collapsed ? item.name : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        groupActive
                          ? 'text-blue-500 bg-blue-500/8'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${groupActive ? 'text-blue-500' : ''}`} />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left">{item.name}</span>
                          <ChevronDown
                            className={`h-3 w-3 transition-transform duration-200 ${groupOpen ? 'rotate-180' : ''}`}
                          />
                        </>
                      )}
                    </button>
                    {!collapsed && groupOpen && (
                      <div className="ml-7 mt-0.5 space-y-0.5 border-l border-border pl-3">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                              isActive(child.href)
                                ? 'text-blue-500 bg-blue-500/10'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                            }`}
                          >
                            {child.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              // Single link
              const active = isActive(item.href!);
              const hasOrderAlert = item.name === 'Orders' && pendingOrdersCount > 0;
              const hasInquiryAlert = item.name === 'Customer Inquiries' && newInquiriesCount > 0;
              const hasAlert = hasOrderAlert || hasInquiryAlert;

              return (
                <Link
                  key={item.name}
                  href={item.href!}
                  title={collapsed ? item.name : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors relative ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Icon className="h-4 w-4 shrink-0" />
                    {collapsed && hasAlert && (
                      <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${hasOrderAlert ? 'bg-amber-400' : 'bg-blue-400'} opacity-75`} />
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${hasOrderAlert ? 'bg-amber-500' : 'bg-blue-500'}`} />
                      </span>
                    )}
                  </div>

                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.name}</span>
                      {hasOrderAlert && (
                        <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-500">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                          </span>
                          New ({pendingOrdersCount})
                        </span>
                      )}
                      {hasInquiryAlert && (
                        <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-[10px] font-bold text-blue-500">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                          </span>
                          New ({newInquiriesCount})
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom actions */}
        <div className="p-2 border-t border-border space-y-0.5">
          <Link
            href="/"
            title={collapsed ? 'Return to Store' : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Return to Store</span>}
          </Link>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Log Out' : undefined}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main id="admin-main" className="flex-1 overflow-y-auto relative z-10">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card/40 backdrop-blur-md flex items-center px-6 gap-4 sticky top-0 z-20">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <AdminNotificationBell />
            <div className="h-4 w-px bg-border/60 mx-1" />
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
              A
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-foreground leading-none">Admin User</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Super Admin</p>
            </div>
          </div>
        </header>

        <div className="p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}
