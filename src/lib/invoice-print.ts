import { type InvoicePrintConfig, normalizeInvoiceConfig } from '@/types/invoice-config';

export interface InvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  serialNumber?: string;
}

export interface InvoiceData {
  docType: 'Invoice' | 'Quotation';
  docNumber: string;
  date: string;
  dueDate?: string;
  customerName?: string;
  customerCompany?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: InvoiceItem[];
  subtotal: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  paymentMethod?: string;
  notes?: string;
}

export function printInvoice(
  rawCfg: InvoicePrintConfig,
  data: InvoiceData,
  title = 'Sales Document'
) {
  const cfg = normalizeInvoiceConfig(rawCfg);

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const isThermal = cfg.paperWidthMm <= 100;
  const currency = 'Rs.';
  const docHeading = data.docType === 'Quotation'
    ? 'QUOTATION'
    : (cfg.documentTitle || 'INVOICE');

  const itemsHtml = data.items
    .map((item, index) => {
      const lineTotal = item.qty * item.unitPrice - (item.discount || 0);
      const serialHtml = item.serialNumber
        ? `<div class="item-sn">SN: ${item.serialNumber}</div>`
        : '';
      return `
        <tr>
          <td class="col-idx">${String(index + 1).padStart(2, '0')}</td>
          <td class="col-desc">
            <span class="item-title">${item.name}</span>
            ${serialHtml}
          </td>
          <td class="col-num">${item.qty}</td>
          <td class="col-num">${currency} ${item.unitPrice.toLocaleString()}</td>
          <td class="col-num">${item.discount ? '-' + currency + ' ' + item.discount.toLocaleString() : '—'}</td>
          <td class="col-num total-cell">${currency} ${lineTotal.toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${docHeading} \u2014 ${data.docNumber}</title>
        ${cfg.showQrCode ? '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>' : ''}
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

          @page {
            size: ${cfg.paperWidthMm}mm auto;
            margin: ${isThermal ? '0' : '12mm'};
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: ${cfg.fontSizeMm}mm;
            line-height: 1.5;
            color: #1e293b;
            background: #fff;
            width: ${cfg.paperWidthMm}mm;
            padding: ${isThermal ? '4mm 3mm' : '8mm 10mm'};
            margin: 0 auto;
            -webkit-print-color-adjust: exact;
          }

          /* Header Section */
          .top-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding-bottom: 20px;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 24px;
          }
          .brand-title {
            font-size: ${cfg.fontSizeMm + 3}mm;
            font-weight: 800;
            letter-spacing: -0.03em;
            color: #0f172a;
          }
          .brand-sub {
            font-size: ${Math.max(2.2, cfg.fontSizeMm - 0.7)}mm;
            color: #64748b;
            margin-top: 3px;
            font-weight: 400;
          }
          .doc-header-right {
            text-align: right;
          }
          .doc-type-title {
            font-size: ${cfg.fontSizeMm + 3.5}mm;
            font-weight: 800;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: #0f172a;
          }
          .doc-meta-line {
            font-size: ${Math.max(2.4, cfg.fontSizeMm - 0.5)}mm;
            color: #475569;
            margin-top: 4px;
          }
          .doc-meta-line strong {
            color: #0f172a;
            font-weight: 600;
          }

          /* Customer Section */
          .customer-section {
            margin-bottom: 24px;
          }
          .section-label {
            font-size: ${Math.max(2, cfg.fontSizeMm - 1)}mm;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #94a3b8;
            margin-bottom: 6px;
          }
          .customer-name {
            font-size: ${cfg.fontSizeMm + 0.8}mm;
            font-weight: 700;
            color: #0f172a;
          }
          .customer-detail {
            font-size: ${Math.max(2.3, cfg.fontSizeMm - 0.6)}mm;
            color: #475569;
            margin-top: 1px;
          }

          /* Table Styling */
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          th {
            font-size: ${Math.max(2.1, cfg.fontSizeMm - 0.9)}mm;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #64748b;
            border-top: 1px solid #e2e8f0;
            border-bottom: 1px solid #cbd5e1;
            padding: 10px 8px;
            text-align: left;
          }
          th.col-num, td.col-num {
            text-align: right;
          }
          td {
            padding: 12px 8px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: top;
            font-size: ${cfg.fontSizeMm}mm;
          }
          .col-idx {
            width: 36px;
            color: #94a3b8;
            font-size: ${Math.max(2.1, cfg.fontSizeMm - 0.8)}mm;
            font-weight: 500;
          }
          .item-title {
            font-weight: 600;
            color: #0f172a;
          }
          .item-sn {
            font-size: ${Math.max(2, cfg.fontSizeMm - 1)}mm;
            color: #64748b;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            margin-top: 2px;
          }
          .total-cell {
            font-weight: 700;
            color: #0f172a;
          }

          /* Summary Layout */
          .bottom-grid {
            display: grid;
            grid-template-columns: 1.3fr 0.7fr;
            gap: 32px;
            align-items: flex-start;
          }
          .totals-table {
            width: 100%;
            margin-bottom: 0;
          }
          .totals-table td {
            border: none;
            padding: 5px 0;
            font-size: ${Math.max(2.4, cfg.fontSizeMm - 0.4)}mm;
            color: #475569;
          }
          .totals-table .grand-row td {
            border-top: 1.5px solid #0f172a !important;
            padding-top: 10px;
            padding-bottom: 10px;
            font-size: ${cfg.fontSizeMm + 1.2}mm;
            font-weight: 800;
            color: #0f172a;
          }
          .info-block {
            margin-bottom: 14px;
          }
          .info-block-title {
            font-size: ${Math.max(2, cfg.fontSizeMm - 1)}mm;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #94a3b8;
            margin-bottom: 4px;
          }
          .info-block-body {
            font-size: ${Math.max(2.2, cfg.fontSizeMm - 0.7)}mm;
            color: #475569;
            white-space: pre-line;
            line-height: 1.5;
          }

          /* Signature Block */
          .signature-section {
            margin-top: 45px;
            display: flex;
            justify-content: space-between;
            padding-top: 20px;
          }
          .sig-box {
            width: 42%;
            border-top: 1px solid #cbd5e1;
            padding-top: 6px;
            font-size: ${Math.max(2.2, cfg.fontSizeMm - 0.7)}mm;
            color: #64748b;
            font-weight: 500;
          }

          .qr-wrapper {
            margin-top: 14px;
            display: flex;
            justify-content: flex-end;
          }
          canvas { max-width: 80px; height: auto; }
        </style>
      </head>
      <body>

        <!-- Top Header: Store Info & Document Title -->
        <div class="top-row">
          <div>
            <div class="brand-title">${cfg.storeName || 'FTC Electronics'}</div>
            ${cfg.headerAddress ? `<div class="brand-sub">${cfg.headerAddress}</div>` : ''}
            ${cfg.headerPhone || cfg.headerEmail ? `<div class="brand-sub">${cfg.headerPhone || ''}${cfg.headerPhone && cfg.headerEmail ? ' · ' : ''}${cfg.headerEmail || ''}</div>` : ''}
            ${cfg.taxNumber ? `<div class="brand-sub" style="color:#0f172a; font-weight:600;">${cfg.taxNumber}</div>` : ''}
          </div>
          <div class="doc-header-right">
            <div class="doc-type-title">${docHeading}</div>
            <div class="doc-meta-line">No: <strong>#${data.docNumber}</strong></div>
            <div class="doc-meta-line">Date: <strong>${data.date}</strong></div>
            ${cfg.showDueDate && data.dueDate ? `<div class="doc-meta-line">Valid / Due: <strong>${data.dueDate}</strong></div>` : ''}
          </div>
        </div>

        <!-- Minimalist Billed To Customer Section -->
        <div class="customer-section">
          <div class="section-label">Billed To</div>
          <div class="customer-name">${data.customerName || 'Walk-in Customer'}</div>
          ${data.customerCompany ? `<div class="customer-detail">${data.customerCompany}</div>` : ''}
          ${data.customerAddress ? `<div class="customer-detail">${data.customerAddress}</div>` : ''}
          ${data.customerPhone ? `<div class="customer-detail">Tel: ${data.customerPhone}</div>` : ''}
        </div>

        <!-- Items Table -->
        <table>
          <thead>
            <tr>
              <th class="col-idx">#</th>
              <th>Item Description</th>
              <th class="col-num" style="width: 50px;">Qty</th>
              <th class="col-num" style="width: 110px;">Unit Price</th>
              <th class="col-num" style="width: 90px;">Disc</th>
              <th class="col-num" style="width: 120px;">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <!-- Summary Grid (Notes/Bank vs Totals) -->
        <div class="bottom-grid">
          <div>
            ${
              cfg.bankDetailsText
                ? `<div class="info-block">
                    <div class="info-block-title">Payment / Bank Transfer Info</div>
                    <div class="info-block-body">${cfg.bankDetailsText}</div>
                   </div>`
                : ''
            }
            ${
              cfg.termsAndConditions
                ? `<div class="info-block">
                    <div class="info-block-title">Terms & Notes</div>
                    <div class="info-block-body">${cfg.termsAndConditions}</div>
                   </div>`
                : ''
            }
          </div>

          <div>
            <table class="totals-table">
              <tr>
                <td>Subtotal</td>
                <td class="col-num" style="font-weight: 600; color: #0f172a;">${currency} ${data.subtotal.toLocaleString()}</td>
              </tr>
              ${
                cfg.showTaxBreakdown && data.discountAmount
                  ? `<tr><td>Discount</td><td class="col-num" style="color: #dc2626;">-${currency} ${data.discountAmount.toLocaleString()}</td></tr>`
                  : ''
              }
              ${
                cfg.showTaxBreakdown && data.taxAmount
                  ? `<tr><td>Tax (VAT / NBT)</td><td class="col-num">${currency} ${data.taxAmount.toLocaleString()}</td></tr>`
                  : ''
              }
              <tr class="grand-row">
                <td>Total Due</td>
                <td class="col-num">${currency} ${data.totalAmount.toLocaleString()}</td>
              </tr>
            </table>

            ${
              cfg.showQrCode
                ? `<div class="qr-wrapper"><canvas id="invoice-qr"></canvas></div>`
                : ''
            }
          </div>
        </div>

        <!-- Signature Lines -->
        ${
          cfg.showSignatureBlock
            ? `<div class="signature-section">
                <div class="sig-box">Authorized Signature</div>
                <div class="sig-box" style="text-align: right;">Customer Acceptance</div>
               </div>`
            : ''
        }

        <script>
          window.onload = function() {
            ${
              cfg.showQrCode
                ? `try {
                    QRCode.toCanvas(document.getElementById('invoice-qr'), '${data.docNumber}', { width: 80, margin: 0 });
                  } catch(e) {}`
                : ''
            }
            setTimeout(function() { window.print(); }, 700);
          };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Sample generator for testing Sales Invoices and Quotations.
 */
export function generateTestInvoiceData(type: 'Invoice' | 'Quotation' = 'Invoice'): InvoiceData {
  const isQuo = type === 'Quotation';
  return {
    docType: type,
    docNumber: isQuo ? 'QUO-2026-0042' : 'INV-2026-1089',
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    dueDate: new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    customerName: 'Apex Technology Solutions Ltd',
    customerCompany: 'Reg No: PV-90182',
    customerPhone: '+94 11 234 5678',
    customerAddress: 'No. 45 Galle Road, Colombo 03, Sri Lanka',
    items: [
      { name: 'Dell UltraSharp 27" 4K USB-C Monitor', qty: 2, unitPrice: 145000, discount: 5000, serialNumber: 'SN-MON-90812' },
      { name: 'Logitech MX Master 3S Wireless Mouse', qty: 2, unitPrice: 38500, serialNumber: 'SN-MS-77123' },
      { name: 'Anker PowerConf Bluetooth Speakerphone', qty: 1, unitPrice: 42000, serialNumber: 'SN-SPK-3341' },
    ],
    subtotal: 409000,
    taxAmount: 18000,
    discountAmount: 10000,
    totalAmount: 417000,
    paymentMethod: isQuo ? 'Cheque / Bank Transfer' : 'Direct Bank Transfer',
    notes: isQuo ? 'Quotation valid for 14 days.' : 'Payment due within 7 days of invoice date.',
  };
}
