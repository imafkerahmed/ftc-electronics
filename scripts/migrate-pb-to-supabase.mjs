import PocketBase from "pocketbase";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// =================================================================
// 1. CONFIGURATION & ENVIRONMENT LOADING
// =================================================================
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const POCKETBASE_URL =
  process.env.POCKETBASE_URL ||
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  "https://ftc-db.codix.site";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://supa-ftc.codix.site";

// Service role key for admin-level bypass of RLS during migration
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// PocketBase Admin / Superuser Credentials
const PB_ADMIN_EMAIL =
  process.env.POCKETBASE_ADMIN_EMAIL ||
  process.env.POCKETBASE_SUPERUSER_EMAIL ||
  process.env.PB_ADMIN_EMAIL ||
  "admin@ftc.lk";

const PB_ADMIN_PASSWORD =
  process.env.POCKETBASE_ADMIN_PASSWORD ||
  process.env.POCKETBASE_SUPERUSER_PASSWORD ||
  process.env.PB_ADMIN_PASSWORD ||
  "Admin123";

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

/**
 * Convert a 15-character PocketBase ID to a deterministic UUID v4 string.
 * Uses MD5 hashing to ensure the exact same PB ID always produces the same UUID.
 */
function pbIdToUuid(pbId) {
  if (!pbId || typeof pbId !== "string" || pbId.trim() === "") return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(pbId)) return pbId;
  const hash = crypto.createHash("md5").update(pbId).digest("hex");
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

/**
 * Safely format ISO timestamps or return null/fallback (avoiding empty string "" errors in PostgreSQL timestamptz columns).
 */
function formatTimestamp(dateStr, fallbackToNow = false) {
  if (!dateStr || typeof dateStr !== "string" || dateStr.trim() === "") {
    return fallbackToNow ? new Date().toISOString() : null;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return fallbackToNow ? new Date().toISOString() : null;
  }
  return d.toISOString();
}

// =================================================================
// 3. INITIALIZE CLIENTS
// =================================================================
const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false); // Disable auto-cancelling for batch requests

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Authenticate PocketBase Admin
async function authenticatePB() {
  console.log(`🔗 Connecting to PocketBase at: ${POCKETBASE_URL}`);
  console.log(`🔗 Connecting to Supabase at: ${SUPABASE_URL}`);
  try {
    // PocketBase v0.23+ superuser auth
    await pb
      .collection("_superusers")
      .authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
    console.log("🔑 Authenticated with PocketBase as Superuser.");
  } catch (e1) {
    try {
      // Legacy PocketBase admin auth
      await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
      console.log("🔑 Authenticated with PocketBase as Admin.");
    } catch (e2) {
      console.warn(
        `⚠️ PocketBase admin auth skipped or failed.\n   Superuser error: ${e1.message}\n   Legacy admin error: ${e2.message}\n   Proceeding with unauthenticated fetch...`
      );
    }
  }
}

// Helper to batch migrate a collection
async function migrateCollection(pbCollection, supabaseTable, mapRecordFn, batchSize = 100) {
  console.log(
    `\n⏳ Fetching records from PocketBase collection: "${pbCollection}"...`
  );
  try {
    const records = await pb
      .collection(pbCollection)
      .getFullList({ requestKey: null });

    if (records.length === 0) {
      console.log(`ℹ️ No records found for "${pbCollection}". Skipping.`);
      return;
    }

    console.log(
      `📦 Formatting ${records.length} records for Supabase table "${supabaseTable}"...`
    );
    const formatted = records.map(mapRecordFn);

    console.log(`🚀 Upserting into Supabase table "${supabaseTable}" in batches of ${batchSize}...`);
    
    let totalSuccess = 0;
    for (let i = 0; i < formatted.length; i += batchSize) {
      const batch = formatted.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from(supabaseTable)
        .upsert(batch);

      if (error) {
        if (error.code === "42P01" || error.message.includes("Could not find the table")) {
          console.warn(`⚠️ Table "${supabaseTable}" does not exist in Supabase schema. Skipping migration for "${pbCollection}".`);
          return;
        }
        console.error(
          `❌ Error migrating batch ${Math.floor(i / batchSize) + 1} for "${pbCollection}" -> "${supabaseTable}":`,
          error.message,
          error.details ? `| Details: ${error.details}` : "",
          error.hint ? `| Hint: ${error.hint}` : ""
        );
      } else {
        totalSuccess += batch.length;
      }
    }

    if (totalSuccess === records.length) {
      console.log(
        `✅ Successfully migrated ${records.length} records to "${supabaseTable}"!`
      );
    } else {
      console.log(
        `⚠️ Migrated ${totalSuccess}/${records.length} records to "${supabaseTable}".`
      );
    }
  } catch (err) {
    console.error(
      `❌ Failed fetching from PocketBase collection "${pbCollection}":`,
      err.message || err,
      err.response?.data ? JSON.stringify(err.response.data) : ""
    );
  }
}

// =================================================================
// 4. MIGRATION EXECUTION
// =================================================================
async function runMigration() {
  console.log("🚀 Starting PocketBase to Supabase Migration...");
  await authenticatePB();

  // Track valid IDs to enforce foreign key integrity
  const validBrandIds = new Set();
  const validCategoryIds = new Set();
  const validProductIds = new Set();
  const validEmployeeIds = new Set();
  const validCustomerIds = new Set();
  const validSaleIds = new Set();

  // 1. BRANDS
  await migrateCollection("brands", "brands", (r) => {
    const uuid = pbIdToUuid(r.id);
    validBrandIds.add(uuid);
    validBrandIds.add(r.id);
    return {
      id: uuid,
      name: r.name,
      slug: r.slug,
      logo: r.logo || null,
      banner_image: r.bannerImage || null,
      description: r.description || null,
      sort_order: r.sortOrder || 0,
      show_in_strip: r.show_in_strip || false,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  // 2. CATEGORIES
  await migrateCollection("categories", "categories", (r) => {
    const uuid = pbIdToUuid(r.id);
    validCategoryIds.add(uuid);
    validCategoryIds.add(r.id);
    const parentUuid = pbIdToUuid(r.parentCategory);
    return {
      id: uuid,
      name: r.name,
      slug: r.slug,
      description: r.description || null,
      image: r.image || null,
      tagline: r.tagline || null,
      sort_order: r.sortOrder || 0,
      product_count: r.productCount || 0,
      parent_category_id: validCategoryIds.has(parentUuid) ? parentUuid : null,
      is_active: r.isActive ?? true,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  // 3. PRODUCTS
  await migrateCollection("products", "products", (r) => {
    const uuid = pbIdToUuid(r.id);
    validProductIds.add(uuid);
    validProductIds.add(r.id);

    const catUuid = pbIdToUuid(r.category);
    const brandUuid = pbIdToUuid(r.brand);

    return {
      id: uuid,
      name: r.name,
      slug: r.slug,
      description: r.description || null,
      images: Array.isArray(r.images) ? r.images : r.images ? [r.images] : [],
      price: r.price,
      discount_price: r.discountPrice || null,
      specs: r.specs || {},
      rating: r.rating || 0,
      num_reviews: r.numReviews || 0,
      count_in_stock: r.countInStock || 0,
      is_featured: r.isFeatured || false,
      is_pre_order: r.isPreOrder || false,
      currency: r.currency || "LKR",
      badges: r.badges || [],
      seo_title: r.seoTitle || null,
      seo_description: r.seoDescription || null,
      status: r.status || "published",
      tags: r.tags || [],
      category_id: validCategoryIds.has(catUuid) ? catUuid : null,
      brand_id: validBrandIds.has(brandUuid) ? brandUuid : null,
      banner_image: r.bannerImage || null,
      banner_text: r.bannerText || null,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  // 4. CUSTOMERS
  await migrateCollection("customers", "customers", (r) => {
    const uuid = pbIdToUuid(r.id);
    validCustomerIds.add(uuid);
    validCustomerIds.add(r.id);
    return {
      id: uuid,
      name: r.name,
      email: r.email || null,
      phone: r.phone || null,
      orders_count: r.ordersCount || 0,
      total_spent: r.totalSpent || 0,
      status: r.status || "active",
      notes: r.notes || null,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  // 5. EMPLOYEES & USERS
  await migrateCollection("employees", "employees", (r) => {
    const uuid = pbIdToUuid(r.id);
    validEmployeeIds.add(uuid);
    validEmployeeIds.add(r.id);
    return {
      id: uuid,
      name: r.name,
      pin: r.pin || null,
      role: r.role || "cashier",
      is_active: r.isActive ?? true,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  await migrateCollection("users", "users", (r) => ({
    id: pbIdToUuid(r.id),
    name: r.name || null,
    email: r.email || null,
    username: r.username || null,
    role: r.role || "employee",
    pin: r.pin || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  // 6. ORDERS
  await migrateCollection("orders", "orders", (r) => ({
    id: pbIdToUuid(r.id),
    order_id: r.orderId,
    customer: r.customer || {},
    items: r.items || [],
    shipping_address: r.shippingAddress || {},
    payment_details: r.paymentDetails || {},
    subtotal: r.subtotal,
    shipping: r.shipping || 0,
    tax: r.tax || 0,
    total: r.total,
    status: r.status || "pending",
    is_paid: r.isPaid || false,
    paid_at: formatTimestamp(r.paidAt),
    is_delivered: r.isDelivered || false,
    delivered_at: formatTimestamp(r.deliveredAt),
    notes: r.notes || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  // 7. SALES & SALE ITEMS
  await migrateCollection("sales", "sales", (r) => {
    const uuid = pbIdToUuid(r.id);
    validSaleIds.add(uuid);
    validSaleIds.add(r.id);

    const cashierUuid = pbIdToUuid(r.cashier_id);
    const customerUuid = pbIdToUuid(r.customer_id);

    return {
      id: uuid,
      receipt_number: r.receipt_number,
      cashier_name: r.cashier_name || null,
      cashier_id: validEmployeeIds.has(cashierUuid) ? cashierUuid : null,
      customer_name: r.customer_name || null,
      customer_phone: r.customer_phone || null,
      customer_email: r.customer_email || null,
      customer_id: validCustomerIds.has(customerUuid) ? customerUuid : null,
      subtotal: r.subtotal,
      discount: r.discount || 0,
      tax_amount: r.tax_amount || 0,
      total: r.total,
      payment_method: r.payment_method || null,
      cash_tendered: r.cash_tendered || 0,
      change_due: r.change_due || 0,
      items_count: r.items_count || 0,
      status: r.status || "completed",
      notes: r.notes || null,
      date: formatTimestamp(r.date) || formatTimestamp(r.created, true),
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  await migrateCollection("sale_items", "sale_items", (r) => {
    const saleUuid = pbIdToUuid(r.sale);
    const prodUuid = pbIdToUuid(r.product_id);

    return {
      id: pbIdToUuid(r.id),
      sale_id: validSaleIds.has(saleUuid) ? saleUuid : null,
      product_id: validProductIds.has(prodUuid) ? prodUuid : null,
      product_name: r.product_name,
      sku: r.sku || null,
      unit_price: r.unit_price,
      item_discount: r.item_discount || 0,
      unit_cost: r.unit_cost || 0,
      quantity: r.quantity,
      line_total: r.line_total,
      unit_id: r.unit_id || null,
      unit_barcode: r.unit_barcode || null,
      unit_serial: r.unit_serial || null,
      image_url: r.image_url || null,
      category: r.category || null,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  // 8. PROMOTIONS
  await migrateCollection("promotions", "promotions", (r) => ({
    id: pbIdToUuid(r.id),
    name: r.name,
    type: r.type,
    discount_value: r.discountValue,
    applicable_to: r.applicableTo || [],
    coupon_code: r.couponCode || null,
    usage_limit: r.usageLimit || null,
    usage_count: r.usageCount || 0,
    min_order_value: r.minOrderValue || 0,
    start_date: formatTimestamp(r.startDate, true),
    end_date: formatTimestamp(r.endDate, true),
    is_active: r.isActive ?? true,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  // 9. REVIEWS
  await migrateCollection("reviews", "reviews", (r) => {
    const prodUuid = pbIdToUuid(r.product);
    return {
      id: pbIdToUuid(r.id),
      customer_name: r.customerName,
      rating: r.rating,
      comment: r.comment,
      is_verified: r.isVerified || false,
      is_featured: r.isFeatured || false,
      status: r.status || "pending",
      photo: r.photo || null,
      product_id: validProductIds.has(prodUuid) ? prodUuid : null,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  // 10. STOCK MANAGEMENT & PURCHASES
  await migrateCollection("stock_management", "stock_management", (r) => {
    const prodUuid = pbIdToUuid(r.product);
    return {
      id: pbIdToUuid(r.id),
      barcode: r.barcode,
      serial_number: r.serialNumber || null,
      status: r.status || "available",
      batch_number: r.batchNumber || null,
      order_id: r.orderId || null,
      notes: r.notes || null,
      product_id: validProductIds.has(prodUuid) ? prodUuid : null,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  await migrateCollection("stock_purchases", "stock_purchases", (r) => {
    const prodUuid = pbIdToUuid(r.product);
    return {
      id: pbIdToUuid(r.id),
      batch_number: r.batchNumber,
      quantity: r.quantity,
      unit_cost: r.unitCost || 0,
      supplier: r.supplier || null,
      purchase_date: formatTimestamp(r.purchaseDate) || formatTimestamp(r.created, true),
      notes: r.notes || null,
      product_id: validProductIds.has(prodUuid) ? prodUuid : null,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    };
  });

  // 11. ANNOUNCEMENTS, BANNERS & SETTINGS
  await migrateCollection("announcements", "announcements", (r) => ({
    id: pbIdToUuid(r.id),
    title: r.title,
    image: r.image || null,
    link: r.link || null,
    is_active: r.isActive ?? true,
    ends_at: formatTimestamp(r.endsAt),
    description: r.description || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  await migrateCollection("hero_banners", "hero_banners", (r) => ({
    id: pbIdToUuid(r.id),
    eyebrow: r.eyebrow || null,
    title_prefix: r.titlePrefix || null,
    title_highlight: r.titleHighlight,
    description: r.description || null,
    cta_text: r.ctaText || null,
    cta_secondary: r.ctaSecondary || null,
    link: r.link || null,
    secondary_link: r.secondaryLink || null,
    accent_color: r.accentColor || null,
    image_src: r.imageSrc || null,
    image_alt: r.imageAlt || null,
    sort_order: r.sortOrder || 0,
    is_enabled: r.isEnabled ?? true,
    image: r.image || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  await migrateCollection("homepage_blocks", "homepage_blocks", (r) => ({
    id: pbIdToUuid(r.id),
    type: r.type,
    title: r.title || null,
    config: r.config || {},
    sort_order: r.sortOrder || 0,
    is_enabled: r.isEnabled ?? true,
    scheduled_start: formatTimestamp(r.scheduledStart),
    scheduled_end: formatTimestamp(r.scheduledEnd),
    device_visibility: r.deviceVisibility || "all",
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  await migrateCollection("site_settings", "site_settings", (r) => ({
    id: pbIdToUuid(r.id),
    key: r.key,
    value: r.value || {},
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  await migrateCollection("wholesale_dealers", "wholesale_dealers", (r) => ({
    id: pbIdToUuid(r.id),
    company_name: r.company_name,
    contact_name: r.contact_name,
    email: r.email,
    phone: r.phone || null,
    tax_id: r.tax_id || null,
    address: r.address || null,
    discount_rate: r.discount_rate || 0,
    credit_limit: r.credit_limit || 0,
    status: r.status || "pending",
    notes: r.notes || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  await migrateCollection("quotations", "quotations", (r) => ({
    id: pbIdToUuid(r.id),
    quote_number: r.quote_number,
    customer_name: r.customer_name,
    customer_company: r.customer_company || null,
    customer_email: r.customer_email || null,
    customer_phone: r.customer_phone || null,
    customer_address: r.customer_address || null,
    items: r.items || [],
    subtotal: r.subtotal,
    tax_amount: r.tax_amount || 0,
    discount_amount: r.discount_amount || 0,
    total_amount: r.total_amount,
    valid_until: formatTimestamp(r.valid_until),
    status: r.status || "draft",
    notes: r.notes || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  await migrateCollection(
    "system_configurations",
    "system_configurations",
    (r) => ({
      id: pbIdToUuid(r.id),
      category: r.category,
      label: r.label,
      config: r.config || {},
      is_default: r.isDefault || false,
      created_at: formatTimestamp(r.created, true),
      updated_at: formatTimestamp(r.updated, true),
    })
  );

  // 12. MEDIA & AUDIT LOG
  await migrateCollection("media", "media", (r) => ({
    id: pbIdToUuid(r.id),
    file: r.file,
    name: r.name || null,
    tags: r.tags || [],
    used_in: r.usedIn || [],
    alt_text: r.altText || null,
    width: r.width || null,
    height: r.height || null,
    mime_type: r.mimeType || null,
    size_bytes: r.sizeBytes || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  await migrateCollection("audit_log", "audit_log", (r) => ({
    id: pbIdToUuid(r.id),
    actor: r.actor,
    action: r.action,
    collection: r.collection,
    record_id: pbIdToUuid(r.recordId) || r.recordId || null,
    old_value: r.oldValue || null,
    new_value: r.newValue || null,
    ip: r.ip || null,
    user_agent: r.userAgent || null,
    created_at: formatTimestamp(r.created, true),
    updated_at: formatTimestamp(r.updated, true),
  }));

  console.log("\n🎉 ALL DATA MIGRATION COMPLETED SUCCESSFULLY!");
}

runMigration();


