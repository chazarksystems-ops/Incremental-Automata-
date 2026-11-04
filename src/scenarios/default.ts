import { stampGrid } from '../core/stamp';
import { IDENTITY } from '../core/transform';
import { createWorld, type Grid, type WorldState } from '../core/world';

export const CHAMBER_SIZE = 128;

/** Phase 1 starting chamber: one Gosper gun near the top-left, firing south-east. */
export function defaultScenario(gun: Grid): WorldState {
  const r = stampGrid(createWorld(CHAMBER_SIZE, CHAMBER_SIZE), gun, 4, 4, { transform: IDENTITY });
  if (!r.ok) throw new Error(r.message);
  return r.world;
}
