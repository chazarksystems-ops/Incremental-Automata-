import { describe, expect, it } from 'vitest';
import { stepLifeN } from '../../src/core/life';
import { ALL_TRANSFORMS, transformGrid } from '../../src/core/transform';
import { createWorld } from '../../src/core/world';
import { findIsolatedGliders, findIsolatedGlidersNaive } from '../../src/detectors/scan';
import { defaultScenario } from '../../src/scenarios/default';
import { board, loadPattern } from '../helpers';

describe('findIsolatedGliders (fast sliding-window scan)', () => {
  it('matches the naive scan on gun streams, edge debris and soups, for any region incl. off-board', () => {
    const worlds = [
      stepLifeN(defaultScenario(loadPattern('gosper-glider-gun')), 1700),
      board(40, 40, ALL_TRANSFORMS.map((t, i) => ({ grid: transformGrid(loadPattern('glider'), t), x: 1 + (i % 4) * 9, y: i < 4 ? 0 : 37 }))),
    ];
    let seed = 3;
    for (let k = 0; k < 6; k++) {
      const w = createWorld(48, 37);
      for (let i = 0; i < w.cells.length; i++) w.cells[i] = (seed = (seed * 16807) % 2147483647) % 100 < 30 ? 1 : 0;
      worlds.push(stepLifeN(w, 20 + k * 40));
    }
    for (const w of worlds) {
      for (const [x0, y0, x1, y1] of [[-3, -3, w.width + 2, w.height + 2], [10, 5, 30, 20], [w.width - 7, 0, w.width + 5, w.height], [-10, -10, -5, -5]]) {
        expect(findIsolatedGliders(w, x0!, y0!, x1!, y1!)).toEqual(findIsolatedGlidersNaive(w, x0!, y0!, x1!, y1!));
        expect(findIsolatedGliders(w, x0!, y0!, x1!, y1!, 'SE')).toEqual(findIsolatedGlidersNaive(w, x0!, y0!, x1!, y1!, 'SE'));
      }
    }
    expect(findIsolatedGliders(worlds[0]!, -3, -3, 130, 130).length).toBeGreaterThan(5);
  });
});
