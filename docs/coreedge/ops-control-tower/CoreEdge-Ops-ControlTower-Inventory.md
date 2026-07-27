# CoreEdge Console — Operations Center & Control Tower · Design-Ready Inventory (v3)

**Supersedes** `CoreEdge-Ops-ControlTower-Inventory_1.md` (v2) in full, and carries the correct filename the
Build Bible and Runbook cite. Re-grounded against `ib823/aptus` @ `main` `70a6cec` (#167) by two independent
recon passes. Every capability is tagged with its **real data source** and **build status**: the design may
render only what a tag backs.

**Status legend:** **[built]** exists and is wired · **[captured, not shown]** recorded but no view yet ·
**[net-new]** must be built · **[empty-by-construction]** the view is real, the feed cannot fill yet ·
**[needs-PR-M]** depends on the Digital Access Meter (not built).

**What changed from v2:** the connection-health status vocabulary was **wrong** and is corrected below; the
throttle gauge as specced would consume the budget it measures; the catalogue-freshness limitation was
misdescribed (the reason matters, because it changes what a fix is); three capabilities are re-tagged
**[empty-by-construction]**; and every tenant-pointed capability now carries an explicit provenance caveat where
the underlying feed cannot support what a naive reading of the screen would imply. Roles/RBAC are unchanged —
the `support` role still does not exist and both workspaces are still greenfield (`availableInV1: false`).

---

## Locked decisions (reconfirmed against #167)

1. **Operations Center persona = a NEW `support` role** → codebase prerequisite PR-Rbac. Note the union change
   breaks **eight** exhaustive `Record<UserRole, …>` maps, not four files — see Build Bible v3 §5.1.
2. **v1 scope = per-org governance + tenant-selectable live views.** The tenant switcher applies to **live-SAP
   reads**; Solutions, Interfaces, API Access and all governance are **org-scoped, not tenant-scoped**.
   `platform_admin` keeps its global exemption (`rbac.ts` `lacksStudioTenantScope`), and admin-global reads are an
   explicit, separately-tested branch — never an unscoped fallthrough.
3. **Control Tower = full platform governance** — absorbs users / orgs / roles / analytics / partner settings,
   plus CoreEdge integration governance. **Excludes** the assessment-content admin (stays in the Workbench portal).

---

## Shared shell (built — both workspaces inherit it)

The 220px navy rail + 56px paper top bar from `StudioRail` / `StudioTopBar`. Design the two new workspaces inside
this exact chrome.

- **Tenant switcher** — the org's own `SapConnection` rows, else the deployment's env tenants; a **cookie view
  preference, never an authorization input** ("Resolved from your access — never typed into a URL"). Honest empty
  "No SAP tenant connected".
- **Environment chip** — `SapConnection.environment`; **PROD renders as a warning**; **unknown renders no chip**
  (`StudioTopBar.tsx:339`). Describes the *SAP tenant*, never the console's deployment.
- **Origin dot** — navy = the org's own sealed connection; muted = a shared deployment tenant.
- **Role badge + account menu** (sign-out revokes the server session, not just the cookie).

**Build note for the designer/engineer:** the rail is already parameterized by `sections`, but `StudioShell` and
`StudioTopBar` hardcode Studio (the breadcrumb literal at `StudioTopBar.tsx:96-100`). Generalizing those two is
PR-CT1 work; the *visual* result is unchanged.

**Environment awareness is a cross-cutting rule:** any tenant-pointed view carries the environment chip and the
PROD-as-warning treatment. ⚠️ **Until PR-CT-0a lands, the environment shown on runtime traffic is the *token's*
declared environment, not the connection actually called** — see the caveat under Broker traffic.

---

## Persona & gating matrix (what the design must show)

Non-entitled / unbuilt workspaces render **locked 🔒**, never hidden.

| Role (real) | Developer Studio | Operations Center | Control Tower |
|-------------|:---:|:---:|:---:|
| `consultant` (builder) | **owner** (build) | 🔒 | 🔒 |
| `support` (**new, PR-Rbac**) | 🔒 | **owner** (run) | 🔒 |
| `platform_admin` | oversight (read) | oversight (read) | **owner** (govern, global) |
| `partner_lead` | 🔒 | read-only (their org) | read-only (portfolio/analytics) |
| `executive_sponsor` | 🔒 | 🔒 | read-only (strategic KPIs) |
| `project_manager` (read-all) | 🔒 | read-only | read-only |
| all other roles | 🔒 | 🔒 | 🔒 (role-gated empty state) |

`isAdminRole` is **`platform_admin` only** (`permissions.ts:368-371`) — the three read-only viewer roles must be
listed explicitly in `canAccessControlTower`, not inferred.

`/dev-login` walkable personas: `platform_admin`, `partner_lead`, `consultant`, `project_manager`,
`executive_sponsor` — **+ `support` once PR-Rbac adds its dev account.** Verify each screen per role.

---

## OPERATIONS CENTER — "is the live integration healthy right now?"
**Owner:** `support` · **Scope:** per-org, tenant-selectable live views · **Altitude:** run / runtime

| Capability | Real data source | Status |
|-----------|------------------|--------|
| Broker traffic feed — honest status (200 / empty / 401-403 / **429** / 5xx), per-solution & per-token volume | `NorthboundAuditEvent` | **[captured, not shown]** |
| Broker traffic — **latency** | ⚠️ **no duration field exists**; real only after PR-CT2 adds `durationMs` | **[net-new field required]** |
| Write ledger — in-flight / completed / stored-failure | `NorthboundIdempotencyKey` | **[empty-by-construction]** |
| SAP connection health (fleet) | `SapConnection` + `lib/studio/connection-health.ts` | **[built per-connection → net-new fleet rollup]** |
| Catalogue freshness | `SapHubContent.rawMetadataJson.probes[tenantKey]` | **[built → net-new rollup, env-tenant scoped only]** |
| Throttle status | `RATE_LIMITS.sapLive` (20/min); `.northbound` (60/min) applied to **two independent per-token buckets** — `northbound:<id>` for reads, `northbound-write:<id>` for writes | **[built primitive → net-new surface + new peek fn]** |
| Token operations — active / expiring / rotation-due / revoked | `SolutionClient` | **[lifecycle built → net-new monitor]** |
| Write-credential operations | `SolutionClient.secretsCiphertext` via `write-credential.ts` | **[empty-by-construction]** |
| Incidents / attention — failing interfaces, needs-setup, repeated 5xx, connection down, **PROD write attempts** | derived from the feeds above | **[net-new]** |
| **Binding-unverified backlog** — connections with no declared `environment` (reads allowed unverified, writes refused) | `SapConnection.environment IS NULL` | **[net-new; must trend to zero]** |
| Live spot-check | broker read path: `resolveSapConnectionForEnvironment` + `readEntitySet` (`read.ts:98`) | **[net-new route over built primitives; reads the *selected* connection]** |
| Live Digital Access consumption | Digital Access Meter | **[needs-PR-M]** |

### Provenance caveats the design must absorb (each one is a screen note, not a footnote)

- **Broker traffic is a floor, not a census.** Two classes of failure leave no row: (a) middleware 429s —
  `/api/northbound/*` also passes the generic IP-keyed buckets (`apiRead` 300/min, `apiMutation` 120/min) which
  fire **before** the per-token bucket and persist nothing (`middleware.ts:252-269`); (b) platform timeouts — no
  northbound route sets `maxDuration`, so a slow tenant yields a platform 504 before any audit write. The in-route
  **429s are real and persisted** (`data/route.ts:59-79`); those are the ones that can trend.
- **Environment on a traffic row is the token's, not the connection's** (`audit.ts:26, 43`). Until PR-CT-0a adds
  `connectionId` + `connectionEnvironment`, an environment filter and any "PROD write attempt" alert are built on
  a value that can be sincerely wrong — because `SapConnection.environment` plays no part in connection selection
  anywhere (`connection-resolver.ts:107-116` returns the oldest active connection). **After PR-CT-0a**, show the
  pair and distinguish *agreed* / *unverified binding* / *mismatch*.
- **Binding is split by operation (settled decision).** Where a connection has no declared `environment`, a
  **read** is allowed on a sole connection and stamped `connectionEnvironment: null`; a **write** is refused
  outright, regardless of connection count or `writeEnabled`. The `environment` column shipped in migration
  `20260726060000_sap_connection_environment` — one day before the grounding SHA — so the null state is an
  unbackfilled estate, not a legacy one. Design the *binding-unverified* count as a **backlog with a route to
  remediation**, not a status badge: a permanently non-zero count means the permissive read rule has silently
  become permanent.
- **Grant expiry is the revocation story.** Revocation is deliberately **not** built in this front (it would be a
  semantics change to the access check, not a UI addition). Instead, a write-granting decision now requires an
  `expiresAt`, and expiry is evaluated at call time. So the grant views must make **time remaining** legible —
  an approaching expiry is the operator's only lever on an active write grant, and a grant that lapses silently
  is a support incident nobody was warned about.
- **Write ledger sources will not reconcile row-for-row.** "Replayed" and "conflicted" are computed responses,
  never persisted row states (`idempotency.ts:70-78, 124-154`); *blocked* writes fail before the reservation; and
  `releaseIdempotencyKey` **deletes** the reservation on post-reserve/pre-SAP refusals (`write/route.ts:178, 183,
  198`), so in-flight can shrink with nothing completing. **State this on the screen** — an operator who infers a
  leak from an unreconciled count has been misled by our silence.
- **Connection health — the corrected vocabulary.** v2 listed `NEVER_TESTED`, which **does not exist**. The real
  enum (`connection-health.ts:30-36`) is `OK | UNAUTHORIZED | NOT_FOUND | TIMEOUT | ERROR | **NO_PROBE_PATH**`,
  and *never tested* is `lastValidationStatus === null` — a seventh state the design must render distinctly.
  `lastValidatedAt` moves **only on a real 200** (`connections/[id]/test/route.ts:70`), so a stale timestamp
  beside a failing status is correct and must not be "tidied".
- **Catalogue freshness is env-tenant scoped, and the reason matters.** The probe map is keyed by an arbitrary
  string, and `SapConnection.key` is documented as that key — so per-connection freshness is *structurally
  expressible*. It is nonetheless *unreachable*, because the only writer (`hub-content/probe-all/route.ts:98`)
  resolves through `getSapTenant(envPrefix, …)`, which rejects any key not in env config even when supplied via
  `body.tenant`. Probes therefore exist only under env-tenant keys. Show freshness for tenants that actually have
  probes; never imply per-connection coverage. **Closing this is a probe-path change, not a modelling change —
  and it is not in this front.**
- **Throttle must be measured without spending.** `checkRateLimit` is consuming; polling it for a dashboard would
  eat each client's 60/min northbound budget and could trigger the 429s it displays. PR-CT2 adds a non-consuming
  `peekRateLimit`; the gauge uses only that. Northbound 429s are persisted and trendable; edge/generic-bucket
  429s are **live gauge only** — never a fabricated history.
- **`lastUsedAt` under-reports.** It is written fire-and-forget and a serverless instance can freeze before it
  lands. Label it *last observed use*; do not raise a dormancy incident from it alone.
- **The spot-check is being rebuilt so it answers about the *selected* connection.** The Test Console path
  (`/api/sap/tdd/entities`, `/preview`) gates on session presence only — no role check, no org scoping — and
  resolves its tenant from query params + env vars, so it cannot reach a stored `SapConnection`. Rather than
  labelling that mismatch, the Ops spot-check is built on the broker's own read path
  (`resolveSapConnectionForEnvironment` + `readEntitySet`), org-scoped, role-gated and inside the `sapLive`
  throttle. **So there is no provenance caveat on this screen** — design it as answering about the tenant the
  switcher shows, because it will.

### Empty by construction — build the view, tell the truth

**Write ledger** and **write-credential operations** cannot fill: `setWriteCredential` /
`generateWriteCredential` (`write-credential.ts:29, 41`) have **no callers outside tests**, so every northbound
write is refused before an idempotency key is reserved. **This stays true through this front by decision** —
write-credential issuance is deliberately held back rather than stood up for demo convenience. Treat the empty
state as a feature: *"no write credential has been issued, so every write is refused at the credential gate"* is
a precise, verifiable statement about a working control, and reads as one of the product's better honest-status
demonstrations. Write that copy well; do not apologise for it, and never seed sample rows.

**Broker traffic** will be thin early rather than empty — design for thin. It fills as solutions gain working
credentials and approved grants, which the parallel loop-closing workstream (request dialog + `entitySet`
editing) makes reachable through the product.

---

## CONTROL TOWER — "is the portfolio governed, and is it worth it?"
**Owner:** `platform_admin` (global) · read-only for `partner_lead` / `executive_sponsor` / `project_manager`
(per-org) · **Altitude:** oversight

*CoreEdge integration governance*

| Capability | Real data source | Status |
|-----------|------------------|--------|
| Solution portfolio — status, ownership completeness, classification, data class | `Solution` | **[built data → net-new portfolio view]** |
| Governance audit trail — who changed what | `ConfigAudit` | **[captured, not shown]** |
| Access-grant governance — ledger + SoD + progressive trust | `ApiAccessGrant` | **[built ledger → net-new rollup]** |
| Access-grant **decision queue** | `ApiAccessGrant` where pending | **[net-new; fills via the parallel request-dialog workstream]** |
| Connection & write register — `environment`, `lastValidationStatus`, `writeEnabled`, ownership, sealed-secret presence (boolean) | `SapConnection` | **[built → net-new posture view]** |
| Token & credential register — issued / rotated / revoked; the can't-self-issue-on-unowned-solution SoD | `SolutionClient` | **[built → net-new register]** |
| Digital Access cost & licensing | Digital Access Meter | **[needs-PR-M]** |

*Platform governance (mapped to existing surfaces — compose, do not rebuild)*

| Capability | Real data source | Status |
|-----------|------------------|--------|
| Users — directory, role assignment, workspace entitlement | `api/admin/users` | **[built → compose]** |
| Organizations / tenancy | `api/admin/organizations` | **[built → compose]** |
| Roles & permissions — the role model + matrix | `api/roles`, `role-metadata.ts`, `permission-matrix.ts` | **[built → compose]** |
| Partner settings | `api/partner/settings` | **[built → compose]** |
| Portfolio analytics / KPIs | `api/analytics/{portfolio,benchmarks,cross-phase}`, `api/dashboard/kpi` | **[built → compose]** |
| Platform overview | `api/admin/overview` | **[built → compose]** |

**Boundary:** Control Tower folds in platform / tenancy / people / analytics admin — **not** the
assessment-content admin (`api/admin/{adaptation-patterns, baselines, conversation-templates,
extensibility-patterns, industries, assessments}`), which stays in the Workbench portal.

### Caveats for Control Tower

- **Progressive trust is currently cosmetic at runtime.** `READ_ONLY` and `SANDBOX_ONLY` sit in the `GRANTING`
  set (`grants.ts:34`), and the broker accepts any granting decision for a write
  (`access.ts:126-127`) — so a PROD `CREATE` downgraded to "Read only" still authorises a PROD write.
  **PR-CT-0a fixes this**; render the vocabulary with its real meaning only after that lands.
- **The decision queue is empty *today*, and will fill during this front.** `POST /api/studio/access-grants` is
  called by nothing in the app — the client component only sends the `PATCH` — so no grant can currently be
  raised through the product. The parallel loop-closing workstream adds the request dialog. **Build this screen
  expecting real pending rows**, and read a persistently empty queue as "the dialog has not landed yet", not as
  the designed state.
- **Approved grants are irrevocable through the product today** (settled grants cannot be re-decided; no DELETE
  path; expiry is optional). Whether Control Tower gains a revocation mutation is an open product decision —
  see Build Bible v3 §12.
- **Admin mutation is a new capability, not a re-use.** `canMutateStudio("platform_admin")` is deliberately
  `false` and is pinned by `rbac.test.ts:59-64`. Add the admin decision path under `canMutateControlTower`; do
  not widen `canMutateStudio`.
- **One credential per solution.** Issuance upserts on `solutionId` (`issue.ts:72-94`); re-issuing replaces the
  previous token and its environment. The register must not imply concurrent credentials per solution.
- **`dataClass` is a free string used in no gate.** Verified: it is validated on input, selected, and rendered —
  and read by no authorization path anywhere. Display it as a declaration, never as an enforced control.
- **Two registers surface controls this workspace's own owner cannot invoke.** Credential rotate/revoke
  (`PATCH /api/studio/clients`) and connection write-enablement (`PATCH /api/studio/connections`) are both gated
  to the *consultant* role, so `platform_admin` gets a 403. They are **rendered visible but disabled**, with copy
  naming Developer Studio as where the action lives. Design them as a legible "this exists, elsewhere" state —
  not as a deleted feature, and not as a live button.

---

## The three-altitude boundary

Same objects, three altitudes. **Studio** = *build and configure* one solution (the consultant's bench, now
including adding and managing connections). **Operations Center** = *is it healthy now* (support's run view;
live, fleet, incidents, tenant-selectable). **Control Tower** = *is it governed and worth it* (admin oversight;
portfolio, decisions, people, cost, posture; org-scoped, admin-global). A connection makes it concrete: Studio
adds and configures it · Ops watches its health and environment · Control Tower governs who may write and who
owns it.

---

## Alignment summary — what the design may and may not render

- **Real, wire faithfully:** everything **[built]** / **[captured, not shown]** — the honest-status broker feed,
  connection health (with the **corrected** enum plus the null state), tokens, the grant ledger, `ConfigAudit`,
  and every composed platform-admin surface.
- **Design the view, mark the data real:** **[net-new]** rollups over data we already collect.
- **Design the view, say why it is empty:** **[empty-by-construction]** — the write ledger and write-credential
  operations, which stay empty through this front by decision. Never fill these with sample rows; write the
  explanation as a feature of the screen.
- **Design for thin, not empty:** the grant decision queue and broker traffic, both of which fill once the
  parallel loop-closing workstream lands.
- **Design it, label it forthcoming:** **[needs-PR-M]** Digital Access — show the screen, tag it "arrives with
  the Digital Access Meter", never live.
- **Honest status and honest environment everywhere:** empty ≠ needs-setup ≠ error; PROD flagged, unknown-env
  never guessed; never fabricate a row, count, health, or environment; and where a feed under-reports, **say so
  on the screen** rather than letting the number imply a precision it does not have.
