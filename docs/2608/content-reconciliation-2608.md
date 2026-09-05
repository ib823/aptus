# Content Reconciliation — SAP content release 2608

Generated 2026-09-05 by `scripts/report-content-reconciliation-2608.ts` (`pnpm sap:2608:reconciliation`). Every figure below is computed from the committed drop (`sap-references/2608/`, sha256-pinned by its MANIFEST) and the code that consumes it. The 2602 programme's hand-kept "Content Reconciliation" workbook is not in the repository; this report reproduces the subjects of its tabs 1–3 from primary sources and states where it cannot.

## Tab 1 — BPD test scripts: 2602 → 2608 steps per workbench item

Source of the 2608 column: the structured test case (`<CODE>_S4CLD2608_BPD_EN_MY.xlsx`) — one step per activity after the `Test Procedures` marker; roles from the docx Roles table. Source of the 2602 column: the three data files the 2602 workbench carried, frozen in `scripts/lib/bpd-2608/baseline-2602.json`. *none* = the item had no exact steps in aptus before 2608.

| Code | Title | 2602 steps | 2608 steps | Added | Removed | Roles 2608 | Apps 2608 | xlsx sha256 | Assessment byte-compare (docx) |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| 1IQ | Sales Inquiry | 3 | 3 | 0 | 0 | 1 | 1 | `eebae2b88253` | CHANGED — BPD docx 86501 → 73499 bytes; Process-Steps activities 3 → 3; Fiori apps 1 → 1 |
| 1NT | Project Control – Finance | none | 32 | 32 | 0 | 7 | 16 | `b018d9639de7` | NEW IN FOLDER — BPD docx — → — bytes; Process-Steps activities 33 → 33; Fiori apps 13 → 13 |
| 2ET | Sales Order Processing for Non-Stock Material | none | 13 | 13 | 0 | 6 | 7 | `62f86695c296` | NEW IN FOLDER — BPD docx — → — bytes; Process-Steps activities 49 → 31; Fiori apps 14 → 14 |
| BD9 | Sell from Stock | 32 | 35 | 3 | 0 | 14 | 16 | `04c5d4423ddb` | CHANGED — BPD docx 239903 → 227923 bytes; Process-Steps activities 253 → 124; Fiori apps 25 → 24 |
| BDG | Sales Quotation | 10 | 10 | 0 | 0 | 6 | 2 | `d870808c94b2` | CHANGED — BPD docx 116331 → 92429 bytes; Process-Steps activities 10 → 10; Fiori apps 2 → 2 |
| BDW | Returnables Processing | none | 28 | 28 | 0 | 6 | 12 | `e1d4b5c35e0d` | NEW IN FOLDER — BPD docx — → — bytes; Process-Steps activities 96 → 74; Fiori apps 22 → 22 |
| J45 | Procurement of Direct Materials | none | 43 | 43 | 0 | 11 | 21 | `aac157df8bd4` | NEW IN FOLDER — BPD docx — → — bytes; Process-Steps activities 126 → 64; Fiori apps 26 → 24 |
| J59 | Accounts Receivable | none | 55 | 55 | 0 | 9 | 38 | `3ff229bd7b8d` | NEW IN FOLDER — BPD docx — → — bytes; Process-Steps activities 357 → 167; Fiori apps 74 → 83 |
| J60 | Accounts Payable | none | 79 | 79 | 0 | 10 | 55 | `5c2986b7f6f6` | NEW IN FOLDER — BPD docx — → — bytes; Process-Steps activities 575 → 323; Fiori apps 122 → 117 |

Detail per item (added/removed step names): `docs/2608/bpd-delta.md`.

## Tab 2 — BDC questionnaires: what SAP re-issued at 2608, and what the affirm set does with it

Source: the 14 workbooks in the drop, parsed by `scripts/lib/bdc-2608/parse-bdc.ts` into `sap-references/2608/bdc-questionnaires.json`; the byte comparison is the assessment workbook's sheet "BDC & BPD Delta" (2602 re-download vs 2608). "Affirm rows (2602)" = questions in `prisma/seeds/value-stream/dataset.json` sourced from that questionnaire.

| ID | Name | 2608 sheet | Questions | L1 / L2 / L3 / none | With SSCUI id | Byte-compare 2602→2608 | Affirm rows (2602) | Action at 2608 |
|---|---|---|---:|---|---:|---|---:|---|
| S4H_1041 | Treasury | Accelerator  | 263 | 0 / 7 / 256 / 0 | 255 | IDENTICAL | 7 | identical — affirm rows untouched |
| S4H_1060 | Asset Management | Content Details | 54 | 0 / 6 / 48 / 0 | 52 | IDENTICAL | 6 | identical — affirm rows untouched |
| S4H_1061 | Manufacturing | Accelerator  | 93 | 0 / 6 / 87 / 0 | 93 | IDENTICAL | 6 | identical — affirm rows untouched |
| S4H_1754 | EPPM | Accelerator | 5 | 0 / 0 / 5 / 0 | 0 | IDENTICAL | 0 | identical — affirm rows untouched |
| S4H_1767 | Retail | Accelerator 2608 | 93 | 0 / 0 / 93 / 0 | 93 | CHANGED | 0 | CHANGED — no 2602 affirm rows from this questionnaire, nothing to re-level |
| S4H_405 | Finance | Accelerator  | 256 | 0 / 33 / 223 / 0 | 253 | IDENTICAL | 33 | identical — affirm rows untouched |
| S4H_407 | Professional Services | Accelerator  | 12 | 0 / 3 / 9 / 0 | 6 | IDENTICAL | 3 | identical — affirm rows untouched |
| S4H_420 | Sourcing and Procurement | Accelerator  | 98 | 0 / 14 / 84 / 0 | 72 | CHANGED | 14 | CHANGED — 14 of 14 affirm rows re-levelled from the 2608 sheet by verbatim match |
| S4H_433 | Sales | Accelerator | 173 | 0 / 28 / 145 / 0 | 169 | IDENTICAL | 28 | identical — affirm rows untouched |
| S4H_434 | HR | Accelerator | 13 | 0 / 0 / 13 / 0 | 13 | IDENTICAL | 0 | identical — affirm rows untouched |
| S4H_435 | Supply Chain | Accelerator  | 79 | 0 / 11 / 68 / 0 | 79 | IDENTICAL | 11 | identical — affirm rows untouched |
| S4H_491 | R and D Engineering | Accelerator  | 36 | 0 / 8 / 28 / 0 | 34 | IDENTICAL | 8 | identical — affirm rows untouched |
| S4H_695 | Service | Accelerator  | 16 | 0 / 6 / 10 / 0 | 16 | IDENTICAL | 6 | identical — affirm rows untouched |
| S4H_706 | Process Automation | Questionnaire | 16 | 0 / 0 / 0 / 16 | 0 | NEW | 0 | NEW — loaded as value stream "process-automation" (16 questions, releaseId 2608, no SAP Level) |

Not in the drop (listed by the assessment, not shipped in the 2608 folder): S4H_2236 (Quality Management); S4H_2132 (Public Sector). Their 2602 affirm rows (27 / 1) are untouched. In the drop but not a BDC questionnaire (no Question/Level rows, not parsed): S4H_1613 (S4H_1613 Business Process Scope Questionnaire for Two Tier.xlsx); S4H_2132 (S4H_2132 Business Driven Configuration Questionnaire - Public Sector.xlsx); S4H_2236 (S4H_2236 Business Driven Configuration Questionnaire - Quality Management.xlsx).

Re-level result: 14 matched, 0 unmatched (a 2602 verbatim with no identical 2608 row keeps `bdcLevel` NULL — never guessed).

## Tab 3 — Fit-to-Standard data files: provenance and D1 grounding

Source: `src/lib/fts/data/index.ts` as built. D1 = every decision's `sscui_id` is empty or a numeric SSCUI id (the guard in `tests/unit/fts/decision-sscui.test.ts`).

| Code | Title | Release stamp | Steps | Roles | Apps | Decisions | SSCUI refs (file) | D1 | Source |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| 1IQ | Sales Inquiry | S/4HANA Cloud Public Edition 2608 — MY | 3 | 1 | 1 | 7 | 0 | ok | bpd-fts/1IQ_S4CLD2608_BPD_EN_MY.xlsx `eebae2b88253` |
| 1NT | Project Control – Finance | S/4HANA Cloud Public Edition 2608 — MY | 32 | 7 | 16 | 0 | 0 | ok | bpd-fts/1NT_S4CLD2608_BPD_EN_MY.xlsx `b018d9639de7` |
| 2ET | Sales Order Processing for Non-Stock Material | S/4HANA Cloud Public Edition 2608 — MY | 13 | 6 | 7 | 0 | 0 | ok | bpd-fts/2ET_S4CLD2608_BPD_EN_MY.xlsx `62f86695c296` |
| BD9 | Sell from Stock | S/4HANA Cloud Public Edition 2608 — MY | 35 | 14 | 16 | 8 | 50 | ok | bpd-fts/BD9_S4CLD2608_BPD_EN_MY.xlsx `04c5d4423ddb` |
| BDG | Sales Quotation | S/4HANA Cloud Public Edition 2608 — MY | 10 | 6 | 2 | 7 | 0 | ok | bpd-fts/BDG_S4CLD2608_BPD_EN_MY.xlsx `d870808c94b2` |
| BDW | Returnables Processing | S/4HANA Cloud Public Edition 2608 — MY | 28 | 6 | 12 | 0 | 0 | ok | bpd-fts/BDW_S4CLD2608_BPD_EN_MY.xlsx `e1d4b5c35e0d` |
| J45 | Procurement of Direct Materials | S/4HANA Cloud Public Edition 2608 — MY | 43 | 11 | 21 | 0 | 0 | ok | bpd-fts/J45_S4CLD2608_BPD_EN_MY.xlsx `aac157df8bd4` |
| J59 | Accounts Receivable | S/4HANA Cloud Public Edition 2608 — MY | 55 | 9 | 38 | 0 | 0 | ok | bpd-fts/J59_S4CLD2608_BPD_EN_MY.xlsx `3ff229bd7b8d` |
| J60 | Accounts Payable | S/4HANA Cloud Public Edition 2608 — MY | 79 | 10 | 55 | 0 | 0 | ok | bpd-fts/J60_S4CLD2608_BPD_EN_MY.xlsx `5c2986b7f6f6` |
| O2C-SALES | Order-to-Cash — Sales | S/4HANA Cloud Public Edition 2608 | 0 | 0 | 0 | 28 | 0 | ok | src/lib/fts/value-streams (BDC S4H_433) |

## Not reconciled here

- The 2602 BPD files themselves (only their parsed data files were in the repository), so the 2602 column of Tab 1 is the workbench's prior content, not a 2602 re-parse.
- The two questionnaires the assessment lists but the drop does not contain (Quality Management, Public Sector), and the Two-Tier scope questionnaire (in the drop, not a BDC instrument).
- Process-Steps / SSCUI / scope-item deltas — those are WS1's RECON (`pnpm sap:2608:recon`) and `docs/2608/sscui-citation-revalidation.md`.
