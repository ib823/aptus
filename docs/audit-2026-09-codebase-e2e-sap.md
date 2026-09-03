# Codebase audit, E2E access and SAP connectivity — September 2026

**Date:** 2026-09-03 · **Branch:** `claude/codebase-audit-e2e-setup-vhkrak` · **Base:** `main` @ `b90ab0c` (2026-08-06)

Three questions were asked of the repository:

1. Is the codebase healthy — do its own gates pass, and what does a fresh read find?
2. What is the "E2E key" a tester uses to sign in to the portal, and how is it set up?
3. Are the SAP API and connectivity layers intact and current against SAP's state as of September 2026?

Everything below was verified on a fresh clone with a local Postgres 16, Node 22.22.2 and pnpm 10.23.0.
Where a claim comes from reading code rather than running it, it says so.

---

## 1. Verdict in one screen

| Question | Answer |
|---|---|
| Gates | All six pass on `main` and after this branch's changes: Prisma generate + push, `typecheck:strict`, `lint:strict`, unit suite, production build. See §2. |
| E2E key | There is no committed key. `E2E_TEST_SECRET` is an environment variable you choose; `/dev-login` asks for it. A candidate value and the exact env block are in §3. The flow was exercised end to end against the production build in this session. |
| SAP layer | The OData/REST mechanics are sound and current. Three real defects were found and fixed here (§4.3): env credentials were sent to a customer's stored-connection host on every `/api/sap/tdd/*` read; the catalogue detail route live-probed the tenant without the probe guard; and the env-based SuccessFactors tenant could not use the OAuth SAML-bearer flow that replaces Basic auth before SAP removes it on 20 November 2026. The scope-item catalogue is one release behind (2602 vs 2608) and needs a data ingest, not a code change. |
| Codebase health | No critical findings. Two high findings fixed here (backslash open-redirect in five sanitizers; register writes with no role gate) plus one routing gap (MFA/invitation pages stranded under `WORKBENCH_ONLY`). The rest are listed with file references in §5 for a follow-up. |

---

## 2. Quality gates

Run with `SKIP_NODE_VERSION_CHECK=1` because the sandbox ships Node 22.22.2 and the repo pins 22.22.1 exactly (see §5, L-1).

| Gate | Command | Result on `main` | Result on this branch |
|---|---|---|---|
| Prisma client | `pnpm db:generate` | pass | pass |
| Schema push | `pnpm db:push` (fresh DB) | pass | pass |
| Strict types | `pnpm typecheck:strict` | pass, 0 errors | pass, 0 errors |
| Strict lint | `pnpm lint:strict` | pass, 0 warnings | pass, 0 warnings |
| Unit + integration | `pnpm test --run` | 317 files, 4,738 tests, all pass | 321 files, 4,797 tests, all pass |
| Production build | `pnpm build` | pass, 510 routes | pass, 510 routes |
| Playwright smoke | `CI=1 pnpm test:e2e:smoke` | — | see §3.6 |

---

## 3. E2E login — the key, the gates, the proof

### 3.1 What the "key" is

The portal has no seeded test password. Internal testers sign in through `/dev-login`, a thin UI over
`POST /api/auth/test-login` (`src/app/api/auth/test-login/route.ts`). The page asks for one secret,
compares it in constant time against the `E2E_TEST_SECRET` environment variable, and on a match mints a
**real** `abeam-session` cookie for one of seven hardcoded personas (`src/lib/auth/dev-login.ts`). Users are
auto-created on first login under the `e2e-test-org` organization, so there is no seed step for the login itself.

The value is whatever you set. A fresh candidate, generated the way `.env.example` documents:

```
E2E_TEST_SECRET=80hdHDJRsojygiOpH8yUp1qHzXJnGI8Q
```

Rotate it the same way at any time:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 3.2 Gates that must all be true

The endpoint fails closed. Every row below must hold or the page and the API both return 404.

| Variable | Local dev (`pnpm dev`) | `pnpm start` locally, Vercel Preview, or an internal-test production deploy |
|---|---|---|
| `ENABLE_TEST_LOGIN_ENDPOINT` | `true` | `true` |
| `E2E_TEST_SECRET` | ≥ 8 chars (the form refuses shorter) | **≥ 24 chars** (route and build guard refuse shorter) |
| `ALLOW_TEST_LOGIN_IN_PROD` | not needed | `true` — `next start` runs as `NODE_ENV=production`, so this is needed even locally |
| `TEST_LOGIN_ALLOWED_IPS` **or** `ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST=true` | not needed | one of them — the IP gate fails closed in production when neither is set. Prefer the allow-list (exact IPs, no CIDR). |
| `INTERNAL_TEST_DEPLOYMENT` | not needed | `true` on a **production** Vercel deploy, or `scripts/check-production-env.js` fails the build. Also lifts plan/usage gates (§5, M-5). |

The first attempt in this session returned 404 with `outcome=denied:env` in the server log precisely
because the production build was started without `ALLOW_TEST_LOGIN_IN_PROD` and an IP allow-list.
Once both were set the flow passed. That log line is the fastest way to diagnose a refused login.

### 3.3 Env block to paste

Local `.env.local` (gitignored):

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fit_portal"
DIRECT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fit_portal"
NEXTAUTH_SECRET="<32+ random chars>"
NEXTAUTH_URL="http://localhost:3003"
NEXT_PUBLIC_APP_URL="http://localhost:3003"

ENABLE_TEST_LOGIN_ENDPOINT="true"
E2E_TEST_SECRET="80hdHDJRsojygiOpH8yUp1qHzXJnGI8Q"
# only when running the production build locally (pnpm start):
ALLOW_TEST_LOGIN_IN_PROD="true"
TEST_LOGIN_ALLOWED_IPS="127.0.0.1"

# needed before any SAP connection can be declared in Studio:
SAP_CONNECTION_ENCRYPTION_KEY="<64 hex chars>"
```

Vercel internal-test deployment (Project → Settings → Environment Variables, scope = the environment
testers use): `ENABLE_TEST_LOGIN_ENDPOINT=true`, `E2E_TEST_SECRET=<24+ chars>`,
`ALLOW_TEST_LOGIN_IN_PROD=true`, `INTERNAL_TEST_DEPLOYMENT=true`, and `TEST_LOGIN_ALLOWED_IPS=<tester IPs>`.
Never set these on a customer-facing deployment; `docs/deployment-urls.md` §6 keeps the current posture out of
the repository on purpose, and this document follows that rule.

### 3.4 Personas on `/dev-login`

| Persona | Email | Role | Use it for |
|---|---|---|---|
| Platform Admin | platform-admin@abeam.test | `platform_admin` | admin UI; read-oriented oversight in Studio |
| Partner Lead | partner-lead@abeam.test | `partner_lead` | engagements, team management |
| Consultant | consultant@abeam.test | `consultant` | Workbench day-to-day; the only role that can mutate Studio |
| Consultant (second) | consultant-two@abeam.test | `consultant` | the two-person Studio loop (issue credential / approve grant) |
| Project Manager | project-manager@abeam.test | `project_manager` | deliverables and timelines |
| Executive Sponsor | executive-sponsor@abeam.test | `executive_sponsor` | sign-off views |
| Support | support@abeam.test | `support` | Operations Center only |

After login the page lands on `/assessments`, or on `/workbench` when `WORKBENCH_ONLY=true`. Any same-origin
`?callbackUrl=/path` is honoured (sanitised by the shared helper added in this branch).

### 3.5 Proof from this session

Against `pnpm build` + `pnpm start` with the env above:

| Step | Result |
|---|---|
| `GET /dev-login` | 200 |
| `POST /api/auth/test-login` with a wrong secret | 403 `Invalid secret`; log `outcome=denied:secret` |
| `POST /api/auth/test-login` with the right secret | 200, `abeam-session` cookie set; log `outcome=success email=consultant@abeam.test` |
| `GET /workbench`, `/studio`, `/sap-explorer`, `/presales`, `/operations` with the cookie | 200 each |
| `GET /workbench` without a cookie | 307 → `/presales/login` |

### 3.6 Playwright

Playwright does **not** use the secret. `tests/e2e/global-setup.ts` writes sessions straight into the
database for six role users (`e2e-admin@abeam.test` and friends) and saves one `storageState` per role,
so the suite needs only `DATABASE_URL`/`NEXTAUTH_SECRET` and a running app on :3003.

```bash
pnpm test:e2e:smoke          # login + portal + accessibility (what CI runs)
pnpm test:e2e:chromium       # every role project + journeys + edge cases + responsive
pnpm test:e2e:ui             # interactive
CI=1 pnpm test:e2e:smoke     # boots `pnpm start` instead of `pnpm dev`
```

Journeys j02/j05/j06/j09 and `edge-cases` self-skip without seeded data; set `REQUIRE_SEED=1` to turn
those skips into failures and run the seeds under `tests/seed/` first (nothing in `package.json` runs
them today — §5, M-6).

---

## 4. SAP connectivity against SAP's current state

### 4.1 What SAP has changed, and where the code stands

| SAP fact (Sept 2026) | Source | Codebase | Status |
|---|---|---|---|
| S/4HANA Cloud Public Edition **2608** is the current release (GA August 2026); 2702 is next | SAP Community "What's new in 2608" | Scope-item catalogue, seeds and `APP_CONFIG.sapVersion` are **2602** | One release behind. Data ingest, not code: see §4.4. |
| S/4HANA Cloud Private Edition / S/4HANA **2025 FPS01** (Feb 2026) is current | SAP Community FPS01 "Final What's New" | Classifier, verdict writer and reports use `2025-FPS1` | Current. |
| SuccessFactors **HTTP Basic auth removed 20 Nov 2026**; replacements are OAuth 2.0 SAML bearer, X.509 mTLS, OIDC via IAS. Legacy People Profile OData V2 APIs deleted 13 Nov 2026; SOAP EC SFAPIs (except CompoundEmployee) deleted 20 Nov 2026 | SAP release information; Oracle SF adapter notice | Stored connections supported `oauth-saml-bearer`; the env tenant (`SF_TDD_*`) accepted only basic/bearer/client-credentials, and `.env.example` told operators to use Basic | **Fixed here** (§4.3-C). The exchange is still unverified against a live SuccessFactors tenant; the assertion is taken from an IdP, not generated. |
| S/4HANA Cloud Public communication arrangements: Basic, OAuth 2.0 client credentials and SAML bearer, X.509 | SAP Help | `basic`, `bearer`, `oauth-client-credentials` on both env and stored paths; hosts `https://myNNNNNN-api.s4hana.cloud.sap`; OData v2 `d.results` and v4 `value` both parsed; CSRF handshake on writes | Current. No published Basic-auth removal for S/4 Public as of this audit. |
| SAP Ariba APIs: OAuth client-credentials + `apiKey` header + `realm` query, paths `/api/<service>/vN/prod/…` on `openapi.ariba.com` | SAP Help (Ariba APIs) | `src/lib/sap-public/ariba-connector.ts` sends exactly that; six starter endpoints (Event Management v1, Sourcing Project v1, Supplier Data with Pagination v4, Contract Workspace v1, Analytical/Operational Reporting v1) | Current in shape; the endpoint list is starter data and is marked as such. Env-configured only — no per-organization stored connection can serve Ariba (§4.5). |
| "SAP API Business Hub" was renamed **SAP Business Accelerator Hub**; `api.sap.com` still resolves | SAP Community | Runtime modules use the new name; `docs/adr/AD-13-6-…` and `scripts/ingest-sap-api-hub-oauth.ts` use the old | Cosmetic. |

### 4.2 Inventory (for reference)

Three independent mechanisms reach SAP; only the first two share a URL builder (`src/lib/sap-public/sap-url.ts`):

| Mechanism | Credentials | Used by |
|---|---|---|
| Env connector `tdd-connector.ts` | `{PREFIX}_*` variables (`S4_TDD`, `SF_TDD`, `S4_PRIVATE_TDD`, `S4_ONPREM_TDD`, `ECC_TDD`) | every `/api/sap/tdd/*` route; `/sap-explorer` |
| Keystone resolver `connection-resolver.ts` | `SapConnection` rows, AES-256-GCM sealed, AAD-bound to (org, product, key) | northbound broker, Studio connection test, cron probe sweep, Studio broker-run |
| Ariba connector `ariba-connector.ts` | `ARIBA_*` variables | `/api/sap/ariba/call` |

Curated S/4 services: `API_PURCHASEORDER_PROCESS_SRV` (SAP_COM_0053), `API_SUPPLIERINVOICE_PROCESS_SRV`
(SAP_COM_0057), `API_PURCHASECONTRACT_PROCESS_SRV` (SAP_COM_0101), `CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV`
(SAP_COM_0054), `API_CV_ATTACHMENT_SRV`. SuccessFactors: single `/odata/v2` root, entity sets `User`,
`EmpEmployment`, `JobRequisition`, `Candidate`, `ONB2Process`. Health probes: `GET …/$metadata`
(Studio test, cron sweep at 04:00 UTC via `vercel.json`, Operations "Probe now") with `lastValidatedAt`
moving only on a real 200.

### 4.3 Fixed in this branch

**A. Env credentials were sent to a stored connection's host (critical, fixed).**
`resolveReadTenant` (`src/lib/sap-public/tenant-for-read.ts`) let the seven `/api/sap/tdd/*` read routes
resolve a tenant from an organization's `SapConnection`, but the connector built every Authorization
header from `{PREFIX}_*` env vars. The deployment's shared credentials were therefore sent to the customer's
`baseUrl`; on a deployment with no env secrets the route threw `Missing required env var` for a fully
configured connection. `SapTenant` now carries an optional `authorization()` provider, `toSapTenant`
attaches one that opens the row's own sealed secrets, and every connector request goes through
`authHeaderFor(prefix, tenant)`. Pinned by `tests/unit/lib/sap-public/credentials-follow-tenant.test.ts`.

**B. Catalogue detail route live-probed without the probe guard (critical, fixed).**
`GET /api/sap/tdd/hub-content/[id]` gated on "may browse the catalogue" and then issued a real `$metadata`
request against the tenant — the pattern `probe-guard.ts` records having closed twice on its siblings.
The live probe is now behind `refuseUnlessMayProbeTenant()`; anonymous and non-Studio callers get the
stored probe instead, so the public catalogue keeps working.

**C. SuccessFactors env tenant could not leave Basic auth (high, fixed).**
`SF_TDD_AUTH_TYPE` now accepts `oauth-saml-bearer` with `SF_TDD_OAUTH_TOKEN_URL`, `SF_TDD_CLIENT_ID`,
`SF_TDD_COMPANY_ID`, `SF_TDD_SAML_ASSERTION`. The exchange lives once, in
`src/lib/sap-public/oauth-saml-bearer.ts`, and is used by both the stored-connection and env paths so a
future live verification fixes both. `.env.example` now documents the removal date and defaults the SF
auth type to the surviving flow.

**D. Live-SAP throttle coverage (high, fixed).** `POST /api/sap/tdd/write`, `hub-content/write-test`,
`/api/ops/connections-health/probe` and `/api/studio/test/broker-run` all reach a tenant and sat in the
generous default buckets; they are now in `sapLive` (20/min). `hub-content/api-reference-import`, a
DB+GitHub import driven as a chunk loop, was wrongly caught by the detail-route pattern and is excluded.

**E. Smaller items.** `scripts/probe-tenant-capabilities.ts` hardcoded `edition: "PUBLIC"` regardless of
`PROBE_PRODUCT` (now uses the product's edition); `/api/admin/overview` hardcoded `"2602"` (now
`APP_CONFIG.sapVersion`); the hub-content runbook's drift table disagreed with its declared source of
truth (now matches `S4_PUBLIC_PUBLISHED_COUNTS`); `.env.example` documented `ENABLE_API_HUB_GROUNDING`
backwards (it is on by default and only `"0"` disables it) and omitted the three other OData product
prefixes and their `TENANT_ENVIRONMENT` / `TENANT_CLIENT` variables.

### 4.4 Moving the catalogue to 2608

The application is built for this: `ScopeCatalogVersion` is keyed by `(version, edition)`, verdicts pin
to a version, and `scripts/ingest-sap-zip.ts` upserts a new version row per ingest. What it needs is the
2608 SAP Best Practices content export, which is not in the repository and cannot be fetched by the app.

1. Download the S/4HANA Cloud Public Edition 2608 Best Practices package (scope items, process steps,
   configuration and setup guides) from SAP Signavio Process Navigator / Best Practices Explorer with an
   S-user.
2. `pnpm ingest <zip>` — creates `ScopeCatalogVersion(version="2608", edition="PUBLIC")`.
3. Set `sapVersion` in `src/constants/config.ts` to `"2608"` and update the `release` strings in
   `src/lib/fts/data/*.ts` and the value-stream seeds only after the ingest exists; changing the label first
   would claim a catalogue the database does not hold.
4. Re-run `pnpm sap:catalog:import` from a fresh Business Accelerator Hub export
   (`docs/runbooks/sap-catalog-ingest.md`) so `SapApiReference` reflects 2608 API releases.
5. Run `pnpm sap:tdd:capabilities` against the TDD tenant to refresh live activation status.

### 4.5 Still open in the SAP layer (ranked)

| Sev | Item | Where | Suggested fix |
|---|---|---|---|
| High | `POST /api/sap/tdd/write` and `hub-content/write-test` accept env tenants only (`getSapTenant`), so a connection key chosen in the Studio switcher 400s on the write routes — the exact defect `tenant-for-read.ts` fixed on the read routes | `write/route.ts:113`, `write-test/route.ts:95` | Resolve through `resolveReadTenant`; with fix A above the credentials now follow the tenant, so this is a two-line change per route. |
| High | A `sapClient` can be issued on a credential for a product that has no SAP client (S/4 Public, SF, Ariba); every call then refuses with `NO_MATCH_FOR_CLIENT` | `src/app/api/studio/clients/route.ts:45-59` | Reuse the `PRODUCTS_WITH_CLIENT` refinement from `studio/connections/route.ts`. |
| High | Ariba and ECC interfaces can be registered but never served: both have empty service lists and `resolveHubService` returns null for non-edition products; Ariba has no stored-connection path at all | `studio/interfaces/route.ts:51`, `resolve-hub-service.ts:32` | Refuse registration for products without a resolvable service, or add an Ariba REST path to the broker. |
| Medium | `docs/coreedge-sap-target-expansion-spec.md` is stale in five places (says `sap-client` appears nowhere, that SAML bearer is unimplemented, that Private/On-prem rows are zero) | spec §§2-3 | Rewrite against the current registry. |
| Medium | Env-path OAuth client-credentials has no token cache: every `$metadata` probe re-exchanges | `tdd-connector.ts` `fetchOAuthToken` | Cache per prefix as the SAML path now does. |
| Medium | The harvested Hub artifacts are produced by `scripts/harvest-sap-api-hub.ts`, an automated anonymous walk of `api.sap.com`, while `sap-references/hub-content/README.md` forbids exactly that under SAP's terms | scripts vs README | Decide the policy once; either activate the sanctioned OAuth Path C or retire the harvester. |
| Low | `EVENT` rows can never leave `AVAILABLE` (a `TODO` for subscription verification); v4 service paths are best-effort guesses; invented "scenario" ids for SuccessFactors (`SF_EC`, `SF_RCM`, `SF_ONB2`) render beside real `SAP_COM_xxxx` values; `ARIBA_TDD` is a dead env prefix; `hub-harvest-remote.ts` fetches without a timeout | as named | Housekeeping. |

---

## 5. Codebase health — findings

Method: two independent read-only passes (auth/RBAC/routing/e2e and SAP connectivity) over the whole tree,
each claim verified against the file before it appears here. Severity is impact-weighted.

### 5.1 Fixed in this branch

| Sev | Finding | Fix |
|---|---|---|
| High | **Open redirect via backslash.** Five "relative path only" sanitizers rejected `//` but not `/\`; the WHATWG parser resolves `/\evil.com` to `https://evil.com/`. The NextAuth `redirect` callback consumed an attacker-suppliable `callbackUrl`, so a magic-link click could land a freshly authenticated user on another host. | One helper, `src/lib/http/safe-relative-path.ts`, resolves the candidate the way a browser would and keeps only same-origin results; the five sites use it (`auth-options.ts`, `api/auth/bridge`, `dev-login`, `verify-mfa`, `api/studio/tenant`). `tests/unit/http/safe-relative-path.test.ts` pins the escape forms and scans the five files for a reintroduced inline rule. |
| High | **Register writes had no role gate.** Integrations, data-migration and OCM `POST/PUT/DELETE` enforced membership and the sign-off lock only; `assertCanManageRegister` was imported by no route. A `viewer`, `executive_sponsor` or `support` user could write register rows. | The nine mutating handlers now return 403 unless `getRegisterPermissions(user.role).canEdit` (platform_admin, consultant, it_lead, data_migration_lead). `tests/unit/api/register-role-gate.test.ts` scans every handler. |
| High | **`WORKBENCH_ONLY` stranded the Console's own prerequisites.** `/verify-mfa`, `/settings/security`, `/invitations/[token]` and `/verify/[token]` were not in `WORKBENCH_PATHS`, so an organization with `mfaPolicy=required` was redirected to `/workbench` before it could step up and was locked out of Studio, Operations and Control Tower; invitation and security-notification links were dead on the production host. | Added to the allow-list; `tests/unit/routing/workbench-prerequisite-paths.test.ts` reads the redirect targets out of the three Console layouts so a new one fails CI. |
| Medium | Required production secrets undocumented: `PRESALES_CSRF_SECRET` (build fails without it), `PRESALES_INTERNAL_SECRET` (sign-off silently completes without a PDF when unset), `ALLOW_SIMULATION_BRIDGE_IN_PROD`, `NEXT_PUBLIC_SENTRY_DSN`, `PRESALES_EMAIL_FROM` | Documented in `.env.example`. |

### 5.2 Open, ranked (with the file to start from)

| # | Sev | Finding | Where | Suggested fix |
|---|---|---|---|---|
| M-1 | Medium | API-level MFA step-up is inconsistent: `requireAdmin`/`requireAssessmentAccess` check `isMfaRequired`, but 88 of 129 routes calling `getCurrentUser()` directly never do; page layouts enforce it, direct API calls skip it | `src/lib/auth/admin-guard.ts:27`, `assessment-guard.ts:35` vs e.g. `api/search/route.ts` | A `requireUser({ mfa: true })` helper, or enforce in middleware for `/api/**`. |
| M-2 | Medium | The NextAuth JWT acts as a 24 h unrevocable refresh token: middleware re-bridges whenever the NextAuth cookie exists without `abeam-session`, so an admin revocation is undone by deleting one cookie. No idle timeout despite `lastActiveAt` | `src/middleware.ts:343-347`, `api/auth/bridge/route.ts:56` | Record the JWT `jti` on the bridged session and refuse to re-bridge a consumed one; add an idle timeout. |
| M-3 | Medium | Three RBAC sources still contradict (`permissions.ts` vs `permission-matrix.ts` vs `role-permissions.ts`): `project_manager` may edit scope in the matrix and not in `canEditScopeSelection`; `partner_lead` may add step notes in the matrix and is read-only in `canEditStepResponse`; V1 and V2 status-transition tables disagree on `partner_lead`/`executive_sponsor`; two role hierarchies disagree | `src/lib/auth/permissions.ts:65-70,167-172,274-277`, `status-machine.ts:40-54`, `role-metadata.ts` | Fold `permissions.ts` into the matrix and extend `permission-source-reconciliation.test.ts` to cover it. |
| M-4 | Medium | Backdoor "production" detection differs: test-login and the simulation bridge use `NODE_ENV`, dev-seed and the build guard use `VERCEL_ENV`; `check-production-env.js` lists `ALLOW_TEST_LOGIN`, which nothing reads | `test-login/route.ts:35`, `dev-seed-guard.ts:44`, `check-production-env.js:77,101` | One `isProductionDeploy()` helper used by all five. |
| M-5 | Medium | `INTERNAL_TEST_DEPLOYMENT=true` has undocumented runtime effects beyond the build acknowledgement: it disables plan feature gating, removes assessment caps and enables the Affirm sandbox | `commercial/feature-gate.ts:41`, `usage-metering.ts:40`, `api/affirm/sample/route.ts:22` | Document, or split into a separately named flag. |
| M-6 | Medium | E2E coverage is thinner than the scripts suggest: CI runs four smoke specs plus one discovery spec; the admin/PO/IT/exec/journeys/edge-cases/responsive projects never run in CI; `tests/e2e/discovery-seam.spec.ts` matches no project and never runs anywhere; journeys self-skip without seeds and nothing invokes `tests/seed/*` | `.github/workflows/ci.yml:144-156`, `playwright.config.ts` | Rename the orphan spec to `.consultant.spec.ts`; add a seeded e2e job with `REQUIRE_SEED=1`. |
| M-7 | Medium | Coverage thresholds in `vitest.config.ts` (90% for `lib/auth`, `lib/security`) are never enforced — CI runs `pnpm test --run`, not `test:coverage` | `ci.yml:83` | Run coverage in CI or delete the thresholds. |
| M-8 | Medium | Legacy `admin` rows bypass last-admin protection: the deactivate/delete route compares `target.role === "platform_admin"` on raw DB values without `mapLegacyRole`; the e2e global setup still seeds `admin` | `api/admin/users/[userId]/route.ts:79-81,160-162`, `tests/e2e/global-setup.ts:30` | Normalise with `mapLegacyRole`, count both spellings, run `pnpm migrate:roles`. |
| M-9 | Medium | Docs claim TOTP MFA that does not exist (passkey-only shipped); `TotpSetupForm`/`TotpVerifyForm` have no importers; `TOTP_ENCRYPTION_KEY`/`TOTP_ISSUER` are set in CI and read nowhere. `CONTRIBUTING.md` says the Playwright image is not digest-pinned and visual regression is non-blocking; `ci.yml` pins by digest and has no `continue-on-error` | `docs/BUILD-PHASES-STATUS.md:40-47`, `docs/HANDOFF.md:96-101`, `CONTRIBUTING.md:65-85` | Correct the docs; delete the dead TOTP components and env. |
| M-10 | Medium | `/api/dev/seed-affirm` stores `role="client"` (not a `UserRole`; maps to `viewer`) and mints sessions outside `createSession`, bypassing the concurrent-session policy | `api/dev/seed-affirm/route.ts:79,535-611` | Use a real role and `createSession`. |
| L-1 | Low | `scripts/check-node-version.mjs` requires **exactly** 22.22.1 for every script; any host on a later 22.x patch (this sandbox: 22.22.2) cannot install without `SKIP_NODE_VERSION_CHECK=1` | `.nvmrc`, `scripts/check-node-version.mjs` | Allow `>=22.22.1 <23` locally; keep the exact pin for `volta`/CI. |
| L-2 | Low | `TENANT_SCOPE_GUARD` defaults to `log` in production, so unscoped Prisma queries are permitted and only logged | `src/lib/db/tenant-guard.ts:93-99` | Flip to `enforce` once the exemption list is complete. |
| L-3 | Low | Dead config: `APP_CONFIG.magicLinkExpiryMinutes` (real TTL is 24 h) and `sessionConcurrentLimit` (real limit is the org setting); four `NEXTAUTH_URL ?? "http://localhost:3000"` fallbacks on a :3003 app | `src/constants/config.ts:6-7`, `login-notify.ts:89` and three siblings | Remove or correct. |
| L-4 | Low | `sign-pdf` compares its shared secret with `===` (acknowledged in a comment); `verify-izzat` fabricates `127.0.0.1` when the IP is unknown; test-login accepts any `role` string | `api/presales/sign-pdf/route.ts:42`, `verify-izzat/route.ts:98`, `test-login/route.ts:103` | `timingSafeEqual`; `null`; validate against `ALL_USER_ROLES`. |

### 5.3 What is sound (so the list above is read in proportion)

Session tokens are SHA-256 hashed at rest; every backdoor secret is length-checked and compared with
`timingSafeEqual`; magic links go through a sealed AES-GCM interstitial with a POST-only continue; logout is
POST-only and clears chunked NextAuth cookies; WebAuthn challenges are HMAC-signed, one-time and
`sameSite=strict`, with decoy credentials closing the enumeration oracle; auth endpoints sit in a 30/min IP
bucket; cron routes need the `CRON_SECRET` bearer; connection secrets are AES-256-GCM sealed and AAD-bound to
their row; the northbound broker refuses ambiguous environment bindings and undeclared-environment writes;
all 314 API routes carry a credential check of some kind (the 10 without a session guard are public by
design and listed in the agent report).

---

## 6. Files changed in this branch

| Area | Files |
|---|---|
| SAP credentials follow the tenant | `src/lib/sap-public/tdd-connector.ts`, `src/lib/sap-public/connection-resolver.ts`, `tests/unit/lib/sap-public/credentials-follow-tenant.test.ts` |
| SuccessFactors SAML bearer on the env path | `src/lib/sap-public/oauth-saml-bearer.ts` (new), `tdd-connector.ts`, `connection-resolver.ts`, `.env.example`, `tests/unit/studio/saml-bearer-auth.test.ts` |
| Probe guard on the catalogue detail route | `src/app/api/sap/tdd/hub-content/[id]/route.ts` |
| Live-SAP throttle coverage | `src/lib/security/rate-limit.ts`, `tests/unit/security/live-sap-route-throttle.test.ts` |
| Open redirect | `src/lib/http/safe-relative-path.ts` (new), `src/lib/auth/auth-options.ts`, `src/app/api/auth/bridge/route.ts`, `src/app/(auth)/dev-login/page.tsx`, `src/app/(auth)/verify-mfa/page.tsx`, `src/app/api/studio/tenant/route.ts`, `tests/unit/http/safe-relative-path.test.ts`, `tests/unit/studio/tenant-switch-navigation.test.ts` |
| Register role gate | six routes under `src/app/api/assessments/[id]/{integrations,data-migration,ocm}/`, `tests/unit/api/register-role-gate.test.ts` |
| Routing allow-list | `src/lib/routing/workbench-paths.ts`, `tests/unit/routing/workbench-prerequisite-paths.test.ts` |
| Housekeeping | `scripts/probe-tenant-capabilities.ts`, `src/app/api/admin/overview/route.ts`, `docs/runbooks/sap-hub-content-ingest.md`, `.env.example` |

---

## 7. Recommended order of follow-up

1. Set the test-login variables on the internal-test deployment (§3.3) and share the secret through the team password manager, not this file.
2. Before 20 November 2026: point the SuccessFactors tenant(s) at `oauth-saml-bearer` and run the Studio connection test once against a real tenant — that single test is what turns the flow from "documented" into "verified".
3. Ingest the 2608 Best Practices package (§4.4).
4. Fix the two remaining SAP write-route tenant resolutions (§4.5, first row) — small now that credentials follow the tenant.
5. Work §5.2 top-down; M-1, M-2 and M-8 are the ones with a security edge.
