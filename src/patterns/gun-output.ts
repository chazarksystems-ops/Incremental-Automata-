import { stepLifeN } from '../core/life';
import { stampGrid } from '../core/stamp';
import { transformGrid, transformName, type Transform } from '../core/transform';
import { createWorld, type Grid } from '../core/world';
import { findIsolatedGliders } from '../detectors/scan';
import type { Heading } from '../detectors/templates';

/**
 * Where a gun's stream goes, measured by *running* the gun alone — used only
 * for the assistive "predicted lane" overlay, never to move cells.
 * `anchorDx/anchorDy` is the phase-0 anchor of the glider nearest the gun
 * (the start of the stream), relative to the gun's top-left; every glider of the stream lies on the line through it along `heading`.
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
  const sightings = findIsolatedGliders(stepLifeN(r.world, 160), 0, 0, g.width + 2 * pad, g.height + 2 * pad);
  if (!sightings.length || new Set(sightings.map((s) => s.heading)).size !== 1) throw new Error('Gun produced no single-heading stream');
  // The glider nearest the gun body: the start of the stream, whichever way it points.
  const cx = pad + g.width / 2, cy = pad + g.height / 2;
  const dist = (q: { ax: number; ay: number }) => Math.max(Math.abs(q.ax + 1.5 - cx), Math.abs(q.ay + 1.5 - cy));
  const s = sightings.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  const out: GunOutput = { heading: s.heading, anchorDx: s.ax - pad, anchorDy: s.ay - pad };
  cache.set(key, out);
  return out;
}
