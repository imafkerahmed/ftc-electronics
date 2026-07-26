'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import React, { useState, useEffect, useTransition } from 'react';
import { X, Banknote, CreditCard, QrCode, Receipt, Printer, CheckCircle2, AlertCircle, User, UserPlus, Search, Phone, Mail, FileText } from 'lucide-react';
import type { PosCartItem, PosEmployeeSession, PaymentMethod, SalePayload } from '@/types/pos';
import { createSaleAction, getReceiptPrintPresetsAction, getInvoicePrintPresetsAction, searchPosCustomersAction, createPosCustomerAction } from '@/app/actions/admin';
import { printReceipt, resolveReceiptConfig } from '@/lib/receipt-print';
import { printInvoice, resolveInvoiceConfig, type InvoiceData } from '@/lib/invoice-print';
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig } from '@/types/receipt-config';
import { DEFAULT_INVOICE_CONFIG, normalizeInvoiceConfig } from '@/types/invoice-config';

interface BillData {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
}

interface PosPaymentModalProps {
  cart: PosCartItem[];
  billData: BillData;
  currency: string;
  session: PosEmployeeSession;
  customerName?: string;
  customerPhone?: string;
  onSetCustomer?: (name: string, phone: string) => void;
  onClose: () => void;
  onSuccess: () => void;
}

function fmt(amount: number, currency = 'LKR') {
  return amount.toLocaleString('en-LK', { style: 'currency', currency, maximumFractionDigits: 0 });
}

const METHODS: { key: PaymentMethod; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'cash',  label: 'Cash',   icon: Banknote,    color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20' },
  { key: 'card',  label: 'Card',   icon: CreditCard,  color: 'bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500/20' },
  { key: 'qr',    label: 'QR Pay', icon: QrCode,      color: 'bg-purple-500/10 border-purple-500/30 text-purple-500 hover:bg-purple-500/20' },
];

export default function PosPaymentModal({
  cart,
  billData,
  currency,
  session,
  customerName = '',
  customerPhone = '',
  onSetCustomer,
  onClose,
  onSuccess,
}: PosPaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [notes, setNotes] = useState('');
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [completedReceiptNumber, setCompletedReceiptNumber] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  // Customer state inside payment modal
  const [cName, setCName] = useState(customerName);
  const [cPhone, setCPhone] = useState(customerPhone);

  useEffect(() => {
    setCName(customerName);
    setCPhone(customerPhone);
  }, [customerName, customerPhone]);

  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<any[]>([]);
  const [searchingCust, setSearchingCust] = useState(false);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [showNewCustForm, setShowNewCustForm] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [creatingCust, setCreatingCust] = useState(false);
  const [custError, setCustError] = useState<string | null>(null);

  useEffect(() => {
    if (!custQuery.trim()) {
      setCustResults([]);
      setShowCustDropdown(false);
      setSearchingCust(false);
      return;
    }
    setShowCustDropdown(true);
    setSearchingCust(true);

    const timer = setTimeout(async () => {
      const res = await searchPosCustomersAction(custQuery);
      if (res.success && res.data) {
        setCustResults(res.data);
      } else {
        setCustResults([]);
      }
      setSearchingCust(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [custQuery]);

  const handleSelectCustomer = (name: string, phone: string) => {
    setCName(name);
    setCPhone(phone);
    onSetCustomer?.(name, phone);
    setCustQuery('');
    setShowCustDropdown(false);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      setCustError('Customer name is required.');
      return;
    }
    setCreatingCust(true);
    setCustError(null);
    const res = await createPosCustomerAction({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      email: newCustEmail.trim(),
    });
    if (res.success && res.data) {
      handleSelectCustomer(res.data.name, res.data.phone || '');
      setShowNewCustForm(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
    } else {
      setCustError(res.error || 'Failed to create customer.');
    }
    setCreatingCust(false);
  };

  const changeDue = method === 'cash'
    ? Math.max(0, parseFloat(cashTendered || '0') - billData.total)
    : 0;

  const canCharge =
    method !== 'cash' ||
    (parseFloat(cashTendered || '0') >= billData.total);

  const handleCharge = () => {
    setError('');
    startTransition(async () => {
      const receiptNum = `FTC-POS-${Date.now().toString(36).toUpperCase()}`;
      const payload: SalePayload = {
        receipt_number: receiptNum,
        status: 'completed',
        cashier_name: session.name,
        cashier_id: session.id,
        customer_name: cName,
        customer_phone: cPhone,
        subtotal: billData.subtotal,
        discount: billData.discount,
        tax_amount: billData.taxAmount,
        total: billData.total,
        payment_method: method,
        cash_tendered: parseFloat(cashTendered || '0'),
        change_due: changeDue,
        items_count: cart.reduce((acc, item) => acc + item.quantity, 0),
        notes,
        items: cart.map((i) => ({
          product_id: i.productId,
          product_name: i.productName,
          sku: i.sku,
          unit_price: i.unitPrice,
          item_discount: i.itemDiscount || 0,
          quantity: i.quantity,
          line_total: i.lineTotal,
          unit_id: i.unitId,
          unit_barcode: i.unitBarcode,
          unit_serial: i.unitSerial,
          image_url: i.imageUrl || '',
        })),
      };

      const res = await createSaleAction(payload);
      if (res.success && res.data) {
        const saleData = res.data as any;
        const saleId = saleData.sale?.id || saleData.id || '';
        const savedReceiptNum = saleData.sale?.receipt_number || saleData.receipt_number || receiptNum;
        setCompletedSaleId(saleId);
        setCompletedReceiptNumber(savedReceiptNum);
      } else {
        setError(res.error || 'Failed to record sale.');
      }
    });
  };

  const handlePrint = async () => {
    const cfg = await resolveReceiptConfig();

    const orderNumber = completedReceiptNumber
      ? completedReceiptNumber
      : completedSaleId
        ? `FTC-POS-${completedSaleId.slice(-6).toUpperCase()}`
        : `FTC-POS-${Date.now().toString(36).toUpperCase()}`;

    printReceipt(
      cfg,
      {
        orderNumber,
        date: new Date().toLocaleString('en-LK'),
        customerName: cName || 'Walk-in Customer',
        customerPhone: cPhone,
        items: cart.map((i) => ({
          name: i.productName,
          qty: i.quantity,
          unitPrice: i.unitPrice - i.itemDiscount,
          serialNumber: i.unitBarcode ? `${i.unitBarcode}${i.unitSerial ? ' (' + i.unitSerial + ')' : ''}` : i.unitSerial,
        })),
        subtotal: billData.subtotal,
        discount: billData.discount,
        total: billData.total,
        paymentMethod: method,
      },
      'POS Receipt'
    );
  };

  const handlePrintInvoice = async () => {
    const cfg = await resolveInvoiceConfig();

    const docNumber = completedReceiptNumber
      ? completedReceiptNumber.replace(/^FTC-POS-/, 'INV-POS-')
      : completedSaleId
        ? `INV-POS-${completedSaleId.slice(-6).toUpperCase()}`
        : `INV-POS-${Date.now().toString(36).toUpperCase()}`;

    const invoiceData: InvoiceData = {
      docType: 'Invoice',
      docNumber,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      customerName: cName || 'Walk-in Customer',
      customerPhone: cPhone || undefined,
      items: cart.map((i) => ({
        name: i.productName,
        qty: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.itemDiscount || undefined,
        serialNumber: i.unitSerial || i.unitBarcode || undefined,
      })),
      subtotal: billData.subtotal,
      taxAmount: billData.taxAmount,
      discountAmount: billData.discount,
      totalAmount: billData.total,
      paymentMethod: `PAID via ${method.toUpperCase()}`,
      notes: 'Official Paid Invoice. Thank you for shopping with FTC Electronics! Warranty claims require original invoice copy.',
    };

    printInvoice(cfg, invoiceData, 'POS Paid Invoice');
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (completedSaleId !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-8 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-black text-foreground mb-1">Sale Complete!</h2>
          <p className="text-xs text-muted-foreground mb-1">{fmt(billData.total, currency)} charged via {method}</p>
          {method === 'cash' && changeDue > 0 && (
            <p className="text-lg font-black text-amber-500 mb-3">
              Change: {fmt(changeDue, currency)}
            </p>
          )}
          <div className="space-y-2 mt-6">
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handlePrint}
                className="h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-1.5 text-xs font-bold"
              >
                <Printer className="h-4 w-4" /> Thermal Receipt
              </Button>
              <Button
                onClick={handlePrintInvoice}
                variant="outline"
                className="h-10 rounded-xl border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 flex items-center justify-center gap-1.5 text-xs font-bold"
              >
                <FileText className="h-4 w-4" /> Print Invoice
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const phone = cPhone || prompt("Enter WhatsApp number (with country code, e.g. 94771234567):");
                  if (phone) {
                    const cleanPhone = phone.replace(/\D/g, '');
                    const orderNo = completedSaleId ? `FTC-POS-${completedSaleId.slice(-6).toUpperCase()}` : '';
                    const itemsStr = cart.map(i => `• ${i.productName} x${i.quantity} - ${fmt(i.lineTotal, currency)}`).join('%0A');
                    const text = `*FTC Electronics*%0AReceipt for Order *${orderNo}*%0A*Date:* ${new Date().toLocaleDateString()}%0A*Total:* ${fmt(billData.total, currency)}%0A%0A*Items:*%0A${itemsStr}%0A%0AThank you for shopping with us!`;
                    window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
                  }
                }}
                className="h-10 rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <svg className="h-4 w-4 text-emerald-500 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.517 2.266 2.27 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.458L0 24zm6.702-4.103c1.633.969 3.259 1.487 4.908 1.488 5.489 0 9.954-4.41 9.957-9.829.001-2.624-1.024-5.092-2.884-6.958-1.86-1.866-4.333-2.893-6.962-2.894-5.492 0-9.96 4.41-9.963 9.83-.001 1.93.505 3.813 1.467 5.474L2.247 21.91l4.512-1.183z" />
                </svg>
                WhatsApp
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  const email = prompt("Enter customer email address:");
                  if (email) {
                    const orderNo = completedSaleId ? `FTC-POS-${completedSaleId.slice(-6).toUpperCase()}` : '';
                    const itemsStr = cart.map(i => `• ${i.productName} x${i.quantity} (${fmt(i.lineTotal, currency)})`).join('%0A');
                    const subject = `Receipt for Order ${orderNo} - FTC Electronics`;
                    const body = `Thank you for shopping with FTC Electronics!%0A%0AOrder Number: ${orderNo}%0ADate: ${new Date().toLocaleDateString()}%0ATotal Amount: ${fmt(billData.total, currency)}%0A%0AItems Purchased:%0A${itemsStr}%0A%0AWe hope to see you again soon!`;
                    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${body}`;
                  }
                }}
                className="h-10 rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Mail className="h-4 w-4 text-blue-500" />
                Email
              </Button>
            </div>

            <Button
              onClick={onSuccess}
              className="w-full h-11 mt-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold"
            >
              Start New Sale
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Receipt className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Checkout</h2>
              <p className="text-[10px] text-muted-foreground">{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-5">
          {/* Total */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Total Amount Due</p>
            <p className="text-4xl font-black text-foreground">{fmt(billData.total, currency)}</p>
          </div>

          {/* Customer Selection & Registration */}
          <div className="space-y-2 pt-1 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <User className="h-3 w-3 text-blue-500" /> Customer Information
              </span>
              {!cName && (
                <button
                  type="button"
                  onClick={() => setShowNewCustForm(!showNewCustForm)}
                  className="text-[11px] font-bold text-blue-500 hover:underline flex items-center gap-1"
                >
                  <UserPlus className="h-3 w-3" /> {showNewCustForm ? 'Cancel New Customer' : '+ New Customer'}
                </button>
              )}
            </div>

            {cName ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
                <div>
                  <p className="font-bold text-foreground">{cName}</p>
                  {cPhone && <p className="text-[10px] text-muted-foreground font-mono">{cPhone}</p>}
                </div>
                <Button variant="ghost" size="xs" onClick={() => handleSelectCustomer('', '')} className="text-red-500 hover:bg-red-500/10 text-[10px]">
                  Change
                </Button>
              </div>
            ) : showNewCustForm ? (
              <form onSubmit={handleCreateCustomer} className="p-3 rounded-xl bg-muted/40 border border-border space-y-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-foreground">Customer Name *</label>
                  <Input
                    type="text"
                    required
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="Full Name"
                    className="h-8 text-xs mt-0.5 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-foreground">Phone</label>
                    <Input
                      type="text"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      placeholder="0771234567"
                      className="h-8 text-xs mt-0.5 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-foreground">Email</label>
                    <Input
                      type="email"
                      value={newCustEmail}
                      onChange={(e) => setNewCustEmail(e.target.value)}
                      placeholder="email@domain.com"
                      className="h-8 text-xs mt-0.5 rounded-lg"
                    />
                  </div>
                </div>
                {custError && <p className="text-[10px] text-red-500">{custError}</p>}
                <div className="flex justify-end gap-1.5 pt-1">
                  <Button type="button" variant="outline" size="xs" onClick={() => setShowNewCustForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="xs" disabled={creatingCust} className="font-bold">
                    {creatingCust ? 'Saving…' : 'Save & Attach'}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  value={custQuery}
                  onChange={(e) => setCustQuery(e.target.value)}
                  onFocus={() => {
                    if (custQuery.trim()) setShowCustDropdown(true);
                  }}
                  placeholder="Search customer by name or phone… (Optional)"
                  className="pl-8 h-9 text-xs rounded-xl"
                />
                {showCustDropdown && (
                  <div className="absolute left-0 right-0 top-10 z-20 bg-card border border-border rounded-xl shadow-xl max-h-36 overflow-y-auto p-1 divide-y divide-border">
                    {searchingCust ? (
                      <p className="p-2 text-[10px] text-muted-foreground text-center">Searching…</p>
                    ) : custResults.length === 0 ? (
                      <div className="p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">No customer found</p>
                        <button
                          type="button"
                          onClick={() => {
                            setNewCustName(custQuery);
                            setShowNewCustForm(true);
                            setShowCustDropdown(false);
                          }}
                          className="text-[10px] text-blue-500 font-bold hover:underline mt-1"
                        >
                          + Register &quot;{custQuery}&quot; as New Customer
                        </button>
                      </div>
                    ) : (
                      custResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCustomer(c.name, c.phone || '')}
                          className="w-full flex items-center justify-between p-2 hover:bg-muted/60 rounded-lg text-left text-xs"
                        >
                          <div>
                            <p className="font-bold text-foreground">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{c.phone || c.email}</p>
                          </div>
                          <span className="text-[10px] text-blue-500 font-semibold">Attach</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment Method</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMethod(m.key)}
                  className={`h-16 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer font-semibold text-xs ${
                    method === m.key ? m.color + ' ring-2 ring-current ring-offset-2 ring-offset-card' : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <m.icon className="h-5 w-5" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cash tendered */}
          {method === 'cash' && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Received</label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder={`Min. ${fmt(billData.total, currency)}`}
                  autoFocus
                  className="h-11 px-4 rounded-xl font-mono text-sm"
                />
              </div>
              {parseFloat(cashTendered || '0') >= billData.total && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-600">Change Due</span>
                  <span className="text-lg font-black text-emerald-500">{fmt(changeDue, currency)}</span>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Notes (optional)</label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. warranty info, special instructions"
              className="h-9 px-3 rounded-xl text-xs"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-xs">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCharge}
              disabled={!canCharge || isPending}
              className="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground text-white font-bold"
            >
              {isPending ? 'Processing…' : '✓ Confirm Sale'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
