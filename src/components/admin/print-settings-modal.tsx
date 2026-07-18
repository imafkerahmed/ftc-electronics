'use client';

import React, { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import {
  Printer,
  Save,
  Star,
  Loader2,
  X,
  ChevronDown,
  SlidersHorizontal,
  TestTube,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_BARCODE_CONFIG, normalizeBarcodeConfig, type BarcodePrintConfig } from '@/types/barcode-config';
import { printBarcodeLabels, generateTestBarcodeItems } from '@/lib/barcode-print';
import {
  getBarcodePrintPresetsAction,
  saveBarcodePrintPresetAction,
} from '@/app/actions/admin';

interface PrintSettingsModalProps {
  onClose: () => void;
  onPrint: (config: BarcodePrintConfig) => void;
  unitCount: number;
}

interface PBPreset {
  id: string;
  label: string;
  config: string; // JSON string
  isDefault: boolean;
}

export default function PrintSettingsModal({ onClose, onPrint, unitCount }: PrintSettingsModalProps) {
  const [presets, setPresets] = useState<PBPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('__default__');
  const [config, setConfig] = useState<BarcodePrintConfig>({ ...DEFAULT_BARCODE_CONFIG });
  const [showCustomOptions, setShowCustomOptions] = useState(false);

  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const scrollBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadPresets();
  }, []);

  // Intercept wheel events on the backdrop and redirect them to the modal body.
  // This prevents the background page from scrolling when using a trackpad.
  const handleBackdropWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop += e.deltaY;
    }
  }, []);

  const loadPresets = async () => {
    setLoadingPresets(true);
    const res = await getBarcodePrintPresetsAction();
    if (res.success && res.data) {
      const list = res.data as PBPreset[];
      setPresets(list);
      const def = list.find((p) => p.isDefault);
      if (def) {
        setSelectedPresetId(def.id);
        setConfig(normalizeBarcodeConfig(def.config));
      }
    }
    setLoadingPresets(false);
  };

  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    if (id === '__default__') {
      setConfig({ ...DEFAULT_BARCODE_CONFIG });
      return;
    }
    const preset = presets.find((p) => p.id === id);
    if (preset) {
      setConfig(normalizeBarcodeConfig(preset.config));
    }
  };

  const handleSavePreset = () => {
    if (!saveAsName.trim()) return;
    setSaveMsg(null);
    startTransition(async () => {
      const res = await saveBarcodePrintPresetAction({
        ...config,
        label: saveAsName.trim(),
        isDefault: saveAsDefault,
      });
      if (res.success) {
        setSaveMsg('Preset saved!');
        setShowSaveAs(false);
        setSaveAsName('');
        await loadPresets();
      } else {
        setSaveMsg(res.error || 'Save failed.');
      }
    });
  };

  function set<K extends keyof BarcodePrintConfig>(key: K, val: BarcodePrintConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }

  const numInput = (
    label: string,
    key: keyof BarcodePrintConfig,
    min: number,
    max: number,
    step: number | string = 'any',
    unit = ''
  ) => {
    const rawVal = config[key] as number;
    const displayVal = Number.isNaN(rawVal) || rawVal === undefined ? '' : rawVal;
    return (
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {label}{unit && <span className="ml-1 text-muted-foreground/60 normal-case">({unit})</span>}
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
    <label className="flex items-center gap-2 cursor-pointer group">
      <div
        onClick={() => set(key, !config[key] as BarcodePrintConfig[typeof key])}
        className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${
          config[key] ? 'bg-blue-600' : 'bg-muted'
        }`}
      >
        <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform duration-200 shadow ${
          config[key] ? 'translate-x-4.5' : 'translate-x-0.5'
        }`} />
      </div>
      <span className="text-xs text-foreground/80">{label}</span>
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onWheel={handleBackdropWheel}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] min-h-0 overflow-hidden my-auto">

        {/* Header (fixed at top of modal) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Printer className="h-4 w-4 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Print Barcode Labels</h2>
              <p className="text-[10px] text-muted-foreground">{unitCount} available unit label{unitCount !== 1 ? 's' : ''} ready to print</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div ref={scrollBodyRef} className="overflow-y-auto flex-1 min-h-0 p-6 space-y-5">

          {/* Preset Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Select Printing Preset
            </label>
            <div className="relative">
              <select
                value={selectedPresetId}
                onChange={(e) => handleSelectPreset(e.target.value)}
                disabled={loadingPresets}
                className="w-full h-10 rounded-xl border border-border bg-background text-xs font-semibold px-3.5 pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="__default__">Built-in Default (60×35mm · 3 Cols)</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}{p.isDefault ? ' ★ (Default)' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-3.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Preset Specs Card */}
          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-500" /> Layout Summary
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">
                {config.columns} Column{config.columns !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 block">Roll Width</span>
                <span className="font-semibold text-foreground">{config.rollWidthMm || (config.labelWidthMm * config.columns + (config.gapXMm ?? config.gapMm) * Math.max(0, config.columns - 1))}mm</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 block">Label Size</span>
                <span className="font-semibold text-foreground">{config.labelWidthMm}mm × {config.labelHeightMm}mm</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 block">Gaps (H × V)</span>
                <span className="font-semibold text-foreground">{config.gapXMm ?? config.gapMm}mm × {config.gapYMm ?? config.gapMm}mm</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 block">Side Margin</span>
                <span className="font-semibold text-foreground">{config.marginMm || 0}mm</span>
              </div>
            </div>

            {/* Field Badges */}
            <div className="pt-2 border-t border-border/60 flex flex-wrap gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground/70 self-center mr-1">Visible:</span>
              {config.showProductName && <span className="bg-blue-500/10 text-blue-600 text-[10px] font-semibold px-2 py-0.5 rounded-md">Product Name</span>}
              {config.showSerial && <span className="bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold px-2 py-0.5 rounded-md">Serial</span>}
              {config.showBatch && <span className="bg-purple-500/10 text-purple-600 text-[10px] font-semibold px-2 py-0.5 rounded-md">Batch</span>}
              {config.showPrice && <span className="bg-amber-500/10 text-amber-600 text-[10px] font-semibold px-2 py-0.5 rounded-md">Price</span>}
            </div>
          </div>

          {/* Customize Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowCustomOptions(!showCustomOptions)}
              className="text-xs text-blue-600 hover:text-blue-500 font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showCustomOptions ? 'Hide Custom Options' : 'Customize / Override Dimensions'}
            </button>
          </div>

          {/* Collapsible Custom Controls */}
          {showCustomOptions && (
            <div className="space-y-4 border-t border-border pt-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Label Roll Dimensions</p>
                  {numInput('Printer Roll Width', 'rollWidthMm', 10, 300, 'any', 'mm')}
                  {numInput('Label Width', 'labelWidthMm', 1, 300, 'any', 'mm')}
                  {numInput('Label Height', 'labelHeightMm', 1, 300, 'any', 'mm')}
                  {numInput('Horizontal Gap (Columns)', 'gapXMm', 0, 50, 'any', 'mm')}
                  {numInput('Vertical Gap (Rows)', 'gapYMm', 0, 50, 'any', 'mm')}
                  {numInput('Side Margin (Edges)', 'marginMm', 0, 50, 'any', 'mm')}
                  {numInput('Columns per row', 'columns', 1, 20, 1)}
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Barcode & Text Settings</p>
                  {numInput('Bar width', 'barWidthMm', 0.1, 10, 'any', 'mm')}
                  {numInput('Bar height', 'barHeightMm', 0.5, 100, 'any', 'mm')}
                  {numInput('Text font size', 'fontSizeMm', 0.5, 20, 'any', 'mm')}
                  {numInput('Price font size', 'priceFontSizeMm', 0.5, 20, 'any', 'mm')}
                </div>
              </div>

              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Visible Text Fields</p>
                <div className="grid grid-cols-2 gap-2">
                  {toggle('showProductName', 'Product Name')}
                  {toggle('showSerial', 'Serial Number')}
                  {toggle('showBatch', 'Batch Number')}
                  {toggle('showPrice', 'Price')}
                </div>
              </div>

              {/* Save preset inline */}
              <div className="border-t border-border pt-3">
                {!showSaveAs ? (
                  <button
                    onClick={() => setShowSaveAs(true)}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-500 font-semibold cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> Save these settings as a new preset
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preset Name</label>
                    <Input
                      value={saveAsName}
                      onChange={(e) => setSaveAsName(e.target.value)}
                      placeholder='e.g. "Dymo Small" or "Custom A4"'
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground/80">
                      <input
                        type="checkbox"
                        checked={saveAsDefault}
                        onChange={(e) => setSaveAsDefault(e.target.checked)}
                        className="rounded"
                      />
                      <Star className="h-3 w-3 text-amber-500" /> Set as default preset
                    </label>
                    {saveMsg && (
                      <p className={`text-[10px] ${saveMsg.includes('saved') ? 'text-emerald-500' : 'text-red-500'}`}>
                        {saveMsg}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSavePreset}
                        disabled={isPending || !saveAsName.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-3 cursor-pointer"
                      >
                        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        &nbsp;Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setShowSaveAs(false); setSaveAsName(''); setSaveMsg(null); }}
                        className="text-xs h-7 px-3 cursor-pointer"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between shrink-0 gap-3">
          <p className="text-[10px] text-muted-foreground">
            Manage presets in{' '}
            <a href="/admin/system-config/printer-presets" target="_blank" className="text-blue-500 hover:underline">
              System Configurations
            </a>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => printBarcodeLabels(config, generateTestBarcodeItems(6), 'Test Barcode Alignment')}
              className="text-xs h-8 px-3 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 flex items-center gap-1.5 cursor-pointer font-medium"
              title="Print 6 test labels with sample data to check alignment on physical paper"
            >
              <TestTube className="h-3.5 w-3.5" /> Test Print
            </Button>
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8 px-4 cursor-pointer">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => onPrint(config)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-4 flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" /> Print {unitCount} Label{unitCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
