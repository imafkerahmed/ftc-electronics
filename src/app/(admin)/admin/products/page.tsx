'use client';

import React, { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { 
  Package, Plus, Search, Filter, ArrowUpDown, Edit, Trash2, Eye, 
  X, CheckCircle, AlertCircle, Save, Loader2, DollarSign, Image as ImageIcon, FileText, Sparkles,
  ChevronUp, ChevronDown
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

interface DescriptionBlock {
  id: string;
  type: 'title' | 'subtitle' | 'paragraph' | 'image' | 'list';
  content: string;
  caption?: string;
}

function parseTextToDescBlocks(text: string): DescriptionBlock[] {
  if (!text) return [{ id: '1', type: 'paragraph', content: '' }];

  const lines = text.split('\n');
  const blocks: DescriptionBlock[] = [];
  let currentPara: string[] = [];

  const flushPara = () => {
    if (currentPara.length > 0) {
      blocks.push({
        id: Math.random().toString(),
        type: 'paragraph',
        content: currentPara.join('\n'),
      });
      currentPara = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const mdImgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    const urlImgMatch = trimmed.match(/^(https?:\/\/.*\.(?:png|jpg|jpeg|webp|gif)(?:\?.*)?)$/i);

    if (mdImgMatch || urlImgMatch) {
      flushPara();
      blocks.push({
        id: Math.random().toString(),
        type: 'image',
        content: mdImgMatch ? mdImgMatch[2] : urlImgMatch![1],
        caption: mdImgMatch ? mdImgMatch[1] : '',
      });
    } else if (trimmed.startsWith('# ')) {
      flushPara();
      blocks.push({
        id: Math.random().toString(),
        type: 'title',
        content: trimmed.replace(/^#\s+/, ''),
      });
    } else if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      flushPara();
      blocks.push({
        id: Math.random().toString(),
        type: 'subtitle',
        content: trimmed.replace(/^#{2,3}\s+/, ''),
      });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushPara();
      blocks.push({
        id: Math.random().toString(),
        type: 'list',
        content: trimmed.replace(/^[-*]\s+/, ''),
      });
    } else if (trimmed === '') {
      flushPara();
    } else {
      currentPara.push(line);
    }
  });

  flushPara();

  return blocks.length > 0 ? blocks : [{ id: '1', type: 'paragraph', content: '' }];
}

function convertDescBlocksToText(blocks: DescriptionBlock[]): string {
  return blocks
    .map((b) => {
      if (!b.content.trim()) return '';
      if (b.type === 'title') return `# ${b.content.trim()}`;
      if (b.type === 'subtitle') return `## ${b.content.trim()}`;
      if (b.type === 'image') return `![${b.caption || 'Product image'}](${b.content.trim()})`;
      if (b.type === 'list') {
        return b.content
          .split('\n')
          .filter(Boolean)
          .map((item) => `- ${item.replace(/^[-*]\s*/, '').trim()}`)
          .join('\n');
      }
      return b.content.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

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
  const [activeTab, setActiveTab] = useState<'general' | 'pricing' | 'media' | 'specs'>('general');
  
  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [price, setPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [category, setCategory] = useState(''); // Stores category ID
  const [brand, setBrand] = useState('');       // Stores brand ID
  const [countInStock, setCountInStock] = useState('10');
  const [description, setDescription] = useState('');
  const [descBlocks, setDescBlocks] = useState<DescriptionBlock[]>([]);
  const [descMode, setDescMode] = useState<'visual' | 'plain'>('visual');
  const [imageFiles, setImageFiles] = useState<FileList | null>(null);
  const [badgesText, setBadgesText] = useState('');
  const [specsText, setSpecsText] = useState('{}');
  const [specsList, setSpecsList] = useState<{ id: string; key: string; value: string }[]>([]);
  const [specsMode, setSpecsMode] = useState<'visual' | 'json'>('visual');
  const [bannerImage, setBannerImage] = useState('');
  const [bannerText, setBannerText] = useState('');
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

  // Lock the admin main scroll container when modal is open
  useEffect(() => {
    const mainEl = document.getElementById('admin-main');
    if (isDrawerOpen) {
      if (mainEl) mainEl.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      if (mainEl) mainEl.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      if (mainEl) mainEl.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

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
    setDescBlocks([
      { id: '1', type: 'title', content: 'Product Overview' },
      { id: '2', type: 'paragraph', content: 'Enter product description here...' },
    ]);
    setDescMode('visual');
    setImageFiles(null);
    setBadgesText('');
    setSpecsText('{}');
    setSpecsList([
      { id: '1', key: 'Processor', value: '' },
      { id: '2', key: 'RAM', value: '' },
      { id: '3', key: 'Storage', value: '' },
    ]);
    setSpecsMode('visual');
    setBannerImage('');
    setBannerText('');
    setStatus('published');
    setIsFeatured(false);
    setIsPreOrder(false);
    setCurrency('USD');
    setError(null);
    setSuccess(null);
    setActiveTab('general');
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
    
    // Parse description into visual blocks
    const parsedBlocks = parseTextToDescBlocks(product.description || '');
    setDescBlocks(parsedBlocks);
    setDescMode('visual');

    setImageFiles(null);
    setBadgesText(product.badges?.join(', ') || '');
    setSpecsText(JSON.stringify(product.specs || {}, null, 2));
    
    const initialSpecs = Object.entries(product.specs || {}).map(([k, v], idx) => ({
      id: String(idx + 1),
      key: k,
      value: String(v)
    }));
    setSpecsList(initialSpecs.length > 0 ? initialSpecs : [{ id: '1', key: '', value: '' }]);
    setSpecsMode('visual');

    setBannerImage(product.bannerImage || '');
    setBannerText(product.bannerText || '');
    setStatus(product.status || 'published');
    setIsFeatured(product.isFeatured || false);
    setIsPreOrder(product.isPreOrder || false);
    setCurrency(product.currency || 'USD');
    setError(null);
    setSuccess(null);
    setActiveTab('general');
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

    // Convert descBlocks to final description text if in visual mode
    const finalDescription = descMode === 'visual' ? convertDescBlocksToText(descBlocks) : description;

    // Process technical specs
    let parsedSpecs: Record<string, string> = {};
    if (specsMode === 'visual') {
      specsList.forEach(item => {
        if (item.key.trim()) {
          parsedSpecs[item.key.trim()] = item.value.trim();
        }
      });
    } else {
      try {
        parsedSpecs = JSON.parse(specsText || '{}');
      } catch (err) {
        setError('Specifications must be a valid JSON object.');
        return;
      }
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('slug', slug);
      formData.append('price', price);
      if (discountPrice) formData.append('discountPrice', discountPrice);
      formData.append('category', category); // category ID
      formData.append('brand', brand);       // brand ID
      formData.append('countInStock', countInStock || '0');
      formData.append('description', finalDescription);
      formData.append('status', status);
      formData.append('isFeatured', isFeatured.toString());
      formData.append('isPreOrder', isPreOrder.toString());
      formData.append('currency', currency);

      // Map comma-separated badges into array
      const badgesArray = badgesText.split(',').map(b => b.trim()).filter(Boolean);
      formData.append('badges', JSON.stringify(badgesArray));
      formData.append('specs', JSON.stringify(parsedSpecs));
      if (bannerImage) {
        if (bannerImage.startsWith('data:')) {
          const arr = bannerImage.split(',');
          const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
          const bstr = atob(arr[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const bannerFile = new File([u8arr], `banner_${Date.now()}.${mime.split('/')[1] || 'png'}`, { type: mime });
          formData.append('bannerImage', bannerFile);
        } else {
          formData.append('bannerImage', bannerImage);
        }
      }
      if (bannerText) formData.append('bannerText', bannerText);
      
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

      {/* Centered Modal Dialog */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-4 sm:p-6 flex items-center justify-center animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsDrawerOpen(false);
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            className="w-full max-w-2xl bg-card border border-border rounded-2xl flex flex-col shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200"
            onWheel={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between shrink-0 bg-secondary/10">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {editingProduct ? 'Edit Product Settings' : 'Create New Catalog Item'}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Update database fields for this specific product.
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center border-b border-border bg-muted/20 px-4 gap-1 shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'general'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-card/60'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Package className="h-3.5 w-3.5" />
                General Info
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pricing')}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'pricing'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-card/60'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Pricing
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('media')}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'media'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-card/60'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Media & Images
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('specs')}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'specs'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-card/60'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Specs & Description
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col">
              {/* Scrollable Form Body */}
              <div className="max-h-[calc(85vh-180px)] min-h-[300px] overflow-y-auto overscroll-contain p-6 space-y-4">
                
                {/* TAB 1: GENERAL INFO */}
                {activeTab === 'general' && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Product Name *</label>
                        {name && !slug && (
                          <button
                            type="button"
                            onClick={() => setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''))}
                            className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3" /> Auto-generate Slug
                          </button>
                        )}
                      </div>
                      <Input 
                        value={name} 
                        onChange={(e) => {
                          setName(e.target.value);
                          if (!editingProduct) {
                            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
                          }
                        }} 
                        placeholder="e.g. ApexBook Pro 16" 
                        required 
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Slug / URL path *</label>
                      <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. apexbook-pro-16" required />
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

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Badges / Tags (comma-separated)</label>
                      <Input value={badgesText} onChange={(e) => setBadgesText(e.target.value)} placeholder="e.g. new-arrival, best-seller, 10%off" />
                    </div>

                    <div className="p-3 bg-muted/40 rounded-xl border border-border/60 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-xs font-semibold text-foreground block">Publish Status</label>
                        <p className="text-[10px] text-muted-foreground">Visible on storefront catalog</p>
                      </div>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="h-9 px-3 rounded-lg border border-input bg-background text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-6 pt-1">
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
                  </div>
                )}

                {/* TAB 2: PRICING & INVENTORY */}
                {activeTab === 'pricing' && (
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Retail Price ($) *</label>
                        <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" required />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Discount Price ($)</label>
                        <Input type="number" step="0.01" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)} placeholder="Leave blank if none" />
                      </div>
                    </div>

                    <div className="space-y-1.5 max-w-xs">
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

                    {/* Live Price Summary Badge */}
                    {price && (
                      <div className="p-4 rounded-xl border border-border bg-card/60 space-y-2">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pricing Summary</span>
                        <div className="flex items-baseline gap-3">
                          <span className="text-xl font-bold text-foreground">
                            {currency === 'USD' ? '$' : 'Rs. '}{discountPrice ? Number(discountPrice).toLocaleString() : Number(price).toLocaleString()}
                          </span>
                          {discountPrice && Number(price) > Number(discountPrice) && (
                            <>
                              <span className="text-xs text-muted-foreground line-through">
                                {currency === 'USD' ? '$' : 'Rs. '}{Number(price).toLocaleString()}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                SAVE {Math.round(((Number(price) - Number(discountPrice)) / Number(price)) * 100)}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: MEDIA & IMAGES */}
                {activeTab === 'media' && (
                  <div className="space-y-5 animate-in fade-in duration-150">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Product Photos & Gallery</label>
                      
                      {/* Styled Dropzone / Multiple File Picker */}
                      <div className="relative border-2 border-dashed border-border hover:border-blue-500/60 transition-colors rounded-2xl p-6 bg-card/40 flex flex-col items-center justify-center text-center group cursor-pointer">
                        <input 
                          type="file" 
                          multiple 
                          accept="image/*" 
                          onChange={(e) => setImageFiles(e.target.files)} 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          Click to browse or drag & drop multiple images
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Hold <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Ctrl</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">Cmd</kbd> to select multiple photos at once. Supports PNG, JPG, WEBP.
                        </p>
                      </div>
                    </div>

                    {/* Live Preview of Newly Selected Local Files */}
                    {imageFiles && imageFiles.length > 0 && (
                      <div className="space-y-2 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" />
                            {imageFiles.length} New {imageFiles.length === 1 ? 'Photo' : 'Photos'} Selected for Upload
                          </span>
                          <button
                            type="button"
                            onClick={() => setImageFiles(null)}
                            className="text-[10px] text-muted-foreground hover:text-red-500 underline cursor-pointer"
                          >
                            Clear Selection
                          </button>
                        </div>

                        <div className="grid grid-cols-4 gap-3 pt-1">
                          {Array.from(imageFiles).map((file, idx) => (
                            <div key={idx} className="relative aspect-square rounded-xl border border-blue-500/30 bg-background overflow-hidden group">
                              <img 
                                src={URL.createObjectURL(file)} 
                                alt={`Selected Preview ${idx + 1}`} 
                                className="w-full h-full object-contain p-1.5"
                              />
                              <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                                {idx === 0 ? 'Main Cover' : `#${idx + 1}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Saved Product Images (for existing products) */}
                    {editingProduct && editingProduct.images && editingProduct.images.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground/80 tracking-wide block">Currently Saved Images ({editingProduct.images.length})</label>
                          <span className="text-[10px] text-muted-foreground">Uploading new files above will replace these</span>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {editingProduct.images.map((img, idx) => (
                            <div key={idx} className="relative aspect-square rounded-xl border border-neutral-200/90 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 overflow-hidden group">
                              <Image 
                                src={img.startsWith('http') ? img : `https://ftc-db.codix.site/api/files/pbc_4092854851/${editingProduct.id}/${img}`}
                                alt={`Saved Image ${idx + 1}`}
                                fill
                                className="object-contain p-1.5"
                              />
                              <span className="absolute bottom-1 left-1 bg-neutral-900/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                                {idx === 0 ? 'Main Cover' : `#${idx + 1}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Promotional Feature Banner Section */}
                    <div className="pt-3 border-t border-border/80 space-y-3">
                      <div className="space-y-0.5">
                        <label className="text-xs font-semibold text-foreground tracking-wide block flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                          Product Feature Banner (Optional)
                        </label>
                        <p className="text-[11px] text-muted-foreground">Display a custom hero promotional banner on the Product Detail Page</p>
                      </div>

                      <div className="space-y-3 p-4 rounded-xl border border-border bg-card/40">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-foreground/80 block">Banner Image</label>
                          {bannerImage ? (
                            <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-background">
                              <div className="relative h-16 w-28 rounded-md bg-neutral-950 overflow-hidden shrink-0 border border-border">
                                <img src={bannerImage} alt="Banner Preview" className="w-full h-full object-cover" />
                              </div>
                              <div className="flex-1 space-y-1">
                                <Input 
                                  value={bannerImage} 
                                  onChange={(e) => setBannerImage(e.target.value)} 
                                  placeholder="Image URL or Data URI" 
                                  className="bg-background text-xs h-7"
                                />
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] text-blue-600 hover:underline cursor-pointer font-semibold flex items-center gap-1">
                                    <ImageIcon className="h-3 w-3" /> Change Image
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onload = (ev) => {
                                            setBannerImage(ev.target?.result as string);
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                  </label>
                                  <span className="text-muted-foreground/40">•</span>
                                  <button
                                    type="button"
                                    onClick={() => setBannerImage('')}
                                    className="text-[10px] text-red-500 hover:underline cursor-pointer font-semibold"
                                  >
                                    Remove Banner Image
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="relative border-2 border-dashed border-border hover:border-blue-500/60 transition-colors rounded-xl p-4 bg-background/50 flex flex-col items-center justify-center text-center cursor-pointer group">
                              <input
                                type="file"
                                accept="image/*"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      setBannerImage(ev.target?.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <div className="h-8 w-8 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                              <p className="text-xs font-semibold text-foreground">Click to browse or drop banner image</p>
                              <p className="text-[10px] text-muted-foreground">High resolution landscape photo recommended</p>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-foreground/80 block">Banner Headline / Tagline</label>
                          <Input 
                            value={bannerText} 
                            onChange={(e) => setBannerText(e.target.value)} 
                            placeholder="e.g. Next-Gen M3 Processing Power & Liquid Retina XDR" 
                            className="bg-background text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: SPECS & DESCRIPTION */}
                {activeTab === 'specs' && (
                  <div className="space-y-6 animate-in fade-in duration-150">
                    {/* Visual Description Block Builder */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-semibold text-foreground tracking-wide block">Detailed Product Description</label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Build formatted content blocks (Titles, Paragraphs, Images & Lists)</p>
                        </div>

                        {/* Mode Switcher */}
                        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => {
                              if (descMode === 'plain') {
                                setDescBlocks(parseTextToDescBlocks(description));
                              }
                              setDescMode('visual');
                            }}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                              descMode === 'visual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Block Builder
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDescription(convertDescBlocksToText(descBlocks));
                              setDescMode('plain');
                            }}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                              descMode === 'plain' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Plain Text
                          </button>
                        </div>
                      </div>

                      {descMode === 'visual' ? (
                        <div className="space-y-3 p-4 rounded-2xl border border-border bg-card/40">
                          {/* Quick Block Adders Bar */}
                          <div className="flex items-center gap-1.5 flex-wrap pb-3 border-b border-border/60">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">+ Add Block:</span>
                            <button
                              type="button"
                              onClick={() => setDescBlocks([...descBlocks, { id: Date.now().toString(), type: 'title', content: '' }])}
                              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[10px] font-semibold text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3 w-3 text-blue-500" /> Title
                            </button>
                            <button
                              type="button"
                              onClick={() => setDescBlocks([...descBlocks, { id: Date.now().toString(), type: 'subtitle', content: '' }])}
                              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[10px] font-semibold text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3 w-3 text-blue-500" /> Subtitle
                            </button>
                            <button
                              type="button"
                              onClick={() => setDescBlocks([...descBlocks, { id: Date.now().toString(), type: 'paragraph', content: '' }])}
                              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[10px] font-semibold text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3 w-3 text-emerald-500" /> Paragraph Text
                            </button>
                            <button
                              type="button"
                              onClick={() => setDescBlocks([...descBlocks, { id: Date.now().toString(), type: 'image', content: '', caption: '' }])}
                              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[10px] font-semibold text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <ImageIcon className="h-3 w-3 text-purple-500" /> Inline Image
                            </button>
                            <button
                              type="button"
                              onClick={() => setDescBlocks([...descBlocks, { id: Date.now().toString(), type: 'list', content: '' }])}
                              className="px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted text-[10px] font-semibold text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3 w-3 text-amber-500" /> Bullet List
                            </button>
                          </div>

                          {/* Block Items List */}
                          <div className="space-y-3">
                            {descBlocks.map((block, idx) => (
                              <div key={block.id || idx} className="p-3 rounded-xl border border-border/80 bg-background/60 space-y-2 relative group">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                                    {block.type === 'title' && 'Main Title'}
                                    {block.type === 'subtitle' && 'Subtitle'}
                                    {block.type === 'paragraph' && 'Paragraph Text'}
                                    {block.type === 'image' && 'Inline Feature Image'}
                                    {block.type === 'list' && 'Bullet Points'}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => {
                                        if (idx <= 0) return;
                                        const updated = [...descBlocks];
                                        const temp = updated[idx];
                                        updated[idx] = updated[idx - 1];
                                        updated[idx - 1] = temp;
                                        setDescBlocks(updated);
                                      }}
                                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-1 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                                      title="Move Up"
                                    >
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === descBlocks.length - 1}
                                      onClick={() => {
                                        if (idx >= descBlocks.length - 1) return;
                                        const updated = [...descBlocks];
                                        const temp = updated[idx];
                                        updated[idx] = updated[idx + 1];
                                        updated[idx + 1] = temp;
                                        setDescBlocks(updated);
                                      }}
                                      className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-1 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
                                      title="Move Down"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
                                    <div className="h-3 w-[1px] bg-border mx-0.5" />
                                    <button
                                      type="button"
                                      onClick={() => setDescBlocks(descBlocks.filter((_, i) => i !== idx))}
                                      className="text-muted-foreground hover:text-red-500 p-1 rounded transition-colors cursor-pointer"
                                      title="Delete Block"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {block.type === 'title' && (
                                  <Input
                                    value={block.content}
                                    onChange={(e) => {
                                      const updated = [...descBlocks];
                                      updated[idx].content = e.target.value;
                                      setDescBlocks(updated);
                                    }}
                                    placeholder="Enter Main Title (e.g. Revolutionary Performance)"
                                    className="font-bold text-sm bg-background"
                                  />
                                )}

                                {block.type === 'subtitle' && (
                                  <Input
                                    value={block.content}
                                    onChange={(e) => {
                                      const updated = [...descBlocks];
                                      updated[idx].content = e.target.value;
                                      setDescBlocks(updated);
                                    }}
                                    placeholder="Enter Subtitle (e.g. Built for Professionals)"
                                    className="font-semibold text-xs bg-background"
                                  />
                                )}

                                {block.type === 'paragraph' && (
                                  <textarea
                                    value={block.content}
                                    onChange={(e) => {
                                      const updated = [...descBlocks];
                                      updated[idx].content = e.target.value;
                                      setDescBlocks(updated);
                                    }}
                                    rows={3}
                                    placeholder="Write detailed paragraph text..."
                                    className="w-full p-2.5 rounded-lg border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                  />
                                )}

                                {block.type === 'image' && (
                                  <div className="space-y-3">
                                    {block.content ? (
                                      /* Preview of Selected/Uploaded Image */
                                      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 rounded-xl border border-border bg-card/60">
                                        <div className="relative h-28 w-28 sm:h-24 sm:w-24 rounded-lg border border-border bg-neutral-950 overflow-hidden shrink-0">
                                          <img src={block.content} alt="Block Preview" className="w-full h-full object-contain p-1" />
                                        </div>
                                        <div className="flex-1 space-y-2 w-full">
                                          <Input
                                            value={block.caption || ''}
                                            onChange={(e) => {
                                              const updated = [...descBlocks];
                                              updated[idx].caption = e.target.value;
                                              setDescBlocks(updated);
                                            }}
                                            placeholder="Photo caption / label (optional)"
                                            className="text-xs bg-background"
                                          />
                                          <div className="flex items-center gap-2">
                                            <label className="text-[11px] text-blue-600 hover:underline cursor-pointer font-semibold flex items-center gap-1">
                                              <ImageIcon className="h-3 w-3" /> Change Photo
                                              <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (ev) => {
                                                      const updated = [...descBlocks];
                                                      updated[idx].content = ev.target?.result as string;
                                                      setDescBlocks(updated);
                                                    };
                                                    reader.readAsDataURL(file);
                                                  }
                                                }}
                                              />
                                            </label>
                                            <span className="text-muted-foreground/40">•</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const updated = [...descBlocks];
                                                updated[idx].content = '';
                                                setDescBlocks(updated);
                                              }}
                                              className="text-[11px] text-red-500 hover:underline cursor-pointer font-semibold"
                                            >
                                              Remove Photo
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      /* Styled File Dropzone / Picker */
                                      <div className="relative border-2 border-dashed border-border hover:border-purple-500/60 transition-colors rounded-xl p-5 bg-card/30 flex flex-col items-center justify-center text-center group cursor-pointer">
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              const reader = new FileReader();
                                              reader.onload = (ev) => {
                                                const updated = [...descBlocks];
                                                updated[idx].content = ev.target?.result as string;
                                                setDescBlocks(updated);
                                              };
                                              reader.readAsDataURL(file);
                                            }
                                          }}
                                        />
                                        <div className="h-9 w-9 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                                          <ImageIcon className="h-4 w-4" />
                                        </div>
                                        <p className="text-xs font-semibold text-foreground">
                                          Click to browse or drop an image file
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                          PNG, JPG, WEBP or GIF format
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {block.type === 'list' && (
                                  <textarea
                                    value={block.content}
                                    onChange={(e) => {
                                      const updated = [...descBlocks];
                                      updated[idx].content = e.target.value;
                                      setDescBlocks(updated);
                                    }}
                                    rows={3}
                                    placeholder="Enter bullet items (one per line)..."
                                    className="w-full p-2.5 rounded-lg border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={6}
                          placeholder="Enter plain text description..."
                          className="w-full min-h-[110px] p-3 rounded-xl border border-input bg-background text-xs font-mono leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        />
                      )}
                    </div>

                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-semibold text-foreground tracking-wide block">Technical Specifications</label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Add spec fields (e.g. Processor, RAM, Battery) for the PDP table</p>
                        </div>

                        {/* Mode Switcher */}
                        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => setSpecsMode('visual')}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                              specsMode === 'visual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Form Builder
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Sync visual list to json text when switching
                              const obj: Record<string, string> = {};
                              specsList.forEach(s => { if (s.key) obj[s.key] = s.value; });
                              setSpecsText(JSON.stringify(obj, null, 2));
                              setSpecsMode('json');
                            }}
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                              specsMode === 'json' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Raw JSON
                          </button>
                        </div>
                      </div>

                      {/* Mode A: Visual Form Builder (User-Friendly) */}
                      {specsMode === 'visual' ? (
                        <div className="space-y-3 p-4 rounded-2xl border border-border bg-card/40">
                          {/* Quick Spec Presets */}
                          <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b border-border/60">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">Quick Presets:</span>
                            <button
                              type="button"
                              onClick={() => setSpecsList([
                                { id: Date.now() + '1', key: 'Processor', value: 'Apple M3 Pro' },
                                { id: Date.now() + '2', key: 'Memory (RAM)', value: '18GB Unified Memory' },
                                { id: Date.now() + '3', key: 'Storage', value: '512GB NVMe SSD' },
                                { id: Date.now() + '4', key: 'Display', value: '16.2-inch Liquid Retina XDR' },
                                { id: Date.now() + '5', key: 'Battery Life', value: 'Up to 22 Hours' }
                              ])}
                              className="px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted text-[10px] font-medium text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="h-2.5 w-2.5 text-blue-500" /> + Laptop Presets
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpecsList([
                                { id: Date.now() + '1', key: 'Screen Size', value: '6.7-inch OLED' },
                                { id: Date.now() + '2', key: 'Camera', value: '48MP Triple Lens' },
                                { id: Date.now() + '3', key: 'Battery', value: '4,500 mAh' },
                                { id: Date.now() + '4', key: 'Connectivity', value: '5G / Wi-Fi 6E' }
                              ])}
                              className="px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted text-[10px] font-medium text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="h-2.5 w-2.5 text-blue-500" /> + Phone Presets
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpecsList([
                                { id: Date.now() + '1', key: 'Battery Life', value: '30 Hours (ANC On)' },
                                { id: Date.now() + '2', key: 'Noise Cancellation', value: 'Active Noise Cancelling (ANC)' },
                                { id: Date.now() + '3', key: 'Bluetooth Version', value: 'Bluetooth 5.3' },
                                { id: Date.now() + '4', key: 'Weight', value: '250g' }
                              ])}
                              className="px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted text-[10px] font-medium text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Sparkles className="h-2.5 w-2.5 text-blue-500" /> + Audio Presets
                            </button>
                          </div>

                          {/* Dynamic Key-Value Rows */}
                          <div className="space-y-2">
                            {specsList.map((row, idx) => (
                              <div key={row.id || idx} className="flex items-center gap-2">
                                <Input 
                                  value={row.key} 
                                  onChange={(e) => {
                                    const updated = [...specsList];
                                    updated[idx].key = e.target.value;
                                    setSpecsList(updated);
                                  }}
                                  placeholder="Spec Name (e.g. RAM)"
                                  className="w-1/3 text-xs bg-background"
                                />
                                <Input 
                                  value={row.value} 
                                  onChange={(e) => {
                                    const updated = [...specsList];
                                    updated[idx].value = e.target.value;
                                    setSpecsList(updated);
                                  }}
                                  placeholder="Value (e.g. 16GB Unified)"
                                  className="flex-1 text-xs bg-background"
                                />
                                <button
                                  type="button"
                                  onClick={() => setSpecsList(specsList.filter((_, i) => i !== idx))}
                                  className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer shrink-0"
                                  title="Remove spec"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSpecsList([...specsList, { id: Date.now().toString(), key: '', value: '' }])}
                            className="w-full text-xs border-dashed border-border hover:border-blue-500/60 flex items-center justify-center gap-1.5 mt-2"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add New Specification Line
                          </Button>
                        </div>
                      ) : (
                        /* Mode B: Raw JSON Code Editor */
                        <div className="space-y-1.5">
                          <textarea
                            value={specsText}
                            onChange={(e) => setSpecsText(e.target.value)}
                            rows={6}
                            className="w-full font-mono text-xs p-3 rounded-xl border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            placeholder='{\n  "Processor": "Intel i7",\n  "RAM": "16GB"\n}'
                          />
                          <p className="text-[10px] text-muted-foreground">Ensure valid JSON format with key-value pairs.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div className="p-4 border-t border-border flex items-center justify-between bg-secondary/10 shrink-0">
                <div className="flex items-center gap-2">
                  {activeTab !== 'general' && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const tabs: ('general' | 'pricing' | 'media' | 'specs')[] = ['general', 'pricing', 'media', 'specs'];
                        const idx = tabs.indexOf(activeTab);
                        if (idx > 0) setActiveTab(tabs[idx - 1]);
                      }}
                      className="text-xs"
                    >
                      Back
                    </Button>
                  )}
                  {activeTab !== 'specs' && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const tabs: ('general' | 'pricing' | 'media' | 'specs')[] = ['general', 'pricing', 'media', 'specs'];
                        const idx = tabs.indexOf(activeTab);
                        if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
                      }}
                      className="text-xs"
                    >
                      Next Tab
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
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
                    type="submit"
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
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
