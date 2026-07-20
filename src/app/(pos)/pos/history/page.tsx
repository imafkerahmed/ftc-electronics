'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Receipt, Printer, Ban, Clock, CreditCard, Banknote, QrCode, CheckCircle2, XCircle } from 'lucide-react';
import { getRecentSalesAction, voidSaleAction } from '@/app/actions/admin';
import type { PBSale } from '@/types/pos';
import { Button, buttonVariants } from '@/components/ui/button';
import ManagerPinModal from '@/components/pos/manager-pin-modal';

function fmt(amount: number) {
  return amount.toLocaleString('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 });
}

const methodIcon: Record<string, React.ElementType> = {
  cash: Banknote, card: CreditCard, qr: QrCode, split: CreditCard,
};

const methodColor: Record<string, string> = {
  cash: 'text-emerald-500', card: 'text-blue-500', qr: 'text-purple-500', split: 'text-amber-500',
};

export default function PosHistoryPage() {
  const [sales, setSales] = useState<PBSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    const res = await getRecentSalesAction(100);
    if (res.success && res.data) setSales(res.data as PBSale[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadSales(); }, [loadSales]);

  const handleConfirmVoid = (pin: string) => {
    if (!voidTargetId) return;
    const saleId = voidTargetId;
    startTransition(async () => {
      const res = await voidSaleAction(saleId, pin);
      if (res.success) {
        setVoidTargetId(null);
        setVoidError(null);
        await loadSales();
      } else {
        setVoidError(res.error || 'Failed to void sale.');
      }
    });
  };

  const todaySales = sales.filter((s) => {
    const d = new Date(s.created);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const todayTotal = todaySales.reduce((sum, s) => sum + (s.status === 'completed' ? s.total : 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="border-b border-border pb-5">
        <Link href="/pos" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 group transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to POS Terminal
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <Receipt className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">POS Sales History</h1>
              <p className="text-xs text-muted-foreground">Last 100 transactions</p>
            </div>
          </div>
          {/* Today summary */}
          <div className="bg-card border border-border rounded-xl px-4 py-2 text-right">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Today&apos;s Sales</p>
            <p className="text-lg font-black text-foreground">{fmt(todayTotal)}</p>
            <p className="text-[10px] text-muted-foreground">{todaySales.filter(s => s.status === 'completed').length} completed</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Loading sales…</div>
        ) : sales.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No sales recorded yet</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Receipt / Time</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cashier</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Items</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Method</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const MIcon = methodIcon[sale.payment_method] || CreditCard;
                const rawDateStr = sale.date || sale.created || sale.updated;
                const d = rawDateStr ? new Date(rawDateStr) : new Date();
                const created = isNaN(d.getTime()) ? new Date() : d;
                const isToday = created.toDateString() === new Date().toDateString();
                const receiptNum = sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`;
                return (
                  <tr key={sale.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-foreground text-xs">{receiptNum}</p>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3 opacity-50" />
                        {isToday
                          ? created.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })
                          : created.toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{sale.cashier_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sale.customer_name ? (
                        <div>
                          <p className="font-semibold text-foreground">{sale.customer_name}</p>
                          {sale.customer_phone && <p className="text-[10px] text-muted-foreground">{sale.customer_phone}</p>}
                        </div>
                      ) : (
                        <span className="italic opacity-50">Walk-in Customer</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-foreground font-semibold text-[10px]">
                        {sale.items_count || 1} {sale.items_count === 1 ? 'item' : 'items'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <span className={`inline-flex items-center gap-1 font-semibold capitalize ${methodColor[sale.payment_method] || ''}`}>
                          <MIcon className="h-3 w-3" />
                          {sale.payment_method}
                        </span>
                        {sale.payment_method === 'cash' && sale.change_due > 0 && (
                          <p className="text-[10px] text-amber-500 font-medium">Change: {fmt(sale.change_due)}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-black text-foreground">{fmt(sale.total)}</p>
                      {sale.discount > 0 && (
                        <p className="text-[10px] text-emerald-500 font-semibold">–{fmt(sale.discount)} off</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sale.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                          <CheckCircle2 className="h-3 w-3" /> Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-500 font-semibold">
                          <XCircle className="h-3 w-3" /> Voided
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Link href={`/pos/history/${sale.id}`} className={buttonVariants({ variant: 'outline', size: 'xs' })}>
                          <Printer className="h-3 w-3" /> View
                        </Link>
                        {sale.status === 'completed' && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setVoidError(null);
                              setVoidTargetId(sale.id);
                            }}
                            className="hover:text-red-500 hover:border-red-500/30 text-xs"
                          >
                            <Ban className="h-3 w-3" /> Void
                          </Button>
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

      <ManagerPinModal
        title="Manager Approval Needed"
        description="Please enter a Manager or Admin PIN to void this completed sale."
        isOpen={Boolean(voidTargetId)}
        onClose={() => setVoidTargetId(null)}
        onSuccess={(pin) => handleConfirmVoid(pin)}
      />
    </div>
  );
}
