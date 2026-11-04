import { describe, expect, it } from 'vitest';
import { stepLife, stepLifeN } from '../../src/core/life';
import { boundingBox, crop, gridsEqual, population } from '../../src/core/world';
import { PATTERN_MANIFEST } from '../../src/patterns/manifest';
import { board, loadPattern } from '../helpers';

describe('pattern manifest', () => {
  it('has complete provenance for every entry', () => {
    for (const e of PATTERN_MANIFEST) {
      for (const k of ['source_url', 'author_or_discoverer', 'retrieved_date', 'license_review', 'attribution'] as const) {
        expect(e[k], `${e.id}.${k}`).toBeTruthy();
      }
      expect(e.rule).toBe('B3/S23');
    }
  });

  it('measured period matches the manifest for still lifes, oscillators and spaceships', () => {
    for (const e of PATTERN_MANIFEST.filter((p) => p.kind !== 'gun')) {
      const w0 = board(e.width + 16, e.height + 16, [{ grid: loadPattern(e.id), x: 8, y: 8 }]);
      let w = w0;
      let period = 0;
      for (let g = 1; g <= 8; g++) {
        w = stepLife(w);
        const bb = boundingBox(w);
        if (bb && gridsEqual(crop(w, bb), loadPattern(e.id))) {
          period = g;
          break;
        }
      }
      expect(period, e.id).toBe(e.period);
    }
  });
});

describe('Gosper glider gun', () => {
  const gun = loadPattern('gosper-glider-gun');

  it('is 36×9 with 36 live cells', () => {
    expect([gun.width, gun.height, population(gun)]).toEqual([36, 9, 36]);
  });

  it('gun region is periodic with period 30 (the gun+stream as a whole is not)', () => {
    const w0 = board(256, 256, [{ grid: gun, x: 10, y: 10 }]);
    const region = { x: 8, y: 8, width: 40, height: 13 };
    const a = stepLifeN(w0, 120);
    const b = stepLifeN(a, 30);
    expect(gridsEqual(crop(a, region), crop(b, region))).toBe(true);
    for (let p = 1; p < 30; p++) {
      expect(gridsEqual(crop(a, region), crop(stepLifeN(a, p), region)), `period ${p}`).toBe(false);
    }
    expect(gridsEqual(a, b)).toBe(false);
  });

  it('emits exactly one 5-cell glider per 30 generations while the stream is in open space', () => {
    let w = stepLifeN(board(256, 256, [{ grid: gun, x: 10, y: 10 }]), 60);
    for (let i = 0; i < 10; i++) {
      const before = population(w);
      w = stepLifeN(w, 30);
      expect(population(w) - before, `cycle ${i}`).toBe(5);
    }
  });
});

describe('Eater 1', () => {
  const eater = loadPattern('eater-1');
  const glider = loadPattern('glider');

  it('consumes a correctly aimed glider and returns to its original state', () => {
    const w0 = board(40, 40, [{ grid: eater, x: 20, y: 20 }, { grid: glider, x: 12, y: 12 }]);
    const w = stepLifeN(w0, 60);
    expect(population(w)).toBe(7);
    expect(boundingBox(w)).toEqual({ x: 20, y: 20, width: 4, height: 4 });
    expect(gridsEqual(crop(w, boundingBox(w)!), eater)).toBe(true);
  });

  it('does not cleanly consume a glider one lane off', () => {
    const w0 = board(40, 40, [{ grid: eater, x: 20, y: 20 }, { grid: glider, x: 12, y: 11 }]);
    const w = stepLifeN(w0, 100);
    const clean = population(w) === 7 && gridsEqual(crop(w, { x: 20, y: 20, width: 4, height: 4 }), eater);
    expect(clean).toBe(false);
  });
});
