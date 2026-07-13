'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Boxes, Plus, Edit, Trash2, GripVertical, X, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pbBrands } from '@/lib/pb-collections';
import { 
  createBrandAction, 
  updateBrandAction, 
  deleteBrandAction 
} from '@/app/actions/admin';

interface Brand {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
  logoUrl?: string | null;
  show_in_strip?: boolean;
}

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer/Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState('1');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [showInStrip, setShowInStrip] = useState(false);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await pbBrands.getAll();
      const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
      setBrands((data || []).map((b: any) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        productCount: b.productCount || 0,
        logoUrl: b.logo ? `${pbUrl}/api/files/${b.collectionId}/${b.id}/${b.logo}` : null,
        show_in_strip: b.show_in_strip || false,
      })));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingBrand(null);
    setName('');
    setSlug('');
    setLogoFile(null);
    setShowInStrip(false);
    setSortOrder((brands.length + 1).toString());
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setName(brand.name);
    setSlug(brand.slug);
    setLogoFile(null);
    setShowInStrip(brand.show_in_strip || false);
    setSortOrder('1');
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name || !slug) {
      setError('Name and slug are required fields.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('slug', slug);
      formData.append('sortOrder', (parseInt(sortOrder) || 1).toString());
      formData.append('show_in_strip', showInStrip.toString());
      if (logoFile) {
        formData.append('logo', logoFile);
      }

      let res;
      if (editingBrand) {
        res = await updateBrandAction(editingBrand.id, formData);
      } else {
        res = await createBrandAction(formData);
      }

      if (res.success) {
        setSuccess(editingBrand ? 'Brand updated successfully.' : 'Brand created successfully.');
        setIsModalOpen(false);
        loadData();
      } else {
        setError(res.error || 'Failed to save brand.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;

    setError(null);
    setSuccess(null);

    const res = await deleteBrandAction(id);
    if (res.success) {
      setSuccess('Brand deleted successfully.');
      loadData();
    } else {
      setError(res.error || 'Failed to delete brand.');
    }
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

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="h-6 w-6 text-purple-500" />
            Brands
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage storefront brand logo attributes and visibility.</p>
        </div>
        <Button 
          onClick={handleOpenCreate}
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 h-9"
        >
          <Plus className="h-3.5 w-3.5" /> Add Brand
        </Button>
      </div>

      {/* Brand Grid Cards */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading brand lists...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {brands.map((brand) => (
            <div key={brand.id} className="bg-card border border-border rounded-xl p-4 hover:border-blue-500/30 transition-colors group relative">
              <div className="h-14 w-full rounded-lg bg-slate-800 flex items-center justify-center mb-3 border border-border overflow-hidden">
                {brand.logoUrl ? (
                   
                  <img src={brand.logoUrl} alt={brand.name} className="h-full object-contain p-2" />
                ) : (
                  <span className="text-white font-black text-lg tracking-wider">{brand.name}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <p className="font-bold text-foreground text-sm">{brand.name}</p>
                {brand.show_in_strip && (
                  <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">Strip</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{brand.slug}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted-foreground">{brand.productCount} products</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleOpenEdit(brand)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground" 
                    title="Edit"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={() => handleDelete(brand.id)}
                    className="p-1 rounded text-muted-foreground hover:text-red-500" 
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Add Brand Trigger Card */}
          <button 
            onClick={handleOpenCreate}
            className="bg-card/40 border border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors group min-h-[140px]"
          >
            <Plus className="h-6 w-6 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-blue-500 transition-colors">Add Brand</span>
          </button>
        </div>
      )}

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                {editingBrand ? 'Edit Brand' : 'Create Brand'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Brand Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Slug *</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Sort Position</label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Brand Logo Image</label>
                <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="bg-background/40 cursor-pointer text-xs" />
              </div>

              <div className="flex items-center gap-2 py-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInStrip}
                    onChange={(e) => setShowInStrip(e.target.checked)}
                    className="rounded border-border accent-blue-500"
                  />
                  Show in Brand Strip Marquee
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-6">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsModalOpen(false)}
                  className="text-muted-foreground border border-border"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmit}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Brand
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
