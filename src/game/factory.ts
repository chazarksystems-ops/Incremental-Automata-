import { encodeRle, parseRleOrThrow } from '../core/rle';
import { stampGrid } from '../core/stamp';
import { IDENTITY, transformGrid, type Transform } from '../core/transform';
import type { Grid, WorldState } from '../core/world';
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
import {
  acceptSignal,
  collectedCount,
  compactEconomy,
  createEconomy,
  receiptsInWindow,
  refund,
  spend,
  type EconomyState,
  type Receipt,
} from '../economy/ledger';
import { DEFAULT_CONFIG, upgradeDef, type DetectorParams, type GameConfig, type MachineKind, type UpgradeId } from './config';
import { GOALS, goalDone, type GoalView } from './goals';
import { createLosses, lossesInWindow, retractLoss, updateLosses, type LossRecord, type LossState } from './losses';
import { Simulation, type Command } from './simulation';

/**
 * Orchestrates one chamber: the automaton (via Simulation), placed machines,
 * read-only detectors, edge-loss monitoring, the energy ledger and goals.
 *
 * - Detectors, the loss monitor and goals are evaluated after *every*
 *   generation, including inside batched fast-forward.
 * - All player actions go through `apply`, at a generation boundary, and are
 *   logged with their generation for exact replay.
 * - In factory mode, cells can only change through machines the player buys
 *   (or removes); free editing is sandbox-only.
 */

export type FactoryCommand =
  | Command
  | { type: 'build-gun'; x: number; y: number; transform: Transform }
  | { type: 'build-collector'; x: number; y: number; heading: Heading }
  | { type: 'remove-machine'; id: string }
  | { type: 'buy-upgrade'; upgrade: UpgradeId }
  | { type: 'move-detector'; id: string; x: number; y: number }
  | { type: 'set-detector-heading'; id: string; heading: Heading };

export interface LoggedFactoryCommand {
  generation: number;
  command: FactoryCommand;
}

export type FactoryResult = { ok: true; warnings: string[] } | { ok: false; message: string };

export interface Machine {
  id: string;
  kind: MachineKind;
  x: number;
  y: number;
  /** Guns only. */
  transform?: Transform;
  width?: number;
  height?: number;
  /** Energy paid; refunded in full on removal. */
  paid: number;
  builtAt: number;
}

export interface StepEvents {
  receipts: Receipt[];
  misses: NearMiss[];
  losses: LossRecord[];
  rejected: DetectedSignal[];
  goals: string[];
}

export interface Blueprints {
  gun: Grid;
}

/** JSON-serialisable full state (MASTER_PLAN §3 GameSnapshot). */
export interface GameSnapshot {
  version: 2;
  rule: 'B3/S23';
  sandbox: boolean;
  generation: number;
  world: { width: number; height: number; rle: string };
  machines: Machine[];
  detectors: DetectorState[];
  economy: EconomyState;
  losses: LossState;
  unlocks: UpgradeId[];
  goals: Array<{ id: string; generation: number }>;
  lastBuildGeneration: number;
  nextId: number;
}

export interface FactoryInit {
  world: WorldState;
  machines?: Machine[];
  detectors?: DetectorConfig[];
  sandbox?: boolean;
  economy?: EconomyState;
}

/** Receipts older than this are folded into archived totals. */
export const RECEIPT_KEEP_GENERATIONS = 2000;
const COMPACT_EVERY = 500;

const clone = <T>(v: T): T => structuredClone(v);
const isIdentity = (t: Transform) => t.rotation === 0 && !t.mirror;

export class Factory {
  private sim!: Simulation;
  private s!: Omit<GameSnapshot, 'version' | 'rule' | 'generation' | 'world'>;
  private collected = new Set<string>();
  private readonly commandLog: LoggedFactoryCommand[] = [];
  private start!: GameSnapshot;

  constructor(
    init: FactoryInit,
    readonly blueprints: Blueprints,
    readonly config: GameConfig = DEFAULT_CONFIG,
  ) {
    this.sim = new Simulation(init.world);
    const detectors = (init.detectors ?? []).map(createDetector);
    const machines: Machine[] = clone(init.machines ?? []);
    for (const d of init.detectors ?? []) {
      if (!machines.some((m) => m.id === d.id)) machines.push({ id: d.id, kind: 'collector', x: d.x, y: d.y, paid: 0, builtAt: 0 });
    }
    this.s = {
      sandbox: init.sandbox ?? false,
      machines,
      detectors,
      economy: clone(init.economy ?? createEconomy()),
      losses: createLosses(),
      unlocks: init.sandbox ? config.upgrades.map((u) => u.id).filter((id) => id !== 'expansion') : [],
      goals: [],
      lastBuildGeneration: init.world.generation,
      nextId: machines.length + 1,
    };
    this.rebuildCollectedSet();
    this.start = this.snapshot();
  }

  static fromSnapshot(snap: GameSnapshot, blueprints: Blueprints, config: GameConfig = DEFAULT_CONFIG): Factory {
    if (snap.version !== 2 || snap.rule !== 'B3/S23') throw new Error('Unsupported snapshot version or rule');
    const grid = parseRleOrThrow(snap.world.rle).grid;
    if (grid.width !== snap.world.width || grid.height !== snap.world.height) throw new Error('Snapshot world size mismatch');
    const f = new Factory({ world: { ...grid, generation: snap.generation } }, blueprints, config);
    const { version: _v, rule: _r, generation: _g, world: _w, ...rest } = clone(snap);
    void _v; void _r; void _g; void _w;
    f.s = rest;
    f.rebuildCollectedSet();
    f.start = f.snapshot();
    return f;
  }

  // ---------- read access ----------
  get world(): WorldState { return this.sim.world; }
  get generation(): number { return this.sim.world.generation; }
  get sandbox(): boolean { return this.s.sandbox; }
  get detectors(): readonly DetectorState[] { return this.s.detectors; }
  get machines(): readonly Machine[] { return this.s.machines; }
  get economy(): Readonly<EconomyState> { return this.s.economy; }
  get losses(): Readonly<LossState> { return this.s.losses; }
  get unlocks(): readonly UpgradeId[] { return this.s.unlocks; }
  get completedGoals(): ReadonlyArray<{ id: string; generation: number }> { return this.s.goals; }
  get log(): readonly LoggedFactoryCommand[] { return this.commandLog; }
  get initialSnapshot(): GameSnapshot { return clone(this.start); }

  hasUpgrade(id: UpgradeId): boolean {
    return this.s.unlocks.includes(id);
  }

  get detectorParams(): DetectorParams {
    return this.config.detector;
  }

  count(kind: MachineKind): number {
    return this.s.machines.filter((m) => m.kind === kind).length;
  }

  /** Price of the next machine of `kind`, or null if the limit is reached. */
  machineCost(kind: MachineKind): number | null {
    if (this.s.sandbox) return 0;
    const c = this.config.machineCosts[kind][this.count(kind)];
    return c === undefined ? null : c;
  }

  upgradeCost(id: UpgradeId): number {
    return this.s.sandbox ? 0 : upgradeDef(this.config, id).cost;
  }

  goalView(): GoalView {
    const g = this.generation;
    return {
      energy: this.s.economy.energy,
      collectedTotal: collectedCount(this.s.economy),
      rate: receiptsInWindow(this.s.economy, g, this.config.rateWindow),
      lost: lossesInWindow(this.s.losses, g, this.config.rateWindow),
      guns: this.count('gun'),
      collectors: this.count('collector'),
      unlocks: this.s.unlocks,
      chamberSize: this.world.width,
      generationsSinceLastBuild: g - this.s.lastBuildGeneration,
    };
  }

  // ---------- simulation ----------
  step(n = 1): StepEvents {
    const ev: StepEvents = { receipts: [], misses: [], losses: [], rejected: [], goals: [] };
    const params = this.detectorParams;
    for (let i = 0; i < n; i++) {
      const world = this.sim.step(1);
      const det = this.s.detectors;
      for (let d = 0; d < det.length; d++) {
        const u = updateDetector(det[d]!, world, params);
        det[d] = u.state;
        ev.misses.push(...u.misses);
        for (const sig of u.signals) {
          const r = acceptSignal(this.s.economy, sig, this.config.rewardPerGlider, this.collected);
          if (r.ok) {
            this.collected.add(sig.passageId);
            this.s.losses = retractLoss(this.s.losses, sig.passageId);
            ev.receipts.push(r.receipt);
          } else ev.rejected.push(sig);
        }
      }
      const lu = updateLosses(this.s.losses, world, this.config.lossBand, this.collected);
      this.s.losses = lu.state;
      ev.losses.push(...lu.added);
      if (world.generation % COMPACT_EVERY === 0) {
        for (const id of compactEconomy(this.s.economy, world.generation, RECEIPT_KEEP_GENERATIONS)) this.collected.delete(id);
      }
      ev.goals.push(...this.latchGoals());
    }
    return ev;
  }

  private latchGoals(): string[] {
    const done = new Set(this.s.goals.map((g) => g.id));
    const pending = GOALS.filter((g) => !done.has(g.id));
    if (!pending.length) return [];
    const view = this.goalView();
    const newly: string[] = [];
    for (const g of pending) {
      if (goalDone(g, view)) {
        this.s.goals.push({ id: g.id, generation: this.generation });
        newly.push(g.id);
      }
    }
    return newly;
  }

  private rebuildCollectedSet(): void {
    this.collected = new Set(this.s.economy.receipts.map((r) => r.passageId));
  }

  private newId(kind: MachineKind): string {
    return `${kind}-${this.s.nextId++}`;
  }

  // ---------- commands ----------
  apply(command: FactoryCommand): FactoryResult {
    const r = this.applyInner(command);
    if (r.ok) {
      this.commandLog.push({ generation: this.generation, command: clone(command) });
      this.latchGoals();
    }
    return r;
  }

  private applyInner(cmd: FactoryCommand): FactoryResult {
    const g = this.generation;
    switch (cmd.type) {
      case 'set-cell':
      case 'stamp':
      case 'clear':
      case 'clear-rect':
      case 'resize':
        if (!this.s.sandbox) return { ok: false, message: 'Free editing is only available in Sandbox mode' };
        return this.sim.apply(cmd);

      case 'build-gun': {
        if (!isIdentity(cmd.transform) && !this.hasUpgrade('orientation')) {
          return { ok: false, message: 'Rotating or mirroring needs the Orientation tools upgrade' };
        }
        const cost = this.machineCost('gun');
        if (cost === null) return { ok: false, message: 'Gun limit reached' };
        if (cost > this.s.economy.energy) return { ok: false, message: `Needs ${cost} energy (you have ${this.s.economy.energy})` };
        const placed = this.sim.apply({ type: 'stamp', patternId: 'gosper-glider-gun', grid: this.blueprints.gun, x: cmd.x, y: cmd.y, transform: cmd.transform });
        if (!placed.ok) return placed;
        const id = this.newId('gun');
        spend(this.s.economy, 'gun', id, g, cost);
        const t = transformGrid(this.blueprints.gun, cmd.transform);
        this.s.machines.push({ id, kind: 'gun', x: cmd.x, y: cmd.y, transform: { ...cmd.transform }, width: t.width, height: t.height, paid: cost, builtAt: g });
        this.s.lastBuildGeneration = g;
        return placed;
      }

      case 'build-collector': {
        const cost = this.machineCost('collector');
        if (cost === null) return { ok: false, message: 'Collector limit reached' };
        if (cost > this.s.economy.energy) return { ok: false, message: `Needs ${cost} energy (you have ${this.s.economy.energy})` };
        if (!this.onBoard(cmd.x, cmd.y)) return { ok: false, message: 'Collector must be on the board' };
        const id = this.newId('collector');
        spend(this.s.economy, 'collector', id, g, cost);
        this.s.detectors.push(createDetector({ id, x: cmd.x, y: cmd.y, heading: cmd.heading }));
        this.s.machines.push({ id, kind: 'collector', x: cmd.x, y: cmd.y, paid: cost, builtAt: g });
        this.s.lastBuildGeneration = g;
        return { ok: true, warnings: [] };
      }

      case 'remove-machine': {
        const m = this.s.machines.find((x) => x.id === cmd.id);
        if (!m) return { ok: false, message: `No machine ${cmd.id}` };
        if (m.kind === 'gun') {
          const cleared = this.sim.apply({ type: 'clear-rect', x: m.x, y: m.y, width: m.width!, height: m.height! });
          if (!cleared.ok) return cleared;
        } else {
          this.s.detectors = this.s.detectors.filter((d) => d.config.id !== m.id);
        }
        this.s.machines = this.s.machines.filter((x) => x.id !== m.id);
        if (m.paid > 0) refund(this.s.economy, m.kind, m.id, g, m.paid);
        this.s.lastBuildGeneration = g;
        return { ok: true, warnings: [] };
      }

      case 'buy-upgrade': {
        if (this.hasUpgrade(cmd.upgrade)) return { ok: false, message: 'Already owned' };
        const cost = this.upgradeCost(cmd.upgrade);
        if (cost > this.s.economy.energy) return { ok: false, message: `Needs ${cost} energy (you have ${this.s.economy.energy})` };
        if (cmd.upgrade === 'expansion') {
          const size = this.config.chamber.expandedSize;
          const r = this.sim.apply({ type: 'resize', width: size, height: size });
          if (!r.ok) return r;
        }
        spend(this.s.economy, `upgrade:${cmd.upgrade}`, cmd.upgrade, g, cost);
        this.s.unlocks.push(cmd.upgrade);
        return { ok: true, warnings: [] };
      }

      case 'move-detector':
      case 'set-detector-heading': {
        const i = this.s.detectors.findIndex((d) => d.config.id === cmd.id);
        if (i < 0) return { ok: false, message: `No collector ${cmd.id}` };
        if (cmd.type === 'move-detector') {
          if (!this.onBoard(cmd.x, cmd.y)) return { ok: false, message: 'Collector must stay on the board' };
          this.s.detectors[i] = reconfigureDetector(this.s.detectors[i]!, { x: cmd.x, y: cmd.y });
          const m = this.s.machines.find((x) => x.id === cmd.id);
          if (m) { m.x = cmd.x; m.y = cmd.y; }
        } else {
          this.s.detectors[i] = reconfigureDetector(this.s.detectors[i]!, { heading: cmd.heading });
        }
        return { ok: true, warnings: [] };
      }
    }
  }

  private onBoard(x: number, y: number): boolean {
    const w = this.world;
    return x >= 0 && y >= 0 && x < w.width && y < w.height;
  }

  /** Dry-run check used by the UI preview for gun placement. */
  canPlaceGun(x: number, y: number, transform: Transform): boolean {
    return stampGrid(this.world, this.blueprints.gun, x, y, { transform }).ok;
  }

  snapshot(): GameSnapshot {
    const w = this.sim.world;
    return {
      version: 2,
      rule: 'B3/S23',
      generation: w.generation,
      world: { width: w.width, height: w.height, rle: encodeRle(w) },
      ...clone(this.s),
    };
  }

  /** Restore the scenario start: world, machines, detectors, ledger, goals; clears the log. */
  reset(): void {
    const f = Factory.fromSnapshot(this.start, this.blueprints, this.config);
    this.sim = f.sim;
    this.s = f.s;
    this.rebuildCollectedSet();
    this.commandLog.length = 0;
  }
}

/** Replay a logged run from a snapshot up to `toGeneration`. */
export function replayFactory(
  start: GameSnapshot,
  log: readonly LoggedFactoryCommand[],
  toGeneration: number,
  blueprints: Blueprints,
  config: GameConfig = DEFAULT_CONFIG,
): Factory {
  const f = Factory.fromSnapshot(start, blueprints, config);
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

export { IDENTITY };
