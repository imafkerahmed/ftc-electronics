'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Plus, RotateCw, Edit3, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { pbProducts } from '@/lib/pb-collections';
import { updateProductStockAction } from '@/app/actions/admin';
import type { Product } from '@/types/product';
import { Button } from '@/components/ui/button';

export default function AdminInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await pbProducts.getAll({ perPage: 100 });
      setProducts(res.items || []);
    } catch (err: any) {
      console.error('Failed to load inventory products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStockStatus = (count: number) => {
    if (count === 0) {
      return { label: 'Out of Stock', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
    }
    if (count <= 10) {
      return { label: 'Low Stock', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    }
    return { label: 'In Stock', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
  };

  const handleRestock = (id: string, currentStock: number) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const newStock = currentStock + 20;
      const res = await updateProductStockAction(id, newStock);
      if (res.success) {
        setSuccess('Product restocked by 20 units successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to restock product.');
      }
    });
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Feedback Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-500 text-xs">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-500 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Title / Action headers */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">Product Inventory</h1>
          <p className="text-xs text-muted-foreground mt-1">Add, update, or restock item collections.</p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Products Inventory Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading inventory levels...
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold">
                  <th className="p-4">SKU / ID</th>
                  <th className="p-4">Product Name</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Price</th>
                  <th className="p-4">Stock Level</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">
                      No inventory items found.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => {
                    const status = getStockStatus(product.countInStock);
                    return (
                      <tr key={product.id} className="hover:bg-muted/10 transition-colors">
                        <td className="p-4 font-mono text-[10px] text-muted-foreground">{product.id}</td>
                        <td className="p-4 font-bold text-foreground">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded bg-muted border border-border relative overflow-hidden shrink-0">
                              <Image
                                src={product.images[0]}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="32px"
                              />
                            </div>
                            <span>{product.name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground capitalize">{product.category}</td>
                        <td className="p-4 font-bold text-foreground">
                          {product.price.toLocaleString('en-US', { style: 'currency', currency: 'LKR' })}
                        </td>
                        <td className="p-4 font-semibold">{product.countInStock} units</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded border text-[10px] uppercase font-bold tracking-wider ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRestock(product.id, product.countInStock)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
                            title="Restock 20 units"
                            disabled={isPending}
                          >
                            {isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/admin/products')}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
                            title="Edit Item"
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
          )}
        </div>
      </div>
    </div>
  );
}
