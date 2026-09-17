'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getAdminSupabase, writeAuditLog } from '@/lib/supabase-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import { ROLE_PERMISSIONS, ADMIN_ROLES } from '@/types/admin';
import type { AdminRole, AuditAction, DealerSaleRecord } from '@/types/admin';
import type { BarcodePrintConfig } from '@/types/barcode-config';
import { DEFAULT_RECEIPT_CONFIG, type ReceiptPrintConfig, type ReceiptPrintPreset } from '@/types/receipt-config';
import { DEFAULT_INVOICE_CONFIG, type InvoicePrintConfig, type InvoicePrintPreset } from '@/types/invoice-config';
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
  pbCustomers,
  pbWholesaleDealers,
  pbQuotations,
  pbContactInquiries,
  pbEmployees,
  pbSales,
} from '@/lib/supabase-collections';
import type { PaymentMethod, PBSale, PBSaleItem, SalePayload } from '@/types/pos';

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
): Promise<{ allowed: boolean; role?: AdminRole; actorEmail?: string; actorId?: string; ip?: string; userAgent?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('pb_auth_token')?.value;
  const refreshToken = cookieStore.get('pb_auth_refresh_token')?.value;

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);
  const userAgent = headersList.get('user-agent') || 'unknown';

  if (!token && !refreshToken) {
    return { allowed: false, ip, userAgent };
  }

  try {
    const supabase = getAdminSupabase();
    let user = null;
    if (token) {
      const { data: userData, error: authErr } = await supabase.auth.getUser(token);
      if (!authErr && userData?.user) {
        user = userData.user;
      }
    }

    if (!user && refreshToken) {
      try {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (!refreshErr && refreshData?.session && refreshData?.user) {
          user = refreshData.user;
          const secure = process.env.NODE_ENV === 'production';
          const base = {
            secure,
            sameSite: 'strict' as const,
            path: '/',
            maxAge: 60 * 60 * 24 * 7,
          };
          cookieStore.set('pb_auth_token', refreshData.session.access_token, { ...base, httpOnly: true });
          if (refreshData.session.refresh_token) {
            cookieStore.set('pb_auth_refresh_token', refreshData.session.refresh_token, { ...base, httpOnly: true });
          }
        }
      } catch {
        // Refresh failed
      }
    }

    if (!user) {
      return { allowed: false, ip, userAgent };
    }

    const { data: publicUser } = await supabase
      .from('users')
      .select('id, role, is_admin, email')
      .eq('id', user.id)
      .maybeSingle();

    let role: AdminRole | undefined = undefined;
    const roleStr = publicUser?.role || user.user_metadata?.role;
    if (roleStr && (ADMIN_ROLES as readonly string[]).includes(roleStr)) {
      role = roleStr as AdminRole;
    } else if (publicUser?.is_admin === true) {
      role = 'super_admin';
    }

    if (!role) {
      return {
        allowed: false,
        actorEmail: user.email || publicUser?.email || '',
        actorId: user.id,
        ip,
        userAgent,
      };
    }

    const modulePerms = ROLE_PERMISSIONS[role]?.[module];
    const isAllowed = Boolean(modulePerms && (modulePerms as any)[action]);

    return {
      allowed: isAllowed,
      role,
      actorEmail: user.email || publicUser?.email || '',
      actorId: user.id,
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
  let slug = String(getVal('slug') || existingRecord?.slug || '').trim();
  if (!slug && name) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

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

    const payload = await buildProductPayloadFromFormData(formData, oldRecord);

    const { data: record, error } = await supabase
      .from('products')
      .update(payload)
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
      .select('id, slug, count_in_stock, price, discount_price')
      .eq('id', data.productId)
      .single();
    if (prodErr || !product) return { success: false, error: 'Product not found.' };

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

export async function getAdminCustomersAction() {
  const check = await checkPermission('users', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return { success: true, data: data || [] };
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

export async function getAdminOrdersAction() {
  const check = await checkPermission('orders', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized permission.', data: [] };

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    return {
      success: true,
      data: data || [],
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
    
    const updateData: Record<string, any> = { status, updated_at: new Date().toISOString() };
    if (status === 'delivered') {
      updateData.is_delivered = true;
      updateData.delivered_at = new Date().toISOString();
    } else if (status === 'shipped') {
      updateData.is_delivered = false;
    }

    const { data: record, error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

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
            items: orderItems.map((i: any) => ({ name: i.name || 'Product', qty: i.quantity || i.qty || 1 })),
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

    const updateData: Record<string, any> = {
      is_paid: true,
      paid_at: new Date().toISOString(),
      status: 'processing',
      updated_at: new Date().toISOString(),
    };

    const { data: record, error: updateErr } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Approve the order (previously pocketbase version also ran deductStockForConfirmedOrderAction)
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
  const check = await checkPermission('systemConfig', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

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
  const check = await checkPermission('systemConfig', 'read');
  if (!check.allowed) return { success: false, error: 'Unauthorized.', data: [] };

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
        const supabase = getAdminSupabase();
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

    return { success: true, data: { sale, items } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sale.';
    return { success: false, error: message };
  }
}

export async function verifyManagerPinAction(pin: string): Promise<{
  success: boolean;
  managerName?: string;
  error?: string;
}> {
  try {
    const cleanPin = typeof pin === 'string' ? pin.trim() : '';
    if (!cleanPin || cleanPin.length < 4) {
      return { success: false, error: 'Valid PIN is required.' };
    }

    const supabase = getAdminSupabase();

    // 1. Query users table for privileged user matching PIN
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('id, name, email, role, is_admin, pin')
      .eq('pin', cleanPin)
      .limit(10);

    if (userErr) {
      console.error('[verifyManagerPinAction] Database error querying users:', userErr);
      return { success: false, error: 'Authentication verification failed.' };
    }

    const privilegedUser = (users || []).find((u) => {
      const role = typeof u.role === 'string' ? u.role.toLowerCase() : '';
      return (
        u.is_admin === true ||
        role === 'manager' ||
        role === 'admin' ||
        role === 'super_admin' ||
        role === 'superuser' ||
        role === 'owner' ||
        role === 'store_manager'
      );
    });

    if (privilegedUser) {
      return {
        success: true,
        managerName: privilegedUser.name || privilegedUser.email || 'Manager',
      };
    }

    // 2. Query employees table for active manager matching PIN
    const { data: employees, error: empErr } = await supabase
      .from('employees')
      .select('id, name, pin, role, is_active, isActive')
      .eq('pin', cleanPin)
      .limit(10);

    if (empErr) {
      console.error('[verifyManagerPinAction] Database error querying employees:', empErr);
      return { success: false, error: 'Authentication verification failed.' };
    }

    const managerEmp = (employees || []).find((e) => {
      const role = typeof e.role === 'string' ? e.role.toLowerCase() : '';
      const active = e.is_active !== false && (e as { isActive?: boolean }).isActive !== false;
      return active && (role === 'manager' || role === 'admin');
    });

    if (managerEmp) {
      return {
        success: true,
        managerName: managerEmp.name || 'Manager',
      };
    }

    return { success: false, error: 'Invalid Manager or Admin PIN.' };
  } catch (err) {
    console.error('[verifyManagerPinAction] Error:', err);
    return { success: false, error: 'PIN verification failed.' };
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to void sale.';
    return { success: false, error: message };
  }
}

// ─── POS — Customers ──────────────────────────────────────────────────────────

export async function searchPosCustomersAction(query: string) {
  try {
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

export async function getUnifiedSalesTrackerAction() {
  try {
    const [sales, ordersRes] = await Promise.all([
      pbSales.getAll(),
      pbOrders.getAll(),
    ]);

    const salesList = Array.isArray(sales) ? sales : (sales as any)?.items || [];
    const ordersList = Array.isArray(ordersRes) ? ordersRes : (ordersRes as any)?.items || [];

    const posSalesFormatted = salesList.map((s: any) => ({
      id: s.id,
      receiptNumber: s.receipt_number || s.receiptNumber || `FTC-POS-${s.id.slice(-6).toUpperCase()}`,
      date: s.date || s.created || s.created_at || s.updated,
      customerName: s.customer_name || s.customerName || 'Walk-in Customer',
      customerEmail: s.customer_email || s.customerEmail || '—',
      itemsCount: s.items_count || s.itemsCount || 1,
      total: s.total || 0,
      discount: s.discount || 0,
      paymentMethod: s.payment_method || s.paymentMethod || 'cash',
      status: s.status || 'completed',
      source: 'POS Terminal',
    }));

    const onlineOrdersFormatted = ordersList.map((o: any) => {
      let itemsCount = 1;
      if (Array.isArray(o.items)) {
        itemsCount = o.items.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0);
      } else if (o.items && typeof o.items === 'object') {
        itemsCount = Object.keys(o.items).length;
      }
      
      let customerName = 'Online Customer';
      if (o.customer?.name) {
        customerName = o.customer.name;
      } else if (o.shippingAddress?.firstName) {
        customerName = `${o.shippingAddress.firstName} ${o.shippingAddress.lastName || ''}`.trim();
      }

      return {
        id: o.id,
        receiptNumber: o.orderId || `FTC-ONL-${o.id.slice(-6).toUpperCase()}`,
        date: o.created || o.created_at || o.updated,
        customerName,
        customerEmail: o.customer?.email || o.email || '—',
        itemsCount,
        total: o.total || 0,
        discount: 0,
        paymentMethod: o.paymentDetails?.method || 'card',
        status: o.status === 'cancelled' ? 'voided' : 'completed',
        source: 'Online Store',
      };
    });

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

export async function getAdminProductsAction() {
  const check = await checkPermission('products', 'read');
  if (!check.allowed) {
    console.log('[getAdminProductsAction] Unauthorized: missing products:read permission');
    return { success: false, error: 'Unauthorized.', data: [] };
  }

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('products')
      .select(`*, categories:category_id(id, name), brands:brand_id(id, name)`)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error('[getAdminProductsAction] DB Error:', error);
      throw error;
    }



    const normalized = (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description || '',
      images: Array.isArray(p.images) ? p.images : [],
      price: p.price || 0,
      discountPrice: p.discount_price ?? null,
      discount_price: p.discount_price ?? null,
      specs: p.specs || {},
      rating: p.rating || 0,
      numReviews: p.num_reviews || 0,
      countInStock: p.count_in_stock ?? 0,
      count_in_stock: p.count_in_stock ?? 0,
      category: p.categories?.name || '',
      brand: p.brands?.name || '',
      category_id: p.category_id,
      brand_id: p.brand_id,
      currency: p.currency || 'LKR',
      badges: p.badges || [],
      is_featured: p.is_featured || false,
      createdAt: p.created_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return { success: true, data: normalized };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch admin products.', data: [] };
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
    discount_type?: 'flat' | 'percent';
    discount_value?: number;
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
    }

    const validatedItems = data.items.map((item) => {
      const safeQty = Math.floor(Number(item.qty));
      const safePrice = Math.max(0, Number(item.unitPrice) || 0);
      return {
        ...item,
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

    const { createDealerIfNew, createCustomerIfNew, ...payloadData } = data;
    const payload = {
      ...payloadData,
      items: validatedItems,
      subtotal,
      tax_amount: safeTax,
      discount_amount: calculatedDiscount,
      discount_type: discType,
      discount_value: clampedDiscountValue,
      total_amount: totalAmount,
      quote_type: data.quote_type || (data.customer_company ? 'wholesale' : 'direct'),
      dealer_id: data.dealer_id || null,
    };

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

    const items = quote.items.map((item: any) => ({
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
      items_count: items.reduce((acc: number, i: any) => acc + i.quantity, 0),
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
      const supabase = getAdminSupabase();
      const { data: ordersData, error: ordersErr } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!ordersErr && ordersData) {
        ordersData
          .filter((o: any) => 
            (o.status === 'pending' || o.status === 'processing' || !o.is_paid) && 
            o.status !== 'cancelled' && 
            o.status !== 'refunded' && 
            o.status !== 'returned'
          )
          .slice(0, 10)
          .forEach((o: any) => {
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





