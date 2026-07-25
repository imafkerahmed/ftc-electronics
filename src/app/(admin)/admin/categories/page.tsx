'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Layers, Plus, Edit, Trash2, GripVertical, X, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCategories } from '@/lib/db';
import { 
  createCategoryAction, 
  updateCategoryAction, 
  deleteCategoryAction,
  reorderCategoriesAction
} from '@/app/actions/admin';
import { Category } from '@/types/product';

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer/Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sortOrder, setSortOrder] = useState('1');
  const [isActive, setIsActive] = useState(true);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Drag and Drop State
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const reordered = [...categories];
    const [movedItem] = reordered.splice(draggedIdx, 1);
    reordered.splice(index, 0, movedItem);

    setCategories(reordered);
    setDraggedIdx(null);

    startTransition(async () => {
      const payload = reordered.map((item, idx) => ({
        id: item.id,
        sortOrder: idx + 1,
      }));
      const res = await reorderCategoriesAction(payload);
      if (res.success) {
        setSuccess('Category order updated successfully.');
      } else {
        setError(res.error || 'Failed to update category order.');
        loadData();
      }
    });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getCategories();
      // Ensure the categories are sorted by sortOrder locally if they come unsorted
      setCategories(data);
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
    setEditingCategory(null);
    setName('');
    setSlug('');
    setSortOrder((categories.length + 1).toString());
    setIsActive(true);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setSortOrder('1'); // fallback default
    setIsActive(cat.isActive !== false);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (cat: Category, checked: boolean) => {
    setError(null);
    setSuccess(null);

    // Optimistically update state
    setCategories((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, isActive: checked } : c))
    );

    const res = await updateCategoryAction(cat.id, {
      name: cat.name,
      slug: cat.slug,
      isActive: checked,
    });
    if (!res.success) {
      // Revert on failure
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, isActive: !checked } : c))
      );
      setError(res.error || 'Failed to update category visibility.');
    } else {
      setSuccess(`Updated visibility for "${cat.name}".`);
    }
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
      let res;
      if (editingCategory) {
        res = await updateCategoryAction(editingCategory.id, {
          name,
          slug,
          sortOrder: parseInt(sortOrder) || 1,
          isActive,
        });
      } else {
        res = await createCategoryAction({
          name,
          slug,
          sortOrder: parseInt(sortOrder) || 1,
          isActive,
        });
      }

      if (res.success) {
        setSuccess(editingCategory ? 'Category updated successfully.' : 'Category created successfully.');
        setIsModalOpen(false);
        loadData();
      } else {
        setError(res.error || 'Failed to save category.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    setError(null);
    setSuccess(null);

    const res = await deleteCategoryAction(id);
    if (res.success) {
      setSuccess('Category deleted successfully.');
      loadData();
    } else {
      setError(res.error || 'Failed to delete category.');
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-indigo-500" />
            Categories
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Organize your storefront collections and menus.</p>
        </div>
        <Button 
          onClick={handleOpenCreate}
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 h-9"
        >
          <Plus className="h-3.5 w-3.5" /> Add Category
        </Button>
      </div>

      {/* Categories list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
              Loading category listings...
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-secondary/40 border-b border-border text-muted-foreground uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-4 w-8"></th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Slug</th>
                  <th className="p-4">Products</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((cat, idx) => (
                  <tr 
                    key={cat.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={`hover:bg-muted/10 transition-colors group ${draggedIdx === idx ? 'opacity-40 bg-muted/20' : ''}`}
                  >
                    <td className="p-4">
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab" />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {cat.image ? (
                          <img src={cat.image} alt={cat.name} className="h-9 w-9 rounded-lg object-cover border border-border" />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-muted border border-border flex items-center justify-center">
                            <Layers className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-semibold text-foreground">{cat.name}</span>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-muted-foreground">{cat.slug}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        {cat.count} products
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(cat, !cat.isActive)}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition-all text-[9px] font-extrabold uppercase tracking-wider cursor-pointer ${
                          cat.isActive !== false
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/35 hover:bg-blue-500/15"
                            : "bg-muted text-muted-foreground border-border hover:bg-muted/75"
                        }`}
                        title="Toggle category visibility"
                      >
                        <div className={`w-5.5 h-3 rounded-full relative transition-colors shrink-0 ${
                          cat.isActive !== false ? "bg-blue-600" : "bg-neutral-600"
                        }`}>
                          <div className={`w-2 h-2 bg-white rounded-full absolute top-0.5 transition-all duration-200 ${
                            cat.isActive !== false ? "right-0.5" : "left-0.5"
                          }`} />
                        </div>
                        <span>{cat.isActive !== false ? "Active" : "Disabled"}</span>
                      </button>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleOpenEdit(cat)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border transition-all"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDelete(cat.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                {editingCategory ? 'Edit Category' : 'Create Category'}
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
                <label className="text-xs font-semibold text-foreground/80 block">Category Name *</label>
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

              <div className="flex items-center gap-2 py-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-border accent-blue-500"
                  />
                  Active & Visible on Storefront
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
                      <Save className="h-4 w-4" /> Save Category
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
