"use client";

import { useState, useEffect } from "react";
import { MapPin, Phone, Mail, Clock, ExternalLink, MessageCircle } from "lucide-react";
import { motion } from "motion/react";
import { pbSiteSettings } from "@/lib/pb-collections";

interface LocationMapProps {
  settings?: {
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
    hours?: Array<{ days: string; time: string }> | string;
    googleMapsLink?: string;
    whatsappLink?: string;
  };
}

export default function LocationMap({ settings: propSettings }: LocationMapProps) {
  const [dbSettings, setDbSettings] = useState<any>(null);

  useEffect(() => {
    async function loadMapSettings() {
      try {
        const [gen, con] = await Promise.all([
          pbSiteSettings.get<any>("general").catch(() => null),
          pbSiteSettings.get<any>("contact").catch(() => null),
        ]);
        setDbSettings({ gen, con });
      } catch {}
    }
    void loadMapSettings();
  }, []);

  const rawAddress =
    propSettings?.address ||
    dbSettings?.gen?.location?.address ||
    dbSettings?.con?.address ||
    "No. 91/2/4, First Cross Street";
  const city =
    propSettings?.city ||
    dbSettings?.gen?.location?.city ||
    dbSettings?.con?.city ||
    "Colombo 11";
  const fullAddress = city && !rawAddress.includes(city) ? `${rawAddress}, ${city}` : rawAddress;

  const phone =
    propSettings?.phone ||
    dbSettings?.gen?.contactInfo?.phone ||
    dbSettings?.con?.phone ||
    "+94 76 666 4566";

  const email =
    propSettings?.email ||
    dbSettings?.gen?.contactInfo?.email ||
    dbSettings?.con?.email ||
    "info@ftc.lk";

  const rawMapsLink =
    propSettings?.googleMapsLink ||
    dbSettings?.gen?.location?.googleMapsUrl ||
    dbSettings?.con?.googleMapsLink ||
    "";

  const getCleanMapUrl = (url: string, searchAddress: string) => {
    if (!url || !url.trim()) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(searchAddress)}&output=embed`;
    }
    let trimmed = url.trim();
    if (trimmed.includes("<iframe") || trimmed.startsWith("<iframe")) {
      const match = trimmed.match(/src=["']([^"']+)["']/);
      if (match && match[1]) {
        trimmed = match[1];
      }
    }
    if (trimmed.includes("google.com/maps/embed") || trimmed.includes("output=embed")) {
      return trimmed;
    }
    return `https://maps.google.com/maps?q=${encodeURIComponent(searchAddress)}&output=embed`;
  };

  const cleanGoogleMapsLink = getCleanMapUrl(rawMapsLink, fullAddress);

  const rawWhatsapp =
    propSettings?.whatsappLink ||
    dbSettings?.gen?.contactInfo?.whatsapp ||
    dbSettings?.con?.whatsappLink ||
    "+94 77 123 4567";

  const formattedWhatsapp = rawWhatsapp.startsWith("http")
    ? rawWhatsapp
    : `https://wa.me/${rawWhatsapp.replace(/[^0-9]/g, "")}`;

  const rawHours =
    propSettings?.hours ||
    dbSettings?.gen?.storeHoursCopy ||
    dbSettings?.con?.hours;

  const formattedHours: Array<{ days: string; time: string }> = Array.isArray(rawHours)
    ? rawHours
    : typeof rawHours === "string" && rawHours.trim()
    ? [{ days: "Daily Store Hours", time: rawHours }]
    : [
        { days: "Monday – Saturday", time: "9:00 AM – 7:00 PM" },
        { days: "Sunday & Holidays", time: "10:00 AM – 6:00 PM" },
      ];

  const storeInfo = {
    name: "FTC Flagship Store",
    address: fullAddress,
    phone,
    email,
    hours: formattedHours,
    googleMapsLink: rawMapsLink && !rawMapsLink.includes("<iframe") ? rawMapsLink : `https://maps.google.com/?q=${encodeURIComponent(fullAddress)}`,
    whatsappLink: formattedWhatsapp,
  };

  const iframeSrc = cleanGoogleMapsLink ||
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3960.7984670691077!2d79.8482!3d6.9147!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae259410f545199%3A0xa6ec07c3905cfb6e!2sGalle%20Rd%2C%20Colombo!5e0!3m2!1sen!2slk!4v1700000000000!5m2!1sen!2slk";

  const contactItems = [
    {
      icon: <MapPin className="h-4.5 w-4.5" />,
      label: "Address",
      value: storeInfo.address,
      href: storeInfo.googleMapsLink,
      isExternal: true,
    },
    {
      icon: <Phone className="h-4.5 w-4.5" />,
      label: "Call Us",
      value: storeInfo.phone,
      href: `tel:${storeInfo.phone.replace(/\s+/g, "")}`,
      isExternal: false,
    },
    {
      icon: <Mail className="h-4.5 w-4.5" />,
      label: "Email",
      value: storeInfo.email,
      href: `mailto:${storeInfo.email}`,
      isExternal: false,
    },
  ];

  return (
    <section className="w-full bg-neutral-950 pt-10 sm:pt-16 lg:pt-20 pb-12 sm:pb-16 lg:pb-20 relative z-10 overflow-hidden text-white border-t border-white/5">
      {/* ── Background gradient orbs ── */}
      <div className="absolute top-0 left-0 w-[500px] h-[400px] rounded-full blur-[120px] bg-blue-600/8 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[350px] rounded-full blur-[100px] bg-indigo-600/6 pointer-events-none" />

      {/* ── Dot grid texture ── */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 relative z-10">
        {/* ── Section Header ── */}
        <div className="text-center mb-10 sm:mb-14">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="inline-block text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-neutral-500 mb-3"
          >
            Find Us
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="text-2xl sm:text-3xl lg:text-4xl font-black uppercase tracking-tight text-white"
          >
            FTC{" "}
            <span className="text-blue-400">Experience Center</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.14 }}
            className="text-neutral-400 text-sm mt-2 max-w-md mx-auto"
          >
            Visit us in-store to test premium hardware, get expert advice, and take home same-day.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-start">
          {/* ── Left: Map ── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55 }}
            className="lg:col-span-7 relative"
            style={{ minHeight: '420px' }}
          >
            <div className="w-full h-full rounded-2xl overflow-hidden relative group" style={{ minHeight: '420px' }}>
              <div className="absolute inset-0 rounded-2xl border border-white/5 z-20 pointer-events-none" />
              <iframe
                title="Store Location Map"
                src={iframeSrc}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '420px' }}
                allowFullScreen={true}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full relative z-10"
              />
            </div>
          </motion.div>

          {/* ── Right: Info Card (frosted glass) ── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="lg:col-span-5 h-full"
          >
            <div className="h-full rounded-2xl border border-white/8 bg-white/4 backdrop-blur-md p-6 sm:p-7 flex flex-col gap-6">


              {/* Contact details */}
              <div className="flex flex-col gap-4">
                {contactItems.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}
                    className="flex items-start gap-4 group"
                  >
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/15 text-blue-400 mt-0.5 shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-0.5">
                        {item.label}
                      </h4>
                      {item.href ? (
                        <a
                          href={item.href}
                          target={item.isExternal ? "_blank" : undefined}
                          rel={item.isExternal ? "noopener noreferrer" : undefined}
                          className="text-sm font-semibold text-neutral-200 hover:text-blue-400 transition-colors leading-relaxed"
                        >
                          {item.value}
                        </a>
                      ) : (
                        <p className="text-sm font-semibold text-neutral-200 leading-relaxed">
                          {item.value}
                        </p>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Store Hours */}
                <div className="flex items-start gap-4">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/15 text-blue-400 mt-0.5 shrink-0">
                    <Clock className="h-4.5 w-4.5" />
                  </div>
                  <div className="w-full">
                    <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 mb-1.5">
                      Store Hours
                    </h4>
                    <div className="space-y-1.5">
                      {storeInfo.hours.map((hour, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between text-xs sm:text-sm text-neutral-200"
                        >
                          <span className="text-neutral-500 font-medium">{hour.days}</span>
                          <span className="font-semibold text-right">{hour.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/8" />

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href={storeInfo.googleMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm px-4 h-11 transition-all hover:scale-[1.02] cursor-pointer gap-2 active:scale-[0.98] shadow-lg shadow-blue-500/25 whitespace-nowrap"
                >
                  Get Directions
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href={storeInfo.whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm px-4 h-11 transition-all hover:scale-[1.02] cursor-pointer gap-2 active:scale-[0.98] shadow-lg shadow-emerald-600/25 whitespace-nowrap"
                >
                  <MessageCircle className="h-4 w-4 fill-white/20" />
                  Chat on WhatsApp
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
