# CoreEdge Ops + Control Tower — CCC Execution Runbook v2

**Supersedes** `CoreEdge-Ops-ControlTower-CCC-Runbook.md` (v1). Standalone. Everything needed to verify and then
build the two new workspaces safely. Repo **`ib823/aptus`**, branch **`main`** (pack grounded at `70a6cec`, #167).
Build target: **Operations Center + Control Tower + the `support` role**, matching the approved design, aligned
to the codebase.

**What changed from v1:** a **pre-work PR (PR-CT-0a)** now precedes the sequence and is the gate everything sits
behind; the attach list uses the corrected filenames and drops two documents that do not exist in the repo; and
the verify step now checks the specific claims that changed during reconciliation.

---

## 0 · Design — `dc3`, not `dc2`

Attach **`CoreEdge Ops & Control Tower.dc3.html`**, produced by the design commission
(`PROMPT-1-cowork-dc3-commission.md`). **`dc2` is superseded** — it renders latency the data cannot measure, a
`NEVER_TESTED` status the probe never returns, and live revoke controls the workspace's own owner cannot invoke.

**If `dc3` does not exist yet the build is bounded, not blocked** — the dependency binds per PR:
PR-CT-0a, PR-Rbac and PR-CT2 need no design file and can start immediately; PR-CT1 needs only `dc3`'s B6
(breadcrumb, the two rail section lists, the `support` badge); PR-CT3–CT5 need `dc3` in full. Build Bible §0
carries the gate and the STOP instruction.

(The Studio `.dc.html` is a *different* file, not superseded, and is still attached as visual family precedent.)

## 1 · Files to attach (all six, every run)

1. `CoreEdge Ops & Control Tower.dc3.html` — **visual contract** (layout / interaction / copy / states).
   `dc2` is superseded; see §0 for the per-PR gate if `dc3` is not yet in hand.
2. `CCC-Ops-ControlTower-Build-Bible-v3.md` — **engineering contract** (the authoritative instruction)
3. `CoreEdge-Ops-ControlTower-Inventory.md` (v3) — content spec (capability → real data source → status)
4. `CoreEdge-Studio-Design-Book.html` — design system
5. `CoreEdge-Design-Tokens.md` — tokens (use verbatim)
6. `CoreEdge Developer Studio.dc.html` — visual family precedent (the built Studio)

**Six, not seven.** The CCC⇄Cowork reconciliation record is at
`archive/SUPERSEDED-PACK-AMENDMENTS-RECONCILED.md`; it predates decisions 2 and 4 and **is not a build input**.
Everything load-bearing in it — F54, F54a, the reframed F38, the write-ledger blend, and the RBAC test
constraints — is absorbed into Bible v3. Attaching it would put a second, staler source of truth in the room,
which is the exact failure this pack exists to close.

*Also not attachable — these do not exist in the repo:* `CCC-Digital-Access-Meter-Build-Spec.md` and
`CoreEdge-Master-Build-Index-v2.md`. Both are Front-2 future work; the only index present today is
`docs/coreedge/CoreEdge-Master-Build-Index.md` (v1). Do not cite them as inputs.

---

## 2 · STEP 1 — VERIFY (recon-only; cheap model is fine)

Paste this. It writes no code; it confirms design + bible + codebase agree before spending build tokens.

```
RECON-ONLY. Do NOT write, edit, or commit any code. Repo ib823/aptus, branch main.
Record the exact HEAD SHA first and cite file:line @ sha in every finding.
Attached (six): the design (dc3, or dc2 if dc3 is not yet produced — say which you were given),
Build Bible v3, Inventory v3, the Design Book, the tokens, the Studio .dc.html. Verify and report:

1. STEP-0 recon (Bible v3 §2): confirm every listed primitive exists at the current SHA — the shell
   (StudioShell / StudioRail / StudioTopBar / (studio)/layout, WORKSPACES, accessibleWorkspaces, the
   rbac.ts helpers, RoleGatedEmptyState, isAdminRole), the models (NorthboundAuditEvent incl. the
   ABSENCE of durationMs and connectionId, NorthboundIdempotencyKey, ConfigAudit, SapConnection incl.
   environment + lastValidationStatus, SolutionClient, Solution/Interface/ApiAccessGrant), the libs
   (northbound/audit, studio/connection-health, studio/tenants, studio/tenant-scope, security/rate-limit,
   studio/api, middleware), and the api/admin + api/roles + api/analytics + api/partner endpoints
   Control Tower composes.

2. Confirm the four PR-CT-0a defects still hold, each with file:line:
   a. resolveSapConnection returns the oldest active connection and SapConnection.environment is never
      read for selection or authorization anywhere in lib/sap-public, lib/northbound, api/northbound.
   b. GRANTING includes READ_ONLY and SANDBOX_ONLY, and the broker's write path accepts any granting
      decision.
   c. NorthboundAuditEvent has no connectionId / connectionEnvironment.
   d. tenantScopeGuard() has no production call site, AND attaching it to a test client would fire on
      auth.ts's tokenHash findUnique and on the scoped-findFirst-then-update-by-id idiom.

3. Confirm the PR-Rbac cascade: how many exhaustive Record<UserRole, …> maps exist today? (Bible v3 §5.1
   says eight — verify the count and the locations.) Confirm the `support` role does not exist and that
   no (operations)/(control-tower) route groups exist.

4. Confirm the shell generalization shape: StudioRail already takes a `sections` prop; StudioShell and
   StudioTopBar hardcode Studio (including the breadcrumb literal).

5. Design vs code provenance — walk every screen, card, metric, filter and state in the attached design and
   report a table: design element → claimed source → real source (file:line) → backable / backable after
   PR-CTx / unbackable. Pay particular attention to: latency (needs durationMs), the throttle gauge (needs
   a non-consuming peek), connection-health status values (the real enum is OK|UNAUTHORIZED|NOT_FOUND|
   TIMEOUT|ERROR|NO_PROBE_PATH plus null = never tested — NEVER_TESTED does not exist), the write ledger's
   in-flight/completed/replayed/conflicted vocabulary, and anything implying per-connection catalogue
   freshness.

6. Confirm the guardrail primitives exist to reuse: honest status, structural tenant scope, secret safety,
   append-only audit, the rate-limit patterns.

7. Confirm these five, each verified at 70a6cec — re-check only that they still hold at your SHA:
   a. `readEntitySet` exists (`src/lib/northbound/read.ts:98`) and carries the honest-status classification —
      the Ops spot-check is built on it plus `resolveSapConnectionForEnvironment`, NOT on /api/sap/tdd/*.
   b. `PATCH /api/studio/clients` (`clients/route.ts:52-67`) and `PATCH /api/studio/connections`
      (`connections/route.ts:249-250`, gate `:110-116`) are both requireBuilder → canMutateStudio →
      consultant-only, so platform_admin 403s on each. Control Tower renders both disabled.
   c. Reads and writes use SEPARATE per-token buckets: `northbound:<id>` (`data/route.ts:59`) and
      `northbound-write:<id>` (`write/route.ts:100`), both 60/min but independent.
   d. The write credential gate (`write/route.ts:87-97`) refuses BEFORE any idempotency reservation and DOES
      write a 403 audit row — so "blocked" is visible in the audit feed but never in the key table.
   e. Grant `expiresAt` is optional on the request today (`access-grants/route.ts:37`) — which is what PR-CT-0a
      makes mandatory for write-granting decisions.

Output a GO / CONDITIONAL GO / NO-GO with any drift, missing primitive, or unbacked design claim. NO CODE.
```

**Gate:** proceed on a clean GO or a CONDITIONAL GO whose conditions are the ones already in Bible v3 §4 and
§10. Any *new* condition → bring it back before executing.

---

## 3 · STEP 2 — EXECUTE (Opus, PR by PR)

After a clean recon, paste the contents of `PROMPT-2-execution-prompt.md` with the same **six** files attached.
That prompt is self-contained and carries the full sequence, guardrails, and stop conditions.

---

## 4 · The PR sequence (what "done" looks like)

| PR | What it delivers | Tier |
|----|------------------|------|
| **PR-CT-0a** | Pre-work: environment→connection binding · `READ_ONLY`/`SANDBOX_ONLY` runtime semantics · additive `connectionId` + `connectionEnvironment` on the audit row + a distinct "no connection for this environment" error code · `tenantScopeGuard` on the vitest client with call-site remediation | Opus |
| **PR-Rbac** | `support` role across all eight `Record<UserRole,…>` maps, dev-login account, workspace RBAC helpers | Opus |
| **PR-CT1** | Shell + top-bar parameterization, `OPERATIONS_SECTIONS` / `CONTROL_TOWER_SECTIONS`, both route groups gated, honest empty screens | Opus |
| **PR-CT2** | Operations Center read endpoints + additive `durationMs` + `@@index([organizationId, createdAt])` on `NorthboundIdempotencyKey` + its expiry reaper cron + non-consuming `peekRateLimit` | Opus |
| **PR-CT3** | Operations Center screens on the dc3 design; live spot-check; DA forthcoming | Fable (read path Opus-reviewed) |
| **PR-CT4** | Control Tower integration governance (portfolio, ConfigAudit trail, grant governance + SoD decision, connection & token registers) | Opus |
| **PR-CT5** | Control Tower platform governance (compose users / orgs / roles / analytics / overview) | Fable |

**PR-CT-0a is the gate.** It is four steps, one of which (the guard) is genuine call-site remediation rather than
a wiring change — budget for it accordingly, and do not let it be reduced to a broad exemption list.

## 5 · Safety — every PR must hold

Green `typecheck:strict · lint:strict · test · build` (the real CI jobs); honest status **and** honest
environment; append-only audit stays read-only; no secret, token, hash, or SAP host in any response; org-scoped
with admin-global as an explicit tested branch; a11y AA; `ConfigAudit` on the governance mutation; **no new SAP
access path**; DA screens stay forthcoming; no silent caps. **STOP and report on any drift** — a half-built gate
or a fabricated metric is worse than a stopped PR.

## 6 · Known-empty screens (do not treat as a build failure)

**Staying empty by decision:** the write ledger and the write-credential monitor. There is no code path that
issues a write credential, and standing one up for demo purposes was explicitly declined. Build the honest-empty
state and write the copy well — *"no write credential has been issued, so every write is refused at the
credential gate"* is a precise statement about a working control, not an apology.

**Filling during this front:** the grant decision queue and broker traffic. A parallel workstream adds the
access-request dialog and `entitySet` editing, so build both screens expecting real rows and treat persistent
emptiness as "the parallel work has not landed", not as the designed state.

Bible v3 §10 and §12 decision 2 carry the full reasoning.

## 7 · After Front 1

Front 2 is the **Digital Access Meter**, whose spec must be written before it can run — it does not exist in the
repo today. When it lands, the DA screens flip from forthcoming to live.

---

### If recon comes back NO-GO

Most likely causes and the safe move: a primitive moved (update Bible v3 §2, re-recon) · `main` advanced past the
pack's grounding SHA (re-run recon at the new tip — the build is additive, so it should still hold) · a design
claim cannot be backed (omit it, or add the small backing field per Bible v3, **never fabricate**) · one of the
four PR-CT-0a defects turns out to be already fixed (good news — drop that step and say so). When in doubt, STOP
and bring the recon report back.
