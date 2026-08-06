"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Lock, History, RefreshCw, User } from "lucide-react";
import type { PosCartItem, PosEmployeeSession } from "@/types/pos";
import {
  getPosSession,
  clearPosSession,
  isPosSessionValid,
} from "@/lib/pos-session";
import { pbSiteSettings } from "@/lib/pb-collections";
import EmployeeLockScreen from "./employee-lock-screen";
import PosScanTerminal from "@/components/pos/pos-scan-terminal";
import PosCart from "@/components/pos/pos-cart";
import PosBillSummary from "@/components/pos/pos-bill-summary";
import PosPaymentModal from "@/components/pos/pos-payment-modal";
import { clearAllClientSessions } from "@/lib/clear-client-storage";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { validatePosCouponAction } from "@/app/actions/admin";

const POS_CART_STORAGE_KEY = 'ftc_pos_cart_v1';

function calcLineTotal(item: Omit<PosCartItem, "lineTotal">) {
  return (item.unitPrice - item.itemDiscount) * item.quantity;
}

export default function PosPage() {
  const [session, setSession] = useState<PosEmployeeSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [globalDiscountType, setGlobalDiscountType] = useState<
    "flat" | "percent"
  >("flat");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [taxRate, setTaxRate] = useState(15);
  const [currency, setCurrency] = useState("LKR");
  const [showPayment, setShowPayment] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Coupon states
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscountVal, setCouponDiscountVal] = useState(0);
  const [couponDiscountType, setCouponDiscountType] = useState<
    "flat" | "percent"
  >("flat");
  const [couponSuccess, setCouponSuccess] = useState("");
  const [couponError, setCouponError] = useState("");

  const [currentDate, setCurrentDate] = useState("");

  // Hydrate session & cart state from storage on mount & refresh date
  useEffect(() => {
    const updateDate = () => {
      setCurrentDate(
        new Date().toLocaleDateString("en-LK", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      );
    };

    updateDate();
    const dateInterval = setInterval(updateDate, 60000);

    const s = getPosSession();
    if (isPosSessionValid(s)) setSession(s);
    setSessionChecked(true);

    try {
      const saved = localStorage.getItem(POS_CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.cart)) setCart(parsed.cart);
        if (typeof parsed.globalDiscount === 'number') setGlobalDiscount(parsed.globalDiscount);
        if (parsed.globalDiscountType) setGlobalDiscountType(parsed.globalDiscountType);
        if (parsed.customerName) setCustomerName(parsed.customerName);
        if (parsed.customerPhone) setCustomerPhone(parsed.customerPhone);
        if (parsed.couponCode) setCouponCode(parsed.couponCode);
        if (typeof parsed.couponDiscountVal === 'number') setCouponDiscountVal(parsed.couponDiscountVal);
        if (parsed.couponDiscountType) setCouponDiscountType(parsed.couponDiscountType);
      }
    } catch {
      /* ignore */
    }

    return () => clearInterval(dateInterval);
  }, []);

  // Save cart state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (cart.length > 0 || customerName || globalDiscount > 0 || couponCode) {
        localStorage.setItem(
          POS_CART_STORAGE_KEY,
          JSON.stringify({
            cart,
            globalDiscount,
            globalDiscountType,
            customerName,
            customerPhone,
            couponCode,
            couponDiscountVal,
            couponDiscountType,
          })
        );
      } else {
        localStorage.removeItem(POS_CART_STORAGE_KEY);
      }
    } catch {
      /* ignore storage errors */
    }
  }, [
    cart,
    globalDiscount,
    globalDiscountType,
    customerName,
    customerPhone,
    couponCode,
    couponDiscountVal,
    couponDiscountType,
  ]);

  // Load tax & currency from site settings
  useEffect(() => {
    async function load() {
      try {
        const general = await pbSiteSettings.get<any>("general");
        if (general?.taxRate) setTaxRate(Number(general.taxRate) || 15);
        if (general?.currency) setCurrency(general.currency || "LKR");
      } catch {
        /* defaults */
      }
    }
    void load();
  }, []);

  const handleAddToCart = useCallback(
    (newItem: Omit<PosCartItem, "quantity" | "itemDiscount" | "lineTotal">) => {
      setCart((prev) => {
        const isSpecificUnit = Boolean(newItem.unitBarcode || newItem.unitId);
        const existing = prev.find((i) => i.key === newItem.key);

        if (isSpecificUnit) {
          if (existing) {
            return prev;
          }
          const item: PosCartItem = {
            ...newItem,
            quantity: 1,
            itemDiscount: 0,
            lineTotal: newItem.unitPrice,
          };
          return [...prev, item];
        }

        const maxAllowed =
          typeof newItem.countInStock === "number"
            ? newItem.countInStock
            : 9999;
        if (existing) {
          if (existing.quantity >= maxAllowed) {
            return prev;
          }
          const newQty = Math.min(existing.quantity + 1, maxAllowed);
          return prev.map((i) =>
            i.key === newItem.key
              ? {
                  ...i,
                  quantity: newQty,
                  lineTotal: calcLineTotal({ ...i, quantity: newQty }),
                }
              : i,
          );
        }
        const item: PosCartItem = {
          ...newItem,
          quantity: 1,
          itemDiscount: 0,
          lineTotal: newItem.unitPrice,
        };
        return [...prev, item];
      });
    },
    [],
  );

  const handleUpdateQty = useCallback((key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.key !== key) return i;
          const maxAllowed =
            typeof i.countInStock === "number" ? i.countInStock : 9999;
          const qty = Math.min(maxAllowed, Math.max(1, i.quantity + delta));
          return {
            ...i,
            quantity: qty,
            lineTotal: calcLineTotal({ ...i, quantity: qty }),
          };
        })
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const handleUpdateDiscount = useCallback((key: string, discount: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.key === key
          ? {
              ...i,
              itemDiscount: discount,
              lineTotal: calcLineTotal({ ...i, itemDiscount: discount }),
            }
          : i,
      ),
    );
  }, []);

  const handleRemove = useCallback((key: string) => {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const handleApplyCoupon = async (code: string) => {
    setCouponError("");
    if (!code.trim()) {
      handleRemoveCoupon();
      return;
    }
    const itemsSubtotal = cart.reduce((sum, i) => sum + i.lineTotal, 0);
    const itemDiscountsTotal = cart.reduce(
      (sum, i) => sum + i.itemDiscount * i.quantity,
      0,
    );
    const afterItemDiscounts = itemsSubtotal - itemDiscountsTotal;

    const res = await validatePosCouponAction(code, afterItemDiscounts);
    if (res.success && res.data) {
      setCouponCode(code.toUpperCase());
      setCouponDiscountVal(res.data.discountValue);
      setCouponDiscountType(
        res.data.type === "percentage" ? "percent" : "flat",
      );
      setCouponSuccess(`${res.data.name} applied successfully.`);
    } else {
      setCouponError(res.error || "Failed to apply coupon.");
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode("");
    setCouponDiscountVal(0);
    setCouponSuccess("");
    setCouponError("");
  };

  const handleClearCart = () => {
    setCart([]);
    setGlobalDiscount(0);
    setCustomerName("");
    setCustomerPhone("");
    setCouponCode("");
    setCouponDiscountVal(0);
    setCouponSuccess("");
    setCouponError("");
    setShowPayment(false);
    try {
      localStorage.removeItem(POS_CART_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setRefreshKey((k) => k + 1);
  };

  const billData = (() => {
    const itemsSubtotal = cart.reduce((sum, i) => sum + i.lineTotal, 0);
    const itemDiscountsTotal = cart.reduce(
      (sum, i) => sum + i.itemDiscount * i.quantity,
      0,
    );
    const afterItemDiscounts = itemsSubtotal - itemDiscountsTotal;
    const globalDiscountAmt =
      globalDiscountType === "percent"
        ? (afterItemDiscounts * Math.min(globalDiscount, 100)) / 100
        : Math.min(globalDiscount, afterItemDiscounts);

    const couponDiscountAmount =
      couponDiscountType === "percent"
        ? ((afterItemDiscounts - globalDiscountAmt) *
            Math.min(couponDiscountVal, 100)) /
          100
        : Math.min(couponDiscountVal, afterItemDiscounts - globalDiscountAmt);

    const discount =
      itemDiscountsTotal + globalDiscountAmt + couponDiscountAmount;
    const afterAllDiscounts =
      afterItemDiscounts - globalDiscountAmt - couponDiscountAmount;
    const taxAmount = (afterAllDiscounts * taxRate) / 100;
    const total = afterAllDiscounts + taxAmount;
    return {
      subtotal: itemsSubtotal,
      discount,
      taxAmount,
      total,
      couponDiscountAmount,
    };
  })();

  if (!sessionChecked) return null;

  if (!session) {
    return <EmployeeLockScreen onUnlock={(s) => setSession(s)} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top bar */}
      <header className="h-14 shrink-0 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-6 gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/pos"
            className="text-lg font-bold tracking-wider flex items-center"
          >
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent font-extrabold">
              FTC
            </span>
            <span className="text-muted-foreground font-light mx-1.5">|</span>
            <span className="text-sm font-semibold text-foreground/80 tracking-normal">
              Electronics
            </span>
          </Link>
          <span className="text-xs text-muted-foreground font-mono hidden md:inline ml-1">
            {currentDate}
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Link
            href="/pos/history"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <History className="h-3.5 w-3.5" /> History
          </Link>
          <Button variant="outline" size="sm" onClick={handleClearCart} title="Refresh catalog, clear cart & close modal">
            <RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Reset & Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearPosSession();
              clearAllClientSessions();
              setSession(null);
            }}
            title="Switch cashier"
          >
            <User className="h-3.5 w-3.5 text-blue-500" />
            <span className="max-w-[100px] truncate font-semibold">
              {session.name}
            </span>
            <Lock className="h-3 w-3 opacity-60" />
          </Button>
        </div>
      </header>

      {/* Two-panel body */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* LEFT: Scan Terminal */}
        <div className="flex-1 min-w-0 p-4 overflow-hidden flex flex-col">
          <PosScanTerminal
            onAddToCart={handleAddToCart}
            cartItems={cart}
            refreshTrigger={refreshKey}
            currency={currency}
          />
        </div>

        {/* Divider */}
        <div className="w-px bg-border shrink-0" />

        {/* RIGHT: Cart + Bill */}
        <div className="w-[340px] shrink-0 flex flex-col p-4 gap-0 overflow-hidden">
          {/* Cart header */}
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-xs font-bold text-foreground">
              Cart{" "}
              {cart.length > 0 && (
                <span className="text-blue-500">({cart.length})</span>
              )}
            </span>
          </div>

          <PosCart
            items={cart}
            onUpdateQty={handleUpdateQty}
            onUpdateDiscount={handleUpdateDiscount}
            onRemove={handleRemove}
            currency={currency}
          />

          <PosBillSummary
            items={cart}
            globalDiscount={globalDiscount}
            globalDiscountType={globalDiscountType}
            taxRate={taxRate}
            currency={currency}
            onChangeDiscount={setGlobalDiscount}
            onToggleDiscountType={() =>
              setGlobalDiscountType((t) => (t === "flat" ? "percent" : "flat"))
            }
            onCharge={() => setShowPayment(true)}
            isProcessing={isProcessing}
            couponCode={couponCode}
            couponDiscountAmount={billData.couponDiscountAmount}
            couponSuccessMessage={couponSuccess}
            couponErrorMessage={couponError}
            onApplyCoupon={handleApplyCoupon}
            onRemoveCoupon={handleRemoveCoupon}
          />
        </div>
      </div>

      {/* Payment modal */}
      {showPayment && (
        <PosPaymentModal
          cart={cart}
          billData={billData}
          currency={currency}
          session={session}
          customerName={customerName}
          customerPhone={customerPhone}
          onSetCustomer={(name, phone) => {
            setCustomerName(name);
            setCustomerPhone(phone);
          }}
          onClose={() => setShowPayment(false)}
          onSuccess={() => {
            setShowPayment(false);
            handleClearCart();
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
