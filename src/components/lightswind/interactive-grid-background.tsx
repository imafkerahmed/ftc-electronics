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

const convertToRgba = (color: string, alpha: number): string => {
  if (!color) return `rgba(0, 0, 0, ${alpha})`;
  
  if (color.startsWith("rgba")) {
    return color.replace(/[\d.]+\)$/g, `${alpha})`);
  }
  
  if (color.startsWith("rgb")) {
    return color.replace("rgb", "rgba").replace(")", `, ${alpha})`);
  }

  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    let r = 0, g = 0, b = 0;
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
};

const InteractiveGridBackground: React.FC<InteractiveGridBackgroundProps> = ({
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
}) => {
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

  // Detect dark mode and custom theme colors
  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
      const style = getComputedStyle(document.documentElement);
      setThemeColor(style.getPropertyValue("--island-color").trim());
      setThemeColor2(style.getPropertyValue("--island-color-2").trim());
    };
    updateTheme();
    const observer = new MutationObserver(() => updateTheme());
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      if (rawX < 0 || rawY < 0 || rawX > rect.width || rawY > rect.height)
        return;

      mouseActiveRef.current = true;
      lastMouseTimeRef.current = Date.now();

      const snappedX = Math.floor(rawX / gridSize);
      const snappedY = Math.floor(rawY / gridSize);

      const last = trailRef.current[0];
      if (!last || last.x !== snappedX || last.y !== snappedY) {
        trailRef.current.unshift({ x: snappedX, y: snappedY });
        if (trailRef.current.length > trailLength) trailRef.current.pop();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [gridSize, trailLength]);

  // Drawing and Resizing logic
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
    let glowColor = isDarkMode ? darkEffectColor : effectColor;

    if (themeColor) {
      lineColor = convertToRgba(themeColor, isDarkMode ? 0.15 : 0.1);
      // Map Midnight theme color (#0f172a) to bright brand blue (#173eff) for highlights
      const targetGlowColor = themeColor === "#0f172a" ? "#173eff" : (themeColor2 || themeColor);
      glowColor = convertToRgba(targetGlowColor, isDarkMode ? 0.25 : 0.25);
    }

    const cols = Math.floor(canvasWidth / gridSize);
    const rows = Math.floor(canvasHeight / gridSize);

    // Initialize idle positions
    idleTargetsRef.current = Array.from({ length: idleRandomCount }, () => ({
      x: Math.floor(Math.random() * cols),
      y: Math.floor(Math.random() * rows),
    }));
    idlePositionsRef.current = idleTargetsRef.current.map((p) => ({ ...p }));

    let animationId: number;

    const draw = () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Draw grid lines
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvasWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= canvasHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }

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
            // new random target when reached
            idleTargetsRef.current[i] = {
              x: Math.floor(Math.random() * currentCols),
              y: Math.floor(Math.random() * currentRows),
            };
          } else {
            pos.x += dx * idleSpeed;
            pos.y += dy * idleSpeed;
          }

          const roundedX = Math.round(pos.x);
          const roundedY = Math.round(pos.y);
          const last = trailRef.current[0];
          if (!last || last.x !== roundedX || last.y !== roundedY) {
            trailRef.current.unshift({ x: roundedX, y: roundedY });
            if (trailRef.current.length > trailLength * idleRandomCount)
              trailRef.current.pop();
          }
        });
      }

      // Draw trail glow
      trailRef.current.forEach((cell, idx) => {
        const alpha = (1 - idx * (1 / (trailLength + 1))) * 0.7;
        const rgbaColor = convertToRgba(glowColor, alpha);

        ctx.fillStyle = rgbaColor;
        if (glow) {
          ctx.shadowColor = rgbaColor;
          ctx.shadowBlur = glowRadius;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillRect(cell.x * gridSize, cell.y * gridSize, gridSize, gridSize);
      });

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
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
};

export default InteractiveGridBackground;
