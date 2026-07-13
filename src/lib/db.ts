/**
 * Database access layer for the FTC Electronics storefront.
 * 
 * This module provides the data access functions consumed by all storefront
 * pages and components. It queries live data from PocketBase.
 */

import { Product, Category, Brand } from '../types/product';
import { pbProducts, pbCategories, pbBrands } from './pb-collections';
import { getPbUrl } from './pb-admin';

/**
 * Get products with optional filters.
 */
export async function getProducts(filters?: {
  category?: string;
  brand?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price-asc' | 'price-desc' | 'rating' | 'newest';
  page?: number;
  perPage?: number;
}): Promise<Product[]> {
  try {
    let sort: string | undefined;
    if (filters?.sortBy === 'price-asc') sort = 'price';
    if (filters?.sortBy === 'price-desc') sort = '-price';
    if (filters?.sortBy === 'rating') sort = '-rating';
    if (filters?.sortBy === 'newest') sort = '-created';

    const filterStrings: string[] = [];
    if (filters?.minPrice !== undefined) {
      filterStrings.push(`price >= ${filters.minPrice}`);
    }
    if (filters?.maxPrice !== undefined) {
      filterStrings.push(`price <= ${filters.maxPrice}`);
    }

    const result = await pbProducts.getAll({
      category: filters?.category,
      brand: filters?.brand,
      search: filters?.search,
      sort,
      filter: filterStrings.length > 0 ? filterStrings.join(' && ') : undefined,
      page: filters?.page || 1,
      perPage: filters?.perPage || 100,
    });
    return result?.items || [];
  } catch (err) {
    console.error('[db] pbProducts.getAll failed:', (err as Error).message);
    return [];
  }
}

/**
 * Get a single product by slug.
 */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    return await pbProducts.getBySlug(slug);
  } catch (err) {
    console.error(`[db] pbProducts.getBySlug failed for ${slug}:`, (err as Error).message);
    return null;
  }
}

/**
 * Get featured products.
 */
export async function getFeaturedProducts(): Promise<Product[]> {
  try {
    return await pbProducts.getFeatured();
  } catch (err) {
    console.error('[db] pbProducts.getFeatured failed:', (err as Error).message);
    return [];
  }
}

/**
 * Get all categories.
 */
export async function getCategories(): Promise<Category[]> {
  try {
    return await pbCategories.getAll();
  } catch (err) {
    console.error('[db] pbCategories.getAll failed:', (err as Error).message);
    return [];
  }
}

/**
 * Get a single category by slug.
 */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  try {
    const categories = await getCategories();
    return categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase() || c.name.toLowerCase() === slug.toLowerCase()) || null;
  } catch (err) {
    console.error(`[db] getCategoryBySlug failed for ${slug}:`, (err as Error).message);
    return null;
  }
}

/**
 * Get all brands.
 */
export async function getBrands(): Promise<Brand[]> {
  try {
    const rawBrands = await pbBrands.getAll();
    const pbUrl = getPbUrl();
    return (rawBrands || []).map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug || b.name.toLowerCase().replace(/\s+/g, '-'),
      logo: b.logo ? `${pbUrl}/api/files/brands/${b.id}/${b.logo}` : undefined,
      description: b.description,
    }));
  } catch (err) {
    console.error('[db] pbBrands.getAll failed:', (err as Error).message);
    return [];
  }
}

/**
 * Get a brand by slug.
 */
export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  try {
    const brands = await getBrands();
    return brands.find((b) => b.slug.toLowerCase() === slug.toLowerCase() || b.name.toLowerCase() === slug.toLowerCase()) || null;
  } catch (err) {
    console.error(`[db] getBrandBySlug failed for ${slug}:`, (err as Error).message);
    return null;
  }
}

/**
 * Search products by query string.
 */
export async function searchProducts(query: string): Promise<Product[]> {
  if (!query || query.trim() === '') return [];
  return getProducts({ search: query.trim() });
}

/**
 * Get products for a named collection (on-sale, new-arrivals, air-purifiers).
 */
export async function getCollectionProducts(
  collection: 'on-sale' | 'new-arrivals' | 'air-purifiers'
): Promise<Product[]> {
  const pbCollection = collection === 'air-purifiers' ? 'featured' : collection;
  try {
    return await pbProducts.getByCollection(
      pbCollection as 'on-sale' | 'new-arrivals' | 'featured'
    );
  } catch (err) {
    console.error(`[db] pbProducts.getByCollection failed for ${collection}:`, (err as Error).message);
    return [];
  }
}

