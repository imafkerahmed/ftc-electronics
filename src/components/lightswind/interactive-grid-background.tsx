"use client";

import React, { useEffect, useRef, useState } from "react";

export interface InteractiveGridBackgroundProps
  extends React.HTMLProps<HTMLDivElement> {
  gridSize?: number;
  gridColor?: string;
  darkGridColor?: string;
  effectColor?: string;
  darkEffectColor?: string;
  trailLength?: number;
  width?: number;
  height?: number;
  idleSpeed?: number;
  glow?: boolean;
  glowRadius?: number;
  children?: React.ReactNode;
  showFade?: boolean;
  fadeIntensity?: number;
  fadeColor?: string;
  idleRandomCount?: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseToRgb(color: string): Rgb {
  if (!color) {
    return { r: 0, g: 0, b: 0 };
  }
  
  if (color.startsWith("rgba") || color.startsWith("rgb")) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      return {
        r: parseInt(matches[0], 10),
        g: parseInt(matches[1], 10),
        b: parseInt(matches[2], 10)
      };
    }
  }
  
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    let r = 0;
    let g = 0;
    let b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    return { r, g, b };
  }

  return { r: 0, g: 0, b: 0 };
}

function convertToRgba(color: string, alpha: number): string {
  if (!color) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  
  if (color.startsWith("rgba")) {
    return color.replace(/[\d.]+\)$/g, `${alpha})`);
  }
  
  if (color.startsWith("rgb")) {
    return color.replace("rgb", "rgba").replace(")", `, ${alpha})`);
  }
  
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    let r = 0;
    let g = 0;
    let b = 0;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return color;
}

export default function InteractiveGridBackground({
  gridSize = 50,
  gridColor = "#cbcbcb",
  darkGridColor = "#303030",
  effectColor = "rgba(23, 62, 255, 0.25)",
  darkEffectColor = "rgba(23, 62, 255, 0.25)",
  trailLength = 3,
  width,
  height,
  idleSpeed = 0.2,
  glow = true,
  glowRadius = 20,
  children,
  showFade = true,
  fadeIntensity = 20,
  fadeColor = "bg-white dark:bg-black",
  idleRandomCount = 5,
  className,
  ...props
}: InteractiveGridBackgroundProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [themeColor, setThemeColor] = useState("");
  const [themeColor2, setThemeColor2] = useState("");

  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const idleTargetsRef = useRef<{ x: number; y: number }[]>([]);
  const idlePositionsRef = useRef<{ x: number; y: number }[]>([]);
  const mouseActiveRef = useRef(false);
  const lastMouseTimeRef = useRef(0);
  const isVisibleRef = useRef(true);

  // Detect dark mode and custom theme colors
  useEffect(() => {
    function updateTheme() {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
      const style = getComputedStyle(document.documentElement);
      setThemeColor(style.getPropertyValue("--island-color").trim());
      setThemeColor2(style.getPropertyValue("--island-color-2").trim());
    }
    updateTheme();
    const observer = new MutationObserver(() => updateTheme());
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Mouse tracking with cached bounding rect to prevent layout thrashing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rect = container.getBoundingClientRect();
    let docLeft = rect.left + window.scrollX;
    let docTop = rect.top + window.scrollY;

    function updateRect() {
      if (!container) return;
      const r = container.getBoundingClientRect();
      rect = r;
      docLeft = r.left + window.scrollX;
      docTop = r.top + window.scrollY;
    }

    function handleMouseMove(e: MouseEvent) {
      mouseActiveRef.current = true;
      lastMouseTimeRef.current = Date.now();

      const rawX = e.pageX - docLeft;
      const rawY = e.pageY - docTop;

      if (rawX < 0 || rawY < 0 || rawX > rect.width || rawY > rect.height) {
        return;
      }

      const snappedX = Math.floor(rawX / gridSize);
      const snappedY = Math.floor(rawY / gridSize);

      const last = trailRef.current[0];
      if (!last || last.x !== snappedX || last.y !== snappedY) {
        trailRef.current.unshift({ x: snappedX, y: snappedY });
        if (trailRef.current.length > trailLength) {
          trailRef.current.pop();
        }
      }
    }

    function handleMouseEnter() {
      updateRect();
    }

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseEnter);
    window.addEventListener("resize", updateRect);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      window.removeEventListener("resize", updateRect);
    };
  }, [gridSize, trailLength]);

  // Drawing, Resizing, and Viewport-visibility logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let canvasWidth = width || window.innerWidth;
    let canvasHeight = height || window.innerHeight;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        canvasWidth = width || w;
        canvasHeight = height || h;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    let lineColor = isDarkMode ? darkGridColor : gridColor;
    let glowColorStr = isDarkMode ? darkEffectColor : effectColor;

    if (themeColor) {
      lineColor = convertToRgba(themeColor, isDarkMode ? 0.15 : 0.1);
      // Map Midnight theme color (#0f172a) to bright brand blue (#173eff) for highlights
      const targetGlowColor = themeColor === "#0f172a" ? "#173eff" : (themeColor2 || themeColor);
      glowColorStr = convertToRgba(targetGlowColor, isDarkMode ? 0.25 : 0.25);
    }

    // Pre-parse glow color channels once outside the loop to avoid CPU-intensive regex inside requestAnimationFrame
    const rgbGlow = parseToRgb(glowColorStr);

    const cols = Math.floor(canvasWidth / gridSize);
    const rows = Math.floor(canvasHeight / gridSize);

    // Initialize idle positions
    idleTargetsRef.current = Array.from({ length: idleRandomCount }, () => ({
      x: Math.floor(Math.random() * cols),
      y: Math.floor(Math.random() * rows),
    }));
    idlePositionsRef.current = idleTargetsRef.current.map((p) => ({ ...p }));

    let animationId: number;
    let running = true;
    let lastTime = performance.now();

    function draw() {
      if (!ctx || !running || !isVisibleRef.current) return;

      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Frame-rate independent LERP factor calculation using deltaTime
      // At 60Hz, dt = 0.016s -> factor = idleSpeed
      // At 144Hz, dt = 0.007s -> factor adjusts smoothly so speeds match perfectly
      const lerpFactor = 1 - Math.pow(1 - idleSpeed, dt * 60);

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Draw grid lines — batched into 2 paths instead of N individual stroke calls
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= canvasWidth; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
      }
      for (let y = 0; y <= canvasHeight; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
      }
      ctx.stroke();

      // Idle animation logic
      const idleThreshold = 2000;
      const currentCols = Math.floor(canvasWidth / gridSize);
      const currentRows = Math.floor(canvasHeight / gridSize);

      if (Date.now() - lastMouseTimeRef.current > idleThreshold) {
        mouseActiveRef.current = false;

        idlePositionsRef.current.forEach((pos, i) => {
          const target = idleTargetsRef.current[i];
          if (!target) return;
          const dx = target.x - pos.x;
          const dy = target.y - pos.y;

          if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
            // Pick a new target when reached
            idleTargetsRef.current[i] = {
              x: Math.floor(Math.random() * currentCols),
              y: Math.floor(Math.random() * currentRows),
            };
          } else {
            pos.x += dx * lerpFactor;
            pos.y += dy * lerpFactor;
          }

          const roundedX = Math.round(pos.x);
          const roundedY = Math.round(pos.y);
          const last = trailRef.current[0];
          if (!last || last.x !== roundedX || last.y !== roundedY) {
            trailRef.current.unshift({ x: roundedX, y: roundedY });
            if (trailRef.current.length > trailLength * idleRandomCount) {
              trailRef.current.pop();
            }
          }
        });
      }

      // Draw trail glow (using hardware-accelerated concentric rect overlays instead of shadowBlur)
      trailRef.current.forEach((cell, idx) => {
        const alpha = (1 - idx * (1 / (trailLength + 1))) * 0.7;

        // Core fill (Layer 1)
        ctx.fillStyle = `rgba(${rgbGlow.r}, ${rgbGlow.g}, ${rgbGlow.b}, ${alpha})`;
        ctx.fillRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);

        if (glow) {
          // Inner glow overlay (Layer 2)
          ctx.fillStyle = `rgba(${rgbGlow.r}, ${rgbGlow.g}, ${rgbGlow.b}, ${alpha * 0.25})`;
          ctx.fillRect(
            (cell.x - 0.5) * gridSize,
            (cell.y - 0.5) * gridSize,
            gridSize * 2,
            gridSize * 2
          );

          // Outer ambient glow overlay (Layer 3)
          ctx.fillStyle = `rgba(${rgbGlow.r}, ${rgbGlow.g}, ${rgbGlow.b}, ${alpha * 0.08})`;
          ctx.fillRect(
            (cell.x - 1.0) * gridSize,
            (cell.y - 1.0) * gridSize,
            gridSize * 3,
            gridSize * 3
          );
        }
      });

      animationId = requestAnimationFrame(draw);
    }

    // Intersection Observer to pause rendering when component is not in the viewport
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isVisible = entry.isIntersecting && entry.intersectionRatio > 0;
        isVisibleRef.current = isVisible;
        if (isVisible && running) {
          cancelAnimationFrame(animationId);
          lastTime = performance.now();
          draw();
        }
      },
      { threshold: [0, 0.01] }
    );

    const container = containerRef.current;
    if (container) {
      intersectionObserver.observe(container);
    }

    // Start drawing initially if visible
    if (isVisibleRef.current) {
      draw();
    }

    return () => {
      running = false;
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      if (container) {
        intersectionObserver.unobserve(container);
      }
      intersectionObserver.disconnect();
    };
  }, [
    gridSize,
    width,
    height,
    gridColor,
    darkGridColor,
    effectColor,
    darkEffectColor,
    isDarkMode,
    trailLength,
    idleSpeed,
    glow,
    glowRadius,
    idleRandomCount,
    themeColor,
    themeColor2,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={width || height ? { width, height } : undefined}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 z-0 pointer-events-none"
        style={{ willChange: "transform" }}
      />

      {showFade && (
        <div
          className={`pointer-events-none absolute inset-0 ${fadeColor}`}
          style={{
            maskImage: `radial-gradient(ellipse at center, transparent ${fadeIntensity}%, black)`,
            WebkitMaskImage: `radial-gradient(ellipse at center, transparent ${fadeIntensity}%, black)`,
          }}
        />
      )}
      <div className="relative z-0 w-full h-full">{children}</div>
    </div>
  );
}
