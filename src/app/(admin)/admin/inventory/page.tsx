'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Plus, Edit3, Loader2, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAdminProductsAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { getProductThumbnail } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { adminKeys } from '@/lib/query-keys';
import { useDebounce } from 'use-debounce';

export default function AdminInventoryPage() {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch] = useDebounce(searchInput, 500);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');

  const { data: result, isLoading, isError, isFetching } = useQuery({
    queryKey: adminKeys.products({
      page,
      pageSize,
      search: debouncedSearch,
      stockStatus: statusFilter === 'all' ? undefined : statusFilter
    }),
    queryFn: async () => {
      const res = await getAdminProductsAction({
        page,
        pageSize,
        search: debouncedSearch,
        stockStatus: statusFilter === 'all' ? undefined : statusFilter,
      });
      if (!res.success) throw new Error(res.error || 'Failed to load inventory products');
      return res;
    },
  });

  const products = result?.data || [];

  const getStockStatus = (count: number) => {
    if (count === 0) {
      return { key: 'out_of_stock', label: 'Out of Stock', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
    }
    if (count <= 10) {
      return { key: 'low_stock', label: 'Low Stock', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    }
    return { key: 'in_stock', label: 'In Stock', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">Stock Management</h1>
          <p className="text-xs text-muted-foreground mt-1">Monitor product stock counts and manage inventory levels.</p>
        </div>

        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full mr-4">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating...
            </div>
          )}
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-9 px-4 flex items-center gap-1.5"
            onClick={() => router.push('/admin/products')}
          >
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Search by product name..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <span className="absolute left-3 top-2.5 text-muted-foreground text-xs">🔍</span>
        </div>

        <div className="flex items-center gap-1 bg-card/60 p-1 rounded-lg border border-border">
          {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setStatusFilter(filter);
                setPage(1);
              }}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer capitalize ${
                statusFilter === filter
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Products Stock Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs flex flex-col min-h-[400px]">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                <th className="p-4">Product</th>
                <th className="p-4">Category</th>
                <th className="p-4">Brand</th>
                <th className="p-4">Price</th>
                <th className="p-4 font-bold text-blue-600 dark:text-blue-400">Stock Count</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-foreground">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading stock data...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-red-500">
                    Failed to load inventory products.
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                    No matching products found.
                  </td>
                </tr>
              ) : (
                products.map((product: any) => {
                  const status = getStockStatus(product.countInStock);
                  return (
                    <tr
                      key={product.id}
                      onClick={() => router.push(`/admin/inventory/${product.id}`)}
                      className="hover:bg-muted/20 transition-colors cursor-pointer group"
                    >
                      <td className="p-4 font-bold text-foreground">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted border border-border relative overflow-hidden shrink-0">
                            {(() => {
                              const thumb = getProductThumbnail(product.images);
                              return thumb ? (
                                <Image
                                  src={thumb}
                                  alt={product.name}
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                  unoptimized
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center">
                                  <Package className="h-5 w-5 text-muted-foreground/50" />
                                </div>
                              );
                            })()}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground leading-tight group-hover:text-blue-500 transition-colors">{product.name}</p>
                            <p className="text-muted-foreground font-mono text-[10px] mt-0.5">{product.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground capitalize">{product.category}</td>
                      <td className="p-4 text-muted-foreground capitalize">{product.brand}</td>
                      <td className="p-4 font-bold text-foreground">
                        {product.price.toLocaleString('en-US', { style: 'currency', currency: product.currency || 'LKR' })}
                      </td>
                      <td className="p-4 font-extrabold text-sm text-foreground">
                        {product.countInStock} <span className="text-[10px] text-muted-foreground font-normal">units</span>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded border text-[10px] uppercase font-bold tracking-wider ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/admin/inventory/${product.id}`)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
                          title="Manage Stock & QR Code"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {result?.totalPages ? (
          <div className="p-4 border-t border-border flex items-center justify-between bg-card text-xs">
            <div className="text-muted-foreground">
              Showing <span className="font-bold text-foreground">{(page - 1) * pageSize + 1}</span> to <span className="font-bold text-foreground">{Math.min(page * pageSize, result.total || 0)}</span> of <span className="font-bold text-foreground">{result.total}</span> products
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <div className="px-3 py-1 bg-secondary/50 rounded font-mono text-xs font-bold">
                Page {page} of {result.totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setPage(p => Math.min(result.totalPages || 1, p + 1))}
                disabled={page === result.totalPages || isLoading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
