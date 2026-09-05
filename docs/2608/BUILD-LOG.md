# SAP S/4HANA Cloud 2608 — Build Log

Session log for the 2608 catalogue refresh workstreams. Newest entry first.
Each entry records what was asked, what was reachable, what landed, the RECON
output, and what remains unproven — nothing is recorded as done that was not
verified in the session.

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
