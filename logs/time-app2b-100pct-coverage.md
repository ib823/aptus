# TIME RFT — App 2(b) 100% Coverage Proof + Audit Trail (v2 — module-strict)

**Date:** 2026-05-03 (v2 re-classification at 14:25 SGT)
**Customer:** T.I.M.E. dotCom Bhd
**RFT:** 26.069 — S/4HANA License Purchase and System Implementation
**Bidder:** ABeam Consulting (Malaysia) Sdn Bhd
**Aptus Assessment ID:** `cmopnc80z000263fq9zd4cmlw`
**App 2(b) Source PDF sha256:** `158eb6d59526608c4dac4ac15221c1fcba17aec9d9c0bfed612be747ce61a728`
**App 2(b) Source PDF size:** 19,551,956 bytes (614 pages)
**Classifier version:** v2 (module-strict, see `scripts/time/classify-v2-module-strict.ts`)

---

## v1 → v2 rectification summary

The v1 classifier (`classify-batches-deterministic.ts`) had a critical defect: it selected scope-item candidates by raw keyword overlap with NO module filter, then the deterministic decision flow picked the highest-scoring candidate even when the functional area was wrong. Result: Finance reqs cited R&D scope items, HCM reqs cited Warehouse, Security reqs cited Manufacturing, IT reqs cited Procurement.

**v2 fixes (live in DB now):**

1. **Module-area whitelist** — FI/FI-AA only consider Finance + Asset Management areas; MM/MM-IM only Sourcing & Procurement + Supply Chain; HCM/Security/IT/SOW have no greenfield whitelist (correctly so — those areas don't exist in the 271-item Public/Private Edition catalog).
2. **Cross-cutting tag routing** — PROJECT_MGMT / METHODOLOGY / RISK_GOVERNANCE / SECURITY_OVERLAY / IT_ARCHITECTURE / DATA_MIGRATION / CHANGE_MGMT / WORKFLOW_APPROVAL / REPORTING / INTEGRATION_TOUCHPOINT / LEGAL_COMPLIANCE / COMMERCIAL_TCO each route to a tag-specific Remarks template that names the actual SAP delivery mechanism (PFCG / SAP Cloud ALM / Integration Suite / etc.) rather than fabricating a wrong scope-item citation.
3. **Context-paragraph detection** — SOW preamble ("TIME is a leading…", "TIME is currently operating ECC6…", "The current system is hosted on Windows…") and section headers are now correctly tagged N/A with "Information only" Remarks instead of getting fake verdicts.
4. **Process-anchored grounding is module-filtered** — `CustomerProcessSapEvidenceLink` rows from the original keyword-overlap linker are re-validated against the requirement's module-area whitelist before being trusted; for modules without a whitelist, process-anchored grounding is skipped entirely.
5. **Gap-product detection runs early** — SuccessFactors / Ariba / Concur / BPA / SAC / BTP / Signavio mentions in the requirement text now produce a G verdict citing the sister product BEFORE any greenfield matching is attempted (G-1-4 SuccessFactors integration was previously mis-cited as Ariba Contracts).
6. **HCM-specific routing** — HCM module reqs (no greenfield catalog coverage) route to: HCM Payroll on S/4HANA + SuccessFactors note for Payroll-related items; SuccessFactors gap for Recruiting/Talent/Performance items.
7. **Multi-token name boost** — scoring now triples the weight of scope-item nameClean tokens vs subArea tokens, so semantically-related compounds ("Cost Center" → BEG Standard Cost Calculation) outrank generic single-word coincidences.

---

## TL;DR — coverage figures

| Coverage axis | Result |
|---|---|
| **Pages of App 2(b) classified** | **615 / 614** (100% — page-number coverage 1..614 verified) |
| **Requirements ingested** | **830 / 830** rows from App 2 Excel (10 functional sheets) |
| **Requirements with crossCuttingTag (zero NULL)** | **830 / 830** (517 PROCESS_ANCHORED + 313 explicit cross-cutting) |
| **Requirements with current verdict (v2)** | **830 / 830** (`isCurrent=true`, `frozenAt=null`, written via verdict-writer chokepoint) |
| **Requirements written into App 2 response Excel** | **834** cells across 10 sheets |
| **CustomerProcess rows extracted** | **227** canonical (from 420 process-header occurrences) |
| **Process ↔ Requirement links** | **939** (62.3% req coverage; cross-cutting tag covers the rest) |
| **Process ↔ SAP catalog evidence links** | **1,474** (avg 6.5 per process) |
| **CustomerProcessOption rows** | **235** with bullets; scoring NULL — see "Honest constraints" §4 |
| **CustomerProcessReference rows** | **41** (TRANSACTION_CODE: 19, FIORI_APP: 15, TABLE_NAME: 7) |

---

## Verdict distribution (v2 vs v1)

| Bucket | v1 count | v2 count | Notes |
|---|--:|--:|---|
| O - Out Of The Box     | 13  | **76**  | More obvious O matches via boosted name-token scoring |
| C - Configuration      | 737 | **487** | Lower count after stripping fake citations |
| G - Gap                | 72  | **83**  | Now includes SuccessFactors-cited rows that v1 mis-cited as C |
| N/A - Out of Scope     | 8   | **184** | Captures SOW preamble + section headers + TCO scaffolding correctly |
| **TOTAL**              | 830 | **830** | |
| Confidence: high       | 191 | **748** | Module-strict matching produces high confidence by construction |
| Confidence: medium     | 567 | **66**  | |
| Confidence: low        | 72  | **16**  | |

---

## Page-type distribution across all 615 classified App 2(b) pages

| pageType (multi-tag per page) | Count |
|---|--:|
| TO_BE_PROCESS  | 236 |
| AS_IS_PROCESS  | 184 |
| TO_BE_BENEFITS | 151 |
| PAIN_POINTS    | 124 |
| OTHER          | 120 |
| CHAPTER_INTRO  | 51 |
| SUMMARY_TABLE  | 18 |
| TOC            | 4 |
| COVER          | 1 |
| APPENDIX       | 1 |

Every page from 1 through 614 has a corresponding `App2bPageClassification` row scoped to `guideId=cmopnh6h300016318097r77ho`. No page is silently skipped.

---

## Cross-cutting tag distribution (deterministic categoriser)

| Tag | Count | Routing in v2 |
|---|--:|---|
| PROCESS_ANCHORED       | 517 | Module-filtered greenfield evidence from linked CustomerProcess |
| CROSS_CUTTING_OTHER    | 106 | Either context-paragraph (N/A) or fall-through to module-strict matching |
| PROJECT_MGMT           |  84 | Project Management template (PMO governance, RAID, status cadence) |
| IT_ARCHITECTURE        |  26 | 3-tier landscape + Integration Suite + DR template |
| SECTION_HEADER         |  16 | N/A "Information only" |
| REPORTING              |  16 | Embedded Analytics + SAC template |
| INTEGRATION_TOUCHPOINT |  15 | Integration Suite (CPI) + named-system content packages template |
| SECURITY_OVERLAY       |  14 | PFCG/SoD/SAML/TLS/SAP Cloud Identity template |
| WORKFLOW_APPROVAL      |  10 | Flexible Workflow + BPA template |
| RISK_GOVERNANCE        |   8 | RAID + control matrix + change document framework template |
| COMMERCIAL_TCO         |   7 | N/A — commercial scaffolding |
| LEGAL_COMPLIANCE       |   5 | Subscription + maintenance terms template |
| METHODOLOGY            |   4 | SAP Activate phase template |
| DATA_MIGRATION         |   2 | Migration Cockpit (LTMC) + brownfield-conversion template |
| **TOTAL**              | 830 | **NULL count: 0** |

---

## Final deliverables (v2, sha256-verified)

| File | Size | sha256 |
|---|--:|---|
| `logs/TIME_App2_Response_2026-05-03T14-25-27.xlsx` | 113,027 B | `68e5c1a98f7d5c255c54cb6cf1efb36b9a7fffd9b17089c1185a14a2644ae73c` |
| `logs/TIME_App3_BoQ_2026-05-03T14-25-29.xlsx`     |   8,978 B | `c99412f30a547418246eeea09274e0896a9b12fe07dad078be9b733c33f465d5` |
| `logs/TIME_Bid_Cover_2026-05-03T14-25-31.pdf`     |  43,388 B | `a78088be545b99024655e12e560508f9f73926d838cc242b8a7aeda201a8d4f0` |

---

## Sample Remarks (post-v2, audit-spot-check)

| Code | Verdict | DocRef | First 200 chars of Remarks |
|---|---|---|---|
| A-1-1   | N/A | (blank)  | Information only — descriptive context / section header, not a testable compliance requirement. |
| A-1-3   | N/A | (blank)  | Information only — descriptive context / section header, not a testable compliance requirement. |
| A-2-17  | FC  | (blank)  | Delivered per SAP Activate methodology (Discover → Prepare → Explore → Realize → Deploy → Run). |
| B-1-10  | FC  | BEG, J54 | Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item BEG "Standard Cost Calculation" (Finance) … |
| B-1-13  | FC  | J59, J60 | Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item J59 "Accounts Receivable" (Finance) … |
| B-3-105 | FC  | BFA, J60, J77 | Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item BFA "Basic Bank Account Management" (Finance) … |
| B-5-29  | FC  | (blank)  | Delivered via SAP S/4HANA Flexible Workflow framework (configurable approval matrices per business object: PR, PO, AP invoice, asset transfer, etc.). |
| C-1-12  | FC  | 2WK      | Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item 2WK "Handover of Product Information to SAP Asset Intelligence Network" (Asset Management) … |
| D-2-2-1 | FC  | 4B0, 42K, 4A1 | Standard SAP S/4HANA Cloud Private Edition supports this requirement via Best Practice scope item 4B0 "Contract for Central Procurement with SAP Ariba Contracts" (Sourcing and Procurement) … |
| G-1-2   | FC  | (blank)  | Delivered via SAP S/4HANA Cloud Private Edition's standard 3-tier landscape (DEV / QAS / PRD) on SAP-managed Hyperscaler infrastructure … |
| G-1-4   | PC  | (blank)  | Standard SAP S/4HANA Cloud Private Edition does not deliver this. Recommended SAP solution: SAP SuccessFactors Employee Central (sister SAP product …). |
| G-1-6   | FC  | (blank)  | Delivered via SAP HCM Payroll on S/4HANA (compatibility pack mode supported through 2030 per SAP Note 2269324). For long-term roadmap, SAP SuccessFactors Employee Central Payroll is the strategic SAP product. |
| H-1-2   | FC  | (blank)  | Delivered via ABeam's risk + governance framework: weekly RAID register, steering committee escalation, internal control matrix … |
| H-1-3   | FC  | (blank)  | Delivered via SAP S/4HANA Cloud Private Edition's standard security framework: PFCG role-based access control, SU01 user provisioning, segregation-of-duties via SoD matrix, encryption at rest (TDE) + in transit (TLS 1.2+) … |
| H-1-6   | FC  | (blank)  | Delivered via SAP Integration Suite (CPI) on SAP Business Technology Platform — provides OData v4 / REST / SOAP / SFTP / IDoc adapters out-of-the-box. … |
| I-1-1   | FC  | (blank)  | Delivered via SAP S/4HANA Cloud Private Edition's standard 3-tier landscape (DEV / QAS / PRD) on SAP-managed Hyperscaler infrastructure … |
| I-2-2   | FC  | (blank)  | Delivered via SAP S/4HANA Cloud Private Edition's standard 3-tier landscape (DEV / QAS / PRD) … Integration via SAP Integration Suite (CPI) on SAP Business Technology Platform (BTP). |

---

## Honest constraints — what is NOT 100% and why

### §1 — Page count discrepancy (615 vs 614)
`pdftotext` occasionally emits one extra page record where a process title page splits across a logical page boundary. We recorded all 615 page records; for "page-number coverage 1..614" the ground truth IS 100%.

### §2 — `referenceCount` (41) is lower bound, not upper
TIME's App 2(b) is mostly narrative + diagrams. SAP transaction codes / table names / Fiori IDs appear sparingly in the text layer. The 19 + 15 + 7 references we extracted are everything that exists in the recoverable text. SAP Notes, BAdIs, function modules do not appear in App 2(b) at all (confirmed by exhaustive grep).

### §3 — Pain-point extraction reaches 11 of 227 canonical processes
TIME's App 2(b) is a PowerPoint-converted PDF where many "Pain Points" sections live inside table cells / SmartArt diagrams that `pdftotext` does not preserve as flowable text. The 11 captured pain points ARE genuine and ARE surfaced in the App 2 response Remarks for the linked requirements (e.g. B-3-105 cites "Manual process of account payable aging…" pulled from the FI.003 process page). Recovering pain content from SmartArt diagrams requires OCR on slide images — out of scope for this competitive-bid pipeline.

### §4 — To-Be Option scoring (Adoption / Priority / Effort / Org-change) is NULL across all 235 options
The Poor / Fair / Good marks in TIME's App 2(b) are visual checkmarks rendered inside PowerPoint shapes. `pdftotext` does NOT preserve them — they are not in the text layer at all. We have the 235 To-Be option *descriptions* + bullets correctly extracted; the scoring grid would require OCR. The data model field is preserved (`scoringComments JSON`) so a manual or OCR-driven follow-up pass can populate it without schema change.

### §5 — 106 requirements landed in `CROSS_CUTTING_OTHER` residue bucket
These are abstract / framing statements ("Supplier shall…") that don't anchor to a specific process and don't match any of the 12 specific cross-cutting buckets. The deterministic rules erred on the side of leaving them in the explicit residue bucket rather than mis-tagging them. They are still classified, still verdicted, still in the response.

### §6 — Heuristic keyword scoring is not semantic understanding
Even with module-strict filtering, the v2 classifier picks the highest-overlap candidate within the module's whitelist. Sometimes this produces a related-but-not-perfect citation (e.g. B-1-10 "Cost Center" → BEG "Standard Cost Calculation" rather than the more specific J62 Cost Center Accounting). All citations are at least module-correct and topically-related; ABeam consultants should review the 487 C-bucket rows to refine cite specificity before submission.

### §7 — TIME's evaluation rubric (FC/PC/NC mapping) is not visible to bidders
Aptus uses the conservative AD-6 mapping (O+C → FC, G with gap product → PC, G with no SAP solution → NC, N/A → blank). ABeam reviewer should validate before submission.

---

## Reproducibility — re-run the entire 100% coverage pipeline

```bash
# Re-run deep extraction (idempotent)
pnpm tsx scripts/time/deep-extract-app2b.ts

# Re-run cross-cutting anchor (idempotent)
pnpm tsx scripts/time/anchor-cross-cutting.ts

# Re-run v2 module-strict classifier (writes new isCurrent verdicts; supersedes v1)
pnpm tsx scripts/time/classify-v2-module-strict.ts --dry-run   # safety preview
pnpm tsx scripts/time/classify-v2-module-strict.ts             # writes verdicts

# Re-generate enriched deliverables
pnpm tsx scripts/time/generate-app2-response.ts
pnpm tsx scripts/time/generate-app3-boq.ts
pnpm tsx scripts/time/generate-bid-cover.ts
```

All three deliverables are timestamped — re-runs do not overwrite prior outputs.

---

## What changed in v2 vs v1 (Remarks-quality wise)

| Module | v1 failure pattern | v2 outcome |
|---|---|---|
| SOW preamble (A-1-x) | "TIME is a leading telecom..." cited 42K Source-to-Pay | N/A "Information only" |
| SOW methodology (A-2-17) | Cited random scope items | Routed to METHODOLOGY template (SAP Activate) |
| Finance Cost Center (B-1-10) | Cited 2G5 R&D | Cited BEG Standard Cost Calculation (Finance) |
| Finance AP Interconnecting (B-3-105) | Cited BNX Consumable Purchasing | Cited BFA + J60 + J77 (Finance) |
| HCM SuccessFactors (G-1-4) | Cited 4B0 Ariba Contracts | G + SuccessFactors gap product |
| HCM Payroll (G-1-6) | Cited 1FS Warehouse Inbound | HCM Payroll on S/4HANA + SuccessFactors strategic note |
| Security audit (H-1-2) | Cited BDA Free of Charge Delivery | SECURITY_OVERLAY + RISK_GOVERNANCE template |
| Security TLS (H-1-5) | Cited 4OC Variant Configuration | SECURITY_OVERLAY template (PFCG/SoD/SAML/TLS) |
| IT landscape (I-1-1) | Cited 4OC Variant Configuration | IT_ARCHITECTURE template (3-tier landscape) |
| IT scalability (I-1-3) | Cited 42K Source-to-Pay | IT_ARCHITECTURE template |
| TCO (J-1-x) | Mostly N/A in v1 too | N/A — commercial scaffolding (acknowledged in BoQ) |
