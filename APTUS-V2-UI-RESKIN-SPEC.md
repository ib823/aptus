# ABEAM V2 — UI Reskin Specification

**Purpose**: Replace the current mixed-theme UI with a clean light-theme visual language aligned to the ABEAM Design System and the reference HTML document.

**Execution Model**: 6 sequential modules. Execute one at a time. Verify each before proceeding. DO NOT execute multiple modules in parallel.

**Critical Rule**: This spec touches ONLY frontend styling, layout, and component presentation. It NEVER modifies API routes, Prisma models, business logic, data fetching, React Query hooks, form validation, state machines, or authentication. If a change would affect any of those, STOP and skip it.

**Reference Design**: The visual targets come from the ABEAM V2 Complete Screen UI document. The codebase is the source of truth for component logic and data flow.

---

## Pre-Flight Checklist

Before starting any module, run:

```bash
cd /workspaces/cockpit/fit-portal
pnpm build
pnpm typecheck
```

Both must pass with zero errors. If they fail before you start, STOP — do not proceed until the baseline is clean.

After EVERY module, run the same commands. If they fail, revert that module's changes and diagnose.

---

# MODULE 1: Theme Foundation

**Risk**: Low
**Files touched**: 4
**What changes**: CSS variables, theme provider config, meta tag, theme toggle removal
**What does NOT change**: Any component logic, any shadcn/ui primitives, any Tailwind utility classes in components

## 1.1 Force Light Theme

**File**: `src/components/shared/Providers.tsx`

**Current**:
```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
```

**Change to**:
```tsx
<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light" disableTransitionOnChange>
```

**Why**: Eliminates dark mode entirely. The `forcedTheme="light"` prevents any runtime theme switching. `enableSystem={false}` prevents system preference from triggering dark mode.

## 1.2 Update Meta Theme Color

**File**: `src/app/layout.tsx`

**Current**:
```tsx
other: {
  "theme-color": "#09090b",
},
```

**Change to**:
```tsx
other: {
  "theme-color": "#f8fafc",
},
```

**Why**: The current `#09090b` is a near-black color meant for dark mode. `#f8fafc` matches the light theme background (`--bg` in the reference design). This affects the browser chrome color on mobile.

## 1.3 Remove ThemeToggle from PortalNav

**File**: `src/components/layout/PortalNav.tsx`

**Current**: The `PortalNav` imports and renders `<ThemeToggle />` in the header.

**Change**: Remove the `<ThemeToggle />` component from the JSX render. Remove the import line `import { ThemeToggle } from "@/components/shared/ThemeToggle";`. Do NOT delete the `ThemeToggle.tsx` file — it can be re-enabled later if dark mode is added back.

**Note**: Search the entire codebase for any other usages of `<ThemeToggle />` outside PortalNav and remove those renders too (but keep the file).

## 1.4 Align CSS Variables to Reference Design

**File**: `src/app/globals.css`

The current `:root` block uses `oklch()` color values. The reference design uses hex values that map to specific Tailwind colors. These need to be aligned.

**Important**: Do NOT remove the `.dark` block — just leave it in place. Since `forcedTheme="light"` prevents the `dark` class from ever being applied, the `.dark` block is harmless dead code.

**Replace the `:root` block** with these values. Keep the existing structure and variable names — just update the values:

```css
:root {
  --radius: 0.625rem;

  /* Core surfaces — reference: --bg: #f8fafc, --surface: #ffffff */
  --background: oklch(0.984 0.003 247.86);    /* #f8fafc — slate-50 */
  --foreground: oklch(0.129 0.042 264.05);    /* #0f172a — slate-900 */

  --card: oklch(1 0 0);                        /* #ffffff */
  --card-foreground: oklch(0.129 0.042 264.05); /* #0f172a */

  --popover: oklch(1 0 0);                     /* #ffffff */
  --popover-foreground: oklch(0.129 0.042 264.05);

  /* Primary — reference: --blue-500: #3b82f6 */
  --primary: oklch(0.623 0.214 259.13);        /* #3b82f6 — blue-500 */
  --primary-foreground: oklch(1 0 0);           /* #ffffff */

  /* Secondary surfaces */
  --secondary: oklch(0.968 0.007 247.86);      /* #f1f5f9 — slate-100 */
  --secondary-foreground: oklch(0.208 0.042 264.05); /* #1e293b — slate-800 */

  --muted: oklch(0.968 0.007 247.86);          /* #f1f5f9 */
  --muted-foreground: oklch(0.446 0.03 256.8); /* #64748b — slate-500 */

  --accent: oklch(0.929 0.013 255.51);         /* #e2e8f0 — slate-200 */
  --accent-foreground: oklch(0.208 0.042 264.05);

  --destructive: oklch(0.577 0.245 27.325);    /* keep existing red */

  /* Borders — reference: --border: #e2e8f0 */
  --border: oklch(0.929 0.013 255.51);         /* #e2e8f0 — slate-200 */
  --input: oklch(0.929 0.013 255.51);

  /* Ring — matches primary */
  --ring: oklch(0.623 0.214 259.13);           /* #3b82f6 */

  /* Charts — keep existing */
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);

  /* Sidebar */
  --sidebar: oklch(1 0 0);                     /* #ffffff */
  --sidebar-foreground: oklch(0.129 0.042 264.05);
  --sidebar-primary: oklch(0.623 0.214 259.13);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.968 0.007 247.86); /* #f1f5f9 */
  --sidebar-accent-foreground: oklch(0.208 0.042 264.05);
  --sidebar-border: oklch(0.929 0.013 255.51); /* #e2e8f0 */
  --sidebar-ring: oklch(0.623 0.214 259.13);

  /* Shadows — light, subtle */
  --shadow-color: oklch(0 0 0 / 0.04);
  --shadow-color-md: oklch(0 0 0 / 0.06);
  --shadow-color-lg: oklch(0 0 0 / 0.08);
  --shadow-color-xl: oklch(0 0 0 / 0.12);

  /* Status colors — reference design hex values mapped to oklch */
  /* FIT: #22c55e bg, #15803d text, #f0fdf4 surface */
  --status-fit-bg: oklch(0.962 0.044 156.74);
  --status-fit-fg: oklch(0.448 0.119 151.33);

  /* CONFIGURE: #3b82f6 bg, #1d4ed8 text, #eff6ff surface */
  --status-configure-bg: oklch(0.962 0.023 254.13);
  --status-configure-fg: oklch(0.488 0.217 264.38);

  /* EXTEND: #f59e0b bg, #b45309 text, #fffbeb surface */
  --status-extend-bg: oklch(0.987 0.026 95.28);
  --status-extend-fg: oklch(0.553 0.135 66.44);

  /* BUILD: #ef4444 bg, #b91c1c text, #fef2f2 surface */
  --status-build-bg: oklch(0.977 0.013 17.38);
  --status-build-fg: oklch(0.444 0.177 26.9);

  /* ADAPT: #a855f7 bg, #7e22ce text, #faf5ff surface */
  --status-adapt-bg: oklch(0.977 0.017 293.76);
  --status-adapt-fg: oklch(0.474 0.209 303.9);

  /* PENDING: #6b7280 text, #f9fafb surface */
  --status-pending-bg: oklch(0.985 0.002 247.86);
  --status-pending-fg: oklch(0.446 0.03 256.8);

  /* NA: #94a3b8 text, #f8fafc surface */
  --status-na-bg: oklch(0.984 0.003 247.86);
  --status-na-fg: oklch(0.647 0.015 264.05);
}
```

## 1.5 Verification

```bash
pnpm build && pnpm typecheck
```

**Visual check**: Open the app in a browser. EVERY page should now render in light mode only. No dark mode toggle visible. Background should be a very light blue-gray (`#f8fafc`), cards should be white, primary accent should be blue (`#3b82f6`).

---

# MODULE 2: Shared UI Primitives

**Risk**: Low-Medium
**Files touched**: ~12 component files
**What changes**: Visual styling (classNames, colors) on reusable components
**What does NOT change**: Component props, event handlers, state logic, data flow

## 2.1 Status Badge Colors

Search the codebase for all status badge/pill rendering. There are several patterns used for FIT/CONFIGURE/GAP/NA/PENDING badges. Ensure they ALL use these consistent classes:

```
FIT:       bg-green-50 text-green-700 border-green-200
CONFIGURE: bg-blue-50 text-blue-700 border-blue-200
GAP:       bg-amber-50 text-amber-700 border-amber-200
NA:        bg-slate-50 text-slate-500 border-slate-200
PENDING:   bg-gray-50 text-gray-500 border-gray-200
EXTEND:    bg-orange-50 text-orange-700 border-orange-200
BUILD:     bg-red-50 text-red-700 border-red-200
ADAPT:     bg-purple-50 text-purple-700 border-purple-200
```

**Files to audit** (search for `fitStatus`, `bg-green`, `bg-amber`, `bg-blue` in these):
- `src/components/review/StepReviewCard.tsx`
- `src/components/review/ReviewShell.tsx`
- `src/components/review/ReviewClient.tsx`
- `src/components/review/ClassifiableProgressBar.tsx`
- `src/components/scope/ScopeItemCard.tsx`
- `src/components/gaps/GapSummary.tsx`
- `src/components/gaps/GapResolutionCard.tsx`
- `src/components/shared/ProgressBar.tsx`
- `src/components/config/ConfigMatrixClient.tsx`

For each file, find the status color mapping and replace any inconsistent values with the canonical set above. Do NOT change component logic — only the color class strings.

## 2.2 Card Component Styling

The reference design uses cards with:
- `bg-white` background (achieved via `bg-card` which maps to white)
- `border border-slate-200` (achieved via `border` which maps to `--border`)
- `rounded-lg` (10px radius)
- `shadow-sm` hover: `shadow-md` (subtle elevation)

Search for card-like containers (divs with `bg-card`, `rounded`, `border`, `shadow`) and ensure they follow this pattern. The shadcn `Card` component should already inherit from `--card` which is now white, but check for any hardcoded dark-mode-specific classes like `bg-zinc-900`, `bg-neutral-900`, `bg-gray-900`, or `dark:` prefixed classes on card wrappers.

**Action**: Search the `src/components/` directory for any hardcoded dark background classes:
```bash
grep -rn "bg-zinc-\|bg-neutral-9\|bg-gray-9\|bg-slate-9" src/components/ --include="*.tsx"
```

Remove or replace any found with their light equivalents (`bg-card`, `bg-muted`, `bg-secondary`).

## 2.3 Progress Bar Segment Colors

**File**: `src/components/shared/ProgressBar.tsx` and `src/components/review/ClassifiableProgressBar.tsx`

Ensure the segmented progress bars use:
```
FIT segment:       bg-green-500 (#22c55e)
CONFIGURE segment: bg-blue-500 (#3b82f6)
GAP segment:       bg-amber-500 (#f59e0b)
NA segment:        bg-slate-300 (#cbd5e1)
PENDING:           bg-gray-200 (#e5e7eb) — the unfilled portion
```

## 2.4 Button Styling Consistency

The reference design uses these button patterns:
- **Primary**: `bg-blue-600 hover:bg-blue-700 text-white` (mapped via `bg-primary`)
- **Secondary/Outline**: `border border-slate-200 bg-white hover:bg-slate-50 text-slate-700`
- **Ghost**: `hover:bg-slate-100 text-slate-600`
- **Destructive**: `bg-red-600 hover:bg-red-700 text-white`

These should already work via shadcn's `Button` variants since we updated `--primary` in Module 1. Verify by checking if any buttons have hardcoded color classes that bypass the design token system.

```bash
grep -rn "bg-blue-[567]00\|bg-red-[567]00" src/components/ --include="*.tsx" | grep -v "status\|badge\|pill\|indicator\|dot"
```

Any results that are on `<button>` or `<Button>` elements should be replaced with the appropriate shadcn variant (`variant="default"` for primary, `variant="destructive"` for red).

## 2.5 Verification

```bash
pnpm build && pnpm typecheck
```

**Visual check**: Navigate to `/assessments`, open an assessment, go to `/review`. Check that status badges use the correct colors. Check that cards are white with subtle borders. Check that progress bars use green/blue/amber segments.

---

# MODULE 3: Navigation & Layout Shell

**Risk**: Medium
**Files touched**: ~6 layout/navigation files
**What changes**: Visual appearance of navigation, spacing, colors
**What does NOT change**: Route definitions, navigation items, conditional logic for role-based nav visibility, active state detection

## 3.1 PortalNav Header

**File**: `src/components/layout/PortalNav.tsx`

The current PortalNav uses `border-b bg-background` on the header. After Module 1, `bg-background` resolves to `#f8fafc`. The reference design shows the nav bar as white with a subtle bottom border.

**Changes**:
1. Change header `className` from `border-b bg-background` to `border-b bg-white`
2. Active nav item should use `text-blue-600 font-medium` (not just `text-primary`)
3. Inactive nav items: `text-slate-500 hover:text-slate-900`
4. The nav height `h-14` (56px) matches the reference `--nav-height: 56px` — keep as-is
5. Remove the `<ThemeToggle />` render (from Module 1.3)

**Preserve**: All conditional nav item visibility logic (`show` property based on `user.role`), `NotificationBell` render, user menu dropdown, logo link.

## 3.2 AssessmentTabNav

**File**: `src/components/layout/AssessmentTabNav.tsx`

The current implementation already has the correct 5-stage structure (Setup, Review, Outputs, Registers, Wrap-up) with sub-tabs. The visual styling needs alignment:

**Stage tabs (top row)**:
- Container: `bg-white border-b` (not `bg-background`)
- Active stage: `border-b-2 border-blue-600 text-blue-600 font-medium`
- Inactive stage: `border-b-2 border-transparent text-slate-500 hover:text-slate-700`

**Sub-tabs (second row)**:
- Container: `bg-slate-50/50 border-b` (currently `bg-muted/30 border-b`)
- Active sub-tab: `border-b-2 border-blue-500 text-blue-600 bg-white`
- Inactive sub-tab: `border-b-2 border-transparent text-slate-500 hover:text-slate-700`

**Changes**: Update the className strings in the stage links and sub-tab links. Do NOT change the `stages` array structure, the conditional tab logic (`assessmentStatus` checks), or the `activeSegment` detection.

## 3.3 Portal Layout

**File**: `src/app/(portal)/layout.tsx`

Ensure the portal layout wrapper uses:
- `bg-slate-50` or `bg-background` for the page background (should now resolve correctly after Module 1)
- `max-w-7xl mx-auto` for content centering
- Proper spacing below the PortalNav

## 3.4 Assessment Layout

**File**: `src/app/(portal)/assessment/[id]/layout.tsx`

This layout wraps all assessment pages and renders the `AssessmentTabNav`. Ensure:
- The layout background is `bg-slate-50` (the subtle gray behind white cards)
- Content area has `px-4 sm:px-6 lg:px-8 py-6` padding
- The `AssessmentTabNav` sits flush against the top with no gap

## 3.5 Admin Layout

**File**: `src/app/(admin)/layout.tsx`

The admin layout should follow the same pattern:
- White sidebar nav on the left (280px)
- `bg-slate-50` content area
- Admin nav items: same active/inactive styling as PortalNav

## 3.6 MobileBottomTabBar

**File**: `src/components/pwa/MobileBottomTabBar.tsx`

Update the tab bar styling:
- Container: `bg-white border-t border-slate-200` (currently `bg-background`)
- Active tab: `text-blue-600 font-medium`
- Inactive tab: `text-slate-400 hover:text-slate-600`

## 3.7 Verification

```bash
pnpm build && pnpm typecheck
```

**Visual check**: Navigate between portal pages. The top nav should be white with blue active states. Open an assessment — the tab nav should show 5 stage groups with blue underline on active. Check mobile viewport (375px) — bottom tab bar should be white with blue active icons.

---

# MODULE 4: Assessment Screens

**Risk**: Medium-High
**Files touched**: ~20 page/component files
**What changes**: Layout structure, spacing, card presentations, form styling
**What does NOT change**: Data fetching (RSC server components, React Query), form handlers, API calls, validation logic, state management

## 4.1 Assessment List Page

**File**: `src/app/(portal)/assessments/page.tsx` and related components

**Target layout**:
- Page header: "Assessments" title with "New Assessment" primary button (top-right)
- Filter bar below: search input + status filter dropdown
- Cards in a grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Each assessment card: white, rounded-lg, border, contains:
  - Company name (font-semibold text-lg)
  - Industry badge (small, muted)
  - Status badge (color-coded per Module 2.1)
  - Progress bar (segmented per Module 2.3)
  - "X of Y steps reviewed" (text-sm text-slate-500)
  - Last updated timestamp (text-xs text-slate-400)

**Changes**: Adjust the assessment card component's className values and layout structure. Do NOT change the data props or the server-side data fetching.

## 4.2 Company Profile (4-Step Wizard)

**Files**:
- `src/app/(portal)/assessment/[id]/profile/page.tsx`
- `src/components/assessment/CompanyProfileForm.tsx`
- Related sub-components (`IndustrySelector.tsx`, `StakeholderManager.tsx`)

**Target layout**:
- Centered content: `max-w-2xl mx-auto`
- Step indicator at top: 4 steps (Basic Info, ERP Landscape, Operating Model, Stakeholders)
- Step indicator styling: completed=green circle with check, current=blue filled circle, upcoming=gray outline circle, connected by gray line
- Each step: white card with form fields
- Form fields: `border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500`
- Action bar at bottom: Back (outline) + Continue (primary blue)

**Changes**: Primarily className adjustments on the wizard shell and form containers. The step indicator component likely exists — update its colors.

## 4.3 Scope Selection

**Files**:
- `src/app/(portal)/assessment/[id]/scope/page.tsx`
- `src/components/scope/ScopeAreaGroup.tsx`
- `src/components/scope/ScopeItemCard.tsx`
- `src/components/scope/ScopeProgress.tsx`

**Target layout**:
- Impact summary at top: 4 stat cards in a row (`grid grid-cols-2 lg:grid-cols-4 gap-4`)
  - Each stat card: white, border, rounded-lg, number in text-2xl font-bold, label in text-sm text-slate-500
- Filter bar: search + area filter + relevance toggle (All/Selected/Not Selected)
- Scope items grouped by functional area: collapsible accordion sections
- Each scope item row: checkbox + name + step count badge + sub-area + dependency indicator
- Sticky action bar at bottom: Back + progress summary + Continue

**Changes**: Restyle stat cards, scope item rows, area accordion headers. Ensure checkbox uses `accent-blue-600` for checked state. Do NOT change the bulk selection logic, dependency graph, or priority/complexity selectors.

## 4.4 Process Step Review

**Files**:
- `src/components/review/ReviewShell.tsx` (the primary review component)
- `src/components/review/StepReviewCard.tsx`
- `src/components/review/ReferenceStepRow.tsx`
- `src/components/hierarchy/HierarchyTreeSidebar.tsx`
- `src/components/hierarchy/HierarchyBreadcrumb.tsx`

**Target layout** (most complex screen):

**Left sidebar (280px)**:
- White background, border-right
- Hierarchy tree: functional area → scope item → process flow → activity
- Each tree node: indent level, expand/collapse chevron, name, step count badge
- Active node: `bg-blue-50 text-blue-700 font-medium border-l-2 border-blue-600`
- Completion indicators: small colored dot or progress percentage per node

**Main content area**:
- Breadcrumb at top: `Functional Area > Scope Item > Process Flow > Activity`
- Progress bar below breadcrumb: segmented, showing classifiable step progress
- Current step card (white, rounded-lg, border):
  - **Decision section at TOP** (decision-first layout per Phase 12):
    - Classification buttons: FIT (green), CONFIGURE (blue), GAP (amber), N/A (gray)
    - Active button: filled with color, others: outline
    - Confidence selector below (if a status is selected): High/Medium/Low pills
    - Conditional inputs: Gap note (required for GAP), Config note, Current process
  - **SAP Content section BELOW** the decision:
    - Purpose block: always visible, text-sm
    - Collapsible sections: Prerequisites, System Access, Roles, Master Data
    - Main instructions: always visible
    - Expected Result (for test steps): always visible
  - Evidence URLs section
  - Configuration activities (de-duplicated badges)
- Navigation footer: Previous / Step X of Y / Next

**Changes**: This is primarily a restyling of existing components. The decision-first layout should already exist (Phase 12 implemented it). Update:
- Sidebar colors: white bg, blue active state, subtle gray borders
- Step card: ensure decision buttons are above content
- Classification button colors: match the status badge palette from Module 2.1
- Collapsible sections: `border-b border-slate-100` dividers, chevron icon for expand/collapse
- Navigation buttons: outline variant, centered step counter in `text-sm text-slate-500`

**Do NOT change**: `handleResponseChange`, keyboard shortcuts, step grouping logic, hierarchy context provider, data fetching.

## 4.5 Configuration Matrix

**Files**:
- `src/app/(portal)/assessment/[id]/config/page.tsx`
- `src/components/config/ConfigMatrixClient.tsx`

**Target layout**:
- Summary stats at top: Total activities, Included, Excluded, Mandatory counts
- Filter bar: search + category filter + mandatory/optional toggle
- Table with columns: Activity Name, Category, Self-Service, Mandatory, Include/Exclude toggle
- Table styling:
  - Header: `bg-slate-50 text-xs text-slate-500 uppercase tracking-wider`
  - Rows: `border-b border-slate-100 hover:bg-slate-50`
  - Mandatory badge: `bg-red-50 text-red-700 text-xs`
  - Optional badge: `bg-slate-50 text-slate-500 text-xs`

## 4.6 Gap Resolution

**Files**:
- `src/app/(portal)/assessment/[id]/gaps/page.tsx`
- `src/components/gaps/GapSummaryDashboard.tsx`
- `src/components/gaps/GapResolutionCard.tsx`

**Target layout**:
- Summary dashboard at top: total gaps, resolved count, by-type breakdown (bar chart)
- Each gap card: white, rounded-lg, border
  - Header: scope item name + step title + severity badge
  - Description: client's gap note
  - Resolution options: cards for each option (EXTEND/BUILD/ADAPT) with effort/cost/risk
  - Selected resolution: highlighted with blue border
  - Rationale input: textarea

## 4.7 Remaining Items Register

**File**: `src/app/(portal)/assessment/[id]/remaining/page.tsx`

**Target layout**:
- Two sections: "Auto-Detected" (system-found items) + "Manually Added"
- Auto-detected items: grouped by type (Unreviewed Steps, Undecided Scope, Deferred Gaps)
- Each item: compact row with type icon, description, link to source
- Manual items: add button, list of user-entered items with edit/delete

## 4.8 Register Pages (Integrations, Data Migration, OCM)

**Files**:
- `src/app/(portal)/assessment/[id]/integrations/page.tsx`
- `src/app/(portal)/assessment/[id]/data-migration/page.tsx`
- `src/app/(portal)/assessment/[id]/ocm/page.tsx`

All three follow the same pattern:
- Summary stats at top
- Table/card list of items
- Each item: white card with fields, status badge, edit capability
- Table header: `bg-slate-50` with uppercase labels
- Add new item: primary button in top-right

## 4.9 Process Map & Flow Atlas

**Files**:
- `src/app/(portal)/assessment/[id]/process-map/page.tsx`
- `src/app/(portal)/assessment/[id]/flows/page.tsx`
- `src/components/hierarchy/ProcessMapCanvas.tsx`
- `src/components/flows/FlowViewerClient.tsx`

**Process Map**: Functional area overview + drill-down. Ensure:
- Area cards use the heatmap gradient (`bg-red-100` through `bg-green-100`)
- Classification color overlays on swimlane nodes match Module 2.1 colors
- Toolbar (zoom, pan, export) uses outline buttons on white background

**Flow Atlas**: Per-scope-item diagram list. Ensure:
- Diagram cards: white, border, rounded-lg
- Generate/Regenerate buttons: primary blue
- Status indicators: same palette

## 4.10 Verification

```bash
pnpm build && pnpm typecheck
```

**Visual check per screen**:
1. `/assessments` — card grid, status badges, progress bars
2. `/assessment/[id]/profile` — wizard steps, form fields
3. `/assessment/[id]/scope` — stat cards, area groups, checkboxes
4. `/assessment/[id]/review/[scopeItemId]` — sidebar tree, decision-first card, nav buttons
5. `/assessment/[id]/config` — table with headers, badges
6. `/assessment/[id]/gaps` — summary + gap cards
7. `/assessment/[id]/remaining` — auto-detected + manual sections
8. `/assessment/[id]/integrations` — register table
9. `/assessment/[id]/process-map` — heatmap + diagram

---

# MODULE 5: Portal & Admin Screens

**Risk**: Medium
**Files touched**: ~15 page components
**What changes**: Dashboard widget styling, portal page layouts, admin panel styling
**What does NOT change**: Widget data computation, attention engine logic, role-based widget selection, API endpoints

## 5.1 Intelligent Dashboard

**Files**:
- `src/app/(portal)/dashboard/page.tsx`
- `src/components/dashboard/DashboardShell.tsx`
- `src/components/dashboard/AttentionWidget.tsx`
- `src/components/dashboard/ProgressHeatmap.tsx`
- `src/components/dashboard/KpiPanel.tsx`
- `src/components/dashboard/DeadlineTimeline.tsx`
- `src/components/dashboard/ActivityFeed.tsx`
- `src/components/dashboard/WidgetCustomizer.tsx`
- `src/components/dashboard/ConflictSummaryWidget.tsx`

**Target layout**:
- Page header: "Dashboard" with "Customize" button (outline) at top-right
- Widget grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Each widget: white card, rounded-lg, border, shadow-sm
  - Widget header: `px-4 py-3 border-b border-slate-100` with title in `font-semibold text-sm`
  - Widget body: `px-4 py-4`

**AttentionWidget**:
- Critical items: `bg-red-50 border-l-4 border-red-400`
- Warning items: `bg-amber-50 border-l-4 border-amber-400`
- Info items: `bg-blue-50 border-l-4 border-blue-400`

**KpiPanel**:
- Large number: `text-3xl font-bold text-slate-900`
- Label below: `text-sm text-slate-500`
- Trend indicator: green up arrow / red down arrow

**ProgressHeatmap**:
- Cells: gradient from `bg-red-200` → `bg-amber-200` → `bg-green-200` → `bg-green-400`
- Empty/zero: `bg-gray-100`

## 5.2 Organization Settings

**Files**:
- `src/app/(portal)/organization/page.tsx`
- `src/app/(portal)/organization/users/page.tsx`

**Target layout**:
- Org settings: centered card, max-w-2xl, form fields for name/plan/SSO
- Users table: white card with table inside
  - Columns: Name, Email, Role, Status, Actions
  - Invite button: primary blue, top-right
  - Role badge: muted pill
  - Status: green dot = active, gray dot = invited, red dot = deactivated

## 5.3 Analytics

**File**: `src/app/(portal)/analytics/page.tsx`

- KPI cards row at top
- Charts: ensure chart colors use `--chart-1` through `--chart-5` (already defined)
- Table data: standard table styling (slate-50 headers, slate-100 row borders)

## 5.4 Templates

**File**: `src/app/(portal)/templates/page.tsx`

- Template cards in a grid
- Each card: industry badge, scope item count, "Use Template" button (outline)
- Empty state: centered icon + message + CTA

## 5.5 Admin Panel (8 Sub-Pages)

**Files**: `src/app/(admin)/**/*.tsx`

All admin pages follow the same pattern:
- Left sidebar nav (already styled in Module 3.5)
- Content area: table-based CRUD interface
- Table header: `bg-slate-50` with uppercase labels
- Action buttons: outline for secondary, primary blue for main actions
- Form modals/dialogs: white bg, rounded-xl, shadow-lg

Specific pages:
- **Industries**: table of industry profiles
- **Baselines**: effort baseline management
- **Extensibility**: extensibility pattern management
- **Adaptations**: adaptation pattern management
- **Catalog**: SAP BPD catalog browser
- **Ingest**: ZIP upload + progress log
- **Assessments**: all assessments across orgs
- **Users**: all users across orgs

## 5.6 Verification

```bash
pnpm build && pnpm typecheck
```

**Visual check**:
1. `/dashboard` — widget grid, attention items, KPI cards
2. `/organization` — settings form
3. `/organization/users` — user table, invite button
4. `/analytics` — charts, tables
5. `/templates` — template cards
6. `/admin` — sidebar nav, table CRUD for each sub-page

---

# MODULE 6: Overlay & Supplementary Components

**Risk**: Medium-High
**Files touched**: ~15 component files
**What changes**: Visual styling of overlays, panels, indicators
**What does NOT change**: Notification dispatch logic, SSE connections, comment threading logic, workshop WebSocket, sign-off cryptographic hash chain

## 6.1 Notification Bell & Panel

**Files**:
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationPanel.tsx`
- `src/components/notifications/NotificationItem.tsx`

**Target styling**:
- Bell icon: `text-slate-500 hover:text-slate-700` with unread badge (`bg-red-500 text-white text-xs`)
- Panel dropdown: white, rounded-lg, border, shadow-lg, max-h-96 overflow-y-auto
- Each notification item:
  - Unread: `bg-blue-50/50 border-l-2 border-blue-400`
  - Read: `bg-white`
  - Title: `font-medium text-sm text-slate-900`
  - Body: `text-xs text-slate-500`
  - Timestamp: `text-xs text-slate-400`
  - Dismiss button: `text-slate-400 hover:text-slate-600`

## 6.2 Workshop Mode

**Files**:
- Workshop-related components in `src/components/workshops/`

**Target styling**:
- Full-screen facilitation mode: dark header bar (`bg-slate-900 text-white`) with timer, QR code
- Participant list: white sidebar with avatar + name + status dot
- Voting interface: large buttons for classification options
- Timer: countdown in `text-4xl font-bold font-mono`
- QR code: white card, centered, with session code below in `font-mono text-lg tracking-wider`

## 6.3 Activity Log

**File**: `src/app/(portal)/assessment/[id]/activity/page.tsx`

**Target styling**:
- Timeline layout: vertical line on left, dots for each entry
- Each entry: avatar, action description, timestamp
- Action types color-coded: classifications (blue), comments (green), gaps (amber), status changes (purple)
- Filter bar: action type filter + date range + user filter

## 6.4 Digital Sign-Off

**File**: `src/app/(portal)/assessment/[id]/sign-off/page.tsx`

**Target styling**:
- 3 sign-off slots in a row: Client Rep, Consultant, PM
- Each slot: white card, rounded-lg, border
  - Unsigned: dashed border, muted content, "Sign" primary button
  - Signed: solid border, green check icon, signer name, timestamp, hash preview
- Cryptographic hash: `font-mono text-xs text-slate-400 truncate`
- Final status: when all 3 signed, green banner at top

## 6.5 Report & Export

**File**: `src/app/(portal)/assessment/[id]/report/page.tsx`

**Target styling**:
- Report grid: cards for each report type
- Each card: white, border, rounded-lg
  - Icon (FileText, Table, etc.) in `text-blue-500`
  - Report name: `font-medium text-sm`
  - Format badge: `text-xs bg-slate-100 text-slate-500` (PDF, XLSX, etc.)
  - Download button: outline
- "Download All" button: primary blue, top-right
- Complete package ZIP: highlighted card with `border-blue-200 bg-blue-50`

## 6.6 Login & Auth Screens

**Files**:
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/mfa/setup/page.tsx`
- `src/app/(auth)/mfa/verify/page.tsx`

**Target styling**:
- Centered layout: `min-h-screen flex items-center justify-center bg-slate-50`
- Login card: `max-w-sm bg-white rounded-xl shadow-lg p-8`
- Logo at top, centered
- "Welcome to ABeam" heading: `text-xl font-semibold text-slate-900`
- Email input: full-width, standard input styling
- "Send Magic Link" button: full-width primary blue
- MFA: 6-digit input boxes with `font-mono text-2xl text-center`

## 6.7 Conversation Mode

**File**: `src/app/(portal)/assessment/[id]/conversation/page.tsx`

**Target styling**:
- Chat-like layout: messages in bubbles
- System messages: `bg-slate-100 rounded-lg` (left-aligned)
- User responses: `bg-blue-50 rounded-lg` (right-aligned)
- Decision tree nodes: white cards with radio options
- Classification result: colored badge matching Module 2.1

## 6.8 Empty States

Search all page components for empty states (when no data exists). Ensure consistent pattern:
- Centered in the content area
- Large icon (48px, `text-slate-300`) from Lucide
- Title: `text-lg font-medium text-slate-500`
- Description: `text-sm text-slate-400`
- CTA button if applicable

```bash
grep -rn "empty\|no.*found\|nothing\|get started" src/components/ src/app/ --include="*.tsx" -l
```

## 6.9 Loading Skeletons

Search for `animate-pulse` patterns and ensure:
- Skeleton blocks use `bg-slate-200 rounded` (not `bg-muted`)
- Card skeletons match the real card dimensions
- Table row skeletons use alternating heights

## 6.10 Verification

```bash
pnpm build && pnpm typecheck
```

**Visual check**:
1. Click notification bell — panel dropdown
2. Open a workshop — facilitation mode
3. Activity log — timeline entries
4. Sign-off page — 3-slot layout
5. Report page — card grid
6. Login page — centered card
7. Conversation mode — chat bubbles
8. Any page with no data — empty state

---

# Post-Completion Audit

After all 6 modules are complete, run a full audit:

```bash
# 1. Build and type check
pnpm build && pnpm typecheck

# 2. Search for any remaining dark mode artifacts
grep -rn "dark:" src/components/ src/app/ --include="*.tsx" | grep -v "node_modules\|\.next" | head -50

# 3. Search for hardcoded dark colors
grep -rn "bg-zinc-\|bg-neutral-[89]\|bg-gray-[89]\|bg-slate-[89]" src/components/ src/app/ --include="*.tsx" | head -30

# 4. Search for inconsistent status colors
grep -rn "bg-green-[0-9]*.*text-green" src/components/ --include="*.tsx" | head -20
```

**Items 2 and 3**: Any `dark:` prefixed classes are now dead code (since we forced light theme). They're harmless but can be cleaned up for code hygiene. Do NOT remove them in this spec — that's a separate cleanup task.

**Item 4**: Verify all status color usage is consistent with Module 2.1.

---

# What This Spec Does NOT Cover

Be explicit about the boundaries:

1. **No backend changes** — zero API routes, Prisma models, or business logic modified
2. **No new features** — no BPMN enhancement, no new components that don't exist
3. **No mobile-specific redesign** — responsive behavior follows existing breakpoints
4. **No animation changes** — existing transitions and skeletons stay as-is
5. **No role-variant documentation** — this spec shows one visual state per screen, not all 11 role variants
6. **No dark mode removal** — dark mode CSS stays in globals.css as dead code
7. **No font changes** — the codebase uses Geist Sans/Mono (not DM Sans/JetBrains Mono from the reference HTML). Changing fonts would break the Geist font loading in layout.tsx. Keep Geist.
8. **No Storybook or component catalog** — this is a reskin, not a design system refactor

---

# Execution Instructions for Claude Code CLI

When prompting Claude Code CLI with this spec:

1. **Prompt one module at a time**: "Execute Module 1 of the ABEAM UI Reskin Spec. The spec is at `specs/ABEAM-V2-UI-RESKIN-SPEC.md`. Read it first, then implement only Module 1."

2. **Verify between modules**: After each module, run `pnpm build && pnpm typecheck`. If either fails, tell Claude Code to fix the errors before proceeding.

3. **Provide the reference HTML**: Place the reference HTML document at `specs/ABEAM-V2-Complete-Screen-UI.html` so Claude Code can view it for visual reference when ambiguity arises.

4. **If a component file doesn't exist at the specified path**: The component may have been renamed or moved. Search for it by name: `find src/ -name "ComponentName*"`. Update the path and proceed.

5. **If a change would break TypeScript**: The change is probably touching component logic, not just styling. Revert it and skip that specific change.

6. **Expected duration per module**:
   - M1: 15-20 minutes
   - M2: 30-45 minutes
   - M3: 20-30 minutes
   - M4: 60-90 minutes
   - M5: 45-60 minutes
   - M6: 45-60 minutes
   - Total: ~4-5 hours of Claude Code CLI time
