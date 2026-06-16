"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ShoppingBag, Search, User } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useUiStore } from "@/store/use-ui-store";
import { Button } from "@/components/ui/button";
import StaggeredMenuComponent from "@/components/ui/StaggeredMenu/StaggeredMenu";
import SearchOverlay from "@/components/layout/search-overlay";
import { cn } from "@/lib/utils";

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

export default function Navbar() {
  const { cartCount } = useCart();
  const toggleCartDrawer = useUiStore((state) => state.toggleCartDrawer);
  const hasIntroPlayed = useUiStore((state) => state.hasIntroPlayed);
  const setIntroPlayed = useUiStore((state) => state.setIntroPlayed);

  const pathname = usePathname();
  const shouldPlayIntro = pathname === "/" && !hasIntroPlayed;

  const [isIntroActive, setIsIntroActive] = useState(shouldPlayIntro);
  const [showOverlay, setShowOverlay] = useState(shouldPlayIntro);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTriggerRect, setSearchTriggerRect] = useState<DOMRect | null>(
    null,
  );

  useEffect(() => {
    if (shouldPlayIntro) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsIntroActive(true);
      setShowOverlay(true);
      document.body.style.overflow = "hidden";

      const timer1 = setTimeout(() => {
        setIsIntroActive(false);
        document.body.style.overflow = "";
        setIntroPlayed(true);
      }, 1500);

      const timer2 = setTimeout(() => {
        setShowOverlay(false);
      }, 2000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        document.body.style.overflow = "";
      };
    }
  }, [shouldPlayIntro, setIntroPlayed]);

  const handleSearchClick = (e: React.MouseEvent<HTMLElement>) => {
    setSearchTriggerRect(e.currentTarget.getBoundingClientRect());
    setIsSearchOpen(true);
  };

  const menuItems = [
    { label: "Home", link: "/" },
    {
      label: "Shop All",
      link: "/products",
      subItems: [
        { label: "Laptops", link: "/products?category=laptops" },
        { label: "Phones", link: "/products?category=phones" },
        { label: "Audio", link: "/products?category=audio" },
        { label: "Accessories", link: "/coming-soon" },
      ],
    },
    {
      label: "Brands",
      link: "/products?filter=brands",
      subItems: [
        { label: "Apple", link: "/products?brand=apple" },
        { label: "Samsung", link: "/products?brand=samsung" },
        { label: "Sony", link: "/products?brand=sony" },
        { label: "Bose", link: "/products?brand=bose" },
        { label: "Asus", link: "/products?brand=asus" },
      ],
    },
    { label: "On Sale", link: "/products?filter=on-sale" },
    { label: "About", link: "/coming-soon" },
    { label: "Contact", link: "/coming-soon" },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b backdrop-blur-md transition-colors duration-1000",
        isIntroActive
          ? "border-transparent bg-transparent backdrop-blur-none"
          : "border-border bg-background/80 backdrop-blur-md",
      )}
    >
      <div className="relative flex h-16 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left Side: Staggered Menu Component & Search Icon Button */}
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
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 w-9 rounded-lg"
            aria-label="Open Search Overlay"
          >
            <Search className="h-5 w-5" />
          </Button>
        </motion.div>

        {/* Brand Logo - Centered absolutely */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-bold tracking-wider text-foreground"
          >
            {!isIntroActive && (
              <>
                <motion.span
                  layoutId="brand-logo-ftc"
                  transition={{ type: "spring", stiffness: 80, damping: 20 }}
                  className="text-blue-600"
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

        {/* Right side utility icons */}
        <motion.div
          initial={hasIntroPlayed ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: isIntroActive ? 0 : 1 }}
          transition={{
            duration: 0.8,
            ease: "easeOut",
            delay: isIntroActive ? 0 : 1.5,
          }}
          className="flex items-center space-x-2 sm:space-x-3"
        >
          {/* Account portal Link */}
          <Link
            href="/account/profile"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors p-2 rounded-lg"
            aria-label="User Account"
          >
            <User className="h-5 w-5" />
          </Link>

          {/* Cart triggers Zustand Cart Slider Drawer */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCartDrawer}
            className="relative text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 w-9 rounded-lg"
            aria-label="Open Shopping Cart"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white ring-2 ring-background">
                {cartCount}
              </span>
            )}
          </Button>
        </motion.div>
      </div>

      {/* Concept 1 Circular Zoom Search Overlay */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        triggerRect={searchTriggerRect}
      />

      {/* Cinematic Logo Preloader Overlay */}
      {showOverlay && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: isIntroActive ? 1 : 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background pointer-events-none"
        >
          {isIntroActive && (
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
          )}
        </motion.div>
      )}
    </header>
  );
}
