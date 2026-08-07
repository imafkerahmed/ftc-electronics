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
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const hasIntroPlayed = useUiStore((state) => state.hasIntroPlayed);
  const setIntroPlayed = useUiStore((state) => state.setIntroPlayed);
  const router = useRouter();

  const pathname = usePathname();
  const shouldPlayIntro = pathname === "/" && !hasIntroPlayed && Boolean(logoUrl);

  const [isIntroActive, setIsIntroActive] = useState(shouldPlayIntro);
  const [showOverlay, setShowOverlay] = useState(shouldPlayIntro);
  const closeMobileNav = () => setMobileNavOpen(false);
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
    const NAV_CACHE_KEY = 'ftc_nav_data';
    const NAV_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    async function fetchData() {
      // Try sessionStorage cache first
      try {
        const raw = sessionStorage.getItem(NAV_CACHE_KEY);
        if (raw) {
          const { cats, brs, ts } = JSON.parse(raw) as { cats: any[]; brs: any[]; ts: number };
          if (Array.isArray(cats) && Array.isArray(brs) && Number.isFinite(ts) && Date.now() - ts < NAV_CACHE_TTL_MS) {
            setCategories(cats.filter((c: any) => c.isActive !== false));
            setBrands(brs);
            setDataLoaded(true);
            return;
          } else {
            sessionStorage.removeItem(NAV_CACHE_KEY);
          }
        }
      } catch {
        // ignore cache read error, fall through to fetch
      }

      // Cache miss — fetch from PocketBase
      const [catsResult, brsResult] = await Promise.allSettled([
        pbCategories.getAll(),
        pbBrands.getAll(),
      ]);

      const cats = catsResult.status === "fulfilled" ? (catsResult.value || []) : [];
      const brs = brsResult.status === "fulfilled" ? (brsResult.value || []) : [];

      if (catsResult.status === "fulfilled") {
        setCategories(cats.filter((c: any) => c.isActive !== false));
      } else {
        console.error("Failed to load navbar categories:", catsResult.reason);
      }

      if (brsResult.status === "fulfilled") {
        setBrands(brs);
      } else {
        console.error("Failed to load navbar brands:", brsResult.reason);
      }

      // Write to cache only when both fetches succeeded
      if (catsResult.status === "fulfilled" && brsResult.status === "fulfilled") {
        try {
          sessionStorage.setItem(NAV_CACHE_KEY, JSON.stringify({ cats, brs, ts: Date.now() }));
        } catch {
          // quota exceeded or unavailable — skip
        }
      }

      setDataLoaded(true);
    }
    void fetchData();
  }, []);

  const activeAnnouncements = announcement?.text
    ? [announcement.text, ...defaultAnnouncements]
    : defaultAnnouncements;

  useEffect(() => {
    if (!shouldPlayIntro) {
      setIsIntroActive(false);
      setShowOverlay(false);
      return;
    }

    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      setIsIntroActive(true);
      setShowOverlay(true);
    });

    const timer1 = setTimeout(() => {
      setIsIntroActive(false);
      document.body.style.overflow = "";
    }, 1500);

    const timer2 = setTimeout(() => {
      setShowOverlay(false);
      setIntroPlayed(true);
    }, 2000);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer1);
      clearTimeout(timer2);
      document.body.style.overflow = "";
    };
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
      ? brands.map((b) => ({
          label: b.name,
          link: `/products?brand=${b.slug}`,
        }))
      : !dataLoaded
        ? [
            { label: "Apple", link: "/products?brand=apple" },
            { label: "Samsung", link: "/products?brand=samsung" },
            { label: "Anker", link: "/products?brand=anker" },
            { label: "Asus", link: "/products?brand=asus" },
          ]
        : [];

  const navItems = [
    { label: "Home", link: "/" },
    {
      label: "Shop All",
      link: "/products",
    },
    {
      label: "Categories",
      link: "/categories",
      subItems: categorySubItems,
    },
    {
      label: "Brands",
      link: "/brands",
      subItems: brandSubItems,
    },
    { label: "Contact Us", link: "/contact" },
  ];

  return (
    <>
      {/* Dynamic Announcement Bar */}
      {showBanner && (
        <div className="bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-700 text-white text-xs font-semibold py-2 px-4 transition-all duration-300 relative z-50 shadow-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex-1 text-center truncate px-4">
              <AnimatePresence mode="wait">
                <motion.span
                  key={announcementIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="inline-block tracking-wide font-medium"
                >
                  {activeAnnouncements[announcementIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10 shrink-0"
              aria-label="Dismiss Announcement"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Glassmorphic Sticky Header */}
      <header
        className={cn(
          "sticky top-0 z-40 w-full transition-all duration-300 border-b border-border/40",
          isScrolled
            ? "bg-background/80 backdrop-blur-xl shadow-lg border-border/80"
            : "bg-background/95 backdrop-blur-md"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Menu & Search */}
          <div className="flex items-center space-x-1 sm:space-x-3">
            {/* React Bits StaggeredMenu Overlay Trigger */}
            <div className="relative flex items-center justify-center">
              <StaggeredMenu
                position="left"
                items={navItems}
                displaySocials={true}
                displayItemNumbering={true}
                closeOnClickAway={true}
                menuButtonColor="#3b82f6"
                openMenuButtonColor="#ef4444"
                accentColor="#3b82f6"
                onMenuOpen={() => setMobileNavOpen(true)}
                onMenuClose={closeMobileNav}
              />
            </div>

            {/* Quick Search Trigger */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSearchClick}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 w-9 rounded-lg"
              aria-label="Search Products"
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>

          {/* Center: Brand Logo / Title */}
          <div className="flex-1 flex justify-center items-center">
            <Link
              href="/"
              onClick={closeMobileNav}
              className="flex items-center gap-1.5 sm:gap-2 text-xl font-bold tracking-wider text-foreground group select-none"
            >
              {!isIntroActive && (
                <>
                  {logoUrl ? (
                    <Image
                      src={logoUrl}
                      alt={siteName || "FTC Electronics"}
                      width={160}
                      height={40}
                      unoptimized={logoUrl.startsWith("http")}
                      className="h-7 sm:h-9 w-auto max-w-[140px] sm:max-w-[180px] object-contain drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <>
                      <span className="relative text-blue-600 font-black text-xl sm:text-2xl">
                        FTC
                      </span>
                      <span className="text-muted-foreground font-light hidden sm:inline-block">
                        |
                      </span>
                      <span className="text-xs uppercase tracking-widest text-foreground/80 hidden sm:inline-block">
                        Electronics
                      </span>
                    </>
                  )}
                </>
              )}
            </Link>
          </div>

          {/* Right: Utility Icons */}
          <div className="flex items-center space-x-1 sm:space-x-2">
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
                    unoptimized={userAvatar.startsWith("http")}
                    onError={() => setUserAvatar("")}
                    className="h-8 w-8 rounded-full object-cover shadow-md ring-2 ring-background hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center text-white select-none shadow-md ring-2 ring-background hover:scale-105 transition-transform duration-200">
                    <User className="h-4 w-4" />
                  </div>
                )
              ) : (
                <>
                  {/* Mobile View (< sm): Compact User Icon */}
                  <div className="sm:hidden flex items-center justify-center h-8 w-8 rounded-full border border-border bg-secondary/20 text-muted-foreground hover:text-foreground">
                    <User className="h-4 w-4" />
                  </div>

                  {/* Desktop / Tablet View (>= sm): Animated Sign-IN Pill */}
                  <div aria-hidden="true" className="hidden sm:flex items-center text-xs font-extrabold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-full border border-border bg-secondary/20 gap-0.5 select-none h-8 min-w-[80px] justify-center relative overflow-hidden">
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
                </>
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
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-background"
                >
                  {/* Pulse ring */}
                  <span className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-60" />
                  <span className="relative z-10">{cartCount}</span>
                </motion.span>
              )}
            </Button>
          </div>
        </div>

        {/* Search Overlay */}
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />

        {/* Cinematic Intro Overlay — Only plays if custom logoUrl is configured */}
        {showOverlay && logoUrl && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: isIntroActive ? 1 : 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background pointer-events-none"
          >
            {isIntroActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 80, damping: 20 }}
                className="flex flex-col items-center justify-center p-4"
              >
                <Image
                  src={logoUrl}
                  alt={siteName || "FTC Electronics"}
                  width={256}
                  height={256}
                  unoptimized={logoUrl.startsWith("http")}
                  className="h-32 sm:h-44 lg:h-52 max-h-64 w-auto max-w-[85vw] object-contain drop-shadow-2xl"
                />
              </motion.div>
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

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode="signin"
      />
    </>
  );
}
