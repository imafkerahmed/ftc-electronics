'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ScanLine,
  User,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Grid3x3,
  Barcode,
  Sparkles,
  Phone,
  Mail,
  Plus,
  Minus,
  Trash2,
} from 'lucide-react';
import type { PosCartItem } from '@/types/pos';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchPosCustomersAction, createPosCustomerAction } from '@/app/actions/admin';
import PosProductGrid from './pos-product-grid';

interface PosNewSaleTerminalProps {
  onAddToCart: (item: Omit<PosCartItem, 'quantity' | 'itemDiscount' | 'lineTotal'>) => void;
  cartItems: PosCartItem[];
  onUpdateQty: (key: string, delta: number) => void;
  onRemoveItem: (key: string) => void;
  customerName: string;
  customerPhone: string;
  onSetCustomer: (name: string, phone: string) => void;
  refreshTrigger?: number;
  currency?: string;
}

export default function PosNewSaleTerminal({
  onAddToCart,
  cartItems,
  onUpdateQty,
  onRemoveItem,
  customerName,
  customerPhone,
  onSetCustomer,
  refreshTrigger,
  currency = 'LKR',
}: PosNewSaleTerminalProps) {
  const [activeTab, setActiveTab] = useState<'terminal' | 'catalog'>('terminal');
  const [scanQuery, setScanQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanSuccess, setLastScanSuccess] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Customer search & creation states
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<any[]>([]);
  const [searchingCust, setSearchingCust] = useState(false);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [showNewCustModal, setShowNewCustModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [custError, setCustError] = useState<string | null>(null);
  const [creatingCust, setCreatingCust] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const custInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus barcode scanner input on mount
  useEffect(() => {
    if (activeTab === 'terminal') {
      scanInputRef.current?.focus();
    }
  }, [activeTab]);

  // Keyboard shortcut '/' to focus scanner
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== scanInputRef.current) {
        e.preventDefault();
        scanInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Search existing customers
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

  // Handle unit sticker / barcode scan
  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = scanQuery.trim();
    if (!q) return;

    setIsScanning(true);
    setScanError(null);
    setLastScanSuccess(null);

    try {
      const res = await fetch(`/api/pos/scan?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        const item = data.data;
        onAddToCart({
          key: item.unitBarcode ? `${item.productId}-${item.unitBarcode}` : item.productId,
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          imageUrl: item.imageUrl,
          unitPrice: item.unitPrice,
          unitId: item.unitId,
          unitBarcode: item.unitBarcode,
          unitSerial: item.unitSerial,
        });
        setLastScanSuccess(
          `Scanned "${item.productName}" ${item.unitBarcode ? `(BC: ${item.unitBarcode})` : ''}`
        );
        setScanQuery('');
      } else {
        setScanError(data.error || `No unit or product found for "${q}".`);
      }
    } catch (err: any) {
      setScanError(`Scan failed: ${err.message || 'Network error'}`);
    } finally {
      setIsScanning(false);
      scanInputRef.current?.focus();
    }
  };

  // Create new customer
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
      onSetCustomer(res.data.name, res.data.phone || '');
      setShowNewCustModal(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
    } else {
      setCustError(res.error || 'Failed to create customer.');
    }
    setCreatingCust(false);
  };

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Header bar: New Sale title + Mode switcher */}
      <div className="flex items-center justify-between shrink-0 pb-1 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-foreground tracking-tight">New Sale Terminal</h2>
            <p className="text-[11px] text-muted-foreground">Scan sticker barcodes & manage customer details</p>
          </div>
        </div>

        {/* Mode switcher tabs */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'terminal'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Barcode className="h-3.5 w-3.5" />
            Scanner Terminal
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'catalog'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
            Browse Catalog
          </button>
        </div>
      </div>

      {activeTab === 'catalog' ? (
        <PosProductGrid onAddToCart={onAddToCart} refreshTrigger={refreshTrigger} />
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {/* 1. BARCODE / STICKER SCANNER CARD */}
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ScanLine className="h-3.5 w-3.5 text-blue-500" />
                Scan Product Unit Sticker / Barcode
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">Press / to focus scanner</span>
            </div>

            <form onSubmit={handleScanSubmit} className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={scanInputRef}
                  type="text"
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  placeholder="Scan unit sticker (STK-...), serial (SN-...), or enter SKU…"
                  className="pl-11 pr-10 h-12 text-sm rounded-xl font-mono border-blue-500/30 focus-visible:ring-blue-500/50 bg-background"
                />
                {scanQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setScanQuery('');
                      setScanError(null);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button type="submit" size="lg" disabled={isScanning || !scanQuery.trim()} className="h-12 px-5 font-bold rounded-xl shrink-0">
                {isScanning ? 'Scanning…' : 'Scan Item'}
              </Button>
            </form>

            {/* Scan success feedback */}
            {lastScanSuccess && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-medium animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>{lastScanSuccess}</span>
              </div>
            )}

            {/* Scan error feedback */}
            {scanError && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{scanError}</span>
                </div>
                <button type="button" onClick={() => setScanError(null)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 2. CUSTOMER SELECTION & REGISTRATION CARD */}
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3 relative">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-blue-500" />
                Customer Information
              </span>
              {customerName ? (
                <Button variant="ghost" size="xs" onClick={() => onSetCustomer('', '')} className="text-red-500 hover:bg-red-500/10 text-[11px]">
                  Clear Customer
                </Button>
              ) : (
                <Button variant="outline" size="xs" onClick={() => setShowNewCustModal(true)} className="gap-1 text-xs font-semibold">
                  <UserPlus className="h-3.5 w-3.5 text-blue-500" />
                  + New Customer
                </Button>
              )}
            </div>

            {/* If Customer selected */}
            {customerName ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-foreground">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-blue-500 text-white font-bold flex items-center justify-center text-sm uppercase">
                    {customerName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">{customerName}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{customerPhone || 'No phone provided'}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Attached to Sale
                </span>
              </div>
            ) : (
              /* Search Existing Customer */
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={custInputRef}
                    type="text"
                    value={custQuery}
                    onChange={(e) => setCustQuery(e.target.value)}
                    onFocus={() => {
                      if (custQuery.trim()) setShowCustDropdown(true);
                    }}
                    placeholder="Search existing customer by Name, Phone, or Email…"
                    className="pl-10 h-10 text-xs rounded-xl"
                  />
                  {custQuery && (
                    <button type="button" onClick={() => setCustQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown search results */}
                {showCustDropdown && (
                  <div className="absolute left-0 right-0 top-11 z-20 bg-card border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto p-1 divide-y divide-border">
                    {searchingCust ? (
                      <p className="p-3 text-xs text-muted-foreground text-center">Searching customers…</p>
                    ) : custResults.length === 0 ? (
                      <div className="p-3 text-center">
                        <p className="text-xs text-muted-foreground">No customer found for &quot;{custQuery}&quot;</p>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => {
                            setNewCustName(custQuery);
                            setShowCustDropdown(false);
                            setShowNewCustModal(true);
                          }}
                          className="text-xs text-blue-500 font-bold mt-1"
                        >
                          + Create &quot;{custQuery}&quot; as New Customer
                        </Button>
                      </div>
                    ) : (
                      custResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onSetCustomer(c.name, c.phone || '');
                            setCustQuery('');
                            setShowCustDropdown(false);
                          }}
                          className="w-full flex items-center justify-between p-2.5 hover:bg-muted/60 rounded-lg text-left transition-colors"
                        >
                          <div>
                            <p className="text-xs font-bold text-foreground">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{c.phone || c.email}</p>
                          </div>
                          <span className="text-[10px] text-blue-500 font-semibold">Select</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. SCANNED ITEMS FOR THIS SALE SESSION */}
          <div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Scanned Sale Items ({cartItems.length})
              </span>
              {cartItems.length > 0 && (
                <span className="text-xs font-mono text-muted-foreground">
                  Subtotal:{' '}
                  <strong className="text-foreground">
                    {cartItems
                      .reduce((sum, item) => sum + item.lineTotal, 0)
                      .toLocaleString('en-LK', { style: 'currency', currency, maximumFractionDigits: 0 })}
                  </strong>
                </span>
              )}
            </div>

            {cartItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground rounded-xl border border-dashed border-border flex flex-col items-center gap-2">
                <ScanLine className="h-8 w-8 opacity-30 text-blue-500" />
                <p className="text-xs font-semibold">No items scanned yet for this sale</p>
                <p className="text-[11px] opacity-60">Scan a unit sticker barcode above or switch to &quot;Browse Catalog&quot;</p>
              </div>
            ) : (
              <div className="space-y-2 divide-y divide-border">
                {cartItems.map((item) => (
                  <div key={item.key} className="pt-2 first:pt-0 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground line-clamp-1">{item.productName}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground font-mono">
                        <span>{item.sku}</span>
                        {item.unitBarcode && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 font-bold border border-blue-500/20">
                            BC: {item.unitBarcode}
                          </span>
                        )}
                        {item.unitSerial && (
                          <span className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium">
                            SN: {item.unitSerial}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Qty controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="icon-xs" onClick={() => onUpdateQty(item.key, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                      <Button variant="outline" size="icon-xs" onClick={() => onUpdateQty(item.key, +1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    <p className="text-xs font-black text-foreground shrink-0 w-20 text-right">
                      {item.lineTotal.toLocaleString('en-LK', { style: 'currency', currency, maximumFractionDigits: 0 })}
                    </p>

                    <Button variant="ghost" size="icon-xs" onClick={() => onRemoveItem(item.key)} className="text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW CUSTOMER MODAL */}
      {showNewCustModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-blue-500" /> Register New Customer
              </h3>
              <button onClick={() => setShowNewCustModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-foreground">Customer Name *</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    required
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="Full name"
                    className="pl-9 h-10 text-xs rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground">Phone Number</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="0771234567"
                    className="pl-9 h-10 text-xs rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground">Email Address</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="email"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                    placeholder="customer@domain.com"
                    className="pl-9 h-10 text-xs rounded-xl"
                  />
                </div>
              </div>

              {custError && <p className="text-xs text-red-500 font-semibold">{custError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewCustModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={creatingCust} className="font-bold">
                  {creatingCust ? 'Registering…' : 'Save & Attach Customer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
