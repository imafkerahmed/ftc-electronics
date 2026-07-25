'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Ban, ArrowLeft, Printer, Receipt, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { getSaleByIdAction, getReceiptPrintPresetsAction, getInvoicePrintPresetsAction, voidSaleAction } from '@/app/actions/admin';
import type { PBSale, PBSaleItem } from '@/types/pos';
import { printReceipt } from '@/lib/receipt-print';
import { printInvoice, type InvoiceData } from '@/lib/invoice-print';
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig } from '@/types/receipt-config';
import { DEFAULT_INVOICE_CONFIG, normalizeInvoiceConfig } from '@/types/invoice-config';
import { Button } from '@/components/ui/button';
import ManagerPinModal from '@/components/pos/manager-pin-modal';

function fmt(amount: number) {
  return amount.toLocaleString('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 });
}

export default function SaleDetailPage() {
  const routeParams = useParams();
  const saleId = (routeParams?.id as string) || '';

  const [sale, setSale] = useState<PBSale | null>(null);
  const [items, setItems] = useState<PBSaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showVoidPinModal, setShowVoidPinModal] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const load = useCallback(async () => {
    if (!saleId) return;
    setLoading(true);
    const res = await getSaleByIdAction(saleId);
    if (res.success && res.data) {
      setSale(res.data.sale);
      setItems(res.data.items);
    } else {
      setError(res.error || 'Sale not found.');
    }
    setLoading(false);
  }, [saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const getFormattedDate = () => {
    if (!sale) return new Date().toLocaleString('en-LK');
    const rawDateStr = sale.date || sale.created || sale.updated;
    const d = rawDateStr ? new Date(rawDateStr) : new Date();
    return (isNaN(d.getTime()) ? new Date() : d).toLocaleString('en-LK');
  };

  const handleReprint = async () => {
    if (!sale) return;
    const formattedDate = getFormattedDate();

    let cfg = DEFAULT_RECEIPT_CONFIG;
    try {
      const res = await getReceiptPrintPresetsAction();
      const presets = res.data || [];
      const defaultPreset = presets.find((p) => p.isDefault) || presets[0];
      if (defaultPreset) {
        cfg = normalizeReceiptConfig(defaultPreset.config);
      }
    } catch {
      // Fallback to DEFAULT_RECEIPT_CONFIG
    }

    printReceipt(
      cfg,
      {
          orderNumber: sale.receipt_number || `POS-${sale.id.slice(-6).toUpperCase()}`,
          date: formattedDate,
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
  };

  const handlePrintInvoice = async () => {
    if (!sale) return;
    let cfg = DEFAULT_INVOICE_CONFIG;
    try {
      const res = await getInvoicePrintPresetsAction();
      const presets = res.data || [];
      const defaultPreset = (presets as any[]).find((p) => p.isDefault) || presets[0];
      if (defaultPreset) {
        cfg = normalizeInvoiceConfig(defaultPreset.config);
      }
    } catch {
      // Fallback
    }

    const docNumber = sale.receipt_number || `INV-POS-${sale.id.slice(-6).toUpperCase()}`;

    const invoiceData: InvoiceData = {
      docType: 'Invoice',
      docNumber,
      date: new Date(sale.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      customerName: sale.customer_name || 'Walk-in Customer',
      customerPhone: sale.customer_phone || undefined,
      items: items.map((i) => ({
        name: i.product_name,
        qty: i.quantity,
        unitPrice: i.unit_price,
        discount: i.item_discount || undefined,
        serialNumber: i.unit_serial || undefined,
      })),
      subtotal: sale.subtotal,
      taxAmount: sale.tax_amount || 0,
      discountAmount: sale.discount || 0,
      totalAmount: sale.total,
      paymentMethod: `PAID via ${(sale.payment_method || 'POS').toUpperCase()}`,
      notes: 'Official Paid Invoice. Thank you for shopping with FTC Electronics! Warranty claims require original invoice copy.',
    };

    printInvoice(cfg, invoiceData, 'POS Paid Invoice');
  };

  const handleConfirmVoid = async (pin: string) => {
    if (!sale) return;
    setVoiding(true);
    const res = await voidSaleAction(sale.id, pin);
    setVoiding(false);
    if (res.success) {
      setShowVoidPinModal(false);
      await load();
    } else {
      alert(res.error || 'Failed to void sale.');
    }
  };

  if (loading) return <div className="p-8 text-xs text-muted-foreground">Loading sale…</div>;
  if (error || !sale) return <div className="p-8 text-xs text-red-500">{error || 'Sale not found.'}</div>;

  const rawDateStr = sale.date || sale.created || sale.updated;
  const d = rawDateStr ? new Date(rawDateStr) : new Date();
  const created = isNaN(d.getTime()) ? new Date() : d;

  const receiptNum = sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`;

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
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-foreground">{receiptNum}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  sale.status === 'completed'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                    : 'bg-red-500/10 border-red-500/20 text-red-500'
                } capitalize`}>
                  {sale.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {created.toLocaleDateString('en-LK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}{created.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sale.status === 'completed' && (
              <Button
                variant="outline"
                onClick={() => setShowVoidPinModal(true)}
                disabled={voiding}
                className="hover:text-red-500 hover:border-red-500/30 text-xs"
              >
                <Ban className="h-3.5 w-3.5" /> Void Sale
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handlePrintInvoice}
              className="text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 font-bold"
            >
              <FileText className="h-3.5 w-3.5" /> Print Invoice
            </Button>
            <Button
              onClick={handleReprint}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
            >
              <Printer className="h-3.5 w-3.5" /> Thermal Receipt
            </Button>
          </div>
        </div>
      </div>

      {/* Sale meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Cashier</p>
          <p className="text-sm font-bold text-foreground">{sale.cashier_name || '—'}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Customer</p>
          <p className="text-sm font-bold text-foreground">{sale.customer_name || 'Walk-in'}</p>
          {sale.customer_phone && <p className="text-[10px] text-muted-foreground">{sale.customer_phone}</p>}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Payment Method</p>
          <p className="text-sm font-bold text-foreground capitalize">{sale.payment_method}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Total Items</p>
          <p className="text-sm font-bold text-foreground">{sale.items_count || items.reduce((a, b) => a + b.quantity, 0)}</p>
        </div>
      </div>

      {/* Items */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Line Items</span>
          <span className="text-[11px] text-muted-foreground">{items.length} unique line {items.length === 1 ? 'item' : 'items'}</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-muted/10">
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
                  <div className="flex items-center gap-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.product_name} className="w-9 h-9 object-contain rounded-lg border border-border/60 bg-white/5 p-1 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg border border-border/60 bg-muted/40 flex items-center justify-center shrink-0 text-xs font-bold text-muted-foreground">
                        {item.product_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-foreground">{item.product_name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {item.sku && <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">SKU: {item.sku}</span>}
                        {item.unit_barcode && <span className="text-[10px] text-blue-500 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">BC: {item.unit_barcode}</span>}
                        {item.unit_serial && <span className="text-[10px] text-purple-500 font-mono bg-purple-500/10 px-1.5 py-0.5 rounded">SN: {item.unit_serial}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-center text-foreground font-semibold">{item.quantity}</td>
                <td className="px-5 py-3 text-right text-muted-foreground">
                  {fmt(item.unit_price)}
                  {item.item_discount && item.item_discount > 0 ? (
                    <span className="block text-[10px] text-emerald-500">–{fmt(item.item_discount)} off</span>
                  ) : null}
                </td>
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
              <span>Total Discount</span><span className="font-semibold">– {fmt(sale.discount)}</span>
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
          <span className="font-semibold text-foreground">Notes: </span>{sale.notes}
        </div>
      )}

      <ManagerPinModal
        title="Manager Approval Needed"
        description="Please enter a Manager or Admin PIN to void this completed sale."
        isOpen={showVoidPinModal}
        onClose={() => setShowVoidPinModal(false)}
        onSuccess={(pin) => handleConfirmVoid(pin)}
      />
    </div>
  );
}
