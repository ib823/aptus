# CoreEdge — Master Build Index (PR-0 → Studio → Phase D)

**One control sheet for the whole build.** It orders every PR across the three bibles into a single
end-to-end sequence, states the model tier and prerequisites for each, and marks the two hard STOP gates.
It is an **index, not a spec** — each PR's authority is its own bible section (cited). Attach this alongside
the three bibles so a Claude Code session always knows *where it is* in the sequence and *what must already
be green* before it starts.

> **How to run it (the plan).** 1) Attach the file set below. 2) Run **CCC Fable 5 in recon-only mode**
> against the codebase to verify every claim/prereq per PR (STEP-0). 3) When recon is clean, **switch to
> Opus 4.8 / 5 and execute PR-by-PR**, each green on CI before the next. Fable is for *verification and the
> mechanical PRs*; Opus is for the *security-critical and judgment PRs* (tiers below). Never let Fable
> execute an **Opus-tier** PR, and never skip a STOP gate.

---

## Authority & file manifest (attach all)

| # | File | Authority for | Needed by |
|---|------|---------------|-----------|
| 1 | `sap-connection-keystone.patch` | PR-0 keystone (per-org `SapConnection`, AES-256-GCM crypto, resolver). **Corrections already applied; verified green; applies clean to `#132`.** | PR-0 |
| 2 | `CCC-Developer-Studio-v1-Build-Bible-v2.md` | The design-time console — data-model spine, honest-status, RBAC, tokens, screens, API surface | Studio PR-1…7 **and** all of Phase D |
| 3 | `CCC-Developer-Runtime-Build-Bible-Phase-D-v2.md` | The developer runtime loop — northbound broker, tokens, local enablement, ABAP/BYO, hardening | Phase D PR-D1…7 |
| 4 | `CoreEdge-Design-Tokens.md` | All tokens/colour (verbatim vs `globals.css`). Real ABeam navy `#002B5C` | Every UI PR |
| 5 | `CoreEdge Developer Studio.dc.html` | Screen layout / interaction / copy (esp. Test Console + Scaffold) | Studio PR-1…7; Phase D PR-D4/5 |
| 6 | `CoreEdge-Security-Architecture.html` | Trust boundaries the runtime must honour | Phase D (context) |

**Authority order on conflict:** for a runtime concern, Phase D v2 (3) > Studio v2 (2) > keystone runbook > memory.
For a design-time concern, Studio v2 (2) is top. **Tokens only from (4) + `globals.css`.** STOP on any conflict you can't resolve.

---

## The master sequence (16 PRs, one line each)

`✅ done` = already built/verified in this workstream. `Opus` / `Fable` = required model tier.
Every PR ships green `typecheck:strict · lint:strict · unit · build`, tenant-scoped, honest-status intact,
audit on mutations, a11y AA, read-only SAP probe against **X5M/100** only.

### Phase 0 — Foundation (shared by both bibles)

| PR | Scope | Tier | Prereq |
|----|-------|------|--------|
| **PR-0 · Keystone** | Apply `sap-connection-keystone.patch` as-is → re-verify (crypto test + gates) → merge. Per-org sealed `SapConnection`, env-fallback (non-breaking). | **Opus** | `main` = #132. **✅ patch verified green** — corrections already in; just rebase-check + merge. **STOP-gate A** below. |

### Phase 1 — Developer Studio (design-time console) · authority = Bible v2 §10

| PR | Scope | Tier | Prereq |
|----|-------|------|--------|
| **PR-1 · Shell + data model + RBAC** | `(studio)` group + `AffirmLearnProvider`, 220/56 shell, auth-resolved tenant switcher, **5 Prisma tables** (Solution/Interface/ApiAccessGrant/TestCase/ConfigAudit) + migration, RBAC (`consultant`/`platform_admin`), focus-ring baseline, `--status-nocheck-*` + `StudioStatusChip`. | **Opus** | PR-0 |
| **PR-2 · Discover** | Compose existing catalogue + business-domain lens + "Add to interface" (seeds an `Interface` draft). Honest status from the real probe. | **Opus** | PR-1 |
| **PR-3 · Connections** | Metadata projection over `SapConnection` (**never** return `secretsCiphertext`); "Test connectivity" = read-only `/capabilities` probe; `lastValidatedAt` only on a real 200. | **Opus** | PR-0, PR-1 |
| **PR-4 · API Access** | Request→decision ledger + progressive-trust stepper; **WRITE flagged higher-risk** (checklist, never auto-approve); v1 = governance ledger, runtime enforcement is Phase D. | **Opus** | PR-1 |
| **PR-5 · Solutions + Canvas** | `/api/studio/solutions` CRUD + Canvas; **ownership gate** (tech+biz+support owner before ACTIVE; orphan → RESTRICTED). | **Fable** (once §8.3 + tests locked) | PR-1 |
| **PR-6 · Interfaces** | `/api/studio/interfaces` CRUD + detail cards; versioned; **mapping fields present but DISABLED** (`mappingVersion=null`). | **Fable** | PR-1 |
| **PR-7 · Test Console + Scaffold** | Reuse `/entities` + `/preview`; save `TestCase`; **Scaffold = static-template downloads** (OpenAPI + TS types + SDK snippet). Keep the read/honest-status path Opus-reviewed. | **Fable** (read path Opus-reviewed) | PR-1, PR-2 |

### Phase 2 — Developer Runtime (Phase D) · authority = Phase D v2 §10 · **crosses a product fork (STOP-gate B)**

| PR | Scope | Tier | Prereq |
|----|-------|------|--------|
| **PR-D1 · Tenant-scope foundation + data model** | **T1** structural org-scope helper + guard-coverage test; add `SolutionClient`/`NorthboundAuditEvent`/`MockFixture` + migration; **T2** backward-compatible AAD; **T5** append-only audit. *Safe under either fork.* | **Opus** | PR-0 + **enough of Studio to register & issue** (min: PR-1; demoable loop also needs PR-3/5/7) |
| **PR-D2 · Northbound broker (read)** | §5.1–5.2, 5.4–5.5 token-auth read endpoints; **T3** OAuth caching/timeout. | **Opus** | PR-D1 · **STOP-gate B confirmed first** |
| **PR-D3 · Token issuance in Studio + SoD** | §5.6 issue/rotate/revoke per-solution token (SHA-256 hashed); **T4** requester≠approver. | **Opus** | PR-D2 |
| **PR-D4 · Real OpenAPI + typed client** | §6.0 schema capture (persist request/response schema; refuse empty), §6.1 OpenAPI, 6.4 typed client. | **Fable** (Opus review of honest-status responses) | PR-D2 |
| **PR-D5 · Local mock + fixtures + starter kit** | §6.2–6.3 "Capture fixture", bundling, starter kit that flips mock⇆live by `COREEDGE_BASE_URL`, offline mock. | **Fable** | PR-D4 |
| **PR-D6 · Gated write (optional)** | §5.3 the one explicitly-gated write path — **only if fully gateable; else STOP-report.** | **Opus** | PR-D2 (+ PR-D3 grants) |
| **PR-D7 · ABAP/BYO scope UX + docs** | §7 in-product scope notes + "register my ABAP's OData" doc + starter-kit README boundary; **T6** KMS note. | **Fable** | PR-D5 |

---

## The two hard STOP gates

**STOP-gate A — Keystone reconcile (before PR-0 merge).** The patch is verified green *as delivered*, but it
must still `git apply --check` / rebase clean onto whatever `main` is at execution time. If `main` has moved
past #132 and the patch no longer reconciles, **STOP and report** — do not force-merge a stale keystone; it is
the tenant spine everything else sits on.

**STOP-gate B — Strategic fork (before PR-D2, per Phase D §0.5).** PR-0 and PR-D1 are safe under either product
direction. PR-D2 is the first PR that stands up an **externally-callable endpoint brokering live client SAP
data** — that commits CoreEdge to the *runtime-platform* identity **and** the *build-the-broker (vs adopt SAP
Integration Suite)* position. **Confirm the product owner has consciously committed** before building it. If not,
**STOP after PR-D1 and report** — do not create an external SAP endpoint by engineering momentum.

---

## Model tiering — why, and the token logic

**Opus** (security-critical or judgment): PR-0, Studio PR-1…4, Phase D PR-D1/D2/D3/D6. Auth, crypto, secret-safety,
RBAC/decision logic, tenant-isolation structure, honest-status wiring — anywhere a wrong call is a security or
correctness defect, not a cosmetic one.

**Fable 5** (mechanical, contract-driven, once the spec is locked): Studio PR-5/6/7, Phase D PR-D4/D5/D7 — CRUD,
templating, packaging, docs. Fast and token-cheap; the spec removes the judgment.

**The plan's token logic:** use **Fable 5 for the whole recon/verification pass** (cheap, and it already caught the
keystone/roles premise errors) — then **Opus to execute**. Do **not** spend Fable tokens executing Opus-tier PRs,
and do not burn Opus on the Fable-tier mechanical PRs once their spec + tests are locked. Recon first, always:
no code until STEP-0 is clean or the blocker is reported.

---

## Dependency spine (what must be green before what)

```
PR-0 (keystone)
  └─► Studio PR-1 (shell + 5 tables + RBAC)
        ├─► PR-2 Discover ─┐
        ├─► PR-3 Connections (needs PR-0 secrets)
        ├─► PR-4 API Access
        ├─► PR-5 Solutions
        ├─► PR-6 Interfaces
        └─► PR-7 Test Console + Scaffold (needs PR-2)
                    │
   Phase D needs PR-0 + PR-1 (compile) and PR-3/5/7 (demoable loop)
                    ▼
        PR-D1 (tenant-scope + 3 tables)   ← safe under either fork
                    ▼   ═══ STOP-gate B: confirm runtime-platform fork ═══
        PR-D2 (broker read) ─► PR-D3 (tokens+SoD) ─► PR-D4 (OpenAPI) ─► PR-D5 (mock+kit) ─► PR-D7 (ABAP/BYO)
                              └─► PR-D6 (gated write, optional)
```

---

## Definition of done (whole build)

The build is complete when **both** bibles' §11 hold on `main`: the 7 Studio screens match `…dc.html` in real
shadcn + real tokens with honest-status correct everywhere; **and** a `SolutionClient` token pulls **real rows**
for a real activated service through the northbound broker (empty → "No records", needs-setup → 401/403, error →
5xx — never fabricated), the downloaded OpenAPI validates, and the starter kit runs against **both** the live
broker and the local offline mock by changing only `COREEDGE_BASE_URL`. Tenant isolation and secret-safety are
**structural, not by-convention**. Success = *nothing here had to be guessed, and nothing has to be undone later.*
