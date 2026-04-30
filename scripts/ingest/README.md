# Aptus ingest scripts

This directory holds adapters for ingesting external SAP knowledge into the Aptus DB. Each script is independently runnable.

## SAP Best Practices archives

| Script | Purpose | Status |
|---|---|---|
| `dispatcher.ts` | Detects archive layout, routes to the right adapter | Active |
| `private-adapter.ts` | Parses Private Edition archives (`S4O/Library/...`, `S4HANA{REL}-FPS{N}` filenames) | Active |
| `../ingest-sap-zip.ts` | Parses Public Edition archives (`S4C/Library/...`, `S4CLD{REL}` filenames) | Active (legacy location) |

```bash
# Public 2602 archive
pnpm tsx scripts/ingest-sap-zip.ts path/to/SAP_Best_Practices_for_S4HANA_Cloud_2602.zip

# Private 2025-FPS1 archive (auto-detected)
pnpm tsx scripts/ingest/dispatcher.ts path/to/SAP_Best_Practices_for_S4HANA_Cloud_Private_Edition_2025-FPS1_MY.zip
```

Both adapters are idempotent — re-run with the same archive hash → no-op.

## SAP API Business Hub (Phase 13.6)

### Primary path — file-based importer

```bash
# 1. Get the export (browser, ~5 min)
#    a. Open https://api.sap.com
#    b. Log in with an SAP Universal ID (free at https://accounts.sap.com)
#    c. Browse APIs → filter by Product Line (S/4HANA Cloud, S/4HANA Cloud private edition)
#    d. Export / download the catalog as JSON or CSV
#       (UI varies; if no export button, copy the JSON response from
#        DevTools Network tab while filtering)
#
# 2. Drop the file in sap-references/ (this dir is gitignored)
mkdir -p sap-references
mv ~/Downloads/api-catalog.json sap-references/api-hub-catalog.json

# 3. Import
pnpm tsx ../import-sap-api-catalog.ts

# Optional: dry-run first to see what would be inserted
IMPORT_DRY_RUN=1 IMPORT_VERBOSE=1 pnpm tsx ../import-sap-api-catalog.ts
```

#### Required fields in the export

The importer is tolerant of column-name variants (case-insensitive, ignores spaces / underscores / hyphens). Each row needs at minimum:

| Field | Common header names accepted |
|---|---|
| API ID | `apiId` / `API ID` / `Id` / `Name` (one of these — required) |
| API Name | `apiName` / `API Name` / `title` / `Title` |
| Status | `status` / `Release Status` / `ReleaseStatus` / `state` |
| Product | `productCategory` / `productLine` / `product` (used for edition tagging) |

Optional but improves grounding:

| Field | Used for |
|---|---|
| `description` | Shown in classifier prompt |
| `scopeItems` / `Business Scenarios` / `linkedScopeItems` | Linkage to scope items (drives matching) |
| `communicationScenarios` | Stored for reporting |
| `apiHubUrl` / `url` / `link` | Direct link from the admin UI |

#### Edition tagging rules

The importer reads `productCategory` / `productLine` / `product` (whichever is present) and parses each value with these rules:

| Substring (case-insensitive) | Tags as |
|---|---|
| `private edition` / `private cloud` / `rise with sap` / `s/4hana cloud, private` | `appliesToPrivate = true` |
| `public edition` / `public cloud` / `s/4hana cloud, public` / `multi-tenant` | `appliesToPublic = true` |
| `s/4hana cloud` (with no `private` qualifier) | `appliesToPublic = true` |
| `on premise` / `on-premise` / `on-prem` | `appliesToOnPrem = true` |

A single product field may declare multiple editions, separated by `;` or `|`. Each part is classified independently.

If no edition can be determined from any of the product fields, the API is imported but tagged for **no** edition — it won't surface in the classifier. The importer prints a count of untagged APIs at the end. Re-run with `IMPORT_VERBOSE=1` to see which.

### Deferred — OAuth client_credentials live refresh

`scripts/ingest-sap-api-hub-oauth.ts` is the future "auto-refresh from `api.sap.com` on a cron" path. It needs:
- An SAP BTP service instance for the API Business Accelerator Hub
- `SAP_API_HUB_CLIENT_ID` + `SAP_API_HUB_CLIENT_SECRET` env vars

Not active in this build. See `docs/adr/AD-13-6-sap-api-hub-integration.md` for context.

## Operational tips

- **Dry-runs are free.** Every importer supports `IMPORT_DRY_RUN=1` (or `SAP_API_HUB_DRY_RUN=1` for the OAuth one) — fetches and parses without writing.
- **Re-runs are safe.** All scripts upsert by natural key (apiId for APIs, scopeCode+catalogVersionId for ScopeItems). No duplicates.
- **Failures are recoverable.** Partial runs leave the DB in a usable state (e.g. catalog version row exists with sourceArchiveHash unset → marks it as in-progress). Re-running picks up where the last run left off.
