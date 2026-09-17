/**
 * Typed Supabase collection wrappers for FTC Electronics.
 *
 * Provides typed data access functions for products, categories, brands,
 * orders, reviews, stock, promotions, banners, site settings, sales, employees,
 * customers, wholesale dealers, quotations, and audit log.
 */

import { getAdminSupabase } from "./supabase-admin";
import { supabase } from "./supabase";
import type {
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
  PBContactInquiry,
} from "@/types/admin";
import type { PBEmployee, EmployeeRole } from "@/types/pos";
import { pbProductToProduct, pbCategoryToCategory } from "@/types/admin";
import type { Product, Category } from "@/types/product";

function logError(context: string, err: any) {
  if (err && typeof err === "object") {
    let msg = err.message || "";
    if (
      typeof msg === "string" &&
      (msg.includes("<!doctype html>") || msg.includes("<html"))
    ) {
      const match = msg.match(/<title>([^<]+)<\/title>/i);
      const title = match ? match[1] : "HTML Error";
      msg = `${title.trim()} (HTML response body truncated)`;
    }

    console.error(`${context} failed:`, {
      message: msg,
      details: err.details || null,
      hint: err.hint || null,
      code: err.code || null,
    });
    if (err.stack) console.error(`  Stack: ${err.stack}`);
  } else {
    console.error(`${context} failed:`, err);
  }
}

function getClient(useAdmin = false) {
  return useAdmin ? getAdminSupabase() : supabase;
}

export function sanitizeImageUrl(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return "";
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    (trimmed.startsWith("/") && !trimmed.startsWith("//"))
  ) {
    return trimmed;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!supabaseUrl) return "";
  const encodedPath = trimmed.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/ftc-media/${encodedPath}`;
}

export interface ProductDbRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  discount_price?: number | null;
  wholesale_price?: number | null;
  images?: string[] | null;
  category_id?: string | null;
  brand_id?: string | null;
  specs?: Record<string, any> | null;
  rating?: number | null;
  num_reviews?: number | null;
  count_in_stock?: number | null;
  is_featured?: boolean | null;
  is_pre_order?: boolean | null;
  currency?: string | null;
  badges?: string[] | null;
  seo_title?: string | null;
  seo_description?: string | null;
  status?: "draft" | "published" | "archived" | null;
  tags?: string[] | null;
  banner_image?: string | null;
  banner_text?: string | null;
  created_at?: string;
  updated_at?: string;
  category_obj?: {
    id: string;
    name: string;
    slug: string;
    created_at?: string;
    updated_at?: string;
    sort_order?: number | null;
    product_count?: number | null;
  } | null;
  brand_obj?: {
    id: string;
    name: string;
    slug: string;
    created_at?: string;
    updated_at?: string;
    sort_order?: number | null;
  } | null;
}

export function mapProductRow(row: ProductDbRow): PBProduct {
  const now = new Date().toISOString();
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    price: row.price,
    discountPrice: row.discount_price ?? undefined,
    wholesalePrice: row.wholesale_price ?? undefined,
    images: Array.isArray(row.images) ? row.images : [],
    category: row.category_id || "",
    brand: row.brand_id || "",
    specs: (row.specs as Record<string, string>) || {},
    rating: row.rating || 0,
    numReviews: row.num_reviews || 0,
    countInStock: row.count_in_stock || 0,
    isFeatured: row.is_featured || false,
    isPreOrder: row.is_pre_order || false,
    currency: row.currency === "USD" ? "USD" : "LKR",
    badges: row.badges || [],
    seoTitle: row.seo_title || undefined,
    seoDescription: row.seo_description || undefined,
    status: row.status === "draft" ? "draft" : "published",
    tags: row.tags || [],
    bannerImage: row.banner_image || undefined,
    bannerText: row.banner_text || undefined,
    created: row.created_at || now,
    updated: row.updated_at || now,
    collectionId: "products",
    collectionName: "products",
    expand: {
      category: row.category_obj
        ? {
            id: row.category_obj.id,
            name: row.category_obj.name,
            slug: row.category_obj.slug,
            created: row.category_obj.created_at || now,
            updated: row.category_obj.updated_at || now,
            collectionId: "categories",
            collectionName: "categories",
            sortOrder: row.category_obj.sort_order || 0,
            productCount: row.category_obj.product_count || 0,
          }
        : undefined,
      brand: row.brand_obj
        ? {
            id: row.brand_obj.id,
            name: row.brand_obj.name,
            slug: row.brand_obj.slug,
            created: row.brand_obj.created_at || now,
            updated: row.brand_obj.updated_at || now,
            collectionId: "brands",
            collectionName: "brands",
            sortOrder: row.brand_obj.sort_order || 0,
          }
        : undefined,
    },
  };
}

// ─── Products ─────────────────────────────────────────────────────────────────

export const sbProducts = {
  async getAll(options?: {
    page?: number;
    perPage?: number;
    filter?: string;
    sort?: string;
    category?: string;
    brand?: string;
    search?: string;
    status?: "draft" | "published";
    minPrice?: number;
    maxPrice?: number;
    isFeatured?: boolean;
    onSale?: boolean;
    isAdmin?: boolean;
  }): Promise<{ items: Product[]; totalItems: number; totalPages: number }> {
    try {
      const client = getClient(Boolean(options?.isAdmin));
      const page = options?.page || 1;
      const perPage = options?.perPage || 50;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;

      let query = client
        .from("products")
        .select("*, category_obj:categories(*), brand_obj:brands(*)", {
          count: "exact",
        });

      if (options?.status) {
        query = query.eq("status", options.status);
      } else if (!options?.isAdmin) {
        query = query.eq("status", "published");
      }

      if (
        options?.minPrice !== undefined &&
        options.minPrice !== null &&
        !isNaN(options.minPrice)
      ) {
        query = query.gte("price", options.minPrice);
      }

      if (
        options?.maxPrice !== undefined &&
        options.maxPrice !== null &&
        !isNaN(options.maxPrice)
      ) {
        query = query.lte("price", options.maxPrice);
      }

      if (options?.isFeatured) {
        query = query.eq("is_featured", true);
      }

      if (options?.onSale) {
        query = query.not("discount_price", "is", null).gt("discount_price", 0);
      }

      if (options?.category) {
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            options.category,
          )
        ) {
          query = query.eq("category_id", options.category);
        } else {
          // Resolve category slug
          const { data: catData } = await client
            .from("categories")
            .select("id")
            .eq("slug", options.category)
            .maybeSingle();
          if (catData?.id) {
            query = query.eq("category_id", catData.id);
          } else {
            return { items: [], totalItems: 0, totalPages: 0 };
          }
        }
      }

      if (options?.brand) {
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            options.brand,
          )
        ) {
          query = query.eq("brand_id", options.brand);
        } else {
          // Resolve brand slug
          const { data: brandData } = await client
            .from("brands")
            .select("id")
            .eq("slug", options.brand)
            .maybeSingle();
          if (brandData?.id) {
            query = query.eq("brand_id", brandData.id);
          } else {
            return { items: [], totalItems: 0, totalPages: 0 };
          }
        }
      }

      if (options?.search) {
        const cleanSearch = options.search.replace(/[,()"]/g, "").trim();
        if (cleanSearch) {
          query = query.or(
            `name.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`,
          );
        }
      }

      if (options?.sort) {
        const isDescending = options.sort.startsWith("-");
        const column = isDescending ? options.sort.substring(1) : options.sort;
        query = query.order(column === "created" ? "created_at" : column, {
          ascending: !isDescending,
        });
      } else {
        query = query.order("created_at", { ascending: false });
      }

      const { data, count, error } = await query.range(from, to);

      if (error) {
        logError("[sbProducts.getAll] Supabase query failed", error);
        throw error;
      }

      const items: Product[] = (data || []).map((row) =>
        pbProductToProduct(mapProductRow(row as unknown as ProductDbRow), ""),
      );

      const totalItems = count || items.length;
      const totalPages = Math.ceil(totalItems / perPage);

      return { items, totalItems, totalPages };
    } catch (err) {
      logError("[sbProducts.getAll]", err);
      return { items: [], totalItems: 0, totalPages: 0 };
    }
  },

  async getBySlug(
    slug: string,
    options?: { status?: "draft" | "published"; isAdmin?: boolean },
  ): Promise<Product | null> {
    try {
      const client = getClient(Boolean(options?.isAdmin));
      let query = client
        .from("products")
        .select("*, category_obj:categories(*), brand_obj:brands(*)")
        .eq("slug", slug);

      if (options?.status) {
        query = query.eq("status", options.status);
      } else if (!options?.isAdmin) {
        query = query.eq("status", "published");
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        logError(`[sbProducts.getBySlug] for ${slug} failed`, error);
        throw error;
      }
      if (!data) return null;
      return pbProductToProduct(
        mapProductRow(data as unknown as ProductDbRow),
        "",
      );
    } catch (err) {
      logError(`[sbProducts.getBySlug] for ${slug}`, err);
      return null;
    }
  },

  async getById(id: string): Promise<Product | null> {
    try {
      const client = getClient(false);
      const { data, error } = await client
        .from("products")
        .select("*, category_obj:categories(*), brand_obj:brands(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        logError(`[sbProducts.getById] for ${id} failed`, error);
        return null;
      }
      if (!data) return null;
      return pbProductToProduct(
        mapProductRow(data as unknown as ProductDbRow),
        "",
      );
    } catch (err) {
      logError(`[sbProducts.getById] for ${id}`, err);
      return null;
    }
  },

  async getFeatured(limit = 6): Promise<Product[]> {
    const res = await this.getAll({
      perPage: limit,
      status: "published",
      isFeatured: true,
    });
    return res.items;
  },

  async getByCollection(
    collection: "on-sale" | "new-arrivals" | "featured",
    limit = 12,
  ): Promise<Product[]> {
    if (collection === "on-sale") {
      const res = await this.getAll({
        perPage: Math.max(limit * 3, 50),
        status: "published",
        onSale: true,
      });
      const validSaleItems = res.items.filter(
        (p) => typeof p.discountPrice === "number" && p.discountPrice < p.price,
      );
      return validSaleItems.slice(0, limit);
    }
    if (collection === "new-arrivals") {
      const res = await this.getAll({
        perPage: limit,
        status: "published",
        sort: "-created",
      });
      return res.items;
    }
    const res = await this.getAll({
      perPage: limit,
      status: "published",
      isFeatured: true,
    });
    return res.items;
  },

  async getByIds(ids: string[]): Promise<Product[]> {
    if (!ids.length) return [];
    const cappedIds = ids.slice(0, 100);
    const client = getClient(false);
    const { data, error } = await client
      .from("products")
      .select("*, category_obj:categories(*), brand_obj:brands(*)")
      .in("id", cappedIds)
      .eq("status", "published")
      .limit(100);

    if (error) {
      logError("[sbProducts.getByIds] Supabase query failed", error);
      throw error;
    }
    if (!data || !data.length) return [];

    return data.map((item) =>
      pbProductToProduct(mapProductRow(item as unknown as ProductDbRow), ""),
    );
  },

  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("products")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },

  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("products")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },

  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("products").delete().eq("id", id);
    return !error;
  },
};

export const pbProducts = sbProducts;

// ─── Categories ───────────────────────────────────────────────────────────────

export const sbCategories = {
  async getAll(): Promise<Category[]> {
    try {
      const client = getClient(false);
      const { data, error } = await client
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return (data || []).map((row) => {
        const pbRecord: PBCategory = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description || "",
          image: row.image || undefined,
          tagline: row.tagline || undefined,
          sortOrder: row.sort_order || 0,
          productCount: row.product_count || 0,
          isActive: row.is_active ?? true,
          created: row.created_at,
          updated: row.updated_at,
          collectionId: "categories",
          collectionName: "categories",
        };
        return pbCategoryToCategory(pbRecord, "");
      });
    } catch (err) {
      logError("[sbCategories.getAll]", err);
      return [];
    }
  },

  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("categories")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },

  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("categories")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },

  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("categories").delete().eq("id", id);
    return !error;
  },
};

export const pbCategories = sbCategories;

// ─── Brands ───────────────────────────────────────────────────────────────────

export const sbBrands = {
  async getAll(): Promise<PBBrand[]> {
    try {
      const client = getClient(false);
      const { data, error } = await client
        .from("brands")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        logo: sanitizeImageUrl(row.logo) || undefined,
        bannerImage: sanitizeImageUrl(row.banner_image) || undefined,
        description: row.description || "",
        sortOrder: row.sort_order || 0,
        show_in_strip: row.show_in_strip || false,
        created: row.created_at,
        updated: row.updated_at,
        collectionId: "brands",
        collectionName: "brands",
      }));
    } catch (err) {
      logError("[sbBrands.getAll]", err);
      return [];
    }
  },

  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("brands")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },

  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("brands")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },

  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("brands").delete().eq("id", id);
    return !error;
  },
};

export const pbBrands = sbBrands;

// ─── Orders ───────────────────────────────────────────────────────────────────

export const sbOrders = {
  async getAll() {
    const client = getClient(true);
    const { data } = await client
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    const items = (data || []).map((data: any) => ({
      id: data.id,
      orderId: data.order_id,
      customer: data.customer || {},
      items: data.items || [],
      shippingAddress: data.shipping_address || {},
      paymentDetails: data.payment_details || {},
      subtotal: data.subtotal,
      shipping: data.shipping,
      tax: data.tax,
      total: data.total,
      status: data.status,
      isPaid: data.is_paid,
      paidAt: data.paid_at || undefined,
      isDelivered: data.is_delivered,
      deliveredAt: data.delivered_at || undefined,
      notes: data.notes || undefined,
      created: data.created_at,
      updated: data.updated_at,
      collectionId: "orders",
      collectionName: "orders",
    }));
    return items;
  },

  async getById(id: string): Promise<PBOrder | null> {
    try {
      const client = getClient(true);
      const cleanId = id.replace(/[^a-zA-Z0-9-]/g, "");
      const { data, error } = await client
        .from("orders")
        .select("*")
        .or(`id.eq.${cleanId},order_id.eq.${cleanId}`)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id,
        orderId: data.order_id,
        customer: data.customer || {},
        items: data.items || [],
        shippingAddress: data.shipping_address || {},
        paymentDetails: data.payment_details || {},
        subtotal: data.subtotal,
        shipping: data.shipping,
        tax: data.tax,
        total: data.total,
        status: data.status,
        isPaid: data.is_paid,
        paidAt: data.paid_at || undefined,
        isDelivered: data.is_delivered,
        deliveredAt: data.delivered_at || undefined,
        notes: data.notes || undefined,
        created: data.created_at,
        updated: data.updated_at,
        collectionId: "orders",
        collectionName: "orders",
      };
    } catch (err) {
      logError(`[sbOrders.getById] for ${id}`, err);
      return null;
    }
  },
  async update(id: string, payload: any) {
    const client = getClient(true);
    const { data, error } = await client
      .from("orders")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const pbOrders = sbOrders;

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const sbReviews = {
  async getAll() {
    const client = getClient(true);
    const { data } = await client
      .from("reviews")
      .select("*, products:product_id(id, name)")
      .order("created_at", { ascending: false });
    const items = (data || []).map((row) => ({
      id: row.id,
      product: row.product_id,
      productName: row.products?.name || "Unknown Product",
      customerName: row.customer_name,
      rating: row.rating,
      comment: row.comment,
      isVerified: row.is_verified || false,
      isFeatured: row.is_featured || false,
      status: row.status || "approved",
      photo: row.photo || undefined,
      created: row.created_at,
      updated: row.updated_at,
      collectionId: "reviews",
      collectionName: "reviews",
    }));
    return items;
  },

  async getByProductId(productId: string): Promise<PBReview[]> {
    try {
      const client = getClient(false);
      let query = client
        .from("reviews")
        .select("*, products:product_id(id, name, slug, images)")
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (productId) {
        const cleanProductId = productId.replace(/[^a-zA-Z0-9-]/g, "");
        if (cleanProductId) {
          query = query.eq("product_id", cleanProductId);
        }
      }
      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        product: row.product_id,
        customerName: row.customer_name,
        rating: row.rating,
        comment: row.comment,
        isVerified: row.is_verified || false,
        isFeatured: row.is_featured || false,
        status: row.status || "approved",
        photo: row.photo || undefined,
        created: row.created_at,
        updated: row.updated_at,
        collectionId: "reviews",
        collectionName: "reviews",
        expand: row.products
          ? {
              product: {
                id: row.products.id,
                name: row.products.name,
                slug: row.products.slug,
                images: Array.isArray(row.products.images)
                  ? row.products.images
                  : [],
                collectionId: "products",
                collectionName: "products",
              },
            }
          : undefined,
      })) as PBReview[];
    } catch (err) {
      logError("[sbReviews.getByProductId]", err);
      return [];
    }
  },
  async getApproved(productId?: any) {
    const id = typeof productId === "string" ? productId : "";
    return this.getByProductId(id);
  },
  async create(data: any) {
    const client = getClient(true);
    const mapped = {
      product_id: data.product || data.product_id,
      customer_name: data.customerName || data.customer_name,
      rating: data.rating,
      comment: data.comment,
      is_verified:
        data.isVerified !== undefined ? data.isVerified : data.is_verified,
      is_featured:
        data.isFeatured !== undefined ? data.isFeatured : data.is_featured,
      status: data.status || "pending",
      photo: data.photo,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: res, error } = await client
      .from("reviews")
      .insert(mapped)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const mapped: any = {};
    if (data.status !== undefined) mapped.status = data.status;
    if (data.rating !== undefined) mapped.rating = data.rating;
    if (data.comment !== undefined) mapped.comment = data.comment;
    if (data.isVerified !== undefined) mapped.is_verified = data.isVerified;
    if (data.is_verified !== undefined) mapped.is_verified = data.is_verified;
    if (data.isFeatured !== undefined) mapped.is_featured = data.isFeatured;
    if (data.is_featured !== undefined) mapped.is_featured = data.is_featured;
    if (data.customerName !== undefined)
      mapped.customer_name = data.customerName;
    if (data.customer_name !== undefined)
      mapped.customer_name = data.customer_name;
    mapped.updated_at = new Date().toISOString();

    const { data: res, error } = await client
      .from("reviews")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("reviews").delete().eq("id", id);
    return !error;
  },
};

export const pbReviews = sbReviews;

// ─── Site Settings ────────────────────────────────────────────────────────────

export const sbSiteSettings = {
  async getByKey(key: string): Promise<PBSiteSetting | null> {
    try {
      const client = getClient(false);
      const { data, error } = await client
        .from("site_settings")
        .select("*")
        .eq("key", key)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id,
        key: data.key,
        value: data.value,
        created: data.created_at,
        updated: data.updated_at,
        collectionId: "site_settings",
        collectionName: "site_settings",
      };
    } catch (err) {
      logError(`[sbSiteSettings.getByKey] for ${key}`, err);
      return null;
    }
  },
  async get<T = any>(key: string): Promise<T | null> {
    const rec = await this.getByKey(key);
    if (!rec?.value) return null;
    if (typeof rec.value === "string") {
      try {
        return JSON.parse(rec.value) as T;
      } catch {
        return rec.value as unknown as T;
      }
    }
    return rec.value as T;
  },
  async set(key: string, value: any) {
    const client = getClient(true);
    let parsedValue = value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value;
        }
      } else {
        parsedValue = value;
      }
    }
    const { data, error } = await client
      .from("site_settings")
      .upsert(
        { key, value: parsedValue, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export const pbSiteSettings = sbSiteSettings;

// ─── Hero Banners & Announcements ─────────────────────────────────────────────

export const sbHeroBanners = {
  async getAll(): Promise<PBHeroBanner[]> {
    try {
      const client = getClient(false);
      const { data, error } = await client
        .from("hero_banners")
        .select("*")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return (data || []).map((row) => ({
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
        collectionId: "hero_banners",
        collectionName: "hero_banners",
      }));
    } catch (err) {
      logError("[sbHeroBanners.getAll]", err);
      return [];
    }
  },
  async getActive() {
    return this.getAll();
  },
  getImageUrl(banner: any, pbUrl?: string) {
    const raw = banner?.imageSrc || banner?.image_src || banner?.image || "";
    return sanitizeImageUrl(raw);
  },
  async create(data: any) {
    const client = getClient(true);
    const mapped = {
      eyebrow: data.eyebrow,
      title_prefix:
        data.titlePrefix !== undefined ? data.titlePrefix : data.title_prefix,
      title_highlight:
        data.titleHighlight !== undefined
          ? data.titleHighlight
          : data.title_highlight,
      description: data.description,
      cta_text: data.ctaText !== undefined ? data.ctaText : data.cta_text,
      cta_secondary:
        data.ctaSecondary !== undefined
          ? data.ctaSecondary
          : data.cta_secondary,
      link: data.link,
      secondary_link:
        data.secondaryLink !== undefined
          ? data.secondaryLink
          : data.secondary_link,
      accent_color:
        data.accentColor !== undefined ? data.accentColor : data.accent_color,
      image_src: data.imageSrc !== undefined ? data.imageSrc : data.image_src,
      image_alt: data.imageAlt !== undefined ? data.imageAlt : data.image_alt,
      sort_order:
        data.sortOrder !== undefined ? data.sortOrder : data.sort_order || 0,
      is_enabled:
        data.isEnabled !== undefined
          ? data.isEnabled
          : (data.is_enabled ?? true),
      image: data.image,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: res, error } = await client
      .from("hero_banners")
      .insert(mapped)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const mapped: any = {};
    if (data.eyebrow !== undefined) mapped.eyebrow = data.eyebrow;
    if (data.titlePrefix !== undefined) mapped.title_prefix = data.titlePrefix;
    if (data.title_prefix !== undefined)
      mapped.title_prefix = data.title_prefix;
    if (data.titleHighlight !== undefined)
      mapped.title_highlight = data.titleHighlight;
    if (data.title_highlight !== undefined)
      mapped.title_highlight = data.title_highlight;
    if (data.description !== undefined) mapped.description = data.description;
    if (data.ctaText !== undefined) mapped.cta_text = data.ctaText;
    if (data.cta_text !== undefined) mapped.cta_text = data.cta_text;
    if (data.ctaSecondary !== undefined)
      mapped.cta_secondary = data.ctaSecondary;
    if (data.cta_secondary !== undefined)
      mapped.cta_secondary = data.cta_secondary;
    if (data.link !== undefined) mapped.link = data.link;
    if (data.secondaryLink !== undefined)
      mapped.secondary_link = data.secondaryLink;
    if (data.secondary_link !== undefined)
      mapped.secondary_link = data.secondary_link;
    if (data.accentColor !== undefined) mapped.accent_color = data.accentColor;
    if (data.accent_color !== undefined)
      mapped.accent_color = data.accent_color;
    if (data.imageSrc !== undefined) mapped.image_src = data.imageSrc;
    if (data.image_src !== undefined) mapped.image_src = data.image_src;
    if (data.imageAlt !== undefined) mapped.image_alt = data.imageAlt;
    if (data.image_alt !== undefined) mapped.image_alt = data.image_alt;
    if (data.sortOrder !== undefined) mapped.sort_order = data.sortOrder;
    if (data.sort_order !== undefined) mapped.sort_order = data.sort_order;
    if (data.isEnabled !== undefined) mapped.is_enabled = data.isEnabled;
    if (data.is_enabled !== undefined) mapped.is_enabled = data.is_enabled;
    if (data.image !== undefined) mapped.image = data.image;
    mapped.updated_at = new Date().toISOString();

    const { data: res, error } = await client
      .from("hero_banners")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("hero_banners").delete().eq("id", id);
    return !error;
  },
};

export const pbHeroBanners = sbHeroBanners;

export const sbAnnouncements = {
  async getAll(options?: any): Promise<PBAnnouncement[]> {
    try {
      const client = getClient(false);
      const { data, error } = await client
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const items = (data || []).map((row) => ({
        id: row.id,
        title: row.title,
        image: row.image || undefined,
        link: row.link || undefined,
        isActive: row.is_active ?? true,
        endsAt: row.ends_at || undefined,
        description: row.description || undefined,
        created: row.created_at,
        updated: row.updated_at,
        collectionId: "announcements",
        collectionName: "announcements",
      }));
      return items;
    } catch (err) {
      logError("[sbAnnouncements.getAll]", err);
      return [];
    }
  },
  async getActive() {
    return this.getAll();
  },
  getFileUrl(record: any, img?: string) {
    return sanitizeImageUrl(img || record?.image);
  },
  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("announcements")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("announcements")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("announcements").delete().eq("id", id);
    return !error;
  },
};

export const pbAnnouncements = sbAnnouncements;

export const sbHomepageBlocks = {
  async getAll(): Promise<PBHomepageBlock[]> {
    try {
      const client = getClient(false);
      const { data, error } = await client
        .from("homepage_blocks")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;

      return (data || []).map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        config: row.config || {},
        sortOrder: row.sort_order || 0,
        isEnabled: row.is_enabled ?? true,
        scheduledStart: row.scheduled_start || undefined,
        scheduledEnd: row.scheduled_end || undefined,
        deviceVisibility: row.device_visibility || "all",
        created: row.created_at,
        updated: row.updated_at,
        collectionId: "homepage_blocks",
        collectionName: "homepage_blocks",
      }));
    } catch (err) {
      logError("[sbHomepageBlocks.getAll]", err);
      return [];
    }
  },
  async getActive() {
    return this.getAll();
  },
  async create(data: any) {
    const client = getClient(true);
    const mapped = {
      type: data.type,
      title: data.title,
      config: data.config || {},
      sort_order:
        data.sortOrder !== undefined ? data.sortOrder : data.sort_order || 0,
      is_enabled:
        data.isEnabled !== undefined
          ? data.isEnabled
          : (data.is_enabled ?? true),
      scheduled_start:
        data.scheduledStart !== undefined
          ? data.scheduledStart
          : data.scheduled_start,
      scheduled_end:
        data.scheduledEnd !== undefined
          ? data.scheduledEnd
          : data.scheduled_end,
      device_visibility:
        data.deviceVisibility !== undefined
          ? data.deviceVisibility
          : data.device_visibility || "all",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: res, error } = await client
      .from("homepage_blocks")
      .insert(mapped)
      .select()
      .single();
    if (error) throw error;
    return {
      id: res.id,
      type: res.type,
      title: res.title,
      config: res.config,
      sortOrder: res.sort_order,
      isEnabled: res.is_enabled,
      scheduledStart: res.scheduled_start,
      scheduledEnd: res.scheduled_end,
      deviceVisibility: res.device_visibility,
      created: res.created_at,
      updated: res.updated_at,
    };
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const mapped: any = {};
    if (data.type !== undefined) mapped.type = data.type;
    if (data.title !== undefined) mapped.title = data.title;
    if (data.config !== undefined) mapped.config = data.config;
    if (data.sortOrder !== undefined) mapped.sort_order = data.sortOrder;
    if (data.sort_order !== undefined) mapped.sort_order = data.sort_order;
    if (data.isEnabled !== undefined) mapped.is_enabled = data.isEnabled;
    if (data.is_enabled !== undefined) mapped.is_enabled = data.is_enabled;
    if (data.scheduledStart !== undefined)
      mapped.scheduled_start = data.scheduledStart;
    if (data.scheduled_start !== undefined)
      mapped.scheduled_start = data.scheduled_start;
    if (data.scheduledEnd !== undefined)
      mapped.scheduled_end = data.scheduledEnd;
    if (data.scheduled_end !== undefined)
      mapped.scheduled_end = data.scheduled_end;
    if (data.deviceVisibility !== undefined)
      mapped.device_visibility = data.deviceVisibility;
    if (data.device_visibility !== undefined)
      mapped.device_visibility = data.device_visibility;
    mapped.updated_at = new Date().toISOString();

    const { data: res, error } = await client
      .from("homepage_blocks")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return {
      id: res.id,
      type: res.type,
      title: res.title,
      config: res.config,
      sortOrder: res.sort_order,
      isEnabled: res.is_enabled,
      scheduledStart: res.scheduled_start,
      scheduledEnd: res.scheduled_end,
      deviceVisibility: res.device_visibility,
      created: res.created_at,
      updated: res.updated_at,
    };
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client
      .from("homepage_blocks")
      .delete()
      .eq("id", id);
    return !error;
  },
};

export const pbHomepageBlocks = sbHomepageBlocks;

export const sbPromotions = {
  async getAll(): Promise<PBPromotion[]> {
    try {
      const client = getClient(false);
      const { data, error } = await client.from("promotions").select("*");

      if (error) throw error;

      const items = (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        discountValue: row.discount_value,
        applicableTo: row.applicable_to || [],
        couponCode: row.coupon_code || undefined,
        usageLimit: row.usage_limit || undefined,
        usageCount: row.usage_count || 0,
        minOrderValue: row.min_order_value || 0,
        startDate: row.start_date,
        endDate: row.end_date,
        isActive: row.is_active ?? true,
        created: row.created_at,
        updated: row.updated_at,
        collectionId: "promotions",
        collectionName: "promotions",
      }));
      return items;
    } catch (err) {
      logError("[sbPromotions.getAll]", err);
      return [];
    }
  },
  async create(data: any) {
    const client = getClient(true);
    const mapped = {
      name: data.name,
      type: data.type,
      discount_value:
        data.discountValue !== undefined
          ? data.discountValue
          : data.discount_value,
      applicable_to: data.applicableTo || [],
      coupon_code:
        data.couponCode !== undefined ? data.couponCode : data.coupon_code,
      usage_limit:
        data.usageLimit !== undefined ? data.usageLimit : data.usage_limit,
      usage_count:
        data.usageCount !== undefined ? data.usageCount : data.usage_count || 0,
      min_order_value:
        data.minOrderValue !== undefined
          ? data.minOrderValue
          : data.min_order_value || 0,
      start_date:
        data.startDate !== undefined ? data.startDate : data.start_date,
      end_date: data.endDate !== undefined ? data.endDate : data.end_date,
      is_active: data.isActive !== undefined ? data.isActive : data.is_active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: res, error } = await client
      .from("promotions")
      .insert(mapped)
      .select()
      .single();
    if (error) throw error;
    return {
      id: res.id,
      name: res.name,
      type: res.type,
      discountValue: res.discount_value,
      applicableTo: res.applicable_to,
      couponCode: res.coupon_code,
      usageLimit: res.usage_limit,
      usageCount: res.usage_count,
      minOrderValue: res.min_order_value,
      startDate: res.start_date,
      endDate: res.end_date,
      isActive: res.is_active,
      created: res.created_at,
      updated: res.updated_at,
    };
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const mapped: any = {};
    if (data.name !== undefined) mapped.name = data.name;
    if (data.type !== undefined) mapped.type = data.type;
    if (data.discountValue !== undefined)
      mapped.discount_value = data.discountValue;
    if (data.discount_value !== undefined)
      mapped.discount_value = data.discount_value;
    if (data.couponCode !== undefined) mapped.coupon_code = data.couponCode;
    if (data.coupon_code !== undefined) mapped.coupon_code = data.coupon_code;
    if (data.usageLimit !== undefined) mapped.usage_limit = data.usageLimit;
    if (data.usage_limit !== undefined) mapped.usage_limit = data.usage_limit;
    if (data.usageCount !== undefined) mapped.usage_count = data.usageCount;
    if (data.usage_count !== undefined) mapped.usage_count = data.usage_count;
    if (data.minOrderValue !== undefined)
      mapped.min_order_value = data.minOrderValue;
    if (data.min_order_value !== undefined)
      mapped.min_order_value = data.min_order_value;
    if (data.startDate !== undefined) mapped.start_date = data.startDate;
    if (data.start_date !== undefined) mapped.start_date = data.start_date;
    if (data.endDate !== undefined) mapped.end_date = data.endDate;
    if (data.end_date !== undefined) mapped.end_date = data.end_date;
    if (data.isActive !== undefined) mapped.is_active = data.isActive;
    if (data.is_active !== undefined) mapped.is_active = data.is_active;
    mapped.updated_at = new Date().toISOString();

    const { data: res, error } = await client
      .from("promotions")
      .update(mapped)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return {
      id: res.id,
      name: res.name,
      type: res.type,
      discountValue: res.discount_value,
      applicableTo: res.applicable_to,
      couponCode: res.coupon_code,
      usageLimit: res.usage_limit,
      usageCount: res.usage_count,
      minOrderValue: res.min_order_value,
      startDate: res.start_date,
      endDate: res.end_date,
      isActive: res.is_active,
      created: res.created_at,
      updated: res.updated_at,
    };
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("promotions").delete().eq("id", id);
    return !error;
  },
};

export const pbPromotions = sbPromotions;

export const sbAuditLog = {
  async getAll(limit = 100): Promise<PBAuditLog[]> {
    try {
      const client = getClient(true);
      const { data, error } = await client
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(typeof limit === "number" ? limit : 100);

      if (error) throw error;

      const items = (data || []).map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        collection: row.collection,
        recordId: row.record_id || "",
        oldValue: row.old_value || "",
        newValue: row.new_value || "",
        ip: row.ip || "",
        userAgent: row.user_agent || "",
        created: row.created_at,
        updated: row.updated_at,
        collectionId: "audit_log",
        collectionName: "audit_log",
      }));
      return items;
    } catch (err) {
      logError("[sbAuditLog.getAll]", err);
      return [];
    }
  },
};

export const pbAuditLog = sbAuditLog;

export const pbContactInquiries = {
  async create(data: {
    name: string;
    email: string;
    phone?: string;
    message: string;
  }) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("contact_inquiries")
      .insert({
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        message: data.message,
        status: "new",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return res;
  },
  async getAll() {
    const client = getClient(true);
    const { data } = await client
      .from("contact_inquiries")
      .select("*")
      .order("created_at", { ascending: false });
    return data || [];
  },
  async update(id: string, payload: any) {
    const client = getClient(true);
    const { data, error } = await client
      .from("contact_inquiries")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client
      .from("contact_inquiries")
      .delete()
      .eq("id", id);
    return !error;
  },
};

export const pbEmployees = {
  async getAll(): Promise<PBEmployee[]> {
    const client = getClient(true);
    // Never expose PINs to public POS cashier selection dropdowns
    const { data } = await client
      .from("employees")
      .select("id, name, role, is_active, isActive, avatar, email, phone, created_at, updated_at");
    return (data || []).map((e: any) => ({
      id: e.id,
      name: e.name || '',
      pin: '', // Omitted for client security
      role: (e.role === 'manager' ? 'manager' : 'cashier') as EmployeeRole,
      isActive: Boolean(e.isActive ?? e.is_active ?? true),
      created: e.created_at || new Date().toISOString(),
      updated: e.updated_at || new Date().toISOString(),
      collectionId: 'employees',
      collectionName: 'employees',
    }));
  },
  async getAllAdmin() {
    const client = getClient(true);
    const { data } = await client.from("employees").select("*");
    return data || [];
  },
  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("employees")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("employees")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("employees").delete().eq("id", id);
    return !error;
  },
};

export const pbSales = {
  async getAll() {
    const client = getClient(true);
    const { data } = await client
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false });
    return data || [];
  },
  async getRecent(limit = 20) {
    const client = getClient(true);
    const { data } = await client
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return data || [];
  },
  async getById(id: string) {
    const client = getClient(true);
    const { data } = await client
      .from("sales")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data;
  },
  async getItemsBySale(saleId: string) {
    const client = getClient(true);
    const { data } = await client
      .from("sale_items")
      .select("*")
      .eq("sale_id", saleId);
    return data || [];
  },
  async createSale(payload: any) {
    const client = getClient(true);
    const { items = [], ...saleData } = payload;
    const totalItemsCount = items.reduce(
      (sum: number, item: any) => sum + (item.quantity || 1),
      0,
    );
    const receiptNo =
      saleData.receipt_number ||
      `FTC-POS-${Date.now().toString(36).toUpperCase()}`;

    // 1. Pre-validation and reservation planning
    // Track assigned unit IDs for serialized inventory and counter deductions for non-serialized stock
    const assignedUnitIds: string[] = [];
    const claimedUnitIdSet = new Set<string>();
    const affectedProductIds = new Set<string>();
    const counterDeductions = new Map<string, number>();

    for (const item of items) {
      const pId = item.product_id || item.productId;
      if (pId) affectedProductIds.add(pId);

      const uId = item.unit_id || item.unitId;
      const barcode = item.unit_barcode || item.unitBarcode;
      const serial = item.unit_serial || item.unitSerial;
      const qty = item.quantity || 1;

      if (uId && /^[0-9a-f-]{36}$/i.test(uId)) {
        if (claimedUnitIdSet.has(uId)) {
          throw new Error(
            `Stock unit ${uId} is selected multiple times in this sale.`,
          );
        }
        const { data: unit, error: unitErr } = await client
          .from("stock_management")
          .select("id, status, product_id")
          .eq("id", uId)
          .maybeSingle();

        if (unitErr || !unit || unit.status !== "available") {
          throw new Error(
            `Specific stock unit (${uId}) is no longer available.`,
          );
        }
        claimedUnitIdSet.add(unit.id);
        assignedUnitIds.push(unit.id);
        if (unit.product_id) affectedProductIds.add(unit.product_id);
      } else if (barcode) {
        const { data: unit, error: unitErr } = await client
          .from("stock_management")
          .select("id, status, product_id")
          .eq("barcode", barcode)
          .eq("status", "available")
          .maybeSingle();

        if (unitErr || !unit || claimedUnitIdSet.has(unit.id)) {
          throw new Error(`Barcode unit (${barcode}) is no longer available.`);
        }
        claimedUnitIdSet.add(unit.id);
        assignedUnitIds.push(unit.id);
        if (unit.product_id) affectedProductIds.add(unit.product_id);
      } else if (serial) {
        const { data: unit, error: unitErr } = await client
          .from("stock_management")
          .select("id, status, product_id")
          .eq("serial_number", serial)
          .eq("status", "available")
          .maybeSingle();

        if (unitErr || !unit || claimedUnitIdSet.has(unit.id)) {
          throw new Error(`Serial unit (${serial}) is no longer available.`);
        }
        claimedUnitIdSet.add(unit.id);
        assignedUnitIds.push(unit.id);
        if (unit.product_id) affectedProductIds.add(unit.product_id);
      } else if (pId) {
        // Generic product sale: check for serialized unit rows first
        const { data: avail, error: availErr } = await client
          .from("stock_management")
          .select("id")
          .eq("product_id", pId)
          .eq("status", "available")
          .limit(qty + claimedUnitIdSet.size);

        if (availErr) {
          throw new Error(
            `Failed to query stock for product ${pId}: ${availErr.message}`,
          );
        }

        const availableUnclaimed = (avail || []).filter(
          (u) => !claimedUnitIdSet.has(u.id),
        );
        if (availableUnclaimed.length < qty) {
          // Counter-only inventory model: verify count_in_stock
          const { data: prod, error: prodErr } = await client
            .from("products")
            .select("count_in_stock")
            .eq("id", pId)
            .maybeSingle();
          if (prodErr || !prod || (prod.count_in_stock ?? 0) < qty) {
            throw new Error(
              `Insufficient stock for product (${pId}). Requested: ${qty}, Available: ${prod?.count_in_stock ?? 0}`,
            );
          }
          // Product uses counter-only stock; exclude from serialized-unit recount
          affectedProductIds.delete(pId);
          counterDeductions.set(pId, (counterDeductions.get(pId) || 0) + qty);
        } else {
          for (let i = 0; i < qty; i++) {
            const uid = availableUnclaimed[i].id;
            claimedUnitIdSet.add(uid);
            assignedUnitIds.push(uid);
          }
        }
      }
    }

    // 2. Insert the sale record
    const fullSaleData = {
      status: "completed",
      receipt_number: receiptNo,
      date: saleData.date || new Date().toISOString(),
      items_count: totalItemsCount,
      cashier_name: saleData.cashier_name || "Cashier",
      cashier_id: saleData.cashier_id || null,
      customer_name: saleData.customer_name || null,
      customer_phone: saleData.customer_phone || null,
      customer_email: saleData.customer_email || null,
      customer_id: saleData.customer_id || null,
      subtotal: saleData.subtotal || 0,
      discount: saleData.discount || 0,
      tax_amount: saleData.tax_amount || 0,
      total: saleData.total || 0,
      payment_method: saleData.payment_method || "cash",
      cash_tendered: saleData.cash_tendered || 0,
      change_due: saleData.change_due || 0,
      notes: saleData.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: sale, error: saleErr } = await client
      .from("sales")
      .insert(fullSaleData)
      .select()
      .single();
    if (saleErr) throw saleErr;

    // 3. Insert sale_items and mutate inventory with rollback guard
    const createdItems: any[] = [];
    try {
      if (items.length > 0) {
        const itemsToInsert = items.map((item: any) => ({
          sale_id: sale.id,
          product_id: item.product_id || item.productId || null,
          product_name: item.product_name || item.productName || "Product",
          sku: item.sku || "",
          unit_price: item.unit_price ?? item.unitPrice ?? 0,
          item_discount: item.item_discount ?? item.itemDiscount ?? 0,
          unit_cost: item.unit_cost ?? item.unitCost ?? 0,
          quantity: item.quantity || 1,
          line_total: item.line_total ?? item.lineTotal ?? 0,
          unit_id: item.unit_id || item.unitId || null,
          unit_barcode: item.unit_barcode || item.unitBarcode || null,
          unit_serial: item.unit_serial || item.unitSerial || null,
          image_url: item.image_url || item.imageUrl || null,
          category: item.category || null,
        }));

        const { data: inserted, error: itemsErr } = await client
          .from("sale_items")
          .insert(itemsToInsert)
          .select();
        if (itemsErr) throw itemsErr;
        if (inserted) createdItems.push(...inserted);

        // 3a. Batch claim stock_management units with strict available status guard to prevent race conditions
        if (assignedUnitIds.length > 0) {
          const { data: claimed, error: stockErr } = await client
            .from("stock_management")
            .update({ status: "sold", order_id: sale.id })
            .in("id", assignedUnitIds)
            .eq("status", "available")
            .select("id");
          if (stockErr) throw stockErr;

          if ((claimed?.length ?? 0) !== assignedUnitIds.length) {
            throw new Error(
              "One or more stock units were already claimed by another concurrent transaction.",
            );
          }
        }

        // 3b. Apply counter-only stock deductions safely
        for (const [pId, qtyToDeduct] of counterDeductions.entries()) {
          const { data: prod, error: pGetErr } = await client
            .from("products")
            .select("count_in_stock")
            .eq("id", pId)
            .single();
          if (pGetErr) throw pGetErr;
          const currentStock = prod?.count_in_stock ?? 0;
          if (currentStock < qtyToDeduct) {
            throw new Error(
              `Insufficient stock for counter-only product ${pId}.`,
            );
          }
          const newStock = Math.max(0, currentStock - qtyToDeduct);
          const { error: pUpdErr } = await client
            .from("products")
            .update({ count_in_stock: newStock })
            .eq("id", pId);
          if (pUpdErr) throw pUpdErr;
        }

        // 3c. Recount available stock for affected products with serialized units
        for (const pId of Array.from(affectedProductIds)) {
          const { count, error: countErr } = await client
            .from("stock_management")
            .select("id", { count: "exact", head: true })
            .eq("product_id", pId)
            .eq("status", "available");
          if (countErr) throw countErr;
          if (typeof count === "number") {
            const { error: pCountErr } = await client
              .from("products")
              .update({ count_in_stock: count })
              .eq("id", pId);
            if (pCountErr) throw pCountErr;
          }
        }
      }
    } catch (mutationErr: any) {
      logError(
        "[createSale] Failure during mutation, rolling back sale:",
        mutationErr,
      );
      if (assignedUnitIds.length > 0) {
        await client
          .from("stock_management")
          .update({ status: "available", order_id: null })
          .in("id", assignedUnitIds)
          .eq("order_id", sale.id);
      }
      for (const [pId, qtyToRestore] of counterDeductions.entries()) {
        const { data: pData } = await client
          .from("products")
          .select("count_in_stock")
          .eq("id", pId)
          .maybeSingle();
        if (pData) {
          await client
            .from("products")
            .update({
              count_in_stock: (pData.count_in_stock ?? 0) + qtyToRestore,
            })
            .eq("id", pId);
        }
      }
      await client.from("sale_items").delete().eq("sale_id", sale.id);
      await client.from("sales").delete().eq("id", sale.id);
      throw new Error(`Failed to complete POS sale: ${mutationErr.message}`);
    }

    return { sale, items: createdItems };
  },
  async voidSale(id: string) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("sales")
      .update({ status: "voided", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // Release linked units back to available
    const { data: linkedUnits } = await client
      .from("stock_management")
      .select("id, product_id")
      .eq("order_id", id);
    if (linkedUnits && linkedUnits.length > 0) {
      await client
        .from("stock_management")
        .update({ status: "available", order_id: null })
        .eq("order_id", id);
      const affectedProducts = Array.from(
        new Set(linkedUnits.map((u: any) => u.product_id).filter(Boolean)),
      );
      for (const pId of affectedProducts) {
        const { count } = await client
          .from("stock_management")
          .select("id", { count: "exact", head: true })
          .eq("product_id", pId)
          .eq("status", "available");
        if (typeof count === "number") {
          await client
            .from("products")
            .update({ count_in_stock: count })
            .eq("id", pId);
        }
      }
    }
    return res;
  },
  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("sales")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("sales")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("sales").delete().eq("id", id);
    return !error;
  },
};

export const pbCustomers = {
  async getAll() {
    const client = getClient(true);
    const { data } = await client.from("customers").select("*");
    return data || [];
  },
  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("customers")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("customers")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("customers").delete().eq("id", id);
    return !error;
  },
};

export const pbWholesaleDealers = {
  async getAll() {
    const client = getClient(true);
    const { data } = await client.from("wholesale_dealers").select("*");
    return data || [];
  },
  async getById(id: string) {
    const client = getClient(true);
    const { data } = await client
      .from("wholesale_dealers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data;
  },
  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("wholesale_dealers")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("wholesale_dealers")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client
      .from("wholesale_dealers")
      .delete()
      .eq("id", id);
    return !error;
  },
};

export const pbQuotations = {
  async getAll() {
    const client = getClient(true);
    const { data } = await client.from("quotations").select("*");
    return data || [];
  },
  async getById(id: string) {
    const client = getClient(true);
    const { data } = await client
      .from("quotations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data;
  },
  async create(data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("quotations")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async update(id: string, data: any) {
    const client = getClient(true);
    const { data: res, error } = await client
      .from("quotations")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res;
  },
  async delete(id: string) {
    const client = getClient(true);
    const { error } = await client.from("quotations").delete().eq("id", id);
    return !error;
  },
};
