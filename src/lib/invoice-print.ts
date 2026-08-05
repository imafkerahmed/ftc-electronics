import {
  type InvoicePrintConfig,
  DEFAULT_INVOICE_CONFIG,
  normalizeInvoiceConfig,
  type InvoiceItem,
  type InvoicePrintPreset,
} from '@/types/invoice-config';
import { getInvoicePrintPresetsAction } from '@/app/actions/admin';

export type { InvoiceItem };

export async function resolveInvoiceConfig(): Promise<InvoicePrintConfig> {
  try {
    const res = await getInvoicePrintPresetsAction();
    if (!res.success) return DEFAULT_INVOICE_CONFIG;
    const presets = (res.data || []) as InvoicePrintPreset[];
    const preset = presets.find((p) => p.isDefault) || presets[0];
    return preset ? normalizeInvoiceConfig(preset.config) : DEFAULT_INVOICE_CONFIG;
  } catch {
    return DEFAULT_INVOICE_CONFIG;
  }
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

const LEGACY_COMBINED_TITLE = 'TAX INVOICE / QUOTATION';
const normalizeDocTitle = (t?: string, type?: 'Invoice' | 'Quotation') =>
  !t || t === LEGACY_COMBINED_TITLE ? (type === 'Quotation' ? 'QUOTATION' : 'INVOICE') : t;

export function getInvoiceHtml(
  rawCfg: InvoicePrintConfig,
  data: InvoiceData,
  isPreview = false,
  title = 'Sales Document'
): string {
  const cfg = normalizeInvoiceConfig(rawCfg);
  const isThermal = cfg.paperWidthMm <= 100;
  const currency = 'Rs.';
  const logoSrc = safeImageUrl(data.logoUrl || cfg.logoUrl);
  const docHeading = normalizeDocTitle(cfg.documentTitle, data.docType);

  const itemsHtml = data.items
    .map((item, index) => {
      const lineTotal = item.qty * item.unitPrice - (item.discount || 0);
      const serialHtml = item.serialNumber
        ? `<div class="item-sn">SN: ${esc(item.serialNumber)}</div>`
        : '';
      return `
        <tr>
          <td class="col-idx">${String(index + 1).padStart(2, '0')}</td>
          <td class="col-desc">
            <span class="item-title">${esc(item.name)}</span>
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

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${esc(docHeading)} — ${esc(data.docNumber)}</title>
        ${cfg.showQrCode ? '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>' : ''}
        <style>
          @page {
            size: ${cfg.paperWidthMm}mm auto;
            margin: 0;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: ${cfg.fontSizeMm}mm;
            line-height: 1.4;
            color: #0f172a;
            background: ${isPreview ? 'transparent' : '#fff'};
            width: ${cfg.paperWidthMm}mm;
            padding: ${isThermal ? '6mm 4mm' : '15mm 20mm'};
            margin: 0 auto;
          }
          .top-row { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-start; }
          .brand-title { font-size: 20px; font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: -0.5px; }
          .brand-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
          .doc-header-right { text-align: right; }
          .doc-type-title { font-size: 22px; font-weight: 900; color: #1e3a8a; letter-spacing: -0.5px; }
          .doc-meta-line { font-size: 11px; color: #475569; margin-top: 3px; }
          
          .customer-section { margin-bottom: 24px; border-left: 2px solid #cbd5e1; padding-left: 12px; }
          .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; tracking: 0.5px; }
          .customer-name { font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px; }
          .customer-detail { font-size: 11px; color: #475569; margin-top: 1px; }

          table { width: 100%; border-collapse: collapse; margin: 20px 0 24px 0; }
          th { background: #f8fafc; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #475569; text-align: left; padding: 8px 10px; border-bottom: 2px solid #e2e8f0; }
          td { padding: 10px; vertical-align: top; border-bottom: 1px solid #f1f5f9; }
          .col-idx { width: 35px; color: #94a3b8; font-size: 11px; text-align: center; }
          .col-desc { font-size: 12px; }
          .item-title { font-weight: 600; color: #0f172a; }
          .item-sn { font-size: 9px; color: #64748b; margin-top: 1px; font-family: monospace; }
          .col-num { font-size: 11px; text-align: right; color: #334155; }
          .total-cell { font-weight: 600; color: #0f172a; }

          .bottom-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 40px; margin-top: 20px; }
          .info-block { margin-bottom: 16px; }
          .info-block-title { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; letter-spacing: 0.5px; }
          .info-block-body { font-size: 10.5px; color: #475569; line-height: 1.5; white-space: pre-line; }

          .totals-table { width: 100%; margin: 0; }
          .totals-table td { padding: 6px 10px; border-bottom: none; font-size: 11.5px; color: #475569; }
          .totals-table tr.grand-row td { font-size: 14px; font-weight: 800; color: #1e3a8a; border-top: 2px solid #e2e8f0; padding-top: 10px; }

          .signature-section { display: flex; justify-content: space-between; margin-top: 60px; padding-top: 10px; }
          .sig-box { width: 180px; border-top: 1px dashed #94a3b8; text-align: center; font-size: 10px; color: #64748b; padding-top: 6px; }

          .qr-wrapper { text-align: right; margin-top: 12px; padding-right: 10px; }
          canvas { max-width: 80px; height: auto; }
        </style>
      </head>
      <body>

        <div class="top-row">
          <div>
            ${logoSrc ? `<img src="${esc(logoSrc)}" style="max-height: 50px; max-width: 200px; display: block;" />` : `<div class="brand-title">${esc(cfg.storeName || 'FTC Electronics')}</div>`}
            ${cfg.headerAddress ? `<div class="brand-sub">${esc(cfg.headerAddress)}</div>` : ''}
            ${cfg.headerPhone ? `<div class="brand-sub">Tel: ${esc(cfg.headerPhone)}</div>` : ''}
            ${cfg.headerEmail ? `<div class="brand-sub">Email: ${esc(cfg.headerEmail)}</div>` : ''}
            ${cfg.taxNumber ? `<div class="brand-sub">${esc(cfg.taxNumber)}</div>` : ''}
          </div>
          <div class="doc-header-right">
            <div class="doc-type-title">${esc(docHeading)}</div>
            <div class="doc-meta-line">#${esc(data.docNumber)} | ${esc(data.date)}</div>
          </div>
        </div>

        <div class="customer-section">
          <div class="section-label">Billed To</div>
          <div class="customer-name">${esc(data.customerName || 'Walk-in Customer')}</div>
          ${data.customerCompany ? `<div class="customer-detail">${esc(data.customerCompany)}</div>` : ''}
          ${data.customerAddress ? `<div class="customer-detail">${esc(data.customerAddress)}</div>` : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th class="col-idx">#</th>
              <th>Description</th>
              <th class="col-num">Qty</th>
              <th class="col-num">Unit</th>
              <th class="col-num">Disc</th>
              <th class="col-num">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <div class="bottom-grid">
          <div>
            ${cfg.bankDetailsText ? `<div class="info-block"><div class="info-block-title">Payment Info</div><div class="info-block-body">${esc(cfg.bankDetailsText)}</div></div>` : ''}
            ${cfg.termsAndConditions ? `<div class="info-block"><div class="info-block-title">Notes</div><div class="info-block-body">${esc(cfg.termsAndConditions)}</div></div>` : ''}
          </div>
          <div>
            <table class="totals-table">
              <tr><td>Subtotal</td><td class="col-num">${currency} ${data.subtotal.toLocaleString()}</td></tr>
              ${data.discountAmount ? `<tr><td>Discount</td><td class="col-num">-${currency} ${data.discountAmount.toLocaleString()}</td></tr>` : ''}
              ${data.taxAmount ? `<tr><td>Tax</td><td class="col-num">${currency} ${data.taxAmount.toLocaleString()}</td></tr>` : ''}
              <tr class="grand-row"><td>Total</td><td class="col-num">${currency} ${data.totalAmount.toLocaleString()}</td></tr>
            </table>
            ${cfg.showQrCode ? `<div class="qr-wrapper"><canvas id="invoice-qr"></canvas></div>` : ''}
          </div>
        </div>

        ${cfg.showSignatureBlock ? `<div class="signature-section"><div class="sig-box">Authorized Sign</div><div class="sig-box">Customer Sign</div></div>` : ''}

        <script>
          window.onload = function() {
            ${cfg.showQrCode ? `try { QRCode.toCanvas(document.getElementById('invoice-qr'), '${data.docNumber}', { width: 80, margin: 0 }); } catch(e) {}` : ''}
            ${isPreview ? '' : 'setTimeout(function() { window.print(); }, 700);'}
          };
        </script>
      </body>
    </html>
  `;
}

export function printInvoice(
  rawCfg: InvoicePrintConfig,
  data: InvoiceData,
  title = 'Sales Document'
) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = getInvoiceHtml(rawCfg, data, false, title);
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(html, 'text/html');
  printWindow.document.replaceChild(parsedDoc.documentElement, printWindow.document.documentElement);
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

export async function generateInvoicePdfBlob(
  rawCfg: InvoicePrintConfig,
  data: InvoiceData,
  title = 'Sales Document'
): Promise<Blob> {
  const html2pdfModule = await import('html2pdf.js');
  const html2pdf = html2pdfModule.default || html2pdfModule;
  const html = getInvoiceHtml(rawCfg, data, false, title);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    throw new Error('Could not access iframe document for PDF generation.');
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Short delay to allow inline styles and images to settle in iframe context
  await new Promise((resolve) => setTimeout(resolve, 250));

  const originalGetComputedStyle = window.getComputedStyle;
  try {
    // Intercept computed styles to replace unsupported lab() / oklch() color spaces with a fallback hex color
    window.getComputedStyle = function (el, pseudoElt) {
      const style = originalGetComputedStyle(el, pseudoElt);
      return new Proxy(style, {
        get(target, prop) {
          const val = Reflect.get(target, prop);
          if (typeof val === 'string' && (val.includes('lab(') || val.includes('oklch('))) {
            return '#ffffff';
          }
          return val;
        }
      });
    };

    const filename = `${data.docNumber || 'Invoice'}.pdf`;
    const targetElement = iframeDoc.body;
    const opt = {
      margin: 5,
      filename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 794,
      },
      jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
    };

    const worker = html2pdf().from(targetElement).set(opt);
    const pdfBlob: Blob = await worker.output('blob');
    return pdfBlob;
  } finally {
    window.getComputedStyle = originalGetComputedStyle;
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}

export async function downloadInvoicePdf(
  rawCfg: InvoicePrintConfig,
  data: InvoiceData,
  title = 'Sales Document'
) {
  const pdfBlob = await generateInvoicePdfBlob(rawCfg, data, title);
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.docNumber || 'Invoice'}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

