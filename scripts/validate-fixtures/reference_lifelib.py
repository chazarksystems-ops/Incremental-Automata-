#!/usr/bin/env python3
"""
Independent reference for core fixtures, using python-lifelib (Adam P. Goucher,
MIT) — a separate, mature B3/S23 implementation that shares no code with ours.

For each tests/fixtures/core/*.json spec, builds the initial board from the
listed RLE placements *with lifelib's own RLE parser*, evolves it on lifelib's
infinite plane while clipping to the board rectangle after every generation
(exactly equivalent to a fixed dead boundary), and records population +
canonical hash at each checkpoint.

Hash format must match src/core/hash.ts:
  sha256( b"IA1:<w>x<h>@<gen>\\n" + bytes(row-major 0/1 cells) )

Usage (needs `pip install python-lifelib==2.5.6` and a C++ compiler):
  python3 scripts/validate-fixtures/reference_lifelib.py --check   # verify committed expectations
  python3 scripts/validate-fixtures/reference_lifelib.py --write   # (re)generate expectations
"""
import argparse
import hashlib
import json
import pathlib
import sys

import lifelib

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPECS = ROOT / "tests" / "fixtures" / "core"


def board_hash(cells, w, h, gen):
    buf = bytearray(w * h)
    for x, y in cells:
        buf[y * w + x] = 1
    header = f"IA1:{w}x{h}@{gen}\n".encode("ascii")
    return hashlib.sha256(header + bytes(buf)).hexdigest()


def rect(lt, w, h):
    return lt.pattern(f"x = {w}, y = {h}, rule = B3/S23\n" + f"{w}o$" * (h - 1) + f"{w}o!")


def initial_pattern(lt, spec):
    p = lt.pattern("", "b3s23")
    for item in spec["initial"]:
        text = item["rle"] if "rle" in item else (ROOT / item["file"]).read_text()
        # lifelib parses the RLE itself (independent of our parser).
        p += lt.pattern(text)(item["x"], item["y"])
    return p


def evaluate(lt, spec):
    w, h = spec["board"]["width"], spec["board"]["height"]
    box = rect(lt, w, h)
    p = initial_pattern(lt, spec)
    if (p & box) != p:
        raise ValueError(f"{spec['id']}: initial placement exceeds board")
    out = {}
    gen = 0
    for target in sorted(spec["checkpoints"]):
        while gen < target:
            p = p[1] & box
            gen += 1
        coords = [] if p.population == 0 else [tuple(int(v) for v in c) for c in p.coords()]
        out[str(target)] = {"population": int(p.population), "hash": board_hash(coords, w, h, gen)}
    return out


def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = ap.parse_args()

    sess = lifelib.load_rules("b3s23")
    lt = sess.lifetree(memory=1000)
    failures = 0
    for path in sorted(SPECS.glob("*.json")):
        spec = json.loads(path.read_text())
        got = evaluate(lt, spec)
        if args.write:
            spec["expected"] = got
            spec["reference"] = {
                "tool": "python-lifelib 2.5.6",
                "method": "infinite plane, clipped to the board rectangle after every generation",
            }
            path.write_text(json.dumps(spec, indent=2) + "\n")
            print(f"wrote {path.name}")
        else:
            exp = spec.get("expected", {})
            bad = [g for g in got if exp.get(g) != got[g]]
            failures += bool(bad)
            print(f"{'FAIL' if bad else 'ok  '} {path.name}" + (f" (checkpoints {bad})" if bad else ""))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
