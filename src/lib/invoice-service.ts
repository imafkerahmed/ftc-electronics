import { getAdminSupabase } from '@/lib/supabase-admin';
import type { InvoiceDocumentData, InvoiceItemData, BusinessInfo } from '@/types/invoice-document';
import { DEFAULT_WARRANTY_STATEMENT } from '@/types/invoice-document';
import { generateInvoicePdfBuffer } from '@/lib/invoice-pdf';
import { formatPaymentMethod } from '@/lib/email';

interface OrderItemRaw {
  productId?: string;
  product?: string;
  id?: string;
  name?: string;
  product_name?: string;
  sku?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  unit_price?: number;
  unitPrice?: number;
  discount?: number;
  assignedSerials?: string[];
  assignedUnits?: Array<{ serialNumber?: string; barcode?: string }>;
}

interface OrderRaw {
  id: string;
  order_id?: string;
  orderId?: string;
  customer?: { name?: string; email?: string; phone?: string; userId?: string };
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  shipping_address?: string | object;
  shippingAddress?: string | object;
  items?: OrderItemRaw[];
  subtotal?: number;
  discount_amount?: number;
  tax_amount?: number;
  shipping_fee?: number;
  total?: number;
  status?: string;
  is_paid?: boolean;
  paid_at?: string;
  payment_details?: {
    method?: string;
    status?: string;
    paymentId?: string;
    paymentSlipUrl?: string;
  };
  invoice_number?: string | null;
  invoiced_at?: string | null;
  invoice_snapshot?: InvoiceDocumentData | null;
  created_at?: string;
}

export async function resolveStoreBusinessInfo(): Promise<BusinessInfo> {
  const supabase = getAdminSupabase();
  let storeName = 'FTC Electronics';
  let address = 'Main Street, Colombo, Sri Lanka';
  let phone = '+94 77 123 4567';
  let email = 'info@ftc.lk';
  let website = 'https://ftc.lk';
  let logoUrl = undefined;
  let taxNumber = undefined;

  try {
    const { data: presets } = await supabase
      .from('system_configurations')
      .select('*')
      .eq('category', 'invoice_print')
      .order('is_default', { ascending: false });

    if (presets && presets.length > 0) {
      const config = typeof presets[0].config === 'string' ? JSON.parse(presets[0].config) : presets[0].config;
      storeName = config.storeName || storeName;
      address = config.headerAddress || address;
      phone = config.headerPhone || phone;
      email = config.headerEmail || email;
      if (config.taxNumber && !config.taxNumber.includes('123456789')) {
        taxNumber = config.taxNumber;
      }
    }
  } catch (err) {
    console.warn('[resolveStoreBusinessInfo] Error reading invoice config:', err);
  }

  return {
    storeName,
    address,
    phone,
    email,
    website,
    logoUrl,
    taxNumber,
  };
}

export function formatAddressString(addr?: string | object | null): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr.trim();
  if (typeof addr === 'object') {
    const obj = addr as Record<string, string>;
    const parts = [obj.addressLine1, obj.addressLine2, obj.address, obj.city, obj.state, obj.postalCode, obj.country];
    return parts.filter(Boolean).map((p) => String(p).trim()).join(', ');
  }
  return '';
}

/**
 * Normalizes an authoritative order record into InvoiceDocumentData.
 */
export function buildInvoiceDocumentData(
  order: OrderRaw,
  invoiceNumber: string,
  invoicedAt: string,
  business: BusinessInfo
): InvoiceDocumentData {
  const itemsRaw = Array.isArray(order.items) ? order.items : [];
  const normalizedItems: InvoiceItemData[] = itemsRaw.map((it) => {
    const unitPrice = Number(it.price ?? it.unitPrice ?? it.unit_price ?? 0);
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const disc = Number(it.discount ?? 0);
    const lineTot = unitPrice * qty - disc;

    const serials: string[] = Array.isArray(it.assignedSerials) && it.assignedSerials.length > 0
      ? it.assignedSerials.filter(Boolean)
      : Array.isArray(it.assignedUnits)
        ? it.assignedUnits.map((u) => u.serialNumber || u.barcode).filter((s): s is string => Boolean(s))
        : [];

    const pId = it.productId || it.product || it.id;
    return {
      productId: pId,
      name: it.name || it.product_name || 'Product',
      sku: it.sku,
      qty,
      unitPrice,
      discount: disc,
      lineTotal: lineTot,
      serials: serials.length > 0 ? serials : undefined,
    };
  });

  const subtotal = Number(order.subtotal ?? order.total ?? 0);
  const discount = Number(order.discount_amount ?? 0);
  const shipping = Number(order.shipping_fee ?? 0);
  const tax = Number(order.tax_amount ?? 0);
  const total = Number(order.total ?? 0);

  const orderDateParsed = order.created_at ? new Date(order.created_at) : new Date();
  const invoicedDateParsed = invoicedAt ? new Date(invoicedAt) : new Date();

  const formattedOrderDate = orderDateParsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formattedInvoiceDate = invoicedDateParsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const rawMethod = order.payment_details?.method;
  const paymentMethod = formatPaymentMethod(rawMethod);
  const isPaid = Boolean(order.is_paid || order.payment_details?.status === 'paid');

  let paidAtFormatted: string | undefined = undefined;
  if (order.paid_at) {
    paidAtFormatted = new Date(order.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const paymentRef = order.payment_details?.paymentId || (rawMethod === 'bank_transfer' && order.payment_details?.paymentSlipUrl ? 'Bank Deposit Slip Verified' : undefined);

  return {
    invoiceNumber,
    invoiceDate: formattedInvoiceDate,
    orderNumber: order.order_id || order.id,
    orderDate: formattedOrderDate,
    customerName: order.customer?.name || order.customerName || 'Customer',
    customerEmail: order.customer?.email || order.customerEmail || '',
    customerPhone: order.customer?.phone || order.customerPhone || '',
    shippingAddress: formatAddressString(order.shipping_address || order.shippingAddress),
    items: normalizedItems,
    subtotal,
    discount,
    shipping,
    tax,
    total,
    currency: 'Rs.',
    paymentStatus: isPaid ? 'PAID' : 'UNPAID',
    paymentMethod,
    paidAt: paidAtFormatted,
    paymentReference: paymentRef,
    business,
    warrantyStatement: DEFAULT_WARRANTY_STATEMENT,
    termsAndConditions: '1. Warranty claims require this invoice copy and matching product serial number.\n2. Goods sold are subject to FTC Electronics return and warranty policies.',
  };
}

/**
 * Authoritative Server-Side Invoice Issuer.
 * - Enforces is_paid === true before issuing.
 * - Idempotently persists invoice_number and invoice_snapshot on the order.
 * - Generates high-fidelity PDF buffer.
 */
export async function ensureInvoiceForPaidOrder(orderId: string): Promise<{
  success: boolean;
  invoiceData?: InvoiceDocumentData;
  data?: InvoiceDocumentData;
  pdfBuffer?: Buffer;
  error?: string;
}> {
  try {
    const supabase = getAdminSupabase();
    const cleanOrderId = orderId.replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) {
      return { success: false, error: 'Invalid order reference.' };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    let query = supabase.from('orders').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
    } else {
      query = query.eq('order_id', cleanOrderId);
    }

    const { data: order, error } = await query.maybeSingle();
    if (error || !order) {
      return { success: false, error: 'Order not found.' };
    }

    const typedOrder = order as unknown as OrderRaw;

    // Rule: Final Invoice is issued ONLY after authoritative payment confirmation
    if (!typedOrder.is_paid && typedOrder.payment_details?.status !== 'paid') {
      return {
        success: false,
        error: `Cannot issue final invoice: Order #${typedOrder.order_id || typedOrder.id} is not marked as paid.`,
      };
    }

    const business = await resolveStoreBusinessInfo();

    let invoiceData: InvoiceDocumentData;

    if (typedOrder.invoice_number && typedOrder.invoice_snapshot) {
      // Use existing immutable snapshot
      invoiceData = typedOrder.invoice_snapshot;
    } else {
      // Prepare authoritative draft snapshot before database row-locking
      const draftSnapshot = buildInvoiceDocumentData(
        typedOrder,
        typedOrder.invoice_number || 'PENDING',
        typedOrder.invoiced_at || new Date().toISOString(),
        business
      );

      // Issue atomically in database with exclusive row-level lock
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('issue_order_invoice_atomic', {
        p_order_id: typedOrder.id,
        p_invoice_snapshot: draftSnapshot,
      });

      if (rpcErr || !rpcResult || !rpcResult.success) {
        console.error('[ensureInvoiceForPaidOrder] Atomic issuance error:', rpcErr || rpcResult?.error);
        return {
          success: false,
          error: rpcResult?.error || rpcErr?.message || 'Failed to issue invoice atomically.',
        };
      }

      invoiceData = rpcResult.invoice_snapshot as InvoiceDocumentData;
    }

    // Refresh assigned serial numbers for warranty validation if allocated post-issuance
    // (Never mutates immutable financial figures)
    try {
      const itemsRaw = Array.isArray(typedOrder.items) ? typedOrder.items : [];
      let hasNewSerials = false;
      const updatedItems = invoiceData.items.map((invItem) => {
        const matchingRaw = itemsRaw.find((raw) => {
          const rawPid = raw.productId || raw.product || raw.id;
          if (invItem.productId && rawPid) {
            return invItem.productId === rawPid;
          }
          if (invItem.sku && raw.sku) {
            return invItem.sku === raw.sku;
          }
          return (raw.name || raw.product_name) === invItem.name;
        });

        if (matchingRaw) {
          const rawSerials = Array.isArray(matchingRaw.assignedSerials) && matchingRaw.assignedSerials.length > 0
            ? matchingRaw.assignedSerials.filter(Boolean)
            : Array.isArray(matchingRaw.assignedUnits)
              ? matchingRaw.assignedUnits.map((u) => u.serialNumber || u.barcode).filter((s): s is string => Boolean(s))
              : [];

          const existingSerials = invItem.serials || invItem.serialNumbers || [];
          if (rawSerials.length > 0 && existingSerials.length === 0) {
            hasNewSerials = true;
            return {
              ...invItem,
              serials: rawSerials,
              serialNumbers: undefined,
            };
          }
        }

        // Normalize deprecated serialNumbers to canonical serials if present
        if (!invItem.serials && invItem.serialNumbers) {
          return {
            ...invItem,
            serials: invItem.serialNumbers,
            serialNumbers: undefined,
          };
        }

        return invItem;
      });

      if (hasNewSerials) {
        invoiceData = { ...invoiceData, items: updatedItems };
      }
    } catch (serialsErr) {
      console.warn('[ensureInvoiceForPaidOrder] Serial lookup notice:', serialsErr);
    }

    // Generate PDF Buffer
    const pdfBuffer = await generateInvoicePdfBuffer(invoiceData);

    return {
      success: true,
      invoiceData,
      data: invoiceData,
      pdfBuffer,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to issue invoice.';
    console.error('[ensureInvoiceForPaidOrder] Error:', err);
    return { success: false, error: msg };
  }
}

/**
 * Generates sample InvoiceDocumentData for Printer Presets live preview and Test PDF generation.
 */
export function generateSampleInvoiceData(presetConfig?: any): InvoiceDocumentData {
  return {
    invoiceNumber: 'INV-2026-SAMPLE',
    invoiceDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    orderNumber: 'ORD-SAMPLE-8899',
    orderDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    customerName: 'Sample Customer',
    customerEmail: 'customer@example.com',
    customerPhone: '+94 77 123 4567',
    customerCompany: 'Apex Solutions Pvt Ltd',
    customerAddress: 'No. 42, Galle Road, Colombo 03, Sri Lanka',
    shippingAddress: 'No. 42, Galle Road, Colombo 03, Sri Lanka',
    items: [
      {
        name: 'Anker MagGo Wireless Power Bank (10,000mAh, Qi2 15W)',
        sku: 'ANK-MG-10K',
        qty: 1,
        unitPrice: 24500,
        discount: 0,
        lineTotal: 24500,
        serials: ['SN-ANK-2026-90812'],
      },
      {
        name: 'USB-C to USB-C Fast Braided Cable (2M, 100W)',
        sku: 'ANK-CB-2M',
        qty: 2,
        unitPrice: 3500,
        discount: 500,
        lineTotal: 6500,
        serials: ['SN-CB-110294', 'SN-CB-110295'],
      },
    ],
    subtotal: 31500,
    discount: 500,
    shipping: 0,
    tax: 0,
    total: 31000,
    currency: 'Rs.',
    paymentStatus: 'PAID',
    paymentMethod: 'Bank Transfer',
    paidAt: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    paymentReference: 'BT-REF-992014',
    business: {
      storeName: presetConfig?.storeName || 'FTC Electronics',
      address: presetConfig?.headerAddress || 'Main Street, Colombo, Sri Lanka',
      phone: presetConfig?.headerPhone || '+94 77 123 4567',
      email: presetConfig?.headerEmail || 'info@ftc.lk',
      website: 'https://ftc.lk',
      taxNumber: presetConfig?.taxNumber && !presetConfig.taxNumber.includes('123456789') ? presetConfig.taxNumber : undefined,
    },
    warrantyStatement: DEFAULT_WARRANTY_STATEMENT,
    termsAndConditions: presetConfig?.termsAndConditions || '1. Warranty claims require this invoice copy and matching product serial number.\n2. Goods sold are subject to FTC Electronics return and warranty policies.',
  };
}
