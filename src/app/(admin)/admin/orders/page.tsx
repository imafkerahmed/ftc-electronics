'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  updateOrderStatusAction,
  markOrderAsPaidAction,
  getAdminOrdersAction,
  getAdminOrderByIdAction,
  getReceiptPrintPresetsAction,
  sendOrderInvoiceEmailAction,
  downloadOrderInvoicePdfAction,
  markOrderAsReturnedAction,
  cancelOrderAction,
  cancelExpiredUnpaidOrdersAction,
  getPaymentSlipSignedUrlAction,
} from '@/app/actions/admin';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminKeys } from '@/lib/query-keys';
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig, type ReceiptPrintConfig } from '@/types/receipt-config';
import { printReceipt } from '@/lib/receipt-print';
import { printInvoice, resolveInvoiceConfig, type InvoiceData } from '@/lib/invoice-print';
import {
  Loader2, CheckCircle, AlertCircle, ShoppingBag, Printer, FileText, Mail,
  Search, Truck, Check, CheckCircle2, RotateCcw, Ban, Clock, ChevronDown,
  ChevronRight, ExternalLink, Package, Eye,
  ArrowLeft, ArrowRight,
} from 'lucide-react';
import ShipFulfillmentModal from '@/components/admin/ship-fulfillment-modal';
import type { OrderStatus } from '@/types/order';

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  assignedSerials?: string[];
  assignedUnits?: Array<{ unitId: string; barcode: string; serialNumber?: string }>;
}

interface Order {
  id: string;
  orderId: string;
  email: string;
  customerName: string;
  total: number;
  paymentStatus: 'paid' | 'pending';
  paymentMethod: string;
  shippingStatus: OrderStatus;
  date: string;
  rawItems: OrderItem[];
  paymentSlip?: string; // PocketBase file ID for uploaded bank transfer slip
  pbCollectionId?: string; // For building PocketBase file URLs
}

type TabFilter = 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

const collectSerials = (item: OrderItem): string[] => {
  const serials: string[] = [];
  if (Array.isArray(item.assignedSerials) && item.assignedSerials.length > 0) {
    serials.push(...item.assignedSerials);
  }
  if (Array.isArray(item.assignedUnits) && item.assignedUnits.length > 0) {
    item.assignedUnits.forEach((u) => {
      const val = u.serialNumber || u.barcode;
      if (val && !serials.includes(val)) serials.push(val);
    });
  }
  return serials;
};

const getFallbackInvoiceDate = (orderDate?: string) => {
  return orderDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getQuotationDueDate = () => {
  return new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Build storage URL for viewing uploaded slip
const buildSlipUrl = (_recordId: string, _collectionId: string, filename: string): string => {
  if (!filename) return '';
  if (filename.startsWith('//')) return '';
  if (filename.startsWith('http://') || filename.startsWith('https://') || (filename.startsWith('/') && !filename.startsWith('//'))) return filename;
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (sbUrl) {
    const encoded = filename.split('/').map(encodeURIComponent).join('/');
    return `${sbUrl}/storage/v1/object/public/payment-slips/${encoded}`;
  }
  return '';
};

export default function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [selectedFulfillOrderId, setSelectedFulfillOrderId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [loadingSlipId, setLoadingSlipId] = useState<string | null>(null);

  // Confirmation Modals State
  const [deliverConfirmOrder, setDeliverConfirmOrder] = useState<{ id: string; orderId: string } | null>(null);
  const [returnConfirmOrder, setReturnConfirmOrder] = useState<{ id: string; orderId: string } | null>(null);
  const [returnReason, setReturnReason] = useState('Customer unreachable / Package returned');
  const [cancelConfirmOrder, setCancelConfirmOrder] = useState<{ id: string; orderId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('Payment not received / Abandoned order');

  // Email confirmation dialog
  const [emailConfirmOrder, setEmailConfirmOrder] = useState<Order | null>(null);

  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [defaultReceiptConfig, setDefaultReceiptConfig] = useState<ReceiptPrintConfig>(DEFAULT_RECEIPT_CONFIG);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  let statusFilter: string | undefined;
  let paymentStatusFilter: string | undefined;

  if (activeTab === 'pending') {
    paymentStatusFilter = 'unpaid';
  } else if (activeTab === 'processing') {
    statusFilter = 'processing';
  } else if (activeTab === 'shipped') {
    statusFilter = 'shipped';
  } else if (activeTab === 'delivered') {
    statusFilter = 'delivered';
  } else if (activeTab === 'cancelled') {
    statusFilter = 'cancelled';
  }

  const { data: ordersData, isLoading: loading, isFetching, isError, error: queryError, refetch: loadData } = useQuery({
    queryKey: adminKeys.orders({ page, pageSize, search: debouncedSearch, status: statusFilter, paymentStatus: paymentStatusFilter }),
    queryFn: async () => {
      const res = await getAdminOrdersAction({
        page,
        pageSize,
        search: debouncedSearch,
        status: statusFilter,
        paymentStatus: paymentStatusFilter
      });
      if (!res.success) throw new Error(res.error || 'Failed to load orders');

      const mappedOrders = (res.data || []).map((o: any) => {
        const rawDate = o.created_at || o.created || o.updated;
        const parsedDate = rawDate ? new Date(rawDate) : new Date();
        const dateStr = !isNaN(parsedDate.getTime())
          ? parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
          : 'N/A';

        const method = o.payment_method || 'Unknown';
        const isPaid = o.is_paid || o.isPaid || false;

        return {
          id: o.id,
          orderId: o.order_id || o.id,
          email: o.customer?.email || 'guest@example.com',
          customerName: o.customer?.name || '',
          total: o.total || 0,
          paymentStatus: isPaid ? 'paid' : 'pending',
          paymentMethod: method,
          shippingStatus: (o.status || 'pending') as OrderStatus,
          date: dateStr,
          rawItems: [], // Loaded on demand
          paymentSlip: '',
          pbCollectionId: 'orders',
        };
      });

      return {
        ...res,
        data: mappedOrders
      };
    },
    placeholderData: (prev) => prev,
  });

  const orders = ordersData?.data || [];
  const totalPages = ordersData?.totalPages || 1;
  const totalCount = ordersData?.total || 0;

  useEffect(() => {
    async function loadReceiptPreset() {
      const res = await getReceiptPrintPresetsAction();
      if (res.success && res.data && res.data.length > 0) {
        const def = res.data.find((p) => p.isDefault) || res.data[0];
        setDefaultReceiptConfig(normalizeReceiptConfig(def.config));
      }
    }
    void loadReceiptPreset();
  }, []);



  const handleViewSlip = async (orderId: string) => {
    try {
      setLoadingSlipId(orderId);
      const res = await getPaymentSlipSignedUrlAction(orderId);
      if (res.success && res.signedUrl) {
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        setError(res.error || 'Failed to open payment slip.');
      }
    } catch {
      setError('Failed to open payment slip.');
    } finally {
      setLoadingSlipId(null);
    }
  };

  const handleMarkPaid = (id: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await markOrderAsPaidAction(id);
      if (res.success) {
        setSuccess('Order approved & marked as paid. Confirmation email sent to customer.');
        queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
        loadData();
      } else {
        setError(res.error || 'Failed to mark order as paid.');
      }
    });
  };

  const confirmMarkDelivered = () => {
    if (!deliverConfirmOrder) return;
    const { id, orderId } = deliverConfirmOrder;
    setDeliverConfirmOrder(null);

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await updateOrderStatusAction(id, 'delivered');
      if (res.success) {
        setSuccess(`Order #${orderId} marked as Delivered successfully!`);
        queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
        loadData();
      } else {
        setError(res.error || 'Failed to update delivery status.');
      }
    });
  };

  const confirmMarkReturned = () => {
    if (!returnConfirmOrder) return;
    const { id, orderId } = returnConfirmOrder;
    const reasonText = returnReason.trim() || 'Customer unreachable / Package returned';
    setReturnConfirmOrder(null);

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await markOrderAsReturnedAction(id, reasonText);
      if (res.success) {
        setSuccess(`Order #${orderId} marked as Returned. Product stock & serial numbers restored to Available!`);
        queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
        loadData();
      } else {
        setError(res.error || 'Failed to process order return.');
      }
    });
  };

  const confirmCancelOrder = () => {
    if (!cancelConfirmOrder) return;
    const { id, orderId } = cancelConfirmOrder;
    const reasonText = cancelReason.trim() || 'Payment not received / Abandoned order';
    setCancelConfirmOrder(null);

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await cancelOrderAction(id, reasonText);
      if (res.success) {
        setSuccess(`Order #${orderId} cancelled successfully. Reserved stock & serial units released.`);
        loadData();
      } else {
        setError(res.error || 'Failed to cancel order.');
      }
    });
  };

  const handleCancelExpiredUnpaid = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await cancelExpiredUnpaidOrdersAction(24);
      if (res.success) {
        setSuccess(res.message || 'Auto-cleaned expired unpaid orders.');
        loadData();
      } else {
        setError(res.error || 'Failed to cancel expired unpaid orders.');
      }
    });
  };

  // Email button — opens confirmation dialog
  const handleEmailButtonClick = (order: Order) => {
    if (!order.email || order.email === 'guest@example.com') {
      setError('No customer email configured for this order.');
      return;
    }
    setEmailConfirmOrder(order);
  };

  // Actually send after confirmation
  const confirmSendEmail = () => {
    if (!emailConfirmOrder) return;
    const order = emailConfirmOrder;
    setEmailConfirmOrder(null);

    setError(null);
    setSuccess(null);
    setSendingEmailId(order.id);
    startTransition(async () => {
      const res = await sendOrderInvoiceEmailAction(order.id);
      if (res.success) {
        setSuccess(`Invoice emailed to ${order.email} successfully!`);
      } else {
        setError(res.error || 'Failed to send invoice email.');
      }
      setSendingEmailId(null);
    });
  };

  const handlePrintOrderInvoice = async (order: Order, docType: 'Quotation' | 'Invoice') => {
    const isQuotation = docType === 'Quotation';
    const cfg = await resolveInvoiceConfig();

    const docNumber = isQuotation ? `QUO-${order.orderId}` : `INV-${order.orderId}`;
    const isPaid = order.paymentStatus === 'paid';

    const fullRes = await getAdminOrderByIdAction(order.id);
    const fullItems = fullRes.success ? (Array.isArray(fullRes.data?.items) ? fullRes.data.items : []) : [];

    const invoiceItems =
      fullItems && fullItems.length > 0
        ? fullItems.map((item: any) => {
            const serialsList = collectSerials(item);
            return {
              name: item.name || `Product Item`,
              qty: item.quantity || 1,
              unitPrice: item.price || 0,
              serialNumber: serialsList.length > 0 ? serialsList.join(', ') : undefined,
            };
          })
        : [{ name: `Order ${order.orderId}`, qty: 1, unitPrice: order.total }];

    const invoiceData: InvoiceData = {
      docType,
      docNumber,
      date: getFallbackInvoiceDate(order.date),
      dueDate: isQuotation ? getQuotationDueDate() : undefined,
      customerName: order.customerName || order.email,
      items: invoiceItems,
      subtotal: order.total,
      totalAmount: order.total,
      paymentMethod: isQuotation ? 'UNPAID / ESTIMATE' : isPaid ? 'PAID' : 'PAYMENT PENDING',
      notes: isQuotation
        ? 'Quotation valid for 14 days from issue date.'
        : isPaid
        ? 'Official Paid Invoice. Thank you for shopping with FTC Electronics!'
        : 'Proforma Invoice — payment not yet received.',
    };

    printInvoice(cfg, invoiceData, isQuotation ? 'Sales Quotation' : isPaid ? 'Paid Invoice' : 'Proforma Invoice');
  };

  const toggleRow = (orderId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const getShippingBadge = (order: Order) => {
    if (order.shippingStatus === 'pending' && order.paymentStatus === 'pending') {
      return (
        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
          Awaiting Payment
        </span>
      );
    }
    switch (order.shippingStatus) {
      case 'delivered':
        return (
          <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Delivered
          </span>
        );
      case 'shipped':
        return (
          <span className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Shipped
          </span>
        );
      case 'processing':
        return (
          <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Processing
          </span>
        );
      case 'cancelled':
      case 'refunded':
        return (
          <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            {order.shippingStatus === 'refunded' ? 'Refunded' : 'Cancelled / Returned'}
          </span>
        );
      case 'pending_payment':
        return (
          <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Pending Payment
          </span>
        );
      default:
        return (
          <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Pending
          </span>
        );
    }
  };

  const getPaymentMethodLabel = (method?: string) => {
    if (!method || method === 'Unknown') return 'Unknown';
    switch (method) {
      case 'bank_transfer':
        return '🏦 Bank Transfer';
      case 'cash_pickup':
        return '📦 Cash on Pickup';
      case 'cash_delivery':
      case 'cod':
        return '🛵 Cash on Delivery';
      case 'stripe':
      case 'payhere':
        return '💳 Card';
      default:
        return method;
    }
  };



  return (
    <div className="space-y-6 text-foreground">
      {/* Feedback Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-500 text-xs">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-500 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-blue-500" />
            Fulfillment Tracker
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Review customer receipts, filter status tabs, coordinate shipments, and process order cancellations &amp; returns.</p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleCancelExpiredUnpaid}
          disabled={isPending}
          className="text-xs font-semibold text-amber-500 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer self-start md:self-auto shrink-0"
          title="Automatically cancel unpaid orders created more than 24 hours ago and release reserved inventory"
        >
          <Clock className="h-3.5 w-3.5 mr-1.5" />
          Clean Expired Unpaid (&gt;24h)
        </Button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-border">
          <button
            onClick={() => { setActiveTab('all'); setPage(1); }}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === 'all' ? 'border-blue-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            All Orders
          </button>
          <button
            onClick={() => { setActiveTab('pending'); setPage(1); }}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === 'pending' ? 'border-blue-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Pending Payment
          </button>
          <button
            onClick={() => { setActiveTab('processing'); setPage(1); }}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === 'processing' ? 'border-blue-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Processing
          </button>
          <button
            onClick={() => { setActiveTab('shipped'); setPage(1); }}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === 'shipped' ? 'border-blue-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Shipped
          </button>
          <button
            onClick={() => { setActiveTab('delivered'); setPage(1); }}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === 'delivered' ? 'border-blue-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Delivered
          </button>
          <button
            onClick={() => { setActiveTab('cancelled'); setPage(1); }}
            className={`px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
              activeTab === 'cancelled' ? 'border-blue-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Cancelled / Returned
          </button>
        </div>

        <div className="relative w-full md:w-64 shrink-0">
          <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search Order ID, Email, Product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 bg-card border-border text-xs"
          />
        </div>
      </div>

      {/* Orders List Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading order records...
            </div>
          ) : isError ? (
            <div className="bg-red-500/5 border border-red-500/10 p-8 text-center text-xs text-red-500 rounded-xl">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500/80" />
              <p className="mb-1 font-semibold">Failed to load orders</p>
              <p className="opacity-80">
                {(queryError as Error)?.message || "An unexpected error occurred."}
              </p>
            </div>
          ) : (
            <div className="relative">
              {isFetching && (
                <div className="bg-background/50 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              )}
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-4 w-6"></th>
                  <th className="p-4">Order ID</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Order Date</th>
                  <th className="p-4">Total Amount</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4">Shipment Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-semibold">No orders found</p>
                        <p className="text-xs mt-1">Try adjusting your filters or search query.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const isExpanded = expandedRows.has(order.id);
                    const hasSlip = !!(order.paymentSlip && order.paymentSlip.length > 0);
                    const isBankTransfer = order.paymentMethod === 'bank_transfer';

                    return (
                      <React.Fragment key={order.id}>
                        {/* Main Row */}
                        <tr className={`hover:bg-muted/10 transition-colors ${isExpanded ? 'bg-muted/5' : ''}`}>
                          {/* Expand toggle */}
                          <td className="pl-4 pr-2">
                            <button
                              onClick={() => toggleRow(order.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              title={isExpanded ? 'Hide items' : 'Show items'}
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                              }
                            </button>
                          </td>
                          <td className="p-4 font-bold text-foreground font-mono">{order.orderId}</td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              {order.customerName && (
                                <span className="font-semibold text-foreground text-[11px]">{order.customerName}</span>
                              )}
                              <span className="font-mono text-muted-foreground text-[11px]">{order.email}</span>
                            </div>
                          </td>
                          <td className="p-4 text-muted-foreground">{order.date}</td>
                          <td className="p-4 font-bold text-foreground">
                            {order.total.toLocaleString('en-US', { style: 'currency', currency: 'LKR' })}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-flex items-center gap-1 font-bold ${
                                  order.paymentStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'
                                }`}
                              >
                                {order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{getPaymentMethodLabel(order.paymentMethod)}</span>
                              {isBankTransfer && hasSlip && (
                                <span className="text-[10px] text-blue-400 font-semibold">✅ Slip uploaded</span>
                              )}
                              {isBankTransfer && !hasSlip && order.paymentStatus === 'pending' && (
                                <span className="text-[10px] text-amber-400">⏳ Awaiting slip</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4">{getShippingBadge(order as unknown as Order)}</td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Mark Paid button — for bank transfer approval or direct cash collection */}
                              {order.paymentStatus === 'pending' && order.shippingStatus !== 'cancelled' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => handleMarkPaid(order.id)}
                                  disabled={isPending || sendingEmailId === order.id}
                                  className="h-8 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                                  title="Approve and mark order as paid — sends confirmation email to customer"
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  {isBankTransfer ? 'Approve & Confirm' : 'Mark Paid'}
                                </Button>
                              )}

                              {/* View Slip button — only for bank transfer orders with uploaded slip */}
                              {isBankTransfer && hasSlip && (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  disabled={loadingSlipId === order.id}
                                  onClick={() => handleViewSlip(order.id)}
                                  className="h-8 w-8 shrink-0 text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 cursor-pointer"
                                  title="View customer's uploaded bank transfer slip securely"
                                >
                                  {loadingSlipId === order.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              )}

                              {/* Store Pickup Handover button */}
                              {(order.paymentMethod === 'cash_pickup' || order.paymentMethod === 'pickup') &&
                                order.shippingStatus !== 'delivered' &&
                                order.shippingStatus !== 'cancelled' &&
                                order.shippingStatus !== 'refunded' && (
                                <Button
                                  size="sm"
                                  onClick={() => setDeliverConfirmOrder({ id: order.id, orderId: order.orderId })}
                                  disabled={isPending || sendingEmailId === order.id}
                                  className="h-8 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                  title="Confirm in-store cash payment collected & hand over product to customer"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {order.paymentStatus === 'paid' ? 'Confirm Handover' : 'Pay & Handover'}
                                </Button>
                              )}

                              {/* Cancel Order button */}
                              {order.shippingStatus !== 'cancelled' && order.shippingStatus !== 'delivered' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setCancelReason('Payment not received / Abandoned order');
                                    setCancelConfirmOrder({ id: order.id, orderId: order.orderId });
                                  }}
                                  disabled={isPending || sendingEmailId === order.id}
                                  className="h-8 text-[11px] font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 cursor-pointer"
                                  title="Cancel order and release any reserved stock or serial numbers"
                                >
                                  <Ban className="h-3 w-3 mr-1" />
                                  Cancel Order
                                </Button>
                              )}

                              {/* Ship Order button — available for paid orders and Cash on Delivery */}
                              {order.paymentMethod !== 'cash_pickup' &&
                                order.paymentMethod !== 'pickup' &&
                                (order.paymentStatus === 'paid' || order.paymentMethod === 'cash_delivery' || order.paymentMethod === 'cod') &&
                                order.shippingStatus !== 'shipped' &&
                                order.shippingStatus !== 'delivered' &&
                                order.shippingStatus !== 'cancelled' &&
                                order.shippingStatus !== 'refunded' && (
                                <Button
                                  size="sm"
                                  onClick={() => setSelectedFulfillOrderId(order.id)}
                                  disabled={isPending}
                                  className="h-8 text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                                  title={order.paymentStatus === 'paid' ? 'Ship order with serial numbers' : 'Fulfill and ship Cash on Delivery order'}
                                >
                                  <Truck className="h-3 w-3 mr-1" />
                                  Ship Order
                                </Button>
                              )}

                              {/* Mark Delivered button — for shipped orders */}
                              {order.shippingStatus === 'shipped' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setDeliverConfirmOrder({ id: order.id, orderId: order.orderId })}
                                  disabled={isPending || sendingEmailId === order.id}
                                  className="h-8 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                                  title={
                                    order.paymentMethod === 'cash_delivery' || order.paymentMethod === 'cod'
                                      ? 'Confirm package delivered & COD cash collected from courier'
                                      : 'Confirm package has been delivered to customer'
                                  }
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {order.paymentMethod === 'cash_delivery' || order.paymentMethod === 'cod'
                                    ? 'Mark Delivered (Paid)'
                                    : 'Mark Delivered'}
                                </Button>
                              )}

                              {/* Mark Returned button */}
                              {order.shippingStatus !== 'cancelled' && order.shippingStatus !== 'refunded' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setReturnReason('Customer unreachable / Package returned');
                                    setReturnConfirmOrder({ id: order.id, orderId: order.orderId });
                                  }}
                                  disabled={isPending || sendingEmailId === order.id}
                                  className="h-8 text-[11px] font-semibold text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 cursor-pointer"
                                  title="Mark package returned, restore inventory stock & release assigned serial numbers"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Mark Returned
                                </Button>
                              )}

                              {/* Print Invoice / Estimate button */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePrintOrderInvoice(order as unknown as Order, order.paymentStatus === 'paid' ? 'Invoice' : 'Quotation')}
                                className={`h-8 text-[11px] font-semibold flex items-center gap-1 cursor-pointer border-border hover:bg-muted ${
                                  order.paymentStatus === 'paid' ? 'text-indigo-400 border-indigo-500/30' : 'text-amber-400 border-amber-500/30'
                                }`}
                                title={order.paymentStatus === 'paid' ? 'Print Official Paid Invoice (A4)' : 'Print Order Confirmation / Estimate'}
                              >
                                <Printer className="h-3 w-3" /> {order.paymentStatus === 'paid' ? 'Print Invoice' : 'Print Estimate'}
                              </Button>

                              {/* Download PDF button (for Paid Orders) */}
                              {order.paymentStatus === 'paid' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      const res = await downloadOrderInvoicePdfAction(order.id);
                                      if (res.success && res.pdfBase64) {
                                        const byteCharacters = atob(res.pdfBase64);
                                        const byteNumbers = new Array(byteCharacters.length);
                                        for (let i = 0; i < byteCharacters.length; i++) {
                                          byteNumbers[i] = byteCharacters.charCodeAt(i);
                                        }
                                        const byteArray = new Uint8Array(byteNumbers);
                                        const blob = new Blob([byteArray], { type: 'application/pdf' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = res.filename || `FTC-Invoice-${order.orderId}.pdf`;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                                      } else {
                                        setError(res.error || 'Failed to download invoice PDF.');
                                      }
                                    } catch (pdfErr: any) {
                                      setError(pdfErr.message || 'Error downloading PDF.');
                                    }
                                  }}
                                  className="h-8 text-[11px] font-semibold flex items-center gap-1 cursor-pointer border-border hover:bg-muted text-purple-400 border-purple-500/30"
                                  title="Download Official Vector PDF Invoice"
                                >
                                  <FileText className="h-3 w-3" /> Download PDF
                                </Button>
                              )}

                              {/* Email button — opens confirmation dialog */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEmailButtonClick(order as unknown as Order)}
                                disabled={sendingEmailId === order.id || !order.email || order.email === 'guest@example.com'}
                                className="h-8 text-[11px] font-semibold flex items-center gap-1 cursor-pointer border-border hover:bg-muted text-blue-400 border-blue-500/30 disabled:opacity-40"
                                title={
                                  order.paymentStatus === 'paid'
                                    ? 'Email Paid Invoice with attached PDF to customer'
                                    : 'Email Order Confirmation & instructions to customer'
                                }
                              >
                                {sendingEmailId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                                {order.paymentStatus === 'paid' ? 'Email Invoice' : 'Email Instructions'}
                              </Button>

                              {/* Thermal Receipt button (only for Paid Orders) */}
                              {order.paymentStatus === 'paid' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    const fullRes = await getAdminOrderByIdAction(order.id);
                                    const fullItems = fullRes.success ? (Array.isArray(fullRes.data?.items) ? fullRes.data.items : []) : [];

                                    const receiptItems =
                                      fullItems && fullItems.length > 0
                                        ? fullItems.map((item: any) => {
                                            const serialsList = collectSerials(item);
                                            return {
                                              name: serialsList.length > 0 ? `${item.name || 'Product Item'} (S/N: ${serialsList.join(', ')})` : item.name || 'Product Item',
                                              unitPrice: item.price || 0,
                                              qty: item.quantity || 1,
                                              lineTotal: (item.price || 0) * (item.quantity || 1),
                                            };
                                          })
                                        : [{ name: `Order ${order.orderId}`, unitPrice: order.total, qty: 1, lineTotal: order.total }];

                                    printReceipt(defaultReceiptConfig, {
                                      orderNumber: order.orderId,
                                      customerName: order.customerName || order.email,
                                      date: getFallbackInvoiceDate(order.date),
                                      items: receiptItems,
                                      subtotal: order.total,
                                      total: order.total,
                                      paymentMethod: getPaymentMethodLabel(order.paymentMethod),
                                    });
                                  }}
                                  className="h-8 text-[11px] font-semibold flex items-center gap-1 cursor-pointer border-border hover:bg-muted text-emerald-400 border-emerald-500/30"
                                  title="Print Thermal 80mm/58mm POS Receipt"
                                >
                                  <Printer className="h-3 w-3" /> Print Receipt
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Items Row */}
                        {isExpanded && (
                          <OrderExpandedItems order={order as unknown as Order} />
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
          )}
        </div>

          {/* Pagination Controls */}
          {orders.length > 0 && (
            <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground bg-secondary/10">
              <div className="flex items-center gap-4">
                <span>Showing {orders.length} of {totalCount} items</span>
                {isFetching && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 font-medium">Page {page} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
      </div>

      {/* Serial Assignment & Shipping Fulfillment Modal */}
      {selectedFulfillOrderId && (
        <ShipFulfillmentModal
          isOpen={!!selectedFulfillOrderId}
          onClose={() => setSelectedFulfillOrderId(null)}
          orderId={selectedFulfillOrderId}
          onSuccess={(msg) => {
            setSuccess(msg);
            loadData();
          }}
        />
      )}

      {/* Email Confirmation Dialog */}
      <Dialog open={!!emailConfirmOrder} onOpenChange={(open) => !open && setEmailConfirmOrder(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-blue-500 flex items-center gap-2 text-lg font-bold">
              <Mail className="h-5 w-5" />
              Send Email to Customer
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              Send a confirmation email for order{' '}
              <strong className="text-foreground font-mono">#{emailConfirmOrder?.orderId}</strong> to{' '}
              <strong className="text-foreground">{emailConfirmOrder?.email}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 space-y-1">
              <p className="font-semibold text-blue-400">What will be sent:</p>
              {emailConfirmOrder?.paymentStatus === 'paid' ? (
                <p>Official Final PAID Invoice email with attached PDF invoice and warranty statement.</p>
              ) : emailConfirmOrder?.paymentMethod === 'bank_transfer' ? (
                <p>Bank transfer instructions with account details and a direct &quot;Upload Slip&quot; link.</p>
              ) : emailConfirmOrder?.paymentMethod === 'cash_pickup' || emailConfirmOrder?.paymentMethod === 'cash_delivery' ? (
                <p>Order confirmation with{' '}
                  {emailConfirmOrder?.paymentMethod === 'cash_pickup' ? 'store pickup' : 'cash on delivery'} instructions and amount due.
                </p>
              ) : (
                <p>Order confirmation with order summary and payment details.</p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEmailConfirmOrder(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmSendEmail}
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delivery Dialog Modal */}
      <Dialog open={!!deliverConfirmOrder} onOpenChange={(open) => !open && setDeliverConfirmOrder(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-emerald-500 flex items-center gap-2 text-lg font-bold">
              <CheckCircle2 className="h-5 w-5" />
              Confirm Order Delivery
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              Are you sure order <strong className="text-foreground font-mono">#{deliverConfirmOrder?.orderId}</strong> has been successfully delivered / handed over to the customer?
              For Cash on Delivery and Cash on Pickup orders, this will also record cash collection as Paid and issue the official Final PAID Invoice with attached PDF.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 border-t border-border flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeliverConfirmOrder(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmMarkDelivered}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Yes, Mark as Delivered
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Return & Restock Dialog Modal */}
      <Dialog open={!!returnConfirmOrder} onOpenChange={(open) => !open && setReturnConfirmOrder(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-rose-500 flex items-center gap-2 text-lg font-bold">
              <RotateCcw className="h-5 w-5" />
              Confirm Order Return &amp; Restock
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              You are marking order <strong className="text-foreground font-mono">#{returnConfirmOrder?.orderId}</strong> as <strong>Returned</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg space-y-1 text-xs text-rose-400">
              <p className="font-semibold">Automatic Actions:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-muted-foreground">
                <li>Restores product stock counts (<span className="text-foreground font-mono">+qty</span>).</li>
                <li>Releases assigned serial numbers back to <span className="text-emerald-400 font-semibold">Available</span> stock.</li>
                <li>Updates order status to <span className="text-rose-400 font-semibold">Cancelled / Returned</span>.</li>
              </ul>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Return Reason / Notes:</label>
              <Input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Customer unreachable / Package returned"
                className="h-8 bg-background border-border text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReturnConfirmOrder(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmMarkReturned}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
              Confirm Return &amp; Restock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Order Cancellation Dialog Modal */}
      <Dialog open={!!cancelConfirmOrder} onOpenChange={(open) => !open && setCancelConfirmOrder(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2 text-lg font-bold">
              <Ban className="h-5 w-5" />
              Cancel Order #{cancelConfirmOrder?.orderId}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              You are about to cancel order <strong className="text-foreground font-mono">#{cancelConfirmOrder?.orderId}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-1 text-xs text-red-400">
              <p className="font-semibold">Automatic Actions:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-muted-foreground">
                <li>Releases any pending inventory holds or serial numbers back to <span className="text-emerald-400 font-semibold">Available</span>.</li>
                <li>Restores stock quantities if previously deducted.</li>
                <li>Updates order status to <span className="text-red-400 font-semibold">Cancelled</span>.</li>
              </ul>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">Cancellation Reason / Notes:</label>
              <Input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Payment Not Received / Abandoned Order"
                className="h-8 bg-background border-border text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelConfirmOrder(null)}
              className="text-xs"
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={confirmCancelOrder}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold text-xs cursor-pointer"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Ban className="h-3.5 w-3.5 mr-1" />}
              Confirm Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderExpandedItems({ order }: { order: Order }) {
  const { data: fullOrder, isLoading, isError } = useQuery({
    queryKey: ['admin', 'order', order.id],
    queryFn: async () => {
      const res = await getAdminOrderByIdAction(order.id);
      if (!res.success) throw new Error(res.error || 'Failed to fetch full order details');
      return res.data;
    }
  });

  if (isLoading) {
    return (
      <tr className="bg-muted/5 border-b border-border">
        <td colSpan={8} className="px-8 py-6 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-500" />
          <span className="text-xs">Loading order items...</span>
        </td>
      </tr>
    );
  }

  if (isError || !fullOrder) {
    return (
      <tr className="bg-muted/5 border-b border-border">
        <td colSpan={8} className="px-8 py-6 text-center text-red-500 text-xs">
          Failed to load full order details.
        </td>
      </tr>
    );
  }

  const rawItems = Array.isArray(fullOrder.items) ? fullOrder.items : [];

  return (
    <tr className="bg-muted/5 border-b border-border">
      <td colSpan={8} className="px-8 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Order Items ({rawItems.length})
          </span>
        </div>
        {rawItems.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">No item details available.</p>
        ) : (
          <div className="space-y-1">
            {rawItems.map((item: any, idx: number) => {
              const serials = collectSerials(item);
              return (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-4 p-2.5 bg-background rounded-lg border border-border text-[11px]"
                >
                  <div className="flex-1">
                    <span className="font-semibold text-foreground">{item.name || 'Product Item'}</span>
                    {serials.length > 0 && (
                      <span className="ml-2 text-muted-foreground font-mono">
                        S/N: {serials.join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-muted-foreground">
                    <span>Qty: <span className="font-bold text-foreground">{item.quantity || 1}</span></span>
                    <span>
                      Unit: <span className="font-bold text-foreground">
                        {(item.price || 0).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })}
                      </span>
                    </span>
                    <span>
                      Total: <span className="font-bold text-emerald-400">
                        {((item.price || 0) * (item.quantity || 1)).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}
