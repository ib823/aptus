# SAP S/4HANA Cloud 2608 — Build Log

Session log for the 2608 catalogue refresh workstreams. Newest entry first.
Each entry records what was asked, what was reachable, what landed, the RECON
output, and what remains unproven — nothing is recorded as done that was not
verified in the session.

---

## WS6.1 — To-Be pack legibility, framing and PPTX parity (2026-09-06)

**Branch:** `fix/tobe-export-pagination` (from `main` at the WS6 squash merge, #239).
**Trigger:** the first packs generated from production were unreadable. WS6 shipped
exports that scaled a whole flow onto one page while the font stayed fixed, so a
35-step swimlane drew its boxes at 9% with 6.5pt labels piled on top of each other,
and the L3 tables broke rows mid-cell. Separately the PPTX carried far less than the
PDF, and neither document told the reader what it was.

### What landed

**1. Pagination instead of scale-to-fit** (`svg.ts`, both exporters).
`paginateL2(item, L2_STEPS_PER_PAGE = 7)` slices a scope item's steps into pages;
step numbers stay global so the sequence still reads across pages. The header on
each page says `steps 8–14 of 35` and the title carries `(2/5)`. `wrapText` now
splits a single over-long word instead of letting it run past its box.
Pilot O2C: 5 items → 18 L2 pages, every page at a legible scale
(unit test asserts the layout scale stays above 0.15 for 10…79 steps).

**2. L3 tables that survive a page break** (`export-pdf.ts`).
`rowPageBreak: "avoid"` (a tall row moves whole rather than orphaning
`(Optional)` in one column and `(VF03)` in another), `cellWidth: "auto"` for
eight of nine columns after measuring that the minimum content width is 157mm
of the 269mm available — the fixed widths were fighting autoTable's own sizing
and *shrinking* them made the reported overflow larger — and a `didDrawPage`
hook that repaints the title band on every page the table spills onto. Before
this, 5 of 37 pages in the pilot pack carried a grid of steps with no title.

**3. The configuration list stopped overlapping itself** (`export-pdf.ts`).
It advanced the cursor by one line per entry while `pdf.text` wrapped long
entries over three. Now it splits with `splitTextToSize` and advances by the
lines actually drawn, breaking the page when it runs out.

**4. A WinAnsi choke point** (`export-pdf.ts`, `winAnsiSafe`).
jsPDF's built-in Helvetica is WinAnsi-encoded and a glyph outside that set
derails the whole run: the L1 alternate-path note rendered as letter-spaced
rubble with `!'` where each `→` had been. Every draw on the document now passes
through one sanitiser (arrows and comparison operators map to ASCII, anything
else with no stand-in becomes `?`), so SAP free text — step names, gap reasons,
client answers — cannot corrupt a client-facing page. Characters WinAnsi does
carry (en/em dash, middot, curly quotes, ellipsis) pass through untouched.

**5. `src/lib/tobe/narrative.ts` — one source of framing words, two renderers.**
Seven blocks, rendered as pages in the PDF and slides in the PPTX:
how to read the pack (the L1/L2/L3 table, and the explicit note that there is
no L4 — below a step sits the transaction, demonstrated in the system);
what the colours mean and how a step earns each state; what the pack is not
(standard best practice at 2608 shaped by the answers so far, not a signed-off
design; `Standard` means nothing has been said against it, not that it was
agreed); where every mark comes from, with the four fingerprints; what drives
the effort (nine countable drivers read off the pack itself); the sizing
parameters the pack cannot know and is asking for (company codes, plants, COA,
users, interfaces, migration objects, RICEFW, localisations); and what happens
next — each kind of correction routed to the aptus surface that owns it
(scope set, Fit-to-Standard affirm-set, process discovery, bundle sign-off)
so the marked-up pack regenerates rather than being edited by hand.

**No effort number is computed.** The pack counts what it can see and names
what it cannot; converting that into person-days needs an estimation model
this repo does not carry, and inventing one would contradict the rule the
engine is built on.

**6. PPTX parity** (`export-pptx.ts`). The narrative slides, visible L3 tables
(12 rows per slide via `addTable`, previously speaker-notes only) and a
configurations-and-gaps slide per item that has any. Pilot O2C: 41 slides.

### Verification

Regenerated the live pilot pack (the stored `TobePack` row from production)
through the updated exporters and audited the output rather than eyeballing it:

```
pdf 38 pages, 513KB · pptx 41 slides, 2.6MB · 116 steps · 5 scope items

pdfjs text-position audit over all 38 pages (2291 text runs):
  right-edge overflow   0
  bottom overflow       0
  above top margin      0
  overlapping runs      0
  pages without a title 0   (page 1 is the cover)

pptx OOXML geometry audit: 941 positioned shapes, 0 outside the 13.333×7.5in
  slide, 0 table grids wider than the slide
```

Pages were also rendered to PNG through pdf.js and read back: cover, narrative,
L1, an L2 slice, an L3 first page and an L3 continuation page.

### Gates

```
tsc --noEmit --strict          OK
eslint --max-warnings 0        OK
vitest run                     337 files, 4948 tests, 0 failures
check-migration-drift.sh       zero drift
next build                     OK
pnpm sap:2608:recon            GREEN
```

### Unproven / open

1. **Effort quantification.** The pack states drivers and asks for the sizing
   parameters; it does not produce a number. Where those numbers should come
   from is a decision, not an implementation detail.
2. **Visual review of the PPTX.** The geometry is asserted from the OOXML; no
   renderer was available in the sandbox (LibreOffice here has no Impress
   module), so the slides have not been *seen*. The PDF has.
3. **`L2_STEPS_PER_PAGE = 7` and `L3_ROWS_PER_SLIDE = 12`** are chosen against
   A4 landscape and 16:9 respectively and verified against the pilot's 3…55
   step items. An item far outside that range is untested.

---

## WS6 — To-Be Process Pack (2026-09-05)

**Branch:** `feat/tobe-process-pack` (from `main` at the WS5 squash merge, #238).
**Instruction:** master prompt WS6 / to-be process pack: from an engagement's
scope set and the client's affirmations, generate the to-be process — L1
end-to-end chain, L2 swimlane per scope item, L3 step table — with every
non-standard step traced to its BDC answer and SSCUI; consultant view and
client view; PDF + PPTX export; Order-to-Cash pilot; behind a flag.

### What the code map established first

- **The engagement already exists: it is the affirm bundle.** `AffirmBundle`
  carries the client, the scope set (`AffirmBundleScopeItem` = SAP scope codes)
  and the answers (`AffirmResponse`: standard | discuss | deviate + reason), and
  its access rule (`requireAffirmBundleAccess` / `affirmBundleReadableBy`:
  creator or platform admin, 404 otherwise) and guest surface (`/a/*`, grant +
  OTP) are built and tested. WS6 adds no second "engagement" model; the route is
  `/tobe/[engagementId]` with the bundle id.
- **Steps exist only in the 2608 BPD data files** (`src/lib/fts/data/*.ts`,
  regenerated by WS5): 1IQ, 1NT, 2ET, BD9, BDG, BDW, J45, J59, J60 — nine
  items. There is no step source for the other 670 scope items, so a pack for
  them can only say so.
- **The BDC ↔ SSCUI link is in the data.** The WS5 sidecar
  (`sap-references/2608/bdc-questionnaires.json`) carries, per question, SAP's
  "SAP ID" (an SSCUI activity id) and its scope items; the affirm bank carries
  the same questions verbatim. That join is the only machine-readable evidence
  of "this answer configures this SSCUI on this scope item".
- **What the drop does NOT carry:** which BPD *step* an SSCUI touches, and any
  end-to-end chain (SAP's Process Navigator hierarchy is not in the 2608 drop).
  Both are therefore explicit, small, checked-in inputs — not derivations.
- The repo already renders PDF with jsPDF (server, `serverExternalPackages`)
  and has no PPTX writer; `pptxgenjs` 4.0.1 is the one new dependency.

### Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Additive data model:** `enum ProcessStepState` (STANDARD · CONFIGURED · VARIANT · GAP · NOT_IN_SCOPE), `enum TobeGapType`, `TobeRule` (question × scope code → trigger/state/SSCUI/step names, `source`, `releaseId`), `TobePack` (bundle × generated pack: scope codes, four hashes, `packJson`, generator). Migration `20260905040000_tobe_process_pack`, drift-checked. | The state vocabulary the prompt names, stored as an enum so it is the same on the page, in the PDF and in the DB. Packs are immutable rows: every generation is a new `TobePack`, so "the pack the client saw" is always retrievable by id. |
| 2 | **The engine is pure and never invents** (`src/lib/tobe/engine.ts`): every step starts STANDARD; a rule changes a state only when the answer to its question equals its trigger; "deviate" with no rule is an unclassified GAP on the scope item (never on a guessed step); "discuss" and unanswered questions only flag *confirm in workshop*; a chain item outside the scope set is NOT_IN_SCOPE on every step; a scope code without a 2608 BPD is a placeholder with zero steps; an answer whose question names no scoped item is listed as *outside scope*, neither placed nor dropped. Precedence NOT_IN_SCOPE > GAP > VARIANT > CONFIGURED > STANDARD with every contributing rule/question kept on the step. | The prompt's "no defaults inferred". Everything a diagram shows is traceable to a BPD step, an answer and a rule id, and the L3 evidence column prints that trace. |
| 3 | **Two rule sources, both transparent.** (a) `bdc-sscui-xref-2608`: 175 rules over 58 decision-format bank questions × their scope codes, *deviate → CONFIGURED(SSCUI), scope-wide* — the SSCUI is shown on the scope item's configuration list and as evidence on its steps, no step state changes because the sheet does not name a step. (b) `curated`: 3 human-authored step rules for the O2C pilot (`src/data/tobe/rules-curated-o2c.json`): L2-077 → SSCUI 102751 on BDG "Process Sales Quotation Approval (Optional)" + "Approve/Reject/Rework Quotation"; L2-024 → 101099 on BD9 "Advanced Available-to-Promise Processing (Optional)"; L2-026 → 102172 on BD9 "Check Batches (Optional)". Seeded by `pnpm sap:2608:seed-tobe` (upsert by rule id; a rule whose question is not in the bank is skipped and counted). | The step mapping is the one judgement in the pack, so it is a small file with a provenance block, every SSCUI id verified against SSCUI_List 2608 by test, every step name verified against the 2608 BPD by test, and flagged *confirm in workshop* on the pack. |
| 4 | **The end-to-end chain is a checked-in sidecar** (`sap-references/2608/e2e-chains.json`, allow-listed as repo-authored): `o2c-sales` = 1IQ → BDG → BD9 → J59 with the alternate BDG → 2ET → J59, provenance "WS6 pilot definition; Process Navigator NOT read". | The prompt's O2C chain; no other chain is claimed because none is sourced. |
| 5 | **One string-based SVG renderer** (`src/lib/tobe/svg.ts`) with a shared layout model (`layoutL2`) that the PDF (jsPDF, drawn) and PPTX (pptxgenjs, native shapes + speaker notes) reuse; L3 rows (`l3Rows`) are the same rows in the on-screen table, the PDF table and the PPTX notes. No client-side diagram library. | One layout, three outputs; SVG is inline in the page (server component, no JS) and downloadable as a file. The table under every L2 is the accessible fallback. |
| 6 | **Surfaces behind `TOBE_PACK_ENABLED === "true"`** (same shape as the discovery flag): `/tobe` (engagements = the caller's bundles, `affirmBundleScope`), `/tobe/[engagementId]` (generate / regenerate, L1 + L2 + L3, exports), `/a/tobe` (client view of the latest pack through the existing guest session + OTP gate, `clientView` strips consultant notes), `POST /api/tobe/[id]/generate`, `GET /api/tobe/[id]/export?format=pdf|pptx|svg`. Gate order: flag → session → role (`canPerformAffirmAction`: generate needs `create_bundle`, export needs `view`) → bundle ownership. `/tobe` and `/api/tobe/` added to `WORKBENCH_PATHS`; hub card gated. | Off means 404 everywhere and the hub never advertises it. Export serves the *stored* latest pack and stamps its inputs hash in a header — it never regenerates, so the file matches the screen. |
| 7 | **Pilot fixture** `src/data/tobe/pilot-o2c-answers.json` (5 scope items, 18 answers: 5 deviate, 2 discuss) + `pnpm sap:2608:seed-tobe -- --pilot` creates the bundle "PILOT · Order to Cash (WS6)" and generates its pack. | An honest, re-runnable demonstration with the exact inputs recorded. |

### Evidence

- **Engine + renderer + exports + routes:** `tests/unit/tobe/*` — 45 tests:
  defaults / never-invent, trigger matching, precedence, canonical hashes,
  outside-scope answers, xref rule builder, SVG well-formedness + escaping +
  snapshots (L1, L2), PDF (`%PDF-`, consultant vs client differ), PPTX (5 slides,
  notes carry SSCUI + internal note), route gates (flag 404 before session,
  401, 403 for read-only/none roles, guard 404 pass-through, export never
  regenerates), and the **O2C pilot acceptance** without a database: every
  curated SSCUI id exists in SSCUI_List 2608 with the same activity name, every
  curated step name is a 2608 BPD step, every drawn step equals the data file,
  BDG steps 2 + 4 CONFIGURED 102751, BD9 aATP + Check Batches CONFIGURED,
  L2-090 an unclassified gap, L2-082 (no scope refs in the bank) listed outside
  scope.
- **Seed against the local DB (2608 release row + affirm bank present):**
  `--dry` → "175 xref (58 questions, 58 scope items) + 3 curated; 0 skipped";
  `--pilot` → `TobeRule` 178 rows; pilot pack: 5 scope items · 116 steps ·
  STANDARD 112 · CONFIGURED 4 · GAP 0 · configured SSCUIs 4 (3 curated + 1
  scope-wide xref) · unanswered 7 · answers outside scope 1.
- **Rendered pilot pack** (from the stored pack, via Chromium): L1 chain with
  per-item state bars and the 2ET alternate; L2 BDG with three lanes (Internal
  Sales Representative, "Role not named in BPD", Sales Manager), steps 2 and 4
  green with "SSCUI 102751", optional steps dashed, workshop dots; PDF 471 KB,
  PPTX 485 KB (opened as zip: 7 slides for the pilot). Not committed (binary).
- **Gates:** `tsc --noEmit --strict` clean · `eslint --max-warnings 0` clean ·
  Prettier clean on new files and on the touched files that were clean at HEAD ·
  migration drift "No difference detected" · `prisma migrate deploy` in sync ·
  `pnpm sap:2608:recon` GREEN · `pnpm sap:hub:recon-2608` GREEN · full
  `vitest run`: 337 files, 4,942 tests, all passing (162 s); the `tests/unit/tobe` suite re-run green after the final renderer polish (45/45) · `next build`: exit 0, `/tobe` and `/tobe/[engagementId]` in the route table (dynamic), no warnings on the new routes.
- **Playwright** `tests/e2e/tobe-pack.consultant.spec.ts` (consultant project;
  runs when `TOBE_E2E=1` with `TOBE_PACK_ENABLED=true`, wired into CI's E2E job
  as its own step): seeds its own engagement (4 O2C scope items as
  `AffirmScopeItem` rows, upserted without touching seeded ones; bundle owned by
  the e2e consultant), then hub card → list → generate → L1 + 4 L2 + 4 L3 tables
  → SVG / PDF / PPTX export bytes → list shows the pack → unknown id 404.
  **Run locally against the production build** (local Postgres, the repo's
  Playwright with the container's Chromium): first run 2 passed / 1 flaky —
  two workers each ran `beforeAll` and created two engagements; fixed with a
  fixed bundle id + upsert and `serial` mode (one journey, one worker) → **3
  passed (10 s)**. The consultant page was also screenshotted from the built
  app with the pilot bundle (summary tiles, L1, L2 BDG with the two configured
  steps, L3 table, "1 answer outside scope: L2-082").

### What was NOT verified / left open

1. **Step-level SSCUI mapping exists for three rules only.** The 175 xref rules
   are scope-wide by construction (the sheet does not name steps). A pack for
   any other item shows configurations on the scope item, not on a step.
2. **Nine scope items have steps.** For the other 670 the pack shows a placeholder
   ("no 2608 BPD loaded; nothing inferred"). WS5's BPD parser can extend this
   as BPDs are dropped.
3. **One chain.** L1 draws the O2C chain only; other scope sets fall back to the
   scope items in order with a note.
4. **PDF and PPTX were not opened in a viewer** — byte and structure checks only
   (PDF header, slide/notes XML). Fonts are Helvetica (built-in).
5. **The client surface `/a/tobe` is not linked from the guest home yet** and has
   no e2e (guest OTP flow); it is reachable by URL for a verified grant and is
   covered by the same guards as `/a/home`.
6. **No production data touched.** Rules and the pilot were seeded into the
   local database only; `pnpm sap:2608:seed-tobe` is the operator step.
7. **`answersOutsideScope`** was found by the pilot (L2-082 has no scope refs in
   the bank) and added to the doc/summary during the session; the PDF cover and
   PPTX title line carry the count, the on-screen pack lists the ids.

---

## WS5 — BPD + BDC 2608 and the .xlsx BPD parser (2026-09-05)

**Branch:** `feat/bpd-2608` (from `main` at the WS4 squash merge, #237).
**Instruction:** master prompt WS5: (1) parse the 2608 BPD **.xlsx** for all 9
workbench items, keep the docx parser as fallback, diff against 2602 and write
`docs/2608/bpd-delta.md` (1IQ 3→3, BD9 32→?, BDG 10→?, the six V2 items now with
exact steps); (2) load S4H_706 Process Automation as a 16th questionnaire /
value stream, re-level Retail + S&P L2/L3 from the 2608 files, keep the other 13
identical; (3) regenerate `lib/fts/data/*.ts` and workbench previews from 2608,
update Content Reconciliation tabs 1–3 as a generated report.

### What the code map established first

- The Fit-to-Standard data files were emitted by `scripts/emit_ts.py`, which
  imports a docx parser from `../../ft2std-toolkit` — a directory outside this
  repository, with the 2602 BPD docx in its `_input`. Neither exists here, so
  the 2602 generator cannot run and the 2602 BPDs cannot be re-parsed. The
  2602 workbench carried exactly three data files (1IQ, BD9, BDG).
- The 2608 BPD xlsx is SAP's Cloud ALM test-case export: one "Test Cases"
  sheet, activities in runs, a `Test Procedures` marker separating preliminary
  configuration from the process steps, and (in BDW, J59, J60) more
  "Additional Information" runs inside the step band. The docx carries what
  the xlsx does not: the Roles table with SAP_BR ids, master data, the
  Overview Table (SAP's one-line expected result per step, split into one
  table per section in J59/J60) and the succeeding processes.
- `mammoth` (already a dependency) fails on these docx under the pinned
  `@xmldom/xmldom` 0.9 ("mimeType undefined"), so the docx fallback reads
  `word/document.xml` directly. Under vitest's jsdom environment `adm-zip`
  inflates to empty buffers (cross-realm `Uint8Array`); the WS5 tests declare
  `@vitest-environment node`.
- The 2602 affirm set (`prisma/seeds/value-stream/dataset.json`, 150
  questions) names its source questionnaire per row: 14 rows from S4H_420
  (S&P) and **none** from S4H_1767 (Retail). `AffirmQuestion` had no Level
  column. The base seeder verified counts over the whole table.
- The SSCUI_List "Main Scope Item ID" column is LoB-wide: a row names 100–700
  scope items and ~1,600 rows name 1IQ — not a usable per-item filter.
- No 2602 BPD, BDC workbook or 2602 process-step rows exist locally (the
  `ProcessStep` table is empty in this environment).

### Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **TypeScript BPD parsers** in `scripts/lib/bpd-2608/`: `parse-bpd-xlsx.ts` (steps = activity runs after `Test Procedures`; role from the step's own `Log On` action, app from `Access the App`, purpose from its `Information` action; "Additional Information…" runs after the marker are section notes, never steps and never the end of the band), `parse-bpd-docx.ts` (document.xml walk; tables recognised by header cells; every Overview Table section collected; page numbers stripped from step names), `compose.ts` (xlsx steps; role/app xlsx-first with docx fallback; **expected** docx-first because it is SAP's one-line outcome, else the step's last action result). | The instruction: xlsx primary, docx fallback. Nothing inferred — a step whose script names no role or app keeps an empty cell. |
| 2 | **`scripts/emit-fts-2608.ts`** (`pnpm sap:2608:emit-fts`, `--check`, `--json`) regenerates the nine data files + `index.ts` + `docs/2608/bpd-delta.md`. Decisions are **carried over** from the prior data file (they came from `scripts/decisions-yaml` via the 2602 toolkit and were re-validated in WS1); a new item gets `decisions: []`. The 2602 baseline is **frozen** in `scripts/lib/bpd-2608/baseline-2602.json` (captured from the three files at `e010b48`) so the delta survives regeneration. | The script never authors a decision. Re-running it is idempotent (`--check` is green after a run) and the drift test pins the committed files to the drop. |
| 3 | **`sscui_refs` are carried over, never derived.** 1IQ/BDG keep `[]`, BD9 keeps its 50 curated refs, the six new items get `[]`. | Filtering SSCUI_List by "Main Scope Item ID" would attach the whole sales configuration catalogue to every sales item — grounding in name only (see code map). A per-item SSCUI appendix needs a curated source. |
| 4 | **BDC parser** `scripts/lib/bdc-2608/parse-bdc.ts`: header row found by content (a Question + a Level cell), columns mapped by header text across SAP's five layouts ("Accelerator", "Accelerator 2608", "Content Details", Treasury's variant, S4H_706's "Questionnaire"), merged Process cell forward-filled, Level read verbatim or `null`. **`scripts/load-2608-bdc.ts`** (`pnpm sap:2608:load-bdc`, `--db`, `--check`) writes `sap-references/2608/bdc-questionnaires.json` (sidecar, allow-listed) and `prisma/seeds/value-stream/dataset-2608.json`. | One parser for 14 workbooks that SAP laid out five ways; the Two-Tier scope questionnaire in the drop is listed and skipped (no Question/Level rows). |
| 5 | **S4H_706 → new value stream `process-automation`** (sub-process "SAP Build Process Automation", 16 questions `L2-706-001…016`, `format: "information"`, `status: "suggested"`, `bdcLevel: null`, `releaseId` = the 2608 `SapContentRelease` row, no plain-language wording). | SAP's sheet has no Level and the questions are discovery prompts; the consultant curates them. The stream is the "16th questionnaire" the instruction asks for, beside the 2602 eight, never merged into them. |
| 6 | **Re-level** by exact verbatim match against the CHANGED 2608 sheets: S4H_420 — all 14 base rows matched, all L2; S4H_1767 — the base set has no Retail rows, so nothing to re-level (reported, not hidden). Unmatched rows would keep `bdcLevel` NULL. | Levels come from SAP's file for the same question text, never guessed. |
| 7 | **Additive migration `20260905030000_affirm_question_bdc_level`**: `AffirmQuestion.bdcLevel String?`. **`prisma/seeds/value-stream/dataset-2608.ts`** (`seedValueStream2608`) runs after the base seed from `prisma/seed.ts` (skips with a message when the 2608 release row is absent). The base seeder's drift guard now counts **its own ids**, not the whole table. | Whole-table counts would have reported the 2608 rows as drift on every re-run of the 2602 seed. |
| 8 | **`scripts/report-content-reconciliation-2608.ts`** (`pnpm sap:2608:reconciliation`) → `docs/2608/content-reconciliation-2608.md`: Tab 1 BPD steps 2602→2608 with the assessment's byte comparison; Tab 2 the 14 questionnaires (questions, L1/L2/L3/none, SSCUI ids, byte-compare, 2602 affirm rows, action at 2608); Tab 3 FTS data provenance with D1 status. | The 2602 "Content Reconciliation" workbook is not in the repository; the report reproduces the subjects of its tabs 1–3 from primary sources and says so. **Assumption stated in the report.** |
| 9 | No data written to any deployed database. The local Postgres ran the base + 2608 seeders twice (idempotent: 166 questions, 9 streams, 14 rows at L2). | Never write to prod without a green RECON; the seeders are the deliverable, the run is the proof they work. |

### What landed

- `scripts/lib/bpd-2608/{parse-bpd-xlsx,parse-bpd-docx,compose}.ts`, `baseline-2602.json`;
  `scripts/emit-fts-2608.ts`; regenerated `src/lib/fts/data/{1IQ,BD9,BDG}.ts`, new
  `{1NT,2ET,BDW,J45,J59,J60}.ts`, `index.ts` (9 items + O2C-SALES); `docs/2608/bpd-delta.md`.
- `scripts/lib/bdc-2608/parse-bdc.ts`; `scripts/load-2608-bdc.ts`;
  `sap-references/2608/bdc-questionnaires.json`; `prisma/seeds/value-stream/dataset-2608.json`
  + `dataset-2608.ts`; `prisma/seed.ts` hook; base seeder guard scoped; migration + schema.
- `scripts/report-content-reconciliation-2608.ts`; `docs/2608/content-reconciliation-2608.md`.
- `package.json` scripts `sap:2608:emit-fts`, `sap:2608:load-bdc`, `sap:2608:reconciliation`;
  `REPO_AUTHORED_SIDECARS` + `bdc-questionnaires.json`; drop README section.
- Tests (+18): `tests/unit/sap-content/bpd-2608.test.ts` (text helpers; 1IQ xlsx 3
  steps / docx roles, 14 master-data rows, 2 succeeding, 3-row Overview Table;
  composed = committed data file; all nine regenerate and match the parsers —
  the drift guard; 1IQ 3 / BDG 10 / BD9 35 with the three added steps; BDW 28
  with four "Display Pallets Stock"; six new items with `decisions: []` and
  `sscui_refs: []`, BD9 keeps 50) and `bdc-2608.test.ts` (level/scope-ref/key
  helpers; S4H_706 16 none-level, S4H_1767 93 L3, S4H_420 98 = 14 L2 + 84 L3,
  S4H_1060 Content-Details mapping; `dataset-2608.json` regenerates from the
  workbooks — 16 new questions, 14 re-levelled all L2, 0 unmatched, no invented
  wording). D1 guard, curation-drift and the existing sap-content tests green.

### Results (from the generated reports)

| Code | Title | 2602 steps | 2608 steps | Added | Roles | Apps |
|---|---|---:|---:|---:|---:|---:|
| 1IQ | Sales Inquiry | 3 | 3 | 0 | 1 | 1 |
| BD9 | Sell from Stock | 32 | 35 | 3 (Handling Unit Management, Process Preliminary Billing Approval, eDocument Cockpit) | 14 | 16 |
| BDG | Sales Quotation | 10 | 10 | 0 | 6 | 2 |
| 1NT | Project Control – Finance | none | 32 | — | 7 | 16 |
| 2ET | Sales Order Processing for Non-Stock Material | none | 13 | — | 6 | 7 |
| BDW | Returnables Processing | none | 28 | — | 6 | 12 |
| J45 | Procurement of Direct Materials | none | 43 | — | 11 | 21 |
| J59 | Accounts Receivable | none | 55 | — | 9 | 38 |
| J60 | Accounts Payable | none | 79 | — | 10 | 55 |

BDC: 14 workbooks parsed (1,207 questions); S4H_706 16 questions, no Level;
S4H_1767 93 questions all L3, zero 2602 affirm rows; S4H_420 98 questions,
14 L2 — the 14 base rows re-levelled to L2; 13 identical workbooks untouched.
Not in the drop: S4H_2236, S4H_2132 (their 27 / 1 affirm rows untouched).

### Gates (this session)

- `tsc --noEmit --strict`: clean. `eslint --max-warnings 0 .`: clean.
- `vitest run`: 331 files, 4,897 tests, all passing (134 s) — net +18; vendor-term
  guard, consultant wall and D1 guard included.
- `scripts/check-migration-drift.sh`: "No difference detected" with the new
  migration; `prisma migrate deploy`: applied locally.
- `pnpm sap:2608:recon`: GREEN (the new sidecar is allow-listed).
  `pnpm sap:2608:emit-fts -- --check` and `pnpm sap:2608:load-bdc -- --check`: OK.
- `next build`: compiled, 109/109 static pages, exit 0.

### What was NOT verified

1. **The 2602 BPDs were not re-parsed** — they are not in the repository. The
   2602 column of the delta is the workbench's prior content for three items
   and "none" for six; a 2602 step that the old docx parser missed would show
   here as "added".
2. **Role / app cells the xlsx and docx both leave blank stay blank** (e.g.
   BD9 "Set Credit Limit (Optional)", a cross-reference to BD6). No inference.
3. **No browser run of the presales preview** for the six new items; they
   render through the same `ScopeItemContent` shape as the three existing
   ones (types checked, D1 green), which is what the build and the unit tests
   prove. Their workbench shows steps and no Tier-1 decisions until curated.
4. **No deployed database was seeded.** `pnpm db:seed` (or
   `pnpm sap:2608:load-bdc -- --db`) after `pnpm sap:2608:seed-release` is the
   run that lands S4H_706 and the 14 levels; it was exercised on the local
   Postgres only.
5. **Retail re-level is empty by construction** (no 2602 Retail affirm rows).
   Loading Retail's 93 L3 questions as content was not asked and not done.
6. **The Content Reconciliation workbook's exact tab layout is unknown here**;
   the generated report covers the three subjects the master prompt names.
7. `scripts/emit_ts.py` and `scripts/decisions-yaml/` remain as the curation
   path for Tier-1 decisions; the emitter carries decisions over from the
   data files rather than re-reading the YAML (no YAML library in the
   dependency set). The WS1 re-validation comment on 1IQ d3 survives in the
   YAML and in the decision's values, not as a comment in the emitted file.

---

## WS4 — PO connector → OData V4 (2026-09-05)

**Branch:** `feat/po-v4` (from `main` at the WS3 squash merge, #236).
**Instruction:** master prompt WS4 = CCC PR-3: replace `API_PURCHASEORDER_PROCESS_SRV`
with `CE_PURCHASEORDER_0001` (`/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001`,
SAP_COM_0053), keep V2 behind a flag for one release; discover/probe/preview/write
parity tests against the TDD tenant (read-only by default, write fail-closed);
re-test `API_CV_ATTACHMENT_SRV` after the tenant's 2608 upgrade and note the new
authorisation requirement.

### What the code map established first

- The PO service is one entry (`key: "purchase-orders"`) in a static list shared
  by three products (S/4 Public, Private, on-prem) and read directly by seven
  callers: the catalog, capabilities, operations and hub-content routes, the
  seed route, `connection-health` (first service = default probe path) and
  the `probe-tenant-capabilities` script. The dashboard card addresses entity
  set `A_PurchaseOrder`.
- The connector already handles both response shapes (`d.results`/`__next` and
  `value`/`@odata.nextLink`), V4 `$metadata` (flavor `v4-best-effort`, nulls
  never writable) and CSRF-then-POST. Two V4 gaps remained: rows kept
  `@odata.etag`/`@odata.context` as fields, and every apiId was taken from the
  last path segment — for the V4 binding that is `0001`, which would have made
  the seed row and the probe key wrong.
- `hubApiToService` derives V4 paths as `<id>/srvd_a2x/sap/<id>/<ver>`; for
  CE_PURCHASEORDER_0001 that guess is wrong (group `api_purchaseorder_2`,
  definition `purchaseorder`), so a catalogue probe of the successor would
  have 404'd and read AVAILABLE, never ACTIVATED.
- **No `S4_TDD_*` credentials exist in this environment**, and the Hub's
  `APIContent.APIs(...)`/`Resources` endpoints redirect to login anonymously
  — so neither a live tenant run nor a downloaded V4 `$metadata` was available.

### Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Two definitions, one key.** `PO_SERVICE_V4` (default) and `PO_SERVICE_V2_LEGACY` both carry `key: "purchase-orders"`; `getSapServices(product)` / `getSapOperations(product)` / `getSapService()` resolve which one the key means. | Every caller keeps addressing "the PO service"; the flag is honoured in one place instead of seven. The static registry is never mutated. |
| 2 | **Flag `{PREFIX}_PO_ODATA_V2=true`** (literal "true" only; per env prefix) swaps the PO service back to V2 and the dashboard card's entity set to `A_PurchaseOrder`. Documented in `.env.example` as kept for ONE release (until 2702). | CCC PR-3 §1. A tenant whose SAP_COM_0053 arrangement does not expose the V4 service yet can stay on V2 without a code change; S4_TDD's flag does not flip the private-cloud product. |
| 3 | **`SapServiceDefinition` gains `protocol`, `hubApiId`, `lifecycle`, `authorisationNote`** (all optional). `serviceApiId()` = `hubApiId ?? pathToApiId(path)`; the seed and hub-content routes use it, and the seed writes `apiType` from `protocol`. | Without it the V4 service would have been seeded as `externalId "0001", apiType ODATAV2`. |
| 4 | **`KNOWN_V4_SERVICE_PATHS`** (verified bindings only, with source) consulted before `deriveV4Path`; the resulting definition carries `protocol` + `hubApiId`. | The catalogue row for CE_PURCHASEORDER_0001 now probes the real path — and it is the same path as the curated definition, so `mergeProbeTargets` dedupes them. |
| 5 | **Rows strip `@odata.*` keys** as they already stripped `__metadata`. | Preview `fields` for V4 are the same business properties V2 shows (parity test). |
| 6 | **Attachments** definition carries the 2608 authorisation note; `probeService` copies `note` and `protocol` onto its rows; the Tenant Capabilities panel renders the note under the service and "· OData V4" on V4 rows. | CCC PR-3 §3: a 403 after the tenant's upgrade must read as "the communication user needs the new authorisations", not "not activated". The re-test itself is not possible from here (no credentials). |
| 7 | **`scripts/po-v4-parity.ts`** (`pnpm sap:tdd:po-parity`, `--json`): discover / probe / preview on V2 and V4 side by side against the configured tenant; write is reported as guard state only, never executed. Exit 2 without a tenant. | CCC PR-3 §2 asks for parity against the TDD tenant; the tool is checked in so the run can happen where the credentials are. |
| 8 | **Write path unchanged.** Same admin + confirmation phrase + `WRITE_SECRET` + `WRITE_ENABLED` guard; `createSapEntitySetRecord` is exercised against the V4 service only in the unit test with a stubbed fetch. | "Write stays fail-closed" — verified by the real guard functions with an empty env. |
| 9 | No schema change, no data write. | Drift gate: no difference; `migrate deploy`: nothing pending; Hub RECON unchanged, GREEN. |

### What landed

- `src/lib/sap-public/tdd-connector.ts` — `SapODataProtocol`, `SapServiceLifecycle`,
  extended `SapServiceDefinition`, `PO_SERVICE_V4`, `PO_SERVICE_V2_LEGACY`,
  `isLegacyPoV2Enabled`, `getSapServices`, `getSapOperations`, flag-aware
  `getSapService`, `@odata.*` stripping; PO card entity set `PurchaseOrder`;
  attachments `authorisationNote`.
- `src/lib/sap-public/hub-content.ts` — `KNOWN_V4_SERVICE_PATHS`, `serviceApiId`,
  `hubApiToService` protocol/hubApiId. `capability-probe.ts` — `protocol`/`note`
  on rows. `SapCapabilityPanel.tsx` — note + V4 marker.
- Routes: catalog (services via `getSapServices`, emits `protocol`/`lifecycle`/`note`),
  capabilities, operations (`getSapOperations`), hub-content (`serviceApiId`
  probe keys), seed (`serviceApiId` + protocol-derived `apiType`);
  `connection-health.resolveProbePath`; `scripts/probe-tenant-capabilities.ts`.
- `scripts/po-v4-parity.ts` + `sap:tdd:po-parity`; `.env.example`
  `S4_TDD_PO_ODATA_V2`; `inspect-s4-public-service.ts` header points at the V4 path.
- Tests: `tests/unit/lib/sap-public/po-v4-connector.test.ts` (14): V4 by default,
  flag semantics (literal "true", per prefix, only the PO service and its card
  swap, registry untouched), `serviceApiId`, verified V4 binding vs derived
  guess, and parity with a stubbed SAP — discover (URLs, entity sets, flavor
  v2 vs v4-best-effort, read/write, un-annotated V4 set stays null), probe
  (same status/count/business keys, no `@odata.*`), preview (identical rows,
  fields, nextLink from `__next` and `@odata.nextLink`), write (CSRF fetch at
  the V4 root, POST to `…/0001/PurchaseOrder` with token + cookie), fail-closed
  with empty env, and `probeService` carrying `protocol`/`note`. Route mocks
  gained `getSapServices`.

### Gates (this session)

- `tsc --noEmit --strict`: clean. `eslint --max-warnings 0`: clean on every
  touched file.
- `vitest run`: 329 files, 4,879 tests, all passing (118 s) — net +14 (the new
  parity file); vendor-term guard, consultant wall and D1 guard included.
- `scripts/check-migration-drift.sh`: "No difference detected"; `prisma migrate
  deploy`: nothing pending. `pnpm sap:hub:recon-2608`: GREEN.
- `next build`: compiled, 109/109 static pages, exit 0.
- `pnpm sap:tdd:po-parity` without credentials: "No tenant configured for
  S4_TDD", exit 2 — as designed.

### What was NOT verified

1. **Nothing was run against the TDD tenant.** No `S4_TDD_*` credentials are
   present here, so discover / probe / preview parity is proven against
   recorded response shapes in unit tests, not against SAP. Run
   `pnpm sap:tdd:po-parity` where the credentials live; the table it prints
   is the CCC PR-3 §2 evidence.
2. **The V4 entity-set name `PurchaseOrder` and the binding
   `api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001`** come from the CCC
   note and SAP's API reference, not from a `$metadata` this repo fetched (the
   Hub's resource download requires login). If the tenant disagrees, the
   dashboard card reports its HTTP status honestly rather than showing data.
3. **`API_CV_ATTACHMENT_SRV` was not re-tested.** The authorisation note is
   recorded on the definition and shown on the probe row; the re-test needs the
   tenant after its 2608 upgrade.
4. **Stored connections without an `apiPath`** are now health-probed with the
   V4 PO path (first curated service). A tenant without the V4 service in its
   arrangement will report that probe as not found; set the connection's
   `apiPath` or the legacy flag.
5. The `resolveHubService` catalogue fallback still resolves
   `API_PURCHASEORDER_PROCESS_SRV` to its V2 path on request — an explicit
   spot-read of a deprecated service is allowed and badged DEPRECATED (WS3).

---

## WS3 — Deprecation surfaced in /sap-explorer (2026-09-05)

**Branch:** `feat/hub-deprecation-ui` (from `main` at the WS2 squash merge, #235).
**Instruction:** master prompt WS3 = CCC PR-2: a tenant-independent `DEPRECATED`
badge (grey-red) with tooltip "Deprecated by SAP — successor: <name>" from the
checked-in successor map; coverage tiles headline itemCount and show "of which
N deprecated"; "Probe all" skips DEPRECATED unless `includeDeprecated=true`;
deprecated never counts as ACTIVATED in the summary chips; placeholder tiles
read "Not loaded · N published (2608)" with the 2608 figures.

### What the code map established first

- Every status consumer (scorecard pills, facet tabs, `byStatus`, `idsByStatus`,
  the legend, the glossary) enumerated the seven buckets by hand, so an eighth
  bucket added in one place would silently vanish from the others — the exact
  defect the scorecard's "every bucket" test documents having shipped twice.
- `resolveHubStatus` is the single classifier the list route, the detail route
  and the probe overlay all call. Putting the deprecation rule there, ahead of
  the probe outcome, is what makes "deprecated never ACTIVATED" true in every
  view at once instead of per view.
- `S4_PUBLIC_PUBLISHED_COUNTS` still carried the 2026-07 snapshot (862 / 151 /
  8,983 / 1,665 / 77 / 0 / 43), and the tiles labelled it "indicative, not
  pinned to a release". The WS2 package list gives release-pinned figures.

### Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **`DEPRECATED` is an eighth `HubStatus`**, resolved by `resolveHubStatus` from `hubState` BEFORE any probe outcome, for every content type. | One mechanism, tenant-independent, so a deprecated API that still answers 200 on the tenant is DEPRECATED — never ACTIVATED — in the list, the detail, the scorecard and `byStatus`; the sum of the pills stays the browsable total. |
| 2 | **`HUB_STATUSES` is the one display-order list**; `emptyByStatus()`, `idsByStatus`, the client's `byStatus` default, the facet tabs and the scorecard iterate it. | Adding the bucket in eight hand-written places is how the last two omissions shipped. The client merges its default over the server payload, so an older payload without the key still renders. |
| 3 | **Badge + tooltip**: `StatusBadge` gains the `DEPRECATED` tone (`--status-revoked-*` tokens, label "Deprecated") and an optional `tip`; the row passes `deprecationTooltip(successorExternalId)` — "Deprecated by SAP — successor: X", or "…no successor named yet". | The wording from CCC PR-2 §1 verbatim, and an honest fallback for the 50 of 56 deprecated APIs with no recorded successor — the tooltip never invents one. |
| 4 | **Successor on the row**: the list and detail routes emit `hubState`, `hubVersion`, `successorExternalId` (column first, then `successorFor()` from `sap-references/api-successors.json`). The detail panel shows the same sentence as a revoked-tone note. | The map is the only source of successors (the anonymous feed has none — WS2 finding 3); the column wins when a logged-in export ever provides one. |
| 5 | **Tiles**: `byTypeDeprecated` (itemCount-weighted, same arithmetic as `byTypeItems`) → a loaded tile reads "loaded · runtime · of which N deprecated"; an empty tile reads "Not loaded · N published (2608)" from `S4_PUBLIC_PUBLISHED_COUNTS` at `S4_PUBLIC_PUBLISHED_RELEASE = "2608"`. | CCC PR-2 §2 and §4. The headline stays the full item count — deprecated rows are IN it, not subtracted — so the tile and the status facets reconcile. |
| 6 | **2608 published counts**: API 859 · EVENT 147 · CDS 9,288 · BAdI 1,715 · BO 221 · INTEGRATION 158 · BUILD 91 · PROCESS_BLUEPRINT 16 · LIVEPROCESS 41 · SCENARIO 308 · VPUC 5 · ANALYTICS 6; `S4_PUBLIC_PUBLISHED_DEPRECATED` API 56 · EVENT 8 · CDS 424 · BAdI 24 as a drift reference. | The first seven reproduce from the checked-in package list (RECON gates); INTEGRATION / BUILD / VPUC / ANALYTICS / PROCESS_BLUEPRINT are the logged-in product page (CCC note), recorded as such in the source comment. PROCESS_BLUEPRINT is therefore no longer "n/a by design" — its `NA_NOTE` is retired (mechanism kept). |
| 7 | **Probe-all** excludes `hubState = 'DEPRECATED'` from its `where` unless the body carries the literal boolean `includeDeprecated: true`; the response echoes the flag. | CCC PR-2 §3. Probing retired services spends the run and would write ACTIVATED-looking probes; opting in stays explicit. |
| 8 | **Glossary** entry `status-deprecated` (tap-to-define on the badge) and the catalogue-health note now cite release 2608 (`publishedRelease` added to its `reference` block). | The catalogue must always display the SAP content release it grounds on (CCC invariant). |
| 9 | **No schema change, no data write.** WS3 reads the WS2 columns only. | Migration-drift gate: "No difference detected"; `prisma migrate deploy`: nothing pending. |

### What landed

- `src/lib/sap-public/hub-content.ts` — `HubStatus` + `DEPRECATED`, `HUB_STATUSES`,
  `deprecationTooltip`, `HubItemForStatus.hubState`, `resolveHubStatus` rule,
  `S4_PUBLIC_PUBLISHED_RELEASE`, 2608 `S4_PUBLIC_PUBLISHED_COUNTS`,
  `S4_PUBLIC_PUBLISHED_DEPRECATED`.
- `src/app/api/sap/tdd/hub-content/route.ts` — `hubState` read on the
  classification set; `byTypeDeprecated` in `counts`; rows carry `hubState`,
  `hubVersion`, `successorExternalId`. `…/[id]/route.ts` — same three fields,
  status resolved with `hubState`. `…/probe-all/route.ts` — `includeDeprecated`.
- `src/components/sap/SapCapabilityCatalogue.tsx` — "Deprecated" facet, badge
  tooltip, row hint ("deprecated by SAP — build on the successor, not on this"),
  legend swatch, `deprecated` pill, `byTypeDeprecated` to the tiles.
  `capability/StatusBadge.tsx`, `capability/ReadinessScorecard.tsx` (eight
  pills, "These eight add up to"), `capability/ContentTypeTiles.tsx`,
  `capability/CapabilityDetail.tsx` (deprecation note).
- `src/constants/sap-glossary.ts` — `status-deprecated`;
  `src/app/api/ops/catalogue-health/route.ts` — 2608 note + `publishedRelease`.
- Tests: net +10 (4,855 → 4,865). New: `resolveHubStatus` DEPRECATED wins over
  every probe outcome and type, other states leave the bucket untouched,
  `deprecationTooltip` / `HUB_STATUSES` shape; list route classifies a stored-200
  deprecated row as DEPRECATED (byStatus sums to the set, `byTypeDeprecated`),
  probe-all `where.NOT` with and without the flag (a string `"true"` stays
  opted out); tiles "of which 56 deprecated", no clause at 0, never on an empty
  tile, "147 published (2608)", Process Blueprints as a real type; scorecard
  eight buckets (139+349+151+7+11+515+819+24 = 2,015) and the badge tooltip;
  catalogue client renders a DEPRECATED row's badge/tooltip from an older
  payload lacking the key. Updated: the WS2 invariance test now asserts
  DEPRECATED → "DEPRECATED" for all 12 types × 4 protocols × 4 outcomes and
  ACTIVE/null invariance; "probed 200 stays ACTIVATED for a DEPRECATED API"
  flipped to DEPRECATED by design.

### Gates (this session)

- `tsc --noEmit --strict`: clean. `eslint --max-warnings 0 .`: clean.
- `vitest run`: 328 files, 4,865 tests, all passing (124 s) — includes the
  product-agnostic vendor-term guard, the consultant wall and the D1 guard.
- `scripts/check-migration-drift.sh`: "No difference detected"; `prisma migrate
  deploy`: "No pending migrations to apply".
- `pnpm sap:hub:recon-2608`: **GREEN** — unchanged from WS2 (859 / 56 / 147 / 8 /
  9,288 / 1,715 / 221 / 16 / 6 OK; Integration 142, Build 29, VPUC 0 INFO).
- `next build`: compiled, all static pages generated, exit 0.

### Observed on the local database (hub-wide import from WS2, not the deployed one)

```
contentType   rows   items  deprecated rows  successor recorded
EVENT          496      —        10                0
BADI          3216   3380        28                0
BO_INTERFACE   479    207         8                0
SapApiReference · SAPS4HANACloud @ 2608: 56 DEPRECATED, 6 with a successor
```

So on this database the tiles read "of which 10 / 28 / 8 deprecated" for
Events / BAdIs / BO interfaces and the six mapped APIs get a named successor;
the other 50 deprecated APIs get "no successor named yet".

### What was NOT verified

1. **The deployed Vercel database was not touched or read.** The counts above
   are the local Postgres after the WS2 imports; the product-scoped "Events
   147 (8 deprecated)" of CCC PR-2 §2 is asserted by the RECON on the files and
   by unit tests on the route arithmetic, not by a rendered page against prod
   data. That needs the admin Rebuild on the deployment after merge.
2. **No browser run.** The badge, tooltip, facet, pills, tiles and detail note
   are verified by Testing Library (jsdom) and `next build`, not visually; the
   E2E Smoke / Visual Regression checks on the PR are the first render.
3. **Successors remain the six checked-in pairs.** 50 of 56 deprecated APIs
   show the honest fallback. The tooltip never infers a successor.
4. **`hub-artifact-counts.json` still not regenerated** (catalogue-health's
   `artifactCountsProvenance()` still reads it); the tiles no longer depend on
   it. Retire or regenerate when the health page is next touched.
5. INTEGRATION 158 · BUILD 91 · VPUC 5 · ANALYTICS 6 · PROCESS_BLUEPRINT 16 are
   the logged-in product page's figures (CCC note), not reproduced anonymously
   (142 / 29 / 0 / 6 / 16 exact-tag packages) — the source comment says so.

---

## WS2 — Hub loader: State / Version / Successors (2026-09-05)

**Branch:** `feat/hub-2608-state` (from `main` at the WS1 squash merge, #234).
**Instruction:** master prompt WS2 = CCC PR-1: persist per Hub artefact State,
Version, ModifiedAt, SubType and the package Version as `catalogueRelease`;
enumerate packages from a checked-in list; RECON counts by type/state (fail if
APIs ≠ 859 ±5 or deprecated < 50); unit tests for the State mapping; `byStatus`
sums unchanged for ACTIVATED / NEEDS_SETUP rows.

### What the live probe and the code map established first

- The anonymous `catalog.svc` answers from this container (HTTP 200, through
  the sandbox proxy; Node's fetch reaches it unaided). Package
  `SAPS4HANACloud` is at Version **2608**, ModifiedAt 2026-07-15, and its
  artefacts carry `State`, `Version`, `SubType`, `ModifiedAt` — **no Successors
  field**, so successors stay a checked-in map.
- The `substringof('SAPS4HANACloud',Products)` filter the CCC note says to stop
  using **does not exist in the code**: the harvest already walked all 1,949
  packages and tagged by product. What did exist was a real defect: artefacts
  were read with a single `$top=500` page, so the committed catalogue held 500
  of SAPS4HANACloud's 859 APIs and 1,000 of 3,214 BAdIs, and nothing said so.
- Package `Category` (APIs, Events, CDSViews, SteamPunk = BAdIs + BO
  interfaces, Integration, Build, Scenarios, LiveProcess, Analytics) is SAP's
  own classification and is what the product page's tiles group by.

### Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Additive migration `20260905020000_hub_artifact_state_version`**: `SapHubContent` and `SapApiReference` gain `hubState`, `hubVersion`, `hubModifiedAt`, `hubSubType`, `catalogueRelease`, `successorExternalId` (all nullable, indexed on state and release). `status` / `apiType` untouched. | The console's buckets read `status`, `apiType` and probes; new columns beside them cannot move a bucket. Existing rows keep NULLs until re-imported. |
| 2 | **`sap-references/hub-packages.s4public.json`** — the named S/4HANA Cloud Public package set, generated by `scripts/discover-hub-packages.ts` (anonymous `ContentPackages` paged by `$skip`, exact `Products` tag `SAPS4HANACloud`, artefacts tallied by Type and State, provenance). 235 packages. | CCC PR-1 §2: a list a reviewer can read and diff. It is the recon's first source and the harvest reads it FIRST, so the product set is complete in every run. |
| 3 | **Harvest fixed and extended**: every artefact page is read (`$skip` until a short page); `$select` adds `ModifiedAt`; rows gain `hubState`, `hubVersion`, `hubModifiedAt`, `hubSubType`, `catalogueRelease` (owning package Version); old keys (`status`, `version`, `apiType`) kept for compatibility; provenance records the package list and the paging rule. Re-harvested 2026-09-05: 1,963 packages, 5,419 APIs hub-wide (was 4,598). | The 859 gate is meaningless on a 500-row truncation. The hub-wide walk stays (edition tagging for Private / on-prem needs it); the product list guarantees completeness where it matters. |
| 4 | **`catalogueRelease` is the owning package's Version, per CCC** — so BYD (217 APIs) and S4HANACloudABAPPlatform (17) also read "2608". Every gate that says "859" therefore scopes by package (`packageId` / `packageIds` in the row), in files and in the database alike. | A package version is not a product release; conflating them would have passed a 1,093 as 859 or failed a correct load. |
| 5 | **Normalisers + all four writers** (`import-sap-hub-content.ts`, `import-sap-api-catalog.ts`, the admin Rebuild and harvest-import routes) persist the lifecycle fields through one helper each (`hubLifecycleFields`, `apiLifecycleFields`); `rawMetadataJson.release` now carries the package release instead of a hard-coded null. `hubState` falls back to `state`/`status`, upper-cased; curated drop rows without the keys get NULLs, never guesses. | One shape, four writers, no drift between them. |
| 6 | **`sap-references/api-successors.json`** — SAP-named successors only (PO, PR, three deliveries, maintenance order; SAP_COM_0563 → 0A93/0A95/0A96; SAP_COM_0882 new; API_CV_ATTACHMENT auth change), with sources. `hub-successors.ts` is its one reader; importers stamp `successorExternalId` from it and never infer from names. | The Hub exposes no Successors anonymously; the CCC's "extend from Hub Successors" waits for a logged-in export. WS3 renders the badge. |
| 7 | **`scripts/recon-hub-2608.ts`** — packages, harvest files and (`--db`) database against the facts: hard gates on 859 ±5 / ≥ 50 deprecated / 147 events; ±1 % on CDS 9,288, BAdI 1,715, BO 221, Scenarios 16, Analytics 6; informational where the product page counts a logged-in view (Integration 158 vs 142 exact-tag packages, Build 91 vs 29, VPUC 5 vs 0 anonymously). | Gate only what the anonymous catalogue can prove; name the rest as a floor rather than pretend. |
| 8 | **Not touched:** `S4_PUBLIC_PUBLISHED_COUNTS` (the tile numbers), the DEPRECATED badge and successor tooltip, `hub-artifact-counts.json`. | CCC PR-2 / WS3 owns the tiles and badges; the counts file is superseded for S/4 Public by the package list's `byCategory` and is left for WS3 to retire or regenerate. `SapHubContent` is deliberately NOT added to the content-release read scope (WS1) — Hub rows have no 2602/2608 duality. |

### Evidence

- Migration gates (local Postgres 16): drift check "No difference detected";
  `migrate deploy` clean.
- Discovery: 235 packages, 9 categories; byCategory APIs 909 (7 packages;
  850 active / 3 beta / 56 deprecated), Events 147 (139/8), CDSViews 9,288
  (8,864 released / 424 deprecated), SteamPunk 1,936 (BAdI 1,715 + BO 221),
  Scenarios 16 packages / 308, Analytics 6 packages, Integration 142 / 1,103,
  Build 29 / 565, LiveProcess 14 / 41.
- Harvest: SAPS4HANACloud 859 APIs = 803 ACTIVE / 56 DEPRECATED; ODATAV4 365
  (342+23), ODATA 205 (188+17), SOAP 289 (273+16) — the CCC split exactly.
- Imports on the local DB: 5,419 `SapApiReference` rows; `SapHubContent` per
  type EVENT 652, BADI 3,216, BO_INTERFACE 700, INTEGRATION 4,665, SCENARIO
  1,043 (+ curated types); PO API row = DEPRECATED → CE_PURCHASEORDER_0001;
  6 deprecated APIs carry successors.
- Tests: +14 (`tests/unit/sap/hub-lifecycle-2608.test.ts`: lifecycle mapping,
  `/Date()/` parsing, successor lookup and non-inference, `resolveHubStatus`
  invariant across hubState for all 12 types × 4 protocols × 4 probe outcomes,
  package-list facts); all 388 existing Hub / import / explorer tests green
  against the regenerated files; `tsc --strict` and `eslint --max-warnings 0`
  clean. Full `vitest run`: 328 files, 4,855 tests, all passing (122 s). `next build`: compiled, 109/109 static pages, exit 0.

### RECON output (files + database)

```
RECON hub 2608 — sap-references/hub-packages.s4public.json · sap-references/api-hub-catalog.json · sap-references/hub-harvest/ · database
  OK   packages · SAPS4HANACloud version                                          expected           2608  observed 2608
  OK   packages · APIs in SAPS4HANACloud                                          expected         859 ±5  observed 859
  OK   packages · …of which DEPRECATED                                            expected      56 (≥ 50)  observed 56
  OK   packages · …of which ACTIVE                                                expected            803  observed 803
  OK   packages · events in SAPS4HANACloudBusinessEvents                          expected            147  observed 147
  OK   packages · events DEPRECATED                                               expected              8  observed 8
  OK   packages · CDS views (Category CDSViews)                                   expected           9288  observed 9288
  OK   packages · BAdIs (SteamPunk · BADI)                                        expected           1715  observed 1715
  OK   packages · BO interfaces (SteamPunk · BOInterface)                         expected            221  observed 221
  OK   packages · Process Blueprints (Category Scenarios packages)                expected             16  observed 16
  OK   packages · Analytics packages                                              expected              6  observed 6
  INFO packages · Integration packages (product page 158)                         expected            158  observed 142
  INFO packages · Build packages (product page 91)                                expected             91  observed 29
  INFO packages · LiveProcess packages                                            expected            n/a  observed 14
  INFO packages · VPUC (product page 5)                                           expected              5  observed 0
  OK   harvest · APIs in SAPS4HANACloud (api-hub-catalog.json)                    expected         859 ±5  observed 859
  OK   harvest · …DEPRECATED (hubState)                                           expected      56 (≥ 50)  observed 56
  OK   harvest · …ODATAV4                                                         expected            365  observed 365
  OK   harvest · …ODATA                                                           expected            205  observed 205
  OK   harvest · …SOAP                                                            expected            289  observed 289
  OK   harvest · …catalogueRelease = 2608                                         expected            859  observed 859
  OK   harvest · …hubModifiedAt present                                           expected            859  observed 859
  OK   harvest · events in SAPS4HANACloudBusinessEvents (hub-harvest/EVENT.json)  expected            147  observed 147
  OK   harvest · …events DEPRECATED                                               expected              8  observed 8
  OK   harvest · BAdIs at release 2608                                            expected           1715  observed 1715
  OK   harvest · BO interfaces at release 2608                                    expected            221  observed 221
  OK   db · SapApiReference in SAPS4HANACloud at 2608                             expected         859 ±5  observed 859
  INFO db · SapApiReference at catalogueRelease 2608 (all packages at 2608)       expected          ≥ 859  observed 1093
  OK   db · …hubState DEPRECATED                                                  expected      56 (≥ 50)  observed 56
  OK   db · deprecated APIs carrying a SAP-named successor                        expected            ≥ 1  observed 6
  OK   db · API_PURCHASEORDER_PROCESS_SRV                                         expected DEPRECATED → CE_PURCHASEORDER_0001  observed DEPRECATED → CE_PURCHASEORDER_0001
  OK   db · SapHubContent EVENT at 2608                                           expected            147  observed 147
  OK   db · …events DEPRECATED                                                    expected              8  observed 8
  OK   db · SapHubContent BADI at 2608                                            expected           1715  observed 1715
  OK   db · SapHubContent BO_INTERFACE at 2608                                    expected            221  observed 221
  · package list: 235 packages tagged SAPS4HANACloud out of 1963 scanned · harvested 2026-09-05
  · Integration/Build/VPUC: the product page counts a logged-in view (associated packages included); the anonymous exact-tag enumeration is a floor — informational, not gated
  · harvest: 5419 APIs hub-wide from 1963 packages · harvested 2026-09-05 · paging: every page (500 per request, $skip until short page)
  result:    GREEN — Hub catalogue matches the 2608 facts
```

### Findings

1. **The July catalogue was truncated**, not just stale: 500 of 859 S/4 Public
   APIs, 1,000 of 3,214 BAdIs, 12,100 of 19,122 CDS views hub-wide. Fixed by
   paging; the counts in `hub-artifact-counts.json` are therefore superseded.
2. **Product-page tallies for Integration (158), Build (91) and VPUC (5) do not
   reproduce anonymously** (142 / 29 / 0 exact-tag packages). They count a
   logged-in view; recorded as informational, not gated.
3. **Successors are not in the anonymous feed.** Six SAP-named pairs are checked
   in; 50 of the 56 deprecated APIs have no recorded successor yet.

### What was NOT done / left for later workstreams

1. Tiles (`S4_PUBLIC_PUBLISHED_COUNTS`), the DEPRECATED badge with successor
   tooltip, "Probe all skips DEPRECATED" — WS3 (CCC PR-2).
2. `hub-artifact-counts.json` not regenerated (its method differs); retire or
   regenerate in WS3 when the tiles move to the package list.
3. Neither the deployed Vercel database nor the admin Rebuild endpoint was run;
   the imports were exercised on the local Postgres only.
4. The 943 "All APIs" product view needs `AssociatedPackages`, which redirects
   to login anonymously — unverifiable from here.

---

## WS1 — Scope, SSCUI, Process-Steps at 2608 (2026-09-05)

**Branch:** `feat/scope-2608` (from `main` at the WS0 squash merge, #233).
**Instruction:** master prompt WS1 = CCC PR-4, plus: Retired sheet → RETIRED,
What's New deprecation list → DEPRECATION_PLANNED + successor, 1NN → ANOMALY if
in Process-Steps but not A&D, and re-validate the D1 shorthand SSCUI citations
against real 2608 IDs.

### The design question WS1 had to answer first

Most reads of `ScopeItem`, `ProcessStep` and `ConfigActivity` in `src/` are
catalogue-wide (40 of 46 scope-item call sites carry no `catalogVersionId`).
Loading 2608 rows into the same tables — which is what WS0's `releaseId` FKs
are for — would have shown a 2602 user J60 twice and doubled the admin
counts. Two options: scope ~90 call sites by hand, or scope once on the live
client. **Chosen: one rule on the client**, next to the existing tenant guard.

### Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **`ScopeCatalogVersion` PUBLIC/2608 is created INACTIVE** and linked to the 2608 `SapContentRelease`. | AD-3: parallel rows, never mutate 2602. `isActive` is what makes a version the default for new assessments and lists it in the picker; nothing in the repo could flip 2602 off, so 2608 must not claim the default by accident. WS7 flips it. |
| 2 | **`ScopeItem` gains lifecycle + A&D columns** (additive migration `20260905010000`): `lifecycleStatus` (default ACTIVE, so every 2602 row is unchanged), `successorScopeCodes[]`, `lifecycleNote`, `provisioning`, `availableInMy`, `myAvailableSince`, `lobs[]`, `businessAreas[]`, `requiredScopeCodes[]`, `sapComponent`, `licenseRequired`. | The statuses the prompt asks for need a column; A&D's per-item facts (MY availability, provisioning, multi-LOB membership) are what WS6's to-be pack and the neutral library will read. |
| 3 | **New `SapProcessStep` table** for the Process-Steps master (release-scoped, cascade on release). `AffirmProcessFlow`/`AffirmProcessStep` untouched. | `AffirmProcessFlow` is keyed one row per scope item — it cannot hold two releases. The master is the SOURCE the MY flows are cut from; WS5 re-derives them from it. `ProcessStep` (BPD test-case steps) is a different artefact. |
| 4 | **Content-release scoping as a Prisma extension** (`src/lib/db/content-release-scope.ts`, attached inside the tenant guard in `lib/db/prisma.ts`): a read of a scoped model that names neither `releaseId` nor `catalogVersionId` sees only the active release. 2602 = `releaseId IS NULL OR release = "2602"`; other releases by relation filter. Writes, unique lookups and other models untouched. | One rule that cannot be forgotten, resolved per query, so `SAP_CONTENT_RELEASE` flips every footer and every catalogue read together. Assessments pinned to a catalogue version keep it (AD-3 escape hatch). |
| 5 | **Loaders are header-addressed, gated and idempotent.** `load-2608-scope` (A&D → 822 rows: 670 ACTIVE + 9 DEPRECATION_PLANNED + 6 OBSOLETE + 137 RETIRED + 0 ANOMALY), `load-2608-sscui` (4,328 `ConfigActivity` rows), `load-2608-process-steps` (19,158 `SapProcessStep` rows). Each refuses on a red manifest, deletes and re-creates only its own release's rows, and reports the 2602-era counts it left alone. | The 2602 config loader was positional and the sheet has been re-cut (`2608` vs `<release> S4H Cloud`); by-name columns fail loudly instead of loading the wrong field. |
| 6 | **Lifecycle from files first, list second.** `scope-lifecycle-2608.json` transcribes the assessment's Scope Delta tab (obsolete + deprecation-planned codes with SAP's named successors, with source URL). The loader takes RETIRED from the A&D sheet, OBSOLETE = retired ∩ list, DEPRECATION_PLANNED = A&D ∩ list, ANOMALY = Process-Steps − A&D. It never invents a successor and reports a list entry the files do not support. | The prompt's facts are inputs to check, not truths to write. |
| 7 | **`totalSteps` for 2608 rows = MY-available Process-Steps rows** for the code (not BPD test-case steps as in 2602). `purposeHtml`/`overviewHtml`/`prerequisitesHtml` stay `""`. | A&D carries no narrative text; BPD-derived text exists for 9 items only (WS5). Stated in the loader header. |
| 8 | **SSCUI citations re-validated by script** (`revalidate-sscui-citations-2608`, report `docs/2608/sscui-citation-revalidation.md`). Replaced: the five org-structure ids in the O2C value stream (100222→105970 Maintain Sales Organizations, 100196→106006 Maintain Distribution Channels, 100526→106005 Maintain Divisions, 100221→105866 Maintain Sales Office, 100220→105998 Maintain Sales Group), 103833→103834 (Algorithm Parameters is gone; nearest real activity, flagged in code as "not identical"), and **1IQ d3 → 102494 "Define Reasons for Rejection"** (the 2602 "no sales-scoped SSCUI" finding no longer holds: 102494 lists 1IQ/BD9/BDG). Names refreshed to 2608 wording for 104274/103827. The other D1 placeholders (OM, FW, ATP, CM, DS in BD9/BDG) resolve to 6–12 candidates each and stay frameworks. | Replace only where exactly one real activity answers the citation; the D1 guard test still forbids the shorthand tokens. YAML and the generated TS were edited in step (the emitter depends on the external ft2std-toolkit, not in this repo). |
| 9 | **Naming:** `formatSapProductReleaseLabel()` = "SAP Cloud ERP (SAP S/4HANA Cloud Public Edition) · content release 2608", shown on the admin catalogue version page; inactive versions read "Inactive", not "Deprecated". Hardcoded 2602 copy elsewhere untouched (WS7). | CCC PR-4.4 / WS7.2 — first-mention label; technical names in rows unchanged. |
| 10 | `scripts/verify-data.ts` hard counts scoped to `releaseId: null`. | Its 560 / 102,261 / 4,703 assertions are the 2602 ZIP load; 2608 rows would have broken them. |

### Evidence

- Migration gates (local Postgres 16, same commands as CI): drift check "No
  difference detected"; `migrate deploy` clean; 4 new ScopeItem columns and
  the `SapProcessStep` table present.
- Loaders run against the local DB: scope 822 created / re-run 822 updated, 0
  stale; SSCUI 4,328; Process-Steps 19,158 rows / 661 items; re-runs idempotent.
- `pnpm sap:2608:recon --db` (below): 10 file facts + 9 database facts green.
- Re-validation: 52 numeric citations valid in 2608, 0 missing, 0 renamed; D1
  guard tests and the DecisionCard render test green with the new 1IQ d3 value.
- Unit: 21 → 35 sap-content tests (+ content-release-scope ×7, planner/A&D
  parser ×4); `tsc --noEmit --strict` clean; `eslint . --max-warnings 0` clean.
- Full `vitest run`: 327 files, 4,841 tests, all passing (95 s). `next build`: compiled, 109/109 static pages, exit 0.

### RECON output (this session, files + database)

```
RECON 2608 — sap-references/2608/
  manifest:  sap-references/2608/MANIFEST.json · generated 2026-09-05 · 48 files · 32,789,248 bytes
             sha256 8d910bf77e4ddec525ed7d19edf2aae3b5533af4811098a2067fcc8e1cfda050
  integrity: 48/48 files match sha256+bytes · no unlisted files · no zips
  facts (±1% on counts):
    OK   scope items (A&D distinct IDs)                             expected    679  observed 679
    OK   new-in-2608 scope items present                            expected  13/13  observed 13/13
    OK   obsolete scope items absent                                expected 0 present  observed 0 present
    OK   SSCUI activity IDs (sheet 2608)                            expected   4328  observed 4328
    OK   process-step rows                                          expected  19158  observed 19158
    OK   process-step scope items                                   expected    661  observed 661
    OK   BDC questionnaires (S4H_*, excl. Two-Tier)                 expected     16  observed 16
    OK   new BDC S4H_706 present                                    expected    yes  observed yes
    OK   S4H_1613 Two-Tier questionnaire present                    expected    yes  observed yes
    OK   BPD docx+xlsx pairs (1IQ 1NT 2ET BD9 BDG BDW J45 J59 J60)  expected      9  observed 9
    OK   db · ScopeCatalogVersion PUBLIC/2608                       expected present, inactive  observed present, inactive
    OK   db · scope items ACTIVE + DEPRECATION_PLANNED              expected    679  observed 679
    OK   db · DEPRECATION_PLANNED                                   expected      9  observed 9
    OK   db · OBSOLETE                                              expected      6  observed 6
    OK   db · RETIRED                                               expected    137  observed 137
    OK   db · ANOMALY                                               expected      0  observed 0
    OK   db · ConfigActivity (2608)                                 expected   4328  observed 4328
    OK   db · SapProcessStep rows (2608)                            expected  19158  observed 19158
    OK   db · SapProcessStep scope items (2608)                     expected    661  observed 661
  notes:
    · 1NN is present in BOTH the A&D Scope sheet and Process-Steps — the assessment's '1NN not in A&D' anomaly does not reproduce from these files
    · Process-Steps items not in A&D: 0
    · A&D items without Process-Steps rows: 18
    · A&D "Retired Scope Items" sheet: 143 entries (informational — not a prompt fact)
    · db · 2602-era rows (releaseId null): ScopeItem 0 · ConfigActivity 0 · AffirmProcessStep (MY flows) 0 — the WS1 loaders never write these
  result:    GREEN — drop matches MANIFEST.json and the 2608 facts
```

### Findings

1. **Only 4 of the 13 new 2608 scope items are available for Malaysia** in the
   A&D file (5RP, 83D, 83S, 86C); the other 9 have MY = "No". Loaded ACTIVE with
   `availableInMy = false`; the MY count (623) matches the assessment's Process
   Navigator figure.
2. **1NN is not an anomaly** in these files (WS0 finding stands); the loader's
   generic Process-Steps − A&D check found 0 anomalies.
3. **133 items span several LOB / business-area rows** in A&D; stored as
   `lobs[]` / `businessAreas[]`, with the first pair as `functionalArea`/`subArea`.
4. **18 A&D items have no Process-Steps rows** (679 − 661) → `totalSteps = 0`.

### What was NOT done / left for later workstreams

1. **`ImgActivity`** (8,578 IMG rows) not loaded: no `releaseId` column and no
   reader in `src/`. Add the column in the workstream that first needs it.
2. **The MY process flows the app renders are still 2602** (`AffirmProcessFlow`
   655 / 2,502 steps). WS5 re-derives them from `SapProcessStep`.
3. **The catalogue snapshot fixture** (`tests/fixtures/catalog/scope-items.snapshot.json`)
   is not regenerated: it needs a database with the 2602 load, which this
   container does not have. `snapshot-catalog.ts` will add a `2608` key when
   run; the tests keep asserting the `2602` key.
4. **No Playwright run against a preview** from this container; CI's E2E job
   covers it.
5. **The 2602 `SapContentRelease` row does not exist** (no per-file drop for
   2602); the scoping rule treats `releaseId IS NULL` as 2602, so nothing
   depends on it.

---

## WS0 — data landing + release versioning (2026-09-05, session 2)

**Branch:** `chore/sap-content-2608` (the branch the master prompt names; cut from the
scaffold branch `claude/2608-files-landing-recon-ddezas`, PR #232, which this supersedes)
**Inputs:** `aptus-2608-drop.zip` uploaded into the session and unzipped at the repo
root. It carried `sap-references/2608/` (48 files + `MANIFEST.json`), `docs/2608/`
(the master prompt, `CCC-2608-catalogue-refresh.md`, the currency-assessment
workbook) and a `README-DROP.md` (not committed — its content is this entry).
The two SAP content zips (~170 MB) were deliberately not in the drop and are not
in the repo.

### Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **All 48 files committed, unpacked, under `sap-references/2608/`**, with `.gitignore` carve-outs (`!/sap-references/2608/**`, `!docs/2608/**`, zips under the drop still ignored). | The prompt's WS0.1. The global `*.xlsx/*.xlsm/*.docx` ignores would otherwise have silently dropped every file — the carve-out is what makes the drop reviewable. 32.8 MB. |
| 2 | **`MANIFEST.json` is the file record; `RELEASE.json` is the version record.** The consultant's manifest (file, bytes, sha256, source, downloaded) gained `rows` + per-sheet counts written by recon; `RELEASE.json` holds release `2608` · supersedes `2602` · `MY` · status `LANDED` · the manifest's sha256 · last RECON facts. | Two files, two questions: "which bytes?" and "which release is this and did it verify?". `SapContentRelease.manifestHash` is the same sha256, so the DB row points at the exact manifest. |
| 3 | **`SapContentRelease` model + nullable `releaseId` on 7 tables** (`ScopeItem`, `ProcessStep`, `ConfigActivity` = SSCUI, `AffirmQuestion` = BDC, `AffirmProcessStep` = BPD, `SapHubContent` + `SapApiReference` = Hub artefacts). Optional `catalogVersionId` links a content release to the existing `ScopeCatalogVersion`. Migration `20260905000000_sap_content_release` is additive only (96 lines, no DROP / NOT NULL / backfill). | The prompt's WS0.2, kept additive so the migration-integrity gate and every existing row stay untouched. `ScopeCatalogVersion` already exists as the catalogue axis; a content release is the *file set*, so the two are linked rather than merged. Null `releaseId` = "loaded before release tracking" (2602-era). |
| 4 | **`SAP_CONTENT_RELEASE` flag, default 2602.** `src/lib/sap-content/release.ts` resolves it (unknown values fall back to the default and say so); `scripts/lib/sap-content-sources.ts` maps each release to its files, sheets and header rows; `scripts/seed-sap-content-release.ts` upserts the DB row only after the same integrity check recon runs. | The prompt's WS0.3. Loading rows from the 2608 files is WS1 (scope/SSCUI/steps) and WS5 (BDC/BPD); WS0 makes *where they read from* release-keyed code, not convention. |
| 5 | **Footer "SAP content release 2608 · MY"** (`SapContentReleaseFooter`, server component) mounted in `WorkbenchShell`, `AptusShell`, the `/a` layout and a new `/c` layout. NOT under `/d`. | Every SAP-grounded surface names its release from one function. `/d` is the neutral discovery surface whose vendor-term guard forbids the word "SAP" — that exclusion is by design and tested. |
| 6 | **RECON = integrity + facts, ±1 %.** `scripts/recon-2608.ts` verifies every manifest hash, refuses zips/unlisted files, checks row counts against the manifest, then parses A&D / SSCUI / Process-Steps and checks the prompt's counts. Exit 1 on any finding. | The prompt's WS0.4. The integrity half also runs in CI as `tests/unit/sap-content/manifest-2608.test.ts` (fast: hashes only); the facts half parses three large workbooks and stays in the script. |

### Evidence

- **Hash verification:** 48/48 files match `MANIFEST.json` sha256 + bytes (checked
  before landing, and again by recon and by the unit test after landing).
- **Migration gates (local Postgres 16, same commands as
  `.github/workflows/migration-integrity.yml`):** `scripts/check-migration-drift.sh`
  → "No difference detected", exit 0; `prisma migrate deploy` on an empty DB →
  all migrations applied; the GIN index `SapApiReference_scopeItemCodes_gin_idx`
  still present; 7 `releaseId` columns created.
- **Seed:** `pnpm sap:2608:seed-release --release 2608` → one `SapContentRelease`
  row (2608 · MY · 48 files · manifestHash `8d910bf7…`); re-run idempotent (still
  1 row). `--dry-run` writes nothing. With the flag unset it targets 2602 and
  correctly refuses ("no landed drop").
- **Footer:** rendered under both settings in `tests/unit/sap-content/footer.test.tsx`
  (`data-release="2602"` by default, `"2608"` with the flag).
- **Gates:** `tsc --noEmit --strict` clean · `eslint . --max-warnings 0` clean ·
  Prettier clean on new files · targeted suites green (vendor-term guard, consultant
  wall, curation-drift, catalog-versioning, no-stray-hex ×2, phase11-ux) · new
  suites 14/14 · full `vitest run`: 324 files, 4,827 tests, all passing (143 s).

### RECON output (this session, real drop)

```
RECON 2608 — sap-references/2608/
  manifest:  sap-references/2608/MANIFEST.json · generated 2026-09-05 · 48 files · 32,789,248 bytes
             sha256 8d910bf77e4ddec525ed7d19edf2aae3b5533af4811098a2067fcc8e1cfda050
  integrity: 48/48 files match sha256+bytes · no unlisted files · no zips
  facts (±1% on counts):
    OK   scope items (A&D distinct IDs)                             expected    679  observed 679
    OK   new-in-2608 scope items present                            expected  13/13  observed 13/13
    OK   obsolete scope items absent                                expected 0 present  observed 0 present
    OK   SSCUI activity IDs (sheet 2608)                            expected   4328  observed 4328
    OK   process-step rows                                          expected  19158  observed 19158
    OK   process-step scope items                                   expected    661  observed 661
    OK   BDC questionnaires (S4H_*, excl. Two-Tier)                 expected     16  observed 16
    OK   new BDC S4H_706 present                                    expected    yes  observed yes
    OK   S4H_1613 Two-Tier questionnaire present                    expected    yes  observed yes
    OK   BPD docx+xlsx pairs (1IQ 1NT 2ET BD9 BDG BDW J45 J59 J60)  expected      9  observed 9
  notes:
    · 1NN is present in BOTH the A&D Scope sheet and Process-Steps — the assessment's '1NN not in A&D' anomaly does not reproduce from these files
    · Process-Steps items not in A&D: 0
    · A&D items without Process-Steps rows: 18
    · A&D "Retired Scope Items" sheet: 143 entries (informational — not a prompt fact)
  result:    GREEN — drop matches MANIFEST.json and the 2608 facts
```

### Findings against the prompt's "verified facts"

1. **Every numeric fact reproduces exactly:** 679 scope items, 13 new present, 6
   obsolete absent, 4,328 SSCUI IDs, 19,158 process-step rows over 661 items, 16
   BDC + S4H_1613, 9 BPD pairs.
2. **The "1NN anomaly" does not reproduce.** The prompt and the assessment say 1NN
   is in Process-Steps but not in the A&D Scope sheet. In the landed 2608 A&D file
   1NN is row 3 of `Scope` (Business Event Handling, CA-GTF-FND). Process-Steps
   items not in A&D: **0**. Carried to WS1 as "re-check before flagging ANOMALY".
3. **18 A&D scope items have no Process-Steps rows** (679 − 661). Expected for
   items without a documented flow; informational for WS1.
4. **A&D `Retired Scope Items` sheet has 143 entries** — not a prompt fact, recorded
   for WS1's RETIRED status load.

### What was NOT verified / left for later workstreams

1. **No content rows loaded from the 2608 files.** Scope items, SSCUI, process
   steps, BDC questions and BPD steps are still 2602 data; `releaseId` is null
   everywhere. WS1 and WS5 load them; the flag stays at 2602 until WS7.
2. **Hardcoded "2602" strings on existing pages** (admin stats "SAP Version" tile,
   auth/affirm/discovery copy, `/a` process attribution, `lib/fts/data/*`) are
   untouched — WS7 owns the naming pass. The footer is additive to them.
3. **Playwright smoke on a preview** was not run from the container. `next build`
   (the pre-push hook's gate) WAS run locally after the push: compiled in 106 s,
   109/109 static pages generated, exit 0. CI's Quality Gates job repeats it.
4. **`README-DROP.md`** from the zip was not committed (instructions for the unzip,
   now superseded by this entry and `sap-references/2608/README.md`).
5. **Row counts in `MANIFEST.json` are structural** (`<row>` elements per sheet
   from the OOXML package), so they include header/copyright rows — e.g.
   Process-Steps `Scope` = 19,159 = 19,158 data rows + 1 header. The data-row
   facts are what recon gates on.

---

## WS0 — file landing + recon scaffold (2026-09-05)

**Branch:** `claude/2608-files-landing-recon-ddezas`
**Instruction:** execute WS0 only — read the master prompt
(`CLAUDE-CODE-MASTER-PROMPT-2608-and-tobe-process-pack.md`), the referenced
`CCC-2608-catalogue-refresh.md` and
`aptus-SAP-Inventory-Currency-Assessment-2026-09-05.xlsx`; land the 2608
files from `AB Workbench\2608\` into `sap-references/2608/` (no zips), add
release versioning, write `scripts/recon-2608.ts`, open the PR, record the
session here, stop.

### Inputs — what was and was not reachable

| Input | Location named | Reachable from the build session |
|---|---|---|
| Master prompt `CLAUDE-CODE-MASTER-PROMPT-2608-and-tobe-process-pack.md` | OneDrive `…\Documents\Claude\Projects\aptus\` | **No** |
| `CCC-2608-catalogue-refresh.md` | same folder | **No** |
| `aptus-SAP-Inventory-Currency-Assessment-2026-09-05.xlsx` | same folder | **No** |
| 2608 release files | `AB Workbench\2608\` | **No** |

The session ran in a remote Linux container holding only a fresh clone of the
repository. The OneDrive and AB Workbench paths are on the consultant's Windows
machine and are not mounted. Checked and empty: the container filesystem
(`/mnt/attach`, `/mnt/user-data`), the branch itself (identical to `main` at
`22474b8`), and the connected Google Drive (no file titled 2608, CCC-2608,
Inventory-Currency or AB Workbench). None of the four inputs was read.

**Consequence:** no 2608 file was landed. Nothing was copied, guessed, or
reconstructed from memory — the repo's own rule for `sap-references/`
(`hub-content/README.md`: "never fabricated") applies here too.

### What landed (scaffold only)

- `.gitignore` — carve-out `!/sap-references/2608/` so the drop is committed
  like the other reviewed references, plus `/sap-references/2608/**/*.zip` so
  a zip can never enter the repository by accident.
- `sap-references/2608/RELEASE.json` — the release version record and recon
  baseline: `release` 2608, `releaseVersion` 2608.0, `supersedes` 2602 (the
  current `sapVersion` in `src/constants/config.ts`), `status: PENDING`,
  `files: []`.
- `sap-references/2608/README.md` — landing rules and procedure.
- `scripts/recon-2608.ts` + `pnpm sap:2608:recon` — walks the drop, refuses
  zips, hashes every file (sha256 + bytes), diffs against `RELEASE.json`
  (added / removed / changed / unchanged), exits 1 on any finding, `--write`
  records the on-disk state and flips status to `LANDED`, `--json` for
  machine use.
- this log.

### Verification performed

- `tsc --noEmit` and `tsc --noEmit --strict`: clean for the new script.
- `eslint --max-warnings 0 scripts/recon-2608.ts`: clean. Prettier: clean.
- Fixture run in the scratchpad (not committed): `--write` with a zip present
  is refused; `--write` on two files records both hashes and sets `LANDED`;
  a clean re-run exits 0; changing one file, deleting one and adding one is
  reported as exactly 1 changed / 1 removed / 1 added, exit 1.

### RECON output (this session, real drop)

```
RECON 2608 — release 2608.0 — status PENDING
  drop:      sap-references/2608/
  on disk:   0 file(s), 0 bytes
  manifest:  0 file(s), 0 bytes
  unchanged: 0
  findings:
    ! drop is empty — no 2608 files have been landed
  result:    DRIFT
```

Exit code 1. This is the correct answer for an empty drop and is the state the
PR ships in.

### Unproven / open

1. **The 2608 files themselves.** Not landed. Nobody has verified from inside
   the repo what `AB Workbench\2608\` contains, how many files, or whether any
   are zipped.
2. **The master prompt's own WS0 definition.** Unread. The layout under
   `sap-references/2608/`, the shape of "release versioning" and the expected
   RECON output were chosen to match existing repo conventions
   (`sap-references/*` provenance blocks, `scripts/diff-manifests.ts`,
   `sapVersion: "2602"`), not the prompt. If the prompt prescribes a different
   layout, manifest shape or recon contract, the scaffold must be adjusted
   before the files land.
3. **`CCC-2608-catalogue-refresh.md` and the currency-assessment workbook.**
   Unread. Anything they say about which files are in scope, expected counts,
   or superseded 2602 content is not reflected here.
4. **Release bump policy.** `2608.0 → 2608.1` on re-drop is a proposal in the
   README, not an agreed rule.

### To complete WS0

Run on a machine that can see both the repo clone and the OneDrive folder:

```bash
git fetch origin claude/2608-files-landing-recon-ddezas
git checkout claude/2608-files-landing-recon-ddezas
# copy the UNPACKED contents of "AB Workbench\2608\" into sap-references/2608/
pnpm sap:2608:recon            # expect: added (N), DRIFT, exit 1
pnpm sap:2608:recon --write    # expect: LANDED, OK, exit 0
git add sap-references/2608 && git commit -m "feat(2608): land AB Workbench 2608 drop (WS0)"
git push -u origin claude/2608-files-landing-recon-ddezas
```

Then paste the two RECON outputs into a new entry above this one, alongside
the counts the master prompt or the catalogue-refresh note expects, and close
items 1–3.
