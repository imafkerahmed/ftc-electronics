"use client";

import React, { useState, useEffect } from "react";
import {
  DollarSign,
  ShoppingCart,
  ShieldAlert,
  TrendingUp,
  Loader2,
  ScrollText,
} from "lucide-react";
import {
  getAdminDashboardMetricsAction,
  getLowStockProductsCountAction,
  getAdminAuditLogsAction,
} from "@/app/actions/admin";
import { adminKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";

export default function AdminDashboardPage() {
  const { data, isLoading: loading } = useQuery({
    queryKey: adminKeys.dashboard(),
    queryFn: async () => {
      const [metricsRes, lowStockRes, auditRes] = await Promise.all([
        getAdminDashboardMetricsAction(),
        getLowStockProductsCountAction(5),
        getAdminAuditLogsAction(5),
      ]);

      const logItems = auditRes.success && Array.isArray(auditRes.data) ? auditRes.data : [];

      return {
        metrics: metricsRes.success && metricsRes.data ? metricsRes.data : { totalRevenue: 0, ordersCount: 0, avgOrderValue: 0 },
        lowStockCount: lowStockRes.success ? lowStockRes.count : 0,
        recentLogs: logItems.map((l: any) => ({
          id: l.id,
          actor: l.actor || "System",
          action: l.action || "update",
          collection: l.collection || "system",
          recordId: l.recordId || "-",
          date: new Date(l.created).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        }))
      };
    }
  });

  const totalRevenue = data?.metrics.totalRevenue || 0;
  const ordersCount = data?.metrics.ordersCount || 0;
  const avgOrderValue = data?.metrics.avgOrderValue || 0;
  const lowStockCount = data?.lowStockCount || 0;
  const recentLogs = data?.recentLogs || [];

  const stats = [
    {
      name: "Total Revenue",
      value: totalRevenue.toLocaleString("en-US", {
        style: "currency",
        currency: "LKR",
      }),
      change: "Dynamic Live",
      icon: DollarSign,
      color: "text-emerald-500",
    },
    {
      name: "All Orders Count",
      value: ordersCount.toString(),
      change: "Dynamic Live",
      icon: ShoppingCart,
      color: "text-blue-500",
    },
    {
      name: "Avg Order Value",
      value: avgOrderValue.toLocaleString("en-US", {
        style: "currency",
        currency: "LKR",
      }),
      change: "Dynamic Live",
      icon: TrendingUp,
      color: "text-indigo-500",
    },
    {
      name: "Low Stock Alerts",
      value: `${lowStockCount} items`,
      change: lowStockCount > 0 ? "Action Required" : "Healthy Stock",
      icon: ShieldAlert,
      color:
        lowStockCount > 0 ? "text-red-500 animate-pulse" : "text-emerald-500",
    },
  ];

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="h-7 w-7 animate-spin mb-3 text-blue-500" />
        <span className="font-semibold">
          Loading merchant statistics dashboard...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-foreground">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-wide">Merchant Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Overview of store sales performance and inventory warnings.
        </p>
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
                <span className="text-xs text-muted-foreground block font-semibold uppercase tracking-wider">
                  {stat.name}
                </span>
                <span className="text-xl font-bold block">{stat.value}</span>
                <span
                  className={`text-[10px] font-bold block ${stat.name === "Low Stock Alerts" && lowStockCount > 0 ? "text-red-500" : "text-emerald-500"}`}
                >
                  {stat.change}
                </span>
              </div>
              <div
                className={`p-3 bg-secondary/40 border border-border rounded-lg ${stat.color}`}
              >
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
          <p className="text-xs text-muted-foreground py-4 text-center">
            No recent activity logs found.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="py-3.5 flex items-center justify-between text-xs transition-colors hover:bg-muted/5 px-2 -mx-2 rounded-lg"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    Actor <span className="text-blue-500">@{log.actor}</span>{" "}
                    performed{" "}
                    <span className="capitalize font-bold text-indigo-400">
                      {log.action}
                    </span>{" "}
                    on collection{" "}
                    <span className="capitalize text-foreground">
                      {log.collection}
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Record ID: {log.recordId} • {log.date}
                  </p>
                </div>
                <span className="text-muted-foreground font-mono text-[10px] bg-secondary border border-border px-1.5 py-0.5 rounded shrink-0">
                  {log.id}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
