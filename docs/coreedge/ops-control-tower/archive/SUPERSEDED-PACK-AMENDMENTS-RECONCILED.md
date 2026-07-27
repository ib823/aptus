# Pack Amendments — Reconciled Findings (CCC ⇄ Cowork), 2026-07-27

Status: agreed by both assessments against `main @ 70a6cec`. These are BINDING inputs to D2 (Build Bible v3),
D3 (Inventory v3), D4 (Runbook v2), D5 (execution prompt). Verdict: **CONDITIONAL GO** unchanged.

## F54 — tenantScopeGuard has no production call site
`src/lib/db/prisma.ts` is a bare `new PrismaClient({log})`; the only `tenantScopeGuard|$extends` hit in `src/`
is the declaration (`src/lib/studio/tenant-scope.ts:198`). Structural isolation is per-call-site discipline today.
Disposition: PR-CT-0a gains a **fourth step** (see F54a); global production wiring is deliberately OUT of this
front — its own PR later (portal/Workbench call sites must be remediated first). D5 must instruct the executing
session to **decline** global wiring if it suggests it.

## F54a — test-only guard wiring trips on legitimate queries (scope correction to F54 step 4)
The guard's `SCOPED_OPERATIONS` includes `findUnique`/`update`/`delete` (`tenant-scope.ts:163-174`) and
`whereHasOrganization` is a JSON substring check (`:176-183`). Attaching it to the vitest client throws on:
1. `auth.ts:73` — `solutionClient.findUnique({ where: { tokenHash } })`: legitimately unscoped (org is DERIVED
   from this lookup). Needs an explicit, greppable, documented exemption.
2. The canonical mutation idiom — scoped `findFirst` then `update({ where: { id } })`: `issue.ts:113` (rotate),
   `issue.ts:145` (revoke), recurring across Studio routes.
Agreed fix shape (preference order): scope the wheres using Prisma `extendedWhereUnique`
(`update({ where: { id, organizationId } })` — GA in Prisma 5), which also independently hardens the mutations;
plus the narrow tokenHash exemption; plus a test proving the guard fires on an unscoped anchored-model query.
PR-CT-0a step 4 is **call-site remediation work (~half day+), not a wiring checkbox** — D2 must say so.

## F38 (reframed) — org-scoped catalogue freshness is expressible but unreachable
The probe map key is an arbitrary string and `SapConnection.key` is documented as that key
(`prisma/schema.prisma` SapConnection block), BUT `mergeStoredProbe`'s only caller
(`probe-all/route.ts:98`) resolves via `getSapTenant(envPrefix, …)` which 400s any key not in env config,
even from `body.tenant`. A fix is a probe-path change, not a modelling change. Not in this front; the pack
must state the reason accurately.

## §7 — write-ledger sources cannot reconcile row-for-row (screen-note REQUIRED)
`releaseIdempotencyKey` DELETES the reservation on post-reserve/pre-SAP refusals
(`write/route.ts:178,183,198`), so in-flight counts can shrink with nothing completing. "Replayed" and
"conflicted" are computed responses, never persisted row states (`idempotency.ts:70-78,124-154`); the only
persisted trace is the 409/4xx `NorthboundAuditEvent`. D2 §6.5 + D3: the Ops write-ledger screen must state
this blend explicitly so an operator does not read the mismatch as a leak.

## §10 — RBAC test constraints on PR-Rbac
`tests/unit/studio/rbac.test.ts:85-87` asserts `accessibleWorkspaces("platform_admin")` EQUALS
`WORKSPACES.map(w => w.key)` (strict, ordered). If PR-Rbac refactors to a per-role map, the admin branch must
DERIVE from `WORKSPACES`, never hand-list keys. `rbac.test.ts:96-109` also pins: exactly one `availableInV1`
workspace and `href: null` on unbuilt ones — PR-CT1 must update this test as workspaces flip live.
`tests/unit/studio/access-grants-route.test.ts:141,149,176` pin SoD + settled-grants-are-terminal; the
Control Tower admin decision path must not break them.

## Carried unchanged from the reconciled recon (for D2/D3 provenance notes)
- Middleware 429s are unpersisted and IP-keyed IN FRONT of the token bucket; `/api/northbound/*` sits in the
  generic `apiRead`/`apiMutation` buckets (`middleware.ts:214-248`, `rate-limit.ts:196-209`).
- `/api/ops/throttle` requires a non-consuming `peekRateLimit` (F1) — `checkRateLimit` consumes.
- The Test Console spot-check path (`/api/sap/tdd/entities|preview`) has NO role/org gate beyond session
  presence and reads env tenants only — the Ops spot-check design must account for both.
- `SapConnection.environment` is never read for selection/authorization anywhere (recon §11) — pre-work PR
  (environment→connection binding + READ_ONLY/SANDBOX_ONLY semantics) precedes PR-CT2; PR-CT2's additive
  migration adds `durationMs` + `connectionId` + connection-environment to `NorthboundAuditEvent`.
