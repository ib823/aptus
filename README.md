This is a Next.js application.

## Getting Started

Required toolchain:

- Node.js `22.22.1`
- `pnpm` `10.23.0`

Use one of the repo pins before installing dependencies:

```bash
nvm use
# or
asdf install
# or
mise install
```

Then install dependencies and run the development server:

```bash
pnpm install
pnpm dev
```

Local development enforces the exact Node.js version above through `.nvmrc`, `.node-version`, `.tool-versions`, Volta metadata, and `scripts/check-node-version.mjs`.

`package.json#engines.node` intentionally uses `22.x` instead of an exact patch so Vercel and other hosted builders can use the latest supported Node 22 runtime. For Vercel deployments, make sure the project Node.js version is set to `22.x`. The repo still pins local development to `22.22.1` so installs, CI, and production builds stay aligned with a known-good toolchain.

Open [http://localhost:3003](http://localhost:3003) with your browser to see the result.

You can start editing the page by modifying files under [`src`](/workspaces/aptus/src).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## ABeam Workbench — design reference

The presales workbench follows `ABeam-Workbench-Design-System.docx` at the repo
root. That document is pinned to v1.0 Issued for Implementation and is the
single source of truth for color tokens, typography, components, motion, and
print rules. Update the version stamp on any token or rule change.

## Presales workbench — operating model

ABeam Workbench is a pre-onboarding Fit-to-Standard decision workbench for SAP
S/4HANA Cloud Public Edition presales engagements. Two role surfaces share one
data model:

- **External** (`/c/*`) — guest URLs the prospect uses to review proposed
  decisions, complete OTP, set choices, and sign. The redaction layer
  (`src/lib/presales/redaction.ts`) strips IP-bearing fields from every
  read on this surface. **Direct reads of `contentSnapshotJson` or
  `PresalesBundleDecision` rows are not permitted on `/c/*`.**
- **Consultant** (`/presales/*`) — portal UI for ABeam staff. Reads the
  same rows DIRECTLY (no redaction). The asymmetry is documented at the
  top of `src/lib/presales/redaction.ts` — do not consolidate.

### Lifecycle of a bundle

1. **Create** — consultant fills `/presales/new` (six sections, snapshot
   scope content, define stakeholders + window + legal versions).
2. **Send** — POST `/api/presales/bundles` with `action=send` snapshots
   the catalog, mints per-grantee tokens, dispatches magic-link emails,
   writes `bundle_sent` audit (locks `contentSnapshotJson` + `scopeCodes`
   per R1).
3. **Redeem** — guest opens `/c/[token]`, ticks acknowledgement + PDPA
   consent, posts to `/c/[token]/redeem`. Session cookie (`presales-session`,
   `Path=/c`, `SameSite=Strict`, `HttpOnly`, `Secure` in prod) set; OTP
   issued on first redemption from any new device (UA-hash-based).
4. **Verify** — guest enters 6-digit code on `/c/verify`. Lockout cascade
   fires at 5 wrong attempts (grant revoked, consultant alerted).
5. **Choose** — guest hits `/c/s/[scopeCode]`, picks std / cfg / cst per
   decision. Each POST `/c/decisions` writes a new
   `PresalesBundleDecision` row and supersedes any prior. CSRF nonce on
   every form.
6. **Sign** — designated signatory (`grant.canSignOff = true`) posts to
   `/c/sign`. Atomic `updateMany WHERE signedAt IS NULL` ensures
   first-writer-wins; others get 409 `BUNDLE_ALREADY_SIGNED`. 5-minute
   grace window past `expiresAt`.
7. **PDF + email** — `/api/presales/sign-pdf` renders the signed
   artifact (@sparticuz/chromium, 1024MB memory, same HTML used for
   in-browser DRAFT preview — pixel-identical). PDF uploaded to Vercel
   Blob; SHA-256 hash recorded. Resend dispatches two emails: signatory
   confirmation + ABeam internal delivery.
8. **Done** — bundle transitions to immutable state. Every mutation
   route returns 409 `BUNDLE_SIGNED`. Post-signoff change requests go
   through `/presales/[bundleId]/change-request`.

### Audit events (38 values, all in `src/lib/presales/audit-events.ts`)

Consultant-side actions are written with `actorUserId`. Guest-side actions
carry `grantId`. Every state-changing route writes at least one event.
Notable forensic markers:

- `external_action_denied { reason: 'otp_bypass_attempt' }` — guest hit
  `/c/s/[scopeCode]` without per-device OTP verification.
- `external_action_denied { reason: 'session_invalid', bundleId IS NULL }` —
  cookie did not resolve to any session row; off-bundle tampering signal.
- `external_action_denied { reason: 'alert_dispatch_failed' }` — OTP
  lockout consultant alert email failed to send; cross-references the
  original lockout audit row id.

### Required environment variables

Production:

| Var | Purpose |
|---|---|
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Postgres |
| `NEXTAUTH_SECRET` | Portal session JWT signing |
| `PRESALES_CSRF_SECRET` | Distinct from `NEXTAUTH_SECRET`, ≥32 chars (enforced by `scripts/check-production-env.js`) |
| `PRESALES_INTERNAL_SECRET` | `/api/presales/sign-pdf` server-to-server auth |
| `RESEND_API_KEY` | Email transport |
| `PRESALES_EMAIL_FROM` (or `EMAIL_FROM`) | Sender identity |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob for signed PDFs |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Distributed rate limit |

Dev fallbacks: missing Resend → console log; missing Blob → data URL;
missing internal secret → returns 401 (so the sign route surfaces "PDF
generation skipped").

### Where things live

```
src/app/(external)/c/                    — guest surface (redacted reads)
  [token]/                                 magic-link landing + redeem
  verify/                                  OTP + resend
  s/[scopeCode]/                           workbench (read/write) + /signed
  decisions/                               POST decision write
  sign/                                    POST signoff
  end/, ended/                             logout + confirmation
  expired/                                 polymorphic terminal

src/app/(portal)/presales/               — consultant surface (direct reads)
  page.tsx                                 bundles index
  new/page.tsx                             creation flow
  [bundleId]/page.tsx                      bundle dashboard
  [bundleId]/audit/                        full audit log + CSV
  [bundleId]/preview/[scopeCode]/          preview-as-client (redacted!)
  [bundleId]/change-request/               post-signoff CR
  settings/page.tsx                        consultant prefs

src/app/api/presales/                    — server-side handlers
  bundles/                                 POST create
  bundles/[id]/branding/                   POST edit (R1-locked)
  bundles/[id]/grants/[gid]/email/         POST email correction
  sign-pdf/                                Chromium PDF render
  change-requests/, preferences/           CR + settings stubs

src/lib/presales/                        — shared modules
  cookies.ts, csrf.ts, session.ts        — guest cookie + nonce + session
  guards.ts                              — R1 snapshot lock, R2 OTP lockout
  otp.ts, ua-fingerprint.ts              — OTP issue/verify + per-device
  audit-events.ts, audit-session.ts      — eventType union + session_invalid
  redaction.ts                           — THE load-bearing IP gate
  emails/                                — 4 templates + Resend dispatcher
  pdf-template.ts                        — signoff PDF HTML template
  rbac.ts                                — consultant role matrix
```

### Presales OTP threat model

Email-OTP on first redemption defeats casual link forwarding: the recipient
must verify a 6-digit code delivered to the grantee's email. It does **not**
defeat auto-forwarder rules at the mail server — if the prospect's mailbox is
configured to auto-forward to a personal address or a shared distribution
list, the OTP email rides along with the magic link and the gate is bypassed.

For highest-sensitivity bundles, SMS-OTP would be required. **SMS-OTP is out
of scope for v1.** Consultants are responsible for assessing the recipient's
mailbox hygiene before issuing a grant for material assumed to be sensitive.

### Localization

English-only in v1. BM (Malaysia) and Chinese language packs are designed and
documented for v1.1. The `acknowledgement_text_version` field on
`PresalesAccessGrant` and `PresalesBundle.acknowledgementTextVersion` provide
the extension point — flip the rendered copy keyed on language without a
schema change.
