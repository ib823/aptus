# V2 Enhancement Test Specification — Exhaustive Strategy

> **Philosophy:** Every feature can fail. Every combination of features can fail differently. Every role experiences every failure differently on every device. This test specification enumerates ALL testable dimensions, their permutations, and the exact test cases needed to catch failures that range from obvious crashes to subtle data corruption that only surfaces 6 months after sign-off.

---

# PART 1: TEST ARCHITECTURE

## 1.1 Testing Stack

| Layer | Tool | Purpose | Run Frequency |
|-------|------|---------|---------------|
| Unit | Vitest + React Testing Library | Pure functions, utilities, parsers, state machines, validators, computed values | Every commit |
| Component | Vitest + RTL | React component rendering, props, state, user interaction simulation | Every commit |
| Integration | Vitest + Prisma (test DB) | API routes, database operations, service functions, multi-model transactions | Every commit |
| E2E | Playwright (Chromium + Firefox + WebKit) | Full user journeys, multi-role scenarios, cross-browser | Every PR + nightly |
| E2E Mobile | Playwright (mobile viewports) | Device-tier UX, touch interactions, PWA behavior | Every PR + nightly |
| Performance | k6 or Artillery | Load testing, concurrent users, WebSocket scaling | Weekly + pre-release |
| Security | Custom + OWASP ZAP | Auth bypass, privilege escalation, injection, CSRF, XSS | Weekly + pre-release |
| Accessibility | axe-core + Playwright | WCAG 2.1 AA compliance on all views | Every PR |
| Visual Regression | Playwright screenshots | Layout breakage across viewports and themes | Every PR |
| Offline/PWA | Playwright + service worker mocking | Offline behavior, sync-on-reconnect, conflict resolution | Every PR |
| Cryptographic | Vitest | Hash integrity, certificate generation, tamper detection | Every commit |
| Contract | Vitest | API request/response schema validation against Zod schemas | Every commit |

## 1.2 Test Database Strategy

```
Test DB: Separate PostgreSQL instance (or SQLite for unit speed)
Seeding: Deterministic seed data covering all permutations:
  - 3 organizations (Trial, Professional, Enterprise)
  - 11 users (one per role)
  - 4 assessments at different lifecycle states
  - 1 assessment with full data (all registers, all steps classified, gaps resolved)
  - 1 assessment at PENDING_SIGN_OFF with all validations ready
  - 1 SIGNED_OFF assessment with snapshots
  - 1 assessment with Phase 2 clone
  
Isolation: Each test suite gets a transaction-wrapped DB that rolls back after suite completes
Factories: Typed factory functions for every model (createOrganization, createUser, createAssessment, etc.)
```

## 1.3 Test Dimensions Matrix

The V2 system has these orthogonal dimensions. Every feature must be tested across ALL relevant dimension combinations:

| Dimension | Values | Count |
|-----------|--------|-------|
| Platform Role | partner_lead, consultant, project_manager, solution_architect, process_owner, it_lead, data_migration_lead, change_manager, executive, viewer, external_auditor | 11 |
| Auth Method | SSO (SAML), SSO (OIDC), Magic Link, Magic Link + TOTP, Time-Limited Link, SCIM-provisioned | 6 |
| Subscription Plan | Trial, Starter, Professional, Enterprise, Trial_Expired, Past_Due, Canceled | 7 |
| Assessment State | SETUP, SCOPE_IN_PROGRESS, SCOPE_LOCKED, PROCESS_REVIEW_IN_PROGRESS, GAP_RESOLUTION_IN_PROGRESS, INTEGRATION, DATA_MIGRATION, OCM, VALIDATION_IN_PROGRESS, PENDING_SIGN_OFF, SIGNED_OFF, HANDED_OFF, ARCHIVED, REASSESSMENT_NEEDED | 14 |
| Device Tier | Desktop (1920×1080), Tablet (1024×768), Mobile (390×844) | 3 |
| Connectivity | Online, Offline, Reconnecting (flaky) | 3 |
| Org Type | Partner, Direct Client | 2 |
| Step Category | BUSINESS_PROCESS, CONFIGURATION, REPORTING, REFERENCE, SYSTEM_ACCESS, TEST_INFO, MASTER_DATA | 7 |
| Sign-Off Layer | Area PO, Technical, Cross-Functional, Executive, Partner Countersign | 5 |

**Full permutation count:** 11 × 6 × 7 × 14 × 3 × 3 × 2 × 7 × 5 = 27,284,040

Obviously not all combinations are meaningful. The test strategy uses **priority-weighted combinatorial coverage**:
- **P0 (must pass for release):** Primary role × primary auth × active plan × each assessment state × desktop = ~154 tests
- **P1 (must pass for PR merge):** All roles × primary auth × active plan × key states × desktop + mobile = ~462 tests
- **P2 (nightly regression):** All roles × all auth × all plans × all states × all devices = ~2,310 tests (sampled)
- **P3 (pre-release full sweep):** Maximum coverage with intelligent combinatorial sampling = ~5,000+ tests

---

# PART 2: UNIT TESTS

## 2.1 State Machine Tests

### Assessment Lifecycle State Machine

```
TOTAL TESTS: 14 states × 14 possible transitions = 196 test cases (most are invalid = expect rejection)

VALID TRANSITIONS (must succeed):
  SETUP → SCOPE_IN_PROGRESS
  SCOPE_IN_PROGRESS → SCOPE_LOCKED
  SCOPE_LOCKED → PROCESS_REVIEW_IN_PROGRESS
  PROCESS_REVIEW_IN_PROGRESS → GAP_RESOLUTION_IN_PROGRESS
  GAP_RESOLUTION_IN_PROGRESS → INTEGRATION (parallel)
  GAP_RESOLUTION_IN_PROGRESS → DATA_MIGRATION (parallel)
  GAP_RESOLUTION_IN_PROGRESS → OCM (parallel)
  [INTEGRATION + DATA_MIGRATION + OCM all complete] → VALIDATION_IN_PROGRESS
  VALIDATION_IN_PROGRESS → PENDING_SIGN_OFF
  PENDING_SIGN_OFF → SIGNED_OFF
  SIGNED_OFF → HANDED_OFF
  HANDED_OFF → ARCHIVED
  SIGNED_OFF → REASSESSMENT_NEEDED
  HANDED_OFF → REASSESSMENT_NEEDED
  REASSESSMENT_NEEDED → PROCESS_REVIEW_IN_PROGRESS (re-open)

INVALID TRANSITIONS (must reject with specific error):
  SETUP → SIGNED_OFF (skip phases)
  SCOPE_IN_PROGRESS → SETUP (backward without change request)
  SIGNED_OFF → SETUP (backward)
  ARCHIVED → any state except REASSESSMENT_NEEDED
  PENDING_SIGN_OFF → SCOPE_IN_PROGRESS (backward skip)
  ... (all 181 remaining invalid combinations)

EDGE CASES:
  T-SM-001: Transition with incomplete prerequisites (e.g., SCOPE_LOCKED but 0 items scoped)
  T-SM-002: Parallel workstream completion — only last completing stream triggers VALIDATION transition
  T-SM-003: Parallel workstream — one completes, one fails, one pending — no transition
  T-SM-004: REASSESSMENT_NEEDED from SIGNED_OFF — requires change request
  T-SM-005: REASSESSMENT_NEEDED from HANDED_OFF — requires change request
  T-SM-006: Race condition — two users trigger transition simultaneously
  T-SM-007: Transition during offline mode — queued and replayed on reconnect
  T-SM-008: Transition notification — all relevant roles notified on state change
```

### Subscription State Machine

```
VALID TRANSITIONS:
  TRIALING → ACTIVE (upgrade)
  TRIALING → TRIAL_EXPIRED (timeout)
  ACTIVE → PAST_DUE (payment failure)
  ACTIVE → CANCELING → CANCELED
  PAST_DUE → ACTIVE (payment success)
  PAST_DUE → CANCELED (final failure)
  CANCELED → ACTIVE (reactivate within 180 days)
  TRIAL_EXPIRED → ACTIVE (late upgrade within 30 days)

INVALID:
  TRIAL_EXPIRED → TRIALING (restart trial)
  CANCELED → TRIALING (restart trial)
  ACTIVE → TRIALING (downgrade to trial)

EDGE CASES:
  T-SUB-001: Trial expires at exactly midnight UTC — timezone boundary
  T-SUB-002: Payment fails on day 1 of billing cycle vs day 28
  T-SUB-003: Upgrade from Trial to Enterprise mid-assessment (all features unlock immediately)
  T-SUB-004: Downgrade from Enterprise to Starter with 15 active assessments (limit is 3) — oldest become read-only
  T-SUB-005: Cancel during active workshop session — what happens to live users?
  T-SUB-006: Reactivate after 179 days (just within window) vs 181 days (expired)
  T-SUB-007: Stripe webhook retry — idempotent handling of duplicate events
  T-SUB-008: Stripe webhook out of order — subscription.updated arrives before subscription.created
  T-SUB-009: Currency change on plan upgrade
  T-SUB-010: Metered usage billing — assessment created and archived within same billing period
```

### Sign-Off State Machine

```
VALID TRANSITIONS:
  NOT_STARTED → AREA_VALIDATION_IN_PROGRESS
  AREA_VALIDATION_IN_PROGRESS → AREA_VALIDATION_COMPLETE
  AREA_VALIDATION_COMPLETE → TECHNICAL_VALIDATION_IN_PROGRESS
  TECHNICAL_VALIDATION_IN_PROGRESS → TECHNICAL_VALIDATION_COMPLETE
  TECHNICAL_VALIDATION_COMPLETE → CROSS_FUNCTIONAL_IN_PROGRESS
  CROSS_FUNCTIONAL_IN_PROGRESS → CROSS_FUNCTIONAL_COMPLETE
  CROSS_FUNCTIONAL_COMPLETE → PENDING_EXECUTIVE
  PENDING_EXECUTIVE → EXECUTIVE_SIGNED
  EXECUTIVE_SIGNED → PENDING_PARTNER
  PENDING_PARTNER → FULLY_SIGNED_OFF
  Any layer → REJECTED (with comments)
  REJECTED → re-enter at rejected layer

EDGE CASES:
  T-SO-001: Executive declines — assessment returns to cross-functional with comments
  T-SO-002: Partner declines after executive signed — executive signature preserved or invalidated?
  T-SO-003: PO validates area, then area data is modified before technical validation — invalidate PO validation
  T-SO-004: All POs validated except one who left the company — replacement PO must re-validate
  T-SO-005: Sign-off initiated but assessment data modified via API backdoor — hash mismatch detection
  T-SO-006: Concurrent sign-off attempts — two executives try to sign simultaneously
  T-SO-007: Sign-off with expired user session — must re-authenticate, not auto-sign
  T-SO-008: Sign-off on mobile device — touch signature? Checkbox confirmation?
  T-SO-009: Snapshot created but Prisma transaction fails mid-write — rollback integrity
  T-SO-010: Sign-off certificate PDF generation fails — sign-off status must NOT advance
```

## 2.2 Permission Matrix Tests

Every API route must be tested against ALL 11 roles. This produces a permission truth table:

```
PATTERN: For each API operation, test:
  - Authorized role gets 200/201
  - Unauthorized role gets 403
  - Unauthenticated request gets 401
  - Expired session gets 401
  - Valid role but wrong assessment gets 403 (cross-tenant isolation)
  - Valid role but subscription expired gets 403 with specific error code

EXAMPLE: PATCH /api/assessments/[id]/steps/[stepId]/response
  ✅ consultant → 200
  ✅ project_manager → 200
  ✅ solution_architect → 200
  ✅ process_owner (own area) → 200
  ❌ process_owner (other area) → 403
  ❌ executive → 403
  ❌ viewer → 403
  ❌ external_auditor → 403
  ❌ it_lead → 403 (unless integration-related field)
  ❌ data_migration_lead → 403
  ❌ change_manager → 403
  ❌ unauthenticated → 401
  ❌ consultant from different org → 403 (cross-tenant)
  ❌ consultant on expired trial → 403 (subscription)
```

### Full Permission Matrix (representative — generate for ALL routes)

```
| Operation | P-LEAD | CONSLT | PM | SOL-AR | PO | IT | DM | OCM | EXEC | VIEW | AUDIT |
|-----------|--------|--------|----|--------|----|----|----|----|------|------|-------|
| Create assessment | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete assessment | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit company profile | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Classify step (own area) | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Classify step (other area) | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Override classification | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create gap | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Add integration point | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Add DM object | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add OCM impact | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Validate area (sign-off) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Executive sign-off | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Partner countersign | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Export to ALM | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View reports | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Download data export | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage team (partner admin) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Configure SSO | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage subscription | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create change request | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve change request | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Clone assessment (Phase 2) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Add comment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| @mention user | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Acquire editing lock | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

TOTAL PERMISSION TESTS: ~25 operations × 11 roles × 3 variants (authorized/unauthorized/cross-tenant) = ~825 test cases
```

## 2.3 Content Parser Tests (Addendum 3)

```
STEP TYPE CLASSIFICATION:
  T-STC-001: Step with tag "Information" → StepCategory.REFERENCE
  T-STC-002: Step with tag "LogOn" → StepCategory.SYSTEM_ACCESS
  T-STC-003: Step with tag "LogOff" → StepCategory.SYSTEM_ACCESS
  T-STC-004: Step with tag "TestProcedure" → StepCategory.TEST_INFO
  T-STC-005: Step with tag "BusinessProcess" → StepCategory.BUSINESS_PROCESS
  T-STC-006: Step with tag "Configuration" → StepCategory.CONFIGURATION
  T-STC-007: Step with tag "Reporting" → StepCategory.REPORTING
  T-STC-008: Step with tag "MasterData" → StepCategory.MASTER_DATA
  T-STC-009: Step with unknown/empty tag → StepCategory.BUSINESS_PROCESS (default)
  T-STC-010: Step with null tag → StepCategory.BUSINESS_PROCESS (default)
  T-STC-011: Step with mixed case tag "INFORMATION" → StepCategory.REFERENCE (case-insensitive)

CONTENT SECTION PARSING:
  T-CSP-001: Description with "Purpose\n" marker → extracts Purpose section
  T-CSP-002: Description with "Overview\n" marker → extracts as Purpose
  T-CSP-003: Description with "Prerequisites\n" marker → extracts collapsed section
  T-CSP-004: Description with "System Access\n" followed by table → extracts SYSTEM_ACCESS section with parsed table
  T-CSP-005: Description with "Roles\n" followed by role template table → extracts ROLES section
  T-CSP-006: Description with "Master Data\n" → extracts MASTER_DATA section
  T-CSP-007: Description with NO recognized markers → entire text goes to processContent
  T-CSP-008: Description with markers in unexpected order → still parses correctly
  T-CSP-009: Description with nested tables → tables parsed with correct column alignment
  T-CSP-010: Description with HTML entities → decoded correctly
  T-CSP-011: Description with unicode characters (CJK, Arabic, emoji) → preserved
  T-CSP-012: Description that is empty string → no crash, returns empty ParsedStepContent
  T-CSP-013: Description that is null → no crash, returns empty ParsedStepContent
  T-CSP-014: Description > 50,000 characters → performance within 50ms
  T-CSP-015: Real SAP Cash Journal step 1 content (from screenshots) → correctly identifies Purpose, Prerequisites, System Access, Roles, Master Data sections

STEP GROUPING:
  T-SGR-001: 56 steps with mixed tags → groups into Reference, System Access, and activity-based groups
  T-SGR-002: All steps same activity → single group
  T-SGR-003: Steps with null activity → grouped as "Process"
  T-SGR-004: Classifiable count per group accurate
  T-SGR-005: Non-classifiable steps excluded from progress count
  T-SGR-006: Group ordering matches step sequence (not alphabetical)
  T-SGR-007: Single step → single group
  T-SGR-008: Zero steps → empty groups array, no crash
```

## 2.4 Cryptographic Integrity Tests

```
SNAPSHOT HASHING:
  T-HASH-001: Same assessment data → same SHA-256 hash (deterministic)
  T-HASH-002: One field changed → different hash
  T-HASH-003: Field order changed in JSON → SAME hash (canonical form)
  T-HASH-004: Whitespace differences → SAME hash (canonical form)
  T-HASH-005: Unicode normalization → consistent hashing
  T-HASH-006: Very large assessment (10,000 steps) → hash computes in < 1 second
  T-HASH-007: Hash of snapshot matches hash in SignatureRecord
  T-HASH-008: After sign-off, assessment data modified → hash mismatch detected

CERTIFICATE GENERATION:
  T-CERT-001: Certificate PDF generated with all required fields
  T-CERT-002: Certificate hash matches SHA-256 of generated PDF bytes
  T-CERT-003: Verification URL resolves and confirms integrity
  T-CERT-004: Tampered certificate → verification URL returns INVALID
  T-CERT-005: Certificate contains all signer details (name, email, role, org, IP, timestamp)
  T-CERT-006: Certificate timestamp is server-generated (not client-submitted)
  T-CERT-007: Certificate with very long signer names → no PDF layout overflow
  T-CERT-008: Certificate with special characters in signer name → rendered correctly
  T-CERT-009: Verification after assessment data deletion (GDPR) → returns "Assessment deleted" not 500
```

## 2.5 Stripe Integration Tests

```
WEBHOOK HANDLING:
  T-STRIPE-001: customer.subscription.created → org status → ACTIVE
  T-STRIPE-002: customer.subscription.updated (plan change) → plan tier updated, limits recalculated
  T-STRIPE-003: customer.subscription.deleted → status → CANCELED
  T-STRIPE-004: invoice.payment_failed → status → PAST_DUE
  T-STRIPE-005: invoice.paid (after past_due) → status → ACTIVE
  T-STRIPE-006: Duplicate webhook (same event ID) → idempotent, no double processing
  T-STRIPE-007: Webhook with invalid signature → 400, not processed
  T-STRIPE-008: Webhook with unknown event type → 200 (acknowledge, don't crash)
  T-STRIPE-009: Webhook timeout (processing > 30s) → queue for async processing
  T-STRIPE-010: Meter event for assessment_created → usage recorded in Stripe
  T-STRIPE-011: Meter event for assessment_archived → decrements active count
  T-STRIPE-012: Stripe API down during meter event → retry with exponential backoff
  T-STRIPE-013: Subscription upgrade mid-billing-cycle → prorated charge correct

PLAN ENFORCEMENT:
  T-PLAN-001: Starter plan, create 4th assessment → 403 with "Plan limit reached"
  T-PLAN-002: Professional plan, invite 31st partner user → 403 with "Seat limit reached"
  T-PLAN-003: Enterprise plan, unlimited assessments → no limit enforcement
  T-PLAN-004: Trial plan, all Professional features accessible → 200
  T-PLAN-005: Trial expired, create assessment → 403 with "Trial expired"
  T-PLAN-006: Trial expired, read existing assessment → 200 (read-only)
  T-PLAN-007: Past due, create assessment → 200 for first 14 days, then 403
  T-PLAN-008: Client stakeholders never count toward seat limit → verified
  T-PLAN-009: Downgrade with over-limit assessments → oldest become read-only, not deleted
```

## 2.6 Data Validation Tests (Zod Schema)

```
FOR EVERY API ENDPOINT, test Zod schema with:
  T-ZOD-001: Valid payload → passes validation
  T-ZOD-002: Missing required field → specific error message identifying field
  T-ZOD-003: Wrong type (string instead of number) → type error
  T-ZOD-004: Extra unknown fields → stripped (strict mode) or ignored
  T-ZOD-005: Empty string for required string → fails (min length)
  T-ZOD-006: String exceeding max length → fails
  T-ZOD-007: Negative number for cost/count fields → fails
  T-ZOD-008: Invalid enum value → fails with allowed values listed
  T-ZOD-009: SQL injection in string field → sanitized / passes validation but doesn't execute
  T-ZOD-010: XSS payload in string field → sanitized before storage
  T-ZOD-011: Unicode normalization attacks → handled
  T-ZOD-012: Very large payload (>10MB) → rejected before parsing
  T-ZOD-013: Deeply nested JSON → rejected at reasonable depth limit
  T-ZOD-014: Date field with invalid format → fails
  T-ZOD-015: Date field with future date where past required → fails
```

---

# PART 3: INTEGRATION TESTS

## 3.1 Multi-Tenant Isolation

```
T-ISO-001: Org A consultant cannot see Org B assessments via API
T-ISO-002: Org A consultant cannot see Org B assessments via direct URL
T-ISO-003: Org A consultant cannot modify Org B assessment via API with known ID
T-ISO-004: Cross-org user enumeration via API → not possible (no user list endpoint for other orgs)
T-ISO-005: SCIM provisioning for Org A cannot affect Org B users
T-ISO-006: SSO for Org A cannot authenticate as Org B user
T-ISO-007: Assessment search/filter never returns cross-org results
T-ISO-008: Reporting/analytics never includes cross-org data
T-ISO-009: Benchmarking uses anonymized aggregates only — no identifiable cross-org data
T-ISO-010: WebSocket presence channel scoped to assessment — no cross-assessment leakage
T-ISO-011: Activity feed scoped to assessment — no cross-assessment events
T-ISO-012: Template marketplace scoped to organization — no cross-org templates visible
T-ISO-013: Partner admin cannot see another partner's team members
T-ISO-014: Client stakeholder on Assessment A cannot see Assessment B for same client
T-ISO-015: Viewer with time-limited link for Assessment A → 403 on Assessment B
```

## 3.2 Assessment CRUD Full Cycle

```
T-CRUD-001: Create assessment → verify all related records created (company profile, empty registers)
T-CRUD-002: Create assessment → verify Stripe meter event fired
T-CRUD-003: Update company profile → verify all fields persisted
T-CRUD-004: Add scope items → verify dependent data structures initialized
T-CRUD-005: Classify step → verify StepResponse created/updated with all fields
T-CRUD-006: Create gap → verify linked to step, cost fields initialized
T-CRUD-007: Resolve gap → verify resolution type, cost, affected fields updated
T-CRUD-008: Add integration point → verify all IntegrationPoint fields
T-CRUD-009: Add data migration object → verify all DataMigrationObject fields
T-CRUD-010: Add OCM impact → verify all OcmImpact fields
T-CRUD-011: Delete gap → verify cascade (resolution deleted, step reference updated)
T-CRUD-012: Delete assessment → verify all related records deleted (cascade)
T-CRUD-013: Delete assessment → verify Stripe meter event fired (decrement)
T-CRUD-014: Archive assessment → verify status, access becomes read-only
T-CRUD-015: Full lifecycle: create → scope → classify → gap → resolve → validate → sign-off → handoff → archive
```

## 3.3 Real-Time Collaboration Integration

```
EDITING LOCKS:
  T-LOCK-001: User A acquires lock on step → User B sees lock indicator
  T-LOCK-002: User A acquires lock → User B attempts edit → 409 Conflict with lock holder info
  T-LOCK-003: Lock expires after 5 minutes → User B can now acquire
  T-LOCK-004: User A releases lock explicitly → User B can acquire immediately
  T-LOCK-005: User A disconnects (browser close) → lock released after heartbeat timeout
  T-LOCK-006: User A acquires lock, then goes offline → lock released after timeout
  T-LOCK-007: Two users attempt simultaneous lock acquisition → exactly one succeeds (no race condition)
  T-LOCK-008: Lock on step → lock does NOT block viewing by other users
  T-LOCK-009: Lock on step in Area A → does NOT block editing of step in Area B
  T-LOCK-010: 100 concurrent lock requests → no deadlocks, all resolve within 2 seconds

PRESENCE:
  T-PRES-001: User connects → appears as ONLINE to other assessment members
  T-PRES-002: User idle 5 minutes → appears as IDLE
  T-PRES-003: User disconnects → appears as OFFLINE within 30 seconds
  T-PRES-004: User on mobile → mobile icon shown in presence list
  T-PRES-005: Viewer sees presence but is not shown in presence list (read-only)
  T-PRES-006: 50 concurrent users in same assessment → presence list renders without lag
  T-PRES-007: User switches between two assessments → presence updates in both

COMMENTS:
  T-CMT-001: Create comment on step → visible to all roles with comment permission
  T-CMT-002: Reply to comment → creates threaded response
  T-CMT-003: @mention user → notification generated for mentioned user
  T-CMT-004: @mention user not on assessment → mention rendered but no notification
  T-CMT-005: Delete comment → only author or partner_lead can delete
  T-CMT-006: Edit comment → only author can edit, edit history preserved
  T-CMT-007: Comment with markdown → rendered correctly
  T-CMT-008: Comment with XSS payload → sanitized
  T-CMT-009: Comment on locked step → allowed (comments don't require edit lock)
  T-CMT-010: 1000 comments on single step → paginated, loads within 2 seconds

CONFLICT DETECTION:
  T-CONF-001: Finance PO classifies step affecting Procurement → conflict flagged
  T-CONF-002: Two POs classify same cross-functional step differently → conflict created
  T-CONF-003: Consultant resolves conflict → both POs notified
  T-CONF-004: Unresolved conflicts block sign-off progression → verified
  T-CONF-005: Conflict on archived assessment → not possible (read-only)
```

## 3.4 ALM Export Integration

```
SAP CLOUD ALM:
  T-ALM-001: Export creates Cloud ALM project with correct name and metadata
  T-ALM-002: Each gap → Cloud ALM requirement with description, priority, cost
  T-ALM-003: Each gap resolution → Cloud ALM task (user story) under requirement
  T-ALM-004: Integration points → Cloud ALM requirements tagged INTEGRATION
  T-ALM-005: DM objects → Cloud ALM requirements tagged DATA_MIGRATION
  T-ALM-006: Sign-off certificate → Cloud ALM document attachment
  T-ALM-007: Report PDFs → Cloud ALM document attachments
  T-ALM-008: Cloud ALM API rate limit hit → retry with backoff, partial export recoverable
  T-ALM-009: Cloud ALM auth token expired mid-export → refresh and continue
  T-ALM-010: Assessment with 500 gaps → bulk export within 5 minutes

JIRA:
  T-JIRA-001: Export creates Jira project with correct key
  T-JIRA-002: Each functional area → Jira epic
  T-JIRA-003: Each gap → Jira story under correct epic
  T-JIRA-004: Resolution tasks → Jira sub-tasks
  T-JIRA-005: Custom field mappings applied correctly
  T-JIRA-006: Jira Cloud API pagination for large exports → all items created
  T-JIRA-007: Duplicate export to same project → items updated, not duplicated
  T-JIRA-008: Jira API down → graceful failure with retry option

AZURE DEVOPS:
  T-ADO-001: Export creates project with area paths matching functional areas
  T-ADO-002: Gaps → work items (User Story)
  T-ADO-003: Resolution tasks → work items (Task)

CONFLUENCE:
  T-CONF-EXP-001: Export creates page hierarchy matching assessment structure
  T-CONF-EXP-002: All report content rendered in Confluence markup
```

---

# PART 4: END-TO-END TESTS (Playwright)

## 4.1 Complete User Journeys

### Journey 1: Partner Self-Service — First Assessment to Sign-Off

```
T-E2E-J01: Full partner journey
  Step 1: Navigate to signup page
  Step 2: Fill registration form (name, email, company, country)
  Step 3: Receive email verification → click link
  Step 4: Land on onboarding wizard
  Step 5: Upload logo → verify preview
  Step 6: Skip team invite (for now)
  Step 7: Explore sample assessment → verify demo data loaded
  Step 8: Create real assessment → fill company profile
  Step 9: Select 3 functional areas → scope 20 items
  Step 10: Lock scope → verify transition
  Step 11: Navigate to first process step → verify decision-first layout
  Step 12: Classify 5 steps (mix of FIT, GAP, CONFIGURE, NOT_APPLICABLE)
  Step 13: Skip reference step → verify compact rendering and not counted in progress
  Step 14: Create gap → fill description, cost estimate
  Step 15: Resolve gap → set resolution type
  Step 16: Add integration point
  Step 17: Add data migration object
  Step 18: Transition through lifecycle to PENDING_SIGN_OFF
  Step 19: Initiate sign-off → area validation
  Step 20: Complete executive sign-off
  Step 21: Complete partner countersign
  Step 22: Verify certificate PDF generated
  Step 23: Export to Jira → verify items created
  Step 24: Archive assessment
  TOTAL: ~45 minutes automated runtime
  DEVICES: Desktop + tablet viewport
```

### Journey 2: Multi-Role Workshop

```
T-E2E-J02: Workshop with 5 concurrent users
  Context: Consultant (facilitator), 3 Process Owners, Executive (observer)
  Step 1: Consultant creates workshop session
  Step 2: Generate QR code → 3 POs scan and join (simulated with direct URL)
  Step 3: Executive joins via direct link
  Step 4: Consultant enables Workshop Mode → synchronized navigation
  Step 5: Consultant navigates to Step 1 → all 4 other users see Step 1
  Step 6: Consultant triggers poll → "How does your company handle this?"
  Step 7: 3 POs vote (FIT, CONFIGURE, GAP) → results shown live
  Step 8: Consultant makes final classification → poll closed
  Step 9: Two POs attempt to edit same step simultaneously → lock acquired by first, second sees lock
  Step 10: PO adds comment with @mention of consultant → consultant sees notification
  Step 11: Cross-functional conflict detected → consultant resolves
  Step 12: Workshop completed → auto-generated minutes
  Step 13: Executive reviews minutes
  DEVICES: Consultant on tablet, POs on mobile + desktop mix, Executive on desktop
```

### Journey 3: Client Invitation Flow

```
T-E2E-J03: Client stakeholder invited and onboarded
  Step 1: Consultant invites Finance Director (executive role)
  Step 2: Email sent with magic link
  Step 3: Finance Director clicks link → lands on executive onboarding (<1 min)
  Step 4: Sees assessment summary, their action items
  Step 5: Navigates to their area → classifies 3 steps
  Step 6: Sees only their area, not other POs' areas (area isolation)
  Step 7: Consultant invites IT Lead with TOTP requirement
  Step 8: IT Lead clicks magic link → prompted for TOTP setup
  Step 9: IT Lead accesses integration register → full CRUD
  Step 10: IT Lead attempts to access gap register → read-only
```

### Journey 4: Trial-to-Paid Upgrade

```
T-E2E-J04: Trial lifecycle
  Step 1: Sign up → trial starts (verify trial banner, 14 days)
  Step 2: Create 2 assessments → within trial limit
  Step 3: Advance clock to day 10 → verify email reminder sent
  Step 4: Advance clock to day 14 → verify trial expired
  Step 5: Attempt to create assessment → blocked with upgrade CTA
  Step 6: Existing assessments → read-only
  Step 7: Click upgrade → Stripe Checkout opens
  Step 8: Complete payment → status ACTIVE, all features unlocked
  Step 9: Create new assessment → success
  Step 10: Verify metered usage event recorded
```

### Journey 5: Assessment Phase 2 Carry-Forward

```
T-E2E-J05: Phase 2 cloning
  Step 1: Start with signed-off Phase 1 assessment (Finance, Procurement)
  Step 2: Click "Create Phase 2 Assessment"
  Step 3: Verify company profile carried forward
  Step 4: Verify integration register shown as read-only reference
  Step 5: Select new scope items (Manufacturing, Warehouse)
  Step 6: Verify deferred items from Phase 1 highlighted
  Step 7: Verify cross-phase dependency detection ("MM-003 depends on Phase 1 INT-007")
  Step 8: Complete Phase 2 assessment → new sign-off
  Step 9: View cross-phase analytics → compare Phase 1 vs Phase 2 metrics
```

### Journey 6: Post-Sign-Off Change Control

```
T-E2E-J06: Change request workflow
  Step 1: Start with signed-off assessment
  Step 2: Consultant creates change request → specifies reason and scope
  Step 3: PM approves change request
  Step 4: Assessment partially unlocked → only specified items editable
  Step 5: Consultant modifies classification for 2 steps
  Step 6: Adds new gap discovered during implementation
  Step 7: Re-validation required for changed areas only
  Step 8: Executive re-signs
  Step 9: Delta report generated → shows exactly what changed
  Step 10: New snapshot created → version N+1
  Step 11: Compare v1 vs v2 → delta report accurate
```

### Journey 7: Enterprise SSO + SCIM

```
T-E2E-J07: Enterprise authentication setup
  Step 1: Partner admin navigates to Settings > Authentication
  Step 2: Uploads SAML IdP metadata XML
  Step 3: Tests SSO connection → redirect to IdP → redirect back
  Step 4: Enables SCIM → copies SCIM URL and bearer token
  Step 5: Simulates SCIM user provision → user appears in team
  Step 6: Simulates SCIM user deactivation → user disabled
  Step 7: SSO user logs in → no onboarding wizard (SSO-aware)
  Step 8: Non-SSO user (client) logs in via magic link → different flow
```

### Journey 8: Offline/PWA

```
T-E2E-J08: Offline step classification
  Step 1: User loads assessment on mobile (PWA installed)
  Step 2: Navigate to step review → cache loaded
  Step 3: Go offline (network throttle to 0)
  Step 4: Classify 3 steps → queued in IndexedDB
  Step 5: Verify UI shows "offline" indicator and "3 pending changes"
  Step 6: Attempt to access integration register → "Not available offline"
  Step 7: Go online → sync triggered
  Step 8: Verify all 3 classifications synced successfully
  Step 9: Conflict scenario: step was modified by another user while offline
  Step 10: Verify conflict resolution UI shown with both versions
```

## 4.2 Destructive & Edge Case E2E Tests

```
T-EDGE-001: Close browser mid-sign-off (between executive sign and partner sign) → state consistent on reload
T-EDGE-002: Network timeout during Stripe payment → subscription not created, user can retry
T-EDGE-003: Session expires during long form fill → save-as-draft before redirect to login
T-EDGE-004: User opens same assessment in two tabs → edits in both → no data loss
T-EDGE-005: Paste 100,000 characters into comment box → truncated with warning
T-EDGE-006: Upload 50MB file as attachment → rejected with size limit message
T-EDGE-007: Back button after sign-off completion → cannot re-sign
T-EDGE-008: Forward navigation via URL manipulation to skip lifecycle steps → 403
T-EDGE-009: Manipulate step classification via browser DevTools → server-side validation rejects
T-EDGE-010: Rapidly click "Next" 50 times → no duplicate step responses created
T-EDGE-011: Two users complete last parallel workstream simultaneously → only one triggers transition
T-EDGE-012: Delete a user who holds an active editing lock → lock released
T-EDGE-013: Delete the only process owner for an area → assessment cannot progress to validation (with clear error)
T-EDGE-014: Change user's role mid-assessment → permissions update immediately, in-flight operations complete
T-EDGE-015: Org admin deletes themselves → prevented (last admin check)
T-EDGE-016: Create assessment with 0 scope items then try to proceed → blocked with message
T-EDGE-017: Assessment with all steps marked NOT_APPLICABLE → allowed (valid outcome)
T-EDGE-018: Assessment with 100% FIT and 0 gaps → sign-off still requires all validation layers
T-EDGE-019: Very long assessment name (500 chars) → truncated in UI, full in API
T-EDGE-020: Assessment name with SQL injection attempt → sanitized
T-EDGE-021: Simultaneous assessment creation by same user → two distinct assessments (no collision)
T-EDGE-022: Clock skew between client and server → server timestamp always used for sign-off
T-EDGE-023: Leap year date in assessment timeline → handled
T-EDGE-024: DST transition during active workshop → no missed events
T-EDGE-025: User in UTC+14 timezone, another in UTC-12 → timestamps display correctly for each
```

---

# PART 5: CROSS-DEVICE & RESPONSIVE TESTS

```
FOR EVERY MAJOR VIEW, test at 3 viewports:

| View | Desktop (1920×1080) | Tablet (1024×768) | Mobile (390×844) |
|------|--------------------|--------------------|-------------------|
| Signup flow | Full form | Full form | Stacked form |
| Partner dashboard | Full table | Condensed table | Card list |
| Assessment list | Table with columns | Table with fewer columns | Card list |
| Step review card | Decision-first, full sidebar | Decision-first, collapsible sidebar | Decision-first, full-width, stacked |
| Reference step | Inline collapsed | Inline collapsed | Minimal one-liner |
| Progress indicator | Segmented horizontal bar | Segmented horizontal bar | Compact segment summary |
| Gap detail | Full form, side panel | Full form, modal | Full-width stacked |
| Integration register | Table with all columns | Horizontal scroll | Card list |
| Workshop Mode | Full facilitator view | Swipeable cards + facilitator view | Voting/approval only |
| Sign-off flow | Multi-column status | Stacked status | Step-by-step vertical |
| Reports | Full preview + download | Preview + download | Download only |
| Comments thread | Side panel | Modal | Bottom sheet |
| Presence indicators | Avatar row | Compact avatars | Hidden (hamburger) |
| Activity feed | Timeline column | Overlay | Notification center |

TESTS PER VIEW: Layout renders correctly, no overflow, all interactive elements tappable (44×44px min), scroll behavior correct, touch gestures work (swipe on tablet).

TOTAL: ~30 views × 3 viewports × 3 checks = ~270 visual regression tests
```

---

# PART 6: SECURITY TESTS

```
AUTHENTICATION:
  T-SEC-001: Access any API route without auth token → 401
  T-SEC-002: Access with expired JWT → 401 (not stale data)
  T-SEC-003: Access with forged JWT (wrong secret) → 401
  T-SEC-004: SSO replay attack (reuse old SAML assertion) → rejected
  T-SEC-005: Magic link used twice → second use rejected
  T-SEC-006: Magic link after 24h → expired
  T-SEC-007: Time-limited viewer link after expiry → 401
  T-SEC-008: TOTP with wrong code → 403
  T-SEC-009: TOTP brute force (10 wrong codes) → account temporarily locked
  T-SEC-010: SCIM endpoint without bearer token → 401
  T-SEC-011: SCIM endpoint with wrong bearer token → 401

AUTHORIZATION (PRIVILEGE ESCALATION):
  T-SEC-020: Viewer modifies request to include write operation → 403
  T-SEC-021: Process owner modifies role claim in JWT → server-side role check, rejected
  T-SEC-022: Client user accesses partner admin API → 403
  T-SEC-023: Partner A user accesses Partner B's SCIM endpoint → 403
  T-SEC-024: Expired trial user modifies request to bypass read-only → 403
  T-SEC-025: User with viewer token accesses sign-off endpoint → 403

INJECTION:
  T-SEC-030: SQL injection in search/filter parameters → parameterized queries prevent
  T-SEC-031: XSS in comment body → sanitized on output
  T-SEC-032: XSS in assessment name → sanitized on output
  T-SEC-033: SSRF via integration point URL field → URL validation prevents internal network access
  T-SEC-034: Path traversal in file upload → prevented
  T-SEC-035: CSV injection in export → cells escaped

DATA PROTECTION:
  T-SEC-040: GDPR deletion request → all PII removed within 30 days
  T-SEC-041: GDPR deletion → audit log entry preserved without PII
  T-SEC-042: Data export → contains all user data (GDPR portability)
  T-SEC-043: Sign-off certificate after GDPR deletion → "Assessment deleted" response
  T-SEC-044: API response never leaks other users' emails (except within same assessment)
  T-SEC-045: Error messages never expose stack traces or internal paths in production
  T-SEC-046: Rate limiting on login endpoint → 10 attempts per minute per IP
  T-SEC-047: Rate limiting on API endpoints → 100 requests per minute per user
  T-SEC-048: WebSocket connection without auth → rejected
  T-SEC-049: WebSocket message with spoofed userId → server-side auth check
```

---

# PART 7: PERFORMANCE TESTS

```
LOAD SCENARIOS:
  T-PERF-001: 100 concurrent users on same assessment → response time < 500ms p95
  T-PERF-002: 50 concurrent WebSocket connections on same assessment → all receive presence updates < 1s
  T-PERF-003: 1000 assessments in partner dashboard → page load < 3s
  T-PERF-004: Assessment with 500 scope items, 5000 steps → step review loads < 2s
  T-PERF-005: Report generation for full assessment → PDF < 30s, XLSX < 15s
  T-PERF-006: ALM export of 500 gaps → completes < 5 minutes
  T-PERF-007: Sign-off certificate generation → < 5s
  T-PERF-008: Snapshot creation for large assessment → < 10s
  T-PERF-009: Delta comparison between two snapshots → < 5s
  T-PERF-010: Step content parsing for 56 steps → < 200ms total

STRESS:
  T-PERF-020: 500 concurrent API requests → no 5xx errors
  T-PERF-021: 200 concurrent WebSocket connections → server stable
  T-PERF-022: Rapid fire step classifications (10 per second) → all persisted, no duplicates
  T-PERF-023: 50 simultaneous sign-off attempts → exactly one succeeds per layer
  T-PERF-024: Memory leak check — run assessment workflow 100 times → no memory growth

DATABASE:
  T-PERF-030: Query performance for assessment list with 10,000 assessments → < 200ms
  T-PERF-031: Query performance for step responses with 5,000 steps → < 300ms
  T-PERF-032: Full-text search across all assessments in org → < 500ms
  T-PERF-033: Snapshot creation (full assessment serialize) → < 5s
  T-PERF-034: No N+1 queries in dashboard, step review, or report generation → verified via query log
```

---

# PART 8: ACCESSIBILITY TESTS

```
FOR EVERY INTERACTIVE VIEW:
  T-A11Y-001: All form inputs have associated labels (axe-core)
  T-A11Y-002: All buttons have accessible names
  T-A11Y-003: Color contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text
  T-A11Y-004: Tab order follows visual order
  T-A11Y-005: Focus indicators visible on all interactive elements
  T-A11Y-006: Screen reader announces step classification options correctly
  T-A11Y-007: Screen reader announces progress ("Step 6 of 35 classifiable steps")
  T-A11Y-008: Collapsed sections expandable via keyboard (Enter/Space)
  T-A11Y-009: Live regions announce real-time updates (presence changes, new comments)
  T-A11Y-010: Modal dialogs trap focus
  T-A11Y-011: Error messages associated with form fields via aria-describedby
  T-A11Y-012: Sign-off confirmation step readable by screen reader with all details
  T-A11Y-013: No auto-play animations (or respects prefers-reduced-motion)
```

---

# PART 9: REGRESSION STRATEGY

## 9.1 Phase-Level Regression

After each phase is implemented, run:
1. ALL unit tests for that phase (new + existing)
2. ALL integration tests that touch modified models
3. The complete E2E journey suite (all 8 journeys)
4. Permission matrix for any new/modified routes
5. Visual regression for any modified views
6. Accessibility scan on any new/modified views

## 9.2 Cross-Phase Regression Matrix

| When Phase X is deployed... | Re-run tests for Phase(s)... | Reason |
|----------------------------|-----------------------------|--------|
| Phase 10 (Company Profile) | 25 (Reports), 30 (Snapshot) | Profile data appears in reports and snapshots |
| Phase 11 (Scope) | 12, 14-16, 20 | Scope drives everything downstream |
| Phase 12 (Step Response + Content) | 20, 21, 22, 23, 25, 27 | Step display affects visualization, workshop, conversation, dashboard, reports, mobile |
| Phase 13 (Gap Resolution) | 14-16, 25, 30 | Gaps feed registers, reports, handoff |
| Phase 14-16 (Registers) | 25, 30 | Register data in reports and exports |
| Phase 17 (Roles + Org) | ALL | Role model change affects every permission check |
| Phase 18 (Lifecycle) | ALL | State machine affects all workflows |
| Phase 19 (WebSocket) | 21, 28 | Real-time infra used by workshop and collaboration |
| Phase 28 (Collaboration) | 12, 14-16, 21 | Comments/locks on steps and registers |
| Phase 29 (Commercial) | 17, ALL E2E | Org model + billing affects everything |
| Phase 30 (Sign-Off) | 25, 31 | Reports feed sign-off, sign-off feeds versioning |
| Phase 31 (Lifecycle Continuity) | 30, 26 | Depends on snapshots, feeds analytics |

## 9.3 Continuous Regression Schedule

| Trigger | Test Suite | Duration | Environment |
|---------|-----------|----------|-------------|
| Every commit | Unit + Component | ~2 min | CI |
| Every PR | Unit + Integration + Accessibility | ~8 min | CI |
| PR merge to main | Full E2E (Chromium) | ~25 min | CI staging |
| Nightly | Full E2E (all browsers) + Performance baseline | ~90 min | CI staging |
| Weekly | Security scan + Performance stress + Full visual regression | ~4 hours | Dedicated perf env |
| Pre-release | EVERYTHING — all 8 journeys × 3 browsers × 3 devices + all unit + all integration + security + performance | ~8 hours | Staging mirror of prod |

---

# PART 10: TEST DATA FACTORIES

## 10.1 Factory Design

Every model needs a typed factory that produces valid default instances with overridable fields:

```typescript
// Example factory pattern — generate for ALL models

interface OrganizationFactory {
  create(overrides?: Partial<Organization>): Promise<Organization>;
  createTrial(): Promise<Organization>;
  createStarter(): Promise<Organization>;
  createProfessional(): Promise<Organization>;
  createEnterprise(): Promise<Organization>;
  createExpired(): Promise<Organization>;
  createCanceled(): Promise<Organization>;
  createWithSSO(provider: 'SAML' | 'OIDC'): Promise<Organization>;
}

interface UserFactory {
  create(overrides?: Partial<User>): Promise<User>;
  createForRole(role: PlatformRole, org: Organization): Promise<User>;
  createAllRoles(org: Organization): Promise<Record<PlatformRole, User>>;
  createWithMagicLink(org: Organization): Promise<User>;
  createWithSSO(org: Organization): Promise<User>;
  createExpiredViewer(assessment: Assessment): Promise<User>;
}

interface AssessmentFactory {
  create(overrides?: Partial<Assessment>): Promise<Assessment>;
  createAtState(state: AssessmentStatus): Promise<Assessment>;
  createFullyPopulated(): Promise<Assessment>; // All steps classified, gaps resolved, registers filled
  createReadyForSignOff(): Promise<Assessment>;
  createSignedOff(): Promise<Assessment>;
  createWithPhase2Clone(): Promise<{ phase1: Assessment; phase2: Assessment }>;
  createWithChangeRequest(): Promise<{ assessment: Assessment; changeRequest: ChangeRequest }>;
}

interface StepFactory {
  createClassifiable(tag: 'BusinessProcess' | 'Configuration' | 'Reporting'): ProcessStep;
  createReference(tag: 'Information' | 'LogOn' | 'TestProcedure'): ProcessStep;
  createWithRealSAPContent(): ProcessStep; // Uses actual Cash Journal content from screenshots
  createBulk(count: number, options: { mixTags: boolean }): ProcessStep[];
}
```

## 10.2 Seed Scenarios

| Scenario ID | Description | Purpose |
|-------------|-------------|---------|
| SEED-001 | Empty org, trial, no assessments | Test signup + first assessment |
| SEED-002 | Active org, 1 assessment at SETUP | Test assessment configuration |
| SEED-003 | Active org, 1 assessment at SCOPE_LOCKED with 50 items | Test step review |
| SEED-004 | Active org, 1 assessment at PROCESS_REVIEW with 200 classified steps | Test gap creation |
| SEED-005 | Active org, 1 assessment at GAP_RESOLUTION with 30 gaps | Test resolution |
| SEED-006 | Active org, 1 assessment at PENDING_SIGN_OFF with all validation ready | Test sign-off flow |
| SEED-007 | Active org, 1 SIGNED_OFF assessment + 1 HANDED_OFF | Test lifecycle continuity |
| SEED-008 | Active org, Phase 1 (signed) + Phase 2 (in progress) | Test cross-phase |
| SEED-009 | Enterprise org with SSO + SCIM + 50 users + 10 assessments | Test scale |
| SEED-010 | Expired trial org with 2 read-only assessments | Test trial expiry UX |
| SEED-011 | Past due org, 14 days into grace period | Test past-due restrictions |
| SEED-012 | Org with active workshop session + 5 connected users | Test real-time collaboration |

---

# PART 11: TEST METRICS & COVERAGE TARGETS

| Metric | Target | Enforcement |
|--------|--------|-------------|
| Line coverage (unit + integration) | ≥ 85% | CI gate (block PR below threshold) |
| Branch coverage | ≥ 80% | CI gate |
| Permission matrix coverage | 100% (every role × every route) | Manual audit per phase |
| State machine transition coverage | 100% (every valid + invalid) | Automated — generate from state definitions |
| E2E journey pass rate | 100% P0 + P1 | CI gate on PR merge |
| Accessibility violations | 0 critical, 0 serious | CI gate |
| Visual regression delta | < 0.1% pixel diff | CI warning, manual review |
| API contract violations | 0 | CI gate |
| Performance regression | < 10% degradation from baseline | CI warning |
| Security vulnerabilities | 0 high/critical | Block release |

---

# PART 12: TEST CASE COUNT SUMMARY

| Category | Estimated Count |
|----------|----------------|
| Unit: State machines (assessment + subscription + sign-off) | ~400 |
| Unit: Permission matrix (25 ops × 11 roles × 3 variants) | ~825 |
| Unit: Content parser (step types + section parsing + grouping) | ~50 |
| Unit: Cryptographic integrity (hashing + certificates) | ~25 |
| Unit: Zod schema validation (per endpoint × 15 variants) | ~300 |
| Unit: Business logic (cost calculations, dependency validation, etc.) | ~200 |
| Integration: Multi-tenant isolation | ~15 |
| Integration: Assessment CRUD full cycle | ~15 |
| Integration: Real-time collaboration | ~40 |
| Integration: ALM export adapters | ~30 |
| Integration: Stripe billing | ~25 |
| Integration: SSO/SCIM auth flows | ~20 |
| E2E: Complete user journeys (8 journeys × avg 15 steps) | ~120 |
| E2E: Destructive/edge cases | ~25 |
| Cross-device: Visual regression (30 views × 3 viewports × 3 checks) | ~270 |
| Security: Auth + authz + injection + data protection | ~50 |
| Performance: Load + stress + database | ~35 |
| Accessibility: Per-view axe-core scans | ~40 |
| **TOTAL** | **~2,485 test cases** |

With combinatorial expansion for P2/P3 priority levels: **~5,000+ test cases**
