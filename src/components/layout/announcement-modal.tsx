'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
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
    const isMounted = true;
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
            
            // If we are on the homepage and the intro preloader is playing, wait for it to finish
            const isHomepage = pathname === '/';
            if (isHomepage && !hasIntroPlayed) {
              setIsOpen(false);
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
  }, [hasIntroPlayed, pathname]);

  const handleClose = () => {
    if (announcement) {
      const dismissedKey = `ftc-ad-dismissed-${announcement.id}`;
      sessionStorage.setItem(dismissedKey, 'true');
    }
    setIsOpen(false);
  };

  if (!isOpen || !announcement || !imageUrl) return null;

  const content = (
    <div className="relative group w-full max-w-[90vw] md:max-w-[550px] lg:max-w-[650px] max-h-[85vh] flex flex-col items-center justify-center animate-scale-in">
      {/* Dimiss Button (Floating Top Right) */}
      <button
        onClick={handleClose}
        className="absolute -top-10 right-0 md:-right-10 md:top-0 p-2 text-white/80 hover:text-white bg-black/45 backdrop-blur-md rounded-full hover:bg-black/75 shadow-lg border border-white/10 hover:scale-105 transition-all cursor-pointer z-50 animate-fade-in"
        aria-label="Close Ad"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Clickable Image Container */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.7)] bg-card bg-clip-padding flex justify-center items-center">
        {announcement.link ? (
          <Link href={announcement.link} onClick={handleClose} className="w-full h-full flex justify-center items-center">
            { }
            <img
              src={imageUrl}
              alt={announcement.title || 'Announcement'}
              className="w-full max-h-[80vh] object-contain hover:brightness-95 transition-all duration-300"
            />
          </Link>
        ) : (
           
          <img
            src={imageUrl}
            alt={announcement.title || 'Announcement'}
            className="w-full max-h-[80vh] object-contain"
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md transition-all duration-300 p-4">
      {/* Backdrop Click Closes Modal */}
      <div className="absolute inset-0 cursor-default" onClick={handleClose} />

      {/* Modal Card Content */}
      {content}
    </div>
  );
}
