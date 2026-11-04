import { describe, expect, it } from 'vitest';
import { ALL_TRANSFORMS, transformName } from '../../src/core/transform';
import { stepLifeN } from '../../src/core/life';
import { findIsolatedGliders } from '../../src/detectors/scan';
import { HEADING_VECTORS } from '../../src/detectors/templates';
import { gunOutput } from '../../src/patterns/gun-output';
import { board, loadPattern } from '../helpers';

describe('gunOutput (predicted lane overlay)', () => {
  const gun = loadPattern('gosper-glider-gun');

  it('starter orientation fires SE on lane 14 when placed at (4,4)', () => {
    const o = gunOutput(gun, { rotation: 0, mirror: false });
    expect(o.heading).toBe('SE');
    expect(4 + o.anchorDx - (4 + o.anchorDy)).toBe(14);
  });

  it('every orientation: all gliders of a real run lie on the predicted lane', () => {
    for (const t of ALL_TRANSFORMS) {
      const o = gunOutput(gun, t);
      const [hx, hy] = HEADING_VECTORS[o.heading];
      const x = 70, y = 70;
      const w = stepLifeN(board(180, 180, [{ grid: gun, x, y, transform: t }]), 250);
      const seen = findIsolatedGliders(w, 0, 0, 180, 180);
      expect(seen.length, transformName(t)).toBeGreaterThan(3);
      const lane = hx * (x + o.anchorDx) - hy * (y + o.anchorDy);
      for (const s of seen) {
        expect(s.heading, transformName(t)).toBe(o.heading);
        expect(hx * s.ax - hy * s.ay, transformName(t)).toBe(lane);
        // The predicted start is upstream of (or at) every real glider of the stream.
        expect(hx * s.ax + hy * s.ay, transformName(t)).toBeGreaterThanOrEqual(hx * (x + o.anchorDx) + hy * (y + o.anchorDy));
      }
    }
  });
});
