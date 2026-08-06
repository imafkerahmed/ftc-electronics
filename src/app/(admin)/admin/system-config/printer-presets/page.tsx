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
import { printBarcodeLabels, generateTestBarcodeItems, getBarcodeHtml } from '@/lib/barcode-print';
import { printReceipt, generateTestReceiptData, getReceiptHtml } from '@/lib/receipt-print';
import { printInvoice, generateTestInvoiceData, getInvoiceHtml } from '@/lib/invoice-print';
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
  onSave: (id?: string, silent?: boolean) => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<BarcodePrintConfig>({ ...initial });
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const saveReqIdRef = React.useRef(0);
  const initialRef = React.useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  }, [initial]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!existingId) return;

    const isSame = JSON.stringify(cfg) === JSON.stringify(initialRef.current);
    if (isSame) return;

    setSaveStatus('saving');
    setErr(null);
    const reqId = ++saveReqIdRef.current;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await saveBarcodePrintPresetAction(cfg, existingId);
        if (reqId !== saveReqIdRef.current) return;

        if (res.success) {
          setSaveStatus('saved');
          onSave(existingId, true); // silent reload
          setTimeout(() => {
            if (reqId === saveReqIdRef.current) {
              setSaveStatus('idle');
            }
          }, 2000);
        } else {
          setSaveStatus('error');
          setErr(res.error || 'Auto-save failed.');
        }
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [cfg, existingId]);

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
      if (res.success) { onSave(res.data?.id, false); }
      else { setErr(res.error || 'Save failed.'); }
    });
  };

  const [zoom, setZoom] = useState(0.85);

  const [debouncedCfg, setDebouncedCfg] = useState(cfg);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCfg(cfg), 250);
    return () => clearTimeout(t);
  }, [cfg]);

  const previewItems = React.useMemo(() => generateTestBarcodeItems(6), []);
  const previewHtml = React.useMemo(
    () => getBarcodeHtml(debouncedCfg, previewItems, true),
    [debouncedCfg, previewItems]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <form onSubmit={handleSubmit} className="lg:col-span-6 xl:col-span-5 space-y-5">
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
          <span className="font-semibold text-foreground/70">Specs: </span>
          {cfg.rollWidthMm || (cfg.labelWidthMm * cfg.columns + (cfg.gapXMm ?? cfg.gapMm) * Math.max(0, cfg.columns - 1))}mm roll &nbsp;·&nbsp; {cfg.labelWidthMm}×{cfg.labelHeightMm}mm label
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {existingId ? 'Update Preset' : 'Save Preset'}
              </Button>
              {saveStatus === 'saving' && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 animate-pulse mt-0.5"><Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500" /> Auto-saving...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> Saved</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-[10px] text-red-500 mt-0.5">Error auto-saving</span>
              )}
            </div>
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

      {/* Live Preview Pane */}
      <div className="lg:col-span-6 xl:col-span-7 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm h-[560px]">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-widest">Live Layout Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-medium">Zoom: {Math.round(zoom * 100)}%</span>
            <input
              type="range"
              min="0.4"
              max="1.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-16 accent-blue-500 h-1 bg-muted rounded-lg cursor-pointer"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/10 p-6 flex items-start justify-center">
          <div
            style={{
              width: `${(cfg.rollWidthMm || 100) * 3.78 * zoom}px`,
              minHeight: '200px',
              transition: 'width 0.1s ease-out',
            }}
            className="bg-white border border-border shadow-md rounded-lg overflow-hidden p-2 flex flex-col items-center"
          >
            <iframe
              srcDoc={previewHtml}
              style={{
                width: `${cfg.rollWidthMm || 100}mm`,
                height: `${500 / zoom}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
              className="border-none pointer-events-none"
              title="Barcode Preview Frame"
              sandbox="allow-scripts"
            />
          </div>
        </div>
      </div>
    </div>
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
  onSave: (id?: string, silent?: boolean) => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<ReceiptPrintConfig>({ ...initial });
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const saveReqIdRef = React.useRef(0);
  const initialRef = React.useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  }, [initial]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!existingId) return;

    const isSame = JSON.stringify(cfg) === JSON.stringify(initialRef.current);
    if (isSame) return;

    setSaveStatus('saving');
    setErr(null);
    const reqId = ++saveReqIdRef.current;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await saveReceiptPrintPresetAction(cfg, existingId);
        if (reqId !== saveReqIdRef.current) return;

        if (res.success) {
          setSaveStatus('saved');
          onSave(existingId, true); // silent reload
          setTimeout(() => {
            if (reqId === saveReqIdRef.current) {
              setSaveStatus('idle');
            }
          }, 2000);
        } else {
          setSaveStatus('error');
          setErr(res.error || 'Auto-save failed.');
        }
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [cfg, existingId]);

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
      if (res.success) { onSave(res.data?.id, false); }
      else { setErr(res.error || 'Save failed.'); }
    });
  };

  const [zoom, setZoom] = useState(0.85);

  const [debouncedCfg, setDebouncedCfg] = useState(cfg);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCfg(cfg), 250);
    return () => clearTimeout(t);
  }, [cfg]);

  const previewData = React.useMemo(() => generateTestReceiptData(), []);
  const previewHtml = React.useMemo(
    () => getReceiptHtml(debouncedCfg, previewData, true),
    [debouncedCfg, previewData]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <form onSubmit={handleSubmit} className="lg:col-span-6 xl:col-span-5 space-y-5">
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
          <span className="font-semibold text-foreground/70">Receipt Specs: </span>
          {cfg.paperWidthMm}mm paper &nbsp;·&nbsp; font {cfg.fontSizeMm}mm
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {existingId ? 'Update Preset' : 'Save Preset'}
              </Button>
              {saveStatus === 'saving' && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 animate-pulse mt-0.5"><Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500" /> Auto-saving...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> Saved</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-[10px] text-red-500 mt-0.5">Error auto-saving</span>
              )}
            </div>
            <Button type="button" variant="outline" onClick={onCancel} className="text-xs h-8 px-4 cursor-pointer">Cancel</Button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => printReceipt(cfg, generateTestReceiptData(), `Test Receipt \u2014 ${cfg.label || 'Thermal'}`)}
            className="text-xs h-8 px-3 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 flex items-center gap-1.5 cursor-pointer font-medium"
            title="Print a test sample receipt to verify paper alignment and margins on thermal printer"
          >
            <TestTube className="h-3.5 w-3.5" /> Test Print
          </Button>
        </div>
      </form>

      {/* Live Preview Pane */}
      <div className="lg:col-span-6 xl:col-span-7 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm h-[640px]">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-widest">Live Layout Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-medium">Zoom: {Math.round(zoom * 100)}%</span>
            <input
              type="range"
              min="0.4"
              max="1.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-16 accent-blue-500 h-1 bg-muted rounded-lg cursor-pointer"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/10 p-6 flex items-start justify-center">
          <div
            style={{
              width: `${(cfg.paperWidthMm || 80) * 3.78 * zoom}px`,
              minHeight: '300px',
              transition: 'width 0.1s ease-out',
            }}
            className="bg-white border border-border shadow-md rounded-lg overflow-hidden p-2 flex flex-col items-center"
          >
            <iframe
              srcDoc={previewHtml}
              style={{
                width: `${cfg.paperWidthMm || 80}mm`,
                height: `${580 / zoom}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
              className="border-none pointer-events-none"
              title="Receipt Preview Frame"
              sandbox="allow-scripts"
            />
          </div>
        </div>
      </div>
    </div>
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
  onSave: (id?: string, silent?: boolean) => void;
  onCancel: () => void;
}) {
  const [cfg, setCfg] = useState<InvoicePrintConfig>({ ...initial });
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const saveReqIdRef = React.useRef(0);
  const initialRef = React.useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
  }, [initial]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!existingId) return;

    const isSame = JSON.stringify(cfg) === JSON.stringify(initialRef.current);
    if (isSame) return;

    setSaveStatus('saving');
    setErr(null);
    const reqId = ++saveReqIdRef.current;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await saveInvoicePrintPresetAction(cfg, existingId);
        if (reqId !== saveReqIdRef.current) return;

        if (res.success) {
          setSaveStatus('saved');
          onSave(existingId, true); // silent reload
          setTimeout(() => {
            if (reqId === saveReqIdRef.current) {
              setSaveStatus('idle');
            }
          }, 2000);
        } else {
          setSaveStatus('error');
          setErr(res.error || 'Auto-save failed.');
        }
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [cfg, existingId]);

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
      if (res.success) { onSave(res.data?.id, false); }
      else { setErr(res.error || 'Save failed.'); }
    });
  };

  const [zoom, setZoom] = useState(0.65);

  const [debouncedCfg, setDebouncedCfg] = useState(cfg);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCfg(cfg), 250);
    return () => clearTimeout(t);
  }, [cfg]);

  const previewData = React.useMemo(() => generateTestInvoiceData('Invoice'), []);
  const previewHtml = React.useMemo(
    () => getInvoiceHtml(debouncedCfg, previewData, true),
    [debouncedCfg, previewData]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <form onSubmit={handleSubmit} className="lg:col-span-6 xl:col-span-5 space-y-5">
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
          <span className="font-semibold text-foreground/70">Invoice Specs: </span>
          {cfg.paperWidthMm}mm paper &nbsp;·&nbsp; font {cfg.fontSizeMm}mm
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {existingId ? 'Update Preset' : 'Save Preset'}
              </Button>
              {saveStatus === 'saving' && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 animate-pulse mt-0.5"><Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500" /> Auto-saving...</span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5"><CheckCircle2 className="h-2.5 w-2.5" /> Saved</span>
              )}
              {saveStatus === 'error' && (
                <span className="text-[10px] text-red-500 mt-0.5">Error auto-saving</span>
              )}
            </div>
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
              <TestTube className="h-3.5 w-3.5" /> Test Quo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => printInvoice(cfg, generateTestInvoiceData('Invoice'), `Test Invoice \u2014 ${cfg.label || 'Invoice'}`)}
              className="text-xs h-8 px-2.5 border-blue-500/40 text-blue-600 hover:bg-blue-500/10 flex items-center gap-1 cursor-pointer font-medium"
              title="Print test sales invoice sample"
            >
              <TestTube className="h-3.5 w-3.5" /> Test Inv
            </Button>
          </div>
        </div>
      </form>

      {/* Live Preview Pane */}
      <div className="lg:col-span-6 xl:col-span-7 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm h-[700px]">
        <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-widest">Live Layout Preview</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-medium">Zoom: {Math.round(zoom * 100)}%</span>
            <input
              type="range"
              min="0.3"
              max="1.2"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-16 accent-blue-500 h-1 bg-muted rounded-lg cursor-pointer"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/10 p-6 flex items-start justify-center">
          <div
            style={{
              width: `${(cfg.paperWidthMm || 210) * 3.78 * zoom}px`,
              minHeight: '400px',
              transition: 'width 0.1s ease-out',
            }}
            className="bg-white border border-border shadow-md rounded-lg overflow-hidden p-2 flex flex-col items-center"
          >
            <iframe
              srcDoc={previewHtml}
              style={{
                width: `${cfg.paperWidthMm || 210}mm`,
                height: `${640 / zoom}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
              className="border-none pointer-events-none"
              title="Invoice Preview Frame"
              sandbox="allow-scripts"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Printer Presets Page ─────────────────────────────────────────────────

export default function PrinterPresetsPage() {
  const [activeTab, setActiveTab] = useState<'barcode' | 'receipt' | 'invoice'>('barcode');

  // Lists, loading, selection, and delete states
  const [barcodePresets, setBarcodePresets] = useState<PBPreset[]>([]);
  const [loadingBarcode, setLoadingBarcode] = useState(true);
  const [selectedBarcodeId, setSelectedBarcodeId] = useState<string>('');
  const [deleteBarcodeId, setDeleteBarcodeId] = useState<string | null>(null);

  const [receiptPresets, setReceiptPresets] = useState<PBPreset[]>([]);
  const [loadingReceipt, setLoadingReceipt] = useState(true);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>('');
  const [deleteReceiptId, setDeleteReceiptId] = useState<string | null>(null);

  const [invoicePresets, setInvoicePresets] = useState<PBPreset[]>([]);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadBarcodePresets = async (selectId?: string) => {
    setLoadingBarcode(true);
    const res = await getBarcodePrintPresetsAction();
    if (res.success) {
      const data = res.data as PBPreset[];
      setBarcodePresets(data);
      if (selectId) {
        setSelectedBarcodeId(selectId);
      } else if (data.length > 0) {
        const def = data.find((p) => p.isDefault) || data[0];
        setSelectedBarcodeId(def.id);
      } else {
        setSelectedBarcodeId('new');
      }
    } else {
      showToast(res.error || 'Failed to load barcode presets.', 'error');
    }
    setLoadingBarcode(false);
  };

  const loadReceiptPresets = async (selectId?: string) => {
    setLoadingReceipt(true);
    const res = await getReceiptPrintPresetsAction();
    if (res.success) {
      const data = res.data as PBPreset[];
      setReceiptPresets(data);
      if (selectId) {
        setSelectedReceiptId(selectId);
      } else if (data.length > 0) {
        const def = data.find((p) => p.isDefault) || data[0];
        setSelectedReceiptId(def.id);
      } else {
        setSelectedReceiptId('new');
      }
    } else {
      showToast(res.error || 'Failed to load receipt presets.', 'error');
    }
    setLoadingReceipt(false);
  };

  const loadInvoicePresets = async (selectId?: string) => {
    setLoadingInvoice(true);
    const res = await getInvoicePrintPresetsAction();
    if (res.success) {
      const data = res.data as PBPreset[];
      setInvoicePresets(data);
      if (selectId) {
        setSelectedInvoiceId(selectId);
      } else if (data.length > 0) {
        const def = data.find((p) => p.isDefault) || data[0];
        setSelectedInvoiceId(def.id);
      } else {
        setSelectedInvoiceId('new');
      }
    } else {
      showToast(res.error || 'Failed to load invoice presets.', 'error');
    }
    setLoadingInvoice(false);
  };

  // Initial load on mount for initial active tab
  useEffect(() => {
    void loadBarcodePresets();
  }, []);

  // Lazy load non-active tab collections when user opens them
  useEffect(() => {
    if (activeTab === 'receipt' && receiptPresets.length === 0 && loadingReceipt) {
      void loadReceiptPresets();
    } else if (activeTab === 'invoice' && invoicePresets.length === 0 && loadingInvoice) {
      void loadInvoicePresets();
    }
  }, [activeTab, receiptPresets.length, loadingReceipt, invoicePresets.length, loadingInvoice]);

  // Barcode Handlers
  const handleDeleteBarcode = (id: string) => {
    startTransition(async () => {
      const res = await deleteBarcodePrintPresetAction(id);
      if (res.success) {
        showToast('Barcode preset deleted.');
        setDeleteBarcodeId(null);
        await loadBarcodePresets();
      } else {
        showToast(res.error || 'Delete failed.', 'error');
      }
    });
  };

  const handleSetDefaultBarcode = (id: string) => {
    startTransition(async () => {
      const res = await setDefaultBarcodePrintPresetAction(id);
      if (res.success) {
        showToast('Default barcode preset updated.');
        await loadBarcodePresets(id);
      } else {
        showToast(res.error || 'Failed.', 'error');
      }
    });
  };

  const handleCancelBarcode = () => {
    const def = barcodePresets.find((p) => p.isDefault) || barcodePresets[0];
    if (def) {
      setSelectedBarcodeId(def.id);
    } else {
      setSelectedBarcodeId('new');
    }
  };

  // Receipt Handlers
  const handleDeleteReceipt = (id: string) => {
    startTransition(async () => {
      const res = await deleteReceiptPrintPresetAction(id);
      if (res.success) {
        showToast('Receipt preset deleted.');
        setDeleteReceiptId(null);
        await loadReceiptPresets();
      } else {
        showToast(res.error || 'Delete failed.', 'error');
      }
    });
  };

  const handleSetDefaultReceipt = (id: string) => {
    startTransition(async () => {
      const res = await setDefaultReceiptPrintPresetAction(id);
      if (res.success) {
        showToast('Default receipt preset updated.');
        await loadReceiptPresets(id);
      } else {
        showToast(res.error || 'Failed.', 'error');
      }
    });
  };

  const handleCancelReceipt = () => {
    const def = receiptPresets.find((p) => p.isDefault) || receiptPresets[0];
    if (def) {
      setSelectedReceiptId(def.id);
    } else {
      setSelectedReceiptId('new');
    }
  };

  // Invoice Handlers
  const handleDeleteInvoice = (id: string) => {
    startTransition(async () => {
      const res = await deleteInvoicePrintPresetAction(id);
      if (res.success) {
        showToast('Invoice preset deleted.');
        setDeleteInvoiceId(null);
        await loadInvoicePresets();
      } else {
        showToast(res.error || 'Delete failed.', 'error');
      }
    });
  };

  const handleSetDefaultInvoice = (id: string) => {
    startTransition(async () => {
      const res = await setDefaultInvoicePrintPresetAction(id);
      if (res.success) {
        showToast('Default invoice preset updated.');
        await loadInvoicePresets(id);
      } else {
        showToast(res.error || 'Failed.', 'error');
      }
    });
  };

  const handleCancelInvoice = () => {
    const def = invoicePresets.find((p) => p.isDefault) || invoicePresets[0];
    if (def) {
      setSelectedInvoiceId(def.id);
    } else {
      setSelectedInvoiceId('new');
    }
  };

  // Resolve initial config for active preset in each category
  const activeBarcodePreset = barcodePresets.find((p) => p.id === selectedBarcodeId);
  const barcodeEditorInitial: BarcodePrintConfig = activeBarcodePreset
    ? parseBarcodeConfig(activeBarcodePreset.config)
    : { ...DEFAULT_BARCODE_CONFIG, isDefault: barcodePresets.length === 0 };

  const activeReceiptPreset = receiptPresets.find((p) => p.id === selectedReceiptId);
  const receiptEditorInitial: ReceiptPrintConfig = activeReceiptPreset
    ? parseReceiptConfig(activeReceiptPreset.config)
    : { ...DEFAULT_RECEIPT_CONFIG, isDefault: receiptPresets.length === 0 };

  const activeInvoicePreset = invoicePresets.find((p) => p.id === selectedInvoiceId);
  const invoiceEditorInitial: InvoicePrintConfig = activeInvoicePreset
    ? parseInvoiceConfig(activeInvoicePreset.config)
    : { ...DEFAULT_INVOICE_CONFIG, isDefault: invoicePresets.length === 0 };

  return (
    <div className="space-y-6 text-foreground pb-12">
      {/* Header */}
      <div className="border-b border-border pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/admin/system-config" className="hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> System Config
            </Link>
          </div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2.5">
            <Printer className="h-6 w-6 text-blue-500" />
            Printer &amp; Print Presets
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure custom layouts, paper dimensions, typography, and default presets for Barcode Labels, POS Thermal Receipts, and A4 Sales Invoices.
          </p>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-red-600 text-white border-red-500'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex items-center gap-2 border-b border-border pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('barcode')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'barcode' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Printer className="h-4 w-4" />
          Barcode Labels
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('receipt')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'receipt' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="h-4 w-4" />
          POS Receipts
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('invoice')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'invoice' ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileText className="h-4 w-4" />
          Invoices &amp; Quotations
        </button>
      </div>

      {/* active tab configuration content */}
      <div className="space-y-6">
        
        {/* BARCODE PRESETS TAB */}
        <div className={activeTab === 'barcode' ? 'space-y-6' : 'hidden'}>
          {/* Control selector bar */}
          <div className="flex flex-wrap items-center gap-4 bg-muted/20 border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 min-w-[200px]">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Format:</span>
              <select
                value={selectedBarcodeId}
                onChange={(e) => setSelectedBarcodeId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background text-xs px-2.5 font-bold cursor-pointer max-w-[220px] truncate"
              >
                <option value="new">+ Create New Preset</option>
                {barcodePresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedBarcodeId !== 'new' && (
              <div className="flex items-center gap-2">
                {activeBarcodePreset?.isDefault ? (
                  <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 px-2 py-1 rounded-full flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" /> Default Format
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetDefaultBarcode(selectedBarcodeId)}
                    disabled={isPending}
                    className="h-8 px-3 rounded-lg border border-border bg-background hover:bg-muted text-amber-500 hover:text-amber-600 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Set Default
                  </button>
                )}

                {deleteBarcodeId === selectedBarcodeId ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDeleteBarcode(selectedBarcodeId)}
                      disabled={isPending}
                      className="h-8 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold flex items-center justify-center cursor-pointer min-w-[70px]"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setDeleteBarcodeId(null)}
                      className="h-8 px-3 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteBarcodeId(selectedBarcodeId)}
                    className="h-8 px-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Config & Preview workspace */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-6">
            <BarcodePresetEditor
              key={selectedBarcodeId}
              initial={barcodeEditorInitial}
              existingId={selectedBarcodeId === 'new' ? undefined : selectedBarcodeId}
              onSave={async (id, silent) => {
                if (!silent) {
                  showToast(selectedBarcodeId === 'new' ? 'Barcode preset saved!' : 'Barcode preset updated!');
                }
                await loadBarcodePresets(id);
              }}
              onCancel={handleCancelBarcode}
            />
          </div>
        </div>

        {/* POS RECEIPTS TAB */}
        <div className={activeTab === 'receipt' ? 'space-y-6' : 'hidden'}>
          {/* Control selector bar */}
          <div className="flex flex-wrap items-center gap-4 bg-muted/20 border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 min-w-[200px]">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Format:</span>
              <select
                value={selectedReceiptId}
                onChange={(e) => setSelectedReceiptId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background text-xs px-2.5 font-bold cursor-pointer max-w-[220px] truncate"
              >
                <option value="new">+ Create New Preset</option>
                {receiptPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedReceiptId !== 'new' && (
              <div className="flex items-center gap-2">
                {activeReceiptPreset?.isDefault ? (
                  <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 px-2 py-1 rounded-full flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" /> Default Format
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetDefaultReceipt(selectedReceiptId)}
                    disabled={isPending}
                    className="h-8 px-3 rounded-lg border border-border bg-background hover:bg-muted text-amber-500 hover:text-amber-600 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Set Default
                  </button>
                )}

                {deleteReceiptId === selectedReceiptId ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDeleteReceipt(selectedReceiptId)}
                      disabled={isPending}
                      className="h-8 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold flex items-center justify-center cursor-pointer min-w-[70px]"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setDeleteReceiptId(null)}
                      className="h-8 px-3 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteReceiptId(selectedReceiptId)}
                    className="h-8 px-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Config & Preview workspace */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-6">
            <ReceiptPresetEditor
              key={selectedReceiptId}
              initial={receiptEditorInitial}
              existingId={selectedReceiptId === 'new' ? undefined : selectedReceiptId}
              onSave={async (id, silent) => {
                if (!silent) {
                  showToast(selectedReceiptId === 'new' ? 'Receipt preset saved!' : 'Receipt preset updated!');
                }
                await loadReceiptPresets(id);
              }}
              onCancel={handleCancelReceipt}
            />
          </div>
        </div>

        {/* INVOICES & QUOTATIONS TAB */}
        <div className={activeTab === 'invoice' ? 'space-y-6' : 'hidden'}>
          {/* Control selector bar */}
          <div className="flex flex-wrap items-center gap-4 bg-muted/20 border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 min-w-[200px]">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Format:</span>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background text-xs px-2.5 font-bold cursor-pointer max-w-[220px] truncate"
              >
                <option value="new">+ Create New Preset</option>
                {invoicePresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} {p.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedInvoiceId !== 'new' && (
              <div className="flex items-center gap-2">
                {activeInvoicePreset?.isDefault ? (
                  <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 px-2 py-1 rounded-full flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" /> Default Format
                  </span>
                ) : (
                  <button
                    onClick={() => handleSetDefaultInvoice(selectedInvoiceId)}
                    disabled={isPending}
                    className="h-8 px-3 rounded-lg border border-border bg-background hover:bg-muted text-amber-500 hover:text-amber-600 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Set Default
                  </button>
                )}

                {deleteInvoiceId === selectedInvoiceId ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDeleteInvoice(selectedInvoiceId)}
                      disabled={isPending}
                      className="h-8 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold flex items-center justify-center cursor-pointer min-w-[70px]"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setDeleteInvoiceId(null)}
                      className="h-8 px-3 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteInvoiceId(selectedInvoiceId)}
                    className="h-8 px-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Config & Preview workspace */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-6">
            <InvoicePresetEditor
              key={selectedInvoiceId}
              initial={invoiceEditorInitial}
              existingId={selectedInvoiceId === 'new' ? undefined : selectedInvoiceId}
              onSave={async (id, silent) => {
                if (!silent) {
                  showToast(selectedInvoiceId === 'new' ? 'Invoice preset saved!' : 'Invoice preset updated!');
                }
                await loadInvoicePresets(id);
              }}
              onCancel={handleCancelInvoice}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
