# AD-6: Catalog FK enforcement, not free text

**Status:** Accepted (2026-04-27)

## Context

`ClientRequirement.scopeItemIds` (added in PR #33) is a string field holding
free-text scope IDs (e.g. `"J45, BMD, 19C"`). There is no FK to `ScopeItem.id`.
A typo (`"J452"` instead of `"J45"`) saves silently. A reference to a
deprecated catalog item (e.g. a 2508 ID that doesn't exist in 2602) saves
silently. The XLSX/PDF reports cite these IDs verbatim; readers cannot tell
they're broken.

This is the mechanism by which the AI can hallucinate a scope item ID and
have it propagate into delivered reports.

## Decision

The new `VerdictScopeItem(verdictId, scopeItemId, role)` join table
(introduced in AD-1) carries a real FK constraint to `ScopeItem.id`. Writes
that cite a non-existent ID are rejected at the database level.

For ambiguity, `role` enum captures the relationship:
- `primary` — the main scope item satisfying the requirement
- `secondary` — supporting scope item
- `gap-target` — the scope item that DOESN'T satisfy (used for Gap verdicts'
  "this lives in SuccessFactors EC, not in 2602" pointer; needs catalog with
  Gap-target items, see Consequences)
- `alternative` — alternative scope item considered

For Gap verdicts the gap-target may point to a scope item OUTSIDE the
2602 catalog (e.g. a SuccessFactors module). The catalog must be extended
to model these external products as `ScopeItem` rows with a marker
distinguishing in-base vs external. Phase 1 catalog versioning includes a
`scope_item.is_external` boolean for this.

## Consequences

### Positive

- Hallucinated IDs are impossible to save. The exact failure mode that
  produced silent errors in this session's Bursa pass becomes a structured
  error caught at write time.
- Reports never cite non-existent IDs.
- Catalog deprecation can flag affected verdicts (find verdicts citing now-
  deprecated items in a new catalog version).

### Negative

- One-time reconciliation pass required: every existing free-text scope ID
  in `ClientRequirement.scopeItemIds` must be parsed, validated against the
  catalog, and reconciled. Ambiguous cases (em-dashes, partial names,
  product names where IDs were expected) need hand-curation.
- Writing a Gap verdict requires the gap-target product to exist as a
  ScopeItem row first. Mitigated by seeding common external products
  (SuccessFactors EC, Ariba SLP, SAC, BPA, etc.) as `is_external=true`
  scope items.
- FK constraint adds a join cost on every read of cited scope items.
  Acceptable at 1000-req scale.

### Neutral

- Existing free-text `ClientRequirement.scopeItemIds` stays as a denormalised
  read cache during the dual-write period; dropped after cutover.

## Alternatives Considered

- **Application-layer validation only (no FK).** Rejected: the whole point
  is to catch what application code missed. FK is the only enforcement that
  doesn't depend on the writer remembering to validate.
- **Triggers on the verdict table validating the JSON of cited IDs.**
  Rejected: triggers are opaque, hard to audit, and don't compose with
  Prisma's type generation.

## Related

- AD-1 (verdict + VerdictScopeItem)
- AD-3 (catalog version — required so the FK is unambiguous when multiple
  versions of "J45" exist for 2602 vs 2608)
