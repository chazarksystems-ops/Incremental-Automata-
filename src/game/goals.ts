import type { UpgradeId } from './config';

/**
 * Tutorial / progression goals. Each goal is a pure check over a small view of
 * the factory; completions are latched (with the generation) by the factory on
 * every generation, so they are deterministic and saved.
 */
export interface GoalView {
  energy: number;
  collectedTotal: number;
  rate: number; // gliders collected in the last rateWindow generations
  lost: number; // gliders lost in the last rateWindow generations
  guns: number;
  collectors: number;
  unlocks: readonly UpgradeId[];
  chamberSize: number;
  generationsSinceLastBuild: number;
}

export interface Goal {
  id: string;
  title: string;
  hint: string;
  /** Progress towards the goal; done when value ≥ target. */
  progress(v: GoalView): { value: number; target: number };
}

export const GOALS: readonly Goal[] = [
  {
    id: 'first-glider',
    title: 'Line up the collector',
    hint: 'Your collector sits off the glider stream. Read the collector panel, then use the Collector tool to drag its gate onto the stream.',
    progress: (v) => ({ value: v.collectedTotal, target: 1 }),
  },
  {
    id: 'bank-10',
    title: 'Bank 10 energy',
    hint: 'Each glider that crosses the gate pays 1 energy. Raise the speed if you like: income depends on generations, not seconds.',
    progress: (v) => ({ value: Math.min(v.energy, 10), target: 10 }),
  },
  {
    id: 'second-gun',
    title: 'Build a second glider gun',
    hint: 'Shop → Gosper glider gun. Its stream leaves its right side heading ↘. Leave the stream a clear path: anything in the way is destroyed, and so are the gliders.',
    progress: (v) => ({ value: v.guns, target: 2 }),
  },
  {
    id: 'two-streams',
    title: 'Collect two streams',
    hint: 'A collector catches one lane (±1). Two guns can\'t feed one gate: to run that close, one gun would sit in the other\'s stream. Buy a second collector and put it on the new stream.',
    progress: (v) => ({ value: Math.min(v.rate, 15), target: 15 }),
  },
  {
    id: 'no-losses',
    title: 'Lose nothing for 300 generations',
    hint: 'Gliders that reach the edge without being collected are losses. With two or more guns running, collect every stream for 300 generations straight.',
    progress: (v) => ({
      value: v.guns >= 2 && v.lost === 0 && v.rate >= 10 * v.guns && v.generationsSinceLastBuild >= 300 ? 1 : 0,
      target: 1,
    }),
  },
  {
    id: 'expand',
    title: 'Expand the chamber',
    hint: 'Shop → Chamber expansion gives room for more guns and longer runways.',
    progress: (v) => ({ value: v.chamberSize >= 192 ? 1 : 0, target: 1 }),
  },
  {
    id: 'three-streams',
    title: 'Reach 25 gliders per 300 generations',
    hint: 'That needs three guns collected without collisions. Plan the lanes before you build.',
    progress: (v) => ({ value: Math.min(v.rate, 25), target: 25 }),
  },
];

export function goalDone(goal: Goal, v: GoalView): boolean {
  const p = goal.progress(v);
  return p.value >= p.target;
}
