# CCC BUILD BIBLE v2 — CoreEdge Developer Studio v1 (reality-reconciled, no assumptions)

Supersedes v1. This version fixes the two false premises the CCC/Fable recon caught (keystone not in the
repo; roles Developer/Support don't exist) and resolves the six design decisions and the token/context
details, so nothing is left to guess. Paste this whole document into Claude Code against `aptus` and attach
the seven reference files in §0. Build as reviewable per-workstream PRs, each green. Read-only against the
SAP tenant. **STOP-and-report on any conflict, ambiguity, or red gate — never guess or patch over a gap.**

### What changed from v1 (all verified against `origin/main` #132)
- **§2 rewritten to reality:** the `SapConnection` keystone is **NOT in the repo**. Current SAP access is
  **env-var / per-product / global** (`tdd-connector.ts`; write guard `isSapTddWriteEnabled(prefix="S4_TDD")`,
  env-keyed — NOT a `SapConnection.writeEnabled` field). The keystone is delivered as a **patch** (slice-1,
  verified, additive) and lands as **PR-0**, not "already merged."
- **Roles resolved:** real `UserRole` values are `platform_admin` / `partner_lead` / `consultant` — there is
  no Developer/Support. v1 maps **Developer → `consultant`** (existing builder persona); `platform_admin`
  stays; Support/Ops workspaces are v2. No new roles, no migration.
- **§4 adds a `ConfigAudit` model** (patterned on the existing `PresalesAuditEvent`) — closes the §3.7 gap.
- **Scaffold (screen 7) = static templates in v1** (real codegen is v2).
- **Resolved:** ownership auto-drop rule, Commercial-tab content, Platform-Admin RBAC, tenant/domain data
  sources, and the token/context fixes (`--radius-card-warm`, a named NOT_CHECKED var, the `status-pill`
  adapter, mounting `AffirmLearnProvider`).

═══════════════════════════════════════════════════════════════════════════════
## §0 · FILE MANIFEST & AUTHORITY (attach all five)
═══════════════════════════════════════════════════════════════════════════════

1. **`CoreEdge Developer Studio.dc.html`** — APPROVED interactive design. **AUTHORITY for layout,
   interaction, states, copy, screen structure.** Translate to Next.js + shadcn/ui 1:1; do NOT port its
   `DCLogic`/`sc-*`. Its `role`/`environment`/state props are review devices, not the app architecture.
2. **`CoreEdge-Design-Tokens.md`** — **AUTHORITY for ALL design tokens** and the honest-status→token mapping.
   **The single source of truth for color.** (Correction: the 12px card radius token is
   **`--radius-card-warm`**, not `--radius-card`.)
3. **`CoreEdge-Studio-Design-Book.html`** — rendered visual-language reference.
4. **`CoreEdge-Security-Architecture.html`** — context: the boundary model + security rules the UI reflects.
5. **`sap-connection-keystone.patch`** — the built keystone slice-1 (see §2). Apply this, do not re-invent it.

**TOKEN RULE:** design tokens come ONLY from file 2 + `globals.css`. Real ABeam navy is **`#002B5C`**.

═══════════════════════════════════════════════════════════════════════════════
## §1 · PRODUCT CONTEXT
═══════════════════════════════════════════════════════════════════════════════

Developer Studio is the **Developers** workspace of the internal **CoreEdge Console** (one Next.js app,
three RBAC workspaces: Developer Studio / Operations Center / Control Tower). You build **only Developer
Studio v1**. It is a **configure · govern · test · scaffold** console — **NOT an IDE**: the solution's own
app code lives in the developer's own repo and runs as a separate app consuming CoreEdge's northbound API.

**Honest status (product law):** Activated only where a live probe returned 200; empty (200 + 0 rows) →
"No records", distinct from Needs-setup (401/403) and error (5xx); never fabricate rows/status.

═══════════════════════════════════════════════════════════════════════════════
## §2 · REALITY & PREREQUISITE — PR-0: land the keystone (verify in STEP 0)
═══════════════════════════════════════════════════════════════════════════════

**Current repo reality (do not assume otherwise):** SAP access today is **env-var / per-product / global**
(`src/lib/sap-public/tdd-connector.ts`); the write guard is **`isSapTddWriteEnabled(prefix="S4_TDD")`**
(env-keyed). There is **no `SapConnection` model, no per-org connection rows, no `secretsCiphertext`
column** anywhere in the repo (checked: not on `main`, not on any branch).

**PR-0 — land the keystone (prerequisite for all Studio tables + Connections + the sealed-secrets story).**
The keystone slice-1 is BUILT and delivered as **`sap-connection-keystone.patch`** (7 files, +602, additive;
built on #113; its crypto unit tests passed 6/6 when authored). It contains:
`connection-crypto.ts` (AES-256-GCM `sealSecrets`/`openSecrets`), `connection-resolver.ts`, the
`SapConnection` Prisma model (+ `Organization.sapConnections`), the migration, the crypto test, the runbook,
and `.env.example` keys.
- **Apply it:** rebase the patch onto current `origin/main` (#132) — expect only the `schema.prisma`
  insertion point + the `Organization` relation line to need attention (it is otherwise additive). Run
  `prisma validate` + the crypto test + the full gate suite. Merge as PR-0 before any Studio PR.
- Slice-1 scope = the DATA + CRYPTO + RESOLVER foundation with a **non-breaking env fallback** (existing
  env-based access keeps working). Wiring SAP routes to the resolved connection + the admin surface is part
  of the Studio build (Connections / WS1), not PR-0.
- If the patch cannot be cleanly reconciled, STOP and report — do not stub `SapConnection`.

Expected model shape (from the patch):
```
model SapConnection { id  organizationId  product("s4hana"|"successfactors"|"ariba")
  key  label  baseUrl  authType("basic"|"bearer"|"oauth-client-credentials")  oauthTokenUrl?
  secretsCiphertext(AES-256-GCM; NEVER logged/returned)  writeEnabled  apiPath?  timeoutMs?  isActive
  @@unique([organizationId, product, key]) }   // Organization gains: sapConnections SapConnection[]
```

Toolchain: Node 22.x, pnpm 10.23.0. Gates: `typecheck:strict`, `lint:strict`, `test`, `build`.
Reusable endpoints (confirm + cite): `/api/sap/tdd/hub-content`(+`[id]`,`probe-all`,`seed`), `/entities`,
`/preview`, `/capabilities`, `/operations`, `/write`(+`write-test`).

═══════════════════════════════════════════════════════════════════════════════
## §3 · NON-NEGOTIABLE GUARDRAILS (every workstream)
═══════════════════════════════════════════════════════════════════════════════

1. Tenant context resolved from the authenticated session, **never from request input**; every Studio table
   + query is `organizationId`-scoped.
2. **Secrets never leave the server.** Connections shows metadata only; `secretsCiphertext`/decrypted values
   are unreachable through any Studio route or response (prove with a test).
3. **Read-first.** No new SAP write path in v1; writes stay behind existing `/api/sap/tdd/write` +
   `isSapTddWriteEnabled(prefix)` (env) — and, once PR-0 lands, the per-connection `writeEnabled` flag.
4. Honest status & empties exactly per §6; never fabricate; never Activated without a live 200.
5. Rate-limited, lazy, cached live reads via `isLiveSapTenantRoute`; rows load only on user action (open/run),
   never on list mount; reuse the 30s cache.
6. **Accessibility WCAG 2.1 AA:** the design uses `all:unset` (strips outlines) — you MUST add visible
   `:focus-visible` navy (`#002B5C`) rings, full keyboard operability, 44px targets, labelled controls, AA contrast.
7. **Config-change audit from day one** via the `ConfigAudit` model (§4) — every governance mutation writes
   who/what/when/before→after.
8. RBAC per §7; a role only sees its workspaces.
9. Tokens only from file 2 / `globals.css`.
10. Additive only — do not touch existing API/client/probe rows, the curated dashboard, honest-status logic,
    or current guards.

═══════════════════════════════════════════════════════════════════════════════
## §4 · DATA MODEL (five new tables; on the keystone spine from PR-0)
═══════════════════════════════════════════════════════════════════════════════

Add to `prisma/schema.prisma` (after PR-0). All FK `Organization`; reference `SapConnection`. Migration +
`prisma validate`.

```prisma
model Solution {                       // solution passport
  id String @id @default(cuid())
  organizationId String
  name String  slug String
  classification SolutionKind
  businessProblem String
  status SolutionStatus @default(DRAFT)      // DRAFT | ACTIVE(gated) | RESTRICTED | RETIRED
  dataClass String
  technicalOwnerId String?  businessOwnerId String?  supportOwnerId String?   // all three gate ACTIVE
  repoUrl String?                            // Operating tab; solution app code lives here (own repo)
  packagingNote String?                      // Commercial tab (see §8.3)
  reuseIntent String?                        // Commercial tab
  interfaces Interface[]  grants ApiAccessGrant[]
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  @@index([organizationId])  @@unique([organizationId, slug])
}
model Interface {                      // governed CONFIG referencing a catalogue service — never code
  id String @id @default(cuid())
  solutionId String  organizationId String
  name String  version Int @default(1)
  sapProduct String  externalId String  operation String  entitySet String?
  mode String                                 // READ | WRITE (WRITE ⇒ stronger review)
  requestSchema Json?  responseSchema Json?
  mappingVersion Int?                          // ALWAYS null in v1
  status String @default("DRAFT")             // DRAFT | ACTIVE | DEPRECATED
  solution Solution @relation(fields:[solutionId], references:[id])
  testCases TestCase[]
  @@index([organizationId, externalId])
}
model ApiAccessGrant {                 // request + decision ledger (v1)
  id String @id @default(cuid())
  solutionId String  organizationId String
  externalId String  operation String  environment String   // SANDBOX|DEV|TEST|PROD
  justification String
  decision GrantDecision @default(REQUESTED)  decidedById String?  expiresAt DateTime?
  solution Solution @relation(fields:[solutionId], references:[id])
  createdAt DateTime @default(now())
  @@index([organizationId, solutionId])
}
model TestCase {
  id String @id @default(cuid())
  interfaceId String  organizationId String  name String
  request Json  expectation Json?  lastRunAt DateTime?  lastOutcome String?   // PASS|FAIL|NOT_RUN
  interface Interface @relation(fields:[interfaceId], references:[id])
  @@index([organizationId, interfaceId])
}
model ConfigAudit {                    // §3.7 — pattern after existing PresalesAuditEvent
  id String @id @default(cuid())
  organizationId String  actorId String
  entityType String                            // "Solution" | "Interface" | "ApiAccessGrant" | "TestCase" | "Connection"
  entityId String  action String               // CREATE | UPDATE | PROMOTE | DECISION | TEST_CONNECT
  before Json?  after Json?
  at DateTime @default(now())
  @@index([organizationId, entityType, entityId])
}
enum SolutionKind   { INTERNAL_ACCELERATOR PRESALES_DEMO CLIENT_APP REUSABLE EXPERIMENT }
enum SolutionStatus { DRAFT ACTIVE RESTRICTED RETIRED }
enum GrantDecision  { REQUESTED APPROVED SANDBOX_ONLY READ_ONLY REJECTED EXPIRED }
```
Runtime solution identity (`SolutionClient`) remains **v2** — do not add it now.

═══════════════════════════════════════════════════════════════════════════════
## §5 · API SURFACE (build exactly this)
═══════════════════════════════════════════════════════════════════════════════

**NEW `/api/studio/*`** (tenant-scoped by `organizationId` from auth; error envelope
`{ code, message, correlationId }`; every mutation writes a `ConfigAudit` row):
`solutions` (GET`?mine`/POST/PATCH) · `solutions/[id]` (GET) · `interfaces` (GET/POST/PATCH) ·
`access-grants` (GET/POST/PATCH) · `test-cases` (GET/POST) · `connections` (GET only — **metadata
projection over `SapConnection`; never selects/returns `secretsCiphertext`**).

**REUSED (no new SAP code; already behind `isLiveSapTenantRoute` + honest-status):**
`/api/sap/tdd/hub-content`(+`[id]`,`probe-all`) · `/entities?probe=0|1` · `/preview` · `/capabilities` · `/operations`.

═══════════════════════════════════════════════════════════════════════════════
## §6 · HONEST-STATUS CONTRACT (exact tokens; add the one missing var)
═══════════════════════════════════════════════════════════════════════════════

| Status | Means | Chip bg / fg | Token |
|---|---|---|---|
| ACTIVATED | live 200 | `#DCEBE3`/`#166534` | `--status-signed-*` |
| NEEDS_SETUP | 401/403 | `#FBE9D1`/`#8B5A00` | `--status-awaiting-*` |
| AVAILABLE | event/subscribe-only | `#E0EBF4`/`#1A4D6F` | `--status-sent-*` |
| NOT_PROBEABLE | no OData endpoint | `#EAEAE6`/`#6B6B6B` | `--status-expired-*` |
| REFERENCE | design-time | `#F4F2EB`/`#4A4A4A` | `--status-draft-*` |
| NOT_CHECKED | not yet probed | `#EFEDE6`/`#8A8A8A` | **ADD `--status-nocheck-bg:#EFEDE6; --status-nocheck-fg:#8A8A8A` to globals.css** (it has no named var today) |
| NOT_FOUND | 404 | `#F4DEDB`/`#8E2A26` | `--status-revoked-*` |

**Status-pill adapter:** the existing `components/ui/status-pill` uses presales-lifecycle names
(draft/sent/awaiting/signed/expired/revoked) over these same tokens. Do NOT overload those names — build a
thin `StudioStatusChip` that maps the 7 honest statuses to the tokens above (reusing the CSS vars). Status +
rows come from the live catalogue + probe, never hardcoded (SAP_COM codes / rows in the mock are illustrative).

═══════════════════════════════════════════════════════════════════════════════
## §7 · SHELL + RBAC (build once)
═══════════════════════════════════════════════════════════════════════════════

New route group `(studio)`. **Mount `AffirmLearnProvider` in the `(studio)` layout** — the reused catalogue
components (`SapCapabilityCatalogue`, `ContentTypeTiles`, …) depend on that context; without it they crash.
- Left rail 220px navy `#002B5C`: Console mark; **Workspace switcher** (Developer Studio / Operations Center /
  Control Tower); then Developer Studio sections (Home, Discover, Solutions, Connections, API Access,
  Interfaces, Test Console). Rail is net-new (no existing 220px navy shell).
- Top bar 56px paper: breadcrumb · tenant switcher ("Authorized tenants — resolved from your access, never a
  URL") · environment badge · role badge · avatar.
- **RBAC (resolved):** map to the REAL role model — **Developer = `consultant`**, **Platform Admin =
  `platform_admin`**; Support/Ops = v2. `consultant` sees Developer Studio; `platform_admin` sees **all three
  workspaces** (Studio in read/oversight — this resolves the .dc contradiction where the rail unlocked Studio
  for admin but the content walled it: admin may open Studio read-only). Any other role → the role-gated
  empty state. Wire to the existing `UserRole` union; add no new roles.

═══════════════════════════════════════════════════════════════════════════════
## §8 · SCREENS (match `…dc.html`; DoD per screen)
═══════════════════════════════════════════════════════════════════════════════

**8.1 Home `/studio`** — reads `/api/studio/solutions?mine`, `/hub-content` (status counts),
`/api/studio/connections` (health); cards + "continue where you stopped" (nav context only) + quick actions;
populated + first-run empty. DoD: role-aware; both states; a11y AA.

**8.2 Discover `/studio/discover`** — **reuse** `SapCapabilityCatalogue`+`ContentTypeTiles`+`ReadinessScorecard`
+`CapabilityDetail`. Reads `/hub-content`(+`[id]`), `/entities`, `/preview`. New: business-domain lens
(**source = a static LoB taxonomy over the catalogue's existing domain field**, no new data) + "Add to
interface" (seeds an Interface DRAFT from `externalId`). Detail in a `sheet`; lazy rows on open; all honest
states; **no user-facing state switcher** (probe decides). DoD: real 200 rows; empty/needs/error distinct;
"Add to interface" creates DRAFT; zero preview calls on list render.

**8.3 Solutions + Canvas `/studio/solutions`** — `/api/studio/solutions` CRUD. Cards + Canvas tabs
Business / Functional / Operating / Commercial. **`repoUrl` → Operating** tab. **Commercial tab holds
`classification` (reuse the SolutionKind), `packagingNote`, `reuseIntent`** (so it isn't empty). **Ownership
gate = server rule:** on any create/update, if tech+biz+support owners are not all set, the record cannot be
`ACTIVE` (reject the promote); if an already-ACTIVE solution loses an owner, the same save transitions it to
`RESTRICTED` (server-side, audited) — plus a config-gated nightly sweep for completeness. DoD: ACTIVE blocked
without 3 owners; auto-drop enforced server-side; audit on every change.

**8.4 Connections `/studio/connections`** — `/api/studio/connections` metadata projection over `SapConnection`
(alias·key·product·baseUrl·authType·**Secret="🔒 Sealed"**·health/lastValidatedAt·writeEnabled·isActive);
sealed-secrets banner. "Test connectivity" = read-only `/capabilities` probe through the throttle;
`lastValidatedAt` updates only on a real 200. **Depends on PR-0.** DoD: a test proves no route/response
surfaces a secret; Test updates health honestly.

**8.5 API Access `/studio/access`** — `/api/studio/access-grants` ledger (REQUESTED → APPROVED/SANDBOX_ONLY/
READ_ONLY/REJECTED/EXPIRED); progressive-trust stepper; request dialog; **WRITE higher-risk** (checklist gates
approval; never auto-approve). v1 = ledger; runtime enforcement is the v2 broker. DoD: lifecycle persists +
audited; WRITE gate shown.

**8.6 Interfaces `/studio/interfaces`** — `/api/studio/interfaces` CRUD; list + detail (Source/Runtime/
Contract/Governance cards); versioned; **Mapping card DISABLED** (`mappingVersion=null`, greyed, "v2").
Resolve service via `/hub-content/[id]`+`/entities`. DoD: versioned config persists; mapping disabled.

**8.7 Test Console + Scaffold `/studio/test`** — reuse `/entities` (schema+`$top=1` confirm)+`/preview` (rows);
honest empties; save `TestCase` (`/api/studio/test-cases`); rows only on Run, through the throttle.
**Scaffold = STATIC TEMPLATES in v1:** generate a typed-contract file (OpenAPI + TS types rendered from the
Interface's stored schema), an SDK snippet (string template), and a starter-kit zip (fixed template + the
interface's endpoint/env metadata interpolated). **No live codegen engine in v1** — real generation is v2.
It is downloads you take to your own repo, **not an editor.** DoD: real read renders real rows + empties;
test case saves; the three artifacts download; no in-browser code editing.

═══════════════════════════════════════════════════════════════════════════════
## §9 · OUT OF SCOPE for v1 (do NOT build)
═══════════════════════════════════════════════════════════════════════════════

Runtime solution identity / OAuth broker / scope enforcement (v2); per-call audit store + monitoring
dashboard (v2); mapping engine (v2); live scaffold codegen (v2); mock server, contract/scenario tests,
marketplace, AI assistant, architecture composer, Operations Center, Control Tower build-out, the client
plane (v2/v3). If a requirement seems to need one, STOP and report — do not build a partial version.

═══════════════════════════════════════════════════════════════════════════════
## §10 · BUILD ORDER — reviewable PRs, each green
═══════════════════════════════════════════════════════════════════════════════

0. **PR-0 · Keystone** — apply/rebase `sap-connection-keystone.patch` onto #132, re-verify (crypto test +
   gates), merge. **Model tier: Opus** (security-critical). STOP if it can't reconcile.
1. **Shell + data model + RBAC** — `(studio)` group + `AffirmLearnProvider` mount, 220/56 shell, tenant switcher
   (auth-resolved), the 5 Prisma tables + migration, RBAC (consultant/platform_admin), focus-ring baseline,
   the `--status-nocheck-*` token + `StudioStatusChip`. **Opus.**
2. **Discover** — compose catalogue + domain lens + "Add to interface". **Opus** (honest-status wiring).
3. **Connections** — metadata projection + Test connectivity. **Opus** (secret-safety).
4. **API Access** — ledger + progressive trust + WRITE gate + audit. **Opus** (RBAC/decision judgment).
5. **Solutions + Canvas** — CRUD + ownership gate. **Fable 5 viable** once §8.3 + tests are locked.
6. **Interfaces** — CRUD + detail (mapping disabled). **Fable 5 viable.**
7. **Test Console + Scaffold** — reuse entities/preview + save test case + static-template downloads.
   **Fable 5 viable** (CRUD/templating), but keep the read/honest-status path Opus-reviewed.

Each PR: green `typecheck:strict`·`lint:strict`·unit·`build`; tenant-scoped; rate-limited; honest-status intact;
a11y AA; `ConfigAudit` on mutations. Read-only probe against **X5M/100**.

═══════════════════════════════════════════════════════════════════════════════
## §11 · DEFINITION OF DONE + required tests
═══════════════════════════════════════════════════════════════════════════════

Ship only when ALL hold: 7 screens match `…dc.html` in real shadcn + real tokens; honest-status correct
everywhere (empty ≠ needs-setup ≠ error); tenant always auth-resolved; ownership/WRITE/mapping-disabled gates
enforced; every live read through `isLiveSapTenantRoute`; a11y (focus/keyboard/AA) verified; `ConfigAudit`
on every governance mutation; gate suite green on `main` after the last PR.

**Required tests:** non-curated activated service renders rows; empty → "No records"; needs-setup → 401 +
SAP_COM; **a Studio route never leaks a secret**; **request-supplied tenant is rejected**; ownership gate
blocks ACTIVE + auto-drops to RESTRICTED; live-SAP throttle covers studio reads; **zero preview calls on list
mount**; WRITE requires the checklist; mapping stays disabled (`mappingVersion` null); the keystone crypto
round-trip/tamper/wrong-key tests pass post-rebase.

═══════════════════════════════════════════════════════════════════════════════
## §12 · REPORTING
═══════════════════════════════════════════════════════════════════════════════

Post the **STEP 0 RECON** first: PR-0 patch-reconcile result, role mapping confirmation, cited reusable
endpoints/components, and any drift. Then build PR-by-PR with the DoD checklist. **If anything is ambiguous,
missing, or conflicts — STOP and ask.** Success = nothing here had to be guessed and nothing has to be undone.
