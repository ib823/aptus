# AD-1: ClassificationVerdict becomes a first-class entity

**Status:** Accepted (2026-04-27)

## Context

The current verdict shape lives across six columns on `ClientRequirement`:
`solutionProviderResponse`, `solutionProviderRemarks`, `erpModuleSupporting`,
`sapModule`, `scopeItemIds`, `scopeItemNames` (the last three added in PR #33
during the Bursa pass). Three structural defects:

1. **Single mutable cell per requirement.** Every classification overwrites the
   prior. No history. No "what changed in pass v3 vs v2."
2. **Vendor + Aptus verdicts share the same column** (`solutionProviderResponse`).
   The Bursa importer writes; the AI/manual classifier writes. Provenance is
   reconstructable only from heuristics.
3. **No structured grounding.** The AI returns `matchedScopeItems[]` and
   `confidence` (`src/lib/analyzer/classifier.ts:36-43`); they're dropped on
   save (`src/app/api/assessments/[id]/analyze/route.ts:135-141`).

The Bursa session's reactive correction loop (76 misclassifications fixed
across 4 fix-passes) is a direct consequence of these defects: with no diff
between passes and no per-cell provenance, errors compound silently.

## Decision

Replace the multi-column shape with three append-only entities:

```
ClassificationVerdict {
  id, requirementId, passId,
  verdict (O/C/G/N-A), confidence (high/med/low/null), sapModule,
  remarksMd, actor, source (AI/MANUAL/ORCHESTRATOR/REIMPORT),
  createdAt, isCurrent, frozenAt,
  protocolVersionId FK, catalogVersionId FK
}

ClassificationPass {
  id, assessmentId, protocolVersionId, catalogVersionId,
  startedAt, completedAt, actor, actorRole, summaryJson, parentPassId
}

VerdictScopeItem {
  verdictId, scopeItemId (FK to ScopeItem.id), role
  (primary/secondary/gap-target/alternative)
}
```

`ClientRequirement.currentVerdictId` becomes a denormalised pointer for
read-cache (refreshed on every verdict write).

## Consequences

### Positive

- Verdicts are append-only; full history of every classification.
- Pass-level diff becomes trivial (`SELECT WHERE passId = ?`).
- Provenance per cell: actor + source + protocol + catalog + cited scope items.
- AI-emitted `matchedScopeItems[]` and `confidence` are preserved.
- Cited scope IDs are FK-validated (per AD-6) — hallucinated IDs rejected.

### Negative

- Migration cost: ~981 existing Bursa verdicts plus any prior assessment data
  must be backfilled. Reconciliation script (`scripts/migrate-to-verdicts.ts`)
  required.
- Read-side complexity: every report query gains a join to the verdict table.
  Mitigated by the denormalised `currentVerdictId` pointer + per-pass indexes.
- Dual-write window during cutover: 1 month of writing both the new model AND
  the old 6 columns to allow read-side migration.

### Neutral

- The old 6 columns survive as read-cache during the dual-write period; dropped
  in a follow-up migration once all readers have moved.

## Alternatives Considered

- **Keep the 6-column shape, add a sidecar audit table.** Rejected: doesn't
  solve vendor/Aptus conflation, doesn't enforce scope-ID validity, doesn't
  give pass-level diff for free.
- **Event-sourced verdict log only (no current-row pointer).** Rejected:
  every report query becomes a "find latest event per requirement" subquery —
  too expensive at 1000-req scale.
- **JSONB blob per requirement holding the verdict history.** Rejected: loses
  query-ability + FK enforcement on cited scope items.

## Related

- AD-2 (vendor response separation)
- AD-3 (scope catalog versioning — required for the catalogVersionId FK)
- AD-4 (protocol DB — required for the protocolVersionId FK)
- AD-5 (pass entity — defined here)
- AD-6 (catalog FK enforcement — defined here via VerdictScopeItem)
- AD-7 (frozen verdicts — defined here via the frozenAt column)
