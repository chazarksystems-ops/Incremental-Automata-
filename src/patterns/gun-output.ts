import { stepLife, stepLifeN } from '../core/life';
import { stampGrid } from '../core/stamp';
import { transformGrid, transformName, type Transform } from '../core/transform';
import { createWorld, type Grid } from '../core/world';
import { findIsolatedGliders } from '../detectors/scan';
import type { Heading } from '../detectors/templates';

/**
 * Where a gun's stream goes, measured by *running* the gun alone — used only
 * for the assistive "predicted lane" overlay, never to move cells.
 * `anchorDx/anchorDy` is the phase-0 anchor of the gun's first glider at the
 * moment it first becomes isolated (where the stream leaves the gun), relative
 * to the gun's top-left; every glider of the stream lies on the line through it along `heading`.
 */
export interface GunOutput {
  heading: Heading;
  anchorDx: number;
  anchorDy: number;
}

const cache = new Map<string, GunOutput>();

export function gunOutput(gun: Grid, t: Transform): GunOutput {
  const key = `${gun.width}x${gun.height}:${transformName(t)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pad = 64;
  const g = transformGrid(gun, t);
  const r = stampGrid(createWorld(g.width + 2 * pad, g.height + 2 * pad), gun, pad, pad, { transform: t });
  if (!r.ok) throw new Error(r.message);
  // The exit point: where the gun's first glider is first seen as an isolated glider.
  // Every later glider of the stream passes through the same point, so the lane
  // starts exactly where gliders leave the gun.
  let w = r.world;
  let s: ReturnType<typeof findIsolatedGliders>[number] | undefined;
  for (let gen = 0; gen < 160 && !s; gen++) {
    w = stepLife(w);
    s = findIsolatedGliders(w, 0, 0, g.width + 2 * pad, g.height + 2 * pad)[0];
  }
  if (!s) throw new Error('Gun produced no glider');
  // Sanity: the stream later in the run has one heading only.
  const later = findIsolatedGliders(stepLifeN(w, 120), 0, 0, g.width + 2 * pad, g.height + 2 * pad);
  if (new Set(later.map((q) => q.heading)).size !== 1 || later[0]!.heading !== s.heading) throw new Error('Gun produced no single-heading stream');
  const out: GunOutput = { heading: s.heading, anchorDx: s.ax - pad, anchorDy: s.ay - pad };
  cache.set(key, out);
  return out;
}
