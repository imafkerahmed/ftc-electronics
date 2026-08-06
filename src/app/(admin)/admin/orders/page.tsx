'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateOrderStatusAction, markOrderAsPaidAction, getAdminOrdersAction, getReceiptPrintPresetsAction, sendOrderInvoiceEmailAction, markOrderAsReturnedAction } from '@/app/actions/admin';
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig, type ReceiptPrintConfig } from '@/types/receipt-config';
import { printReceipt } from '@/lib/receipt-print';
import { printInvoice, resolveInvoiceConfig, type InvoiceData } from '@/lib/invoice-print';
import { Loader2, CheckCircle, AlertCircle, ShoppingBag, Printer, FileText, Mail, Search, Truck, Check, CheckCircle2, RotateCcw, X } from 'lucide-react';
import ShipFulfillmentModal from '@/components/admin/ship-fulfillment-modal';

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
  total: number;
  paymentStatus: 'paid' | 'pending';
  paymentMethod: string;
  shippingStatus: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  date: string;
  rawItems: OrderItem[];
}

type TabFilter = 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

const getFallbackInvoiceDate = (orderDate?: string) => {
  return orderDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getQuotationDueDate = () => {
  return new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [selectedFulfillOrderId, setSelectedFulfillOrderId] = useState<string | null>(null);
  
  // Confirmation Modals State
  const [deliverConfirmOrder, setDeliverConfirmOrder] = useState<{ id: string; orderId: string } | null>(null);
  const [returnConfirmOrder, setReturnConfirmOrder] = useState<{ id: string; orderId: string } | null>(null);
  const [returnReason, setReturnReason] = useState('Customer unreachable / Package returned');

  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const [defaultReceiptConfig, setDefaultReceiptConfig] = useState<ReceiptPrintConfig>(DEFAULT_RECEIPT_CONFIG);

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

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAdminOrdersAction();
      if (res.success && res.data) {
        setOrders(
          res.data.map((o: any) => {
            const rawDate = o.created || o.created_at || o.updated;
            const parsedDate = rawDate ? new Date(rawDate) : new Date();
            const dateStr = !isNaN(parsedDate.getTime())
              ? parsedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
              : 'N/A';

            return {
              id: o.id,
              orderId: o.orderId || o.id,
              email: o.customer?.email || o.expand?.user?.email || o.email || 'guest@example.com',
              total: o.total || o.totalAmount || 0,
              paymentStatus: o.isPaid ? 'paid' : 'pending',
              paymentMethod: o.paymentDetails?.method || o.paymentMethod || 'bank_transfer',
              shippingStatus: (o.status || 'pending') as Order['shippingStatus'],
              date: dateStr,
              rawItems: Array.isArray(o.items) ? o.items : [],
            };
          })
        );
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      console.error('Failed to load orders:', err);
      setError('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleMarkPaid = (id: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await markOrderAsPaidAction(id);
      if (res.success) {
        setSuccess('Order has been marked as paid and moved to processing.');
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
        loadData();
      } else {
        setError(res.error || 'Failed to process order return.');
      }
    });
  };

  const handleSendEmail = (order: Order) => {
    setError(null);
    setSuccess(null);
    if (!order.email || order.email === 'guest@example.com') {
      setError('No customer email configured for this order.');
      return;
    }
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

    const invoiceItems =
      order.rawItems && order.rawItems.length > 0
        ? order.rawItems.map((item) => {
            const serialsList: string[] = [];
            if (Array.isArray(item.assignedSerials) && item.assignedSerials.length > 0) {
              serialsList.push(...item.assignedSerials);
            }
            if (Array.isArray(item.assignedUnits) && item.assignedUnits.length > 0) {
              item.assignedUnits.forEach((u) => {
                const val = u.serialNumber || u.barcode;
                if (val && !serialsList.includes(val)) serialsList.push(val);
              });
            }

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
      customerName: order.email,
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
        return (
          <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
            Cancelled / Returned
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

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'bank_transfer':
        return '🏦 Bank Transfer';
      case 'cash_pickup':
        return '📦 Cash on Pickup';
      case 'cash_delivery':
        return '🛵 Cash on Delivery';
      case 'stripe':
      case 'payhere':
        return '💳 Card';
      default:
        return method;
    }
  };

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.shippingStatus === 'pending' || o.paymentStatus === 'pending').length,
    processing: orders.filter((o) => (o.shippingStatus === 'processing' || o.shippingStatus === 'pending') && o.paymentStatus === 'paid').length,
    shipped: orders.filter((o) => o.shippingStatus === 'shipped').length,
    delivered: orders.filter((o) => o.shippingStatus === 'delivered').length,
    cancelled: orders.filter((o) => o.shippingStatus === 'cancelled').length,
  };

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'pending' && !(o.shippingStatus === 'pending' || o.paymentStatus === 'pending')) return false;
    if (activeTab === 'processing' && !((o.shippingStatus === 'processing' || o.shippingStatus === 'pending') && o.paymentStatus === 'paid')) return false;
    if (activeTab === 'shipped' && o.shippingStatus !== 'shipped') return false;
    if (activeTab === 'delivered' && o.shippingStatus !== 'delivered') return false;
    if (activeTab === 'cancelled' && o.shippingStatus !== 'cancelled') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = o.orderId.toLowerCase().includes(q);
      const matchEmail = o.email.toLowerCase().includes(q);
      const matchItemName = o.rawItems.some((i) => i.name?.toLowerCase().includes(q));
      if (!matchId && !matchEmail && !matchItemName) return false;
    }

    return true;
  });

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
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-blue-500" />
          Fulfillment Tracker
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Review customer receipts, filter status tabs, coordinate shipments, and process order returns.</p>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Orders', count: counts.all },
            { id: 'pending', label: 'Pending Payment', count: counts.pending, color: 'text-amber-500 bg-amber-500/10' },
            { id: 'processing', label: 'Processing (To Ship)', count: counts.processing, color: 'text-blue-500 bg-blue-500/10' },
            { id: 'shipped', label: 'Shipped', count: counts.shipped, color: 'text-indigo-500 bg-indigo-500/10' },
            { id: 'delivered', label: 'Delivered', count: counts.delivered, color: 'text-emerald-500 bg-emerald-500/10' },
            { id: 'cancelled', label: 'Cancelled / Returned', count: counts.cancelled, color: 'text-red-500 bg-red-500/10' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.id ? 'bg-white/20 text-white' : tab.color || 'bg-muted text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
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
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-4">Order ID</th>
                  <th className="p-4">Customer Email</th>
                  <th className="p-4">Order Date</th>
                  <th className="p-4">Total Amount</th>
                  <th className="p-4">Payment</th>
                  <th className="p-4">Shipment Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground font-medium">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                      {searchQuery.trim()
                        ? `No orders matching "${searchQuery}" in ${activeTab} tab.`
                        : `No ${activeTab === 'all' ? '' : activeTab} order transactions found.`}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4 font-bold text-foreground font-mono">{order.orderId}</td>
                      <td className="p-4 font-mono text-muted-foreground">{order.email}</td>
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
                        </div>
                      </td>
                      <td className="p-4">{getShippingBadge(order)}</td>
                      <td className="p-4 text-right flex items-center justify-end gap-2">
                        {/* Mark Paid button */}
                        {order.paymentStatus === 'pending' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleMarkPaid(order.id)}
                            disabled={isPending}
                            className="h-8 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Mark Paid
                          </Button>
                        )}

                        {/* Ship Order button */}
                        {order.paymentStatus === 'paid' && order.shippingStatus !== 'shipped' && order.shippingStatus !== 'delivered' && order.shippingStatus !== 'cancelled' && (
                          <Button
                            size="sm"
                            onClick={() => setSelectedFulfillOrderId(order.id)}
                            className="h-8 text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                          >
                            <Truck className="h-3 w-3 mr-1" />
                            Ship Order
                          </Button>
                        )}

                        {/* Mark Delivered button */}
                        {order.shippingStatus === 'shipped' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDeliverConfirmOrder({ id: order.id, orderId: order.orderId })}
                            disabled={isPending}
                            className="h-8 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                            title="Confirm package has been delivered to customer"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Mark Delivered
                          </Button>
                        )}

                        {/* Mark Returned / Restock button */}
                        {order.shippingStatus !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReturnReason('Customer unreachable / Package returned');
                              setReturnConfirmOrder({ id: order.id, orderId: order.orderId });
                            }}
                            disabled={isPending}
                            className="h-8 text-[11px] font-semibold text-rose-400 border border-rose-500/30 hover:bg-rose-500/10 cursor-pointer"
                            title="Mark package returned, restore inventory stock & release assigned serial numbers"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Mark Returned
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePrintOrderInvoice(order, 'Invoice')}
                          className="h-8 text-[11px] font-semibold flex items-center gap-1 cursor-pointer border-border hover:bg-muted text-indigo-400 border-indigo-500/30"
                          title="Print Paid Invoice"
                        >
                          <FileText className="h-3 w-3" /> Invoice
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendEmail(order)}
                          disabled={sendingEmailId === order.id || isPending || !order.email || order.email === 'guest@example.com'}
                          className="h-8 text-[11px] font-semibold flex items-center gap-1 cursor-pointer border-border hover:bg-muted text-blue-400 border-blue-500/30 disabled:opacity-40"
                          title={order.email && order.email !== 'guest@example.com' ? 'Send tax invoice via email to customer' : 'Customer email not configured'}
                        >
                          {sendingEmailId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                          Email
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const receiptItems =
                              order.rawItems && order.rawItems.length > 0
                                ? order.rawItems.map((item) => {
                                    const serialsList: string[] = [];
                                    if (Array.isArray(item.assignedSerials) && item.assignedSerials.length > 0) {
                                      serialsList.push(...item.assignedSerials);
                                    }
                                    if (Array.isArray(item.assignedUnits) && item.assignedUnits.length > 0) {
                                      item.assignedUnits.forEach((u) => {
                                        const val = u.serialNumber || u.barcode;
                                        if (val && !serialsList.includes(val)) serialsList.push(val);
                                      });
                                    }
                                    const serialSuffix = serialsList.length > 0 ? ` (S/N: ${serialsList.join(', ')})` : '';

                                    return {
                                      name: `${item.name || 'Product Item'}${serialSuffix}`,
                                      qty: item.quantity || 1,
                                      unitPrice: item.price || 0,
                                    };
                                  })
                                : [{ name: `Order ${order.orderId}`, qty: 1, unitPrice: order.total }];

                            printReceipt(
                              defaultReceiptConfig,
                              {
                                orderNumber: order.orderId,
                                date: order.date,
                                customerName: order.email,
                                items: receiptItems,
                                subtotal: order.total,
                                total: order.total,
                                paymentMethod: order.paymentStatus === 'paid' ? 'Paid' : 'Pending',
                              },
                              `Receipt \u2014 ${order.orderId}`
                            );
                          }}
                          className="h-8 text-[11px] font-semibold flex items-center gap-1 cursor-pointer border-border hover:bg-muted"
                          title="Print thermal receipt"
                        >
                          <Printer className="h-3 w-3" /> Receipt
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Ship & Fulfill Modal */}
      {selectedFulfillOrderId && (
        <ShipFulfillmentModal
          isOpen={Boolean(selectedFulfillOrderId)}
          orderId={selectedFulfillOrderId}
          onClose={() => setSelectedFulfillOrderId(null)}
          onSuccess={(msg) => {
            setSuccess(msg);
            loadData();
          }}
        />
      )}

      {/* Confirm Delivery Dialog Modal */}
      {deliverConfirmOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Confirm Order Delivery
              </h3>
              <button
                onClick={() => setDeliverConfirmOrder(null)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure order <strong className="text-foreground font-mono">#{deliverConfirmOrder.orderId}</strong> has been successfully delivered to the customer?
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
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
            </div>
          </div>
        </div>
      )}

      {/* Confirm Return & Restock Dialog Modal */}
      {returnConfirmOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-lg text-rose-500 flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-rose-500" />
                Confirm Order Return & Restock
              </h3>
              <button
                onClick={() => setReturnConfirmOrder(null)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                You are marking order <strong className="text-foreground font-mono">#{returnConfirmOrder.orderId}</strong> as <strong>Returned</strong>.
              </p>
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

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
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
                Confirm Return & Restock
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
