# Neutral Process Discovery — Build Log

---

# CLOSING SUMMARY (PR-6)

The build is complete: client surface, consultant workbench, the seam, and the
P4 loop. What remains is **verification in an environment with a database**, then
the pilot.

## CHAIN LANDED ON MAIN (2026-07-18)

The Brownfield migration drift (the critical-path blocker below) was fixed and
merged **first** as PR #100 — a guarded, additive reconciliation migration
(`20260716000000`) plus the `migration-integrity` CI gate that now protects
discovery too. Prod schema-parity was verified against the live database and
passed.

The discovery chain was then rebased onto that main and merged **dark**, in
dependency order, each PR green on the runner (Migration Integrity parity,
Quality Gates — typecheck:strict/lint:strict/unit/build, E2E Smoke, Vercel):

| PR | # | main merge |
|---|---|---|
| PR-1 data layer | #101 | `bfea4c5` |
| PR-2a guest infra | #102 | `fc60a58` |
| PR-2b explore V2/V3/V4 | #103 | `e5af8d8` |
| PR-3 present/export/notes | #104 | `6e87a01` |
| PR-4 workbench core | #105 | `c1b2528` |
| PR-5 sessions/seam | #106 | `f6adf3e` |
| PR-6 outputs/capture | #107 | _this PR_ |

**`NEUTRAL_DISCOVERY_ENABLED` stays UNSET throughout.** The flag is read-only
(`src/lib/discovery/guards.ts`), set in no committed config, so a merge cannot
enable it. Every `/d` route and the workbench discovery `layout.tsx` call
`notFound()` when the flag is off; `discovery-flag-off.unauth.spec.ts` asserts
this in CI. Prod is dark: `/d` 404s, the workbench discovery section is absent.

One infra addition was needed to land the chain: **`chore(build)` raises the
Next build heap to 4GB** (`--max-old-space-size=4096` on `build`, `vercel-build`,
and the pre-push hook) — the ~1.9MB discovery library JSON pushes `next build`'s
type-check worker past Node's default ~2GB heap. Approved and landed on PR-1.

### Tracked debt — carried, NOT fixed in the chain (deferred to the flagged pass)

Two known items ride along untouched, by instruction; they do not gate the dark
merge and are not product defects:

1. **Racy PR-3 Present/Export e2e spec** (`discovery-present-export.unauth.spec.ts`)
   — spec-side flakiness (retries + streaming pages manufacture failures), no
   product defect. Gated behind `DISCOVERY_E2E=1`, which CI's E2E Smoke does not
   set, so it is **skipped in CI**. See item (b) below for the rewrite.
2. **WCAG-AA contrast defect** on the /d small-text surfaces (V2/V3/V4/Export)
   — the `--ink-muted` (#8A8A8A ≈ 3.45:1) sweep to `--ink-soft`. See item (c).

The **flagged verification** (two-browser seam + notes-privacy proof, full
flagged e2e with `NEUTRAL_DISCOVERY_ENABLED=true`) is the deferred dedicated
preview pass — intentionally NOT run during this dark landing.

## PR map

| PR | Branch | What |
|---|---|---|
| Artifacts | `docs/neutral-discovery-artifacts` | The 10 source-of-truth artifacts, verbatim + pre-flight |
| PR-1 | `feat/neutral-discovery-data-layer` | Data layer, zod, serializer allowlist, 3 CI guards |
| PR-2a | `feat/neutral-discovery-guest-v1` | Guest infra (5 tables), /d entry, V1 |
| PR-2b | `feat/neutral-discovery-explore-v2` | V2/V3/V4, the fit selector, decisions |
| PR-3 | `feat/neutral-discovery-present-export` | Present (V5), Export (V7), mode switch, notes |
| PR-4 | `feat/neutral-discovery-workbench-core` | C1/C2/C3/C4/C6/C10, the fence, both walls |
| PR-5 | `feat/neutral-discovery-sessions-seam` | C7/C8, the live seam, effective scope |
| PR-6 | `feat/neutral-discovery-outputs-capture` | C9, two-lane export, C5 + the P4 wizard |

## Decision index

| # | One line |
|---|---|
| D1 | `meta` is informational; MANIFEST is the authority. Typed `unknown` so a violation is a compile error. |
| D2 | Consultant dataset has no `completeness`; derived across the `scope_id ↔ id` join. |
| D3 | Blank-role steps → "System / Automatic" lane (46% of steps). |
| D4 | `#DDD9CC` → `var(--border-strong)`; the print palette is the one sanctioned token exception, exempted by path. |
| D5 | `typecheck:strict` OOMs on a plain JSON import; datasets typed `unknown`, zod-parsed. |
| **D6** | **181 sentinel flows.** Fixed upstream. Honest split is 545 / 197, not 726 / 16. |
| D7 | `cookies.ts` mirrored, not parameterized (the Affirm file is security-review-frozen). |
| D8 | Mode switch deferred from PR-2a → shipped PR-3. |
| D9 | The brief specifies no landing/verify screen; structure from Affirm, copy from §10. |
| D10 | The vendor guard scans comments. Kept strict; prose reworded. |
| D11 | The .dc's V2 search has no empty state; added one. |
| D12 | `P` is claimed twice (mode vs park); resolved by context. |
| D13 | The Export register lists decided processes only. |
| **D14** | **`meta.apqc_coverage` is stale.** All 7 "known gaps" are filled; the 2 real ones aren't in it. Register derived live. |
| D15 | The context chip's default lies on the fence; C6 says "Consultant only — not shared". |
| D16 | C10 ships with no audit trail — the .dc's is invented and attributed to a real person. |
| D17 | C1's "Import the base library" state is unreachable; not built. |
| D18 | Seam = SSE, poll-behind-stream, mirroring the repo's workshop route. |
| **D19** | **Scope was grant-only and would have leaked.** Effective scope = engagement ∩ grant. |
| D20 | Promotions never touch the committed JSON; the library views compose (this PR). |

## What the guards actually caught

Not theory — these fired on real code during the build:

- **D6**: 181 fake flows in "final, QA'd" data — would have shipped SAP localisation jargon to 181 client pages and overstated coverage by a third. Found by reading content, not counts; **every count matched**.
- **D14**: a governance view that would have named 7 well-covered categories as gaps while hiding the 2 real ones.
- **D19**: a scoping leak that would have shown a late-invited reviewer all 10 streams.
- The **stray-hex guard** caught `stroke="#fff"` in the siderail wordmark.
- The **vendor guard** caught a quoted vendor headline and "enumeration **oracle**" in my own comments.
- The **wall** caught a deliberate breach and traced it transitively (I tested it by breaking it).
- The **notes-privacy guard** caught PR-6's `packs.ts` legitimately reading notes — forcing the allowlist to be explicit rather than a directory rule.

Four times a guard of mine matched its own documentation rather than code. The
fix that stuck was a comment-stripper plus a test proving the stripper works —
not rewording prose a fifth time.

---

# VERIFICATION PASS — CLOSED (2026-07-17)

**Migrations proven. Core journeys proven. Spec debt and the Brownfield blocker
precisely characterised.** What follows is the closing state; the detail is below.

## Final results

| # | Step | Result |
|---|---|---|
| 1 | Migrations (5, real PG 16.14) | ✅ **PASS** — first-ever execution, in order, **zero drift on any Discovery table** |
| 2 | E2E · PR-2a journey/gate | ✅ **PASS 7/7** |
| 2 | E2E · PR-2b explore | 🟡 7 pass / 2 fail — contrast only (19 + 23 nodes) |
| 2 | E2E · PR-3 Present/Export | 🟡 10 pass / 5 fail — **spec-side, no product defects** |
| 2 | E2E · PR-4 workbench | ⬜ not reached |
| 2 | E2E · PR-5 seam | ⬜ not reached |
| 2 | E2E · PR-6 wizard/export | ⬜ not reached |
| 3 | Live flag-off | 🔵 **DEFERRED** — local PG, not the Vercel preview |
| 4 | Export proof (real artifacts) | ⬜ not reached |
| 5 | P4 capture end-to-end | ⬜ not reached |

### On the PR-3 failures — the honest line

**Every PR-3 failure is spec-side. No product defect was found.** The spec is
**racy by construction**: it drives a keyboard-first UI with `goto` + an immediate
`keyboard.press`, so it fires keys before the component's `useEffect` listener has
attached. Patching locator-by-locator traded one failing set for another — three
recovered, four regressed — which is the signal that the approach, not the
locators, is wrong.

**Present mode is verified working**, by the tests that pass and by direct
evidence: `1–4` set the fit state, `P/E/X` switch modes, the mode switch enters
Present and persists, the Draft stamp prints, label-not-colour holds, and the pack
carries no affordances of its own. The one genuine product-adjacent finding —
`getByRole('link')` catching the **root layout's** "Skip to main content" — was an
over-broad assertion measuring the app shell rather than the pack.

**Three times this pass I named a root cause and was wrong** (the `land()` race as
"the" cause of 8 failures; "the Draft stamp needs its own diagnosis"; the
locator patch). Each time the correction came from evidence — `--retries=0`, a DOM
dump, a clean re-run. Recorded because the reasoning error is the reusable lesson:
**retries and streaming pages manufacture failures that look like product bugs.**

## Follow-up work — three items, in priority order

### (a) 🔴 CRITICAL PATH — the Brownfield migration PR
*Not discovery's. Nothing real ships until it lands.*

`prisma migrate deploy` on a fresh database dies the moment the app touches it:

```
The column `Assessment.brownfieldCatalogVersionId` does not exist in the current database.
  at tests/e2e/global-setup.ts:307
```

146 drift statements — an entire `Brownfield*` feature set lives in
`schema.prisma` with **no migration** (introduced by `db9bfec`). Consequences:
**every Playwright spec in the repo** dies at `global-setup`, not just discovery's;
and **any environment built from migration history is unbootable — including the
Vercel preview.** Discovery's own five migrations apply with zero drift.

Scope: generate the missing migration(s) from the schema, reconcile the history.
Owner: whoever shipped Brownfield. The `db push` workaround used in this pass is
fine for a throwaway local DB and **not acceptable for preview or production** — it
bypasses migration history and silently diverges it from the schema.

### (b) PR-3 spec rewrite — deliberate, fresh eyes
Rebuild `discovery-present-export.unauth.spec.ts` around **readiness**, not
patched locators:
- One awaited "shell interactive" fixture, used by **every** test.
- **No bare `goto` + `press` anywhere** — entry into Present is deterministic
  (click, which auto-waits), and the Present view's mount is proven before any key
  is sent. Keyboard-driving belongs only in the tests whose *subject* is a binding.
- Locators scoped to their subject (`.dx-root` for the pack, the coverage list for
  coverage figures), so a match is unambiguous under strict mode.

Contained work. It is not a product fix — it is the instrument.

### (c) Contrast fix-PR — the sweep
The `--ink-soft` swap (`078e8c9`) cleared V1 and the entry pages (110 nodes) and
`GuestShell` (`6494255`) cleared the landing/verify. **Still outstanding:** V2/V3/V4
(19 nodes) and Export (23 nodes), **never swept as one pass**. Do it once, as one
table (view · node · fg/bg · ratio · proposed token), one PR. Anything that
survives the sweep is its own finding.

Then, and only then, generate the **print-snapshot baseline** — a baseline taken
before the Export contrast fix bakes in pixels that fix is about to change.

**Also unaudited:** ~100 `text-ink-muted` call sites on the shipped Affirm surface,
carrying the same defect with no axe coverage (the repo's axe specs cover `/login`,
`/dashboard`, `/assessments` only). Needs design sign-off; out of discovery's scope.

## Remaining verification — blocked

| Blocked on | Work |
|---|---|
| (a) | Everything that needs an environment built from migration history — **the real preview**, and therefore **step 3's live flag-off**, which no local box can honestly claim |
| (a) + (b) | PR-4 workbench, **PR-5 the two-browser seam + notes-privacy proof** (still the highest-value unproven path), PR-6 wizard + export-content |
| (a) | Step 4's export proof and step 5's P4 capture — runnable on local PG once the suite is trustworthy, but **labelled local-PG**, never as preview evidence |

---

# VERIFICATION PASS — detail (2026-07-17)

## ⚠ Two scope truths, stated before any result

**1. This was NOT the Vercel preview environment.** It is a **local Postgres 16.14
in a Docker container inside the build box**, stood up during the pass because
`DATABASE_URL` pointed at a closed `localhost:5432`. Everything below that passed,
passed *there*. It genuinely proves the migrations execute and the specs run — the
substance of the runbook — but it cannot prove deploy-time behaviour.

> **Step 3 (live flag-off check) is DEFERRED to the real preview deploy,
> unconditionally, whatever else passes here.** A local 404 is not a deployed 404.

**2. The pass made repairs, beyond its "nothing new gets built" remit.** Each is
listed with its authorisation:

| Repair | Commit | Authorisation |
|---|---|---|
| `--ink-soft` contrast swap (40 files) | `078e8c9` | Explicitly approved mid-pass, after the axe gate failed |
| `GuestShell` footer contrast | `6494255` | Explicitly approved mid-pass; the plan permits touching "shared components you extend" |
| Two PR-2a spec bugs | `7fed756` | In-scope repair of the pass's own instruments |
| Playwright system libs (`libatk-1.0.so.0` …) | — | Environment fix, no code |
| `prisma db push` after `migrate deploy` | — | Workaround for pre-existing drift (see below), no code |

Two things the runbook asked for were **deliberately not done**, because doing them
would have been wrong:
- **The print-snapshot baseline** stays uncommitted until the Export contrast fix
  lands — a baseline captured now bakes in pixels that fix is about to change, and
  bakes in a currently-failing page state.
- **"Timebox the 19.7-minute test"** — there is no slow test. That was the *spec's*
  total: 8 failures × (60s timeout + retry). My earlier report was wrong; the
  runtime collapses when the root cause is fixed.

## Results

| # | Step | Result |
|---|---|---|
| 1 | Migrations (5, real PG 16.14) | **PASS** — first-ever execution; **zero drift on any Discovery table** |
| 2 | E2E · PR-2a journey/gate | **PASS — 7/7** |
| 2 | E2E · PR-2b explore | **PARTIAL — 7 passed, 2 failed** (contrast, 19+23 nodes; one `toContain`) |
| 2 | E2E · PR-3 Present/Export | **FAIL — 2 passed, 8 failed, 1 flaky** (one root cause suspected; diagnosis pending) |
| 2 | E2E · PR-4 workbench | **NOT REACHED** |
| 2 | E2E · PR-5 seam | **NOT REACHED** |
| 2 | E2E · PR-6 wizard/export | **NOT REACHED** |
| 3 | Live flag-off | **DEFERRED — not possible here** (see scope truth 1) |
| 4 | Export proof (real artifacts) | **NOT REACHED** |
| 5 | P4 capture end-to-end | **NOT REACHED** |
| 6 | BUILD-LOG updated | this section |

### What the pass proved that no unit test could

- The **core journeys work against real Postgres**: landing → OTP → V1 with all 10
  streams and the honest 742 / 545 / 60 counts; the full Explore journey including
  differ-with-reason, N/A, the radiogroup arrow contract, the no-flow fallback, and
  the sealed 409.
- **The design system fails WCAG AA** and always has (110 nodes on V1 alone). Nothing
  had ever looked: the repo's axe specs cover `/login`, `/dashboard`, `/assessments`.
- **Two real bugs in my own specs**, both of which had the app right and the test wrong.
- **`migrate deploy` alone yields an unbootable database** — see the Brownfield
  section below. That is the critical path now.

## 🔴 BLOCKER — pre-existing Brownfield migration drift (NOT discovery's)

**This blocks the real preview verification, so it is the critical path.**

**What.** `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
against a database built purely from the committed migration history reports **146
drift statements**. They are an entire `Brownfield*` feature set — `BrownfieldCatalogVersion`,
`BrownfieldAssessment`, `BrownfieldClassificationPass`, `BrownfieldGuide`,
`BrownfieldLineOfBusiness`, `BrownfieldApplicationArea` and their FKs — plus
`Assessment.brownfieldCatalogVersionId`, `ClientRequirement.crossCuttingTag`,
`SapApiReference.apiType`, and a dropped `SapApiReference_scopeItemCodes_gin_idx`.

**Why it matters.** These models exist in `prisma/schema.prisma` but **no migration
creates them**. So `prisma migrate deploy` on a fresh environment produces a database
the application cannot boot against. It is not a cosmetic mismatch:

```
PrismaClientKnownRequestError:
Invalid `prisma.assessment.findFirst()` invocation in tests/e2e/global-setup.ts:307
The column `Assessment.brownfieldCatalogVersionId` does not exist in the current database.
```

`global-setup` dies there, so **every Playwright spec in the repo fails at setup** —
not just discovery's.

**Provenance.** Introduced by `db9bfec feat(brownfield): Phase 14 catalog + EWA ingest
adapters`. **Pre-existing and entirely unrelated to this build.** Discovery's own five
migrations apply cleanly with **zero drift**.

**Workaround used here, and its limit.** `prisma db push` after `migrate deploy`, to
sync the missing schema so the pass could continue. That is acceptable for a local
throwaway database and **is not acceptable for the preview or production**: it
bypasses migration history, leaves no audit trail, and silently diverges the two.

**Owner / next step.** Its own PR, owned by whoever shipped Brownfield: generate the
missing migration(s) from the schema and reconcile the history. **Not folded into this
pass** — it is not discovery's defect, and fixing it here would hide it.

## PREVIEW-ENV DEBT — status after the verification pass

~~Nothing below has ever executed.~~ **Partly retired.** The pass stood up a local
Postgres and executed items 1 and part of 2. Item 3 is deferred by nature; 4-6 were
not reached. Each item now carries its result.

1. ✅ **DONE — the five migrations executed.** First-ever run, against real
   PG 16.14, in order, via `migrate deploy`. **Zero drift on any Discovery table.**
   ⚠ But see the Brownfield blocker above: `migrate deploy` ALONE leaves the app
   unbootable, for reasons that are not discovery's.
   `20260717000000_neutral_discovery_guest_infra` ·
   `20260717120000_discovery_facilitator_notes` ·
   `20260717150000_discovery_workbench_core` ·
   `20260717180000_discovery_session_seam` ·
   `20260717210000_discovery_p4_capture`
2. 🟡 **PARTIAL — the e2e suite.** `discovery-journey` **7/7 PASS**.
   `discovery-explore` **7 pass / 2 fail** (contrast). `discovery-present-export`
   **2 pass / 8 fail** (one root cause, diagnosis pending). `discovery-workbench`,
   `discovery-seam`, `discovery-capture` **not reached**.
   Also required first: Playwright system libs (`libatk-1.0.so.0` et al) were
   missing — Chromium could not launch at all. Fixed via `playwright install-deps`.
3. 🔵 **DEFERRED — live flag-off.** Cannot be honestly claimed from a local box.
   Must run against the real preview deploy, with the flag unset, confirming
   `/d/*` and `/discovery/*` 404. `discovery-flag-off.unauth.spec.ts` covers it and
   has still never run. **Blocked behind the Brownfield PR.**
4. ⬜ **NOT REACHED — the two-browser seam** (PR-5). Still the highest-value
   unproven path: a consultant drives, a client follows, and the facilitator's
   note must be absent from the client's network traffic.
5. ⬜ **NOT REACHED — generate both packs against real data** and run the vendor
   guard over the client artifact.
6. ⬜ **NOT REACHED — one P4 capture end-to-end**, including the second-reviewer gate.

### Ordered critical path from here

1. **Brownfield migration PR** (not discovery's) — until it lands, no environment
   built from migration history can boot the app, so the real preview verification
   cannot start.
2. Diagnose + fix **PR-3's 8 failures** (one suspected root cause).
3. **Characterise the whole contrast surface** in one sweep — V2/V3/V4/Export —
   and fix in one PR. No more view-by-view.
4. Generate the **print-snapshot baseline** (only after 3, or it bakes in stale pixels).
5. Finish e2e (PR-4/5/6), then steps 4-5 of the runbook, on the local PG, labelled as such.
6. **Real preview deploy** → step 3's live flag-off + a repeat of the full suite.

### Open prerequisites this build cannot close (P4 §9)

- **Legal reuse clause** — P4 §5.4 requires confirming engagement terms permit
  generalized reuse *before harvesting*. There is no contract-check gate in the
  wizard because there is no contract field to check; captures stay register-only
  by default until this is settled.
- **Second-reviewer roster** — §9 lists "⟨2 names⟩" as open. Until it exists,
  every account is eligible and the gate is "someone other than you".
- **Pilot client** — the plan's `⟨pilot client⟩` placeholder.

### Known upstream data debt (fix in the post-pilot re-emission, not mid-build)

- `meta.apqc_coverage` is stale (D14): counts sum to 654, 7 of 13 categories
  disagree, category 1.0 absent. Ignored in code; pinned by test.
- Promoted entries live in the DB and compose at read time (D20). Folding them
  into the JSON is the re-emission's job.

---

## Pre-flight verification (before PR-1)

Ran against the committed artifacts to validate the two claims the plan rests on:
"data is final and QA'd" and "designs verified against repo tokens".

### Data integrity — PASS *(historical: superseded by D6)*

> ⚠ **The `with_flow` and no-flow rows below are superseded.** They record what
> was verified on 2026-07-16 against the then-frozen bytes. Both figures counted
> 181 sentinel flows as real. The honest figures are **545 with_flow / 197
> no_flow** — see D6. The row that says "no-flow processes … 16 … match" is the
> exact assertion that was true against MANIFEST and false about the content.
> Left in place deliberately: the log should show what was believed when.

| Check | MANIFEST | Actual | Result |
|---|---|---|---|
| processes | 742 | 742 | match |
| value_streams | 10 | 10 | match |
| workflows | 85 | 85 | match |
| with_flow | 726 | 726 | match |
| with_substeps | 400 | 400 | match |
| no-flow processes | 16 (brief) | 16 | match |
| client vendor leaks | 0 | 0 | match |

- **Guard scan:** client dataset is clean against all 23 terms in `vendor-term-guard.json`. 0 hits.
- **Hashes:** all three files verify. Algorithm is `sha256[:16]` — CI must use this, it is not recorded in the MANIFEST.
- **Join:** client `id` ↔ consultant `scope_id`, 742/742 overlap, 0 orphans. Note the **key names differ** between datasets.

### Findings requiring a build decision

| # | Finding | Decision |
|---|---|---|
| D1 | **Resolved by the 2026-07-17 re-emission.** Both datasets' `meta` blocks are now consistent with actuals; the stale-completeness remnant is gone. | **The stance stands regardless: MANIFEST is authoritative, `meta` is informational.** The loader reads no count from `meta` — enforced by typing it `unknown` in the schema, so a violation is a compile error. Data is never edited locally; corrections arrive as data-only re-emissions (D6 is the first). |
| D2 | Consultant dataset has **no `completeness` field**; client dataset does. Invariant 4 requires completeness badges everywhere a process renders, including the C2 library grid. | Consultant loader derives completeness by joining `scope_id` → client `id`. No data change. |
| D3 | **46% of flow steps (1400/3035) and 31% of substeps (2877/9425) have an empty role**, but the .dc renders `{{ lane.role }}` with no fallback. | Resolved by the brief, which wins: *"Blank-role steps sit in a 'System / Automatic' lane."* No question outstanding. |
| D4 | ~~The .dc uses literal hex; `#DDD9CC` has no token.~~ **CLOSED in PR-3.** | The export print-preview backdrop is now `var(--border-strong)`. It is decorative desk-space around the A4 page and never prints, so no new colour entered the system. **Separately**, PR-3 opened the one sanctioned exception to invariant 5: the pack itself must print pure black on white (§3) with label+pattern decisions (§11), which the warm on-screen palette cannot do. That palette lives only in `d/export/discovery-export.css`, scoped to `.dx-root`, exempted **by path** in the stray-hex guard — and the guard asserts the exemption is exactly one file, that the file exists, and that nothing else imports it, so the exception cannot quietly widen. The export components carry no hex at all; they use `currentColor`. |
| D20 | **The P4 wizard never writes the committed library.** The JSON is byte-frozen and hash-pinned; promotions land in `DiscoveryPromotedEntry` and the consultant views compose committed-JSON + promoted rows, badged `client-captured`. | Per the architectural directive. Nothing in the wizard needed to touch `src/data/discovery/*` — the composition point is `composeLibrary()`, and a test asserts no capture/promotion code calls any fs write. The pinned-hash guard stayed green throughout. Folding promotions into the JSON is the post-pilot re-emission's job, upstream. **Only SHARED-visible promotions compose in** (§5.3): a sensitive pattern at one client must not appear in a view a consultant could screen-share. |
| D19 | **Scope was grant-only and would have leaked.** PR-2a put `valueStreamIds` on the grant (a persona scope) and nothing on the engagement. A session "scoped to 3 streams" was therefore only scoped if every grant repeated the list — and a reviewer invited *after* scoping would have an empty grant, which means "unrestricted", so they would see all 10 streams. | **Effective scope = engagement ∩ grant.** `valueStreamIds` added to `DiscoveryEngagement` (the session's scope); the grant may narrow within it and can never widen past it. Enforced in the serializer path every /d view goes through, and in the decisions write path — not the UI. Note `null` (unrestricted) is deliberately distinct from `[]` (nothing visible): a grant scoped entirely outside its session sees nothing, where a naive `length === 0 ? all : filter` would hand over the whole library. |
| D18 | **Seam mechanism: SSE, poll-behind-stream.** | Mirrors `api/assessments/[id]/workshops/[sessionId]/stream/route.ts` — the repo's existing precedent for this exact shape (a facilitator drives, a room follows): the server polls every 3s and pushes only on change, with a 15s heartbeat and a 1h cap. Chosen over websockets (no infra here) and over client polling (one open stream degrades to a reconnect, rather than putting a hard 5s floor of requests under every reviewer in the room). **Degrades**: EventSource retries itself; after 3 real failures the client falls back to a 15s `router.refresh()`, so a reviewer behind a proxy that eats event-streams still follows, just less promptly. If nothing is driving it does nothing — a reviewer exploring alone is never yanked to another page. |
| D17 | **C1's "first-run empty" state (brief §7-C1) is not built.** Its CTA is "Import the base library". | The library is a committed, hash-pinned JSON file — it is never absent, so the state is unreachable and the button could not do anything. Shipping it would be a control that lies about what the product can do. The engagements table has a real empty state instead ("No discovery engagements yet"), because zero engagements genuinely happens. |
| D16 | **C10 ships with no audit trail.** The .dc has one: three rows, hardcoded, attributed to a named real person with invented timestamps ("2d ago · 18J Requisitioning — description edited · Ikmal"). | Omitted entirely. An audit trail that lies is worse than no audit trail — it is the one component whose entire value is that you can trust it. It ships when there is a real edit log to show, which is PR-6 (the P4 pipeline is the first thing that writes library changes). |
| D15 | **The context chip's default lies on the fence.** §9.1 makes the chip's whole job "tells the consultant whether the current surface is internal-only or paired with a client projection", but the .dc computes it as "Live session — {client}" / "Session setup" / **"Editing library" for everything else** — so it reads "Editing library" while the fenced product map is on screen. | "Editing library" stays the default as instructed, but C6 passes `consultant-only` → **"Consultant only — not shared"**, in the fence's own palette. A chip that says "Editing library" on the one view where being wrong is worst is not a default, it is a bug. |
| D14 | **`meta.apqc_coverage` is stale — the D1 remnant that the D6 re-emission did not reach.** Its counts sum to **654** (pre-overlay); **7 of 13 categories disagree with live data**; category **1.0 is absent entirely**. Critically, all seven codes in `meta.gaps` (`6.0 5.0 10.0 7.0 12.0 8.0 1.0`) were **filled by the 88-process overlay** — six are now `strong`, one `moderate`, none thin. The two genuinely thin categories, **11.0 Risk & Compliance (11/29, 38%)** and **13.0 Business Capabilities (9/25, 36%)**, appear nowhere in `meta.gaps`. | **Derive the register live** from counts + flow-share thresholds; never read `meta.gaps` (approved). Seeding from the "known 7" — as the .dc hardcodes and PR-4's brief instructed — would have printed *"The 7 thin/minimal/none categories"* against data proving all seven are well covered, while hiding the two real gaps. That is the D1/D6 failure mode again: a declared field trusted over computed content. Standing policy 1 already forbids it (`meta` is typed `unknown`, so reading it needs a deliberate cast); this records why the instruction was overruled. The register now self-corrects on every re-emission instead of needing a code change. |
| D13 | **The Export register lists DECIDED processes only.** All 742 would be ~120 pages of "Undecided" — not a document anyone reads. | The per-stream summary already carries the undecided counts, and the cover stamps the draft state, so nothing is hidden: the pack says how many are unreviewed, it just does not enumerate them. If a full register is ever wanted, it is a flag on this page, not a redesign. |
| D12 | **`P` is claimed by two brief sections** — §6/22 makes it the Present mode key, §6/23 makes it Park. | No real conflict: outside Present, `P` enters Present; inside Present you are already there, so `P` parks. `E`/`X` always switch. The mode switch yields the key when `mode === "present"`; the facilitator bar owns it. All accelerators are suppressed inside text fields — a reviewer typing "we **p**ark expensive orders" must not teleport (asserted in the e2e). |
| D11 | **The .dc's V2 search has no empty state.** An unmatched query hides every workflow section, leaving the reviewer looking at a fit bar, a search box and nothing else — with no explanation. It reads as a broken page. | Added an honest empty state ("No processes match '…'. Try a shorter search, or clear it to see the whole stream.") plus an `aria-live` result count, since a list that silently re-filters is invisible to a screen reader. The brief specifies neither; this is the smallest honest fix rather than an invention of scope. |
| D10 | **The vendor-term guard scans comments, not just rendered strings** — and it fired on my own code twice: a comment quoting Affirm's landing copy (which names a product), and the phrase "enumeration **oracle**", where the ordinary security term collides with the vendor `Oracle`. | **Keep the guard strict; rephrase the prose.** Comments never render, so these were harmless — but exempting comments means parsing them out, and the parser becomes the thing that can be wrong. A guard that occasionally makes you reword a comment is cheap; a guard with a hole in it is not. Noted here so the next person hits the `Oracle`/"oracle" collision knowingly rather than fighting it. |
| D9 | **The brief specifies no landing or verify screen** — its V1–V5 are all post-verify surfaces, and the .dc prototype starts at V1. But the journey needs an entry point. | Structure mirrors Affirm's landing/verify exactly. Copy is discovery's own, because Affirm's headline names a vendor product and invariant 1 forbids that here. The brief's §10 verbatim promises are used where they fit ("Your business on one page…", "See how the standard runs your process…", "Nothing is committed…"). Legal versions are discovery-specific (`discovery-pdpa-v1`), not Affirm's — pinning a grant to `affirm-pdpa-v1` would record consent to a notice the reviewer never read. |
| D8 | ~~**The mode switch is not rendered in PR-2a.**~~ **CLOSED in PR-3.** | Deferred because Present/Export did not exist and the .dc supplies no toast copy to stub with (it defines `flashToast` and never calls it). Both modes exist now, so the switch ships functional: segmented, persisted per session via a `/d`-scoped cookie read server-side (no flash of Explore before Present), `P/E/X` bound. Built as links-with-`aria-current` rather than the .dc's `role="tablist"` of plain buttons — a tablist would be a lie, since nothing here is a tabpanel and each mode is a real destination. |
| D7 | **`cookies.ts` mirrored, not parameterized** (deviation from the approved option). | The Affirm file is marked *"Contractual — change requires security review"*. Threading a name/path argument through it would edit security-reviewed code for no functional gain; the constants are the only difference. Approved retroactively. |
| D6 | **181 sentinel flows in the frozen client dataset** — see the dedicated section below. Corrected upstream by a data-only re-emission. Honest totals are now **545 with a flow / 197 without**. | `hasFlow()` is flow-presence only (sentinels no longer exist). A permanent CI assertion rejects any flow step matching `/\((?:no\|not)\b[^)]*\bsteps?\)/i` or any guard term, at step and sub-step level. V1's stat row reads `coverageCounts()` — computed from the data, never from `meta` or MANIFEST. |
| D5 | **`typecheck:strict` OOMs** (V8 heap exhausted) on a plain `import raw from "…client.json"`. With `resolveJsonModule`, tsc infers a full structural literal type across all 742 processes and their nested flows. Verified against baseline: clean `main` passes; adding the import alone tips it over. | Ambient declaration in `src/types/discovery-data.d.ts` types the two datasets as `unknown`, stopping the inference. Nothing is lost — the loaders never trusted the inferred shape; they zod-parse the raw value, which is a *stronger* guarantee (runtime validation vs. compile-time literal). Scoped to the discovery datasets, so JSON imports elsewhere keep normal inference. |

### Artifact re-emission during the session (resolved — benign)

**Explanation (confirmed by the data owner):** a legitimate upstream pipeline
re-emission. The canonical pipeline fixed `meta.with_flow` in both datasets and
refreshed the MANIFEST hashes; the 4 files were uploaded over the originals
mid-session. The hand-off was mistimed — the "no fix will arrive" instruction was
written before the upload landed. **The committed bytes are the intended,
canonical pipeline output.** No action outstanding.

It was detected only because copying into `src/data/discovery/` produced hashes
that did not match the ones verified earlier.

| File | Pre-flight hash | Committed hash (canonical, PINNED) |
|---|---|---|
| discovery-library.client.json | `501559ae0d27a2a9` | **`71d5a13aa7ca59de`** |
| discovery-library.consultant.json | `dea4591d7e4a5a63` | **`626f605fc732f494`** |
| vendor-term-guard.json | `57749b0be400c9e2` | **`57749b0be400c9e2`** (unchanged) |

What the re-emission changed: `meta.with_flow` 638 → 726. It did **not** touch
consultant `meta.completeness` — a known, accepted remnant (D1).

**Re-verified against the committed bytes — all pass:** three hashes
self-consistent · all five MANIFEST counts match (742/10/85/726/400) · client
dataset clean against all 23 vendor terms · join 742/742 · D2, D3, D4 unchanged.

### D6 — 181 sentinel flows (found in PR-2, fixed upstream 2026-07-17)

**The defect.** 181 of 742 processes carried a "flow" that was a single step
titled `"(no MY mandatory steps)"` with an empty role. Not a flow — a
placeholder for an *absent* flow, encoded as a present one.

**Root cause (confirmed by the data owner).** The P1 pipeline's flow extractor
split the SAP source's "Mandatory MY flow" column verbatim. Where a process had
no Malaysia-mandatory steps, that column held the literal string, which became a
fake one-step flow. The `.dc` prototype's `isNoFlow()` detected this sentinel;
the pipeline did not.

**What it would have shipped**, had we built to spec as-is:
- A fake one-step diagram on **181 client-facing process pages**, instead of the
  honest fallback — violating brief §6/18, *"never a fake flow"*.
- V1's "with a step flow" tile reading **726**, overstating real coverage by a third.
- **SAP Malaysia-localisation jargon on a client surface**, violating invariant 1.

**Why nothing caught it.** Every defence was green simultaneously:
- The vendor guard had no matching term — "MY"/"mandatory" were not on the list.
- MANIFEST's `with_flow: 726` was internally consistent and matched the data.
- `client_dataset_vendor_leaks: 0` was *true by its own guard list*.
- My PR-1 `hasFlow()` checked `flow.length > 0`, so a one-step fake passed.
- **My PR-1 tests encoded the bug**: "exactly 16 processes have no flow" and
  "every process with a flow carries a completeness badge" both passed, because
  the 181 sentinels had a fake flow *and* an `outline` badge.

The lesson generalises past this bug: **a dataset cannot certify itself.** Counts,
self-declared leak fields, and internal consistency all agreed while the content
was wrong. Only reading the actual content caught it.

**The fix (upstream, data-only re-emission — the pinned-data policy working as designed):**
- 181 sentinel flows removed (`flow` key deleted). Those processes now match the
  16 true no-flow ones: no flow, no completeness claim.
- `vendor-term-guard.json` gains `"no MY mandatory steps"` (24 terms).
- MANIFEST records `hash_algorithm` and adds `no_flow`; `meta` is now consistent
  with actuals, so D1's remnant is gone — the meta-is-informational stance stands.

**Corrected figures — supersedes every earlier "16 no-flow" note in this log:**

| | Before | After |
|---|---|---|
| with_flow | 726 (inflated) | **545** |
| no_flow | 16 | **197** (16 original + 181 de-sentinelled) |
| completeness | 223 / 177 / 326 | **223 detailed / 177 detailed+variants / 145 outline** (+197 none) |
| with_substeps | 400 | 400 (unchanged) |

### Data is FROZEN (re-pinned 2026-07-17)

The committed bytes are the pinned source of truth for this build:

```
discovery-library.client.json      35f9efe4e8ce7bfd
discovery-library.consultant.json  31feb5416252f702
vendor-term-guard.json             13c982041670dae7
```

Superseded pins (kept for provenance):
```
pre-flight   501559ae0d27a2a9 / dea4591d7e4a5a63 / 57749b0be400c9e2
first freeze 71d5a13aa7ca59de / 626f605fc732f494 / 57749b0be400c9e2
```

The next legitimate data change is a **post-pilot refresh, arriving as its own
data-only PR with a new MANIFEST** — never a silent swap. **If these bytes ever
change outside such a PR, treat it as a failure and stop.** The MANIFEST hash
assertion in CI is what enforces this.

Lessons carried into PR-1:
- Verification has a shelf life. The MANIFEST hash assertion is the only durable
  defence against drift — it is why CI checks hashes, not just counts.
- **Every count matched across the swap.** A counts-only guard would have passed
  straight through it. The hash caught it; nothing else would have.
- Any "data is final" claim should be pinned to a hash, not a date.

### Notes
- Brief says "16 of 654" no-flow; 654 is the pre-overlay `sap_base` count (654 + 88 overlay = 742). The 16 figure holds against actual data.
- `grep` hangs on the .dc files (minified long lines) — CI guard should scan with a line-length-tolerant reader, not plain grep.

## PR-1 · Data layer + guards — GREEN

Branch: `feat/neutral-discovery-data-layer` (off the artifacts branch — PR-1
imports the datasets, so basing on main would not compile).

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ (0 warnings) · `pnpm test` ✓
179 files / 3816 tests, no regressions · 46 new discovery tests ✓

**Shipped**
- `src/data/discovery/` — the 4 pinned artifacts, copied verbatim (hashes re-verified post-copy).
- `src/lib/discovery/schema.ts` — zod for both datasets. `meta` is typed `unknown`, making D1 a compile error rather than a convention.
- `src/lib/discovery/client-library.ts` — client loader. Imports the client dataset and nothing else. Owns `laneForRole()` (D3).
- `src/lib/discovery/consultant-library.ts` — consultant loader; derives completeness across the join (D2).
- `src/lib/discovery/serializers.ts` — the allowlist boundary. Field-by-field, never spread. No mapper accepts a `ConsultantProcess` — a compile-time wall. PR-6's client pack reuses these.
- `src/lib/discovery/guards.ts` — `NEUTRAL_DISCOVERY_ENABLED`, mirroring `isAffirmExternalEnabled()`.
- `src/types/discovery-data.d.ts` — D5.

**Amended 2026-07-17 (D6).** `hasFlow()` corrected; `coverageCounts()` added as
the single source for V1's stat row (computed, never `meta`/MANIFEST); the
placeholder-flow assertion added; and the PR-1 tests that encoded the sentinel
bug rewritten to the honest 545/197 split.

**The three guards**
1. **Vendor terms** (`tests/unit/discovery/vendor-terms.test.ts`) — whole-file regex, no shelling out (plain grep hangs on the minified .dc files). Client dataset: 0 hits / 23 terms. Includes counter-tests: the scan must detect a real term, must ignore "sapling", and the *consultant* dataset must come back dirty — if it ever reads clean, the scan is broken, not the data.
2. **MANIFEST** (`manifest.test.ts`) — counts + `sha256[:16]`, algorithm hardcoded with a comment (it is not recorded in the file). Hashes pinned as constants **and** checked against disk.
3. **Dependency boundary** (`dependency-boundary.test.ts`) — transitive import-graph walk from every `(external)` entry point.

**Deviations:** D5 only (see above). No new tokens, colors, or fonts. Data untouched.

### Notes for review
- **The MANIFEST guard pins hashes rather than only self-checking.** Self-consistency would have passed straight through this session's swap — data and MANIFEST changed together, and every count still matched. Only a pinned expectation catches that class of drift. A failure here with no data-only PR in flight means **stop**, not re-pin.
- **The boundary test walks transitively, not by grep.** The realistic leak is two hops: a shared helper imports the consultant loader, a client route imports the helper. A direct grep never sees it.
- **One honest gap:** the vendor-term scan over `app/(external)/d/**` and `components/discovery/**` currently scans **zero files** — those roots do not exist until PR-2. It passes vacuously today. Rather than fake a non-empty assertion, it is marked `it.todo("PR-2: assert CLIENT_SOURCE_ROOTS scan a non-empty file set")`. **PR-2 must close this**, mirroring the Affirm hex guard's non-empty self-check.

## Standing policy (approved)

These are settled and apply to the rest of the build:

1. **`coverageCounts()` is the only display source.** MANIFEST is integrity-only — an anchor, not a number to show a client. Conflating the two is how 726 nearly shipped.
2. **The MANIFEST guard cross-checks `hash_algorithm`** against its own hardcoded constant. A manifest trusted to declare its own algorithm can be swapped wholesale.
3. **No self-certifying fields.** CI computes cleanliness; it never reads a claim of it. (`client_dataset_vendor_leaks: 0` was true by its own guard list while 181 jargon strings sat in the data.)
4. **Data corrections arrive as data-only re-emissions**, never local edits; a hash change outside one is a failure — stop, do not re-pin.
5. **5 discovery tables incl. `DiscoveryEngagement`** (approved — grants need a parent, and derived sealed state needs somewhere to live).
6. **`cookies.ts` mirrored, not parameterized** (D7).
7. **The migration is hand-written and verified against `prisma migrate diff`, but has NEVER run against a real Postgres** — first preview-env task.
8. **Affirm's "bundle" wording in the shared lockout email is accepted** — consultant-facing, one word, not worth forking a template over.

## The .dc prototype is not the spec

The brief wins, and this is the standing frame for every row below: the `.dc` is a
**verified prototype**, not a design intent. Three of its properties are scaffolding
that must never ship, and they are not "conflicts" so much as artefacts:

- **Source-to-Pay-only modeling.** 23 processes loaded; the other 7 streams render a
  "not modeled in this prototype pass" note. We render **all 10 streams / 742
  processes** from the loader.
- **Hardcoded stats** (654 / 638 / 55 / 8) — pre-overlay figures. We read
  `coverageCounts()`: **742 / 545 / 60**.
- **Fixture client** ("Asia Meals Group"). Client identity comes from the session.

### The 35 resolutions

| # | Conflict | Winner | Rationale |
|---|---|---|---|
| 1 | V1 coverage chips: brief "654 / 638 / 60 industry-specific" vs .dc "654 / 638 / 55 workflows · 8 streams" | **Neither — the loader** | Both are prototype-era. `coverageCounts()` gives 742/545/60. The brief's *third* tile (60 industry-specific) matches our data exactly; its first two are its own numbers brought up to date. |
| 2 | V1 states: brief (a) fresh (b) mid (c) all-reviewed teal banner (d) Present (e) Export (f) skeleton vs .dc mid-progress only | **Brief** | (a)(b)(c)(f) built in 2a; (d)(e) are PR-3. §12.8: "skeleton is first-class, not an afterthought". |
| 3 | V1 ribbon: brief horizontal connected segments + per-stream fit bar, vertical on mobile vs .dc always-vertical, no fit bar | **Brief** | Fit bar added per §6/17; 2-col grid at `lg`, stacked below. |
| 4 | V1 heatmap: brief 15% fill + hover/tap + print-safe label+pattern vs .dc solid 100% + `title=` only | **Brief** | 15% via `color-mix`. `title=` is hover-only (invisible to touch/keyboard) — cells are real buttons with the count in the accessible name and an `aria-live` detail line. Pattern is PR-3 (Export). |
| 5 | V2 stream H1 support line | **Brief** | PR-2b. |
| 6 | V2 stream-level fallback: .dc replaces the whole index with a prototype-scope note | **Brief** | Scaffolding — does not ship. All streams are real. |
| 7 | V2 stream-complete teal banner | **Brief** | PR-2b. |
| 8 | V3 flow: brief START/END nodes, cross-lane elbow arrows, >12-step pagination vs .dc none | **Brief** | PR-2b. |
| 9 | V3 footnote: brief exact string vs .dc appends "Click a step for detail." | **Brief** | Verbatim §6/19. PR-2b. |
| 10 | V3 promise "See how the standard runs your process…" — absent from .dc | **Brief** | §10 verbatim. Used on the landing (D9); also V3 in 2b. |
| 11 | V3 fallback copy: §7 "No step flow catalogued for this process" vs §10 "No step flow is catalogued for this process yet — we'll map it with you." | **Brief §10** | The .dc already uses the §10 form; §10 is the verbatim-promise section. PR-2b. |
| 12 | V3 provenance: §6/12 "SOURCE: … · CURATED BY ABEAM · RENDERED PRODUCT-NEUTRAL" (mono 10 UPPERCASE, no second sentence) vs §10 sentence-case + "The process is yours; the reference names no vendor." | **§10 for the string, §6/12 for the style** | The brief conflicts with *itself*, not just the .dc. §10 is the "use exactly" list and wins the string — its second sentence is the product-agnostic promise stated out loud, and dropping it guts the line. §6/12 wins the style: mono, 10px, muted, shown never hidden. **Not force-uppercased** — shouting a two-sentence promise mangles it, and §6/12's uppercase was written for its own shorter form. |
| 13 | Appendix A wireframe shows a vendor citation + product-mapping overlay on V3 | **Brief §12.6** | The brief self-conflicts; §12.6 is the hard rule and the .dc correctly omits both. Client views never show product mapping. |
| 14 | Fit chip helper captions (4, per §9) — absent from .dc | **Brief** | PR-2b. |
| 15 | Chip label: §9 table "We do this differently" vs §9 legend + Appendix A + .dc "We differ" | **BOTH — corrected in PR-2b** | ~~Originally resolved to "We differ" everywhere.~~ **That was wrong.** Reading §9 in full: its table's "Chip label" column is the selector's authority and says **"We do this differently"**; §6/17's fit-bar legend, Appendix A and V4's bucket say **"We differ"**. Two contexts, not a conflict — a 160px chip the reviewer clicks and a compact legend row have different jobs. `fit.ts` now carries `FIT_CHIP_LABELS` (selector) and `FIT_LABELS` (legend/bucket/heatmap), both asserted verbatim. |
| 16 | "Not applicable" dims the row | **Brief** | PR-2b. |
| 17 | Differ requires a reason before summary counts it complete | **Brief** | PR-2b. Server keeps `reason` nullable so a partial write preserves the selection and the summary counts it incomplete — losing the reviewer's click would be worse. |
| 18 | Autosave tick + `aria-live` | **Brief** | PR-2b (rides with the selector). |
| 19 | V4 eyebrow needs `{DATE}` | **Brief** | PR-2b. |
| 20 | V4 stat strip order/labels | **Match** | Both agree. |
| 21 | V4 per-stream fit bars | **Brief** | PR-2b. |
| 22 | V4 bucket bands: brief 15% + serif 28 vs .dc 12% + serif 24/26 | **Brief** | 12% is outside §2's permitted alpha steps. PR-2b. |
| 23 | V4 bucket order | **Match** | Both agree. |
| 24 | Type ramp: V4 stat 26 / label 10px are off-ramp in the .dc | **Brief §3** | PR-2b. |
| 25 | Radii: .dc adds 3/5/6px beyond §2's 8/12/10/9999 | **Brief, with §6/2 for the chip** | §6/2 explicitly specifies "radius 5" for the scope chip, so the brief self-conflicts; §6 wins for that one element. The 6px heatmap cell is retained (it is the .dc's only sane fit at 22px height) — logged as a knowing deviation. |
| 26 | A11y: .dc has zero focus styles, chips are `<button>` not radiogroup, `outline:none` on inputs | **Brief §11** | The debt the plan exists to close. 2a ships focus rings, landmarks, `aria-live` on progress, 44px targets, 16px inputs. Radiogroup lands with the selector in 2b. |
| 27 | Motion: .dc hardcodes `.1s/.2s`, no reduced-motion | **Brief §2** | Uses `--dur-calm`/`--ease-calm` tokens + `motion-reduce:` variants. |
| 28 | Icons: .dc uses `◀ ▶ ⚑` glyphs | **Brief §12.4** | Inline stroke SVG. Affects PR-3's facilitator bar mostly. |
| 29 | Mode-switch keyboard `P/E/X` | **Brief** | PR-3, with the modes (D8). |
| 30 | Breadcrumb shape | **Equivalent** | .dc's STREAM / WORKFLOW + chip + name conveys §5's requirement. PR-2b. |
| 31 | Present H1 44/52 + 20px floor; .dc's facilitator bar is 12–13px | **Brief** | PR-3. |
| 32 | Process naming: brief's illustrative "Requisition to Pay" vs .dc's real catalogue data ("Requisitioning", 18J) | **The loader** | Neither is authoritative for *content* — the committed dataset is. The brief's *copy* strings still win. |
| 33 | Present ←/→ moves steps (brief) vs processes (.dc) | **Brief** | PR-3. |
| 34 | Content max-width 1040 / 1280 Present | **Match** | Explore is 1040 here. |
| 35 | Present "Park" as its own action vs .dc aliasing it to `discuss` | **Brief** | PR-3. Note: if Park and Discuss stay the same state, the brief's distinction is cosmetic — flag for PR-3. |

## PR-2a · Guest infra + entry + V1 — GREEN

Branch: `feat/neutral-discovery-guest-v1`.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (77 discovery tests).

**⚠ The e2e gates are WRITTEN BUT UNVERIFIED in this environment.** No Postgres is
reachable (`P1001` on localhost:5432), and `tests/e2e/global-setup.ts` opens a Prisma
client before any spec runs — so every Playwright spec fails at setup, including the
flag-off one, which needs no database of its own. Attempting it returned
`PrismaClientInitializationError`, exit 1.

This log briefly claimed "flag-off e2e ✓". That was wrong: the shell pipeline's exit
status masked the failure and I read it as a pass. Corrected here rather than
quietly. **The e2e evidence for PR-2a is outstanding and must be produced in an
environment with a database** — alongside the migration, which has still never been
executed (standing policy 7).

Compensating control added: `tests/unit/discovery/flag-gate.test.ts` statically
asserts that every route module under `app/(external)/d/**` is flag-gated. It runs
with no database and catches the realistic regression (a new /d route that forgets
its check). It is not a substitute for the e2e — it proves the check is *present*,
not that the response is *404*.

**Closed:** PR-1's `it.todo` — the vendor scan now covers `app/(external)/d/**` and
`components/discovery/**` with a non-empty self-check, so it can no longer pass
vacuously. It caught two real hits in my own code on first run (D10).

**Decisions write path:** the `DiscoveryDecision` table, the read path
(`decisionsForEngagement`), and the whole V1 fit-mix arithmetic ship in **2a**. The
**write** path — the fit selector — is **2b**. So V1's fresh/mid/all-reviewed states
are live and correct today; they simply always read `fresh` until 2b lands a way to
decide anything.

## PR-2b · V2 / V3 / V4 + the fit selector — GREEN

Branch: `feat/neutral-discovery-explore-v2`.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (104 discovery tests).

**⚠ e2e written, not executed** — same environment limit as 2a (no Postgres;
`global-setup` opens Prisma before any spec). `discovery-explore.unauth.spec.ts`
covers the full journey incl. one differ-with-reason, one N/A, the radiogroup
arrow-key contract, the no-flow fallback, the sealed 409, and axe on V2–V4. It
gates in preview. **Do not read "GREEN" as "the journey has run."**

**The a11y debt is closed.** The fit selector is a real radiogroup: `role="radiogroup"`
labelled by the prompt, `role="radio"` + `aria-checked` per chip, **roving tabindex**
(one tab stop for the group, arrows move within it, wrapping, Home/End), visible
focus everywhere, `aria-live="polite"` autosave tick. Chips are managed buttons
rather than native radios because native `<input type=radio>` cannot carry the
brief's two-line label+caption chip without label gymnastics.

**Flow diagram** (§6/19) built properly: role lanes with the System / Automatic
fallback, START/END nodes, and **cross-lane elbow connectors**. The geometry needs
no DOM measurement — lane rows are a fixed uniform height, so a connector's elbow
is derived from lane indices alone and renders correctly on the server, no refs or
effects. Flows over 12 steps wrap into bands (§6/19's "Explore wraps to rows").

**Compensating unit coverage** for what e2e can't prove here: `decisions.test.ts`
(upsert key, reason-trimming, reason-clearing on state change, the differ gate)
against a mocked client, and `copy.test.ts` asserting every §10 verbatim string
character-for-character — so a well-meaning tweak to a client promise fails CI.

### New in PR-2b

- **Conflict #15 corrected** — see the table. The chip and the legend carry
  different labels, both from the brief.
- **Conflict #12 refined** — the brief conflicts with itself on provenance; §10
  wins the string, §6/12 the style.
- **D11** — the .dc's search has no empty state; added one.

## PR-3 · Present + Export — GREEN

Branch: `feat/neutral-discovery-present-export`. Completes the client surface.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (127 discovery tests).

**⚠ e2e written, not executed** — unchanged environment limit (no Postgres;
`global-setup` opens Prisma before any spec). `discovery-present-export.unauth.spec.ts`
covers the mode switch, `P/E/X`, `1–4`, arrows-walk-steps vs shift-walks-processes,
Space reveal, `P`-parks, the hotkey-suppression-while-typing case, the Draft stamp,
label-not-colour, selectable text, axe on both, and a print snapshot. Gates in preview.

**Closed here:** D8 (mode switch) and D4 (`#DDD9CC` → `var(--border-strong)`).

**New table:** `DiscoveryNote` — additive, verified statement-for-statement against
`prisma migrate diff --from-empty` (exact match), all statements target
`DiscoveryNote`. Deliberately its own table rather than a column on
`DiscoveryDecision`: a column would ride along with every decision read, making
privacy depend on every future `select` remembering to exclude it. A separate table
means a client read must opt IN to leaking.

**The notes-privacy seam contract** (`notes-privacy.test.ts`) is asserted now, before
PR-5's C8 exists to rely on it, from three independent angles: no client view model
queries the table; the serializer allowlist has no mapper that could carry a note;
and `/d/notes` is write-only — POST exists, no GET/PUT/PATCH/DELETE, `create` is the
only verb it uses, and its response body carries no note content.

### Present (V5)

`PresentShell` is the *opposite* chrome, not `DiscoveryShell` with a flag — §8 says
hide nav, breadcrumbs, sidebars and search, so sharing a shell would have meant
negating most of it. Keyboard per §6/23 verbatim: **←/→ walk steps, ⇧←/⇧→ walk
processes** (the .dc has this backwards — conflict #33), Space reveals, `P` parks,
`1–4` set the fit (§6/21). §8's "never scroll inside a step — paginate" is why
Present shows ONE step at a time at full size rather than a scrollable swimlane;
that is what makes it legible at 3 m. The whole-flow swimlane stays Explore's job.

### Export (V7)

No shell, no links, no buttons (§8: "strip all chrome and interaction"). A link in a
printed pack is a dead artefact, and on screen it invites clicking something that
won't exist on paper. Decisions render as **SVG `<pattern>` fills + a text label** —
SVG because CSS `background-image` is what printers drop first, and the label is the
actual answer with the pattern reinforcing it.

**The Draft stamp is the honesty control here.** The pack renders for in-progress
engagements *and says so*, on the cover and in every page footer, with the real
counts. A pack that looks final in a boardroom because nobody noticed the numbers
don't add up is exactly what invariant 4 exists to prevent.

### Remaining conflicts closed in PR-3

| # | Resolution |
|---|---|
| 28 | Icons: inline stroke SVG throughout the facilitator bar (§12.4) — not the .dc's `◀ ▶ ⚑` glyphs. |
| 29 | Mode-switch keyboard `P/E/X`, persisted per session. See D12 for the `P` collision. |
| 31 | Present type: serif 44/52 H1, 28/36 step text, ≥20px floor honoured. The .dc's 12–13px facilitator text is replaced by 13px mono metadata only — the *content* type meets the floor. |
| 33 | ←/→ walk steps; ⇧←/⇧→ walk processes. Brief wins over the .dc. |
| 35 | **Park is a distinct ACTION, the same STATE.** §9 fixes the vocabulary at four and says "never introduce a fifth colour", so Park cannot be a fifth state; §6/23 makes it its own control. It sets `discuss`, and the button says what it does. The .dc aliases them too — so the brief's distinction is real but cosmetic, exactly as flagged in PR-2a. |

## PR-4 · Consultant core (C1, C2, C3, C4, C6, C10) — GREEN

Branch: `feat/neutral-discovery-workbench-core`.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (160 discovery tests).
E2E + axe specs written; gate in preview (unchanged environment limit).

**The wall now holds both directions, and it is proven, not asserted.** The
bidirectional test walks the transitive import graph from every `(external)`
entry against the consultant library, the workbench projection, the product-map
module, its API route, and both consultant-only directories. **I deliberately
breached it** — added a `loadProductMap` import to `/d/home` — and it failed with
the full path traced through to `discovery-library.consultant.json`, then went
green on restore. A guard nobody has watched fail is a guard nobody should trust.

It also carries a second angle the import walk cannot reach: a **content** scan
asserting the fence's vocabulary ("Consultant only", "Rosetta", "to map",
"DiscoveryProductMap"…) never appears in client-facing source. The import walk
catches a client module *importing* the fence; it cannot catch someone retyping a
vendor name into a `/d` component by hand, which is the likelier mistake and the
one that puts a product name on a client screen. Comments are stripped first —
a `/d` file may legitimately explain in prose why it names no product.

And a third: the wall is asserted to be **one-way**. The consultant side may
import client-safe modules (C2 derives completeness from the client dataset per
D2); if that ever fails, someone has over-tightened the wall into a duplication
generator.

### C6 — the fence

`origin = sap-base` → the scope_id *is* the reference (mapped by construction).
`origin = overlay` → ABeam authored it, no base reference exists, honest "to map".
So `DiscoveryProductMap` stores **only** hand-entered Oracle/NetSuite/other refs,
and there is no code path — not even an authenticated one — that can record a SAP
reference the library does not support. The `.dc`'s entire Rosetta comes from a
fixture named `product_map_mock`, fed by a seed file that **is not in the repo**;
every SAP ref, every mapped state and every coverage % in the prototype is
invented while its caption claims "SAP populated from the discovery library".
Deriving makes the claim true.

Coverage meters are computed (`role="meter"` with real values). The .dc
pre-colours Oracle and NetSuite grey regardless of value.

### Deviations from the .dc, by view

| View | Deviation | Reason |
|---|---|---|
| Chrome | Siderail links only the sections PR-4 ships | The .dc navigates to a stub reading "Pass 2/3 of the consultant workbench build" — shipped copy admitting the product is unfinished. Absent until they exist (PR-5/6). |
| Chrome | Every icon is inline stroke SVG | §12.4: "no icon-library glyphs, no emoji" (#21). The .dc's `⇄` also announces as "left right arrow" to a screen reader. |
| Chrome | Per-view breadcrumb | The .dc's falls through to an empty string on five views — a bug. |
| C1 | Built from the brief alone | The .dc has no C1 (#1). |
| C1 | No "Import the base library" | D17 — unreachable state, impossible button. |
| C2 | Real `<table>` + caption + `th scope` + rowheaders | §11 (#25). The .dc is CSS-grid `div`s: 742 × 11 unlabelled cells with no row/column context. |
| C2 | WAI-ARIA grid keyboard (arrows / Home / End / PageUp/Dn / ⏎ / Space), one tab stop | §11 (#25). Without it, reaching row 700 costs ~7,700 Tab presses. |
| C2 | APQC + industry facets added; origin column added | #4. The .dc omits both facets. |
| C2 | Zebra + hover | #3. The .dc has neither. |
| C3 | **Read-first** — full inspection, edit affordances disabled with "Editing arrives with the capture pipeline" | Logged decision. The library is read-only until PR-6's P4 pipeline. The .dc's editable fields silently discard: it resets the description draft to `''` on open, so Save would wipe a real description, and its own toast admits "session only". A control that lies is worse than a disabled one. |
| C3 | Focus trap + return + Escape | §11 (#25). The .dc has no trap; its backdrop click discards silently. |
| C3 | Per-process provenance | #11. The .dc hardcodes "Source: SAP Best Practices 2602" on every row — including the 88 overlay processes it did not come from. |
| C4 | Matrix + register computed live | **D14.** |
| C4 | Five coverage levels | §6B.5 (#13). The .dc collapses Minimal and None into one grey fallback, making "a few flows" look like "none". |
| C4 | Register has fill-source + status (open/sourcing/drafting/filled) + owner | §6B.6 (#15). The .dc hardcodes "Open" on all rows and drops owner. Owner is the signed-in user — we do not ask a consultant to type their own name. |
| C4 | "What's missing" is computed | The honest answer is exactly how many processes lack a flow. |
| C4 | All-strong state built | §7-C4 (#16). Honest, not confetti. |
| C6 | Chip reads "Consultant only — not shared" | **D15.** |
| C6 | "Other" column added | §6B.8 (#17). |
| C10 | No audit trail | **D16.** |
| C10 | Staleness in days + pinned hashes + algorithm | #27. The .dc shows a "2602" literal and no age. |
| All | No fixture data anywhere | The .dc carries fabricated reviewer names with working-looking emails, invented audit rows attributed to a real person, a fabricated client quote on the wrong process, and ~30 "ships in the next pass" toasts. None ship. |

## PR-5 · Sessions, facilitation, and the seam (C7 + C8) — GREEN

Branch: `feat/neutral-discovery-sessions-seam`.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (177 discovery
tests). Two-browser seam e2e written; gates in preview.

**The seam (§8).** The consultant drives from C8; the client's Present view
follows via SSE (D18). The payload is `{live, processId}` and nothing else —
selected explicitly from two columns, so it cannot widen when someone adds a
column to `DiscoveryEngagement`. A client that can hear the stream learns only
which process the room is looking at, which is what it can already see on the
projector.

**Privacy is structural, not a setting (§9.4).** The notes contract asserted back
in PR-3 finally has its consumer: `lib/discovery/workbench/session.ts`, the ONLY
reader of `DiscoveryNote` — asserted by a source scan — and it sits behind the
wall the boundary test walks. There is no "share this note" control in C8 because
there is no code path that could put one on the seam. The two-browser e2e proves
it from the other side: the consultant writes a note, and the client's browser
records every response body it receives and must contain none of it.

**D19 is the important find.** Scope was grant-only, which meant a reviewer
invited after a session was scoped would default to *all 10 streams*. Now
effective scope is engagement ∩ grant, enforced in the serializer and the write
path. `null` vs `[]` matters: a grant scoped entirely outside its session sees
nothing, where the obvious `length === 0 ? all : filter` would have handed over
the whole library.

**Scoping honesty.** A scoped session tells the client so on V1 — "This discovery
covers 1 of your 10 value streams." Without it, "Every stream reviewed — ready
for the workshop" would read as *your whole business has been looked at*.

**End session ≠ seal.** Ending a projection clears `liveAt` and nothing else.
Sealing stays the explicit action it already was: conflating them would seal a
client's record because a laptop lid closed, and the e2e asserts the client can
still decide after the room breaks up.

### Deviations, PR-5

| # | Deviation | Reason |
|---|---|---|
| — | No fabricated reviewers | The .dc ships three invented people with working-looking emails at a real-looking domain. Reviewer rows come from real grants; status is **derived** from the grant lifecycle (revoked → superseded → verified → acknowledged → invited), never a stored label. |
| — | No fixture client or seeded decisions | The .dc hardcodes `sessionClient: 'Asia Meals Group'` and pre-decides `{18J: differ, 19E: standard, 1XF: discuss}`, which seeds its tally and all five C9 stat tiles. The tally here is real decisions or zero. |
| — | Park list = the `discuss` decisions | Park is an action, not a fifth state (#35). Parking in Present and choosing "Discuss in workshop" on /d therefore land in the same place — which is the point, not a coincidence. |
| — | Revoke ends live sessions | Revoking access that leaves a live session open is not revoking access. |
| — | Resend re-issues an OTP, not a token | The invite link the reviewer already has keeps working. |

## PR-6 · Outputs, the two-lane export, and the P4 wizard — GREEN

Branch: `feat/neutral-discovery-outputs-capture`. Closes the build.

**Gates:** `typecheck:strict` ✓ · `lint:strict` ✓ · `pnpm test` ✓ (all guards,
both walls, the pinned-hash guard still green — the library JSON is untouched).

**The two-lane export is two serializers, not one with a flag.** That is the
whole design: a single builder with `includeProductMap: boolean` would put a
client's safety one inverted boolean away from a vendor name in their inbox.
`buildClientPack` has no reference to the product map — not a filter against it,
no reference at all — and its return type has nowhere to put one. The endpoint
takes a **required** `lane` with no default, because a default is exactly the
single point of failure §9.3 exists to remove. The internal pack *composes* the
client pack rather than rebuilding it, so the two lanes can never drift about
what a decision says.

`packs.test.ts` proves it by construction: it generates **both artifacts** and
runs the real vendor guard over the client one (0 hits across all 24 terms),
asserts the internal one carries the map and the register, and asserts the client
pack's key set has no room for either.

**The P4 gates are pure functions, enforced server-side.** §5.5's second reviewer
must be a **distinct identity** — a field that merely has a value satisfies the
form and defeats the gate, and the method doc is explicit that "the author of a
capture is the worst judge". §5.3's threshold holds a sensitive pattern
register-only until observed at ≥2 clients. Both are refused by the write path
regardless of what the UI allowed: a disabled button is a courtesy, a refused
write is a control.

**The dual record is two tables, not two views of one.** The register keeps
`clientRef` and `rawText`; the shared entry has no column for either, no
engagement relation, and the FK points register → entry — so a read of the shared
table cannot walk to attribution. Asserted against the schema itself.

### Deviations, PR-6

| # | Deviation | Reason |
|---|---|---|
| — | Harvest takes explained differs only | An unexplained "we differ" has nothing to generalize. It shows on C9 as an incomplete flag instead. |
| — | The author is the session user, never a form field | Otherwise §5.5's gate is satisfied by typing someone else's name. |
| — | The reviewer select omits the current user | The gate is enforced server-side; the UI simply never offers the invalid choice. |
| — | No contract-check gate | P4 §5.4 requires it, but there is no contract field to check — the clause is an open prerequisite (§9). Flagged in the debt list rather than faked with a checkbox that asserts nothing. |
| — | Quarter granularity on `captured` | Sharper than a quarter starts narrowing toward identification. |
| — | CC### and `.var-n` minted server-side | Sequence collisions are not a UI concern. |

## Parity checklist

| Screen | State | Match / Deviation | Reason |
|---|---|---|---|
| C5 `/discovery/sources` | empty / harvested / triaged | **Honest empty** | "No captures yet." — never invented candidates |
| C5 · wizard | classify → generalize → anonymize → review → promote | **Built from P4 §3** | Checklist + sign-off are required steps |
| C5 · wizard | blocked | **Built from P4 §5** | Refused without the checklist or a distinct reviewer |
| C5 · promoted list | shared / register-only | **Built from P4 §5.3** | "Register only" until a second client |
| C9 `/discovery/outputs/[id]` | live | Match | Real decisions; reads the client pack itself |
| C9 | incomplete differs | **Built from brief** | Cannot be sized, cannot be harvested |
| C9 · export | two lanes | Match | Two buttons, two confirms, two serializers |
| C2 | client-captured rows | **Built from P4 §4** | Composed + badged; JSON untouched |
| C7 `/discovery/sessions` | list / empty | **Honest empty** | No fixture sessions |
| C7 `/discovery/sessions/[id]` | scope + reviewers | **Deviation — brief** | Derived status; scope chips; D19 |
| C8 `/discovery/sessions/[id]/facilitate` | not projecting | **Built from brief** | Honest "reviewers can still explore" |
| C8 | LIVE — projecting | Match | cta-red banner + chip (D15); End control |
| C8 · tally | live | Match | Real decisions, polled |
| C8 · park list | populated / empty | Match | "Nothing parked yet." |
| C8 · notes | private | **Structural** | Only reader is behind the wall; no share path exists |
| Present (client) | following | **Built from brief** | Follows the driver; "Following the session" badge |
| Present (client) | not driven | Match | Reviewer explores freely; never yanked |
| V1 | scoped session | **Built from brief** | Honest scoped note |
| C1 `/discovery` | populated | **Built from brief** | Health tiles computed; engagements from the 2a tables |
| C1 | no engagements | **Honest empty** | Not "Import the base library" (D17) |
| C2 `/discovery/library` | populated / filtered / no match | **Deviation — brief** | Real table, 7 facets, keyboard grid |
| C3 `/discovery/library/[id]` | read-first | **Logged decision** | Edits disabled with an honest reason |
| C3 | no-flow process | Match | "No step flow catalogued for this process yet." |
| C4 `/discovery/coverage` | matrix / register / all-strong | **Deviation — D14** | Computed, never meta.gaps |
| C6 `/discovery/map` | fenced | **Deviation — brief** | Derived SAP; honest "to map"; computed meters |
| C10 `/discovery/health` | healthy / stale | **Deviation — D16** | No invented audit trail |
| Present `/d/*` (mode) | pre-start / live | **Built from brief** | Full-bleed; nav/breadcrumb/search hidden per §8 |
| Present · flow-hero | step / step-drill | **Built from brief** | One step at a time (§8 "never scroll inside a step") |
| Present · selector | all four + sealed | Match | Oversized, radiogroup preserved, `1–4` bound |
| Present · facilitator bar | live tally | Match | Real decisions, not a mock; ≥56px; keyboard-mirrored |
| Present · keyboard hints | fade after 4s | **Deviation — a11y** | Fade is visual only: stays in the a11y tree, returns on keypress, `motion-reduce` keeps it visible |
| Export `/d/export` | sealed | Match | Black-on-white, label+pattern, page footers |
| Export | in-progress | **Built from brief** | "Draft — decisions incomplete" + real counts |
| Export | no decisions yet | **Deviation — D13** | Register collapses to one explanatory page rather than 120 pages of "Undecided" |
| Export · heatmap | linearised | Match | §8: hover-only reveal gains an always-expanded equivalent |
| Mode switch | all three | **Built from brief** | Links + `aria-current`, not the .dc's fake tablist |
| V2 `/d/stream/[id]` | default | **Deviation — brief** | All 10 streams real; support line added (#5); no prototype scaffolding |
| V2 | search / no match | **Deviation — D11** | .dc has no empty state; added one + `aria-live` count |
| V2 | stream-complete | **Built from brief** | Teal 15% banner (#7) |
| V2 | sealed | **Built from brief** | .dc models none |
| V2 · process card | full / fallback / N/A | Match + §11 | Fit dot always paired with its label; N/A dims the row (#16) |
| V3 `/d/process/[pid]` | undecided | Match | Chips unselected, no reveal box |
| V3 | decided-standard | Match | standard-means box, verbatim |
| V3 | differ-with-reason | Match + gate | Expectation note verbatim; incomplete state surfaced (#17) |
| V3 | discuss-parked | Match | navy-soft note, verbatim |
| V3 | not applicable | Match | No box; row dims on the V2 card |
| V3 | **fallback (197 no-flow)** | Match | Honest panel; selector still available (§7 V3(e)); never an empty diagram |
| V3 · flow | ≤12 steps | **Built from brief** | START/END + cross-lane elbows (#8) — .dc has neither |
| V3 · flow | >12 steps | **Built from brief** | Wraps into bands (#8) |
| V3 · flow | blank roles | Match | System / Automatic lane |
| V3 · sub-step drill | expanded / empty | Match | Optional markers; "No further detail captured for this step." |
| V3 · provenance | all | **Deviation — §10 over §6/12** | Keeps "the reference names no vendor"; mono style, not uppercased (#12) |
| V3 · selector | all four + sealed | **Built from brief** | Real radiogroup + helper captions (#14, #26) |
| V4 `/d/summary` | live | Match | Stat strip from live decisions; serif 28 (#24) |
| V4 | incomplete differs | **Built from brief** | §9 honest gap capture, surfaced explicitly |
| V4 · buckets | populated / empty | **Deviation — brief** | 15% bands + serif 28 (#22); reason inset keeps its amber border |
| V4 · per-stream fit bars | all | **Built from brief** | .dc omits entirely (#21) |
| V4 · eyebrow | all | **Built from brief** | `{DATE}` added (#19) |
| V4 · export CTA | stub | **Deferred to PR-6** | Rendered disabled with an explanation, not a live button that does nothing |
| Landing `/d/[token]` | default | Deviation — copy is discovery's own | Brief specifies no landing (D9); §10 promises used verbatim |
| Landing | invalid/revoked/superseded/sealed | Match | Four guards → one terminal; never reveals which |
| Verify `/d/verify` | default / invalid / expired / rate-limited / exhausted | Match | Mirrors Affirm; OtpInput reused unchanged |
| Terminal `/d/expired` | default | Match | Polymorphic; `GuestTerminal` reused |
| Terminal `/d/ended` | default | Match | Friendly sign-out variant |
| V1 `/d/home` | (a) fresh 0% | **Built from brief** | .dc models no fresh state |
| V1 | (b) mid-progress | Match | Ribbon segments + rings |
| V1 | (c) all-reviewed | **Built from brief** | Teal banner, verbatim: "Every stream reviewed — ready for the workshop." |
| V1 | (f) skeleton | **Built from brief** | .dc models none; `Suspense` fallback mirrors real geometry |
| V1 | sealed / read-only | **Built from brief** | Derived `state != "issued"`; .dc models no sealed state |
| V1 · coverage row | all | **Deviation — loader, not .dc** | 742/545/60 vs .dc's 654/638/55·8 |
| V1 · ribbon | untouched / in-progress / reviewed | **Deviation — brief** | Per-stream fit bar added; reviewed gets its own teal treatment |
| V1 · heatmap | all | **Deviation — brief** | 15% fill; real buttons + `aria-live` instead of `title=` |
| V1 · what-happens-next | current=1 | Match | Ordered list; connectors decorative |
| V1 · mode switch | — | **Deferred to PR-3** | D8 — no toast copy exists to stub with |

---

## Follow-up — CI Security-audit gate blocks unrelated PRs (logged 2026-07-21, decision deferred)

**Ticket (not actioned — decision for later):** Adopt proactive dependency tooling and/or split the audit gate.

**Trigger.** `chore(security)` PR #111 had to be cut and merged first just to unblock the unrelated deploy-config fix PR #110 (`/discovery/coverage` route). A newly-disclosed high advisory (`brace-expansion`, GHSA-3jxr-9vmj-r5cp — patched thresholds raised to 1.1.16 / 2.1.2 / 5.0.7) turned the `Security audit` step of Quality Gates red on `main` and on **every** open PR at once.

**Why it blocks everything.** The audit runs first in Quality Gates under `set -e`, so a single new transitive-dep advisory fails the whole job and short-circuits typecheck/lint/build/tests — regardless of what the PR changed.

**This is the second occurrence.** Same pattern as the `adm-zip` advisory in #100. A time-based disclosure (nothing in anyone's diff) blocks all human PRs until someone hand-bumps an override.

**Recommendation (evaluate later):**
1. Turn on **Dependabot** or **Renovate** with security updates enabled, so patched versions land via automated PRs *before* they can block a human's PR.
2. Optionally split the gate: **blocking** for highs/criticals in *direct* deps, **advisory-only (non-blocking warning)** for *transitive* deps — keeps the signal without wedging unrelated work.

**Owner / decision:** TBD.
