'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, writeAuditLog } from '@/lib/supabase-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import { ROLE_PERMISSIONS, ADMIN_ROLES } from '@/types/admin';
import type { AdminRole, AuditAction, DealerSaleRecord, QuotationVoidReason } from '@/types/admin';
import type { BarcodePrintConfig } from '@/types/barcode-config';
import { DEFAULT_RECEIPT_CONFIG, type ReceiptPrintConfig, type ReceiptPrintPreset } from '@/types/receipt-config';
import { DEFAULT_INVOICE_CONFIG, type InvoicePrintConfig, type InvoicePrintPreset } from '@/types/invoice-config';
import { sendQuotationEmail, sendOrderInvoiceEmail, sendOrderShippingEmail, sendOrderReturnEmail, formatPaymentMethod } from '@/lib/email';
import { sendInvoiceEmailForOrder, requiresPaymentBeforeShipment, isCashPaymentMethod } from '@/lib/order-email';
import { ensureInvoiceForPaidOrder, generateSampleInvoiceData } from '@/lib/invoice-service';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
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
  pbCustomers,
  pbWholesaleDealers,
  pbQuotations,
  pbContactInquiries,
  pbEmployees,
  pbSales,
} from '@/lib/supabase-collections';
import type { PaymentMethod, PaymentTerms, PBSale, PBSaleItem, SalePayload, EmployeeRole, PosEmployeeSession, SalePayment, SalePaymentReversal, SalePaymentSummary, PaymentRecordStatus, ChequeRegisterItem, ChequeRegisterMetrics } from '@/types/pos';
import {
  hashPin,
  verifyPinWithLegacyMigration,
  checkPinRateLimit,
  recordFailedPinAttempt,
  resetPinRateLimit,
  isBcryptHash,
} from '@/lib/pin-security';
import {
  getVerifiedPosSession,
  setPosSessionCookie,
  clearPosSessionCookie,
  POS_SESSION_MAX_AGE,
} from '@/lib/pos-server-session';

// Helper to cast fields safely for audit logging
function toRecord(obj: any): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  return obj as unknown as Record<string, unknown>;
}

function getStoragePublicUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('[admin] NEXT_PUBLIC_SUPABASE_URL is not set; cannot build a storage URL.');
  }
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/public/ftc-media/${encodedPath}`;
}

// ─── Permission Check Helper ────────────────────────────────────────────────

export async function checkPermission(
  module: keyof typeof ROLE_PERMISSIONS[AdminRole],
  action: 'read' | 'write' | 'delete'
): Promise<{ allowed: boolean; role?: AdminRole; actorEmail?: string; actorId?: string; actorName?: string; ip?: string; userAgent?: string }> {
  let ip = '127.0.0.1';
  let userAgent = 'unknown';

  try {
    const headersList = await headers();
    ip = getTrustedClientIp(headersList);
    userAgent = headersList.get('user-agent') || 'unknown';
  } catch {
    // Outside request context
  }

  try {
    let user: any = null;
    try {
      const supabase = await createServerSupabase();
      const authRes = await supabase.auth.getUser();
      user = authRes.data?.user;
    } catch {
      // In isolated environments or test runners without cookie stores
    }

    if (!user) {
      return { allowed: false, ip, userAgent };
    }

    const adminSb = getAdminSupabase();
    const { data: profile } = await adminSb
      .from('profiles')
      .select('id, role, name')
      .eq('id', user.id)
      .maybeSingle();

    let role: AdminRole | undefined = undefined;
    const roleStr = profile?.role;
    if (roleStr && (ADMIN_ROLES as readonly string[]).includes(roleStr)) {
      role = roleStr as AdminRole;
    }

    const actorName = profile?.name?.trim() || '';

    if (!role) {
      return {
        allowed: false,
        actorEmail: user.email || '',
        actorId: user.id,
        actorName,
        ip,
        userAgent,
      };
    }

    const modulePerms = ROLE_PERMISSIONS[role]?.[module];
    const isAllowed = Boolean(modulePerms && (modulePerms as any)[action]);

    return {
      allowed: isAllowed,
      role,
      actorEmail: user.email || '',
      actorId: user.id,
      actorName,
      ip,
      userAgent,
    };
  } catch (err) {
    console.error('[checkPermission] Verification error:', err);
    return { allowed: false, ip, userAgent };
  }
}

// ─── Products Actions ─────────────────────────────────────────────────────────

async function buildProductPayloadFromFormData(data: FormData | Record<string, any>, existingRecord?: any) {
  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;
  const getVal = (key: string) => (isFormData ? (data as FormData).get(key) : (data as Record<string, any>)[key]);

  const name = String(getVal('name') || existingRecord?.name || '').trim();
  let rawSlug = String(getVal('slug') || existingRecord?.slug || '').trim();
  let slug = rawSlug
    ? rawSlug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '')
    : (name ? name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '') : '');

  const description = String(getVal('description') || existingRecord?.description || '');
  const price = parseFloat(String(getVal('price') || existingRecord?.price || '0')) || 0;

  const discountPriceRaw = getVal('discountPrice') ?? getVal('discount_price') ?? existingRecord?.discount_price;
  const discount_price = discountPriceRaw !== undefined && discountPriceRaw !== null && String(discountPriceRaw).trim() !== ''
    ? parseFloat(String(discountPriceRaw))
    : null;

  const wholesalePriceRaw = getVal('wholesalePrice') ?? getVal('wholesale_price') ?? existingRecord?.wholesale_price;
  const wholesale_price = wholesalePriceRaw !== undefined && wholesalePriceRaw !== null && String(wholesalePriceRaw).trim() !== ''
    ? parseFloat(String(wholesalePriceRaw))
    : null;

  let category_id = getVal('category') || getVal('category_id') || existingRecord?.category_id;
  if (category_id && typeof category_id === 'string') category_id = category_id.trim();
  if (!category_id) {
    category_id = null;
  }

  let brand_id = getVal('brand') || getVal('brand_id') || existingRecord?.brand_id;
  if (brand_id && typeof brand_id === 'string') brand_id = brand_id.trim();
  if (!brand_id) {
    brand_id = null;
  }

  const countInStockRaw = getVal('countInStock') ?? getVal('count_in_stock') ?? existingRecord?.count_in_stock;
  const count_in_stock = parseInt(String(countInStockRaw || '0'), 10) || 0;

  const rawTracking = getVal('inventoryTrackingType') ?? getVal('inventory_tracking_type') ?? existingRecord?.inventory_tracking_type;
  let inventory_tracking_type: 'counter' | 'unit' = 'counter';
  if (rawTracking !== undefined && rawTracking !== null && String(rawTracking).trim() !== '') {
    const norm = String(rawTracking).trim().toLowerCase();
    if (norm === 'unit' || norm === 'counter') {
      inventory_tracking_type = norm;
    } else {
      throw new Error(`Invalid inventory tracking type "${rawTracking}". Must be "counter" or "unit".`);
    }
  } else if (existingRecord?.inventory_tracking_type) {
    inventory_tracking_type = existingRecord.inventory_tracking_type;
  }

  const status = String(getVal('status') || existingRecord?.status || 'published');
  const is_featured = String(getVal('isFeatured') ?? getVal('is_featured') ?? existingRecord?.is_featured) === 'true';
  const is_pre_order = String(getVal('isPreOrder') ?? getVal('is_pre_order') ?? existingRecord?.is_pre_order) === 'true';
  const currency = String(getVal('currency') || existingRecord?.currency || 'USD');

  let badges: string[] = existingRecord?.badges || [];
  const badgesRaw = getVal('badges');
  if (badgesRaw) {
    if (typeof badgesRaw === 'string') {
      try { badges = JSON.parse(badgesRaw); } catch { badges = badgesRaw.split(',').map(b => b.trim()).filter(Boolean); }
    } else if (Array.isArray(badgesRaw)) {
      badges = badgesRaw;
    }
  }

  let specs: Record<string, any> = existingRecord?.specs || {};
  const specsRaw = getVal('specs');
  if (specsRaw) {
    if (typeof specsRaw === 'string') {
      try { specs = JSON.parse(specsRaw); } catch { specs = {}; }
    } else if (typeof specsRaw === 'object') {
      specs = specsRaw;
    }
  }

  const bannerText = getVal('bannerText') ?? getVal('banner_text') ?? existingRecord?.banner_text;
  const banner_text = bannerText ? String(bannerText) : null;

  const isFileLike = (obj: any): boolean => Boolean(obj && typeof obj === 'object' && typeof obj.arrayBuffer === 'function' && Number(obj.size || 0) > 0);

  let banner_image: string | null = existingRecord?.banner_image || null;
  const bannerImgRaw = getVal('bannerImage') ?? getVal('banner_image');
  if (bannerImgRaw) {
    if (isFileLike(bannerImgRaw)) {
      const supabase = getAdminSupabase();
      const fileName = (bannerImgRaw as any).name || 'banner.png';
      const ext = fileName.split('.').pop() || 'png';
      const fName = `banner_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const buf = Buffer.from(await (bannerImgRaw as any).arrayBuffer());
      const { error } = await supabase.storage.from('ftc-media').upload(fName, buf, { contentType: (bannerImgRaw as any).type || 'image/png', upsert: true });
      if (!error) banner_image = fName;
    } else if (typeof bannerImgRaw === 'string' && bannerImgRaw.trim()) {
      banner_image = bannerImgRaw.trim();
    }
  }

  let imagesList: string[] = [];
  if (isFormData) {
    const formData = data as FormData;
    const files = formData.getAll('images');
    const newImgs: string[] = [];
    for (const f of files) {
      if (isFileLike(f)) {
        const supabase = getAdminSupabase();
        const fileName = (f as any).name || 'image.png';
        const ext = fileName.split('.').pop() || 'png';
        const fName = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const buf = Buffer.from(await (f as any).arrayBuffer());
        const { error } = await supabase.storage.from('ftc-media').upload(fName, buf, { contentType: (f as any).type || 'image/png', upsert: true });
        if (!error) {
          const fullPublicUrl = getStoragePublicUrl(fName);
          if (fullPublicUrl) newImgs.push(fullPublicUrl);
        } else {
          console.error('Failed to upload product image to Supabase ftc-media:', error);
        }
      } else if (typeof f === 'string' && f.startsWith('data:')) {
        const supabase = getAdminSupabase();
        const arr = f.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const ext = mime.split('/')[1] || 'png';
        const buf = Buffer.from(arr[1], 'base64');
        const fName = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage.from('ftc-media').upload(fName, buf, { contentType: mime, upsert: true });
        if (!error) {
          const fullPublicUrl = getStoragePublicUrl(fName);
          if (fullPublicUrl) newImgs.push(fullPublicUrl);
        } else {
          console.error('Failed to upload base64 image to Supabase ftc-media:', error);
        }
      } else if (typeof f === 'string' && f.trim()) {
        newImgs.push(f.trim());
      }
    }
    if (newImgs.length > 0) {
      imagesList = newImgs;
    } else if (existingRecord?.images && existingRecord.images.length > 0) {
      imagesList = existingRecord.images;
    }
  } else if (Array.isArray((data as any).images)) {
    imagesList = (data as any).images;
  } else if (existingRecord?.images) {
    imagesList = existingRecord.images;
  }

  if (wholesale_price !== null) {
    specs.wholesale_price = wholesale_price;
  }



  return {
    name,
    slug,
    description,
    price,
    discount_price,
    category_id,
    brand_id,
    count_in_stock,
    inventory_tracking_type,
    status,
    is_featured,
    is_pre_order,
    currency,
    badges,
    specs,
    banner_text,
    banner_image,
    images: imagesList,
    updated_at: new Date().toISOString(),
  };
}

export async function createProductAction(formData: FormData) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const payload = await buildProductPayloadFromFormData(formData);
    if (payload.inventory_tracking_type === 'unit' && payload.count_in_stock > 0) {
      return {
        success: false,
        error: 'New Individually Tracked Unit products must be created with 0 stock count. Generate physical stock batches to add inventory.',
      };
    }
    (payload as any).created_at = new Date().toISOString();

    const supabase = getAdminSupabase();
    const { data: record, error } = await supabase.from('products').insert(payload).select().single();
    if (error) throw error;

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'products',
      record.id,
      undefined,
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    return { success: true, data: record };
  } catch (err: any) {
    console.error('[createProductAction] Error:', err);
    return { success: false, error: err.message || 'Failed to create product.' };
  }
}

export async function updateProductAction(id: string, formData: FormData) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: oldRecord } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
    if (!oldRecord) return { success: false, error: 'Product not found.' };

    const payload = await buildProductPayloadFromFormData(formData, oldRecord);

    type ProductUpdatePayload = Omit<Awaited<ReturnType<typeof buildProductPayloadFromFormData>>, 'count_in_stock'> & {
      count_in_stock?: number;
    };

    let updatePayload: ProductUpdatePayload = payload;

    // Finding 9 & CodeRabbit Fix: For UNIT-tracked products that are NOT transitioning to counter,
    // count_in_stock is authoritative from stock_management and must not be
    // overwritten by a client-submitted form value.
    const staysUnit =
      oldRecord.inventory_tracking_type === 'unit' &&
      payload.inventory_tracking_type === 'unit';
    if (staysUnit) {
      const { count_in_stock: _ignoredCount, ...rest } = payload;
      updatePayload = rest;
    }

    // Safeguards for inventory tracking transitions
    if (oldRecord.inventory_tracking_type === 'counter' && payload.inventory_tracking_type === 'unit') {
      const { count: availUnits, error: availUnitsError } = await supabase
        .from('stock_management')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', id)
        .eq('status', 'available');

      if (availUnitsError) {
        console.error(
          'Failed to verify physical inventory before tracking conversion:',
          availUnitsError
        );
        return {
          success: false,
          error:
            'Unable to verify physical inventory. Product tracking type was not changed. Please try again.',
        };
      }

      const existingCounterStock = oldRecord.count_in_stock ?? 0;
      const physicalAvailableCount = availUnits ?? 0;

      if (existingCounterStock > 0 && physicalAvailableCount !== existingCounterStock) {
        return {
          success: false,
          error: `Cannot convert product to Individually Tracked Units: current stock count (${existingCounterStock}) does not match available physical unit records (${physicalAvailableCount}). Please generate or reconcile physical stock units before activating unit tracking.`,
        };
      }

      // Ensure resulting count_in_stock in products remains reconciled with available physical units
      updatePayload = {
        ...updatePayload,
        count_in_stock: physicalAvailableCount,
      };
    } else if (oldRecord.inventory_tracking_type === 'unit' && payload.inventory_tracking_type === 'counter') {
      const { count: totalUnits, error: totalUnitsError } = await supabase
        .from('stock_management')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', id);

      if (totalUnitsError) {
        console.error(
          'Failed to verify physical inventory history before tracking conversion:',
          totalUnitsError
        );
        return {
          success: false,
          error:
            'Unable to verify physical inventory. Product tracking type was not changed. Please try again.',
        };
      }

      if ((totalUnits ?? 0) > 0) {
        return {
          success: false,
          error: `Cannot convert product to Counter Stock: product has existing physical unit records (${totalUnits} units recorded). Preserving individually tracked unit history is required.`,
        };
      }
    }

    const { data: record, error } = await supabase
      .from('products')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'products',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    return { success: true, data: record };
  } catch (err: any) {
    console.error('[updateProductAction] Error:', err);
    return { success: false, error: err.message || 'Failed to update product.' };
  }
}

export async function updateProductStockAction(id: string, countInStock: number) {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: oldRecord } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
    if (!oldRecord) return { success: false, error: 'Product not found.' };

    if (oldRecord.inventory_tracking_type === 'unit') {
      const { count: availUnits } = await supabase
        .from('stock_management')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', id)
        .eq('status', 'available');

      if ((availUnits ?? 0) !== countInStock) {
        return {
          success: false,
          error: `Cannot manually override stock count for Individually Tracked Unit product. Stock count is strictly determined by available physical units (${availUnits ?? 0} available).`,
        };
      }
    }

    const { data: record, error } = await supabase
      .from('products')
      .update({ count_in_stock: countInStock, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'products',
      id,
      toRecord(oldRecord),
      toRecord(record),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    return { success: true, data: record };
  } catch (err: any) {
    console.error('[updateProductStockAction] Error:', err);
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
    const supabase = getAdminSupabase();
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, slug, count_in_stock, price, discount_price, inventory_tracking_type')
      .eq('id', data.productId)
      .single();
    if (prodErr || !product) return { success: false, error: 'Product not found.' };

    if (product.inventory_tracking_type !== 'unit') {
      return {
        success: false,
        error: 'Cannot add physical unit stock batches: product is configured for Counter Stock tracking. Update inventory tracking to Individually Tracked Units before creating stock units.',
      };
    }

    const initialStock = product.count_in_stock || 0;
    const initialPrice = product.price;
    const initialDiscountPrice = product.discount_price;

    const { data: purchaseRecord, error: purchErr } = await supabase
      .from('stock_purchases')
      .insert({
        product_id: data.productId,
        batch_number: data.batchNumber,
        quantity: data.quantity,
        unit_cost: data.unitCost || 0,
        supplier: data.supplier || '',
        purchase_date: data.purchaseDate || new Date().toISOString().split('T')[0],
        notes: data.notes || '',
      })
      .select()
      .single();
    if (purchErr) throw purchErr;

    const createdUnitIds: string[] = [];

    try {
      const newStockCount = Math.max(0, initialStock + Number(data.quantity));

      const priceUpdate: Record<string, number | null> = { count_in_stock: newStockCount };
      if (data.newCost && data.newCost > 0 && data.oldPrice !== undefined) {
        if (data.newCost > data.oldPrice) {
          priceUpdate.price = data.newCost;
          priceUpdate.discount_price = null;
        } else if (data.newCost < data.oldPrice) {
          priceUpdate.discount_price = data.newCost;
        }
      }
      const { error: priceUpdateErr } = await supabase.from('products').update(priceUpdate).eq('id', data.productId);
      if (priceUpdateErr) throw priceUpdateErr;

      if (data.quantity > 0) {
        const units = Array.from({ length: data.quantity }, (_, i) => ({
          product_id: data.productId,
          barcode: `STK-${data.productId.slice(-5).toUpperCase()}-${Date.now().toString().slice(-5)}-${i + 1}`,
          serial_number: `SN-${data.productId.slice(-4).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`,
          status: 'available',
          batch_number: data.batchNumber,
        }));
        for (let i = 0; i < units.length; i += 50) {
          const batch = units.slice(i, i + 50);
          const { data: insertedUnits, error: insertErr } = await supabase
            .from('stock_management')
            .insert(batch)
            .select('id');

          if (insertErr) {
            throw new Error(`Failed to create inventory stock units: ${insertErr.message}`);
          }
          if (insertedUnits) {
            for (const u of insertedUnits) createdUnitIds.push(u.id);
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

      revalidatePath('/', 'layout');
      return { success: true, data: purchaseRecord, newStockCount };
    } catch (stepErr: any) {
      // Roll back all created units and purchase record, and restore original product prices and stock
      if (createdUnitIds.length > 0) {
        await supabase.from('stock_management').delete().in('id', createdUnitIds);
      }
      await supabase.from('stock_purchases').delete().eq('id', purchaseRecord.id);
      await supabase.from('products').update({
        count_in_stock: initialStock,
        price: initialPrice,
        discount_price: initialDiscountPrice,
      }).eq('id', data.productId);

      throw stepErr;
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record stock purchase.' };
  }
}

export async function getStockPurchasesAction(productId: string) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('stock_purchases')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch stock purchases.', data: [] };
  }
}

export async function getStockManagementUnitsAction(productId: string) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('stock_management')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { success: true, data: data || [] };
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
    const supabase = getAdminSupabase();
    const { data: prod, error: pErr } = await supabase
      .from('products')
      .select('id, inventory_tracking_type')
      .eq('id', data.productId)
      .single();
    if (pErr || !prod) return { success: false, error: 'Product not found.' };

    if (prod.inventory_tracking_type !== 'unit') {
      return {
        success: false,
        error: 'Cannot create physical stock unit: product is configured for Counter Stock tracking. Update inventory tracking to Individually Tracked Units before creating stock units.',
      };
    }

    const barcode = data.barcode || `STK-${data.productId.slice(-6).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data: unit, error } = await supabase
      .from('stock_management')
      .insert({
        product_id: data.productId,
        barcode,
        serial_number: data.serialNumber || '',
        status: 'available',
        batch_number: data.batchNumber || '',
        notes: data.notes || '',
      })
      .select()
      .single();
    if (error) throw error;

    // Synchronize count_in_stock for unit product
    const { count: availUnits } = await supabase
      .from('stock_management')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', data.productId)
      .eq('status', 'available');

    if (typeof availUnits === 'number') {
      await supabase.from('products').update({ count_in_stock: availUnits }).eq('id', data.productId);
    }

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
    const supabase = getAdminSupabase();
    const { data: prod, error: pErr } = await supabase
      .from('products')
      .select('id, inventory_tracking_type')
      .eq('id', productId)
      .single();
    if (pErr || !prod) return { success: false, error: 'Product not found.' };

    if (prod.inventory_tracking_type !== 'unit') {
      return {
        success: false,
        error: 'Cannot generate physical stock units: product is configured for Counter Stock tracking. Update inventory tracking to Individually Tracked Units before creating stock units.',
      };
    }

    const batch = batchNumber || `PO-${Date.now().toString().slice(-6)}`;

    const units = Array.from({ length: quantity }, (_, i) => ({
      product_id: productId,
      barcode: `STK-${productId.slice(-5).toUpperCase()}-${Date.now().toString().slice(-5)}-${i + 1}`,
      serial_number: `SN-${productId.slice(-4).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'available',
      batch_number: batch,
    }));

    let inserted = 0;
    for (let i = 0; i < units.length; i += 50) {
      const { data, error } = await supabase.from('stock_management').insert(units.slice(i, i + 50)).select();
      if (error) throw error;
      inserted += data?.length || 0;
    }

    // Synchronize count_in_stock for unit product
    const { count: availUnits } = await supabase
      .from('stock_management')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('status', 'available');

    if (typeof availUnits === 'number') {
      await supabase.from('products').update({ count_in_stock: availUnits }).eq('id', productId);
    }

    revalidatePath(`/admin/inventory/${productId}`);
    revalidatePath('/admin/inventory');
    return { success: true, count: inserted };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate batch barcodes.' };
  }
}

export async function updateStockUnitStatusAction(id: string, productId: string, status: 'available' | 'reserved' | 'sold' | 'defective' | 'returned') {
  const check = await checkPermission('products', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: unit, error } = await supabase
      .from('stock_management')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // Synchronize count_in_stock for unit product
    const { count: availUnits } = await supabase
      .from('stock_management')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('status', 'available');

    if (typeof availUnits === 'number') {
      await supabase.from('products').update({ count_in_stock: availUnits }).eq('id', productId);
    }

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
    const supabase = getAdminSupabase();
    const { data: oldRecord } = await supabase.from('products').select('*').eq('id', id).maybeSingle();

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;

    await writeAuditLog(
      check.actorEmail!,
      'delete',
      'products',
      id,
      toRecord(oldRecord),
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (err: any) {
    console.error('[deleteProductAction] Error:', err);
    return { success: false, error: err.message || 'Failed to delete product.' };
  }
}

// ─── Categories Actions ───────────────────────────────────────────────────────

export async function createCategoryAction(data: { name: string; slug: string; sortOrder: number; isActive?: boolean }) {
  const check = await checkPermission('categories', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: record, error } = await supabase
      .from('categories')
      .insert({
        name: data.name,
        slug: data.slug,
        sort_order: data.sortOrder,
        is_active: data.isActive ?? true,
      })
      .select()
      .single();
    if (error) throw error;

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
    const supabase = getAdminSupabase();

    // Fetch old record for audit
    const { data: oldRecord } = await supabase.from('categories').select('*').eq('id', id).single();

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    if (data.isActive !== undefined) patch.is_active = data.isActive;

    const { data: record, error } = await supabase
      .from('categories')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

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
    const supabase = getAdminSupabase();

    const { data: oldRecord } = await supabase.from('categories').select('*').eq('id', id).single();
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;

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
    const supabase = getAdminSupabase();
    for (const item of items) {
      const { error } = await supabase
        .from('categories')
        .update({ sort_order: item.sortOrder })
        .eq('id', item.id);
      if (error) throw error;
    }

    revalidatePath('/');
    revalidatePath('/admin/categories');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update categories sort order.' };
  }
}

// ─── Brands Actions ──────────────────────────────────────────────────────────

export async function uploadBrandLogoAction(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  const check = await checkPermission('brands', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    const file = formData.get('file') as File | null;
    if (!file || !file.size) return { success: false, error: 'No file provided.' };

    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const fName = `brands/logo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from('ftc-media')
      .upload(fName, buf, { contentType: file.type || 'image/png', upsert: true });
    if (error) throw error;

    const publicUrl = getStoragePublicUrl(fName);
    return { success: true, url: publicUrl };
  } catch (err: any) {
    return { success: false, error: err.message || 'Upload failed.' };
  }
}

export async function createBrandAction(formData: FormData) {
  const check = await checkPermission('brands', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const name = String(formData.get('name') || '');
    const slug = String(formData.get('slug') || '');
    const sort_order = parseInt(String(formData.get('sortOrder') || '1')) || 1;
    const show_in_strip = formData.get('show_in_strip') === 'true';
    const logo = formData.get('logoUrl') ? String(formData.get('logoUrl')) : null;

    const { data: record, error } = await supabase
      .from('brands')
      .insert({ name, slug, sort_order, show_in_strip, logo })
      .select()
      .single();
    if (error) throw error;

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
    const supabase = getAdminSupabase();
    const { data: oldRecord } = await supabase.from('brands').select('*').eq('id', id).single();

    const patch: Record<string, unknown> = {};
    const name = formData.get('name');
    const slug = formData.get('slug');
    const sortOrder = formData.get('sortOrder');
    const show_in_strip = formData.get('show_in_strip');
    const logoUrl = formData.get('logoUrl');

    if (name) patch.name = String(name);
    if (slug) patch.slug = String(slug);
    if (sortOrder) patch.sort_order = parseInt(String(sortOrder)) || 1;
    if (show_in_strip !== null) patch.show_in_strip = show_in_strip === 'true';
    if (logoUrl !== null && logoUrl !== undefined) patch.logo = String(logoUrl) || null;

    const { data: record, error } = await supabase
      .from('brands')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

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
    const supabase = getAdminSupabase();
    const { data: oldRecord } = await supabase.from('brands').select('*').eq('id', id).single();
    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (error) throw error;

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

export async function getAdminReviewsAction() {
  const check = await checkPermission('reviews', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const res = await pbReviews.getAll();
    return { success: true, data: JSON.parse(JSON.stringify(res)) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch reviews.', data: [] };
  }
}

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

export async function getAdminPromotionsAction() {
  const check = await checkPermission('promotions', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const res = await pbPromotions.getAll();
    return { success: true, data: JSON.parse(JSON.stringify(res)) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch promotions.', data: [] };
  }
}

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
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 15; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function getAnnouncementsAction() {
  const check = await checkPermission('settings', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', items: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const items = (data || []).map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      link: row.link,
      isActive: row.is_active,
      endsAt: row.ends_at,
      description: row.description,
      created: row.created_at,
      updated: row.updated_at,
    }));

    return { success: true, items };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to fetch announcements.', items: [] };
  }
}

export async function createAnnouncementAction(formData: FormData) {
  const check = await checkPermission('settings', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const title = String(formData.get('title') || '');
    const description = String(formData.get('description') || '');
    const link = formData.get('link') ? String(formData.get('link')) : null;
    const isActive = formData.get('isActive') !== 'false';
    const endsAtVal = formData.get('endsAt')?.toString();

    let ends_at = null;
    if (endsAtVal) {
      const endOfDay = new Date(endsAtVal);
      if (!isNaN(endOfDay.getTime())) {
        endOfDay.setHours(23, 59, 59, 999);
        ends_at = endOfDay.toISOString();
      }
    }

    let image = null;
    const imageFile = formData.get('image') as File | null;
    if (imageFile && imageFile.size > 0) {
      const ext = (imageFile.name.split('.').pop() || 'png').toLowerCase();
      const fName = `announcements/img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const buf = Buffer.from(await imageFile.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from('ftc-media')
        .upload(fName, buf, { contentType: imageFile.type || 'image/png', upsert: true });
      if (uploadErr) throw uploadErr;

      image = getStoragePublicUrl(fName);
    }

    const { data: record, error: insertErr } = await supabase
      .from('announcements')
      .insert({
        title,
        description,
        link,
        is_active: isActive,
        ends_at,
        image,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const mappedRecord = {
      id: record.id,
      title: record.title,
      image: record.image,
      link: record.link,
      isActive: record.is_active,
      endsAt: record.ends_at,
      description: record.description,
      created: record.created_at,
      updated: record.updated_at,
    };

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'announcements',
      record.id,
      undefined,
      toRecord(mappedRecord),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/', 'layout');
    return { success: true, data: mappedRecord };
  } catch (err: any) {
    console.error('[createAnnouncementAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to create announcement.' };
  }
}

export async function updateAnnouncementAction(id: string, formData: FormData) {
  const check = await checkPermission('settings', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: oldRecord, error: getErr } = await supabase
      .from('announcements')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (getErr || !oldRecord) throw new Error('Announcement not found.');

    const isRemoveImage = formData.get('removeImage') === 'true';
    const title = formData.get('title');
    const description = formData.get('description');
    const link = formData.get('link');
    const isActive = formData.get('isActive');
    const endsAtVal = formData.get('endsAt')?.toString();

    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== null) patch.title = String(title);
    if (description !== null) patch.description = String(description);
    if (link !== null) patch.link = String(link) || null;
    if (isActive !== null) patch.is_active = isActive === 'true';

    if (endsAtVal !== undefined) {
      if (endsAtVal) {
        const endOfDay = new Date(endsAtVal);
        if (!isNaN(endOfDay.getTime())) {
          endOfDay.setHours(23, 59, 59, 999);
          patch.ends_at = endOfDay.toISOString();
        } else {
          patch.ends_at = null;
        }
      } else {
        patch.ends_at = null;
      }
    }

    if (isRemoveImage) {
      patch.image = null;
    } else {
      const imageFile = formData.get('image') as File | null;
      if (imageFile && imageFile.size > 0) {
        const ext = (imageFile.name.split('.').pop() || 'png').toLowerCase();
        const fName = `announcements/img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const buf = Buffer.from(await imageFile.arrayBuffer());

        const { error: uploadErr } = await supabase.storage
          .from('ftc-media')
          .upload(fName, buf, { contentType: imageFile.type || 'image/png', upsert: true });
        if (uploadErr) throw uploadErr;

        patch.image = getStoragePublicUrl(fName);
      }
    }

    const { data: record, error: updateErr } = await supabase
      .from('announcements')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    const mappedRecord = {
      id: record.id,
      title: record.title,
      image: record.image,
      link: record.link,
      isActive: record.is_active,
      endsAt: record.ends_at,
      description: record.description,
      created: record.created_at,
      updated: record.updated_at,
    };

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'announcements',
      id,
      toRecord(oldRecord),
      toRecord(mappedRecord),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/', 'layout');
    return { success: true, data: mappedRecord };
  } catch (err: any) {
    console.error('[updateAnnouncementAction] Error:', err);
    return { success: false, error: err.message || 'Failed to update announcement.' };
  }
}

export async function deleteAnnouncementAction(id: string) {
  const check = await checkPermission('settings', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw error;

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
    const supabase = getAdminSupabase();
    const { data: record, error } = await supabase
      .from('announcements')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    const mappedRecord = {
      id: record.id,
      title: record.title,
      image: record.image,
      link: record.link,
      isActive: record.is_active,
      endsAt: record.ends_at,
      description: record.description,
      created: record.created_at,
      updated: record.updated_at,
    };

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'announcements',
      id,
      undefined,
      toRecord(mappedRecord),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/announcements');
    revalidatePath('/', 'layout');
    return { success: true, data: mappedRecord };
  } catch (err: any) {
    console.error('[admin.ts] Error in toggleAnnouncementStatusAction:', err);
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

export async function getHomepageBlocksAction() {
  const check = await checkPermission('homepage', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const res = await pbHomepageBlocks.getAll();
    return { success: true, data: JSON.parse(JSON.stringify(res)) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch homepage blocks.', data: [] };
  }
}

export async function getHeroBannersAction() {
  const check = await checkPermission('homepage', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('hero_banners')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;

    const normalized = (data || []).map((row) => ({
      id: row.id,
      eyebrow: row.eyebrow,
      titlePrefix: row.title_prefix,
      titleHighlight: row.title_highlight,
      description: row.description,
      ctaText: row.cta_text,
      ctaSecondary: row.cta_secondary,
      link: row.link,
      secondaryLink: row.secondary_link,
      accentColor: row.accent_color,
      imageSrc: row.image_src,
      imageAlt: row.image_alt,
      sortOrder: row.sort_order || 0,
      isEnabled: row.is_enabled ?? true,
      image: row.image || undefined,
      created: row.created_at,
      updated: row.updated_at,
    }));

    return { success: true, data: normalized };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch hero banners.', data: [] };
  }
}

export async function updateHomepageBlocksAction(blocks: { id: string; isEnabled: boolean; sortOrder: number }[]) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();

    for (const block of blocks) {
      const { error } = await supabase
        .from('homepage_blocks')
        .update({
          is_enabled: block.isEnabled,
          sort_order: block.sortOrder,
          updated_at: new Date().toISOString(),
        })
        .eq('id', block.id);
      if (error) throw error;
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
    const supabase = getAdminSupabase();
    const { data: record, error } = await supabase
      .from('homepage_blocks')
      .update({ config, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    const normalized = {
      id: record.id,
      type: record.type,
      title: record.title,
      config: record.config,
      sortOrder: record.sort_order,
      isEnabled: record.is_enabled,
      scheduledStart: record.scheduled_start,
      scheduledEnd: record.scheduled_end,
      deviceVisibility: record.device_visibility,
      created: record.created_at,
      updated: record.updated_at,
    };

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'homepage_blocks',
      id,
      undefined,
      toRecord(normalized),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/homepage');
    return { success: true, data: normalized };
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
    const supabase = getAdminSupabase();
    const { data: record, error } = await supabase
      .from('homepage_blocks')
      .insert({
        type: data.type,
        title: data.title,
        is_enabled: data.isEnabled !== false,
        sort_order: data.sortOrder || 0,
        config: data.config || {},
        device_visibility: data.deviceVisibility || 'all',
        scheduled_start: data.scheduledStart || null,
        scheduled_end: data.scheduledEnd || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    const normalized = {
      id: record.id,
      type: record.type,
      title: record.title,
      config: record.config,
      sortOrder: record.sort_order,
      isEnabled: record.is_enabled,
      scheduledStart: record.scheduled_start,
      scheduledEnd: record.scheduled_end,
      deviceVisibility: record.device_visibility,
      created: record.created_at,
      updated: record.updated_at,
    };

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'homepage_blocks',
      record.id,
      undefined,
      toRecord(normalized),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/');
    revalidatePath('/admin/homepage');
    return { success: true, data: normalized };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create homepage block.' };
  }
}

export async function deleteHomepageBlockAction(id: string) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('homepage_blocks').delete().eq('id', id);
    if (error) throw error;

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
    const supabase = getAdminSupabase();
    const eyebrow = String(formData.get('eyebrow') || '');
    const titlePrefix = String(formData.get('titlePrefix') || '');
    const titleHighlight = String(formData.get('titleHighlight') || '');
    const description = String(formData.get('description') || '');
    const ctaText = String(formData.get('ctaText') || '');
    const ctaSecondary = formData.get('ctaSecondary') ? String(formData.get('ctaSecondary')) : null;
    const link = String(formData.get('link') || '');
    const secondaryLink = formData.get('secondaryLink') ? String(formData.get('secondaryLink')) : null;
    const accentColor = String(formData.get('accentColor') || '#000000');
    const imageAlt = formData.get('imageAlt') ? String(formData.get('imageAlt')) : null;
    const isEnabled = formData.get('isEnabled') !== 'false';
    const sortOrder = parseInt(String(formData.get('sortOrder') || '0')) || 0;

    let image = null;
    const imageFile = formData.get('image') as File | null;
    if (imageFile && imageFile.size > 0) {
      const ext = (imageFile.name.split('.').pop() || 'png').toLowerCase();
      const fName = `hero_banners/slide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const buf = Buffer.from(await imageFile.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from('ftc-media')
        .upload(fName, buf, { contentType: imageFile.type || 'image/png', upsert: true });
      if (uploadErr) throw uploadErr;

      image = getStoragePublicUrl(fName);
    }

    const { data: record, error: insertErr } = await supabase
      .from('hero_banners')
      .insert({
        eyebrow,
        title_prefix: titlePrefix,
        title_highlight: titleHighlight,
        description,
        cta_text: ctaText,
        cta_secondary: ctaSecondary,
        link,
        secondary_link: secondaryLink,
        accent_color: accentColor,
        image_alt: imageAlt,
        is_enabled: isEnabled,
        sort_order: sortOrder,
        image,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const normalized = {
      id: record.id,
      eyebrow: record.eyebrow,
      titlePrefix: record.title_prefix,
      titleHighlight: record.title_highlight,
      description: record.description,
      ctaText: record.cta_text,
      ctaSecondary: record.cta_secondary,
      link: record.link,
      secondaryLink: record.secondary_link,
      accentColor: record.accent_color,
      imageSrc: record.image_src,
      imageAlt: record.image_alt,
      sortOrder: record.sort_order,
      isEnabled: record.is_enabled,
      image: record.image,
      created: record.created_at,
      updated: record.updated_at,
    };

    await writeAuditLog(
      check.actorEmail!,
      'create',
      'hero_banners',
      record.id,
      undefined,
      toRecord(normalized),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
    revalidatePath('/admin/homepage');
    return { success: true, data: normalized };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create hero banner.' };
  }
}

export async function updateHeroBannerAction(id: string, formData: FormData) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: oldRecord, error: getErr } = await supabase
      .from('hero_banners')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (getErr || !oldRecord) throw new Error('Hero banner not found.');

    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    const eyebrow = formData.get('eyebrow');
    const titlePrefix = formData.get('titlePrefix');
    const titleHighlight = formData.get('titleHighlight');
    const description = formData.get('description');
    const ctaText = formData.get('ctaText');
    const ctaSecondary = formData.get('ctaSecondary');
    const link = formData.get('link');
    const secondaryLink = formData.get('secondaryLink');
    const accentColor = formData.get('accentColor');
    const imageAlt = formData.get('imageAlt');
    const isEnabled = formData.get('isEnabled');
    const sortOrder = formData.get('sortOrder');

    if (eyebrow !== null) patch.eyebrow = String(eyebrow);
    if (titlePrefix !== null) patch.title_prefix = String(titlePrefix);
    if (titleHighlight !== null) patch.title_highlight = String(titleHighlight);
    if (description !== null) patch.description = String(description);
    if (ctaText !== null) patch.cta_text = String(ctaText);
    if (ctaSecondary !== null) patch.cta_secondary = String(ctaSecondary) || null;
    if (link !== null) patch.link = String(link);
    if (secondaryLink !== null) patch.secondary_link = String(secondaryLink) || null;
    if (accentColor !== null) patch.accent_color = String(accentColor);
    if (imageAlt !== null) patch.image_alt = String(imageAlt) || null;
    if (isEnabled !== null) patch.is_enabled = isEnabled === 'true';
    if (sortOrder !== null) patch.sort_order = parseInt(String(sortOrder)) || 0;

    const imageFile = formData.get('image') as File | null;
    if (imageFile && imageFile.size > 0) {
      const ext = (imageFile.name.split('.').pop() || 'png').toLowerCase();
      const fName = `hero_banners/slide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const buf = Buffer.from(await imageFile.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from('ftc-media')
        .upload(fName, buf, { contentType: imageFile.type || 'image/png', upsert: true });
      if (uploadErr) throw uploadErr;

      patch.image = getStoragePublicUrl(fName);
    }

    const { data: record, error: updateErr } = await supabase
      .from('hero_banners')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    const normalized = {
      id: record.id,
      eyebrow: record.eyebrow,
      titlePrefix: record.title_prefix,
      titleHighlight: record.title_highlight,
      description: record.description,
      ctaText: record.cta_text,
      ctaSecondary: record.cta_secondary,
      link: record.link,
      secondaryLink: record.secondary_link,
      accentColor: record.accent_color,
      imageSrc: record.image_src,
      imageAlt: record.image_alt,
      sortOrder: record.sort_order,
      isEnabled: record.is_enabled,
      image: record.image,
      created: record.created_at,
      updated: record.updated_at,
    };

    await writeAuditLog(
      check.actorEmail!,
      'update',
      'hero_banners',
      id,
      toRecord(oldRecord),
      toRecord(normalized),
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/', 'layout');
    revalidatePath('/', 'page');
    revalidatePath('/admin/homepage');
    return { success: true, data: normalized };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update hero banner.' };
  }
}

export async function deleteHeroBannerAction(id: string) {
  const check = await checkPermission('homepage', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('hero_banners').delete().eq('id', id);
    if (error) throw error;

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
    const supabase = getAdminSupabase();
    for (const item of items) {
      const { error } = await supabase
        .from('hero_banners')
        .update({ sort_order: item.sortOrder, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
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
    const supabase = getAdminSupabase();
    const file = formData.get('file');
    const filename = (formData.get('filename') as string) || (file instanceof File ? file.name : 'asset');
    const sizeBytes = Number(formData.get('sizeBytes')) || (file instanceof File ? file.size : 0);
    const mimeType = (formData.get('mimeType') as string) || (file instanceof File ? file.type : 'application/octet-stream');
    const tags = formData.getAll('tags').filter((t): t is string => typeof t === 'string' && t.length > 0);

    let fileUrl = '';
    if (file instanceof File) {
      const ext = filename.split('.').pop() || 'bin';
      const filePath = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { data: storageData, error: uploadErr } = await supabase.storage
        .from('media')
        .upload(filePath, file, { contentType: mimeType, upsert: false });
      if (!uploadErr && storageData) {
        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(filePath);
        fileUrl = publicUrlData.publicUrl;
      }
    }

    const payload = {
      filename,
      file: fileUrl || filename,
      url: fileUrl || filename,
      size_bytes: sizeBytes,
      mime_type: mimeType,
      tags: tags.length > 0 ? tags : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: record, error } = await supabase.from('media').insert(payload).select().single();
    if (error) throw error;

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload media file.';
    return { success: false, error: message };
  }
}

export async function deleteMediaAction(id: string) {
  const check = await checkPermission('media', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: oldRecord } = await supabase.from('media').select('*').eq('id', id).maybeSingle();
    const { error } = await supabase.from('media').delete().eq('id', id);
    if (error) throw error;

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete media asset.';
    return { success: false, error: message };
  }
}

// ─── Customers Actions ────────────────────────────────────────────────────────

export interface GetAdminCustomersInput {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  sort?: string;
}

export async function getAdminCustomersAction(input: GetAdminCustomersInput = {}) {
  const check = await checkPermission('users', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const {
      page = 1,
      pageSize = 50,
      search = '',
      status,
      sort
    } = input;

    const supabase = getAdminSupabase();
    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    // sort
    if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    return {
      success: true,
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch customers.', data: [] };
  }
}

export async function toggleCustomerStatusAction(id: string, currentStatus: 'active' | 'banned') {
  const check = await checkPermission('users', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';

    const { data: oldRecord, error: getErr } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (getErr || !oldRecord) throw new Error('Customer profile not found.');

    const { data: record, error: updateErr } = await supabase
      .from('customers')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

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

export async function getAdminDashboardMetricsAction() {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();

    // 1. Get total order count
    const { count: ordersCount, error: countErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });

    if (countErr) throw countErr;

    // 2. Get totals for paid orders only via secure RPC
    const { data: revenueData, error: revErr } = await supabase.rpc('get_admin_paid_revenue');
    if (revErr) throw revErr;

    const totalRevenue = Number(revenueData) || 0;

    // 3. Get total paid order count for AOV
    const { count: paidCount, error: paidCountErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('is_paid', true);

    if (paidCountErr) throw paidCountErr;

    const avgOrderValue = (paidCount && paidCount > 0) ? totalRevenue / paidCount : 0;

    return {
      success: true,
      data: {
        ordersCount: ordersCount || 0,
        totalRevenue,
        avgOrderValue,
      }
    };
  } catch (err: any) {
    console.error('[getAdminDashboardMetricsAction] Error:', err);
    return { success: false, error: err.message || 'Failed to fetch metrics.' };
  }
}
export interface GetAdminOrdersInput {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  sort?: string;
}

export async function getAdminOrderByIdAction(id: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getAdminOrdersAction(input: GetAdminOrdersInput = {}) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const {
      page = 1,
      pageSize = 50,
      search = '',
      status,
      paymentStatus,
      paymentMethod,
      sort
    } = input;

    const supabase = getAdminSupabase();

    // Select only lightweight fields required for the list view
    let query = supabase
      .from('orders')
      .select(`
        id,
        order_id,
        created_at,
        customer,
        total,
        status,
        is_paid,
        is_delivered,
        payment_details->method
      `, { count: 'exact' });

    if (search) {
      // Allow searching by human-readable order_id, or customer JSONB fields
      // Wrap the ILIKE patterns in double quotes to prevent commas/parentheses from breaking PostgREST .or() parsing
      const safeSearch = search.replace(/"/g, '');
      query = query.or(`order_id.ilike."%${safeSearch}%",customer->>email.ilike."%${safeSearch}%",customer->>name.ilike."%${safeSearch}%"`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (paymentStatus === 'paid') {
      query = query.eq('is_paid', true);
    } else if (paymentStatus === 'unpaid') {
      query = query.eq('is_paid', false);
    }

    // sorting
    if (sort === 'total_asc') {
      query = query.order('total', { ascending: true });
    } else if (sort === 'total_desc') {
      query = query.order('total', { ascending: false });
    } else if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw error;

    // We do NOT normalize data differently unless required, we just return the flat list.
    // However, payment_details->method comes out nested or as `method` depending on Supabase version.
    const mapped = (data || []).map(row => ({
      ...row,
      payment_method: row.method || (row as any).payment_details?.method || 'N/A'
    }));

    return {
      success: true,
      data: mapped,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
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
    const supabase = getAdminSupabase();
    const { data: oldRecord, error: getErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (getErr || !oldRecord) throw new Error('Order not found.');

    const paymentMethod = oldRecord.payment_details?.method;
    const isCash = isCashPaymentMethod(paymentMethod);
    const updateData: Record<string, any> = { status, updated_at: new Date().toISOString() };

    let justPaidOnDelivery = false;

    if (status === 'delivered') {
      updateData.is_delivered = true;
      updateData.delivered_at = new Date().toISOString();

      // For Cash on Delivery and Store Pickup, marking as delivered confirms cash collection
      if (isCash && !oldRecord.is_paid) {
        updateData.is_paid = true;
        updateData.paid_at = new Date().toISOString();
        updateData.payment_details = {
          ...(oldRecord.payment_details || {}),
          status: 'paid',
        };
        justPaidOnDelivery = true;
      }
    } else if (status === 'shipped') {
      if (requiresPaymentBeforeShipment(paymentMethod) && !oldRecord.is_paid) {
        return {
          success: false,
          error: `Cannot mark a ${formatPaymentMethod(paymentMethod)} order as shipped before payment is verified and marked as paid.`,
        };
      }
      if (paymentMethod === 'cash_pickup') {
        return {
          success: false,
          error: 'Cash on Pickup orders are fulfilled and handed over in-store upon payment, not shipped via courier.',
        };
      }
      updateData.is_delivered = false;
    }

    const { data: record, error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    if (justPaidOnDelivery) {
      try {
        await deductStockForConfirmedOrderAction(id);
      } catch (stockErr) {
        console.error('[updateOrderStatusAction] Stock check error on delivery:', stockErr);
      }

      try {
        await sendInvoiceEmailForOrder(id);
      } catch (emailErr) {
        console.error('[updateOrderStatusAction] Failed to send payment receipt email on delivery:', emailErr);
      }
    }

    if (status === 'shipped') {
      try {
        const customerEmail = oldRecord.customer?.email || oldRecord.customerEmail || oldRecord.email;
        if (customerEmail) {
          const orderItems = Array.isArray(record.items) ? record.items : [];
          await sendOrderShippingEmail({
            to: customerEmail,
            orderNumber: oldRecord.order_id || oldRecord.id,
            customerName: oldRecord.customer?.name || 'Customer',
            shippingAddress: oldRecord.shipping_address,
            paymentMethod: oldRecord.payment_details?.method,
            isPaid: oldRecord.is_paid,
            totalAmount: oldRecord.total,
            items: orderItems.map((i: any) => ({
              name: i.name || 'Product',
              qty: i.quantity || i.qty || 1,
              serials: Array.isArray(i.assignedSerials) ? i.assignedSerials : [],
            })),
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
    const supabase = getAdminSupabase();
    const { data: oldRecord, error: getErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (getErr || !oldRecord) throw new Error('Order not found.');

    const currentPaymentDetails = oldRecord.payment_details || oldRecord.paymentDetails || {};
    const nextStatus = oldRecord.status === 'pending' || oldRecord.status === 'checkout_draft'
      ? 'processing'
      : oldRecord.status;

    const updateData: Record<string, any> = {
      is_paid: true,
      paid_at: new Date().toISOString(),
      payment_details: {
        ...currentPaymentDetails,
        status: 'paid',
      },
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    const { data: record, error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Deduct stock idempotently for confirmed order
    try {
      await deductStockForConfirmedOrderAction(id);
    } catch (stockErr) {
      console.error('[markOrderAsPaidAction] Stock deduction error:', stockErr);
    }

    // Send confirmation/receipt email to customer now that payment is confirmed
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

export async function getPaymentSlipSignedUrlAction(orderId: string): Promise<{
  success: boolean;
  signedUrl?: string;
  error?: string;
}> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) {
    return { success: false, error: 'Unauthorized: Read orders permission required.' };
  }

  try {
    const cleanOrderId = (orderId || '').replace(/[^a-zA-Z0-9-]/g, '');
    if (!cleanOrderId) {
      return { success: false, error: 'Invalid order reference.' };
    }

    const supabase = getAdminSupabase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    let query = supabase.from('orders').select('id, order_id, payment_details, paymentDetails');
    if (isUuid) {
      query = query.or(`id.eq.${cleanOrderId},order_id.eq.${cleanOrderId}`);
    } else {
      query = query.eq('order_id', cleanOrderId);
    }
    const { data: order, error } = await query.maybeSingle();

    if (error || !order) {
      return { success: false, error: 'Order not found.' };
    }

    const pd = order.payment_details || order.paymentDetails || {};
    const slipPath = pd.paymentSlipPath;
    const slipUrl = pd.paymentSlipUrl || pd.paymentSlip;

    if (slipPath) {
      const { data, error: signErr } = await supabase.storage
        .from('ftc-payment-slips')
        .createSignedUrl(slipPath, 120); // 120s TTL

      if (signErr || !data?.signedUrl) {
        console.error('[getPaymentSlipSignedUrlAction] Failed to sign URL:', signErr);
        return { success: false, error: 'Failed to generate secure signed URL for payment slip.' };
      }

      try {
        await writeAuditLog(
          check.actorEmail!,
          'update',
          'orders',
          order.id,
          undefined,
          { action: 'view_payment_slip' },
          { ip: check.ip, userAgent: check.userAgent }
        );
      } catch {
        // non-blocking
      }

      return { success: true, signedUrl: data.signedUrl };
    }

    if (slipUrl && typeof slipUrl === 'string') {
      return { success: true, signedUrl: slipUrl };
    }

    return { success: false, error: 'No payment slip attached to this order.' };
  } catch (err: unknown) {
    console.error('[getPaymentSlipSignedUrlAction] Error:', err);
    return { success: false, error: 'Failed to access payment slip.' };
  }
}

export async function markOrderAsReturnedAction(id: string, reason = 'Returned / Unreachable Customer') {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: order, error: getErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (getErr || !order) return { success: false, error: 'Order not found.' };

    const orderNum = order.order_id || order.id;

    // 1. Release all serial units linked to this order back to 'available' status
    const { data: linkedUnits, error: linkedErr } = await supabase
      .from('stock_management')
      .select('id, product_id')
      .eq('order_id', order.id);

    if (linkedErr) throw linkedErr;

    if (linkedUnits && linkedUnits.length > 0) {
      const { error: releaseErr } = await supabase
        .from('stock_management')
        .update({
          status: 'available',
          order_id: null,
          notes: `Restored to available stock from Returned Order ${orderNum} (${reason})`,
        })
        .eq('order_id', order.id);

      if (releaseErr) throw releaseErr;

      // Update count_in_stock for affected products using a single bulk query
      const productIds = Array.from(new Set(linkedUnits.map((u: any) => u.product_id).filter(Boolean)));
      if (productIds.length > 0) {
        const { data: availUnits, error: availErr } = await supabase
          .from('stock_management')
          .select('product_id')
          .in('product_id', productIds)
          .eq('status', 'available');

        if (availErr) throw availErr;

        const countMap = new Map<string, number>();
        for (const pId of productIds) countMap.set(pId, 0);
        for (const u of (availUnits || [])) {
          if (u.product_id) countMap.set(u.product_id, (countMap.get(u.product_id) || 0) + 1);
        }
        for (const [pId, count] of countMap.entries()) {
          const { error: prodErr } = await supabase.from('products').update({ count_in_stock: count }).eq('id', pId);
          if (prodErr) throw prodErr;
        }
      }
    }

    if (order.status === 'cancelled') {
      return { success: true, message: 'Order is already cancelled or returned.' };
    }

    // 2. Update order status to 'cancelled' with return notes
    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        notes: order.notes ? `${order.notes} | Returned: ${reason}` : `Returned: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

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

    // Send return confirmation email to customer if email is valid (non-blocking)
    const custEmail = (order.customer?.email || order.customerEmail || order.email || order.customer_email || '').trim();
    const custName = (order.customer?.name || order.customerName || order.customer_name || order.name || 'Customer').trim();
    const refundTotal = Number(order.total ?? order.total_amount ?? 0);

    if (custEmail && custEmail !== 'guest@example.com' && !custEmail.endsWith('@customer.local')) {
      sendOrderReturnEmail({
        to: custEmail,
        orderNumber: order.order_id || order.id,
        customerName: custName,
        refundAmount: refundTotal,
        returnReason: reason,
      }).catch((emailErr) => {
        console.warn('[markOrderAsReturnedAction] Non-blocking return email error:', emailErr);
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('[markOrderAsReturnedAction] Error:', err);
    return { success: false, error: err.message || 'Failed to process order return.' };
  }
}

export async function cancelOrderAction(id: string, reason = 'Cancelled by Admin') {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const { data: order, error: getErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (getErr || !order) return { success: false, error: 'Order not found.' };

    const orderNum = order.order_id || order.id;

    // 1. Release all serial units linked to this order back to 'available' status
    const { data: linkedUnits, error: linkedErr } = await supabase
      .from('stock_management')
      .select('id, product_id')
      .eq('order_id', order.id);

    if (linkedErr) throw linkedErr;

    if (linkedUnits && linkedUnits.length > 0) {
      const { error: releaseErr } = await supabase
        .from('stock_management')
        .update({
          status: 'available',
          order_id: null,
          notes: `Restored to available stock from Cancelled Order ${orderNum} (${reason})`,
        })
        .eq('order_id', order.id);

      if (releaseErr) throw releaseErr;

      // Update count_in_stock for affected products using a single bulk query
      const productIds = Array.from(new Set(linkedUnits.map((u: any) => u.product_id).filter(Boolean)));
      if (productIds.length > 0) {
        const { data: availUnits, error: availErr } = await supabase
          .from('stock_management')
          .select('product_id')
          .in('product_id', productIds)
          .eq('status', 'available');

        if (availErr) throw availErr;

        const countMap = new Map<string, number>();
        for (const pId of productIds) countMap.set(pId, 0);
        for (const u of (availUnits || [])) {
          if (u.product_id) countMap.set(u.product_id, (countMap.get(u.product_id) || 0) + 1);
        }
        for (const [pId, count] of countMap.entries()) {
          const { error: prodErr } = await supabase.from('products').update({ count_in_stock: count }).eq('id', pId);
          if (prodErr) throw prodErr;
        }
      }
    }

    if (order.status === 'cancelled') {
      return { success: true, message: 'Order is already cancelled.' };
    }

    // 2. Update order status to 'cancelled'
    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        is_paid: false,
        notes: order.notes ? `${order.notes} | Cancelled: ${reason}` : `Cancelled: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

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
    revalidatePath('/account/orders');

    return { success: true };
  } catch (err: any) {
    console.error('[cancelOrderAction] Error:', err);
    return { success: false, error: err.message || 'Failed to cancel order.' };
  }
}

export async function cancelExpiredUnpaidOrdersAction(maxHours = 24) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  try {
    const supabase = getAdminSupabase();
    const cutoffDate = new Date(Date.now() - maxHours * 60 * 60 * 1000).toISOString();

    const { data: unpaidOrders, error } = await supabase
      .from('orders')
      .select('id, order_id')
      .eq('is_paid', false)
      .eq('status', 'pending')
      .lt('created_at', cutoffDate);

    if (error) throw error;

    let cancelledCount = 0;
    const cancelledOrders: string[] = [];

    for (const order of (unpaidOrders || [])) {
      const res = await cancelOrderAction(order.id, `Auto-cancelled (Unpaid for >${maxHours} hours)`);
      if (res.success) {
        cancelledCount++;
        cancelledOrders.push(order.order_id || order.id);
      }
    }

    revalidatePath('/admin/orders');
    revalidatePath('/admin/inventory');
    revalidatePath('/products');

    return {
      success: true,
      cancelledCount,
      cancelledOrders,
      message: cancelledCount > 0
        ? `Successfully cancelled ${cancelledCount} unpaid order(s) older than ${maxHours} hours.`
        : `No unpaid orders older than ${maxHours} hours were found.`,
    };
  } catch (err: any) {
    console.error('[cancelExpiredUnpaidOrdersAction] Error:', err);
    return { success: false, error: err.message || 'Failed to auto-cancel expired unpaid orders.' };
  }
}

// ─── System Configurations (Barcode Print Presets) ────────────────────────────

// BarcodePrintConfig is imported at the top of the file from @/types/barcode-config.
// Do NOT re-export anything non-async from a 'use server' file.

export async function getBarcodePrintPresetsAction() {
  const check = await checkPermission('systemConfig', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data: records, error } = await supabase
      .from('system_configurations')
      .select('*')
      .eq('category', 'barcode_print')
      .order('isDefault', { ascending: false });

    if (error) throw error;
    return { success: true, data: structuredClone(records || []) };
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
    const supabase = getAdminSupabase();
    const payload = {
      category: 'barcode_print',
      label: config.label,
      config: JSON.stringify(config),
      isDefault: config.isDefault,
      updated_at: new Date().toISOString(),
    };

    if (config.isDefault) {
      let unsetDefaultQuery = supabase
        .from('system_configurations')
        .update({ isDefault: false })
        .eq('category', 'barcode_print')
        .eq('isDefault', true);

      if (existingId) {
        unsetDefaultQuery = unsetDefaultQuery.neq('id', existingId);
      }
      await unsetDefaultQuery;
    }

    let record;
    if (existingId) {
      const { data, error } = await supabase
        .from('system_configurations')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();
      if (error) throw error;
      record = data;
    } else {
      const { data, error } = await supabase
        .from('system_configurations')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      record = data;
    }

    revalidatePath('/admin/system-config');
    return { success: true, data: structuredClone(record) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save preset.';
    return { success: false, error: message };
  }
}

export async function deleteBarcodePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('system_configurations').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete preset.';
    return { success: false, error: message };
  }
}

export async function setDefaultBarcodePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    await supabase
      .from('system_configurations')
      .update({ isDefault: false })
      .eq('category', 'barcode_print');

    const { error } = await supabase
      .from('system_configurations')
      .update({ isDefault: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set default.';
    return { success: false, error: message };
  }
}

// ─── System Configurations (Receipt Print Presets) ───────────────────────────

export async function getReceiptPrintPresetsAction(): Promise<{
  success: boolean;
  error?: string;
  data: ReceiptPrintPreset[];
}> {
  const posSession = await getVerifiedPosSession();
  const check = await checkPermission('systemConfig', 'read');
  if (!posSession && !check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const [genSettings, persSettings] = await Promise.all([
      pbSiteSettings.get<any>('general').catch(() => null),
      pbSiteSettings.get<any>('personalization').catch(() => null),
    ]);

    const logoUrl = persSettings?.logoUrl || persSettings?.darkLogoUrl || '';
    const dbStoreName = genSettings?.siteName || '';
    const dbAddress = [genSettings?.contactInfo?.address, genSettings?.contactInfo?.city].filter(Boolean).join(', ');
    const dbPhone = genSettings?.contactInfo?.phone || '';

    const { data: recordsData } = await supabase
      .from('system_configurations')
      .select('*')
      .eq('category', 'receipt_print')
      .order('isDefault', { ascending: false });

    const records = recordsData || [];

    if (records.length === 0) {
      records.push({
        id: 'default',
        category: 'receipt_print',
        label: 'Default Preset',
        isDefault: true,
        config: JSON.stringify(DEFAULT_RECEIPT_CONFIG)
      });
    }

    const list = records.map((r: any) => {
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
          logoUrl: logoUrl || parsedConfig.logoUrl,
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
    const supabase = getAdminSupabase();
    const payload = {
      category: 'receipt_print',
      label: config.label,
      config: JSON.stringify(config),
      isDefault: config.isDefault,
      updated_at: new Date().toISOString(),
    };

    if (config.isDefault) {
      let unsetQuery = supabase
        .from('system_configurations')
        .update({ isDefault: false })
        .eq('category', 'receipt_print')
        .eq('isDefault', true);

      if (existingId) {
        unsetQuery = unsetQuery.neq('id', existingId);
      }
      await unsetQuery;
    }

    let record;
    if (existingId) {
      const { data, error } = await supabase
        .from('system_configurations')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();
      if (error) throw error;
      record = data;
    } else {
      const { data, error } = await supabase
        .from('system_configurations')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      record = data;
    }

    revalidatePath('/admin/system-config');
    return { success: true, data: structuredClone(record) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save receipt preset.';
    return { success: false, error: message };
  }
}

export async function deleteReceiptPrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('system_configurations').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete receipt preset.';
    return { success: false, error: message };
  }
}

export async function setDefaultReceiptPrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    await supabase
      .from('system_configurations')
      .update({ isDefault: false })
      .eq('category', 'receipt_print');

    const { error } = await supabase
      .from('system_configurations')
      .update({ isDefault: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set default receipt preset.';
    return { success: false, error: message };
  }
}

// ─── System Configurations (Sales Invoice & Quotation Presets) ─────────────────

export async function getInvoicePrintPresetsAction() {
  const posSession = await getVerifiedPosSession();
  const check = await checkPermission('systemConfig', 'read');
  if (!posSession && !check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const [genSettings, persSettings] = await Promise.all([
      pbSiteSettings.get<any>('general').catch(() => null),
      pbSiteSettings.get<any>('personalization').catch(() => null),
    ]);

    const logoUrl = persSettings?.logoUrl || persSettings?.darkLogoUrl || '';
    const dbStoreName = genSettings?.siteName || '';
    const dbAddress = [genSettings?.contactInfo?.address, genSettings?.contactInfo?.city].filter(Boolean).join(', ');
    const dbPhone = genSettings?.contactInfo?.phone || '';
    const dbEmail = genSettings?.contactInfo?.email || '';

    const { data: recordsData } = await supabase
      .from('system_configurations')
      .select('*')
      .eq('category', 'invoice_print')
      .order('isDefault', { ascending: false });

    const records = recordsData || [];

    if (records.length === 0) {
      records.push({
        id: 'default',
        category: 'invoice_print',
        label: 'Default Preset',
        isDefault: true,
        config: JSON.stringify(DEFAULT_INVOICE_CONFIG)
      });
    }

    const list = records.map((r: any) => {
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
          logoUrl: logoUrl || parsedConfig.logoUrl,
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
    const supabase = getAdminSupabase();
    const payload = {
      category: 'invoice_print',
      label: config.label,
      config: JSON.stringify(config),
      isDefault: config.isDefault,
      updated_at: new Date().toISOString(),
    };

    if (config.isDefault) {
      let unsetQuery = supabase
        .from('system_configurations')
        .update({ isDefault: false })
        .eq('category', 'invoice_print')
        .eq('isDefault', true);

      if (existingId) {
        unsetQuery = unsetQuery.neq('id', existingId);
      }
      await unsetQuery;
    }

    let record;
    if (existingId) {
      const { data, error } = await supabase
        .from('system_configurations')
        .update(payload)
        .eq('id', existingId)
        .select()
        .single();
      if (error) throw error;
      record = data;
    } else {
      const { data, error } = await supabase
        .from('system_configurations')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      record = data;
    }

    revalidatePath('/admin/system-config');
    return { success: true, data: structuredClone(record) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save invoice preset.';
    return { success: false, error: message };
  }
}

export async function deleteInvoicePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('system_configurations').delete().eq('id', id);
    if (error) throw error;
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete invoice preset.';
    return { success: false, error: message };
  }
}

export async function setDefaultInvoicePrintPresetAction(id: string) {
  const check = await checkPermission('systemConfig', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    await supabase
      .from('system_configurations')
      .update({ isDefault: false })
      .eq('category', 'invoice_print');

    const { error } = await supabase
      .from('system_configurations')
      .update({ isDefault: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set default invoice preset.';
    return { success: false, error: message };
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

function parseStrictBoolean(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === '1' || val === 1) return true;
  if (val === 'false' || val === '0' || val === 0) return false;
  return fallback;
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
    const cleanName = (data.name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Employee name is required.' };
    }
    const cleanRole = data.role === 'manager' ? 'manager' : 'cashier';
    let hashedPin = '';
    if (data.pin && data.pin.trim()) {
      hashedPin = isBcryptHash(data.pin) ? data.pin : await hashPin(data.pin.trim());
    } else {
      return { success: false, error: 'PIN is required for new employee.' };
    }

    const dbPayload = {
      name: cleanName,
      role: cleanRole,
      pin: hashedPin,
      is_active: data.isActive !== undefined ? parseStrictBoolean(data.isActive, true) : true,
    };

    const emp = await pbEmployees.create(dbPayload);
    revalidatePath('/admin/system-config/employees');
    return {
      success: true,
      data: {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        isActive: Boolean(emp.is_active ?? true),
        pin: '', // Never expose to browser
        created: emp.created_at || new Date().toISOString(),
        updated: emp.updated_at || new Date().toISOString(),
      },
    };
  } catch (err: any) {
    console.error('[createPosEmployeeAction] Error:', err);
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
    const cleanId = (id || '').trim();
    if (!cleanId) {
      return { success: false, error: 'Employee ID is required.' };
    }

    const dbPayload: Record<string, any> = {};
    if (data.name !== undefined) {
      const cleanName = data.name.trim();
      if (!cleanName) return { success: false, error: 'Employee name cannot be empty.' };
      dbPayload.name = cleanName;
    }
    if (data.role !== undefined) {
      dbPayload.role = data.role === 'manager' ? 'manager' : 'cashier';
    }
    if (data.isActive !== undefined) {
      dbPayload.is_active = parseStrictBoolean(data.isActive, true);
    }
    if (data.pin !== undefined) {
      if (data.pin && data.pin.trim()) {
        dbPayload.pin = isBcryptHash(data.pin) ? data.pin : await hashPin(data.pin.trim());
      }
    }

    const emp = await pbEmployees.update(cleanId, dbPayload);
    revalidatePath('/admin/system-config/employees');
    return {
      success: true,
      data: {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        isActive: Boolean(emp.is_active ?? true),
        pin: '', // Never expose to browser
        created: emp.created_at || new Date().toISOString(),
        updated: emp.updated_at || new Date().toISOString(),
      },
    };
  } catch (err: any) {
    console.error('[updatePosEmployeeAction] Error:', err);
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

export async function verifyPosEmployeePinAction(
  employeeId: string,
  pin: string
): Promise<{
  success: boolean;
  session?: PosEmployeeSession;
  error?: string;
}> {
  try {
    const cleanId = typeof employeeId === 'string' ? employeeId.trim() : '';
    const cleanPin = typeof pin === 'string' ? pin.trim() : '';

    if (!cleanId || !cleanPin || cleanPin.length < 4 || cleanPin.length > 8) {
      return { success: false, error: 'Invalid ID or PIN format.' };
    }

    let ip = '127.0.0.1';
    try {
      const headersList = await headers();
      ip = getTrustedClientIp(headersList);
    } catch {
      // Outside request context
    }

    const rateLimitKey = `pos_emp_${cleanId}_${ip}`;
    const rateCheck = checkPinRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Too many failed attempts. Please try again in ${rateCheck.retryAfterSeconds || 60} seconds.`,
      };
    }

    const supabase = getAdminSupabase();
    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, name, role, pin, is_active')
      .eq('id', cleanId)
      .maybeSingle();

    if (empErr || !employee) {
      recordFailedPinAttempt(rateLimitKey);
      return { success: false, error: 'Incorrect PIN or unauthorized staff account.' };
    }

    const isActive = employee.is_active !== false;
    if (!isActive) {
      recordFailedPinAttempt(rateLimitKey);
      return { success: false, error: 'This employee account is inactive. Please contact your manager.' };
    }

    const verifyResult = await verifyPinWithLegacyMigration(cleanPin, employee.pin);
    if (!verifyResult.valid) {
      recordFailedPinAttempt(rateLimitKey);
      return { success: false, error: 'Incorrect PIN. Try again.' };
    }

    // Success - reset rate limit tracker
    resetPinRateLimit(rateLimitKey);

    // If legacy plaintext, seamlessly upgrade to bcrypt hash in background
    if (verifyResult.wasLegacyPlaintext) {
      try {
        const hashed = await hashPin(cleanPin);
        await supabase
          .from('employees')
          .update({ pin: hashed })
          .eq('id', cleanId);
      } catch (upgradeErr) {
        console.error('[verifyPosEmployeePinAction] Failed to upgrade legacy PIN hash:', upgradeErr);
      }
    }

    const session: PosEmployeeSession = {
      id: employee.id,
      name: employee.name || 'Staff',
      role: (employee.role === 'manager' ? 'manager' : 'cashier') as EmployeeRole,
      loginTime: new Date().toISOString(),
    };

    // Issue cryptographic HttpOnly session cookie
    try {
      await setPosSessionCookie({
        employeeId: employee.id,
        role: session.role,
        issuedAt: Date.now(),
        expiresAt: Date.now() + POS_SESSION_MAX_AGE * 1000,
        sessionId: crypto.randomUUID(),
      });
    } catch (cookieErr) {
      console.error('[verifyPosEmployeePinAction] Failed to set POS session cookie:', cookieErr);
      return { success: false, error: 'Session initialization failed.' };
    }

    return { success: true, session };
  } catch (err) {
    console.error('[verifyPosEmployeePinAction] Unexpected error:', err);
    return { success: false, error: 'Authentication verification failed.' };
  }
}

export async function logoutPosEmployeeAction(): Promise<{ success: boolean }> {
  try {
    await clearPosSessionCookie();
    return { success: true };
  } catch (err) {
    console.error('[logoutPosEmployeeAction] Error:', err);
    return { success: false };
  }
}

export async function getPosSessionAction(): Promise<{ success: boolean; session?: PosEmployeeSession }> {
  try {
    const verified = await getVerifiedPosSession();
    if (!verified) {
      return { success: false };
    }
    return {
      success: true,
      session: {
        id: verified.employeeId,
        name: verified.name,
        role: verified.role,
        loginTime: new Date().toISOString(),
      },
    };
  } catch {
    return { success: false };
  }
}

// ─── POS — Sales ──────────────────────────────────────────────────────────────

export async function createSaleAction(payload: SalePayload, idempotencyKey?: string) {
  try {
    const posSession = await getVerifiedPosSession();
    const adminCheck = await checkPermission('orders', 'write');

    if (!posSession && !adminCheck.allowed) {
      return { success: false, error: 'Unauthorized: Staff session required to record sales.' };
    }

    // Authoritative cashier resolution:
    // If POS session is active, cashier MUST be the verified employee
    if (posSession) {
      payload.cashier_id = posSession.employeeId;
      payload.cashier_name = posSession.name;
    } else if (adminCheck.allowed) {
      payload.cashier_id = adminCheck.actorId || payload.cashier_id || '';
      payload.cashier_name = adminCheck.actorName || payload.cashier_name || 'Admin';
    }

    // Server-side inventory & financial recalculation & validation
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      return { success: false, error: 'POS sale must contain at least one item.' };
    }

    const productIds = payload.items.map((i) => i.product_id).filter(Boolean);
    if (productIds.length !== payload.items.length) {
      return { success: false, error: 'Every item must have a valid product_id.' };
    }

    const supabase = getAdminSupabase();
    const { data: dbProducts, error: prodErr } = await supabase
      .from('products')
      .select('id, name, price, discount_price, sku, inventory_tracking_type, status, is_active')
      .in('id', productIds);

    if (prodErr || !dbProducts || dbProducts.length === 0) {
      return { success: false, error: 'Failed to verify items against catalog.' };
    }

    const prodMap = new Map(dbProducts.map((p) => [p.id, p]));

    for (const item of payload.items) {
      const prod = prodMap.get(item.product_id);
      if (!prod) {
        return { success: false, error: `Product with ID ${item.product_id} not found.` };
      }
      if (prod.status !== 'published' || prod.is_active === false) {
        return { success: false, error: `Product "${prod.name}" is not active for sale.` };
      }

      const qty = Math.floor(Number(item.quantity));
      if (isNaN(qty) || qty <= 0) {
        return { success: false, error: `Invalid quantity for product "${prod.name}".` };
      }
      item.quantity = qty;

      // Authoritative pricing: never trust client unit_price
      const authoritativeUnitPrice = Number(prod.discount_price ?? prod.price ?? 0);
      item.unit_price = authoritativeUnitPrice;
      item.product_name = prod.name;
      item.sku = prod.sku || '';

      // Discount cannot exceed unit price
      const itemDiscount = Math.max(0, Math.min(Number(item.item_discount || 0), authoritativeUnitPrice));
      item.item_discount = itemDiscount;
      item.line_total = (authoritativeUnitPrice - itemDiscount) * qty;
    }

    // Authoritative totals recalculation
    const calculatedSubtotal = payload.items.reduce(
      (sum, item) => sum + (item.unit_price * item.quantity),
      0
    );
    const calculatedItemDiscountTotal = payload.items.reduce(
      (sum, item) => sum + ((item.item_discount || 0) * item.quantity),
      0
    );

    const clientDiscount = Math.max(0, Number(payload.discount || 0));
    const calculatedDiscount = Math.min(
      clientDiscount > 0 ? clientDiscount : calculatedItemDiscountTotal,
      calculatedSubtotal
    );

    const calculatedTax = Math.max(0, Number(payload.tax_amount || 0));
    const calculatedTotal = Math.max(0, calculatedSubtotal - calculatedDiscount + calculatedTax);

    payload.subtotal = calculatedSubtotal;
    payload.discount = calculatedDiscount;
    payload.tax_amount = calculatedTax;
    payload.total = calculatedTotal;
    payload.status = 'completed';
    (payload as any).payment_status = 'paid';

    if (payload.payment_method === 'cash') {
      const tendered = Number(payload.cash_tendered || 0);
      if (tendered < calculatedTotal) {
        return {
          success: false,
          error: `Cash tendered (Rs. ${tendered.toLocaleString()}) is less than total amount (Rs. ${calculatedTotal.toLocaleString()}).`,
        };
      }
      payload.change_due = Math.max(0, tendered - calculatedTotal);
    }

    const finalIdempotencyKey =
      idempotencyKey ||
      (payload as any).idempotency_key ||
      payload.receipt_number ||
      crypto.randomUUID();

    const result = await pbSales.createSale(payload, finalIdempotencyKey);
    revalidatePath('/pos/history');
    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record sale.' };
  }
}

export async function sendPosSaleEmailAction(saleId: string, emailAddress?: string) {
  const posSession = await getVerifiedPosSession();
  const check = await checkPermission('orders', 'write');
  if (!posSession && !check.allowed) return { success: false, error: 'Unauthorized.' };

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
      paymentStatus: 'Paid',
      isPaid: true,
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
    const posSession = await getVerifiedPosSession();
    const adminCheck = await checkPermission('orders', 'read');

    if (!posSession && !adminCheck.allowed) {
      return { success: false, error: 'Unauthorized: Staff session required.' };
    }

    const safeLimit = Math.max(1, Math.min(limit, 100));
    const sales = await pbSales.getRecent(safeLimit);
    return { success: true, data: sales };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load sales.' };
  }
}

export async function getSaleByIdAction(
  id: string
): Promise<{ success: boolean; data?: { sale: PBSale; items: PBSaleItem[] }; error?: string }> {
  try {
    const posSession = await getVerifiedPosSession();
    const adminCheck = await checkPermission('orders', 'read');

    if (!posSession && !adminCheck.allowed) {
      return { success: false, error: 'Unauthorized: Staff session required.' };
    }

    const sale = await pbSales.getById(id);
    if (!sale) return { success: false, error: 'Sale not found.' };
    const items = await pbSales.getItemsBySale(id);

    const supabase = getAdminSupabase();
    if (sale.customer_phone && (!sale.customer_email || sale.customer_email.endsWith('@customer.local') || sale.customer_email === 'customer@ftc.lk')) {
      try {
        const { data: cust } = await supabase
          .from('customers')
          .select('email')
          .eq('phone', sale.customer_phone)
          .limit(1)
          .maybeSingle();

        if (cust?.email && !cust.email.endsWith('@customer.local') && cust.email !== 'customer@ftc.lk') {
          sale.customer_email = cust.email;
        }
      } catch (custErr) {
        console.warn('[getSaleByIdAction] Warning: Failed to query customer by phone:', custErr);
      }
    }

    // Enrich commercial items with product inventory tracking and stock
    const productIds = Array.from(new Set(items.map((i: any) => i.product_id).filter(Boolean)));
    if (productIds.length > 0) {
      try {
        const { data: prods } = await supabase
          .from('products')
          .select('id, inventory_tracking_type, count_in_stock')
          .in('id', productIds);
        const prodMap = new Map((prods || []).map(p => [p.id, p]));
        items.forEach((item: any) => {
          if (item.product_id && prodMap.has(item.product_id)) {
            const p = prodMap.get(item.product_id);
            if (p) {
              item.inventory_tracking_type = p.inventory_tracking_type;
              item.count_in_stock = p.count_in_stock;
            }
          }
        });
      } catch (prodErr) {
        console.warn('[getSaleByIdAction] Warning: Failed to query product tracking info:', prodErr);
      }
    }

    // Enrich items with fulfillment records (snapshotted serial numbers and accurate fulfilled counts)
    const saleItemIds = items.map((i: any) => i.id).filter(Boolean);
    if (saleItemIds.length > 0) {
      try {
        const { data: fulfillmentItems, error: fErr } = await supabase
          .from('sale_fulfillment_items')
          .select('sale_item_id, serial_number, quantity, created_at')
          .in('sale_item_id', saleItemIds)
          .order('created_at', { ascending: true });

        if (!fErr && fulfillmentItems && fulfillmentItems.length > 0) {
          // Group fulfillment items strictly by exact sale_item_id
          const fulfillmentsBySaleItem = new Map<string, Array<{ serial_number: string | null; quantity: number }>>();
          for (const fi of fulfillmentItems) {
            const list = fulfillmentsBySaleItem.get(fi.sale_item_id) || [];
            list.push(fi);
            fulfillmentsBySaleItem.set(fi.sale_item_id, list);
          }

          items.forEach((item: any) => {
            const fList = fulfillmentsBySaleItem.get(item.id);
            if (fList && fList.length > 0) {
              const serials: string[] = [];
              let fulfilledSum = 0;

              for (const fi of fList) {
                fulfilledSum += (typeof fi.quantity === 'number' && fi.quantity > 0) ? fi.quantity : 1;
                if (fi.serial_number && typeof fi.serial_number === 'string') {
                  const s = fi.serial_number.trim();
                  if (s && !serials.includes(s)) {
                    serials.push(s);
                  }
                }
              }

              item.serial_numbers = serials;
              if (item.quantity_fulfilled === undefined || item.quantity_fulfilled === null) {
                item.quantity_fulfilled = fulfilledSum;
              }
              if (serials.length > 0) {
                item.unit_serial = serials.join(' · ');
              }
            } else {
              if (item.quantity_fulfilled === undefined || item.quantity_fulfilled === null) {
                item.quantity_fulfilled = 0;
              }
              if (item.unit_serial && item.unit_serial.trim()) {
                item.serial_numbers = [item.unit_serial.trim()];
              } else {
                item.serial_numbers = [];
              }
            }
          });
        } else {
          // No fulfillment items recorded yet for these sale items
          items.forEach((item: any) => {
            if (item.quantity_fulfilled === undefined || item.quantity_fulfilled === null) {
              item.quantity_fulfilled = 0;
            }
            if (item.unit_serial && item.unit_serial.trim()) {
              item.serial_numbers = [item.unit_serial.trim()];
            } else {
              item.serial_numbers = [];
            }
          });
        }
      } catch (fErr) {
        console.warn('[getSaleByIdAction] Warning: Failed to query sale fulfillment items:', fErr);
      }
    }

    return { success: true, data: { sale, items } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sale.';
    return { success: false, error: message };
  }
}

export async function getEligibleManagersAction(): Promise<{
  success: boolean;
  data?: Array<{ id: string; name: string; role: string; avatar?: string }>;
  error?: string;
}> {
  try {
    const supabase = getAdminSupabase();
    const managers: Array<{ id: string; name: string; role: string; avatar?: string }> = [];

    // Query active managers/admins from employees table
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, role, avatar, is_active')
      .in('role', ['manager', 'admin'])
      .neq('is_active', false);

    if (employees && employees.length > 0) {
      for (const e of employees) {
        managers.push({
          id: e.id,
          name: e.name || 'Manager',
          role: e.role,
          avatar: e.avatar,
        });
      }
    }

    // Query admin/super_admin accounts from profiles table
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, role, avatar')
      .in('role', ['manager', 'admin', 'super_admin', 'superuser', 'owner', 'store_manager']);

    if (profiles && profiles.length > 0) {
      for (const p of profiles) {
        if (!managers.some((m) => m.id === p.id)) {
          managers.push({
            id: p.id,
            name: p.name || 'Admin',
            role: p.role,
            avatar: p.avatar,
          });
        }
      }
    }

    return { success: true, data: managers };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to load eligible managers.' };
  }
}

export async function verifyManagerPinAction(
  pin: string,
  managerId?: string
): Promise<{
  success: boolean;
  managerName?: string;
  error?: string;
}> {
  try {
    const cleanPin = typeof pin === 'string' ? pin.trim() : '';
    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 8) {
      return { success: false, error: 'Valid PIN is required.' };
    }

    let ip = '127.0.0.1';
    try {
      const headersList = await headers();
      ip = getTrustedClientIp(headersList);
    } catch {
      // Outside request context
    }

    const rateLimitKey = `mgr_pin_${ip}`;
    const rateCheck = checkPinRateLimit(rateLimitKey);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Too many failed attempts. Please try again in ${rateCheck.retryAfterSeconds || 60} seconds.`,
      };
    }

    const supabase = getAdminSupabase();

    // TARGETED FLOW: If managerId is supplied, verify only that specific manager account (single bcrypt comparison)
    if (managerId && managerId.trim()) {
      const cleanManagerId = managerId.trim();

      // Check employee record
      const { data: emp } = await supabase
        .from('employees')
        .select('id, name, pin, role, is_active')
        .eq('id', cleanManagerId)
        .maybeSingle();

      if (emp) {
        if (emp.is_active === false) {
          return { success: false, error: 'This manager account is inactive.' };
        }
        if (!['manager', 'admin'].includes(emp.role)) {
          return { success: false, error: 'Selected account does not have manager authorization.' };
        }
        if (!emp.pin) {
          return { success: false, error: 'Manager has no PIN configured.' };
        }

        const verifyRes = await verifyPinWithLegacyMigration(cleanPin, emp.pin);
        if (verifyRes.valid) {
          resetPinRateLimit(rateLimitKey);
          if (verifyRes.wasLegacyPlaintext) {
            try {
              const hashed = await hashPin(cleanPin);
              await supabase.from('employees').update({ pin: hashed }).eq('id', emp.id);
            } catch (upgradeErr) {
              console.error('[verifyManagerPinAction] Failed to upgrade employee PIN hash:', upgradeErr);
            }
          }
          return { success: true, managerName: emp.name || 'Manager' };
        } else {
          recordFailedPinAttempt(rateLimitKey);
          return { success: false, error: 'Invalid PIN entered for selected manager.' };
        }
      }

      // Check profile record
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, role, pin')
        .eq('id', cleanManagerId)
        .maybeSingle();

      if (profile) {
        if (!['manager', 'admin', 'super_admin', 'superuser', 'owner', 'store_manager'].includes(profile.role)) {
          return { success: false, error: 'Selected account does not have manager authorization.' };
        }
        if (!profile.pin) {
          return { success: false, error: 'Account has no PIN configured.' };
        }

        const verifyRes = await verifyPinWithLegacyMigration(cleanPin, profile.pin);
        if (verifyRes.valid) {
          resetPinRateLimit(rateLimitKey);
          if (verifyRes.wasLegacyPlaintext) {
            try {
              const hashed = await hashPin(cleanPin);
              await supabase.from('profiles').update({ pin: hashed }).eq('id', profile.id);
            } catch (upgradeErr) {
              console.error('[verifyManagerPinAction] Failed to upgrade profile PIN hash:', upgradeErr);
            }
          }
          return { success: true, managerName: profile.name || 'Admin' };
        } else {
          recordFailedPinAttempt(rateLimitKey);
          return { success: false, error: 'Invalid PIN entered for selected account.' };
        }
      }

      recordFailedPinAttempt(rateLimitKey);
      return { success: false, error: 'Selected manager account was not found.' };
    }

    // Direct fallback if managerId omitted (targeted to first matching active account)
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, pin, role, is_active')
      .in('role', ['manager', 'admin'])
      .neq('is_active', false)
      .limit(10);

    if (employees && employees.length > 0) {
      for (const e of employees) {
        if (!e.pin) continue;
        const verifyRes = await verifyPinWithLegacyMigration(cleanPin, e.pin);
        if (verifyRes.valid) {
          resetPinRateLimit(rateLimitKey);
          if (verifyRes.wasLegacyPlaintext) {
            try {
              const hashed = await hashPin(cleanPin);
              await supabase.from('employees').update({ pin: hashed }).eq('id', e.id);
            } catch (upgradeErr) {
              console.error('[verifyManagerPinAction] Failed to upgrade employee PIN hash:', upgradeErr);
            }
          }
          return { success: true, managerName: e.name || 'Manager' };
        }
      }
    }

    recordFailedPinAttempt(rateLimitKey);
    return { success: false, error: 'Invalid Manager or Admin PIN.' };
  } catch (err) {
    console.error('[verifyManagerPinAction] Error:', err);
    return { success: false, error: 'PIN verification failed.' };
  }
}

export async function voidSaleAction(id: string, managerPin: string, managerId?: string, reason?: string) {
  try {
    const posSession = await getVerifiedPosSession();
    const adminCheck = await checkPermission('orders', 'write');
    if (!posSession && !adminCheck.allowed) {
      return { success: false, error: 'Unauthorized: Valid POS or admin session required.' };
    }

    const verify = await verifyManagerPinAction(managerPin, managerId);
    if (!verify.success) {
      return { success: false, error: verify.error || 'Manager PIN required to void sales.' };
    }

    const existingSale = await pbSales.getById(id);
    if (!existingSale) {
      return { success: false, error: 'Sale record not found.' };
    }
    if (existingSale.quotation_id || (existingSale.invoice_number && !existingSale.receipt_number?.startsWith('FTC-POS-'))) {
      return { success: false, error: 'Commercial wholesale invoices cannot be voided via POS void. Use the invoice revocation workflow.' };
    }

    const authoritativeManager = verify.managerName || (posSession ? posSession.name : 'Authorized Manager');
    const voidReason = reason?.trim() || 'Voided via POS with Manager PIN authorization';

    const sale = await pbSales.voidSale(id, authoritativeManager, voidReason);
    revalidatePath('/pos/history');
    return { success: true, data: sale };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to void sale.';
    return { success: false, error: message };
  }
}

// ─── POS — Customers ──────────────────────────────────────────────────────────

export async function searchPosCustomersAction(query: string) {
  try {
    const posSession = await getVerifiedPosSession();
    const adminCheck = await checkPermission('orders', 'read');
    if (!posSession && !adminCheck.allowed) {
      return { success: false, error: 'Unauthorized.' };
    }

    const supabase = getAdminSupabase();
    const q = query.trim();
    if (!q) {
      const { data, error } = await supabase.from('customers').select('*').order('name').limit(50);
      if (error) throw error;
      return { success: true, data: data || [] };
    }
    const cleanQ = q.replace(/[%_]/g, '\\$&');
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .or(`name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%`)
      .order('name')
      .limit(50);
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to search customers.';
    return { success: false, error: message };
  }
}

export async function createPosCustomerAction(data: { name: string; phone?: string; email?: string; notes?: string }) {
  try {
    const posSession = await getVerifiedPosSession();
    const adminCheck = await checkPermission('orders', 'write');
    if (!posSession && !adminCheck.allowed) {
      return { success: false, error: 'Unauthorized.' };
    }

    const supabase = getAdminSupabase();
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        name: data.name.trim(),
        email: data.email?.trim() || `${Date.now()}@customer.local`,
        phone: data.phone?.trim() || '',
        orders_count: 0,
        total_spent: 0,
        status: 'active',
        notes: data.notes?.trim() || 'Created via POS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    revalidatePath('/admin/customers');
    return { success: true, data: customer };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create customer.';
    return { success: false, error: message };
  }
}

export async function validatePosCouponAction(code: string, cartTotal: number) {
  try {
    const posSession = await getVerifiedPosSession();
    const adminCheck = await checkPermission('promotions', 'read');
    if (!posSession && !adminCheck.allowed) {
      return { success: false, error: 'Unauthorized.' };
    }

    const supabase = getAdminSupabase();
    const cleanCode = code.trim();
    if (!cleanCode) return { success: false, error: 'Coupon code is required.' };

    const now = new Date().toISOString();
    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('coupon_code', cleanCode)
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now);

    if (error || !promotions || promotions.length === 0) {
      return { success: false, error: 'Invalid or expired coupon code.' };
    }

    const promo = promotions[0];
    const minOrderValue = promo.min_order_value || 0;
    if (minOrderValue > 0 && cartTotal < minOrderValue) {
      return {
        success: false,
        error: `Minimum order value of Rs. ${minOrderValue.toLocaleString()} required for this coupon.`,
      };
    }

    return {
      success: true,
      data: {
        id: promo.id,
        name: promo.name,
        type: promo.type,
        discountValue: promo.discount_value,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to validate coupon.';
    return { success: false, error: message };
  }
}

export async function getUnifiedSalesTrackerAction(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  source?: string;
  paymentStatus?: string;
  status?: string;
  paymentMethod?: string;
  lifecycle?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: string;
}) {
  const perm = await checkPermission('orders', 'read');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Read orders permission required.' };
  }

  const {
    page = 1,
    pageSize = 50,
    search = '',
    source = 'All',
    paymentStatus = 'All',
    status = 'All',
    paymentMethod = 'All',
    lifecycle = 'all',
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    sort = 'newest'
  } = params || {};

  // Validate limits server-side
  const limit = Math.max(1, Math.min(pageSize, 100));
  const offset = Math.max(0, (page - 1) * limit);

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase.rpc('admin_get_unified_sales', {
      p_search: search,
      p_source: source,
      p_payment_status: paymentStatus,
      p_status: status,
      p_payment_method: paymentMethod,
      p_lifecycle: lifecycle.toLowerCase(),
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_min_amount: minAmount ?? null,
      p_max_amount: maxAmount ?? null,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset
    });

    if (error) throw error;

    const items = data || [];
    const mappedItems = items.map((sale: any) => ({
      id: sale.id,
      receiptNumber: sale.receipt_number,
      invoiceNumber: sale.invoice_number,
      date: sale.date,
      customerName: sale.customer_name,
      customerCompany: sale.customer_company || null,
      customerEmail: sale.customer_email,
      itemsCount: sale.items_count,
      total: Number(sale.total) || 0,
      discount: Number(sale.discount) || 0,
      paymentMethod: sale.payment_method,
      status: sale.status,
      source: sale.source,
      isPaid: sale.is_paid,
      isRevenueEligible: sale.is_revenue_eligible,
      clearedPaid: Number(sale.cleared_paid) || 0,
      pendingClearance: Number(sale.pending_clearance) || 0,
      balanceDue: Number(sale.balance_due) || 0,
      availableToRecord: Number(sale.available_to_record) || 0,
      paymentStatus: sale.payment_status || (sale.is_paid ? 'PAID' : 'UNPAID'),
      paymentTerms: sale.payment_terms || 'due_on_receipt',
      dueDate: sale.due_date,
      collectionStatus: sale.collection_status || 'NOT DUE',
      daysOverdue: Number(sale.days_overdue) || 0,
      isRevoked: Boolean(sale.is_revoked),
      invoiceRevokedAt: sale.invoice_revoked_at || null,
      invoiceRevokedBy: sale.invoice_revoked_by || null,
      invoiceRevokeReason: sale.invoice_revoke_reason || null,
      invoiceRevokeNotes: sale.invoice_revoke_notes || null,
      fulfillmentStatus: null as 'NOT HANDED OVER' | 'PARTIALLY HANDED OVER' | 'HANDED OVER' | null,
    }));

    // Batch-resolve commercial fulfillment status for displayed page without N+1
    const wholesaleSaleIds = mappedItems
      .filter((s: any) => s.source === 'Wholesale' || s.invoiceNumber)
      .map((s: any) => s.id);

    if (wholesaleSaleIds.length > 0) {
      try {
        const { data: itemStats } = await supabase
          .from('sale_items')
          .select('sale_id, quantity, quantity_fulfilled')
          .in('sale_id', wholesaleSaleIds);

        const statsMap = new Map<string, { totalQty: number; totalFulfilled: number }>();
        (itemStats || []).forEach((row: any) => {
          const curr = statsMap.get(row.sale_id) || { totalQty: 0, totalFulfilled: 0 };
          curr.totalQty += Number(row.quantity) || 0;
          curr.totalFulfilled += Number(row.quantity_fulfilled) || 0;
          statsMap.set(row.sale_id, curr);
        });

        mappedItems.forEach((s: any) => {
          if (statsMap.has(s.id)) {
            const { totalQty, totalFulfilled } = statsMap.get(s.id)!;
            if (totalFulfilled === 0) {
              s.fulfillmentStatus = 'NOT HANDED OVER';
            } else if (totalFulfilled >= totalQty && totalQty > 0) {
              s.fulfillmentStatus = 'HANDED OVER';
            } else {
              s.fulfillmentStatus = 'PARTIALLY HANDED OVER';
            }
          }
        });
      } catch (fErr) {
        console.warn('[getUnifiedSalesTrackerAction] Failed to batch load fulfillment stats:', fErr);
      }
    }

    const totalCount = items.length > 0 ? Number(items[0].total_count) : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return {
      success: true,
      data: mappedItems,
      total: totalCount,
      page,
      pageSize: limit,
      totalPages
    };
  } catch (err: any) {
    console.error('Unified sales tracker error:', err);
    return { success: false, error: err.message || 'Failed to fetch unified sales.' };
  }
}

export async function getOutstandingReceivablesAction(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: string;
  sort?: string;
}) {
  const perm = await checkPermission('orders', 'read');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Read permission required.' };
  }

  const {
    page = 1,
    pageSize = 50,
    search = '',
    filter = 'all',
    sort = 'due_asc',
  } = params || {};

  const limit = Math.max(1, Math.min(pageSize, 100));
  const offset = Math.max(0, (page - 1) * limit);

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase.rpc('admin_get_outstanding_receivables', {
      p_search: search,
      p_filter: filter,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) throw error;

    const items = (data || []).map((row: any) => ({
      id: row.id,
      invoice_number: row.invoice_number,
      receipt_number: row.receipt_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      customer_name: row.customer_name,
      customer_company: row.customer_company || null,
      customer_phone: row.customer_phone,
      customer_email: row.customer_email,
      items_count: Number(row.items_count) || 1,
      invoice_total: Number(row.invoice_total) || 0,
      cleared_paid: Number(row.cleared_paid) || 0,
      pending_clearance: Number(row.pending_clearance) || 0,
      balance_due: Number(row.balance_due) || 0,
      available_to_record: Number(row.available_to_record) || 0,
      payment_status: row.payment_status,
      collection_status: row.collection_status,
      days_overdue: Number(row.days_overdue) || 0,
      aging_bucket: row.aging_bucket,
      payment_terms: row.payment_terms,
      total_count: Number(row.total_count) || 0,
    }));

    const totalCount = items.length > 0 ? items[0].total_count : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return {
      success: true,
      data: items,
      total: totalCount,
      page,
      pageSize: limit,
      totalPages,
    };
  } catch (err: any) {
    console.error('getOutstandingReceivablesAction error:', err);
    return { success: false, error: err.message || 'Failed to fetch outstanding receivables.' };
  }
}

export async function getOutstandingReceivablesMetricsAction(search = '') {
  const perm = await checkPermission('orders', 'read');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Read permission required.' };
  }

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase.rpc('admin_get_outstanding_receivables_metrics', {
      p_search: search,
    });

    if (error) throw error;

    const row = data && data[0] ? data[0] : null;
    return {
      success: true,
      data: {
        total_outstanding: Number(row?.total_outstanding) || 0,
        total_invoices: Number(row?.total_invoices) || 0,
        unpaid_amount: Number(row?.unpaid_amount) || 0,
        unpaid_count: Number(row?.unpaid_count) || 0,
        balance_pending_amount: Number(row?.balance_pending_amount) || 0,
        balance_pending_count: Number(row?.balance_pending_count) || 0,
        pending_cheques: Number(row?.pending_cheques) || 0,
        pending_cheques_count: Number(row?.pending_cheques_count) || 0,
        due_today_amount: Number(row?.due_today_amount) || 0,
        due_today_count: Number(row?.due_today_count) || 0,
        due_next_7_days_amount: Number(row?.due_next_7_days_amount) || 0,
        due_next_7_days_count: Number(row?.due_next_7_days_count) || 0,
        overdue_amount: Number(row?.overdue_amount) || 0,
        overdue_count: Number(row?.overdue_count) || 0,
        overdue_30_plus_amount: Number(row?.overdue_30_plus_amount) || 0,
        overdue_30_plus_count: Number(row?.overdue_30_plus_count) || 0,
      },
    };
  } catch (err: any) {
    console.error('getOutstandingReceivablesMetricsAction error:', err);
    return { success: false, error: err.message || 'Failed to fetch receivables metrics.' };
  }
}

export async function getUnifiedSalesMetricsAction(params?: {
  search?: string;
  source?: string;
  paymentStatus?: string;
  status?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
}) {
  const perm = await checkPermission('orders', 'read');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Read orders permission required.' };
  }

  const {
    search = '',
    source = 'All',
    paymentStatus = 'All',
    status = 'All',
    paymentMethod = 'All',
    dateFrom,
    dateTo,
    minAmount,
    maxAmount
  } = params || {};

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase.rpc('admin_get_unified_sales_metrics', {
      p_search: search,
      p_source: source,
      p_payment_status: paymentStatus,
      p_status: status,
      p_payment_method: paymentMethod,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_min_amount: minAmount ?? null,
      p_max_amount: maxAmount ?? null
    });

    if (error) throw error;

    const metrics = data?.[0] || {
      total_revenue: 0,
      pos_revenue: 0,
      online_revenue: 0,
      paid_transactions: 0,
      paid_pos_transactions: 0,
      paid_online_transactions: 0,
      outstanding_amount: 0,
      outstanding_transactions: 0,
      returned_refunded_count: 0,
      average_paid_transaction: 0,
      total_transactions: 0
    };

    return { success: true, data: metrics };
  } catch (err: any) {
    console.error('Unified sales metrics error:', err);
    return { success: false, error: err.message || 'Failed to fetch sales metrics.' };
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
    const cleanEmail = email?.trim();
    const cleanPhone = phone?.trim();
    const cleanCompany = companyName?.trim();

    if (!cleanEmail && !cleanPhone && !cleanCompany) {
      return { success: false, error: 'At least one dealer identifier is required.', data: [] };
    }

    const supabase = getAdminSupabase();
    let query = supabase.from('sales').select('*').order('created_at', { ascending: false });

    const orClauses: string[] = [];
    const STRICT_EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (cleanEmail && STRICT_EMAIL_REGEX.test(cleanEmail) && !/[,()"]/.test(cleanEmail)) {
      orClauses.push(`customer_email.eq.${cleanEmail}`);
    }
    if (cleanPhone) {
      const sanitizedPhone = cleanPhone.replace(/[^0-9+]/g, '');
      if (sanitizedPhone) {
        orClauses.push(`customer_phone.eq.${sanitizedPhone}`);
      }
    }
    if (cleanCompany) {
      const sanitizedCompany = cleanCompany.replace(/[,()"]/g, '').trim();
      if (sanitizedCompany) {
        orClauses.push(`customer_name.ilike.%${sanitizedCompany}%`);
      }
    }

    if (orClauses.length === 0) {
      return { success: false, error: 'Valid dealer identifiers are required.', data: [] };
    }

    query = query.or(orClauses.join(','));
    const { data: sales, error: salesErr } = await query;
    if (salesErr) throw salesErr;

    if (!sales || sales.length === 0) {
      return { success: true, data: [] };
    }

    const saleIds = sales.map((s: any) => s.id);
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('*')
      .in('sale_id', saleIds);

    const itemsBySaleId = new Map<string, any[]>();
    for (const item of (saleItems || [])) {
      if (!itemsBySaleId.has(item.sale_id)) itemsBySaleId.set(item.sale_id, []);
      itemsBySaleId.get(item.sale_id)!.push(item);
    }

    const mapped: DealerSaleRecord[] = sales.map((s: any) => ({
      id: s.id,
      created: s.created_at || s.created,
      receipt_number: s.receipt_number,
      date: s.date || s.created_at,
      customer_name: s.customer_name,
      customer_email: s.customer_email,
      customer_phone: s.customer_phone,
      payment_method: s.payment_method,
      subtotal: s.subtotal,
      tax_amount: s.tax_amount,
      discount: s.discount,
      total: s.total,
      items: (itemsBySaleId.get(s.id) || []).map((it: any) => ({
        product_name: it.product_name,
        name: it.product_name,
        quantity: it.quantity,
        qty: it.quantity,
        unit_price: it.unit_price,
        price: it.unit_price,
        item_discount: it.item_discount,
        line_total: it.line_total,
      })),
    }));

    return { success: true, data: mapped };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch dealer purchase history.', data: [] };
  }
}

export interface GetAdminProductsInput {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  status?: string;
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
  sort?: string;
}

export async function getAdminProductAction(id: string) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized' };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('products')
      .select('*, categories:category_id(id, name), brands:brand_id(id, name)')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Normalize in standard UI format matching the frontend expectation
    return {
      success: true,
      data: {
        ...data,
        discountPrice: data.discount_price,
        wholesalePrice: data.wholesale_price,
        countInStock: data.count_in_stock,
        isFeatured: data.is_featured,
        isPreOrder: data.is_pre_order,
        numReviews: data.num_reviews,
        category: data.categories?.name || data.category_id || '',
        brand: data.brands?.name || data.brand_id || '',
        categoryId: data.category_id,
        brandId: data.brand_id,
        inventoryTrackingType: (data.inventory_tracking_type as 'counter' | 'unit') || 'counter',
      }
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getAdminProductsAction(input: GetAdminProductsInput = {}) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) {
    console.log('[getAdminProductsAction] Unauthorized: missing products:read permission');
    return { success: false, error: 'Unauthorized.', data: [] };
  }

  try {
    const {
      page = 1,
      pageSize = 50,
      search = '',
      categoryId,
      brandId,
      status,
      stockStatus,
      sort
    } = input;

    const supabase = getAdminSupabase();

    // Omit heavy fields: description, specs, badges unless needed in list view
    let query = supabase
      .from('products')
      .select(`
        id, name, slug, price, discount_price,
        count_in_stock, status, is_featured, is_pre_order,
        images, category_id, brand_id, created_at,
        inventory_tracking_type,
        categories:category_id(id, name),
        brands:brand_id(id, name)
      `, { count: 'exact' });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }
    if (brandId) {
      query = query.eq('brand_id', brandId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (stockStatus) {
      if (stockStatus === 'in_stock') {
        query = query.gt('count_in_stock', 10);
      } else if (stockStatus === 'low_stock') {
        query = query.gt('count_in_stock', 0).lte('count_in_stock', 10);
      } else if (stockStatus === 'out_of_stock') {
        query = query.eq('count_in_stock', 0);
      }
    }

    if (sort === 'price_asc') {
      query = query.order('price', { ascending: true });
    } else if (sort === 'price_desc') {
      query = query.order('price', { ascending: false });
    } else if (sort === 'stock_asc') {
      query = query.order('count_in_stock', { ascending: true });
    } else if (sort === 'stock_desc') {
      query = query.order('count_in_stock', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error('[getAdminProductsAction] DB Error:', error);
      throw error;
    }

    const normalized = (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      images: Array.isArray(p.images) ? p.images : [],
      price: p.price || 0,
      discountPrice: p.discount_price ?? null,
      countInStock: p.count_in_stock ?? 0,
      status: p.status,
      category: p.categories?.name || p.category_id || '',
      brand: p.brands?.name || p.brand_id || '',
      categoryId: p.category_id,
      brandId: p.brand_id,
      isFeatured: p.is_featured || false,
      isPreOrder: p.is_pre_order || false,
      createdAt: p.created_at,
      inventoryTrackingType: (p.inventory_tracking_type as 'counter' | 'unit') || 'counter',
    }));

    return {
      success: true,
      data: normalized,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  } catch (err: any) {
    console.error('[getAdminProductsAction] Catch:', err);
    return { success: false, error: err.message || 'Failed to fetch products.', data: [] };
  }
}

export async function getLowStockProductsCountAction(threshold = 5) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) {
    return { success: false, error: 'Unauthorized.', count: 0 };
  }

  try {
    const supabase = getAdminSupabase();
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .lte('count_in_stock', threshold);

    if (error) {
      console.error('[getLowStockProductsCountAction] DB Error:', error);
      throw error;
    }

    return { success: true, count: count ?? 0 };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to count low stock products.', count: 0 };
  }
}

export async function getAdminProductByIdAction(id: string) {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: null };

  try {
    const supabase = getAdminSupabase();
    const { data: rawProd, error } = await supabase
      .from('products')
      .select(`*, categories:category_id(id, name), brands:brand_id(id, name)`)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!rawProd) return { success: false, error: 'Product not found.', data: null };

    const normalized = {
      id: rawProd.id,
      name: rawProd.name,
      slug: rawProd.slug,
      description: rawProd.description || '',
      images: Array.isArray(rawProd.images) ? rawProd.images : [],
      price: rawProd.price || 0,
      discountPrice: rawProd.discount_price ?? null,
      discount_price: rawProd.discount_price ?? null,
      specs: rawProd.specs || {},
      rating: rawProd.rating || 0,
      numReviews: rawProd.num_reviews || 0,
      countInStock: rawProd.count_in_stock ?? 0,
      count_in_stock: rawProd.count_in_stock ?? 0,
      category: rawProd.categories?.name || '',
      brand: rawProd.brands?.name || '',
      category_id: rawProd.category_id,
      brand_id: rawProd.brand_id,
      currency: rawProd.currency || 'LKR',
      badges: rawProd.badges || [],
      is_featured: rawProd.is_featured || false,
      createdAt: rawProd.created_at,
      created_at: rawProd.created_at,
      updated_at: rawProd.updated_at,
    };

    return { success: true, data: normalized };
  } catch (err: any) {
    console.error('[getAdminProductByIdAction] Error:', err);
    return { success: false, error: err.message || 'Failed to fetch product.', data: null };
  }
}



export async function getAdminCategoriesAction() {
  const check = await checkPermission('categories', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch admin categories.', data: [] };
  }
}

export async function getAdminBrandsAction() {
  const check = await checkPermission('brands', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch admin brands.', data: [] };
  }
}

// ─── Quotations Actions ─────────────────────────────────────────────────────────

export interface GetAdminQuotationsInput {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  quoteType?: string;
  sort?: string;
}

export async function getQuotationsAction(input: GetAdminQuotationsInput = {}) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const {
      page = 1,
      pageSize = 50,
      search = '',
      status,
      quoteType,
      sort
    } = input;

    const supabase = getAdminSupabase();
    const from = (page - 1) * pageSize;

    const { data, error } = await supabase.rpc('admin_get_unified_quotations', {
      p_search: search || '',
      p_status: status ? (status === 'all' ? 'All' : status) : 'All',
      p_quote_type: quoteType || 'all',
      p_sort: sort || 'newest',
      p_limit: pageSize,
      p_offset: from,
    });

    if (error) throw error;

    const rows = (data || []) as any[];
    const totalCount = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

    return {
      success: true,
      data: rows,
      total: totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch quotations.', data: [] };
  }
}

export async function getQuotationsMetricsAction() {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase.rpc('admin_get_unified_quotations_metrics');
    if (error) throw error;

    const m = (data && data[0]) || {
      total_quotations: 0,
      wholesale_count: 0,
      direct_count: 0,
      total_quoted_value: 0,
      active_pipeline_value: 0,
      converted_value: 0,
    };

    return {
      success: true,
      data: {
        totalQuotations: Number(m.total_quotations || 0),
        wholesaleCount: Number(m.wholesale_count || 0),
        directCount: Number(m.direct_count || 0),
        totalQuotedValue: Number(m.total_quoted_value || 0),
        activePipelineValue: Number(m.active_pipeline_value || 0),
        convertedValue: Number(m.converted_value || 0),
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch quotation metrics.' };
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
    items: Array<{
      product_id?: string | null;
      productId?: string | null;
      name: string;
      qty: number;
      unitPrice: number;
      discount?: number;
      total?: number;
    }>;
    subtotal: number;
    tax_amount?: number;
    discount_amount?: number;
    discount_type?: 'flat' | 'percent';
    discount_value?: number;
    total_amount: number;
    valid_until: string;
    status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'voided';
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
        await pbCustomers.create({
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

    if (!Array.isArray(data.items) || data.items.length === 0) {
      return { success: false, error: 'Quotation must have at least one line item.' };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const catalogProductIdsToVerify = new Set<string>();

    for (const item of data.items) {
      if (!item.name?.trim()) {
        return { success: false, error: 'Every item in the quotation must have a name.' };
      }
      const qty = Number(item.qty);
      if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(qty)) {
        return {
          success: false,
          error: `Invalid quantity "${item.qty}" for item "${item.name}". Quantity must be a positive finite integer.`,
        };
      }
      const unitPrice = Number(item.unitPrice);
      if (isNaN(unitPrice) || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return { success: false, error: `Invalid unit price for item "${item.name}".` };
      }

      const rawPid = item.product_id ?? (item as any).productId;
      if (rawPid !== undefined && rawPid !== null && rawPid !== '') {
        if (typeof rawPid !== 'string' || !uuidRegex.test(rawPid.trim())) {
          return {
            success: false,
            error: `Invalid catalog product ID for item "${item.name}". Must be a valid UUID.`,
          };
        }
        catalogProductIdsToVerify.add(rawPid.trim());
      }
    }

    const supabase = getAdminSupabase();

    if (catalogProductIdsToVerify.size > 0) {
      const { data: existingProducts, error: prodErr } = await supabase
        .from('products')
        .select('id')
        .in('id', Array.from(catalogProductIdsToVerify));

      if (prodErr) {
        return { success: false, error: 'Failed to verify catalog product references.' };
      }

      const foundIdSet = new Set((existingProducts || []).map((p) => p.id));
      for (const pId of catalogProductIdsToVerify) {
        if (!foundIdSet.has(pId)) {
          return {
            success: false,
            error: `Catalog product (${pId}) does not exist in the product catalog.`,
          };
        }
      }
    }

    const validatedItems = data.items.map((item) => {
      const safeQty = Math.floor(Number(item.qty));
      const safePrice = Math.max(0, Number(item.unitPrice) || 0);
      const rawPid = item.product_id ?? (item as any).productId;
      const cleanPid = rawPid && typeof rawPid === 'string' && uuidRegex.test(rawPid.trim()) ? rawPid.trim() : null;
      return {
        ...item,
        product_id: cleanPid,
        name: item.name.trim(),
        qty: safeQty,
        unitPrice: safePrice,
        total: safeQty * safePrice,
      };
    });

    const rawTax = Number(data.tax_amount || 0);
    const safeTax = Number.isFinite(rawTax) ? Math.max(0, Math.round(rawTax)) : 0;

    const subtotal = Math.round(
      validatedItems.reduce((acc, item) => acc + item.qty * item.unitPrice, 0)
    );
    const discType = data.discount_type || 'flat';
    const rawDiscVal = Number(data.discount_value !== undefined ? data.discount_value : (data.discount_amount || 0));
    const safeDiscVal = isNaN(rawDiscVal) || !isFinite(rawDiscVal) ? 0 : Math.max(0, rawDiscVal);

    let calculatedDiscount = 0;
    let clampedDiscountValue = safeDiscVal;
    if (discType === 'percent') {
      clampedDiscountValue = Math.min(safeDiscVal, 100);
      calculatedDiscount = Math.round((subtotal * clampedDiscountValue) / 100);
    } else {
      clampedDiscountValue = Math.min(safeDiscVal, subtotal);
      calculatedDiscount = Math.round(clampedDiscountValue);
    }
    calculatedDiscount = Math.min(Math.max(calculatedDiscount, 0), subtotal);
    const totalAmount = Math.max(0, Math.round(subtotal - calculatedDiscount + safeTax));

    const { createDealerIfNew, createCustomerIfNew, quote_type, dealer_id, ...payloadData } = data;
    const payload = {
      ...payloadData,
      items: validatedItems,
      subtotal,
      tax_amount: safeTax,
      discount_amount: calculatedDiscount,
      discount_type: discType,
      discount_value: clampedDiscountValue,
      total_amount: totalAmount,
    };
    let record;
    if (existingId) {
      const { data: existingQuote, error: exErr } = await supabase
        .from('quotations')
        .select('*')
        .eq('id', existingId)
        .single();

      if (exErr || !existingQuote) {
        return { success: false, error: 'Quotation not found.' };
      }

      // Check if already converted
      const { data: linkedSale } = await supabase
        .from('sales')
        .select('id, invoice_number')
        .or(`quotation_id.eq.${existingId},notes.eq.Converted from Quotation #${existingQuote.quote_number}`)
        .limit(1)
        .maybeSingle();

      if (linkedSale) {
        return {
          success: false,
          error: `Converted quotations are immutable and cannot be edited. Commercial invoice #${linkedSale.invoice_number || linkedSale.id} has already been issued.`,
        };
      }

      // Check terminal states
      if (existingQuote.status === 'voided' || existingQuote.voided_at) {
        return { success: false, error: 'Voided quotations cannot be edited.' };
      }
      if (existingQuote.status === 'rejected') {
        return { success: false, error: 'Rejected quotations cannot be edited.' };
      }
      if (existingQuote.status === 'expired' || (existingQuote.valid_until && new Date(existingQuote.valid_until).getTime() < Date.now())) {
        return { success: false, error: 'Expired quotations cannot be edited. Please create a new quotation.' };
      }
      if (existingQuote.status === 'accepted') {
        return {
          success: false,
          error: 'Accepted quotations cannot be edited. Commercial terms are locked awaiting invoice issuance.',
        };
      }

      // Protect quote_number: never allow client to change historical quote number
      payload.quote_number = existingQuote.quote_number;

      record = await pbQuotations.update(existingId, payload);

      await writeAuditLog(
        check.actorEmail || 'Admin User',
        'update',
        'quotations',
        existingId,
        {
          subtotal: existingQuote.subtotal,
          total_amount: existingQuote.total_amount,
          customer_name: existingQuote.customer_name,
          customer_company: existingQuote.customer_company,
        },
        {
          subtotal: payload.subtotal,
          total_amount: payload.total_amount,
          customer_name: payload.customer_name,
          customer_company: payload.customer_company,
        },
        { ip: check.ip, userAgent: check.userAgent }
      );
    } else {
      record = await pbQuotations.create(payload);

      await writeAuditLog(
        check.actorEmail || 'Admin User',
        'create',
        'quotations',
        record.id,
        undefined,
        {
          quote_number: payload.quote_number,
          customer_name: payload.customer_name,
          customer_company: payload.customer_company,
          total_amount: payload.total_amount,
          status: payload.status,
        },
        { ip: check.ip, userAgent: check.userAgent }
      );
    }
    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');
    return { success: true, data: structuredClone(record) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save quotation.' };
  }
}

export async function deleteQuotationAction(id: string) {
  const check = await checkPermission('orders', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();
    // 1. Fetch quotation to verify status
    const { data: quote, error: fetchErr } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !quote) {
      return { success: false, error: 'Quotation not found.' };
    }

    // 2. Strict status check: Only unissued draft quotations can be deleted
    if (quote.status !== 'draft') {
      return {
        success: false,
        error: `Only unissued draft quotations can be deleted. This quotation is "${quote.status}". Issued quotations must be voided to preserve commercial audit history.`,
      };
    }

    // 3. Double-check no linked sale exists
    const { data: linkedSale } = await supabase
      .from('sales')
      .select('id, invoice_number')
      .or(`quotation_id.eq.${id},notes.eq.Converted from Quotation #${quote.quote_number}`)
      .limit(1)
      .maybeSingle();

    if (linkedSale) {
      return {
        success: false,
        error: `Cannot delete quotation: an invoice (${linkedSale.invoice_number || linkedSale.id}) has already been issued from it.`,
      };
    }

    await pbQuotations.delete(id);

    await writeAuditLog(
      check.actorEmail || 'Admin User',
      'delete',
      'quotations',
      id,
      { quote_number: quote.quote_number, customer_name: quote.customer_name, total_amount: quote.total_amount },
      undefined,
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete quotation.' };
  }
}

export async function convertQuotationToSaleAction(
  quoteId: string,
  paymentMethod?: PaymentMethod | null,
  amountPaid?: number,
  chequeDetails?: {
    chequeNumber?: string;
    chequeDate?: string;
    bankName?: string;
    notes?: string;
  },
  terms: PaymentTerms = 'due_on_receipt',
  dueDate?: string
) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const quote = await pbQuotations.getById(quoteId);
    if (!quote) return { success: false, error: 'Quotation not found.' };

    const supabase = getAdminSupabase();

    // Check if already converted via durable FK or legacy fallback
    const { data: existingSale } = await supabase
      .from('sales')
      .select('id, invoice_number')
      .or(`quotation_id.eq.${quoteId},notes.eq.Converted from Quotation #${quote.quote_number}`)
      .limit(1)
      .maybeSingle();

    if (existingSale) {
      return {
        success: false,
        error: `This quotation has already been converted to invoice #${existingSale.invoice_number || existingSale.id}.`,
      };
    }

    if (quote.status === 'draft') {
      return {
        success: false,
        error: 'Draft quotations cannot be converted directly to an invoice. The quotation must first be formally issued to become Active.',
      };
    }
    if (quote.status === 'voided' || (quote as any).voided_at) {
      return { success: false, error: 'Cannot convert a voided quotation.' };
    }
    if (quote.status === 'rejected') {
      return { success: false, error: 'Cannot convert a rejected quotation.' };
    }
    if (quote.status === 'expired' || (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now())) {
      return { success: false, error: 'Cannot convert an expired quotation. Please create a new quotation.' };
    }

    // Verify that all catalog-backed products referenced in the quotation still exist
    const quoteItems: any[] = Array.isArray(quote.items) ? quote.items : [];
    const catalogProductIds = quoteItems
      .map((it: any) => it.product_id || it.productId)
      .filter((pid: any) => pid && typeof pid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pid.trim()))
      .map((pid: any) => pid.trim());

    if (catalogProductIds.length > 0) {
      const { data: existingProds, error: epErr } = await supabase
        .from('products')
        .select('id')
        .in('id', catalogProductIds);

      if (epErr) {
        return { success: false, error: 'Failed to verify quotation catalog products.' };
      }

      const existingSet = new Set((existingProds || []).map((p) => p.id));
      for (const pid of catalogProductIds) {
        if (!existingSet.has(pid)) {
          return {
            success: false,
            error: 'Quotation contains a catalog product that is no longer available. Please update the quotation before issuing the invoice.',
          };
        }
      }
    }

    const authTotal = Number(quote.total_amount) || 0;
    const effectiveAmountPaid = amountPaid !== undefined ? Number(amountPaid) : 0;

    if (isNaN(effectiveAmountPaid) || !Number.isFinite(effectiveAmountPaid) || effectiveAmountPaid < 0) {
      return { success: false, error: 'Valid non-negative amount paid is required.' };
    }

    if (effectiveAmountPaid > authTotal) {
      return {
        success: false,
        error: `Amount paid cannot exceed quotation total of LKR ${authTotal.toLocaleString()}.`,
      };
    }

    if (effectiveAmountPaid > 0) {
      if (!paymentMethod) {
        return { success: false, error: 'Payment method is required when recording an initial payment.' };
      }
      if (paymentMethod === 'cheque') {
        if (!chequeDetails?.chequeNumber?.trim()) {
          return { success: false, error: 'Cheque number is required for cheque payments.' };
        }
        if (!chequeDetails?.chequeDate) {
          return { success: false, error: 'Cheque date is required for cheque payments.' };
        }
        if (!chequeDetails?.bankName?.trim()) {
          return { success: false, error: 'Bank name is required for cheque payments.' };
        }
      }
    }

    // Resolve authenticated staff profile display name according to authoritative 5-tier fallback:
    // 1. non-empty profiles.name
    // 2. authenticated user_metadata.full_name
    // 3. authenticated user_metadata.name
    // 4. authenticated email
    // 5. safe generic fallback such as "Admin Staff"
    let staffDisplayName = 'Admin Staff';
    if (check.actorId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', check.actorId)
        .maybeSingle();

      const profileName = profile?.name?.trim();
      let metaFullName: string | undefined;
      let metaName: string | undefined;

      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(check.actorId);
        metaFullName = authUser?.user?.user_metadata?.full_name?.trim();
        metaName = authUser?.user?.user_metadata?.name?.trim();
      } catch {
        // Fallback gracefully if admin auth call is restricted
      }

      staffDisplayName =
        (profileName && profileName.length > 0 ? profileName : undefined) ||
        (metaFullName && metaFullName.length > 0 ? metaFullName : undefined) ||
        (metaName && metaName.length > 0 ? metaName : undefined) ||
        (check.actorEmail && check.actorEmail.trim().length > 0 ? check.actorEmail.trim() : undefined) ||
        'Admin Staff';
    }

    const { data, error } = await supabase.rpc('convert_quotation_to_sale_atomic', {
      p_quote_id: quoteId,
      p_actor_id: check.actorId || null,
      p_actor_name: staffDisplayName,
      p_payment_method: effectiveAmountPaid > 0 ? (paymentMethod || null) : null,
      p_amount: effectiveAmountPaid,
      p_cheque_number: (effectiveAmountPaid > 0 && paymentMethod === 'cheque') ? (chequeDetails?.chequeNumber?.trim() || null) : null,
      p_cheque_date: (effectiveAmountPaid > 0 && paymentMethod === 'cheque') ? (chequeDetails?.chequeDate || null) : null,
      p_bank_name: (effectiveAmountPaid > 0 && paymentMethod === 'cheque') ? (chequeDetails?.bankName?.trim() || null) : null,
      p_cheque_notes: (effectiveAmountPaid > 0 && paymentMethod === 'cheque') ? (chequeDetails?.notes || null) : null,
      p_payment_terms: terms || 'due_on_receipt',
      p_due_date: dueDate || null,
    });

    if (error || !data?.success) {
      return {
        success: false,
        error: error?.message || data?.error || 'Failed to issue invoice from quotation.',
      };
    }

    await writeAuditLog(
      staffDisplayName || check.actorEmail || 'Admin User',
      'convert',
      'quotations',
      quoteId,
      { status: quote.status },
      { status: 'converted', saleId: data.sale_id, invoiceNumber: data.invoice_number },
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');
    revalidatePath('/admin/finance/outstanding');
    return {
      success: true,
      saleId: data.sale_id,
      receiptNumber: data.receipt_number,
      invoiceNumber: data.invoice_number,
      paymentId: data.payment_id,
      summary: data.summary,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to issue invoice from quotation.' };
  }
}

export async function voidQuotationAction(payload: {
  quoteId?: string;
  quotationId?: string;
  reason: QuotationVoidReason | string;
  notes?: string;
}) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const targetId = payload.quoteId || payload.quotationId;
    if (!targetId) {
      return { success: false, error: 'Quotation ID is required.' };
    }
    const cleanReason = (payload.reason || '').trim().toUpperCase();
    if (!cleanReason) {
      return { success: false, error: 'A valid reason is required to void a quotation.' };
    }
    if (cleanReason === 'OTHER' && (!payload.notes || !payload.notes.trim())) {
      return { success: false, error: 'Notes are required when selecting reason "Other".' };
    }

    const supabase = getAdminSupabase();
    const actor = check.actorEmail || 'Admin User';

    const { data, error } = await supabase.rpc('void_quotation_atomic', {
      p_quote_id: targetId,
      p_reason: cleanReason,
      p_notes: payload.notes?.trim() || null,
      p_voided_by: actor,
    });

    if (error || !data?.success) {
      return {
        success: false,
        error: error?.message || data?.error || 'Failed to void quotation.',
      };
    }

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');

    await writeAuditLog(
      actor,
      'void',
      'quotations',
      targetId,
      { status: 'active' },
      { status: 'voided', reason: cleanReason, notes: payload.notes },
      { ip: check.ip, userAgent: check.userAgent }
    );

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to void quotation.' };
  }
}

export async function issueQuotationAction(quotationId: string) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();

    // 1. Fetch quotation to verify current persisted status
    const { data: quote, error: fetchErr } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .single();

    if (fetchErr || !quote) {
      return { success: false, error: 'Quotation not found.' };
    }

    // 2. Strict status check: Only draft quotations can be issued
    if (quote.status !== 'draft') {
      return {
        success: false,
        error: 'Only draft quotations can be issued.',
      };
    }

    // 3. Verify quotation is NOT converted
    const { data: linkedSale } = await supabase
      .from('sales')
      .select('id, invoice_number')
      .or(`quotation_id.eq.${quotationId},notes.eq.Converted from Quotation #${quote.quote_number}`)
      .limit(1)
      .maybeSingle();

    if (linkedSale) {
      return {
        success: false,
        error: `This quotation has already been converted to invoice #${linkedSale.invoice_number || linkedSale.id}.`,
      };
    }

    // 4. Verify quotation is NOT voided
    if (quote.status === 'voided' || quote.voided_at) {
      return { success: false, error: 'Cannot issue a voided quotation.' };
    }

    // 5. Update status to 'sent' (Active)
    const { data: updated, error: updateErr } = await supabase
      .from('quotations')
      .update({
        status: 'sent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 6. Record authoritative audit event
    await writeAuditLog(
      check.actorEmail || 'Admin User',
      'issue',
      'quotations',
      quotationId,
      { status: 'draft' },
      {
        status: 'sent',
        quote_number: quote.quote_number,
        total_amount: quote.total_amount,
        customer_name: quote.customer_name,
        customer_company: quote.customer_company,
      },
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');
    return { success: true, data: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to issue quotation.' };
  }
}

export async function acceptQuotationAction(quotationId: string) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();

    // 1. Fetch quotation
    const { data: quote, error: fetchErr } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .single();

    if (fetchErr || !quote) {
      return { success: false, error: 'Quotation not found.' };
    }

    // 2. Reject if draft (must be issued first)
    if (quote.status === 'draft') {
      return {
        success: false,
        error: 'Draft quotations must be issued before they can be marked as accepted.',
      };
    }

    // 3. Reject if already accepted
    if (quote.status === 'accepted') {
      return {
        success: false,
        error: 'Quotation is already marked as accepted.',
      };
    }

    // 4. Reject if terminal or invalid
    if (quote.status === 'voided' || quote.voided_at) {
      return { success: false, error: 'Cannot accept a voided quotation.' };
    }
    if (quote.status === 'rejected') {
      return { success: false, error: 'Cannot accept a rejected quotation.' };
    }
    if (quote.status === 'expired' || (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now())) {
      return { success: false, error: 'Cannot accept an expired quotation. Please create a new quotation.' };
    }

    // 5. Verify no linked sale exists
    const { data: linkedSale } = await supabase
      .from('sales')
      .select('id, invoice_number')
      .or(`quotation_id.eq.${quotationId},notes.eq.Converted from Quotation #${quote.quote_number}`)
      .limit(1)
      .maybeSingle();

    if (linkedSale) {
      return {
        success: false,
        error: `This quotation has already been converted to invoice #${linkedSale.invoice_number || linkedSale.id}.`,
      };
    }

    // 6. Update status to 'accepted'
    const { data: updated, error: updateErr } = await supabase
      .from('quotations')
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 7. Record authoritative audit event
    await writeAuditLog(
      check.actorEmail || 'Admin User',
      'accept',
      'quotations',
      quotationId,
      { status: quote.status },
      {
        status: 'accepted',
        quote_number: quote.quote_number,
        total_amount: quote.total_amount,
        customer_name: quote.customer_name,
      },
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');
    return { success: true, data: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to mark quotation as accepted.' };
  }
}

export async function rejectQuotationAction(quotationId: string, reason?: string) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();

    // 1. Fetch quotation
    const { data: quote, error: fetchErr } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .single();

    if (fetchErr || !quote) {
      return { success: false, error: 'Quotation not found.' };
    }

    // 2. Reject if terminal or already rejected/voided
    if (quote.status === 'rejected') {
      return { success: false, error: 'Quotation is already marked as rejected.' };
    }
    if (quote.status === 'voided' || quote.voided_at) {
      return { success: false, error: 'Cannot reject a voided quotation.' };
    }
    if (quote.status === 'expired' || (quote.valid_until && new Date(quote.valid_until).getTime() < Date.now())) {
      return { success: false, error: 'Cannot reject an already expired quotation.' };
    }

    // 3. Verify no linked sale exists
    const { data: linkedSale } = await supabase
      .from('sales')
      .select('id, invoice_number')
      .or(`quotation_id.eq.${quotationId},notes.eq.Converted from Quotation #${quote.quote_number}`)
      .limit(1)
      .maybeSingle();

    if (linkedSale) {
      return {
        success: false,
        error: `Cannot reject quotation: an invoice (#${linkedSale.invoice_number || linkedSale.id}) has already been issued from it.`,
      };
    }

    // 4. Only active ('sent') or accepted quotations can be rejected
    if (quote.status !== 'sent' && quote.status !== 'accepted') {
      return {
        success: false,
        error: `Only active or accepted quotations can be marked as rejected. Current status is "${quote.status}".`,
      };
    }

    // 5. Update status to 'rejected'
    const { data: updated, error: updateErr } = await supabase
      .from('quotations')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId)
      .select()
      .single();

    if (updateErr) {
      throw updateErr;
    }

    // 6. Record authoritative audit event
    await writeAuditLog(
      check.actorEmail || 'Admin User',
      'reject',
      'quotations',
      quotationId,
      { status: quote.status },
      {
        status: 'rejected',
        quote_number: quote.quote_number,
        total_amount: quote.total_amount,
        reason: reason?.trim() || null,
      },
      { ip: check.ip, userAgent: check.userAgent }
    );

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');
    return { success: true, data: updated };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to mark quotation as rejected.' };
  }
}

export async function getQuotationHistoryAction(quotationId: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();

    // 1. Fetch Quotation
    const { data: quotation, error: qErr } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .single();

    if (qErr || !quotation) {
      return { success: false, error: 'Quotation not found.' };
    }

    // 2. Fetch Audit Logs for this quotation
    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .eq('collection', 'quotations')
      .eq('record_id', quotationId)
      .order('created_at', { ascending: true });

    // 3. Fetch Linked Invoice in sales (durable FK or legacy snapshot/notes fallback)
    const { data: linkedSale } = await supabase
      .from('sales')
      .select('*')
      .or(`quotation_id.eq.${quotationId},notes.eq.Converted from Quotation #${quotation.quote_number}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. If linked sale exists, fetch its payments and reversals
    let payments: any[] = [];
    let reversals: any[] = [];
    if (linkedSale) {
      const { data: pData } = await supabase
        .from('sale_payments')
        .select('*')
        .eq('sale_id', linkedSale.id)
        .order('payment_date', { ascending: true });
      payments = pData || [];

      const { data: rData } = await supabase
        .from('sale_payment_reversals')
        .select('*')
        .eq('sale_id', linkedSale.id)
        .order('created_at', { ascending: true });
      reversals = rData || [];
    }

    // 5. Build authoritative timeline events
    type HistoryTimelineEvent = {
      id: string;
      eventType: string;
      title: string;
      timestamp: string;
      actor?: string;
      details?: Record<string, any>;
      badgeVariant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
    };

    const timeline: HistoryTimelineEvent[] = [];

    // Quotation Created Event
    timeline.push({
      id: `created-${quotation.id}`,
      eventType: 'QUOTATION_CREATED',
      title: `Quotation #${quotation.quote_number} Created`,
      timestamp: quotation.created_at,
      actor: auditLogs?.find((a: any) => a.action === 'create')?.actor || 'Staff',
      details: {
        total: quotation.total_amount,
        itemsCount: Array.isArray(quotation.items) ? quotation.items.length : 0,
        customer: quotation.customer_name,
        company: quotation.customer_company,
      },
      badgeVariant: 'default',
    });

    // Quotation Issued Event (action === 'issue')
    const issueAudit = auditLogs?.find((a: any) => a.action === 'issue');
    if (issueAudit) {
      timeline.push({
        id: `issued-${issueAudit.id}`,
        eventType: 'QUOTATION_ISSUED',
        title: 'Quotation Formally Issued',
        timestamp: issueAudit.created_at,
        actor: issueAudit.actor,
        details: { status: 'sent' },
        badgeVariant: 'info',
      });
    }

    // Quotation Accepted Event (action === 'accept')
    const acceptAudit = auditLogs?.find((a: any) => a.action === 'accept');
    if (acceptAudit) {
      timeline.push({
        id: `accepted-${acceptAudit.id}`,
        eventType: 'QUOTATION_ACCEPTED',
        title: 'Quotation Accepted by Customer',
        timestamp: acceptAudit.created_at,
        actor: acceptAudit.actor,
        details: { status: 'accepted' },
        badgeVariant: 'success',
      });
    }

    // Quotation Rejected Event (action === 'reject')
    const rejectAudit = auditLogs?.find((a: any) => a.action === 'reject');
    if (rejectAudit) {
      timeline.push({
        id: `rejected-${rejectAudit.id}`,
        eventType: 'QUOTATION_REJECTED',
        title: `Quotation Rejected${rejectAudit.new_value?.reason ? ` (${rejectAudit.new_value.reason})` : ''}`,
        timestamp: rejectAudit.created_at,
        actor: rejectAudit.actor,
        details: rejectAudit.new_value,
        badgeVariant: 'destructive',
      });
    }

    // Quotation Updates from audit_log (generic)
    auditLogs
      ?.filter(
        (a: any) =>
          a.action === 'update' &&
          !a.new_value?.recipient &&
          a.new_value?.status !== 'sent' &&
          a.new_value?.status !== 'accepted' &&
          a.new_value?.status !== 'rejected'
      )
      .forEach((a: any) => {
        timeline.push({
          id: `update-${a.id}`,
          eventType: 'QUOTATION_UPDATED',
          title: 'Quotation Updated',
          timestamp: a.created_at,
          actor: a.actor,
          details: a.new_value,
          badgeVariant: 'info',
        });
      });

    // Quotation Emailed Event
    const emailAudit = auditLogs?.find(
      (a: any) => a.action === 'email' || (a.action === 'update' && a.new_value?.recipient)
    );
    if (emailAudit) {
      timeline.push({
        id: `email-${emailAudit.id}`,
        eventType: 'QUOTATION_EMAILED',
        title: 'Quotation Sent via Email',
        timestamp: emailAudit.created_at,
        actor: emailAudit.actor,
        details: { recipient: emailAudit.new_value?.recipient || quotation.customer_email },
        badgeVariant: 'info',
      });
    }

    // Quotation Voided Event
    if (quotation.status === 'voided' || quotation.voided_at) {
      timeline.push({
        id: `voided-${quotation.id}`,
        eventType: 'QUOTATION_VOIDED',
        title: `Quotation Voided (${quotation.void_reason?.replace(/_/g, ' ') || 'Cancelled'})`,
        timestamp: quotation.voided_at || quotation.updated_at,
        actor: quotation.voided_by || 'Staff',
        details: {
          reason: quotation.void_reason,
          notes: quotation.void_notes,
        },
        badgeVariant: 'destructive',
      });
    }

    // Quotation Converted Event
    if (linkedSale) {
      timeline.push({
        id: `converted-${linkedSale.id}`,
        eventType: 'QUOTATION_CONVERTED',
        title: `Converted to Commercial Invoice #${linkedSale.invoice_number}`,
        timestamp: linkedSale.invoiced_at || linkedSale.created_at,
        actor: linkedSale.issued_by_name || linkedSale.cashier_name || 'Admin Staff',
        details: {
          invoiceNumber: linkedSale.invoice_number,
          receiptNumber: linkedSale.receipt_number,
          total: linkedSale.total,
          paymentTerms: linkedSale.payment_terms,
          dueDate: linkedSale.due_date,
        },
        badgeVariant: 'success',
      });

      // Payments Events
      payments.forEach((p: any) => {
        const isCheque = p.payment_method === 'cheque';
        let eventType = 'PAYMENT_RECEIVED';
        let title = `Payment Received — LKR ${Number(p.amount).toLocaleString()} (${p.payment_method.toUpperCase()})`;
        let variant: 'success' | 'warning' | 'destructive' = 'success';

        if (isCheque) {
          if (p.status === 'pending') {
            eventType = 'CHEQUE_RECEIVED';
            title = `Cheque Received — LKR ${Number(p.amount).toLocaleString()} (Cheque #${p.cheque_number})`;
            variant = 'warning';
          } else if (p.status === 'cleared') {
            eventType = 'CHEQUE_CLEARED';
            title = `Cheque Cleared — LKR ${Number(p.amount).toLocaleString()} (Cheque #${p.cheque_number})`;
            variant = 'success';
          } else if (p.status === 'bounced') {
            eventType = 'CHEQUE_BOUNCED';
            title = `Cheque Bounced — LKR ${Number(p.amount).toLocaleString()} (Cheque #${p.cheque_number})`;
            variant = 'destructive';
          } else if (p.status === 'cancelled') {
            eventType = 'CHEQUE_CANCELLED';
            title = `Cheque Cancelled — LKR ${Number(p.amount).toLocaleString()} (Cheque #${p.cheque_number})`;
            variant = 'destructive';
          }
        }

        timeline.push({
          id: `payment-${p.id}`,
          eventType,
          title,
          timestamp: p.cleared_at || p.payment_date || p.created_at,
          actor: p.cleared_by || p.created_by,
          details: {
            amount: p.amount,
            method: p.payment_method,
            status: p.status,
            chequeNumber: p.cheque_number,
            bank: p.bank_name,
            chequeDate: p.cheque_date,
            reference: p.reference,
          },
          badgeVariant: variant,
        });
      });

      // Reversals Events
      reversals.forEach((r: any) => {
        timeline.push({
          id: `reversal-${r.id}`,
          eventType: 'PAYMENT_RETURNED',
          title: `Payment Return / Reversal #${r.reversal_number} — LKR ${Number(r.amount).toLocaleString()}`,
          timestamp: r.created_at,
          actor: r.reversed_by,
          details: {
            amount: r.amount,
            reason: r.reason,
            notes: r.notes,
            reference: r.reference,
          },
          badgeVariant: 'warning',
        });
      });

      // Invoice Revocation Event
      if (linkedSale.invoice_revoked_at) {
        timeline.push({
          id: `revocation-${linkedSale.id}`,
          eventType: 'INVOICE_REVOKED',
          title: `Invoice #${linkedSale.invoice_number} Revoked (${linkedSale.invoice_revoke_reason || 'Document Voided'})`,
          timestamp: linkedSale.invoice_revoked_at,
          actor: linkedSale.invoice_revoked_by,
          details: {
            reason: linkedSale.invoice_revoke_reason,
            notes: linkedSale.invoice_revoke_notes,
          },
          badgeVariant: 'destructive',
        });
      }
    }

    // Sort timeline chronologically (newest first for drawer display)
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Compute linked invoice financial metrics
    let linkedInvoiceSummary: any = null;
    if (linkedSale) {
      const grossCleared = payments
        .filter((p: any) => p.status === 'cleared')
        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const returnedAmount = reversals
        .reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const effectiveCleared = Math.max(0, grossCleared - returnedAmount);
      const pendingClearance = payments
        .filter((p: any) => p.payment_method === 'cheque' && p.status === 'pending')
        .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const invoiceTotal = Number(linkedSale.total || 0);
      const balanceDue = Math.max(0, invoiceTotal - effectiveCleared);

      let pStatus = 'UNPAID';
      if (linkedSale.invoice_revoked_at) pStatus = 'REVOKED';
      else if (linkedSale.status === 'voided') pStatus = 'VOIDED';
      else if (effectiveCleared >= invoiceTotal) pStatus = 'PAID';
      else if (effectiveCleared > 0) pStatus = 'BALANCE PENDING';

      linkedInvoiceSummary = {
        id: linkedSale.id,
        invoiceNumber: linkedSale.invoice_number,
        receiptNumber: linkedSale.receipt_number,
        invoicedAt: linkedSale.invoiced_at || linkedSale.created_at,
        total: invoiceTotal,
        paymentTerms: linkedSale.payment_terms || 'due_on_receipt',
        dueDate: linkedSale.due_date,
        paymentStatus: pStatus,
        isRevoked: Boolean(linkedSale.invoice_revoked_at),
        invoiceRevokedAt: linkedSale.invoice_revoked_at,
        invoiceRevokedBy: linkedSale.invoice_revoked_by,
        invoiceRevokeReason: linkedSale.invoice_revoke_reason,
        effectiveClearedPaid: effectiveCleared,
        pendingClearance,
        balanceDue,
        issuedByName: linkedSale.issued_by_name || linkedSale.cashier_name || 'Admin Staff',
        issuedByProfileId: linkedSale.issued_by_profile_id || null,
      };
    }

    return {
      success: true,
      data: {
        quotation,
        linkedInvoice: linkedInvoiceSummary,
        payments,
        reversals,
        timeline,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch quotation history.' };
  }
}

export async function recordSalePaymentAction(payload: {
  saleId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  chequeNumber?: string;
  chequeDate?: string;
  bankName?: string;
  notes?: string;
}) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    if (!payload.saleId) {
      return { success: false, error: 'Sale ID is required.' };
    }
    const numAmount = Number(payload.amount);
    if (isNaN(numAmount) || !Number.isFinite(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Valid positive payment amount is required.' };
    }

    if (payload.paymentMethod === 'cheque') {
      if (!payload.chequeNumber?.trim()) {
        return { success: false, error: 'Cheque number is required for cheque payments.' };
      }
      if (!payload.chequeDate) {
        return { success: false, error: 'Cheque date is required for cheque payments.' };
      }
      if (!payload.bankName?.trim()) {
        return { success: false, error: 'Bank name is required for cheque payments.' };
      }
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase.rpc('record_sale_payment_atomic', {
      p_sale_id: payload.saleId,
      p_amount: numAmount,
      p_payment_method: payload.paymentMethod,
      p_created_by: check.actorEmail || 'Admin User',
      p_reference: payload.reference || null,
      p_cheque_number: payload.chequeNumber?.trim() || null,
      p_cheque_date: payload.chequeDate || null,
      p_bank_name: payload.bankName?.trim() || null,
      p_notes: payload.notes || null,
    });

    if (error || !data?.success) {
      return {
        success: false,
        error: error?.message || data?.error || 'Failed to record payment.',
      };
    }

    revalidatePath('/admin/sales');
    return { success: true, paymentId: data.payment_id, summary: data.summary };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record payment.' };
  }
}

export async function updateChequeStatusAction(payload: {
  paymentId: string;
  newStatus: 'cleared' | 'bounced' | 'cancelled';
  notes?: string;
}) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    if (!payload.paymentId) {
      return { success: false, error: 'Payment ID is required.' };
    }
    if (!['cleared', 'bounced', 'cancelled'].includes(payload.newStatus)) {
      return { success: false, error: 'Invalid target status for cheque.' };
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase.rpc('update_cheque_status_atomic', {
      p_payment_id: payload.paymentId,
      p_new_status: payload.newStatus,
      p_actor_name: check.actorEmail || 'Admin User',
      p_notes: payload.notes || null,
    });

    if (error || !data?.success) {
      return {
        success: false,
        error: error?.message || data?.error || 'Failed to update cheque status.',
      };
    }

    revalidatePath('/admin/sales');
    revalidatePath('/admin/finance/outstanding');
    revalidatePath('/admin/finance/cheques');
    return { success: true, summary: data.summary };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update cheque status.' };
  }
}

export async function getSalePaymentsAction(saleId: string): Promise<{
  success: boolean;
  data?: {
    payments: SalePayment[];
    reversals: SalePaymentReversal[];
    summary: SalePaymentSummary;
  };
  error?: string;
}> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const supabase = getAdminSupabase();

    // Fetch parent sale
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('id, total, status, invoice_revoked_at, invoice_revoked_by, invoice_revoke_reason, invoice_revoke_notes')
      .eq('id', saleId)
      .single();

    if (saleErr || !sale) {
      return { success: false, error: 'Sale record not found.' };
    }

    // Fetch payments
    const { data: payments, error: payErr } = await supabase
      .from('sale_payments')
      .select('*')
      .eq('sale_id', saleId)
      .order('payment_date', { ascending: true });

    if (payErr) {
      return { success: false, error: payErr.message };
    }

    // Fetch reversals
    const { data: reversals, error: revErr } = await supabase
      .from('sale_payment_reversals')
      .select('*')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: true });

    if (revErr) {
      return { success: false, error: revErr.message };
    }

    const revList: SalePaymentReversal[] = (reversals || []).map((r: any) => ({
      id: r.id,
      reversal_number: r.reversal_number,
      payment_id: r.payment_id,
      sale_id: r.sale_id,
      amount: Number(r.amount) || 0,
      reason: r.reason,
      reference: r.reference,
      notes: r.notes,
      reversed_by: r.reversed_by,
      created_at: r.created_at,
    }));

    const payList: SalePayment[] = (payments || []).map((p: any) => {
      const pAmount = Number(p.amount) || 0;
      const pReversals = revList.filter((r) => r.payment_id === p.id);
      const returnedAmount = pReversals.reduce((sum, r) => sum + r.amount, 0);
      const netAmount = Math.max(0, pAmount - returnedAmount);
      const remainingReversible = p.status === 'cleared' ? Math.max(0, pAmount - returnedAmount) : 0;

      return {
        id: p.id,
        sale_id: p.sale_id,
        quotation_id: p.quotation_id,
        amount: pAmount,
        payment_method: p.payment_method,
        status: p.status,
        payment_date: p.payment_date,
        reference: p.reference,
        cheque_number: p.cheque_number,
        cheque_date: p.cheque_date,
        bank_name: p.bank_name,
        notes: p.notes,
        created_by: p.created_by,
        cleared_by: p.cleared_by,
        created_at: p.created_at,
        updated_at: p.updated_at,
        returned_amount: returnedAmount,
        net_amount: netAmount,
        remaining_reversible: remainingReversible,
      };
    });

    const invoiceTotal = Number(sale.total) || 0;
    const grossClearedPaid = payList
      .filter((p) => p.status === 'cleared')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalReturned = revList.reduce((sum, r) => sum + r.amount, 0);
    const effectiveClearedPaid = Math.max(0, grossClearedPaid - totalReturned);

    const pendingClearance = payList
      .filter((p) => p.payment_method === 'cheque' && p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0);

    const balanceDue = Math.max(0, invoiceTotal - effectiveClearedPaid);
    const availableToRecord = Math.max(0, invoiceTotal - effectiveClearedPaid - pendingClearance);

    const isRevoked = Boolean(sale.invoice_revoked_at);
    let paymentStatus: 'UNPAID' | 'BALANCE PENDING' | 'PAID' | 'REVOKED';
    if (isRevoked) {
      paymentStatus = 'REVOKED';
    } else if (effectiveClearedPaid <= 0) {
      paymentStatus = 'UNPAID';
    } else if (effectiveClearedPaid < invoiceTotal) {
      paymentStatus = 'BALANCE PENDING';
    } else {
      paymentStatus = 'PAID';
    }

    return {
      success: true,
      data: {
        payments: payList,
        reversals: revList,
        summary: {
          invoice_total: invoiceTotal,
          cleared_paid: effectiveClearedPaid,
          gross_cleared_paid: grossClearedPaid,
          returned_amount: totalReturned,
          effective_cleared_paid: effectiveClearedPaid,
          pending_clearance: pendingClearance,
          balance_due: balanceDue,
          available_to_record: availableToRecord,
          payment_status: paymentStatus,
          is_revoked: isRevoked,
          invoice_revoked_at: sale.invoice_revoked_at || null,
          invoice_revoked_by: sale.invoice_revoked_by || null,
          invoice_revoke_reason: sale.invoice_revoke_reason || null,
          invoice_revoke_notes: sale.invoice_revoke_notes || null,
        },
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch payment history.' };
  }
}

export async function revokeInvoiceAction(payload: {
  saleId: string;
  reason: string;
  notes?: string;
}) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized: Permission required to revoke invoices.' };

  try {
    if (!payload.saleId) {
      return { success: false, error: 'Sale ID is required.' };
    }
    const cleanReason = (payload.reason || '').trim();
    if (!cleanReason) {
      return { success: false, error: 'A valid reason is required to revoke an invoice.' };
    }
    if (cleanReason.toLowerCase() === 'other' && (!payload.notes || !payload.notes.trim())) {
      return { success: false, error: 'Notes/details are required when selecting reason "Other".' };
    }

    const supabase = getAdminSupabase();
    const actor = check.actorEmail || 'Admin User';

    const { data, error } = await supabase.rpc('revoke_invoice_atomic', {
      p_sale_id: payload.saleId,
      p_reason: cleanReason,
      p_notes: payload.notes?.trim() || null,
      p_revoked_by: actor,
    });

    if (error || !data?.success) {
      return {
        success: false,
        error: error?.message || data?.error || 'Failed to revoke invoice.',
      };
    }

    revalidatePath('/admin/sales');
    revalidatePath('/admin/finance/outstanding');
    revalidatePath('/admin/finance/cheques');

    await writeAuditLog(
      actor,
      'update',
      'sales',
      payload.saleId,
      { invoice_revoked: false },
      { invoice_revoked: true, reason: cleanReason, notes: payload.notes },
      { ip: check.ip, userAgent: check.userAgent }
    );

    return { success: true, data };
  } catch (err: any) {
    console.error('[revokeInvoiceAction] Error:', err);
    return { success: false, error: err.message || 'Failed to revoke invoice.' };
  }
}

export async function recordPaymentReversalAction(payload: {
  paymentId: string;
  amount: number;
  reason: string;
  reference?: string;
  notes?: string;
}) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    if (!payload.paymentId) {
      return { success: false, error: 'Payment ID is required.' };
    }
    const numAmount = Number(payload.amount);
    if (isNaN(numAmount) || !Number.isFinite(numAmount) || numAmount <= 0) {
      return { success: false, error: 'Valid positive return amount is required.' };
    }
    if (!payload.reason || !payload.reason.trim()) {
      return { success: false, error: 'Reason is required for payment return.' };
    }
    if (payload.reason === 'Other' && (!payload.notes || !payload.notes.trim())) {
      return { success: false, error: 'Notes are required when selecting reason "Other".' };
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase.rpc('record_payment_reversal_atomic', {
      p_payment_id: payload.paymentId,
      p_amount: numAmount,
      p_reason: payload.reason.trim(),
      p_reference: payload.reference?.trim() || null,
      p_notes: payload.notes?.trim() || null,
      p_reversed_by: check.actorEmail || 'Admin User',
    });

    if (error || !data?.success) {
      return {
        success: false,
        error: error?.message || data?.error || 'Failed to record payment return.',
      };
    }

    revalidatePath('/admin/sales');
    revalidatePath('/admin/finance/outstanding');
    revalidatePath('/admin/finance/cheques');
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to record payment return.' };
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

    // If quotation was in draft state, emailing it also formally marks it sent
    if (quote.status === 'draft') {
      await pbQuotations.update(id, { status: 'sent', updated_at: new Date().toISOString() });
    }

    revalidatePath('/admin/quotations');
    revalidatePath('/admin/sales');

    await writeAuditLog(
      check.actorEmail || 'admin',
      'email',
      'quotations',
      id,
      { status: quote.status },
      { status: quote.status === 'draft' ? 'sent' : quote.status, recipient: quote.customer_email },
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
    const emailResult = await sendInvoiceEmailForOrder(id);

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
    const supabase = getAdminSupabase();

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

    let customerRecord: { id: string; email?: string; name?: string; phone?: string } | null = null;

    if (resolvedPhone) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, name, email, phone')
        .eq('phone', resolvedPhone)
        .limit(1)
        .maybeSingle();

      customerRecord = cust || null;
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
      paymentMethod: sale.payment_method || 'cash',
      paymentStatus: 'Paid',
      isPaid: true,
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
        await supabase
          .from('customers')
          .update({ email: resolvedEmail, updated_at: new Date().toISOString() })
          .eq('id', customerRecord.id);
      }
    } else {
      const { data: newCust } = await supabase
        .from('customers')
        .insert({
          name: resolvedName,
          email: resolvedEmail,
          phone: resolvedPhone,
          orders_count: 1,
          total_spent: sale.total,
          status: 'active',
          notes: `Created via Send Invoice Workflow for Sale #${sale.receipt_number || sale.id}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id, name, email, phone')
        .single();

      customerRecord = newCust || null;
    }

    const saleUpdate: Record<string, any> = {
      customer_email: resolvedEmail
    };
    if (resolvedName !== sale.customer_name) saleUpdate.customer_name = resolvedName;
    if (resolvedPhone !== sale.customer_phone) saleUpdate.customer_phone = resolvedPhone;

    await pbSales.update(sale.id, saleUpdate);

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
  type: 'inquiry' | 'order' | 'quotation' | 'stock' | 'receivable' | 'cheque';
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
  const perm = await checkPermission('inquiries', 'read');
  if (!perm.allowed) {
    return { success: false, notifications: [], unreadCount: 0, error: 'Unauthorized.' };
  }

  try {
    const supabase = getAdminSupabase();

    // Parallelize the queries
    const [inquiriesRes, ordersRes, quotationsRes, productsRes, receivablesRes, chequesRes] = await Promise.allSettled([
      // 1. Inquiries
      supabase
        .from('contact_inquiries')
        .select('id, name, message, status, created_at')
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(10),

      // 2. Orders
      supabase
        .from('orders')
        .select('id, order_id, customer, total, status, is_paid, payment_details, created_at')
        .not('status', 'in', '("cancelled","refunded","returned")')
        .or('status.eq.pending,status.eq.processing,is_paid.is.false')
        .order('created_at', { ascending: false })
        .limit(10),

      // 3. Quotations
      supabase
        .from('quotations')
        .select('id, customer_name, items, status, created_at')
        .in('status', ['pending', 'sent'])
        .order('created_at', { ascending: false })
        .limit(10),

      // 4. Low stock products
      supabase
        .from('products')
        .select('id, name, count_in_stock, updated_at, created_at')
        .gte('count_in_stock', 0)
        .lte('count_in_stock', 3)
        .order('count_in_stock', { ascending: true })
        .limit(5),

      // 5. Outstanding Receivables (due soon, due today, or overdue)
      supabase.rpc('admin_get_outstanding_receivables', {
        p_search: '',
        p_filter: 'all',
        p_sort: 'due_asc',
        p_limit: 10,
        p_offset: 0,
      }),

      // 6. Actionable Cheques (due today, due tomorrow, overdue for review, recently bounced)
      supabase
        .from('sale_payments')
        .select('id, cheque_number, bank_name, amount, cheque_date, status, updated_at, created_at, sales!inner(invoice_number, receipt_number, customer_name, customer_email, wholesale_dealers(company_name, contact_name))')
        .eq('payment_method', 'cheque')
        .in('status', ['pending', 'bounced'])
        .order('cheque_date', { ascending: true })
        .limit(10),
    ]);

    const notifications: AdminNotification[] = [];

    if (inquiriesRes.status === 'fulfilled' && !inquiriesRes.value.error && inquiriesRes.value.data) {
      inquiriesRes.value.data.forEach((i: any) => {
        notifications.push({
          id: `inquiry-${i.id}`,
          type: 'inquiry',
          title: `New Inquiry from ${i.name || 'Customer'}`,
          description: i.message ? `${i.message.slice(0, 70)}${i.message.length > 70 ? '...' : ''}` : 'Customer submitted contact message',
          timestamp: i.created_at || new Date().toISOString(),
          link: '/admin/inquiries',
          read: false,
        });
      });
    }

    if (ordersRes.status === 'fulfilled' && !ordersRes.value.error && ordersRes.value.data) {
      ordersRes.value.data.forEach((o: any) => {
        const orderNum = o.order_id || o.id;
        const custName = o.customer?.name || o.customerEmail || o.email || 'Customer';
        const amt = (o.total || o.totalAmount || 0).toLocaleString();
        const pMethod = o.payment_details?.method ? ` (${o.payment_details.method})` : '';
        notifications.push({
          id: `order-${o.id}`,
          type: 'order',
          title: `New Order #${orderNum}`,
          description: `Total LKR ${amt} — ${custName}${pMethod}`,
          timestamp: o.created_at || new Date().toISOString(),
          link: '/admin/orders',
          read: false,
        });
      });
    }

    if (quotationsRes.status === 'fulfilled' && !quotationsRes.value.error && quotationsRes.value.data) {
      quotationsRes.value.data.forEach((q: any) => {
        notifications.push({
          id: `quotation-${q.id}`,
          type: 'quotation',
          title: `Pending Quotation Follow-up`,
          description: `Quotation for ${q.customer_name || 'Customer'} (${q.items?.length || 1} items)`,
          timestamp: q.created_at || new Date().toISOString(),
          link: '/admin/sales?view=quotations',
          read: false,
        });
      });
    }

    if (productsRes.status === 'fulfilled' && !productsRes.value.error && productsRes.value.data) {
      productsRes.value.data.forEach((p: any) => {
        notifications.push({
          id: `stock-${p.id}`,
          type: 'stock',
          title: `Low Stock Warning`,
          description: `${p.name} has only ${p.count_in_stock} unit${p.count_in_stock === 1 ? '' : 's'} remaining!`,
          timestamp: p.updated_at || p.created_at || new Date().toISOString(),
          link: '/admin/inventory',
          read: false,
        });
      });
    }

    if (receivablesRes.status === 'fulfilled' && !receivablesRes.value.error && receivablesRes.value.data) {
      receivablesRes.value.data.forEach((r: any) => {
        const balanceFmt = (Number(r.balance_due) || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
        const invNum = r.invoice_number || r.receipt_number || 'INV';
        const cust = r.customer_name || 'Customer';
        const dueStr = r.due_date ? new Date(r.due_date).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

        if (r.collection_status === 'OVERDUE') {
          notifications.push({
            id: `invoice-overdue-${r.id}-${r.due_date}`,
            type: 'receivable',
            title: `Overdue Invoice #${invNum}`,
            description: `LKR ${balanceFmt} outstanding (${r.days_overdue} day${r.days_overdue === 1 ? '' : 's'} overdue) — ${cust}`,
            timestamp: r.invoice_date || new Date().toISOString(),
            link: '/admin/sales?view=receivables',
            read: false,
          });
        } else if (r.collection_status === 'DUE TODAY') {
          notifications.push({
            id: `invoice-due-today-${r.id}-${r.due_date}`,
            type: 'receivable',
            title: `Invoice Due Today #${invNum}`,
            description: `LKR ${balanceFmt} outstanding due today — ${cust}`,
            timestamp: r.invoice_date || new Date().toISOString(),
            link: '/admin/sales?view=receivables',
            read: false,
          });
        } else if (r.collection_status === 'DUE SOON') {
          notifications.push({
            id: `invoice-due-soon-${r.id}-${r.due_date}`,
            type: 'receivable',
            title: `Invoice Due Soon #${invNum}`,
            description: `LKR ${balanceFmt} outstanding due on ${dueStr} — ${cust}`,
            timestamp: r.invoice_date || new Date().toISOString(),
            link: '/admin/sales?view=receivables',
            read: false,
          });
        }
      });
    }

    if (chequesRes.status === 'fulfilled' && !chequesRes.value.error && chequesRes.value.data) {
      const todayStr = new Date().toISOString().slice(0, 10);
      chequesRes.value.data.forEach((c: any) => {
        const amtFmt = (Number(c.amount) || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
        const chqNum = c.cheque_number || 'N/A';
        const bank = c.bank_name || 'Bank';
        const s = c.sales || {};
        const dealer = s.wholesale_dealers?.company_name || s.wholesale_dealers?.contact_name;
        const cust = dealer || s.customer_name || s.customer_email || 'Customer';
        const chqDate = c.cheque_date ? c.cheque_date.slice(0, 10) : '';

        if (c.status === 'pending' && chqDate) {
          if (chqDate === todayStr) {
            notifications.push({
              id: `cheque-due-today-${c.id}-${chqDate}`,
              type: 'cheque',
              title: `Cheque #${chqNum} DUE TODAY`,
              description: `LKR ${amtFmt} (${bank}) — ${cust}`,
              timestamp: c.created_at || new Date().toISOString(),
              link: '/admin/sales?view=cheques',
              read: false,
            });
          } else if (chqDate < todayStr) {
            const diffMs = new Date(todayStr).getTime() - new Date(chqDate).getTime();
            const daysOverdue = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
            notifications.push({
              id: `cheque-overdue-${c.id}-${chqDate}`,
              type: 'cheque',
              title: `Cheque #${chqNum} OVERDUE FOR REVIEW`,
              description: `LKR ${amtFmt} (${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue) — ${cust}`,
              timestamp: c.created_at || new Date().toISOString(),
              link: '/admin/sales?view=cheques',
              read: false,
            });
          } else {
            // Check if due tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().slice(0, 10);
            if (chqDate === tomorrowStr) {
              notifications.push({
                id: `cheque-due-tomorrow-${c.id}-${chqDate}`,
                type: 'cheque',
                title: `Cheque #${chqNum} Due Tomorrow`,
                description: `LKR ${amtFmt} (${bank}) — ${cust}`,
                timestamp: c.created_at || new Date().toISOString(),
                link: '/admin/sales?view=cheques',
                read: false,
              });
            }
          }
        } else if (c.status === 'bounced') {
          // Check if within last 2 days
          const updatedDate = new Date(c.updated_at || c.created_at);
          const now = new Date();
          if ((now.getTime() - updatedDate.getTime()) <= 2 * 24 * 60 * 60 * 1000) {
            notifications.push({
              id: `cheque-bounced-${c.id}-${chqDate || c.id}`,
              type: 'cheque',
              title: `Cheque #${chqNum} Bounced`,
              description: `LKR ${amtFmt} marked bounced — ${cust}`,
              timestamp: c.updated_at || c.created_at || new Date().toISOString(),
              link: '/admin/sales?view=cheques',
              read: false,
            });
          }
        }
      });
    }

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
export async function resetAllOrdersAndRestoreStockAction(
  confirmationToken?: string,
  managerPin?: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const check = await checkPermission('settings', 'delete');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.' };

  if (confirmationToken !== 'RESET_ALL_ORDERS_AND_RESTORE_STOCK') {
    return {
      success: false,
      error: 'Destructive operation rejected: Invalid or missing confirmation token.',
    };
  }

  if (!managerPin) {
    return {
      success: false,
      error: 'Manager or Admin PIN confirmation is required for system reset.',
    };
  }

  const pinVerify = await verifyManagerPinAction(managerPin);
  if (!pinVerify.success) {
    return {
      success: false,
      error: pinVerify.error || 'Invalid Manager or Admin PIN.',
    };
  }

  try {
    const supabase = getAdminSupabase();

    // 1. Delete all sale_items and sales
    let deletedSalesLogsCount = 0;
    try {
      await supabase.from('sale_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { data: deletedSales } = await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
      deletedSalesLogsCount = deletedSales?.length || 0;
    } catch (err) {
      console.warn('[resetAllOrdersAndRestoreStockAction] Error clearing sales:', err);
    }

    // 2. Delete all orders
    let deletedOrdersCount = 0;
    try {
      const { data: deletedOrders } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000').select('id');
      deletedOrdersCount = deletedOrders?.length || 0;
    } catch (err) {
      console.warn('[resetAllOrdersAndRestoreStockAction] Error clearing orders:', err);
    }

    // 3. Reset all stock_management units back to 'available' and clear order_id
    let resetUnitsCount = 0;
    try {
      const { data: units } = await supabase
        .from('stock_management')
        .update({
          status: 'available',
          order_id: null,
          notes: null,
          updated_at: new Date().toISOString(),
        })
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select('id');
      resetUnitsCount = units?.length || 0;
    } catch (err) {
      console.warn('[resetAllOrdersAndRestoreStockAction] Error resetting stock units:', err);
    }

    // 4. Update product count_in_stock using bulk query aggregation to avoid N+1
    try {
      const { data: allAvailableUnits } = await supabase
        .from('stock_management')
        .select('product_id')
        .eq('status', 'available');
      const { data: allPurchases } = await supabase
        .from('stock_purchases')
        .select('product_id, quantity');

      const unitsCountMap = new Map<string, number>();
      for (const u of (allAvailableUnits || [])) {
        if (u.product_id) unitsCountMap.set(u.product_id, (unitsCountMap.get(u.product_id) || 0) + 1);
      }
      const purchasesSumMap = new Map<string, number>();
      for (const p of (allPurchases || [])) {
        if (p.product_id) purchasesSumMap.set(p.product_id, (purchasesSumMap.get(p.product_id) || 0) + (p.quantity || 0));
      }

      const { data: products } = await supabase.from('products').select('id, name');
      for (const prod of (products || [])) {
        let newStock = 10;
        const unitCount = unitsCountMap.get(prod.id);
        if (typeof unitCount === 'number' && unitCount > 0) {
          newStock = unitCount;
        } else {
          const purchaseSum = purchasesSumMap.get(prod.id);
          if (typeof purchaseSum === 'number' && purchaseSum > 0) {
            newStock = purchaseSum;
          }
        }

        await supabase.from('products').update({ count_in_stock: newStock }).eq('id', prod.id);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reset system orders and stock.';
    console.error('[resetAllOrdersAndRestoreStockAction] Error:', err);
    return { success: false, error: message };
  }
}

export interface ProductSaleRecord {
  id: string;
  orderNumber: string;
  channel: 'Online' | 'POS';
  customerName: string;
  customerEmail: string;
  date: string;
  sortAt?: number;
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
    const supabase = getAdminSupabase();
    const sales: ProductSaleRecord[] = [];

    // 1. Fetch product slug and old IDs to match across migrations
    const { data: prod } = await supabase
      .from('products')
      .select('id, slug, name')
      .eq('id', productId)
      .maybeSingle();
    const productSlug = prod?.slug || '';
    const productName = prod?.name || '';

    // 2. Query POS sale_items for this product joined with sales
    try {
      let query = supabase
        .from('sale_items')
        .select(`
          *,
          sale:sales(*)
        `);

      const cleanProductId = productId.replace(/[^a-zA-Z0-9-]/g, '');
      const cleanProductSlug = productSlug ? productSlug.replace(/[^a-zA-Z0-9-]/g, '') : '';

      if (cleanProductSlug) {
        query = query.or(`product_id.eq.${cleanProductId},sku.eq.${cleanProductSlug}`);
      } else {
        query = query.eq('product_id', cleanProductId);
      }

      const { data: saleItems, error: siErr } = await query;
      if (siErr) console.warn('[getProductSalesHistoryAction] POS items error:', siErr);

      for (const item of (saleItems || [])) {
        const sale = item.sale;
        if (!sale) continue;
        const serials = [item.unit_serial, item.unit_barcode].filter(Boolean);
        const saleDateStr = sale.date || sale.created_at;
        const sortAt = saleDateStr ? new Date(saleDateStr).getTime() : 0;
        sales.push({
          id: sale.id,
          orderNumber: sale.receipt_number || `FTC-POS-${sale.id.slice(-6).toUpperCase()}`,
          channel: 'POS',
          customerName: sale.customer_name || 'Walk-in Customer',
          customerEmail: sale.customer_email || '—',
          date: saleDateStr ? new Date(saleDateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A',
          sortAt,
          quantity: item.quantity || 1,
          unitPrice: item.unit_price || 0,
          totalAmount: item.line_total || (item.quantity || 1) * (item.unit_price || 0),
          status: sale.status === 'completed' ? 'Completed' : sale.status === 'voided' ? 'Voided' : sale.status || 'Completed',
          serials,
        });
      }
    } catch (posErr) {
      console.warn('[getProductSalesHistoryAction] POS query error:', posErr);
    }

    // 3. Query Online orders containing this product
    try {
      const { data: orders, error: ordErr } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordErr) console.warn('[getProductSalesHistoryAction] Orders query error:', ordErr);

      for (const order of (orders || [])) {
        const items = Array.isArray(order.items) ? order.items : [];
        const matchedItem = items.find(
          (i: any) =>
            i.productId === productId ||
            i.product === productId ||
            i.id === productId ||
            (productSlug && i.slug === productSlug) ||
            (productName && i.name === productName)
        );

        if (matchedItem) {
          const qty = matchedItem.quantity || matchedItem.qty || 1;
          const price = matchedItem.price || matchedItem.unit_price || 0;
          const serials = Array.isArray(matchedItem.assignedSerials)
            ? matchedItem.assignedSerials
            : Array.isArray(matchedItem.assignedUnits)
              ? matchedItem.assignedUnits.map((u: any) => u.serialNumber || u.barcode).filter(Boolean)
              : [];

          const orderDateStr = order.created_at || order.created;
          const sortAt = orderDateStr ? new Date(orderDateStr).getTime() : 0;
          const shippingFullName = `${order.shipping_address?.firstName || ''} ${order.shipping_address?.lastName || ''}`.trim();
          const customerName = order.customer?.name?.trim() || shippingFullName || 'Online Customer';

          sales.push({
            id: order.id,
            orderNumber: order.order_id || order.id,
            channel: order.channel === 'pos' ? 'POS' : 'Online',
            customerName,
            customerEmail: order.customer?.email || '—',
            date: orderDateStr ? new Date(orderDateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A',
            sortAt,
            quantity: qty,
            unitPrice: price,
            totalAmount: qty * price,
            status: order.status === 'delivered' ? 'Delivered' : order.status === 'shipped' ? 'Shipped' : order.status === 'completed' ? 'Completed' : order.status || 'Pending',
            serials,
          });
        }
      }
    } catch (orderErr) {
      console.warn('[getProductSalesHistoryAction] Orders query error:', orderErr);
    }

    sales.sort((a, b) => {
      const timeA = a.sortAt ?? 0;
      const timeB = b.sortAt ?? 0;
      return timeB - timeA;
    });

    return { success: true, sales };
  } catch (err: any) {
    console.error('[getProductSalesHistoryAction] Failed:', err);
    return { success: false, sales: [] };
  }
}

// ─── Audit Log Action ───────────────────────────────────────────────────────

/**
 * Server action to securely retrieve audit log entries with permission verification.
 * Only authenticated administrators with 'auditLog' read permissions can access this.
 */
export async function getAdminAuditLogsAction(limit: number = 50): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  const perm = await checkPermission('auditLog', 'read');
  if (!perm.allowed) {
    return { success: false, data: [], error: 'Unauthorized: Access to audit log is restricted.' };
  }

  try {
    const supabase = getAdminSupabase();
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const { data, error } = await supabase
      .from('audit_log')
      .select('id, actor, action, collection, record_id, old_value, new_value, ip, user_agent, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      console.error('[getAdminAuditLogsAction] Query error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return { success: false, data: [], error: 'Failed to retrieve audit log records.' };
    }

    const items = (data || []).map((row) => ({
      id: row.id,
      actor: row.actor || 'System',
      action: row.action || 'update',
      collection: row.collection || 'system',
      recordId: row.record_id || '',
      oldValue: row.old_value || '',
      newValue: row.new_value || '',
      ip: row.ip || '',
      userAgent: row.user_agent || '',
      created: row.created_at,
      updated: row.updated_at,
      collectionId: 'audit_log',
      collectionName: 'audit_log',
    }));

    return { success: true, data: items };
  } catch (err) {
    console.error('[getAdminAuditLogsAction] Unexpected error:', err);
    return { success: false, data: [], error: 'Internal server error loading audit logs.' };
  }
}

/**
 * Admin action to download authoritative Invoice PDF for a paid order.
 */
export async function downloadOrderInvoicePdfAction(orderId: string): Promise<{
  success: boolean;
  filename?: string;
  pdfBase64?: string;
  error?: string;
}> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const invoiceResult = await ensureInvoiceForPaidOrder(orderId);
    if (!invoiceResult.success || !invoiceResult.data) {
      return { success: false, error: invoiceResult.error || 'Invoice not available for this order.' };
    }

    const pdfBuffer = await generateInvoicePdf(invoiceResult.data);
    return {
      success: true,
      filename: `FTC-Invoice-${invoiceResult.data.invoiceNumber}.pdf`,
      pdfBase64: pdfBuffer.toString('base64'),
    };
  } catch (err: any) {
    console.error('[downloadOrderInvoicePdfAction] Error:', err);
    return { success: false, error: err.message || 'Failed to generate invoice PDF.' };
  }
}

/**
 * Admin action to preview/download sample Invoice PDF for Printer Presets testing.
 * Uses completely mock data without creating orders or consuming invoice sequence numbers.
 */
export async function getSampleInvoicePdfAction(customPreset?: InvoicePrintConfig): Promise<{
  success: boolean;
  filename?: string;
  pdfBase64?: string;
  error?: string;
}> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    const sampleData = generateSampleInvoiceData('Invoice');
    if (customPreset) {
      if (customPreset.storeName) sampleData.business.storeName = customPreset.storeName;
      if (customPreset.headerAddress) sampleData.business.address = customPreset.headerAddress;
      if (customPreset.headerPhone) sampleData.business.phone = customPreset.headerPhone;
      if (customPreset.headerEmail) sampleData.business.email = customPreset.headerEmail;
      if (customPreset.termsAndConditions) sampleData.termsAndConditions = customPreset.termsAndConditions;
    }
    const pdfBuffer = await generateInvoicePdf(sampleData);
    return {
      success: true,
      filename: 'FTC-Sample-Invoice.pdf',
      pdfBase64: pdfBuffer.toString('base64'),
    };
  } catch (err: any) {
    console.error('[getSampleInvoicePdfAction] Error:', err);
    return { success: false, error: err.message || 'Failed to generate sample PDF.' };
  }
}

export async function getQuotationByIdAction(id: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const data = await pbQuotations.getById(id);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchQuotationProductsAction(query: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const supabase = getAdminSupabase();
    const q = query.trim();
    if (q.length < 2) return { success: true, data: [] };
    const cleanQ = q.replace(/[%_\\]/g, '\\$&');
    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, price, discount_price, images')
      .eq('status', 'published')
      .or(`name.ilike."%${cleanQ}%",slug.ilike."%${cleanQ}%"`)
      .order('name')
      .limit(20);
    if (error) throw error;
    const formatted = (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      discount_price: p.discount_price,
      discountPrice: p.discount_price,
      images: Array.isArray(p.images) ? p.images : [],
    }));
    return { success: true, data: formatted };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchQuotationCustomersAction(query: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const supabase = getAdminSupabase();
    const q = query.trim();
    if (q.length < 2) return { success: true, data: [] };
    const cleanQ = q.replace(/[%_\\]/g, '\\$&');
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, email, phone, profile_id, profiles(address)')
      .or(`name.ilike."%${cleanQ}%",email.ilike."%${cleanQ}%",phone.ilike."%${cleanQ}%"`)
      .order('name')
      .limit(20);
    if (error) throw error;

    const formatAddress = (raw: any): string => {
      if (!raw) return '';
      if (typeof raw === 'object') {
        const parts = [raw.addressLine1, raw.addressLine2, raw.city, raw.state, raw.postalCode, raw.country].filter(Boolean);
        return parts.join(', ');
      }
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'object' && parsed !== null) {
            const parts = [parsed.addressLine1, parsed.addressLine2, parsed.city, parsed.state, parsed.postalCode, parsed.country].filter(Boolean);
            if (parts.length > 0) return parts.join(', ');
          }
        } catch {
          // ignore json parse error, return raw string
        }
        return raw;
      }
      return '';
    };

    const formatted = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      address: formatAddress(c.profiles?.address),
    }));

    return { success: true, data: formatted };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function searchQuotationDealersAction(query: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const supabase = getAdminSupabase();
    const q = query.trim();
    if (q.length < 2) return { success: true, data: [] };
    const cleanQ = q.replace(/[%_\\]/g, '\\$&');
    const { data, error } = await supabase
      .from('wholesale_dealers')
      .select('id, company_name, contact_name, email, phone, address')
      .or(`company_name.ilike."%${cleanQ}%",contact_name.ilike."%${cleanQ}%",email.ilike."%${cleanQ}%"`)
      .order('company_name')
      .limit(20);
    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getWholesaleDealerByIdAction(id: string) {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };
  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('wholesale_dealers')
      .select('id, discount_rate')
      .eq('id', id)
      .single();
    if (error) throw error;
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getChequeRegisterAction(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  filter?: string;
  sort?: string;
}): Promise<{
  success: boolean;
  data?: ChequeRegisterItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  error?: string;
}> {
  const perm = await checkPermission('orders', 'read');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Read permission required.' };
  }

  const {
    page = 1,
    pageSize = 20,
    search = '',
    filter = 'all',
    sort = 'priority',
  } = params || {};

  const limit = Math.max(1, Math.min(pageSize, 100));
  const offset = Math.max(0, (page - 1) * limit);

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase.rpc('admin_get_cheque_register', {
      p_search: search,
      p_filter: filter,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) throw error;

    const items: ChequeRegisterItem[] = (data || []).map((row: any) => ({
      id: row.id,
      payment_id: row.id,
      sale_id: row.sale_id,
      invoice_number: row.invoice_number,
      receipt_number: row.receipt_number,
      customer_name: row.customer_name,
      customer_email: row.customer_email,
      customer_phone: row.customer_phone,
      dealer_company: row.dealer_company,
      dealer_contact: row.dealer_contact,
      cheque_number: row.cheque_number,
      bank_name: row.bank_name,
      amount: Number(row.amount) || 0,
      payment_date: row.payment_date,
      cheque_date: row.cheque_date,
      status: row.status,
      operational_state: row.operational_state,
      days_diff: Number(row.days_diff) || 0,
      days_overdue: Number(row.days_overdue) || 0,
      notes: row.notes,
      created_by: row.created_by,
      created_at: row.created_at,
      cleared_by: row.cleared_by,
      cleared_at: row.cleared_at,
      invoice_total: Number(row.invoice_total) || 0,
      invoice_cleared_paid: Number(row.invoice_cleared_paid) || 0,
      invoice_pending_clearance: Number(row.invoice_pending_clearance) || 0,
      invoice_balance_due: Number(row.invoice_balance_due) || 0,
      available_to_record: Number(row.available_to_record ?? (Math.max(0, Number(row.invoice_total || 0) - Number(row.invoice_cleared_paid || 0) - Number(row.invoice_pending_clearance || 0)))) || 0,
      invoice_payment_status: row.invoice_payment_status,
      total_count: Number(row.total_count) || 0,
    }));

    const totalCount = items.length > 0 ? items[0].total_count : 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return {
      success: true,
      data: items,
      total: totalCount,
      page,
      pageSize: limit,
      totalPages,
    };
  } catch (err: any) {
    console.error('getChequeRegisterAction error:', err);
    return { success: false, error: err.message || 'Failed to fetch cheque register.' };
  }
}

export async function getChequeRegisterMetricsAction(search = ''): Promise<{
  success: boolean;
  data?: ChequeRegisterMetrics;
  error?: string;
}> {
  const perm = await checkPermission('orders', 'read');
  if (!perm.allowed) {
    return { success: false, error: 'Unauthorized: Read permission required.' };
  }

  try {
    const supabase = await getAdminSupabase();
    const { data, error } = await supabase.rpc('admin_get_cheque_register_metrics', {
      p_search: search,
    });

    if (error) throw error;

    const row = data && data[0] ? data[0] : null;
    return {
      success: true,
      data: {
        pending_amount: Number(row?.pending_amount) || 0,
        pending_count: Number(row?.pending_count) || 0,
        due_today_amount: Number(row?.due_today_amount) || 0,
        due_today_count: Number(row?.due_today_count) || 0,
        upcoming_amount: Number(row?.upcoming_amount) || 0,
        upcoming_count: Number(row?.upcoming_count) || 0,
        overdue_amount: Number(row?.overdue_amount) || 0,
        overdue_count: Number(row?.overdue_count) || 0,
        cleared_this_month_amount: Number(row?.cleared_this_month_amount ?? row?.cleared_month_amount) || 0,
        cleared_this_month_count: Number(row?.cleared_this_month_count ?? row?.cleared_month_count) || 0,
        bounced_this_month_amount: Number(row?.bounced_this_month_amount ?? row?.bounced_month_amount) || 0,
        bounced_this_month_count: Number(row?.bounced_this_month_count ?? row?.bounced_month_count) || 0,
      },
    };
  } catch (err: any) {
    console.error('getChequeRegisterMetricsAction error:', err);
    return { success: false, error: err.message || 'Failed to fetch cheque register metrics.' };
  }
}

// ─── Admin Profile & User Management Actions ────────────────────────────────

export async function getAdminCurrentSessionAction(): Promise<{
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: AdminRole | 'admin';
    formattedRole: string;
    avatar?: string | null;
  };
  error?: string;
}> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: 'Not authenticated.' };
    }

    const adminSb = getAdminSupabase();
    const { data: profile } = await adminSb
      .from('profiles')
      .select('id, name, role, avatar')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile?.role as AdminRole) || 'admin';
    const name = profile?.name?.trim() || '';
    const email = user.email || '';

    const roleMap: Record<string, string> = {
      super_admin: 'Super Administrator',
      admin: 'Administrator',
      store_manager: 'Store Manager',
      content_editor: 'Content Editor',
      support_staff: 'Support Staff',
      read_only: 'Read Only Staff',
    };

    return {
      success: true,
      user: {
        id: user.id,
        email,
        name,
        role,
        formattedRole: roleMap[role] || 'Administrator',
        avatar: profile?.avatar || null,
      },
    };
  } catch (err: any) {
    console.error('[getAdminCurrentSessionAction] Error:', err);
    return { success: false, error: err.message || 'Failed to retrieve admin session.' };
  }
}

export async function updateMyProfileAction(payload: { name: string }): Promise<{
  success: boolean;
  name?: string;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return { success: false, error: 'Unauthorized: Not authenticated.' };
    }

    if (!payload || typeof payload.name !== 'string') {
      return { success: false, error: 'Full Name is required.' };
    }

    const cleanName = payload.name.trim();

    if (!cleanName) {
      return { success: false, error: 'Full Name cannot be empty or whitespace only.' };
    }

    if (cleanName.length > 100) {
      return { success: false, error: 'Full Name cannot exceed 100 characters.' };
    }

    // Reject control characters / invalid unicode sequences
    if (/[\u0000-\u001F\u007F-\u009F]/.test(cleanName)) {
      return { success: false, error: 'Full Name contains invalid characters.' };
    }

    const adminSb = getAdminSupabase();

    // Fetch existing profile to log diff in audit
    const { data: oldProfile } = await adminSb
      .from('profiles')
      .select('id, name, role')
      .eq('id', user.id)
      .maybeSingle();

    // STRICT UPDATE: ONLY name and updated_at. Never role, is_active, pin, or permissions.
    const { error: updateErr } = await adminSb
      .from('profiles')
      .update({
        name: cleanName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateErr) {
      console.error('[updateMyProfileAction] Profile update failed:', updateErr);
      return { success: false, error: 'Failed to update profile name.' };
    }

    // Best-effort sync to auth.users user_metadata.full_name
    try {
      await adminSb.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          full_name: cleanName,
          name: cleanName,
        },
      });
    } catch (metaErr) {
      console.warn('[updateMyProfileAction] Auth metadata sync warning:', metaErr);
    }

    let ip = '127.0.0.1';
    let userAgent = 'unknown';
    try {
      const headersList = await headers();
      ip = getTrustedClientIp(headersList);
      userAgent = headersList.get('user-agent') || 'unknown';
    } catch { /* ignored outside request context */ }

    await writeAuditLog(
      cleanName || user.email || 'Admin Staff',
      'update',
      'profiles',
      user.id,
      { name: oldProfile?.name || '' },
      { name: cleanName },
      { ip, userAgent }
    );

    revalidatePath('/admin/profile');
    revalidatePath('/admin/system-config');
    revalidatePath('/admin');
    return { success: true, name: cleanName };
  } catch (err: any) {
    console.error('[updateMyProfileAction] Unexpected error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}

export async function getAdminStaffProfilesAction(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    formattedRole: string;
    isActive: boolean;
    createdAt: string;
  }>;
  error?: string;
}> {
  const check = await checkPermission('users', 'read');
  if (!check.allowed) {
    const sysCheck = await checkPermission('systemConfig', 'read');
    if (!sysCheck.allowed) {
      return { success: false, error: 'Unauthorized: Permission required to view staff profiles.' };
    }
  }

  try {
    const adminSb = getAdminSupabase();

    // Query non-customer profiles
    const { data: profiles, error: pErr } = await adminSb
      .from('profiles')
      .select('id, name, role, is_active, created_at')
      .neq('role', 'customer')
      .order('created_at', { ascending: true });

    if (pErr) throw pErr;

    // Fetch auth users to correlate email
    const { data: authData } = await adminSb.auth.admin.listUsers();
    const userEmailMap = new Map<string, string>();
    authData?.users?.forEach((u) => {
      userEmailMap.set(u.id, u.email || '');
    });

    const roleMap: Record<string, string> = {
      super_admin: 'Super Administrator',
      admin: 'Administrator',
      store_manager: 'Store Manager',
      content_editor: 'Content Editor',
      support_staff: 'Support Staff',
      read_only: 'Read Only Staff',
    };

    const staff = (profiles || []).map((p: any) => ({
      id: p.id,
      name: p.name?.trim() || '',
      email: userEmailMap.get(p.id) || '—',
      role: p.role,
      formattedRole: roleMap[p.role] || p.role,
      isActive: p.is_active ?? true,
      createdAt: p.created_at,
    }));

    return { success: true, data: staff };
  } catch (err: any) {
    console.error('[getAdminStaffProfilesAction] Error:', err);
    return { success: false, error: err.message || 'Failed to fetch staff profiles.' };
  }
}

export async function updateStaffProfileNameByAdminAction(payload: {
  userId: string;
  name: string;
}): Promise<{ success: boolean; error?: string }> {
  const check = await checkPermission('users', 'write');
  if (!check.allowed) {
    const sysCheck = await checkPermission('systemConfig', 'write');
    if (!sysCheck.allowed) {
      return { success: false, error: 'Unauthorized: Admin permission required to edit staff profiles.' };
    }
  }

  // Only admin or super_admin roles can edit other profiles
  if (check.role !== 'admin' && check.role !== 'super_admin') {
    return { success: false, error: 'Forbidden: Only administrators can update staff profiles.' };
  }

  try {
    if (!payload?.userId || typeof payload.userId !== 'string') {
      return { success: false, error: 'User ID is required.' };
    }
    const cleanId = payload.userId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
      return { success: false, error: 'Invalid User ID format.' };
    }

    if (!payload.name || typeof payload.name !== 'string') {
      return { success: false, error: 'Full Name is required.' };
    }

    const cleanName = payload.name.trim();
    if (!cleanName) {
      return { success: false, error: 'Full Name cannot be empty.' };
    }

    if (cleanName.length > 100) {
      return { success: false, error: 'Full Name cannot exceed 100 characters.' };
    }

    if (/[\u0000-\u001F\u007F-\u009F]/.test(cleanName)) {
      return { success: false, error: 'Full Name contains invalid characters.' };
    }

    const adminSb = getAdminSupabase();

    const { data: targetProfile, error: getErr } = await adminSb
      .from('profiles')
      .select('id, name, role')
      .eq('id', cleanId)
      .maybeSingle();

    if (getErr || !targetProfile) {
      return { success: false, error: 'Staff profile not found.' };
    }

    // Strictly update name and updated_at
    const { error: updateErr } = await adminSb
      .from('profiles')
      .update({
        name: cleanName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanId);

    if (updateErr) {
      console.error('[updateStaffProfileNameByAdminAction] Update error:', updateErr);
      return { success: false, error: 'Failed to update staff profile.' };
    }

    // Best-effort sync to auth.users user_metadata
    try {
      const { data: authTarget } = await adminSb.auth.admin.getUserById(cleanId);
      if (authTarget?.user) {
        await adminSb.auth.admin.updateUserById(cleanId, {
          user_metadata: {
            ...authTarget.user.user_metadata,
            full_name: cleanName,
            name: cleanName,
          },
        });
      }
    } catch (metaErr) {
      console.warn('[updateStaffProfileNameByAdminAction] Auth metadata sync warning:', metaErr);
    }

    let ip = '127.0.0.1';
    let userAgent = 'unknown';
    try {
      const headersList = await headers();
      ip = getTrustedClientIp(headersList);
      userAgent = headersList.get('user-agent') || 'unknown';
    } catch { /* ignored */ }

    await writeAuditLog(
      check.actorName || check.actorEmail || 'Admin Staff',
      'update',
      'profiles',
      cleanId,
      { name: targetProfile.name },
      { name: cleanName },
      { ip, userAgent }
    );

    revalidatePath('/admin/profile');
    revalidatePath('/admin/system-config');
    return { success: true };
  } catch (err: any) {
    console.error('[updateStaffProfileNameByAdminAction] Unexpected error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}

export interface FulfillCommercialSaleItemsInput {
  saleId: string;
  idempotencyKey?: string;
  recipientName?: string;
  recipientPhone?: string;
  notes?: string;
  items: Array<{
    saleItemId: string;
    quantity: number;
    nonInventoryLine?: boolean;
    unitIds?: string[];
  }>;
}

export async function fulfillCommercialSaleItemsAction(input: FulfillCommercialSaleItemsInput) {
  const check = await checkPermission('orders', 'write');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  try {
    if (!input.saleId?.trim()) {
      return { success: false, error: 'Sale ID is required.' };
    }

    if (!Array.isArray(input.items) || input.items.length === 0) {
      return { success: false, error: 'At least one item must be specified for fulfillment.' };
    }

    const supabase = getAdminSupabase();

    // Resolve authoritative staff display name
    let staffDisplayName = 'Admin Staff';
    if (check.actorId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', check.actorId)
        .maybeSingle();

      const profileName = profile?.name?.trim();
      let metaFullName: string | undefined;
      let metaName: string | undefined;

      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(check.actorId);
        metaFullName = authUser?.user?.user_metadata?.full_name?.trim();
        metaName = authUser?.user?.user_metadata?.name?.trim();
      } catch {
        // Fallback gracefully if admin auth call is restricted
      }

      staffDisplayName =
        (profileName && profileName.length > 0 ? profileName : undefined) ||
        (metaFullName && metaFullName.length > 0 ? metaFullName : undefined) ||
        (metaName && metaName.length > 0 ? metaName : undefined) ||
        (check.actorEmail && check.actorEmail.trim().length > 0 ? check.actorEmail.trim() : undefined) ||
        'Admin Staff';
    }

    const idempotencyKey = input.idempotencyKey || crypto.randomUUID();

    const p_items = input.items.map((it) => ({
      sale_item_id: it.saleItemId,
      quantity: it.quantity,
      non_inventory_line: Boolean(it.nonInventoryLine),
      unit_ids: Array.isArray(it.unitIds) ? it.unitIds : [],
    }));

    const { data, error } = await supabase.rpc('fulfill_commercial_sale_items_atomic', {
      p_sale_id: input.saleId,
      p_idempotency_key: idempotencyKey,
      p_actor_profile_id: check.actorId || null,
      p_actor_name: staffDisplayName,
      p_recipient_name: input.recipientName?.trim() || null,
      p_recipient_phone: input.recipientPhone?.trim() || null,
      p_notes: input.notes?.trim() || null,
      p_items,
    });

    if (error) {
      console.error('[fulfillCommercialSaleItemsAction] RPC Error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to fulfill commercial sale items.' };
    }

    // Best-effort audit logging
    try {
      await supabase.from('audit_log').insert({
        actor: staffDisplayName,
        action: 'COMMERCIAL_GOODS_HANDED_OVER',
        collection: 'sales',
        record_id: input.saleId,
        new_value: JSON.stringify({
          fulfillment_id: data.fulfillment_id,
          fulfillment_number: data.fulfillment_number,
          sale_id: input.saleId,
          items_count: input.items.length,
        }),
      });
    } catch (logErr) {
      console.warn('[fulfillCommercialSaleItemsAction] Audit log warning:', logErr);
    }

    revalidatePath('/admin/sales');
    revalidatePath('/admin/inventory');
    return { success: true, data };
  } catch (err: any) {
    console.error('[fulfillCommercialSaleItemsAction] Catch Error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}

export interface AvailableStockUnit {
  id: string;
  barcode: string | null;
  serial_number: string | null;
  created_at: string;
}

export async function getAvailableUnitsForCommercialHandoverAction(
  productId: string
): Promise<{ success: boolean; data?: AvailableStockUnit[]; error?: string }> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) {
    return { success: false, error: 'Valid product ID is required.' };
  }

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('stock_management')
      .select('id, barcode, serial_number, created_at')
      .eq('product_id', productId)
      .eq('status', 'available')
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch available units.' };
  }
}

export interface CommercialSaleFulfillmentItem {
  id: string;
  fulfillment_id: string;
  sale_item_id: string;
  product_id: string | null;
  quantity: number;
  unit_id: string | null;
  serial_number: string | null;
  barcode: string | null;
  created_at: string;
  product_name?: string;
}

export interface CommercialSaleFulfillmentRecord {
  id: string;
  sale_id: string;
  fulfillment_number: string;
  idempotency_key: string;
  handed_over_by_profile_id: string | null;
  handed_over_by_name: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  notes: string | null;
  created_at: string;
  items: CommercialSaleFulfillmentItem[];
}

export async function getCommercialSaleFulfillmentsAction(
  saleId: string
): Promise<{ success: boolean; data?: CommercialSaleFulfillmentRecord[]; error?: string }> {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.' };

  if (!saleId || !/^[0-9a-f-]{36}$/i.test(saleId)) {
    return { success: false, error: 'Valid sale ID is required.' };
  }

  try {
    const supabase = getAdminSupabase();
    const { data: fulfillments, error: fErr } = await supabase
      .from('sale_fulfillments')
      .select('*')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false });

    if (fErr) {
      return { success: false, error: fErr.message };
    }

    if (!fulfillments || fulfillments.length === 0) {
      return { success: true, data: [] };
    }

    const fIds = fulfillments.map((f: any) => f.id);
    const { data: items, error: iErr } = await supabase
      .from('sale_fulfillment_items')
      .select('*, sale_items(product_name)')
      .in('fulfillment_id', fIds)
      .order('created_at', { ascending: true });

    if (iErr) {
      return { success: false, error: iErr.message };
    }

    const itemsByFulfillment = new Map<string, CommercialSaleFulfillmentItem[]>();
    (items || []).forEach((it: any) => {
      const list = itemsByFulfillment.get(it.fulfillment_id) || [];
      list.push({
        id: it.id,
        fulfillment_id: it.fulfillment_id,
        sale_item_id: it.sale_item_id,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_id: it.unit_id,
        serial_number: it.serial_number,
        barcode: it.barcode,
        created_at: it.created_at,
        product_name: it.sale_items?.product_name || 'Line Item',
      });
      itemsByFulfillment.set(it.fulfillment_id, list);
    });

    const result: CommercialSaleFulfillmentRecord[] = fulfillments.map((f: any) => ({
      id: f.id,
      sale_id: f.sale_id,
      fulfillment_number: f.fulfillment_number,
      idempotency_key: f.idempotency_key,
      handed_over_by_profile_id: f.handed_over_by_profile_id,
      handed_over_by_name: f.handed_over_by_name,
      recipient_name: f.recipient_name,
      recipient_phone: f.recipient_phone,
      notes: f.notes,
      created_at: f.created_at,
      items: itemsByFulfillment.get(f.id) || [],
    }));

    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch fulfillment history.' };
  }
}
