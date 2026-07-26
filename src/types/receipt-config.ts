/**
 * Receipt print configuration types and default settings.
 */

export interface ReceiptPrintConfig {
  label: string;             // Preset name e.g. "80mm POS Thermal"
  paperWidthMm: number;      // 80mm, 58mm, or 210mm (A4)
  fontSizeMm: number;        // Font size in mm (default 4mm)
  storeName: string;         // Store display name
  headerAddress: string;     // Store address
  headerPhone: string;       // Contact phone
  taxNumber: string;         // Tax ID / VAT reg number
  footerMessage: string;     // Bottom thank you note
  returnPolicyText: string;  // Short policy note
  showCustomerInfo: boolean; // Show customer name/phone/address
  showItemSerials: boolean;  // Show serial numbers under items
  showPaymentMethod: boolean;// Show Cash / Card / Transfer
  showQrCode: boolean;       // Render order verify QR at bottom
  isDefault: boolean;        // Default receipt preset
  logoUrl?: string;          // Custom Store Logo URL from Personalization settings
}

export interface ReceiptPrintPreset {
  id: string;
  name?: string;
  label: string;
  category: string;
  /** Serialized ReceiptPrintConfig JSON as stored in PocketBase. */
  config: string;
  isDefault?: boolean;
  created?: string;
  updated?: string;
}

export const DEFAULT_RECEIPT_CONFIG: ReceiptPrintConfig = {
  label: 'Default 80mm Thermal',
  paperWidthMm: 80,
  fontSizeMm: 4,
  storeName: 'FTC Electronics',
  headerAddress: 'Main Street, Colombo, Sri Lanka',
  headerPhone: '+94 77 123 4567',
  taxNumber: 'VAT: 123456789-0000',
  footerMessage: 'Thank you for shopping with FTC Electronics!',
  returnPolicyText: 'Returns accepted within 7 days with original receipt.',
  showCustomerInfo: true,
  showItemSerials: true,
  showPaymentMethod: true,
  showQrCode: true,
  isDefault: true,
};

/**
 * Safely parse receipt config from raw JSON, handling backwards compatibility
 * for legacy presets that stored fontSizePx in pixels.
 */
export function normalizeReceiptConfig(raw: string | object): ReceiptPrintConfig {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      ...DEFAULT_RECEIPT_CONFIG,
      ...obj,
      fontSizeMm: obj?.fontSizeMm ?? (obj?.fontSizePx ? Math.round(obj.fontSizePx / 3) : 4),
    };
  } catch {
    return { ...DEFAULT_RECEIPT_CONFIG };
  }
}

