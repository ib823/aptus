# Phase 14: Integration Register

## 1. Overview

The Integration Register introduces a dedicated register for tracking integration points discovered during a Fit-to-Standard assessment. SAP S/4HANA Cloud Public Edition projects require clear documentation of every interface between S/4HANA and surrounding systems (legacy ERPs, third-party SaaS, banks, EDI partners, government portals, etc.). Each integration point captures: source and target systems, interface type (file, API, iDoc, RFC, CPI, OData, BAPI), direction (inbound/outbound/bidirectional), frequency (real-time, batch daily, batch weekly, event-driven, on-demand), data objects exchanged, middleware requirement, complexity estimate, priority, status, and current-state documentation.

This register sits alongside the existing Gap Register and Remaining Items Register within an assessment, giving consultants and IT leads a single place to catalog all integration work that will flow into the Realize phase.

**Source**: V2 Brief Section A5.5

## 2. Dependencies

| Dependency | Type | Detail |
|---|---|---|
| Prisma 6 | Runtime | New `IntegrationPoint` model; migration required |
| Assessment model | Schema | FK `assessmentId` references `Assessment.id` |
| ScopeItem model | Schema | Optional FK `relatedScopeItemId` references `ScopeItem.id` (no DB constraint, application-level) |
| Auth / Session | Runtime | `getCurrentUser()` + `isMfaRequired()` for all routes |
| Permissions | Runtime | `canEditStepResponse()` pattern reused; new `canManageIntegrations()` helper |
| shadcn/ui | UI | `Dialog`, `Table`, `Select`, `Input`, `Badge`, `Card`, `Textarea` |
| Zod 3 | Validation | Request body schemas |
| React 19 | UI | Server Components for page, Client Components for form dialog |
| Next.js 16 | Routing | App Router `/api/assessments/[id]/integrations/...` |

No dependency on other V2 phases. This phase can be built independently.

## 3. Data Model Changes (Prisma syntax)

```prisma
model IntegrationPoint {
  id                 String   @id @default(cuid())
  assessmentId       String
  name               String
  description        String   @db.Text
  sourceSystem       String
  targetSystem       String
  direction          String   // "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL"
  interfaceType      String   // "FILE" | "API" | "IDOC" | "RFC" | "CPI" | "ODATA" | "BAPI"
  frequency          String   // "REAL_TIME" | "BATCH_DAILY" | "BATCH_WEEKLY" | "EVENT_DRIVEN" | "ON_DEMAND"
  dataObjects        String[] @default([])
  middlewareRequired String?  // "CPI" | "MuleSoft" | "Dell_Boomi" | "None"
  complexity         String?  // "low" | "medium" | "high"
  estimatedEffortDays Float?
  priority           String?  // "critical" | "high" | "medium" | "low"
  status             String   @default("identified") // "identified" | "analyzed" | "designed" | "approved"
  relatedScopeItemId String?
  functionalArea     String?
  notes              String?  @db.Text
  createdBy          String
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  assessment Assessment @relation(fields: [assessmentId], references: [id])

  @@index([assessmentId])
  @@index([assessmentId, status])
  @@index([functionalArea])
}
```

**Assessment model update** -- add relation field:

```prisma
model Assessment {
  // ... existing fields ...
  integrationPoints IntegrationPoint[]
}
```

## 4. API Routes (method, path, request/response with Zod schemas)

### Shared Zod Enums

```typescript
// src/lib/validation/integration.ts
import { z } from "zod";

export const IntegrationDirection = z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]);
export type IntegrationDirection = z.infer<typeof IntegrationDirection>;

export const InterfaceType = z.enum(["FILE", "API", "IDOC", "RFC", "CPI", "ODATA", "BAPI"]);
export type InterfaceType = z.infer<typeof InterfaceType>;

export const IntegrationFrequency = z.enum([
  "REAL_TIME", "BATCH_DAILY", "BATCH_WEEKLY", "EVENT_DRIVEN", "ON_DEMAND",
]);
export type IntegrationFrequency = z.infer<typeof IntegrationFrequency>;

export const MiddlewareOption = z.enum(["CPI", "MuleSoft", "Dell_Boomi", "None"]);
export type MiddlewareOption = z.infer<typeof MiddlewareOption>;

export const IntegrationComplexity = z.enum(["low", "medium", "high"]);
export type IntegrationComplexity = z.infer<typeof IntegrationComplexity>;

export const IntegrationPriority = z.enum(["critical", "high", "medium", "low"]);
export type IntegrationPriority = z.infer<typeof IntegrationPriority>;

export const IntegrationStatus = z.enum(["identified", "analyzed", "designed", "approved"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatus>;
```

### 4.1 GET /api/assessments/[id]/integrations

List integration points with optional filters.

**Query Parameters**:

```typescript
const IntegrationListParams = z.object({
  direction: IntegrationDirection.optional(),
  interfaceType: InterfaceType.optional(),
  status: IntegrationStatus.optional(),
  functionalArea: z.string().optional(),
  priority: IntegrationPriority.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
```

**Response** `200`:

```typescript
interface IntegrationListResponse {
  data: IntegrationPoint[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

**Errors**: `401` Unauthorized, `403` MFA required / Forbidden.

### 4.2 POST /api/assessments/[id]/integrations

Create a new integration point.

**Request Body**:

```typescript
const CreateIntegrationSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  sourceSystem: z.string().min(1).max(200),
  targetSystem: z.string().min(1).max(200),
  direction: IntegrationDirection,
  interfaceType: InterfaceType,
  frequency: IntegrationFrequency,
  dataObjects: z.array(z.string().min(1).max(200)).default([]),
  middlewareRequired: MiddlewareOption.optional(),
  complexity: IntegrationComplexity.optional(),
  estimatedEffortDays: z.number().min(0).max(999).optional(),
  priority: IntegrationPriority.optional(),
  relatedScopeItemId: z.string().optional(),
  functionalArea: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});
```

**Response** `201`:

```typescript
interface CreateIntegrationResponse {
  data: IntegrationPoint;
}
```

**Errors**: `400` Validation, `401` Unauthorized, `403` Forbidden / MFA required, `404` Assessment not found.

### 4.3 PUT /api/assessments/[id]/integrations/[integrationId]

Update an existing integration point.

**Request Body**:

```typescript
const UpdateIntegrationSchema = CreateIntegrationSchema.partial().extend({
  status: IntegrationStatus.optional(),
});
```

**Response** `200`:

```typescript
interface UpdateIntegrationResponse {
  data: IntegrationPoint;
}
```

**Errors**: `400` Validation, `401`, `403`, `404` Integration not found.

### 4.4 DELETE /api/assessments/[id]/integrations/[integrationId]

Soft-delete not required -- hard delete with decision log entry.

**Response** `200`:

```typescript
interface DeleteIntegrationResponse {
  data: { deleted: true; id: string };
}
```

**Errors**: `401`, `403`, `404`.

### 4.5 GET /api/assessments/[id]/integrations/summary

Aggregated statistics for the register.

**Response** `200`:

```typescript
interface IntegrationSummaryResponse {
  data: {
    total: number;
    byDirection: Record<string, number>;   // INBOUND: 5, OUTBOUND: 3, BIDIRECTIONAL: 2
    byInterfaceType: Record<string, number>;
    byStatus: Record<string, number>;
    byComplexity: Record<string, number>;
    byPriority: Record<string, number>;
    totalEstimatedDays: number;
  };
}
```

## 5. UI Components (component tree, props, state)

### Component Tree

```
IntegrationRegisterPage (RSC)
  +-- IntegrationRegisterClient (client boundary)
        +-- IntegrationSummaryCards
        |     +-- StatCard (total, by-direction, by-status, effort days)
        +-- IntegrationFilterBar
        |     +-- Select (direction)
        |     +-- Select (interfaceType)
        |     +-- Select (status)
        |     +-- Select (priority)
        |     +-- Input (functionalArea search)
        |     +-- Button (Clear filters)
        +-- IntegrationTable
        |     +-- TableHeader (sortable: name, sourceSystem, direction, type, status, priority)
        |     +-- TableRow (per integration)
        |     |     +-- Badge (direction)
        |     |     +-- Badge (interfaceType)
        |     |     +-- Badge (status, color-coded)
        |     |     +-- Badge (priority, color-coded)
        |     |     +-- DropdownMenu (Edit, Delete, View Detail)
        |     +-- TablePagination
        +-- IntegrationFormDialog (sheet/dialog for create & edit)
        |     +-- Input (name)
        |     +-- Textarea (description)
        |     +-- Input (sourceSystem)
        |     +-- Input (targetSystem)
        |     +-- Select (direction)
        |     +-- Select (interfaceType)
        |     +-- Select (frequency)
        |     +-- TagInput (dataObjects)
        |     +-- Select (middlewareRequired)
        |     +-- Select (complexity)
        |     +-- Input (estimatedEffortDays)
        |     +-- Select (priority)
        |     +-- ScopeItemCombobox (relatedScopeItemId)
        |     +-- Input (functionalArea)
        |     +-- Textarea (notes)
        |     +-- Button (Save / Cancel)
        +-- IntegrationDetailPanel (slide-over for read view)
              +-- DescriptionList (all fields)
              +-- RelatedScopeItemLink
              +-- AuditInfo (createdBy, createdAt, updatedAt)
```

### Key Props & State

```typescript
// IntegrationRegisterClient
interface IntegrationRegisterClientProps {
  assessmentId: string;
  userRole: UserRole;
  canEdit: boolean;
}
// Internal state managed with useState + SWR/fetch:
// - integrations: IntegrationPoint[]
// - filters: IntegrationFilters
// - formOpen: boolean
// - editingId: string | null
// - detailId: string | null
// - summary: IntegrationSummary

// IntegrationFormDialog
interface IntegrationFormDialogProps {
  assessmentId: string;
  integration?: IntegrationPoint; // undefined = create mode
  open: boolean;
  onClose: () => void;
  onSaved: (integration: IntegrationPoint) => void;
}

// IntegrationSummaryCards
interface IntegrationSummaryCardsProps {
  summary: IntegrationSummary;
}
```

## 6. Business Logic (algorithms, state machines, validation rules)

### Integration Status State Machine

```
identified --> analyzed --> designed --> approved
     ^                          |
     +--- (reopen) <------------+
```

Valid transitions:
- `identified` -> `analyzed` (any editor)
- `analyzed` -> `designed` (any editor)
- `designed` -> `approved` (consultant or admin only)
- `approved` -> `identified` (consultant or admin only -- reopen)
- Backward transitions `designed` -> `analyzed`, `analyzed` -> `identified` allowed for any editor.

### Validation Rules

1. **Name uniqueness**: Within an assessment, `name` should be unique (warn, not block).
2. **Effort range**: `estimatedEffortDays` must be between 0 and 999.
3. **Data objects**: Each string in `dataObjects` must be non-empty, max 200 chars, max 50 entries.
4. **Related scope item**: If `relatedScopeItemId` is provided, validate it exists in the assessment's scope selections.
5. **Direction coherence**: If `direction` is `INBOUND`, `targetSystem` should logically be "S/4HANA" (warning, not blocking).
6. **Status transition**: `approved` status can only be set by consultant or admin roles.

### Decision Log Integration

Every create, update, and delete operation writes a `DecisionLogEntry` with:
- `entityType`: `"integration_point"`
- `entityId`: the integration point ID
- `action`: `"INTEGRATION_CREATED"` | `"INTEGRATION_UPDATED"` | `"INTEGRATION_DELETED"` | `"INTEGRATION_STATUS_CHANGED"`
- `oldValue` / `newValue`: JSON diff of changed fields

## 7. Permissions & Access Control (role x action matrix)

| Action | admin | consultant | project_manager | process_owner | it_lead | executive | viewer |
|---|---|---|---|---|---|---|---|
| View integration register | Yes | Yes | Yes | Yes (own area) | Yes | Yes | Yes |
| Create integration point | Yes | Yes | No | No | Yes | No | No |
| Edit integration point | Yes | Yes | No | No | Yes (notes/status only) | No | No |
| Delete integration point | Yes | Yes | No | No | No | No | No |
| Approve integration (set status=approved) | Yes | Yes | No | No | No | No | No |
| Export integration register | Yes | Yes | Yes | Yes (own area) | Yes | Yes | No |

**Area locking**: Process owners only see integrations where `functionalArea` matches their `assignedAreas`. IT leads have full cross-area visibility within the integration register.

**Notes**: The V1 5-role model applies until Phase 17 is implemented. The matrix above shows the target state. Until Phase 17, map: `admin` = admin, `consultant` = consultant, `it_lead` = it_lead, `process_owner` = process_owner, `executive` = executive.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients |
|---|---|---|
| Integration point created | In-app toast | Creator (confirmation) |
| Integration point status -> `approved` | Email + In-app | IT lead stakeholders on the assessment |
| Integration register > 20 items | In-app banner | Consultant lead (complexity warning) |
| Integration deleted | In-app toast | Creator (confirmation) |
| Bulk import completed | In-app toast | Importer |

**Note**: Email notification infrastructure is not yet built. Phase 14 defines the triggers; actual delivery depends on the notification subsystem (future phase). In-app toasts are implemented immediately via `sonner` (already in the stack).

## 9. Edge Cases & Error Handling

| # | Scenario | Handling |
|---|---|---|
| 1 | Assessment is in `signed_off` status | Return `403` with message "Assessment is locked after sign-off. No edits allowed." |
| 2 | Concurrent edit of same integration | Last-write-wins with `updatedAt` optimistic locking. If `updatedAt` in request body does not match DB, return `409 Conflict`. |
| 3 | Deleting an integration that is referenced by a RemainingItem | Allow delete but log warning. Do not cascade-delete the RemainingItem; it becomes orphaned with a note. |
| 4 | `relatedScopeItemId` references a scope item not in assessment scope | Validation warning returned in response `warnings[]` array, but creation is allowed. |
| 5 | Very long `dataObjects` array (>50 entries) | Reject with `400` validation error. |
| 6 | User provides duplicate `name` within assessment | Return `warnings: ["An integration with this name already exists"]` but allow save. |
| 7 | `estimatedEffortDays` is negative | Reject with `400` validation error (Zod `min(0)` handles this). |
| 8 | Network timeout during save | Client retries with exponential backoff (1s, 2s, 4s). Server is idempotent for create (check name+assessment dedupe within 5s window). |

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Large assessments with 100+ integrations | Cursor-based pagination (50 per page default). Composite index `[assessmentId, status]` covers the most common filter. |
| Summary endpoint aggregation | Use Prisma `groupBy` queries with `_count` and `_sum`. For assessments with < 500 integrations, this completes in < 50ms. |
| Filter combinations | Index on `[assessmentId]` handles all filter queries since Prisma applies WHERE clauses post-index scan. `functionalArea` index covers area-filtered views. |
| Client-side re-renders | Use `React.memo` on `IntegrationTable` rows. `useSWR` with `revalidateOnFocus: false` to prevent unnecessary refetches. |
| Table sorting | Client-side sorting for current page. Server-side sorting via `orderBy` param if full dataset sorting is needed (deferred to post-MVP). |

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

| Test | Location | Description |
|---|---|---|
| `CreateIntegrationSchema` validation | `__tests__/lib/validation/integration.test.ts` | Verify Zod schema accepts valid payloads, rejects invalid directions, interface types, missing required fields |
| Status transition validation | `__tests__/lib/business/integration-status.test.ts` | Verify allowed and disallowed status transitions |
| Permission checks | `__tests__/lib/auth/integration-permissions.test.ts` | Verify role-based access for each action |

### Integration Tests

| Test | Location | Description |
|---|---|---|
| CRUD lifecycle | `__tests__/api/integrations.test.ts` | Create -> Read -> Update -> Delete via API routes; verify DB state after each |
| Area-locked access | `__tests__/api/integrations-permissions.test.ts` | Process owner can only see integrations in assigned area |
| Summary aggregation | `__tests__/api/integrations-summary.test.ts` | Create 10 integrations with varied types; verify summary counts |
| Decision log entries | `__tests__/api/integrations-audit.test.ts` | Verify DecisionLogEntry created for every mutation |
| Optimistic lock conflict | `__tests__/api/integrations-concurrency.test.ts` | Send two PUTs with same `updatedAt`; second returns `409` |

### E2E Tests (Playwright)

| Test | File | Description |
|---|---|---|
| Register page loads | `e2e/integration-register.spec.ts` | Navigate to assessment -> Integrations tab; verify table renders |
| Create flow | `e2e/integration-register.spec.ts` | Click "Add Integration", fill form, submit; verify row appears |
| Filter flow | `e2e/integration-register.spec.ts` | Select direction filter "INBOUND"; verify only inbound rows visible |
| Edit flow | `e2e/integration-register.spec.ts` | Click edit on row, change status to "analyzed", save; verify badge updates |
| Delete flow | `e2e/integration-register.spec.ts` | Click delete, confirm dialog; verify row removed |

## 12. Migration & Seed Data

### Prisma Migration

```bash
npx prisma migrate dev --name add-integration-register
```

This creates the `IntegrationPoint` table with all columns and indexes as defined in Section 3.

### Seed Data

Provide 5 seed integration points for the demo assessment:

```typescript
// prisma/seed-integrations.ts
const seedIntegrations = [
  {
    name: "Bank Statement Import",
    description: "Daily import of bank statements from corporate banking portal for automatic reconciliation in S/4HANA Cash Management.",
    sourceSystem: "Deutsche Bank Portal",
    targetSystem: "S/4HANA Cloud",
    direction: "INBOUND",
    interfaceType: "FILE",
    frequency: "BATCH_DAILY",
    dataObjects: ["Bank Statement MT940", "BAI2 Format"],
    middlewareRequired: "CPI",
    complexity: "medium",
    estimatedEffortDays: 8,
    priority: "critical",
    status: "analyzed",
    functionalArea: "Finance",
  },
  {
    name: "Customer Master Sync",
    description: "Real-time synchronization of customer master data between CRM and S/4HANA Business Partner.",
    sourceSystem: "Salesforce CRM",
    targetSystem: "S/4HANA Cloud",
    direction: "BIDIRECTIONAL",
    interfaceType: "API",
    frequency: "REAL_TIME",
    dataObjects: ["Business Partner", "Customer", "Contact Person"],
    middlewareRequired: "CPI",
    complexity: "high",
    estimatedEffortDays: 15,
    priority: "critical",
    status: "identified",
    functionalArea: "Sales",
  },
  {
    name: "Purchase Order to Supplier",
    description: "Outbound purchase orders sent to key suppliers via EDI.",
    sourceSystem: "S/4HANA Cloud",
    targetSystem: "Supplier EDI Network",
    direction: "OUTBOUND",
    interfaceType: "IDOC",
    frequency: "EVENT_DRIVEN",
    dataObjects: ["Purchase Order ORDERS05"],
    middlewareRequired: "CPI",
    complexity: "medium",
    estimatedEffortDays: 10,
    priority: "high",
    status: "identified",
    functionalArea: "Procurement",
  },
  {
    name: "Tax Reporting to LHDN",
    description: "Monthly tax reporting submission to Malaysian Inland Revenue Board (LHDN).",
    sourceSystem: "S/4HANA Cloud",
    targetSystem: "LHDN e-Filing",
    direction: "OUTBOUND",
    interfaceType: "API",
    frequency: "BATCH_WEEKLY",
    dataObjects: ["Tax Return Data", "e-Invoice XML"],
    middlewareRequired: "None",
    complexity: "low",
    estimatedEffortDays: 5,
    priority: "medium",
    status: "identified",
    functionalArea: "Finance",
  },
  {
    name: "Warehouse Management Events",
    description: "Event-driven goods receipt and goods issue postings from third-party WMS.",
    sourceSystem: "Manhattan WMS",
    targetSystem: "S/4HANA Cloud",
    direction: "INBOUND",
    interfaceType: "ODATA",
    frequency: "EVENT_DRIVEN",
    dataObjects: ["Goods Receipt", "Goods Issue", "Stock Transfer"],
    middlewareRequired: "CPI",
    complexity: "high",
    estimatedEffortDays: 20,
    priority: "high",
    status: "identified",
    functionalArea: "Warehouse Management",
  },
];
```

## 13. Open Questions (numbered, with recommended answers)

| # | Question | Recommended Answer |
|---|---|---|
| 1 | Should integration points support file attachments (e.g., interface spec PDFs)? | **Defer to Phase 20+ (Document Attachments).** For now, use the `notes` field to reference external documents. |
| 2 | Should we support bulk import of integrations from CSV/Excel? | **Yes, but defer to a fast-follow.** The register UI is the priority. CSV import can reuse the existing ingest pattern. |
| 3 | Should `relatedScopeItemId` be a hard FK constraint? | **No.** Keep it application-level only. Integration points may reference scope items that are later de-scoped. |
| 4 | Should we track integration versioning (e.g., v1 spec, v2 spec)? | **No for MVP.** The decision log provides an audit trail of changes. Explicit versioning is over-engineering at this stage. |
| 5 | Should the summary endpoint include effort-by-functional-area breakdown? | **Yes.** Include `byFunctionalArea: Record<string, { count: number; totalDays: number }>` in the summary response. |
| 6 | Should integrations be exportable as part of the assessment report? | **Yes.** Add an "Integration Register" sheet to the Excel report (Phase 22 scope). Define the data shape here. |

## 14. Acceptance Criteria (Given/When/Then)

### AC-14.1: View Integration Register

```
Given a user is authenticated and is a stakeholder on assessment "A1"
When the user navigates to the Integration Register page for "A1"
Then the page displays a table of all integration points for "A1"
And summary cards show total count, count by direction, count by status
And the table is paginated with 50 items per page
```

### AC-14.2: Create Integration Point

```
Given a consultant user is on the Integration Register page for assessment "A1"
When the user clicks "Add Integration" and fills in:
  - name: "Payroll Export"
  - sourceSystem: "S/4HANA Cloud"
  - targetSystem: "ADP Payroll"
  - direction: "OUTBOUND"
  - interfaceType: "API"
  - frequency: "BATCH_DAILY"
And clicks "Save"
Then a new integration point is created with status "identified"
And a DecisionLogEntry is created with action "INTEGRATION_CREATED"
And the table refreshes to show the new row
And a success toast is displayed
```

### AC-14.3: Filter Integrations

```
Given the Integration Register for "A1" has 10 integrations (5 INBOUND, 3 OUTBOUND, 2 BIDIRECTIONAL)
When the user selects direction filter "INBOUND"
Then only the 5 INBOUND integrations are displayed
And the summary cards update to reflect the filtered subset
```

### AC-14.4: Edit Integration Point

```
Given integration "Bank Statement Import" exists with status "identified"
When the consultant clicks edit and changes status to "analyzed" and adds notes "Confirmed MT940 format"
And clicks "Save"
Then the integration is updated in the database
And a DecisionLogEntry is created with action "INTEGRATION_STATUS_CHANGED"
And the table row updates to show "analyzed" badge
```

### AC-14.5: Delete Integration Point

```
Given integration "Deprecated Interface" exists for assessment "A1"
When the consultant clicks delete and confirms the dialog
Then the integration is hard-deleted from the database
And a DecisionLogEntry is created with action "INTEGRATION_DELETED"
And the row is removed from the table
```

### AC-14.6: Area-Locked Access (Process Owner)

```
Given a process_owner user is assigned to areas ["Finance", "Controlling"]
When the user views the Integration Register for assessment "A1"
Then only integrations where functionalArea is "Finance" or "Controlling" are visible
And the "Add Integration" button is not displayed
```

### AC-14.7: IT Lead Permissions

```
Given an it_lead user is a stakeholder on assessment "A1"
When the user views the Integration Register
Then all integrations across all functional areas are visible
And the user can create new integration points
And the user can edit notes and status on existing integrations
But the user cannot delete integration points
```

### AC-14.8: Locked Assessment

```
Given assessment "A1" has status "signed_off"
When any user navigates to the Integration Register
Then all integration data is displayed in read-only mode
And the "Add Integration" button is disabled
And edit and delete actions are hidden
```

### AC-14.9: Summary Statistics

```
Given assessment "A1" has 15 integrations:
  - 8 INBOUND, 4 OUTBOUND, 3 BIDIRECTIONAL
  - 6 identified, 5 analyzed, 3 designed, 1 approved
  - Total estimated effort: 125 days
When the user loads the summary endpoint
Then the response contains accurate counts for each dimension
And totalEstimatedDays equals 125
```

## 15. Size Estimate

| Component | Estimate |
|---|---|
| Prisma schema + migration | 0.5 day |
| Zod validation schemas | 0.5 day |
| API routes (5 endpoints) | 2 days |
| Permission logic | 0.5 day |
| UI: IntegrationRegisterPage + Client wrapper | 1 day |
| UI: IntegrationFormDialog | 1 day |
| UI: IntegrationTable + FilterBar | 1 day |
| UI: IntegrationSummaryCards | 0.5 day |
| UI: IntegrationDetailPanel | 0.5 day |
| Seed data | 0.25 day |
| Unit + integration tests | 1.5 days |
| E2E tests | 1 day |
| **Total** | **~10 days (Size M)** |

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `IntegrationPoint` model
- [ ] Migration applied successfully to dev and staging databases
- [ ] Zod validation schemas created in `src/lib/validation/integration.ts`
- [ ] `GET /api/assessments/[id]/integrations` returns paginated, filtered list
- [ ] `POST /api/assessments/[id]/integrations` creates integration with validation
- [ ] `PUT /api/assessments/[id]/integrations/[integrationId]` updates with optimistic locking
- [ ] `DELETE /api/assessments/[id]/integrations/[integrationId]` hard-deletes with decision log
- [ ] `GET /api/assessments/[id]/integrations/summary` returns accurate aggregations
- [ ] All mutations create `DecisionLogEntry` records
- [ ] Permission checks enforce role-based access per Section 7 matrix
- [ ] Area-locked filtering works for `process_owner` role
- [ ] Assessment status lock prevents edits when `signed_off`
- [ ] `IntegrationRegisterPage` renders with summary cards, filter bar, and table
- [ ] `IntegrationFormDialog` opens for create and edit with all fields
- [ ] `IntegrationDetailPanel` displays full read-only view
- [ ] Table supports client-side sorting by name, direction, type, status, priority
- [ ] Pagination works with cursor-based navigation
- [ ] Seed data loads successfully for demo assessment
- [ ] Unit tests pass for Zod schemas, status transitions, permissions
- [ ] Integration tests pass for all 5 API endpoints
- [ ] E2E tests pass for create, read, filter, edit, delete flows
- [ ] No TypeScript `strict` mode errors
- [ ] No ESLint warnings in new files
