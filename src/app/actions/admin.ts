'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAdminPb, writeAuditLog } from '@/lib/pb-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import { ROLE_PERMISSIONS } from '@/types/admin';
import type { AdminRole, AuditAction, DealerSaleRecord } from '@/types/admin';
import type { BarcodePrintConfig } from '@/types/barcode-config';
import type { ReceiptPrintConfig, ReceiptPrintPreset } from '@/types/receipt-config';
import type { InvoicePrintConfig, InvoicePrintPreset } from '@/types/invoice-config';
import { sendQuotationEmail, sendOrderInvoiceEmail, sendOrderShippingEmail } from '@/lib/email';
import { sendInvoiceEmailForOrder } from '@/lib/order-email';
import { deductStockForConfirmedOrderAction } from '@/app/actions/checkout';
import {
  pbProducts,
  pbCategories,
  pbBrands,
  pbReviews,
  pbHomepageBlocks,
  pbSiteSettings,
  pbPromotions,
  pbAnnouncements,
  pbOrders,
  pbEmployees,
  pbSales,
  pbCustomers,
  pbWholesaleDealers,
  pbQuotations,
  pbContactInquiries,
} from '@/lib/pb-collections';
import type { PaymentMethod, PBSale, PBSaleItem, SalePayload } from '@/types/pos';

// Helper to cast fields safely for audit logging
function toRecord(obj: any): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return obj as unknown as Record<string, unknown>;
}

// ─── Permission Check Helper ────────────────────────────────────────────────

export async function checkPermission(
  module: keyof typeof ROLE_PERMISSIONS[AdminRole],
  action: 'read' | 'write' | 'delete'
): Promise<{ allowed: boolean; role?: AdminRole; actorEmail?: string; actorId?: string; ip?: string; userAgent?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('pb_auth_token')?.value;

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);
  const userAgent = headersList.get('user-agent') || 'unknown';

  if (!token) {
    return { allowed: false, ip, userAgent };
  }

  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!pbUrl) {
    return { allowed: false, ip, userAgent };
  }
  let actorEmail: string | undefined;
  let actorId: string | undefined;
  let effectiveRole: AdminRole | undefined;

  try {
    const PocketBase = (await import('pocketbase')).default;
    const userPb = new PocketBase(pbUrl);
    userPb.autoCancellation(false);
    userPb.authStore.save(token);

    // Validates the token against the PocketBase server and refreshes auth record
    const authData = await userPb.collection('users').authRefresh();
    const record = authData.record;
    if (!record) {
      return { allowed: false, ip, userAgent };
    }

    let role = record.role as string | undefined;
    if (role === 'admin') {
      role = 'super_admin';
    } else if (!role && (record.isAdmin === true || record.is_admin === true)) {
      role = 'super_admin';
    }

    effectiveRole = role as AdminRole;
    actorEmail = record.email || undefined;
    actorId = record.id || undefined;
  } catch {
    return { allowed: false, ip, userAgent };
  }

  if (!effectiveRole) {
    return { allowed: false, ip, userAgent };
  }

  const permissions = ROLE_PERMISSIONS[effectiveRole];
  if (!permissions) {
    return { allowed: false, role: effectiveRole, actorEmail, actorId, ip, userAgent };
  }

  const modulePerms = permissions[module] as Record<string, boolean> | undefined;
  if (!modulePerms || !modulePerms[action]) {
    return { allowed: false, role: effectiveRole, actorEmail, actorId, ip, userAgent };
  }

  return { allowed: true, role: effectiveRole, actorEmail, actorId, ip, userAgent };
}

// ─── Products Actions ─────────────────────────────────────────────────────────

export async function createProductAction(formData: FormData) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbProducts.create(formData);
    
    // Log to audit log
    await writeAuditLog(
      check.actorEmail!,
      'create',
      'products',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath(`/products/${record.slug}`);
    revalidatePath('/admin/products');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create product.' };
  }
}

export async function updateProductAction(id: string, formData: FormData) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const oldRecord = await pbProducts.getById(id);
    const record = await pbProducts.update(id, formData);

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'products',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath(`/products/${record.slug}`);
    revalidatePath('/admin/products');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update product.' };
  }
}

export async function updateProductStockAction(id: string, countInStock: number) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const oldRecord = await pbProducts.getById(id);
    const pb = await getAdminPb();
    const record = await pb.collection('products').update(id, { countInStock });

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'products',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/admin/products');
    revalidatePath('/admin/inventory');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update product stock.' };
  }
}

export async function createStockPurchaseAction(data: {
  productId: string;
  batchNumber: string;
  quantity: number;
  unitCost?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
  newCost?: number;
  oldPrice?: number;
}) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const product = await pbProducts.getById(data.productId);
    if (!product) return { success: false, error: 'Product not found.' };

    const adminPb = await getAdminPb();
    const purchaseRecord = await adminPb.collection('stock_purchases').create({
      product: data.productId,
      batchNumber: data.batchNumber,
      quantity: data.quantity,
      unitCost: data.unitCost || 0,
      supplier: data.supplier || '',
      purchaseDate: data.purchaseDate || new Date().toISOString().split('T')[0],
      notes: data.notes || '',
    });

    const newStockCount = Math.max(0, (product.countInStock || 0) + Number(data.quantity));

    // Price change logic
    const priceUpdate: Record<string, number | null> = { countInStock: newStockCount };
    if (data.newCost && data.newCost > 0 && data.oldPrice !== undefined) {
      if (data.newCost > data.oldPrice) {
        // Price increased — update price, clear discountPrice so no strikethrough shown
        priceUpdate.price = data.newCost;
        priceUpdate.discountPrice = null as any;
      } else if (data.newCost < data.oldPrice) {
        // Price dropped — keep price as old (for strikethrough), set discountPrice = new lower cost
        priceUpdate.discountPrice = data.newCost;
        // price stays as oldPrice (already in DB)
      }
      // If equal, no price change needed
    }

    await adminPb.collection('products').update(data.productId, priceUpdate);

    // Auto-generate unit barcode items in stock_management if positive quantity added
    if (data.quantity > 0) {
      for (let i = 0; i < data.quantity; i++) {
        const barcode = `STK-${data.productId.slice(-5).toUpperCase()}-${Date.now().toString().slice(-5)}-${i + 1}`;
        const serialNumber = `SN-${data.productId.slice(-4).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
        try {
          await adminPb.collection('stock_management').create({
            product: data.productId,
            barcode,
            serialNumber,
            status: 'available',
            batchNumber: data.batchNumber,
          });
        } catch {
          // Ignore individual barcode duplicate errors
        }
      }
    }

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'stock_purchases',
      purchaseRecord.id,
      undefined,
      toRecord(purchaseRecord),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath(`/admin/inventory/${data.productId}`);
    revalidatePath('/admin/inventory');
    revalidatePath('/admin/products');
    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath(`/products/${product.slug}`);
    return { success: true, data: purchaseRecord, newStockCount };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record stock purchase.' };
  }
}

export async function getStockPurchasesAction(productId: string) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const adminPb = await getAdminPb();
    const records = await adminPb.collection('stock_purchases').getFullList({
      filter: `product = "${productId}"`,
      sort: '-id',
    });
    return { success: true, data: structuredClone(records) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch stock purchases.', data: [] };
  }
}

export async function getStockManagementUnitsAction(productId: string) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const adminPb = await getAdminPb();
    const records = await adminPb.collection('stock_management').getFullList({
      filter: `product = "${productId}"`,
      sort: '-id',
    });
    return { success: true, data: structuredClone(records) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch stock units.', data: [] };
  }
}

export async function createStockUnitAction(data: {
  productId: string;
  barcode?: string;
  serialNumber?: string;
  batchNumber?: string;
  notes?: string;
}) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();
    const barcode = data.barcode || `STK-${data.productId.slice(-6).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const unit = await adminPb.collection('stock_management').create({
      product: data.productId,
      barcode,
      serialNumber: data.serialNumber || '',
      status: 'available',
      batchNumber: data.batchNumber || '',
      notes: data.notes || '',
    });

    revalidatePath(`/admin/inventory/${data.productId}`);
    revalidatePath('/admin/inventory');
    return { success: true, data: unit };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create stock unit barcode.' };
  }
}

export async function generateBatchBarcodesAction(productId: string, quantity: number, batchNumber?: string) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();
    const batch = batchNumber || `PO-${Date.now().toString().slice(-6)}`;
    const createdUnits = [];

    // Generate individual available stock unit barcodes
    for (let i = 0; i < quantity; i++) {
      const barcode = `STK-${productId.slice(-5).toUpperCase()}-${Date.now().toString().slice(-5)}-${i + 1}`;
      const serialNumber = `SN-${productId.slice(-4).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const unit = await adminPb.collection('stock_management').create({
        product: productId,
        barcode,
        serialNumber,
        status: 'available',
        batchNumber: batch,
      });
      createdUnits.push(unit);
    }

    revalidatePath(`/admin/inventory/${productId}`);
    revalidatePath('/admin/inventory');
    return { success: true, count: createdUnits.length };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate batch barcodes.' };
  }
}

export async function updateStockUnitStatusAction(id: string, productId: string, status: 'available' | 'reserved' | 'sold' | 'defective' | 'returned') {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();
    const unit = await adminPb.collection('stock_management').update(id, { status });

    revalidatePath(`/admin/inventory/${productId}`);
    revalidatePath('/admin/inventory');
    return { success: true, data: unit };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update stock unit status.' };
  }
}

export async function deleteProductAction(id: string) {
  const check = await checkPermission('products', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const oldRecord = await pbProducts.getById(id);
    await pbProducts.delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'products',
      id,
      toRecord(oldRecord),
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/admin/products');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete product.' };
  }
}

// ─── Categories Actions ───────────────────────────────────────────────────────

export async function createCategoryAction(data: { name: string; slug: string; sortOrder: number; isActive?: boolean }) {
  const check = await checkPermission('categories', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbCategories.create(data);

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'categories',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/categories');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create category.' };
  }
}

export async function updateCategoryAction(id: string, data: Partial<{ name: string; slug: string; sortOrder: number; isActive: boolean }>) {
  const check = await checkPermission('categories', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const oldRecord = await pb.collection('categories').getOne(id);
    const record = await pbCategories.update(id, data);

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'categories',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/categories');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update category.' };
  }
}

export async function deleteCategoryAction(id: string) {
  const check = await checkPermission('categories', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const oldRecord = await pb.collection('categories').getOne(id);
    await pbCategories.delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'categories',
      id,
      toRecord(oldRecord),
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/categories');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete category.' };
  }
}

export async function reorderCategoriesAction(items: { id: string; sortOrder: number }[]) {
  const check = await checkPermission('categories', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();
    // Update sortOrder sequentially
    for (const item of items) {
      await adminPb.collection('categories').update(item.id, { sortOrder: item.sortOrder });
    }

    revalidatePath('/');
    revalidatePath('/admin/categories');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update categories sort order.' };
  }
}

// ─── Brands Actions ──────────────────────────────────────────────────────────

export async function createBrandAction(formData: FormData) {
  const check = await checkPermission('brands', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbBrands.create(formData);

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'brands',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/brands');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create brand.' };
  }
}

export async function updateBrandAction(id: string, formData: FormData) {
  const check = await checkPermission('brands', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const oldRecord = await pb.collection('brands').getOne(id);
    const record = await pbBrands.update(id, formData);

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'brands',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/brands');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update brand.' };
  }
}

export async function deleteBrandAction(id: string) {
  const check = await checkPermission('brands', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const oldRecord = await pb.collection('brands').getOne(id);
    await pbBrands.delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'brands',
      id,
      toRecord(oldRecord),
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/brands');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete brand.' };
  }
}

// ─── Reviews Actions ──────────────────────────────────────────────────────────

export async function createReviewAction(data: {
  customerName: string;
  rating: number;
  comment: string;
  isVerified: boolean;
  isFeatured: boolean;
  status: 'pending' | 'approved' | 'rejected';
  product: string;
}) {
  const check = await checkPermission('reviews', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbReviews.create(data);

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'reviews',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/reviews');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create review.' };
  }
}

export async function updateReviewStatusAction(id: string, status: 'approved' | 'rejected') {
  const check = await checkPermission('reviews', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbReviews.update(id, { status });

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'reviews',
      id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/reviews');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update review status.' };
  }
}

export async function deleteReviewAction(id: string) {
  const check = await checkPermission('reviews', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    await pbReviews.delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'reviews',
      id,
      undefined,
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/reviews');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete review.' };
  }
}

// ─── Promotions Actions ───────────────────────────────────────────────────────

export async function createPromotionAction(data: {
  name: string;
  couponCode: string;
  type: 'percentage' | 'flat';
  discountValue: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  minOrderValue?: number;
  usageLimit?: number;
}) {
  const check = await checkPermission('promotions', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  if (data.discountValue !== undefined && data.discountValue < 0) {
    return { success: false, error: 'Discount value cannot be negative.' };
  }
  if (data.minOrderValue !== undefined && data.minOrderValue < 0) {
    return { success: false, error: 'Minimum order value cannot be negative.' };
  }
  if (data.usageLimit !== undefined && (data.usageLimit < 0 || !Number.isInteger(data.usageLimit))) {
    return { success: false, error: 'Usage limit must be a non-negative whole number.' };
  }

  try {
    const record = await pbPromotions.create({
      ...data,
      usageCount: 0,
    });

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'promotions',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/promotions');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create promotion.' };
  }
}

export async function updatePromotionAction(id: string, data: any) {
  const check = await checkPermission('promotions', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  if (data.discountValue !== undefined && data.discountValue < 0) {
    return { success: false, error: 'Discount value cannot be negative.' };
  }
  if (data.minOrderValue !== undefined && data.minOrderValue < 0) {
    return { success: false, error: 'Minimum order value cannot be negative.' };
  }
  if (data.usageLimit !== undefined && (data.usageLimit < 0 || !Number.isInteger(data.usageLimit))) {
    return { success: false, error: 'Usage limit must be a non-negative whole number.' };
  }

  try {
    const record = await pbPromotions.update(id, data);

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'promotions',
      id,
      undefined, // simplified audit diff
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/promotions');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update promotion.' };
  }
}

export async function deletePromotionAction(id: string) {
  const check = await checkPermission('promotions', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    await pbPromotions.delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'promotions',
      id,
      undefined,
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/promotions');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete promotion.' };
  }
}

function generatePbId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 15);
}

export async function getAnnouncementsAction() {
  const check = await checkPermission('settings', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', items: [] };

  try {
    const res = await pbAnnouncements.getAll({ page: 1, perPage: 100 });
    return { success: true, items: res.items || [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch announcements.', items: [] };
  }
}

export async function createAnnouncementAction(formData: FormData) {
  const check = await checkPermission('settings', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    formData.delete('removeImage');

    const imageFile = formData.get('image');
    if (!imageFile || (imageFile instanceof File && imageFile.size === 0)) {
      formData.delete('image');
    }

    // Normalize endsAt to end of specified day (23:59:59.999)
    const endsAtVal = formData.get('endsAt')?.toString();
    if (endsAtVal) {
      const endOfDay = new Date(endsAtVal);
      if (!isNaN(endOfDay.getTime())) {
        endOfDay.setHours(23, 59, 59, 999);
        formData.set('endsAt', endOfDay.toISOString());
      } else {
        formData.delete('endsAt');
      }
    } else {
      formData.delete('endsAt');
    }

    const record = await pbAnnouncements.create(formData);
    if (!record) throw new Error('Failed to create announcement record.');

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'announcements',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/', 'layout');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create announcement.' };
  }
}

export async function updateAnnouncementAction(id: string, formData: FormData) {
  const check = await checkPermission('settings', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const isRemoveImage = formData.get('removeImage') === 'true';
    formData.delete('removeImage');

    if (isRemoveImage) {
      formData.set('image', '');
    } else {
      const imageFile = formData.get('image');
      if (!imageFile || (imageFile instanceof File && imageFile.size === 0)) {
        formData.delete('image');
      }
    }

    // Normalize endsAt
    const endsAtVal = formData.get('endsAt')?.toString();
    if (endsAtVal) {
      const endOfDay = new Date(endsAtVal);
      if (!isNaN(endOfDay.getTime())) {
        endOfDay.setHours(23, 59, 59, 999);
        formData.set('endsAt', endOfDay.toISOString());
      } else {
        formData.delete('endsAt');
      }
    } else {
      formData.delete('endsAt');
    }

    const record = await pbAnnouncements.update(id, formData);
    if (!record) throw new Error('Failed to update announcement record.');

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'announcements',
      id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/', 'layout');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update announcement.' };
  }
}

export async function deleteAnnouncementAction(id: string) {
  const check = await checkPermission('settings', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    await pbAnnouncements.delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'announcements',
      id,
      undefined,
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete announcement.' };
  }
}

export async function toggleAnnouncementActiveAction(id: string, isActive: boolean) {
  const check = await checkPermission('settings', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbAnnouncements.update(id, { isActive });

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'announcements',
      id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/', 'layout');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to toggle status.' };
  }
}

// ─── Site Settings Actions ────────────────────────────────────────────────────

export async function updateSiteSettingsAction(key: string, value: Record<string, unknown>) {
  const check = await checkPermission('settings', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const oldSettings = await pbSiteSettings.get(key);
    await pbSiteSettings.set(key, value);

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'site_settings',
      key,
      toRecord(oldSettings),
      value,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/contact');
    revalidatePath('/connect');
    revalidatePath('/links');
    revalidatePath('/socials');
    revalidatePath('/admin/settings');
    revalidatePath('/admin/system-config/general');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update site settings.' };
  }
}

// ─── Homepage Blocks Actions ──────────────────────────────────────────────────

export async function updateHomepageBlocksAction(blocks: { id: string; isEnabled: boolean; sortOrder: number }[]) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    
    // Perform updates sequentially
    for (const block of blocks) {
      await pbHomepageBlocks.update(block.id, {
        isEnabled: block.isEnabled,
        sortOrder: block.sortOrder,
      });
    }

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'homepage_blocks',
      'bulk-reorder',
      undefined,
      { updatedBlocksCount: blocks.length },
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/homepage');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update homepage block configurations.' };
  }
}

export async function updateHomepageBlockConfigAction(id: string, config: any) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbHomepageBlocks.update(id, { config });

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'homepage_blocks',
      id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/homepage');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update homepage block config.' };
  }
}

export async function createHomepageBlockAction(data: {
  type: string;
  title: string;
  isEnabled?: boolean;
  sortOrder?: number;
  config?: any;
  deviceVisibility?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const record = await pbHomepageBlocks.create({
      type: data.type,
      title: data.title,
      isEnabled: data.isEnabled !== false,
      sortOrder: data.sortOrder || 0,
      config: data.config || {},
      deviceVisibility: data.deviceVisibility || 'all',
      scheduledStart: data.scheduledStart || '',
      scheduledEnd: data.scheduledEnd || '',
    });

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'homepage_blocks',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/homepage');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create homepage block.' };
  }
}

export async function deleteHomepageBlockAction(id: string) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    await pbHomepageBlocks.delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'homepage_blocks',
      id,
      undefined,
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
    revalidatePath('/admin/homepage');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete homepage block.' };
  }
}

// ─── Hero Banner Actions ───────────────────────────────────────────────────────

export async function createHeroBannerAction(formData: FormData) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const record = await pb.collection('hero_banners').create(formData);

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'hero_banners',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
    revalidatePath('/admin/homepage');
    return { success: true, data: toRecord(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create hero banner.' };
  }
}

export async function updateHeroBannerAction(id: string, formData: FormData) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const record = await pb.collection('hero_banners').update(id, formData);

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'hero_banners',
      id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
    revalidatePath('/admin/homepage');
    return { success: true, data: toRecord(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update hero banner.' };
  }
}

export async function deleteHeroBannerAction(id: string) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    await pb.collection('hero_banners').delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'hero_banners',
      id,
      undefined,
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
    revalidatePath('/admin/homepage');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete hero banner.' };
  }
}

export async function reorderHeroBannersAction(items: Array<{ id: string; sortOrder: number }>) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    for (const item of items) {
      await pb.collection('hero_banners').update(item.id, { sortOrder: item.sortOrder });
    }

    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
    revalidatePath('/admin/homepage');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reorder hero banners.' };
  }
}

// ─── Media Actions ────────────────────────────────────────────────────────────

export async function uploadMediaAction(formData: FormData) {
  const check = await checkPermission('media', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const record = await pb.collection('media').create(formData);

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'media',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/media');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to upload media file.' };
  }
}

export async function deleteMediaAction(id: string) {
  const check = await checkPermission('media', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const oldRecord = await pb.collection('media').getOne(id);
    await pb.collection('media').delete(id);

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'media',
      id,
      toRecord(oldRecord),
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/media');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete media asset.' };
  }
}

// ─── Customers Actions ────────────────────────────────────────────────────────

export async function toggleCustomerStatusAction(id: string, currentStatus: 'active' | 'banned') {
  const check = await checkPermission('users', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    const oldRecord = await pb.collection('customers').getOne(id);
    const record = await pb.collection('customers').update(id, {
      status: newStatus,
    });

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'customers',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/customers');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update customer account status.' };
  }
}

// ─── Orders Actions ──────────────────────────────────────────────────────────

export async function getAdminOrdersAction() {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const pb = await getAdminPb();
    const result = await pb.collection('orders').getList(1, 100, {
      sort: '-created',
    });

    return {
      success: true,
      data: result.items,
    };
  } catch (err: any) {
    console.error('[getAdminOrdersAction] Error:', err);
    return { success: false, error: err.message || 'Failed to fetch orders.', data: [] };
  }
}

export async function updateOrderStatusAction(id: string, status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded') {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const oldRecord = await pb.collection('orders').getOne(id);
    
    const updateData: Record<string, any> = { status };
    if (status === 'delivered') {
      updateData.isDelivered = true;
      updateData.deliveredAt = new Date().toISOString();
    } else if (status === 'shipped') {
      updateData.isDelivered = false; // reset/ensure
    }

    const record = await pbOrders.update(id, updateData);

    if (status === 'shipped') {
      try {
        const customerEmail = oldRecord.customer?.email || oldRecord.customerEmail || oldRecord.email;
        if (customerEmail) {
          await sendOrderShippingEmail({
            to: customerEmail,
            orderNumber: oldRecord.orderId || oldRecord.id,
            customerName: oldRecord.customer?.name || oldRecord.customerName || 'Customer',
            shippingAddress: oldRecord.shippingAddress,
            items: Array.isArray(oldRecord.items)
              ? oldRecord.items.map((i: any) => ({ name: i.name || 'Product', qty: i.quantity || i.qty || 1 }))
              : [],
          });
        }
      } catch (shippingEmailErr) {
        console.error('[updateOrderStatusAction] Failed to send shipping email:', shippingEmailErr);
      }
    }

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'orders',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/orders');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update order status.' };
  }
}

export async function markOrderAsPaidAction(id: string) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const pb = await getAdminPb();
    const oldRecord = await pb.collection('orders').getOne(id);

    const updateData: Record<string, any> = {
      isPaid: true,
      paidAt: new Date().toISOString(),
      status: 'processing',
    };

    const record = await pbOrders.update(id, updateData);

    // Deduct stock upon confirmed payment
    try {
      await deductStockForConfirmedOrderAction(id);
    } catch (stockErr) {
      console.error('[markOrderAsPaidAction] Stock deduction error:', stockErr);
    }

    // Send confirmation email to customer now that payment is confirmed
    try {
      await sendInvoiceEmailForOrder(id);
    } catch (emailErr) {
      console.error('[markOrderAsPaidAction] Failed to send email:', emailErr);
    }

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'orders',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/orders');
    return { success: true, data: record };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to mark order as paid.' };
  }
}

/**
 * Marks an order as Returned (e.g. customer unreachable / package returned).
 * Restores product countInStock, releases serial units back to available status,
 * and updates order status to 'cancelled'.
 */
export async function markOrderAsReturnedAction(id: string, reason = 'Returned / Unreachable Customer') {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();
    const order = await adminPb.collection('orders').getOne(id);
    if (!order) return { success: false, error: 'Order not found.' };

    const items = Array.isArray(order.items) ? order.items : [];
    const orderNum = order.orderId || order.id;

    // 1. If stock was deducted for this order, restore countInStock and log stock_purchases restock entry
    if (order.stockDeducted) {
      for (const item of items) {
        const productId = item.productId || item.product || item.id;
        const qty = item.quantity || item.qty || 1;

        if (productId) {
          try {
            const product = await pbProducts.getById(productId);
            if (product) {
              const currentStock = product.countInStock || 0;
              await adminPb.collection('products').update(productId, {
                countInStock: currentStock + qty,
              });
            }
          } catch (pErr) {
            console.warn(`[markOrderAsReturnedAction] Failed restoring stock for ${productId}:`, pErr);
          }

          try {
            await adminPb.collection('stock_purchases').create({
              product: productId,
              batchNumber: `RESTOCK-${orderNum}`,
              quantity: qty,
              unitCost: item.price || 0,
              supplier: `Returned Order (${reason})`,
              purchaseDate: new Date().toISOString().split('T')[0],
              notes: `Package Returned - Restocked from Order ${orderNum} (${reason})`,
            });
          } catch (spErr) {
            console.warn('[markOrderAsReturnedAction] Failed creating stock_purchases restock record:', spErr);
          }
        }
      }
    }

    // 2. Release all serial units linked to this order back to 'available' status
    try {
      const linkedUnits = await adminPb.collection('stock_management').getFullList({
        filter: adminPb.filter('orderId = {:recId} || orderId = {:orderNo}', {
          recId: order.id,
          orderNo: order.orderId || order.id,
        }),
      });

      for (const unit of linkedUnits) {
        await adminPb.collection('stock_management').update(unit.id, {
          status: 'available',
          orderId: '',
          notes: `Restored to available stock from Returned Order ${orderNum} (${reason})`,
        });
      }
    } catch (unitErr) {
      console.warn('[markOrderAsReturnedAction] Error releasing serial units:', unitErr);
    }

    // 3. Update order status to 'cancelled' with return notes
    const updatedOrder = await pbOrders.update(id, {
      status: 'cancelled',
      stockDeducted: false,
      notes: `Returned: ${reason}`,
    });

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'orders',
      id,
      toRecord(order),
      toRecord(updatedOrder),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/products');

    return { success: true };
  } catch (err: any) {
    console.error('[markOrderAsReturnedAction] Error:', err);
    return { success: false, error: err.message || 'Failed to process order return.' };
  }
}

// ─── System Configurations (Barcode Print Presets) ────────────────────────────

// BarcodePrintConfig is imported at the top of the file from @/types/barcode-config.
// Do NOT re-export anything non-async from a 'use server' file.

export async function getBarcodePrintPresetsAction() {
  const check = await checkPermission('systemConfig', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const adminPb = await getAdminPb();
    const records = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "barcode_print"',
      sort: '-isDefault',
    });
    return { success: true, data: structuredClone(records) };
  } catch {
    return { success: false, error: 'Failed to load barcode presets.', data: [] };
  }
}

export async function saveBarcodePrintPresetAction(
  config: BarcodePrintConfig,
  existingId?: string
) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    const payload = {
      category: 'barcode_print',
      label: config.label,
      config: JSON.stringify(config),
      isDefault: config.isDefault,
    };

    if (config.isDefault) {
      const existing = await adminPb.collection('system_configurations').getFullList({
        filter: 'category = "barcode_print" && isDefault = true',
      });
      for (const rec of existing) {
        if (rec.id !== existingId) {
          await adminPb.collection('system_configurations').update(rec.id, { isDefault: false });
        }
      }
    }

    let record;
    if (existingId) {
      record = await adminPb.collection('system_configurations').update(existingId, payload);
    } else {
      record = await adminPb.collection('system_configurations').create(payload);
    }

    revalidatePath('/admin/system-config');
    return { success: true, data: structuredClone(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save preset.' };
  }
}

export async function deleteBarcodePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    await adminPb.collection('system_configurations').delete(id);
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete preset.' };
  }
}

export async function setDefaultBarcodePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    const all = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "barcode_print"',
    });
    for (const rec of all) {
      await adminPb.collection('system_configurations').update(rec.id, {
        isDefault: rec.id === id,
      });
    }
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to set default.' };
  }
}

// ─── System Configurations (Receipt Print Presets) ───────────────────────────

export async function getReceiptPrintPresetsAction(): Promise<{
  success: boolean;
  error?: string;
  data: ReceiptPrintPreset[];
}> {
  const check = await checkPermission('systemConfig', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const adminPb = await getAdminPb();
    const [genSettings, persSettings] = await Promise.all([
      pbSiteSettings.get<any>('general').catch(() => null),
      pbSiteSettings.get<any>('personalization').catch(() => null),
    ]);

    const logoUrl = persSettings?.logoUrl || persSettings?.darkLogoUrl || '';
    const dbStoreName = genSettings?.siteName || '';
    const dbAddress = [genSettings?.location?.address, genSettings?.location?.city].filter(Boolean).join(', ');
    const dbPhone = genSettings?.contactInfo?.phone || '';

    const records = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "receipt_print"',
      sort: '-isDefault',
    });

    const list = records.map((r) => {
      let parsedConfig: Record<string, any> = {};
      try {
        parsedConfig = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {});
      } catch (err) {
        console.error('[getReceiptPrintPresetsAction] Invalid JSON config for preset:', r.id, err);
      }
      return {
        id: r.id,
        category: r.category,
        label: r.label || 'Default Preset',
        isDefault: Boolean(r.isDefault),
        config: JSON.stringify({
          ...parsedConfig,
          logoUrl: parsedConfig.logoUrl || logoUrl,
          storeName: dbStoreName || parsedConfig.storeName || 'FTC Electronics',
          headerAddress: dbAddress || parsedConfig.headerAddress || '',
          headerPhone: dbPhone || parsedConfig.headerPhone || '',
        }),
      };
    });
    return { success: true, data: list as ReceiptPrintPreset[] };
  } catch (err) {
    console.error('[getReceiptPrintPresetsAction] Failed to load receipt presets:', err);
    return { success: false, error: 'Failed to load receipt presets.', data: [] };
  }
}

export async function saveReceiptPrintPresetAction(
  config: ReceiptPrintConfig,
  existingId?: string
) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    const payload = {
      category: 'receipt_print',
      label: config.label,
      config: JSON.stringify(config),
      isDefault: config.isDefault,
    };

    if (config.isDefault) {
      const existing = await adminPb.collection('system_configurations').getFullList({
        filter: 'category = "receipt_print" && isDefault = true',
      });
      for (const rec of existing) {
        if (rec.id !== existingId) {
          await adminPb.collection('system_configurations').update(rec.id, { isDefault: false });
        }
      }
    }

    let record;
    if (existingId) {
      record = await adminPb.collection('system_configurations').update(existingId, payload);
    } else {
      record = await adminPb.collection('system_configurations').create(payload);
    }

    revalidatePath('/admin/system-config');
    return { success: true, data: structuredClone(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save receipt preset.' };
  }
}

export async function deleteReceiptPrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    await adminPb.collection('system_configurations').delete(id);
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete receipt preset.' };
  }
}

export async function setDefaultReceiptPrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    const all = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "receipt_print"',
    });
    for (const rec of all) {
      await adminPb.collection('system_configurations').update(rec.id, {
        isDefault: rec.id === id,
      });
    }
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to set default receipt preset.' };
  }
}

// ─── System Configurations (Sales Invoice & Quotation Presets) ─────────────────

export async function getInvoicePrintPresetsAction() {
  const check = await checkPermission('systemConfig', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const adminPb = await getAdminPb();
    const [genSettings, persSettings] = await Promise.all([
      pbSiteSettings.get<any>('general').catch(() => null),
      pbSiteSettings.get<any>('personalization').catch(() => null),
    ]);

    const logoUrl = persSettings?.logoUrl || persSettings?.darkLogoUrl || '';
    const dbStoreName = genSettings?.siteName || '';
    const dbAddress = [genSettings?.location?.address, genSettings?.location?.city].filter(Boolean).join(', ');
    const dbPhone = genSettings?.contactInfo?.phone || '';
    const dbEmail = genSettings?.contactInfo?.email || '';

    const records = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "invoice_print"',
      sort: '-isDefault',
    });

    const list = records.map((r) => {
      let parsedConfig: Record<string, any> = {};
      try {
        parsedConfig = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {});
      } catch (err) {
        console.error('[getInvoicePrintPresetsAction] Invalid JSON config for preset:', r.id, err);
      }
      return {
        id: r.id,
        category: r.category,
        label: r.label || 'Default Preset',
        isDefault: Boolean(r.isDefault),
        config: JSON.stringify({
          ...parsedConfig,
          logoUrl: parsedConfig.logoUrl || logoUrl,
          storeName: dbStoreName || parsedConfig.storeName || 'FTC Electronics',
          headerAddress: dbAddress || parsedConfig.headerAddress || '',
          headerPhone: dbPhone || parsedConfig.headerPhone || '',
          headerEmail: dbEmail || parsedConfig.headerEmail || '',
        }),
      };
    });
    return { success: true, data: list as InvoicePrintPreset[] };
  } catch (err) {
    console.error('[getInvoicePrintPresetsAction] Failed to load invoice presets:', err);
    return { success: false, error: 'Failed to load invoice presets.', data: [] };
  }
}

export async function saveInvoicePrintPresetAction(
  config: InvoicePrintConfig,
  existingId?: string
) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    const payload = {
      category: 'invoice_print',
      label: config.label,
      config: JSON.stringify(config),
      isDefault: config.isDefault,
    };

    if (config.isDefault) {
      const existing = await adminPb.collection('system_configurations').getFullList({
        filter: 'category = "invoice_print" && isDefault = true',
      });
      for (const rec of existing) {
        if (rec.id !== existingId) {
          await adminPb.collection('system_configurations').update(rec.id, { isDefault: false });
        }
      }
    }

    let record;
    if (existingId) {
      record = await adminPb.collection('system_configurations').update(existingId, payload);
    } else {
      record = await adminPb.collection('system_configurations').create(payload);
    }

    revalidatePath('/admin/system-config');
    return { success: true, data: structuredClone(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save invoice preset.' };
  }
}

export async function deleteInvoicePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    await adminPb.collection('system_configurations').delete(id);
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete invoice preset.' };
  }
}

export async function setDefaultInvoicePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    const all = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "invoice_print"',
    });
    for (const rec of all) {
      await adminPb.collection('system_configurations').update(rec.id, {
        isDefault: rec.id === id,
      });
    }
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to set default invoice preset.' };
  }
}
// ─── POS — Employees ──────────────────────────────────────────────────────────

export async function getPosEmployeesAction() {
  try {
    const employees = await pbEmployees.getAll();
    return { success: true, data: employees };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load employees.' };
  }
}

export async function getPosEmployeesAdminAction() {
  const perm = await checkPermission('systemConfig', 'read');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Read employees permission required.' };
  }
  try {
    const employees = await pbEmployees.getAllAdmin();
    return { success: true, data: employees };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load employees.' };
  }
}

export async function createPosEmployeeAction(data: {
  name: string;
  pin: string;
  role: string;
  isActive: boolean;
}) {
  const perm = await checkPermission('systemConfig', 'write');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Employee write permission required.' };
  }
  try {
    const emp = await pbEmployees.create(data);
    revalidatePath('/admin/system-config/employees');
    return { success: true, data: emp };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create employee.' };
  }
}

export async function updatePosEmployeeAction(
  id: string,
  data: Partial<{ name: string; pin: string; role: string; isActive: boolean }>
) {
  const perm = await checkPermission('systemConfig', 'write');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Employee write permission required.' };
  }
  try {
    const emp = await pbEmployees.update(id, data);
    revalidatePath('/admin/system-config/employees');
    return { success: true, data: emp };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update employee.' };
  }
}

export async function deletePosEmployeeAction(id: string) {
  const perm = await checkPermission('systemConfig', 'delete');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Employee delete permission required.' };
  }
  try {
    await pbEmployees.delete(id);
    revalidatePath('/admin/system-config/employees');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete employee.' };
  }
}

// ─── POS — Sales ──────────────────────────────────────────────────────────────

export async function createSaleAction(payload: SalePayload) {
  try {
    const result = await pbSales.createSale(payload);
    revalidatePath('/pos/history');
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record sale.' };
  }
}

export async function sendPosSaleEmailAction(saleId: string, emailAddress?: string) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const sale = await pbSales.getById(saleId);
    if (!sale) return { success: false, error: 'Sale record not found.' };

    const targetEmail = emailAddress?.trim() || sale.customer_email?.trim();
    if (!targetEmail) {
      return { success: false, error: 'Customer email address is required.' };
    }

    let storeName = 'FTC Electronics';
    let storePhone = '';
    let storeEmail = '';
    let storeAddress = '';

    try {
      const presetsRes = await getInvoicePrintPresetsAction();
      if (presetsRes.success && presetsRes.data && presetsRes.data.length > 0) {
        const defaultPreset = presetsRes.data.find((p) => p.isDefault) || presetsRes.data[0];
        const config = JSON.parse(defaultPreset.config);
        storeName = config.storeName || storeName;
        storePhone = config.headerPhone || storePhone;
        storeEmail = config.headerEmail || storeEmail;
        storeAddress = config.headerAddress || storeAddress;
      }
    } catch (presetErr) {
      console.warn('[sendPosSaleEmailAction] Warning: Failed to load invoice config:', presetErr);
    }

    const saleItems = await pbSales.getItemsBySale(saleId);
    const items: Array<{ name: string; qty: number; unitPrice: number; discount?: number }> = (saleItems || []).map((i) => ({
      name: i.product_name,
      qty: i.quantity,
      unitPrice: i.unit_price,
      discount: i.item_discount || 0,
    }));

    const emailResult = await sendOrderInvoiceEmail({
      to: targetEmail,
      orderNumber: sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`,
      customerName: sale.customer_name || 'Walk-in Customer',
      shippingAddress: '',
      items,
      totalAmount: sale.total,
      paymentMethod: `Paid via ${sale.payment_method?.toUpperCase() || 'POS'}`,
      storeName,
      storePhone,
      storeEmail,
      storeAddress,
    });

    if (!emailResult.success) {
      return { success: false, error: emailResult.error || 'Failed to send email.' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[sendPosSaleEmailAction] Error:', err);
    return { success: false, error: err.message || 'An error occurred while sending the email.' };
  }
}

export async function getRecentSalesAction(limit = 50) {
  try {
    const sales = await pbSales.getRecent(limit);
    return { success: true, data: sales };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load sales.' };
  }
}

export async function getSaleByIdAction(
  id: string
): Promise<{ success: boolean; data?: { sale: PBSale; items: PBSaleItem[] }; error?: string }> {
  try {
    const sale = await pbSales.getById(id);
    if (!sale) return { success: false, error: 'Sale not found.' };
    const items = await pbSales.getItemsBySale(id);

    if (sale.customer_phone && (!sale.customer_email || sale.customer_email.endsWith('@customer.local') || sale.customer_email === 'customer@ftc.lk')) {
      try {
        const adminPb = await getAdminPb();
        const cust = await adminPb
          .collection('customers')
          .getFirstListItem(adminPb.filter('phone = {:phone}', { phone: sale.customer_phone }))
          .catch(() => null);
        if (cust) {
          if (cust.email && !cust.email.endsWith('@customer.local') && cust.email !== 'customer@ftc.lk') {
            sale.customer_email = cust.email;
          }
        }
      } catch (custErr) {
        console.warn('[getSaleByIdAction] Warning: Failed to query customer by phone:', custErr);
      }
    }

    return { success: true, data: { sale, items } };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load sale.' };
  }
}

export async function verifyManagerPinAction(pin: string) {
  try {
    const adminPb = await getAdminPb();
    const cleanPin = pin.trim();
    if (!cleanPin) return { success: false, error: 'PIN is required.' };

    const users = await adminPb.collection('users').getFullList({
      filter: adminPb.filter('pin = {:pin}', { pin: cleanPin }),
    });

    const manager = users.find(
      (u: any) =>
        u.role === 'manager' ||
        u.role === 'admin' ||
        u.role === 'superuser' ||
        u.role === 'owner'
    );

    if (manager) {
      return { success: true, managerName: manager.name || manager.email };
    }

    return { success: false, error: 'Invalid Manager or Admin PIN.' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Verification failed.' };
  }
}

export async function voidSaleAction(id: string, managerPin: string) {
  try {
    const verify = await verifyManagerPinAction(managerPin);
    if (!verify.success) {
      return { success: false, error: verify.error || 'Manager PIN required to void sales.' };
    }
    const sale = await pbSales.voidSale(id);
    revalidatePath('/pos/history');
    return { success: true, data: sale };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to void sale.' };
  }
}

// ─── POS — Customers ──────────────────────────────────────────────────────────

export async function searchPosCustomersAction(query: string) {
  try {
    const adminPb = await getAdminPb();
    const q = query.trim().replace(/"/g, '\\"');
    const filter = q ? `name ~ "${q}" || phone ~ "${q}" || email ~ "${q}"` : '';
    const customers = await adminPb.collection('customers').getFullList({
      filter,
      sort: 'name',
    });
    return { success: true, data: customers };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to search customers.' };
  }
}

export async function createPosCustomerAction(data: { name: string; phone?: string; email?: string; notes?: string }) {
  try {
    const adminPb = await getAdminPb();
    const customer = await adminPb.collection('customers').create({
      name: data.name,
      email: data.email || `${Date.now()}@customer.local`,
      phone: data.phone || '',
      ordersCount: 0,
      totalSpent: 0,
      status: 'active',
      notes: data.notes || 'Created via POS',
    });
    revalidatePath('/admin/customers');
    return { success: true, data: customer };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create customer.' };
  }
}

export async function validatePosCouponAction(code: string, cartTotal: number) {
  try {
    const adminPb = await getAdminPb();
    const cleanCode = code.trim();
    if (!cleanCode) return { success: false, error: 'Coupon code is required.' };

    const now = new Date().toISOString();
    const promotions = await adminPb.collection('promotions').getFullList({
      filter: `couponCode = "${cleanCode}" && isActive = true && startDate <= "${now}" && endDate >= "${now}"`,
    });

    if (promotions.length === 0) {
      return { success: false, error: 'Invalid or expired coupon code.' };
    }

    const promo = promotions[0];
    if (promo.minOrderValue && cartTotal < promo.minOrderValue) {
      return {
        success: false,
        error: `Minimum order value of Rs. ${promo.minOrderValue.toLocaleString()} required for this coupon.`,
      };
    }

    return {
      success: true,
      data: {
        id: promo.id,
        name: promo.name,
        type: promo.type,
        discountValue: promo.discountValue,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to validate coupon.' };
  }
}

export async function getUnifiedSalesTrackerAction() {
  try {
    const adminPb = await getAdminPb();

    // Fetch POS Sales (sort by -id to bypass created field sorting bug)
    const sales = await adminPb.collection('sales').getFullList({
      sort: '-id',
    });

    // Fetch Online Orders
    const ordersRes = await adminPb.collection('orders').getFullList({
      sort: '-id',
      expand: 'user',
    });

    // Format both lists uniformly
    const posSalesFormatted = sales.map((s: any) => ({
      id: s.id,
      receiptNumber: s.receipt_number || `FTC-POS-${s.id.slice(-6).toUpperCase()}`,
      date: s.date || s.created || s.updated,
      customerName: s.customer_name || 'Walk-in Customer',
      customerEmail: s.customer_email || '—',
      itemsCount: s.items_count || 1,
      total: s.total || 0,
      discount: s.discount || 0,
      paymentMethod: s.payment_method || 'cash',
      status: s.status || 'completed',
      source: 'POS Terminal',
    }));

    const onlineOrdersFormatted = ordersRes.map((o: any) => {
      let itemsCount = 1;
      if (Array.isArray(o.items)) {
        itemsCount = o.items.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
      } else if (o.items && typeof o.items === 'object') {
        itemsCount = Object.keys(o.items).length;
      }
      
      let customerName = 'Online Customer';
      if (o.expand?.user?.name) {
        customerName = o.expand.user.name;
      } else if (o.shippingAddress?.firstName) {
        customerName = `${o.shippingAddress.firstName} ${o.shippingAddress.lastName || ''}`.trim();
      }

      return {
        id: o.id,
        receiptNumber: o.orderId || `FTC-ONL-${o.id.slice(-6).toUpperCase()}`,
        date: o.created || o.updated,
        customerName,
        customerEmail: o.email || o.expand?.user?.email || '—',
        itemsCount,
        total: o.total || 0,
        discount: 0,
        paymentMethod: o.paymentDetails?.method || 'card',
        status: o.status === 'cancelled' ? 'voided' : 'completed',
        source: 'Online Store',
      };
    });

    // Merge and sort by date descending
    const unified = [...posSalesFormatted, ...onlineOrdersFormatted].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    return { success: true, data: unified };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch unified sales.' };
  }
}

// ─── Wholesale Dealers Actions ──────────────────────────────────────────────────

export async function getWholesaleDealersAction() {
  const check = await checkPermission('users', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const list = await pbWholesaleDealers.getAll();
    return { success: true, data: structuredClone(list || []) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch wholesale dealers.', data: [] };
  }
}

export async function saveWholesaleDealerAction(
  data: {
    company_name: string;
    contact_name: string;
    email: string;
    phone?: string;
    tax_id?: string;
    address?: string;
    discount_rate?: number;
    credit_limit?: number;
    status: 'active' | 'pending' | 'suspended';
    notes?: string;
  },
  existingId?: string
) {
  const check = await checkPermission('users', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    let record;
    if (existingId) {
      record = await pbWholesaleDealers.update(existingId, data);
    } else {
      record = await pbWholesaleDealers.create(data);
    }
    revalidatePath('/admin/wholesale-dealers');
    return { success: true, data: structuredClone(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save wholesale dealer.' };
  }
}

export async function deleteWholesaleDealerAction(id: string) {
  const check = await checkPermission('users', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    await pbWholesaleDealers.delete(id);
    revalidatePath('/admin/wholesale-dealers');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete wholesale dealer.' };
  }
}

export async function getDealerPurchaseHistoryAction(
  email?: string,
  phone?: string,
  companyName?: string
): Promise<{ success: boolean; error?: string; data: DealerSaleRecord[] }> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const adminPb = await getAdminPb();

    // Fetch POS sales matching email, phone or customer name
    const filters: string[] = [];
    if (email) filters.push(adminPb.filter('customer_email ~ {:email}', { email }));
    if (phone) filters.push(adminPb.filter('customer_phone ~ {:phone}', { phone }));
    if (companyName) filters.push(adminPb.filter('customer_name ~ {:companyName}', { companyName }));

    if (filters.length === 0) {
      return { success: false, error: 'At least one dealer identifier is required.', data: [] };
    }

    const filterStr = filters.join(' || ');
    const sales = await adminPb.collection('sales').getFullList({
      filter: filterStr,
      sort: '-created',
    });

    return { success: true, data: structuredClone(sales) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch dealer purchase history.', data: [] };
  }
}

// ─── Quotations Actions ─────────────────────────────────────────────────────────

export async function getQuotationsAction() {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const list = await pbQuotations.getAll();
    return { success: true, data: structuredClone(list || []) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch quotations.', data: [] };
  }
}

export async function saveQuotationAction(
  data: {
    quote_number: string;
    quote_type?: 'wholesale' | 'direct';
    dealer_id?: string;
    customer_name: string;
    customer_company?: string;
    customer_email?: string;
    customer_phone?: string;
    customer_address?: string;
    items: Array<{ name: string; qty: number; unitPrice: number; discount?: number; total?: number }>;
    subtotal: number;
    tax_amount?: number;
    discount_amount?: number;
    total_amount: number;
    valid_until: string;
    status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
    notes?: string;
    createDealerIfNew?: boolean;
    createCustomerIfNew?: boolean;
  },
  existingId?: string
) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    // Auto-create new Wholesale Dealer if requested
    if (data.createDealerIfNew && data.customer_name && data.quote_type === 'wholesale') {
      const dealerCheck = await checkPermission('users', 'write');
      if (!dealerCheck.allowed) {
        return { success: false, error: 'Unauthorized to auto-create wholesale dealers.' };
      }
      if (!data.customer_email) {
        return { success: false, error: 'A valid customer email is required to auto-create a wholesale dealer.' };
      }
      try {
        await pbWholesaleDealers.create({
          company_name: data.customer_company || data.customer_name,
          contact_name: data.customer_name,
          email: data.customer_email,
          phone: data.customer_phone || '',
          address: data.customer_address || '',
          status: 'active',
          discount_rate: 5,
        });
      } catch (err) {
        console.error('[saveQuotationAction] Failed to auto-create wholesale dealer:', err);
      }
    }

    // Auto-create new Customer if requested
    if (data.createCustomerIfNew && data.customer_name && data.quote_type === 'direct') {
      const customerCheck = await checkPermission('users', 'write');
      if (!customerCheck.allowed) {
        return { success: false, error: 'Unauthorized to auto-create customer records.' };
      }
      if (!data.customer_email) {
        return { success: false, error: 'A valid customer email is required to auto-create a customer record.' };
      }
      try {
        const adminPb = await getAdminPb();
        await adminPb.collection('customers').create({
          name: data.customer_name,
          email: data.customer_email,
          phone: data.customer_phone || '',
          status: 'active',
          notes: 'Auto-created from Quotation',
        });
      } catch (err) {
        console.error('[saveQuotationAction] Failed to auto-create customer:', err);
      }
    }

    const { createDealerIfNew, createCustomerIfNew, ...payload } = data;

    let record;
    if (existingId) {
      record = await pbQuotations.update(existingId, payload);
    } else {
      record = await pbQuotations.create(payload);
    }
    revalidatePath('/admin/quotations');
    return { success: true, data: structuredClone(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save quotation.' };
  }
}

export async function deleteQuotationAction(id: string) {
  const check = await checkPermission('orders', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    await pbQuotations.delete(id);
    revalidatePath('/admin/quotations');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete quotation.' };
  }
}

export async function convertQuotationToSaleAction(quoteId: string, paymentMethod: PaymentMethod = 'cash') {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const quote = await pbQuotations.getById(quoteId);
    if (!quote) return { success: false, error: 'Quotation not found.' };

    const items = quote.items.map((item) => ({
      product_id: '',
      product_name: item.name,
      sku: 'QUOTE-ITEM',
      unit_price: item.unitPrice,
      item_discount: item.discount || 0,
      quantity: item.qty,
      line_total: item.total || (item.unitPrice * item.qty - (item.discount || 0)),
    }));

    const salePayload: SalePayload = {
      cashier_name: check.actorEmail || 'Admin User',
      cashier_id: check.actorId || 'admin',
      customer_name: quote.customer_name,
      customer_phone: quote.customer_phone || '',
      customer_email: quote.customer_email,
      subtotal: quote.subtotal,
      discount: quote.discount_amount || 0,
      tax_amount: quote.tax_amount || 0,
      total: quote.total_amount,
      payment_method: paymentMethod,
      cash_tendered: quote.total_amount,
      change_due: 0,
      items_count: items.reduce((acc, i) => acc + i.quantity, 0),
      notes: `Converted from Quotation #${quote.quote_number}`,
      items,
    };

    const saleResult = await pbSales.createSale(salePayload);
    await pbQuotations.update(quoteId, { status: 'accepted' });

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');
    return { success: true, saleId: saleResult.sale.id, receiptNumber: saleResult.sale.receipt_number };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to convert quotation to sale.' };
  }
}

export async function sendQuotationEmailAction(id: string) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const quote = await pbQuotations.getById(id);
    if (!quote) return { success: false, error: 'Quotation not found.' };
    if (!quote.customer_email) {
      return { success: false, error: 'Quotation does not have a customer email address.' };
    }

    let storeName = 'FTC Electronics';
    let storePhone = '';
    let storeEmail = '';
    let storeAddress = '';

    try {
      const presetsRes = await getInvoicePrintPresetsAction();
      if (presetsRes.success && presetsRes.data && presetsRes.data.length > 0) {
        const defaultPreset = presetsRes.data.find((p) => p.isDefault) || presetsRes.data[0];
        const config = JSON.parse(defaultPreset.config);
        storeName = config.storeName || storeName;
        storePhone = config.headerPhone || storePhone;
        storeEmail = config.headerEmail || storeEmail;
        storeAddress = config.headerAddress || storeAddress;
      }
    } catch (presetErr) {
      console.warn('[sendQuotationEmailAction] Warning: Failed to load invoice config:', presetErr);
    }

    const items = (quote.items || []).map((item: any) => ({
      name: item.name || '',
      qty: item.qty || 1,
      unitPrice: item.unitPrice || 0,
      discount: item.discount || 0,
    }));

    const emailResult = await sendQuotationEmail({
      to: quote.customer_email,
      quoteNumber: quote.quote_number,
      customerName: quote.customer_name,
      customerCompany: quote.customer_company,
      customerPhone: quote.customer_phone,
      customerAddress: quote.customer_address,
      items,
      subtotal: quote.subtotal,
      discountAmount: quote.discount_amount,
      taxAmount: quote.tax_amount,
      totalAmount: quote.total_amount,
      validUntil: quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      notes: quote.notes,
      storeName,
      storePhone,
      storeEmail,
      storeAddress,
    });

    if (!emailResult.success) {
      return { success: false, error: emailResult.error || 'Failed to send email.' };
    }

    await pbQuotations.update(id, { status: 'sent' });

    revalidatePath('/admin/quotations');

    await writeAuditLog(
      check.actorEmail || 'admin',
      'update',
      'quotations',
      id,
      { status: quote.status },
      { status: 'sent' },
      { ip: check.ip, userAgent: check.userAgent }
    );

    return { success: true };
  } catch (err: any) {
    console.error('[sendQuotationEmailAction] Error:', err);
    return { success: false, error: err.message || 'An error occurred while sending the email.' };
  }
}

export async function sendOrderInvoiceEmailAction(id: string) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const order = await pbOrders.getById(id);
    if (!order) return { success: false, error: 'Order not found.' };

    const customerEmail = order.customer?.email || (order as any).customerEmail || (order as any).email;
    if (!customerEmail) {
      return { success: false, error: 'Order does not have a customer email address.' };
    }

    const customerName = order.customer?.name || (order as any).customerName || 'Customer';

    let storeName = 'FTC Electronics';
    let storePhone = '';
    let storeEmail = '';
    let storeAddress = '';

    try {
      const presetsRes = await getInvoicePrintPresetsAction();
      if (presetsRes.success && presetsRes.data && presetsRes.data.length > 0) {
        const defaultPreset = presetsRes.data.find((p) => p.isDefault) || presetsRes.data[0];
        const config = JSON.parse(defaultPreset.config);
        storeName = config.storeName || storeName;
        storePhone = config.headerPhone || storePhone;
        storeEmail = config.headerEmail || storeEmail;
        storeAddress = config.headerAddress || storeAddress;
      }
    } catch (presetErr) {
      console.warn('[sendOrderInvoiceEmailAction] Warning: Failed to load invoice config:', presetErr);
    }

    let items: Array<{ name: string; qty: number; unitPrice: number; discount?: number }> = [];
    if (Array.isArray(order.items)) {
      items = order.items.map((item: any) => ({
        name: item.name || `Order Item`,
        qty: item.quantity || 1,
        unitPrice: item.price || 0,
      }));
    } else {
      items = [{ name: `Order ${order.orderId || order.id}`, qty: 1, unitPrice: order.total }];
    }

    const emailResult = await sendOrderInvoiceEmail({
      to: customerEmail,
      orderNumber: order.orderId || order.id,
      customerName,
      shippingAddress: order.shippingAddress || '',
      items,
      totalAmount: order.total,
      paymentMethod: order.paymentDetails?.method ? `${order.paymentDetails.method.toUpperCase()} (${order.paymentDetails.status || 'paid'})` : 'Paid',
      storeName,
      storePhone,
      storeEmail,
      storeAddress,
    });

    if (!emailResult.success) {
      return { success: false, error: emailResult.error || 'Failed to send email.' };
    }

    await writeAuditLog(
      check.actorEmail || 'admin',
      'update',
      'orders',
      id,
      { emailSent: false },
      { emailSent: true },
      { ip: check.ip, userAgent: check.userAgent }
    );

    return { success: true };
  } catch (err: any) {
    console.error('[sendOrderInvoiceEmailAction] Error:', err);
    return { success: false, error: err.message || 'An error occurred while sending the email.' };
  }
}

interface SendInvoiceWorkflowParams {
  saleId: string;
  email?: string;
  customerName?: string;
  customerPhone?: string;
}

export async function sendInvoiceViaWorkflowAction(params: SendInvoiceWorkflowParams) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const adminPb = await getAdminPb();
    
    const sale = await pbSales.getById(params.saleId);
    if (!sale) return { success: false, error: 'Sale record not found.' };

    const saleItems = await pbSales.getItemsBySale(params.saleId);
    if (!saleItems) return { success: false, error: 'Sale items not found.' };

    let resolvedEmail = params.email?.trim() || sale.customer_email?.trim();
    const resolvedName = params.customerName?.trim() || sale.customer_name?.trim() || 'Walk-in Customer';
    const resolvedPhone = params.customerPhone?.trim() || sale.customer_phone?.trim() || '';

    if (resolvedEmail && (resolvedEmail.endsWith('@customer.local') || resolvedEmail === 'customer@ftc.lk')) {
      resolvedEmail = '';
    }

    let customerRecord: any = null;

    if (resolvedPhone) {
      customerRecord = await adminPb
        .collection('customers')
        .getFirstListItem(adminPb.filter('phone = {:phone}', { phone: resolvedPhone }))
        .catch(() => null);
    }

    if (!resolvedEmail) {
      if (customerRecord) {
        const custEmail = customerRecord.email;
        if (custEmail && !custEmail.endsWith('@customer.local') && custEmail !== 'customer@ftc.lk') {
          resolvedEmail = custEmail;
        }
      }
      
      if (!resolvedEmail) {
        return {
          success: true,
          requireEmailPrompt: true,
          customerFound: !!customerRecord,
          defaultName: resolvedName,
          defaultPhone: resolvedPhone,
        };
      }
    }

    let storeName = 'FTC Electronics';
    let storePhone = '';
    let storeEmail = '';
    let storeAddress = '';

    try {
      const presetsRes = await getInvoicePrintPresetsAction();
      if (presetsRes.success && presetsRes.data && presetsRes.data.length > 0) {
        const defaultPreset = presetsRes.data.find((p) => p.isDefault) || presetsRes.data[0];
        const config = JSON.parse(defaultPreset.config);
        storeName = config.storeName || storeName;
        storePhone = config.headerPhone || storePhone;
        storeEmail = config.headerEmail || storeEmail;
        storeAddress = config.headerAddress || storeAddress;
      }
    } catch (presetErr) {
      console.warn('[sendInvoiceViaWorkflowAction] Warning: Failed to load invoice config:', presetErr);
    }

    const items: Array<{ name: string; qty: number; unitPrice: number; discount?: number }> = saleItems.map((i) => ({
      name: i.product_name,
      qty: i.quantity,
      unitPrice: i.unit_price,
      discount: i.item_discount || 0,
    }));

    // Send email FIRST before mutating DB records so DB updates are consistent with successful delivery
    const emailResult = await sendOrderInvoiceEmail({
      to: resolvedEmail,
      orderNumber: sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`,
      customerName: resolvedName,
      shippingAddress: '',
      items,
      totalAmount: sale.total,
      paymentMethod: `Paid via ${sale.payment_method?.toUpperCase() || 'POS'}`,
      storeName,
      storePhone,
      storeEmail,
      storeAddress,
    });

    if (!emailResult.success) {
      return { success: false, error: emailResult.error || 'Failed to send email.' };
    }

    // Persist customer & sale updates only after email is successfully dispatched
    if (customerRecord) {
      const currentEmail = customerRecord.email;
      if (!currentEmail || currentEmail.endsWith('@customer.local') || currentEmail === 'customer@ftc.lk' || currentEmail !== resolvedEmail) {
        await adminPb.collection('customers').update(customerRecord.id, {
          email: resolvedEmail
        });
      }
    } else {
      customerRecord = await adminPb.collection('customers').create({
        name: resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        ordersCount: 1,
        totalSpent: sale.total,
        status: 'active',
        notes: `Created via Send Invoice Workflow for Sale #${sale.receipt_number || sale.id}`,
      });
    }

    const saleUpdate: Record<string, any> = {
      customer_email: resolvedEmail
    };
    if (resolvedName !== sale.customer_name) saleUpdate.customer_name = resolvedName;
    if (resolvedPhone !== sale.customer_phone) saleUpdate.customer_phone = resolvedPhone;
    
    await adminPb.collection('sales').update(sale.id, saleUpdate);

    await writeAuditLog(
      check.actorEmail || 'admin',
      'update',
      'sales',
      sale.id,
      { customer_email: sale.customer_email },
      { customer_email: resolvedEmail },
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/sales');
    return { success: true, emailedTo: resolvedEmail };
  } catch (err: any) {
    console.error('[sendInvoiceViaWorkflowAction] Error:', err);
    return { success: false, error: err.message || 'An error occurred.' };
  }
}

// ─── Admin Notifications Action ───────────────────────────────────────────────

export interface AdminNotification {
  id: string;
  type: 'inquiry' | 'order' | 'quotation' | 'stock';
  title: string;
  description: string;
  timestamp: string;
  link: string;
  read: boolean;
}

export async function getAdminNotificationsAction(): Promise<{
  success: boolean;
  notifications?: AdminNotification[];
  unreadCount?: number;
  error?: string;
}> {
  try {
    const notifications: AdminNotification[] = [];

    // Helper for safe array extraction
    const toArray = (res: any): any[] => {
      if (!res) return [];
      if (Array.isArray(res)) return res;
      if (Array.isArray(res.items)) return res.items;
      return [];
    };

    // 1. Inquiries Notifications (New / Unread)
    try {
      const inquiriesRaw = await pbContactInquiries.getAll().catch(() => []);
      const inquiries = toArray(inquiriesRaw);
      inquiries
        .filter((i: any) => i.status === 'new' || !i.read)
        .slice(0, 10)
        .forEach((i: any) => {
          notifications.push({
            id: `inquiry-${i.id}`,
            type: 'inquiry',
            title: `New Inquiry from ${i.name || 'Customer'}`,
            description: i.message ? `${i.message.slice(0, 70)}${i.message.length > 70 ? '...' : ''}` : 'Customer submitted contact message',
            timestamp: i.created || new Date().toISOString(),
            link: '/admin/inquiries',
            read: Boolean(i.read),
          });
        });
    } catch {}

    // 2. Orders Notifications (New / Pending / Processing)
    try {
      const pb = await getAdminPb();
      const ordersRes = await pb.collection('orders').getList(1, 20, { sort: '-created' });
      ordersRes.items
        .filter((o: any) => o.status === 'pending' || o.status === 'processing' || !o.isPaid)
        .slice(0, 10)
        .forEach((o: any) => {
          const orderNum = o.orderId || o.id;
          const custName = o.customer?.name || o.customerName || 'Customer';
          const amt = (o.total || o.totalAmount || 0).toLocaleString();
          const pMethod = o.paymentDetails?.method ? ` (${o.paymentDetails.method})` : '';
          notifications.push({
            id: `order-${o.id}`,
            type: 'order',
            title: `New Order #${orderNum}`,
            description: `Total LKR ${amt} — ${custName}${pMethod}`,
            timestamp: o.created || new Date().toISOString(),
            link: '/admin/orders',
            read: false,
          });
        });
    } catch (orderErr) {
      console.warn('[getAdminNotificationsAction] Order notifications error:', orderErr);
    }

    // 3. Due Quotations Notifications
    try {
      const quotationsRaw = await pbQuotations.getAll().catch(() => []);
      const quotations = toArray(quotationsRaw);
      quotations
        .filter((q: any) => q.status === 'pending' || q.status === 'sent')
        .slice(0, 10)
        .forEach((q: any) => {
          notifications.push({
            id: `quotation-${q.id}`,
            type: 'quotation',
            title: `Pending Quotation Follow-up`,
            description: `Quotation for ${q.customerName || 'Customer'} (${q.items?.length || 1} items)`,
            timestamp: q.created || new Date().toISOString(),
            link: '/admin/quotations',
            read: false,
          });
        });
    } catch {}

    // 4. Low Stock Alerts
    try {
      const productsRaw = await pbProducts.getAll().catch(() => []);
      const products = toArray(productsRaw);
      products
        .filter((p: any) => p.stock !== undefined && p.stock >= 0 && p.stock <= 3)
        .slice(0, 5)
        .forEach((p: any) => {
          notifications.push({
            id: `stock-${p.id}`,
            type: 'stock',
            title: `Low Stock Warning`,
            description: `${p.name} has only ${p.stock} unit${p.stock === 1 ? '' : 's'} remaining!`,
            timestamp: p.updated || p.created || new Date().toISOString(),
            link: '/admin/inventory',
            read: false,
          });
        });
    } catch {}

    // Sort by most recent timestamp
    notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const unreadCount = notifications.filter((n) => !n.read).length;

    return {
      success: true,
      notifications: notifications.slice(0, 20),
      unreadCount,
    };
  } catch (err: any) {
    console.error('[getAdminNotificationsAction] Error:', err);
    return { success: false, error: err.message || 'Failed to fetch admin notifications' };
  }
}

/**
 * Clears all orders and sales logs, resets all stock_management units back to 'available',
 * restores product stock levels, and resets system state for a fresh start.
 */
export async function resetAllOrdersAndRestoreStockAction(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const check = await checkPermission('settings', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const adminPb = await getAdminPb();

    // 1. Delete all orders from orders collection
    let deletedOrdersCount = 0;
    try {
      const orders = await adminPb.collection('orders').getFullList();
      for (const order of orders) {
        await adminPb.collection('orders').delete(order.id);
        deletedOrdersCount++;
      }
    } catch (err) {
      console.warn('[resetAllOrdersAndRestoreStockAction] Error clearing orders:', err);
    }

    // 2. Delete outbound sales logs from stock_purchases collection (quantity < 0 or sale batch)
    let deletedSalesLogsCount = 0;
    try {
      const purchases = await adminPb.collection('stock_purchases').getFullList();
      for (const p of purchases) {
        if (p.quantity < 0 || p.batchNumber?.startsWith('SALE-') || p.batchNumber?.startsWith('POS-')) {
          await adminPb.collection('stock_purchases').delete(p.id);
          deletedSalesLogsCount++;
        }
      }
    } catch (err) {
      console.warn('[resetAllOrdersAndRestoreStockAction] Error clearing sales logs:', err);
    }

    // 3. Reset all stock_management units back to 'available' and clear orderId
    let resetUnitsCount = 0;
    try {
      const units = await adminPb.collection('stock_management').getFullList();
      for (const unit of units) {
        await adminPb.collection('stock_management').update(unit.id, {
          status: 'available',
          orderId: '',
          notes: 'Restored to available inventory upon system reset',
        });
        resetUnitsCount++;
      }
    } catch (err) {
      console.warn('[resetAllOrdersAndRestoreStockAction] Error resetting stock units:', err);
    }

    // 4. Update product countInStock based on available stock_management units or positive purchase quantities
    try {
      const products = await adminPb.collection('products').getFullList();
      for (const prod of products) {
        let availableCount = 0;
        try {
          const availUnits = await adminPb.collection('stock_management').getFullList({
            filter: `product = "${prod.id}" && status = "available"`,
          });
          availableCount = availUnits.length;
        } catch {}

        if (availableCount > 0) {
          await adminPb.collection('products').update(prod.id, { countInStock: availableCount });
        } else {
          // If no units exist in stock_management, calculate total from positive stock_purchases
          let purchaseSum = 0;
          try {
            const purchases = await adminPb.collection('stock_purchases').getFullList({
              filter: `product = "${prod.id}" && quantity > 0`,
            });
            purchaseSum = purchases.reduce((acc: number, item: any) => acc + (item.quantity || 0), 0);
          } catch {}

          const restoredStock = purchaseSum > 0 ? purchaseSum : Math.max(10, prod.countInStock || 10);
          await adminPb.collection('products').update(prod.id, { countInStock: restoredStock });
        }
      }
    } catch (err) {
      console.warn('[resetAllOrdersAndRestoreStockAction] Error restoring product stock levels:', err);
    }

    // Audit log
    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'orders',
      'ALL_ORDERS',
      {},
      { resetOrders: deletedOrdersCount, resetSales: deletedSalesLogsCount, resetUnits: resetUnitsCount },
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/admin/sales');
    revalidatePath('/admin/dashboard');
    revalidatePath('/account/orders');
    revalidatePath('/pos');
    revalidatePath('/products');

    return {
      success: true,
      message: `System reset complete! Deleted ${deletedOrdersCount} orders, reset ${resetUnitsCount} inventory serial units back to available, and restored product stock levels.`,
    };
  } catch (err: any) {
    console.error('[resetAllOrdersAndRestoreStockAction] Error:', err);
    return { success: false, error: err.message || 'Failed to reset system orders and stock.' };
  }
}

export interface ProductSaleRecord {
  id: string;
  orderNumber: string;
  channel: 'Online' | 'POS';
  customerName: string;
  customerEmail: string;
  date: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  serials: string[];
}

/**
 * Fetches itemized sales history for a specific product across Online Orders and POS transactions.
 */
export async function getProductSalesHistoryAction(productId: string): Promise<{
  success: boolean;
  sales: ProductSaleRecord[];
  error?: string;
}> {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) return { success: false, sales: [] };

  try {
    const adminPb = await getAdminPb();
    const sales: ProductSaleRecord[] = [];

    // 1. Query orders containing this product ID in items array
    try {
      const orders = await adminPb.collection('orders').getFullList({
        sort: '-created',
      });

      for (const order of orders) {
        const items = Array.isArray(order.items) ? order.items : [];
        const matchedItem = items.find(
          (i: any) => i.productId === productId || i.product === productId || i.id === productId
        );

        if (matchedItem) {
          const qty = matchedItem.quantity || matchedItem.qty || 1;
          const price = matchedItem.price || matchedItem.unit_price || 0;
          const serials = Array.isArray(matchedItem.assignedSerials)
            ? matchedItem.assignedSerials
            : Array.isArray(matchedItem.assignedUnits)
              ? matchedItem.assignedUnits.map((u: any) => u.serialNumber || u.barcode).filter(Boolean)
              : [];

          sales.push({
            id: order.id,
            orderNumber: order.orderId || order.id,
            channel: order.channel === 'pos' ? 'POS' : 'Online',
            customerName: order.customer?.name || order.customerName || order.shippingAddress?.firstName || 'Customer',
            customerEmail: order.customer?.email || order.customerEmail || order.email || '',
            date: order.created ? new Date(order.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A',
            quantity: qty,
            unitPrice: price,
            totalAmount: qty * price,
            status: order.status || 'pending',
            serials,
          });
        }
      }
    } catch (orderErr) {
      console.warn('[getProductSalesHistoryAction] Order query error:', orderErr);
    }

    // 2. Query stock_purchases for outbound sales (quantity < 0) not captured above
    try {
      const purchases = await adminPb.collection('stock_purchases').getFullList({
        filter: `product = "${productId}" && quantity < 0`,
        sort: '-created',
      });

      for (const pur of purchases) {
        const batchNum = pur.batchNumber || '';
        const orderIdFromBatch = batchNum.replace(/^(SALE|POS)-/, '');
        const exists = sales.some((s) => s.orderNumber === orderIdFromBatch || s.id === orderIdFromBatch);

        if (!exists) {
          const qty = Math.abs(pur.quantity || 0);
          const price = pur.unitCost || 0;
          sales.push({
            id: pur.id,
            orderNumber: pur.batchNumber || pur.id,
            channel: pur.batchNumber?.startsWith('POS-') ? 'POS' : 'Online',
            customerName: pur.supplier || 'Customer Sale',
            customerEmail: '',
            date: pur.purchaseDate || new Date(pur.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            quantity: qty,
            unitPrice: price,
            totalAmount: qty * price,
            status: 'completed',
            serials: [],
          });
        }
      }
    } catch (purErr) {
      console.warn('[getProductSalesHistoryAction] Purchases query error:', purErr);
    }

    sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { success: true, sales };
  } catch (err: any) {
    console.error('[getProductSalesHistoryAction] Failed:', err);
    return { success: false, sales: [] };
  }
}





