# Feature Spec: 6-Digit Invite Code + Mandatory Passkey Enrollment

**Status:** Not started
**Priority:** High
**Date:** 2026-03-18

---

## Overview

Two onboarding paths for new users, both ending with mandatory passkey registration:

1. **Default (Magic Link)** — user receives email, clicks link, registers passkey
2. **Invite Code** — admin issues 6-digit code, shares manually, user enters code on login, registers passkey

The invite code path exists for early testers where magic link delivery is unreliable (junk inbox). Both paths require passkey registration before accessing the portal.

---

## Key Rules

- **6-digit code is single-use** — once successfully used, it's consumed
- **48-hour expiry** — fixed, cannot be changed
- **Admin controls**: issue code, reset (regenerate), or delete (reverts user to magic link default)
- **Mandatory passkey**: ALL new users (both paths) must register a passkey immediately after first login, before reaching the dashboard
- **Code is NOT TOTP** — it's a one-time invite code issued by the system, shared manually by admin

---

## User Flows

### Flow A: Magic Link (Default)
```
Admin creates user → User goes to /login → enters email → clicks Continue
→ receives magic link email → clicks link → redirected to /mfa/setup
→ must register passkey → lands on /assessments
```

### Flow B: Invite Code
```
Admin creates user → Admin clicks "Issue Code" → system generates 6-digit code
→ Admin copies code and shares with user (chat, email, in person)
→ User goes to /login → clicks "Sign in with invite code"
→ enters email + 6-digit code → verified → redirected to /mfa/setup
→ must register passkey → lands on /assessments
```

### After Onboarding (Both Paths)
```
User goes to /login → clicks "Sign in with passkey" → fingerprint/face
→ straight into portal (no MFA step needed)
```

---

## Database Changes

### New Model: InviteCode

Add to `prisma/schema.prisma`:

```prisma
model InviteCode {
  id        String    @id @default(cuid())
  email     String
  code      String    // 6-digit numeric
  status    String    @default("pending") // pending, used, expired, revoked
  expiresAt DateTime  // exactly 48 hours from creation
  usedAt    DateTime?
  issuedBy  String    // admin user ID
  createdAt DateTime  @default(now())

  @@index([email, status])
  @@index([code])
  @@index([expiresAt])
}
```

Run `pnpm prisma db push` after adding.

---

## Admin UI Changes (`/admin/users`)

### Add User Dialog — Add "Onboarding Method" Field

In the existing "Add User" dialog (`AdminUsersClient.tsx`), add a toggle:

```
Onboarding Method:
  ○ Magic Link (default) — user receives sign-in email
  ● Invite Code — issue a 6-digit code for the user
```

If "Invite Code" is selected:
- After creating the user, immediately generate a 6-digit code
- Show a dialog with the code in large text: `4 8 2 - 9 1 7`
- Show expiry: "Valid until {date/time} (48 hours)"
- Copy button to clipboard
- Message: "Share this code with the user. They enter it at the login page."

### User Table — Onboarding Status Column

Add between "MFA" and "Last Login" columns:

| Status | Condition | Badge |
|--------|-----------|-------|
| Onboarded | `hasWebAuthn = true` (passkey registered) | Green "Passkey" |
| Code Issued | Active `InviteCode` with `status=pending` | Amber "Code Issued" |
| Pending | Created but no code, no login yet (`loginCount=0`) | Gray "Pending" |
| Active (No Passkey) | Has logged in but no passkey | Yellow "No Passkey" |

### User Row Actions — Code Management

For users with a pending invite code:
- **View Code** — shows the code again in a dialog
- **Reset Code** — revokes old, generates new, shows new code
- **Delete Code** — revokes code, user reverts to magic link only

These buttons only appear when a pending code exists.

---

## Login Page Changes (`/login`)

Add a third option below the existing email form:

```
[Sign in with passkey]           ← primary CTA
─── or continue with email ───
[Email field] [Continue]         ← magic link
─── or ───
[Sign in with invite code]       ← new, text link style
```

When "Sign in with invite code" is clicked, show:
- Email input
- 6-digit code input (single field, placeholder: "000-000")
- "Verify" button

On submit:
- POST `/api/auth/invite-code/verify` with `{ email, code }`
- Success → set session cookie → redirect to `/mfa/setup` (for passkey enrollment)
- Failure → show error: "Invalid or expired code. Contact your administrator."

---

## API Routes

### `POST /api/admin/users/[userId]/invite-code`

Generate a 6-digit invite code.

- Requires `platform_admin` auth
- Generates code: `crypto.randomInt(100000, 999999).toString()`
- Revokes any existing pending code for the user
- Creates `InviteCode` with 48-hour expiry
- Returns: `{ data: { code: "482917", expiresAt: "..." } }`

### `DELETE /api/admin/users/[userId]/invite-code`

Revoke the user's pending code.

- Updates `InviteCode.status` to `"revoked"`
- Returns: `{ data: { success: true } }`

### `POST /api/auth/invite-code/verify`

Verify code and create session.

- Public endpoint (no auth required — user is logging in)
- Rate limit: 5 attempts per email per 15 minutes
- Validates: code exists, matches email, status=pending, not expired
- On success:
  - Mark code as `used`, set `usedAt`
  - Create user if doesn't exist (shouldn't happen since admin creates first)
  - Create session via `createSession()`
  - Set `abeam-session` cookie
  - Return `{ data: { success: true, redirectUrl: "/mfa/setup" } }`
- On failure: return 401 with clear message

---

## Mandatory Passkey Enrollment

### Portal Layout Gate (MODIFY `src/app/(portal)/layout.tsx`)

After existing MFA checks, add:

```typescript
// ALL new users must register a passkey before accessing the portal
if (!user.hasWebAuthn && user.loginCount <= 1) {
  redirect("/mfa/setup");
}
```

This ensures:
- Magic link users → land on `/mfa/setup` → register passkey → portal
- Invite code users → land on `/mfa/setup` → register passkey → portal
- Returning users with passkey → skip entirely

### MFA Setup Page (`/mfa/setup`)

Already shows passkey option (implemented earlier). For first-time users:
- Show passkey as the ONLY option (hide TOTP for first login)
- Or show passkey as "Recommended" with TOTP as fallback
- After passkey registration → redirect to `/assessments`

---

## Security

- 6-digit = 1M combinations, acceptable for 48-hour admin-issued codes
- Rate limit code verification: 5 attempts per email per 15 minutes
- Codes are single-use
- Only `platform_admin` can issue/manage codes
- Code verification does NOT bypass passkey enrollment

---

## Files to Create

- `src/app/api/admin/users/[userId]/invite-code/route.ts` — generate & revoke
- `src/app/api/auth/invite-code/verify/route.ts` — verify code & create session

## Files to Modify

- `prisma/schema.prisma` — add `InviteCode` model
- `src/app/(auth)/login/page.tsx` — add "Sign in with invite code" option
- `src/components/admin/AdminUsersClient.tsx` — onboarding status column, code actions, onboarding method in add dialog
- `src/app/(portal)/admin/users/page.tsx` — pass invite code data to client
- `src/app/(portal)/layout.tsx` — mandatory passkey gate for new users

## Reference Files

- `src/lib/auth/session.ts` — `createSession()`, cookie pattern
- `src/app/api/auth/bridge/route.ts` — session cookie setting
- `src/app/api/admin/users/[userId]/route.ts` — admin guard pattern
- `src/app/api/admin/users/route.ts` — user creation pattern
- `src/app/(auth)/mfa/setup/page.tsx` — passkey enrollment page

---

## Testing

1. Admin creates user with "Invite Code" → code shown in dialog
2. Admin copies code → shares with tester
3. Tester goes to `/login` → "Sign in with invite code" → enters email + code → logged in
4. Tester forced to register passkey at `/mfa/setup` → registers → lands on `/assessments`
5. Tester logs out → logs in with passkey → straight to portal
6. Admin creates user with "Magic Link" (default) → user gets email → clicks link → forced passkey → portal
7. Admin resets code → old code fails, new code works
8. Admin deletes code → user must use magic link instead
9. Expired code (48h) → clear error: "Code expired. Contact your administrator."
10. Wrong code 5 times → rate limited
11. User table shows correct onboarding status for all states

---

## Prompt for Claude Code

```
Read specs/INVITE-CODE-FEATURE.md and implement the full feature.
After implementation, run pnpm tsc --noEmit to verify no type errors.
Push to main when complete.
```
