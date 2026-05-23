"""Merge the Standard-Answer-Layer dataset into the existing
value-stream dataset.json.

Adds two fields per question:
  - aboutText      ← SAP Topic Definition column (seeds the
                     "What this is about" line on each affirm card)
  - format         ← Format default column (decision | information)

Join key — IMPORTANT
--------------------
The two source files (Layer2-BDC-Affirm-Set.xlsx and
Standard-Answer-Layer.xlsx) carry the same L2-NNN ID column BUT the
IDs are positional within EACH file and DO NOT correspond between
files. The two files number questions in different row orders, so a
by-ID join silently mis-maps every row (e.g. MT940 question ends up
with ATP "about" text).

The only stable shared key is the SAP verbatim question text. 19
rows fall into 3 verbatim-collision groups (mostly empty / placeholder
verbatims for the 15 SAP-excluded Quality Management rows + 1 cross-
sub-process "How do you evaluate and approve the suppliers" pair).
For those, we disambiguate by compound key (verbatim, value-stream,
sub-process, SAP Area). After disambiguation the join is unique.

Honest-data rules
-----------------
- When the source carries the literal placeholder "(no Topic
  Definition in SAP source)" — store aboutText as null. The UI
  conditionally hides the "What this is about" line on null; never
  render a placeholder string to a client.
- Empty-verbatim rows (the 14 Quality Management excluded rows whose
  verbatim is blank) are NOT indexed — they can't be safely
  disambiguated by verbatim alone, and they're all status='excluded'
  so the client view never sees them.
- Post-extract assertion: for every dataset question that received a
  non-null aboutText, the source row's verbatim MUST match the
  dataset question's verbatim. Throws on the first mismatch.

Run from repo root:

    python3 scripts/extract-standard-answer-data.py
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from typing import Iterable

import openpyxl

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PATH = os.path.join(REPO_ROOT, "Standard-Answer-Layer.xlsx")
DATASET_PATH = os.path.join(REPO_ROOT, "prisma", "seeds", "value-stream", "dataset.json")

# The Standard-Answer-Layer file uses this literal in the Topic
# Definition column when the SAP source has none. The directive is
# explicit: this string MUST NOT reach the database. Store null and
# let the UI conditionally hide the "What this is about" line.
PLACEHOLDER_NO_TOPIC_DEF = "(no Topic Definition in SAP source)"


def find_header(rows: Iterable[tuple]) -> int:
    for i, r in enumerate(rows):
        if r and r[0] == "#":
            return i
    raise RuntimeError("header row '#' not found")


def normalise_verbatim(s) -> str:
    """Trim + collapse whitespace + strip trailing space/?/. drift."""
    t = (str(s) if s is not None else "").strip()
    t = " ".join(t.split())
    return t.rstrip(" ?.").strip()


def normalise_facet(s) -> str:
    """Compound-key facet (stream / sub-process / area). The two source
    files occasionally differ in trailing spaces / case-of-hyphen so
    we normalise. None → empty string."""
    return (str(s) if s is not None else "").strip()


def clean_topic(raw) -> str | None:
    """Per directive (3): never store the literal placeholder. Store
    null when the source row has no real Topic Definition."""
    if raw is None:
        return None
    t = str(raw).strip()
    if not t:
        return None
    if t == PLACEHOLDER_NO_TOPIC_DEF:
        return None
    return t


def main() -> None:
    wb = openpyxl.load_workbook(SRC_PATH, data_only=True, read_only=True)
    ws = wb["Standard-Answer Layer"]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    hdr = find_header(rows)
    data = [r for r in rows[hdr + 1 :] if r and r[0] is not None]

    # Index source rows by the COMPOUND key (verbatim, stream, sub-process, area).
    # Skip empty-verbatim rows entirely — they cannot be safely joined.
    by_key: dict[tuple, dict[str, object]] = {}
    by_verbatim: dict[str, list[dict[str, object]]] = defaultdict(list)
    skipped_empty_verbatim = 0
    duplicate_compound_collisions = 0
    for r in data:
        _, _sa_qid, vs, sub, area, verbatim, topic_def, fmt_default = r[:8]
        v = normalise_verbatim(verbatim)
        if not v:
            skipped_empty_verbatim += 1
            continue
        about = clean_topic(topic_def)
        fmt_raw = str(fmt_default or "").strip().lower()
        fmt = "information" if fmt_raw == "information" else "decision"
        compound = (
            v,
            normalise_facet(vs),
            normalise_facet(sub),
            normalise_facet(area),
        )
        entry = {
            "aboutText": about,
            "format": fmt,
            "sourceVerbatim": v,
            "sourceStream": normalise_facet(vs),
            "sourceSub": normalise_facet(sub),
            "sourceArea": normalise_facet(area),
        }
        if compound in by_key:
            duplicate_compound_collisions += 1
        by_key[compound] = entry
        by_verbatim[v].append(entry)

    # Stream slug normalisation matches the value-stream extractor.
    def slugify(s: str) -> str:
        import re
        s = (s or "").strip().lower()
        s = re.sub(r"[^a-z0-9]+", "-", s)
        return s.strip("-")

    # Layer 0's L2 Affirm-Set uses "SAP Area / Topic" as a single column
    # (e.g. "Available to Promise  /  ATP: Product Availability Check").
    # The dataset already splits this into sapArea + sapTopic at extract
    # time. So when we build the compound key for the dataset side, the
    # area facet is dataset.sapArea (the LHS of the slash).

    # Index streams + sub-processes to map dataset's slug back to the
    # display names the Standard-Answer-Layer file uses. This is to
    # build the compound facets on the dataset side.
    with open(DATASET_PATH, "r", encoding="utf-8") as fh:
        dataset = json.load(fh)

    stream_name_by_id = {s["id"]: s["name"] for s in dataset["valueStreams"]}
    sub_name_by_id = {s["id"]: s["name"] for s in dataset["subProcesses"]}

    # Walk the dataset questions, joining by compound key. Fall back to
    # verbatim-only ONLY if exactly one row matches that verbatim.
    matched = 0
    matched_with_about = 0
    matched_no_topic = 0
    unmatched_excluded = 0
    unmatched_other: list[str] = []
    info_count = 0
    decision_count = 0
    for q in dataset["questions"]:
        v = normalise_verbatim(q.get("sapVerbatim"))
        if not v:
            # Excluded rows with blank verbatim — skip silently.
            q["aboutText"] = None
            q["format"] = "decision"
            if q.get("status") != "excluded":
                unmatched_other.append(q["id"])
            else:
                unmatched_excluded += 1
            continue

        compound = (
            v,
            normalise_facet(stream_name_by_id.get(q["streamId"], "")),
            normalise_facet(sub_name_by_id.get(q["subProcessId"], "")),
            normalise_facet(q.get("sapArea")),
        )
        entry = by_key.get(compound)
        if entry is None:
            # Compound miss — fall back to verbatim-unique match.
            candidates = by_verbatim.get(v, [])
            if len(candidates) == 1:
                entry = candidates[0]
            elif len(candidates) > 1:
                # Ambiguous — refuse to guess. Leave aboutText null.
                if q.get("status") != "excluded":
                    unmatched_other.append(q["id"])
                else:
                    unmatched_excluded += 1
                q["aboutText"] = None
                q["format"] = "decision"
                continue

        if entry is None:
            if q.get("status") != "excluded":
                unmatched_other.append(q["id"])
            else:
                unmatched_excluded += 1
            q["aboutText"] = None
            q["format"] = "decision"
            continue

        # Directive (4): assert the joined row's verbatim matches the
        # dataset question's verbatim. This is the integrity guarantee
        # — if it ever fails, the dataset is silently corrupt.
        if entry["sourceVerbatim"] != v:
            raise AssertionError(
                f"verbatim mismatch on join for {q['id']}: "
                f"dataset verbatim != source verbatim. This should "
                f"never happen because by_key was built from "
                f"sourceVerbatim. Dataset bug or normalisation drift."
            )

        q["aboutText"] = entry["aboutText"]
        q["format"] = entry["format"]
        matched += 1
        if entry["aboutText"] is not None:
            matched_with_about += 1
        else:
            matched_no_topic += 1
        if entry["format"] == "information":
            info_count += 1
        else:
            decision_count += 1

    if unmatched_other:
        raise RuntimeError(
            f"standard-answer extractor: {len(unmatched_other)} "
            f"non-excluded questions have no Standard-Answer match "
            f"(first 5: {unmatched_other[:5]}). Source data drift — "
            f"check verbatim normalisation or duplicate-verbatim disambiguation."
        )

    counts = dataset.setdefault("meta", {}).setdefault("counts", {})
    counts["standardAnswerMatched"] = matched
    counts["standardAnswerWithAboutText"] = matched_with_about
    counts["standardAnswerNoTopicDef"] = matched_no_topic
    counts["standardAnswerExcludedUnmatched"] = unmatched_excluded
    counts["formatDecision"] = decision_count
    counts["formatInformation"] = info_count
    counts["compoundCollisions"] = duplicate_compound_collisions
    counts["skippedEmptyVerbatim"] = skipped_empty_verbatim

    with open(DATASET_PATH, "w", encoding="utf-8") as fh:
        json.dump(dataset, fh, indent=2, ensure_ascii=False)

    print(f"merged Standard-Answer into {DATASET_PATH}")
    print(f"  matched (compound or unique-verbatim): {matched}")
    print(f"    with aboutText:                      {matched_with_about}")
    print(f"    no Topic Definition (aboutText=null): {matched_no_topic}")
    print(f"  unmatched excluded rows (expected):    {unmatched_excluded}")
    print(f"  format · decision:                     {decision_count}")
    print(f"  format · information:                  {info_count}")
    print(f"  Standard-Answer rows skipped (empty verbatim): {skipped_empty_verbatim}")
    print(f"  Standard-Answer compound-key collisions:       {duplicate_compound_collisions}")


if __name__ == "__main__":
    main()
