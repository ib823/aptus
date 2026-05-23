"""Merge the Standard-Answer-Layer dataset into the existing
value-stream dataset.json.

Adds two fields per question:
  - aboutText      ← SAP Topic Definition column (seeds the
                     "What this is about" line on each affirm card)
  - format         ← Format default column (decision | information)

Both columns are confirmed populated for all 150 questions in the
current file. The README warned that 16 questions could be blank in
aboutText; the actual data shows 0 blanks. The extractor stays
tolerant — blank Topic Definition → aboutText=null, never invented.

Run from repo root:

    python3 scripts/extract-standard-answer-data.py
"""

from __future__ import annotations

import json
import os
from typing import Iterable

import openpyxl

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PATH = os.path.join(REPO_ROOT, "Standard-Answer-Layer.xlsx")
DATASET_PATH = os.path.join(REPO_ROOT, "prisma", "seeds", "value-stream", "dataset.json")


def find_header(rows: Iterable[tuple]) -> int:
    for i, r in enumerate(rows):
        if r and r[0] == "#":
            return i
    raise RuntimeError("header row '#' not found")


def main() -> None:
    wb = openpyxl.load_workbook(SRC_PATH, data_only=True, read_only=True)
    ws = wb["Standard-Answer Layer"]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    hdr = find_header(rows)
    data = [r for r in rows[hdr + 1 :] if r and r[0] is not None]

    by_id: dict[str, dict[str, object]] = {}
    for r in data:
        _, qid, _vs, _sub, _area, _verbatim, topic_def, fmt_default = r[:8]
        about = (str(topic_def).strip() if topic_def else "") or None
        fmt_raw = str(fmt_default or "").strip().lower()
        fmt = "information" if fmt_raw == "information" else "decision"
        by_id[str(qid)] = {"aboutText": about, "format": fmt}

    with open(DATASET_PATH, "r", encoding="utf-8") as fh:
        dataset = json.load(fh)

    missing = []
    decision_count = 0
    information_count = 0
    about_blank = 0
    for q in dataset["questions"]:
        info = by_id.get(q["id"])
        if not info:
            missing.append(q["id"])
            q["aboutText"] = None
            q["format"] = "decision"
            continue
        q["aboutText"] = info["aboutText"]
        q["format"] = info["format"]
        if info["format"] == "information":
            information_count += 1
        else:
            decision_count += 1
        if info["aboutText"] is None:
            about_blank += 1

    if missing:
        raise RuntimeError(
            f"standard-answer extractor: {len(missing)} questions in dataset have "
            f"no Standard-Answer row (first 5: {missing[:5]})"
        )

    counts = dataset.setdefault("meta", {}).setdefault("counts", {})
    counts["formatDecision"] = decision_count
    counts["formatInformation"] = information_count
    counts["aboutTextBlank"] = about_blank

    with open(DATASET_PATH, "w", encoding="utf-8") as fh:
        json.dump(dataset, fh, indent=2, ensure_ascii=False)

    print(f"merged Standard-Answer into {DATASET_PATH}")
    print("  format · decision:", decision_count)
    print("  format · information:", information_count)
    print("  aboutText blanks:", about_blank)


if __name__ == "__main__":
    main()
