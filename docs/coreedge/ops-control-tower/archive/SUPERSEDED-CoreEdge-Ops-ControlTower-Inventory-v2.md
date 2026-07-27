# CoreEdge Console — Operations Center & Control Tower · Design-Ready Inventory (v2)

**Purpose.** The content spec for designing the two remaining CoreEdge Console workspaces. Decision-locked and
**re-grounded fresh against `ib823/aptus` @ `main` #167 (`70a6cec`)** — not cached. Every capability is tagged
with its **real data source** and **build status**: Claude Design may render only what a tag backs.

**Status legend:** **[built]** exists and is wired · **[captured, not shown]** recorded but no view yet ·
**[net-new]** must be built · **[needs-PR-M]** depends on the Digital Access Meter (not built).

**What changed since v1 of this inventory (the #161–#167 refinement batch):** the shared shell now has a real
tenant switcher + SAP-environment chip; `SapConnection` gained `environment` and a `lastValidationStatus` enum;
connections are full CRUD from the console; credential issuance has an ownership/SoD gate. Roles/RBAC are
**unchanged** — the `support` role still doesn't exist (PR-Rbac §4 still required) and both workspaces are still
greenfield (`availableInV1: false`, locked in the rail).

---

## Locked decisions (unchanged, reconfirmed against #167)

1. **Operations Center persona = a NEW `support` role** → codebase prerequisite **PR-Rbac** (§4).
2. **v1 scope = per-org governance + tenant-selectable live views.** The shell already models this exactly: the
   tenant switcher applies to **live-SAP reads** (Discover, Test Console, broker, health); **Solutions,
   Interfaces, API Access and all governance are org-scoped, not tenant-scoped.** `platform_admin` keeps its
   global exemption (`rbac.ts` `lacksStudioTenantScope`).
3. **Control Tower = full platform governance** — absorbs users/orgs/roles/analytics (existing `api/admin`,
   `api/roles`, `api/analytics`, `api/partner`), plus the CoreEdge integration governance. Excludes the
   assessment-content admin (stays in the Workbench portal).

---

## Shared shell (already built — both workspaces inherit it verbatim)

The 220px navy rail + 56px paper top bar from `StudioRail` / `StudioTopBar`. Design the two new workspaces
*inside this exact chrome*:

- **Tenant switcher** — the org's own `SapConnection` rows, or the deployment's env tenants; a **cookie view
  preference, never an authorization input** ("Resolved from your access — never typed into a URL"). Honest empty
  "No SAP tenant connected" when the org has none.
- **Environment chip** — `SapConnection.environment` (`DEV/TEST/PROD` or a landscape's own name); **PROD renders
  as a warning**; **unknown renders no chip** (never a guessed default). Describes the *SAP tenant*, never the
  console's own deployment.
- **Origin dot** — navy = the org's own sealed connection; muted = a shared deployment tenant ("your own DEV" vs
  "someone else's DEV").
- **Role badge + account menu** (sign-out revokes the server session, not just the cookie).

**Environment awareness is a cross-cutting design rule:** any tenant-pointed view in either workspace carries the
environment chip and the PROD-as-warning treatment. This is the primary guard against acting on the wrong SAP
landscape.

---

## Persona & gating matrix (the RBAC the design must show)

Non-entitled / unbuilt workspaces render **locked 🔒**, never hidden (existing rail pattern).

| Role (real) | Developer Studio | Operations Center | Control Tower |
|-------------|:---:|:---:|:---:|
| `consultant` (builder) | **owner** (build) | 🔒 | 🔒 |
| `support` (**new, PR-Rbac**) | 🔒 | **owner** (run) | 🔒 |
| `platform_admin` | oversight (read) | oversight (read) | **owner** (govern, global) |
| `partner_lead` | 🔒 | read-only (their org) | read-only (portfolio/analytics) |
| `executive_sponsor` | 🔒 | 🔒 | read-only (strategic KPIs) |
| `project_manager` (read-all) | 🔒 | read-only | read-only |
| all other roles | 🔒 | 🔒 | 🔒 (role-gated empty state) |

`/dev-login` walkable personas: `platform_admin`, `partner_lead`, `consultant`, `project_manager`,
`executive_sponsor` — **+ `support` once PR-Rbac adds its dev account.** Verify each screen per-role.

---

## OPERATIONS CENTER — "is the live integration healthy right now?"
**Owner:** `support` (new) · **Scope:** per-org (tenant-selectable live views) · **Altitude:** run / runtime

| Capability | Real data source | Status |
|-----------|------------------|--------|
| Broker traffic feed — live northbound calls, honest status (200/empty/401-403/5xx), latency, per-solution & per-token volume | `NorthboundAuditEvent` via `lib/northbound/audit.ts` | **[captured, not shown]** |
| Write ledger — gated writes: in-flight / completed / replayed / conflicted (key reuse) | `NorthboundIdempotencyKey` | **[captured, not shown]** |
| SAP connection health (fleet) — per-connection **`lastValidationStatus`** (OK / UNAUTHORIZED / NOT_FOUND / TIMEOUT / ERROR / NEVER_TESTED), `lastValidatedAt`, **`environment`**, `writeEnabled` | `SapConnection` + `lib/studio/connection-health.ts` | **[built per-connection incl. status+env → net-new fleet rollup]** |
| Catalogue freshness (WS3) — fresh/stale, last probe | WS3 freshness in SAP components | **[built → net-new rollup]** |
| Throttle status — near-limit + 429s on the two buckets | `RATE_LIMITS.sapLive` (20/min), `RATE_LIMITS.northbound` (60/min), `middleware.ts` | **[built primitive → net-new surface]** |
| Token operations — active `SolutionClient` tokens + write credentials, last-used, expiring/rotation-due, revoked | `SolutionClient`, `lib/northbound/write-credential.ts` | **[lifecycle built → net-new monitor]** |
| Incidents / attention — failing interfaces, needs-setup (401), repeated 5xx, connection down, **PROD write attempts** | derived from the feeds above | **[net-new]** |
| Live spot-check — confirm a service really returns rows (honest status) | Test Console read path (`/entities` + `/preview`) | **[built → reuse read-only]** |
| Live Digital Access consumption — documents created now, per solution, spikes | Digital Access Meter | **[needs-PR-M]** |

---

## CONTROL TOWER — "is the portfolio governed, and is it worth it?"
**Owner:** `platform_admin` (global) · read-only for `partner_lead` / `executive_sponsor` / `project_manager` (per-org) · **Altitude:** oversight

*CoreEdge integration governance*

| Capability | Real data source | Status |
|-----------|------------------|--------|
| Solution portfolio — status (DRAFT/ACTIVE/RESTRICTED/RETIRED), ownership completeness (tech+biz+support gate), classification, data class | `Solution` | **[built data → net-new portfolio view]** |
| Governance audit trail — who changed what (solutions/interfaces/grants/connections/tokens), promotions, decisions | `ConfigAudit` | **[captured, not shown]** |
| Access-grant governance — decision ledger + SoD (requester≠approver) + progressive trust, across solutions | `ApiAccessGrant` | **[built ledger → net-new rollup]** |
| Connection & write register — per connection: `environment`, `lastValidationStatus`, `writeEnabled`, ownership; sealed-secrets status. (Connections are created/managed in Studio, #167; Control Tower governs write-enablement + ownership.) | `SapConnection` | **[built → net-new posture view]** |
| Token & credential register — issued/rotated/revoked read tokens + write credentials; the **can't-self-issue-on-unowned-solution** SoD (#166) | `SolutionClient` | **[built → net-new register]** |
| Digital Access cost & licensing — DA documents by solution/period + collate/export for licensing | Digital Access Meter | **[needs-PR-M]** |

*Platform governance (decision #3 — mapped to existing surfaces)*

| Capability | Real data source | Status |
|-----------|------------------|--------|
| Users — directory, role assignment, workspace entitlement | `api/admin/users` | **[built → compose]** |
| Organizations / tenancy | `api/admin/organizations`, `api/organizations/[orgId]` | **[built → compose]** |
| Roles & permissions — the 11-role model + matrix | `api/roles`, `role-metadata.ts`, `permission-matrix.ts` | **[built → compose]** |
| Partner settings | `api/partner/settings` | **[built → compose]** |
| Portfolio analytics / KPIs — adoption, reuse, benchmarks | `api/analytics` (portfolio/benchmarks/cross-phase), `api/dashboard/kpi` | **[built → compose]** |
| Platform overview | `api/admin/overview` | **[built → compose]** |

**Boundary note:** Control Tower folds in the *platform/tenancy/people/analytics* admin — **not** the
assessment-content admin (`api/admin/adaptation-patterns`, `baselines`, `conversation-templates`,
`extensibility-patterns`, `industries`, `assessments`), which stays in the existing Workbench portal.

---

## The three-altitude boundary (so nothing overlaps or is missed)

Same objects, three altitudes. **Studio** = *build & configure* one solution (consultant's bench — now includes
adding/managing connections, #167). **Operations Center** = *is it healthy now* (support's run view;
live/fleet/incidents, tenant-selectable). **Control Tower** = *is it governed & worth it* (admin's oversight;
portfolio, decisions, people, cost, posture; org-scoped, admin-global). A Connection makes it concrete: Studio
adds & configures it · Ops watches its health/environment · Control Tower governs who may write and who owns it.

---

## §4 · PR-Rbac — the Support-role prerequisite (small; still required; land before Ops Center is backable)

Add role #12 so the Operations Center persona is real (unchanged since v1 — reconfirmed the code still lacks it):

- `src/types/assessment.ts` — add `| "support"` to the `UserRole` union.
- `src/lib/auth/role-metadata.ts` — add a `support` entry (id `support`, label "Support", description e.g.
  "CoreEdge operations — monitors live integrations").
- `src/lib/auth/permission-matrix.ts` — add `support: new Set([...])` (read-oriented ops actions; no governance
  mutations).
- `src/lib/auth/dev-login.ts` — add a `support@abeam.test` dev account (walkable persona).
- `src/lib/studio/rbac.ts` — add `canAccessOperations(role) = isSupport(role) || isAdminRole(role)`; extend
  `accessibleWorkspaces` (`support → ["operations-center"]`); flip `operations-center.availableInV1 = true` when
  the workspace ships. **Opus** (RBAC correctness); tests: support sees only Ops, others stay locked.

Design does not need this merged first — Claude Design can design the `support` persona now — but it must land for
the built screens to be role-backable.

---

## Alignment summary (what Claude Design may and may not render)

- **Real, wire faithfully:** everything **[built]** / **[captured, not shown]** — the honest-status broker feed,
  the write/idempotency ledger, connection health (with the real status enum + environment), tokens, the grant
  ledger, ConfigAudit, and every composed platform-admin surface.
- **Design the view, mark the data real:** **[net-new]** rollups over data we already collect.
- **Design it, label it forthcoming:** **[needs-PR-M]** Digital Access cost/consumption — show the screen, tag it
  "arrives with the Digital Access Meter," never live.
- **Honest status + honest environment everywhere:** empty ≠ needs-setup ≠ error; PROD flagged, unknown-env never
  guessed; never fabricate a row, count, health, or environment.
