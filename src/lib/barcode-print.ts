import { type BarcodePrintConfig, normalizeBarcodeConfig } from '@/types/barcode-config';

export interface BarcodePrintItem {
  barcode: string;
  qrPayload?: string;
  isQr?: boolean;
  productName?: string;
  serialNumber?: string;
  batchNumber?: string;
  price?: number;
  currency?: string;
}

export function getBarcodeHtml(
  rawCfg: BarcodePrintConfig,
  items: BarcodePrintItem[],
  isPreview = false,
  title = 'Print Barcodes'
): string {
  const cfg = normalizeBarcodeConfig(rawCfg);
  const barWidthPx = Math.max(0.5, Math.round(cfg.barWidthMm * 3.78 * 10) / 10);
  const barHeightPx = Math.max(4, Math.round(cfg.barHeightMm * 3.78));
  const fontSizePx = Math.max(8, Math.round(cfg.fontSizeMm * 3));
  const qrSizePx = Math.max(60, Math.round(Math.min(cfg.labelWidthMm, cfg.labelHeightMm) * 3.2));

  const hasQrItems = items.some((i) => i.isQr || Boolean(i.qrPayload));

  const labelsHtml = items
    .map((item, i) => {
      const isQr = item.isQr || Boolean(item.qrPayload);
      const svgId = `bc-${i}`;
      const canvasId = `qr-${i}`;
      const currency = item.currency === 'LKR' ? 'Rs.' : item.currency || 'Rs.';
      const productName = item.productName || 'Stock Item';

      const lines: string[] = [];
      if (cfg.showProductName) lines.push(`<div class="product-name">${productName}</div>`);
      if (isQr) {
        lines.push(`<div class="qr-box"><canvas id="${canvasId}" data-qr="${item.qrPayload || item.barcode}"></canvas></div>`);
      } else {
        lines.push(`<svg id="${svgId}" data-barcode="${item.barcode}"></svg>`);
      }
      if (cfg.showSerial) lines.push(`<div class="meta">SN: ${item.serialNumber || '\u2014'}</div>`);
      if (cfg.showBatch) lines.push(`<div class="meta">Batch: ${item.batchNumber || '\u2014'}</div>`);
      if (cfg.showPrice && item.price !== undefined) {
        lines.push(`<div class="price">${currency} ${item.price.toLocaleString()}</div>`);
      }
      return `<div class="label">${lines.join('')}</div>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
        ${hasQrItems ? '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>' : ''}
        <style>
          @page { size: ${cfg.rollWidthMm}mm auto; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: ${isPreview ? 'transparent' : '#fff'};
            width: ${cfg.rollWidthMm}mm;
            margin: 0 auto;
            padding: ${isPreview ? '0' : '2mm 0'};
          }
          h1 { font-size: 10px; margin-bottom: 6px; color: #555; text-align: center; ${isPreview ? 'display: none !important;' : ''} }
          .grid {
            display: grid;
            grid-template-columns: repeat(${cfg.columns}, ${cfg.labelWidthMm}mm);
            column-gap: ${cfg.gapXMm}mm;
            row-gap: ${cfg.gapYMm}mm;
            width: ${cfg.rollWidthMm}mm;
            padding: 0 ${cfg.marginMm || 0}mm;
            justify-content: center;
          }
          .label {
            width: ${cfg.labelWidthMm}mm;
            min-height: ${cfg.labelHeightMm}mm;
            border: 1px dashed #ccc;
            border-radius: 4px;
            padding: 3mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1.5mm;
            page-break-inside: avoid;
            background: #fff;
            overflow: hidden;
          }
          .product-name {
            font-size: ${cfg.fontSizeMm}mm;
            font-weight: 700;
            color: #111;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
          }
          svg { width: ${cfg.labelWidthMm - 6}mm; height: auto; }
          .qr-box { display: flex; justify-content: center; align-items: center; }
          .qr-box canvas { max-width: ${cfg.labelWidthMm - 8}mm; max-height: ${cfg.labelHeightMm - 12}mm; width: auto; height: auto; }
          .meta { font-size: ${Math.max(1.8, cfg.fontSizeMm - 0.5)}mm; color: #666; font-family: monospace; }
          .price { font-size: ${cfg.priceFontSizeMm || (cfg.fontSizeMm + 0.5)}mm; font-weight: 800; color: #000; }
          @media print {
            h1 { display: none !important; }
            body { padding: 0 !important; }
            .label { border: none !important; box-shadow: none !important; }
          }
        </style>
      </head>
      <body>
        <h1>&#128230; ${title} &mdash; ${items.length} label${items.length !== 1 ? 's' : ''}</h1>
        <div class="grid">${labelsHtml}</div>
        <script>
          window.onload = function() {
            document.querySelectorAll('svg[data-barcode]').forEach(function(el) {
              try {
                JsBarcode(el, el.getAttribute('data-barcode'), {
                  format: 'CODE128',
                  lineColor: '#000',
                  background: '#fff',
                  width: ${barWidthPx},
                  height: ${barHeightPx},
                  displayValue: true,
                  fontSize: ${fontSizePx},
                  margin: 2,
                  font: 'monospace',
                });
              } catch(e) {}
            });
            document.querySelectorAll('canvas[data-qr]').forEach(function(el) {
              try {
                QRCode.toCanvas(el, el.getAttribute('data-qr'), { width: ${qrSizePx}, margin: 1 });
              } catch(e) {}
            });
            ${isPreview ? '' : 'setTimeout(function() { window.print(); }, 700);'}
          };
        <\/script>
      </body>
    </html>
  `;
}

export function printBarcodeLabels(
  rawCfg: BarcodePrintConfig,
  items: BarcodePrintItem[],
  title = 'Print Barcodes'
) {
  if (items.length === 0) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = getBarcodeHtml(rawCfg, items, false, title);
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(html, 'text/html');
  printWindow.document.replaceChild(parsedDoc.documentElement, printWindow.document.documentElement);
  printWindow.document.close();
}

/**
 * Generate sample items for test alignment printing.
 */
export function generateTestBarcodeItems(count = 6): BarcodePrintItem[] {
  return Array.from({ length: count }, (_, i) => ({
    barcode: `TEST-${100000 + i + 1}`,
    productName: `Test Product Alignment #${i + 1}`,
    serialNumber: `TEST-SN-${i + 1}`,
    batchNumber: `BATCH-2026-0${(i % 3) + 1}`,
    price: 4990 + i * 500,
    currency: 'LKR',
  }));
}

