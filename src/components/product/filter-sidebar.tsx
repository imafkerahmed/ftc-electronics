'use client';

import { ProductFilterParams } from '@/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FilterSidebarProps {
  filters: ProductFilterParams;
  brands: string[];
  categories: string[];
  updateFilters: (filters: Partial<ProductFilterParams>) => void;
  resetFilters: () => void;
}

export default function FilterSidebar({
  filters,
  brands,
  categories,
  updateFilters,
  resetFilters,
}: FilterSidebarProps) {
  return (
    <aside className="w-full md:w-64 shrink-0 flex flex-col gap-6 text-foreground bg-card p-6 rounded-xl border border-border">
      
      {/* Search Input Box */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Search</h3>
        <Input
          type="text"
          placeholder="Search products..."
          value={filters.search || ''}
          onChange={(e) => updateFilters({ search: e.target.value })}
          className="h-9 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
        />
      </div>

      {/* Categories filter */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Categories</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => updateFilters({ category: undefined })}
            className={`text-left text-sm py-1 px-2 rounded transition-colors ${
              filters.category === undefined ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            All Products
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => updateFilters({ category: cat.toLowerCase() })}
              className={`text-left text-sm py-1 px-2 rounded capitalize transition-colors ${
                filters.category === cat.toLowerCase() ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Brands filter */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Brands</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => updateFilters({ brand: undefined })}
            className={`text-left text-sm py-1 px-2 rounded transition-colors ${
              filters.brand === undefined ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            All Brands
          </button>
          {brands.map((brand) => (
            <button
              key={brand}
              onClick={() => updateFilters({ brand: brand.toLowerCase() })}
              className={`text-left text-sm py-1 px-2 rounded transition-colors ${
                filters.brand === brand.toLowerCase() ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {brand}
            </button>
          ))}
        </div>
      </div>

      {/* Price Range Filter */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Price Range ($)</h3>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={filters.minPrice ?? ''}
            onChange={(e) =>
              updateFilters({
                minPrice: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-9 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.maxPrice ?? ''}
            onChange={(e) =>
              updateFilters({
                maxPrice: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="h-9 bg-background border-border text-foreground text-sm focus-visible:ring-blue-500"
          />
        </div>
      </div>

      {/* Sorting order */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sort By</h3>
        <select
          value={filters.sortBy || 'newest'}
          onChange={(e) =>
            updateFilters({ sortBy: e.target.value as ProductFilterParams['sortBy'] })
          }
          className="w-full h-9 bg-background border border-border text-sm text-foreground rounded px-2.5 outline-none focus:border-blue-500"
        >
          <option value="newest">Newest Arrivals</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="rating">Top Rated</option>
        </select>
      </div>

      {/* Reset Action */}
      <Button
        variant="outline"
        size="sm"
        onClick={resetFilters}
        className="mt-2 text-muted-foreground border-border hover:bg-muted hover:text-foreground cursor-pointer"
      >
        Clear All Filters
      </Button>

    </aside>
  );
}
