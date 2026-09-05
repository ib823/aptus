# SAP S/4HANA Cloud 2608 — Build Log

Session log for the 2608 catalogue refresh workstreams. Newest entry first.
Each entry records what was asked, what was reachable, what landed, the RECON
output, and what remains unproven — nothing is recorded as done that was not
verified in the session.

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
