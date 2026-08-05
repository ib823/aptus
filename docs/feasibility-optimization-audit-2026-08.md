# Feasibility & Optimization Audit — August 2026

A full-codebase assessment run across five parallel deep audits: architecture,
performance, security & multi-tenancy, commercialization readiness, and
engineering health. This document is the synthesis. File references are to the
tree at the time of the audit; the companion PR implements the quick wins
marked ✅ below.

**Scale at audit time:** ~168k LOC across 1,190 TS/TSX files · 171 Prisma
models (5,371 schema lines) · 304 API routes · 292 client components ·
5,329 green unit tests · strict typecheck and zero-warning lint both clean.

---

## 1. The verdict in five sentences

1. **The craft is well above average** — hashed credentials everywhere,
   AES-256-GCM with row-bound AAD, versioned SAP catalog, append-only audit
   trails, digest-pinned visual-regression CI, and honest self-documenting
   comments — but several of the strongest controls were **built and never
   switched on** (the tenant-scope Prisma guard, the entitlement layer, the
   trial expiry sweep, the coverage thresholds).
2. **This is three products, not two**: the Aptus portal (~56k LOC, 213 API
   routes) is switched off in production by `WORKBENCH_ONLY` — yet its API
   routes are still served, and a third of every build/test/typecheck run is
   spent on it.
3. **There are three tenancy regimes**: Studio/Northbound is genuinely
   multi-tenant-grade (the reference implementation); the portal is tenant-safe
   by convention (a convention the commit log shows failing four times in ten
   days, all caught by hand); Affirm/Discovery has **no tenant column at all**
   (creator-scoped only).
4. **The moat is real** (102k ingested SAP process steps, 672 curated scope
   items, a 742-process APQC-mapped library, the guest sign-off flow) — but the
   monetization path is not: no payment capture, advertised tiers unenforced,
   trials that never expired, and an acquisition funnel that was unreachable on
   the primary deployment shape.
5. **The recurring failure signature is scope-of-coverage, not absence of
   controls**: a correct guard exists, a test asserts it over the wrong scope
   (routes but not pages, mutations but not GETs, groups but not paths), and
   the uncovered half fails only in production. Fixing coverage scope is worth
   more than any new control.

---

## 2. What this PR already fixed ✅

| Area | Change |
|---|---|
| CI unblocked | Three stale CVE override floors (undici, fast-uri, brace-expansion) were red-gating every push; bumped and verified green |
| Routing gate | `/d/*` (Discovery guest journey — the gate's third silent failure) and the `/signup` `/pricing` `/terms` `/privacy` funnel are now allow-listed and pinned by test |
| Entitlements | `feature-gate.ts` now exists (BUILD-PHASES-STATUS.md claimed it did); `checkFeatureAccess()` + `isOrgReadOnly()` wired; seat limit enforced on invitations; `/api/cron/trials` finally calls `checkAndExpireTrials()` nightly |
| Funnel analytics | `computePresalesFunnel()` + `GET /api/presales/funnel` — first cross-bundle read of the 32-event presales audit vocabulary (stage conversion, drop-off, median time-to-view/sign) |
| AuthZ | `generateMetadata` in the assessment layout and affirm bundle pages fetched outside the page's gate, leaking customer names via `<title>` to id enumeration; both now apply the page's own access rule |
| Query perf | Serial-await batches fixed in complete-package report (5 counts), area-overview (4 loads), config-matrix (7→2 batches); presales bundle list projected (was dragging snapshot JSON blobs per row); Upstash `ephemeralCache` enabled |
| DB indexes | 8 missing FK indexes on live paths (Account.userId, AffirmResponse.questionId, PresalesAuditEvent.actorUserId, DiscoveryEvent.actorId, DiscoveryNote.grantId, PresalesBundleDecision.setByGrantId, ApiAccessGrant.solutionId, TestCase.interfaceId) — migration verified drift-free against a replayed history |
| CI speed | `.next/cache` restored in all three build jobs (every build was fully cold) |

---

## 3. Architecture feasibility

### 3.1 The monolith is sustainable — the dormant product is not

One app + one DB is fine for 6–12 months: the module import graph is ~90%
clean between products, no CoreEdge table references `Assessment`, and the
shared kernel (`Organization`/`User`/`Session`) is legitimately shared. What is
not fine:

- **The dormant Aptus portal still serves its 213 API routes.**
  `middleware.ts` gates *pages* only; all `/api/*` falls through. The portal's
  API surface answers on the live host, protected solely by per-handler guards
  — the same guards that recently had read-path holes. **Recommendation
  (do first, S):** extend the `WORKBENCH_ONLY` gate to `/api/` with an
  allow-list (~20 lines of middleware). Decide the portal's fate explicitly —
  dormant-and-gated, or extracted.
- **Deploy/build coupling is total** and documented
  (`docs/deployment-urls.md`): one build, one pool, one 80-variable env
  namespace where 8 test-backdoor toggles live beside production auth. 4 GB
  heaps for build *and* typecheck; a full `next build` on every push. Do not
  split the deployment yet (the two-host split invalidates every passkey via
  the RP-ID change) — but move the backdoor toggles behind one compound guard,
  set `connection_limit`/`pool_timeout` explicitly, and lighten the pre-push
  hook to typecheck+lint.

### 3.2 Authorization needs one chokepoint, not 142 predicates

142 authz predicates across 10+ policy modules; guards live on API routes
while RSC pages render the same rows. Four commits in ten days fixed the same
read-path bug class in four surfaces, and this audit found (and fixed) a fifth
instance in `generateMetadata`. **Recommendation (M):** introduce one
`authorize(subject, action, resource)` that *returns the scoped Prisma
`where`*, so an unscoped query cannot be constructed; keep the per-domain
matrices as data feeding it. Extend the guard-coverage tests to **GET routes
and `page.tsx`/`layout.tsx`** — the existing tests cover mutations and
`route.ts` only, which is precisely why the page holes survived.

### 3.3 Three duplicate guest-link stacks

`presales/`, `affirm/external/`, `discovery/external/` independently implement
tokens · OTP · CSRF · cookies · sessions · audit (~3,400 LOC over three
near-identical table families). Every security property must be independently
correct three times; the commit log shows it was not. **Recommendation (M):**
extract one `lib/guest-access` parameterised by surface. Highest security ROI
per line in the repo.

### 3.4 Other structural items

- The routing allow-list should be **derived from route groups on disk** with
  per-path opt-outs, and one CI smoke job should run with `WORKBENCH_ONLY=true`
  so the gate stops being inert in every test environment.
- `Assessment` (82 fields, 38 inbound relations) and `User` (62 fields, 28
  back-relations) are god-models — do **not** decompose the dormant one; do
  convert the 31 stringly-typed `status` columns to enums opportunistically.
- Root directories `Conversion/` (600 KB, zero references, ships to Vercel)
  and `fit-portal-transfer/` (historical specs) should be deleted or archived;
  `sap-references/` (6.8 MB) should join `.vercelignore` if runtime reads
  allow.
- The ADR record covers only the dormant product (all 11 ADRs from a 4-day
  window). Write four ADRs against current reality: one-deployment/three
  surfaces, the routing gate, guest access as one mechanism, the shared role
  vocabulary.

---

## 4. Performance

### 4.1 The two biggest levers

1. **The app is effectively uncached and unstreamed.** 133 `force-dynamic`
   pages, 3 `loading.tsx`, 4 `Suspense` boundaries, ISR nowhere. Every page
   blocks on its full query set before the first byte. Meanwhile the SAP
   catalog is *versioned-immutable by design* (`ScopeCatalogVersion` exists so
   ingests create rather than mutate) and `src/lib/db/cached-queries.ts`
   already implements the correct `unstable_cache` + `revalidateTag` pattern —
   for 4 queries out of ~600. **Extend that pattern to the catalog read paths
   (S), then add `loading.tsx`/`Suspense` per route group (M).**
2. **N+1 loops inside open transactions** on the classification save path:
   `propagation-logger.ts`, `propagation-engine.ts` (undo paths),
   `classification-applier.ts` — 2–3 serial queries per row in nested loops
   while holding a transaction, at `connection_limit=5`. The measured
   48-second RSC fetch (`safe-push.ts:45`, attributed to pool exhaustion) is
   the symptom. These are portal-surface modules with no test coverage, so
   they were deliberately **not** rewritten in this PR — add tests first, then
   batch: hoist reads, `createMany` writes, guard-in-WHERE updates. (M)

### 4.2 The rest, in priority order

- 285 of 340 `findMany` calls carry no `take`; worst user-visible offenders:
  `console/topology` (entire tenant topology, one JSON blob), `templates`,
  admin list routes. Add `take` + cursors. (S)
- 8-level-deep unbounded `include` trees: requirements provenance, catalog
  hierarchy, affirm release. Flatten or bound. (S)
- Global search (`api/search`) uses leading-wildcard `ILIKE` — a sequential
  scan per keystroke. Add a `pg_trgm` GIN index or tsvector column. (M)
- Only 2 `next/dynamic` call sites across 292 client components; no bundle
  analyzer configured. Add `@next/bundle-analyzer`, dynamic-import
  `TopologyMap` (970 lines), `driver.js`, `cmdk`, `@tanstack/react-table`. (M)
- Vitest runs **all** 306 test files under jsdom; most test pure `src/lib`
  logic. Default to `node`, opt into jsdom per-file — the cheapest big CI win
  after the build cache. (S)
- `tests/performance/` is entirely synthetic — it asserts "no N+1 in report
  data loading" against a mock while `report-data.ts` issues 27 largely-serial
  queries. Wire to a real DB via `$on("query")` or relabel as specs. A green
  suite asserting the absence of the exact problem present in the code is
  worse than no suite. (M)

---

## 5. Security & multi-tenancy — what must be true before a second customer

Ordered; items 1–4 are the P0 set.

1. **Give Affirm and Discovery a tenant.** `AffirmBundle` and
   `DiscoveryEngagement` carry a free-text `client` and nullable
   `createdById` — no `organizationId`. Isolation is per-consultant (two
   colleagues cannot see each other's work; a departing consultant's
   engagements become admin-locked), and "this data belongs to Customer B" is
   inexpressible. `PresalesBundle.organizationId` is the in-repo precedent;
   backfill from creator's org, then widen `affirmBundleScope()` /
   `discoveryEngagementScope()` from `createdById` to `organizationId` — both
   are single-rule chokepoints by design. (M)
2. **Switch on the guard that already exists.**
   `src/lib/studio/tenant-scope.ts` defines `tenantScopeGuard()` — a
   `$allOperations` extension that throws on unscoped queries against
   tenant-anchored models. It is tested and applied nowhere
   (`src/lib/db/prisma.ts` constructs a bare client). Apply it, expand
   `TENANT_ANCHORED_MODELS` beyond the current 9, run log-only in prod for one
   release, then throwing. Longer term: Postgres RLS as the layer that
   survives an app bug. (S to apply, M to expand)
3. **Delete the org-drop idiom.** `...(user.organizationId ? {…} : {})`
   *removes* the tenant filter for org-less users — and magic-link signup
   mints org-less consultants, so the fail-open state is the default state.
   `lacksTenantScope()` exists; make the scoped-where helper the only way to
   build a tenant query. (S)
4. **Make the security tests execute the real code.** All four
   `tests/security/*` files and the multi-tenant-isolation integration test
   assert against local mocks — they pass against an empty `src/`. Build a
   two-org fixture against a real (testcontainer) Postgres asserting
   wrong-tenant-404 for every `[id]` route and page. This audit stood up a
   throwaway Postgres 16 in-session for the migration drift gate; the same
   approach works in CI. (M)
5. `AssessmentShareLink.token` is stored **plaintext** with nullable expiry —
   the only unhashed credential left. Hash it, require expiry, enforce or drop
   `scopeJson`. (S)
6. SSRF: studio connection `baseUrl` is fetched with no private-IP/host
   checks — a consultant can point a connection at internal services. Resolve
   DNS, block RFC1918/loopback/link-local, allowlist per org. (M)
7. CSRF on the authenticated app rests entirely on `SameSite=Lax` with no
   test asserting it; add an `Origin`/`Sec-Fetch-Site` middleware check for
   state-changing methods. (S)
8. Remove the AAD-less decrypt fallback in `connection-crypto.ts` behind a
   re-seal migration (it currently makes the row-binding bypassable forever),
   and fix `openSecrets` dropping `samlAssertion`/`companyId` — SuccessFactors
   SAML connections seal fine and fail to open. (S)
9. Audit trails are append-only **by convention** — full update/delete surface
   on the client, no hash chain, no DB grants, and reads are not logged
   anywhere. For a product whose PDPA story rests on these trails: hash-chain
   the audit tables, add a no-UPDATE/DELETE role, log guest-surface reads. (M)
10. The test backdoors (`/api/auth/test-login` mints platform_admin sessions)
    are gated behind four locks and a build-time refusal — genuinely careful —
    but they will not survive a customer security questionnaire. Move them to
    a never-deployed entrypoint before external customers. (S)
11. Production config asserts: make `AUTH_INVITATION_ONLY` /
    `AUTH_ALLOWED_DOMAINS` explicit in `check-production-env.js` (empty
    domain-list currently means *open signup*); constant-time compare in
    `sign-pdf`; document `PRESALES_INTERNAL_SECRET` in `.env.example`. (S)

---

## 6. Commercialization

### 6.1 Standalone viability

**ABeam Workbench** — viable now as a **services-attached product** (annual
per-seat or per-engagement license to SI firms, admin-provisioned tenants,
invoicing outside the product). The moat (curated SAP content) and the
deliverable (21 report endpoints, ZIP blueprint package, hash-anchored
sign-off certificates, Jira/ADO/SAP-ALM egress) are genuinely sellable. The
self-serve $299/$799 motion the pricing page advertises is 6–9 months away and
gated on payment capture. The guest review flow is the most polished asset in
the repo — sell around it.

**CoreEdge Console** — technically the more mature product, commercially
undefined. It has the best usage substrate in the codebase
(`NorthboundAuditEvent` records every call with org, operation, rowCount) and
bills on none of it. Its natural model is consumption-based; start metering
now (rollup into `UsageEvent` on the existing reap cron) so pricing can be
chosen from real distribution data. Today it rides free inside a Workbench
sale.

**The deepest commercial-model gap:** there is no product dimension — one
`Organization.plan` column governs both products. A customer buying only
CoreEdge gets a `maxActiveAssessments` limit for a product they never bought.
The first billing-adjacent schema change should be a `Subscription` entity
with `productLine`, provider-agnostic external IDs, migrated off the org
columns — *before* any processor is chosen. The full removed Stripe design
survives in `specs/v2/PHASE-29.md` for when payment capture returns.

### 6.2 Roadmap by revenue impact (after this PR's fixes)

| # | Capability | Effort | Note |
|---|---|---|---|
| 1 | Payment capture + self-serve upgrade | L | First step is the `Subscription` entity (S); processor choice can wait |
| 2 | Org-scope Affirm/Discovery | M | Also security P0 — same migration serves both |
| 3 | Resolve the ownership/brand question | S (legal) | LICENSE says individual (`ib823`); product says ABeam across 161 files; ToS names a fourth product. Due-diligence blocker for any deal, and it compounds with every commit. Also: the repo is public — trade-secret protection over the moat is being forfeited by publication |
| 4 | CoreEdge consumption metering | M | Nightly rollup `NorthboundAuditEvent` → `UsageEvent` on the existing reap cron |
| 5 | Product analytics | S | Server-side `track()` only (preserves the Sentry/PDPA privacy posture); first five events: signup, assessment_created, bundle_sent, report_downloaded, **limit_hit** (the upgrade-intent signal, now reachable since limits enforce) |
| 6 | Surface the funnel in the UI | S | The API now exists (`/api/presales/funnel`); render it on `/presales` and gate it behind `checkFeatureAccess(org, "analytics")` as a Professional-tier differentiator |
| 7 | Enterprise trust package | M | Implement `Organization.dataRetentionDays` (a column nothing reads is a liability, not a feature); write incident-response + backup-restore runbooks; DPA/subprocessor list; the PDPA work is already strong — lead with it |
| 8 | PPTX deck export | M | The buyer is a consulting partner who delivers decks. `report-data.ts` is already renderer-agnostic (PDF + XLSX consume it); add `pptx-generator.ts` as a third consumer, 6-slide executive pack, gate as a paid feature |
| 9 | White-label decision | S (decision) | `custom_branding` is sold as an Enterprise feature; `brandColor()` architecturally forbids full white-label. Either honour it (unlock the locked brand roles for an OEM tier) or stop selling it |
| 10 | Content refresh cadence | M | The moat's weak point: catalog refresh is manual with no staleness indicator. Add a "catalog current as of / next SAP release" surface + a scheduled reminder; deepen the 3-item FTS decision-set library (the actual IP) |

### 6.3 Notes from the funnel data model

The presales audit vocabulary is a complete prospect funnel
(`bundle_sent → landing_viewed → otp_verified → session_started →
decision_set → signoff_completed`), already indexed by `[eventType,
createdAt]`. Affirm and Discovery have parallel vocabularies — once they are
org-scoped (item 2), the same `aggregateFunnel()` shape applies to them.

---

## 7. Engineering health

Verified live in this audit (all on Node 22.22.2 with the skip flag):
install 54s · strict typecheck clean 1m27s · lint clean 30s · **5,329 unit
tests green** in 2m26s · security audit gate **red → fixed in this PR**.

Remaining ranked improvements:

1. **Wire coverage into CI** — `vitest.config.ts` defines tiered thresholds
   (90% auth/security/commercial) that CI never runs; they are dead config.
   Run `--coverage` in a non-blocking job first, ratchet to blocking. (S)
2. **CodeQL + secret-scanning workflows** — the only security automation today
   is the dependency audit; an auth-heavy app warrants SAST. (S)
3. **Cover the untested crypto**: `src/lib/intelligence/ai-key-crypto.ts` and
   `src/lib/email` are the highest-risk untested modules of the 11 with zero
   test imports (alm, brownfield, email, flow, intelligence, navigation,
   offline, scope, tour, errors, feature-flags). (M)
4. **One Node pin, not four** — `.nvmrc` + a floor check; exact-patch equality
   across 4 files already broke this audit environment. (S)
5. **Lighten the pre-push hook** — typecheck + lint locally; let CI/Vercel
   preview own the build signal. (S)
6. **Plan the Next 16 + Prisma 7 majors** deliberately — Dependabot ignores
   majors by design. (L)
7. **Consolidate the three archive libraries** (adm-zip + archiver + jszip),
   dedupe zod v3/v4, archive the 17 `_`-prefixed one-off scripts. (M)
8. **Vitest node-default environment** (see §4.2). (S)

Two documentation corrections: `BUILD-PHASES-STATUS.md` claimed
`feature-gate.ts` was "retained" when it did not exist (this PR makes the
claim true), and `docs/adr/README.md` points authority at a file outside the
repo (`~/.claude/plans/…`) and omits AD-13.6 from its index.

---

## 8. Suggested sequencing

**Week 1–2 (small, compounding):** portal API gate in middleware · apply
`tenantScopeGuard()` log-only · delete the org-drop idiom · extend guard
coverage tests to GET + pages · coverage job in CI · CodeQL · server-side
`track()` with five events · funnel on `/presales` behind the analytics
feature gate.

**Month 1–2:** org-scope Affirm/Discovery (one migration, serves security P0
and commercialization #2) · two-org real-DB isolation suite · SAP catalog
`unstable_cache` extension · `Subscription` entity · CoreEdge usage rollup ·
share-link hardening · SSRF egress checks.

**Quarter:** streaming/Suspense rollout · guest-access consolidation ·
classification-path transaction batching (tests first) · PPTX export · trust
package · payment capture — in that order, because everything before payment
capture raises the value of what the checkout sells.

**Standing decision for the owner (not engineering):** resolve the
ib823/ABeam/Aptus/CoreEdge ownership and naming question, and decide whether
this repository stays public. Every other item on this list compounds in
value once that is settled — and several are discounted until it is.
