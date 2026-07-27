# CoreEdge Ops + Control Tower — CCC Execution Runbook (fresh Opus 5 session)

Standalone. Everything you need to verify and then build the two new workspaces safely. Repo: **`ib823/aptus`,
branch `main` (~#167)**. Build target: **Operations Center + Control Tower + the `support` role**, matching the
approved design, aligned to the codebase.

---

## 0 · Design confirmed
Attach **`CoreEdge Ops & Control Tower.dc2.html`** — it is the updated design (the latency-omit, sapLive
live-gauge, and write-ledger "no key reserved" fixes are folded in). Ignore the earlier `.dc.html`.

## 1 · Files to attach (all six, every run)
1. `CoreEdge Ops & Control Tower.dc2.html` — **visual contract** (layout/interaction/copy/states)
2. `CCC-Ops-ControlTower-Build-Bible.md` — **engineering contract** (the authoritative instruction)
3. `CoreEdge-Ops-ControlTower-Inventory.md` (v2) — content spec (capability → real data source → status)
4. `CoreEdge-Studio-Design-Book.html` — design system
5. `CoreEdge-Design-Tokens.md` — tokens (use verbatim)
6. `CoreEdge Developer Studio.dc.html` — visual family precedent (the built Studio)

---

## 2 · STEP 1 — VERIFY (run on Fable 5, recon-only)
Paste this. It writes no code; it confirms the design + bible + codebase agree before you spend Opus tokens.

```
RECON-ONLY. Do NOT write, edit, or commit any code. Repo ib823/aptus, branch main (expect ~#167).
Attached: the design (CoreEdge Ops & Control Tower.dc2.html), the build bible, the inventory v2,
the Design Book, the tokens, the Studio .dc.html. Verify and report, citing file:line:

1. STEP-0 recon (bible §2): confirm every reusable primitive exists on main — the shell
   (StudioShell / StudioRail / StudioTopBar / (studio)/layout, WORKSPACES, accessibleWorkspaces,
   rbac.ts helpers), the models (NorthboundAuditEvent, NorthboundIdempotencyKey, ConfigAudit,
   SapConnection incl. environment + lastValidationStatus, SolutionClient, Solution/Interface/
   ApiAccessGrant), the libs (northbound/audit, studio/connection-health, studio/tenants,
   security/rate-limit, middleware), and the api/admin + api/roles + api/analytics + api/partner
   endpoints Control Tower composes.
2. RBAC gap: confirm the `support` role does NOT exist (UserRole union / role-metadata / dev-login)
   and no (operations)/(control-tower) route groups exist — so PR-Rbac is required and the workspaces
   are greenfield.
3. Design vs code provenance — confirm each is backable:
   a. Latency: NorthboundAuditEvent has NO duration field today; the design must show latency only if
      PR-CT2 adds durationMs, else omit. Confirm the design reflects this.
   b. 429: the northbound route rate-limits in-route post-auth (keyed northbound:<clientId>) and audits
      the 429 -> broker-traffic 429 rows are real; edge sapLive 429s are not persisted -> throttle is a
      live gauge for those. Confirm.
   c. Write ledger: blocked writes fail before the idempotency reserve -> 'blocked' comes from
      NorthboundAuditEvent (WRITE+4xx); in-flight/completed/replayed/conflicted from NorthboundIdempotencyKey.
4. Guardrail reuse: confirm honest-status, structural tenant-scope, secret-safety, append-only audit, and
   the rate-limit patterns exist to reuse.

Output a GO / NO-GO with any drift, missing primitive, or unbacked design claim. NO CODE.
```

**Gate:** proceed only on a clean GO. If NO-GO, fix the flagged item (or tell me) before executing.

---

## 3 · STEP 2 — EXECUTE (run on Opus 5, PR-by-PR)
After a clean recon, paste this (same six files attached):

```
Execute the attached CCC-Ops-ControlTower-Build-Bible.md as the authoritative engineering instruction,
read together with the attached design (CoreEdge Ops & Control Tower.dc2.html = visual contract) and the
inventory v2 (content spec). Repo ib823/aptus, branch main.

1. Post the STEP-0 RECON first (bible §2), cite file:line, STOP if anything drifted.
2. Build PR-by-PR per §9: PR-Rbac -> PR-CT1 -> PR-CT2 -> PR-CT3 -> PR-CT4 -> PR-CT5. One reviewable PR each,
   green on CI (typecheck:strict, lint:strict, unit, build) before the next.
3. Model tiering per the bible: Opus for PR-Rbac / CT1 / CT2 / CT4; Fable viable for CT3 / CT5 once each
   contract + tests are locked.
4. Honour every §3 guardrail: honest status + honest environment (PROD flagged, unknown never guessed),
   append-only audit is READ-only, secret-safety (no ciphertext/token/host), structural tenant-scope
   (admin global), a11y AA, ConfigAudit on the one governance mutation (grant decisions), NO new SAP path.
5. DA screens render forthcoming (the Meter is a separate spec) — do not make them live.
6. STOP-and-report, never guess, on any conflict with the codebase, the bible, or the design.
```

---

## 4 · The PR sequence (what "done" looks like)

| PR | What it delivers | Tier |
|----|------------------|------|
| **PR-Rbac** | `support` role + workspace RBAC generalization (canAccessOperations/ControlTower, matrix, dev-login) | Opus |
| **PR-CT1** | Shell/rail renders the active workspace's sections; `(operations)` + `(control-tower)` route groups + gated layouts | Opus |
| **PR-CT2** | Operations Center read endpoints + the additive `durationMs` audit field (so latency is real) | Opus |
| **PR-CT3** | Operations Center screens on the dc2 design; live spot-check; DA forthcoming | Fable (read path Opus-reviewed) |
| **PR-CT4** | Control Tower integration governance (portfolio, ConfigAudit trail, grant governance+SoD, connection & token registers) | Opus |
| **PR-CT5** | Control Tower platform governance (compose users/orgs/roles/analytics/overview) | Fable |

## 5 · Safety — every PR must hold
Green `typecheck:strict · lint:strict · unit · build`; honest status + honest environment; append-only audit
read-only; no secret/token/host in any response; org-scoped (admin global); a11y AA; `ConfigAudit` on grant
decisions; **no new SAP access path**; DA screens stay forthcoming. **STOP-and-report on any drift** — a
half-built gate or a fabricated metric is worse than a stopped PR.

## 6 · After Front 1
Then Front 2 — the **Digital Access Meter** (`CCC-Digital-Access-Meter-Build-Spec.md`, PR-M-a → PR-M-b). Its
prerequisites are already merged, so it can run whenever; when it lands, the DA screens flip from forthcoming to
live. (See `CoreEdge-Master-Build-Index-v2.md` for the full remaining plan.)

---

### If recon comes back NO-GO
Most likely causes and the safe move: a primitive moved (update the bible §2 path, re-recon) · `main` advanced
past #167 (re-run recon against the new tip — the build is additive, so it should still hold) · a design claim
can't be backed (omit it or add the small backing field, per the bible §6 — never fabricate). When in doubt,
STOP and bring the recon report back.
