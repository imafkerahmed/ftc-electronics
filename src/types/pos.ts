// POS (Point of Sale) types for FTC Electronics

import type { PBRecord } from './admin';

// ─── Employee ─────────────────────────────────────────────────────────────────

export type EmployeeRole = 'cashier' | 'manager';

export interface PBEmployee extends PBRecord {
  name: string;
  pin: string; // 4–6 digit PIN (never exposed to client browser; verified server-side)
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

export type PaymentMethod = 'cash' | 'card' | 'cheque' | 'bank_transfer' | 'qr' | 'split';
export type SaleStatus = 'completed' | 'voided';
export type PaymentRecordStatus = 'cleared' | 'pending' | 'bounced' | 'cancelled';
export type PaymentTerms = 'due_on_receipt' | 'net_7' | 'net_14' | 'net_30' | 'custom';
export type PaymentStatus = 'PAID' | 'BALANCE PENDING' | 'UNPAID' | 'VOIDED' | 'REVOKED';
export type CollectionStatus = 'SETTLED' | 'NOT DUE' | 'DUE SOON' | 'DUE TODAY' | 'OVERDUE' | 'VOIDED' | 'REVOKED';

export interface SalePayment {
  id: string;
  sale_id: string;
  quotation_id?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  status: PaymentRecordStatus;
  payment_date: string;
  reference?: string | null;
  cheque_number?: string | null;
  cheque_date?: string | null;
  bank_name?: string | null;
  notes?: string | null;
  created_by: string;
  cleared_by?: string | null;
  cleared_at?: string | null;
  created_at?: string;
  updated_at?: string;
  returned_amount?: number;
  net_amount?: number;
  remaining_reversible?: number;
}

export interface SalePaymentReversal {
  id: string;
  reversal_number: string;
  payment_id: string;
  sale_id: string;
  amount: number;
  reason: string;
  reference?: string | null;
  notes?: string | null;
  reversed_by: string;
  created_at: string;
  payment_method?: PaymentMethod;
  payment_amount?: number;
}

export interface SalePaymentSummary {
  invoice_total: number;
  cleared_paid: number; // For backwards compatibility, equals effective_cleared_paid
  gross_cleared_paid?: number;
  returned_amount?: number;
  effective_cleared_paid?: number;
  pending_clearance: number;
  balance_due: number;
  available_to_record: number;
  payment_status: 'UNPAID' | 'BALANCE PENDING' | 'PAID' | 'REVOKED';
  payment_terms?: PaymentTerms;
  due_date?: string;
  is_revoked?: boolean;
  invoice_revoked_at?: string | null;
  invoice_revoked_by?: string | null;
  invoice_revoke_reason?: string | null;
  invoice_revoke_notes?: string | null;
}

export interface OutstandingReceivable {
  id: string;
  invoice_number: string;
  receipt_number: string;
  invoice_date: string;
  due_date: string;
  customer_name: string;
  customer_company?: string | null;
  customer_phone: string;
  customer_email: string;
  items_count: number;
  invoice_total: number;
  cleared_paid: number; // Effective cleared paid
  gross_cleared_paid?: number;
  returned_amount?: number;
  effective_cleared_paid?: number;
  pending_clearance: number;
  balance_due: number;
  available_to_record: number;
  payment_status: 'UNPAID' | 'BALANCE PENDING' | 'PAID';
  collection_status: CollectionStatus;
  days_overdue: number;
  aging_bucket: string;
  payment_terms: PaymentTerms;
  total_count: number;
}

export interface OutstandingReceivablesMetrics {
  total_outstanding: number;
  total_invoices: number;
  unpaid_amount: number;
  unpaid_count: number;
  balance_pending_amount: number;
  balance_pending_count: number;
  pending_cheques: number;
  pending_cheques_count: number;
  due_today_amount: number;
  due_today_count: number;
  due_next_7_days_amount: number;
  due_next_7_days_count: number;
  overdue_amount: number;
  overdue_count: number;
  overdue_30_plus_amount: number;
  overdue_30_plus_count: number;
}

export type ChequeOperationalState =
  | 'UPCOMING'
  | 'DUE TODAY'
  | 'OVERDUE FOR REVIEW'
  | 'CLEARED'
  | 'BOUNCED'
  | 'CANCELLED';

export interface ChequeRegisterItem {
  id: string;
  payment_id: string;
  sale_id: string;
  cheque_number: string;
  bank_name: string;
  amount: number;
  status: PaymentRecordStatus;
  payment_date: string;
  cheque_date: string;
  notes?: string | null;
  created_by: string;
  created_at: string;
  cleared_by?: string | null;
  cleared_at?: string | null;
  invoice_number?: string | null;
  receipt_number: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  dealer_company?: string | null;
  dealer_contact?: string | null;
  invoice_total: number;
  invoice_cleared_paid: number;
  invoice_pending_clearance: number;
  invoice_balance_due: number;
  invoice_payment_status: PaymentStatus;
  available_to_record: number;
  operational_state: ChequeOperationalState;
  days_diff: number;
  days_overdue: number;
  total_count: number;
}

export interface ChequeRegisterMetrics {
  pending_amount: number;
  pending_count: number;
  due_today_amount: number;
  due_today_count: number;
  upcoming_amount: number;
  upcoming_count: number;
  overdue_amount: number;
  overdue_count: number;
  cleared_this_month_amount: number;
  cleared_this_month_count: number;
  bounced_this_month_amount: number;
  bounced_this_month_count: number;
}

export interface PBSale extends PBRecord {
  receipt_number?: string;
  invoice_number?: string;
  invoiced_at?: string;
  date?: string;
  cashier_name?: string | null;
  cashier_id?: string | null;
  issued_by_profile_id?: string | null;
  issued_by_name?: string | null;
  customer_name: string;
  customer_company?: string | null;
  customer_phone: string;
  customer_email?: string;
  customer_id?: string;
  subtotal: number;
  discount: number;
  tax_amount: number;
  total: number;
  payment_method?: PaymentMethod | null;
  payment_terms?: PaymentTerms;
  due_date?: string;
  cash_tendered: number;
  change_due: number;
  items_count?: number;
  status: SaleStatus;
  notes: string;
  void_reason?: string;
  voided_at?: string;
  quotation_id?: string | null;
  invoice_revoked_at?: string;
  invoice_revoked_by?: string;
  invoice_revoke_reason?: string;
  invoice_revoke_notes?: string;
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
