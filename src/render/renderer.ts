import type { Grid, WorldState } from '../core/world';
import type { Camera } from './camera';

export interface Theme {
  background: string;
  board: string;
  cell: string;
  gridLine: string;
  edge: string;
  ghostOk: string;
  ghostBad: string;
  ghostCell: string;
  hover: string;
  machine: string;
  machineHighlight: string;
  lanePredicted: string;
  laneUncollected: string;
  loss: string;
  gate: string;
  gateFlash: string;
  zone: string;
  lane: string;
  tracked: string;
}

export interface CollectorOverlay {
  /** Gate anchor cell and heading vector. */
  x: number;
  y: number;
  hx: number;
  hy: number;
  gateHalfWidth: number;
  observeHalfWidth: number;
  observeDepth: number;
  /** Top-left cells of gliders currently tracked by this collector. */
  tracks: Array<{ x: number; y: number }>;
  /** 1 right after a payout, fading to 0. */
  flash: number;
  selected?: boolean;
  /** Placement preview (not yet built). */
  ghost?: boolean;
}

export interface GunOverlay {
  x: number;
  y: number;
  width: number;
  height: number;
  highlight: boolean;
}

/** Predicted stream lane: from a phase-0 anchor along the heading to the board edge (dashed). */
export interface LaneOverlay {
  ax: number;
  ay: number;
  hx: number;
  hy: number;
  strong: boolean;
  /** Predicted to hit something: drawn in the danger colour. */
  danger?: boolean;
  /** No collector on this stream yet: drawn in the warning colour. */
  uncollected?: boolean;
}

export interface Overlay {
  /** Placement preview: transformed pattern at a cell position. */
  ghost?: { grid: Grid; x: number; y: number; valid: boolean };
  hoverCell?: { x: number; y: number };
  collectors?: CollectorOverlay[];
  guns?: GunOverlay[];
  lanes?: LaneOverlay[];
  /** Recent losses at the board edge; alpha fades with age. */
  lossMarks?: Array<{ x: number; y: number; alpha: number }>;
  /** Predicted stream hazards (construction guide warnings). */
  hazardMarks?: Array<{ x: number; y: number }>;
  /** Where a collector would snap onto a predicted lane. */
  snapMark?: { x: number; y: number };
  /** Insulating border of the gun being placed. */
  ghostBorder?: { x: number; y: number; width: number; height: number; valid: boolean };
}

/**
 * Canvas 2D board renderer. Cells are drawn through a 1-pixel-per-cell
 * offscreen bitmap scaled with nearest-neighbour sampling, so cost is
 * O(cells) regardless of zoom. Purely presentational: reads the world,
 * never modifies it.
 */
export class BoardRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private bitmap: OffscreenCanvas | HTMLCanvasElement | null = null;
  private bitmapCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private image: ImageData | null = null;
  private cellRGBA: [number, number, number] = [0, 0, 0];

  constructor(private readonly canvas: HTMLCanvasElement, public theme: Theme) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.setTheme(theme);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.cellRGBA = parseHexColor(theme.cell);
  }

  /** Match the backing store to CSS size × devicePixelRatio. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private ensureBitmap(width: number, height: number): void {
    if (this.image && this.image.width === width && this.image.height === height) return;
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    c.width = width;
    c.height = height;
    this.bitmap = c;
    this.bitmapCtx = c.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    this.image = new ImageData(width, height);
  }

  draw(world: WorldState, cam: Camera, dpr: number, overlay: Overlay = {}): void {
    const { ctx, theme } = this;
    const z = cam.zoom * dpr;
    const ox = -cam.originX * z;
    const oy = -cam.originY * z;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Board background
    ctx.fillStyle = theme.board;
    ctx.fillRect(ox, oy, world.width * z, world.height * z);

    // Live cells → bitmap (transparent where dead)
    this.ensureBitmap(world.width, world.height);
    const data = this.image!.data;
    const [r, g, b] = this.cellRGBA;
    const cells = world.cells;
    for (let i = 0, p = 0; i < cells.length; i++, p += 4) {
      if (cells[i]) {
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      } else {
        data[p + 3] = 0;
      }
    }
    this.bitmapCtx!.putImageData(this.image!, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bitmap as CanvasImageSource, ox, oy, world.width * z, world.height * z);

    // Grid lines when cells are large enough to see them
    if (z >= 6) {
      ctx.strokeStyle = theme.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(cam.originX));
      const y0 = Math.max(0, Math.floor(cam.originY));
      const x1 = Math.min(world.width, Math.ceil(cam.originX + this.canvas.width / z));
      const y1 = Math.min(world.height, Math.ceil(cam.originY + this.canvas.height / z));
      for (let x = x0; x <= x1; x++) {
        const sx = Math.round(ox + x * z) + 0.5;
        ctx.moveTo(sx, oy + y0 * z);
        ctx.lineTo(sx, oy + y1 * z);
      }
      for (let y = y0; y <= y1; y++) {
        const sy = Math.round(oy + y * z) + 0.5;
        ctx.moveTo(ox + x0 * z, sy);
        ctx.lineTo(ox + x1 * z, sy);
      }
      ctx.stroke();
    }

    // Placement ghost
    if (overlay.ghost) {
      const { grid, x, y, valid } = overlay.ghost;
      ctx.fillStyle = valid ? theme.ghostOk : theme.ghostBad;
      ctx.fillRect(ox + x * z, oy + y * z, grid.width * z, grid.height * z);
      ctx.fillStyle = theme.ghostCell;
      for (let yy = 0; yy < grid.height; yy++) {
        for (let xx = 0; xx < grid.width; xx++) {
          if (grid.cells[yy * grid.width + xx]) ctx.fillRect(ox + (x + xx) * z, oy + (y + yy) * z, Math.max(1, z), Math.max(1, z));
        }
      }
    } else if (overlay.hoverCell) {
      ctx.strokeStyle = theme.hover;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeRect(ox + overlay.hoverCell.x * z, oy + overlay.hoverCell.y * z, z, z);
    }

    // Machines and assistive overlays (game layer only)
    for (const gOv of overlay.guns ?? []) {
      ctx.strokeStyle = gOv.highlight ? theme.machineHighlight : theme.machine;
      ctx.lineWidth = Math.max(1, (gOv.highlight ? 2 : 1) * dpr);
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeRect(ox + gOv.x * z, oy + gOv.y * z, gOv.width * z, gOv.height * z);
      ctx.setLineDash([]);
    }
    for (const l of overlay.lanes ?? []) {
      const cx = l.ax + 1.5, cy = l.ay + 1.5;
      const tx = l.hx > 0 ? world.width - cx : cx;
      const ty = l.hy > 0 ? world.height - cy : cy;
      const t = Math.max(0, Math.min(tx, ty));
      ctx.strokeStyle = l.danger ? theme.loss : l.uncollected ? theme.laneUncollected : theme.lanePredicted;
      ctx.globalAlpha = l.strong || l.danger || l.uncollected ? 1 : 0.45;
      ctx.lineWidth = Math.max(1, 1.5 * dpr);
      ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.beginPath();
      ctx.moveTo(ox + cx * z, oy + cy * z);
      ctx.lineTo(ox + (cx + l.hx * t) * z, oy + (cy + l.hy * t) * z);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    for (const c of overlay.collectors ?? []) this.drawCollector(c, ox, oy, z, dpr);
    for (const hm of overlay.hazardMarks ?? []) {
      const cx = ox + (hm.x + 1.5) * z, cy = oy + (hm.y + 1.5) * z, r = Math.max(6 * dpr, 2.5 * z);
      ctx.strokeStyle = theme.loss;
      ctx.lineWidth = Math.max(2 * dpr, z * 0.35);
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    }
    if (overlay.ghostBorder) {
      const b = overlay.ghostBorder;
      ctx.strokeStyle = b.valid ? theme.lanePredicted : theme.loss;
      ctx.lineWidth = Math.max(1.5 * dpr, 2);
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeRect(ox + b.x * z, oy + b.y * z, b.width * z, b.height * z);
      ctx.setLineDash([]);
    }
    if (overlay.snapMark) {
      ctx.strokeStyle = theme.lanePredicted;
      ctx.lineWidth = Math.max(1.5 * dpr, z * 0.25);
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.strokeRect(ox + (overlay.snapMark.x - 1) * z, oy + (overlay.snapMark.y - 1) * z, 5 * z, 5 * z);
      ctx.setLineDash([]);
    }
    for (const m of overlay.lossMarks ?? []) {
      ctx.strokeStyle = theme.loss;
      ctx.globalAlpha = m.alpha;
      ctx.lineWidth = Math.max(1.5 * dpr, z * 0.3);
      ctx.beginPath();
      ctx.arc(ox + (m.x + 1.5) * z, oy + (m.y + 1.5) * z, Math.max(6 * dpr, 3 * z), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Board edge — projectiles crossing it are lost.
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = Math.max(1, 2 * dpr);
    ctx.strokeRect(ox, oy, world.width * z, world.height * z);
  }

  private drawCollector(c: CollectorOverlay, ox: number, oy: number, z: number, dpr: number): void {
    const { ctx, theme } = this;
    const { at } = collectorGeometry(c);
    ctx.globalAlpha = c.ghost ? 0.6 : c.selected === false ? 0.55 : 1;
    const S = (p: { x: number; y: number }) => [ox + p.x * z, oy + p.y * z] as const;

    // Observation zone
    const O = c.observeHalfWidth, D = c.observeDepth;
    ctx.beginPath();
    ctx.moveTo(...S(at(O, -D)));
    ctx.lineTo(...S(at(-O, -D)));
    ctx.lineTo(...S(at(-O, D)));
    ctx.lineTo(...S(at(O, D)));
    ctx.closePath();
    ctx.fillStyle = theme.zone;
    ctx.fill();

    // Catch strip: the lanes the gate accepts, drawn through the whole zone
    const W = c.gateHalfWidth + 0.5;
    ctx.beginPath();
    ctx.moveTo(...S(at(W, -D)));
    ctx.lineTo(...S(at(-W, -D)));
    ctx.lineTo(...S(at(-W, D)));
    ctx.lineTo(...S(at(W, D)));
    ctx.closePath();
    ctx.fillStyle = theme.lane;
    ctx.fill();

    // Tracked gliders
    ctx.strokeStyle = theme.tracked;
    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    for (const t of c.tracks) ctx.strokeRect(ox + (t.x - 0.5) * z, oy + (t.y - 0.5) * z, 4 * z, 4 * z);

    // Gate line across the catch strip, then a heading arrow beyond it
    const { a, b } = collectorGatePoints(c);
    ctx.strokeStyle = c.flash > 0 ? theme.gateFlash : theme.gate;
    ctx.lineWidth = Math.max(2 * dpr, z * (0.5 + 0.5 * c.flash));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...S(a));
    ctx.lineTo(...S(b));
    ctx.stroke();
    const tail = at(0, 1), tip = at(0, 6);
    ctx.lineWidth = Math.max(1.5 * dpr, z * 0.25);
    ctx.beginPath();
    ctx.moveTo(...S(tail));
    ctx.lineTo(...S(tip));
    ctx.moveTo(...S(tip));
    ctx.lineTo(...S(at(1.2, 4.4)));
    ctx.moveTo(...S(tip));
    ctx.lineTo(...S(at(-1.2, 4.4)));
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
  }
}

/**
 * Collector overlay (game layer, not cells). Geometry in cell units: a
 * glider's 3×3 centre is anchor + 1.5; one lateral lane is (hx/2, −hy/2);
 * one progress unit is (hx/2, hy/2).
 */
function collectorGeometry(c: CollectorOverlay) {
  const cx = c.x + 1.5, cy = c.y + 1.5;
  const lat = { x: c.hx / 2, y: -c.hy / 2 };
  const fwd = { x: c.hx / 2, y: c.hy / 2 };
  const at = (l: number, f: number) => ({ x: cx + lat.x * l + fwd.x * f, y: cy + lat.y * l + fwd.y * f });
  return { at };
}

export function collectorGatePoints(c: CollectorOverlay): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const { at } = collectorGeometry(c);
  return { a: at(c.gateHalfWidth + 1.5, 0), b: at(-(c.gateHalfWidth + 1.5), 0) };
}

export function parseHexColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
