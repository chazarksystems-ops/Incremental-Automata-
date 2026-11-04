---
name: factory-build
description: Implement game-layer mechanics on top of the verified Life engine — glider detectors/collectors, unique-passage deduplication, the energy ledger, blueprints, placement validation, unlocks and progression. Use for any work in src/detectors, src/economy, src/game or blueprint/unlock UI. Enforces the boundary that the game layer observes the automaton but never alters it.
---

# /factory-build — gameplay implementation

## The boundary (non-negotiable)

- The game layer **reads** the grid; it never writes cells except through
  player-initiated, validated `stampPattern` commands applied at generation
  boundaries.
- Upgrades unlock **capabilities** (new verified blueprints, rotate/mirror,
  chamber size, comparison tools). They never alter B3/S23, delete projectiles,
  or nudge patterns into working.
- Every machine must have observable inputs, observable outputs and a measurable
  rate. If you can't write a test that observes it, it isn't a machine yet.

## Procedure

1. **Locate the phase.** Confirm the feature belongs to the current phase in
   `docs/MASTER_PLAN.md` §7. If not, stop and report.
2. **Write tests first** in `tests/detectors/`, `tests/economy/` or
   `tests/integration/`. For detectors, the master-plan collector tests are the
   minimum:
   1. exactly one award per known glider crossing
   2. no award from still lifes, oscillators or unrecognised debris
   3. a glider overlapping the gate for several generations counts once
   4. two consecutive gun gliders count as two
   5. shifting the gate off-lane stops awards
   6. restart from snapshot reproduces receipts exactly
   7. high simulation speed / batched stepping skips no arrivals
   Add adversarial cases (glider of wrong heading, glider phase variants,
   partial glider at board edge, collision debris crossing the gate).
3. **Implement** with the contracts in `docs/MASTER_PLAN.md` §3
   (`Detector`, `DetectedSignal`, `EconomyState`, `GameSnapshot`). Detection
   matches the four glider phase templates with heading, across consecutive
   generations, and assigns a unique passage ID. Evaluate detectors on **every**
   generation, including inside batched fast-forward.
4. **Ledger.** `EconomyState` changes only via receipts derived from accepted
   `DetectedSignal`s (plus explicit purchases). Receipts are append-only and
   replayable.
5. **Placement.** `stampPattern` validates bounds, overlap, envelope clipping
   (warn on edge) and cost; returns a result object rather than throwing.
6. **Config flags.** Costs, rewards and experimental rules live in data/config,
   not hardcoded.
7. **Verify.** Run `npm test`; if anything under `src/core/` or the scheduler
   moved, run `/life-verify`. If UI changed, run `/playtest`.

## Design check (answer in the report)

- Does this give the player an engineering choice (footprint, lanes, collision
  risk, partial efficiency), or only a "buy more" button?
- Can a player diagnose why the machine is or isn't producing from the UI alone?

## Report

Feature, phase, tests added (with the 7 collector cases mapped to test names),
config keys introduced, design-check answers, known limitations.
