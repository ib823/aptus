# ABEAM V2 — UX Restructuring Specification

**Document**: ABEAM-V2-UX-RESTRUCTURING-SPEC.md
**Scope**: Structural, layout, and information hierarchy changes to align the running codebase with the ABEAM V2 Complete Screen UI Reference (`ABEAM-V2-Complete-Screen-UI.html`)
**Prerequisite**: Modules 1–6 of the UI Reskin Spec must be complete (theme foundation, CSS variables, color tokens, card borders, badge colors, button styling, navigation colors)
**Boundary**: This spec touches JSX structure, grid layouts, element ordering, and component composition. It does NOT touch API routes, Prisma models, business logic, state machines, authentication, RBAC, data fetching, or React Query hooks.

---

## Table of Contents

1. [Execution Model](#1-execution-model)
2. [Risk Classification](#2-risk-classification)
3. [UXR-01: Assessment List Page](#uxr-01-assessment-list-page)
4. [UXR-02: Intelligent Dashboard](#uxr-02-intelligent-dashboard)
5. [UXR-03: Company Profile Wizard](#uxr-03-company-profile-wizard)
6. [UXR-04: Scope Selection — Process Landscape Map](#uxr-04-scope-selection--process-landscape-map)
7. [UXR-05: Scope Selection — Scope Item Briefing](#uxr-05-scope-selection--scope-item-briefing)
8. [UXR-06: Process Step Review — Sidebar Tree](#uxr-06-process-step-review--sidebar-tree)
9. [UXR-07: Process Step Review — Step Card Layout](#uxr-07-process-step-review--step-card-layout)
10. [UXR-08: Configuration Matrix](#uxr-08-configuration-matrix)
11. [UXR-09: Gap Resolution Cards](#uxr-09-gap-resolution-cards)
12. [UXR-10: Remaining Items Register](#uxr-10-remaining-items-register)
13. [UXR-11: Report & Export Page](#uxr-11-report--export-page)
14. [UXR-12: Digital Sign-Off Timeline](#uxr-12-digital-sign-off-timeline)
15. [UXR-13: Workshop Mode (Full-Screen)](#uxr-13-workshop-mode-full-screen)
16. [UXR-14: Conversation Mode](#uxr-14-conversation-mode)
17. [UXR-15: Activity Log](#uxr-15-activity-log)
18. [UXR-16: Registers (Integration, DM, OCM)](#uxr-16-registers-integration-dm-ocm)
19. [UXR-17: Portfolio Analytics](#uxr-17-portfolio-analytics)
20. [UXR-18: Assessment Templates](#uxr-18-assessment-templates)
21. [UXR-19: Organization & User Management](#uxr-19-organization--user-management)
22. [UXR-20: Admin Panel Layout](#uxr-20-admin-panel-layout)
23. [UXR-21: Auth Pages (Login, MFA)](#uxr-21-auth-pages-login-mfa)
24. [Dependency Graph](#dependency-graph)
25. [Verification Protocol](#verification-protocol)

---

## 1. Execution Model

Each UXR item is an atomic unit of work. Execute sequentially. After each UXR:

```bash
pnpm build && pnpm typecheck
```

If the build fails, revert and investigate before proceeding.

**Estimated total duration**: 8–12 hours via Claude Code CLI (significantly longer than the visual reskin because these changes touch JSX structure, not just className strings).

**Risk key**: 🟢 Low (className + wrapper div only) · 🟡 Medium (JSX restructure within a single component) · 🔴 High (cross-component restructure, new sub-components, or layout shell changes)

---

## 2. Risk Classification

| UXR | Risk | Reason |
|-----|------|--------|
| UXR-01 | 🟡 | Assessment card JSX restructure — single file, no child components |
| UXR-02 | 🟡 | Dashboard widget wrappers — DashboardShell grid adjustments, AttentionWidget border styling |
| UXR-03 | 🔴 | Company profile wizard — requires extracting form into multi-step tabs with step indicator |
| UXR-04 | 🔴 | Process landscape map — new component (swimlane view), new data flow for chain grouping |
| UXR-05 | 🔴 | Scope item briefing — new expandable card component with business narrative |
| UXR-06 | 🟡 | Review sidebar tree — already has HierarchyTreeSidebar; alignment changes |
| UXR-07 | 🟡 | Step card decision-first layout — StepReviewCard already has classification buttons at top per Phase 12; verify ordering matches reference |
| UXR-08 | 🟢 | Config matrix — stat cards + table wrappers, className changes |
| UXR-09 | 🟡 | Gap cards — 2-column grid inside card, button row |
| UXR-10 | 🟢 | Remaining items — stat cards already exist; minor restructure |
| UXR-11 | 🟡 | Report page — change from row list to 3×N card grid, add dark banner |
| UXR-12 | 🟡 | Sign-off timeline — already has SignOffProgressTracker; restructure signature cards to vertical timeline |
| UXR-13 | 🔴 | Workshop mode — dark full-screen layout is a new presentation mode |
| UXR-14 | 🟡 | Conversation mode — centered narrow layout, bubble styling |
| UXR-15 | 🟢 | Activity log — timestamp + content row layout |
| UXR-16 | 🟢 | Registers — stat-grid + table pattern (already implemented) |
| UXR-17 | 🟢 | Analytics — stat-grid + comparison table |
| UXR-18 | 🟢 | Templates — 3-col card grid |
| UXR-19 | 🟢 | Organization — 2-col grid |
| UXR-20 | 🟢 | Admin panel — sidebar section labels |
| UXR-21 | 🟢 | Auth pages — centered card layout |

---

## UXR-01: Assessment List Page

**File**: `src/app/(portal)/assessments/page.tsx`
**Risk**: 🟡 Medium
**Estimated time**: 20–30 minutes

### Current State

The assessment list renders each assessment as a `<Link>` wrapping a `<Card>` with `<CardContent>`. The card interior shows:
- Company name + status badge (inline)
- Metadata: industry, country, scope count, step count (flex row of `<span>` elements)
- No explicit progress bar (only step count text)
- No "Continue →" link or "Updated X ago" footer

### Target State (from HTML reference §06)

Each card must show this vertical structure:

```
┌─────────────────────────────────────────────────┐
│ Row 1: CompanyName (17px 600)  ·  StatusBadge   │  ← justify-between
│ Row 2: Industry · Country · "14 scope items" ·  │  ← flex gap-24, 12px, text-tertiary
│         "1,204 / 8,432 steps reviewed"           │
│ Row 3: ProgressBar (h-1.5, rounded-full)         │  ← blue fill proportional to steps reviewed
│ Row 4: "Updated 2 hours ago"  ·  "Continue →"   │  ← justify-between, 11px/13px
└─────────────────────────────────────────────────┘
```

### Exact Changes

1. **Add a progress bar** to each card. The fill percentage = `assessment._count.stepResponses / totalStepsInScope`. To get total steps in scope, extend the Prisma query's `select` to include a count of process steps via the scope selections. If this requires a complex join, use a simpler proxy: show the progress bar only when `stepResponses > 0`, with a visual estimate based on scope count × average steps per scope item (≈100). Alternatively, add a lightweight aggregation (see "Data Note" below).

2. **Restructure the card JSX** to have exactly 4 rows:

```tsx
<div className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
  {/* Row 1: Name + Badge */}
  <div className="flex items-center justify-between mb-2">
    <span className="text-[17px] font-semibold text-foreground">{assessment.companyName}</span>
    <StatusBadge status={assessment.status} />
  </div>

  {/* Row 2: Metadata */}
  <div className="flex gap-6 text-xs text-muted-foreground mb-2">
    <span>{assessment.industry}</span>
    <span>{assessment.country}</span>
    <span>{assessment._count.scopeSelections} scope items</span>
    <span>{assessment._count.stepResponses.toLocaleString()} steps reviewed</span>
  </div>

  {/* Row 3: Progress bar */}
  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
    <div
      className="h-full bg-blue-500 rounded-full transition-all duration-500"
      style={{ width: `${progressPercent}%` }}
    />
  </div>

  {/* Row 4: Footer */}
  <div className="flex items-center justify-between mt-2">
    <span className="text-[11px] text-muted-foreground">
      Updated {formatDistanceToNow(assessment.updatedAt, { addSuffix: true })}
    </span>
    <span className="text-[13px] text-blue-600 font-medium">Continue →</span>
  </div>
</div>
```

3. **Remove** the `<Card>` and `<CardContent>` imports from shadcn if replacing with raw divs. Or keep `<Card>` but override its internal structure.

4. **Add filter bar** above the grid:

```tsx
<div className="flex gap-3 mb-5">
  <select className="h-9 px-3 text-sm border rounded-md bg-card text-foreground w-[180px]">
    <option>All Statuses</option>
    {/* status options */}
  </select>
  <Input placeholder="Search by company name..." className="max-w-xs" />
</div>
```

The current page uses `PageHeader` with an action button for "New Assessment" — keep that. Add the filter bar between `PageHeader` and the grid.

### Data Note

The current Prisma query selects `_count.scopeSelections` (selected=true) and `_count.stepResponses`. To compute a meaningful progress percentage, you need total steps in scope. Two options:

**Option A (preferred — no schema change)**: Add a raw count query alongside the main query:
```ts
const stepTotals = await prisma.$queryRaw`
  SELECT a.id, COALESCE(SUM(si."totalSteps"), 0)::int as "totalStepsInScope"
  FROM "Assessment" a
  JOIN "ScopeSelection" ss ON ss."assessmentId" = a.id AND ss.selected = true
  JOIN "ScopeItem" si ON si.id = ss."scopeItemId"
  WHERE a.id = ANY(${assessmentIds})
  GROUP BY a.id
`;
```

**Option B (simpler, approximate)**: Use `_count.stepResponses > 0 ? Math.min((_count.stepResponses / (_count.scopeSelections * 100)) * 100, 100) : 0` as a rough proxy. This assumes ~100 steps per scope item. Acceptable for the list page where precision isn't critical.

### Verification

- Assessment cards show all 4 rows (name/badge, metadata, progress bar, footer)
- Progress bar fills proportionally
- "Continue →" link is visible and right-aligned
- Filter bar renders with status dropdown and search input
- Cards are clickable (entire card navigates)
- Empty state still renders correctly with no assessments
- Mobile: cards stack vertically, metadata wraps

---

## UXR-02: Intelligent Dashboard

**Files**: `src/components/dashboard/DashboardShell.tsx`, `src/components/dashboard/AttentionWidget.tsx`, `src/components/dashboard/KpiPanel.tsx`, `src/components/dashboard/ProgressHeatmap.tsx`, `src/components/dashboard/DashboardActivityFeed.tsx`
**Risk**: 🟡 Medium
**Estimated time**: 30–45 minutes

### Current State

`DashboardShell` renders a `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` with `WidgetLoader` for each visible widget. Each widget is a self-contained card. The attention widget renders a list of items in a card. KPI panel renders metric cards. Heatmap renders colored cells.

### Target State (from HTML reference §07)

The dashboard should have this vertical structure:

```
┌──────────────────────────────────────────────────────┐
│  "What Needs Attention" card                         │  ← full width, left-border accent
│    border-left: 3px solid var(--warning)             │
│    ⚠ heading in amber/gap-text color                 │
│    List of attention items as bordered rows           │
├──────────────────────────────────────────────────────┤
│  KPI Row (stat-grid cols-4)                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │
│  │ FIT  │ │ Open │ │ Comp │ │ Est. │                │
│  │ Rate │ │ Gaps │ │ %    │ │ Effort│               │
│  │ 72%  │ │ 23   │ │ 58%  │ │ 340d │                │
│  └──────┘ └──────┘ └──────┘ └──────┘                │
├──────────────────────────────────────────────────────┤
│  "Progress by Functional Area" heading               │
│  Heatmap: grid of colored cells                      │
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐           │
│  │Fin   ││Proc  ││Sales ││MM    ││HR    │           │
│  │100%  ││82%   ││45%   ││18%   ││0%    │           │
│  └──────┘└──────┘└──────┘└──────┘└──────┘           │
├──────────────────────────────────────────────────────┤
│  "Recent Activity" heading                           │
│  Activity feed card with timestamped rows            │
└──────────────────────────────────────────────────────┘
```

### Exact Changes

#### 2a. DashboardShell — Layout Order

The widget grid currently sorts by `position` and renders in a responsive grid. The HTML reference shows a **vertically stacked** layout where full-width widgets (attention, heatmap, activity) span the entire row and KPI is a 4-col stat grid.

**Change** `DashboardShell.tsx`:

Replace the generic grid with an ordered vertical layout:

```tsx
<div className="space-y-6">
  {/* Attention widget — always full width, always first */}
  {visibleWidgets.find(w => w.widgetType === "attention") && (
    <WidgetLoader widgetType="attention" assessmentId={assessmentId} />
  )}

  {/* KPI row — always full width */}
  {visibleWidgets.find(w => w.widgetType === "kpi") && (
    <WidgetLoader widgetType="kpi" assessmentId={assessmentId} />
  )}

  {/* Heatmap — always full width */}
  {visibleWidgets.find(w => w.widgetType === "progress_heatmap") && (
    <WidgetLoader widgetType="progress_heatmap" assessmentId={assessmentId} />
  )}

  {/* Remaining widgets in the original responsive grid */}
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {visibleWidgets
      .filter(w => !["attention", "kpi", "progress_heatmap"].includes(w.widgetType))
      .map((widget, index) => (
        <div key={`${widget.widgetType}-${index}`}
          className={widget.widgetType === "activity_feed" ? "md:col-span-2" : ""}>
          <WidgetLoader widgetType={widget.widgetType} assessmentId={assessmentId} />
        </div>
      ))}
  </div>
</div>
```

#### 2b. AttentionWidget — Left Border + Severity Accent

**File**: `src/components/dashboard/AttentionWidget.tsx`

Add left border accent to the card wrapper:

```tsx
<div className="bg-card border rounded-lg p-4 border-l-[3px] border-l-amber-500">
  <h4 className="font-semibold text-amber-700 mb-2 flex items-center gap-2">
    <AlertTriangle className="w-4 h-4" />
    What Needs Attention
  </h4>
  <div className="divide-y divide-slate-100">
    {items.map(item => (
      <div key={item.id} className="py-2 text-sm text-muted-foreground">
        • <strong>{item.title}</strong>: {item.description}
      </div>
    ))}
  </div>
</div>
```

Severity-based left borders on individual items are optional (the HTML reference only shows one border on the outer card).

#### 2c. KpiPanel — 4-Column Stat Grid

**File**: `src/components/dashboard/KpiPanel.tsx`

Ensure the KPI metrics render in a `grid grid-cols-4 gap-4` with each card showing:
- Label (12px, muted) at top
- Value (28px, bold) in center — color-coded: FIT rate = green, gaps = amber, effort = default
- Sub-label (11px, muted) at bottom

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
  <StatCard label="FIT Rate" value={`${metrics.fitRate}%`} valueColor="text-green-600" sub="across all active assessments" />
  <StatCard label="Open Gaps" value={String(metrics.totalGaps)} valueColor="text-amber-600" sub={`${metrics.pendingApproval} pending approval`} />
  <StatCard label="Completion" value={`${metrics.completionPercent}%`} sub="steps reviewed" />
  <StatCard label="Est. Effort" value={`${metrics.effortDays}d`} sub="gap resolution days" />
</div>
```

Where `StatCard` renders:

```tsx
function StatCard({ label, value, valueColor, sub }: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div className="bg-card border rounded-lg p-4 text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}
```

#### 2d. ProgressHeatmap — Cell Grid

**File**: `src/components/dashboard/ProgressHeatmap.tsx`

Ensure heatmap renders as a flex wrap or grid of colored cells. Each cell:
- Functional area name (14px, 600)
- Completion percentage (centered below name)
- Background color: gradient from red-100 (0%) → amber-100 (25–50%) → green-100 (75–100%)

The current implementation likely already follows this pattern. Verify the cells are rendered in a responsive grid (`flex flex-wrap gap-3` or `grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-8 gap-3`).

### Verification

- Dashboard renders attention → KPI → heatmap → remaining widgets in vertical stack
- Attention card has amber left border
- KPI panel shows 4 stat cards in a row
- Heatmap cells are color-coded by completion
- Activity feed renders below heatmap
- Mobile: KPI grid wraps to 2-col, heatmap cells wrap

---

## UXR-03: Company Profile Wizard

**File**: `src/components/assessment/CompanyProfileForm.tsx`, `src/app/(portal)/assessment/[id]/profile/page.tsx`
**Risk**: 🔴 High
**Estimated time**: 60–90 minutes

### Current State

The company profile renders as a single scrollable form card with all fields visible. There is no wizard step indicator, no multi-step flow, and no collapsible sections. The form is wrapped in a `max-w-2xl` centered layout.

### Target State (from HTML reference §08)

A **4-step wizard** with numbered dot indicators:

```
Step 1: Basic Info → Step 2: ERP Landscape → Step 3: Operating Model → Step 4: Stakeholders
```

Visual layout:
```
┌──────────────────────────────────────────┐
│              ①─────②─────③─────④         │  ← wizard dots with connecting lines
│  "Basic Info → ERP Landscape → ..."      │  ← step labels (12px, tertiary)
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ Card: "Basic Information"           │ │  ← only current step's card visible
│  │ ┌──────────┐ ┌──────────┐           │ │  ← 2-column grid inside card
│  │ │ Company  │ │ Industry │           │ │
│  │ └──────────┘ └──────────┘           │ │
│  │ ┌──────────┐ ┌──────────┐           │ │
│  │ │ Country  │ │ Entities │           │ │
│  │ └──────────┘ └──────────┘           │ │
│  │ ┌────────────────────────┐          │ │  ← span-2 for full-width fields
│  │ │ Annual Revenue Range   │          │ │
│  │ └────────────────────────┘          │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ (Next step card — faded, opacity 50)│ │  ← visible but dimmed preview
│  └─────────────────────────────────────┘ │
│                                          │
│           [Save Draft]  [Next: ERP →]    │  ← action buttons, right-aligned
└──────────────────────────────────────────┘
```

### Exact Changes

#### 3a. Create WizardStepIndicator component

**New file**: `src/components/shared/WizardStepIndicator.tsx`

```tsx
interface WizardStepIndicatorProps {
  steps: string[];    // ["Basic Info", "ERP Landscape", "Operating Model", "Stakeholders"]
  currentStep: number; // 0-indexed
}
```

Renders:
- A horizontal flex row of numbered circles (w-8 h-8, rounded-full)
- Connected by lines (h-0.5, bg-slate-200; filled bg-blue-500 for completed)
- Current step: `bg-blue-500 text-white`
- Completed steps: `bg-blue-500 text-white` with checkmark
- Future steps: `bg-slate-200 text-slate-500`
- Below the dots: step labels in 12px text-muted-foreground

#### 3b. Refactor CompanyProfileForm into stepped sections

Split the form fields into 4 groups (matching the HTML reference):

| Step | Fields |
|------|--------|
| 1. Basic Info | companyName, industry, country, legalEntities, companySize, annualRevenue |
| 2. ERP Landscape | currentErpVersion, deploymentModel, itLandscapeSummary, migrationApproach |
| 3. Operating Model | operatingCountries, sapModules, keyProcesses, targetGoLiveDate |
| 4. Stakeholders | StakeholderManager component (already exists) |

Add `useState` for `currentStep` (0–3). Render only the current step's fields. The next step's card should be visible but at `opacity-50` as a preview hint.

#### 3c. Form field grid

Inside each step's card, use a 2-column grid for the fields:

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  {/* fields */}
</div>
```

Full-width fields (like "Annual Revenue Range") use `className="sm:col-span-2"`.

#### 3d. Action buttons

Replace the current single-row of buttons with step-aware navigation:

```tsx
<div className="flex justify-end gap-2 mt-5">
  {currentStep > 0 && (
    <Button variant="outline" onClick={() => setCurrentStep(s => s - 1)}>
      ← Back
    </Button>
  )}
  <Button variant="outline" onClick={handleSaveDraft}>Save Draft</Button>
  {currentStep < 3 ? (
    <Button onClick={() => setCurrentStep(s => s + 1)}>
      Next: {STEP_LABELS[currentStep + 1]} →
    </Button>
  ) : (
    <Button onClick={handleSubmit}>
      Continue to Scope Selection →
    </Button>
  )}
</div>
```

### Verification

- Wizard dots show 4 steps with current highlighted
- Only current step's form fields are visible
- 2-column grid for form fields on desktop
- "Next" and "Back" buttons navigate between steps
- "Save Draft" persists without advancing
- Final step shows "Continue to Scope Selection →"
- Mobile: form fields stack to single column

---

## UXR-04: Scope Selection — Process Landscape Map

**Files**: New component `src/components/scope/ProcessLandscapeMap.tsx`, modify `src/components/scope/ScopeSelectionClient.tsx`
**Risk**: 🔴 High
**Estimated time**: 60–90 minutes

### Current State

`ScopeSelectionClient` renders:
1. PageHeader with title
2. Filter bar (search, relevance toggle, area/sub-area dropdowns)
3. Impact summary bar (4 stat cards)
4. Industry template banner (if applicable)
5. Accordion groups by functional area (`ScopeAreaGroup`)
6. Sticky action bar (Back / summary / Continue)

There is no process landscape map or swimlane visualization.

### Target State (from HTML reference §09)

The scope selection page has **3 layers**, rendered vertically:

**Layer 1: Process Landscape Map** (swimlanes)
```
┌──────────────────────────────────────────────────────────┐
│  Record to Report (R2R)                                  │
│  ┌──────┐ → ┌──────┐ → ┌──────┐ → ┌──────┐  [Select]   │
│  │ J58  │   │ J59  │   │ BKP  │   │ J14  │   Chain     │
│  └──────┘   └──────┘   └──────┘   └──────┘             │
├──────────────────────────────────────────────────────────┤
│  Procure to Pay (P2P)                                    │
│  ┌──────┐ → ┌──────┐ → ┌──────┐             [Select]    │
│  │ J60  │   │ BNX  │   │ 1EG  │              Chain      │
│  └──────┘   └──────┘   └──────┘                         │
├──────────────────────────────────────────────────────────┤
│  Order to Cash (O2C)                                     │
│  ┌──────┐ → ┌──────┐ → ┌──────┐             [Select]    │
│  │ BD9  │   │ 1YB  │   │ BJ5  │              Chain      │
│  └──────┘   └──────┘   └──────┘                         │
└──────────────────────────────────────────────────────────┘
```

**Layer 2: Scope Item Briefing** (see UXR-05)

**Layer 3: Detailed scope items list** (existing accordion — unchanged)

### Exact Changes

#### 4a. Create ProcessLandscapeMap component

**New file**: `src/components/scope/ProcessLandscapeMap.tsx`

This component groups scope items into **business process chains** (end-to-end processes). The chain definitions are pre-defined mappings:

```tsx
const PROCESS_CHAINS: ProcessChain[] = [
  { name: "Record to Report (R2R)", color: "fit",       scopeItemIds: ["J58", "J59", "BKP", "J14"] },
  { name: "Procure to Pay (P2P)",   color: "configure", scopeItemIds: ["J60", "BNX", "1EG"] },
  { name: "Order to Cash (O2C)",    color: "gap",       scopeItemIds: ["BD9", "1YB", "BJ5"] },
  // ... additional chains based on SAP Best Practice catalog groupings
];
```

**Props**:
```tsx
interface ProcessLandscapeMapProps {
  scopeItems: ScopeItemData[];
  onSelectChain: (scopeItemIds: string[]) => void;
}
```

**Rendering**: Each chain is a horizontal "swimlane" with:
- Lane label (left side, colored background matching chain color — fit-bg, configure-bg, gap-bg)
- Scope item nodes (small cards with scope item ID + abbreviated name) connected by arrow characters (→)
- "Select Chain" button (right side)

The chain color should reflect **current selection state**: if all items in the chain are already selected, use green/fit background. If partially selected, use blue/configure. If none selected, use the chain's default color.

#### 4b. Integrate into ScopeSelectionClient

In `ScopeSelectionClient`, add the landscape map **above** the filter bar:

```tsx
{/* Layer 1: Process Landscape Map */}
<ProcessLandscapeMap
  scopeItems={items}
  onSelectChain={handleSelectChain}
/>

{/* Divider */}
<div className="border-t my-6" />

{/* Layer 3: Detailed scope items (existing filter + accordion) */}
<h3 className="text-sm font-medium text-muted-foreground mb-3">Detailed Scope Items List</h3>
{/* ... existing filter bar and ScopeAreaGroup rendering ... */}
```

#### 4c. Chain selection handler

```tsx
function handleSelectChain(scopeItemIds: string[]) {
  scopeItemIds.forEach(id => {
    handleSelectionChange(id, { selected: true, relevance: "YES" });
  });
}
```

### Data Note

The chain definitions (which scope items belong to which end-to-end process) can be:
- **Hardcoded** in the component (simplest — the SAP Best Practice catalog has well-known process chains)
- **Derived from `functionalArea` + `subArea`** groupings in the scope items data
- **Stored in a new `ProcessChain` lookup** (most flexible but requires schema change — out of scope for UXR)

**Recommendation**: Hardcode the top 8–12 chains covering Finance, Procurement, Sales, Manufacturing, HR, Plant Maintenance, Warehouse, and Project Management. Scope items not in any chain still appear in Layer 3 (the accordion list).

### Verification

- Swimlane rows render for each process chain
- Scope item nodes are visible with IDs and abbreviated names
- Arrow connectors (→) between nodes
- "Select Chain" button selects all items in the chain
- Chain color reflects selection state
- Existing accordion list still renders below
- Mobile: swimlanes stack vertically, nodes wrap

---

## UXR-05: Scope Selection — Scope Item Briefing

**Files**: New component `src/components/scope/ScopeItemBriefing.tsx`, modify `ScopeSelectionClient.tsx`
**Risk**: 🔴 High
**Estimated time**: 45–60 minutes

### Current State

When a user expands a scope item in the accordion, they see the `ScopeItemCard` with purpose/overview/prerequisites HTML content in tabs. There is no business-language "briefing" card.

### Target State (from HTML reference §09, "Scope Item Briefing")

When a user clicks a scope item, a **briefing card** appears between the landscape map and the detailed list:

```
┌──────────────────────────────────────────────────────────┐
│  border-left: 3px solid blue-500                         │
│  ┌─────────────────────────┐                             │
│  │ Badge: J58              │    710 steps · 6 areas      │
│  │ "General Ledger"        │                             │
│  │ Business narrative:     │                             │
│  │ "Your finance team's    │                             │
│  │  daily operations..."   │                             │
│  └─────────────────────────┘                             │
│                                                          │
│  "What This Covers" — 2×2 grid of summary cards          │
│  ┌─────────────┐ ┌─────────────┐                         │
│  │ Daily: ...  │ │ Monthly: ...│                         │
│  │ Period: ... │ │ Regulatory: │                         │
│  └─────────────┘ └─────────────┘                         │
│                                                          │
│  "Before You Review, Consider" — list of questions        │
│  ❓ Do you close monthly or quarterly?                   │
│  ❓ How many legal entities post to the same GL?         │
│                                                          │
│  "Process Areas (6)" — mini table                        │
│  Area          | Steps | Description                     │
│  Journal Entry | 142   | Manual & recurring entries       │
│  Period-End    | 198   | Closing cockpit, accruals        │
└──────────────────────────────────────────────────────────┘
```

### Exact Changes

#### 5a. Create ScopeItemBriefing component

**New file**: `src/components/scope/ScopeItemBriefing.tsx`

```tsx
interface ScopeItemBriefingProps {
  scopeItem: ScopeItemData;
  processAreas: ProcessAreaSummary[];  // derived from step grouping
  onClose: () => void;
}
```

The briefing content comes from:
- `purposeHtml` — parsed to extract the business narrative paragraph
- `overviewHtml` — parsed to extract "What This Covers" sections
- Process areas — derived from grouping the scope item's steps by `processFlowGroup` or `activityTitle`

If `purposeHtml`/`overviewHtml` are empty or sparse, fall back to displaying the scope item name + step count + functional area. The briefing is a **best-effort enhancement**, not a blocker.

#### 5b. Add briefing state to ScopeSelectionClient

```tsx
const [briefingScopeItemId, setBriefingScopeItemId] = useState<string | null>(null);
const briefingItem = items.find(i => i.id === briefingScopeItemId);
```

Insert the briefing card between the landscape map and the detailed list:

```tsx
{briefingItem && (
  <ScopeItemBriefing
    scopeItem={briefingItem}
    processAreas={[]} // populate if step grouping data is available
    onClose={() => setBriefingScopeItemId(null)}
  />
)}
```

#### 5c. Trigger briefing on scope item click

In `ScopeAreaGroup`, when a scope item row is clicked (not the checkbox), set `briefingScopeItemId`. This requires passing a callback:

```tsx
onItemClick={(scopeItemId) => setBriefingScopeItemId(scopeItemId)}
```

### Verification

- Clicking a scope item name opens the briefing card
- Briefing shows business narrative, process area table, and guiding questions
- Clicking another item replaces the briefing
- Close button dismisses the briefing
- Checkbox still toggles selection independently of briefing

---

## UXR-06: Process Step Review — Sidebar Tree

**File**: `src/components/hierarchy/HierarchyTreeSidebar.tsx`, `src/components/review/ReviewShell.tsx`
**Risk**: 🟡 Medium
**Estimated time**: 20–30 minutes

### Current State

`ReviewShell` renders a 2-column layout:
- Left: `HierarchyTreeSidebar` (280px) with scope item name, progress bar, hierarchy tree, and "Other Scope Items" list
- Right: Main content with step card and navigation

The hierarchy tree already shows folders (processes) with nested steps. The active step is highlighted.

### Target State (from HTML reference §10)

The sidebar should match this structure:

```
┌─────────────────────────┐
│ SCOPE ITEM (label 12px) │
│ J60 — Accounts Payable  │  ← 15px, 600
│ 78 / 523 steps (15%)    │  ← 12px, tertiary
│ ▓▓▓░░░░░░░░░░░░░ 15%   │  ← progress bar
├─────────────────────────┤
│ Hierarchy               │  ← section label
│ 📂 Invoice Processing   │  ← parent node, 12px left pad
│   ↳ Create Invoice      │  ← child node, 28px left pad
│   ↳ Post Invoice ←curr  │  ← active: blue-50 bg, blue-600 text
│   ↳ Verify Invoice      │
│ 📂 Payment Run          │
│ 📂 Down Payments        │
├─────────────────────────┤
│ Other Scope Items       │  ← section label
│ J58 General Ledger 100% │  ← green badge
│ BNX Non-Stock     42%   │  ← amber badge
└─────────────────────────┘
```

### Exact Changes

1. **Section labels**: Ensure the sidebar has uppercase 12px section labels ("SCOPE ITEM", "Hierarchy", "Other Scope Items") styled as `text-[11px] font-semibold text-muted-foreground uppercase tracking-wider`.

2. **Active step highlight**: The currently active step in the tree should have `bg-blue-50 text-blue-600` (replacing whatever the current active styling is). Non-active steps: `text-foreground` with `hover:bg-slate-50`.

3. **Indent levels**: Parent nodes at `pl-3`, child steps at `pl-7`. Use `↳` prefix for children (already present in the HTML reference).

4. **Other scope items badges**: The completion percentage badge should use:
   - 100%: `bg-green-100 text-green-700`
   - 50–99%: `bg-blue-100 text-blue-700`
   - 1–49%: `bg-amber-100 text-amber-700`
   - 0%: `bg-slate-100 text-slate-500`

5. **Progress bar in sidebar**: The progress bar below the scope item name should match the reskin theme colors (blue-500 fill on slate-100 track).

### Verification

- Sidebar shows scope item name, progress, hierarchy tree, and other scope items
- Active step has blue-50 background
- Other scope items show colored completion badges
- Clicking a tree node navigates to that step
- Sidebar scrolls independently of main content

---

## UXR-07: Process Step Review — Step Card Layout

**File**: `src/components/review/StepReviewCard.tsx`
**Risk**: 🟡 Medium
**Estimated time**: 20–30 minutes

### Current State

`StepReviewCard` renders classification buttons (FIT/CONFIGURE/GAP/NA) at the top of the card (Phase 12 decision-first layout), followed by SAP content sections. This already matches the HTML reference in principle.

### Target State (from HTML reference §10)

Verify and adjust the exact layout:

```
┌──────────────────────────────────────────────────────┐
│  Classification Buttons (full width, 4-col grid)     │
│  ┌───────┐ ┌─────────┐ ┌───────┐ ┌───────┐          │
│  │✓ FIT  │ │⚙ CONFIG│ │⚠ GAP │ │— N/A │          │
│  └───────┘ └─────────┘ └───────┘ └───────┘          │
├──────────────────────────────────────────────────────┤
│  Step Number: 23                                     │
│  "Post Supplier Invoice" (15px, 600)                 │
│  Badges: [Classifiable] [Mandatory Config]           │
├──────────────────────────────────────────────────────┤
│  "What this step does:" business explanation          │
│                                                      │
│  ▸ View SAP Reference Content (collapsed, blue link) │
│    └─ Expandable: mono font, surface-secondary bg    │
└──────────────────────────────────────────────────────┘
```

### Exact Changes

1. **Classification button styling**: Ensure the 4 buttons are in a `grid grid-cols-4 gap-2` at the very top of the card. Each button:
   - Default (unselected): `border border-slate-200 text-muted-foreground bg-white`
   - FIT selected: `bg-green-50 border-green-500 text-green-700`
   - CONFIGURE selected: `bg-blue-50 border-blue-500 text-blue-700`
   - GAP selected: `bg-amber-50 border-amber-500 text-amber-700`
   - NA selected: `bg-slate-50 border-slate-300 text-slate-500`

2. **Step header**: Below the buttons, show step number in a circle or bold, then action title. Add badges for step category and config status.

3. **Business explanation**: The `getBusinessContextHint()` output should render as a paragraph before the SAP reference content. Format: "What this step does:" (bold) followed by the explanation text.

4. **SAP content collapsible**: The raw SAP HTML content should be behind a `<details>` or collapsible section with the label "View SAP Reference Content ▾" in blue-600 text. When expanded, render in `bg-slate-50 rounded-md p-3 font-mono text-xs text-muted-foreground`.

5. **Breadcrumb path**: Above the step card (in ReviewShell), show the breadcrumb: `J60 → Invoice Processing → Post Invoice · Step 23 of 523` in `text-xs text-muted-foreground`.

### Verification

- Classification buttons appear at the very top of the card
- Selected button has appropriate color fill
- Step title and badges render below buttons
- Business context hint renders as readable paragraph
- SAP content is collapsed by default
- Breadcrumb shows above the card

---

## UXR-08: Configuration Matrix

**File**: `src/components/config/ConfigMatrixClient.tsx` (or equivalent)
**Risk**: 🟢 Low
**Estimated time**: 15–20 minutes

### Target State (from HTML reference §12)

```
┌──────────────────────────────────────────────────────┐
│  "Configuration Activities" heading                   │
│  "4,703 activities across selected scope items"       │
│                                                      │
│  Filter bar: [All Scope Items ▾] [All Types ▾]       │
│                                                      │
│  stat-grid cols-3:                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │ Total    │ │ Included │ │ Excluded │              │
│  │ 4,703    │ │ 3,891 ✓  │ │ 812      │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│                                                      │
│  Table:                                              │
│  Activity | Scope Item | Type | Mandatory | Status   │
│  ─────────┼────────────┼──────┼───────────┼────────  │
│  Configure│ J60        │ SSCUI│ Mandatory │ Included │
│  Set Tol. │ J60        │ SSCUI│ Recommend │ Included │
│  Activate │ J60        │Expert│ Optional  │ Excluded │
└──────────────────────────────────────────────────────┘
```

### Exact Changes

1. Add 3-column stat grid above the table with Total, Included (green text), Excluded (muted text)
2. Ensure table uses standard styling: `border rounded-lg overflow-hidden` wrapper with `divide-y` rows
3. Badges in table: Type = `badge-blue` (SSCUI), `badge-gray` (Expert). Mandatory = `badge-red`. Recommended = `badge-amber`. Optional = `badge-gray`. Status: Included = `badge-green`, Excluded = `badge-gray`.

### Verification

- Stat cards show above table
- Table renders with proper badge colors
- Filters work correctly

---

## UXR-09: Gap Resolution Cards

**File**: `src/components/gaps/GapResolutionCard.tsx` (or equivalent)
**Risk**: 🟡 Medium
**Estimated time**: 25–35 minutes

### Target State (from HTML reference §15)

Each gap card:

```
┌──────────────────────────────────────────────────────┐
│  GAP-007 (amber badge)          High Risk (red badge)│
│  "Custom Approval Workflow for PO > $50K"            │
│  "J60 → Step #89 · Accounts Payable"                 │
│                                                      │
│  ┌─ Resolution ─────────┐ ┌─ Cost & Effort ─────────┐│
│  │ BTP Extension         │ │ ┌──────┐ ┌──────┐      ││
│  │ (Clean Core)          │ │ │Effort│ │ Cost │      ││
│  │ Custom workflow on    │ │ │15 d  │ │$22.5K│      ││
│  │ SAP BTP using SBPA   │ │ └──────┘ └──────┘      ││
│  └───────────────────────┘ └─────────────────────────┘│
│                                                      │
│  [Approve Resolution] [View Alternatives] [What-If]  │
└──────────────────────────────────────────────────────┘
```

### Exact Changes

1. **Header row**: Gap ID badge (amber) left, risk badge (red/amber/green) right, justified with `flex justify-between`
2. **Title**: Bold, 16px below the header
3. **Subtitle**: Scope item reference + step number in muted text
4. **2-column grid**: `grid grid-cols-1 md:grid-cols-2 gap-4 mt-3`
   - Left: Resolution card (bg-slate-50, rounded, 13px body text)
   - Right: Cost & Effort sub-grid (`grid grid-cols-2 gap-2`) with stat cards
5. **Action buttons**: `flex gap-2 mt-3` — Approve (primary, sm), View Alternatives (ghost, sm), What-If (ghost, sm)

### Verification

- Gap cards show 2-column layout with resolution and cost/effort
- Risk badge colored appropriately
- Action buttons render below

---

## UXR-10: Remaining Items Register

**File**: `src/components/remaining/RemainingItemsClient.tsx`
**Risk**: 🟢 Low
**Estimated time**: 15–20 minutes

### Target State (from HTML reference §16)

Already close to target. Verify:
- 4-column stat grid (Total, Critical/red, High/amber, Resolved/green)
- Filter bar: category dropdown, severity dropdown, search input, +Add Item button, Auto-Detect button, Export XLSX button
- Table with category badges, severity badges, status badges

No major structural changes expected — just verify stat card colors and badge consistency with reskin tokens.

---

## UXR-11: Report & Export Page

**File**: `src/components/report/ReportClient.tsx`
**Risk**: 🟡 Medium
**Estimated time**: 30–40 minutes

### Current State

Reports render as a vertical list of rows, each with icon, label, description, format badge, and download button (`flex items-center justify-between bg-card border rounded-lg px-4 py-3`).

### Target State (from HTML reference §23)

Reports render as a **3-column card grid** with centered icons:

```
┌──────────────────────────────────────────────────────┐
│  stat-grid cols-4:                                   │
│  FIT Rate 72% | Gaps 23 | Config 3,891 | Effort 340d│
├──────────────────────────────────────────────────────┤
│  "Download Reports" heading                          │
│                                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐                    │
│  │  📄    │ │  📊    │ │  📊    │                    │
│  │Exec.   │ │Scope   │ │Step    │                    │
│  │Summary │ │Catalog │ │Detail  │                    │
│  │ PDF    │ │ XLSX   │ │ XLSX   │                    │
│  └────────┘ └────────┘ └────────┘                    │
│  ┌────────┐ ┌────────┐ ┌────────┐                    │
│  │  ⚠️    │ │  ⚙️    │ │  ⏱    │                    │
│  │Gap     │ │Config  │ │Effort  │                    │
│  │Register│ │Workbook│ │Estimate│                    │
│  │ XLSX   │ │ XLSX   │ │ PDF    │                    │
│  └────────┘ └────────┘ └────────┘                    │
│  ... (more rows of 3)                                │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │  📦 Download Complete Package (ZIP)              ││  ← dark banner
│  │  bg-gray-950 text-white, centered button         ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Exact Changes

1. **Replace the report list** with a grid: `grid grid-cols-2 sm:grid-cols-3 gap-3`

2. **Each report card**: centered layout:
```tsx
<div
  className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:shadow-md transition-shadow"
  onClick={() => handleDownload(report.key)}
>
  <div className="text-2xl mb-1">{report.emoji}</div>
  <p className="text-sm font-medium text-foreground">{report.label}</p>
  <p className="text-[11px] text-muted-foreground">{report.format}</p>
</div>
```

3. **Complete package banner**: Replace the current `bg-gray-950 text-white rounded-lg p-6` section (which already exists) — verify it renders below the grid, full width, with centered "Download Complete Package (ZIP)" button.

4. **Summary stat row**: Verify the existing `grid grid-cols-5 gap-4 mb-8` renders correctly. The HTML reference shows 4 stat cards (not 5), so consider reducing to the 4 most important: FIT Rate, Gaps, Config Activities, Effort.

### Verification

- Reports render in 3-column card grid
- Each card is clickable and triggers download
- Complete package banner is dark-themed at bottom
- Stat summary renders at top
- Sign-off section renders below (existing)

---

## UXR-12: Digital Sign-Off Timeline

**File**: `src/components/signoff/SignOffDashboardClient.tsx`, `src/components/report/ReportClient.tsx`
**Risk**: 🟡 Medium
**Estimated time**: 25–35 minutes

### Current State

`SignOffDashboardClient` renders:
- `SignOffProgressTracker` (horizontal stepper)
- Snapshot info card
- Area validations grid
- Technical validation panel
- Cross-functional validation panel
- Signatures section
- Certificate section

`ReportClient` has a simpler 3-column sign-off grid at the bottom (`grid grid-cols-3 gap-4`) with name/email inputs and sign buttons.

### Target State (from HTML reference §22)

The sign-off section should render as a **vertical timeline** with 3 signature blocks:

```
┌──────────────────────────────────────────────────────┐
│  "Assessment Sign-Off Status" heading                │
│                                                      │
│  ┌ Signed ──────────────────────────────────────────┐│
│  │ ✓ (green circle)  ABEAM Consultant               ││
│  │ "Signed by Sarah Chen · 26 Feb 2026 14:30"       ││
│  │ SHA-256: a3f7...8e2d                              ││
│  │ bg-green-50, border-green-200                     ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌ Pending ─────────────────────────────────────────┐│
│  │ ⏳ (amber circle) Client Representative           ││
│  │ "Awaiting signature from Ali Hassan"              ││
│  │ [Sign Now] button                                 ││
│  │ bg-amber-50, border-amber-200                     ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌ Not Yet ─────────────────────────────────────────┐│
│  │ 3 (gray circle)  ABEAM Project Manager            ││
│  │ "Requires Client Rep signature first"             ││
│  │ bg-slate-50, border-slate-200                     ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### Exact Changes

1. **Signature card styling**: Each signature block is a flex row with:
   - Circle avatar (w-10 h-10, rounded-full, centered icon/number)
   - Content (flex-1): role name (font-semibold), status description (text-xs, muted), hash (mono, 10px)
   - Action (right side): "Sign Now" button for pending, nothing for signed/not-yet

2. **State-based styling**:
   - Signed: `bg-green-50 border border-green-200 rounded-lg p-4` · Circle: `bg-green-500 text-white`
   - Pending: `bg-amber-50 border border-amber-200 rounded-lg p-4` · Circle: `bg-amber-500 text-white`
   - Not yet: `bg-slate-50 border border-slate-200 rounded-lg p-4` · Circle: `bg-slate-200 text-slate-500`

3. **Vertical stack**: `flex flex-col gap-4` for the 3 blocks.

Apply this pattern to both the `SignOffDashboardClient` signatures section AND the `ReportClient` sign-off section.

### Verification

- Three signature blocks stack vertically
- State-based colors (green/amber/gray)
- Signed blocks show signer name, date, and hash
- Pending block shows "Sign Now" button
- Not-yet block shows dependency message

---

## UXR-13: Workshop Mode (Full-Screen)

**Files**: Workshop session page component
**Risk**: 🔴 High
**Estimated time**: 45–60 minutes

### Target State (from HTML reference §20)

Workshop mode is a **dark-themed full-screen** facilitation UI:

```
┌──────────────────────────────────────────────────────────┐
│  bg-slate-900 text-white min-h-screen                    │
│                                                          │
│  Header: Workshop name | ⏱ 45:23 | Code: K7MN3P | 👥 8 │
│  border-b border-slate-800                               │
│                                                          │
│  ┌─────────────────────────────┐ ┌──────────────────┐    │
│  │ Main content (2/3 width)    │ │ Sidebar (1/3)    │    │
│  │                             │ │                  │    │
│  │ Step 5 of 47 · Procurement  │ │ ATTENDEES        │    │
│  │ ┌─────────────────────────┐ │ │ 🟢 Alice (PO)   │    │
│  │ │ bg-slate-800 rounded-xl │ │ │ 🟢 Bob (IT)     │    │
│  │ │ "Create Purchase Order" │ │ │ ⚪ Dave (SA)     │    │
│  │ │ (20px, 600, white)      │ │ │                  │    │
│  │ │                         │ │ │ ACTION ITEMS     │    │
│  │ │ Classification votes:   │ │ │ ☐ Review PO flow │    │
│  │ │ ┌────┐┌────┐┌────┐┌──┐│ │ │ ☐ Check mapping  │    │
│  │ │ │FIT ││CFG ││GAP ││NA││ │ │                  │    │
│  │ │ │(3) ││(1) ││(1) ││0 ││ │ │                  │    │
│  │ │ └────┘└────┘└────┘└──┘│ │ │                  │    │
│  │ └─────────────────────────┘ │ │                  │    │
│  └─────────────────────────────┘ └──────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Exact Changes

1. **Dark container**: The workshop session page should have `bg-slate-900 text-white min-h-screen`
2. **Header bar**: `flex justify-between items-center py-4 px-5 border-b border-slate-800`
3. **2-column layout**: `grid grid-cols-[1fr_240px] gap-5 p-5`
4. **Step card**: `bg-slate-800 rounded-xl p-6`
5. **Vote buttons**: 4-col grid, each button shows vote count. Leading vote has border highlight:
   - FIT leading: `border-2 border-green-500 bg-green-500/15 text-green-400`
   - Others: `border-2 border-transparent text-slate-400`
6. **Sidebar**: Standard text styling with section labels in `text-[11px] text-slate-500 uppercase`
7. **Attendee status**: 🟢 = online, ⚪ = offline

This is a significant layout change if the current workshop page doesn't use a dark theme. Scope: the workshop **session** page only (not the workshop list or join page).

### Verification

- Full-screen dark theme renders
- Header shows timer, session code, attendee count
- Step card with classification votes
- Sidebar with attendees and action items

---

## UXR-14: Conversation Mode

**File**: `src/components/conversation/ConversationCard.tsx`
**Risk**: 🟡 Medium
**Estimated time**: 20–30 minutes

### Target State (from HTML reference §11)

Centered narrow layout with chat bubble styling:

```
┌──────────────────────────────────────────┐
│  max-w-[640px] centered                  │
│                                          │
│  Badge: J60 — Accounts Payable           │
│  "Question 3 of 12 · 2 classified"      │
│  Progress bar                            │
│                                          │
│  ┌──────────────────────────────┐        │
│  │ bg-slate-50 max-w-[80%]     │ ← left │
│  │ "How does your team receive  │        │
│  │  supplier invoices?"         │        │
│  └──────────────────────────────┘        │
│        ┌──────────────────────────────┐  │
│        │ bg-blue-50 max-w-[80%]      │←R │
│        │ "Mostly via email as PDF"    │  │
│        └──────────────────────────────┘  │
│  ┌──────────────────────────────┐        │
│  │ "Do you match invoices       │ ← left│
│  │  against purchase orders?"   │        │
│  └──────────────────────────────┘        │
│                                          │
│  Answer options (vertical button list):  │
│  [Yes, always — 3-way match]             │
│  [Sometimes — depends on amount]         │
│  [No — we post without PO matching]      │
│  [I'm not sure]                          │
└──────────────────────────────────────────┘
```

### Exact Changes

1. **System messages** (questions): `bg-slate-50 rounded-lg p-3 max-w-[80%] text-sm`
2. **User messages** (answers): `bg-blue-50 rounded-lg p-3 max-w-[80%] ml-auto text-sm text-blue-700`
3. **Answer buttons**: `w-full text-left border rounded-lg px-4 py-3 text-sm hover:bg-slate-50 transition-colors`
4. **Container**: `max-w-[640px] mx-auto py-6 px-4`

### Verification

- Chat bubbles alternate left/right
- Answer buttons render as full-width options
- Progress shows at top
- Layout is narrow and centered

---

## UXR-15: Activity Log

**File**: `src/components/activity/ActivityFeedClient.tsx` (or equivalent)
**Risk**: 🟢 Low
**Estimated time**: 10–15 minutes

### Target State (from HTML reference §21)

```
┌──────────────────────────────────────────────────────┐
│  Filter bar: [All Types ▾] [All Users ▾]             │
│                                                      │
│  2m ago  │ Sarah classified step #45 as FIT in J60   │
│  15m ago │ Ali approved gap GAP-007 — BTP Extension  │
│  1h ago  │ System → status GAP_RESOLUTION            │
│  2h ago  │ Maria commented on step #102              │
└──────────────────────────────────────────────────────┘
```

Each row: `flex gap-3 py-2.5 border-b border-slate-100`. Timestamp: `text-muted-foreground w-[60px] shrink-0 text-xs`. Content: `text-sm`.

### Verification

- Timestamped rows with separator borders
- Filter dropdowns at top
- Badges for status types (FIT, GAP, etc.)

---

## UXR-16: Registers (Integration, DM, OCM)

**Files**: Integration, Data Migration, OCM register client components
**Risk**: 🟢 Low
**Estimated time**: 15–20 minutes (all three)

### Target State (from HTML reference §17–19)

All three registers follow the same pattern:

1. **Stat grid** at top (cols-3 or cols-4) with key metrics
2. **Filter bar** below stats
3. **Data table** with appropriate badges

**Integration Register** stat-grid cols-4: Total Points, Inbound, Outbound, Bidirectional
**Data Migration Register** stat-grid cols-3: Migration Objects, Total Records, Est. Effort
**OCM Impact Register** stat-grid cols-3: OCM Impacts, Training Days, Affected Users

### Exact Changes

Verify each register has stat cards above the table. If any are missing, add them. Ensure table badges use consistent colors (see UXR-08 pattern).

---

## UXR-17: Portfolio Analytics

**File**: Analytics page component
**Risk**: 🟢 Low
**Estimated time**: 15–20 minutes

### Target State (from HTML reference §25)

```
stat-grid cols-4: Active Assessments | Avg FIT Rate (green, with "Industry avg: 62%") | Total Gaps | Avg Completion

Comparison table:
Assessment | Industry | FIT Rate | Gaps | Completion | vs Benchmark
```

The "vs Benchmark" column shows `↑ +10%` (green) or `↓ -7%` (red) indicators.

### Exact Changes

1. Ensure stat cards with sub-labels ("Industry avg: 62%") render
2. Add benchmark comparison column to assessment table with color indicators

---

## UXR-18: Assessment Templates

**File**: Templates page component
**Risk**: 🟢 Low
**Estimated time**: 10–15 minutes

### Target State (from HTML reference §26)

3-column card grid:

```
grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3
```

Each template card:
- Industry badge (colored) at top
- Template name (h4)
- Description: scope item count, functional areas, "Based on X assessments"
- "Use Template" button (ghost variant)

### Exact Changes

Ensure template cards use the 3-column grid and include industry badges with appropriate colors (blue for Manufacturing, green for Finance Only, amber for Oil & Gas).

---

## UXR-19: Organization & User Management

**File**: Organization settings page
**Risk**: 🟢 Low
**Estimated time**: 10–15 minutes

### Target State (from HTML reference §24)

2-column grid:

```
grid grid-cols-1 md:grid-cols-2 gap-4
```

Left card: Organization Settings (form fields)
Right card: User Management (table with name, role badge, status badge + "Invite User" button)

### Exact Changes

If not already in a 2-column layout, wrap in a grid. Ensure role badges use blue and status badges use green (Active) or amber (Pending).

---

## UXR-20: Admin Panel Layout

**File**: Admin layout, sidebar component
**Risk**: 🟢 Low
**Estimated time**: 10–15 minutes

### Target State (from HTML reference §27)

Admin sidebar with section labels:

```
┌──────────────────────┐
│ Overview              │  ← section label
│   📊 Overview         │
│ Intelligence          │  ← section label
│   🏭 Industries       │
│   📐 Effort Baselines │
│   🧩 Extensibility    │
│   🔄 Adaptations      │
│ Data                  │  ← section label
│   📦 SAP Catalog      │
│   📤 ZIP Ingestion    │
│ System                │  ← section label
│   👥 Users            │
│   📋 All Assessments  │
└──────────────────────┘
```

### Exact Changes

Add section label dividers to the admin sidebar: `text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-4 pb-1`. Each section groups related nav items.

Admin overview page: 2 rows of stat cards (3 + 3) plus a sub-page reference table.

---

## UXR-21: Auth Pages (Login, MFA)

**Files**: Login page, MFA pages
**Risk**: 🟢 Low
**Estimated time**: 10–15 minutes

### Target State

Centered card on slate-50 background:

```
bg-slate-50 min-h-screen flex items-center justify-center

Card: max-w-sm bg-white border rounded-lg shadow-sm p-8
- Logo at top (centered)
- Form fields
- Submit button (full width, primary)
```

### Exact Changes

1. Ensure the login page wrapper has `bg-slate-50 min-h-screen flex items-center justify-center`
2. Card: `max-w-sm w-full bg-white border rounded-lg shadow-sm p-8`
3. Logo centered above the form
4. Input fields with proper label spacing
5. Button full width

---

## Dependency Graph

```
UXR-01 (Assessment List)     — independent
UXR-02 (Dashboard)           — independent
UXR-03 (Profile Wizard)      — independent
UXR-04 (Landscape Map)       — independent (new component)
UXR-05 (Scope Briefing)      — depends on UXR-04 (shares scope selection context)
UXR-06 (Review Sidebar)      — independent
UXR-07 (Step Card)           — independent
UXR-08 (Config Matrix)       — independent
UXR-09 (Gap Cards)           — independent
UXR-10 (Remaining Items)     — independent
UXR-11 (Report Page)         — independent
UXR-12 (Sign-Off Timeline)   — independent
UXR-13 (Workshop Mode)       — independent
UXR-14 (Conversation Mode)   — independent
UXR-15 (Activity Log)        — independent
UXR-16 (Registers)           — independent
UXR-17 (Analytics)           — independent
UXR-18 (Templates)           — independent
UXR-19 (Organization)        — independent
UXR-20 (Admin Panel)         — independent
UXR-21 (Auth Pages)          — independent
```

**Recommended execution order** (risk-ascending):

| Pass | Items | Risk | Est. Time |
|------|-------|------|-----------|
| 1 | UXR-08, UXR-10, UXR-15, UXR-16, UXR-17, UXR-18, UXR-19, UXR-20, UXR-21 | 🟢 All Low | 90–120 min |
| 2 | UXR-01, UXR-02, UXR-06, UXR-07, UXR-09, UXR-11, UXR-12, UXR-14 | 🟡 All Medium | 150–210 min |
| 3 | UXR-03, UXR-04, UXR-05, UXR-13 | 🔴 All High | 150–240 min |

**Total estimated**: 8–12 hours

---

## Verification Protocol

After each UXR item:

```bash
pnpm build && pnpm typecheck
```

After completing each Pass:

1. **Visual inspection**: Open each affected page in the browser and verify layout matches the HTML reference
2. **Responsive check**: Verify at 375px (mobile), 768px (tablet), and 1280px (desktop)
3. **Interaction check**: Verify all buttons, links, filters, and navigation still function
4. **Regression check**: Ensure no other pages broke

After all 21 UXR items complete:

```bash
pnpm build && pnpm typecheck && pnpm test --run
```

All tests must pass. Any test failures must be investigated — they likely indicate a JSX restructure broke a test selector or expected component hierarchy.

---

## Appendix: Files Touched Per UXR

| UXR | Files Modified | New Files |
|-----|----------------|-----------|
| 01 | `assessments/page.tsx` | — |
| 02 | `DashboardShell.tsx`, `AttentionWidget.tsx`, `KpiPanel.tsx`, `ProgressHeatmap.tsx` | — |
| 03 | `CompanyProfileForm.tsx`, `assessment/[id]/profile/page.tsx` | `WizardStepIndicator.tsx` |
| 04 | `ScopeSelectionClient.tsx` | `ProcessLandscapeMap.tsx` |
| 05 | `ScopeSelectionClient.tsx` | `ScopeItemBriefing.tsx` |
| 06 | `HierarchyTreeSidebar.tsx` | — |
| 07 | `StepReviewCard.tsx`, `ReviewShell.tsx` | — |
| 08 | Config matrix client component | — |
| 09 | `GapResolutionCard.tsx` | — |
| 10 | `RemainingItemsClient.tsx` | — |
| 11 | `ReportClient.tsx` | — |
| 12 | `SignOffDashboardClient.tsx`, `ReportClient.tsx` | — |
| 13 | Workshop session page | — |
| 14 | `ConversationCard.tsx` | — |
| 15 | Activity feed component | — |
| 16 | Register client components (3) | — |
| 17 | Analytics page | — |
| 18 | Templates page | — |
| 19 | Organization page | — |
| 20 | Admin sidebar/layout | — |
| 21 | Login page, MFA pages | — |

**Total**: ~30 files modified, 3 new files created.
