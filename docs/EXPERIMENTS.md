# Experiments log

Every gameplay experiment is recorded, including failed and null results (CLAUDE.md invariant 8).

## 2026-11-04: Can one collector catch two gun streams? (Phase 3 design)

**Hypothesis.** A "Wide gate" upgrade (gate accepts ±4 lanes instead of ±1) gives players a real
alternative to buying a second collector: pack two guns so their parallel streams pass through one gate.

**Method.** `scripts/experiments/2026-11-04-parallel-streams.ts`. Gun A is at the starter position (4,4),
firing SE on lane 14. Gun B is tried at every non-overlapping position in a 128×128 chamber, in both
orientations that fire SE (`rot0`, `mirror+rot270`). A placement passes when, after 420 generations, both
lanes still carry ≥ 3 isolated gliders *downstream of both gun bodies*, with B's lane within ±10 of A's.

An earlier version counted gliders anywhere on the board. It reported 4 false positives, which were gliders
still upstream of the gun they were about to hit. Downstream counting fixed that.

**Result.** **0** passing placements (≈ 8.5 min run). Whenever the lanes are within 10 of each other, one
gun's body sits in the other's stream path.

**Decision.** The hypothesis is refuted, so the Wide gate was **dropped** rather than shipped as a
convenience multiplier. The `two-streams` goal hint now says a second collector is needed and why.
Phase 3's engineering choice comes from space instead: clear runways in a 128×128 chamber, orientation
tools that open other directions and edges, and expansion.

**Not covered.** Gun A at other positions or orientations; streams heading in other directions merged by
reflectors (Phase 6); 192×192 chambers.

## 2026-11-05: Is a 1-cell insulating border enough to keep two guns from interacting?

**Trigger.** Playtest round 1: two guns placed one empty column apart wrecked each other.

**Method.** `tests/game/insulation.test.ts`. First, measure the gun's activity area by simulation, in all 8
orientations. Then place a second gun at every position the game's placement rules accept where the two 1-cell
borders touch, excluding stream-crossing layouts. Both guns' activity windows must be bit-identical to solo runs at
generations 15…120.

**Result.** The activity area equals the 36×9 box in every orientation. The first run **failed**: one position
diverged at generation 29, where the neighbour's emitted glider grazed the gun's corner. Root cause: the predicted
lane started at the stream glider nearest the gun at generation 160, up to a full period downstream of the true
exit point, and the hazard check sampled only phase-0 positions. With the lane starting at the measured exit point
and the glider's 4-phase footprint checked, **all positions pass**. Mutation check: border 0 fails.

**Decision.** Border = 1 cell, enforced at build time. The reported placement is kept as a regression test.
