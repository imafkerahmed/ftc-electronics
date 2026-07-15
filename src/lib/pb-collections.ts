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
  PBProduct,
  PBCategory,
  PBBrand,
  PBReview,
  PBOrder,
  PBHomepageBlock,
  PBHeroBanner,
  PBPromotion,
  PBAuditLog,
  PBSiteSetting,
} from "@/types/admin";
import { pbProductToProduct, pbCategoryToCategory } from "@/types/admin";
import type { Product, Category } from "@/types/product";

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
      const pbClient = getPublicPb();
      const now = new Date().toISOString();

      return await pbClient.collection("promotions").getFullList<PBPromotion>({
        filter: `isActive = true && startDate <= "${now}" && endDate >= "${now}"`,
        sort: "-created",
      });
    } catch (err) {
      handleError(err, "pbPromotions.getActive");
    }
  },

  async getAll(options?: {
    page?: number;
    perPage?: number;
  }): Promise<{ items: PBPromotion[]; totalItems: number }> {
    try {
      const adminPb = await getAdminPb();
      const result = await adminPb
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
