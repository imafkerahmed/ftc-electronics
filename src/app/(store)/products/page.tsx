"use client";

import { use, useEffect } from "react";
import { useProducts } from "@/hooks/use-products";
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/db";
import FilterSidebar from "@/components/product/filter-sidebar";
import ProductGrid from "@/components/product/product-grid";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ProductsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = use(searchParams);
  const categoryParam =
    typeof resolvedSearchParams.category === "string"
      ? resolvedSearchParams.category
      : undefined;
  const searchParam =
    typeof resolvedSearchParams.search === "string"
      ? resolvedSearchParams.search
      : "";

  // Initialize filtering logic
  const { filters, filteredProducts, brands, updateFilters, resetFilters } =
    useProducts(MOCK_PRODUCTS);

  // Set initial query filters from URL params if present
  useEffect(() => {
    if (categoryParam || searchParam) {
      updateFilters({
        category: categoryParam,
        search: searchParam,
      });
    }
  }, [categoryParam, searchParam, updateFilters]);

  const categoriesList = MOCK_CATEGORIES.map((c) => c.name);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Title */}
      <div className="border-b border-border pb-5 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Product Catalog
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Browse our premium collection of performance computers, peripherals,
          and smartphones.
        </p>
      </div>

      {/* Catalog Split Layout */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Filter Sidebar panel */}
        <FilterSidebar
          filters={filters}
          brands={brands}
          categories={categoriesList}
          updateFilters={updateFilters}
          resetFilters={resetFilters}
        />

        {/* Product Grid Area */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-semibold text-foreground">
                {filteredProducts.length}
              </span>{" "}
              products
            </p>
          </div>

          <ProductGrid products={filteredProducts} />
        </div>
      </div>
    </div>
  );
}
