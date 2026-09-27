"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertCircle,
  Calendar,
  Banknote,
  Store,
  X,
  Printer,
  Receipt,
  FileText,
  AlertTriangle,
  Phone,
  DollarSign,
  RefreshCw,
  CreditCard,
  ArrowUpRight,
  Landmark,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getOutstandingReceivablesAction,
  getOutstandingReceivablesMetricsAction,
  getSaleByIdAction,
  getSalePaymentsAction,
  recordSalePaymentAction,
  updateChequeStatusAction,
  recordPaymentReversalAction,
} from "@/app/actions/admin";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import type {
  OutstandingReceivable,
  OutstandingReceivablesMetrics,
  PBSale,
  PBSaleItem,
  SalePayment,
  SalePaymentReversal,
  SalePaymentSummary,
  PaymentMethod,
} from "@/types/pos";
import {
  printInvoice,
  resolveInvoiceConfig,
  type InvoiceData,
} from "@/lib/invoice-print";

function fmt(amount: number) {
  return amount.toLocaleString("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  });
}

export interface ReceivablesWorkspaceProps {
  isActive?: boolean;
  initialSearch?: string;
  onNavigateTab?: (view: 'sales' | 'quotations' | 'receivables' | 'cheques', params?: { search?: string; id?: string }) => void;
}

export default function ReceivablesWorkspace({
  isActive = true,
  initialSearch,
  onNavigateTab,
}: ReceivablesWorkspaceProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch || "");
  const [debouncedSearch] = useDebounce(searchQuery, 400);

  const [statusFilter, setStatusFilter] = useState("all");
  const [agingBucket, setAgingBucket] = useState("all");
  const [paymentTerms, setPaymentTerms] = useState("all");
  const [sort, setSort] = useState("due_date_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sync external search if passed
  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  // Selected item for modals
  const [selectedReceivable, setSelectedReceivable] = useState<OutstandingReceivable | null>(null);
  const [selectedSaleDetails, setSelectedSaleDetails] = useState<{
    sale: PBSale;
    items: PBSaleItem[];
  } | null>(null);
  const [loadingSaleDetails, setLoadingSaleDetails] = useState(false);

  // Payment ledger drawer/modal states
  const [salePayments, setSalePayments] = useState<SalePayment[]>([]);
  const [salePaymentReversals, setSalePaymentReversals] = useState<SalePaymentReversal[]>([]);
  const [salePaymentSummary, setSalePaymentSummary] = useState<SalePaymentSummary | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Record Payment modal states
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [recordMethod, setRecordMethod] = useState<PaymentMethod>("cash");
  const [recordAmount, setRecordAmount] = useState<string>("");
  const [recordReference, setRecordReference] = useState<string>("");
  const [recordChequeNumber, setRecordChequeNumber] = useState<string>("");
  const [recordChequeDate, setRecordChequeDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [recordBankName, setRecordBankName] = useState<string>("");
  const [recordChequeNotes, setRecordChequeNotes] = useState<string>("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentActionMessage, setPaymentActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Return Payment (Reversal) modal states
  const [showReturnPaymentModal, setShowReturnPaymentModal] = useState(false);
  const [targetPaymentForReturn, setTargetPaymentForReturn] = useState<SalePayment | null>(null);
  const [returnAmount, setReturnAmount] = useState<string>("");
  const [returnReason, setReturnReason] = useState<string>("Customer refund");
  const [returnReference, setReturnReference] = useState<string>("");
  const [returnNotes, setReturnNotes] = useState<string>("");
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [returnActionMessage, setReturnActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, agingBucket, paymentTerms, sort, pageSize]);

  // Main receivables query (lazy loaded when tab is active)
  const {
    data: receivablesData,
    isLoading: loading,
    isFetching,
    error: receivablesError,
    refetch: refetchReceivables,
  } = useQuery({
    queryKey: [
      "admin-outstanding-receivables",
      page,
      pageSize,
      debouncedSearch,
      statusFilter,
      agingBucket,
      paymentTerms,
      sort,
    ],
    queryFn: async () => {
      const activeFilter = statusFilter !== "all" ? statusFilter : agingBucket !== "all" ? agingBucket : "all";
      const res = await getOutstandingReceivablesAction({
        page,
        pageSize,
        search: debouncedSearch,
        filter: activeFilter,
        sort,
      });
      if (!res.success) throw new Error(res.error);
      return res;
    },
    enabled: isActive,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  // KPI Metrics query (lazy loaded when tab is active)
  const {
    data: metricsData,
    isLoading: loadingMetrics,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: [
      "admin-outstanding-receivables-metrics",
      debouncedSearch,
    ],
    queryFn: async () => {
      const res = await getOutstandingReceivablesMetricsAction(debouncedSearch);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: isActive,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  const receivables = (receivablesData?.data as OutstandingReceivable[]) || [];
  const metrics = metricsData as OutstandingReceivablesMetrics | undefined;
  const error = receivablesError ? (receivablesError as Error).message : null;
  const totalPages = receivablesData?.totalPages || 0;
  const totalCount = receivablesData?.total || 0;

  const handleRefreshAll = () => {
    refetchReceivables();
    refetchMetrics();
  };

  // Open Sale & Payment Ledger Details
  const handleOpenSaleDetails = async (rec: OutstandingReceivable) => {
    setSelectedReceivable(rec);
    setLoadingSaleDetails(true);
    setLoadingPayments(true);
    try {
      const [saleRes, paymentsRes] = await Promise.all([
        getSaleByIdAction(rec.id),
        getSalePaymentsAction(rec.id),
      ]);

      if (saleRes.success && saleRes.data) {
        setSelectedSaleDetails(saleRes.data);
      }
      if (paymentsRes.success && paymentsRes.data) {
        setSalePayments(paymentsRes.data.payments);
        setSalePaymentReversals(paymentsRes.data.reversals || []);
        setSalePaymentSummary(paymentsRes.data.summary);
      }
    } catch (err: any) {
      console.error("Error loading sale details:", err);
    } finally {
      setLoadingSaleDetails(false);
      setLoadingPayments(false);
    }
  };

  // Open Record Payment Modal
  const handleOpenRecordPayment = (rec: OutstandingReceivable) => {
    setSelectedReceivable(rec);
    setRecordAmount(String(rec.available_to_record));
    setRecordMethod("cash");
    setRecordReference("");
    setRecordChequeNumber("");
    setRecordChequeDate(new Date().toISOString().split("T")[0]);
    setRecordBankName("");
    setRecordChequeNotes("");
    setPaymentActionMessage(null);
    setShowRecordPaymentModal(true);
  };

  // Open Return Payment Modal
  const handleOpenReturnPayment = (payment: SalePayment) => {
    setTargetPaymentForReturn(payment);
    const maxReversible = payment.remaining_reversible ?? payment.amount;
    setReturnAmount(String(maxReversible));
    setReturnReason("Customer refund");
    setReturnReference("");
    setReturnNotes("");
    setReturnActionMessage(null);
    setShowReturnPaymentModal(true);
  };

  // Submit Payment Return / Reversal
  const handleReturnPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPaymentForReturn || !selectedReceivable) return;

    const amt = parseFloat(returnAmount);
    const maxReversible = targetPaymentForReturn.remaining_reversible ?? targetPaymentForReturn.amount;

    if (isNaN(amt) || amt <= 0) {
      setReturnActionMessage({ type: "error", text: "Please enter a valid positive return amount." });
      return;
    }

    if (amt > maxReversible) {
      setReturnActionMessage({
        type: "error",
        text: `Return amount (${fmt(amt)}) exceeds remaining reversible balance (${fmt(maxReversible)}).`,
      });
      return;
    }

    if (!returnReason.trim()) {
      setReturnActionMessage({ type: "error", text: "Reason is required for payment return." });
      return;
    }

    if (returnReason === "Other" && !returnNotes.trim()) {
      setReturnActionMessage({ type: "error", text: "Notes are required when selecting reason 'Other'." });
      return;
    }

    setIsSubmittingReturn(true);
    setReturnActionMessage(null);

    try {
      const res = await recordPaymentReversalAction({
        paymentId: targetPaymentForReturn.id,
        amount: amt,
        reason: returnReason.trim(),
        reference: returnReference.trim() || undefined,
        notes: returnNotes.trim() || undefined,
      });

      if (!res.success) {
        setReturnActionMessage({ type: "error", text: res.error || "Failed to record payment return" });
      } else {
        setReturnActionMessage({ type: "success", text: "Payment return successfully recorded in audit ledger!" });
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables"] });
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["admin-sales"] });
        queryClient.invalidateQueries({ queryKey: ["admin-sales-metrics"] });

        setTimeout(() => {
          setShowReturnPaymentModal(false);
          setReturnActionMessage(null);
          if (selectedReceivable) {
            handleOpenSaleDetails(selectedReceivable);
          }
        }, 800);
      }
    } catch (err: any) {
      setReturnActionMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // Submit Payment
  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceivable) return;

    const amt = parseFloat(recordAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentActionMessage({ type: "error", text: "Please enter a valid positive payment amount." });
      return;
    }

    if (amt > selectedReceivable.available_to_record) {
      setPaymentActionMessage({
        type: "error",
        text: `Payment amount (${fmt(amt)}) exceeds available recordable balance (${fmt(selectedReceivable.available_to_record)}).`,
      });
      return;
    }

    if (recordMethod === "cheque" && !recordChequeNumber.trim()) {
      setPaymentActionMessage({ type: "error", text: "Cheque number is required for cheque payments." });
      return;
    }

    setIsRecordingPayment(true);
    setPaymentActionMessage(null);

    try {
      const res = await recordSalePaymentAction({
        saleId: selectedReceivable.id,
        paymentMethod: recordMethod,
        amount: amt,
        reference: recordReference.trim() || undefined,
        chequeNumber: recordMethod === "cheque" ? recordChequeNumber.trim() : undefined,
        chequeDate: recordMethod === "cheque" ? recordChequeDate : undefined,
        bankName: recordMethod === "cheque" ? recordBankName.trim() : undefined,
        notes: recordMethod === "cheque" ? recordChequeNotes.trim() : undefined,
      });

      if (!res.success) {
        setPaymentActionMessage({ type: "error", text: res.error || "Failed to record payment" });
      } else {
        setPaymentActionMessage({ type: "success", text: "Payment successfully recorded!" });
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables"] });
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["admin-sales"] });
        queryClient.invalidateQueries({ queryKey: ["admin-sales-metrics"] });

        setTimeout(() => {
          setShowRecordPaymentModal(false);
          setPaymentActionMessage(null);
          if (selectedReceivable) {
            handleOpenSaleDetails(selectedReceivable);
          }
        }, 800);
      }
    } catch (err: any) {
      setPaymentActionMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Handle Cheque Status Update
  const handleUpdateChequeStatus = async (
    paymentId: string,
    status: "cleared" | "bounced" | "cancelled"
  ) => {
    if (!selectedReceivable) return;
    try {
      const res = await updateChequeStatusAction({
        paymentId,
        newStatus: status,
      });
      if (res.success) {
        const paymentsRes = await getSalePaymentsAction(selectedReceivable.id);
        if (paymentsRes.success && paymentsRes.data) {
          setSalePayments(paymentsRes.data.payments);
          setSalePaymentReversals(paymentsRes.data.reversals || []);
          setSalePaymentSummary(paymentsRes.data.summary);
        }
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables"] });
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["admin-sales"] });
        queryClient.invalidateQueries({ queryKey: ["admin-sales-metrics"] });
      } else {
        alert(res.error || "Failed to update cheque status");
      }
    } catch (err: any) {
      alert(err.message || "An unexpected error occurred");
    }
  };

  // Print Invoice
  const handlePrintReceivableInvoice = async (rec: OutstandingReceivable) => {
    try {
      const saleRes = await getSaleByIdAction(rec.id);
      if (!saleRes.success || !saleRes.data) {
        alert("Failed to load invoice items for printing");
        return;
      }
      const { sale, items } = saleRes.data;
      const cfg = await resolveInvoiceConfig();

      const rawDateStr = sale.date || sale.created || sale.updated;
      const d = rawDateStr ? new Date(rawDateStr) : new Date();
      const formattedDate = (isNaN(d.getTime()) ? new Date() : d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      const invoiceData: InvoiceData = {
        docType: "Invoice",
        docNumber: rec.invoice_number || `INV-${rec.id.slice(-6).toUpperCase()}`,
        date: formattedDate,
        customerName: rec.customer_name || "Valued Customer",
        customerPhone: rec.customer_phone || undefined,
        paymentTerms: rec.payment_terms || undefined,
        dueDate: rec.due_date || undefined,
        isOverdue: rec.collection_status === "OVERDUE",
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
        clearedPaid: rec.effective_cleared_paid ?? rec.cleared_paid,
        grossClearedPaid: rec.gross_cleared_paid,
        returnedAmount: rec.returned_amount,
        pendingClearance: rec.pending_clearance,
        balanceDue: rec.balance_due,
        paymentStatus: rec.payment_status,
        notes:
          rec.payment_status === "UNPAID"
            ? `Commercial Sales Invoice — Payment Pending. Payment terms: ${(rec.payment_terms || "Due on receipt").replace("_", " ")}.`
            : `Commercial Sales Invoice — Balance Pending (${fmt(rec.balance_due)} remaining).`,
      };

      printInvoice(cfg, invoiceData, "Commercial Invoice");
    } catch (err: any) {
      alert(err.message || "Failed to generate print invoice");
    }
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" />
              Receivables
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              Live Ledger
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Track unpaid and balance-pending commercial invoices, cheque clearances, and overdue aging.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={loading || isFetching}
            className="h-8 text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {onNavigateTab ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTab('cheques')}
                className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 cursor-pointer"
              >
                <Landmark className="h-3.5 w-3.5" /> Cheques Tab
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTab('sales')}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                <Store className="h-3.5 w-3.5" /> Sales Tab
              </Button>
            </>
          ) : (
            <>
              <Link href="/admin/finance/cheques">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
                  <Landmark className="h-3.5 w-3.5" /> Cheque Register
                </Button>
              </Link>
              <Link href="/admin/sales">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Store className="h-3.5 w-3.5" /> Sales Tracker
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Outstanding */}
        <div className="bg-card/70 backdrop-blur-sm border border-border p-3.5 rounded-xl shadow-xs col-span-2 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Outstanding
            </span>
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <DollarSign className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-lg font-black text-foreground">
              {loadingMetrics ? "..." : fmt(metrics?.total_outstanding || 0)}
            </span>
            <span className="text-[10px] text-muted-foreground block font-medium">
              {loadingMetrics ? "..." : `${metrics?.total_invoices || 0} open invoices`}
            </span>
          </div>
        </div>

        {/* Unpaid */}
        <div className="bg-card/70 backdrop-blur-sm border border-border p-3.5 rounded-xl shadow-xs col-span-1 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
              Unpaid
            </span>
            <span className="p-1 rounded-md bg-rose-500/10 text-rose-400">
              <XCircle className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-foreground">
              {loadingMetrics ? "..." : fmt(metrics?.unpaid_amount || 0)}
            </span>
            <span className="text-[9px] text-muted-foreground block font-medium">
              {metrics?.unpaid_count || 0} invoices
            </span>
          </div>
        </div>

        {/* Balance Pending */}
        <div className="bg-card/70 backdrop-blur-sm border border-border p-3.5 rounded-xl shadow-xs col-span-1 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Bal. Pending
            </span>
            <span className="p-1 rounded-md bg-amber-500/10 text-amber-400">
              <Clock className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-foreground">
              {loadingMetrics ? "..." : fmt(metrics?.balance_pending_amount || 0)}
            </span>
            <span className="text-[9px] text-muted-foreground block font-medium">
              {metrics?.balance_pending_count || 0} invoices
            </span>
          </div>
        </div>

        {/* Pending Cheques */}
        <div className="bg-card/70 backdrop-blur-sm border border-border p-3.5 rounded-xl shadow-xs col-span-1 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
              Cheques In Clearance
            </span>
            <span className="p-1 rounded-md bg-blue-500/10 text-blue-400">
              <Banknote className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-foreground">
              {loadingMetrics ? "..." : fmt(metrics?.pending_cheques || 0)}
            </span>
            <span className="text-[9px] text-muted-foreground block font-medium">
              {metrics?.pending_cheques_count || 0} cheques
            </span>
          </div>
        </div>

        {/* Due Today */}
        <div className="bg-card/70 backdrop-blur-sm border border-border p-3.5 rounded-xl shadow-xs col-span-1 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
              Due Today
            </span>
            <span className="p-1 rounded-md bg-amber-500/10 text-amber-500">
              <Calendar className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-foreground">
              {loadingMetrics ? "..." : fmt(metrics?.due_today_amount || 0)}
            </span>
            <span className="text-[9px] text-muted-foreground block font-medium">
              {metrics?.due_today_count || 0} invoices
            </span>
          </div>
        </div>

        {/* Due Next 7 Days */}
        <div className="bg-card/70 backdrop-blur-sm border border-border p-3.5 rounded-xl shadow-xs col-span-1 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
              Due Next 7D
            </span>
            <span className="p-1 rounded-md bg-cyan-500/10 text-cyan-400">
              <Calendar className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-foreground">
              {loadingMetrics ? "..." : fmt(metrics?.due_next_7_days_amount || 0)}
            </span>
            <span className="text-[9px] text-muted-foreground block font-medium">
              {metrics?.due_next_7_days_count || 0} invoices
            </span>
          </div>
        </div>

        {/* Total Overdue */}
        <div className="bg-card/70 backdrop-blur-sm border border-border p-3.5 rounded-xl shadow-xs col-span-1 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
              Total Overdue
            </span>
            <span className="p-1 rounded-md bg-rose-500/10 text-rose-500">
              <AlertTriangle className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-2">
            <span className="text-sm font-black text-rose-400">
              {loadingMetrics ? "..." : fmt(metrics?.overdue_amount || 0)}
            </span>
            <span className="text-[9px] text-muted-foreground block font-medium">
              {metrics?.overdue_count || 0} overdue
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card/60 backdrop-blur-sm border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { label: "All Outstanding", val: "all" },
              { label: "Unpaid", val: "unpaid" },
              { label: "Balance Pending", val: "balance_pending" },
              { label: "Due Today", val: "due_today" },
              { label: "Due Soon", val: "due_soon" },
              { label: "Overdue", val: "overdue" },
              { label: "Not Due", val: "not_due" },
            ].map((tab) => (
              <button
                key={tab.val}
                onClick={() => setStatusFilter(tab.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === tab.val
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search invoice #, customer, quotation..."
              className="pl-9 h-9 text-xs rounded-xl bg-background border-border"
            />
          </div>
        </div>

        {/* Secondary Filter Row: Aging Buckets, Terms, Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Aging Buckets:
            </span>
            {[
              { label: "All Aging", val: "all" },
              { label: "1–7 Days", val: "1_7" },
              { label: "8–30 Days", val: "8_30" },
              { label: "31–60 Days", val: "31_60" },
              { label: "61–90 Days", val: "61_90" },
              { label: "90+ Days", val: "90_plus" },
            ].map((bucket) => (
              <button
                key={bucket.val}
                onClick={() => setAgingBucket(bucket.val)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  agingBucket === bucket.val
                    ? "bg-muted text-foreground font-bold border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {bucket.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Terms:</span>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="h-7 text-xs rounded-lg bg-background border border-border px-2 outline-none"
              >
                <option value="all">All Terms</option>
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="net_7">Net 7</option>
                <option value="net_14">Net 14</option>
                <option value="net_30">Net 30</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sort:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="h-7 text-xs rounded-lg bg-background border border-border px-2 outline-none"
              >
                <option value="due_date_asc">Due Date (Earliest First)</option>
                <option value="due_date_desc">Due Date (Latest First)</option>
                <option value="balance_desc">Highest Balance First</option>
                <option value="newest">Newest Invoice First</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Receivables Table */}
      <div className="bg-card/70 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary" />
            <p className="text-xs font-semibold">Loading outstanding receivables...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-rose-500">
            <AlertCircle className="h-8 w-8 mb-2" />
            <p className="text-sm font-bold">Error loading receivables</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        ) : receivables.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <CheckCircle className="h-10 w-10 text-emerald-500 mb-2 opacity-80" />
            <p className="text-sm font-bold text-foreground">No Outstanding Receivables Found</p>
            <p className="text-xs mt-1">All commercial invoices in this filter are fully settled or cleared.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-muted-foreground font-bold text-[10px] uppercase tracking-wider">
                  <th className="p-3.5">Invoice No</th>
                  <th className="p-3.5">Customer / Dealer</th>
                  <th className="p-3.5">Terms & Invoice Date</th>
                  <th className="p-3.5">Due Date & Aging</th>
                  <th className="p-3.5 text-right">Invoice Total</th>
                  <th className="p-3.5 text-right">Cleared Paid</th>
                  <th className="p-3.5 text-right">Pending Cheques</th>
                  <th className="p-3.5 text-right">Balance Due</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {receivables.map((rec) => {
                  const isOverdue = rec.collection_status === "OVERDUE";
                  const isDueToday = rec.collection_status === "DUE TODAY";
                  const isDueSoon = rec.collection_status === "DUE SOON";

                  return (
                    <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                      {/* Invoice No */}
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-foreground text-xs">
                            {rec.invoice_number || `INV-${rec.id.slice(-6).toUpperCase()}`}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {rec.receipt_number}
                          </span>
                        </div>
                      </td>

                      {/* Customer / Dealer */}
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          {rec.customer_company ? (
                            <>
                              <span className="font-bold text-foreground">
                                {rec.customer_company}
                              </span>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                {rec.customer_name} {rec.customer_phone && rec.customer_phone !== '—' ? `· ${rec.customer_phone}` : ''}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-bold text-foreground">
                                {rec.customer_name || "Valued Customer"}
                              </span>
                              {rec.customer_phone && (
                                <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-2.5 w-2.5" />
                                  {rec.customer_phone}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Terms & Invoice Date */}
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-semibold capitalize text-foreground">
                            {(rec.payment_terms || "due_on_receipt").replace("_", " ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {rec.invoice_date ? new Date(rec.invoice_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          </span>
                        </div>
                      </td>

                      {/* Due Date & Aging */}
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-xs text-foreground">
                            {rec.due_date || "—"}
                          </span>
                          {isOverdue ? (
                            <span className="text-[10px] font-bold text-rose-500 flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" />
                              {rec.days_overdue} days overdue
                            </span>
                          ) : isDueToday ? (
                            <span className="text-[10px] font-bold text-amber-500 flex items-center gap-0.5">
                              <Clock className="h-3 w-3" /> Due Today
                            </span>
                          ) : isDueSoon ? (
                            <span className="text-[10px] font-semibold text-cyan-400">
                              Due in {Math.abs(rec.days_overdue)} days
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">
                              Not due yet
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="p-3.5 text-right font-bold text-foreground">
                        {fmt(rec.invoice_total)}
                      </td>

                      {/* Cleared Paid */}
                      <td className="p-3.5 text-right text-emerald-400 font-bold">
                        {fmt(rec.cleared_paid)}
                      </td>

                      {/* Pending Cheques */}
                      <td className="p-3.5 text-right">
                        {rec.pending_clearance > 0 ? (
                          <span className="text-amber-400 font-bold">
                            {fmt(rec.pending_clearance)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      {/* Balance Due */}
                      <td className="p-3.5 text-right">
                        <span className="font-mono font-black text-rose-400 text-sm">
                          {fmt(rec.balance_due)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              rec.payment_status === "UNPAID"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {rec.payment_status}
                          </span>
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider ${
                              isOverdue
                                ? "bg-rose-900/40 text-rose-300"
                                : isDueToday
                                ? "bg-amber-900/40 text-amber-300"
                                : isDueSoon
                                ? "bg-cyan-900/40 text-cyan-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {rec.collection_status}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {rec.available_to_record > 0 && (
                            <Button
                              size="sm"
                              onClick={() => handleOpenRecordPayment(rec)}
                              className="h-7 text-[10px] font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 cursor-pointer shadow-xs"
                            >
                              <Banknote className="h-3 w-3" /> Record Pay
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintReceivableInvoice(rec)}
                            title="Print Commercial Invoice"
                            className="h-7 w-7 p-0 rounded-lg cursor-pointer"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenSaleDetails(rec)}
                            title="View Invoice & Ledger Details"
                            className="h-7 w-7 p-0 rounded-lg cursor-pointer text-blue-400 hover:text-blue-300"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} open invoices
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="text-xs font-semibold px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* RECORD PAYMENT MODAL */}
      {showRecordPaymentModal && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-500" />
                <h3 className="font-bold text-foreground text-sm">Record Invoice Payment</h3>
              </div>
              <button
                onClick={() => {
                  setShowRecordPaymentModal(false);
                  setPaymentActionMessage(null);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="p-6 space-y-4">
              {paymentActionMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    paymentActionMessage.type === "success"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  }`}
                >
                  {paymentActionMessage.type === "success" ? (
                    <CheckCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{paymentActionMessage.text}</span>
                </div>
              )}

              {/* Invoice Summary Card */}
              <div className="bg-muted/40 p-3 rounded-xl border border-border space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice No:</span>
                  <span className="font-mono font-bold text-foreground">
                    {selectedReceivable.invoice_number || `INV-${selectedReceivable.id.slice(-6).toUpperCase()}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer / Dealer:</span>
                  <span className="font-bold text-foreground">
                    {selectedReceivable.customer_company 
                      ? `${selectedReceivable.customer_company} (${selectedReceivable.customer_name})`
                      : selectedReceivable.customer_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice Total:</span>
                  <span className="font-bold text-foreground">{fmt(selectedReceivable.invoice_total)}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Cleared Paid:</span>
                  <span className="font-bold">{fmt(selectedReceivable.cleared_paid)}</span>
                </div>
                {selectedReceivable.pending_clearance > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Pending Cheques:</span>
                    <span className="font-bold">{fmt(selectedReceivable.pending_clearance)}</span>
                  </div>
                )}
                <div className="flex justify-between text-rose-400 font-bold border-t border-border/50 pt-1">
                  <span>Balance Due:</span>
                  <span>{fmt(selectedReceivable.balance_due)}</span>
                </div>
                <div className="flex justify-between text-primary font-bold">
                  <span>Available to Record:</span>
                  <span>{fmt(selectedReceivable.available_to_record)}</span>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["cash", "cheque", "bank_transfer", "card"] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setRecordMethod(m)}
                      className={`p-2 rounded-xl border text-xs font-bold capitalize flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        recordMethod === m
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m === "cash" ? (
                        <Banknote className="h-4 w-4" />
                      ) : m === "cheque" ? (
                        <FileText className="h-4 w-4" />
                      ) : m === "bank_transfer" ? (
                        <Store className="h-4 w-4" />
                      ) : (
                        <CreditCard className="h-4 w-4" />
                      )}
                      <span>{m.replace("_", " ")}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Payment Amount (LKR)
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecordAmount(String(selectedReceivable.available_to_record))}
                    className="text-[10px] text-primary hover:underline font-bold"
                  >
                    Set Full Balance ({fmt(selectedReceivable.available_to_record)})
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedReceivable.available_to_record}
                  value={recordAmount}
                  onChange={(e) => setRecordAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono text-base font-bold"
                  required
                />
              </div>

              {/* Cheque Specific Fields */}
              {recordMethod === "cheque" && (
                <div className="space-y-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl animate-in fade-in">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                        Cheque Number *
                      </label>
                      <Input
                        type="text"
                        value={recordChequeNumber}
                        onChange={(e) => setRecordChequeNumber(e.target.value)}
                        placeholder="e.g. CHQ-889900"
                        className="h-8 text-xs font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                        Cheque Date *
                      </label>
                      <Input
                        type="date"
                        value={recordChequeDate}
                        onChange={(e) => setRecordChequeDate(e.target.value)}
                        className="h-8 text-xs font-mono"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                      Bank Name
                    </label>
                    <Input
                      type="text"
                      value={recordBankName}
                      onChange={(e) => setRecordBankName(e.target.value)}
                      placeholder="e.g. Commercial Bank / Sampath Bank"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                      Cheque Notes / Drawer Name
                    </label>
                    <Input
                      type="text"
                      value={recordChequeNotes}
                      onChange={(e) => setRecordChequeNotes(e.target.value)}
                      placeholder="e.g. Post-dated cheque"
                      className="h-8 text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-amber-300/80">
                    * Cheque payments enter the ledger as <strong>PENDING CLEARANCE</strong> and reserve against the balance until cleared.
                  </p>
                </div>
              )}

              {/* General Reference */}
              {recordMethod !== "cheque" && (
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Reference / Slip No (Optional)
                  </label>
                  <Input
                    type="text"
                    value={recordReference}
                    onChange={(e) => setRecordReference(e.target.value)}
                    placeholder="e.g. Bank slip reference, card transaction ID"
                    className="h-9 text-xs"
                  />
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRecordPaymentModal(false)}
                  disabled={isRecordingPayment}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isRecordingPayment}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
                >
                  {isRecordingPayment ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recording...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3.5 w-3.5" /> Confirm Payment
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RETURN PAYMENT (REVERSAL) MODAL */}
      {showReturnPaymentModal && targetPaymentForReturn && selectedReceivable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-rose-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-rose-500/10">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-rose-400" />
                <h3 className="font-bold text-foreground text-sm">Return Payment / Financial Reversal</h3>
              </div>
              <button
                onClick={() => {
                  setShowReturnPaymentModal(false);
                  setReturnActionMessage(null);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleReturnPaymentSubmit} className="p-6 space-y-4">
              {returnActionMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    returnActionMessage.type === "success"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  }`}
                >
                  {returnActionMessage.type === "success" ? (
                    <CheckCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{returnActionMessage.text}</span>
                </div>
              )}

              {/* Target Payment Summary */}
              <div className="bg-muted/40 p-3 rounded-xl border border-border space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Payment Method:</span>
                  <span className="font-bold text-foreground uppercase">
                    {targetPaymentForReturn.payment_method.replace("_", " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Payment Amount:</span>
                  <span className="font-mono font-bold text-foreground">{fmt(targetPaymentForReturn.amount)}</span>
                </div>
                {(targetPaymentForReturn.returned_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-rose-400 font-medium">
                    <span>Already Returned:</span>
                    <span>-{fmt(targetPaymentForReturn.returned_amount!)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border/60 pt-1 text-emerald-400 font-bold">
                  <span>Remaining Reversible:</span>
                  <span>{fmt(targetPaymentForReturn.remaining_reversible ?? targetPaymentForReturn.amount)}</span>
                </div>
              </div>

              {/* Return Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Return Amount (LKR) *
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setReturnAmount(
                        String(targetPaymentForReturn.remaining_reversible ?? targetPaymentForReturn.amount)
                      )
                    }
                    className="text-[10px] text-primary hover:underline font-bold"
                  >
                    Max ({fmt(targetPaymentForReturn.remaining_reversible ?? targetPaymentForReturn.amount)})
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={targetPaymentForReturn.remaining_reversible ?? targetPaymentForReturn.amount}
                  value={returnAmount}
                  onChange={(e) => setReturnAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono text-base font-bold text-rose-400"
                  required
                />
              </div>

              {/* Return Reason */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Reason for Return *
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  required
                >
                  <option value="Customer refund">Customer refund</option>
                  <option value="Duplicate payment">Duplicate payment</option>
                  <option value="Overpayment">Overpayment</option>
                  <option value="Payment correction">Payment correction</option>
                  <option value="Order adjustment">Order adjustment</option>
                  <option value="Other">Other (specify in notes)</option>
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Reference / Voucher # (Optional)
                </label>
                <Input
                  type="text"
                  value={returnReference}
                  onChange={(e) => setReturnReference(e.target.value)}
                  placeholder="e.g. Refund slip #, bank transaction reference"
                  className="h-9 text-xs"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Notes {returnReason === "Other" ? "*" : "(Optional)"}
                </label>
                <Input
                  type="text"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder={returnReason === "Other" ? "Detailed explanation required" : "Additional remarks"}
                  className="h-9 text-xs"
                  required={returnReason === "Other"}
                />
              </div>

              {/* Warning Alert */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-[11px] text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <strong>Financial Audit Record:</strong> This action records a permanent financial reversal against this payment. Product inventory and stock counts will <strong>NOT</strong> be changed.
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReturnPaymentModal(false)}
                  disabled={isSubmittingReturn}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    isSubmittingReturn ||
                    !returnAmount ||
                    parseFloat(returnAmount) <= 0 ||
                    parseFloat(returnAmount) > (targetPaymentForReturn.remaining_reversible ?? targetPaymentForReturn.amount) ||
                    (returnReason === "Other" && !returnNotes.trim())
                  }
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1.5"
                >
                  {isSubmittingReturn ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing Return...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" /> Confirm Payment Return
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SALE & PAYMENT LEDGER DETAILS MODAL */}
      {selectedReceivable && !showRecordPaymentModal && !showReturnPaymentModal && selectedSaleDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground text-sm">
                  Invoice & Multi-Payment Ledger — {selectedReceivable.invoice_number || `INV-${selectedReceivable.id.slice(-6).toUpperCase()}`}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedReceivable(null);
                  setSelectedSaleDetails(null);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 p-3.5 rounded-xl border border-border text-xs">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Customer / Dealer</p>
                  <p className="font-bold text-foreground mt-0.5">
                    {selectedSaleDetails.sale.customer_company 
                      ? `${selectedSaleDetails.sale.customer_company} (${selectedSaleDetails.sale.customer_name})`
                      : (selectedSaleDetails.sale.customer_name || "Walk-in")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Payment Terms</p>
                  <p className="font-bold text-foreground capitalize mt-0.5">
                    {(selectedSaleDetails.sale.payment_terms || "due_on_receipt").replace("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Due Date</p>
                  <p className="font-bold text-foreground mt-0.5">{selectedSaleDetails.sale.due_date || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Issued By</p>
                  <p className="font-bold text-foreground mt-0.5">{selectedSaleDetails.sale.issued_by_name || selectedSaleDetails.sale.cashier_name || "Admin Staff"}</p>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="text-[10px] uppercase font-black text-muted-foreground tracking-wider mb-2">
                  Invoice Items ({selectedSaleDetails.items.length})
                </h4>
                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border text-muted-foreground font-bold text-[10px]">
                        <th className="p-2.5">Item</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Unit Price</th>
                        <th className="p-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedSaleDetails.items.map((it) => (
                        <tr key={it.id}>
                          <td className="p-2.5 font-medium">
                            <p className="font-bold text-foreground">{it.product_name}</p>
                            {it.unit_serial && (
                              <span className="font-mono text-[9px] text-muted-foreground">SN: {it.unit_serial}</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">{it.quantity}</td>
                          <td className="p-2.5 text-right">{fmt(it.unit_price)}</td>
                          <td className="p-2.5 text-right font-bold">{fmt(it.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments Ledger Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[10px] uppercase font-black text-muted-foreground tracking-wider">
                    Recorded Payments ({salePayments.length})
                  </h4>
                  {salePaymentSummary && salePaymentSummary.available_to_record > 0 && (
                    <Button
                      size="sm"
                      onClick={() => handleOpenRecordPayment(selectedReceivable)}
                      className="h-6 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2"
                    >
                      <Banknote className="h-3 w-3 mr-1" /> Add Payment
                    </Button>
                  )}
                </div>

                <div className="border border-border rounded-xl overflow-hidden">
                  {salePayments.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No payments recorded yet. Invoice is 100% outstanding.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border text-muted-foreground font-bold text-[10px]">
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Method</th>
                          <th className="p-2.5">Details</th>
                          <th className="p-2.5 text-right">Amount</th>
                          <th className="p-2.5 text-center">Status</th>
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {salePayments.map((p) => (
                          <tr key={p.id}>
                            <td className="p-2.5 text-muted-foreground font-mono text-[10px]">
                              {p.created_at ? new Date(p.created_at).toLocaleDateString("en-GB") : "—"}
                            </td>
                            <td className="p-2.5 font-bold uppercase text-[10px] text-foreground">
                              {p.payment_method.replace("_", " ")}
                            </td>
                            <td className="p-2.5 text-[11px]">
                              {p.payment_method === "cheque" ? (
                                <div className="space-y-0.5">
                                  <div className="font-mono font-bold text-amber-400">CHQ: {p.cheque_number}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    Bank: {p.bank_name || "N/A"} | Date: {p.cheque_date}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">{p.reference || "Standard Payment"}</span>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-bold text-foreground">
                              <div>{fmt(p.amount)}</div>
                              {p.returned_amount !== undefined && p.returned_amount > 0 && (
                                <div className="space-y-0.5 mt-0.5">
                                  <div className="text-[9px] text-rose-400 font-normal">
                                    Ret: -{fmt(p.returned_amount)}
                                  </div>
                                  <div className="text-[9px] text-emerald-400 font-bold">
                                    Net: {fmt(p.net_amount ?? (p.amount - p.returned_amount))}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                  p.status === "cleared"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    : p.status === "pending"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                                    : p.status === "bounced"
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {p.payment_method === "cheque" && p.status === "pending" && (
                                  <>
                                    <button
                                      onClick={() => handleUpdateChequeStatus(p.id, "cleared")}
                                      className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                                    >
                                      Clear
                                    </button>
                                    <button
                                      onClick={() => handleUpdateChequeStatus(p.id, "bounced")}
                                      className="px-2 py-0.5 text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded cursor-pointer"
                                    >
                                      Bounce
                                    </button>
                                  </>
                                )}
                                {p.status === "cleared" && (p.remaining_reversible ?? p.amount) > 0 && (
                                  <button
                                    onClick={() => handleOpenReturnPayment(p)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded cursor-pointer transition-colors"
                                    title="Return / Reverse Payment"
                                  >
                                    <RotateCcw className="h-2.5 w-2.5" /> Return
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Payment Reversals Ledger */}
              {salePaymentReversals.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase font-black text-rose-400 tracking-wider mb-2 flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" /> Payment Returns &amp; Reversals ({salePaymentReversals.length})
                  </h4>
                  <div className="border border-rose-500/20 rounded-xl overflow-hidden bg-rose-500/5">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-rose-500/10 border-b border-rose-500/20 text-rose-300 font-bold text-[10px]">
                          <th className="p-2.5">Reversal #</th>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Reason</th>
                          <th className="p-2.5">Ref / Notes</th>
                          <th className="p-2.5 text-right">Amount Returned</th>
                          <th className="p-2.5 text-right">By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-500/10">
                        {salePaymentReversals.map((rev) => (
                          <tr key={rev.id}>
                            <td className="p-2.5 font-mono font-bold text-rose-400 text-[11px]">
                              {rev.reversal_number}
                            </td>
                            <td className="p-2.5 text-muted-foreground font-mono text-[10px]">
                              {rev.created_at ? new Date(rev.created_at).toLocaleDateString("en-GB") : "—"}
                            </td>
                            <td className="p-2.5 font-medium text-foreground">
                              {rev.reason}
                            </td>
                            <td className="p-2.5 text-muted-foreground text-[11px]">
                              {rev.reference || rev.notes || "—"}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-400">
                              -{fmt(rev.amount)}
                            </td>
                            <td className="p-2.5 text-right text-muted-foreground text-[10px]">
                              {rev.reversed_by}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Balance Breakdown Card */}
              <div className="bg-muted/40 p-4 rounded-xl border border-border space-y-2 text-xs">
                <div className="flex justify-between font-bold text-foreground">
                  <span>INVOICE TOTAL</span>
                  <span className="text-primary text-sm">{fmt(selectedSaleDetails.sale.total)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>Payments Received (Gross)</span>
                  <span>{fmt(salePaymentSummary?.gross_cleared_paid ?? selectedReceivable.cleared_paid)}</span>
                </div>
                {salePaymentSummary && (salePaymentSummary.returned_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-rose-400 font-bold">
                    <span>Payments Returned</span>
                    <span>-{fmt(salePaymentSummary.returned_amount!)}</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-400 font-extrabold">
                  <span>Effective Paid</span>
                  <span>{fmt(salePaymentSummary?.effective_cleared_paid ?? selectedReceivable.cleared_paid)}</span>
                </div>
                {selectedReceivable.pending_clearance > 0 && (
                  <div className="flex justify-between text-amber-400 font-bold">
                    <span>Pending Cheque Clearance</span>
                    <span>{fmt(selectedReceivable.pending_clearance)}</span>
                  </div>
                )}
                <div className="flex justify-between text-rose-400 font-black text-sm border-t border-border pt-2">
                  <span>BALANCE DUE</span>
                  <span>{fmt(salePaymentSummary?.balance_due ?? selectedReceivable.balance_due)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border bg-muted/20 flex justify-end gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedReceivable(null);
                  setSelectedSaleDetails(null);
                }}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => handlePrintReceivableInvoice(selectedReceivable)}
                className="gap-1 bg-primary text-primary-foreground font-bold text-xs"
              >
                <Printer className="h-3.5 w-3.5" /> Print Invoice
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
