# Architecture (Phases 1–4)

```text
UI (src/ui)  ──commands──▶  Simulation (src/game/simulation.ts) ◀── GenerationClock (src/game/clock.ts)
   │                            │  applies commands between generations, logs them
   │                            ▼
   │                      Pure core (src/core): WorldState, stepLife, RLE, transforms, stamp, hash
   │                            ▲
   │                      Pattern library (src/patterns): RLE files + manifest/provenance
   ▼
Renderer (src/render): camera math + Canvas 2D board renderer (read-only)
```

## Module rules

| Module | May import | Notes |
| --- | --- | --- |
| `src/core` | nothing outside `src/core` | Enforced by ESLint `no-restricted-imports`. No DOM, no time, no randomness. |
| `src/patterns` | `core` | `manifest.ts` is plain data (usable from Node); `library.ts` uses Vite `?raw` imports (browser/Vitest). |
| `src/detectors` | `core`, `game/config` types | Glider templates (derived by running the engine) and the pure tracker `updateDetector(state, world)`. Read-only against the grid. |
| `src/economy` | `detectors` types | Append-only receipt ledger keyed by passage id. |
| `src/game` | `core`, `detectors`, `economy` | Clock, `Simulation` (cells + command log), `Factory` (simulation + detectors + ledger, every-generation evaluation, snapshot/replay), `config` (all tuning). |
| `src/render` | `core` types | Never mutates state. |
| `src/ui` | everything | The only module touching the DOM besides the renderer. |
| `src/scenarios` | `core` | Starting layouts. |

## Contracts

- `WorldState { width, height, generation, cells: Uint8Array }` — row-major, 0/1. Treated as immutable: every
  operation returns a new object.
- `stepLife(world) → world'` — one B3/S23 generation, `generation + 1`, dead cells beyond the edge.
- `stampGrid(world, grid, x, y, {transform, margin, allowOverlap}) → StampResult` — validates bounds and
  clearance (default 1 cell), returns `near-edge` warnings; never advances the generation.
- `hashWorld(world)` — SHA-256 over `IA1:<w>x<h>@<gen>\n` + cell bytes. Shared with the Python reference.
- `Simulation.apply(command)` — applies at the current generation boundary and logs `{generation, command}`;
  `replay(initial, log, toGeneration)` reproduces the run exactly.
- `GenerationClock.tick(dtMs) → n` — integer generations for elapsed time; caps per-frame work and drops the
  backlog (the run slows down; generations are never skipped). Results depend only on the generation count.

## Decisions

- **Boundary:** fixed 128×128, dead outside. A glider reaching a corner becomes a block (verified against
  lifelib); in the default chamber the stream piles debris at the far edge. That is real behaviour, kept as
  the "loss to edges" constraint the plan wants.
- **Rendering:** cells go into a 1-pixel-per-cell bitmap and are scaled with nearest-neighbour sampling. The
  cost depends on the number of cells, not the zoom.
- **Debug handle:** `window.__ia` (dev builds only; not in production) exposes read-only state for e2e tests
  and `/playtest`.

## Phase 2 contracts

- `Factory.step(n)` runs `n` generations and evaluates every detector after **each** one, then feeds signals to the ledger.
- `Factory.apply(cmd)` handles cell commands and collector moves/rotations, logged with their generation. `replayFactory(snapshot, log, gen)` reproduces the receipts exactly.
- `GameSnapshot { version, rule, generation, world: {w, h, rle}, detectors (incl. in-flight tracks), economy }` is JSON-serialisable. `Factory.fromSnapshot` resumes bit-for-bit.
- `DetectedSignal.passageId = heading:L<lane>:T<2·progress + phase − generation>` identifies a glider's trajectory independent of gate position. The ledger rejects duplicates.

## Phase 3 additions

- **Modes.** Factory: cells change only through machines (`build-gun`, `remove-machine`) and upgrades (`buy-upgrade` expansion). Sandbox: a separate `Factory` with `sandbox: true` (free editing, zero prices, never saved).
- **Machines.** `Machine { id, kind, x, y, transform, width, height, paid, builtAt }`. Guns are stamped through `Simulation` commands. Removal uses `clear-rect`. Expansion uses `resize` (pure `resizeWorld`, grow-only).
- **Per-generation pipeline in `Factory.step`.** `stepLife` → each detector → ledger (passage dedupe, loss retraction) → edge-loss monitor → receipt compaction every 500 generations → goal latching. All of it is deterministic, so batch size never changes results.
- **Ledger.** `EconomyState { energy, receipts (recent), archived {income, count}, entries (purchase/refund) }`. `auditEconomy` recomputes the balance and checks it is ≥ 0.
- **Snapshot v2 / save.** `GameSnapshot` holds world RLE, machines, detectors (with in-flight tracks), economy, losses, unlocks, goals, `nextId`, `lastBuildGeneration`. `src/game/save.ts` wraps it in a versioned envelope with validation. Corrupt saves are backed up, never crash the game.
- **Shared glider scan.** `src/detectors/scan.ts` (`findIsolatedGliders`, `passageId`) is used by collectors and the loss monitor. A sliding-window fast path is kept equal to a naive reference by a test.
- **Assistive overlay only.** `gunOutput` measures each orientation's stream lane by running the gun. The renderer draws it dashed; it never affects cells.

## Phase 4 additions

- **History (`src/game/history.ts`).** Snapshot-based undo/redo per mode, with no inverse commands, so undo and redo are exact by construction. The UI records the pre-action snapshot only for successful actions and coalesces gestures by key.
- **Trials (`src/game/trial.ts`).** `Trial` runs a *copy* (`Factory.fromSnapshot`) for N generations, sliceable via `advance(n)`, and returns `TrialResult` (steady-state collected/lost over the last `rateWindow`, totals, per-collector, near misses, final hash). `compareTrials` gives the verdict. The live game is never touched.
- **Experiments (UI orchestration in `src/ui/app.ts`).** `{ baseline snapshot, separate History, cached baseline result, variant result, tested layout signature }`. Live play is paused. Keep records one history entry (baseline → current). Discard restores the baseline. Autosave writes the baseline while an experiment is open.
- **Checkpoints (`src/game/save.ts`).** A list of `{ id, name, generation, createdAt, snapshot }` under its own storage key. Each entry is validated with the same code path as save files.
- **Guides (`src/game/guides.ts`).** Pure geometry over predicted lanes (`gunOutput`): `laneHazards` and `snapToLane`. Advisory only; tests check the predictions against real runs.

## Playtest round 1 additions (2026-11-05)

- **Envelopes (`src/patterns/envelope.ts`).** `measureEnvelope(pattern, transform)` runs a machine alone and returns its activity box (outputs excluded) and the 1-cell insulating keep-out box. `Factory.checkGunPlacement` enforces non-overlapping keep-outs, no live cells within 2 cells, and (flagged) no stream into a keep-out. Guides use keep-out boxes for hazards.
- **Lanes start at the measured exit point** (`gunOutput`: the first glider's first isolated position). The hazard check covers a glider's 4-phase footprint.
- **Coverage and recommendations (`guides.ts`).** `streamCoverage` maps gun → collector. `recommendCollectorSpot` picks the first clear point on a lane. Both are predictions; the live counters show the real result.
- **Playtest UI (`src/ui/playtest.ts`).** Checklist tasks ticked from UI events, notes and a plain-text report, all in browser storage only. Goals carry `steps` and `highlight` (data-testids) for the goal card.
