# V2 Test Suite — Master Index

Generated from V2-TEST-SPECIFICATION.md. All test case IDs from the spec are mapped to test files.

## Summary

| Metric | Count |
|---|---|
| **Total test files** | 140 |
| **Total test cases (unit + integration)** | ~1,521 |
| **Total E2E test cases** | ~203 |
| **Total test cases (all)** | ~1,724+ |
| **Factory files** | 13 |
| **Helper files** | 4 |
| **Seed scenarios** | 12 |
| **Page objects (POM)** | 7 |

## Wiring Status — V2 Tests to Real Application Code

| File | Status | Real Module | Notes |
|---|---|---|---|
| `crypto/snapshot-hashing.test.ts` | **WIRED** | `src/lib/signoff/hash-engine.ts` | Identical functions — `computeCanonicalHash`, `verifyHash` |
| `state-machines/sign-off-lifecycle.test.ts` | **WIRED (adapter)** | `src/lib/signoff/state-machine.ts` | Name mapping layer (V2 → real state names) |
| `state-machines/subscription-lifecycle.test.ts` | **WIRED (hybrid)** | `src/lib/commercial/plan-engine.ts` | 5/6 states overlap; SUSPENDED kept inline |
| `state-machines/assessment-lifecycle.test.ts` | **WIRED (partial)** | `src/lib/assessment/status-machine.ts` | Different topology — real module imported for cross-reference tests |
| `parsers/step-grouping.test.ts` | **PARTIAL WIRE** | `src/lib/assessment/step-classifier.ts` | `isStepClassifiable` wired; `groupSteps` kept inline |
| `billing/plan-enforcement.test.ts` | **Already typed** | `src/lib/commercial/plan-engine.ts` | Imports types from `@/types/commercial` |
| `billing/stripe-webhooks.test.ts` | **Already typed** | `src/app/api/webhooks/stripe/` | Imports types from `@/types/commercial` |
| `permissions/permission-matrix.test.ts` | **Self-contained** | `src/lib/auth/role-permissions.ts` | Incompatible granularity (14 vs 25 operations) |
| `parsers/step-type-classifier.test.ts` | **Self-contained** | `src/lib/assessment/step-classifier.ts` | Different input format |
| `parsers/content-section-parser.test.ts` | **Self-contained** | `src/lib/assessment/step-classifier.ts` | Different output structure |
| `crypto/certificate-generation.test.ts` | **Self-contained** | None | No real module exists yet |
| `validation/api-schema-validation.test.ts` | **Self-contained** | `src/app/api/` routes | Schemas not exported from handlers |
| All integration tests (10 files) | **Self-contained** | — | Need database layer |
| All security tests (4 files) | **Self-contained** | — | Simulate middleware |
| All performance tests (3 files) | **Self-contained** | — | Synthetic benchmarks |

## Test Cases by Category

| Category | Files | Test Cases | Test IDs |
|---|---|---|---|
| **Unit: State Machines** | 3 | ~180 | T-SM-001–008, T-SUB-001–010, T-SO-001–010 |
| **Unit: Permission Matrix** | 1 | ~993 | 11 roles × 25 ops × 3 variants + isolation + session + subscription |
| **Unit: Content Parsers** | 3 | ~34 | T-STC-001–011, T-CSP-001–015, T-SGR-001–008 |
| **Unit: Cryptographic Integrity** | 2 | ~17 | T-HASH-001–008, T-CERT-001–009 |
| **Unit: Stripe Billing** | 2 | ~31 | T-STRIPE-001–013, T-PLAN-001–009 |
| **Unit: Zod Schema Validation** | 1 | ~150 | T-ZOD-001–015 × 10 endpoints |
| **Integration: Multi-Tenant** | 1 | 15 | T-ISO-001–015 |
| **Integration: Assessment CRUD** | 1 | 15 | T-CRUD-001–015 |
| **Integration: Collaboration** | 4 | 32 | T-LOCK-001–010, T-PRES-001–007, T-CMT-001–010, T-CONF-001–005 |
| **Integration: ALM Exports** | 4 | 23 | T-ALM-001–010, T-JIRA-001–008, T-ADO-001–003, T-CONF-EXP-001–002 |
| **Security: Authentication** | 1 | ~35 | T-SEC-001–011 |
| **Security: Authorization** | 1 | ~30 | T-SEC-020–025 |
| **Security: Injection** | 1 | ~40 | T-SEC-030–035 |
| **Security: Data Protection** | 1 | ~43 | T-SEC-040–049 |
| **Performance: Load** | 1 | ~18 | T-PERF-001–010 |
| **Performance: Stress** | 1 | ~15 | T-PERF-020–024 |
| **Performance: Database** | 1 | ~15 | T-PERF-030–034 |
| **E2E: Journey 1** | 1 | 24 | T-E2E-J01 (steps 01–24) |
| **E2E: Journey 2** | 1 | 13 | T-E2E-J02 (multi-browser workshop) |
| **E2E: Journey 3** | 1 | 10 | T-E2E-J03 (client invitation) |
| **E2E: Journey 4** | 1 | 10 | T-E2E-J04 (trial-to-paid) |
| **E2E: Journey 5** | 1 | 9 | T-E2E-J05 (phase 2 carry-forward) |
| **E2E: Journey 6** | 1 | 11 | T-E2E-J06 (change control) |
| **E2E: Journey 7** | 1 | 8 | T-E2E-J07 (enterprise SSO) |
| **E2E: Journey 8** | 1 | 10 | T-E2E-J08 (offline PWA) |
| **E2E: Edge Cases** | 1 | 25 | T-EDGE-001–025 |
| **E2E: Responsive** | 1 | ~90 | 30 views × 3 viewports |
| **Accessibility** | 1 | 23 | T-A11Y-001–013 × views |

## File Structure

```
tests/
├── factories/                          # 13 typed factory files
│   ├── organization.factory.ts         # 8 variants (trial, starter, pro, enterprise, expired, etc.)
│   ├── user.factory.ts                 # 6 variants (role-specific, magic link, SSO, etc.)
│   ├── assessment.factory.ts           # 7 variants (at-state, fully-populated, signed-off, etc.)
│   ├── step.factory.ts                 # 4 variants (classifiable, reference, real SAP, bulk)
│   ├── gap.factory.ts                  # 4 variants (resolved, unresolved, high-risk, alternatives)
│   ├── integration-point.factory.ts    # 3 variants (by-direction, by-complexity)
│   ├── data-migration.factory.ts       # 3 variants (by-type, by-complexity)
│   ├── ocm-impact.factory.ts           # 2 variants (by-severity)
│   ├── sign-off.factory.ts             # 4 variants (process, validations, fully-validated, signatures)
│   ├── snapshot.factory.ts             # 3 variants (with-hash, for-sign-off)
│   ├── change-request.factory.ts       # 4 variants (approved, rejected, in-progress)
│   ├── comment.factory.ts              # 4 variants (thread, mentions, resolved)
│   └── template.factory.ts             # 3 variants (demo, published)
├── helpers/                            # 4 test utility modules
│   ├── auth.ts                         # Mock sessions for all 11 roles
│   ├── db.ts                           # Transaction isolation, cleanup
│   ├── stripe.ts                       # Webhook mocks, signature generation
│   └── websocket.ts                    # WS client mocks, presence/lock messages
├── seed/                               # 12 deterministic seed scenarios + index
│   ├── index.ts                        # Re-exports all seeds
│   ├── seed-001-empty-trial.ts         # Empty trial org (signup testing)
│   ├── seed-002-setup-assessment.ts    # Assessment at SETUP state
│   ├── seed-003-scope-locked.ts        # 50 scope items, SCOPE_LOCKED
│   ├── seed-004-process-review.ts      # 200 classified steps
│   ├── seed-005-gap-resolution.ts      # 30 gaps at various states
│   ├── seed-006-pending-sign-off.ts    # All validation layers ready
│   ├── seed-007-signed-off.ts          # Signed + handed off assessments
│   ├── seed-008-phase2.ts              # Phase 1 + Phase 2 linked
│   ├── seed-009-enterprise.ts          # Enterprise: 50 users, 10 assessments
│   ├── seed-010-expired-trial.ts       # Expired trial, read-only
│   ├── seed-011-past-due.ts            # Past due, grace period
│   └── seed-012-active-workshop.ts     # 5 users in live workshop
├── unit/                               # Vitest unit tests
│   ├── state-machines/
│   │   ├── assessment-lifecycle.test.ts
│   │   ├── subscription-lifecycle.test.ts
│   │   └── sign-off-lifecycle.test.ts
│   ├── permissions/
│   │   └── permission-matrix.test.ts   # 993 tests (complete 11×25 matrix)
│   ├── parsers/
│   │   ├── step-type-classifier.test.ts
│   │   ├── content-section-parser.test.ts
│   │   └── step-grouping.test.ts
│   ├── crypto/
│   │   ├── snapshot-hashing.test.ts
│   │   └── certificate-generation.test.ts
│   ├── billing/
│   │   ├── stripe-webhooks.test.ts
│   │   └── plan-enforcement.test.ts
│   └── validation/
│       └── api-schema-validation.test.ts
├── integration/                        # Vitest integration tests
│   ├── multi-tenant-isolation.test.ts
│   ├── assessment-crud.test.ts
│   ├── collaboration/
│   │   ├── editing-locks.test.ts
│   │   ├── presence.test.ts
│   │   ├── comments.test.ts
│   │   └── conflict-detection.test.ts
│   └── exports/
│       ├── cloud-alm.test.ts
│       ├── jira.test.ts
│       ├── azure-devops.test.ts
│       └── confluence.test.ts
├── e2e/                                # Playwright E2E tests
│   ├── pages/                          # Page Object Model
│   │   ├── base.page.ts
│   │   ├── assessment.page.ts
│   │   ├── auth.page.ts
│   │   ├── dashboard.page.ts
│   │   ├── settings.page.ts
│   │   ├── sign-off.page.ts
│   │   └── workshop.page.ts
│   ├── journeys/
│   │   ├── j01-partner-first-assessment.spec.ts
│   │   ├── j02-multi-role-workshop.spec.ts
│   │   ├── j03-client-invitation.spec.ts
│   │   ├── j04-trial-to-paid.spec.ts
│   │   ├── j05-phase2-carry-forward.spec.ts
│   │   ├── j06-change-control.spec.ts
│   │   ├── j07-enterprise-sso-scim.spec.ts
│   │   └── j08-offline-pwa.spec.ts
│   ├── responsive/
│   │   └── responsive-views.spec.ts
│   └── edge-cases.spec.ts
├── security/                           # Vitest security tests
│   ├── authentication.test.ts
│   ├── authorization.test.ts
│   ├── injection.test.ts
│   └── data-protection.test.ts
├── performance/                        # Vitest performance tests
│   ├── load.test.ts
│   ├── stress.test.ts
│   └── database.test.ts
├── accessibility/                      # Playwright + axe-core
│   └── axe-scan.spec.ts
├── regression-matrix.md                # Cross-phase regression reference
└── V2-TEST-INDEX.md                    # This file
```

## How to Run

```bash
# All unit + integration tests (fast, ~2 min)
pnpm test

# Watch mode during development
pnpm test:watch

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# Security tests
pnpm test:security

# Performance tests
pnpm test:perf

# E2E tests (all browsers)
pnpm test:e2e

# E2E Chromium only (CI fast path)
pnpm test:e2e:chromium

# E2E journeys only
pnpm test:e2e:journeys

# Accessibility scans
pnpm test:a11y

# CI pipeline (unit + integration + Chromium E2E)
pnpm test:ci

# Full suite (unit + integration + all E2E)
pnpm test:full

# Coverage report
pnpm test:coverage
```

## Coverage Targets (from Part 11)

| Metric | Target | Enforcement |
|---|---|---|
| Line coverage | >= 85% | CI gate |
| Branch coverage | >= 80% | CI gate |
| Permission matrix | 100% | Automated matrix verification |
| State machine transitions | 100% | Generated from definitions |
| E2E journey pass rate | 100% (P0+P1) | CI gate |
| Accessibility violations | 0 critical/serious | CI gate |
| API contract (Zod) | 0 violations | CI gate |
| Performance regression | < 10% degradation | CI warning |
| Security vulnerabilities | 0 high/critical | Block release |

## CI Pipeline Integration (from Part 9.3)

| Trigger | Suite | Duration |
|---|---|---|
| Every commit | `pnpm test:unit` | ~2 min |
| Every PR | `pnpm test:unit && pnpm test:integration && pnpm test:a11y` | ~8 min |
| PR merge to main | `pnpm test:e2e:chromium` | ~25 min |
| Nightly | `pnpm test:full && pnpm test:perf` | ~90 min |
| Weekly | `pnpm test:security && pnpm test:perf` | ~4 hours |
| Pre-release | Everything × all browsers × all devices | ~8 hours |

## Factory & Seed Documentation

### Factories
All factories are in `tests/factories/` and export:
- `create(overrides?)` — Single record with defaults
- `createMany(count, overrides?)` — Multiple records
- Scenario-specific builders (e.g., `createTrial()`, `createAtState()`, `createForRole()`)

### Seeds (SEED-001 through SEED-012)
All seeds are in `tests/seed/` and export functions returning complete database state configurations. Import from `tests/seed/index.ts`:
```typescript
import { seedEmptyTrial, seedEnterprise, seedPendingSignOff } from "../seed";
```
