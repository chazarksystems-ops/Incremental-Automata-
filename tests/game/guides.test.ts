import { describe, expect, it } from 'vitest';
import { stepLifeN } from '../../src/core/life';
import { transformGrid, type Transform } from '../../src/core/transform';
import { findIsolatedGliders } from '../../src/detectors/scan';
import { HEADING_VECTORS } from '../../src/detectors/templates';
import { laneForGun, laneHazards, snapToLane, type Lane } from '../../src/game/guides';
import { board, loadPattern } from '../helpers';

const gun = loadPattern('gosper-glider-gun');
const I: Transform = { rotation: 0, mirror: false };
const MIRROR: Transform = { rotation: 0, mirror: true };
type G = { id: string; x: number; y: number; t: Transform };

function predictAndRun(guns: G[], size = 128, gens = 700) {
  const lanes = guns.map((g) => laneForGun(g.id, gun, g.x, g.y, g.t));
  const boxes = guns.map((g) => {
    const tg = transformGrid(gun, g.t);
    return { id: g.id, x: g.x, y: g.y, width: tg.width, height: tg.height };
  });
  const hazards = laneHazards(lanes, boxes, size, size);
  const end = stepLifeN(board(size, size, guns.map((g) => ({ grid: gun, x: g.x, y: g.y, transform: g.t }))), gens);
  const seen = findIsolatedGliders(end, -3, -3, size, size);
  const onLane = (l: Lane) => {
    const [hx, hy] = HEADING_VECTORS[l.heading];
    return seen.filter((s) => s.heading === l.heading && hx * s.ax - hy * s.ay === hx * l.ax - hy * l.ay).length;
  };
  return { hazards, gliders: lanes.map(onLane) };
}

describe('stream hazard predictions agree with real runs', () => {
  it('no warning for the Phase 3 two-gun layout, and both streams really survive', () => {
    const r = predictAndRun([{ id: 'A', x: 4, y: 4, t: I }, { id: 'B', x: 4, y: 40, t: I }]);
    expect(r.hazards).toEqual([]);
    expect(r.gliders[0]).toBeGreaterThanOrEqual(10);
    expect(r.gliders[1]).toBeGreaterThanOrEqual(10);
  });

  it('warns when a stream runs into a gun, and that gun really stops producing', () => {
    const r = predictAndRun([{ id: 'A', x: 4, y: 4, t: I }, { id: 'B', x: 40, y: 30, t: I }]);
    expect(r.hazards.map((h) => [h.kind, h.source, h.target])).toEqual([['hits-machine', 'A', 'B']]);
    expect(r.gliders[1]).toBe(0);
  });

  it('warns when streams cross, and gliders really are destroyed on both lanes', () => {
    const solo = predictAndRun([{ id: 'A', x: 4, y: 4, t: I }]).gliders[0]!;
    for (const y of [4, 14]) {
      const r = predictAndRun([{ id: 'A', x: 4, y: 4, t: I }, { id: 'B', x: 86, y, t: MIRROR }]);
      expect(r.hazards.map((h) => h.kind), `B at y=${y}`).toEqual(['crossing']);
      expect(r.gliders[0]!, `B at y=${y}`).toBeLessThan(solo);
    }
  });

  it('flags head-on and too-close parallel streams (geometry)', () => {
    const lanes: Lane[] = [
      { source: 'a', heading: 'SE', ax: 10, ay: 10 },
      { source: 'b', heading: 'NW', ax: 60, ay: 62 }, // lane −2 vs 0, approaching
      { source: 'c', heading: 'SE', ax: 30, ay: 27 }, // lane 3: too close to a
    ];
    const kinds = laneHazards(lanes, [], 128, 128).map((h) => `${h.kind}:${h.source}>${h.target}`);
    expect(kinds).toContain('head-on:a>b');
    expect(kinds).toContain('too-close:a>c');
    // Opposite streams moving apart are fine.
    expect(laneHazards([lanes[0]!, { source: 'd', heading: 'NW', ax: 2, ay: 2 }], [], 128, 128)).toEqual([]);
  });
});

describe('snapToLane', () => {
  const starter = laneForGun('gun-1', gun, 4, 4, I); // SE lane 14

  it('snaps a nearby anchor onto the lane by moving along x', () => {
    expect(snapToLane(75, 64, [starter])).toEqual({ x: 78, y: 64, heading: 'SE', source: 'gun-1' });
    expect(snapToLane(78, 64, [starter])).toEqual({ x: 78, y: 64, heading: 'SE', source: 'gun-1' });
  });

  it('does not snap from too far, upstream of the gun, or to a lane of another heading', () => {
    expect(snapToLane(72, 64, [starter])).toBeNull(); // 6 lanes off: the default collector stays off-lane
    expect(snapToLane(10, -2, [starter])).toBeNull(); // upstream of the first glider
    expect(snapToLane(75, 64, [starter], 3, 'NE')).toBeNull();
  });
});
