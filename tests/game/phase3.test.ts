import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/core/hash';
import { stepLifeN } from '../../src/core/life';
import { crop, gridsEqual, population } from '../../src/core/world';
import { auditEconomy, collectedCount, receiptsInWindow } from '../../src/economy/ledger';
import { Factory, replayFactory } from '../../src/game/factory';
import { lossesInWindow } from '../../src/game/losses';
import { parseSave, serializeSave } from '../../src/game/save';
import { newGame, newSandbox } from '../../src/scenarios/default';
import { BLUEPRINTS, board, loadPattern } from '../helpers';

const ID = { rotation: 0, mirror: false } as const;
const gun = loadPattern('gosper-glider-gun');
const game = () => new Factory(newGame(gun), BLUEPRINTS);

/** A game with the starter collector moved on-lane and `gens` generations of income. */
function earning(gens: number): Factory {
  const f = game();
  f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 });
  f.step(gens);
  return f;
}

describe('factory mode: building and placement rules', () => {
  it('forbids free editing outside the sandbox', () => {
    const f = game();
    for (const cmd of [
      { type: 'set-cell', x: 100, y: 100, alive: true },
      { type: 'clear' },
      { type: 'stamp', patternId: 'glider', grid: loadPattern('glider'), x: 90, y: 90, transform: ID },
    ] as const) {
      const r = f.apply(cmd);
      expect(r.ok, cmd.type).toBe(false);
    }
    expect(population(f.world)).toBe(36);
    expect(f.log).toHaveLength(0);
  });

  it('a gun costs energy, stamps the real pattern and is recorded as a machine', () => {
    const f = game();
    const broke = f.apply({ type: 'build-gun', x: 4, y: 40, transform: ID });
    expect(broke).toEqual({ ok: false, message: 'Needs 10 energy (you have 0)' });

    const rich = earning(900);
    const before = rich.economy.energy;
    expect(rich.machineCost('gun')).toBe(10);
    expect(rich.apply({ type: 'build-gun', x: 4, y: 40, transform: ID }).ok).toBe(true);
    expect(rich.economy.energy).toBe(before - 10);
    expect(gridsEqual(crop(rich.world, { x: 4, y: 40, width: 36, height: 9 }), gun)).toBe(true);
    expect(rich.machines.filter((m) => m.kind === 'gun').map((m) => m.paid)).toEqual([0, 10]);
    expect(rich.machineCost('gun')).toBe(25); // escalates
    expect(auditEconomy(rich.economy)).toBe(true);
  });

  it('placement is validated against live cells, bounds and money — failures cost nothing', () => {
    const f = earning(800);
    const e = f.economy.energy;
    expect(f.apply({ type: 'build-gun', x: 10, y: 6, transform: ID }).ok).toBe(false); // overlaps the starter
    expect(f.apply({ type: 'build-gun', x: 100, y: 120, transform: ID }).ok).toBe(false); // off the board
    expect(f.economy.energy).toBe(e);
    expect(f.machines).toHaveLength(2);
  });

  it('rotated or mirrored guns need Orientation tools', () => {
    const f = earning(1300);
    const turned = { rotation: 90, mirror: false } as const;
    expect(f.apply({ type: 'build-gun', x: 100, y: 10, transform: turned })).toMatchObject({ ok: false });
    expect(f.apply({ type: 'buy-upgrade', upgrade: 'orientation' }).ok).toBe(true);
    expect(f.apply({ type: 'build-gun', x: 100, y: 10, transform: turned }).ok).toBe(true);
    expect(f.machines.find((m) => m.x === 100)).toMatchObject({ width: 9, height: 36 });
  });

  it('removing a machine clears its footprint and refunds what was paid', () => {
    const f = earning(900);
    f.apply({ type: 'build-gun', x: 4, y: 40, transform: ID });
    const e = f.economy.energy;
    const id = f.machines.find((m) => m.kind === 'gun' && m.y === 40)!.id;
    expect(f.apply({ type: 'remove-machine', id }).ok).toBe(true);
    expect(population(crop(f.world, { x: 4, y: 40, width: 36, height: 9 }))).toBe(0);
    expect(f.economy.energy).toBe(e + 10);
    // The free starter gun refunds nothing.
    expect(f.apply({ type: 'remove-machine', id: 'gun-1' }).ok).toBe(true);
    expect(f.economy.energy).toBe(e + 10);
    expect(f.economy.entries.map((x) => [x.kind, x.amount])).toEqual([['purchase', 10], ['refund', 10]]);
    expect(auditEconomy(f.economy)).toBe(true);
  });

  it('upgrades are bought once and never let energy go negative', () => {
    const f = earning(500);
    expect(f.apply({ type: 'buy-upgrade', upgrade: 'expansion' })).toMatchObject({ ok: false });
    expect(f.economy.energy).toBeGreaterThanOrEqual(0);
    const rich = earning(4500);
    expect(rich.apply({ type: 'buy-upgrade', upgrade: 'orientation' }).ok).toBe(true);
    expect(rich.apply({ type: 'buy-upgrade', upgrade: 'orientation' })).toEqual({ ok: false, message: 'Already owned' });
  });

  it('chamber expansion keeps every cell where it was and is permanent', () => {
    const f = earning(4500);
    const before = f.world;
    expect(f.apply({ type: 'buy-upgrade', upgrade: 'expansion' }).ok).toBe(true);
    expect([f.world.width, f.world.height]).toEqual([192, 192]);
    expect(gridsEqual(crop(f.world, { x: 0, y: 0, width: 128, height: 128 }), before)).toBe(true);
    expect(population(f.world)).toBe(population(before));
  });
});

describe('production losses', () => {
  it('counts uncollected gliders reaching the edge, ~1 per gun period', () => {
    const f = game(); // starter collector is off-lane
    f.step(1200);
    expect(lossesInWindow(f.losses, f.generation, 300)).toBe(10);
    expect(f.losses.total).toBeGreaterThan(20);
  });

  it('does not count collected gliders', () => {
    const f = earning(1200);
    expect(receiptsInWindow(f.economy, f.generation, 300)).toBe(10);
    expect(lossesInWindow(f.losses, f.generation, 300)).toBe(0);
  });

  it('a glider counted lost and then collected inside the edge band is retracted', () => {
    // Collector in the loss band at the right edge, on the glider's lane.
    const f = new Factory({ world: board(64, 64, [{ grid: loadPattern('glider'), x: 30, y: 2 }]), detectors: [{ id: 'c', x: 59, y: 31, heading: 'SE' }] }, BLUEPRINTS);
    f.step(200);
    expect(collectedCount(f.economy)).toBe(1);
    expect(f.losses.total).toBe(0);
  });

  it('never changes the board', () => {
    const f = game();
    f.step(900);
    expect(hashWorld(f.world)).toBe(hashWorld(stepLifeN(newGame(gun).world, 900)));
  });
});

describe('save / load', () => {
  it('round-trips a mid-game factory and continues identically', () => {
    const a = earning(700);
    a.apply({ type: 'build-gun', x: 4, y: 40, transform: ID });
    a.step(333);
    const text = serializeSave(a, new Date('2026-11-04T12:00:00Z'));
    const loaded = parseSave(text, BLUEPRINTS);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const b = loaded.factory;
    expect(b.snapshot()).toEqual(a.snapshot());
    a.step(900);
    b.step(900);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it('rejects corrupt or foreign saves with a message instead of throwing', () => {
    const good = JSON.parse(serializeSave(earning(100)));
    const cases: Array<[string, string]> = [
      ['{not json', 'not valid JSON'],
      [JSON.stringify({ format: 'something-else' }), 'Not an Incremental Automata save'],
      [JSON.stringify({ ...good, version: 1 }), 'Unsupported save version'],
      [JSON.stringify({ ...good, snapshot: { ...good.snapshot, rule: 'B36/S23' } }), 'not B3/S23'],
      [JSON.stringify({ ...good, snapshot: { ...good.snapshot, world: { ...good.snapshot.world, width: 999 } } }), 'Unexpected chamber size'],
      [JSON.stringify({ ...good, snapshot: { ...good.snapshot, world: { ...good.snapshot.world, rle: 'x = 3, y = 3\nzz!' } } }), 'corrupt'],
      [JSON.stringify({ ...good, snapshot: { ...good.snapshot, economy: null } }), 'economy'],
      [JSON.stringify({ ...good, snapshot: { ...good.snapshot, sandbox: true } }), 'Sandbox'],
    ];
    for (const [text, msg] of cases) {
      const r = parseSave(text, BLUEPRINTS);
      expect(r.ok, msg).toBe(false);
      if (!r.ok) expect(r.error).toContain(msg);
    }
  });

  it('refuses to save a sandbox', () => {
    expect(() => serializeSave(new Factory(newSandbox(gun), BLUEPRINTS))).toThrow();
  });
});

describe('determinism with Phase 3 commands', () => {
  it('batched vs single stepping and command replay agree, including builds, removal and expansion', () => {
    const run = (chunk: number) => {
      const f = game();
      const at = (g: number, fn: () => void) => {
        while (f.generation < g) f.step(Math.min(chunk, g - f.generation));
        fn();
      };
      at(300, () => f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 }));
      at(800, () => f.apply({ type: 'build-gun', x: 4, y: 40, transform: ID }));
      at(1500, () => f.apply({ type: 'build-collector', x: 50, y: 72, heading: 'SE' }));
      at(3800, () => f.apply({ type: 'buy-upgrade', upgrade: 'expansion' }));
      at(4100, () => f.apply({ type: 'remove-machine', id: 'gun-1' }));
      at(5000, () => undefined);
      return f;
    };
    const one = run(1);
    const big = run(997);
    expect(big.snapshot()).toEqual(one.snapshot());
    const replayed = replayFactory(one.initialSnapshot, one.log, 5000, BLUEPRINTS);
    expect(replayed.snapshot()).toEqual(one.snapshot());
    expect(auditEconomy(one.economy)).toBe(true);
  }, 60_000);
});

describe('Phase 3 gate: a new player can progress through the goals', () => {
  it('scripted playthrough using only shop actions and the collector tool', () => {
    const f = game();
    const done = () => f.completedGoals.map((g) => g.id);
    const until = (pred: () => boolean, max = 20000) => {
      while (!pred() && f.generation < max) f.step(10);
      expect(pred(), `stalled at generation ${f.generation}: ${done().join(',')}`).toBe(true);
    };
    const must = (r: { ok: boolean; message?: string }) => expect(r, JSON.stringify(r)).toMatchObject({ ok: true });

    f.step(500);
    expect(done()).toEqual([]);
    must(f.apply({ type: 'move-detector', id: 'collector-1', x: 78, y: 64 })); // follow the diagnostic
    until(() => done().includes('bank-10'));
    expect(done()).toEqual(['first-glider', 'bank-10']);

    must(f.apply({ type: 'build-gun', x: 4, y: 40, transform: ID })); // stream on lane −22
    until(() => f.economy.energy >= (f.machineCost('collector') ?? Infinity));
    must(f.apply({ type: 'build-collector', x: 50, y: 72, heading: 'SE' }));
    until(() => done().includes('two-streams'));
    until(() => done().includes('no-losses'));

    until(() => f.economy.energy >= 40);
    must(f.apply({ type: 'buy-upgrade', upgrade: 'expansion' }));
    expect(done()).toContain('expand');

    until(() => f.economy.energy >= (f.machineCost('gun') ?? Infinity) + (f.machineCost('collector') ?? Infinity));
    must(f.apply({ type: 'build-gun', x: 4, y: 76, transform: ID })); // lane −58
    must(f.apply({ type: 'build-collector', x: 60, y: 118, heading: 'SE' }));
    until(() => done().includes('three-streams'));
    f.step(300); // a full rate window with all three streams

    expect(done()).toEqual(['first-glider', 'bank-10', 'second-gun', 'two-streams', 'no-losses', 'expand', 'three-streams']);

    expect(receiptsInWindow(f.economy, f.generation, 300)).toBe(30);
    expect(lossesInWindow(f.losses, f.generation, 300)).toBe(0);
    expect(auditEconomy(f.economy)).toBe(true);
  }, 60_000);
});
