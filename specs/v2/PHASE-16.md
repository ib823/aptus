# Phase 16: OCM Impact Register

## 1. Overview

The OCM (Organizational Change Management) Impact Register introduces a dedicated register for tracking change impacts discovered during a Fit-to-Standard assessment. SAP S/4HANA Cloud implementations drive significant process changes that affect people, roles, and departments. Early identification of these impacts during the assessment phase is critical for planning training, communication, and adoption activities in the Realize and Deploy phases.

Each OCM impact entry captures: impacted role/department, change type (process change, new process, eliminated process, system change, role change), impact severity (low/medium/high/transformational), training requirements (type, duration), communication plan, resistance risk, readiness assessment score, and mitigation strategies. Impacts can be linked to specific scope items and gap resolutions to maintain traceability from assessment findings to organizational impact.

This register completes the "three registers" triad alongside Integration Register (Phase 14) and Data Migration Register (Phase 15), giving the project team a holistic view of technical and organizational readiness.

**Source**: V2 Brief Section A5.7

## 2. Dependencies

| Dependency | Type | Detail |
|---|---|---|
| Prisma 6 | Runtime | New `OcmImpact` model; migration required |
| Assessment model | Schema | FK `assessmentId` references `Assessment.id` |
| ScopeItem model | Schema | Optional `relatedScopeItemId` (application-level, no DB FK) |
| GapResolution model | Schema | Optional `relatedGapId` references `GapResolution.id` (application-level, no DB FK) |
| Auth / Session | Runtime | `getCurrentUser()` + `isMfaRequired()` for all routes |
| Permissions | Runtime | New `canManageOcmImpacts()` helper |
| shadcn/ui | UI | `Dialog`, `Table`, `Select`, `Input`, `Badge`, `Card`, `Textarea`, `Switch`, `Slider`, `Progress` |
| Zod 3 | Validation | Request body schemas |
| React 19 | UI | Server Components for page, Client Components for form and table |
| Next.js 16 | Routing | App Router `/api/assessments/[id]/ocm-impacts/...` |
| Phase 14 (Integration Register) | Pattern | Follows identical API/UI architecture for consistency |
| Phase 15 (Data Migration Register) | Pattern | Shared SummaryCards and FilterBar component patterns |

## 3. Data Model Changes (Prisma syntax)

```prisma
model OcmImpact {
  id                  String   @id @default(cuid())
  assessmentId        String
  impactTitle         String
  description         String   @db.Text
  impactedRole        String
  impactedDepartment  String?
  changeType          String   // "PROCESS_CHANGE" | "NEW_PROCESS" | "ELIMINATED_PROCESS" | "SYSTEM_CHANGE" | "ROLE_CHANGE"
  impactSeverity      String   // "low" | "medium" | "high" | "transformational"
  trainingRequired    Boolean  @default(false)
  trainingType        String?  // "classroom" | "e_learning" | "on_the_job" | "documentation"
  trainingDays        Float?
  communicationPlan   String?  @db.Text
  resistanceRisk      String?  // "low" | "medium" | "high"
  readinessScore      Float?   // 0.0 to 1.0
  mitigationStrategy  String?  @db.Text
  relatedScopeItemId  String?
  relatedGapId        String?
  functionalArea      String?
  status              String   @default("identified") // "identified" | "assessed" | "planned" | "approved"
  createdBy           String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  assessment Assessment @relation(fields: [assessmentId], references: [id])

  @@index([assessmentId])
  @@index([assessmentId, changeType])
  @@index([functionalArea])
}
```

**Assessment model update** -- add relation field:

```prisma
model Assessment {
  // ... existing fields ...
  ocmImpacts OcmImpact[]
}
```

## 4. API Routes (method, path, request/response with Zod schemas)

### Shared Zod Enums

```typescript
// src/lib/validation/ocm-impact.ts
import { z } from "zod";

export const OcmChangeType = z.enum([
  "PROCESS_CHANGE", "NEW_PROCESS", "ELIMINATED_PROCESS", "SYSTEM_CHANGE", "ROLE_CHANGE",
]);
export type OcmChangeType = z.infer<typeof OcmChangeType>;

export const ImpactSeverity = z.enum(["low", "medium", "high", "transformational"]);
export type ImpactSeverity = z.infer<typeof ImpactSeverity>;

export const TrainingType = z.enum(["classroom", "e_learning", "on_the_job", "documentation"]);
export type TrainingType = z.infer<typeof TrainingType>;

export const ResistanceRisk = z.enum(["low", "medium", "high"]);
export type ResistanceRisk = z.infer<typeof ResistanceRisk>;

export const OcmStatus = z.enum(["identified", "assessed", "planned", "approved"]);
export type OcmStatus = z.infer<typeof OcmStatus>;
```

### 4.1 GET /api/assessments/[id]/ocm-impacts

List OCM impacts with optional filters.

**Query Parameters**:

```typescript
const OcmImpactListParams = z.object({
  changeType: OcmChangeType.optional(),
  impactSeverity: ImpactSeverity.optional(),
  status: OcmStatus.optional(),
  functionalArea: z.string().optional(),
  resistanceRisk: ResistanceRisk.optional(),
  trainingRequired: z.coerce.boolean().optional(),
  impactedRole: z.string().optional(),
  impactedDepartment: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
```

**Response** `200`:

```typescript
interface OcmImpactListResponse {
  data: OcmImpact[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

**Errors**: `401` Unauthorized, `403` MFA required / Forbidden.

### 4.2 POST /api/assessments/[id]/ocm-impacts

Create a new OCM impact.

**Request Body**:

```typescript
const CreateOcmImpactSchema = z.object({
  impactTitle: z.string().min(1).max(300),
  description: z.string().min(1).max(5000),
  impactedRole: z.string().min(1).max(200),
  impactedDepartment: z.string().max(200).optional(),
  changeType: OcmChangeType,
  impactSeverity: ImpactSeverity,
  trainingRequired: z.boolean().default(false),
  trainingType: TrainingType.optional(),
  trainingDays: z.number().min(0).max(100).optional(),
  communicationPlan: z.string().max(5000).optional(),
  resistanceRisk: ResistanceRisk.optional(),
  readinessScore: z.number().min(0).max(1).optional(),
  mitigationStrategy: z.string().max(5000).optional(),
  relatedScopeItemId: z.string().optional(),
  relatedGapId: z.string().optional(),
  functionalArea: z.string().max(200).optional(),
});
```

**Response** `201`:

```typescript
interface CreateOcmImpactResponse {
  data: OcmImpact;
}
```

**Errors**: `400` Validation, `401`, `403`, `404` Assessment not found.

### 4.3 PUT /api/assessments/[id]/ocm-impacts/[impactId]

Update an existing OCM impact.

**Request Body**:

```typescript
const UpdateOcmImpactSchema = CreateOcmImpactSchema.partial().extend({
  status: OcmStatus.optional(),
});
```

**Response** `200`:

```typescript
interface UpdateOcmImpactResponse {
  data: OcmImpact;
}
```

**Errors**: `400`, `401`, `403`, `404`, `409` Conflict (optimistic lock).

### 4.4 DELETE /api/assessments/[id]/ocm-impacts/[impactId]

Hard delete with decision log entry.

**Response** `200`:

```typescript
interface DeleteOcmImpactResponse {
  data: { deleted: true; id: string };
}
```

**Errors**: `401`, `403`, `404`.

### 4.5 GET /api/assessments/[id]/ocm-impacts/summary

Aggregated statistics and readiness overview.

**Response** `200`:

```typescript
interface OcmSummaryResponse {
  data: {
    total: number;
    byChangeType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byResistanceRisk: Record<string, number>;
    trainingRequiredCount: number;
    totalTrainingDays: number;
    averageReadinessScore: number | null; // null if no scores entered
    byFunctionalArea: Record<string, { count: number; avgReadiness: number | null }>;
    byImpactedRole: Record<string, number>;
    byImpactedDepartment: Record<string, number>;
    severityDistribution: {
      low: number;
      medium: number;
      high: number;
      transformational: number;
    };
  };
}
```

### 4.6 GET /api/assessments/[id]/ocm-impacts/heatmap

Returns a role-vs-area impact heatmap for visualization.

**Response** `200`:

```typescript
interface OcmHeatmapResponse {
  data: {
    roles: string[];           // unique impacted roles
    areas: string[];           // unique functional areas
    cells: Array<{
      role: string;
      area: string;
      impactCount: number;
      maxSeverity: string;     // highest severity in this cell
      avgReadiness: number | null;
    }>;
  };
}
```

## 5. UI Components (component tree, props, state)

### Component Tree

```
OcmImpactRegisterPage (RSC)
  +-- OcmImpactRegisterClient (client boundary)
        +-- OcmSummaryCards
        |     +-- StatCard (total impacts)
        |     +-- StatCard (training required count / total training days)
        |     +-- StatCard (high + transformational severity count)
        |     +-- ReadinessGauge (average readiness score, circular progress)
        +-- OcmFilterBar
        |     +-- Select (changeType)
        |     +-- Select (impactSeverity)
        |     +-- Select (status)
        |     +-- Select (resistanceRisk)
        |     +-- Select (impactedRole -- dynamic)
        |     +-- Select (impactedDepartment -- dynamic)
        |     +-- Switch (trainingRequired)
        |     +-- Input (functionalArea search)
        |     +-- Button (Clear filters)
        +-- Tabs
        |     +-- Tab: "Table View"
        |     |     +-- OcmImpactTable
        |     |           +-- TableHeader (sortable columns)
        |     |           +-- TableRow (per impact)
        |     |           |     +-- Badge (changeType, icon + label)
        |     |           |     +-- SeverityBadge (color-coded: green/yellow/orange/red)
        |     |           |     +-- Badge (status)
        |     |           |     +-- ResistanceIndicator (low/medium/high icon)
        |     |           |     +-- TrainingIndicator (icon if required)
        |     |           |     +-- ReadinessBar (mini progress bar 0-100%)
        |     |           |     +-- DropdownMenu (Edit, Delete, View Detail)
        |     |           +-- TablePagination
        |     +-- Tab: "Heatmap View"
        |           +-- OcmHeatmapGrid
        |                 +-- HeatmapCell (color-coded by severity, tooltip with details)
        +-- OcmImpactFormDialog
        |     +-- Input (impactTitle)
        |     +-- Textarea (description)
        |     +-- Input (impactedRole)
        |     +-- Input (impactedDepartment)
        |     +-- Select (changeType)
        |     +-- Select (impactSeverity)
        |     +-- Switch (trainingRequired)
        |     +-- Select (trainingType -- shown conditionally)
        |     +-- Input (trainingDays -- shown conditionally)
        |     +-- Textarea (communicationPlan)
        |     +-- Select (resistanceRisk)
        |     +-- Slider (readinessScore 0-100, displayed as 0.0-1.0)
        |     +-- Textarea (mitigationStrategy)
        |     +-- ScopeItemCombobox (relatedScopeItemId)
        |     +-- GapCombobox (relatedGapId)
        |     +-- Input (functionalArea)
        |     +-- Button (Save / Cancel)
        +-- OcmImpactDetailPanel
              +-- DescriptionList (all fields)
              +-- RelatedScopeItemLink
              +-- RelatedGapLink
              +-- ReadinessScoreDisplay (visual gauge)
              +-- AuditInfo (createdBy, createdAt, updatedAt)
```

### Key Props & State

```typescript
// OcmImpactRegisterClient
interface OcmImpactRegisterClientProps {
  assessmentId: string;
  userRole: UserRole;
  canEdit: boolean;
}

// OcmImpactFormDialog
interface OcmImpactFormDialogProps {
  assessmentId: string;
  impact?: OcmImpact; // undefined = create mode
  open: boolean;
  onClose: () => void;
  onSaved: (impact: OcmImpact) => void;
}

// OcmSummaryCards
interface OcmSummaryCardsProps {
  summary: OcmSummary;
}

// OcmHeatmapGrid
interface OcmHeatmapGridProps {
  data: OcmHeatmapResponse["data"];
  onCellClick: (role: string, area: string) => void;
}

// ReadinessGauge
interface ReadinessGaugeProps {
  score: number | null; // 0.0 to 1.0
  label?: string;
}
```

## 6. Business Logic (algorithms, state machines, validation rules)

### OCM Impact Status State Machine

```
identified --> assessed --> planned --> approved
     ^                        |
     +---- (reopen) <---------+
```

Valid transitions:
- Forward: `identified` -> `assessed` -> `planned` -> `approved`
- Backward: each step can go back one step (any editor)
- Reopen: `approved` -> `identified` (consultant or admin only)

### Readiness Score Calculation

The `readinessScore` is entered manually per impact (0.0 to 1.0), but the summary endpoint computes an aggregate:

```typescript
function calculateAverageReadiness(impacts: OcmImpact[]): number | null {
  const scored = impacts.filter((i) => i.readinessScore !== null);
  if (scored.length === 0) return null;
  // Weighted by severity: transformational=4, high=3, medium=2, low=1
  const severityWeight: Record<string, number> = {
    transformational: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  let totalWeight = 0;
  let weightedSum = 0;
  for (const impact of scored) {
    const weight = severityWeight[impact.impactSeverity] ?? 1;
    weightedSum += impact.readinessScore! * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}
```

### Heatmap Generation

The heatmap endpoint aggregates impacts by `(impactedRole, functionalArea)` pairs:

```typescript
function generateHeatmap(impacts: OcmImpact[]): HeatmapData {
  const cellMap = new Map<string, HeatmapCell>();
  const severityOrder = { low: 0, medium: 1, high: 2, transformational: 3 };

  for (const impact of impacts) {
    const key = `${impact.impactedRole}::${impact.functionalArea ?? "Unassigned"}`;
    const existing = cellMap.get(key);
    if (!existing) {
      cellMap.set(key, {
        role: impact.impactedRole,
        area: impact.functionalArea ?? "Unassigned",
        impactCount: 1,
        maxSeverity: impact.impactSeverity,
        readinessScores: impact.readinessScore !== null ? [impact.readinessScore] : [],
      });
    } else {
      existing.impactCount++;
      if (severityOrder[impact.impactSeverity] > severityOrder[existing.maxSeverity]) {
        existing.maxSeverity = impact.impactSeverity;
      }
      if (impact.readinessScore !== null) {
        existing.readinessScores.push(impact.readinessScore);
      }
    }
  }

  const roles = [...new Set(impacts.map((i) => i.impactedRole))].sort();
  const areas = [...new Set(impacts.map((i) => i.functionalArea ?? "Unassigned"))].sort();
  const cells = [...cellMap.values()].map((c) => ({
    role: c.role,
    area: c.area,
    impactCount: c.impactCount,
    maxSeverity: c.maxSeverity,
    avgReadiness: c.readinessScores.length > 0
      ? c.readinessScores.reduce((a, b) => a + b, 0) / c.readinessScores.length
      : null,
  }));

  return { roles, areas, cells };
}
```

### Validation Rules

1. **Training consistency**: If `trainingRequired` is `true`, `trainingType` must be provided (enforce, return `400`).
2. **Training days range**: If `trainingDays` is provided, must be 0-100.
3. **Readiness score range**: `readinessScore` must be 0.0 to 1.0 (Zod `min(0).max(1)`).
4. **Severity-risk coherence**: If `impactSeverity` is `"transformational"` and `resistanceRisk` is `"low"`, return a warning (not blocking).
5. **Related gap validation**: If `relatedGapId` is provided, validate it belongs to the same assessment (application-level check).
6. **Impact title uniqueness**: Within an assessment, warn on duplicate `impactTitle` (not blocking).

### Decision Log Integration

Every mutation writes a `DecisionLogEntry`:
- `entityType`: `"ocm_impact"`
- `action`: `"OCM_IMPACT_CREATED"` | `"OCM_IMPACT_UPDATED"` | `"OCM_IMPACT_DELETED"` | `"OCM_STATUS_CHANGED"`
- `oldValue` / `newValue`: JSON diff

## 7. Permissions & Access Control (role x action matrix)

| Action | admin | consultant | project_manager | process_owner | it_lead | executive | viewer |
|---|---|---|---|---|---|---|---|
| View OCM register | Yes | Yes | Yes | Yes (own area) | Yes | Yes | Yes |
| View heatmap | Yes | Yes | Yes | No | Yes | Yes | Yes |
| Create OCM impact | Yes | Yes | Yes | Yes (own area) | No | No | No |
| Edit OCM impact | Yes | Yes | Yes | Yes (own area, limited fields) | No | No | No |
| Delete OCM impact | Yes | Yes | No | No | No | No | No |
| Approve OCM impact (status=approved) | Yes | Yes | No | No | No | No | No |
| Set readiness score | Yes | Yes | Yes | Yes (own area) | No | No | No |
| Export OCM register | Yes | Yes | Yes | Yes (own area) | Yes | Yes | No |

**Notes on process_owner access**: Process owners can create and edit impacts within their assigned functional areas. They can set `impactedRole`, `description`, `impactSeverity`, `trainingRequired`, `trainingType`, `trainingDays`, `readinessScore`, and `notes`. They cannot change `changeType`, `status`, or `mitigationStrategy` (which require broader project context).

**Notes on project_manager**: Project managers have create/edit access because OCM planning falls within their responsibility. This is different from the Integration and DM registers where PMs are read-only.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients |
|---|---|---|
| OCM impact created with severity "transformational" | Email + In-app | Executive sponsor + consultant lead |
| OCM impact created with severity "high" | In-app | Consultant lead |
| Average readiness score drops below 0.3 | In-app banner | Project manager + consultant lead (critical readiness warning) |
| Training days total exceeds 50 across assessment | In-app banner | Project manager (training budget/timeline impact) |
| OCM impact status -> `approved` | In-app | Creator (confirmation) |
| OCM impact deleted | In-app toast | Creator (confirmation) |
| Resistance risk "high" count exceeds 5 | In-app banner | Consultant lead + project manager |

## 9. Edge Cases & Error Handling

| # | Scenario | Handling |
|---|---|---|
| 1 | Assessment is in `signed_off` status | Return `403`: "Assessment is locked after sign-off." |
| 2 | Concurrent edit of same impact | Optimistic locking via `updatedAt`. Mismatched timestamp returns `409 Conflict`. |
| 3 | `trainingRequired` is true but `trainingType` is null | Return `400`: "Training type is required when training is marked as required." |
| 4 | `readinessScore` is 1.5 (out of range) | Zod rejects with `400`: "Readiness score must be between 0 and 1." |
| 5 | `relatedGapId` references a gap in a different assessment | Return `400`: "Related gap does not belong to this assessment." |
| 6 | `relatedGapId` references a deleted/non-existent gap | Return warning: "Referenced gap not found." Allow save. |
| 7 | `impactSeverity` is "transformational" but no `mitigationStrategy` | Return warning: "Transformational impacts should have a mitigation strategy." Allow save. |
| 8 | Heatmap with no functional areas assigned | Group all impacts under "Unassigned" area in heatmap. |
| 9 | All readiness scores are null | `averageReadinessScore` returns `null` in summary. ReadinessGauge shows "Not assessed". |
| 10 | Very large assessment with 500+ OCM impacts | Heatmap computation is O(n) and runs in < 100ms. Table pagination handles display. |

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Large OCM registers (200+ impacts) | Cursor-based pagination (50 per page). Composite index `[assessmentId, changeType]` covers primary filter. |
| Summary aggregation with weighted average | Single pass over all impacts. For < 500 entries, completes in < 50ms. Use `groupBy` for counts, manual loop for weighted readiness. |
| Heatmap generation | O(n) single pass. Results cached for 60 seconds in server-side cache. Max ~500 impacts = trivial. |
| Dynamic filter options (roles, departments) | Fetch distinct values from DB via `findMany({ distinct: [...] })`. Cache for 30 seconds. |
| Readiness score slider updates | Debounce slider `onChange` to 300ms before triggering save. Show optimistic UI update immediately. |
| Related gap/scope item lookups | Fetch in parallel with main data. Use Prisma `select` to minimize payload. |

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

| Test | Location | Description |
|---|---|---|
| `CreateOcmImpactSchema` | `__tests__/lib/validation/ocm-impact.test.ts` | Valid payloads accepted; invalid changeType, out-of-range readinessScore, missing trainingType when required |
| Status transition validation | `__tests__/lib/business/ocm-status.test.ts` | Forward/backward transitions, reopen requires elevated role |
| Readiness score calculation | `__tests__/lib/business/ocm-readiness.test.ts` | Weighted average, all null scores, single score, mixed severities |
| Heatmap generation | `__tests__/lib/business/ocm-heatmap.test.ts` | Single role/area, multiple cells, missing areas, severity ordering |
| Permission checks | `__tests__/lib/auth/ocm-permissions.test.ts` | Role-based access for each action, area-locked process owner |

### Integration Tests

| Test | Location | Description |
|---|---|---|
| CRUD lifecycle | `__tests__/api/ocm-impacts.test.ts` | Create -> Read -> Update -> Delete; verify DB state |
| Training required validation | `__tests__/api/ocm-impacts-validation.test.ts` | trainingRequired=true without trainingType returns 400 |
| Summary with weighted readiness | `__tests__/api/ocm-impacts-summary.test.ts` | Create impacts with varied scores and severities; verify weighted average |
| Heatmap endpoint | `__tests__/api/ocm-impacts-heatmap.test.ts` | Create impacts across roles and areas; verify cells, maxSeverity |
| Area-locked access | `__tests__/api/ocm-impacts-permissions.test.ts` | Process owner filtered by area; PM can create |
| Decision log | `__tests__/api/ocm-impacts-audit.test.ts` | Every mutation creates DecisionLogEntry |
| Related gap cross-assessment check | `__tests__/api/ocm-impacts-relations.test.ts` | Reference gap from other assessment returns 400 |

### E2E Tests (Playwright)

| Test | File | Description |
|---|---|---|
| Register page loads | `e2e/ocm-register.spec.ts` | Navigate to assessment -> OCM tab; verify table and summary |
| Create impact | `e2e/ocm-register.spec.ts` | Click "Add Impact", fill form with training enabled, save; verify row |
| Heatmap view | `e2e/ocm-register.spec.ts` | Switch to Heatmap tab; verify grid renders with colored cells |
| Readiness slider | `e2e/ocm-register.spec.ts` | Edit impact, drag readiness slider to 0.7, save; verify progress bar |
| Filter by severity | `e2e/ocm-register.spec.ts` | Select "transformational"; verify only matching rows shown |
| Delete flow | `e2e/ocm-register.spec.ts` | Delete impact; confirm dialog; verify removal |

## 12. Migration & Seed Data

### Prisma Migration

```bash
npx prisma migrate dev --name add-ocm-impact-register
```

Creates the `OcmImpact` table with all columns and indexes.

### Seed Data

Provide 7 seed OCM impacts for the demo assessment:

```typescript
// prisma/seed-ocm-impacts.ts
const seedOcmImpacts = [
  {
    impactTitle: "AP Invoice Processing Automation",
    description: "Current manual three-way match process will be replaced by automated invoice processing with ML-based matching in S/4HANA. AP clerks will shift from manual matching to exception handling.",
    impactedRole: "AP Clerk",
    impactedDepartment: "Finance",
    changeType: "PROCESS_CHANGE",
    impactSeverity: "high",
    trainingRequired: true,
    trainingType: "classroom",
    trainingDays: 3,
    communicationPlan: "Announce at monthly Finance town hall (Month -3). Hands-on workshop during UAT. Post-go-live support desk for 2 weeks.",
    resistanceRisk: "medium",
    readinessScore: 0.4,
    mitigationStrategy: "Early involvement in UAT. Assign AP supervisor as change champion. Show productivity gains in pilot.",
    functionalArea: "Finance",
    status: "assessed",
  },
  {
    impactTitle: "Procurement Self-Service Portal",
    description: "Requestors will use Ariba-integrated self-service portal instead of email-based purchase requests. Procurement team role shifts from order creation to strategic sourcing.",
    impactedRole: "Procurement Specialist",
    impactedDepartment: "Procurement",
    changeType: "SYSTEM_CHANGE",
    impactSeverity: "transformational",
    trainingRequired: true,
    trainingType: "e_learning",
    trainingDays: 2,
    communicationPlan: "Executive sponsor video message. Department-level workshops. Quick reference guides distributed via intranet.",
    resistanceRisk: "high",
    readinessScore: 0.2,
    mitigationStrategy: "Phased rollout by department. Power user network. Weekly Q&A sessions during first month.",
    functionalArea: "Procurement",
    status: "identified",
  },
  {
    impactTitle: "MRP Controller Dashboard",
    description: "Supply planners will use embedded analytics dashboard for MRP results instead of spreadsheet-based tracking. Real-time exception monitoring replaces batch review.",
    impactedRole: "Supply Planner",
    impactedDepartment: "Supply Chain",
    changeType: "SYSTEM_CHANGE",
    impactSeverity: "medium",
    trainingRequired: true,
    trainingType: "on_the_job",
    trainingDays: 1,
    resistanceRisk: "low",
    readinessScore: 0.6,
    functionalArea: "Logistics",
    status: "identified",
  },
  {
    impactTitle: "Manual Bank Reconciliation Elimination",
    description: "Automated bank statement import and reconciliation replaces current manual Excel-based process. Treasury analysts will focus on cash forecasting instead of reconciliation.",
    impactedRole: "Treasury Analyst",
    impactedDepartment: "Finance",
    changeType: "ELIMINATED_PROCESS",
    impactSeverity: "medium",
    trainingRequired: true,
    trainingType: "classroom",
    trainingDays: 1,
    resistanceRisk: "low",
    readinessScore: 0.7,
    mitigationStrategy: "Show time savings analysis. Emphasize shift to higher-value forecasting work.",
    functionalArea: "Finance",
    status: "identified",
  },
  {
    impactTitle: "Warehouse Operator RF Scanning",
    description: "Paper-based picking lists replaced by RF scanner-guided putaway and picking. New physical workflow for warehouse operators.",
    impactedRole: "Warehouse Operator",
    impactedDepartment: "Warehouse",
    changeType: "NEW_PROCESS",
    impactSeverity: "high",
    trainingRequired: true,
    trainingType: "on_the_job",
    trainingDays: 5,
    communicationPlan: "Floor supervisor briefings. Practice sessions with demo scanners. Buddy system for first 2 weeks.",
    resistanceRisk: "high",
    readinessScore: 0.15,
    mitigationStrategy: "Start with volunteer pilot group. Provide backup paper process for first week. Gamify adoption metrics.",
    functionalArea: "Warehouse Management",
    status: "identified",
  },
  {
    impactTitle: "Cost Center Manager Self-Service Reporting",
    description: "Cost center managers will run their own budget variance reports via Fiori instead of requesting them from Finance.",
    impactedRole: "Cost Center Manager",
    impactedDepartment: "All Departments",
    changeType: "ROLE_CHANGE",
    impactSeverity: "low",
    trainingRequired: true,
    trainingType: "documentation",
    trainingDays: 0.5,
    resistanceRisk: "low",
    readinessScore: 0.8,
    functionalArea: "Controlling",
    status: "assessed",
  },
  {
    impactTitle: "Chart of Accounts Restructuring",
    description: "Consolidation of 4 legacy charts of accounts into single S/4HANA universal journal structure. All GL reporting changes.",
    impactedRole: "Financial Controller",
    impactedDepartment: "Finance",
    changeType: "PROCESS_CHANGE",
    impactSeverity: "transformational",
    trainingRequired: true,
    trainingType: "classroom",
    trainingDays: 3,
    communicationPlan: "CFO-led announcement. Finance leadership alignment workshop. Mapping walkthrough sessions.",
    resistanceRisk: "high",
    readinessScore: 0.25,
    mitigationStrategy: "Involve controllers in mapping design. Provide side-by-side report comparison. Extended parallel run period.",
    functionalArea: "Finance",
    status: "identified",
  },
];
```

## 13. Open Questions (numbered, with recommended answers)

| # | Question | Recommended Answer |
|---|---|---|
| 1 | Should OCM impacts support multiple `impactedRole` values (e.g., impact affects both AP Clerk and AP Manager)? | **No for MVP.** Create separate impact entries per role. This provides better granularity for training planning and readiness tracking. Revisit if users find this too cumbersome. |
| 2 | Should the readiness score be auto-calculated from sub-factors (awareness, desire, knowledge, ability, reinforcement -- ADKAR)? | **Defer.** ADKAR integration is a Phase 25+ enhancement. For MVP, a single 0-1 score entered by the assessor is sufficient. |
| 3 | Should we auto-generate OCM impacts from gap resolutions (e.g., every "ADAPT_PROCESS" gap = process change impact)? | **Yes, as a suggestion engine in a future phase.** For MVP, manual creation only. Add a "Suggest Impacts" button placeholder in the UI. |
| 4 | Should the heatmap support drill-down to filter the table? | **Yes.** Clicking a heatmap cell filters the table view to that role+area combination. Implement in MVP. |
| 5 | Should communication plans be structured (target audience, channel, timing) instead of free text? | **Defer.** Free text is sufficient for assessment-phase planning. Structured communication plans belong in a dedicated OCM tool, not the assessment platform. |
| 6 | Should we track "before" and "after" process descriptions for each impact? | **Defer.** This is valuable but significantly increases form complexity. Use the `description` field for now. Consider adding `currentProcess` and `futureProcess` fields in a follow-up. |
| 7 | Should OCM impacts be visible to external stakeholders (process owners, executives) before consultant review? | **Yes.** Visibility promotes transparency. Process owners should see impacts in their area. Use status field to indicate review state. |

## 14. Acceptance Criteria (Given/When/Then)

### AC-16.1: View OCM Impact Register

```
Given a user is authenticated and is a stakeholder on assessment "A1"
When the user navigates to the OCM Impact Register page for "A1"
Then the page displays summary cards (total impacts, training required count, high/transformational count, average readiness)
And a table of all OCM impacts for "A1" is shown
And the table is paginated with 50 items per page
```

### AC-16.2: Create OCM Impact with Training

```
Given a consultant user is on the OCM Impact Register page for assessment "A1"
When the user clicks "Add Impact" and fills in:
  - impactTitle: "New Approval Workflow"
  - description: "Three-level approval replaces single-level"
  - impactedRole: "Line Manager"
  - changeType: "PROCESS_CHANGE"
  - impactSeverity: "medium"
  - trainingRequired: true
  - trainingType: "e_learning"
  - trainingDays: 1
And clicks "Save"
Then a new OCM impact is created with status "identified"
And a DecisionLogEntry is created with action "OCM_IMPACT_CREATED"
And the table refreshes to show the new row
```

### AC-16.3: Training Required Validation

```
Given a user is creating a new OCM impact
When the user sets trainingRequired to true but does not select a trainingType
And clicks "Save"
Then the API returns 400 with message "Training type is required when training is marked as required"
And the form highlights the trainingType field with an error
```

### AC-16.4: Readiness Score Entry

```
Given an OCM impact "AP Invoice Processing Automation" exists with readinessScore null
When the user edits the impact and drags the readiness slider to 65% (0.65)
And clicks "Save"
Then the impact is updated with readinessScore = 0.65
And the ReadinessBar in the table row shows 65% filled
And the summary card average readiness recalculates
```

### AC-16.5: Heatmap View

```
Given assessment "A1" has OCM impacts across 3 roles and 4 functional areas
When the user switches to the "Heatmap View" tab
Then a grid is displayed with roles on the Y-axis and areas on the X-axis
And cells are color-coded by maxSeverity (green=low, yellow=medium, orange=high, red=transformational)
And hovering a cell shows a tooltip with impactCount and avgReadiness
```

### AC-16.6: Heatmap Drill-Down

```
Given the heatmap shows a red cell at (AP Clerk, Finance) with 3 impacts
When the user clicks that cell
Then the view switches to the Table tab
And the table is filtered to show only impacts where impactedRole="AP Clerk" AND functionalArea="Finance"
```

### AC-16.7: Filter by Severity

```
Given the OCM register has 2 transformational, 3 high, 5 medium, 2 low severity impacts
When the user selects impactSeverity filter "transformational"
Then only the 2 transformational impacts are displayed
And summary cards update to reflect the filtered subset
```

### AC-16.8: Process Owner Area-Locked Access

```
Given a process_owner user is assigned to areas ["Finance", "Controlling"]
When the user views the OCM Impact Register for assessment "A1"
Then only impacts where functionalArea is "Finance" or "Controlling" are visible
And the user can create new impacts only with functionalArea in their assigned areas
And the heatmap is not shown (requires cross-area visibility)
```

### AC-16.9: Summary Statistics

```
Given assessment "A1" has 7 OCM impacts with:
  - 4 trainingRequired, total trainingDays = 15.5
  - readinessScores: [0.4, 0.2, 0.6, 0.7, 0.15, 0.8, 0.25]
  - severities: [high, transformational, medium, medium, high, low, transformational]
When the user loads the summary endpoint
Then totalTrainingDays = 15.5
And averageReadinessScore is the severity-weighted average (not simple average)
And severityDistribution shows correct counts per level
```

### AC-16.10: Locked Assessment

```
Given assessment "A1" has status "signed_off"
When any user navigates to the OCM Impact Register
Then all data is displayed in read-only mode
And create, edit, and delete actions are disabled
And readiness score sliders are disabled
```

## 15. Size Estimate

| Component | Estimate |
|---|---|
| Prisma schema + migration | 0.5 day |
| Zod validation schemas | 0.5 day |
| API routes (6 endpoints) | 2.5 days |
| Readiness calculation + heatmap logic | 1 day |
| Permission logic | 0.5 day |
| UI: OcmImpactRegisterPage + Client wrapper | 1 day |
| UI: OcmImpactFormDialog (complex, with conditional fields) | 1.5 days |
| UI: OcmImpactTable + FilterBar | 1 day |
| UI: OcmSummaryCards + ReadinessGauge | 1 day |
| UI: OcmHeatmapGrid + drill-down | 1.5 days |
| UI: OcmImpactDetailPanel | 0.5 day |
| Seed data | 0.25 day |
| Unit + integration tests | 2 days |
| E2E tests | 1 day |
| **Total** | **~14 days (Size M)** |

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `OcmImpact` model
- [ ] Migration applied successfully to dev and staging databases
- [ ] Zod validation schemas created in `src/lib/validation/ocm-impact.ts`
- [ ] `GET /api/assessments/[id]/ocm-impacts` returns paginated, filtered list
- [ ] `POST /api/assessments/[id]/ocm-impacts` creates impact with validation
- [ ] `PUT /api/assessments/[id]/ocm-impacts/[impactId]` updates with optimistic locking
- [ ] `DELETE /api/assessments/[id]/ocm-impacts/[impactId]` hard-deletes with decision log
- [ ] `GET /api/assessments/[id]/ocm-impacts/summary` returns aggregations with weighted readiness
- [ ] `GET /api/assessments/[id]/ocm-impacts/heatmap` returns role-vs-area grid
- [ ] Training validation: `trainingType` required when `trainingRequired` is true
- [ ] Readiness score validation: 0.0 to 1.0 range enforced
- [ ] Related gap cross-assessment check implemented
- [ ] All mutations create `DecisionLogEntry` records
- [ ] Permission checks enforce role-based access per Section 7 matrix
- [ ] Area-locked filtering works for `process_owner` role
- [ ] Project manager has create/edit access
- [ ] Assessment status lock prevents edits when `signed_off`
- [ ] `OcmImpactRegisterPage` renders with summary cards, filter bar, and tabbed view
- [ ] `OcmImpactFormDialog` shows/hides training fields conditionally
- [ ] `OcmSummaryCards` shows ReadinessGauge with weighted average
- [ ] `OcmHeatmapGrid` renders with correct colors and tooltips
- [ ] Heatmap cell click filters table view
- [ ] `OcmImpactDetailPanel` displays full read-only view
- [ ] Table supports client-side sorting
- [ ] Pagination works with cursor-based navigation
- [ ] Readiness slider debounces at 300ms
- [ ] Seed data loads successfully for demo assessment
- [ ] Unit tests pass for Zod schemas, status transitions, readiness calculation, heatmap generation
- [ ] Integration tests pass for all 6 API endpoints
- [ ] E2E tests pass for create, filter, heatmap, readiness, delete flows
- [ ] No TypeScript `strict` mode errors
- [ ] No ESLint warnings in new files
