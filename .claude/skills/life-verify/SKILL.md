---
name: life-verify
description: Verify that the Game of Life engine still implements exact B3/S23 behavior. Use after any change to src/core (stepLife, WorldState), the RLE codec, pattern transforms, the generation scheduler, or tests/fixtures — and whenever a glider, gun or collector "looks wrong". Produces a pass/fail report backed by fixture hashes, never by screenshots.
---

# /life-verify — simulation correctness

Goal: prove, with deterministic evidence, that the automaton is unchanged
Conway B3/S23 with dead (non-wrapping) boundaries. **Visual resemblance is not
proof.**

## Procedure

1. **Scope the change.** `git diff --stat` against the base branch. List every
   touched file under `src/core/`, `src/patterns/`, `src/game/` (scheduler),
   and `tests/fixtures/`. If fixture expectation files changed, stop and
   justify each change (invariant 6 in `CLAUDE.md`).
2. **Run the deterministic suite.**
   - `npm run typecheck`
   - `npx vitest run tests/core`
   - `npm run validate:fixtures` (if present)
3. **Confirm the canonical checks are present and passing** (add any that are missing):
   | Fixture | Expectation |
   | --- | --- |
   | Block | identical after N steps |
   | Blinker | period 2; phase 1 ≠ phase 0 |
   | Glider | after 4 gens: same shape, translated (±1, ±1) in its heading |
   | Gosper gun | initial bbox 36×9, 36 live cells; after settling, one new glider every 30 gens. The gun *core* is period 30 — the gun+stream as a whole is **not** periodic |
   | Edge | glider driven into an edge does not reappear on the opposite side |
   | Rule purity | a hand-built neighborhood table for all 0–8 neighbor counts × alive/dead matches B3/S23 |
   | RLE round-trip | parse → export → parse is identical; non-B3/S23 rule header and malformed input are rejected with an error, not a crash |
   | Eater 1 (when present) | returns to its original state after consuming one correctly-aimed glider |
4. **Determinism checks.**
   - `step × N` one at a time vs. a batched fast-forward of N ⇒ same hash.
   - Restoring a snapshot and re-running ⇒ same hash sequence.
   - `stepLife` does not mutate its input (compare input hash before/after).
5. **Independent reference (when a hash changes or a new fixture is added).**
   Export the starting RLE, run it in Golly (B3/S23, bounded plane matching our
   board size, or a board large enough that edges are irrelevant) to the same
   generation, and record the resulting RLE/hash in the fixture with the Golly
   version. If Golly is unavailable, say so explicitly; do not invent a reference.
6. **On failure:** save the minimal reproducing RLE + generation into
   `tests/fixtures/failures/` with a one-line description, and add a failing
   test before fixing.

## Hash convention

Hash = SHA-256 over `width`, `height`, `generation`, then the `Uint8Array`
cell buffer (row-major, 0/1). Keep the function in `src/core/` and use it
everywhere; do not hash rendered pixels.

## Report format

```
/life-verify — <PASS|FAIL>
Changed core files: …
Suites: typecheck ✔/✘, core tests n/n, fixtures n/n
Determinism: step-vs-batch ✔/✘, snapshot replay ✔/✘, input immutability ✔/✘
Reference: <Golly version + fixtures cross-checked | not run: reason>
Failures preserved: <paths | none>
Unresolved assumptions: …
```
