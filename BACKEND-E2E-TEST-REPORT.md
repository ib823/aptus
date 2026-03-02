# ABEAM V2 — Backend Integration Test Report

**Date:** 2026-03-02T02:24:22Z
**Server:** http://localhost:3003 (Next.js dev, port 3003)
**Auth Method:** `POST /api/auth/test-login` with `E2E_TEST_SECRET` → `ABeam-session` cookie, role: `platform_admin`
**Test Runner:** Node.js ESM script using native `fetch()` — real HTTP requests against running dev server
**Database:** PostgreSQL 16 via Prisma ORM (102,261 ProcessSteps, 560 ScopeItems, 4,703 ConfigActivities)

---

## SUMMARY

| Suite | Tests | Pass | Fail | Skip | Rate | Notes |
|---|---|---|---|---|---|---|
| 1: DB Integrity & Catalog | 30 | 29 | 1 | 0 | 97% | Hierarchy tables empty (data issue) |
| 2: Assessment Lifecycle | 23 | 23 | 0 | 0 | 100% | All CRUD + transitions work |
| 3: Scope Selection | 14 | 14 | 0 | 0 | 100% | Full coverage |
| 4: Step Classification | 37 | 36 | 1 | 0 | 97% | Core workflow verified |
| 5: Gap Resolution | 17 | 7 | 10 | 0 | 41% | Schema validation strict |
| 6: Reports & Exports | 22 | 7 | 15 | 0 | 32% | Gated by assessment status |
| 7: Progress & Dashboard | 10 | 10 | 0 | 0 | 100% | All endpoints working |
| 8: Registers | 7 | 7 | 0 | 0 | 100% | All endpoints working |
| 9: Workshop Management | 4 | 4 | 0 | 0 | 100% | Full CRUD verified |
| 10: Data Isolation | 4 | 3 | 1 | 0 | 75% | Minor leakage (see below) |
| 11: RBAC | 2 | 1 | 0 | 1 | 50% | Session limit blocks multi-role |
| 12: Conversation Mode | 3 | 2 | 1 | 0 | 67% | Templates table empty |
| 13: Performance | 6 | 6 | 0 | 0 | 100% | All within thresholds |
| **TOTAL** | **179** | **149** | **29** | **1** | **83%** | |

---

## CATALOG DATA VERIFICATION

| Scope Item | Steps | Classifiable* | Activities | Hierarchy OK | Config Items |
|---|---|---|---|---|---|
| J60 | 714 | 460 (by stepType) | 0 (flat data) | Endpoint 200, empty tree | 19 |
| J59 | 613 | ~400 (est.) | 0 (flat data) | Endpoint 200, empty tree | 27 |
| J45 | 626 | ~400 (est.) | 0 (flat data) | Endpoint 200, empty tree | 47 |
| 1NT | 147 | ~100 (est.) | 0 (flat data) | Endpoint 200, empty tree | 4 |
| BDW | 250 | ~170 (est.) | 0 (flat data) | Endpoint 200, empty tree | 0 |
| 2ET | 142 | ~95 (est.) | 0 (flat data) | Endpoint 200, empty tree | 0 |

*Note: The `isClassifiable` column in DB is `true` for ALL 102,261 steps (including LOGON/INFORMATION types). The catalog API does not return `isClassifiable` in the response. Classifiable counts above are estimated by filtering out LOGON/LOGOFF/ACCESS_APP/INFORMATION/NAVIGATION step types.

**DATA ISSUE:** The `SolutionProcess`, `ProcessFlow`, and `Activity` tables are all EMPTY (0 rows). The `ProcessStep` table has 102,261 rows but with `NULL` values for `activityId`, `solutionProcessFlowName`, and `processFlowGroup`. This means the hierarchy endpoint returns `processes: []` for all scope items. Steps exist in a flat structure only.

---

## CLASSIFICATION PIPELINE

| Test | Result | Notes |
|---|---|---|
| Individual PUT FIT | PASS | status=200, persisted correctly |
| Individual PUT CONFIGURE | PASS | status=200, with clientNote |
| Individual PUT GAP | PASS | status=200, requires clientNote min 10 chars |
| Individual PUT NA | PASS | status=200 |
| Bulk POST FIT | PASS | status=200, all steps updated |
| Bulk POST CONFIGURE (was broken!) | PASS | status=200 — Zod enum fix verified |
| Bulk POST GAP (was broken!) | PASS | status=200 — Zod enum fix verified |
| Bulk POST NA | PASS | status=200 |
| Bulk with clientNote (was dropped!) | PASS | clientNote persisted in bulk |
| Limit=500 catalog steps (was rejected!) | PASS | status=200 — max raised to 2000 |
| Limit=500 step responses (was rejected!) | PASS | status=200 — max raised to 2000 |
| Reclassification FIT→GAP→FIT | PASS | Both directions work |
| Rapid reclassification (4x) | PASS | Final state correct |
| Auto-advance (gap auto-creation) | PASS | 8 GapResolution records auto-created |
| Bulk 460+ steps at once | PASS | 714 steps in 849ms |

---

## ZOD VALIDATION BOUNDARIES

| Endpoint | Param | Test Value | Expected | Actual | Pass? |
|---|---|---|---|---|---|
| catalog/steps | limit | 200 | 200 | 200 | PASS |
| catalog/steps | limit | 500 | 200 | 200 | PASS |
| catalog/steps | limit | 2000 | 200 | 200 | PASS |
| catalog/steps | limit | 2001 | 400 | 400 | PASS |
| catalog/steps | limit | 0 | 400 | 400 | PASS |
| catalog/steps | limit | -1 | 400 | 400 | PASS |
| catalog/steps | limit | abc | 400 | 400 | PASS |
| assessment/steps | limit | 50 | 200 | 200 | PASS |
| assessment/steps | limit | 500 | 200 | 200 | PASS |
| assessment/steps | limit | 1000 | 200 | 200 | PASS |
| assessment/steps | limit | 2000 | 200 | 200 | PASS |
| assessment/steps | limit | 2001 | 400 | 400 | PASS |
| assessment/steps | limit | 99999 | 400 | 400 | PASS |
| bulk | fitStatus | FIT | 200 | 200 | PASS |
| bulk | fitStatus | CONFIGURE | 200 | 200 | PASS |
| bulk | fitStatus | GAP | 200 | 200 | PASS |
| bulk | fitStatus | NA | 200 | 200 | PASS |
| bulk | fitStatus | INVALID | 400 | 400 | PASS |
| step PUT | fitStatus | INVALID | 400 | 400 | PASS |
| step PUT | fitStatus | (empty) | 400 | 400 | PASS |
| step PUT | fitStatus | (missing) | 400 | 400 | PASS |
| step PUT | GAP w/o note | 400 | 400 | PASS |

---

## REPORT GENERATION

| Report Type | Endpoint | Status | Content Valid | Notes |
|---|---|---|---|---|
| Executive Summary | /report/executive-summary | 400 | N/A | **Gated**: requires status in [pending_validation, validated, signed_off, handed_off, archived] |
| Scope Catalog | /report/scope-catalog | 400 | N/A | Same gate |
| Gap Register | /report/gap-register | 400 | N/A | Same gate |
| Integration Register | /report/integration-register | 400 | N/A | Same gate |
| DM Register | /report/dm-register | 400 | N/A | Same gate |
| OCM Report | /report/ocm-report | 400 | N/A | Same gate |
| Effort Estimate | /report/effort-estimate | 400 | N/A | Same gate |
| Config Workbook | /report/config-workbook | 400 | N/A | Same gate |
| Step Detail | /report/step-detail | 400 | N/A | Same gate |
| Flow Atlas | /report/flow-atlas | 400 | N/A | "No flow diagrams generated yet" |
| **Audit Trail** | /report/audit-trail | **200** | JSON | 955ms — works at any status |
| **Readiness Scorecard** | /report/readiness-scorecard | **200** | JSON | 942ms — works at any status |
| **Remaining Register** | /report/remaining-register | **200** | JSON | 919ms — works at any status |
| Sign-Off | /report/sign-off | 405 | N/A | Method not allowed (may be POST-only) |
| Complete Package | /report/complete-package | 400 | N/A | Same gate |

**Finding:** Most report endpoints use `authenticateForReport(assessmentId, requireCompleted=true)` which gates reports behind status progression. Only audit-trail, readiness-scorecard, and remaining-register pass `requireCompleted=false`. This is by design — reports should only be generated when the assessment reaches a review/validation phase.

**To fully test reports:** The assessment must be advanced through the full state machine: `draft → scoping → in_progress → workshop_active → in_progress → gap_resolution → pending_validation`. The transition `workshop_active → pending_validation` is not a direct valid transition — the state machine requires going back to `in_progress` first, then through `gap_resolution`.

---

## DATA ISOLATION

| Test | Pass? | Notes |
|---|---|---|
| Assessment A scope ≠ Assessment B scope | PASS | A has J60/J59, B has J45/2ET |
| Assessment A has no J45 responses | PASS | count=0 |
| B has no J60 responses | **FAIL** | count=1 — a step response leaked |
| Same step independent across A & C | PASS | Different classifications preserved |

**Issue:** Assessment B showed 1 step response for J60 when it should have 0. This may be caused by the test creating a step response for a J60 step in B during negative testing (the "wrong assessment" test returned 200 instead of 404, meaning cross-assessment step classification is NOT blocked). **This is a real security/isolation concern.**

---

## NEGATIVE TEST RESULTS

| Test | Expected | Actual | Pass? |
|---|---|---|---|
| Empty body → 400 | 400 | 400 | PASS |
| Empty companyName → 400 | 400 | 400 | PASS |
| Missing companyName → 400 | 400 | 400 | PASS |
| CompanyName > 200 chars → 400 | 400 | 400 | PASS |
| Invalid companySize enum → 400 | 400 | 400 | PASS |
| SQL injection in name → safe | 201 | 201 | PASS (stored safely via Prisma ORM) |
| XSS in name → safe | 201 | 201 | PASS (stored, output escaping is frontend) |
| Non-existent assessment → 404 | 404 | 404 | PASS |
| Path traversal → blocked | 404 | 404 | PASS |
| Invalid fitStatus → 400 | 400 | 400 | PASS |
| GAP without clientNote → 400 | 400 | 400 | PASS |
| XSS in clientNote → safe | 200 | 200 | PASS |
| Unicode in clientNote → safe | 200 | 200 | PASS |
| Non-existent step → 404 | 404 | 404 | PASS |
| Non-existent scope item → 404 | 404 | 404 | PASS |
| Invalid relevance enum → 400 | 400 | 400 | PASS |
| NONEXISTENT scope in catalog → 404 | 404 | 200 | **FAIL** (returns empty data, not 404) |
| Wrong assessment step classify → 404 | 404 | 200 | **FAIL** (cross-assessment not blocked) |

---

## GAP RESOLUTION ANALYSIS

| Test | Expected | Actual | Notes |
|---|---|---|---|
| GET /gaps (list) | 200 | 200 | Returns 8 gaps with summary |
| GET /gaps/{id} (detail) | 200 | 405 | **No GET handler** — endpoint only supports PUT |
| PUT resolution FIT | 200 | 200 | Works (no rationale required) |
| PUT resolution CONFIGURE | 200 | 400 | **Requires `rationale` min 20 chars** for non-FIT types |
| PUT resolution KEY_USER_EXT | 200 | 400 | Same — rationale required |
| PUT resolution CUSTOM_ABAP | 200 | 400 | Same — rationale required |
| PUT resolution OUT_OF_SCOPE | 200 | 400 | Same — rationale required |

**Finding:** The gap resolution PUT endpoint has a Zod `.refine()` rule: any `resolutionType` other than `PENDING` or `FIT` requires a `rationale` field with min 20 characters. The test was sending `{ resolutionType: "CONFIGURE" }` without a rationale. This is correct validation behavior — not a bug. The gap detail endpoint (`GET /gaps/{gapId}`) does not exist (only PUT).

---

## PERFORMANCE

| Operation | Time (ms) | Acceptable? | Verdict |
|---|---|---|---|
| J60 hierarchy fetch | 274 | < 2000ms | PASS |
| J60 steps fetch (714) | 320 | < 3000ms | PASS |
| Bulk classify 714 steps | 849 | < 10000ms | PASS |
| Progress calculation | 340 | < 1000ms | PASS |
| Dashboard KPI | 768 | < 2000ms | PASS |
| OCM register | 2242 | < 5000ms | PASS |
| 5 concurrent classifications | 729 | No deadlocks | PASS |
| Report generation (audit trail) | 955 | < 5000ms | PASS |

---

## CRITICAL FINDINGS

### Blocking Issues

1. **Cross-Assessment Step Classification NOT Blocked (Suite 4/10):** A step from Assessment A's scope (J60) can be classified under Assessment B even though J60 is not selected in B's scope. The PUT `/api/assessments/{B}/steps/{stepFromA}` returns 200 instead of 403/404. This is a **data isolation violation** — step responses leak across assessments.

2. **Hierarchy Tables Empty (Suite 1):** The `SolutionProcess`, `ProcessFlow`, and `Activity` tables have 0 rows. This means the hierarchy tree is non-functional. The UI process map view would show empty trees. The data ingestion pipeline (`scripts/ingest-sap-zip.ts`) may not be populating these tables.

### Gaps Found (features not yet testable)

1. **Most Reports Gated by Status:** 11 of 15 report endpoints require the assessment to be in `pending_validation` or later status. This is by design but means reports cannot be tested without advancing through the full 12-state machine, which requires prerequisites at each gate.

2. **GET Gap Detail Endpoint Missing:** `/api/assessments/{id}/gaps/{gapId}` only supports PUT, not GET. There's no way to fetch individual gap details via the API.

3. **Conversation Templates Empty:** The ConversationTemplate table has 0 rows and no admin endpoint was tested for creating them. The conversation flow endpoint returns 200 but with empty data.

4. **RBAC Testing Limited:** The concurrent session limit (1 per user) means creating a viewer-role session immediately revokes the admin session. Multi-role testing would require separate test users or a session-limit override.

### Security Concerns

1. **Cross-Assessment Step Response Leakage:** As noted above, step responses can be created across assessment boundaries. The step-response PUT endpoint validates the processStep exists but does NOT verify that the scope item is selected in the target assessment.

2. **Non-Existent Scope Item Returns 200:** `GET /api/catalog/scope-items/NONEXISTENT/steps` returns `{ data: [], nextCursor: null, hasMore: false }` with status 200. Should return 404 to distinguish "no steps" from "scope item doesn't exist."

---

## API ROUTE MAP (Discovered & Tested)

| Method | Endpoint | Auth | Status | Notes |
|---|---|---|---|---|
| POST | /api/auth/test-login | No | 200 | E2E login with secret |
| GET | /api/health | No | 200 | Health check |
| GET | /api/roles | Yes | 200 | Role definitions |
| GET | /api/assessments | Yes | 200 | List assessments |
| POST | /api/assessments | Yes | 201 | Create assessment (companyName, industry, country, companySize) |
| GET | /api/assessments/{id} | Yes | 200 | Get assessment detail |
| DELETE | /api/assessments/{id} | Yes | 200 | Delete assessment |
| GET | /api/assessments/{id}/profile | Yes | 200 | Get company profile + completeness |
| PUT | /api/assessments/{id}/profile | Yes | 200 | Update company profile |
| GET | /api/assessments/{id}/transitions | Yes | 200 | Available transitions |
| POST | /api/assessments/{id}/transitions | Yes | 200 | Execute transition |
| GET | /api/assessments/{id}/transitions/history | Yes | 200 | Transition audit trail |
| GET | /api/assessments/{id}/scope | Yes | 200 | List scope selections |
| PUT | /api/assessments/{id}/scope/{scopeItemId} | Yes | 200 | Set scope selection |
| GET | /api/assessments/{id}/steps | Yes | 200 | List step responses (paginated) |
| PUT | /api/assessments/{id}/steps/{stepId} | Yes | 200 | Classify single step |
| POST | /api/assessments/{id}/steps/bulk | Yes | 200 | Bulk classify steps |
| GET | /api/assessments/{id}/gaps | Yes | 200 | List gap resolutions |
| PUT | /api/assessments/{id}/gaps/{gapId} | Yes | 200 | Update gap resolution |
| GET | /api/assessments/{id}/phases | Yes | 200 | Phase progress |
| GET | /api/assessments/{id}/activity | Yes | 200 | Activity feed |
| GET | /api/assessments/{id}/integrations | Yes | 200 | Integration register |
| GET | /api/assessments/{id}/integrations/summary | Yes | 200 | Integration summary |
| GET | /api/assessments/{id}/data-migration | Yes | 200 | DM register |
| GET | /api/assessments/{id}/data-migration/summary | Yes | 200 | DM summary |
| GET | /api/assessments/{id}/ocm | Yes | 200 | OCM impacts |
| GET | /api/assessments/{id}/ocm/summary | Yes | 200 | OCM summary |
| GET | /api/assessments/{id}/ocm/heatmap | Yes | 200 | OCM heatmap |
| GET | /api/assessments/{id}/workshops | Yes | 200 | List workshops |
| POST | /api/assessments/{id}/workshops | Yes | 201 | Create workshop |
| GET | /api/assessments/{id}/workshops/{id} | Yes | 200 | Workshop detail |
| GET | /api/assessments/{id}/conversation/sessions | Yes | 200 | Conversation sessions |
| GET | /api/assessments/{id}/conversation/{scopeItemId} | Yes | 200 | Conversation flow |
| GET | /api/assessments/{id}/report/audit-trail | Yes | 200 | Audit trail (no status gate) |
| GET | /api/assessments/{id}/report/readiness-scorecard | Yes | 200 | Scorecard (no status gate) |
| GET | /api/assessments/{id}/report/remaining-register | Yes | 200 | Remaining (no status gate) |
| GET | /api/assessments/{id}/report/history | Yes | 200 | Report generation history |
| GET | /api/assessments/{id}/report/branding | Yes | 200 | Report branding config |
| GET | /api/assessments/{id}/report/executive-summary | Yes | 400* | *Requires status ≥ pending_validation |
| GET | /api/assessments/{id}/report/gap-register | Yes | 400* | *Same gate |
| GET | /api/assessments/{id}/report/step-detail | Yes | 400* | *Same gate |
| GET | /api/assessments/{id}/report/complete-package | Yes | 400* | *Same gate |
| GET | /api/catalog/scope-items/{id}/hierarchy | Yes | 200 | Hierarchy tree |
| GET | /api/catalog/scope-items/{id}/steps | Yes | 200 | Process steps (paginated) |
| GET | /api/catalog/scope-items/{id}/configs | Yes | 200 | Config activities |
| GET | /api/dashboard | Yes | 200 | Main dashboard |
| GET | /api/dashboard/activity | Yes | 200 | Activity stream |
| GET | /api/dashboard/attention | Yes | 200 | Attention items |
| GET | /api/dashboard/deadlines | Yes | 200 | Deadlines |
| GET | /api/dashboard/conflicts | Yes | 200 | Conflicts |
| GET | /api/dashboard/kpi/{assessmentId} | Yes | 200 | KPI metrics |
| GET | /api/dashboard/heatmap/{assessmentId} | Yes | 200 | Progress heatmap |
| GET | /api/admin/conversation-templates | Yes | 200 | Conversation templates |

---

## RECOMMENDATIONS

1. **FIX (Critical):** Add scope-item validation to step response PUT endpoint — verify the step's scope item is selected in the target assessment before allowing classification.

2. **FIX (Minor):** Return 404 for non-existent scope item in catalog steps endpoint instead of empty 200.

3. **ADD:** GET handler for `/api/assessments/{id}/gaps/{gapId}` to allow fetching individual gap details.

4. **DATA:** Populate `SolutionProcess`, `ProcessFlow`, and `Activity` tables via the ingestion pipeline to enable full hierarchy tree functionality.

5. **TEST INFRA:** Add a test-login variant that doesn't revoke existing sessions, or increase concurrent session limit for test users, to enable multi-role RBAC testing.

6. **REPORT TESTING:** Create a test helper that advances an assessment through all state transitions to `pending_validation` to enable full report generation testing.
