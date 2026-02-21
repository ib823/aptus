# Phase 23: Intelligent Dashboard

## 1. Overview

Replace the current single-view dashboard (`/dashboard`) with a role-aware, widget-based dashboard that shows each user what matters most to their role. The existing dashboard displays a flat list of assessment cards with scope/step progress bars and a recent activity panel. The V2 dashboard adds:

1. **Role-specific dashboard variants** with tailored widgets per role
2. **"What Needs Attention" section** surfacing items requiring the user's action
3. **Assessment progress heatmap** showing completion across functional areas
4. **Cross-area conflict summary** highlighting contradictions between reviewers
5. **Deadline tracking** with visual timeline
6. **Activity feed** filtered by role relevance
7. **KPI metrics** (FIT rate, cost projection, risk count) for executives
8. **Mobile-optimized layout** with responsive grid and collapsible widgets
9. **Customizable widget layout** allowing users to show/hide and reorder widgets

The current dashboard at `src/app/(portal)/dashboard/page.tsx` will be refactored from a monolithic RSC page into a widget-composition architecture where the server page resolves the user's role and provides the appropriate widget configuration, and each widget is a self-contained async component or client component.

## 2. Dependencies

### Upstream (must exist before this phase)
- **Phase 1-4 (Core Assessment)**: Assessment, ScopeSelection, StepResponse models
- **Phase 5 (Gap Resolution)**: GapResolution model (gap counts for KPIs)
- **Phase 14 (Integration Register)**: IntegrationPoint model (IT Lead dashboard)
- **Phase 15 (Data Migration Register)**: DataMigrationObject model (IT Lead dashboard)
- **Phase 16 (OCM Impact Register)**: OcmImpact model (executive KPIs)
- **Phase 17 (Role System)**: Full role hierarchy and organization model

### Downstream (phases that depend on this)
- **Phase 24 (Onboarding)**: Onboarding flows land users on their role-specific dashboard
- **Phase 22 (Conversation Mode)**: Dashboard can show conversation session progress

### External Dependencies
- None (uses existing shadcn/ui components; heatmap and timeline rendered with CSS Grid + Tailwind)

## 3. Data Model Changes

### New Models

```prisma
model DashboardWidget {
  id         String  @id @default(cuid())
  userId     String
  widgetType String  // "progress" | "attention" | "activity" | "deadlines" | "conflicts" | "kpi" | "heatmap" | "gaps" | "integration" | "migration"
  position   Int
  settings   Json?   // Widget-specific config: { assessmentId?, collapsed?, dateRange? }
  isVisible  Boolean @default(true)

  user User @relation(fields: [userId], references: [id])
  @@index([userId])
  @@index([userId, isVisible])
}

model DashboardDeadline {
  id           String   @id @default(cuid())
  assessmentId String
  title        String
  description  String?  @db.Text
  dueDate      DateTime
  assignedRole String?  // Role that owns this deadline
  assignedUser String?  // Specific user, if applicable
  status       String   @default("pending") // "pending" | "at_risk" | "overdue" | "completed"
  completedAt  DateTime?
  createdBy    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([assessmentId])
  @@index([dueDate])
  @@index([assignedRole])
  @@index([status])
}
```

### Zod Schemas

```typescript
import { z } from "zod";

export const widgetTypeSchema = z.enum([
  "progress",
  "attention",
  "activity",
  "deadlines",
  "conflicts",
  "kpi",
  "heatmap",
  "gaps",
  "integration",
  "migration",
  "sign_off_queue",
  "resource_allocation",
]);

export const widgetSettingsSchema = z.object({
  assessmentId: z.string().optional(),
  collapsed: z.boolean().default(false),
  dateRange: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
  maxItems: z.number().int().min(1).max(50).default(10),
}).partial();

export const updateWidgetLayoutSchema = z.object({
  widgets: z.array(z.object({
    id: z.string(),
    position: z.number().int().min(0),
    isVisible: z.boolean(),
    settings: widgetSettingsSchema.optional(),
  })),
});

export const createDeadlineSchema = z.object({
  assessmentId: z.string(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime(),
  assignedRole: z.string().optional(),
  assignedUser: z.string().optional(),
});

export const attentionItemSchema = z.object({
  id: z.string(),
  type: z.enum([
    "pending_steps",
    "unresolved_gaps",
    "pending_sign_off",
    "overdue_deadline",
    "conflict",
    "stale_assessment",
    "low_confidence_classification",
  ]),
  title: z.string(),
  description: z.string(),
  assessmentId: z.string(),
  assessmentName: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  actionUrl: z.string(),
  createdAt: z.string().datetime(),
});

export const kpiMetricsSchema = z.object({
  assessmentId: z.string(),
  fitRate: z.number().min(0).max(100),
  totalSteps: z.number().int(),
  reviewedSteps: z.number().int(),
  gapCount: z.number().int(),
  resolvedGapCount: z.number().int(),
  totalEffortDays: z.number(),
  estimatedCost: z.number().optional(),
  riskCount: z.object({
    high: z.number().int(),
    medium: z.number().int(),
    low: z.number().int(),
  }),
  integrationCount: z.number().int().optional(),
  migrationObjectCount: z.number().int().optional(),
  ocmImpactCount: z.number().int().optional(),
  completionPercent: z.number().min(0).max(100),
});
```

### Migration

```sql
-- CreateTable: DashboardWidget
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "settings" JSONB,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardWidget_userId_idx" ON "DashboardWidget"("userId");
CREATE INDEX "DashboardWidget_userId_isVisible_idx" ON "DashboardWidget"("userId", "isVisible");

ALTER TABLE "DashboardWidget"
  ADD CONSTRAINT "DashboardWidget_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- CreateTable: DashboardDeadline
CREATE TABLE "DashboardDeadline" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedRole" TEXT,
    "assignedUser" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DashboardDeadline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DashboardDeadline_assessmentId_idx" ON "DashboardDeadline"("assessmentId");
CREATE INDEX "DashboardDeadline_dueDate_idx" ON "DashboardDeadline"("dueDate");
CREATE INDEX "DashboardDeadline_assignedRole_idx" ON "DashboardDeadline"("assignedRole");
CREATE INDEX "DashboardDeadline_status_idx" ON "DashboardDeadline"("status");
```

## 4. API Routes

### `GET /api/dashboard`
Returns the role-aware dashboard configuration and data for the current user.

**Auth**: Requires authenticated session.

**Query Params**: `?assessmentId=<optional>` to focus on a single assessment.

**Response** `200`:
```typescript
{
  role: string;
  widgets: Array<{
    id: string;
    widgetType: string;
    position: number;
    isVisible: boolean;
    settings: WidgetSettings | null;
  }>;
  data: {
    assessments: AssessmentSummary[];
    attentionItems: AttentionItem[];
    recentActivity: ActivityItem[];
    deadlines: DashboardDeadline[];
    kpi: KpiMetrics | null; // Only for executive/PM roles
  };
}
```

### `GET /api/dashboard/attention`
Returns prioritized "What Needs Attention" items for the current user.

**Auth**: Requires authenticated session.

**Response** `200`:
```typescript
{
  items: AttentionItem[];
  total: number;
  bySeverity: { info: number; warning: number; critical: number };
}
```

The attention engine evaluates:
- Steps assigned to user's areas that are still PENDING
- Gaps in user's areas without resolution
- Deadlines due within 7 days
- Conflicts between reviewers on the same step
- Assessments with no activity in >14 days ("stale")
- Sign-offs pending the user's role

### `GET /api/dashboard/activity`
Returns recent activity filtered by the user's role relevance.

**Auth**: Requires authenticated session.

**Query Params**: `?limit=20&offset=0&assessmentId=<optional>`

**Response** `200`:
```typescript
{
  activities: Array<{
    id: string;
    type: string;
    actor: string;
    actorRole: string;
    description: string;
    assessmentId: string;
    assessmentName: string;
    entityType: string;
    entityId: string;
    timestamp: string;
  }>;
  hasMore: boolean;
}
```

### `PUT /api/dashboard/widgets`
Update the user's widget layout (reorder, show/hide, settings).

**Auth**: Requires authenticated session.

**Request Body**: `updateWidgetLayoutSchema`

**Response** `200`: Updated widget array.

### `GET /api/dashboard/kpi/[assessmentId]`
KPI metrics for a specific assessment. Available to `executive_sponsor`, `project_manager`, `partner_lead`, `platform_admin`, `consultant`.

**Auth**: Requires authenticated session. User must have access to the assessment.

**Response** `200`: `KpiMetrics`

### `POST /api/dashboard/deadlines`
Create a deadline for an assessment.

**Auth**: `project_manager`, `partner_lead`, `consultant`, `platform_admin`.

**Request Body**: `createDeadlineSchema`

**Response** `201`: Created deadline.

### `PUT /api/dashboard/deadlines/[deadlineId]`
Update a deadline (status, due date, etc.).

**Auth**: `project_manager`, `partner_lead`, `consultant`, `platform_admin`.

**Response** `200`: Updated deadline.

### `GET /api/dashboard/heatmap/[assessmentId]`
Returns assessment completion data structured for heatmap rendering.

**Auth**: Requires authenticated session. User must have access to the assessment.

**Response** `200`:
```typescript
{
  areas: Array<{
    functionalArea: string;
    scopeItems: Array<{
      id: string;
      name: string;
      totalSteps: number;
      reviewedSteps: number;
      fitCount: number;
      configureCount: number;
      gapCount: number;
      naCount: number;
      pendingCount: number;
      completionPercent: number;
    }>;
    aggregated: {
      totalSteps: number;
      reviewedSteps: number;
      completionPercent: number;
      fitRate: number;
    };
  }>;
}
```

## 5. UI Components

### DashboardShell
Location: `src/components/dashboard/DashboardShell.tsx`

The top-level layout component that renders the widget grid. Takes the role-specific widget configuration and renders each widget in position order. Handles responsive layout: 3 columns on desktop, 2 on tablet, 1 on mobile.

```typescript
interface DashboardShellProps {
  role: string;
  widgets: DashboardWidgetConfig[];
  children?: React.ReactNode;
}
```

Uses: CSS Grid, `Card` (shadcn/ui), responsive Tailwind breakpoints (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`).

### AttentionWidget
Location: `src/components/dashboard/AttentionWidget.tsx`

"What Needs Attention" panel. Shows a prioritized list of items requiring the user's action, grouped by severity (critical first). Each item is clickable and navigates to the relevant page.

```typescript
interface AttentionWidgetProps {
  items: AttentionItem[];
  maxItems?: number;
}
```

Uses: `Card`, `Badge` (severity colors), `Button` (action links), `ScrollArea` (shadcn/ui). Colors: critical = `bg-red-50 border-red-200`, warning = `bg-amber-50 border-amber-200`, info = `bg-blue-50 border-blue-200`.

### ProgressHeatmap
Location: `src/components/dashboard/ProgressHeatmap.tsx`

Heatmap grid showing assessment completion by functional area and scope item. Each cell is colored by completion percentage (gradient from `bg-red-100` through `bg-amber-100` to `bg-green-100`). Hovering shows detailed counts. Clicking navigates to that scope item's review.

```typescript
interface ProgressHeatmapProps {
  assessmentId: string;
  areas: HeatmapArea[];
}
```

Uses: CSS Grid, `Tooltip` (shadcn/ui), `Card`, design token colors.

### KpiPanel
Location: `src/components/dashboard/KpiPanel.tsx`

Executive KPI display with large metric cards: FIT rate (%), total gaps, effort days, risk count, completion %. Follows the existing `StatCard` pattern from `ReportClient.tsx`.

```typescript
interface KpiPanelProps {
  metrics: KpiMetrics;
  assessmentName: string;
}
```

Uses: `Card`, `Badge`, `Progress` (shadcn/ui), trend indicators (arrow up/down icons).

### DeadlineTimeline
Location: `src/components/dashboard/DeadlineTimeline.tsx`

Vertical or horizontal timeline showing upcoming deadlines. Items colored by status: pending = `text-muted-foreground`, at_risk = `text-amber-600`, overdue = `text-red-600`, completed = `text-green-600`.

```typescript
interface DeadlineTimelineProps {
  deadlines: DashboardDeadline[];
  onStatusChange?: (id: string, status: string) => void;
}
```

Uses: `Card`, `Badge`, `Button`, custom timeline CSS with vertical line + dots.

### ActivityFeed
Location: `src/components/dashboard/ActivityFeed.tsx`

Real-time-style activity stream. Each entry shows actor avatar initial, action description, assessment name, and relative timestamp. Replaces and extends the existing `RecentActivityPanel`.

```typescript
interface ActivityFeedProps {
  activities: ActivityItem[];
  hasMore: boolean;
  onLoadMore: () => void;
}
```

Uses: `Card`, `Avatar` (shadcn/ui), `ScrollArea`, `Button` (load more), relative time formatting.

### WidgetCustomizer
Location: `src/components/dashboard/WidgetCustomizer.tsx`

Dropdown or sheet UI for users to show/hide widgets and reorder them. Available via a "Customize" button in the dashboard header.

```typescript
interface WidgetCustomizerProps {
  widgets: DashboardWidgetConfig[];
  onSave: (widgets: DashboardWidgetConfig[]) => void;
}
```

Uses: `Sheet` (shadcn/ui), `Switch` (show/hide), drag handle icons, `Button`.

### ConflictSummaryWidget
Location: `src/components/dashboard/ConflictSummaryWidget.tsx`

Shows cross-area conflicts: cases where different reviewers classified the same step differently, or where a step's classification contradicts the pattern in its functional area. Links to the conflict resolution page.

```typescript
interface ConflictSummaryWidgetProps {
  conflicts: Array<{
    assessmentId: string;
    scopeItemId: string;
    processStepId: string;
    stepTitle: string;
    classifications: Array<{ reviewer: string; classification: string; timestamp: string }>;
  }>;
}
```

Uses: `Card`, `Badge`, `Table` (shadcn/ui).

## 6. Business Logic

### Default Widget Configuration by Role

When a user first accesses the dashboard (no `DashboardWidget` records exist), the system auto-creates default widgets based on their role:

```typescript
const DEFAULT_WIDGETS: Record<string, Array<{ widgetType: string; position: number }>> = {
  consultant: [
    { widgetType: "attention", position: 0 },
    { widgetType: "progress", position: 1 },
    { widgetType: "gaps", position: 2 },
    { widgetType: "conflicts", position: 3 },
    { widgetType: "activity", position: 4 },
    { widgetType: "deadlines", position: 5 },
  ],
  project_manager: [
    { widgetType: "attention", position: 0 },
    { widgetType: "kpi", position: 1 },
    { widgetType: "deadlines", position: 2 },
    { widgetType: "heatmap", position: 3 },
    { widgetType: "resource_allocation", position: 4 },
    { widgetType: "activity", position: 5 },
  ],
  process_owner: [
    { widgetType: "attention", position: 0 },
    { widgetType: "progress", position: 1 },
    { widgetType: "activity", position: 2 },
  ],
  executive_sponsor: [
    { widgetType: "kpi", position: 0 },
    { widgetType: "sign_off_queue", position: 1 },
    { widgetType: "heatmap", position: 2 },
    { widgetType: "activity", position: 3 },
  ],
  it_lead: [
    { widgetType: "attention", position: 0 },
    { widgetType: "integration", position: 1 },
    { widgetType: "migration", position: 2 },
    { widgetType: "gaps", position: 3 },
    { widgetType: "activity", position: 4 },
  ],
  solution_architect: [
    { widgetType: "attention", position: 0 },
    { widgetType: "heatmap", position: 1 },
    { widgetType: "gaps", position: 2 },
    { widgetType: "integration", position: 3 },
    { widgetType: "activity", position: 4 },
  ],
  partner_lead: [
    { widgetType: "kpi", position: 0 },
    { widgetType: "attention", position: 1 },
    { widgetType: "progress", position: 2 },
    { widgetType: "deadlines", position: 3 },
    { widgetType: "activity", position: 4 },
  ],
  platform_admin: [
    { widgetType: "kpi", position: 0 },
    { widgetType: "attention", position: 1 },
    { widgetType: "activity", position: 2 },
  ],
  // viewer, client_admin, data_migration_lead use subsets
  viewer: [
    { widgetType: "progress", position: 0 },
    { widgetType: "activity", position: 1 },
  ],
  client_admin: [
    { widgetType: "attention", position: 0 },
    { widgetType: "progress", position: 1 },
    { widgetType: "kpi", position: 2 },
    { widgetType: "activity", position: 3 },
  ],
  data_migration_lead: [
    { widgetType: "attention", position: 0 },
    { widgetType: "migration", position: 1 },
    { widgetType: "activity", position: 2 },
  ],
};
```

### Attention Engine

The attention engine runs server-side and produces a prioritized list of `AttentionItem` objects:

```typescript
async function computeAttentionItems(
  userId: string,
  role: string,
  organizationId: string | null,
  assignedAreas: string[],
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  // 1. Pending steps in user's assigned areas
  // 2. Unresolved gaps in user's areas (for consultants/solution_architects)
  // 3. Overdue deadlines assigned to user or user's role
  // 4. Pending sign-offs for user's role
  // 5. Stale assessments (no activity in 14+ days)
  // 6. Cross-reviewer conflicts on same step

  // Sort: critical first, then warning, then info
  // Within same severity: most recent first
  return items.sort(priorityComparator);
}
```

### Activity Filtering by Role

The activity feed filters `DecisionLogEntry` records by role relevance:
- **Consultant**: sees all activity across their assessments
- **Process Owner**: sees activity only in their assigned functional areas
- **Executive Sponsor**: sees sign-offs, status changes, and KPI-affecting events
- **IT Lead**: sees integration and data migration activity
- **PM**: sees all activity with emphasis on deadline and status changes

### Heatmap Aggregation

The heatmap data is aggregated from `StepResponse` records grouped by `ScopeItem.functionalArea`:

```typescript
// Completion color logic
function getHeatmapColor(completionPercent: number): string {
  if (completionPercent === 0) return "bg-gray-100";
  if (completionPercent < 25) return "bg-red-100";
  if (completionPercent < 50) return "bg-orange-100";
  if (completionPercent < 75) return "bg-amber-100";
  if (completionPercent < 100) return "bg-lime-100";
  return "bg-green-100";
}
```

## 7. Permissions & Access Control

| Action | Roles Allowed |
|--------|---------------|
| View own dashboard | All authenticated roles |
| Customize widget layout | All authenticated roles |
| View KPI metrics | `executive_sponsor`, `project_manager`, `partner_lead`, `platform_admin`, `consultant` |
| View all assessments in portfolio | `partner_lead`, `platform_admin`, `project_manager` |
| View only assigned assessments | `process_owner`, `executive_sponsor`, `it_lead`, `data_migration_lead`, `viewer` |
| Create/edit deadlines | `project_manager`, `partner_lead`, `consultant`, `platform_admin` |
| View conflict summary | `consultant`, `solution_architect`, `partner_lead`, `platform_admin`, `project_manager` |
| View integration/migration widgets | `it_lead`, `data_migration_lead`, `solution_architect`, `consultant`, `platform_admin` |

### Data Scoping Rules
- **Organization Isolation**: Users only see assessments belonging to their `organizationId`.
- **Process Owner Area Filtering**: Process owners see only data from their `assignedAreas` on the `AssessmentStakeholder` record.
- **Cross-Assessment Visibility**: `partner_lead` and `platform_admin` can see assessments across all organizations.

## 8. Notification Triggers

| Event | Recipients | Channel |
|-------|-----------|---------|
| Deadline approaching (3 days) | Assigned user/role | In-app notification + email |
| Deadline overdue | Assigned user/role + PM | In-app notification + email |
| New critical attention item | Relevant user | In-app notification |
| Dashboard widget added/removed by admin | Affected user | None (silent) |
| Assessment becomes stale (14 days inactive) | Consultant + PM | In-app notification |

## 9. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| User has no assessments | Show empty state with CTA to create first assessment (consultant) or "Waiting for invitation" (process owner) |
| User role not in default widget map | Fall back to `viewer` widget set |
| Widget data fails to load | Individual widget shows error state with retry button; other widgets unaffected |
| Assessment has zero steps reviewed | Heatmap shows all gray; KPI panel shows 0% with "Assessment Not Started" label |
| User assigned to 0 areas (process owner) | Attention widget shows "No areas assigned - contact your project manager" |
| Concurrent widget layout updates | Last-write-wins on `PUT /api/dashboard/widgets`; no optimistic locking needed for personal preferences |
| Deadline in the past when created | Reject with 400: "Due date must be in the future" |
| Very large organization (100+ assessments) | Paginate assessment list in portfolio view; heatmap shows only selected assessment |
| Activity feed with 10k+ entries | Server-side pagination with `limit/offset`; default limit 20 |

## 10. Performance Considerations

- **Parallel Data Loading**: The dashboard page uses `Promise.all` to load widget data in parallel. Each widget's data source is independent.
- **React Suspense per Widget**: Each widget is wrapped in `<Suspense fallback={<CardSkeleton />}>` so widgets render independently as their data arrives. This follows the existing pattern in `dashboard/page.tsx`.
- **Cached Queries**: KPI metrics and heatmap data use `unstable_cache` with 5-minute TTL, invalidated on StepResponse/GapResolution writes.
- **Attention Engine Optimization**: The attention engine runs a fixed set of aggregate queries, not per-item queries. Expected query count: 5-7 regardless of data volume.
- **Widget Layout**: Widget configuration is a small JSON payload (~1KB). Loaded once per page visit and cached in-memory.
- **Activity Feed**: Uses cursor-based pagination on `DecisionLogEntry.timestamp` index for efficient scrolling.
- **Heatmap Data**: Aggregated server-side with a single query grouping by `functionalArea`. Result set is small (typically 8-15 functional areas, each with 5-20 scope items).

## 11. Testing Strategy

### Unit Tests
- Default widget configuration generation per role
- Attention engine: verify correct items produced for each role
- Activity filtering: process owner sees only their areas, IT lead sees only technical events
- Heatmap color calculation from completion percentages
- KPI metric computation from raw data

### Integration Tests
- `GET /api/dashboard`: returns role-appropriate widgets and data for each of the 11 roles
- `PUT /api/dashboard/widgets`: persists layout changes and retrieves updated layout
- `GET /api/dashboard/attention`: returns correct attention items for process owner vs. consultant
- `GET /api/dashboard/kpi/[assessmentId]`: returns accurate metrics, rejects unauthorized roles
- Organization isolation: consultant in Org A cannot see Org B's assessments

### E2E Tests
- Consultant logs in, sees consultant dashboard variant with attention + progress + gaps + activity
- Process owner logs in, sees only their assigned areas in attention items
- Executive sponsor sees KPI panel and sign-off queue
- User customizes widget layout (hide activity, reorder KPI), refreshes page, layout persists
- Mobile viewport (375px): widgets stack vertically, no horizontal overflow

### Performance Tests
- Dashboard load time with 50 assessments, 10k step responses: target <2s
- Attention engine with 100 pending items: target <500ms
- Heatmap query with 200 scope items: target <300ms

## 12. Migration & Seed Data

### Migration Steps
1. Run `npx prisma migrate dev --name add_intelligent_dashboard` to create `DashboardWidget` and `DashboardDeadline` tables.
2. No data migration for existing users (default widgets are auto-created on first dashboard visit).

### Seed Data
```typescript
// Sample deadlines for demo assessment
const sampleDeadlines = [
  {
    title: "Complete Scope Selection",
    description: "All scope items must be marked as selected or excluded.",
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    assignedRole: "consultant",
    status: "pending",
  },
  {
    title: "Process Owner Step Review",
    description: "All process owners must complete step classification for their assigned areas.",
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
    assignedRole: "process_owner",
    status: "pending",
  },
  {
    title: "Executive Sign-Off",
    description: "Executive sponsor reviews and signs off on final assessment.",
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    assignedRole: "executive_sponsor",
    status: "pending",
  },
];
```

## 13. Open Questions

1. **Real-Time Updates**: Should the dashboard poll for updates, use server-sent events, or require manual refresh? SSE adds complexity but improves UX for multi-user assessments. Recommended: start with 60-second polling via `setInterval` + `router.refresh()`, upgrade to SSE in V3.
2. **Widget Drag-and-Drop**: Should users be able to drag widgets to reorder, or is a simpler up/down button sufficient? Drag-and-drop requires a library like `@dnd-kit` (adds ~15KB). Recommended: start with up/down buttons.
3. **Cross-Assessment Comparison**: PMs may want to compare two assessments side-by-side. Is this in scope for V2 or deferred? Recommended: defer to V3.
4. **Conflict Detection Algorithm**: How do we define a "conflict"? Is it only when two stakeholders explicitly disagree on the same step, or also when a classification deviates from the area's dominant pattern? Recommended: start with explicit disagreements only.
5. **Dashboard Data Export**: Should users be able to export their dashboard view as a PDF or screenshot? Recommended: defer to V3.
6. **Notification Preferences**: Should users be able to configure which attention items trigger notifications? Recommended: yes, add a simple toggle per attention type in widget settings.

## 14. Acceptance Criteria (Given/When/Then)

### AC-23.1: Role-Specific Default Dashboard
```
Given a consultant logs in for the first time
  And no DashboardWidget records exist for their userId
When they navigate to /dashboard
Then DashboardWidget records are auto-created with the consultant default set:
  attention (pos 0), progress (pos 1), gaps (pos 2), conflicts (pos 3), activity (pos 4), deadlines (pos 5)
  And all 6 widgets render with appropriate data
```

### AC-23.2: Process Owner Scoped View
```
Given a process owner assigned to areas ["Finance", "Procurement"]
  And the assessment has 15 scope items across 5 functional areas
When they view their dashboard
Then the AttentionWidget shows only pending steps from Finance and Procurement scope items
  And the ProgressHeatmap highlights only Finance and Procurement rows
  And the ActivityFeed shows only activity from Finance and Procurement areas
```

### AC-23.3: Executive KPI Panel
```
Given an executive sponsor viewing the dashboard
  And the assessment has:
    - 200 steps total, 180 reviewed
    - FIT rate: 72%
    - 15 gaps, 8 resolved
    - Total effort: 120 days
When the KPI panel renders
Then it shows:
  - FIT Rate: 72% (green if >=70%, amber if >=50%, red if <50%)
  - Steps: 180/200 (90% complete)
  - Gaps: 15 (8 resolved)
  - Effort: 120 days
  - Completion: 90%
```

### AC-23.4: Attention Items Priority
```
Given a consultant's dashboard
  And there are 3 attention items:
    - 1 overdue deadline (critical)
    - 1 unresolved high-risk gap (warning)
    - 1 stale assessment (info)
When the AttentionWidget renders
Then items are ordered: overdue deadline first, then gap, then stale assessment
  And the critical item has a red left-border accent
  And the warning item has an amber left-border accent
```

### AC-23.5: Widget Customization
```
Given a user viewing their dashboard with 5 visible widgets
When they click "Customize" and hide the "Activity" widget and move "KPI" to position 0
  And click "Save"
Then the dashboard re-renders with 4 widgets
  And KPI is first
  And on page refresh, the layout persists
```

### AC-23.6: Heatmap Navigation
```
Given a consultant viewing the ProgressHeatmap for assessment "Acme Corp"
  And scope item J60 (Accounts Payable) shows 60% completion
When they click on the J60 cell
Then they navigate to /assessment/[id]/review?scopeItem=J60
```

### AC-23.7: Deadline Tracking
```
Given a PM creates a deadline "Process Owner Review Complete" due in 3 days
  And assigns it to role "process_owner"
When the deadline is 3 days away
Then a notification is sent to all process owners on the assessment
  And the deadline appears in the DeadlineTimeline with amber "at risk" status
```

### AC-23.8: Mobile Layout
```
Given a user viewing the dashboard on a 375px wide viewport
When the page renders
Then all widgets stack in a single column
  And no horizontal scrolling occurs
  And each widget is full-width with appropriate padding
```

### AC-23.9: Empty State
```
Given a newly invited process owner with no assessments started
When they view the dashboard
Then the AttentionWidget shows "No items need your attention yet"
  And the ProgressHeatmap shows an EmptyState with "Assessment not started"
```

## 15. Size Estimate

**Size: L (Large)**

| Component | Effort |
|-----------|--------|
| Data model + migration | 0.5 days |
| `GET /api/dashboard` (role-aware data assembly) | 2 days |
| Attention engine (compute + filter logic) | 1.5 days |
| Activity feed API + filtering | 1 day |
| KPI metrics API + computation | 1 day |
| Heatmap API + aggregation | 0.5 days |
| Deadline CRUD API | 0.5 days |
| Widget layout API | 0.5 days |
| DashboardShell + responsive grid | 1 day |
| AttentionWidget | 0.5 days |
| ProgressHeatmap | 1 day |
| KpiPanel | 0.5 days |
| DeadlineTimeline | 0.5 days |
| ActivityFeed (extends RecentActivityPanel) | 0.5 days |
| WidgetCustomizer | 0.5 days |
| ConflictSummaryWidget | 0.5 days |
| Unit + integration tests | 2 days |
| E2E tests | 1 day |
| **Total** | **~15.5 days** |

## 16. Phase Completion Checklist

- [ ] `DashboardWidget` and `DashboardDeadline` tables created and migrated
- [ ] Zod schemas for widget config, attention items, KPI metrics validated
- [ ] Default widget sets defined for all 11 roles
- [ ] `GET /api/dashboard` returns role-appropriate widget config and data
- [ ] `GET /api/dashboard/attention` returns prioritized attention items
- [ ] `GET /api/dashboard/activity` returns role-filtered activity feed with pagination
- [ ] `PUT /api/dashboard/widgets` persists user's custom layout
- [ ] `GET /api/dashboard/kpi/[assessmentId]` returns accurate KPI metrics
- [ ] `GET /api/dashboard/heatmap/[assessmentId]` returns completion data by area
- [ ] Deadline CRUD endpoints functional
- [ ] DashboardShell renders responsive widget grid (1/2/3 column breakpoints)
- [ ] AttentionWidget shows prioritized items with severity colors
- [ ] ProgressHeatmap renders completion grid with color gradient
- [ ] KpiPanel displays FIT rate, gaps, effort, completion with correct formatting
- [ ] DeadlineTimeline shows upcoming deadlines with status colors
- [ ] ActivityFeed renders paginated activity with role filtering
- [ ] WidgetCustomizer allows show/hide and reorder of widgets
- [ ] ConflictSummaryWidget displays cross-reviewer conflicts
- [ ] Auto-creation of default widgets on first dashboard visit
- [ ] Process owner sees only assigned areas in all widgets
- [ ] Organization isolation: users cannot see other orgs' data
- [ ] Mobile layout verified at 375px (single column, no overflow)
- [ ] Unit tests: attention engine, KPI computation, heatmap colors
- [ ] Integration tests: all API routes with role permutations
- [ ] E2E tests: consultant, process owner, executive dashboards
