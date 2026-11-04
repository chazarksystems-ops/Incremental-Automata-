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
}

export interface Overlay {
  /** Placement preview: transformed pattern at a cell position. */
  ghost?: { grid: Grid; x: number; y: number; valid: boolean };
  hoverCell?: { x: number; y: number };
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

    // Board edge — projectiles crossing it are lost.
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = Math.max(1, 2 * dpr);
    ctx.strokeRect(ox, oy, world.width * z, world.height * z);
  }
}

export function parseHexColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
