'use client';

import { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCustomerOrdersAction } from '@/app/actions/auth';

interface CustomerOrderItem {
  id?: string;
  productId?: string;
  product?: string;
  name?: string;
  product_name?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  unit_price?: number;
  assignedSerials?: string[];
  assignedUnits?: Array<{ serialNumber?: string; barcode?: string }>;
}

interface CustomerOrder {
  id: string;
  orderId?: string;
  order_number?: string;
  created?: string;
  created_at?: string;
  updated?: string;
  date?: string;
  total?: number;
  totalAmount?: number;
  status?: string;
  items?: CustomerOrderItem[];
  tracking_number?: string;
}

export default function OrdersHistoryPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      try {
        const res = await getCustomerOrdersAction();
        if (res.success) {
          setOrders(res.orders || []);
        } else {
          // Show error inline — do NOT redirect, avoids crash loop
          setError(res.error || 'Could not load orders. Please try again.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    }
    void loadOrders();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'shipped':
      case 'completed':
        return <Truck className="h-4 w-4 text-blue-500" />;
      case 'delivered':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'pending':
      case 'processing':
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="text-xs">Loading order history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" aria-live="assertive" className="flex flex-col items-center justify-center py-16 gap-4">
        <AlertCircle aria-hidden="true" className="h-10 w-10 text-red-400" />
        <p className="text-sm font-medium text-foreground">Unable to load orders</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground">
      <div>
        <h2 className="text-xl font-bold tracking-wide">Order History</h2>
        <p className="text-xs text-muted-foreground mt-1">Review tracking details and past purchases.</p>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <Package className="h-10 w-10 mb-2 text-muted-foreground/35" />
          <p className="text-sm font-medium">You haven&apos;t placed any orders yet.</p>
          <p className="text-xs text-muted-foreground/80 mt-1">When you place an order, it will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => {
            const parsedDate = [order.created, order.created_at, order.updated, order.date]
              .filter((val): val is string => val != null)
              .map((val) => new Date(val))
              .find((d) => !Number.isNaN(d.getTime()));

            const formattedDate = parsedDate
              ? parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Date unavailable';

            const total = typeof order.total === 'number'
              ? order.total
              : typeof order.totalAmount === 'number'
                ? order.totalAmount
                : 0;

            const items: CustomerOrderItem[] = Array.isArray(order.items) ? order.items : [];

            return (
              <div
                key={order.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Order Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-secondary/40 p-4 border-b border-border text-xs">
                  <div className="flex gap-6">
                    <div>
                      <span className="text-muted-foreground block uppercase font-medium">Order ID</span>
                      <span className="text-foreground font-bold mt-0.5 block">#{order.orderId || order.order_number || order.id?.slice(-8).toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block uppercase font-medium">Date Placed</span>
                      <span className="text-foreground/90 mt-0.5 block">{formattedDate}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block uppercase font-medium">Total Price</span>
                      <span className="text-blue-600 font-bold mt-0.5 block">Rs. {total.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-full border border-border capitalize font-semibold">
                    {getStatusIcon(order.status || 'pending')}
                    <span className="text-foreground">{order.status || 'pending'}</span>
                  </div>
                </div>

                {/* Items List */}
                {items.length > 0 && (() => {
                  // Consolidate items with same productId or name and aggregate serial numbers
                  const consolidated: CustomerOrderItem[] = [];
                  for (const it of items) {
                    const key = it.productId || it.product || it.id || it.name;
                    const existing = consolidated.find((x) => (x.productId || x.product || x.id || x.name) === key);
                    if (existing) {
                      existing.quantity = (existing.quantity || existing.qty || 1) + (it.quantity || it.qty || 1);
                      // Aggregate and deduplicate assignedSerials
                      const existingSerials = Array.isArray(existing.assignedSerials) ? existing.assignedSerials : [];
                      const newSerials = Array.isArray(it.assignedSerials) ? it.assignedSerials : [];
                      existing.assignedSerials = Array.from(new Set([...existingSerials, ...newSerials]));

                      // Aggregate assignedUnits
                      const existingUnits = Array.isArray(existing.assignedUnits) ? existing.assignedUnits : [];
                      const newUnits = Array.isArray(it.assignedUnits) ? it.assignedUnits : [];
                      existing.assignedUnits = [...existingUnits, ...newUnits];
                    } else {
                      consolidated.push({ ...it, quantity: it.quantity || it.qty || 1 });
                    }
                  }

                  return (
                    <div className="p-4 divide-y divide-border">
                      {consolidated.map((item, idx) => {
                        const serials: string[] = Array.isArray(item.assignedSerials) && item.assignedSerials.length > 0
                          ? item.assignedSerials
                          : Array.isArray(item.assignedUnits)
                            ? item.assignedUnits.map((u) => u.serialNumber || u.barcode).filter((s): s is string => Boolean(s))
                            : [];

                        const qty = item.quantity || item.qty || 1;
                        const itemPrice = item.price || item.unit_price || 0;

                        return (
                          <div key={idx} className="flex justify-between items-start py-3 first:pt-0 last:pb-0 text-sm">
                            <div>
                              <h4 className="font-semibold text-foreground">{item.name || item.product_name || 'Product'}</h4>
                              <p className="text-xs text-muted-foreground mt-0.5">Quantity: {qty}</p>
                              {serials.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                                  <span className="text-[11px] text-muted-foreground font-medium">Serial S/N:</span>
                                  {serials.map((s, sIdx) => (
                                    <span key={sIdx} className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="font-bold text-foreground">Rs. {(itemPrice * qty).toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Tracking Footer */}
                {order.tracking_number && (
                  <div className="flex items-center justify-between bg-secondary/20 p-4 border-t border-border text-xs">
                    <span className="text-muted-foreground">
                      Tracking Number: <code className="text-blue-600 font-mono">{order.tracking_number}</code>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        window.open(`https://www.17track.net/en/track?nums=${encodeURIComponent(order.tracking_number!)}`, '_blank', 'noopener,noreferrer');
                      }}
                      className="h-8 text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
                    >
                      Track Package
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
