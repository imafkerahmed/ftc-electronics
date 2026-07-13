'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Star, MessageSquare, Check, X, ShieldAlert, Loader2, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pbReviews, pbProducts } from '@/lib/pb-collections';
import { updateReviewStatusAction, deleteReviewAction, createReviewAction } from '@/app/actions/admin';

interface Review {
  id: string;
  productName: string;
  customerName: string;
  rating: number;
  comment: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual Creation States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [productId, setProductId] = useState('');
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'approved' | 'rejected'>('approved');
  const [isVerified, setIsVerified] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [allProducts, setAllProducts] = useState<{ id: string; name: string }[]>([]);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await pbReviews.getAll();
      setReviews((res?.items || []).map((r: any) => ({
        id: r.id,
        productName: r.expand?.product?.name || 'Unknown Product',
        customerName: r.customerName || 'Anonymous',
        rating: r.rating || 5,
        comment: r.comment || '',
        date: new Date(r.created).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        status: r.status || 'pending',
      })));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await pbProducts.getAll({ perPage: 100 });
      setAllProducts((res?.items || []).map(p => ({ id: p.id, name: p.name })));
    } catch (err) {
      console.error('Failed to load products for reviews selection:', err);
    }
  };

  useEffect(() => {
    loadData();
    loadProducts();
  }, []);

  const handleOpenCreate = () => {
    setCustomerName('');
    setProductId(allProducts[0]?.id || '');
    setRating('5');
    setComment('');
    setReviewStatus('approved');
    setIsVerified(true);
    setIsFeatured(false);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!customerName || !productId || !comment) {
      setError('Please fill in all required fields.');
      return;
    }

    startTransition(async () => {
      const res = await createReviewAction({
        customerName,
        product: productId,
        rating: parseInt(rating) || 5,
        comment,
        status: reviewStatus,
        isVerified,
        isFeatured,
      });

      if (res.success) {
        setSuccess('Review manually added successfully.');
        setIsModalOpen(false);
        loadData();
      } else {
        setError(res.error || 'Failed to manually add review.');
      }
    });
  };

  const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await updateReviewStatusAction(id, newStatus);
      if (res.success) {
        setSuccess(`Review has been successfully ${newStatus}.`);
        loadData();
      } else {
        setError(res.error || 'Failed to update review status.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this review?')) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await deleteReviewAction(id);
      if (res.success) {
        setSuccess('Review deleted successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to delete review.');
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
            <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
            Customer Reviews & Moderation
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Review, approve, reject, or delete customer feedback submissions.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-9 px-4 flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add Review
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Pending Moderation', value: reviews.filter((r) => r.status === 'pending').length.toString(), color: 'text-amber-500' },
          { label: 'Approved Reviews', value: reviews.filter((r) => r.status === 'approved').length.toString(), color: 'text-emerald-500' },
          { label: 'Rejected Reviews', value: reviews.filter((r) => r.status === 'rejected').length.toString(), color: 'text-red-500' },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</p>
            <p className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Reviews List */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading reviews...
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
              No reviews found.
            </div>
          ) : (
            reviews.map((review) => (
              <div
                key={review.id}
                className={`p-5 rounded-xl border bg-card/60 backdrop-blur-md transition-all ${
                  review.status === 'pending'
                    ? 'border-amber-500/30'
                    : review.status === 'approved'
                    ? 'border-border hover:border-emerald-500/20'
                    : 'border-border/40 opacity-75'
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{review.customerName}</span>
                      <span className="text-[10px] text-muted-foreground">• {review.date}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Reviewed product:{' '}
                      <span className="font-semibold text-foreground">{review.productName}</span>
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {review.status === 'pending' ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateStatus(review.id, 'approved')}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1 h-8 px-3 text-[11px]"
                          disabled={isPending}
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateStatus(review.id, 'rejected')}
                          className="text-red-500 hover:text-red-400 hover:bg-red-500/10 border border-border flex items-center gap-1 h-8 px-3 text-[11px]"
                          disabled={isPending}
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </>
                    ) : (
                      <span
                        className={`px-2 py-0.5 border text-[9px] rounded font-bold uppercase tracking-wider ${
                          review.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        }`}
                      >
                        {review.status}
                      </span>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(review.id)}
                      className="text-red-500 hover:bg-red-550/15 h-8 w-8 p-0 cursor-pointer"
                      disabled={isPending}
                      title="Delete review"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Stars */}
                <div className="flex text-amber-500 mt-3">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`h-4 w-4 ${
                        idx < review.rating ? 'fill-current' : 'text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>

                {/* Comment */}
                <div className="mt-3 bg-secondary/20 p-3 rounded-lg border border-border/60 flex gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground italic leading-relaxed">
                    &ldquo;{review.comment}&rdquo;
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {/* Add Review Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Add Manual Review</h3>
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
                <label className="text-xs font-semibold text-foreground/80 block">Customer Name *</label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Product *</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  required
                  className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">Select Product...</option>
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Rating (1-5) *</label>
                  <select
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                    className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="5">5 Stars</option>
                    <option value="4">4 Stars</option>
                    <option value="3">3 Stars</option>
                    <option value="2">2 Stars</option>
                    <option value="1">1 Star</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground/80 block">Status *</label>
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value as any)}
                    className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-6 py-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVerified}
                    onChange={(e) => setIsVerified(e.target.checked)}
                    className="rounded border-border accent-blue-500"
                  />
                  Verified Purchase
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded border-border accent-blue-500"
                  />
                  Featured Review
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80 block">Comment *</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  required
                  className="w-full min-h-[60px] p-2.5 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
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
                  Save Review
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Add Trash2 and Save to imports
import { Trash2, Save } from 'lucide-react';
