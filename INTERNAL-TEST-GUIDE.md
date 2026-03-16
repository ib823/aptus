# ABeam — Internal Test Guide

**Date:** 2026-03-16
**Environment:** https://aptus-sandy.vercel.app

---

## Prerequisites

- A Vercel deployment in READY state
- Access to the Neon database (console.neon.tech) for emergency recovery
- A modern browser (Chrome, Edge, Safari, Firefox)

---

## 1. Login — Magic Link

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Go to `/login` | Login page loads with split-panel layout. Passkey button + email form visible |
| 1.2 | Enter your email, click **Continue** | "Check your email" confirmation appears |
| 1.3 | Open email, click the magic link | Redirected to `/assessments` (or `/mfa/setup` if first-time consultant) |

**If email doesn't arrive:** Check that `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `EMAIL_FROM` are set in Vercel env vars.

---

## 2. MFA Setup — New Consultant Users

New users with `consultant` role are required to set up MFA before accessing the portal.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Log in as a new consultant user | Redirected to `/mfa/setup` |
| 2.2 | Page shows two options: **Passkey** and **Authenticator App** | Both cards visible (passkey hidden if browser doesn't support WebAuthn) |
| **Path A — Passkey** | | |
| 2.3a | Click **Passkey** card | "Register a Passkey" screen with **Add passkey** button |
| 2.4a | Click **Add passkey** | Browser prompts for fingerprint/face/PIN |
| 2.5a | Complete biometric prompt | Toast: "Passkey registered successfully". Redirected to `/assessments` |
| **Path B — Authenticator App** | | |
| 2.3b | Click **Authenticator App** card | QR code + manual entry secret displayed |
| 2.4b | Scan QR with Google Authenticator / Authy | 6-digit code appears in app |
| 2.5b | Enter code, click **Verify & Enable** | Redirected to `/mfa/verify`, enter code again, then `/assessments` |

---

## 3. Login — Passkey (Returning Users)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Go to `/login` | Login page loads |
| 3.2 | Click **Sign in with passkey** | Browser prompts for fingerprint/face/PIN |
| 3.3 | Complete biometric prompt | Redirected to `/assessments`. No MFA verify step (passkey satisfies MFA) |

---

## 4. Navigation

All navigation links should work on every page.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Click **Dashboard** in header | Navigates to `/dashboard` |
| 4.2 | Click **Assessments** in header | Navigates to `/assessments` |
| 4.3 | Click **Analytics** in header | Navigates to `/analytics` |
| 4.4 | Click **Organization** in header | Navigates to `/organization` |
| 4.5 | Click **Admin** in header (admin only) | Navigates to `/admin` |
| 4.6 | Open an assessment, click **Review** tab | Navigates to review page |
| 4.7 | Click **Results** tab | Navigates to config page |
| 4.8 | Click **Tracking** tab | Navigates to integrations page |
| 4.9 | Click **Wrap-up** tab | Navigates to activity page |
| 4.10 | On profile page, click **Continue to Scope Selection** | Navigates to scope page (only if profile >= 60% complete) |

---

## 5. Admin — User Management

Requires `platform_admin` role. Go to **Admin > Users**.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Navigate to `/admin/users` | User table with Name, Email, Role, Status, MFA, Last Login, Actions |
| 5.2 | Click role dropdown on another user | Dropdown shows all roles |
| 5.3 | Select a different role | Confirmation dialog appears. Click **Confirm** — role changes, toast shown |
| 5.4 | Click person icon (orange) on an active user | User deactivated, row dims. Toast: "user deactivated" |
| 5.5 | Click refresh icon (green) on an inactive user | User reactivated. Toast: "user reactivated" |
| 5.6 | Click shield icon on a user with MFA enabled | MFA reset. Toast: "MFA reset for user". MFA column shows "Off" |
| 5.7 | Click trash icon on a user | Confirmation dialog: "Delete user permanently?" Click **Delete** — user removed |
| 5.8 | Verify your own row has no action buttons | Actions disabled for self (prevents lockout) |
| 5.9 | Try deactivating the last platform_admin | Error toast: "Cannot deactivate the last platform admin" |

---

## 6. Admin — Assessments Filter

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Go to `/admin/assessments` | Page loads with status filter dropdown |
| 6.2 | Open the status dropdown | Single "All Status" entry (no duplicate) |
| 6.3 | Select "Draft", "In Progress", etc. | Table filters to matching assessments |

---

## 7. Security Checks

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | Open browser DevTools (F12) > Console | No red errors on page load (browser extension warnings OK) |
| 7.2 | Check the **Network** tab response headers | `Content-Security-Policy` header present, NO `strict-dynamic` in script-src |
| 7.3 | Try accessing `/assessments` without logging in | Redirected to `/login` |
| 7.4 | Try calling `POST /api/admin/users/{id}` as non-admin | Returns 403 Forbidden |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Login button greyed out | Hard refresh (`Ctrl+Shift+R`). Check browser supports JS |
| Magic link email not arriving | Verify SMTP env vars in Vercel dashboard |
| Stuck on MFA verify page | Admin can reset MFA from `/admin/users` (shield icon) |
| Navigation links don't work | Hard refresh. If persists, clear service worker: DevTools > Application > Service Workers > Unregister |
| "Cannot deactivate last platform admin" | At least one other platform_admin must exist |

---

## Environment Variables Required

```
NEXTAUTH_SECRET          — openssl rand -base64 32
NEXTAUTH_URL             — https://aptus-sandy.vercel.app
TOTP_ENCRYPTION_KEY      — 64-char hex key
DATABASE_URL             — Neon connection string
SMTP_HOST                — smtp-relay.brevo.com
SMTP_PORT                — 587
SMTP_USER                — Brevo SMTP login
SMTP_PASS                — Brevo SMTP password
EMAIL_FROM               — verified sender email
```
