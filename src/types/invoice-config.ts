/**
 * Sales Invoice & Quotation print configuration types and default settings.
 * Designed for both A4 / Letter formal invoices and POS thermal invoices.
 */

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
    return {
      ...DEFAULT_INVOICE_CONFIG,
      ...obj,
      paperWidthMm: obj?.paperWidthMm || 210,
      fontSizeMm: obj?.fontSizeMm || 3.5,
    };
  } catch {
    return { ...DEFAULT_INVOICE_CONFIG };
  }
}
