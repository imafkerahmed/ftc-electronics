'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { Megaphone, Plus, Loader2, CheckCircle, AlertCircle, Bell, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pbAnnouncements } from '@/lib/supabase-collections';
import { createAnnouncementAction, deleteAnnouncementAction, updateAnnouncementAction, toggleAnnouncementActiveAction, getAnnouncementsAction, updateSiteSettingsAction } from '@/app/actions/admin';
import type { PBAnnouncement } from '@/types/admin';
import { Announcement } from './types';
import { AnnouncementCard } from './announcement-card';
import { AnnouncementModal } from './announcement-modal';

export interface AnnouncementText {
  id: string;
  text: string;
  link: string;
  enabled: boolean;
}

export interface PersonalizationSettings {
  logoUrl?: string;
  darkLogoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  announcement?: {
    show?: boolean;
    text?: string;
    link?: string;
    texts?: AnnouncementText[];
    bgColor?: string;
  };
  [key: string]: unknown;
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Top Banner States
  const [fullPersonalization, setFullPersonalization] = useState<PersonalizationSettings | null>(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcementTexts, setAnnouncementTexts] = useState<AnnouncementText[]>([]);
  const [announcementBg, setAnnouncementBg] = useState('#1e293b');
  const [isSavingBanner, setIsSavingBanner] = useState(false);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
      const res = await getAnnouncementsAction();
      if (!res.success && res.error) {
        setError(res.error);
      }

      // Load personalization settings for Top Banner
      try {
        const response = await fetch('/api/settings/branding');
        if (response.ok) {
          const data = await response.json();
          const settings = data.personalization as PersonalizationSettings | undefined;
          if (settings && typeof settings === 'object') {
            setFullPersonalization(settings);
            setShowAnnouncement(settings.announcement?.show ?? true);
            if (settings.announcement?.texts && Array.isArray(settings.announcement.texts)) {
              setAnnouncementTexts(
                settings.announcement.texts.map((t) => ({
                  id: t.id || String(Math.random()),
                  text: t.text || '',
                  link: t.link || '',
                  enabled: t.enabled !== false,
                }))
              );
            } else if (settings.announcement?.text) {
              setAnnouncementTexts([
                { id: '1', text: settings.announcement.text, enabled: true, link: settings.announcement.link || '' },
              ]);
            }
            setAnnouncementBg(settings.announcement?.bgColor || '#1e293b');
          } else {
            setError('Failed to load top banner settings. Banner saving is disabled until reload.');
          }
        } else {
          setError('Failed to load top banner settings. Banner saving is disabled until reload.');
        }
      } catch (e) {
        console.error('Failed to load top banner settings:', e);
        setError('Failed to load top banner settings. Banner saving is disabled until reload.');
      }
      setAnnouncements((res?.items || []).map((ann: any) => ({
        id: ann.id,
        title: ann.title || ann.name || ann.headline || '',
        description: ann.description || ann.body || ann.details || '',
        image: ann.image || ann.file || '',
        link: ann.link || ann.url || '',
        isActive: ann.isActive !== undefined ? Boolean(ann.isActive) : (ann.is_active !== undefined ? Boolean(ann.is_active) : true),
        endsAt: ann.endsAt ? ann.endsAt.split('T')[0] : (ann.ends_at ? ann.ends_at.split('T')[0] : ''),
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
    setDescription('');
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
    setTitle(ann.title || '');
    setDescription(ann.description || '');
    setLink(ann.link || '');
    if (!ann.link) {
      setLinkType('none');
    } else if (['/deals', '/new-arrivals', '/products', '/contact'].includes(ann.link)) {
      setLinkType(ann.link);
    } else {
      setLinkType('custom');
    }
    setEndsAt(ann.endsAt || '');
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

    if (!title && !description && !selectedFile && (!editingAnnouncement || !editingAnnouncement.image)) {
      setError('Please provide at least a Title, Description, or Graphic Image for the announcement.');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
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

  const handleSaveTopBanner = async () => {
    if (!fullPersonalization) {
      setError('Personalization settings are not loaded. Reload the page before saving the banner.');
      return;
    }
    setIsSavingBanner(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: PersonalizationSettings = {
        ...fullPersonalization,
        announcement: {
          show: showAnnouncement,
          texts: announcementTexts,
          bgColor: announcementBg,
        }
      };
      const res = await updateSiteSettingsAction('personalization', payload);
      if (res.success) {
        setSuccess('Top announcement banner settings saved successfully.');
      } else {
        setError(res.error || 'Failed to save banner settings.');
      }
    } catch (err) {
      setError('An error occurred while saving banner settings.');
    } finally {
      setIsSavingBanner(false);
    }
  };

  const handleTextChange = (id: string, field: 'text' | 'link' | 'enabled', value: string | boolean) => {
    setAnnouncementTexts(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const removeText = (id: string) => {
    setAnnouncementTexts(prev => prev.filter(t => t.id !== id));
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

      {/* Top Banner Management */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-purple-500" /> Top Announcement Banner
          </h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground/80">
              <input
                type="checkbox"
                checked={showAnnouncement}
                onChange={(e) => setShowAnnouncement(e.target.checked)}
                className="rounded"
              />
              Show Top Banner
            </label>
            <Button
              onClick={handleSaveTopBanner}
              disabled={isSavingBanner || !fullPersonalization}
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold cursor-pointer h-8 px-4 flex items-center gap-1.5"
            >
              {isSavingBanner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Banner
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {announcementTexts.map((item, idx) => (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start border border-border/50 p-3 rounded-xl bg-muted/20">
              <div className="md:col-span-6 space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Banner Message {idx + 1}</label>
                <Input value={item.text} onChange={(e) => handleTextChange(item.id, 'text', e.target.value)} placeholder="e.g. Free shipping on all orders over $100" className="h-8.5 text-xs bg-background" />
              </div>
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-xs font-semibold text-foreground/80">Link (Optional)</label>
                <Input value={item.link} onChange={(e) => handleTextChange(item.id, 'link', e.target.value)} placeholder="e.g. /products/new" className="h-8.5 text-xs bg-background" />
              </div>
              <div className="md:col-span-2 pt-6 flex items-center gap-2 justify-end">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-foreground/80">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => handleTextChange(item.id, 'enabled', e.target.checked)}
                    className="rounded"
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => removeText(item.id)}
                  className="text-red-500 hover:text-red-600 p-1 rounded-md hover:bg-red-50"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAnnouncementTexts([...announcementTexts, { id: Date.now().toString(), text: '', link: '', enabled: true }])}
            className="h-8 text-xs flex items-center gap-1.5 w-full border-dashed"
          >
            <Plus className="h-3.5 w-3.5" /> Add Another Announcement
          </Button>

          <div className="pt-2 flex items-center justify-between border-t border-border mt-4">
            <label className="text-xs font-semibold text-foreground/80">Banner Background Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={announcementBg}
                onChange={(e) => setAnnouncementBg(e.target.value)}
                className="h-8 w-12 rounded-md border border-border cursor-pointer p-0.5 bg-background"
              />
              <Input value={announcementBg} onChange={(e) => setAnnouncementBg(e.target.value)} className="h-8 w-24 text-xs font-mono uppercase bg-background" />
            </div>
          </div>
        </div>
      </div>

      {/* Header Title for Popups */}
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
        description={description}
        setDescription={setDescription}
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
