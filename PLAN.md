# P0+P1 Gap Closure Plan — Target: ~88-90% Alignment

> **OBSOLETE (2026-05-16).** This plan was drafted to close the gap
> between V2 test specifications and the real codebase. Two of its
> three phases are no longer applicable:
>
> - **Phase A (Stripe Webhook Handler)** is moot — paid billing is no
>   longer in scope. The Stripe SDK, webhook handler, checkout/portal
>   routes, and `tests/unit/billing/stripe-webhooks.test.ts` have been
>   removed entirely. See `BUILD-PHASES-STATUS.md` Phase 29 (DESCOPED).
> - **Phase B (Permission Matrix Expansion)** was not implemented as
>   written; the 14-boolean shape remains canonical. The V2 spec's
>   25-operation matrix lives in test code only.
> - **Phase C (Step Type Tag Mapping)** is the only piece that's worth
>   carrying forward; see `tests/unit/parsers/step-type-classifier.test.ts`.
> - **Phase D / E** (test wiring, V2 index updates) are partially superseded
>   by the broader reconciliation in the latest session.
>
> Kept as historical reference. Do not act on this plan; consult
> `BUILD-PHASES-STATUS.md` and `HANDOFF.md` instead.

## Phase A: Stripe Webhook Handler (P0)
**Goal**: Create `src/lib/stripe/webhook-handler.ts` with pure-function logic matching V2 test spec, then wire the test.

### A1. Create `src/lib/stripe/webhook-handler.ts`
Extract the business logic from the V2 test's inline `handleStripeWebhook` into a real module:
- `handleStripeWebhook(event, deps)` — pure function, dependency-injected for DB access
- Signature verification gate (returns 400 on invalid)
- Idempotency via `processedEventIds` lookup (dependency-injected)
- Event routing: `customer.subscription.created/updated/deleted`, `invoice.payment_failed/paid`, `meter.event`
- Timeout detection → 202 queued response
- Meter events: `assessment_created` (increment), `assessment_archived` (decrement)
- Retry with exponential backoff (capped at 32s) when upstream is unavailable
- Proration passthrough for mid-cycle upgrades

### A2. Wire `tests/unit/billing/stripe-webhooks.test.ts`
- Replace inline `handleStripeWebhook` with import from `@/lib/stripe/webhook-handler`
- Keep the in-memory `orgStore` as an injected dependency (the test provides its own store)
- All 13 tests (T-STRIPE-001→T-STRIPE-013) should pass unchanged

### A3. Create `src/app/api/webhooks/stripe/route.ts`
- POST handler: reads raw body, verifies Stripe signature using env `STRIPE_WEBHOOK_SECRET`
- Delegates to `handleStripeWebhook` with real Prisma-backed deps
- Updates Organization record (status, plan, billingEmail)
- Creates UsageEvent records for metering
- Returns appropriate status codes (200/202/400/503)

### A4. Update `.env.example`
- Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_PRICE_ENTERPRISE`

---

## Phase B: Permission Matrix Expansion (P1)
**Goal**: Expand 14 boolean capabilities → 25 fine-grained operations while preserving backward compatibility.

### B1. Expand `RoleCapabilities` interface in `src/lib/auth/role-permissions.ts`
Add 11 new fine-grained capabilities to bridge the gap:
```
Existing 14                     → New additions (from V2 25-op spec)
canEditStepResponses            → split into: canClassifyOwnArea, canClassifyOtherArea, canOverrideClassification
canEditGapResolutions           → add: canCreateGap (was implicit)
canEditRegisters                → split into: canEditIntegrationRegister, canEditDmRegister, canEditOcmRegister
canSignOff                      → split into: canValidateAreaSignOff, canExecutiveSignOff, canPartnerCountersign
(new)                           → canExportToAlm, canViewReports, canDownloadDataExport
(new)                           → canConfigureSso, canManageSubscription
(new)                           → canCreateChangeRequest, canApproveChangeRequest
(new)                           → canCloneAssessment, canAddComment, canAcquireEditingLock
```

Keep the original 14 booleans intact for backward compatibility. Add the new ones alongside.

### B2. Populate the expanded matrix for all 11 roles
Map each role's new capabilities based on the V2 spec's PERMISSION_MATRIX truth table:
- Reconcile V2 role names: `executive` → `executive_sponsor`, `functional_head` → `process_owner` (closest match), `change_manager` → no equivalent (skip for now)
- `solution_architect` and `client_admin` (V1-only) get sensible defaults

### B3. Add `checkOperation(role, operation)` function
New function that checks the expanded matrix by operation name string, returning PermissionResult. This is the bridge function the V2 test can wire to.

### B4. Wire `tests/unit/permissions/permission-matrix.test.ts`
- Import `checkOperation` from real module
- Create adapter mapping V2 role names to V1 role names (like the sign-off adapter pattern)
- Wire the `checkPermission` function to use real `checkOperation`
- Keep V2-only roles (`change_manager`) as inline fallback (hybrid adapter)

---

## Phase C: Step Type Tag Mapping (P1)
**Goal**: Add SAP tag → StepCategory mapping function and wire V2 test.

### C1. Add `classifyStepTag(tag: string | null): StepCategory` to `src/lib/assessment/step-classifier.ts`
New export alongside existing `classifyStep(stepType)`:
```typescript
const TAG_TO_CATEGORY: Record<string, StepCategory> = {
  information: "REFERENCE",
  logon: "SYSTEM_ACCESS",
  logoff: "SYSTEM_ACCESS",
  testprocedure: "TEST_INFO",
  businessprocess: "BUSINESS_PROCESS",
  configuration: "CONFIGURATION",
  reporting: "REPORTING",
  masterdata: "MASTER_DATA",
};

export function classifyStepTag(tag: string | null): StepCategory {
  if (tag == null || tag.trim() === "") return "BUSINESS_PROCESS";
  return TAG_TO_CATEGORY[tag.toLowerCase().trim()] ?? "BUSINESS_PROCESS";
}
```

### C2. Wire `tests/unit/parsers/step-type-classifier.test.ts`
- Replace inline `classifyStepType` with import of `classifyStepTag` from `@/lib/assessment/step-classifier`
- All 11 tests (T-STC-001→T-STC-011) should pass unchanged

### C3. Update `src/constants/step-types.ts`
Add LOGOFF to `STEP_TYPE_LABELS` (missing from current 8-entry map).

---

## Phase D: Wire Additional V2 Tests (P1)
**Goal**: Wire 2 more self-contained tests to real code where possible.

### D1. Wire `tests/unit/parsers/content-section-parser.test.ts`
- The real `src/lib/assessment/content-parser.ts` exists with `parseStepContent(html)`
- Check if V2 test's `parseContentSections(html)` output structure matches `ParsedStepContent`
- If compatible: wire directly; if different shape: create adapter or cross-reference import

### D2. Wire `tests/unit/billing/plan-enforcement.test.ts`
- Already imports types from `@/types/commercial`
- Check if inline `enforcePlanLimit` logic matches real `getPlanLimits` + `hasFeature`
- Wire via adapter if shapes are compatible

---

## Phase E: Documentation & Test Verification

### E1. Update `tests/V2-TEST-INDEX.md` wiring status table
- Update status for all newly wired tests

### E2. Run full test suite
- Unit (expect ~2,718+), integration, security, performance — all green

### E3. Update wiring status headers on modified files

---

## Estimated Impact

| Area | Before | After |
|------|--------|-------|
| Stripe/Billing | 75% infra, 0% handler | ~95% |
| Permissions | 14/25 operations (56%) | 25/25 operations (~92%) |
| Step Classification | 8 stepTypes, no tag mapping | 8 stepTypes + 8 tags (~95%) |
| V2 Test Wiring | ~40% wired | ~65% wired |
| **Overall Alignment** | **~78-80%** | **~88-90%** |

## Files to Create
1. `src/lib/stripe/webhook-handler.ts` (new)
2. `src/app/api/webhooks/stripe/route.ts` (new)

## Files to Modify
3. `src/lib/auth/role-permissions.ts` (expand capabilities)
4. `src/lib/auth/permissions.ts` (add checkOperation)
5. `src/lib/assessment/step-classifier.ts` (add classifyStepTag)
6. `src/constants/step-types.ts` (add LOGOFF)
7. `tests/unit/billing/stripe-webhooks.test.ts` (wire)
8. `tests/unit/permissions/permission-matrix.test.ts` (wire)
9. `tests/unit/parsers/step-type-classifier.test.ts` (wire)
10. `tests/unit/parsers/content-section-parser.test.ts` (wire attempt)
11. `tests/unit/billing/plan-enforcement.test.ts` (wire attempt)
12. `tests/V2-TEST-INDEX.md` (update statuses)
13. `.env.example` (add Stripe keys)
