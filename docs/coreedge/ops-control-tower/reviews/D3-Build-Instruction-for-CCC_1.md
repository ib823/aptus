# D3 · Build instruction — CoreEdge Ops/Control Tower, post-merge remediation

**Paste this into a fresh Claude Code session on Opus 5 in the `aptus` repo, with the pack attached.**
You have the repository and the Build Bible. You have not seen the review that produced this list; everything
you need is here, with `file:line` for each item so you can verify before you change anything.

**Baseline:** `main` @ `690418f6c01d0cad8f2b8882dc11522157659d70` (#177). #175 merged at `3bda1e8`
byte-identical to the branch that was reviewed, so every item in Part 2 is live on `main`.

**Already done, do not redo.** Three items from an earlier version of this list have shipped in #176 and #177:
the `typecheck:strict` fix (the real cause was a heap crash masked by a pipe, not a missing `prisma generate` —
your diagnosis was better than the one it replaced), the two `permissions.ts` role deny-lists, and the
`WORKBENCH_PATHS` allow-listing for `/operations`, `/control-tower` and `/api/ops/`. The Upstash `peekRateLimit`
test gap is closed too. Nothing below repeats them.

**Before you start:** record the current HEAD SHA. If `main` has moved past `690418f`, re-verify each citation
below before acting on it — say which ones no longer resolve rather than adjusting silently.

**Standing rules for every item.** Green on `pnpm typecheck:strict`, `pnpm lint:strict`, `pnpm test`,
`pnpm build` before the next. A schema change ships a real migration directory. No update/delete/upsert on
`NorthboundAuditEvent` or `ConfigAudit`. No secret, token, hash, `secretsCiphertext`, `baseUrl` or SAP host in
any response. Every query org-scoped. Stop and report rather than guess.

---

## Part 1 — Correctness fixes on merged, live code (do these first, in this order)

### W1 · The unscoped `upsert` — the last instance of the pattern #169 removed

`src/lib/northbound/issue.ts:72-73`:

```ts
const row = await prisma.solutionClient.upsert({
  where: { solutionId: input.solutionId },
```

`SolutionClient` is in `TENANT_ANCHORED_MODELS` (`src/lib/studio/tenant-scope.ts:148-158`). The `create` branch
stamps `organizationId` (`:75`); the **`update` branch does not filter by it**, and that branch rotates
`tokenHash`, resets `environment` and `expiresAt`, and revives a revoked credential (`:88-90`).

Not exploitable today — `POST /api/studio/clients` re-scopes the solution through `scopedById` before calling.
But the tenant boundary lives in the preceding line, which is exactly what #169's title rejects.

**Do:** replace with an explicitly scoped read-then-write, or add a compound unique on
`(organizationId, solutionId)` and upsert on it. `src/lib/sap-public/connection-resolver.ts:399` is the pattern
to copy — it upserts on `organizationId_product_key`, so the organization is inside the key.

**Then close the hole that hid it.** `tests/unit/studio/tenant-scope-coverage.test.ts:54-82` scans for
`update|updateMany|delete|deleteMany` and **not `upsert`**. Add `upsert` to that alternation. Expect the scan
to then flag `connection-resolver.ts:399` — confirm it is safe (the org is in the compound key) and make the
test recognise a compound-key `where` rather than loosening the regex.

**Done when:** no anchored-model mutation anywhere in `src/` has a `where` without an organization, the scan
covers `upsert`, and a test proves the scan fails on a deliberately unscoped `upsert`.

### W2 · The discovery endpoint contradicts the enforcement path

`src/app/api/northbound/interfaces/route.ts:63` computes the per-interface `callable` flag with `isGranting`.
The read path uses `grantsRead(decision, environment)` (`src/lib/northbound/access.ts:228`). They disagree for
`SANDBOX_ONLY` outside SANDBOX: `callable: true`, then 403.

That endpoint's own comment (`:78-79`) says it exists so a developer can see why a call would be refused
*"instead of discovering it as a 403"*. As written it manufactures the 403 it was built to prevent.

**Do:** use `grantsRead(g.decision as GrantDecision, client.environment as GrantEnvironment)` at `:63`.

**Done when:** a test asserts that a `SANDBOX_ONLY` grant in a non-SANDBOX environment yields `callable: false`
from the listing **and** 403 from the data route — the two asserted together, in one test, so they cannot drift
again.

### W3 · The `support` role is missing from fourteen untyped registries

PR #170 fixed nine typed `Record<UserRole, …>` maps plus `ALL_ROLES`. These were not swept. Fix in this order:

**Live bug first — `src/lib/onboarding/flow-engine.ts:22-41`.** The `switch (role)` has no `support` case and
falls to `default: return "/dashboard"`, while `ONBOARDING_FLOWS.support` (`src/types/onboarding.ts:183`) sends
the persona to `/operations`. Onboarding tells a support user where to go and then routes them elsewhere.

**Then the rest:**

| File | Line | What |
|---|---|---|
| ~~`src/lib/auth/permissions.ts`~~ | ~~`:57-60`, `:156-159`~~ | **done in #176** — skip |
| `src/components/admin/UserManagementTable.tsx` | `:31` | `ROLE_COLORS: Record<string,string>` |
| `src/components/admin/PendingInvitationsTable.tsx` | `:22` | `ROLE_LABELS: Record<string,string>` |
| `src/components/collaboration/ActivityEntry.tsx` | `:44` | `ROLE_LABELS: Record<string,string>` |
| `src/lib/tour/tours.ts` | `:239`, `:354` | role arrays — no tour for `support` |
| `src/lib/notifications/recipient-resolver.ts` | `:40`, `:62` | inline `.includes()`; **also contains `partner_manager` and `client_lead`, which are not in `UserRole` at all** — remove them |
| `scripts/migrate-roles.ts` | `:107-111`, `:118-122` | a literal `Set` of the eleven names — the structural twin of `VALID_ROLES`. Every support user is reported unrecognised and skipped |

**The three `Record<string, …>` component maps should become `Record<UserRole, …>`** so the compiler carries
them next time. Where a component genuinely handles unknown strings, keep the widening but give it an explicit
fallback rather than `undefined`.

**Then stop this recurring.** Add one test that asserts every role in `ALL_ROLES` round-trips through
`mapLegacyRole` **and** appears in each untyped registry that must be exhaustive. Today the only guard is
`tests/unit/role-permissions.test.ts:250-255`, which iterates `ALL_ROLES` — so a role missed in both
`ALL_ROLES` and `VALID_ROLES` passes silently.

**Also update these test-side registries**, which are why the production omissions were invisible:
`tests/unit/dashboard-widgets.test.ts:10-21`, `tests/unit/onboarding-flows.test.ts:11-23`,
`tests/unit/validation/api-schema-validation.test.ts:206-209` and `:451-455`,
`tests/security/authorization.test.ts:31-42`, `tests/unit/permissions/permission-matrix.test.ts:24`.
Two are worse than stale and should be rebuilt rather than patched: `tests/helpers/auth.ts:63-74` carries a
separate `PlatformRole` union with roles that no longer exist, and `tests/factories/user.factory.ts:64-74`
contains `partner_admin` and `client_sponsor`, neither of which is a `UserRole`.

**Done when:** `support` resolves correctly through every path, no registry contains a phantom role, and one
test fails if a future role is added to `UserRole` without being added everywhere it must be.

### W4 · Stale doc comment contradicts shipped code

`src/lib/studio/rbac.ts:9-15` still says the union *"has no `developer` or `support` value… Support → v2"*,
forty-five lines above `isSupport()` at `:69`. Rewrite the header to describe what the file now does.

### W5 · Write the habit down, not just the config (#176 did the config)

The heap bump on `typecheck:strict` is shipped. The half that is not shipped is the habit that hid it: the
usual invocation `pnpm typecheck:strict | grep "error TS"` **discards the exit code**, so a crashed run and a
clean run are indistinguishable — both print nothing. That is what made an aborting type checker look like a
passing one for an unknown period.

**Do:** add a short note to `CONTRIBUTING.md` — never pipe a verification command whose exit status you are
relying on; run it bare, or check `$?`. One paragraph. This is the kind of finding that recurs precisely
because it lives in muscle memory rather than in config, and #177 is a live demonstration that a warning
recorded only in a file header does not survive contact with the next person to touch it.

**Do not** add a CI step. CI runs the script unpiped and was never affected.

---

## Part 2 — The four Ops endpoints, now merged and live

The four endpoints are correctly specified (Build Bible v3 §7 — `broker-traffic` `:449`, `write-ledger` `:462`,
`connections-health` `:478`, `tokens` `:513`), the role gate is right and uniformly applied, secret-safety is
clean, and no audit-module test is at risk.

**But #175 merged byte-identical to the reviewed branch, so all five items below are live on `main`.** They
were review comments; they are now defect fixes. None is exploitable — three of the five cause an Ops screen to
report a number that is wrong in the operator's favour, which is the specific failure mode this product is
built to avoid, and all three would have shipped invisibly because no screen consumes them yet.

Do these before any screen reads these endpoints.

### W6 · Use the tenant-scope helpers, not a spread

`src/lib/ops/guard.ts:52-58` computes a real branded `TenantScope` and stores it on `actor.scope` — and no
route reads it. All six queries spread `...opsOrgFilter(actor)` (`:78-80`): `broker-traffic:60`,
`write-ledger:59` and `:73`, `connections-health:44`, `tokens:50`, `:55`, `:72`.

The argument in the guard's comment — that `{}` is the only place widening is expressible — is a good one, and
worth keeping for the global-admin branch. But a spread can be forgotten at a call site; `scopedWhere(scope,
{...})` cannot be called without a scope, and it places `organizationId` **last** so nothing can override it.

**Do:** for the `scoped` branch, call `scopedWhere(actor.scope, {...})`. Keep the explicit `global` branch as
the single expressible widening. The existing scoping test (`tests/unit/ops/ops-endpoints.test.ts:94-110`)
should keep passing unchanged.

### W7 · `environmentBinding.agreed` counts calls that never touched a connection

`src/app/api/ops/broker-traffic/route.ts:100-109` and `:135` — `agreed = rows.length - unverified - mismatch`.
Rows with `connectionId === null` (refused at auth, throttle or the grant gate) match neither branch and land in
`agreed`. A window of 429s and 403s reports a wall of agreed bindings when zero bindings occurred.

**Do:** add a `notApplicable` bucket, or exclude `connectionId === null` from the denominator. Say which in the
payload.

**Done when:** a test feeds rows with `connectionId: null` and asserts they are **not** counted as agreed. The
current binding test (`:190-199`) only uses rows that have a connection, which is why this survived.

### W8 · Counts are computed over the truncated page and provenance does not say so

`broker-traffic:60-81` applies `take: limit` (default 100) and then derives `counts.total`, `byStatus`,
`bySolution`, `byToken`, `latency` and `environmentBinding` from that page. 5,000 calls in the window reports
`total: 100`. `truncated` is set at `:145`, but `provenance.missing` (`:148-153`) lists three audit-write gaps
and not the limit — the largest and most predictable undercount of the four. Same shape at
`write-ledger:104-107`.

`opsLimit`'s own comment reads *"Silent truncation is never acceptable"* (`guard.ts:92`).

**Do:** either compute the counts with a separate unlimited `groupBy`/`count` and keep `take` for the row list
only — the honest fix — or add truncation to `provenance.missing` with the limit and the true total. Prefer the
first; the second is acceptable if the query cost is a concern, but then the total must be real.

### W9 · `counts.revoked` is structurally always zero

`src/app/api/ops/tokens/route.ts:52-57` filters `isActive: true` unless `includeRevoked=1`, while
`revokeClientToken` sets both `isActive: false` and `revokedAt` (`src/lib/northbound/issue.ts:145-147`). The
branch at `:80` can only fire for a row with `revokedAt` set while still active — which nothing produces. The
default view renders 0 and implies nothing has been revoked.

**Do:** count revoked with its own query regardless of the flag, or drop the field and let the caller pass
`includeRevoked=1`. Do not ship a tile that is always zero.

### W10 · Three smaller items in the same PR

- `tokens:44` starts a promise and attaches its handler at `:78` across two intervening `await`s — an
  unhandled rejection rather than a 500. `Promise.all` costs nothing.
- `connections-health:44` silently excludes `isActive: false` connections with no provenance line, unlike every
  other omission in the PR. Add the line or drop the filter.
- `guard.ts:12` says "seven routes"; four shipped. Fix the comment.
- Add tests for the `opsWindowHours` / `opsLimit` clamps (`guard.ts:83-95`) — the 30-day and 500-row ceilings,
  `hours=0` and `hours=-1` — and for the `solutionId` / `environment` filter pass-through on `broker-traffic`.
  None is currently covered.

### W11 · Extend the secret scan to the new directories

`tests/unit/studio/studio-guard-coverage.test.ts:35-39` scans `src/app/(studio)`, `src/lib/studio` and
`src/components/studio`. PR #175 introduces `src/app/api/ops` and `src/lib/ops`, which now handle credential
and connection data — `tokens/route.ts:44-46` legitimately references `secretsCiphertext` in a filter.

**Do:** add both directories to the scan and give the filter-only reference an explicit, commented allowance,
so the exception is recorded rather than absent.

---

## Part 3 — Conditional work (the repository owner resolves each; build only the branch they choose)

### W12 · If the owner says "build throttle and incidents"

Build `GET /api/ops/throttle` (Bible v3 §7 `:501`) and `GET /api/ops/incidents` (`:519`), same guard, same
provenance discipline as the four in #175.

- **Throttle must use `peekRateLimit`** (`src/lib/security/rate-limit.ts:173`), never `checkRateLimit`. A test
  must assert the peek does not consume: peek more times than the limit, then `checkRateLimit` once and assert
  it is allowed.
- Report the **four** real buckets with their real keys, and label the IP-keyed ones *per client IP*, never
  *per tenant*. Only the two northbound buckets have persisted 429 history; say so for the others.
- **Incidents: the severity rules are a product decision.** Write them into code as named, exported, tested
  constants. A severity a reader cannot reproduce from the source is a fabricated judgement.

### W13 · If the owner says "do not build catalogue freshness as specified" (recommended)

Do **not** build `GET /api/ops/freshness` as an org-scoped endpoint. `SapHubContent` has no `organizationId`,
probes are keyed by env tenant, and the only writer is an admin-gated route that probes env-configured tenants
only — so an org-scoped endpoint returns empty for every organization. Report back with a one-paragraph
respecification of it as a **deployment-scoped** catalogue-provenance panel (no tenant strip, no environment
chip, staleness threshold as a single named constant printed on screen), and stop there.

### W14 · If the owner says "add a second consultant persona"

Add one entry to `TEST_USERS` in `src/lib/auth/dev-login.ts:57-62` — a second `consultant`, e.g.
`consultant-two@abeam.test`. The route already accepts it (`src/app/api/auth/test-login/route.ts:92-130`) and
places it in the same org.

**Do not weaken any gate to make the loop walkable.** Both refusals are correct: `POST /api/studio/clients`
refusing an owner to issue their own solution's credential (`clients/route.ts:114-136`), and
`evaluateDecision` refusing self-approval (`src/lib/studio/grants.ts:166-172`). The loop requires two humans by
design; the fixture, not the design, is what was missing.

**Done when:** the full loop — register → owners → credential → interface → entitySet → request → approve →
broker read — is walkable through the UI using two dev-login sessions, with no database access. Write that walk
up as an e2e test if the cost is reasonable.

### W15 · If the owner settles the ownership question

The UI offers only claim and release (`src/components/studio/SolutionsClient.tsx:299-303`); the PATCH route
accepts an arbitrary owner id (`src/app/api/studio/solutions/route.ts:41-43`). The two layers disagree.

- **If claim-only is the position:** tighten the PATCH schema to refuse an owner id that is not the caller's,
  and say so in the UI copy.
- **If assignment is the position:** add a user picker scoped to the organization's members.

Either way the server and the UI must agree afterwards. Do not implement both.

### W16 · If the owner says "proceed with CT3 before `dc3`"

Build the Operations Center screens from `dc2` **plus** the Inventory v3 content spec and the design
commission's A/B delta list, and name the three substitutions explicitly in the PR description:

1. the provenance-note treatment (B5) — you are choosing it, not implementing a design
2. the *binding unverified* visual state (B1) — must read as distinct from both a health status and an
   environment chip, and note the existing rule that an unknown environment renders **no chip at all**
3. sparse-data density (B4) — one pending grant must not look like a broken screen

Everything else in the delta list is determinate: drop `NEVER_TESTED` from the status scale but keep the label
for the null column, add `NO_PROBE_PATH` and count it under *unknown*, count only what is countable in the write
ledger, omit latency in all five places until `durationMs` has a reader, and use the write ledger's empty-state
copy as written.

**If the owner says "wait for `dc3`":** do not build CT3. Nothing else is blocked — Part 1, Part 2, W12 and W14
are all independent of it.

---

## Part 4 — One process fix, do it in whichever PR lands first

**Commit the pack.** `CCC-Ops-ControlTower-Build-Bible-v3.md`, `CoreEdge-Ops-ControlTower-Inventory.md` and the
design file are attachments, not repository files. A reviewer working from the repository alone cannot find the
authority for PR #175's four endpoints and would be right to say they were unspecified — they are specified, in
a document that is not there.

Commit them to `docs/coreedge/ops-control-tower/`, with superseded versions under `archive/` and a README saying
why they are kept.

---

## How to report

Post a short summary per item: what you verified before changing it, what changed, which tests were added, what
is now green. **Where a citation above no longer resolves, say so rather than adjusting silently** — a stale
line number usually means something else moved too.

Stop and report, do not guess, on: a fix that requires widening a gate, a query you cannot scope, a metric whose
numerator and denominator are not stated somewhere you can cite, or any instruction here that the code
contradicts. A stopped item is cheap; a plausible-looking fix to a defect you did not reproduce is not.

---

*End of D3.*
