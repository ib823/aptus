# Handoff Document — Bound Fit Portal

## Current State

**Phase 3: Scope Selection — COMPLETE**

### Completed Phases

#### Phase 0: Project Scaffolding (COMPLETE)
#### Phase 1: Data Ingestion Pipeline (COMPLETE)
#### Phase 2: Authentication & Assessment Setup (COMPLETE)
#### Phase 3: Scope Selection (COMPLETE)

### Phase 3 Implementation Details

**DB Queries** (`src/lib/db/scope-items.ts`):
- `getScopeItemsWithSelections(assessmentId)`: Joins ScopeItem with ScopeSelection and config counts, returns enriched items
- `getFunctionalAreas()`: Returns distinct functional area names
- `getIndustryPreSelections(industryCode)`: Returns applicable scope item IDs from IndustryProfile

**API Routes**:
- `api/assessments/[id]/scope` (GET): All scope items with selection status
- `api/assessments/[id]/scope/[scopeItemId]` (PUT): Upsert individual selection with area-lock permission check + decision logging
- `api/assessments/[id]/scope/bulk` (POST): Bulk select/deselect by functional area (consultant/admin only)

**Pages**:
- `(portal)/assessment/[id]/scope/page.tsx`: Server component that fetches scope items, assessment, and industry pre-selections

**Components**:
- `scope/ScopeSelectionClient`: Main client component with state management, debounced saves (500ms), search, filter (All/Selected/Not Selected/Maybe), area filter, bulk actions, progress stats, action bar
- `scope/ScopeAreaGroup`: Accordion by functional area with progress bar, select/deselect all buttons
- `scope/ScopeItemCard`: Individual scope item row with checkbox, relevance buttons (YES/MAYBE/NO), current state dropdown, expandable details (Purpose/Overview/Prerequisites/Tutorial tabs), notes textarea
- `scope/ScopeProgress`: Header progress display with selected count, steps count, responded percentage

**Tests**: 40 tests total (scope-selection: 19, mfa: 5, permissions: 15, setup: 1)
- Scope filtering: search by name/id/area, filter by selected/not-selected/maybe, area filter, combined filters
- Scope stats: selected count, step sum, responded count, empty array handling
- Selection state transitions: toggle, relevance-to-selection mapping

### Quality Gate Results
1. `pnpm typecheck:strict` — 0 errors
2. `pnpm lint:strict` — 0 errors, 0 warnings
3. `pnpm build` — success (15 pages including /assessment/[id]/scope)
4. `pnpm test --run` — 40 tests passed

### Technical Notes
- nodemailer added as dependency (required by NextAuth EmailProvider)
- AES-256-GCM encryption key must be 64 hex chars (32 bytes)
- exactOptionalPropertyTypes: use `?? null` for Prisma, `?? Prisma.JsonNull` for Json fields, `?? undefined` when type allows
- useSearchParams() requires Suspense boundary in Next.js 16
- Scope selections are debounced at 500ms on the client side before API save
- Industry pre-selections come from IndustryProfile.applicableScopeItems
- Read-only mode engaged for assessments with status "signed_off" or "reviewed"

### Next Phase
**Phase 4: Process Deep Dive** — Step-by-step review UI, FIT/CONFIGURE/GAP response capture, gap detail input

### Known Issues
None.
