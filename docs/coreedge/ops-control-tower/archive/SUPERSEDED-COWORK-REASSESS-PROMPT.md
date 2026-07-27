# MISSION BRIEF — Full Reassessment & Rework of the CoreEdge Ops Center + Control Tower Build Pack

**You are a fresh Claude Cowork session running Opus 5. You have no prior context. Everything you need is in this brief, the attached files, and the GitHub repository. Do not assume anything this brief claims is true — your first job is to verify all of it against the code.**

---

## 1 · Identity and inputs

- **Repository:** `ib823/aptus`, branch `main` — use the GitHub connector to read the **latest** commit. As your very first action, record the exact HEAD SHA and cite it in every finding (`file:line @ <sha>`). The pack below was grounded at `70a6cec` (#167); `main` may have advanced — re-ground everything against the tip, never against this brief's memory of it.
- **Attached build-pack files** (all seven, from `docs/CoreEdge Operarator and Control Tower/` in the repo — if any attachment is missing, read it from the repo instead; if it is missing in both places, STOP and report):
  1. `CCC-Ops-ControlTower-Build-Bible.md` — engineering contract (build order PR-Rbac → PR-CT1…CT5, guardrails, DoD tests)
  2. `CoreEdge-Ops-ControlTower-CCC-Runbook.md` — verify-then-execute runbook
  3. `CoreEdge-Ops-ControlTower-Inventory_1.md` — content spec v2 (capability → real data source → status)
  4. `CoreEdge Ops & Control Tower.dc2.html` — the visual contract (the corrected design; any older `.dc.html` of the same screens is superseded)
  5. `CoreEdge-Studio-Design-Book.html` — design system
  6. `CoreEdge-Design-Tokens.md` — tokens (verbatim authority)
  7. `CoreEdge Developer Studio.dc.html` — the built Studio, family precedent
- **Product context you must honor (verified decisions, not up for re-litigation):**
  - CoreEdge is a runtime platform; the northbound broker (`/api/northbound/*`) is built in-house and is authorized work ("STOP-gate B" cleared 2026-07-25 by the product owner).
  - Ops Center and Control Tower are **read/govern layers over data already captured**. They introduce **no new SAP access path**. The only permitted mutation in the two new workspaces is the Control Tower **grant decision** (platform_admin, SoD, ConfigAudit).
  - Digital Access Meter is a separate future spec; DA screens render as clearly-labelled "forthcoming" placeholders, never live.
  - KMS/Vault custody of `SAP_CONNECTION_ENCRYPTION_KEY` is a known, deliberately deferred gap — do not scope it into this front, but do not contradict it either.
  - Honest status (empty ≠ needs-setup ≠ error) and honest environment (PROD flagged, unknown never guessed, nothing fabricated) are the product's trust differentiators and override any design mock.

## 2 · Operating rules — non-negotiable

1. **Exhaustive, no sampling.** Read every attached file completely. Read every code file you cite completely enough to be sure. Enumerate — do not spot-check — the API routes, models, and libs in scope (listed in §4).
2. **No assumptions, no trust in this brief.** Every claim below (including the seeded findings in §5) is a **hypothesis**. Independently re-derive each one from the code at your pinned SHA. Your verdict per item is `CONFIRMED` / `REFUTED` / `CHANGED SINCE` (with what changed), always with `file:line @ sha` evidence.
3. **Never fabricate.** If a design element cannot be backed by a real data source, the correct output is "omit or flag" — never an invented metric, state, or environment.
4. **STOP-report, don't guess.** If the repo is unreadable, a file is missing, or two authorities conflict irreconcilably, stop that thread and record it in the blockers section of D1 — then continue with the rest.
5. **Keyed findings.** Every finding gets a stable key (`F1…Fn`, keep the numbering in §5; new ones continue from `F30`). The human will diff your register against a prior independent assessment — unstable keys destroy that.
6. **Rework, don't patch-note.** Where the pack is wrong or incomplete you produce **full replacement documents** (D2–D4), not a list of suggested edits. The replacements must be executable by a coding session that has never seen the originals.

## 3 · What you are assessing (the whole, in one sentence)

Whether the attached build pack — as written — can be executed against the **current** codebase to produce the Operations Center and Control Tower workspaces *correctly*, and where it cannot (spec defects, upstream code gaps it silently depends on, drift since #167, unbackable design claims), rework the pack so it can.

## 4 · Phase 1 — Codebase recon (the bible's §2, expanded; enumerate all, cite all)

Confirm existence, exact shape, and behavior of:

- **Shell/RBAC:** `src/app/(studio)/layout.tsx`, `src/components/studio/StudioShell.tsx`, `StudioRail.tsx` (does it already accept a `sections` prop?), `StudioTopBar.tsx` (`EnvChip`, origin `Dot`, tenant switcher), `src/lib/studio/rbac.ts` (`WORKSPACES` incl. `operations-center`/`control-tower` placeholders, `accessibleWorkspaces`, `canAccessStudio`, `canMutateStudio`, `lacksStudioTenantScope`, `isAdminRole`), `RoleGatedEmptyState.tsx`.
- **PR-Rbac targets:** `src/types/assessment.ts` (`UserRole` union), `src/lib/auth/role-metadata.ts`, `src/lib/auth/permission-matrix.ts`, `src/lib/auth/dev-login.ts`. Confirm `support` role absent; confirm no `(operations)` / `(control-tower)` route groups.
- **Models** (`prisma/schema.prisma`): `NorthboundAuditEvent` (full field list; is `durationMs` present? is `connectionId` present?), `NorthboundIdempotencyKey`, `ConfigAudit`, `SapConnection` (`environment`, `lastValidationStatus`, `lastValidatedAt`, `writeEnabled`, `isActive`), `SolutionClient` (`lastUsedAt`/`expiresAt`/`revokedAt`, `secretsCiphertext`), `Solution`, `Interface`, `ApiAccessGrant`. Note the indexes on the two feed tables and judge whether the planned Ops aggregations (filter by solution / environment / time window) are served by them.
- **Libs:** `src/lib/northbound/{audit,auth,access,read,write,idempotency,issue,write-credential,respond}.ts`, `src/lib/studio/{connection-health,tenants,grants,tenant-scope}.ts`, `src/lib/sap-public/{connection-resolver,connection-crypto}.ts`, `src/lib/security/rate-limit.ts` (does any **non-consuming** peek exist?), `src/middleware.ts`.
- **Broker routes:** all of `src/app/api/northbound/**` — confirm the in-route 429 path writes an audit row before returning; trace exactly where `environment` on the audit row comes from and which connection a call actually uses.
- **Compose endpoints for Control Tower:** `api/admin/{users,organizations,overview}`, `api/roles`, `api/partner/settings`, `api/analytics/{portfolio,benchmarks,cross-phase}`, `api/dashboard/kpi` — confirm each exists, its auth gate, and its response shape (Control Tower composes these; it must not rebuild them).
- **Tests that must stay green:** the append-only audit test, tenant-scope tests, northbound unit tests — name the exact files.
- **CI reality:** `.github/workflows/*` — what actually runs (`typecheck:strict`, `lint:strict`, vitest, build), so the pack's per-PR green bar is stated against real jobs.

## 5 · Phase 2 — Seeded findings register (verify each; these came from a prior independent assessment)

**Pack-level defects:**
- **F1 · Throttle gauge observer effect.** Bible §6 `/api/ops/throttle` proposes a live gauge from `checkRateLimit(...)`, but `checkRateLimit` is a *consuming* call (in-memory pushes a timestamp; Upstash `limit()` spends a token) and no peek/read-only variant exists in `src/lib/security/rate-limit.ts`. As specced, the dashboard would eat each client's 60/min northbound budget and could trigger the 429s it displays. Rework must specify a non-consuming `peekRateLimit` in PR-CT2.
- **F2 · Inventory filename mismatch.** Bible/runbook cite `CoreEdge-Ops-ControlTower-Inventory.md (v2)`; the actual file is `CoreEdge-Ops-ControlTower-Inventory_1.md` (contents are v2).
- **F3 · Referenced-but-missing companion docs.** `CCC-Digital-Access-Meter-Build-Spec.md` and `CoreEdge-Master-Build-Index-v2.md` do not exist in the repo (only the v1 index at `docs/coreedge/CoreEdge-Master-Build-Index.md`). Front-2-only, but the pack must stop implying they exist.
- **F4 · Bible §2 favorable drift.** `StudioRail` reportedly already accepts a `sections` prop (bible says hardcoded) — PR-CT1 may be smaller than specced. Verify and right-size PR-CT1.

**Upstream code gaps the build sits on (from the same prior assessment of the broker/studio; each one either undermines an Ops/CT screen or empties it):**
- **F5 · Environment→connection binding is decorative.** `resolveSapConnection(orgId, product)` (`src/lib/sap-public/connection-resolver.ts`) returns the oldest active connection; `SapConnection.environment` is never filtered on; call sites (`data/route.ts`, `write/route.ts`) pass no environment. A SANDBOX token/grant can be brokered onto a PROD connection — including writes.
- **F6 · Audit environment can be sincerely wrong.** `NorthboundAuditEvent.environment` is stamped from the **token**, and no `connectionId` is recorded — so given F5, the Ops "honest environment" views and the "PROD write attempts" incident detector would be built on unreliable data. Rework: PR-CT2's additive migration (already adding `durationMs`) must also add `connectionId` + the *connection's* environment, and F5 must be fixed in a pre-work PR.
- **F7 · `READ_ONLY`/`SANDBOX_ONLY` grant decisions do not constrain the runtime.** `isGranting` (`src/lib/studio/grants.ts`) treats both as fully granting; `access.ts` accepts a READ_ONLY decision as write authorization. Control Tower's "progressive trust" display would show governance the broker ignores. Must be fixed before PR-CT4.
- **F8 · The gated write cannot be provisioned.** `setWriteCredential`/`generateWriteCredential` (`src/lib/northbound/write-credential.ts`) have no callers outside tests → every northbound write 403s → the Ops **write ledger** (in-flight/completed/replayed/conflicted) and the **write-credential monitor** will be empty-by-construction.
- **F9 · No access-request UI.** `POST /api/studio/access-grants` is called by nothing (the client component only PATCHes) → Control Tower's grant **decision queue** can never be fed through the product.
- **F10 · Approved grants are irrevocable** (no revoke/DELETE path; `evaluateDecision` refuses settled rows; expiry optional). Control Tower governs a ledger nobody can revoke. Surface as a decision point (see §8) — a revoke mutation would amend the "one allowed mutation" rule.
- **F11 · `SolutionClient.lastUsedAt` is fire-and-forget** (`void touch...` on serverless) → the token monitor's dormant/active signals under-report.
- **F12 · No retention/reaper on either feed table.** `NorthboundIdempotencyKey.expiresAt` is indexed but nothing deletes by it; `NorthboundAuditEvent` grows unboundedly; only one Vercel cron exists (`/api/cron/analytics`). Ops aggregations scan tables that only grow.
- **F13 · Broker robustness items** that affect what Ops can honestly display: no `maxDuration` on northbound routes vs. advertised 30s/45s upstream timeouts (platform 504s produce **no audit row** — invisible to Ops); audit writes swallow errors silently (`audit.ts` catch → console only), so traffic feeds under-count precisely when things are worst; `SAP_CONNECTION_ENCRYPTION_KEY` absent from `scripts/check-production-env.js`.
- **F14 · Reads don't require ACTIVE interfaces or live solutions** (DRAFT interfaces and RETIRED/RESTRICTED solutions still serve data) — affects what "healthy/governed" means on the portfolio and traffic screens.

**Your job for §5:** verdict + evidence per key, then **hunt for what this register missed** — especially: anything in `dc2.html` that no real data source backs (walk every screen, every metric, every state in that file against the code); RBAC edge cases in the proposed matrix (e.g. `project_manager` read-all vs. tenant scoping); any conflict between the bible's Control Tower grant-decision mutation and the existing `requireBuilder()`-gated PATCH route; Prisma index gaps for the new aggregate queries; anything on `main` that moved since #167 and invalidates a pack citation. New findings continue from **F30**.

## 6 · Phase 3 — Design-vs-data audit of `dc2.html`

Open the design file and enumerate **every screen, card, metric, filter, and state it renders**, in a table: *design element → claimed data source → real source in code (file:line) → verdict (`backable` / `backable after PR-CTx` / `unbackable — omit or relabel`)*. The runbook claims dc2 already folded in the latency-omit, sapLive live-gauge, and write-ledger fixes — verify that against the actual HTML, don't take it on faith. Anything unbackable must be resolved in your reworked pack (omit, relabel forthcoming, or add the small backing field to a PR), never left ambiguous.

## 7 · Phase 4 — Deliverables (produce ALL five, each as a separate complete document)

- **D1 · Recon & Findings Report.** Pinned SHA; Phase-1 recon table (primitive → status → evidence); the full keyed findings register (F1…Fn, verdict, evidence, disposition — i.e., which deliverable/PR resolves it); blockers; and an explicit `GO / CONDITIONAL GO / NO-GO` verdict for execution.
- **D2 · Build Bible v3** (full replacement). Must incorporate at minimum, subject to your verification: a **pre-work PR** (environment→connection binding fix + `READ_ONLY`/`SANDBOX_ONLY` runtime semantics fix, with tests); PR-CT2 expanded (additive migration = `durationMs` + `connectionId` + connection-environment on `NorthboundAuditEvent`; `peekRateLimit`; audit-writer + call-site changes); right-sized PR-CT1 per F4; honest-empty annotations for the screens F8/F9 empty out; updated §2 recon list at the new SHA; updated DoD tests covering the new fields and the peek function; unchanged guardrails (no new SAP path, append-only audit, secret-safety, structural tenant scope, a11y AA, DA forthcoming).
- **D3 · Inventory v3** (full replacement, correctly named `CoreEdge-Ops-ControlTower-Inventory.md`). Re-tag every capability against the current SHA; add the provenance caveats (F6 until fixed, F11, F13's invisible-504s) so the design never claims more than the data can honestly show.
- **D4 · Runbook v2** (full replacement). Updated attach list (correct filenames, drop references to nonexistent docs or mark them Front-2-future), updated PR sequence including the pre-work PR, and the same verify-then-execute gate.
- **D5 · Execution prompt** for a fresh Claude Code session (Opus 5) that will build PR-by-PR: STEP-0 recon first, then pre-work PR → PR-Rbac → PR-CT1 → CT2 → CT3 → CT4 → CT5, each green on the real CI jobs (`typecheck:strict · lint:strict · vitest · build`) before the next, every §10-style DoD test included, STOP-report discipline. Self-contained: it must not require the reader to have seen D1–D4 conversations, only the D2–D4 documents as attachments.

## 8 · Decision points — surface, do not decide

Present these to the human with a recommendation each, but do not bake a choice into D2–D4 as if settled:
1. Add a **grant revocation** mutation to Control Tower (amends the one-mutation rule) — or defer?
2. Run the **loop-closing fixes** (access-request dialog, `entitySet` editing, write-credential issuance UI) in parallel so the write ledger and decision queue have live data — or accept honest-empty screens for v1?
3. **Retention crons** for the two feed tables in this front — or defer to a separate ops PR?

## 9 · Quality bar for your own output

Done means: every §5 key has a verdict with evidence; every dc2 screen element has a row in the Phase-3 table; D2–D4 are complete standalone replacements an executor can follow without the originals; D5 can be pasted into a fresh session as-is; no claim anywhere without `file:line @ sha`; and anything you could not verify says so explicitly rather than pretending. Silent truncation, "similar to above", and "etc." are failures.
