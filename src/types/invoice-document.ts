/**
 * Normalized Commercial Document Model for FTC Electronics
 * Single source of truth for Invoices, Receipts, Quotations, and PDF renderers.
 */

export interface InvoiceItemData {
  productId?: string;
  name: string;
  sku?: string;
  qty: number;
  unitPrice: number;
  discount?: number;
  lineTotal: number;
  serials?: string[];
  /** @deprecated Compatibility read-only fallback for historical invoice snapshots */
  serialNumbers?: string[];
}

export interface BusinessInfo {
  storeName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl?: string;
  taxNumber?: string;
}

export interface InvoiceDocumentData {
  // Document Identifiers
  invoiceNumber: string;        // e.g. "INV-2026-000001"
  invoiceDate: string;          // Formatted date string e.g. "18 Sep 2026"
  orderNumber: string;          // e.g. "ORD-810882-E6F0"
  orderDate: string;            // e.g. "18 Sep 2026"

  // Customer Details
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCompany?: string;
  customerAddress?: string;
  shippingAddress?: string;

  // Items & Accounting
  items: InvoiceItemData[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;             // "Rs." or "LKR"

  // Payment Status
  paymentStatus: 'PAID' | 'UNPAID';
  paymentMethod: string;        // "Bank Transfer", "PayHere (Card/Wallet)", "Cash on Delivery", "Cash on Pickup"
  paidAt?: string;              // ISO string or formatted date
  paymentReference?: string;    // PayHere ID, Bank slip reference, etc.

  // Business Profile
  business: BusinessInfo;

  // Legal & Warranty Statements
  warrantyStatement: string;
  termsAndConditions?: string;
  notes?: string;
}

export interface PaymentReceiptData {
  receiptNumber: string;        // e.g. "REC-20260918-1042"
  invoiceNumber?: string;       // Associated invoice number e.g. "INV-2026-000001"
  orderNumber: string;          // e.g. "ORD-810882-E6F0"
  amountReceived: number;
  currency: string;
  paymentMethod: string;
  paymentDate: string;
  paymentReference?: string;
  customerName: string;
  customerEmail?: string;
  business: BusinessInfo;
  notes?: string;
}

export const DEFAULT_WARRANTY_STATEMENT =
  'Please retain this invoice as official proof of purchase for warranty claims. Warranty eligibility is also securely registered in FTC Electronics sales records with the product serial number(s) listed above.';
