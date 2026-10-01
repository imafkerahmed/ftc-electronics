"use client";

import React, { useRef } from "react";
import { Printer, X, FileText, CheckCircle2, Building2, User, Phone, Calendar, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CommercialSaleFulfillmentRecord } from "@/app/actions/admin";
import type { PBSale } from "@/types/pos";

interface DeliveryNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  fulfillment: CommercialSaleFulfillmentRecord | null;
  sale: PBSale | null;
}

export function DeliveryNoteModal({
  isOpen,
  onClose,
  fulfillment,
  sale,
}: DeliveryNoteModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !fulfillment) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = fulfillment.created_at
    ? new Date(fulfillment.created_at).toLocaleString("en-LK", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const customerName = sale?.customer_company
    ? `${sale.customer_company} (${sale.customer_name || "Client"})`
    : sale?.customer_name || "Commercial Customer";

  // Group individual physical unit fulfillment items into one line per product/sale item
  const groupedLines = React.useMemo(() => {
    if (!fulfillment?.items || fulfillment.items.length === 0) return [];

    const lines: Array<{
      key: string;
      productName: string;
      quantity: number;
      serialNumbers: string[];
    }> = [];
    const map = new Map<string, (typeof lines)[number]>();

    for (const item of fulfillment.items) {
      // Group by sale_item_id or fallback to product_id / product_name
      const groupKey = item.sale_item_id || item.product_id || item.product_name || item.id;
      let line = map.get(groupKey);

      if (!line) {
        line = {
          key: groupKey,
          productName: item.product_name || "Catalog Product",
          quantity: 0,
          serialNumbers: [],
        };
        map.set(groupKey, line);
        lines.push(line);
      }

      line.quantity += typeof item.quantity === "number" && !isNaN(item.quantity) ? item.quantity : 1;

      if (item.serial_number && item.serial_number.trim()) {
        line.serialNumbers.push(item.serial_number.trim());
      }
    }

    return lines;
  }, [fulfillment?.items]);

  return (
    <>
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #delivery-note-printable-root,
          #delivery-note-printable-root * {
            visibility: visible;
          }
          #delivery-note-printable-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 15mm;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Modal Backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto no-print">
        <div className="relative w-full max-w-3xl rounded-xl bg-card border border-border shadow-2xl overflow-hidden my-8">
          {/* Action Bar (Screen Only) */}
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4 no-print">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">
                Delivery Note Preview
              </h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                {fulfillment.fulfillment_number}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Delivery Note
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Printable Document Area */}
          <div
            id="delivery-note-printable-root"
            ref={printAreaRef}
            className="p-8 bg-white text-slate-900"
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">
                  FTC Electronics
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Commercial Warehouse & Distribution
                </p>
                <p className="text-xs text-slate-500">
                  Colombo, Sri Lanka · www.ftc.lk · +94 11 234 5678
                </p>
              </div>
              <div className="text-right">
                <div className="inline-block px-3 py-1 bg-slate-950 text-white text-xs font-bold tracking-wider uppercase rounded">
                  Delivery Note
                </div>
                <p className="font-mono text-lg font-bold text-slate-950 mt-2">
                  {fulfillment.fulfillment_number}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Date: <span className="font-medium">{formattedDate}</span>
                </p>
              </div>
            </div>

            {/* Document References Grid */}
            <div className="grid grid-cols-2 gap-6 bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-xs">
              <div>
                <span className="text-slate-500 font-medium block uppercase text-[10px] tracking-wider mb-1">
                  Invoice & Customer
                </span>
                <p className="font-semibold text-slate-900 text-sm">
                  {sale?.invoice_number ? `Invoice: ${sale.invoice_number}` : `Sale Ref: ${sale?.receipt_number || "—"}`}
                </p>
                <p className="text-slate-700 font-medium mt-1">{customerName}</p>
                {sale?.customer_phone && (
                  <p className="text-slate-500 font-mono mt-0.5">
                    Phone: {sale.customer_phone}
                  </p>
                )}
              </div>

              <div>
                <span className="text-slate-500 font-medium block uppercase text-[10px] tracking-wider mb-1">
                  Fulfillment Handover To
                </span>
                <p className="font-semibold text-slate-900 text-sm">
                  Recipient: {fulfillment.recipient_name || sale?.customer_name || "Authorized Representative"}
                </p>
                {fulfillment.recipient_phone && (
                  <p className="text-slate-700 font-mono mt-1">
                    Contact: {fulfillment.recipient_phone}
                  </p>
                )}
                <p className="text-slate-500 mt-1">
                  Handed Over By:{" "}
                  <span className="font-medium text-slate-800">
                    {fulfillment.handed_over_by_name}
                  </span>
                </p>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-6">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-slate-600 uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-3 font-bold w-12 text-center">#</th>
                    <th className="py-2 px-3 font-bold">Item Description</th>
                    <th className="py-2 px-3 font-bold text-center w-20">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {groupedLines.length > 0 ? (
                    groupedLines.map((line, idx) => (
                      <tr key={line.key || idx} className="text-slate-800">
                        <td className="py-2 px-3 text-center font-mono text-slate-500 align-top">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 align-top">
                          <div className="font-semibold text-slate-900 text-xs leading-snug">
                            {line.productName}
                          </div>
                          {line.serialNumbers.length > 0 && (
                            <div className="mt-0.5 text-[11px] leading-relaxed font-mono text-slate-600 break-words">
                              <span className="font-bold text-slate-700 select-none">SN: </span>
                              {line.serialNumbers.join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-900 align-top">
                          {line.quantity}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-slate-500 italic">
                        No item records attached to this delivery note.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Notes if Present */}
            {fulfillment.notes && (
              <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded text-xs">
                <span className="text-slate-500 font-medium block uppercase text-[10px] tracking-wider mb-0.5">
                  Handover Notes
                </span>
                <p className="text-slate-700 italic">{fulfillment.notes}</p>
              </div>
            )}

            {/* Signatures & Certification Footer */}
            <div className="mt-12 pt-6 border-t border-slate-200 grid grid-cols-2 gap-12 text-xs">
              <div>
                <p className="text-slate-500 mb-10 text-[10px] uppercase tracking-wider font-semibold">
                  Dispatched By (Warehouse Officer)
                </p>
                <div className="border-t border-slate-300 pt-2">
                  <p className="font-bold text-slate-900">{fulfillment.handed_over_by_name}</p>
                  <p className="text-slate-500 text-[10px]">FTC Electronics Warehouse</p>
                </div>
              </div>

              <div>
                <p className="text-slate-500 mb-10 text-[10px] uppercase tracking-wider font-semibold">
                  Received In Good Condition (Customer / Courier)
                </p>
                <div className="border-t border-slate-300 pt-2">
                  <p className="font-bold text-slate-900">
                    {fulfillment.recipient_name || "Signature & Date"}
                  </p>
                  <p className="text-slate-500 text-[10px]">Recipient Sign & Seal</p>
                </div>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-8 text-center text-[10px] text-slate-400 border-t border-slate-100 pt-3">
              This document serves as proof of physical handover. It does not alter financial balances or payment agreements.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
