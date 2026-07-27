/**
 * Sales Invoice & Quotation print configuration types and default settings.
 * Designed for both A4 / Letter formal invoices and POS thermal invoices.
 */

export interface InvoiceItem {
  name: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  serialNumber?: string;
  total?: number;
}

export interface InvoicePrintConfig {
  label: string;               // Preset name e.g. "Standard A4 Tax Invoice"
  paperWidthMm: number;        // 210mm (A4), 216mm (Letter), 80mm (Thermal POS Invoice)
  fontSizeMm: number;          // Base font size in mm (default 3.5mm)
  documentTitle: string;       // Default title e.g. "TAX INVOICE" or "QUOTATION"
  storeName: string;           // Store/Company display name
  headerAddress: string;       // Store address
  headerPhone: string;         // Contact phone
  headerEmail: string;         // Business email
  taxNumber: string;           // Tax ID / VAT Registration number
  bankDetailsText: string;     // Payment / Bank Transfer info
  termsAndConditions: string;  // Payment terms, warranty note & validity
  showTaxBreakdown: boolean;   // Show Subtotal, Tax (VAT/NBT), Discount lines
  showDueDate: boolean;        // Show Due Date / Quotation Expiry Date
  showSignatureBlock: boolean; // Render Authorized Signature line & stamp box
  showQrCode: boolean;         // Render E-invoice / Order verify QR code
  isDefault: boolean;          // Default invoice preset flag
  logoUrl?: string;            // Custom Store Logo URL from Personalization settings
}

export interface InvoicePrintPreset {
  id: string;
  name?: string;
  label: string;
  category: string;
  /** Serialized InvoicePrintConfig JSON as stored in PocketBase. */
  config: string;
  isDefault?: boolean;
  created?: string;
  updated?: string;
}

export const DEFAULT_INVOICE_CONFIG: InvoicePrintConfig = {
  label: 'Standard A4 Sales & Quotation Invoice',
  paperWidthMm: 210,
  fontSizeMm: 3.5,
  documentTitle: 'INVOICE',
  storeName: 'FTC Electronics',
  headerAddress: 'Main Street, Colombo, Sri Lanka',
  headerPhone: '+94 77 123 4567',
  headerEmail: 'info@ftc.lk',
  taxNumber: 'VAT Reg: 123456789-0000',
  bankDetailsText: 'Bank: Commercial Bank of Ceylon | Account: 1000293847 | Branch: Colombo Main',
  termsAndConditions: '1. Quotations are valid for 14 days from issue date.\n2. Warranty claims require original invoice copy.\n3. Goods sold are subject to FTC store return policy.',
  showTaxBreakdown: true,
  showDueDate: true,
  showSignatureBlock: true,
  showQrCode: true,
  isDefault: true,
};

/**
 * Safely parse invoice config from raw JSON or object with defaults.
 */
export function normalizeInvoiceConfig(raw: string | object): InvoicePrintConfig {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // Parse and clamp paperWidthMm to safe bounds (safe range 50mm - 500mm)
    let paperWidthMm = Number(obj?.paperWidthMm);
    if (!Number.isFinite(paperWidthMm) || paperWidthMm < 50 || paperWidthMm > 500) {
      paperWidthMm = 210; // Fallback to standard A4
    }

    // Parse and clamp fontSizeMm to safe bounds (safe range 1mm - 20mm)
    let fontSizeMm = Number(obj?.fontSizeMm);
    if (!Number.isFinite(fontSizeMm) || fontSizeMm < 1 || fontSizeMm > 20) {
      fontSizeMm = 3.5; // Fallback to standard base font size
    }

    return {
      ...DEFAULT_INVOICE_CONFIG,
      ...obj,
      paperWidthMm,
      fontSizeMm,
    };
  } catch {
    return { ...DEFAULT_INVOICE_CONFIG };
  }
}
