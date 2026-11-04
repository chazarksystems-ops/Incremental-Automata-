---
name: experiment
description: Run controlled, reproducible comparisons of factory configurations (collector positions, machine placement, orientations, other approved parameters) from a fixed snapshot over a fixed generation count, and rank them by throughput, reliability and space efficiency. Phase 4+ only — use once a working factory, snapshots and deterministic replay exist.
---

# /experiment — controlled layout comparison

**Precondition:** snapshots and deterministic replay exist and `/life-verify`
passes. If the project is still in Phase 1–3, stop and report that this skill
is not yet applicable.

## Procedure

1. **Define the experiment** in `scripts/experiments/<yyyy-mm-dd>-<slug>.json`:
   ```jsonc
   {
     "hypothesis": "Moving the collector 2 cells along the lane does not change throughput",
     "baseline_snapshot": "path/to/snapshot.json",
     "rules_version": "…",
     "generations": 3000,
     "parameters": { "collector.x": [40, 42, 44] },  // approved parameters only
     "metrics": ["signals_collected", "signals_lost", "rate_per_300", "first_award_gen", "footprint_cells", "final_board_hash"]
   }
   ```
2. **Run headless** (Node, no browser) through the same scheduler the game
   uses. Each candidate starts from the identical snapshot; record the command
   list applied.
3. **Reproducibility check:** re-run at least the winning candidate and the
   baseline; hashes and receipts must match exactly. If not, that is a
   determinism bug — switch to `/life-verify`.
4. **Compare** against the baseline: throughput (per 300 gens), reliability
   (lost/total, any collisions or debris), space efficiency (output per
   occupied envelope cell). Rank; note ties.
5. **Record** results to `scripts/experiments/results/<same-slug>.json` and a
   short summary in `docs/PLAYTEST_RESULTS.md` (or `docs/EXPERIMENTS.md`).
   Record failed and null results too.

## Rules

- Only vary parameters a player could vary. No rule changes, no engine flags.
- Never promote a layout into a tutorial/scenario without its reproduction
  record.

## Report

Hypothesis, candidates, table of metrics vs. baseline, reproducibility
verdict, conclusion (supported / refuted / inconclusive), follow-ups.
