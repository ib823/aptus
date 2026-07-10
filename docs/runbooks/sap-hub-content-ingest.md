# Runbook — SAP Capability Catalogue ingest (SapHubContent)

How to populate `SapHubContent` with the SAP Business Accelerator Hub catalogue
for **S/4HANA Cloud, Public Edition** — every content type (APIs, events, CDS
views, BAdIs, integrations, builds, processes, partner use cases, analytics).

**No scraping of api.sap.com.** The supported population path is a **manual,
logged-in per-type export** dropped as files and imported. See the important
caveat on "Path C" below.

> This repo ships an **illustrative 36-row seed**
> (`sap-references/hub-content-seed.json`) so the UI has content immediately.
> A real catalogue requires the manual export path below.

---

## Path A (SUPPORTED) — manual per-type export → file import

This is the real population path.

1. Sign in to <https://api.sap.com> with an SAP Universal ID or S-User.
2. Filter the catalogue to **SAP S/4HANA Cloud (Public Edition)** and the
   content type you want (APIs, Events, CDS Views, BAdIs, Integrations, Build
   content, Processes, Partner Use Cases, Analytics).
3. Export the list, or copy the catalogue JSON response from your browser's
   **DevTools → Network** tab while the filter is applied.
4. Save each as **`sap-references/hub-content-<type>.json`** (e.g.
   `hub-content-events.json`, `hub-content-cdsviews.json`). Accepted shapes:
   a top-level array, or `{ value: [...] }` / `{ items: [...] }` /
   `{ d: { results: [...] } }`. Each row needs at least `contentType` +
   `externalId`; all other fields are matched tolerantly (see
   `scripts/import-sap-hub-content.ts`).
5. Import + report:
   ```bash
   nvm use 22
   pnpm sap:hub:import
   pnpm sap:hub:report        # per-type counts + drift vs published figures
   ```

Idempotent — upsert by `contentType + externalId`; re-run = 0 inserts. For very
large types (CDS ~8,983), model them as **grouped per-LoB rows** carrying
`itemCount` (as the seed does) rather than one row per view.

---

## Path C (SPECULATIVE / UNVERIFIED — do NOT treat as available)

`scripts/ingest-sap-api-hub-oauth.ts` contains a scaffold for a hypothetical
OAuth "pull the whole catalogue" API, gated behind `SAP_API_HUB_INGEST_CONTENT=1`.

**It is speculative and unverified. There is no known sanctioned SAP service
that bulk-exports the Business Accelerator Hub catalogue over OAuth.** In
particular:

- A **BTP "apiportal / apiaccess" service instance is SAP Integration Suite —
  API Management** (runtime API proxying, policies, and governance for *your
  own* APIs). It is **not** a download endpoint for the public api.sap.com
  content catalogue. Provisioning it will **not** give you a bulk-catalogue
  feed.
- The discovery paths and response field names in the scaffold
  (`CONTENT_TYPE_PATHS`, `mapContentEntry`, all marked `// VERIFY:`) are
  **guesses based on general OData patterns** and have never been run against a
  real endpoint. They may not correspond to anything that exists.

Keep the scaffold only as a placeholder in case SAP later publishes such an API.
Until a real, sanctioned endpoint is confirmed, **use Path A (manual export).**
If a real endpoint is ever identified, resolve every `// VERIFY:` marker against
its live response before relying on the output.

---

## Published S/4 Public figures (drift reference)

Compared by `sap:hub:report` (these move with each SAP release — the report
checks "within drift", not exact equality, and flags per-type stubs). CDS/BAdI/BO
are stored as grouped rows carrying `itemCount`; the report sums `itemCount` and
compares that to these totals.

| contentType | ~published | kind |
|---|--:|---|
| API | 862 | runtime |
| EVENT | 147 | runtime |
| CDS_VIEW | 8,983 | runtime |
| BADI | 1,665 | reference |
| BO_INTERFACE | 207 | reference |
| INTEGRATION | 158 | reference |
| BUILD | 78 | reference |
| PROCESS_BLUEPRINT + LIVEPROCESS | ~15 | reference |
| SCENARIO | 16 | reference |
| VPUC | 5 | reference |
| ANALYTICS | 6 | reference |

Source of truth is `S4_PUBLIC_PUBLISHED_COUNTS` in `src/lib/sap-public/hub-content.ts`.
