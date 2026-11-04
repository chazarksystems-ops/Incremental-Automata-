import { describe, expect, it } from 'vitest';
import { stepLife } from '../../src/core/life';
import { ALL_TRANSFORMS, transformGrid } from '../../src/core/transform';
import { boundingBox, crop } from '../../src/core/world';
import { GLIDER_TEMPLATES, HEADING_VECTORS, TEMPLATE_BY_MASK } from '../../src/detectors/templates';
import { board, loadPattern } from '../helpers';

const maskOf = (cells: Uint8Array) => cells.reduce((m, v, i) => m | (v ? 1 << i : 0), 0);

describe('glider templates', () => {
  it('has 16 distinct shapes, 4 phases per heading, matching the library glider', () => {
    expect(GLIDER_TEMPLATES).toHaveLength(16);
    for (const h of ['NE', 'NW', 'SE', 'SW'] as const) {
      expect(GLIDER_TEMPLATES.filter((t) => t.heading === h).map((t) => t.phase).sort()).toEqual([0, 1, 2, 3]);
    }
    expect(TEMPLATE_BY_MASK.get(maskOf(loadPattern('glider').cells))).toMatchObject({ heading: 'SE', phase: 0 });
  });

  it('every orientation of a running glider matches a template every generation, with a constant-lane anchor', () => {
    for (const t of ALL_TRANSFORMS) {
      let w = board(40, 40, [{ grid: transformGrid(loadPattern('glider'), t), x: 18, y: 18 }]);
      let prev: { ax: number; ay: number; phase: number; heading: string } | null = null;
      for (let g = 0; g < 24; g++) {
        const bb = boundingBox(w)!;
        const tpl = TEMPLATE_BY_MASK.get(maskOf(crop(w, bb).cells));
        expect(tpl, `gen ${g}`).toBeDefined();
        const cur = { ax: bb.x + tpl!.anchorDx, ay: bb.y + tpl!.anchorDy, phase: tpl!.phase, heading: tpl!.heading };
        if (prev) {
          const [hx, hy] = HEADING_VECTORS[tpl!.heading];
          expect(cur.heading).toBe(prev.heading);
          expect(cur.phase).toBe((prev.phase + 1) % 4);
          expect([cur.ax, cur.ay]).toEqual(cur.phase === 0 ? [prev.ax + hx, prev.ay + hy] : [prev.ax, prev.ay]);
        }
        prev = cur;
        w = stepLife(w);
      }
    }
  });
});
