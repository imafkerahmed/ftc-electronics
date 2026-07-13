'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { 
  Package, Plus, Search, Filter, ArrowUpDown, Edit, Trash2, Eye, 
  X, CheckCircle, AlertCircle, Save, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  createProductAction, 
  updateProductAction, 
  deleteProductAction 
} from '@/app/actions/admin';
import { pbCategories, pbBrands, pbProducts } from '@/lib/pb-collections';
import { Product } from '@/types/product';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  
  // Relations state
  const [allCategories, setAllCategories] = useState<{ id: string; name: string }[]>([]);
  const [allBrands, setAllBrands] = useState<{ id: string; name: string }[]>([]);
  
  // Drawer/Modal states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [price, setPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [category, setCategory] = useState(''); // Stores category ID
  const [brand, setBrand] = useState('');       // Stores brand ID
  const [countInStock, setCountInStock] = useState('10');
  const [description, setDescription] = useState('');
  const [imageFiles, setImageFiles] = useState<FileList | null>(null);
  const [badgesText, setBadgesText] = useState('');
  const [specsText, setSpecsText] = useState('{}');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isPreOrder, setIsPreOrder] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'LKR'>('USD');
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load products initially
  const loadData = async () => {
    try {
      setLoadingProducts(true);
      const res = await pbProducts.getAll({ perPage: 100 });
      setProducts(res.items || []);
    } catch (err: any) {
      console.error('Failed to load products:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadRelations = async () => {
    try {
      const [cats, brs] = await Promise.all([
        pbCategories.getAll(),
        pbBrands.getAll(),
      ]);
      setAllCategories(cats.map(c => ({ id: c.id, name: c.name })));
      setAllBrands(brs.map(b => ({ id: b.id, name: b.name })));
    } catch (err) {
      console.error('Failed to load category/brand relations:', err);
    }
  };

  useEffect(() => {
    loadData();
    loadRelations();
  }, []);

  // Filtered list
  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term) ||
      p.brand.toLowerCase().includes(term)
    );
  });

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setName('');
    setSlug('');
    setPrice('');
    setDiscountPrice('');
    setCategory(allCategories[0]?.id || '');
    setBrand(allBrands[0]?.id || '');
    setCountInStock('10');
    setDescription('');
    setImageFiles(null);
    setBadgesText('');
    setSpecsText('{}');
    setStatus('published');
    setIsFeatured(false);
    setIsPreOrder(false);
    setCurrency('USD');
    setError(null);
    setSuccess(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setSlug(product.slug);
    setPrice(product.price.toString());
    setDiscountPrice(product.discountPrice?.toString() || '');
    
    // Resolve relation IDs from names
    const catRecord = allCategories.find(c => c.name === product.category);
    const brandRecord = allBrands.find(b => b.name === product.brand);
    setCategory(catRecord ? catRecord.id : '');
    setBrand(brandRecord ? brandRecord.id : '');
    
    setCountInStock(product.countInStock.toString());
    setDescription(product.description || '');
    setImageFiles(null);
    setBadgesText(product.badges?.join(', ') || '');
    setSpecsText(JSON.stringify(product.specs || {}, null, 2));
    setStatus(product.status || 'published');
    setIsFeatured(product.isFeatured || false);
    setIsPreOrder(product.isPreOrder || false);
    setCurrency(product.currency || 'USD');
    setError(null);
    setSuccess(null);
    setIsDrawerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name || !slug || !price || !category || !brand) {
      setError('Please fill in all required fields.');
      return;
    }

    // Validate specs JSON
    let parsedSpecs = {};
    try {
      parsedSpecs = JSON.parse(specsText || '{}');
    } catch (err) {
      setError('Specifications must be a valid JSON object.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('slug', slug);
      formData.append('price', price);
      if (discountPrice) formData.append('discountPrice', discountPrice);
      formData.append('category', category); // category ID
      formData.append('brand', brand);       // brand ID
      formData.append('countInStock', countInStock);
      formData.append('description', description);
      formData.append('status', status);
      formData.append('isFeatured', isFeatured.toString());
      formData.append('isPreOrder', isPreOrder.toString());
      formData.append('currency', currency);

      // Map comma-separated badges into array
      const badgesArray = badgesText.split(',').map(b => b.trim()).filter(Boolean);
      formData.append('badges', JSON.stringify(badgesArray));
      formData.append('specs', JSON.stringify(parsedSpecs));
      
      // Append files
      if (imageFiles && imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
          formData.append('images', imageFiles[i]);
        }
      }

      let res;
      if (editingProduct) {
        res = await updateProductAction(editingProduct.id, formData);
      } else {
        res = await createProductAction(formData);
      }

      if (res.success) {
        setSuccess(editingProduct ? 'Product updated successfully.' : 'Product created successfully.');
        setIsDrawerOpen(false);
        loadData();
      } else {
        setError(res.error || 'Failed to save product.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    setError(null);
    setSuccess(null);

    const res = await deleteProductAction(id);
    if (res.success) {
      setSuccess('Product deleted successfully.');
      loadData();
    } else {
      setError(res.error || 'Failed to delete product.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} products?`)) return;

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      let deletedCount = 0;
      for (const id of selectedIds) {
        const res = await deleteProductAction(id);
        if (res.success) {
          deletedCount++;
        }
      }
      setSuccess(`Successfully deleted ${deletedCount} products.`);
      setSelectedIds([]);
      loadData();
    });
  };

  const getStockBadge = (count: number) => {
    if (count === 0) return { label: 'Out of Stock', cls: 'bg-red-500/10 text-red-500 border-red-500/20' };
    if (count <= 5) return { label: 'Critical', cls: 'bg-red-500/10 text-red-500 border-red-500/20' };
    if (count <= 15) return { label: 'Low Stock', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    return { label: 'In Stock', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
  };

  return (
    <div className="space-y-6 text-foreground">
      {/* Messages */}
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

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-500" />
            Products
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage storefront catalog, pricing, and quantities.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleOpenCreate}
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm shadow-blue-500/20 font-semibold"
          >
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search products by name, category, or brand..."
          className="pl-10 bg-card/40 border-border placeholder:text-muted-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Bulk Actions Panel */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between gap-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl animate-fade-in">
          <span className="text-xs font-semibold text-red-500">
            {selectedIds.length} catalog items selected
          </span>
          <Button 
            onClick={handleBulkDelete}
            size="sm" 
            className="bg-red-600 hover:bg-red-500 text-white font-bold h-8 text-[11px] px-3.5"
            disabled={isPending}
          >
            Delete Selected
          </Button>
        </div>
      )}

      {/* Table grid */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {loadingProducts ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading product listings...
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-4 w-10">
                    <input 
                      type="checkbox"
                      className="rounded border-border accent-blue-500"
                      checked={selectedIds.length === filteredProducts.length && filteredProducts.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(filteredProducts.map(p => p.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                  </th>
                  <th className="p-4">Product</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Price</th>
                  <th className="p-4">Stock</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((product) => {
                  const stock = getStockBadge(product.countInStock);
                  const price = product.discountPrice ?? product.price;
                  const currency = product.currency === 'LKR' ? 'LKR ' : '$';
                  const isChecked = selectedIds.includes(product.id);

                  return (
                    <tr key={product.id} className={`hover:bg-muted/10 transition-colors group ${isChecked ? 'bg-blue-500/5' : ''}`}>
                      <td className="p-4 w-10">
                        <input 
                          type="checkbox"
                          className="rounded border-border accent-blue-500 cursor-pointer"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(prev => [...prev, product.id]);
                            } else {
                              setSelectedIds(prev => prev.filter(id => id !== product.id));
                            }
                          }}
                        />
                      </td>
                      <td className="p-4 font-bold text-foreground">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted border border-border overflow-hidden shrink-0 relative">
                            { }
                            <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground leading-tight max-w-[200px] truncate">{product.name}</p>
                            <p className="text-muted-foreground font-mono text-[10px] mt-0.5">{product.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground capitalize">{product.category}</td>
                      <td className="p-4">
                        <div>
                          <p className="font-bold text-foreground">{currency}{price.toLocaleString()}</p>
                          {product.discountPrice && (
                            <p className="text-muted-foreground line-through text-[10px]">{currency}{product.price.toLocaleString()}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${stock.cls}`}>
                            {stock.label}
                          </span>
                          <span className="text-muted-foreground">{product.countInStock}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleOpenEdit(product)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all" 
                            title="Edit"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDelete(product.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all" 
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Drawer Overlay Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-card border-l border-border h-full flex flex-col justify-between shadow-2xl animate-slide-in">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {editingProduct ? 'Edit Product Settings' : 'Create New Catalog Item'}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Update database fields for this specific product.
                </p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Product Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Slug / URL path *</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Retail Price ($) *</label>
                  <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Discount Price ($)</label>
                  <Input type="number" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="">Select Category...</option>
                    {allCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Brand *</label>
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    required
                    className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="">Select Brand...</option>
                    {allBrands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Base Currency</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as any)}
                    className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LKR">LKR (Rs.)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Publish Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6 py-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded border-border accent-blue-500"
                  />
                  Featured Product
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPreOrder}
                    onChange={(e) => setIsPreOrder(e.target.checked)}
                    className="rounded border-border accent-blue-500"
                  />
                  Pre-order Item
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Inventory Stock *</label>
                <Input type="number" value={countInStock} onChange={(e) => setCountInStock(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Product Images</label>
                <Input type="file" multiple accept="image/*" onChange={(e) => setImageFiles(e.target.files)} className="bg-background/40 cursor-pointer text-xs" />
                <p className="text-[10px] text-muted-foreground">Uploading new files replaces current images.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Badges / Tags (comma-separated)</label>
                <Input value={badgesText} onChange={(e) => setBadgesText(e.target.value)} placeholder="e.g. new-arrival, best-seller, 10%off" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Technical Specs (JSON format)</label>
                <textarea
                  value={specsText}
                  onChange={(e) => setSpecsText(e.target.value)}
                  rows={4}
                  className="w-full font-mono text-xs p-2.5 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  placeholder='{\n  "Processor": "Intel i7",\n  "RAM": "16GB"\n}'
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Detailed Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full min-h-[80px] p-2.5 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </form>

            {/* Footer buttons */}
            <div className="p-5 border-t border-border flex items-center justify-end gap-2 bg-secondary/20">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsDrawerOpen(false)}
                className="text-muted-foreground border border-border"
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Save Product
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
