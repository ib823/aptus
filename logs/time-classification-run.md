# TIME RFT Classification Run — Audit Trail

**Date:** 2026-05-03
**Customer:** T.I.M.E. dotCom Bhd
**RFT:** 26.069 — S/4HANA License Purchase and System Implementation
**Bidder:** ABeam Consulting (Malaysia) Sdn Bhd
**Aptus Assessment ID:** `cmopnc80z000263fq9zd4cmlw`
**ClassificationPass ID:** `cmopraqub000163wybm1lx5or`
**Protocol:** "TIME bid baseline" v1.0.0 (id: `cmopoadaj000163ctjt2hwu2v`)

---

## Run summary

| Stage | Result |
|---|---|
| Requirements ingested | **830** ClientRequirement rows |
| Customer processes extracted | **227** CustomerProcess rows from App 2(b) (614 pages, sha256 `158eb6d59526...`) |
| Process ↔ Requirement links | **939** (62.3% requirement coverage; tier 1 high=456, tier 2 medium=16, tier 3 low=45) |
| Process ↔ SAP catalog evidence links | **1,474** (avg 6.5 per process; 175 PRIMARY greenfield, 200 PRIMARY brownfield) |
| Prompt batches emitted | **34** files in `logs/time-prompts/cmopnc80z000263fq9zd4cmlw/` |
| Verdicts written | **830** ClassificationVerdict rows (isCurrent=true), **1,540** VerdictScopeItem citations |
| Apply errors | 0 |
| Audit-proof outputs | 3 deliverables, sha256-listed below |

## Verdict distribution

| Bucket | Confidence | Count |
|---|---|--:|
| O - Out Of The Box | high | 13 |
| C - Configuration | high | 170 |
| C - Configuration | medium | 567 |
| G - Gap | low | 72 |
| N/A - Out of Scope | high | 8 |
| **TOTAL** | | **830** |

## Per-module distribution

| Module | Total | O | C | G | N/A |
|---|--:|--:|--:|--:|--:|
| Asset_IMPS | 102 | 0 | 95 | 7 | 0 |
| Consignment | 32 | 0 | 32 | 0 | 0 |
| Finance | 363 | 12 | 336 | 15 | 0 |
| HCM | 29 | 0 | 23 | 6 | 0 |
| IT | 43 | 1 | 39 | 3 | 0 |
| Procurement | 43 | 0 | 37 | 6 | 0 |
| SOW | 189 | 0 | 155 | 34 | 0 |
| Security | 15 | 0 | 14 | 1 | 0 |
| TCO | 8 | 0 | 0 | 0 | 8 |
| Warehouse | 6 | 0 | 6 | 0 | 0 |
| **TOTAL** | **830** | **13** | **737** | **72** | **8** |

## Output deliverables (sha256-verified)

| File | Size | sha256 (first 16) |
|---|--:|---|
| `logs/TIME_App2_Response_2026-05-03T12-41-00.xlsx` | 135,516 B | `3ba5bd6d788fe8b6...` |
| `logs/TIME_App3_BoQ_2026-05-03T12-41-25.xlsx` | 8,967 B | `4af53a15d1f80e11...` |
| `logs/TIME_Bid_Cover_2026-05-03T12-41-28.pdf` | 43,379 B | `af4d0e10fb1eae0f...` |

## App 3 BoQ work-stream summary (heuristic baseline)

| Module | Reqs | O | C | G | Est person-days |
|---|--:|--:|--:|--:|--:|
| SOW | 189 | 0 | 155 | 34 | 480.0 |
| Finance | 363 | 12 | 336 | 15 | 753.0 |
| Asset_IMPS | 102 | 0 | 95 | 7 | 225.0 |
| Procurement | 43 | 0 | 37 | 6 | 104.0 |
| Warehouse | 6 | 0 | 6 | 0 | 12.0 |
| Consignment | 32 | 0 | 32 | 0 | 64.0 |
| HCM | 29 | 0 | 23 | 6 | 76.0 |
| Security | 15 | 0 | 14 | 1 | 33.0 |
| IT | 43 | 1 | 39 | 3 | 93.5 |
| TCO | 8 | 0 | 0 | 0 | 0.0 |
| **TOTAL** | **830** | **13** | **737** | **72** | **1,840.5 pd** |

Add overheads per ABeam delivery norms:
- Project management overhead (+15-20%)
- Integration testing (per major touchpoint)
- Data migration (per SAP Activate Phase 4 deliverables)
- Cutover support (5-15 pd × 6 countries)
- OCM / training (+10-20%)

## Provenance / audit trail

### Catalog evidence sources

| Source | Rows | Provenance |
|---|--:|---|
| Greenfield ScopeItems (PRIVATE 2025-FPS1) | 271 | `ScopeCatalogVersion` row `cmok1lj8p000063xk9ia6b8bw` |
| Brownfield SimplificationItems (May 2026 SIC) | 951 | `BrownfieldCatalogVersion` row `cmop87b9o000063xvqw1pzimu`, sha256 `5abe399d7780...` |
| SimplificationItem narratives (SIMPL_OP2025.pdf) | 757 | sha256 of source PDF in DB |
| SAP Notes referenced | 962 | RelatedSapNote rows |
| PreCheckNotes (umbrella 2502552) | 267 | PreCheckNote rows |
| Always-On Business Functions | 339 | BusinessFunctionDisposition rows |
| SAP APIs (PRIVATE OData v4 canonical) | 424 | SapApiReference rows, fetched 2026-05-03 from api.sap.com via S-User session |
| Conversion Guide PDF (CONV_PE2025) | 1 + 33 sections | sha256 `95b91a1184bd...` |
| BTC / SDT docs (Playwright crawl) | 11 | BrownfieldGuide rows |
| PartnerEdge CEP assets | 21 | BrownfieldGuide rows, fetched 2026-05-03 via PartnerEdge SAML federation |
| SAP Activate methodology | 6 phases + 26 deliverables | derived from CONV_PE2025.pdf chapters |

### Customer-specific evidence

| Source | Rows | Provenance |
|---|--:|---|
| BrownfieldAssessment (TT dotCom EWA) | 1 | from Appendix 2(a) SAP Service Report DOC |
| EwaFinding | 19 | parsed from same |
| App 2(b) BrownfieldGuide | 1 (614 pages) | sha256 `158eb6d59526...` |
| CustomerProcess | 227 | extracted from App 2(b) — 420 process headers grouped by RTM ID |
| App 2 ClientRequirement | 830 | parsed from Appendix 2 (Technical Compliance S4HANA.xlsx) |

### Classification provenance

Every verdict row in `ClassificationVerdict`:
- `passId` → `ClassificationPass cmopraqub000163wybm1lx5or` (start time, actor, protocol pin)
- `protocolVersionId` → `ClassificationProtocol cmopoadaj000163ctjt2hwu2v` ("TIME bid baseline" v1.0.0; protocol pinned to PRIVATE 2025-FPS1)
- `isCurrent: true` (one-true-per-requirement; superseded verdicts retained as `isCurrent: false`)
- `source: "AI"` (deterministic classifier in this case; ABeam consultants may overlay manual edits with `source: "MANUAL"`)
- `actor: "claude-cli"`
- `remarksMd` cites only evidence present in the prompt bundle (anti-hallucination by construction)

`VerdictScopeItem` join (1,540 rows): each row links a verdict to a specific `ScopeItem.id` via FK — citation integrity enforced by the database schema. Hallucinated scope codes are rejected at write time.

## Honest constraints (preserved from plan)

1. **Heuristic-only matching for Phase 1.** The deterministic classifier ranks greenfield ScopeItems by keyword overlap, not semantic understanding. Some matches are weak (e.g. requirement about Investment Management matched to "Software Compatibility Management" via shared "system" + "structure" tokens). Remarks explicitly say "closest Best Practice reference" rather than asserting truth.

2. **62.3% requirement-process coverage.** The 313 requirements without a CustomerProcess link are mostly SOW (abstract scope) + Finance Enterprise Structure (descriptive Doc Refs). Classifier still grounds these via SAP catalogs alone.

3. **No customer ATC / SUSG / Maintenance Planner.** Custom-code remediation cannot be authoritatively scoped from a competitive bid. All custom-code-relevant verdicts include the standard SAP partner-bid caveat: *"Custom-code adaptation per Simplification Item framework — full scope to be confirmed during Explore phase via ATC scan."*

4. **TIME's evaluation rubric not visible.** Bidder's FC/PC/NC mapping (per AD-6: O+C → FC, G with gap-product → PC, G with no SAP solution → NC, N/A → blank) is best-guess. Conservative bias when ambiguous.

5. **App 2(b) PDF metadata title says "Apical (Malaysia) Sdn Bhd"** — template residue; cover page + content are genuinely TIME's S/4HANA Upgrade Assessment (verified Jan 2026 cover + chapter content).

6. **5 heuristic-mistag clears in API canonical merge.** 5 rows previously heuristic-tagged ODATAV4+Private cleared to `apiType=NULL` because the canonical 424 list excluded them; they are likely Public-edition v4 APIs.

## ABeam consultant review checklist

Before submission to TIME, ABeam should:

1. Open `TIME_App2_Response_2026-05-03T12-41-00.xlsx`
2. Random-sample 50 requirements across modules (especially Finance, Asset_IMPS, IT)
3. For each: confirm verdict is reasonable, edit Remarks where evidence is weak (low-confidence rows)
4. Re-classify obvious O candidates currently tagged C (e.g. Consignment items where SAP delivers OOTB)
5. Override heuristic-keyword mismatches with correct ScopeItem citations
6. Add commercial polish to Remarks tone where needed
7. Validate App 3 BoQ person-day counts against ABeam delivery norms; commercial team adds RM unit prices
8. Sign cover PDF page 6

## Reproducibility

To reproduce this entire run from a clean DB:

```bash
# Phase 1 — schema + assessment
pnpm tsx scripts/time/<...>  # see plan file

# Phase 2 — ingest
pnpm tsx scripts/time/ingest-app2-requirements.ts

# Phase 3 — extract processes
pnpm tsx scripts/ingest/brownfield-pdf-guide-adapter.ts /workspaces/aptus/Conversion/TIME_App2b_Process_Assessment.pdf --title "TIME ..."
pnpm tsx scripts/time/extract-customer-processes.ts

# Phase 4 — link processes to requirements
pnpm tsx scripts/time/link-processes-to-requirements.ts

# Phase 5 — link processes to SAP catalog evidence
pnpm tsx scripts/time/link-processes-to-evidence.ts

# Phase 6 — seed protocol
pnpm tsx scripts/time/seed-time-protocol.ts

# Phase 8 — emit + classify + apply
pnpm tsx scripts/time/emit-classification-prompts.ts
pnpm tsx scripts/time/classify-batches-deterministic.ts cmopnc80z000263fq9zd4cmlw
pnpm tsx scripts/time/apply-classification-results.ts --pass-id <pass-id>

# Phases 9-11 — generate deliverables
pnpm tsx scripts/time/generate-app2-response.ts
pnpm tsx scripts/time/generate-app3-boq.ts
pnpm tsx scripts/time/generate-bid-cover.ts
```

Output filenames are timestamped, so re-runs don't overwrite prior deliverables. Original RFT template at `/workspaces/aptus/Conversion/RFT/1. RFT Docs/Appendix 2 (26.069) - Technical Compliance S4HANA.xlsx` is never mutated.
