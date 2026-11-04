import { encodeRle, parseRleOrThrow } from '../core/rle';
import { createWorld, type WorldState } from '../core/world';
import {
  createDetector,
  reconfigureDetector,
  updateDetector,
  type DetectedSignal,
  type DetectorConfig,
  type DetectorState,
  type NearMiss,
} from '../detectors/detector';
import type { Heading } from '../detectors/templates';
import { acceptSignal, createEconomy, type EconomyState, type Receipt } from '../economy/ledger';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { Simulation, type Command } from './simulation';

/**
 * Orchestrates one chamber: the automaton (via Simulation), read-only
 * detectors and the energy ledger. Detectors are evaluated on every
 * generation, including inside batched fast-forward, so speed never skips
 * arrivals. All player actions go through `apply` and are logged with their
 * generation for exact replay.
 */
export type FactoryCommand =
  | Command
  | { type: 'move-detector'; id: string; x: number; y: number }
  | { type: 'set-detector-heading'; id: string; heading: Heading };

export interface LoggedFactoryCommand {
  generation: number;
  command: FactoryCommand;
}

export type FactoryResult = { ok: true; warnings: string[] } | { ok: false; message: string };

export interface StepEvents {
  receipts: Receipt[];
  misses: NearMiss[];
  rejected: DetectedSignal[];
}

/** JSON-serialisable full state (MASTER_PLAN §3 GameSnapshot). */
export interface GameSnapshot {
  version: 1;
  rule: 'B3/S23';
  generation: number;
  world: { width: number; height: number; rle: string };
  detectors: DetectorState[];
  economy: EconomyState;
}

const clone = <T>(v: T): T => structuredClone(v);

export class Factory {
  private sim: Simulation;
  private detectorStates: DetectorState[];
  private econ: EconomyState;
  private readonly commandLog: LoggedFactoryCommand[] = [];
  private start: GameSnapshot;

  constructor(
    world: WorldState,
    detectors: DetectorConfig[],
    readonly config: GameConfig = DEFAULT_CONFIG,
    economy: EconomyState = createEconomy(),
  ) {
    this.sim = new Simulation(world);
    this.detectorStates = detectors.map(createDetector);
    this.econ = clone(economy);
    this.start = this.snapshot();
  }

  static fromSnapshot(s: GameSnapshot, config: GameConfig = DEFAULT_CONFIG): Factory {
    if (s.version !== 1 || s.rule !== 'B3/S23') throw new Error('Unsupported snapshot');
    const grid = parseRleOrThrow(s.world.rle).grid;
    if (grid.width !== s.world.width || grid.height !== s.world.height) throw new Error('Snapshot world size mismatch');
    const world: WorldState = { ...grid, generation: s.generation };
    const f = new Factory(world, [], config, s.economy);
    f.detectorStates = clone(s.detectors);
    f.start = f.snapshot();
    return f;
  }

  get world(): WorldState {
    return this.sim.world;
  }
  get generation(): number {
    return this.sim.world.generation;
  }
  get detectors(): readonly DetectorState[] {
    return this.detectorStates;
  }
  get economy(): Readonly<EconomyState> {
    return this.econ;
  }
  get log(): readonly LoggedFactoryCommand[] {
    return this.commandLog;
  }

  step(n = 1): StepEvents {
    const events: StepEvents = { receipts: [], misses: [], rejected: [] };
    for (let i = 0; i < n; i++) {
      const world = this.sim.step(1);
      for (let d = 0; d < this.detectorStates.length; d++) {
        const u = updateDetector(this.detectorStates[d]!, world, this.config.detector);
        this.detectorStates[d] = u.state;
        events.misses.push(...u.misses);
        for (const s of u.signals) {
          const r = acceptSignal(this.econ, s, this.config.rewardPerGlider);
          if (r.ok) events.receipts.push(r.receipt);
          else events.rejected.push(s);
        }
      }
    }
    return events;
  }

  apply(command: FactoryCommand): FactoryResult {
    let result: FactoryResult;
    switch (command.type) {
      case 'move-detector':
      case 'set-detector-heading': {
        const i = this.detectorStates.findIndex((d) => d.config.id === command.id);
        if (i < 0) return { ok: false, message: `No detector ${command.id}` };
        const w = this.sim.world;
        if (command.type === 'move-detector') {
          if (command.x < 0 || command.y < 0 || command.x >= w.width || command.y >= w.height) {
            return { ok: false, message: 'Collector must stay on the board' };
          }
          this.detectorStates[i] = reconfigureDetector(this.detectorStates[i]!, { x: command.x, y: command.y });
        } else {
          this.detectorStates[i] = reconfigureDetector(this.detectorStates[i]!, { heading: command.heading });
        }
        result = { ok: true, warnings: [] };
        break;
      }
      default:
        result = this.sim.apply(command);
    }
    if (result.ok) this.commandLog.push({ generation: this.generation, command: clone(command) });
    return result;
  }

  snapshot(): GameSnapshot {
    const w = this.sim.world;
    return {
      version: 1,
      rule: 'B3/S23',
      generation: w.generation,
      world: { width: w.width, height: w.height, rle: encodeRle(w) },
      detectors: clone(this.detectorStates),
      economy: clone(this.econ),
    };
  }

  /** Snapshot taken at construction (scenario start). */
  get initialSnapshot(): GameSnapshot {
    return clone(this.start);
  }

  /** Restore the scenario start: world, detectors, ledger; clears the log. */
  reset(): void {
    const f = Factory.fromSnapshot(this.start, this.config);
    this.sim = f.sim;
    this.detectorStates = f.detectorStates;
    this.econ = f.econ;
    this.commandLog.length = 0;
  }
}

/** Replay a logged run from a snapshot up to `toGeneration`. */
export function replayFactory(
  start: GameSnapshot,
  log: readonly LoggedFactoryCommand[],
  toGeneration: number,
  config: GameConfig = DEFAULT_CONFIG,
): Factory {
  const f = Factory.fromSnapshot(start, config);
  let i = 0;
  const applyDue = () => {
    while (i < log.length && log[i]!.generation === f.generation) {
      const r = f.apply(log[i]!.command);
      if (!r.ok) throw new Error(`Replay diverged at generation ${f.generation}: ${r.message}`);
      i++;
    }
  };
  applyDue();
  while (f.generation < toGeneration) {
    f.step(1);
    applyDue();
  }
  return f;
}

export function emptyFactory(width: number, height: number, detectors: DetectorConfig[] = []): Factory {
  return new Factory(createWorld(width, height), detectors);
}
