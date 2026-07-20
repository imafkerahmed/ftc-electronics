'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ScanLine, X, Plus, Grid3x3 } from 'lucide-react';
import type { PosCartItem } from '@/types/pos';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  imageUrl?: string;
  category: string;
  countInStock: number;
  availableUnits?: { id: string; barcode: string; serialNumber?: string }[];
}

interface PosProductGridProps {
  onAddToCart: (item: Omit<PosCartItem, 'quantity' | 'itemDiscount' | 'lineTotal'>) => void;
  refreshTrigger?: number;
}

export default function PosProductGrid({ onAddToCart, refreshTrigger }: PosProductGridProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pos/products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        const cats = ['All', ...new Set<string>((data.products as Product[]).map((p) => p.category).filter(Boolean))];
        setCategories(cats);
      }
    } catch {
      // fallback silently
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts, refreshTrigger]);

  useEffect(() => {
    // Focus search on mount and on '/' key
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleAdd = (p: Product) => {
    if (p.countInStock === 0) return;
    setScanError(null);
    const availUnit = p.availableUnits?.[0];
    onAddToCart({
      key: availUnit?.barcode ? `${p.id}-${availUnit.barcode}` : p.id,
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      imageUrl: p.imageUrl,
      unitPrice: p.price,
      countInStock: p.countInStock,
      unitId: availUnit?.id,
      unitBarcode: availUnit?.barcode,
      unitSerial: availUnit?.serialNumber,
    });
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = search.trim();
      if (!q) return;

      setScanError(null);
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
            countInStock: item.countInStock,
            unitId: item.unitId,
            unitBarcode: item.unitBarcode,
            unitSerial: item.unitSerial,
          });
          setSearch('');
        } else {
          setScanError(data.error || `No item found matching "${q}".`);
        }
      } catch (err: any) {
        setScanError(`Scan failed: ${err.message || 'Network error'}`);
      }
    }
  };

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === 'All' || p.category === activeCategory;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.id.toLowerCase() === q ||
      p.availableUnits?.some((u) => u.barcode.toLowerCase().includes(q) || u.serialNumber?.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scan barcode sticker or enter unit serial/SKU… (Press Enter)"
          className="pl-9 pr-14 h-10 rounded-xl"
        />
        {search && (
          <button onClick={() => { setSearch(''); setScanError(null); }} className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        )}
        <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
      </div>

      {scanError && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold shrink-0">
          <span>{scanError}</span>
          <button onClick={() => setScanError(null)} className="ml-2 hover:opacity-80">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 shrink-0 scrollbar-hide">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={activeCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat)}
            className="shrink-0 h-7 text-xs"
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 py-10">
            <Grid3x3 className="h-8 w-8 opacity-30" />
            <p className="text-sm">No products found</p>
            {search && <p className="text-xs opacity-60">Try scanning barcode or different term</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => handleAdd(p)}
                disabled={p.countInStock === 0}
                className="group relative flex flex-col items-start p-3 bg-card hover:bg-blue-500/5 border border-border hover:border-blue-500/40 rounded-xl transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-left active:scale-[0.98]"
              >
                {/* Image or placeholder */}
                <div className="w-full aspect-[4/3] rounded-lg bg-muted/50 mb-2 overflow-hidden flex items-center justify-center relative">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" />
                  ) : (
                    <Grid3x3 className="h-6 w-6 text-muted-foreground/30" />
                  )}
                </div>

                <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight mb-1">{p.name}</p>
                <div className="w-full flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono">{p.sku || '—'}</span>
                  <span className={`font-medium ${p.countInStock > 5 ? 'text-muted-foreground' : p.countInStock > 0 ? 'text-amber-500 font-bold' : 'text-red-500 font-bold'}`}>
                    Stock: {p.countInStock}
                  </span>
                </div>

                <p className="text-sm font-black text-foreground mt-1">
                  {p.price.toLocaleString('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 })}
                </p>

                {/* Add overlay */}
                {p.countInStock > 0 && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                      <Plus className="h-4 w-4 text-white" />
                    </div>
                  </div>
                )}

                {p.countInStock === 0 && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                    OUT OF STOCK
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
