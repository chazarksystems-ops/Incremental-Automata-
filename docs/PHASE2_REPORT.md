# Phase 2 report: first genuine factory (2026-11-04)

## Gate status (MASTER_PLAN §7)

| Criterion | Result |
| --- | --- |
| Correct payout/period | **Pass.** The gun plus an on-lane collector pays one energy every 30 generations, exactly, over 3,000 generations. The display shows 10 per 300 generations at any speed (unit + e2e). |
| Off-lane and false-signal tests pass | **Pass.** See the mapping below and the adversarial set. |
| No economy inflation from a single glider | **Pass.** Each glider has a passage id derived from its trajectory, not from where the gate is. Moving the gate back in front of the same glider five times pays once. Energy always equals the sum of receipts (audited). |

## How detection works (all read-only)

1. **Templates.** Built at start-up by running the engine on the canonical glider in all 8 orientations, giving 16 shapes (4 headings × 4 phases). Each shape stores an *anchor* offset. A real glider's anchor moves only on phase 0, by exactly its heading vector, so its lateral lane is constant.
2. **Observe.** Each generation the collector scans a zone around its gate (±10 lanes, ±12 progress units) for template matches of its own heading whose surrounding 1-cell ring is empty (isolation).
3. **Track.** An observation links to the previous generation's track only if it is the next phase *and* at the expected anchor.
4. **Cross.** The track crosses when its anchor progress goes from < 0 to ≥ 0 relative to the gate. It pays when the lateral offset is within ±1 lane and the track has been consistent for at least 4 generations. Outside ±1 lane it counts as a *near miss*, recording the offset.
5. **Ledger.** The energy ledger only accepts signals and dedupes by passage id `heading:Llane:Ttiming`. The timing is `2·progress + phase − generation`, which is constant for one glider. Receipts are append-only.

The detector runs on **every** generation inside `Factory.step(n)`, so fast-forwarding cannot skip an arrival.

## The 7 collector tests → test names (`tests/detectors/collector.test.ts`)

| # | MASTER_PLAN §4 | Test |
| --- | --- | --- |
| 1 | One award per known glider crossing | `1. exactly one award per known glider crossing (every start phase, every lane inside the gate)` |
| 2 | No award from still life / oscillator / debris | `2. no award from still lifes, oscillators, unrecognised debris or a non-isolated glider shape`, `2b. collision debris crossing the gate does not pay` |
| 3 | Overlap over several generations counts once | `3. a glider overlapping the gate for several generations is counted once` |
| 4 | Two consecutive gun gliders = two | `4. two consecutive gun gliders count as two, 30 generations apart` |
| 5 | Off-lane stops awards | `5. shifting the gate off-lane stops awards; near misses report the offset` |
| 6 | Snapshot restart reproduces receipts | `6. restart from snapshot reproduces receipts exactly (incl. mid-flight tracks)` (JSON round-trip + command replay) |
| 7 | High speed skips nothing | `7. batched / fast stepping skips no arrivals` (single vs batched vs random chunks), plus e2e "step-by-step and fast play earn identical receipts" |

Adversarial cases: other headings crossing or running along the gate; own heading for all 4 directions; a
glider that first appears past the gate; re-positioning the gate to recount; truncation at the board edge;
crossing then destruction inside the confirmation window; the detector never changing the board.

**Each defence is tested on its own** (`tests/detectors/tracker.test.ts`, synthetic generation sequences).
Removing any one of isolation ring, heading filter, phase linking, position linking, confirmation or passage
dedupe fails at least one test (mutation-checked 2026-11-04). Before these tests were added, four of those
six could be removed without any failure.

## Config keys (`src/game/config.ts`)

`detector.gateHalfWidth` = 1, `detector.observeHalfWidth` = 10, `detector.observeDepth` = 12,
`detector.confirmGenerations` = 4, `rewardPerGlider` = 1, `rateWindow` = 300.

## UI

- Collector panel: Energy, gliders collected, last 300 generations, near misses, direction.
- A diagnostic line: "Gliders are passing 6 lanes off the gate. Move the collector 6 cells right." becomes "Collecting: 10 gliders in the last 300 generations."
- Collector tool (button, `C`, click/drag); "Rotate direction".
- Board overlay: observation zone, a highlighted **catch strip** (the lanes the gate accepts), the gate line and heading arrow, a box around each tracked glider, and a flash on payout.
- The default collector starts 6 lanes off the stream, so the first thing a player does is a placement decision.

Screenshots: `docs/screenshots/2026-11-04-phase2/` (1 off-lane diagnostic, 2 zoomed catch strip, 3 collecting).

## Verification

- 106 Vitest tests and 12 Playwright e2e tests pass; typecheck, lint and build pass.
- Fixtures: 59/59 lifelib checkpoints still match. `src/core`, the scheduler and the fixtures are unchanged, so `/life-verify` was not required.
- `/playtest`: the Playwright MCP server was not connected in this session, so the fallback was used: Playwright Test specs plus scripted screenshots. No console errors.
- Benchmark: 128×128 gun chamber 0.121 ms/gen → 0.151 ms/gen with one collector (+0.03 ms). 480 gen/s ≈ 7% of a core.

## Design check

- **Engineering choice, or only "buy more"?** So far it is a *placement* decision: read the lane, move the gate. That is real, but not yet a trade-off. With one gun there is one lane and an obvious answer. Real trade-offs (footprint, competing lanes, collision risk, partial efficiency) need Phase 3's second gun and placement constraints. This is the plan's §6 warning and is still open.
- **Can the player diagnose a non-producing line from the UI alone?** Yes, for this machine. The near-miss message gives the direction and distance, the catch strip shows where the gate looks, tracked gliders are boxed, and the counters separate collected from missed.

## Known limitations

- One collector. A passage pays **once in total**, not once per collector. Revisit if several collectors in series become a mechanic.
- A glider passing within 1 cell of other live cells is not isolated, so it is neither collected nor counted as a near miss.
- No board-wide "lost signals" metric yet. Near misses only cover the ±10-lane zone.
- Moving or rotating the collector drops the gliders it is tracking. A glider first re-acquired past the gate doesn't pay, which is correct, but can surprise a player mid-move.
- Reset clears energy, because there is no persistence until Phase 3. Edge debris still forms past the collector, because the collector is a sensor and doesn't absorb anything. An eater-based physical collector is Phase 6.

## Next gate: Phase 3 (incremental progression)

Spend energy, second gun blueprint, chamber expansion, placement rules, save/load, losses and goals. The key
question for that gate is whether a second gun creates a genuine layout trade-off.
