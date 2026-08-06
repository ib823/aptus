# SAP Business Accelerator Hub — content drop targets

Per-content-type exports that populate the **SAP Capability Catalogue** beyond the
API slice. Each `<TYPE>.json` is a drop target: an array of items for that content
type. They ship **empty (`[]`)** and are populated only from **real, logged-in Hub
exports** — never fabricated.

```
sap-references/hub-content/
  EVENT.json  CDS_VIEW.json  BADI.json  BO_INTERFACE.json  INTEGRATION.json
  BUILD.json  PROCESS_BLUEPRINT.json  LIVEPROCESS.json  SCENARIO.json
  VPUC.json  ANALYTICS.json
```

The file **name is the content type** — the importer stamps `contentType` from it,
so a row does not need its own `contentType` field.

## How to get the data — ToU-compliant, no automation

> **Forbidden:** scraping, bots, headless crawlers, or any automated harvesting of
> api.sap.com. That violates the Business Accelerator Hub Terms of Use. Use the
> Hub's own UI while **logged in**, and its own export/download. Manual only.

1. Sign in at **https://api.sap.com** with an SAP account.
2. Filter **Package = "SAP S/4HANA Cloud Public Edition"**, then apply the
   content-type facet (Events, CDS Views, Integrations, …).
3. Use the Hub's **own export/download** for the filtered list (or copy the
   visible fields by hand). Do not script the page.
4. Transform to the import shape below and save as `sap-references/hub-content/<TYPE>.json`.

## Import shape (per row)

Only `externalId` is required; everything else is tolerant/optional.

```jsonc
{
  "externalId": "CE_BUSINESSPARTNERCHANGED_V1", // required — the stable Hub id
  "title": "Business Partner Changed",
  "description": "…",
  "packageId": "Master Data",                    // line of business / grouping
  "appliesToPublic": true,                        // default true (S/4 Public)
  "apiType": "ODATAV2",                           // runtime types only; omit otherwise
  "communicationScenarios": ["SAP_COM_0008"],
  "scopeItemCodes": ["J58"],
  "itemCount": null,
  "hubUrl": "https://api.sap.com/event/…"        // deep link for provenance
}
```

Field aliases are accepted (`id`/`name`/`code` → `externalId`, `scenarios`,
`scopeItems`, etc.). Wrapper shapes `{ "value": [...] }`, `{ "items": [...] }`,
and `{ "d": { "results": [...] } }` are also parsed.

## Honest status (no overclaim)

- **Reference** types (BADI, BO_INTERFACE, INTEGRATION, BUILD, PROCESS_BLUEPRINT,
  LIVEPROCESS, SCENARIO, VPUC, ANALYTICS) → badge **REFERENCE** (design-time; not a
  tenant endpoint).
- **EVENT** → **AVAILABLE** = *published, subscribe-only; tenant subscription not
  verified* (events are consumed by subscription, never `$metadata`-probed).
- **CDS_VIEW** → **NOT_CHECKED** until a real runtime probe runs (OData-probeable,
  just not probed in this pass).

## High-volume types — count-only is acceptable

`CDS_VIEW` (~8–9k) and `BADI` (~1.6k) are **count-only reference tiles** by default.
Do **not** commit multi-thousand-row JSON here — the admin Rebuild endpoint bundles
these files into the serverless function, so a large file bloats the deploy. Import
those in bulk via the local `pnpm sap:hub:import` against a dev DB if ever needed;
the published-count tile is the honest resting state.

## Loading

- **Local/dev:** `pnpm sap:hub:import` (reads these files into your dev DB).
- **Prod:** commit the file, deploy, then an admin clicks **Rebuild** for that type
  (or "all") in the catalogue header — `POST /api/sap/tdd/hub-content/seed` with
  `{ contentType, confirmation: "REBUILD SAP HUB CATALOGUE" }`. Files are bundled at
  build time, so a new export takes effect after deploy.

## Published counts are *indicative*, not release-pinned

The per-type tiles show `imported of ~published (indicative)`. Those published
figures are an **indicative volume snapshot**, **not pinned to a release** — order
of magnitude is stable across releases, exact figures are not. For release-accurate
counts, refresh from a logged-in Hub check (a separate, manual follow-up).

## Removed drop targets

- `AI.json` (26 rows) was removed 2026-08: `"AI"` is not a `HubContentType`, so
  no import path could ever read the file — committed data with no consumer.
  The AI facet in the catalogue works differently: it counts API rows whose
  `rawMetadataJson.raw.domain === "AI"`, stamped at API-catalogue import. If a
  distinct AI content type is ever wanted, add it to `HubContentType` first;
  a drop file without a type is unreachable by construction.
