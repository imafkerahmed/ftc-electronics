import { useState, useMemo, useCallback } from 'react';
import { Product, ProductFilterParams } from '@/types/product';

const defaultFilters: ProductFilterParams = {
  category: undefined,
  brand: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  search: '',
  sortBy: 'newest',
};

export function useProducts(initialProducts: Product[]) {
  const [filters, setFilters] = useState<ProductFilterParams>(defaultFilters);

  const updateFilters = useCallback((newFilters: Partial<ProductFilterParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const filteredProducts = useMemo(() => {
    let result = [...initialProducts];

    // Filter by Search Query
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.brand.toLowerCase().includes(searchLower) ||
          p.category.toLowerCase().includes(searchLower)
      );
    }

    // Filter by Category
    if (filters.category && filters.category !== 'all') {
      result = result.filter(
        (p) => p.category.toLowerCase() === filters.category!.toLowerCase()
      );
    }

    // Filter by Brand
    if (filters.brand) {
      result = result.filter(
        (p) => p.brand.toLowerCase() === filters.brand!.toLowerCase()
      );
    }

    // Filter by Min Price
    if (filters.minPrice !== undefined) {
      result = result.filter((p) => {
        const activePrice = p.discountPrice ?? p.price;
        return activePrice >= filters.minPrice!;
      });
    }

    // Filter by Max Price
    if (filters.maxPrice !== undefined) {
      result = result.filter((p) => {
        const activePrice = p.discountPrice ?? p.price;
        return activePrice <= filters.maxPrice!;
      });
    }

    // Sorting Logic
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'price-asc':
          result.sort((a, b) => (a.discountPrice ?? a.price) - (b.discountPrice ?? b.price));
          break;
        case 'price-desc':
          result.sort((a, b) => (b.discountPrice ?? b.price) - (a.discountPrice ?? a.price));
          break;
        case 'rating':
          result.sort((a, b) => b.rating - a.rating);
          break;
        case 'newest':
        default:
          result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
      }
    }

    return result;
  }, [initialProducts, filters]);

  // Unique list of brands in current products for filtering options
  const brands = useMemo(() => {
    return Array.from(new Set(initialProducts.map((p) => p.brand)));
  }, [initialProducts]);

  return {
    filters,
    filteredProducts,
    brands,
    updateFilters,
    resetFilters,
  };
}
