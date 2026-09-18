import PocketBase from "pocketbase";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load env variables
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const pbUrl =
  process.env.POCKETBASE_URL ||
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  "https://ftc-db.codix.site";
const adminEmail =
  process.env.POCKETBASE_ADMIN_EMAIL ||
  process.env.POCKETBASE_SUPERUSER_EMAIL ||
  "admin@ftc.lk";
const adminPassword =
  process.env.POCKETBASE_ADMIN_PASSWORD ||
  process.env.POCKETBASE_SUPERUSER_PASSWORD ||
  "Admin123";

console.log("🏁 Starting PocketBase Multi-Stage Schema Sync (Clean Fields)...");
console.log(`🔗 Target URL: ${pbUrl}`);
console.log(`👤 Admin Email: ${adminEmail}`);

if (!pbUrl || !adminEmail || !adminPassword) {
  console.error(
    "❌ Missing configuration. Please verify environment variables.",
  );
  process.exit(1);
}

const pb = new PocketBase(pbUrl);
pb.autoCancellation(false);

// 1. Authenticate
async function authenticate() {
  try {
    await pb
      .collection("_superusers")
      .authWithPassword(adminEmail, adminPassword);
    console.log("🔑 Authenticated successfully as superuser.");
  } catch (err) {
    try {
      await pb.admins.authWithPassword(adminEmail, adminPassword);
      console.log("🔑 Authenticated successfully as admin (legacy).");
    } catch (legacyErr) {
      console.error(
        "❌ Authentication failed:",
        err.message,
        legacyErr.message,
      );
      process.exit(1);
    }
  }
}

// Helper to ensure collection base structure exists and has exact fields
// NOTE: We only manage custom fields. System fields (id, created, updated) are managed by PocketBase itself.
async function syncCollection(name, targetFields, rules) {
  try {
    const existing = await pb.collections.getOne(name);
    console.log(
      `⚙️  Collection "${name}" already exists. Syncing custom fields...`,
    );

    // We will separate system fields from custom fields
    const systemFields = existing.fields.filter((f) => f.system);
    const customFields = [...existing.fields.filter((f) => !f.system)];

    for (const tf of targetFields) {
      const existingFieldIdx = customFields.findIndex(
        (f) => f.name === tf.name,
      );
      if (existingFieldIdx >= 0) {
        const isTypeChanged = customFields[existingFieldIdx].type !== tf.type;
        const baseField = isTypeChanged ? { name: tf.name } : customFields[existingFieldIdx];
        customFields[existingFieldIdx] = {
          ...baseField,
          ...tf,
          required: tf.required === true,
        };
      } else {
        customFields.push({
          required: false,
          ...tf,
        });
      }
    }

    existing.fields = [...systemFields, ...customFields];
    if (rules.listRule !== undefined) existing.listRule = rules.listRule;
    if (rules.viewRule !== undefined) existing.viewRule = rules.viewRule;
    if (rules.createRule !== undefined) existing.createRule = rules.createRule;
    if (rules.updateRule !== undefined) existing.updateRule = rules.updateRule;
    if (rules.deleteRule !== undefined) existing.deleteRule = rules.deleteRule;
    if (rules.indexes !== undefined) existing.indexes = rules.indexes;

    const updated = await pb.collections.update(existing.id, existing);
    console.log(`✅ Collection "${name}" updated successfully.`);
    return updated;
  } catch (err) {
    // If not found, create it with only custom fields (PB will inject system fields automatically)
    const payload = {
      name,
      type: "base",
      fields: targetFields,
      ...rules,
    };
    try {
      const created = await pb.collections.create(payload);
      console.log(`✅ Collection "${name}" created.`);
      return created;
    } catch (createErr) {
      console.error(
        `❌ Failed to create collection "${name}":`,
        createErr.message,
      );
      if (createErr.response?.data) {
        console.error("Details:", JSON.stringify(createErr.response.data));
      }
      throw createErr;
    }
  }
}

async function run() {
  await authenticate();

  const catRules = {
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
  };

  // 1. Create/Sync Base Collections
  const catRecord = await syncCollection(
    "categories",
    [
      { name: "name", type: "text", required: true },
      { name: "slug", type: "text", required: true },
      { name: "description", type: "text" },
      {
        name: "image",
        type: "file",
        required: false,
        maxSelect: 1,
        maxSize: 5242880,
      },
      { name: "tagline", type: "text" },
      { name: "sortOrder", type: "number" },
      { name: "productCount", type: "number" },
    ],
    {
      ...catRules,
      indexes: ["CREATE UNIQUE INDEX idx_slug_categories ON categories (slug)"],
    },
  );

  const brandRecord = await syncCollection(
    "brands",
    [
      { name: "name", type: "text", required: true },
      { name: "slug", type: "text", required: true },
      {
        name: "logo",
        type: "file",
        required: false,
        maxSelect: 1,
        maxSize: 5242880,
      },
      {
        name: "bannerImage",
        type: "file",
        required: false,
        maxSelect: 1,
        maxSize: 5242880,
      },
      { name: "description", type: "text" },
      { name: "sortOrder", type: "number" },
      { name: "show_in_strip", type: "bool" },
    ],
    {
      ...catRules,
      indexes: ["CREATE UNIQUE INDEX idx_slug_brands ON brands (slug)"],
    },
  );

  const heroBannersRecord = await syncCollection(
    "hero_banners",
    [
      { name: "eyebrow", type: "text", required: false },
      { name: "titlePrefix", type: "text", required: false },
      { name: "titleHighlight", type: "text", required: true },
      { name: "description", type: "text", required: false },
      { name: "ctaText", type: "text", required: false },
      { name: "ctaSecondary", type: "text", required: false },
      { name: "link", type: "text", required: false },
      { name: "secondaryLink", type: "text", required: false },
      { name: "accentColor", type: "text", required: false },
      {
        name: "image",
        type: "file",
        required: false,
        maxSelect: 1,
        maxSize: 10485760, // 10MB
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        thumbs: ["600x0", "1200x0"],
      },
      { name: "imageAlt", type: "text" },
      { name: "sortOrder", type: "number" },
      { name: "isEnabled", type: "bool" },
    ],
    {
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    },
  );


  const productRecord = await syncCollection(
    "products",
    [
      { name: "name", type: "text", required: true },
      { name: "slug", type: "text", required: true },
      { name: "description", type: "text", max: 500000 },
      {
        name: "images",
        type: "file",
        required: false,
        maxSelect: 8,
        maxSize: 5242880,
      },
      { name: "price", type: "number", required: true },
      { name: "discountPrice", type: "number" },
      { name: "specs", type: "json" },
      { name: "rating", type: "number" },
      { name: "numReviews", type: "number" },
      { name: "countInStock", type: "number", required: false, min: 0 },
      { name: "isFeatured", type: "bool" },
      { name: "isPreOrder", type: "bool" },
      {
        name: "currency",
        type: "select",
        values: ["USD", "LKR"],
        maxSelect: 1,
      },
      { name: "badges", type: "json" },
      { name: "seoTitle", type: "text" },
      { name: "seoDescription", type: "text" },
      {
        name: "status",
        type: "select",
        values: ["draft", "published"],
        maxSelect: 1,
      },
      { name: "tags", type: "json" },
      {
        name: "bannerImage",
        type: "file",
        required: false,
        maxSelect: 1,
        maxSize: 10485760,
      },
      { name: "bannerText", type: "text" },
    ],
    {
      ...catRules,
      indexes: ["CREATE UNIQUE INDEX idx_slug_products ON products (slug)"],
    },
  );

  const reviewRecord = await syncCollection(
    "reviews",
    [
      { name: "customerName", type: "text", required: true },
      { name: "rating", type: "number", required: true },
      { name: "comment", type: "text", required: true },
      { name: "isVerified", type: "bool" },
      { name: "isFeatured", type: "bool" },
      {
        name: "status",
        type: "select",
        values: ["pending", "approved", "rejected"],
        maxSelect: 1,
      },
      {
        name: "photo",
        type: "file",
        required: false,
        maxSelect: 1,
        maxSize: 5242880,
      },
    ],
    {
      listRule: 'status = "approved"',
      viewRule: 'status = "approved"',
      createRule: "",
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const promotionRecord = await syncCollection(
    "promotions",
    [
      { name: "name", type: "text", required: true },
      {
        name: "type",
        type: "select",
        values: ["percentage", "flat"],
        maxSelect: 1,
      },
      { name: "discountValue", type: "number", required: true },
      { name: "applicableTo", type: "json" },
      { name: "couponCode", type: "text" },
      { name: "usageLimit", type: "number" },
      { name: "usageCount", type: "number" },
      { name: "minOrderValue", type: "number" },
      { name: "startDate", type: "date", required: true },
      { name: "endDate", type: "date", required: true },
      { name: "isActive", type: "bool" },
    ],
    {
      indexes: [
        'CREATE UNIQUE INDEX idx_code_promotions ON promotions (couponCode) WHERE couponCode != ""',
      ],
      listRule: null,
      viewRule: null,
      createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const homepageBlocksRecord = await syncCollection(
    "homepage_blocks",
    [
      {
        name: "type",
        type: "select",
        values: [
          "hero-banner",
          "product-carousel",
          "promo-banner",
          "brand-logo-strip",
          "category-grid",
          "reviews-carousel",
          "text-content",
          "store-locator",
        ],
        maxSelect: 1,
        required: true,
      },
      { name: "title", type: "text" },
      { name: "config", type: "json" },
      { name: "sortOrder", type: "number" },
      { name: "isEnabled", type: "bool" },
      { name: "scheduledStart", type: "date" },
      { name: "scheduledEnd", type: "date" },
      {
        name: "deviceVisibility",
        type: "select",
        values: ["all", "desktop-only", "mobile-only"],
        maxSelect: 1,
      },
    ],
    {
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const siteSettingsRecord = await syncCollection(
    "site_settings",
    [
      { name: "key", type: "text", required: true },
      { name: "value", type: "json", required: true },
    ],
    {
      indexes: ["CREATE UNIQUE INDEX idx_key_settings ON site_settings (key)"],
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const mediaRecord = await syncCollection(
    "media",
    [
      {
        name: "file",
        type: "file",
        required: true,
        maxSelect: 1,
        maxSize: 10485760,
      },
      { name: "name", type: "text" },
      { name: "tags", type: "json" },
      { name: "usedIn", type: "json" },
      { name: "altText", type: "text" },
      { name: "width", type: "number" },
      { name: "height", type: "number" },
      { name: "mimeType", type: "text" },
      { name: "sizeBytes", type: "number" },
    ],
    {
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const stockPurchasesRecord = await syncCollection(
    "stock_purchases",
    [
      { name: "batchNumber", type: "text", required: true },
      { name: "quantity", type: "number", required: true },
      { name: "unitCost", type: "number" },
      { name: "supplier", type: "text" },
      { name: "purchaseDate", type: "text" },
      { name: "notes", type: "text" },
    ],
    {
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const stockManagementRecord = await syncCollection(
    "stock_management",
    [
      { name: "barcode", type: "text", required: true },
      { name: "serialNumber", type: "text" },
      {
        name: "status",
        type: "select",
        values: ["available", "reserved", "sold", "defective", "returned"],
        maxSelect: 1,
      },
      { name: "batchNumber", type: "text" },
      { name: "orderId", type: "text" },
      { name: "notes", type: "text" },
    ],
    {
      indexes: ["CREATE UNIQUE INDEX idx_barcode_stock ON stock_management (barcode)"],
      listRule: "",
      viewRule: "",
      createRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const auditLogRecord = await syncCollection(
    "audit_log",
    [
      { name: "actor", type: "text", required: true },
      { name: "action", type: "text", required: true },
      { name: "collection", type: "text", required: true },
      { name: "recordId", type: "text" },
      { name: "oldValue", type: "text" },
      { name: "newValue", type: "text" },
      { name: "ip", type: "text" },
      { name: "userAgent", type: "text" },
    ],
    {
      listRule:
        '@request.auth.id != "" && (@request.auth.role = "super_admin" || @request.auth.role = "store_manager")',
      viewRule:
        '@request.auth.id != "" && (@request.auth.role = "super_admin" || @request.auth.role = "store_manager")',
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  );

  const ordersRecord = await syncCollection(
    "orders",
    [
      { name: "orderId", type: "text", required: true },
      { name: "customer", type: "json" },
      { name: "items", type: "json", required: true },
      { name: "shippingAddress", type: "json" },
      { name: "paymentDetails", type: "json" },
      { name: "subtotal", type: "number", required: true },
      { name: "shipping", type: "number", required: true },
      { name: "tax", type: "number", required: true },
      { name: "total", type: "number", required: true },
      {
        name: "status",
        type: "select",
        values: [
          "pending",
          "processing",
          "shipped",
          "delivered",
          "cancelled",
          "refunded",
        ],
        maxSelect: 1,
      },
      { name: "isPaid", type: "bool" },
      { name: "paidAt", type: "date" },
      { name: "isDelivered", type: "bool" },
      { name: "deliveredAt", type: "date" },
      { name: "notes", type: "text" },
    ],
    {
      indexes: ["CREATE UNIQUE INDEX idx_orderid_orders ON orders (orderId)"],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  const customerRecord = await syncCollection(
    "customers",
    [
      { name: "name", type: "text", required: true },
      { name: "email", type: "text" },
      { name: "phone", type: "text" },
      { name: "ordersCount", type: "number" },
      { name: "totalSpent", type: "number" },
      {
        name: "status",
        type: "select",
        values: ["active", "banned"],
        maxSelect: 1,
      },
      { name: "notes", type: "text" },
    ],
    {
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != "" && @request.auth.role = "admin"',
      deleteRule: '@request.auth.id != "" && @request.auth.role = "admin"',
    },
  );

  await syncCollection(
    "users",
    [
      { name: "name", type: "text" },
      { name: "pin", type: "text" },
      {
        name: "role",
        type: "select",
        values: ["admin", "employee", "manager"],
        maxSelect: 1,
      },
    ],
    {
      listRule: 'id = @request.auth.id',
      viewRule: 'id = @request.auth.id',
      createRule: '',
      updateRule: 'id = @request.auth.id',
      deleteRule: 'id = @request.auth.id',
    },
  );

  // 2. Fetch all collection IDs to satisfy relation constraints
  const allCollections = await pb.collections.getFullList();
  const getColId = (name) => allCollections.find((c) => c.name === name)?.id;

  const categoriesId = getColId("categories");
  const brandsId = getColId("brands");
  const productsId = getColId("products");

  console.log(`⚙️  Loaded Collection IDs for Relations:
  - categories: ${categoriesId}
  - brands: ${brandsId}
  - products: ${productsId}`);

  // 3. Inject relation fields into categories, products, and reviews
  console.log("🔄 Injecting relations into collections...");

  // Update categories (inject parentCategory self-relation)
  const catObj = allCollections.find((c) => c.name === "categories");
  if (catObj && !catObj.fields.some((f) => f.name === "parentCategory")) {
    catObj.fields.push({
      name: "parentCategory",
      type: "relation",
      collectionId: categoriesId,
      maxSelect: 1,
    });
    await pb.collections.update(categoriesId, catObj);
    console.log("🔗 Injected categories.parentCategory self-relation.");
  }

  // Update products (inject category and brand relations)
  const prodObj = allCollections.find((c) => c.name === "products");
  let prodUpdated = false;
  if (prodObj) {
    if (!prodObj.fields.some((f) => f.name === "category")) {
      prodObj.fields.push({
        name: "category",
        type: "relation",
        required: true,
        collectionId: categoriesId,
        maxSelect: 1,
      });
      prodUpdated = true;
    }
    if (!prodObj.fields.some((f) => f.name === "brand")) {
      prodObj.fields.push({
        name: "brand",
        type: "relation",
        required: true,
        collectionId: brandsId,
        maxSelect: 1,
      });
      prodUpdated = true;
    }
    if (prodUpdated) {
      await pb.collections.update(productsId, prodObj);
      console.log(
        "🔗 Injected products.category and products.brand relations.",
      );
    }
  }

  // Update reviews (inject product relation)
  const revObj = allCollections.find((c) => c.name === "reviews");
  const reviewsId = getColId("reviews");
  if (revObj && !revObj.fields.some((f) => f.name === "product")) {
    revObj.fields.push({
      name: "product",
      type: "relation",
      required: true,
      collectionId: productsId,
      maxSelect: 1,
    });
    await pb.collections.update(reviewsId, revObj);
    console.log("🔗 Injected reviews.product relation.");
  }

  // Update stock_purchases (inject product relation)
  const stockPurchasesId = getColId("stock_purchases");
  const stockPurchasesObj = allCollections.find((c) => c.name === "stock_purchases");
  if (stockPurchasesObj && !stockPurchasesObj.fields.some((f) => f.name === "product")) {
    stockPurchasesObj.fields.push({
      name: "product",
      type: "relation",
      required: true,
      collectionId: productsId,
      maxSelect: 1,
    });
    await pb.collections.update(stockPurchasesId, stockPurchasesObj);
    console.log("🔗 Injected stock_purchases.product relation.");
  }

  // Update stock_management (inject product relation)
  const stockManagementId = getColId("stock_management");
  const stockManagementObj = allCollections.find((c) => c.name === "stock_management");
  if (stockManagementObj && !stockManagementObj.fields.some((f) => f.name === "product")) {
    stockManagementObj.fields.push({
      name: "product",
      type: "relation",
      required: true,
      collectionId: productsId,
      maxSelect: 1,
    });
    await pb.collections.update(stockManagementId, stockManagementObj);
    console.log("🔗 Injected stock_management.product relation.");
  }

  console.log("🎉 PocketBase Schema Setup Complete!");
}

run().catch((err) => {
  console.error("❌ Schema setup failed unexpectedly:", err);
  process.exit(1);
});
