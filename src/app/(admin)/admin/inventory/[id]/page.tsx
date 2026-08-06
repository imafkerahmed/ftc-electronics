'use client';

import React, { useState, useEffect, useTransition, use, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  QrCode,
  Download,
  Printer,
  Plus,
  Package,
  Boxes,
  Loader2,
  CheckCircle,
  AlertCircle,
  Calendar,
  Building2,
  DollarSign,
  FileText,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { pbProducts, type PBStockPurchase, type PBStockManagementUnit } from '@/lib/pb-collections';
import { pbProductToProduct } from '@/types/admin';
import type { Product } from '@/types/product';
import type { BarcodePrintConfig } from '@/types/barcode-config';
import { printBarcodeLabels } from '@/lib/barcode-print';
import {
  createStockPurchaseAction,
  generateBatchBarcodesAction,
  updateStockUnitStatusAction,
  getStockPurchasesAction,
  getStockManagementUnitsAction,
  getProductSalesHistoryAction,
  type ProductSaleRecord,
} from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PrintSettingsModal from '@/components/admin/print-settings-modal';

export default function ProductStockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [purchases, setPurchases] = useState<PBStockPurchase[]>([]);
  const [stockUnits, setStockUnits] = useState<PBStockManagementUnit[]>([]);
  const [salesHistory, setSalesHistory] = useState<ProductSaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Alert Feedback
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // QR Code options
  const [qrMode, setQrMode] = useState<'id' | 'url' | 'sku'>('id');
  const [selectedUnitBarcode, setSelectedUnitBarcode] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  // Stock Purchase Form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [notes, setNotes] = useState('');

  // Print settings
  const [showPrintSettings, setShowPrintSettings] = useState(false);

  // Individual Stock Unit Form state (kept for legacy; modal removed)
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [unitBarcode, setUnitBarcode] = useState('');
  const [unitSerial, setUnitSerial] = useState('');
  const [unitBatch, setUnitBatch] = useState('');
  const [unitNotes, setUnitNotes] = useState('');

  const refetchData = React.useCallback(async () => {
    try {
      setLoading(true);
      const rawProd = await pbProducts.getById(id);
      if (rawProd) {
        const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
        setProduct(pbProductToProduct(rawProd, pbUrl));
      } else {
        setError('Product not found.');
      }

      const [purchasesRes, unitsRes, salesRes] = await Promise.all([
        getStockPurchasesAction(id),
        getStockManagementUnitsAction(id),
        getProductSalesHistoryAction(id),
      ]);

      if (purchasesRes.data && Array.isArray(purchasesRes.data)) {
        setPurchases(purchasesRes.data as PBStockPurchase[]);
      }
      if (unitsRes.data && Array.isArray(unitsRes.data)) {
        setStockUnits(unitsRes.data as PBStockManagementUnit[]);
      }
      if (salesRes.success && Array.isArray(salesRes.sales)) {
        setSalesHistory(salesRes.sales);
      }
    } catch (err: any) {
      console.error('Failed to load product stock details:', err);
      setError('Error loading product stock information.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetchData();
    // Auto-generate batch number with today's added date
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    setBatchNumber(`BATCH-${dateStr}`);
  }, [id, refetchData]);

  // When modal opens, pre-fill unit cost from product price
  useEffect(() => {
    if (showAddModal && product) {
      setUnitCost(String(product.price));
    }
  }, [showAddModal, product]);

  const handleAddPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const rawQty = Number(quantity);
    const newCost = Number(unitCost);
    if (!batchNumber || !quantity || rawQty <= 0) {
      setError('Please provide a valid Batch Number and Stock Count.');
      return;
    }

    startTransition(async () => {
      const res = await createStockPurchaseAction({
        productId: id,
        batchNumber,
        quantity: rawQty,
        unitCost: newCost || product?.price || 0,
        supplier: 'Official Supplier',
        purchaseDate: new Date().toISOString().split('T')[0],
        notes: notes || 'Stock batch added',
        newCost: newCost,
        oldPrice: product?.price,
      });

      if (res.success) {
        setSuccess(`Successfully added ${rawQty} units to stock with batch ${batchNumber}.`);
        setShowAddModal(false);
        setQuantity('');
        setNotes('');
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        setBatchNumber(`BATCH-${dateStr}`);
        refetchData();
      } else {
        setError(res.error || 'Failed to add stock batch.');
      }
    });
  };

  const [unitCount, setUnitCount] = useState<string>('');
  const [printTarget, setPrintTarget] = useState<'barcodes' | 'qr'>('barcodes');

  const getQrValue = () => {
    if (selectedUnitBarcode) return selectedUnitBarcode;
    if (!product) return id;
    if (qrMode === 'url') {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      return `${baseUrl}/products/${product.slug}`;
    }
    if (qrMode === 'sku') {
      return `SKU-${product.id.toUpperCase()}`;
    }
    return product.id;
  };

  const handleDownloadQr = () => {
    if (!qrRef.current) return;
    const svgElement = qrRef.current.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new window.Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 80;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(product?.name || 'Stock Item', canvas.width / 2, canvas.height - 35);

        ctx.fillStyle = '#666666';
        ctx.font = '10px monospace';
        ctx.fillText(id, canvas.width / 2, canvas.height - 18);
      }

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `QR-${product?.slug || id}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleAddStockUnit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const countToGenerate = Math.max(1, Number(unitCount) || (product?.countInStock || 1));

    startTransition(async () => {
      const batchNo = `PO-${Date.now().toString().slice(-6)}`;
      const res = await generateBatchBarcodesAction(id, countToGenerate, batchNo);

      if (res.success) {
        setSuccess(`Successfully generated ${res.count || countToGenerate} stock unit barcodes for available stock.`);
        setShowAddUnitModal(false);
        refetchData();
      } else {
        setError(res.error || 'Failed to generate stock unit barcodes.');
      }
    });
  };

  const handleStatusChange = (unitId: string, newStatus: 'available' | 'reserved' | 'sold' | 'defective' | 'returned') => {
    startTransition(async () => {
      const res = await updateStockUnitStatusAction(unitId, id, newStatus);
      if (res.success) {
        setSuccess(`Stock unit status updated to ${newStatus}.`);
        refetchData();
      } else {
        setError(res.error || 'Failed to update unit status.');
      }
    });
  };

  const handlePrintBarcodes = (cfg: BarcodePrintConfig) => {
    if (printTarget === 'qr') {
      const qrValue = getQrValue();
      const availableUnits = stockUnits.filter((u) => u.status === 'available');
      const items = availableUnits.length > 0
        ? availableUnits.map((u) => ({
            barcode: u.barcode,
            qrPayload: qrValue,
            isQr: true,
            productName: product?.name,
            serialNumber: u.serialNumber,
            batchNumber: u.batchNumber,
            price: product?.price,
            currency: product?.currency,
          }))
        : [{
            barcode: qrValue,
            qrPayload: qrValue,
            isQr: true,
            productName: product?.name,
            price: product?.price,
            currency: product?.currency,
          }];
      printBarcodeLabels(cfg, items, `Print QR Labels \u2014 ${product?.name || 'Stock Item'}`);
      setShowPrintSettings(false);
      return;
    }

    const availableUnits = stockUnits.filter((u) => u.status === 'available');
    if (availableUnits.length === 0) {
      setError('No available stock units to print. Add stocks first.');
      return;
    }

    const items = availableUnits.map((u) => ({
      barcode: u.barcode,
      productName: product?.name,
      serialNumber: u.serialNumber,
      batchNumber: u.batchNumber,
      price: product?.price,
      currency: product?.currency,
    }));

    printBarcodeLabels(cfg, items, `Print Barcodes \u2014 ${product?.name || 'Stock Item'}`);
    setShowPrintSettings(false);
  };

  const handlePrintQr = () => {
    setPrintTarget('qr');
    setShowPrintSettings(true);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="text-xs">Loading product stock details...</span>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <Link href="/admin/inventory" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Stock Management
        </Link>
        <div className="p-8 text-center bg-card border border-border rounded-xl">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-foreground">Product Not Found</h2>
          <p className="text-xs text-muted-foreground mt-1">The requested product ID does not exist.</p>
        </div>
      </div>
    );
  }

  const getStockBadge = (count: number) => {
    if (count === 0) return { label: 'Out of Stock', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
    if (count <= 10) return { label: 'Low Stock', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    return { label: 'In Stock', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
  };

  const status = getStockBadge(product.countInStock);
  const totalPurchasedQty = purchases.reduce((sum, p) => sum + p.quantity, 0);
  const totalPurchasedCost = purchases.reduce((sum, p) => sum + p.quantity * (p.unitCost || 0), 0);

  return (
    <div className="space-y-6 text-foreground">
      {/* Back button & Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-4">
        <div className="space-y-1">
          <Link
            href="/admin/inventory"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Stock Management
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-wide">{product.name}</h1>
            <span className={`px-2.5 py-0.5 rounded border text-[10px] uppercase font-bold tracking-wider ${status.color}`}>
              {status.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">Product ID: {product.id} • SKU: {product.slug}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/products/${product.slug}`}
            target="_blank"
            className="h-9 px-3 border border-border bg-card/60 hover:bg-muted text-foreground text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View on Store
          </Link>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-9 px-4 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Add Stocks
          </Button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {success && (
        <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-500 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-emerald-500 font-bold hover:underline">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-500 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 font-bold hover:underline">Dismiss</button>
        </div>
      )}

      {/* Top Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Current Stock</p>
            <p className="text-2xl font-extrabold text-foreground mt-0.5">{product.countInStock} <span className="text-xs font-normal text-muted-foreground">units</span></p>
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Total Restocked</p>
            <p className="text-2xl font-extrabold text-foreground mt-0.5">{totalPurchasedQty} <span className="text-xs font-normal text-muted-foreground">units</span></p>
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center shrink-0">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Total Spent</p>
            <p className="text-2xl font-extrabold text-foreground mt-0.5">
              {product.currency === 'LKR' ? 'Rs. ' : '$'}{totalPurchasedCost.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">Purchase Batches</p>
            <p className="text-2xl font-extrabold text-foreground mt-0.5">{purchases.length} <span className="text-xs font-normal text-muted-foreground">batches</span></p>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Product Info & QR Code Generator */}
        <div className="space-y-6">
          {/* Product Overview Card */}
          <div className="p-5 bg-card border border-border rounded-xl space-y-4">
            <h2 className="text-xs uppercase font-bold text-muted-foreground tracking-wider border-b border-border pb-2.5">Product Information</h2>
            
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-xl bg-muted border border-border relative overflow-hidden shrink-0">
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-sm text-foreground leading-snug">{product.name}</p>
                <p className="text-xs text-muted-foreground capitalize">Category: <span className="text-foreground font-medium">{product.category}</span></p>
                <p className="text-xs text-muted-foreground capitalize">Brand: <span className="text-foreground font-medium">{product.brand}</span></p>
                <div className="pt-1 flex items-baseline gap-2">
                  <span className="text-sm font-extrabold text-foreground">
                    {product.currency === 'LKR' ? 'Rs. ' : '$'}{product.price.toLocaleString()}
                  </span>
                  {product.discountPrice && (
                    <span className="text-xs text-muted-foreground line-through">
                      {product.currency === 'LKR' ? 'Rs. ' : '$'}{product.discountPrice.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* QR Code Generator Box */}
          <div className="p-5 bg-card border border-border rounded-xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-blue-500" />
                <h2 className="text-xs uppercase font-bold text-foreground tracking-wider">Stock QR Code Generator</h2>
              </div>
            </div>

            {/* QR Data Mode Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground block">QR Payload Mode</label>
              <div className="grid grid-cols-3 gap-1.5 bg-muted/40 p-1 rounded-lg border border-border text-center">
                <button
                  onClick={() => { setQrMode('id'); setSelectedUnitBarcode(null); }}
                  className={`py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors ${qrMode === 'id' && !selectedUnitBarcode ? 'bg-card text-blue-500 shadow-xs' : 'text-muted-foreground'}`}
                >
                  Product ID
                </button>
                <button
                  onClick={() => { setQrMode('sku'); setSelectedUnitBarcode(null); }}
                  className={`py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors ${qrMode === 'sku' && !selectedUnitBarcode ? 'bg-card text-blue-500 shadow-xs' : 'text-muted-foreground'}`}
                >
                  SKU Tag
                </button>
                <button
                  onClick={() => { setQrMode('url'); setSelectedUnitBarcode(null); }}
                  className={`py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors ${qrMode === 'url' && !selectedUnitBarcode ? 'bg-card text-blue-500 shadow-xs' : 'text-muted-foreground'}`}
                >
                  Storefront URL
                </button>
              </div>
            </div>

            {/* Live QR Code Canvas Preview */}
            <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 rounded-xl border border-border/80 text-black dark:text-white shadow-inner space-y-3">
              <div ref={qrRef} className="p-3 bg-white rounded-lg border border-slate-200">
                <QRCodeSVG
                  value={getQrValue()}
                  size={160}
                  level="H"
                  includeMargin={false}
                />
              </div>
              <div className="text-center space-y-0.5">
                <p className="font-bold text-xs text-foreground truncate max-w-[220px]">{product.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground truncate max-w-[220px]">{getQrValue()}</p>
              </div>
            </div>

            {/* QR Download & Print Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadQr}
                className="w-full text-xs font-semibold cursor-pointer flex items-center gap-1.5 h-9"
              >
                <Download className="h-3.5 w-3.5" /> Download PNG
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handlePrintQr}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 h-9"
              >
                <Printer className="h-3.5 w-3.5" /> Print QR Label
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column: Stock Purchase Records & Entry */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Purchase Record History */}
          <div className="p-5 bg-card border border-border rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">Stock Purchase Records</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Inbound batch history and supplier purchase logs.</p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> Add Purchase Entry
              </Button>
            </div>

            {/* Purchase Records Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                    <th className="p-3">Batch / PO #</th>
                    <th className="p-3">Purchase Date</th>
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Qty Added</th>
                    <th className="p-3">Unit Cost</th>
                    <th className="p-3">Total Cost</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {purchases.filter((pur) => (pur.quantity || 0) > 0).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                        No inbound stock purchase records logged yet. Click &quot;Add Purchase Entry&quot; to log a batch.
                      </td>
                    </tr>
                  ) : (
                    purchases
                      .filter((pur) => (pur.quantity || 0) > 0)
                      .map((pur) => {
                        const totalCost = (pur.quantity || 0) * (pur.unitCost || 0);
                        return (
                          <tr key={pur.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {pur.batchNumber}
                            </td>
                            <td className="p-3 text-muted-foreground">{pur.purchaseDate || new Date(pur.created).toLocaleDateString()}</td>
                            <td className="p-3 font-medium">{pur.supplier || 'Official Supplier'}</td>
                            <td className="p-3 font-extrabold">
                              <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                                +{pur.quantity} units (Stock In)
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {product.currency === 'LKR' ? 'Rs. ' : '$'}{(pur.unitCost || 0).toLocaleString()}
                            </td>
                            <td className="p-3 font-bold text-foreground">
                              {product.currency === 'LKR' ? 'Rs. ' : '$'}{totalCost.toLocaleString()}
                            </td>
                            <td className="p-3 text-muted-foreground max-w-[150px] truncate">{pur.notes || '—'}</td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Product Sales History Section */}
          <div className="p-5 bg-card border border-border rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">Product Sales History</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Outbound customer purchases and POS sales transactions.</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {salesHistory.length} Total Sale{salesHistory.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                    <th className="p-3">Order / Sale #</th>
                    <th className="p-3">Channel</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Qty Sold</th>
                    <th className="p-3">Total Price</th>
                    <th className="p-3">Serial S/N</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {salesHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                        No customer sales recorded for this product yet.
                      </td>
                    </tr>
                  ) : (
                    salesHistory.map((sale) => (
                      <tr key={sale.id} className="hover:bg-muted/10 transition-colors">
                        <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          #{sale.orderNumber}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${sale.channel === 'POS' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'}`}>
                            {sale.channel}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{sale.date}</td>
                        <td className="p-3 font-medium">
                          <div>{sale.customerName}</div>
                          {sale.customerEmail && <div className="text-[10px] text-muted-foreground">{sale.customerEmail}</div>}
                        </td>
                        <td className="p-3 font-extrabold text-foreground">{sale.quantity} unit{sale.quantity === 1 ? '' : 's'}</td>
                        <td className="p-3 font-bold text-foreground">
                          {product.currency === 'LKR' ? 'Rs. ' : '$'}{sale.totalAmount.toLocaleString()}
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          {sale.serials.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sale.serials.map((sn, sIdx) => (
                                <span key={sIdx} className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[10px]">
                                  {sn}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="p-3 capitalize font-semibold text-muted-foreground">
                          {sale.status}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Available Stocks (stock_management collection) */}
          <div className="p-5 bg-card border border-border rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">Available Stocks</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Manage individual stock items, unit barcodes, and sticker printing.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setShowPrintSettings(true)}
                  disabled={stockUnits.filter(u => u.status === 'available').length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold cursor-pointer h-8 px-3 text-xs flex items-center gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Barcode
                  {stockUnits.filter(u => u.status === 'available').length > 0 && (
                    <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5">
                      {stockUnits.filter(u => u.status === 'available').length}
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Available Stocks Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                    <th className="p-3">Barcode / Unit ID</th>
                    <th className="p-3">Serial Number</th>
                    <th className="p-3">Batch PO</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {stockUnits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-xs text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Boxes className="h-8 w-8 text-muted-foreground/40" />
                          <span>No stock units yet. Click <strong>&quot;+ Add Stocks&quot;</strong> to add inventory — barcodes are generated automatically.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    stockUnits.map((unit) => {
                      const isSelected = selectedUnitBarcode === unit.barcode;
                      const statusColorMap: Record<string, string> = {
                        available: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                        reserved: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                        sold: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
                        defective: 'bg-red-500/10 text-red-500 border-red-500/20',
                        returned: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                      };

                      return (
                        <tr
                          key={unit.id}
                          onClick={() => setSelectedUnitBarcode(unit.barcode)}
                          className={`hover:bg-muted/10 transition-colors cursor-pointer ${isSelected ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''}`}
                        >
                          <td className="p-3 font-mono font-bold text-foreground">
                            <div className="flex items-center gap-1.5">
                              <QrCode className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span>{unit.barcode}</span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground">{unit.serialNumber || '—'}</td>
                          <td className="p-3 text-muted-foreground">{unit.batchNumber || '—'}</td>
                          <td className="p-3">
                            <select
                              value={unit.status}
                              onChange={(e) => handleStatusChange(unit.id, e.target.value as any)}
                              onClick={(e) => e.stopPropagation()}
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${statusColorMap[unit.status] || 'bg-secondary text-foreground'}`}
                            >
                              <option value="available">Available</option>
                              <option value="reserved">Reserved</option>
                              <option value="sold">Sold</option>
                              <option value="defective">Defective</option>
                              <option value="returned">Returned</option>
                            </select>
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedUnitBarcode(unit.barcode)}
                              className="h-7 px-2 text-[10px] font-semibold text-blue-500 hover:bg-blue-500/10 border border-blue-500/20"
                            >
                              Print QR Label
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>


      {/* Add Stocks Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Add Stocks</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Add batch quantity to inventory.</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Cost info banner */}
            {product && (() => {
              const newCost = Number(unitCost);
              const oldPrice = product.price;
              const isPriceChange = newCost > 0 && newCost !== oldPrice;
              const isIncrease = isPriceChange && newCost > oldPrice;
              const isDecrease = isPriceChange && newCost < oldPrice;
              return (
                <div className={`rounded-xl border px-3 py-2.5 text-xs ${
                  isIncrease
                    ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700'
                    : isDecrease
                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700'
                    : 'bg-muted/50 border-border'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground/70">Current Store Price</span>
                    <span className="font-bold text-foreground">
                      {product.currency || 'LKR'} {oldPrice.toLocaleString()}
                    </span>
                  </div>
                  {isIncrease && (
                    <p className="mt-1 text-amber-700 dark:text-amber-400 font-medium">
                      ↑ Price increase — old price will be hidden on storefront.
                    </p>
                  )}
                  {isDecrease && (
                    <p className="mt-1 text-emerald-700 dark:text-emerald-400 font-medium">
                      ↓ Price drop — old price ({product.currency || 'LKR'} {oldPrice.toLocaleString()}) will show as strikethrough.
                    </p>
                  )}
                </div>
              );
            })()}

            <form onSubmit={handleAddPurchase} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground/80 block">Batch No</label>
                <Input
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="e.g. BATCH-20260717"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground/80 block">Stock Count *</label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="e.g. 10"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground/80 block">Cost ({product.currency || 'LKR'})</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground/80 block">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes about this batch..."
                  rows={2}
                  className="w-full p-2.5 rounded-lg border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs font-semibold cursor-pointer h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-9 px-4 flex items-center gap-1.5"
                >
                  {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Add Stocks
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Settings Modal */}
      {showPrintSettings && (
        <PrintSettingsModal
          onClose={() => setShowPrintSettings(false)}
          onPrint={handlePrintBarcodes}
          unitCount={stockUnits.filter(u => u.status === 'available').length}
        />
      )}
    </div>
  );
}
