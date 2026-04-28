# AD-3: ScopeCatalogVersion + edition partition

**Status:** Accepted (2026-04-27)

## Context

`ScopeItem.version` is a string column defaulted to `"2602"`. The catalog
ingest script (`scripts/ingest-sap-zip.ts`) mutates rows in place via
`allowOverwrite: true` on Vercel Blob re-ingest. Two consequences:

1. When SAP ships 2608, an ingest will silently corrupt the 2602 catalog state
   that prior verdicts were classified against. There's no ScopeCatalogVersion
   model and no concept of a "frozen catalog" pinned to an assessment.
2. There's no edition partition (Public / Private / On-Prem). Every ScopeItem
   today is implicitly `PUBLIC_2602`. Future Private Edition or On-Prem
   support would require touching every query.

## Decision

```
ScopeCatalogVersion {
  id, version ("2602"), edition ("PUBLIC"|"PRIVATE"|"ON_PREM"),
  releaseDate, ingestedAt, sourceArchiveUrl, sourceArchiveHash,
  notes, isActive, supersededById
  @@unique([version, edition])
}
```

- Every `ScopeItem` gets `catalogVersionId` FK.
- Every `Assessment` gets `catalogVersionId` FK (pins the assessment to a
  frozen catalog).
- Catalog ingest creates a NEW `ScopeCatalogVersion` per archive, never
  mutates prior versions. Hashed-source idempotency: re-ingesting the same
  archive is a no-op.

Existing data backfills to one seeded `PUBLIC_2602` row.

## Consequences

### Positive

- Verdicts can pin to a frozen catalog state (foundation for AD-1's
  `catalogVersionId` FK on `ClassificationVerdict`).
- Biannual SAP releases ship as parallel `ScopeCatalogVersion` rows; 2608
  ingest doesn't touch 2602.
- Edition partition is established now at constant cost; future
  Private Edition or On-Prem support is parallel rows, not a query rewrite.
- Catalog diff between versions becomes trivial: SQL between two
  `catalogVersionId` partitions.

### Negative

- Backfill required for all existing `ScopeItem` + `Assessment` rows.
- Every scope-item read query gains a `catalogVersionId` clause once the
  partition is enforced. Mitigated by the FK + composite indexes.

### Neutral

- During the dual-mode period (2 weeks), nullable FKs are tolerated to allow
  read-side migration. Flipped to non-nullable at cutover.

## Alternatives Considered

- **Keep version as a string field, add edition as a sibling string field.**
  Rejected: doesn't solve the in-place mutation problem; doesn't give us the
  catalog-diff capability.
- **Snapshot the catalog into the assessment row as JSONB at scope-selection
  time.** Rejected: bloats every assessment by ~50KB; loses ability to
  upgrade an assessment to a newer catalog (e.g. in-flight 2602→2608 jump).

## Related

- AD-1 (verdict pins to catalog version)
- AD-6 (FK from VerdictScopeItem to ScopeItem requires catalog version
  consistency for the FK to be unambiguous)
