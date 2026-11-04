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
