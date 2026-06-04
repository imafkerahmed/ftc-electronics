'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Plus, RotateCw, Edit3 } from 'lucide-react';
import { MOCK_PRODUCTS } from '@/lib/db';
import { Button } from '@/components/ui/button';

export default function AdminInventoryPage() {
  const [products, setProducts] = useState(MOCK_PRODUCTS);

  const getStockStatus = (count: number) => {
    if (count === 0) {
      return { label: 'Out of Stock', color: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (count <= 10) {
      return { label: 'Low Stock', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    return { label: 'In Stock', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  const handleRestock = (id: string) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { ...p, countInStock: p.countInStock + 20 };
        }
        return p;
      })
    );
  };

  return (
    <div className="space-y-6 text-foreground">
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
            onClick={() => console.log('Mock: Open create product dialog')}
          >
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Products Inventory Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
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
              {products.map((product) => {
                const status = getStockStatus(product.countInStock);
                return (
                  <tr key={product.id} className="hover:bg-secondary/20">
                    <td className="p-4 font-mono text-muted-foreground">{product.id}</td>
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
                    <td className="p-4 font-bold text-foreground">${product.price.toFixed(2)}</td>
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
                        onClick={() => handleRestock(product.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
                        title="Restock 20 units"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted border border-border"
                        title="Edit Item"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
