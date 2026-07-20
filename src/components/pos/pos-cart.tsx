'use client';

import React from 'react';
import { Trash2, Plus, Minus, Tag, Barcode, ShoppingCart } from 'lucide-react';
import type { PosCartItem } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PosCartProps {
  items: PosCartItem[];
  onUpdateQty: (key: string, delta: number) => void;
  onUpdateDiscount: (key: string, discount: number) => void;
  onRemove: (key: string) => void;
  currency: string;
}

function fmt(amount: number, currency = 'LKR') {
  return amount.toLocaleString('en-LK', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

export default function PosCart({ items, onUpdateQty, onUpdateDiscount, onRemove, currency }: PosCartProps) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground py-10">
        <ShoppingCart className="h-10 w-10 opacity-20" />
        <p className="text-sm font-medium">Cart is empty</p>
        <p className="text-xs opacity-60 text-center">Tap a product or scan a barcode to add items</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-0.5">
      {items.map((item) => (
        <div
          key={item.key}
          className="group bg-muted/30 hover:bg-muted/50 border border-border rounded-xl p-3 transition-colors"
        >
          {/* Row 1: Name + remove */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{item.productName}</p>
              {item.sku && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{item.sku}</p>}
              {(item.unitBarcode || item.unitSerial) && (
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {item.unitBarcode && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-mono text-blue-500 font-bold">
                      BC: {item.unitBarcode}
                    </span>
                  )}
                  {item.unitSerial && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[9px] font-mono text-muted-foreground font-medium">
                      SN: {item.unitSerial}
                    </span>
                  )}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onRemove(item.key)}
              className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Row 2: qty controls + line total */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              {item.unitBarcode || item.unitId ? (
                <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 text-blue-500 px-2 py-0.5 rounded-md text-[10px] font-bold">
                  <Barcode className="h-3 w-3" />
                  <span>1 Unit</span>
                </div>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onUpdateQty(item.key, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-7 text-center text-sm font-bold text-foreground">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onUpdateQty(item.key, +1)}
                    disabled={typeof item.countInStock === 'number' && item.quantity >= item.countInStock}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </>
              )}
              <span className="text-[10px] text-muted-foreground ml-1">× {fmt(item.unitPrice, currency)}</span>
            </div>
            <p className="text-sm font-black text-foreground shrink-0">{fmt(item.lineTotal, currency)}</p>
          </div>

          {/* Row 3: per-item discount (inline) */}
          <div className="flex items-center gap-1.5 mt-2">
            <Tag className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            <span className="text-[10px] text-muted-foreground shrink-0">Item discount:</span>
            <Input
              type="number"
              min={0}
              step="any"
              value={item.itemDiscount === 0 ? '' : item.itemDiscount}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                onUpdateDiscount(item.key, Number.isNaN(v) ? 0 : v);
              }}
              placeholder="0"
              className="w-20 h-6 px-1.5 text-[10px] font-mono rounded-md"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
