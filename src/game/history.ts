import type { GameSnapshot } from './factory';

/**
 * Snapshot-based undo/redo. Undo restores the exact state captured just
 * before an action; redo restores the exact state that was current when undo
 * was pressed. Both are bit-identical by construction (no inverse commands),
 * so nothing an action caused can survive an undo — including time.
 */
export interface HistoryEntry {
  label: string;
  generation: number;
  snapshot: GameSnapshot;
}

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private lastKey: string | null = null;

  constructor(readonly limit = 50) {}

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get undoLabel(): string | null { return this.past.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.future.at(-1)?.label ?? null; }
  get depth(): { undo: number; redo: number } { return { undo: this.past.length, redo: this.future.length }; }

  /**
   * Record the state *before* an action. Actions sharing a `coalesceKey`
   * (e.g. one collector drag) produce a single undo step.
   */
  record(before: GameSnapshot, label: string, coalesceKey?: string): void {
    if (coalesceKey !== undefined && coalesceKey === this.lastKey) return;
    this.lastKey = coalesceKey ?? null;
    this.past.push({ label, generation: before.generation, snapshot: before });
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Returns the snapshot to restore, pushing `current` onto the redo stack. */
  undo(current: GameSnapshot): HistoryEntry | null {
    const e = this.past.pop();
    if (!e) return null;
    this.future.push({ label: e.label, generation: current.generation, snapshot: current });
    this.lastKey = null;
    return e;
  }

  redo(current: GameSnapshot): HistoryEntry | null {
    const e = this.future.pop();
    if (!e) return null;
    this.past.push({ label: e.label, generation: current.generation, snapshot: current });
    this.lastKey = null;
    return e;
  }

  /** True if recording with this key would be folded into the previous step. */
  isCoalescing(key?: string): boolean {
    return key !== undefined && key === this.lastKey;
  }

  /** End any coalescing gesture. */
  endGesture(): void {
    this.lastKey = null;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }
}
