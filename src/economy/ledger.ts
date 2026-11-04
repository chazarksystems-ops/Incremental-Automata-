import type { DetectedSignal } from '../detectors/detector';

/**
 * Energy ledger. Energy changes only through:
 *  - receipts created from accepted detector signals (income), and
 *  - purchase / refund entries for explicit player actions.
 * Both lists are append-only; `auditEconomy` recomputes the balance.
 */
export interface Receipt {
  passageId: string;
  generation: number;
  detectorId: string;
  amount: number;
}

export interface LedgerEntry {
  kind: 'purchase' | 'refund';
  /** What was bought/refunded, e.g. "gun", "collector", "upgrade:expansion". */
  item: string;
  /** Machine id or upgrade id the entry refers to. */
  ref: string;
  generation: number;
  amount: number;
}

export interface EconomyState {
  energy: number;
  /** Recent receipts (see compactEconomy). */
  receipts: Receipt[];
  /** Receipts folded out of `receipts` by compaction. */
  archived: { income: number; count: number };
  entries: LedgerEntry[];
}

export function createEconomy(): EconomyState {
  return { energy: 0, receipts: [], archived: { income: 0, count: 0 }, entries: [] };
}

/**
 * Fold receipts older than `keep` generations into the archived totals so a
 * long session doesn't grow without bound. Safe for dedupe because a glider
 * cannot stay on a finite board for `keep` generations. Mutates `economy`;
 * returns the passage ids removed.
 */
export function compactEconomy(economy: EconomyState, generation: number, keep: number): string[] {
  const cutoff = generation - keep;
  let n = 0;
  while (n < economy.receipts.length && economy.receipts[n]!.generation <= cutoff) n++;
  if (n === 0) return [];
  const old = economy.receipts.splice(0, n);
  for (const r of old) {
    economy.archived.income += r.amount;
    economy.archived.count += 1;
  }
  return old.map((r) => r.passageId);
}

export type AcceptResult = { ok: true; receipt: Receipt } | { ok: false; reason: 'duplicate-passage' | 'invalid-amount' };

/** Mutates `economy` (owned by the factory). Idempotent per passage id. */
export function acceptSignal(
  economy: EconomyState,
  signal: DetectedSignal,
  amount: number,
  seen?: ReadonlySet<string>,
): AcceptResult {
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid-amount' };
  const dup = seen ? seen.has(signal.passageId) : economy.receipts.some((r) => r.passageId === signal.passageId);
  if (dup) return { ok: false, reason: 'duplicate-passage' };
  const receipt: Receipt = { passageId: signal.passageId, generation: signal.generation, detectorId: signal.detectorId, amount };
  economy.receipts.push(receipt);
  economy.energy += amount;
  return { ok: true, receipt };
}

export type SpendResult = { ok: true; entry: LedgerEntry } | { ok: false; reason: 'insufficient-energy' | 'invalid-amount' };

/** Deduct `amount` for a purchase. Never lets energy go negative. Mutates `economy`. */
export function spend(economy: EconomyState, item: string, ref: string, generation: number, amount: number): SpendResult {
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: 'invalid-amount' };
  if (amount > economy.energy) return { ok: false, reason: 'insufficient-energy' };
  const entry: LedgerEntry = { kind: 'purchase', item, ref, generation, amount };
  economy.entries.push(entry);
  economy.energy -= amount;
  return { ok: true, entry };
}

/** Return `amount` for a removed machine. Mutates `economy`. */
export function refund(economy: EconomyState, item: string, ref: string, generation: number, amount: number): LedgerEntry {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`Invalid refund ${amount}`);
  const entry: LedgerEntry = { kind: 'refund', item, ref, generation, amount };
  economy.entries.push(entry);
  economy.energy += amount;
  return entry;
}

/** Balance recomputed from the ledger equals the stored balance, and never went negative. */
export function auditEconomy(economy: EconomyState): boolean {
  const income = economy.archived.income + economy.receipts.reduce((s, r) => s + r.amount, 0);
  const net = economy.entries.reduce((s, e) => s + (e.kind === 'refund' ? e.amount : -e.amount), 0);
  return income + net === economy.energy && economy.energy >= 0;
}

export function lifetimeIncome(economy: EconomyState): number {
  return economy.archived.income + economy.receipts.reduce((s, r) => s + r.amount, 0);
}

export function collectedCount(economy: EconomyState): number {
  return economy.archived.count + economy.receipts.length;
}

export function receiptsInWindow(economy: EconomyState, generation: number, window: number): number {
  let n = 0;
  for (let i = economy.receipts.length - 1; i >= 0; i--) {
    if (economy.receipts[i]!.generation <= generation - window) break;
    n++;
  }
  return n;
}
