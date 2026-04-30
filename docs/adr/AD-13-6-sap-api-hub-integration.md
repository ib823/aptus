# AD-13.6 — SAP API Business Hub live-knowledge integration

**Status:** Accepted (2026-04-30)
**Phase:** 13.6
**Supersedes:** —
**Superseded by:** —

## Context

The Phase 13 multi-edition catalog work made the classifier strictly edition-aware: a Public 2602 assessment can only cite Public 2602 scope items, a Private 2025-FPS1 assessment can only cite Private 2025-FPS1 scope items. But the classifier still doesn't know **which integration boundaries actually exist** — it has the scope-item names from the Best Practices archive but no knowledge of whether SAP publishes a released API for that scope.

Without that signal, the classifier is forced to guess about API-driven Configuration paths. SAP customers consistently hit "Released" APIs that the classifier had labelled `G` (gap) — a class of false-negative the protocol prompt alone cannot fix.

## Decision

Cache SAP's API Business Hub catalog (`api.sap.com`) into a `SapApiReference` table inside Aptus. The classifier looks up matching APIs at every batch and appends them as evidence to the user message it sends to Claude. A `Released` API for a candidate scope item is strong evidence the requirement is `C` not `G`.

### Three sub-decisions inside that

#### 1. Edition mapping: three Boolean columns, not a junction table

Rejected:
- **Junction `SapApiCatalogEdition(apiId, catalogVersionId)`** — over-engineered. SAP publishes APIs at edition granularity (`SAP S/4HANA Cloud` vs `SAP S/4HANA Cloud, private edition`), not version granularity. An API "available on Private" is rarely version-restricted.
- **`String[]` of catalogVersionIds** — Phase 13.1 just spent a migration escaping unenforced string-array references. Don't reintroduce them.

Accepted:
- **Three Boolean columns** `appliesToPublic / appliesToPrivate / appliesToOnPrem`. Trivial filter at classification time (`WHERE appliesToPublic = true`); matches SAP's actual taxonomy; survives new editions via column adds.

#### 2. Ingestion path: file-based primary, OAuth-based deferred

Discovered empirically on 2026-04-30: `api.sap.com` is fully auth-gated.
- The "OData catalog" endpoints I assumed exist are routed to the same OAuth redirect as everything else.
- The site is a single-page app — there's no server-rendered content for unauthenticated crawlers, even though `robots.txt` allows search-engine bots on `/`.
- The sitemap has 10,724 entries, all of which require login to render.

Three concrete paths to populate the table:
- **(A) Curated static seed** — author ~30-50 well-known SAP S/4HANA APIs from public docs as a TS constant. Rejected because SI-curated coverage is the SI lead's job, not a shortcut.
- **(B) File-based importer (CHOSEN)** — user logs into `api.sap.com` once, exports the catalog, drops the file in `sap-references/`. Script reads CSV/JSON tolerantly. **No script-side credentials required.**
- **(C) OAuth client_credentials live ingest** — would require the user to register an SAP BTP service instance. Deferred. The script exists at `scripts/ingest-sap-api-hub-oauth.ts` for future activation; clearly marked as inactive.

The file-based path is honest about the auth boundary without forcing the user to set up SAP BTP credentials before getting any value.

#### 3. Defensive design: empty table is a no-op

The classifier hook (`findMatchingApis`) returns an empty array if:
- The `SapApiReference` table is empty (e.g. before the user has imported their export)
- `ENABLE_API_HUB_GROUNDING="0"` env override
- No candidate scope items provided
- Unknown catalog edition

In all these cases, the classifier proceeds **exactly as it did pre-Phase-13.6**, producing identical verdicts. The integration adds capability without forcing migration of existing flows.

## Consequences

### Positive
- The classifier gains a strong grounding signal for Configuration vs Gap when API evidence exists.
- Edition isolation is preserved end-to-end (Public APIs never ground a Private classification, and vice versa).
- The file-based ingestion design means the system works today even without SAP credentials.
- Fully reversible: drop `SapApiReference` table → no behavior change in the rest of the system.

### Negative / Risks
- **The file-based importer is only as good as the export the user provides.** If the export is stale, classifications use stale evidence. Mitigation: `lastFetchedAt` column flags stale-ness; admin UI shows it.
- **Edition tagging from the export depends on SAP's `productCategory` strings.** I documented the mapping rules but they're heuristic; some APIs may end up untagged. Mitigation: importer prints `Untagged: N` warning at the end of every run.
- **Importing the full 1,500-2,500 API SAP catalog is non-trivial.** First import will take 1-2 minutes for a 5MB export. Mitigation: progress logging every 100 rows.

## Validation

Verified before activating:
- Schema model + migration applied via `prisma migrate deploy` (5s, BEGIN/COMMIT, post-flight invariants pass)
- Synthetic test fixture (3 rows) imports cleanly via JSON path
- Synthetic test fixture imports cleanly via CSV path with quoted strings + multi-edition tags
- `findMatchingApis()` returns correct edition-filtered results in both Public and Private cases
- Defensive paths (empty scope codes / kill-switch env / unknown edition) all return empty array, no crash
- Bursa Public 2602 baseline regression: 981 reqs / 981 verdicts / 241 citations unchanged after migration
- Type-check clean across the entire repo

## Operational notes

To populate the table:
1. Log into `https://api.sap.com` with an SAP Universal ID
2. Browse to APIs → filter by S/4HANA Cloud (Public + Private editions)
3. Use "Export" / download the catalog as JSON or CSV
4. Save to `sap-references/api-hub-catalog.{json,csv}` (gitignored)
5. Run `pnpm tsx scripts/import-sap-api-catalog.ts`

Re-runs are idempotent (upsert by `apiId`). Refresh frequency is the user's call — quarterly is reasonable for SAP's release cadence.
