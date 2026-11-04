import type { WorldState } from '../core/world';
import { findIsolatedGliders, passageId } from '../detectors/scan';
import { HEADING_VECTORS } from '../detectors/templates';

/**
 * Production losses: gliders that reach the board edge without ever being
 * collected. Read-only, evaluated every generation by the factory.
 *
 * A glider is counted when it is seen (isolated) with its 3×3 inside the
 * last `band` cells before an edge it is heading toward. If the same glider
 * is collected afterwards (a collector inside the band), the loss is retracted.
 */
export type Edge = 'left' | 'right' | 'top' | 'bottom';

export interface LossRecord {
  passageId: string;
  generation: number;
  edge: Edge;
  /** Top-left of the glider when it was counted (for the board overlay). */
  x: number;
  y: number;
}

export interface LossState {
  total: number;
  /** Recent losses (kept for rate display, dedupe and retraction). */
  recent: LossRecord[];
}

const KEEP_GENERATIONS = 400;

export function createLosses(): LossState {
  return { total: 0, recent: [] };
}

export function updateLosses(state: LossState, world: WorldState, band: number, collected: ReadonlySet<string>): { state: LossState; added: LossRecord[] } {
  const { width: w, height: h, generation: g } = world;
  const known = new Set(state.recent.map((r) => r.passageId));
  const added: LossRecord[] = [];
  const consider = (x0: number, y0: number, x1: number, y1: number, edge: Edge) => {
    for (const s of findIsolatedGliders(world, x0, y0, x1, y1)) {
      const [hx, hy] = HEADING_VECTORS[s.heading];
      const outward =
        (edge === 'right' && hx > 0) || (edge === 'left' && hx < 0) || (edge === 'bottom' && hy > 0) || (edge === 'top' && hy < 0);
      if (!outward) continue;
      const id = passageId(s.heading, s.ax, s.ay, s.phase, g);
      if (known.has(id) || collected.has(id)) continue;
      known.add(id);
      added.push({ passageId: id, generation: g, edge, x: s.x, y: s.y });
    }
  };
  const b = band;
  consider(w - 3 - b, 0, w - 3, h - 3, 'right');
  consider(0, 0, b, h - 3, 'left');
  consider(0, h - 3 - b, w - 3, h - 3, 'bottom');
  consider(0, 0, w - 3, b, 'top');

  const recent = [...state.recent, ...added].filter((r) => r.generation > g - KEEP_GENERATIONS);
  return { state: { total: state.total + added.length, recent }, added };
}

/** A glider counted as lost was collected after all: retract the loss. */
export function retractLoss(state: LossState, passageId: string): LossState {
  const i = state.recent.findIndex((r) => r.passageId === passageId);
  if (i < 0) return state;
  return { total: state.total - 1, recent: state.recent.filter((_, k) => k !== i) };
}

export function lossesInWindow(state: LossState, generation: number, window: number): number {
  return state.recent.filter((r) => r.generation > generation - window).length;
}
