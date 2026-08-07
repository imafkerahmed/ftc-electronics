'use client';

import React from 'react';
import { Announcement } from './types';
import { Edit, Trash2, Link as LinkIcon, Calendar, Image as ImageIcon } from 'lucide-react';

interface AnnouncementCardProps {
  announcement: Announcement;
  onEdit: (ann: Announcement) => void;
  onDelete: (id: string) => void;
  onToggleActive: (ann: Announcement) => void;
}

export function AnnouncementCard({
  announcement,
  onEdit,
  onDelete,
  onToggleActive,
}: AnnouncementCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-blue-500/25 transition-all group relative flex flex-col">
      {/* Ad Graphic preview */}
      <div className="h-48 bg-muted/20 relative flex items-center justify-center overflow-hidden border-b border-border">
        {announcement.imageUrl ? (
           
          <img
            src={announcement.imageUrl}
            alt={announcement.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
        {/* Status Badges */}
        <div className="absolute top-3 left-3 z-10 flex gap-2">
          <span
            className={`px-2 py-0.5 text-[9px] rounded font-bold uppercase tracking-wider border ${
              announcement.isActive
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                : 'bg-slate-700/60 text-slate-400 border-slate-700/40'
            }`}
          >
            {announcement.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 flex-grow flex flex-col justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-foreground truncate">{announcement.title || 'Announcement'}</h3>
          {announcement.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1 font-normal">{announcement.description}</p>
          )}
          {announcement.link && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5 truncate">
              <LinkIcon className="h-3 w-3 shrink-0" />
              <span>{announcement.link}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-3 border-t border-border/50">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{announcement.endsAt ? `Expiry: ${announcement.endsAt}` : 'Never expires'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleActive(announcement)}
              aria-label={`Mark "${announcement.title}" as ${announcement.isActive ? 'inactive' : 'active'}`}
              aria-pressed={announcement.isActive}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                announcement.isActive ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  announcement.isActive ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Hover/Focus actions overlay */}
      <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-20">
        <button
          type="button"
          onClick={() => onEdit(announcement)}
          aria-label={`Edit announcement "${announcement.title}"`}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted border border-border bg-card/90 backdrop-blur-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Edit Announcement"
        >
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(announcement.id)}
          aria-label={`Delete announcement "${announcement.title}"`}
          className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-border bg-card/90 backdrop-blur-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Delete Announcement"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
