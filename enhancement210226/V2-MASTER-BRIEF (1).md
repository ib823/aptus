# ABeam V2 — Master Brief

> **What this file is:** The single source of truth for generating V2 enhancement specifications for the ABeam platform. Contains: the requirements framework, the codebase conventions to follow, the spec format to use, and the exact phases to produce. Claude Code CLI reads this file and produces all specification documents from it.

---

# PART A — THE REQUIREMENTS FRAMEWORK

This part defines WHAT needs to be built — all roles, lifecycle phases, data models, UX scenarios, process flows, and edge cases.

---

## A1. Project Context

ABeam is a presales/solutioning accelerator for SAP Cloud implementations. It digitizes the Fit-to-Standard workshop process — the critical early-stage activity where implementation partners evaluate client requirements against SAP Best Practices to determine fit, configuration needs, and gaps.

The platform currently has 9 completed build phases (Phases 0-9), covering: project scaffolding, SAP catalog ingestion, authentication, scope selection, process deep dive, gap resolution, configuration matrix, report generation, intelligence layer admin, and production polish.

V2 enhancements address the gaps identified through systematic analysis of all user roles, lifecycle phases, and scenarios that the current platform does not cover.

## A2. Gap Analysis — What V2 Must Address

### What exists and works well:
- Core Fit-to-Standard flow (Scope → Steps → Gaps → Config → Report)
- Clean Core extensibility hierarchy (Key User → BTP → ISV → Custom ABAP)
- Role-based access with area locking (5 roles: process_owner, it_lead, executive, consultant, admin)
- Decision audit trail
- Report output package (9 reports + ZIP bundle)
- Remaining items auto-detection

### What is partially addressed and needs enrichment:
1. **Company Profile** — Currently captures only: company name, industry (free text), country, company size, revenue band, current ERP. Missing: legal entity count, plant count, user counts, deployment model, go-live target, chart of accounts, regulatory requirements, fiscal year variant.
2. **Scope Selection** — Missing: current system per scope item, transaction volume, pain points, business criticality, phase assignment, dependency enforcement.
3. **Step Response** — Missing: business justification for GAP, change impact for FIT, confidence level, regulatory flag, volume indicator, integration/migration dependency flags.
4. **Gap Resolution** — costEstimate exists in data model but not surfaced in UI. Missing: alternatives considered, gap-to-gap dependencies, vendor/BTP details, phase assignment, WORKAROUND and PHASE_2 resolution types.
5. **Industry field** — Currently free text input; should be dropdown from IndustryProfile codes.

### What is completely missing:
1. **Integration Assessment Register** — No structured integration capture. Integrations represent 30-40% of implementation effort.
2. **Data Migration Assessment Register** — No structured data migration capture. Data migration is 20-25% of effort and #1 cause of go-live delays.
3. **OCM Impact Assessment** — No organizational change management capture.
4. **Project Manager role** — Currently conflated with Consultant.
5. **Data Migration Specialist role** — Not represented.
6. **Integration Architect role** — Different from IT Lead, not represented.
7. **Viewer / Compliance roles** — Not represented.
8. **Assessment lifecycle granularity** — Current 5-status machine is too coarse.
9. **Notification system** — No notifications for decisions needed, deadlines, conflicts, stalled areas.
10. **Enterprise process visualization** — Current flow diagrams are step-level only, no enterprise map, area map, or integration overlay.
11. **Workshop management** — No scheduling, preparation, synthesis, attendance, or action item tracking.
12. **Conversation mode** — Business users must review 102K steps in checklist mode; no scenario-based alternative.
13. **Role-specific dashboards** — Current dashboard is generic; executives, PMs, consultants all see the same view.
14. **Onboarding for late joiners** — No catch-up mechanism when stakeholders join mid-assessment.
15. **Multi-layer validation** — Current sign-off is binary; no per-area or per-layer validation.
16. **Cross-assessment analytics** — No benchmarking or template creation from past assessments.
17. **Concurrent edit handling** — Last-write-wins with no conflict detection.
18. **Mobile experience** — Not assessed or optimized.
19. **Role-specific invitation and onboarding** — All roles receive the same generic "Sign in to ABeam" email. No role context, no expected time commitment, no guidance on what they'll be asked to do. Executive gets the same onboarding as a Key User.
20. **MFA appropriateness per role** — All external roles forced through TOTP authenticator setup. Executive with 10 minutes to approve 3 items shouldn't need to install an authenticator app.
21. **Real-time collaboration** — No presence indicators, no activity feed, no commenting/annotations, no @mentions, no "someone is editing this" awareness. Assessment teams of 5-15 people work blind to each other.
22. **Review and approval request workflows** — No structured way for consultant to request "please review your area" or "please approve this gap resolution." Currently relies on external communication (email, Slack, verbal).
23. **Access lifecycle management** — No account expiry, no engagement-end access revocation, no dormant account handling.

## A3. Complete Role Taxonomy

### Client-Side Roles

| Role ID | Name | Time Available | Decision Authority | Primary Concern |
|---------|------|---------------|-------------------|----------------|
| C-EXEC | Executive Sponsor | 30 min/week max | Final approval on budget, timeline, scope | Will this work? What's the risk/cost? |
| C-STEER | Steering Committee Member | 1-2 hours/month | Escalation resolution | Are we on track? |
| C-FHEAD | Functional Area Head | 2-4 hours/week | Scope and fit decisions for their area | Does this cover what my team needs? |
| C-PO | Process Owner | 4-8 hours/week | Fit/Gap classification, current state docs | Will SAP handle our specific way of working? |
| C-KU | Key User / Power User | 2-4 hours/week | Step validation, test scenario input | Will this work day-to-day? |
| C-IT | IT Lead / IT Manager | 4-6 hours/week | Integration decisions, technical feasibility | How does this connect to our other systems? |
| C-IARCH | Integration Architect | 2-4 hours/week | Integration pattern selection, API strategy | What's the middleware design? |
| C-DM | Data Migration Lead | 2-4 hours/week | Data object scope, quality, source mapping | What data goes into SAP? How clean is it? |
| C-COMP | Compliance / Legal | 1-2 hours/month | Regulatory requirement validation | Does this meet regulatory obligations? |
| C-OCM | Change Management Lead | 2-4 hours/week | Impact assessment, training, readiness | How many people are affected? What training? |
| C-PM | Client Project Manager | 2-4 hours/week | Timeline, resource allocation, risk | Is the assessment on schedule? |

### Partner / Consulting Roles

| Role ID | Name | Scope | Primary Concern |
|---------|------|-------|----------------|
| P-LEAD | Engagement Lead | Portfolio of assessments | Profitable? Satisfied clients? Patterns? |
| P-PM | Delivery Project Manager | Single assessment | On schedule, on budget? Escalations? |
| P-FCON | Functional Consultant | Single functional area | Accurate fit/gap? Missing gaps? Realistic resolution? |
| P-TCON | Technical Consultant | Technical aspects across areas | Feasible integrations? Correct extensions? |
| P-DMCON | Data Migration Consultant | Data migration workstream | Complete data scope? Realistic volumes? |
| P-ARCH | Solution Architect | End-to-end solution | Does it hang together? Architectural conflicts? |

### Platform Roles

| Role ID | Name | Primary Concern |
|---------|------|----------------|
| A-ADMIN | Platform Administrator | Platform health, access, ingestion pipelines |
| A-INTEL | Intelligence Curator | Industry profiles, baselines, patterns accuracy |

### What each role must NEVER be asked to do:

- C-EXEC: Review individual process steps, navigate complex UIs, spend >15 min per session
- C-FHEAD: Review outside their area, make technical architecture decisions
- C-PO: Make budget decisions, approve solutions they don't technically understand
- C-IT: Make business process decisions, validate functional requirements they don't own
- P-PM: Make functional fit/gap decisions, override consultant classifications

## A4. Complete Lifecycle Phases

### Phase 0: Pre-Engagement
Steps: Client qualification → Engagement scoping → Proposal/pricing → Contract → Platform setup → Team onboarding
[OPEN QUESTION: Should ABeam support this phase or does it happen outside the tool?]

### Phase 1: Assessment Setup (Current "Draft")
Steps: Company profile → Stakeholder assignment → Industry profile selection → Workshop planning → Pre-assessment questionnaire → Quality gate: Ready to begin

### Phase 2: Scope Selection (Current)
Steps: Area review → Current state documentation → Dependency validation → Cross-functional alignment → Scope finalization → Quality gate: Scope complete

### Phase 3: Process Deep Dive (Current)
Steps: Workshop preparation → Process walkthrough (business) → Process walkthrough (technical) → Step classification → Gap documentation → Workshop synthesis → Cross-session reconciliation → Quality gate: Review complete

### Phase 4: Gap Resolution (Current)
Steps: Gap triage → Resolution evaluation → Resolution recommendation → Client review → Cost-benefit analysis → Executive decision on high-cost items → Quality gate: Gaps resolved

### Phase 5: Integration Assessment (NEW)
Steps: Integration point identification → Classification (pattern/direction/frequency) → API availability assessment → Middleware decision → Complexity scoring → Quality gate: Integration complete

### Phase 6: Data Migration Assessment (NEW)
Steps: Data object inventory → Source system mapping → Volume estimation → Quality assessment → Migration approach selection → Historical data decision → Quality gate: DM complete

### Phase 7: Configuration Review (Current)
Steps: Config matrix review → Self-service vs consultant split → Quality gate: Config complete

### Phase 8: OCM Assessment (NEW)
Steps: Impact assessment → Stakeholder mapping → Training needs analysis → Readiness score → Key user identification

### Phase 9: Blueprint Synthesis & Validation
Steps: Blueprint compilation → Process Owner validation (per area) → Cross-functional validation → Technical validation → Executive validation → Digital sign-off

### Phase 10: Handoff & Transition (NEW)
Steps: Realize phase planning input → Team transition briefing → Assessment archival → Lessons learned

### Extended Status Machine
```
SETUP → SCOPE_IN_PROGRESS → SCOPE_LOCKED → PROCESS_REVIEW_IN_PROGRESS → GAP_RESOLUTION_IN_PROGRESS → [INTEGRATION / DATA_MIGRATION / OCM in parallel] → VALIDATION_IN_PROGRESS → PENDING_SIGN_OFF → SIGNED_OFF → HANDED_OFF → REASSESSMENT_NEEDED
```
Must map cleanly from existing: draft → in_progress → completed → reviewed → signed_off

## A5. Complete Data Capture Requirements

### A5.1 Company Profile — New Fields

| Field | Type | Required | Condition |
|-------|------|----------|-----------|
| subIndustry | Text/Selection | No | If industry is broad |
| operatingCountries | Multi-select ISO | Yes | Always (currently exists but auto-set to primary) |
| legalEntityCount | Int | Yes | Always — drives scope complexity |
| plantCount | Int | Conditional | If manufacturing scope selected |
| warehouseCount | Int | Conditional | If warehouse scope selected |
| salesOrgCount | Int | Conditional | If sales scope selected |
| purchasingOrgCount | Int | Conditional | If procurement scope selected |
| chartOfAccountsApproach | Selection (Group/Operational/Country) | Yes | Always |
| fiscalYearVariant | Text | Yes | Always |
| currentErpVersion | Text | Conditional | If current ERP is SAP |
| deploymentModel | Selection (Public Cloud/RISE Private/Undecided) | Yes | Always |
| goLiveTarget | Date | Yes | Always |
| goLiveApproach | Selection (Big Bang/Phased by Area/Phased by Country/Hybrid) | Yes | Always |
| namedUserCount | JSON (Professional/Developer/SelfService counts) | Yes | Always |
| concurrentUsersPeak | Int | Recommended | Always |
| currentIntegrationCount | Int | Yes | Always |
| currentMiddleware | Selection+Other | Conditional | If integrations exist |
| regulatoryRequirements | String[] | Yes | Multi-select (SOX/GxP/IFRS/GDPR/etc.) |
| assessmentObjectives | String[] | Yes | Multi-select (Blueprint/Vendor comparison/License sizing/Roadmap) |

All new fields MUST be optional or have defaults — existing assessments cannot break.

### A5.2 Scope Selection — New Fields

| Field | Enhancement |
|-------|-------------|
| relevance | Add "DEFERRED" option (relevant but Phase 2+) |
| currentSystem | New: which system handles this today (text) |
| transactionVolume | New: Low/Medium/High selection |
| painPoints | New: text field for current process pain points |
| businessCriticality | New: Critical/High/Medium/Low selection |
| phaseAssignment | New: Phase1/Phase2/Future selection |
| dependencyAcknowledged | New: boolean — user confirmed prerequisites reviewed |

### A5.3 Step Response — New Fields

| Field | Purpose |
|-------|---------|
| businessJustification | Why can't SAP handle this? (required when GAP) |
| changeImpact | What changes even when FIT? (text) |
| confidenceLevel | High/Medium/Low — respondent's confidence |
| regulatoryFlag | Boolean + which regulations |
| volumeIndicator | How many times per day/week/month |
| integrationFlag | Does this step involve external systems? (seeds integration register) |
| dataMigrationFlag | Does this step require migrated data? (seeds DM register) |

### A5.4 Gap Resolution — New Fields + UI Surfacing

| Field | Purpose |
|-------|---------|
| costEstimate | ALREADY EXISTS in model — must be surfaced in UI (oneTime + recurring) |
| alternativesConsidered | JSON — which other options were evaluated and why rejected |
| gapDependencies | String[] — IDs of other gaps this depends on |
| prerequisitesForTesting | Text — what's needed to test this resolution |
| vendorDetails | JSON — ISV product name, contact, license model |
| btpServiceDetails | JSON — which BTP services, runtime estimates |
| phaseAssignment | Phase1/Phase2/Future |
| resolutionType | Add WORKAROUND and PHASE_2 to existing union |

### A5.5 Integration Register — Complete New Model

| Field | Type | Required |
|-------|------|----------|
| id | cuid | Auto |
| assessmentId | FK to Assessment | Yes |
| name | String | Yes |
| description | Text | Yes |
| sourceSystem | String | Yes |
| targetSystem | String | Yes |
| direction | Enum (INBOUND/OUTBOUND/BIDIRECTIONAL) | Yes |
| dataObjects | String[] | Yes |
| frequency | Enum (REAL_TIME/NEAR_REAL_TIME/HOURLY/DAILY/WEEKLY/MONTHLY/ON_DEMAND) | Yes |
| expectedVolume | String | Yes |
| currentMethod | String | No |
| proposedMethod | Enum (STANDARD_ODATA/STANDARD_BAPI/STANDARD_IDOC/CPI/FILE_BASED/CUSTOM_API/NOT_DETERMINED) | Yes |
| sapStandardApiAvailable | Boolean | Yes |
| sapApiReference | String | No |
| middlewareRequired | Boolean | Yes |
| middlewarePlatform | String | No |
| complexity | Enum (SIMPLE/MEDIUM/COMPLEX/VERY_COMPLEX) | Yes |
| errorHandling | Text | No |
| relatedScopeItemIds | String[] | Yes |
| relatedProcessStepIds | String[] | No |
| relatedGapId | String (FK) | No |
| effortDays | Float | No |
| owner | String | No |
| status | Enum (IDENTIFIED/ASSESSED/DESIGNED/NOT_NEEDED) | Yes |
| riskNotes | Text | No |
| createdAt/updatedAt | DateTime | Auto |

### A5.6 Data Migration Register — Complete New Model

| Field | Type | Required |
|-------|------|----------|
| id | cuid | Auto |
| assessmentId | FK to Assessment | Yes |
| dataObjectName | String | Yes |
| dataCategory | Enum (MASTER_DATA/OPEN_TRANSACTIONAL/HISTORICAL/CONFIGURATION/REFERENCE) | Yes |
| sapTargetObject | String | Yes |
| sourceSystem | String | Yes |
| sourceTable | String | No |
| recordCount | Int | Yes |
| dataSizeMb | Float | No |
| dataQuality | Enum (GOOD/FAIR/POOR/UNKNOWN) | Yes |
| cleansingRequired | Boolean | Yes |
| cleansingDescription | Text | No |
| transformationComplexity | Enum (NONE/SIMPLE_MAPPING/COMPLEX_TRANSFORM/BUSINESS_LOGIC) | Yes |
| migrationApproach | Enum (MIGRATION_COCKPIT/MIGRATION_OBJECT_MODELER/LSMW/CUSTOM_ABAP/MANUAL/NOT_DETERMINED) | Yes |
| migrationSequence | String | No |
| cutoverApproach | Enum (FULL_LOAD/DELTA_LOAD/MANUAL/NOT_APPLICABLE) | No |
| historicalDataScope | Text | No |
| relatedScopeItemIds | String[] | Yes |
| owner | String | No |
| status | Enum (IDENTIFIED/ASSESSED/MAPPED/TESTED/NOT_NEEDED) | Yes |
| effortDays | Float | No |
| riskNotes | Text | No |
| createdAt/updatedAt | DateTime | Auto |

### A5.7 OCM Impact Register — Complete New Model

| Field | Type | Required |
|-------|------|----------|
| id | cuid | Auto |
| assessmentId | FK to Assessment | Yes |
| impactedRole | String | Yes |
| userCount | Int | Yes |
| locations | String[] | Yes |
| processChangeDescription | Text | Yes |
| changeSeverity | Enum (HIGH/MEDIUM/LOW) | Yes |
| currentTool | String | Yes |
| newTool | String | Yes |
| trainingType | String[] (CLASSROOM/ELEARNING/ON_THE_JOB/SIMULATION/NONE) | Yes |
| trainingDurationHours | Float | No |
| keyUserIdentified | Boolean | No |
| keyUserName | String | No |
| relatedScopeItemIds | String[] | Yes |
| readinessRisk | Enum (HIGH/MEDIUM/LOW) | No |
| notes | Text | No |
| createdAt/updatedAt | DateTime | Auto |

## A6. UX Scenarios by Role

### Executive (C-EXEC)
- Sees: High-cost gap approvals only, summary dashboards, sign-off page
- Does: Approve/reject high-cost items, final validation, sign-off
- Never sees: Individual process steps, detailed configuration
- Time budget: 15 min max per session, 3 clicks max to reach a decision

### Process Owner (C-PO)
- Sees: Scenario-based guided walkthrough (conversation mode) OR step checklist (their choice)
- Does: Answers business questions, flags gaps, describes current approach, validates classifications
- Never sees: Other areas, technical architecture, budget details
- Time budget: 2-4 hours per area across sessions

### IT Lead (C-IT)
- Sees: Technical notes pane, integration landscape, data migration overview
- Does: Flags integration points, validates technical feasibility, leads integration assessment
- Never sees: Budget approvals, organizational change details
- Time budget: 4-8 hours for integration assessment

### Functional Consultant (P-FCON)
- Sees: Everything in their area — pre-workshop prep, step-level checklist, gap resolution, config matrix
- Does: Facilitates workshops, classifies steps, proposes resolutions, generates reports
- Time budget: Heaviest user — continuous throughout assessment

### Project Manager (P-PM)
- Sees: Progress dashboard, blockers, timeline, stakeholder engagement, quality gates
- Does: Tracks progress, manages escalations, coordinates schedules, approves phase transitions
- Never does: Fit/gap classification, resolution decisions

## A7. Process Flow Visualization Types

| Level | Name | Users | Data Source |
|-------|------|-------|------------|
| L0 | Enterprise Scope Map | C-EXEC, P-PM | Scope selections by functional area |
| L1 | Functional Area Map | C-FHEAD, P-FCON | Scope items + process flow groups within area |
| L2 | Process Flow Diagram | C-PO, P-FCON | Process steps with fit status (EXISTING — enhance) |
| L3 | Step Detail Card | P-FCON, C-PO | Process step + response (EXISTING) |
| I1 | Integration Landscape Map | C-IT, C-IARCH | Integration register mapped to scope items |
| D1 | Data Migration Map | C-DM, P-DMCON | Data migration register |
| O1 | Organizational Impact Map | C-OCM, C-EXEC | OCM impact register heatmap |
| X1 | Cross-Functional Dependency Map | P-ARCH | Shared processes between areas with conflict indicators |

## A8. Notification Events

| Event | Who | Urgency |
|-------|-----|---------|
| Gap requires executive approval | C-EXEC | High — immediate email |
| Stakeholder inactive >7 days | P-PM | Warning |
| Cross-functional conflict detected | P-PM + involved P-FCONs | High |
| Quality gate ready | P-PM | Normal |
| Status transition | All stakeholders | Normal |
| Scope change requested | P-PM, P-LEAD | High |
| Sign-off requested | C-EXEC, P-LEAD, P-PM | High — immediate email |
| Decision overdue >N days | Decision owner + P-PM | Warning |

## A9. Edge Cases and Failure Modes

| Scenario | Mitigation |
|----------|-----------|
| Rubber-stamper (marks everything FIT) | Confidence indicator, minimum time threshold, quality signal on dashboard |
| Ghost stakeholder (never logs in) | Auto-reminders 7/14/21 days, escalation to PM, reassignment |
| Scope creep after lock | Formal change request with impact analysis |
| Decision reversal weeks later | Impact analysis on reversal, ripple effect detection |
| Simultaneous edit conflict | Optimistic locking with conflict notification |
| Consultant turnover mid-assessment | Auto-generated handoff summary, stranger onboarding |
| Cross-area contradiction | Automated detection, flagged for resolution |
| SAP version mismatch (assessed on 2508, live on 2511) | Version comparison tool, delta report |

## A10. Open Questions (Require Business Decisions)

| # | Question | Affects Phases |
|---|----------|---------------|
| 1 | Should ABeam support Phase 0 (presales/engagement scoping)? | 18, 26 |
| 2 | Should ABeam support brownfield/system conversion? | All (scope of V2) |
| 3 | What's the licensing/commercial model? | 26 |
| 4 | Single firm tool or multi-partner SaaS? | 17, 26 |
| 5 | AI/LLM for conversation mode scenarios? | 22 |
| 6 | What cost threshold triggers executive approval? | 13, 19, 23 |
| 7 | Standard workshop cadence and duration? | 21 |
| 8 | Integration with Jira/Confluence/SAP Cloud ALM for handoff? | 18, 25 |
| 9 | Where do scope item dependencies come from? Structured list or parsed from DOCX? | 11 |
| 10 | What SAP API catalog to use for integration assessment? | 14 |

---

# PART B — CODEBASE CONVENTIONS

This part defines HOW the specs must be written to align with the existing codebase.

---

## B1. Technology Stack (Do NOT Change)
- Next.js 16 (App Router), React 19, TypeScript strict mode
- Prisma 6 + PostgreSQL, shadcn/ui + Tailwind v4 + Lucide React
- NextAuth v4 (magic link + TOTP MFA), Zod v4
- Vitest (unit), Playwright (e2e), pnpm
- jsPDF + jspdf-autotable (PDF), ExcelJS (XLSX), sanitize-html

## B2. File Structure
```
prisma/schema.prisma           — ALL models (3-layer: Catalog / Intelligence / Assessment)
src/app/(portal)/              — Authenticated pages
src/app/(portal)/admin/        — Admin pages
src/app/(portal)/assessment/[id]/  — Assessment sub-pages
src/app/api/                   — API routes
src/components/{domain}/       — Domain components (admin, gaps, scope, review, report, etc.)
src/components/shared/         — Shared (EmptyState, LoadingSkeleton, PermissionDenied)
src/components/ui/             — shadcn primitives (DO NOT modify)
src/constants/                 — UI text, step types, etc.
src/lib/auth/                  — Auth (session, permissions, admin-guard, totp)
src/lib/db/                    — Database query modules (one per entity group)
src/lib/report/                — Report generation (PDF, XLSX, flow diagrams)
src/types/                     — Type definitions
tests/unit/                    — Vitest tests
tests/e2e/                     — Playwright tests
specs/                         — Specifications
```

## B3. Coding Rules (MANDATORY in all specs)
1. Server components by default. `"use client"` only for interactivity.
2. Data fetching in server components only — pass as props.
3. `useMemo` for derived state. Never `useEffect` + `setState` for computed values.
4. Zod validation on ALL API POST/PUT bodies.
5. API success: `{ data: ... }`. API error: `{ error: { code: ERROR_CODES.*, message } }`.
6. Auth on every route: `getCurrentUser()` + MFA check. Admin: `requireAdmin()`.
7. Area-locked permissions for process owners.
8. `DecisionLogEntry` for every state-changing action.
9. No hardcoded strings — all text in `src/constants/ui-text.ts`.
10. Prisma updates: strip `undefined` before `.update()` (exactOptionalPropertyTypes).
11. Component naming: PascalCase, client components suffixed `*Client.tsx`.

## B4. Quality Gates
```
pnpm typecheck:strict   → 0 errors
pnpm lint:strict        → 0 errors, 0 warnings
pnpm build              → success
pnpm test --run         → all tests passed
```

## B5. Current State
- Phases 0-9: ALL COMPLETE
- 197 unit tests, 69 routes
- 5 roles: process_owner, it_lead, executive, consultant, admin
- 5 statuses: draft, in_progress, completed, reviewed, signed_off
- 21 Prisma models across 3 layers

## B6. What Must Not Break
- All 550 scope items and 102,261 process steps
- Ingestion pipeline, verification pipeline
- All existing API route contracts
- All existing database tables and relationships
- Auth system (magic link + TOTP MFA)
- Existing role and status systems

---

# PART C — SPEC FORMAT

Every phase spec MUST contain ALL 16 sections below. No exceptions. If not applicable, state why.

```
## 1. Objective
## 2. Prerequisites
## 3. Database Schema Changes (full Prisma syntax, showing existing + new fields)
## 4. Type Definitions (TypeScript types + Zod schemas)
## 5. API Routes (method, path, auth, request/response, side effects)
## 6. Database Query Modules (function signatures, query logic)
## 7. Server Components / Pages (route, data fetching, auth checks)
## 8. Client Components (props, state, interactions, accessibility)
## 9. Constants and UI Text
## 10. Unit Tests (file path, describe/it structure, expected count)
## 11. E2E Tests
## 12. Task Breakdown (numbered, | # | Task | Done | format, [ ] unchecked)
## 13. Quality Gate Criteria
## 14. HANDOFF Notes Template
## 15. Dependencies and Risks
## 16. Backward Compatibility
```

Rules:
- New fields on existing models: MUST be optional or have defaults
- New type union members: ADDITIVE only (never remove existing)
- Show BOTH existing AND new fields in modified Prisma models
- Use `[VERIFY: ...]` for uncertain SAP claims
- Use `[OPEN QUESTION: ...]` for unresolved business decisions (reference A10)
- Use `[ASSUMPTION: ...]` for choices that could go either way
- Each task in breakdown: independently implementable in 1-4 hours

---

# PART D — PHASE DEFINITIONS

## Phase 10: Company Profile Enrichment
**Source:** A5.1. Extend Assessment model + CompanyProfileForm. Industry becomes dropdown from IndustryProfile. Conditional fields. Update reports.

## Phase 11: Scope Selection Enhancement
**Source:** A5.2. New fields on ScopeSelection. DEFERRED relevance. Dependency enforcement. Update reports.

## Phase 12: Step Response Enrichment & Content Presentation
**Source:** A5.3 new response fields + Addendum 3 entirely. New fields on StepResponse. Integration/migration flags seed Phases 14-15. Update reports. PLUS: Step type classification engine (Addendum 3 Section 2 — classify steps by tag into StepCategory, auto-mark non-classifiable). Content parser for SAP text into collapsible sections (Addendum 3 Section 3). Decision-first card layout — classification above content. Step grouping by activity field (Addendum 3 Section 4). Segmented progress indicator showing classifiable-only counts. Reference step compact rendering. Configuration activity contextualization (Addendum 3 Section 5).

## Phase 13: Gap Resolution Enhancement
**Source:** A5.4. Surface costEstimate in UI. New fields. WORKAROUND + PHASE_2 types. Update reports.

## Phase 14: Integration Assessment Register
**Source:** A5.5 + A4 Phase 5. New IntegrationPoint model. Full CRUD API. Assessment sub-page at `/assessment/[id]/integrations`. XLSX export. Follow RemainingItems pattern.

## Phase 15: Data Migration Assessment Register
**Source:** A5.6 + A4 Phase 6. New DataMigrationObject model. Full CRUD. Sub-page at `/assessment/[id]/data-migration`. XLSX export.

## Phase 16: OCM Impact Assessment
**Source:** A5.7 + A4 Phase 8. New OcmImpact model. Full CRUD. Sub-page at `/assessment/[id]/ocm`. XLSX export.

## Phase 17: Role System, Organization Model, and Enterprise Auth
**Source:** A3 + Addendum Section 1. Implement 11-role model (Addendum 1.3). Create Organization tenant model (Addendum 1.2). Add SSO (SAML/OIDC) support for partner and client orgs (Addendum 1.4). Add SCIM provisioning endpoint. Add multi-assessment context switching. Existing 5 roles map cleanly to new model (Addendum 1.3 migration table). MFA policy per role (Addendum 1.4).

## Phase 18: Assessment Lifecycle Enhancement
**Source:** A4 state machine. Extend status values. Provide old→new mapping. Quality gates. Parallel workstream tracking. Scope change management.

## Phase 19: Notification System, WebSocket Infrastructure, and Presence
**Source:** A8 + Addendum Sections 3.2 (Layer 1) and 3.4. New Notification model. Async creation. All events from A8. User preferences. In-app + email + Web Push (for PWA). WebSocket server for real-time event broadcasting. Presence awareness (who is online, what they're viewing). This phase builds the real-time infrastructure that Phases 20-24 and 28 depend on.

## Phase 20: Process Visualization Enhancement
**Source:** A7. Enterprise Map (L0), Area Map (L1), Integration Map (I1), Dependency Map (X1). Coexist with existing flow viewer.

## Phase 21: Workshop Management and Workshop Mode
**Source:** A6 consultant scenarios, A4 Phase 3 + Addendum Section 4. New Workshop models. Scheduling, prep, synthesis, attendance, action items. Workshop Mode: synchronized navigation across devices, live classification polling, QR code join for attendees, facilitator large-font projector view, auto-generated workshop minutes. Supports in-person, remote, and hybrid scenarios (Addendum 4.1-4.2).

## Phase 22: Conversation Mode
**Source:** A6 process owner scenarios. ScenarioTemplate model. Auto-mapping algorithm. Dual mode toggle. Fallback to checklist. MOST COMPLEX PHASE.

## Phase 23: Intelligent Dashboard
**Source:** A6 all roles. Role-specific views. "What Needs Attention" queue. Stalled/conflict/rubber-stamper detection.

## Phase 24: Onboarding, Contextual Handoff, and User Lifecycle
**Source:** A6 stranger/late joiner + Addendum Sections 1.5 and 1.6. Role-specific first-login flows exactly as defined in Addendum 1.5 (Executive: <1 min, Process Owner: <2 min, Consultant: setup checklist, Late Joiner: catch-up summary, Viewer: no onboarding). SSO-aware onboarding (detect SSO vs magic link). Personal task queue based on role + area + assessment state. User lifecycle management (Addendum 1.6): join, leave, replace, expire, archive. Post-auth only — does NOT touch login/MFA flow.

## Phase 25: Reporting V2
**Source:** A7 outputs. New register reports in blueprint. Updated Executive Summary. Multi-layer validation. Enhanced sign-off.

## Phase 26: Analytics, Benchmarking, Templates, and Portfolio (UPDATED)
**Source:** A10 items 3-4 + Addendum 2 Section 4. Assessment template creation from completed assessments (anonymized, org-scoped). Template marketplace within org. Cross-phase analytics for multi-phase clients. Partner portfolio dashboard. Benchmarking against anonymized aggregates. Return client analytics. Document single-firm assumption.

## Phase 27: Production Hardening, PWA, and Mobile
**Source:** A9 + Addendum Sections 2.1-2.4. PWA implementation: web app manifest, service worker, cache strategies, installable, background sync. Offline capability: cached dashboard, cached process steps, offline step response capture, sync-on-reconnect with conflict detection (Addendum 2.3). Mobile responsive audit per device tier: desktop full, tablet workshop-optimized, mobile approval/status-only (Addendum 2.2). Optimistic locking. WCAG 2.1 AA. Performance thresholds. Data privacy.

## Phase 28: Real-Time Collaboration
**Source:** Addendum Section 3 entirely. Comment model with threading and @mentions (Addendum 3.2 Layer 3). Field-level editing locks with 5-min timeout (Addendum 3.2 Layer 2). Cross-functional conflict detection and resolution workflow (Addendum 3.2 Layer 4). Assessment activity feed (Addendum 3.2 Layer 5). Collaboration permissions by role (Addendum 3.3). Depends on Phase 19 WebSocket infrastructure. Recommended execution: after Phase 19, before Phase 20.

## Phase 29: Platform Commercial & Self-Service
**Source:** Addendum 2 Section 1. Organization/tenant provisioning (self-service signup + sales-assisted). 14-day free trial with demo/sandbox data. Partner admin dashboard (team management, branding, auth settings, subscription). Stripe Billing integration (subscription plans + metered overages). Plan tiers: Starter, Professional, Enterprise. SSO/SCIM configuration UI. Subscription lifecycle (trial → paid → cancel → reactivate). Usage metering (active assessments, partner user seats). Data export and GDPR deletion. Builds on Phase 17 Organization model.

## Phase 30: Assessment Handoff, Sign-Off, and ALM Integration
**Source:** Addendum 2 Section 2. Multi-layer validation workflow (area PO → technical → cross-functional → executive → partner countersign). SignatureRecord with SHA-256 hash, IP, auth method, authority statement. AssessmentSnapshot for immutable versioning. Sign-off certificate PDF with integrity hash and verification URL. Universal Assessment Package (JSON). ALM export adapters: SAP Cloud ALM (REST API), Jira Cloud, Azure DevOps, Confluence. Handoff UI. Transition briefing auto-generation. Archival and data retention. Builds on Phase 18 lifecycle + Phase 25 reports.

## Phase 31: Assessment Lifecycle Continuity
**Source:** Addendum 2 Section 3. Assessment versioning with immutable snapshots and delta comparison. Assessment cloning for Phase 2 carry-forward (selective inheritance, cross-phase dependency detection). Change control workflow (formal change request, partial unlock, re-validation, re-sign). Reassessment triggers (SAP version delta, regulatory, scope expansion). Delta report generation. Builds on Phase 30 snapshot model.
# V2 Master Brief — Addendum: Identity, Mobile, and Collaboration

> **Why this addendum exists:** The original framework (Part A) identified 25 actor types and described what they do, but completely failed to address three critical dimensions:
> 1. How each actor gets into the system, authenticates, and is onboarded
> 2. How the platform works across devices (desktop, tablet, phone, offline)
> 3. How multiple people collaborate in real-time on the same assessment
>
> Without these three dimensions, the specs would produce a tool where nobody can log in properly, nobody can use it on their phone during a workshop, and two consultants editing the same area would overwrite each other's work silently.

---

# ADDENDUM SECTION 1: Identity, Access, and Onboarding Architecture

## 1.1 The Fundamental Identity Problem

ABeam serves TWO organizations simultaneously on the same assessment:
- **The consulting partner** (who runs the assessment)
- **The client** (whose business is being assessed)

These are different companies, different email domains, different security policies, potentially different countries. A consultant from Deloitte and a Finance Director from the client's company both need to access the same assessment — but with completely different trust levels, authentication requirements, and data boundaries.

**Current system treats everyone as individual users with magic link + TOTP MFA. This is insufficient because:**
- Enterprise clients expect SSO (SAML/OIDC) integration with their corporate IdP
- Consulting firms expect SSO with their firm's IdP
- A single user (consultant) may work across multiple client assessments
- A single user (client stakeholder) may participate in assessments with different consulting firms
- External viewers (auditors, ISV partners) need time-limited, read-only access without full accounts
- SCIM provisioning is expected by enterprise IT departments for automated user lifecycle management

## 1.2 Organization and Tenant Model

```
Platform
├── Partner Organization (Consulting Firm A)
│   ├── Users: P-LEAD, P-PM, P-FCON, P-TCON, P-DMCON, P-ARCH
│   ├── Assessments they manage:
│   │   ├── Assessment 1 (Client X)
│   │   │   └── Client Users: C-EXEC, C-FHEAD, C-PO, C-KU, C-IT...
│   │   ├── Assessment 2 (Client Y)
│   │   │   └── Client Users: ...
│   │   └── Assessment 3 (Client Z)
│   │       └── Client Users: ...
│   └── Templates, benchmarks, intelligence (firm-level IP)
├── Partner Organization (Consulting Firm B)
│   ├── Users: ...
│   └── Assessments they manage: ...
└── Platform Administration
    └── Users: A-ADMIN, A-INTEL, A-CATALOG
```

**Key design decisions:**

| Question | Recommended Answer | Rationale |
|----------|-------------------|-----------|
| Is the tenant the partner or the client? | **Partner is the primary tenant.** Clients are invited into partner-owned assessments. | Partners own the IP, pay for the platform, and manage multiple clients. Clients are transient — they're involved for weeks/months then done. |
| Can a client user exist across multiple partners? | **Yes, but with separate stakeholder records.** One global identity, multiple assessment memberships. | A Finance Director might work with Deloitte on Module A and Accenture on Module B. Rare but real. |
| Can a consultant exist across multiple partners? | **No.** Consultant users belong to one partner organization. | Consultants are employees of the firm. If they change firms, they get a new account. |
| Can a client become a partner? | **Not in V2.** Different organizational structures. | Keep it simple. |

## 1.3 Role Mapping: 25 Actor Types → Implementable Roles

The 25 actor types from the framework must map to a manageable set of platform roles. Too many roles create administrative burden. Too few lose the permission granularity we need.

**Recommended role structure (11 roles):**

| Platform Role | Actor Types Covered | Organization Type | Justification |
|--------------|--------------------|--------------------|---------------|
| `platform_admin` | A-ADMIN, A-INTEL, A-CATALOG | Platform | Manages platform, catalog, intelligence layer |
| `partner_lead` | P-LEAD, P-PRESALES | Partner | Engagement partner, sees all assessments, manages firm-level settings |
| `consultant` | P-FCON, P-TCON, P-DMCON, P-ARCH | Partner | Full assessment access, classification, resolution. Sub-specialization handled by assigned areas, not separate roles. |
| `project_manager` | P-PM, C-PM | Both (partner or client) | Progress tracking, scheduling, escalation. Cannot classify FIT/GAP. |
| `executive` | C-EXEC, C-STEER | Client | Approval-only access. High-cost decisions, sign-off. |
| `functional_head` | C-FHEAD | Client | Area-level scope and fit decisions. Sees their area fully. |
| `process_owner` | C-PO, C-KU | Client | Detailed process input. Key users are process owners with deeper operational focus — same permissions. |
| `it_lead` | C-IT, C-IARCH | Client | Technical decisions, integration assessment. Integration architects are IT leads with specialized focus — same permissions. |
| `data_migration_lead` | C-DM | Client | Data migration workstream ownership. Needs own role because the data migration register is a distinct workspace. |
| `change_manager` | C-OCM | Client | OCM impact assessment. Limited access to process details, full access to impact register. |
| `viewer` | X-AUDIT, X-ISV, X-VIEWER, C-COMP | Both | Read-only access. Scoped by area or full assessment depending on assignment. Time-limited for external parties. |

**Migration from current 5 roles:**

| Current Role | Maps To | Change Required |
|-------------|---------|----------------|
| `admin` | `platform_admin` | Rename. Same permissions. |
| `consultant` | `consultant` | No change. |
| `process_owner` | `process_owner` | No change. |
| `it_lead` | `it_lead` | No change. |
| `executive` | `executive` | No change. |
| (new) | `partner_lead` | New role. |
| (new) | `project_manager` | New role. |
| (new) | `functional_head` | New role. |
| (new) | `data_migration_lead` | New role. |
| (new) | `change_manager` | New role. |
| (new) | `viewer` | New role. |

Existing users keep their current roles. New roles are additive.

## 1.4 Authentication Flows Per Role

### 1.4.1 Partner Users (partner_lead, consultant, project_manager)

**Primary auth: SSO via partner firm's IdP (SAML/OIDC)**
```
Partner admin configures SSO in Partner Settings:
  → Uploads IdP metadata (SAML) or configures OIDC endpoints
  → Sets domain claim: @deloitte.com, @accenture.com
  → Optionally configures SCIM endpoint for auto-provisioning

Partner user visits ABeam:
  → Enters email → system detects partner domain
  → Redirects to partner IdP → authenticates
  → Returns with SAML assertion / OIDC token
  → JIT (Just-In-Time) provisioning: if user doesn't exist, create with default role
  → If SCIM is configured: roles and group memberships synced from IdP
  → Session created, user lands on partner dashboard
```

**Fallback auth: Magic link + TOTP MFA (for firms without SSO)**
```
Exactly the current ABeam flow. Preserved as-is.
```

**MFA policy:**
- If SSO: MFA is handled by partner's IdP (ABeam trusts the IdP's MFA)
- If magic link: ABeam MFA (TOTP) required, exactly as current

### 1.4.2 Client Users (executive, functional_head, process_owner, it_lead, data_migration_lead, change_manager)

**Primary auth: Invitation-based magic link**
```
Consultant or PM adds stakeholder to assessment:
  → Enters: name, email, role, assigned functional areas
  → System sends invitation email with magic link
  → Stakeholder clicks link → lands on onboarding page
  → Completes: accept terms, set display name, optional TOTP setup
  → Redirected to their role-specific assessment view
```

**Optional: Client SSO (for enterprise clients)**
```
Client IT admin (or consultant on client's behalf) configures SSO:
  → Same SAML/OIDC flow as partner
  → Domain-based routing: @clientcorp.com users go to client IdP
  → JIT provisioning creates client user with role from invitation
```

**MFA policy:**
- Executive, Functional Head: MFA recommended but optional (configurable by partner per assessment)
- Process Owner, Key User: MFA optional (these users are time-constrained, friction must be minimal)
- IT Lead: MFA required (technical users, accessing sensitive data)
- Viewer: MFA not required (read-only, time-limited access)

**Key principle:** Client user friction must be minimized. These people have day jobs. Every extra authentication step reduces participation rates.

### 1.4.3 External / Peripheral Users (viewer, auditor)

**Auth: Time-limited invitation link**
```
PM or consultant creates viewer access:
  → Enters: name, email, scope (full assessment or specific areas), expiry date
  → System sends invitation with time-limited magic link
  → Viewer clicks link → read-only dashboard, no account creation required
  → Session expires at configured date (default: 30 days)
  → No MFA required
```

**Alternative: Shared read-only link (for steering committee presentations)**
```
Consultant generates assessment summary link:
  → Link contains: encrypted assessment ID + scope filter + expiry
  → Anyone with the link can view (no authentication)
  → Sensitive data (costs, specific gap details) redacted in this view
  → Link expires after configurable period
```

### 1.4.4 Multi-Assessment Context Switching

A consultant works on 5 assessments simultaneously. A partner lead oversees 20.

```
After login, user sees:
  → Assessment switcher in navigation (dropdown or sidebar)
  → Each assessment shows: client name, status, their role, last activity
  → Clicking an assessment enters that assessment's context
  → All subsequent views are scoped to that assessment
  → User can switch assessments without re-authenticating
```

A client user who participates in assessments with different partners:
```
After login (via their corporate SSO or magic link):
  → Sees all assessments they're invited to, regardless of partner
  → Each assessment shows: partner name, client assessment name, status
  → Assessment data is isolated — partner A cannot see partner B's data
```

## 1.5 Onboarding Flows Per Role

### Executive (first login)

```
Screen 1: Welcome
  "Welcome to the [CompanyName] SAP Assessment"
  "Your role: Executive Sponsor"
  "What you'll do: Review key decisions, approve high-cost items, final sign-off"
  "Estimated time commitment: 30 minutes total across the assessment"
  [Continue]

Screen 2: Your Assessment at a Glance
  Visual summary: scope areas selected, team members, timeline
  "Your team is evaluating [X] processes across [Y] areas"
  [Go to Dashboard]
```
Time to complete: < 1 minute. NO configuration, NO preferences, NO tutorial.

### Process Owner (first login)

```
Screen 1: Welcome
  "Welcome to the [CompanyName] SAP Assessment"
  "Your role: [FunctionalArea] Process Owner"
  "What you'll do: Review how SAP handles your team's processes and flag any gaps"
  "Estimated time: 4-6 hours across multiple sessions"
  [Continue]

Screen 2: Your Processes
  List of scope items assigned to them
  "These are the processes your team will review:"
  [List with brief descriptions in plain language, not SAP codes]
  [Continue]

Screen 3: How It Works (30-second explainer)
  "For each process, you'll either:"
  "✓ Confirm SAP's approach works for you (FIT)"
  "⚙️ Note where configuration is needed (CONFIGURE)"
  "⚠️ Flag where SAP doesn't meet your needs (GAP)"
  "You can review processes in guided conversation mode or step-by-step"
  [Start Reviewing] or [I'll come back later]
```
Time to complete: < 2 minutes.

### Consultant (first login on a new assessment)

```
Screen 1: Assessment Setup Checklist
  ☐ Company profile complete
  ☐ All stakeholders invited
  ☐ Industry profile selected
  ☐ Workshop schedule planned
  ☐ Pre-assessment questionnaires sent
  "Complete these before starting scope selection"
  [Begin Setup]
```
Time to complete: This IS the work — no artificial onboarding, just the actual setup workflow.

### Late Joiner / Replacement (any role, mid-assessment)

```
Screen 1: Catch-Up Summary
  "This assessment started [X weeks ago] and is [Y%] complete"
  "Key decisions made so far:"
  - [3-5 most important decisions with one-line summaries]
  "Areas still in progress:"
  - [List of incomplete areas]
  "Your assigned areas: [list]"
  [View full decision history] or [Go to my tasks]

Screen 2: Your Tasks
  Prioritized queue of actions needed from them
  Based on: their role + their areas + what's overdue
```

### Viewer / Auditor (first access)

```
No onboarding. Lands directly on read-only dashboard.
Banner: "You have read-only access to this assessment. Access expires [date]."
```

## 1.6 User Lifecycle Management

| Event | What Happens | Who Triggers It |
|-------|-------------|----------------|
| Partner user joins firm | SCIM auto-provisions (if configured) or admin invites | Partner IdP / Partner admin |
| Partner user leaves firm | SCIM de-provisions (if configured) or admin deactivates | Partner IdP / Partner admin |
| Client stakeholder added to assessment | Invitation email sent, stakeholder record created | Consultant or PM |
| Client stakeholder removed from assessment | Access revoked, data remains (audit trail), stakeholder marked inactive | Consultant or PM |
| Client stakeholder changes role | Role updated, permissions recalculated, re-onboarding for new role if materially different | Consultant or PM |
| Client stakeholder replaced | New stakeholder inherits area assignments, old one marked inactive, handoff summary generated | Consultant or PM |
| Assessment completed | Client access becomes read-only (time-limited, default 90 days) | Automatic on sign-off |
| Assessment archived | All client access revoked, data retained for partner reporting | Partner admin or auto after 180 days |
| Viewer access expires | Session invalidated, access removed | Automatic on expiry date |
| User inactive > 90 days | Account flagged, session tokens revoked, requires re-authentication on next visit | Automatic |

## 1.7 Session Management

| Aspect | Specification |
|--------|--------------|
| Session duration | 24 hours (current), or SSO session lifetime (whichever is shorter) |
| Concurrent sessions | Allowed across devices (user can be on laptop AND phone) |
| Session tokens | JWT stored in httpOnly cookies, refreshed on activity |
| Device tracking | Track device type (desktop/tablet/mobile), last active per device |
| Force logout | Admin can revoke all sessions for a user. Triggered automatically on role change, deactivation, or SCIM deprovision |
| Remember me | Optional "stay signed in for 30 days" for non-SSO users (reduced-privilege session requiring MFA re-verify for write actions) |

---

# ADDENDUM SECTION 2: Mobile and Multi-Device Experience

## 2.1 Device Strategy

ABeam is NOT a mobile-first product. It is a **desktop-primary, mobile-capable** product. The core workflow (consultant facilitating a multi-hour workshop) happens on laptops. But critical actions must work on phones and tablets.

**Strategy: Progressive Web App (PWA)**

| Why PWA over native app |
|------------------------|
| Single codebase (Next.js already supports PWA with minimal additions) |
| No app store approval process (assessment tools have small user bases — app store discovery is irrelevant) |
| Instant updates (no version fragmentation) |
| Offline capability via service workers |
| Push notifications via Web Push API |
| Installable on home screen (looks like native app) |
| Works on iOS, Android, desktop — all from the same build |

## 2.2 Device-Specific UX Requirements

### Desktop (Primary — 1024px+)

Full experience. All features available. This is where consultants, PMs, and IT leads do their primary work.

### Tablet (Secondary — 768px-1023px)

Workshop-optimized experience. Key scenarios:
- **Consultant facilitating a workshop** with tablet in hand, walking around the room
- **Process owner reviewing processes** in a meeting room
- **IT lead reviewing integration points** at their desk

| Feature | Tablet Behavior |
|---------|----------------|
| Navigation | Collapsible sidebar (hamburger menu) |
| Step review | Swipeable cards (swipe right = FIT, left = GAP, up = skip) |
| Process map | Pinch-to-zoom, tap-to-drill |
| Forms | Full functionality, touch-optimized inputs |
| Workshop mode | Special facilitator view (large text, visible from across table) |

### Mobile (Tertiary — < 768px)

Limited but essential experience. Key scenarios:
- **Executive reviewing approvals** between meetings (2 minutes on phone)
- **PM checking assessment status** while traveling
- **Process owner checking their pending tasks** on the go
- **Receiving and acting on notifications**

| Feature | Mobile Behavior |
|---------|----------------|
| Dashboard | Simplified single-column, key metrics only |
| Approvals | Full approve/reject workflow (this MUST work on phone) |
| Notifications | Full notification center with deep links |
| Step review | NOT available on mobile (too detailed for small screen) |
| Gap resolution | Read-only (review resolutions, cannot edit) |
| Reports | Download links only (reports open in device PDF/XLSX viewer) |
| Process maps | View-only, simplified rendering |
| Settings | Full functionality |

**Critical mobile-only features:**
- Push notifications (Web Push API) — executive gets "Approval needed" push, taps it, opens approval card, approves, done
- Quick status check — PM opens app, sees dashboard, sees which areas are stalled, closes app. Under 30 seconds
- Notification actions — "Mark as read", "Approve", "Reject" directly from notification without opening full app

## 2.3 Offline Capability

### What MUST work offline:

| Feature | Offline Behavior | Sync Strategy |
|---------|-----------------|---------------|
| View assessment dashboard (cached) | Shows last-synced state with "Last updated X ago" banner | Background sync on reconnect |
| View process steps (cached) | All steps for assigned areas cached locally | Pre-cached when assessment is opened online |
| Capture step responses | Responses saved to local IndexedDB queue | Sync on reconnect with conflict detection |
| Capture notes and comments | Saved to local queue | Sync on reconnect |
| View reports (downloaded) | PDF/XLSX available if previously downloaded | Manual re-download for latest version |

### What does NOT need to work offline:

| Feature | Why |
|---------|-----|
| Real-time collaboration features | By definition requires connectivity |
| Report generation | Server-side process |
| User management | Admin action, infrequent |
| Integration/migration register CRUD | Detailed data entry, infrequent |
| Notifications | Requires server |

### Offline Sync Conflict Resolution:

```
Scenario: User A edits step 42 offline. User B edits step 42 online.
User A reconnects.

Resolution strategy: Last-write-wins with conflict notification.
  1. User A's offline changes are queued with timestamps
  2. On sync, server checks if step 42 was modified after User A's offline timestamp
  3. If conflict: User A's changes are applied (last-write-wins) BUT
     → Conflict notification sent to User B: "Your classification of step 42 was updated by User A"
     → Conflict log entry created in decision audit trail
     → Both versions preserved in audit trail
  4. If no conflict: changes applied normally
```

## 2.4 PWA Technical Requirements

| Requirement | Implementation |
|------------|---------------|
| Web App Manifest | `manifest.json` with app name, icons, theme color, display: standalone |
| Service Worker | Cache shell (HTML/CSS/JS), cache assessment data for assigned areas |
| Cache strategy | Shell: cache-first. API data: network-first with cache fallback |
| Installable | "Add to Home Screen" prompt after 2nd visit |
| Push notifications | Web Push API with VAPID keys. Notification service (Phase 19) delivers via web push |
| Background sync | Queued offline actions sync when connectivity returns |
| Storage | IndexedDB for structured data, Cache API for assets |
| Size budget | Initial cache < 5MB. Per-assessment data cache < 10MB |

---

# ADDENDUM SECTION 3: Real-Time Collaboration

## 3.1 The Collaboration Problem

Currently, two consultants working on the same assessment area have no awareness of each other. If both classify step 42 at the same time, the last save wins silently. There's no way to:
- See who else is working on the assessment right now
- See what someone else is currently editing
- Comment on a specific step or gap for someone else to see
- @mention a colleague to ask for input
- See live updates when someone else makes a change
- Resolve disagreements asynchronously

## 3.2 Collaboration Layers

### Layer 1: Presence Awareness

**Who is online right now?**

```
Assessment header shows:
  [👤 Sarah Chen] [👤 Mike Wong] [👤 Lisa Park]  +3 more
  
Each avatar shows:
  - Name and role
  - Which area/page they're currently viewing
  - Last action timestamp
  
Tooltip on hover:
  "Sarah Chen (Finance Director) — viewing AP Steps — active 2 min ago"
```

**Technical approach:** WebSocket connection per active user. Server maintains presence map per assessment. Broadcasts presence updates to all connected users in same assessment.

**Graceful degradation:** If WebSocket connection drops, presence indicators disappear. Assessment continues to work — presence is purely informational.

### Layer 2: Live Cursors / Active Editing Indicators

**Not Google Docs-style cursors** (overkill for a form-based application). Instead: field-level locking indicators.

```
When User A is editing Step 42's response:
  → All other users seeing Step 42 see:
    "Sarah Chen is editing this response..."
    [Input field is read-only for others while being edited]
  → When User A saves or navigates away:
    Field unlocks, other users see updated value
  → If User A doesn't save within 5 minutes:
    Soft lock expires, field becomes editable by others
```

**Technical approach:** Optimistic locking with WebSocket broadcast. When user focuses on a field, broadcast lock. When user blurs/saves, broadcast unlock. Timeout at 5 minutes for abandoned edits.

### Layer 3: Comments and Discussions

**Threaded comments on any entity: step, gap, scope item, integration point.**

```
Comment model:
  - id
  - assessmentId
  - targetType (STEP | GAP | SCOPE_ITEM | INTEGRATION | DATA_MIGRATION | OCM)
  - targetId (FK to the specific entity)
  - authorId (FK to User)
  - content (text, supports @mentions)
  - parentCommentId (null for top-level, FK for replies)
  - status (OPEN | RESOLVED)
  - createdAt / updatedAt
```

**@Mentions:**
```
User types "@" in comment field:
  → Autocomplete dropdown shows assessment stakeholders
  → Selecting a person inserts @[Name] tag
  → Mentioned person receives notification (in-app + email)
  → Notification deep links to the specific comment
```

**Comment visibility:**
- Comments are visible to all stakeholders who have access to the target entity
- Area-locked users only see comments on entities in their assigned areas
- Viewers can read comments but cannot post

### Layer 4: Disagreement and Resolution Tracking

When two stakeholders classify the same entity differently:

```
Scenario: Finance Director classifies Step 42 as FIT. Procurement Manager classifies it as GAP.

System detects:
  → Both have Step 42 in their assigned areas (cross-functional process)
  → Classifications differ
  → Auto-creates a "Conflict" entity:
    - conflictId
    - assessmentId  
    - entityType (STEP)
    - entityId (step 42)
    - classifications: [{userId, role, classification, rationale, timestamp}]
    - status: OPEN | IN_DISCUSSION | RESOLVED
    - resolvedBy: userId
    - resolvedClassification: the final answer
    - resolutionNotes: text

Notification sent to: both stakeholders + assigned consultant + PM
PM sees conflict in "What Needs Attention" dashboard
Consultant facilitates resolution (online or in next workshop)
Resolution logged in audit trail
```

### Layer 5: Activity Feed

**Real-time assessment activity stream visible to consultants and PMs.**

```
Assessment Activity Feed:
  [2 min ago] Sarah Chen classified 14 steps in AP as FIT
  [15 min ago] Mike Wong added a gap: "Custom invoice format for Malaysian tax"
  [1 hour ago] Lisa Park uploaded attachment to Step J60-042
  [Yesterday] Tom Harris (PM) completed scope selection for Manufacturing
  [Yesterday] System detected conflict: Step MM-019 classified differently by Finance and Procurement
```

**Feed filtering:** By area, by stakeholder, by action type, by time range.

**Feed as notification source:** Each feed event can trigger notifications per the notification rules in the framework Section A8.

## 3.3 Collaboration Feature Matrix by Role

| Feature | Consultant | PM | Process Owner | IT Lead | Executive | Viewer |
|---------|-----------|-----|-------------|---------|-----------|--------|
| See presence | ✅ | ✅ | ✅ (own area) | ✅ | ❌ | ❌ |
| Active editing indicators | ✅ | ❌ (doesn't edit) | ✅ (own area) | ✅ (own area) | ❌ | ❌ |
| Post comments | ✅ | ✅ | ✅ (own area) | ✅ (own area) | ✅ (on approvals) | ❌ |
| @Mention others | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| See activity feed | ✅ (all) | ✅ (all) | ✅ (own area) | ✅ (technical) | ❌ | ❌ |
| See conflicts | ✅ | ✅ | ✅ (if involved) | ✅ (if involved) | ❌ | ❌ |
| Resolve conflicts | ✅ | ❌ (escalates) | ❌ (provides input) | ❌ (provides input) | ✅ (if escalated) | ❌ |

## 3.4 Technical Architecture for Real-Time

```
Client (Browser/PWA)
  ↕ WebSocket (persistent connection)
Collaboration Service
  ├── Presence Manager (who is online, what are they viewing)
  ├── Lock Manager (field-level editing locks, 5-min timeout)
  ├── Event Broadcaster (real-time updates to connected clients)
  └── Conflict Detector (async check after each classification save)
  ↕
Database (PostgreSQL)
  ├── Comment table
  ├── Conflict table
  ├── ActivityFeed table
  └── Presence table (ephemeral — cleared on disconnect)
```

**Scaling consideration:** For V2, a single WebSocket server process is sufficient. ABeam won't have thousands of concurrent users per assessment. If scaling is needed later, add Redis pub/sub for multi-server WebSocket coordination.

**Fallback without WebSocket:** If WebSocket fails (corporate firewall, proxy issues):
- Presence: hidden (graceful degradation)
- Editing locks: polling-based (check every 10 seconds)
- Comments: work normally (standard REST)
- Activity feed: polling-based refresh
- Conflicts: still detected asynchronously

---

# ADDENDUM SECTION 4: Cross-Organizational Collaboration Flows

## 4.1 Workshop Collaboration (In-Person)

**Scenario:** 8 people in a conference room. Consultant has laptop connected to projector. Process owners have laptops/tablets. CFO has phone.

```
Consultant starts workshop session in ABeam:
  → Enters "Workshop Mode" — large font, projector-friendly layout
  → Shares workshop code or QR code on screen
  → Attendees scan QR / enter code to join workshop session
  → Their devices show: "Connected to Workshop: Finance AP — Session 3"
  → Their view auto-navigates to the current scope item being discussed

During workshop:
  → Consultant navigates through process steps on projector
  → All connected devices follow (synchronized navigation)
  → Process owners can:
    - Submit their classification (FIT/GAP/CONFIGURE) via their device
    - Add notes via their device (appears in real-time on projector view)
    - Flag "I need to discuss this" without interrupting flow
  → Consultant sees: live vote/classification tally for current step
    "3 say FIT, 1 says CONFIGURE, 1 says GAP"
  → Consultant facilitates discussion, makes final classification

Post-workshop:
  → Consultant ends workshop session
  → System auto-generates:
    - Workshop minutes (who attended, what was covered, decisions made)
    - Action items (from "discuss later" flags and unresolved conflicts)
    - Updated classifications for all reviewed steps
```

## 4.2 Remote / Hybrid Collaboration

**Scenario:** Same workshop, but 3 people are remote (Teams/Zoom call).

```
Same workflow as in-person, except:
  → Remote participants access via their browser (no special setup)
  → Workshop Mode provides a "follow presenter" toggle
    - ON: their view auto-syncs with consultant's navigation
    - OFF: they can explore independently while consultant presents
  → Their classifications and notes appear in real-time alongside in-person participants
  → Video/audio handled by Teams/Zoom (ABeam does NOT replicate video calling)
  → ABeam provides: synchronized content view + real-time input collection
```

## 4.3 Asynchronous Collaboration

**Scenario:** Finance Director reviews AP processes on Tuesday evening. Consultant reviews her inputs on Wednesday morning.

```
Tuesday evening (Finance Director):
  → Opens assessment, navigates to AP scope items
  → Reviews 15 steps in conversation mode
  → Classifies 12 as FIT, 2 as CONFIGURE, 1 as GAP
  → Adds comment on gap: "We need this for Malaysian e-invoicing compliance"
  → @mentions IT Lead: "@Lisa, can you check if there's an API for MyInvois?"

Wednesday morning (Consultant):
  → Opens assessment, sees activity feed:
    "Sarah Chen reviewed 15 AP steps last night"
  → Navigates to AP steps, sees Sarah's classifications
  → Reviews each one — agrees with 14, wants to discuss 1
  → Adds comment: "Sarah, the 3-way match config might cover this. Let's discuss in Thursday's session."
  → Updates workshop agenda for Thursday to include this item

Wednesday afternoon (IT Lead):
  → Gets email notification: "Sarah mentioned you in a comment on Step J60-042"
  → Opens app on phone, reads comment
  → Replies: "MyInvois API is available via SAP CPI. I'll add it to the integration register."
  → Opens integration register, adds MyInvois integration entry (on tablet)
```

---

# ADDENDUM SECTION 5: Updated Phase Impact

These three addendum sections require the following changes to the V2 phase definitions:

| Phase | Addition Required |
|-------|------------------|
| Phase 10 (Company Profile) | No change |
| Phase 11 (Scope Selection) | No change |
| Phase 12 (Step Response) | No change |
| Phase 13 (Gap Resolution) | No change |
| Phase 14 (Integration) | Add comment model integration |
| Phase 15 (Data Migration) | Add comment model integration |
| Phase 16 (OCM) | Add comment model integration |
| Phase 17 (Role System) | **MAJOR REWRITE** — Use the 11-role model from Section 1.3 instead of the vague "add more roles" from original framework. Define SSO/SCIM support. Define organization model. |
| Phase 18 (Lifecycle) | Add workshop session states |
| Phase 19 (Notifications) | **MAJOR ADDITION** — Add Web Push for PWA. Add @mention notification channel. Add presence/WebSocket infrastructure. |
| Phase 20 (Visualization) | Add mobile-optimized map renderings |
| Phase 21 (Workshop) | **MAJOR ADDITION** — Add Workshop Mode (synchronized navigation, live polling, QR join). Add workshop minutes auto-generation. |
| Phase 22 (Conversation Mode) | Add mobile-optimized conversation UI |
| Phase 23 (Dashboard) | Add mobile dashboard variant. Add activity feed. Add conflict dashboard. |
| Phase 24 (Onboarding) | **MAJOR REWRITE** — Use the per-role onboarding flows from Section 1.5. Add SSO-aware onboarding. |
| Phase 25 (Reporting V2) | No change |
| Phase 26 (Analytics) | Add partner-level organization model |
| Phase 27 (Hardening) | **MAJOR REWRITE** — PWA implementation. Service worker. Offline sync. WebSocket infrastructure. Mobile responsive audit based on Section 2.2 spec. |

### New Phase Required: Phase 28: Real-Time Collaboration
**Source:** Addendum Section 3 entirely.
**Scope:** Comment model + threading + @mentions. Presence (WebSocket). Field-level editing locks. Conflict detection and resolution workflow. Activity feed. This is architecturally foundational — many features in Phases 19-24 depend on the WebSocket infrastructure built here.

**Recommended placement:** Move to Phase 19.5 (after notifications, before visualization) because the WebSocket infrastructure serves both notifications and collaboration.

### Updated Phase Dependency Graph

```
Phase 10-13 (Foundation enrichments — no collaboration dependencies)
  ↓
Phase 14-16 (New registers — include comment support)
  ↓
Phase 17 (Roles — 11-role model + organization/tenant model + SSO/SCIM)
  ↓
Phase 18 (Lifecycle — includes workshop session states)
  ↓
Phase 19 (Notifications + WebSocket infrastructure + presence + Web Push)
  ↓
Phase 28 [NEW] (Real-Time Collaboration — comments, locks, conflicts, activity feed)
  ↓
Phase 20-21 (Visualization + Workshop Mode — uses collaboration infra)
  ↓
Phase 22-24 (Conversation, Dashboard, Onboarding — uses collaboration infra)
  ↓
Phase 25-26 (Reporting, Analytics)
  ↓
Phase 27 (PWA, offline, mobile optimization — uses all infrastructure)
```

---

# ADDENDUM SECTION 6: Completeness Verification for Addendum

| Check | Status |
|-------|--------|
| Every actor type (25) has a mapped platform role | ✅ Section 1.3 |
| Every platform role (11) has an authentication flow | ✅ Section 1.4 |
| Every platform role has an onboarding flow | ✅ Section 1.5 |
| User lifecycle (join/leave/change/replace/expire) fully specified | ✅ Section 1.6 |
| SSO (SAML/OIDC) for partner orgs | ✅ Section 1.4.1 |
| SSO (SAML/OIDC) for client orgs (optional) | ✅ Section 1.4.2 |
| SCIM provisioning | ✅ Section 1.4.1 |
| MFA policy per role | ✅ Section 1.4 |
| Multi-assessment context switching | ✅ Section 1.4.4 |
| Session management across devices | ✅ Section 1.7 |
| Desktop UX requirements | ✅ Section 2.2 |
| Tablet UX requirements | ✅ Section 2.2 |
| Mobile UX requirements | ✅ Section 2.2 |
| PWA technical requirements | ✅ Section 2.4 |
| Offline capability (what works/doesn't) | ✅ Section 2.3 |
| Offline sync conflict resolution | ✅ Section 2.3 |
| Real-time presence | ✅ Section 3.2 Layer 1 |
| Field-level editing locks | ✅ Section 3.2 Layer 2 |
| Comments and @mentions | ✅ Section 3.2 Layer 3 |
| Disagreement/conflict tracking | ✅ Section 3.2 Layer 4 |
| Activity feed | ✅ Section 3.2 Layer 5 |
| In-person workshop collaboration | ✅ Section 4.1 |
| Remote/hybrid workshop collaboration | ✅ Section 4.2 |
| Asynchronous collaboration | ✅ Section 4.3 |
| Collaboration permissions by role | ✅ Section 3.3 |
| WebSocket architecture | ✅ Section 3.4 |
| Graceful degradation (no WebSocket) | ✅ Section 3.4 |
| Phase dependency updates | ✅ Section 5 |
| New phase identified (Phase 28) | ✅ Section 5 |
---
# V2 Master Brief — Addendum 2: Commercial Platform, Handoff, and Assessment Lifecycle

> **Why this addendum exists:** The gap analysis revealed three missing stages in the customer journey:
> - **No front door** — nobody can discover, evaluate, subscribe to, or provision ABeam
> - **No back door** — the assessment reaches sign-off and stops; no legally rigorous sign-off, no export to implementation tools, no transition briefing
> - **No continuity** — no support for reassessment, phase 2 carry-forward, versioning, or change control
>
> This addendum specifies Phases 29, 30, 31 and an update to Phase 26 to close these gaps completely.

---

# ADDENDUM 2 SECTION 1: Commercial Platform & Self-Service Provisioning (Phase 29)

## 1.1 The Two Customer Types

**Type A: Consulting Partner (PRIMARY CUSTOMER)**
SAP consulting firms (Big 4, boutiques, GSIs) that purchase ABeam to run Fit-to-Standard assessments for their clients. They manage multiple assessments, multiple clients, multiple consultants. The partner PAYS and OWNS the platform relationship.

**Type B: Direct Enterprise Client (SECONDARY)**
Companies doing SAP implementations who want to self-assess before engaging a partner, or who have internal SAP expertise. They manage a single assessment (or a few). They PAY directly.

[OPEN QUESTION: Should Type B be supported in V2 or deferred to V3? It adds significant complexity to the tenant model. Recommendation: Support it structurally but don't build a separate marketing/onboarding flow. Direct clients create a "single-partner organization" and use the same flows.]

## 1.2 Subscription Model

[OPEN QUESTION: Final pricing to be determined by business. The framework below supports any combination.]

### Recommended Pricing Structure

**Base: Per-partner subscription (annual)**

| Plan | Included Assessments | Included Users | Features |
|------|---------------------|---------------|----------|
| Starter | 3 concurrent | 10 partner users | Core assessment, standard reports, email support |
| Professional | 10 concurrent | 30 partner users | + Integration/DM/OCM registers, workshop mode, analytics, priority support |
| Enterprise | Unlimited | Unlimited partner users | + SSO/SCIM, custom branding, API access, dedicated success manager, SLA |

**Overage: Per-assessment beyond plan limit**
- Charged per assessment created (not per client stakeholder — client users are always free)
- Metered billing: usage reported to Stripe at assessment creation

**Add-ons (optional):**
- Additional partner user seats (if beyond plan limit)
- Premium support package
- Custom industry profile creation
- Data residency selection (EU, US, APAC)

**Key decisions embedded:**
- Client stakeholders are NEVER billed. They are invited participants. Billing the client's employees to use a tool they didn't choose would kill adoption.
- Trial: 14-day free trial of Professional plan. No credit card required. Sample assessment pre-loaded with demo data (fictional company, realistic SAP scope).
- Billing integration: Stripe Billing with metered usage for overages.

## 1.3 Platform Provisioning Flow

### Self-Service Provisioning (Partner Signs Up)

```
Step 1: Landing page / Marketing site
  → ABeam.io (or similar) — NOT inside the app
  → [OPEN QUESTION: Is the marketing site part of V2 scope or separate?]
  → "Start Free Trial" button → redirect to signup flow

Step 2: Partner admin creates account
  → Email, password, full name
  → Company name, company size, country
  → Primary use case (SAP consulting / Internal assessment / Evaluation)
  → Terms of service acceptance
  → Email verification (magic link to confirm email)

Step 3: Organization auto-created
  → New Organization record created in database:
    - id (cuid)
    - name (from signup)
    - slug (URL-friendly: deloitte-consulting)
    - type (PARTNER | DIRECT_CLIENT)
    - plan (TRIAL → will upgrade)
    - trialEndsAt (14 days from now)
    - stripeCustomerId (created via Stripe API)
    - subscriptionStatus (TRIALING)
    - settings (JSON: branding, defaults, preferences)
    - createdAt / updatedAt
  → Admin user linked to organization with partner_lead role

Step 4: Onboarding wizard (partner admin, first login)
  Screen 1: "Welcome to ABeam"
    → Brief animated walkthrough (30 seconds, skippable)
    → "Let's set up your firm"
    
  Screen 2: Firm profile
    → Logo upload (appears on reports, client-facing pages)
    → Primary industry focus (multi-select)
    → Default report branding (colors, footer text)
    → [Skip for now] option
    
  Screen 3: Invite your team
    → Add consultant emails (bulk paste supported)
    → Assign roles: consultant, project_manager
    → [I'll do this later] option
    
  Screen 4: Explore the sample assessment
    → Pre-loaded demo assessment with fictional client
    → 50 scope items, 500 process steps, sample gaps, sample integrations
    → "Try classifying some steps" guided walkthrough
    → [Skip to creating a real assessment] option

Step 5: Partner admin lands on partner dashboard
  → Assessment list (currently: 1 sample assessment)
  → "Create New Assessment" CTA
  → Trial banner: "12 days remaining in your free trial. Upgrade now."
  → Team management link
  → Settings link
```

### Sales-Assisted Provisioning

```
Step 1: Sales team creates organization manually via platform admin panel
  → OR sales sends partner a branded signup link with plan pre-selected
  → Skip trial — go directly to paid plan
  
Step 2: Same onboarding wizard as self-service
  → But with plan already active, no trial banner
  
Step 3: If Enterprise plan: SSO/SCIM configuration
  → Partner admin configures in Settings > Authentication
  → Upload IdP metadata (SAML) or enter OIDC endpoints
  → Test SSO connection
  → Enable SCIM endpoint (provide ABeam SCIM URL + bearer token to partner IT)
```

## 1.4 Partner Administration Dashboard

**Route:** `/partner/settings`

| Section | Contents |
|---------|----------|
| Firm Profile | Name, logo, industry focus, contact info |
| Team Members | List all users, invite new, change roles, deactivate |
| Authentication | SSO configuration (SAML/OIDC), SCIM setup, MFA policy |
| Branding | Report logo, report footer, primary color, email templates |
| Subscription | Current plan, usage meter, billing history, upgrade/downgrade, payment method |
| Assessments | List all assessments, filter by status/client/consultant, archive |
| Templates | Saved assessment templates (from completed assessments — see Phase 26) |
| Intelligence | Industry profiles, benchmarking data (if Enterprise plan) |
| API Keys | API access tokens for programmatic integration (if Enterprise plan) |
| Data & Privacy | Data export, data deletion request, data residency selection |

## 1.5 Subscription Lifecycle

| Event | What Happens |
|-------|-------------|
| Trial starts | Organization created with TRIALING status. 14-day countdown begins. Full Professional features enabled. |
| Trial day 10 | Email reminder: "4 days left. Upgrade to keep your assessments." |
| Trial day 13 | Email urgency: "Trial expires tomorrow. Your data will be preserved for 30 days." |
| Trial expires | Status → TRIAL_EXPIRED. Assessments become read-only. No new assessments. Data preserved 30 days. |
| Trial grace period expires (day 44) | Assessments archived. Data retained 90 more days then purged. |
| Upgrade to paid | Status → ACTIVE. Stripe subscription created. All features for plan tier enabled. |
| Payment fails | Stripe retry logic (3 attempts over 7 days). Email notifications. After final failure: status → PAST_DUE. Read-only after 14 days. |
| Downgrade plan | Effective at next billing cycle. If current usage exceeds new plan limits: warning shown, oldest assessments become read-only. |
| Cancel subscription | Status → CANCELING. Active until end of billing period. Then → CANCELED. Assessments read-only 90 days. Data purged after 180 days. Email with data export option sent. |
| Reactivate after cancel | Status → ACTIVE. All data restored if within 180-day window. |

## 1.6 Usage Metering

| Metric | How Counted | Billing Impact |
|--------|-------------|---------------|
| Active assessments | Assessments not in ARCHIVED or SIGNED_OFF status | Against plan limit |
| Partner user seats | Users with partner org roles (consultant, PM, partner_lead) | Against plan limit |
| Client stakeholders | Users with client roles on any assessment | NOT billed (always free) |
| Storage | Total file attachments + report PDFs per org | Included in plan (warn at 80%) |

Metering events sent to Stripe:
- `assessment_created` — when new assessment enters active state
- `partner_user_added` — when new partner user accepts invitation
- `assessment_archived` — when assessment moves to ARCHIVED (decrements active count)

## 1.7 Demo/Sandbox Mode

The sample assessment pre-loaded during onboarding:
- Fictional company: "GlobalTech Industries" (mid-size manufacturer, 3 countries, SAP ECC → SAP migration)
- Industry: Discrete Manufacturing
- 6 functional areas selected (Finance, Procurement, Sales, Manufacturing, Warehouse, HR)
- 50 scope items, 500 process steps
- 30 pre-classified as FIT, 10 as GAP with sample resolutions, 10 as CONFIGURE
- 3 sample integration points (EDI, MES, Payroll)
- 2 sample data migration objects (Vendor Master, Material Master)
- Sample reports pre-generated
- Watermarked: "DEMO DATA — NOT A REAL ASSESSMENT"

Partners can reset the demo at any time from Settings.

## 1.8 Data Model Additions for Phase 29

### Organization Model (NEW)

```
model Organization {
  id                    String   @id @default(cuid())
  name                  String
  slug                  String   @unique
  type                  OrganizationType  // PARTNER, DIRECT_CLIENT
  logoUrl               String?
  primaryColor          String?  @default("#1e40af")
  reportFooterText      String?
  industryFocus         String[] @default([])
  country               String?
  
  // Subscription
  plan                  PlanTier          // TRIAL, STARTER, PROFESSIONAL, ENTERPRISE
  subscriptionStatus    SubscriptionStatus // TRIALING, ACTIVE, PAST_DUE, CANCELED, TRIAL_EXPIRED
  trialEndsAt           DateTime?
  stripeCustomerId      String?  @unique
  stripeSubscriptionId  String?  @unique
  
  // SSO
  ssoEnabled            Boolean  @default(false)
  ssoProvider           SsoProvider?       // SAML, OIDC
  ssoMetadataUrl        String?
  ssoClientId           String?
  ssoClientSecret       String?  // encrypted
  scimEnabled           Boolean  @default(false)
  scimBearerToken       String?  // encrypted
  
  // Limits
  maxActiveAssessments  Int      @default(3)
  maxPartnerUsers       Int      @default(10)
  
  // Relations
  users                 User[]
  assessments           Assessment[]
  templates             AssessmentTemplate[]
  
  // Timestamps
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

enum OrganizationType {
  PARTNER
  DIRECT_CLIENT
}

enum PlanTier {
  TRIAL
  STARTER
  PROFESSIONAL
  ENTERPRISE
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  TRIAL_EXPIRED
}

enum SsoProvider {
  SAML
  OIDC
}
```

### User Model Changes (extend existing)

```
model User {
  // ... existing fields ...
  
  // NEW: Organization membership
  organizationId        String?
  organization          Organization? @relation(fields: [organizationId], references: [id])
  organizationType      String?      // 'partner' or 'client' — which side of the assessment
  
  // NEW: Multi-assessment support
  lastActiveAssessmentId String?
}
```

---

# ADDENDUM 2 SECTION 2: Assessment Handoff, Sign-Off, and ALM Integration (Phase 30)

## 2.1 The Sign-Off Problem

The current framework treats sign-off as a status toggle: `signed_off = true`. For a document that becomes the contractual basis for a multi-million dollar SAP implementation, this is dangerously inadequate.

**What a real sign-off must capture:**
- WHO approved (verified identity, not just a user ID)
- WHAT they approved (exact version of assessment data at the moment of signing — immutable snapshot)
- WHEN they approved (tamper-proof timestamp)
- WITH WHAT AUTHORITY (their role and explicit statement of authority)
- THAT IT HASN'T BEEN TAMPERED WITH (cryptographic hash of the signed content)

## 2.2 Multi-Layer Validation Workflow

Before sign-off, the assessment passes through validation layers. Each layer is a formal approval by a specific role.

```
Layer 1: Process Owner Validation (per functional area)
  → Each PO confirms: "The processes in my area are accurately classified"
  → Must be completed for ALL in-scope areas
  → Produces: AreaValidation record per area

Layer 2: Technical Validation
  → IT Lead confirms: "Integration points and technical decisions are feasible"
  → DM Lead confirms: "Data migration scope and approach are realistic"
  → Produces: TechnicalValidation record

Layer 3: Cross-Functional Validation
  → Solution Architect / Lead Consultant confirms: "No cross-area contradictions, solution hangs together"
  → Reviews all conflict resolutions from Phase 28
  → Produces: CrossFunctionalValidation record

Layer 4: Executive Validation and Sign-Off
  → Executive reviews: summary dashboard, cost summary, risk summary, timeline impact
  → Explicitly approves: "I authorize this assessment as the basis for implementation"
  → Produces: ExecutiveSignOff record (the legal one)

Layer 5: Partner Countersign
  → Partner lead or delivery PM confirms: "We confirm this assessment is complete and accurate"
  → Produces: PartnerSignOff record
```

### Validation State Machine

```
VALIDATION_NOT_STARTED
  → AREA_VALIDATION_IN_PROGRESS (first PO submits)
  → AREA_VALIDATION_COMPLETE (all POs validated)
  → TECHNICAL_VALIDATION_IN_PROGRESS
  → TECHNICAL_VALIDATION_COMPLETE
  → CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS
  → CROSS_FUNCTIONAL_COMPLETE
  → PENDING_EXECUTIVE_SIGN_OFF
  → EXECUTIVE_SIGNED
  → PENDING_PARTNER_COUNTERSIGN
  → FULLY_SIGNED_OFF
```

Each layer can be APPROVED or REJECTED_WITH_COMMENTS. Rejection sends assessment back to the previous phase with specific items flagged for rework.

## 2.3 Sign-Off Data Model

```
model AssessmentSignOff {
  id                  String   @id @default(cuid())
  assessmentId        String
  assessment          Assessment @relation(fields: [assessmentId], references: [id])
  
  // What was signed
  snapshotId          String   @unique
  snapshot            AssessmentSnapshot @relation(fields: [snapshotId], references: [id])
  
  // Validation layers
  areaValidations     AreaValidation[]
  technicalValidation TechnicalValidation?
  crossFuncValidation CrossFunctionalValidation?
  executiveSignOff    SignatureRecord?  @relation("executive")
  partnerSignOff      SignatureRecord?  @relation("partner")
  
  // Status
  status              SignOffStatus
  
  // Certificate
  certificatePdfUrl   String?
  certificateHash     String?  // SHA-256 hash of the certificate PDF
  
  createdAt           DateTime @default(now())
  completedAt         DateTime?
}

model AreaValidation {
  id                  String   @id @default(cuid())
  signOffId           String
  signOff             AssessmentSignOff @relation(fields: [signOffId], references: [id])
  functionalAreaId    String
  validatedById       String
  validatedBy         User @relation(fields: [validatedById], references: [id])
  status              ValidationStatus  // APPROVED, REJECTED
  comments            String?
  validatedAt         DateTime
}

model SignatureRecord {
  id                  String   @id @default(cuid())
  signOffId           String
  signOff             AssessmentSignOff @relation(...)
  
  // WHO signed
  signerId            String
  signer              User @relation(fields: [signerId], references: [id])
  signerName          String   // Captured at sign time (not mutable)
  signerEmail         String
  signerRole          String
  signerOrganization  String
  
  // Statement of authority
  authorityStatement  String   // "I confirm I have authority to approve this assessment on behalf of [org]"
  
  // Verification
  ipAddress           String
  userAgent           String
  authMethod          String   // "sso", "magic_link+totp", "magic_link"
  mfaVerified         Boolean
  
  // Cryptographic
  documentHash        String   // SHA-256 of the snapshot data at sign time
  signatureTimestamp  DateTime // Server-generated, not client-provided
  
  // Status
  status              SignatureStatus  // PENDING, SIGNED, DECLINED
  declineReason       String?
  
  createdAt           DateTime @default(now())
}

model AssessmentSnapshot {
  id                  String   @id @default(cuid())
  assessmentId        String
  assessment          Assessment @relation(fields: [assessmentId], references: [id])
  
  // Version
  version             Int      // Auto-incrementing per assessment
  label               String?  // "Final for Sign-Off", "Post-Change-Request v2"
  
  // Complete frozen copy of assessment data
  snapshotData        Json     // Full assessment state: company profile, scope, steps, gaps, integrations, DM, OCM, configs, all classifications
  
  // Integrity
  dataHash            String   // SHA-256 hash of snapshotData JSON (canonical form)
  
  // Metadata
  createdById         String
  createdBy           User @relation(fields: [createdById], references: [id])
  reason              String   // "Sign-off preparation", "Pre-change-request backup", "Quarterly re-baseline"
  
  createdAt           DateTime @default(now())
}

enum SignOffStatus {
  NOT_STARTED
  AREA_VALIDATION_IN_PROGRESS
  AREA_VALIDATION_COMPLETE
  TECHNICAL_VALIDATION_IN_PROGRESS
  TECHNICAL_VALIDATION_COMPLETE
  CROSS_FUNCTIONAL_IN_PROGRESS
  CROSS_FUNCTIONAL_COMPLETE
  PENDING_EXECUTIVE
  EXECUTIVE_SIGNED
  PENDING_PARTNER
  FULLY_SIGNED_OFF
  REJECTED
}
```

## 2.4 Sign-Off Certificate

When all signatures are collected, ABeam generates a **Sign-Off Certificate PDF**:

```
┌─────────────────────────────────────────────────────────────┐
│                     ASSESSMENT SIGN-OFF                      │
│                       CERTIFICATE                            │
│                                                              │
│  Assessment: [Client Name] SAP Fit-to-Standard      │
│  Assessment ID: [cuid]                                       │
│  Snapshot Version: [N]                                       │
│  Data Integrity Hash: SHA-256 [hash]                         │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│  SCOPE SUMMARY                                               │
│  Functional Areas: [N] in scope                              │
│  Process Steps Evaluated: [N]                                │
│  FIT: [N] | CONFIGURE: [N] | GAP: [N] | NOT APPLICABLE: [N] │
│  Integration Points: [N]                                     │
│  Data Migration Objects: [N]                                 │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  AREA VALIDATIONS                                            │
│  Finance: Approved by [Name], [Date]                         │
│  Procurement: Approved by [Name], [Date]                     │
│  ... (each in-scope area)                                    │
│                                                              │
│  TECHNICAL VALIDATION                                        │
│  Approved by [Name], [Role], [Date]                          │
│                                                              │
│  CROSS-FUNCTIONAL VALIDATION                                 │
│  Approved by [Name], [Role], [Date]                          │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│  EXECUTIVE SIGN-OFF                                          │
│  Signed by: [Name]                                           │
│  Organization: [Client Org]                                  │
│  Role: Executive Sponsor                                     │
│  Statement: "I confirm I have authority to approve..."       │
│  IP: [x.x.x.x] | Auth: [SSO/MFA] | Time: [ISO timestamp]  │
│  ──────────────────────────────────────────────────────────  │
│  PARTNER COUNTERSIGN                                         │
│  Signed by: [Name]                                           │
│  Organization: [Partner Org]                                 │
│  Role: Engagement Lead                                       │
│  Statement: "We confirm this assessment is complete..."      │
│  IP: [x.x.x.x] | Auth: [SSO/MFA] | Time: [ISO timestamp]  │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  CERTIFICATE INTEGRITY                                       │
│  This certificate was generated by ABeam Platform            │
│  Certificate Hash: SHA-256 [hash of this PDF]                │
│  Generated: [ISO timestamp]                                  │
│  Verify at: https://ABeam.io/verify/[certificate-id]         │
│                                                              │
│  [Partner Logo]                    [ABeam Logo]              │
└─────────────────────────────────────────────────────────────┘
```

**Verification:** Anyone with the certificate can visit the verification URL to confirm the hash matches and the assessment data hasn't been tampered with since sign-off.

## 2.5 ALM Export Adapters

After sign-off, the assessment must feed into implementation tools. Without this, the output is just PDFs.

### Export Format: Universal JSON Package

Before any tool-specific adapter, ABeam produces a **Universal Assessment Package** — a structured JSON export that any adapter can consume:

```json
{
  "metadata": {
    "assessmentId": "...",
    "clientName": "...",
    "partnerName": "...",
    "signOffDate": "...",
    "signOffCertificateHash": "...",
    "version": 1,
    "exportedAt": "..."
  },
  "companyProfile": { ... },
  "scopeItems": [
    {
      "id": "...",
      "name": "...",
      "area": "...",
      "relevance": "RELEVANT",
      "processSteps": [
        {
          "id": "...",
          "name": "...",
          "classification": "GAP",
          "gaps": [
            {
              "id": "...",
              "description": "...",
              "resolutionType": "BTP_EXTENSION",
              "costEstimate": { "oneTime": 50000, "recurring": 5000 },
              "priority": "HIGH"
            }
          ]
        }
      ]
    }
  ],
  "integrationPoints": [ ... ],
  "dataMigrationObjects": [ ... ],
  "ocmImpacts": [ ... ],
  "configurationMatrix": [ ... ],
  "signOff": {
    "executiveSigner": "...",
    "partnerSigner": "...",
    "certificateUrl": "..."
  }
}
```

### Adapter: SAP Cloud ALM

SAP Cloud ALM has REST APIs for Projects, Tasks, Requirements, and Documents. The adapter maps:

| ABeam Entity | Cloud ALM Entity | Mapping |
|-------------|-----------------|---------|
| Assessment | Project | One assessment → one Cloud ALM project |
| Scope Item (GAP) | Requirement | Each gap becomes a requirement with description, priority, cost |
| Gap Resolution | Task (User Story) | Each resolution becomes a user story under the requirement |
| Integration Point | Requirement (tagged INTEGRATION) | Integration items as technical requirements |
| Data Migration Object | Requirement (tagged DATA_MIGRATION) | DM items as requirements |
| Configuration item | Task (tagged CONFIGURATION) | Config items as tasks |
| Report PDF bundle | Document | Attached to project |
| Sign-off certificate | Document | Attached as project artifact |

[VERIFY: SAP Cloud ALM API supports bulk creation of requirements and tasks. Check rate limits.]
[VERIFY: Cloud ALM project creation requires specific scope item mapping that may differ from ABeam scope item IDs.]

**Configuration required from partner:**
- Cloud ALM tenant URL
- OAuth2 credentials (client ID, client secret)
- BTP destination configuration
- Scope item ID mapping (ABeam → Cloud ALM) [OPEN QUESTION: can this be automated via SAP Best Practice content IDs?]

### Adapter: Jira / Jira Cloud

| ABeam Entity | Jira Entity | Mapping |
|-------------|------------|---------|
| Assessment | Project | One assessment → one Jira project |
| Functional Area | Epic | Each area becomes an epic |
| Gap | Story | Each gap becomes a story with description, acceptance criteria derived from resolution |
| Resolution tasks | Sub-task | Each task in gap resolution becomes a Jira sub-task |
| Integration Point | Story (labeled INTEGRATION) | In a dedicated "Integration" epic |
| Data Migration Object | Story (labeled DATA_MIGRATION) | In a dedicated "Data Migration" epic |

**Configuration required:** Jira Cloud URL, API token, project key prefix, custom field mappings.

### Adapter: Azure DevOps

| ABeam Entity | Azure DevOps Entity |
|-------------|---------------------|
| Assessment | Project |
| Functional Area | Area Path |
| Gap | Work Item (User Story) |
| Resolution tasks | Work Item (Task) |
| Integration/DM | Work Item (Feature) |

**Configuration required:** Azure DevOps org URL, PAT token, project template.

### Adapter: Confluence / Document Export

For partners who just need documents:
- Full assessment as a structured Confluence page hierarchy
- Or as a ZIP of markdown files
- Or as a single comprehensive Word document (using existing docx generation)

### Export Configuration UI

**Route:** `/assessment/[id]/handoff`

```
Step 1: Prepare Handoff Package
  → Generate Universal Assessment Package (JSON)
  → Generate all reports (PDF bundle, XLSX bundle)
  → Generate sign-off certificate
  → Package into downloadable ZIP

Step 2: Select Export Destination (optional)
  → SAP Cloud ALM (configure connection)
  → Jira Cloud (configure connection)
  → Azure DevOps (configure connection)
  → Confluence (configure connection)
  → Manual download only
  
Step 3: Map and Confirm
  → Preview what will be created in target system
  → Confirm mappings
  → Execute export
  → Show success/failure status per item

Step 4: Transition Briefing
  → Auto-generate transition document:
    - Assessment summary (scope, timeline, key decisions)
    - Key risks and open items
    - Stakeholder contact list
    - Recommended next steps for Realize phase
    - Links to all reports and the sign-off certificate
```

## 2.6 Archival and Retention

| Event | Action | Data Retention |
|-------|--------|---------------|
| Assessment signed off | Status → SIGNED_OFF. Client access becomes read-only. | Indefinite (while subscription active) |
| Handoff complete | Status → HANDED_OFF. All exports completed. | Indefinite (while subscription active) |
| Partner archives assessment | Status → ARCHIVED. Removed from active assessment list. Available in archive. | Plan-dependent: Starter 1 year, Professional 3 years, Enterprise unlimited |
| Subscription canceled | All assessments become read-only. | 180 days from cancellation, then data purge with 30-day advance warning email |
| Data export request | Generate full ZIP: all assessment data, reports, sign-off certificates, audit trail | Available for download for 7 days |
| Data deletion request | GDPR Article 17. Permanent deletion of all assessment data for specified client. | Deletion within 30 days. Audit log entry retained (without PII) for compliance. |

---

# ADDENDUM 2 SECTION 3: Assessment Lifecycle Continuity (Phase 31)

## 3.1 The Continuity Problem

SAP implementations are rarely one-shot. Reality looks like this:

```
Phase 1 Assessment (Finance, Procurement, Sales)
  → Sign-off → Implementation → Go-Live (Month 18)
  
Phase 2 Assessment (Manufacturing, Warehouse, HR)
  → SHOULD carry forward: company profile, org model, integration landscape
  → SHOULD reference: Phase 1 decisions that affect Phase 2 scope
  → SHOULD track: what changed since Phase 1
  
Scope Change During Implementation
  → Implementation team discovers new gap not in original assessment
  → Assessment must be re-opened, updated, re-signed
  → MUST track: what changed, who approved, why
  
Quarterly Re-Baseline
  → Partner wants to update assessment with new SAP Best Practice version
  → Compare: what's different between SAP 2408 and SAP 2502 content?
  → SHOULD show: delta without losing original assessment integrity
```

## 3.2 Assessment Versioning

Every sign-off creates an immutable snapshot (defined in Phase 30). Versioning builds on this:

```
Assessment "GlobalTech Phase 1"
  ├── Snapshot v1: "Initial sign-off" (signed 2025-03-15)
  ├── Snapshot v2: "Post-change-request: Added AP-017 gap" (signed 2025-05-20)
  └── Snapshot v3: "Quarterly re-baseline with SAP 2505" (signed 2025-07-01)
```

### Version Comparison (Delta Report)

```
Comparing v1 → v2:

SCOPE CHANGES:
  + Added: MM-003 "Subcontracting" (was NOT_RELEVANT, now RELEVANT)
  - Removed: none

CLASSIFICATION CHANGES:
  Step AP-017: FIT → GAP
    Reason: "Malaysian e-invoicing requirement discovered during implementation"
    Added by: Sarah Chen (Finance Director), 2025-05-18
  Step AP-022: GAP → CONFIGURE  
    Reason: "SAP Note 3291847 provides standard configuration path"
    Changed by: Mike Wong (Consultant), 2025-05-19

GAP RESOLUTION CHANGES:
  Gap AP-017-G1: NEW
    Resolution: BTP Extension (MyInvois API connector)
    Cost: RM 180,000 one-time
  Gap FI-009-G1: UPDATED
    Resolution changed: CUSTOM_ABAP → STANDARD_CONFIG
    Cost reduced: RM 50,000 → RM 8,000

INTEGRATION CHANGES:
  + Added: INT-015 "MyInvois e-Invoicing" (OUTBOUND, Real-time, CPI)
  ~ Updated: INT-003 "Payroll" frequency changed DAILY → REAL_TIME

NEW SIGN-OFF:
  Executive: [Name], 2025-05-20
  Partner: [Name], 2025-05-20
  Change justification: "Malaysian regulatory requirement identified during Realize phase"
```

## 3.3 Assessment Cloning (Phase 2 Carry-Forward)

When starting a Phase 2 assessment for the same client:

```
Consultant clicks "Create Phase 2 Assessment" on completed assessment:

Step 1: Select what carries forward
  ☑ Company profile (all fields)
  ☑ Stakeholder list (with option to update roles)
  ☑ Integration register (existing integrations as read-only reference)
  ☑ Data migration register (existing objects as reference)
  ☑ OCM impact register (existing impacts as reference)
  ☐ Phase 1 scope items (as NOT_RELEVANT reference — can be toggled to RELEVANT if scope expands)
  ☑ Lessons learned from Phase 1

Step 2: Select new scope
  → All scope items not in Phase 1 shown as candidates
  → Previously DEFERRED items highlighted: "These were deferred from Phase 1"
  → Pre-checked: items marked as DEFERRED in Phase 1
  
Step 3: Review cross-phase dependencies
  → System identifies: "Phase 2 scope item MM-003 depends on Phase 1 integration INT-007"
  → Flags: items that may need Phase 1 decisions to be revisited

Step 4: New assessment created
  → Linked to Phase 1 assessment via parentAssessmentId
  → Company profile pre-filled
  → Integration/DM/OCM registers carry forward as read-only reference section
  → New registers created for Phase 2-specific items
  → Dashboard shows: "Phase 2 of GlobalTech SAP Assessment (Phase 1 signed off 2025-03-15)"
```

### Data Model for Cloning

```
model Assessment {
  // ... existing fields ...
  
  // NEW: Multi-phase linking
  parentAssessmentId    String?
  parentAssessment      Assessment? @relation("phases", fields: [parentAssessmentId], references: [id])
  childAssessments      Assessment[] @relation("phases")
  phaseNumber           Int     @default(1)
  
  // NEW: Versioning
  snapshots             AssessmentSnapshot[]
  currentSnapshotId     String?
}
```

## 3.4 Change Control (Post-Sign-Off Modifications)

When a signed-off assessment needs to change:

```
Step 1: Consultant initiates change request
  → Route: /assessment/[id]/change-request
  → Must specify: what needs to change and why
  → Auto-creates snapshot of current state (preserves signed version)

Step 2: Change request record created
  ChangeRequest {
    id
    assessmentId
    requestedById
    requestedAt
    reason                // "Regulatory requirement discovered", "Scope expansion", etc.
    impactSummary         // Auto-generated: which areas, steps, gaps affected
    status                // REQUESTED → APPROVED → IN_PROGRESS → RE_SIGNED → REJECTED
    approvedById          // PM or Partner Lead approves
    approvedAt
    changes               // JSON diff of what was changed
    previousSnapshotId    // Link to the snapshot before changes
    newSnapshotId         // Link to snapshot after changes (once re-signed)
  }

Step 3: Assessment unlocked for specific changes only
  → Only the items listed in the change request are editable
  → Everything else remains locked
  → Change request banner shown on all pages: "Change Request CR-003 in progress"

Step 4: Changes made, re-validated, re-signed
  → Modified items go through validation again
  → New snapshot created
  → New sign-off process (can be expedited: only changed areas need re-validation)
  → Change request closed

Step 5: Delta report auto-generated
  → Shows exactly what changed between previous sign-off and new sign-off
  → Attached to handoff package for implementation team awareness
```

## 3.5 Reassessment Triggers

| Trigger | Action |
|---------|--------|
| SAP Best Practice version update | Notification to partner: "SAP 2505 content available. Your assessment was built on 2408. View delta." Assessment can be re-baselined against new content. |
| Implementation discovers new gap | Change request initiated from handoff/transition stage |
| Client scope expansion | Phase 2 assessment created (cloning flow) |
| Regulatory change | Change request with regulatory justification |
| Partner-initiated re-baseline | Snapshot current state, compare to latest SAP content, produce delta report |

## 3.6 Assessment Template Creation (Phase 26 Update)

When a partner completes a successful assessment, they should be able to save it as a template:

```
Partner clicks "Save as Template" on completed assessment:

Step 1: Select what to include
  ☑ Industry profile selection
  ☑ Scope item selections (relevant/not relevant patterns)
  ☑ Common gap patterns (anonymized — no client-specific details)
  ☑ Integration patterns (anonymized)
  ☑ Data migration patterns (anonymized)
  ☑ Workshop schedule template
  ☑ Stakeholder role template
  ☐ Classification patterns (controversial — may bias new assessments)

Step 2: Anonymize and name
  → All client-specific data stripped
  → Template named: "Mid-size Discrete Manufacturer — Finance + Procurement + Sales"
  → Tagged with: industry, size, modules, geography

Step 3: Template stored at organization level
  → Available to all consultants in the partner org
  → When creating new assessment: "Start from template" option
  → Template pre-fills scope selections and highlights common patterns
```

### Template Data Model

```
model AssessmentTemplate {
  id                  String   @id @default(cuid())
  organizationId      String
  organization        Organization @relation(fields: [organizationId], references: [id])
  
  name                String
  description         String?
  industry            String
  companySize         String?    // "mid-size", "large", "enterprise"
  modules             String[]   // ["Finance", "Procurement", "Sales"]
  geography           String?
  
  // Template data (anonymized)
  scopeSelections     Json       // Scope item relevance patterns
  commonGapPatterns   Json?      // Frequently seen gaps (anonymized)
  integrationPatterns Json?      // Common integration types
  dmPatterns          Json?      // Common data migration objects
  workshopTemplate    Json?      // Default workshop schedule
  roleTemplate        Json?      // Default stakeholder roles
  
  // Usage tracking
  timesUsed           Int        @default(0)
  
  createdById         String
  createdBy           User @relation(fields: [createdById], references: [id])
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

---

# ADDENDUM 2 SECTION 4: Updated Phase 26 — Analytics, Benchmarking, and Templates

Phase 26 must now include (additions to original definition):

**Original scope:** Portfolio view, cross-assessment analytics, template creation.

**Updated scope adds:**
1. **Assessment Templates** — Save completed assessments as reusable templates (Section 3.6 above). Template marketplace within organization. Usage analytics.
2. **Cross-Phase Analytics** — For clients with Phase 1 + Phase 2 assessments: trend analysis, scope expansion tracking, cost evolution.
3. **Partner Portfolio Dashboard** — Aggregate view across all assessments: average FIT rate by industry, most common gaps, integration pattern frequency, average assessment duration, consultant utilization.
4. **Benchmarking** — Compare current assessment against anonymized aggregates: "Your FIT rate for Finance (72%) is below the industry average (81%) for Discrete Manufacturing." [OPEN QUESTION: Does benchmarking require cross-partner data? If single-firm only, the sample size may be too small. If cross-firm, privacy and competitive concerns arise.]
5. **Return Client Analytics** — Track assessment-to-implementation outcomes (requires post-handoff feedback loop): implementation duration vs. estimated, actual cost vs. estimated, scope changes post-sign-off.

---

# ADDENDUM 2 SECTION 5: Updated Phase Definitions

## Phase 29: Platform Commercial & Self-Service (NEW)
**Source:** Addendum 2 Section 1. Organization/tenant model and provisioning. Self-service signup flow with 14-day trial. Partner admin dashboard (team, branding, auth, subscription). Stripe Billing integration (subscription + metered overages). Demo/sandbox with sample assessment. SSO/SCIM configuration UI. Subscription lifecycle management (trial → paid → cancel → reactivate). Usage metering. Plan tier enforcement. Data export and GDPR deletion request.

**Size:** XL
**Prerequisites:** Phase 17 (role/org model — Phase 29 builds the provisioning flow on top of the organization model from Phase 17)
**Dependency note:** Phase 17 defines the Organization model structurally. Phase 29 adds the commercial layer: plans, billing, provisioning, and the admin UI.

## Phase 30: Assessment Handoff, Sign-Off, and ALM Integration (NEW)
**Source:** Addendum 2 Section 2. Multi-layer validation workflow (area → technical → cross-functional → executive → partner countersign). SignatureRecord with cryptographic hash, IP, auth method, authority statement. AssessmentSnapshot model for immutable versioning. Sign-off certificate PDF generation with SHA-256 integrity hash and verification URL. Universal Assessment Package (JSON export). ALM export adapters: SAP Cloud ALM (REST API), Jira Cloud, Azure DevOps, Confluence. Handoff configuration UI. Transition briefing auto-generation. Archival and retention policy management.

**Size:** XL
**Prerequisites:** Phase 18 (lifecycle states), Phase 25 (reporting — sign-off certificate uses report generation infrastructure)

## Phase 31: Assessment Lifecycle Continuity (NEW)
**Source:** Addendum 2 Section 3. Assessment versioning (immutable snapshots with delta comparison). Assessment cloning for Phase 2 carry-forward (selective data inheritance, cross-phase dependency detection). Change control workflow (post-sign-off modification with formal change request, partial unlock, re-validation, re-sign). Reassessment triggers (SAP version delta, regulatory change, scope expansion). Delta report generation.

**Size:** L
**Prerequisites:** Phase 30 (sign-off and snapshot model)

## Phase 26 (UPDATED): Analytics, Benchmarking, Templates, and Portfolio
**Source:** Original A10 items 3-4 + Addendum 2 Section 4. Assessment template creation from completed assessments (anonymized, organization-scoped). Template marketplace within org. Cross-phase analytics for multi-phase clients. Partner portfolio dashboard (aggregate metrics, consultant utilization). Benchmarking against anonymized aggregates. Return client analytics (assessment-to-implementation outcomes). Document single-firm assumption.

**Size:** XL (upgraded from L)
**Prerequisites:** Phase 29 (organization model for org-scoped templates), Phase 31 (versioning for cross-phase analytics)

---

# ADDENDUM 2 SECTION 6: Updated Phase Dependency Graph

```
Phase 10-13 (Foundation enrichments)
  ↓
Phase 14-16 (New registers + comment support)
  ↓
Phase 17 (11-role model + Organization model + SSO/SCIM)
  ↓
Phase 18 (Lifecycle states + parallel workstreams)
  ↓
Phase 19 (Notifications + WebSocket + Presence + Web Push)
  ↓
Phase 28 (Real-Time Collaboration — comments, locks, conflicts, activity feed)
  ↓
Phase 20-21 (Visualization + Workshop Mode)
  ↓
Phase 22-24 (Conversation Mode, Dashboard, Onboarding)
  ↓
Phase 25 (Reporting V2)
  ↓
Phase 29 (Commercial Platform — builds on Phase 17 org model)
  ↓
Phase 30 (Sign-Off + Handoff + ALM Integration — builds on Phase 25 reports)
  ↓
Phase 31 (Lifecycle Continuity — builds on Phase 30 snapshots)
  ↓
Phase 26 (Analytics + Benchmarking + Templates — builds on Phase 29 + 31)
  ↓
Phase 27 (Production Hardening, PWA, Mobile — capstone, hardens everything)
```

**Implementation Waves (recommended):**

| Wave | Phases | Duration | Focus |
|------|--------|----------|-------|
| Wave 1 | 10-13 | 4-6 weeks | Enrich existing models |
| Wave 2 | 14-16 | 4-6 weeks | New registers |
| Wave 3 | 17-18 | 3-4 weeks | Roles + lifecycle |
| Wave 4 | 19, 28 | 4-6 weeks | Real-time infrastructure + collaboration |
| Wave 5 | 20-21 | 4-6 weeks | Visualization + workshops |
| Wave 6 | 22-24 | 6-8 weeks | UX innovation |
| Wave 7 | 25, 29 | 4-6 weeks | Reports + commercial platform |
| Wave 8 | 30-31 | 4-6 weeks | Sign-off + lifecycle continuity |
| Wave 9 | 26 | 3-4 weeks | Analytics (needs data from prior waves) |
| Wave 10 | 27 | 4-6 weeks | Hardening (capstone) |

---

# ADDENDUM 2 SECTION 7: Completeness Verification

| Check | Status |
|-------|--------|
| Prospect discovery and evaluation | ✅ Section 1.3 (landing page, signup flow) |
| Self-service signup | ✅ Section 1.3 |
| Sales-assisted provisioning | ✅ Section 1.3 |
| Organization/tenant creation | ✅ Section 1.3 (auto-provision) + data model in 1.8 |
| Subscription plans (Starter/Pro/Enterprise) | ✅ Section 1.2 |
| Trial flow (14 days, no credit card) | ✅ Section 1.5 |
| Billing integration (Stripe) | ✅ Section 1.2, 1.5, 1.6 |
| Usage metering | ✅ Section 1.6 |
| Partner admin dashboard | ✅ Section 1.4 |
| Demo/sandbox with sample data | ✅ Section 1.7 |
| Multi-layer validation workflow | ✅ Section 2.2 |
| Area validation per process owner | ✅ Section 2.2 Layer 1 |
| Technical validation | ✅ Section 2.2 Layer 2 |
| Cross-functional validation | ✅ Section 2.2 Layer 3 |
| Executive sign-off with crypto hash | ✅ Section 2.3 |
| Partner countersign | ✅ Section 2.3 |
| Sign-off certificate PDF | ✅ Section 2.4 |
| Tamper verification URL | ✅ Section 2.4 |
| Universal export package (JSON) | ✅ Section 2.5 |
| SAP Cloud ALM adapter | ✅ Section 2.5 |
| Jira adapter | ✅ Section 2.5 |
| Azure DevOps adapter | ✅ Section 2.5 |
| Confluence adapter | ✅ Section 2.5 |
| Transition briefing auto-generation | ✅ Section 2.5 |
| Archival and retention | ✅ Section 2.6 |
| GDPR data deletion | ✅ Section 2.6 |
| Assessment versioning (immutable snapshots) | ✅ Section 3.2 |
| Version comparison / delta report | ✅ Section 3.2 |
| Assessment cloning for Phase 2 | ✅ Section 3.3 |
| Cross-phase dependency detection | ✅ Section 3.3 |
| Change control post-sign-off | ✅ Section 3.4 |
| Change request workflow | ✅ Section 3.4 |
| Partial unlock for modifications | ✅ Section 3.4 |
| Reassessment triggers | ✅ Section 3.5 |
| Assessment templates (anonymized) | ✅ Section 3.6 |
| Cross-phase analytics | ✅ Section 4 |
| Partner portfolio dashboard | ✅ Section 4 |
| Updated dependency graph | ✅ Section 6 |
| Implementation waves | ✅ Section 6 |
---
# V2 Master Brief — Addendum 3: Step Content Presentation & Classification UX

> **Why this addendum exists:** Screenshots of the current step review experience reveal a critical UX failure. The main user exercise — classifying process steps — is buried under walls of raw SAP documentation. The V2 framework (Phases 10-31) enhances the response side (what users input) but completely ignores the presentation side (how SAP content is shown). This addendum fixes that gap by updating Phase 12.

---

# ADDENDUM 3 SECTION 1: Problem Analysis

## 1.1 Current State (from screenshots)

The current step review card (StepReviewCard.tsx) renders every step identically:
1. Step number and title
2. Tag label (e.g., "Information", "LogOn")
3. Full SAP Best Practice text — dumped as continuous paragraphs, no formatting
4. Related Configuration Activities
5. Four classification options at the bottom
6. Activity label
7. Previous/Next navigation

**Specific failures observed:**

| Problem | Example from Screenshots | Impact |
|---------|------------------------|--------|
| Non-classifiable steps shown as classifiable | Step 1 "Information" asks "How does your company do this?" for system prerequisites and role templates | Users confused, select "Not applicable" reflexively — no value captured |
| Zero content hierarchy | Purpose, Overview, Prerequisites, System Access, Roles, Master Data all at same visual weight | Users can't find the actual business content among technical setup details |
| No progressive disclosure | 500+ words shown at once for Step 1 including SAP role template tables and master data script IDs | Cognitive overload — users stop reading |
| 56-step flat sequence | Progress bar shows "Step 1 of 56" with no grouping | Feels like a marathon — no sense of progress or context |
| Decision below the fold | Classification options require scrolling past all SAP text | The actual task (classify) is secondary to the reference material |
| No content parsing | SAP text has clear section markers (Purpose, Prerequisites, Roles, etc.) but rendered as unformatted paragraphs | Structure in source data is lost in presentation |
| Configuration activities not contextualized | "Optional Cash Journal Self-Service" shown 3 times with no explanation of what it means or whether user should care | Visual noise |

## 1.2 Root Cause

The SAP Best Practice test script content is structured documentation with:
- **Step tags** that indicate step purpose: Information, LogOn, TestProcedure, BusinessProcess, etc.
- **Section markers** within the description text: Purpose, Overview, Prerequisites, System Access, Roles, Master Data
- **Expected Results** for validation steps
- **Activity labels** that describe the business action

The current ABeam code treats ALL steps identically and renders ALL content fields the same way. It does not:
- Differentiate step types
- Parse content sections
- Apply progressive disclosure
- Group steps into logical sections
- Determine which steps are classifiable vs. reference-only

**This is an ABeam build problem, not a SAP data problem.** The SAP source data has structure — ABeam ignores it.

---

# ADDENDUM 3 SECTION 2: Step Type Classification

## 2.1 Step Types and Presentation Rules

Every SAP process step has a `tag` field. Based on the tag, ABeam must render the step differently:

| Step Tag | User-Facing Label | Classifiable? | Presentation Rule |
|----------|------------------|--------------|-------------------|
| Information | 📋 Reference | NO — auto-mark as REFERENCE | Collapsed by default. Show only title + "This step contains setup information." Expandable for detail. Does NOT count toward completion %. |
| LogOn | 🔑 System Access | NO — auto-mark as REFERENCE | Show as compact one-liner: "Log on to [system] as [role]." Collapsed. Not classifiable. |
| LogOff | 🔑 System Access | NO — auto-mark as REFERENCE | Same as LogOn. |
| TestProcedure | 📝 Test Information | NO — auto-mark as REFERENCE | Collapsed. Show only: "This describes how to test [scope item]." |
| BusinessProcess | ⚙️ Process Step | YES | Full classification card with decision-first layout |
| Configuration | ⚙️ Configuration Step | YES | Full classification card, pre-tagged with CONFIGURE hint |
| Reporting | 📊 Report Step | YES | Full classification card |
| MasterData | 📦 Master Data | CONDITIONAL | If company has custom master data requirements: YES. Otherwise: auto-REFERENCE |
| (any other/unknown) | ⚙️ Process Step | YES | Default to classifiable |

### Classification Impact

**Current:** All 56 steps require classification → user fatigue, meaningless responses for setup steps.
**Proposed:** Only ~35-40 of 56 steps are classifiable. The rest are auto-marked as REFERENCE and collapsed. User sees: "35 process steps to review (plus 21 reference steps)."

### Data Model Addition

```
// Add to StepResponse or ProcessStep model
stepCategory     StepCategory  // Derived from SAP tag at import time

enum StepCategory {
  BUSINESS_PROCESS    // Classifiable — the core work
  CONFIGURATION       // Classifiable — configuration-specific
  REPORTING           // Classifiable — reporting-specific
  REFERENCE           // Non-classifiable — auto-collapsed
  SYSTEM_ACCESS       // Non-classifiable — logon/logoff
  TEST_INFO           // Non-classifiable — test procedure descriptions
  MASTER_DATA         // Conditionally classifiable
}
```

---

# ADDENDUM 3 SECTION 3: Content Parsing and Progressive Disclosure

## 3.1 SAP Content Section Detection

The SAP description text contains recognizable section headers. ABeam must parse these into structured sections:

**Detection rules (regex patterns on description text):**

| Pattern | Section Type | Default State |
|---------|-------------|---------------|
| `Purpose` or `Overview` | PURPOSE | **Visible** — always shown |
| `Prerequisites` | PREREQUISITES | Collapsed |
| `System Access` or `System` (followed by table) | SYSTEM_ACCESS | Collapsed |
| `Roles` or `Role Template` | ROLES | Collapsed |
| `Master Data` (and subsequent tables) | MASTER_DATA | Collapsed |
| `Using Your Own Master Data` | CUSTOM_DATA | Collapsed |
| `Default Values` | DEFAULTS | Collapsed |
| `Expected Result` | EXPECTED_RESULT | Visible for test steps only |
| Everything else (the actual process description) | PROCESS_CONTENT | **Visible** |

### Parsed Content Model

```typescript
interface ParsedStepContent {
  // Always visible
  purposeSummary: string;         // First 1-2 sentences of Purpose/Overview
  processContent: string;         // The actual business process description (non-section text)
  
  // Collapsible sections
  sections: ParsedSection[];
  
  // Metadata
  hasRoleTables: boolean;
  hasMasterDataTables: boolean;
  hasConfigActivities: boolean;
}

interface ParsedSection {
  type: SectionType;
  title: string;                  // "Prerequisites", "Roles", "Master Data", etc.
  content: string;                // HTML content for this section
  defaultExpanded: boolean;
  tables: ParsedTable[];          // Any tables within this section
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}
```

### Rendering Rules

For a **classifiable step** (Business Process, Configuration, Reporting):
```
┌─────────────────────────────────────────┐
│ ⚙️ Step 6 of 35           [Progress]    │
│ Post Cash Journal Entries                │
│                                          │
│ ┌─ HOW DOES YOUR COMPANY DO THIS? ─────┐│
│ │ ○ This matches our process            ││
│ │ ○ We can work with this, with config  ││
│ │ ○ Our process is different            ││
│ │ ○ Not applicable to us               ││
│ └───────────────────────────────────────┘│
│                                          │
│ WHAT SAP BEST PRACTICE SAYS:            │
│ [Purpose summary — 1-2 sentences]       │
│                                          │
│ [Process content — the actual business  │
│  description, formatted]                 │
│                                          │
│ ▸ Prerequisites (tap to expand)         │
│ ▸ Roles & System Access (tap to expand) │
│ ▸ Master Data (tap to expand)           │
│                                          │
│ CONFIGURATION ACTIVITIES:               │
│ [If any — with explanatory tooltip]     │
│                                          │
│ ◀ Previous          6/35         Next ▶ │
└─────────────────────────────────────────┘
```

Key changes:
- **Decision FIRST** — classification options above SAP content
- **Purpose summary** — only first 1-2 meaningful sentences shown
- **Process content** — the actual business description, formatted
- **Technical sections collapsed** — Prerequisites, Roles, Master Data hidden by default
- **Step counter shows classifiable steps only** — "6 of 35" not "6 of 56"

For a **reference step** (Information, LogOn, TestProcedure):
```
┌─────────────────────────────────────────┐
│ 📋 Reference Step                       │
│ Cash Journal — Setup Information        │
│                                          │
│ This step contains setup information    │
│ for the Cash Journal scope item.        │
│ ▸ View full details                     │
│                                          │
│ ◀ Previous                       Next ▶ │
└─────────────────────────────────────────┘
```

Compact. Not counted in progress. Expandable for consultants who want the detail.

---

# ADDENDUM 3 SECTION 4: Step Grouping

## 4.1 Automatic Step Grouping

The 56 steps in a scope item typically follow a pattern:
1. Information/setup steps (1-3)
2. LogOn step (1)
3. Business process steps grouped by sub-process (variable)
4. Reporting/verification steps (variable)
5. LogOff step (1)

ABeam should group steps by their `activity` field and `tag`:

```
Cash Journal (35 classifiable / 56 total)

📋 Setup & Reference (3 steps) — auto-collapsed, non-classifiable
  Information: Purpose & Prerequisites
  Information: Test Procedures  
  Information: Master Data Setup

🔑 System Access (2 steps) — auto-collapsed, non-classifiable
  Log On as GL Accountant
  Log Off

⚙️ Cash Journal Posting (15 steps) — ACTIVE SECTION
  Step 1: Open Cash Journal ○○○○
  Step 2: Enter Cash Receipt ○○○○
  Step 3: Post Entry ○○○○
  ...

⚙️ Cash Journal Display (8 steps)
  Step 16: Display Posted Entries ○○○○
  ...

📊 Reporting & Verification (12 steps)
  Step 24: Run Cash Journal Report ○○○○
  ...
```

### Grouping Algorithm

```typescript
function groupSteps(steps: ProcessStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  let currentGroup: StepGroup | null = null;
  
  for (const step of steps) {
    const category = categorizeStep(step.tag);
    const groupKey = deriveGroupKey(step);
    
    if (!currentGroup || currentGroup.key !== groupKey) {
      currentGroup = {
        key: groupKey,
        label: deriveGroupLabel(step),
        category: category,
        steps: [],
        classifiableCount: 0,
        completedCount: 0,
      };
      groups.push(currentGroup);
    }
    
    currentGroup.steps.push(step);
    if (isClassifiable(category)) {
      currentGroup.classifiableCount++;
    }
  }
  
  return groups;
}

function deriveGroupKey(step: ProcessStep): string {
  // Group by: tag category + activity field
  // "Information" steps → "reference"
  // "LogOn"/"LogOff" → "system_access"
  // Business steps with same activity → same group
  const category = categorizeStep(step.tag);
  if (category === 'REFERENCE' || category === 'TEST_INFO') return 'reference';
  if (category === 'SYSTEM_ACCESS') return 'system_access';
  return step.activity || 'process'; // Group by activity field
}
```

## 4.2 Enhanced Progress Indicator

Replace flat progress bar with segmented progress:

```
[████████] Setup  [████░░░░░░] Posting  [░░░░░░] Display  [░░░░░░░░] Reports
  3/3              7/15                   0/8                0/12
  (ref)            (in progress)          (not started)      (not started)
```

Each segment:
- Shows group name
- Shows completion count (classifiable steps only)
- Color-coded: green (complete), blue (in progress), gray (not started), dim (reference/auto-skipped)
- Clickable to jump to that group

---

# ADDENDUM 3 SECTION 5: Configuration Activity Contextualization

## 5.1 Current Problem

The screenshots show:
```
RELATED CONFIGURATION ACTIVITIES
Optional  Cash Journal  Self-Service
Optional  Cash Journal  Self-Service
Optional  Cash Journal  Self-Service
```

Three identical-looking entries with no explanation of what "Self-Service" means, why there are three, or what the user should do with this information.

## 5.2 Solution

Parse configuration activities and display them meaningfully:

```
RELATED CONFIGURATION
This step involves 3 optional configuration activities (Self-Service).
These are SAP standard configurations that can be activated without custom development.
▸ View configuration details
```

When expanded:
```
Configuration Activity: Cash Journal — Self-Service Configuration
Type: Self-Service (can be configured by your team in SAP without consulting support)
Required: Optional — only needed if you use this process

1. Cash Journal - Define Cash Journal (SPRO path: ...)
2. Cash Journal - Number Ranges (SPRO path: ...)  
3. Cash Journal - Authorization Groups (SPRO path: ...)
```

**Key change:** De-duplicate, explain the "Self-Service" tag in plain language, and collapse by default. This is consultant reference material, not a business decision.

---

# ADDENDUM 3 SECTION 6: Updated Phase 12 Definition

Phase 12 must now be renamed and expanded:

**OLD:** Phase 12: Step Response Enrichment
**NEW:** Phase 12: Step Response Enrichment & Content Presentation

**Updated scope adds (in addition to existing A5.3 response fields):**

1. **Step type classification engine** — Parse step `tag` field into StepCategory enum (Section 2). Auto-classify non-classifiable steps. Store stepCategory on each ProcessStep record. Migration: backfill all existing steps.

2. **Content parser** — Parse SAP description text into structured sections using regex pattern matching (Section 3.1). Store parsed content as JSON (or compute at render time). Expose ParsedStepContent via API.

3. **Decision-first card layout** — Restructure StepReviewCard.tsx: classification options above SAP content, purpose summary visible, technical sections collapsed (Section 3).

4. **Step grouping** — Group steps by activity + tag into StepGroups (Section 4). Compute groups at scope item level. Display grouped navigation with segmented progress bar.

5. **Enhanced progress indicator** — Replace flat progress bar with segmented, group-aware progress showing classifiable-only counts (Section 4.2).

6. **Reference step rendering** — Compact, non-classifiable card for Information/LogOn/TestProcedure steps (Section 3).

7. **Configuration activity contextualization** — De-duplicate, explain Self-Service tag, collapse by default (Section 5).

**Size:** Upgraded from M to L (presentation overhaul is significant UI work)

**Dependencies:** None new — still follows Phase 10-11 as before.

---

# ADDENDUM 3 SECTION 7: Impact on Other Phases

| Phase | Impact |
|-------|--------|
| Phase 10 (Company Profile) | No change |
| Phase 11 (Scope Selection) | No change |
| Phase 12 (Step Response) | **MAJOR UPDATE** — Now includes content presentation overhaul per this addendum |
| Phase 20 (Visualization) | Benefits from step grouping — flow diagrams can use group boundaries |
| Phase 21 (Workshop Mode) | Workshop facilitator view should use grouped steps, skip reference steps in synchronized navigation |
| Phase 22 (Conversation Mode) | Conversation can reference step groups: "Let's focus on the Cash Journal Posting steps" |
| Phase 23 (Dashboard) | Completion metrics should count classifiable steps only |
| Phase 25 (Reporting) | Reports should distinguish "N of M classifiable steps reviewed" vs total |
| Phase 27 (Mobile/PWA) | Mobile view especially benefits from collapsed reference steps and decision-first layout |

---

# ADDENDUM 3 SECTION 8: Completeness Verification

| Check | Status |
|-------|--------|
| Step types classified with presentation rules | ✅ Section 2 |
| Non-classifiable steps identified and handled | ✅ Section 2 (Information, LogOn, LogOff, TestProcedure) |
| Content parsed into collapsible sections | ✅ Section 3.1 |
| Decision-first card layout specified | ✅ Section 3 |
| Step grouping algorithm defined | ✅ Section 4.1 |
| Enhanced progress indicator specified | ✅ Section 4.2 |
| Configuration activities contextualized | ✅ Section 5 |
| Phase 12 updated | ✅ Section 6 |
| Impact on other phases documented | ✅ Section 7 |
| Data model additions specified | ✅ Section 2 (StepCategory enum) |
| TypeScript interfaces defined | ✅ Section 3.1 (ParsedStepContent, ParsedSection) |
| Rendering rules for classifiable vs reference | ✅ Section 3 |

---
