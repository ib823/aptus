# Runbook — moving to a new SAP content release

SAP cuts a content release twice a year (Feb and Aug) plus feature deliveries
`.1`–`.4`. The current one is **2608**; the next is **2702**, due Feb-2027.

This runbook is the 13 steps from the `Refresh Runbook` tab of
[`docs/2608/aptus-SAP-Inventory-Currency-Assessment-2026-09-05.xlsx`](../2608/aptus-SAP-Inventory-Currency-Assessment-2026-09-05.xlsx),
plus what the 2608 move (`docs/2608/BUILD-LOG.md`, WS0–WS7) taught about doing
it in this repository.

---

## The one thing that will bite you

**A release with no rows is not a fallback — it is an empty product.**

Every read of `ScopeItem`, `ProcessStep` and `ConfigActivity` is narrowed to
the active release by the Prisma extension in
`src/lib/db/content-release-scope.ts`. If the flag names a release the database
has no rows for, those reads return nothing. Not 2602 rows. Nothing. An empty
scope picker, an empty config matrix, reports with no steps — all with a 200
and nothing in the log.

So the order is fixed, and it is not the order that feels natural:

```
land the files  →  load into the database  →  RECON green  →  flip the flag
```

`scripts/assert-content-release-landed.ts` runs in `vercel-build` and fails the
deploy if you get this backwards. Do not route around it; it is the only thing
between a flipped flag and an empty catalogue in front of a client.

---

## Where the release lives in the code

| Thing | Where |
|---|---|
| The active release | `src/lib/sap-content/release.ts` — `resolveSapContentRelease()` |
| Its default | `APP_CONFIG.sapVersion` in `src/constants/config.ts` |
| Per-environment override | `SAP_CONTENT_RELEASE` (`.env.example`) |
| Read scoping | `src/lib/db/content-release-scope.ts` |
| Footer label | `src/components/sap-content/SapContentReleaseFooter.tsx` |
| Deploy guard | `scripts/assert-content-release-landed.ts` (`pnpm sap:2608:assert-landed`) |
| Landed files | `sap-references/<release>/` + `MANIFEST.json` |
| File→loader map | `scripts/lib/sap-content-sources.ts` |

An assessment pinned to a `catalogVersionId` keeps that catalogue version
whatever the flag says. That is the escape hatch for an engagement mid-flight
(AD-3), and it is why the flip does not have to wait for every client.

---

## The 13 steps

Steps 3–5 and 7–8 correspond to workstreams WS2–WS5 in
`docs/2608/CLAUDE-CODE-MASTER-PROMPT-2608-and-tobe-process-pack.md`.

| # | Step | Detail |
|---|---|---|
| 1 | Confirm tenant release | ABeam TDD tenants (X5M/100, X5M/080) › About › the release must read the new one before re-probing |
| 2 | Re-run Probe-all | `/sap-explorer` › Admin › Probe all (tenant-keyed). Expect deltas against the previous probe |
| 3 | Reload Hub content with State + Version | Per package; persist `State` (ACTIVE/DEPRECATED), `Version`, `ModifiedAt`. Source: `https://api.sap.com/odata/1.0/catalog.svc/ContentPackages('<pkg>')/Artifacts?$format=json` |
| 4 | Surface deprecations + successors | Mark deprecated APIs and events; map successors from the `Hub Catalogue Live` tab; badge affected connectors |
| 5 | Migrate connectors off deprecated services | e.g. 2608: `API_PURCHASEORDER_PROCESS_SRV` → `CE_PURCHASEORDER_0001` (OData V4, SAP_COM_0053); regression-test discover/probe/preview/write |
| 6 | Rebuild the Master Scope Mapping | Inputs: `Availability_Dependencies_EN_XX.xlsx`, `SSCUI_List_EN_XX.xlsm`, `BP_CLD_ENTPR_<rel>_Process-Steps_EN_XX.xlsx`, partner zip. Output carries a Change Log |
| 7 | Rebuild curation Layer3 + vendor-neutral flows | Re-run the Layer3 extraction against the new Process-Steps file; regenerate `discovery-library.*.json` + MANIFEST hashes; **tag retired items, never delete them** |
| 8 | Re-run the BPD toolkit | Inputs: the release's BPDs (prefer `.xlsx` — structured); regenerate previews and `src/lib/fts/data/*.ts`; re-run Content Reconciliation |
| 9 | Re-level changed BDC questionnaires | Only the workbooks that changed, plus any new value stream |
| 10 | SAP Activate roadmaps | Road Map Viewer › re-download the Project Schedule accelerators; read the release-restrictions SAP Note |
| 11 | Housekeeping | Delete byte-identical duplicates; archive the previous release's zips and non-MY localisations |
| 12 | Naming in client-facing material | First mention: **"SAP Cloud ERP (SAP S/4HANA Cloud Public Edition)"**; cite the release; keep technical names unchanged in catalogue rows |
| 13 | Schedule the next refresh | Repeat 1–9. The What's New "Deprecated Scope Items" page and the A&D file are the two fastest signals |

---

## How to add release 2702 in Feb-2027

1. **Land the files.** `sap-references/2702/` with a `MANIFEST.json` (filename,
   sha256, rows, source URL, download date). Do not commit the zips. Leave
   `sap-references/2608/` exactly as it is — releases sit beside each other,
   they never overwrite.

2. **Teach the code the release exists.** Add `"2702"` to
   `SAP_CONTENT_RELEASES` in `src/lib/sap-content/release.ts` and its file
   locations to `scripts/lib/sap-content-sources.ts`. Do **not** move
   `APP_CONFIG.sapVersion` yet — that is step 6.

3. **Extend RECON.** Copy `scripts/recon-2608.ts` to `recon-2702.ts` with the
   new release's published counts as its facts. It must fail on >±1% drift, and
   it must fail *before* anything is written.

4. **Load, into a scratch database first.**
   ```bash
   pnpm sap:2702:seed-release
   pnpm sap:2702:load-scope
   pnpm sap:2702:load-sscui
   pnpm sap:2702:load-process-steps
   pnpm sap:2702:load-bdc
   pnpm sap:2702:recon --db      # must be green
   ```
   The loaders are additive and idempotent: they stamp `releaseId` and never
   touch rows belonging to another release.

5. **Load into production, with RECON green there too.** The same commands with
   production `DATABASE_URL`/`DIRECT_DATABASE_URL`. Never write to production
   data without a green RECON — that rule exists because a half-loaded release
   looks exactly like a fully-loaded one until someone opens a scope picker.

6. **Flip.** `APP_CONFIG.sapVersion = "2702"`. Update the tests that pin the
   default (`tests/unit/sap-content/release.test.ts`,
   `tests/unit/sap-content/footer.test.tsx`), and check the copy that names a
   release or a count — `pnpm sap:2608:assert-landed` will confirm the data
   side, but nothing checks prose except reading it.

7. **Leave the previous release selectable.** `SAP_CONTENT_RELEASE=2608` must
   still work for an engagement that has not moved, and assessments pinned to a
   catalogue version keep it regardless.

---

## What the guard says when you get it wrong

```
  SAP CONTENT RELEASE NOT LANDED — refusing to build.

  Active release : 2608 (from the built-in default)
  Rows visible   : ScopeItem 0 · ProcessStep 0 · ConfigActivity 0  ← nothing
  Also in the DB : release 2602 — ScopeItem 853 · ProcessStep 129,481 · ConfigActivity 4,210
```

That is the real state of production as of 2026-09-06: the 2608 loaders have
only ever run against a local database. Until they run against production and
RECON is green there, the flag must stay on a landed release.
