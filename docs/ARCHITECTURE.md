# Architecture (Phases 1–2)

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
