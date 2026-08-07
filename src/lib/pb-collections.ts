/**
 * Typed PocketBase collection wrappers for the FTC Electronics CMS.
 *
 * These functions provide a clean API over PocketBase's generic SDK,
 * with proper TypeScript types, error handling, and image URL resolution.
 *
 * Usage in server components / server actions:
 *   import { pbProducts, pbCategories } from '@/lib/pb-collections';
 *   const products = await pbProducts.getAll();
 *   const product = await pbProducts.getBySlug('apexbook-pro-16');
 */

import PocketBase, { type RecordListOptions } from "pocketbase";
import { pb } from "./pocketbase";
import { getAdminPb, getPbUrl } from "./pb-admin";
import type {
  PBRecord,
  PBProduct,
  PBCategory,
  PBBrand,
  PBReview,
  PBOrder,
  PBHomepageBlock,
  PBHeroBanner,
  PBPromotion,
  PBAnnouncement,
  PBAuditLog,
  PBSiteSetting,
  PBCustomer,
  PBWholesaleDealer,
  PBQuotation,
  PBContactInquiry,
} from "@/types/admin";
import { pbProductToProduct, pbCategoryToCategory, getPbFileUrl } from "@/types/admin";
import type { Product, Category } from "@/types/product";
import type { PBEmployee, PBSale, PBSaleItem, SalePayload } from "@/types/pos";

// ─── Error Handling ───────────────────────────────────────────────────────────

export class PBError extends Error {
  constructor(
    message: string,
    public readonly code: number = 0,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "PBError";
  }
}

function handleError(err: unknown, context: string): never {
  if (err instanceof PBError) throw err;

  const pbErr = err as {
    status?: number;
    message?: string;
    response?: { message?: string; data?: Record<string, any> };
  };
  let message = pbErr?.response?.message || pbErr?.message || "Unknown error";

  // Translate referential database integrity errors into helpful human-readable instructions
  if (
    message.toLowerCase().includes("relation reference") ||
    message.toLowerCase().includes("delete restriction")
  ) {
    if (context.includes("pbCategories")) {
      message =
        "Cannot delete category because there are products or subcategories referencing it. Please reassign or delete those items first.";
    } else if (context.includes("pbBrands")) {
      message =
        "Cannot delete brand because there are products referencing it. Please reassign or delete those products first.";
    } else if (context.includes("pbProducts")) {
      message =
        "Cannot delete product because it is referenced in orders, reviews, or active homepage blocks.";
    }
  }

  if (pbErr?.response?.data && Object.keys(pbErr.response.data).length > 0) {
    const details = Object.entries(pbErr.response.data)
      .map(
        ([key, val]: [string, any]) =>
          `${key}: ${val.message || JSON.stringify(val)}`,
      )
      .join(", ");
    message = `${message} (Validation errors - ${details})`;
  }
  const code = pbErr?.status || 0;

  throw new PBError(`[${context}] ${message}`, code, err);
}

// ─── Client selector ─────────────────────────────────────────────────────────
// Use the public client for read operations (storefront),
// and the admin client for write operations (admin panel).

function getPublicPb(): PocketBase {
  return pb;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export const pbProducts = {
  /**
   * Get all published products with optional filtering and pagination.
   */
  async getAll(options?: {
    page?: number;
    perPage?: number;
    filter?: string;
    sort?: string;
    category?: string;
    brand?: string;
    search?: string;
    status?: "draft" | "published";
  }): Promise<{ items: Product[]; totalItems: number; totalPages: number }> {
    try {
      const pbClient = getPublicPb();
      const pbUrl = getPbUrl();

      const filters: string[] = [];

      // Default to published-only for storefront
      if (options?.status) {
        filters.push(`status = "${options.status}"`);
      }

      if (options?.category) {
        filters.push(`category.name ~ "${options.category}"`);
      }
      if (options?.brand) {
        filters.push(`brand.name ~ "${options.brand}"`);
      }
      if (options?.search) {
        const escaped = options.search.replace(/"/g, '\\"');
        filters.push(
          `(name ~ "${escaped}" || description ~ "${escaped}" || brand.name ~ "${escaped}")`,
        );
      }
      if (options?.filter) {
        filters.push(options.filter);
      }

      const queryOptions: RecordListOptions = {
        expand: "category,brand",
        sort: options?.sort || "-created",
        filter: filters.length > 0 ? filters.join(" && ") : undefined,
      };

      const result = await pbClient
        .collection("products")
        .getList<PBProduct>(
          options?.page || 1,
          options?.perPage || 50,
          queryOptions,
        );

      return {
        items: result.items.map((record) => pbProductToProduct(record, pbUrl)),
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      };
    } catch (err) {
      handleError(err, "pbProducts.getAll");
    }
  },

  /**
   * Get a single product by slug.
   */
  async getBySlug(slug: string): Promise<Product | null> {
    try {
      const pbClient = getPublicPb();
      const pbUrl = getPbUrl();

      const record = await pbClient
        .collection("products")
        .getFirstListItem<PBProduct>(`slug = "${slug}"`, {
          expand: "category,brand",
        });

      return pbProductToProduct(record, pbUrl);
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbProducts.getBySlug");
    }
  },

  /**
   * Get featured products.
   */
  async getFeatured(limit = 6): Promise<Product[]> {
    try {
      const pbClient = getPublicPb();
      const pbUrl = getPbUrl();

      const result = await pbClient
        .collection("products")
        .getList<PBProduct>(1, limit, {
          filter: 'isFeatured = true && status = "published"',
          expand: "category,brand",
          sort: "-created",
        });

      return result.items.map((record) => pbProductToProduct(record, pbUrl));
    } catch (err) {
      handleError(err, "pbProducts.getFeatured");
    }
  },

  /**
   * Get products for a specific collection (on-sale, new-arrivals, etc.).
   */
  async getByCollection(
    collection: "on-sale" | "new-arrivals" | "featured",
    limit = 8,
  ): Promise<Product[]> {
    try {
      const pbClient = getPublicPb();
      const pbUrl = getPbUrl();

      let filter = 'status = "published"';

      switch (collection) {
        case "on-sale":
          filter += " && discountPrice > 0";
          break;
        case "new-arrivals":
          // New Arrivals: newest published products sorted by creation date
          break;
        case "featured":
          filter += " && isFeatured = true";
          break;
      }

      let result = await pbClient
        .collection("products")
        .getList<PBProduct>(1, limit, {
          filter,
          expand: "category,brand",
          sort: "-created",
        });

      // Fallback: If specific collection filter returned 0 items, fetch latest published products
      if (result.items.length === 0 && collection !== "featured") {
        result = await pbClient
          .collection("products")
          .getList<PBProduct>(1, limit, {
            filter: 'status = "published"',
            expand: "category,brand",
            sort: "-created",
          });
      }

      return result.items.map((record) => pbProductToProduct(record, pbUrl));
    } catch (err) {
      handleError(err, "pbProducts.getByCollection");
    }
  },

  /**
   * Admin: Get a product by ID with all fields (including drafts).
   */
  async getById(id: string): Promise<PBProduct | null> {
    try {
      const adminPb = await getAdminPb();
      const record = await adminPb
        .collection("products")
        .getOne<PBProduct>(id, {
          expand: "category,brand",
        });
      return record;
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbProducts.getById");
    }
  },

  /**
   * Admin: Create a new product.
   */
  async create(data: FormData): Promise<PBProduct> {
    try {
      const adminPb = await getAdminPb();
      const record = await adminPb
        .collection("products")
        .create<PBProduct>(data);
      return record;
    } catch (err) {
      handleError(err, "pbProducts.create");
    }
  },

  /**
   * Admin: Update a product.
   */
  async update(
    id: string,
    data: FormData | Record<string, unknown>,
  ): Promise<PBProduct> {
    try {
      const adminPb = await getAdminPb();
      const record = await adminPb
        .collection("products")
        .update<PBProduct>(id, data);
      return record;
    } catch (err) {
      handleError(err, "pbProducts.update");
    }
  },

  /**
   * Admin: Delete a product.
   */
  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      await adminPb.collection("products").delete(id);
      return true;
    } catch (err) {
      handleError(err, "pbProducts.delete");
    }
  },
};

// ─── Categories ───────────────────────────────────────────────────────────────

export const pbCategories = {
  /**
   * Get all categories sorted by sortOrder.
   */
  async getAll(): Promise<Category[]> {
    try {
      const pbClient = getPublicPb();
      const pbUrl = getPbUrl();

      const result = await pbClient
        .collection("categories")
        .getFullList<PBCategory>({
          sort: "sortOrder",
        });

      return result.map((record) => pbCategoryToCategory(record, pbUrl));
    } catch (err) {
      handleError(err, "pbCategories.getAll");
    }
  },

  /**
   * Admin: Create a category.
   */
  async create(data: FormData | Record<string, unknown>): Promise<PBCategory> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("categories").create<PBCategory>(data);
    } catch (err) {
      handleError(err, "pbCategories.create");
    }
  },

  /**
   * Admin: Update a category.
   */
  async update(
    id: string,
    data: FormData | Record<string, unknown>,
  ): Promise<PBCategory> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb
        .collection("categories")
        .update<PBCategory>(id, data);
    } catch (err) {
      handleError(err, "pbCategories.update");
    }
  },

  /**
   * Admin: Delete a category.
   */
  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      await adminPb.collection("categories").delete(id);
      return true;
    } catch (err) {
      handleError(err, "pbCategories.delete");
    }
  },
};

// ─── Brands ───────────────────────────────────────────────────────────────────

export const pbBrands = {
  async getAll(): Promise<PBBrand[]> {
    try {
      const pbClient = getPublicPb();
      return await pbClient.collection("brands").getFullList<PBBrand>({
        sort: "sortOrder",
      });
    } catch (err) {
      handleError(err, "pbBrands.getAll");
    }
  },

  async create(data: FormData | Record<string, unknown>): Promise<PBBrand> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("brands").create<PBBrand>(data);
    } catch (err) {
      handleError(err, "pbBrands.create");
    }
  },

  async update(
    id: string,
    data: FormData | Record<string, unknown>,
  ): Promise<PBBrand> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("brands").update<PBBrand>(id, data);
    } catch (err) {
      handleError(err, "pbBrands.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      await adminPb.collection("brands").delete(id);
      return true;
    } catch (err) {
      handleError(err, "pbBrands.delete");
    }
  },
};

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const pbReviews = {
  /**
   * Get approved reviews for the storefront.
   */
  async getApproved(options?: {
    productId?: string;
    featured?: boolean;
    limit?: number;
  }): Promise<PBReview[]> {
    try {
      const pbClient = getPublicPb();
      const filters = ['status = "approved"'];

      if (options?.productId) {
        filters.push(`product = "${options.productId}"`);
      }
      if (options?.featured) {
        filters.push("isFeatured = true");
      }

      const result = await pbClient
        .collection("reviews")
        .getList<PBReview>(1, options?.limit || 20, {
          filter: filters.join(" && "),
          sort: "-isFeatured,-created",
          expand: "product",
        });

      return result.items;
    } catch (err) {
      handleError(err, "pbReviews.getApproved");
    }
  },

  /**
   * Admin: Get all reviews for moderation.
   */
  async getAll(options?: {
    status?: string;
    page?: number;
    perPage?: number;
  }): Promise<{ items: PBReview[]; totalItems: number }> {
    try {
      const adminPb = await getAdminPb();
      const filter = options?.status
        ? `status = "${options.status}"`
        : undefined;

      const result = await adminPb
        .collection("reviews")
        .getList<PBReview>(options?.page || 1, options?.perPage || 25, {
          filter,
          sort: "-created",
          expand: "product",
        });

      return { items: result.items, totalItems: result.totalItems };
    } catch (err) {
      handleError(err, "pbReviews.getAll");
    }
  },

  async create(data: FormData | Record<string, unknown>): Promise<PBReview> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("reviews").create<PBReview>(data);
    } catch (err) {
      handleError(err, "pbReviews.create");
    }
  },

  async update(id: string, data: Record<string, unknown>): Promise<PBReview> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("reviews").update<PBReview>(id, data);
    } catch (err) {
      handleError(err, "pbReviews.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      await adminPb.collection("reviews").delete(id);
      return true;
    } catch (err) {
      handleError(err, "pbReviews.delete");
    }
  },
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export const pbOrders = {
  async getAll(options?: {
    status?: string;
    page?: number;
    perPage?: number;
    sort?: string;
  }): Promise<{ items: PBOrder[]; totalItems: number; totalPages: number }> {
    try {
      const adminPb = await getAdminPb();
      const filter = options?.status
        ? `status = "${options.status}"`
        : undefined;

      const result = await adminPb
        .collection("orders")
        .getList<PBOrder>(options?.page || 1, options?.perPage || 25, {
          filter,
          sort: options?.sort || "-created",
        });

      return {
        items: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      };
    } catch (err) {
      handleError(err, "pbOrders.getAll");
    }
  },

  async getById(id: string): Promise<PBOrder | null> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("orders").getOne<PBOrder>(id);
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbOrders.getById");
    }
  },

  async create(data: Record<string, unknown>): Promise<PBOrder> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("orders").create<PBOrder>(data);
    } catch (err) {
      handleError(err, "pbOrders.create");
    }
  },

  async update(id: string, data: Record<string, unknown>): Promise<PBOrder> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("orders").update<PBOrder>(id, data);
    } catch (err) {
      handleError(err, "pbOrders.update");
    }
  },
};

// ─── Homepage Blocks ──────────────────────────────────────────────────────────

export const pbHomepageBlocks = {
  /**
   * Get all enabled homepage blocks for the storefront, sorted by order.
   * Filters by scheduled visibility and enabled status.
   */
  async getActive(): Promise<PBHomepageBlock[]> {
    try {
      const pbClient = getPublicPb();
      const now = new Date().toISOString();

      const result = await pbClient
        .collection("homepage_blocks")
        .getFullList<PBHomepageBlock>({
          filter: `isEnabled = true && (scheduledStart = "" || scheduledStart <= "${now}") && (scheduledEnd = "" || scheduledEnd >= "${now}")`,
          sort: "sortOrder",
        });

      return result;
    } catch (err) {
      handleError(err, "pbHomepageBlocks.getActive");
    }
  },

  /**
   * Admin: Get all blocks including disabled ones.
   */
  async getAll(): Promise<PBHomepageBlock[]> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb
        .collection("homepage_blocks")
        .getFullList<PBHomepageBlock>({
          sort: "sortOrder",
        });
    } catch (err) {
      handleError(err, "pbHomepageBlocks.getAll");
    }
  },

  async create(data: Record<string, unknown>): Promise<PBHomepageBlock> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb
        .collection("homepage_blocks")
        .create<PBHomepageBlock>(data);
    } catch (err) {
      handleError(err, "pbHomepageBlocks.create");
    }
  },

  async update(
    id: string,
    data: Record<string, unknown>,
  ): Promise<PBHomepageBlock> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb
        .collection("homepage_blocks")
        .update<PBHomepageBlock>(id, data);
    } catch (err) {
      handleError(err, "pbHomepageBlocks.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      await adminPb.collection("homepage_blocks").delete(id);
      return true;
    } catch (err) {
      handleError(err, "pbHomepageBlocks.delete");
    }
  },
};

// ─── Hero Banners ────────────────────────────────────────────────────────────

export const pbHeroBanners = {
  /**
   * Build the full PocketBase CDN URL for a hero banner's image.
   * Returns undefined if the banner has no uploaded image.
   */
  getImageUrl(banner: PBHeroBanner, pbBaseUrl?: string): string | undefined {
    if (!banner.image) return undefined;
    const base = (pbBaseUrl || getPbUrl()).replace(/\/$/, "");
    return `${base}/api/files/${banner.collectionId}/${banner.id}/${banner.image}`;
  },

  /**
   * Get only enabled hero banners for the storefront, sorted by sortOrder.
   */
  async getActive(): Promise<PBHeroBanner[]> {
    try {
      const pbClient = getPublicPb();
      return await pbClient
        .collection("hero_banners")
        .getFullList<PBHeroBanner>({
          filter: "isEnabled = true",
          sort: "sortOrder",
        });
    } catch (err) {
      // Return empty array on error so the component can fall back gracefully
      console.error("[pbHeroBanners.getActive]", err);
      return [];
    }
  },

  async getAll(): Promise<PBHeroBanner[]> {
    try {
      const pbClient = getPublicPb();
      return await pbClient
        .collection("hero_banners")
        .getFullList<PBHeroBanner>({
          sort: "sortOrder",
        });
    } catch (err) {
      handleError(err, "pbHeroBanners.getAll");
    }
  },



  async create(
    data: FormData | Record<string, unknown>,
  ): Promise<PBHeroBanner> {
    try {
      const pbClient = getPublicPb();
      return await pbClient
        .collection("hero_banners")
        .create<PBHeroBanner>(data);
    } catch (err) {
      handleError(err, "pbHeroBanners.create");
    }
  },

  async update(
    id: string,
    data: FormData | Record<string, unknown>,
  ): Promise<PBHeroBanner> {
    try {
      const pbClient = getPublicPb();
      return await pbClient
        .collection("hero_banners")
        .update<PBHeroBanner>(id, data);
    } catch (err) {
      handleError(err, "pbHeroBanners.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const pbClient = getPublicPb();
      await pbClient.collection("hero_banners").delete(id);
      return true;
    } catch (err) {
      handleError(err, "pbHeroBanners.delete");
    }
  },
};

// ─── Site Settings ────────────────────────────────────────────────────────────

export const pbSiteSettings = {
  /**
   * Get a site setting by key.
   */
  async get<T = Record<string, unknown>>(key: string): Promise<T | null> {
    try {
      const pbClient = getPublicPb();
      const record = await pbClient
        .collection("site_settings")
        .getFirstListItem<PBSiteSetting>(`key = "${key}"`);
      return record.value as T;
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbSiteSettings.get");
    }
  },

  /**
   * Admin: Set a site setting. Creates or updates.
   */
  async set(key: string, value: Record<string, unknown>): Promise<void> {
    try {
      const adminPb = await getAdminPb();

      // Try to find existing setting
      try {
        const existing = await adminPb
          .collection("site_settings")
          .getFirstListItem<PBSiteSetting>(`key = "${key}"`);
        await adminPb
          .collection("site_settings")
          .update(existing.id, { value: JSON.stringify(value) });
      } catch {
        // Doesn't exist yet, create it
        await adminPb.collection("site_settings").create({
          key,
          value: JSON.stringify(value),
        });
      }
    } catch (err) {
      handleError(err, "pbSiteSettings.set");
    }
  },
};

// ─── Promotions ───────────────────────────────────────────────────────────────

export const pbPromotions = {
  async getActive(): Promise<PBPromotion[]> {
    try {
      const isClient = typeof window !== 'undefined';
      const pbClient = isClient ? getPublicPb() : await getAdminPb();
      const now = new Date().toISOString();

      try {
        return await pbClient.collection("promotions").getFullList<PBPromotion>({
          filter: pbClient.filter('isActive = true && startDate <= {:now} && endDate >= {:now}', { now }),
          sort: "-created",
        });
      } catch {
        const allActive = await pbClient.collection("promotions").getFullList<PBPromotion>({
          filter: `isActive = true`,
          sort: "-created",
        });

        const nowMs = Date.now();
        return allActive.filter((item) => {
          const startMs = item.startDate ? new Date(item.startDate).getTime() : 0;
          const endMs = item.endDate ? new Date(item.endDate).getTime() : Infinity;
          return (isNaN(startMs) || startMs <= nowMs) && (isNaN(endMs) || endMs >= nowMs);
        });
      }
    } catch (err) {
      console.warn("[pbPromotions.getActive] Failed to load active promotions:", err);
      return [];
    }
  },

  async getAll(options?: {
    page?: number;
    perPage?: number;
  }): Promise<{ items: PBPromotion[]; totalItems: number }> {
    try {
      const isClient = typeof window !== 'undefined';
      const pbClient = isClient ? getPublicPb() : await getAdminPb();
      const result = await pbClient
        .collection("promotions")
        .getList<PBPromotion>(options?.page || 1, options?.perPage || 25, {
          sort: "-created",
        });
      return { items: result.items, totalItems: result.totalItems };
    } catch (err) {
      handleError(err, "pbPromotions.getAll");
    }
  },

  async create(data: Record<string, unknown>): Promise<PBPromotion> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("promotions").create<PBPromotion>(data);
    } catch (err) {
      handleError(err, "pbPromotions.create");
    }
  },

  async update(
    id: string,
    data: Record<string, unknown>,
  ): Promise<PBPromotion> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb
        .collection("promotions")
        .update<PBPromotion>(id, data);
    } catch (err) {
      handleError(err, "pbPromotions.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      await adminPb.collection("promotions").delete(id);
      return true;
    } catch (err) {
      handleError(err, "pbPromotions.delete");
    }
  },
};

// ─── Announcements ────────────────────────────────────────────────────────────

let announcementsReady = false;

function normalizeAnnouncementRecord(rec: any): PBAnnouncement {
  return {
    id: rec.id,
    collectionId: rec.collectionId || rec.collectionName || "announcements",
    collectionName: rec.collectionName || rec.collectionId || "announcements",
    created: rec.created || "",
    updated: rec.updated || "",
    title: rec.title || rec.name || rec.headline || "",
    description: rec.description || rec.body || rec.details || rec.text || "",
    image: rec.image || rec.file || rec.graphic || rec.photo || "",
    link: rec.link || rec.url || rec.targetUrl || "",
    isActive:
      rec.isActive !== undefined
        ? Boolean(rec.isActive)
        : rec.is_active !== undefined
        ? Boolean(rec.is_active)
        : rec.is_enabled !== undefined
        ? Boolean(rec.is_enabled)
        : true,
    endsAt: rec.endsAt || rec.ends_at || rec.endDate || rec.end_date || "",
  };
}

export const pbAnnouncements = {
  async ensureCollection(): Promise<boolean> {
    if (typeof window !== 'undefined') return true;
    if (announcementsReady) return true;
    try {
      const adminPb = await getAdminPb();
      const collectionsToTry = ["announcements", "announcement", "popup_announcements", "ads"];

      for (const colName of collectionsToTry) {
        try {
          const col = await adminPb.collections.getOne(colName);
          let needsUpdate = false;
          const fields = col.fields || (col as any).schema || [];
          const hasDesc = fields.some((f: any) => f.name === "description");
          const updatedFields = fields.map((f: any) => {
            if (f.name === "image" && f.required) {
              needsUpdate = true;
              return { ...f, required: false };
            }
            if (f.name === "title" && f.required) {
              needsUpdate = true;
              return { ...f, required: false };
            }
            return f;
          });

          if (!hasDesc) {
            needsUpdate = true;
            updatedFields.push({ name: "description", type: "text", required: false });
          }

          if (needsUpdate || col.listRule !== "" || col.viewRule !== "") {
            try {
              await adminPb.collections.update(col.name || colName, {
                listRule: "",
                viewRule: "",
                fields: updatedFields,
              });
            } catch {
              // ignore
            }
          }
          announcementsReady = true;
          return true;
        } catch {
          // try next
        }
      }

      // Auto-create 'announcements' collection in PocketBase if missing
      await adminPb.collections.create({
        id: "announcements",
        name: "announcements",
        type: "base",
        schema: [
          { name: "title", type: "text", required: false },
          { name: "description", type: "text", required: false },
          { name: "image", type: "file", required: false, options: { maxSelect: 1 } },
          { name: "link", type: "text", required: false },
          { name: "isActive", type: "bool", required: false },
          { name: "endsAt", type: "date", required: false },
        ],
        listRule: "",
        viewRule: "",
        createRule: null,
        updateRule: null,
        deleteRule: null,
      });
      announcementsReady = true;
      return true;
    } catch (err) {
      console.warn("Failed to auto-create announcements collection:", err);
      return false;
    }
  },

  async getActive(): Promise<PBAnnouncement[]> {
    try {
      await this.ensureCollection();
      const isClient = typeof window !== 'undefined';
      const pbClient = isClient ? getPublicPb() : await getAdminPb();

      let rawItems: any[] = [];
      const collectionsToTry = ["announcements", "announcement", "popup_announcements", "ads"];

      for (const colName of collectionsToTry) {
        try {
          let res: any[] = [];
          try {
            res = await pbClient.collection(colName).getFullList({ sort: "-created" });
          } catch {
            res = await pbClient.collection(colName).getFullList();
          }

          if (res && res.length > 0) {
            rawItems = res;
            break;
          }
        } catch {
          // try next
        }
      }

      if (rawItems.length === 0 && !isClient) {
        try {
          const adminPb = await getAdminPb();
          for (const colName of collectionsToTry) {
            try {
              let res: any[] = [];
              try {
                res = await adminPb.collection(colName).getFullList({ sort: "-created" });
              } catch {
                res = await adminPb.collection(colName).getFullList();
              }

              if (res && res.length > 0) {
                rawItems = res;
                break;
              }
            } catch {
              // try next
            }
          }
        } catch {
          // ignore
        }
      }

      const nowMs = Date.now();
      const activeItems = rawItems.filter((item: any) => {
        const active =
          item.isActive !== undefined
            ? Boolean(item.isActive)
            : item.is_active !== undefined
            ? Boolean(item.is_active)
            : item.is_enabled !== undefined
            ? Boolean(item.is_enabled)
            : true;
        if (!active) return false;

        const endDateStr = item.endsAt || item.ends_at || item.endDate || item.end_date;
        if (!endDateStr) return true;

        const endMs = new Date(endDateStr).getTime();
        return isNaN(endMs) || endMs >= nowMs;
      });

      return activeItems.map(normalizeAnnouncementRecord);
    } catch (err) {
      console.warn("[pbAnnouncements.getActive] Failed to load active announcements:", err);
      return [];
    }
  },

  async getAll(options?: {
    page?: number;
    perPage?: number;
  }): Promise<{ items: PBAnnouncement[]; totalItems: number }> {
    try {
      await this.ensureCollection();
      let pbClient: PocketBase;
      try {
        pbClient = await getAdminPb();
      } catch {
        pbClient = getPublicPb();
      }

      const collectionsToTry = ["announcements", "announcement", "popup_announcements", "ads"];
      for (const colName of collectionsToTry) {
        try {
          let result: any = null;
          try {
            result = await pbClient
              .collection(colName)
              .getList<any>(options?.page || 1, options?.perPage || 50, {
                sort: "-created",
              });
          } catch {
            result = await pbClient
              .collection(colName)
              .getList<any>(options?.page || 1, options?.perPage || 50);
          }

          if (result && result.items && result.items.length > 0) {
            return {
              items: result.items.map(normalizeAnnouncementRecord),
              totalItems: result.totalItems,
            };
          }
        } catch {
          // try next
        }
      }

      return { items: [], totalItems: 0 };
    } catch (err) {
      console.warn("[pbAnnouncements.getAll] Warning: Failed to fetch announcements:", err);
      return { items: [], totalItems: 0 };
    }
  },

  async create(data: FormData | Record<string, unknown>): Promise<PBAnnouncement> {
    try {
      await this.ensureCollection();
      const adminPb = await getAdminPb();
      const collectionsToTry = ["announcements", "announcement"];
      let record: any = null;
      let lastErr: any = null;

      for (const colName of collectionsToTry) {
        try {
          record = await adminPb.collection(colName).create(data);
          if (record) break;
        } catch (err: any) {
          lastErr = err;
          console.error(`[pbAnnouncements.create] Error creating on collection '${colName}':`, err?.response?.data || err?.message || err);
        }
      }

      if (!record && data instanceof FormData) {
        const fallbackData = new FormData();
        const allowedKeys = ["title", "name", "image", "file", "link", "url", "isActive", "is_active", "endsAt", "ends_at"];
        for (const key of allowedKeys) {
          const val = data.get(key);
          if (val !== null && val !== undefined && val !== "") {
            fallbackData.append(key, val);
          }
        }
        for (const colName of collectionsToTry) {
          try {
            record = await adminPb.collection(colName).create(fallbackData);
            if (record) break;
          } catch (err: any) {
            lastErr = err;
          }
        }
      }

      if (!record) {
        const detail = lastErr?.response?.data ? JSON.stringify(lastErr.response.data) : (lastErr?.message || "Failed to create announcement record.");
        throw new Error(detail);
      }

      return normalizeAnnouncementRecord(record);
    } catch (err) {
      handleError(err, "pbAnnouncements.create");
    }
  },

  async update(
    id: string,
    data: FormData | Record<string, unknown>,
  ): Promise<PBAnnouncement> {
    try {
      await this.ensureCollection();
      const adminPb = await getAdminPb();
      const collectionsToTry = ["announcements", "announcement", "popup_announcements", "ads"];
      let record: any = null;
      let lastErr: any = null;

      for (const colName of collectionsToTry) {
        try {
          record = await adminPb.collection(colName).update(id, data);
          if (record) break;
        } catch (err: any) {
          lastErr = err;
        }
      }

      if (!record && data instanceof FormData) {
        const fallbackData = new FormData();
        const allowedKeys = ["title", "name", "image", "file", "link", "url", "isActive", "is_active", "endsAt", "ends_at"];
        for (const key of allowedKeys) {
          const val = data.get(key);
          if (val !== null && val !== undefined) {
            fallbackData.append(key, val);
          }
        }
        for (const colName of collectionsToTry) {
          try {
            record = await adminPb.collection(colName).update(id, fallbackData);
            if (record) break;
          } catch (err: any) {
            lastErr = err;
          }
        }
      }

      if (!record) {
        const detail = lastErr?.response?.data ? JSON.stringify(lastErr.response.data) : (lastErr?.message || "Failed to update announcement record.");
        throw new Error(detail);
      }

      return normalizeAnnouncementRecord(record);
    } catch (err) {
      handleError(err, "pbAnnouncements.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      await this.ensureCollection();
      const adminPb = await getAdminPb();
      const collectionsToTry = ["announcements", "announcement", "popup_announcements", "ads"];

      for (const colName of collectionsToTry) {
        try {
          await adminPb.collection(colName).delete(id);
          return true;
        } catch {
          // try next
        }
      }
      return true;
    } catch (err) {
      handleError(err, "pbAnnouncements.delete");
    }
  },

  getFileUrl(record: PBAnnouncement): string {
    if (!record.image) return "";
    return getPbFileUrl(record, record.image);
  },
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const pbAuditLog = {
  async getAll(options?: {
    page?: number;
    perPage?: number;
    actor?: string;
    action?: string;
    collection?: string;
  }): Promise<{ items: PBAuditLog[]; totalItems: number; totalPages: number }> {
    try {
      const adminPb = await getAdminPb();
      const filters: string[] = [];

      if (options?.actor) filters.push(`actor = "${options.actor}"`);
      if (options?.action) filters.push(`action = "${options.action}"`);
      if (options?.collection)
        filters.push(`collection = "${options.collection}"`);

      const result = await adminPb
        .collection("audit_log")
        .getList<PBAuditLog>(options?.page || 1, options?.perPage || 50, {
          filter: filters.length > 0 ? filters.join(" && ") : undefined,
          sort: "-created",
        });

      return {
        items: result.items,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      };
    } catch (err) {
      handleError(err, "pbAuditLog.getAll");
    }
  },
};

// ─── Stock Purchases ─────────────────────────────────────────────────────────

export interface PBStockPurchase extends PBRecord {
  product: string;
  batchNumber: string;
  quantity: number;
  unitCost?: number;
  supplier?: string;
  purchaseDate?: string;
  notes?: string;
}

export const pbStockPurchases = {
  async getByProduct(productId: string): Promise<PBStockPurchase[]> {
    try {
      const adminPb = await getAdminPb();
      const result = await adminPb.collection("stock_purchases").getFullList<PBStockPurchase>({
        filter: `product = "${productId}"`,
        sort: "-created",
      });
      return result;
    } catch (err) {
      handleError(err, "pbStockPurchases.getByProduct");
    }
  },

  async create(data: Record<string, unknown>): Promise<PBStockPurchase> {
    try {
      const adminPb = await getAdminPb();
      const record = await adminPb.collection("stock_purchases").create<PBStockPurchase>(data);
      return record;
    } catch (err) {
      handleError(err, "pbStockPurchases.create");
    }
  },
};

// ─── Stock Management Units ────────────────────────────────────────────────────

export interface PBStockManagementUnit extends PBRecord {
  product: string;
  barcode: string;
  serialNumber?: string;
  status: "available" | "reserved" | "sold" | "defective" | "returned";
  batchNumber?: string;
  orderId?: string;
  notes?: string;
}

export const pbStockManagement = {
  async getByProduct(productId: string): Promise<PBStockManagementUnit[]> {
    try {
      const adminPb = await getAdminPb();
      const result = await adminPb.collection("stock_management").getFullList<PBStockManagementUnit>({
        filter: `product = "${productId}"`,
        sort: "-created",
      });
      return result;
    } catch (err) {
      handleError(err, "pbStockManagement.getByProduct");
    }
  },

  async getByBarcode(barcode: string): Promise<PBStockManagementUnit | null> {
    try {
      const adminPb = await getAdminPb();
      const result = await adminPb.collection("stock_management").getFirstListItem<PBStockManagementUnit>(
        `barcode = "${barcode}"`
      );
      return result;
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbStockManagement.getByBarcode");
    }
  },

  async createUnit(data: Record<string, unknown>): Promise<PBStockManagementUnit> {
    try {
      const adminPb = await getAdminPb();
      const record = await adminPb.collection("stock_management").create<PBStockManagementUnit>(data);
      return record;
    } catch (err) {
      handleError(err, "pbStockManagement.createUnit");
    }
  },

  async updateUnit(id: string, data: Record<string, unknown>): Promise<PBStockManagementUnit> {
    try {
      const adminPb = await getAdminPb();
      const record = await adminPb.collection("stock_management").update<PBStockManagementUnit>(id, data);
      return record;
    } catch (err) {
      handleError(err, "pbStockManagement.updateUnit");
    }
  },
};

// ─── Employees (POS) ──────────────────────────────────────────────────────────

export const pbEmployees = {
  async getAll(): Promise<PBEmployee[]> {
    try {
      const adminPb = await getAdminPb();
      const list = await adminPb.collection("users").getFullList({ sort: "name" });
      return list
        .filter((r: any) => r.role === "employee" || r.role === "manager" || r.role === "admin" || !r.role)
        .map((r: any) => ({
          id: r.id,
          name: r.name || r.email || "Employee",
          pin: r.pin || "1234",
          role: (r.role === "employee" ? "cashier" : r.role === "admin" ? "manager" : (r.role || "cashier")) as any,
          isActive: true,
          created: r.created,
          updated: r.updated,
          collectionId: r.collectionId,
          collectionName: r.collectionName,
        }));
    } catch (err) {
      handleError(err, "pbEmployees.getAll");
    }
  },

  async getAllAdmin(): Promise<PBEmployee[]> {
    try {
      const adminPb = await getAdminPb();
      const list = await adminPb.collection("users").getFullList({ sort: "name" });
      return list.map((r: any) => ({
        id: r.id,
        name: r.name || r.email || "Employee",
        pin: r.pin || "1234",
        role: (r.role === "employee" ? "cashier" : r.role === "admin" ? "manager" : (r.role || "cashier")) as any,
        isActive: true,
        created: r.created,
        updated: r.updated,
        collectionId: r.collectionId,
        collectionName: r.collectionName,
      }));
    } catch (err) {
      handleError(err, "pbEmployees.getAllAdmin");
    }
  },

  async getById(id: string): Promise<PBEmployee | null> {
    try {
      const adminPb = await getAdminPb();
      const r: any = await adminPb.collection("users").getOne(id);
      return {
        id: r.id,
        name: r.name || r.email || "Employee",
        pin: r.pin || "1234",
        role: (r.role === "employee" ? "cashier" : r.role === "admin" ? "manager" : (r.role || "cashier")) as any,
        isActive: true,
        created: r.created,
        updated: r.updated,
        collectionId: r.collectionId,
        collectionName: r.collectionName,
      };
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbEmployees.getById");
    }
  },

  async create(data: { name: string; pin: string; role: string; isActive: boolean }): Promise<PBEmployee> {
    try {
      const adminPb = await getAdminPb();
      const cleanName = data.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const pass = (data.pin || '12345678').padEnd(8, '0');
      const userPayload: Record<string, any> = {
        name: data.name,
        email: `${cleanName || 'emp'}_${Date.now().toString(36)}@ftc.internal`,
        password: pass,
        passwordConfirm: pass,
        role: data.role === 'cashier' ? 'employee' : data.role,
        pin: data.pin,
      };
      const r: any = await adminPb.collection("users").create(userPayload);
      return {
        id: r.id,
        name: r.name || data.name,
        pin: data.pin,
        role: data.role as any,
        isActive: data.isActive,
        created: r.created,
        updated: r.updated,
        collectionId: r.collectionId,
        collectionName: r.collectionName,
      };
    } catch (err) {
      handleError(err, "pbEmployees.create");
    }
  },

  async update(id: string, data: Partial<{ name: string; pin: string; role: string; isActive: boolean }>): Promise<PBEmployee> {
    try {
      const adminPb = await getAdminPb();
      const payload: Record<string, any> = {};
      if (data.name) payload.name = data.name;
      if (data.role) payload.role = data.role === 'cashier' ? 'employee' : data.role;
      if (data.pin) {
        payload.pin = data.pin;
        const pass = data.pin.padEnd(8, '0');
        payload.password = pass;
        payload.passwordConfirm = pass;
      }
      const r: any = await adminPb.collection("users").update(id, payload);
      return {
        id: r.id,
        name: r.name,
        pin: data.pin || r.pin || '1234',
        role: (r.role === 'employee' ? 'cashier' : r.role) as any,
        isActive: true,
        created: r.created,
        updated: r.updated,
        collectionId: r.collectionId,
        collectionName: r.collectionName,
      };
    } catch (err) {
      handleError(err, "pbEmployees.update");
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const adminPb = await getAdminPb();
      await adminPb.collection("users").delete(id);
    } catch (err) {
      handleError(err, "pbEmployees.delete");
    }
  },
};

// ─── Sales (POS) ──────────────────────────────────────────────────────────────

export const pbSales = {
  async createSale(payload: SalePayload): Promise<{ sale: PBSale; items: PBSaleItem[] }> {
    try {
      const adminPb = await getAdminPb();
      const { items, ...saleData } = payload;
      const totalItemsCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      const receiptNo = saleData.receipt_number || `FTC-POS-${Date.now().toString(36).toUpperCase()}`;

      const fullSaleData = {
        status: "completed",
        receipt_number: receiptNo,
        date: saleData.date || new Date().toISOString(),
        items_count: totalItemsCount,
        ...saleData,
      };

      const sale = await adminPb.collection("sales").create<PBSale>(fullSaleData);
      const createdItems = await Promise.all(
        items.map((item) =>
          adminPb.collection("sale_items").create<PBSaleItem>({ ...item, sale: sale.id })
        )
      );

      // Deduct stock & mark stock_management unit(s) as sold
      for (const item of items) {
        if (item.unit_id) {
          try {
            await adminPb.collection("stock_management").update(item.unit_id, { status: "sold", orderId: sale.id });
          } catch {
            // ignore
          }
        } else if (item.unit_barcode) {
          try {
            const u: any = await adminPb.collection("stock_management").getFirstListItem(
              adminPb.filter('barcode = {:barcode}', { barcode: item.unit_barcode })
            );
            if (u) {
              await adminPb.collection("stock_management").update(u.id, { status: "sold", orderId: sale.id });
            }
          } catch {
            // ignore
          }
        } else if (item.product_id) {
          try {
            const avail = await adminPb.collection("stock_management").getFullList({
              filter: `product = "${item.product_id}" && status = "available"`,
            });
            for (const u of avail.slice(0, item.quantity)) {
              await adminPb.collection("stock_management").update(u.id, { status: "sold", orderId: sale.id });
            }
          } catch {
            // ignore
          }
        }

        if (item.product_id) {
          try {
            const avail = await adminPb.collection("stock_management").getFullList({
              filter: `product = "${item.product_id}" && status = "available"`,
            });
            await adminPb.collection("products").update(item.product_id, { countInStock: avail.length });
          } catch {
            try {
              const p: any = await adminPb.collection("products").getOne(item.product_id);
              const currentStock = typeof p.countInStock === 'number' ? p.countInStock : 0;
              const newStock = Math.max(0, currentStock - item.quantity);
              await adminPb.collection("products").update(item.product_id, { countInStock: newStock });
            } catch {
              // ignore
            }
          }
        }
      }

      return { sale, items: createdItems };
    } catch (err) {
      handleError(err, "pbSales.createSale");
    }
  },

  async getRecent(limit = 50): Promise<PBSale[]> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("sales").getFullList<PBSale>({
        sort: "-id",
        perPage: limit,
      });
    } catch (err) {
      handleError(err, "pbSales.getRecent");
    }
  },

  async getById(id: string): Promise<PBSale | null> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("sales").getOne<PBSale>(id);
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbSales.getById");
    }
  },

  async getItemsBySale(saleId: string): Promise<PBSaleItem[]> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("sale_items").getFullList<PBSaleItem>({
        filter: `sale = "${saleId}"`,
        sort: "id",
      });
    } catch (err) {
      handleError(err, "pbSales.getItemsBySale");
    }
  },

  async voidSale(id: string): Promise<PBSale> {
    try {
      const adminPb = await getAdminPb();
      const sale = await adminPb.collection("sales").update<PBSale>(id, { status: "voided" });

      // Restore stock for voided sale items
      try {
        const items = await adminPb.collection("sale_items").getFullList<PBSaleItem>({
          filter: `sale = "${id}"`,
        });
        for (const item of items) {
          if (item.unit_id) {
            try {
              await adminPb.collection("stock_management").update(item.unit_id, { status: "available", orderId: "" });
            } catch {
              // ignore
            }
          } else if (item.unit_barcode) {
            try {
              const u: any = await adminPb.collection("stock_management").getFirstListItem(
                adminPb.filter('barcode = {:barcode}', { barcode: item.unit_barcode })
              );
              if (u) {
                await adminPb.collection("stock_management").update(u.id, { status: "available", orderId: "" });
              }
            } catch {
              // ignore
            }
          }

          if (item.product_id) {
            try {
              const avail = await adminPb.collection("stock_management").getFullList({
                filter: `product = "${item.product_id}" && status = "available"`,
              });
              await adminPb.collection("products").update(item.product_id, { countInStock: avail.length });
            } catch {
              try {
                const p: any = await adminPb.collection("products").getOne(item.product_id);
                const currentStock = typeof p.countInStock === 'number' ? p.countInStock : 0;
                const restoredStock = currentStock + item.quantity;
                await adminPb.collection("products").update(item.product_id, { countInStock: restoredStock });
              } catch {
                // ignore if product missing
              }
            }
          }
        }
      } catch {
        // ignore if items read error
      }

      return sale;
    } catch (err) {
      handleError(err, "pbSales.voidSale");
    }
  },
};

// ─── Customers ────────────────────────────────────────────────────────────────

export const pbCustomers = {
  async getAll(): Promise<PBCustomer[]> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("customers").getFullList<PBCustomer>({
        sort: "name",
      });
    } catch (err) {
      handleError(err, "pbCustomers.getAll");
    }
  },

  async getById(id: string): Promise<PBCustomer | null> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("customers").getOne<PBCustomer>(id);
    } catch (err) {
      const pbErr = err as { status?: number };
      if (pbErr?.status === 404) return null;
      handleError(err, "pbCustomers.getById");
    }
  },

  async toggleStatus(id: string, currentStatus: "active" | "banned"): Promise<PBCustomer> {
    try {
      const adminPb = await getAdminPb();
      const newStatus = currentStatus === "active" ? "banned" : "active";
      return await adminPb.collection("customers").update<PBCustomer>(id, { status: newStatus });
    } catch (err) {
      handleError(err, "pbCustomers.toggleStatus");
    }
  },
};

// ─── Wholesale Dealers Collection API ─────────────────────────────────────────
export const pbWholesaleDealers = {
  async getAll(): Promise<PBWholesaleDealer[]> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("wholesale_dealers").getFullList<PBWholesaleDealer>({
        sort: "-created",
      });
    } catch (err) {
      handleError(err, "pbWholesaleDealers.getAll");
    }
  },

  async create(data: Partial<PBWholesaleDealer>): Promise<PBWholesaleDealer> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("wholesale_dealers").create<PBWholesaleDealer>(data);
    } catch (err) {
      handleError(err, "pbWholesaleDealers.create");
    }
  },

  async update(id: string, data: Partial<PBWholesaleDealer>): Promise<PBWholesaleDealer> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("wholesale_dealers").update<PBWholesaleDealer>(id, data);
    } catch (err) {
      handleError(err, "pbWholesaleDealers.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      const count = await adminPb.collection("quotations").getList(1, 1, {
        filter: adminPb.filter('dealer_id = {:id}', { id }),
      });
      if (count.totalItems > 0) {
        throw new Error(`Cannot delete dealer: ${count.totalItems} quotation(s) reference this dealer.`);
      }
      return await adminPb.collection("wholesale_dealers").delete(id);
    } catch (err) {
      handleError(err, "pbWholesaleDealers.delete");
    }
  },
};

// ─── Quotations Collection API ───────────────────────────────────────────────
export const pbQuotations = {
  async getAll(): Promise<PBQuotation[]> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("quotations").getFullList<PBQuotation>({
        sort: "-created",
      });
    } catch (err) {
      handleError(err, "pbQuotations.getAll");
    }
  },

  async getById(id: string): Promise<PBQuotation | null> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("quotations").getOne<PBQuotation>(id);
    } catch (err) {
      handleError(err, "pbQuotations.getById");
    }
  },

  async create(data: Partial<PBQuotation>): Promise<PBQuotation> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("quotations").create<PBQuotation>(data);
    } catch (err) {
      handleError(err, "pbQuotations.create");
    }
  },

  async update(id: string, data: Partial<PBQuotation>): Promise<PBQuotation> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("quotations").update<PBQuotation>(id, data);
    } catch (err) {
      handleError(err, "pbQuotations.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("quotations").delete(id);
    } catch (err) {
      handleError(err, "pbQuotations.delete");
    }
  },
};

// ─── Contact Inquiries Collection ──────────────────────────────────────────────

let contactInquiriesReady = false;

export const pbContactInquiries = {
  /**
   * Ensures that the 'contact_inquiries' collection exists in PocketBase.
   */
  async ensureCollection(): Promise<boolean> {
    if (typeof window !== 'undefined') return true;
    if (contactInquiriesReady) return true;
    try {
      const adminPb = await getAdminPb();
      try {
        const collection = await adminPb.collections.getOne("contact_inquiries");
        if (
          collection.listRule !== null ||
          collection.viewRule !== null ||
          collection.createRule !== null ||
          collection.updateRule !== null ||
          collection.deleteRule !== null
        ) {
          await adminPb.collections.update(collection.id, {
            listRule: null,
            viewRule: null,
            createRule: null,
            updateRule: null,
            deleteRule: null,
          });
        }
        contactInquiriesReady = true;
        return true;
      } catch {
        // Create collection if missing
        await adminPb.collections.create({
          id: "contact_inquiries",
          name: "contact_inquiries",
          type: "base",
          schema: [
            { name: "name", type: "text", required: true },
            { name: "email", type: "email", required: true },
            { name: "phone", type: "text", required: false },
            { name: "message", type: "editor", required: true },
            { name: "status", type: "select", required: true, options: { values: ["new", "in-progress", "resolved"] } },
            { name: "notes", type: "text", required: false },
            { name: "read", type: "bool", required: false },
          ],
          // Superuser-only access; all server code uses the admin client.
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
        });
        contactInquiriesReady = true;
        return true;
      }
    } catch (err) {
      console.warn("Failed to auto-create contact_inquiries collection:", err);
      return false;
    }
  },

  async getAll(): Promise<PBContactInquiry[]> {
    try {
      await this.ensureCollection();
      const adminPb = await getAdminPb();
      return await adminPb.collection("contact_inquiries").getFullList<PBContactInquiry>({
        sort: "-created",
      });
    } catch (err) {
      handleError(err, "pbContactInquiries.getAll");
    }
  },

  async getById(id: string): Promise<PBContactInquiry | null> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("contact_inquiries").getOne<PBContactInquiry>(id);
    } catch (err) {
      handleError(err, "pbContactInquiries.getById");
    }
  },

  async create(data: Partial<PBContactInquiry>): Promise<PBContactInquiry> {
    try {
      await this.ensureCollection();
      const adminPb = await getAdminPb();
      return await adminPb.collection("contact_inquiries").create<PBContactInquiry>({
        status: "new",
        read: false,
        ...data,
      });
    } catch (err) {
      handleError(err, "pbContactInquiries.create");
    }
  },

  async update(id: string, data: Partial<PBContactInquiry>): Promise<PBContactInquiry> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("contact_inquiries").update<PBContactInquiry>(id, data);
    } catch (err) {
      handleError(err, "pbContactInquiries.update");
    }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const adminPb = await getAdminPb();
      return await adminPb.collection("contact_inquiries").delete(id);
    } catch (err) {
      handleError(err, "pbContactInquiries.delete");
    }
  },
};

