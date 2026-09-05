# CLAUDE CODE MASTER PROMPT — aptus: move to SAP 2608 and build the Client To-Be Process Pack

Repo: github.com/ib823/aptus (Next.js + Prisma + Postgres, Vercel). Run at repo root on `main`. Work in ONE fresh Claude Code session per workstream (WS0…WS7), each on its own branch and PR, resuming from `docs/2608/BUILD-LOG.md`. Never write to prod data without a green RECON. Existing suite (~3,982 tests), guards, product-agnostic CI grep and the consultant/client walls must stay green in every PR.

Source files (already on disk, copy into the repo in WS0):
`<aptus>/AB Workbench/2608/` → Availability_Dependencies_EN_XX.xlsx · SSCUI_List_EN_XX.xlsm · BP_CLD_ENTPR_2608_Process-Steps_EN_XX.xlsx · 2608_Org_Data_Overview_EN_XX.xlsx · 2608_Master_Data_*.xlsx · BP_CLD_ENTPR_2608_Account_Master_Data_for_YCOA*.xlsx · BP_CLD_ENTPR_2608_Forms_List_EN_MY.xlsx · 2608_Pre-configured_Tax_Codes_EN_MY.xlsx · 2608_predelivered_FYV.xlsx · S4H_* (16 BDC + S4H_1613) · bpd-fts/ (2608 BPDs docx+xlsx for 1IQ BD9 BDG J45 J59 J60 1NT 2ET BDW). Do NOT commit the two zips.
Reference: `<aptus>/aptus-SAP-Inventory-Currency-Assessment-2026-09-05.xlsx` (Scope Delta, SSCUI Delta, BDC & BPD Delta, Hub Catalogue Live, Refresh Runbook) and `<aptus>/CCC-2608-catalogue-refresh.md` (Hub loader / deprecation / PO connector detail — WS2–WS4 below reuse it verbatim).

## Verified facts to encode (2026-09-05)
- Current SAP content release = **2608** (marketing name SAP Cloud ERP; technical name SAP S/4HANA Cloud Public Edition). Cadence 2×/yr (Feb/Aug) + feature deliveries .1–.4. Next: 2702.
- Scope items 672→679: +13 (5RP 7ED 7Z1 82X 830 839 83B 83D 83I 83S 85O 86C 88K), −6 obsolete (1QR 21T 2RP 3FY 6VB 7ZH), 9 deprecation-planned with successors (1RK→7MI, 20N, 2OQ→6V2, 4AI→7YM, 4N6→7YH, 6AV→7DO, BH1→4HH, BH2→4HH, BJ2→4HI).
- SSCUI activity IDs 4,227→4,328 (+106/−5). Process-Steps re-cut by SAP: 21,836→19,158 rows, 661 items (277 items changed counts).
- BDC: 13/15 byte-identical; S4H_1767 Retail + S4H_420 S&P changed; NEW S4H_706 Process Automation.
- Hub package SAPS4HANACloud v2608: 859 APIs (803 ACTIVE / 56 DEPRECATED); events 147 (139/8); CDS 9,288; BAdI 1,715; BO 221; Integrations 158; Build 91; Process Blueprints 16; VPUC 5; Analytics 6. Product view "All" APIs = 943.
- Wired API `API_PURCHASEORDER_PROCESS_SRV` is DEPRECATED → `CE_PURCHASEORDER_0001` (V4, SAP_COM_0053). `API_CV_ATTACHMENT` needs extra authorisations in 2608. Fixed-asset SOAP + SAP_COM_0563 deprecated → SAP_COM_0A93/0A95/0A96. New Joule comm scenario SAP_COM_0882.

## WS0 — Data landing + release versioning (branch `chore/sap-content-2608`)
1. Create `sap-references/2608/` with the files above (+ `MANIFEST.json`: filename, sha256, rows, source URL, downloaded 2026-09-05). Keep `sap-references/2602/` as-is.
2. Add `SapContentRelease` (id, release "2608", localisation "MY", loadedAt, manifestHash) and a `releaseId` FK on every SAP-content table (scope items, process steps, SSCUI, BDC questions, BPD steps, Hub artefacts). Migration must be additive; migration-integrity CI gate green.
3. Loaders read the 2608 files behind `SAP_CONTENT_RELEASE=2608` (default stays 2602 until WS7 flips it). Every page that grounds on SAP content shows "SAP content release 2608 · MY" in the footer.
4. RECON script `scripts/recon-2608.ts` prints counts vs the facts above and exits non-zero on drift > ±1%.

## WS1 — Scope, SSCUI, Process-Steps at 2608 (branch `feat/scope-2608`)
= CCC-2608-catalogue-refresh.md PR-4. Plus: A&D `Retired Scope Items` sheet → status RETIRED; What's-New deprecation list → DEPRECATION_PLANNED + successor; item `1NN` (in Process-Steps, not in A&D) → flag ANOMALY. Content Reconciliation D1: re-validate the 14 shorthand SSCUI citations (OM, FW, ATP, CM, PR, DS, QV, PC, SR) against real 2608 IDs and replace them.

## WS2 — Hub loader: State/Version/Successors (branch `feat/hub-2608-state`) = CCC PR-1
## WS3 — Deprecation surfaced in /sap-explorer (branch `feat/hub-deprecation-ui`) = CCC PR-2
## WS4 — PO connector → OData V4 (branch `feat/po-v4`) = CCC PR-3

## WS5 — BPD + BDC 2608 and the new .xlsx BPD parser (branch `feat/bpd-2608`)
1. Parse the 2608 BPD **.xlsx** (structured) for all 9 workbench items; keep the docx parser as fallback; diff against 2602 and write `docs/2608/bpd-delta.md` (1IQ 3→3 steps, BD9 32→?, BDG 10→?, plus the six V2 items now with exact steps).
2. Load S4H_706 Process Automation as a 16th questionnaire / value stream; re-level Retail + S&P L2/L3 from the 2608 files; keep the other 13 (identical).
3. Regenerate `lib/fts/data/*.ts` and workbench previews from 2608; update Content Reconciliation tabs 1–3 as a generated report.

## WS6 — Client To-Be Process Pack (branch `feat/tobe-process-pack`, flag `TOBE_PACK_ENABLED`)
Goal: from (a) selected scope items and (b) a client's BDC answers, generate the complete end-to-end to-be process diagrams with every step marked and traceable to SAP 2608 objects — the presales artefact that lets us start Explore as confirmation, not discovery.
Data model (additive tables, JSON stays hash-frozen):
- `ProcessStepState` enum: STANDARD · CONFIGURED(sscuiId, value) · VARIANT(alternatePathId) · GAP(gapType: extension|workaround|integration|out-of-scope) · NOT_IN_SCOPE.
- `TobeRule`: bdcQuestionId → effect (state, target stepIds/pathIds, sscuiId). Seed rules from the BDC L2/L3 → SSCUI cross-reference already in the questionnaires (column "SSCUI") and the Process-Steps optional/alternate markers; unknown answers default to STANDARD with a "confirm in workshop" flag — never invent a rule.
- `TobePack`: engagementId, releaseId, scope set, answer set, generatedAt, hashes of inputs.
Diagram levels (one renderer, SVG, existing swimlane tokens from process-flow-explorer.html / design system navy #002B5C, teal/blue/amber/gray for the four states):
- L1 end-to-end per value stream (chain scope items using the value-stream/workflow spine from the neutral library; where SAP's Process Navigator business-process hierarchy is needed, read it manually — it is not in the content zip — and check it in as `sap-references/2608/e2e-chains.json`).
- L2 scope-item swimlane (roles from Process-Steps "Business Role"; Fiori app on each step).
- L3 step detail (BPD step text, SSCUI id + value, marker, evidence footer: scope ID · BPD 2608 · SSCUI · BDC question id).
Outputs: interactive page under `/(workbench)/tobe/[engagementId]`; client-facing read-only view under the Affirm pattern (product names allowed here — this IS the SAP pack); export PDF + PPTX (one slide per L2 flow, L1 as the section opener) using the existing report engine; two-lane rule not needed (SAP-specific artefact) but the consultant notes stay private.
Pilot + acceptance: Order-to-Cash (1IQ → BDG → BD9 → J59, plus 2ET) with a sample answer set; every step on the rendered pack must resolve to a 2608 scope ID and, where marked CONFIGURED, to a real SSCUI id in the 2608 list; snapshot tests on the SVG; Playwright e2e for generate→view→export; a11y: semantic table fallback for each swimlane.

## WS7 — Flip + naming + docs (branch `chore/2608-default`)
1. `SAP_CONTENT_RELEASE=2608` default; 2602 stays selectable for existing engagements.
2. UI copy: "SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release 2608"; technical names unchanged in catalogue rows.
3. Update README/CLAUDE.md: release-refresh runbook (the 13 steps in the assessment workbook), sources, and "how to add release 2702 in Feb-2027".

## Gates for every PR
typecheck · lint · unit · migration-integrity · product-agnostic grep · consultant-wall · Playwright smoke on preview · RECON green · BUILD-LOG entry (decision, evidence, what was NOT verified). Report back with: PR links, RECON output, screenshots of /sap-explorer tiles and the O2C to-be pack, and an honest list of anything left unproven.
