'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { pbAnnouncements } from '@/lib/pb-collections';
import type { PBAnnouncement } from '@/types/admin';
import Link from 'next/link';
import { useUiStore } from '@/store/use-ui-store';
import { usePathname } from 'next/navigation';

export default function AnnouncementModal() {
  const [announcement, setAnnouncement] = useState<PBAnnouncement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const hasIntroPlayed = useUiStore((state) => state.hasIntroPlayed);
  const pathname = usePathname();

  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout;

    async function checkAnnouncement() {
      try {
        const activeList = await pbAnnouncements.getActive();
        if (!isMounted) return;
        if (activeList && activeList.length > 0) {
          const activeAd = activeList[0];
          const dismissedKey = `ftc-ad-dismissed-${activeAd.id}`;
          const isDismissed = sessionStorage.getItem(dismissedKey);

          if (!isDismissed) {
            setAnnouncement(activeAd);
            setImageUrl(pbAnnouncements.getFileUrl(activeAd));

            const isHomepage = pathname === '/';
            if (isHomepage && !hasIntroPlayed) {
              // Wait for initial page loader to finish (~2 seconds) then show modal
              timer = setTimeout(() => {
                if (isMounted) setIsOpen(true);
              }, 2100);
            } else {
              setIsOpen(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load active ad popup:', err);
      }
    }

    void checkAnnouncement();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [hasIntroPlayed, pathname]);

  const handleClose = () => {
    if (announcement) {
      const dismissedKey = `ftc-ad-dismissed-${announcement.id}`;
      sessionStorage.setItem(dismissedKey, 'true');
    }
    setIsOpen(false);
  };

  if (!isOpen || !announcement) return null;

  const hasTitle = Boolean(announcement.title && announcement.title.trim().length > 0);
  const hasDesc = Boolean(announcement.description && announcement.description.trim().length > 0);
  const hasLink = Boolean(announcement.link && announcement.link.trim().length > 0);

  const content = (
    <div className="relative group w-full max-w-[92vw] sm:max-w-[480px] md:max-w-[620px] max-h-[85vh] flex flex-col items-center justify-center animate-scale-in">
      {/* Dimiss Floating Button */}
      <button
        onClick={handleClose}
        className="absolute -top-12 right-0 md:-right-10 md:top-0 p-2.5 text-white/80 hover:text-white bg-black/75 hover:bg-black rounded-full shadow-2xl border border-white/20 hover:scale-110 active:scale-95 transition-all cursor-pointer z-50"
        aria-label="Close Announcement"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Main Card */}
      <div className="relative w-full rounded-3xl overflow-hidden border border-white/15 bg-card shadow-[0_25px_80px_rgba(0,0,0,0.85)] flex flex-col justify-center items-center">
        {imageUrl ? (
          <div className="w-full flex flex-col">
            {/* Graphic Image Area */}
            <div className="relative w-full overflow-hidden bg-black/40 flex justify-center items-center max-h-[60vh]">
              {hasLink ? (
                <Link href={announcement.link!} onClick={handleClose} className="w-full h-full flex justify-center items-center group/img">
                  <img
                    src={imageUrl}
                    alt={announcement.title || 'Announcement'}
                    className="w-full h-auto max-h-[60vh] object-contain group-hover/img:scale-[1.02] transition-transform duration-500"
                  />
                </Link>
              ) : (
                <img
                  src={imageUrl}
                  alt={announcement.title || 'Announcement'}
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
              )}
            </div>

            {/* Optional Overlay / Bottom Info Box */}
            {(hasTitle || hasDesc || hasLink) && (
              <div className="p-6 md:p-7 flex flex-col gap-3 bg-gradient-to-b from-card/90 to-card border-t border-white/10">
                {hasTitle && (
                  <h3 className="text-lg md:text-xl font-extrabold text-foreground tracking-tight line-clamp-2">
                    {announcement.title}
                  </h3>
                )}

                {hasDesc && (
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {announcement.description}
                  </p>
                )}

                {hasLink && (
                  <div className="pt-2 flex justify-end">
                    <Link
                      href={announcement.link!}
                      onClick={handleClose}
                      className="inline-flex items-center gap-2 px-6 py-2.5 text-xs md:text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-full shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <span>Explore Now</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Text & CTA Card (No Graphic Image) */
          <div className="p-8 md:p-10 text-center flex flex-col items-center justify-center gap-5 w-full bg-gradient-to-b from-blue-950/20 via-card to-card relative">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-bold uppercase tracking-widest">
              <span>Announcement</span>
            </div>

            {hasTitle && (
              <h3 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight max-w-md leading-tight">
                {announcement.title}
              </h3>
            )}

            {hasDesc && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                {announcement.description}
              </p>
            )}

            {hasLink && (
              <Link
                href={announcement.link!}
                onClick={handleClose}
                className="mt-2 inline-flex items-center gap-2 px-7 py-3 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-full shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 active:scale-95 transition-all"
              >
                <span>View Details</span>
                <ArrowRight className="h-4.5 w-4.5" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 transition-all duration-300 p-4">
      {/* Backdrop Click Closes Modal */}
      <div className="absolute inset-0 cursor-default" onClick={handleClose} />

      {/* Modal Card Content */}
      {content}
    </div>
  );
}
