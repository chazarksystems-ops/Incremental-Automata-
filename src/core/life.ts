import type { WorldState } from './world';

/** The only rule this engine implements. */
export const RULE = 'B3/S23' as const;
export const RULE_ID = 'b3s23' as const;

/**
 * B3/S23 transition. `alive` is the current state, `n` the number of live
 * Moore neighbours (0–8). Exported so tests can check the full rule table.
 */
export function nextState(alive: 0 | 1, n: number): 0 | 1 {
  return n === 3 || (alive === 1 && n === 2) ? 1 : 0;
}

// Lookup indexed by (alive << 4) | n — avoids branches in the inner loop.
const LUT = new Uint8Array(32);
for (let n = 0; n <= 8; n++) {
  LUT[n] = nextState(0, n);
  LUT[16 | n] = nextState(1, n);
}

/**
 * Advance one generation. Pure: never mutates `world`; returns a new state
 * with `generation + 1`. Cells beyond the board edge count as dead.
 */
export function stepLife(world: WorldState): WorldState {
  const { width: w, height: h, cells: src } = world;
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const up = y > 0 ? (y - 1) * w : -1;
    const row = y * w;
    const down = y < h - 1 ? (y + 1) * w : -1;
    for (let x = 0; x < w; x++) {
      const hasL = x > 0;
      const hasR = x < w - 1;
      let n = 0;
      if (up >= 0) {
        if (hasL) n += src[up + x - 1]!;
        n += src[up + x]!;
        if (hasR) n += src[up + x + 1]!;
      }
      if (hasL) n += src[row + x - 1]!;
      if (hasR) n += src[row + x + 1]!;
      if (down >= 0) {
        if (hasL) n += src[down + x - 1]!;
        n += src[down + x]!;
        if (hasR) n += src[down + x + 1]!;
      }
      dst[row + x] = LUT[(src[row + x]! << 4) | n]!;
    }
  }
  return { width: w, height: h, generation: world.generation + 1, cells: dst };
}

/** Advance `n` generations (n ≥ 0). Equivalent to calling stepLife n times. */
export function stepLifeN(world: WorldState, n: number): WorldState {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`Invalid step count ${n}`);
  let w = world;
  for (let i = 0; i < n; i++) w = stepLife(w);
  return w;
}
