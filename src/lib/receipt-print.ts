import { type ReceiptPrintConfig, DEFAULT_RECEIPT_CONFIG, normalizeReceiptConfig, type ReceiptPrintPreset } from '@/types/receipt-config';
import { getReceiptPrintPresetsAction } from '@/app/actions/admin';

export async function resolveReceiptConfig(): Promise<ReceiptPrintConfig> {
  try {
    const res = await getReceiptPrintPresetsAction();
    if (!res.success) return DEFAULT_RECEIPT_CONFIG;
    const presets = (res.data || []) as ReceiptPrintPreset[];
    const preset = presets.find((p) => p.isDefault) || presets[0];
    return preset ? normalizeReceiptConfig(preset.config) : DEFAULT_RECEIPT_CONFIG;
  } catch {
    return DEFAULT_RECEIPT_CONFIG;
  }
}

export interface ReceiptItem {
  name: string;
  qty: number;
  unitPrice: number;
  serialNumber?: string;
}

export interface ReceiptData {
  orderNumber: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  items: ReceiptItem[];
  subtotal: number;
  discount?: number;
  total: number;
  paymentMethod?: string;
  logoUrl?: string;
}

const esc = (v?: string): string =>
  (v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function safeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^(https?:|data:image\/)/i.test(trimmed) ? trimmed : undefined;
}

export function printReceipt(
  rawCfg: ReceiptPrintConfig,
  data: ReceiptData,
  title = 'Order Receipt'
) {
  const cfg = normalizeReceiptConfig(rawCfg);

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const isThermal = cfg.paperWidthMm <= 100;
  const currency = 'Rs.';
  const logoSrc = safeImageUrl(data.logoUrl || cfg.logoUrl);

  const itemsHtml = data.items
    .map((item) => {
      const lineTotal = item.qty * item.unitPrice;
      const serialHtml =
        cfg.showItemSerials && item.serialNumber
          ? `<div class="item-sn">SN: ${esc(item.serialNumber)}</div>`
          : '';
      return `
        <tr>
          <td class="item-name">${esc(item.name)}${serialHtml}</td>
          <td class="item-qty">${item.qty}</td>
          <td class="item-price">${currency} ${item.unitPrice.toLocaleString()}</td>
          <td class="item-total">${currency} ${lineTotal.toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} \u2014 ${data.orderNumber}</title>
        ${cfg.showQrCode ? '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>' : ''}
        <style>
          @page {
            size: ${cfg.paperWidthMm}mm auto;
            margin: 0;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Courier New', Courier, monospace, system-ui, sans-serif;
            font-size: ${cfg.fontSizeMm}mm;
            line-height: 1.3;
            color: #000;
            background: #fff;
            width: ${cfg.paperWidthMm}mm;
            padding: ${isThermal ? '4mm 3mm' : '10mm 15mm'};
            margin: 0 auto;
          }
          .header { text-align: center; margin-bottom: 8px; }
          .store-name { font-size: ${cfg.fontSizeMm + 1.5}mm; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
          .sub-header { font-size: ${Math.max(2.2, cfg.fontSizeMm - 0.8)}mm; color: #333; margin-top: 2px; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px solid #000; margin: 6px 0; }
          .info-row { display: flex; justify-content: space-between; font-size: ${Math.max(2.4, cfg.fontSizeMm - 0.5)}mm; margin-bottom: 2px; }
          .items-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
          .items-table th { text-align: left; font-size: ${Math.max(2.2, cfg.fontSizeMm - 0.8)}mm; border-bottom: 1px solid #000; padding-bottom: 2px; }
          .items-table th.num { text-align: right; }
          .items-table td { padding: 3px 0; vertical-align: top; }
          .item-name { font-weight: 600; font-size: ${cfg.fontSizeMm - 0.3}mm; }
          .item-sn { font-size: ${Math.max(2, cfg.fontSizeMm - 1)}mm; color: #555; font-weight: normal; }
          .item-qty { text-align: center; }
          .item-price, .item-total { text-align: right; white-space: nowrap; }
          .totals-block { margin-top: 4px; }
          .total-row { display: flex; justify-content: space-between; font-size: ${cfg.fontSizeMm}mm; margin-bottom: 2px; }
          .grand-total { font-size: ${cfg.fontSizeMm + 1}mm; font-weight: 900; }
          .footer { text-align: center; margin-top: 10px; font-size: ${Math.max(2.2, cfg.fontSizeMm - 0.8)}mm; }
          .policy { font-size: ${Math.max(2, cfg.fontSizeMm - 1)}mm; margin-top: 4px; font-style: italic; }
          .qr-container { text-align: center; margin-top: 8px; }
          canvas { max-width: 90px; height: auto; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoSrc ? `
            <img src="${esc(logoSrc)}" alt="${esc(cfg.storeName || 'FTC Electronics')}" style="max-height: 60px; max-width: 220px; width: auto; height: auto; object-fit: contain; margin: 0 auto 8px auto; display: block;" />
          ` : `
            <div class="store-name">${esc(cfg.storeName || 'FTC Electronics')}</div>
          `}
          ${cfg.headerAddress ? `<div class="sub-header">${esc(cfg.headerAddress)}</div>` : ''}
          ${cfg.headerPhone ? `<div class="sub-header">Tel: ${esc(cfg.headerPhone)}</div>` : ''}
          ${cfg.taxNumber ? `<div class="sub-header">${esc(cfg.taxNumber)}</div>` : ''}
        </div>

        <div class="divider"></div>

        <div class="info-row"><span>Receipt #: <strong>${esc(data.orderNumber)}</strong></span><span>${esc(data.date)}</span></div>
        ${
          cfg.showCustomerInfo && (data.customerName || data.customerPhone)
            ? `<div class="info-row"><span>Customer: ${esc(data.customerName || 'Walk-in')}</span>${data.customerPhone ? `<span>${esc(data.customerPhone)}</span>` : ''}</div>`
            : ''
        }
        ${
          cfg.showPaymentMethod && data.paymentMethod
            ? `<div class="info-row"><span>Payment: ${esc(data.paymentMethod)}</span></div>`
            : ''
        }

        <div class="divider"></div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th className="num">Price</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <div class="divider"></div>

        <div class="totals-block">
          <div class="total-row"><span>Subtotal:</span><span>${currency} ${data.subtotal.toLocaleString()}</span></div>
          ${
            data.discount
              ? `<div class="total-row"><span>Discount:</span><span>-${currency} ${data.discount.toLocaleString()}</span></div>`
              : ''
          }
          <div class="double-divider"></div>
          <div class="total-row grand-total"><span>TOTAL:</span><span>${currency} ${data.total.toLocaleString()}</span></div>
        </div>

        <div class="divider"></div>

        <div class="footer">
          ${cfg.footerMessage ? `<div>${esc(cfg.footerMessage)}</div>` : ''}
          ${cfg.returnPolicyText ? `<div class="policy">${esc(cfg.returnPolicyText)}</div>` : ''}
          ${
            cfg.showQrCode
              ? `<div class="qr-container"><canvas id="qr"></canvas></div>`
              : ''
          }
        </div>

        <script>
          window.onload = function() {
            ${
              cfg.showQrCode
                ? `try {
                    QRCode.toCanvas(document.getElementById('qr'), '${data.orderNumber}', { width: 90, margin: 1 });
                  } catch(e) {}`
                : ''
            }
            setTimeout(function() { window.print(); }, 600);
          };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Generate test receipt data to check thermal alignment & paper width cutoff.
 */
export function generateTestReceiptData(): ReceiptData {
  return {
    orderNumber: 'ORD-2026-9988',
    date: new Date().toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    customerName: 'Sample Customer',
    customerPhone: '+94 71 999 8888',
    items: [
      { name: 'Wireless Bluetooth Headphone Pro', qty: 1, unitPrice: 12500, serialNumber: 'SN-HP-90812' },
      { name: 'USB-C Fast Charging Cable 2M', qty: 2, unitPrice: 1850, serialNumber: 'SN-CB-11204' },
      { name: 'Ultra Thin Protective Case', qty: 1, unitPrice: 2200 },
    ],
    subtotal: 18400,
    discount: 1400,
    total: 17000,
    paymentMethod: 'Cash / VISA Card',
  };
}
