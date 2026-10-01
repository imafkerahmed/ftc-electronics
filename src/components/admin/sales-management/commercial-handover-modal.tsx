"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  PackageCheck,
  X,
  AlertTriangle,
  Barcode,
  Search,
  CheckCircle2,
  Loader2,
  Plus,
  Minus,
  Trash2,
  Printer,
  History,
  Info,
  ShieldAlert,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fulfillCommercialSaleItemsAction,
  getAvailableUnitsForCommercialHandoverAction,
  getCommercialSaleFulfillmentsAction,
  type AvailableStockUnit,
  type CommercialSaleFulfillmentRecord,
} from "@/app/actions/admin";
import type { PBSale, PBSaleItem } from "@/types/pos";

interface CommercialHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: PBSale | null;
  items: PBSaleItem[];
  onSuccess: (fulfillmentRecord: CommercialSaleFulfillmentRecord) => void;
  onPrintInvoice?: () => void;
  onOpenHistory?: () => void;
  onOpenDeliveryNote?: (fulfillment: CommercialSaleFulfillmentRecord) => void;
}

interface LineHandoverState {
  saleItemId: string;
  quantity: number;
  selectedUnitIds: string[];
  nonInventoryConfirmed: boolean;
}

function generateClientUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* fallback below */
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function CommercialHandoverModal({
  isOpen,
  onClose,
  sale,
  items,
  onSuccess,
  onPrintInvoice,
  onOpenHistory,
  onOpenDeliveryNote,
}: CommercialHandoverModalProps) {
  // Session Idempotency Key (Preserved on retry, generated once per handover modal session)
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");

  // Recipient state
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientPhone, setRecipientPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Handover state per line item
  const [lineStates, setLineStates] = useState<Record<string, LineHandoverState>>({});

  // Available units per product cache { [productId: string]: AvailableStockUnit[] }
  const [availableUnitsMap, setAvailableUnitsMap] = useState<Record<string, AvailableStockUnit[]>>({});
  const [loadingUnitsForProduct, setLoadingUnitsForProduct] = useState<Record<string, boolean>>({});

  // Unit scanner inputs { [saleItemId: string]: string }
  const [scannerInputs, setScannerInputs] = useState<Record<string, string>>({});
  const [scannerErrors, setScannerErrors] = useState<Record<string, string>>({});

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Success state
  const [completedFulfillment, setCompletedFulfillment] = useState<CommercialSaleFulfillmentRecord | null>(null);

  const fetchAvailableUnits = async (productId: string) => {
    setLoadingUnitsForProduct((prev) => ({ ...prev, [productId]: true }));
    try {
      const res = await getAvailableUnitsForCommercialHandoverAction(productId);
      if (res.success && res.data) {
        setAvailableUnitsMap((prev) => ({ ...prev, [productId]: res.data || [] }));
      }
    } catch (err) {
      console.error("[CommercialHandoverModal] Failed to load units:", err);
    } finally {
      setLoadingUnitsForProduct((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // Initialize or reset state when modal opens
  useEffect(() => {
    if (isOpen && sale) {
      setIdempotencyKey(generateClientUUID());
      setRecipientName(sale.customer_name || "");
      setRecipientPhone(sale.customer_phone || "");
      setNotes("");
      setSubmitError(null);
      setCompletedFulfillment(null);
      setScannerInputs({});
      setScannerErrors({});

      // Initialize line states
      const initialLines: Record<string, LineHandoverState> = {};
      const unitProductIdsToFetch = new Set<string>();

      items.forEach((item) => {
        const remaining = Math.max(0, item.quantity - (item.quantity_fulfilled || 0));
        if (remaining > 0) {
          const isUnit = item.inventory_tracking_type === "unit";
          initialLines[item.id] = {
            saleItemId: item.id,
            quantity: isUnit ? 0 : remaining, // Counter defaults to remaining; Unit defaults to 0 selected
            selectedUnitIds: [],
            nonInventoryConfirmed: false,
          };

          if (isUnit && item.product_id) {
            unitProductIdsToFetch.add(item.product_id);
          }
        }
      });

      setLineStates(initialLines);

      // Fetch available units for all unit-tracked products in this invoice
      unitProductIdsToFetch.forEach((pId) => {
        fetchAvailableUnits(pId);
      });
    }
  }, [isOpen, sale, items]);

  if (!isOpen || !sale) return null;

  // Filter fulfillable items
  const fulfillableItems = items.filter(
    (item) => Math.max(0, item.quantity - (item.quantity_fulfilled || 0)) > 0
  );

  // Payment status warning
  const isUnpaid = sale?.payment_status === "UNPAID" || sale?.isPaid === false;
  const isBalancePending = sale?.payment_status === "BALANCE PENDING";

  // Scanner keydown handler for unit products
  const handleScannerKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    saleItemId: string,
    productId: string,
    remainingQty: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = (scannerInputs[saleItemId] || "").trim();
      if (!code) return;

      const currentState = lineStates[saleItemId] || {
        saleItemId,
        quantity: 0,
        selectedUnitIds: [],
        nonInventoryConfirmed: false,
      };

      const availableUnits = availableUnitsMap[productId] || [];

      // Check max quantity constraint
      if (currentState.selectedUnitIds.length >= remainingQty) {
        setScannerErrors((prev) => ({
          ...prev,
          [saleItemId]: `Cannot select more than remaining quantity (${remainingQty}).`,
        }));
        return;
      }

      // Check for match in available units for this product
      const match = availableUnits.find(
        (u) =>
          u.barcode?.toLowerCase() === code.toLowerCase() ||
          u.serial_number?.toLowerCase() === code.toLowerCase()
      );

      if (!match) {
        setScannerErrors((prev) => ({
          ...prev,
          [saleItemId]: `Unit "${code}" not found among available stock for this product.`,
        }));
        return;
      }

      // Check if already selected
      if (currentState.selectedUnitIds.includes(match.id)) {
        setScannerErrors((prev) => ({
          ...prev,
          [saleItemId]: `Unit "${match.serial_number || match.barcode}" is already selected.`,
        }));
        return;
      }

      // Add unit safely
      const updatedUnitIds = [...currentState.selectedUnitIds, match.id];
      setLineStates((prev) => ({
        ...prev,
        [saleItemId]: {
          ...currentState,
          selectedUnitIds: updatedUnitIds,
          quantity: updatedUnitIds.length,
        },
      }));

      // Clear input and error, retain focus
      setScannerInputs((prev) => ({ ...prev, [saleItemId]: "" }));
      setScannerErrors((prev) => ({ ...prev, [saleItemId]: "" }));
    }
  };

  // Add unit manually from dropdown
  const handleAddUnitManually = (
    saleItemId: string,
    unitId: string,
    remainingQty: number
  ) => {
    if (!unitId) return;
    const currentState = lineStates[saleItemId] || {
      saleItemId,
      quantity: 0,
      selectedUnitIds: [],
      nonInventoryConfirmed: false,
    };

    if (currentState.selectedUnitIds.includes(unitId)) return;
    if (currentState.selectedUnitIds.length >= remainingQty) return;

    const updatedUnitIds = [...currentState.selectedUnitIds, unitId];
    setLineStates((prev) => ({
      ...prev,
      [saleItemId]: {
        ...currentState,
        selectedUnitIds: updatedUnitIds,
        quantity: updatedUnitIds.length,
      },
    }));
    setScannerErrors((prev) => ({ ...prev, [saleItemId]: "" }));
  };

  // Remove selected unit
  const handleRemoveUnit = (saleItemId: string, unitId: string) => {
    const currentState = lineStates[saleItemId];
    if (!currentState) return;

    const updatedUnitIds = currentState.selectedUnitIds.filter((id) => id !== unitId);
    setLineStates((prev) => ({
      ...prev,
      [saleItemId]: {
        ...currentState,
        selectedUnitIds: updatedUnitIds,
        quantity: updatedUnitIds.length,
      },
    }));
  };

  // Stepper handlers for counter products
  const handleCounterChange = (
    saleItemId: string,
    newQty: number,
    remainingQty: number
  ) => {
    const clamped = Math.max(0, Math.min(newQty, remainingQty));
    setLineStates((prev) => ({
      ...prev,
      [saleItemId]: {
        ...(prev[saleItemId] || {
          saleItemId,
          quantity: 0,
          selectedUnitIds: [],
          nonInventoryConfirmed: false,
        }),
        quantity: clamped,
      },
    }));
  };

  // Checkbox handler for unclassified lines
  const handleNonInventoryToggle = (saleItemId: string, checked: boolean) => {
    setLineStates((prev) => ({
      ...prev,
      [saleItemId]: {
        ...(prev[saleItemId] || {
          saleItemId,
          quantity: 0,
          selectedUnitIds: [],
          nonInventoryConfirmed: false,
        }),
        nonInventoryConfirmed: checked,
      },
    }));
  };

  // Calculate total units / items being submitted
  const selectedLinesToSubmit = Object.values(lineStates).filter((ls) => {
    const it = items.find((i) => i.id === ls.saleItemId);
    if (!it) return false;

    if (it.product_id === null) {
      // Must have quantity > 0 AND nonInventoryConfirmed === true
      return ls.quantity > 0 && ls.nonInventoryConfirmed;
    }

    if (it.inventory_tracking_type === "unit") {
      return ls.selectedUnitIds.length > 0;
    }

    return ls.quantity > 0;
  });

  const totalUnitsSubmitting = selectedLinesToSubmit.reduce(
    (sum, ls) => sum + ls.quantity,
    0
  );

  // Submit handover request
  const handleSubmit = async () => {
    if (selectedLinesToSubmit.length === 0) {
      setSubmitError("Please select at least one item and quantity to hand over.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      saleId: sale.id,
      idempotencyKey,
      recipientName: recipientName.trim() || undefined,
      recipientPhone: recipientPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      items: selectedLinesToSubmit.map((ls) => {
        const it = items.find((i) => i.id === ls.saleItemId);
        const isNullProduct = it?.product_id === null;
        return {
          saleItemId: ls.saleItemId,
          quantity: ls.quantity,
          nonInventoryLine: isNullProduct ? ls.nonInventoryConfirmed : undefined,
          unitIds: it?.inventory_tracking_type === "unit" ? ls.selectedUnitIds : undefined,
        };
      }),
    };

    try {
      const res = await fulfillCommercialSaleItemsAction(payload);
      if (!res.success) {
        setSubmitError(res.error || "Failed to process goods handover.");
        setIsSubmitting(false);
        return;
      }

      // Fetch the full record with items for the delivery note view
      const historyRes = await getCommercialSaleFulfillmentsAction(sale.id);
      let createdRecord: CommercialSaleFulfillmentRecord | null = null;
      if (historyRes.success && historyRes.data && historyRes.data.length > 0) {
        createdRecord =
          historyRes.data.find(
            (f) => f.id === res.data.fulfillment_id || f.fulfillment_number === res.data.fulfillment_number
          ) || historyRes.data[0];
      }

      const finalRecord: CommercialSaleFulfillmentRecord = createdRecord || {
        id: res.data.fulfillment_id,
        sale_id: sale.id,
        fulfillment_number: res.data.fulfillment_number,
        idempotency_key: idempotencyKey,
        handed_over_by_profile_id: null,
        handed_over_by_name: res.data.handed_over_by_name || "Admin Staff",
        recipient_name: recipientName.trim() || null,
        recipient_phone: recipientPhone.trim() || null,
        notes: notes.trim() || null,
        created_at: new Date().toISOString(),
        items: [],
      };

      setCompletedFulfillment(finalRecord);
      onSuccess(finalRecord);
    } catch (err: any) {
      console.error("[CommercialHandoverModal] Submit Error:", err);
      setSubmitError(err.message || "An unexpected error occurred during handover.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl bg-card border border-border shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Commercial Stock Handover
              </h2>
              <p className="text-xs text-muted-foreground">
                Invoice {sale.invoice_number || sale.receipt_number} ·{" "}
                {sale.customer_company || sale.customer_name || "Customer"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* SUCCESS STATE */}
          {completedFulfillment ? (
            <div className="text-center py-8 space-y-4">
              <div className="h-16 w-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Products Handed Over Successfully
              </h3>
              <p className="text-sm text-muted-foreground">
                Handover Reference:{" "}
                <span className="font-mono font-bold text-foreground text-base px-2 py-0.5 bg-muted rounded">
                  {completedFulfillment.fulfillment_number}
                </span>
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Inventory has been deducted authoritatively. Handed-over serial numbers are now attached to the Commercial Invoice.
              </p>

              <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
                {onPrintInvoice && (
                  <Button
                    onClick={() => {
                      onClose();
                      onPrintInvoice();
                    }}
                    className="gap-2 bg-primary text-primary-foreground font-semibold shadow-sm"
                  >
                    <Printer className="h-4 w-4" />
                    View / Print Invoice
                  </Button>
                )}

                {onOpenDeliveryNote && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onOpenDeliveryNote(completedFulfillment);
                    }}
                    className="gap-2 text-muted-foreground"
                  >
                    <FileText className="h-4 w-4" />
                    Print Delivery Note (Optional)
                  </Button>
                )}

                {onOpenHistory && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onOpenHistory();
                    }}
                    className="gap-2"
                  >
                    <History className="h-4 w-4" />
                    View Handover History
                  </Button>
                )}

                <Button variant="ghost" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Payment Warning Banners (Informational Only) */}
              {isUnpaid && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Payment Notice:</span> Payment has not been recorded for this invoice (UNPAID). Payment status does not prevent goods handover.
                  </div>
                </div>
              )}

              {isBalancePending && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Payment Notice:</span> This invoice has an outstanding balance (BALANCE PENDING). Payment status does not prevent goods handover.
                  </div>
                </div>
              )}

              {/* Server Error Alert */}
              {submitError && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Handover Blocked:</span> {submitError}
                  </div>
                </div>
              )}

              {/* Line Items List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Select Products to Hand Over ({fulfillableItems.length} Remaining)
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Selected for this event:{" "}
                    <strong className="text-foreground">{totalUnitsSubmitting}</strong>
                  </span>
                </div>

                {fulfillableItems.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
                    All items on this commercial invoice have already been fully handed over.
                  </div>
                ) : (
                  fulfillableItems.map((item) => {
                    const remaining = Math.max(0, item.quantity - (item.quantity_fulfilled || 0));
                    const isUnit = item.inventory_tracking_type === "unit";
                    const isNullProduct = item.product_id === null;
                    const lState = lineStates[item.id] || {
                      saleItemId: item.id,
                      quantity: 0,
                      selectedUnitIds: [],
                      nonInventoryConfirmed: false,
                    };
                    const availableUnits = item.product_id ? availableUnitsMap[item.product_id] || [] : [];
                    const loadingUnits = item.product_id ? loadingUnitsForProduct[item.product_id] : false;

                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border bg-card p-4 space-y-3 transition-colors hover:border-primary/40"
                      >
                        {/* Item Header */}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h4 className="font-semibold text-foreground text-sm">
                              {item.product_name}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>Total Qty: <strong className="text-foreground">{item.quantity}</strong></span>
                              <span>·</span>
                              <span>Fulfilled: <strong className="text-foreground">{item.quantity_fulfilled || 0}</strong></span>
                              <span>·</span>
                              <span>Remaining: <strong className="text-primary">{remaining}</strong></span>
                            </div>
                          </div>

                          {/* Tracking Badge */}
                          <div>
                            {isNullProduct ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                Unclassified Line
                              </span>
                            ) : isUnit ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20">
                                Exact Physical Units
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                Counter Stock (Avail: {item.count_in_stock ?? "—"})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* CASE 1: UNCLASSIFIED LINE (product_id = NULL) */}
                        {isNullProduct && (
                          <div className="space-y-3 pt-2 border-t border-border">
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 text-xs text-amber-600 dark:text-amber-400 space-y-1">
                              <p className="font-semibold">⚠️ Unclassified Non-Catalog Line</p>
                              <p>
                                This invoice line is not linked to a catalog product. For older invoices, this may represent a physical item whose product identity was not recorded.
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                If this line represents a physical catalog product, do not continue with this line as non-inventory. Resolve its product identity separately.
                              </p>
                            </div>

                            <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={lState.nonInventoryConfirmed}
                                onChange={(e) => handleNonInventoryToggle(item.id, e.target.checked)}
                                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                              />
                              <span className="font-medium">
                                Confirm this line does not require tracked inventory deduction
                              </span>
                            </label>

                            {lState.nonInventoryConfirmed && (
                              <div className="flex items-center gap-3 pt-1">
                                <span className="text-xs text-muted-foreground">Quantity to hand over:</span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleCounterChange(item.id, lState.quantity - 1, remaining)}
                                    disabled={lState.quantity <= 0}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-10 text-center font-mono font-bold text-sm">
                                    {lState.quantity}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleCounterChange(item.id, lState.quantity + 1, remaining)}
                                    disabled={lState.quantity >= remaining}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* CASE 2: COUNTER STOCK PRODUCT */}
                        {!isNullProduct && !isUnit && (
                          <div className="flex items-center justify-between pt-2 border-t border-border">
                            <span className="text-xs text-muted-foreground">
                              Handover Quantity:
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleCounterChange(item.id, lState.quantity - 1, remaining)}
                                disabled={lState.quantity <= 0}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <Input
                                type="number"
                                min={0}
                                max={remaining}
                                value={lState.quantity}
                                onChange={(e) =>
                                  handleCounterChange(
                                    item.id,
                                    parseInt(e.target.value) || 0,
                                    remaining
                                  )
                                }
                                className="w-16 h-8 text-center font-mono font-bold text-sm"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleCounterChange(item.id, lState.quantity + 1, remaining)}
                                disabled={lState.quantity >= remaining}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCounterChange(item.id, remaining, remaining)}
                                className="text-xs text-primary"
                              >
                                All ({remaining})
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* CASE 3: UNIT TRACKED PRODUCT */}
                        {!isNullProduct && isUnit && (
                          <div className="space-y-3 pt-2 border-t border-border">
                            {/* Scanner Barcode Input */}
                            <div>
                              <div className="relative">
                                <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Scan barcode or serial number (Press Enter)..."
                                  value={scannerInputs[item.id] || ""}
                                  onChange={(e) =>
                                    setScannerInputs((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) =>
                                    handleScannerKeyDown(e, item.id, item.product_id!, remaining)
                                  }
                                  className="pl-9 h-9 text-xs font-mono"
                                  disabled={lState.selectedUnitIds.length >= remaining}
                                />
                              </div>
                              {scannerErrors[item.id] && (
                                <p className="text-[11px] text-destructive mt-1 font-medium">
                                  {scannerErrors[item.id]}
                                </p>
                              )}
                            </div>

                            {/* Manual Selection Dropdown */}
                            <div className="flex items-center gap-2">
                              <select
                                className="w-full text-xs h-8 rounded border border-border bg-background px-2.5 text-foreground font-mono focus:ring-1 focus:ring-primary"
                                onChange={(e) => {
                                  handleAddUnitManually(item.id, e.target.value, remaining);
                                  e.target.value = "";
                                }}
                                disabled={lState.selectedUnitIds.length >= remaining || loadingUnits}
                                defaultValue=""
                              >
                                <option value="" disabled>
                                  {loadingUnits
                                    ? "Loading available units..."
                                    : availableUnits.length === 0
                                    ? "No available units in stock"
                                    : "— Or select available unit from warehouse —"}
                                </option>
                                {availableUnits
                                  .filter((u) => !lState.selectedUnitIds.includes(u.id))
                                  .map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.serial_number ? `SN: ${u.serial_number}` : ""}
                                      {u.barcode ? ` · BC: ${u.barcode}` : ""}
                                    </option>
                                  ))}
                              </select>
                              <span className="text-xs font-mono font-semibold whitespace-nowrap text-muted-foreground">
                                {lState.selectedUnitIds.length} / {remaining} selected
                              </span>
                            </div>

                            {/* Selected Units Chips */}
                            {lState.selectedUnitIds.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {lState.selectedUnitIds.map((uId) => {
                                  const unit = availableUnits.find((u) => u.id === uId);
                                  return (
                                    <span
                                      key={uId}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted border border-border text-xs font-mono"
                                    >
                                      <span className="font-semibold text-foreground">
                                        {unit?.serial_number || unit?.barcode || uId.slice(0, 8)}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveUnit(item.id, uId)}
                                        className="text-muted-foreground hover:text-destructive"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Recipient Details & Notes */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Handover Dispatched To
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                      Recipient / Courier Name
                    </label>
                    <Input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Receiver's name"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                      Recipient Contact Phone
                    </label>
                    <Input
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="Phone number"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                      Handover Notes / Special Instructions
                    </label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Delivered via PickMe Courier, verified seal intact"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Physical Consequence Notice */}
              <div className="text-[11px] text-muted-foreground bg-muted/40 border border-border rounded-lg p-3">
                <span className="font-semibold text-foreground">Authoritative Action:</span> Confirming this handover will permanently deduct selected physical inventory and generate an immutable Delivery Note (DN). This action cannot be revoked without formal customer product return.
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        {!completedFulfillment && (
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-6 py-4">
            <span className="text-xs text-muted-foreground">
              Total items: <strong className="text-foreground">{totalUnitsSubmitting}</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || totalUnitsSubmitting === 0}
                className="gap-2 bg-primary text-primary-foreground font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Handover...
                  </>
                ) : (
                  <>
                    <PackageCheck className="h-4 w-4" />
                    Confirm Handover
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
