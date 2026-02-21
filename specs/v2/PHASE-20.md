# Phase 20: Process Visualization

## 1. Overview

Enhance the existing flow diagram system with interactive process maps, drill-down capability, functional area overview, and mobile-optimized rendering. The current implementation consists of a `ProcessFlowDiagram` model storing static SVG, a `generateFlowSvg()` function producing sequential annotated diagrams, and a `FlowViewerClient.tsx` component rendering SVGs in a read-only viewer. This phase adds interactivity, multi-level visualization, risk overlays, and enhanced export capabilities.

**Source**: V2 Brief Section A5.8 + Addendum 1 Section 7 (mobile viz)

### Goals
- Make flow diagram nodes interactive: clickable nodes open step detail panels
- Build a functional-area overview map showing all scope items with completion/risk heatmap
- Visualize cross-area dependencies between scope items
- Optimize SVG rendering for mobile with responsive viewBox, pinch-zoom, and pan
- Enhance PDF export with clickable hyperlinks and PNG raster export
- Add risk-level color overlay atop existing classification color coding
- Generate thumbnail SVGs for overview cards and dashboards

---

## 2. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Existing `ProcessFlowDiagram` model | Schema | Extended with `interactiveData` and `thumbnailSvg` fields |
| Existing `flow-diagram.ts` (`generateFlowSvg()`) | Code | Enhanced to emit interactive data alongside SVG |
| Existing `FlowViewerClient.tsx` | Code | Refactored to support interactive SVG and mobile gestures |
| `ScopeItem`, `ProcessStep`, `StepResponse`, `GapResolution` | Schema | Data source for diagram generation |
| `ScopeSelection` | Schema | Determines which scope items are in-scope for the assessment |
| Phase 18 (Assessment Lifecycle) | Phase | Phase progress data used in functional area overview |
| shadcn/ui | Library | Dialog, Popover, Card components for step detail panel |
| Tailwind v4 | CSS | Responsive styles for mobile layout |
| `@use-gesture/react` or equivalent | Library | Pinch-zoom and pan gesture handling |
| `html-to-image` or `dom-to-image-more` | Library | PNG raster export from SVG |

---

## 3. Data Model Changes

### Modified: `ProcessFlowDiagram`

```prisma
model ProcessFlowDiagram {
  // ... all existing fields unchanged ...

  // New fields
  interactiveData   Json?     @db.JsonB   // Node positions, links, metadata for interactive rendering
  thumbnailSvg      String?   @db.Text    // Simplified SVG for overview cards (< 10KB)
  riskOverlayData   Json?     @db.JsonB   // Risk-level data per node for overlay rendering
  layoutVersion     Int       @default(1) // Versioning for layout algorithm changes
}
```

### New: `FunctionalAreaOverview`

```prisma
model FunctionalAreaOverview {
  id              String   @id @default(cuid())
  assessmentId    String
  functionalArea  String
  totalScopeItems Int      @default(0)
  selectedCount   Int      @default(0)
  fitCount        Int      @default(0)
  configureCount  Int      @default(0)
  gapCount        Int      @default(0)
  pendingCount    Int      @default(0)
  riskScore       Float    @default(0)   // 0.0-1.0 computed from gap density + resolution complexity
  completionPct   Float    @default(0)
  crossAreaDeps   String[] @default([])  // IDs of dependent scope items in other functional areas
  generatedAt     DateTime @default(now())

  @@unique([assessmentId, functionalArea])
  @@index([assessmentId])
}
```

### TypeScript Types (`src/types/flow.ts`)

```typescript
export interface InteractiveFlowData {
  version: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewBox: { width: number; height: number };
  layout: "sequential" | "swimlane" | "hierarchical";
}

export interface FlowNode {
  id: string;           // processStepId
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;        // actionTitle (truncated)
  fullLabel: string;    // actionTitle (full)
  stepType: string;
  fitStatus: FitStatus;
  riskLevel?: "low" | "medium" | "high" | "critical";
  sequence: number;
  scopeItemId: string;
  processFlowGroup?: string;
  hasGapResolution: boolean;
  hasClientNote: boolean;
}

export interface FlowEdge {
  id: string;
  source: string;       // source node ID
  target: string;       // target node ID
  type: "sequential" | "conditional" | "parallel" | "cross-area";
  label?: string;
}

export interface FunctionalAreaOverviewData {
  functionalArea: string;
  displayName: string;
  scopeItems: AreaScopeItemSummary[];
  totalSteps: number;
  classificationBreakdown: Record<FitStatus, number>;
  completionPct: number;
  riskScore: number;
  crossAreaDependencies: CrossAreaDep[];
}

export interface AreaScopeItemSummary {
  id: string;
  name: string;
  selected: boolean;
  stepCount: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  pendingCount: number;
  completionPct: number;
  riskScore: number;
}

export interface CrossAreaDep {
  fromArea: string;
  fromScopeItemId: string;
  toArea: string;
  toScopeItemId: string;
  dependencyType: string;  // "data_flow" | "config_prerequisite" | "process_integration"
}
```

### Zod Schemas (`src/lib/validation/flow.ts`)

```typescript
import { z } from "zod";

export const FlowGenerateRequestSchema = z.object({
  scopeItemId: z.string().optional(),         // Generate for specific scope item; omit for all
  regenerate: z.boolean().default(false),      // Force regeneration even if cached
  includeInteractive: z.boolean().default(true),
  includeThumbnail: z.boolean().default(true),
  includeRiskOverlay: z.boolean().default(false),
});

export const FlowExportRequestSchema = z.object({
  format: z.enum(["svg", "pdf", "png"]),
  flowId: z.string().optional(),              // Specific flow; omit for all flows in assessment
  includeRiskOverlay: z.boolean().default(false),
  width: z.number().int().min(800).max(4000).default(1920),  // For PNG export
  height: z.number().int().min(600).max(3000).optional(),     // Auto-computed if omitted
});

export const OverviewQuerySchema = z.object({
  includeUnselected: z.boolean().default(false),
  sortBy: z.enum(["area", "completion", "risk"]).default("area"),
});
```

---

## 4. API Routes

### Flow Diagram Operations

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/assessments/[id]/flows/overview` | Functional area overview data | Stakeholder |
| `POST` | `/api/assessments/[id]/flows/generate` | Generate/regenerate flow diagrams with interactive data | `consultant`, `platform_admin`, `partner_lead` |
| `GET` | `/api/assessments/[id]/flows/[flowId]/interactive` | Interactive flow data (JSON) for client-side rendering | Stakeholder |
| `GET` | `/api/assessments/[id]/flows/[flowId]/svg` | Raw SVG content | Stakeholder |
| `GET` | `/api/assessments/[id]/flows/[flowId]/thumbnail` | Thumbnail SVG | Stakeholder |
| `POST` | `/api/assessments/[id]/flows/[flowId]/export` | Export flow as PDF or PNG | Stakeholder |
| `GET` | `/api/assessments/[id]/flows/cross-area-deps` | Cross-area dependency graph data | Stakeholder |

### Request/Response Examples

**GET `/api/assessments/[id]/flows/overview?sortBy=risk`**
```json
{
  "areas": [
    {
      "functionalArea": "Finance",
      "displayName": "Finance",
      "scopeItems": [
        {
          "id": "J60",
          "name": "Accounts Payable",
          "selected": true,
          "stepCount": 47,
          "fitCount": 30,
          "configureCount": 10,
          "gapCount": 5,
          "pendingCount": 2,
          "completionPct": 95.7,
          "riskScore": 0.35
        }
      ],
      "totalSteps": 312,
      "classificationBreakdown": { "FIT": 200, "CONFIGURE": 70, "GAP": 30, "NA": 12, "PENDING": 0 },
      "completionPct": 100.0,
      "riskScore": 0.35,
      "crossAreaDependencies": [
        {
          "fromArea": "Finance",
          "fromScopeItemId": "J60",
          "toArea": "Procurement",
          "toScopeItemId": "J14",
          "dependencyType": "data_flow"
        }
      ]
    }
  ],
  "generatedAt": "2026-02-21T10:00:00Z"
}
```

**GET `/api/assessments/[id]/flows/[flowId]/interactive`**
```json
{
  "version": 1,
  "nodes": [
    {
      "id": "clx_step_001",
      "x": 30,
      "y": 90,
      "width": 180,
      "height": 50,
      "label": "Create Purchase Order",
      "fullLabel": "Create Purchase Order for Standard Materials",
      "stepType": "Standard",
      "fitStatus": "FIT",
      "riskLevel": "low",
      "sequence": 1,
      "scopeItemId": "J60",
      "hasGapResolution": false,
      "hasClientNote": true
    }
  ],
  "edges": [
    { "id": "e1", "source": "clx_step_001", "target": "clx_step_002", "type": "sequential" }
  ],
  "viewBox": { "width": 920, "height": 400 },
  "layout": "sequential"
}
```

---

## 5. UI Components

### New Components

| Component | Location | Description |
|---|---|---|
| `InteractiveFlowViewer` | `src/components/flows/InteractiveFlowViewer.tsx` | Main interactive SVG viewer with clickable nodes, zoom/pan, mobile gestures |
| `FlowNodePopover` | `src/components/flows/FlowNodePopover.tsx` | Popover showing step details when a node is clicked |
| `FunctionalAreaOverviewMap` | `src/components/flows/FunctionalAreaOverviewMap.tsx` | Birds-eye heatmap of all functional areas with click-to-drill |
| `AreaScopeItemGrid` | `src/components/flows/AreaScopeItemGrid.tsx` | Grid of scope items within a functional area with thumbnails |
| `FlowToolbar` | `src/components/flows/FlowToolbar.tsx` | Zoom controls, fit-to-screen, risk overlay toggle, export dropdown |
| `FlowLegend` | `src/components/flows/FlowLegend.tsx` | Legend panel showing color coding for classification + risk levels |
| `RiskOverlay` | `src/components/flows/RiskOverlay.tsx` | Transparent SVG overlay that adds risk-level borders/badges to nodes |
| `CrossAreaDependencyGraph` | `src/components/flows/CrossAreaDependencyGraph.tsx` | Graph showing inter-area dependencies (lines between functional areas) |
| `FlowExportDialog` | `src/components/flows/FlowExportDialog.tsx` | Dialog for choosing export format and options |
| `FlowThumbnailCard` | `src/components/flows/FlowThumbnailCard.tsx` | Small card showing thumbnail SVG with classification summary |
| `MobileFlowWrapper` | `src/components/flows/MobileFlowWrapper.tsx` | Mobile-specific wrapper with touch gesture handling |

### Modified Components

| Component | Changes |
|---|---|
| `FlowViewerClient.tsx` | Refactored to delegate to `InteractiveFlowViewer`; kept as backward-compatible wrapper |
| Assessment detail page | Add "Process Map" tab linking to functional area overview |
| Dashboard | Show thumbnail cards for active assessments with flow summary |

### InteractiveFlowViewer Behavior

```typescript
/**
 * InteractiveFlowViewer renders the flow diagram from InteractiveFlowData.
 * - Renders SVG using node/edge data (not raw SVG string)
 * - Each node is a <g> with click handler opening FlowNodePopover
 * - Supports zoom via mouse wheel or pinch gesture (0.25x - 4x range)
 * - Supports pan via drag or touch move
 * - "Fit to screen" button auto-computes zoom to fit all nodes
 * - Risk overlay toggle adds colored borders per risk level
 * - Mobile: uses @use-gesture/react for pinch-zoom and pan
 * - Keyboard accessible: Tab through nodes, Enter to open popover
 */
```

### FlowNodePopover Content

```
┌──────────────────────────────────────┐
│ Step 5: Create Purchase Order        │
│ Scope Item: J60 - Accounts Payable   │
│                                      │
│ Classification: FIT ●                │
│ Risk Level: Low                      │
│                                      │
│ Client Note:                         │
│ "We use a three-way match..."        │
│                                      │
│ Gap Resolution: None                 │
│                                      │
│ [View Step Detail →]                 │
└──────────────────────────────────────┘
```

---

## 6. Business Logic

### Enhanced Flow SVG Generation

```typescript
// src/lib/report/flow-diagram-v2.ts

/**
 * Enhanced flow diagram generator that produces:
 * 1. Full SVG string (backward compatible)
 * 2. InteractiveFlowData JSON for client-side rendering
 * 3. Thumbnail SVG (simplified, < 10KB)
 * 4. Risk overlay data
 */
export async function generateFlowDiagramV2(
  assessmentId: string,
  scopeItemId: string,
  processFlowName: string,
  options: { includeInteractive?: boolean; includeThumbnail?: boolean; includeRiskOverlay?: boolean },
): Promise<FlowDiagramV2Result> {
  // 1. Query steps with responses and gap resolutions
  const steps = await prisma.processStep.findMany({
    where: { scopeItemId, processFlowGroup: processFlowName },
    include: {
      stepResponses: { where: { assessmentId } },
    },
    orderBy: { sequence: "asc" },
  });

  const gapResolutions = await prisma.gapResolution.findMany({
    where: { assessmentId, scopeItemId },
  });

  // 2. Compute layout positions
  const layout = computeLayout(steps, "sequential");

  // 3. Generate full SVG
  const svgContent = generateFlowSvg(processFlowName, scopeItemName, stepsWithStatus);

  // 4. Generate interactive data
  const interactiveData = options.includeInteractive
    ? buildInteractiveData(steps, layout, gapResolutions)
    : undefined;

  // 5. Generate thumbnail
  const thumbnailSvg = options.includeThumbnail
    ? generateThumbnailSvg(steps, layout)
    : undefined;

  // 6. Compute risk overlay
  const riskOverlayData = options.includeRiskOverlay
    ? computeRiskOverlay(steps, gapResolutions)
    : undefined;

  return { svgContent, interactiveData, thumbnailSvg, riskOverlayData };
}
```

### Risk Score Computation

```typescript
/**
 * Compute risk score (0.0 - 1.0) for a scope item or functional area.
 *
 * Factors:
 * - Gap density: (GAP steps / total steps) * 0.4
 * - Unresolved gaps: (gaps without resolution / total gaps) * 0.3
 * - Resolution complexity: weighted sum of resolution types * 0.2
 *   (CUSTOM_ABAP = 1.0, BTP_EXT = 0.8, ISV = 0.6, KEY_USER_EXT = 0.3, CONFIGURE = 0.1, FIT = 0)
 * - Pending steps: (PENDING / total) * 0.1
 */
export function computeRiskScore(
  totalSteps: number,
  gapCount: number,
  pendingCount: number,
  resolutions: { resolutionType: string; effortDays?: number }[],
): number {
  if (totalSteps === 0) return 0;

  const gapDensity = gapCount / totalSteps;
  const unresolvedCount = gapCount - resolutions.length;
  const unresolvedRatio = gapCount > 0 ? unresolvedCount / gapCount : 0;

  const complexityWeights: Record<string, number> = {
    CUSTOM_ABAP: 1.0, BTP_EXT: 0.8, ISV: 0.6,
    KEY_USER_EXT: 0.3, CONFIGURE: 0.1, FIT: 0, ADAPT_PROCESS: 0.4, OUT_OF_SCOPE: 0.2,
  };

  const avgComplexity = resolutions.length > 0
    ? resolutions.reduce((sum, r) => sum + (complexityWeights[r.resolutionType] ?? 0.5), 0) / resolutions.length
    : 0;

  const pendingRatio = pendingCount / totalSteps;

  return Math.min(1.0, gapDensity * 0.4 + unresolvedRatio * 0.3 + avgComplexity * 0.2 + pendingRatio * 0.1);
}
```

### Functional Area Overview Generation

```typescript
/**
 * Generate or refresh the functional area overview for an assessment.
 * Aggregates classification counts, risk scores, and cross-area dependencies
 * across all selected scope items grouped by functional area.
 */
export async function generateFunctionalAreaOverview(
  assessmentId: string,
): Promise<FunctionalAreaOverviewData[]> {
  // 1. Get all scope selections for the assessment
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
  });

  // 2. For each functional area, aggregate step response data
  // 3. Compute risk scores per area
  // 4. Identify cross-area dependencies (scope items referencing other areas)
  // 5. Upsert FunctionalAreaOverview records
  // 6. Return overview data
}
```

### Thumbnail SVG Generation

```typescript
/**
 * Generate a simplified thumbnail SVG (< 10KB) for overview cards.
 * - Renders nodes as small colored rectangles (no text)
 * - Omits arrows/edges for simplicity
 * - Fixed viewBox of 200x100 for consistent card sizing
 * - Color-coded by fitStatus only (no risk overlay)
 */
function generateThumbnailSvg(steps: FlowStep[], layout: LayoutResult): string {
  const thumbWidth = 200;
  const thumbHeight = 100;
  const nodeW = 12;
  const nodeH = 8;
  // ... simplified rendering ...
}
```

### Mobile Rendering Optimization

```typescript
/**
 * Mobile optimizations:
 * 1. SVG viewBox set to actual content bounds (no excess whitespace)
 * 2. Touch gesture handling via @use-gesture/react:
 *    - Pinch: zoom (0.5x - 3x on mobile, constrained to prevent over-zoom)
 *    - Two-finger drag: pan
 *    - Single tap on node: open popover
 *    - Double tap: zoom to fit
 * 3. Reduced node detail at low zoom levels (hide labels below 0.75x)
 * 4. Lazy-load interactive data only when viewer is visible (IntersectionObserver)
 */
```

---

## 7. Permissions & Access Control

| Action | Allowed Roles | Notes |
|---|---|---|
| View flow diagrams | Any assessment stakeholder | Read-only for `viewer`, `executive_sponsor` |
| View interactive flow data | Any assessment stakeholder | Same as view |
| Generate/regenerate flows | `consultant`, `platform_admin`, `partner_lead`, `solution_architect` | Triggers re-computation |
| Export flow (SVG/PDF/PNG) | Any assessment stakeholder | All stakeholders can export |
| View functional area overview | Any assessment stakeholder | Read-only |
| View cross-area dependencies | Any assessment stakeholder | Read-only |
| Toggle risk overlay | `consultant`, `platform_admin`, `partner_lead`, `solution_architect`, `project_manager` | Risk data may be sensitive to some roles |

### Area-Locked Visibility

Process owners with assigned areas see only their assigned functional areas in the overview map. They can see cross-area dependency indicators but not drill into other areas' flows.

---

## 8. Notification Triggers

| Event | Recipients | Channel | Notes |
|---|---|---|---|
| Flow diagrams regenerated | Assessment PM + consultant who triggered | in_app | Informational |
| Risk score exceeds 0.7 for a functional area | PM + partner_lead + consultant | in_app, email | Threshold alert |
| All flows generated for first time | All stakeholders | in_app | Milestone |

*Note: Depends on Phase 19 (Notification System). Until implemented, events are logged to DecisionLogEntry only.*

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Scope item has 0 process steps | Show empty-state in flow viewer: "No process steps defined for this scope item" |
| Process step has no StepResponse | Render node with PENDING status (grey) |
| Flow generation for 500+ steps | Paginate: generate separate flows per `processFlowGroup`; overview shows grouped thumbnails |
| SVG exceeds 1MB | Compress SVG (remove redundant whitespace, minify path data); warn in UI if still large |
| Thumbnail SVG exceeds 10KB target | Reduce node detail; use simpler shapes; worst case store as-is with a warning |
| Cross-area dependency data not available | Show "No cross-area dependencies detected" in dependency graph; do not error |
| Mobile device with < 375px width | Minimum touch target 44x44px per WCAG; nodes are tappable even when visually small |
| Two users regenerate flows simultaneously | Last-write-wins for `ProcessFlowDiagram` records; `generatedAt` timestamp disambiguates |
| Assessment with no selected scope items | Overview shows empty state: "Select scope items to generate process maps" |
| Old diagrams with `layoutVersion: 1` | Serve as-is; offer "Regenerate" button to upgrade to current layout version |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Interactive data size for large flows | Lazy-load interactive data only when user opens the flow viewer (not on page load) |
| Flow generation time for full assessment | Generate flows per scope item in parallel; use `Promise.allSettled()` |
| Thumbnail generation overhead | Generate thumbnails in the same pass as full SVGs (no extra DB queries) |
| Functional area overview computation | Cache in `FunctionalAreaOverview` table; invalidate on StepResponse/GapResolution write |
| SVG rendering performance in browser | Use `will-change: transform` on SVG container; debounce zoom/pan at 16ms (60fps) |
| Image export (PNG) | Render PNG server-side if client-side `html-to-image` is too slow; limit to 4000px max width |
| Database query for overview (joins across 5 tables) | Pre-aggregate counts in `FunctionalAreaOverview`; only re-query on explicit refresh |
| Mobile memory for large SVGs | Limit visible nodes to viewport; virtual scrolling for very large diagrams (100+ nodes) |

---

## 11. Testing Strategy

### Unit Tests

| Test | File |
|---|---|
| `generateFlowDiagramV2` produces valid SVG and interactive data | `__tests__/lib/report/flow-diagram-v2.test.ts` |
| `computeRiskScore` returns correct scores for various inputs | `__tests__/lib/report/risk-score.test.ts` |
| `generateThumbnailSvg` produces SVG under 10KB threshold | `__tests__/lib/report/thumbnail.test.ts` |
| Layout computation produces non-overlapping node positions | `__tests__/lib/report/flow-layout.test.ts` |
| Functional area overview aggregation produces correct counts | `__tests__/lib/report/area-overview.test.ts` |
| Zod schema validation for generate/export requests | `__tests__/lib/validation/flow.test.ts` |

### Integration Tests

| Test | File |
|---|---|
| GET /api/assessments/[id]/flows/overview returns correct area data | `__tests__/api/flows/overview.test.ts` |
| POST /api/assessments/[id]/flows/generate creates diagram records | `__tests__/api/flows/generate.test.ts` |
| GET /api/assessments/[id]/flows/[id]/interactive returns valid JSON | `__tests__/api/flows/interactive.test.ts` |
| POST /api/assessments/[id]/flows/[id]/export returns PDF/PNG | `__tests__/api/flows/export.test.ts` |
| Area-locked process owner sees only assigned areas | `__tests__/api/flows/area-lock.test.ts` |

### E2E Tests

| Test | File |
|---|---|
| User opens functional area overview, drills into scope item, views interactive flow | `e2e/process-visualization.spec.ts` |
| User clicks node, sees popover with step details, navigates to step detail | `e2e/flow-node-interaction.spec.ts` |
| User exports flow as PDF and PNG | `e2e/flow-export.spec.ts` |
| Mobile: user pinch-zooms and pans flow diagram | `e2e/flow-mobile.spec.ts` |

---

## 12. Migration & Seed Data

### Prisma Migration

```bash
# Creates:
# 1. Add interactiveData, thumbnailSvg, riskOverlayData, layoutVersion to ProcessFlowDiagram
# 2. Create FunctionalAreaOverview table
pnpm prisma migrate dev --name enhance-flow-diagrams
```

### Data Migration Script (`prisma/migrations/data/regenerate-flow-thumbnails.ts`)

```typescript
/**
 * Regenerate all existing flow diagrams with:
 * 1. Interactive data (interactiveData JSON)
 * 2. Thumbnail SVGs
 * 3. Risk overlay data
 * 4. Set layoutVersion = 2
 *
 * Run as a background job after migration since this is compute-intensive.
 */
async function regenerateAllFlows() {
  const diagrams = await prisma.processFlowDiagram.findMany({
    where: { layoutVersion: { lt: 2 } },
    select: { id: true, assessmentId: true, scopeItemId: true, processFlowName: true },
  });

  console.log(`Regenerating ${diagrams.length} flow diagrams...`);

  for (const diagram of diagrams) {
    try {
      const result = await generateFlowDiagramV2(
        diagram.assessmentId,
        diagram.scopeItemId,
        diagram.processFlowName,
        { includeInteractive: true, includeThumbnail: true, includeRiskOverlay: true },
      );

      await prisma.processFlowDiagram.update({
        where: { id: diagram.id },
        data: {
          interactiveData: result.interactiveData,
          thumbnailSvg: result.thumbnailSvg,
          riskOverlayData: result.riskOverlayData,
          layoutVersion: 2,
        },
      });
    } catch (error) {
      console.error(`Failed to regenerate diagram ${diagram.id}:`, error);
    }
  }
}
```

### Seed Data

```typescript
// Seed functional area overview for demo assessment
const areas = ["Finance", "Procurement", "Sales", "Manufacturing", "Human Resources"];
for (const area of areas) {
  await prisma.functionalAreaOverview.create({
    data: {
      assessmentId: demoAssessmentId,
      functionalArea: area,
      totalScopeItems: 8,
      selectedCount: 6,
      fitCount: area === "Finance" ? 180 : 120,
      configureCount: area === "Finance" ? 45 : 30,
      gapCount: area === "Finance" ? 15 : 8,
      pendingCount: area === "Finance" ? 2 : 5,
      riskScore: area === "Finance" ? 0.35 : 0.22,
      completionPct: area === "Finance" ? 98.0 : 85.0,
      crossAreaDeps: area === "Finance" ? ["J14", "2BM"] : [],
    },
  });
}
```

---

## 13. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| 1 | Should we adopt a graph library (e.g., `dagre` or `elkjs`) for automatic layout, or keep the custom sequential layout? Libraries handle complex layouts better but add bundle size. | High -- affects all layout code | Technical |
| 2 | Should the interactive flow be rendered as SVG-in-DOM or as a `<canvas>` for performance with large diagrams (500+ nodes)? | High -- different rendering pipeline | Technical |
| 3 | What cross-area dependencies exist in the SAP BPD catalog data? Are they explicit in the source data or must we infer them? | Medium -- determines data quality | Domain + Technical |
| 4 | Should risk overlay colors be configurable per organization, or fixed globally? | Low -- UX preference | Product |
| 5 | Should PNG export happen client-side or server-side? Client-side is simpler but may fail on large diagrams. | Medium -- architecture choice | Technical |

---

## 14. Acceptance Criteria (Given/When/Then)

### AC-20.1: Interactive Node Click
```
Given a user is viewing an interactive flow diagram for scope item J60
  And the diagram contains a node for "Create Purchase Order" with fitStatus "FIT"
When the user clicks on the "Create Purchase Order" node
Then a popover appears showing:
  - Step sequence number and title
  - Scope item name
  - Classification status with color indicator
  - Client note (if any)
  - Gap resolution summary (if any)
  - A "View Step Detail" link that navigates to the step detail page
```

### AC-20.2: Functional Area Overview
```
Given an assessment with 5 functional areas and 30 selected scope items
When the user navigates to the Process Map tab
Then a functional area overview map is displayed
  And each area shows: name, scope item count, completion percentage, risk score heatmap color
  And areas are clickable to drill into scope-item-level detail
```

### AC-20.3: Risk Overlay Toggle
```
Given a user is viewing an interactive flow diagram
  And the flow has 3 GAP steps with varying resolution complexity
When the user toggles the risk overlay on
Then each node gains a colored border:
  - Green border for risk < 0.3
  - Yellow border for risk 0.3-0.6
  - Orange border for risk 0.6-0.8
  - Red border for risk > 0.8
And the legend updates to show risk-level color coding
```

### AC-20.4: Mobile Pinch-Zoom
```
Given a user views a flow diagram on a mobile device (viewport width < 768px)
When the user performs a pinch-zoom gesture
Then the diagram zooms in/out smoothly between 0.5x and 3x
  And the zoom is centered on the pinch midpoint
  And nodes remain tappable at all zoom levels (minimum 44x44px touch target)
```

### AC-20.5: Flow Export as PDF
```
Given a user is viewing a flow diagram
When the user clicks Export > PDF
Then a PDF file is downloaded containing:
  - The flow diagram SVG rendered as a vector graphic
  - A header with assessment name, scope item, and generation timestamp
  - Each node label is selectable text (not rasterized)
  - The file name follows pattern: "{AssessmentName}_{ScopeItemId}_{FlowName}.pdf"
```

### AC-20.6: Thumbnail in Overview Card
```
Given flow diagrams have been generated for a scope item
When the user views the functional area overview
Then each scope item card displays a thumbnail SVG preview
  And the thumbnail is under 10KB in size
  And clicking the thumbnail navigates to the full interactive view
```

### AC-20.7: Cross-Area Dependency Visualization
```
Given an assessment where scope item J60 (Finance) has a data-flow dependency on J14 (Procurement)
When the user views the cross-area dependency graph
Then a visual line connects the Finance area to the Procurement area
  And hovering the line shows: "J60 (Accounts Payable) → J14 (Procurement)" with type "data_flow"
```

### AC-20.8: Area-Locked Visibility
```
Given a process_owner stakeholder assigned to the "Finance" functional area only
When the user views the functional area overview
Then only the "Finance" area is fully visible with drill-down capability
  And other areas show as greyed-out cards with name and completion % only
  And cross-area dependency lines from Finance to other areas are visible
  And clicking on a non-assigned area does NOT navigate to its flows
```

---

## 15. Size Estimate

**Size: M (Medium)**

| Component | Effort |
|---|---|
| Schema migration (ProcessFlowDiagram changes + FunctionalAreaOverview) | 0.5 day |
| Enhanced flow generation with interactive data + thumbnails | 2 days |
| Risk score computation | 0.5 day |
| Functional area overview generation | 1 day |
| API routes (7 endpoints) | 1.5 days |
| InteractiveFlowViewer component with zoom/pan | 2 days |
| FlowNodePopover component | 0.5 day |
| FunctionalAreaOverviewMap component | 1.5 days |
| Mobile gesture handling | 1 day |
| Export (PDF + PNG) | 1 day |
| Cross-area dependency visualization | 1 day |
| Testing (unit + integration + E2E) | 2 days |
| **Total** | **~14.5 days** |

---

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with new fields on `ProcessFlowDiagram` and new `FunctionalAreaOverview` model
- [ ] Migration applied successfully in development and staging
- [ ] TypeScript types created in `src/types/flow.ts`
- [ ] Zod schemas created in `src/lib/validation/flow.ts`
- [ ] `generateFlowDiagramV2()` produces SVG, interactive data, thumbnails, and risk overlay data
- [ ] `computeRiskScore()` implemented with documented formula and tested
- [ ] `generateFunctionalAreaOverview()` aggregates data correctly
- [ ] Thumbnail SVG generation produces outputs under 10KB
- [ ] All 7 API routes implemented with Zod validation and auth guards
- [ ] `InteractiveFlowViewer` renders nodes from JSON data (not raw SVG)
- [ ] Nodes are clickable; `FlowNodePopover` displays step details
- [ ] Zoom/pan works via mouse (desktop) and pinch/drag (mobile)
- [ ] `FunctionalAreaOverviewMap` renders heatmap with drill-down
- [ ] `AreaScopeItemGrid` shows thumbnail cards per scope item
- [ ] Risk overlay toggle adds colored borders and updates legend
- [ ] Cross-area dependency graph renders connecting lines
- [ ] PDF export produces vector-quality output with selectable text
- [ ] PNG export produces raster output at configurable resolution
- [ ] Mobile rendering meets 44x44px minimum touch targets (WCAG)
- [ ] Area-locked visibility enforced for process_owner role
- [ ] Existing `FlowViewerClient.tsx` backward-compatible (delegates to new viewer)
- [ ] Data migration script regenerates existing diagrams with interactive data
- [ ] Unit tests pass (generation, risk score, thumbnail, layout, overview)
- [ ] Integration tests pass (all API endpoints, area-lock enforcement)
- [ ] E2E tests pass (overview drill-down, node interaction, export, mobile gestures)
- [ ] No TypeScript strict-mode errors introduced
- [ ] PR reviewed and approved
