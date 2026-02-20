# Handoff Document — Bound Fit Portal

## Current State

**Phase 2: Authentication & Assessment Setup — COMPLETE**

### Completed Phases

#### Phase 0: Project Scaffolding (COMPLETE)
#### Phase 1: Data Ingestion Pipeline (COMPLETE)
#### Phase 2: Authentication & Assessment Setup (COMPLETE)

### Phase 2 Implementation Details

**Auth Library** (`src/lib/auth/`):
- `auth-options.ts`: NextAuth v4 with EmailProvider (magic link), custom JWT callbacks, PrismaAdapter
- `session.ts`: Custom session management — token generation, creation (with concurrent session revocation), validation, MFA verification, cookie-based session retrieval
- `mfa.ts`: TOTP utilities — AES-256-GCM encryption/decryption of secrets, secret generation with otpauth URI, code verification with configurable window
- `permissions.ts`: Area-locked permission checks — `canEditStepResponse`, `canEditScopeSelection`, `canManageStakeholders`, `canTransitionStatus`, `isMfaRequired`

**API Routes**:
- `api/auth/[...nextauth]`: NextAuth handler (GET/POST)
- `api/auth/mfa/setup`: GET (generate TOTP secret + QR URI), POST (verify code + enable MFA)
- `api/auth/mfa/verify`: POST (verify TOTP code against stored encrypted secret, rate-limited via MfaChallenge)
- `api/auth/mfa/status`: GET (current MFA enrollment status)
- `api/assessments`: GET (list by org), POST (create with auto-org creation)
- `api/assessments/[id]`: GET (details), PATCH (status transitions with permission checks), DELETE (soft-delete)
- `api/assessments/[id]/stakeholders`: GET (list), POST (add with user auto-creation + decision logging)
- `api/dashboard`: GET (assessments, activity feed, stakeholder progress)

**Pages**:
- `(auth)/login`: Magic link login with email input, sent confirmation, Suspense boundary for useSearchParams
- `(auth)/mfa/setup`: TOTP enrollment with QR code + manual secret + 6-digit verification
- `(auth)/mfa/verify`: TOTP verification with countdown timer + rate limiting
- `(portal)/layout`: Server-side auth + MFA enforcement, redirects to /login, /mfa/setup, or /mfa/verify as needed
- `(portal)/assessments`: Assessment list with status badges, scope/step/stakeholder counts, create button (consultant/admin only)
- `(portal)/assessments/new`: Company profile form with Zod validation
- `(portal)/dashboard`: Assessment progress cards with progress bars, team avatars, recent activity feed

**Components**:
- `shared/`: BoundLogo, StatusBadge, EmptyState, ProgressBar, LoadingSkeleton, ErrorBoundary, Providers
- `layout/`: PortalNav (role-based nav), PageHeader
- `mfa/`: TotpSetupForm, TotpVerifyForm, MfaStatusBadge
- `assessment/`: CompanyProfileForm, StakeholderManager

**Tests**: 21 tests (mfa: 5, permissions: 15, setup: 1)

### Quality Gate Results
1. `pnpm typecheck:strict` — 0 errors
2. `pnpm lint:strict` — 0 errors, 0 warnings
3. `pnpm build` — success (15 pages)
4. `pnpm test --run` — 21 tests passed

### Technical Notes
- nodemailer added as dependency (required by NextAuth EmailProvider)
- AES-256-GCM encryption key must be 64 hex chars (32 bytes)
- exactOptionalPropertyTypes: use `?? null` for Prisma, `?? Prisma.JsonNull` for Json fields
- useSearchParams() requires Suspense boundary in Next.js 16

### Next Phase
**Phase 3: Scope Selection** — Scope item catalog, industry pre-selection, scope selection UI, progress tracking

### Known Issues
None.
