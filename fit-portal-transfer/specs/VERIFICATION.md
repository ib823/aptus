# Verification and Testing Specification

Complete verification, testing, and quality assurance specification for the Bound Fit Portal.
This document defines every test that must pass before the project is considered production-ready.

---

## 1. Data Integrity Tests

These 13 checks are derived directly from DATA-CONTRACT.md Section 13. They are implemented as a runnable script at `scripts/verify-data.ts` and also exposed via `GET /api/admin/verify`.

### Script: `scripts/verify-data.ts`

**Invocation:**

```bash
cd /workspaces/cockpit/fit-portal
pnpm verify:data
# which runs: npx tsx scripts/verify-data.ts
```

**Implementation Requirements:**

The script connects to the database via Prisma and executes 13 sequential checks. Each check compares an actual query result against a hardcoded expected value. The script exits with code 0 if all checks pass, or code 1 if any check fails.

### Check Definitions

| # | Check Name | Query | Expected | Tolerance |
|---|-----------|-------|----------|-----------|
| 1 | Scope item count | `SELECT COUNT(*) FROM scope_items` | 550 | Exact |
| 2 | Total process steps | `SELECT COUNT(*) FROM process_steps` | 102,261 | Exact |
| 3 | Config activities | `SELECT COUNT(*) FROM config_activities` | 4,703 | Exact |
| 4a | Config category: Mandatory | `SELECT COUNT(*) FROM config_activities WHERE category = 'Mandatory'` | 591 | Exact |
| 4b | Config category: Recommended | `SELECT COUNT(*) FROM config_activities WHERE category = 'Recommended'` | 1,491 | Exact |
| 4c | Config category: Optional | `SELECT COUNT(*) FROM config_activities WHERE category = 'Optional'` | 2,604 | Exact |
| 4d | Config category: Other/Empty | `SELECT COUNT(*) FROM config_activities WHERE category NOT IN ('Mandatory','Recommended','Optional') OR category = ''` | 17 | Exact |
| 5 | Setup guides | `SELECT COUNT(*) FROM setup_guides` | 230 | Exact |
| 6 | General files | `SELECT COUNT(*) FROM general_files` | 162 | Exact |
| 7a | Solution links (scenario) | `SELECT COUNT(*) FROM solution_links WHERE type = 'scenario'` | 32 | Exact |
| 7b | Solution links (process) | `SELECT COUNT(*) FROM solution_links WHERE type = 'process'` | 163 | Exact |
| 8 | IMG activities | `SELECT COUNT(*) FROM img_activities` | 4,451 | Exact |
| 9 | Expert config sheets | `SELECT COUNT(*) FROM expert_configs` | 13 | Exact |
| 10 | Orphaned steps | `SELECT COUNT(*) FROM process_steps WHERE scope_item_id NOT IN (SELECT id FROM scope_items)` | 0 | Exact |
| 11 | Orphaned configs | `SELECT COUNT(*) FROM config_activities WHERE scope_item_id NOT IN (SELECT id FROM scope_items) AND scope_item_id != 'All'` | 0 | Exact |
| 12 | DOCX without XLSX | `SELECT COUNT(*) FROM scope_items WHERE docx_stored = true AND xlsx_stored = false` | 0 | Exact |
| 13a | Self-service: Yes | `SELECT COUNT(*) FROM config_activities WHERE self_service = true` | 4,690 | Exact |
| 13b | Self-service: No | `SELECT COUNT(*) FROM config_activities WHERE self_service = false` | 13 | Exact |

### Required Output Format

The script must produce exactly this output format (with actual values replacing `{n}`):

```
=== Bound Fit Portal: Data Integrity Verification ===
Timestamp: {ISO 8601 timestamp}
Database: {connection string, password masked}

Check  1: Scope item count .............. {actual}/550        {PASS|FAIL}
Check  2: Total process steps ........... {actual}/102261     {PASS|FAIL}
Check  3: Config activities ............. {actual}/4703       {PASS|FAIL}
Check  4: Config categories
           Mandatory .................... {actual}/591        {PASS|FAIL}
           Recommended .................. {actual}/1491       {PASS|FAIL}
           Optional ..................... {actual}/2604       {PASS|FAIL}
           Other/Empty .................. {actual}/17         {PASS|FAIL}
Check  5: Setup guides .................. {actual}/230        {PASS|FAIL}
Check  6: General files ................. {actual}/162        {PASS|FAIL}
Check  7: Solution links
           Scenario ..................... {actual}/32         {PASS|FAIL}
           Process ...................... {actual}/163        {PASS|FAIL}
Check  8: IMG activities ................ {actual}/4451       {PASS|FAIL}
Check  9: Expert config sheets .......... {actual}/13         {PASS|FAIL}
Check 10: Orphaned steps ................ {actual}/0          {PASS|FAIL}
Check 11: Orphaned configs .............. {actual}/0          {PASS|FAIL}
Check 12: DOCX without XLSX ............. {actual}/0          {PASS|FAIL}
Check 13: Self-service availability
           Yes .......................... {actual}/4690       {PASS|FAIL}
           No ........................... {actual}/13         {PASS|FAIL}

===================================================
Result: {PASSED|FAILED} ({passed}/{total} checks)
===================================================
```

If any check fails, the script must also print a `FAILURE DETAILS` section listing each failed check with its expected vs. actual value.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | One or more checks failed |
| 2 | Database connection failed |

---

## 2. Unit Test Requirements

Unit tests run via `vitest` and must not require a database connection. All database interactions are mocked. Test files are co-located with source files using the pattern `*.test.ts`.

### 2.1 Step Type Normalization

**File:** `src/lib/step-type.test.ts`

Tests for the function that derives `stepType` from `actionTitle`.

| Test Case | Input `actionTitle` | Expected `stepType` |
|-----------|-------------------|-------------------|
| Exact match "Log On" | `"Log On"` | `LOGON` |
| Lowercase variant | `"log on"` | `LOGON` |
| "Log onto" variant | `"Log onto Fiori Launchpad"` | `LOGON` |
| "Logon" single word | `"Logon"` | `LOGON` |
| "Access the App" | `"Access the App"` | `ACCESS_APP` |
| "Access the SAP Fiori App" | `"Access the SAP Fiori App"` | `ACCESS_APP` |
| "Open Configure Your Solution" | `"Open Configure Your Solution"` | `ACCESS_APP` |
| "Information" exact | `"Information"` | `INFORMATION` |
| "Enter Selection Criteria" | `"Enter Selection Criteria"` | `DATA_ENTRY` |
| "Enter Data" | `"Enter Data"` | `DATA_ENTRY` |
| "Input values" | `"Input values"` | `DATA_ENTRY` |
| "Save" | `"Save"` | `ACTION` |
| "Post" | `"Post"` | `ACTION` |
| "Execute" | `"Execute"` | `ACTION` |
| "Run report" | `"Run report"` | `ACTION` |
| "Verify results" | `"Verify results"` | `VERIFICATION` |
| "Check data" | `"Check data"` | `VERIFICATION` |
| "Confirm posting" | `"Confirm posting"` | `VERIFICATION` |
| "Review document" | `"Review document"` | `VERIFICATION` |
| "Back" | `"Back"` | `NAVIGATION` |
| "Return to list" | `"Return to list"` | `NAVIGATION` |
| "Navigate to" | `"Navigate to inbox"` | `NAVIGATION` |
| Unrecognized title | `"Create Purchase Order"` | `PROCESS_STEP` |
| Empty string edge | `""` | `PROCESS_STEP` |
| Mixed case | `"ACCESS THE APP"` | `ACCESS_APP` |

**Minimum test count:** 25 test cases.

### 2.2 Decision Framework Logic

**File:** `src/lib/decision-framework.test.ts`

Tests for the resolution recommendation engine.

| Test Case | Description |
|-----------|-------------|
| FIT recommendation | When client process matches SAP exactly, returns FIT |
| CONFIGURE recommendation | When gap can be resolved by configuration alone |
| KEY_USER_EXT recommendation | When gap fits Key User Extensibility criteria |
| BTP_EXT recommendation | When gap requires BTP extension |
| ISV recommendation | When ISV solution exists for the gap pattern |
| CUSTOM_ABAP recommendation | When custom development is needed |
| ADAPT_PROCESS recommendation | When process change is more cost-effective than extension |
| OUT_OF_SCOPE recommendation | When the gap is deferred |
| Effort calculation (low complexity) | Returns correct total days for low complexity baseline |
| Effort calculation (high complexity) | Returns correct total days for high complexity baseline |
| Risk assessment | Returns correct risk level for each resolution type |
| Upgrade safety | Correctly flags upgrade-safe vs. non-upgrade-safe resolutions |
| Cost comparison (ADAPT vs EXTEND) | Returns correct delta between adapt and extend approaches |
| Missing baseline handling | Returns null effort when no baseline exists for scope item |

**Minimum test count:** 20 test cases.

### 2.3 Effort Calculation

**File:** `src/lib/effort-calc.test.ts`

Tests for the effort aggregation logic used in reports and dashboards.

| Test Case | Description |
|-----------|-------------|
| Single scope item total | Sum of implementationDays + configDays + testDays + dataMigrationDays + trainingDays |
| Multiple scope items total | Correct aggregation across scope items |
| Zero-effort items | Scope items with no effort baseline return 0, not null |
| Confidence-weighted total | Total weighted by confidence factor |
| By-phase breakdown | Correct per-phase totals (implement, config, test, migrate, train) |
| By-resolution-type breakdown | Correct totals grouped by resolution type |
| Gap additional effort | Correct sum of effortDays from all GapResolution records |
| Recurring cost aggregation | Correct annual recurring cost total |
| One-time cost aggregation | Correct one-time cost total |
| Empty assessment | Returns all zeros for an assessment with no data |

**Minimum test count:** 15 test cases.

### 2.4 Report Generation Utilities

**File:** `src/lib/report-utils.test.ts`

Tests for helper functions used in report generation.

| Test Case | Description |
|-----------|-------------|
| Fit percentage calculation | (FIT + CONFIGURE) / totalSteps * 100, rounded to 1 decimal |
| Gap percentage calculation | GAP / totalSteps * 100, rounded to 1 decimal |
| Scope coverage calculation | selectedScopeItems / totalScopeItems * 100 |
| XLSX column formatting | Dates formatted as ISO strings, numbers as numbers, booleans as "Yes"/"No" |
| PDF content sanitization | HTML tags stripped from text fields for PDF |
| Company name sanitization | Special characters removed from filenames |
| Empty data handling | Report generates successfully with zero rows |
| Large dataset handling | Report generates successfully with 100,000+ step responses |

**Minimum test count:** 12 test cases.

### 2.5 Assessment Status Machine

**File:** `src/lib/status-machine.test.ts`

Tests for the assessment status transition logic.

| Test Case | Description |
|-----------|-------------|
| Valid: draft to in_progress | Transition allowed |
| Valid: in_progress to completed | Transition allowed |
| Valid: completed to reviewed | Transition allowed (consultant/admin) |
| Valid: reviewed to signed_off | Transition allowed (admin with sign-off) |
| Invalid: in_progress to draft | Backward transition rejected |
| Invalid: completed to in_progress | Backward transition rejected |
| Invalid: skip from draft to completed | Non-adjacent transition rejected |
| Role check: client cannot review | Rejected with FORBIDDEN |
| Role check: consultant can review | Allowed |
| Role check: only admin signs off | Other roles rejected |

**Minimum test count:** 12 test cases.

### 2.6 Zod Schema Validation

**File:** `src/lib/schemas.test.ts`

Tests that all Zod schemas from the API contract correctly validate and reject input.

| Test Case | Description |
|-----------|-------------|
| CreateAssessmentSchema: valid input | Passes validation |
| CreateAssessmentSchema: missing companyName | Fails with field error |
| CreateAssessmentSchema: invalid country code | Fails (not 2 chars) |
| UpsertStepResponseSchema: GAP without note | Fails with refinement error |
| UpsertStepResponseSchema: GAP with short note | Fails (min 10 chars) |
| UpsertStepResponseSchema: GAP with valid note | Passes |
| UpsertGapResolutionSchema: missing rationale | Fails |
| UpsertGapResolutionSchema: short rationale | Fails (min 20 chars) |
| SignOffSchema: acknowledgement false | Fails (must be literal true) |
| BulkScopeSchema: empty selections | Fails (min 1) |
| BulkScopeSchema: too many selections | Fails (max 550) |
| PaginationParams: limit too large | Fails (max 200) |

**Minimum test count:** 20 test cases.

### 2.7 MFA Logic

**File:** `src/lib/mfa.test.ts`

Tests for TOTP generation, verification, and secret encryption.

| Test Case | Description |
|-----------|-------------|
| Generate TOTP secret | Returns valid base32 string of correct length |
| Generate OTP auth URI | Returns correctly formatted otpauth://totp/ URI |
| Verify valid TOTP code | Returns true for current time window code |
| Verify expired TOTP code | Returns false for code from 2 windows ago |
| Verify invalid TOTP code | Returns false for random 6-digit string |
| Encrypt secret | Encrypted output differs from plaintext |
| Decrypt secret | Decrypted output matches original plaintext |
| Encrypt/decrypt roundtrip | encrypt(decrypt(secret)) === secret |
| Rate limit check | Returns locked=true after 5 failed attempts |
| Rate limit reset | Returns locked=false after successful verification |

**Minimum test count:** 15 test cases.

### 2.8 Permission Logic

**File:** `src/lib/permissions.test.ts`

Tests for area-locked editing and role-based access control.

| Test Case | Description |
|-----------|-------------|
| Process owner: allowed area | Returns true for step in assigned area |
| Process owner: blocked area | Returns false for step outside assigned area |
| Process owner: empty assigned areas | Returns false for all areas |
| IT lead: can add note | Returns true for clientNote modification |
| IT lead: cannot change fitStatus | Returns false for fitStatus modification |
| Executive: read only | Returns false for any write operation |
| Consultant: any area | Returns true for any area |
| Consultant: override logged | Override flag set when editing outside normal scope |
| Admin: unrestricted | Returns true for all operations |
| MFA required check (external) | Returns MFA_REQUIRED for unverified external user |
| MFA optional check (internal) | Returns OK for unverified internal user without MFA |
| Concurrent session check | Returns revoked for user with existing active session |

**Minimum test count:** 18 test cases.

### 2.9 Flow Diagram Generator

**File:** `src/lib/flow-diagram-generator.test.ts`

Tests for SVG flow diagram generation.

| Test Case | Description |
|-----------|-------------|
| Generate diagram from steps | Returns valid SVG string |
| Steps ordered by sequence | SVG nodes appear in sequence order |
| FIT steps are green | SVG node fill is green for FIT status |
| GAP steps are amber | SVG node fill is amber for GAP status |
| CONFIGURE steps are blue | SVG node fill is blue for CONFIGURE status |
| Pending steps are gray | SVG node fill is gray for PENDING status |
| Empty steps list | Returns empty diagram with "No steps" message |
| Single step | Returns diagram with one node and no connecting arrows |
| Arrow connections | N steps produce N-1 connecting arrows |
| Step labels truncated | Long action titles are truncated to 40 chars with ellipsis |

**Minimum test count:** 12 test cases.

### Unit Test Summary

| Module | File | Min Tests |
|--------|------|-----------|
| Step type normalization | `src/lib/step-type.test.ts` | 25 |
| Decision framework | `src/lib/decision-framework.test.ts` | 20 |
| Effort calculation | `src/lib/effort-calc.test.ts` | 15 |
| Report utilities | `src/lib/report-utils.test.ts` | 12 |
| Status machine | `src/lib/status-machine.test.ts` | 12 |
| Zod schemas | `src/lib/schemas.test.ts` | 20 |
| MFA logic | `src/lib/mfa.test.ts` | 15 |
| Permission logic | `src/lib/permissions.test.ts` | 18 |
| Flow diagram generator | `src/lib/flow-diagram-generator.test.ts` | 12 |
| **Total minimum** | | **149** |

---

## 3. Integration Test Requirements

Integration tests run against a test database (separate from development). They test the full request-response cycle through Next.js API route handlers. Run via `vitest` with a `setup-integration.ts` file that provisions the test database.

### Test Database Setup

```typescript
// tests/setup-integration.ts
// 1. Create a temporary PostgreSQL database (e.g., fit_portal_test_{random})
// 2. Run prisma db push against the test database
// 3. Seed with a minimal dataset:
//    - 5 scope items (from the canonical list)
//    - 50 process steps (10 per scope item)
//    - 20 config activities
//    - 2 setup guides
//    - 1 industry profile
//    - 1 effort baseline
// 4. Create test users:
//    - client@test.com (role: client, orgId: test-org)
//    - consultant@test.com (role: consultant)
//    - admin@test.com (role: admin)
// 5. After all tests: drop the test database
```

### 3.1 Auth Endpoints

**File:** `tests/integration/auth.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Login with valid email | POST | `/api/auth/login` | 200, magic link queued |
| 2 | Login with invalid email | POST | `/api/auth/login` | 400, VALIDATION_ERROR |
| 3 | Verify with valid token | POST | `/api/auth/verify` | 200, session created |
| 4 | Verify with expired token | POST | `/api/auth/verify` | 401, UNAUTHORIZED |
| 5 | Verify with invalid token | POST | `/api/auth/verify` | 401, UNAUTHORIZED |
| 6 | Get session when logged in | GET | `/api/auth/session` | 200, user object |
| 7 | Get session when not logged in | GET | `/api/auth/session` | 200, user: null |
| 8 | Logout | POST | `/api/auth/logout` | 200, cookie cleared |
| 9 | Rate limit on login | POST | `/api/auth/login` (6x) | 429 on 6th request |

### 3.2 Assessment Endpoints

**File:** `tests/integration/assessments.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Create assessment | POST | `/api/assessments` | 201, assessment created |
| 2 | Create with invalid body | POST | `/api/assessments` | 400, VALIDATION_ERROR |
| 3 | Create while unauthenticated | POST | `/api/assessments` | 401, UNAUTHORIZED |
| 4 | List assessments for org | GET | `/api/assessments` | 200, only org's assessments |
| 5 | List with status filter | GET | `/api/assessments?status=draft` | 200, filtered list |
| 6 | List with pagination | GET | `/api/assessments?limit=2` | 200, 2 items + nextCursor |
| 7 | Get single assessment | GET | `/api/assessments/[id]` | 200, full detail |
| 8 | Get assessment from wrong org | GET | `/api/assessments/[id]` | 403, FORBIDDEN |
| 9 | Get non-existent assessment | GET | `/api/assessments/[id]` | 404, NOT_FOUND |
| 10 | Update assessment metadata | PATCH | `/api/assessments/[id]` | 200, updated |
| 11 | Advance status: draft to in_progress | PATCH | `/api/assessments/[id]` | 200, status changed |
| 12 | Reject backward status change | PATCH | `/api/assessments/[id]` | 400, INVALID_STATE_TRANSITION |
| 13 | Reject skip status change | PATCH | `/api/assessments/[id]` | 400, INVALID_STATE_TRANSITION |
| 14 | Client cannot set reviewed | PATCH | `/api/assessments/[id]` | 403, FORBIDDEN |
| 15 | Consultant can set reviewed | PATCH | `/api/assessments/[id]` | 200, status: reviewed |
| 16 | Delete as admin | DELETE | `/api/assessments/[id]` | 200, soft deleted |
| 17 | Delete as non-admin | DELETE | `/api/assessments/[id]` | 403, FORBIDDEN |
| 18 | Deleted assessment not in list | GET | `/api/assessments` | 200, excludes deleted |

### 3.3 Stakeholder Endpoints

**File:** `tests/integration/stakeholders.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | List stakeholders | GET | `/api/assessments/[id]/stakeholders` | 200, array |
| 2 | Add stakeholder | POST | `/api/assessments/[id]/stakeholders` | 201, stakeholder created |
| 3 | Add duplicate email | POST | `/api/assessments/[id]/stakeholders` | 409, CONFLICT |
| 4 | Add with invalid email | POST | `/api/assessments/[id]/stakeholders` | 400, VALIDATION_ERROR |
| 5 | Remove stakeholder | DELETE | `/api/assessments/[id]/stakeholders/[sid]` | 200, removed |
| 6 | Remove non-existent | DELETE | `/api/assessments/[id]/stakeholders/[sid]` | 404, NOT_FOUND |
| 7 | Decision log entry created on add | GET | `/api/assessments/[id]/decision-log` | Includes STAKEHOLDER_ADDED |
| 8 | Decision log entry created on remove | GET | `/api/assessments/[id]/decision-log` | Includes STAKEHOLDER_REMOVED |

### 3.4 Scope Selection Endpoints

**File:** `tests/integration/scope.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Get scope (empty) | GET | `/api/assessments/[id]/scope` | 200, 550 items, all null selections |
| 2 | Upsert scope selection | PUT | `/api/assessments/[id]/scope/[scopeId]` | 200, selection created |
| 3 | Update existing selection | PUT | `/api/assessments/[id]/scope/[scopeId]` | 200, selection updated |
| 4 | Invalid scope item ID | PUT | `/api/assessments/[id]/scope/INVALID` | 404, NOT_FOUND |
| 5 | Bulk update | POST | `/api/assessments/[id]/scope/bulk` | 200, counts returned |
| 6 | Bulk with invalid IDs | POST | `/api/assessments/[id]/scope/bulk` | 400, VALIDATION_ERROR |
| 7 | Filter by area | GET | `/api/assessments/[id]/scope?area=Finance` | 200, filtered results |
| 8 | Filter by relevance | GET | `/api/assessments/[id]/scope?relevance=YES` | 200, filtered |
| 9 | Auto-transition to in_progress | PUT | `/api/assessments/[id]/scope/[scopeId]` | Assessment status now in_progress |
| 10 | Decision log for scope include | GET | `/api/assessments/[id]/decision-log` | Includes SCOPE_INCLUDED |
| 11 | Decision log for scope exclude | GET | `/api/assessments/[id]/decision-log` | Includes SCOPE_EXCLUDED |

### 3.5 SAP Catalog Endpoints

**File:** `tests/integration/catalog.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | List scope items | GET | `/api/catalog/scope-items` | 200, paginated list |
| 2 | Filter by area | GET | `/api/catalog/scope-items?area=Finance` | 200, filtered |
| 3 | Search by name | GET | `/api/catalog/scope-items?search=Accounts` | 200, matching items |
| 4 | Get single scope item | GET | `/api/catalog/scope-items/J60` | 200, full detail |
| 5 | Get non-existent scope item | GET | `/api/catalog/scope-items/FAKE` | 404, NOT_FOUND |
| 6 | Get steps (paginated) | GET | `/api/catalog/scope-items/J60/steps` | 200, paginated steps |
| 7 | Filter steps by type | GET | `/api/catalog/scope-items/J60/steps?stepType=DATA_ENTRY` | 200, filtered |
| 8 | Get configs for scope item | GET | `/api/catalog/scope-items/J60/configs` | 200, configs + summary |
| 9 | Filter configs by category | GET | `/api/catalog/scope-items/J60/configs?category=Mandatory` | 200, filtered |
| 10 | List all config activities | GET | `/api/catalog/config-activities` | 200, paginated |
| 11 | Serve setup PDF | GET | `/api/catalog/setup-guide/J60` | 200, application/pdf |
| 12 | Setup PDF not found | GET | `/api/catalog/setup-guide/NOPDF` | 404, NOT_FOUND |
| 13 | Unauthenticated access | GET | `/api/catalog/scope-items` | 401, UNAUTHORIZED |

### 3.6 Step Response Endpoints

**File:** `tests/integration/steps.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | List step responses (empty) | GET | `/api/assessments/[id]/steps` | 200, empty data |
| 2 | Upsert step response (FIT) | PUT | `/api/assessments/[id]/steps/[stepId]` | 200, fitStatus: FIT |
| 3 | Upsert step response (GAP with note) | PUT | `/api/assessments/[id]/steps/[stepId]` | 200, fitStatus: GAP |
| 4 | GAP without note rejected | PUT | `/api/assessments/[id]/steps/[stepId]` | 400, VALIDATION_ERROR |
| 5 | GAP with short note rejected | PUT | `/api/assessments/[id]/steps/[stepId]` | 400, note < 10 chars |
| 6 | Update existing response | PUT | `/api/assessments/[id]/steps/[stepId]` | 200, updated |
| 7 | Filter by fitStatus | GET | `/api/assessments/[id]/steps?fitStatus=GAP` | 200, only gaps |
| 8 | Filter by scopeItemId | GET | `/api/assessments/[id]/steps?scopeItemId=J60` | 200, filtered |
| 9 | Paginate step responses | GET | `/api/assessments/[id]/steps?limit=10` | 200, 10 items + cursor |
| 10 | Bulk mark as FIT | POST | `/api/assessments/[id]/steps/bulk` | 200, counts |
| 11 | Bulk respects existing responses | POST | `/api/assessments/[id]/steps/bulk` | Skips already-responded |
| 12 | GAP auto-creates GapResolution | PUT | `/api/assessments/[id]/steps/[stepId]` | GapResolution record exists |
| 13 | Decision log for step response | GET | `/api/assessments/[id]/decision-log` | Includes MARKED_FIT |
| 14 | Decision log for status change | GET | `/api/assessments/[id]/decision-log` | Includes old/new value |

### 3.7 Gap Resolution Endpoints

**File:** `tests/integration/gaps.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | List gaps (empty) | GET | `/api/assessments/[id]/gaps` | 200, empty data |
| 2 | List gaps after marking GAP | GET | `/api/assessments/[id]/gaps` | 200, includes auto-created gap |
| 3 | Upsert resolution | PUT | `/api/assessments/[id]/gaps/[gapId]` | 200, resolution saved |
| 4 | Missing rationale rejected | PUT | `/api/assessments/[id]/gaps/[gapId]` | 400, VALIDATION_ERROR |
| 5 | Short rationale rejected | PUT | `/api/assessments/[id]/gaps/[gapId]` | 400, rationale < 20 chars |
| 6 | Filter by resolution type | GET | `/api/assessments/[id]/gaps?resolutionType=KEY_USER_EXT` | 200, filtered |
| 7 | Filter by risk level | GET | `/api/assessments/[id]/gaps?riskLevel=high` | 200, filtered |
| 8 | Summary counts accurate | GET | `/api/assessments/[id]/gaps` | Summary matches data |
| 9 | Effort totals accurate | GET | `/api/assessments/[id]/gaps` | Totals correct |
| 10 | Decision log for resolution | GET | `/api/assessments/[id]/decision-log` | Includes RESOLUTION_SELECTED |
| 11 | Decision log for change | GET | `/api/assessments/[id]/decision-log` | Includes RESOLUTION_CHANGED with old value |

### 3.8 Report Endpoints

**File:** `tests/integration/reports.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Executive summary (completed) | GET | `/api/assessments/[id]/report/executive-summary` | 200, application/pdf |
| 2 | Executive summary (draft) rejected | GET | `/api/assessments/[id]/report/executive-summary` | 400, wrong status |
| 3 | Scope catalog XLSX | GET | `/api/assessments/[id]/report/scope-catalog` | 200, XLSX content-type |
| 4 | Step detail XLSX | GET | `/api/assessments/[id]/report/step-detail` | 200, XLSX content-type |
| 5 | Gap register XLSX | GET | `/api/assessments/[id]/report/gap-register` | 200, XLSX content-type |
| 6 | Config workbook XLSX | GET | `/api/assessments/[id]/report/config-workbook` | 200, XLSX content-type |
| 7 | Audit trail (any status) | GET | `/api/assessments/[id]/report/audit-trail` | 200, XLSX content-type |
| 8 | Sign-off (reviewed status) | POST | `/api/assessments/[id]/report/sign-off` | 200, signed |
| 9 | Sign-off (wrong status) | POST | `/api/assessments/[id]/report/sign-off` | 400, wrong status |
| 10 | Duplicate sign-off role | POST | `/api/assessments/[id]/report/sign-off` | 409, CONFLICT |
| 11 | All sign-offs trigger status change | POST | `/api/assessments/[id]/report/sign-off` | Assessment -> signed_off |

### 3.9 Decision Log Endpoints

**File:** `tests/integration/decision-log.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | List decision log | GET | `/api/assessments/[id]/decision-log` | 200, paginated |
| 2 | Filter by entityType | GET | `/api/assessments/[id]/decision-log?entityType=process_step` | 200, filtered |
| 3 | Filter by action | GET | `/api/assessments/[id]/decision-log?action=MARKED_FIT` | 200, filtered |
| 4 | Filter by actor | GET | `/api/assessments/[id]/decision-log?actor=client@test.com` | 200, filtered |
| 5 | Filter by date range | GET | `/api/assessments/[id]/decision-log?since=...&until=...` | 200, filtered |
| 6 | Paginate log entries | GET | `/api/assessments/[id]/decision-log?limit=5` | 200, 5 items + cursor |
| 7 | Entries are chronological | GET | `/api/assessments/[id]/decision-log` | Timestamps ascending |
| 8 | No UPDATE/DELETE allowed | (verify no Prisma update/delete on DecisionLogEntry) | Compile-time + runtime |

### 3.10 Admin Endpoints

**File:** `tests/integration/admin.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Non-admin gets 403 | GET | `/api/admin/industry-profiles` | 403, FORBIDDEN |
| 2 | Create industry profile | POST | `/api/admin/industry-profiles` | 201, created |
| 3 | Duplicate code rejected | POST | `/api/admin/industry-profiles` | 409, CONFLICT |
| 4 | Update industry profile | PUT | `/api/admin/industry-profiles/[id]` | 200, updated |
| 5 | Delete industry profile | DELETE | `/api/admin/industry-profiles/[id]` | 200, deleted |
| 6 | Create effort baseline | POST | `/api/admin/effort-baselines` | 201, created |
| 7 | Duplicate scope+complexity rejected | POST | `/api/admin/effort-baselines` | 409, CONFLICT |
| 8 | Create extensibility pattern | POST | `/api/admin/extensibility-patterns` | 201, created |
| 9 | Create adaptation pattern | POST | `/api/admin/adaptation-patterns` | 201, created |
| 10 | Verify endpoint | GET | `/api/admin/verify` | 200, all checks |
| 11 | Invalid scope item in profile | POST | `/api/admin/industry-profiles` | 400, VALIDATION_ERROR |

### 3.11 MFA Endpoints

**File:** `tests/integration/mfa.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Setup MFA (external user) | POST | `/api/auth/mfa/setup` | 200, QR code + secret |
| 2 | Setup MFA (already verified) | POST | `/api/auth/mfa/setup` | 409, CONFLICT |
| 3 | Verify valid TOTP code | POST | `/api/auth/mfa/verify` | 200, mfaVerified: true |
| 4 | Verify invalid code | POST | `/api/auth/mfa/verify` | 401, UNAUTHORIZED |
| 5 | Verify after lockout (5 attempts) | POST | `/api/auth/mfa/verify` | 429, RATE_LIMITED |
| 6 | Get MFA status | GET | `/api/auth/mfa/status` | 200, enrollment info |
| 7 | Access protected endpoint without MFA | GET | `/api/assessments` | 403, MFA_REQUIRED |
| 8 | Access protected endpoint with MFA | GET | `/api/assessments` | 200, data returned |
| 9 | Concurrent session revocation | POST | `/api/auth/verify` (2nd login) | First session revoked |

### 3.12 Permission Enforcement Endpoints

**File:** `tests/integration/permissions.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Process owner edits own area | PUT | `/api/assessments/[id]/steps/[stepId]` | 200, response saved |
| 2 | Process owner edits other area | PUT | `/api/assessments/[id]/steps/[stepId]` | 403, AREA_LOCKED |
| 3 | IT lead adds note | PUT | `/api/assessments/[id]/steps/[stepId]` (note only) | 200, note saved |
| 4 | IT lead changes fitStatus | PUT | `/api/assessments/[id]/steps/[stepId]` (fitStatus) | 403, AREA_LOCKED |
| 5 | Executive tries mutation | PUT | `/api/assessments/[id]/steps/[stepId]` | 403, FORBIDDEN |
| 6 | Consultant edits any area | PUT | `/api/assessments/[id]/steps/[stepId]` | 200, response saved |
| 7 | Consultant override without reason | PUT | (cross-area edit, no reason) | 400, VALIDATION_ERROR |
| 8 | Consultant override with reason | PUT | (cross-area edit, with reason) | 200, PERMISSION_OVERRIDE logged |
| 9 | Admin unrestricted | PUT | `/api/assessments/[id]/steps/[stepId]` | 200, response saved |
| 10 | Area lock on scope selection | PUT | `/api/assessments/[id]/scope/[scopeId]` | 403 for wrong area |

### 3.13 Flow Diagram Endpoints

**File:** `tests/integration/flow-diagrams.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Generate flow diagrams | POST | `/api/assessments/[id]/flows` | 202, diagrams generated |
| 2 | List flow diagrams | GET | `/api/assessments/[id]/flows` | 200, diagram list |
| 3 | Get single diagram SVG | GET | `/api/assessments/[id]/flows/[id]` | 200, image/svg+xml |
| 4 | Get single diagram PDF | GET | `/api/assessments/[id]/flows/[id]/pdf` | 200, application/pdf |
| 5 | Get flow atlas PDF | GET | `/api/assessments/[id]/report/flow-atlas` | 200, application/pdf |
| 6 | Non-consultant cannot generate | POST | `/api/assessments/[id]/flows` (as client) | 403, FORBIDDEN |
| 7 | No diagrams for draft assessment | GET | `/api/assessments/[id]/report/flow-atlas` | 400, VALIDATION_ERROR |

### 3.14 Remaining Items Endpoints

**File:** `tests/integration/remaining-items.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | List remaining items (empty) | GET | `/api/assessments/[id]/remaining` | 200, empty list |
| 2 | Auto-generate items | POST | `/api/assessments/[id]/remaining/auto-generate` | 200, items created |
| 3 | Add manual item | POST | `/api/assessments/[id]/remaining` | 201, item created |
| 4 | Filter by category | GET | `/api/assessments/[id]/remaining?category=out_of_scope_gap` | 200, filtered |
| 5 | Filter by severity | GET | `/api/assessments/[id]/remaining?severity=critical` | 200, filtered |
| 6 | Export register XLSX | GET | `/api/assessments/[id]/report/remaining-register` | 200, XLSX |
| 7 | Non-consultant cannot add | POST | `/api/assessments/[id]/remaining` (as client) | 403, FORBIDDEN |
| 8 | Non-consultant cannot auto-generate | POST | `/api/assessments/[id]/remaining/auto-generate` (as client) | 403, FORBIDDEN |

### 3.15 Dashboard Endpoint

**File:** `tests/integration/dashboard.test.ts`

| # | Test | Method | Path | Expected |
|---|------|--------|------|----------|
| 1 | Get dashboard (external user) | GET | `/api/dashboard` | 200, org's assessments only |
| 2 | Get dashboard (consultant) | GET | `/api/dashboard` | 200, all assessments |
| 3 | Get dashboard without MFA | GET | `/api/dashboard` | 403, MFA_REQUIRED |
| 4 | Progress by area accurate | GET | `/api/dashboard` | byArea totals match step responses |
| 5 | Progress by person accurate | GET | `/api/dashboard` | byPerson totals match assigned areas |

### Integration Test Summary

| Module | File | Test Count |
|--------|------|-----------|
| Auth | `tests/integration/auth.test.ts` | 9 |
| Assessments | `tests/integration/assessments.test.ts` | 18 |
| Stakeholders | `tests/integration/stakeholders.test.ts` | 8 |
| Scope Selection | `tests/integration/scope.test.ts` | 11 |
| SAP Catalog | `tests/integration/catalog.test.ts` | 13 |
| Step Responses | `tests/integration/steps.test.ts` | 14 |
| Gap Resolutions | `tests/integration/gaps.test.ts` | 11 |
| Reports | `tests/integration/reports.test.ts` | 11 |
| Decision Log | `tests/integration/decision-log.test.ts` | 8 |
| Admin | `tests/integration/admin.test.ts` | 11 |
| MFA | `tests/integration/mfa.test.ts` | 9 |
| Permissions | `tests/integration/permissions.test.ts` | 10 |
| Flow Diagrams | `tests/integration/flow-diagrams.test.ts` | 7 |
| Remaining Items | `tests/integration/remaining-items.test.ts` | 8 |
| Dashboard | `tests/integration/dashboard.test.ts` | 5 |
| **Total** | | **153** |

---

## 4. End-to-End Test Scenarios

E2E tests run via Playwright against a running Next.js development server with a seeded database. They simulate real user flows through the browser.

### 4.1 Complete Assessment Flow

**File:** `tests/e2e/full-assessment.spec.ts`

**Preconditions:** Database seeded with full SAP catalog (550 scope items, 102,261 steps).

**Steps:**

1. Navigate to `/` -- verify redirect to login page
2. Enter email, submit -- verify "magic link sent" message
3. Click magic link (simulated via direct token verification) -- verify redirect to `/assessments`
4. Click "New Assessment" -- verify assessment creation form
5. Fill in company profile (all required fields) -- submit
6. Verify redirect to `/assessments/[id]` with status "draft"
7. Navigate to Scope Selection (`/assessments/[id]/scope`)
8. Verify all 550 scope items are displayed grouped by functional area
9. Select 10 scope items (mark as YES, selected: true)
10. Verify progress counter updates (10/550)
11. Verify assessment status changed to "in_progress"
12. Reload page -- verify all 10 selections persisted
13. Navigate to Process Deep Dive (`/assessments/[id]/review`)
14. Verify sidebar shows 10 selected scope items
15. Click first scope item -- verify steps load
16. Mark first 5 steps as FIT
17. Mark step 6 as GAP -- verify note textarea appears
18. Enter gap note (min 10 chars) -- submit
19. Verify step 6 shows red GAP badge
20. Click "Mark remaining as FIT" -- confirm dialog -- verify
21. Reload page -- verify all responses persisted
22. Navigate to second scope item -- repeat marking
23. Navigate to Gap Resolution (`/assessments/[id]/gaps`)
24. Verify gap from step 6 appears
25. Select resolution type (KEY_USER_EXT)
26. Enter rationale (min 20 chars) -- submit
27. Verify effort and cost summary updates
28. Navigate to Configuration Matrix (`/assessments/[id]/config`)
29. Verify configs shown for selected scope items
30. Navigate to Reports (`/assessments/[id]/report`)
31. Click "Executive Summary" -- verify PDF download
32. Click "Scope Catalog" -- verify XLSX download
33. Click "Gap Register" -- verify XLSX download
34. Click "Audit Trail" -- verify XLSX download

**Expected duration:** < 120 seconds.

### 4.2 Multi-Stakeholder Workflow

**File:** `tests/e2e/multi-stakeholder.spec.ts`

**Steps:**

1. User A (process owner for Finance) logs in and creates assessment
2. User A adds User B (process owner for Sales) as stakeholder
3. User A selects scope items in Finance area, marks steps as FIT/GAP
4. User B logs in (via separate browser context) -- sees the same assessment
5. User B selects scope items in Sales area, marks steps
6. Verify User A can see User B's scope selections and step responses
7. Verify decision log shows both actors' actions
8. Verify progress counters reflect combined work

### 4.3 Save and Resume at Every Stage

**File:** `tests/e2e/save-resume.spec.ts`

**Steps:**

1. Create assessment -- close browser -- reopen -- verify assessment exists
2. Start scope selection -- select 5 items -- close browser -- reopen -- verify 5 selected
3. Start step review -- mark 3 steps -- close browser -- reopen -- verify 3 marked
4. Start gap resolution -- resolve 1 gap -- close browser -- reopen -- verify resolution saved
5. At each stage, verify the decision log accumulated correctly

### 4.4 Admin Intelligence Layer Management

**File:** `tests/e2e/admin-intelligence.spec.ts`

**Steps:**

1. Admin logs in -- navigates to admin dashboard
2. Creates an industry profile with 50 applicable scope items
3. Creates effort baselines for 5 scope items (low, medium, high)
4. Creates 3 extensibility patterns
5. Creates 2 adaptation patterns
6. Navigates to data verification -- runs verify -- confirms all 13 checks pass
7. Creates a new assessment using the industry profile -- verifies pre-selected scope items

### 4.5 Error Recovery

**File:** `tests/e2e/error-recovery.spec.ts`

**Steps:**

1. Navigate to non-existent assessment -- verify 404 page with helpful message
2. Attempt to access another org's assessment -- verify 403 page
3. Submit form with validation errors -- verify inline error messages
4. Simulate network disconnection during save -- verify retry mechanism
5. Attempt to generate report on draft assessment -- verify helpful error message

### 4.6 MFA Enrollment and Login

**File:** `tests/e2e/mfa-flow.spec.ts`

**Steps:**

1. External user receives magic link invitation
2. Click magic link → redirected to MFA setup page
3. QR code displayed with TOTP URI
4. Enter correct 6-digit TOTP code → MFA enrolled
5. Verify redirect to assessment or dashboard
6. Logout → login again → redirected to MFA verify page
7. Enter correct TOTP code → verified, access granted
8. Enter wrong code 5 times → rate limited
9. Wait for lockout to expire → can try again

### 4.7 Area-Locked Editing

**File:** `tests/e2e/area-locked-editing.spec.ts`

**Steps:**

1. Consultant creates assessment with 2 stakeholders:
   - User A: process_owner, assignedAreas: ["Finance"]
   - User B: process_owner, assignedAreas: ["Sales"]
2. User A logs in, navigates to review, sees Finance scope items
3. User A marks steps as FIT in Finance area → succeeds
4. User A tries to edit a Sales area step → blocked with "Area locked" message
5. User B logs in, marks Sales steps → succeeds
6. User B tries Finance area → blocked
7. Consultant logs in, edits Finance step → prompted for reason → logs PERMISSION_OVERRIDE

### E2E Test Summary

| Scenario | File | Approximate Steps |
|----------|------|-------------------|
| Full assessment flow | `tests/e2e/full-assessment.spec.ts` | 34 |
| Multi-stakeholder | `tests/e2e/multi-stakeholder.spec.ts` | 8 |
| Save/resume | `tests/e2e/save-resume.spec.ts` | 5 (x5 stages) |
| Admin intelligence | `tests/e2e/admin-intelligence.spec.ts` | 7 |
| Error recovery | `tests/e2e/error-recovery.spec.ts` | 5 |
| MFA enrollment and login | `tests/e2e/mfa-flow.spec.ts` | 9 |
| Area-locked editing | `tests/e2e/area-locked-editing.spec.ts` | 7 |
| **Total scenarios** | | **7** |

---

## 5. Performance Benchmarks

All benchmarks measured at P95 latency under the following conditions:
- PostgreSQL with 550 scope items and 102,261 process steps ingested
- Single assessment with full scope (all 550 items selected)
- 10 concurrent users

### 5.1 API Response Time Targets

| Endpoint Category | Endpoint Example | P95 Target | Max Acceptable |
|------------------|-----------------|------------|---------------|
| **Auth** | POST /api/auth/login | 200ms | 500ms |
| **Auth** | GET /api/auth/session | 50ms | 100ms |
| **Assessment CRUD** | GET /api/assessments | 100ms | 300ms |
| **Assessment CRUD** | POST /api/assessments | 150ms | 500ms |
| **Assessment CRUD** | GET /api/assessments/[id] | 100ms | 300ms |
| **Scope Selection** | GET /api/assessments/[id]/scope | 200ms | 500ms |
| **Scope Selection** | PUT /api/assessments/[id]/scope/[id] | 100ms | 300ms |
| **Scope Selection** | POST /api/assessments/[id]/scope/bulk (550 items) | 2,000ms | 5,000ms |
| **Catalog** | GET /api/catalog/scope-items (page of 50) | 100ms | 300ms |
| **Catalog** | GET /api/catalog/scope-items/[id] | 50ms | 150ms |
| **Catalog** | GET /api/catalog/scope-items/[id]/steps (page of 50) | 100ms | 300ms |
| **Catalog** | GET /api/catalog/scope-items/[id]/configs | 100ms | 300ms |
| **Catalog** | GET /api/catalog/setup-guide/[id] (PDF serve) | 500ms | 2,000ms |
| **Step Responses** | GET /api/assessments/[id]/steps (page of 50) | 100ms | 300ms |
| **Step Responses** | PUT /api/assessments/[id]/steps/[id] | 100ms | 300ms |
| **Step Responses** | POST /api/assessments/[id]/steps/bulk (2,000 steps) | 3,000ms | 8,000ms |
| **Gap Resolutions** | GET /api/assessments/[id]/gaps | 200ms | 500ms |
| **Gap Resolutions** | PUT /api/assessments/[id]/gaps/[id] | 100ms | 300ms |
| **Reports** | GET /api/assessments/[id]/report/executive-summary | 3,000ms | 10,000ms |
| **Reports** | GET /api/assessments/[id]/report/scope-catalog | 2,000ms | 8,000ms |
| **Reports** | GET /api/assessments/[id]/report/step-detail | 5,000ms | 15,000ms |
| **Reports** | GET /api/assessments/[id]/report/gap-register | 1,000ms | 5,000ms |
| **Reports** | GET /api/assessments/[id]/report/config-workbook | 2,000ms | 8,000ms |
| **Reports** | GET /api/assessments/[id]/report/audit-trail | 2,000ms | 8,000ms |
| **Decision Log** | GET /api/assessments/[id]/decision-log (page of 50) | 100ms | 300ms |
| **Admin** | GET /api/admin/verify | 5,000ms | 15,000ms |
| **Admin** | POST /api/admin/ingest (full ZIP) | 300,000ms (5min) | 600,000ms (10min) |

### 5.2 Frontend Performance Targets

| Metric | Target | Measured Via |
|--------|--------|-------------|
| Lighthouse Performance Score | >= 90 | Lighthouse CI |
| Lighthouse Accessibility Score | >= 90 | Lighthouse CI |
| First Contentful Paint | < 1.5s | Lighthouse |
| Largest Contentful Paint | < 2.5s | Lighthouse |
| Cumulative Layout Shift | < 0.1 | Lighthouse |
| Time to Interactive | < 3.0s | Lighthouse |
| Total bundle size (JS) | < 500KB gzipped | `next build` output |

### 5.3 Database Performance Targets

| Query Pattern | Target | Indices Required |
|--------------|--------|-----------------|
| Steps for a scope item (paginated) | < 10ms | `[scopeItemId, sequence]` |
| Configs for a scope item | < 5ms | `[scopeItemId]` |
| Step responses for an assessment (paginated) | < 15ms | `[assessmentId, fitStatus]` |
| Decision log for an assessment (paginated) | < 10ms | `[assessmentId, timestamp]` |
| Gap resolutions for an assessment | < 10ms | `[assessmentId, resolutionType]` |
| Scope selections for an assessment | < 10ms | `[assessmentId, selected]` |
| Full assessment progress calculation | < 50ms | Multiple indices |

---

## 6. Verification Script Specification

### 6.1 Primary Script: `pnpm verify:data`

**Script location:** `scripts/verify-data.ts`
**npm script:** `"verify:data": "tsx scripts/verify-data.ts"`

**Behavior:**

1. Connects to the database specified by `DATABASE_URL` environment variable
2. Runs all 13 integrity checks from Section 1 of this document
3. Prints formatted output as specified in Section 1
4. Exits with appropriate code (0, 1, or 2)

### 6.2 Extended Verification: `pnpm verify:all`

**Script location:** `scripts/verify-all.ts`
**npm script:** `"verify:all": "tsx scripts/verify-all.ts"`

This runs a superset of checks including data integrity plus consistency checks:

**Additional checks beyond the 13 data integrity checks:**

| # | Check | Query Logic | Expected |
|---|-------|------------|----------|
| 14 | Every scope item has at least 1 step | `SELECT id FROM scope_items WHERE id NOT IN (SELECT DISTINCT scope_item_id FROM process_steps)` | 0 rows |
| 15 | Step sequences are contiguous | For each scope item, verify sequences are 0..N with no gaps | No gaps |
| 16 | All step types are valid | `SELECT DISTINCT step_type FROM process_steps WHERE step_type NOT IN ('LOGON','ACCESS_APP','INFORMATION','DATA_ENTRY','ACTION','VERIFICATION','NAVIGATION','PROCESS_STEP')` | 0 rows |
| 17 | All config categories are valid | `SELECT DISTINCT category FROM config_activities WHERE category NOT IN ('Mandatory','Recommended','Optional','')` | 0 rows |
| 18 | Per-scope-item step count matches totalSteps | For each scope item, `COUNT(process_steps) = scope_item.totalSteps` | All match |
| 19 | No null actionTitle in process steps | `SELECT COUNT(*) FROM process_steps WHERE action_title IS NULL OR action_title = ''` | 0 |
| 20 | Setup guide scope items exist | `SELECT COUNT(*) FROM setup_guides WHERE scope_item_id NOT IN (SELECT id FROM scope_items)` | 0 |

**Output format:** Same as primary script, with additional checks appended.

### 6.3 Assessment Verification: `pnpm verify:assessment [assessmentId]`

**Script location:** `scripts/verify-assessment.ts`
**npm script:** `"verify:assessment": "tsx scripts/verify-assessment.ts"`

Verifies the consistency of a specific assessment's data:

| # | Check | Description |
|---|-------|------------|
| 1 | All step responses reference valid process steps | No orphaned step responses |
| 2 | All gap resolutions reference valid process steps | No orphaned gaps |
| 3 | Every GAP step has a GapResolution | No gaps without resolution records |
| 4 | No GapResolution without a GAP step | No phantom gap resolutions |
| 5 | Decision log is chronologically ordered | Timestamps never decrease |
| 6 | Decision log has no UPDATE or DELETE operations | Table is append-only |
| 7 | All scope selections reference valid scope items | No orphaned selections |
| 8 | Progress numbers are consistent | Computed progress matches stored counts |
| 9 | Stakeholders have unique emails | No duplicate emails within assessment |

---

## 7. Quality Gate Checklist

Each build phase has a quality gate that must be fully completed before the next phase begins. An agent building this project must verify every item in the relevant checklist and record the results.

### Phase 0: Project Scaffolding

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 0.1 | TypeScript strict mode | `pnpm typecheck:strict` | 0 errors |
| 0.2 | ESLint strict mode | `pnpm lint:strict` | 0 errors, 0 warnings |
| 0.3 | Build succeeds | `pnpm build` | Exit code 0 |
| 0.4 | Test suite runs | `pnpm test --run` | Suite runs (0 tests is OK) |
| 0.5 | Prisma schema applied | `npx prisma db push` | "Your database is now in sync" |
| 0.6 | Database verified | `npx tsx scripts/verify-db.ts` | "Database ready: X tables created" |
| 0.7 | All dependencies installed | `pnpm install --frozen-lockfile` | Exit code 0 |
| 0.8 | Folder structure matches spec | Manual review vs AGENT-PROTOCOL.md Rule 9 | All directories present |

### Phase 1: Data Ingestion

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 1.1 | Ingestion completes | `npx tsx scripts/ingest-sap-zip.ts {ZIP_PATH}` | Exit code 0 |
| 1.2 | Data integrity: all 13 checks | `pnpm verify:data` | "ALL CHECKS PASSED" |
| 1.3 | Scope items: 550 | Check 1 output | Exact match |
| 1.4 | Process steps: 102,261 | Check 2 output | Exact match |
| 1.5 | Config activities: 4,703 | Check 3 output | Exact match |
| 1.6 | Config categories correct | Check 4 output | 591/1491/2604/17 |
| 1.7 | Setup guides: 230 | Check 5 output | Exact match |
| 1.8 | General files: 162 | Check 6 output | Exact match |
| 1.9 | Solution links correct | Check 7 output | 32 scenario, 163 process |
| 1.10 | IMG activities: 4,451 | Check 8 output | Exact match |
| 1.11 | Expert configs: 13 | Check 9 output | Exact match |
| 1.12 | No orphaned data | Checks 10-11 output | Both 0 |
| 1.13 | Self-service counts correct | Check 13 output | 4690/13 |
| 1.14 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 1.15 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 1.16 | Build succeeds | `pnpm build` | Exit code 0 |

### Phase 2: Auth and Assessment Setup

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 2.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 2.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 2.3 | Tests pass | `pnpm test --run` | All pass |
| 2.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 2.5 | Auth integration tests | `pnpm test tests/integration/auth.test.ts` | 9/9 pass |
| 2.6 | Assessment integration tests | `pnpm test tests/integration/assessments.test.ts` | 18/18 pass |
| 2.7 | Stakeholder integration tests | `pnpm test tests/integration/stakeholders.test.ts` | 8/8 pass |
| 2.8 | Login page renders | Navigate to `/login` | Renders without error |
| 2.9 | Assessment list page renders | Navigate to `/assessments` | Renders without error |
| 2.10 | Assessment creation works | Create new assessment via UI | Assessment persisted |
| 2.11 | Status machine enforced | Attempt invalid transitions | All rejected |
| 2.12 | MFA integration tests | `pnpm test tests/integration/mfa.test.ts` | 9/9 pass |
| 2.13 | Permission integration tests | `pnpm test tests/integration/permissions.test.ts` | 10/10 pass |
| 2.14 | MFA setup page renders | Navigate to `/mfa/setup` | QR code displayed |
| 2.15 | MFA verify page renders | Navigate to `/mfa/verify` | Code input displayed |
| 2.16 | Dashboard renders | Navigate to `/dashboard` | Progress data shown |
| 2.17 | Concurrent session enforced | Login from two sessions | First session revoked |
| 2.18 | Area lock enforced | Process owner edits wrong area | 403 returned |

### Phase 3: Scope Selection

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 3.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 3.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 3.3 | Tests pass | `pnpm test --run` | All pass |
| 3.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 3.5 | Scope integration tests | `pnpm test tests/integration/scope.test.ts` | 11/11 pass |
| 3.6 | All 550 scope items rendered | Count items in UI | 550 |
| 3.7 | Industry filter works | Apply industry filter | List filters correctly |
| 3.8 | Step counts from database | Verify counts are not hardcoded | Match DB values |
| 3.9 | Selections persist on reload | Select, reload, verify | All selections present |
| 3.10 | Decision log captures changes | Check decision log | SCOPE_INCLUDED/EXCLUDED entries |
| 3.11 | Progress percentage correct | Select 10/550, check display | Shows 1.8% |

### Phase 4: Process Deep Dive

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 4.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 4.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 4.3 | Tests pass | `pnpm test --run` | All pass |
| 4.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 4.5 | Steps integration tests | `pnpm test tests/integration/steps.test.ts` | 14/14 pass |
| 4.6 | J60 renders all steps | Navigate to J60 (714 steps) | All visible |
| 4.7 | SAP HTML renders correctly | Check rendered instructions | HTML preserved, styled |
| 4.8 | FIT/GAP persists on reload | Mark, reload | Status preserved |
| 4.9 | GAP note required | Select GAP, submit without note | Validation error shown |
| 4.10 | Related configs displayed | Check step with config link | Config activities shown |
| 4.11 | Step navigation works | Prev/Next + keyboard arrows | Navigation functions |
| 4.12 | "Mark remaining FIT" works | Use batch operation | All unmarked steps become FIT |
| 4.13 | Decision log has entries | Check after marking steps | MARKED_FIT/MARKED_GAP entries |

### Phase 5: Gap Resolution

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 5.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 5.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 5.3 | Tests pass | `pnpm test --run` | All pass |
| 5.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 5.5 | Gaps integration tests | `pnpm test tests/integration/gaps.test.ts` | 11/11 pass |
| 5.6 | All gaps from steps shown | Compare gap list vs GAP step responses | All present |
| 5.7 | Resolution persists | Select resolution, reload | Resolution preserved |
| 5.8 | Rationale required | Submit without rationale | Validation error shown |
| 5.9 | Effort totals update | Select resolutions with effort | Totals recalculate |
| 5.10 | Decision log has entries | Check after resolutions | RESOLUTION_SELECTED entries |

### Phase 6: Configuration Matrix

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 6.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 6.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 6.3 | Tests pass | `pnpm test --run` | All pass |
| 6.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 6.5 | Correct config counts per category | Verify against database | Match |
| 6.6 | Category filtering works | Toggle Mandatory/Recommended/Optional | Filter applies |
| 6.7 | Self-service indicator correct | Check 13 non-self-service configs | Correctly flagged |
| 6.8 | Include/exclude persists | Toggle, reload | Decision preserved |
| 6.9 | Setup guide PDFs open | Click link | PDF renders in viewer |

### Phase 7: Report Generation

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 7.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 7.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 7.3 | Tests pass | `pnpm test --run` | All pass |
| 7.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 7.5 | Reports integration tests | `pnpm test tests/integration/reports.test.ts` | 11/11 pass |
| 7.6 | Executive summary PDF opens | Download and open | Valid PDF with content |
| 7.7 | Scope catalog XLSX opens | Download and open in Excel | Correct columns and data |
| 7.8 | Step detail XLSX opens | Download and open | All step responses included |
| 7.9 | Gap register XLSX opens | Download and open | All gaps included |
| 7.10 | Config workbook XLSX opens | Download and open | All configs included |
| 7.11 | Audit trail XLSX opens | Download and open | All decision log entries |
| 7.12 | Sign-off captures fields | Complete sign-off | Name, email, timestamp stored |
| 7.13 | Reports blocked on draft | Attempt on draft assessment | 400 error with message |
| 7.14 | Flow diagrams integration tests | `pnpm test tests/integration/flow-diagrams.test.ts` | 7/7 pass |
| 7.15 | Remaining items integration tests | `pnpm test tests/integration/remaining-items.test.ts` | 8/8 pass |
| 7.16 | Dashboard integration tests | `pnpm test tests/integration/dashboard.test.ts` | 5/5 pass |
| 7.17 | Process Flow Atlas PDF generates | Download flow atlas | Valid PDF with colored nodes |
| 7.18 | Remaining Items Register XLSX generates | Download register | Valid XLSX with all items |

### Phase 8: Intelligence Layer Admin

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 8.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 8.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 8.3 | Tests pass | `pnpm test --run` | All pass |
| 8.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 8.5 | Admin integration tests | `pnpm test tests/integration/admin.test.ts` | 11/11 pass |
| 8.6 | CRUD for all 4 Intelligence tables | Create, read, update, delete each | All operations work |
| 8.7 | Industry profile affects scope selection | Create profile, start assessment | Pre-selection applied |
| 8.8 | Effort baselines appear in reports | Create baselines, generate report | Values in report |
| 8.9 | Non-admin access blocked | Login as client, access admin | 403 on all endpoints |

### Phase 9: Polish and Production Readiness

| # | Gate | Command/Check | Pass Criteria |
|---|------|--------------|---------------|
| 9.1 | TypeScript strict | `pnpm typecheck:strict` | 0 errors |
| 9.2 | ESLint strict | `pnpm lint:strict` | 0 warnings |
| 9.3 | ALL tests pass | `pnpm test --run` | 149+ unit, 153+ integration |
| 9.4 | Build succeeds | `pnpm build` | Exit code 0 |
| 9.5 | Data integrity | `pnpm verify:data` | ALL 13 CHECKS PASSED |
| 9.6 | Extended verification | `pnpm verify:all` | ALL 20 CHECKS PASSED |
| 9.7 | E2E: full assessment flow | Playwright test | All steps pass |
| 9.8 | E2E: multi-stakeholder | Playwright test | All steps pass |
| 9.9 | E2E: save/resume | Playwright test | All stages pass |
| 9.10 | Lighthouse Performance | >= 90 | Score meets target |
| 9.11 | Lighthouse Accessibility | >= 90 | Score meets target |
| 9.12 | Bundle size | `next build` output | < 500KB gzipped JS |
| 9.13 | Loading states | Manual check all data-loading pages | Skeleton screens present |
| 9.14 | Error states | Manual check error scenarios | Error boundaries with retry |
| 9.15 | Empty states | Manual check empty data scenarios | Helpful messages shown |
| 9.16 | Keyboard navigation | Tab through all interactive elements | Logical tab order |
| 9.17 | No console errors | Open browser console | 0 errors in normal flow |
| 9.18 | Auth on all routes | Access protected routes without session | All redirect to login |
| 9.19 | CSRF protection | Verify anti-CSRF tokens | Present on all mutations |
| 9.20 | Rate limiting | Send 61 requests in 1 minute | 429 on 61st |
| 9.21 | E2E: MFA flow | Playwright test | All steps pass |
| 9.22 | E2E: Area-locked editing | Playwright test | All steps pass |

---

## Appendix A: Test Execution Commands

```bash
# Run all unit tests
pnpm test --run

# Run unit tests in watch mode
pnpm test

# Run specific unit test file
pnpm test src/lib/step-type.test.ts

# Run integration tests (requires test database)
pnpm test:integration

# Run specific integration test file
pnpm test:integration tests/integration/assessments.test.ts

# Run E2E tests (requires running dev server)
pnpm test:e2e

# Run specific E2E test
pnpm test:e2e tests/e2e/full-assessment.spec.ts

# Run data verification
pnpm verify:data

# Run extended verification
pnpm verify:all

# Run assessment verification
pnpm verify:assessment <assessmentId>

# Run all quality checks (CI pipeline)
pnpm typecheck:strict && pnpm lint:strict && pnpm test --run && pnpm build && pnpm verify:data
```

## Appendix B: npm Scripts Reference

```json
{
  "scripts": {
    "dev": "next dev --port 3003",
    "build": "next build",
    "start": "next start --port 3003",
    "lint:strict": "next lint --max-warnings 0",
    "typecheck:strict": "tsc --noEmit --strict",
    "test": "vitest",
    "test:integration": "vitest --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "verify:data": "tsx scripts/verify-data.ts",
    "verify:all": "tsx scripts/verify-all.ts",
    "verify:assessment": "tsx scripts/verify-assessment.ts"
  }
}
```
