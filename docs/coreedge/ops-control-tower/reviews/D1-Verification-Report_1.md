# D1 · Verification report — CoreEdge Ops/Control Tower front, PRs #168–#177

**Assessed at:** `ib823/aptus` · `main` · **`690418f6c01d0cad8f2b8882dc11522157659d70`** (`690418f`, #177).
Base for comparison: `70a6cec` (#167). Citations are `path:line @ 690418f` unless another SHA is named.

**The brief says eight PRs. There are ten.** #175 has merged at `3bda1e8` as the brief states, but two further
PRs landed after it and are not in the brief's table:

| PR | SHA | Titled |
|---|---|---|
| #176 | `69101f2` | typecheck was crashing, not passing — and two role deny-lists |
| #177 | `690418f` | Operations Center and Control Tower were behind a locked door |

Both are material. #176 **corrects my own analysis** of C10 (§10). #177 fixes a defect that neither CCC's claim
list nor my previous review caught, and which made everything shipped in #173 and #175 unreachable in
production (§11a). Neither is claimed in §4, so both are assessed here as unclaimed work.

**#175 merged byte-identical to the branch I reviewed** (`git diff --quiet 5e788e3 3bda1e8` → identical). The
five findings I raised against it (N6–N10) are therefore live on `main`, unfixed.

---

## 0 · Headline

**Six of ten claims survive intact. Four do not, and one of those four is a correctness claim about a
security PR's own coverage.**

| Claim | Verdict |
|---|---|
| C1 environment binding | **CONFIRMED** |
| C2 grant semantics | **CONFIRMED** — with a new defect the fix left behind (N1) |
| C3 write-grant expiry | **CONFIRMED** |
| C4 tenant-anchored writes | **PARTIAL** — eleven `update`s fixed; one `upsert` missed (N2) |
| C5 the ninth RBAC site | **PARTIAL** — mechanism exact, sweep materially incomplete (N3, N4) |
| C6 the loop closes | **REFUTED on its headline** — the loop is not walkable |
| C7 breadcrumb | **CONFIRMED** — and well built |
| C8 measurement plumbing | **CONFIRMED** — the test gap I raised last pass was closed by #176 |
| C9 pack corrections | **CONFIRMED** — and the substituted control has a live blind spot (N2) |
| C10 verification gap | **REFUTED as framed** — but my own alternative was also wrong; #176 has the answer |

**Nothing I found is exploitable by an outside caller.** The two security-shaped findings (N1, N2) are a
misleading advisory and a defence-in-depth gap whose guard currently holds one line above it.

**One correction to the commission brief itself** (§4 C6 invited this): the brief states `expiresAt` "is now
mandatory for write grants" in the request schema. It is not. `requestSchema.expiresAt` is `.optional()`
(`src/app/api/studio/access-grants/route.ts:37`). The requirement lives at *approval*
(`src/lib/studio/grants.ts:196`) and as a client-side convenience the code itself labels "NOT the control"
(`src/components/studio/AccessGrantsClient.tsx:341-346`). A direct API caller can still create an expiry-less
write request; it simply can never be approved. That is a defensible design — but it is not what the brief says.

---

## 1 · C1 — environment binding (#168, `ca19be6`) · **CONFIRMED**

**The defect existed.** At `70a6cec`, `resolveSapConnection(orgId, product)` returned `all[0]` from a query
ordered `createdAt: "asc"` with no environment predicate, and `ResolvedSapConnection` carried no `environment`
field at all. Both broker call sites passed no key and no environment.

**It is bound now.** `resolveSapConnectionForEnvironment(organizationId, product, environment, operation)` at
`src/lib/sap-public/connection-resolver.ts:183-213`. The decision table it implements:

| Situation | Result |
|---|---|
| exactly one connection declares the caller's environment | `ok`, `bindingUnverified: false` (`:195-197`) |
| more than one declares it | `AMBIGUOUS` (`:198`) |
| none declares it, none undeclared | `NO_MATCH_FOR_ENVIRONMENT` (`:201`) |
| none declares it, some undeclared, **operation = WRITE** | `UNDECLARED_ENVIRONMENT_WRITE` (`:204`) |
| none declares it, exactly one connection total | `ok`, `bindingUnverified: true` (`:209-211`) |
| none declares it, several connections | `AMBIGUOUS` (`:212`) |

That is decision 4 implemented exactly as settled, including the refuse-don't-guess rule on ambiguity.

**Both paths, no stragglers.** `data/route.ts:125` and `write/route.ts:196` are the only broker call sites and
both use the new resolver. `resolveSapConnection` survives at exactly one place —
`src/app/api/studio/connections/[id]/test/route.ts:60` — where it is called with an **explicit `row.key`** for a
connection the user selected to test. That is the correct use of a key-addressed resolver, not a leftover.

**What the claim does not say, and the owner needs to know.** The brief frames the production exposure as
"an organization holding two or more SAP connections for one product, none declaring an environment". That is
one of **three** breaking classes, and probably not the largest:

- **AMBIGUOUS-undeclared** — ≥2 connections, none declared. The brief's case.
- **AMBIGUOUS-declared** — ≥2 connections declaring the *same* environment (`:198`). Previously the oldest won.
- **NO_MATCH_FOR_ENVIRONMENT** — every connection declares an environment and **none equals the credential's**
  (`:201`). A single connection labelled `DEV` serving a credential stamped `SANDBOX` now fails. This class
  became reachable the moment #164 added the column and someone filled it in.

Matching is `UPPER(TRIM())` on both sides (`:192-193`), so `"prod"`, `" PROD "` and `"PROD"` unify, but
`"PRODUCTION"` does not match a `PROD` credential. See D2 item 1 for the query that settles the population.

---

## 2 · C2 — grant semantics (#168) · **CONFIRMED**, and it left a defect behind

**The defect existed and is fixed.** `grantsWrite` (`src/lib/studio/grants.ts:89-93`) is fail-closed:
`READ_ONLY` → false; `SANDBOX_ONLY` → only in SANDBOX; otherwise only `APPROVED`. `grantsRead` (`:68-72`)
permits all three granting decisions except `SANDBOX_ONLY` outside SANDBOX. Both runtime access paths use them:
`src/lib/northbound/access.ts:133` (write) and `:228` (read).

**Is `isGranting` absent from every runtime access path?** In the *authorization* sense, yes. Three uses remain:
`grants.ts:222` (`highestApprovedEnvironment`) and `:236` (`isExpired`) are descriptive, and
`src/app/api/northbound/interfaces/route.ts:63` is an advisory flag, not a gate.

### N1 · NEW — the discovery endpoint contradicts the enforcement path

`GET /api/northbound/interfaces` computes a per-interface `callable` flag so, in its own words, *"a developer
can see WHY a call would be refused before making it, instead of discovering it as a 403"*
(`interfaces/route.ts:78-79`). It computes that flag with **`isGranting`** (`:63`) — the predicate #168 exists
to stop trusting.

Concretely: a `SANDBOX_ONLY` grant row stored with `environment: "DEV"`, read by a credential stamped `DEV`.
The grants query already filters on `environment: client.environment` (`:51-56`), so the row is in scope.
`isGranting("SANDBOX_ONLY")` is true → `callable: true`. The developer then calls the data route, where
`grantsRead("SANDBOX_ONLY", "DEV")` returns false (`grants.ts:70`) → 403 `NO_APPROVED_GRANT`.

So the endpoint whose stated purpose is "don't discover it as a 403" produces a 403, in precisely the case the
same PR was written to correct. Fix is one line: use `grantsRead(g.decision, client.environment)` at `:63`.

**Severity:** misleading, not permissive. It advertises access that is then correctly refused. No data escapes.

---

## 3 · C3 — write-grant expiry (#168) · **CONFIRMED**

`src/lib/studio/grants.ts:196` — `if (authorisesWrite && req.expiresAt == null)` →
`WRITE_GRANT_REQUIRES_EXPIRY`. Loose equality is used deliberately and the reasoning is written into the code
(`:193-195`): *"a caller that omits the field entirely must be refused exactly like one that passes null.
This is a security control, and 'the property was missing' is not a permission."* That is correct and it is the
right instinct.

Note the second-order improvement the same change bought: `authorisesWrite` now derives from `grantsWrite`
(`:173-174`), so a `READ_ONLY` decision on a `CREATE` request no longer demands the write checklist **and** no
longer demands an expiry — because it no longer authorises a write. Previously it demanded both and then let
the write through. The comment at `:171-172` names that inversion explicitly.

---

## 4 · C4 — tenant-anchored writes (#169, `35d5fc0`) · **PARTIAL**

**All eleven `update` calls carry `organizationId` in the write itself.** Verified individually:
`access-grants/route.ts:201`, `connections/[id]/test/route.ts:66`, `connections/route.ts:282`,
`capture-fixture/route.ts:82`, `capture-schema/route.ts:66`, `interfaces/route.ts:214`,
`solutions/route.ts:234`, `auth.ts:121`, `issue.ts:114`, `issue.ts:146`, `write-credential.ts:53`.
`auth.ts:119-121` even carries a comment explaining why the id alone was insufficient. That is the claim, met.

The claimed exemption — the token-hash lookup — is a `findUnique` **read**, not a mutation, so it was never in
scope for this PR's own rule.

### N2 · NEW — one anchored-model mutation still has no organization in its `where`

`src/lib/northbound/issue.ts:72-73`:

```ts
const row = await prisma.solutionClient.upsert({
  where: { solutionId: input.solutionId },
```

`SolutionClient` is in `TENANT_ANCHORED_MODELS` (`src/lib/studio/tenant-scope.ts:148-158`). The `create` branch
stamps `organizationId: scope.organizationId` (`:75`) — but the **`update` branch does not filter by
organization**, and that branch rotates `tokenHash`, resets `environment` and `expiresAt`, and revives a revoked
credential (`isActive: true, revokedAt: null`, `:88-90`).

**Not exploitable today.** The only caller, `POST /api/studio/clients`, re-scopes the solution through
`scopedById` and 404s before reaching this line. So the tenant boundary holds — *in the preceding line*, which
is the exact phrasing PR #169's own title rejects. It is the last instance of the pattern the PR was written to
eliminate, and it is invisible to the control that replaced the guard (see C9).

Fix: `where: { solutionId_organizationId: … }` if a compound unique is added, or split into an explicit
scoped `findFirst` → `update({ where: { id, organizationId } })` → `create`. `connection-resolver.ts:399` shows
the good pattern: it upserts on the compound `organizationId_product_key`, so the org is inside the key.

---

## 5 · C5 — the ninth RBAC site (#170, `5996a71`) · **PARTIAL**

**The mechanism is exactly as described.** `VALID_ROLES` is a `Set<string>`
(`src/lib/auth/role-migration.ts:29-33`); an unrecognised role falls through `LEGACY_ROLE_MAP` and returns the
literal `"viewer"` at `role-migration.ts:44`, indistinguishable from garbage input. Downstream consumers are as
claimed. `support` is present in all nine sites, and a round-trip guard exists at
`tests/unit/role-permissions.test.ts:250-255`.

**But "eight and a ninth" is not what happened.** There was a **tenth** — `ALL_ROLES`, a hand-written
`UserRole[]` at `src/lib/auth/role-permissions.ts:257-269` — which also needed the value (`:268`). The commit
message acknowledges it; the claim as put does not. This matters more than a counting quibble: the round-trip
guard *iterates `ALL_ROLES`*, so `ALL_ROLES` is the only thing keeping `VALID_ROLES` honest. Miss both next
time and the guard passes silently.

### N3 · NEW — fourteen further untyped role registries, none containing `support`

The sweep was not completed. In production code:

| Location | Shape | Effect |
|---|---|---|
| **`src/lib/onboarding/flow-engine.ts:22-41`** | `switch (role)` | **A live routing bug.** Falls to `default: return "/dashboard"` — while `ONBOARDING_FLOWS.support` (`src/types/onboarding.ts:183`) points the persona at `/operations`. Onboarding tells a support user where to go, then sends them somewhere else |
| ~~`src/lib/auth/permissions.ts:57-60`, `:156-159`~~ | `UserRole[]` lists | **FIXED in #176** — `support` now named in both (`:68`, `:170`). CCC went past the finding: it established that the terminal `"Unknown role"` deny at `:133-137` is **dead code** (every string normalises to a real role, every real role is handled earlier — flipping it to `allowed: true` leaves the suite green), and rather than write a test that appears to defend that branch, `tests/unit/permissions/deny-by-default.test.ts` asserts only what it proves: that a role moved onto an allow path is caught. The honest version |
| `src/components/admin/UserManagementTable.tsx:31` | `Record<string,string>` | `undefined` badge class |
| `src/components/admin/PendingInvitationsTable.tsx:22` | `Record<string,string>` | raw slug rendered |
| `src/components/collaboration/ActivityEntry.tsx:44` | `Record<string,string>` | raw slug rendered |
| `src/lib/tour/tours.ts:239, :354` | role string arrays | no product tour for `support` |
| `src/lib/notifications/recipient-resolver.ts:40, :62` | inline `.includes()` | no notifications; **also contains phantom roles** `partner_manager`, `client_lead` that are not in `UserRole` at all |

### N4 · NEW — `scripts/migrate-roles.ts` is a structural twin of `VALID_ROLES`

`scripts/migrate-roles.ts:118-122` is literally a `Set` of the eleven role names without `support`, plus an
`in:` array with the same omission at `:107-111`. Run it and every support user is reported
`⚠ Unrecognized role` and skipped. This is the same defect class as the one the PR is named for, in a file the
PR did not open.

Test-side registries with the same omission (which is *why* the production ones are invisible):
`tests/unit/dashboard-widgets.test.ts:10-21`, `tests/unit/onboarding-flows.test.ts:11-23`,
`tests/unit/validation/api-schema-validation.test.ts:206-209, :451-455`,
`tests/security/authorization.test.ts:31-42`, `teststs/unit/permissions/permission-matrix.test.ts:24`,
`tests/helpers/auth.ts:63-74` (an entirely separate, stale `PlatformRole` union), and
`tests/factories/user.factory.ts:64-74` (contains `partner_admin`, `client_sponsor` — neither is a `UserRole`).

Correctly derived and therefore safe: `src/app/api/admin/users/route.ts:12` and `[userId]/route.ts:10` use
`z.enum(Object.keys(ROLE_LABELS))`; `getRolesForOrgType` derives from `ROLE_METADATA`.
`CONTROL_TOWER_READERS` (`src/lib/studio/rbac.ts:88`) omits `support` deliberately and correctly.

### N5 · NEW — stale doc comment contradicts shipped code

`src/lib/studio/rbac.ts:9-15` still states *"this codebase's real `UserRole` union has no `developer` or
`support` value… Support → v2"* — forty-five lines above `isSupport()` at `:69`, which tests
`role === "support"`. The next person to read that file for authority is misled.

---

## 6 · C6 — the loop closes (#171 `9d4ea26`, #172 `0749af6`) · **REFUTED on its headline**

**Both PRs do exactly what they claim.** The access-request dialog is real and reaches the route
(`AccessGrantsClient.tsx:325`, mounted `:135`, posting to `POST /api/studio/access-grants:98` with every field
the Zod schema requires). The `entitySet` editor is real and reaches the PATCH that accepts it
(`InterfacesClient.tsx:290`, mounted `:144-155` → `patch({ id, entitySet })` at `:150` →
`interfaces/route.ts:170`, schema at `:50`, including the clear-to-null path). Both were genuinely dead before.

**The claim that "the full developer loop is walkable with no database access" is false.** Two of the eight
steps cannot be completed, and both fail for the same reason.

| # | Step | Verdict |
|---|---|---|
| 1 | Register a solution | passes — `SolutionsClient.tsx:387` → `solutions/route.ts:110` |
| 2 | Assign three owners | passes, but see below |
| 3 | Issue a credential | **FAILS** |
| 4 | Create an interface | passes — `DiscoverClient.tsx:62-104` → `interfaces/route.ts:58` |
| 5 | Set `entitySet` | passes (#172) |
| 6 | Raise a request | passes (#171) |
| 7 | Approve it | **FAILS** |
| 8 | Broker read | unreachable — needs 3 |

**The deadlock at step 3.** `POST /api/studio/clients` refuses if any owner slot is null
(`clients/route.ts:114-121`) and refuses if the caller *is* an owner (`:125-136`). Step 2's UI offers only
**claim** and **release** — it sets the field to `currentUserId` or `null`
(`SolutionsClient.tsx:299-303`); there is no user picker, though the PATCH route would accept an arbitrary id
(`solutions/route.ts:41-43`). So through the product, all three slots can only ever hold the acting
consultant — and the two gates become jointly unsatisfiable. The UI disables the button correctly
(`ClientCredentials.tsx:113`); it is mirroring the server, not hiding a path. Rotation carries the same pair
(`clients/route.ts:212-232`).

**The same shortage at step 7.** `evaluateDecision` refuses `SELF_APPROVAL` (`grants.ts:166-172`) and only a
`consultant` reaches PATCH at all (`access-grants/route.ts:54-58`).

**Root cause, and it is small.** `canMutateStudio` is `role === "consultant"` and nothing else
(`rbac.ts:64` via `:47`), and `/dev-login` ships exactly **one** consultant
(`src/lib/auth/dev-login.ts:57-62`). Both failing steps require a second. `canMutateControlTower` exists
(`rbac.ts:101`) but **has no caller** — Control Tower is one page of prose
(`src/app/(control-tower)/control-tower/page.tsx:14-56`), so there is no admin decision path either.

This is a fixture gap, not an architecture problem: `/api/auth/test-login` already accepts an arbitrary
`@abeam.test` email with any role and places it in the same org (`test-login/route.ts:92-130`). Adding one
entry to `TEST_USERS` closes both steps.

---

## 7 · C7 — breadcrumb (#173, `35453db`) · **CONFIRMED**

The defect existed exactly as described — at `70a6cec`, `StudioTopBar.tsx` did
`STUDIO_SECTIONS.find(s => s.href === pathname)` with a literal `"Developer Studio"` fallback, inside a
`<nav aria-label="Breadcrumb">`, so it was announced to screen readers on every non-Studio page.

The fix is better than the claim. `sections` and `workspaceLabel` are **required, non-defaulted props**
(`StudioTopBar.tsx:81-82`), threaded through `StudioShell` (`StudioShell.tsx:29, 53-54`), so the compiler
forces every mount to supply them. All three route groups do: `(studio)/layout.tsx:93`,
`(operations)/layout.tsx:71`, `(control-tower)/layout.tsx:71`. Convention would have drifted; this cannot.

---

## 8 · C8 — measurement plumbing (#174, `db223a2`)

### (a) `peekRateLimit` · **CONFIRMED** (upgraded from PARTIAL — see below)

**Non-consuming on both backends — by construction, confirmed.** Upstash uses `limiter.getRemaining(key)`
(`src/lib/security/rate-limit.ts:180`) against `checkRateLimit`'s spending `limiter.limit(key)` at `:117`.
In-memory filters and counts with **no `push` and no `store.set`** (`:194-198`) — contrast `:97-98`.

**The test gap I raised last pass is closed.** At `db223a2` the only coverage was
`tests/unit/northbound/ops-plumbing.test.ts:39-75`, which runs with no `UPSTASH_REDIS_REST_*` set, so
`getLimiter` returned `null` and the Upstash branch — the one the claim turns on — never executed. #176 adds
`tests/unit/security/peek-rate-limit-upstash.test.ts`, which mocks `@upstash/ratelimit` and `@upstash/redis`
(`:22-37`), stubs the env (`:46-47`), and asserts three things: `getRemaining` is called with the key and
`limit` is **not** (`:55-63`); it stays non-consuming across five repeated polls (`:66-70`); and
`checkRateLimit` still *does* consume (`:73-77`) — the contrast the split exists for. That is the right test,
and it tests the vendor boundary rather than restating the implementation.

**One overstatement remains.** `peekRateLimit` still has no production caller — two references repo-wide, its
definition and the tests. Same for `durationMs`: no reader anywhere in `src/`. The PR is candid that "the
screens arrive next"; the justification is nonetheless written in the present tense for a consumer that does
not exist. Not a defect, but the value is banked only when Decision 3 lands.

One asymmetry worth keeping: `checkRateLimit` fails **closed** in production on a backend error (`:134-136`);
`peekRateLimit` returns `null` (`:189`). Correct for a gauge, and it means a gauge cannot deny traffic — but
`peekRateLimit` has no counterpart to the "FATAL CONFIG" warning at `:140-148`, so a Redis-less deployment
renders a full budget that means little.

### (b) The reaper · **CONFIRMED**

`src/app/api/cron/northbound-reap/route.ts`, cron `"30 3 * * *"` in `vercel.json`. Authenticated by
`CRON_SECRET` through `timingSafeEqual` with a length pre-check so it cannot throw (`route.ts:10-13, 25-27`).
Bounded at `REAP_BATCH_LIMIT = 5_000` applied as `take: limit` (`src/lib/northbound/reap.ts:25, :49`). Deletes
only by `expiresAt: { lt: now }` (`:46`), and only the ids that selection returned (`:53-55`).
**`NorthboundAuditEvent` is not referenced anywhere in the reaper or its route.** Tests pin the exact
`where`/`orderBy`/`take` shape (`ops-plumbing.test.ts:93-95`).

### `durationMs` · **CONFIRMED**

`prisma/schema.prisma:747`, with a real migration directory —
`prisma/migrations/20260727060000_ops_measurement_plumbing/migration.sql` — containing the `ALTER TABLE` plus
an additive index. Plumbed at `audit.ts:71`. Every call site audited: of the seven `recordNorthboundCall`
invocations plus the write route's `audit()` helper, the only ones without a duration are those that return
*before* the upstream call (`data/route.ts:65, 99, 134, 161`; nine of ten `audit()` calls in the write route,
including the idempotency replay at `:171`, which correctly reports null because no new upstream call
occurred). **No call site omits a duration it actually had.**

---

## 9 · C9 — the three pack corrections · **CONFIRMED**, with a live blind spot

**(a) The vitest-guard instruction was indeed a no-op.** 46 test files reference `@/lib/db/prisma`; **45 of
them `vi.mock` it**, and the 46th's reference is a string in its own header comment. Under vitest there is no
real `PrismaClient` at all: `tests/helpers/db.ts:15` constructs one, but nothing imports that file — it is dead
code. The remaining `new PrismaClient` sites are Playwright specs and `scripts/`. Attaching
`tenantScopeGuard()` to the vitest client would have intercepted nothing. **The correction is right, and it is
right for the reason given.** My own earlier recommendation was wrong here; CCC caught it.

**The substitute is a static source scan** — `tests/unit/studio/tenant-scope-coverage.test.ts:54-82` — walking
`src/**/*.tsx?` and, per anchored model, matching
`prisma\.{model}\.(update|updateMany|delete|deleteMany)\(\{\s*[\s\S]{0,200}?where:\s*(\{[^}]*\})`, then failing
any captured `where` lacking `organizationId`. Models come from `TENANT_ANCHORED_MODELS`, so it auto-extends.

**How it can be defeated, in descending order of how live the gap is:**

1. **`upsert` is not in the operation list — and there is one in production right now** (N2, `issue.ts:72`).
2. Any alias defeats it — the regex is anchored on the literal `prisma.`, so a `$transaction` callback
   (`tx.solution.update(...)`) is invisible. Latent: no `$transaction` exists in Studio today.
3. A non-literal `where` defeats it — `prisma.solution.update({ where, data })` produces no match.
4. The `{0,200}` window: `data:` before `where:` with enough between them falls out of range.
5. `$executeRaw` is entirely out of scope.

Items 5 and 6 of that list produce false *positives* rather than false negatives, so they are noise, not risk.

**`tenantScopeGuard` remains dead in production** — defined at `tenant-scope.ts:225`, called only from its own
unit test; `src/lib/db/prisma.ts:17` constructs a bare client with no `$extends`. That is the agreed position,
not a defect.

---

## 10 · C10 — the verification gap · **REFUTED as framed**

The claim describes a real incident but attributes it to the wrong time, the wrong pipeline, and an
already-solved problem.

**The commit is `5d16922`**, *"fix(scope): granularity page — two-query join instead of Prisma relation"*,
dated **2026-04-25** — roughly **300 commits before** the #168–#174 range the claim points at. The bad code
came in one commit earlier, `cc68507`, a **direct push to `main` with no PR**. It selected a `scopeItem`
relation on `ScopeSelection` that has never existed (`git show 5d16922~1:prisma/schema.prisma` confirms the
model carried only `scopeItemId String`).

**Why typecheck missed it — and here my previous analysis was wrong too.** The commit's own explanation
(*"local tsc passed because the generated client was already in sync"*) cannot be right: a stale client would
have rejected that select just as a fresh one would, since the relation never existed in any version. I
proposed instead that the local Prisma client was **absent or degraded**, which would have made every `select`
shape pass. That was a hypothesis presented with more confidence than the evidence carried, and **#176 refutes
it with a direct experiment.**

The actual cause: `tsc --noEmit --strict` **exhausts the default Node heap on this project and aborts** —
`FATAL ERROR: Ineffective mark-compacts near heap limit`, exit 134. `build` already carried
`NODE_OPTIONS=--max-old-space-size=4096` for exactly this reason; `typecheck:strict` did not
(`package.json:28`, fixed in #176). And the habitual invocation is `pnpm typecheck:strict | grep "error TS"` —
**a pipe discards the exit code**, so a crashed run and a clean run print the same nothing. CCC proved it
rather than asserting it: a file containing `const x: number = "string"` produced zero errors and never
appeared in `--listFiles`, because the checker aborted before reaching it.

That is a better finding than the one I gave, and it explains the ESLint and vitest results without needing
my degraded-client conjecture. It also means the local check was not merely weaker than CI — for an unknown
period it was **not running at all**, while reporting success.

**Is it systemic? No — and this is the part that matters.** CI at that commit already ran
`pnpm db:generate` → `pnpm db:push` → `pnpm typecheck:strict` in that order
(`git show 5d16922:.github/workflows/ci.yml:54-60`, unchanged today at `.github/workflows/ci.yml:63-70`).
**CI would have caught it.** The gap was never "typecheck cannot see Prisma errors" — it was that a direct push
to `main` raced CI against the Vercel deploy.

**And a fix for the original incident already shipped, the next day.** `.githooks/pre-push` was added in
`cb3600b` on 2026-04-26; it runs `npx prisma generate` then a full `next build`, rejecting the push on either
failure, and its header names exactly that failure class. Installed via `package.json:70`.

**Net verdict, revised.** The claim as framed — "a systemic gap in local verification, cheaply fixable" —
turns out to be *right in substance and wrong in every particular it offered*. There was a systemic gap, but
it was not the invalid-`select` incident (wrong era, wrong pipeline, already fixed), and it was not the
Prisma-generate step I proposed. It was a crashing type checker whose failure was masked by a pipe. #176 fixes
it in the only place that matters (`package.json:28`, adding the heap bump) and correctly records that **CI
was never affected** — `.github/workflows/ci.yml` runs the script unpiped, so exit 134 fails the job, and
Quality Gates passed on every merged PR. The eight PRs were genuinely type-checked; by CI, not by the local
runs cited as evidence for them.

The habit fix matters as much as the config one: **never pipe a verification command whose exit code you are
relying on.** That is worth writing into the contributing guide, not just the package script.

---

## 10a · N11 · NEW, unclaimed — both workspaces were unreachable in production (#177, `690418f`)

**This is the most consequential finding in this round, and neither CCC's claim list nor my previous review
caught it.**

`/operations`, `/control-tower` and `/api/ops/` were absent from `WORKBENCH_PATHS`
(`src/lib/routing/workbench-paths.ts`). On a `WORKBENCH_ONLY` deployment the middleware redirects anything not
on that list to `/workbench` **before auth, before RBAC, before the route runs**. So from #173 and #175 until
#177, both workspaces and all four Ops endpoints were complete, gated, tested — and reachable by no role at
all.

It is invisible while building, which is the whole problem: `WORKBENCH_ONLY` is unset on a dev server, so the
redirect never fires locally. Component tests, the RBAC tests and the breadcrumb tests all passed against a
middleware that was never consulted.

**It is the second occurrence of the same defect, and the file's own header had already recorded the first** —
that the CoreEdge Console shipped across nineteen PRs and was unreachable in production the whole time because
`/studio` was missing from the same list, ending *"Adding a surface to the Workbench means adding it here."*
The warning was present and did not prevent the repeat.

**The fix is right, including the part that matters.** #177 adds the three paths and, more importantly, a test
(`tests/unit/routing/workbench-paths.test.ts`) that **derives its expectation from the route groups** rather
than restating a list — so the next workspace added without allow-listing fails CI with the path named. CCC
verified it by removing the paths again and watching it go red. The header now records that it happened twice.

**What this says about my previous review.** I verified the route groups, the layouts, the RBAC gates and the
breadcrumb, and concluded the shell work was sound. It was — and it was also unreachable. I checked the
shipped code against the claims and against the pack, and never against the deployment's routing precondition.
A reachability check belongs in the standing method for any PR that adds a surface, and it was not in mine.

---

## 11 · PR #175 (merged at `3bda1e8`) — four Ops read endpoints

**Scope check first, because a sub-review got this wrong and it is worth stating plainly.** All four endpoints
are specified by exact path in Build Bible v3 §7 — `broker-traffic` at `:449`, `write-ledger` at `:462`,
`connections-health` at `:478`, `tokens` at `:513`. A reviewer working only from documents committed to the
repository would find no authority for them and would be right to say so; the authority is an attachment. That
is a *process* finding, not a defect in the PR — and it is the same gap that made this pack's filenames
unverifiable in the first place. **Commit the pack.**

**What is right.** The gate is correct and uniformly applied: `requireOperations()` (`src/lib/ops/guard.ts:39`)
runs `getCurrentUser` → `canAccessOperations` (`support || platform_admin`) → `tenantScopeFor`, as the first
statement of all four routes, returning before any query. Secret-safety is clean — I checked all six `select`
blocks: no `tokenHash`, `secretsCiphertext`, `baseUrl`, `oauthTokenUrl`, `responseBody` or `requestHash`.
`tokens/route.ts:70-76` scopes the secondary `Solution` name lookup too, with a comment explaining that an
unscoped name join would leak across tenants even with correctly-scoped credential rows — that is the right
instinct. The audit-module arity test is not at risk: the PR touches neither audit module and its only
audit-table access is `findMany`. No update/delete/upsert anywhere in the diff. The gate test iterates a route
table so a fifth route cannot ship with two checks (`tests/unit/ops/ops-endpoints.test.ts:70-91`), and
secret-safety is asserted on the **select object** rather than the response body, which fails on the query
rather than on the fixture.

### N6 · The branded tenant scope is computed and discarded

`requireOperations` builds a real `TenantScope` and stores it at `actor.scope` (`guard.ts:52-58`) — and **no
route reads it**. All six queries spread `...opsOrgFilter(actor)` (`guard.ts:78-80`), a plain
`{ organizationId?: string }`. `scopedWhere` / `scopedById` are not imported anywhere in the PR.

The guard's own comment argues `{}` is "the ONLY place widening is expressible", which is a real argument and
better than a silent empty filter. But it is weaker than the helper it bypasses: `scopedWhere` places
`organizationId` **last** so a caller-supplied one cannot win, and cannot be invoked without a scope at all. A
spread can be forgotten at a call site; the existing test would still pass for the `support` fixture. Six sites:
`broker-traffic:60`, `write-ledger:59, :73`, `connections-health:44`, `tokens:50, :55, :72`.

### N7 · `environmentBinding.agreed` counts calls that never touched a connection

`broker-traffic:100-109, :135` computes `agreed = rows.length - unverified - mismatch`. A row with
`connectionId === null` — refused at auth, throttle, or the grant gate — matches neither branch and lands in
`agreed`. A window of 429s and 403s therefore reports a wall of "environment bindings agreed" when **zero**
bindings occurred. The tests never see it: the binding test uses rows with `connectionId` set (`:190-199`), and
the six-row `byStatus` test uses the fixture default `connectionId: null` and asserts nothing about binding.
Fix: a `notApplicable` bucket, or exclude null-connection rows from the denominator.

### N8 · Counts are computed over the truncated page, and provenance does not say so

`broker-traffic:60-81` applies `take: limit` (default 100) and then derives `counts.total`, `byStatus`,
`bySolution`, `byToken`, `latency` and `environmentBinding` from that page. A 24-hour window containing 5,000
calls reports `total: 100`. `truncated` is set (`:145`) but `provenance.missing` (`:148-153`) lists three
audit-write gaps and **not** the limit — the largest and most predictable undercount of the four. Same shape at
`write-ledger:104-107`. `opsLimit`'s own doc comment reads *"Silent truncation is never acceptable"*
(`guard.ts:92`), which makes this a self-contradiction rather than an oversight.

### N9 · `counts.revoked` is structurally always zero in the default view

`tokens:52-57` filters `isActive: true` unless `includeRevoked=1`, while `revokeClientToken` sets **both**
`isActive: false` and `revokedAt` (`issue.ts:145-147`). So the `revokedAt !== null || !isActive` branch at
`:80` can only fire for a row with `revokedAt` set while still active — which no code path produces. A
dashboard reading `counts.revoked` without the flag renders 0 and implies "nothing has been revoked".

### N10 · A secret column name now lives outside every structural guard

`tokens/route.ts:44-46` filters on `secretsCiphertext: { not: null }` — referenced, never selected, and
deliberate. Safe. But `studio-guard-coverage.test.ts`'s secret scan covers `src/app/(studio)`, `src/lib/studio`
and `src/components/studio` (`:35-39`) — not `src/app/api/ops` or `src/lib/ops`. Not a defect today; a gap in
where the guards look, on the day a new directory started handling this data.

Smaller: `tokens:44` starts a promise and attaches its handler at `:78` across two intervening `await`s (an
unhandled rejection rather than a 500 — `Promise.all` costs nothing); `connections-health:44` silently excludes
`isActive: false` connections with no provenance line, inconsistent with the PR's own discipline; and
`guard.ts:12` describes "seven routes" while four shipped. Untested: the `opsWindowHours`/`opsLimit` clamps,
and the `solutionId`/`environment` filter pass-through.

**Would it pass CI?** By reading, yes — no `any`, no `console`, correct `import type` style,
`noUncheckedIndexedAccess` handled at `broker-traffic:117`. The one line I would actually compile before merge
is the `opsOrgFilter` spread under `exactOptionalPropertyTypes: true`, which is exactly the flag that surprises
people on optional-property spreads.

---

## 12 · What I could not verify

- **Whether any production organization is affected by the #168 exposure.** No database access. D2 item 1
  carries the query that settles it; until it is run, the blast radius is unknown, not zero.
- **That CI is currently green on `main`.** `node_modules` is not installed in this environment, so every
  build/lint/typecheck assessment here is by reading, not by running. #176 reports Quality Gates green on
  every merged PR and I have no reason to doubt it, but I did not observe it.
- **That the #177 routing fix actually restores reachability in the deployed environment.** The allow-list
  entries and the derived test are correct by reading; whether `WORKBENCH_ONLY` is set on the production
  deployment, and therefore whether the workspaces were in fact dark rather than merely at risk of it, is a
  deployment-configuration question I cannot answer from the repository.
- **The Upstash branch of `peekRateLimit`** — no Redis available; non-consumption there rests on the vendor's
  API contract.
- **Runtime behaviour of anything.** No deployment, no database, no browser. Every finding is derived from
  source, schema, migrations, tests and CI configuration at the pinned SHA.
- **`dc3`.** It does not exist; the gate assessment in D2 is based on `dc2` plus the delta list, not on a
  produced design.

---

*End of D1.*
