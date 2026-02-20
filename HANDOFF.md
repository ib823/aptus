# Handoff Document — Bound Fit Portal

## Current State

**Phase 7: Report Generation — COMPLETE**

### Completed Phases

#### Phase 0: Project Scaffolding (COMPLETE)
#### Phase 1: Data Ingestion Pipeline (COMPLETE)
#### Phase 2: Authentication & Assessment Setup (COMPLETE)
#### Phase 3: Scope Selection (COMPLETE)
#### Phase 4: Process Deep Dive (COMPLETE)
#### Phase 5: Gap Resolution (COMPLETE)
#### Phase 6: Configuration Matrix (COMPLETE)
#### Phase 7: Report Generation (COMPLETE)

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
