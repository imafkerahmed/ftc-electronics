"use client";

import { MapPin, Phone, Mail, Clock, ExternalLink } from "lucide-react";

export default function LocationMap() {
  const storeInfo = {
    name: "FTC Flagship Store",
    address: "45 Galle Road, Colombo 03, Sri Lanka",
    phone: "+94 11 234 5678",
    email: "support@ftcelectronics.com",
    hours: [
      { days: "Monday - Saturday", time: "9:00 AM - 8:00 PM" },
      { days: "Sunday & Holidays", time: "10:00 AM - 6:00 PM" },
    ],
    googleMapsLink:
      "https://maps.google.com/?q=Galle+Rd,+Colombo+03,+Sri+Lanka",
  };

  return (
    <section
      className="w-full border-b border-neutral-200/50 dark:border-white/5 bg-[#f4f4f6] dark:bg-[#07070b] py-8 sm:py-16 lg:py-24 relative z-10 overflow-hidden text-neutral-900 dark:text-white transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center">
          {/* Left Column: Interactive Map */}
          <div className="lg:col-span-7 relative h-[220px] sm:h-[350px] lg:h-[400px]">
            <div className="w-full h-full rounded-2xl overflow-hidden border border-neutral-200/60 dark:border-white/5 bg-white dark:bg-zinc-950 shadow-md relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-2xl blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              {/* Map iframe */}
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3960.7984670691077!2d79.8482!3d6.9147!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae259410f545199%3A0xa6ec07c3905cfb6e!2sGalle%20Rd%2C%20Colombo!5e0!3m2!1sen!2slk!4v1700000000000!5m2!1sen!2slk"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen={true}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full relative z-10 dark:invert-[90%] dark:hue-rotate-180 dark:brightness-[90%] dark:contrast-[100%]"
              />
            </div>
          </div>

          {/* Right Column: Address and Opening Hours */}
          <div className="lg:col-span-5 flex flex-col justify-center space-y-4 sm:space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-neutral-900 dark:text-white uppercase leading-snug">
                FTC{" "}
                <span className="text-blue-600 dark:text-blue-400">
                  Experience Center
                </span>
              </h2>
            </div>

            {/* Details List */}
            <div className="space-y-4 pt-0.5 sm:pt-2">
              {/* Address */}
              <div className="flex items-start gap-4 group">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100/10 dark:border-blue-500/10 mt-0.5 shadow-xs">
                  <MapPin className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Address
                  </h4>
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mt-0.5 leading-relaxed">
                    {storeInfo.address}
                  </p>
                </div>
              </div>

              {/* Telephone & Comms */}
              <div className="flex items-start gap-4 group">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100/10 dark:border-blue-500/10 mt-0.5 shadow-xs">
                  <Phone className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Call Us
                  </h4>
                  <a
                    href={`tel:${storeInfo.phone.replace(/\s+/g, "")}`}
                    className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mt-0.5 block"
                  >
                    {storeInfo.phone}
                  </a>
                </div>
              </div>

              {/* Email Support */}
              <div className="flex items-start gap-4 group">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100/10 dark:border-blue-500/10 mt-0.5 shadow-xs">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Email
                  </h4>
                  <a
                    href={`mailto:${storeInfo.email}`}
                    className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mt-0.5 block"
                  >
                    {storeInfo.email}
                  </a>
                </div>
              </div>

              {/* Opening Hours */}
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border border-blue-100/10 dark:border-blue-500/10 mt-0.5 shadow-xs">
                  <Clock className="h-4.5 w-4.5" />
                </div>
                <div className="w-full">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Store Hours
                  </h4>
                  <div className="mt-1.5 space-y-1.5">
                    {storeInfo.hours.map((hour, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-xs sm:text-sm text-neutral-800 dark:text-neutral-200"
                      >
                        <span className="text-neutral-500 dark:text-neutral-450 font-medium">
                          {hour.days}
                        </span>
                        <span className="font-semibold text-right">
                          {hour.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action CTA Button */}
            <div className="pt-2 sm:pt-4">
              <a
                href={storeInfo.googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-6 h-11 transition-all shadow-md hover:scale-103 cursor-pointer gap-2 active:scale-98"
                style={{
                  boxShadow: "0 6px 20px -4px rgba(59, 130, 246, 0.4)",
                }}
              >
                Get Directions
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
