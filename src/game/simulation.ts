import { stepLife } from '../core/life';
import { stampGrid, type StampResult } from '../core/stamp';
import type { Transform } from '../core/transform';
import { createWorld, inBounds, withCell, type Grid, type WorldState } from '../core/world';

/**
 * Player/editor commands. Every command is applied between generations
 * (the simulation is single-threaded and `step` is atomic), and logged with
 * the generation at which it was applied so a run can be replayed exactly.
 */
export type Command =
  | { type: 'set-cell'; x: number; y: number; alive: boolean }
  | { type: 'stamp'; patternId: string; grid: Grid; x: number; y: number; transform: Transform }
  | { type: 'clear' };

export type CommandResult =
  | { ok: true; warnings: string[] }
  | { ok: false; message: string };

export interface LoggedCommand {
  generation: number;
  command: Command;
}

export class Simulation {
  private initial: WorldState;
  private current: WorldState;
  private readonly commandLog: LoggedCommand[] = [];

  constructor(initial: WorldState) {
    this.initial = initial;
    this.current = initial;
  }

  get world(): WorldState {
    return this.current;
  }

  get log(): readonly LoggedCommand[] {
    return this.commandLog;
  }

  get initialWorld(): WorldState {
    return this.initial;
  }

  step(n = 1): WorldState {
    for (let i = 0; i < n; i++) this.current = stepLife(this.current);
    return this.current;
  }

  apply(command: Command): CommandResult {
    const r = applyCommand(this.current, command);
    if (!r.ok) return { ok: false, message: r.message };
    this.current = r.world;
    this.commandLog.push({ generation: this.current.generation, command });
    return { ok: true, warnings: r.warnings };
  }

  /** Back to the scenario's initial state; discards the command log. */
  reset(): void {
    this.current = this.initial;
    this.commandLog.length = 0;
  }

  /** Replace the scenario (e.g. loading a different layout). */
  load(initial: WorldState): void {
    this.initial = initial;
    this.reset();
  }
}

type ApplyResult = { ok: true; world: WorldState; warnings: string[] } | { ok: false; message: string };

export function applyCommand(world: WorldState, command: Command): ApplyResult {
  switch (command.type) {
    case 'set-cell': {
      if (!inBounds(world, command.x, command.y)) return { ok: false, message: 'Cell is outside the board' };
      return { ok: true, world: withCell(world, command.x, command.y, command.alive), warnings: [] };
    }
    case 'stamp': {
      const r: StampResult = stampGrid(world, command.grid, command.x, command.y, { transform: command.transform });
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: true, world: r.world, warnings: r.warnings.map((w) => w.message) };
    }
    case 'clear':
      return { ok: true, world: createWorld(world.width, world.height, world.generation), warnings: [] };
  }
}

/**
 * Deterministic replay: start from `initial`, apply each logged command when
 * its generation is reached, and stop at `toGeneration`.
 */
export function replay(initial: WorldState, log: readonly LoggedCommand[], toGeneration: number): WorldState {
  let w = initial;
  let i = 0;
  const applyDue = () => {
    while (i < log.length && log[i]!.generation === w.generation) {
      const r = applyCommand(w, log[i]!.command);
      if (!r.ok) throw new Error(`Replay diverged at generation ${w.generation}: ${r.message}`);
      w = r.world;
      i++;
    }
  };
  applyDue();
  while (w.generation < toGeneration) {
    w = stepLife(w);
    applyDue();
  }
  return w;
}
