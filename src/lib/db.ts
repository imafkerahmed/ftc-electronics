'use server';

/**
 * Database access layer for FTC Electronics storefront.
 * Connects to live data from Supabase PostgreSQL.
 */

import { cache } from 'react';
import { Product, Category, Brand } from '../types/product';
import { sbProducts, sbCategories, sbBrands, pbReviews, pbAnnouncements } from './supabase-collections';

/**
 * Get products with optional filters.
 */
export const getProducts = cache(async function getProducts(filters?: {
  category?: string;
  categoryId?: string;
  brand?: string;
  brandId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price-asc' | 'price-desc' | 'rating' | 'newest';
  status?: 'draft' | 'published';
  page?: number;
  perPage?: number;
}): Promise<Product[]> {
  try {
    let sort: string | undefined;
    if (filters?.sortBy === 'price-asc') sort = 'price';
    if (filters?.sortBy === 'price-desc') sort = '-price';
    if (filters?.sortBy === 'rating') sort = '-rating';
    if (filters?.sortBy === 'newest') sort = '-created_at';

    const result = await sbProducts.getAll({
      category: filters?.category,
      categoryId: filters?.categoryId,
      brand: filters?.brand,
      brandId: filters?.brandId,
      search: filters?.search,
      minPrice: filters?.minPrice,
      maxPrice: filters?.maxPrice,
      status: filters?.status || 'published',
      sort,
      page: filters?.page || 1,
      perPage: filters?.perPage || 100,
    });
    return result?.items || [];
  } catch (err) {
    console.error('[db] getProducts failed:', (err as Error).message);
    return [];
  }
});

/**
 * Get a single product by slug.
 */
export const getProductBySlug = cache(async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    return await sbProducts.getBySlug(slug, { status: 'published' });
  } catch (err) {
    console.error(`[db] getProductBySlug failed for ${slug}:`, (err as Error).message);
    return null;
  }
});

/**
 * Get featured products.
 */
export const getFeaturedProducts = cache(async function getFeaturedProducts(): Promise<Product[]> {
  try {
    return await sbProducts.getFeatured();
  } catch (err) {
    console.error('[db] getFeaturedProducts failed:', (err as Error).message);
    return [];
  }
});

/**
 * Get all categories.
 */
export const getCategories = cache(async function getCategories(): Promise<Category[]> {
  try {
    return await sbCategories.getAll();
  } catch (err) {
    console.error('[db] getCategories failed:', (err as Error).message);
    return [];
  }
});

/**
 * Get a single category by slug.
 */
export const getCategoryBySlug = cache(async function getCategoryBySlug(slug: string): Promise<Category | null> {
  try {
    return await sbCategories.getBySlug(slug);
  } catch (err) {
    console.error(`[db] getCategoryBySlug failed for ${slug}:`, (err as Error).message);
    return null;
  }
});

/**
 * Get all brands.
 */
export const getBrands = cache(async function getBrands(): Promise<Brand[]> {
  try {
    const rawBrands = await sbBrands.getAll();
    return (rawBrands || []).map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug || b.name.toLowerCase().replace(/\s+/g, '-'),
      logo: b.logo || undefined,
      description: b.description,
    }));
  } catch (err) {
    console.error('[db] getBrands failed:', (err as Error).message);
    return [];
  }
});

/**
 * Get a brand by slug.
 */
export const getBrandBySlug = cache(async function getBrandBySlug(slug: string): Promise<Brand | null> {
  try {
    const pbBrand = await sbBrands.getBySlug(slug);
    if (!pbBrand) return null;
    return {
      id: pbBrand.id,
      name: pbBrand.name,
      slug: pbBrand.slug || pbBrand.name.toLowerCase().replace(/\s+/g, '-'),
      logo: pbBrand.logo || undefined,
      description: pbBrand.description,
    };
  } catch (err) {
    console.error(`[db] getBrandBySlug failed for ${slug}:`, (err as Error).message);
    return null;
  }
});

/**
 * Search products by query string.
 */
export const searchProducts = cache(async function searchProducts(query: string): Promise<Product[]> {
  if (!query || query.trim() === '') return [];
  return getProducts({ search: query.trim() });
});

/**
 * Get products for a named collection (on-sale, new-arrivals, air-purifiers).
 */
export const getCollectionProducts = cache(async function getCollectionProducts(
  collection: 'on-sale' | 'new-arrivals' | 'air-purifiers',
  limit?: number
): Promise<Product[]> {
  const sbCollection = collection === 'air-purifiers' ? 'featured' : collection;
  try {
    return await sbProducts.getByCollection(
      sbCollection as 'on-sale' | 'new-arrivals' | 'featured',
      limit
    );
  } catch (err) {
    console.error(`[db] getCollectionProducts failed for ${collection}:`, (err as Error).message);
    return [];
  }
});

/**
 * Get reviews for a product or general storefront reviews.
 */
export const getReviews = cache(async function getReviews(productId?: string) {
  try {
    return await pbReviews.getByProductId(productId || "");
  } catch (err) {
    console.error('[db] getReviews failed:', (err as Error).message);
    return [];
  }
});

/**
 * Get active announcements for modal popups.
 */
export const getActiveAnnouncements = cache(async function getActiveAnnouncements() {
  try {
    return await pbAnnouncements.getActive();
  } catch (err) {
    console.error('[db] getActiveAnnouncements failed:', (err as Error).message);
    return [];
  }
});
