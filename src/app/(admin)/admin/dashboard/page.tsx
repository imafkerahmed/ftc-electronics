'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, ShoppingCart, ShieldAlert, TrendingUp, Loader2, ScrollText } from 'lucide-react';
import { pbOrders, pbProducts, pbAuditLog } from '@/lib/pb-collections';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [allOrders, allProductsList, auditLogs] = await Promise.all([
        pbOrders.getAll(),
        pbProducts.getAll({ perPage: 100 }),
        pbAuditLog.getAll({ perPage: 5 }),
      ]);

      // 1. Calculate revenue and average order value
      const ordersList = allOrders?.items || [];
      const paidOrders = ordersList.filter((o: any) => o.isPaid === true);
      const totalRev = paidOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
      setTotalRevenue(totalRev);
      setOrdersCount(ordersList.length);
      setAvgOrderValue(ordersList.length > 0 ? totalRev / ordersList.length : 0);

      // 2. Count low stock items (<= 5)
      const lowStock = (allProductsList.items || []).filter((p: any) => p.countInStock <= 5);
      setLowStockCount(lowStock.length);

      // 3. Map recent logs
      setRecentLogs((auditLogs.items || []).map((l: any) => ({
        id: l.id,
        actor: l.actor || 'System',
        action: l.action || 'update',
        collection: l.collection || 'system',
        recordId: l.recordId || '-',
        date: new Date(l.created).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })));
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const stats = [
    {
      name: 'Total Revenue',
      value: totalRevenue.toLocaleString('en-US', { style: 'currency', currency: 'LKR' }),
      change: 'Dynamic Live',
      icon: DollarSign,
      color: 'text-emerald-500',
    },
    {
      name: 'All Orders Count',
      value: ordersCount.toString(),
      change: 'Dynamic Live',
      icon: ShoppingCart,
      color: 'text-blue-500',
    },
    {
      name: 'Avg Order Value',
      value: avgOrderValue.toLocaleString('en-US', { style: 'currency', currency: 'LKR' }),
      change: 'Dynamic Live',
      icon: TrendingUp,
      color: 'text-indigo-500',
    },
    {
      name: 'Low Stock Alerts',
      value: `${lowStockCount} items`,
      change: lowStockCount > 0 ? 'Action Required' : 'Healthy Stock',
      icon: ShieldAlert,
      color: lowStockCount > 0 ? 'text-red-500 animate-pulse' : 'text-emerald-500',
    },
  ];

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="h-7 w-7 animate-spin mb-3 text-blue-500" />
        <span className="font-semibold">Loading merchant statistics dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-foreground">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-wide">Merchant Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-1">Overview of store sales performance and inventory warnings.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
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
                <span className={`text-[10px] font-bold block ${stat.name === 'Low Stock Alerts' && lowStockCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
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
        <h3 className="text-base font-bold tracking-wide mb-4 flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-indigo-500" />
          Recent Operations Activity
        </h3>
        {recentLogs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No recent activity logs found.</p>
        ) : (
          <div className="divide-y divide-border">
            {recentLogs.map((log) => (
              <div key={log.id} className="py-3.5 flex items-center justify-between text-xs transition-colors hover:bg-muted/5 px-2 -mx-2 rounded-lg">
                <div>
                  <p className="font-semibold text-foreground">
                    Actor <span className="text-blue-500">@{log.actor}</span> performed <span className="capitalize font-bold text-indigo-400">{log.action}</span> on collection <span className="capitalize text-foreground">{log.collection}</span>
                  </p>
                  <p className="text-muted-foreground mt-0.5">Record ID: {log.recordId} • {log.date}</p>
                </div>
                <span className="text-muted-foreground font-mono text-[10px] bg-secondary border border-border px-1.5 py-0.5 rounded shrink-0">{log.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
