import type { Transform } from '../core/transform';
import type { Grid } from '../core/world';
import { HEADING_VECTORS, type Heading } from '../detectors/templates';
import { gunOutput } from '../patterns/gun-output';

/**
 * Construction guides — pure geometry over *predicted* stream lanes (see
 * gunOutput). Advisory only: nothing here touches cells, and a warning is a
 * prediction, not a simulated result. Tests compare predictions with real runs.
 */

export interface Lane {
  /** Machine that emits this stream (or 'preview' for a gun being placed). */
  source: string;
  heading: Heading;
  /** Phase-0 anchor of the first glider of the stream. */
  ax: number;
  ay: number;
}

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Hazard =
  | { kind: 'hits-machine'; source: string; target: string; x: number; y: number }
  | { kind: 'crossing'; source: string; target: string; x: number; y: number }
  | { kind: 'head-on'; source: string; target: string; x: number; y: number }
  | { kind: 'too-close'; source: string; target: string; x: number; y: number };

/** Lateral distance (in lanes) under which parallel or opposing streams are flagged. */
export const STREAM_CLEARANCE = 6;

export function laneForGun(source: string, gun: Grid, x: number, y: number, t: Transform): Lane {
  const o = gunOutput(gun, t);
  return { source, heading: o.heading, ax: x + o.anchorDx, ay: y + o.anchorDy };
}

const lateralOf = (h: Heading, ax: number, ay: number) => {
  const [hx, hy] = HEADING_VECTORS[h];
  return hx * ax - hy * ay;
};
const progressOf = (h: Heading, ax: number, ay: number) => {
  const [hx, hy] = HEADING_VECTORS[h];
  return hx * ax + hy * ay;
};

/** Anchor positions along a lane, one per glider period, until the glider leaves the board. */
function* march(l: Lane, w: number, h: number): Generator<{ x: number; y: number }> {
  const [hx, hy] = HEADING_VECTORS[l.heading];
  for (let k = 0; ; k++) {
    const x = l.ax + hx * k, y = l.ay + hy * k;
    if (x < -3 || y < -3 || x > w || y > h) return;
    yield { x, y };
  }
}

/**
 * Predicted hazards for `lanes` against gun bodies `boxes` on a `w × h` board.
 * A stream hits a machine when the cells a glider occupies over its 4 phases
 * overlap another machine's box (its own source is ignored). Pass insulating
 * keep-out boxes to get "comes within 2 cells of the machine's activity".
 */
export function laneHazards(lanes: readonly Lane[], boxes: readonly Box[], w: number, h: number): Hazard[] {
  const out: Hazard[] = [];
  for (const l of lanes) {
    for (const p of march(l, w, h)) {
      // Over its 4 phases a glider's cells span anchor−1 … anchor+3 on each axis
      // (see the template anchor offsets), so test that whole footprint.
      const hit = boxes.find(
        (b) => b.id !== l.source && p.x - 1 < b.x + b.width && p.x + 3 >= b.x && p.y - 1 < b.y + b.height && p.y + 3 >= b.y,
      );
      if (hit) {
        out.push({ kind: 'hits-machine', source: l.source, target: hit.id, x: p.x, y: p.y });
        break;
      }
    }
  }
  for (let i = 0; i < lanes.length; i++) {
    for (let j = i + 1; j < lanes.length; j++) {
      const a = lanes[i]!, b = lanes[j]!;
      const [ax, ay] = HEADING_VECTORS[a.heading];
      const [bx, by] = HEADING_VECTORS[b.heading];
      if (ax === bx && ay === by) {
        // Parallel, same direction: flag if the lanes are close and their paths overlap in progress.
        const d = Math.abs(lateralOf(a.heading, a.ax, a.ay) - lateralOf(a.heading, b.ax, b.ay));
        if (d < STREAM_CLEARANCE) out.push({ kind: 'too-close', source: a.source, target: b.source, x: b.ax, y: b.ay });
      } else if (ax === -bx && ay === -by) {
        // Opposite directions on (nearly) the same line, approaching each other.
        const d = Math.abs(lateralOf(a.heading, a.ax, a.ay) - lateralOf(a.heading, b.ax, b.ay));
        const approaching = progressOf(a.heading, b.ax, b.ay) > progressOf(a.heading, a.ax, a.ay);
        if (d < STREAM_CLEARANCE && approaching) {
          out.push({ kind: 'head-on', source: a.source, target: b.source, x: Math.round((a.ax + b.ax) / 2), y: Math.round((a.ay + b.ay) / 2) });
        }
      } else {
        // Perpendicular: do the two forward paths come within a glider's width of each other?
        const pa = [...march(a, w, h)];
        const pb = [...march(b, w, h)];
        let hit: { x: number; y: number } | null = null;
        for (const p of pa) {
          if (pb.some((q) => Math.abs(p.x - q.x) <= 3 && Math.abs(p.y - q.y) <= 3)) {
            hit = p;
            break;
          }
        }
        if (hit) out.push({ kind: 'crossing', source: a.source, target: b.source, x: hit.x, y: hit.y });
      }
    }
  }
  return out;
}

export function describeHazard(h: Hazard, name: (id: string) => string): string {
  switch (h.kind) {
    case 'hits-machine':
      return `${name(h.source)}: stream runs into ${name(h.target)} near (${h.x}, ${h.y}).`;
    case 'crossing':
      return `${name(h.source)} and ${name(h.target)}: streams cross near (${h.x}, ${h.y}); gliders will probably collide.`;
    case 'head-on':
      return `${name(h.source)} and ${name(h.target)}: streams run head-on into each other.`;
    case 'too-close':
      return `${name(h.source)} and ${name(h.target)}: parallel streams fewer than ${STREAM_CLEARANCE} lanes apart.`;
  }
}

/**
 * Snap a collector anchor onto the nearest predicted lane within `maxLanes`
 * lanes (optionally only lanes of `heading`). Moves along x only, which shifts
 * the lane by exactly one per cell for every heading.
 */
export function snapToLane(
  x: number,
  y: number,
  lanes: readonly Lane[],
  maxLanes = 3,
  heading?: Heading,
): { x: number; y: number; heading: Heading; source: string } | null {
  let best: { x: number; y: number; heading: Heading; source: string } | null = null;
  let bestD = Infinity;
  for (const l of lanes) {
    if (heading && l.heading !== heading) continue;
    const [hx] = HEADING_VECTORS[l.heading];
    const d = lateralOf(l.heading, l.ax, l.ay) - lateralOf(l.heading, x, y);
    if (Math.abs(d) > maxLanes || Math.abs(d) >= bestD) continue;
    // Only snap downstream of the gun's first glider.
    if (progressOf(l.heading, x + d * hx, y) < progressOf(l.heading, l.ax, l.ay)) continue;
    bestD = Math.abs(d);
    best = { x: x + d * hx, y, heading: l.heading, source: l.source };
  }
  return best;
}

export interface CollectorGate {
  id: string;
  x: number;
  y: number;
  heading: Heading;
}

/**
 * Which collector (if any) sits on each stream: same heading, within the
 * gate's lane tolerance, and downstream of where the stream leaves its gun.
 * Prediction only — the live counters show what is really collected.
 */
export function streamCoverage(lanes: readonly Lane[], gates: readonly CollectorGate[], gateHalfWidth: number): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const l of lanes) {
    const lat = lateralOf(l.heading, l.ax, l.ay);
    const start = progressOf(l.heading, l.ax, l.ay);
    const g = gates.find(
      (c) =>
        c.heading === l.heading &&
        Math.abs(lateralOf(l.heading, c.x, c.y) - lat) <= gateHalfWidth &&
        progressOf(l.heading, c.x, c.y) > start,
    );
    out.set(l.source, g ? g.id : null);
  }
  return out;
}

/**
 * A good place for a new collector on `lane`: the first point at least
 * `minSteps` glider periods downstream of the gun that is clear of every
 * machine's keep-out box and far enough from the edge for gliders to be
 * confirmed before they leave. Returns null if the stream has no such room.
 */
export function recommendCollectorSpot(
  lane: Lane,
  keepOuts: readonly Box[],
  w: number,
  h: number,
  opts: { minSteps?: number; edgeMargin?: number } = {},
): CollectorGate | null {
  const minSteps = opts.minSteps ?? 6;
  const edge = opts.edgeMargin ?? 10;
  const [hx, hy] = HEADING_VECTORS[lane.heading];
  for (let k = minSteps; ; k++) {
    const x = lane.ax + hx * k, y = lane.ay + hy * k;
    if (x < edge || y < edge || x > w - edge - 3 || y > h - edge - 3) return null;
    const blocked = keepOuts.some((b) => x - 2 < b.x + b.width && x + 5 > b.x && y - 2 < b.y + b.height && y + 5 > b.y);
    if (!blocked) return { id: 'recommended', x, y, heading: lane.heading };
  }
}
