'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { Megaphone, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pbAnnouncements } from '@/lib/pb-collections';
import { createAnnouncementAction, deleteAnnouncementAction, updateAnnouncementAction, toggleAnnouncementActiveAction } from '@/app/actions/admin';
import type { PBAnnouncement } from '@/types/admin';
import { Announcement } from './types';
import { AnnouncementCard } from './announcement-card';
import { AnnouncementModal } from './announcement-modal';

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [linkType, setLinkType] = useState('none');
  const [endsAt, setEndsAt] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await pbAnnouncements.getAll();
      setAnnouncements((res?.items || []).map((ann: PBAnnouncement) => ({
        id: ann.id,
        title: ann.title || 'Untitled Ad',
        image: ann.image || '',
        link: ann.link || '',
        isActive: ann.isActive || false,
        endsAt: ann.endsAt ? ann.endsAt.split('T')[0] : '',
        imageUrl: pbAnnouncements.getFileUrl(ann),
      })));
    } catch (err: any) {
      console.error('[AdminAnnouncementsPage] Failed to load announcements:', err);
      setError(err?.message || 'Failed to load popup announcements from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingAnnouncement(null);
    setTitle('');
    setLink('');
    setLinkType('none');
    setEndsAt('');
    setSelectedFile(null);
    setImagePreview(null);
    setRemoveImage(false);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ann: Announcement) => {
    setEditingAnnouncement(ann);
    setTitle(ann.title);
    setLink(ann.link);
    if (ann.link === '') {
      setLinkType('none');
    } else if (['/deals', '/new-arrivals', '/products', '/contact'].includes(ann.link)) {
      setLinkType(ann.link);
    } else {
      setLinkType('custom');
    }
    setEndsAt(ann.endsAt);
    setSelectedFile(null);
    setImagePreview(ann.imageUrl || null);
    setRemoveImage(false);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setRemoveImage(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  };

  const handleToggleActive = async (ann: Announcement) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await toggleAnnouncementActiveAction(ann.id, !ann.isActive);
      if (res.success) {
        setSuccess(`Announcement status updated successfully.`);
        loadData();
      } else {
        setError(res.error || 'Failed to update status.');
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!title) {
      setError('Title is required.');
      return;
    }

    if (!editingAnnouncement && !selectedFile) {
      setError('Please select an announcement image to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('link', link);
    formData.append('isActive', editingAnnouncement ? String(editingAnnouncement.isActive) : 'true');
    formData.append('removeImage', String(removeImage));

    if (endsAt) {
      formData.append('endsAt', endsAt);
    } else {
      formData.append('endsAt', '');
    }

    if (selectedFile) {
      formData.append('image', selectedFile);
    }

    startTransition(async () => {
      let res;
      if (editingAnnouncement) {
        res = await updateAnnouncementAction(editingAnnouncement.id, formData);
      } else {
        res = await createAnnouncementAction(formData);
      }

      if (res.success) {
        setSuccess(editingAnnouncement ? 'Announcement updated successfully.' : 'Announcement created successfully.');
        setIsModalOpen(false);
        loadData();
      } else {
        setError(res.error || 'Failed to save announcement.');
      }
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await deleteAnnouncementAction(id);
      if (res.success) {
        setSuccess('Announcement deleted successfully.');
        loadData();
      } else {
        setError(res.error || 'Failed to delete announcement.');
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

      {/* Header Title */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-wide flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-blue-500" />
            Storefront Popup Announcements
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Display responsive modal ad graphics with blurred backdrops to all visiting customers.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer h-9 px-4 flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add Popup Ad
        </Button>
      </div>

      {/* List of Popups */}
      {loading ? (
        <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
          Loading announcements...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {announcements.length === 0 ? (
            <div className="col-span-full p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-xl">
              No popup announcements configured.
            </div>
          ) : (
            announcements.map((ann) => (
              <AnnouncementCard
                key={ann.id}
                announcement={ann}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
              />
            ))
          )}
        </div>
      )}

      {/* Editor Modal */}
      <AnnouncementModal
        isOpen={isModalOpen}
        editingAnnouncement={editingAnnouncement}
        title={title}
        setTitle={setTitle}
        link={link}
        setLink={setLink}
        linkType={linkType}
        setLinkType={setLinkType}
        endsAt={endsAt}
        setEndsAt={setEndsAt}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        imagePreview={imagePreview}
        setImagePreview={setImagePreview}
        fileInputRef={fileInputRef}
        isPending={isPending}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        handleFileChange={handleFileChange}
        onClearImage={handleClearImage}
      />
    </div>
  );
}
