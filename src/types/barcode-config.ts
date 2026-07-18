/**
 * Barcode print configuration types and defaults.
 * Kept in a separate non-server file so it can be imported by both
 * client components and 'use server' actions without breaking Next.js rules.
 */

export interface BarcodePrintConfig {
  label: string;
  rollWidthMm: number; // Printer Roll Width in mm (e.g. 100mm roll, 210mm A4)
  labelWidthMm: number;
  labelHeightMm: number;
  gapMm: number;      // Legacy / fallback combined gap in mm
  gapXMm: number;     // Horizontal gap between sticker columns in mm
  gapYMm: number;     // Vertical gap between sticker rows in mm
  marginMm: number;   // Roll left/right side margin padding in mm
  columns: number;
  barWidthMm: number;       // bar width module in mm (e.g. 0.4mm)
  barHeightMm: number;      // barcode height in mm (e.g. 15mm)
  fontSizeMm: number;       // text font size in mm (e.g. 2.5mm)
  priceFontSizeMm: number;  // price font size in mm (e.g. 3mm)
  showProductName: boolean;
  showSerial: boolean;
  showBatch: boolean;
  showPrice: boolean;
  isDefault: boolean;
}

export const DEFAULT_BARCODE_CONFIG: BarcodePrintConfig = {
  label: 'Default 3-up Sticker Roll',
  rollWidthMm: 96,
  labelWidthMm: 30,
  labelHeightMm: 20,
  gapMm: 2,
  gapXMm: 2,
  gapYMm: 2,
  marginMm: 1,
  columns: 3,
  barWidthMm: 0.3,
  barHeightMm: 9,
  fontSizeMm: 2.5,
  priceFontSizeMm: 3,
  showProductName: true,
  showSerial: true,
  showBatch: true,
  showPrice: true,
  isDefault: true,
};

/**
 * Safely parse barcode config from raw JSON, handling backwards compatibility
 * for legacy presets that stored barWidth/barHeight/fontSize in pixels or lacked gapXMm/gapYMm/rollWidthMm/priceFontSizeMm.
 */
export function normalizeBarcodeConfig(raw: string | object): BarcodePrintConfig {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const labelW = obj?.labelWidthMm || DEFAULT_BARCODE_CONFIG.labelWidthMm;
    const cols = obj?.columns || DEFAULT_BARCODE_CONFIG.columns;
    const fallbackGap = obj?.gapMm !== undefined ? obj.gapMm : DEFAULT_BARCODE_CONFIG.gapMm;
    const gapX = obj?.gapXMm ?? fallbackGap;
    const gapY = obj?.gapYMm ?? fallbackGap;
    const sideMargin = obj?.marginMm ?? 0;
    const calcRoll = labelW * cols + gapX * Math.max(0, cols - 1) + sideMargin * 2;
    const textFont = obj?.fontSizeMm ?? (obj?.fontSize ? Math.round((obj.fontSize / 3) * 10) / 10 : 2.5);

    return {
      ...DEFAULT_BARCODE_CONFIG,
      ...obj,
      gapMm: fallbackGap,
      gapXMm: gapX,
      gapYMm: gapY,
      marginMm: sideMargin,
      rollWidthMm: obj?.rollWidthMm ?? calcRoll,
      barWidthMm: obj?.barWidthMm ?? (obj?.barWidth ? Math.round((obj.barWidth / 3.78) * 10) / 10 : 0.4),
      barHeightMm: obj?.barHeightMm ?? (obj?.barHeight ? Math.round(obj.barHeight / 3.78) : 15),
      fontSizeMm: textFont,
      priceFontSizeMm: obj?.priceFontSizeMm ?? (textFont + 0.5),
    };
  } catch {
    return { ...DEFAULT_BARCODE_CONFIG };
  }
}




