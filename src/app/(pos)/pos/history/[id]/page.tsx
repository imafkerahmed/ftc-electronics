'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, Receipt, CheckCircle2, XCircle } from 'lucide-react';
import { getSaleByIdAction, getReceiptPrintPresetsAction } from '@/app/actions/admin';
import type { PBSale, PBSaleItem } from '@/types/pos';
import { printReceipt } from '@/lib/receipt-print';
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig } from '@/types/receipt-config';
import { Button } from '@/components/ui/button';

function fmt(amount: number) {
  return amount.toLocaleString('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 });
}

export default function SaleDetailPage({ params }: { params: { id: string } }) {
  const [sale, setSale] = useState<PBSale | null>(null);
  const [items, setItems] = useState<PBSaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getSaleByIdAction(params.id);
    if (res.success && res.data) {
      const data = res.data as { sale: PBSale; items: PBSaleItem[] };
      setSale(data.sale);
      setItems(data.items);
    } else {
      setError(res.error || 'Sale not found.');
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReprint = async () => {
    if (!sale) return;
    try {
      const res = await getReceiptPrintPresetsAction();
      const presets = (res.data || []) as any[];
      const defaultPreset = presets.find((p) => p.isDefault) || presets[0];
      const cfg = defaultPreset
        ? normalizeReceiptConfig(defaultPreset.config)
        : DEFAULT_RECEIPT_CONFIG;

      printReceipt(
        cfg,
        {
          orderNumber: `POS-${sale.id.slice(-6).toUpperCase()}`,
          date: new Date(sale.created).toLocaleString('en-LK'),
          customerName: sale.customer_name || 'Walk-in Customer',
          customerPhone: sale.customer_phone,
          items: items.map((i) => ({
            name: i.product_name,
            qty: i.quantity,
            unitPrice: i.unit_price,
          })),
          subtotal: sale.subtotal,
          discount: sale.discount,
          total: sale.total,
          paymentMethod: sale.payment_method,
        },
        'POS Receipt'
      );
    } catch {
      printReceipt(
        DEFAULT_RECEIPT_CONFIG,
        {
          orderNumber: `POS-${sale.id.slice(-6).toUpperCase()}`,
          date: new Date(sale.created).toLocaleString('en-LK'),
          customerName: sale.customer_name || 'Walk-in Customer',
          customerPhone: sale.customer_phone,
          items: items.map((i) => ({
            name: i.product_name,
            qty: i.quantity,
            unitPrice: i.unit_price,
          })),
          subtotal: sale.subtotal,
          discount: sale.discount,
          total: sale.total,
          paymentMethod: sale.payment_method,
        },
        'POS Receipt'
      );
    }
  };

  if (loading) return <div className="p-8 text-xs text-muted-foreground">Loading sale…</div>;
  if (error || !sale) return <div className="p-8 text-xs text-red-500">{error || 'Sale not found.'}</div>;

  const created = new Date(sale.created);

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto pb-16">
      <div className="border-b border-border pb-5">
        <Link href="/pos/history" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 group transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Sales History
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <Receipt className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Sale Receipt</h1>
              <p className="text-xs text-muted-foreground">
                {created.toLocaleDateString('en-LK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}{created.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <Button
            onClick={handleReprint}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Printer className="h-3.5 w-3.5" /> Reprint Receipt
          </Button>
        </div>
      </div>

      {/* Sale meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Cashier', value: sale.cashier_name || '—' },
          { label: 'Customer', value: sale.customer_name || 'Walk-in' },
          { label: 'Payment', value: sale.payment_method },
          {
            label: 'Status',
            value: sale.status === 'completed'
              ? <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> Completed</span>
              : <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" /> Voided</span>,
          },
        ].map((m) => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">{m.label}</p>
            <p className="text-sm font-bold text-foreground">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Items */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Items</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left px-5 py-2.5 text-[10px] font-bold text-muted-foreground">Product</th>
              <th className="text-center px-5 py-2.5 text-[10px] font-bold text-muted-foreground">Qty</th>
              <th className="text-right px-5 py-2.5 text-[10px] font-bold text-muted-foreground">Unit Price</th>
              <th className="text-right px-5 py-2.5 text-[10px] font-bold text-muted-foreground">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/30">
                <td className="px-5 py-3">
                  <p className="font-semibold text-foreground">{item.product_name}</p>
                  {item.sku && <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>}
                </td>
                <td className="px-5 py-3 text-center text-foreground font-semibold">{item.quantity}</td>
                <td className="px-5 py-3 text-right text-muted-foreground">{fmt(item.unit_price)}</td>
                <td className="px-5 py-3 text-right font-bold text-foreground">{fmt(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-border space-y-1.5 bg-muted/20">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Subtotal</span><span className="font-semibold">{fmt(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between text-xs text-emerald-500">
              <span>Discount</span><span className="font-semibold">– {fmt(sale.discount)}</span>
            </div>
          )}
          {sale.tax_amount > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Tax</span><span className="font-semibold">{fmt(sale.tax_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-black text-foreground border-t border-border pt-2">
            <span>TOTAL</span><span className="text-blue-500">{fmt(sale.total)}</span>
          </div>
          {sale.payment_method === 'cash' && sale.cash_tendered > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Cash Tendered</span><span>{fmt(sale.cash_tendered)}</span>
            </div>
          )}
          {sale.change_due > 0 && (
            <div className="flex justify-between text-xs text-amber-500 font-bold">
              <span>Change Given</span><span>{fmt(sale.change_due)}</span>
            </div>
          )}
        </div>
      </div>

      {sale.notes && (
        <div className="bg-muted/30 border border-border rounded-xl p-4 text-xs text-muted-foreground">
          <span className="font-semibold">Notes: </span>{sale.notes}
        </div>
      )}
    </div>
  );
}
