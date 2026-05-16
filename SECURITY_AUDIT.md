# Security Audit Report — ABeam Platform

**Date:** 2026-02-23
**Scope:** Full-stack security assessment of the ABeam SAP fit-gap analysis platform
**Method:** Passive external inspection + comprehensive source code review
**Target:** https://ABeam-sandy.vercel.app
**Framework:** Next.js 15 App Router on Vercel, PostgreSQL (Neon), Prisma ORM

> **Update (2026-05-16):** Two further security improvements landed since
> this audit (see PRODUCTION-READINESS-AUDIT.md for the parallel findings):
>
> - **Session tokens are now hashed (SHA-256) before storage.** The
>   `Session.token` column became `Session.tokenHash`; the unhashed
>   token only ever lives in the cookie. Resolves MED-7 of the parallel
>   production-readiness audit.
> - **Content-Disposition is now sanitized via a canonical
>   `src/lib/security/filename.ts`** (safeFilename + contentDisposition,
>   RFC 6266 + RFC 5987 compliant). Applied across every download
>   surface, including the 4 routes that had been bypassing the existing
>   helper.
> - **Upstash Redis is now required-in-production** for distributed rate
>   limiting (`scripts/check-production-env.js` fails the deploy
>   without it).
>
> The historical findings below are preserved for the record.

---

## Executive Summary

This audit identified **10 findings** ranging from CRITICAL to INFORMATIONAL severity. All actionable findings have been remediated in this commit. The platform's security posture is now **strong**, with defense-in-depth across authentication, authorization, data isolation, and transport security.

**Key improvements made:**
- Session data minimization (GDPR Article 25 compliance)
- Auth endpoint rate limiting (OWASP API4:2023)
- CSP upgraded from Report-Only to enforced mode
- Cron endpoint authentication bypass fixed
- Cross-org data isolation boundary hardened
- Additional security headers added (COOP, CORP, DNS prefetch control)

---

## Findings Summary

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 001 | CRITICAL | PII exposed via `/api/auth/session` | **FIXED** |
| 002 | HIGH | Internal architecture visible in JS bundles | **NO ISSUE** (verified) |
| 003 | HIGH | Excessive session data in JWT token | **FIXED** |
| 004 | HIGH | CSRF token publicly readable | **ACCEPTABLE** (by design) |
| 005 | MEDIUM | Auth provider config disclosed | **ACCEPTABLE** (public knowledge) |
| 006 | MEDIUM | No rate limiting on auth endpoints | **FIXED** |
| 007 | MEDIUM | Verbose error routing via URL params | **NO ISSUE** (verified) |
| 008 | LOW | Open redirect potential in callbackUrl | **ALREADY FIXED** |
| 009 | INFO | CSP in Report-Only mode | **FIXED** |
| 010 | INFO | Missing HTTP security headers | **FIXED** |

### Additional Findings from Code Review

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 011 | CRITICAL | Cron endpoint auth bypass when `CRON_SECRET` unset | **FIXED** |
| 012 | HIGH | Cross-phase analytics org boundary bypass | **FIXED** |
| 013 | MEDIUM | Health check requires admin auth (blocks monitoring) | **NOTED** (by design) |

---

## Detailed Findings

### FINDING 001 — PII Exposed via Session Endpoint (CRITICAL → FIXED)

**Endpoint:** `GET /api/auth/session`
**Before:** NextAuth session callback returned `{ user: { id, email, name, image, role, organizationId } }`
**Risk:** Real user email, full name, and internal IDs exposed to any authenticated request. Violates GDPR data minimization (Article 25).
**Fix:** Session callback now strips `email` and `image` from the response. Only `id`, `name`, and `role` are returned. The bridge endpoint was updated to use `session.user.id` instead of `session.user.email`.
**Files modified:**
- `src/lib/auth/auth-options.ts` — JWT callback trimmed to `id, role` only; session callback deletes `email` and `image`
- `src/app/api/auth/bridge/route.ts` — Uses `session.user.id` instead of `session.user.email`

### FINDING 003 — Excessive Session Data in JWT (HIGH → FIXED)

**Before:** JWT token contained `userId, role, organizationId, mfaEnabled, totpVerified`
**Risk:** `organizationId`, `mfaEnabled`, and `totpVerified` leak internal auth state and organizational structure.
**Fix:** JWT token now contains only `userId` and `role`. The custom session system (`ABeam-session` cookie) handles all authenticated operations server-side with full user data from the database.
**File modified:** `src/lib/auth/auth-options.ts`

### FINDING 006 — No Rate Limiting on Auth Endpoints (MEDIUM → FIXED)

**Before:** Middleware explicitly excluded `/api/auth` from rate limiting with `!pathname.startsWith("/api/auth")`
**Risk:** Unlimited magic link requests enable email bombing and credential enumeration.
**Fix:** Auth endpoints now use the stricter `RATE_LIMITS.auth` config (5 requests per 15 minutes per IP).
**File modified:** `src/middleware.ts`

### FINDING 009 — CSP in Report-Only Mode (INFO → FIXED)

**Before:** `Content-Security-Policy-Report-Only` header — violations logged but not blocked.
**Fix:** Upgraded to enforced `Content-Security-Policy`. Added `upgrade-insecure-requests` directive.
**File modified:** `src/lib/pwa/security-headers.ts`

### FINDING 010 — Missing HTTP Security Headers (INFO → FIXED)

**Before:** 7 security headers present.
**Fix:** Added 3 additional headers:
- `X-DNS-Prefetch-Control: off` — Prevents DNS prefetching of external resources
- `Cross-Origin-Opener-Policy: same-origin` — Isolates browsing context
- `Cross-Origin-Resource-Policy: same-origin` — Prevents cross-origin resource loading
**File modified:** `src/lib/pwa/security-headers.ts`

### FINDING 011 — Cron Auth Bypass (CRITICAL → FIXED)

**Endpoint:** `GET /api/cron/analytics`
**Before:** `if (cronSecret && authHeader !== ...)` — When `CRON_SECRET` env var is unset, the entire auth check is skipped, making the endpoint publicly accessible.
**Fix:** Changed to `if (!cronSecret || authHeader !== ...)` — Now returns 401 unless `CRON_SECRET` is set AND the Bearer token matches.
**File modified:** `src/app/api/cron/analytics/route.ts`

### FINDING 012 — Cross-Phase Org Boundary Bypass (HIGH → FIXED)

**Endpoint:** `POST /api/analytics/cross-phase`
**Before:** `if (user.organizationId && ...)` — Users without an `organizationId` (consultants) could link assessments from ANY organization.
**Fix:** Changed to explicitly check: platform admins can link cross-org; all other users MUST have an `organizationId` that matches both assessments.
**File modified:** `src/app/api/analytics/cross-phase/route.ts`

### FINDING 004 — CSRF Token Readable (HIGH → ACCEPTABLE)

NextAuth CSRF tokens are public by design — they prevent cross-site request forgery by requiring the token to be submitted with POST requests. The token being readable is part of the synchronizer token pattern. **No fix needed.**

### FINDING 005 — Auth Provider Config Disclosed (MEDIUM → ACCEPTABLE)

The use of email/magic link provider is publicly observable from the login page UI. This is inherent to the authentication flow and not a security vulnerability. **No fix needed.**

### FINDING 007 — Error URL Parameters (MEDIUM → NO ISSUE)

**Verified:** The login page only checks `searchParams.get("error") === "true"` — a strict boolean check. No verbose error messages are passed via URL parameters. NextAuth error page config uses `/login?error=true` (boolean flag only). **No fix needed.**

### FINDING 008 — Open Redirect in callbackUrl (LOW → ALREADY FIXED)

**Verified:** The bridge endpoint already validates callbackUrl:
```typescript
const redirectTo = rawCallback.startsWith("/") && !rawCallback.startsWith("//")
  ? rawCallback
  : "/assessments";
```
This prevents absolute URLs and protocol-relative URLs. **Already secure.**

---

## RBAC Audit (Deliverable 8)

### API Route Authentication Coverage

| Category | Routes | Auth Check | Status |
|----------|--------|------------|--------|
| Admin (`/api/admin/*`) | 14 routes | `requireAdmin()` — platform_admin only | SECURE |
| Assessment (`/api/assessments/*`) | 120+ routes | `getCurrentUser()` + MFA + role checks | SECURE |
| Dashboard (`/api/dashboard/*`) | 7 routes | `getCurrentUser()` | SECURE |
| Notifications (`/api/notifications/*`) | 7 routes | `getCurrentUser()` | SECURE |
| Organization (`/api/organizations/*`) | 5 routes | `getCurrentUser()` + org membership check | SECURE |
| Partner Settings | 4 routes | `getCurrentUser()` + partner_lead/client_admin | SECURE |
| Stripe/Billing | 2 routes | `getCurrentUser()` + elevated roles only | SECURE |
| Auth (`/api/auth/*`) | 5 routes | N/A (auth flow) | ACCEPTABLE |
| Webhooks (Stripe) | 1 route | Stripe signature validation | SECURE |
| Cron | 1 route | Bearer token (CRON_SECRET) | **FIXED** |
| Health | 1 route | `requireAdmin()` | SECURE |
| Invitations | 1 route | Token-based (7-day expiry) | ACCEPTABLE |
| Signup | 1 route | Public (intentional) | ACCEPTABLE |

### Organization Boundary Enforcement

All org-scoped routes properly validate:
- URL path parameter `[orgId]` checked against `user.organizationId`
- Platform admins can access cross-org data
- Assessment routes enforce org boundaries through assessment ownership
- **No routes accept `organizationId` from request body** for authorization decisions

### Role Hierarchy Enforcement

The 11-role system is properly enforced:
- `platform_admin` (100): Full access, all admin routes
- `partner_lead` (90): Org management, assessment transitions
- `consultant` (80): Assessment CRUD, step classification
- `solution_architect` (75): Cross-area notes
- `project_manager` (70): Stakeholder management, OCM register
- `client_admin` (65): Org user management
- `process_owner` (60): Area-locked editing
- `it_lead` (55): Notes only (no fitStatus changes)
- `data_migration_lead` (50): Data migration register
- `executive_sponsor` (45): Sign-off transitions
- `viewer` (10): Read-only

---

## Environment Variable Audit (Deliverable 9)

### NEXT_PUBLIC_ Variables
| Variable | Value | Risk |
|----------|-------|------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry client DSN | **SAFE** — DSN is designed to be public |

No other env vars use the `NEXT_PUBLIC_` prefix. **All sensitive variables are server-only.**

### Server-Only Secrets (Verified Isolated)
| Variable | Used In | Risk |
|----------|---------|------|
| `DATABASE_URL` | `src/lib/db/prisma.ts` | SAFE — server-only |
| `DIRECT_DATABASE_URL` | `src/lib/db/prisma.ts` | SAFE — server-only |
| `NEXTAUTH_SECRET` | NextAuth internals | SAFE — not directly referenced |
| `STRIPE_SECRET_KEY` | `src/lib/commercial/stripe-client.ts` | SAFE — server-only |
| `STRIPE_WEBHOOK_SECRET` | `src/app/api/webhooks/stripe/route.ts` | SAFE — server-only |
| `SMTP_HOST/PORT/USER/PASS` | `src/lib/email/brevo.ts` | SAFE — server-only |
| `TOTP_ENCRYPTION_KEY` | `src/lib/auth/mfa.ts` | SAFE — server-only |
| `VAPID_PUBLIC_KEY` | `src/lib/notifications/push-service.ts` | SAFE — server-only |
| `VAPID_PRIVATE_KEY` | `src/lib/notifications/push-service.ts` | SAFE — server-only |
| `CRON_SECRET` | `src/app/api/cron/analytics/route.ts` | SAFE — server-only |

### Hardcoded Secrets
**None found.** All sensitive values use environment variables with graceful fallbacks.

### `.gitignore` Coverage
- `.env`, `.env.local`, `.env.production`, `.env.development` — all excluded
- `.env.example` — committed with template values only (no secrets)

---

## Bundle & Client Code Audit (Deliverable 12)

### Server/Client Boundary
- All Prisma imports (`@/lib/db/prisma`) are in server components or API routes only
- All `"use client"` components import only UI dependencies and types
- No server-only modules (`prisma`, `crypto`, `nodemailer`, etc.) imported in client code
- `next.config.ts` does not expose any env vars via `env` or `publicRuntimeConfig`

### Client-Visible Data
- API responses return only necessary fields (no raw Prisma objects)
- Error responses use standardized codes (no stack traces or internal details)
- No database schema, connection strings, or API keys in client bundles

---

## Middleware Security Layer (Deliverable 10)

### Current Middleware Stack (`src/middleware.ts`)
1. **Rate limiting** — All `/api/` routes rate-limited (auth: 5/15min, reads: 120/min, mutations: 60/min)
2. **Session bridge** — Seamless NextAuth JWT → custom session cookie bridge
3. **Pathname header** — Sets `x-pathname` for server component awareness
4. **Static asset bypass** — `/_next`, `/login`, `/mfa/`, static files excluded

### Security Properties
- Rate limit uses sliding window algorithm (in-memory, per-instance)
- Client IP extracted from `X-Forwarded-For` (leftmost) with fallback to `X-Real-IP`
- Session cookies: `HttpOnly`, `Secure` (production), `SameSite=Lax`
- Open redirect protection on bridge callback URL

---

## Security Headers Summary (Deliverable 5)

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...` | XSS prevention (enforced) |
| `X-Frame-Options` | `DENY` | Clickjacking prevention |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | HTTPS enforcement |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing prevention |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer leakage prevention |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Feature restriction |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter |
| `X-DNS-Prefetch-Control` | `off` | DNS prefetch prevention |
| `Cross-Origin-Opener-Policy` | `same-origin` | Browsing context isolation |
| `Cross-Origin-Resource-Policy` | `same-origin` | Resource loading restriction |

---

## Recommendations (Non-Blocking)

1. **Secrets rotation schedule**: Implement regular rotation for `NEXTAUTH_SECRET`, `STRIPE_SECRET_KEY`, `TOTP_ENCRYPTION_KEY`
2. **Redis-backed rate limiting**: The in-memory rate limiter resets on deployment. Consider Upstash Redis for persistent rate limiting across serverless instances
3. **CSP nonce-based scripts**: Replace `'unsafe-inline' 'unsafe-eval'` with nonce-based CSP when framework support matures
4. **Health check endpoint**: Consider a separate unauthenticated health probe (e.g., `/api/health/ping` returning only `200 OK`) for external monitoring services
5. **Audit logging expansion**: Extend decision logger to cover all admin mutations and user management operations
6. **Session token rotation**: Implement periodic session token rotation (not just expiry) for long-lived sessions

---

## Compliance Mapping

| Standard | Requirement | Status |
|----------|------------|--------|
| GDPR Art. 25 | Data minimization by design | Session data minimized |
| GDPR Art. 32 | Security of processing | TLS, CSP, HSTS enforced |
| OWASP API4:2023 | Unrestricted resource consumption | Rate limiting on all endpoints |
| OWASP API1:2023 | Broken object-level authorization | Org boundary enforcement verified |
| SOC 2 CC6.1 | Logical access controls | RBAC with 11-role hierarchy |
| SOC 2 CC6.6 | System boundaries | CSP, COOP, CORP headers |
| ISO 27001 A.14.1 | Security in development | Input validation, parameterized queries |

---

## Files Modified in This Audit

| File | Change |
|------|--------|
| `src/middleware.ts` | Auth endpoints now rate-limited |
| `src/lib/auth/auth-options.ts` | Session data minimization, JWT token trimmed |
| `src/app/api/auth/bridge/route.ts` | Uses userId instead of email |
| `src/app/api/cron/analytics/route.ts` | Auth bypass fixed |
| `src/app/api/analytics/cross-phase/route.ts` | Org boundary bypass fixed |
| `src/lib/pwa/security-headers.ts` | CSP enforced, 3 new headers added |
| `tests/unit/security.test.ts` | Updated for enforced CSP |
| `tests/unit/security-headers.test.ts` | Updated for enforced CSP |
