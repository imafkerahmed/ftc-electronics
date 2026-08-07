"use client";

import { useState, useEffect } from "react";
import { useSiteBranding } from "@/components/providers/site-branding-provider";

interface WhatsAppButtonProps {
  phoneNumber?: string;
  message?: string;
}

export default function WhatsAppButton({
  phoneNumber,
  message = "Hi! I have a question about your products.",
}: WhatsAppButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const branding = useSiteBranding();

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setShowTooltip(true), 3000);
    const hideTimer = setTimeout(() => setShowTooltip(false), 8000);
    return () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!mounted) return null;

  const rawPhone =
    phoneNumber ||
    branding?.contactInfo?.whatsapp ||
    branding?.contactInfo?.phone ||
    "+94 77 123 4567";

  const cleanPhone = rawPhone.replace(/[^0-9]/g, "");
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center group pointer-events-auto"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={`
          relative mr-3 px-5 py-2.5 rounded-xl text-sm font-medium tracking-wide shadow-xl 
          bg-background border border-border/60 text-foreground
          transition-all duration-300 ease-out origin-right select-none
          ${showTooltip ? "opacity-100 translate-x-0 scale-100" : "opacity-0 translate-x-4 scale-90 pointer-events-none"}
        `}
      >
        <span className="relative z-10 block whitespace-nowrap">Chat with us!</span>
        <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-background border-r border-t border-border/60" />
      </div>

      {/* WhatsApp Floating Button */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        className="relative flex items-center justify-center w-16 h-16 rounded-full border-2 border-slate-100 bg-white hover:bg-slate-50 shadow-[0_10px_35px_rgba(37,211,102,0.2)] hover:shadow-[0_12px_40px_rgba(37,211,102,0.35)] transition-all duration-300 hover:scale-110 active:scale-95 group-hover:rotate-[10deg] shrink-0"
      >
        {/* Pulsing Outer Ring */}
        <span className="absolute -inset-1.5 rounded-full border-2 border-[#25D366]/35 animate-pulse pointer-events-none" />
        <span className="absolute -inset-3 rounded-full border border-[#25D366]/15 animate-ping [animation-duration:2.5s] pointer-events-none" />

        {/* Font Awesome Inline SVG */}
        <svg
          aria-hidden="true"
          focusable="false"
          data-prefix="fab"
          data-icon="whatsapp"
          className="w-8 h-8 fill-current text-[#25D366]"
          role="img"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 448 512"
        >
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
        </svg>
      </a>
    </div>
  );
}
