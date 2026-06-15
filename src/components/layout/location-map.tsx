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
      style={{ backgroundColor: "#f4f4f5" }}
      className="w-full border-b border-neutral-200 py-16 sm:py-24 relative z-10 overflow-hidden text-neutral-900"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Interactive Map */}
          <div className="lg:col-span-7 relative h-[350px] sm:h-[400px]">
            <div className="w-full h-full rounded-2xl overflow-hidden border border-neutral-200 bg-white shadow-xs relative">
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
          <div className="lg:col-span-5 flex flex-col justify-center space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 uppercase leading-snug">
                FTC{" "}
                <span className="text-blue-600">
                  Experience Center
                </span>
              </h2>
            </div>

            {/* Details List */}
            <div className="space-y-4 pt-2">
              {/* Address */}
              <div className="flex items-start gap-3.5 group">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 mt-0.5">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    Address
                  </h4>
                  <p className="text-sm font-semibold text-neutral-800 mt-0.5 leading-relaxed">
                    {storeInfo.address}
                  </p>
                </div>
              </div>

              {/* Telephone & Comms */}
              <div className="flex items-start gap-3.5 group">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 mt-0.5">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    Call Us
                  </h4>
                  <a
                    href={`tel:${storeInfo.phone.replace(/\s+/g, "")}`}
                    className="text-sm font-semibold text-neutral-800 hover:text-blue-600 transition-colors mt-0.5 block"
                  >
                    {storeInfo.phone}
                  </a>
                </div>
              </div>

              {/* Email Support */}
              <div className="flex items-start gap-3.5 group">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 mt-0.5">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    Email
                  </h4>
                  <a
                    href={`mailto:${storeInfo.email}`}
                    className="text-sm font-semibold text-neutral-800 hover:text-blue-600 transition-colors mt-0.5 block"
                  >
                    {storeInfo.email}
                  </a>
                </div>
              </div>

              {/* Opening Hours */}
              <div className="flex items-start gap-3.5">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 mt-0.5">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="w-full">
                  <h4 className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    Store Hours
                  </h4>
                  <div className="mt-1.5 space-y-1">
                    {storeInfo.hours.map((hour, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between text-xs sm:text-sm text-neutral-800"
                      >
                        <span className="text-neutral-500">
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
            <div className="pt-4">
              <a
                href={storeInfo.googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 h-11 transition-all shadow-sm hover:shadow-md cursor-pointer gap-2 active:translate-y-px"
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
