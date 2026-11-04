import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/core/hash';
import { DEFAULT_CONFIG } from '../../src/game/config';
import { Factory, type FactoryCommand, type GameSnapshot } from '../../src/game/factory';
import { History } from '../../src/game/history';
import { parseCheckpoints, serializeCheckpoints, type Checkpoint } from '../../src/game/save';
import { compareTrials, runTrial, Trial } from '../../src/game/trial';
import { newGame } from '../../src/scenarios/default';
import { BLUEPRINTS, loadPattern } from '../helpers';

const ID = { rotation: 0, mirror: false } as const;
const gun = loadPattern('gosper-glider-gun');
const game = () => new Factory(newGame(gun), BLUEPRINTS);
const restore = (s: GameSnapshot) => Factory.fromSnapshot(s, BLUEPRINTS);

/** A small "player" wrapper: every action is recorded in history first, as the UI does. */
function player(f0 = game()) {
  let f = f0;
  const h = new History();
  return {
    get f() { return f; },
    h,
    act(cmd: FactoryCommand, label: string = cmd.type, key?: string) {
      const before = f.snapshot();
      const r = f.apply(cmd);
      if (r.ok) h.record(before, label, key);
      return r;
    },
    undo() { const e = h.undo(f.snapshot()); if (e) f = restore(e.snapshot); return e; },
    redo() { const e = h.redo(f.snapshot()); if (e) f = restore(e.snapshot); return e; },
  };
}

describe('undo / redo', () => {
  it('undo restores the exact pre-action state and redo the exact undone state', () => {
    const p = player();
    p.f.step(400);
    const s0 = p.f.snapshot();
    p.act({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
    p.f.step(700);
    const s1 = p.f.snapshot();
    expect(p.f.economy.energy).toBeGreaterThan(10);
    p.act({ type: 'build-gun', x: 4, y: 40, transform: ID });
    const s2 = p.f.snapshot();

    expect(p.undo()?.label).toBe('build-gun');
    expect(p.f.snapshot()).toEqual(s1);
    expect(p.undo()?.label).toBe('move-detector');
    expect(p.f.snapshot()).toEqual(s0); // time goes back too
    expect(p.undo()).toBeNull();
    p.redo();
    expect(p.f.snapshot()).toEqual(s1);
    p.redo();
    expect(p.f.snapshot()).toEqual(s2);
    expect(p.redo()).toBeNull();
  });

  it('after undo+redo the game continues exactly as if nothing happened', () => {
    const a = player();
    const b = player();
    for (const p of [a, b]) {
      p.f.step(300);
      p.act({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
      p.f.step(600);
      p.act({ type: 'build-gun', x: 4, y: 40, transform: ID });
    }
    b.undo();
    b.undo();
    b.redo();
    b.redo();
    a.f.step(1500);
    b.f.step(1500);
    expect(b.f.snapshot()).toEqual(a.f.snapshot());
  });

  it('a new action clears redo; a drag gesture is one undo step; the stack is bounded', () => {
    const p = player();
    p.f.step(200);
    for (let x = 70; x <= 78; x++) p.act({ type: 'move-detector', id: 'collector-1', x, y: 64 }, 'move', 'drag-1');
    expect(p.h.depth).toEqual({ undo: 1, redo: 0 });
    p.undo();
    expect(p.f.detectors[0]!.config).toMatchObject({ x: 72, y: 64 });
    p.act({ type: 'set-detector-heading', id: 'collector-1', heading: 'SW' });
    expect(p.h.canRedo).toBe(false);

    const h = new History(3);
    for (let i = 0; i < 5; i++) h.record(game().snapshot(), `a${i}`);
    expect(h.depth.undo).toBe(3);
  });

  it('failed actions are not recorded', () => {
    const p = player();
    p.act({ type: 'build-gun', x: 4, y: 40, transform: ID }); // no energy
    expect(p.h.canUndo).toBe(false);
  });

  it('undoing an expansion restores the small chamber exactly', () => {
    const p = player(new Factory({ ...newGame(gun), sandbox: true }, BLUEPRINTS));
    p.f.step(100);
    const before = p.f.snapshot();
    p.act({ type: 'buy-upgrade', upgrade: 'expansion' });
    expect(p.f.world.width).toBe(192);
    p.undo();
    expect(p.f.snapshot()).toEqual(before);
  });
});

describe('trials (tested throughput)', () => {
  const onLane = () => {
    const f = game();
    f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
    f.step(600);
    return f;
  };

  it('never touches the live game and is deterministic', () => {
    const f = onLane();
    const snap = f.snapshot();
    const frozen = JSON.stringify(snap);
    const a = runTrial(snap, 'A', 900, BLUEPRINTS);
    const b = runTrial(snap, 'A', 900, BLUEPRINTS);
    expect(a).toEqual(b);
    expect(JSON.stringify(snap)).toBe(frozen);
    expect(f.snapshot()).toEqual(snap);
  });

  it('measures exactly what really happens when the game runs on', () => {
    const f = onLane();
    const r = runTrial(f.snapshot(), 'now', 900, BLUEPRINTS);
    const before = { e: f.economy.energy, lost: f.losses.total };
    f.step(900);
    expect(r.energyGained).toBe(f.economy.energy - before.e);
    expect(r.lost).toBe(f.losses.total - before.lost);
    expect(r.steadyRate).toBe(10); // one gun, period 30
    expect(r.steadyLost).toBe(0);
    expect(r.perCollector).toEqual({ 'collector-1': r.collected });
    expect(r.finalHash).toBe(hashWorld(f.world));
  });

  it('can be advanced in slices with the same result', () => {
    const snap = onLane().snapshot();
    const t = new Trial(snap, 'sliced', 900, BLUEPRINTS);
    let slices = 0;
    while (!t.advance(37)) slices++;
    expect(slices).toBeGreaterThan(20);
    expect(t.result()).toEqual(runTrial(snap, 'sliced', 900, BLUEPRINTS));
  });

  it('compares variants', () => {
    const base = { steadyRate: 10, steadyLost: 10, generations: 900 } as never;
    expect(compareTrials(base, { steadyRate: 20, steadyLost: 0, generations: 900 } as never)).toEqual({
      verdict: 'better', summary: 'Better: collected +10 per 300 gen, lost −10.',
    });
    expect(compareTrials(base, { steadyRate: 10, steadyLost: 10, generations: 900 } as never)).toEqual({
      verdict: 'same', summary: 'No change: collected ±0 per 300 gen, lost ±0.',
    });
    expect(compareTrials(base, { steadyRate: 0, steadyLost: 20, generations: 900 } as never).verdict).toBe('worse');
    expect(compareTrials(base, { steadyRate: 20, steadyLost: 20, generations: 900 } as never).verdict).toBe('mixed');
  });
});

describe('Phase 4 gate: experiment → detect → keep or restore, with no state corruption', () => {
  it('the off-lane → on-lane experiment is detected as better, and discard restores the baseline exactly', () => {
    const p = player();
    p.f.step(500);
    const baseline = p.f.snapshot(); // start experiment
    const baseRes = runTrial(baseline, 'baseline', DEFAULT_CONFIG.trialGenerations, BLUEPRINTS);

    p.act({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 }); // the change being tested
    const variant = p.f.snapshot();
    const varRes = runTrial(variant, 'variant', DEFAULT_CONFIG.trialGenerations, BLUEPRINTS);
    expect(baseRes.steadyRate).toBe(0);
    expect(baseRes.steadyLost).toBe(10);
    expect(varRes.steadyRate).toBe(10);
    expect(compareTrials(baseRes, varRes).verdict).toBe('better');
    expect(p.f.snapshot()).toEqual(variant); // testing changed nothing

    // Discard: back to the baseline, bit for bit, and it then evolves exactly like a never-touched game.
    const discarded = restore(baseline);
    const control = player();
    control.f.step(500);
    expect(discarded.snapshot()).toEqual(control.f.snapshot());
    discarded.step(1000);
    control.f.step(1000);
    expect(discarded.snapshot()).toEqual(control.f.snapshot());
  });

  it('a harmful experiment (a gun whose stream crosses the collected one) is detected as worse', () => {
    // Sandbox rules (free, orientation unlocked) so the variant can be built at any time.
    const f = new Factory({ ...newGame(gun), sandbox: true }, BLUEPRINTS);
    f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
    f.step(1300);
    const baseline = f.snapshot();
    const v = restore(baseline);
    expect(v.apply({ type: 'build-gun', x: 86, y: 14, transform: { rotation: 0, mirror: true } }).ok).toBe(true);
    const cmp = compareTrials(runTrial(baseline, 'b', 900, BLUEPRINTS), runTrial(v.snapshot(), 'v', 900, BLUEPRINTS));
    expect(cmp.verdict).toBe('worse');
  });

  it('in factory mode a gun cannot be dropped onto a live stream at all (placement rule)', () => {
    const f = game();
    f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
    f.step(1300);
    expect(f.apply({ type: 'build-gun', x: 40, y: 30, transform: ID })).toMatchObject({ ok: false });
  });
});

describe('checkpoints', () => {
  it('round-trip through storage format and resume identically', () => {
    const f = game();
    f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
    f.step(777);
    const cp: Checkpoint = { id: 'cp-1', name: 'Before second gun', generation: f.generation, createdAt: '2026-11-04T12:00:00Z', snapshot: f.snapshot() };
    const parsed = parseCheckpoints(serializeCheckpoints([cp]), BLUEPRINTS);
    expect(parsed.dropped).toBe(0);
    expect(parsed.checkpoints).toEqual([cp]);
    const g = restore(parsed.checkpoints[0]!.snapshot);
    g.step(500);
    f.step(500);
    expect(g.snapshot()).toEqual(f.snapshot());
  });

  it('drops corrupt entries but keeps valid ones', () => {
    const good: Checkpoint = { id: 'ok', name: 'ok', generation: 0, createdAt: '2026-11-04T12:00:00Z', snapshot: game().snapshot() };
    const bad = { ...good, id: 'bad', snapshot: { ...good.snapshot, rule: 'B36/S23' } } as unknown as Checkpoint;
    const r = parseCheckpoints(serializeCheckpoints([bad, good, { nonsense: true } as never]), BLUEPRINTS);
    expect(r.checkpoints.map((c) => c.id)).toEqual(['ok']);
    expect(r.dropped).toBe(2);
    expect(parseCheckpoints('{', BLUEPRINTS).error).toBeTruthy();
  });
});
