"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ShoppingBag, Search, User, X, LogIn } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useUiStore } from "@/store/use-ui-store";
import { Button } from "@/components/ui/button";
import StaggeredMenuComponent from "@/components/ui/StaggeredMenu/StaggeredMenu";
import SearchOverlay from "@/components/layout/search-overlay";
import { cn } from "@/lib/utils";
import { useSiteBranding } from "@/components/providers/site-branding-provider";
import { pbCategories, pbBrands } from "@/lib/pb-collections";
import { AuthModal } from "@/components/auth/auth-modal";
import { getCurrentUserSessionAction } from "@/app/actions/auth";

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
  const { logoUrl, siteName, announcement, isLoading } = useSiteBranding();
  const { cartCount } = useCart();
  const toggleCartDrawer = useUiStore((state) => state.toggleCartDrawer);
  const hasIntroPlayed = useUiStore((state) => state.hasIntroPlayed);
  const setIntroPlayed = useUiStore((state) => state.setIntroPlayed);
  const router = useRouter();

  const pathname = usePathname();
  const shouldPlayIntro = pathname === "/" && !hasIntroPlayed;

  const [isIntroActive, setIsIntroActive] = useState(shouldPlayIntro);
  const [showOverlay, setShowOverlay] = useState(shouldPlayIntro);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  const [announcementIdx, setAnnouncementIdx] = useState(0);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userAvatar, setUserAvatar] = useState("");
  const [authSuffix, setAuthSuffix] = useState("in");

  // Reactively detect auth state via non-httpOnly cookie (pb_auth_indicator)
  useEffect(() => {
    const check = async () => {
      const loggedIn = /(?:^|;\s*)pb_auth_indicator=1(?:;|$)/.test(document.cookie);
      setIsLoggedIn(loggedIn);
      
      if (loggedIn) {
        // Read avatar
        const avatarMatch = document.cookie.match(/pb_auth_avatar=([^;]+)/);
        setUserAvatar(avatarMatch ? decodeURIComponent(avatarMatch[1]) : "");
 
        // If avatar isn't cached but indicator is active, perform a quick fallback check for avatar url
        if (!avatarMatch) {
          try {
            const res = await getCurrentUserSessionAction();
            if (res.success && res.user && res.user.avatar) {
              setUserAvatar(res.user.avatar);
            }
          } catch {
            // Ignore
          }
        }
      } else {
        setUserAvatar("");
      }
    };
    void check();
    // Re-check on focus (tab switch) AND on custom auth-change (login/logout)
    window.addEventListener("focus", check);
    window.addEventListener("auth-change", check);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("auth-change", check);
    };
  }, []);

  // Interval to rotate the 'in' and 'up' text when not logged in
  useEffect(() => {
    if (isLoggedIn) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      setAuthSuffix((prev) => (prev === "in" ? "up" : "in"));
    }, 2500);

    return () => clearInterval(interval);
  }, [isLoggedIn]);

  useEffect(() => {
    async function fetchData() {
      const [catsResult, brsResult] = await Promise.allSettled([
        pbCategories.getAll(),
        pbBrands.getAll(),
      ]);

      if (catsResult.status === "fulfilled") {
        setCategories(
          (catsResult.value || []).filter((c: any) => c.isActive !== false),
        );
      } else {
        console.error("Failed to load navbar categories:", catsResult.reason);
      }

      if (brsResult.status === "fulfilled") {
        setBrands(brsResult.value || []);
      } else {
        console.error("Failed to load navbar brands:", brsResult.reason);
      }

      setDataLoaded(true);
    }
    void fetchData();
  }, []);

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

  const categorySubItems =
    categories.length > 0
      ? categories.map((c) => ({
          label: c.name,
          link: `/products?category=${c.slug}`,
        }))
      : !dataLoaded
        ? [
            { label: "Laptops", link: "/products/laptops" },
            { label: "Phones", link: "/products/phones" },
            { label: "Audio", link: "/products/audio" },
            { label: "Accessories", link: "/products/accessories" },
          ]
        : [];

  const brandSubItems =
    brands.length > 0
      ? brands.map((b) => ({ label: b.name, link: `/brands/${b.slug}` }))
      : !dataLoaded
        ? [
            { label: "Apple", link: "/brands/apple" },
            { label: "Samsung", link: "/brands/samsung" },
            { label: "Sony", link: "/brands/sony" },
            { label: "Bose", link: "/brands/bose" },
            { label: "Asus", link: "/brands/asus" },
          ]
        : [];

  const menuItems = [
    { label: "Home", link: "/" },
    {
      label: "Categories",
      link: "/products",
      subItems: categorySubItems,
    },
    {
      label: "Brands",
      link: "/products",
      subItems: brandSubItems,
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
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="relative text-blue-600"
                  >
                    FTC
                  </motion.span>
                  <motion.span
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="text-muted-foreground font-light"
                  >
                    |
                  </motion.span>
                  <motion.span
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
            {/* Account — profile avatar if logged in, icon if not */}
            <button
              type="button"
              onClick={() => {
                if (isLoggedIn) {
                  router.push("/account/profile");
                } else {
                  setIsAuthModalOpen(true);
                }
              }}
              className="transition-colors cursor-pointer p-1 rounded-full"
              aria-label={isLoggedIn ? "Open your account" : "Sign in or create an account"}
            >
              {isLoggedIn ? (
                userAvatar ? (
                  <Image
                    src={userAvatar}
                    alt="User Avatar"
                    width={32}
                    height={32}
                    unoptimized={!userAvatar.startsWith("http") && !userAvatar.startsWith("/")}
                    onError={() => setUserAvatar("")}
                    className="h-8 w-8 rounded-full object-cover shadow-md ring-2 ring-background hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center text-white select-none shadow-md ring-2 ring-background hover:scale-105 transition-transform duration-200">
                    <User className="h-4 w-4" />
                  </div>
                )
              ) : (
                <div aria-hidden="true" className="flex items-center text-xs font-extrabold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border border-border bg-secondary/20 gap-0.5 select-none h-8 min-w-[80px] justify-center relative overflow-hidden">
                  <span>Sign-</span>
                  <div className="relative h-4 w-6 flex items-center justify-start overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={authSuffix}
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -12, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="absolute text-blue-600 dark:text-blue-400 font-extrabold uppercase"
                      >
                        {authSuffix}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </button>

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
            {isIntroActive &&
              (logoUrl ? (
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
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 80, damping: 20 }}
                    className="text-blue-600"
                  >
                    FTC
                  </motion.span>
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className="text-muted-foreground font-light"
                  >
                    |
                  </motion.span>
                  <motion.span
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
              ))}
          </motion.div>
        )}
      </header>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode="signin"
      />
    </>
  );
}
