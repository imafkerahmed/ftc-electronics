'use client';

import React, { useState } from 'react';
import { Receipt, Percent, Minus, Plus, Tag } from 'lucide-react';
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
  couponCode: string;
  couponDiscountAmount: number;
  couponSuccessMessage: string;
  couponErrorMessage: string;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
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
  couponCode,
  couponDiscountAmount,
  couponSuccessMessage,
  couponErrorMessage,
  onApplyCoupon,
  onRemoveCoupon,
}: PosBillSummaryProps) {
  const [localCouponInput, setLocalCouponInput] = useState('');

  const itemsSubtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const itemDiscountsTotal = items.reduce((sum, i) => sum + i.itemDiscount * i.quantity, 0);
  const afterItemDiscounts = itemsSubtotal - itemDiscountsTotal;

  const globalDiscountAmt =
    globalDiscountType === 'percent'
      ? (afterItemDiscounts * Math.min(globalDiscount, 100)) / 100
      : Math.min(globalDiscount, afterItemDiscounts);

  const afterAllDiscounts = afterItemDiscounts - globalDiscountAmt - couponDiscountAmount;
  const taxAmount = (afterAllDiscounts * taxRate) / 100;
  const total = afterAllDiscounts + taxAmount;

  const hasItems = items.length > 0;

  const handleApply = () => {
    onApplyCoupon(localCouponInput);
  };

  const handleRemove = () => {
    onRemoveCoupon();
    setLocalCouponInput('');
  };

  return (
    <div className="shrink-0 space-y-3 pt-3 border-t border-border">
      {/* Coupon / Promo code row */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Promo / Coupon Code</span>
        {couponSuccessMessage ? (
          <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
            <div className="flex items-start gap-2">
              <Tag className="h-4 w-4 text-emerald-600 mt-0.5" />
              <div>
                <p className="font-bold text-emerald-600">Applied: {couponCode}</p>
                <p className="text-[10px] text-muted-foreground">{couponSuccessMessage}</p>
              </div>
            </div>
            <Button variant="ghost" size="xs" onClick={handleRemove} className="text-red-500 hover:bg-red-500/10 text-[10px]">
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Enter coupon code…"
              value={localCouponInput}
              onChange={(e) => setLocalCouponInput(e.target.value)}
              className="h-8 text-xs rounded-xl flex-1 font-mono uppercase"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleApply}
              className="h-8 text-xs px-3 font-semibold"
            >
              Apply
            </Button>
          </div>
        )}
        {couponErrorMessage && (
          <p className="text-[10px] text-red-500 font-medium">{couponErrorMessage}</p>
        )}
      </div>

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
        {couponDiscountAmount > 0 && (
          <div className="flex justify-between text-emerald-500">
            <span>Coupon Discount ({couponCode})</span>
            <span className="font-semibold">– {fmt(couponDiscountAmount, currency)}</span>
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
