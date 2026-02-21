# Handoff Document — Aptus

## Current State

**ALL PHASES COMPLETE — Phase 9: Polish & Production Readiness — COMPLETE**

### Completed Phases

#### Phase 0: Project Scaffolding (COMPLETE)
#### Phase 1: Data Ingestion Pipeline (COMPLETE)
#### Phase 2: Authentication & Assessment Setup (COMPLETE)
#### Phase 3: Scope Selection (COMPLETE)
#### Phase 4: Process Deep Dive (COMPLETE)
#### Phase 5: Gap Resolution (COMPLETE)
#### Phase 6: Configuration Matrix (COMPLETE)
#### Phase 7: Report Generation (COMPLETE)
#### Phase 8: Intelligence Layer Admin (COMPLETE)
#### Phase 9: Polish & Production Readiness (COMPLETE)

### Phase 9 Implementation Details

**Loading States** (9.1):
- `(portal)/loading.tsx`: Portal-level skeleton with metric card grid + content lines
- `(portal)/assessment/[id]/loading.tsx`: Assessment skeleton with card + row placeholders
- `LoadingSkeleton` and `CardSkeleton` shared components with `aria-label="Loading"`

**Error States** (9.2):
- `(portal)/error.tsx`: Portal error boundary with retry + dashboard navigation
- `(portal)/assessment/[id]/error.tsx`: Assessment error boundary with retry + assessments navigation
- Both show error message with fallback text, AlertCircle icon

**Empty States** (9.3):
- `EmptyState` shared component used in 6+ locations (assessments, dashboard, gaps, flows, remaining, scope)
- Contextual messaging per feature area with optional action buttons

**Keyboard Navigation** (9.4):
- `aria-label` on navigation, buttons, loading states, QR images
- `htmlFor` label associations on all form inputs
- Semantic HTML throughout (nav, button, table, form elements)
- Tab order follows natural document flow via shadcn/ui components

**Print Styles** (9.5):
- `@media print` in globals.css: hides header/nav/aside/button/.no-print
- Table page break rules (avoid breaking rows)
- Clean black text on white, no shadows
- 1.5cm page margins

**Performance Audit** (9.6):
- Turbopack build optimization
- Server components for data fetching (no client-side waterfalls)
- `useMemo` for derived state (no useEffect+setState pattern)
- Skeleton loading states prevent layout shift

**Security Audit** (9.7):
- All assessment API routes require session + MFA verification
- All admin API routes require admin role (`requireAdmin()`)
- Only auth endpoints (login/verify) are unauthenticated
- Input validation via Zod on all POST/PUT endpoints
- Area-locked permissions enforce functional area boundaries
- CSRF protection via NextAuth session tokens

**MFA UX Polish** (9.9):
- TOTP countdown timer with 30-second window
- Auto-focus on code input field
- Clear error messages for invalid codes
- 6-digit numeric validation
- Recovery code flow support

**Permission Denied UX** (9.10):
- `PermissionDenied` shared component with ShieldAlert icon
- Shows required functional area and user role
- "Go Back" navigation button

**Dashboard Polish** (9.11):
- Admin nav link corrected to `/admin` (was `/intelligence/industries`)
- Admin sidebar with organized sections (Intelligence, Data, System)

**Tests**: 197 tests total (polish: 46, report-generation: 47, admin: 18, config-matrix: 29, step-response: 17, scope-selection: 19, mfa: 5, permissions: 15, setup: 1)

### Quality Gate Results (FINAL)
1. `pnpm typecheck:strict` — 0 errors
2. `pnpm lint:strict` — 0 errors, 0 warnings
3. `pnpm build` — success (69 routes)
4. `pnpm test --run` — 197 tests passed

### Phase 8 Implementation Details

**Admin Guard** (`src/lib/auth/admin-guard.ts`):
- `requireAdmin()`: Shared auth + admin role check. Returns user or error NextResponse.
- `isAdminError()`: Type guard for error responses.

**Admin API Routes** (`api/admin/`):
- `industries` (GET/POST): List/create industry profiles. Code uniqueness check.
- `industries/[industryId]` (GET/PUT/DELETE): Single profile CRUD.
- `baselines` (GET/POST): List/create effort baselines. Scope+complexity uniqueness check.
- `baselines/[baselineId]` (GET/PUT/DELETE): Single baseline CRUD.
- `extensibility-patterns` (GET/POST): List/create patterns with resolution type filter.
- `extensibility-patterns/[patternId]` (GET/PUT/DELETE): Single pattern CRUD.
- `adaptation-patterns` (GET/POST): List/create adaptation patterns.
- `adaptation-patterns/[patternId]` (GET/PUT/DELETE): Single pattern CRUD.
- `overview` (GET): Dashboard stats (assessments, catalog, intelligence).
- `assessments` (GET): All assessments with status filter.

**Admin Pages** (`(portal)/admin/`):
- `layout.tsx`: Admin layout with sidebar, role check redirect.
- `page.tsx` (Overview): Metric cards, catalog stats, intelligence stats, recent activity feed.
- `industries/page.tsx`: CRUD table for industry profiles.
- `baselines/page.tsx`: CRUD table for effort baselines.
- `extensibility-patterns/page.tsx`: CRUD table for extensibility patterns.
- `adaptation-patterns/page.tsx`: CRUD table for adaptation patterns.
- `assessments/page.tsx`: All assessments table with status filter.
- `catalog/page.tsx`: SAP catalog stats with functional area distribution.
- `ingest/page.tsx`: ZIP ingestion UI with version display and warning banner.
- `verify/page.tsx`: Data verification checks (7 checks: scope items, steps, configs, areas, links, duplicates).
- `users/page.tsx`: User list with role, MFA status, last login.

**Components** (`components/admin/`):
- `AdminSidebar`: Dark sidebar nav with sections (Intelligence, Data, System).
- `AdminOverviewClient`: Dashboard with metric cards and activity feed.
- `AdminCrudTable`: Reusable CRUD table with create/edit form, delete confirmation.
- `AdminAssessmentsClient`: Assessment list with status filter.
- `IngestClient`: ZIP ingestion UI with warning banner.

**Tests**: 151 tests total (admin: 18, report-generation: 47, config-matrix: 29, step-response: 17, scope-selection: 19, mfa: 5, permissions: 15, setup: 1)

### Quality Gate Results
1. `pnpm typecheck:strict` — 0 errors
2. `pnpm lint:strict` — 0 errors, 0 warnings
3. `pnpm build` — success (69 routes including all admin pages and API routes)
4. `pnpm test --run` — 151 tests passed

### Technical Notes
- All admin routes enforce `requireAdmin()` — returns 403 for non-admin roles
- Prisma `exactOptionalPropertyTypes` requires building explicit update data objects (strip `undefined` values) before passing to `.update()`
- Admin layout checks `user.role !== "admin"` at the server component level, redirecting to `/dashboard`
- `AdminCrudTable` is a generic reusable component accepting column definitions, form fields, and API path
- Industry profile codes must be lowercase alphanumeric with hyphens/underscores (validated by Zod regex)
- Effort baselines have a unique constraint on `[scopeItemId, complexity]`

### Next Phase
All phases complete. Project is production-ready.

### Known Issues
None.

### Phase 7 Implementation Details

**Report Library** (`src/lib/report/`):
- `report-data.ts`: Data aggregation — `getReportSummary()`, `getScopeDataForReport()`, `getStepDataForReport()`, `getGapDataForReport()`, `getConfigDataForReport()`, `getAuditTrailForReport()`
- `xlsx-generator.ts`: ExcelJS-based XLSX generation with styled headers, auto-filter, frozen panes. Sheet configs: `scopeCatalogSheet`, `stepDetailSheet`, `gapRegisterSheet`, `configWorkbookSheet`, `auditTrailSheet`, `remainingItemsSheet`
- `pdf-generator.ts`: jsPDF-based PDF generation — `generateExecutiveSummaryPdf()` (branded A4 with scope, fit analysis, gaps, config counts), `generateEffortEstimatePdf()` (effort by type and phase). Helper `getFinalY()` for autoTable position tracking
- `flow-diagram.ts`: SVG generation — `generateFlowSvg()` creates colored flow diagrams with sequential nodes (FIT=green, CONFIGURE=blue, GAP=amber, NA/PENDING=gray), arrows, legend
- `report-auth.ts`: Shared auth — `authenticateForReport()` validates user + MFA + assessment status, `isErrorResponse()` type guard

**Report API Routes** (`api/assessments/[id]/report/`):
- `executive-summary` (GET): PDF with jsPDF
- `scope-catalog` (GET): XLSX
- `step-detail` (GET): XLSX
- `gap-register` (GET): XLSX
- `config-workbook` (GET): XLSX
- `effort-estimate` (GET): PDF
- `audit-trail` (GET): XLSX (available at any assessment status)
- `flow-atlas` (GET): PDF with TOC + all flow diagrams compiled
- `remaining-register` (GET): XLSX
- `sign-off` (POST): Zod validation, duplicate role prevention, auto status transition to `signed_off` when all 3 roles sign

**Flow Diagram API Routes** (`api/assessments/[id]/flows/`):
- `GET /flows`: List diagrams with scope item enrichment + summary stats
- `POST /flows`: Generate diagrams for selected scope items (with regenerate option)
- `GET /flows/[flowId]`: Serve individual SVG content
- `GET /flows/[flowId]/pdf`: Serve individual flow as PDF

**Remaining Items API Routes** (`api/assessments/[id]/remaining/`):
- `GET /remaining`: List items with filters (category, severity, scopeItemId, functionalArea, resolved) + summary
- `POST /remaining`: Create manual item with Zod validation + decision logging
- `POST /remaining/auto-generate`: Auto-detect items from assessment data (unreviewed steps, MAYBE scope items, excluded recommended configs, OUT_OF_SCOPE gaps). Deduplicates against existing auto-generated items

**Pages**:
- `(portal)/assessment/[id]/report/page.tsx`: Server component fetching summary + sign-offs
- `(portal)/assessment/[id]/flows/page.tsx`: Server component fetching diagrams + scope item names
- `(portal)/assessment/[id]/remaining/page.tsx`: Server component fetching items + summary

**Components**:
- `report/ReportClient.tsx`: Report download page with stat cards, fit distribution bar, 9-report download grid, complete package ZIP button, 3-role digital sign-off section
- `flows/FlowViewerClient.tsx`: Flow diagram viewer with scope item sidebar, SVG viewer, status badges, generate/regenerate controls, PDF download per diagram
- `remaining/RemainingItemsClient.tsx`: Remaining items table with summary cards (Total/Critical/High/Resolved), category/severity/resolved/search filters, expandable rows, auto-detect button, manual item add form, XLSX export

**Types**:
- Added `CONFLICT` to `ERROR_CODES`
- Added `CONFIG_INCLUDED`, `CONFIG_EXCLUDED` to `DecisionAction` union

**Tests**: 133 tests total (report-generation: 47, config-matrix: 29, step-response: 17, scope-selection: 19, mfa: 5, permissions: 15, setup: 1)

### Quality Gate Results
1. `pnpm typecheck:strict` — 0 errors
2. `pnpm lint:strict` — 0 errors, 0 warnings
3. `pnpm build` — success (50 routes including all report, flow, and remaining item endpoints)
4. `pnpm test --run` — 133 tests passed

### Technical Notes
- Binary responses use `Uint8Array` with `as unknown as BodyInit` cast for Next.js route handler compatibility
- ProcessStep uses `sequence` (not `sequenceNumber`)
- StepResponse needs `include` (not `select`) for `processStep` relation access
- jspdf-autotable y-position tracking via `getFinalY()` helper with unknown cast
- Sign-off auto-transitions assessment status to `signed_off` when all 3 roles (client_representative, bound_consultant, bound_pm) have signed
- Audit trail report is available at any assessment status (not gated behind completion)
- Flow diagrams use upsert with `assessmentId_scopeItemId_processFlowName` unique constraint

### Next Phase
**Phase 8: Intelligence Layer Admin** — Admin dashboard, intelligence settings, model management

### Known Issues
None.

---

## V2 Enhancement Specifications

> **Date**: 2026-02-21
> **Source**: `enhancement210226/V2-MASTER-BRIEF (1).md`
> **Specs Directory**: `specs/v2/`
> **Master Index**: `specs/V2-SPEC-INDEX.md`
> **Cross-Verification**: `specs/V2-CROSS-VERIFICATION-REPORT.md`

### V2 Scope Summary

22 phases (10–31) expanding Aptus from a core FIT-to-Standard assessment tool into a full enterprise platform with:
- Enriched assessment workflow (company profile, scope selection, step presentation, gap resolution)
- New registers (integration, data migration, OCM)
- 11-role system with SSO/SCIM (up from 5 roles)
- Real-time collaboration (WebSocket, comments, field locks, conflict detection)
- Workshop management with synchronized navigation
- Conversation mode for business-friendly classification
- Intelligent role-aware dashboards
- Per-role onboarding wizards
- Enhanced reporting with branding
- Platform commercial layer (Stripe billing, self-service signup, partner admin)
- Multi-layer sign-off with cryptographic verification + ALM export
- Assessment lifecycle continuity (versioning, cloning, change control)
- Analytics, benchmarking, and templates
- PWA with offline capability

### Implementation Waves

#### Wave 1: Foundation Enrichments (4–6 weeks)
- **Phase 10**: Company Profile Enrichment (M) — operating model, regulatory, SAP landscape
- **Phase 11**: Scope Selection Enhancement (M) — industry-guided, dependencies, bulk ops
- **Phase 12**: Step Response & Content Presentation (L) — step classification, content parsing, decision-first layout
- **Phase 13**: Gap Resolution Enhancement (L) — cost model, risk scoring, what-if scenarios

#### Wave 2: New Registers (4–6 weeks)
- **Phase 14**: Integration Register (M) — IntegrationPoint model, middleware categorization
- **Phase 15**: Data Migration Register (M) — DataMigrationObject, volume/effort estimation
- **Phase 16**: OCM Impact Register (M) — OcmImpact, training needs, readiness tracking

#### Wave 3: Roles & Lifecycle (3–4 weeks)
- **Phase 17**: Role System & Organization Model (XL) — 11 roles, Organization, SSO/SCIM, RBAC
- **Phase 18**: Assessment Lifecycle (M) — extended status machine, workshop sessions

#### Wave 4: Real-Time Infrastructure (4–6 weeks)
- **Phase 19**: Notifications & Real-Time (L) — WebSocket, in-app/email/push notifications, presence
- **Phase 28**: Real-Time Collaboration (XL) — comments, @mentions, field locks, conflicts, activity feed

#### Wave 5: Visualization & Workshops (4–6 weeks)
- **Phase 20**: Process Visualization (M) — interactive flow diagrams, heatmaps, BPMN
- **Phase 21**: Workshop Management (L) — Workshop Mode, QR join, live polling, minutes

#### Wave 6: UX Innovation (6–8 weeks)
- **Phase 22**: Conversation Mode (L) — chat-like classification, decision trees
- **Phase 23**: Intelligent Dashboard (L) — role-aware widgets, attention engine, KPIs
- **Phase 24**: Onboarding System (M) — per-role wizards, contextual tooltips, sample data

#### Wave 7: Reports & Commercial (4–6 weeks)
- **Phase 25**: Report Generation V2 (M) — new reports, readiness scorecard, branding
- **Phase 29**: Platform Commercial (XL) — self-service signup, Stripe, partner admin, trials

#### Wave 8: Sign-Off & Continuity (4–6 weeks)
- **Phase 30**: Handoff & Sign-Off (XL) — multi-layer validation, crypto sign-off, ALM adapters
- **Phase 31**: Lifecycle Continuity (L) — versioning, cloning, change control, re-baseline

#### Wave 9: Analytics (3–4 weeks)
- **Phase 26**: Analytics & Benchmarking (XL) — portfolio dashboard, templates, benchmarking

#### Wave 10: Hardening (4–6 weeks)
- **Phase 27**: Production Hardening & PWA (L) — PWA, offline sync, mobile responsive, security

### Key Architectural Decisions

- **Role evolution**: 5 roles → 11 roles with migration path (Phase 17)
- **Organization model**: Extended with plan tiers, SSO, SCIM, billing (Phase 17 + 29)
- **Real-time**: WebSocket infrastructure built in Phase 19, used by Phases 21, 23, 28
- **Data model growth**: ~20 models → ~45+ models across all phases
- **Shared infrastructure**: Comment model (Phase 28), Notification system (Phase 19), Organization model (Phase 17)

### Open Questions (Consolidated)

1. Should client organizations support SSO in V2 or defer to V3? (Phase 17)
2. How are conversation templates authored — manually or AI-generated? (Phase 22)
3. Does benchmarking require cross-partner data? (Phase 26)
4. Is the marketing site part of V2 scope? (Phase 29)
5. Should Type B (direct enterprise client) be fully supported in V2? (Phase 29)
6. Can SAP Cloud ALM scope item ID mapping be automated? (Phase 30)
7. How to handle delta when SAP removes scope items in new version? (Phase 31)

### V2 Quality Gate

Before starting implementation:
1. All 22 spec files reviewed and approved
2. Open questions resolved with stakeholder input
3. Prisma schema migration plan finalized
4. Design system tokens verified for dark mode
5. Role migration script tested against production data snapshot
