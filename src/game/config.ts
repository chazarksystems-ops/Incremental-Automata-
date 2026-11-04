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

export interface GameConfig {
  detector: DetectorParams;
  /** Energy awarded per confirmed, unique glider passage. */
  rewardPerGlider: number;
  /** Window (generations) for the displayed production rate. */
  rateWindow: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  detector: { gateHalfWidth: 1, observeHalfWidth: 10, observeDepth: 12, confirmGenerations: 4 },
  rewardPerGlider: 1,
  rateWindow: 300,
};
