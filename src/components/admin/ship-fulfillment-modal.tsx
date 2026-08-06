'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getAvailableUnitsForOrderAction,
  shipOrderWithSerialsAction,
  type OrderFulfillmentDetails,
  type OrderFulfillmentItem,
} from '@/app/actions/order-fulfillment';
import { Loader2, Truck, QrCode, CheckCircle2, AlertCircle, PackageCheck, Barcode } from 'lucide-react';

interface ShipFulfillmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  onSuccess: (message: string) => void;
}

export default function ShipFulfillmentModal({
  isOpen,
  onClose,
  orderId,
  onSuccess,
}: ShipFulfillmentModalProps) {
  const [details, setDetails] = useState<OrderFulfillmentDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [courierName, setCourierName] = useState('Prompt Express');
  const [trackingNumber, setTrackingNumber] = useState('');
  
  // Map of itemIndex -> assigned array of { unitId, barcode, serialNumber }
  const [assignments, setAssignments] = useState<Record<number, Array<{ unitId: string; barcode: string; serialNumber?: string }>>>({});

  // Scan input per itemIndex
  const [scanInputs, setScanInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isOpen || !orderId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setAssignments({});
    setScanInputs({});
    setTrackingNumber('');

    async function loadData() {
      const res = await getAvailableUnitsForOrderAction(orderId!);
      if (!isMounted) return;

      if (res.success && res.fulfillmentDetails) {
        setDetails(res.fulfillmentDetails);
        
        // Smart auto-preselect available serial numbers by default for quick one-click fulfillment
        const initialAssignments: Record<number, Array<{ unitId: string; barcode: string; serialNumber?: string }>> = {};
        res.fulfillmentDetails.items.forEach((item, itemIdx) => {
          const slots: Array<{ unitId: string; barcode: string; serialNumber?: string }> = [];
          for (let slotIdx = 0; slotIdx < item.quantity; slotIdx++) {
            if (slotIdx < item.availableUnits.length) {
              const u = item.availableUnits[slotIdx];
              slots.push({ unitId: u.id, barcode: u.barcode, serialNumber: u.serialNumber });
            }
          }
          initialAssignments[itemIdx] = slots;
        });
        setAssignments(initialAssignments);
      } else {
        setError(res.error || 'Failed to load order details for fulfillment.');
      }
      setLoading(false);
    }

    void loadData();
    return () => {
      isMounted = false;
    };
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  // Calculate overall completion stats
  let totalRequiredUnits = 0;
  let totalAssignedUnits = 0;

  if (details) {
    details.items.forEach((item, idx) => {
      totalRequiredUnits += item.quantity;
      totalAssignedUnits += (assignments[idx] || []).length;
    });
  }

  const isComplete = totalRequiredUnits > 0 && totalAssignedUnits === totalRequiredUnits;

  const handleSelectUnit = (itemIdx: number, slotIdx: number, unitId: string) => {
    if (!details) return;
    const item = details.items[itemIdx];
    const unit = item.availableUnits.find((u) => u.id === unitId);

    setAssignments((prev) => {
      const currentList = [...(prev[itemIdx] || [])];
      if (unit) {
        currentList[slotIdx] = { unitId: unit.id, barcode: unit.barcode, serialNumber: unit.serialNumber };
      } else {
        currentList.splice(slotIdx, 1);
      }
      return { ...prev, [itemIdx]: currentList };
    });
  };

  const handleScanBarcode = (itemIdx: number, scanValue: string) => {
    if (!details || !scanValue.trim()) return;
    setError(null);
    const item = details.items[itemIdx];
    const cleanScan = scanValue.trim().toLowerCase();

    // Find unit matching barcode or serial number
    let matchedUnit = item.availableUnits.find(
      (u) => u.barcode.toLowerCase() === cleanScan || (u.serialNumber && u.serialNumber.toLowerCase() === cleanScan)
    );

    if (!matchedUnit) {
      // Create new unit candidate dynamically on the fly
      const newUnit = {
        id: `custom_${item.productId}_${Date.now()}`,
        productId: item.productId,
        barcode: scanValue.trim(),
        serialNumber: scanValue.trim(),
        batchNumber: 'SCANNED',
      };
      item.availableUnits.unshift(newUnit);
      matchedUnit = newUnit;
    }

    // Find first unassigned slot
    const currentList = [...(assignments[itemIdx] || [])];
    let assignedIndex = -1;
    for (let i = 0; i < item.quantity; i++) {
      if (!currentList[i]) {
        assignedIndex = i;
        break;
      }
    }

    if (assignedIndex === -1) {
      assignedIndex = 0; // Overwrite first slot if all assigned
    }

    currentList[assignedIndex] = {
      unitId: matchedUnit.id,
      barcode: matchedUnit.barcode,
      serialNumber: matchedUnit.serialNumber,
    };
    setAssignments((prev) => ({ ...prev, [itemIdx]: currentList }));
    setScanInputs((prev) => ({ ...prev, [itemIdx]: '' }));
  };

  const handleSubmit = () => {
    if (!details || !isComplete) return;
    setError(null);

    const allPayloadAssignments: Array<{ productId: string; unitId: string; barcode: string; serialNumber?: string }> = [];
    details.items.forEach((item, itemIdx) => {
      const list = assignments[itemIdx] || [];
      list.forEach((unit) => {
        if (unit?.unitId) {
          allPayloadAssignments.push({
            productId: item.productId,
            unitId: unit.unitId,
            barcode: unit.barcode,
            serialNumber: unit.serialNumber,
          });
        }
      });
    });

    startTransition(async () => {
      const res = await shipOrderWithSerialsAction({
        orderId: details.orderId,
        courierName,
        trackingNumber,
        assignments: allPayloadAssignments,
      });

      if (res.success) {
        onSuccess(`Order #${details.orderNumber} has been shipped successfully with assigned serial numbers!`);
        onClose();
      } else {
        setError(res.error || 'Failed to complete shipping fulfillment.');
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-card border-border">
        {/* Modal Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-wide">
                Ship & Fulfill Order #{details?.orderNumber || ''}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Assign physical item serial numbers / barcodes before dispatching package.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 border border-red-500/25 rounded-xl text-red-500 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="text-xs">Loading available inventory unit barcodes...</span>
            </div>
          ) : details ? (
            <>
              {/* Customer & Courier Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/40 rounded-xl border border-border text-xs">
                <div>
                  <span className="text-muted-foreground uppercase font-bold text-[10px] block mb-1">Customer Details</span>
                  <p className="font-semibold text-foreground">{details.customerName}</p>
                  <p className="text-muted-foreground mt-0.5">{details.customerEmail}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-muted-foreground uppercase font-bold text-[10px] block mb-1">Courier Partner</label>
                    <Input
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      placeholder="e.g. Prompt Express, Pronto, Fardar, DHL"
                      className="h-8 bg-background border-border text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground uppercase font-bold text-[10px] block mb-1">Tracking Number (Optional)</label>
                    <Input
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g. TRK-982103"
                      className="h-8 bg-background border-border text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Progress Summary Header */}
              <div className="flex items-center justify-between p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-foreground">Serial Assignment Status</span>
                </div>
                <span className={`font-bold px-2.5 py-0.5 rounded-full ${isComplete ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                  {totalAssignedUnits} / {totalRequiredUnits} Units Assigned
                </span>
              </div>

              {/* Items Serial Assignment List */}
              <div className="space-y-4">
                {details.items.map((item, itemIdx) => {
                  const assignedForThisItem = assignments[itemIdx] || [];

                  return (
                    <div key={itemIdx} className="bg-card border border-border rounded-xl p-4 space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">{item.name}</h4>
                          <span className="text-xs text-muted-foreground">Quantity required: {item.quantity} unit{item.quantity === 1 ? '' : 's'}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {item.availableUnits.length} available in inventory
                        </span>
                      </div>

                      {/* Barcode Scanner Input */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Barcode className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                          <Input
                            placeholder={`Scan or type barcode/serial for ${item.name}...`}
                            value={scanInputs[itemIdx] || ''}
                            onChange={(e) => setScanInputs((prev) => ({ ...prev, [itemIdx]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleScanBarcode(itemIdx, scanInputs[itemIdx] || '');
                              }
                            }}
                            className="h-9 pl-9 bg-background border-border text-xs font-mono"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleScanBarcode(itemIdx, scanInputs[itemIdx] || '')}
                          className="h-9 px-3 text-xs"
                        >
                          <QrCode className="h-3.5 w-3.5 mr-1" />
                          Scan Unit
                        </Button>
                      </div>

                      {/* Unit Slots */}
                      <div className="space-y-2 pt-1">
                        {Array.from({ length: item.quantity }).map((_, slotIdx) => {
                          const assigned = assignedForThisItem[slotIdx];

                          return (
                            <div key={slotIdx} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-secondary/30 p-2.5 rounded-lg border border-border text-xs min-w-0 overflow-hidden">
                              <span className="font-semibold text-muted-foreground w-24 shrink-0">Unit {slotIdx + 1} of {item.quantity}:</span>
                              
                              <select
                                value={assigned?.unitId || ''}
                                onChange={(e) => handleSelectUnit(itemIdx, slotIdx, e.target.value)}
                                className="flex-1 min-w-0 w-full h-8 bg-background border border-border rounded px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
                              >
                                <option value="">-- Select Available Serial Number / Barcode --</option>
                                {item.availableUnits.map((unit) => {
                                  // Check if unit is selected in another slot
                                  const isSelectedInOtherSlot = Object.values(assignments).some((list) =>
                                    list.some((a, idx) => a?.unitId === unit.id && !(itemIdx === itemIdx && idx === slotIdx))
                                  );

                                  return (
                                    <option key={unit.id} value={unit.id} disabled={isSelectedInOtherSlot}>
                                      {unit.serialNumber ? `S/N: ${unit.serialNumber} | Barcode: ${unit.barcode}` : `Barcode: ${unit.barcode}`} {unit.batchNumber ? `(${unit.batchNumber})` : ''} {isSelectedInOtherSlot ? '(Selected)' : ''}
                                    </option>
                                  );
                                })}
                              </select>

                              {assigned?.unitId ? (
                                <span className="flex items-center gap-1 text-emerald-500 text-[11px] font-bold shrink-0">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Assigned
                                </span>
                              ) : (
                                <span className="text-amber-500 text-[11px] font-medium shrink-0">
                                  Required
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <DialogFooter className="p-4 border-t border-border bg-secondary/20 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>

          <Button
            onClick={handleSubmit}
            disabled={!isComplete || isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 h-9 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                Processing Shipping...
              </>
            ) : (
              <>
                <Truck className="h-3.5 w-3.5 mr-2" />
                Complete Shipping Fulfillment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
