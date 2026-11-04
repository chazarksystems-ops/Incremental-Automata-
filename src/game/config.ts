/**
 * Gameplay tuning. All experimental numbers live here (MASTER_PLAN §8:
 * "Put all experimental gameplay rules behind data/config flags").
 * None of these affect the automaton.
 */
export interface DetectorParams {
  /** Lateral half-width of the collecting gate, in lanes (0 = exactly one lane). */
  gateHalfWidth: number;
  /** Lateral half-width of the observation zone used for near-miss diagnostics. */
  observeHalfWidth: number;
  /** How far before/after the gate (in anchor-progress units, 2 per glider period) gliders are tracked. */
  observeDepth: number;
  /** Consecutive consistent generations a glider must be tracked before it can pay out. */
  confirmGenerations: number;
}

export type UpgradeId = 'orientation' | 'expansion';
export type MachineKind = 'gun' | 'collector';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
}

export interface GameConfig {
  detector: DetectorParams;
  /** Energy awarded per confirmed, unique glider passage. */
  rewardPerGlider: number;
  /** Window (generations) for displayed production and loss rates. */
  rateWindow: number;
  /** Price of the next machine of a kind, indexed by how many of that kind are owned now. */
  machineCosts: Record<MachineKind, readonly number[]>;
  upgrades: readonly UpgradeDef[];
  chamber: { initialSize: number; expandedSize: number };
  /** A glider within this many cells of the edge it is heading for counts as lost (if never collected). */
  lossBand: number;
  /** Generations each experiment test runs (baseline and variant alike). */
  trialGenerations: number;
  /** Saved checkpoints kept per game. */
  maxCheckpoints: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  detector: { gateHalfWidth: 1, observeHalfWidth: 10, observeDepth: 12, confirmGenerations: 4 },
  rewardPerGlider: 1,
  rateWindow: 300,
  machineCosts: {
    gun: [0, 10, 25, 50, 100], // owning 1 (the starter) ⇒ next costs 10
    collector: [0, 15, 30, 60],
  },
  upgrades: [
    {
      id: 'orientation',
      name: 'Orientation tools',
      description: 'Rotate and mirror gun blueprints before placing them.',
      cost: 20,
    },
    {
      id: 'expansion',
      name: 'Chamber expansion',
      description: 'Grow the chamber from 128×128 to 192×192. Anything resting against the old right/bottom edge is no longer held by it.',
      cost: 40,
    },
  ],
  chamber: { initialSize: 128, expandedSize: 192 },
  lossBand: 4,
  trialGenerations: 900,
  maxCheckpoints: 5,
};

export function upgradeDef(config: GameConfig, id: UpgradeId): UpgradeDef {
  const u = config.upgrades.find((x) => x.id === id);
  if (!u) throw new Error(`Unknown upgrade ${id}`);
  return u;
}
