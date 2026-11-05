import { stepLife } from '../core/life';
import { stampGrid } from '../core/stamp';
import { transformGrid, transformName, type Transform } from '../core/transform';
import { createWorld, type Grid } from '../core/world';
import { findIsolatedGliders } from '../detectors/scan';

/**
 * A machine's operating envelope, *measured by running it alone*.
 *
 * - `activity`: the box covering every live cell the machine ever has over
 *   several periods, excluding the isolated gliders it emits (its output).
 * - `keepOut`: `activity` grown by `border` cells — the insulating border.
 *
 * Two machines whose keep-out boxes don't overlap have ≥ 2 empty cells between
 * their activity boxes. A dead cell's next state depends only on its 8
 * neighbours, so no cell can ever see live cells from both machines: each one
 * evolves exactly as it would alone, forever. (Checked exhaustively in
 * tests/game/insulation.test.ts.)
 */
export interface Rel {
  dx: number;
  dy: number;
  width: number;
  height: number;
}

export interface Envelope {
  activity: Rel;
  keepOut: Rel;
}

export const INSULATION_BORDER = 1;
const MEASURE_GENERATIONS = 180; // 6 Gosper periods

const cache = new Map<string, Envelope>();

export function measureEnvelope(pattern: Grid, t: Transform, border = INSULATION_BORDER): Envelope {
  const key = `${pattern.width}x${pattern.height}:${pattern.cells.join('')}:${transformName(t)}:${border}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const g = transformGrid(pattern, t);
  const pad = 48;
  const W = g.width + 2 * pad, H = g.height + 2 * pad;
  const r = stampGrid(createWorld(W, H), pattern, pad, pad, { transform: t, margin: 0 });
  if (!r.ok) throw new Error(r.message);
  let w = r.world;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let gen = 0; gen < MEASURE_GENERATIONS; gen++) {
    const output = new Set<number>();
    for (const s of findIsolatedGliders(w, -2, -2, W, H)) {
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) output.add((s.y + dy) * W + s.x + dx);
    }
    for (let i = 0; i < w.cells.length; i++) {
      if (!w.cells[i] || output.has(i)) continue;
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    w = stepLife(w);
  }
  const activity: Rel = { dx: x0 - pad, dy: y0 - pad, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  const env: Envelope = {
    activity,
    keepOut: { dx: activity.dx - border, dy: activity.dy - border, width: activity.width + 2 * border, height: activity.height + 2 * border },
  };
  cache.set(key, env);
  return env;
}

export function absolute(rel: Rel, x: number, y: number): { x: number; y: number; width: number; height: number } {
  return { x: x + rel.dx, y: y + rel.dy, width: rel.width, height: rel.height };
}

export function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
