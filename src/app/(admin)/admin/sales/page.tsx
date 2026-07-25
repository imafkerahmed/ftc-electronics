"use client";

import React, { useState, useEffect, useTransition, useCallback, useRef } from "react";
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
  X,
  Printer,
  Receipt,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getUnifiedSalesTrackerAction,
  getSaleByIdAction,
  getReceiptPrintPresetsAction,
  getInvoicePrintPresetsAction,
} from "@/app/actions/admin";
import type { PBSale, PBSaleItem } from "@/types/pos";
import { printReceipt } from "@/lib/receipt-print";
import {
  DEFAULT_RECEIPT_CONFIG,
  normalizeReceiptConfig,
} from "@/types/receipt-config";
import { printInvoice, type InvoiceData } from "@/lib/invoice-print";
import {
  DEFAULT_INVOICE_CONFIG,
  normalizeInvoiceConfig,
} from "@/types/invoice-config";

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

  const [selectedPosSaleId, setSelectedPosSaleId] = useState<string | null>(null);
  const [posReceiptDetails, setPosReceiptDetails] = useState<{
    sale: PBSale;
    items: PBSaleItem[];
  } | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  useEffect(() => {
    async function fetchReceipt() {
      if (!selectedPosSaleId) {
        setPosReceiptDetails(null);
        return;
      }
      setLoadingReceipt(true);
      try {
        const res = await getSaleByIdAction(selectedPosSaleId);
        if (res.success && res.data) {
          setPosReceiptDetails(res.data);
        }
      } catch {
        /* ignore */
      } finally {
        setLoadingReceipt(false);
      }
    }
    void fetchReceipt();
  }, [selectedPosSaleId]);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedPosSaleId) return;

    // Capture currently focused element to restore on close
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus into modal on open
    const frameId = requestAnimationFrame(() => {
      modalRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedPosSaleId(null);
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusables: HTMLElement[] = Array.from(
          modalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === modalRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      // Restore focus to triggering element on close
      previousFocusRef.current?.focus();
    };
  }, [selectedPosSaleId]);

  const handleReprintReceipt = async () => {
    if (!posReceiptDetails) return;
    const { sale, items } = posReceiptDetails;
    const rawDateStr = sale.date || sale.created || sale.updated;
    const d = rawDateStr ? new Date(rawDateStr) : new Date();
    const formattedDate = (isNaN(d.getTime()) ? new Date() : d).toLocaleString("en-LK");

    let cfg = DEFAULT_RECEIPT_CONFIG;
    try {
      const res = await getReceiptPrintPresetsAction();
      const presets = res.data || [];
      const defaultPreset = presets.find((p) => p.isDefault) || presets[0];
      if (defaultPreset) {
        cfg = normalizeReceiptConfig(defaultPreset.config);
      }
    } catch {
      // Fallback to DEFAULT_RECEIPT_CONFIG
    }

    printReceipt(
      cfg,
      {
        orderNumber: sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`,
        date: formattedDate,
        customerName: sale.customer_name || "Walk-in Customer",
        customerPhone: sale.customer_phone,
        items: items.map((i) => ({
          name: i.product_name,
          qty: i.quantity,
          unitPrice: i.unit_price,
        })),
        subtotal: sale.subtotal,
        discount: sale.discount,
        total: sale.total,
        paymentMethod: sale.payment_method,
      },
      "POS Receipt"
    );
  };

  const handlePrintInvoice = async () => {
    if (!posReceiptDetails) return;
    const { sale, items } = posReceiptDetails;

    const rawDateStr = sale.date || sale.created || sale.updated;
    const d = rawDateStr ? new Date(rawDateStr) : new Date();
    const formattedDate = (isNaN(d.getTime()) ? new Date() : d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    let cfg = DEFAULT_INVOICE_CONFIG;
    try {
      const res = await getInvoicePrintPresetsAction();
      const presets = res.data || [];
      const defaultPreset = (presets as any[]).find((p) => p.isDefault) || presets[0];
      if (defaultPreset) {
        cfg = normalizeInvoiceConfig(defaultPreset.config);
      }
    } catch {
      // Fallback to DEFAULT_INVOICE_CONFIG
    }

    const docNumber = sale.receipt_number || `INV-POS-${sale.id.slice(-6).toUpperCase()}`;

    const invoiceData: InvoiceData = {
      docType: "Invoice",
      docNumber,
      date: formattedDate,
      customerName: sale.customer_name || "Walk-in Customer",
      customerPhone: sale.customer_phone || undefined,
      items: items.map((i) => ({
        name: i.product_name,
        qty: i.quantity,
        unitPrice: i.unit_price,
        discount: i.item_discount || undefined,
        serialNumber: i.unit_serial || undefined,
      })),
      subtotal: sale.subtotal,
      taxAmount: sale.tax_amount || 0,
      discountAmount: sale.discount || 0,
      totalAmount: sale.total,
      paymentMethod: `PAID via ${(sale.payment_method || "POS").toUpperCase()}`,
      notes: "Official Paid Invoice. Thank you for shopping with FTC Electronics! Warranty claims require original invoice copy.",
    };

    printInvoice(cfg, invoiceData, "Paid Invoice");
  };

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
                        {sale.source === 'POS Terminal' ? (
                          <button
                            onClick={() => setSelectedPosSaleId(sale.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline font-bold"
                          >
                            View Receipt
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <Link
                            href="/admin/orders"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline"
                          >
                            View Order
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* POS Receipt Preview Modal */}
      {selectedPosSaleId && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedPosSaleId(null)}
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="POS Receipt Detail"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 outline-none"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-500" />
                <h3 className="text-sm font-black text-foreground">POS Receipt Detail</h3>
              </div>
              <button
                onClick={() => setSelectedPosSaleId(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {loadingReceipt ? (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  Loading receipt details...
                </div>
              ) : !posReceiptDetails ? (
                <div className="py-12 text-center text-red-500">
                  Failed to load receipt details.
                </div>
              ) : (
                <>
                  {/* Meta data */}
                  <div className="grid grid-cols-2 gap-4 bg-muted/40 p-4 border border-border rounded-xl">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Receipt No</p>
                      <p className="font-mono font-bold text-foreground text-xs">
                        {posReceiptDetails.sale.receipt_number || `FTC-POS-${posReceiptDetails.sale.id.slice(-6).toUpperCase()}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Cashier</p>
                      <p className="font-bold text-foreground">{posReceiptDetails.sale.cashier_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Customer</p>
                      <p className="font-bold text-foreground">{posReceiptDetails.sale.customer_name || 'Walk-in Customer'}</p>
                      {posReceiptDetails.sale.customer_phone && (
                        <p className="font-mono text-[10px] text-muted-foreground">{posReceiptDetails.sale.customer_phone}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Transaction Date</p>
                      <p className="font-bold text-foreground">
                        {(() => {
                          const rawDateStr = posReceiptDetails.sale.date || posReceiptDetails.sale.created || posReceiptDetails.sale.updated;
                          const d = rawDateStr ? new Date(rawDateStr) : new Date();
                          return (isNaN(d.getTime()) ? new Date() : d).toLocaleString('en-LK');
                        })()}
                      </p>
                    </div>
                  </div>

                  {/* Items List */}
                  <div>
                    <h4 className="text-[10px] uppercase font-black text-muted-foreground tracking-wider mb-2">Items Purchased</h4>
                    <div className="border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border text-muted-foreground font-bold text-[10px]">
                            <th className="p-3">Product</th>
                            <th className="p-3 text-center">Qty</th>
                            <th className="p-3 text-right">Price</th>
                            <th className="p-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border font-medium">
                          {posReceiptDetails.items.map((item) => (
                            <tr key={item.id} className="hover:bg-muted/5">
                              <td className="p-3">
                                <p className="font-bold text-foreground">{item.product_name}</p>
                                {item.unit_serial && (
                                  <span className="font-mono text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                    SN: {item.unit_serial}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">{item.quantity}</td>
                              <td className="p-3 text-right">{fmt(item.unit_price)}</td>
                              <td className="p-3 text-right">{fmt(item.line_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="border-t border-border pt-4 space-y-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-semibold text-foreground">{fmt(posReceiptDetails.sale.subtotal)}</span>
                    </div>
                    {posReceiptDetails.sale.discount > 0 && (
                      <div className="flex justify-between text-emerald-500">
                        <span>Discount</span>
                        <span className="font-semibold">– {fmt(posReceiptDetails.sale.discount)}</span>
                      </div>
                    )}
                    {posReceiptDetails.sale.tax_amount > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tax</span>
                        <span className="font-semibold text-foreground">{fmt(posReceiptDetails.sale.tax_amount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black text-foreground border-t border-border pt-2">
                      <span>TOTAL</span>
                      <span className="text-blue-500 text-base">{fmt(posReceiptDetails.sale.total)}</span>
                    </div>
                    {posReceiptDetails.sale.payment_method === 'cash' && posReceiptDetails.sale.cash_tendered > 0 && (
                      <div className="flex justify-between text-muted-foreground border-t border-dashed border-border pt-1.5">
                        <span>Cash Tendered</span>
                        <span>{fmt(posReceiptDetails.sale.cash_tendered)}</span>
                      </div>
                    )}
                    {posReceiptDetails.sale.change_due > 0 && (
                      <div className="flex justify-between text-amber-500 font-bold">
                        <span>Change Given</span>
                        <span>{fmt(posReceiptDetails.sale.change_due)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setSelectedPosSaleId(null)}>
                Close
              </Button>
              {posReceiptDetails && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintInvoice}
                    className="gap-1 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 font-bold"
                  >
                    <FileText className="h-3.5 w-3.5" /> Print Paid Invoice
                  </Button>
                  <Button
                    onClick={handleReprintReceipt}
                    className="bg-blue-600 hover:bg-blue-500 text-white gap-1 text-xs font-bold"
                  >
                    <Printer className="h-3.5 w-3.5" /> Thermal Receipt
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
