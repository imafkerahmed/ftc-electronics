'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Tag, Plus, Edit, Trash2, Percent, Calendar, X, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pbPromotions } from '@/lib/pb-collections';
import { createPromotionAction, deletePromotionAction, updatePromotionAction } from '@/app/actions/admin';

interface Promotion {
  id: string;
  code: string;
  name: string;
  type: 'percentage' | 'flat';
  value: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'scheduled' | 'expired';
  isActive: boolean;
  minOrderValue?: number;
  usageLimit?: number;
  usageCount?: number;
}

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Drawer state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'flat'>('percentage');
  const [value, setValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [usageLimit, setUsageLimit] = useState('');

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await pbPromotions.getAll();
      const now = new Date();
      setPromotions((res?.items || []).map((p: any) => {
        const start = new Date(p.startDate || p.starts_at);
        const end = new Date(p.endDate || p.ends_at);
        let status: 'active' | 'scheduled' | 'expired' = 'active';

        if (now < start) status = 'scheduled';
        else if (now > end) status = 'expired';

        return {
          id: p.id,
          code: p.couponCode || p.code || 'BLANKET',
          name: p.name || 'Promo Campaign',
          type: p.type || 'percentage',
          value: p.discountValue || p.value || 0,
          startDate: (p.startDate || p.starts_at || '').split('T')[0],
          endDate: (p.endDate || p.ends_at || '').split('T')[0],
          status,
          isActive: p.isActive || false,
          minOrderValue: p.minOrderValue || 0,
          usageLimit: p.usageLimit || 0,
          usageCount: p.usageCount || 0,
        };
      }));
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
    setEditingPromotion(null);
    setName('');
    setCode('');
    setType('percentage');
    setValue('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setMinOrderValue('');
    setUsageLimit('');
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (promo: Promotion) => {
    setEditingPromotion(promo);
    setName(promo.name);
    setCode(promo.code);
    setType(promo.type);
    setValue(promo.value.toString());
    setStartDate(promo.startDate);
    setEndDate(promo.endDate);
    setMinOrderValue(promo.minOrderValue ? promo.minOrderValue.toString() : '');
    setUsageLimit(promo.usageLimit ? promo.usageLimit.toString() : '');
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleToggleActive = async (promo: Promotion) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await updatePromotionAction(promo.id, {
        isActive: !promo.isActive,
      });

      if (res.success) {
        setSuccess(`Promotion '${promo.name}' has been ${!promo.isActive ? 'activated' : 'deactivated'} successfully.`);
        loadData();
      } else {
        setError(res.error || 'Failed to update promotion status.');
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name || !code || !value || !startDate || !endDate) {
      setError('Please fill in all required fields.');
      return;
    }

    startTransition(async () => {
      let res;
      const payload = {
        name,
        couponCode: code,
        type,
        discountValue: parseFloat(value) || 0,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        minOrderValue: parseFloat(minOrderValue) || 0,
        usageLimit: parseInt(usageLimit) || 0,
      };

      if (editingPromotion) {
        res = await updatePromotionAction(editingPromotion.id, {
          ...payload,
          isActive: editingPromotion.isActive,
        });
      } else {
        res = await createPromotionAction({
          ...payload,
          isActive: true,
        });
      }

      if (res.success) {
        setSuccess(editingPromotion ? 'Promotion updated successfully.' : 'Promotion created successfully.');
        setIsModalOpen(false);
        loadData();
      } else {
        setError(res.error || 'Failed to save promotion.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await deletePromotionAction(id);
      if (res.success) {
        setSuccess('Promotion deleted successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to delete promotion.');
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

      {/* Title */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <Tag className="h-6 w-6 text-emerald-500" />
            Promotions & Campaigns
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Create coupon codes, flat discounts, or BNPL promo campaigns.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-9 px-4 flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add Promotion
        </Button>
      </div>

      {/* List of promotions */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading promotions...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {promotions.length === 0 ? (
            <div className="col-span-full p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
              No promotions found.
            </div>
          ) : (
            promotions.map((promo) => (
              <div
                key={promo.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-blue-500/25 transition-all group relative flex flex-col justify-between min-h-[210px] overflow-hidden"
              >
                {/* Dotted coupon line divider & ticket cutout indicators */}
                <div className="absolute top-1/2 left-0 w-3 h-6 bg-background border-r border-border -mt-3 rounded-r-full -translate-x-[1px] z-10" />
                <div className="absolute top-1/2 right-0 w-3 h-6 bg-background border-l border-border -mt-3 rounded-l-full translate-x-[1px] z-10" />

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="px-2.5 py-1 rounded bg-secondary/85 border border-border/80 text-xs font-mono font-bold uppercase tracking-wider text-foreground">
                      {promo.code}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(promo)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${promo.isActive ? 'bg-emerald-600' : 'bg-slate-700'}`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${promo.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      <span
                        className={`px-2 py-0.5 border text-[9px] rounded font-bold uppercase tracking-wider ${
                          promo.isActive && promo.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : promo.isActive && promo.status === 'scheduled'
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {promo.isActive ? promo.status : 'inactive'}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-foreground text-sm mt-3.5 leading-snug">
                    {promo.name}
                  </h3>
                  
                  {/* Coupon criteria details */}
                  <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                    <div>
                      {promo.minOrderValue && promo.minOrderValue > 0 ? (
                        <span>🛒 Min. Purchase: <strong className="text-foreground">LKR {promo.minOrderValue.toLocaleString()}</strong></span>
                      ) : (
                        <span>🛒 No minimum purchase required</span>
                      )}
                    </div>
                    <div>
                      {promo.usageLimit && promo.usageLimit > 0 ? (
                        <span>
                          🎟️ Usage: <strong className="text-foreground">{promo.usageCount} / {promo.usageLimit}</strong> times
                          {promo.usageCount !== undefined && promo.usageCount >= promo.usageLimit && (
                            <span className="ml-1 text-red-400 font-bold">(Fully Used)</span>
                          )}
                        </span>
                      ) : (
                        <span>🎟️ Unlimited usage times</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-dashed border-border/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Percent className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-bold text-foreground">
                      {promo.type === 'percentage'
                        ? `${promo.value}% Off`
                        : `LKR ${promo.value.toLocaleString()} Off`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Ends {promo.endDate}</span>
                  </div>
                </div>

                {/* Actions overlay */}
                <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleOpenEdit(promo)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted border border-border bg-card cursor-pointer"
                    title="Edit Campaign"
                    disabled={isPending}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(promo.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-border bg-card cursor-pointer"
                    title="Delete Campaign"
                    disabled={isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">
                {editingPromotion ? 'Edit Promotion Campaign' : 'Create Promotion'}
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
                <label className="text-xs font-semibold text-foreground/80 block">Campaign Name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Summer Special" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Promo Code *</label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="e.g. SUMMER26" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Discount Type *</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="flat">Flat Value (LKR)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Discount Value *</label>
                  <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} required />
                </div>
              </div>

               <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Min Order Value (LKR)</label>
                  <Input type="number" value={minOrderValue} onChange={(e) => setMinOrderValue(e.target.value)} placeholder="e.g. 5000" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Usage Limit</label>
                  <Input type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Leave blank if unlimited" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Start Date *</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">End Date *</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
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
                      <Save className="h-4 w-4" /> Save Promotion
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
