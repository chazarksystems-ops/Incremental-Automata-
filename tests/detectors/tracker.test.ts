import { describe, expect, it } from 'vitest';
import { stepLifeN } from '../../src/core/life';
import { transformGrid } from '../../src/core/transform';
import { boundingBox, crop, withCell, type Grid, type WorldState } from '../../src/core/world';
import { createDetector, observe, updateDetector, type DetectorState } from '../../src/detectors/detector';
import { DEFAULT_CONFIG, type DetectorParams } from '../../src/game/config';
import { board, loadPattern } from '../helpers';

// Unit tests of the tracker in isolation. updateDetector is a pure function of
// (state, world), so we can feed it synthetic generation sequences — including
// physically impossible ones — to check each defence on its own.

const P: DetectorParams = DEFAULT_CONFIG.detector;
const glider = loadPattern('glider');
/** SE glider shape at phase k (canonical glider evolved k generations, cropped). */
const phase = (k: number): Grid => {
  const w = stepLifeN(board(12, 12, [{ grid: glider, x: 4, y: 4 }]), k);
  return crop(w, boundingBox(w)!);
};
/** Top-left of phase k for a glider whose current-cycle anchor is (ax, ay) — offsets from the templates. */
const TL_OFFSET = [[0, 0], [0, 1], [0, 1], [1, 1]] as const;
const frame = (gen: number, items: Array<{ k: number; ax: number; ay: number }>): WorldState => {
  const w = board(64, 64, items.map(({ k, ax, ay }) => ({ grid: phase(k), x: ax + TL_OFFSET[k]![0], y: ay + TL_OFFSET[k]![1] })));
  return { ...w, generation: gen };
};
const det = () => createDetector({ id: 'd', x: 30, y: 30, heading: 'SE' });
function run(frames: WorldState[], params: DetectorParams = P): { state: DetectorState; signals: number } {
  let state = det();
  let signals = 0;
  for (const f of frames) {
    const u = updateDetector(state, f, params);
    state = u.state;
    signals += u.signals.length;
  }
  return { state, signals };
}

describe('observe()', () => {
  it('sees an isolated glider at its anchor', () => {
    expect(observe(frame(0, [{ k: 2, ax: 26, ay: 26 }]), det().config, P)).toEqual([{ phase: 2, ax: 26, ay: 26 }]);
  });

  it('requires the 1-cell ring around the glider to be empty (isolation)', () => {
    const w = frame(0, [{ k: 0, ax: 26, ay: 26 }]);
    for (const [x, y] of [[25, 26], [29, 28], [27, 25], [26, 29], [25, 25], [29, 29]] as const) {
      expect(observe(withCell(w, x, y, true), det().config, P), `${x},${y}`).toEqual([]);
    }
    expect(observe(withCell(w, 30, 26, true), det().config, P)).toHaveLength(1); // 2 cells away is fine
  });

  it('only reports gliders of its own heading', () => {
    const nw = transformGrid(glider, { rotation: 180, mirror: false });
    const w = board(64, 64, [{ grid: nw, x: 27, y: 27 }]);
    expect(observe(w, det().config, P)).toEqual([]);
    expect(observe(w, { ...det().config, heading: 'NW' }, P)).toHaveLength(1);
  });
});

describe('updateDetector() tracking', () => {
  // Anchor progress relative to the gate (30,30): (ax+ay) − 60. Crossing when it reaches ≥ 0.
  const realGlider = (fromGen: number, toGen: number, startAnchor: number) => {
    const frames: WorldState[] = [];
    for (let g = fromGen; g <= toGen; g++) {
      const k = g % 4;
      const a = startAnchor + Math.floor(g / 4);
      frames.push(frame(g, [{ k, ax: a, ay: a }]));
    }
    return frames;
  };

  it('pays once for a consistent glider crossing the gate', () => {
    const { signals, state } = run(realGlider(0, 40, 26)); // anchor 26→36 crosses 30 at gen 16
    expect(signals).toBe(1);
    expect(state.collected).toBe(1);
  });

  it('a phase skip breaks the track even when the anchor is consistent', () => {
    // gen0 phase 1 → gen1 phase 3 (skipped phase 2) at the same anchor, then a
    // consistent crossing at gen2 and a vanish. With the phase check the track
    // restarts at gen1 and is only 3 observations old when it disappears.
    const frames = [
      frame(0, [{ k: 1, ax: 29, ay: 29 }]),
      frame(1, [{ k: 3, ax: 29, ay: 29 }]),
      frame(2, [{ k: 0, ax: 30, ay: 30 }]),
      frame(3, [{ k: 1, ax: 30, ay: 30 }]),
      frame(4, []),
    ];
    const r = run(frames);
    expect(r.signals).toBe(0);
    expect(run(frames.slice(1, 4)).state.tracks[0]!.age).toBe(3);
  });

  it('a wrong displacement at phase 0 breaks the track', () => {
    // phase 3 at anchor 29, then phase 0 at anchor 31 (jumped 2 instead of 1)
    const frames = [frame(0, [{ k: 3, ax: 29, ay: 29 }]), frame(1, [{ k: 0, ax: 31, ay: 31 }])];
    expect(run(frames).state.tracks[0]!.age).toBe(1);
  });

  it(`a crossing is only paid after ${P.confirmGenerations} consistent observations`, () => {
    // First seen at phase 2 just before the gate; crosses on the next phase-0 generation.
    const seen = (n: number) =>
      Array.from({ length: n }, (_, i) => {
        const g = 2 + i;
        return frame(g, [{ k: g % 4, ax: 29 + Math.floor(g / 4), ay: 29 + Math.floor(g / 4) }]);
      });
    // gens 2,3 (age 1,2), gen 4 crosses at age 3 → not yet confirmed; then it vanishes.
    const vanished = [...seen(3), frame(5, [])];
    expect(run(vanished).signals).toBe(0);
    expect(run(seen(4)).signals).toBe(1); // one more consistent generation → paid
    expect(run(seen(3), { ...P, confirmGenerations: 1 }).signals).toBe(1);
  });
});
