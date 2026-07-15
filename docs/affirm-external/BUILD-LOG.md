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
