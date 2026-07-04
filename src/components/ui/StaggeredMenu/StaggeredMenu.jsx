import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ArrowLeft } from "lucide-react";
import "./StaggeredMenu.css";

export const StaggeredMenu = ({
  position = "right",
  colors = ["#B497CF", "#5227FF"],
  items = [],
  socialItems = [],
  displaySocials = true,
  displayItemNumbering = true,
  className,
  menuButtonColor = "#000",
  openMenuButtonColor = "#000",
  accentColor = "#3b82f6",
  changeMenuColorOnOpen = true,
  isFixed = false,
  closeOnClickAway = true,
  onMenuOpen = () => {},
  onMenuClose = () => {},
}) => {
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [currentView, setCurrentView] = useState({
    type: "main",
    activeItem: null,
  });
  const panelRef = useRef(null);
  const preLayersRef = useRef(null);
  const preLayerElsRef = useRef([]);
  const openTlRef = useRef(null);
  const closeTweenRef = useRef(null);
  const colorTweenRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const menuBusyRef = useRef(false);
  const transitionBusyRef = useRef(false);
  const itemEntranceTweenRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;
      if (!panel) return;

      let preLayers = [];
      if (preContainer) {
        preLayers = Array.from(preContainer.querySelectorAll(".sm-prelayer"));
      }
      preLayerElsRef.current = preLayers;

      const offscreen = position === "left" ? -100 : 100;
      gsap.set([panel, ...preLayers], { xPercent: offscreen, opacity: 1 });
      if (preContainer) {
        gsap.set(preContainer, { xPercent: 0, opacity: 1 });
      }
      if (toggleBtnRef.current)
        gsap.set(toggleBtnRef.current, { color: menuButtonColor });
    });
    return () => ctx.revert();
  }, [menuButtonColor, position]);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return null;

    openTlRef.current?.kill();
    if (closeTweenRef.current) {
      closeTweenRef.current.kill();
      closeTweenRef.current = null;
    }
    itemEntranceTweenRef.current?.kill();

    const itemEls = Array.from(panel.querySelectorAll(".sm-panel-itemLabel"));
    const numberEls = Array.from(
      panel.querySelectorAll(".sm-panel-list[data-numbering] .sm-panel-item"),
    );
    const socialTitle = panel.querySelector(".sm-socials-title");
    const socialLinks = Array.from(panel.querySelectorAll(".sm-socials-link"));

    const offscreen = position === "left" ? -100 : 100;
    const layerStates = layers.map((el) => ({ el, start: offscreen }));
    const panelStart = offscreen;

    if (itemEls.length) {
      gsap.set(itemEls, { yPercent: 140, rotate: 10 });
    }
    if (numberEls.length) {
      gsap.set(numberEls, { "--sm-num-opacity": 0 });
    }
    if (socialTitle) {
      gsap.set(socialTitle, { opacity: 0 });
    }
    if (socialLinks.length) {
      gsap.set(socialLinks, { y: 25, opacity: 0 });
    }

    const tl = gsap.timeline({ paused: true });

    layerStates.forEach((ls, i) => {
      tl.fromTo(
        ls.el,
        { xPercent: ls.start },
        { xPercent: 0, duration: 0.5, ease: "power4.out" },
        i * 0.07,
      );
    });
    const lastTime = layerStates.length ? (layerStates.length - 1) * 0.07 : 0;
    const panelInsertTime = lastTime + (layerStates.length ? 0.08 : 0);
    const panelDuration = 0.65;
    tl.fromTo(
      panel,
      { xPercent: panelStart },
      { xPercent: 0, duration: panelDuration, ease: "power4.out" },
      panelInsertTime,
    );

    if (itemEls.length) {
      const itemsStartRatio = 0.15;
      const itemsStart = panelInsertTime + panelDuration * itemsStartRatio;
      tl.to(
        itemEls,
        {
          yPercent: 0,
          rotate: 0,
          duration: 1,
          ease: "power4.out",
          stagger: { each: 0.1, from: "start" },
        },
        itemsStart,
      );
      if (numberEls.length) {
        tl.to(
          numberEls,
          {
            duration: 0.6,
            ease: "power2.out",
            "--sm-num-opacity": 1,
            stagger: { each: 0.08, from: "start" },
          },
          itemsStart + 0.1,
        );
      }
    }

    if (socialTitle || socialLinks.length) {
      const socialsStart = panelInsertTime + panelDuration * 0.4;
      if (socialTitle) {
        tl.to(
          socialTitle,
          {
            opacity: 1,
            duration: 0.5,
            ease: "power2.out",
          },
          socialsStart,
        );
      }
      if (socialLinks.length) {
        tl.to(
          socialLinks,
          {
            y: 0,
            opacity: 1,
            duration: 0.55,
            ease: "power3.out",
            stagger: { each: 0.08, from: "start" },
            onComplete: () => {
              gsap.set(socialLinks, { clearProps: "opacity" });
            },
          },
          socialsStart + 0.04,
        );
      }
    }

    openTlRef.current = tl;
    return tl;
  }, [position]);

  const playOpen = useCallback(() => {
    if (menuBusyRef.current) return;
    menuBusyRef.current = true;
    const tl = buildOpenTimeline();
    if (tl) {
      tl.eventCallback("onComplete", () => {
        menuBusyRef.current = false;
      });
      tl.play(0);
    } else {
      menuBusyRef.current = false;
    }
  }, [buildOpenTimeline]);

  const playClose = useCallback(() => {
    openTlRef.current?.kill();
    openTlRef.current = null;
    itemEntranceTweenRef.current?.kill();

    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return;

    const all = [...layers, panel];
    closeTweenRef.current?.kill();
    const offscreen = position === "left" ? -100 : 100;
    closeTweenRef.current = gsap.to(all, {
      xPercent: offscreen,
      duration: 0.32,
      ease: "power3.in",
      overwrite: "auto",
      onComplete: () => {
        const itemEls = Array.from(
          panel.querySelectorAll(".sm-panel-itemLabel"),
        );
        if (itemEls.length) {
          gsap.set(itemEls, { yPercent: 140, rotate: 10 });
        }
        const numberEls = Array.from(
          panel.querySelectorAll(
            ".sm-panel-list[data-numbering] .sm-panel-item",
          ),
        );
        if (numberEls.length) {
          gsap.set(numberEls, { "--sm-num-opacity": 0 });
        }
        const socialTitle = panel.querySelector(".sm-socials-title");
        const socialLinks = Array.from(
          panel.querySelectorAll(".sm-socials-link"),
        );
        if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
        if (socialLinks.length) gsap.set(socialLinks, { y: 25, opacity: 0 });
        menuBusyRef.current = false;
        transitionBusyRef.current = false;
      },
    });
  }, [position]);

  const animateColor = useCallback(
    (opening) => {
      const btn = toggleBtnRef.current;
      if (!btn) return;
      colorTweenRef.current?.kill();
      if (changeMenuColorOnOpen) {
        const targetColor = opening ? openMenuButtonColor : menuButtonColor;
        colorTweenRef.current = gsap.to(btn, {
          color: targetColor,
          delay: 0.18,
          duration: 0.3,
          ease: "power2.out",
        });
      } else {
        gsap.set(btn, { color: menuButtonColor });
      }
    },
    [openMenuButtonColor, menuButtonColor, changeMenuColorOnOpen],
  );

  React.useEffect(() => {
    if (toggleBtnRef.current) {
      if (changeMenuColorOnOpen) {
        const targetColor = openRef.current
          ? openMenuButtonColor
          : menuButtonColor;
        gsap.set(toggleBtnRef.current, { color: targetColor });
      } else {
        gsap.set(toggleBtnRef.current, { color: menuButtonColor });
      }
    }
  }, [changeMenuColorOnOpen, menuButtonColor, openMenuButtonColor]);

  const transitionToView = useCallback((targetView) => {
    if (transitionBusyRef.current) return;
    transitionBusyRef.current = true;

    const panel = panelRef.current;
    if (!panel) {
      transitionBusyRef.current = false;
      return;
    }

    const labels = Array.from(panel.querySelectorAll(".sm-panel-itemLabel"));

    gsap.to(labels, {
      yPercent: -140,
      rotate: -5,
      opacity: 0,
      duration: 0.3,
      ease: "power3.in",
      stagger: { each: 0.03, from: "start" },
      onComplete: () => {
        setCurrentView(targetView);

        setTimeout(() => {
          const newLabels = Array.from(
            panel.querySelectorAll(".sm-panel-itemLabel"),
          );

          gsap.set(newLabels, { yPercent: 140, rotate: 5, opacity: 0 });

          gsap.to(newLabels, {
            yPercent: 0,
            rotate: 0,
            opacity: 1,
            duration: 0.5,
            ease: "power4.out",
            stagger: { each: 0.04, from: "start" },
            onComplete: () => {
              transitionBusyRef.current = false;
            },
          });
        }, 30);
      },
    });
  }, []);

  const toggleMenu = useCallback(() => {
    const target = !openRef.current;
    openRef.current = target;
    setOpen(target);
    if (target) {
      onMenuOpen?.();
      playOpen();
    } else {
      onMenuClose?.();
      playClose();
    }
    animateColor(target);
  }, [playOpen, playClose, animateColor, onMenuOpen, onMenuClose]);

  const closeMenu = useCallback(() => {
    if (openRef.current) {
      openRef.current = false;
      setOpen(false);
      onMenuClose?.();
      playClose();
      animateColor(false);
      setTimeout(() => {
        setCurrentView({ type: "main", activeItem: null });
      }, 400);
    }
  }, [playClose, animateColor, onMenuClose]);

  React.useEffect(() => {
    if (!closeOnClickAway || !open) return;

    const handleClickOutside = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(event.target)
      ) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [closeOnClickAway, open, closeMenu]);

  const handleItemClick = useCallback(
    (e, it) => {
      if (it.isBack) {
        e.preventDefault();
        transitionToView({ type: "main", activeItem: null });
        return;
      }

      if (it.subItems && it.subItems.length > 0) {
        e.preventDefault();
        transitionToView({ type: "submenu", activeItem: it });
        return;
      }

      closeMenu();
    },
    [transitionToView, closeMenu],
  );

  const activeItemsList =
    currentView.type === "main"
      ? items
      : currentView.activeItem?.subItems || [];

  const renderList = [];
  if (currentView.type === "submenu") {
    renderList.push({
      label: "← Back",
      link: "#",
      isBack: true,
    });
  }
  renderList.push(...activeItemsList);

  return (
    <div
      className={
        (className ? className + " " : "") +
        "staggered-menu-wrapper" +
        (isFixed ? " fixed-wrapper" : "")
      }
      style={accentColor ? { ["--sm-accent"]: accentColor } : undefined}
      data-position={position}
      data-open={open || undefined}
    >
      <div ref={preLayersRef} className="sm-prelayers" aria-hidden="true">
        {(() => {
          const raw =
            colors && colors.length
              ? colors.slice(0, 4)
              : ["#1e1e22", "#35353c"];
          let arr = [...raw];
          if (arr.length >= 3) {
            const mid = Math.floor(arr.length / 2);
            arr.splice(mid, 1);
          }
          return arr.map((c, i) => (
            <div key={i} className="sm-prelayer" style={{ background: c }} />
          ));
        })()}
      </div>
      <header
        className="staggered-menu-header"
        aria-label="Main navigation header"
      >
        <button
          ref={toggleBtnRef}
          className="sm-toggle hamburger-toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="staggered-menu-panel"
          onClick={toggleMenu}
          type="button"
        >
          <span className="hamburger-line line-top" />
          <span className="hamburger-line line-mid" />
          <span className="hamburger-line line-bot" />
        </button>
      </header>      <aside
        id="staggered-menu-panel"
        ref={panelRef}
        className="staggered-menu-panel"
        aria-hidden={!open}
        data-lenis-prevent
      >
        <div className="sm-panel-inner text-foreground dark:text-white relative flex flex-col h-full z-10">
          {/* Ambient background glassmorphic radial mesh */}
          <div className="sm-mesh-container">
            <div className="sm-glow-orb orb-1" />
            <div className="sm-glow-orb orb-2" />
          </div>

          <ul
            className="sm-panel-list relative z-10"
            role="list"
            data-numbering={displayItemNumbering || undefined}
          >
            {renderList.length ? (
              renderList.map((it, idx) => {
                if (it.isBack) {
                  return (
                    <li className="mb-4 sm-panel-itemWrap border-none!" key="back-button">
                      <Link
                        className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/80 transition-all duration-300 shadow-xs cursor-pointer"
                        href={it.link}
                        // eslint-disable-next-line react-hooks/refs
                        onClick={(e) => handleItemClick(e, it)}
                        aria-label="Go Back"
                      >
                        <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1" />
                        <span>Back</span>
                      </Link>
                    </li>
                  );
                }
                return (
                  <li
                    className="sm-panel-itemWrap"
                    key={it.label + idx}
                  >
                    <Link
                      className="sm-panel-item"
                      href={it.link}
                      onClick={(e) => handleItemClick(e, it)}
                      aria-label={it.ariaLabel}
                      data-index={idx + 1}
                    >
                      <span className="sm-panel-itemLabel">{it.label}</span>
                    </Link>
                  </li>
                );
              })
            ) : (
              <li className="sm-panel-itemWrap" aria-hidden="true">
                <span className="sm-panel-item">
                  <span className="sm-panel-itemLabel">No items</span>
                </span>
              </li>
            )}
          </ul>

          {/* Join the Club Newsletter widget */}
          <div className="mt-8 mb-4 relative z-10 border-t border-neutral-200/50 dark:border-neutral-800/40 pt-6">
            <h4 className="text-[10px] uppercase tracking-widest font-black text-neutral-400 dark:text-neutral-500 mb-2">
              Join the Club
            </h4>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed max-w-[280px]">
              Subscribe to get special offers, early access to new releases, and authorized discount alerts.
            </p>
            <div className="flex gap-2 w-full max-w-[280px]">
              <input
                type="email"
                placeholder="email@example.com"
                className="flex-grow px-3 py-2 rounded-lg text-xs bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-foreground dark:text-white font-medium"
              />
              <button className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-bold uppercase tracking-wider cursor-pointer">
                Join
              </button>
            </div>
          </div>

          {/* Flagship Store Location & Hours panel */}
          <div className="grid grid-cols-2 gap-4 mt-4 mb-6 pt-6 border-t border-neutral-200/50 dark:border-neutral-800/40 relative z-10">
            <div>
              <h5 className="text-[9px] uppercase tracking-widest font-black text-neutral-400 dark:text-neutral-500 mb-1.5">
                Flagship Store
              </h5>
              <p className="text-[10px] text-muted-foreground leading-normal font-medium">
                120 Galle Road<br />
                Colombo 03,<br />
                Sri Lanka
              </p>
            </div>
            <div>
              <h5 className="text-[9px] uppercase tracking-widest font-black text-neutral-400 dark:text-neutral-500 mb-1.5">
                Store Hours
              </h5>
              <p className="text-[10px] text-muted-foreground leading-normal font-medium">
                Mon - Sat: 9am - 8pm<br />
                Sun: 10am - 5pm
              </p>
            </div>
          </div>
          
          {displaySocials && socialItems && socialItems.length > 0 && (
            <div className="sm-socials relative z-10 mb-4" aria-label="Social links">
              <h3 className="sm-socials-title">Socials</h3>
              <ul className="sm-socials-list" role="list">
                {socialItems.map((s, i) => (
                  <li key={s.label + i} className="sm-socials-item">
                    <a
                      href={s.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sm-socials-link"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default StaggeredMenu;
