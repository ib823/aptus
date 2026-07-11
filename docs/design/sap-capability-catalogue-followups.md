# SAP Capability Catalogue — follow-ups (NOT in the consistency-fix PR)

Tracked here deliberately; out of scope for the "browser-audit consistency" fix.

## 1. apiType enrichment (data quality) — blocks probing ~66% of rows

Audited prod data: of 941 API rows, **apiType is `null` on 623 (66%)**, ODATAV4 on
190, ODATAV2 on only **128**; **category is `null` on 941/941**. The catalogue's
LoB fix derives grouping from scope codes / keywords (independent of category), so
grouping is fixed. But **only ODATAV2 rows are probeable**, so ~66% of the catalogue
can never reach ACTIVATED until their apiType is classified.

Even the known tenant-exposed procurement services (`API_PURCHASEORDER_PROCESS_SRV`
etc.) carry `apiType=null` in the data — this PR works around that by injecting the
curated `S4HANA_SERVICES` with `apiType=ODATAV2`, but that only covers the 5 curated.

**Task:** enrich apiType for the full catalogue via a real re-import with proper
classification, or run `scripts/ingest/refresh-api-types.ts` against the real export.
Until then the probeable set stays ~128 and the scorecard's "probed" sample is bounded.

## 2. On-demand OpenAPI for not-activated rows (feature) — verify auth first

For AVAILABLE (not-activated) services the live probe can't show fields/operations
(403/404 — the arrangement isn't active). To honour "imagine all activated," fetch the
API's published **OpenAPI spec from the Business Accelerator Hub** when a user opens a
not-activated service's detail, and cache it in `SapHubContent.rawMetadataJson`, so the
detail can render its entity sets / operations without a live tenant.

**Do NOT build before verifying the auth model:** api.sap.com OpenAPI downloads require
either a sandbox **API key** or a logged-in session — confirm which is available and
sanctioned (no scraping) before implementing. Cache read-through + idempotent.

---

Both are queued, not built in this pass.
