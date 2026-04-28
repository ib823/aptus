# AD-10: Curation moves to DB tables

**Status:** Accepted (2026-04-27)

## Context

3,086 lines of curated TypeScript constants encode SAP domain knowledge:

| File | Lines | Content |
|---|--:|---|
| `src/constants/scope-item-metadata.ts` | 1,961 | 6 hand-curated scope items with modules, master data, dependencies, activity patterns, implications |
| `src/constants/process-chains.ts` | 721 | 19 functional areas, 50+ process chains (R2R, P2P, O2C, etc.) |
| `src/constants/scope-briefings.ts` | 247 | Curated briefing content for 7 key scope items |
| `src/constants/presets.ts` | 97 | "CoreEdge" preset definition |
| `src/constants/scope-summaries.ts` | 60 | Plain-English summaries for ~20 scope items |
| `src/lib/scope/upgrade-triggers.ts:77-87` | (subset) | `GAP_PRONE_AREAS`, `FINANCIAL_SERVICES_TREASURY_IDS` (17-ID Set) |

All edits require an engineer to open a PR. SI domain experts (the people who
actually know SAP best practices) are bottlenecked through engineering
review for content edits.

Worse, when SAP renames or deprecates a scope item, the hardcoded TS sets
silently reference stale IDs. There's no drift detection.

## Decision

Promote each curation source to its own Prisma model:

```
ScopeItemCuration {
  id, scopeItemId FK,
  summaryHtml, briefingMdSections Json, prereviewQuestions Json,
  modulesJson, masterDataJson, dependenciesJson,
  activityPatternsJson, implicationsJson,
  curatedAt, curatedBy
}

ProcessChain {
  id, area, name, description, scopeItemIdsOrdered (FK array),
  ...
}

ScopePreset {
  id, name, description,
  defaultScopeItemIds (FK array), optionalScopeItemIds (FK array),
  modulesJson,
  ...
}

GapProneArea {
  id, name, scopeItemIds (FK array), severity, rationaleMd,
  ...
}

IndustryProfile { ... (already exists; expand with treasury/etc. ID sets) }
```

Seed migration populates from current TS constants verbatim. Replace
constant-file imports with cached DB lookups (`src/lib/curation/curation-cache.ts`,
60s TTL).

Admin UI at `(portal)/admin/curation/` lets SI experts edit directly.

CI drift test (added in Phase 0, expanded in Phase 9) asserts every
scope-item ID cited in any curation row exists in the live catalog (per
AD-3's catalog versioning).

## Consequences

### Positive

- SI experts edit curation without engineering involvement.
- New scope-item curation entries don't require a code release.
- Drift detection catches stale references after every catalog ingest.
- The 17-ID `FINANCIAL_SERVICES_TREASURY_IDS` Set becomes editable
  per-industry; new industries can be added by data, not code.

### Negative

- Migration touches every site that imports these constants. Sub-agent
  audit estimated dozens of touch points; a thin fetch layer
  (`src/lib/curation/*-fetch.ts`) abstracts the change.
- Cold reads pay a DB round-trip; mitigated by 60s in-memory TTL cache.
- Loss of TypeScript type-checking on curation content (DB rows are JSON).
  Mitigated by Zod schemas at the cache layer.

### Neutral

- The TS constants files become one-time seed scripts after migration; can
  be deleted once the seed has run.

## Alternatives Considered

- **Keep TS constants; just add drift CI.** Rejected: doesn't solve the
  SI-expert bottleneck.
- **Use a CMS (Contentful, Sanity).** Rejected: external dependency, auth
  complexity, doesn't compose with the curated FK validation.
- **Markdown files in repo + admin UI for git commits.** Rejected:
  preserves the engineering bottleneck (every edit is a commit).

## Related

- AD-3 (catalog versioning — required for drift detection)
- AD-6 (FK enforcement — applies to curation references too)
- Phase 0 (drift CI gate, initial scope)
- Phase 9 (full implementation)
