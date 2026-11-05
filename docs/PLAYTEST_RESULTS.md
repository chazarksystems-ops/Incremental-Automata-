# Playtest results

## Round 1: 2026-11-05 (project owner, after Phase 4)

### Reported

1. **"Once I put 2 Gosper guns close together it broke both guns. There should be an insulating border around automations."**
   The screenshot showed a second gun directly right of the starter, one empty column apart. Both guns turned into debris.
2. **"Make everything more intuitive for the playtesting, with better instructions baked in on what to do and test."**
3. **"After building the second gun I could not find a way to actually collect the output, due to one collector and not being able to intersect paths."**

### Diagnosis

1. Placement only demanded 1 empty cell around the gun's *current* live cells. Measured by simulation, a running Gosper gun stays inside its 36×9 box in all 8 orientations (outputs excluded), but two boxes 1 cell apart leave a cell that sees both guns, so they interact. Cells need **≥ 2 empty cells** between them to never interact.
2. Goals had hints but no concrete steps. Key controls were below the fold. Nothing said what to test.
3. A second collector existed in the Shop (15 ⚡), but nothing pointed to it or said a new stream was uncollected. Streams cannot be merged (`docs/EXPERIMENTS.md`, 2026-11-04), and the game never said so.

### Changes

| # | Change |
| --- | --- |
| 1 | **Insulating border.** Each gun's activity area is *measured by running it* (`src/patterns/envelope.ts`) and gets a 1-cell border. Borders may not overlap, which guarantees ≥ 2 empty cells, so guns can never affect each other. Builds are refused, with the reason shown on the preview and on click, when borders overlap, when live cells are within 2 cells, or when a stream would enter a gun's border (either direction). The border is drawn as a dotted box, green or red while placing. Removing a gun clears its whole activity area. Config flags `insulation` and `blockStreamIntoMachines`. |
| 1 | **Proof, not argument.** `tests/game/insulation.test.ts` places a second gun in every orientation at every position the game allows where the borders touch. Both guns must evolve bit-identically to running alone. This test found a real hole: a stream glider skimming a neighbour's corner. The stream lane started up to one period downstream of where gliders actually leave the gun, and the hazard check ignored the glider's 4-phase footprint. Both are fixed. Mutation check: with border 0 the test fails. The reported placement is a regression test showing that it wrecks both guns and is now refused. |
| 2 | **How to play** dialog on first visit (and via **? Help**) with a visual legend, rules, controls and what to test. Each goal now has **numbered steps** naming exact buttons, a **pulsing highlight** on the control to use, and a **Show me** button that scrolls to it. A **Playtest checklist** (10 tasks) ticks itself from game events, with a notes box and **Show playtest report** (plain text to copy). Everything is stored only in the browser. |
| 3 | Each gun in Machines shows **✓ collected / ⚠ not collected** (predicted from its lane), and uncollected streams are drawn **orange**. **Add collector** puts a collector right on that gun's stream (`recommendCollectorSpot`); a test confirms the spot really collects for all 8 orientations. After building a gun the message says its stream is not collected yet and where to fix that. The second collector costs **10** (was 15). The goal hint explains that streams cannot be merged. |

### Found during my own `/playtest` (Playwright MCP) of these fixes, and fixed

- Goal text said "green dashed line", but an uncollected stream is orange, which is exactly the starter's state at the start.
- The highlighted "Move collector" button was below the fold, so the checklist now starts collapsed under Production and there is a Show me button.
- The red refusal banner covered the spot it described, so it moved to the bottom of the board.
- Machine rows overflowed (Remove was clipped), so actions now go on their own line.
- The goal name and coverage chip updated one frame late after actions; they now render immediately.

### Still open / to watch in round 2

- Do testers find **Add collector** without the goal card pointing at it?
- Is "insulating border" understood from the dotted box alone?
- Crossing streams are still *allowed* (warned only). Should they be refused like streams into guns?
- Checklist completion and notes now come back in the report. Please send it after the next session.
