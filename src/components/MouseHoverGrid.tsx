'use client';

import React, { useEffect, useRef } from 'react';

export interface MouseHoverGridProps {
  /**
   * Grid-cell size in pixels.
   * @default 56
   */
  cellSize?: number;
  /**
   * Rate at which cell highlights decay per animation frame.
   * @default 0.035
   */
  fadeRate?: number;
  /**
   * CSS custom property name for the accent color token.
   * @default '--orange'
   */
  colorToken?: string;
  /**
   * Center cell peak intensity (0 to 1).
   * @default 1.0
   */
  centerStrength?: number;
  /**
   * Surrounding 8 neighboring cells peak intensity (0 to 1).
   * @default 0.55
   */
  neighborStrength?: number;
  /**
   * Multiplier to calculate final stroke/fill opacity from cell strength.
   * @default 0.16
   */
  opacityMultiplier?: number;
  /**
   * Z-index for positioning behind content.
   * @default 0
   */
  zIndex?: number;
  /**
   * Additional custom CSS classes.
   */
  className?: string;
  /**
   * Additional inline styles.
   */
  style?: React.CSSProperties;
}

interface ActiveCell {
  col: number;
  row: number;
  strength: number;
}

/**
 * Parses hex ('#ff6a1a', '#f60') or rgb/rgba ('rgb(255, 106, 26)') string to [r, g, b] numbers.
 */
function parseColorToRgb(colorStr: string): [number, number, number] {
  const trimmed = colorStr.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const matchRgb = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (matchRgb) {
    return [
      parseInt(matchRgb[1], 10),
      parseInt(matchRgb[2], 10),
      parseInt(matchRgb[3], 10),
    ];
  }

  // Fallback to project default accent (#ff6a1a = 255, 106, 26)
  return [255, 106, 26];
}

/**
 * MouseHoverGrid
 *
 * A high-performance, full-viewport mouse-reactive canvas grid hover component.
 * Renders a 56px subtle grid highlight on pointer movement, fading smoothly via requestAnimationFrame.
 *
 * - Zero pointer interference (pointer-events: none)
 * - Scaled for high-DPI displays (DPR capped at 2)
 * - Respects prefers-reduced-motion and pointer: fine
 * - Fully cleans up animation frames and listeners on unmount
 */
export const MouseHoverGrid: React.FC<MouseHoverGridProps> = ({
  cellSize = 56,
  fadeRate = 0.035,
  colorToken = '--orange',
  centerStrength = 1.0,
  neighborStrength = 0.55,
  opacityMultiplier = 0.16,
  zIndex = 0,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Active highlighted cells mapped by "${col},${row}" to prevent duplicates
    const activeCells = new Map<string, ActiveCell>();
    let animationFrameId: number | null = null;
    let rgb: [number, number, number] = [255, 106, 26];

    // Media queries
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerQuery = window.matchMedia('(pointer: fine)');

    const isEnabled = () => !reducedMotionQuery.matches && finePointerQuery.matches;

    // Resolve color token from CSS custom properties
    const updateColorToken = () => {
      if (typeof window !== 'undefined') {
        const computedStyle = getComputedStyle(document.documentElement);
        const tokenValue = computedStyle.getPropertyValue(colorToken).trim() || '#ff6a1a';
        rgb = parseColorToRgb(tokenValue);
      }
    };

    // Resize canvas taking high-DPI scaling into account (capped at 2)
    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      updateColorToken();
    };

    // Main animation frame render loop
    const render = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (activeCells.size === 0) {
        ctx.clearRect(0, 0, width, height);
        animationFrameId = null;
        return;
      }

      ctx.clearRect(0, 0, width, height);
      const [r, g, b] = rgb;

      activeCells.forEach((cell, key) => {
        cell.strength -= fadeRate;

        if (cell.strength <= 0) {
          activeCells.delete(key);
        } else {
          const opacity = cell.strength * opacityMultiplier;
          const x = cell.col * cellSize;
          const y = cell.row * cellSize;

          // Subtle background cell fill
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 0.25})`;
          ctx.fillRect(x, y, cellSize, cellSize);

          // Crisp 1px cell border
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
        }
      });

      if (activeCells.size > 0) {
        animationFrameId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, width, height);
        animationFrameId = null;
      }
    };

    // Pointer move listener
    const onPointerMove = (e: PointerEvent) => {
      if (!isEnabled()) return;

      const centerCol = Math.floor(e.clientX / cellSize);
      const centerRow = Math.floor(e.clientY / cellSize);

      // Update center cell + 8 surrounding neighbors
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const col = centerCol + dx;
          const row = centerRow + dy;
          const key = `${col},${row}`;
          const isCenter = dx === 0 && dy === 0;
          const targetStrength = isCenter ? centerStrength : neighborStrength;

          const existing = activeCells.get(key);
          if (existing) {
            existing.strength = Math.max(existing.strength, targetStrength);
          } else {
            activeCells.set(key, { col, row, strength: targetStrength });
          }
        }
      }

      // Start animation loop if not already running
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    const handleMediaChange = () => {
      if (!isEnabled()) {
        activeCells.clear();
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    // Initialize
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // Modern and legacy media query listeners
    if (reducedMotionQuery.addEventListener) {
      reducedMotionQuery.addEventListener('change', handleMediaChange);
      finePointerQuery.addEventListener('change', handleMediaChange);
    } else {
      reducedMotionQuery.addListener(handleMediaChange);
      finePointerQuery.addListener(handleMediaChange);
    }

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', onPointerMove);

      if (reducedMotionQuery.removeEventListener) {
        reducedMotionQuery.removeEventListener('change', handleMediaChange);
        finePointerQuery.removeEventListener('change', handleMediaChange);
      } else {
        reducedMotionQuery.removeListener(handleMediaChange);
        finePointerQuery.removeListener(handleMediaChange);
      }

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      activeCells.clear();
    };
  }, [
    cellSize,
    fadeRate,
    colorToken,
    centerStrength,
    neighborStrength,
    opacityMultiplier,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex,
        ...style,
      }}
    />
  );
};

export default MouseHoverGrid;
