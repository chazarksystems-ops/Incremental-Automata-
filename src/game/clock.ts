/**
 * Fixed-generation scheduler. Converts wall-clock time into an integer number
 * of generations to compute, independent of display frame rate.
 *
 * Determinism: the clock only decides *how many* generations to run; the
 * simulation result depends solely on the total count, never on timing.
 * When the backlog exceeds `maxGenerationsPerTick` the excess is dropped
 * (the simulation runs slower than requested) — generations are never skipped.
 */
export interface ClockOptions {
  generationsPerSecond: number;
  maxGenerationsPerTick?: number;
}

export class GenerationClock {
  private accumulatorMs = 0;
  private gps: number;
  readonly maxGenerationsPerTick: number;
  /** True if the last tick had to drop backlog. */
  lagging = false;

  constructor(opts: ClockOptions) {
    this.gps = GenerationClock.validateRate(opts.generationsPerSecond);
    this.maxGenerationsPerTick = opts.maxGenerationsPerTick ?? 64;
  }

  static validateRate(gps: number): number {
    if (!Number.isFinite(gps) || gps <= 0) throw new RangeError(`Invalid generations/second ${gps}`);
    return gps;
  }

  get generationsPerSecond(): number {
    return this.gps;
  }

  set generationsPerSecond(gps: number) {
    this.gps = GenerationClock.validateRate(gps);
  }

  /** Returns how many whole generations to compute for `dtMs` of elapsed time. */
  tick(dtMs: number): number {
    if (!Number.isFinite(dtMs) || dtMs < 0) return 0;
    const msPerGen = 1000 / this.gps;
    this.accumulatorMs += dtMs;
    let n = Math.floor(this.accumulatorMs / msPerGen);
    this.accumulatorMs -= n * msPerGen;
    this.lagging = n > this.maxGenerationsPerTick;
    if (this.lagging) {
      n = this.maxGenerationsPerTick;
      this.accumulatorMs = 0;
    }
    return n;
  }

  reset(): void {
    this.accumulatorMs = 0;
    this.lagging = false;
  }
}
