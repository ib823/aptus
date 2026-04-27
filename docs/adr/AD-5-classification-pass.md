# AD-5: ClassificationPass as the unit of work

**Status:** Accepted (2026-04-27)

## Context

This session's Bursa pass had at least 7 bash sub-passes (m01..m18 result
files plus correction batches). Each was an implicit "unit of work" with no
DB representation. There's no "rerun pass v3" concept; no diff between v2 and
v3; no per-pass summary visible to the user.

The user explicitly asked for snapshots + diff between passes. Without a
`Pass` entity that's not possible.

## Decision

```
ClassificationPass {
  id, assessmentId, protocolVersionId FK, catalogVersionId FK,
  startedAt, completedAt,
  actor, actorRole ("ai"|"consultant"|"orchestrator"),
  summaryJson (bucket distribution, count flipped vs prior pass, modules covered),
  parentPassId (chain of passes for diff lineage)
}
```

Every verdict is created within a pass. Pass becomes the unit of:
- Sample-check and per-module sign-off (Phase 5 workspace)
- Diff between two passes (Phase 5 diff view)
- Audit (who ran which pass when, with what config)
- Rollback (undo a whole pass without unwinding individual verdicts)

## Consequences

### Positive

- Diff view trivial: `SELECT verdicts WHERE passId IN (?, ?)`.
- Rollback story is per-pass, not per-row.
- Pass-level audit ("on Apr-27 the orchestrator ran pass X using protocol v1.0
  on catalog 2602") becomes a single row.
- Per-module sign-off (Phase 5) gates verdicts in a pass to become `current`.

### Negative

- Adds an entity that didn't exist; one more thing to keep consistent across
  imports/exports.

### Neutral

- The pass entity captures exactly the semantics of the bash workflow this
  session relied on; no new concept invented.

## Alternatives Considered

- **No pass entity; verdicts are independent.** Rejected: loses the diff
  story; loses the per-module sign-off; rollback becomes per-row.
- **Pass is implicit (a verdict with no parent is the start of a pass).**
  Rejected: too brittle; doesn't capture the actor + protocol + catalog
  triple cleanly.

## Related

- AD-1 (verdicts belong to a pass)
- AD-4 (passes pin to a protocol version)
- AD-3 (passes pin to a catalog version)
