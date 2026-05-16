# Runbook: SAP Process Hierarchy Extraction

## When to run

`SolutionProcess`, `ProcessFlow`, and `Activity` are normalized tables
introduced in the V2 schema refactor. `ProcessStep` (the flat
~102k-row table) still carries the source-of-truth column data; the
hierarchy is derived from it. Until the extraction has run on a given
database, the hierarchy tables are empty and any API/UI that reads
them returns empty arrays (process maps, flow atlases, area
breakdowns).

Run this:

- Once per environment after the first time the SAP catalog has been
  ingested
- After re-importing or refreshing the SAP catalog (the script is
  idempotent — re-running will only add what's new)
- As part of every full DB seed

## What it does

5-pass extraction in `scripts/extract-hierarchy-entities.ts`:

1. **SolutionProcess** — `DISTINCT (scopeItemId, solutionProcessName)`
   from `ProcessStep`, upserted by the `(scopeItemId, name)` unique
   constraint
2. **ProcessFlow** — `DISTINCT (solutionProcessId,
   solutionProcessFlowName)`, upserted by `(solutionProcessId, name)`
3. **Activity** — `DISTINCT (processFlowId, activityTitle)`, upserted
   by `(processFlowId, title)`
4. **Backfill `ProcessStep.activityId`** — joins flat steps to the new
   `Activity` rows, in transactions of 500
5. **Backfill `ProcessFlowDiagram.processFlowId`** — same, for the
   diagram FK

`NULL` source values are mapped to placeholder names
(`__main_process__` / `__main_flow__` / `__main_activity__`) so the
unique constraints still apply cleanly.

## How to run

```bash
# 1. Extract the hierarchy (~1 minute on 102k rows)
pnpm tsx scripts/extract-hierarchy-entities.ts

# 2. Verify the result
pnpm tsx scripts/verify-hierarchy.ts
```

`verify-hierarchy.ts` runs 13 sanity checks:

- Orphan counts (ProcessSteps with no Activity, Activities with no
  Flow, etc.)
- Chain completeness from `ProcessStep` up to `ScopeItem`
- Unique-constraint coverage
- `ProcessFlowDiagram.processFlowId` backfill rate

It exits non-zero on any failure so it is safe to wire into a CI
data-quality job.

## Safety

- **Idempotent.** Re-running upserts existing rows by their unique
  constraint and leaves data untouched.
- **No external dependencies.** Reads only from `ProcessStep`; no SAP
  ZIP, no API calls.
- **Batched transactions.** Pass 4 and Pass 5 commit in chunks of 500
  to stay under PostgreSQL transaction-size limits.
- **Reversible.** To roll back, `DELETE FROM Activity; DELETE FROM
  ProcessFlow; DELETE FROM SolutionProcess; UPDATE ProcessStep SET
  activityId = NULL; UPDATE ProcessFlowDiagram SET processFlowId =
  NULL` and re-run.

## Failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Pass 1 finds 0 rows | `ProcessStep` table is empty — catalog not ingested | Run the catalog ingest first (`pnpm ingest`) |
| Unique-constraint violation during upsert | Stale duplicate in DB | Inspect the offending pair, delete the older row, re-run |
| Pass 4/5 timing out | Connection pool exhausted on Neon free tier | Re-run; the script is idempotent so it'll resume |
| `verify-hierarchy.ts` reports orphans | Likely a partial run that was interrupted | Re-run the extraction |
