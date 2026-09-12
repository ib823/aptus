# CoreEdge Console — codebase audit

**Repository** `ib823/aptus` · **Commit** `a55c48c846244262ab1df0cf275860733cca2d61` · **Branch** `claude/upbeat-bohr-ieo6zi`
**Generated** 2026-09-12 (UTC) · Read-only audit. No source file was modified; the only writes are this file and `audit.json`.

Every claim below carries a `path:line` citation. Counts state the command that produced them. Where the evidence does not settle a question the text says **unclear** and lists the candidates. No secret value appears anywhere — only environment-variable and column **names**.

---

## Executive summary (15 lines)

1. **Stack** — Next.js 15.5.24 **App Router**, React 19.2.4, TypeScript 5.9.3 (`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Prisma 6.19.2, **Tailwind v4** (CSS-first, no `tailwind.config.*`), Vitest 4.0.18 + Playwright 1.58.2, ESLint 9 flat config. `package.json:101-179`, `tsconfig.json:1-44`, `postcss.config.mjs:1-7`.
2. **Routes** — **172 page routes** (`find src/app -name 'page.tsx' | wc -l`), across 12 route groups; 163 are server components, 9 are `"use client"`.
3. **API** — **316 route handlers** under `src/app/api/**` (`find src/app/api -name 'route.ts' | wc -l`), plus 19 more `route.ts` handlers outside `/api` in the `(external)` guest groups.
4. **Models** — **191 Prisma models / 10 enums** total (`grep -c '^model ' prisma/schema.prisma` = 191; `grep -c '^enum '` = 10); **12 models + 3 enums** form the northbound chain (`prisma/schema.prisma:646-1198`).
5. **The three console areas exist today** and are named Developer Studio, Operations Center and Control Tower — `src/lib/studio/rbac.ts:56-80`, with 7 / 8 / 7 rail sections in `src/lib/studio/sections.ts:43-92`.
6. **Gating is already half the new design**: the role decision renders `RoleGatedEmptyState` instead of redirecting (`src/app/(studio)/layout.tsx:60-62`), and Control Tower already ships a render-and-disable control (`src/components/control-tower/GovernanceChrome.tsx:168-192`).
7. **…and half not**: every console page still **redirects** for unauthenticated and for MFA step-up (`src/app/(studio)/layout.tsx:53,68-75`). **131 of 172 page routes gate by redirect**; 22 more redirect *and* disable. Section B4 lists them.
8. **Design tokens** are Tailwind v4 `@theme` + `:root` custom properties in `src/app/globals.css:6-113,114-273`. There is **no `.coreedge` scope**; there **is** a dark theme (`.dark`, `src/app/globals.css:274-335`).
9. **Raw literals in components**: 239 hex colours across 41 files, 27 `rgb()/rgba()`, 1343 `px` literals (commands in D12). The console screens style themselves with **inline `style={{}}` objects**, not classes — `src/app/(studio)/studio-responsive.css:23-27` says so explicitly.
10. **Risk 1 (P0)** — `/api/sap/tdd/preview`, `/entities`, `/operations` perform live customer-SAP reads with **no grant check and no audit row**, and the caller chooses tenant + service + entity from the query string (`src/app/api/sap/tdd/preview/route.ts:23-38`).
11. **Risk 2 (P0)** — the northbound **audit trail has no retention and no index on `correlationId`**: nothing deletes `NorthboundAuditEvent`, and the ops feed cannot be filtered by correlation id (`prisma/schema.prisma:1103-1105`, `src/app/api/ops/broker-traffic/route.ts:56-80`).
12. **Risk 3 (P1)** — the two intentional auth backdoors (`/api/auth/test-login`, `/api/auth/verify-izzat`) write **no audit row**; `logBackdoorAttempt` is a `console.warn` (`src/lib/auth/test-backdoor-guards.ts:62-74`).
13. **Unknown 1** — whether `ALLOW_TEST_LOGIN_IN_PROD` / `INTERNAL_TEST_DEPLOYMENT` are set on any live deployment. The repo cannot answer it; the code path is reachable if they are (`src/app/api/auth/test-login/route.ts:42-48`).
14. **Unknown 2** — whether `UPSTASH_REDIS_REST_URL`/`_TOKEN` are configured. Without them every rate limit is per-instance and effectively multiplied by warm instances (`src/lib/security/rate-limit.ts:127-141`, `:296-318`).
15. **Unknown 3** — whether the hand-written partial index `SapConnection_active_binding_tuple` exists in the target database; `prisma db push` does not create it (`prisma/schema.prisma:706-712`).

**Checks right now:** `lint` **pass** · `typecheck` **pass** · `test` **pass** (5322 passed / 10 skipped) · `build` **pass**. Tails in §G29.

---
## A. Shape and stack

### A1 · Framework and versions

All from `package.json` and the config files named.

| Thing | Value | Evidence |
|---|---|---|
| Framework | Next.js `15.5.24` | `package.json:129` |
| Router | **App Router** — every route lives under `src/app/`, no `src/pages` or `pages/` directory exists (`find . -maxdepth 2 -name pages -type d -not -path './node_modules/*'` returns nothing) | `src/app/layout.tsx:1`, `next.config.ts:1-8` |
| React | `19.2.4` (`react`, `react-dom` pinned exactly, no caret) | `package.json:139-140` |
| TypeScript | `^5.9.3`; `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all on; `moduleResolution: "bundler"`; path alias `@/* → ./src/*` | `package.json:178`, `tsconfig.json:5-7,12,20-24` |
| Prisma | `prisma` + `@prisma/client` `^6.19.2`; single schema file of 6281 lines | `package.json:103,135`, `prisma/schema.prisma` |
| Tailwind | **v4** — `tailwindcss ^4.2.1` with `@tailwindcss/postcss`, CSS-first config. **There is no `tailwind.config.js/ts/mjs`** (`ls tailwind.config.*` → no match); tokens are declared with `@theme inline` inside the stylesheet | `package.json:153,175`, `postcss.config.mjs:1-7`, `src/app/globals.css:1-6` |
| Test runner | **Vitest** `^4.0.18` (unit + integration + security + performance) and **Playwright** `^1.58.2` (e2e, a11y, visual) | `package.json:152,179`, `vitest.config.ts`, `playwright.config.ts` + 3 more Playwright configs |
| Linter | ESLint `^9.39.3`, flat config extending `next/core-web-vitals` + `next/typescript`; `no-explicit-any` is an **error**, `no-console` a warning | `package.json:171-172`, `eslint.config.mjs:19-42` |
| Formatter | Prettier (config present, not wired into `lint`) | `.prettierrc`, `.prettierignore` |
| Node | pinned `22.x` / volta `22.22.1`, enforced by a preinstall hook on nearly every script | `package.json:6-8,10-19`, `scripts/check-node-version.mjs` |
| Package manager | pnpm `10.23.0`, workspace enabled | `package.json:5`, `pnpm-workspace.yaml` |

**CI workflows** (`ls .github/workflows`): `ci.yml`, `migration-integrity.yml`, `abap-mcp.yml`, `dependabot-auto-merge.yml`.
`ci.yml` runs four jobs — `quality-gates` (audit gate → `db:generate` → `db:push` → `typecheck:strict` → `lint:strict` → `vitest` → `build` → `test:security:http`), `e2e-smoke`, `visual-regression` (report mocks), `visual-regression-app` (live app, skipped when no baselines are committed). `.github/workflows/ci.yml:17-90,92-172,174-214,216-290`.

### A2 · Directory map of `src/`, two levels deep

Command: `find src -maxdepth 2 -type d | sort` (100 directories).

**`src/app/` — App Router. 12 route groups.**

| Directory | Purpose |
|---|---|
| `src/app/(auth)` | Sign-in surfaces: `/login`, `/signup`, `/verify-mfa`, `/invitations/[token]`, and the internal-testing `/dev-login` (`src/app/(auth)/dev-login/page.tsx:1-9`) |
| `src/app/(control-tower)` | **CoreEdge Control Tower** — portfolio, grants, audit, connection/credential registers, usage (`src/app/(control-tower)/layout.tsx:1-18`) |
| `src/app/(external)` | Token-authenticated guest surfaces: `/c` presales, `/a` affirm, `/d` discovery. Never bridged through NextAuth (`src/middleware.ts:318-325`) |
| `src/app/(help)` | The in-product manual. Session-gated, deliberately **not** role-gated (`src/app/(help)/layout.tsx:20,35-36`) |
| `src/app/(operations)` | **CoreEdge Operations Center** — traffic, connections, incidents, write ledger, throttle, tokens, catalogue health (`src/app/(operations)/layout.tsx:1-18`) |
| `src/app/(portal)` | The Aptus assessment portal: dashboard, assessments, analytics, insights, settings, organization, and `admin/*` |
| `src/app/(portal-customer)` | One read-only customer view of an assessment behind a share token (`src/app/(portal-customer)/assessments/[shareToken]/page.tsx`) |
| `src/app/(public)` | Unauthenticated marketing/legal: pricing, privacy, terms, `/verify/[token]` |
| `src/app/(studio)` | **CoreEdge Developer Studio** — home, discover, solutions, connections, API access, interfaces, test console (`src/app/(studio)/layout.tsx:1-19`) |
| `src/app/(workbench)` | ABeam Workbench: presales, discovery, affirm, to-be pack, sap-explorer |
| `src/app/(workbench-public)` | The Workbench's own pre-auth sign-in (`/presales/login`, `/presales/login/confirm`) |
| `src/app/api` | 316 route handlers (§B5) |
| `src/app/design-system` | A living token/component gallery page |
| `src/app/offline` | PWA offline fallback |

**`src/components/` — 60 sub-directories.** The ones the redesign touches:

| Directory | Purpose |
|---|---|
| `src/components/studio` | Studio shell, rail, top bar, and the six screen clients (14 files) |
| `src/components/ops` | Operations Center chrome + screen clients + topology map (11 files) |
| `src/components/control-tower` | Governance chrome + 5 screen clients (6 files) |
| `src/components/ui` | The shadcn-derived primitive layer (29 files, §D13) |
| `src/components/sap`, `sap-content` | The reusable SAP catalogue browser reused by Studio Discover |
| `src/components/shared` | Cross-surface pieces including `ConfirmDialog.tsx` |
| `src/components/audit` | Audit event chips and payload viewers |
| others (`admin`, `affirm`, `analytics`, `aptus`, `assessment`, `auth`, `brand`, `collaboration`, `comments`, `commercial`, `config`, `dashboard`, `discovery`, `external`, `flow`, `flows`, `fts`, `gaps`, `help`, `hierarchy`, `layout`, `lifecycle`, `mfa`, `notifications`, `onboarding`, `org`, `presales`, `profile`, `pwa`, `registers`, `remaining`, `report`, `review`, `scope`, `signoff`, `templates`, `tobe`, `tour`, `workbench`, `workshop`) | Portal / Workbench feature components, outside the CoreEdge console |

**`src/lib/` — 54 sub-directories.** The ones that matter here:

| Directory | Purpose |
|---|---|
| `src/lib/northbound` | The broker spine: `auth.ts`, `access.ts`, `read.ts`, `write.ts`, `audit.ts`, `idempotency.ts`, `issue.ts`, `write-credential.ts`, `respond.ts`, `reap.ts`, `failure-reason.ts` |
| `src/lib/sap-public` | SAP connectors, `connection-resolver.ts` (the binding), `connection-crypto.ts` (AES-256-GCM), `tdd-connector.ts`, `probe-guard.ts`, `tenant-for-read.ts` |
| `src/lib/studio` | Console RBAC (`rbac.ts`), rail inventory (`sections.ts`), tenant scope, grants vocabulary, connection health, honest status |
| `src/lib/ops` | Ops guard, incident rules, topology, throttle buckets, cron helpers, connection-probe sweep |
| `src/lib/auth` | Sessions, permissions, role metadata, admin/assessment guards, the two backdoor guards, WebAuthn |
| `src/lib/security` | Rate limiting, client IP, HMAC nonce, sanitisation, filename + UA fingerprint |
| `src/lib/db` | Prisma client and the AsyncLocalStorage tenant-scope guard |
| others (`affirm`, `alm`, `analytics`, `analyzer`, `assessment`, `audit`, `brand`, `brownfield`, `classification`, `collaboration`, `commercial`, `conversation`, `dashboard`, `dependency`, `discovery`, `email`, `flow`, `format`, `fts`, `gap-workspace`, `help`, `http`, `intelligence`, `learn`, `lifecycle`, `navigation`, `notifications`, `offline`, `onboarding`, `presales`, `pwa`, `register`, `report`, `routing`, `sap`, `sap-content`, `scope`, `signoff`, `tobe`, `tour`, `utils`, `workbench`, `workshop`) | Portal / Workbench domain logic |

**Remaining top-level:** `src/constants`, `src/data` (`discovery`, `tobe` seed data), `src/hooks`, `src/types`, `src/middleware.ts`.

### A3 · Deployment and the env vars that gate behaviour

**Deployment is Vercel.** `vercel.json:1-25` sets `buildCommand: "pnpm run vercel-build"` and registers four crons:

| Cron path | Schedule | Handler |
|---|---|---|
| `/api/cron/analytics` | `0 3 * * *` | `src/app/api/cron/analytics/route.ts` |
| `/api/cron/northbound-reap` | `30 3 * * *` | `src/app/api/cron/northbound-reap/route.ts:10-33` |
| `/api/cron/trials` | `0 2 * * *` | `src/app/api/cron/trials/route.ts` |
| `/api/cron/connection-probes` | `0 4 * * *` | `src/app/api/cron/connection-probes/route.ts:19-41` |

`vercel.json:17-22` also raises `/api/presales/sign-pdf` to 1024 MB / 60 s.

`vercel-build` (`package.json:23`) is the production pipeline and does five things beyond `next build`:
`check-runtime-assets.mjs` → `check-production-env.js` → **`strip-test-auth-for-production.mjs`** → `migrate-deploy-with-retry.mjs` → `prisma generate` → `assert-content-release-landed.ts` → `next build` → `check-runtime-assets.mjs --built`.

`next.config.ts` adds: request-time file tracing for the developer guide (`:8-10`), an `async_hooks: false` client fallback so the tenant guard degrades inert in the browser (`:11-22`), 13 `serverExternalPackages` (`:23-38`), global security headers from `src/lib/pwa/security-headers` (`:39-46`), and `Referrer-Policy: no-referrer` + `Cache-Control: no-store` on `/c/*` and `/a/*` so guest grant tokens never reach a CDN log (`:47-70`).

**Env vars that gate behaviour.** Command: `rg -o 'process\.env\.([A-Z0-9_]+)' -r '$1' src scripts | sort -u` → 112 names. Names only; no values are reported. The ones that change what the product does:

| Variable | What it gates | Evidence |
|---|---|---|
| `WORKBENCH_ONLY` | `=== "true"` makes the whole deployment Workbench-only: root and every non-Workbench page redirect to `/workbench` | `src/middleware.ts:75,105-136` |
| `WORKBENCH_HOST` / `PORTAL_HOST` | When **both** set, a two-host product split with cross-host 307/308 redirects | `src/middleware.ts:64-65,177-238` |
| `ENABLE_TEST_LOGIN_ENDPOINT`, `E2E_TEST_SECRET`, `ALLOW_TEST_LOGIN_IN_PROD`, `TEST_LOGIN_ALLOWED_IPS` | The `/api/auth/test-login` backdoor (§E14) | `src/app/api/auth/test-login/route.ts:34,42,50,71` |
| `INTERNAL_TEST_DEPLOYMENT` | Lets the pre-deploy env check pass with the test-login flags set in production | `.env.example:74-77`, `scripts/check-production-env.js` |
| `ENABLE_SIMULATION_BRIDGE`, `SIMULATION_BRIDGE_SECRET`, `ALLOW_SIMULATION_BRIDGE_IN_PROD`, `SIMULATION_BRIDGE_ALLOWED_IPS` | The second backdoor, `/api/auth/verify-izzat` | `src/app/api/auth/verify-izzat/route.ts:26-35`, `src/lib/auth/test-backdoor-guards.ts:1-11` |
| `ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST` | Re-opens a backdoor in production when no IP allow-list is configured (default there is fail-closed) | `src/lib/auth/test-backdoor-guards.ts:44-52` |
| `DEV_AFFIRM_SEED_SECRET`, `ALLOW_DEV_SEED_IN_PROD` | `/api/dev/seed-affirm`, `/api/dev/seed-presales-test` | `src/app/api/dev/seed-affirm/route.ts:36-40`, `src/lib/auth/dev-seed-guard.ts:40` |
| `CRON_SECRET` | Every `/api/cron/*` handler, compared in constant time | `src/app/api/cron/northbound-reap/route.ts:12-16`, `src/lib/ops/cron.ts` |
| `SAP_CONNECTION_ENCRYPTION_KEY` | The AES-256-GCM key that seals every stored SAP secret. Unset ⇒ connection save fails, the connection list is empty, the broker refuses `CONNECTION_NOT_CONFIGURED`, and 3 of 9 incident rules can never fire | `src/app/api/studio/connections/route.ts:338-362` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Whether rate limiting is deployment-wide or per-instance. Unset ⇒ in-memory Map | `src/lib/security/rate-limit.ts:22-30,317-319` |
| `NEUTRAL_DISCOVERY_ENABLED` | The neutral-discovery consultant surfaces | `.github/workflows/ci.yml:159`; `rg -n NEUTRAL_DISCOVERY_ENABLED src` |
| `TOBE_PACK_ENABLED` | The To-Be Process Pack (`/tobe`) — 404 when off | `src/lib/tobe/guards.ts:2,8` |
| `AFFIRM_EXTERNAL_ENABLED` | The `/a` guest surface |  `rg 'AFFIRM_EXTERNAL_ENABLED' src` |
| `AUTH_INVITATION_ONLY`, `AUTH_WHITELIST_BYPASS`, `AUTH_ALLOWED_DOMAINS` | Who may sign up at all | `src/lib/auth/auth-options.ts` |
| `PRESALES_CSRF_SECRET`, `PRESALES_INTERNAL_SECRET` | Guest POST nonce signing; unset ⇒ a sign-off completes **without** a PDF | `.env.example:54-63` |
| `TENANT_SCOPE_GUARD` | The AsyncLocalStorage cross-tenant guard's mode | `src/lib/db/tenant-guard.ts` |
| `S4_TDD_*`, `ARIBA_*`, `SAP_API_HUB_*` | The deployment's shared/env SAP tenants and catalogue import | `src/lib/sap-public/tdd-connector.ts` |
| `VERCEL`, `VERCEL_ENV`, `NODE_ENV` | Together decide "is this a production deploy" for the test-auth strip | `scripts/strip-test-auth-for-production.mjs:58-69` |

---
## B. Routes and screens

### B4 · Every page route

172 page routes. Command: `find src/app -name 'page.tsx' | wc -l` → 172. Server/client determined by a `"use client"` directive in the first 30 lines; metadata by an `export const metadata` / `export async function generateMetadata`; gating by walking each file's layout chain. Generator: `routes.mjs` (scratch, not committed).

**Totals** — server components 163, client components 9. Metadata: 91 own `metadata`, 9 `generateMetadata`, 72 inherit from a layout.

> ⚠️ **Redirect-gated routes — the new design never redirects.** **131 of 172** gate purely by redirect; **22 more** redirect *and* render-and-disable (the three CoreEdge groups and `(external)`); 5 use `notFound()`; 14 have no gate. Every row whose *Gating style* contains `redirect` is flagged. The CoreEdge console groups are the mixed case: the **role** decision already renders-and-disables, but **unauthenticated** and **MFA step-up** still redirect.

#### Route group `(studio)` — 7 pages, 7 redirect-gated

Layout guard `src/app/(studio)/layout.tsx:51-75`. Unauthenticated → **redirect** `/presales/login` (`:53`). Wrong role or no org scope → `RoleGatedEmptyState` (**render-and-disable**, `:60-62`). MFA required → **redirect** (`:68-75`). Roles from `canAccessStudio` = `consultant` ∪ `isAdminRole` (`src/lib/studio/rbac.ts:92-95`, `src/lib/auth/permissions.ts:380-383`).

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/studio` | `src/app/(studio)/studio/page.tsx` | server | metadata | consultant, platform_admin | layout | **redirect+disable** ⚠️ |
| `/studio/access` | `src/app/(studio)/studio/access/page.tsx` | server | metadata | consultant, platform_admin | layout | **redirect+disable** ⚠️ |
| `/studio/connections` | `src/app/(studio)/studio/connections/page.tsx` | server | metadata | consultant, platform_admin | layout | **redirect+disable** ⚠️ |
| `/studio/discover` | `src/app/(studio)/studio/discover/page.tsx` | server | metadata | consultant, platform_admin | layout | **redirect+disable** ⚠️ |
| `/studio/interfaces` | `src/app/(studio)/studio/interfaces/page.tsx` | server | metadata | consultant, platform_admin | layout | **redirect+disable** ⚠️ |
| `/studio/solutions` | `src/app/(studio)/studio/solutions/page.tsx` | server | metadata | consultant, platform_admin | layout | **redirect+disable** ⚠️ |
| `/studio/test` | `src/app/(studio)/studio/test/page.tsx` | server | metadata | consultant, platform_admin | layout | **redirect+disable** ⚠️ |

#### Route group `(operations)` — 8 pages, 8 redirect-gated

Layout guard `src/app/(operations)/layout.tsx:45-68`. Same three-branch shape as Studio. Roles from `canAccessOperations` = `support` ∪ admin (`src/lib/studio/rbac.ts:114-117`). Admin-only rail entries are **removed** rather than refused (`src/app/(operations)/layout.tsx:86-88`).

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/operations` | `src/app/(operations)/operations/page.tsx` | server | metadata — "Broker traffic" | support, platform_admin | layout | **redirect+disable** ⚠️ |
| `/operations/catalogue` | `src/app/(operations)/operations/catalogue/page.tsx` | server | metadata | support, platform_admin | layout | **redirect+disable** ⚠️ |
| `/operations/connections` | `src/app/(operations)/operations/connections/page.tsx` | server | metadata | support, platform_admin | layout | **redirect+disable** ⚠️ |
| `/operations/incidents` | `src/app/(operations)/operations/incidents/page.tsx` | server | metadata | support, platform_admin | layout | **redirect+disable** ⚠️ |
| `/operations/throttle` | `src/app/(operations)/operations/throttle/page.tsx` | server | metadata | support, platform_admin | layout | **redirect+disable** ⚠️ |
| `/operations/tokens` | `src/app/(operations)/operations/tokens/page.tsx` | server | metadata | support, platform_admin | layout | **redirect+disable** ⚠️ |
| `/operations/traffic` | `src/app/(operations)/operations/traffic/page.tsx` | server | metadata | support, platform_admin | layout | **redirect+disable** ⚠️ |
| `/operations/writes` | `src/app/(operations)/operations/writes/page.tsx` | server | metadata | support, platform_admin | layout | **redirect+disable** ⚠️ |

#### Route group `(control-tower)` — 7 pages, 7 redirect-gated

Layout guard `src/app/(control-tower)/layout.tsx:44-67`. Roles from `canAccessControlTower` = admin ∪ {`partner_lead`,`executive_sponsor`,`project_manager`} (`src/lib/studio/rbac.ts:127-136`). Mutation is admin-only via `canMutateControlTower` (`:145-148`).

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/control-tower` | `src/app/(control-tower)/control-tower/page.tsx` | server | metadata — "Solution portfolio" | platform_admin, partner_lead, executive_sponsor, project_manager | layout | **redirect+disable** ⚠️ |
| `/control-tower/audit` | `src/app/(control-tower)/control-tower/audit/page.tsx` | server | metadata | platform_admin, partner_lead, executive_sponsor, project_manager | layout | **redirect+disable** ⚠️ |
| `/control-tower/connections` | `src/app/(control-tower)/control-tower/connections/page.tsx` | server | metadata | platform_admin, partner_lead, executive_sponsor, project_manager | layout | **redirect+disable** ⚠️ |
| `/control-tower/grants` | `src/app/(control-tower)/control-tower/grants/page.tsx` | server | metadata | platform_admin, partner_lead, executive_sponsor, project_manager | layout | **redirect+disable** ⚠️ |
| `/control-tower/portfolio` | `src/app/(control-tower)/control-tower/portfolio/page.tsx` | server | metadata | platform_admin, partner_lead, executive_sponsor, project_manager | layout | **redirect+disable** ⚠️ |
| `/control-tower/tokens` | `src/app/(control-tower)/control-tower/tokens/page.tsx` | server | metadata | platform_admin, partner_lead, executive_sponsor, project_manager | layout | **redirect+disable** ⚠️ |
| `/control-tower/usage` | `src/app/(control-tower)/control-tower/usage/page.tsx` | server | metadata | platform_admin, partner_lead, executive_sponsor, project_manager | layout | **redirect+disable** ⚠️ |

#### Route group `(portal)` — 77 pages, 77 redirect-gated

Layout guard `src/app/(portal)/layout.tsx:54-71` — unauthenticated → **redirect** `/login`; MFA → **redirect**. No role gate at the group level. `admin/*` adds `src/app/(portal)/admin/layout.tsx:10-12`, which **redirects to `/dashboard`** for any role outside `["platform_admin","admin"]` — note `"admin"` is a *legacy* role string, not a member of `UserRole` (`src/types/assessment.ts:47-72,76`).

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/admin` | `src/app/(portal)/admin/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/adaptation-patterns` | `src/app/(portal)/admin/adaptation-patterns/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/assessments` | `src/app/(portal)/admin/assessments/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/baselines` | `src/app/(portal)/admin/baselines/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-assessments` | `src/app/(portal)/admin/brownfield-assessments/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-assessments/[id]` | `src/app/(portal)/admin/brownfield-assessments/[id]/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-assessments/[id]/verdicts` | `src/app/(portal)/admin/brownfield-assessments/[id]/verdicts/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs` | `src/app/(portal)/admin/brownfield-catalogs/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]` | `src/app/(portal)/admin/brownfield-catalogs/[id]/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]/business-functions` | `src/app/(portal)/admin/brownfield-catalogs/[id]/business-functions/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]/guides/[guideId]` | `src/app/(portal)/admin/brownfield-catalogs/[id]/guides/[guideId]/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]/items` | `src/app/(portal)/admin/brownfield-catalogs/[id]/items/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]/items/[itemId]` | `src/app/(portal)/admin/brownfield-catalogs/[id]/items/[itemId]/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]/methodology` | `src/app/(portal)/admin/brownfield-catalogs/[id]/methodology/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]/notes` | `src/app/(portal)/admin/brownfield-catalogs/[id]/notes/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/brownfield-catalogs/[id]/search` | `src/app/(portal)/admin/brownfield-catalogs/[id]/search/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/catalog` | `src/app/(portal)/admin/catalog/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/catalog/[versionId]` | `src/app/(portal)/admin/catalog/[versionId]/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/extensibility-patterns` | `src/app/(portal)/admin/extensibility-patterns/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/industries` | `src/app/(portal)/admin/industries/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/ingest` | `src/app/(portal)/admin/ingest/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/organizations` | `src/app/(portal)/admin/organizations/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/organizations/[orgId]` | `src/app/(portal)/admin/organizations/[orgId]/page.tsx` | server | inherited-from-layout | platform_admin | layout | **redirect** ⚠️ |
| `/admin/roles` | `src/app/(portal)/admin/roles/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/users` | `src/app/(portal)/admin/users/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/admin/verify` | `src/app/(portal)/admin/verify/page.tsx` | server | metadata | platform_admin | layout | **redirect** ⚠️ |
| `/analytics` | `src/app/(portal)/analytics/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/analytics/benchmarks/[assessmentId]` | `src/app/(portal)/analytics/benchmarks/[assessmentId]/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/analytics/cross-phase/[assessmentId]` | `src/app/(portal)/analytics/cross-phase/[assessmentId]/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment` | `src/app/(portal)/assessment/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]` | `src/app/(portal)/assessment/[id]/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/activity` | `src/app/(portal)/assessment/[id]/activity/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/benchmarks` | `src/app/(portal)/assessment/[id]/benchmarks/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/change-requests` | `src/app/(portal)/assessment/[id]/change-requests/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/config` | `src/app/(portal)/assessment/[id]/config/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/conversation` | `src/app/(portal)/assessment/[id]/conversation/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/cross-phase` | `src/app/(portal)/assessment/[id]/cross-phase/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/data-migration` | `src/app/(portal)/assessment/[id]/data-migration/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/flows` | `src/app/(portal)/assessment/[id]/flows/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/flows/overview` | `src/app/(portal)/assessment/[id]/flows/overview/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/gaps` | `src/app/(portal)/assessment/[id]/gaps/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/granularity` | `src/app/(portal)/assessment/[id]/granularity/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/integrations` | `src/app/(portal)/assessment/[id]/integrations/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/ocm` | `src/app/(portal)/assessment/[id]/ocm/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/process-map` | `src/app/(portal)/assessment/[id]/process-map/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/profile` | `src/app/(portal)/assessment/[id]/profile/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/remaining` | `src/app/(portal)/assessment/[id]/remaining/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/report` | `src/app/(portal)/assessment/[id]/report/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/requirements` | `src/app/(portal)/assessment/[id]/requirements/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/review` | `src/app/(portal)/assessment/[id]/review/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/review/[scopeItemId]` | `src/app/(portal)/assessment/[id]/review/[scopeItemId]/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/scope` | `src/app/(portal)/assessment/[id]/scope/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/sign-off` | `src/app/(portal)/assessment/[id]/sign-off/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/snapshots` | `src/app/(portal)/assessment/[id]/snapshots/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/triggers` | `src/app/(portal)/assessment/[id]/triggers/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/workshops` | `src/app/(portal)/assessment/[id]/workshops/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessment/[id]/workshops/[sessionId]` | `src/app/(portal)/assessment/[id]/workshops/[sessionId]/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessments` | `src/app/(portal)/assessments/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/assessments/new` | `src/app/(portal)/assessments/new/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/dashboard` | `src/app/(portal)/dashboard/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/insights` | `src/app/(portal)/insights/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/insights/activity` | `src/app/(portal)/insights/activity/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/insights/benchmarks` | `src/app/(portal)/insights/benchmarks/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/insights/patterns` | `src/app/(portal)/insights/patterns/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/insights/phase-bridge` | `src/app/(portal)/insights/phase-bridge/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/insights/triggers` | `src/app/(portal)/insights/triggers/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/onboarding` | `src/app/(portal)/onboarding/page.tsx` | client | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/organization` | `src/app/(portal)/organization/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/organization/users` | `src/app/(portal)/organization/users/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/settings` | `src/app/(portal)/settings/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/settings/notifications` | `src/app/(portal)/settings/notifications/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/settings/profile` | `src/app/(portal)/settings/profile/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/settings/security` | `src/app/(portal)/settings/security/page.tsx` | client | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/settings/subscription` | `src/app/(portal)/settings/subscription/page.tsx` | client | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/templates` | `src/app/(portal)/templates/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/workshops/[sessionId]` | `src/app/(portal)/workshops/[sessionId]/page.tsx` | server | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/workshops/join` | `src/app/(portal)/workshops/join/page.tsx` | client | inherited-from-layout | all 12 signed-in roles | layout | **redirect** ⚠️ |

#### Route group `(workbench)` — 31 pages, 31 redirect-gated

Layout guard `src/app/(workbench)/layout.tsx:58-59` — unauthenticated → **redirect** `/presales/login`. No role gate. Sub-layouts exist for `affirm`, `discovery`, `presales`, `sap-explorer`.

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/affirm` | `src/app/(workbench)/affirm/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/affirm/[id]` | `src/app/(workbench)/affirm/[id]/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/affirm/[id]/output` | `src/app/(workbench)/affirm/[id]/output/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/affirm/[id]/questions` | `src/app/(workbench)/affirm/[id]/questions/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/affirm/[id]/review` | `src/app/(workbench)/affirm/[id]/review/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/affirm/[id]/scope` | `src/app/(workbench)/affirm/[id]/scope/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/affirm/new` | `src/app/(workbench)/affirm/new/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery` | `src/app/(workbench)/discovery/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/coverage` | `src/app/(workbench)/discovery/coverage/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/health` | `src/app/(workbench)/discovery/health/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/library` | `src/app/(workbench)/discovery/library/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/library/[scopeId]` | `src/app/(workbench)/discovery/library/[scopeId]/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/map` | `src/app/(workbench)/discovery/map/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/outputs` | `src/app/(workbench)/discovery/outputs/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/outputs/[id]` | `src/app/(workbench)/discovery/outputs/[id]/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/sessions` | `src/app/(workbench)/discovery/sessions/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/sessions/[id]` | `src/app/(workbench)/discovery/sessions/[id]/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/sessions/[id]/facilitate` | `src/app/(workbench)/discovery/sessions/[id]/facilitate/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/sessions/new` | `src/app/(workbench)/discovery/sessions/new/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/discovery/sources` | `src/app/(workbench)/discovery/sources/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/presales` | `src/app/(workbench)/presales/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/presales/[bundleId]` | `src/app/(workbench)/presales/[bundleId]/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/presales/[bundleId]/audit` | `src/app/(workbench)/presales/[bundleId]/audit/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/presales/[bundleId]/change-request` | `src/app/(workbench)/presales/[bundleId]/change-request/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/presales/[bundleId]/preview/[scopeCode]` | `src/app/(workbench)/presales/[bundleId]/preview/[scopeCode]/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/presales/new` | `src/app/(workbench)/presales/new/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/presales/settings` | `src/app/(workbench)/presales/settings/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/sap-explorer` | `src/app/(workbench)/sap-explorer/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/tobe` | `src/app/(workbench)/tobe/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/tobe/[engagementId]` | `src/app/(workbench)/tobe/[engagementId]/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/workbench` | `src/app/(workbench)/workbench/page.tsx` | server | metadata — "Affirm bundles" | all 12 signed-in roles | layout | **redirect** ⚠️ |

#### Route group `(help)` — 3 pages, 3 redirect-gated

Layout guard `src/app/(help)/layout.tsx:44-45` — session only, deliberately not role-gated (`:20,35-36`). Also gated in **middleware** (`src/middleware.ts:170-181`) because an RSC flight request can render past a layout redirect.

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/help` | `src/app/(help)/help/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/help/[workspace]/[section]` | `src/app/(help)/help/[workspace]/[section]/page.tsx` | server | generateMetadata | all 12 signed-in roles | layout | **redirect** ⚠️ |
| `/help/developer-guide` | `src/app/(help)/help/developer-guide/page.tsx` | server | metadata | all 12 signed-in roles | layout | **redirect** ⚠️ |

#### Route group `(external)` — 24 pages, 18 redirect-gated

Guest surfaces. Authenticated by grant token + a guest cookie, never by NextAuth; `src/middleware.ts:318-325` excludes `/c/*` and `/a/*` from the session bridge, and `next.config.ts:47-70` strips the Referer. Sub-layouts: `(external)/a`, `/c`, `/d`.

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/a/[token]` | `src/app/(external)/a/[token]/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **redirect** ⚠️ |
| `/a/affirm/[scopeItemId]` | `src/app/(external)/a/affirm/[scopeItemId]/page.tsx` | server | inherited-from-layout | guest (grant token) | in-component | **redirect** ⚠️ |
| `/a/ended` | `src/app/(external)/a/ended/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **none** |
| `/a/expired` | `src/app/(external)/a/expired/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **none** |
| `/a/home` | `src/app/(external)/a/home/page.tsx` | server | inherited-from-layout | guest (grant token) | in-component | **redirect** ⚠️ |
| `/a/process/[scopeItemId]` | `src/app/(external)/a/process/[scopeItemId]/page.tsx` | server | inherited-from-layout | guest (grant token) | in-component | **redirect** ⚠️ |
| `/a/stream/[streamId]` | `src/app/(external)/a/stream/[streamId]/page.tsx` | server | inherited-from-layout | guest (grant token) | in-component | **redirect** ⚠️ |
| `/a/tobe` | `src/app/(external)/a/tobe/page.tsx` | server | inherited-from-layout | guest (grant token) | in-component | **redirect** ⚠️ |
| `/a/verify` | `src/app/(external)/a/verify/page.tsx` | server | inherited-from-layout | guest (grant token) | in-component | **redirect** ⚠️ |
| `/c/[token]` | `src/app/(external)/c/[token]/page.tsx` | server | inherited-from-layout | guest (grant token) | in-component | **redirect** ⚠️ |
| `/c/ended` | `src/app/(external)/c/ended/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **none** |
| `/c/expired` | `src/app/(external)/c/expired/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **none** |
| `/c/s/[scopeCode]` | `src/app/(external)/c/s/[scopeCode]/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **redirect** ⚠️ |
| `/c/s/[scopeCode]/signed` | `src/app/(external)/c/s/[scopeCode]/signed/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **redirect** ⚠️ |
| `/c/verify` | `src/app/(external)/c/verify/page.tsx` | server | inherited-from-layout | guest (grant token) | none | **redirect** ⚠️ |
| `/d/[token]` | `src/app/(external)/d/[token]/page.tsx` | server | metadata | guest (grant token) | none | **redirect** ⚠️ |
| `/d/ended` | `src/app/(external)/d/ended/page.tsx` | server | metadata | guest (grant token) | none | **notFound** |
| `/d/expired` | `src/app/(external)/d/expired/page.tsx` | server | metadata | guest (grant token) | none | **notFound** |
| `/d/export` | `src/app/(external)/d/export/page.tsx` | server | metadata | guest (grant token) | in-component | **redirect** ⚠️ |
| `/d/home` | `src/app/(external)/d/home/page.tsx` | server | metadata | guest (grant token) | in-component | **redirect** ⚠️ |
| `/d/process/[pid]` | `src/app/(external)/d/process/[pid]/page.tsx` | server | metadata | guest (grant token) | in-component | **redirect** ⚠️ |
| `/d/stream/[id]` | `src/app/(external)/d/stream/[id]/page.tsx` | server | metadata | guest (grant token) | in-component | **redirect** ⚠️ |
| `/d/summary` | `src/app/(external)/d/summary/page.tsx` | server | metadata | guest (grant token) | in-component | **redirect** ⚠️ |
| `/d/verify` | `src/app/(external)/d/verify/page.tsx` | server | metadata | guest (grant token) | in-component | **redirect** ⚠️ |

#### Route group `(auth)` — 5 pages, 1 redirect-gated

Unauthenticated by design. `/dev-login` additionally `notFound()`s unless `isDevLoginEnabled()` (`src/app/(auth)/dev-login/page.tsx:38-40`) and is **deleted from a production build** (§E14).

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/dev-login` | `src/app/(auth)/dev-login/page.tsx` | server | metadata | anonymous | none | **notFound** |
| `/invitations/[token]` | `src/app/(auth)/invitations/[token]/page.tsx` | client | inherited-from-layout | anonymous | none | **none** |
| `/login` | `src/app/(auth)/login/page.tsx` | client | inherited-from-layout | anonymous | none | **none** |
| `/signup` | `src/app/(auth)/signup/page.tsx` | client | inherited-from-layout | anonymous | none | **none** |
| `/verify-mfa` | `src/app/(auth)/verify-mfa/page.tsx` | server | inherited-from-layout | anonymous | in-component | **redirect** ⚠️ |

#### Route group `(public)` — 4 pages, 0 redirect-gated

No guard.

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/pricing` | `src/app/(public)/pricing/page.tsx` | server | inherited-from-layout | anonymous | none | **none** |
| `/privacy` | `src/app/(public)/privacy/page.tsx` | server | metadata — "Privacy Policy" | anonymous | none | **none** |
| `/terms` | `src/app/(public)/terms/page.tsx` | server | metadata — "Terms of Service" | anonymous | none | **none** |
| `/verify/[token]` | `src/app/(public)/verify/[token]/page.tsx` | server | inherited-from-layout | anonymous | none | **notFound** |

#### Route group `(portal-customer)` — 1 pages, 0 redirect-gated

Share-token view; guard is in-page.

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/assessments/[shareToken]` | `src/app/(portal-customer)/assessments/[shareToken]/page.tsx` | server | inherited-from-layout | share-link holder | in-component | **notFound** |

#### Route group `(workbench-public)` — 2 pages, 0 redirect-gated

The Workbench's own pre-auth sign-in. Excluded from the session bridge (`src/middleware.ts:322-325`).

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/presales/login` | `src/app/(workbench-public)/presales/login/page.tsx` | server | metadata | anonymous | none | **none** |
| `/presales/login/confirm` | `src/app/(workbench-public)/presales/login/confirm/page.tsx` | server | metadata | anonymous | none | **none** |

#### Route group `(root)` — 3 pages, 1 redirect-gated

`/`, `/offline`, `/design-system`.

| Path | File | Component | Metadata | Roles | Gating | Gating style |
|---|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | server | inherited-from-layout | anonymous | in-component | **redirect** ⚠️ |
| `/design-system` | `src/app/design-system/page.tsx` | client | inherited-from-layout | anonymous | none | **none** |
| `/offline` | `src/app/offline/page.tsx` | client | inherited-from-layout | anonymous | none | **none** |

### B5 · Every API route under `src/app/api/**`

**316 route handlers.** Command: `find src/app/api -name 'route.ts' | wc -l` → 316. (A further 19 `route.ts` handlers live outside `/api`, under the `(external)` guest groups — `find src/app -name 'route.ts' | grep -v '^src/app/api/'`. They are out of the scope of this question but are the guest POST surfaces for `/c`, `/a`, `/d`.)

Method list = exported `GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS` handlers. *Authenticates* = the credential the handler actually checks. *Authorises against* = the predicate applied after identity. *Audit row* = the file calls one of `writeConfigAudit | recordNorthboundCall | *AuditEvent.create | logActivity | recordCronRun`.

**Totals by credential** (a route can appear under more than one): session 131 · session+assessment ACL 118 · session+assessment ACL (report helper) 18 · session+admin 23 · session+ops role 8 · session+Control-Tower role 7 · session+probe guard 7 · bearer client token 4 · write-key header 1 · `CRON_SECRET` 4 · dev-seed secret 2 · env secret 2 · internal shared secret 1 · WebAuthn assertion 1 · NextAuth handler 1 · none-by-design 4 (`/api/health`, `/api/[...notFound]`, `/api/auth/signup`, `/api/auth/webauthn/authenticate/options`).

**Audit rows:** 35 of 316 route files write one.

#### northbound broker — 4 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/northbound/interfaces` | GET | bearer(client token) | org scope (tenant-scope) | **yes** | `src/app/api/northbound/interfaces/route.ts` |
| `/api/northbound/interfaces/[id]/data` | GET | bearer(client token) | ApiAccessGrant(READ) | **yes** | `src/app/api/northbound/interfaces/[id]/data/route.ts` |
| `/api/northbound/interfaces/[id]/data/write` | POST | bearer(client token) + header(write key) | ApiAccessGrant(WRITE) | **yes** | `src/app/api/northbound/interfaces/[id]/data/write/route.ts` |
| `/api/northbound/interfaces/[id]/schema` | GET | bearer(client token) | org scope (tenant-scope) | **yes** | `src/app/api/northbound/interfaces/[id]/schema/route.ts` |

#### CoreEdge Studio — 13 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/studio/access-grants` | GET, POST, PATCH | session | canAccessStudio, canMutateStudio | **yes** | `src/app/api/studio/access-grants/route.ts` |
| `/api/studio/clients` | GET, POST, PATCH | session | canAccessStudio, canMutateStudio, org scope (tenant-scope) | **yes** | `src/app/api/studio/clients/route.ts` |
| `/api/studio/clients/write-credential` | POST | session | canAccessStudio, canMutateStudio, org scope (tenant-scope) | **yes** | `src/app/api/studio/clients/write-credential/route.ts` |
| `/api/studio/connections` | GET, POST, PATCH | session | canAccessStudio, canMutateStudio | **yes** | `src/app/api/studio/connections/route.ts` |
| `/api/studio/connections/[id]/test` | POST | session | canAccessStudio, canMutateStudio | **yes** | `src/app/api/studio/connections/[id]/test/route.ts` |
| `/api/studio/interfaces` | POST, GET, PATCH | session | canAccessStudio, canMutateStudio | **yes** | `src/app/api/studio/interfaces/route.ts` |
| `/api/studio/interfaces/[id]/capture-fixture` | POST | session | canAccessStudio, canMutateStudio, org scope (tenant-scope) | **yes** | `src/app/api/studio/interfaces/[id]/capture-fixture/route.ts` |
| `/api/studio/interfaces/[id]/capture-schema` | POST | session | canAccessStudio, canMutateStudio, org scope (tenant-scope) | **yes** | `src/app/api/studio/interfaces/[id]/capture-schema/route.ts` |
| `/api/studio/interfaces/[id]/scaffold` | GET | session | canAccessStudio | no | `src/app/api/studio/interfaces/[id]/scaffold/route.ts` |
| `/api/studio/solutions` | GET, POST, PATCH | session | canAccessStudio, canMutateStudio | **yes** | `src/app/api/studio/solutions/route.ts` |
| `/api/studio/tenant` | GET | session | — | no | `src/app/api/studio/tenant/route.ts` |
| `/api/studio/test-cases` | GET, POST, DELETE | session | canAccessStudio, canMutateStudio | **yes** | `src/app/api/studio/test-cases/route.ts` |
| `/api/studio/test/broker-run` | POST | session | canAccessStudio, ApiAccessGrant(READ), Solution.status, org scope (tenant-scope) | **yes** | `src/app/api/studio/test/broker-run/route.ts` |

#### CoreEdge Operations — 9 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/ops/broker-traffic` | GET | session+opsRole | org scope (opsWhere) | **yes** | `src/app/api/ops/broker-traffic/route.ts` |
| `/api/ops/catalogue-health` | GET | session+admin | — | no | `src/app/api/ops/catalogue-health/route.ts` |
| `/api/ops/connections-health` | GET | session+opsRole | org scope (opsWhere) | no | `src/app/api/ops/connections-health/route.ts` |
| `/api/ops/connections-health/probe` | POST | session+opsRole | — | no | `src/app/api/ops/connections-health/probe/route.ts` |
| `/api/ops/incidents` | GET | session+opsRole | org scope (opsWhere) | no | `src/app/api/ops/incidents/route.ts` |
| `/api/ops/jobs` | GET | session+opsRole | — | no | `src/app/api/ops/jobs/route.ts` |
| `/api/ops/throttle` | GET | session+opsRole | org scope (opsWhere) | no | `src/app/api/ops/throttle/route.ts` |
| `/api/ops/tokens` | GET | session+opsRole | org scope (opsWhere) | no | `src/app/api/ops/tokens/route.ts` |
| `/api/ops/write-ledger` | GET | session+opsRole | org scope (opsWhere) | no | `src/app/api/ops/write-ledger/route.ts` |

#### CoreEdge Control Tower — 7 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/control-tower/audit` | GET | session+controlTowerRole | org scope (opsWhere) | no | `src/app/api/control-tower/audit/route.ts` |
| `/api/control-tower/connections` | GET | session+controlTowerRole | org scope (opsWhere) | no | `src/app/api/control-tower/connections/route.ts` |
| `/api/control-tower/grants` | GET, PATCH | session + session+controlTowerRole | canMutateControlTower, org scope (opsWhere) | **yes** | `src/app/api/control-tower/grants/route.ts` |
| `/api/control-tower/grants/[grantId]/revoke` | POST | session + session+controlTowerRole | canMutateControlTower, org scope (opsWhere) | **yes** | `src/app/api/control-tower/grants/[grantId]/revoke/route.ts` |
| `/api/control-tower/portfolio` | GET | session+controlTowerRole | org scope (opsWhere) | no | `src/app/api/control-tower/portfolio/route.ts` |
| `/api/control-tower/tokens` | GET | session+controlTowerRole | org scope (opsWhere) | no | `src/app/api/control-tower/tokens/route.ts` |
| `/api/control-tower/usage` | GET | session+controlTowerRole | org scope (opsWhere) | no | `src/app/api/control-tower/usage/route.ts` |

#### CoreEdge shared — 1 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/console/topology` | GET | session+workspaceRole (lens-selected guard) | org scope (opsWhere) | no | `src/app/api/console/topology/route.ts` |

#### SAP connectors — 15 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/sap/ariba/call` | GET | session + session+probeGuard | — | no | `src/app/api/sap/ariba/call/route.ts` |
| `/api/sap/ariba/catalog` | GET | session | — | no | `src/app/api/sap/ariba/catalog/route.ts` |
| `/api/sap/tdd/capabilities` | GET | session + session+probeGuard | — | no | `src/app/api/sap/tdd/capabilities/route.ts` |
| `/api/sap/tdd/catalog` | GET | session | — | no | `src/app/api/sap/tdd/catalog/route.ts` |
| `/api/sap/tdd/entities` | GET | session + session+probeGuard | — | no | `src/app/api/sap/tdd/entities/route.ts` |
| `/api/sap/tdd/hub-content` | GET | session + session+probeGuard | isAdminRole | no | `src/app/api/sap/tdd/hub-content/route.ts` |
| `/api/sap/tdd/hub-content/[id]` | GET | session + session+probeGuard | — | no | `src/app/api/sap/tdd/hub-content/[id]/route.ts` |
| `/api/sap/tdd/hub-content/api-reference-import` | POST | session+admin | — | no | `src/app/api/sap/tdd/hub-content/api-reference-import/route.ts` |
| `/api/sap/tdd/hub-content/harvest-import` | POST | session+admin | — | no | `src/app/api/sap/tdd/hub-content/harvest-import/route.ts` |
| `/api/sap/tdd/hub-content/probe-all` | POST | session+admin | — | no | `src/app/api/sap/tdd/hub-content/probe-all/route.ts` |
| `/api/sap/tdd/hub-content/seed` | POST | session+admin | — | no | `src/app/api/sap/tdd/hub-content/seed/route.ts` |
| `/api/sap/tdd/hub-content/write-test` | POST | session+admin | — | no | `src/app/api/sap/tdd/hub-content/write-test/route.ts` |
| `/api/sap/tdd/operations` | GET | session + session+probeGuard | — | no | `src/app/api/sap/tdd/operations/route.ts` |
| `/api/sap/tdd/preview` | GET | session + session+probeGuard | — | no | `src/app/api/sap/tdd/preview/route.ts` |
| `/api/sap/tdd/write` | GET, POST | session+admin | — | no | `src/app/api/sap/tdd/write/route.ts` |

#### cron — 4 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/cron/analytics` | GET | CRON_SECRET | — | **yes** | `src/app/api/cron/analytics/route.ts` |
| `/api/cron/connection-probes` | GET | CRON_SECRET | — | **yes** | `src/app/api/cron/connection-probes/route.ts` |
| `/api/cron/northbound-reap` | GET | CRON_SECRET | — | **yes** | `src/app/api/cron/northbound-reap/route.ts` |
| `/api/cron/trials` | GET | CRON_SECRET | — | **yes** | `src/app/api/cron/trials/route.ts` |

#### auth — 12 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/auth/[...nextauth]` | — | next-auth handler | — | no | `src/app/api/auth/[...nextauth]/route.ts` |
| `/api/auth/bridge` | GET | session(next-auth) | — | no | `src/app/api/auth/bridge/route.ts` |
| `/api/auth/logout` | GET, POST | session cookie (self-revoke) | — | no | `src/app/api/auth/logout/route.ts` |
| `/api/auth/signup` | POST | none (public signup) | — | no | `src/app/api/auth/signup/route.ts` |
| `/api/auth/test-login` | POST | env secret | — | no | `src/app/api/auth/test-login/route.ts` |
| `/api/auth/verify-izzat` | POST | env secret (simulation bridge) | — | no | `src/app/api/auth/verify-izzat/route.ts` |
| `/api/auth/webauthn/authenticate/options` | POST | none (public, pre-auth) | — | no | `src/app/api/auth/webauthn/authenticate/options/route.ts` |
| `/api/auth/webauthn/authenticate/verify` | POST | webauthn assertion | — | no | `src/app/api/auth/webauthn/authenticate/verify/route.ts` |
| `/api/auth/webauthn/credentials` | GET | session | — | no | `src/app/api/auth/webauthn/credentials/route.ts` |
| `/api/auth/webauthn/credentials/[credentialId]` | DELETE, PATCH | session | — | no | `src/app/api/auth/webauthn/credentials/[credentialId]/route.ts` |
| `/api/auth/webauthn/register/options` | GET | session | — | no | `src/app/api/auth/webauthn/register/options/route.ts` |
| `/api/auth/webauthn/register/verify` | POST | session | — | no | `src/app/api/auth/webauthn/register/verify/route.ts` |

#### dev backdoors — 2 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/dev/seed-affirm` | GET | dev-seed guard (secret query param) | — | no | `src/app/api/dev/seed-affirm/route.ts` |
| `/api/dev/seed-presales-test` | GET | dev-seed guard (secret query param) | — | **yes** | `src/app/api/dev/seed-presales-test/route.ts` |

#### admin — 16 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/admin/adaptation-patterns` | GET, POST | session+admin | — | no | `src/app/api/admin/adaptation-patterns/route.ts` |
| `/api/admin/adaptation-patterns/[patternId]` | GET, PUT, DELETE | session+admin | — | no | `src/app/api/admin/adaptation-patterns/[patternId]/route.ts` |
| `/api/admin/assessments` | GET | session+admin | — | no | `src/app/api/admin/assessments/route.ts` |
| `/api/admin/baselines` | GET, POST | session+admin | — | no | `src/app/api/admin/baselines/route.ts` |
| `/api/admin/baselines/[baselineId]` | GET, PUT, DELETE | session+admin | — | no | `src/app/api/admin/baselines/[baselineId]/route.ts` |
| `/api/admin/conversation-templates` | POST | session+admin | — | no | `src/app/api/admin/conversation-templates/route.ts` |
| `/api/admin/conversation-templates/[templateId]` | PUT | session+admin | — | no | `src/app/api/admin/conversation-templates/[templateId]/route.ts` |
| `/api/admin/extensibility-patterns` | GET, POST | session+admin | — | no | `src/app/api/admin/extensibility-patterns/route.ts` |
| `/api/admin/extensibility-patterns/[patternId]` | GET, PUT, DELETE | session+admin | — | no | `src/app/api/admin/extensibility-patterns/[patternId]/route.ts` |
| `/api/admin/industries` | GET, POST | session+admin | — | no | `src/app/api/admin/industries/route.ts` |
| `/api/admin/industries/[industryId]` | GET, PUT, DELETE | session+admin | — | no | `src/app/api/admin/industries/[industryId]/route.ts` |
| `/api/admin/organizations` | GET | session+admin | — | no | `src/app/api/admin/organizations/route.ts` |
| `/api/admin/organizations/[orgId]/plan` | PUT | session+admin | — | no | `src/app/api/admin/organizations/[orgId]/plan/route.ts` |
| `/api/admin/overview` | GET | session+admin | — | no | `src/app/api/admin/overview/route.ts` |
| `/api/admin/users` | POST | session+admin | — | no | `src/app/api/admin/users/route.ts` |
| `/api/admin/users/[userId]` | PATCH, DELETE | session+admin | — | no | `src/app/api/admin/users/[userId]/route.ts` |

#### assessments — 140 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/assessments/[id]` | GET, PATCH, DELETE | session+assessmentACL | — | no | `src/app/api/assessments/[id]/route.ts` |
| `/api/assessments/[id]/activity` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/activity/route.ts` |
| `/api/assessments/[id]/analyze` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/analyze/route.ts` |
| `/api/assessments/[id]/change-requests` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/change-requests/route.ts` |
| `/api/assessments/[id]/change-requests/[crId]` | GET, PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/change-requests/[crId]/route.ts` |
| `/api/assessments/[id]/clone` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/clone/route.ts` |
| `/api/assessments/[id]/comments` | GET, POST | session+assessmentACL | — | **yes** | `src/app/api/assessments/[id]/comments/route.ts` |
| `/api/assessments/[id]/comments/[commentId]` | PUT, DELETE | session+assessmentACL | — | no | `src/app/api/assessments/[id]/comments/[commentId]/route.ts` |
| `/api/assessments/[id]/comments/[commentId]/resolve` | PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/comments/[commentId]/resolve/route.ts` |
| `/api/assessments/[id]/config/[configActivityId]` | PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/config/[configActivityId]/route.ts` |
| `/api/assessments/[id]/conflicts` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/conflicts/route.ts` |
| `/api/assessments/[id]/conflicts/[conflictId]/escalate` | PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/conflicts/[conflictId]/escalate/route.ts` |
| `/api/assessments/[id]/conflicts/[conflictId]/resolve` | PUT | session+assessmentACL | — | **yes** | `src/app/api/assessments/[id]/conflicts/[conflictId]/resolve/route.ts` |
| `/api/assessments/[id]/conversation/[scopeItemId]` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/conversation/[scopeItemId]/route.ts` |
| `/api/assessments/[id]/conversation/[scopeItemId]/complete` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/conversation/[scopeItemId]/complete/route.ts` |
| `/api/assessments/[id]/conversation/[scopeItemId]/respond` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/conversation/[scopeItemId]/respond/route.ts` |
| `/api/assessments/[id]/conversation/sessions` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/conversation/sessions/route.ts` |
| `/api/assessments/[id]/data-migration` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/data-migration/route.ts` |
| `/api/assessments/[id]/data-migration/[objectId]` | PUT, DELETE | session+assessmentACL | — | no | `src/app/api/assessments/[id]/data-migration/[objectId]/route.ts` |
| `/api/assessments/[id]/data-migration/dependency-graph` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/data-migration/dependency-graph/route.ts` |
| `/api/assessments/[id]/data-migration/summary` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/data-migration/summary/route.ts` |
| `/api/assessments/[id]/dependencies` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/dependencies/route.ts` |
| `/api/assessments/[id]/dependencies/undo` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/dependencies/undo/route.ts` |
| `/api/assessments/[id]/flows` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/flows/route.ts` |
| `/api/assessments/[id]/flows/[flowId]` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/flows/[flowId]/route.ts` |
| `/api/assessments/[id]/flows/[flowId]/interactive` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/flows/[flowId]/interactive/route.ts` |
| `/api/assessments/[id]/flows/[flowId]/pdf` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/flows/[flowId]/pdf/route.ts` |
| `/api/assessments/[id]/flows/export/[scopeItemId]` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/flows/export/[scopeItemId]/route.ts` |
| `/api/assessments/[id]/flows/overview` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/flows/overview/route.ts` |
| `/api/assessments/[id]/flows/overview/regenerate` | POST | session+assessmentACL | hasPermission | no | `src/app/api/assessments/[id]/flows/overview/regenerate/route.ts` |
| `/api/assessments/[id]/flows/scope/[scopeItemId]` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/flows/scope/[scopeItemId]/route.ts` |
| `/api/assessments/[id]/flows/scope/[scopeItemId]/regenerate` | POST | session+assessmentACL | hasPermission | no | `src/app/api/assessments/[id]/flows/scope/[scopeItemId]/regenerate/route.ts` |
| `/api/assessments/[id]/gap-workspace` | GET | session | — | no | `src/app/api/assessments/[id]/gap-workspace/route.ts` |
| `/api/assessments/[id]/gaps` | GET | session + session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/route.ts` |
| `/api/assessments/[id]/gaps/[gapId]` | PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/[gapId]/route.ts` |
| `/api/assessments/[id]/gaps/[gapId]/alternatives` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/[gapId]/alternatives/route.ts` |
| `/api/assessments/[id]/gaps/[gapId]/alternatives/[altId]` | PUT, DELETE | session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/[gapId]/alternatives/[altId]/route.ts` |
| `/api/assessments/[id]/gaps/[gapId]/approve` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/[gapId]/approve/route.ts` |
| `/api/assessments/[id]/gaps/[gapId]/suggest` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/[gapId]/suggest/route.ts` |
| `/api/assessments/[id]/gaps/rollup` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/rollup/route.ts` |
| `/api/assessments/[id]/gaps/suggest` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/gaps/suggest/route.ts` |
| `/api/assessments/[id]/handoff/alm-exports` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/handoff/alm-exports/route.ts` |
| `/api/assessments/[id]/handoff/packages` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/handoff/packages/route.ts` |
| `/api/assessments/[id]/hierarchy/progress` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/hierarchy/progress/route.ts` |
| `/api/assessments/[id]/integrations` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/integrations/route.ts` |
| `/api/assessments/[id]/integrations/[integrationId]` | PUT, DELETE | session+assessmentACL | — | no | `src/app/api/assessments/[id]/integrations/[integrationId]/route.ts` |
| `/api/assessments/[id]/integrations/summary` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/integrations/summary/route.ts` |
| `/api/assessments/[id]/locks` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/locks/route.ts` |
| `/api/assessments/[id]/locks/acquire` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/locks/acquire/route.ts` |
| `/api/assessments/[id]/locks/refresh` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/locks/refresh/route.ts` |
| `/api/assessments/[id]/locks/release` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/locks/release/route.ts` |
| `/api/assessments/[id]/ocm` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/ocm/route.ts` |
| `/api/assessments/[id]/ocm/[impactId]` | PUT, DELETE | session+assessmentACL | — | no | `src/app/api/assessments/[id]/ocm/[impactId]/route.ts` |
| `/api/assessments/[id]/ocm/heatmap` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/ocm/heatmap/route.ts` |
| `/api/assessments/[id]/ocm/summary` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/ocm/summary/route.ts` |
| `/api/assessments/[id]/passes` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/passes/route.ts` |
| `/api/assessments/[id]/passes/[passId]/diff/[priorPassId]` | GET | session | — | no | `src/app/api/assessments/[id]/passes/[passId]/diff/[priorPassId]/route.ts` |
| `/api/assessments/[id]/passes/[passId]/modules` | GET | session | — | no | `src/app/api/assessments/[id]/passes/[passId]/modules/route.ts` |
| `/api/assessments/[id]/passes/[passId]/modules/[module]/approve` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/passes/[passId]/modules/[module]/approve/route.ts` |
| `/api/assessments/[id]/passes/[passId]/modules/[module]/sample` | GET | session | — | no | `src/app/api/assessments/[id]/passes/[passId]/modules/[module]/sample/route.ts` |
| `/api/assessments/[id]/phases` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/phases/route.ts` |
| `/api/assessments/[id]/phases/[phase]` | PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/phases/[phase]/route.ts` |
| `/api/assessments/[id]/phases/recalculate` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/phases/recalculate/route.ts` |
| `/api/assessments/[id]/presence` | POST, GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/presence/route.ts` |
| `/api/assessments/[id]/presence/heartbeat` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/presence/heartbeat/route.ts` |
| `/api/assessments/[id]/profile` | GET, PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/profile/route.ts` |
| `/api/assessments/[id]/qa/anomalies` | GET | session | — | no | `src/app/api/assessments/[id]/qa/anomalies/route.ts` |
| `/api/assessments/[id]/remaining` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/remaining/route.ts` |
| `/api/assessments/[id]/remaining/auto-generate` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/remaining/auto-generate/route.ts` |
| `/api/assessments/[id]/report/audit-trail` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/audit-trail/route.ts` |
| `/api/assessments/[id]/report/branding` | GET, PUT | session+assessmentACL | hasRole | no | `src/app/api/assessments/[id]/report/branding/route.ts` |
| `/api/assessments/[id]/report/branding/logo` | POST | session+assessmentACL | hasRole | no | `src/app/api/assessments/[id]/report/branding/logo/route.ts` |
| `/api/assessments/[id]/report/complete-package` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/complete-package/route.ts` |
| `/api/assessments/[id]/report/config-workbook` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/config-workbook/route.ts` |
| `/api/assessments/[id]/report/dm-register` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/dm-register/route.ts` |
| `/api/assessments/[id]/report/effort-estimate` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/effort-estimate/route.ts` |
| `/api/assessments/[id]/report/executive-summary` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/executive-summary/route.ts` |
| `/api/assessments/[id]/report/flow-atlas` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/flow-atlas/route.ts` |
| `/api/assessments/[id]/report/gap-register` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/gap-register/route.ts` |
| `/api/assessments/[id]/report/history` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/history/route.ts` |
| `/api/assessments/[id]/report/integration-register` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/integration-register/route.ts` |
| `/api/assessments/[id]/report/ocm-report` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/ocm-report/route.ts` |
| `/api/assessments/[id]/report/readiness-scorecard` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/readiness-scorecard/route.ts` |
| `/api/assessments/[id]/report/remaining-register` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/remaining-register/route.ts` |
| `/api/assessments/[id]/report/requirements-findings` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/requirements-findings/route.ts` |
| `/api/assessments/[id]/report/sap-best-practice-classification` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/sap-best-practice-classification/route.ts` |
| `/api/assessments/[id]/report/scope-catalog` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/scope-catalog/route.ts` |
| `/api/assessments/[id]/report/sign-off` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/report/sign-off/route.ts` |
| `/api/assessments/[id]/report/step-detail` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/step-detail/route.ts` |
| `/api/assessments/[id]/report/traceability-matrix` | GET | session+assessmentACL(report) | — | no | `src/app/api/assessments/[id]/report/traceability-matrix/route.ts` |
| `/api/assessments/[id]/requirements/[reqId]` | PATCH | session+assessmentACL | — | no | `src/app/api/assessments/[id]/requirements/[reqId]/route.ts` |
| `/api/assessments/[id]/requirements/[reqId]/provenance` | GET | session | — | no | `src/app/api/assessments/[id]/requirements/[reqId]/provenance/route.ts` |
| `/api/assessments/[id]/requirements/export` | GET | session | — | no | `src/app/api/assessments/[id]/requirements/export/route.ts` |
| `/api/assessments/[id]/scope` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/scope/route.ts` |
| `/api/assessments/[id]/scope/[scopeItemId]` | PUT | session+assessmentACL | — | **yes** | `src/app/api/assessments/[id]/scope/[scopeItemId]/route.ts` |
| `/api/assessments/[id]/scope/[scopeItemId]/granularity` | PATCH | session+assessmentACL | — | no | `src/app/api/assessments/[id]/scope/[scopeItemId]/granularity/route.ts` |
| `/api/assessments/[id]/scope/bulk` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/scope/bulk/route.ts` |
| `/api/assessments/[id]/scope/impact` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/scope/impact/route.ts` |
| `/api/assessments/[id]/scope/pre-select` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/scope/pre-select/route.ts` |
| `/api/assessments/[id]/scope/upgrade-suggestions` | GET | session | — | no | `src/app/api/assessments/[id]/scope/upgrade-suggestions/route.ts` |
| `/api/assessments/[id]/scope/warnings` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/scope/warnings/route.ts` |
| `/api/assessments/[id]/share-links` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/share-links/route.ts` |
| `/api/assessments/[id]/sign-off` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/sign-off/route.ts` |
| `/api/assessments/[id]/sign-off/area-validation` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/sign-off/area-validation/route.ts` |
| `/api/assessments/[id]/sign-off/cross-functional` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/sign-off/cross-functional/route.ts` |
| `/api/assessments/[id]/sign-off/executive` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/sign-off/executive/route.ts` |
| `/api/assessments/[id]/sign-off/partner` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/sign-off/partner/route.ts` |
| `/api/assessments/[id]/sign-off/start` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/sign-off/start/route.ts` |
| `/api/assessments/[id]/sign-off/technical-validation` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/sign-off/technical-validation/route.ts` |
| `/api/assessments/[id]/snapshots` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/snapshots/route.ts` |
| `/api/assessments/[id]/snapshots/compare` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/snapshots/compare/route.ts` |
| `/api/assessments/[id]/stakeholders` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/stakeholders/route.ts` |
| `/api/assessments/[id]/steps` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/steps/route.ts` |
| `/api/assessments/[id]/steps/[stepId]` | PUT | session+assessmentACL | — | **yes** | `src/app/api/assessments/[id]/steps/[stepId]/route.ts` |
| `/api/assessments/[id]/steps/[stepId]/history` | GET | session + session+assessmentACL | — | no | `src/app/api/assessments/[id]/steps/[stepId]/history/route.ts` |
| `/api/assessments/[id]/steps/bulk` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/steps/bulk/route.ts` |
| `/api/assessments/[id]/steps/bulk-all` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/steps/bulk-all/route.ts` |
| `/api/assessments/[id]/stream` | GET | session + session+assessmentACL | — | no | `src/app/api/assessments/[id]/stream/route.ts` |
| `/api/assessments/[id]/transitions` | GET, POST | session+assessmentACL | — | **yes** | `src/app/api/assessments/[id]/transitions/route.ts` |
| `/api/assessments/[id]/transitions/history` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/transitions/history/route.ts` |
| `/api/assessments/[id]/triggers` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/triggers/route.ts` |
| `/api/assessments/[id]/triggers/[triggerId]` | PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/triggers/[triggerId]/route.ts` |
| `/api/assessments/[id]/workshops` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]` | GET, PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/action-items` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/action-items/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/action-items/[itemId]` | PUT, DELETE | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/action-items/[itemId]/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/attendees` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/attendees/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/attendees/follow` | PUT | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/attendees/follow/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/attendees/heartbeat` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/attendees/heartbeat/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/cancel` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/cancel/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/end` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/end/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/minutes` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/minutes/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/navigate` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/navigate/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/start` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/start/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/stream` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/stream/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/votes` | GET, POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/votes/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/votes/[processStepId]` | GET | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/votes/[processStepId]/route.ts` |
| `/api/assessments/[id]/workshops/[sessionId]/votes/[processStepId]/finalize` | POST | session+assessmentACL | — | no | `src/app/api/assessments/[id]/workshops/[sessionId]/votes/[processStepId]/finalize/route.ts` |
| `/api/assessments/from-preset` | POST | session | — | no | `src/app/api/assessments/from-preset/route.ts` |
| `/api/assessments/from-template/[templateId]` | POST | session | — | no | `src/app/api/assessments/from-template/[templateId]/route.ts` |

#### presales / affirm / discovery — 34 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/affirm/bundles` | POST | session | — | no | `src/app/api/affirm/bundles/route.ts` |
| `/api/affirm/bundles/[id]/grants` | GET, POST | session | — | no | `src/app/api/affirm/bundles/[id]/grants/route.ts` |
| `/api/affirm/bundles/[id]/grants/[grantId]/reissue` | POST | session | — | no | `src/app/api/affirm/bundles/[id]/grants/[grantId]/reissue/route.ts` |
| `/api/affirm/bundles/[id]/grants/[grantId]/revoke` | POST | session | — | no | `src/app/api/affirm/bundles/[id]/grants/[grantId]/revoke/route.ts` |
| `/api/affirm/bundles/[id]/issue` | POST | session | — | no | `src/app/api/affirm/bundles/[id]/issue/route.ts` |
| `/api/affirm/bundles/[id]/questions` | POST | session | — | no | `src/app/api/affirm/bundles/[id]/questions/route.ts` |
| `/api/affirm/bundles/[id]/questions/[qid]` | PUT, DELETE | session | — | no | `src/app/api/affirm/bundles/[id]/questions/[qid]/route.ts` |
| `/api/affirm/bundles/[id]/release` | POST | session | — | no | `src/app/api/affirm/bundles/[id]/release/route.ts` |
| `/api/affirm/bundles/[id]/responses` | PUT | session | — | no | `src/app/api/affirm/bundles/[id]/responses/route.ts` |
| `/api/affirm/bundles/[id]/scope` | PUT | session | — | no | `src/app/api/affirm/bundles/[id]/scope/route.ts` |
| `/api/affirm/bundles/[id]/submit` | POST | session | — | no | `src/app/api/affirm/bundles/[id]/submit/route.ts` |
| `/api/affirm/sample` | POST | session | — | no | `src/app/api/affirm/sample/route.ts` |
| `/api/affirm/tree` | GET | session | — | no | `src/app/api/affirm/tree/route.ts` |
| `/api/discovery/captures` | POST | session | — | no | `src/app/api/discovery/captures/route.ts` |
| `/api/discovery/gaps` | POST | session | — | no | `src/app/api/discovery/gaps/route.ts` |
| `/api/discovery/packs/[id]` | GET | session | — | no | `src/app/api/discovery/packs/[id]/route.ts` |
| `/api/discovery/product-map` | POST | session | — | no | `src/app/api/discovery/product-map/route.ts` |
| `/api/discovery/sessions` | POST | session | — | no | `src/app/api/discovery/sessions/route.ts` |
| `/api/discovery/sessions/[id]/drive` | POST | session | — | no | `src/app/api/discovery/sessions/[id]/drive/route.ts` |
| `/api/discovery/sessions/[id]/grants` | POST | session + guest grant token | — | no | `src/app/api/discovery/sessions/[id]/grants/route.ts` |
| `/api/discovery/sessions/[id]/notes` | POST | session | — | no | `src/app/api/discovery/sessions/[id]/notes/route.ts` |
| `/api/presales/bundles` | POST | session | — | **yes** | `src/app/api/presales/bundles/route.ts` |
| `/api/presales/bundles/[bundleId]/audit.csv` | GET | session | — | no | `src/app/api/presales/bundles/[bundleId]/audit.csv/route.ts` |
| `/api/presales/bundles/[bundleId]/branding` | POST | session | — | **yes** | `src/app/api/presales/bundles/[bundleId]/branding/route.ts` |
| `/api/presales/bundles/[bundleId]/extend` | POST | session | — | **yes** | `src/app/api/presales/bundles/[bundleId]/extend/route.ts` |
| `/api/presales/bundles/[bundleId]/grants/[grantId]/email` | POST | session | — | **yes** | `src/app/api/presales/bundles/[bundleId]/grants/[grantId]/email/route.ts` |
| `/api/presales/bundles/[bundleId]/revoke` | POST | session | — | **yes** | `src/app/api/presales/bundles/[bundleId]/revoke/route.ts` |
| `/api/presales/change-requests` | POST | session | — | **yes** | `src/app/api/presales/change-requests/route.ts` |
| `/api/presales/funnel` | GET | session | — | no | `src/app/api/presales/funnel/route.ts` |
| `/api/presales/grants/[grantId]/reissue` | POST | session | — | **yes** | `src/app/api/presales/grants/[grantId]/reissue/route.ts` |
| `/api/presales/preferences` | POST | session | — | no | `src/app/api/presales/preferences/route.ts` |
| `/api/presales/sign-pdf` | POST | internal shared secret header | — | no | `src/app/api/presales/sign-pdf/route.ts` |
| `/api/tobe/[bundleId]/export` | GET | session | — | no | `src/app/api/tobe/[bundleId]/export/route.ts` |
| `/api/tobe/[bundleId]/generate` | POST | session | — | no | `src/app/api/tobe/[bundleId]/generate/route.ts` |

#### portal (everything else) — 59 routes

| Path | Methods | Authenticates with | Authorises against | Audit row | File |
|---|---|---|---|---|---|
| `/api/[...notFound]` | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS | none (404 catch-all) | — | no | `src/app/api/[...notFound]/route.ts` |
| `/api/analytics/benchmarks/[assessmentId]` | GET | session + session+assessmentACL | — | no | `src/app/api/analytics/benchmarks/[assessmentId]/route.ts` |
| `/api/analytics/cross-phase` | POST | session | — | no | `src/app/api/analytics/cross-phase/route.ts` |
| `/api/analytics/cross-phase/[assessmentId]` | GET | session + session+assessmentACL | — | no | `src/app/api/analytics/cross-phase/[assessmentId]/route.ts` |
| `/api/analytics/portfolio` | GET | session | — | no | `src/app/api/analytics/portfolio/route.ts` |
| `/api/assessments` | GET, POST | session | — | no | `src/app/api/assessments/route.ts` |
| `/api/brownfield-guides/[guideId]/content` | GET | session | — | no | `src/app/api/brownfield-guides/[guideId]/content/route.ts` |
| `/api/catalog-versions` | GET | session | — | no | `src/app/api/catalog-versions/route.ts` |
| `/api/catalog/config-activities` | GET | session | — | no | `src/app/api/catalog/config-activities/route.ts` |
| `/api/catalog/scope-items/[scopeItemId]/activities/[activityId]/steps` | GET | session | — | no | `src/app/api/catalog/scope-items/[scopeItemId]/activities/[activityId]/steps/route.ts` |
| `/api/catalog/scope-items/[scopeItemId]/configs` | GET | session | — | no | `src/app/api/catalog/scope-items/[scopeItemId]/configs/route.ts` |
| `/api/catalog/scope-items/[scopeItemId]/hierarchy` | GET | session | — | no | `src/app/api/catalog/scope-items/[scopeItemId]/hierarchy/route.ts` |
| `/api/catalog/scope-items/[scopeItemId]/html` | GET | session | — | no | `src/app/api/catalog/scope-items/[scopeItemId]/html/route.ts` |
| `/api/catalog/scope-items/[scopeItemId]/steps` | GET | session | — | no | `src/app/api/catalog/scope-items/[scopeItemId]/steps/route.ts` |
| `/api/catalog/setup-guide/[scopeItemId]` | GET | session | — | no | `src/app/api/catalog/setup-guide/[scopeItemId]/route.ts` |
| `/api/dashboard` | GET | session | — | no | `src/app/api/dashboard/route.ts` |
| `/api/dashboard/activity` | GET | session | — | no | `src/app/api/dashboard/activity/route.ts` |
| `/api/dashboard/attention` | GET | session | — | no | `src/app/api/dashboard/attention/route.ts` |
| `/api/dashboard/conflicts` | GET | session | — | no | `src/app/api/dashboard/conflicts/route.ts` |
| `/api/dashboard/deadlines` | GET, POST | session + session+assessmentACL | — | no | `src/app/api/dashboard/deadlines/route.ts` |
| `/api/dashboard/deadlines/[deadlineId]` | PUT | session + session+assessmentACL | — | no | `src/app/api/dashboard/deadlines/[deadlineId]/route.ts` |
| `/api/dashboard/heatmap/[assessmentId]` | GET | session + session+assessmentACL | — | no | `src/app/api/dashboard/heatmap/[assessmentId]/route.ts` |
| `/api/dashboard/kpi/[assessmentId]` | GET | session + session+assessmentACL | — | no | `src/app/api/dashboard/kpi/[assessmentId]/route.ts` |
| `/api/dashboard/widgets` | PUT | session | — | no | `src/app/api/dashboard/widgets/route.ts` |
| `/api/health` | GET | none (public liveness probe) | — | no | `src/app/api/health/route.ts` |
| `/api/invitations/[token]/accept` | POST | session | — | no | `src/app/api/invitations/[token]/accept/route.ts` |
| `/api/notifications` | GET | session | — | no | `src/app/api/notifications/route.ts` |
| `/api/notifications/[id]/dismiss` | PUT | session | — | no | `src/app/api/notifications/[id]/dismiss/route.ts` |
| `/api/notifications/[id]/read` | PUT | session | — | no | `src/app/api/notifications/[id]/read/route.ts` |
| `/api/notifications/preferences` | GET, PUT | session | — | no | `src/app/api/notifications/preferences/route.ts` |
| `/api/notifications/push-subscription` | POST, DELETE | session | — | no | `src/app/api/notifications/push-subscription/route.ts` |
| `/api/notifications/read-all` | PUT | session | — | no | `src/app/api/notifications/read-all/route.ts` |
| `/api/notifications/stream` | GET | session | — | no | `src/app/api/notifications/stream/route.ts` |
| `/api/notifications/unread-count` | GET | session | — | no | `src/app/api/notifications/unread-count/route.ts` |
| `/api/onboarding` | GET | session | — | no | `src/app/api/onboarding/route.ts` |
| `/api/onboarding/complete` | POST | session | — | no | `src/app/api/onboarding/complete/route.ts` |
| `/api/onboarding/progress` | PUT | session | — | no | `src/app/api/onboarding/progress/route.ts` |
| `/api/onboarding/sample-assessment` | POST | session | — | no | `src/app/api/onboarding/sample-assessment/route.ts` |
| `/api/onboarding/start` | POST | session | — | no | `src/app/api/onboarding/start/route.ts` |
| `/api/onboarding/tooltips` | GET | session | — | no | `src/app/api/onboarding/tooltips/route.ts` |
| `/api/onboarding/tooltips/dismiss` | POST | session | — | no | `src/app/api/onboarding/tooltips/dismiss/route.ts` |
| `/api/organizations/[orgId]` | GET, PUT | session | — | no | `src/app/api/organizations/[orgId]/route.ts` |
| `/api/organizations/[orgId]/ai-config` | PUT | session | — | no | `src/app/api/organizations/[orgId]/ai-config/route.ts` |
| `/api/organizations/[orgId]/invitations` | GET, DELETE | session | — | no | `src/app/api/organizations/[orgId]/invitations/route.ts` |
| `/api/organizations/[orgId]/sso` | GET, PUT | session | hasPermission | no | `src/app/api/organizations/[orgId]/sso/route.ts` |
| `/api/organizations/[orgId]/users` | GET, POST | session | — | no | `src/app/api/organizations/[orgId]/users/route.ts` |
| `/api/organizations/[orgId]/users/[userId]` | PUT | session | — | no | `src/app/api/organizations/[orgId]/users/[userId]/route.ts` |
| `/api/partner/settings` | GET | session | hasRole | no | `src/app/api/partner/settings/route.ts` |
| `/api/partner/settings/profile` | PUT | session | hasRole | no | `src/app/api/partner/settings/profile/route.ts` |
| `/api/partner/settings/subscription` | GET | session | hasRole | no | `src/app/api/partner/settings/subscription/route.ts` |
| `/api/partner/settings/usage` | GET | session | hasRole | no | `src/app/api/partner/settings/usage/route.ts` |
| `/api/performance/report` | POST | session | — | no | `src/app/api/performance/report/route.ts` |
| `/api/push/subscribe` | POST, DELETE | session | — | no | `src/app/api/push/subscribe/route.ts` |
| `/api/roles` | GET | session | — | no | `src/app/api/roles/route.ts` |
| `/api/search` | GET | session | — | no | `src/app/api/search/route.ts` |
| `/api/sync` | POST | session | — | no | `src/app/api/sync/route.ts` |
| `/api/templates` | POST, GET | session | — | no | `src/app/api/templates/route.ts` |
| `/api/templates/[templateId]` | DELETE | session | — | no | `src/app/api/templates/[templateId]/route.ts` |
| `/api/workshops/join` | POST | session | — | no | `src/app/api/workshops/join/route.ts` |

### B6 · The three CoreEdge console areas as they are named today

The names in the code are exactly **Developer Studio**, **Operations Center** and **Control Tower** — declared once as data in `src/lib/studio/rbac.ts:56-80` (`WORKSPACES`), with their purpose sentences stored beside the labels because the refusal screen is shared (`:44-53`).

They are one product with three RBAC-gated route groups, each with its own layout, its own role predicate and its own rail inventory, deliberately duplicated rather than shared (`src/app/(operations)/layout.tsx:4-7`).

| Area | Route group | Layout | Role predicate | Rail inventory | Chrome |
|---|---|---|---|---|---|
| Developer Studio | `src/app/(studio)` | `src/app/(studio)/layout.tsx:51-120` | `canAccessStudio` — `consultant` + `platform_admin` (`src/lib/studio/rbac.ts:92-95`); mutation is `canMutateStudio` = `consultant` only (`:102-104`) | `STUDIO_SECTIONS`, 7 entries (`src/lib/studio/sections.ts:43-51`) | `StudioShell` + `StudioRail` + `StudioTopBar` |
| Operations Center | `src/app/(operations)` | `src/app/(operations)/layout.tsx:45-103` | `canAccessOperations` — `support` + `platform_admin` (`src/lib/studio/rbac.ts:114-117`) | `OPERATIONS_SECTIONS`, 8 entries, one `adminOnly` (`src/lib/studio/sections.ts:58-81`) | same `StudioShell`, `OpsChrome` inside |
| Control Tower | `src/app/(control-tower)` | `src/app/(control-tower)/layout.tsx:44-95` | `canAccessControlTower` — `platform_admin`, `partner_lead`, `executive_sponsor`, `project_manager`; **not** `support` (`src/lib/studio/rbac.ts:127-136`) | `CONTROL_TOWER_SECTIONS`, 7 entries (`src/lib/studio/sections.ts:84-92`) | same `StudioShell`, `GovernanceChrome` inside |

**Which routes belong to each** (from `src/lib/studio/sections.ts`, each `href` confirmed against a `page.tsx`):

- **Developer Studio** — `/studio`, `/studio/discover`, `/studio/solutions`, `/studio/connections`, `/studio/access` ("API Access"), `/studio/interfaces`, `/studio/test` ("Test Console"). `src/lib/studio/sections.ts:44-50`.
- **Operations Center** — `/operations`, `/operations/traffic`, `/operations/connections`, `/operations/incidents`, `/operations/writes`, `/operations/throttle`, `/operations/tokens`, `/operations/catalogue` (**`adminOnly: true`**, removed from the rail for non-admins rather than refused — `src/lib/studio/sections.ts:74-80`, `src/app/(operations)/layout.tsx:86-88`). `src/lib/studio/sections.ts:59-81`.
- **Control Tower** — `/control-tower`, `/control-tower/portfolio`, `/control-tower/grants`, `/control-tower/audit`, `/control-tower/connections`, `/control-tower/tokens`, `/control-tower/usage`. `src/lib/studio/sections.ts:85-91`.

**Roughly how many components each pulls in.** Computed by resolving `@/…` imports transitively from every `page.tsx` + `layout.tsx` in each group (`deps.mjs`, scratch):

| Area | Entry files | Reachable `@/` modules | Under `src/components/` | Under `src/lib/` |
|---|---|---|---|---|
| Developer Studio | 8 | 72 | **18** (`studio` 12, `sap` 2, `ops` 2, `affirm` 2) | 39 |
| Operations Center | 9 | 56 | **15** (`ops` 11, `studio` 3, `sap` 1) | 29 |
| Control Tower | 8 | 53 | **13** (`control-tower` 6, `ops` 3, `studio` 3, `sap` 1) | 29 |

On disk the three own directories hold 14 / 11 / 6 `.tsx` files respectively (`ls src/components/{studio,ops,control-tower} | wc -l`). The cross-imports are real coupling: Operations and Control Tower both import Studio's `StudioShell`, `StudioTopBar` and `RoleGatedEmptyState`, and Studio imports `src/components/sap/SapCapabilityCatalogue` plus `AffirmLearnProvider` — the latter only because the reused catalogue components throw without that context (`src/app/(studio)/layout.tsx:16-18`).

---
## C. Data model

The whole schema is one file: `prisma/schema.prisma`, 6281 lines, **191 models** (`grep -c '^model ' prisma/schema.prisma`) and **10 enums** (`grep -c '^enum '`). The northbound chain is a contiguous block, `prisma/schema.prisma:646-1198`.

### C7 · Every model in the northbound chain

Line ranges from `awk '/^model X \{/{s=NR} /^\}/{print s"-"NR}' prisma/schema.prisma`.

#### `SapConnection` — `prisma/schema.prisma:646-716` (the SAP connection)

`id`, `organizationId`, `product` (`"s4hana" | "successfactors" | "ariba"` — free string, `:650-651`), `key`, `label`, `baseUrl`, `authType` (`"basic" | "bearer" | "oauth-client-credentials"`, `:659-660`), **`environment String?`** (`:663` — free text, `NULL` = unknown and renders no chip, `:661-666`), `oauthTokenUrl String?`, **`secretsCiphertext String @db.Text`** (AES-256-GCM, never returned, `:666-667`), `client String?` (the SAP client "100"/"080", `:669-684`), `writeEnabled Boolean @default(false)` (`:685-686`), `apiPath String?`, `timeoutMs Int?`, `lastValidatedAt DateTime?` (moves **only** on a real 200, `:690-692`), `lastValidationStatus String?` (`:693-697`), `isActive Boolean @default(true)`, `createdAt`, `updatedAt`.
Relation: `organization Organization` (cascade delete, `:702`).
**Enum values are not an enum here** — `product`, `authType`, `environment` and `lastValidationStatus` are all `String`. `lastValidationStatus` vocabulary, from its own doc comment `:693-694`: `OK | UNAUTHORIZED | NOT_FOUND | TIMEOUT | ERROR` and `NULL` = `NEVER_TESTED`. The runtime type adds a sixth, `NO_PROBE_PATH` (`src/lib/studio/connection-health.ts:31-37`) — the schema comment does not list it; the ops route does (`src/app/api/ops/connections-health/route.ts:5-7,37-38`).

#### `Solution` — `prisma/schema.prisma:732-763` (the solution passport)

`id`, `organizationId`, `name`, `slug`, `classification SolutionKind`, `businessProblem`, **`status SolutionStatus @default(DRAFT)`** (`:741`), `dataClass`, `technicalOwnerId?`, `businessOwnerId?`, `supportOwnerId?`, `repoUrl?`, `packagingNote?`, `reuseIntent?`, `createdAt`, `updatedAt`.
Relations: `interfaces Interface[]` (`:750`), `grants ApiAccessGrant[]` (`:751`), `organization` (cascade).
**No `environment` field.** A solution is landscape-agnostic; environment lives on the credential and the grant.

#### `Interface` — `prisma/schema.prisma:766-805` (the data feed / governed config)

`id`, `solutionId`, `organizationId`, `name`, `version Int @default(1)`, `sapProduct String` (validated against `getSapProduct` at the API boundary, never a hand-kept enum, `:776-781`), `externalId String` (the catalogue apiId), **`operation String`** — `READ | CREATE | UPDATE` (`:784-785`), `entitySet String?`, **`mode String`** — `READ | WRITE` (`:787`), `requestSchema Json?`, `responseSchema Json?`, `mappingVersion Int?` (always null in v1, `:791`), **`status String @default("DRAFT")`** — `DRAFT | ACTIVE | DEPRECATED` (`:793-794`), `createdAt`, `updatedAt`.
Relations: `solution Solution` (cascade), `testCases TestCase[]`.
**No `environment` field**, and `status`/`operation`/`mode` are `String`, not enums.

#### `ApiAccessGrant` — `prisma/schema.prisma:855-907` (the access grant)

`id`, `solutionId`, `organizationId`, `externalId`, **`operation String`** — `READ | CREATE | UPDATE` (`:861-862`), **`environment String`** — `SANDBOX | DEV | TEST | PROD`, "progressive trust" (`:863-864`), `justification String`, **`decision GrantDecision @default(REQUESTED)`** (`:867`), `requestedById String?` (segregation of duties: must differ from the decider, `:868-869`), `decidedById String?`, `decidedAt DateTime?`, `expiresAt DateTime?`, `revokedAt DateTime?`, `revokedById String?`, `revokedReason String?` (required by the API, `:894-895`), `createdAt`.
Relations: `solution Solution` (cascade), `revoker User?`.
Doc comment `:851-853`: enforced at runtime by matching `solutionId + externalId + operation + environment` on every call.

#### `SolutionClient` — `prisma/schema.prisma:971-1033` (the client token / runtime credential)

`id`, `organizationId`, `solutionId`, `label`, **`tokenHash String @unique`** (SHA-256; the raw token is never persisted, `:987-988`), **`environment String`** — `SANDBOX | DEV | TEST | PROD` (`:989-990`), `sapClient String?` (the SAP data container, part of the binding, `:992-1013`), `secretsCiphertext String? @db.Text` (the sealed write key, AAD-bound to this row, `:1015-1016`), `isActive Boolean @default(true)`, `lastUsedAt DateTime?`, `expiresAt DateTime?`, `revokedAt DateTime?`, `createdById String`, `createdAt`, `updatedAt`.
Relation: `organization` (cascade).

#### `NorthboundAuditEvent` — `prisma/schema.prisma:1037-1106` (the per-call audit)

`id`, `organizationId`, `solutionId`, `interfaceId String?`, **`operation String`** — `READ | WRITE` (`:1042-1043`), `externalId`, **`environment String`** — the *credential's* declared environment (`:1047`), `status Int` (HTTP status returned to the caller, `:1049-1050`), `rowCount Int?`, **`correlationId String`** (`:1053`), `clientTokenId String` (`:1054-1055`), **`bindingRefusal String?`** — `NO_CONNECTION | NO_MATCH_FOR_ENVIRONMENT | NO_MATCH_FOR_CLIENT | AMBIGUOUS | NO_DECLARED_CANDIDATE | UNDECLARED_ENVIRONMENT_WRITE | CONNECTION_UNREADABLE | UNKNOWN_PRODUCT` (`:1057-1070`), `connectionId String?`, **`connectionEnvironment String?`** — the *connection's* declared landscape (`:1072-1078`), `durationMs Int?`, `failureReason String?` — a bounded code matching `/^[A-Z][A-Z0-9_]+$/` (`:1084-1090`), `dryRun Boolean @default(false)` (`:1092-1098`), `at DateTime @default(now())`.
**Append-only by construction:** the module exposes a write and nothing else (`src/lib/northbound/audit.ts:9-11,87-118`); a test asserts no module anywhere edits an audit row (`tests/unit/northbound/dod-gaps.test.ts`, "the audit trail is append-only").

#### `ConfigAudit` — `prisma/schema.prisma:937-955` (the governance audit)

`id`, `organizationId`, `actorId`, **`entityType String`** — `"Solution" | "Interface" | "ApiAccessGrant" | "TestCase" | "Connection"` (`:944-945`), `entityId`, **`action String`** — `CREATE | UPDATE | PROMOTE | DECISION | TEST_CONNECT` (`:946-947`), `before Json?`, `after Json?`, `at`.

#### Supporting models in the same chain

| Model | Lines | Note |
|---|---|---|
| `SapConnectionProbeEvent` | `:814-831` | Append-only probe history. `status` uses the connection-health vocabulary (`:822-823`); `source` is `cron \| manual \| test` (`:826-827`). |
| `CronRunLog` | `:838-850` | `job` is `northbound-reap \| connection-probes \| analytics \| trials` (`:841-842`); `ok Boolean`, `summaryJson Json?`. |
| `TestCase` | `:910-933` | `lastOutcome String?` = `PASS \| FAIL \| NOT_RUN` (`:922-923`). |
| `NorthboundIdempotencyKey` | `:1120-1145` | Caller-supplied `key`, `requestHash`, `status Int?`, `responseBody Json?`, `expiresAt` (the retention horizon, `:1135-1136`). |
| `MockFixture` | `:1149-1174` | `scenario` = `"data" \| "empty" \| "needs_setup" \| "error"` (`:1156-1157`); `sourceStatus Int?` nullable on purpose (`:1160-1170`). |

#### The three enums — exact values

```prisma
enum SolutionKind {   // prisma/schema.prisma:1176-1182
  INTERNAL_ACCELERATOR
  PRESALES_DEMO
  CLIENT_APP
  REUSABLE
  EXPERIMENT
}

enum SolutionStatus {  // prisma/schema.prisma:1184-1189
  DRAFT
  ACTIVE
  RESTRICTED
  RETIRED
}

enum GrantDecision {   // prisma/schema.prisma:1191-1198
  REQUESTED
  APPROVED
  SANDBOX_ONLY
  READ_ONLY
  REJECTED
  EXPIRED
}
```

**Environment and operation are NOT enums.** `SANDBOX | DEV | TEST | PROD` and `READ | CREATE | UPDATE` are TypeScript unions only — `src/lib/studio/grants.ts:26-27,30` (`GrantEnvironment`, `GrantOperation`, `ENVIRONMENT_ORDER`) and `src/lib/northbound/issue.ts:28` (`ClientEnvironment`). The database columns are plain `String`. `GrantDecision` also has a runtime-only seventh member: `EffectiveGrantDecision = GrantDecision | "REVOKED"` (`src/lib/studio/grants.ts:282`), which is derived from `revokedAt`, never stored.

### C8 · Where `environment` lives, and every place a SAP connection is resolved from one

**Where it lives** (`grep -n '^\s*environment\s\|^\s*connectionEnvironment\s' prisma/schema.prisma`):

| Model | Column | Line | Nullable | Meaning |
|---|---|---|---|---|
| `SapConnection` | `environment` | `prisma/schema.prisma:663` | **yes** | Which landscape this connection points at. `NULL` is the documented "unbackfilled estate" state. |
| `ApiAccessGrant` | `environment` | `prisma/schema.prisma:864` | no | Which landscape the grant authorises. |
| `SolutionClient` | `environment` | `prisma/schema.prisma:990` | no | The trust level the credential runs at. Part of its unique key. |
| `NorthboundAuditEvent` | `environment` | `prisma/schema.prisma:1047` | no | The **credential's** declared environment. |
| `NorthboundAuditEvent` | `connectionEnvironment` | `prisma/schema.prisma:1077` | yes | The **connection's** declared environment. The pair is the only way to show the two agreed. |

`Solution`, `Interface`, `ConfigAudit`, `TestCase`, `MockFixture` and `NorthboundIdempotencyKey` carry **no** environment column.

**Every place code resolves a SAP connection from an environment:**

| Function | File:line | Called from |
|---|---|---|
| `resolveSapConnectionForEnvironment(organizationId, product, environment, operation, sapClient?)` | `src/lib/sap-public/connection-resolver.ts:408-446` | `src/app/api/northbound/interfaces/[id]/data/route.ts:125`; `src/app/api/northbound/interfaces/[id]/data/write/route.ts:191`; `src/app/api/studio/test/broker-run/route.ts:173` |
| `selectConnectionForEnvironment(all, environment, operation, sapClient?)` — the pure decision, separated from the secrets | `src/lib/sap-public/connection-resolver.ts:339-406` | Called by `resolveSapConnectionForEnvironment` at `:446`, and directly by the Test Console binding **preview** at `src/app/(studio)/studio/test/page.tsx:112` |
| `listBindableConnections(organizationId, product)` — metadata-only rows for that preview | `src/lib/sap-public/connection-resolver.ts:305-315` | `src/app/(studio)/studio/test/page.tsx:82` |
| `normalizedEnvironmentOf(conn)` — the case/trim normalisation the match uses | `src/lib/sap-public/connection-resolver.ts:317-320` | inside `selectConnectionForEnvironment` |
| `normalizeEnvironment(value)` — the same rule on the **write** path | `src/lib/sap-public/connection-resolver.ts:746-750` | `upsertSapConnection` (`:783,796`) and the twin check in `src/app/api/studio/connections/route.ts:314` |
| `resolveSapConnections(organizationId, product)` / `resolveSapConnection(organizationId, product, key)` — resolve **by key**, not by environment | `src/lib/sap-public/connection-resolver.ts:147`, `:181` | `resolveSapConnectionForEnvironment:429`; `src/lib/sap-public/tenant-for-read.ts:70`; `src/lib/ops/connection-probe-sweep.ts:120` |

The selection rule itself (`:349-405`): normalise both sides to upper case → filter to rows whose environment matches → if the credential names an `sapClient`, filter again to rows carrying **exactly** that client (never falling back to a client-less row, `:357-365`) → exactly one match wins; more than one is `AMBIGUOUS`; zero with an env match is `NO_MATCH_FOR_CLIENT`; zero undeclared rows is `NO_MATCH_FOR_ENVIRONMENT`; a WRITE never proceeds on an undeclared row (`UNDECLARED_ENVIRONMENT_WRITE`, `:389`); a READ proceeds on a single undeclared row flagged `bindingUnverified` (`:394-404`); several undeclared rows is `NO_DECLARED_CANDIDATE`.

### C9 · Uniqueness constraints that encode a rule

```prisma
// prisma/schema.prisma:713 — one connection per (org, product, key)
  @@unique([organizationId, product, key])

// prisma/schema.prisma:761 — one solution slug per organization
  @@unique([organizationId, slug])

// prisma/schema.prisma:988 — the token hash is globally unique; lookup is a single indexed equality
  tokenHash   String @unique

// prisma/schema.prisma:1029 — ONE RUNTIME CREDENTIAL PER (ORGANIZATION, SOLUTION, ENVIRONMENT) — "AD-11"
  @@unique([organizationId, solutionId, environment])

// prisma/schema.prisma:1139 — one idempotency key per (org, solution, key)
  @@unique([organizationId, solutionId, key])
```

Three of these encode a product rule rather than a storage detail:

1. **`SolutionClient @@unique([organizationId, solutionId, environment])`** — `prisma/schema.prisma:1029`. This is the answer to the question in the brief ("one credential per (solution, environment)"), and its history is in the schema comment `:973-986`: the column was `@unique` on `solutionId` alone, so an app promoted DEV → TEST → PROD could never hold two credentials and issuing the second silently killed the first. The key now includes the environment, so re-issuing for the *same* environment rotates and a different environment adds a credential beside it. `issueClientToken` upserts on exactly this key (`src/lib/northbound/issue.ts:92-98`), and the organization is deliberately inside the `where` so the update branch cannot escape the tenant (`:86-91`).

2. **`SapConnection @@unique([organizationId, product, key])`** — `prisma/schema.prisma:713 `, plus **a partial unique index Prisma cannot express**, declared in the schema comment `:706-712` and created by hand-written SQL:

```sql
-- prisma/migrations/20260731010000_connection_binding_tuple/migration.sql:31-34
CREATE UNIQUE INDEX "SapConnection_active_binding_tuple"
  ON "SapConnection" ("organizationId", "product", "environment", "client")
  NULLS NOT DISTINCT
  WHERE "isActive" AND "environment" IS NOT NULL;
```

   This is the rule "two ACTIVE connections must never be indistinguishable to the binding" — otherwise `resolveSapConnectionForEnvironment` refuses every request for that environment as `AMBIGUOUS`. **`prisma db push` does not create it** (schema comment `:711-712`), so a database provisioned by `db:push` — which is what CI does, `.github/workflows/ci.yml:69-70` — silently lacks the invariant. The route has a pre-check that produces a readable message instead of a raw 23505 (`src/app/api/studio/connections/route.ts:297-336`).

3. **`NorthboundIdempotencyKey @@unique([organizationId, solutionId, key])`** — `prisma/schema.prisma:1139`. Encodes "a caller-supplied key is unique within its solution"; the accompanying `requestHash` column is what turns key reuse with a different body into a `409 CONFLICT` rather than a silent replay (`:1112-1118`).

---
## D. Status, copy and tokens

### D10 · Every status/state string rendered in the UI today

Nine distinct vocabularies are rendered. Several say the same thing in different words; those are grouped at the end.

#### 1 · Honest status — the CoreEdge probe vocabulary (8 literals)

Source: a TypeScript union, `src/lib/studio/honest-status.ts:10-31`. Labels and accessible meanings: `src/components/studio/StudioStatusChip.tsx:37-58`.

| Literal | Rendered label | Accessible meaning | Token pair |
|---|---|---|---|
| `ACTIVATED` | "Activated" | "a live probe returned 200" | `--status-signed-*` |
| `NEEDS_SETUP` | "Needs setup" | "401 or 403 — communication arrangement not set up" | `--status-awaiting-*` |
| `AVAILABLE` | "Available" | "event or subscribe-only; not pulled" | `--status-sent-*` |
| `NOT_PROBEABLE` | "Not probeable" | "no OData endpoint to probe" | `--status-expired-*` |
| `PROBE_FAILED` | "Probe failed" | "the attempt errored — re-run it" | `--status-expired-*` |
| `REFERENCE` | "Reference" | "design-time content" | `--status-draft-*` |
| `NOT_CHECKED` | "Not checked" | "not yet probed" | `--status-nocheck-*` |
| `NOT_FOUND` | "Not found" | "404 — not in this tenant" | `--status-revoked-*` |

Rendered by: `src/components/studio/StudioStatusChip.tsx:86-128`, and reached from `src/components/studio/SolutionsClient.tsx:190`, `InterfacesClient.tsx:158`, `ConnectionsClient.tsx:265`, `AccessGrantsClient.tsx:243`, `TestConsoleClient.tsx`, `src/components/sap/SapCapabilityCatalogue.tsx`, `src/components/sap/capability/StatusBadge.tsx`.
Note `NOT_PROBEABLE` and `PROBE_FAILED` share a token pair — two meanings, one colour (`StudioStatusChip.tsx:30-31`).

#### 2 · `SolutionStatus` — the solution lifecycle (4 literals, a Prisma enum)

Source: `prisma/schema.prisma:1184-1189`. Chip mapping + labels + meanings: `src/components/studio/SolutionsClient.tsx:54-77`.

| Literal | Label | Meaning shown | Borrowed chip tone |
|---|---|---|---|
| `ACTIVE` | "Active" | "registered and in use" | `ACTIVATED` |
| `DRAFT` | "Draft" | "registered, not yet promoted" | `NOT_CHECKED` |
| `RESTRICTED` | "Restricted" | "governance-limited by an admin" | `NEEDS_SETUP` |
| `RETIRED` | "Retired" | "no longer in use" | `NOT_PROBEABLE` |

Rendered in: `src/components/studio/SolutionsClient.tsx:190`, `src/components/control-tower/PortfolioClient.tsx`, and the raw literals appear in `src/app/(studio)/studio/solutions/page.tsx`.

#### 3 · `Interface.status` — the interface lifecycle (3 literals, a **string** column)

Source: `prisma/schema.prisma:793-794` (`DRAFT | ACTIVE | DEPRECATED`). Mapping: `src/components/studio/InterfacesClient.tsx:63-72`. The visible label is `i.status.toLowerCase()` — "active", "draft", "deprecated" — while the other screens title-case theirs (`InterfacesClient.tsx:158`).

| Literal | Meaning shown | Borrowed chip tone |
|---|---|---|
| `ACTIVE` | "serving runtime calls" | `ACTIVATED` |
| `DRAFT` | "defined, not yet activated" | `NOT_CHECKED` |
| `DEPRECATED` | "kept for the record, not for new use" | `NOT_PROBEABLE` |

#### 4 · `GrantDecision` — the access decision (6 enum values + 1 derived)

Source: `prisma/schema.prisma:1191-1198`; the derived seventh is `EffectiveGrantDecision = GrantDecision | "REVOKED"` (`src/lib/studio/grants.ts:282`), computed from `revokedAt`, never stored. Labels: `src/components/studio/AccessGrantsClient.tsx:92-98`; action verbs `:109-112`.

| Literal | Label | Source |
|---|---|---|
| `REQUESTED` | "Requested" | enum |
| `APPROVED` | "Approved" | enum |
| `SANDBOX_ONLY` | "Sandbox only" | enum |
| `READ_ONLY` | "Read only" | enum |
| `REJECTED` | "Rejected" | enum |
| `EXPIRED` | "Expired" | enum |
| `REVOKED` | "Revoked" | **derived** from `revokedAt` |

Control Tower renders the same decisions but adds a separate **"what it authorises"** chip because a decision label is not a permission — "read + write" / "read" / "nothing" (`src/components/control-tower/GovernanceChrome.tsx:133-147`), plus a "Revoked" chip (`src/components/control-tower/GrantsClient.tsx:144`).

#### 5 · Connection health (6 literals + 1 absence)

Source: `src/lib/studio/connection-health.ts:31-37` (`OK | UNAUTHORIZED | NOT_FOUND | TIMEOUT | ERROR | NO_PROBE_PATH`); the seventh, `NEVER_TESTED`, is `lastValidationStatus === null` and is **not a probe result** (`src/app/api/ops/connections-health/route.ts:8-12`).

Rendered twice, differently:

- **Studio** relabels only `OK` → **"Reachable"** and shows every other status under its **honest-status** name (`src/components/studio/ConnectionsClient.tsx:103-105,265`). Beside it, a literal freshness sentence: `` `last 200 · <date>` `` or **"never returned 200"** (`:267-271`).
- **Operations** shows the **raw upper-case code** as the label — "OK", "UNAUTHORIZED", "NO_PROBE_PATH" (`src/components/ops/ConnectionsHealthClient.tsx:91-103`) — and rolls them into four buckets: **"Healthy"**, **"Needs attention"** (`UNAUTHORIZED · NOT_FOUND · TIMEOUT · ERROR`), **"Unknown"** (`NO_PROBE_PATH`), plus `NEVER_TESTED` counted separately (`:190-210`, `src/app/api/ops/connections-health/route.ts:37-38`).

#### 6 · Presales lifecycle (7 literals, hardcoded)

`src/components/ui/status-pill.tsx:13-40`: `draft`→"Draft", `sent`→"Sent", `awaiting_signoff`→"Awaiting signoff", `signed`→"Signed", `expired`→"Expired", `revoked`→"Revoked", `superseded`→"Superseded".

#### 7 · Ops tone vocabulary (6 literals, presentation only)

`src/components/ops/OpsChrome.tsx:20-29`: `good | attention | bad | neutral | info | muted`, each mapped to the same `--status-*` token pairs. The label is never optional — colour alone fails AA (`:32-36`).

#### 8 · Incident severity (3 literals, derived)

`src/lib/ops/incidents.ts:118-232`: `critical` (`binding-refused`, `unbounded-grant`, `unaccountable-prod-grant`), `major` (`connection-unhealthy`, `upstream-errors`, `credential-without-expiry`, `connection-drift`), `minor` (`throttled`, `expiring-credential`, `undeclared-environment`). Nine rules total.

#### 9 · Catalogue freshness (3 literals, derived)

`src/lib/sap-public/catalogue-health.ts:10,31-34`: `CURRENT | STALE | NEVER_IMPORTED`, where STALE means the newest row is older than `CATALOGUE_STALE_AFTER_DAYS = 183` (`:20`) — one SAP half-yearly release cycle (`src/app/api/ops/catalogue-health/route.ts:172`).

#### Smaller vocabularies

| Literals | Source | Where |
|---|---|---|
| `PASS \| FAIL \| NOT_RUN` | `TestCase.lastOutcome`, string column | `prisma/schema.prisma:922-923` |
| `"data" \| "empty" \| "needs_setup" \| "error"` | `MockFixture.scenario` | `prisma/schema.prisma:1156-1157` |
| `OK \| EMPTY \| NEEDS_SETUP \| NOT_FOUND \| TIMEOUT \| ERROR` | `NorthboundReadStatus`, derived from the upstream HTTP status | `src/lib/northbound/read.ts:84-113`, `httpStatusFor` `src/lib/northbound/read.ts:211-226` → 200/200/403/404/504/502 |
| `CREATED \| NEEDS_SETUP \| NOT_FOUND \| REJECTED \| TIMEOUT \| ERROR` | `NorthboundWriteStatus` | `src/lib/northbound/write.ts`; `writeHttpStatusFor` `:244-260` → 201/403/404/422/504/502 |
| `cron \| manual \| test` | `SapConnectionProbeEvent.source` | `prisma/schema.prisma:826-827` |
| `CREATE \| UPDATE \| PROMOTE \| DECISION \| TEST_CONNECT` | `ConfigAudit.action` | `prisma/schema.prisma:946-947` |
| `SANDBOX \| DEV \| TEST \| PROD` | environment; a TS union, **not** an enum | `src/lib/studio/grants.ts:26,30` |
| `READ \| CREATE \| UPDATE` (grant/interface operation) and `READ \| WRITE` (interface mode, audit operation) | TS unions + string columns | `src/lib/studio/grants.ts:27`, `prisma/schema.prisma:784-787,1042-1043` |

#### Identical meanings, different wording — the groups the redesign must collapse

| Meaning | Competing wordings |
|---|---|
| "a live probe returned 200" | **"Activated"** (`StudioStatusChip.tsx:38`) · **"Reachable"** (`ConnectionsClient.tsx:104`) · **"OK"** (`ConnectionsHealthClient.tsx:91`) · **"Healthy"** (`ConnectionsHealthClient.tsx:197`) |
| "credentials rejected / not set up" | **"Needs setup"** (`StudioStatusChip.tsx:39`) · **"UNAUTHORIZED"** (`ConnectionsHealthClient.tsx:94`) · **"Needs attention"** as a bucket (`:199`) · `NEEDS_SETUP` in the broker (`src/lib/northbound/read.ts:97-109`) |
| "never probed" | **"Not checked"** (`StudioStatusChip.tsx:44`) · **`NEVER_TESTED`** (`prisma/schema.prisma:693-694`, `src/app/api/ops/connections-health/route.ts:9-12`) · **"never returned 200"** (`ConnectionsClient.tsx:270`) |
| "no longer in use / ended" | **"Retired"** (solution, `SolutionsClient.tsx:64`) · **"Deprecated"** (interface, `InterfacesClient.tsx:65`) · **"Expired"** and **"Revoked"** (grant, `AccessGrantsClient.tsx:97-98`) · **"Superseded"** (presales, `status-pill.tsx:39`) |
| "not yet promoted" | **"Draft"** for a solution (`SolutionsClient.tsx:62`) · lower-case **"draft"** for an interface (`InterfacesClient.tsx:158`) · **"Draft"** for a presales bundle (`status-pill.tsx:33`) |
| "unknown" | **"Not probeable"** (terminal) vs **"Probe failed"** (retryable) — a distinction the catalogue vocabulary drew and the Studio one initially did not (`src/lib/studio/honest-status.ts:20-27`); both still share one colour |

There is also a **casing inconsistency**: Studio's interface chip lower-cases (`InterfacesClient.tsx:158`), Studio's solution chip title-cases (`SolutionsClient.tsx:190`), Operations shows raw SCREAMING_SNAKE (`ConnectionsHealthClient.tsx:91-103`).

### D11 · User-facing error and refusal messages on the northbound / broker path

Response envelope: `{ error: { code, message, correlationId } }` with `x-correlation-id` and `cache-control: no-store` headers (`src/lib/northbound/respond.ts:48-66`). Error code union at `:18-42`.

#### Authentication (all collapse to one 401)

| Message | HTTP | Code | File:line |
|---|---|---|---|
| "Missing or invalid client token." | 401 | `UNAUTHENTICATED` | `src/lib/northbound/respond.ts:69-76` |

Internally distinguished as `NO_TOKEN \| UNKNOWN_TOKEN \| INACTIVE \| REVOKED \| EXPIRED \| SOLUTION_RETIRED \| SOLUTION_MISSING` (`src/lib/northbound/auth.ts:56-80`) and logged (`src/app/api/northbound/interfaces/[id]/data/route.ts:54`), but never told to the caller — "telling an attacker 'that token existed but is revoked' is a free oracle" (`src/lib/northbound/auth.ts:118-122`).

#### Authorisation — the grant gate (`src/lib/northbound/access.ts`)

| Message | HTTP | Reason code | File:line |
|---|---|---|---|
| "No such interface." | 404 | `INTERFACE_NOT_FOUND` | `access.ts:229-235` (read), `:113-115` (write) |
| "No such interface." *(same text, deliberately)* | 404 | `NOT_THIS_SOLUTION` | `access.ts:237-245`, `:116-119` |
| "This interface is configured for writes, which this API does not serve." | 403 | `WRITE_NOT_SERVED` | `access.ts:247-253` |
| "This interface is configured for reads. Writing through it is not permitted." | 403 | `READ_ONLY_INTERFACE` | `access.ts:120-126` |
| "This interface has been deprecated. Ask the solution's builder for its replacement." | 403 | `INTERFACE_DEPRECATED` | `access.ts:257-263` |
| "This interface is `<STATUS>`. Only an ACTIVE interface may write." | 403 | `INTERFACE_NOT_ACTIVE` | `access.ts:127-136` |
| "No approved access grant for this capability in `<ENV>`." | 403 | `NO_APPROVED_GRANT` | `access.ts:279-285` |
| "No approved WRITE grant for this capability in `<ENV>`." | 403 | `NO_APPROVED_GRANT` | `access.ts:153-159` |
| "The access grant for this capability in `<ENV>` has been revoked." | 403 | `GRANT_REVOKED` | `access.ts:293-300` |
| "The WRITE grant for this capability in `<ENV>` has been revoked." | 403 | `GRANT_REVOKED` | `access.ts:170-177` |
| "The access grant for this capability in `<ENV>` has expired." | 403 | `GRANT_EXPIRED` | `access.ts:304-311` |
| "The WRITE grant for this capability in `<ENV>` has expired." | 403 | `GRANT_EXPIRED` | `access.ts:179-186` |

All returned to the caller with code `FORBIDDEN` / `NOT_FOUND` at `src/app/api/northbound/interfaces/[id]/data/route.ts:98,111-116` and `.../write/route.ts:165-176`.

#### Connection binding (`connectionRefusalMessage`, `src/lib/sap-public/connection-resolver.ts:447-481`) — all 403 `CONNECTION_NOT_CONFIGURED`

| Reason | Message (abridged) | Line |
|---|---|---|
| `NO_CONNECTION` | "No SAP connection is configured for this organization and product." | `:450-451` |
| `NO_MATCH_FOR_ENVIRONMENT` | "No SAP connection is configured for the `<ENV>` environment. This credential is bound to `<ENV>` and will not fall back to another landscape." | `:452-453` |
| `NO_MATCH_FOR_CLIENT` | "A SAP connection is configured for the `<ENV>` environment, but none of them addresses the SAP client this credential is bound to…" | `:454-455` |
| `AMBIGUOUS` | "More than one SAP connection could serve the `<ENV>` environment, so none was chosen…" | `:456-457` |
| `NO_DECLARED_CANDIDATE` | "No SAP connection declares the `<ENV>` environment, and more than one connection has not declared its environment at all…" | `:458-459` |
| `UNDECLARED_ENVIRONMENT_WRITE` | "This organization's SAP connection has not declared which environment it is, so a write cannot be authorised against it…" | `:460-461` |
| `CONNECTION_UNREADABLE` | "A stored SAP connection for this organization could not be read (its credentials failed to open or its auth type is unrecognised)…" | `:462-463` |
| `UNKNOWN_PRODUCT` | "This interface names an SAP product the platform does not recognise, so no connection can ever serve it…" | `:464-465` |

Returned at `src/app/api/northbound/interfaces/[id]/data/route.ts:153-158` and `.../write/route.ts:200-206`. Deliberately never names a host, URL or another organization (`connection-resolver.ts:441-446`).

#### Throttle, validation, idempotency, upstream

| Message | HTTP | Code | File:line |
|---|---|---|---|
| "Too many requests for this client credential." (+ `retry-after`) | 429 | `RATE_LIMITED` | `src/app/api/northbound/interfaces/[id]/data/route.ts:77-83`; write path `.../write/route.ts:139-142` |
| "Too many requests. Slow down and retry." | 429 | `RATE_LIMITED` | `src/app/api/northbound/interfaces/route.ts:58`; `.../schema/route.ts:59` |
| "Too many requests. Please try again later." (+ `Retry-After`) — the **edge, IP-keyed** bucket, a different envelope shape | 429 | `RATE_LIMIT_EXCEEDED` | `src/middleware.ts:281-298` |
| "No such interface." | 404 | `NOT_FOUND` | `src/app/api/northbound/interfaces/[id]/schema/route.ts:94` |
| "This interface has no entity set configured. Set one in Studio, or pass `?entity=`." | 400 | `VALIDATION_ERROR` | `src/app/api/northbound/interfaces/[id]/data/route.ts:182-189` |
| "The catalogue service for this interface could not be resolved." | 400 | `VALIDATION_ERROR` | `src/app/api/northbound/interfaces/[id]/data/route.ts:186` |
| "A valid write credential is required for this operation." | 403 | `FORBIDDEN` | `.../write/route.ts:123-129` |
| "Writes are not enabled on this SAP connection." | 403 | `FORBIDDEN` | `.../write/route.ts:210-216` |
| "An Idempotency-Key header is required for writes (8-255 chars, `[A-Za-z0-9_.:-]`). Reuse the same key when retrying." | 400 | `VALIDATION_ERROR` | `.../write/route.ts:148-156` |
| "Expected `{ record: object }`." | 400 | `VALIDATION_ERROR` | `.../write/route.ts:158-162` |
| "This Idempotency-Key was already used with a different payload or SAP destination. Use a new key for a different write." | 409 | `CONFLICT` | `.../write/route.ts:260-266` |
| "A request with this Idempotency-Key is still in progress." | 409 | `CONFLICT` | `.../write/route.ts:263-266` |
| "No entity set configured for this interface." | 400 | `VALIDATION_ERROR` | `.../write/route.ts:222-229` |

#### Upstream detail sentences (carried through as the `message`)

From `classify()` in `src/lib/northbound/read.ts:80-113`, mapped to HTTP by `httpStatusFor`:

| Detail | Upstream | HTTP | Code | Line |
|---|---|---|---|---|
| "No records. The service answered successfully and has nothing to return." | 200, 0 rows | **200** (`EMPTY`) | — | `read.ts:84` |
| "`<n>` record(s)." | 200 | 200 | — | `read.ts:86` |
| "The tenant rejected the connection's credentials (HTTP 401). The communication user's password or token is wrong or expired — a connection problem, not a missing arrangement." | 401 | 403 | `FORBIDDEN` | `read.ts:96-102` |
| "The tenant refused this read (HTTP 403): the communication arrangement is not set up, or this entity is not released to the connected user." | 403 | 403 | `FORBIDDEN` | `read.ts:103-109` |
| "The requested entity set does not exist on this tenant." | 404 | 404 | `NOT_FOUND` | `read.ts:110-111` |
| "The tenant responded with HTTP `<n>`." | other | 502 | `UPSTREAM_ERROR` | `read.ts:113` |
| "The tenant returned an invalid OData response." | 200, unparseable | 502 | `UPSTREAM_ERROR` | `read.ts:173-179` |
| "The tenant did not respond within `<n>`ms." | abort | 504 | `UPSTREAM_TIMEOUT` | `read.ts:196-198` |
| "The read could not be completed." | network/TLS | 502 | `UPSTREAM_ERROR` | `read.ts:198` |

#### Test Console (`/api/studio/test/broker-run`) — refusals travel as **200 + `outcome: "refused"`**

This route is session-authenticated, so its refusals are rendered as outcomes rather than HTTP errors (`src/app/api/studio/test/broker-run/route.ts:59-62`).

| Kind | Message | HTTP |
|---|---|---|
| `SOLUTION_RETIRED` | "This solution is RETIRED, so every call its deployed application makes is refused — this one included. Reactivate the solution to run against it." | 200 (`refused`) — `:95-101` |
| `SOLUTION_MISSING` | "The solution that owns this interface no longer exists. (This is the refusal the deployed application would receive.)" | 200 — `:99` |
| `NO_CREDENTIAL` | "This solution has no live runtime credential, so its deployed application cannot call anything. Issue one under API Access — this console runs with the same identity." / "That credential is no longer live (revoked, expired or not this solution's). Pick another, or issue one under API Access." | 200 — `:118-125` |
| `AMBIGUOUS_CREDENTIAL` | "This solution holds live credentials for `<ENVS>`. Pick which one to run as — each binds to a different system." | 200 — `:126-131` |
| `NO_ENTITY_SET` | "This interface has no entity set configured. Set one on the interface, or pass one here." / "The catalogue service for this interface could not be resolved." | 200 — `:192-200` |
| any grant / binding refusal | the same sentence as the broker, suffixed "(This is the refusal the deployed application would receive.)" | 200 — `:162-168`, `:181-187` |

And its true HTTP errors, via `studioError` (`src/lib/studio/api.ts:31`): "Sign in required." (`UNAUTHENTICATED`), "Developer Studio is role-gated." (`FORBIDDEN`), "No organization scope." (`FORBIDDEN`), "Invalid run request." (`VALIDATION_ERROR`), "Interface not found." (`NOT_FOUND`) — `broker-run/route.ts:66-84`.

### D12 · Design tokens

**Where they live.** One stylesheet, `src/app/globals.css` (743 lines), plus three small scoped sheets (`src/app/(studio)/studio-responsive.css` 118 lines, `src/app/(external)/a/affirm-external.css`, `src/app/(workbench)/affirm/affirm-responsive.css`, `src/app/(external)/d/export/discovery-export.css`). **There is no `tailwind.config.*` file** — Tailwind v4 is configured in CSS.

Structure of `globals.css`:

| Block | Lines | What |
|---|---|---|
| `@import "tailwindcss"` / `"tw-animate-css"` | `1-2` | |
| `@custom-variant dark (&:is(.dark *))` | `4` | class-based dark variant |
| `@theme inline { … }` | `6-113` | Exposes the CSS variables as Tailwind utilities: brand (`--color-navy`, `--color-cta`, `--color-cream`, `--color-ink*`), the 7 status pairs (`--color-status-*-bg/-fg`, `:39-52`), 4 radii (`:55-58`), 4 shadows (`:60-63`), the shadcn surface set, chart colours, 7 more radii and 4 more shadows |
| `:root { … }` | `114-273` | The actual values: `--brand-navy: #002B5C`, `--cta-red: #C8102E`, ink scale, `--border-default/-strong/-focus`, `--focus-ring: #C8102E`, and the **7 status token pairs** `--status-draft/sent/awaiting/signed/expired/revoked/nocheck -bg/-fg` (`:170-184`) — each with a contrast note recording why its value was darkened |
| `.dark { … }` | `274-335` | Dark palette for the **shadcn surface set** and the **assessment** status tokens (`--status-fit/configure/extend/build/adapt/pending/na`) |
| `.dark [data-cap-catalogue] { … }` | `336-370` | Dark palette for the **brand + CoreEdge status tokens** |
| `@layer base { … }` | `372-…` | Border/outline defaults, 14px base font |

**Is there a `.coreedge` scope?** **No.** `rg '\.coreedge|coreedge-' src/app/globals.css src/app/'(studio)'/studio-responsive.css` returns nothing. The console's own CSS hook is `[data-studio]` on the shell (`src/app/(studio)/studio-responsive.css:37-39`).

**Is there a dark theme?** **Yes, but it does not reach the console.** `next-themes` is wired with `attribute="class"`, `defaultTheme="light"`, `enableSystem` (`src/components/shared/Providers.tsx:34`), and `.dark` exists (`globals.css:274`). But the tokens the CoreEdge chips use — `--status-draft/sent/awaiting/signed/expired/revoked/nocheck-*`, `--brand-navy`, `--ink-*`, `--surface-*`, `--focus-ring` — are re-declared for dark **only inside `.dark [data-cap-catalogue]`** (`globals.css:336-370`), and `data-cap-catalogue` is set on exactly one element in the codebase: `src/components/sap/SapCapabilityCatalogue.tsx:454` (`rg -n 'data-cap-catalogue' src`). So in dark mode a Studio, Operations or Control Tower chip keeps its **light** background against a dark surface. This is a real gap the redesign inherits.

**Raw literal counts inside component files.** Commands and results, run from the repository root:

| What | Command | Count |
|---|---|---|
| Raw hex colours (occurrences) | `rg -o --no-filename -g 'src/components/**/*.tsx' -g 'src/components/**/*.ts' '#[0-9a-fA-F]{3,8}\b' . \| wc -l` | **239** |
| Files containing a raw hex | `rg -l -g 'src/components/**/*.tsx' -g 'src/components/**/*.ts' '#[0-9a-fA-F]{3,8}\b' . \| wc -l` | **41** |
| `rgb()` / `rgba()` | `rg -o --no-filename -g 'src/components/**/*.tsx' -g 'src/components/**/*.ts' 'rgba?\(' . \| wc -l` | **27** |
| `px` literals | `rg -o --no-filename -g 'src/components/**/*.tsx' -g 'src/components/**/*.ts' '\b[0-9]+(\.[0-9]+)?px\b' . \| wc -l` | **1343** |

Note the `px` figure undercounts the real problem: the console components pass **unitless numbers** into React inline styles (`fontSize: 11.5`, `gap: 6`, `padding: "3px 9px"` — `src/components/studio/StudioStatusChip.tsx:102-110`), which React renders as `px` but this regex does not see.

Worst offenders by raw hex (`rg -c … | sort -t: -k2 -rn | head`): `src/components/presales/EnhancedDecisionCard.tsx` (33), `src/components/dashboard/AttentionWidget.tsx` (16), `src/components/presales/NarrativeCard.tsx` (15), `src/components/flow/FlowViewerClient.tsx` (14), `src/components/audit/EventChip.tsx` (10), `src/components/workbench/WorkbenchUserMenu.tsx` (9), `src/components/dashboard/DeadlineTimeline.tsx` (9). Inside the console itself only `src/components/studio/StudioRail.tsx` appears (5).

By `px` literals the console is at the top: `src/components/studio/ConnectionsClient.tsx` (25), `src/components/ops/TopologyMap.tsx` (25), `src/components/studio/SolutionsClient.tsx` (23), `src/components/studio/InterfacesClient.tsx` (21), `src/components/studio/TestConsoleClient.tsx` (19), `src/components/studio/ClientCredentials.tsx` (18), `src/components/studio/AccessGrantsClient.tsx` (18), `src/components/ops/OpsChrome.tsx` (17).

**The styling approach is the finding.** The console shell, rail and top bar are **server components that style themselves with inline `style={{…}}` objects**, which is why the responsive pass has to use `!important` on every rule — stated explicitly at `src/app/(studio)/studio-responsive.css:23-27`. A class-based redesign cannot simply override them.

### D13 · Existing component library, and collisions with the new set

**The library directory is `src/components/ui/` — 29 files** (`ls src/components/ui | wc -l`): `accordion, alert, alert-dialog, avatar, badge, button, card, checkbox, command, dialog, gated-button, inline-error-banner, input, label, popover, progress, relative-time, safe-link, scroll-area, select, sheet, skeleton, sonner, status-pill, switch, table, tabs, textarea, tooltip`. It is shadcn-derived (`components.json` at the repo root). Beside it, three console-local chrome modules act as de-facto libraries: `src/components/studio/StudioShell.tsx` + `StudioRail.tsx` + `StudioTopBar.tsx` + `StudioStatusChip.tsx`, `src/components/ops/OpsChrome.tsx`, `src/components/control-tower/GovernanceChrome.tsx`.

**Collision check** for the proposed names. Command: for each name, `rg "\b(function|const|class)\s+<Name>\b" src` and `find src -name '<Name>.tsx'`.

| New name | Collides? | Evidence |
|---|---|---|
| `StatusChip` | **No exact collision.** Two near-names exist and both occupy the concept: `StudioStatusChip` (`src/components/studio/StudioStatusChip.tsx:86`) and `StatusPill` (`src/components/ui/status-pill.tsx:48`), plus a third `StatusPill` for the assessment domain referenced at `src/components/ui/status-pill.tsx:5-7`. Expect semantic, not symbol, conflict. |
| `GateStrip` | No | no match anywhere in `src` |
| `LaneCard` | No | no match |
| `NeedsYouRow` | No | no match |
| `CheckList` | No | no match (`Checklist` in any casing also returns nothing in `src/components`) |
| `DecisionBar` | No | no match. `DecisionCard` exists (`src/components/affirm/cards/DecisionCard.tsx`, `src/components/presales/EnhancedDecisionCard.tsx`) |
| `FieldPicker` | No | no match. `ValueStreamTreePicker` exists (`src/components/affirm/ValueStreamTreePicker.tsx`) |
| `MaskedKey` | No | no match |
| `WhyTrace` | No | no match |
| **`OpsTable`** | **YES — direct collision** | `export function OpsTable({ head, children })` at `src/components/ops/OpsChrome.tsx:291` |
| **`ConfirmDialog`** | **YES — direct collision, own file** | `src/components/shared/ConfirmDialog.tsx` |
| `Rail` | **No exact collision**, three near-names | `StudioRail` (`src/components/studio/StudioRail.tsx`), `RailHighlight` (`src/components/studio/RailHighlight.tsx`), `StepRail` (`src/components/aptus/StepRail.tsx`) |
| `TabBar` | **No exact collision**, two near-names | `MobileBottomTabBar` in **two** places: `src/components/layout/MobileBottomTabBar.tsx` and `src/components/pwa/MobileBottomTabBar.tsx` |
| `CommandBar` | No | no match. `cmdk` is a dependency (`package.json` (`cmdk`, dependencies block `:101-148`) and `src/components/ui/command.tsx` wraps it |
| `SkeletonRow` | No | no match. `src/components/ui/skeleton.tsx` exists |

Two hard collisions (`OpsTable`, `ConfirmDialog`) and four soft ones (`StatusChip`/`StudioStatusChip`+`StatusPill`, `Rail`/`StudioRail`, `TabBar`/`MobileBottomTabBar` ×2).

---
## E. The security items — state only, nothing fixed

### E14 · `/api/auth/test-login` and the dev-login route

**They exist.** `src/app/api/auth/test-login/route.ts` (214 lines) and the page wrapper `src/app/(auth)/dev-login/page.tsx` (+ `DevLoginForm.tsx`). A **second** backdoor exists beside them: `/api/auth/verify-izzat`, the "simulation bridge" (`src/app/api/auth/verify-izzat/route.ts:10-24`).

**Excluded from production builds — conditionally.** `scripts/strip-test-auth-for-production.mjs` deletes both directories from the build workspace *before* `next build` runs, so the router has no such paths:

```js
// scripts/strip-test-auth-for-production.mjs:46-49
export const TEST_AUTH_DIRS = [
  "src/app/api/auth/test-login",
  "src/app/(auth)/dev-login",
];
```

The condition (`:58-60`, `:67-69`, `:79-91`):

```js
export function isProductionDeploy(env = process.env) {
  return env.VERCEL_ENV ? env.VERCEL_ENV === "production" : env.NODE_ENV === "production";
}
export function isVercelBuild(env = process.env) { return env.VERCEL === "1"; }
// planRemoval(): act only when production AND vercel
```

So it acts **only on a Vercel production build**. A Preview deployment, a self-hosted deploy, a container build, or any non-Vercel production runtime keeps both files, and the runtime gates are the only protection there — the script's own header says so (`:32-36`). It is wired only into `vercel-build`, not `build` (`package.json:22-23`). A test pins the behaviour: `tests/unit/build/test-auth-absent-from-production.test.ts`.

**What `/api/auth/test-login` validates** — six gates, all `process.env` conditions evaluated by code that is present in any build the script did not strip:

```ts
// src/app/api/auth/test-login/route.ts:34-39   Gate 0
if (process.env.ENABLE_TEST_LOGIN_ENDPOINT !== "true") return 404;

// :42-48   Gate 1 — production kill-switch
if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_LOGIN_IN_PROD !== "true") { logBackdoorAttempt(...); return 404; }

// :50-58   Gate 2 — no secret configured ⇒ 404
const secret = process.env.E2E_TEST_SECRET; if (!secret) return 404;

// :63-66   Gate 2.5 — in production the secret must be ≥ 24 chars
if (process.env.NODE_ENV === "production" && secret.length < 24) { logBackdoorAttempt(...); return 404; }

// :71-74   Gate 2.6 — optional IP allow-list
if (!isIpAllowed(request.headers, "TEST_LOGIN_ALLOWED_IPS")) { logBackdoorAttempt(...); return 404; }

// :87-97   Gate 3 — constant-time secret comparison
if (!body.secret || body.secret.length !== secret.length || !timingSafeEqual(Buffer.from(body.secret), Buffer.from(secret))) { logBackdoorAttempt(...); return 403; }
```

Then: the email domain must be in `["abeam.test","e2e.test"]` (`:24`, `:101-108`), and the requested role must be a member of `ALL_USER_ROLES` (`:119-125`). It defaults to `TEST_USER_ROLE = "platform_admin"` (`:28`) and mints a **real** session via `createSession` (`:198`) with the production cookie options (`:207-209`).

The IP allow-list fails **closed** in production when unset — unless overridden:

```ts
// src/lib/auth/test-backdoor-guards.ts:42-55
export function isIpAllowed(headers: Headers, allowListEnv: string): boolean {
  const allowList = parseAllowList(process.env[allowListEnv]);
  if (allowList.size === 0) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST !== "true") return false;
    return true;
  }
  const ip = getClientIp(headers);
  return allowList.has(ip);
}
```

**Does it write an audit row? No.** `logBackdoorAttempt` is a `console.warn`, not a database write:

```ts
// src/lib/auth/test-backdoor-guards.ts:62-74
export function logBackdoorAttempt(params: {...}): void {
  const ip = getClientIp(params.headers);
  const ua = params.headers.get("user-agent") ?? "";
  console.warn(`[backdoor] ${params.endpoint} outcome=${params.outcome} ip=${ip} ua=...` + (params.email ? ` email=${params.email}` : ""));
}
```

The doc comment calls it "audit-logged" (`:5-10`, `:57-60`) and says the shape is "stable enough for log-based alerting", but nothing writes to `ConfigAudit`, `NorthboundAuditEvent` or any other table, and the route's own classification confirms it (`auditWrites: false`, §B5). So a successful backdoor sign-in as `platform_admin` leaves **no in-product trace** — only a Vercel runtime log line, whose retention is outside this repository.

**`/dev-login`** repeats the first three gates client-side before anyone types a secret (`src/app/(auth)/dev-login/page.tsx:38-40,47`) using `isDevLoginEnabled()` (`src/lib/auth/dev-login.ts:20-30`), and `notFound()`s when disabled.

### E15 · `/api/sap/tdd/preview`, `/entities`, `/operations`

All three are **GET**, all three make live OData calls against a customer tenant.

| | `/preview` | `/entities` | `/operations` |
|---|---|---|---|
| File | `src/app/api/sap/tdd/preview/route.ts` (76 lines) | `src/app/api/sap/tdd/entities/route.ts` (119) | `src/app/api/sap/tdd/operations/route.ts` (170) |
| Authorised by | `refuseUnlessMayProbeTenant()` — `:23-24` | same — `:54-55` | same — `:127-128` |
| Which is | session **and** `canAccessStudio(user.role)` = `consultant` ∪ `platform_admin`; 401 with no session, 403 with the wrong role, both carrying a correlation id (`src/lib/sap-public/probe-guard.ts:70-109`) | same | same |
| **Grant required?** | **No.** `ApiAccessGrant` is never consulted — `resolveReadableInterface` is not imported | **No** | **No** |
| **Audit row written?** | **No** (`auditWrites: false`) | **No** | **No** |
| **Caller chooses the entity set?** | **Yes** — `?entity=` read at `:37`, `?service=` at `:35`, `?tenant=` at `:26`, `?limit=` at `:38` | **Partly** — `?service=` at `:27`/`:70` and `?probe=1` at `:28`/`:71` fan the probe out over **every** entity set the service exposes (`:97-104`); the caller does not name one entity but triggers many | **No** — the sections come from `getSapOperations(product)` (`:156`), a server-side curated list; the caller chooses only `?product=` and `?tenant=` |
| Tenant resolution | `resolveReadTenant(envPrefix, product.key, viewer.organizationId, tenantKey)` — deployment tenants **first**, then the caller's own connections (`src/lib/sap-public/tenant-for-read.ts:57-74`) | same (`:63-68`) | same, with "omitted tenant → the first configured deployment tenant" (`:103-111`) |
| Throttle | edge `sapLive` bucket, 20/min **per IP** (`src/lib/security/rate-limit.ts:222`, `:248-297`) | same | same |
| Cache | none | 
short-TTL live cache keyed `ent:<product>:<tenant>:<service>:<probe>` (`:88-95`) | short-TTL cache keyed `ops:<product>:<tenant>` (`:142-153`) |

**The shape of the gap.** These three routes are the only surface in the product that reaches a customer's SAP system **without** the grant chain. The broker's own comment names this as the reason `broker-run` was built: "The Test Console used to call `/api/sap/tdd/entities` and `/preview`: role-gated env-tenant reads with **no grant check, no environment binding, no sapClient, and no northbound audit row**" (`src/app/api/studio/test/broker-run/route.ts:4-9`). The Test Console moved; the three routes did not, and they remain reachable by any `consultant` or `platform_admin` with a session. The probe guard's own header records that the first version of it was dead code — an early return on a public-access flag made the role check unreachable, and an unauthenticated `curl` got HTTP 200 and a 325 ms round trip (`src/lib/sap-public/probe-guard.ts:46-64`).

**Sibling routes under the same prefix** for completeness: `/api/sap/tdd/capabilities` (same probe guard, `auditWrites: false`), `/api/sap/tdd/hub-content/probe-all` and `/write-test` (`requireAdmin`), `/api/sap/tdd/write` (`requireAdmin`, `auditWrites: false`), `/api/sap/ariba/call` (live Ariba read). All are in the `sapLive` bucket (`src/lib/security/rate-limit.ts:248-297`).

### E16 · Every place a caller-supplied entity/dataset name reaches SAP

Command: `rg -n 'searchParams.get\("entity"\)|parsed.data.entity|input.entity' src/app`.

| # | Where it is read | Line | Whose input | What happens to it |
|---|---|---|---|---|
| 1 | `const entity = request.nextUrl.searchParams.get("entity") ?? ""` | `src/app/api/sap/tdd/preview/route.ts:37` | any session with a Studio role | passed straight to `previewSapEntitySet(product.envPrefix, tenant, service, entity, limit)` (`:59`). **No grant, no audit.** The only validation is non-empty (`:40-56`). |
| 2 | `const entitySet = iface.entitySet ?? request.nextUrl.searchParams.get("entity")` | `src/app/api/northbound/interfaces/[id]/data/route.ts:166` | northbound bearer token | **The stored `Interface.entitySet` wins**; the query param is a fallback used only when the interface has none. Passed to `readEntitySet` (`:199-204`), which `encodeURIComponent`s it into the OData path (`src/lib/northbound/read.ts:146-151`). Fully audited (`:208-225`). |
| 3 | `const entitySet = parsed.data.entity ?? iface.entitySet` | `src/app/api/northbound/interfaces/[id]/data/write/route.ts:223` | northbound bearer token + write key | **The caller's body wins over the stored value** — the inverse precedence of the read path. Validated only as `z.string().max(200).optional()` (`:57`). Bound into the idempotency key's destination (`:237-248`) then passed to `writeEntitySet` (`:275-280`). Fully audited. |
| 4 | `const entitySet = input.entity ?? iface.entitySet` | `src/app/api/studio/test/broker-run/route.ts:191` | session with a Studio role | Caller's body wins. Validated as `z.string().max(200).optional()` (`:47`). Runs the real broker pipeline and writes a `dryRun: true` audit row (`:134-152`). |
| 5 | `?service=` → `resolveHubService(product, serviceKey)` | `src/app/api/sap/tdd/preview/route.ts:35-36`; `src/app/api/sap/tdd/entities/route.ts:70` | any session with a Studio role | Resolved against the catalogue, so an unknown service 400s (`preview:47-50`) — but *which* catalogued service is the caller's choice, and the read is live. |
| 6 | `?probe=1` → `probeSapEntitySets(..., entitySets.map(e => e.name))` | `src/app/api/sap/tdd/entities/route.ts:97-104` | any session with a Studio role | The caller does not name an entity; the route probes **every** entity set the service exposes. |
| 7 | `?tenant=` → `resolveReadTenant(...)` | `preview:26`, `entities:59`, `operations:108` | any session with a Studio role | Resolves across **both** registries — deployment tenants first, then the caller's organization's own connections (`src/lib/sap-public/tenant-for-read.ts:57-74`). A key neither knows returns null → 400. |

Note the asymmetry in 2 vs 3/4: the **read** path treats the caller's `?entity=` as a fallback behind the governed `Interface.entitySet`; the **write** path and the Test Console let the caller's value override it.

### E17 · The Test Console Replay path

Replay runs through **`POST /api/studio/test/broker-run`** — the same broker dry-run as Run (`src/components/studio/TestConsoleClient.tsx:154-157`, `:206-245`).

**How it picks a credential** — client-side first, in `replayCredential`:

```tsx
// src/components/studio/TestConsoleClient.tsx:187-204
const replayCredential = useCallback(
  (c: SavedCase): { ok: true; clientId?: string } | { ok: false; message: string } => {
    const creds = interfaces.find((i) => i.id === c.interfaceId)?.credentials ?? [];
    const env = c.request?.environment;
    if (env) {
      const match = creds.find((x) => x.binding.credential.environment === env);
      return match
        ? { ok: true, clientId: match.clientId }
        : {
            ok: false,
            message: `no live ${env} credential — this case was recorded against ${env}, and replaying as another environment would test a different system`,
          };
    }
    // Recorded before the environment was stored. One credential is
    // unambiguous; several are not, and the broker says so in its own words.
    return creds.length === 1 ? { ok: true, clientId: creds[0]!.clientId } : { ok: true };
  },
  [interfaces],
);
```

So: the saved case records the **environment** it ran against; replay resolves that environment's live credential and sends its `clientId` in the body (`:218-225`). A case recorded **before** the environment was stored falls back to "one credential is unambiguous, several are not" and sends **no** `clientId` — deliberately letting the server refuse in its own words.

**What happens when a solution has more than one** — two refusal branches:

1. **Client-side**, when the case names an environment no live credential serves (`:196-198`, rendered at `:210-213` as `refused — no live <ENV> credential …`).

2. **Server-side**, the ambiguity branch, when no `clientId` is supplied and more than one live credential exists:

```ts
// src/app/api/studio/test/broker-run/route.ts:126-131
if (liveClients.length > 1) {
  return refusalOk(
    "AMBIGUOUS_CREDENTIAL",
    `This solution holds live credentials for ${liveClients.map((c) => c.environment).join(", ")}. Pick which one to run as — each binds to a different system.`,
  );
}
```

The candidate set is built at `:106-117`: scoped to the organization, `solutionId`, `isActive: true`, `revokedAt: null`, narrowed to `id: input.clientId` when one is supplied, ordered `createdAt: "asc"`, then filtered for unexpired. Zero candidates give `NO_CREDENTIAL` with two different sentences depending on whether a `clientId` was named (`:118-125`). The schema comment explains the rule: with several credentials live, "the first row" would be a system nobody chose (`:49-56`).

The route refuses `SOLUTION_RETIRED` / `SOLUTION_MISSING` **before** it looks at credentials at all (`:93-101`).

### E18 · `broker-run` vs `authenticateClientToken`, check by check

`authenticateClientToken` (`src/lib/northbound/auth.ts:124-169`) resolves a **bearer token**. `broker-run` (`src/app/api/studio/test/broker-run/route.ts:64-240`) resolves a **credential row** from a browser session, so it never calls that function. Side by side:

| # | Check | `authenticateClientToken` (the deployed app's path) | `POST /api/studio/test/broker-run` (the console) |
|---|---|---|---|
| 1 | Bearer token present | **yes** — `NO_TOKEN` (`auth.ts:128`) | **no** — n/a; identity is the browser session |
| 2 | Token hash resolves to a row | **yes** — `UNKNOWN_TOKEN` (`auth.ts:130-144`) | **no** — resolves rows by `solutionId`, the raw token is unrecoverable (`broker-run:103-117`) |
| 3 | `revokedAt === null` | **yes** — `REVOKED` (`auth.ts:147`) | **yes** — `revokedAt: null` in the query (`broker-run:111`) |
| 4 | `isActive` | **yes** — `INACTIVE` (`auth.ts:148`) | **yes** — `isActive: true` in the query (`broker-run:110`) |
| 5 | Not expired | **yes** — `EXPIRED` (`auth.ts:149-151`) | **yes** — post-filter on `expiresAt` (`broker-run:117`) |
| 6 | **Solution not `RETIRED`** | **yes** — `checkSolutionRuntime`, `SOLUTION_RETIRED` (`auth.ts:155-156`, `:103-114`) | **YES — the same function, called first** (`broker-run:93-101`) |
| 7 | Solution row exists | **yes** — `SOLUTION_MISSING` (`auth.ts:111`) | **yes** — same call (`broker-run:93-101`) |
| 8 | Tenant scope attached | **yes** — `tenantScopeOf(row.organizationId)` (`auth.ts:166`) | **yes** — `tenantScopeFor(user)` from the session (`broker-run:71-73`) |
| 9 | `lastUsedAt` touched | **yes** — fire-and-forget (`auth.ts:178-192`) | **no** — a console run is not the app using its credential |
| 10 | Caller role gate | **no** — a machine has no role | **yes** — `canAccessStudio` + `lacksStudioTenantScope` (`broker-run:67-72`) |
| 11 | Credential **disambiguation** | **no** — the token *is* the credential | **yes** — `AMBIGUOUS_CREDENTIAL` (`broker-run:126-131`), which has no analogue on the token path |
| 12 | Per-credential rate limit | **yes**, in the route — `northbound:<clientId>`, 60/min (`data/route.ts:62`) | **no** per-credential bucket; only the edge IP bucket via `isLiveSapTenantRoute` (`src/lib/security/rate-limit.ts:293-295`) |
| 13 | Grant gate | in the route — `resolveReadableInterface` (`data/route.ts:91-96`) | **yes**, same function (`broker-run:155-161`) |
| 14 | Connection binding | in the route — `resolveSapConnectionForEnvironment` (`data/route.ts:125-131`) | **yes**, same function (`broker-run:173-179`) |
| 15 | Audit row | `recordNorthboundCall` (`data/route.ts:208-225`) | **yes**, with `dryRun: true` (`broker-run:134-152`) |
| 16 | Refusal surfaced as | HTTP 401/403/404 with `{code,message,correlationId}` | HTTP **200** with `{ outcome: "refused", refusal: { kind, message } }` (`broker-run:59-62`) |

**Is a RETIRED solution refused? Yes, on both paths, through one shared function.** `checkSolutionRuntime` (`src/lib/northbound/auth.ts:103-114`) is exported precisely so the two cannot drift — its comment says the console "used to skip this check entirely, which made the console the one place a RETIRED solution still appeared to work" (`:92-99`). On the token path it is checked **last**, after the token's own states, so a revoked token on a retired solution audits as `REVOKED`, the more specific event (`:153-156`). On the console path it is checked **first**, before credentials (`broker-run:86-101`). `RESTRICTED` is deliberately **not** refused on either path — it means an ACTIVE solution lost an owner, a personnel change rather than a decision to stop the integration (`auth.ts:73-77`). A test pins the shared behaviour: `tests/unit/studio/retired-solution-reaches-every-path.test.ts`, and `tests/unit/northbound/auth.test.ts` ("refuses a token whose solution is RETIRED").

**Present in `authenticateClientToken`, missing in `broker-run`:** bearer extraction, unknown-token distinction, `lastUsedAt` touch, and a **per-credential rate limit**.
**Present in `broker-run`, missing in `authenticateClientToken`:** the caller role gate, credential disambiguation, and the refusal-as-outcome envelope.

---
## F. Capability gaps

| # | Capability | State |
|---|---|---|
| F19 | Scheduled per-lane health checks with a timestamped outcome, and a TTL | **partially exists** |
| F20 | Per-service health: metadata reachability vs data readability, stored separately | **partially exists** |
| F21 | Correlation IDs — generated, stored, queryable by exact match, retained | **partially exists** |
| F22 | One-time claim link / token-scoped key delivery | **absent** |
| F23 | Rate limiting on the northbound routes | **exists** |
| F24 | Circuit breaker or backoff around SAP calls | **absent** |
| F25 | SAP host allowlist validation on save; where the secret is encrypted/decrypted | **partially exists** (deny-list, not allow-list) / **exists** |
| F26 | Secret rotation with a probe before the stored secret is replaced | **absent** |
| F27 | Write scope — a write path, what authorises it, an approval record | **exists** |

### F19 · Scheduled per-lane health checks — **partially exists**

**What exists.** A Vercel cron at `0 4 * * *` (`vercel.json:14-17`) calls `GET /api/cron/connection-probes`, gated on `CRON_SECRET` in constant time (`src/app/api/cron/connection-probes/route.ts:20-22`), which runs `sweepConnectionProbes()` (`src/lib/ops/connection-probe-sweep.ts:86-183`). Per active connection it performs a read-only `$metadata` GET (`probeConnection`, `src/lib/studio/connection-health.ts:87-137`), then:

- writes the **summary columns** — `lastValidationStatus` always, `lastValidatedAt` **only on a real 200** (`connection-probe-sweep.ts:146-155`, matching `prisma/schema.prisma:690-692`);
- appends an **append-only `SapConnectionProbeEvent`** with `status`, `httpStatus`, `durationMs`, `source: "cron"` and `at` (`connection-probe-sweep.ts:156-165`, `prisma/schema.prisma:814-831`);
- detects a healthy→failing **transition** and alerts once, via Sentry + email to the org's `platform_admin`s (`connection-probe-sweep.ts:167-177`, `:46-84`). Recovery is recorded but deliberately not alerted (`:15-19`);
- records the run itself in `CronRunLog` so a missing sweep is visible (`src/app/api/cron/connection-probes/route.ts:27-34`, `prisma/schema.prisma:838-850`).

A manual equivalent exists — `POST /api/ops/connections-health/probe` ("Probe now", `source: "manual"`) and the Studio connection test (`source: "test"`).

**What is missing.**
1. **"Per lane" is per *connection*, not per interface or per service.** The unit of health is `SapConnection`; nothing probes an individual interface or entity set on a schedule.
2. **There is no TTL on the outcome.** `lastValidatedAt` / `lastValidationStatus` are read and rendered as-is; no code compares them against a maximum age, and no status decays to "stale" or "unknown". `rg -n 'STALE|staleness|TTL|freshness' src/lib/ops src/lib/studio/connection-health.ts src/app/api/ops` returns matches only in the **catalogue** freshness module (`src/lib/sap-public/catalogue-health.ts:20`, `CATALOGUE_STALE_AFTER_DAYS = 183`) and the `live-cache` request cache — neither applies to connection health. The Studio screen prints the raw timestamp (`src/components/studio/ConnectionsClient.tsx:267-271`); the Ops screen counts by status with the timestamp beside it, and its header argues a stale timestamp beside a failing status is *correct* (`src/app/api/ops/connections-health/route.ts:19-22`). So "healthy, last probed 6 weeks ago" renders identically to "healthy, probed this morning" — the one-per-day sweep is the only thing bounding the age, and a sweep that stops running produces no visible change.
3. **A connection with no probe path is skipped**, counted as `skippedNoPath`, and keeps whatever status it had (`connection-probe-sweep.ts:138-141`).
4. The probe sweep is **not** unit-tested end-to-end: `rg -l 'api/cron/connection-probes' tests` returns nothing (see §G28).

*Evidence:* `src/lib/ops/connection-probe-sweep.ts:86-183`, `prisma/schema.prisma:814-831`, `vercel.json:14-17`.

### F20 · Metadata reachability vs data readability, stored separately — **partially exists**

**The distinction is drawn, but only one half is persisted against a connection.**

- **Metadata reachability** is what `probeConnection` measures — a `GET …/$metadata` (`src/lib/studio/connection-health.ts:112`) classified into `OK | UNAUTHORIZED | NOT_FOUND | TIMEOUT | ERROR | NO_PROBE_PATH` (`:31-37`, `:67-85`). This **is** persisted: `SapConnection.lastValidationStatus` / `lastValidatedAt` plus a `SapConnectionProbeEvent` row.
- **Data readability** is a different fact and the product knows it. `readEntitySet` distinguishes `OK` from **`EMPTY`** — "reachable, answered, zero rows" — and returns 200 for both (`src/lib/northbound/read.ts:80-86`, `:211-215`). `/api/sap/tdd/operations` computes exactly this per section: `empty: preview.ok && preview.rows.length === 0`, with the comment "Reachable-but-empty is NOT a healthy 'read available' — flag it so the UI shows amber, not a false-green heartbeat" (`src/app/api/sap/tdd/operations/route.ts:66-68`). The honest-status vocabulary carries `ACTIVATED` ("a live probe returned 200") separately from `AVAILABLE` ("event or subscribe-only; not pulled") and `NOT_PROBEABLE` ("no OData endpoint to probe") (`src/components/studio/StudioStatusChip.tsx:49-58`).

**What is missing.** There is **no column** holding a data-read outcome per connection or per service. `SapConnection` has one status pair; `SapConnectionProbeEvent` has one `status`. The data-readability facts live in three places that are *not* the connection: (a) a short-TTL in-memory request cache (`src/app/api/sap/tdd/operations/route.ts:142-159`, `entities:88-105`), (b) the catalogue's per-tenant probes stored on `SapHubContent.rawMetadataJson.probes` (`prisma/schema.prisma:640-645`) — deployment-scoped and keyed by `tenantKey`, not by connection, which is exactly why the Ops catalogue-health screen had to be respecified as deployment-scoped (`src/app/api/ops/catalogue-health/route.ts:5-13`), and (c) `NorthboundAuditEvent.rowCount`, which records readability as a side effect of real traffic (`prisma/schema.prisma:1051`). Nothing joins these into a per-service health record.

*Evidence:* `src/lib/studio/connection-health.ts:31-37,112`, `src/lib/northbound/read.ts:80-86`, `src/app/api/sap/tdd/operations/route.ts:66-68`, `prisma/schema.prisma:814-831`.

### F21 · Correlation IDs — **partially exists**

| Question | Answer | Evidence |
|---|---|---|
| Generated where? | `newCorrelationId()` = `crypto.randomUUID()`, called as the **first statement** of every northbound handler | `src/lib/northbound/respond.ts:44-46`; `data/route.ts:49`, `write/route.ts:60`, `interfaces/route.ts:25`, `schema/route.ts:31`, `broker-run/route.ts:78` |
| Returned to the caller? | Yes — in the body (`error.correlationId` / echoed on success) **and** in an `x-correlation-id` header, on both success and failure | `src/lib/northbound/respond.ts:55-65`, `:78-89` |
| Stored where? | `NorthboundAuditEvent.correlationId String` (non-null) | `prisma/schema.prisma:1053`, written at `src/lib/northbound/audit.ts:101` |
| Also on non-northbound refusals? | Partly — the probe guard mints its own `randomUUID()` per refusal, **not** stored anywhere | `src/lib/sap-public/probe-guard.ts:87,102` |
| **Queryable by exact match?** | **No.** There is **no index** on `correlationId` — the model's only indexes are `[organizationId, solutionId, at]` and `[organizationId, clientTokenId, at]`. And no endpoint accepts it as a filter: `/api/ops/broker-traffic` filters on `solutionId`, `environment`, `connectionId` and a time window only, then **selects** `correlationId` for display | `prisma/schema.prisma:1103-1105`; `src/app/api/ops/broker-traffic/route.ts:56-80`, `:96`, `:233` |
| **Retention?** | **None.** Nothing deletes `NorthboundAuditEvent`. `rg -n 'northboundAuditEvent\.(delete\|deleteMany)' src scripts prisma` returns nothing. The only reaper in the area targets `NorthboundIdempotencyKey` | `src/lib/northbound/reap.ts:43-82`, `src/app/api/cron/northbound-reap/route.ts:18-23` |

So the promise the product makes — "a developer reporting 'call X failed' gives us one string that finds the exact audit row" (`src/lib/northbound/respond.ts:4-7`) — is **not** operationally reachable through the product: the id is generated, returned and stored, but there is no indexed lookup and no UI filter for it, and the table grows without bound.

### F22 · One-time claim link / token-scoped key delivery — **absent**

**How a key is delivered today: in the HTTP response body of the issuing call, once, to the browser that made it.**

- **Read token.** `issueClientToken` generates 32 bytes of CSPRNG entropy behind a `ce_` prefix, stores **only** the SHA-256 hash, and returns the raw value on the `IssuedClient` object (`src/lib/northbound/issue.ts:23-26`, `:38-39`, `:82-84`). `POST /api/studio/clients` returns it as `token: issued.rawToken` (`src/app/api/studio/clients/route.ts:235`), and rotation returns `token: rotated.rawToken` (`:353`). The audit row records **that** a credential was issued, never its value (`tests/unit/northbound/clients-route.test.ts` — "never writes the token into the audit trail").
- **Write key.** Same shape: `generateWriteCredential()` behind a `cew_` prefix (`src/lib/northbound/write-credential.ts:38-43`), sealed onto the credential row with AES-256-GCM AAD-bound to `(org, solution, credential row)` (`:52-78`), and the raw value returned once as `writeKey: rawKey` (`src/app/api/studio/clients/write-credential/route.ts:218`).
- **The UI** renders it with a Copy button and copy that says the server genuinely cannot show it again (`src/components/studio/ClientCredentials.tsx:7`, `:268`).

**What does not exist**: no claim link, no one-time-use URL, no expiring delivery token, no out-of-band channel, no per-recipient scoping. `rg -i 'claim.?link|one.?time.?(link|token)' src` returns nothing on this path. The token travels in a JSON response to whichever browser session pressed the button, and from there by whatever means the operator chooses. (Guest **grant** links exist for the presales/affirm/discovery surfaces — `PresalesAccessGrant`, `AffirmAccessGrant`, `DiscoveryAccessGrant`, `prisma/schema.prisma:4671,5290,5554` — but they are a different mechanism for a different audience and are not used for credential delivery.)

### F23 · Rate limiting on the northbound routes — **exists**

Two independent layers.

**Layer 1 — the edge, keyed by IP** (`src/middleware.ts:242-307`). All `/api/**` except a small exempt list (`:49-55`). Buckets: `auth` 30/min, `apiMutation` 120/min, `apiRead` 300/min, `report` 10/min, `sapLive` 20/min (`src/lib/security/rate-limit.ts:207-234`). `/api/northbound/*` falls into `apiRead`/`apiMutation`; the SAP-facing console routes fall into `sapLive` via `isLiveSapTenantRoute` (`:248-297`), which deliberately matches on pathname only so a caller cannot slip the bucket by omitting a query param. Refusal: 429 `RATE_LIMIT_EXCEEDED` with `Retry-After` (`src/middleware.ts:281-298`).

**Layer 2 — in the route, keyed by the resolved credential**, 60/min (`RATE_LIMITS.northbound`, `src/lib/security/rate-limit.ts:226-234`):

| Route | Bucket key | Line |
|---|---|---|
| `GET /api/northbound/interfaces/[id]/data` | `northbound:<clientId>` | `data/route.ts:62` |
| `POST /api/northbound/interfaces/[id]/data/write` | `northbound-write:<clientId>` — a **separate** budget, so a read burst cannot starve a write | `write/route.ts:136-137` |
| `GET /api/northbound/interfaces` (discovery) | `northbound:<clientId>` | `interfaces/route.ts:44` |
| `GET /api/northbound/interfaces/[id]/schema` | `northbound:<clientId>` | `schema/route.ts:45` |

All four **write a 429 audit row** before refusing (`data/route.ts:65-76`, `write/route.ts:139`, `interfaces/route.ts:46-57`, `schema/route.ts:47-58`). The rationale is recorded: an IP key would let one busy customer throttle another and would let a stolen token hide behind a shared address (`data/route.ts:17-23`).

**Two caveats worth carrying into the redesign.** (1) Without `UPSTASH_REDIS_REST_URL`/`_TOKEN` the limiter is an in-memory `Map`, so the effective limit is the configured one multiplied by however many serverless instances are warm — a number nobody can see (`src/lib/security/rate-limit.ts:22-30`, `:296-318`). `rateLimitBackend()` exists so a screen can state which is in force. (2) On a Redis outage the limiter **fails closed in production** (`:127-141`). (3) `POST /api/studio/test/broker-run` has **no** per-credential bucket — only the edge `sapLive` IP bucket (`:293-295`).

### F24 · Circuit breaker or backoff around SAP calls — **absent**

`rg -in 'circuit|breaker|backoff|exponential|retries' src/lib/northbound src/lib/sap-public src/lib/ops` returns **no matches**.

What exists instead is a **timeout**, per call, and nothing else:

- Reads: `AbortController` with `Math.min(connection.timeoutMs ?? 15_000, MAX_TIMEOUT_MS)`, an abort classified as `TIMEOUT` → HTTP 504 (`src/lib/northbound/read.ts:135-137`, `:190-200`, `:211-226`).
- Probes: `Math.min(conn.timeoutMs ?? 10_000, 30_000)` (`src/lib/studio/connection-health.ts:49-50`, `:103-105`).
- The probe sweep bounds **concurrency**, not retries: `SWEEP_CONCURRENCY = 4` inside a group, groups run serially (`src/lib/ops/connection-probe-sweep.ts:35`, `:129-131`, `:179`).

So a failing tenant is called again on the very next request. Nothing trips, nothing sheds load, nothing backs off. The closest thing to a breaker is the **incident rule** `connection-unhealthy` / `upstream-errors`, which *observes* the failure after the fact and raises a `major` incident (`src/lib/ops/incidents.ts:130-147`) — a detector, not a breaker. The OAuth token cache does avoid re-exchanging on every call and refreshes early, and it deliberately **does not cache a failed exchange** (`tests/unit/northbound/dod-gaps.test.ts`, "does not cache a failed exchange") — which is correct for correctness and means a broken OAuth endpoint is hit on every request.

Retry-with-backoff does exist in the repo, but only in build tooling: `scripts/migrate-deploy-with-retry.mjs` and `SAP_API_HUB_MAX_RETRIES` in the catalogue importer — neither is on a request path.

### F25 · SAP host validation on save, and where the secret is encrypted/decrypted

**Host validation: partially exists — it is a DENY-list, not an allow-list.**

```ts
// src/lib/studio/connection-url-guard.ts:15-33
export function isForbiddenBaseUrlHost(u: string): boolean {
  let host: string;
  try { host = new URL(u).hostname.toLowerCase(); } catch { return true; }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.startsWith("[")) return true;                 // every IPv6 literal
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) return true;                                  // every IPv4 literal, public ones included
  return false;
}
```

Applied on save through a Zod refinement that also requires **https** (`src/app/api/studio/connections/route.ts:76-89`, and again on `oauthTokenUrl` at `:125`). The module's own header states the limit precisely: "a public DNS name resolving privately is a network-layer concern this check cannot see, and pretending otherwise here would be a false claim" (`src/lib/studio/connection-url-guard.ts:8-11`). There is **no** positive allow-list of SAP domains (`*.s4hana.cloud.sap`, `*.successfactors.com`, …) anywhere — `rg -n 'hana.cloud.sap' src/lib | grep -v comment` finds it only in doc comments and fixtures. So any https host that is not a literal IP and does not end `.local/.internal/.localhost` can be saved, and the broker will then send that tenant's sealed credentials to it.

**Encryption/decryption: exists, AES-256-GCM with AAD row binding.** All of it in `src/lib/sap-public/connection-crypto.ts`:

| Concern | Where |
|---|---|
| Algorithm | `const ALGORITHM = "aes-256-gcm"` — `:18` |
| Key source | `SAP_CONNECTION_ENCRYPTION_KEY`, required to be exactly 64 hex chars / 32 bytes; `getEncryptionKey()` throws otherwise — `:80-88`; a non-throwing probe is `isConnectionEncryptionConfigured()` — `:75-78` |
| Seal | `sealSecrets(secrets, aad)` — `:190` |
| Open | `openSecrets(blob, aad)` — `:209` |
| AAD for a connection | `connectionAad(organizationId, product, key)` — `:102` |
| AAD for a credential row | `solutionClientRowAad(organizationId, solutionId, clientId)` — `:129`; the superseded solution-level `solutionClientAad` is kept only so a v1 blob can be **recognised and refused**, never upgraded — `:109`, `src/lib/northbound/write-credential.ts:112-125` |

Call sites — **five, and only five** (`rg -n 'openSecrets\(|sealSecrets\(' src | grep -v connection-crypto.ts`):

| Direction | Call site | What |
|---|---|---|
| decrypt | `src/lib/sap-public/connection-resolver.ts:167` | inside `resolveSapConnections`, per row, bound by `connectionAad` |
| encrypt | `src/lib/sap-public/connection-resolver.ts:755` | inside `upsertSapConnection`, the only connection write path |
| encrypt | `src/lib/northbound/write-credential.ts:71` | `setWriteCredential`, bound by `solutionClientRowAad` |
| decrypt | `src/lib/northbound/write-credential.ts:108` | `verifyWriteCredential`, constant-time compare |
| decrypt | `src/lib/northbound/write-credential.ts:149` | the v1-blob recognition path, which then **refuses** |

Decrypted secrets exist only on the in-memory `ResolvedSapConnection` and are stripped by `redactConnection` before anything crosses the client boundary (`connection-resolver.ts:801-818`); `secretsCiphertext`, `baseUrl` and `oauthTokenUrl` are never selected by the ops health query (`src/app/api/ops/connections-health/route.ts:24-26,52-63`). A resolver throw is caught and turned into `CONNECTION_UNREADABLE` rather than a 500, fail-closed over the whole set (`connection-resolver.ts:420-434`). Tests: `tests/unit/sap-public/connection-crypto.test.ts`, `tests/unit/studio/aad-binding.test.ts`, `tests/unit/studio/connections-secret-safety.test.ts`.

### F26 · Secret rotation with a probe before replacement — **absent**

There is **no probe before a stored secret is replaced.** `upsertSapConnection` seals the new bundle and writes it in a single `prisma.sapConnection.upsert`, with no connectivity check anywhere in the path (`src/lib/sap-public/connection-resolver.ts:752-800`). The route around it validates shape, https, the forbidden-host deny-list and the environment twin rule, then saves (`src/app/api/studio/connections/route.ts:286-336`, `:363-390`). The only failure it can report is that **sealing** failed — a deployment-configuration problem, not a credential one (`:338-362`, `:392-402`). The audit row records `secretsRotated: true` regardless of whether the new secret works (`:404-418`).

The same is true of the **credential** rotation path: `issueClientToken`'s update branch overwrites `tokenHash` immediately, with deliberately **no grace period** — "an overlap window is exactly how a leaked credential survives its own rotation" (`src/lib/northbound/issue.ts:11-14`, `:109-121`).

A probe **does** exist — `probeConnection` (`src/lib/studio/connection-health.ts:87-137`) — but it is only reachable **after** the fact, through three separate actions: `POST /api/studio/connections/[id]/test`, `POST /api/ops/connections-health/probe`, and the nightly sweep. So the sequence today is *save → then find out*: a re-saved connection with a wrong password is stored, is immediately live for the broker, and reports whatever `lastValidationStatus` the **previous** secret earned until something probes it again — and `lastValidatedAt` will still show the last time the *old* secret returned 200 (`prisma/schema.prisma:690-692`).

### F27 · Write scope — **exists**

**A write path exists:** `POST /api/northbound/interfaces/[id]/data/write` (`src/app/api/northbound/interfaces/[id]/data/write/route.ts`, 300+ lines).

**What authorises it — eight gates, in order:**

| # | Gate | Line |
|---|---|---|
| 1 | Bearer client token → `authenticateClientToken` (incl. the `SOLUTION_RETIRED` check) | `:63-68` |
| 2 | **A second secret** — `x-coreedge-write-key`, verified against **this credential's row** in constant time, so a key minted for TEST does not authorise a call made with the DEV token | `:118-130`, `src/lib/northbound/write-credential.ts:87-135` |
| 3 | A separate per-credential throttle, `northbound-write:<clientId>`, 60/min | `:136-143` |
| 4 | **Mandatory** `Idempotency-Key` (8-255 chars, `[A-Za-z0-9_.:-]`) — refused outright without one | `:147-156` |
| 5 | Body schema `{ record: object, entity?: string }` | `:57`, `:158-162` |
| 6 | `resolveWritableInterface` — interface belongs to this solution, `mode === "WRITE"`, `status === "ACTIVE"`, a live **WRITE** grant (`CREATE`/`UPDATE`) for this environment, unrevoked, unexpired, evaluated at call time | `:165-177`, `src/lib/northbound/access.ts:90-203` |
| 7 | Connection binding, **stricter than the read path** — an undeclared environment is refused outright (`UNDECLARED_ENVIRONMENT_WRITE`) | `:184-207`, `src/lib/sap-public/connection-resolver.ts:386-390` |
| 8 | `connection.writeEnabled` — a per-tenant veto that overrides any grant | `:209-217` |

Then the key is bound to the resolved destination (env, sapClient, connectionId, baseUrl, servicePath, entitySet, interfaceVersion) **before** either upstream call, so reissuing a credential for another landscape cannot replay an old write (`:231-248`).

**Is there an approval record? Yes — `ApiAccessGrant`**, and it carries a real segregation-of-duties control:

- `requestedById` must differ from `decidedById` — `SELF_APPROVAL` otherwise (`src/lib/studio/grants.ts:171-177`, `prisma/schema.prisma:868-869`);
- a decision that actually authorises a write requires an explicit **write checklist** acknowledgement — `WRITE_CHECKLIST_REQUIRED` (`src/lib/studio/grants.ts:178-190`);
- **every** granting decision must carry an `expiresAt` — `GRANT_REQUIRES_EXPIRY` (`:191-205`);
- a settled grant cannot be re-decided — `NOT_PENDING` (`:149-155`);
- revocation is a **second fact** recorded beside the decision with a mandatory reason, never a re-decision (`prisma/schema.prisma:876-897`);
- every governance mutation writes a `ConfigAudit` row (`prisma/schema.prisma:936-955`, `src/app/api/studio/access-grants/route.ts`), and every call writes a `NorthboundAuditEvent`.

**The product decision to be aware of:** there is **no per-call confirmation**, by design. The grant approval — its second person, its checklist and its expiry — is the single human checkpoint for every write that solution ever makes, which is exactly why expiry is load-bearing and is evaluated per call (`src/lib/northbound/access.ts:83-88`). Ops-side visibility is `/api/ops/write-ledger`, which states up front that its two sources do not reconcile row-for-row and why (`src/app/api/ops/write-ledger/route.ts:1-30`).

---
## G. Tests and safety net

### G28 · Tests for the northbound chain — what exists, what they assert, what has nothing

**366 test files** total (`find tests -name '*.test.ts' -o -name '*.test.tsx' | wc -l`). The northbound chain is covered by **11 files in `tests/unit/northbound/`** plus ~50 in `tests/unit/studio/`, `tests/unit/ops/` and `tests/unit/sap-public/`.

#### `tests/unit/northbound/` — the broker's own suite

| File | What it actually asserts |
|---|---|
| `auth.test.ts` | A token whose solution is `RETIRED` is refused; an orphaned credential (`SOLUTION_MISSING`) is refused; the solution lookup is **scoped to the token's organization**, never by id alone; the token's own states are checked first so a revoked token on a retired solution audits as `REVOKED`; `extractBearer` is scheme-case-insensitive and tolerates spacing; hashing is deterministic and the lookup is **by hash**, never by raw value |
| `access.test.ts` | The interface lookup and the grant query are both organization-scoped; a sibling solution's interface refuses with the **same message** as "not found"; a live approved grant allows; no grant / `REJECTED` / still-`REQUESTED` refuse; `APPROVED` and `READ_ONLY` both permit a read; `SANDBOX_ONLY` is refused outside `SANDBOX`; grants are queried for **this client's** environment |
| `discovery-agrees-with-enforcement.test.ts` | The `callable` flag on `GET /api/northbound/interfaces` and the enforcement in `access.ts` agree in **both** directions for `SANDBOX_ONLY`, for an expired grant, for a revoked grant, and for a grant both revoked and expired (which refuses as `REVOKED` — the deliberate act wins) |
| `issue.test.ts` | The token is prefixed, long, URL-safe and never repeats; only the **hash** is stored; the raw value is returned exactly once; the caller's organization is stamped; the upsert is on `(organization, solution, environment)` so it neither accumulates nor leaves the tenant; the environment is never rewritten on rotation; re-issuing revives a revoked credential; rotation replaces the hash so the previous token dies immediately |
| `clients-route.test.ts` | **Segregation of duties on issuance** — a non-owner may issue, an owner may not issue their own solution's credential, and the refusal explains why; the same rule applies to **rotation**; revocation is deliberately *not* gated; the response says plainly that rotation killed the previous token; the token is **never written into the audit trail** |
| `gated-write.test.ts` | The write credential has its own prefix; a wrong key, an absent header and "no credential configured" all reject **without saying which**; a blob sealed for a different solution / a different organization / a **sibling credential of the same solution** all reject; a key sealed under the superseded solution-level AAD rejects rather than being upgraded; the lookup is on the **calling** credential's row, scoped to the caller's org; only an `ACTIVE` write interface may write |
| `idempotency.test.ts` | Key validation (sensible key accepted; too-short rejected; unbounded/exotic rejected so the column is not usable as storage); the request fingerprint is stable for the same payload, **ignores property order**, changes on any value change, and distinguishes nested differences; first use reserves and stamps tenant + fingerprint + expiry |
| `read.test.ts` | `failureReason` is null on success **including an empty result**; carries the HTTP status when the tenant answered; carries the error's own code from `cause` where Node's fetch puts it; reports our own abort as `TIMEOUT`; collapses anything that is not a bare code so a **host can never ride through**; names a 200 whose body is not OData; **401 is told apart from 403** (both stay `NEEDS_SETUP`, but 401 points at credentials and 403 at the arrangement) |
| `write.test.ts` | CSRF session-cookie forwarding sends each pair once without response attributes; handles a combined field with an `Expires` comma in runtimes without `getSetCookie`; **never writes after a refused CSRF handshake**; write-response validation |
| `ops-plumbing.test.ts` | `peekRateLimit` does not spend what it measures; the idempotency reaper leaves a key alive if renewed between selection and deletion, deletes nothing and says so when nothing is expired, deletes only expired rows oldest-first, reports `moreRemaining` at the cap and not on a partial batch, and keeps a batch cap at all |
| `dod-gaps.test.ts` | The OAuth token is cached across calls, re-exchanged on expiry, refreshed **early** so it cannot expire mid-flight, cached **per connection**, bounded so a hung endpoint aborts, and **not cached on failure**; the audit trail is append-only — both audit modules export a write and nothing else, neither contains an update/delete on its audit table, and **no module anywhere edits an audit row**; northbound rate limiting |

#### Adjacent suites that carry real northbound assertions

`tests/integration/northbound-idempotency-race.test.ts` (a real-PostgreSQL race regression), `tests/unit/studio/retired-solution-reaches-every-path.test.ts`, `tests/unit/studio/credential-segregation.test.ts`, `tests/unit/studio/credential-solution-disambiguation.test.ts`, `tests/unit/studio/grants.test.ts`, `tests/unit/studio/rbac.test.ts`, `tests/unit/studio/studio-guard-coverage.test.ts`, `tests/unit/studio/tenant-scope-coverage.test.ts`, `tests/unit/studio/connection-binding-tuple.test.ts`, `tests/unit/studio/connections-secret-safety.test.ts`, `tests/unit/studio/aad-binding.test.ts`, `tests/unit/sap-public/connection-binding.test.ts`, `tests/unit/sap-public/connection-crypto.test.ts`, `tests/unit/ops/binding-refusal-coverage.test.ts`, `tests/unit/ops/connection-drift-and-cron.test.ts`, `tests/unit/ops/probe-one-connection.test.ts`, `tests/unit/security/live-sap-route-throttle.test.ts`, `tests/unit/build/test-auth-absent-from-production.test.ts`, `tests/unit/auth/test-backdoor-guards.test.ts`.

#### What has no coverage at all

Method: for each route path, `rg -l -- '<path>' tests | wc -l`.

| Surface | Files referencing it in `tests/` | Note |
|---|---|---|
| `GET /api/northbound/interfaces/[id]/schema` | **0** | The only northbound route with no test referencing it at all. Its grant-free design ("knowing the SHAPE of an interface your own solution defined is not access to the client's data", `schema/route.ts:9-11`) is asserted nowhere. |
| `GET /api/cron/connection-probes` | **0** | The whole scheduled-sweep entry point. `sweepConnectionProbes` is exercised indirectly by `tests/unit/ops/connection-drift-and-cron.test.ts`; the route, its `CRON_SECRET` gate and its `CronRunLog` write are not. |
| `GET /api/cron/northbound-reap` | **0** | The reaper *library* is well covered (`ops-plumbing.test.ts`); the route and its `CRON_SECRET` gate are not. |
| The **retention** of `NorthboundAuditEvent` | — | There is nothing to test: no retention exists (§F21). |
| `correlationId` lookup | — | Nothing asserts a correlation id can be found again, because no query path accepts one (§F21). |
| A dark-mode rendering of any console chip | — | The visual-regression suite covers 43 images and, per `src/app/globals.css:146-149`, **"NOTHING covers affirm, workbench, studio, control tower, operations, presales or discovery."** |
| Circuit-breaker / backoff behaviour | — | Nothing to test (§F24). |
| A probe-before-rotation | — | Nothing to test (§F26). |

The routes **with** coverage, for contrast: `/api/northbound/interfaces` and `…/data` (2 files each), `…/data/write` (2), `/api/studio/test/broker-run` (5), `/api/sap/tdd/preview` (6), `/entities` (5), `/operations` (3), `/api/auth/test-login` (5).

### G29 · Do `lint`, `typecheck`, `test` and `build` pass right now?

All four were run on this commit. **All four pass.** Environment note: `pnpm install --frozen-lockfile` and each script were run with `SKIP_NODE_VERSION_CHECK=1`, because this container has Node `22.22.2` while `package.json` volta-pins `22.22.1`; the preinstall guard refuses otherwise (`scripts/check-node-version.mjs`). No source file was modified. The repo uses **pnpm**, not npm (`package.json:5`), so the pnpm equivalents of the four scripts were used; `lint` and `typecheck` were run in their CI-strict form, which is what `.github/workflows/ci.yml:72-76` runs.

| Check | Command | Result |
|---|---|---|
| lint | `pnpm lint:strict` (`eslint . --max-warnings 0`) | **pass** — exit 0 |
| typecheck | `pnpm typecheck:strict` (`tsc --noEmit --strict`) | **pass** — exit 0 |
| test | `pnpm test` (`vitest run`) | **pass** — exit 0 |
| build | `pnpm build` | **pass** — exit 0 |

**lint — tail**

```
> abeam@0.1.0 prelint:strict /home/user/aptus
> node scripts/check-node-version.mjs

> abeam@0.1.0 lint:strict /home/user/aptus
> eslint . --max-warnings 0
```
(no findings; ESLint prints nothing on a clean run) · `LINT_EXIT=0`

**typecheck — tail**

```
> abeam@0.1.0 pretypecheck:strict /home/user/aptus
> node scripts/check-node-version.mjs

> abeam@0.1.0 typecheck:strict /home/user/aptus
> NODE_OPTIONS=--max-old-space-size=4096 tsc --noEmit --strict
```
(no diagnostics) · `TYPECHECK_EXIT=0`

**test — tail**

```
 ✓ tests/unit/auth/assessment-visibility.test.ts (3 tests) 6ms
 ✓ tests/unit/affirm/external/tokens.test.ts (3 tests) 8ms
 ✓ tests/unit/portfolio-routes.test.ts (6 tests) 114ms
 ✓ tests/unit/components/http-status-pill.test.ts (4 tests) 4ms
 ✓ tests/unit/unified-gap-data.test.ts (2 tests) 168ms
 ✓ tests/unit/setup.test.ts (1 test) 3ms

 Test Files  365 passed | 1 skipped (366)
      Tests  5322 passed | 10 skipped (5332)
   Start at  02:58:04
   Duration  180.19s (transform 18.95s, setup 29.12s, import 49.66s, tests 108.53s, environment 277.76s)
```
`TEST_EXIT=0`. Note the suite ran with **no `DATABASE_URL`** in this container; the 1 skipped file and 10 skipped tests are the real-PostgreSQL cases (CI supplies `TEST_DATABASE_URL`, `.github/workflows/ci.yml:78-82`), so the integration race regressions were **not** exercised here.

**build — tail**

```
 ✓ Compiled successfully in 102s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (109/109)
   Finalizing page optimization ...
   Collecting build traces ...
…
+ First Load JS shared by all                                                    102 kB
  ├ chunks/65367-028982989583289d.js                                            46.2 kB
  ├ chunks/92b45286-d71ca1fc87ed89d3.js                                         54.2 kB
  └ other shared chunks (total)                                                 2.01 kB

ƒ Middleware                                                                    57.9 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

Runtime assets OK: developer guide present and traced
```
`BUILD_EXIT=0`. This was `pnpm build`, **not** `pnpm vercel-build`, so `check-production-env.js`, `strip-test-auth-for-production.mjs`, `migrate-deploy-with-retry.mjs` and `assert-content-release-landed.ts` did **not** run — the first two are what remove the auth backdoors from a customer-facing deploy (§E14).

One non-fatal warning appeared during compilation: `<w> [webpack.cache.PackFileCacheStrategy] Serializing big strings (140kiB) impacts deserialization performance` — a cache-serialisation hint, not an error.
