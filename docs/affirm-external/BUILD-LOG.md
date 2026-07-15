# Affirm External Executive Journey — Build Log

Running log of decisions, deviations from the master prompt spec, and things
discovered that contradict the spec's §2 "ground truth". Created in PR-1.

## Environment (2026-07-15)

- Repo pins Node 22.22.1 (`.nvmrc`); the build environment shipped Node v24.
  Installed the official Node 22.22.1 binary and symlinked it into
  `~/.local/bin` (earlier on PATH than the environment's nvm node24) so the
  version guard (`scripts/check-node-version.mjs`) passes without
  `SKIP_NODE_VERSION_CHECK`. pnpm 10.23.0 via corepack.
- No `.env` / database initially. Started Postgres 16 in Docker
  (`aptus-pg`, `postgres:dev@localhost:5432/aptus`), wrote `.env` from
  `.env.example`, ran `pnpm db:push && pnpm db:seed`.
- **Green baseline confirmed at branch point** (`7c1fe78`): `typecheck:strict`
  ✅, `lint:strict` ✅, `pnpm test` ✅ = **161 files / 3,686 tests passing**.
  (Spec §1.6 quoted 3,504 unit tests; the repo has grown to 3,686 unit+
  integration since. Baseline for the "no reduction" invariant is 3,686.)

## Deviations from spec §2 "ground truth" (verified 2026-07-15)

The spec warned §2 may have drifted. Verified corrections:

1. **Email transport is Brevo SMTP via nodemailer, NOT Resend.** Spec §2/§6.5
   say "existing transport used by presales emails (Resend)". Actual:
   `src/lib/presales/emails/index.ts` uses nodemailer→Brevo SMTP and documents
   that Resend was explicitly dropped to keep one provider. Affirm guest emails
   reuse `dispatchEmail` from that module (shared transport, not feature logic).

2. **Affirm API error envelope is flat `{ error: "string" }`, NOT
   `{ error: { code, message } }`.** Spec §2 "Conventions" and §4 describe the
   structured envelope with `ERROR_CODES`. That envelope exists
   (`src/types/api.ts`) but the *affirm* routes do not use it — every affirm
   route returns `NextResponse.json({ error: "unauthorized" }, { status })`.
   New affirm guest + consultant routes follow the affirm convention (flat
   string) for consistency with the surface being extended.

3. **Affirm routes do not use `safeParseJsonBody`.** They inline
   `Body.safeParse(await req.json().catch(() => ({})))` with zod. New routes
   match that pattern.

4. **Affirm auth is `getCurrentUser()` with no role check.** Consultant grant
   routes authenticate the same way as every other affirm route.

5. **Presales session cookie is an unsigned opaque random PK token** (no
   signing secret). Spec §6.6 asked whether a session secret is reused. Answer:
   presales uses none. Affirm improves slightly on this — per spec §6.1
   `AffirmGuestSession.tokenHash` is a SHA-256 of a random session token; the
   cookie carries the raw token, we store the hash. No `AFFIRM_GUEST_SESSION_SECRET`
   is needed for the cookie. CSRF still needs an HMAC secret (see below).

6. **`/c/*` page routes are NOT rate-limited by middleware.** Middleware only
   rate-limits `/api/*`. `/c/*` relies on `next.config.ts` hardening headers
   (`Referrer-Policy: no-referrer`, `Cache-Control: no-store`) + app-level
   throttles (OTP resend limiter, OTP lockout). `/a/*` mirrors this exactly:
   added an `/a/:path*` header block and app-level OTP throttle/lockout. The
   consultant grant API lives under `/api/affirm/*` and IS middleware-rate-limited.

7. **Baseline unit-test count is 3,686, not 3,504** (see above).

8. **AffirmEvent has no `grantId`/`ip`/`userAgent` columns** (unlike the
   heavyweight `PresalesAuditEvent`). It is `{ bundleId, type, actorId?,
   payload }`. Guest-side events therefore set `actorId: null` and carry
   `payload.grantId` (+ ip/uaHash in payload where relevant), exactly as §6.1
   prescribes. `actorId` is nullable — confirmed.

9. **Pilot procurement stream slug is `source-to-pay`** (contains scope item
   `J45`). `lead-to-cash` confirmed. `AffirmValueStream.id` IS the slug (no
   separate slug column).

## Design decisions

- **Shared helpers extracted to `src/lib/security/`** rather than duplicated
  (spec §6.2): `hmac-nonce.ts` (generic stateless HMAC nonce factory, the
  pattern behind presales `csrf.ts`) and `ua-fingerprint.ts` (generic UA
  normalization+hash). Affirm's `csrf.ts` is a thin wrapper binding purpose
  labels. **Presales code left untouched** to avoid regressing its test suite;
  the duplication that remains is pre-existing on the presales side only.
- **CSRF secret:** reuses `PRESALES_CSRF_SECRET` (dev fallback `NEXTAUTH_SECRET`),
  the existing dedicated HMAC secret, via the shared helper. No new secret env.
- **Guest session token is hashed at rest** (`AffirmGuestSession.tokenHash`),
  a deliberate improvement over presales' raw-PK-in-cookie model.

## PR-1 — Guest infrastructure (feat/affirm-external-guest-infra)

**Migration:** `20260715120000_affirm_external_guest_infra` — adds
`AffirmAccessGrant` + `AffirmGuestSession` (generated via `migrate diff`
live-DB→schema, since the repo's migration history lags `schema.prisma` and the
team works via `db push`; the migration contains only the two new tables + their
indexes/FKs). Reverse relations added to `User` (`affirmGrantsRevoked`) and
`AffirmBundle` (`grants`).

**New libs** (`src/lib/affirm/external/`): `events`, `tokens`, `cookies`,
`session`, `csrf`, `otp`, `guards`, `serializers`, `audit`, `emails`, `legal`,
`grants`. **Shared** (`src/lib/security/`): `hmac-nonce`, `ua-fingerprint`.

**New routes** (`src/app/(external)/a/`): `[token]/page` (landing),
`[token]/redeem`, `verify/page` + `verify/submit` + `verify/resend`, `home`
(PR-1 placeholder), `answers`, `submit`, `end`, `expired`, `ended`.
**Consultant API** (`src/app/api/affirm/bundles/[id]/grants/`): `route`
(GET list / POST create+email), `[grantId]/revoke`, `[grantId]/reissue`.
**Consultant UI:** `src/components/affirm/GrantsPanel.tsx`, wired into the
review screen (issued/submitted bundles, flag-gated).

**Wiring:** `/a` registered in `src/middleware.ts` (WORKBENCH_PATHS + bridge
exclusion + two-host redirect); `/a/:path*` hardening headers in
`next.config.ts`; `AFFIRM_EXTERNAL_ENABLED` added to `.env.example` +
`scripts/check-production-env.js` (production-required-when-enabled).

**Runtime smoke test (dev server, flag on):** landing renders client + CSRF +
ack; redeem POST → 303 `/a/home` with cookie (device pre-verified skips OTP);
`/a/home` renders authenticated content; invalid token → 307 `/a/expired`;
`/a/home` without cookie → 307 `/a/expired`. All fail-closed paths verified.

**Rate limiting note:** `/a/*` page routes are not middleware-rate-limited
(same as `/c/*`) — they rely on the hardening headers + app-level OTP
throttle/lockout. The consultant grant API is under `/api/affirm/*` and IS
middleware-rate-limited.

## PR-2 — Chaptered process content (feat/affirm-chaptered-content)

**Migration:** `20260715130000_affirm_process_chapters` — adds
`AffirmProcessChapter` (business chapters over step ranges) + `AffirmScopeItemStory`
(exec story; `reviewedAt` is the render gate). Reverse relations on
`AffirmScopeItem` (`chapters`, `story`) and `User` (`affirmStoriesReviewed`).

**Pilot streams:** `lead-to-cash` + `source-to-pay` (the procurement stream —
confirmed it contains scope item `J45`, per §3.4).

**Pipeline:** `scripts/chapterize-process-flows.ts` groups each pilot scope
item's ordered SAP steps into chapters (`src/lib/affirm/chapterize.ts`,
pure/tested) and emits reviewable drafts to `curation-model/chapters/{stream}.json`
(85 lead-to-cash + 38 source-to-pay items, 544 draft chapters). SAP-verbatim
`activity` is never written — only step ranges + new copy.

**Curation:** `curation-model/chapters/curated.json` — hand-authored, reviewed
executive copy for **5 flagship items** (31Q, 1XF, J45, 16T, 1Z3) with accurate
step ranges, roles, benefit notes, and stories. `scripts/import-process-chapters.ts`
(+ shared `src/lib/affirm/chapters-import.ts`) merges drafts + curated overlay
and stamps `reviewedAt/reviewedById` only for reviewed items. Wired into
`prisma/seed.ts` (`seedChapters`) for fresh-DB reproducibility: **123 items,
537 chapters, 5 reviewed**.

**Read model** (`src/lib/affirm/process-flow.ts`): `getChapteredFlow` (null →
flat-strip fallback when no story / unreviewed / no chapters; attaches
SAP-verbatim steps per chapter) + `getStreamStories` (review-gated summaries,
`story: null` → compact card).

### PR-2 judgment calls / deviations
- **"Floor 5" chapters applied only to flows with ≥10 steps.** The spec's literal
  floor-5 would force a 6-step flow into 5 near-1:1 chapters (not a meaningful
  grouping). Real pilot flows are mostly 1–9 steps; small flows keep their
  natural boundary count, `<5` steps → one chapter per step, hard cap 9 always.
- **`roles` left empty in generated drafts** — the step data carries no role
  field, so fabricating roles would be dishonest. Curated items have
  hand-written roles.
- **`processNavigatorUrl` left null** — didn't guess the Process Navigator URL
  shape (spec §7.2: "if uncertain, leave null rather than guess").
- **`integrationNotes`** in drafts derived from `SapHubContent.title` where a row
  matches the scope code (often empty); curated items have hand-written notes.
- **Reviewed coverage is a curated pilot subset (5 items).** The other 118 pilot
  items import as unreviewed drafts and fall back to the flat `ProcessFlowStrip`
  — partial coverage is by design (§8 L1 index renders compact cards for items
  without a reviewed story; never fake narrative).

## PR-3 — Executive journey UX (feat/affirm-executive-journey)

**Card extraction (refactor):** lifted `DecisionCard` + `InfoCard` out of the
880-line `AffirmCardList` into `src/components/affirm/cards/` (shared
`card-shared.ts` types + labels). Both the internal client surface and the
external journey now render the same cards — no fork. The cards take a NARROW
`CardQuestion` shape; `sscuiRef`/`isCustom` are optional, so their consultant
badges/source-suffix simply don't render externally (leak boundary intact by
construction). `AffirmCardList` behavior is unchanged (its tests + the internal
surface still pass).

**Read model** (`src/lib/affirm/external/journey.ts`, built on the leak-safe
`getAffirmSetForGrant`): `getGuestJourney` (L0 ribbon: streams + sub-processes +
progress), `getGuestStreamIndex` (L1 story cards), `getGuestProcessPage` (L1
chaptered story / flat fallback), `getGuestScopeAffirm` (L2 questions), and
`getGuestSummary` (submit buckets).

**Pages** (`src/app/(external)/a/`): `home` (real journey — value-chain ribbon
with `ProgressRing`, promise, what-happens-next, `SubmitPanel`; renders the
executive summary when sealed), `stream/[streamId]`, `process/[scopeItemId]`
(`ChapterBand` with `<details>` SAP-step reveal + attribution + Process
Navigator link; flat-strip fallback), `affirm/[scopeItemId]` (`GuestAffirmCards`
— shared cards + calibrated notes + autosave to `/a/answers` + sticky progress).

**Components:** `GuestAffirmCards`, `SubmitPanel` (confirm dialog),
`ChapterBand`, `ProgressRing`, `GuestGuide` (all under
`src/components/affirm/external/`). Calibrated copy in `copy.ts` (exact §8
prose). 4 client-audience `ScreenGuide` entries added
(`affirm-exec-{home,stream,process,affirm}`).

**Runtime-verified end-to-end (dev server, flag on):** landing → ack → redeem →
home (ribbon) → stream index → **reviewed chaptered story for J45** (chapters +
SAP-source reveal + attribution) → affirm cards → **answer autosave** (`POST
/a/answers` deviate+reason → 200, response persisted, `guest_answer_saved`
event) → **submit** (`POST /a/submit` → issued→submitted) → **executive summary**
→ **sealed read-only** on the affirm page. All confirmed via curl.

### PR-3 judgment calls / deviations
- **No question→chapter mapping (grouped under "General").** §8 says map only if
  unambiguous and DO NOT guess; the data has no reliable question↔chapter link
  (that anchoring is PR-4), so L2 questions render as one "General" group with
  the chapter count shown as context only. Per-step highlighting is PR-4.
- **The interactive AffirmLearnProvider / glossary is NOT mounted on the guest
  surface.** It's consultant tooling; shipping it to guests bloats the bundle
  and contradicts the "no jargon" principle. Instead a lightweight `GuestGuide`
  (`<details>`, server-rendered, no client JS) surfaces the client-audience
  ScreenGuide copy. Term chips are omitted on the exec surface by the same
  reasoning (the copy is already plain-language).
- **"Next process" CTA points to the stream index** (pick the next process)
  rather than computing a linear next-item order.
- **A11y:** radiogroup for choices, `aria-pressed` flag toggle, `role="progressbar"`
  with values, `aria-live` on autosave/progress, `aria-expanded` verbatim
  toggles, native `<details>` for chapter/step reveals (keyboard-completable,
  no pointer needed), `aria-modal` submit dialog.
- **Visual baselines:** the visual-app harness has no baselines for `/a/*`;
  visual snapshotting skipped (noted here per §8).

## FINAL REPORT

**Branches / PRs** (stacked: each targets the previous):
- PR-1 `feat/affirm-external-guest-infra` → https://github.com/ib823/aptus/pull/95 (base: main)
- PR-2 `feat/affirm-chaptered-content` → https://github.com/ib823/aptus/pull/96 (base: PR-1)
- PR-3 `feat/affirm-executive-journey` → (base: PR-2) — see PR link in the session summary

**Migrations added:** `20260715120000_affirm_external_guest_infra`,
`20260715130000_affirm_process_chapters`.

**New env vars:** `AFFIRM_EXTERNAL_ENABLED` (fail-closed flag; reuses
`PRESALES_CSRF_SECRET` for CSRF, enforced in `check-production-env.js`).

**New routes:** `/a/{token,verify,home,stream/[id],process/[id],affirm/[id],
answers,submit,end,expired,ended}`; `/api/affirm/bundles/[id]/grants*`.

**Test deltas (unit+integration, `pnpm test`):**
- Baseline at branch point: **3,686** (161 files).
- After PR-1: **3,743** (+57). After PR-2: **3,765** (+22). After PR-3: see
  session summary (+journey/read-model tests; card extraction added no test
  reduction). No suite ever shrank.

**Demo locally:**
```
docker run -d --name aptus-pg -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=aptus postgres:16
cp .env.example .env   # set DATABASE_URL=postgresql://postgres:dev@localhost:5432/aptus
pnpm install && pnpm db:push && pnpm db:seed        # seeds chapters too (5 reviewed)
# create an issued bundle over both pilot streams + a device-verified grant, then:
AFFIRM_EXTERNAL_ENABLED=true PRESALES_CSRF_SECRET="<32+ chars>" pnpm dev
# open https://localhost:3003/a/{rawToken}   (grant scoped to lead-to-cash + source-to-pay)
# reviewed chaptered stories: 31Q, 1XF, J45, 16T, 1Z3
```
Grants are created from the bundle's Review screen (issued/submitted) once the
flag is on; the invite email carries `/a/{rawToken}`.

**§2 ground-truth corrections found** (all in the Deviations section above):
email transport is Brevo SMTP not Resend; affirm error envelope is flat
`{ error }` not `{ code, message }`; affirm doesn't use `safeParseJsonBody`;
presales session cookie is unsigned opaque PK; `/c` (and `/a`) page routes are
not middleware-rate-limited; baseline test count is 3,686 not 3,504;
`AffirmEvent` has no grantId/ip/ua columns (guest events use `payload.grantId`).

**Open items discovered, not fixed** (out of PR-1–3 scope):
- Question→chapter anchoring + per-step highlighting is PR-4 (deferred, not built).
- Internal estimation loop is PR-5 (deferred, not built).
- The repo's migration history lags `schema.prisma` (team uses `db push`); new
  migrations were generated via `migrate diff` and contain only the new tables.
  A full `migrate deploy` on an empty DB would need the history reconciled — a
  pre-existing condition, unchanged by this work.
- Process Navigator deep-link URLs are null (shape not verified); populate when
  the canonical pattern is confirmed.

## UI/UX apply pass — Executive Surface design (feat/affirm-external-uiux-apply)

Restyle-to-spec of the /a/* surface to `docs/affirm-external/design/ABeam-Executive-Surface.dc.html`. Behavior, routes, data flow, security, and the state machine are unchanged — presentation + the design's copy only.

**Tokens (§2.2):** added `--brand-navy-border` (#CFD7E0) and `--radius-step` (10px) to `:root` + `@theme` (exposed as `border-navy-border` / `rounded-step`). Fixed the dangling `var(--radius-card)` → `--radius-card-warm` in `affirm-responsive.css`; replaced `ProcessFlowStrip`'s `rounded-[10px] border-[var(--brand-navy-border,#CFD7E0)]` with the tokens. Decision fills use the permitted color-mix alpha steps (no new tokens). The prototype's `:root` matched the repo's exactly (decision/brand/surface hexes identical), confirming the spec is the repo's token system.

**Shared components** (`src/components/affirm/external/`): `GuestShell` (top-bar + footer chrome), `StatusPill`, `ProgressRing` (token-only), `ValueChainRibbon`, `WhatHappensNext`, `SubmitPanel` (sticky bar + focus-trapped confirm modal), `GuestTerminal`, `ChapterBand` (rail/node/connector + step-strip lanes), `JourneyProgressBar`, `GuestGuide`. Cards (`DecisionCard`/`InfoCard`) gained an optional per-choice expectation-note style + a `saved` autosave tick (internal surface unaffected — both optional).

### Parity checklist (screen · match/deviation)
- **S1 Invitation landing** — match: 560px, wordmark, consent card, prototype copy ("see how the SAP standard runs your processes…", ack/PDPA labels, "Begin review"). Deviation: native checkboxes (`accent-navy`) instead of custom role=checkbox boxes — keeps it a no-JS server component + accessible.
- **S2 Device verification** — match: OTP box, shake-on-error, attempts line ("That code didn't match — N attempts remaining"). Deviation: no live 60s resend countdown (server component; resend is server-throttled) — a "Resend code" action is shown instead.
- **S3 Terminal** — match: terminal-shell card, eyebrow/heading/body. Deviation: no populated consultant-contact card — /a/expired is polymorphic and must not oracle nor fabricate a person; a generic "refer to your invitation email" note is used. The design's expired/ended/locked variants collapse to one generic message on /a/expired (no-oracle invariant); "ended" copy is used on explicit sign-out.
- **S4 Executive home** — match: greeting eyebrow, "Your processes, on one page.", value-chain ribbon (ring + status pill + process nodes + affirmed count), what-happens-next (cur=1), sticky submit bar, submit-confirm modal (2px cta border, shadow-pop, stream rows, seal text, unanswered warning), sealed banner. Deviation: submit bar is always available while issued (modal warns on unanswered) rather than only-when-complete, so partial submit is possible with the "submit anyway" affordance.
- **S5 Stream index** — match: story cards (full: scope chip + status pill + headline + ≤4 outcomes + footer meta; fallback: dashed compact card), `minmax(360px,1fr)` grid, complete banner.
- **S6 Process story** — match: sticky journey progress bar, chapter band (numbered navy rail + connector), verbatim reveal as a horizontal step-strip lane (172px cards → vertical on mobile), attribution "Source: SAP Best Practices · S/4HANA Cloud Public Edition 2602" + "Open in SAP Signavio Process Navigator ↗", dynamic CTA ("Affirm this process · N questions" / "Review your answers ✓"), flat-strip fallback. Deviation: progress bar is single-color (answered/total) not tri-color by choice — avoids extra per-choice read-model work; noted.
- **S7 Affirm** — match: journey progress bar, chapter-grouped ("General"), affirm cards (choice chips radiogroup, standard-means box, per-choice expectation notes with the exact §8 prose, deviation reason box, information format + flag, verbatim reveal, autosave "Saved" tick), sealed read-only banner.
- **S8 Executive summary** — match: eyebrow, "Thank you, {name}…", stat strip (Adopted/To discuss/We differ/Total), three bucket cards (header color-mix fill + items + deviation reason boxes), what-happens-next (cur=2), print-clean (`ax-print-plain`/`ax-no-print`). Deviation: no consultant/download row (no fabricated consultant identity; download-a-copy is print via the browser).
- **S9 Consultant grants panel** — match: status pills mapped to repo `status-*` tokens (removed the one `#8B5A00` hex → `StatusPill`), invite form + stream chips. Deviation: kept the existing responsive list layout rather than the design's fixed 5-column grid (the design itself flagged that grid as overflowing on mobile).

**Responsive/a11y (§3):** `affirm-external.css` (loaded by a new `(external)/a/layout.tsx`) adds ≥44px touch (`ax-touch`), 16px inputs ≤767px (`ax-input`), scroll-snap lanes that stack on mobile (`ax-snap-lane`), and print rules. A11y: radiogroup choice chips, `aria-pressed` flag, `role="progressbar"`, `aria-live` on autosave/attempts/progress, `aria-expanded` verbatim, native `<details>` reveals, focus-trapped `aria-modal` submit dialog, `focus-visible:shadow-focus-ring` throughout.

**Guard (§2.6):** `tests/unit/affirm/external/no-stray-hex.test.ts` scans `(external)/a/**` + external/cards components for raw hex — zero. Drove the tokenization of the old inline-hex S1/S2 pages, the card amber border, and the ProgressRing fallbacks.

**Verification:** typecheck:strict, lint:strict, pnpm test (3,768 → 3,770; +2 hex-guard, no reduction), and **pnpm build** all pass — every color-mix / border-navy-border / rounded-step class generates for production. Runtime-verified via curl on a dev server (flag on): S1 landing, S4 home (ribbon + what-happens-next + submit bar), S5 stream cards, S6 process story (chapter band + "See the exact SAP steps" + attribution), and S7 affirm cards all render the design copy/structure. Screenshot auto-capture (scripts/affirm-external-screenshots.mjs) needs Playwright headless-chromium system libs (install-deps, root) that are unavailable in this environment — parity verified via curl + the production build instead.
