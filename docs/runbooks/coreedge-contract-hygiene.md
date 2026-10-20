# Runbook: Contract and fixture hygiene (P0.4)

Roadmap item P0.4 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2): audit findings A38, A42, A56 and A57, and the residuals (the generated
`client.ts` failing `tsc --strict`, and deferred navigations).

There is **no new setting**. Nothing here refuses a northbound call or locks
anyone out; it changes what the contract, the mock and the discovery advisory
say, so that they say what the broker does.

## What changed, in one paragraph each

**A changed contract never publishes the old contract's schema or mock (A38).**
Changing an interface's entity set (or its operation, or your own API's service)
bumps its version, and left the captured response schema and the mock fixtures
alone. `GET /api/northbound/interfaces/{id}/schema` then served the new entity
set and version with the old shape and `schemaCaptured: true`, the starter kit
typed the new entity set with the old fields, and `npm run mock` served the old
entity set's rows. Now:

- The Studio PATCH that changes the contract clears the schema and deletes the
  fixtures in the same transaction as the version bump. The `ConfigAudit` row
  records `schemaCleared` and `fixturesCleared`.
- Every capture is stamped with the contract it was read under: the schema's
  `x-captured.interfaceVersion` / `x-captured.entitySet`, and the new
  `MockFixture.interfaceVersion` / `MockFixture.entitySet` columns.
- Every reader (`/schema`, the starter kit, Studio's interface page and the
  CoreEdge catalogue) asks `src/lib/studio/contract-provenance.ts`, which
  publishes a capture only when its stamp matches the interface's current
  version and entity set. `/schema` adds `schemaState` (`current`, `none`,
  `stale`, `unverified`) and, when it withholds one, `schemaNote`. The kit's
  `fixtures.json` lists withheld fixtures under `withheld` with the reason, and
  never serves them.
- The Test Console sends the contract its run was against (broker-run now
  returns `contract: { version, entitySet }`). Capture schema and Capture
  fixture refuse with `409 CONFLICT` when the interface has moved on since.

**Discovery's `callable` is the data route's verdict (A42).** It was a copy of
the grant rules and said `callable: true` for feeds the data route refuses on
every call: no entity set, a catalogue service that does not resolve, no
connection the credential binds to. Discovery now runs the data route's own
steps in its order: `decideReadAccess` (the read path's grant decision, P0.1's
binding included), `selectConnectionForEnvironment` on the organization's
connection metadata, and `resolveReadDefinition`
(`src/lib/northbound/read-verdict.ts`). Each interface also carries `refusal`,
the reason the data route would give (additive). The credential's own state
(expired, rotated out, revoked, P0.11) is refused by `authenticateClientToken`
before either route runs, identically.

**The Test Console's audit row says why a run failed (A56).** The dry-run row
now carries `failureReason`, as the data route's does, and the server logs
`[studio] broker-run read failed` with the correlation id — so the id the console
shows can tell a rotated client secret (`TOKEN_*`) from a SAP fault.

**A 404 run is a 404 fixture (A57).** A run the broker answers `404 NOT_FOUND`
was recorded as the `error` fixture, which the mock served as `502
UPSTREAM_ERROR "The tenant could not be reached."`. Each broker outcome now maps
to its own scenario — `data`, `empty`, `needs_setup`, `not_found`, `timeout`,
`error` — and the fixture's status and error code come from the broker's own
tables (`src/lib/northbound/read-status.ts`). A timeout and a 5xx can now be
captured, too. Fixtures already stored as `error` with `sourceStatus` 404 are
served as `not_found` on the way out.

**The generated client compiles under strict.** `client.ts` cast the parsed
body `as typeof json`, which TypeScript reads as `null` there, so the file failed
`tsc --strict` in the developer's repository. It now names its envelope type and
avoids parameter properties (refused by `erasableSyntaxOnly`), and a name
containing `*/` can no longer end its header comment (nor `mock.mjs`'s). A new CI
step, **Generated client compiles under strict** (`pnpm check:scaffold-client`),
compiles the generated file for six interfaces under `--strict`, under the
stricter flags beside it, with the DOM lib and with Node's types.

**Deferred navigations.** Already removed from served rows, fixtures and new
schemas (`src/lib/sap-public/odata-envelope.ts`, audit batch 2); legacy schemas
are reconciled by `servedResponseSchema`. P0.4 keeps that path: the contract
filter runs before it.

## What happens on deploy

- The migration `20261023010000_contract_stamps` adds two nullable columns to
  `MockFixture` and stamps existing captures where the audit trail establishes
  their contract. Nothing is deleted.
  - An interface still at version 1 has never changed contract: its schema and
    fixtures are stamped **current**.
  - Otherwise the Studio PATCH audit (`ConfigAudit`, `entityType = 'Interface'`,
    `before.version` ≠ `after.version`) dates each version change. When the
    latest such row reaches the interface's version, a capture made after it is
    stamped **current**, and one made at or before it is stamped with the
    earlier version it belongs to (**stale**: kept, never served).
  - Anything else stays unstamped (**unverified**: withheld).
- The running code ignores both columns and the new JSON keys, so the migration
  is safe ahead of the code, and a code rollback is safe after it.
- Developers whose interface lost a schema or fixture to `stale` or `unverified`
  see `schemaCaptured: false` with a `schemaState` and `schemaNote`, Studio says
  "not served; capture it again", and the kit lists the fixture as withheld.
  The fix is one Test Console run and a capture.
- Discovery's `callable` turns false for interfaces the data route was already
  refusing. No call that succeeded before fails now.
- A Studio tab opened before the deploy keeps working: its captures carry no
  contract and are judged on the current row, as before; its `honestStatus`
  capture body is still read, now with NOT_FOUND → `not_found`.

## Finding what was withheld

Schemas not of their interface's current contract:

```sql
SELECT i."organizationId", i."id", i."name", i."version", i."entitySet",
       i."responseSchema"->'x-captured'->>'interfaceVersion' AS "stampedVersion",
       i."responseSchema"->'x-captured'->>'capturedAt'       AS "capturedAt"
FROM "Interface" i
WHERE i."responseSchema" IS NOT NULL
  AND ((i."responseSchema"->'x-captured'->>'interfaceVersion') IS NULL
       OR (i."responseSchema"->'x-captured'->>'interfaceVersion') <> i."version"::text
       OR (i."responseSchema"->'x-captured'->>'entitySet') IS DISTINCT FROM i."entitySet");
```

Fixtures not of their interface's current contract:

```sql
SELECT f."organizationId", f."interfaceId", f."scenario", f."interfaceVersion", f."entitySet",
       i."version", i."entitySet" AS "currentEntitySet", f."capturedAt"
FROM "MockFixture" f JOIN "Interface" i ON i."id" = f."interfaceId"
WHERE f."interfaceVersion" IS DISTINCT FROM i."version"
   OR f."entitySet" IS DISTINCT FROM i."entitySet";
```

The remedy is the builder's: run the interface in the Test Console and use
Capture schema / Capture fixture. An operator should not stamp a capture by hand
unless they know which contract it was read under; a wrong stamp would publish
another contract's shape, which is the defect this closes.

## Known limits

- Discovery selects the connection on metadata and does not open secrets, so a
  stored connection whose secrets no longer open (`CONNECTION_UNREADABLE`) is
  reported callable; the call answers `403 CONNECTION_NOT_CONFIGURED`. The
  Studio binding preview has the same boundary for the same reason.
- `callable` says the broker would make the call, not what the tenant answers.
- A Studio tab from before the deploy can still capture from a run of the
  previous contract (it sends no version). The stamp is taken from the current
  row then, as before; this closes once the tab is reloaded.

## Verifying

- `pnpm check:scaffold-client` — the generated client compiles.
- `tests/unit/studio/contract-provenance.test.ts` — the A38 sequence through the
  routes, and "the schema endpoint never serves an older version" for every
  stamp against every contract.
- `tests/unit/studio/mock-broker-status-parity.test.ts` — mock and broker
  statuses and codes match for every failure reason; the dry-run row carries the
  data route's failure reason.
- `tests/unit/northbound/read-verdict.test.ts` — discovery's `callable` and
  `refusal` agree with the data route on 6,300 combinations.
- `tests/integration/contract-stamp-backfill.test.ts` — the backfill, against
  real PostgreSQL.
