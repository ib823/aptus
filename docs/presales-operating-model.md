# ABeam Workbench — presales operating model

How a presales bundle moves from creation to signature, and where the boundary
between the two role surfaces sits. Extracted from the README so the front page
stays a front page.

## Two surfaces, one data model

- **External** (`/c/*`) — guest URLs the prospect uses to review proposed
  decisions, complete OTP, set choices, and sign. The redaction layer
  (`src/lib/presales/redaction.ts`) strips IP-bearing fields from every read on
  this surface. **Direct reads of `contentSnapshotJson` or
  `PresalesBundleDecision` rows are not permitted on `/c/*`.**
- **Consultant** (`/presales/*`) — portal UI for ABeam staff. Reads the same rows
  DIRECTLY, without redaction.

The asymmetry is deliberate and is documented at the top of
`src/lib/presales/redaction.ts`. **Do not consolidate the two read paths.**

## Lifecycle of a bundle

1. **Create** — consultant fills `/presales/new`: six sections, snapshot scope
   content, define stakeholders, window and legal versions.
2. **Send** — `POST /api/presales/bundles` with `action=send` snapshots the
   catalog, mints per-grantee tokens, dispatches magic-link emails, and writes a
   `bundle_sent` audit event (locking `contentSnapshotJson` + `scopeCodes` per R1).
3. **Redeem** — guest opens `/c/[token]`, ticks acknowledgement and PDPA consent,
   posts to `/c/[token]/redeem`. Session cookie (`presales-session`, `Path=/c`,
   `SameSite=Strict`, `HttpOnly`, `Secure` in production) is set; OTP is issued on
   first redemption from any new device, keyed on a UA hash.
4. **Verify** — guest enters the 6-digit code on `/c/verify`. The lockout cascade
   fires at 5 wrong attempts: grant revoked, consultant alerted.
5. **Choose** — guest opens `/c/s/[scopeCode]` and picks std / cfg / cst per
   decision. Each `POST /c/decisions` writes a new `PresalesBundleDecision` row
   and supersedes any prior one. A CSRF nonce is required on every form.
6. **Sign** — the designated signatory (`grant.canSignOff = true`) posts to
   `/c/sign`. An atomic `updateMany WHERE signedAt IS NULL` makes it
   first-writer-wins; everyone else gets `409 BUNDLE_ALREADY_SIGNED`. There is a
   5-minute grace window past `expiresAt`.
7. **PDF + email** — `/api/presales/sign-pdf` renders the signed artifact
   (@sparticuz/chromium, 1024 MB) from the same HTML used for the in-browser
   DRAFT preview, so the two are pixel-identical. The PDF is uploaded to Vercel
   Blob and its SHA-256 recorded. Two emails go out: signatory confirmation and
   ABeam internal delivery.
8. **Done** — the bundle becomes immutable. Every mutation route returns
   `409 BUNDLE_SIGNED`. Post-signoff changes go through
   `/presales/[bundleId]/change-request`.

## Audit events

All 38 values live in `src/lib/presales/audit-events.ts`. Consultant-side actions
carry `actorUserId`; guest-side actions carry `grantId`. Every state-changing
route writes at least one event.

Three forensic markers worth recognising:

| Event | What it means |
|---|---|
| `external_action_denied { reason: 'otp_bypass_attempt' }` | A guest reached `/c/s/[scopeCode]` without per-device OTP verification. |
| `external_action_denied { reason: 'session_invalid', bundleId IS NULL }` | The cookie resolved to no session row — an off-bundle tampering signal. |
| `external_action_denied { reason: 'alert_dispatch_failed' }` | The OTP-lockout consultant alert failed to send. Cross-references the original lockout audit row id. |

## Required environment variables

Names only — values live in the deployment's environment, never in this repo.
`scripts/check-production-env.js` enforces the production set at build time.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Postgres |
| `NEXTAUTH_SECRET` | Portal session JWT signing |
| `PRESALES_CSRF_SECRET` | Must differ from `NEXTAUTH_SECRET`; ≥32 chars |
| `PRESALES_INTERNAL_SECRET` | `/api/presales/sign-pdf` server-to-server auth |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Brevo SMTP transport, shared with NextAuth magic links |
| `PRESALES_EMAIL_FROM` (or `EMAIL_FROM`) | Sender identity |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob, for signed PDFs |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Distributed rate limiting |

Development fallbacks: missing `SMTP_USER` logs to console; missing Blob token
returns a data URL; missing internal secret returns 401, so the sign route
surfaces "PDF generation skipped" rather than failing silently.

## OTP threat model, stated honestly

Email OTP on first redemption defeats casual link forwarding: the recipient must
enter a code delivered to the grantee's own address.

It does **not** defeat mail-server auto-forwarding. If the prospect's mailbox
forwards to a personal address or a shared distribution list, the OTP travels
with the magic link and the gate does not bind. This is a property of email as a
channel, not a defect in the implementation — and it is recorded here because a
control whose limits are undocumented gets trusted past them.

SMS-OTP would close it and is **out of scope for v1**. Until then, consultants
are responsible for assessing recipient mailbox hygiene before issuing a grant
for genuinely sensitive material.

## Localization

English-only in v1. BM (Malaysia) and Chinese packs are designed and documented
for v1.1. `PresalesAccessGrant.acknowledgement_text_version` and
`PresalesBundle.acknowledgementTextVersion` are the extension point: rendered
copy can be keyed on language without a schema change.
