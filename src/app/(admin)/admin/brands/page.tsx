'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { Boxes, Plus, Edit, Trash2, X, Save, Loader2, CheckCircle, AlertCircle, Upload, Image as ImageIcon, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getAdminBrandsAction,
  uploadBrandLogoAction,
  createBrandAction,
  updateBrandAction,
  deleteBrandAction,
} from '@/app/actions/admin';

interface Brand {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
  logoUrl?: string | null;
  logo?: string | null;
  show_in_strip?: boolean;
  sort_order?: number;
}

export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState('1');
  const [showInStrip, setShowInStrip] = useState(false);

  // Logo state
  const [logoMode, setLogoMode] = useState<'file' | 'url'>('file');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* ─── Data ────────────────────────────────────────────────────── */
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAdminBrandsAction();
      if (!res.success) {
        setError(res.error || 'Failed to load brands.');
        setBrands([]);
        return;
      }
      setBrands(
        (res.data || []).map((b: any) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          productCount: 0,
          logoUrl: b.logo || null,
          logo: b.logo || null,
          show_in_strip: b.show_in_strip || false,
          sort_order: b.sort_order || 0,
        }))
      );
    } catch (err: any) {
      console.error('[AdminBrandsPage] Failed to load brands:', err);
      setError(err?.message || 'Failed to load brands.');
      setBrands([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  /* ─── Logo helpers ────────────────────────────────────────────── */
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setLogoRemoved(false);
    setError(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview('');
    setLogoUrl('');
    setLogoRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ─── Modal open/close ────────────────────────────────────────── */
  const handleOpenCreate = () => {
    setEditingBrand(null);
    setName(''); setSlug(''); setSortOrder((brands.length + 1).toString());
    setShowInStrip(false); clearLogo(); setLogoMode('file');
    setLogoRemoved(false);
    setError(null); setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setName(brand.name);
    setSlug(brand.slug);
    setSortOrder(String(brand.sort_order || 1));
    setShowInStrip(brand.show_in_strip || false);
    setLogoMode('file');
    setLogoFile(null);
    setLogoUrl('');
    setLogoRemoved(false);
    setLogoPreview(brand.logo || brand.logoUrl || '');
    setError(null); setSuccess(null);
    setIsModalOpen(true);
  };

  /* ─── Submit ──────────────────────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!name || !slug) { setError('Name and slug are required.'); return; }

    startTransition(async () => {
      let finalLogoUrl = logoRemoved
        ? ''
        : (editingBrand?.logo || editingBrand?.logoUrl || '');

      // Upload file if one was selected
      if (logoFile) {
        setIsUploading(true);
        const fd = new FormData();
        fd.append('file', logoFile);
        const uploadRes = await uploadBrandLogoAction(fd);
        setIsUploading(false);
        if (!uploadRes.success) { setError(uploadRes.error || 'Logo upload failed.'); return; }
        finalLogoUrl = uploadRes.url!;
      } else if (logoMode === 'url' && logoUrl.trim()) {
        finalLogoUrl = logoUrl.trim();
      }

      const formData = new FormData();
      formData.append('name', name);
      formData.append('slug', slug);
      formData.append('sortOrder', (parseInt(sortOrder) || 1).toString());
      formData.append('show_in_strip', showInStrip.toString());
      formData.append('logoUrl', finalLogoUrl);

      const res = editingBrand
        ? await updateBrandAction(editingBrand.id, formData)
        : await createBrandAction(formData);

      if (res.success) {
        setSuccess(editingBrand ? 'Brand updated.' : 'Brand created.');
        setIsModalOpen(false);
        loadData();
      } else {
        setError(res.error || 'Failed to save brand.');
      }
    });
  };

  /* ─── Delete ──────────────────────────────────────────────────── */
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this brand?')) return;
    setError(null); setSuccess(null);
    const res = await deleteBrandAction(id);
    if (res.success) { setSuccess('Brand deleted.'); loadData(); }
    else setError(res.error || 'Failed to delete brand.');
  };

  /* ─── Toggle strip ────────────────────────────────────────────── */
  const handleToggleStrip = async (brand: Brand, checked: boolean) => {
    setError(null); setSuccess(null);
    setBrands(prev => prev.map(b => b.id === brand.id ? { ...b, show_in_strip: checked } : b));
    const fd = new FormData();
    fd.append('name', brand.name);
    fd.append('slug', brand.slug);
    fd.append('show_in_strip', checked.toString());
    fd.append('logoUrl', brand.logo || brand.logoUrl || '');
    const res = await updateBrandAction(brand.id, fd);
    if (!res.success) {
      setBrands(prev => prev.map(b => b.id === brand.id ? { ...b, show_in_strip: !checked } : b));
      setError(res.error || 'Failed to update.');
    } else setSuccess(`Updated visibility for "${brand.name}".`);
  };

  /* ─── Auto-generate slug ──────────────────────────────────────── */
  const handleNameChange = (v: string) => {
    setName(v);
    if (!editingBrand) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  };

  /* ─── Render ──────────────────────────────────────────────────── */
  const currentLogo = logoPreview || '';

  return (
    <div className="space-y-6 text-foreground">
      {/* Alerts */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-500 text-xs">
          <CheckCircle className="h-4 w-4 shrink-0" /><span>{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-500 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="h-6 w-6 text-purple-500" />Brands
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Manage storefront brand logos and visibility.</p>
        </div>
        <Button onClick={handleOpenCreate} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 h-9">
          <Plus className="h-3.5 w-3.5" /> Add Brand
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />Loading brands...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {brands.map((brand) => (
            <div key={brand.id} className="bg-card border border-border rounded-xl p-4 hover:border-blue-500/30 transition-all group relative">
              <div className="h-14 w-full rounded-lg bg-slate-800 flex items-center justify-center mb-3 border border-border overflow-hidden">
                {brand.logoUrl ? (
                  <img src={brand.logoUrl} alt={brand.name} className="h-full object-contain p-2" />
                ) : (
                  <span className="text-white font-black text-lg tracking-wider">{brand.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <p className="font-bold text-foreground text-sm">{brand.name}</p>
                <button
                  type="button"
                  onClick={() => handleToggleStrip(brand, !brand.show_in_strip)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition-all text-[9px] font-extrabold uppercase tracking-wider cursor-pointer ${
                    brand.show_in_strip
                      ? 'bg-blue-500/10 text-blue-500 border-blue-500/35 hover:bg-blue-500/15'
                      : 'bg-muted text-muted-foreground border-border hover:bg-muted/75'
                  }`}
                >
                  <div className={`w-5.5 h-3 rounded-full relative transition-colors shrink-0 ${brand.show_in_strip ? 'bg-blue-600' : 'bg-neutral-600'}`}>
                    <div className={`w-2 h-2 bg-white rounded-full absolute top-0.5 transition-all duration-200 ${brand.show_in_strip ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                  <span>{brand.show_in_strip ? 'Loop: On' : 'Loop: Off'}</span>
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{brand.slug}</p>
              <div className="flex items-center justify-end mt-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleOpenEdit(brand)} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Edit">
                  <Edit className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(brand.id)} className="p-1 rounded text-muted-foreground hover:text-red-500" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={handleOpenCreate}
            className="bg-card/40 border border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors group min-h-[140px]"
          >
            <Plus className="h-6 w-6 text-muted-foreground group-hover:text-blue-500 transition-colors" />
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-blue-500 transition-colors">Add Brand</span>
          </button>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Modal header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                {editingBrand ? 'Edit Brand' : 'Create Brand'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

              {/* Logo upload section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground/80">Brand Logo</label>
                  <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                    <button
                      type="button"
                      onClick={() => setLogoMode('file')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${logoMode === 'file' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => setLogoMode('url')}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-all ${logoMode === 'url' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Link className="h-3 w-3" /> URL
                    </button>
                  </div>
                </div>

                {logoMode === 'file' ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative w-full h-36 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
                      dragOver
                        ? 'border-blue-500 bg-blue-500/10'
                        : currentLogo
                        ? 'border-border hover:border-blue-400/50'
                        : 'border-border hover:border-blue-400/50 hover:bg-muted/30'
                    }`}
                  >
                    {currentLogo ? (
                      <>
                        <img src={currentLogo} alt="Logo preview" className="h-full w-full object-contain p-3 bg-slate-800 rounded-xl" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); clearLogo(); }}
                          className="absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white hover:bg-red-500/80 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap">
                          Click to replace
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-muted-foreground pointer-events-none">
                        <div className="p-3 rounded-xl bg-muted">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-semibold text-foreground">Drop image or click to browse</p>
                          <p className="text-[10px] mt-0.5">PNG, JPG, WebP, SVG · max 10 MB</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      type="url"
                      placeholder="https://example.com/brand-logo.png"
                      value={logoUrl}
                      onChange={(e) => { setLogoUrl(e.target.value); setLogoPreview(e.target.value); }}
                      className="text-xs"
                    />
                    {logoUrl && (
                      <div className="h-24 rounded-lg border border-border bg-slate-800 flex items-center justify-center overflow-hidden">
                        <img src={logoUrl} alt="Preview" className="h-full object-contain p-2" onError={() => setLogoPreview('')} />
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Brand Name *</label>
                <Input value={name} onChange={(e) => handleNameChange(e.target.value)} required placeholder="e.g. Anker" />
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Slug *</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="e.g. anker" className="font-mono text-xs" />
              </div>

              {/* Sort */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Sort Position</label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} min="1" />
              </div>

              {/* Strip toggle */}
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

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-2">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="text-muted-foreground border border-border" disabled={isPending || isUploading}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
                  disabled={isPending || isUploading}
                >
                  {isUploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                  ) : isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="h-4 w-4" /> Save Brand</>
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
