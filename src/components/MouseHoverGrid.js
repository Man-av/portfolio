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
class MouseHoverGrid {
  /**
   * @param {Object} options
   * @param {number} [options.cellSize=56] Grid-cell size in pixels.
   * @param {number} [options.fadeRate=0.035] Rate at which cell highlights decay per animation frame.
   * @param {string} [options.colorToken='--orange'] CSS custom property name for the accent color token.
   * @param {number} [options.centerStrength=1.0] Center cell peak intensity (0 to 1).
   * @param {number} [options.neighborStrength=0.55] Surrounding 8 neighboring cells peak intensity (0 to 1).
   * @param {number} [options.opacityMultiplier=0.16] Multiplier to calculate final stroke/fill opacity from cell strength.
   * @param {number} [options.zIndex=0] Z-index for positioning behind content.
   * @param {string} [options.className=''] Additional custom CSS classes.
   * @param {Object} [options.style={}] Additional inline styles.
   */
  constructor(options = {}) {
    this.options = {
      cellSize: 56,
      fadeRate: 0.035,
      colorToken: '--orange',
      centerStrength: 1.0,
      neighborStrength: 0.55,
      opacityMultiplier: 0.16,
      zIndex: 0,
      className: '',
      style: {},
      ...options
    };

    this.canvas = null;
    this.ctx = null;
    this.activeCells = new Map(); // key: `${col},${row}` => { col, row, strength }
    this.animationFrameId = null;
    this.rgb = [255, 106, 26]; // default to project's orange
    this.boundHandlePointerMove = this.handlePointerMove.bind(this);
    this.boundResizeCanvas = this.resizeCanvas.bind(this);
    this.boundRender = this.render.bind(this);
    this.boundHandleMediaChange = this.handleMediaChange.bind(this);

    // Media queries
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.finePointerQuery = window.matchMedia('(pointer: fine)');

    this.init();
  }

  init() {
    this.createCanvas();
    this.updateColorToken();
    this.resizeCanvas();
    this.attachEvents();
  }

  createCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = this.options.className;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: this.options.zIndex,
      ...this.options.style
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  updateColorToken() {
    if (typeof window !== 'undefined') {
      const computedStyle = getComputedStyle(document.documentElement);
      const tokenValue = computedStyle.getPropertyValue(this.options.colorToken).trim() || '#ff6a1a';
      this.rgb = this.parseColorToRgb(tokenValue);
    }
  }

  parseColorToRgb(colorStr) {
    const trimmed = colorStr.trim();
    if (trimmed.startsWith('#')) {
      const hex = trimmed.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16)
        ];
      }
      if (hex.length >= 6) {
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16)
        ];
      }
    }

    const matchRgb = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (matchRgb) {
      return [
        parseInt(matchRgb[1], 10),
        parseInt(matchRgb[2], 10),
        parseInt(matchRgb[3], 10)
      ];
    }

    // Fallback to project default accent (#ff6a1a = 255, 106, 26)
    return [255, 106, 26];
  }

  resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  handlePointerMove(e) {
    if (!this.isEnabled()) return;
    if (e.target.closest && e.target.closest('.pipeline-frame')) return;

    const centerCol = Math.floor(e.clientX / this.options.cellSize);
    const centerRow = Math.floor(e.clientY / this.options.cellSize);

    // Update center cell + 8 surrounding neighbors
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const col = centerCol + dx;
        const row = centerRow + dy;
        const key = `${col},${row}`;
        const isCenter = dx === 0 && dy === 0;
        const targetStrength = isCenter ? this.options.centerStrength : this.options.neighborStrength;

        const existing = this.activeCells.get(key);
        if (existing) {
          existing.strength = Math.max(existing.strength, targetStrength);
        } else {
          this.activeCells.set(key, { col, row, strength: targetStrength });
        }
      }
    }

    // Start animation loop if not already running
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.boundRender);
    }
  }

  handleMediaChange() {
    if (!this.isEnabled()) {
      this.activeCells.clear();
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }

  isEnabled() {
    return !this.reducedMotionQuery.matches && this.finePointerQuery.matches;
  }

  render() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (this.activeCells.size === 0) {
      this.ctx.clearRect(0, 0, width, height);
      this.animationFrameId = null;
      return;
    }

    this.ctx.clearRect(0, 0, width, height);
    const [r, g, b] = this.rgb;

    this.activeCells.forEach((cell, key) => {
      cell.strength -= this.options.fadeRate;

      if (cell.strength <= 0) {
        this.activeCells.delete(key);
      } else {
        const opacity = cell.strength * this.options.opacityMultiplier;
        const x = cell.col * this.options.cellSize;
        const y = cell.row * this.options.cellSize;

        // Subtle background cell fill
        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 0.25})`;
        this.ctx.fillRect(x, y, this.options.cellSize, this.options.cellSize);

        // Crisp 1px cell border
        this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + 0.5, y + 0.5, this.options.cellSize - 1, this.options.cellSize - 1);
      }
    });

    if (this.activeCells.size > 0) {
      this.animationFrameId = requestAnimationFrame(this.boundRender);
    } else {
      this.ctx.clearRect(0, 0, width, height);
      this.animationFrameId = null;
    }
  }

  attachEvents() {
    window.addEventListener('resize', this.boundResizeCanvas, { passive: true });
    window.addEventListener('pointermove', this.boundHandlePointerMove, { passive: true });

    // Modern and legacy media query listeners
    if (this.reducedMotionQuery.addEventListener) {
      this.reducedMotionQuery.addEventListener('change', this.boundHandleMediaChange);
      this.finePointerQuery.addEventListener('change', this.boundHandleMediaChange);
    } else {
      this.reducedMotionQuery.addListener(this.boundHandleMediaChange);
      this.finePointerQuery.addListener(this.boundHandleMediaChange);
    }
  }

  detachEvents() {
    window.removeEventListener('resize', this.boundResizeCanvas);
    window.removeEventListener('pointermove', this.boundHandlePointerMove);

    if (this.reducedMotionQuery.removeEventListener) {
      this.reducedMotionQuery.removeEventListener('change', this.boundHandleMediaChange);
      this.finePointerQuery.removeEventListener('change', this.boundHandleMediaChange);
    } else {
      this.reducedMotionQuery.removeListener(this.boundHandleMediaChange);
      this.finePointerQuery.removeListener(this.boundHandleMediaChange);
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.activeCells.clear();
  }

  destroy() {
    this.detachEvents();
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

// Export for use in other modules if using a bundler, otherwise attach to window
if (typeof window !== 'undefined') {
  window.MouseHoverGrid = MouseHoverGrid;
}