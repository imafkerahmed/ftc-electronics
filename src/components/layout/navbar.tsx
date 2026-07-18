"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ShoppingBag, Search, User, X } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useUiStore } from "@/store/use-ui-store";
import { Button } from "@/components/ui/button";
import StaggeredMenuComponent from "@/components/ui/StaggeredMenu/StaggeredMenu";
import SearchOverlay from "@/components/layout/search-overlay";
import { cn } from "@/lib/utils";
import { useSiteBranding } from "@/components/providers/site-branding-provider";

interface StaggeredMenuProps {
  position?: "left" | "right";
  colors?: string[];
  items?: {
    label: string;
    link: string;
    ariaLabel?: string;
    subItems?: { label: string; link: string; ariaLabel?: string }[];
  }[];
  socialItems?: { label: string; link: string }[];
  displaySocials?: boolean;
  displayItemNumbering?: boolean;
  className?: string;
  menuButtonColor?: string;
  openMenuButtonColor?: string;
  accentColor?: string;
  changeMenuColorOnOpen?: boolean;
  isFixed?: boolean;
  closeOnClickAway?: boolean;
  onMenuOpen?: () => void;
  onMenuClose?: () => void;
}

const StaggeredMenu = StaggeredMenuComponent as React.FC<StaggeredMenuProps>;

const defaultAnnouncements = [
  "🚀 Free Delivery on Orders Over LKR 10,000",
  "✨ 0% Interest Installments via Koko Pay — Shop Now",
  "🛡️ Official Manufacturer Warranty on All Products",
  "⚡ New Arrivals Weekly — Explore the Latest Drops",
];

export default function Navbar() {
  const { logoUrl, siteName, announcement } = useSiteBranding();
  const { cartCount } = useCart();
  const toggleCartDrawer = useUiStore((state) => state.toggleCartDrawer);
  const hasIntroPlayed = useUiStore((state) => state.hasIntroPlayed);
  const setIntroPlayed = useUiStore((state) => state.setIntroPlayed);

  const pathname = usePathname();
  const shouldPlayIntro = pathname === "/" && !hasIntroPlayed;

  const [isIntroActive, setIsIntroActive] = useState(shouldPlayIntro);
  const [showOverlay, setShowOverlay] = useState(shouldPlayIntro);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [announcementIdx, setAnnouncementIdx] = useState(0);

  const activeAnnouncements = announcement?.text
    ? [announcement.text, ...defaultAnnouncements]
    : defaultAnnouncements;

  useEffect(() => {
    if (shouldPlayIntro) {
      document.body.style.overflow = "hidden";

      const frame = requestAnimationFrame(() => {
        setIsIntroActive(true);
        setShowOverlay(true);
      });

      const timer1 = setTimeout(() => {
        setIsIntroActive(false);
        document.body.style.overflow = "";
        setIntroPlayed(true);
      }, 1500);

      const timer2 = setTimeout(() => {
        setShowOverlay(false);
      }, 2000);

      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer1);
        clearTimeout(timer2);
        document.body.style.overflow = "";
      };
    }
  }, [shouldPlayIntro, setIntroPlayed]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Cycle announcements
  useEffect(() => {
    const interval = setInterval(() => {
      setAnnouncementIdx((prev) => (prev + 1) % activeAnnouncements.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeAnnouncements.length]);

  const handleSearchClick = () => {
    setIsSearchOpen(true);
  };

  const menuItems = [
    { label: "Home", link: "/" },
    {
      label: "Categories",
      link: "/products",
      subItems: [
        { label: "Laptops", link: "/products/laptops" },
        { label: "Phones", link: "/products/phones" },
        { label: "Audio", link: "/products/audio" },
        { label: "Accessories", link: "/products/accessories" },
      ],
    },
    {
      label: "Brands",
      link: "/products",
      subItems: [
        { label: "Apple", link: "/brands/apple" },
        { label: "Samsung", link: "/brands/samsung" },
        { label: "Sony", link: "/brands/sony" },
        { label: "Bose", link: "/brands/bose" },
        { label: "Asus", link: "/brands/asus" },
      ],
    },
    { label: "On Sale", link: "/deals" },
    { label: "About", link: "/about" },
    { label: "Contact", link: "/contact" },
  ];

  return (
    <>
      {/* ── Announcement Banner ── */}
      <AnimatePresence>
        {showBanner && announcement?.show !== false && !isIntroActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ backgroundColor: announcement?.bgColor || undefined }}
            className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white text-xs font-semibold z-50 relative overflow-hidden"
          >
            <div className="relative flex items-center justify-center h-9 px-10">
              {/* Animated shimmer layer */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />

              {/* Cycling announcement text */}
              <AnimatePresence mode="wait">
                <motion.span
                  key={announcementIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className="flex items-center gap-2 tracking-wide text-center"
                >
                  {activeAnnouncements[announcementIdx]}
                </motion.span>
              </AnimatePresence>

              {/* Close button */}
              <button
                onClick={() => setShowBanner(false)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
                aria-label="Close banner"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Navigation Header ── */}
      <header
        className={cn(
          "sticky top-0 z-50 w-full border-b backdrop-blur-md transition-all duration-500",
          isIntroActive
            ? "border-transparent bg-transparent backdrop-blur-none"
            : isScrolled
              ? "border-border/80 bg-background/95 shadow-sm shadow-black/5"
              : "border-border/40 bg-background/80",
        )}
      >
        {/* Subtle bottom glow line when scrolled */}
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 h-[1px] transition-opacity duration-500",
            isScrolled ? "opacity-100" : "opacity-0",
          )}
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(59,130,246,0.4) 40%, rgba(99,102,241,0.4) 60%, transparent)",
          }}
        />

        <div className="relative flex h-16 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left Side: Menu + Search */}
          <motion.div
            initial={hasIntroPlayed ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: isIntroActive ? 0 : 1 }}
            transition={{
              duration: 0.8,
              ease: "easeOut",
              delay: isIntroActive ? 0 : 1.5,
            }}
            className="flex items-center pl-10 sm:pl-12 lg:pl-16"
          >
            <StaggeredMenu
              position="left"
              isFixed={true}
              className="z-[60]"
              menuButtonColor="#000"
              openMenuButtonColor="#000"
              accentColor="#3b82f6"
              colors={["#f3f4f6", "#3b82f6"]}
              items={menuItems}
              displayItemNumbering={false}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSearchClick}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 w-9 rounded-lg transition-all duration-200"
              aria-label="Open Search Overlay"
            >
              <Search className="h-5 w-5" />
            </Button>
          </motion.div>

          {/* Center: Brand Logo */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold tracking-wider text-foreground group"
            >
              {!isIntroActive && (
                <>
                  <motion.span
                    layoutId="brand-logo-ftc"
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="relative text-blue-600"
                  >
                    FTC
                  </motion.span>
                  <motion.span
                    layoutId="brand-logo-divider"
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="text-muted-foreground font-light"
                  >
                    |
                  </motion.span>
                  <motion.span
                    layoutId="brand-logo-electronics"
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="text-xs uppercase tracking-widest text-foreground/80"
                  >
                    Electronics
                  </motion.span>
                </>
              )}
            </Link>
          </div>

          {/* Right: Utility Icons */}
          <motion.div
            initial={hasIntroPlayed ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: isIntroActive ? 0 : 1 }}
            transition={{
              duration: 0.8,
              ease: "easeOut",
              delay: isIntroActive ? 0 : 1.5,
            }}
            className="flex items-center space-x-1 sm:space-x-2"
          >
            {/* Account */}
            <Link
              href="/account/profile"
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors p-2 rounded-lg"
              aria-label="User Account"
            >
              <User className="h-5 w-5" />
            </Link>

            {/* Cart */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCartDrawer}
              className="relative text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 w-9 rounded-lg"
              aria-label="Open Shopping Cart"
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-background"
                >
                  {/* Pulse ring */}
                  <span className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-60" />
                  <span className="relative z-10">{cartCount}</span>
                </motion.span>
              )}
            </Button>
          </motion.div>
        </div>

        {/* Search Overlay */}
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />

        {/* Cinematic Intro Overlay */}
        {showOverlay && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: isIntroActive ? 1 : 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background pointer-events-none"
          >
            {isIntroActive && (
              logoUrl ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 80, damping: 20 }}
                  className="flex flex-col items-center justify-center p-4"
                >
                  <img
                    src={logoUrl}
                    alt={siteName || "FTC Electronics"}
                    className="h-32 sm:h-44 lg:h-52 max-h-64 w-auto max-w-[85vw] object-contain drop-shadow-2xl"
                  />
                </motion.div>
              ) : (
                <div className="flex items-center gap-4 text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-widest uppercase">
                  <motion.span
                    layoutId="brand-logo-ftc"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="text-blue-600"
                  >
                    FTC
                  </motion.span>
                  <motion.span
                    layoutId="brand-logo-divider"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="text-muted-foreground font-light"
                  >
                    |
                  </motion.span>
                  <motion.span
                    layoutId="brand-logo-electronics"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 80,
                      damping: 20,
                      delay: 0.2,
                    }}
                    className="text-2xl uppercase tracking-widest text-foreground/80 font-bold"
                  >
                    Electronics
                  </motion.span>
                </div>
              )
            )}
          </motion.div>
        )}
      </header>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </>
  );
}
