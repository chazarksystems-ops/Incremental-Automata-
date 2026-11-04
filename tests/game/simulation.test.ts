import { describe, expect, it } from 'vitest';
import { hashWorld } from '../../src/core/hash';
import { stepLifeN } from '../../src/core/life';
import { IDENTITY } from '../../src/core/transform';
import { population } from '../../src/core/world';
import { GenerationClock } from '../../src/game/clock';
import { Simulation, replay } from '../../src/game/simulation';
import { defaultScenario } from '../../src/scenarios/default';
import { loadPattern } from '../helpers';

const gun = loadPattern('gosper-glider-gun');

describe('Simulation determinism (Phase 1 gate: stepping and running produce identical boards)', () => {
  it('single-step, batched and clock-driven runs give identical hashes', () => {
    const start = defaultScenario(gun);
    const expected = hashWorld(stepLifeN(start, 1500));

    const stepped = new Simulation(start);
    for (let i = 0; i < 1500; i++) stepped.step();
    expect(hashWorld(stepped.world)).toBe(expected);

    const batched = new Simulation(start);
    batched.step(700);
    batched.step(800);
    expect(hashWorld(batched.world)).toBe(expected);

    // Irregular frame times and speed changes (incl. lag-capped ticks).
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const clocked = new Simulation(start);
    const clock = new GenerationClock({ generationsPerSecond: 60, maxGenerationsPerTick: 32 });
    while (clocked.world.generation < 1500) {
      if (rand() < 0.05) clock.generationsPerSecond = [1, 15, 60, 240, 2000][Math.floor(rand() * 5)]!;
      const n = Math.min(clock.tick(rand() * 50), 1500 - clocked.world.generation);
      clocked.step(n);
    }
    expect(hashWorld(clocked.world)).toBe(expected);
  });

  it('commands are logged at generation boundaries and replay exactly', () => {
    const sim = new Simulation(defaultScenario(gun));
    sim.step(37);
    expect(sim.apply({ type: 'set-cell', x: 100, y: 20, alive: true }).ok).toBe(true);
    sim.step(100);
    const glider = loadPattern('glider');
    expect(sim.apply({ type: 'stamp', patternId: 'glider', grid: glider, x: 90, y: 5, transform: { rotation: 90, mirror: false } }).ok).toBe(true);
    sim.step(263);
    expect(sim.log.map((l) => l.generation)).toEqual([37, 137]);

    const again = replay(sim.initialWorld, sim.log, 400);
    expect(again.generation).toBe(400);
    expect(hashWorld(again)).toBe(hashWorld(sim.world));
  });

  it('rejected commands do not change state or the log', () => {
    const sim = new Simulation(defaultScenario(gun));
    const before = hashWorld(sim.world);
    const r = sim.apply({ type: 'stamp', patternId: 'gun', grid: gun, x: 4, y: 4, transform: IDENTITY });
    expect(r.ok).toBe(false);
    expect(sim.apply({ type: 'set-cell', x: 999, y: 0, alive: true }).ok).toBe(false);
    expect(hashWorld(sim.world)).toBe(before);
    expect(sim.log).toHaveLength(0);
  });

  it('reset returns to the scenario start; clear empties the board but keeps the generation', () => {
    const start = defaultScenario(gun);
    const sim = new Simulation(start);
    sim.step(50);
    sim.apply({ type: 'clear' });
    expect(population(sim.world)).toBe(0);
    expect(sim.world.generation).toBe(50);
    sim.reset();
    expect(hashWorld(sim.world)).toBe(hashWorld(start));
    expect(sim.log).toHaveLength(0);
  });
});
