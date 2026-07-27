# CCC Build Bible — CoreEdge Console: Operations Center & Control Tower (+ PR-Rbac)

**What this is.** A self-contained instruction for an Opus Claude Code session on `aptus` (GitHub) to build the two
remaining CoreEdge Console workspaces — **Operations Center** (the *run* view) and **Control Tower** (the *govern*
view) — plus the small **PR-Rbac** role prerequisite. Grounded in `main` #167 (`70a6cec`).

**Execute this TOGETHER with the Claude Design output.** Attach the Claude Design `.dc.html` for Operations
Center + Control Tower — it is the **visual contract** (layout, interaction, copy, states). This bible is the
*content + engineering* contract (what data is real, how it's gated, what to build). Neither is sufficient alone:
the design says how it looks; this bible + the codebase say what is true behind it.

---

## §0 · FILE MANIFEST & AUTHORITY (attach all)

| File | Role | Authority |
|------|------|-----------|
| **Claude Design `…Ops-ControlTower.dc.html`** | Visual contract — every screen, layout, interaction, state | Top authority on **look/layout/interaction/copy** |
| `CoreEdge-Ops-ControlTower-Inventory.md` (v2) | Content spec — capability → real data source → build status | Top authority on **what data is real & what may be shown** |
| `CoreEdge-Studio-Design-Book.html` + `CoreEdge-Design-Tokens.md` | Design system + tokens | Tokens/components — use verbatim |
| `CoreEdge Developer Studio.dc.html` | The built Studio | Family precedent (same shell/chips) |
| This bible | Engineering contract, guardrails, build order | Top authority on **security, honest-status, data, sequencing** |

**Conflict rule:** visual/layout question → the Claude Design `.dc.html`. Data/capability/security/honest-status
question → this bible + the Inventory + the codebase. **Honest-status and security always beat the mock** — if the
design shows a state the data can't back, build the honest state and STOP-report the discrepancy.

---

## §1 · PRODUCT CONTEXT & MAIN-OBJECTIVE ALIGNMENT

CoreEdge is a **governed SAP operations middleware** — ABeam's own asset — presented as **one console with three
RBAC workspaces at three altitudes:** Developer Studio (*build & configure* — shipped), **Operations Center**
(*is it healthy now* — this build), **Control Tower** (*is it governed & worth it* — this build).

**These two workspaces must stay true to the objective — non-negotiable:**
- They are **read/govern layers over data already captured.** They introduce **no new SAP access path.** The
  northbound broker (`/api/northbound/*`) and the existing Studio probes remain the *only* SAP touchpoints. Ops
  Center and Control Tower read `NorthboundAuditEvent`, `NorthboundIdempotencyKey`, `ConfigAudit`, `SapConnection`
  health, `SolutionClient`, and existing admin surfaces — they do not open sockets to SAP themselves (except the
  one reused read-only spot-check, §6, through the existing throttle).
- **Honest status is the product's trust differentiator** — extend it to honest *environment* (PROD flagged,
  unknown never guessed) and honest *counts* (never fabricate a metric).
- **Structural tenant isolation** and **secret-safety** are load-bearing, not cosmetic.

---

## §2 · REALITY & STEP-0 RECON (report before coding; cite file:line; STOP on drift)

Confirm these reusable primitives exist on `main` (they did at #167):
- **Shell/RBAC:** `src/app/(studio)/layout.tsx` (auth + role gate + tenant resolve), `src/components/studio/StudioShell.tsx` (rail+topbar+main), `StudioRail.tsx` (`WORKSPACES` switcher + `sections` prop, currently hardcoded `STUDIO_SECTIONS`), `StudioTopBar.tsx` (tenant switcher + `EnvChip` + origin `Dot` + role badge), `src/lib/studio/rbac.ts` (`WORKSPACES`, `accessibleWorkspaces`, `canAccessStudio`, `canMutateStudio`, `lacksStudioTenantScope`, `isAdminRole`), `RoleGatedEmptyState.tsx`.
- **Data (read-only feeds):** `NorthboundAuditEvent` (`operation`, `status`, `rowCount`, `solutionId`, `interfaceId`, `clientTokenId`, `correlationId`, `at`), `NorthboundIdempotencyKey` (`status`, `requestHash`, `responseBody`, `expiresAt`), `ConfigAudit` (`entityType`, `entityId`, `action`, `before/after`), `SapConnection` (**`environment`**, **`lastValidationStatus`**, `lastValidatedAt`, `writeEnabled`, `isActive`), `SolutionClient`, `Solution`, `Interface`, `ApiAccessGrant`.
- **Libs:** `lib/northbound/audit.ts` (append-only writer — READ its rows, never add a mutation), `lib/studio/connection-health.ts` (`probeConnection`), `lib/studio/tenants.ts` (`resolveStudioTenants`/`pickActiveTenant`/`isSharedEnvironmentTenant`), `lib/security/rate-limit.ts` (`RATE_LIMITS.sapLive`/`.northbound`, `isLiveSapTenantRoute`), `middleware.ts`.
- **Compose-only (Control Tower platform governance):** `api/admin/{users,organizations,overview}`, `api/roles`, `api/partner/settings`, `api/analytics/{portfolio,benchmarks,cross-phase}`, `api/dashboard/kpi`.
- **Reused read path (spot-check):** the Test Console internals (`/entities` + `/preview`).

If any is missing or moved — **STOP and report.** Do not invent a substitute.

---

## §3 · NON-NEGOTIABLE GUARDRAILS

1. **Honest status + honest environment.** Every data view designs all real states: data / empty / needs-setup (401-403) / error (5xx) + loading skeleton. Empty ≠ needs-setup ≠ error. Carry the `EnvChip` on tenant-pointed views; **PROD = warning; unknown env = no chip (never guessed).** Never fabricate a row, count, health, or environment.
2. **The audit is READ-only here.** Ops Center and Control Tower **read** `NorthboundAuditEvent` / `ConfigAudit`; they add **no** update/delete/upsert path (a test already enforces append-only — keep it green).
3. **Secret-safety.** No endpoint returns `secretsCiphertext`, a raw/hashed token, a write credential, or a SAP host/URL. Registers show metadata + status only.
4. **Structural tenant-scope.** Every query org-scoped via the existing pattern; `platform_admin` keeps its global exemption (`lacksStudioTenantScope`). Tenant is auth-resolved, never from URL/cookie-as-auth. Prove org-A can't read org-B.
5. **Read personas cannot mutate.** `support` and the read-only viewers get no governance mutation. The only mutations in scope are Control Tower **grant decisions** by `platform_admin` (with SoD + `ConfigAudit`).
6. **Reuse the throttle.** Any live-SAP read (the spot-check) goes through `isLiveSapTenantRoute`/`RATE_LIMITS`. No new SAP path.
7. **Accessibility AA.** Visible `:focus-visible` navy rings + keyboard nav on every interactive element.
8. **No new SAP access path** (see §1). If a screen seems to need one — STOP-report.

---

## §4 · PR-Rbac — the Support role + workspace RBAC generalization (prerequisite)

The `support` persona and read-only viewers don't exist in RBAC yet. Add them:
- `src/types/assessment.ts` — add `| "support"` to `UserRole`; add a `ROLE_LABELS` entry.
- `src/lib/auth/role-metadata.ts` — `support` entry (label "Support", description "CoreEdge operations — monitors live integrations").
- `src/lib/auth/permission-matrix.ts` — `support: new Set([...])` (read-oriented ops; **no** governance mutations).
- `src/lib/auth/dev-login.ts` — a `support@abeam.test` account (walkable).
- `src/lib/studio/rbac.ts` — generalize to three workspaces: add `canAccessOperations` (= `support` || admin), `canAccessControlTower` (= admin || `partner_lead`/`executive_sponsor`/`project_manager` **read-only**), and `canMutateControlTower` (= admin only). Extend `accessibleWorkspaces` to the Inventory matrix. Keep `canAccessStudio`/`canMutateStudio` as-is.

**Opus.** Tests: `support` sees only Operations Center; viewers can open Control Tower but not mutate; admin sees all three; everyone else stays locked; a tampered role can't widen access.

---

## §5 · SHARED SHELL & RAIL GENERALIZATION

The shell only knows Studio's sections today. Generalize, reuse-first:
- **Rail:** render the **active workspace's** sections, not always `STUDIO_SECTIONS`. Add `OPERATIONS_SECTIONS` and `CONTROL_TOWER_SECTIONS` (keys/labels/hrefs/`available` flags, same shape as `STUDIO_SECTIONS`). The rail's workspace switcher already renders `WORKSPACES` with lock states — keep it.
- **`rbac.ts` `WORKSPACES`:** set `operations-center.href = "/operations"`, `control-tower.href = "/control-tower"`, and flip each `availableInV1 = true` **only as its screens ship** (a rail entry that 404s is worse than one that says "not yet" — mirror the existing `available` discipline).
- **Route groups:** add `src/app/(operations)/operations/*` and `src/app/(control-tower)/control-tower/*`, each with a thin layout mirroring `(studio)/layout.tsx` — same auth redirect (`/presales/login`), same `AffirmLearnProvider` mount if it reuses catalogue components, same tenant resolve — but gated by `canAccessOperations` / `canAccessControlTower`, passing that workspace's section list into the shared shell. Non-entitled roles → `RoleGatedEmptyState`.
- **Shell:** parameterize `StudioShell` (or a shared `ConsoleShell`) to take the active `sections`; keep the top bar identical (tenant switcher + `EnvChip` + `Dot` + role badge) across all three workspaces.

**Opus** (gating correctness).

---

## §6 · OPERATIONS CENTER (owner `support`; per-org; tenant-selectable live views)

Build the screens the Claude Design `.dc.html` specifies; back each with a **new read/aggregate endpoint** (all
`GET`, org-scoped, secret-safe) over the captured feeds:
- **Home / health overview** — fleet status + attention feed (compose the below).
- **Broker traffic** — `GET /api/ops/broker-traffic`: aggregate `NorthboundAuditEvent` (honest status breakdown 200/empty/401/403/**429**/5xx, per-solution & per-token volume; filters: solution, environment, window). **429 rows are real** — the northbound route rate-limits *in-route* (post-auth, keyed `northbound:<clientId>`) and records the 429 audit row before returning. **Latency is NOT recorded today** — `NorthboundAuditEvent` has no duration field, so the design's "Median / 841 ms" cannot be backed as-is. To make it real, add `durationMs Int?` to the model + `NorthboundAuditInput` and stamp it at each `recordNorthboundCall` site in the northbound route (additive migration; PR-CT2). If you do not add it, **drop latency from the screen — never fabricate it.**
- **Write ledger** — `GET /api/ops/write-ledger`: blend two sources honestly — **in-flight / completed / replayed / conflicted** from `NorthboundIdempotencyKey`; **blocked** from `NorthboundAuditEvent` (WRITE + 4xx), because a write rejected by the credential/grant gate returns 403 *before* the idempotency key is reserved, so it never lands in that table. No request bodies with secrets.
- **Connections health** — `GET /api/ops/connections-health`: `SapConnection` rollup using the **real `lastValidationStatus`** vocabulary (OK / UNAUTHORIZED / NOT_FOUND / TIMEOUT / ERROR / NEVER_TESTED), `lastValidatedAt`, **`environment`** (PROD flagged), `writeEnabled`. Metadata only.
- **Catalogue freshness** — `GET /api/ops/freshness`: WS3 freshness rollup.
- **Throttle status** — `GET /api/ops/throttle`: `checkRateLimit` returns `{allowed, remaining}`, so show a **live gauge** (remaining/limit) for both buckets (`sapLive` 20/min, `northbound` 60/min). Honest provenance: **northbound 429s are persisted** (audited in-route) and can trend over time; the **edge `sapLive` 429s** (spot-check / connection-test, blocked in `middleware.ts` before any audit) are **not persisted** — show those as a live gauge only, never a fabricated history.
- **Tokens & credentials monitor** — `GET /api/ops/tokens`: `SolutionClient` + write-credential lifecycle (active / expiring / rotation-due / revoked). **Never** the token/hash/secret.
- **Incidents / attention** — `GET /api/ops/incidents`: derived (failing interfaces, needs-setup services, repeated 5xx, connection down, **PROD write attempts**).
- **Live spot-check** — reuse the Test Console read path (`/entities` + `/preview`) through the existing throttle. Read-only.
- **Digital Access consumption** — render the screen **tagged "arrives with the Digital Access Meter."** Do NOT compute live (Meter is a separate spec, §8).

**Model tier:** endpoints **Opus** (honest-status + secret-safety); screens **Fable viable** once endpoint contracts + tests are locked.

---

## §7 · CONTROL TOWER (owner `platform_admin` global; read-only viewers per matrix)

**Integration governance (new views over real data):**
- **Solution portfolio** — `GET /api/control-tower/portfolio`: `Solution` status/ownership/classification (org-scoped; admin global).
- **Governance audit trail** — `GET /api/control-tower/audit`: `ConfigAudit` (read; filters by entity/actor/action). Append-only.
- **Access-grant governance** — `GET /api/control-tower/grants` + admin **decision** action: `ApiAccessGrant` ledger + SoD (requester≠approver) + progressive trust. The decision is the one allowed mutation — writes `ConfigAudit`; **Opus**.
- **Connection & write register** — `GET /api/control-tower/connections`: `SapConnection` `environment` + `lastValidationStatus` + `writeEnabled` + ownership + sealed-secret presence (boolean, never the ciphertext).
- **Token & credential register** — `GET /api/control-tower/tokens`: `SolutionClient` issued/rotated/revoked; the can't-self-issue-on-unowned-solution SoD is visible.
- **Digital Access cost & licensing** — render **tagged forthcoming** (Meter, §8).

**Platform governance (COMPOSE existing — do NOT rebuild the data):** Users (`api/admin/users`), Organizations (`api/admin/organizations`), Roles & permissions (`api/roles` + the 11-role matrix), Partner settings (`api/partner/settings`), Portfolio analytics/KPIs (`api/analytics/*`, `api/dashboard/kpi`), Platform overview (`api/admin/overview`). Control Tower provides the **views/entry points**; the data stays in those endpoints. **Exclude** the assessment-content admin (adaptation-patterns/baselines/conversation-templates/extensibility-patterns/industries/assessments) — it stays in the Workbench portal.

**Model tier:** grant decisioning + audit read **Opus**; portfolio/registers + the composed platform-governance views **Fable viable** once contracts + tests are locked.

---

## §8 · DIGITAL ACCESS = FORTHCOMING (out of scope here)

The Digital Access Meter is a **separate spec** (`CCC-Digital-Access-Meter-Build-Spec.md`). In these two
workspaces, the DA screens are **designed-but-forthcoming placeholders**, clearly labelled. **Do NOT** compute or
display live document counts/cost here. STOP-report if a requirement tries to make them live.

---

## §9 · BUILD ORDER — reviewable PRs, each green (model tiering)

- **PR-CT0 · PR-Rbac** — §4 support role + workspace RBAC generalization. **Opus.**
- **PR-CT1 · Shell/rail generalization + route groups** — §5; both workspaces open (gated) with their rail sections and honest empty screens; flip `availableInV1` as screens land. **Opus.**
- **PR-CT2 · Operations Center endpoints** — §6 read/aggregate endpoints; honest-status + secret-safety; **includes the additive `durationMs` field on `NorthboundAuditEvent` + audit-writer param + call-site timing** (so broker-traffic latency is real, not fabricated). **Opus.**
- **PR-CT3 · Operations Center screens** — compose PR-CT2 into the `.dc.html` design; live spot-check; DA screen forthcoming. **Fable viable** (read path Opus-reviewed).
- **PR-CT4 · Control Tower integration governance** — §7 portfolio, audit trail, grant governance (+decision/SoD), connection & token registers. **Opus.**
- **PR-CT5 · Control Tower platform governance** — §7 composed users/orgs/roles/analytics/overview views; DA cost forthcoming. **Fable viable.**

Each PR: green `typecheck:strict · lint:strict · unit · build`; org-scoped; honest-status + honest-environment; secret-safe; a11y AA; `ConfigAudit` on the one governance mutation; read-only probe against **X5M/100** only.

---

## §10 · DEFINITION OF DONE + REQUIRED TESTS

Ship only when ALL hold; add every test:
1. **RBAC:** `support` → Operations Center only; viewers → Control Tower read-only (no mutate); admin → all three; others locked; tampered role can't widen. *(test)*
2. **Honest status:** each Ops/CT data view renders data / empty / needs-setup / error distinctly from real inputs. *(test)*
3. **Honest environment:** `EnvChip` shows PROD as warning, renders nothing when unknown. *(test)*
4. **Secret-safety:** no endpoint returns `secretsCiphertext`, token, hash, write credential, or SAP host. *(test)*
5. **Append-only:** no new update/delete path on `NorthboundAuditEvent`/`ConfigAudit`; the existing immutability test stays green. *(test)*
6. **Tenant isolation:** org-A cannot read org-B's traffic/portfolio/audit; admin is global; request-supplied tenant ignored. *(test)*
7. **Grant decision:** requester≠approver enforced; a decision writes `ConfigAudit`. *(test)*
8. **Throttle:** the spot-check goes through the live-SAP bucket. *(test)*
9. **DA forthcoming:** DA screens never render a live count. *(test)*
10. **Visual contract:** every screen/state matches the attached `.dc.html` in real shadcn + real tokens.

---

## §11 · REPORTING & OPERATING RULES

- **Post STEP-0 RECON first** (§2) — reusable primitives cited, any drift flagged. No code until clean or blocker reported.
- **Execute WITH the Claude Design `.dc.html` attached** — it is the visual contract; translate to shadcn + real tokens 1:1; production state comes from the real endpoints/probe (the design's outcome switcher is a preview device only).
- **Work PR-by-PR**, each green with its §10 tests; flip each workspace/section live only when its screens ship.
- **STOP-and-report, never guess:** on missing/attached-but-inconsistent design, a screen implying a new SAP path, an ungateable mutation, a secret-exposure risk, a throttle-counter gap, or any conflict with the codebase/Inventory.
- Success = both workspaces match the design, every number resolves to a real feed, tenant-isolation + secret-safety are **structural**, honest-status + honest-environment hold everywhere, and nothing had to be undone.
