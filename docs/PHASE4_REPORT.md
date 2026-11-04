# Phase 4 report: experimentation UX (2026-11-04)

## Go decision

Phase 3's gate was a **partial pass**: progression worked, but the engineering choice was thin (see
`PHASE3_REPORT.md`). On 2026-11-04 the project owner instructed "Start phase 4", which is recorded here as the
explicit go decision required by `CLAUDE.md`. The Phase 3 trade-off concern is still open (see the end of this report).

## Gate status (MASTER_PLAN §7)

> Players can make an experiment, detect if it worked, and restore previous configuration with no state corruption.

| Part | Result |
| --- | --- |
| Make an experiment | **Pass.** **Start experiment** pauses live play and branches the game. The player changes the layout with the normal tools; costs are real. |
| Detect if it worked | **Pass.** **Test** runs the original and the changed layout headless for the same 900 generations and shows them side by side, with a verdict: *Better / Worse / Mixed / No change* on steady-state collection and losses. The verdict is marked stale as soon as the layout changes. |
| Restore with no corruption | **Pass.** **Discard** restores the original snapshot, which is JSON-identical in unit and e2e tests and then evolves identically to an untouched game. **Keep** commits the change, and one Undo reverts the whole experiment exactly. |

## Delivered (MASTER_PLAN Phase 4 list)

| Item | Implementation |
| --- | --- |
| Snapshots | **Checkpoints**: Save checkpoint / Restore / Delete, up to 5. They persist in browser storage, are validated like save files on load (corrupt entries are dropped and reported) and survive reload. Restoring is itself undoable. |
| Undo/redo | `src/game/history.ts`. Snapshot-based, so undo restores the exact state before an action, **including the generation**, and redo restores the exact undone state. Up to 50 steps per mode. A drag (collector move, sandbox painting) is one step. Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y and header buttons that name the action. Failed actions are not recorded. |
| Experiment branch | Start → change → Test → Keep/Discard (above). While it runs, play, step and checkpoints are disabled, and autosave stores the *original*, so reloading mid-experiment never commits untested changes. |
| Predicted display of *tested* throughput | Production panel → **Tested throughput** (`20 / 300 · 0 lost`). It is the measured result of the last test for the *current* layout, shows "–" once the layout differs, and the tooltip gives the generation it was measured from. Testing an unchanged layout is a quick way to measure it. |
| Side-by-side measurement | Results table: collected per 300 (steady), lost per 300 (steady), collected in 900, energy gained, near misses; original vs. with changes. `src/game/trial.ts` runs it, in 8 ms slices per frame so the page stays responsive. |
| Construction guides | Collectors **snap onto predicted lanes** within 3 lanes (build adopts the lane's direction; move keeps its own). Shift disables snapping and a dashed square shows the snap target. Lanes start at the gun's nearest glider for every orientation (a bug fix: north-bound guns used to start their dashed line far from the gun). |
| Warning overlays | `src/game/guides.ts` predicts **stream runs into a machine**, **streams cross**, **head-on** and **parallel streams under 6 lanes apart**. Shown live while building (red lane, ✕ at the predicted point, a banner listing each problem) and for the placed layout (red ✕ marks and a warnings list under Machines). |

## Predictions checked against real runs

Guides are predictions, so the tests run the real automaton and check that they mean something
(`tests/game/guides.test.ts`):

- Two-gun Phase 3 layout: no warning, and both streams really survive (≥ 10 gliders each after 700 generations).
- A stream predicted to run into a gun: that gun really produces **0** gliders.
- Two crossing layouts predicted: gliders really are destroyed (lane counts fall below the solo gun's).
- In Factory mode a gun cannot be dropped onto a live stream at all: live gliders always sit in the footprint, so placement validation refuses it. The "harmful experiment" test therefore uses a crossing stream, which tests as **Worse**.

## Verification

- 149 Vitest tests and 24 Playwright e2e tests pass; typecheck, lint and build pass; the production bundle has no debug handle. 59/59 lifelib checkpoints match.
- `src/core`, the scheduler and the fixtures are unchanged, so `/life-verify` was not triggered.
- **`/playtest` via the Playwright MCP server** (first time it was available): 5 scenarios passed. It found and fixed four issues: a favicon 404 in the console; "collected 0" should be "±0"; tested throughput wrapped to 5 lines; panels refreshed one frame late after actions. The final console check was clean. Screenshots: `docs/screenshots/2026-11-04-phase4/`.

## Performance

| | 128², 2 guns | 192², 3 guns |
| --- | --- | --- |
| Snapshot per action (undo) | 0.44 ms, 9.7 KB | 0.50 ms, 15 KB |
| One 900-generation trial | 230 ms | 394 ms |

A Test runs two trials (the original's result is cached after the first test) in 8 ms-per-frame slices, so about 1–2 s of
wall time without blocking the page. Undo memory is bounded at 50 snapshots, about 0.75 MB worst case.

## Config keys added

`trialGenerations` = 900, `maxCheckpoints` = 5 (`src/game/config.ts`); `STREAM_CLEARANCE` = 6 (`src/game/guides.ts`).

## Known limitations

- Undo is time travel: undoing an action during live play also rewinds the generations since then. This is deliberate (no state can survive an undo), and the message says "Back to generation N", but players may expect a "remove what I just built" undo instead.
- Undo history is session-only. Checkpoints persist.
- Guide predictions ignore timing. Crossing streams sometimes interleave without colliding; the warning says "probably". Head-on and too-close warnings are geometric only and not yet validated against runs.
- Trials run on the main thread in slices. A Web Worker would be the next step if chambers or trial lengths grow.
- Still no human playtest. MASTER_PLAN's Phase 5 needs real players.

## Open design question carried from Phase 3

The experiment tools make it cheap to *compare* layouts, but the layouts on offer still have a near-dominant strategy
(one collector per gun on its dashed line). Phase 5's question, "do players voluntarily reconfigure?", is therefore
the right next gate. If the answer is no, the plan prescribes stream-transforming patterns or a Wireworld comparison
rather than more upgrades.
