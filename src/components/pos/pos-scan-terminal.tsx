"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ScanLine,
  Barcode,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Grid3x3,
  Plus,
  Search,
  Loader2,
} from "lucide-react";
import type { PosCartItem } from "@/types/pos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

interface ScanEvent {
  id: string;
  status: "ok" | "error" | "duplicate";
  productName?: string;
  barcode: string;
  unitBarcode?: string;
  unitSerial?: string;
  error?: string;
  ts: number;
}

interface PosScanTerminalProps {
  onAddToCart: (
    item: Omit<PosCartItem, "quantity" | "itemDiscount" | "lineTotal">,
  ) => void;
  cartItems: PosCartItem[];
  refreshTrigger?: number;
  currency: string;
}

function fmt(amount: number, currency = "LKR") {
  return amount.toLocaleString("en-LK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export default function PosScanTerminal({
  onAddToCart,
  cartItems,
  refreshTrigger,
  currency,
}: PosScanTerminalProps) {
  const [scanInput, setScanInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanEvent | null>(null);
  const [scanLog, setScanLog] = useState<ScanEvent[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);

  // All products loaded on mount for live search
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Live search dropdown
  const [searchSuggestions, setSearchSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // ── Auto-focus scanner input ──────────────────────────────────────
  useEffect(() => {
    scanRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== scanRef.current) {
        e.preventDefault();
        scanRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Load all products upfront for instant local search ─────────────
  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/pos/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
        const cats = [
          "All",
          ...new Set<string>(
            (data.products as Product[])
              .map((p: Product) => p.category)
              .filter(Boolean),
          ),
        ];
        setCategories(cats);
        setProductsLoaded(true);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts, refreshTrigger]);

  // ── Live search as user types ─────────────────────────────────────
  useEffect(() => {
    const q = scanInput.trim().toLowerCase();
    if (!q || q.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const matches = products
      .filter((p) => {
        if (p.countInStock === 0) return false;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.id.toLowerCase().startsWith(q) ||
          p.availableUnits?.some(
            (u) =>
              u.barcode.toLowerCase().includes(q) ||
              u.serialNumber?.toLowerCase().includes(q),
          )
        );
      })
      .slice(0, 8);

    setSearchSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [scanInput, products]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        !scanRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Flash feedback ────────────────────────────────────────────────
  const flashFeedback = (status: "ok" | "error") => {
    const el = flashRef.current;
    if (!el) return;
    el.classList.remove(
      "bg-emerald-500/10",
      "bg-red-500/10",
      "border-emerald-500/40",
      "border-red-500/40",
      "border-transparent",
    );
    el.classList.add(status === "ok" ? "bg-emerald-500/10" : "bg-red-500/10");
    el.classList.add(
      status === "ok" ? "border-emerald-500/40" : "border-red-500/40",
    );
    setTimeout(() => {
      el.classList.remove(
        "bg-emerald-500/10",
        "bg-red-500/10",
        "border-emerald-500/40",
        "border-red-500/40",
      );
      el.classList.add("border-transparent");
    }, 800);
  };

  // ── Add product from local catalog (unit sticker) ─────────────────
  const addProductToCart = (p: Product, skipFlash = false) => {
    if (p.countInStock === 0) return;

    // Find the first available unit that is NOT already in the cart
    const availUnit = p.availableUnits?.find(
      (u) =>
        !cartItems.some(
          (c) => c.unitBarcode === u.barcode || c.unitId === u.id,
        ),
    );

    if (p.availableUnits && p.availableUnits.length > 0 && !availUnit) {
      const event: ScanEvent = {
        id: `${Date.now()}-${Math.random()}`,
        status: "duplicate",
        productName: p.name,
        barcode: p.sku,
        error: `All available units of this product are already in cart.`,
        ts: Date.now(),
      };
      setLastScan(event);
      setScanLog((prev) => [event, ...prev].slice(0, 50));
      if (!skipFlash) flashFeedback("error");
      return;
    }

    const key = availUnit?.barcode ? `${p.id}-${availUnit.barcode}` : p.id;

    onAddToCart({
      key,
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

    const event: ScanEvent = {
      id: `${Date.now()}-${Math.random()}`,
      status: "ok",
      productName: p.name,
      barcode: availUnit?.barcode || p.sku,
      unitBarcode: availUnit?.barcode,
      unitSerial: availUnit?.serialNumber,
      ts: Date.now(),
    };
    setLastScan(event);
    setScanLog((prev) => [event, ...prev].slice(0, 50));
    if (!skipFlash) flashFeedback("ok");
  };

  // ── Scan via API (for barcodes not matching local names/SKUs) ─────
  const handleScan = async (q: string) => {
    if (!q.trim() || scanning) return;
    setShowSuggestions(false);
    setScanning(true);

    const event: ScanEvent = {
      id: `${Date.now()}-${Math.random()}`,
      status: "ok",
      barcode: q.trim(),
      ts: Date.now(),
    };

    try {
      const res = await fetch(
        `/api/pos/scan?q=${encodeURIComponent(q.trim())}`,
      );
      if (!res.ok) {
        event.status = "error";
        setScanLog((prev) => [event, ...prev]);
        flashFeedback("error");
        return;
      }
      const data = await res.json();

      if (data.success && data.data) {
        const item = data.data;
        const uniqueKey = item.unitBarcode
          ? `${item.productId}-${item.unitBarcode}`
          : item.productId;
        const alreadyInCart = cartItems.some((c) => c.key === uniqueKey);

        if (alreadyInCart && item.unitBarcode) {
          event.status = "duplicate";
          event.productName = item.productName;
          event.unitBarcode = item.unitBarcode;
          event.error = `Unit ${item.unitBarcode} is already in cart.`;
          flashFeedback("error");
        } else {
          onAddToCart({
            key: uniqueKey,
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
          event.status = "ok";
          event.productName = item.productName;
          event.unitBarcode = item.unitBarcode;
          event.unitSerial = item.unitSerial;
          flashFeedback("ok");
        }
      } else {
        event.status = "error";
        event.error = data.error || `No item found for "${q.trim()}".`;
        flashFeedback("error");
      }
    } catch (err: any) {
      event.status = "error";
      event.error = `Scan failed: ${err.message || "Network error"}`;
      flashFeedback("error");
    }

    setLastScan(event);
    setScanLog((prev) => [event, ...prev].slice(0, 50));
    setScanning(false);
    setScanInput("");
    scanRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If exactly one suggestion and user hits Enter, use it
      if (showSuggestions && searchSuggestions.length === 1) {
        addProductToCart(searchSuggestions[0]);
        setScanInput("");
        setShowSuggestions(false);
      } else {
        void handleScan(scanInput);
      }
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // ── Catalog filtered view ─────────────────────────────────────────
  const filteredCatalog = products.filter((p) => {
    const matchCat = activeCategory === "All" || p.category === activeCategory;
    const q = catalogSearch.toLowerCase();
    const matchSearch =
      !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div className="flex flex-col h-full gap-3">
      {/* ── Scanner Zone ─────────────────────────────────────────── */}
      <div
        ref={flashRef}
        className="rounded-2xl border-2 border-transparent bg-card/60 p-4 flex flex-col gap-3 transition-colors duration-200 shrink-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"></div>
          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-md">
            Press / to focus
          </span>
        </div>

        {/* Scan Input with Live Dropdown */}
        <div className="relative">
          <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-400 pointer-events-none z-10" />
          <Input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (searchSuggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Scan barcode, or type name / SKU to search…"
            className="pl-10 pr-20 h-14 rounded-xl text-base font-mono border-blue-500/30 focus:border-blue-500/70 focus:ring-blue-500/20"
            disabled={scanning}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {scanning && (
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            )}
            {scanInput && !scanning && (
              <button
                onClick={() => {
                  setScanInput("");
                  setShowSuggestions(false);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => void handleScan(scanInput)}
              disabled={!scanInput.trim() || scanning}
              className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
            >
              Add
            </button>
          </div>

          {/* ── Live Search Suggestions Dropdown ─────────────────── */}
          {showSuggestions && searchSuggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
            >
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
                {searchSuggestions.length} match
                {searchSuggestions.length !== 1 ? "es" : ""} — click to add to
                cart
              </p>
              <div className="max-h-64 overflow-y-auto divide-y divide-border">
                {searchSuggestions.map((p) => {
                  const alreadyInCart = cartItems.some(
                    (c) => c.productId === p.id,
                  );
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        addProductToCart(p);
                        setScanInput("");
                        setShowSuggestions(false);
                        scanRef.current?.focus();
                      }}
                      disabled={p.countInStock === 0}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-500/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
                    >
                      {/* Thumbnail */}
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-muted/50 overflow-hidden flex items-center justify-center">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Grid3x3 className="h-4 w-4 text-muted-foreground/30" />
                        )}
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {p.name}
                        </p>
                        <p className="text-[10px] font-mono text-muted-foreground">
                          {p.sku}
                        </p>
                      </div>
                      {/* Price & Stock */}
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-black text-foreground">
                          {fmt(p.price, currency)}
                        </p>
                        <p
                          className={`text-[10px] font-semibold ${p.countInStock > 5 ? "text-muted-foreground" : p.countInStock > 0 ? "text-amber-500" : "text-red-500"}`}
                        >
                          {p.countInStock === 0
                            ? "Out of stock"
                            : `Stock: ${p.countInStock}`}
                        </p>
                      </div>
                      {/* Already in cart badge */}
                      {alreadyInCart && (
                        <span className="shrink-0 text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                          In cart
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Last scan feedback */}
        {lastScan && (
          <div
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
              lastScan.status === "ok"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
                : "bg-red-500/10 border-red-500/20 text-red-500"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {lastScan.status === "ok" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">
                {lastScan.status === "ok"
                  ? `✓ Added: ${lastScan.productName}${lastScan.unitBarcode ? ` · ${lastScan.unitBarcode}` : ""}`
                  : lastScan.error}
              </span>
            </div>
            <button
              onClick={() => setLastScan(null)}
              className="shrink-0 hover:opacity-70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Scan Log ─────────────────────────────────────────────── */}
      {scanLog.length > 0 && (
        <div className="bg-card/40 border border-border rounded-2xl p-3 shrink-0">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-2">
            Scan Log ({scanLog.length})
          </p>
          <div className="space-y-1 max-h-[130px] overflow-y-auto">
            {scanLog.map((ev) => (
              <div
                key={ev.id}
                className={`flex items-center gap-2 text-[11px] px-2 py-1 rounded-lg ${
                  ev.status === "ok"
                    ? "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-500/5 text-red-500"
                }`}
              >
                {ev.status === "ok" ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : (
                  <AlertCircle className="h-3 w-3 shrink-0" />
                )}
                <span className="font-semibold truncate flex-1">
                  {ev.status === "ok" ? ev.productName : ev.error}
                </span>
                {ev.unitBarcode && (
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                    {ev.unitBarcode}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground shrink-0 font-mono">
                  {new Date(ev.ts).toLocaleTimeString("en-LK", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZone: "Asia/Colombo",
                  })}
                </span>
              </div>
            ))}
          </div>
          {scanLog.length > 3 && (
            <button
              onClick={() => setScanLog([])}
              className="mt-2 text-[10px] text-muted-foreground hover:text-red-500 font-medium"
            >
              Clear log
            </button>
          )}
        </div>
      )}

      {/* ── Browse Catalog toggle ─────────────────────────────────── */}
      <div className="shrink-0">
        <button
          onClick={() => setShowCatalog(!showCatalog)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 border border-border transition-colors text-xs font-bold text-foreground"
        >
          <div className="flex items-center gap-2">
            <Grid3x3 className="h-3.5 w-3.5 text-muted-foreground" />
            Browse Product Catalog
            {!productsLoaded && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showCatalog ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* ── Product Catalog (collapsible) ─────────────────────────── */}
      {showCatalog && (
        <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* Search */}
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder="Filter catalog…"
              className="pl-8 h-9 text-xs rounded-xl"
            />
          </div>

          {/* Category tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 shrink-0 scrollbar-hide">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={activeCategory === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCategory(cat)}
                className="shrink-0 h-7 text-xs"
              >
                {cat}
              </Button>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {!productsLoaded ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl bg-muted/40 animate-pulse"
                  />
                ))}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 py-10">
                <Grid3x3 className="h-8 w-8 opacity-30" />
                <p className="text-sm">No products found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredCatalog.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProductToCart(p, true)}
                    disabled={p.countInStock === 0}
                    className="group relative flex flex-col items-start p-3 bg-card hover:bg-blue-500/5 border border-border hover:border-blue-500/40 rounded-xl transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-left active:scale-[0.98]"
                  >
                    <div className="w-full aspect-[4/3] rounded-lg bg-muted/50 mb-2 overflow-hidden flex items-center justify-center relative">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Grid3x3 className="h-6 w-6 text-muted-foreground/30" />
                      )}
                    </div>
                    <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight mb-1">
                      {p.name}
                    </p>
                    <div className="w-full flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-mono">{p.sku || "—"}</span>
                      <span
                        className={`font-medium ${p.countInStock > 5 ? "text-muted-foreground" : p.countInStock > 0 ? "text-amber-500 font-bold" : "text-red-500 font-bold"}`}
                      >
                        Stock: {p.countInStock}
                      </span>
                    </div>
                    <p className="text-sm font-black text-foreground mt-1">
                      {fmt(p.price, currency)}
                    </p>
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
      )}
    </div>
  );
}
