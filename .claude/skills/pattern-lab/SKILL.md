---
name: pattern-lab
description: Import, verify, transform and catalogue Game of Life patterns (RLE) for use as game blueprints — guns, eaters, reflectors, still lifes. Use when adding a pattern to src/patterns or tests/fixtures, when determining a pattern's period, output lane, operating envelope or valid orientations, or when recording third-party provenance and licensing.
---

# /pattern-lab — pattern research and engineering

Reuse established Life engineering (LifeWiki, Golly's pattern collection)
instead of inventing machines. Every pattern that enters the game must be
verified, characterised and attributed.

## Procedure

1. **Source.** Prefer a canonical RLE from a cited source (LifeWiki page,
   Golly bundled pattern). Record the exact URL and retrieval date. Do not bulk
   import archives — LifeWiki article text is GFDL and contributed files need
   per-item provenance review.
2. **Parse and validate.** Load via the project RLE parser. Reject if the rule
   header is not `B3/S23` (or absent ⇒ assume B3/S23 and note it).
3. **Characterise** (record in the manifest entry):
   - bounding box and live-cell count at gen 0
   - period / settling time (for guns: settle generation and emission period)
   - outputs: projectile type, heading, emission phase, the lane (line through
     the board the projectile travels) relative to the pattern origin
   - **operating envelope**: the box that must stay clear for the pattern to
     work over its characterised horizon (includes spark zones and output lane
     segment near the pattern)
   - orientations: which of the 8 rotation/mirror variants are allowed; verify
     each variant independently (transform then simulate — never assume a
     transformed gun still works without checking its output lane)
4. **Test.** Add a fixture under `tests/fixtures/patterns/<id>/` with the RLE
   and expected hashes at chosen checkpoints, and a Vitest case. Run
   `/life-verify` afterwards.
5. **Cross-check in Golly** where possible; record the Golly version.
6. **Catalogue.** Add/update the manifest entry in `src/patterns/` and the row
   in `docs/LICENSE_PROVENANCE.md`.

## Manifest entry (required fields)

```jsonc
{
  "id": "gosper-glider-gun",
  "name": "Gosper glider gun",
  "rule": "B3/S23",
  "rle": "…",
  "width": 36, "height": 9, "population": 36,
  "canonical_orientation": "as published on source",
  "period": 30, "settle_generation": 0,      // measured, not copied
  "outputs": [{ "type": "glider", "heading": "SE", "lane": "…", "first_emission_gen": 0 }],
  "envelope": { "x": 0, "y": 0, "w": 0, "h": 0 },
  "allowed_transforms": ["identity", "…"],
  // provenance
  "source_url": "https://conwaylife.com/wiki/Gosper_glider_gun",
  "author_or_discoverer": "Bill Gosper",
  "retrieved_date": "YYYY-MM-DD",
  "license_review": "pending | ok: <reason>",
  "digest": "sha256 of normalised RLE",
  "test_status": "verified | failing | unverified",
  "attribution": "…"
}
```

Numbers marked "measured" must come from running our engine (and ideally
Golly), not from the source page. Leave placeholders explicit until measured.

## Report

List patterns touched, their measured characteristics, transforms verified,
fixture paths, provenance status, and anything still `unverified` or
`license_review: pending`.
