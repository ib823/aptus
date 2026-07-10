# Runbook — SAP API catalogue ingest

How to populate and refresh `SapApiReference`, the cached mirror of the SAP
Business Accelerator Hub (api.sap.com) catalogue. This table grounds the
classifier (`findMatchingApis`) and drives the dynamic OData catalogue used by
the tenant capability probe (`/api/sap/tdd/capabilities`).

**Sanctioned method: file-based import (Path B).** We do **not** scrape/crawl
api.sap.com — that violates SAP's terms. The one automated path we may build
later is **Path C** (OAuth against a BTP service instance), documented at the
bottom and **not yet activated**.

---

## 1. Get the export file (logged-in, manual)

1. Open <https://api.sap.com> in a browser.
2. Sign in with an SAP Universal ID (free) or S-User.
3. Top nav → **APIs** to reach the API catalogue.
4. (Optional) Filter by product, e.g. **SAP S/4HANA Cloud Public Edition**.
5. Export the list:
   - If a **download / export** button is present (usually top-right of the
     catalogue list view), use it and choose CSV or JSON.
   - If not, open browser **DevTools → Network**, re-apply the filter, find the
     catalogue XHR, and **copy the JSON response**. The importer accepts the raw
     OData wire shape (`{ value: [...] }` or `{ d: { results: [...] } }`).
6. Save the file to **`sap-references/api-hub-catalog.json`** (or `.csv`).
   This folder is **gitignored** — the export is data, not source.

### Fields the importer reads (tolerant matching)

Column/field names are matched case-insensitively, ignoring spaces / `_` / `-`.

| Field | Accepted keys | Notes |
|---|---|---|
| API id *(required)* | `apiId`, `Id`, `Name`, `API ID` | unique key; upsert is by this |
| API name | `apiName`, `title`, `name` | falls back to the id |
| Status | `status`, `ReleaseStatus`, `state` | normalized to Released/Beta/Deprecated (else kept verbatim, e.g. `Active`) |
| Product | `productCategory`, `productLine`, `product`, `category` | drives edition tagging (Public/Private/On-Prem) |
| **API type** | `apiType`, `type`, `protocol` | `ODATAV2` / `ODATAV4` / `REST` / `SOAP` / `EVENT` — **authoritative when present** |
| Scope items | `scopeItems`, `ScopeItemIds`, `linkedScopeItems` | upper-cased |
| Comm. scenarios | `communicationScenarios` | the `SAP_COM_xxxx` ids |
| API Hub URL | `apiHubUrl`, `url`, `link` | provenance link |

---

## 2. Run the three scripts

All are idempotent and safe to re-run. From the repo root:

```bash
# a) Import / upsert the export into SapApiReference (upsert by apiId).
pnpm sap:catalog:import
#    IMPORT_FILE=path/to/file.json   pnpm sap:catalog:import   # explicit file
#    IMPORT_DRY_RUN=1                 pnpm sap:catalog:import   # preview, no writes

# b) Backfill apiType + scope codes for rows the file did NOT provide.
#    Both are NON-CLOBBERING: a value the file supplied is never overwritten.
pnpm sap:catalog:refresh-types                       # fills only NULL apiType
pnpm tsx scripts/_backfill-api-scope-codes-heuristic.ts   # fills only empty scopeItemCodes (needs ScopeItem rows)

# c) Report — totals, edition/apiType/scenario counts; exits non-zero if empty.
pnpm sap:catalog:report
```

**Idempotency:** a second `sap:catalog:import` reports `Inserted: 0` and
`Updated: N` — no duplicates (upsert keyed on `apiId`).

**Non-clobber guarantee:** the export's `apiType` and `scopeItemCodes` win.
`refresh-types` only classifies rows still `NULL`; the scope backfill only
touches rows whose `scopeItemCodes` are empty. This lets a richer real export
supersede the heuristics without a re-run wiping its data.

> Note: the scope-code backfill matches API names against the `ScopeItem`
> table, so it only produces links once the scope-item catalogue is seeded. On
> a bare DB it reports `0 matches` — expected, not an error.

---

## 3. Verify

```bash
pnpm sap:catalog:report        # 43 rows for the shipped seed; exit 0
pnpm sap:tdd:capabilities      # probes which OData services the TDD tenant exposes
```

The capability probe needs live `S4_TDD_*` credentials (base URL + auth). With
none configured it prints `No tenant configured for S4_TDD` — that is the
correct, safe behaviour, not a failure.

---

## Path C — OAuth ingest via a BTP service instance (NOT ACTIVATED)

The fully-automated refresh SAP sanctions is the **SAP Business Accelerator Hub
content API**, reached with an OAuth2 client-credentials token from a **BTP
service instance** (the `sappubliccatalog` OAuth server). We have a scaffold at
`scripts/ingest-sap-api-hub-oauth.ts`, but it is **deferred** and must not be
run until real credentials exist.

**Requires (from a BTP subaccount you control):**

- A service instance / key for the API Hub content service, giving:
  - `OAUTH_TOKEN_URL` (the `…authentication.<region>.hana.ondemand.com/oauth/token` endpoint)
  - `CLIENT_ID`, `CLIENT_SECRET`
- Store these as deployment secrets — **never** commit them.

**When activating later:** run Path C to fetch the catalogue, write it to
`sap-references/api-hub-catalog.json`, then run the same three scripts in §2.
Path C replaces the *manual export* step only; the import/backfill/report
pipeline is unchanged.

Until then, **Path B (manual export) is the supported method.**
