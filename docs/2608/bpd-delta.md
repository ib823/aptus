# BPD 2602 → 2608 — Fit-to-Standard step delta

Generated 2026-09-05 by `scripts/emit-fts-2608.ts` from the committed 2608 drop (`sap-references/2608/bpd-fts/`).

**Baseline.** The 2602 workbench carried exact steps for three scope items only (1IQ, BD9, BDG — parsed from the 2602 BPD docx by the external toolkit). The other six items in the 2608 drop had no data file, so their 2602 column reads *none*: they now have exact steps for the first time.

**Method.** 2608 steps = the xlsx test-case activities after the `Test Procedures` marker (the click-level test script), one step per activity, in SAP's order. Steps are compared by name (case-insensitive, `(Optional)` ignored). Roles come from the docx Roles table; apps from the steps' `Access the App` actions plus the docx Overview Table.

| Code | Title | Steps 2602 | Steps 2608 | Added | Removed | Roles | Apps | Decisions | SSCUI refs (carried) |
|---|---|---:|---:|---:|---:|---|---|---:|---:|
| 1IQ | Sales Inquiry | 3 | 3 | 0 | 0 | 1 → 1 | 1 → 1 | 7 | 0 |
| 1NT | Project Control – Finance | none | 32 | 32 | 0 | 7 | 16 | 0 | 0 |
| 2ET | Sales Order Processing for Non-Stock Material | none | 13 | 13 | 0 | 6 | 7 | 0 | 0 |
| BD9 | Sell from Stock | 32 | 35 | 3 | 0 | 14 → 14 | 14 → 16 | 8 | 50 |
| BDG | Sales Quotation | 10 | 10 | 0 | 0 | 6 → 6 | 2 → 2 | 7 | 0 |
| BDW | Returnables Processing | none | 28 | 28 | 0 | 6 | 12 | 0 | 0 |
| J45 | Procurement of Direct Materials | none | 43 | 43 | 0 | 11 | 21 | 0 | 0 |
| J59 | Accounts Receivable | none | 55 | 55 | 0 | 9 | 38 | 0 | 0 |
| J60 | Accounts Payable | none | 79 | 79 | 0 | 10 | 55 | 0 | 0 |

## 1IQ — Sales Inquiry

- 2608 source: xlsx steps 3; 3 step(s) took role/app/expected from the docx Overview Table (3 rows); 0 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 3.
- 2602 → 2608: 3 → 3 steps.
- Step names unchanged.
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## 1NT — Project Control – Finance

- 2608 source: xlsx steps 32; 23 step(s) took role/app/expected from the docx Overview Table (24 rows); 6 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 32.
- 2602: no exact steps in aptus (not in the workbench). All 32 steps are new to the workbench.
- Decisions: none curated yet — the item renders its steps; Tier-1 decisions are a curation task (scripts/decisions-yaml).
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## 2ET — Sales Order Processing for Non-Stock Material

- 2608 source: xlsx steps 13; 10 step(s) took role/app/expected from the docx Overview Table (12 rows); 2 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 13.
- 2602: no exact steps in aptus (not in the workbench). All 13 steps are new to the workbench.
- Decisions: none curated yet — the item renders its steps; Tier-1 decisions are a curation task (scripts/decisions-yaml).
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## BD9 — Sell from Stock

- 2608 source: xlsx steps 35; 23 step(s) took role/app/expected from the docx Overview Table (32 rows); 22 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 31.
- 2602 → 2608: 32 → 35 steps.
- Added (3): `Handling Unit Management (Optional)`, `Process Preliminary Billing Approval (Optional)`, `eDocument Cockpit`

## BDG — Sales Quotation

- 2608 source: xlsx steps 10; 5 step(s) took role/app/expected from the docx Overview Table (10 rows); 3 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 7.
- 2602 → 2608: 10 → 10 steps.
- Step names unchanged.
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## BDW — Returnables Processing

- 2608 source: xlsx steps 28; 22 step(s) took role/app/expected from the docx Overview Table (30 rows); 0 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 31.
- 2602: no exact steps in aptus (not in the workbench). All 28 steps are new to the workbench.
- Decisions: none curated yet — the item renders its steps; Tier-1 decisions are a curation task (scripts/decisions-yaml).
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## J45 — Procurement of Direct Materials

- 2608 source: xlsx steps 43; 35 step(s) took role/app/expected from the docx Overview Table (39 rows); 15 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 32.
- 2602: no exact steps in aptus (not in the workbench). All 43 steps are new to the workbench.
- Decisions: none curated yet — the item renders its steps; Tier-1 decisions are a curation task (scripts/decisions-yaml).
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## J59 — Accounts Receivable

- 2608 source: xlsx steps 55; 45 step(s) took role/app/expected from the docx Overview Table (44 rows); 21 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 53.
- 2602: no exact steps in aptus (not in the workbench). All 55 steps are new to the workbench.
- Decisions: none curated yet — the item renders its steps; Tier-1 decisions are a curation task (scripts/decisions-yaml).
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## J60 — Accounts Payable

- 2608 source: xlsx steps 79; 71 step(s) took role/app/expected from the docx Overview Table (74 rows); 12 preliminary/configuration activities before the steps (not counted as steps); docx procedure headings 84.
- 2602: no exact steps in aptus (not in the workbench). All 79 steps are new to the workbench.
- Decisions: none curated yet — the item renders its steps; Tier-1 decisions are a curation task (scripts/decisions-yaml).
- SSCUI appendix: empty — the SSCUI_List "Main Scope Item ID" column is LoB-wide (a row names 100–700 items), so no per-item list is derived from it.

## What this report does not claim

- The 2602 baseline for the six new items is *absence from the workbench*, not the 2602 BPD: the 2602 drop is not in the repository (WS0), so no 2602 xlsx could be parsed for them.
- A step whose name changed between releases shows as one removal plus one addition; the report does not guess at renames.
- Role/app cells are SAP's wording from the test script; a step whose script names no role or app keeps an empty cell rather than an inferred one.
