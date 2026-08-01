"""Extract the Malaysia-mandatory process-flow dataset from
Layer3-Process-Flow.xlsx and write JSON for the prisma seeder.

Run from repo root:

    python3 scripts/extract-process-flow-data.py

Outputs prisma/seeds/value-stream/process-flow.json with:
  {
    meta: { counts: { flows, steps, totalScopeItems, withoutFlow } },
    flows: [{ scopeItemId, activityCount, myStepCount, optionalCount }, ...],
    steps: [{ scopeItemId, stepNumber, activity, fioriApps[] }, ...],
  }

Source semantics (per the file's own README):
  - Sheet 1 "Process-Flow Map" — per-item summary (655 rows).
  - Sheet 2 "Mandatory MY Flow" — per-step rows (~2502 rows). This
    is what the workbench renders.
  - Sheet 3 "Full Activity List" — raw 21,835 rows for drill-down.
    Not seeded today; future v2.x feature.

Activity names are SAP-verbatim. Fiori app cells use "  /  " (with
both surrounding spaces) as the multi-app delimiter; "-" means none.

Counts asserted at extract time:
  - 655 flows (the 17 scope items with no MY-mandatory steps are
    intentionally absent).
  - 2502 step rows total (~3.8 avg per flow).
  - 0 scope-id orphans (every flow.scopeItemId exists in the
    value-stream dataset).
"""

from __future__ import annotations

import json
import os
import re
from typing import Iterable

import openpyxl

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PATH = os.path.join(REPO_ROOT, "Layer3-Process-Flow.xlsx")
DATASET_PATH = os.path.join(REPO_ROOT, "prisma", "seeds", "value-stream", "dataset.json")
OUT_PATH = os.path.join(REPO_ROOT, "prisma", "seeds", "value-stream", "process-flow.json")

# Multi-Fiori-app delimiter. The source uses two spaces, a slash, and
# two spaces. Plain "/" appears inside app names ("Manage Form Templates
# - Global Trade / Foreign Trade"), so this exact sequence is the only
# safe split point.
FIORI_DELIM = re.compile(r"\s{2,}/\s{2,}")
FIORI_NONE = {"-", "", None}

# ── Mojibake repair ──────────────────────────────────────────────────
# Some activity names arrive already mangled IN THE WORKBOOK: UTF-8 bytes
# that were decoded as CP1252 somewhere upstream of this repo. The J60
# Accounts Payable sheet carried "Report Generic Withholding Tax -
#马来西亚" as "...- é©¬æ¥è¥¿äºš", and it rendered that way on the
# client-facing affirm page.
#
# openpyxl reads XLSX correctly, so there is nothing to fix in how we read
# the file — the damage predates it. Repairing here rather than in the JSON
# is the difference between a fix and a fix that survives: the next person
# to re-run this extractor would otherwise silently reintroduce it.
#
# CP1252, not Latin-1: byte 0x9A surfaces as U+0161 and 0x80 as U+20AC,
# which a Latin-1 round-trip cannot undo.
CP1252_HIGH = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
    0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
    0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
    0x017E: 0x9E, 0x0178: 0x9F,
}
_MOJIBAKE_RUN = re.compile(
    "[-ÿ" + "".join(chr(c) for c in CP1252_HIGH) + "]+"
)
# Every repair made, for the run report. Silent data rewriting is worse than
# the mojibake — the operator has to be able to see what changed.
REPAIRS: dict[str, str] = {}


def _repair_run(run: str) -> str:
    raw = bytearray()
    for ch in run:
        cp = ord(ch)
        b = CP1252_HIGH.get(cp, cp if cp < 0x100 else None)
        if b is None:
            return run
        raw.append(b)

    out: list[str] = []
    i = 0
    changed = False
    while i < len(raw):
        # Only 2-4 byte sequences are interesting. A lone high byte is almost
        # certainly legitimate Western text (an accented Fiori app name), and
        # rewriting it would be the bug this function exists to avoid.
        for width in (4, 3, 2):
            if i + width > len(raw):
                continue
            try:
                out.append(raw[i : i + width].decode("utf-8"))
            except UnicodeDecodeError:
                continue
            i += width
            changed = True
            break
        else:
            out.append(run[i])
            i += 1
    return "".join(out) if changed else run


def demojibake(text: str) -> str:
    """Repair UTF-8-read-as-CP1252 damage, recording anything changed."""
    fixed = _MOJIBAKE_RUN.sub(lambda m: _repair_run(m.group(0)), text)
    if fixed != text:
        REPAIRS[text] = fixed
    return fixed


def find_header(rows: Iterable[tuple]) -> int:
    for i, r in enumerate(rows):
        if r and r[0] == "#":
            return i
    raise RuntimeError("header row '#' not found")


def parse_fiori(cell) -> list[str]:
    if cell in FIORI_NONE:
        return []
    s = str(cell).strip()
    if s in FIORI_NONE:
        return []
    parts = [demojibake(p.strip()) for p in FIORI_DELIM.split(s)]
    return [p for p in parts if p]


def load(sheet: str) -> list[tuple]:
    wb = openpyxl.load_workbook(SRC_PATH, data_only=True, read_only=True)
    rows = list(wb[sheet].iter_rows(values_only=True))
    wb.close()
    hdr = find_header(rows)
    return [r for r in rows[hdr + 1 :] if r and r[0] is not None]


def main() -> None:
    # ── Sheet 1: per-item summary ────────────────────────────────────
    summary_rows = load("Process-Flow Map")
    flows: list[dict] = []
    for r in summary_rows:
        _, scope_id, _description, _value_stream, _sub_process, activity_count, my_steps, optional, _flow_string = r[:9]
        flows.append(
            {
                "scopeItemId": str(scope_id),
                "activityCount": int(activity_count or 0),
                "myStepCount": int(my_steps or 0),
                "optionalCount": int(optional or 0),
            }
        )

    # ── Sheet 2: per-step rows ───────────────────────────────────────
    step_rows = load("Mandatory MY Flow")
    steps: list[dict] = []
    for r in step_rows:
        _, scope_id, step_no, activity, fiori = r[:5]
        steps.append(
            {
                "scopeItemId": str(scope_id),
                "stepNumber": int(step_no),
                "activity": demojibake(str(activity).strip()),
                "fioriApps": parse_fiori(fiori),
            }
        )

    # ── Cross-validation against the value-stream dataset ────────────
    with open(DATASET_PATH, "r", encoding="utf-8") as fh:
        dataset = json.load(fh)
    si_set = {s["id"] for s in dataset["scopeItems"]}
    orphans = sorted({f["scopeItemId"] for f in flows} - si_set)
    if orphans:
        raise RuntimeError(
            f"process-flow extractor: {len(orphans)} flow scope-id(s) missing "
            f"from value-stream dataset (first 5: {orphans[:5]})"
        )

    # ── Sanity checks ────────────────────────────────────────────────
    assert len(flows) == 655, f"expected 655 flows, got {len(flows)}"
    assert len(steps) == 2502, f"expected 2502 steps, got {len(steps)}"

    out = {
        "meta": {
            "country": "MY",
            "sapRelease": "2602",
            "counts": {
                "flows": len(flows),
                "steps": len(steps),
                "totalScopeItems": len(si_set),
                "withoutFlow": len(si_set) - len(flows),
            },
        },
        "flows": flows,
        "steps": steps,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=False)
    if REPAIRS:
        print(f"repaired {len(REPAIRS)} mojibake string(s):")
        for bad, good in REPAIRS.items():
            print(f"  {bad!r} -> {good!r}")
    print(f"wrote {OUT_PATH}")
    print("counts:", json.dumps(out["meta"]["counts"], indent=2))


if __name__ == "__main__":
    main()
