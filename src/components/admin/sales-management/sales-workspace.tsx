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
  Building2,
  X,
  Printer,
  Receipt,
  FileText,
  Mail,
  Download,
  RotateCcw,
  PackageCheck,
  CheckCircle2,
  MoreHorizontal,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  getUnifiedSalesTrackerAction,
  getUnifiedSalesMetricsAction,
  getSaleByIdAction,
  getReceiptPrintPresetsAction,
  getInvoicePrintPresetsAction,
  sendInvoiceViaWorkflowAction,
  getSalePaymentsAction,
  recordSalePaymentAction,
  updateChequeStatusAction,
  recordPaymentReversalAction,
  revokeInvoiceAction,
  getCommercialSaleFulfillmentsAction,
  type CommercialSaleFulfillmentRecord,
} from "@/app/actions/admin";
import { CommercialHandoverModal } from "./commercial-handover-modal";
import { DeliveryNoteModal } from "./delivery-note-modal";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import type { PBSale, PBSaleItem, SalePayment, SalePaymentReversal, SalePaymentSummary, PaymentMethod } from "@/types/pos";
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
  customerCompany?: string | null;
  customerEmail: string;
  itemsCount: number;
  total: number;
  discount: number;
  paymentMethod: string;
  status: string;
  source: "POS Terminal" | "Online Store" | "Wholesale" | "Admin Sale";
  isPaid: boolean;
  isRevenueEligible: boolean;
  clearedPaid?: number;
  pendingClearance?: number;
  balanceDue?: number;
  availableToRecord?: number;
  paymentStatus?: "PAID" | "BALANCE PENDING" | "UNPAID" | "REVOKED" | "VOIDED";
  paymentTerms?: string;
  dueDate?: string | null;
  collectionStatus?: string;
  daysOverdue?: number;
  invoiceNumber?: string | null;
  isRevoked?: boolean;
  invoiceRevokedAt?: string | null;
  invoiceRevokedBy?: string | null;
  invoiceRevokeReason?: string | null;
  invoiceRevokeNotes?: string | null;
  fulfillmentStatus?: "NOT HANDED OVER" | "PARTIALLY HANDED OVER" | "HANDED OVER" | null;
  hasUnclassifiedLines?: boolean;
}

const methodIcon: Record<string, React.ElementType> = {
  cash: Banknote,
  card: CreditCard,
  cheque: FileText,
  bank_transfer: Store,
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

export interface SalesWorkspaceProps {
  isActive?: boolean;
  initialSearch?: string;
  initialSaleId?: string;
  onNavigateTab?: (view: 'sales' | 'quotations' | 'receivables' | 'cheques', params?: { search?: string; id?: string }) => void;
}

export default function SalesWorkspace({
  isActive = true,
  initialSearch,
  initialSaleId,
  onNavigateTab,
}: SalesWorkspaceProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch || "");
  const [debouncedSearch] = useDebounce(searchQuery, 400);
  const [filterSource, setFilterSource] = useState<
    "All" | "POS Terminal" | "Online Store"
  >("All");
  const [paymentStatus, setPaymentStatus] = useState("All");
  const [status, setStatus] = useState("All");
  const [paymentMethod, setPaymentMethod] = useState("All");
  const [lifecycleFilter, setLifecycleFilter] = useState<"all" | "active" | "revoked">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedPosSaleId, setSelectedPosSaleId] = useState<string | null>(initialSaleId || null);
  const [posReceiptDetails, setPosReceiptDetails] = useState<{
    sale: PBSale;
    items: PBSaleItem[];
  } | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  // Sync external search/saleId if passed via props
  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  useEffect(() => {
    if (initialSaleId) {
      setSelectedPosSaleId(initialSaleId);
    }
  }, [initialSaleId]);

  // Multi-payment ledger states
  const [salePayments, setSalePayments] = useState<SalePayment[]>([]);
  const [salePaymentReversals, setSalePaymentReversals] = useState<SalePaymentReversal[]>([]);
  const [salePaymentSummary, setSalePaymentSummary] = useState<SalePaymentSummary | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [recordMethod, setRecordMethod] = useState<PaymentMethod>('cash');
  const [recordAmount, setRecordAmount] = useState<string>('');
  const [recordReference, setRecordReference] = useState<string>('');
  const [recordChequeNumber, setRecordChequeNumber] = useState<string>('');
  const [recordChequeDate, setRecordChequeDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [recordBankName, setRecordBankName] = useState<string>('');
  const [recordChequeNotes, setRecordChequeNotes] = useState<string>('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentActionMessage, setPaymentActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Return Payment (Reversal) modal states
  const [showReturnPaymentModal, setShowReturnPaymentModal] = useState(false);
  const [targetPaymentForReturn, setTargetPaymentForReturn] = useState<SalePayment | null>(null);
  const [returnAmount, setReturnAmount] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('Customer refund');
  const [returnReference, setReturnReference] = useState<string>('');
  const [returnNotes, setReturnNotes] = useState<string>('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [returnActionMessage, setReturnActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invoice Revocation Modal States
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeReason, setRevokeReason] = useState<string>('Invoice issued in error');
  const [revokeNotes, setRevokeNotes] = useState<string>('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeActionMessage, setRevokeActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Send Invoice Workflow States
  const [showSendWorkflow, setShowSendWorkflow] = useState(false);
  const [workflowTab, setWorkflowTab] = useState<'email' | 'whatsapp'>('email');
  const [workflowEmail, setWorkflowEmail] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowPhone, setWorkflowPhone] = useState('');
  const [sendingWorkflow, setSendingWorkflow] = useState(false);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Commercial Goods Handover & Delivery Note States
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showDeliveryNoteModal, setShowDeliveryNoteModal] = useState(false);
  const [selectedFulfillmentForDN, setSelectedFulfillmentForDN] = useState<CommercialSaleFulfillmentRecord | null>(null);
  const [saleFulfillments, setSaleFulfillments] = useState<CommercialSaleFulfillmentRecord[]>([]);
  const [loadingFulfillments, setLoadingFulfillments] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterSource, paymentStatus, status, paymentMethod, lifecycleFilter, dateFrom, dateTo, minAmount, maxAmount, sort, pageSize]);

  // Main list query (lazy loaded when tab is active)
  const {
    data: salesData,
    isLoading: loading,
    isFetching,
    error: salesError,
    refetch: refetchSales
  } = useQuery({
    queryKey: ['admin-sales', page, pageSize, debouncedSearch, filterSource, paymentStatus, status, paymentMethod, lifecycleFilter, dateFrom, dateTo, minAmount, maxAmount, sort],
    queryFn: async () => {
      const res = await getUnifiedSalesTrackerAction({
        page,
        pageSize,
        search: debouncedSearch,
        source: filterSource,
        paymentStatus,
        status,
        paymentMethod,
        lifecycle: lifecycleFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
        sort
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
    isLoading: loadingMetrics
  } = useQuery({
    queryKey: ['admin-sales-metrics', debouncedSearch, filterSource, paymentStatus, status, paymentMethod, dateFrom, dateTo, minAmount, maxAmount],
    queryFn: async () => {
      const res = await getUnifiedSalesMetricsAction({
        search: debouncedSearch,
        source: filterSource,
        paymentStatus,
        status,
        paymentMethod,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: isActive,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  const sales = (salesData?.data as UnifiedSale[]) || [];
  const error = salesError ? (salesError as Error).message : null;
  const totalPages = salesData?.totalPages || 0;
  const totalCount = salesData?.total || 0;

  // Pagination Out of Bounds Correction
  useEffect(() => {
    if (salesData && page > totalPages && totalPages > 0) {
      setPage(totalPages);
    }
  }, [salesData, page, totalPages]);

  // Prefetch Next Page
  useEffect(() => {
    if (page < totalPages) {
      queryClient.prefetchQuery({
        queryKey: ['admin-sales', page + 1, pageSize, debouncedSearch, filterSource, paymentStatus, status, paymentMethod, lifecycleFilter, dateFrom, dateTo, minAmount, maxAmount, sort],
        queryFn: async () => {
          const res = await getUnifiedSalesTrackerAction({
            page: page + 1,
            pageSize,
            search: debouncedSearch,
            source: filterSource,
            paymentStatus,
            status,
            paymentMethod,
            lifecycle: lifecycleFilter,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            minAmount: minAmount ? Number(minAmount) : undefined,
            maxAmount: maxAmount ? Number(maxAmount) : undefined,
            sort
          });
          if (!res.success) throw new Error(res.error);
          return res;
        },
        staleTime: 30 * 1000,
      });
    }
  }, [page, totalPages, pageSize, debouncedSearch, filterSource, paymentStatus, status, paymentMethod, dateFrom, dateTo, minAmount, maxAmount, sort, queryClient]);

  useEffect(() => {
    let isMounted = true;
    async function fetchReceipt() {
      if (!selectedPosSaleId) {
        setPosReceiptDetails(null);
        setSalePayments([]);
        setSalePaymentReversals([]);
        setSalePaymentSummary(null);
        return;
      }
      setLoadingReceipt(true);
      setLoadingPayments(true);
      setLoadingFulfillments(true);
      try {
        const [res, payRes, fulRes] = await Promise.all([
          getSaleByIdAction(selectedPosSaleId),
          getSalePaymentsAction(selectedPosSaleId),
          getCommercialSaleFulfillmentsAction(selectedPosSaleId),
        ]);
        if (isMounted && res.success && res.data) {
          setPosReceiptDetails(res.data);
        }
        if (isMounted && payRes.success && payRes.data) {
          setSalePayments(payRes.data.payments);
          setSalePaymentReversals(payRes.data.reversals || []);
          setSalePaymentSummary(payRes.data.summary);
        }
        if (isMounted && fulRes.success && fulRes.data) {
          setSaleFulfillments(fulRes.data);
        } else if (isMounted) {
          setSaleFulfillments([]);
        }
      } catch {
        if (isMounted) {
          setPosReceiptDetails(null);
          setSalePayments([]);
          setSalePaymentReversals([]);
          setSalePaymentSummary(null);
          setSaleFulfillments([]);
        }
      } finally {
        if (isMounted) {
          setLoadingReceipt(false);
          setLoadingPayments(false);
          setLoadingFulfillments(false);
        }
      }
    }
    fetchReceipt();
    return () => {
      isMounted = false;
    };
  }, [selectedPosSaleId]);

  const refreshFulfillmentsAndSale = async (saleId: string) => {
    setLoadingFulfillments(true);
    try {
      const [res, fulRes] = await Promise.all([
        getSaleByIdAction(saleId),
        getCommercialSaleFulfillmentsAction(saleId),
      ]);
      if (res.success && res.data) {
        setPosReceiptDetails(res.data);
      }
      if (fulRes.success && fulRes.data) {
        setSaleFulfillments(fulRes.data);
      }
      queryClient.invalidateQueries({ queryKey: ["unified-sales-tracker"] });
      queryClient.invalidateQueries({ queryKey: ["unified-sales-metrics"] });
    } finally {
      setLoadingFulfillments(false);
    }
  };

  const refreshPayments = async (saleId: string) => {
    setLoadingPayments(true);
    try {
      const payRes = await getSalePaymentsAction(saleId);
      if (payRes.success && payRes.data) {
        setSalePayments(payRes.data.payments);
        setSalePaymentReversals(payRes.data.reversals || []);
        setSalePaymentSummary(payRes.data.summary);
        queryClient.invalidateQueries({ queryKey: ["unified-sales-tracker"] });
        queryClient.invalidateQueries({ queryKey: ["unified-sales-metrics"] });
      }
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleOpenReturnPayment = (payment: SalePayment) => {
    setTargetPaymentForReturn(payment);
    const maxReversible = payment.remaining_reversible ?? payment.amount;
    setReturnAmount(String(maxReversible));
    setReturnReason('Customer refund');
    setReturnReference('');
    setReturnNotes('');
    setReturnActionMessage(null);
    setShowReturnPaymentModal(true);
  };

  const handleReturnPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPaymentForReturn || !posReceiptDetails?.sale?.id) return;

    const amt = parseFloat(returnAmount);
    const maxReversible = targetPaymentForReturn.remaining_reversible ?? targetPaymentForReturn.amount;

    if (isNaN(amt) || amt <= 0) {
      setReturnActionMessage({ type: 'error', text: 'Please enter a valid positive return amount.' });
      return;
    }

    if (amt > maxReversible) {
      setReturnActionMessage({
        type: 'error',
        text: `Return amount (${fmt(amt)}) exceeds remaining reversible balance (${fmt(maxReversible)}).`,
      });
      return;
    }

    if (!returnReason.trim()) {
      setReturnActionMessage({ type: 'error', text: 'Reason is required for payment return.' });
      return;
    }

    if (returnReason === 'Other' && !returnNotes.trim()) {
      setReturnActionMessage({ type: 'error', text: 'Notes are required when selecting reason "Other".' });
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
        setReturnActionMessage({ type: 'error', text: res.error || 'Failed to record payment return' });
      } else {
        setReturnActionMessage({ type: 'success', text: 'Payment return successfully recorded in audit ledger!' });
        queryClient.invalidateQueries({ queryKey: ["unified-sales-tracker"] });
        queryClient.invalidateQueries({ queryKey: ["unified-sales-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables"] });
        queryClient.invalidateQueries({ queryKey: ["admin-outstanding-receivables-metrics"] });

        setTimeout(async () => {
          setShowReturnPaymentModal(false);
          setReturnActionMessage(null);
          if (posReceiptDetails?.sale?.id) {
            await refreshPayments(posReceiptDetails.sale.id);
          }
        }, 800);
      }
    } catch (err: any) {
      setReturnActionMessage({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  const handleRevokeInvoice = async () => {
    if (!posReceiptDetails?.sale?.id) return;
    const cleanReason = (revokeReason || '').trim();
    if (!cleanReason) {
      setRevokeActionMessage({ type: 'error', text: 'A valid revocation reason is required.' });
      return;
    }
    if (cleanReason.toLowerCase() === 'other' && (!revokeNotes || !revokeNotes.trim())) {
      setRevokeActionMessage({ type: 'error', text: 'Notes/details are required when selecting reason "Other".' });
      return;
    }

    setIsRevoking(true);
    setRevokeActionMessage(null);
    try {
      const res = await revokeInvoiceAction({
        saleId: posReceiptDetails.sale.id,
        reason: cleanReason,
        notes: revokeNotes.trim() || undefined,
      });

      if (res.success) {
        setRevokeActionMessage({ type: 'success', text: 'Invoice successfully revoked!' });
        queryClient.invalidateQueries({ queryKey: ['admin-sales'] });
        queryClient.invalidateQueries({ queryKey: ['admin-sales-metrics'] });
        queryClient.invalidateQueries({ queryKey: ['admin-outstanding-receivables'] });
        queryClient.invalidateQueries({ queryKey: ['admin-outstanding-receivables-metrics'] });
        queryClient.invalidateQueries({ queryKey: ['admin-cheque-register'] });

        setTimeout(async () => {
          setShowRevokeModal(false);
          setRevokeActionMessage(null);
          if (posReceiptDetails?.sale?.id) {
            const [sRes, pRes] = await Promise.all([
              getSaleByIdAction(posReceiptDetails.sale.id),
              getSalePaymentsAction(posReceiptDetails.sale.id),
            ]);
            if (sRes.success && sRes.data) setPosReceiptDetails(sRes.data);
            if (pRes.success && pRes.data) {
              setSalePayments(pRes.data.payments);
              setSalePaymentReversals(pRes.data.reversals || []);
              setSalePaymentSummary(pRes.data.summary);
            }
          }
        }, 800);
      } else {
        setRevokeActionMessage({ type: 'error', text: res.error || 'Failed to revoke invoice.' });
      }
    } catch (err: any) {
      setRevokeActionMessage({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setIsRevoking(false);
    }
  };

  const handleUpdateChequeStatus = async (paymentId: string, newStatus: 'cleared' | 'bounced' | 'cancelled') => {
    if (!posReceiptDetails?.sale?.id) return;
    const actionLabel = newStatus === 'cleared' ? 'clear' : newStatus === 'bounced' ? 'mark as bounced' : 'cancel';
    if (!confirm(`Are you sure you want to ${actionLabel} this cheque payment?`)) return;

    try {
      const res = await updateChequeStatusAction({ paymentId, newStatus });
      if (res.success && res.summary) {
        setSalePaymentSummary(res.summary);
        await refreshPayments(posReceiptDetails.sale.id);
      } else {
        alert(res.error || `Failed to ${actionLabel} cheque.`);
      }
    } catch (err: any) {
      alert(err.message || `Failed to update cheque status.`);
    }
  };

  const handleRecordPaymentSubmit = async () => {
    if (!posReceiptDetails?.sale?.id || !salePaymentSummary) return;
    const numAmount = parseFloat(recordAmount);
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      setPaymentActionMessage({ type: 'error', text: 'Please enter a valid positive payment amount.' });
      return;
    }
    if (numAmount > salePaymentSummary.available_to_record) {
      setPaymentActionMessage({
        type: 'error',
        text: `Payment amount cannot exceed available amount to record (${fmt(salePaymentSummary.available_to_record)}).`,
      });
      return;
    }

    if (recordMethod === 'cheque') {
      if (!recordChequeNumber.trim()) {
        setPaymentActionMessage({ type: 'error', text: 'Cheque number is required for cheque payments.' });
        return;
      }
      if (!recordChequeDate) {
        setPaymentActionMessage({ type: 'error', text: 'Cheque date is required for cheque payments.' });
        return;
      }
      if (!recordBankName.trim()) {
        setPaymentActionMessage({ type: 'error', text: 'Bank name is required for cheque payments.' });
        return;
      }
    }

    setIsRecordingPayment(true);
    setPaymentActionMessage(null);
    try {
      const res = await recordSalePaymentAction({
        saleId: posReceiptDetails.sale.id,
        amount: numAmount,
        paymentMethod: recordMethod,
        reference: recordReference.trim() || undefined,
        chequeNumber: recordMethod === 'cheque' ? recordChequeNumber.trim() : undefined,
        chequeDate: recordMethod === 'cheque' ? recordChequeDate : undefined,
        bankName: recordMethod === 'cheque' ? recordBankName.trim() : undefined,
        notes: recordMethod === 'cheque' ? (recordChequeNotes.trim() || undefined) : undefined,
      });

      if (res.success && res.summary) {
        setSalePaymentSummary(res.summary);
        setShowRecordPaymentModal(false);
        await refreshPayments(posReceiptDetails.sale.id);
      } else {
        setPaymentActionMessage({ type: 'error', text: res.error || 'Failed to record payment.' });
      }
    } catch (err: any) {
      setPaymentActionMessage({ type: 'error', text: err.message || 'Failed to record payment.' });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const workflowModalRef = useRef<HTMLDivElement | null>(null);
  const previousWorkflowFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selectedPosSaleId) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frameId = requestAnimationFrame(() => modalRef.current?.focus());
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
      if (toRestore?.isConnected) toRestore.focus();
    };
  }, [selectedPosSaleId, showSendWorkflow]);

  useEffect(() => {
    if (!showSendWorkflow) return;
    previousWorkflowFocusRef.current = document.activeElement as HTMLElement | null;
    const frameId = requestAnimationFrame(() => workflowModalRef.current?.focus());
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
      if (toRestore?.isConnected) toRestore.focus();
    };
  }, [showSendWorkflow]);

  const handleOpenRecordPaymentModal = useCallback(() => {
    if (!salePaymentSummary || !posReceiptDetails) return;
    setRecordAmount(String(salePaymentSummary.available_to_record));
    setRecordMethod('cash');
    setRecordReference('');
    setRecordChequeNumber('');
    setRecordChequeDate(new Date().toISOString().split('T')[0]);
    setRecordBankName('');
    setRecordChequeNotes('');
    setPaymentActionMessage(null);
    setShowRecordPaymentModal(true);
  }, [salePaymentSummary, posReceiptDetails]);

  const handleOpenSendWorkflow = useCallback(() => {
    if (!posReceiptDetails) return;
    const name = posReceiptDetails.sale.customer_name || '';
    const phone = posReceiptDetails.sale.customer_phone || '';
    const email = posReceiptDetails.sale.customer_email || '';

    setWorkflowName(name);
    setWorkflowPhone(phone);
    setWorkflowEmail(email && !email.endsWith('@customer.local') && email !== 'customer@ftc.lk' ? email : '');
    setWorkflowMessage(null);
    setWorkflowTab('email');
    setShowSendWorkflow(true);
  }, [posReceiptDetails]);

  const handleReprintReceipt = async () => {
    if (!posReceiptDetails) return;
    const isCommercial = Boolean(
      posReceiptDetails.sale.quotation_id &&
      !posReceiptDetails.sale.receipt_number?.startsWith('FTC-POS-') &&
      !posReceiptDetails.sale.cashier_id
    );
    if (isCommercial) {
      console.warn('[handleReprintReceipt] Thermal receipts are POS-only. Blocked for commercial sale.');
      return;
    }
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
        paymentMethod: sale.payment_method || undefined,
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
    const isRevoked = Boolean(sale.invoice_revoked_at || salePaymentSummary?.is_revoked);
    const docNumber = sale.invoice_number || sale.receipt_number || `INV-POS-${sale.id.slice(-6).toUpperCase()}`;
    const pStatus = isRevoked ? 'REVOKED' : isVoided ? 'UNPAID' : (salePaymentSummary?.payment_status || (sale.status === 'completed' ? 'PAID' : 'UNPAID'));
    const cleared = isRevoked || isVoided ? 0 : (salePaymentSummary ? salePaymentSummary.cleared_paid : sale.total);
    const pending = isRevoked || isVoided ? 0 : (salePaymentSummary ? salePaymentSummary.pending_clearance : 0);
    const balance = isRevoked ? 0 : isVoided ? sale.total : (salePaymentSummary ? salePaymentSummary.balance_due : 0);

    const methodsSummary = salePayments && salePayments.length > 0
      ? Array.from(new Set(salePayments.map(p => p.payment_method.toUpperCase()))).join(' + ')
      : (sale.payment_method || 'POS').toUpperCase();

    const invoiceData: InvoiceData = {
      docType: "Invoice",
      docNumber: isRevoked ? `${docNumber} (REVOKED)` : isVoided ? `${docNumber} (VOIDED)` : docNumber,
      date: formattedDate,
      isRevoked,
      invoiceRevokedAt: sale.invoice_revoked_at || salePaymentSummary?.invoice_revoked_at || undefined,
      invoiceRevokedBy: sale.invoice_revoked_by || salePaymentSummary?.invoice_revoked_by || undefined,
      invoiceRevokeReason: sale.invoice_revoke_reason || salePaymentSummary?.invoice_revoke_reason || undefined,
      invoiceRevokeNotes: sale.invoice_revoke_notes || salePaymentSummary?.invoice_revoke_notes || undefined,
      customerName: sale.customer_name || "Walk-in Customer",
      customerPhone: sale.customer_phone || undefined,
      items: items.map((i) => ({
        name: i.product_name,
        qty: i.quantity,
        unitPrice: i.unit_price,
        discount: i.item_discount || undefined,
        serialNumber: i.unit_serial || undefined,
        serialNumbers: i.serial_numbers && i.serial_numbers.length > 0 ? i.serial_numbers : (i.unit_serial ? [i.unit_serial] : undefined),
        quantityFulfilled: typeof i.quantity_fulfilled === 'number' ? i.quantity_fulfilled : undefined,
      })),
      subtotal: sale.subtotal,
      taxAmount: sale.tax_amount || 0,
      discountAmount: sale.discount || 0,
      totalAmount: sale.total,
      paymentMethod: isRevoked ? 'REVOKED' : isVoided ? 'VOIDED / CANCELLED' : methodsSummary,
      clearedPaid: cleared,
      pendingClearance: pending,
      balanceDue: balance,
      paymentStatus: pStatus,
      notes: isRevoked
        ? `*** THIS INVOICE HAS BEEN REVOKED *** Reason: ${sale.invoice_revoke_reason || salePaymentSummary?.invoice_revoke_reason || 'Document issued in error'}`
        : isVoided
        ? `*** THIS SALE HAS BEEN VOIDED / CANCELLED *** ${sale.void_reason ? 'Reason: ' + sale.void_reason : ''}`
        : pStatus === 'PAID'
        ? 'Official Paid Invoice. Thank you for shopping with FTC Electronics! Warranty claims require original invoice copy.'
        : pStatus === 'BALANCE PENDING'
        ? 'Commercial Sales Invoice — Balance Pending. Please settle remaining balance.'
        : 'Commercial Sales Invoice — Payment Pending Clearance.',
    };

    printInvoice(cfg, invoiceData, isVoided ? "POS Voided Invoice" : pStatus === 'PAID' ? "Paid Invoice" : "Sales Invoice");
  };

  const handleShareWhatsappInvoice = async () => {
    if (!posReceiptDetails) return;
    const cleanPhone = (workflowPhone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      setWorkflowMessage({ type: 'error', text: 'Please enter a valid customer phone number before sharing on WhatsApp.' });
      return;
    }
    setSharingWhatsapp(true);
    setWorkflowMessage(null);
    try {
      const { sale, items } = posReceiptDetails;
      const rawDateStr = sale.date || sale.created || sale.updated;
      const d = rawDateStr ? new Date(rawDateStr) : new Date();
      const formattedDate = (isNaN(d.getTime()) ? new Date() : d).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
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
          serialNumbers: i.serial_numbers && i.serial_numbers.length > 0 ? i.serial_numbers : (i.unit_serial ? [i.unit_serial] : undefined),
          quantityFulfilled: typeof i.quantity_fulfilled === 'number' ? i.quantity_fulfilled : undefined,
        })),
        subtotal: sale.subtotal, taxAmount: sale.tax_amount || 0, discountAmount: sale.discount || 0, totalAmount: sale.total,
        paymentMethod: isVoided ? 'VOIDED / CANCELLED' : `PAID via ${(sale.payment_method || 'POS').toUpperCase()}`,
        notes: isVoided
          ? `*** THIS SALE HAS BEEN VOIDED / CANCELLED *** ${sale.void_reason ? 'Reason: ' + sale.void_reason : ''}`
          : 'Official Paid Invoice. Thank you for shopping with FTC Electronics! Warranty claims require original invoice copy.',
      };
      const cfg = await resolveInvoiceConfig();
      const pdfBlob = await generateInvoicePdfBlob(cfg, invoiceData, isVoided ? "POS Voided Invoice" : "Paid Invoice");
      const fileName = `${docNumber}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({ files: [pdfFile], title: `Invoice ${docNumber}`, text: `Invoice document for order ${docNumber}` });
        setWorkflowMessage({ type: 'success', text: `Invoice document (${fileName}) attached successfully via system share.` });
        return;
      }
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
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      setWorkflowMessage({ type: 'success', text: `📄 Invoice PDF (${fileName}) downloaded! WhatsApp Web opened — drag & drop or attach the PDF file into the chat.` });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      console.error('WhatsApp PDF share error:', err);
      setWorkflowMessage({ type: 'error', text: err?.message || 'Failed to generate PDF document for WhatsApp.' });
    } finally {
      setSharingWhatsapp(false);
    }
  };

  const totalRevenue = metricsData?.total_revenue || 0;
  const posRevenue = metricsData?.pos_revenue || 0;
  const onlineRevenue = metricsData?.online_revenue || 0;
  const paidTransactions = metricsData?.paid_transactions || 0;
  const paidPosTransactions = metricsData?.paid_pos_transactions || 0;
  const paidOnlineTransactions = metricsData?.paid_online_transactions || 0;
  const outstandingAmount = metricsData?.outstanding_amount || 0;
  const outstandingTransactions = metricsData?.outstanding_transactions || 0;
  const returnedRefundedCount = metricsData?.returned_refunded_count || 0;
  const averagePaidTransaction = metricsData?.average_paid_transaction || 0;
  const totalTransactions = metricsData?.total_transactions || 0;

  return (
    <div className="space-y-6 text-foreground">
      {/* Title */}
      <div className="border-b border-border pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
            <TrendingUp className="h-6 w-6 text-blue-500" />
            Sales
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor and audit all customer sales transactions, commercial invoices, and payments across POS Terminals and Wholesale channels.
          </p>
        </div>
        <Button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-sales'] });
            queryClient.invalidateQueries({ queryKey: ['admin-sales-metrics'] });
          }}
          disabled={!mounted || loading || isFetching}
          variant="outline"
          size="sm"
          className="self-start md:self-auto gap-1.5"
        >
          {isFetching ? (
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            Paid Revenue
          </p>
          <p className="text-xl font-black text-foreground">
            {loadingMetrics ? <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" /> : fmt(totalRevenue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Across {paidTransactions} paid transactions
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            POS Revenue
          </p>
          <p className="text-xl font-black text-foreground">
            {loadingMetrics ? <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" /> : fmt(posRevenue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {paidPosTransactions} paid at counters
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            E-Commerce Revenue
          </p>
          <p className="text-xl font-black text-foreground">
            {loadingMetrics ? <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" /> : fmt(onlineRevenue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {paidOnlineTransactions} completed online checkouts
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            Total Transactions
          </p>
          <p className="text-xl font-black text-foreground">
            {loadingMetrics ? <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" /> : totalTransactions}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Matching current filters
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            Outstanding Balance
          </p>
          <p className="text-xl font-black text-amber-500">
            {loadingMetrics ? <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" /> : fmt(outstandingAmount)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            From {outstandingTransactions} unpaid transactions
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            Avg. Paid Transaction
          </p>
          <p className="text-xl font-black text-foreground">
            {loadingMetrics ? <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" /> : fmt(averagePaidTransaction)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Revenue / Paid Transactions
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">
            Returned / Refunded
          </p>
          <p className="text-xl font-black text-red-500">
            {loadingMetrics ? <Loader2 className="h-4 w-4 animate-spin mt-2 text-muted-foreground" /> : returnedRefundedCount}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Transactions
          </p>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col gap-4 bg-muted/30 border border-border/80 p-4 rounded-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
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

        {/* Advanced Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Lifecycle</label>
            <select
              value={lifecycleFilter}
              onChange={(e) => setLifecycleFilter(e.target.value as 'all' | 'active' | 'revoked')}
              className="h-8 text-xs rounded-lg bg-background border border-border px-2 outline-none font-medium"
            >
              <option value="all">All Lifecycles</option>
              <option value="active">Active Invoices</option>
              <option value="revoked">Revoked Invoices</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Payment Status</label>
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="h-8 text-xs rounded-lg bg-background border border-border px-2 outline-none">
              <option value="All">All</option>
              <option value="Paid">Paid</option>
              <option value="Balance Pending">Balance Pending</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Revoked">Revoked</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Order/Sale Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 text-xs rounded-lg bg-background border border-border px-2 outline-none">
              <option value="All">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="voided">Voided</option>
              <option value="returned">Returned</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="h-8 text-xs rounded-lg bg-background border border-border px-2 outline-none">
              <option value="All">All Methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="qr">QR Code</option>
              <option value="split">Split</option>
              <option value="cash_delivery">Cash on Delivery</option>
              <option value="cash_pickup">Cash on Pickup</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="online_payment">Online Payment</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Date From</label>
            <input type="date" value={dateFrom ? dateFrom.split('T')[0] : ''} onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value).toISOString() : '')} className="h-8 text-xs rounded-lg bg-background border border-border px-2 outline-none" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Date To</label>
            <input type="date" value={dateTo ? dateTo.split('T')[0] : ''} onChange={(e) => setDateTo(e.target.value ? new Date(e.target.value).toISOString() : '')} className="h-8 text-xs rounded-lg bg-background border border-border px-2 outline-none" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Sort By</label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-8 text-xs rounded-lg bg-background border border-border px-2 outline-none">
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Amount</option>
              <option value="lowest">Lowest Amount</option>
            </select>
          </div>
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
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
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
                {sales.map((sale) => {
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
                          {sale.invoiceNumber || sale.receiptNumber}
                        </span>
                        {sale.invoiceNumber && sale.receiptNumber && (
                          <span className="font-mono text-[10px] text-muted-foreground/80 block">
                            {sale.receiptNumber}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 opacity-65" />
                          {formattedDate}
                        </span>
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            sale.source === "Wholesale" || (sale.source as string) === "WHOLESALE"
                              ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                              : sale.source === "POS Terminal"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                              : "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                          }`}
                        >
                          {sale.source === "Wholesale" || (sale.source as string) === "WHOLESALE" ? (
                            <Building2 className="h-2.5 w-2.5" />
                          ) : sale.source === "POS Terminal" ? (
                            <Store className="h-2.5 w-2.5" />
                          ) : (
                            <Laptop className="h-2.5 w-2.5" />
                          )}
                          {sale.source === "Wholesale" || (sale.source as string) === "WHOLESALE" ? "WHOLESALE" : sale.source}
                        </span>
                      </td>

                      <td className="p-4">
                        {sale.customerCompany ? (
                          <>
                            <span className="text-foreground font-bold block">
                              {sale.customerCompany}
                            </span>
                            <span className="text-[11px] text-muted-foreground block">
                              {sale.customerName} {sale.customerEmail && sale.customerEmail !== '—' ? `· ${sale.customerEmail}` : ''}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-foreground block font-bold">
                              {sale.customerName}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono font-medium block">
                              {sale.customerEmail}
                            </span>
                          </>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-[10px] font-semibold text-foreground">
                          {sale.itemsCount}{" "}
                          {sale.itemsCount === 1 ? "item" : "items"}
                        </span>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          {sale.isRevoked || sale.paymentStatus === 'REVOKED' ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded text-[10px] font-bold border border-rose-500/20 w-fit">
                              <AlertCircle className="h-3 w-3 shrink-0" /> REVOKED
                            </span>
                          ) : sale.paymentStatus === 'PAID' || (!sale.paymentStatus && sale.isPaid) ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 text-emerald-500 text-[10px] font-bold">
                                <CheckCircle className="h-3 w-3 shrink-0" /> PAID
                              </span>
                              {sale.paymentMethod && sale.paymentMethod.toLowerCase() !== 'unpaid' && (
                                <span className="inline-flex items-center gap-1 capitalize text-[10px] text-muted-foreground pl-4">
                                  <MIcon className="h-3 w-3 opacity-70" />
                                  {sale.paymentMethod}
                                </span>
                              )}
                            </div>
                          ) : sale.paymentStatus === 'BALANCE PENDING' ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 text-amber-500 text-[10px] font-bold">
                                <Clock className="h-3 w-3 shrink-0" /> BALANCE PENDING
                              </span>
                              {sale.clearedPaid !== undefined && sale.clearedPaid > 0 && (
                                <span className="text-[9px] font-mono text-emerald-400/90 pl-4 font-semibold">
                                  Paid: {fmt(sale.clearedPaid)}
                                </span>
                              )}
                              {sale.balanceDue !== undefined && sale.balanceDue > 0 && (
                                <span className="text-[9px] font-mono text-amber-400/90 pl-4 font-semibold">
                                  Due: {fmt(sale.balanceDue)}
                                </span>
                              )}
                              {sale.paymentMethod && sale.paymentMethod.toLowerCase() !== 'unpaid' && (
                                <span className="inline-flex items-center gap-1 capitalize text-[10px] text-muted-foreground pl-4">
                                  <MIcon className="h-3 w-3 opacity-70" />
                                  {sale.paymentMethod}
                                </span>
                              )}
                            </div>
                          ) : sale.status === 'voided' ? (
                            <span className="inline-flex items-center gap-1 text-zinc-400 bg-zinc-500/10 px-1.5 py-0.5 rounded text-[10px] font-bold border border-zinc-500/20 w-fit">
                              <XCircle className="h-3 w-3 shrink-0" /> VOIDED
                            </span>
                          ) : (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 text-rose-400 text-[10px] font-bold">
                                <XCircle className="h-3 w-3 shrink-0" /> UNPAID
                              </span>
                              {sale.balanceDue !== undefined && sale.balanceDue > 0 && (
                                <span className="text-[9px] font-mono text-rose-400/80 pl-4 font-semibold">
                                  Due: {fmt(sale.balanceDue)}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Commercial Fulfillment Status Badge */}
                          {sale.fulfillmentStatus && (
                            <div className="pt-0.5">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                  sale.fulfillmentStatus === 'HANDED OVER'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : sale.fulfillmentStatus === 'PARTIALLY HANDED OVER'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                }`}
                                title={`Physical Goods Fulfillment: ${sale.fulfillmentStatus}`}
                              >
                                <PackageCheck className="h-2.5 w-2.5 shrink-0" />
                                {sale.fulfillmentStatus === 'PARTIALLY HANDED OVER' ? 'PARTIAL' : sale.fulfillmentStatus}
                              </span>
                            </div>
                          )}
                        </div>
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
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            sale.isRevoked || sale.status === 'REVOKED'
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : sale.source === 'Wholesale' || (sale.source as string) === 'WHOLESALE' || sale.invoiceNumber
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : sale.status === 'voided'
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : sale.status === 'completed'
                              ? 'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                              : 'bg-muted text-foreground'
                          }`}>
                            {sale.isRevoked
                              ? 'REVOKED'
                              : sale.source === 'Wholesale' || (sale.source as string) === 'WHOLESALE' || sale.invoiceNumber
                              ? 'ACTIVE'
                              : sale.source === 'POS Terminal'
                              ? (sale.status === 'voided' ? 'VOIDED' : 'COMPLETED')
                              : sale.status}
                          </span>
                        </div>
                      </td>

                      <td className="p-4 text-right">
                        {sale.source === 'Wholesale' || (sale.source as string) === 'WHOLESALE' || sale.invoiceNumber ? (
                          <button
                            onClick={() => setSelectedPosSaleId(sale.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-bold"
                          >
                            View Invoice
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ) : sale.source === 'POS Terminal' ? (
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

        {/* Pagination Controls */}
        {(totalPages > 1 || salesData) && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <div className="flex items-center gap-4">
              <p className="text-xs text-muted-foreground">
                {totalCount === 0
                  ? "Showing 0 of 0 transactions"
                  : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount} transactions`
                }
              </p>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-7 text-[10px] rounded-lg bg-muted border-none px-2 outline-none font-medium cursor-pointer"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading || isFetching}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <div className="flex items-center gap-1 mx-2">
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(pageNum =>
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  (pageNum >= page - 1 && pageNum <= page + 1)
                ).map((pageNum, index, array) => {
                  return (
                    <React.Fragment key={pageNum}>
                      {index > 0 && array[index - 1] !== pageNum - 1 && (
                        <span className="text-muted-foreground text-xs px-1">...</span>
                      )}
                      <button
                        onClick={() => setPage(pageNum)}
                        className={`h-7 w-7 flex items-center justify-center rounded-md text-xs font-medium transition-colors ${
                          page === pageNum
                            ? "bg-foreground text-background"
                            : "hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {pageNum}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading || isFetching}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sale / Commercial Invoice Detail Modal */}
      {selectedPosSaleId && (() => {
        const isCommercialSale = Boolean(
          posReceiptDetails?.sale.quotation_id &&
          !posReceiptDetails?.sale.receipt_number?.startsWith('FTC-POS-') &&
          !posReceiptDetails?.sale.cashier_id
        );
        const isRevoked = Boolean(salePaymentSummary?.is_revoked || posReceiptDetails?.sale.invoice_revoked_at);
        const effectivePaid = salePaymentSummary?.effective_cleared_paid ?? 0;
        const pendingCheques = salePaymentSummary?.pending_clearance ?? 0;
        const isEligibleToRevoke = effectivePaid === 0 && pendingCheques === 0;
        const canRecordPayment = Boolean(salePaymentSummary && salePaymentSummary.available_to_record > 0 && !isRevoked);

        const items = posReceiptDetails?.items || [];
        const totalItemsCount = items.reduce((acc, i) => acc + i.quantity, 0);
        const fulfilledItemsCount = items.reduce((acc, i) => acc + (i.quantity_fulfilled ?? 0), 0);
        const hasFulfillmentRemaining = items.some(i => (i.quantity_fulfilled ?? 0) < i.quantity);
        const isPartiallyHandedOver = fulfilledItemsCount > 0 && fulfilledItemsCount < totalItemsCount;
        const isFullyHandedOver = totalItemsCount > 0 && fulfilledItemsCount >= totalItemsCount;
        const fulfillmentStatus = fulfilledItemsCount === 0 ? 'NOT HANDED OVER' : isFullyHandedOver ? 'HANDED OVER' : 'PARTIALLY HANDED OVER';

        return (
          <div
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
            onClick={() => setSelectedPosSaleId(null)}
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={isCommercialSale ? "Commercial Invoice Detail" : "POS Sale Receipt Detail"}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl w-full max-w-3xl lg:max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 outline-none"
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card/95 backdrop-blur-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Receipt className="h-5 w-5 text-blue-500 shrink-0" />
                  <h3 className="text-sm font-black text-foreground">
                    {isCommercialSale ? "Commercial Invoice Detail" : "Sale / Receipt Detail"}
                  </h3>
                  {salePaymentSummary && (
                    <span
                      className={`ml-2 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        isRevoked
                          ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400 font-extrabold'
                          : salePaymentSummary.payment_status === 'PAID'
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : salePaymentSummary.payment_status === 'BALANCE PENDING'
                          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                          : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {isRevoked ? 'REVOKED' : salePaymentSummary.payment_status}
                    </span>
                  )}
                  {/* Fulfillment Status Badge for Commercial Invoices */}
                  {posReceiptDetails && isCommercialSale && (
                    <span
                      className={`ml-1 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                        fulfillmentStatus === 'HANDED OVER'
                          ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                          : fulfillmentStatus === 'PARTIALLY HANDED OVER'
                          ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400'
                          : 'bg-blue-500/15 border border-blue-500/40 text-blue-400'
                      }`}
                      title={`Goods Handover: ${fulfillmentStatus}`}
                    >
                      <PackageCheck className="h-3 w-3 shrink-0" />
                      {fulfillmentStatus}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedPosSaleId(null)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted cursor-pointer shrink-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              {loadingReceipt ? (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  Loading sale details...
                </div>
              ) : !posReceiptDetails ? (
                <div className="py-12 text-center text-red-500">
                  Failed to load sale details.
                </div>
              ) : (
                <>
                  {/* Revocation Banner */}
                  {(salePaymentSummary?.is_revoked || posReceiptDetails.sale.invoice_revoked_at) && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 text-rose-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-black text-rose-400 uppercase tracking-wider text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                        <span>INVOICE REVOKED</span>
                      </div>
                      <div className="text-[11px] space-y-0.5 text-rose-200/90 pt-1">
                        <div><strong>Revoked On:</strong> {posReceiptDetails.sale.invoice_revoked_at ? new Date(posReceiptDetails.sale.invoice_revoked_at).toLocaleString('en-LK') : (salePaymentSummary?.invoice_revoked_at ? new Date(salePaymentSummary.invoice_revoked_at).toLocaleString('en-LK') : 'Recorded')}</div>
                        <div><strong>Revoked By:</strong> {posReceiptDetails.sale.invoice_revoked_by || salePaymentSummary?.invoice_revoked_by || 'Staff'}</div>
                        <div><strong>Reason:</strong> {posReceiptDetails.sale.invoice_revoke_reason || salePaymentSummary?.invoice_revoke_reason || '—'}</div>
                        {(posReceiptDetails.sale.invoice_revoke_notes || salePaymentSummary?.invoice_revoke_notes) && (
                          <div><strong>Notes:</strong> {posReceiptDetails.sale.invoice_revoke_notes || salePaymentSummary?.invoice_revoke_notes}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Financial Snapshot */}
                  {salePaymentSummary && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-muted/30 border border-border/60 rounded-xl p-3 items-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Invoice Total</p>
                        <p className="font-bold text-foreground text-xs sm:text-sm">{fmt(salePaymentSummary.invoice_total)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider mb-0.5">Gross Received</p>
                        <p className="font-bold text-emerald-400 text-xs sm:text-sm">{fmt(salePaymentSummary.gross_cleared_paid ?? salePaymentSummary.cleared_paid)}</p>
                      </div>
                      {(salePaymentSummary.returned_amount ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] text-rose-400 uppercase font-bold tracking-wider mb-0.5">Returned</p>
                          <p className="font-bold text-rose-400 text-xs sm:text-sm">-{fmt(salePaymentSummary.returned_amount!)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider mb-0.5">Effective Paid</p>
                        <p className="font-bold text-emerald-400 text-xs sm:text-sm">{fmt(salePaymentSummary.effective_cleared_paid ?? salePaymentSummary.cleared_paid)}</p>
                      </div>
                      <div className={`p-2 rounded-lg border ${
                        salePaymentSummary.balance_due > 0
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      }`}>
                        <p className="text-[10px] uppercase font-black tracking-wider mb-0.5">Balance Due</p>
                        <p className="font-black text-xs sm:text-sm">
                          {salePaymentSummary.balance_due > 0 ? fmt(salePaymentSummary.balance_due) : 'Settled (Rs. 0)'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Meta data */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-muted/40 p-4 border border-border rounded-xl">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">
                        {posReceiptDetails.sale.invoice_number ? "Commercial Invoice No" : "Document No"}
                      </p>
                      <p className="font-mono font-bold text-foreground text-xs">
                        {posReceiptDetails.sale.invoice_number || posReceiptDetails.sale.receipt_number || `FTC-POS-${posReceiptDetails.sale.id.slice(-6).toUpperCase()}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">
                        {posReceiptDetails.sale.invoice_number || posReceiptDetails.sale.quotation_id ? "Issued By" : "Cashier"}
                      </p>
                      <p className="font-bold text-foreground">
                        {posReceiptDetails.sale.invoice_number || posReceiptDetails.sale.quotation_id
                          ? (posReceiptDetails.sale.issued_by_name || posReceiptDetails.sale.cashier_name || "Admin Staff")
                          : (posReceiptDetails.sale.cashier_name || "—")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Customer / Dealer</p>
                      {posReceiptDetails.sale.customer_company ? (
                        <>
                          <p className="font-bold text-foreground">{posReceiptDetails.sale.customer_company}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {posReceiptDetails.sale.customer_name} {posReceiptDetails.sale.customer_phone ? `· ${posReceiptDetails.sale.customer_phone}` : ''}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-bold text-foreground">{posReceiptDetails.sale.customer_name || 'Walk-in Customer'}</p>
                          {posReceiptDetails.sale.customer_phone && (
                            <p className="font-mono text-[10px] text-muted-foreground">{posReceiptDetails.sale.customer_phone}</p>
                          )}
                        </>
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
                    {posReceiptDetails.sale.payment_terms && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Payment Terms</p>
                        <p className="font-bold text-foreground capitalize">
                          {posReceiptDetails.sale.payment_terms.replace('_', ' ')}
                        </p>
                      </div>
                    )}
                    {posReceiptDetails.sale.due_date && (
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Due Date</p>
                        <p className="font-bold text-foreground">
                          {posReceiptDetails.sale.due_date}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Items List */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] uppercase font-black text-muted-foreground tracking-wider">
                        Items Purchased ({posReceiptDetails.items.length})
                      </h4>
                      {isCommercialSale && (
                        <span className="text-[11px] text-muted-foreground font-semibold">
                          Fulfillment: <strong className={isFullyHandedOver ? "text-emerald-400" : "text-amber-400"}>{fulfilledItemsCount}</strong> / {totalItemsCount} units
                        </span>
                      )}
                    </div>
                    <div className="border border-border rounded-xl overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border text-muted-foreground font-bold text-[10px]">
                            <th className="p-3">Product / Line</th>
                            <th className="p-3 text-center">Qty</th>
                            {isCommercialSale && (
                              <th className="p-3 text-center">Fulfillment</th>
                            )}
                            <th className="p-3 text-right">Price</th>
                            <th className="p-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border font-medium">
                          {posReceiptDetails.items.map((item) => {
                            const fulfilled = item.quantity_fulfilled ?? 0;
                            const remaining = Math.max(0, item.quantity - fulfilled);
                            const itemFullyHandedOver = fulfilled >= item.quantity;

                            return (
                              <tr key={item.id} className="hover:bg-muted/5">
                                <td className="p-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-bold text-foreground text-xs">{item.product_name}</p>
                                    {item.inventory_tracking_type === 'unit' && (
                                      <span className="text-[9px] font-mono bg-purple-500/15 border border-purple-500/30 text-purple-300 px-1.5 py-0.2 rounded font-bold">
                                        UNIT
                                      </span>
                                    )}
                                    {item.inventory_tracking_type === 'counter' && (
                                      <span className="text-[9px] font-mono bg-blue-500/15 border border-blue-500/30 text-blue-300 px-1.5 py-0.2 rounded font-bold">
                                        COUNTER
                                      </span>
                                    )}
                                    {!item.product_id && (
                                      <span className="text-[9px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-1.5 py-0.2 rounded font-bold">
                                        UNCLASSIFIED
                                      </span>
                                    )}
                                  </div>
                                  {item.serial_numbers && item.serial_numbers.length > 0 ? (
                                    <div className="font-mono text-[10px] text-muted-foreground mt-1 break-words leading-relaxed max-w-md">
                                      <span className="font-bold text-foreground">SN: </span>
                                      {item.serial_numbers.join(" · ")}
                                    </div>
                                  ) : item.unit_serial ? (
                                    <span className="font-mono text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">
                                      SN: {item.unit_serial}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="p-3 text-center font-bold text-xs">{item.quantity}</td>
                                {isCommercialSale && (
                                  <td className="p-3 text-center">
                                    {itemFullyHandedOver ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px] whitespace-nowrap">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> All {item.quantity} Handed Over
                                      </span>
                                    ) : fulfilled > 0 ? (
                                      <div className="inline-flex flex-col items-center">
                                        <span className="font-mono font-bold text-amber-400 text-xs">
                                          {fulfilled} / {item.quantity}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                          ({remaining} remaining)
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="inline-flex flex-col items-center">
                                        <span className="text-muted-foreground font-mono text-xs">
                                          0 / {item.quantity}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                                          (not handed over)
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                )}
                                <td className="p-3 text-right text-xs">{fmt(item.unit_price)}</td>
                                <td className="p-3 text-right text-xs font-bold text-foreground">{fmt(item.line_total)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment History Section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-[10px] uppercase font-black text-muted-foreground tracking-wider">
                        Payment History ({salePayments.length} records)
                      </h4>
                      {canRecordPayment && (
                        <Button
                          size="sm"
                          onClick={handleOpenRecordPaymentModal}
                          className="h-7 text-[10px] font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-2.5 cursor-pointer shadow-xs"
                        >
                          <Banknote className="w-3 h-3" /> Record Payment
                        </Button>
                      )}
                    </div>

                    <div className="border border-border rounded-xl overflow-hidden">
                      {salePayments.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-xs">
                          No payment records found.
                        </div>
                      ) : (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border text-muted-foreground font-bold text-[10px]">
                              <th className="p-2.5">Date & Method</th>
                              <th className="p-2.5">Details</th>
                              <th className="p-2.5 text-right">Amount</th>
                              <th className="p-2.5 text-center">Status</th>
                              <th className="p-2.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border font-medium">
                            {salePayments.map((p) => {
                              const pDate = p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                              return (
                                <tr key={p.id} className="hover:bg-muted/5">
                                  <td className="p-2.5">
                                    <div className="font-bold text-foreground capitalize flex items-center gap-1">
                                      {p.payment_method}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">{pDate}</div>
                                  </td>
                                  <td className="p-2.5">
                                    {p.payment_method === 'cheque' ? (
                                      <div className="text-[11px] space-y-0.5 font-mono">
                                        <div><span className="text-muted-foreground">Cheque #:</span> <strong className="text-foreground">{p.cheque_number}</strong></div>
                                        <div><span className="text-muted-foreground">Bank:</span> {p.bank_name}</div>
                                        <div><span className="text-muted-foreground">Date:</span> {p.cheque_date}</div>
                                        {p.notes && <div className="text-muted-foreground italic text-[10px]">{p.notes}</div>}
                                      </div>
                                    ) : (
                                      <div className="text-[11px] text-muted-foreground">
                                        {p.reference ? `Ref: ${p.reference}` : 'Standard Payment'}
                                        {p.notes && <div className="italic text-[10px]">{p.notes}</div>}
                                      </div>
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
                                        p.status === 'cleared'
                                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                          : p.status === 'pending'
                                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                          : p.status === 'bounced'
                                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
                                      }`}
                                    >
                                      {p.status === 'pending' ? 'PENDING CLEARANCE' : p.status}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {p.payment_method === 'cheque' && p.status === 'pending' && !salePaymentSummary?.is_revoked && !posReceiptDetails.sale.invoice_revoked_at && (
                                        <>
                                          <button
                                            onClick={() => handleUpdateChequeStatus(p.id, 'cleared')}
                                            className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
                                            title="Mark Cheque Cleared"
                                          >
                                            Clear
                                          </button>
                                          <button
                                            onClick={() => handleUpdateChequeStatus(p.id, 'bounced')}
                                            className="px-2 py-0.5 text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded cursor-pointer"
                                            title="Mark Cheque Bounced"
                                          >
                                            Bounce
                                          </button>
                                          <button
                                            onClick={() => handleUpdateChequeStatus(p.id, 'cancelled')}
                                            className="px-2 py-0.5 text-[10px] font-bold bg-muted hover:bg-muted/80 text-foreground rounded cursor-pointer"
                                            title="Cancel Cheque"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      )}
                                      {p.status === 'cleared' && (p.remaining_reversible ?? p.amount) > 0 && !salePaymentSummary?.is_revoked && !posReceiptDetails.sale.invoice_revoked_at && (
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
                              );
                            })}
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

                  {/* Handover History (Delivery Notes) */}
                  {isCommercialSale && (
                    <div id="handover-history-section" className="scroll-mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] uppercase font-black text-indigo-400 tracking-wider flex items-center gap-1.5">
                          <PackageCheck className="h-3.5 w-3.5" />
                          Handover History ({saleFulfillments.length} {saleFulfillments.length === 1 ? 'Delivery Note' : 'Delivery Notes'})
                        </h4>
                        {hasFulfillmentRemaining && !isRevoked && (
                          <Button
                            size="sm"
                            onClick={() => setShowHandoverModal(true)}
                            className="h-7 text-[10px] font-bold gap-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-2.5 cursor-pointer shadow-xs"
                          >
                            <PackageCheck className="w-3 h-3" /> {isPartiallyHandedOver ? 'Hand Over Remaining' : 'Hand Over Products'}
                          </Button>
                        )}
                      </div>

                      <div className="border border-indigo-500/20 rounded-xl overflow-hidden bg-indigo-500/5">
                        {saleFulfillments.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground text-xs">
                            No physical products have been handed over yet.
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-indigo-500/10 border-b border-indigo-500/20 text-indigo-300 font-bold text-[10px]">
                                <th className="p-2.5">DN # &amp; Date</th>
                                <th className="p-2.5">Recipient &amp; Staff</th>
                                <th className="p-2.5 text-center">Items</th>
                                <th className="p-2.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-indigo-500/10">
                              {saleFulfillments.map((f) => {
                                const dnDate = f.created_at
                                  ? new Date(f.created_at).toLocaleDateString("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—";
                                const totalQty = f.items.reduce((s, it) => s + it.quantity, 0);
                                const unitCount = f.items.filter(it => it.unit_id).length;

                                return (
                                  <tr key={f.id} className="hover:bg-indigo-500/10 transition-colors">
                                    <td className="p-2.5">
                                      <div className="font-mono font-bold text-indigo-300 text-[11px]">
                                        {f.fulfillment_number}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground font-mono">
                                        {dnDate}
                                      </div>
                                    </td>
                                    <td className="p-2.5">
                                      <div className="font-semibold text-foreground">
                                        {f.recipient_name || "Customer Staff"}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        By: {f.handed_over_by_name} {f.recipient_phone ? `· ${f.recipient_phone}` : ""}
                                      </div>
                                    </td>
                                    <td className="p-2.5 text-center">
                                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-muted/60 text-foreground">
                                        {totalQty} {totalQty === 1 ? "unit" : "units"}
                                        {unitCount > 0 ? ` (${unitCount} SN)` : ""}
                                      </span>
                                    </td>
                                    <td className="p-2.5 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => {
                                            setSelectedFulfillmentForDN(f);
                                            setShowDeliveryNoteModal(true);
                                          }}
                                          className="px-2 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded cursor-pointer transition-colors"
                                          title="View & Print Delivery Note"
                                        >
                                          View DN
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}

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
                      <span>INVOICE TOTAL</span>
                      <span className="text-blue-500 text-base">{fmt(posReceiptDetails.sale.total)}</span>
                    </div>
                    {salePaymentSummary && (
                      <>
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>Payments Received (Gross)</span>
                          <span>{fmt(salePaymentSummary.gross_cleared_paid ?? salePaymentSummary.cleared_paid)}</span>
                        </div>
                        {(salePaymentSummary.returned_amount ?? 0) > 0 && (
                          <div className="flex justify-between text-rose-400 font-bold">
                            <span>Payments Returned</span>
                            <span>-{fmt(salePaymentSummary.returned_amount!)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-emerald-400 font-extrabold">
                          <span>Effective Paid</span>
                          <span>{fmt(salePaymentSummary.effective_cleared_paid ?? salePaymentSummary.cleared_paid)}</span>
                        </div>
                        {salePaymentSummary.pending_clearance > 0 && (
                          <div className="flex justify-between text-amber-400 font-bold">
                            <span>Pending Cheque Clearance</span>
                            <span>{fmt(salePaymentSummary.pending_clearance)}</span>
                          </div>
                        )}
                        <div className={`flex justify-between border-t border-dashed border-border pt-2 text-xs font-black ${
                          salePaymentSummary.balance_due > 0 ? "text-rose-400" : "text-emerald-400"
                        }`}>
                          <span>Balance Due</span>
                          <span>{salePaymentSummary.balance_due > 0 ? fmt(salePaymentSummary.balance_due) : "Settled (Rs. 0)"}</span>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Contextual Modal Footer */}
            <div className="sticky bottom-0 z-10 px-6 py-3.5 border-t border-border bg-card/95 backdrop-blur-sm flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Left Side: Close + Overflow More Menu */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedPosSaleId(null)} className="cursor-pointer">
                  Close
                </Button>

                {/* Overflow More Menu for Commercial Sales */}
                {isCommercialSale && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="h-8 px-2.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                      title="More Options"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span>More</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52 bg-card border border-border shadow-xl rounded-xl p-1 text-xs">
                      {saleFulfillments.length > 0 && (
                        <>
                          <DropdownMenuItem
                            onClick={() => {
                              const el = document.getElementById("handover-history-section");
                              el?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="cursor-pointer gap-2 text-xs"
                          >
                            <History className="h-3.5 w-3.5 text-indigo-400" /> Handover History
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedFulfillmentForDN(saleFulfillments[0]);
                              setShowDeliveryNoteModal(true);
                            }}
                            className="cursor-pointer gap-2 text-xs"
                          >
                            <FileText className="h-3.5 w-3.5 text-indigo-400" /> Delivery Note
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      {!isRevoked && (
                        <DropdownMenuItem
                          disabled={!isEligibleToRevoke}
                          onClick={() => {
                            if (!isEligibleToRevoke) return;
                            setRevokeReason("Invoice issued in error");
                            setRevokeNotes("");
                            setRevokeActionMessage(null);
                            setShowRevokeModal(true);
                          }}
                          className={`cursor-pointer gap-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 focus:text-rose-300 focus:bg-rose-500/10 ${
                            !isEligibleToRevoke ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          title={
                            !isEligibleToRevoke
                              ? effectivePaid > 0
                                ? `Return ${fmt(effectivePaid)} in cleared payments before revoking this invoice.`
                                : `Resolve pending cheques (${fmt(pendingCheques)}) before revoking this invoice.`
                              : 'Revoke this commercial invoice'
                          }
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-rose-400" />
                          <span>Revoke Invoice</span>
                          {!isEligibleToRevoke && (
                            <span className="text-[10px] text-muted-foreground ml-auto">Blocked</span>
                          )}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* For non-commercial sales (POS), keep Revoke accessible if applicable */}
                {!isCommercialSale && posReceiptDetails && posReceiptDetails.sale.invoice_number && !isRevoked && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isEligibleToRevoke}
                    onClick={() => {
                      setRevokeReason('Invoice issued in error');
                      setRevokeNotes('');
                      setRevokeActionMessage(null);
                      setShowRevokeModal(true);
                    }}
                    className="gap-1 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    title={
                      !isEligibleToRevoke
                        ? effectivePaid > 0
                          ? `Return ${fmt(effectivePaid)} in cleared payments before revoking this invoice.`
                          : `Resolve pending cheques (${fmt(pendingCheques)}) before revoking this invoice.`
                        : 'Revoke this invoice'
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Revoke Invoice
                  </Button>
                )}
              </div>

              {/* Right Side: Contextual Action Buttons */}
              <div className="flex items-center gap-2">
                {posReceiptDetails && (
                  <>
                    {/* Secondary Document Actions: Send & Print Invoice */}
                    {!isRevoked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenSendWorkflow}
                        className="gap-1 text-xs border-border text-foreground hover:bg-muted font-bold cursor-pointer"
                        title="Send Invoice via Email or SMS"
                      >
                        <Mail className="h-3.5 w-3.5 text-blue-400" /> Send Invoice
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrintInvoice}
                      className="gap-1 text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 font-bold cursor-pointer"
                      title="Print Commercial A4 Invoice"
                    >
                      <FileText className="h-3.5 w-3.5" /> Print Invoice
                    </Button>

                    {/* Commercial Contextual Actions */}
                    {isCommercialSale && (
                      <>
                        {/* Primary 1: Record Payment if balance/amount available */}
                        {canRecordPayment && (
                          <Button
                            onClick={handleOpenRecordPaymentModal}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs font-bold cursor-pointer shadow-xs"
                            title="Record Payment Installment"
                          >
                            <Banknote className="h-3.5 w-3.5" /> Record Payment
                          </Button>
                        )}

                        {/* Primary 2: Goods Handover if unfulfilled items remain */}
                        {hasFulfillmentRemaining && !isRevoked && (
                          <Button
                            onClick={() => setShowHandoverModal(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5 text-xs font-bold cursor-pointer shadow-xs"
                            title="Perform Physical Goods Handover"
                          >
                            <PackageCheck className="h-3.5 w-3.5" /> {isPartiallyHandedOver ? 'Hand Over Remaining' : 'Hand Over Products'}
                          </Button>
                        )}
                        {/* NOTE: If fully handed over, DO NOT show disabled "Fully Handed Over" button. The header badge already communicates this! */}
                        {/* NOTE: Thermal Receipt is strictly omitted for commercial sales! */}
                      </>
                    )}

                    {/* POS Contextual Actions (Non-commercial sales ONLY) */}
                    {!isCommercialSale && (
                      <>
                        {canRecordPayment && (
                          <Button
                            onClick={handleOpenRecordPaymentModal}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs font-bold cursor-pointer shadow-xs"
                          >
                            <Banknote className="h-3.5 w-3.5" /> Record Payment
                          </Button>
                        )}
                        <Button
                          onClick={handleReprintReceipt}
                          className="bg-blue-600 hover:bg-blue-500 text-white gap-1.5 text-xs font-bold cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" /> Thermal Receipt
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    })()}

      {/* Record Additional Payment Modal */}
      {showRecordPaymentModal && posReceiptDetails && salePaymentSummary && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowRecordPaymentModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Record Sale Payment"
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-2xl w-full max-w-md p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="h-12 w-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500">
              <Banknote className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-foreground">Record Payment Installment</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Record a payment for Invoice <strong className="text-foreground">#{posReceiptDetails.sale.receipt_number}</strong>
              </p>
            </div>

            {/* Authoritative Financial Snapshot */}
            <div className="grid grid-cols-3 gap-2 bg-muted/30 border border-border/50 rounded-xl p-3 text-left">
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Total</span>
                <span className="text-xs font-black text-foreground">{fmt(salePaymentSummary.invoice_total)}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Cleared Paid</span>
                <span className="text-xs font-black text-emerald-400">{fmt(salePaymentSummary.cleared_paid)}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase block">Balance Due</span>
                <span className="text-xs font-black text-primary">{fmt(salePaymentSummary.balance_due)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="text-left space-y-1.5">
              <label className="text-xs font-bold text-foreground block">Payment Method:</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'card', 'cheque'] as const).map((method) => (
                  <button
                    type="button"
                    key={method}
                    onClick={() => setRecordMethod(method)}
                    className={`p-2 rounded-xl border text-xs font-bold uppercase transition-colors flex items-center justify-center gap-1 ${
                      recordMethod === method
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Paid Input */}
            <div className="text-left space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-foreground block">Amount to Pay (LKR):</label>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Available to Record: <strong className="text-foreground">{fmt(salePaymentSummary.available_to_record)}</strong>
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">LKR</span>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={recordAmount}
                  onChange={(e) => setRecordAmount(e.target.value)}
                  className="pl-12 text-sm font-bold bg-background text-foreground"
                />
              </div>
            </div>

            {/* Cheque Specific Fields */}
            {recordMethod === 'cheque' && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-left space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold pb-1 border-b border-amber-500/15">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Cheque Details (Pending Clearance)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-foreground block mb-1">Cheque Number *</label>
                    <Input
                      type="text"
                      placeholder="e.g. 000123456"
                      value={recordChequeNumber}
                      onChange={(e) => setRecordChequeNumber(e.target.value)}
                      className="text-xs bg-background font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-foreground block mb-1">Cheque Date *</label>
                    <Input
                      type="date"
                      value={recordChequeDate}
                      onChange={(e) => setRecordChequeDate(e.target.value)}
                      className="text-xs bg-background"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-foreground block mb-1">Bank Name *</label>
                  <Input
                    type="text"
                    placeholder="e.g. Commercial Bank of Ceylon"
                    value={recordBankName}
                    onChange={(e) => setRecordBankName(e.target.value)}
                    className="text-xs bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-foreground block mb-1">Cheque Notes</label>
                  <Input
                    type="text"
                    placeholder="Branch or instructions (optional)"
                    value={recordChequeNotes}
                    onChange={(e) => setRecordChequeNotes(e.target.value)}
                    className="text-xs bg-background"
                  />
                </div>
              </div>
            )}

            {paymentActionMessage && (
              <p className={`text-xs font-semibold ${paymentActionMessage.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                {paymentActionMessage.text}
              </p>
            )}

            <div className="flex gap-2 justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setShowRecordPaymentModal(false)}
                className="h-9 px-4 rounded-xl text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordPaymentSubmit}
                disabled={
                  isRecordingPayment ||
                  isNaN(parseFloat(recordAmount)) ||
                  parseFloat(recordAmount) <= 0 ||
                  parseFloat(recordAmount) > salePaymentSummary.available_to_record ||
                  (recordMethod === 'cheque' && (!recordChequeNumber.trim() || !recordChequeDate || !recordBankName.trim()))
                }
                className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRecordingPayment ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RETURN PAYMENT (REVERSAL) MODAL */}
      {showReturnPaymentModal && targetPaymentForReturn && posReceiptDetails && (
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
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
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
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                >
                  {isSubmittingReturn ? "Recording Return..." : "Confirm Payment Return"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVOKE INVOICE CONFIRMATION MODAL */}
      {showRevokeModal && posReceiptDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-rose-500/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-rose-500/10">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-400" />
                <h3 className="font-bold text-foreground text-sm">Revoke Commercial Invoice</h3>
              </div>
              <button
                onClick={() => {
                  setShowRevokeModal(false);
                  setRevokeActionMessage(null);
                }}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleRevokeInvoice} className="p-6 space-y-4">
              {revokeActionMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    revokeActionMessage.type === "success"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  }`}
                >
                  {revokeActionMessage.type === "success" ? (
                    <CheckCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{revokeActionMessage.text}</span>
                </div>
              )}

              {/* Invoice Target Summary */}
              <div className="bg-muted/40 p-3 rounded-xl border border-border space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice / Receipt #:</span>
                  <span className="font-mono font-bold text-foreground">
                    {posReceiptDetails.sale.receipt_number || `POS-${posReceiptDetails.sale.id.slice(-6).toUpperCase()}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-semibold text-foreground">
                    {posReceiptDetails.sale.customer_name || 'Walk-in Customer'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice Total:</span>
                  <span className="font-mono font-bold text-foreground">{fmt(posReceiptDetails.sale.total)}</span>
                </div>
              </div>

              {/* Reason Selector */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Reason for Revocation *
                </label>
                <select
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  required
                >
                  <option value="Invoice issued in error">Invoice issued in error</option>
                  <option value="Duplicate invoice">Duplicate invoice</option>
                  <option value="Customer order cancelled prior to delivery">Customer order cancelled prior to delivery</option>
                  <option value="Terms renegotiated / Replaced by new invoice">Terms renegotiated / Replaced by new invoice</option>
                  <option value="Administrative correction">Administrative correction</option>
                  <option value="Other">Other (specify in notes)</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Revocation Notes {revokeReason === "Other" ? "*" : "(Optional)"}
                </label>
                <Input
                  type="text"
                  value={revokeNotes}
                  onChange={(e) => setRevokeNotes(e.target.value)}
                  placeholder={revokeReason === "Other" ? "Detailed mandatory explanation required" : "Additional operational context"}
                  className="h-9 text-xs"
                  required={revokeReason === "Other"}
                />
              </div>

              {/* High Friction Critical Warning */}
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2 text-[11px] text-rose-300">
                <div className="flex items-center gap-2 font-bold text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>CRITICAL COMPLIANCE NOTICE:</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-rose-300/90 text-[10.5px]">
                  <li>This invoice will be marked <strong>REVOKED</strong> and locked from all further payments and cheque clearing.</li>
                  <li>Receivables will be zeroed out and excluded from outstanding balances and metrics.</li>
                  <li><strong>Physical Stock & Inventory:</strong> Product inventory counts and serial tracking will <strong>NOT</strong> be modified.</li>
                  <li>This action is permanently recorded in the immutable system audit log.</li>
                </ul>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRevokeModal(false)}
                  disabled={isRevoking}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    isRevoking ||
                    (revokeReason === "Other" && !revokeNotes.trim())
                  }
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isRevoking ? "Revoking Invoice..." : "Confirm & Revoke Invoice"}
                </Button>
              </div>
            </form>
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
      {/* Commercial Goods Handover Modal */}
      {showHandoverModal && posReceiptDetails && (
        <CommercialHandoverModal
          isOpen={showHandoverModal}
          onClose={() => setShowHandoverModal(false)}
          sale={posReceiptDetails.sale}
          items={posReceiptDetails.items}
          onSuccess={(fulfillmentRecord) => {
            if (selectedPosSaleId) {
              refreshFulfillmentsAndSale(selectedPosSaleId);
            }
          }}
          onPrintInvoice={() => handlePrintInvoice()}
          onOpenDeliveryNote={(record) => {
            setSelectedFulfillmentForDN(record);
            setShowDeliveryNoteModal(true);
          }}
          onOpenHistory={() => {
            // Modal already shows history in background drawer
          }}
        />
      )}

      {/* Delivery Note Modal */}
      {showDeliveryNoteModal && (
        <DeliveryNoteModal
          isOpen={showDeliveryNoteModal}
          onClose={() => {
            setShowDeliveryNoteModal(false);
            setSelectedFulfillmentForDN(null);
          }}
          fulfillment={selectedFulfillmentForDN}
          sale={posReceiptDetails?.sale || null}
        />
      )}
    </div>
  );
}
