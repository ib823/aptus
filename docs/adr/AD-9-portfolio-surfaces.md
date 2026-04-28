# AD-9: Portfolio surfaces above the assessment shell

**Status:** Accepted (2026-04-27)

## Context

Five routes under `(portal)/assessment/[id]/` are not surfaced in the
canonical 5-step nav (`AptusAssessmentShell.tsx:43-74`):

- `/activity` — assessment-specific activity feed (linked from top bar of
  shell, line 231)
- `/benchmarks` — assessment vs industry cohort comparison (orphaned;
  no inbound nav links)
- `/cross-phase` — cross-assessment phase analytics (orphaned;
  fetches `PhaseLink[]` across multiple assessments — already
  cross-assessment in nature, misplaced under `/assessment/[id]`)
- `/triggers` — lifecycle triggers / SAP update detection (orphaned)
- `/workshops` (top-level page; `[sessionId]` nested) — actually IS in
  Scope step's sub-tabs; leave alone.

`cross-phase` is the most clear-cut: its data fetch is portfolio-scoped, but
its route lives under a single assessment. The path is misleading.

## Decision

Move four routes to a new top-level surface:

```
(portal)/insights/
  activity        — cross-assessment activity feed (filterable per assessment)
  benchmarks      — industry benchmarking dashboard with cohort selection
  triggers        — lifecycle triggers across all assessments
  phase-bridge    — replaces /cross-phase; tracks phase transitions across assessments
  patterns        — NEW: cross-assessment pattern library
                    ("in financial-services Public Edition, scope item X is
                    typically C — based on N assessments")
```

Per-assessment views remain accessible as filtered views:
`/insights/activity?assessmentId=X`. Old per-assessment routes redirect to
the portfolio surface with the assessment filter applied. Bookmarks survive.

`/workshops` stays under the assessment — it's genuinely scope-tied.

## Consequences

### Positive

- Route paths match data scope (portfolio data lives at portfolio routes).
- Orphaned features become discoverable via the top-level nav.
- New "Patterns" surface aggregates value across assessments — a key
  differentiator from "consultant tool" → "evidence platform."

### Negative

- Existing per-assessment links to these routes (if any user has bookmarked
  them) flow through redirects with filter params.
- Auth model needs to allow cross-assessment reads for `(portal)/insights/`
  while still respecting per-assessment auth. Solved via existing
  organization-scoped auth (consultant sees all assessments in their org).

### Neutral

- Route move is mechanical (pages stay, file paths change, redirects added).

## Alternatives Considered

- **Delete the orphaned routes.** Rejected: `cross-phase` and `benchmarks`
  carry real product value (cross-assessment insight). Just misplaced.
- **Add a top-bar nav entry to the existing per-assessment routes.**
  Rejected: doesn't fix the data-scope mismatch (cross-phase fetches
  multiple assessments while sitting under a single one).
- **Keep them per-assessment, just hide them.** Rejected: this is the
  current state and nobody finds them. Hidden ≠ deleted — they accumulate
  maintenance cost without value.

## Related

- Phase 8 (implementation)
