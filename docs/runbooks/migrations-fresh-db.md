# Runbook — Prisma migrations on a fresh database

## Summary

`prisma migrate deploy` used to abort on a brand-new empty DB (CI, a new
environment, or the `migrate diff` shadow DB). `prisma db push` worked, which
masked it locally. This runbook records the root cause, the fix, the
existing-environment impact, and a known follow-up.

## Root cause (fixed)

Three early Phase-13 migrations embedded **one-time production regression
asserts** — `DO $$ … RAISE EXCEPTION` blocks that require the exact Phase-13.0
fixture (e.g. "expected 582 ScopeItem rows"). On an empty DB every count is 0,
so the first such assert aborts the migration transaction:

```
20260429000001_phase13_1_scope_item_identity
  → ERROR: Pre-flight failed: expected 582 ScopeItem rows, found 0
```

Affected migrations:

| Migration | Fixture asserts that broke on empty |
|---|---|
| `20260429000001_phase13_1_scope_item_identity` | pre-flight `ScopeItem = 582`; post `582 / Bursa 981 / preset 7 / chain 24` |
| `20260430000000_phase13_6_sap_api_hub` | post `Bursa 981/981/241`, `ScopeItem 840` (structural asserts kept) |
| `20260430120000_add_client_requirement_priority_tier` | pre + post `Bursa 981` |

The DDL/DML in these migrations was already empty-safe — only the asserts
aborted.

## The fix (guarded, idempotent — same end state on fresh and populated DBs)

Each fixture assert is now wrapped in a **fresh-provision guard**: if the
relevant baseline table is empty, the block emits a `NOTICE` and `RETURN`s
(skips the fixture regression checks); otherwise it runs the original asserts
**verbatim**. So:

- **Empty DB** (new env / CI / shadow) → asserts skipped, transforms run on 0
  rows → identical end schema.
- **Populated DB** → asserts run exactly as before (still raise on drift).

Verified: with 3 (wrong-count) ScopeItem rows the fixed migration still raises
`expected 582 ScopeItem rows, found 3`; on empty it skips and the full 14-migration
deploy completes.

A second, unrelated blocker was also guarded: `20260509230600_add_unindexed_fk_indexes`
created three indexes on the **Brownfield** subsystem (a column + two tables)
that reach environments via `db push` and are not yet in any migration. Those
three `CREATE INDEX` statements are now existence-guarded (`to_regclass` /
`information_schema`) so they no-op when the target isn't present and create the
index when it is.

No `schema.prisma` change. No history squash. No archive resurrection.

## Existing-environment impact — none for the deploy path

Editing an already-applied migration's SQL changes its checksum. **Tested on
Prisma 6.19.2**: `prisma migrate deploy` and `prisma migrate status` do **not**
re-verify checksums of already-applied migrations — a prod-like DB (all 14
applied) with the edited files reports *"No pending migrations to apply", exit 0*.
So **no operator action is required** on existing environments (prod, staging).

**Fallback (only if a local dev hits drift via `prisma migrate dev`, which
*does* flag edited migrations):** mark the edited migrations as applied so their
stored checksum is refreshed — this does not re-run their SQL:

```bash
prisma migrate resolve --applied 20260429000001_phase13_1_scope_item_identity
prisma migrate resolve --applied 20260430000000_phase13_6_sap_api_hub
prisma migrate resolve --applied 20260430120000_add_client_requirement_priority_tier
prisma migrate resolve --applied 20260509230600_add_unindexed_fk_indexes
```

The `migrate-deploy-with-retry.mjs` `KNOWN_AUTO_RECOVERABLE` entry
(`session_token_hashing`) is a **separate** Neon partial-apply/P3009 recovery,
unrelated to this fix — left in place (see the comment there).

## Known follow-up — migration/schema drift (NOT fixed here)

`schema.prisma` has **146 models**; the migrations create **122 tables**. The
Phase-14 **Brownfield** subsystem and other later additions (`CustomerProcess*`,
`SimplificationItem*`, `ConversionMethodology*`, `App`, columns like
`SapApiReference.apiType`, `ClientRequirement.crossCuttingTag`, …) exist only in
`schema.prisma` / `db push`, never captured as migrations.

`prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel
prisma/schema.prisma` reports **~25 CREATE TABLE + 84 CREATE INDEX + 36 ALTER
TABLE** of drift (plus a GIN-index quirk: migrations create
`SapApiReference_scopeItemCodes_gin_idx`, which the Prisma DSL can't express).

Consequence: a fresh `migrate deploy` **alone** yields an incomplete schema — a
brand-new environment still needs `prisma db push` (or the follow-up below) to
get the full schema.

**Recommended follow-up:** generate an additive catch-up migration from the
drift (`migrate diff … --script`), hand-edited to (a) keep the GIN index and
(b) use `CREATE TABLE IF NOT EXISTS` so it no-ops on existing/`db push`'d DBs,
and optionally declare the GIN index in `schema.prisma` (`@@index(type: Gin)`)
so `migrate diff --exit-code` is byte-clean. This is additive (a new migration),
not a squash.

## Verify (fresh DB)

```bash
nvm use 22
export DATABASE_URL=…; export DIRECT_DATABASE_URL=…   # a brand-new empty DB
prisma migrate deploy        # all 14 apply, exit 0
prisma db push               # (until the drift follow-up) fills the ~25 missing tables
prisma db seed               # clean
```
