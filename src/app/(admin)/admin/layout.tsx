'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, ClipboardList, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const links = [
    { name: 'Dashboard Home', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Product Inventory', href: '/admin/inventory', icon: Database },
    { name: 'Customer Orders', href: '/admin/orders', icon: ClipboardList },
  ];

  return (
    <div className="relative flex min-h-screen bg-background text-foreground font-sans">
      {/* Premium Background Grid & Gradients */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(120,119,198,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,119,198,0.02)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)]" />

      {/* Sidebar navigation */}
      <aside className="w-64 border-r border-border bg-card/60 backdrop-blur-md p-6 flex flex-col justify-between shrink-0 relative z-10">
        <div className="space-y-8">
          <div>
            <Link href="/" className="text-xl font-bold tracking-wider">
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FTC</span>
              <span className="text-muted-foreground font-light"> | </span>
              <span className="text-xs uppercase text-foreground/80 tracking-widest">Admin</span>
            </Link>
          </div>

          <nav className="flex flex-col gap-2">
            {links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-blue-650 text-white'
                      : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {link.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="w-full flex items-center gap-2 justify-start text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 pl-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Return Storefront
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto p-8 md:p-10 relative z-10">{children}</main>
    </div>
  );
}
