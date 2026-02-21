# Phase 18: Assessment Lifecycle & Status Machine

## 1. Overview

Expand the assessment lifecycle from 5 linear states (`draft` -> `in_progress` -> `completed` -> `reviewed` -> `signed_off`) to a richer state machine supporting parallel workstreams, workshop sessions, review cycles, ALM hand-off, and archival. Add formal phase-progress tracking within an assessment so stakeholders can see granular completion across scoping, process review, gap resolution, integration, data migration, OCM, validation, and sign-off phases.

**Source**: V2 Brief Section A7 + Addendum 1 Section 5 (workshop states)

### Goals
- Replace the linear 5-state model with a 10-state machine that mirrors real SAP Fit-to-Standard project cadence
- Support parallel workstreams (scope selection and process review can overlap within constraints)
- Introduce formal gating between phases with completion-percentage tracking
- Enable workshop sessions as a first-class sub-state of `IN_PROGRESS`
- Provide role-gated transition validation for every status change
- Maintain backward compatibility with existing V1 assessments by mapping old statuses to new ones

### New Status Machine

```
DRAFT
  -> SCOPING (scope selection active)
  -> IN_PROGRESS (process review active)
    -> WORKSHOP_ACTIVE (during live workshop sessions)
    -> REVIEW_CYCLE (consultant review of client inputs)
  -> GAP_RESOLUTION (gap resolution active)
  -> PENDING_VALIDATION (all work complete, awaiting validation)
  -> VALIDATED (validation complete)
  -> PENDING_SIGN_OFF (awaiting executive sign-off)
  -> SIGNED_OFF (signed, immutable)
  -> HANDED_OFF (exported to ALM)
  -> ARCHIVED (archived)
```

---

## 2. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Prisma 6 + PostgreSQL | Infrastructure | Schema migration for new models and enum changes |
| Phase 17 RBAC (11 roles) | Phase | Role definitions used for transition validation |
| Existing `Assessment` model | Schema | Extended with new status values, not replaced |
| Existing `permissions.ts` | Code | `canTransitionStatus()` must be rewritten for new transitions |
| Existing `assessment.ts` types | Code | `AssessmentStatus` type union must expand |
| Zod 3.x | Library | Validation schemas for status transitions and phase progress |

---

## 3. Data Model Changes

### Modified: `Assessment` model

```prisma
model Assessment {
  // ... all existing fields unchanged ...

  // Status field expands to accept new values:
  // "draft" | "scoping" | "in_progress" | "workshop_active" | "review_cycle"
  // | "gap_resolution" | "pending_validation" | "validated"
  // | "pending_sign_off" | "signed_off" | "handed_off" | "archived"
  status             String    @default("draft")

  // New relations
  phaseProgress      AssessmentPhaseProgress[]
  workshopSessions   WorkshopSession[]
}
```

### New: `AssessmentPhaseProgress`

```prisma
model AssessmentPhaseProgress {
  id              String    @id @default(cuid())
  assessmentId    String
  phase           String    // "scoping" | "process_review" | "gap_resolution" | "integration" | "data_migration" | "ocm" | "validation" | "sign_off"
  status          String    @default("not_started") // "not_started" | "in_progress" | "completed" | "blocked"
  completionPct   Float     @default(0)
  startedAt       DateTime?
  completedAt     DateTime?
  blockedReason   String?   @db.Text
  blockedBy       String?   // userId who flagged the block
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  assessment Assessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)

  @@unique([assessmentId, phase])
  @@index([assessmentId])
  @@index([assessmentId, status])
}
```

### New: `WorkshopSession`

```prisma
model WorkshopSession {
  id                String    @id @default(cuid())
  assessmentId      String
  title             String
  sessionCode       String    @unique   // 6-char alphanumeric join code
  status            String    @default("scheduled") // "scheduled" | "active" | "completed" | "cancelled"
  scheduledAt       DateTime?
  startedAt         DateTime?
  endedAt           DateTime?
  facilitatorId     String
  scopeItemIds      String[]  @default([])
  attendeeCount     Int       @default(0)
  minutesGenerated  Boolean   @default(false)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  assessment Assessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)

  @@index([assessmentId])
  @@index([sessionCode])
  @@index([assessmentId, status])
}
```

### New: `StatusTransitionLog`

```prisma
model StatusTransitionLog {
  id              String   @id @default(cuid())
  assessmentId    String
  fromStatus      String
  toStatus        String
  triggeredBy     String   // userId
  triggeredByRole String
  reason          String?  @db.Text
  metadata        Json?    // optional context (e.g., workshop session ID)
  createdAt       DateTime @default(now())

  @@index([assessmentId])
  @@index([assessmentId, createdAt])
}
```

### TypeScript types (`src/types/assessment.ts`)

```typescript
export type AssessmentStatusV2 =
  | "draft"
  | "scoping"
  | "in_progress"
  | "workshop_active"
  | "review_cycle"
  | "gap_resolution"
  | "pending_validation"
  | "validated"
  | "pending_sign_off"
  | "signed_off"
  | "handed_off"
  | "archived";

export type AssessmentPhase =
  | "scoping"
  | "process_review"
  | "gap_resolution"
  | "integration"
  | "data_migration"
  | "ocm"
  | "validation"
  | "sign_off";

export type PhaseStatus = "not_started" | "in_progress" | "completed" | "blocked";

export type WorkshopSessionStatus = "scheduled" | "active" | "completed" | "cancelled";
```

### Zod Schemas (`src/lib/validation/assessment-lifecycle.ts`)

```typescript
import { z } from "zod";

export const AssessmentStatusV2Schema = z.enum([
  "draft", "scoping", "in_progress", "workshop_active", "review_cycle",
  "gap_resolution", "pending_validation", "validated",
  "pending_sign_off", "signed_off", "handed_off", "archived",
]);

export const AssessmentPhaseSchema = z.enum([
  "scoping", "process_review", "gap_resolution", "integration",
  "data_migration", "ocm", "validation", "sign_off",
]);

export const PhaseStatusSchema = z.enum(["not_started", "in_progress", "completed", "blocked"]);

export const TransitionRequestSchema = z.object({
  toStatus: AssessmentStatusV2Schema,
  reason: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const PhaseProgressUpdateSchema = z.object({
  phase: AssessmentPhaseSchema,
  status: PhaseStatusSchema,
  blockedReason: z.string().max(2000).optional(),
});

export const WorkshopSessionCreateSchema = z.object({
  title: z.string().min(1).max(200),
  scheduledAt: z.string().datetime().optional(),
  scopeItemIds: z.array(z.string()).default([]),
});

export const WorkshopSessionUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional(),
  scheduledAt: z.string().datetime().optional(),
  scopeItemIds: z.array(z.string()).optional(),
});
```

---

## 4. API Routes

### Assessment Status Transitions

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/transition` | Transition assessment status | Role-gated |
| `GET` | `/api/assessments/[id]/transitions` | Get transition history | Stakeholder |
| `GET` | `/api/assessments/[id]/available-transitions` | Get valid next states for current user | Stakeholder |

### Phase Progress

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/assessments/[id]/phases` | Get all phase progress records | Stakeholder |
| `PUT` | `/api/assessments/[id]/phases/[phase]` | Update phase status | `consultant`, `partner_lead`, `platform_admin` |
| `POST` | `/api/assessments/[id]/phases/recalculate` | Force recalculation of completion percentages | `consultant`, `platform_admin` |

### Workshop Sessions (lifecycle only; full workshop in Phase 21)

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/workshops` | Create workshop session | `consultant`, `partner_lead`, `solution_architect` |
| `GET` | `/api/assessments/[id]/workshops` | List sessions for assessment | Stakeholder |
| `GET` | `/api/assessments/[id]/workshops/[sessionId]` | Get session detail | Stakeholder |
| `PUT` | `/api/assessments/[id]/workshops/[sessionId]` | Update session | Facilitator or `consultant` |
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/start` | Start a session (transitions to `active`) | Facilitator |
| `POST` | `/api/assessments/[id]/workshops/[sessionId]/end` | End a session (transitions to `completed`) | Facilitator |

### Request/Response Examples

**POST `/api/assessments/[id]/transition`**
```json
// Request
{
  "toStatus": "scoping",
  "reason": "Kickoff complete, beginning scope selection"
}

// Response 200
{
  "id": "clx123...",
  "status": "scoping",
  "previousStatus": "draft",
  "transitionedAt": "2026-02-21T10:00:00Z",
  "transitionedBy": "user_abc"
}

// Response 403
{
  "error": "FORBIDDEN",
  "message": "Role process_owner cannot perform transition draft -> scoping"
}

// Response 409
{
  "error": "INVALID_TRANSITION",
  "message": "Cannot transition from draft to gap_resolution. Valid targets: scoping"
}
```

---

## 5. UI Components

### New Components

| Component | Location | Description |
|---|---|---|
| `AssessmentStatusBadge` | `src/components/assessment/AssessmentStatusBadge.tsx` | Color-coded badge for all 10+ states |
| `StatusTransitionButton` | `src/components/assessment/StatusTransitionButton.tsx` | Button/dropdown showing valid next transitions with confirmation dialog |
| `PhaseProgressTracker` | `src/components/assessment/PhaseProgressTracker.tsx` | Horizontal stepper showing phase progress with completion % |
| `PhaseProgressCard` | `src/components/assessment/PhaseProgressCard.tsx` | Card for individual phase with status, progress bar, blocked indicator |
| `StatusTransitionHistory` | `src/components/assessment/StatusTransitionHistory.tsx` | Timeline of all status changes |
| `WorkshopSessionList` | `src/components/workshop/WorkshopSessionList.tsx` | List of scheduled/active/completed workshops |
| `WorkshopCreateDialog` | `src/components/workshop/WorkshopCreateDialog.tsx` | Dialog for scheduling a new workshop |
| `AssessmentLifecycleDiagram` | `src/components/assessment/AssessmentLifecycleDiagram.tsx` | Visual state-machine diagram showing current position |

### Modified Components

| Component | Changes |
|---|---|
| Assessment detail page | Add PhaseProgressTracker, update status display |
| Assessment list page | Update status column with new badges |
| Dashboard | Show phase-level progress, upcoming workshops |

---

## 6. Business Logic

### Status Transition Matrix

```typescript
export const VALID_TRANSITIONS_V2: Record<AssessmentStatusV2, AssessmentStatusV2[]> = {
  draft:                ["scoping"],
  scoping:              ["in_progress", "draft"],                    // can revert to draft
  in_progress:          ["workshop_active", "review_cycle", "gap_resolution", "scoping"],
  workshop_active:      ["in_progress"],                              // returns after workshop ends
  review_cycle:         ["in_progress"],                              // returns after review cycle
  gap_resolution:       ["pending_validation", "in_progress"],
  pending_validation:   ["validated", "gap_resolution"],              // can revert if issues found
  validated:            ["pending_sign_off"],
  pending_sign_off:     ["signed_off", "validated"],                  // can revert
  signed_off:           ["handed_off", "archived"],
  handed_off:           ["archived"],
  archived:             [],                                           // terminal
};
```

### Transition Role Permissions

```typescript
export const TRANSITION_ROLE_MAP: Record<string, UserRole[]> = {
  "draft->scoping":                   ["platform_admin", "partner_lead", "consultant"],
  "scoping->in_progress":             ["platform_admin", "partner_lead", "consultant"],
  "scoping->draft":                   ["platform_admin", "partner_lead", "consultant"],
  "in_progress->workshop_active":     ["platform_admin", "consultant", "solution_architect"],
  "in_progress->review_cycle":        ["platform_admin", "consultant"],
  "in_progress->gap_resolution":      ["platform_admin", "consultant"],
  "in_progress->scoping":             ["platform_admin", "partner_lead"],
  "workshop_active->in_progress":     ["platform_admin", "consultant", "solution_architect"],
  "review_cycle->in_progress":        ["platform_admin", "consultant"],
  "gap_resolution->pending_validation": ["platform_admin", "consultant"],
  "gap_resolution->in_progress":      ["platform_admin", "consultant"],
  "pending_validation->validated":    ["platform_admin", "consultant", "partner_lead"],
  "pending_validation->gap_resolution": ["platform_admin", "consultant"],
  "validated->pending_sign_off":      ["platform_admin", "consultant", "partner_lead"],
  "pending_sign_off->signed_off":     ["platform_admin", "executive_sponsor", "partner_lead"],
  "pending_sign_off->validated":      ["platform_admin", "partner_lead"],
  "signed_off->handed_off":           ["platform_admin", "partner_lead"],
  "signed_off->archived":             ["platform_admin"],
  "handed_off->archived":             ["platform_admin"],
};
```

### Phase Gating Rules

```typescript
export const PHASE_PREREQUISITES: Record<AssessmentPhase, AssessmentPhase[]> = {
  scoping:          [],                          // no prerequisites
  process_review:   ["scoping"],                 // must complete scoping first
  gap_resolution:   ["process_review"],           // must complete process review
  integration:      ["scoping"],                  // can run parallel with process review
  data_migration:   ["scoping"],                  // can run parallel with process review
  ocm:              ["scoping"],                  // can run parallel with process review
  validation:       ["process_review", "gap_resolution"], // must complete both
  sign_off:         ["validation"],               // must validate first
};
```

### Auto-Completion Percentage Calculation

```typescript
/**
 * Compute completion percentage for each phase based on actual data.
 *
 * - scoping: % of scope items with a ScopeSelection response
 * - process_review: % of selected-scope process steps with a StepResponse
 * - gap_resolution: % of GAP-classified steps with a GapResolution
 * - integration: manual tracking (no auto-computation)
 * - data_migration: manual tracking
 * - ocm: manual tracking
 * - validation: (process_review completion + gap_resolution completion) / 2
 * - sign_off: 0 or 100 (AssessmentSignOff exists)
 */
async function computePhaseCompletion(assessmentId: string): Promise<Record<AssessmentPhase, number>> {
  // Implementation queries ScopeSelection, StepResponse, GapResolution counts
}
```

### Session Code Generation

```typescript
function generateSessionCode(): string {
  // 6-character alphanumeric, uppercase, no ambiguous chars (0/O, 1/I/L)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
```

### V1 Migration Mapping

```typescript
export const V1_TO_V2_STATUS_MAP: Record<string, AssessmentStatusV2> = {
  draft:       "draft",
  in_progress: "in_progress",
  completed:   "pending_validation",
  reviewed:    "validated",
  signed_off:  "signed_off",
};
```

---

## 7. Permissions & Access Control

| Action | Allowed Roles | Notes |
|---|---|---|
| Transition `draft -> scoping` | `platform_admin`, `partner_lead`, `consultant` | Must be org member |
| Transition to `workshop_active` | `platform_admin`, `consultant`, `solution_architect` | Must be facilitator or assessment stakeholder |
| Transition to `signed_off` | `platform_admin`, `executive_sponsor`, `partner_lead` | Requires at least one sign-off record |
| Transition to `archived` | `platform_admin` | Terminal state; admin only |
| Update phase progress | `platform_admin`, `partner_lead`, `consultant` | Only for manually tracked phases |
| Create workshop session | `platform_admin`, `consultant`, `partner_lead`, `solution_architect` | Must be assessment stakeholder |
| Start/end workshop | Designated facilitator, `platform_admin` | Facilitator set at creation time |
| View transition history | Any assessment stakeholder | Read-only for all stakeholders |
| View phase progress | Any assessment stakeholder | Read-only for all stakeholders |

### Immutability Rules

- `signed_off`: All StepResponse, GapResolution, ScopeSelection records become read-only. Only forward transitions allowed.
- `archived`: Entire assessment is read-only. No transitions possible.
- `handed_off`: Assessment is read-only except for metadata updates by `platform_admin`.

---

## 8. Notification Triggers

| Event | Recipients | Channel | Priority |
|---|---|---|---|
| Status transition | All assessment stakeholders | in_app, email | Normal |
| Phase completed | Assessment PM + partner_lead | in_app, email | Normal |
| Phase blocked | Assessment PM + consultant + partner_lead | in_app, email | High |
| Workshop scheduled | Invited stakeholders | in_app, email | Normal |
| Workshop starting (5 min) | Invited stakeholders | push, in_app | High |
| Sign-off requested | `executive_sponsor` stakeholders | email, in_app, push | High |
| Assessment archived | All stakeholders | in_app | Low |

*Note: Notification delivery depends on Phase 19 (Notification System). Until Phase 19 is implemented, events are logged to `DecisionLogEntry` only.*

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Concurrent transition attempts | Use optimistic locking: include `currentStatus` in transition request; reject if stale |
| Workshop active when transition attempted | Block assessment-level transitions while any workshop session is `active`; return `409 CONFLICT` |
| V1 assessment with old status loaded | Apply `V1_TO_V2_STATUS_MAP` on read; write migration to backfill |
| Phase marked blocked indefinitely | Surface blocked phases in admin dashboard; send reminder notification after 7 days |
| Session code collision | Retry generation up to 5 times; if still collides, use 8-char code |
| Facilitator leaves organization | Fall back to `consultant` role on the assessment; notify PM |
| Transition to `signed_off` without sign-off record | Reject with `422`: "At least one executive sign-off is required" |
| Transition backward (e.g., `validated -> gap_resolution`) | Allowed per matrix; log reason; clear downstream phase completions if applicable |
| Assessment deleted (soft) while in workshop | Cancel all active workshops; set `deletedAt` |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Phase completion recalculation | Cache computed `completionPct` in `AssessmentPhaseProgress`; recalculate on StepResponse/GapResolution writes via a debounced background job (100ms) |
| Transition history query | Index on `[assessmentId, createdAt]`; paginate with cursor |
| Workshop session lookup by code | Unique index on `sessionCode`; O(1) lookup |
| Status filtering on assessment list | Index on `Assessment.status` (already exists) |
| Dashboard phase progress aggregation | Pre-compute phase progress on write; read from `AssessmentPhaseProgress` table directly (no re-aggregation on read) |
| Large number of workshops per assessment | Paginate workshop list endpoint; limit 100 workshops per assessment |

---

## 11. Testing Strategy

### Unit Tests

| Test | File |
|---|---|
| Transition matrix validation (all valid transitions accepted, all invalid rejected) | `__tests__/lib/lifecycle/transition-matrix.test.ts` |
| Role-gated transition enforcement | `__tests__/lib/lifecycle/transition-roles.test.ts` |
| Phase prerequisite gating | `__tests__/lib/lifecycle/phase-gating.test.ts` |
| Phase completion computation | `__tests__/lib/lifecycle/phase-completion.test.ts` |
| Session code generation (uniqueness, charset) | `__tests__/lib/lifecycle/session-code.test.ts` |
| V1-to-V2 status mapping | `__tests__/lib/lifecycle/v1-migration.test.ts` |
| Zod schema validation | `__tests__/lib/validation/assessment-lifecycle.test.ts` |

### Integration Tests

| Test | File |
|---|---|
| Full transition lifecycle via API | `__tests__/api/assessments/transition.test.ts` |
| Phase progress CRUD via API | `__tests__/api/assessments/phases.test.ts` |
| Workshop session lifecycle via API | `__tests__/api/assessments/workshops.test.ts` |
| Concurrent transition conflict detection | `__tests__/api/assessments/transition-conflict.test.ts` |
| Immutability enforcement on signed_off assessment | `__tests__/api/assessments/immutability.test.ts` |

### E2E Tests

| Test | File |
|---|---|
| Full assessment lifecycle from draft to archived | `e2e/assessment-lifecycle.spec.ts` |
| Workshop scheduling and execution | `e2e/workshop-session.spec.ts` |

---

## 12. Migration & Seed Data

### Prisma Migration

```bash
# Migration creates:
# 1. AssessmentPhaseProgress table
# 2. WorkshopSession table
# 3. StatusTransitionLog table
# 4. No column changes to Assessment (status field is already String, not enum)
pnpm prisma migrate dev --name add-lifecycle-v2-models
```

### Data Migration Script (`prisma/migrations/data/migrate-v1-statuses.ts`)

```typescript
/**
 * Backfill existing assessments:
 * 1. Map V1 status to V2 status using V1_TO_V2_STATUS_MAP
 * 2. Create initial AssessmentPhaseProgress records for each assessment
 * 3. Compute initial completionPct values from existing data
 * 4. Log migration in StatusTransitionLog with actor="system"
 */
async function migrateV1Statuses() {
  const assessments = await prisma.assessment.findMany({
    where: { deletedAt: null },
    select: { id: true, status: true },
  });

  for (const assessment of assessments) {
    const newStatus = V1_TO_V2_STATUS_MAP[assessment.status] ?? assessment.status;

    await prisma.$transaction([
      prisma.assessment.update({
        where: { id: assessment.id },
        data: { status: newStatus },
      }),
      prisma.statusTransitionLog.create({
        data: {
          assessmentId: assessment.id,
          fromStatus: assessment.status,
          toStatus: newStatus,
          triggeredBy: "system",
          triggeredByRole: "platform_admin",
          reason: "V1 to V2 status migration",
        },
      }),
    ]);
  }
}
```

### Seed Data

```typescript
// Seed a demo assessment with full phase progress for development
const phases: AssessmentPhase[] = [
  "scoping", "process_review", "gap_resolution", "integration",
  "data_migration", "ocm", "validation", "sign_off",
];

for (const phase of phases) {
  await prisma.assessmentPhaseProgress.create({
    data: {
      assessmentId: demoAssessmentId,
      phase,
      status: phase === "scoping" ? "completed" : phase === "process_review" ? "in_progress" : "not_started",
      completionPct: phase === "scoping" ? 100 : phase === "process_review" ? 42.5 : 0,
      startedAt: phase === "scoping" ? new Date("2026-01-15") : phase === "process_review" ? new Date("2026-02-01") : null,
      completedAt: phase === "scoping" ? new Date("2026-01-28") : null,
    },
  });
}
```

---

## 13. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| 1 | Should `workshop_active` be an assessment-level status or only tracked at the session level? If multiple workshops run concurrently, the assessment-level status is ambiguous. | High -- may simplify to tracking only at session level | Product |
| 2 | Should we allow reverting from `signed_off` to `validated` if a mistake is discovered? Current matrix does not allow it. | Medium -- legal/compliance implications | Product + Legal |
| 3 | What is the ALM target for `handed_off`? SAP Cloud ALM, Jira, Azure DevOps? Determines export format. | Medium -- needed before implementing handed_off behavior | Product + Technical |
| 4 | Should phase progress percentages be visible to all stakeholders or only consultants/admins? | Low -- UX decision | Product |
| 5 | Maximum number of concurrent workshop sessions per assessment? | Low -- affects DB constraints | Product |

---

## 14. Acceptance Criteria (Given/When/Then)

### AC-18.1: Status Transition Validation
```
Given an assessment in status "draft"
  And the current user has role "consultant"
When the user requests transition to "scoping"
Then the assessment status changes to "scoping"
  And a StatusTransitionLog record is created
  And the response includes the new status
```

### AC-18.2: Invalid Transition Rejected
```
Given an assessment in status "draft"
  And the current user has role "consultant"
When the user requests transition to "gap_resolution"
Then the API returns 409 Conflict
  And the error message lists valid transitions: ["scoping"]
  And the assessment status remains "draft"
```

### AC-18.3: Role-Gated Transition
```
Given an assessment in status "pending_sign_off"
  And the current user has role "process_owner"
When the user requests transition to "signed_off"
Then the API returns 403 Forbidden
  And the error message indicates insufficient permissions
```

### AC-18.4: Phase Progress Tracking
```
Given an assessment with 50 scope items and 30 ScopeSelection responses
When the scoping phase completion is computed
Then completionPct equals 60.0
  And the phase status is "in_progress"
```

### AC-18.5: Phase Gating
```
Given an assessment where the "scoping" phase has status "not_started"
When a user attempts to update "process_review" phase to "in_progress"
Then the API returns 422 Unprocessable Entity
  And the error message states: "Phase 'scoping' must be completed before starting 'process_review'"
```

### AC-18.6: Workshop Session Creation
```
Given an assessment in status "in_progress"
  And the current user has role "consultant" and is a stakeholder
When the user creates a workshop session with title "Finance Process Review"
Then a WorkshopSession record is created with status "scheduled"
  And a unique 6-character session code is generated
  And the session code contains only uppercase letters (no O, I, L) and digits (no 0, 1)
```

### AC-18.7: Concurrent Transition Conflict
```
Given an assessment in status "in_progress"
  And user A sends a transition to "gap_resolution" with currentStatus "in_progress"
  And user B sends a transition to "review_cycle" with currentStatus "in_progress"
  And user A's request is processed first
When user B's request is processed
Then user B receives 409 Conflict
  And the error message states the assessment is now in "gap_resolution"
```

### AC-18.8: V1 Status Migration
```
Given an existing V1 assessment with status "completed"
When the V1-to-V2 migration script runs
Then the assessment status is updated to "pending_validation"
  And a StatusTransitionLog record is created with reason "V1 to V2 status migration"
  And AssessmentPhaseProgress records are created for all 8 phases
```

### AC-18.9: Immutability Enforcement
```
Given an assessment in status "signed_off"
When any user attempts to update a StepResponse via the API
Then the API returns 403 Forbidden
  And the error message states: "Assessment is signed off and cannot be modified"
```

---

## 15. Size Estimate

**Size: M (Medium)**

| Component | Effort |
|---|---|
| Schema migration + models | 0.5 day |
| Transition engine + role validation | 1.5 days |
| Phase progress computation | 1 day |
| Workshop session CRUD (basic lifecycle) | 1 day |
| API routes (7 endpoints) | 1.5 days |
| UI components (8 components) | 2 days |
| V1 migration script | 0.5 day |
| Testing (unit + integration) | 1.5 days |
| **Total** | **~9.5 days** |

---

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `AssessmentPhaseProgress`, `WorkshopSession`, `StatusTransitionLog`
- [ ] Migration applied successfully in development and staging
- [ ] `AssessmentStatusV2` type replaces `AssessmentStatus` in `src/types/assessment.ts`
- [ ] `VALID_TRANSITIONS_V2` and `TRANSITION_ROLE_MAP` implemented in `src/lib/auth/permissions.ts`
- [ ] `canTransitionStatus()` rewritten to use V2 transition matrix
- [ ] Phase gating logic implemented and tested
- [ ] Auto-completion percentage computation implemented for scoping, process_review, gap_resolution, sign_off
- [ ] All 7 API routes implemented with Zod validation
- [ ] Workshop session CRUD with session code generation
- [ ] Optimistic locking for concurrent transition protection
- [ ] V1-to-V2 migration script written and tested
- [ ] Existing V1 assessments migrated in staging
- [ ] `AssessmentStatusBadge` supports all 10+ states with distinct colors
- [ ] `PhaseProgressTracker` renders correctly with all phase states
- [ ] `StatusTransitionButton` shows only valid transitions for current user's role
- [ ] Immutability enforcement for `signed_off` and `archived` states
- [ ] Unit tests pass (transition matrix, role gating, phase gating, completion computation)
- [ ] Integration tests pass (API endpoints, concurrent transitions)
- [ ] E2E test passes (full lifecycle draft to archived)
- [ ] No TypeScript strict-mode errors introduced
- [ ] PR reviewed and approved
