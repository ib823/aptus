# AD-7: Sign-off freezes via DB row-level guard

**Status:** Accepted (2026-04-27)

## Context

Today, an assessment hitting `signed_off` status doesn't freeze its
`ClientRequirement` rows at the DB level. Manual edits via the Prisma
client (or any background job that forgets to check status) can silently
mutate a signed-off assessment's verdict. The audit log captures the change
but the bytes have already moved.

For an evidence platform — which Aptus claims to be — this is a structural
defect. Sign-off must mean the bytes stop moving.

## Decision

Add `frozenAt: DateTime?` to `ClassificationVerdict` (per AD-1). Set when
the parent `Assessment.status` transitions to `signed_off` (handled by a
trigger or in-app cascade).

The verdict-writer chokepoint (`src/lib/classification/verdict-writer.ts`,
new in Phase 3) refuses any write to a verdict where `frozenAt IS NOT NULL`
unless an explicit `unsealReason` parameter is provided. Unseals are
audit-logged and require a specific role (`assessment_admin` or higher).

`ScopeSelection`, `ConfigSelection`, `IntegrationPoint`, etc. that have
similar immutability semantics get the same treatment — `frozenAt` on each
mutable register, enforced at write-time.

## Consequences

### Positive

- "Signed-off" has structural meaning, not just convention.
- Forensic discovery is correct: a signed-off assessment's reports can be
  trusted as immutable evidence.
- Report cache (Phase 10) becomes safe — cached bytes can't go stale because
  source data is frozen.

### Negative

- Legitimate post-signoff corrections (rare but real: e.g. a typo in a
  signed-off remark) require explicit unseal + audit log entry. Adds
  friction by design.
- Trigger-or-cascade implementation: trigger is reliable but Prisma-opaque;
  cascade is type-safe but relies on every status transition going through
  the chokepoint. Decision: app-side cascade in `src/lib/assessment/
  status-machine.ts` transition handler, with a backstop trigger as
  defense in depth.

### Neutral

- During the dual-write period (Phase 3), the old 6-column shape on
  `ClientRequirement` doesn't get the freeze. Old shape is dropped after
  cutover anyway.

## Alternatives Considered

- **Snapshot the assessment to JSONB on sign-off; treat snapshot as evidence.**
  Already exists (`AssessmentSnapshot`). Doesn't prevent post-signoff
  mutation of the live data — it just captures a copy. The user-facing
  question "is this verdict frozen?" still requires comparing live data to
  snapshot. Frozen-at flag is more direct.
- **Move signed-off assessments to a separate read-only DB.** Rejected:
  operational nightmare, breaks foreign-key relationships across the live
  schema.

## Related

- AD-1 (verdict carries the frozenAt column)
- Phase 10 (report cache relies on frozen-source guarantee)
