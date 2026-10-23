# Runbook: The database budget per governed call (P0.19)

Roadmap item P0.19 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2). The budget lives in `src/lib/governed/db-budget.ts`; CI asserts it in
`tests/integration/governed-db-budget.test.ts`.

## The budget

| Call | Budget | Measured | What the statements are |
|---|---|---|---|
| Read (served, or refused by grant, interface or binding) | **4** | 3 | the key, the interface with its grants and connections, the audit row |
| Read refused by its key (revoked, expired, rotated out, dropped, unknown) | 4 | 1 | the key; no audit row, as before |
| Write (created, refused, or replayed) | **5** | 5 | the read's 3, plus the Idempotency-Key claimed before SAP and its outcome stored after (a replay: the claim that finds the key held, and the stored outcome) |
| Workbench console read making one SAP call and nothing else (P0.14b: preview, the entity list without its probe fan-out, operations) on a stored connection of any environment, served or refused | **4** | 4 | the person's session, the connection with the grants its environment ceiling judges (one statement), the organization's console row, the platform-scope row with its outcome in one statement |
| The same on a deployment tenant | 4 | 3 (by construction) | the session and the two rows; no connection or grant to read |
| An Ariba call (`/api/sap/ariba/call`) | 4 | 3 | the session, the platform-scope row (an Ariba call has no connection and no organization row), and the assessment trail's decision-log entry the route has always written beside it |

Before P0.19 a served read sent 7 statements, a read refused by its grant 6,
a write 11 and a replay 9.

**The console routes that do more than one read** (P0.14b review round 6).
Rounds 3 to 5 filed the capability probe, the catalogue probes and Probe all
under the console read's 4, while CI measured only the preview, operations
and the Ariba call; the capability probe sends 6 and Probe all 6 plus one per
service. They are not held to 4: each sends the console read's statements and
work of its own that predates the pipeline. Their figures are measured, warm,
on a stored DEV connection, served (`CONSOLE_ROUTE_STATEMENTS`,
`src/lib/governed/db-budget.ts`), and the budget test asserts each exactly,
so a change in any of them is seen. Size the pool with these when operators
use them; they are triggered by a person, behind the role gate (Probe all
also once per tenant per ten minutes), not by an application's calls.

| Console route | Statements | What they are |
|---|---|---|
| Entity list with its probe fan-out (`/api/sap/tdd/entities?probe=1`) | **6** | two calls (the metadata, then the fan-out), each with its two rows: the session, the connection, 2 + 2 |
| Capability probe (`/api/sap/tdd/capabilities`) | **6** | the console read's 4, the dynamic catalogue read its probe targets come from, and the decision-log entry the route has always written |
| Catalogue detail with a live probe (`/api/sap/tdd/hub-content/[id]`) | **5** | the console read's 4 and the catalogue row it shows; a V4 address adds 2 (its verification written, then read back), an item with prerequisites its scope-item reads |
| Catalogue list with the live overlay (`/api/sap/tdd/hub-content?dataProbe=1`) | the page's own, plus 4 | the console read's 4, beside the catalogue page's counts and rows and the V4 addresses the overlay verified, which vary with the page (measured once, for a one-page search: 7 in all without the overlay, 14 with it); the test asserts the console's 4 and that everything else is the catalogue's |
| Probe all (`/api/sap/tdd/hub-content/probe-all`), per run | **6** + **1** per service | the console read's 4, the candidate rows and the decision-log entry; then one stored result per service probed, and one more per V4 address it verifies or withdraws |

**The console counts its session** (P0.14b review round 4). The console's
`authenticate` step is the person's session, as the broker's is the key, but
the budget test mocked `getCurrentUser`, so the figures above left it out.
Validating a session was three statements (Prisma's nested select of the
session, its user and the user's organization) and every console route
validated it twice (the probe guard and the route each called
`getCurrentUser`; React's `cache()` memoises only inside a render, not in a
route handler), so a warm DEV preview sent 9 statements, not the 3 written
here. The session is now one joined statement (`sessionLookup`,
`src/lib/auth/session.ts`, held to the Prisma select it replaced by
`tests/integration/session-lookup.test.ts`), which every signed-in request
benefits from, and each console route validates it once and hands it to the
probe guard (`refuseUnlessMayProbeTenant({ viewer })`). The test stubs only
the cookie. The session's `lastActiveAt` stamp is occasional: at most once
every five minutes per session, +1.

**The console is held to the read's budget, 4** (P0.14b review round 5). A
console read is a read through the pipeline, and P0.19 states a separate
budget for writes only. A TEST, PROD or undeclared connection must consult the
organization's grants (the environment ceiling); round 4 looked them up in a
statement of their own and raised the console's budget to 5 to fit it. They
are now read in the connection's own statement
(`loadConsoleConnection`, `src/lib/governed/call-loads.ts`: the named row and
the organization's grants for its environment, both filtered by the caller's
organization, held to the two Prisma queries it replaced by
`tests/integration/governed-call-loads.test.ts`) and judged, unchanged, by
`decideConsoleRead`. They are still read with every call, never cached, since
a cached answer would outlive a revoked grant (the budget test revokes one and
the next preview is refused). The two rows stay two statements, so that
either trail can fail without losing the other or the read.

**The console's platform row is one statement** (P0.14b review round 3).
`recordPlatformConsoleRead` wrote a `PlatformAuditEvent` and its
`PlatformAuditOutcome` as a nested create, which Prisma sends as BEGIN, two
INSERTs, a SELECT and COMMIT, so a warm preview of a stored DEV connection
sent 7 statements where it had sent 2 before P0.14b. It became one
data-modifying CTE, and since wave 2 integration review round 4 it is one
INSERT of a `PlatformConsoleRead` row that holds the event and its outcome
together (`consoleReadInsert`, `src/lib/audit/platform-audit.ts`): atomic
without a transaction, and off the Workbench write tables, which the code
before P0.14b reads as writes. A console route that makes two SAP calls (the entity list with its
probe fan-out) writes each call's two rows; work a route does besides the
call (Probe all's catalogue query and result writes, the capability probe's
catalogue read and decision-log entry) is the route's own, and is stated and
measured in the console routes' table above (review round 6), not hidden in
the read's 4.

**Why a write has its own budget.** The Idempotency-Key must be claimed
before SAP is called (so a duplicate never reaches SAP) and its outcome stored
after (so a retry replays it). Merging those two into one statement would
hold a transaction open across the SAP call, which the pipeline never does.
So a write is a read plus two.

**What counts.** Every SQL statement the call sends, BEGIN and COMMIT
included, before the response or after it. Work moved after the response
(Next.js `after()`, `src/lib/governed/after-response.ts`) shortens the call
but still holds a pooled connection, so it still counts.

**Occasional statements**, outside the steady state and each bounded.
Counted as Prisma sends them: `createMany` and `updateMany` go as BEGIN, the
statement and COMMIT, three round trips, so only the milestone still uses
one (review round 1).

| What | How often | Statements |
|---|---|---|
| The key's `lastUsedAt` stamp, on a write that claims its Idempotency-Key (created, replayed, in conflict) | at most once a minute per key, so most writes of a low-volume app | +0: carried by the claim's own statement (5) |
| The key's `lastUsedAt` stamp, on a read or a write refused before its claim | at most once a minute per key, after the response | +1 (4, within budget) |
| A write whose Idempotency-Key had expired | per such write | +0: renewed by the claim's own `ON CONFLICT` arm (5) |
| An unbound legacy grant's use stamp (P0.1) | at most hourly per grant, only while `COREEDGE_GRANT_BINDING` is legacy, after the response | +1, one UPDATE (a read 4; a write that hour 6) |
| The first-call milestone (P2.12) | once per app and environment per instance, after the response | +3 (`createMany`) |
| An organisation's data key (P0.10) | once per organisation per instance per 10 minutes | +1 |

The last three can take a call over its steady-state budget, once per
period each, and two can coincide (a cold instance's first call of the hour
on a legacy grant). `tests/integration/governed-db-budget.test.ts` asserts
every row but the data key.

## What changed

- **The key: one statement** (`lookupCredential`, `src/lib/governed/call-loads.ts`).
  The current key, the previous key in its rotation overlap, a key the row
  dropped (`RetiredClientToken`) and the owning solution's status were four
  lookups; they are one statement of three index probes, ranked as before
  (current, then previous, then dropped), left-joined to the solution on the
  row's own organization. The write route also reads the sealed write key in
  it, so the write-key check does not read the row again. Every check in
  `authenticateClientToken` is unchanged, in the same order.
- **The interface, its grants and its connections: one statement**
  (`loadInterfaceAccess`). The grants are filtered in the SQL exactly as
  `grantsForInterfaceWhere` filters them, and the connections are the
  organisation's active ones for the interface's product, oldest first, as
  `resolveSapConnections` reads them. `bindConnection` binds from those rows
  (`bindStoredConnections`) with the same opening, the same fail-closed
  `CONNECTION_UNREADABLE` and the same choice.
- **`lastUsedAt` at most once a minute per key** (it was a write on every
  call), after the response.
- **The Idempotency-Key is claimed by one statement**: `INSERT ... ON
  CONFLICT DO UPDATE ... WHERE` the held row has expired, `RETURNING` the
  claim's id (`claimStatement`, `src/lib/northbound/idempotency.ts`). A
  fresh key is inserted and an expired one renewed in that round trip (the
  renewal was a further BEGIN, UPDATE, COMMIT); a held key returns no row,
  raises no error, and only then is the row read and judged as before. A
  fresh key was a read and then the insert. When the key's `lastUsedAt`
  stamp is due, the claim carries it as a CTE (`carryLastUsedStamp`,
  `src/lib/governed/pipeline.ts`), with the same once-a-minute condition in
  its WHERE.
- **An unbound legacy grant's use stamp is one UPDATE, after the response**
  (`recordUnboundGrantUse`); it was an `updateMany` on the response path.
- **The first-call milestone runs after the response.**

**The tenant guard does not see the raw statements.** It is a Prisma
extension, and a raw statement passes it by. The scoping it would demand is
written into the SQL and pinned by `tests/unit/governed/call-loads-sql.test.ts`
(the key lookup's only unscoped predicates are equalities on the presented
hash, on the three columns `UNSCOPED_BY_DESIGN` already sanctions; every table
the access load reads is filtered by the caller's organization, as a
parameter), `tests/unit/northbound/idempotency.test.ts` (the claim inserts
for the caller's organisation and stamps only the credential's row in it)
and `tests/unit/studio/unbound-grant-stamp-sql.test.ts` (the grant stamp is
scoped to the caller's organisation and the due grants). Each writes
timestamps as UTC (`::timestamptz AT TIME ZONE 'UTC'`), as Prisma stores
them, whatever the session's time zone. `tests/integration/governed-call-loads.test.ts` runs both
statements and the Prisma queries they replaced on PostgreSQL over rows built
to tell them apart, another organisation's rows carrying this organisation's
solution and interface ids included, and requires the same answer. The unit
and property tests answer the statements through those same reference queries
(`tests/helpers/governed-loads.ts`), so their fakes still evaluate the
broker's own `where` clauses.

**No transaction is open while SAP is called.** The budget test checks
PostgreSQL itself at every SAP call (`pg_stat_activity`, for the test's own
connections: no session idle in a transaction) and the query log (no BEGIN
without its COMMIT). The static test in `tests/unit/governed/pipeline.test.ts`
also covers the two new modules.

## The pooler

Serverless instances each open their own Prisma pool, so production should
reach Postgres through a **transaction-mode pooler** (PgBouncer, or the
provider's pooled endpoint), with migrations on a direct connection.

| Variable | Points at | Settings |
|---|---|---|
| `DATABASE_URL` | the **pooled** endpoint (Neon: the host with `-pooler` in its name) | `pgbouncer=true&connection_limit=5&pool_timeout=10` |
| `DIRECT_DATABASE_URL` | the **direct** endpoint (no `-pooler`) | none needed |

- `pgbouncer=true` makes Prisma use unnamed prepared statements, which a
  transaction-mode pooler can hand to any server connection. It is safe on
  every PgBouncer version, including those that support named statements.
- `connection_limit=5` is the pool per instance. An instance may serve
  several calls at once, and each holds a connection only for the length of
  one statement, so a call occupies a connection for about (statements per
  call × round-trip time), and the budget above is what sets how many calls
  five connections carry: about `connection_limit / (statements per call ×
  round-trip time)` calls a second before calls queue on `pool_timeout`.
  For a read, 5 / (3 × RTT): with a 5 ms round trip, 5 / (3 × 0.005 s) ≈
  330 a second; with 20 ms, ≈ 80. That is the database's ceiling only; it
  assumes the statements of concurrent calls interleave perfectly.
- `schema.prisma` sets `directUrl = env("DIRECT_DATABASE_URL")`, so `prisma
  migrate deploy` (run by `vercel-build`) connects directly. It must:
  Prisma Migrate takes a session-level advisory lock, which a
  transaction-mode pooler cannot hold.

**The code has no session-level feature that breaks behind a
transaction-mode pooler.** Checked on this branch, over `src/` and the
scripts the deployment runs:

- **advisory locks:** none. The crons' job leases use a row
  (`src/lib/ops/job-lease.ts`, which says why not an advisory lock);
- **`SET` / `set_config`, `LISTEN` / `NOTIFY`, cursors, temporary tables,
  `PREPARE`:** none;
- **row locks (`FOR UPDATE`):** only inside interactive transactions
  (`src/lib/studio/owner-lock.ts`, the organisation users route), which a
  transaction-mode pooler keeps on one server connection for the whole
  transaction;
- **prepared-statement reuse:** only Prisma's own, which `pgbouncer=true`
  turns off.

`tests/unit/db/pooler-compatibility.test.ts` keeps it that way: it fails on
any of these in `src/`.

## The load test

`scripts/coreedge/load-test.ts` drives the real northbound read and write
route handlers, in one process, at a fixed rate with SAP mocked (the Tenant
Twin, P1.6, does not exist yet), and reports the rate achieved, latency
p50/p95/p99, the error rate and the database round trips per call.

```bash
LOAD_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scratch \
  pnpm coreedge:load-test --rps=50 --duration=20 --write-ratio=0.1 --sap-latency-ms=50 --connection-limit=5
```

It seeds an organisation of its own (enough apps that no key reaches its
60-a-minute limit), deletes it at the end, reads only
`LOAD_TEST_DATABASE_URL` and refuses `NODE_ENV=production`.

**Recorded locally** (2026-10-21, a shared 4-CPU container under other load,
PostgreSQL 16 on localhost, one process, pool 5, SAP answering in 50 ms, 10%
writes, 20 s):

| | Calls | Achieved | Errors | Read p50 / p95 | Write p50 / p95 | Statements per call |
|---|---|---|---|---|---|---|
| Before P0.19 (`5d615522`) | 1,000 | 49.7/s | 0% | 73.9 / 92.1 ms | 142.5 / 178.6 ms | 7.4 (read 7, write 11) |
| After | 1,000 | 49.7/s | 0% | 62.0 / 69.7 ms | 122.8 / 131.5 ms | 3.2 (read 3, write 5) |

A read's SAP time is 50 ms and a write's 100 ms (CSRF fetch, then POST), so
CoreEdge's own share of a read fell from about 24 ms to 12 ms at p50 and from
42 ms to 20 ms at p95. A localhost database flatters every figure: on Neon
each statement is a network round trip.

## Open items

- **Confirm production's pooler setting.** Whether production's
  `DATABASE_URL` uses Neon's pooled endpoint with `pgbouncer=true` and
  `connection_limit=5`, and `DIRECT_DATABASE_URL` the direct one, is
  [unverified]: Vercel's variables are not readable from here. Owner: the
  platform admin, with `vercel env pull` (never paste the URL anywhere).
- **The roadmap's 50 calls a second sustained before P3** stays open. The run
  above is one process on a laptop-class database; the target is to be run
  against a production-like environment (a Vercel preview on its own Neon
  project, the twin when P1.6 lands) with the twin answering, and recorded
  here.
- **Each later item states its statements.** Decision-log rows (P3.5),
  manifest lookups (P3.1), the audit chain (P3.10) and twin queries (P1.6)
  fit under the budget, merge into a statement already sent, or change
  `db-budget.ts` with a reason the review accepts.

## What happens on deploy

No migration and no new setting. Every call is answered and audited as
before (`tests/integration/governed-pipeline-golden.test.ts` and the
governance property test are unchanged in what they assert). Visible
differences:

- `SolutionClient.lastUsedAt` moves at most once a minute per key, so a
  screen showing it to the second can be up to a minute behind; the idle
  checks count in days.
- A replayed or conflicting write logs nothing: the claim's `ON CONFLICT`
  raises no unique-constraint error, in the database's log or in the
  application's (Prisma logs every refused query at `error`, caught or not).

## Rolling back

Code only: revert the commit. Nothing was written that the old code cannot
read.
