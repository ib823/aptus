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
    parts = [p.strip() for p in FIORI_DELIM.split(s)]
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
                "activity": str(activity).strip(),
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
    print(f"wrote {OUT_PATH}")
    print("counts:", json.dumps(out["meta"]["counts"], indent=2))


if __name__ == "__main__":
    main()
