# Phase 15: Data Migration Register

## 1. Overview

The Data Migration Register introduces a dedicated register for cataloging data migration objects discovered during a Fit-to-Standard assessment. SAP S/4HANA Cloud Public Edition implementations require careful planning of data migration from legacy systems. Each entry in the register captures: object name, object type (master data, transactional, configuration, reference data), source system, source format, volume estimate, cleansing requirements, mapping complexity, migration approach (manual, automated, hybrid), migration tool (LTMC, LSMW, CPI, BTP, custom), validation rules, priority, dependencies on other migration objects, and effort estimates.

This register complements the Integration Register (Phase 14) by focusing on one-time data loads rather than ongoing interfaces. It provides the data migration lead and IT lead with a structured workspace to plan, track, and prioritize the data migration workstream that runs in parallel with the Realize phase.

**Source**: V2 Brief Section A5.6

## 2. Dependencies

| Dependency | Type | Detail |
|---|---|---|
| Prisma 6 | Runtime | New `DataMigrationObject` model; migration required |
| Assessment model | Schema | FK `assessmentId` references `Assessment.id` |
| ScopeItem model | Schema | Optional `relatedScopeItemId` references `ScopeItem.id` (application-level, no DB FK) |
| Auth / Session | Runtime | `getCurrentUser()` + `isMfaRequired()` for all routes |
| Permissions | Runtime | New `canManageDataMigration()` helper |
| shadcn/ui | UI | `Dialog`, `Table`, `Select`, `Input`, `Badge`, `Card`, `Textarea`, `Switch`, `Combobox` |
| Zod 3 | Validation | Request body schemas |
| React 19 | UI | Server Components for page, Client Components for form and table |
| Next.js 16 | Routing | App Router `/api/assessments/[id]/data-migration/...` |
| Phase 14 (Integration Register) | Pattern | Follows identical API/UI architecture; can reuse shared components (FilterBar, SummaryCards pattern) |

## 3. Data Model Changes (Prisma syntax)

```prisma
model DataMigrationObject {
  id                 String   @id @default(cuid())
  assessmentId       String
  objectName         String
  objectType         String   // "MASTER_DATA" | "TRANSACTIONAL" | "CONFIGURATION" | "REFERENCE"
  sourceSystem       String
  sourceFormat       String?  // "SAP_ECC" | "SAP_R3" | "ORACLE" | "CSV" | "OTHER"
  volumeEstimate     String?  // "LT_1K" | "1K_10K" | "10K_100K" | "100K_1M" | "GT_1M"
  cleansingRequired  Boolean  @default(false)
  cleansingNotes     String?  @db.Text
  mappingComplexity  String?  // "low" | "medium" | "high"
  migrationApproach  String?  // "manual" | "automated" | "hybrid"
  migrationTool      String?  // "LTMC" | "LSMW" | "CPI" | "BTP" | "CUSTOM"
  validationRules    String[] @default([])
  priority           String?  // "critical" | "high" | "medium" | "low"
  status             String   @default("identified") // "identified" | "mapped" | "cleansed" | "validated" | "approved"
  estimatedEffortDays Float?
  dependsOnObjects   String[] @default([]) // Array of DataMigrationObject IDs
  relatedScopeItemId String?
  functionalArea     String?
  notes              String?  @db.Text
  createdBy          String
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  assessment Assessment @relation(fields: [assessmentId], references: [id])

  @@index([assessmentId])
  @@index([assessmentId, objectType])
  @@index([functionalArea])
}
```

**Assessment model update** -- add relation field:

```prisma
model Assessment {
  // ... existing fields ...
  dataMigrationObjects DataMigrationObject[]
}
```

## 4. API Routes (method, path, request/response with Zod schemas)

### Shared Zod Enums

```typescript
// src/lib/validation/data-migration.ts
import { z } from "zod";

export const DataObjectType = z.enum(["MASTER_DATA", "TRANSACTIONAL", "CONFIGURATION", "REFERENCE"]);
export type DataObjectType = z.infer<typeof DataObjectType>;

export const SourceFormat = z.enum(["SAP_ECC", "SAP_R3", "ORACLE", "CSV", "OTHER"]);
export type SourceFormat = z.infer<typeof SourceFormat>;

export const VolumeEstimate = z.enum(["LT_1K", "1K_10K", "10K_100K", "100K_1M", "GT_1M"]);
export type VolumeEstimate = z.infer<typeof VolumeEstimate>;

export const MappingComplexity = z.enum(["low", "medium", "high"]);
export type MappingComplexity = z.infer<typeof MappingComplexity>;

export const MigrationApproach = z.enum(["manual", "automated", "hybrid"]);
export type MigrationApproach = z.infer<typeof MigrationApproach>;

export const MigrationTool = z.enum(["LTMC", "LSMW", "CPI", "BTP", "CUSTOM"]);
export type MigrationTool = z.infer<typeof MigrationTool>;

export const DataMigrationPriority = z.enum(["critical", "high", "medium", "low"]);
export type DataMigrationPriority = z.infer<typeof DataMigrationPriority>;

export const DataMigrationStatus = z.enum([
  "identified", "mapped", "cleansed", "validated", "approved",
]);
export type DataMigrationStatus = z.infer<typeof DataMigrationStatus>;
```

### 4.1 GET /api/assessments/[id]/data-migration

List data migration objects with optional filters.

**Query Parameters**:

```typescript
const DataMigrationListParams = z.object({
  objectType: DataObjectType.optional(),
  status: DataMigrationStatus.optional(),
  priority: DataMigrationPriority.optional(),
  functionalArea: z.string().optional(),
  sourceSystem: z.string().optional(),
  cleansingRequired: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
```

**Response** `200`:

```typescript
interface DataMigrationListResponse {
  data: DataMigrationObject[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

**Errors**: `401` Unauthorized, `403` MFA required / Forbidden.

### 4.2 POST /api/assessments/[id]/data-migration

Create a new data migration object.

**Request Body**:

```typescript
const CreateDataMigrationSchema = z.object({
  objectName: z.string().min(1).max(200),
  objectType: DataObjectType,
  sourceSystem: z.string().min(1).max(200),
  sourceFormat: SourceFormat.optional(),
  volumeEstimate: VolumeEstimate.optional(),
  cleansingRequired: z.boolean().default(false),
  cleansingNotes: z.string().max(5000).optional(),
  mappingComplexity: MappingComplexity.optional(),
  migrationApproach: MigrationApproach.optional(),
  migrationTool: MigrationTool.optional(),
  validationRules: z.array(z.string().min(1).max(500)).max(30).default([]),
  priority: DataMigrationPriority.optional(),
  estimatedEffortDays: z.number().min(0).max(999).optional(),
  dependsOnObjects: z.array(z.string().cuid()).max(20).default([]),
  relatedScopeItemId: z.string().optional(),
  functionalArea: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});
```

**Response** `201`:

```typescript
interface CreateDataMigrationResponse {
  data: DataMigrationObject;
}
```

**Errors**: `400` Validation, `401`, `403`, `404` Assessment not found.

### 4.3 PUT /api/assessments/[id]/data-migration/[objectId]

Update an existing data migration object.

**Request Body**:

```typescript
const UpdateDataMigrationSchema = CreateDataMigrationSchema.partial().extend({
  status: DataMigrationStatus.optional(),
});
```

**Response** `200`:

```typescript
interface UpdateDataMigrationResponse {
  data: DataMigrationObject;
}
```

**Errors**: `400`, `401`, `403`, `404`, `409` Conflict (optimistic lock).

### 4.4 DELETE /api/assessments/[id]/data-migration/[objectId]

Hard delete with decision log entry.

**Response** `200`:

```typescript
interface DeleteDataMigrationResponse {
  data: { deleted: true; id: string };
}
```

**Errors**: `401`, `403`, `404`.

### 4.5 GET /api/assessments/[id]/data-migration/summary

Aggregated statistics.

**Response** `200`:

```typescript
interface DataMigrationSummaryResponse {
  data: {
    total: number;
    byObjectType: Record<string, number>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byMigrationApproach: Record<string, number>;
    bySourceSystem: Record<string, number>;
    cleansingRequiredCount: number;
    totalEstimatedDays: number;
    byFunctionalArea: Record<string, { count: number; totalDays: number }>;
  };
}
```

### 4.6 GET /api/assessments/[id]/data-migration/dependency-graph

Returns the dependency graph as an adjacency list for visualization.

**Response** `200`:

```typescript
interface DependencyGraphResponse {
  data: {
    nodes: Array<{
      id: string;
      objectName: string;
      objectType: string;
      status: string;
    }>;
    edges: Array<{
      from: string; // dependsOnObjects source
      to: string;   // this object
    }>;
    criticalPath: string[]; // ordered IDs of the longest dependency chain
  };
}
```

## 5. UI Components (component tree, props, state)

### Component Tree

```
DataMigrationRegisterPage (RSC)
  +-- DataMigrationRegisterClient (client boundary)
        +-- DataMigrationSummaryCards
        |     +-- StatCard (total objects, by type, cleansing required, total effort)
        +-- DataMigrationFilterBar
        |     +-- Select (objectType)
        |     +-- Select (status)
        |     +-- Select (priority)
        |     +-- Select (sourceSystem -- dynamic from data)
        |     +-- Switch (cleansingRequired)
        |     +-- Input (functionalArea search)
        |     +-- Button (Clear filters)
        +-- DataMigrationTable
        |     +-- TableHeader (sortable: objectName, objectType, sourceSystem, volume, status, priority)
        |     +-- TableRow (per object)
        |     |     +-- Badge (objectType, color-coded)
        |     |     +-- Badge (status, color-coded)
        |     |     +-- Badge (priority, color-coded)
        |     |     +-- CleansingIndicator (icon if cleansingRequired)
        |     |     +-- VolumeLabel (human-readable)
        |     |     +-- DependencyCount (badge with count)
        |     |     +-- DropdownMenu (Edit, Delete, View Detail, View Dependencies)
        |     +-- TablePagination
        +-- DataMigrationFormDialog
        |     +-- Input (objectName)
        |     +-- Select (objectType)
        |     +-- Input (sourceSystem)
        |     +-- Select (sourceFormat)
        |     +-- Select (volumeEstimate)
        |     +-- Switch (cleansingRequired)
        |     +-- Textarea (cleansingNotes -- shown conditionally)
        |     +-- Select (mappingComplexity)
        |     +-- Select (migrationApproach)
        |     +-- Select (migrationTool)
        |     +-- TagInput (validationRules)
        |     +-- Select (priority)
        |     +-- Input (estimatedEffortDays)
        |     +-- MultiSelect (dependsOnObjects -- other objects in this assessment)
        |     +-- ScopeItemCombobox (relatedScopeItemId)
        |     +-- Input (functionalArea)
        |     +-- Textarea (notes)
        |     +-- Button (Save / Cancel)
        +-- DataMigrationDetailPanel
        |     +-- DescriptionList (all fields)
        |     +-- DependencyList (linked objects)
        |     +-- ValidationRulesList
        |     +-- AuditInfo (createdBy, createdAt, updatedAt)
        +-- DependencyGraphDialog (optional, deferred to fast-follow)
              +-- DependencyDiagram (DAG visualization)
```

### Key Props & State

```typescript
// DataMigrationRegisterClient
interface DataMigrationRegisterClientProps {
  assessmentId: string;
  userRole: UserRole;
  canEdit: boolean;
}

// DataMigrationFormDialog
interface DataMigrationFormDialogProps {
  assessmentId: string;
  object?: DataMigrationObject; // undefined = create mode
  allObjects: Array<{ id: string; objectName: string }>; // for dependency picker
  open: boolean;
  onClose: () => void;
  onSaved: (obj: DataMigrationObject) => void;
}

// DataMigrationSummaryCards
interface DataMigrationSummaryCardsProps {
  summary: DataMigrationSummary;
}

// DataMigrationDetailPanel
interface DataMigrationDetailPanelProps {
  object: DataMigrationObject;
  dependencyNames: Record<string, string>; // id -> objectName for display
}
```

## 6. Business Logic (algorithms, state machines, validation rules)

### Data Migration Status State Machine

```
identified --> mapped --> cleansed --> validated --> approved
     ^                                     |
     +---------- (reopen) <----------------+
```

Valid transitions:
- Forward: `identified` -> `mapped` -> `cleansed` -> `validated` -> `approved`
- Backward (any editor): each step can go back one step
- Reopen: `approved` -> `identified` (consultant or admin only)
- Skip: `identified` -> `validated` is NOT allowed (must pass through mapping and cleansing stages)

### Dependency Validation

1. **Circular dependency detection**: When creating or updating `dependsOnObjects`, perform a DFS/BFS from the target object to ensure no cycle is formed. Return `400` with a clear error message if a cycle is detected.
2. **Self-reference prevention**: An object cannot depend on itself.
3. **Cross-assessment prevention**: All referenced object IDs must belong to the same assessment.
4. **Max dependency depth**: Warn (not block) if dependency chain exceeds 5 levels deep.

Algorithm for circular dependency detection:

```typescript
function hasCycle(
  objectId: string,
  newDeps: string[],
  allObjects: Map<string, string[]>, // id -> dependsOnObjects
): boolean {
  const visited = new Set<string>();
  const stack = [...newDeps];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === objectId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = allObjects.get(current) ?? [];
    stack.push(...deps);
  }
  return false;
}
```

### Critical Path Calculation

The dependency graph endpoint returns the critical path (longest chain) using topological sort with longest-path calculation weighted by `estimatedEffortDays`.

### Validation Rules

1. **Object name uniqueness**: Within an assessment, `objectName` should be unique (warn, not block).
2. **Cleansing notes required**: If `cleansingRequired` is `true`, `cleansingNotes` should be non-empty (warn, not block).
3. **Migration tool alignment**: If `migrationApproach` is `"manual"`, `migrationTool` should not be set to `"CPI"` or `"BTP"` (warn).
4. **Volume-effort coherence**: If `volumeEstimate` is `"GT_1M"` and `estimatedEffortDays` < 5, display a warning.
5. **Validation rules format**: Each string in `validationRules` must be 1-500 characters, max 30 entries.

### Decision Log Integration

Every mutation writes a `DecisionLogEntry`:
- `entityType`: `"data_migration_object"`
- `action`: `"DM_OBJECT_CREATED"` | `"DM_OBJECT_UPDATED"` | `"DM_OBJECT_DELETED"` | `"DM_STATUS_CHANGED"`
- `oldValue` / `newValue`: JSON diff

## 7. Permissions & Access Control (role x action matrix)

| Action | admin | consultant | project_manager | process_owner | it_lead | data_migration_lead | executive | viewer |
|---|---|---|---|---|---|---|---|---|
| View DM register | Yes | Yes | Yes | Yes (own area) | Yes | Yes | Yes | Yes |
| Create DM object | Yes | Yes | No | No | Yes | Yes | No | No |
| Edit DM object | Yes | Yes | No | No | Yes | Yes (full) | No | No |
| Delete DM object | Yes | Yes | No | No | No | Yes | No | No |
| Approve DM object (status=approved) | Yes | Yes | No | No | No | No | No | No |
| View dependency graph | Yes | Yes | Yes | No | Yes | Yes | Yes | No |
| Export DM register | Yes | Yes | Yes | Yes (own area) | Yes | Yes | Yes | No |

**Notes**: `data_migration_lead` role does not exist until Phase 17. Under V1 roles, `it_lead` serves as the DM register owner with full edit access. Area locking applies to `process_owner` only, filtering by `functionalArea`.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients |
|---|---|---|
| DM object created | In-app toast | Creator (confirmation) |
| DM object status -> `approved` | Email + In-app | IT lead + consultant lead stakeholders |
| Cleansing required count > 10 | In-app banner | IT lead (data quality warning) |
| Circular dependency detected | In-app toast (error) | Editor attempting the save |
| DM register total effort > 100 days | In-app banner | Consultant lead + project manager (timeline risk) |
| DM object deleted | In-app toast | Creator (confirmation) |

## 9. Edge Cases & Error Handling

| # | Scenario | Handling |
|---|---|---|
| 1 | Assessment is in `signed_off` status | Return `403`: "Assessment is locked after sign-off." |
| 2 | Concurrent edit of same DM object | Optimistic locking via `updatedAt`. Mismatched timestamp returns `409 Conflict`. |
| 3 | `dependsOnObjects` references a non-existent object | Return `400`: "Dependency object {id} not found in this assessment." |
| 4 | `dependsOnObjects` creates a circular dependency | Return `400`: "Circular dependency detected: {path}." |
| 5 | Self-referencing dependency | Return `400`: "An object cannot depend on itself." |
| 6 | Deleting an object that others depend on | Allow delete. Update dependents to remove the reference from their `dependsOnObjects` array. Log a warning in decision log. |
| 7 | `relatedScopeItemId` references de-scoped item | Return warning in response; allow save. |
| 8 | `validationRules` array exceeds 30 entries | Reject with `400` validation error. |
| 9 | `migrationApproach` is `"manual"` but `migrationTool` is `"CPI"` | Return warning: "Migration tool CPI is unusual for manual approach." Allow save. |
| 10 | Volume estimate is `"GT_1M"` but effort < 5 days | Return warning: "Effort estimate seems low for > 1M records." Allow save. |

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Large assessments with 200+ DM objects | Cursor-based pagination (50 per page). Composite index `[assessmentId, objectType]` covers primary query pattern. |
| Dependency graph calculation | For < 200 nodes, compute in-memory. Graph traversal is O(V+E). Cache result for 60 seconds via `unstable_cache` or `React.cache`. |
| Critical path calculation | Topological sort + longest path is O(V+E). Acceptable for < 500 nodes. |
| Summary aggregation | Prisma `groupBy` with `_count` and `_sum`. Single query, < 50ms for typical assessment. |
| Dependency cascade on delete | Single `updateMany` query to remove deleted ID from `dependsOnObjects` arrays. Use Prisma raw query with `array_remove` for PostgreSQL. |
| Filter + sort combinations | All filters applied via WHERE clause on indexed `assessmentId`. Client-side sorting for current page. |

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

| Test | Location | Description |
|---|---|---|
| `CreateDataMigrationSchema` | `__tests__/lib/validation/data-migration.test.ts` | Valid payloads accepted; invalid objectType, missing required fields rejected |
| Status transition validation | `__tests__/lib/business/dm-status.test.ts` | Forward transitions allowed, skip transitions blocked, reopen requires elevated role |
| Circular dependency detection | `__tests__/lib/business/dm-dependencies.test.ts` | Detects simple cycle (A->B->A), transitive cycle (A->B->C->A), self-reference |
| Critical path calculation | `__tests__/lib/business/dm-critical-path.test.ts` | Linear chain, diamond graph, disconnected components |
| Permission checks | `__tests__/lib/auth/dm-permissions.test.ts` | Role-based access for each action |

### Integration Tests

| Test | Location | Description |
|---|---|---|
| CRUD lifecycle | `__tests__/api/data-migration.test.ts` | Create -> Read -> Update -> Delete; verify DB state |
| Dependency validation | `__tests__/api/data-migration-deps.test.ts` | Create A, Create B depending on A, attempt circular, verify rejection |
| Cascade delete | `__tests__/api/data-migration-cascade.test.ts` | Delete A; verify B's `dependsOnObjects` no longer contains A's ID |
| Summary aggregation | `__tests__/api/data-migration-summary.test.ts` | Create varied objects; verify counts |
| Dependency graph endpoint | `__tests__/api/data-migration-graph.test.ts` | Create chain A->B->C; verify nodes, edges, critical path |
| Area-locked access | `__tests__/api/data-migration-permissions.test.ts` | Process owner filtered by area |
| Decision log | `__tests__/api/data-migration-audit.test.ts` | Every mutation creates DecisionLogEntry |

### E2E Tests (Playwright)

| Test | File | Description |
|---|---|---|
| Register page loads | `e2e/data-migration-register.spec.ts` | Navigate to assessment -> DM tab; verify table |
| Create with dependencies | `e2e/data-migration-register.spec.ts` | Create object A, then B depending on A; verify dependency badge |
| Filter by objectType | `e2e/data-migration-register.spec.ts` | Select "MASTER_DATA"; verify filtered rows |
| Edit with cleansing toggle | `e2e/data-migration-register.spec.ts` | Toggle cleansing on, add notes; verify update |
| Delete with cascade | `e2e/data-migration-register.spec.ts` | Delete depended-on object; verify dependent's dependency badge updates |

## 12. Migration & Seed Data

### Prisma Migration

```bash
npx prisma migrate dev --name add-data-migration-register
```

Creates the `DataMigrationObject` table with all columns and indexes.

### Seed Data

Provide 6 seed data migration objects for the demo assessment:

```typescript
// prisma/seed-data-migration.ts
const seedDataMigrationObjects = [
  {
    objectName: "Customer Master (Business Partner)",
    objectType: "MASTER_DATA",
    sourceSystem: "SAP ECC 6.0",
    sourceFormat: "SAP_ECC",
    volumeEstimate: "10K_100K",
    cleansingRequired: true,
    cleansingNotes: "Duplicate customer accounts need to be merged. Inactive accounts (no transaction in 3 years) to be archived. BP grouping must be aligned to S/4HANA categories.",
    mappingComplexity: "high",
    migrationApproach: "automated",
    migrationTool: "LTMC",
    validationRules: [
      "Tax ID must be valid format per country",
      "Payment terms must exist in S/4HANA config",
      "Credit limit requires approval if > 100K",
    ],
    priority: "critical",
    status: "mapped",
    estimatedEffortDays: 15,
    functionalArea: "Finance",
  },
  {
    objectName: "Material Master",
    objectType: "MASTER_DATA",
    sourceSystem: "SAP ECC 6.0",
    sourceFormat: "SAP_ECC",
    volumeEstimate: "10K_100K",
    cleansingRequired: true,
    cleansingNotes: "Material types need remapping to S/4HANA material types. Obsolete materials to be excluded.",
    mappingComplexity: "high",
    migrationApproach: "automated",
    migrationTool: "LTMC",
    validationRules: [
      "Material type must be valid in S/4HANA",
      "UoM must exist in target system",
      "Plant assignment must be valid",
    ],
    priority: "critical",
    status: "identified",
    estimatedEffortDays: 20,
    dependsOnObjects: [], // Will be populated after seeding
    functionalArea: "Logistics",
  },
  {
    objectName: "Vendor Master (Business Partner)",
    objectType: "MASTER_DATA",
    sourceSystem: "SAP ECC 6.0",
    sourceFormat: "SAP_ECC",
    volumeEstimate: "1K_10K",
    cleansingRequired: true,
    cleansingNotes: "Vendor bank details must be revalidated. Inactive vendors to be flagged for deletion.",
    mappingComplexity: "medium",
    migrationApproach: "automated",
    migrationTool: "LTMC",
    validationRules: [
      "Bank details must pass IBAN validation",
      "Purchasing organization assignment required",
    ],
    priority: "critical",
    status: "identified",
    estimatedEffortDays: 10,
    functionalArea: "Procurement",
  },
  {
    objectName: "Chart of Accounts",
    objectType: "CONFIGURATION",
    sourceSystem: "SAP ECC 6.0",
    sourceFormat: "SAP_ECC",
    volumeEstimate: "LT_1K",
    cleansingRequired: false,
    mappingComplexity: "medium",
    migrationApproach: "manual",
    migrationTool: "LTMC",
    validationRules: [
      "GL account numbers must be within defined range",
      "Account groups must match S/4HANA config",
    ],
    priority: "high",
    status: "identified",
    estimatedEffortDays: 5,
    functionalArea: "Finance",
  },
  {
    objectName: "Open Purchase Orders",
    objectType: "TRANSACTIONAL",
    sourceSystem: "SAP ECC 6.0",
    sourceFormat: "SAP_ECC",
    volumeEstimate: "1K_10K",
    cleansingRequired: false,
    mappingComplexity: "medium",
    migrationApproach: "hybrid",
    migrationTool: "LTMC",
    validationRules: [
      "Vendor must exist in S/4HANA",
      "Material must exist in S/4HANA",
      "Only open items with delivery date > cutover",
    ],
    priority: "high",
    status: "identified",
    estimatedEffortDays: 8,
    functionalArea: "Procurement",
  },
  {
    objectName: "GL Account Balances",
    objectType: "TRANSACTIONAL",
    sourceSystem: "SAP ECC 6.0",
    sourceFormat: "SAP_ECC",
    volumeEstimate: "LT_1K",
    cleansingRequired: false,
    mappingComplexity: "low",
    migrationApproach: "automated",
    migrationTool: "LTMC",
    validationRules: [
      "Debit/credit balance must net to zero across all accounts",
      "Fiscal year must match cutover period",
    ],
    priority: "critical",
    status: "identified",
    estimatedEffortDays: 3,
    functionalArea: "Finance",
  },
];
```

## 13. Open Questions (numbered, with recommended answers)

| # | Question | Recommended Answer |
|---|---|---|
| 1 | Should we support field-level mapping (source field -> target field) within each DM object? | **Defer.** Field mapping is a Realize phase activity. The register captures object-level planning. Add a `mappingDocUrl` field later if needed. |
| 2 | Should the dependency graph be visualized as a DAG diagram? | **Yes, but defer the visualization to a fast-follow.** Phase 15 MVP returns the graph as JSON. A React Flow or D3 visualization can be added in a follow-up sprint. |
| 3 | Should we integrate with SAP LTMC templates to pre-populate known migration objects? | **Defer to Phase 22+.** This requires SAP template parsing which is complex. Manual entry is sufficient for assessment phase. |
| 4 | Should `dependsOnObjects` support cross-assessment references? | **No.** Dependencies must be within the same assessment. Cross-assessment migration planning is out of scope. |
| 5 | Should we auto-generate DM objects from scope selections (e.g., if "Accounts Payable" is in scope, auto-suggest "Vendor Master")? | **Yes, as a future enhancement.** Build a suggestion engine mapping scope items to common DM objects. For MVP, manual creation only. |
| 6 | How do we handle the `dependsOnObjects` array when a referenced object is deleted? | **Cascade remove.** When object A is deleted, remove A's ID from all `dependsOnObjects` arrays. Log the cascade in the decision log. |
| 7 | Should volume estimates use exact numbers instead of ranges? | **No.** At assessment stage, exact volumes are rarely known. Ranges are more practical and less misleading. |

## 14. Acceptance Criteria (Given/When/Then)

### AC-15.1: View Data Migration Register

```
Given a user is authenticated and is a stakeholder on assessment "A1"
When the user navigates to the Data Migration Register page for "A1"
Then the page displays a table of all data migration objects for "A1"
And summary cards show total count, count by object type, cleansing required count, total effort
And the table is paginated with 50 items per page
```

### AC-15.2: Create Data Migration Object

```
Given a consultant user is on the Data Migration Register page for assessment "A1"
When the user clicks "Add Migration Object" and fills in:
  - objectName: "Employee Master"
  - objectType: "MASTER_DATA"
  - sourceSystem: "SuccessFactors"
  - volumeEstimate: "1K_10K"
  - cleansingRequired: true
  - cleansingNotes: "Remove terminated employees"
And clicks "Save"
Then a new DM object is created with status "identified"
And a DecisionLogEntry is created with action "DM_OBJECT_CREATED"
And the table refreshes to show the new row
```

### AC-15.3: Create Object with Dependency

```
Given DM object "Customer Master" exists in assessment "A1"
When the user creates a new object "Open Sales Orders" with dependsOnObjects = ["Customer Master"]
Then the new object is created successfully
And the dependency graph endpoint shows an edge from "Customer Master" to "Open Sales Orders"
```

### AC-15.4: Circular Dependency Prevention

```
Given DM objects A -> B -> C exist (A depends on nothing, B depends on A, C depends on B)
When the user tries to update A to add C to dependsOnObjects
Then the API returns 400 with message "Circular dependency detected: A -> C -> B -> A"
And the update is not saved
```

### AC-15.5: Delete with Cascade

```
Given DM object "Customer Master" exists and "Open Sales Orders" depends on it
When the consultant deletes "Customer Master"
Then "Customer Master" is removed from the database
And "Open Sales Orders" dependsOnObjects no longer contains the deleted ID
And a DecisionLogEntry records the deletion
And a second DecisionLogEntry records the cascade update to "Open Sales Orders"
```

### AC-15.6: Filter by Object Type

```
Given the DM register has 4 MASTER_DATA, 2 TRANSACTIONAL, 1 CONFIGURATION objects
When the user selects objectType filter "MASTER_DATA"
Then only the 4 MASTER_DATA objects are displayed
```

### AC-15.7: Cleansing Toggle

```
Given DM object "Material Master" has cleansingRequired = false
When the user edits it and toggles cleansingRequired to true
Then the cleansingNotes textarea becomes visible
And the user adds cleansing notes and saves
Then the object is updated with cleansingRequired = true and the notes
```

### AC-15.8: Summary Statistics

```
Given assessment "A1" has 6 DM objects with total estimatedEffortDays = 61
When the user loads the summary endpoint
Then the response shows total: 6, cleansingRequiredCount matching, totalEstimatedDays: 61
And byObjectType contains accurate counts per type
```

### AC-15.9: Locked Assessment

```
Given assessment "A1" has status "signed_off"
When any user navigates to the Data Migration Register
Then all data is displayed in read-only mode
And create, edit, and delete actions are disabled
```

## 15. Size Estimate

| Component | Estimate |
|---|---|
| Prisma schema + migration | 0.5 day |
| Zod validation schemas | 0.5 day |
| API routes (6 endpoints) | 2.5 days |
| Dependency graph + cycle detection logic | 1 day |
| Permission logic | 0.5 day |
| UI: DataMigrationRegisterPage + Client wrapper | 1 day |
| UI: DataMigrationFormDialog (complex, with dependency picker) | 1.5 days |
| UI: DataMigrationTable + FilterBar | 1 day |
| UI: DataMigrationSummaryCards | 0.5 day |
| UI: DataMigrationDetailPanel | 0.5 day |
| Seed data | 0.25 day |
| Unit + integration tests | 2 days |
| E2E tests | 1 day |
| **Total** | **~12 days (Size M)** |

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `DataMigrationObject` model
- [ ] Migration applied successfully to dev and staging databases
- [ ] Zod validation schemas created in `src/lib/validation/data-migration.ts`
- [ ] `GET /api/assessments/[id]/data-migration` returns paginated, filtered list
- [ ] `POST /api/assessments/[id]/data-migration` creates object with validation
- [ ] `PUT /api/assessments/[id]/data-migration/[objectId]` updates with optimistic locking
- [ ] `DELETE /api/assessments/[id]/data-migration/[objectId]` hard-deletes with cascade cleanup
- [ ] `GET /api/assessments/[id]/data-migration/summary` returns accurate aggregations
- [ ] `GET /api/assessments/[id]/data-migration/dependency-graph` returns nodes, edges, critical path
- [ ] Circular dependency detection prevents invalid saves
- [ ] Self-referencing dependency is rejected
- [ ] Cross-assessment dependency references are rejected
- [ ] Delete cascade removes references from dependent objects' `dependsOnObjects`
- [ ] All mutations create `DecisionLogEntry` records
- [ ] Permission checks enforce role-based access per Section 7 matrix
- [ ] Area-locked filtering works for `process_owner` role
- [ ] Assessment status lock prevents edits when `signed_off`
- [ ] `DataMigrationRegisterPage` renders with summary cards, filter bar, and table
- [ ] `DataMigrationFormDialog` opens for create and edit with dependency picker
- [ ] `DataMigrationDetailPanel` displays full read-only view with dependency list
- [ ] Table supports client-side sorting
- [ ] Pagination works with cursor-based navigation
- [ ] Seed data loads successfully for demo assessment
- [ ] Unit tests pass for Zod schemas, status transitions, cycle detection, critical path
- [ ] Integration tests pass for all 6 API endpoints
- [ ] E2E tests pass for create, filter, edit, delete, dependency flows
- [ ] No TypeScript `strict` mode errors
- [ ] No ESLint warnings in new files
