"""Extract the value-stream affirm-set dataset from the four input
spreadsheets and produce a single canonical JSON document used by the
prisma seed.

This script is intentionally idempotent and read-only against the xlsx
files. Run from the repo root:

    python3 scripts/extract-value-stream-data.py

Outputs prisma/seeds/value-stream/dataset.json.

Counts (validated): 8 value streams + Foundation, 55 sub-processes,
672 scope items, 150 L2 affirm questions (122 suggested + 13 flagged
+ 15 excluded), 63 curation-review placements (48 cross-stream + 15
industry-judgment).
"""

from __future__ import annotations

import json
import os
import re
from collections import OrderedDict
from typing import Iterable, List, Optional

import openpyxl

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "prisma", "seeds", "value-stream")
OUT_FILE = os.path.join(OUT_DIR, "dataset.json")


def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def load_sheet(path: str, sheet: str) -> list[tuple]:
    wb = openpyxl.load_workbook(os.path.join(REPO_ROOT, path), data_only=True, read_only=True)
    rows = list(wb[sheet].iter_rows(values_only=True))
    wb.close()
    return rows


def find_header_row(rows: Iterable[tuple]) -> int:
    for i, r in enumerate(rows):
        if r and r[0] == "#":
            return i
    raise RuntimeError("could not locate header row")


def data_rows(rows: list[tuple]) -> list[tuple]:
    hdr = find_header_row(rows)
    return [r for r in rows[hdr + 1 :] if r and r[0] is not None]


def split_scope_refs(raw) -> List[str]:
    if raw is None:
        return []
    s = str(raw).strip()
    if not s or s in {"-", "N/A", "n/a"}:
        return []
    return [p.strip() for p in re.split(r"[,/;]", s) if p.strip() and p.strip() != "-"]


def parse_area_topic(raw) -> tuple[Optional[str], Optional[str]]:
    if not raw:
        return (None, None)
    s = str(raw)
    if "/" in s:
        a, _, t = s.partition("/")
        return (a.strip() or None, t.strip() or None)
    return (s.strip() or None, None)


# ─── Status / flag classification ────────────────────────────────────────────
EXCLUDED_STATUS_FRAGMENTS = (
    "no question in sap source",
    "no usable question in sap source",
    "exclude from the affirm-set",
)
FLAGGED_STATUS_FRAGMENTS = (
    "how-to / config-design",
    "configuration setup step",
    "configuration instruction",
    "country-specific localization",
)


def classify_status(raw_status, verbatim) -> tuple[str, Optional[str]]:
    """Return (status, flag_note). status ∈ {suggested, confirmed, excluded}."""
    s = (raw_status or "").lower()
    v = (verbatim or "").strip().lower()
    if any(f in s for f in EXCLUDED_STATUS_FRAGMENTS) or v == "not applicable":
        return ("excluded", "no-question-source")
    if any(f in s for f in FLAGGED_STATUS_FRAGMENTS):
        return ("suggested", "config-how-to")
    # everything else is the consultant-confirm pending state
    return ("suggested", None)


def build() -> dict:
    # ─── Layer 1: Full Hierarchy = source of truth for the 672 tree ──────
    l1 = data_rows(load_sheet("Layer1-Value-Stream-Hierarchy.xlsx", "Full Hierarchy"))
    streams: OrderedDict[str, dict] = OrderedDict()
    sub_processes: OrderedDict[str, dict] = OrderedDict()
    scope_items: list[dict] = []

    for r in l1:
        _, stream_name, sub_name, scope_id, desc, bdc, area = r[:7]
        stream_id = slugify(stream_name)
        sub_id = f"{stream_id}::{slugify(sub_name)}"
        if stream_id not in streams:
            streams[stream_id] = {
                "id": stream_id,
                "name": stream_name,
                "isFoundation": stream_name.lower().startswith("foundation"),
                "displayOrder": len(streams),
            }
        if sub_id not in sub_processes:
            sub_processes[sub_id] = {
                "id": sub_id,
                "streamId": stream_id,
                "name": sub_name,
                "type": "functional",
                "displayOrder": sum(1 for s in sub_processes.values() if s["streamId"] == stream_id),
            }
        scope_items.append(
            {
                "id": str(scope_id),
                "subProcessId": sub_id,
                "streamId": stream_id,
                "description": desc,
                "sapBusinessArea": area,
                "hasBdcCoverage": (bdc or "").strip().lower() == "yes",
                "placementReviewFlag": None,  # filled below
            }
        )

    # ─── Layer 0: Curation Review ────────────────────────────────────────
    cur_rows_all = load_sheet("Layer0-Value-Stream-Structure.xlsx", "Curation Review")
    curation: list[dict] = []
    section: Optional[str] = None
    # We have to walk the sheet manually because Section A / Section B headers
    # are inline rather than columns.
    for r in cur_rows_all:
        if not r:
            continue
        c0 = r[0]
        if isinstance(c0, str):
            if "SECTION A" in c0.upper():
                section = "A-cross-stream"
                continue
            if "SECTION B" in c0.upper():
                section = "B-industry-judgment"
                continue
            if c0.strip() == "#":  # header row inside section
                continue
        if c0 is None or not isinstance(c0, int):
            continue
        _, scope_id, desc, context, initial, recommended, rationale, decision = r[:8]
        flag = "pending-curation"
        curation.append(
            {
                "section": section,
                "scopeId": str(scope_id),
                "description": desc,
                "context": context,
                "initialPlacement": initial,
                "recommendedPlacement": recommended,
                "rationale": rationale,
                "consultantDecision": decision,
            }
        )

    # Stamp the placementReviewFlag on the matching scope items
    cur_by_id = {c["scopeId"]: c for c in curation}
    for s in scope_items:
        if s["id"] in cur_by_id:
            s["placementReviewFlag"] = "pending-curation"

    # ─── Layer 2: SAP-verbatim L2 questions ──────────────────────────────
    # Some L2 rows are tagged with a placeholder sub-process name like
    # "(general - by questionnaire)" that has no row in the L1 hierarchy.
    # These are real L2 questions that the source questionnaire grouped
    # generically rather than by a specific sub-process. We synthesize a
    # "catch-all" sub-process for each such (stream, sub_name) pair so the
    # FK to AffirmSubProcess holds.
    l2 = data_rows(load_sheet("Layer2-BDC-Affirm-Set.xlsx", "L2 Affirm-Set"))
    l2_by_idx: dict[int, dict] = {}
    questions: list[dict] = []
    for r in l2:
        num, stream_name, sub_name, scope_raw, verbatim, area_topic, sscui, source, basis = r[:9]
        stream_id = slugify(stream_name)
        sub_id = f"{stream_id}::{slugify(sub_name)}"
        if sub_id not in sub_processes:
            sub_processes[sub_id] = {
                "id": sub_id,
                "streamId": stream_id,
                "name": sub_name,
                "type": "catch-all",
                "displayOrder": sum(
                    1 for s in sub_processes.values() if s["streamId"] == stream_id
                ),
            }
        sap_area, sap_topic = parse_area_topic(area_topic)
        q = {
            "id": f"L2-{int(num):03d}",
            "streamId": stream_id,
            "subProcessId": sub_id,
            "scopeItemRefs": split_scope_refs(scope_raw),
            "sapVerbatim": verbatim,
            "plainLanguageSuggested": None,  # filled by plain-language join
            "consultantWording": None,
            "sapArea": sap_area,
            "sapTopic": sap_topic,
            "sscuiRef": (sscui or "").strip() if sscui else None,
            "sourceQuestionnaire": source,
            "placementBasis": basis,
            "status": "suggested",
            "flag": None,
            "displayOrder": int(num),
        }
        l2_by_idx[int(num)] = q
        questions.append(q)

    # ─── Plain-Language join — one sheet per stream, in workbook order ───
    plain_lang_sheets = [
        "Idea to Market",
        "Source to Pay",
        "Plan to Fulfill",
        "Lead to Cash",
        "Acquire to Decommission",
        "Recruit to Retire",
        "Finance",
    ]
    # We must join by stream + within-stream order. The L2 sheet is sorted by
    # stream then sub-process, and each plain-language sheet enumerates the
    # questions for one stream in the same order, so an index-aligned join
    # within each stream is exact.
    per_stream_l2: dict[str, list[dict]] = {}
    for q in questions:
        per_stream_l2.setdefault(q["streamId"], []).append(q)

    for sheet_name in plain_lang_sheets:
        rows = load_sheet("BDC-Affirm-Set-Plain-Language.xlsx", sheet_name)
        data = data_rows(rows)
        stream_id = slugify(sheet_name)
        bucket = per_stream_l2.get(stream_id, [])
        if len(bucket) != len(data):
            raise RuntimeError(
                f"row mismatch for stream {sheet_name}: L2 has {len(bucket)}, plain-language has {len(data)}"
            )
        for q, r in zip(bucket, data):
            _, _sub, _scope, _verbatim, suggested, final_wording, status_raw, _area, _sscui, _source = r[:10]
            status, flag = classify_status(status_raw, q["sapVerbatim"])
            q["plainLanguageSuggested"] = suggested
            q["consultantWording"] = final_wording
            q["status"] = status
            q["flag"] = flag
            q["statusNote"] = status_raw

    # ─── Sanity checks ──────────────────────────────────────────────────
    assert len(streams) == 8, f"expected 8 streams (incl. Foundation), got {len(streams)}"
    # 55 L1 sub-processes + N catch-all sub-processes synthesized from L2
    # questions that the source questionnaire grouped generically (e.g.
    # "(general - by questionnaire)" in the Finance stream).
    assert len(sub_processes) >= 55, f"expected at least 55 sub-processes, got {len(sub_processes)}"
    assert len(scope_items) == 672, f"expected 672 scope items, got {len(scope_items)}"
    assert len(questions) == 150, f"expected 150 L2 questions, got {len(questions)}"
    excluded = sum(1 for q in questions if q["status"] == "excluded")
    flagged = sum(1 for q in questions if q["flag"] == "config-how-to")
    assert excluded == 15, f"expected 15 excluded, got {excluded}"
    assert flagged == 13, f"expected 13 flagged, got {flagged}"
    assert len(curation) == 63, f"expected 63 curation rows, got {len(curation)}"

    return {
        "meta": {
            "sapRelease": "S/4HANA Cloud Public Edition 2602",
            "counts": {
                "streams": len(streams),
                "subProcesses": len(sub_processes),
                "scopeItems": len(scope_items),
                "questions": len(questions),
                "questionsExcluded": excluded,
                "questionsFlaggedConfigHowTo": flagged,
                "curationReview": len(curation),
            },
        },
        "valueStreams": list(streams.values()),
        "subProcesses": list(sub_processes.values()),
        "scopeItems": scope_items,
        "questions": questions,
        "curationReview": curation,
    }


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    data = build()
    with open(OUT_FILE, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    print(f"wrote {OUT_FILE}")
    print("counts:", json.dumps(data["meta"]["counts"], indent=2))


if __name__ == "__main__":
    main()
