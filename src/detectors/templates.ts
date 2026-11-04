import { stepLife } from '../core/life';
import { parseRleOrThrow } from '../core/rle';
import { stampGrid } from '../core/stamp';
import { ALL_TRANSFORMS, transformGrid } from '../core/transform';
import { boundingBox, crop, createWorld } from '../core/world';

/**
 * Glider recognition templates, derived at start-up by *running the engine* on
 * the canonical glider in all 8 orientations — not hand-written.
 *
 * Each of the 4 headings has 4 phase shapes (16 shapes in total, all 3×3).
 * For each shape we store `anchorDx/anchorDy`: the offset from the shape's
 * top-left to the top-left of the phase-0 shape that started the current
 * 4-generation cycle. The anchor of a real glider therefore moves only on
 * phase-0 generations, by exactly the heading vector, and its lateral
 * coordinate is constant for the glider's whole life.
 */

export type Heading = 'NE' | 'NW' | 'SE' | 'SW';
export const HEADINGS: readonly Heading[] = ['SE', 'SW', 'NW', 'NE'];
export const HEADING_VECTORS: Record<Heading, readonly [number, number]> = {
  NE: [1, -1],
  NW: [-1, -1],
  SE: [1, 1],
  SW: [-1, 1],
};

export interface GliderTemplate {
  heading: Heading;
  phase: 0 | 1 | 2 | 3;
  /** 9-bit mask of the 3×3 shape, bit index = y*3 + x. */
  mask: number;
  anchorDx: number;
  anchorDy: number;
}

const CANONICAL_GLIDER = parseRleOrThrow('x = 3, y = 3, rule = B3/S23\nbo$2bo$3o!').grid;

function headingOf(dx: number, dy: number): Heading {
  for (const h of HEADINGS) {
    const [hx, hy] = HEADING_VECTORS[h];
    if (hx === dx && hy === dy) return h;
  }
  throw new Error(`Not a glider displacement: (${dx}, ${dy})`);
}

function buildTemplates(): GliderTemplate[] {
  const out: GliderTemplate[] = [];
  const seeded = new Set<Heading>();
  for (const t of ALL_TRANSFORMS) {
    const shape = transformGrid(CANONICAL_GLIDER, t);
    const r = stampGrid(createWorld(16, 16), shape, 6, 6, { margin: 0 });
    if (!r.ok) throw new Error(r.message);
    let w = r.world;
    const tl: Array<{ x: number; y: number; mask: number }> = [];
    for (let k = 0; k < 4; k++) {
      const bb = boundingBox(w)!;
      if (bb.width !== 3 || bb.height !== 3) throw new Error('Glider phase is not 3×3');
      const g = crop(w, bb);
      let mask = 0;
      for (let i = 0; i < 9; i++) if (g.cells[i]) mask |= 1 << i;
      tl.push({ x: bb.x, y: bb.y, mask });
      w = stepLife(w);
    }
    const end = boundingBox(w)!;
    const heading = headingOf(end.x - tl[0]!.x, end.y - tl[0]!.y);
    if (seeded.has(heading)) continue;
    seeded.add(heading);
    tl.forEach((p, k) =>
      out.push({ heading, phase: k as 0 | 1 | 2 | 3, mask: p.mask, anchorDx: tl[0]!.x - p.x, anchorDy: tl[0]!.y - p.y }),
    );
  }
  if (out.length !== 16 || new Set(out.map((t) => t.mask)).size !== 16) {
    throw new Error('Expected 16 distinct glider templates');
  }
  return out;
}

export const GLIDER_TEMPLATES: readonly GliderTemplate[] = buildTemplates();

/** mask → template (masks are unique across headings and phases). */
export const TEMPLATE_BY_MASK: ReadonlyMap<number, GliderTemplate> = new Map(GLIDER_TEMPLATES.map((t) => [t.mask, t]));
