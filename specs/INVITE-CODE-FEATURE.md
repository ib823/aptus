# Feature Spec: 6-Digit Invite Code System

**Status:** Not started
**Priority:** High
**Date:** 2026-03-17

---

## Overview

Admin can issue 6-digit invite codes to new users as an alternative to magic link email. Codes are valid for 48 hours. Once a user onboards and registers a passkey, the code becomes irrelevant.

---

## Context

- Existing auth: magic link via NextAuth EmailProvider + passkey/TOTP MFA
- Existing invitation model: `OrgInvitation` in `prisma/schema.prisma` (line 1156)
- Admin user management at: `/admin/users` (`src/components/admin/AdminUsersClient.tsx`)
- Login page at: `src/app/(auth)/login/page.tsx`
- Passkey = full trust policy: `src/lib/auth/permissions.ts` (`isMfaRequired()` returns false if `hasWebAuthn`)
- Native `<a>` tags used for navigation (not Next.js `Link`)
- ESLint rule `@next/next/no-html-link-for-pages` is disabled

---

## Requirements

### 1. Database — Invite Code Model

Add to Prisma schema:

```prisma
model InviteCode {
  id        String    @id @default(cuid())
  email     String
  code      String    // 6-digit numeric, cryptographically random
  status    String    @default("pending") // pending, used, expired, revoked
  expiresAt DateTime  // 48 hours from creation
  usedAt    DateTime?
  issuedBy  String    // admin user ID who generated it
  userId    String?   // linked user ID (if user already exists)
  createdAt DateTime  @default(now())

  @@unique([email, status]) // one active code per email
  @@index([code])
  @@index([email])
  @@index([expiresAt])
}
```

After schema change, run `prisma db push` or create a migration.

### 2. Admin UI — Extend `/admin/users`

#### Onboarding Status Column

Add a new column to the user table showing onboarding status:

| Status | Condition | Badge Color |
|--------|-----------|-------------|
| Active (Passkey) | `hasWebAuthn = true` | Green |
| Active (TOTP) | `totpVerified = true`, no passkey | Blue |
| Active (No MFA) | Logged in at least once, no MFA | Gray |
| Code Issued | Active `InviteCode` exists with `status=pending` | Amber |
| Invited | `invitedAt` set but never logged in (`loginCount=0`) | Yellow |
| Not Invited | No invitation, never logged in | Red/Gray |

Query: join `User` with `InviteCode` (where `status='pending'`) and check `webauthnCredentials` count, `totpVerified`, `loginCount`, `invitedAt`.

#### Admin Actions

Add to each user row (in the Actions column):

- **Issue Code** button — generates a 6-digit code for the user's email
  - Opens a dialog showing the code in large text for the admin to share
  - Code format: `XXX-XXX` (e.g., `482-917`) for readability
  - Shows expiry: "Valid for 48 hours (expires {date/time})"
  - Copy button to copy code to clipboard
- **Reset Code** button — visible when a pending code exists
  - Revokes old code, generates new one
  - Shows new code in dialog
- **Revoke Code** button — visible when a pending code exists
  - Deletes/revokes the code
  - Toast: "Invite code revoked"

### 3. Login Flow — Code Entry

Add a third option to the login page (`src/app/(auth)/login/page.tsx`):

```
[Sign in with passkey]        ← primary
── or continue with email ──
[Email field] [Continue]      ← magic link
── or ──
[Sign in with invite code]    ← new option
```

When "Sign in with invite code" is clicked:
- Show email input + 6-digit code input
- Code input: 6 separate digit boxes (OTP-style) or a single input with mask `XXX-XXX`
- Submit button: "Verify Code"
- On success: create session, redirect to portal (→ MFA setup if required)
- On failure: show error "Invalid or expired code. Contact your administrator."

### 4. Auth API — Code Verification

#### `POST /api/auth/invite-code/verify`

```typescript
// Request body
{ email: string, code: string }

// Success: creates user (if not exists), creates session, sets cookie
// Returns: { data: { success: true, redirectUrl: "/assessments" } }

// Failure cases:
// - Code not found or wrong email → 401
// - Code expired → 401 "Code expired. Contact your administrator."
// - Code already used → 401 "Code already used."
// - Code revoked → 401 "Code revoked. Contact your administrator."
```

Flow:
1. Look up `InviteCode` by email + code where `status = 'pending'`
2. Check `expiresAt > now()`
3. If user doesn't exist: create user with role from admin assignment (or default `consultant`)
4. Mark code as `used`, set `usedAt`
5. Create session (`createSession()` from `src/lib/auth/session.ts`)
6. Set `abeam-session` cookie
7. Return redirect URL

### 5. Admin API — Code Management

#### `POST /api/admin/users/[userId]/invite-code`

Generate a new 6-digit code for the user.

```typescript
// Requires admin auth (requireAdmin())
// Generates cryptographically random 6-digit code
// Revokes any existing pending code for the same email
// Creates InviteCode record with 48-hour expiry
// Returns: { data: { code: "482917", expiresAt: "2026-03-19T..." } }
```

Code generation: `crypto.randomInt(100000, 999999).toString()`

#### `DELETE /api/admin/users/[userId]/invite-code`

Revoke the user's pending invite code.

```typescript
// Requires admin auth
// Updates InviteCode status to 'revoked' where email matches and status = 'pending'
// Returns: { data: { success: true } }
```

### 6. Code Expiry

- Codes expire after 48 hours (checked at verification time)
- No background job needed — just check `expiresAt` during verification
- Optionally: update `status` to `expired` during verification if expired (for reporting)

---

## Security Considerations

- Codes are 6 digits (1M combinations) — acceptable for time-limited, admin-issued codes
- Rate limit code verification: max 5 attempts per email per 15 minutes
- Codes are single-use — cannot be reused after successful login
- Admin must be `platform_admin` to issue/manage codes
- Code verification does NOT bypass MFA setup — new users still go through passkey/TOTP enrollment after first login

---

## Files to Create/Modify

### New Files
- `prisma/schema.prisma` — add `InviteCode` model
- `src/app/api/admin/users/[userId]/invite-code/route.ts` — generate & revoke codes
- `src/app/api/auth/invite-code/verify/route.ts` — verify code & create session

### Modified Files
- `src/app/(auth)/login/page.tsx` — add "Sign in with invite code" option
- `src/components/admin/AdminUsersClient.tsx` — add onboarding status column + code management actions
- `src/app/(portal)/admin/users/page.tsx` — pass invite code data to client component

### Reference Files (read for patterns)
- `src/lib/auth/session.ts` — session creation pattern
- `src/app/api/auth/bridge/route.ts` — session cookie setting pattern
- `src/app/api/admin/users/[userId]/route.ts` — admin API guard pattern
- `src/components/admin/AdminUsersClient.tsx` — admin table UI pattern

---

## Testing

- Admin generates code → code shown in dialog
- Admin copies code → shares with user
- User enters email + code on login page → logged in
- User enters expired code → clear error message
- User enters wrong code → error, rate limited after 5 attempts
- Admin resets code → old code invalidated, new code works
- Admin revokes code → code no longer works
- User with passkey → code column shows "Active (Passkey)", no code actions needed
- User table shows correct onboarding status for all states

---

## Constraints

- Don't modify the existing magic link flow
- Use native `<a>` tags for navigation (not Next.js `Link`)
- Use existing UI components (Button, Dialog, Input, toast from sonner)
- Follow existing API patterns (admin-guard, error codes, Zod validation)
- Run `pnpm tsc --noEmit` before committing — must pass
- ESLint rule `@next/next/no-html-link-for-pages` is disabled (intentional)
