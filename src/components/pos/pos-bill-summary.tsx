'use client';

import React from 'react';
import { Receipt, Percent, Minus, Plus } from 'lucide-react';
import type { PosCartItem } from '@/types/pos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PosBillSummaryProps {
  items: PosCartItem[];
  globalDiscount: number;
  globalDiscountType: 'flat' | 'percent';
  taxRate: number;
  currency: string;
  onChangeDiscount: (val: number) => void;
  onToggleDiscountType: () => void;
  onCharge: () => void;
  isProcessing: boolean;
}

function fmt(amount: number, currency = 'LKR') {
  return amount.toLocaleString('en-LK', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

export default function PosBillSummary({
  items,
  globalDiscount,
  globalDiscountType,
  taxRate,
  currency,
  onChangeDiscount,
  onToggleDiscountType,
  onCharge,
  isProcessing,
}: PosBillSummaryProps) {
  const itemsSubtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const itemDiscountsTotal = items.reduce((sum, i) => sum + i.itemDiscount * i.quantity, 0);
  const afterItemDiscounts = itemsSubtotal - itemDiscountsTotal;

  const globalDiscountAmt =
    globalDiscountType === 'percent'
      ? (afterItemDiscounts * Math.min(globalDiscount, 100)) / 100
      : Math.min(globalDiscount, afterItemDiscounts);

  const afterAllDiscounts = afterItemDiscounts - globalDiscountAmt;
  const taxAmount = (afterAllDiscounts * taxRate) / 100;
  const total = afterAllDiscounts + taxAmount;

  const hasItems = items.length > 0;

  return (
    <div className="shrink-0 space-y-3 pt-3 border-t border-border">
      {/* Global discount row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground shrink-0">Global Discount</span>
        <Button
          variant="outline"
          size="xs"
          onClick={onToggleDiscountType}
          title="Toggle flat/percent"
          className="shrink-0 font-bold"
        >
          {globalDiscountType === 'percent' ? <Percent className="h-3 w-3 inline" /> : 'LKR'}
        </Button>
        <div className="flex-1 flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-xs"
            onClick={() => onChangeDiscount(Math.max(0, globalDiscount - (globalDiscountType === 'percent' ? 1 : 100)))}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Input
            type="number"
            min={0}
            max={globalDiscountType === 'percent' ? 100 : undefined}
            step="any"
            value={globalDiscount === 0 ? '' : globalDiscount}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              onChangeDiscount(Number.isNaN(v) ? 0 : v);
            }}
            placeholder="0"
            className="flex-1 h-6 px-2 text-xs font-mono text-center rounded-md"
          />
          <Button
            variant="outline"
            size="icon-xs"
            onClick={() => onChangeDiscount(globalDiscount + (globalDiscountType === 'percent' ? 1 : 100))}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Bill breakdown */}
      <div className="bg-muted/30 rounded-xl p-3 space-y-1.5 text-xs">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal ({items.length} item{items.length !== 1 ? 's' : ''})</span>
          <span className="font-semibold">{fmt(itemsSubtotal, currency)}</span>
        </div>
        {itemDiscountsTotal > 0 && (
          <div className="flex justify-between text-emerald-500">
            <span>Item Discounts</span>
            <span className="font-semibold">– {fmt(itemDiscountsTotal, currency)}</span>
          </div>
        )}
        {globalDiscountAmt > 0 && (
          <div className="flex justify-between text-emerald-500">
            <span>Global Discount{globalDiscountType === 'percent' ? ` (${globalDiscount}%)` : ''}</span>
            <span className="font-semibold">– {fmt(globalDiscountAmt, currency)}</span>
          </div>
        )}
        {taxRate > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Tax ({taxRate}%)</span>
            <span className="font-semibold">{fmt(taxAmount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-foreground font-black text-sm border-t border-border pt-2 mt-2">
          <span>TOTAL</span>
          <span className="text-blue-500">{fmt(total, currency)}</span>
        </div>
      </div>

      {/* Charge button */}
      <Button
        onClick={onCharge}
        disabled={!hasItems || isProcessing}
        className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
      >
        <Receipt className="h-4 w-4" />
        {isProcessing ? 'Processing…' : `Charge ${hasItems ? fmt(total, currency) : ''}`}
      </Button>
    </div>
  );
}

export { fmt };
export type { PosBillSummaryProps };
