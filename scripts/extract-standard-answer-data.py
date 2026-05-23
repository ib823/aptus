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


def normalise_verbatim(s) -> str:
    """Join key for matching. The two source files share the SAP
    verbatim text but use the L2-NNN row IDs in DIFFERENT row orders,
    so we cannot join by ID. Verbatim text is the stable key.
    Normalisation: trim, collapse internal whitespace, strip trailing
    punctuation drift (the source occasionally has `?` vs `? ` etc.).
    """
    t = (str(s) if s is not None else "").strip()
    t = " ".join(t.split())  # collapse whitespace runs
    return t.rstrip(" ?.").strip()


def main() -> None:
    wb = openpyxl.load_workbook(SRC_PATH, data_only=True, read_only=True)
    ws = wb["Standard-Answer Layer"]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    hdr = find_header(rows)
    data = [r for r in rows[hdr + 1 :] if r and r[0] is not None]

    # Key: normalised SAP verbatim. The Standard-Answer-Layer's L2-NNN
    # IDs are positional in that file and do NOT correspond to the L2
    # Affirm-Set's L2-NNN IDs. Verbatim text is the only stable key.
    by_verbatim: dict[str, dict[str, object]] = {}
    collisions = 0
    for r in data:
        _, _sa_qid, _vs, _sub, _area, verbatim, topic_def, fmt_default = r[:8]
        key = normalise_verbatim(verbatim)
        if not key:
            continue
        about = (str(topic_def).strip() if topic_def else "") or None
        fmt_raw = str(fmt_default or "").strip().lower()
        fmt = "information" if fmt_raw == "information" else "decision"
        if key in by_verbatim:
            collisions += 1
        by_verbatim[key] = {"aboutText": about, "format": fmt}

    with open(DATASET_PATH, "r", encoding="utf-8") as fh:
        dataset = json.load(fh)

    matched = 0
    unmatched: list[str] = []
    decision_count = 0
    information_count = 0
    about_blank = 0
    for q in dataset["questions"]:
        key = normalise_verbatim(q.get("sapVerbatim"))
        info = by_verbatim.get(key) if key else None
        if not info:
            # Excluded rows often have blank / "Not Applicable" verbatim;
            # they won't (and shouldn't) match. Default and move on.
            q["aboutText"] = None
            q["format"] = "decision"
            if q.get("status") != "excluded":
                unmatched.append(q["id"])
            continue
        matched += 1
        q["aboutText"] = info["aboutText"]
        q["format"] = info["format"]
        if info["format"] == "information":
            information_count += 1
        else:
            decision_count += 1
        if info["aboutText"] is None:
            about_blank += 1

    if unmatched:
        raise RuntimeError(
            f"standard-answer extractor: {len(unmatched)} non-excluded questions "
            f"have no verbatim match in Standard-Answer-Layer "
            f"(first 5: {unmatched[:5]})"
        )

    counts = dataset.setdefault("meta", {}).setdefault("counts", {})
    counts["formatDecision"] = decision_count
    counts["formatInformation"] = information_count
    counts["aboutTextBlank"] = about_blank
    counts["standardAnswerMatched"] = matched
    counts["standardAnswerVerbatimCollisions"] = collisions

    with open(DATASET_PATH, "w", encoding="utf-8") as fh:
        json.dump(dataset, fh, indent=2, ensure_ascii=False)

    print(f"merged Standard-Answer into {DATASET_PATH} (by verbatim match)")
    print(f"  matched: {matched} of {len(dataset['questions'])}")
    print(f"  format · decision: {decision_count}")
    print(f"  format · information: {information_count}")
    print(f"  aboutText blanks: {about_blank}")
    print(f"  verbatim collisions in standard-answer source: {collisions}")


if __name__ == "__main__":
    main()
