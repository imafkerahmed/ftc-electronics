'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { pbOrders } from '@/lib/pb-collections';
import { updateOrderStatusAction } from '@/app/actions/admin';
import { Loader2, CheckCircle, AlertCircle, ShoppingBag } from 'lucide-react';

interface Order {
  id: string;
  orderId: string;
  email: string;
  total: number;
  paymentStatus: 'paid' | 'pending';
  shippingStatus: 'processing' | 'shipped' | 'delivered';
  date: string;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await pbOrders.getAll();
      setOrders((res?.items || []).map((o: any) => ({
        id: o.id,
        orderId: o.orderId || o.id,
        email: o.expand?.user?.email || o.email || 'guest@example.com',
        total: o.total || 0,
        paymentStatus: o.isPaid ? 'paid' : 'pending',
        shippingStatus: o.status || 'processing',
        date: new Date(o.created).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      })));
    } catch (err: any) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleShipOrder = (id: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await updateOrderStatusAction(id, 'shipped');
      if (res.success) {
        setSuccess('Order has been marked as shipped successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to ship order.');
      }
    });
  };

  const getShippingBadge = (status: Order['shippingStatus']) => {
    switch (status) {
      case 'delivered':
        return <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Delivered</span>;
      case 'shipped':
        return <span className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Shipped</span>;
      case 'processing':
      default:
        return <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Processing</span>;
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

      {/* Title */}
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-blue-500" />
          Fulfillment Tracker
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Review customer receipts and coordinate shipping shipments.</p>
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
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                      No order transactions found in the system database.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4 font-bold text-foreground font-mono">{order.orderId}</td>
                      <td className="p-4 font-mono text-muted-foreground">{order.email}</td>
                      <td className="p-4 text-muted-foreground">{order.date}</td>
                      <td className="p-4 font-bold text-foreground">
                        {order.total.toLocaleString('en-US', { style: 'currency', currency: 'LKR' })}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${
                            order.paymentStatus === 'paid' ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        >
                          {order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="p-4">{getShippingBadge(order.shippingStatus)}</td>
                      <td className="p-4 text-right">
                        {order.shippingStatus === 'processing' && (
                          <Button
                            size="sm"
                            onClick={() => handleShipOrder(order.id)}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer h-8 text-[11px] transition-colors"
                            disabled={isPending}
                          >
                            {isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Ship Order'
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
