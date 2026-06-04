'use client';

import { DollarSign, ShoppingCart, ShieldAlert, TrendingUp } from 'lucide-react';

export default function AdminDashboardPage() {
  const stats = [
    {
      name: 'Total Revenue',
      value: '$48,290.00',
      change: '+12.5%',
      icon: DollarSign,
      color: 'text-emerald-500',
    },
    {
      name: 'Monthly Orders',
      value: '184',
      change: '+8.2%',
      icon: ShoppingCart,
      color: 'text-blue-500',
    },
    {
      name: 'Avg Order Value',
      value: '$262.44',
      change: '+3.1%',
      icon: TrendingUp,
      color: 'text-indigo-500',
    },
    {
      name: 'Low Stock Alerts',
      value: '2 items',
      change: 'Urgent Action',
      icon: ShieldAlert,
      color: 'text-amber-500',
    },
  ];

  return (
    <div className="space-y-8 text-foreground">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-wide">Merchant Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-1">Overview of store sales performance and inventory warnings.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.name}
              className="bg-card border border-border rounded-xl p-5 flex items-center justify-between"
            >
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block font-semibold uppercase tracking-wider">{stat.name}</span>
                <span className="text-xl font-bold block">{stat.value}</span>
                <span className={`text-[10px] font-bold block ${stat.name === 'Low Stock Alerts' ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {stat.change}
                </span>
              </div>
              <div className={`p-3 bg-secondary/40 border border-border rounded-lg ${stat.color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent activity block */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-base font-bold tracking-wide mb-4">Recent Operations Activity</h3>
        <div className="divide-y divide-border">
          <div className="py-3.5 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-foreground">Order #FTC-92048 was marked as Shipped</p>
              <p className="text-muted-foreground mt-0.5">Carrier: UPS • Today, 11:24 AM</p>
            </div>
            <span className="text-muted-foreground font-semibold">$2,299.00</span>
          </div>
          <div className="py-3.5 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-foreground">New Payment Intent received from Customer</p>
              <p className="text-muted-foreground mt-0.5">Method: Stripe (Card) • Today, 10:15 AM</p>
            </div>
            <span className="text-muted-foreground font-semibold">$349.00</span>
          </div>
          <div className="py-3.5 flex items-center justify-between text-xs">
            <div>
              <p className="font-semibold text-foreground">Stock Threshold Alert: KeyForge Q1 Mechanical Keyboard</p>
              <p className="text-amber-500 mt-0.5">Current Stock: 8 items remaining • Yesterday</p>
            </div>
            <span className="text-muted-foreground font-semibold">SKU-38290</span>
          </div>
        </div>
      </div>
    </div>
  );
}
