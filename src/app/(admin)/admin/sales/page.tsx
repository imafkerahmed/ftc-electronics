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
  Mail,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getUnifiedSalesTrackerAction,
  getSaleByIdAction,
  getReceiptPrintPresetsAction,
  getInvoicePrintPresetsAction,
  sendInvoiceViaWorkflowAction,
} from "@/app/actions/admin";
import type { PBSale, PBSaleItem } from "@/types/pos";
import { printReceipt, resolveReceiptConfig } from "@/lib/receipt-print";
import {
  DEFAULT_RECEIPT_CONFIG,
  normalizeReceiptConfig,
} from "@/types/receipt-config";
import {
  printInvoice,
  resolveInvoiceConfig,
  generateInvoicePdfBlob,
  downloadInvoicePdf,
  type InvoiceData,
} from "@/lib/invoice-print";
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
  const [mounted, setMounted] = useState(false);
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

  // Send Invoice Workflow States
  const [showSendWorkflow, setShowSendWorkflow] = useState(false);
  const [workflowTab, setWorkflowTab] = useState<'email' | 'whatsapp'>('email');
  const [workflowEmail, setWorkflowEmail] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowPhone, setWorkflowPhone] = useState('');
  const [sendingWorkflow, setSendingWorkflow] = useState(false);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchReceipt() {
      if (!selectedPosSaleId) {
        setPosReceiptDetails(null);
        return;
      }
      setLoadingReceipt(true);
      try {
        const res = await getSaleByIdAction(selectedPosSaleId);
        if (isMounted && res.success && res.data) {
          setPosReceiptDetails(res.data);
        }
      } catch {
        if (isMounted) setPosReceiptDetails(null);
      } finally {
        if (isMounted) setLoadingReceipt(false);
      }
    }
    fetchReceipt();
    return () => {
      isMounted = false;
    };
  }, [selectedPosSaleId]);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const workflowModalRef = useRef<HTMLDivElement | null>(null);
  const previousWorkflowFocusRef = useRef<HTMLElement | null>(null);

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
        if (showSendWorkflow) return;
        setSelectedPosSaleId(null);
        return;
      }

      if (e.key === "Tab" && modalRef.current && !showSendWorkflow) {
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
    const toRestore = previousFocusRef.current;
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      // Restore focus only if the trigger element is still connected to the DOM
      if (toRestore?.isConnected) {
        toRestore.focus();
      }
    };
  }, [selectedPosSaleId, showSendWorkflow]);

  useEffect(() => {
    if (!showSendWorkflow) return;

    previousWorkflowFocusRef.current = document.activeElement as HTMLElement | null;

    const frameId = requestAnimationFrame(() => {
      workflowModalRef.current?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setShowSendWorkflow(false);
        return;
      }

      if (e.key === "Tab" && workflowModalRef.current) {
        const focusables: HTMLElement[] = Array.from(
          workflowModalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === workflowModalRef.current) {
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

    window.addEventListener("keydown", onKeyDown, true);
    const toRestore = previousWorkflowFocusRef.current;
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown, true);
      if (toRestore?.isConnected) {
        toRestore.focus();
      }
    };
  }, [showSendWorkflow]);

  const handleReprintReceipt = async () => {
    if (!posReceiptDetails) return;
    const { sale, items } = posReceiptDetails;
    const rawDateStr = sale.date || sale.created || sale.updated;
    const d = rawDateStr ? new Date(rawDateStr) : new Date();
    const formattedDate = (isNaN(d.getTime()) ? new Date() : d).toLocaleString("en-LK");

    const cfg = await resolveReceiptConfig();

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

    const cfg = await resolveInvoiceConfig();
    const isVoided = sale.status === 'voided';
    const docNumber = sale.receipt_number || `INV-POS-${sale.id.slice(-6).toUpperCase()}`;

    const invoiceData: InvoiceData = {
      docType: "Invoice",
      docNumber: isVoided ? `${docNumber} (VOIDED)` : docNumber,
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
      paymentMethod: isVoided
        ? 'VOIDED / CANCELLED'
        : `PAID via ${(sale.payment_method || 'POS').toUpperCase()}`,
      notes: isVoided
        ? `*** THIS SALE HAS BEEN VOIDED / CANCELLED *** ${sale.void_reason ? 'Reason: ' + sale.void_reason : ''}`
        : 'Official Paid Invoice. Thank you for shopping with FTC Electronics! Warranty claims require original invoice copy.',
    };

    printInvoice(cfg, invoiceData, isVoided ? "POS Voided Invoice" : "Paid Invoice");
  };

  const handleShareWhatsappInvoice = async () => {
    if (!posReceiptDetails) return;

    const cleanPhone = (workflowPhone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      setWorkflowMessage({
        type: 'error',
        text: 'Please enter a valid customer phone number before sharing on WhatsApp.',
      });
      return;
    }

    setSharingWhatsapp(true);
    setWorkflowMessage(null);

    try {
      const { sale, items } = posReceiptDetails;
      const rawDateStr = sale.date || sale.created || sale.updated;
      const d = rawDateStr ? new Date(rawDateStr) : new Date();
      const formattedDate = (isNaN(d.getTime()) ? new Date() : d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const isVoided = sale.status === 'voided';
      const docNumber = sale.receipt_number || `INV-POS-${sale.id.slice(-6).toUpperCase()}`;

      const invoiceData: InvoiceData = {
        docType: "Invoice",
        docNumber: isVoided ? `${docNumber} (VOIDED)` : docNumber,
        date: formattedDate,
        customerName: workflowName.trim() || sale.customer_name || "Walk-in Customer",
        customerPhone: workflowPhone.trim() || sale.customer_phone || undefined,
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
        paymentMethod: isVoided
          ? 'VOIDED / CANCELLED'
          : `PAID via ${(sale.payment_method || 'POS').toUpperCase()}`,
        notes: isVoided
          ? `*** THIS SALE HAS BEEN VOIDED / CANCELLED *** ${sale.void_reason ? 'Reason: ' + sale.void_reason : ''}`
          : 'Official Paid Invoice. Thank you for shopping with FTC Electronics! Warranty claims require original invoice copy.',
      };

      const cfg = await resolveInvoiceConfig();
      const pdfBlob = await generateInvoicePdfBlob(cfg, invoiceData, isVoided ? "POS Voided Invoice" : "Paid Invoice");
      const fileName = `${docNumber}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          files: [pdfFile],
          title: `Invoice ${docNumber}`,
          text: `Invoice document for order ${docNumber}`,
        });
        setWorkflowMessage({
          type: 'success',
          text: `Invoice document (${fileName}) attached successfully via system share.`,
        });
        return;
      }

      // Fallback for desktop browser: download PDF document & open WhatsApp Web
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const itemsStr = items.map(i => `• ${i.product_name} x${i.quantity} - ${fmt(i.line_total)}`).join('\n');
      const text = `*FTC Electronics*\nInvoice Document: *${docNumber}*\n*Date:* ${formattedDate}\n*Total:* ${fmt(sale.total)}\n\n*Items:*\n${itemsStr}\n\n📄 *Invoice PDF document (${fileName}) has been downloaded to your device.* Please attach it to this chat!\nThank you for shopping with us!`;

      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');

      setWorkflowMessage({
        type: 'success',
        text: `📄 Invoice PDF (${fileName}) downloaded! WhatsApp Web opened — drag & drop or attach the PDF file into the chat.`,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('WhatsApp PDF share error:', err);
      setWorkflowMessage({
        type: 'error',
        text: err?.message || 'Failed to generate PDF document for WhatsApp.',
      });
    } finally {
      setSharingWhatsapp(false);
    }
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
    setMounted(true);
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
          disabled={!mounted || loading || isPending}
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
                    onClick={() => {
                      const name = posReceiptDetails.sale.customer_name || '';
                      const phone = posReceiptDetails.sale.customer_phone || '';
                      const email = posReceiptDetails.sale.customer_email || '';
                      
                      setWorkflowName(name);
                      setWorkflowPhone(phone);
                      setWorkflowEmail(email && !email.endsWith('@customer.local') && email !== 'customer@ftc.lk' ? email : '');
                      setWorkflowMessage(null);
                      setWorkflowTab('email');
                      setShowSendWorkflow(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1 text-xs font-bold cursor-pointer"
                  >
                    <Mail className="h-3.5 w-3.5" /> Send Invoice
                  </Button>
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

      {/* Send Invoice Workflow Modal */}
      {showSendWorkflow && posReceiptDetails && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowSendWorkflow(false)}
        >
          <div
            ref={workflowModalRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Send Digital Invoice"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 outline-none"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-emerald-500" />
                <h3 className="text-sm font-black text-foreground">
                  Send Invoice — {posReceiptDetails.sale.receipt_number || `POS-${posReceiptDetails.sale.id.slice(-6).toUpperCase()}`}
                </h3>
              </div>
              <button
                onClick={() => setShowSendWorkflow(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {workflowMessage && (
                <div className={`p-3.5 rounded-xl border flex gap-2 items-start ${
                  workflowMessage.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}>
                  {workflowMessage.type === 'success' ? (
                    <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  )}
                  <p className="leading-relaxed font-semibold">{workflowMessage.text}</p>
                </div>
              )}

              {/* Tab Selector */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => {
                    setWorkflowTab('email');
                    setWorkflowMessage(null);
                  }}
                  className={`py-2 text-center font-bold rounded-lg transition-all cursor-pointer ${
                    workflowTab === 'email'
                      ? 'bg-card text-foreground border border-border shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Email Invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkflowTab('whatsapp');
                    setWorkflowMessage(null);
                  }}
                  className={`py-2 text-center font-bold rounded-lg transition-all cursor-pointer ${
                    workflowTab === 'whatsapp'
                      ? 'bg-card text-foreground border border-border shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  WhatsApp Share
                </button>
              </div>

              {workflowTab === 'email' ? (
                /* Email Form */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Customer Name
                    </label>
                    <Input
                      value={workflowName}
                      onChange={(e) => setWorkflowName(e.target.value)}
                      placeholder="Enter customer name"
                      className="h-10 text-xs rounded-xl bg-background border-border text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Customer Phone
                    </label>
                    <Input
                      value={workflowPhone}
                      onChange={(e) => setWorkflowPhone(e.target.value)}
                      placeholder="Enter customer phone number"
                      className="h-10 text-xs rounded-xl font-mono bg-background border-border text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Email Address *
                    </label>
                    <Input
                      type="email"
                      value={workflowEmail}
                      onChange={(e) => setWorkflowEmail(e.target.value)}
                      placeholder="Enter customer email address"
                      className="h-10 text-xs rounded-xl font-mono bg-background border-border text-foreground"
                    />
                  </div>

                  <p className="text-[10px] text-muted-foreground bg-muted/40 border border-border p-3 rounded-xl leading-relaxed">
                    💡 **Database Auto-Sync**: Submitting this email address will search for an existing customer in your system by their phone number. If found, their email is updated. If both the customer and email are not found, a new customer record is created in the database.
                  </p>
                </div>
              ) : (
                /* WhatsApp form */
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Customer Phone / WhatsApp Number *
                    </label>
                    <Input
                      value={workflowPhone}
                      onChange={(e) => setWorkflowPhone(e.target.value)}
                      placeholder="Enter WhatsApp number (e.g. 94771234567)"
                      className="h-10 text-xs rounded-xl font-mono bg-background border-border text-foreground"
                    />
                  </div>

                  <p className="text-[10px] text-muted-foreground bg-muted/40 border border-border p-3 rounded-xl leading-relaxed">
                    💬 **Local Client Share**: Clicking the button below will open WhatsApp Web or your local desktop client to send the receipt details directly via your logged-in WhatsApp session.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setShowSendWorkflow(false)} className="cursor-pointer">
                Cancel
              </Button>
              {workflowTab === 'email' ? (
                <Button
                  disabled={
                    sendingWorkflow ||
                    !workflowEmail.trim() ||
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workflowEmail.trim())
                  }
                  onClick={async () => {
                    const trimmedEmail = workflowEmail.trim();
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(trimmedEmail)) {
                      setWorkflowMessage({
                        type: 'error',
                        text: 'Please enter a valid email address (e.g. customer@example.com).',
                      });
                      return;
                    }

                    setSendingWorkflow(true);
                    setWorkflowMessage(null);
                    try {
                      const res = await sendInvoiceViaWorkflowAction({
                        saleId: posReceiptDetails.sale.id,
                        email: trimmedEmail,
                        customerName: workflowName.trim(),
                        customerPhone: workflowPhone.trim(),
                      });
                      if (res.success) {
                        setWorkflowMessage({
                          type: 'success',
                          text: `Invoice emailed to ${res.emailedTo} successfully! Database customer record updated.`,
                        });
                        
                        setPosReceiptDetails((prev) => {
                          if (!prev) return null;
                          return {
                            ...prev,
                            sale: {
                              ...prev.sale,
                              customer_email: res.emailedTo || '',
                              customer_name: workflowName.trim(),
                              customer_phone: workflowPhone.trim(),
                            },
                          };
                        });
                      } else {
                        setWorkflowMessage({
                          type: 'error',
                          text: res.error || 'Failed to process email workflow.',
                        });
                      }
                    } catch (err: any) {
                      setWorkflowMessage({
                        type: 'error',
                        text: err.message || 'An unexpected error occurred.',
                      });
                    } finally {
                      setSendingWorkflow(false);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1 cursor-pointer disabled:opacity-50"
                >
                  {sendingWorkflow ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                  Send Email Invoice
                </Button>
              ) : (
                <Button
                  disabled={sharingWhatsapp || !(workflowPhone || '').replace(/\D/g, '')}
                  onClick={handleShareWhatsappInvoice}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1 cursor-pointer disabled:opacity-50"
                >
                  {sharingWhatsapp ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  Share via WhatsApp
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
