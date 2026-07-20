'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAdminPb, writeAuditLog } from '@/lib/pb-admin';
import { ROLE_PERMISSIONS } from '@/types/admin';
import type { AdminRole, AuditAction } from '@/types/admin';
import type { BarcodePrintConfig } from '@/types/barcode-config';
import type { ReceiptPrintConfig } from '@/types/receipt-config';
import type { InvoicePrintConfig } from '@/types/invoice-config';
import {
  pbProducts,
  pbCategories,
  pbBrands,
  pbReviews,
  pbHomepageBlocks,
  pbSiteSettings,
  pbPromotions,
  pbOrders,
  pbEmployees,
  pbSales,
  pbCustomers,
} from '@/lib/pb-collections';
import type { SalePayload } from '@/types/pos';

// Helper to cast fields safely for audit logging
function toRecord(obj: any): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return obj as unknown as Record<string, unknown>;
}

// ─── Permission Check Helper ────────────────────────────────────────────────

async function checkPermission(
  module: keyof typeof ROLE_PERMISSIONS[AdminRole],
  action: 'read' | 'write' | 'delete'
): Promise<{ allowed: boolean; role?: AdminRole; actorEmail?: string; ip?: string; userAgent?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('pb_auth_token')?.value;
  const role = cookieStore.get('pb_auth_role')?.value as AdminRole | undefined;
  const effectiveRole: AdminRole = role || 'super_admin';

  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  // Parse email from token
  let actorEmail = 'admin@ftc.lk';
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = atob(base64);
        const payload = JSON.parse(decoded);
        actorEmail = payload.email || payload.sub || 'admin@ftc.lk';
      }
    } catch {
      // Ignore decode error
    }
  }

  const permissions = ROLE_PERMISSIONS[effectiveRole];
  if (!permissions) {
    return { allowed: false, role: effectiveRole, actorEmail, ip, userAgent };
  }

  const modulePerms = (permissions as any)[module];
  if (!modulePerms || !modulePerms[action]) {
    return { allowed: false, role, actorEmail, ip, userAgent };
  }

  return { allowed: true, role, actorEmail, ip, userAgent };
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
    return { success: true, data: JSON.parse(JSON.stringify(records)) };
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
    return { success: true, data: JSON.parse(JSON.stringify(records)) };
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

export async function createCategoryAction(data: { name: string; slug: string; sortOrder: number }) {
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

export async function updateCategoryAction(id: string, data: Partial<{ name: string; slug: string; sortOrder: number }>) {
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
}) {
  const check = await checkPermission('promotions', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

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

  try {
    const oldRecord = await pbPromotions.getAll({ page: 1, perPage: 1 }); // not needed for details, but we can do simple update
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
    revalidatePath('/admin/settings');
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
    return { success: true, data: JSON.parse(JSON.stringify(records)) };
  } catch {
    return { success: true, data: [] };
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
    return { success: true, data: JSON.parse(JSON.stringify(record)) };
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

export async function getReceiptPrintPresetsAction() {
  const check = await checkPermission('systemConfig', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const adminPb = await getAdminPb();
    const records = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "receipt_print"',
      sort: '-isDefault',
    });
    return { success: true, data: JSON.parse(JSON.stringify(records)) };
  } catch {
    return { success: true, data: [] };
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
    return { success: true, data: JSON.parse(JSON.stringify(record)) };
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
    const records = await adminPb.collection('system_configurations').getFullList({
      filter: 'category = "invoice_print"',
      sort: '-isDefault',
    });
    return { success: true, data: JSON.parse(JSON.stringify(records)) };
  } catch {
    return { success: true, data: [] };
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
    return { success: true, data: JSON.parse(JSON.stringify(record)) };
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
  try {
    const emp = await pbEmployees.update(id, data);
    revalidatePath('/admin/system-config/employees');
    return { success: true, data: emp };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update employee.' };
  }
}

export async function deletePosEmployeeAction(id: string) {
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

export async function getRecentSalesAction(limit = 50) {
  try {
    const sales = await pbSales.getRecent(limit);
    return { success: true, data: sales };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load sales.' };
  }
}

export async function getSaleByIdAction(id: string) {
  try {
    const sale = await pbSales.getById(id);
    if (!sale) return { success: false, error: 'Sale not found.' };
    const items = await pbSales.getItemsBySale(id);
    return { success: true, data: { sale, items } };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load sale.' };
  }
}

export async function voidSaleAction(id: string) {
  try {
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
    const q = query.trim();
    const filter = q ? `name ~ "${q}" || phone ~ "${q}" || email ~ "${q}"` : '';
    const customers = await adminPb.collection('customers').getFullList({
      filter,
      sort: '-created',
      perPage: 25,
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
