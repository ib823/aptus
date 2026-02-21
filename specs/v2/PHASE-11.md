# Phase 11: Scope Selection V2

## 1. Overview

Enhance the scope selection workflow with five capabilities:

1. **Industry-based pre-selection**: Given an assessment's industry profile code, auto-populate scope selections from `IndustryProfile.applicableScopeItems`. This replaces the current static banner with an actionable one-click "Apply industry template" mechanism.
2. **Dependency awareness**: Model and visualize dependencies between scope items (e.g., "Accounts Payable" depends on "General Ledger"). Warn users when they deselect a scope item that other selected items depend on.
3. **Batch operations**: Bulk select/deselect by functional area, sub-area, or arbitrary multi-select. Extend the existing `POST /api/assessments/[id]/scope/bulk` endpoint.
4. **Impact preview**: For each scope item, display the downstream impact: total process steps, classifiable steps, configuration activities, and estimated effort from `EffortBaseline`.
5. **Current-state enrichment**: Extend `ScopeSelection` to capture priority, business justification, estimated complexity, and dependencies.

**Source**: V2 Brief Section A5.2

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| `IndustryProfile` model | Internal | Exists | `applicableScopeItems: String[]` used for pre-selection |
| `EffortBaseline` model | Internal | Exists | Effort data per scope item + complexity |
| `ScopeSelection` model | Internal | Exists | Extend with new fields |
| `ScopeItem` model | Internal | Exists | Read-only; add `dependsOnScopeItems` for dependency graph |
| `POST /scope/bulk` route | Internal | Exists | Extend for sub-area and multi-select batch |
| `ScopeSelectionClient` component | Internal | Exists | Major enhancement required |
| `ScopeItemCard` component | Internal | Exists | Add impact preview and enrichment fields |
| Phase 10 (Profile Enrichment) | Internal | Phase 10 | Industry code comes from enriched profile |

## 3. Data Model Changes (Prisma syntax)

```prisma
// ── Add to ScopeSelection model ──

model ScopeSelection {
  // ... existing fields ...

  // V2 Phase 11: Scope Selection Enrichment
  priority              String?    // "critical" | "important" | "nice_to_have"
  businessJustification String?    @db.Text
  estimatedComplexity   String?    // "low" | "medium" | "high"
  dependsOnScopeItems   String[]   @default([])
}

// ── Add to ScopeItem model (catalog layer — populated at import time) ──

model ScopeItem {
  // ... existing fields ...

  // V2 Phase 11: Dependency graph
  dependsOn     String[]   @default([])   // Scope item IDs this item depends on
  dependedOnBy  String[]   @default([])   // Scope item IDs that depend on this item (denormalized)
}
```

**New model for scope item dependency metadata** (optional — only if import-time denormalization is insufficient):

```prisma
model ScopeItemDependency {
  id              String   @id @default(cuid())
  scopeItemId     String
  dependsOnItemId String
  dependencyType  String   // "required" | "recommended"
  description     String?  @db.Text
  createdAt       DateTime @default(now())

  @@unique([scopeItemId, dependsOnItemId])
  @@index([scopeItemId])
  @@index([dependsOnItemId])
}
```

## 4. API Routes (method, path, request/response with Zod schemas)

### POST /api/assessments/[id]/scope/pre-select

Apply industry-based pre-selection template.

```typescript
// Zod request schema
const preSelectSchema = z.object({
  industryCode: z.string().min(1).max(50),
  mode: z.enum(["replace", "merge"]).default("merge"),
  // "replace" = clear existing selections and apply template
  // "merge" = only add new selections, don't touch existing
});

// Response 200:
interface PreSelectResponse {
  data: {
    applied: number;       // Number of scope items selected
    skipped: number;       // Number already selected (merge mode)
    total: number;         // Total applicable items from industry profile
    industryCode: string;
    industryName: string;
  };
}

// Response 400: { error: { code: "VALIDATION_ERROR", message: string } }
// Response 404: { error: { code: "NOT_FOUND", message: "Industry profile not found" } }
```

### GET /api/assessments/[id]/scope/impact

Returns impact preview data for all scope items in the assessment.

```typescript
// Query params: none (returns all items)
// Response 200:
interface ScopeImpactResponse {
  data: ScopeItemImpact[];
}

interface ScopeItemImpact {
  scopeItemId: string;
  nameClean: string;
  totalSteps: number;
  classifiableSteps: number;    // Steps that require a FIT/GAP decision
  configActivityCount: number;
  effortBaseline: {
    complexity: string;          // "low" | "medium" | "high"
    implementationDays: number;
    configDays: number;
    testDays: number;
    dataMigrationDays: number;
    trainingDays: number;
    totalDays: number;
  } | null;
  dependencies: {
    dependsOn: string[];         // Scope item IDs
    dependedOnBy: string[];      // Scope item IDs
  };
}
```

### PUT /api/assessments/[id]/scope/[scopeItemId]

Extend existing route to accept enrichment fields.

```typescript
// Zod request schema (extends existing selectionSchema)
const selectionSchemaV2 = z.object({
  selected: z.boolean(),
  relevance: z.enum(["YES", "NO", "MAYBE"]),
  currentState: z.enum(["MANUAL", "SYSTEM", "OUTSOURCED", "NA"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  // V2 enrichment
  priority: z.enum(["critical", "important", "nice_to_have"]).nullable().optional(),
  businessJustification: z.string().max(5000).nullable().optional(),
  estimatedComplexity: z.enum(["low", "medium", "high"]).nullable().optional(),
});

// Response 200: same as before, plus new fields
interface ScopeSelectionResponse {
  data: {
    id: string;
    assessmentId: string;
    scopeItemId: string;
    selected: boolean;
    relevance: string;
    currentState: string | null;
    notes: string | null;
    priority: string | null;
    businessJustification: string | null;
    estimatedComplexity: string | null;
    dependsOnScopeItems: string[];
    respondent: string | null;
    respondedAt: string | null;
    // Dependency warnings (computed)
    dependencyWarnings: DependencyWarning[];
  };
}

interface DependencyWarning {
  type: "missing_dependency" | "orphaned_dependent";
  scopeItemId: string;
  scopeItemName: string;
  message: string;
}
```

### POST /api/assessments/[id]/scope/bulk (extended)

Extend existing bulk endpoint with sub-area support and enrichment.

```typescript
// Zod request schema (extends existing)
const bulkSchemaV2 = z.object({
  action: z.enum(["select_all", "deselect_all"]),
  functionalArea: z.string().optional(),
  subArea: z.string().optional(),           // NEW: filter by sub-area
  scopeItemIds: z.array(z.string()).optional(),
  // V2: set priority for all selected items
  priority: z.enum(["critical", "important", "nice_to_have"]).optional(),
});

// Response 200: same as before
interface BulkResponse {
  data: {
    updated: number;
    dependencyWarnings: DependencyWarning[];  // NEW: warnings about broken dependencies
  };
}
```

### GET /api/assessments/[id]/scope/dependencies

Returns the dependency graph for all scope items.

```typescript
// Response 200:
interface DependencyGraphResponse {
  data: {
    nodes: Array<{
      id: string;
      nameClean: string;
      functionalArea: string;
      selected: boolean;
    }>;
    edges: Array<{
      from: string;   // scopeItemId
      to: string;     // scopeItemId (depends on)
      type: "required" | "recommended";
    }>;
    warnings: DependencyWarning[];
  };
}
```

## 5. UI Components (component tree, props, state)

### Component Tree

```
ScopeSelectionPage (RSC)
└── ScopeSelectionClientV2 (client)
    ├── PageHeader
    │   └── ScopeProgress (enhanced with effort totals)
    ├── IndustryPreSelectBanner
    │   ├── Button "Apply {industry} Template"
    │   └── Badge "{N} items recommended"
    ├── ScopeFilterBar
    │   ├── Input (search)
    │   ├── FilterToggleGroup (all / selected / not_selected / maybe)
    │   ├── AreaSelect (functional area)
    │   ├── SubAreaSelect (sub-area — dynamic based on area)
    │   └── PriorityFilter (all / critical / important / nice_to_have)
    ├── ScopeImpactSummary
    │   ├── StatCard (total selected scope items)
    │   ├── StatCard (total process steps in scope)
    │   ├── StatCard (total estimated effort days)
    │   └── StatCard (dependency warnings count)
    ├── ScopeAreaGroupV2[] (one per functional area)
    │   ├── AreaHeader
    │   │   ├── Checkbox (bulk select/deselect area)
    │   │   ├── Badge "{selected}/{total}"
    │   │   └── DropdownMenu (Bulk actions: Select All, Deselect All, Set Priority)
    │   └── ScopeItemCardV2[] (one per scope item)
    │       ├── Checkbox (select/deselect)
    │       ├── ItemHeader (name, ID, sub-area)
    │       ├── ImpactPreview
    │       │   ├── Badge "{N} steps"
    │       │   ├── Badge "{N} configs"
    │       │   └── Badge "~{N} days effort"
    │       ├── DependencyIndicator
    │       │   ├── Badge "Depends on: [items]"
    │       │   └── Badge "Required by: [items]"  (if applicable)
    │       ├── PrioritySelect (critical / important / nice_to_have)
    │       ├── ComplexitySelect (low / medium / high)
    │       ├── CurrentStateSelect (MANUAL / SYSTEM / OUTSOURCED / NA)
    │       ├── Textarea (businessJustification — expandable)
    │       └── DependencyWarningBanner (if broken dependencies)
    ├── DependencyGraphModal (optional)
    │   └── DependencyGraph (D3.js or react-flow force-directed graph)
    └── ScopeActionBar (sticky bottom)
        ├── Button "Back"
        ├── ScopeProgress (inline summary)
        └── Button "Continue to Step Review"
```

### Key Props

```typescript
interface ScopeSelectionClientV2Props {
  assessmentId: string;
  industry: string;
  industryCode: string;          // from enriched profile
  assessmentStatus: AssessmentStatus;
  scopeItems: ScopeItemDataV2[];
  industryPreSelections: string[];
  impactData: ScopeItemImpact[];
  dependencyGraph: DependencyGraphData;
}

interface ScopeItemDataV2 extends ScopeItemData {
  // V2 enrichment fields
  priority: string | null;
  businessJustification: string | null;
  estimatedComplexity: string | null;
  dependsOnScopeItems: string[];
  // Catalog-level dependency data
  dependsOn: string[];
  dependedOnBy: string[];
}
```

### State Management

```typescript
interface ScopeSelectionState {
  items: ScopeItemDataV2[];
  searchQuery: string;
  filterMode: FilterMode;
  areaFilter: string;
  subAreaFilter: string;
  priorityFilter: string;
  dependencyWarnings: DependencyWarning[];
  showDependencyGraph: boolean;
  pendingSaves: Map<string, NodeJS.Timeout>;
}
```

## 6. Business Logic (algorithms, state machines, validation rules)

### Industry Pre-Selection Engine

```typescript
async function applyIndustryPreSelection(
  assessmentId: string,
  industryCode: string,
  mode: "replace" | "merge",
  actor: string,
): Promise<PreSelectResult> {
  // 1. Look up IndustryProfile by code
  const profile = await prisma.industryProfile.findUnique({
    where: { code: industryCode },
  });
  if (!profile) throw new NotFoundError("Industry profile not found");

  // 2. Get applicable scope item IDs
  const applicableIds = profile.applicableScopeItems;

  // 3. Verify scope items exist in catalog
  const validItems = await prisma.scopeItem.findMany({
    where: { id: { in: applicableIds } },
    select: { id: true },
  });
  const validIds = new Set(validItems.map((i) => i.id));

  // 4. Get existing selections
  const existing = await prisma.scopeSelection.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, selected: true },
  });
  const existingMap = new Map(existing.map((e) => [e.scopeItemId, e]));

  // 5. Apply selections in transaction
  let applied = 0;
  let skipped = 0;

  const operations = [];
  for (const itemId of applicableIds) {
    if (!validIds.has(itemId)) continue;

    const existingSelection = existingMap.get(itemId);

    if (mode === "merge" && existingSelection?.selected) {
      skipped++;
      continue;
    }

    operations.push(
      prisma.scopeSelection.upsert({
        where: { assessmentId_scopeItemId: { assessmentId, scopeItemId: itemId } },
        update: { selected: true, relevance: "YES", respondent: actor, respondedAt: new Date() },
        create: {
          assessmentId,
          scopeItemId: itemId,
          selected: true,
          relevance: "YES",
          respondent: actor,
          respondedAt: new Date(),
        },
      }),
    );
    applied++;
  }

  if (mode === "replace") {
    // Deselect items not in the industry template
    const toDeselect = existing
      .filter((e) => e.selected && !validIds.has(e.scopeItemId))
      .map((e) => e.scopeItemId);

    for (const itemId of toDeselect) {
      operations.push(
        prisma.scopeSelection.update({
          where: { assessmentId_scopeItemId: { assessmentId, scopeItemId: itemId } },
          data: { selected: false, relevance: "NO", respondent: actor, respondedAt: new Date() },
        }),
      );
    }
  }

  await prisma.$transaction(operations);

  return { applied, skipped, total: applicableIds.length, industryCode, industryName: profile.name };
}
```

### Dependency Graph Validation

```typescript
interface DependencyWarning {
  type: "missing_dependency" | "orphaned_dependent";
  scopeItemId: string;
  scopeItemName: string;
  message: string;
}

function validateDependencies(
  selections: Array<{ scopeItemId: string; selected: boolean }>,
  scopeItems: Array<{ id: string; nameClean: string; dependsOn: string[] }>,
): DependencyWarning[] {
  const selectedIds = new Set(
    selections.filter((s) => s.selected).map((s) => s.scopeItemId),
  );
  const itemMap = new Map(scopeItems.map((i) => [i.id, i]));
  const warnings: DependencyWarning[] = [];

  for (const itemId of selectedIds) {
    const item = itemMap.get(itemId);
    if (!item) continue;

    for (const depId of item.dependsOn) {
      if (!selectedIds.has(depId)) {
        const depItem = itemMap.get(depId);
        warnings.push({
          type: "missing_dependency",
          scopeItemId: itemId,
          scopeItemName: item.nameClean,
          message: `"${item.nameClean}" depends on "${depItem?.nameClean ?? depId}" which is not selected`,
        });
      }
    }
  }

  return warnings;
}
```

### Impact Preview Computation

```typescript
async function computeImpactPreview(
  scopeItemId: string,
): Promise<ScopeItemImpact> {
  const [scopeItem, steps, configCount, baseline] = await Promise.all([
    prisma.scopeItem.findUnique({
      where: { id: scopeItemId },
      select: { nameClean: true, totalSteps: true, dependsOn: true, dependedOnBy: true },
    }),
    prisma.processStep.findMany({
      where: { scopeItemId },
      select: { stepType: true },
    }),
    prisma.configActivity.count({
      where: { scopeItemId },
    }),
    prisma.effortBaseline.findFirst({
      where: { scopeItemId },
      orderBy: { confidence: "desc" },
    }),
  ]);

  const classifiableTypes = new Set([
    "BusinessProcess", "Configuration", "Reporting", "MasterData",
  ]);
  const classifiableSteps = steps.filter((s) => classifiableTypes.has(s.stepType)).length;

  return {
    scopeItemId,
    nameClean: scopeItem?.nameClean ?? "",
    totalSteps: scopeItem?.totalSteps ?? 0,
    classifiableSteps,
    configActivityCount: configCount,
    effortBaseline: baseline
      ? {
          complexity: baseline.complexity,
          implementationDays: baseline.implementationDays,
          configDays: baseline.configDays,
          testDays: baseline.testDays,
          dataMigrationDays: baseline.dataMigrationDays,
          trainingDays: baseline.trainingDays,
          totalDays:
            baseline.implementationDays +
            baseline.configDays +
            baseline.testDays +
            baseline.dataMigrationDays +
            baseline.trainingDays,
        }
      : null,
    dependencies: {
      dependsOn: scopeItem?.dependsOn ?? [],
      dependedOnBy: scopeItem?.dependedOnBy ?? [],
    },
  };
}
```

### Batch Operations Validation

- When deselecting a functional area, check for dependency warnings and include them in the response.
- Batch operations set `respondent` and `respondedAt` on all affected selections.
- Batch priority assignment: POST body can include `priority` to set for all affected items.
- Maximum batch size: 200 scope items per request (safety limit).

## 7. Permissions & Access Control (role x action matrix)

| Action | admin | consultant | process_owner | it_lead | executive |
|---|---|---|---|---|---|
| View scope selections | Yes | Yes (own org) | Yes (own assessment, own area) | Yes (own assessment) | Yes (own assessment) |
| Edit scope selection | Yes | Yes | Yes (own area) | No | No |
| Apply industry pre-selection | Yes | Yes | No | No | No |
| Bulk select/deselect | Yes | Yes | No | No | No |
| Set priority | Yes | Yes | Yes (own area) | No | No |
| Set business justification | Yes | Yes | Yes (own area) | No | No |
| View dependency graph | Yes | Yes | Yes | Yes | Yes |
| View impact preview | Yes | Yes | Yes | Yes | Yes |

**Notes**:
- Process owners can only edit selections within their assigned functional areas (enforced by existing `canEditScopeSelection`).
- The industry pre-selection endpoint requires consultant or admin role because it can modify many selections at once.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients | Template |
|---|---|---|---|
| Industry template applied | In-app toast | Current user | "{N} scope items pre-selected based on {industry} template" |
| Dependency warning detected | In-app inline banner | Current user | "Warning: {item} depends on {dependency} which is not selected" |
| Bulk operation completed | In-app toast | Current user | "{N} scope items updated" |
| Scope selection exceeds 100 items | In-app warning banner | Current user | "Large scope: {N} items selected ({M} process steps). Consider narrowing scope for faster assessment." |
| Scope selection changed by another user | WebSocket (future) | All assessment stakeholders | "{user} updated scope selections" |

No email notifications in this phase. WebSocket real-time sync is marked as future work.

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Industry profile has scope items not in the catalog (wrong SAP version/country) | Skip non-existent items. Return `skipped` count with explanation in response. |
| Circular dependency between scope items | Prevent at import time. The dependency graph is a DAG. If cycles detected during import, log warning and break the cycle by removing the weakest edge. |
| User deselects a scope item that 10+ other selected items depend on | Show a confirmation dialog listing all affected items. Allow deselection but mark all dependent items with "missing_dependency" warning. |
| Concurrent bulk operations by two users | Transaction isolation prevents partial writes. Last-write-wins per scope item. Decision log captures both actions. |
| EffortBaseline missing for a scope item | Impact preview shows "No estimate available" for that item. Does not block selection. |
| Industry pre-selection in "replace" mode with existing responses | Show confirmation dialog: "This will deselect {N} items that already have step responses. Deselected items' responses will be preserved but hidden." Responses are NOT deleted. |
| ScopeItem.dependsOn references a scope item in a different country | Cross-country dependencies are allowed. The UI shows a "cross-country" badge on the dependency indicator. |
| User applies pre-selection twice | Merge mode: idempotent (skips already-selected items). Replace mode: re-applies the template, deselecting items not in the template. |
| Assessment in "signed_off" or "reviewed" status | All scope operations return 403. UI renders in read-only mode. |

## 10. Performance Considerations

- **Impact preview query**: Batch-load all impact data in a single query per assessment, not per scope item. Use `prisma.processStep.groupBy` for step type counts and `prisma.configActivity.groupBy` for config counts. Cache in RSC data fetch.
- **Dependency graph**: Precompute `dependedOnBy` at import time (denormalized reverse index). This avoids expensive graph traversal at query time.
- **Bulk operations**: Use `prisma.$transaction` with an array of operations. For >100 items, chunk into batches of 50 to avoid connection pool exhaustion.
- **Industry pre-selection**: Single transaction with upsert operations. For a typical industry profile with 30-60 items, this completes in <500ms.
- **Scope item list**: The full scope catalog has ~220 items for MY/2508. All are loaded server-side in the RSC and passed to the client component. No pagination needed at this scale.
- **Dependency validation**: Runs client-side after every selection change. The dependency graph is typically <500 edges, so validation is O(V+E) and completes in <10ms.

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

```
describe("validateDependencies", () => {
  it("returns empty array when all dependencies are satisfied")
  it("returns warning when a selected item's dependency is not selected")
  it("returns multiple warnings for item with multiple missing dependencies")
  it("does not warn about deselected items' dependencies")
  it("handles empty dependency arrays")
  it("handles scope items with no dependsOn")
})

describe("computeImpactPreview", () => {
  it("counts classifiable steps correctly (excludes Information, LogOn, LogOff)")
  it("returns null effort baseline when no EffortBaseline exists")
  it("sums total days correctly from baseline components")
  it("returns correct config activity count")
})

describe("applyIndustryPreSelection", () => {
  it("selects all applicable items in merge mode")
  it("skips already-selected items in merge mode")
  it("deselects non-template items in replace mode")
  it("skips scope items not found in catalog")
  it("throws NotFoundError for invalid industry code")
})
```

### Integration Tests

```
describe("POST /api/assessments/[id]/scope/pre-select", () => {
  it("applies industry template and returns counts")
  it("merge mode preserves existing selections")
  it("replace mode removes non-template selections")
  it("returns 404 for invalid industry code")
  it("returns 403 for process_owner role")
  it("logs decision entry for bulk pre-selection")
})

describe("GET /api/assessments/[id]/scope/impact", () => {
  it("returns impact data for all scope items")
  it("includes classifiable step counts")
  it("includes effort baseline when available")
  it("returns null baseline for items without effort data")
})

describe("GET /api/assessments/[id]/scope/dependencies", () => {
  it("returns complete dependency graph with nodes and edges")
  it("includes warnings for broken dependencies")
  it("returns empty graph for items with no dependencies")
})

describe("PUT /api/assessments/[id]/scope/[scopeItemId] (V2 fields)", () => {
  it("accepts and persists priority field")
  it("accepts and persists businessJustification field")
  it("accepts and persists estimatedComplexity field")
  it("returns dependency warnings in response")
  it("rejects invalid priority value")
})

describe("POST /api/assessments/[id]/scope/bulk (V2 extensions)", () => {
  it("supports subArea filter for batch operations")
  it("sets priority on all affected items when provided")
  it("returns dependency warnings after bulk deselect")
  it("enforces max batch size of 200")
})
```

### E2E Tests (Playwright)

```
describe("Scope Selection V2 Flow", () => {
  it("consultant applies industry template, sees pre-selected items with impact preview")
  it("consultant deselects item with dependents, sees confirmation dialog with warnings")
  it("consultant sets priority on multiple items via bulk action")
  it("process owner can set priority on items in their area but not other areas")
  it("impact preview shows step counts and effort estimates")
  it("dependency warnings appear inline on scope item cards")
  it("search filters scope items by name, ID, sub-area, functional area")
  it("sub-area filter narrows items within a functional area")
})
```

## 12. Migration & Seed Data

### Prisma Migration

```sql
-- AlterTable: Add enrichment columns to ScopeSelection
ALTER TABLE "ScopeSelection" ADD COLUMN "priority" TEXT;
ALTER TABLE "ScopeSelection" ADD COLUMN "businessJustification" TEXT;
ALTER TABLE "ScopeSelection" ADD COLUMN "estimatedComplexity" TEXT;
ALTER TABLE "ScopeSelection" ADD COLUMN "dependsOnScopeItems" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: Add dependency columns to ScopeItem
ALTER TABLE "ScopeItem" ADD COLUMN "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ScopeItem" ADD COLUMN "dependedOnBy" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: ScopeItemDependency (optional, for richer dependency metadata)
CREATE TABLE "ScopeItemDependency" (
    "id" TEXT NOT NULL,
    "scopeItemId" TEXT NOT NULL,
    "dependsOnItemId" TEXT NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'recommended',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScopeItemDependency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScopeItemDependency_scopeItemId_dependsOnItemId_key"
  ON "ScopeItemDependency"("scopeItemId", "dependsOnItemId");
CREATE INDEX "ScopeItemDependency_scopeItemId_idx"
  ON "ScopeItemDependency"("scopeItemId");
CREATE INDEX "ScopeItemDependency_dependsOnItemId_idx"
  ON "ScopeItemDependency"("dependsOnItemId");
```

### Seed Data

```typescript
// Seed scope item dependencies (curated for MY/2508 catalog)
const SCOPE_DEPENDENCIES = [
  // Financial dependencies
  { scopeItemId: "J60", dependsOnItemId: "J58", type: "required" },  // AP depends on GL
  { scopeItemId: "J59", dependsOnItemId: "J58", type: "required" },  // AR depends on GL
  { scopeItemId: "J62", dependsOnItemId: "J58", type: "required" },  // Asset Accounting depends on GL
  { scopeItemId: "J67", dependsOnItemId: "J58", type: "required" },  // Cost Center Accounting depends on GL
  // Procurement dependencies
  { scopeItemId: "J14", dependsOnItemId: "J60", type: "required" },  // Procurement depends on AP
  { scopeItemId: "J14", dependsOnItemId: "J13", type: "recommended" },// Procurement -> Inventory Mgmt
  // Sales dependencies
  { scopeItemId: "22Z", dependsOnItemId: "J59", type: "required" },  // Sales Order depends on AR
  // ... additional curated dependencies
];

for (const dep of SCOPE_DEPENDENCIES) {
  await prisma.scopeItemDependency.create({
    data: {
      scopeItemId: dep.scopeItemId,
      dependsOnItemId: dep.dependsOnItemId,
      dependencyType: dep.type,
    },
  });

  // Denormalize into ScopeItem arrays
  await prisma.scopeItem.update({
    where: { id: dep.scopeItemId },
    data: { dependsOn: { push: dep.dependsOnItemId } },
  });
  await prisma.scopeItem.update({
    where: { id: dep.dependsOnItemId },
    data: { dependedOnBy: { push: dep.scopeItemId } },
  });
}
```

## 13. Open Questions (numbered, with recommended answers)

1. **Should scope item dependencies be curated manually or derived from SAP documentation?**
   - Recommended: Manually curated for V2. SAP's BPD documentation does not explicitly declare inter-scope-item dependencies. Curate a starter set (~50 dependencies) covering the most common financial, procurement, and sales chains. Allow admin users to manage dependencies via the admin panel in a future phase.

2. **Should "replace" mode in pre-selection delete step responses for deselected items?**
   - Recommended: No. Never delete response data. Deselected items' responses are preserved in the database but hidden from the UI. The decision log captures the deselection event.

3. **Should the dependency graph visualization use D3.js, react-flow, or a simpler solution?**
   - Recommended: Use react-flow for the dependency graph modal. It provides built-in pan/zoom, node positioning, and edge rendering. For the inline dependency indicator on each card, use simple Badge components with linked scope item names.

4. **Should impact preview include estimated cost (from EffortBaseline days x rate)?**
   - Recommended: Not in this phase. Impact preview shows effort in days only. Cost calculation requires a blended rate per organization, which is not yet captured. Add cost projection in a later phase.

5. **What is the maximum number of scope items a single assessment can have in scope?**
   - Recommended: No hard limit, but display a warning banner when >100 items are selected. The MY/2508 catalog has ~220 items; selecting all would mean ~2000+ process steps to review, which is impractical. The warning helps consultants right-size the scope.

6. **Should sub-area filtering be a dropdown or a tree view?**
   - Recommended: Dropdown. The sub-area hierarchy is flat (functional area > sub-area). A tree view adds complexity without benefit since each sub-area belongs to exactly one functional area.

## 14. Acceptance Criteria (Given/When/Then)

### AC-11.1: Apply industry pre-selection (merge)
```
Given assessment "ASM-001" is in "draft" status with industry code "MANUFACTURING"
And the IndustryProfile for "MANUFACTURING" has 35 applicable scope items
And 10 of those items are already selected
When a consultant clicks "Apply Manufacturing Template"
Then 25 new scope items are selected (merge mode)
And the 10 existing selections are preserved
And a toast shows "25 scope items pre-selected based on Manufacturing template"
And a DecisionLogEntry is created for the bulk pre-selection
```

### AC-11.2: Dependency warning on deselect
```
Given scope item "J58" (General Ledger) is selected
And scope items "J60" (Accounts Payable) and "J59" (Accounts Receivable) are selected
And both depend on "J58"
When a consultant deselects "J58"
Then a confirmation dialog appears: "2 selected items depend on General Ledger: Accounts Payable, Accounts Receivable"
And the user can confirm or cancel the deselection
If confirmed, "J58" is deselected and both dependent items show a "missing dependency" warning badge
```

### AC-11.3: Impact preview on scope item card
```
Given scope item "J14" (Procurement) is displayed in the scope selection list
When I view the scope item card
Then I see "56 steps (35 classifiable)" badge
And I see "12 config activities" badge
And I see "~18 days effort" badge (from EffortBaseline)
```

### AC-11.4: Enrichment fields on scope selection
```
Given I am a consultant on assessment "ASM-001"
When I expand scope item "J14" and set priority to "critical"
And set estimated complexity to "high"
And enter business justification "Core procurement process, high volume"
Then the enrichment fields are saved via PUT /api/assessments/ASM-001/scope/J14
And the updated selection is returned with the enrichment data
```

### AC-11.5: Bulk operations with sub-area
```
Given the "Finance" functional area has sub-areas "General Ledger", "Accounts Payable", "Accounts Receivable"
When a consultant performs "Select All" filtered to sub-area "General Ledger"
Then only scope items in the "General Ledger" sub-area are selected
And scope items in other sub-areas are not affected
```

### AC-11.6: Read-only scope for non-editors
```
Given I am an IT lead on assessment "ASM-001"
When I view the scope selection page
Then all scope items are visible with their impact previews
And no selection checkboxes or priority selectors are editable
And the "Apply Template" button is not visible
```

## 15. Size Estimate

| Category | Estimate |
|---|---|
| **T-shirt size** | **M** |
| Schema changes + migration | 1 day |
| Pre-selection engine + API | 1.5 days |
| Impact preview API + computation | 1 day |
| Dependency graph API + validation | 1 day |
| UI enhancements (ScopeSelectionClientV2) | 3 days |
| ScopeItemCardV2 with enrichment fields | 1.5 days |
| Dependency graph modal (react-flow) | 1.5 days |
| Bulk operations extension | 0.5 day |
| Seed data (curated dependencies) | 0.5 day |
| Tests (unit + integration + e2e) | 2 days |
| **Total** | **13.5 days** |

## 16. Phase Completion Checklist

- [ ] Prisma migration adds enrichment columns to ScopeSelection
- [ ] Prisma migration adds dependency columns to ScopeItem
- [ ] ScopeItemDependency model created and seeded with curated dependencies
- [ ] `POST /api/assessments/[id]/scope/pre-select` implements industry template application
- [ ] `GET /api/assessments/[id]/scope/impact` returns impact preview for all scope items
- [ ] `GET /api/assessments/[id]/scope/dependencies` returns dependency graph
- [ ] `PUT /api/assessments/[id]/scope/[scopeItemId]` accepts V2 enrichment fields
- [ ] `POST /api/assessments/[id]/scope/bulk` supports subArea filter and priority assignment
- [ ] `validateDependencies` function implemented and unit tested
- [ ] `computeImpactPreview` function implemented and unit tested
- [ ] `applyIndustryPreSelection` function implemented and unit tested
- [ ] `ScopeSelectionClientV2` renders impact previews, dependency indicators, and enrichment fields
- [ ] `IndustryPreSelectBanner` with "Apply Template" button (consultant/admin only)
- [ ] `ScopeItemCardV2` shows impact badges and enrichment form fields
- [ ] Dependency graph modal renders with react-flow
- [ ] Confirmation dialog on deselecting items with dependents
- [ ] Sub-area filter dropdown in filter bar
- [ ] Priority filter in filter bar
- [ ] Dependency warnings render as inline banners on affected cards
- [ ] Read-only mode for it_lead, executive, and unauthorized process_owners
- [ ] Decision log entries for pre-selection, bulk operations, and individual selection changes
- [ ] Seed data includes ~50 curated scope item dependencies
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E tests cover pre-selection, dependency warning, and enrichment flows
