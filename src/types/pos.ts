// POS (Point of Sale) types for FTC Electronics

import type { PBRecord } from './admin';

// ─── Employee ─────────────────────────────────────────────────────────────────

export type EmployeeRole = 'cashier' | 'manager';

export interface PBEmployee extends PBRecord {
  name: string;
  pin: string; // 4–6 digit PIN stored as plain text (internal system)
  role: EmployeeRole;
  isActive: boolean;
}

// Session stored in sessionStorage under key 'pos_employee'
export interface PosEmployeeSession {
  id: string;
  name: string;
  role: EmployeeRole;
  loginTime: string; // ISO string
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

export interface PosCartItem {
  /** Unique key for the line (product id or unit barcode) */
  key: string;
  productId: string;
  productName: string;
  sku: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  /** Per-item discount in currency units */
  itemDiscount: number;
  lineTotal: number; // (unitPrice - itemDiscount) * quantity
  countInStock?: number;
  unitId?: string;
  unitBarcode?: string;
  unitSerial?: string;
}

// ─── Sale ─────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'card' | 'qr' | 'split';
export type SaleStatus = 'completed' | 'voided';

export interface PBSale extends PBRecord {
  receipt_number?: string;
  date?: string;
  cashier_name: string;
  cashier_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_id?: string;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  payment_method: PaymentMethod;
  cash_tendered: number;
  change_due: number;
  items_count?: number;
  status: SaleStatus;
  notes: string;
}

export interface PBSaleItem extends PBRecord {
  sale: string; // relation → sales
  product_id: string;
  product_name: string;
  sku: string;
  unit_price: number;
  item_discount?: number;
  unit_cost?: number;
  quantity: number;
  line_total: number;
  unit_id?: string;
  unit_barcode?: string;
  unit_serial?: string;
  image_url?: string;
  category?: string;
}

// ─── Checkout Payload ─────────────────────────────────────────────────────────

export interface SalePayload {
  receipt_number?: string;
  date?: string;
  cashier_name: string;
  cashier_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_id?: string;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  payment_method: PaymentMethod;
  cash_tendered: number;
  change_due: number;
  items_count?: number;
  status?: SaleStatus;
  notes: string;
  items: Array<{
    product_id: string;
    product_name: string;
    sku: string;
    unit_price: number;
    item_discount?: number;
    unit_cost?: number;
    quantity: number;
    line_total: number;
    unit_id?: string;
    unit_barcode?: string;
    unit_serial?: string;
    image_url?: string;
    category?: string;
  }>;
}
