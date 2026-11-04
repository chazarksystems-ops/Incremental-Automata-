import { getCell, type WorldState } from '../core/world';
import { HEADING_VECTORS, TEMPLATE_BY_MASK, type Heading } from './templates';

/** An isolated glider seen in one generation. */
export interface GliderSighting {
  heading: Heading;
  phase: number;
  /** Phase-0 anchor of the current cycle (see templates.ts). */
  ax: number;
  ay: number;
  /** Top-left of the 3×3 shape as seen. */
  x: number;
  y: number;
}

/**
 * All isolated gliders whose 3×3 top-left lies in [x0..x1] × [y0..y1]
 * (inclusive). Isolated = template match with every cell of the surrounding
 * 1-cell ring dead. Read-only.
 */
export function findIsolatedGliders(
  world: WorldState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  heading?: Heading,
): GliderSighting[] {
  const out: GliderSighting[] = [];
  const W = world.width, H = world.height, cells = world.cells;
  const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < W && y < H ? cells[y * W + x]! : 0);
  // Clamp to positions whose 3×3 can contain a live cell (a 3×3 entirely off-board is empty).
  const ya = Math.max(y0, -2), yb = Math.min(y1, H - 1);
  const xa = Math.max(x0, -2), xb = Math.min(x1, W - 1);
  if (xa > xb || ya > yb) return out;
  const span = xb - xa + 3;
  const col = new Uint8Array(span);
  for (let y = ya; y <= yb; y++) {
    // Live count of each 3-tall column starting at row y; then slide a 3-wide window.
    for (let i = 0; i < span; i++) {
      const x = xa + i;
      col[i] = at(x, y) + at(x, y + 1) + at(x, y + 2);
    }
    let sum = col[0]! + col[1]! + col[2]!;
    for (let x = xa; x <= xb; x++) {
      if (x > xa) sum += col[x - xa + 2]! - col[x - xa - 1]!;
      if (sum !== 5) continue;
      let mask = 0;
      for (let i = 0; i < 9; i++) if (at(x + (i % 3), y + ((i / 3) | 0))) mask |= 1 << i;
      const t = TEMPLATE_BY_MASK.get(mask);
      if (!t || (heading !== undefined && t.heading !== heading)) continue;
      if (!ringEmpty(world, x, y)) continue;
      out.push({ heading: t.heading, phase: t.phase, ax: x + t.anchorDx, ay: y + t.anchorDy, x, y });
    }
  }
  return out;
}

/** Reference implementation (slow, obviously correct) — used by tests to check the fast scan. */
export function findIsolatedGlidersNaive(world: WorldState, x0: number, y0: number, x1: number, y1: number, heading?: Heading): GliderSighting[] {
  const out: GliderSighting[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let mask = 0;
      let n = 0;
      for (let i = 0; i < 9; i++) {
        if (getCell(world, x + (i % 3), y + ((i / 3) | 0))) {
          mask |= 1 << i;
          n++;
        }
      }
      if (n !== 5) continue;
      const t = TEMPLATE_BY_MASK.get(mask);
      if (!t || (heading !== undefined && t.heading !== heading)) continue;
      if (!ringEmpty(world, x, y)) continue;
      out.push({ heading: t.heading, phase: t.phase, ax: x + t.anchorDx, ay: y + t.anchorDy, x, y });
    }
  }
  return out;
}

function ringEmpty(world: WorldState, x: number, y: number): boolean {
  for (let i = -1; i <= 3; i++) {
    if (getCell(world, x + i, y - 1) || getCell(world, x + i, y + 3)) return false;
  }
  for (let j = 0; j <= 2; j++) {
    if (getCell(world, x - 1, y + j) || getCell(world, x + 3, y + j)) return false;
  }
  return true;
}

/**
 * Identity of a glider's trajectory, independent of any gate: heading, absolute
 * lane and timing (2·progress + phase − generation is constant for one glider).
 */
export function passageId(heading: Heading, ax: number, ay: number, phase: number, generation: number): string {
  const [hx, hy] = HEADING_VECTORS[heading];
  const lane = hx * ax - hy * ay;
  const timing = 2 * (hx * ax + hy * ay) + phase - generation;
  return `${heading}:L${lane}:T${timing}`;
}
