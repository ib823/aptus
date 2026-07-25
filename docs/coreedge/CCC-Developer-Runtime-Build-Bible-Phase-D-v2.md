# CCC BUILD BIBLE — Phase D v2 · Developer Runtime & Enablement (self-sustaining)

Supersedes Phase D v1. Same north star; five refinements folded in so nothing is left to assumption, plus an
explicit strategic-decision gate. **What changed in v2:** (1) the prerequisite is stated correctly — Phase D
needs enough of v2 Studio that a developer can *register and issue*, not just PR-1; (2) **AAD sealing is
backward-compatible** (optional param / reseal — never breaks PR-0-sealed secrets); (3) the **OpenAPI
schema-capture step is explicit** (no empty contracts); (4) a **strict-typecheck (`noUncheckedIndexedAccess`)
guardrail** is called out; (5) the keystone-patch PR-0 corrections are **already applied** in the delivered
patch (migration re-dated `20260725`, 2 typecheck fixes, runbook tidied, applies clean to `#132`, verified
green). Plus an up-front **strategic-decision gate** (§0.5).

**What this is.** A self-contained instruction for an Opus Claude Code session with GitHub + `aptus` access. It
**extends** the validated CoreEdge Developer Studio build (v2 Bible + keystone) with the one thing v1/v2 do not
deliver: **the developer's runtime loop.** North star —

> *An ABeam developer, working entirely on their own desktop (VSCode/Eclipse, their own database, their own
> open-source or ABAP stack), can use Developer Studio to discover, govern, and validate a SAP integration, then
> **download a contract + a runnable starter kit, run their app against a local mock offline, and against a live
> CoreEdge northbound endpoint with a per-solution token to pull real SAP data** — with honest status, tenant
> isolation, and audit intact.*

Build as **reviewable per-workstream PRs on GitHub, each green** (`typecheck:strict`·`lint:strict`·`test`·`build`).
Read-only against the SAP tenant except the one explicitly-gated write path. **STOP-and-report on any conflict,
ambiguity, or red gate — never guess or stub over a gap.** Success = the north-star sentence is demonstrably true.

> **Scope honesty.** v2 §9 deferred the "northbound broker." Phase D **consciously promotes a *minimal, bounded*
> slice forward** — read-first, per-solution token, one gated write, a local mock — the smallest addition that
> makes the developer use case real. It does **not** build the full v2 broker (dynamic scope engine, marketplace,
> mapping). Keep to §9 or STOP.

═══════════════════════════════════════════════════════════════════════════════
## §0 · FILE MANIFEST & AUTHORITY (attach all)
═══════════════════════════════════════════════════════════════════════════════

1. **`CCC-Developer-Studio-v1-Build-Bible-v2.md`** — AUTHORITY for the Studio (design-time console), the data
   model spine (Solution/Interface/ApiAccessGrant/TestCase/ConfigAudit), honest-status, RBAC, tokens. Phase D
   **depends on it**; reuse its models/screens. Do not re-implement.
2. **`sap-connection-keystone.patch`** — the built, **corrected & verified-green** keystone (per-org
   `SapConnection`, `connection-crypto.ts` AES-256-GCM, `connection-resolver.ts`). Apply as PR-0 (§2). **All
   prior corrections are already in this file** — do not re-apply them.
3. **`CoreEdge-Design-Tokens.md`** — AUTHORITY for all tokens/color (verbatim-verified vs `globals.css`).
4. **`CoreEdge Developer Studio.dc.html`** — AUTHORITY for Studio screen layout/interaction/copy (esp. Test
   Console + Scaffold, which Phase D makes real).
5. **`CoreEdge-Security-Architecture.html`** — context: trust boundaries the runtime must honour.
6. **This document** — AUTHORITY for the runtime loop, local enablement, ABAP/BYO scope, gold-standard hardening.

**TOKEN RULE:** tokens only from file 3 + `globals.css`. Real ABeam navy `#002B5C`.
**AUTHORITY ORDER on conflict:** this doc (runtime) > v2 Bible (design-time) > keystone runbook > memory. STOP on
any conflict you cannot resolve.

═══════════════════════════════════════════════════════════════════════════════
## §0.5 · STRATEGIC-DECISION GATE (confirm with the product owner before PR-D2)
═══════════════════════════════════════════════════════════════════════════════

Phase D **crosses a product fork**: it turns CoreEdge from a *design-time discovery/governance asset* into a
*runtime integration platform* — an externally-callable, always-on service that brokers **live client SAP data**
to outside apps via per-solution tokens. That is the "client-facing platform" identity **and** the "build the
broker (vs. adopt SAP Integration Suite)" position. PR-0/PR-D1 (keystone, tenant-scope foundation, data model)
are safe under either fork. **Before building the broker itself (PR-D2+), confirm the product owner has
consciously committed to the runtime-platform direction** (it is a step-up in hosting, exposed security surface,
ops, and commercial posture). If that commitment is not confirmed, **STOP after PR-D1 and report** — do not
stand up an externally-callable SAP endpoint by engineering momentum.

═══════════════════════════════════════════════════════════════════════════════
## §1 · THE DEVELOPER USE CASE (north star — every PR serves this)
═══════════════════════════════════════════════════════════════════════════════

**Persona.** An ABeam solution developer, coding in **their own IDE** (VSCode/Eclipse), **their own DB**, **their
own stack** (any language; sometimes **ABAP** on-stack). CoreEdge is **not** their IDE — it governs the
*integration edge* and hands them a contract + a runnable kit for their own machine.

**The loop that MUST close (v1/v2 leave it open):**
1. **Discover** — in Studio, see which client SAP OData services are truly Activated (live 200).
2. **Govern** — register a Solution + Interface(s); request/approve API Access grants (progressive trust).
3. **Prove** — Test Console runs the read live against the client's SAP; save a test case + **capture its
   response schema onto the Interface** (needed for §6.1).
4. **Take it to my desktop** — download a **real OpenAPI contract + typed client + runnable starter kit + a local
   mock seeded from my Test Console runs.**
5. **Build & test locally** — codegen a client in my language from the OpenAPI, run my app against the **local
   mock offline** (CI-friendly), iterate.
6. **Run for real** — point my app at the **live CoreEdge northbound endpoint** with a **per-solution token**;
   pull real SAP data (and, where granted + gated, write) — scoped to my org + approved interfaces only.

**"Closed" =** steps 4–6 work end-to-end for a real activated service, with honest status, tenant isolation,
per-call audit, and secret-safety intact — proved by §11.

**In the persona but OUT of CoreEdge's job (state to the user; do not build):** their app code, DB, business
logic, and **ABAP on-stack development** (stays in ADT/Eclipse). CoreEdge helps the ABAP developer only on the
*consumption* side — §7.

═══════════════════════════════════════════════════════════════════════════════
## §2 · REALITY, PREREQUISITES & STEP-0 RECON (verify before code)
═══════════════════════════════════════════════════════════════════════════════

**Verified repo reality (re-confirm + cite file:line in STEP-0):**
- Reused SAP routes authenticate via **`getCurrentUser()` (browser session)** — `src/app/api/sap/tdd/{hub-content,
  preview,entities}/route.ts`. **An external developer app cannot call these** (no cookie) ⇒ the broker (§5) needs
  its **own token auth**. Confirm.
- **No generic m2m/bearer auth exists.** Model the token on: `src/lib/auth/session.ts`
  (`createHash("sha256")`, `randomBytes`) and `src/lib/auth/share-link.ts` (`randomBytes(32)` base64url +
  `timingSafeEqual`); seal extras with `connection-crypto.ts` (AES-256-GCM). Cite them.
- Rate-limit buckets (`src/lib/security/rate-limit.ts`): `RATE_LIMITS.sapLive` 20/min, `apiRead` 300/min,
  `apiMutation` 120/min; middleware rate-limits all `/api/*`. `sapLive` is explicitly the "amplifies onto the
  tenant" bucket — the broker must use a **tight per-token bucket** in that spirit (§5.4). Confirm `src/middleware.ts`.
- Keystone resolver (`connection-resolver.ts`) exports `resolveSapConnections` / `resolveSapConnection` /
  `buildAuthHeaderFromConnection` / `toSapTenant` — the broker calls these. `fetchOAuthTokenFromConnection` has
  **no caching/timeout today** (T3). Confirm.
- **Strict-typecheck reality:** `tsc --strict` here has `noUncheckedIndexedAccess` on — array/index access is
  `T | undefined`. The keystone shipped 2 errors of exactly this class. **All new broker/repo/index code must
  handle `?? ` / undefined** or CI red-gates. Treat as a standing guardrail.

**Prerequisites that MUST be merged to `main` before Phase D (STOP if absent):**
- **PR-0 · Keystone**, from **`sap-connection-keystone.patch`** — apply as-is. **The two v1 "corrections" are
  already applied in this file:** the migration is named `20260725120000_sap_connection_keystone` (sorts after
  `20260724000000_…`), the two typecheck fixes are in, the runbook timestamp is tidied; the patch **applies clean
  to current `main` (#132)** and `typecheck:strict` + the crypto unit test are **verified green**. Re-run
  `prisma validate`/`generate` + crypto test + gates to re-confirm, then merge. No corrections left to make.
- **Enough of v2 Studio that a developer can register and issue** — not just PR-1. Minimum to *compile* the
  broker: v2 **PR-1** (the `(studio)` shell, RBAC Developer=`consultant`/admin=`platform_admin`, and the 5 tables
  Solution/Interface/ApiAccessGrant/TestCase/ConfigAudit). Minimum for the *demoable north-star loop*: also v2
  **PR-3 (Solutions)**, **PR-5 (Interfaces)**, **PR-7 (API Access)** — so a developer can create a Solution +
  Interface + grant and Phase D can attach `SolutionClient`/token to them. If the tables exist but the screens
  do not, you may build the broker but **cannot demonstrate the loop** — say so in the PR.
- If a prerequisite is absent, **STOP and report** — do not stub it.

**STEP-0 recon report (post before any Phase-D code):** PR-0 + v2 Studio merge status (which PRs); the reality
bullets re-confirmed with file:line; the broker reuse points cited (resolver, token model, rate-limit bucket,
honest-status helper, the Interface schema fields); the strategic gate (§0.5) status; and any drift.

**Toolchain/gates:** Node 22.x, pnpm 10.23.0; `typecheck:strict`·`lint:strict`·`test`·`build`, green on CI.
Read-only SAP probe against **X5M/100** only.

═══════════════════════════════════════════════════════════════════════════════
## §3 · NON-NEGOTIABLE GUARDRAILS (carry v2's; ADD the gold-standard bar)
═══════════════════════════════════════════════════════════════════════════════

Carry ALL v2 Bible §3 guardrails. Phase D adds/hardens these — each is a **required §11 test**:

1. **Structural tenant isolation (not by-convention).** This repo has shipped cross-tenant IDOR **repeatedly**
   (fix commits **#134** then **#139** — which caught *3 more routes #134 missed*; see
   `tests/unit/api/cross-tenant-idor-guard-coverage.test.ts`). For EVERY new Studio + northbound Prisma access,
   tenant scope must be **structurally enforced**: a single tenant-scoped data-access helper (a thin repository or
   a Prisma client-extension that injects `organizationId` and refuses a query lacking it); route ALL Studio/broker
   DB access through it. A forgotten filter must be **impossible**, not merely tested. Add a guard-coverage test
   (model on the existing `*guard-coverage*` files) that fails if any `/api/studio|northbound` route reaches Prisma
   outside the helper. **This is the highest-priority item; do it first (PR-D1).**
2. **Broker auth is per-solution, token-based, org-scoped.** The northbound API authenticates a **`SolutionClient`
   token** (Bearer) → resolves `Solution` → `organizationId` → approved `ApiAccessGrant`s → serves **only** that
   solution's interfaces and grants APPROVED/READ_ONLY for the requested environment. Never a session. Never
   cross-org. Never an ungranted interface.
3. **Secrets never leave the server; bind ciphertext with AAD — backward-compatibly.** Reuse `connection-crypto`.
   **Extend seal/open to accept an OPTIONAL `aad` parameter** binding ciphertext to its `(organizationId,
   <entity>, key)`. It MUST remain **backward-compatible**: existing PR-0-sealed `SapConnection` secrets were
   sealed WITHOUT aad and MUST still open (aad defaults to none) — OR provide a one-time `migrate:reseal` that
   re-seals them with aad. **Never break already-sealed secrets.** New secrets (SolutionClient) seal WITH aad.
   `SolutionClient` tokens are stored **SHA-256-hashed** (model on `session.ts`), never plaintext; raw token shown
   **once** at issue.
4. **Segregation of duties on grants.** For `ApiAccessGrant`, **requester ≠ approver** enforced server-side;
   self-approval rejected. WRITE/PROD grants also require the write checklist. (Closes a v2 gap.)
5. **Honest status end-to-end.** Broker responses carry Studio's honest-status semantics: live 200 = data (or "No
   records" on 200+0), 401/403 = needs-setup, 5xx = error — **never fabricated**. The local mock reproduces ALL
   states (§6.3).
6. **Per-call northbound audit (immutable).** Every broker call writes a `NorthboundAuditEvent`
   (who-solution/what-interface/when/status/rowCount/correlationId). `ConfigAudit` + `NorthboundAuditEvent` are
   **append-only** — no update/delete paths; enforce in the repository layer.
7. **Upstream SAP hardening.** Give the resolver's OAuth path **token caching** (to ~expiry, per connection) + a
   **request timeout** (`AbortController`, from `timeoutMs` or a default) + a single bounded retry. Apply to
   `connection-resolver.ts` `fetchOAuthTokenFromConnection` and any broker fetch. (Closes a v2 gap.)
8. **Error envelope never leaks upstream SAP detail.** Broker errors use `{ code, message, correlationId }` and
   inherit the SAP-error sanitisation in the reused routes (no raw SAP bodies/URLs).
9. **Every mutation is zod-validated** at the route boundary. No raw `request.json()` into Prisma.
10. **Strict-typecheck clean.** All new code passes `tsc --strict` with `noUncheckedIndexedAccess` — guard every
    array/index/`.find()` access (`?? `, length checks). No `!` non-null assertions to dodge it.
11. **Additive only.** Do not alter existing SAP/probe rows, the curated dashboard, honest-status logic, or the
    keystone env fallback. Existing env-based SAP access keeps working unchanged.

═══════════════════════════════════════════════════════════════════════════════
## §4 · DATA MODEL ADDITIONS (three tables; on the Studio spine)
═══════════════════════════════════════════════════════════════════════════════

Add to `prisma/schema.prisma` (after PR-0 + v2 PR-1). All FK `Organization`; migration named with a current-date
timestamp (sorts after the latest on `main`) + `prisma validate`. Reference v2 `Solution`/`Interface`.

```prisma
model SolutionClient {                 // per-solution RUNTIME identity the broker authenticates
  id String @id @default(cuid())
  organizationId String
  solutionId String @unique            // one runtime identity per solution in v1
  label String
  tokenHash String @unique             // SHA-256 of issued token (raw shown once); model on session.ts
  environment String                   // SANDBOX | DEV | TEST | PROD
  secretsCiphertext String? @db.Text   // optional sealed extras (AES-256-GCM + AAD via connection-crypto)
  isActive Boolean @default(true)
  lastUsedAt DateTime?  expiresAt DateTime?  revokedAt DateTime?  createdById String
  createdAt DateTime @default(now())
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId])  @@index([tokenHash])
}
model NorthboundAuditEvent {            // per-call broker audit — APPEND-ONLY
  id String @id @default(cuid())
  organizationId String  solutionId String  interfaceId String?
  operation String                     // READ | WRITE
  externalId String  environment String
  status Int  rowCount Int?  correlationId String  clientTokenId String
  at DateTime @default(now())
  @@index([organizationId, solutionId, at])
}
model MockFixture {                     // honest-status responses captured from Test Console runs
  id String @id @default(cuid())
  organizationId String  interfaceId String
  scenario String                      // "data" | "empty" | "needs_setup" | "error"
  status Int  body Json  capturedAt DateTime @default(now())
  @@index([organizationId, interfaceId, scenario])
}
```
`Organization` gains `solutionClients SolutionClient[]`; `Solution` gains `client SolutionClient?`. Do NOT store
raw tokens; no plaintext credential column.

═══════════════════════════════════════════════════════════════════════════════
## §5 · NORTHBOUND API — the runtime the developer's app calls
═══════════════════════════════════════════════════════════════════════════════

A small **token-authenticated** surface under `/api/northbound/*` — the ONLY externally-callable SAP path. Reuses
the keystone resolver; preserves honest-status.

**5.1 Auth (per-solution Bearer).** `Authorization: Bearer <token>` → SHA-256(token) → `SolutionClient` by
`tokenHash` (timing-safe) → check `isActive`/not-expired/not-revoked → derive `organizationId`+`solutionId`. No
match/inactive → **401** (generic, no enumeration). Update `lastUsedAt`. Everything below scoped to that org +
solution. Model the check on `share-link.ts`/`session.ts`.

**5.2 Endpoints (READ-first):**
- `GET /api/northbound/interfaces` — the solution's own usable interfaces (id, name, sapProduct, externalId,
  operation, entitySet, mode, grant decision + environment). Metadata only.
- `GET /api/northbound/interfaces/[id]/schema` — the interface's request/response schema (same schema the OpenAPI
  is generated from). No SAP call.
- `GET /api/northbound/interfaces/[id]/data?…` — **the real read.** Verify: interface ∈ solution; an
  `ApiAccessGrant` for its `externalId`+`operation` is APPROVED/READ_ONLY for the client's `environment` (else
  **403 needs-setup**). Resolve SAP via `resolveSapConnection` + `buildAuthHeaderFromConnection`, read through the
  **same code path the Test Console uses** (`/entities`+`/preview` internals — do not fork honest-status), return
  rows with honest status (200+rows / 200+`{records:[]}` / 401-403 / 5xx). Rate-limited (§5.4), audited (§5.5).

**5.3 One gated WRITE (optional in v1; behind every gate):** `POST /api/northbound/interfaces/[id]/data` — allowed
ONLY if `interface.mode == WRITE` AND a grant is APPROVED for WRITE at the environment AND the resolved
`SapConnection.writeEnabled` AND the existing write checklist passed. Else **403**. Uses the existing guarded write
path (`/api/sap/tdd/write` internals + `isSapTddWriteEnabled`/`writeEnabled`). **If you cannot fully gate it, ship
read-only and STOP-report the write as a follow-up** — do not half-build it.

**5.4 Rate limiting.** Dedicated per-token bucket (`northbound:<clientTokenId>`) at the `sapLive` ceiling (or a new
`RATE_LIMITS.northbound`), wired in `src/middleware.ts` ahead of the generic buckets — the broker amplifies onto
SAP like `isLiveSapTenantRoute`. Reuse that predicate style.

**5.5 Audit.** Every `…/data` call (success or failure) writes a `NorthboundAuditEvent` via the append-only
repository; include `correlationId` in the error envelope and a response header.

**5.6 Token issuance (Studio, extends v2 §8.5 API Access).** Add "Issue client credential": creates a
`SolutionClient`, shows the **raw token once** ("store it now — never shown again"), stores only the hash; plus
**rotate** (new token, old hash retired) and **revoke** (`revokedAt`). Each issue/rotate/revoke writes a
`ConfigAudit` row and enforces requester≠approver (§3.4) where approval applies. Gate to `consultant`/`platform_admin`.

═══════════════════════════════════════════════════════════════════════════════
## §6 · LOCAL DEVELOPER ENABLEMENT — the desktop half of the loop
═══════════════════════════════════════════════════════════════════════════════

Upgrade the Studio Scaffold screen (v2 §8.7) from static templates to **real, contract-accurate, runnable**
artifacts. Everything downloads; nothing runs in-browser.

**6.0 Schema capture (prerequisite for 6.1 — build this into the Interface + Test Console flow).** The OpenAPI is
only "real" if the Interface actually carries a schema. Ensure the Studio persists `Interface.requestSchema` and
`Interface.responseSchema` from `/entities` (the entity's field/type metadata) at Interface-definition time, and
lets a Test Console run **confirm/refine** the response shape. If an Interface has no captured schema when Scaffold
is requested, **do not emit an empty/placeholder OpenAPI — surface "capture the schema first" and STOP-report**.

**6.1 Real OpenAPI (not a template).** Generate a valid **OpenAPI 3.1** from the Interface's stored
request/response schema + the northbound endpoint shape (paths `/interfaces/{id}/data`, bearer security scheme,
honest-status responses 200/empty/401/403/5xx as documented responses). Must pass an OpenAPI validator in a unit
test. This is the **polyglot contract** (`openapi-generator` for any language).

**6.2 Runnable starter kit (mock ⇆ live via one env var).** A downloadable zip: a tiny Node/TS reference app
(`README` first) reading `COREEDGE_BASE_URL` + `COREEDGE_TOKEN`, calling the endpoint, printing rows — pointing at
**either** the live broker **or** the local mock by changing only `COREEDGE_BASE_URL`. Include the generated typed
client (6.1), `.env.example`, `npm run mock` / `npm run demo`. README states plainly: *your app code, DB, and stack
are yours; this only shows the CoreEdge call.*

**6.3 Local mock server seeded from Test Console (offline CI).** A downloadable mock serving the OpenAPI with
**recorded fixtures** — the `MockFixture` rows captured from real Test Console runs — covering **all honest states**
(data/empty/needs-setup/error), so the developer's suite runs **offline** against a faithful stub. Prefer
config-only (an OpenAPI-driven mock such as Prism, or a ~60-line Node stub) — do NOT build a bespoke mock framework.
Studio adds a "Capture fixture" action on Test Console results (writes a `MockFixture`); Scaffold bundles that
solution's fixtures.

**6.4 Multi-stack reality (state, don't over-build).** The **OpenAPI is the contract for every language**. Ship a
**TS** typed client generated in-repo; for other languages the README gives the exact `openapi-generator` command.
No hand-written per-language SDKs.

**6.5 Optional CLI (only if free).** Expose the desktop actions as **npm scripts in the starter kit**
(`pull:openapi`, `mock`, `demo`), not a binary. A standalone `coreedge` CLI is **out of scope** — STOP-report if a
requirement seems to need one.

═══════════════════════════════════════════════════════════════════════════════
## §7 · ABAP & BRING-YOUR-OWN SCOPE (make the boundary explicit in-product)
═══════════════════════════════════════════════════════════════════════════════

CoreEdge governs **consumption of SAP**, not development **inside** it. Encode this so the ABAP/OSS developer is
never misled:
- **ABAP-on-stack stays in ADT/Eclipse** (CDS, RAP, FMs, transports). Studio has **no** ABAP editor/transport/deploy
  and must not imply it. Where the UI could imply otherwise, add: *"CoreEdge governs the OData your ABAP exposes;
  build ABAP in ADT."*
- **Consumption bridge for ABAP:** if the developer's ABAP publishes an **OData service**, it surfaces through the
  existing catalogue/probe (honest-status) and can be defined as an `Interface` and consumed via the broker like any
  service. Document the "register the OData my ABAP exposes" path — it is the normal Discover→Interface flow once
  probeable. No new build; a docs/UX affordance.
- **Own DB / own stack:** untouched by CoreEdge. The starter-kit README says so explicitly.

═══════════════════════════════════════════════════════════════════════════════
## §8 · GOLD-STANDARD HARDENING TASKS (each is a §11 test)
═══════════════════════════════════════════════════════════════════════════════

Do them where named; where a full solution is genuinely v2, implement the **v1-safe minimum** and label the rest.
- **T1 · Structural tenant scope** (§3.1) — repository/Prisma-extension + guard-coverage test. **First Phase-D PR.**
- **T2 · Backward-compatible AAD sealing** (§3.3) — optional `aad` on `connection-crypto` seal/open; existing
  ciphertext still opens (or `migrate:reseal`); new `SolutionClient` secrets bound by aad. Test: a blob fails to
  open under another row's aad; a pre-existing (no-aad) blob still opens.
- **T3 · OAuth caching + timeout + bounded retry** (§3.7) in `connection-resolver.ts`.
- **T4 · SoD on grants** (§3.4) — requester≠approver, server-enforced + tested.
- **T5 · Append-only audit** (§3.6) — no update/delete on `ConfigAudit`/`NorthboundAuditEvent`; enforce in repo;
  test that no update path exists/throws.
- **T6 · KMS-readiness note (not a build):** document that `SAP_CONNECTION_ENCRYPTION_KEY` + the SolutionClient key
  should move to KMS/Vault with versioned rotation before real client secrets; ship a `migrate:reseal` **stub**.
  Label v1.1; do not build KMS in Phase D.

═══════════════════════════════════════════════════════════════════════════════
## §9 · OUT OF SCOPE for Phase D (hold the boundary — STOP if a task needs these)
═══════════════════════════════════════════════════════════════════════════════

Full v2 broker with a dynamic scope-policy engine beyond the per-solution grant check; OAuth2 auth-server / per-scope
token exchange; the mapping/transformation engine; reuse marketplace; multi-language hand-written SDKs; a standalone
CLI binary; live KMS integration; Operations Center / Control Tower; per-call monitoring dashboards (the audit
*table* is in scope; the dashboard is not); any write path you cannot fully gate (§5.3). STOP and report if a
requirement seems to need one.

═══════════════════════════════════════════════════════════════════════════════
## §10 · BUILD ORDER — reviewable PRs on GitHub, each green (model tiering)
═══════════════════════════════════════════════════════════════════════════════

Branch from `main`; one PR per step; each passes CI before the next; post the DoD checklist per PR.

- **PR-0 · Keystone** — apply `sap-connection-keystone.patch` as-is (corrections already in); re-verify (crypto
  test + gates); merge. **Opus.** *(Skip if on `main`.)*
- **PR-D1 · Tenant-scope foundation + data model** — **T1** structural helper + guard-coverage test; add
  `SolutionClient`/`NorthboundAuditEvent`/`MockFixture` + migration; **T2** backward-compatible AAD; **T5**
  append-only audit. **Opus.** *(Safe under either fork — see §0.5.)*
- **PR-D2 · Northbound broker (read)** — §5.1–5.2, 5.4–5.5; **T3** OAuth caching/timeout. **Opus** (auth +
  secret-safety + honest-status). *(Do not start until the §0.5 strategic gate is confirmed.)*
- **PR-D3 · Token issuance in Studio + SoD** — §5.6 issue/rotate/revoke; **T4** requester≠approver. **Opus.**
- **PR-D4 · Real OpenAPI + typed client** — §6.0 schema capture, §6.1, 6.4. **Fable viable** (contract-driven) with
  Opus review of the honest-status responses.
- **PR-D5 · Local mock + fixtures + starter kit** — §6.2–6.3: "Capture fixture", bundling, starter kit (mock⇆live),
  offline mock. **Fable viable** (templating/packaging).
- **PR-D6 · Gated write (optional)** — §5.3, only if fully gateable; else STOP-report. **Opus.**
- **PR-D7 · ABAP/BYO scope UX + docs** — §7 in-product notes + "register my ABAP's OData" doc + starter-kit README
  scope statement; **T6** KMS note. **Fable viable.**

Each PR: tenant-scoped via the T1 helper; rate-limited; honest-status intact; secret-safe; append-only audit;
strict-typecheck clean; a11y AA on any UI; read-only SAP probe against **X5M/100**.

═══════════════════════════════════════════════════════════════════════════════
## §11 · DEFINITION OF DONE + REQUIRED TESTS
═══════════════════════════════════════════════════════════════════════════════

**Ship only when ALL hold:**
- A `SolutionClient` token calls `GET /api/northbound/interfaces/[id]/data` for a **real activated service** and
  gets **real rows**; empty → **"No records" (200+empty)**; needs-setup → **403/401**; error → **5xx** — honest,
  never fabricated.
- The **downloaded OpenAPI validates**; a generated TS client compiles + calls the broker; the **starter kit runs
  against the live broker AND the local mock offline** by changing only `COREEDGE_BASE_URL`.
- The **local mock reproduces all four honest states** from `MockFixture`s.
- Full gate suite green on `main` after the last PR; a11y AA on new UI.

**Required tests (add all):**
1. Northbound read: real rows / "No records" / 401-403 / 5xx — **honest status asserted.**
2. **No secret leak** (no `secretsCiphertext`, no raw token, no SAP host in any response).
3. **Cross-tenant impossible:** org-A token cannot read org-B interface/data (structural-scope test); ungranted
   interface → 403; request-supplied org/tenant ignored.
4. **Token lifecycle:** issued authenticates; rotated-old → 401; revoked → 401; stored only as hash.
5. **SoD:** requester cannot approve own grant (403).
6. **AAD (T2):** a blob fails to open under another row's aad; **a pre-existing no-aad blob still opens**.
7. **OAuth hardening (T3):** token cached across calls; slow SAP fetch aborts on timeout.
8. **Append-only audit (T5):** every northbound call writes an event; no update/delete path exists.
9. **Rate limit:** per-token northbound bucket throttles a burst.
10. **OpenAPI (6.1):** generated doc passes a validator; documents the honest-status responses; **an Interface with
    no captured schema is refused, not emitted empty.**
11. **Mock (6.3):** serves all four honest states from fixtures; the starter kit's offline demo passes.
12. Keystone crypto round-trip/tamper/wrong-key still pass.

═══════════════════════════════════════════════════════════════════════════════
## §12 · REPORTING & OPERATING RULES
═══════════════════════════════════════════════════════════════════════════════

- **Post STEP-0 recon first** (§2) incl. the §0.5 strategic-gate status. No code until STEP-0 is clean or the
  blocker is reported.
- **Work PR-by-PR on GitHub**, each green on CI with its DoD + the §11 tests it satisfies. Run the gates locally
  before push.
- **STOP-and-report, never guess:** on any conflict with v2/keystone, missing prerequisite, unconfirmed §0.5 gate,
  developer-loop ambiguity, an ungateable write, or §9 boundary pressure.
- **Report each PR** with: what closed of the §1 loop, DoD/tests, residual risk. Success = the §1 north-star is
  demonstrably true, tenant isolation + secret-safety are **structural** (not by-convention), and nothing had to be
  undone later.
