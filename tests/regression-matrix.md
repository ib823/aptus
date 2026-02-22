# V2 Cross-Phase Regression Matrix

> Reference document for CI/CD pipeline regression testing strategy.
> When a phase is modified, re-run the test suites listed in its row.

## Phase Dependency Matrix

| Modified Phase | Re-Run Test Suites |
|---|---|
| **Phase 10** (Company Profile) | Phase 25 (Reports), Phase 30 (Snapshot) |
| **Phase 11** (Scope Selection) | Phase 12, 14-16, 20, 25, 30 (everything downstream) |
| **Phase 12** (Step Response + Content) | Phase 20, 21, 22, 23, 25, 27, 30 |
| **Phase 13** (Gap Resolution) | Phase 14-16, 25, 30 |
| **Phase 14** (Integration Assessment) | Phase 25, 30 |
| **Phase 15** (Data Migration Assessment) | Phase 25, 30 |
| **Phase 16** (OCM Impact Assessment) | Phase 25, 30 |
| **Phase 17** (Roles + Org) | **ALL** (affects every permission) |
| **Phase 18** (Lifecycle) | **ALL** (state machine affects all workflows) |
| **Phase 19** (WebSocket + Notifications) | Phase 21, 28 (real-time infra) |
| **Phase 20** (Process Visualization) | Phase 25 (Reports) |
| **Phase 21** (Workshop Mode) | Phase 19, 28 (collaboration) |
| **Phase 22** (Conversation Mode) | Phase 12, 25 |
| **Phase 23** (Dashboard) | Phase 17 (roles determine view) |
| **Phase 24** (Onboarding) | Phase 17, 29 (roles + signup) |
| **Phase 25** (Reports) | Phase 30 (sign-off includes reports) |
| **Phase 26** (Analytics + Templates) | Phase 30, 31 (snapshots + versioning) |
| **Phase 27** (Mobile + PWA) | Phase 12, 19, 28 (offline sync + real-time) |
| **Phase 28** (Collaboration) | Phase 12, 14-16, 21 (comments/locks on entities) |
| **Phase 29** (Commercial) | Phase 17, **ALL E2E** (org + billing affects everything) |
| **Phase 30** (Sign-Off + Handoff) | Phase 25, 31 (reports + versioning) |
| **Phase 31** (Lifecycle Continuity) | Phase 30, 26 (snapshots + analytics) |

## Continuous Regression Schedule

| Trigger | Test Suite | Duration | Environment |
|---|---|---|---|
| Every commit | Unit + Component (`test:unit`) | ~2 min | CI |
| Every PR | Unit + Integration + Accessibility (`test:unit`, `test:integration`, `test:a11y`) | ~8 min | CI |
| PR merge to main | Full E2E Chromium (`test:e2e:chromium`) | ~25 min | CI staging |
| Nightly | All browsers + Performance baseline (`test:full`, `test:perf`) | ~90 min | CI staging |
| Weekly | Security + Stress + Visual regression (`test:security`, `test:perf`) | ~4 hours | Dedicated perf env |
| Pre-release | Everything × all browsers × all devices | ~8 hours | Staging mirror |

## CI Gate Block Conditions

| Metric | Threshold | Action |
|---|---|---|
| Line coverage | < 85% | Block PR merge |
| Branch coverage | < 80% | Block PR merge |
| Permission matrix coverage | < 100% | Block PR merge |
| State machine transition coverage | < 100% | Block PR merge |
| E2E journey pass rate (P0+P1) | < 100% | Block PR merge |
| Accessibility violations (critical/serious) | > 0 | Block PR merge |
| API contract violations (Zod) | > 0 | Block PR merge |
| Performance regression | > 10% degradation | Warning + investigation |
| Security vulnerabilities (high/critical) | > 0 | Block release |
| Visual regression delta | > 0.1% pixel diff | Warning + manual review |

## Phase-Level Regression Checklist

After implementing any phase, verify:

- [ ] ALL unit tests for that phase pass (new + existing)
- [ ] ALL integration tests touching modified models pass
- [ ] Complete E2E journey suite passes (all 8 journeys)
- [ ] Permission matrix verified for new/modified routes
- [ ] Visual regression passes for modified views
- [ ] Accessibility scan passes on new/modified views
- [ ] No TypeScript errors (`pnpm typecheck:strict`)
- [ ] No lint warnings (`pnpm lint:strict`)
- [ ] Build succeeds (`pnpm build`)
