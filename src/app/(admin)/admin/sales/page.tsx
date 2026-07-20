"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingBag,
  CreditCard,
  Search,
  Filter,
  ArrowUpRight,
  ExternalLink,
  Laptop,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Calendar,
  Banknote,
  QrCode,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUnifiedSalesTrackerAction } from "@/app/actions/admin";

interface UnifiedSale {
  id: string;
  receiptNumber: string;
  date: string;
  customerName: string;
  customerEmail: string;
  itemsCount: number;
  total: number;
  discount: number;
  paymentMethod: string;
  status: string;
  source: "POS Terminal" | "Online Store";
}

const methodIcon: Record<string, React.ElementType> = {
  cash: Banknote,
  card: CreditCard,
  qr: QrCode,
  split: CreditCard,
};

function fmt(amount: number) {
  return amount.toLocaleString("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  });
}

export default function AdminSalesTrackerPage() {
  const [sales, setSales] = useState<UnifiedSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState<
    "All" | "POS Terminal" | "Online Store"
  >("All");
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getUnifiedSalesTrackerAction();
      if (res.success && res.data) {
        setSales(res.data as UnifiedSale[]);
      } else {
        setError(res.error || "Failed to load sales data.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered sales
  const filteredSales = sales.filter((s) => {
    const matchesSource = filterSource === "All" || s.source === filterSource;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesSource;

    const matchesSearch =
      s.receiptNumber.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      s.customerEmail.toLowerCase().includes(q) ||
      s.paymentMethod.toLowerCase().includes(q);

    return matchesSource && matchesSearch;
  });

  // Calculate KPIs
  const totalRevenue = sales.reduce(
    (sum, s) => sum + (s.status === "completed" ? s.total : 0),
    0,
  );

  const posSales = sales.filter(
    (s) => s.source === "POS Terminal" && s.status === "completed",
  );
  const posRevenue = posSales.reduce((sum, s) => sum + s.total, 0);

  const onlineSales = sales.filter(
    (s) => s.source === "Online Store" && s.status === "completed",
  );
  const onlineRevenue = onlineSales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="space-y-6 text-foreground">
      {/* Title */}
      <div className="border-b border-border pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
            <TrendingUp className="h-6 w-6 text-blue-500" />
            Unified Sales Tracker
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor and audit all customer sales transactions across POS
            Terminals and the Online Store in real-time.
          </p>
        </div>
        <Button
          onClick={() => startTransition(loadData)}
          disabled={loading || isPending}
          variant="outline"
          size="sm"
          className="self-start md:self-auto gap-1.5"
        >
          {loading || isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          Refresh Data
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-red-500 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total combined */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="absolute right-4 top-4 h-9 w-9 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            Total Revenue
          </p>
          <p className="text-2xl font-black text-foreground">
            {fmt(totalRevenue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Across {sales.filter((s) => s.status === "completed").length}{" "}
            completed transactions
          </p>
        </div>

        {/* Card 2: POS Sales */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="absolute right-4 top-4 h-9 w-9 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
            <Store className="h-5 w-5" />
          </div>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            POS Sales
          </p>
          <p className="text-2xl font-black text-foreground">
            {fmt(posRevenue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {posSales.length} retail checkouts at counters
          </p>
        </div>

        {/* Card 3: Online Store */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden">
          <div className="absolute right-4 top-4 h-9 w-9 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            E-Commerce Orders
          </p>
          <p className="text-2xl font-black text-foreground">
            {fmt(onlineRevenue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {onlineSales.length} completed online store checkouts
          </p>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/30 border border-border/80 p-3 rounded-2xl">
        {/* Source tabs */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-full sm:w-auto">
          {(["All", "POS Terminal", "Online Store"] as const).map((src) => (
            <button
              key={src}
              onClick={() => setFilterSource(src)}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterSource === src
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {src}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="relative w-full sm:max-w-xs shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, customer..."
            className="pl-9 h-9 text-xs rounded-xl bg-background border-border"
          />
        </div>
      </div>

      {/* Unified Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              Compiling sales records...
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No transactions match your filters
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-muted-foreground uppercase tracking-wider font-bold text-[9px]">
                  <th className="p-4">Receipt / Date</th>
                  <th className="p-4">Channel</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4 text-center">Items</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground font-semibold">
                {filteredSales.map((sale) => {
                  const MIcon = methodIcon[sale.paymentMethod] || CreditCard;
                  const dateObj = new Date(sale.date);
                  const formattedDate = isNaN(dateObj.getTime())
                    ? "—"
                    : dateObj.toLocaleDateString("en-LK", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });

                  return (
                    <tr
                      key={sale.id}
                      className="hover:bg-muted/10 transition-colors"
                    >
                      <td className="p-4">
                        <span className="font-mono text-xs font-bold text-foreground block">
                          {sale.receiptNumber}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 opacity-65" />
                          {formattedDate}
                        </span>
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            sale.source === "POS Terminal"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                              : "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                          }`}
                        >
                          {sale.source === "POS Terminal" ? (
                            <Store className="h-2.5 w-2.5" />
                          ) : (
                            <Laptop className="h-2.5 w-2.5" />
                          )}
                          {sale.source}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="text-foreground block">
                          {sale.customerName}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono font-medium block">
                          {sale.customerEmail}
                        </span>
                      </td>

                      <td className="p-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-[10px] font-semibold text-foreground">
                          {sale.itemsCount}{" "}
                          {sale.itemsCount === 1 ? "item" : "items"}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 capitalize text-[10px]">
                          <MIcon className="h-3.5 w-3.5 opacity-70" />
                          {sale.paymentMethod}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <span className="font-bold text-foreground">
                          {fmt(sale.total)}
                        </span>
                        {sale.discount > 0 && (
                          <span className="text-[9px] text-emerald-500 block">
                            -{fmt(sale.discount)} off
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        {sale.status === "completed" ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-500 text-[10px]">
                            <CheckCircle className="h-3 w-3" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-red-500 text-[10px]">
                            <XCircle className="h-3 w-3" /> Voided
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        <Link
                          href={
                            sale.source === "POS Terminal"
                              ? `/pos/history/${sale.id}`
                              : `/admin/orders`
                          }
                          className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline"
                        >
                          View{" "}
                          {sale.source === "POS Terminal" ? "Receipt" : "Order"}
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
