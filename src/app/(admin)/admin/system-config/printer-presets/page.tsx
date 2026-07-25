'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Printer,
  Plus,
  Trash2,
  Star,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pencil,
  X,
  RotateCcw,
  TestTube,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_BARCODE_CONFIG, normalizeBarcodeConfig, type BarcodePrintConfig } from '@/types/barcode-config';
import { DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig, type ReceiptPrintConfig } from '@/types/receipt-config';
import { DEFAULT_INVOICE_CONFIG, normalizeInvoiceConfig, type InvoicePrintConfig } from '@/types/invoice-config';
import { printBarcodeLabels, generateTestBarcodeItems } from '@/lib/barcode-print';
import { printReceipt, generateTestReceiptData } from '@/lib/receipt-print';
import { printInvoice, generateTestInvoiceData } from '@/lib/invoice-print';
import {
  getBarcodePrintPresetsAction,
  saveBarcodePrintPresetAction,
  deleteBarcodePrintPresetAction,
  setDefaultBarcodePrintPresetAction,
  getReceiptPrintPresetsAction,
  saveReceiptPrintPresetAction,
  deleteReceiptPrintPresetAction,
  setDefaultReceiptPrintPresetAction,
  getInvoicePrintPresetsAction,
  saveInvoicePrintPresetAction,
  deleteInvoicePrintPresetAction,
  setDefaultInvoicePrintPresetAction,
} from '@/app/actions/admin';

interface PBPreset {
  id: string;
  label: string;
  config: string;
  isDefault: boolean;
}

function parseBarcodeConfig(raw: string): BarcodePrintConfig {
  return normalizeBarcodeConfig(raw);
}

function parseReceiptConfig(raw: string): ReceiptPrintConfig {
  return normalizeReceiptConfig(raw);
}

function parseInvoiceConfig(raw: string): InvoicePrintConfig {
  return normalizeInvoiceConfig(raw);
}

// ─── Barcode Preset Editor Form ────────────────────────────────────────────────

function BarcodePresetEditor({
  initial,
  existingId,
  onSave,
  onCancel,
}: {
  initial: BarcodePrintConfig;
  existingId?: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<BarcodePrintConfig>({ ...initial });
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof BarcodePrintConfig>(k: K, v: BarcodePrintConfig[K]) {
    setCfg((p) => ({ ...p, [k]: v }));
  }

  const numField = (
    label: string,
    key: keyof BarcodePrintConfig,
    min: number,
    max: number,
    step: number | string = 'any',
    unit = ''
  ) => {
    const rawVal = cfg[key] as number;
    const displayVal = Number.isNaN(rawVal) || rawVal === undefined ? '' : rawVal;
    return (
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {label}{unit && <span className="ml-1 normal-case text-muted-foreground/60">({unit})</span>}
        </label>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={displayVal}
          onChange={(e) => {
            const valStr = e.target.value;
            if (valStr === '') {
              set(key, 0 as BarcodePrintConfig[typeof key]);
            } else {
              const parsed = parseFloat(valStr);
              set(key, (Number.isNaN(parsed) ? 0 : parsed) as BarcodePrintConfig[typeof key]);
            }
          }}
          className="h-8 text-xs"
        />
      </div>
    );
  };

  const toggle = (key: keyof BarcodePrintConfig, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        onClick={() => set(key, !cfg[key] as BarcodePrintConfig[typeof key])}
        className={`w-8 h-4 rounded-full transition-colors ${cfg[key] ? 'bg-blue-600' : 'bg-muted'}`}
      >
        <div className={`w-3 h-3 bg-white rounded-full mt-0.5 shadow transition-transform duration-200 ${cfg[key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-foreground/80">{label}</span>
    </label>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!cfg.label.trim()) { setErr('Preset name is required.'); return; }
    startTransition(async () => {
      const res = await saveBarcodePrintPresetAction(cfg, existingId);
      if (res.success) { onSave(); }
      else { setErr(res.error || 'Save failed.'); }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preset Name *</label>
          <Input value={cfg.label} onChange={(e) => set('label', e.target.value)} placeholder='e.g. "Dymo 62mm"' className="h-8 text-xs" required />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground/80">
            <input type="checkbox" checked={cfg.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="rounded" />
            <Star className="h-3 w-3 text-amber-500" /> Set as default
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Label Roll Dimensions</p>
          {numField('Printer Roll Width', 'rollWidthMm', 10, 300, 'any', 'mm')}
          {numField('Label Width', 'labelWidthMm', 1, 300, 'any', 'mm')}
          {numField('Label Height', 'labelHeightMm', 1, 300, 'any', 'mm')}
          {numField('Horizontal Gap (Columns)', 'gapXMm', 0, 50, 'any', 'mm')}
          {numField('Vertical Gap (Rows)', 'gapYMm', 0, 50, 'any', 'mm')}
          {numField('Side Margin (Edges)', 'marginMm', 0, 50, 'any', 'mm')}
          {numField('Columns per row', 'columns', 1, 20, 1)}
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Barcode & Text Options</p>
          {numField('Bar width', 'barWidthMm', 0.1, 10, 'any', 'mm')}
          {numField('Bar height', 'barHeightMm', 0.5, 100, 'any', 'mm')}
          {numField('Text font size', 'fontSizeMm', 0.5, 20, 'any', 'mm')}
          {numField('Price font size', 'priceFontSizeMm', 0.5, 20, 'any', 'mm')}
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Show / Hide Fields</p>
        <div className="grid grid-cols-2 gap-2">
          {toggle('showProductName', 'Product Name')}
          {toggle('showSerial', 'Serial Number')}
          {toggle('showBatch', 'Batch Number')}
          {toggle('showPrice', 'Price')}
        </div>
      </div>

      <div className="bg-muted/30 border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground/70">Preview: </span>
        {cfg.rollWidthMm || (cfg.labelWidthMm * cfg.columns + (cfg.gapXMm ?? cfg.gapMm) * Math.max(0, cfg.columns - 1))}mm roll &nbsp;·&nbsp; {cfg.labelWidthMm}×{cfg.labelHeightMm}mm label &nbsp;·&nbsp; gaps: {cfg.gapXMm ?? cfg.gapMm}×{cfg.gapYMm ?? cfg.gapMm}mm &nbsp;·&nbsp; margin {cfg.marginMm || 0}mm
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {existingId ? 'Update Preset' : 'Save Preset'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="text-xs h-8 px-4 cursor-pointer">Cancel</Button>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => printBarcodeLabels(cfg, generateTestBarcodeItems(6), `Test Alignment \u2014 ${cfg.label || 'Preset'}`)}
          className="text-xs h-8 px-3 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 flex items-center gap-1.5 cursor-pointer font-medium"
          title="Print 6 sample labels to verify layout and alignment on physical paper"
        >
          <TestTube className="h-3.5 w-3.5" /> Test Print
        </Button>
      </div>
    </form>
  );
}

// ─── Receipt Preset Editor Form ────────────────────────────────────────────────

function ReceiptPresetEditor({
  initial,
  existingId,
  onSave,
  onCancel,
}: {
  initial: ReceiptPrintConfig;
  existingId?: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<ReceiptPrintConfig>({ ...initial });
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof ReceiptPrintConfig>(k: K, v: ReceiptPrintConfig[K]) {
    setCfg((p) => ({ ...p, [k]: v }));
  }

  const toggle = (key: keyof ReceiptPrintConfig, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        onClick={() => set(key, !cfg[key] as ReceiptPrintConfig[typeof key])}
        className={`w-8 h-4 rounded-full transition-colors ${cfg[key] ? 'bg-blue-600' : 'bg-muted'}`}
      >
        <div className={`w-3 h-3 bg-white rounded-full mt-0.5 shadow transition-transform duration-200 ${cfg[key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-foreground/80">{label}</span>
    </label>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!cfg.label.trim()) { setErr('Preset name is required.'); return; }
    startTransition(async () => {
      const res = await saveReceiptPrintPresetAction(cfg, existingId);
      if (res.success) { onSave(); }
      else { setErr(res.error || 'Save failed.'); }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preset Name *</label>
          <Input value={cfg.label} onChange={(e) => set('label', e.target.value)} placeholder='e.g. "80mm POS Thermal"' className="h-8 text-xs" required />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground/80">
            <input type="checkbox" checked={cfg.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="rounded" />
            <Star className="h-3 w-3 text-amber-500" /> Set as default
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Paper Width</label>
          <select
            value={cfg.paperWidthMm}
            onChange={(e) => set('paperWidthMm', parseInt(e.target.value, 10))}
            className="w-full h-8 rounded-lg border border-border bg-background text-xs px-2 cursor-pointer"
          >
            <option value={80}>80mm (Standard POS Thermal)</option>
            <option value={58}>58mm (Mini Thermal)</option>
            <option value={210}>210mm (A4 Full Page)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Font Size (mm)</label>
          <Input
            type="number"
            min={1}
            max={10}
            step={0.5}
            value={Number.isNaN(cfg.fontSizeMm) || cfg.fontSizeMm === undefined ? '' : cfg.fontSizeMm}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              set('fontSizeMm', Number.isNaN(parsed) ? 4 : parsed);
            }}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Store Header Details</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Store Name</label>
            <Input value={cfg.storeName} onChange={(e) => set('storeName', e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Phone</label>
            <Input value={cfg.headerPhone} onChange={(e) => set('headerPhone', e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-[10px] text-muted-foreground font-medium">Address</label>
            <Input value={cfg.headerAddress} onChange={(e) => set('headerAddress', e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-[10px] text-muted-foreground font-medium">Tax / VAT ID (Optional)</label>
            <Input value={cfg.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} placeholder="e.g. VAT: 123456789" className="h-8 text-xs" />
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Footer & Notes</p>
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Thank You Message</label>
            <Input value={cfg.footerMessage} onChange={(e) => set('footerMessage', e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Return Policy Note</label>
            <Input value={cfg.returnPolicyText} onChange={(e) => set('returnPolicyText', e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Show / Hide Options</p>
        <div className="grid grid-cols-2 gap-2">
          {toggle('showCustomerInfo', 'Customer Info')}
          {toggle('showItemSerials', 'Item Serials')}
          {toggle('showPaymentMethod', 'Payment Method')}
          {toggle('showQrCode', 'Order QR Code')}
        </div>
      </div>

      <div className="bg-muted/30 border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground/70">Receipt Layout: </span>
        {cfg.paperWidthMm}mm paper &nbsp;·&nbsp; font {cfg.fontSizeMm}mm &nbsp;·&nbsp; {cfg.storeName || 'Store Name'}
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {existingId ? 'Update Preset' : 'Save Preset'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="text-xs h-8 px-4 cursor-pointer">Cancel</Button>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => printReceipt(cfg, generateTestReceiptData(), `Test Receipt \u2014 ${cfg.label || 'Thermal'}`)}
          className="text-xs h-8 px-3 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 flex items-center gap-1.5 cursor-pointer font-medium"
          title="Print a test sample receipt to verify paper alignment and margins on thermal printer"
        >
          <TestTube className="h-3.5 w-3.5" /> Test Print Receipt
        </Button>
      </div>
    </form>
  );
}

// ─── Invoice Preset Editor Form ────────────────────────────────────────────────

function InvoicePresetEditor({
  initial,
  existingId,
  onSave,
  onCancel,
}: {
  initial: InvoicePrintConfig;
  existingId?: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<InvoicePrintConfig>({ ...initial });
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof InvoicePrintConfig>(k: K, v: InvoicePrintConfig[K]) {
    setCfg((p) => ({ ...p, [k]: v }));
  }

  const toggle = (key: keyof InvoicePrintConfig, label: string) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        onClick={() => set(key, !cfg[key] as InvoicePrintConfig[typeof key])}
        className={`w-8 h-4 rounded-full transition-colors ${cfg[key] ? 'bg-blue-600' : 'bg-muted'}`}
      >
        <div className={`w-3 h-3 bg-white rounded-full mt-0.5 shadow transition-transform duration-200 ${cfg[key] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      <span className="text-xs text-foreground/80">{label}</span>
    </label>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!cfg.label.trim()) { setErr('Preset name is required.'); return; }
    startTransition(async () => {
      const res = await saveInvoicePrintPresetAction(cfg, existingId);
      if (res.success) { onSave(); }
      else { setErr(res.error || 'Save failed.'); }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preset Name *</label>
          <Input value={cfg.label} onChange={(e) => set('label', e.target.value)} placeholder='e.g. "Standard A4 Tax Invoice"' className="h-8 text-xs" required />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground/80">
            <input type="checkbox" checked={cfg.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="rounded" />
            <Star className="h-3 w-3 text-amber-500" /> Set as default
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Paper Width</label>
          <select
            value={cfg.paperWidthMm}
            onChange={(e) => set('paperWidthMm', parseInt(e.target.value, 10))}
            className="w-full h-8 rounded-lg border border-border bg-background text-xs px-2 cursor-pointer"
          >
            <option value={210}>210mm (A4 Full Sheet)</option>
            <option value={216}>216mm (US Letter Sheet)</option>
            <option value={80}>80mm (POS Receipt Invoice)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Font Size (mm)</label>
          <Input
            type="number"
            min={1}
            max={10}
            step={0.5}
            value={Number.isNaN(cfg.fontSizeMm) || cfg.fontSizeMm === undefined ? '' : cfg.fontSizeMm}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              set('fontSizeMm', Number.isNaN(parsed) ? 3.5 : parsed);
            }}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Doc Heading</label>
          <Input value={cfg.documentTitle} onChange={(e) => set('documentTitle', e.target.value)} placeholder='INVOICE' className="h-8 text-xs" />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Store & Header Details</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Store Name</label>
            <Input value={cfg.storeName} onChange={(e) => set('storeName', e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Phone</label>
            <Input value={cfg.headerPhone} onChange={(e) => set('headerPhone', e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Email</label>
            <Input value={cfg.headerEmail} onChange={(e) => set('headerEmail', e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Tax / VAT ID</label>
            <Input value={cfg.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} placeholder="e.g. VAT: 123456789" className="h-8 text-xs" />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-[10px] text-muted-foreground font-medium">Address</label>
            <Input value={cfg.headerAddress} onChange={(e) => set('headerAddress', e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Bank Details & Terms</p>
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Bank Transfer Info</label>
            <Input value={cfg.bankDetailsText} onChange={(e) => set('bankDetailsText', e.target.value)} placeholder="Bank: Commercial Bank | Account: 1000293847" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Terms & Conditions / Validity Notes</label>
            <textarea
              value={cfg.termsAndConditions}
              onChange={(e) => set('termsAndConditions', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest">Show / Hide Options</p>
        <div className="grid grid-cols-2 gap-2">
          {toggle('showTaxBreakdown', 'Tax Breakdown')}
          {toggle('showDueDate', 'Due Date / Expiry')}
          {toggle('showSignatureBlock', 'Signature & Stamp')}
          {toggle('showQrCode', 'Document QR Code')}
        </div>
      </div>

      <div className="bg-muted/30 border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground/70">Invoice Layout: </span>
        {cfg.paperWidthMm}mm paper &nbsp;·&nbsp; font {cfg.fontSizeMm}mm &nbsp;·&nbsp; Title: {cfg.documentTitle || 'TAX INVOICE'} &nbsp;·&nbsp; {cfg.storeName || 'Store Name'}
      </div>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {existingId ? 'Update Preset' : 'Save Preset'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="text-xs h-8 px-4 cursor-pointer">Cancel</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => printInvoice(cfg, generateTestInvoiceData('Quotation'), `Test Quotation \u2014 ${cfg.label || 'Invoice'}`)}
            className="text-xs h-8 px-2.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 flex items-center gap-1 cursor-pointer font-medium"
            title="Print test quotation sample"
          >
            <TestTube className="h-3.5 w-3.5" /> Test Quotation
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => printInvoice(cfg, generateTestInvoiceData('Invoice'), `Test Invoice \u2014 ${cfg.label || 'Invoice'}`)}
            className="text-xs h-8 px-2.5 border-blue-500/40 text-blue-600 hover:bg-blue-500/10 flex items-center gap-1 cursor-pointer font-medium"
            title="Print test sales invoice sample"
          >
            <TestTube className="h-3.5 w-3.5" /> Test Invoice
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─── Main Printer Presets Page ─────────────────────────────────────────────────

export default function PrinterPresetsPage() {
  // Barcode Presets state
  const [barcodePresets, setBarcodePresets] = useState<PBPreset[]>([]);
  const [loadingBarcode, setLoadingBarcode] = useState(true);
  const [showBarcodeEditor, setShowBarcodeEditor] = useState(false);
  const [editingBarcodePreset, setEditingBarcodePreset] = useState<PBPreset | null>(null);
  const [deleteBarcodeId, setDeleteBarcodeId] = useState<string | null>(null);

  // Receipt Presets state
  const [receiptPresets, setReceiptPresets] = useState<PBPreset[]>([]);
  const [loadingReceipt, setLoadingReceipt] = useState(true);
  const [showReceiptEditor, setShowReceiptEditor] = useState(false);
  const [editingReceiptPreset, setEditingReceiptPreset] = useState<PBPreset | null>(null);
  const [deleteReceiptId, setDeleteReceiptId] = useState<string | null>(null);

  // Invoice Presets state
  const [invoicePresets, setInvoicePresets] = useState<PBPreset[]>([]);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [showInvoiceEditor, setShowInvoiceEditor] = useState(false);
  const [editingInvoicePreset, setEditingInvoicePreset] = useState<PBPreset | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadBarcodePresets = async () => {
    setLoadingBarcode(true);
    const res = await getBarcodePrintPresetsAction();
    if (res.success) setBarcodePresets(res.data as PBPreset[]);
    setLoadingBarcode(false);
  };

  const loadReceiptPresets = async () => {
    setLoadingReceipt(true);
    const res = await getReceiptPrintPresetsAction();
    if (res.success) setReceiptPresets(res.data as unknown as PBPreset[]);
    setLoadingReceipt(false);
  };

  const loadInvoicePresets = async () => {
    setLoadingInvoice(true);
    const res = await getInvoicePrintPresetsAction();
    if (res.success) setInvoicePresets(res.data as PBPreset[]);
    setLoadingInvoice(false);
  };

  useEffect(() => {
    void loadBarcodePresets();
    void loadReceiptPresets();
    void loadInvoicePresets();
  }, []);

  // Barcode Handlers
  const handleDeleteBarcode = (id: string) => {
    startTransition(async () => {
      const res = await deleteBarcodePrintPresetAction(id);
      if (res.success) { showToast('Barcode preset deleted.'); setDeleteBarcodeId(null); await loadBarcodePresets(); }
      else { showToast(res.error || 'Delete failed.', 'error'); }
    });
  };

  const handleSetDefaultBarcode = (id: string) => {
    startTransition(async () => {
      const res = await setDefaultBarcodePrintPresetAction(id);
      if (res.success) { showToast('Default barcode preset updated.'); await loadBarcodePresets(); }
      else { showToast(res.error || 'Failed.', 'error'); }
    });
  };

  // Receipt Handlers
  const handleDeleteReceipt = (id: string) => {
    startTransition(async () => {
      const res = await deleteReceiptPrintPresetAction(id);
      if (res.success) { showToast('Receipt preset deleted.'); setDeleteReceiptId(null); await loadReceiptPresets(); }
      else { showToast(res.error || 'Delete failed.', 'error'); }
    });
  };

  const handleSetDefaultReceipt = (id: string) => {
    startTransition(async () => {
      const res = await setDefaultReceiptPrintPresetAction(id);
      if (res.success) { showToast('Default receipt preset updated.'); await loadReceiptPresets(); }
      else { showToast(res.error || 'Failed.', 'error'); }
    });
  };

  // Invoice Handlers
  const handleDeleteInvoice = (id: string) => {
    startTransition(async () => {
      const res = await deleteInvoicePrintPresetAction(id);
      if (res.success) { showToast('Invoice preset deleted.'); setDeleteInvoiceId(null); await loadInvoicePresets(); }
      else { showToast(res.error || 'Delete failed.', 'error'); }
    });
  };

  const handleSetDefaultInvoice = (id: string) => {
    startTransition(async () => {
      const res = await setDefaultInvoicePrintPresetAction(id);
      if (res.success) { showToast('Default invoice preset updated.'); await loadInvoicePresets(); }
      else { showToast(res.error || 'Failed.', 'error'); }
    });
  };

  const barcodeEditorInitial = editingBarcodePreset
    ? parseBarcodeConfig(editingBarcodePreset.config)
    : { ...DEFAULT_BARCODE_CONFIG };

  const receiptEditorInitial = editingReceiptPreset
    ? parseReceiptConfig(editingReceiptPreset.config)
    : { ...DEFAULT_RECEIPT_CONFIG };

  const invoiceEditorInitial = editingInvoicePreset
    ? parseInvoiceConfig(editingInvoicePreset.config)
    : { ...DEFAULT_INVOICE_CONFIG };

  return (
    <div className="space-y-8 max-w-4xl pb-16">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {toast.msg}
        </div>
      )}

      {/* Header with Back button */}
      <div className="border-b border-border pb-5">
        <Link
          href="/admin/system-config"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 group"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to System Configurations
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <Printer className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Printer Presets</h1>
            <p className="text-xs text-muted-foreground">Manage barcode sticker layouts and POS thermal receipt printing formats.</p>
          </div>
        </div>
      </div>

      {/* ────────────────── SECTION 1: BARCODE LABEL PRESETS ────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Printer className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Barcode Label Presets</h2>
              <p className="text-[10px] text-muted-foreground">Save sticker sizes, columns, gap and barcode dimensions as reusable presets.</p>
            </div>
          </div>
          {!showBarcodeEditor && (
            <Button
              size="sm"
              onClick={() => { setEditingBarcodePreset(null); setShowBarcodeEditor(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-3 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New Barcode Preset
            </Button>
          )}
        </div>

        {showBarcodeEditor && (
          <div className="px-6 py-5 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">
                {editingBarcodePreset ? `Edit: ${editingBarcodePreset.label}` : 'New Barcode Preset'}
              </h3>
              <button onClick={() => { setShowBarcodeEditor(false); setEditingBarcodePreset(null); }} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <BarcodePresetEditor
              initial={barcodeEditorInitial}
              existingId={editingBarcodePreset?.id}
              onSave={async () => {
                setShowBarcodeEditor(false);
                setEditingBarcodePreset(null);
                showToast(editingBarcodePreset ? 'Barcode preset updated!' : 'Barcode preset saved!');
                await loadBarcodePresets();
              }}
              onCancel={() => { setShowBarcodeEditor(false); setEditingBarcodePreset(null); }}
            />
          </div>
        )}

        <div className="divide-y divide-border">
          {loadingBarcode ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : barcodePresets.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Printer className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-xs text-muted-foreground">No barcode presets yet. Click <strong>New Barcode Preset</strong> to create one.</p>
            </div>
          ) : (
            barcodePresets.map((preset) => {
              const cfg = parseBarcodeConfig(preset.config);
              return (
                <div key={preset.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    {preset.isDefault ? (
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-foreground">{preset.label}</p>
                        {preset.isDefault && (
                          <span className="text-[9px] font-bold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full">DEFAULT</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {cfg.rollWidthMm || (cfg.labelWidthMm * cfg.columns + (cfg.gapXMm ?? cfg.gapMm) * Math.max(0, cfg.columns - 1))}mm roll &nbsp;·&nbsp; {cfg.labelWidthMm}×{cfg.labelHeightMm}mm &nbsp;·&nbsp; gaps {cfg.gapXMm ?? cfg.gapMm}×{cfg.gapYMm ?? cfg.gapMm}mm &nbsp;·&nbsp; margin {cfg.marginMm || 0}mm
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => printBarcodeLabels(cfg, generateTestBarcodeItems(6), `Test Alignment \u2014 ${preset.label}`)}
                      title="Test print 6 sample labels for alignment check"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer"
                    >
                      <TestTube className="h-3.5 w-3.5" />
                    </button>
                    {!preset.isDefault && (
                      <button
                        onClick={() => handleSetDefaultBarcode(preset.id)}
                        disabled={isPending}
                        title="Set as default"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingBarcodePreset(preset); setShowBarcodeEditor(true); }}
                      title="Edit"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {deleteBarcodeId === preset.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteBarcode(preset.id)}
                          disabled={isPending}
                          className="text-[10px] font-semibold text-red-500 hover:text-red-400 px-2 py-1 rounded cursor-pointer"
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                        </button>
                        <button onClick={() => setDeleteBarcodeId(null)} className="text-[10px] text-muted-foreground cursor-pointer">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteBarcodeId(preset.id)}
                        title="Delete"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 bg-muted/10 border-t border-border flex items-center gap-2">
          <RotateCcw className="h-3 w-3 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Built-in default: 96mm roll · 30×20mm labels · 3 cols · gaps 2×2mm · margin 1mm
          </p>
        </div>
      </div>

      {/* ────────────────── SECTION 2: RECEIPT PRINT PRESETS ────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 bg-violet-500/10 rounded-lg flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Receipt Print Presets</h2>
              <p className="text-[10px] text-muted-foreground">Configure 80mm/58mm POS thermal printers, store headers, and receipt footers.</p>
            </div>
          </div>
          {!showReceiptEditor && (
            <Button
              size="sm"
              onClick={() => { setEditingReceiptPreset(null); setShowReceiptEditor(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-3 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New Receipt Preset
            </Button>
          )}
        </div>

        {showReceiptEditor && (
          <div className="px-6 py-5 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">
                {editingReceiptPreset ? `Edit: ${editingReceiptPreset.label}` : 'New Receipt Preset'}
              </h3>
              <button onClick={() => { setShowReceiptEditor(false); setEditingReceiptPreset(null); }} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ReceiptPresetEditor
              initial={receiptEditorInitial}
              existingId={editingReceiptPreset?.id}
              onSave={async () => {
                setShowReceiptEditor(false);
                setEditingReceiptPreset(null);
                showToast(editingReceiptPreset ? 'Receipt preset updated!' : 'Receipt preset saved!');
                await loadReceiptPresets();
              }}
              onCancel={() => { setShowReceiptEditor(false); setEditingReceiptPreset(null); }}
            />
          </div>
        )}

        <div className="divide-y divide-border">
          {loadingReceipt ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : receiptPresets.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-xs text-muted-foreground">No receipt presets yet. Click <strong>New Receipt Preset</strong> to configure thermal receipts.</p>
            </div>
          ) : (
            receiptPresets.map((preset) => {
              const cfg = parseReceiptConfig(preset.config);
              return (
                <div key={preset.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    {preset.isDefault ? (
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-foreground">{preset.label}</p>
                        {preset.isDefault && (
                          <span className="text-[9px] font-bold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full">DEFAULT</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {cfg.paperWidthMm}mm paper &nbsp;·&nbsp; font {cfg.fontSizeMm}mm &nbsp;·&nbsp; {cfg.storeName || 'Store Name'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => printReceipt(cfg, generateTestReceiptData(), `Test Receipt \u2014 ${preset.label}`)}
                      title="Test print sample receipt to check thermal printer width & margins"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer"
                    >
                      <TestTube className="h-3.5 w-3.5" />
                    </button>
                    {!preset.isDefault && (
                      <button
                        onClick={() => handleSetDefaultReceipt(preset.id)}
                        disabled={isPending}
                        title="Set as default"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingReceiptPreset(preset); setShowReceiptEditor(true); }}
                      title="Edit"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {deleteReceiptId === preset.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteReceipt(preset.id)}
                          disabled={isPending}
                          className="text-[10px] font-semibold text-red-500 hover:text-red-400 px-2 py-1 rounded cursor-pointer"
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                        </button>
                        <button onClick={() => setDeleteReceiptId(null)} className="text-[10px] text-muted-foreground cursor-pointer">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteReceiptId(preset.id)}
                        title="Delete"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 bg-muted/10 border-t border-border flex items-center gap-2">
          <RotateCcw className="h-3 w-3 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Built-in default: 80mm POS Thermal · font 4mm · FTC Electronics
          </p>
        </div>
      </div>

      {/* ────────────────── SECTION 3: INVOICE & QUOTATION PRESETS ─────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Sales Invoice & Quotation Presets</h2>
              <p className="text-[10px] text-muted-foreground">Configure A4/Letter formal invoices, quotations, bank details, and terms.</p>
            </div>
          </div>
          {!showInvoiceEditor && (
            <Button
              size="sm"
              onClick={() => { setEditingInvoicePreset(null); setShowInvoiceEditor(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-3 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> New Invoice Preset
            </Button>
          )}
        </div>

        {showInvoiceEditor && (
          <div className="px-6 py-5 border-b border-border bg-muted/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">
                {editingInvoicePreset ? `Edit: ${editingInvoicePreset.label}` : 'New Invoice Preset'}
              </h3>
              <button onClick={() => { setShowInvoiceEditor(false); setEditingInvoicePreset(null); }} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <InvoicePresetEditor
              initial={invoiceEditorInitial}
              existingId={editingInvoicePreset?.id}
              onSave={async () => {
                setShowInvoiceEditor(false);
                setEditingInvoicePreset(null);
                showToast(editingInvoicePreset ? 'Invoice preset updated!' : 'Invoice preset saved!');
                await loadInvoicePresets();
              }}
              onCancel={() => { setShowInvoiceEditor(false); setEditingInvoicePreset(null); }}
            />
          </div>
        )}

        <div className="divide-y divide-border">
          {loadingInvoice ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invoicePresets.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-xs text-muted-foreground">No invoice presets yet. Click <strong>New Invoice Preset</strong> to set up formal invoices and quotations.</p>
            </div>
          ) : (
            invoicePresets.map((preset) => {
              const cfg = parseInvoiceConfig(preset.config);
              return (
                <div key={preset.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    {preset.isDefault ? (
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-foreground">{preset.label}</p>
                        {preset.isDefault && (
                          <span className="text-[9px] font-bold bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full">DEFAULT</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {cfg.paperWidthMm}mm paper &nbsp;·&nbsp; Title: {cfg.documentTitle || 'TAX INVOICE'} &nbsp;·&nbsp; font {cfg.fontSizeMm}mm &nbsp;·&nbsp; {cfg.storeName || 'Store Name'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => printInvoice(cfg, generateTestInvoiceData('Quotation'), `Test Quotation \u2014 ${preset.label}`)}
                      title="Test print quotation sample"
                      className="h-7 px-2 text-[10px] font-medium rounded-lg flex items-center gap-1 text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer border border-amber-500/30"
                    >
                      <TestTube className="h-3 w-3" /> Quotation
                    </button>
                    <button
                      onClick={() => printInvoice(cfg, generateTestInvoiceData('Invoice'), `Test Invoice \u2014 ${preset.label}`)}
                      title="Test print sales invoice sample"
                      className="h-7 px-2 text-[10px] font-medium rounded-lg flex items-center gap-1 text-blue-600 hover:bg-blue-500/10 transition-colors cursor-pointer border border-blue-500/30"
                    >
                      <TestTube className="h-3 w-3" /> Invoice
                    </button>
                    {!preset.isDefault && (
                      <button
                        onClick={() => handleSetDefaultInvoice(preset.id)}
                        disabled={isPending}
                        title="Set as default"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingInvoicePreset(preset); setShowInvoiceEditor(true); }}
                      title="Edit"
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {deleteInvoiceId === preset.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteInvoice(preset.id)}
                          disabled={isPending}
                          className="text-[10px] font-semibold text-red-500 hover:text-red-400 px-2 py-1 rounded cursor-pointer"
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                        </button>
                        <button onClick={() => setDeleteInvoiceId(null)} className="text-[10px] text-muted-foreground cursor-pointer">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteInvoiceId(preset.id)}
                        title="Delete"
                        className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 bg-muted/10 border-t border-border flex items-center gap-2">
          <RotateCcw className="h-3 w-3 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground">
            Built-in default: 210mm A4 Sales & Quotation Invoice · font 3.5mm · FTC Electronics
          </p>
        </div>
      </div>

    </div>
  );
}
