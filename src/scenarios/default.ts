import { stampGrid } from '../core/stamp';
import { IDENTITY } from '../core/transform';
import { createWorld, type Grid, type WorldState } from '../core/world';
import type { DetectorConfig } from '../detectors/detector';

export const CHAMBER_SIZE = 128;

/** Phase 1 starting chamber: one Gosper gun near the top-left, firing south-east. */
export function defaultScenario(gun: Grid): WorldState {
  const r = stampGrid(createWorld(CHAMBER_SIZE, CHAMBER_SIZE), gun, 4, 4, { transform: IDENTITY });
  if (!r.ok) throw new Error(r.message);
  return r.world;
}

/**
 * Phase 2 starting collector: deliberately placed 6 lanes off the gun's
 * stream (stream lateral = 14, collector lateral = 72 − 64 = 8), so the
 * player's first decision is to read the near-miss diagnostic and move it.
 * The on-lane spot (72, 58) is used by tests.
 */
export const DEFAULT_COLLECTOR: DetectorConfig = { id: 'collector-1', x: 72, y: 64, heading: 'SE' };
export const ON_LANE_COLLECTOR_POSITION = { x: 72, y: 58 } as const;
