'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface OrderMock {
  id: string;
  email: string;
  total: number;
  paymentStatus: 'paid' | 'pending' | 'failed';
  shippingStatus: 'processing' | 'shipped' | 'delivered';
  date: string;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderMock[]>([
    {
      id: 'FTC-92048',
      email: 'alex.j@example.com',
      total: 2299.0,
      paymentStatus: 'paid',
      shippingStatus: 'shipped',
      date: 'Jun 01, 2026',
    },
    {
      id: 'FTC-88192',
      email: 'sarah.m@example.com',
      total: 349.0,
      paymentStatus: 'paid',
      shippingStatus: 'delivered',
      date: 'May 15, 2026',
    },
    {
      id: 'FTC-58190',
      email: 'michael.k@example.com',
      total: 189.0,
      paymentStatus: 'pending',
      shippingStatus: 'processing',
      date: 'Jun 03, 2026',
    },
  ]);

  const handleShipOrder = (id: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === id) {
          return { ...o, shippingStatus: 'shipped' };
        }
        return o;
      })
    );
  };

  const getShippingBadge = (status: OrderMock['shippingStatus']) => {
    switch (status) {
      case 'delivered':
        return <span className="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Delivered</span>;
      case 'shipped':
        return <span className="bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Shipped</span>;
      case 'processing':
      default:
        return <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">Processing</span>;
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Title */}
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-wide">Fulfillment Tracker</h1>
        <p className="text-xs text-muted-foreground mt-1">Review customer receipts and coordinate shipping shipments.</p>
      </div>

      {/* Orders List Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                <th className="p-4">Order ID</th>
                <th className="p-4">Customer Email</th>
                <th className="p-4">Total Amount</th>
                <th className="p-4">Payment</th>
                <th className="p-4">Shipment Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-secondary/20">
                  <td className="p-4 font-bold text-foreground">{order.id}</td>
                  <td className="p-4 font-mono text-muted-foreground">{order.email}</td>
                  <td className="p-4 font-black text-foreground">${order.total.toFixed(2)}</td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        order.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-500'
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
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-8 text-[11px]"
                      >
                        Ship Order
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
