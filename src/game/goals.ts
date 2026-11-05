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
  /** Why — the idea behind the goal. */
  hint: string;
  /** What to do — numbered steps naming the exact buttons. */
  steps: string[];
  /** data-testids of controls to highlight while this goal is active. */
  highlight: string[];
  /** Progress towards the goal; done when value ≥ target. */
  progress(v: GoalView): { value: number; target: number };
}

export const GOALS: readonly Goal[] = [
  {
    id: 'first-glider',
    title: 'Line up the collector',
    hint: 'The gun fires a glider every 30 generations along the dashed line coming out of it (orange = nobody collects it yet, green = collected). Your collector (the orange gate in the middle) sits 6 lanes off that line, so it catches nothing yet.',
    steps: [
      'Press “Move collector” (use “Show me”, or press C).',
      'Click on the dashed line coming out of the gun, anywhere below-right of it. The gate snaps onto the line.',
      'Press Play and watch “Collected” go up.',
    ],
    highlight: ['collector-move', 'play'],
    progress: (v) => ({ value: v.collectedTotal, target: 1 }),
  },
  {
    id: 'bank-10',
    title: 'Bank 10 energy',
    hint: 'Each glider that crosses the gate pays 1 energy. Income depends on generations, not seconds, so speeding up is fine.',
    steps: ['Press Play.', 'Drag the Speed slider to the right to go faster.'],
    highlight: ['play', 'speed'],
    progress: (v) => ({ value: Math.min(v.energy, 10), target: 10 }),
  },
  {
    id: 'second-gun',
    title: 'Build a second glider gun',
    hint: 'Guns need room: an insulating border (2 empty cells between guns) and a stream that runs clear of other guns. The preview turns red and says why when a spot is not allowed.',
    steps: [
      'Shop → Gosper glider gun → Build.',
      'Move over the board: the box is the gun plus its insulating border, the dashed line is where its gliders will fly.',
      'Click where the preview is green to build. A good spot: straight below the first gun, about halfway down.',
    ],
    highlight: ['shop-gun'],
    progress: (v) => ({ value: v.guns, target: 2 }),
  },
  {
    id: 'two-streams',
    title: 'Collect two streams',
    hint: "Each stream needs its own collector. Streams cannot be merged: where two streams cross, the gliders destroy each other.",
    steps: [
      'In Machines, find the new gun marked “⚠ not collected”.',
      'Press its “Add collector” button. A collector is built right on its stream (cost shown on the button).',
      'Press Play.',
    ],
    highlight: ['collect-any'],
    progress: (v) => ({ value: Math.min(v.rate, 15), target: 15 }),
  },
  {
    id: 'no-losses',
    title: 'Lose nothing for 300 generations',
    hint: 'Gliders that reach the edge without being collected are losses (red circles at the edge).',
    steps: [
      'Check every gun in Machines says “✓ collected”.',
      'Press Play and let it run for 300 generations without building or moving anything.',
    ],
    highlight: ['lost-300', 'play'],
    progress: (v) => ({
      value: v.guns >= 2 && v.lost === 0 && v.rate >= 10 * v.guns && v.generationsSinceLastBuild >= 300 ? 1 : 0,
      target: 1,
    }),
  },
  {
    id: 'expand',
    title: 'Expand the chamber',
    hint: 'More room means more guns with clear streams.',
    steps: ['Shop → Chamber expansion → Buy.'],
    highlight: ['shop-expansion'],
    progress: (v) => ({ value: v.chamberSize >= 192 ? 1 : 0, target: 1 }),
  },
  {
    id: 'three-streams',
    title: 'Reach 25 gliders per 300 generations',
    hint: 'That needs three guns, each with a clear stream and its own collector. Plan the lanes before you build. Try it as an experiment first!',
    steps: [
      'Build a third gun where the preview is green.',
      'Press “Add collector” next to it.',
      'Run until “Collected (last 300 gen)” reaches 25.',
    ],
    highlight: ['shop-gun', 'collect-any'],
    progress: (v) => ({ value: Math.min(v.rate, 25), target: 25 }),
  },
];

export function goalDone(goal: Goal, v: GoalView): boolean {
  const p = goal.progress(v);
  return p.value >= p.target;
}
