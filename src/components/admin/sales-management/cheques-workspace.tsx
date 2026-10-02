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
  X,
  FileText,
  AlertTriangle,
  RefreshCw,
  Landmark,
  ArrowUpRight,
  Filter,
  CheckCheck,
  Ban,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getChequeRegisterAction,
  getChequeRegisterMetricsAction,
  updateChequeStatusAction,
} from "@/app/actions/admin";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import type {
  ChequeRegisterItem,
  ChequeRegisterMetrics,
  PaymentRecordStatus,
} from "@/types/pos";

function fmt(amount: number) {
  return amount.toLocaleString("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  });
}

const BOUNCE_REASONS = [
  "Insufficient funds",
  "Signature mismatch",
  "Account closed",
  "Payment stopped / frozen",
  "Post-dated / stale dated",
  "Words and figures differ",
  "Other",
];

const CANCEL_REASONS = [
  "Cheque replaced by cash/bank transfer",
  "Cheque replaced by new cheque",
  "Order/invoice terms amended",
  "Issued with error in name/amount",
  "Other",
];

export interface ChequesWorkspaceProps {
  isActive?: boolean;
  initialSearch?: string;
  onNavigateTab?: (view: 'sales' | 'quotations' | 'receivables' | 'cheques', params?: { search?: string; id?: string }) => void;
}

export default function ChequesWorkspace({
  isActive = true,
  initialSearch,
  onNavigateTab,
}: ChequesWorkspaceProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch || "");
  const [debouncedSearch] = useDebounce(searchQuery, 400);

  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("priority");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Sync external search if passed
  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  // Selected Cheque for Details Modal
  const [selectedCheque, setSelectedCheque] = useState<ChequeRegisterItem | null>(null);

  // Status Transition Modals
  const [clearTarget, setClearTarget] = useState<ChequeRegisterItem | null>(null);
  const [clearNotes, setClearNotes] = useState("");

  const [bounceTarget, setBounceTarget] = useState<ChequeRegisterItem | null>(null);
  const [bounceReason, setBounceReason] = useState(BOUNCE_REASONS[0]);
  const [bounceNotes, setBounceNotes] = useState("");

  const [cancelTarget, setCancelTarget] = useState<ChequeRegisterItem | null>(null);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelNotes, setCancelNotes] = useState("");

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
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
  }, [debouncedSearch, statusFilter, sort, pageSize]);

  // Cheque Register query (lazy loaded when tab is active)
  const {
    data: chequeData,
    isLoading: loading,
    isFetching,
    error: chequeError,
    refetch: refetchCheques,
  } = useQuery({
    queryKey: ["cheque-register", page, pageSize, debouncedSearch, statusFilter, sort],
    queryFn: async () => {
      const res = await getChequeRegisterAction({
        page,
        pageSize,
        search: debouncedSearch,
        filter: statusFilter,
        sort,
      });
      if (!res.success) {
        throw new Error(res.error || "Failed to fetch cheque register");
      }
      return res;
    },
    enabled: isActive,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // Metrics query (lazy loaded when tab is active)
  const {
    data: metricsData,
    isLoading: loadingMetrics,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["cheque-register-metrics", debouncedSearch],
    queryFn: async () => {
      const res = await getChequeRegisterMetricsAction(debouncedSearch);
      if (!res.success) {
        throw new Error(res.error || "Failed to fetch cheque metrics");
      }
      return res.data;
    },
    enabled: isActive,
    staleTime: 30_000,
  });

  const handleClearConfirm = async () => {
    if (!clearTarget) return;
    setIsUpdatingStatus(true);
    setActionFeedback(null);
    try {
      const res = await updateChequeStatusAction({
        paymentId: clearTarget.payment_id,
        newStatus: "cleared",
        notes: clearNotes.trim() ? `[Cleared] ${clearNotes.trim()}` : undefined,
      });
      if (!res.success) {
        setActionFeedback({ type: "error", text: res.error || "Failed to clear cheque." });
        return;
      }
      setActionFeedback({
        type: "success",
        text: `Cheque #${clearTarget.cheque_number || "N/A"} (LKR ${clearTarget.amount.toLocaleString()}) has been marked CLEARED. Invoice balances updated.`,
      });
      setClearTarget(null);
      setClearNotes("");
      if (selectedCheque && selectedCheque.payment_id === clearTarget.payment_id) {
        setSelectedCheque((prev) => prev ? { ...prev, status: 'cleared', operational_state: 'CLEARED' } : null);
      }
      void queryClient.invalidateQueries({ queryKey: ["cheque-register"] });
      void queryClient.invalidateQueries({ queryKey: ["cheque-register-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["outstanding-receivables"] });
      void queryClient.invalidateQueries({ queryKey: ["outstanding-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["unified-sales"] });
    } catch (err: any) {
      setActionFeedback({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleBounceConfirm = async () => {
    if (!bounceTarget) return;
    setIsUpdatingStatus(true);
    setActionFeedback(null);
    try {
      const fullReason = bounceNotes.trim()
        ? `${bounceReason} — ${bounceNotes.trim()}`
        : bounceReason;
      const res = await updateChequeStatusAction({
        paymentId: bounceTarget.payment_id,
        newStatus: "bounced",
        notes: `[Bounced] ${fullReason}`,
      });
      if (!res.success) {
        setActionFeedback({ type: "error", text: res.error || "Failed to bounce cheque." });
        return;
      }
      setActionFeedback({
        type: "success",
        text: `Cheque #${bounceTarget.cheque_number || "N/A"} marked BOUNCED. Pending clearance reservation released.`,
      });
      setBounceTarget(null);
      setBounceReason(BOUNCE_REASONS[0]);
      setBounceNotes("");
      if (selectedCheque && selectedCheque.payment_id === bounceTarget.payment_id) {
        setSelectedCheque((prev) => prev ? { ...prev, status: 'bounced', operational_state: 'BOUNCED' } : null);
      }
      void queryClient.invalidateQueries({ queryKey: ["cheque-register"] });
      void queryClient.invalidateQueries({ queryKey: ["cheque-register-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["outstanding-receivables"] });
      void queryClient.invalidateQueries({ queryKey: ["outstanding-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["unified-sales"] });
    } catch (err: any) {
      setActionFeedback({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setIsUpdatingStatus(true);
    setActionFeedback(null);
    try {
      const fullReason = cancelNotes.trim()
        ? `${cancelReason} — ${cancelNotes.trim()}`
        : cancelReason;
      const res = await updateChequeStatusAction({
        paymentId: cancelTarget.payment_id,
        newStatus: "cancelled",
        notes: `[Cancelled] ${fullReason}`,
      });
      if (!res.success) {
        setActionFeedback({ type: "error", text: res.error || "Failed to cancel cheque." });
        return;
      }
      setActionFeedback({
        type: "success",
        text: `Cheque #${cancelTarget.cheque_number || "N/A"} marked CANCELLED. Pending clearance released.`,
      });
      setCancelTarget(null);
      setCancelReason(CANCEL_REASONS[0]);
      setCancelNotes("");
      if (selectedCheque && selectedCheque.payment_id === cancelTarget.payment_id) {
        setSelectedCheque((prev) => prev ? { ...prev, status: 'cancelled', operational_state: 'CANCELLED' } : null);
      }
      void queryClient.invalidateQueries({ queryKey: ["cheque-register"] });
      void queryClient.invalidateQueries({ queryKey: ["cheque-register-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["outstanding-receivables"] });
      void queryClient.invalidateQueries({ queryKey: ["outstanding-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["unified-sales"] });
    } catch (err: any) {
      setActionFeedback({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const items = chequeData?.data || [];
  const total = chequeData?.total || 0;
  const totalPages = chequeData?.totalPages || 1;
  const metrics = metricsData;

  const renderStatusBadge = (status: PaymentRecordStatus) => {
    switch (status) {
      case "cleared":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle className="h-3 w-3" /> CLEARED
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <Clock className="h-3 w-3" /> PENDING CLEARANCE
          </span>
        );
      case "bounced":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
            <XCircle className="h-3 w-3" /> BOUNCED
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            <Ban className="h-3 w-3" /> CANCELLED
          </span>
        );
      default:
        return <span className="text-xs text-muted-foreground">{status}</span>;
    }
  };

  const renderOperationalState = (item: ChequeRegisterItem) => {
    if (item.status !== "pending") {
      return (
        <span className="text-xs text-muted-foreground font-medium">
          {item.status.toUpperCase()}
        </span>
      );
    }

    if (item.operational_state === "DUE TODAY") {
      return (
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-black bg-purple-500/15 text-purple-600 border border-purple-500/30 w-fit animate-pulse">
            <AlertCircle className="h-3 w-3" /> DUE TODAY
          </span>
          <span className="text-[10px] text-purple-600 font-semibold mt-0.5">Maturing today</span>
        </div>
      );
    }

    if (item.operational_state === "OVERDUE FOR REVIEW") {
      return (
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-600 border border-rose-500/30 w-fit">
            <AlertTriangle className="h-3 w-3" /> OVERDUE FOR REVIEW
          </span>
          <span className="text-[10px] text-rose-600 font-semibold mt-0.5">
            {item.days_overdue} day{item.days_overdue === 1 ? "" : "s"} overdue
          </span>
        </div>
      );
    }

    if (item.operational_state === "UPCOMING") {
      return (
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 w-fit">
            <Calendar className="h-3 w-3" /> UPCOMING
          </span>
          <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
            in {item.days_diff} day{item.days_diff === 1 ? "" : "s"}
          </span>
        </div>
      );
    }

    return <span className="text-xs text-muted-foreground font-medium">{item.operational_state}</span>;
  };

  const filterTabs = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending Clearance", count: metrics?.pending_count },
    { id: "due_today", label: "Due Today", count: metrics?.due_today_count, urgent: true },
    { id: "overdue", label: "Overdue for Review", count: metrics?.overdue_count, warning: true },
    { id: "upcoming", label: "Upcoming", count: metrics?.upcoming_count },
    { id: "cleared", label: "Cleared" },
    { id: "bounced", label: "Bounced" },
    { id: "cancelled", label: "Cancelled" },
  ];

  if (!mounted) return null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                Cheques
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  Finance Ledger
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Authoritative cheque register, maturity tracking, clearance workflows &amp; deposit alerts
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {onNavigateTab ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab('receivables')}
              className="text-xs border-border/80 hover:bg-muted font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Receivables Tab
            </Button>
          ) : (
            <Link href="/admin/finance/outstanding">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-border/80 hover:bg-muted font-medium flex items-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Outstanding Receivables
              </Button>
            </Link>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchCheques();
              void refetchMetrics();
            }}
            disabled={loading || isFetching}
            className="text-xs border-border/80 hover:bg-muted font-medium flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-blue-500" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold ${
            actionFeedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
              : "bg-rose-500/10 border-rose-500/30 text-rose-600"
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === "success" ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{actionFeedback.text}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Pending Clearance */}
        <div
          onClick={() => setStatusFilter("pending")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "pending"
              ? "bg-amber-500/10 border-amber-500/40 shadow-sm"
              : "bg-card border-border hover:border-amber-500/30 hover:bg-amber-500/5"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
              Pending Clearance
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-foreground">
            {loadingMetrics ? "..." : fmt(metrics?.pending_amount || 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 font-medium">
            {loadingMetrics ? "..." : `${metrics?.pending_count || 0} cheques held`}
          </div>
        </div>

        {/* Due Today */}
        <div
          onClick={() => setStatusFilter("due_today")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "due_today"
              ? "bg-purple-500/15 border-purple-500/50 shadow-sm"
              : "bg-card border-border hover:border-purple-500/40 hover:bg-purple-500/5"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
              Due Today
            </span>
            <AlertCircle className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-xl font-black text-purple-600 dark:text-purple-400">
            {loadingMetrics ? "..." : fmt(metrics?.due_today_amount || 0)}
          </div>
          <div className="text-[11px] text-purple-600/80 font-medium mt-1">
            {loadingMetrics ? "..." : `${metrics?.due_today_count || 0} ready to deposit`}
          </div>
        </div>

        {/* Upcoming */}
        <div
          onClick={() => setStatusFilter("upcoming")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "upcoming"
              ? "bg-blue-500/10 border-blue-500/40 shadow-sm"
              : "bg-card border-border hover:border-blue-500/30 hover:bg-blue-500/5"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
              Upcoming
            </span>
            <Calendar className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-foreground">
            {loadingMetrics ? "..." : fmt(metrics?.upcoming_amount || 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 font-medium">
            {loadingMetrics ? "..." : `${metrics?.upcoming_count || 0} post-dated cheques`}
          </div>
        </div>

        {/* Overdue for Review */}
        <div
          onClick={() => setStatusFilter("overdue")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "overdue"
              ? "bg-rose-500/15 border-rose-500/50 shadow-sm"
              : "bg-card border-border hover:border-rose-500/40 hover:bg-rose-500/5"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
              Overdue Review
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-xl font-black text-rose-600 dark:text-rose-400">
            {loadingMetrics ? "..." : fmt(metrics?.overdue_amount || 0)}
          </div>
          <div className="text-[11px] text-rose-600/80 font-medium mt-1">
            {loadingMetrics ? "..." : `${metrics?.overdue_count || 0} requires action`}
          </div>
        </div>

        {/* Cleared This Month */}
        <div
          onClick={() => setStatusFilter("cleared")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "cleared"
              ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm"
              : "bg-card border-border hover:border-emerald-500/30 hover:bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
              Cleared This Month
            </span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
            {loadingMetrics ? "..." : fmt(metrics?.cleared_this_month_amount || 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 font-medium">
            {loadingMetrics ? "..." : `${metrics?.cleared_this_month_count || 0} cheques cleared`}
          </div>
        </div>

        {/* Bounced This Month */}
        <div
          onClick={() => setStatusFilter("bounced")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "bounced"
              ? "bg-rose-500/10 border-rose-500/40 shadow-sm"
              : "bg-card border-border hover:border-rose-500/30 hover:bg-rose-500/5"
          }`}
        >
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
              Bounced This Month
            </span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-xl font-black text-foreground">
            {loadingMetrics ? "..." : fmt(metrics?.bounced_this_month_amount || 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 font-medium">
            {loadingMetrics ? "..." : `${metrics?.bounced_this_month_count || 0} cheques bounced`}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-2xs space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {filterTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/70 bg-muted/30"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isActive
                        ? "bg-white/20 text-white"
                        : tab.urgent
                        ? "bg-purple-500/20 text-purple-600"
                        : tab.warning
                        ? "bg-rose-500/20 text-rose-600"
                        : "bg-muted-foreground/20 text-foreground"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search, Sort, Page Size bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Cheque #, Invoice #, Customer / Dealer name, Bank name..."
              className="pl-10 h-10 text-xs rounded-xl bg-background border-border/80 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-10 px-3 text-xs rounded-xl bg-background border border-border/80 text-foreground focus:border-blue-500 font-medium"
            >
              <option value="priority">Sort: Actionable Priority</option>
              <option value="cheque_date_asc">Cheque Date: Earliest First</option>
              <option value="cheque_date_desc">Cheque Date: Latest First</option>
              <option value="amount_desc">Amount: High to Low</option>
              <option value="amount_asc">Amount: Low to High</option>
              <option value="payment_date_desc">Recently Received</option>
            </select>

            {/* Page Size */}
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-10 px-3 text-xs rounded-xl bg-background border border-border/80 text-foreground focus:border-blue-500 font-medium"
            >
              <option value="20">20 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Cheque Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Cheque # &amp; Bank</th>
                <th className="py-3 px-4">Customer / Dealer</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Received Date</th>
                <th className="py-3 px-4">Cheque Date</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Stored Status</th>
                <th className="py-3 px-4">Operational State</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-blue-500 mx-auto" />
                    <p className="text-xs text-muted-foreground mt-2 font-semibold">
                      Loading cheque register...
                    </p>
                  </td>
                </tr>
              ) : chequeError ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-rose-500">
                    <AlertTriangle className="h-7 w-7 mx-auto mb-2" />
                    <p className="text-xs font-bold">Failed to load cheque data</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {(chequeError as Error).message}
                    </p>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-muted-foreground">
                    <Landmark className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs font-bold">No cheques found</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {searchQuery
                        ? `No results matching "${searchQuery}"`
                        : "No cheques matching the selected filter"}
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const custName =
                    item.dealer_company ||
                    item.dealer_contact ||
                    item.customer_name ||
                    item.customer_email ||
                    "Direct Customer";
                  const invNum = item.invoice_number || item.receipt_number || "INV";
                  const isPending = item.status === "pending";

                  return (
                    <tr
                      key={item.payment_id}
                      className="hover:bg-muted/30 transition-colors group"
                    >
                      {/* Cheque # & Bank */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-foreground flex items-center gap-1.5">
                          <Landmark className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          <span>{item.cheque_number || "N/A"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                          {item.bank_name || "Unknown Bank"}
                        </div>
                      </td>

                      {/* Customer / Dealer */}
                      <td className="py-3.5 px-4 max-w-[200px] truncate">
                        <div className="font-semibold text-foreground truncate" title={custName}>
                          {custName}
                        </div>
                        {item.dealer_company && (
                          <div className="text-[10px] text-purple-600 font-semibold mt-0.5 flex items-center gap-1">
                            <span>Wholesale Dealer</span>
                          </div>
                        )}
                      </td>

                      {/* Invoice # */}
                      <td className="py-3.5 px-4">
                        {onNavigateTab ? (
                          <button
                            onClick={() => onNavigateTab('sales', { id: item.sale_id || undefined, search: invNum })}
                            className="font-mono font-bold text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 cursor-pointer text-left"
                            title="Open Central Commercial Invoice Workspace"
                          >
                            {invNum}
                            <ArrowUpRight className="h-3 w-3 opacity-70" />
                          </button>
                        ) : (
                          <Link
                            href={`/admin/sales?search=${encodeURIComponent(invNum)}`}
                            className="font-mono font-bold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                            title="View Invoice in Sales Tracker"
                          >
                            {invNum}
                            <ArrowUpRight className="h-3 w-3 opacity-70" />
                          </Link>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Bal: LKR {item.invoice_balance_due.toLocaleString()}
                        </div>
                      </td>

                      {/* Received Date */}
                      <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                        {item.payment_date ? (
                          <span>{new Date(item.payment_date).toLocaleDateString("en-LK")}</span>
                        ) : (
                          <span className="text-[10px] italic">Not set</span>
                        )}
                      </td>

                      {/* Cheque Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-foreground">
                          {item.cheque_date ? (
                            new Date(item.cheque_date).toLocaleDateString("en-LK", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          ) : (
                            <span className="text-muted-foreground italic">N/A</span>
                          )}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="font-bold text-foreground text-sm">
                          {fmt(item.amount)}
                        </span>
                      </td>

                      {/* Stored Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(item.status)}
                      </td>

                      {/* Operational State */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderOperationalState(item)}
                      </td>

                      {/* Recorded By */}
                      <td className="py-3.5 px-4 text-muted-foreground text-[11px] truncate max-w-[120px]" title={item.created_by || "System"}>
                        {item.created_by || "Staff"}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {isPending ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setClearTarget(item);
                                  setClearNotes("");
                                }}
                                className="h-7 px-2 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30"
                                title="Mark Cleared"
                              >
                                <CheckCheck className="h-3 w-3 mr-1" /> Clear
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setBounceTarget(item);
                                  setBounceReason(BOUNCE_REASONS[0]);
                                  setBounceNotes("");
                                }}
                                className="h-7 px-2 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 border-rose-500/30"
                                title="Mark Bounced"
                              >
                                <XCircle className="h-3 w-3 mr-1" /> Bounce
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setCancelTarget(item);
                                  setCancelReason(CANCEL_REASONS[0]);
                                  setCancelNotes("");
                                }}
                                className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                title="Cancel Cheque"
                              >
                                <Ban className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedCheque(item)}
                              className="h-7 px-2 text-[11px] font-medium border-border/70"
                            >
                              <Eye className="h-3 w-3 mr-1" /> View
                            </Button>
                          )}
                          {isPending && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedCheque(item)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>
            Showing <span className="font-bold text-foreground">{items.length}</span> of{" "}
            <span className="font-bold text-foreground">{total}</span> total cheques
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-8 px-2.5 text-xs font-semibold"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
            </Button>
            <span className="px-2 font-bold text-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 px-2.5 text-xs font-semibold"
            >
              Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* Cheque Details Modal */}
      {selectedCheque && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                  <Landmark className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">Cheque Details</h3>
                  <p className="text-[10px] text-muted-foreground">Payment record metadata &amp; invoice financial state</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCheque(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {/* Cheque Financial Overview */}
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/80 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Cheque Amount</div>
                  <div className="text-xl font-black text-foreground mt-0.5">{fmt(selectedCheque.amount)}</div>
                </div>
                <div>
                  {renderStatusBadge(selectedCheque.status)}
                </div>
              </div>

              {/* Cheque Meta Grid */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-border/60 bg-card">
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold">Cheque Number</div>
                  <div className="font-bold text-foreground mt-0.5">{selectedCheque.cheque_number || "N/A"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold">Bank Name</div>
                  <div className="font-bold text-foreground mt-0.5">{selectedCheque.bank_name || "Unknown Bank"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold">Received Date</div>
                  <div className="font-medium text-foreground mt-0.5">
                    {selectedCheque.payment_date ? new Date(selectedCheque.payment_date).toLocaleDateString("en-LK") : "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold">Cheque Maturity Date</div>
                  <div className="font-bold text-foreground mt-0.5">
                    {selectedCheque.cheque_date ? new Date(selectedCheque.cheque_date).toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold">Operational State</div>
                  <div className="mt-0.5">{renderOperationalState(selectedCheque)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold">Recorded By</div>
                  <div className="font-medium text-foreground mt-0.5">{selectedCheque.created_by || "Staff"}</div>
                </div>
              </div>

              {/* Clearance / Audit Info */}
              {(selectedCheque.cleared_by || selectedCheque.cleared_at) && (
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                  <div className="font-bold text-[11px] flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" /> Clearance Audit Trail
                  </div>
                  <div className="text-[11px] mt-1 space-y-0.5">
                    {selectedCheque.cleared_by && <div>Cleared By: <span className="font-semibold">{selectedCheque.cleared_by}</span></div>}
                    {selectedCheque.cleared_at && <div>Cleared At: <span className="font-semibold">{new Date(selectedCheque.cleared_at).toLocaleString("en-LK")}</span></div>}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedCheque.notes && (
                <div className="p-3 rounded-xl bg-muted/40 border border-border/80">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes / Audit Trail</div>
                  <p className="text-[11px] text-foreground mt-1 whitespace-pre-wrap leading-relaxed">{selectedCheque.notes}</p>
                </div>
              )}

              {/* Related Invoice Financial Summary */}
              <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-foreground">Invoice Summary</span>
                  {onNavigateTab ? (
                    <button
                      onClick={() => {
                        const targetInv = selectedCheque.invoice_number || selectedCheque.receipt_number || "";
                        setSelectedCheque(null);
                        onNavigateTab('sales', { id: selectedCheque.sale_id || undefined, search: targetInv });
                      }}
                      className="text-[11px] text-blue-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                      title="Open Central Commercial Invoice Workspace"
                    >
                      #{selectedCheque.invoice_number || selectedCheque.receipt_number || "INV"}
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <Link
                      href={`/admin/sales?search=${encodeURIComponent(selectedCheque.invoice_number || selectedCheque.receipt_number || "")}`}
                      className="text-[11px] text-blue-600 font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      #{selectedCheque.invoice_number || selectedCheque.receipt_number || "INV"}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-border/60">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium text-foreground truncate max-w-[130px]">{selectedCheque.dealer_company || selectedCheque.customer_name || "Customer"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Invoice Total:</span>
                    <span className="font-bold text-foreground">{fmt(selectedCheque.invoice_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cleared Paid:</span>
                    <span className="font-bold text-emerald-600">{fmt(selectedCheque.invoice_cleared_paid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pending Cheques:</span>
                    <span className="font-bold text-amber-600">{fmt(selectedCheque.invoice_pending_clearance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Balance Due:</span>
                    <span className="font-bold text-foreground">{fmt(selectedCheque.invoice_balance_due)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avail. to Record:</span>
                    <span className="font-bold text-blue-600">{fmt(selectedCheque.available_to_record)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/30">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCheque(null)}
                className="text-xs font-semibold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Cleared Confirmation Modal */}
      {clearTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-border flex items-center justify-between bg-emerald-500/10">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-foreground">Mark Cheque as Cleared</h3>
              </div>
              <button
                onClick={() => setClearTarget(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                Confirm clearance for cheque <strong className="text-foreground">#{clearTarget.cheque_number || "N/A"}</strong> ({clearTarget.bank_name}) in the amount of <strong className="text-emerald-600">{fmt(clearTarget.amount)}</strong>.
              </p>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0" /> Financial Impact:
                </div>
                <div>• Increases cleared paid money by {fmt(clearTarget.amount)}.</div>
                <div>• Reduces invoice balance due.</div>
                <div>• Transitions invoice payment status if fully paid.</div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">
                  Optional Deposit / Reference Notes:
                </label>
                <Input
                  value={clearNotes}
                  onChange={(e) => setClearNotes(e.target.value)}
                  placeholder="e.g. Deposited into Sampath Bank A/C #12345"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/30">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearTarget(null)}
                disabled={isUpdatingStatus}
                className="text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleClearConfirm}
                disabled={isUpdatingStatus}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {isUpdatingStatus ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Clearing...
                  </>
                ) : (
                  <>
                    <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Confirm Clearance
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Bounced Modal */}
      {bounceTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-border flex items-center justify-between bg-rose-500/10">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-rose-600" />
                <h3 className="font-bold text-sm text-foreground">Mark Cheque as Bounced</h3>
              </div>
              <button
                onClick={() => setBounceTarget(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                Record bounce for cheque <strong className="text-foreground">#{bounceTarget.cheque_number || "N/A"}</strong> ({bounceTarget.bank_name}) in the amount of <strong className="text-rose-600">{fmt(bounceTarget.amount)}</strong>.
              </p>

              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Financial Impact:
                </div>
                <div>• Pending clearance reservation is released immediately.</div>
                <div>• Available to Record balance on the invoice reopens by {fmt(bounceTarget.amount)}.</div>
                <div>• Invoice balance due remains outstanding.</div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">
                  Reason for Bounce: *
                </label>
                <select
                  value={bounceReason}
                  onChange={(e) => setBounceReason(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-lg bg-background border border-border text-foreground font-medium"
                >
                  {BOUNCE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">
                  Additional Details / Bank Slip Remarks:
                </label>
                <Input
                  value={bounceNotes}
                  onChange={(e) => setBounceNotes(e.target.value)}
                  placeholder="e.g. Return memo received from bank on 24 Sep"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/30">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBounceTarget(null)}
                disabled={isUpdatingStatus}
                className="text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleBounceConfirm}
                disabled={isUpdatingStatus}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {isUpdatingStatus ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Recording...
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 mr-1.5" /> Confirm Cheque Bounced
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Cheque Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-bold text-sm text-foreground">Cancel Cheque</h3>
              </div>
              <button
                onClick={() => setCancelTarget(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                Cancel pending cheque <strong className="text-foreground">#{cancelTarget.cheque_number || "N/A"}</strong> ({cancelTarget.bank_name}) of <strong className="text-foreground">{fmt(cancelTarget.amount)}</strong>.
              </p>

              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">
                  Reason for Cancellation: *
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-lg bg-background border border-border text-foreground font-medium"
                >
                  {CANCEL_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-foreground block mb-1">
                  Additional Notes:
                </label>
                <Input
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder="e.g. Replaced by cash payment"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/30">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelTarget(null)}
                disabled={isUpdatingStatus}
                className="text-xs font-semibold"
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleCancelConfirm}
                disabled={isUpdatingStatus}
                className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold"
              >
                {isUpdatingStatus ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Cancelling...
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5 mr-1.5" /> Confirm Cancellation
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
