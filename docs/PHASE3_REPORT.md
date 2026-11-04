# Phase 3 report: incremental progression (2026-11-04)

## Gate status (MASTER_PLAN §7)

| Criterion | Result |
| --- | --- |
| A new player can progress without understanding RLE or memorising patterns | **Pass (scripted, not human-tested).** All 7 goals complete using only the collector tool and shop actions. RLE and free editing are confined to Sandbox. This is checked by a unit-level playthrough (`Phase 3 gate: a new player can progress through the goals`) and browser tests (goal card → line up → earn → buy a gun via the shop). No human playtest has happened yet. |
| The player has an engineering choice, not only an upgrade button | **Partial.** See the design check below. Build placement, runways and collection are real decisions. My planned second route (a Wide gate shared by two streams) was refuted by experiment and dropped. Once the lanes are understood the best strategy is close to linear: one collector per gun. |

## Delivered

| Plan item | Implementation |
| --- | --- |
| Energy expenses | Append-only ledger of purchases and refunds next to receipts. The audit recomputes the balance, which can never go negative. Escalating machine prices: guns 10/25/50/100, collectors 15/30/60. |
| Second gun blueprint | **Shop → Gosper glider gun**, stamped as the real pattern at a generation boundary. The placement preview shows the **predicted stream lane**, measured by running each gun orientation (`src/patterns/gun-output.ts`), not hand-coded. Removing a machine clears its footprint and refunds what was paid in full. |
| Chamber expansion | 128 → 192 (40 energy). `resizeWorld` keeps every cell at its coordinates and never shrinks the board. |
| Placement rules | Factory mode has no free editing: cells change only through bought or removed machines. Placement is validated for bounds, 1-cell clearance from live cells and affordability. A failed build costs nothing. Rotate/mirror needs **Orientation tools** (20). |
| Basic tutorial | 7 goals (`src/game/goals.ts`) checked every generation and latched with their generation: line up → bank 10 → second gun → collect two streams → lose nothing for 300 generations → expand → 25 per 300. A goal card shows the current goal, a hint and a progress bar. Completions appear in the message bar. |
| Save and load | Versioned envelope (`src/game/save.ts`), autosave every 5 s and on hide/pagehide, plus manual Save. Loading validates format, rule, chamber size, RLE and economy. A corrupt save is kept under `…corrupt`, and the game starts fresh with an explanation. The sandbox is never saved. |
| Production losses | A read-only edge monitor (`src/game/losses.ts`) counts each glider that reaches an edge band without having been collected. The count is deduped by passage id and retracted if the glider is collected afterwards. Shown as "Lost at edges (last 300 gen)" with red markers on the board. |
| Goals | See tutorial. |
| (extra) Sandbox mode | The Phase 1 editor (draw, blueprints, RLE, clear) plus every tool, free and unsaved. It is a separate Factory instance and never touches the factory game. |
| (extra) Receipt compaction | Receipts older than 2,000 generations fold into archived totals (deterministically every 500 generations), so saves stay small in long sessions. Dedupe stays safe because a glider cannot remain on a finite board that long. |

## Experiment that changed the design

See `docs/EXPERIMENTS.md`. Can one collector catch two gun streams? **No placement passed** (exhaustive over the
starter-gun setup, both SE orientations, 128×128). The Wide gate upgrade was removed instead of shipping as a
convenience multiplier, and the goal hint now explains why each stream needs its own collector.

## Verification

- 129 Vitest tests and 18 Playwright e2e tests pass; typecheck, lint and build pass, and the production bundle has no debug handle.
- `/life-verify`: **PASS**. `src/core/world.ts` gained the pure functions `resizeWorld` and `clearRect`; `stepLife` is untouched. 59/59 lifelib checkpoints match and `reference_lifelib.py --check` is ok. Determinism holds across chunk sizes 1 vs 997 and under command replay, including builds, removal and expansion.
- Phase 3 determinism test: the same 5,000-generation script with builds, a collector, expansion and starter removal produces an identical snapshot whether stepped 1 or 997 at a time, and replay matches.
- `/playtest`: the Playwright MCP server was not connected in this session. Fallback: Playwright Test specs (`tests/e2e/progression.spec.ts`) and scripted screenshots (`docs/screenshots/2026-11-04-phase3/`). No console errors.

## Performance

The loss monitor and per-generation goals added cost, so I profiled each part and replaced the glider scanner with
a sliding-window version, kept exactly equal to a naive reference by a test:

| | before | after |
| --- | --- | --- |
| collector update (each) | 0.17 ms | 0.03 ms |
| edge-loss scan (192²) | 0.78 ms | 0.13 ms |
| full factory, 192², 3 guns, 3 collectors | 1.69 ms/gen | **0.69 ms/gen** (≈ 33% of a core at 480 gen/s) |

`stepLife` (≈ 0.3–0.5 ms at 192²) now dominates. Double-buffering or a bit-packed stepper is the next lever if needed.

## Config keys added (`src/game/config.ts`)

`machineCosts.gun`, `machineCosts.collector`, `upgrades[] (orientation 20, expansion 40)`,
`chamber.initialSize/expandedSize`, `lossBand` = 4. Factory constant: `RECEIPT_KEEP_GENERATIONS` = 2000.

## Design check

- **Engineering choice or upgrade button?** Real choices now exist. Where a gun goes decides whether its runway is clear: a bad spot destroys the stream, or the stream destroys something. Players decide where collectors sit, whether to accept losses, and in what order to spend (more guns, orientation tools to use other directions and edges, or expansion). But the dominant strategy is easy to find: build a gun with a clear lane, then put a collector on its dashed line, and repeat. Space only binds at about 4 or more guns in 128×128. This is the MASTER_PLAN §6 risk ("linear progression with little design") showing up, partly mitigated.
- **Can the player diagnose a failing line from the UI?** Yes: predicted lanes, per-collector near-miss advice, red loss markers at the edge, and the lost-per-300 counter.

## Known limitations

- No human playtest yet. The usability targets in MASTER_PLAN §6 are unmeasured.
- Clicking in the shop can scroll the goal card out of view on short screens (goal completions still show in the message bar).
- Expansion leaves edge debris mid-board. In the tested layouts it stayed stable (population plateaued), but a different layout could set it off. This is real physics, and the shop text warns about it.
- Removing a gun clears its whole bounding box, including any gliders or debris inside it at that moment.
- `canPlaceGun` / previews don't warn when a predicted lane runs into an existing machine. The dashed lines make it visible, but a computed warning would help.
- Losses only count gliders that reach an edge. Gliders destroyed mid-board, for example by crossing streams, appear only as missing income.

## Recommendation for the next gate (Phase 4: experimentation UX)

Phase 4 is planned next (snapshots, undo, experiment branches). Given the design-check result, I'd also prioritise
a real trade-off source in parallel. Options: stream-transforming patterns (eater-based physical collectors that
free the lane, reflectors that merge directions, both Phase 6 in the plan), or scoring space efficiency (energy per
occupied cell). MASTER_PLAN §5's Phase 5 pivot test (do players voluntarily reconfigure?) needs real playtesters.
