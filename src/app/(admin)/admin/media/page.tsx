'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Image as ImageIcon, Upload, Search, Trash2, Eye, FolderPlus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getPbUrl } from '@/lib/pb-admin';
import { uploadMediaAction, deleteMediaAction } from '@/app/actions/admin';
import PocketBase from 'pocketbase';

interface MediaItem {
  id: string;
  url: string;
  name: string;
  size: string;
  type: string;
  tags?: string[];
}

export default function AdminMediaLibraryPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [tagFilter, setTagFilter] = useState('');

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      const { pb } = await import('@/lib/pocketbase');
      
      let records: any[] = [];
      try {
        records = await pb.collection('media').getFullList({
          sort: '-created',
        });
      } catch (err) {
        console.warn('Media collection empty or not created yet:', err);
      }

      setMedia(records.map((r: any) => ({
        id: r.id,
        url: `${getPbUrl()}/api/files/${r.collectionId}/${r.id}/${r.file}`,
        name: r.filename || r.file || 'Unnamed Asset',
        size: r.sizeBytes ? `${Math.round(r.sizeBytes / 1024)} KB` : 'N/A',
        type: r.mimeType || 'image/jpeg',
        tags: r.tags || [],
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const file = files[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('filename', file.name);
      formData.append('sizeBytes', file.size.toString());
      formData.append('mimeType', file.type);
      
      // Auto-extract tags based on file extension/type
      const tags: string[] = [];
      if (file.type.startsWith('image/')) tags.push('image');
      if (file.type.startsWith('video/')) tags.push('video');
      const ext = file.name.split('.').pop() || '';
      if (ext) tags.push(ext.toLowerCase());
      formData.append('tags', JSON.stringify(tags));

      const res = await uploadMediaAction(formData);
      if (res.success) {
        setSuccess('Asset uploaded successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to upload asset.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this media asset?')) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await deleteMediaAction(id);
      if (res.success) {
        setSuccess('Asset deleted successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to delete asset.');
      }
    });
  };

  const filteredMedia = media.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'image' && m.type.startsWith('image/')) ||
      (typeFilter === 'video' && m.type.startsWith('video/'));
    const matchesTag =
      !tagFilter ||
      (m.tags && m.tags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase())));
    return matchesSearch && matchesType && matchesTag;
  });

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
            <ImageIcon className="h-6 w-6 text-indigo-500" />
            Media Asset Library
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Store, catalog, and query product imagery and graphic banners.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept="image/*,video/*"
            onChange={handleUpload}
            disabled={isPending}
          />
          <label
            htmlFor="file-upload"
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors cursor-pointer select-none"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload Asset
          </label>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search assets by file name..."
            className="pl-10 bg-card/40 border-border placeholder:text-muted-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="h-10 px-3.5 rounded-lg border border-border bg-card/40 text-xs text-foreground focus:outline-none cursor-pointer hover:border-border/80 transition-colors"
        >
          <option value="all">All File Types</option>
          <option value="image">Images Only</option>
          <option value="video">Videos Only</option>
        </select>
        <Input
          type="text"
          placeholder="Filter by tag..."
          className="h-10 max-w-[150px] bg-card/40 border-border text-xs"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
      </div>

      {/* Media Assets Grid */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading asset catalog...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredMedia.length === 0 ? (
            <div className="col-span-full p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
              No assets found. Upload images to populate the media library.
            </div>
          ) : (
            filteredMedia.map((item) => (
              <div
                key={item.id}
                className="bg-card border border-border rounded-xl p-3 flex flex-col justify-between hover:border-blue-500/35 transition-all group relative overflow-hidden"
              >
                {/* Visual Frame */}
                <div className="h-28 rounded-lg border border-border bg-secondary/30 relative overflow-hidden flex items-center justify-center shrink-0">
                  { }
                  <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
                </div>

                <div className="mt-3">
                  <p className="text-xs font-bold text-foreground truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.size}</p>
                </div>

                {/* Actions Overlays */}
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded bg-card border border-border text-muted-foreground hover:text-red-500 shadow-xs cursor-pointer"
                    title="Delete Asset"
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
    </div>
  );
}
