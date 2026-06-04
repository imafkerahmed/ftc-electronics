'use client';

import { useState } from 'react';
import { Package, Truck, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OrderItemMock {
  name: string;
  qty: number;
  price: number;
}

interface OrderMock {
  id: string;
  date: string;
  total: number;
  status: 'processing' | 'shipped' | 'delivered';
  items: OrderItemMock[];
  trackingId?: string;
}

export default function OrdersHistoryPage() {
  const [orders] = useState<OrderMock[]>([
    {
      id: 'FTC-92048',
      date: 'June 01, 2026',
      total: 2299.0,
      status: 'shipped',
      trackingId: '1Z999AA10123456784',
      items: [{ name: 'ApexBook Pro 16"', qty: 1, price: 2299.0 }],
    },
    {
      id: 'FTC-88192',
      date: 'May 15, 2026',
      total: 349.0,
      status: 'delivered',
      items: [{ name: 'Acoustic-X ANC Headphones', qty: 1, price: 349.0 }],
    },
    {
      id: 'FTC-76123',
      date: 'April 20, 2026',
      total: 2047.0,
      status: 'delivered',
      items: [
        { name: 'Phonix Pro 15 Ultra', qty: 1, price: 1199.0 },
        { name: 'VisionGlide 34" Curved Monitor', qty: 1, price: 549.0 },
        { name: 'Acoustic-X ANC Headphones', qty: 1, price: 299.0 },
      ],
    },
  ]);

  const getStatusIcon = (status: OrderMock['status']) => {
    switch (status) {
      case 'shipped':
        return <Truck className="h-4 w-4 text-blue-500" />;
      case 'delivered':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'processing':
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6 text-foreground">
      <div>
        <h2 className="text-xl font-bold tracking-wide">Order History</h2>
        <p className="text-xs text-muted-foreground mt-1">Review tracking details and past purchases.</p>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mb-2 text-muted-foreground/35" />
          <p className="text-sm">You haven&apos;t placed any orders yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              {/* Order Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-secondary/40 p-4 border-b border-border text-xs">
                <div className="flex gap-6">
                  <div>
                    <span className="text-muted-foreground block uppercase font-medium">Order ID</span>
                    <span className="text-foreground font-bold mt-0.5 block">{order.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase font-medium">Date Placed</span>
                    <span className="text-foreground/90 mt-0.5 block">{order.date}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase font-medium">Total Price</span>
                    <span className="text-blue-600 font-bold mt-0.5 block">${order.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-full border border-border capitalize font-semibold">
                  {getStatusIcon(order.status)}
                  <span className="text-foreground">{order.status}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="p-4 divide-y divide-border">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-3 first:pt-0 last:pb-0 text-sm">
                    <div>
                      <h4 className="font-semibold text-foreground">{item.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">Quantity: {item.qty}</p>
                    </div>
                    <span className="font-bold text-foreground">${(item.price * item.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Tracking / Actions Footer */}
              {order.trackingId && (
                <div className="flex items-center justify-between bg-secondary/20 p-4 border-t border-border text-xs">
                  <span className="text-muted-foreground">
                    Tracking Number: <code className="text-blue-600 font-mono">{order.trackingId}</code>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
                    onClick={() => console.log('Redirecting to shipment carrier')}
                  >
                    Track Package
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
