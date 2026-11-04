import type { DetectedSignal } from '../detectors/detector';

/**
 * Energy ledger. Energy changes only through receipts created from accepted
 * detector signals (Phase 3 will add purchases). Receipts are append-only and
 * keyed by passage id, so the same glider can never pay twice.
 */
export interface Receipt {
  passageId: string;
  generation: number;
  detectorId: string;
  amount: number;
}

export interface EconomyState {
  energy: number;
  receipts: Receipt[];
}

export function createEconomy(): EconomyState {
  return { energy: 0, receipts: [] };
}

export type AcceptResult = { ok: true; receipt: Receipt } | { ok: false; reason: 'duplicate-passage' | 'invalid-amount' };

/** Mutates `economy` (owned by the factory). Idempotent per passage id. */
export function acceptSignal(economy: EconomyState, signal: DetectedSignal, amount: number): AcceptResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid-amount' };
  if (economy.receipts.some((r) => r.passageId === signal.passageId)) return { ok: false, reason: 'duplicate-passage' };
  const receipt: Receipt = { passageId: signal.passageId, generation: signal.generation, detectorId: signal.detectorId, amount };
  economy.receipts.push(receipt);
  economy.energy += amount;
  return { ok: true, receipt };
}

/** Recompute energy from receipts — used to check the ledger is self-consistent. */
export function auditEconomy(economy: EconomyState): boolean {
  return economy.receipts.reduce((s, r) => s + r.amount, 0) === economy.energy;
}

export function receiptsInWindow(economy: EconomyState, generation: number, window: number): number {
  let n = 0;
  for (let i = economy.receipts.length - 1; i >= 0; i--) {
    if (economy.receipts[i]!.generation <= generation - window) break;
    n++;
  }
  return n;
}
