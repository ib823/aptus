# API Contract -- Every Endpoint with Request/Response Schemas

All endpoints are served from `/api/` via Next.js App Router route handlers.
All request bodies are validated with Zod. All responses are typed with TypeScript interfaces.
All timestamps are ISO 8601 strings. All IDs are CUID strings unless otherwise noted.

---

## Conventions

### Authentication

Every request (except public endpoints) must include a session cookie (`bound-session-token`, httpOnly, secure, sameSite=lax).
The middleware extracts the session from the `Session` table and attaches `req.user` with `{ id, email, name, role, organizationId, mfaVerified }`.

For external users (process_owner, it_lead, executive), `session.mfaVerified` must be `true` — otherwise a `403 MFA_REQUIRED` error is returned on all protected endpoints.

| Auth Level | Description |
|------------|-------------|
| `public` | No authentication required |
| `authenticated` | Any authenticated user with valid session (MFA not yet required) |
| `mfa_verified` | Authenticated + MFA verified (required for all assessment data access) |
| `consultant` | Consultant or admin role (MFA optional) |
| `admin` | Admin role only |

### Role Hierarchy

| Role | Type | MFA Required | Capabilities |
|------|------|-------------|-------------|
| `process_owner` | External | Yes (TOTP mandatory) | View all, edit own assigned areas only |
| `it_lead` | External | Yes (TOTP mandatory) | View all, add technical notes only (no fit status changes) |
| `executive` | External | Yes (TOTP mandatory) | Dashboard view, download reports, sign off |
| `consultant` | Internal | Optional | View all, edit all (override audit-logged), manage Intelligence Layer |
| `admin` | Internal | Optional | Full access, manage users/orgs, ingest data |

### Authorization Scoping

- External users (process_owner, it_lead, executive) can only access assessments belonging to their `organizationId`.
- Consultant users can access all assessments across all organizations.
- Admin users have full access to all resources including the Intelligence Layer.

### Area-Locked Editing

For endpoints that modify assessment data (step responses, scope selections):
- **Process owners**: The middleware checks `AssessmentStakeholder.assignedAreas` against the target entity's `ScopeItem.functionalArea`. If the area is not in their list, return `403 AREA_LOCKED`.
- **IT leads**: Can add `clientNote` to any step but cannot change `fitStatus`. Attempting to change fitStatus returns `403 AREA_LOCKED`.
- **Consultants**: Can edit any area. When editing outside their normal scope, the `reason` field is required in the request body. A `PERMISSION_OVERRIDE` entry is created in the Decision Log.
- **Executives**: Read-only access to all data. Any mutation attempt returns `403 FORBIDDEN`.

### Pagination (Cursor-Based)

All list endpoints that may return large result sets use cursor-based pagination.

**Request parameters** (query string):

```typescript
interface PaginationParams {
  cursor?: string;   // opaque cursor from previous response
  limit?: number;    // default 50, max 200
}
```

**Response envelope:**

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;  // null when no more pages
    hasMore: boolean;
    totalCount: number;         // total matching records
  };
}
```

### Error Response Format

All errors return a consistent JSON body:

```typescript
interface ErrorResponse {
  error: {
    code: string;        // machine-readable: "VALIDATION_ERROR", "NOT_FOUND", etc.
    message: string;     // human-readable description
    details?: unknown;   // optional: Zod validation errors, field-level errors
  };
}
```

### Standard Error Codes

| HTTP Status | Code | When |
|-------------|------|------|
| 400 | `VALIDATION_ERROR` | Request body or query params fail Zod validation |
| 400 | `INVALID_STATE_TRANSITION` | Assessment status change violates state machine |
| 401 | `UNAUTHORIZED` | No valid session cookie |
| 403 | `FORBIDDEN` | User lacks required role or org access |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | Duplicate unique constraint (e.g., stakeholder email) |
| 403 | `MFA_REQUIRED` | Session valid but MFA not yet verified |
| 403 | `AREA_LOCKED` | User's assigned areas do not include the target entity's area |
| 429 | `RATE_LIMITED` | Too many requests (60/min per user) |
| 500 | `INTERNAL_ERROR` | Unhandled server error |

---

## 1. Auth Endpoints

### POST /api/auth/login

Send a magic link to the specified email address.

| Property | Value |
|----------|-------|
| Auth | `public` |
| Rate limit | 5 requests per email per 10 minutes |

**Request Body (Zod):**

```typescript
const LoginSchema = z.object({
  email: z.string().email(),
});
```

**Response (200):**

```typescript
interface LoginResponse {
  success: true;
  message: "Magic link sent. Check your email.";
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid email format |
| 429 | `RATE_LIMITED` | Too many login attempts for this email |

---

### POST /api/auth/verify

Verify the magic link token and create a session.

| Property | Value |
|----------|-------|
| Auth | `public` |

**Request Body (Zod):**

```typescript
const VerifySchema = z.object({
  token: z.string().min(1),
});
```

**Response (200):**

```typescript
interface VerifyResponse {
  success: true;
  user: {
    id: string;
    email: string;
    name: string;
    role: "process_owner" | "it_lead" | "executive" | "consultant" | "admin";
    organizationId: string | null;
    mfaEnabled: boolean;
    mfaVerified: false;        // always false at this point — MFA check happens next
  };
  requiresMfa: boolean;        // true if user.role is external OR user.mfaEnabled is true
  redirectTo: string;          // "/mfa/setup" if !mfaEnabled, "/mfa/verify" if mfaEnabled, "/assessments" if no MFA needed
}
```

**Side effects:**
- Creates a `Session` record with `mfaVerified = false`.
- Sets `bound-session-token` cookie (httpOnly, secure, sameSite=lax).
- If user has an existing active session, revokes it (`isRevoked = true`, `revokedReason = "concurrent_login"`).

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Missing or empty token |
| 401 | `UNAUTHORIZED` | Token expired or invalid |

---

### GET /api/auth/session

Return the current user session.

| Property | Value |
|----------|-------|
| Auth | `public` (returns null user if no session) |

**Response (200):**

```typescript
interface SessionResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: "process_owner" | "it_lead" | "executive" | "consultant" | "admin";
    organizationId: string | null;
    mfaEnabled: boolean;
    mfaVerified: boolean;
  } | null;
}
```

---

### POST /api/auth/logout

Destroy the current session.

| Property | Value |
|----------|-------|
| Auth | `client` |

**Response (200):**

```typescript
interface LogoutResponse {
  success: true;
}
```

**Side effect:** Clears session cookie. Sets `Session.isRevoked = true`, `revokedReason = "user_logout"`.

---

### POST /api/auth/mfa/setup

Initiate TOTP MFA enrollment. Generates a TOTP secret and returns the provisioning URI for QR code display.

| Property | Value |
|----------|-------|
| Auth | `authenticated` (session valid, MFA not yet required) |

**Response (200):**

```typescript
interface MfaSetupResponse {
  secret: string;              // base32-encoded TOTP secret (for manual entry)
  otpauthUri: string;          // otpauth://totp/Bound:user@email?secret=...&issuer=Bound
  qrCodeDataUrl: string;       // data:image/png;base64,... — ready to display as <img>
}
```

**Side effects:**
- Generates a random TOTP secret.
- Encrypts the secret with AES-256-GCM and stores in `User.totpSecret`.
- Does NOT enable MFA yet — user must verify a code first via POST /api/auth/mfa/verify.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |
| 409 | `CONFLICT` | TOTP already verified (`totpVerified = true`). Use DELETE /api/auth/mfa to reset. |

---

### POST /api/auth/mfa/verify

Verify a TOTP code. Used both during initial enrollment (to confirm setup) and during subsequent logins.

| Property | Value |
|----------|-------|
| Auth | `authenticated` |

**Request Body (Zod):**

```typescript
const MfaVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),   // 6-digit TOTP code
});
```

**Response (200):**

```typescript
interface MfaVerifyResponse {
  success: true;
  mfaVerified: true;
  redirectTo: string;          // role-based redirect: "/assessments", "/dashboard", "/admin", etc.
}
```

**Side effects:**
- If this is the first verification (`totpVerified = false`):
  - Sets `User.totpVerified = true`, `User.totpVerifiedAt = now()`, `User.mfaEnabled = true`, `User.mfaMethod = "totp"`.
  - Creates DecisionLogEntry with action `"MFA_ENROLLED"`.
- Sets `Session.mfaVerified = true`, `Session.mfaVerifiedAt = now()`.
- Resets `MfaChallenge.attempts` to 0 on success.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Code is not 6 digits |
| 401 | `UNAUTHORIZED` | No valid session |
| 401 | `UNAUTHORIZED` | Invalid TOTP code (wrong or expired window) |
| 429 | `RATE_LIMITED` | Too many failed attempts (5 per challenge, 15 min lockout) |

---

### GET /api/auth/mfa/status

Check the current user's MFA enrollment status.

| Property | Value |
|----------|-------|
| Auth | `authenticated` |

**Response (200):**

```typescript
interface MfaStatusResponse {
  mfaEnabled: boolean;
  mfaMethod: "none" | "totp" | "webauthn";
  totpVerified: boolean;
  totpVerifiedAt: string | null;
  webauthnCredentialCount: number;
  sessionMfaVerified: boolean;
  requiresMfa: boolean;        // true for external roles or if mfaEnabled
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No valid session |

---

## 2. Assessment Endpoints

### GET /api/assessments

List all assessments accessible to the current user.

| Property | Value |
|----------|-------|
| Auth | `client` |
| Pagination | Cursor-based |

**Query Parameters (Zod):**

```typescript
const ListAssessmentsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  status: z.enum(["draft", "in_progress", "completed", "reviewed", "signed_off"]).optional(),
  search: z.string().optional(),  // searches companyName
});
```

**Response (200):**

```typescript
interface AssessmentListItem {
  id: string;
  companyName: string;
  industry: string;
  country: string;
  companySize: string;
  status: "draft" | "in_progress" | "completed" | "reviewed" | "signed_off";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  _counts: {
    stakeholders: number;
    scopeSelections: number;
    stepResponses: number;
    gapResolutions: number;
  };
}

type Response = PaginatedResponse<AssessmentListItem>;
```

**Scoping:**
- `client` role: only assessments where `createdBy` belongs to the same `organizationId`
- `consultant` / `admin`: all assessments

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |

---

### POST /api/assessments

Create a new assessment.

| Property | Value |
|----------|-------|
| Auth | `client` |

**Request Body (Zod):**

```typescript
const CreateAssessmentSchema = z.object({
  companyName: z.string().min(1).max(255),
  industry: z.string().min(1),                           // must match IndustryProfile.code
  country: z.string().length(2),                         // ISO 3166-1 alpha-2
  operatingCountries: z.array(z.string().length(2)).min(1),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]),
  revenueBand: z.string().optional(),
  currentErp: z.enum(["sap_ecc", "oracle", "none", "other"]).optional(),
});
```

**Response (201):**

```typescript
interface CreateAssessmentResponse {
  id: string;
  companyName: string;
  industry: string;
  country: string;
  operatingCountries: string[];
  companySize: string;
  revenueBand: string | null;
  currentErp: string | null;
  sapVersion: string;
  status: "draft";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"ASSESSMENT_CREATED"`.
- Auto-adds the creating user as a stakeholder.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 401 | `UNAUTHORIZED` | No session |

---

### GET /api/assessments/[id]

Get a single assessment with full details.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

```typescript
interface AssessmentDetail {
  id: string;
  companyName: string;
  industry: string;
  country: string;
  operatingCountries: string[];
  companySize: string;
  revenueBand: string | null;
  currentErp: string | null;
  sapVersion: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stakeholders: AssessmentStakeholderItem[];
  progress: {
    scopeItemsTotal: number;
    scopeItemsResponded: number;
    scopeItemsSelected: number;
    stepsTotal: number;            // total steps across selected scope items
    stepsResponded: number;
    gapsIdentified: number;
    gapsResolved: number;
  };
}

interface AssessmentStakeholderItem {
  id: string;
  name: string;
  email: string;
  role: string;
  assignedAreas: string[];
  lastActiveAt: string | null;
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User's org does not own this assessment |
| 404 | `NOT_FOUND` | Assessment ID does not exist |

---

### PATCH /api/assessments/[id]

Update assessment metadata or advance status.

| Property | Value |
|----------|-------|
| Auth | `client` (metadata), `consultant` (status to reviewed), `admin` (any) |

**Request Body (Zod):**

```typescript
const UpdateAssessmentSchema = z.object({
  companyName: z.string().min(1).max(255).optional(),
  industry: z.string().min(1).optional(),
  country: z.string().length(2).optional(),
  operatingCountries: z.array(z.string().length(2)).min(1).optional(),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]).optional(),
  revenueBand: z.string().optional(),
  currentErp: z.enum(["sap_ecc", "oracle", "none", "other"]).optional(),
  status: z.enum(["draft", "in_progress", "completed", "reviewed", "signed_off"]).optional(),
});
```

**Status transition rules (enforced server-side):**

```
draft -> in_progress           (any authenticated user on this assessment)
in_progress -> completed       (any authenticated user on this assessment)
completed -> reviewed          (consultant or admin only)
reviewed -> signed_off         (admin only, requires sign-off record)
```

No backward transitions allowed. Attempting an invalid transition returns 400 `INVALID_STATE_TRANSITION`.

**Response (200):**

```typescript
// Returns the full AssessmentDetail (same as GET /api/assessments/[id])
```

**Side effects:**
- Creates DecisionLogEntry for every changed field.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 400 | `INVALID_STATE_TRANSITION` | Status change violates state machine |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Insufficient role for requested status change |
| 404 | `NOT_FOUND` | Assessment ID does not exist |

---

### DELETE /api/assessments/[id]

Soft-delete an assessment. Sets a `deletedAt` timestamp. Does not remove data.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):**

```typescript
interface DeleteAssessmentResponse {
  success: true;
  id: string;
  deletedAt: string;
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"ASSESSMENT_DELETED"`.
- Assessment no longer appears in list queries.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Assessment ID does not exist |

---

## 3. Stakeholder Endpoints

### GET /api/assessments/[id]/stakeholders

List all stakeholders for an assessment.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

```typescript
interface StakeholderListResponse {
  data: AssessmentStakeholderItem[];
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |

---

### POST /api/assessments/[id]/stakeholders

Add a stakeholder to an assessment.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Request Body (Zod):**

```typescript
const CreateStakeholderSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  role: z.enum(["process_owner", "it_lead", "executive", "consultant"]),
  assignedAreas: z.array(z.string()).default([]),
});
```

**Response (201):**

```typescript
interface CreateStakeholderResponse {
  id: string;
  assessmentId: string;
  name: string;
  email: string;
  role: string;
  assignedAreas: string[];
  lastActiveAt: null;
  createdAt: string;
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"STAKEHOLDER_ADDED"`.
- Sends magic link invitation email to the stakeholder.
- If the email does not exist in the User table, creates a new User record with role `"client"` and the assessment's `organizationId`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |
| 409 | `CONFLICT` | Stakeholder with this email already exists on this assessment |

---

### DELETE /api/assessments/[id]/stakeholders/[stakeholderId]

Remove a stakeholder from an assessment.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

```typescript
interface DeleteStakeholderResponse {
  success: true;
  id: string;
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"STAKEHOLDER_REMOVED"`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment or stakeholder not found |

---

## 4. Scope Selection Endpoints

### GET /api/assessments/[id]/scope

Get all scope selections for an assessment.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Query Parameters (Zod):**

```typescript
const ScopeListQuery = z.object({
  area: z.string().optional(),          // filter by functionalArea
  relevance: z.enum(["YES", "NO", "MAYBE"]).optional(),
  selected: z.coerce.boolean().optional(),
});
```

**Response (200):**

```typescript
interface ScopeSelectionListResponse {
  data: ScopeSelectionItem[];
  summary: {
    totalScopeItems: number;        // always 550
    responded: number;
    selectedCount: number;
    totalStepsInScope: number;      // sum of totalSteps for selected scope items
  };
}

interface ScopeSelectionItem {
  scopeItemId: string;
  scopeItemName: string;
  scopeItemNameClean: string;
  functionalArea: string;
  subArea: string;
  totalSteps: number;
  configCount: number;              // number of ConfigActivity records for this scope item
  selection: {
    id: string | null;              // null if not yet responded
    selected: boolean | null;
    relevance: "YES" | "NO" | "MAYBE" | null;
    currentState: "MANUAL" | "SYSTEM" | "OUTSOURCED" | "NA" | null;
    notes: string | null;
    respondent: string | null;
    respondedAt: string | null;
  };
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |

---

### PUT /api/assessments/[id]/scope/[scopeItemId]

Create or update a scope selection for a specific scope item.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Request Body (Zod):**

```typescript
const UpsertScopeSelectionSchema = z.object({
  selected: z.boolean(),
  relevance: z.enum(["YES", "NO", "MAYBE"]),
  currentState: z.enum(["MANUAL", "SYSTEM", "OUTSOURCED", "NA"]).optional(),
  notes: z.string().max(2000).optional(),
});
```

**Response (200):**

```typescript
interface UpsertScopeSelectionResponse {
  id: string;
  assessmentId: string;
  scopeItemId: string;
  selected: boolean;
  relevance: string;
  currentState: string | null;
  notes: string | null;
  respondent: string;
  respondedAt: string;
  createdAt: string;
  updatedAt: string;
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"SCOPE_INCLUDED"` or `"SCOPE_EXCLUDED"`.
- If the assessment status is `"draft"`, automatically transitions it to `"in_progress"`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment or scope item not found |

---

### POST /api/assessments/[id]/scope/bulk

Bulk update scope selections (e.g., applying an industry profile).

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Request Body (Zod):**

```typescript
const BulkScopeSchema = z.object({
  selections: z.array(z.object({
    scopeItemId: z.string(),
    selected: z.boolean(),
    relevance: z.enum(["YES", "NO", "MAYBE"]),
    currentState: z.enum(["MANUAL", "SYSTEM", "OUTSOURCED", "NA"]).optional(),
    notes: z.string().max(2000).optional(),
  })).min(1).max(550),
});
```

**Response (200):**

```typescript
interface BulkScopeResponse {
  updated: number;
  created: number;
  total: number;
}
```

**Side effects:**
- Creates one DecisionLogEntry per scope item changed with action `"SCOPE_BULK_UPDATE"`.
- If the assessment status is `"draft"`, automatically transitions it to `"in_progress"`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 400 | `VALIDATION_ERROR` | Any scopeItemId in the array does not exist |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |

---

## 5. SAP Catalog Endpoints (Read-Only)

These endpoints serve the ingested SAP best practices data. They are read-only and available to all authenticated users.

### GET /api/catalog/scope-items

List all scope items with optional filtering.

| Property | Value |
|----------|-------|
| Auth | `client` |
| Pagination | Cursor-based |

**Query Parameters (Zod):**

```typescript
const CatalogScopeItemsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  area: z.string().optional(),            // filter by functionalArea
  subArea: z.string().optional(),         // filter by subArea
  country: z.string().optional(),         // "MY" or "XX"
  search: z.string().optional(),          // full-text search on nameClean
  industry: z.string().optional(),        // filter by IndustryProfile.code (returns only applicable items)
});
```

**Response (200):**

```typescript
interface CatalogScopeItem {
  id: string;                              // e.g., "J60"
  name: string;
  nameClean: string;
  functionalArea: string;
  subArea: string;
  country: string;
  totalSteps: number;
  configCount: number;
  hasSetupGuide: boolean;
  hasTutorialUrl: boolean;
}

type Response = PaginatedResponse<CatalogScopeItem>;
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |

---

### GET /api/catalog/scope-items/[id]

Get a single scope item with full detail.

| Property | Value |
|----------|-------|
| Auth | `client` |

**Response (200):**

```typescript
interface CatalogScopeItemDetail {
  id: string;
  name: string;
  nameClean: string;
  purposeHtml: string;
  overviewHtml: string;
  prerequisitesHtml: string;
  country: string;
  language: string;
  version: string;
  totalSteps: number;
  functionalArea: string;
  subArea: string;
  tutorialUrl: string | null;
  hasSetupGuide: boolean;
  configCount: number;
  processFlows: {
    name: string;
    stepCount: number;
  }[];
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 404 | `NOT_FOUND` | Scope item ID does not exist |

---

### GET /api/catalog/scope-items/[id]/steps

Get paginated process steps for a scope item.

| Property | Value |
|----------|-------|
| Auth | `client` |
| Pagination | Cursor-based |

**Query Parameters (Zod):**

```typescript
const CatalogStepsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  stepType: z.enum([
    "LOGON", "ACCESS_APP", "INFORMATION", "DATA_ENTRY",
    "ACTION", "VERIFICATION", "NAVIGATION", "PROCESS_STEP"
  ]).optional(),
  processFlow: z.string().optional(),     // filter by processFlowGroup
  search: z.string().optional(),          // full-text search on actionTitle
});
```

**Response (200):**

```typescript
interface CatalogProcessStep {
  id: string;
  sequence: number;
  actionTitle: string;
  actionInstructionsHtml: string;
  actionExpectedResult: string | null;
  stepType: string;
  processFlowGroup: string | null;
  solutionProcessName: string | null;
  solutionProcessFlowName: string | null;
  activityTitle: string | null;
  activityTargetName: string | null;
  activityTargetUrl: string | null;
}

type Response = PaginatedResponse<CatalogProcessStep>;
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 404 | `NOT_FOUND` | Scope item ID does not exist |

---

### GET /api/catalog/scope-items/[id]/configs

Get configuration activities for a scope item.

| Property | Value |
|----------|-------|
| Auth | `client` |

**Query Parameters (Zod):**

```typescript
const CatalogConfigsQuery = z.object({
  category: z.enum(["Mandatory", "Recommended", "Optional"]).optional(),
  selfService: z.coerce.boolean().optional(),
});
```

**Response (200):**

```typescript
interface CatalogConfigActivity {
  id: string;
  configItemName: string;
  configItemId: string;
  activityDescription: string;
  selfService: boolean;
  configApproach: string | null;
  category: string;
  activityId: string;
  applicationArea: string;
  applicationSubarea: string;
  localizationScope: string | null;
  countrySpecific: string | null;
  additionalInfo: string | null;
}

interface CatalogConfigsResponse {
  data: CatalogConfigActivity[];
  summary: {
    mandatory: number;
    recommended: number;
    optional: number;
    total: number;
  };
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 404 | `NOT_FOUND` | Scope item ID does not exist |

---

### GET /api/catalog/config-activities

List all configuration activities with filtering.

| Property | Value |
|----------|-------|
| Auth | `client` |
| Pagination | Cursor-based |

**Query Parameters (Zod):**

```typescript
const AllConfigsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  area: z.string().optional(),
  subArea: z.string().optional(),
  category: z.enum(["Mandatory", "Recommended", "Optional"]).optional(),
  selfService: z.coerce.boolean().optional(),
  scopeItemId: z.string().optional(),
  search: z.string().optional(),          // searches configItemName and activityDescription
});
```

**Response (200):**

```typescript
type Response = PaginatedResponse<CatalogConfigActivity>;
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |

---

### GET /api/catalog/setup-guide/[scopeItemId]

Serve the Setup PDF for a scope item as a binary download.

| Property | Value |
|----------|-------|
| Auth | `client` |

**Response (200):**

- Content-Type: `application/pdf`
- Content-Disposition: `inline; filename="{SCOPE_ID}_Set-Up_EN_{COUNTRY}.pdf"`
- Body: raw PDF bytes from `SetupGuide.pdfBlob`

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 404 | `NOT_FOUND` | Scope item does not exist or has no Setup PDF |

---

## 6. Step Response Endpoints

### GET /api/assessments/[id]/steps

Get all step responses for an assessment, optionally filtered.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |
| Pagination | Cursor-based |

**Query Parameters (Zod):**

```typescript
const StepResponsesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  scopeItemId: z.string().optional(),
  fitStatus: z.enum(["FIT", "CONFIGURE", "GAP", "NA", "PENDING"]).optional(),
  stepType: z.enum([
    "LOGON", "ACCESS_APP", "INFORMATION", "DATA_ENTRY",
    "ACTION", "VERIFICATION", "NAVIGATION", "PROCESS_STEP"
  ]).optional(),
  respondent: z.string().email().optional(),
});
```

**Response (200):**

```typescript
interface StepResponseItem {
  id: string;
  assessmentId: string;
  processStepId: string;
  fitStatus: "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING";
  clientNote: string | null;
  currentProcess: string | null;
  respondent: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  processStep: {
    id: string;
    scopeItemId: string;
    sequence: number;
    actionTitle: string;
    stepType: string;
    processFlowGroup: string | null;
  };
}

type Response = PaginatedResponse<StepResponseItem>;
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |

---

### PUT /api/assessments/[id]/steps/[stepId]

Create or update a step response.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` (scoped to org) |
| Permissions | Area-locked: process_owner must have target step's functionalArea in assignedAreas. IT lead can only modify clientNote, not fitStatus. Executive: 403 FORBIDDEN. Consultant: full access (override logged if outside normal scope). |

**URL parameter:** `stepId` is the `ProcessStep.id` (CUID).

**Request Body (Zod):**

```typescript
const UpsertStepResponseSchema = z.object({
  fitStatus: z.enum(["FIT", "CONFIGURE", "GAP", "NA", "PENDING"]),
  clientNote: z.string().max(5000).optional(),
  currentProcess: z.string().max(5000).optional(),
}).refine(
  (data) => data.fitStatus !== "GAP" || (data.clientNote && data.clientNote.length >= 10),
  { message: "Gap note is required (min 10 characters) when status is GAP", path: ["clientNote"] }
);
```

**Response (200):**

```typescript
interface UpsertStepResponseResponse {
  id: string;
  assessmentId: string;
  processStepId: string;
  fitStatus: string;
  clientNote: string | null;
  currentProcess: string | null;
  respondent: string;
  respondedAt: string;
  createdAt: string;
  updatedAt: string;
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"MARKED_FIT"`, `"MARKED_GAP"`, `"MARKED_CONFIGURE"`, or `"MARKED_NA"`.
- If `fitStatus` changed from a previous value, the old value is recorded in `DecisionLogEntry.oldValue`.
- If `fitStatus === "GAP"`, a corresponding `GapResolution` record is auto-created with `resolutionType: "PENDING"` (if one does not already exist).

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation (including missing gap note) |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment or process step not found |

---

### POST /api/assessments/[id]/steps/bulk

Bulk mark steps as FIT (e.g., "mark remaining as FIT").

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Request Body (Zod):**

```typescript
const BulkStepSchema = z.object({
  scopeItemId: z.string(),
  fitStatus: z.enum(["FIT", "NA"]),           // only FIT or NA allowed for bulk
  stepIds: z.array(z.string()).min(1).max(5000).optional(),  // if omitted, applies to ALL un-responded steps for the scope item
  excludeStepTypes: z.array(z.enum([
    "LOGON", "ACCESS_APP", "INFORMATION", "DATA_ENTRY",
    "ACTION", "VERIFICATION", "NAVIGATION", "PROCESS_STEP"
  ])).optional(),
});
```

**Response (200):**

```typescript
interface BulkStepResponse {
  updated: number;                            // steps that already had a response and were changed
  created: number;                            // steps that had no response and were created
  skipped: number;                            // steps excluded by filter or already matching status
  total: number;
}
```

**Side effects:**
- Creates one DecisionLogEntry per affected step with action `"BULK_MARKED_FIT"` or `"BULK_MARKED_NA"`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment or scope item not found |

---

## 7. Gap Resolution Endpoints

### GET /api/assessments/[id]/gaps

Get all gaps for an assessment.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Query Parameters (Zod):**

```typescript
const GapsQuery = z.object({
  scopeItemId: z.string().optional(),
  resolutionType: z.enum([
    "FIT", "CONFIGURE", "KEY_USER_EXT", "BTP_EXT", "ISV",
    "CUSTOM_ABAP", "ADAPT_PROCESS", "OUT_OF_SCOPE", "PENDING"
  ]).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  clientApproved: z.coerce.boolean().optional(),
});
```

**Response (200):**

```typescript
interface GapResolutionItem {
  id: string;
  assessmentId: string;
  processStepId: string;
  scopeItemId: string;
  gapDescription: string;
  resolutionType: string;
  resolutionDescription: string;
  effortDays: number | null;
  costEstimate: { onetime: number; recurring: number } | null;
  riskLevel: string | null;
  upgradeImpact: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  clientApproved: boolean;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
  processStep: {
    id: string;
    actionTitle: string;
    stepType: string;
    scopeItemId: string;
  };
  scopeItem: {
    id: string;
    nameClean: string;
    functionalArea: string;
  };
}

interface GapsResponse {
  data: GapResolutionItem[];
  summary: {
    totalGaps: number;
    resolved: number;                      // resolutionType !== "PENDING"
    pending: number;
    byResolutionType: Record<string, number>;
    totalEffortDays: number;
    totalOnetimeCost: number;
    totalRecurringCost: number;
  };
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |

---

### PUT /api/assessments/[id]/gaps/[gapId]

Create or update a gap resolution.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Request Body (Zod):**

```typescript
const UpsertGapResolutionSchema = z.object({
  gapDescription: z.string().min(10).max(5000),
  resolutionType: z.enum([
    "FIT", "CONFIGURE", "KEY_USER_EXT", "BTP_EXT", "ISV",
    "CUSTOM_ABAP", "ADAPT_PROCESS", "OUT_OF_SCOPE"
  ]),
  resolutionDescription: z.string().min(10).max(5000),
  effortDays: z.number().min(0).optional(),
  costEstimate: z.object({
    onetime: z.number().min(0),
    recurring: z.number().min(0),
  }).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  upgradeImpact: z.string().max(2000).optional(),
  rationale: z.string().min(20).max(5000),
  clientApproved: z.boolean().optional(),
});
```

**Response (200):**

```typescript
interface UpsertGapResolutionResponse {
  id: string;
  assessmentId: string;
  processStepId: string;
  scopeItemId: string;
  gapDescription: string;
  resolutionType: string;
  resolutionDescription: string;
  effortDays: number | null;
  costEstimate: { onetime: number; recurring: number } | null;
  riskLevel: string | null;
  upgradeImpact: string | null;
  decidedBy: string;
  decidedAt: string;
  clientApproved: boolean;
  rationale: string;
  createdAt: string;
  updatedAt: string;
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"RESOLUTION_SELECTED"` or `"RESOLUTION_CHANGED"`.
- If `resolutionType` changed from a previous value, the old resolution is recorded in `DecisionLogEntry.oldValue`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment or gap not found |

---

## 8. Report Endpoints

All report endpoints require the assessment to be in status `"completed"`, `"reviewed"`, or `"signed_off"` (except audit trail, which is available at any status).

### GET /api/assessments/[id]/report/executive-summary

Generate and serve the executive summary as PDF.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="{companyName}_Executive_Summary.pdf"`
- Body: generated PDF containing:
  - Company profile
  - Scope summary (selected/total scope items, step counts)
  - Fit percentage (FIT + CONFIGURE steps / total steps)
  - Gap count by resolution type
  - Total estimated effort
  - Key decisions summary
  - Bound branding

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Assessment is in `"draft"` or `"in_progress"` status |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |

---

### GET /api/assessments/[id]/report/scope-catalog

Generate the scope catalog as XLSX.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{companyName}_Scope_Catalog.xlsx"`
- Body: XLSX with columns:
  - Scope Item ID, Name, Functional Area, Sub Area, Selected (Yes/No), Relevance, Current State, Notes, Total Steps, Config Count

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Assessment is in `"draft"` or `"in_progress"` status |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Assessment not found |

---

### GET /api/assessments/[id]/report/step-detail

Generate the process step detail report as XLSX.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{companyName}_Step_Detail.xlsx"`
- Body: XLSX with columns:
  - Scope Item ID, Scope Item Name, Process Flow, Step Sequence, Action Title, Step Type, Fit Status, Client Note, Current Process, Respondent, Responded At

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Assessment is in `"draft"` or `"in_progress"` status |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Assessment not found |

---

### GET /api/assessments/[id]/report/gap-register

Generate the gap register as XLSX.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{companyName}_Gap_Register.xlsx"`
- Body: XLSX with columns:
  - Gap ID, Scope Item, Process Step, Gap Description, Resolution Type, Resolution Description, Effort Days, One-time Cost, Recurring Cost, Risk Level, Upgrade Impact, Decided By, Decided At, Client Approved, Rationale

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Assessment is in `"draft"` or `"in_progress"` status |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Assessment not found |

---

### GET /api/assessments/[id]/report/config-workbook

Generate the configuration workbook as XLSX.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{companyName}_Config_Workbook.xlsx"`
- Body: XLSX with columns:
  - Scope Item ID, Scope Item Name, Application Area, Application Sub Area, Config Item Name, Config Item ID, Activity Description, Self Service, Config Approach, Category, Activity ID, Included (Yes/No)

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Assessment is in `"draft"` or `"in_progress"` status |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Assessment not found |

---

### GET /api/assessments/[id]/report/audit-trail

Generate the decision audit trail as XLSX. Available at ANY assessment status.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |

**Response (200):**

- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{companyName}_Audit_Trail.xlsx"`
- Body: XLSX with columns:
  - Timestamp, Actor, Actor Role, Entity Type, Entity ID, Action, Old Value, New Value, Reason

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Assessment not found |

---

### POST /api/assessments/[id]/report/sign-off

Record a digital sign-off on the assessment.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org, with specific role requirements) |

**Request Body (Zod):**

```typescript
const SignOffSchema = z.object({
  signatoryName: z.string().min(1).max(255),
  signatoryEmail: z.string().email(),
  signatoryRole: z.enum(["client_representative", "bound_consultant", "bound_pm"]),
  acknowledgement: z.literal(true),        // must explicitly acknowledge
});
```

**Response (200):**

```typescript
interface SignOffResponse {
  success: true;
  signedAt: string;
  signatoryName: string;
  signatoryEmail: string;
  signatoryRole: string;
  assessmentStatus: string;               // may transition to "signed_off" if all required signatures collected
}
```

**Side effects:**
- Creates DecisionLogEntry with action `"SIGNED_OFF"`.
- If all three required sign-offs (client_representative, bound_consultant, bound_pm) are collected, the assessment status transitions to `"signed_off"`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails Zod validation |
| 400 | `INVALID_STATE_TRANSITION` | Assessment is not in `"reviewed"` status |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access or role mismatch |
| 404 | `NOT_FOUND` | Assessment not found |
| 409 | `CONFLICT` | This signatory role has already signed off |

---

## 9. Decision Log Endpoints

### GET /api/assessments/[id]/decision-log

Get the paginated, filterable decision log for an assessment.

| Property | Value |
|----------|-------|
| Auth | `client` (scoped to org) |
| Pagination | Cursor-based |

**Query Parameters (Zod):**

```typescript
const DecisionLogQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  entityType: z.enum([
    "scope_item", "process_step", "gap", "config_activity", "assessment"
  ]).optional(),
  action: z.enum([
    "MARKED_FIT", "MARKED_GAP", "MARKED_CONFIGURE", "MARKED_NA",
    "RESOLUTION_SELECTED", "RESOLUTION_CHANGED",
    "SCOPE_INCLUDED", "SCOPE_EXCLUDED", "SCOPE_BULK_UPDATE",
    "NOTE_ADDED", "APPROVED", "SIGNED_OFF",
    "STAKEHOLDER_ADDED", "STAKEHOLDER_REMOVED",
    "ASSESSMENT_CREATED", "ASSESSMENT_DELETED",
    "BULK_MARKED_FIT", "BULK_MARKED_NA"
  ]).optional(),
  actor: z.string().email().optional(),
  actorRole: z.enum(["client", "consultant", "admin"]).optional(),
  since: z.string().datetime().optional(),    // ISO 8601
  until: z.string().datetime().optional(),    // ISO 8601
});
```

**Response (200):**

```typescript
interface DecisionLogItem {
  id: string;
  assessmentId: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValue: unknown | null;
  newValue: unknown;
  actor: string;
  actorRole: string;
  timestamp: string;
  reason: string | null;
}

type Response = PaginatedResponse<DecisionLogItem>;
```

**Important:** The DecisionLogEntry table is APPEND-ONLY. This endpoint only supports GET. There are no PUT, PATCH, or DELETE operations on decision log entries. Entries are created exclusively as side effects of other operations.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 404 | `NOT_FOUND` | Assessment not found |

---

## 10. Intelligence Layer Admin Endpoints

All admin endpoints require the `admin` role. They manage the Intelligence Layer -- data that is NOT from the SAP ZIP but is maintained internally by Bound consultants and administrators.

### Industry Profiles

#### GET /api/admin/industry-profiles

List all industry profiles.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):**

```typescript
interface IndustryProfileItem {
  id: string;
  code: string;
  name: string;
  description: string;
  applicableScopeItems: string[];
  typicalScopeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface IndustryProfilesResponse {
  data: IndustryProfileItem[];
}
```

#### POST /api/admin/industry-profiles

Create a new industry profile.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):**

```typescript
const CreateIndustryProfileSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  applicableScopeItems: z.array(z.string()).min(1),
  typicalScopeCount: z.number().int().min(1),
});
```

**Response (201):**

```typescript
// Returns IndustryProfileItem
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation or scope item IDs not found |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 409 | `CONFLICT` | Code already exists |

#### GET /api/admin/industry-profiles/[id]

Get a single industry profile.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):** Returns `IndustryProfileItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Profile not found |

#### PUT /api/admin/industry-profiles/[id]

Update an industry profile.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):** Same as `CreateIndustryProfileSchema` (all fields required on PUT).

**Response (200):** Returns updated `IndustryProfileItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Profile not found |
| 409 | `CONFLICT` | Code already taken by another profile |

#### DELETE /api/admin/industry-profiles/[id]

Delete an industry profile.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):**

```typescript
interface DeleteResponse {
  success: true;
  id: string;
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Profile not found |

---

### Effort Baselines

#### GET /api/admin/effort-baselines

List all effort baselines.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Query Parameters (Zod):**

```typescript
const EffortBaselineQuery = z.object({
  scopeItemId: z.string().optional(),
  complexity: z.enum(["low", "medium", "high"]).optional(),
});
```

**Response (200):**

```typescript
interface EffortBaselineItem {
  id: string;
  scopeItemId: string;
  complexity: "low" | "medium" | "high";
  implementationDays: number;
  configDays: number;
  testDays: number;
  dataMigrationDays: number;
  trainingDays: number;
  notes: string | null;
  source: string | null;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

interface EffortBaselinesResponse {
  data: EffortBaselineItem[];
}
```

#### POST /api/admin/effort-baselines

Create a new effort baseline.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):**

```typescript
const CreateEffortBaselineSchema = z.object({
  scopeItemId: z.string().min(1),
  complexity: z.enum(["low", "medium", "high"]),
  implementationDays: z.number().min(0),
  configDays: z.number().min(0),
  testDays: z.number().min(0),
  dataMigrationDays: z.number().min(0),
  trainingDays: z.number().min(0),
  notes: z.string().max(5000).optional(),
  source: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1),
});
```

**Response (201):** Returns `EffortBaselineItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation or scopeItemId not found |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 409 | `CONFLICT` | Baseline for this scopeItemId + complexity already exists |

#### GET /api/admin/effort-baselines/[id]

Get a single effort baseline.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):** Returns `EffortBaselineItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Baseline not found |

#### PUT /api/admin/effort-baselines/[id]

Update an effort baseline.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):** Same as `CreateEffortBaselineSchema`.

**Response (200):** Returns updated `EffortBaselineItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Baseline not found |
| 409 | `CONFLICT` | Unique constraint violation on scopeItemId + complexity |

#### DELETE /api/admin/effort-baselines/[id]

Delete an effort baseline.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):** Returns `DeleteResponse`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Baseline not found |

---

### Extensibility Patterns

#### GET /api/admin/extensibility-patterns

List all extensibility patterns.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Query Parameters (Zod):**

```typescript
const ExtensibilityPatternQuery = z.object({
  resolutionType: z.enum(["KEY_USER", "BTP", "ISV", "CUSTOM_ABAP", "NOT_POSSIBLE"]).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
});
```

**Response (200):**

```typescript
interface ExtensibilityPatternItem {
  id: string;
  gapPattern: string;
  resolutionType: "KEY_USER" | "BTP" | "ISV" | "CUSTOM_ABAP" | "NOT_POSSIBLE";
  resolutionDescription: string;
  effortDays: number;
  recurringCostAnnual: number;
  riskLevel: "low" | "medium" | "high";
  sapSupported: boolean;
  upgradeSafe: boolean;
  examples: string[];
  createdAt: string;
  updatedAt: string;
}

interface ExtensibilityPatternsResponse {
  data: ExtensibilityPatternItem[];
}
```

#### POST /api/admin/extensibility-patterns

Create a new extensibility pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):**

```typescript
const CreateExtensibilityPatternSchema = z.object({
  gapPattern: z.string().min(10).max(5000),
  resolutionType: z.enum(["KEY_USER", "BTP", "ISV", "CUSTOM_ABAP", "NOT_POSSIBLE"]),
  resolutionDescription: z.string().min(10).max(5000),
  effortDays: z.number().min(0),
  recurringCostAnnual: z.number().min(0).default(0),
  riskLevel: z.enum(["low", "medium", "high"]),
  sapSupported: z.boolean(),
  upgradeSafe: z.boolean(),
  examples: z.array(z.string()).default([]),
});
```

**Response (201):** Returns `ExtensibilityPatternItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |

#### GET /api/admin/extensibility-patterns/[id]

Get a single extensibility pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):** Returns `ExtensibilityPatternItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Pattern not found |

#### PUT /api/admin/extensibility-patterns/[id]

Update an extensibility pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):** Same as `CreateExtensibilityPatternSchema`.

**Response (200):** Returns updated `ExtensibilityPatternItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Pattern not found |

#### DELETE /api/admin/extensibility-patterns/[id]

Delete an extensibility pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):** Returns `DeleteResponse`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Pattern not found |

---

### Adaptation Patterns

#### GET /api/admin/adaptation-patterns

List all adaptation patterns.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Query Parameters (Zod):**

```typescript
const AdaptationPatternQuery = z.object({
  recommendation: z.enum(["ADAPT", "EXTEND"]).optional(),
});
```

**Response (200):**

```typescript
interface AdaptationPatternItem {
  id: string;
  commonGap: string;
  sapApproach: string;
  adaptEffort: string;
  extendEffort: string;
  recommendation: "ADAPT" | "EXTEND";
  rationale: string;
  createdAt: string;
  updatedAt: string;
}

interface AdaptationPatternsResponse {
  data: AdaptationPatternItem[];
}
```

#### POST /api/admin/adaptation-patterns

Create a new adaptation pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):**

```typescript
const CreateAdaptationPatternSchema = z.object({
  commonGap: z.string().min(10).max(5000),
  sapApproach: z.string().min(10).max(5000),
  adaptEffort: z.string().min(1).max(5000),
  extendEffort: z.string().min(1).max(5000),
  recommendation: z.enum(["ADAPT", "EXTEND"]),
  rationale: z.string().min(10).max(5000),
});
```

**Response (201):** Returns `AdaptationPatternItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |

#### GET /api/admin/adaptation-patterns/[id]

Get a single adaptation pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):** Returns `AdaptationPatternItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Pattern not found |

#### PUT /api/admin/adaptation-patterns/[id]

Update an adaptation pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request Body (Zod):** Same as `CreateAdaptationPatternSchema`.

**Response (200):** Returns updated `AdaptationPatternItem`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Pattern not found |

#### DELETE /api/admin/adaptation-patterns/[id]

Delete an adaptation pattern.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):** Returns `DeleteResponse`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 404 | `NOT_FOUND` | Pattern not found |

---

### Data Ingestion

#### POST /api/admin/ingest

Trigger ingestion of a new SAP Best Practices ZIP. This replaces the SAP Catalog layer entirely.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Request:** Multipart form-data with a single field:

```
file: ZIP file (max 500MB)
```

**Response (202):**

```typescript
interface IngestResponse {
  success: true;
  jobId: string;
  message: "Ingestion started. Use GET /api/admin/ingest/[jobId] to monitor progress.";
}
```

This is an asynchronous operation. The ZIP is validated and then ingestion begins in the background. The client polls for status.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | No file, wrong file type, or file exceeds 500MB |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |

---

### Data Verification

#### GET /api/admin/verify

Run all 13 data integrity checks from DATA-CONTRACT.md Section 13 and return results.

| Property | Value |
|----------|-------|
| Auth | `admin` |

**Response (200):**

```typescript
interface VerificationResult {
  check: string;                           // e.g., "Scope item count"
  expected: number | string;
  actual: number | string;
  passed: boolean;
}

interface VerifyResponse {
  allPassed: boolean;
  timestamp: string;
  results: VerificationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not admin |
| 500 | `INTERNAL_ERROR` | Database query failure |

---

## 11. Flow Diagram Endpoints

### GET /api/assessments/[id]/flows

List all generated process flow diagrams for an assessment.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` (scoped to org) |

**Query Parameters (Zod):**

```typescript
const FlowDiagramsQuery = z.object({
  scopeItemId: z.string().optional(),
});
```

**Response (200):**

```typescript
interface FlowDiagramListItem {
  id: string;
  assessmentId: string;
  scopeItemId: string;
  scopeItemName: string;
  processFlowName: string;
  diagramType: "sequential";
  stepCount: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
  generatedAt: string;
}

interface FlowDiagramsResponse {
  data: FlowDiagramListItem[];
  summary: {
    totalDiagrams: number;
    scopeItemsCovered: number;
    totalStepsInDiagrams: number;
  };
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access to this assessment |
| 403 | `MFA_REQUIRED` | MFA not verified |
| 404 | `NOT_FOUND` | Assessment not found |

---

### POST /api/assessments/[id]/flows

Generate (or regenerate) process flow diagrams for an assessment. Diagrams are created per scope item per processFlowGroup.

| Property | Value |
|----------|-------|
| Auth | `consultant` |

**Request Body (Zod):**

```typescript
const GenerateFlowDiagramsSchema = z.object({
  scopeItemIds: z.array(z.string()).optional(),    // if omitted, generates for ALL selected scope items
  regenerate: z.boolean().default(false),           // if true, regenerates even if diagrams exist
});
```

**Response (202):**

```typescript
interface GenerateFlowsResponse {
  success: true;
  generated: number;          // number of diagrams generated
  skipped: number;            // number skipped (already exist and regenerate=false)
  scopeItemsCovered: number;
}
```

**Side effects:**
- For each selected scope item, queries ProcessStep records grouped by `processFlowGroup`.
- For each group, enriches with StepResponse fit statuses from this assessment.
- Generates an SVG diagram: steps as colored nodes (green=FIT, blue=CONFIGURE, amber=GAP, gray=N/A/PENDING) connected by arrows in sequence order.
- Stores SVG in `ProcessFlowDiagram` table.
- Creates DecisionLogEntry with action `"FLOW_DIAGRAM_GENERATED"`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid scope item IDs |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not consultant or admin |
| 404 | `NOT_FOUND` | Assessment not found |

---

### GET /api/assessments/[id]/flows/[flowId]

Get a single flow diagram as SVG.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` (scoped to org) |

**Response (200):**

- Content-Type: `image/svg+xml`
- Body: SVG markup

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Diagram not found |

---

### GET /api/assessments/[id]/flows/[flowId]/pdf

Get a single flow diagram as PDF.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` (scoped to org) |

**Response (200):**

- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="{scopeItemId}_{flowName}_Flow_Diagram.pdf"`
- Body: PDF binary

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Diagram not found |

---

### GET /api/assessments/[id]/report/flow-atlas

Generate the complete Process Flow Atlas as a single PDF containing all flow diagrams for the assessment.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` (scoped to org) |

**Response (200):**

- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="{companyName}_Process_Flow_Atlas.pdf"`
- Body: PDF containing:
  - Cover page with company name, date, Bound branding
  - Table of contents listing all scope items and their flows
  - One page per flow diagram (SVG rendered to PDF)
  - Color legend on first page
  - Summary statistics: total steps, fit %, gap count

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Assessment is in `"draft"` status |
| 400 | `VALIDATION_ERROR` | No flow diagrams generated yet — call POST /api/assessments/[id]/flows first |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Assessment not found |

---

## 12. Remaining Items Endpoints

### GET /api/assessments/[id]/remaining

List all remaining items for an assessment.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` (scoped to org) |

**Query Parameters (Zod):**

```typescript
const RemainingItemsQuery = z.object({
  category: z.enum([
    "unreviewed_step", "maybe_scope", "excluded_recommended_config",
    "out_of_scope_gap", "integration_point", "data_migration", "custom_requirement"
  ]).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  scopeItemId: z.string().optional(),
  functionalArea: z.string().optional(),
  resolved: z.coerce.boolean().optional(),
});
```

**Response (200):**

```typescript
interface RemainingItemResponse {
  id: string;
  assessmentId: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  scopeItemId: string | null;
  functionalArea: string | null;
  assignedTo: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  autoGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RemainingItemsListResponse {
  data: RemainingItemResponse[];
  summary: {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    resolved: number;
    unresolved: number;
  };
}
```

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 403 | `MFA_REQUIRED` | MFA not verified |
| 404 | `NOT_FOUND` | Assessment not found |

---

### POST /api/assessments/[id]/remaining

Add a manual remaining item.

| Property | Value |
|----------|-------|
| Auth | `consultant` |

**Request Body (Zod):**

```typescript
const CreateRemainingItemSchema = z.object({
  category: z.enum([
    "unreviewed_step", "maybe_scope", "excluded_recommended_config",
    "out_of_scope_gap", "integration_point", "data_migration", "custom_requirement"
  ]),
  title: z.string().min(5).max(255),
  description: z.string().min(10).max(5000),
  severity: z.enum(["critical", "high", "medium", "low"]),
  scopeItemId: z.string().optional(),
  functionalArea: z.string().optional(),
  assignedTo: z.string().email().optional(),
});
```

**Response (201):**

```typescript
// Returns RemainingItemResponse
```

**Side effects:**
- Creates DecisionLogEntry with action `"REMAINING_ITEM_ADDED"`.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not consultant or admin |
| 404 | `NOT_FOUND` | Assessment not found |

---

### POST /api/assessments/[id]/remaining/auto-generate

Auto-generate remaining items from assessment data. This scans the assessment for: unreviewed steps, MAYBE scope items, excluded recommended configs, OUT_OF_SCOPE gaps.

| Property | Value |
|----------|-------|
| Auth | `consultant` |

**Response (200):**

```typescript
interface AutoGenerateResponse {
  generated: number;
  byCategory: Record<string, number>;
  skippedExisting: number;    // items not created because they already exist
}
```

**Side effects:**
- Creates RemainingItem records for each detected item with `autoGenerated = true`.
- Skips items that already have a matching (assessmentId, category, sourceEntityId) record.

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | Not consultant or admin |
| 404 | `NOT_FOUND` | Assessment not found |

---

### GET /api/assessments/[id]/report/remaining-register

Generate the Remaining Items Register as XLSX.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` (scoped to org) |

**Response (200):**

- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{companyName}_Remaining_Items_Register.xlsx"`
- Body: XLSX with columns:
  - Item #, Category, Title, Description, Severity, Source Entity, Scope Item, Functional Area, Assigned To, Resolution, Resolved At, Resolved By, Auto-Generated

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Assessment is in `"draft"` status |
| 401 | `UNAUTHORIZED` | No session |
| 403 | `FORBIDDEN` | User does not have access |
| 404 | `NOT_FOUND` | Assessment not found |

---

## 13. Dashboard Endpoint

### GET /api/dashboard

Get the per-company progress dashboard data. Shows team progress by area and by person.

| Property | Value |
|----------|-------|
| Auth | `mfa_verified` |

**Response (200):**

```typescript
interface DashboardResponse {
  organization: {
    id: string;
    name: string;
  };
  assessments: DashboardAssessment[];
}

interface DashboardAssessment {
  id: string;
  companyName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  progress: {
    scopeItemsSelected: number;
    scopeItemsTotal: number;
    stepsReviewed: number;
    stepsTotal: number;
    gapsIdentified: number;
    gapsResolved: number;
    overallPercent: number;        // 0-100
  };
  byArea: {
    functionalArea: string;
    stepsTotal: number;
    stepsReviewed: number;
    fitCount: number;
    gapCount: number;
    assignedTo: string[];          // stakeholder emails assigned to this area
    percent: number;
  }[];
  byPerson: {
    stakeholderEmail: string;
    stakeholderName: string;
    role: string;
    assignedAreas: string[];
    stepsReviewed: number;
    stepsTotal: number;            // total steps in their assigned areas
    lastActiveAt: string | null;
    percent: number;
  }[];
  recentActivity: {
    timestamp: string;
    actor: string;
    actorRole: string;
    action: string;
    entityType: string;
    summary: string;               // human-readable: "John marked 5 steps as FIT in Finance"
  }[];                             // last 20 entries
}
```

**Scoping:**
- External users: only see assessments for their `organizationId`.
- Consultants/admins: see all assessments (with org filter option).

**Errors:**

| Status | Code | Condition |
|--------|------|-----------|
| 401 | `UNAUTHORIZED` | No session |
| 403 | `MFA_REQUIRED` | MFA not verified |

---

## Endpoint Index

| # | Method | Path | Auth | Section |
|---|--------|------|------|---------|
| 1 | POST | `/api/auth/login` | public | 1 |
| 2 | POST | `/api/auth/verify` | public | 1 |
| 3 | GET | `/api/auth/session` | public | 1 |
| 4 | POST | `/api/auth/logout` | authenticated | 1 |
| 5 | POST | `/api/auth/mfa/setup` | authenticated | 1 |
| 6 | POST | `/api/auth/mfa/verify` | authenticated | 1 |
| 7 | GET | `/api/auth/mfa/status` | authenticated | 1 |
| 8 | GET | `/api/assessments` | mfa_verified | 2 |
| 9 | POST | `/api/assessments` | mfa_verified | 2 |
| 10 | GET | `/api/assessments/[id]` | mfa_verified | 2 |
| 11 | PATCH | `/api/assessments/[id]` | mfa_verified+ | 2 |
| 12 | DELETE | `/api/assessments/[id]` | admin | 2 |
| 13 | GET | `/api/assessments/[id]/stakeholders` | mfa_verified | 3 |
| 14 | POST | `/api/assessments/[id]/stakeholders` | consultant | 3 |
| 15 | DELETE | `/api/assessments/[id]/stakeholders/[stakeholderId]` | consultant | 3 |
| 16 | GET | `/api/assessments/[id]/scope` | mfa_verified | 4 |
| 17 | PUT | `/api/assessments/[id]/scope/[scopeItemId]` | mfa_verified (area-locked) | 4 |
| 18 | POST | `/api/assessments/[id]/scope/bulk` | mfa_verified (area-locked) | 4 |
| 19 | GET | `/api/catalog/scope-items` | mfa_verified | 5 |
| 20 | GET | `/api/catalog/scope-items/[id]` | mfa_verified | 5 |
| 21 | GET | `/api/catalog/scope-items/[id]/steps` | mfa_verified | 5 |
| 22 | GET | `/api/catalog/scope-items/[id]/configs` | mfa_verified | 5 |
| 23 | GET | `/api/catalog/config-activities` | mfa_verified | 5 |
| 24 | GET | `/api/catalog/setup-guide/[scopeItemId]` | mfa_verified | 5 |
| 25 | GET | `/api/assessments/[id]/steps` | mfa_verified | 6 |
| 26 | PUT | `/api/assessments/[id]/steps/[stepId]` | mfa_verified (area-locked) | 6 |
| 27 | POST | `/api/assessments/[id]/steps/bulk` | mfa_verified (area-locked) | 6 |
| 28 | GET | `/api/assessments/[id]/gaps` | mfa_verified | 7 |
| 29 | PUT | `/api/assessments/[id]/gaps/[gapId]` | mfa_verified | 7 |
| 30 | GET | `/api/assessments/[id]/report/executive-summary` | mfa_verified | 8 |
| 31 | GET | `/api/assessments/[id]/report/scope-catalog` | mfa_verified | 8 |
| 32 | GET | `/api/assessments/[id]/report/step-detail` | mfa_verified | 8 |
| 33 | GET | `/api/assessments/[id]/report/gap-register` | mfa_verified | 8 |
| 34 | GET | `/api/assessments/[id]/report/config-workbook` | mfa_verified | 8 |
| 35 | GET | `/api/assessments/[id]/report/audit-trail` | mfa_verified | 8 |
| 36 | POST | `/api/assessments/[id]/report/sign-off` | mfa_verified | 8 |
| 37 | GET | `/api/assessments/[id]/decision-log` | mfa_verified | 9 |
| 38 | GET | `/api/admin/industry-profiles` | admin | 10 |
| 39 | POST | `/api/admin/industry-profiles` | admin | 10 |
| 40 | GET | `/api/admin/industry-profiles/[id]` | admin | 10 |
| 41 | PUT | `/api/admin/industry-profiles/[id]` | admin | 10 |
| 42 | DELETE | `/api/admin/industry-profiles/[id]` | admin | 10 |
| 43 | GET | `/api/admin/effort-baselines` | admin | 10 |
| 44 | POST | `/api/admin/effort-baselines` | admin | 10 |
| 45 | GET | `/api/admin/effort-baselines/[id]` | admin | 10 |
| 46 | PUT | `/api/admin/effort-baselines/[id]` | admin | 10 |
| 47 | DELETE | `/api/admin/effort-baselines/[id]` | admin | 10 |
| 48 | GET | `/api/admin/extensibility-patterns` | admin | 10 |
| 49 | POST | `/api/admin/extensibility-patterns` | admin | 10 |
| 50 | GET | `/api/admin/extensibility-patterns/[id]` | admin | 10 |
| 51 | PUT | `/api/admin/extensibility-patterns/[id]` | admin | 10 |
| 52 | DELETE | `/api/admin/extensibility-patterns/[id]` | admin | 10 |
| 53 | GET | `/api/admin/adaptation-patterns` | admin | 10 |
| 54 | POST | `/api/admin/adaptation-patterns` | admin | 10 |
| 55 | GET | `/api/admin/adaptation-patterns/[id]` | admin | 10 |
| 56 | PUT | `/api/admin/adaptation-patterns/[id]` | admin | 10 |
| 57 | DELETE | `/api/admin/adaptation-patterns/[id]` | admin | 10 |
| 58 | POST | `/api/admin/ingest` | admin | 10 |
| 59 | GET | `/api/admin/verify` | admin | 10 |
| 60 | GET | `/api/assessments/[id]/flows` | mfa_verified | 11 |
| 61 | POST | `/api/assessments/[id]/flows` | consultant | 11 |
| 62 | GET | `/api/assessments/[id]/flows/[flowId]` | mfa_verified | 11 |
| 63 | GET | `/api/assessments/[id]/flows/[flowId]/pdf` | mfa_verified | 11 |
| 64 | GET | `/api/assessments/[id]/report/flow-atlas` | mfa_verified | 11 |
| 65 | GET | `/api/assessments/[id]/remaining` | mfa_verified | 12 |
| 66 | POST | `/api/assessments/[id]/remaining` | consultant | 12 |
| 67 | POST | `/api/assessments/[id]/remaining/auto-generate` | consultant | 12 |
| 68 | GET | `/api/assessments/[id]/report/remaining-register` | mfa_verified | 12 |
| 69 | GET | `/api/dashboard` | mfa_verified | 13 |

**Total: 69 endpoints.**
