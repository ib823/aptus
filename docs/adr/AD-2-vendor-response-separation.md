# AD-2: Vendor responses live in their own table

**Status:** Accepted (2026-04-27)

## Context

The Bursa importer (`scripts/import-bursa-requirements.ts:615-660`) writes
vendor-supplied classifications into `ClientRequirement.solutionProviderResponse`
— the same column the AI/manual classifier writes to. The importer guards
against overwrite by excluding these fields from the upsert's `update{}` clause,
but the cohabitation is structural: both producers share one cell.

This produced the entire reactive correction loop in this session's Bursa pass.
Multiple sub-passes had to flip vendor-supplied "O" verdicts to G after
discovering the "O" came from a vendor remark pointing at a non-2602 product
(SuccessFactors / Ariba / SAC). The principle the user stated explicitly —
"don't ever take the vendor response" — cannot be enforced by convention while
the data model itself permits the conflation.

## Decision

Vendor responses get their own table:

```
VendorSubmission {
  id, assessmentId, vendorName, submittedAt, sourceArchive
}

VendorResponse {
  id, requirementId, submissionId,
  verdict, remarksMd, vendorMetaJson (NM/UD/etc.),
  importedAt, importedBy
}
```

The Bursa importer writes here. The AI/manual classifier writes verdicts via
AD-1's `ClassificationVerdict` model. The two paths never touch the same row.

A new "Vendor vs Aptus Comparison" report shows both side-by-side:
agreement-rate metrics emerge automatically.

## Consequences

### Positive

- Structural enforcement of the "vendor response is read-only context, not
  authority" principle.
- Multi-round vendor submissions naturally supported (re-bid, post-clarification,
  etc.) via `VendorSubmission` rows.
- Comparison reports become first-class instead of manual diffs.

### Negative

- Backfill: existing `ClientRequirement.solutionProviderResponse` rows that
  came from vendor imports (vs. AI classifications) must be moved to
  `VendorResponse`. Heuristic-based (presence in import-script logs + the
  `"NM - Not Met"` / `"UD - Under Development"` prefix patterns observed in
  the Bursa data); ambiguous cases hand-curated.

### Neutral

- The bursa importer's existing logic that "preserves vendor fills on
  re-import" simply moves to writing to `VendorResponse` instead.

## Alternatives Considered

- **Add a `source` discriminator column on the existing shape.** Rejected:
  doesn't solve the multi-round vendor submission case, and the discriminator
  would still allow accidental overwrites by code that forgets to filter.
- **Treat vendor responses as a special "vendor" actor in `ClassificationVerdict`.**
  Rejected: conflates the audit story (Aptus's own verdicts shouldn't share an
  audit log with vendor-supplied data); breaks the "vendor never authoritative"
  principle in the model.

## Related

- AD-1 (verdict first-class — Aptus side of the separation)
