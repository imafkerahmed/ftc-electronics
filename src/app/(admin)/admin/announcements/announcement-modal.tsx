'use client';

import React from 'react';
import { Announcement } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Save, Loader2, Image as ImageIcon } from 'lucide-react';

interface AnnouncementModalProps {
  isOpen: boolean;
  editingAnnouncement: Announcement | null;
  title: string;
  setTitle: (val: string) => void;
  link: string;
  setLink: (val: string) => void;
  linkType: string;
  setLinkType: (val: string) => void;
  endsAt: string;
  setEndsAt: (val: string) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  imagePreview: string | null;
  setImagePreview: (url: string | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function AnnouncementModal({
  isOpen,
  editingAnnouncement,
  title,
  setTitle,
  link,
  setLink,
  linkType,
  setLinkType,
  endsAt,
  setEndsAt,
  setSelectedFile,
  imagePreview,
  setImagePreview,
  fileInputRef,
  isPending,
  onClose,
  onSubmit,
  handleFileChange,
}: AnnouncementModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">
            {editingAnnouncement ? 'Edit Announcement' : 'Add Popup Announcement'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 block">Ad/Promo Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g. Clearance Sale Poster"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 block">Ad Graphic Image *</label>
            <div className="border border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center gap-2 bg-muted/10 relative">
              {imagePreview ? (
                <div className="relative w-full h-36 rounded-md overflow-hidden bg-black/10">
                  { }
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setImagePreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-500 shadow-md"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground text-center">
                    Upload banner graphic (Suggested size: 500x600px, aspect 5:6)
                  </p>
                </>
              )}
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                required={!editingAnnouncement}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground/80 block">Destination Action Link</label>
              <select
                value={linkType}
                onChange={(e) => {
                  const val = e.target.value;
                  setLinkType(val);
                  if (val !== 'custom') {
                    setLink(val === 'none' ? '' : val);
                  }
                }}
                className="w-full h-10 px-3 py-2 rounded-lg border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="none">No Link (Static Poster)</option>
                <option value="/deals">Special Deals (/deals)</option>
                <option value="/new-arrivals">New Arrivals (/new-arrivals)</option>
                <option value="/products">All Products (/products)</option>
                <option value="/contact">Contact Support (/contact)</option>
                <option value="custom">Custom URL Path...</option>
              </select>
            </div>

            {linkType === 'custom' && (
              <div className="space-y-1.5 animate-fade-in">
                <label className="text-xs font-semibold text-foreground/80 block">Custom URL Path</label>
                <Input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="e.g. /products/charger-slug or external URL"
                />
              </div>
            )}
            <p className="text-[9px] text-muted-foreground">Redirects the customer when they click the popup ad.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground/80 block">Auto-Expiration Date (Optional)</label>
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            <p className="text-[9px] text-muted-foreground">Ad will automatically stop showing after this date.</p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-muted-foreground border border-border"
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Save Ad
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
