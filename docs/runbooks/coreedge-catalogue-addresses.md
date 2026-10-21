# Runbook: Catalogue addresses and lifecycle data (P0.8)

Roadmap item P0.8 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2). Four defects in the SAP Capability Catalogue that Discover (Studio) and
SAP Operations (`/sap-explorer`) both render:

1. 148 `sap-s4-*` wrapper rows were offered as probeable, with malformed
   addresses, and counted as services with an endpoint.
2. Every non-curated OData V4 address is derived from the Hub id, and the one
   checked against a real system (Purchase Order V4) was wrong. Nothing said so.
3. `hubState` was null on all 954 production API rows, so the 61 APIs SAP marks
   DEPRECATED looked like any other service.
4. SuccessFactors resolved only its three curated keys, never a Hub id.

One new setting, `HUB_LIFECYCLE_ON_DEPLOY` (default `apply`). Nothing here
refuses a call that worked: what changes is what the catalogue says, which rows
Probe all touches, and two things that now resolve or refuse correctly (see
"What users see change").

## What changed, in one paragraph each

**Wrapper rows have no address (1).** `isWrapperApiId` (`sap-s4-*`, any case)
is checked by `catalogueAddress`, the one function that turns a catalogue row
into an address (`src/lib/sap-public/hub-content.ts`). A wrapper row resolves to
no service, is never probeable, and reads `NOT_PROBEABLE` even when an earlier
Probe all stored an outcome for its malformed address. Probe all excludes them
in its query; the list's live overlay never samples them; `getDynamicOdataServices`
(the Tenant Capabilities panel) leaves them out. The "services with an OData
endpoint to probe" figure (`counts.probeableRuntime`, Discover's callable count)
is now counted with the same rule Probe all applies: OData rows with an address,
minus wrappers, minus the deprecated rows Probe all skips. The wrapped id inside
(`CE_RETAILSEASON_0001` in `sap-s4-CE_RETAILSEASON_0001-v1`) is **not** assumed
to be the address: that would be another guess, and none of the 362 wrapped ids
in the committed snapshot appears as a row of its own to check it against.

**A V4 address says whether it is known to be right here (2).** Each catalogue
item now carries `address: { path, protocol, basis, verifiedAt }`. `basis` is
`convention` (OData V2, SAP's fixed `/sap/opu/odata/sap/<apiId>`),
`known-binding` (a V4 binding recorded in `KNOWN_V4_SERVICE_PATHS` with its
source), `derived` (a V4 guess from `deriveV4Path`) or `product-root`
(SuccessFactors). An OData V4 address of either kind reads **address
unverified** until a probe of exactly that address answers 200 on the system on
screen; then **address verified**, with the date. The proof is a
`CatalogueAddressVerification` row, per organization, product and tenant key,
recording the connection and host that answered, when, by whom and how
(`probe-all`, `detail-probe` or `catalogue-overlay`) —
`src/lib/sap-public/catalogue-address-verification.ts`. It stops counting when
the connection, its host or the derived path changes; a later 404 at the same
path removes it; a 401/403/5xx/timeout leaves it. A deployment tenant's proofs
are filed under organization `-deployment-`, as its console-read audit rows
are. Anonymous viewers read no proofs. The scorecard now says how many of the
probeable V4 addresses are still unverified on this system.

**SAP's lifecycle reaches the catalogue (3).** Production had no lifecycle data
because no deployed path ever moved it there: the guided API-reference import
dropped the six lifecycle fields when it wrote `SapApiReference`, and the
Rebuild's projection into `SapHubContent` never copied them. Both are fixed. For
an existing deployment, `scripts/apply-hub-lifecycle.ts` runs in `vercel-build`
after the migrations and stamps state, version, modification date, sub-type,
package release and SAP-named successor onto the API rows that already exist,
from the committed snapshot `sap-references/api-hub-catalog.json` (SAP's
anonymous Business Accelerator Hub catalogue, `https://api.sap.com/odata/1.0/catalog.svc`,
harvested 2026-09-05 per its `_provenance`). Successors come only from
`sap-references/api-successors.json` (SAP-named pairs; the anonymous feed has
no successor field). Every DEPRECATED row now shows, **in the row**, either
"successor: X" or "no successor is recorded; check its api.sap.com page" — the
successor used to appear only in the badge's tooltip. The Deprecated status
facet now filters (it fell back to All).

**SuccessFactors resolves Hub ids (4).** SuccessFactors serves every OData V2
API from the one `/odata/v2` root, and the entity set picks the data. A
SuccessFactors interface, Entity Explorer read or preview named by a Hub id
(`PLTUserManagement`, `RCMCandidate`, …) now resolves to that root
(`basis: product-root`) within SuccessFactors' own product-tag scope. Its V4
and REST APIs still resolve to nothing; their roots are not derivable from a
Hub id. SuccessFactors rows are `NOT_PROBEABLE` in the catalogue — a 200 from
the shared root says nothing about one API — so expanding one no longer probes
`/sap/opu/odata/sap/<id>` on a SuccessFactors host (404 by construction).

## What happens on deploy

1. Migration `20261023020000_catalogue_address_verification` creates the empty
   `CatalogueAddressVerification` table. Additive; the running code neither
   reads nor writes it, so it is safe ahead of the new code. No backfill: no V4
   address has a recorded 200 yet, so every one starts **unverified**.
2. `tsx scripts/apply-hub-lifecycle.ts` stamps lifecycle data. What it writes:
   the six lifecycle columns on `SapApiReference` rows and `SapHubContent` rows
   of type API, matched by id. What it never does: create or delete a row; touch
   titles, editions, `apiType`, `status`, `rawMetadataJson` (every tenant's
   stored probes) or `updatedAt` (Catalogue Health reads it as the import
   time); revert a row already stamped from a later Hub modification; replace a
   recorded successor. One statement per table; a second run changes nothing.
   It reads only the file in the build's checkout — no network.
3. Expected log line, production's first deploy:
   `stamped N SapApiReference and M SapHubContent API rows`. On later deploys
   both are 0 unless the snapshot changed.
4. A failure is logged as `[apply-hub-lifecycle] FAILED, deploy continues` and
   does **not** fail the build: the catalogue then shows what it showed before
   (no lifecycle data). Fix the cause, then run it by hand (below) or redeploy.

## What users see change

- **Discover / SAP Operations:** about 61 S/4 Public APIs move to the
  Deprecated bucket (badge, facet, tile "of which N deprecated"), each with its
  successor line; wrapper rows read "Not probeable"; the callable count drops
  by the wrappers and the deprecated rows (production showed 591; the committed
  S/4 Public snapshot gives 420);
  V4 rows carry an "address unverified" chip until probed.
- **Probe all** skips wrapper rows (148 fewer requests into the tenant) and, as
  before, deprecated rows unless `includeDeprecated: true`. Its confirmation
  dialog's count now matches what it will probe.
- **A Studio interface built on a `sap-s4-*` wrapper id** is now refused by the
  broker, the Test Console and discovery with `SERVICE_UNRESOLVED` (400)
  before any request, instead of reaching SAP at a malformed address and
  getting a 404. It never worked; it now says why.
- **A SuccessFactors catalogue interface** that was refused
  `SERVICE_UNRESOLVED` now resolves to `/odata/v2` and, if every gate passes
  (approved grant, connection binding, entity set), is served. Production has
  no SuccessFactors tenant configured today.

## Operating

```bash
# What the stamp would do (parses the snapshot, writes nothing)
pnpm sap:hub:lifecycle --dry-run
# Apply by hand (DATABASE_URL must point at the target database)
pnpm sap:hub:lifecycle
# Skip it on a deploy (Vercel → Settings → Environment Variables)
HUB_LIFECYCLE_ON_DEPLOY=off
```

`pnpm sap:hub:import` (local) runs the same stamp after importing the per-type
files. The admin "Rebuild from API reference" now carries lifecycle from
`SapApiReference` onto the catalogue rows, and never erases it from a reference
row that has none.

**Refreshing the snapshot.** Re-harvest with `pnpm sap:hub:harvest` (writes
`sap-references/api-hub-catalog.json` with a new `_provenance.harvestedAt`),
review the diff, commit. The next deploy stamps the changes. Rows stamped from
a later Hub modification are never reverted by an older snapshot.

**Recording a successor.** Add the pair to `sap-references/api-successors.json`
with its source (KBA, What's New, the Hub page). Never infer one from a name.
The stamp fills a missing successor on the next deploy; the list and detail also
read the map directly.

**Verifying a V4 address.** Run Probe all on the tenant, or expand the row
(a live detail probe), or load the list with "Confirm data reads". A 200 files
the proof. To see what is recorded:

```sql
SELECT "organizationId", product, "tenantKey", "externalId", "servicePath",
       "verifiedAt", method
FROM "CatalogueAddressVerification"
ORDER BY "verifiedAt" DESC;
```

A wrong V4 address that keeps returning 404 stays unverified; the fix is a
`KNOWN_V4_SERVICE_PATHS` entry with its source (still shown unverified on each
system until probed there).

## Rollback

The code is additive. Rolling back to the previous build leaves the new table
unused and the stamped lifecycle columns in place; the previous code already
reads `hubState` (DEPRECATED badge) and `successorExternalId`, so the
deprecated rows stay marked. To undo the stamp itself (not expected to be
needed): `UPDATE "SapHubContent" SET "hubState" = NULL, ... WHERE "contentType" = 'API'`
and the same on `SapApiReference`, then set `HUB_LIFECYCLE_ON_DEPLOY=off` so the
next deploy does not re-apply it.

## Open decisions

- **Successors for the remaining deprecated APIs.** Of the 61 S/4 Public
  deprecated APIs, 6 have an SAP-named successor in the committed map; 55 show
  "no successor is recorded". SAP's catalogue has a `Successors` field on the
  `APIs` entity set, but it is behind the Hub login (checked 2026-10-20: the
  anonymous `Artifacts` walk the harvester uses carries none). Someone with a
  Hub account must decide whether to export it, or research the pairs by hand,
  and who owns keeping the map current.
- **`DECOMMISSIONED` state.** The stamp records it, but only `DEPRECATED` moves
  a row to the Deprecated bucket. No S/4 Public API is decommissioned in the
  snapshot (10 in other products). Whether decommissioned rows should share the
  bucket, or get their own, is a product decision.
- **Lifecycle for events, BAdIs and BO interfaces.** The harvest files under
  `sap-references/hub-harvest/` carry a Hub state for them (10 deprecated
  events), but the files carry no dated provenance of their own, so they are
  not stamped on deploy. Decide whether to date them and extend the stamp.
- **Wrapper rows' real services.** Whether `sap-s4-<ID>-vN` always wraps the
  service `<ID>` is unverified; if SAP confirms it, the 146 OData wrappers
  could be mapped to that id as a derived (unverified) address.
- **V2 addresses.** The V2 convention misses namespaced services
  (`/sap/opu/odata/<NS>/<ID>`); they are labelled `convention`, not verified.
  Whether V2 should also carry a per-system proof is open.

## Verifying

- `pnpm vitest run tests/unit/sap-public/catalogue-addresses-acceptance.test.ts`
  — the acceptance criteria over the committed S/4 Public catalogue: 0 wrapper
  rows probeable; every DEPRECATED row shows its successor line (it names an
  SAP successor for 6 of the 61 and says "none recorded" for the rest, so the
  roadmap's successor criterion is met only in part; see Open decisions); a V4
  address reads verified only after a recorded 200 at that address on that
  system.
- `TEST_DATABASE_URL=… pnpm vitest run tests/integration/catalogue-lifecycle-and-addresses.test.ts`
  — the stamp and the proof record against real PostgreSQL, and Probe all's
  row query: a row with no recorded lifecycle (`hubState` NULL) is selected,
  and the selection equals the rows the callable count counts.
- After the first production deploy: the build log's `[apply-hub-lifecycle]`
  lines, then Discover → Deprecated facet shows ~61 S/4 Public APIs, each with a
  successor line, and no `sap-s4-*` row reads "Not checked".
