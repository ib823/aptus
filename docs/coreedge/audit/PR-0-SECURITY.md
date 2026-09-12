# PR-0 — the security items from the audit's section E

Everything here comes from `docs/coreedge/audit/AUDIT.md` §E. It is independent of the
console redesign and merges before it: none of it depends on a design decision, and all of
it is on the path the redesign will then build on.

The seven items, what was actually wrong, and what now holds.

---

## 1 · E15 (P0) — live SAP reads with no grant and no audit row

**Was.** `/api/sap/tdd/preview`, `/entities` and `/operations` each open a live connection
to a client's SAP system and issue real OData requests. The only gate was
`refuseUnlessMayProbeTenant` — a Studio role. No grant was consulted, no environment was
capped, and nothing recorded that the read happened. The broker's own comment had already
named all three when the Test Console was moved off these routes
(`src/app/api/studio/test/broker-run/route.ts:4-9`).

**Now.** A shared guard, `src/lib/sap-public/console-read-guard.ts`:

- **An environment ceiling, or a grant.** Sandbox and Dev are readable freely — that is the
  builder's job and a discovery console that needed a grant to discover what to request a
  grant for would be a circular gate. TEST, PROD, or a connection that has **not declared**
  its landscape need a live, approved, unrevoked, unexpired `ApiAccessGrant` for that
  environment.
  - TEST is refused as firmly as PROD. A client's TEST system holds their data and answers
    to their change control.
  - Undeclared is refused, not permitted. The ceiling is "Sandbox and Dev are free"; a
    system that will not say which it is cannot be shown to be under it. This is the
    opposite of the broker read path's `bindingUnverified`, deliberately — that path has a
    grant behind it and this one, by construction, may not.
  - The predicate is `grantsRead`, the function the data route enforces with — not
    `isGranting`, which is display-only and disagrees on `SANDBOX_ONLY` outside SANDBOX.
    The northbound discovery route has been wrong on exactly this twice.
- **An audit row, always, including the fan-out.** Every read writes a
  `NorthboundAuditEvent` with `dryRun: true` and `actorUserId` set — on success, on refusal
  and on upstream failure. `?probe=1` on `/entities` is recorded as its own row under
  `-probe-fanout-<service>`, because it is one read per entity set the service exposes: the
  most amplifying thing the console can do to a tenant, and previously the least visible.
- **A cache hit is not audited.** It reached no tenant; a row would claim load the request
  did not cause. The read it was served from was recorded when it happened.
- **The deployment tenant is exempt from the grant gate, and the code says why.** A
  `{PREFIX}_*` tenant belongs to no organization, so no grant could ever be written for it.
  It is still role-gated and still audited.

**Schema consequence.** `NorthboundAuditEvent.solutionId` and `.clientTokenId` are now
nullable, and `.actorUserId` is new. A console read has no solution and no credential, so
under `NOT NULL` there was no honest row to write — which is exactly why those reads were
unaudited. A sentinel like `-console-` would have invented a solution and then grouped every
console read in the estate under it on the operations board. A machine call names its
solution and credential; a console read names its actor; every row names one or the other.

Three read paths that consume those columns were updated to skip rather than coerce:
`broker-traffic` (counts console reads in the total and in neither breakdown), `throttle`
(a 429 with no credential cannot be attributed to one), `topology` (the graph is drawn from
solutions; a row with none has nothing to attach to).

## 2 · E16 (P0) — the caller chose the entity set

The grant names a **service**. The entity set decides **which data inside it** leaves the
customer's system, and nothing downstream re-checks it.

| Path | Was | Now |
|---|---|---|
| `GET …/data` | `iface.entitySet ?? ?entity=` — a fallback | `iface.entitySet`, full stop. `?entity=` is not read at all, and the copy inviting it is gone. |
| `POST …/data/write` | `parsed.data.entity ?? iface.entitySet` — an **override** | `iface.entitySet`. A supplied `entity` that differs is **refused**, not ignored. |
| `POST …/test/broker-run` | `input.entity ?? iface.entitySet` | Same rule, refusal code `ENTITY_NOT_YOURS_TO_CHOOSE`. |

The write path was the dangerous direction: a second person approved that grant with the
write checklist, and the field let a caller write somewhere else inside the service.

`entity` is still **accepted** by both bodies so that sending it is refused out loud. A
field accepted and quietly discarded is the same confusion from the other side — the client
believes it wrote to one dataset while the broker wrote to another.

A feed with no entity set is refused as the configuration gap it is, with a different
sentence when the feed is still a draft.

`/api/sap/tdd/preview` **keeps** `?entity=`, deliberately: it has no interface, and choosing
an entity set is the question it exists to answer — it is how a feed's set gets decided.
What changed there is everything around it (item 1).

## 3 · E14/E15 (P0-adjacent) — no retention, no correlation lookup

- **Index.** `@@index([organizationId, correlationId])`. Every northbound response hands the
  caller a correlation id and the manual tells them to quote it; there was no query path
  that could find the row again. Organization-scoped, because every read of this table is,
  and an unscoped equality on a shared id is a cross-tenant lookup waiting to be written.
- **Retention.** `src/lib/northbound/retention.ts`, default **30 days**, configurable via
  `NORTHBOUND_AUDIT_RETENTION_DAYS`, enforced nightly by
  `/api/cron/northbound-retention` (03:45 UTC, `CRON_SECRET`, recorded in `CronRunLog`).
  - 30 days is the window the operations console can actually query — `opsWindowHours`
    clamps to `24 * 30` — so a row older than that is invisible to every screen that reads
    the table.
  - A period outside `7..3650` is **refused, not clamped**, and the job then deletes
    nothing. Below the floor is not a shorter retention, it is no audit trail. Failing to
    delete is recoverable; deleting on a misread setting is not.
  - Bounded batches, oldest first, per tenant, with the age re-checked at deletion time.

**On "append-only".** `reap.ts` declined to sweep this table and named three conditions —
a stated period, a legal basis, a tested exception. All three are met and written down in
`retention.ts`. The guarantee itself is unchanged and its test was made *more* precise
rather than weakened: no module anywhere may `update`/`updateMany`/`upsert` an audit row
(no exceptions, retention included), and exactly one named module may delete — by age,
within a tenant, and `ConfigAudit` is not swept at all.

## 4 · E14 (P1) — the two auth backdoors

`/api/auth/test-login` mints a real `platform_admin` session; `/api/auth/verify-izzat` mints
one for a seeded user.

- **Excluded from every production build, not only Vercel's.** The strip script required
  `VERCEL=1`, so a Docker image, a self-hosted runner or any other pipeline shipped both and
  rested on four environment variables staying unset. The condition that actually matters is
  not which host is building but whether the checkout is **disposable** —
  `isDisposableCheckout` recognises `VERCEL`, `CI`, `GITHUB_ACTIONS`, `NETLIFY`, `RENDER`,
  `FLY_APP_NAME`, and `STRIP_TEST_AUTH=1` for a pipeline that declares none of them. A
  contributor's machine is still never touched: `next build` sets `NODE_ENV=production`
  locally too, and deleting source files from somebody's working tree is a worse failure
  than the one this prevents. Preview deployments are still left alone — the E2E suite needs
  them.
- **The runtime honours the deploy-time acknowledgement.**
  `scripts/check-production-env.js` has always refused to *build* a production deploy
  carrying these flags unless `INTERNAL_TEST_DEPLOYMENT=true` acknowledges it. Nothing
  checked that at **runtime**, so a variable set after the build — the exact case the strip
  script's own header warns about — opened the backdoor without the acknowledgement.
  `productionBackdoorBlock()` closes it: the build-time contract and the runtime contract
  are now the same contract.
- **Every attempt leaves a durable row.** `logBackdoorAttempt` was a `console.warn` beneath
  a comment calling it "audit-logged". New `BackdoorAttempt` table: endpoint, outcome, IP,
  truncated user agent, email, user id. Not a foreign key to `User` — the email frequently
  belongs to no user, and the failed attempts are the interesting ones.
- **A success that cannot be recorded does not happen.** `recordBackdoorSuccess` returns
  false if the row cannot be written, and both routes refuse. This is the one place an audit
  failure fails the request. Everywhere else the rule is "a gap in the trail beats losing
  the caller's work"; here the caller's work *is* a `platform_admin` session obtained
  without credentials.
- **Roles validated against the union.** `test-login` already validated the role it is
  *asked* for. `verify-izzat` takes no role, so the equivalent check is on the role the
  seeded user already carries — a user seeded outside `UserRole` produces a session no
  screen can reason about.

## 5 · E15 (P1) — two indistinguishable ACTIVE connections

Settled decision **D1**, built as written.

- `SapConnection.environment` is now the enum `SapEnvironment (SANDBOX|DEV|TEST|PROD)`,
  **still nullable** — "undeclared" is a state the resolver models and removing it would
  force an operator to guess.
- The partial unique index is **dropped and recreated** by the same migration, because
  Postgres drops an index when its column's type changes. A migration that retyped and
  walked away would have silently removed the invariant from every environment that ran it.
- The conversion is **lossy in one direction, deliberately**: `SANDBOX|SBX`, `DEV|DEVELOPMENT`,
  `TEST|QA|QAS`, `PROD|PRD|PRODUCTION` convert case- and whitespace-insensitively; anything
  else becomes NULL. Silently calling someone's `STAGING` row `PROD` is how an accidental
  production write happens.
- The connections form **refuses** an unrecognised word rather than storing it as
  undeclared, which would leave the consultant believing the system is declared while the
  broker refuses every write with `UNDECLARED_ENVIRONMENT_WRITE`. Blank still means
  undeclared, which is a legitimate answer.
- The invariant is enforced **twice**, and the schema comment says why: in the database for
  every environment built from migration history, and in the API for the `db push`
  databases `ci.yml`'s fast jobs create. The route check is what a db-push database has; the
  index is what stops a row arriving by any other door.

Verified against a live PostgreSQL 16: migrations apply, `prisma migrate diff` reports zero
drift, the twin `INSERT` is refused by the index, a different environment is accepted, an
inactive twin is accepted, two undeclared rows are accepted, and `STAGING` cannot be written
at all.

## 6 · E18 (P1) — `broker-run` parity

- The same **per-credential bucket** the northbound routes use: `northbound:<clientId>`,
  60/min. It was covered only by middleware's IP-keyed `sapLive` bucket, which is the wrong
  shape for the same two reasons it is wrong on the data route — several consultants behind
  one office address throttle each other, and the budget is not the one the credential being
  exercised actually has. The read bucket deliberately, not a third one: the point of a dry
  run is that it costs what the real call costs.
- The 429 is **audited** with `dryRun: true`, like every other northbound refusal.
- `touchClientLastUsed` is called, fire-and-forget. A credential exercised daily from Studio
  looked dormant on the operations board — the screen that exists to spot an unused
  credential and retire it.

## 7 · E14 (P2) — the dead `"admin"` string

Four places, not one: the admin layout, the brownfield guide content route, the portal nav
and the mobile tab bar all hand-wrote `["platform_admin", "admin"].includes(user.role)`.

It was **not simply deleted**. Dropping `"admin"` would change behaviour for any row still
holding the legacy value — locking a real administrator out rather than tidying a string.
`mapLegacyRole` has mapped it to `platform_admin` since Phase 17 and is what `isAdminRole`
already delegated to. The four copies became one call to `isAdminRoleName`, which lives in
`role-migration.ts` because two of the four callers are client components and
`permissions.ts` imports prisma.

---

## Explicitly not changed

- **The Replay credential logic.** The audit found it correct and a test now pins it.
- **The RETIRED refusal.** Already applied on both paths through the shared
  `checkSolutionRuntime`; a test pins that it still runs first.
- `RESTRICTED` still does not refuse at runtime — that is decision **D3**, and it belongs
  to a later PR.

## Tests added

| File | Covers |
|---|---|
| `tests/unit/sap-public/environment.test.ts` | The vocabulary, and that it agrees with the migration's own CASE arms |
| `tests/unit/sap-public/console-read-guard.test.ts` | The ceiling and what opens TEST/PROD; the shape of the audit row |
| `tests/unit/api/sap-console-reads-gated-and-audited.test.ts` | All three routes gated, audited, attributable, throttled |
| `tests/unit/northbound/governed-entity-set.test.ts` | The entity set on all three governed paths, and that the discovery console keeps its parameter |
| `tests/unit/northbound/retention.test.ts` | Period resolution, refusal over clamping, bounded per-tenant sweep |
| `tests/unit/auth/backdoor-audit-and-production.test.ts` | Every pipeline strips; the runtime acknowledgement; durable rows; refusing an unrecordable success |
| `tests/unit/studio/connection-environment-enum.test.ts` | The enum, the index's survival, the twin refusal, the unrecognised word |
| `tests/unit/studio/broker-run-credential-parity.test.ts` | The bucket, `lastUsedAt`, and the two things this PR must not have changed |
| `tests/unit/auth/admin-role-single-rule.test.ts` | One rule, legacy value still honoured, no fifth copy |

Four existing tests were updated, each because this PR changed the thing they asserted:
`dod-gaps` (the append-only rule, made more precise), `test-auth-absent-from-production`
(two renamed reasons), `tenant-environment` (the column's type; its real subject — that the
column stays optional — is unchanged).
