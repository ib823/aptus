# CCC Build Bible v3 — CoreEdge Console: Operations Center & Control Tower

**Supersedes** `CCC-Ops-ControlTower-Build-Bible.md` (v2) in full. Re-grounded against `ib823/aptus` @ `main`
`70a6cec4985670e3ff7fc47dc8b6be269b998b2e` (#167) by two independent recon passes that reconciled citation for
citation. Every `file:line` below was read at that SHA.

**What changed from v2, in one paragraph.** A **pre-work PR (PR-CT-0a)** now precedes everything: the runtime
does not bind an approved environment to the SAP connection it actually calls, and two grant decisions that read
as restrictions (`READ_ONLY`, `SANDBOX_ONLY`) authorise writes — both would make Ops/Control Tower display
governance the broker ignores. **PR-Rbac is larger than v2 stated** (eight exhaustive `Record<UserRole, …>` maps
break on the union change, not four files). **The shell generalization is different than v2 stated** — the rail
already takes a `sections` prop, but `StudioShell` and `StudioTopBar` hardcode Studio. The **connection-health
enum in v2 was wrong** (`NEVER_TESTED` does not exist; `NO_PROBE_PATH` does). The **throttle gauge as specced
would consume the budget it measures**. Two Ops screens are **empty by construction** until upstream gaps close,
and must say so honestly. Details and citations in the sections below.

---

## §0 · File manifest & authority

| File | Role | Authority |
|------|------|-----------|
| `CoreEdge Ops & Control Tower.dc3.html` | Visual contract — every screen, layout, interaction, state | Top authority on **look / layout / interaction / copy** |
| `CoreEdge-Ops-ControlTower-Inventory.md` (v3) | Content spec — capability → real data source → build status | Top authority on **what data is real and what may be shown** |
| `CoreEdge-Studio-Design-Book.html` + `CoreEdge-Design-Tokens.md` | Design system + tokens | Use verbatim |
| `CoreEdge Developer Studio.dc.html` | The built Studio | Visual family precedent (same shell/chips) |
| **This bible (v3)** | Engineering contract, guardrails, build order | Top authority on **security, honest status, data, sequencing** |

**Six files, and this bible is the last word among them.** Earlier pack versions and the CCC⇄Cowork
reconciliation record live in `archive/` and are **not build inputs** — they predate settled decisions and
contain known-wrong content (see `archive/README.md`). Everything load-bearing from the reconciliation is
absorbed here.

**Conflict rule.** Visual/layout question → the `.dc3.html`. Data / capability / security / honest-status
question → this bible + the Inventory + the codebase. **Honest status and security always beat the mock** — if
the design shows a state the data cannot back, build the honest state and STOP-report the discrepancy.

### The `dc3` gate — read this before attaching anything

`dc2` is **superseded**. It renders latency it cannot measure, a `NEVER_TESTED` status that is not a probe
outcome, live revoke controls the workspace's owner cannot invoke, and it has no design at all for
binding-unverified, grant expiry, or the two new workspaces' chrome. A build translated from `dc2` reproduces
every one of those.

`dc3` is `dc2` with those corrected — commissioned separately, from the same design source.

**If `dc3` has not been produced yet, the build is not blocked — but it is bounded.** The dependency binds
per PR, not across the front:

| PR | `dc3` needed? | Why |
|----|---------------|-----|
| PR-CT-0a, PR-Rbac, PR-CT2 | **No** | No screens. Backend, roles, endpoints. Start these immediately |
| PR-CT1 | **Partly** | Needs `dc3`'s B6 only: breadcrumb per workspace, the two rail section lists, the `support` badge. Everything else in CT1 is chrome plumbing |
| PR-CT3, PR-CT4, PR-CT5 | **Yes** | These *are* the screens. Do not build them from `dc2` |

So the honest sequence is: start PR-CT-0a now, and have `dc3` in hand before PR-CT3. If you reach PR-CT3 and
only `dc2` is attached, **STOP and report** — do not translate it.

*(The Studio `.dc.html` is a different file and is not superseded: it is family precedent, not the target.)*

---

## §1 · Product context and objective alignment

CoreEdge is a **governed SAP operations middleware** — ABeam's own asset — presented as **one console with three
RBAC workspaces at three altitudes**: Developer Studio (*build and configure* — shipped), **Operations Center**
(*is it healthy now* — this build), **Control Tower** (*is it governed, and is it worth it* — this build).

**Non-negotiable to the objective:**

- These workspaces are **read/govern layers over data already captured**. They introduce **no new SAP access
  path**. The northbound broker (`/api/northbound/*`) and the existing Studio probes remain the only SAP
  touchpoints, except the one reused read-only spot-check (§7), which goes through the existing throttle.
- **Honest status is the product's trust differentiator.** Extend it to honest *environment* (PROD flagged,
  unknown never guessed) and honest *counts* (never fabricate a metric, and never let a derived number imply a
  precision the feed cannot support).
- **Structural tenant isolation** and **secret safety** are load-bearing, not cosmetic.

---

## §2 · STEP-0 recon — verified primitives (re-verify at your SHA; STOP on drift)

All confirmed present at `70a6cec`. If `main` has advanced, re-verify and report drift **before** writing code.

**Shell / RBAC**
- `src/app/(studio)/layout.tsx` — auth redirect to `/presales/login` (:48), role + tenant-scope gate →
  `RoleGatedEmptyState` (:56-58), tenant resolve (:66-88), `AffirmLearnProvider` mount (:90).
- `src/components/studio/StudioShell.tsx` — 56 lines; takes `accessibleWorkspaces`, `tenants`,
  `activeTenantKey`, `roleLabel`, `userEmail`, `children`. Imports `STUDIO_SECTIONS` (:11) and `WORKSPACES` (:13)
  and **hardcodes `workspaces={WORKSPACES}` (:41) and `sections={STUDIO_SECTIONS}` (:43)** in the render. It
  contains no breadcrumb logic — that lives in the top bar.
- `src/components/studio/StudioRail.tsx` — `StudioSection { key, label, href, available }` (:23-29);
  `STUDIO_SECTIONS` seven entries (:35-43); **already accepts a `sections` prop** (:69, :73).
- `src/components/studio/StudioTopBar.tsx` — `STUDIO_TENANT_COOKIE = "studio-tenant"` (:51); `EnvChip` (:338-358,
  null when unknown at :339, PROD warning at :340/:351-352); origin `Dot` (:361-375, encodes *whose* tenant, not
  which env); **imports `STUDIO_SECTIONS` (:38) and derives the breadcrumb from it (:96-100)** —
  `STUDIO_SECTIONS.find((s) => s.href === pathname)` returns `undefined` for every `/operations/*` and
  `/control-tower/*` path, falling through to the bare `"Developer Studio"` branch. **The shared top bar
  therefore renders the wrong workspace name on every page of both new workspaces** until it is parameterized.
- `src/lib/studio/rbac.ts` — `StudioWorkspace` (:26), `WORKSPACES` (:37-40, both new workspaces `href: null`,
  `availableInV1: false`), `isStudioBuilder` (:44-46), `canAccessStudio` (:53-56), `canMutateStudio` (:63-65),
  `accessibleWorkspaces` (:68-73), `lacksStudioTenantScope` (:81-86).
- `src/lib/auth/permissions.ts:368-371` — `isAdminRole` is **`platform_admin` only**.
- `src/components/studio/RoleGatedEmptyState.tsx:10` — props are `{ roleLabel: string }`.

**Models** (`prisma/schema.prisma`)
- `NorthboundAuditEvent` — `id, organizationId, solutionId, interfaceId?, operation, externalId, environment,
  status, rowCount?, correlationId, clientTokenId, at`; indexes `([organizationId, solutionId, at])` and
  `([organizationId, clientTokenId, at])`. **No `durationMs`. No `connectionId`.**
- `NorthboundIdempotencyKey` — `id, organizationId, solutionId, interfaceId, key, requestHash, status,
  responseBody, createdAt, expiresAt`; `@@unique([organizationId, solutionId, key])`; `@@index([expiresAt])`.
- `ConfigAudit` — `id, organizationId, actorId, entityType, entityId, action, before?, after?, at`.
- `SapConnection` — `environment String?` (:481), `writeEnabled` (:487), `lastValidatedAt` (:495),
  `lastValidationStatus String?` (:500); `key` documented as "also the key stored probes are recorded under".
- `SolutionClient` — `lastUsedAt`, `expiresAt`, `revokedAt`, `tokenHash @unique`.
- `Solution`, `Interface`, `ApiAccessGrant` — present as v2 described.

**Libs**
- `src/lib/northbound/audit.ts` — append-only writer; `environment` is stamped from the **token** (:26, :43); the
  write is wrapped in a `try/catch` that logs and swallows (:50-58).
- `src/lib/studio/connection-health.ts` — `probeConnection` (:84-131); statuses `OK | UNAUTHORIZED | NOT_FOUND |
  TIMEOUT | ERROR | NO_PROBE_PATH` (:30-36). Pure — the **route** persists (`connections/[id]/test/route.ts:63-70`,
  `lastValidatedAt` moves only on `OK`).
- `src/lib/studio/tenants.ts` — `resolveStudioTenants` (:51-97), `pickActiveTenant` (:105-111),
  `isSharedEnvironmentTenant` (:114-120).
- `src/lib/studio/tenant-scope.ts` — `TenantScope` brand (:36-46), `tenantScopeFor` (:62-73), `scopedWhere`
  (:97-102, scope applied **last**), `scopedById` (:114-120), `scopedCreateData` (:128-133),
  `TENANT_ANCHORED_MODELS` (:148-158), `tenantScopeGuard()` (:198-227) — **no production call site** (see §4.4).
- `src/lib/security/rate-limit.ts` — `RATE_LIMITS` (:154-183: `apiRead` 300/min, `apiMutation` 120/min,
  `sapLive` 20/min, `northbound` 60/min), `isLiveSapTenantRoute` (:196-209), `checkRateLimit` — **consuming; no
  peek variant exists**.
- `src/lib/studio/api.ts` — `studioOk` / `studioError` envelope `{ code, message, correlationId }`.
- `src/lib/studio/audit.ts:46` — `writeConfigAudit(input)`.
- `src/middleware.ts` — bucket selection (:232-240), IP keys (:242-248), 429 (:252-269) **writes nothing**.

**Broker routes** — `src/app/api/northbound/**`. In-route per-token throttle and its audited 429 at
`interfaces/[id]/data/route.ts:59-79`. Connection resolution at `data/route.ts:120` and
`data/write/route.ts:175`, both **without key or environment**.

**Compose endpoints (Control Tower must not rebuild these)** — `api/admin/{users,organizations,overview}`,
`api/roles`, `api/partner/settings`, `api/analytics/{portfolio,benchmarks,cross-phase}`, `api/dashboard/kpi`.
**Excluded** (stays in the Workbench portal): `api/admin/{adaptation-patterns, assessments, baselines,
conversation-templates, extensibility-patterns, industries}`.

**Tests that must stay green** — `tests/unit/studio/rbac.test.ts`, `tests/unit/studio/access-grants-route.test.ts`,
`tests/unit/northbound/dod-gaps.test.ts` (append-only), `tests/unit/studio/tenant-scope.test.ts`.

**CI reality** (`.github/workflows/ci.yml`, `migration-integrity.yml`) — `pnpm audit` gate → `db:generate` →
`db:push` → `typecheck:strict` (`tsc --noEmit --strict`) → `lint:strict` (`eslint . --max-warnings 0`) →
`test` (`vitest run`) → `build`; plus an E2E-smoke job, two visual-regression jobs, and a migration-integrity
workflow that rebuilds from migration history and asserts zero drift against `schema.prisma`.

---

## §3 · Non-negotiable guardrails

1. **Honest status and honest environment.** Every data view designs all real states: data / empty /
   needs-setup (401-403) / error (5xx) / loading. Empty ≠ needs-setup ≠ error. Carry `EnvChip` on tenant-pointed
   views; **PROD = warning; unknown = no chip, never a guess.** Never fabricate a row, count, health, or
   environment.
2. **The audit is READ-only here.** Ops and Control Tower **read** `NorthboundAuditEvent` and `ConfigAudit`. No
   update, delete, or upsert path is added. The existing append-only test stays green.
3. **Secret safety.** No endpoint returns `secretsCiphertext`, a raw or hashed token, a write credential, or a
   SAP host/URL. Registers show metadata and status only.
4. **Structural tenant scope.** Every query goes through `scopedWhere` / `scopedById` with a `TenantScope`.
   `platform_admin` keeps its global exemption via `lacksStudioTenantScope`, and admin-global reads must be an
   **explicit, separately-tested branch** — never an unscoped fallthrough. Tenant is auth-resolved, never from
   URL, query, or cookie. Prove org-A cannot read org-B.
5. **Read personas cannot mutate.** `support` and the read-only viewers get no governance mutation. The only
   mutation in scope is the Control Tower **grant decision** by `platform_admin`, with SoD and `ConfigAudit`.
6. **Reuse the throttle.** Any live-SAP read goes through `isLiveSapTenantRoute` / `RATE_LIMITS`. No new SAP path.
7. **Accessibility AA.** Visible `:focus-visible` navy rings and keyboard navigation on every interactive element.
8. **No new SAP access path.** If a screen seems to need one, STOP-report.
9. **No silent caps.** If an endpoint truncates, samples, or top-N's, the screen says so. A silent limit reads as
   "this is everything" when it is not.

---

## §4 · PR-CT-0a — the pre-work PR (NEW; everything else sits behind it)

Four steps. Each is small in code and large in consequence: without them, both new workspaces would render
governance the runtime does not enforce, which is worse than not rendering it.

### §4.1 · Bind the approved environment to the connection actually called

**The defect.** `resolveSapConnection(organizationId, product, key?)`
(`src/lib/sap-public/connection-resolver.ts:107-116`) ends with `return all[0] ?? null` — the **oldest active
connection** for that org and product. Both broker call sites pass no key and no environment
(`data/route.ts:120`, `write/route.ts:175`). `SapConnection.environment` is never read for selection or
authorization anywhere in `src/lib/sap-public`, `src/lib/northbound`, or `src/app/api/northbound` — it is a
display value only, and it is not even carried on `ResolvedSapConnection` (:84-100). The grant check *does*
match environment (`access.ts:115-121`, `:209-216`) but against the **token's** environment, and the chain stops
before the connection. An org with a PROD connection created before its SANDBOX one serves every call — reads
and writes — from PROD.

**The fix.** Carry `environment` onto `ResolvedSapConnection`, select it in `resolveSapConnections`, and add an
environment-aware resolution used by both broker call sites. Selection rules, in order:

1. Exactly one active connection for the product whose `environment` matches the caller's environment
   (case-insensitive) → use it.
2. More than one match → refuse. Ambiguity must not be resolved by creation order.
3. No match because the connection's `environment` is `null` (undeclared) → **split by operation. This is a
   decided rule, not a recommendation:**
   - **READ → allow**, provided the org has exactly one active connection for the product. Stamp
     `connectionEnvironment: null` on the audit row and surface the call in Ops as *"binding unverified"*.
   - **WRITE → refuse, regardless of connection count.** No exceptions, and `writeEnabled` does not substitute:
     it is a per-connection yes/no that says nothing about *which* landscape it enables writes on.
4. Anything else (no match with 2+ connections; several candidates with unknown environments) → refuse with the
   distinct, honest error from §4.3.

**Why the split (decided 2026-07-27).** The `environment` column arrived in migration
`20260726060000_sap_connection_environment` — one day before the grounding SHA. So a blanket-strict rule would
not protect legacy estates from a new control; it would break **every** estate on day one over a column nobody
has had the chance to backfill, and would push operators to type a guessed value purely to clear the error —
manufacturing exactly the fabricated environments `EnvChip` exists to prevent. Reads against an undeclared
landscape are a disclosure risk that already exists today, so permissiveness does not increase it. A write
against an undeclared landscape is how a record lands in a customer's production ledger with nobody having
declared it production — irreversible, and the only half of this defect that causes unrecoverable harm. The
split closes that half at full strength while leaving the compatibility argument intact.

**The permissiveness is a backlog, not a home.** Ops must **count** connections and calls in the
*binding-unverified* state and present the count as work to be cleared, not as a steady state. The remediation
is one field in a UI that #167 already ships. Revisit the read-side rule once the estate is backfilled; until
then the number should visibly trend toward zero.

**Tests (required):** a SANDBOX token cannot reach a PROD connection; ambiguity refuses rather than picking; a
**read** against a single null-environment connection is allowed *and* stamped `connectionEnvironment: null`; a
**write** against a null-environment connection is refused **even when it is the org's only connection and
`writeEnabled` is true**; the refusal carries no host or URL.

### §4.2 · Make `READ_ONLY` and `SANDBOX_ONLY` mean what they say

**The defect.** `const GRANTING: ReadonlySet<GrantDecision> = new Set(["APPROVED", "SANDBOX_ONLY",
"READ_ONLY"])` (`src/lib/studio/grants.ts:34`), read by `isGranting` (`:48-50`). The broker's write path filters
write-operation grants and then accepts any granting decision
(`src/lib/northbound/access.ts:126-127`); the read path does the same (`:220`). Consequences: an approver who
downgrades a PROD `CREATE` request to **READ_ONLY** has still authorised a PROD write — and
`evaluateDecision` (`grants.ts:121`) even demands the write checklist for that combination before letting it
through. `SANDBOX_ONLY` is matched only against the grant row's own environment, so a `SANDBOX_ONLY` decision on
a PROD-environment grant authorises PROD.

**The fix.** Replace the single predicate with operation- and environment-aware ones (names indicative):
- `grantsRead(decision)` → `APPROVED | SANDBOX_ONLY | READ_ONLY`.
- `grantsWrite(decision)` → `APPROVED | SANDBOX_ONLY` — **never** `READ_ONLY`.
- `SANDBOX_ONLY` additionally requires the caller's environment to be sandbox-class (`SANDBOX`); it confers
  nothing in `DEV`/`TEST`/`PROD`.

Keep `isGranting` only if something outside the broker still needs the ledger-level "confers something" sense
(`grants.ts:147` uses it for progressive-trust display) — but the broker must not use it. Update
`evaluateDecision` so the write checklist is demanded only for decisions that actually grant a write.

**Also in this step: a write-granting decision requires an `expiresAt`.** This is the compensating control that
decision 1 (§12) rests on, and it belongs here because this PR already owns write-grant decision semantics.
`evaluateDecision` must refuse to settle a write-granting decision with a null expiry. Rationale: call-time
expiry is already honoured on both paths (`access.ts:136`, `:231`), so a bounded write grant lapses on its own
without any new state, any new mutation, or any change to the once-only ledger invariant. Today `expiresAt` is
optional on the request, which is how an `APPROVED` write grant becomes permanent by inaction — the same
"a gate disabled by skipping a step" shape the credential ownership gate was fixed for in #166.

**Tests (required):** `READ_ONLY` on a `CREATE` grant → write refused, read allowed; `SANDBOX_ONLY` in `PROD` →
refused; `APPROVED` unchanged in both directions; the existing `access-grants-route.test.ts` assertions at
`:141`, `:149`, `:159`, `:167`, `:176` stay green.

### §4.3 · Additive migration: prove the binding on the audit row

Add to `NorthboundAuditEvent`, both nullable:
- `connectionId String?` — which `SapConnection` the call actually used.
- `connectionEnvironment String?` — that connection's own `environment` at call time.

Stamp both at every `recordNorthboundCall` site. Keep the existing `environment` column as the **token's**
declared environment; do not overwrite it — the pair is what lets Ops show agreement or disagreement honestly.

**Why here and not in PR-CT2:** these two fields are the evidence that §4.1 works. A binding fix nobody can
observe is a claim, not a control — and PR-CT-0a's definition of done includes proving the binding end to end,
which is not testable at the audit level without them. (`durationMs` stays in PR-CT2 — it is a latency concern,
not a safety one.)

⚠️ **One migration, not two.** An earlier version of this pack placed `connectionId` and `connectionEnvironment`
in PR-CT2 alongside `durationMs`. **This bible is authoritative: they land in PR-CT-0a.** If you encounter
another instruction placing them in PR-CT2, do not write a second migration adding columns that already exist —
add only `durationMs` there, and report the discrepancy.

Also add a distinct error code for "no connection matches this environment". Today a missing connection, an
ungranted interface, and a rejected SAP credential all surface as `403 FORBIDDEN` distinguishable only by prose
(`respond.ts` `NorthboundErrorCode`), so a developer's app cannot tell "my customer has not connected SAP" from
"you were never granted this". Adding one code here is in scope; a full error-taxonomy rework is not.

### §4.4 · Attach `tenantScopeGuard()` to the **test** Prisma client (F54 / F54a)

**The defect.** `tenantScopeGuard()` (`tenant-scope.ts:198-227`) — the extension that makes a forgotten
`organizationId` throw — has **no production call site**. `src/lib/db/prisma.ts` is a bare
`new PrismaClient({ log })`; `grep -rn "tenantScopeGuard|\$extends" src/` returns only the declaration. Tenant
isolation is per-call-site discipline today. That was survivable for a handful of hand-written Studio routes;
this front adds roughly fifteen org-scoped endpoints, several of them **aggregations over
`NorthboundAuditEvent`**, where a forgotten scope does not throw, looks correct in a single-tenant dev database,
and returns every customer's broker traffic.

**The scope correction (F54a) — read this before estimating.** Attaching the guard is **not a wiring checkbox**.
`SCOPED_OPERATIONS` includes `findUnique`, `update`, and `delete` (`:163-174`), and `whereHasOrganization` is a
JSON substring check (`:176-183`), so the guard fires on at least two deliberate, correct patterns:

1. `src/lib/northbound/auth.ts:73` — `solutionClient.findUnique({ where: { tokenHash } })`. Legitimately
   unscoped: the organization is *derived from* this lookup. Needs an explicit, greppable, documented exemption.
2. The canonical mutation idiom — scoped `findFirst`, then `update({ where: { id } })`. E.g.
   `src/lib/northbound/issue.ts:113` (rotate) and `:145` (revoke), recurring across the Studio routes.

**Required approach, in preference order.** Scope the wheres using Prisma's `extendedWhereUnique` (GA in Prisma
5): `update({ where: { id: existing.id, organizationId: scope.organizationId } })`. This makes the by-id
mutations guard-clean **and** independently harder — the update re-asserts tenancy instead of trusting the read
above it. Then add the narrow `tokenHash` exemption, and a test proving the guard throws
`MissingTenantScopeError` on an unscoped anchored-model query.

> ⚠️ **Correction, found while implementing (2026-07-27): do NOT attach the guard to the vitest client.**
> An earlier version of this step said to. It would protect nothing: **every** test file that touches Prisma
> mocks `@/lib/db/prisma` — verified, zero test files import the real client — so no test ever reaches the
> extension for it to intercept. Wiring it there would look like a control and be a no-op, which is precisely
> the dishonesty this codebase exists to avoid.
>
> **What replaces it:** a source-scanning coverage test
> (`tests/unit/studio/tenant-scope-coverage.test.ts`) asserting that no `update`/`delete` on a tenant-anchored
> model is written with a bare id. Same shape as the append-only audit test, and it fails on the PR that
> introduces the regression rather than on the request that exploits it. It was verified to fail against a
> deliberately reintroduced violation before being accepted — a scan that has never been seen to fail is not
> evidence of anything.
>
> The exemption tests still matter and still apply: they pin how narrow the `tokenHash` hole is, so it cannot
> widen into a scan (`findFirst`, extra where-keys, other models and `update` are each asserted to remain
> guarded).

**Do not** take the shortcut of a broad exemption list covering the mutation idiom: that exempts most of what the
guard exists to catch, and leaves a guard that passes CI while protecting nothing.

**Explicitly out of scope: global production wiring.** Attaching the guard to the app's Prisma client would
require every anchored-model query in Studio, the Workbench, and the portal to satisfy it simultaneously. That is
its own PR, on its own schedule, not something to do mid-UI-build. **If the executing session proposes it,
decline.**

---

## §5 · PR-Rbac — the `support` role and workspace RBAC generalization

### §5.1 · The typecheck cascade (larger than v2 stated)

Adding `| "support"` to `UserRole` (`src/types/assessment.ts:47-58`) breaks **eight** exhaustive
`Record<UserRole, …>` maps under `typecheck:strict`. v2 listed four files and missed five of these:

| Map | Location |
|---|---|
| `ROLE_LABELS` | `src/types/assessment.ts:72` |
| `ROLE_HIERARCHY` | `src/types/assessment.ts:87` |
| `DEFAULT_ROLE_WIDGETS` | `src/types/dashboard.ts:86` |
| `ONBOARDING_FLOWS` | `src/types/onboarding.ts:58` |
| `PERMISSION_MATRIX` | `src/lib/auth/permission-matrix.ts:74` |
| `ROLE_METADATA` | `src/lib/auth/role-metadata.ts:19` |
| `RoleCapabilities` (`satisfies`) | `src/lib/auth/role-permissions.ts:210` |
| `ROLE_COLORS` | `src/components/org/RoleBadge.tsx:7` |

> ⚠️ **A NINTH site, found while implementing (2026-07-27) — and it is the one that fails OPEN.**
>
> *(Later adversarial review found this framing understated: there are further non-exhaustive role registries —
> `readOnlyRoles` and `noScopeEdit` in `permissions.ts`, both typed `UserRole[]`, neither exhaustive. They fail
> CLOSED, so they are not dangerous in the same way, but "the ninth" implies a completeness the count does not
> have. Treat the lesson as "untyped and non-exhaustive role registries exist in several places" rather than
> "there were nine".)*
> `VALID_ROLES` in `src/lib/auth/role-migration.ts` is a plain **`Set<string>`**, so the compiler cannot check
> it. A role missing from that set does not fail the build: `mapLegacyRole` resolves it to **`viewer`**. And
> `mapLegacyRole` feeds `isAdminRole`, `getCapabilities`, `hasPermission` and `canAssignRole` — so the new role
> looks correct everywhere it is *displayed* and silently holds viewer's permissions everywhere it is *enforced*.
>
> The eight `Record<UserRole, …>` maps all failed the compiler loudly. This one failed nothing. The only symptom
> was a privilege-escalation test: `canAssignRole("viewer", "support")` returned **true**, because `support` had
> collapsed to `viewer` and a role may assign its own level.
>
> `tests/unit/role-permissions.test.ts` now asserts the round-trip — every role must satisfy
> `mapLegacyRole(role) === role` — so the next role cannot slip the same way. Note `ALL_ROLES`
> (`role-permissions.ts`) is also a hand-written array, not derived, and needs the new value too.

Every one needs a deliberate `support` entry. **Do not** paste a neighbouring role's value to make the compiler
quiet — `support` is a read-oriented operations persona: no assessment authoring, no user management, no
governance mutation. `ROLE_METADATA` needs `category`, `hierarchyLevel`, `validOrgTypes`, `mfaDefault`,
`maxConcurrentSessions`, `canCreateAssessments: false`, `canManageUsers: false`. `PERMISSION_MATRIX` takes a
`new Set([...])` of read-oriented actions only.

Also add: a `support@abeam.test` dev account (`src/lib/auth/dev-login.ts`, same shape as the existing five), and
`ROLE_LABELS` entry "Support".

### §5.2 · Workspace helpers in `rbac.ts`

- `canAccessOperations(role)` = `support` || `isAdminRole(role)`.
- `canAccessControlTower(role)` = `isAdminRole(role)` || `partner_lead` || `executive_sponsor` ||
  `project_manager` (read-only for the latter three). **Note `isAdminRole` is `platform_admin` only**
  (`permissions.ts:368-371`) — the read-only viewers must be listed explicitly.
- `canMutateControlTower(role)` = `isAdminRole(role)` only.
- Extend `accessibleWorkspaces` to the Inventory matrix. Keep `canAccessStudio` / `canMutateStudio` unchanged.

### §5.3 · The test constraint that will bite

`tests/unit/studio/rbac.test.ts:85-87` asserts `accessibleWorkspaces("platform_admin")` **equals**
`WORKSPACES.map(w => w.key)` — strict, ordered equality, not a superset. **If you refactor
`accessibleWorkspaces` into a per-role map, the admin branch must derive from `WORKSPACES`, never hand-list
keys**, or this test fails the moment the two drift.

`rbac.test.ts:96-109` additionally pins: exactly one `availableInV1` workspace, its `href === "/studio"`, and
`href: null` on every unbuilt workspace. **PR-CT1 must update this test as each workspace flips live** — that is
an intended change to the assertion, not a regression to route around.

---

## §6 · Shell and rail generalization (PR-CT1) — what actually needs changing

v2 said the rail hardcodes `STUDIO_SECTIONS`. It does not — `StudioRail` already takes a `sections` prop
(`:69`, `:73`). The hardcoding is one level up, in two places:

- `StudioShell.tsx` passes `sections={STUDIO_SECTIONS}` (`:43`) and `workspaces={WORKSPACES}` (`:41`) in its
  render.
- `StudioTopBar.tsx` imports `STUDIO_SECTIONS` (`:38`) and derives the breadcrumb from it (`:96-100`).

**The top bar is the widest-blast-radius change in this PR, and it is a live defect, not a tidiness item.** The
breadcrumb is `STUDIO_SECTIONS.find((s) => s.href === pathname)`, which returns `undefined` for every
`/operations/*` and `/control-tower/*` path and falls through to the bare `"Developer Studio"` string. A support
engineer opening the Ops health overview sees a top bar labelled **"Developer Studio"** on first load. Note this
component already ships in production Studio, so it must be changed additively and its existing behaviour
verified unchanged — the Studio breadcrumb must still read exactly as it does today.

**Do:**
1. Add `sections` and a workspace label/key to `StudioShell`'s props; pass them through to rail and top bar.
2. Add `sections` + workspace label to `StudioTopBar` and derive the breadcrumb from them. Everything else in
   that file — tenant switcher, `EnvChip`, `Dot`, role badge, account menu — stays **identical across all three
   workspaces**.
3. Add `OPERATIONS_SECTIONS` and `CONTROL_TOWER_SECTIONS` beside `STUDIO_SECTIONS`, same `StudioSection` shape,
   with `available` flipped on only as each screen's PR lands.
4. Add route groups `src/app/(operations)/operations/*` and `src/app/(control-tower)/control-tower/*`, each with
   a thin layout mirroring `(studio)/layout.tsx`: same `/presales/login` redirect (`:48`), same tenant resolve
   (`:66-88`), same `RoleGatedEmptyState` for non-entitled roles (`:56-58`) — gated by `canAccessOperations` /
   `canAccessControlTower`. Mount `AffirmLearnProvider` **only** if that workspace reuses the SAP catalogue
   components (Ops spot-check likely does; Control Tower likely does not) — it exists because those components
   throw without it, not as boilerplate.
5. In `WORKSPACES`, set `operations-center.href = "/operations"` and `control-tower.href = "/control-tower"`, and
   flip each `availableInV1 = true` **only when its screens ship**. A rail entry that 404s is worse than one that
   says "not yet".

**Keep the name `StudioShell`** rather than renaming to `ConsoleShell`: a rename touches every Studio page import
for no functional gain, and this PR is already load-bearing. If the shell's Studio-specific identity bothers you,
rename in a later cosmetic PR.

---

## §7 · Operations Center (owner `support`; per-org; tenant-selectable live views)

Build the screens the `.dc3.html` specifies, each backed by a **new GET, org-scoped, secret-safe** endpoint over
the captured feeds. Admin-global reads are an explicit branch, separately tested.

- **Home / health overview** — fleet status + attention feed, composed from the below.

- **Broker traffic** — `GET /api/ops/broker-traffic`. Aggregate `NorthboundAuditEvent`: honest status breakdown
  (200 / empty / 401-403 / **429** / 5xx), per-solution and per-token volume; filters by solution, environment,
  window. **429 rows are real** — the broker rate-limits in-route post-auth and writes the audit row before
  returning (`data/route.ts:59-79`). **Latency becomes real only via PR-CT2's `durationMs`**; until that lands,
  the screen shows no latency at all rather than a placeholder.
  **Two provenance caveats the screen must carry:**
  (a) *Middleware 429s are invisible here.* `/api/northbound/*` also passes the generic IP-keyed buckets
  (`apiRead` 300/min GET, `apiMutation` 120/min POST — `middleware.ts:232-248`), which fire **before** the
  per-token bucket and write **nothing** (`:252-269`). A caller throttled at the edge leaves no row.
  (b) *Platform timeouts are invisible here.* No northbound route sets `maxDuration`, while the broker allows
  upstream waits well beyond Vercel's default; a platform 504 returns before any audit write. Traffic counts are
  therefore a floor, not a census — say so on the screen, once, plainly.

- **Write ledger** — `GET /api/ops/write-ledger`. Blend two sources honestly:
  *in-flight* = `NorthboundIdempotencyKey.status IS NULL` and not expired; *completed* = `status` 2xx;
  *stored failure* = `status` ≥ 400. **"Replayed" and "conflicted" are not persisted row states** — they are
  computed responses (`idempotency.ts:70-78`, `:124-154`); their only persisted trace is the 409/4xx
  `NorthboundAuditEvent`. *Blocked* writes fail **before** the reservation and never enter the key table at all.
  **Required screen note (F-§7):** `releaseIdempotencyKey` **deletes** the reservation on post-reserve,
  pre-SAP refusals (`write/route.ts:178, 183, 198`), so the in-flight count can shrink with nothing completing.
  The two sources will not reconcile row-for-row. State that on the screen — an operator who infers a leak from
  an unreconciled count has been misled by our silence.
  **Indexing and retention (both in PR-CT2).** This table has only `@@unique([organizationId, solutionId, key])`
  and `@@index([expiresAt])` (`schema:772-773`) — nothing serves an org-scoped time-ordered scan, so add
  `@@index([organizationId, createdAt])` in the same additive migration. And because this front introduces the
  first query against this table, ship the reaper with it (§12 decision 3): a small cron deleting rows past
  `expiresAt`, against the already-indexed column.
  **This screen is empty by construction today** — see §10.

- **Connections health** — `GET /api/ops/connections-health`. `SapConnection` rollup on the **real** vocabulary.
  **v2's enum was wrong.** The real one (`connection-health.ts:30-36`) is
  `OK | UNAUTHORIZED | NOT_FOUND | TIMEOUT | ERROR | NO_PROBE_PATH`; **`NEVER_TESTED` does not exist** — a
  never-tested connection is `lastValidationStatus === null`, which the screen must render as its own state.
  Also show `lastValidatedAt` (moves **only** on a real 200 — `connections/[id]/test/route.ts:70`, so a stale
  timestamp beside a failing status is correct and must not be "corrected"), `environment` (PROD flagged,
  unknown = no chip), and `writeEnabled`. Metadata only.
  **Required: the binding-unverified backlog.** Count connections whose `environment` is `null` and present it
  as work to clear, not as a steady state — these are the connections on which §4.1 allows reads unverified and
  refuses writes outright. Give the count a route to remediation (the connection editor #167 ships) and expect it
  to trend to zero. A permanently non-zero count is the signal that the permissive read rule has quietly become
  permanent, which is precisely what §4.1 says it must not be.

- **Catalogue freshness** — `GET /api/ops/freshness`. Source is
  `SapHubContent.rawMetadataJson.probes[tenantKey] = { http, at, read, write }`, written by the admin-gated
  `probe-all` (`hub-content/probe-all/route.ts:98`) and rolled up by `hub-content/route.ts:180-211` (`lastProbedAt`
  = max `at`). **Caveat (F38, corrected):** an org-scoped rollup is *structurally* expressible — the map key is an
  arbitrary string and `SapConnection.key` is documented as that key — but *unreachable in practice*, because the
  only writer resolves through `getSapTenant(envPrefix, …)`, which 400s any key not in env config, even when
  supplied via `body.tenant`. So probes exist under **env-tenant keys**, not connection keys. Show freshness for
  the tenants that actually have probes, and do not imply per-connection coverage that cannot exist. Closing this
  is a probe-path change, not a modelling change — **not in this front**.

- **Throttle status** — `GET /api/ops/throttle`. **v2's design would consume the budget it measures**:
  `checkRateLimit` is a consuming call (in-memory pushes a timestamp; Upstash `limit()` spends a token) and no
  peek exists. **PR-CT2 must add a non-consuming `peekRateLimit`** (Upstash `getRemaining`; in-memory read
  without push) and this endpoint must use only that. Honest provenance: **northbound 429s are persisted** and can
  trend over time; **edge `sapLive` and generic-bucket 429s are not** — live gauge only, never a fabricated
  history.
  **A token has TWO northbound buckets, not one.** Reads key on `northbound:<clientId>`
  (`data/route.ts:59`) and writes key on `northbound-write:<clientId>` (`write/route.ts:100`) — both
  `RATE_LIMITS.northbound` (60/min), but **independent**. A gauge showing one combined "northbound" figure per
  credential would be wrong in both directions: it would under-report headroom and mask which side is saturating.
  Show them separately, or label the pair explicitly.

- **Tokens and credentials monitor** — `GET /api/ops/tokens`. `SolutionClient` lifecycle: active / expiring /
  rotation-due / revoked. **Never** the token, hash, or secret. **Caveat:** `lastUsedAt` is updated
  fire-and-forget (`void touchClientLastUsed(...)`) and on serverless the instance can freeze before the write
  lands, so "dormant" is a weak signal — label it as last *observed* use, and do not drive an incident from it
  alone. The write-credential half of this screen is **empty by construction** (§10).

- **Incidents / attention** — `GET /api/ops/incidents`. Derived: failing interfaces, needs-setup services,
  repeated 5xx, connection down, **PROD write attempts**. The PROD detector is only trustworthy after §4.1 and
  §4.3 — it must key off `connectionEnvironment`, and must visibly distinguish "unverified binding" from "PROD".

- **Live spot-check** — build it on the **broker's own read path**, not the Test Console's.
  **This supersedes an earlier version of this bullet** that said to reuse `/api/sap/tdd/entities` + `/preview`
  and label the result honestly. That was specifying a workaround for a defect this front already fixes.
  Those routes gate on **session presence only** (`entities/route.ts:53-58`, `preview/route.ts:21-23`) — no role
  check, no org scoping — and resolve their tenant from **query params + env vars**
  (`entities/route.ts:61-63`), so they cannot reach a stored `SapConnection` at all. An Ops spot-check built on
  them would answer about the deployment's shared tenant while the switcher displayed a client connection: the
  precise "comfortable fiction" honest status exists to prevent.
  **Build instead on `resolveSapConnectionForEnvironment` (created in PR-CT-0a §4.1) + `readEntitySet`
  (`src/lib/northbound/read.ts:98`, which already exists and already carries the honest-status classification).**
  This is **not a new SAP access path** — it is the broker's existing path, which is also why it avoids adding a
  fourth implementation of "is this activated?". Consequences that are part of this requirement: the new route
  must be **org-scoped and role-gated** like every other Ops endpoint, and it **must be added to
  `isLiveSapTenantRoute`** (`rate-limit.ts:196-209`) so it lands in the tight `sapLive` bucket — guardrail §3.6
  is not satisfied by inheriting the generic API ceiling.

- **Digital Access consumption** — render tagged **"arrives with the Digital Access Meter"**. Do not compute.

---

## §8 · Control Tower (owner `platform_admin` global; read-only viewers per matrix)

**Integration governance (new views over real data):**

- **Solution portfolio** — `GET /api/control-tower/portfolio`: `Solution` status, ownership completeness
  (tech + biz + support), classification, data class. Org-scoped; admin global as an explicit branch.
  *Honest note:* `dataClass` is a free string used in no gate anywhere — display it as a declaration, never as
  an enforced control.
- **Governance audit trail** — `GET /api/control-tower/audit`: `ConfigAudit` read, filters by entity / actor /
  action. Append-only.
- **Access-grant governance** — `GET /api/control-tower/grants` + the admin **decision** action. The decision is
  the one allowed mutation: SoD (requester ≠ approver), write checklist, writes `ConfigAudit`. It must not break
  `access-grants-route.test.ts:141` (self-decision refused), `:149` (a different builder decides), `:176`
  (re-deciding a settled grant is 409). **After §4.2, the progressive-trust display finally matches runtime** —
  render `READ_ONLY` and `SANDBOX_ONLY` with their real, now-enforced meaning. **The decision queue is empty by
  construction today** (§10).
  *Note the existing route is `requireBuilder()`-gated (consultant-only).* Control Tower's admin decision path is
  a **new** capability, not a re-use — `canMutateStudio("platform_admin")` is deliberately `false`
  (`rbac.test.ts:59-64`). Do not widen `canMutateStudio`; add the admin path under `canMutateControlTower` and
  keep that test green.
- **Connection and write register** — `GET /api/control-tower/connections`: `environment`,
  `lastValidationStatus` (real enum + null), `writeEnabled`, ownership, sealed-secret presence as a **boolean**.
- **Token and credential register** — `GET /api/control-tower/tokens`: `SolutionClient` issued / rotated /
  revoked, with the can't-self-issue-on-unowned-solution SoD visible. *Honest note:* issuance **upserts on
  `solutionId`** (`issue.ts:72-94`) — one credential per solution; re-issuing replaces the previous token and its
  environment. The register must not imply multiple concurrent credentials per solution.
- **Digital Access cost and licensing** — tagged forthcoming.

**Controls that are real but not invocable from Control Tower — render disabled, never live, never deleted.**
Both registers above surface actions that genuinely exist and are gated to the *consultant* role, so
`platform_admin` — this workspace's owner — receives a 403:
- **credential rotate / revoke** — `PATCH /api/studio/clients` → `requireBuilder()` → `canMutateStudio`
  (`clients/route.ts:52-67`);
- **connection write-enablement** (`Enable write` / `Revoke write`) — `PATCH /api/studio/connections` →
  `requireBuilder()` (`connections/route.ts:249-250`, gate at `:110-116`).

Render both **visible but disabled**, with copy naming Developer Studio as where the action lives. Deleting them
hides a real capability from the person doing oversight; wiring them live ships a button that 403s for the only
role that can reach the screen. This does **not** widen `canMutateStudio` — see §8's note on the grant decision.
If a future control falls in this category, use the same treatment rather than choosing between the two wrong
options.

**Platform governance — COMPOSE, do not rebuild:** Users (`api/admin/users`), Organizations
(`api/admin/organizations`), Roles and permissions (`api/roles` + the role matrix), Partner settings
(`api/partner/settings`), Portfolio analytics / KPIs (`api/analytics/*`, `api/dashboard/kpi`), Platform overview
(`api/admin/overview`). Control Tower provides the views and entry points; the data stays in those endpoints.
**Exclude** the assessment-content admin — it stays in the Workbench portal.

---

## §9 · Digital Access = forthcoming (out of scope)

The Digital Access Meter is a separate spec. In these two workspaces the DA screens are **designed-but-forthcoming
placeholders**, clearly labelled. Do **not** compute or display live document counts or cost. STOP-report if a
requirement tries to make them live. *(The spec file referenced by earlier pack versions does not exist in the
repo yet — do not treat it as an attachable input.)*

---

## §10 · Screens that are empty by construction (build them honest, do not fake data)

Upstream gaps mean some surfaces render empty no matter how correct this build is. **This is not a reason to
delay** — the honest-empty states are real product — but the copy must explain *why*, and nobody should be
surprised at demo time. Empty-state copy must distinguish *"nothing has happened yet"* from *"this cannot happen
yet"*; the second is the honest state here.

**Staying empty in this front (decided — see §12 decision 2):**

1. **Write ledger + write-credential monitor.** `setWriteCredential` / `generateWriteCredential`
   (`src/lib/northbound/write-credential.ts:29, 41`) have **no callers outside tests** — no route, no UI, no
   script. Every northbound write fails the credential gate before reserving an idempotency key, so
   `NorthboundIdempotencyKey` stays empty. **This is deliberate and the copy should be good**: *"No write
   credential has been issued, so every write is refused at the credential gate"* is a precise, verifiable
   statement about a real control, and one of the better honest-status demonstrations in the product. Write it
   as a feature of the screen, not as an apology.

**Filling during this front (the parallel loop-closing workstream, decision 2):**

2. **Grant decision queue.** Empty today because `POST /api/studio/access-grants` is called by **nothing** in the
   app — the client component only sends the `PATCH` decision. The parallel workstream adds the request dialog,
   so **build this screen expecting real pending rows**, and treat a persistently empty queue as a signal that
   the dialog has not landed rather than as the designed state.
3. **Broker traffic** fills as solutions gain working credentials and approved grants. It will be thin early;
   design for thin, not for empty.

---

## §11 · Build order (each PR green before the next)

| PR | Delivers | Tier |
|----|----------|------|
| **PR-CT-0a** | §4: environment→connection binding · grant-decision semantics · additive audit fields (`connectionId`, `connectionEnvironment`) + the new error code · guard-in-vitest with call-site remediation | **Opus** |
| **PR-Rbac** | §5: `support` role across all eight `Record<UserRole,…>` maps, dev-login account, workspace helpers | **Opus** |
| **PR-CT1** | §6: shell/top-bar parameterization, section lists, both route groups gated, honest empty screens | **Opus** |
| **PR-CT2** | §7 endpoints + additive `durationMs` (audit writer + call sites) + `@@index([organizationId, createdAt])` on `NorthboundIdempotencyKey` + its **expiry reaper cron** + **non-consuming `peekRateLimit`** | **Opus** |
| **PR-CT3** | §7 screens on the `dc3` design (**not `dc2` — see the §0 gate**); live spot-check; DA forthcoming | Fable viable (read path Opus-reviewed) |
| **PR-CT4** | §8 integration governance: portfolio, ConfigAudit trail, grant governance + decision/SoD, registers | **Opus** |
| **PR-CT5** | §8 composed platform governance; DA cost forthcoming | Fable viable |

Every PR: green `typecheck:strict · lint:strict · test · build`; org-scoped; honest status and honest
environment; secret-safe; a11y AA; `ConfigAudit` on the one governance mutation; read-only probing against
**X5M/100** only.

**If PR-CT-0a sprawls, split it this way — and only this way.** It now carries four fixes plus the write-grant
expiry rule, and it gates six downstream PRs, so a reviewer drowning in it is a foreseeable outcome. The clean
seam is:

- **PR-CT-0a(i)** — §4.1 environment→connection binding + §4.3 the additive audit fields and error code. These
  two must stay together: the fields are how the binding is proven.
- **PR-CT-0a(ii)** — §4.2 grant-decision semantics + the write-grant expiry rule + §4.4 the guard and its
  call-site remediation.

Both still land **before PR-Rbac**. Do not split along any other line — in particular, never separate §4.1 from
§4.3 (a binding with no evidence), and never land §4.2's `grantsWrite` change without the expiry rule (the two
together are what make a write grant bounded).

---

## §12 · Explicitly out of scope (do not let scope creep in)

- **Global production wiring of `tenantScopeGuard`** — §4.4. Decline if proposed.
- **KMS / Vault custody of `SAP_CONNECTION_ENCRYPTION_KEY`**, key versioning, and a `migrate:reseal` script — a
  known, documented, deliberately deferred gap. (Note the variable is also absent from
  `scripts/check-production-env.js`; worth a one-line fix in a separate hygiene PR, not here.)
- **Retention for `NorthboundAuditEvent`** — deferred (decision 3). *The `NorthboundIdempotencyKey` reaper is
  **in scope**, in PR-CT2.*
- **The loop-closing fixes** — out of scope *for these PRs*, but the access-request dialog and `entitySet`
  editing run **in parallel** as their own workstream (decision 2), and the grant decision queue is built
  expecting their output. **Write-credential issuance is explicitly held** — see decision 2.
- **`maxDuration` on northbound routes**, the audit-write silent-catch, pagination pass-through, and the broader
  error taxonomy — real issues, separate PRs.
- **The catalogue-freshness probe-path fix** — §7.

### Decisions — all four settled (2026-07-27; build to these, do not reopen)

**Decision 4 · Environment binding is split by operation.** Reads against an undeclared (`null`) environment are
allowed on a sole connection and marked *binding unverified*; writes are refused outright regardless of
connection count or `writeEnabled`. Full rule and rationale in §4.1; the unverified count is a tracked backlog on
the Ops connections screen (§7), not a steady state.

**Decision 2 · Loop-closing runs in parallel, but split.** The **access-request dialog** and **`entitySet`
editing** are built alongside this front, so Control Tower's grant decision queue has real pending rows and the
broker traffic feed has real traffic. **Write-credential issuance is deliberately held back** unless a demo
specifically requires a live write to land in SAP: standing up a new secret-minting surface for demo convenience
is the wrong trade, and the write ledger's empty state — *"no write credential has been issued, so every write is
refused at the credential gate"* — is a stronger demonstration of the product's honesty than a populated table
would be. See §10.

**Decision 1 · Grant revocation is DEFERRED; required `expiresAt` on write grants is the control.** Do not build
a revocation mutation in this front. §3 rule 5 stands unamended: the grant decision remains the only mutation.

*Why deferred, precisely.* Revocation is not a UI addition — it is a semantics change to the access check, and
both available shapes are load-bearing. `evaluateDecision` refuses any non-`REQUESTED` current state
(`grants.ts:96-103`) and `access-grants-route.test.ts:176` pins that 409, so revocation cannot be modelled as a
decision. **Shape A**, mutating the settled grant, breaks the once-only invariant the ledger's integrity rests on,
and its test. **Shape B**, writing a new `REVOKED` row, does **nothing at runtime**: `access.ts:220` filters to
granting rows and accepts any live one, so the original `APPROVED` row still authorises. Closing that means
teaching `resolveReadableInterface` and `resolveWritableInterface` to look for a later revoking row — a change to
the two functions PR-CT-0a is already rewriting, inside the heaviest PR in the sequence. It also raises an
unanswered SoD question: may the approver revoke alone, or does withdrawal need a second person?

*Why the compensating control is not a stopgap.* A bounded write grant **is** revocation expressed in a primitive
the runtime already honours at call time (`access.ts:136`, `:231`) — no invariant broken, no new state, no new
mutation. The enforcement lands in §4.2: `evaluateDecision` refuses to settle a write-granting decision with a
null expiry. If the owner later wants true revocation, it deserves **its own PR after PR-CT4**, with the runtime
semantics designed rather than inherited.

**Decision 3 · Retention splits by table.** The pack previously treated one decision where there are two tables
with different properties.

- **`NorthboundIdempotencyKey` — reap now, in PR-CT2.** It is outside the append-only guarantee (the test's regex
  matches only `configAudit|northboundAuditEvent`, `dod-gaps.test.ts:160-179`), `expiresAt` is already indexed
  (`schema:773`) behind a 24h TTL, and expired rows are *already* treated as garbage — `reserveIdempotencyKey`
  resets them in place on collision (`idempotency.ts:106-121`). Deferring would make a query **this front
  introduces** get monotonically slower for no reason anyone chose. A small cron against an indexed column, with
  no test collision and no policy question; `vercel.json` already carries one cron to pattern-match.
- **`NorthboundAuditEvent` — defer, and log the growth honestly on the Ops screens.** It *is* inside the
  append-only guarantee, and retention there needs a stated period, a legal basis and a tested exception — none
  of which should be invented mid-UI-build.

*(Decision numbers are preserved from the original register so cross-references stay stable. All four are now
settled; if any is reopened, it is a product decision, not a build-time one — stop and report rather than
inferring.)*

---

## §13 · Reporting and operating rules

- **Post STEP-0 recon first** (§2), citing `file:line` at your SHA. No code until it is clean or a blocker is
  reported.
- **Execute with the `.dc3.html` attached** — it is the visual contract; translate to real shadcn and real tokens
  1:1. Production state comes from the real endpoints; the design's outcome switcher is a preview device only.
- **Work PR by PR**, each green with its tests, flipping each workspace and section live only as its screens ship.
- **STOP and report, never guess** — on a missing or inconsistent design, a screen implying a new SAP path, an
  ungateable mutation, a secret-exposure risk, a throttle-counter gap, or any conflict with the codebase or the
  Inventory. A half-built gate or a fabricated metric is worse than a stopped PR.
- Success = both workspaces match the design, **every number resolves to a real feed**, tenant isolation and
  secret safety are structural, honest status and honest environment hold everywhere, and nothing had to be undone.
