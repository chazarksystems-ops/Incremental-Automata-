import { describe, expect, it } from 'vitest';
import { stepLifeN } from '../../src/core/life';
import { transformGrid, type Transform } from '../../src/core/transform';
import { boundingBox, type Grid, type WorldState } from '../../src/core/world';
import { suggestedShiftX, type DetectorConfig } from '../../src/detectors/detector';
import type { Heading } from '../../src/detectors/templates';
import { auditEconomy } from '../../src/economy/ledger';
import { Factory, replayFactory } from '../../src/game/factory';
import { DEFAULT_COLLECTOR, ON_LANE_COLLECTOR_POSITION, defaultScenario } from '../../src/scenarios/default';
import { board, loadPattern, rleGrid } from '../helpers';

const glider = loadPattern('glider'); // SE heading, phase 0, anchor = top-left
const gun = loadPattern('gosper-glider-gun');
const T = (rotation: Transform['rotation'], mirror = false): Transform => ({ rotation, mirror });
const gate = (x: number, y: number, heading: Heading = 'SE'): DetectorConfig => ({ id: 'c', x, y, heading });

function factory(items: Array<{ grid: Grid; x: number; y: number; transform?: Transform }>, det: DetectorConfig, size = 96, pre = 0) {
  let w: WorldState = board(size, size, items);
  if (pre) w = stepLifeN(w, pre);
  return new Factory(w, [det]);
}

describe('collector — MASTER_PLAN §4 tests', () => {
  it('1. exactly one award per known glider crossing (every start phase, every lane inside the gate)', () => {
    for (let phase = 0; phase < 4; phase++) {
      for (const lane of [-1, 0, 1]) {
        // Glider lane lateral = 0; gate lateral = lane ⇒ |offset| ≤ gateHalfWidth (1).
        const f = factory([{ grid: glider, x: 10, y: 10 }], gate(40 + lane, 40), 96, phase);
        f.step(250);
        expect(f.economy.receipts, `phase ${phase} lane ${lane}`).toHaveLength(1);
        expect(f.economy.energy).toBe(1);
        expect(f.detectors[0]!.nearMisses).toBe(0);
      }
    }
  });

  it('2. no award from still lifes, oscillators, unrecognised debris or a non-isolated glider shape', () => {
    const items = [
      { grid: loadPattern('block'), x: 38, y: 38 },
      { grid: loadPattern('blinker'), x: 44, y: 40 },
      { grid: rleGrid('x = 4, y = 3\nb2o$o2bo$b2o!'), x: 34, y: 44 }, // beehive
      { grid: loadPattern('eater-1'), x: 42, y: 46 },
    ];
    const f = factory(items, gate(40, 40));
    f.step(300);
    expect(f.economy.receipts).toHaveLength(0);
    expect(f.detectors[0]!.nearMisses).toBe(0);

    // A glider-shaped clump touching a block: it matches a template mask but is not isolated.
    const clump = factory(
      [{ grid: glider, x: 39, y: 39 }, { grid: loadPattern('block'), x: 42, y: 40 }],
      gate(40, 40),
    );
    const events = clump.step(1);
    expect(events.receipts).toHaveLength(0);
    clump.step(300);
    expect(clump.economy.receipts).toHaveLength(0);
  });

  it('2b. collision debris crossing the gate does not pay (glider destroyed by a block upstream)', () => {
    // The glider at (10,10) runs into a block on its lane well before the gate.
    const f = factory([{ grid: glider, x: 10, y: 10 }, { grid: loadPattern('block'), x: 22, y: 23 }], gate(40, 40));
    f.step(400);
    expect(f.economy.receipts).toHaveLength(0);
  });

  it('3. a glider overlapping the gate for several generations is counted once', () => {
    const f = factory([{ grid: glider, x: 10, y: 10 }], gate(40, 40));
    let overlapping = 0;
    let total = 0;
    for (let g = 0; g < 250; g++) {
      total += f.step(1).receipts.length;
      const w = f.world;
      // gate anchor cell region (3×3 at the gate) contains live glider cells
      let live = 0;
      for (let y = 40; y < 43; y++) for (let x = 40; x < 43; x++) live += w.cells[y * w.width + x]!;
      if (live) overlapping++;
    }
    expect(overlapping).toBeGreaterThanOrEqual(4);
    expect(total).toBe(1);
  });

  it('4. two consecutive gun gliders count as two, 30 generations apart', () => {
    const f = new Factory(defaultScenario(gun), [{ ...DEFAULT_COLLECTOR, ...ON_LANE_COLLECTOR_POSITION }]);
    let arrivals: number[] = [];
    for (let g = 0; g < 600 && arrivals.length < 2; g++) arrivals = [...arrivals, ...f.step(1).receipts.map((r) => r.generation)];
    expect(arrivals).toHaveLength(2);
    expect(arrivals[1]! - arrivals[0]!).toBe(30);
    expect(new Set(f.economy.receipts.map((r) => r.passageId)).size).toBe(2);
  });

  it('5. shifting the gate off-lane stops awards; near misses report the offset', () => {
    const near = factory([{ grid: glider, x: 10, y: 10 }], gate(42, 40)); // lateral offset −2
    near.step(250);
    expect(near.economy.receipts).toHaveLength(0);
    expect(near.detectors[0]!.nearMisses).toBe(1);
    expect(near.detectors[0]!.lastMissOffset).toBe(-2);
    expect(suggestedShiftX('SE', -2)).toBe(-2); // move left 2 → back on lane

    const far = factory([{ grid: glider, x: 10, y: 10 }], gate(70, 40)); // far off-lane
    far.step(250);
    expect(far.economy.receipts).toHaveLength(0);
    expect(far.detectors[0]!.nearMisses).toBe(0);

    // Default chamber: collector starts 6 lanes off the stream.
    const f = new Factory(defaultScenario(gun), [DEFAULT_COLLECTOR]);
    f.step(600);
    expect(f.economy.energy).toBe(0);
    const d = f.detectors[0]!;
    expect(d.nearMisses).toBeGreaterThan(0);
    expect(d.lastMissOffset).toBe(6);
    expect(DEFAULT_COLLECTOR.x + suggestedShiftX('SE', 6)).toBe(78);
    f.apply({ type: 'move-detector', id: d.config.id, x: 78, y: DEFAULT_COLLECTOR.y });
    f.step(300);
    expect(f.economy.energy).toBeGreaterThanOrEqual(9);
  });

  it('6. restart from snapshot reproduces receipts exactly (incl. mid-flight tracks)', () => {
    const det = { ...DEFAULT_COLLECTOR, ...ON_LANE_COLLECTOR_POSITION };
    const straight = new Factory(defaultScenario(gun), [det]);
    straight.step(1000);

    const a = new Factory(defaultScenario(gun), [det]);
    a.step(437); // gliders are mid-observation here
    expect(a.detectors[0]!.tracks.length).toBeGreaterThan(0);
    const snap = JSON.parse(JSON.stringify(a.snapshot()));
    const b = Factory.fromSnapshot(snap);
    b.step(563);
    expect(b.economy).toEqual(straight.economy);
    expect(b.detectors).toEqual(straight.detectors);

    // Command replay from the initial snapshot, including collector moves.
    const c = new Factory(defaultScenario(gun), [DEFAULT_COLLECTOR]);
    c.step(200);
    c.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
    c.step(300);
    c.apply({ type: 'set-cell', x: 120, y: 5, alive: true });
    c.apply({ type: 'move-detector', id: 'collector-1', x: 90, y: 76 });
    c.step(500);
    const r = replayFactory(c.initialSnapshot, c.log, 1000);
    expect(r.economy).toEqual(c.economy);
    expect(r.snapshot()).toEqual(c.snapshot());
  });

  it('7. batched / fast stepping skips no arrivals', () => {
    const det = { ...DEFAULT_COLLECTOR, ...ON_LANE_COLLECTOR_POSITION };
    const single = new Factory(defaultScenario(gun), [det]);
    for (let i = 0; i < 2000; i++) single.step(1);

    const batched = new Factory(defaultScenario(gun), [det]);
    batched.step(2000);

    const chunked = new Factory(defaultScenario(gun), [det]);
    let seed = 9;
    while (chunked.generation < 2000) {
      seed = (seed * 16807) % 2147483647;
      chunked.step(Math.min(1 + (seed % 64), 2000 - chunked.generation));
    }
    expect(single.economy.receipts.length).toBeGreaterThan(50);
    expect(batched.economy).toEqual(single.economy);
    expect(chunked.economy).toEqual(single.economy);
  });
});

describe('collector — adversarial', () => {
  it('ignores gliders of every other heading crossing or passing the gate', () => {
    // NW glider travelling up-left through the SE gate; NE and SW gliders crossing along the gate line.
    const cases: Array<[Transform, number, number]> = [
      [T(180), 70, 70], // NW
      [T(90), 70, 10], // SW
      [T(270), 10, 70], // NE
    ];
    for (const [t, x, y] of cases) {
      const f = factory([{ grid: transformGrid(glider, t), x, y }], gate(40, 40));
      f.step(300);
      expect(f.economy.receipts, JSON.stringify(t)).toHaveLength(0);
    }
  });

  it('counts gliders of its own heading for every heading', () => {
    const cases: Array<[Heading, Transform, number, number]> = [
      ['SE', T(0), 10, 10],
      ['SW', T(90), 70, 10],
      ['NW', T(180), 70, 70],
      ['NE', T(270), 10, 70],
    ];
    for (const [heading, t, x, y] of cases) {
      // All four paths cross (40,40); each gate is on its glider's lane.
      const f = factory([{ grid: transformGrid(glider, t), x, y }], gate(40, 40, heading));
      f.step(300);
      expect(f.economy.receipts, heading).toHaveLength(1);
    }
  });

  it('a glider that first appears past the gate never pays', () => {
    const f = factory([{ grid: glider, x: 42, y: 42 }], gate(40, 40));
    f.step(200);
    expect(f.economy.receipts).toHaveLength(0);
  });

  it('moving the collector back in front of the same glider cannot earn twice', () => {
    const f = factory([{ grid: glider, x: 10, y: 10 }], gate(30, 30));
    let paid = 0;
    for (let hop = 0; hop < 5; hop++) {
      for (let g = 0; g < 80; g++) paid += f.step(1).receipts.length;
      // Jump the gate a few cells ahead of the glider's current position, on its lane.
      const bb = boundingBox(f.world)!;
      f.apply({ type: 'move-detector', id: 'c', x: bb.x + 6, y: bb.y + 6 });
    }
    expect(f.detectors[0]!.collected).toBeGreaterThan(1); // the gate *did* see it cross repeatedly…
    expect(paid).toBe(1); // …but the ledger paid once
    expect(f.economy.energy).toBe(1);
  });

  it('a glider truncated by the board edge before reaching the gate does not pay', () => {
    const f = factory([{ grid: glider, x: 100, y: 100 }], gate(126, 126), 128);
    f.step(200);
    expect(f.economy.receipts).toHaveLength(0);
  });

  it('a glider that crosses but is destroyed before confirmation does not pay', () => {
    // Stamp a glider just before the gate and a block right behind the gate:
    // it crosses, then collides within the confirmation window.
    const f = new Factory(board(96, 96, [{ grid: glider, x: 39, y: 39 }, { grid: loadPattern('block'), x: 43, y: 43 }]), [gate(40, 40)]);
    f.step(200);
    expect(f.economy.receipts).toHaveLength(0);
  });

  it('the detector never changes the board', () => {
    const det = { ...DEFAULT_COLLECTOR, ...ON_LANE_COLLECTOR_POSITION };
    const f = new Factory(defaultScenario(gun), [det]);
    f.step(1500);
    expect(f.world).toEqual(stepLifeN(defaultScenario(gun), 1500));
    expect(auditEconomy(f.economy)).toBe(true);
  });
});
