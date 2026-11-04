import { hashWorld } from '../core/hash';
import { population } from '../core/world';
import { collectedCount } from '../economy/ledger';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { Factory, type Blueprints, type GameSnapshot } from './factory';

/**
 * Headless trial: run a copy of a snapshot for a fixed number of generations
 * and measure it. Never touches the live game. Deterministic: same snapshot +
 * generations + config ⇒ identical result (including the final board hash).
 * Can be advanced in slices so the UI stays responsive.
 */
export interface TrialResult {
  label: string;
  startGeneration: number;
  generations: number;
  collected: number;
  lost: number;
  /** Collected in the final rateWindow generations — the steady-state rate. */
  steadyRate: number;
  /** Lost in the final rateWindow generations. */
  steadyLost: number;
  energyGained: number;
  perCollector: Record<string, number>;
  nearMisses: number;
  populationStart: number;
  populationEnd: number;
  finalHash: string;
}

export class Trial {
  private readonly f: Factory;
  private readonly start: { collected: number; lostTotal: number; energy: number; misses: number; pop: number; gen: number };
  private readonly perCollector: Record<string, number> = {};
  private readonly recent: Array<{ g: number; collected: number; lost: number }> = [];

  constructor(
    snapshot: GameSnapshot,
    readonly label: string,
    readonly generations: number,
    blueprints: Blueprints,
    readonly config: GameConfig = DEFAULT_CONFIG,
  ) {
    this.f = Factory.fromSnapshot(snapshot, blueprints, config);
    for (const d of this.f.detectors) this.perCollector[d.config.id] = 0;
    this.start = {
      collected: collectedCount(this.f.economy),
      lostTotal: this.f.losses.total,
      energy: this.f.economy.energy,
      misses: this.f.detectors.reduce((s, d) => s + d.nearMisses, 0),
      pop: population(this.f.world),
      gen: this.f.generation,
    };
  }

  get progress(): number { return (this.f.generation - this.start.gen) / this.generations; }
  get done(): boolean { return this.f.generation - this.start.gen >= this.generations; }

  /** Run up to `maxGenerations` more; returns true when finished. */
  advance(maxGenerations = Infinity): boolean {
    const remaining = this.start.gen + this.generations - this.f.generation;
    const n = Math.min(remaining, maxGenerations);
    for (let i = 0; i < n; i++) {
      const ev = this.f.step(1);
      for (const r of ev.receipts) this.perCollector[r.detectorId] = (this.perCollector[r.detectorId] ?? 0) + 1;
      this.recent.push({ g: this.f.generation, collected: ev.receipts.length, lost: ev.losses.length });
    }
    const cutoff = this.f.generation - this.config.rateWindow;
    while (this.recent.length && this.recent[0]!.g <= cutoff) this.recent.shift();
    return this.done;
  }

  result(): TrialResult {
    if (!this.done) throw new Error('Trial not finished');
    const f = this.f;
    return {
      label: this.label,
      startGeneration: this.start.gen,
      generations: this.generations,
      collected: collectedCount(f.economy) - this.start.collected,
      lost: f.losses.total - this.start.lostTotal,
      steadyRate: this.recent.reduce((s, r) => s + r.collected, 0),
      steadyLost: this.recent.reduce((s, r) => s + r.lost, 0),
      energyGained: f.economy.energy - this.start.energy,
      perCollector: { ...this.perCollector },
      nearMisses: f.detectors.reduce((s, d) => s + d.nearMisses, 0) - this.start.misses,
      populationStart: this.start.pop,
      populationEnd: population(f.world),
      finalHash: hashWorld(f.world),
    };
  }
}

export function runTrial(snapshot: GameSnapshot, label: string, generations: number, blueprints: Blueprints, config: GameConfig = DEFAULT_CONFIG): TrialResult {
  const t = new Trial(snapshot, label, generations, blueprints, config);
  t.advance();
  return t.result();
}

export type Verdict = 'better' | 'worse' | 'same' | 'mixed';

/** Compare a variant against the baseline on steady-state collection and losses. */
export function compareTrials(baseline: TrialResult, variant: TrialResult): { verdict: Verdict; summary: string } {
  const dRate = variant.steadyRate - baseline.steadyRate;
  const dLost = variant.steadyLost - baseline.steadyLost;
  const sign = (n: number) => (n > 0 ? `+${n}` : n === 0 ? '±0' : `−${-n}`);
  const w = baseline.generations >= 300 ? 'per 300 gen' : 'in the window';
  const parts = [`collected ${sign(dRate)} ${w}`, `lost ${sign(dLost)}`];
  let verdict: Verdict;
  if (dRate === 0 && dLost === 0) verdict = 'same';
  else if (dRate >= 0 && dLost <= 0) verdict = 'better';
  else if (dRate <= 0 && dLost >= 0) verdict = 'worse';
  else verdict = 'mixed';
  const head = { better: 'Better', worse: 'Worse', same: 'No change', mixed: 'Mixed' }[verdict];
  return { verdict, summary: `${head}: ${parts.join(', ')}.` };
}
