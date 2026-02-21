# Phase 31: Assessment Lifecycle Continuity

## 1. Overview

Phase 31 implements the continuity layer for the Aptus assessment lifecycle -- enabling assessments to evolve over time through versioned snapshots, cross-phase cloning, controlled post-sign-off modifications, reassessment triggers, and template generation. Where Phase 30 created immutable snapshots and a sign-off workflow, Phase 31 builds the mechanisms to compare snapshots (delta reports), clone signed-off Phase 1 assessments into Phase 2 with carry-forward selection, perform controlled changes after sign-off via a formal change request process, detect and respond to reassessment triggers (SAP version updates, regulatory changes, scope expansion), and save completed assessments as anonymized reusable templates (extending Phase 26).

This phase transforms the assessment from a single point-in-time document into a living, version-tracked artifact that supports the full S/4HANA Cloud implementation lifecycle across multiple project phases.

**Source**: V2 Master Brief Addendum 2 Section 3 (Assessment Lifecycle Continuity)

### Core Capabilities

1. **Assessment Versioning & Delta Reports** -- Every sign-off creates an immutable snapshot (Phase 30). This phase adds sequential versioning (v1, v2, v3...) per assessment and a structured delta report comparing any two snapshots across five dimensions: scope changes, classification changes, gap resolution changes, integration changes, and sign-off history.

2. **Assessment Cloning (Phase 2 Carry-Forward)** -- When a client progresses from Phase 1 (Fit-to-Standard) to Phase 2 (Realize), the consultant clones the Phase 1 assessment into a new Phase 2 assessment with selective carry-forward of company profile, stakeholder list, registers, scope items (as read-only reference), and lessons learned. DEFERRED items from Phase 1 are highlighted as candidates for Phase 2 scope. Cross-phase dependency detection identifies items that depend on Phase 1 decisions.

3. **Change Control (Post-Sign-Off Modifications)** -- After an assessment has been signed off (Phase 30), any modification requires a formal change request. The consultant specifies what needs to change and why; the system auto-snapshots before changes, computes an impact summary, and unlocks only the specific entities listed. After changes are made, modified items are re-validated through an expedited sign-off (only changed areas), and a delta report is auto-generated.

4. **Reassessment Triggers** -- The system detects and surfaces events that may require re-evaluation: SAP Best Practice version updates, new gaps discovered during implementation, client scope expansion, regulatory changes, and partner-initiated re-baselines. Each trigger type follows a defined workflow.

5. **Assessment Templates (Phase 26 Extension)** -- Extends the Phase 26 `AssessmentTemplate` model to support saving a completed assessment as an anonymized template, with additional fields for `workshopTemplate` and `roleTemplate` patterns. Adds a "Save as Template" action on signed-off assessments and a `timesUsed` counter.

### Goals

- Provide full version history of assessment evolution with structured diff capability
- Enable seamless Phase 1 to Phase 2 progression without data re-entry
- Maintain sign-off integrity while allowing controlled, auditable post-sign-off changes
- Surface external triggers (SAP updates, regulatory changes) that may affect assessment validity
- Build a reusable template library from completed assessments

**Size**: L

---

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| Phase 30 (Sign-Off, Snapshots) | Phase | Required | `AssessmentSnapshot` model, `SignOffProcess`, snapshot creation logic, sign-off state machine |
| Phase 17 (Role System & Organization) | Phase | Required | 11-role permission model, `Organization` model with org types |
| Phase 18 (Assessment Lifecycle) | Phase | Required | Assessment status machine (`draft`, `in_progress`, `completed`, `signed_off`, `handed_off`, `archived`) |
| Phase 26 (Analytics & Templates) | Phase | Required | `AssessmentTemplate` model, anonymization engine, `BenchmarkSnapshot` |
| Phase 14 (Integration Register) | Phase | Required | Integration entries carried forward during cloning |
| Phase 15 (Data Migration Register) | Phase | Required | DM entries carried forward during cloning |
| Phase 16 (OCM Register) | Phase | Required | OCM entries referenced during cloning |
| Prisma 6 + PostgreSQL | Infrastructure | Exists | Schema migration for `ChangeRequest`, Assessment extensions |
| Existing `Assessment` model | Schema | Exists | Extended with `parentAssessmentId`, `phaseNumber`, `currentSnapshotId` |
| Existing `AssessmentSnapshot` model (Phase 30) | Schema | Exists | Used for version comparison and delta reports |
| Zod 3.x | Library | Exists | Validation schemas for all new operations |
| `deep-diff` or custom diff engine | Library | Add | JSON diff computation for change request tracking |
| `crypto` (Node.js built-in) | Library | Exists | SHA-256 hashing inherited from Phase 30 |

---

## 3. Data Model Changes

### Extended: `Assessment`

```prisma
model Assessment {
  // ... all existing fields from current schema ...

  // Phase 31: Lifecycle Continuity
  parentAssessmentId    String?
  parentAssessment      Assessment?          @relation("AssessmentPhases", fields: [parentAssessmentId], references: [id])
  childAssessments      Assessment[]         @relation("AssessmentPhases")
  phaseNumber           Int                  @default(1)    // 1 = Fit-to-Standard, 2 = Realize, etc.
  currentSnapshotId     String?              // Points to the latest snapshot after sign-off
  clonedFromSnapshotId  String?              // Which snapshot version was used as clone source
  carryForwardConfig    Json?                // What was carried forward: { companyProfile, stakeholders, integrations, dm, ocm, scopeRef, lessonsLearned }

  snapshots             AssessmentSnapshot[]
  changeRequests        ChangeRequest[]

  @@index([parentAssessmentId])
  @@index([phaseNumber])
}
```

### New: `ChangeRequest`

```prisma
model ChangeRequest {
  id                  String              @id @default(cuid())
  assessmentId        String
  assessment          Assessment          @relation(fields: [assessmentId], references: [id])
  requestedById       String
  requestedBy         User                @relation("ChangeRequestRequester", fields: [requestedById], references: [id])
  title               String              // Short title: "Update FI scope to include intercompany"
  reason              String              @db.Text
  impactSummary       Json                // Auto-generated: { affectedAreas, affectedSteps, affectedGaps, riskLevel, estimatedEffort }
  status              ChangeRequestStatus @default(REQUESTED)
  approvedById        String?
  approvedBy          User?               @relation("ChangeRequestApprover", fields: [approvedById], references: [id])
  approvedAt          DateTime?
  rejectedReason      String?             @db.Text
  changes             Json?               // JSON diff of what was actually changed after completion
  unlockedEntities    Json                // [{entityType: "ScopeSelection"|"StepResponse"|"GapResolution"|"IntegrationEntry"|"DmEntry", entityId: string}]
  previousSnapshotId  String
  previousSnapshot    AssessmentSnapshot  @relation("ChangeRequestPreviousSnapshot", fields: [previousSnapshotId], references: [id])
  newSnapshotId       String?
  newSnapshot         AssessmentSnapshot? @relation("ChangeRequestNewSnapshot", fields: [newSnapshotId], references: [id])
  expeditedSignOff    Boolean             @default(true)   // Only changed areas need re-validation
  signOffCompleted    Boolean             @default(false)
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  @@index([assessmentId])
  @@index([assessmentId, status])
  @@index([status])
  @@index([requestedById])
}

enum ChangeRequestStatus {
  REQUESTED
  APPROVED
  IN_PROGRESS
  RE_SIGNED
  REJECTED
}
```

### New: `ReassessmentTrigger`

```prisma
model ReassessmentTrigger {
  id                String                  @id @default(cuid())
  assessmentId      String
  assessment        Assessment              @relation(fields: [assessmentId], references: [id])
  triggerType        ReassessmentTriggerType
  title             String
  description       String                  @db.Text
  sourceReference   String?                 // e.g., SAP Note ID, regulation ID
  detectedAt        DateTime                @default(now())
  detectedById      String?                 // null for system-detected triggers
  status            String                  @default("OPEN") // "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED"
  resolution        String?                 @db.Text
  resolvedAt        DateTime?
  resolvedById      String?
  changeRequestId   String?                 // If resolved via a change request
  createdAt         DateTime                @default(now())
  updatedAt         DateTime                @updatedAt

  @@index([assessmentId])
  @@index([assessmentId, status])
  @@index([triggerType])
}

enum ReassessmentTriggerType {
  SAP_VERSION_UPDATE
  NEW_GAP_DISCOVERED
  SCOPE_EXPANSION
  REGULATORY_CHANGE
  PARTNER_RE_BASELINE
}
```

### New: `SnapshotComparison` (cached delta reports)

```prisma
model SnapshotComparison {
  id                  String   @id @default(cuid())
  assessmentId        String
  baseSnapshotId      String
  compareSnapshotId   String
  deltaReport         Json     // Full structured delta: { scope, classifications, gaps, integrations, signoffs }
  summary             Json     // { totalChanges, scopeAdded, scopeRemoved, classificationsChanged, gapsAdded, gapsResolved }
  computedAt          DateTime @default(now())

  @@unique([baseSnapshotId, compareSnapshotId])
  @@index([assessmentId])
}
```

### TypeScript Types (`src/types/lifecycle.ts`)

```typescript
export type ChangeRequestStatus =
  | "REQUESTED"
  | "APPROVED"
  | "IN_PROGRESS"
  | "RE_SIGNED"
  | "REJECTED";

export type ReassessmentTriggerType =
  | "SAP_VERSION_UPDATE"
  | "NEW_GAP_DISCOVERED"
  | "SCOPE_EXPANSION"
  | "REGULATORY_CHANGE"
  | "PARTNER_RE_BASELINE";

export type TriggerStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "DISMISSED";

export interface CarryForwardConfig {
  companyProfile: boolean;
  stakeholders: boolean;
  integrationRegister: boolean;
  dmRegister: boolean;
  ocmRegister: boolean;
  scopeItemsAsReference: boolean;
  lessonsLearned: boolean;
}

export interface CloneAssessmentOptions {
  sourceAssessmentId: string;
  phaseNumber: number;
  carryForward: CarryForwardConfig;
  newScopeItemIds: string[];
  companyName?: string; // Override if changed
  sapVersion?: string;  // May use newer SAP version for Phase 2
}

export interface UnlockedEntity {
  entityType: "ScopeSelection" | "StepResponse" | "GapResolution" | "IntegrationEntry" | "DmEntry";
  entityId: string;
  reason?: string;
}

export interface ImpactSummary {
  affectedAreas: string[];          // Functional areas impacted
  affectedStepCount: number;
  affectedGapCount: number;
  affectedIntegrationCount: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedEffort: string;          // "Minimal" | "Moderate" | "Significant"
  requiresReSign: boolean;
  affectedSignOffLayers: string[];  // Which validation layers need re-execution
}

export interface DeltaReport {
  baseSnapshotVersion: number;
  compareSnapshotVersion: number;
  generatedAt: string;
  summary: DeltaSummary;
  scopeChanges: ScopeChange[];
  classificationChanges: ClassificationChange[];
  gapResolutionChanges: GapResolutionChange[];
  integrationChanges: IntegrationChange[];
  signOffChanges: SignOffChange[];
}

export interface DeltaSummary {
  totalChanges: number;
  scopeAdded: number;
  scopeRemoved: number;
  scopeModified: number;
  classificationsChanged: number;
  gapsAdded: number;
  gapsRemoved: number;
  gapsModified: number;
  integrationsAdded: number;
  integrationsRemoved: number;
  integrationsModified: number;
  signOffsAdded: number;
}

export interface ScopeChange {
  scopeItemId: string;
  scopeItemName: string;
  changeType: "ADDED" | "REMOVED" | "MODIFIED";
  before?: { selected: boolean; relevance: string };
  after?: { selected: boolean; relevance: string };
}

export interface ClassificationChange {
  processStepId: string;
  scopeItemId: string;
  actionTitle: string;
  changeType: "CHANGED" | "NEW" | "REMOVED";
  before?: { fitStatus: string; clientNote?: string };
  after?: { fitStatus: string; clientNote?: string };
}

export interface GapResolutionChange {
  gapResolutionId: string;
  scopeItemId: string;
  changeType: "ADDED" | "REMOVED" | "MODIFIED";
  before?: { gapDescription: string; resolutionType: string; effortDays?: number };
  after?: { gapDescription: string; resolutionType: string; effortDays?: number };
}

export interface IntegrationChange {
  integrationId: string;
  changeType: "ADDED" | "REMOVED" | "MODIFIED";
  before?: { name: string; type: string; direction: string };
  after?: { name: string; type: string; direction: string };
}

export interface SignOffChange {
  signatureType: string;
  signerName: string;
  signedAt: string;
  snapshotVersion: number;
}

export interface CrossPhaseDependency {
  phase1ScopeItemId: string;
  phase1ScopeItemName: string;
  phase2ScopeItemId: string;
  phase2ScopeItemName: string;
  dependencyType: "PREREQUISITE" | "DATA_DEPENDENCY" | "CONFIG_DEPENDENCY" | "INTEGRATION_DEPENDENCY";
  description: string;
}
```

### Zod Schemas (`src/lib/validation/lifecycle.ts`)

```typescript
import { z } from "zod";

export const ChangeRequestStatusSchema = z.enum([
  "REQUESTED",
  "APPROVED",
  "IN_PROGRESS",
  "RE_SIGNED",
  "REJECTED",
]);

export const ReassessmentTriggerTypeSchema = z.enum([
  "SAP_VERSION_UPDATE",
  "NEW_GAP_DISCOVERED",
  "SCOPE_EXPANSION",
  "REGULATORY_CHANGE",
  "PARTNER_RE_BASELINE",
]);

export const TriggerStatusSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "DISMISSED",
]);

export const CarryForwardConfigSchema = z.object({
  companyProfile: z.boolean().default(true),
  stakeholders: z.boolean().default(true),
  integrationRegister: z.boolean().default(true),
  dmRegister: z.boolean().default(true),
  ocmRegister: z.boolean().default(false),
  scopeItemsAsReference: z.boolean().default(true),
  lessonsLearned: z.boolean().default(true),
});

export const CloneAssessmentSchema = z.object({
  phaseNumber: z.number().int().min(2).max(5),
  carryForward: CarryForwardConfigSchema,
  newScopeItemIds: z.array(z.string()).min(0),
  companyName: z.string().min(1).max(200).optional(),
  sapVersion: z.string().min(1).max(20).optional(),
});

export const UnlockedEntitySchema = z.object({
  entityType: z.enum([
    "ScopeSelection",
    "StepResponse",
    "GapResolution",
    "IntegrationEntry",
    "DmEntry",
  ]),
  entityId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const CreateChangeRequestSchema = z.object({
  title: z.string().min(5).max(200),
  reason: z.string().min(10).max(5000),
  unlockedEntities: z.array(UnlockedEntitySchema).min(1).max(200),
  expeditedSignOff: z.boolean().default(true),
});

export const UpdateChangeRequestSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectedReason: z.string().min(10).max(2000).optional(),
}).refine(
  (data) => data.status !== "REJECTED" || (data.rejectedReason && data.rejectedReason.length >= 10),
  { message: "Rejection reason is required when rejecting a change request", path: ["rejectedReason"] }
);

export const CompleteChangeRequestSchema = z.object({
  summary: z.string().max(2000).optional(),
});

export const CreateReassessmentTriggerSchema = z.object({
  triggerType: ReassessmentTriggerTypeSchema,
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  sourceReference: z.string().max(500).optional(),
});

export const UpdateReassessmentTriggerSchema = z.object({
  status: TriggerStatusSchema,
  resolution: z.string().max(5000).optional(),
  changeRequestId: z.string().optional(),
});

export const ReBaselineSchema = z.object({
  newSapVersion: z.string().min(1).max(20),
  reason: z.string().min(10).max(2000),
  createChangeRequest: z.boolean().default(true),
});

export const SnapshotCompareSchema = z.object({
  baseVersion: z.number().int().min(1),
  compareVersion: z.number().int().min(1),
}).refine(
  (data) => data.baseVersion !== data.compareVersion,
  { message: "Cannot compare a snapshot with itself" }
);

export const SaveAsTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  includeGapPatterns: z.boolean().default(true),
  includeIntegrationPatterns: z.boolean().default(true),
  includeDmPatterns: z.boolean().default(true),
  includeWorkshopTemplate: z.boolean().default(false),
  includeRoleTemplate: z.boolean().default(false),
});
```

---

## 4. API Routes

### Assessment Cloning

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/clone` | Clone assessment for Phase 2 (or later phase) | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/clone/preview` | Preview clone: show what will be carried forward, candidate scope items, DEFERRED items, cross-phase dependencies | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/dependencies` | Detect cross-phase dependencies for scope items | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` |

### Snapshot Versioning & Delta Reports

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/assessments/[id]/snapshots` | List all snapshots with version numbers | Any assessment stakeholder |
| `POST` | `/api/assessments/[id]/snapshots` | Create manual snapshot (outside of sign-off flow) | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/snapshots/[version]` | Get specific snapshot by version number | Any assessment stakeholder |
| `GET` | `/api/assessments/[id]/snapshots/compare` | Delta report comparing two snapshots (query: `base` and `compare` version numbers) | Any assessment stakeholder |

### Change Requests

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/change-requests` | Initiate a change request | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/change-requests` | List all change requests for assessment | Any assessment stakeholder |
| `GET` | `/api/assessments/[id]/change-requests/[crId]` | Get change request details | Any assessment stakeholder |
| `PUT` | `/api/assessments/[id]/change-requests/[crId]` | Approve or reject change request | `partner_lead`, `project_manager`, `executive_sponsor`, `platform_admin` |
| `POST` | `/api/assessments/[id]/change-requests/[crId]/complete` | Mark CR as complete, trigger snapshot and expedited re-sign | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/change-requests/[crId]/diff` | Get the diff of actual changes made | Any assessment stakeholder |

### Reassessment Triggers

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/assessments/[id]/triggers` | List reassessment triggers for assessment | Any assessment stakeholder |
| `POST` | `/api/assessments/[id]/triggers` | Create a manual reassessment trigger | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` |
| `PUT` | `/api/assessments/[id]/triggers/[triggerId]` | Update trigger status (acknowledge, resolve, dismiss) | `consultant`, `partner_lead`, `platform_admin` |
| `POST` | `/api/assessments/[id]/re-baseline` | Re-baseline assessment against new SAP Best Practice version | `consultant`, `partner_lead`, `platform_admin` |

### Template Generation (Phase 26 Extension)

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/save-as-template` | Save signed-off assessment as anonymized template | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` |

### Request/Response Examples

**POST `/api/assessments/[id]/clone`**

```json
// Request
{
  "phaseNumber": 2,
  "carryForward": {
    "companyProfile": true,
    "stakeholders": true,
    "integrationRegister": true,
    "dmRegister": true,
    "ocmRegister": false,
    "scopeItemsAsReference": true,
    "lessonsLearned": true
  },
  "newScopeItemIds": ["J14", "1YB", "BKP"],
  "sapVersion": "2602"
}

// Response 201
{
  "data": {
    "assessmentId": "clx_asmt_new_456",
    "parentAssessmentId": "clx_asmt_123",
    "phaseNumber": 2,
    "companyName": "Acme Manufacturing Sdn Bhd",
    "sapVersion": "2602",
    "status": "draft",
    "carriedForward": {
      "stakeholderCount": 8,
      "integrationCount": 12,
      "dmObjectCount": 24,
      "referenceScopeItemCount": 42,
      "lessonsLearnedCount": 5
    },
    "newScopeItemCount": 3,
    "deferredItemsHighlighted": 7,
    "crossPhaseDependencies": 4
  }
}
```

**GET `/api/assessments/[id]/snapshots/compare?base=1&compare=3`**

```json
// Response 200
{
  "data": {
    "baseSnapshotVersion": 1,
    "compareSnapshotVersion": 3,
    "generatedAt": "2026-02-21T10:30:00Z",
    "summary": {
      "totalChanges": 23,
      "scopeAdded": 3,
      "scopeRemoved": 1,
      "scopeModified": 2,
      "classificationsChanged": 12,
      "gapsAdded": 4,
      "gapsRemoved": 1,
      "gapsModified": 3,
      "integrationsAdded": 2,
      "integrationsRemoved": 0,
      "integrationsModified": 1,
      "signOffsAdded": 2
    },
    "scopeChanges": [
      {
        "scopeItemId": "J14",
        "scopeItemName": "Procurement",
        "changeType": "ADDED",
        "after": { "selected": true, "relevance": "must_have" }
      }
    ],
    "classificationChanges": [
      {
        "processStepId": "clx_step_789",
        "scopeItemId": "J60",
        "actionTitle": "Post Vendor Invoice",
        "changeType": "CHANGED",
        "before": { "fitStatus": "GAP", "clientNote": "Need custom approval" },
        "after": { "fitStatus": "CONFIGURE", "clientNote": "Can use standard workflow with config" }
      }
    ],
    "gapResolutionChanges": [],
    "integrationChanges": [],
    "signOffChanges": []
  }
}
```

**POST `/api/assessments/[id]/change-requests`**

```json
// Request
{
  "title": "Add intercompany reconciliation scope",
  "reason": "Client discovered during Phase 2 implementation that intercompany reconciliation is needed for their multi-entity structure. This was not identified during the original Fit-to-Standard assessment.",
  "unlockedEntities": [
    { "entityType": "ScopeSelection", "entityId": "clx_scope_ic_001", "reason": "Add IC Reconciliation scope item" },
    { "entityType": "StepResponse", "entityId": "clx_step_ic_010", "reason": "Classify IC posting steps" },
    { "entityType": "StepResponse", "entityId": "clx_step_ic_011", "reason": "Classify IC elimination steps" },
    { "entityType": "GapResolution", "entityId": "clx_gap_ic_001", "reason": "Resolve IC reporting gap" }
  ],
  "expeditedSignOff": true
}

// Response 201
{
  "data": {
    "id": "clx_cr_001",
    "assessmentId": "clx_asmt_123",
    "title": "Add intercompany reconciliation scope",
    "status": "REQUESTED",
    "impactSummary": {
      "affectedAreas": ["Finance"],
      "affectedStepCount": 2,
      "affectedGapCount": 1,
      "affectedIntegrationCount": 0,
      "riskLevel": "MEDIUM",
      "estimatedEffort": "Moderate",
      "requiresReSign": true,
      "affectedSignOffLayers": ["AREA_VALIDATION", "TECHNICAL_VALIDATION", "CROSS_FUNCTIONAL"]
    },
    "previousSnapshotId": "clx_snap_v3",
    "unlockedEntityCount": 4,
    "createdAt": "2026-02-21T14:00:00Z"
  }
}
```

**POST `/api/assessments/[id]/re-baseline`**

```json
// Request
{
  "newSapVersion": "2602",
  "reason": "SAP released S/4HANA Cloud 2602 with updated best practices for Finance and Procurement. Re-baseline to identify new scope items and changed process steps.",
  "createChangeRequest": true
}

// Response 200
{
  "data": {
    "snapshotCreated": true,
    "snapshotVersion": 4,
    "changeRequestId": "clx_cr_rebase_001",
    "baselineDelta": {
      "newScopeItems": 5,
      "removedScopeItems": 1,
      "modifiedProcessSteps": 18,
      "newProcessSteps": 12,
      "removedProcessSteps": 3
    },
    "triggerId": "clx_trigger_sap_001"
  }
}
```

---

## 5. UI Components

### New Pages

| Page | Route | Description |
|---|---|---|
| `SnapshotComparisonPage` | `/assessments/[id]/snapshots/compare` | Side-by-side or unified delta report comparing two snapshot versions |
| `CloneAssessmentPage` | `/assessments/[id]/clone` | Wizard for cloning assessment to Phase 2 with carry-forward selection |
| `ChangeRequestListPage` | `/assessments/[id]/change-requests` | List of all change requests with status filters |
| `ChangeRequestDetailPage` | `/assessments/[id]/change-requests/[crId]` | Full detail of a single change request with diff viewer |
| `ReassessmentTriggersPage` | `/assessments/[id]/triggers` | List of reassessment triggers with status and resolution actions |
| `ReBaselinePage` | `/assessments/[id]/re-baseline` | Re-baseline wizard comparing current assessment against new SAP version |

### New Components

| Component | Location | Description |
|---|---|---|
| `DeltaReportViewer` | `src/components/lifecycle/DeltaReportViewer.tsx` | Tabbed viewer showing scope, classification, gap, integration, and sign-off changes between snapshots |
| `DeltaSummaryCards` | `src/components/lifecycle/DeltaSummaryCards.tsx` | Summary stat cards: total changes, scope +/-, classification changes, gaps +/-, integrations +/- |
| `ScopeChangeTable` | `src/components/lifecycle/ScopeChangeTable.tsx` | Table of scope changes with ADDED/REMOVED/MODIFIED badges and before/after columns |
| `ClassificationChangeTable` | `src/components/lifecycle/ClassificationChangeTable.tsx` | Table of classification changes with color-coded FIT status transitions |
| `GapResolutionDiffPanel` | `src/components/lifecycle/GapResolutionDiffPanel.tsx` | Panel showing gap resolution changes with inline diff of description and resolution fields |
| `SnapshotVersionSelector` | `src/components/lifecycle/SnapshotVersionSelector.tsx` | Dropdown pair for selecting base and compare snapshot versions |
| `SnapshotTimelineView` | `src/components/lifecycle/SnapshotTimelineView.tsx` | Horizontal timeline showing all snapshots with version labels and sign-off markers |
| `CloneWizard` | `src/components/lifecycle/CloneWizard.tsx` | Multi-step wizard: (1) carry-forward selection, (2) new scope selection, (3) dependency review, (4) confirm |
| `CarryForwardSelector` | `src/components/lifecycle/CarryForwardSelector.tsx` | Checklist of carry-forward options (company profile, stakeholders, registers, etc.) with item counts |
| `DeferredItemsHighlight` | `src/components/lifecycle/DeferredItemsHighlight.tsx` | Table of DEFERRED scope items from Phase 1, pre-checked as Phase 2 candidates |
| `CrossPhaseDependencyList` | `src/components/lifecycle/CrossPhaseDependencyList.tsx` | List of detected cross-phase dependencies with dependency type badges |
| `ChangeRequestBanner` | `src/components/lifecycle/ChangeRequestBanner.tsx` | Persistent banner shown on all assessment pages when an active CR is IN_PROGRESS |
| `ChangeRequestForm` | `src/components/lifecycle/ChangeRequestForm.tsx` | Form for creating a new change request with entity selector and reason field |
| `ChangeRequestCard` | `src/components/lifecycle/ChangeRequestCard.tsx` | Card showing CR title, status, requester, and affected entity count |
| `ChangeRequestStatusBadge` | `src/components/lifecycle/ChangeRequestStatusBadge.tsx` | Badge for REQUESTED / APPROVED / IN_PROGRESS / RE_SIGNED / REJECTED |
| `EntityUnlockSelector` | `src/components/lifecycle/EntityUnlockSelector.tsx` | Searchable entity picker for selecting which entities to unlock in a change request |
| `PartialLockIndicator` | `src/components/lifecycle/PartialLockIndicator.tsx` | Icon/badge on entity rows showing locked (default post-sign-off) or unlocked (part of active CR) |
| `ReassessmentTriggerCard` | `src/components/lifecycle/ReassessmentTriggerCard.tsx` | Card showing trigger type, title, description, status, and resolution actions |
| `TriggerTypeBadge` | `src/components/lifecycle/TriggerTypeBadge.tsx` | Color-coded badge for trigger types (SAP_VERSION_UPDATE, REGULATORY_CHANGE, etc.) |
| `ReBaselineWizard` | `src/components/lifecycle/ReBaselineWizard.tsx` | Wizard comparing current SAP version content against new version, showing additions/removals/changes |
| `SaveAsTemplateDialog` | `src/components/lifecycle/SaveAsTemplateDialog.tsx` | Dialog for saving assessment as anonymized template with inclusion options |

### Component Tree (Clone Wizard)

```
CloneAssessmentPage (RSC)
  +-- CloneWizard (client)
        +-- Step 1: CarryForwardSelector
        |     +-- Checkbox (companyProfile) + Badge ("8 fields")
        |     +-- Checkbox (stakeholders) + Badge ("12 stakeholders")
        |     +-- Checkbox (integrationRegister) + Badge ("8 entries")
        |     +-- Checkbox (dmRegister) + Badge ("24 objects")
        |     +-- Checkbox (ocmRegister) + Badge ("6 entries")
        |     +-- Checkbox (scopeItemsAsReference) + Badge ("42 items")
        |     +-- Checkbox (lessonsLearned) + Badge ("5 entries")
        +-- Step 2: New Scope Selection
        |     +-- DeferredItemsHighlight
        |     |     +-- DataTable (DEFERRED items, pre-checked)
        |     +-- ScopeItemPicker
        |     |     +-- DataTable (all scope items not in Phase 1)
        |     +-- SapVersionSelector
        +-- Step 3: Dependency Review
        |     +-- CrossPhaseDependencyList
        |     |     +-- DependencyCard (per dependency)
        |     |           +-- Badge (PREREQUISITE | DATA | CONFIG | INTEGRATION)
        |     |           +-- Phase 1 scope item link
        |     |           +-- Phase 2 scope item link
        |     +-- DependencyResolutionNotes
        +-- Step 4: Confirm & Create
              +-- CloneSummaryCard
              |     +-- CarryForward summary
              |     +-- New scope summary
              |     +-- Dependency warnings
              +-- Button ("Create Phase 2 Assessment")
```

### Component Tree (Delta Report)

```
SnapshotComparisonPage (RSC)
  +-- SnapshotVersionSelector
  |     +-- Select (base version)
  |     +-- Select (compare version)
  |     +-- Button ("Compare")
  +-- DeltaReportViewer (client)
        +-- DeltaSummaryCards
        |     +-- StatCard (totalChanges)
        |     +-- StatCard (scopeChanges)
        |     +-- StatCard (classificationChanges)
        |     +-- StatCard (gapChanges)
        |     +-- StatCard (integrationChanges)
        +-- Tabs
              +-- Tab: "Scope Changes"
              |     +-- ScopeChangeTable
              +-- Tab: "Classifications"
              |     +-- ClassificationChangeTable
              +-- Tab: "Gap Resolutions"
              |     +-- GapResolutionDiffPanel
              +-- Tab: "Integrations"
              |     +-- IntegrationChangeTable
              +-- Tab: "Sign-Offs"
                    +-- SignOffChangeTimeline
```

### Modified Components

| Component | Changes |
|---|---|
| Assessment detail header | Show phase number badge ("Phase 1", "Phase 2"), parent/child assessment links, active CR banner |
| Assessment status badge | Support `CHANGE_REQUEST_ACTIVE` visual state overlay |
| Step response row | Show `PartialLockIndicator` when assessment is signed off; show unlocked state when entity is in active CR |
| Scope selection row | Show `PartialLockIndicator`; highlight DEFERRED items |
| Gap resolution card | Show `PartialLockIndicator`; show CR attribution when modified via change request |
| Assessment navigation sidebar | Add "Snapshots", "Change Requests", and "Triggers" links |
| Assessment list page | Show phase number column, parent assessment link |

---

## 6. Business Logic

### Assessment Cloning

```typescript
async function cloneAssessmentForNextPhase(
  sourceAssessmentId: string,
  userId: string,
  options: CloneAssessmentOptions
): Promise<Assessment> {
  const source = await prisma.assessment.findUniqueOrThrow({
    where: { id: sourceAssessmentId },
    include: {
      stakeholders: true,
      scopeSelections: { include: { assessment: false } },
      stepResponses: true,
      gapResolutions: true,
    },
  });

  // Validate: source must be signed off or handed off
  if (!["signed_off", "handed_off"].includes(source.status)) {
    throw new ApiError(422, "INVALID_STATUS", "Source assessment must be signed off before cloning");
  }

  // Get the latest snapshot for reference
  const latestSnapshot = await prisma.assessmentSnapshot.findFirst({
    where: { assessmentId: sourceAssessmentId },
    orderBy: { version: "desc" },
  });

  return prisma.$transaction(async (tx) => {
    // 1. Create the new assessment
    const newAssessment = await tx.assessment.create({
      data: {
        companyName: options.companyName ?? source.companyName,
        industry: source.industry,
        country: source.country,
        operatingCountries: source.operatingCountries,
        companySize: source.companySize,
        revenueBand: source.revenueBand,
        currentErp: source.currentErp,
        sapVersion: options.sapVersion ?? source.sapVersion,
        status: "draft",
        createdBy: userId,
        organizationId: source.organizationId,
        parentAssessmentId: sourceAssessmentId,
        phaseNumber: options.phaseNumber,
        clonedFromSnapshotId: latestSnapshot?.id ?? null,
        carryForwardConfig: options.carryForward as unknown as Prisma.InputJsonValue,
      },
    });

    // 2. Carry forward stakeholders (if selected)
    if (options.carryForward.stakeholders) {
      const stakeholderData = source.stakeholders.map((s) => ({
        assessmentId: newAssessment.id,
        userId: s.userId,
        name: s.name,
        email: s.email,
        role: s.role,
        assignedAreas: s.assignedAreas,
        canEdit: s.canEdit,
        invitedBy: userId,
      }));
      await tx.assessmentStakeholder.createMany({ data: stakeholderData });
    }

    // 3. Carry forward scope items as read-only reference
    if (options.carryForward.scopeItemsAsReference) {
      const refSelections = source.scopeSelections.map((s) => ({
        assessmentId: newAssessment.id,
        scopeItemId: s.scopeItemId,
        selected: s.selected,
        relevance: s.relevance,
        currentState: "phase1_reference",
        notes: `[Phase 1 Reference] ${s.notes ?? ""}`.trim(),
      }));
      await tx.scopeSelection.createMany({ data: refSelections });
    }

    // 4. Add new scope items
    if (options.newScopeItemIds.length > 0) {
      const newSelections = options.newScopeItemIds.map((scopeItemId) => ({
        assessmentId: newAssessment.id,
        scopeItemId,
        selected: true,
        relevance: "to_be_assessed",
      }));
      await tx.scopeSelection.createMany({
        data: newSelections,
        skipDuplicates: true,
      });
    }

    // 5. Carry forward integration register (if selected)
    if (options.carryForward.integrationRegister) {
      await cloneIntegrationRegister(tx, sourceAssessmentId, newAssessment.id);
    }

    // 6. Carry forward DM register (if selected)
    if (options.carryForward.dmRegister) {
      await cloneDmRegister(tx, sourceAssessmentId, newAssessment.id);
    }

    // 7. Detect cross-phase dependencies
    const dependencies = await detectCrossPhaseDependencies(
      source.scopeSelections.filter((s) => s.selected).map((s) => s.scopeItemId),
      options.newScopeItemIds
    );

    // Log the clone operation
    await tx.decisionLogEntry.create({
      data: {
        assessmentId: newAssessment.id,
        entityType: "assessment",
        entityId: newAssessment.id,
        action: "CLONED_FROM_PHASE",
        oldValue: null,
        newValue: {
          sourceAssessmentId,
          phaseNumber: options.phaseNumber,
          carryForward: options.carryForward,
          newScopeItemCount: options.newScopeItemIds.length,
          dependencyCount: dependencies.length,
        },
        actor: userId,
        actorRole: "consultant",
        reason: `Cloned from Phase ${source.phaseNumber} assessment for Phase ${options.phaseNumber}`,
      },
    });

    return newAssessment;
  });
}
```

### Cross-Phase Dependency Detection

```typescript
// Known dependency mappings between SAP scope items
const SCOPE_ITEM_DEPENDENCIES: Array<{
  prerequisite: string;
  dependent: string;
  type: CrossPhaseDependency["dependencyType"];
  description: string;
}> = [
  {
    prerequisite: "J60", // Accounts Payable
    dependent: "1YB",   // Intercompany
    type: "DATA_DEPENDENCY",
    description: "Intercompany postings depend on AP master data and chart of accounts from Phase 1",
  },
  {
    prerequisite: "J14", // Procurement
    dependent: "BKP",   // Supplier Management
    type: "PREREQUISITE",
    description: "Supplier management requires procurement configuration from Phase 1",
  },
  // ... additional dependency mappings loaded from configuration
];

async function detectCrossPhaseDependencies(
  phase1ScopeItemIds: string[],
  phase2ScopeItemIds: string[]
): Promise<CrossPhaseDependency[]> {
  const dependencies: CrossPhaseDependency[] = [];

  for (const dep of SCOPE_ITEM_DEPENDENCIES) {
    if (
      phase1ScopeItemIds.includes(dep.prerequisite) &&
      phase2ScopeItemIds.includes(dep.dependent)
    ) {
      const [p1Item, p2Item] = await Promise.all([
        prisma.scopeItem.findUnique({ where: { id: dep.prerequisite }, select: { name: true } }),
        prisma.scopeItem.findUnique({ where: { id: dep.dependent }, select: { name: true } }),
      ]);

      dependencies.push({
        phase1ScopeItemId: dep.prerequisite,
        phase1ScopeItemName: p1Item?.name ?? dep.prerequisite,
        phase2ScopeItemId: dep.dependent,
        phase2ScopeItemName: p2Item?.name ?? dep.dependent,
        dependencyType: dep.type,
        description: dep.description,
      });
    }
  }

  return dependencies;
}
```

### Delta Report Computation

```typescript
async function computeDeltaReport(
  assessmentId: string,
  baseVersion: number,
  compareVersion: number
): Promise<DeltaReport> {
  // Check cache first
  const cached = await prisma.snapshotComparison.findFirst({
    where: {
      assessmentId,
      baseSnapshotId: await getSnapshotIdByVersion(assessmentId, baseVersion),
      compareSnapshotId: await getSnapshotIdByVersion(assessmentId, compareVersion),
    },
  });

  if (cached) {
    return cached.deltaReport as unknown as DeltaReport;
  }

  const [baseSnapshot, compareSnapshot] = await Promise.all([
    prisma.assessmentSnapshot.findUniqueOrThrow({
      where: { assessmentId_version: { assessmentId, version: baseVersion } },
    }),
    prisma.assessmentSnapshot.findUniqueOrThrow({
      where: { assessmentId_version: { assessmentId, version: compareVersion } },
    }),
  ]);

  const baseData = baseSnapshot.snapshotData as unknown as SnapshotData;
  const compareData = compareSnapshot.snapshotData as unknown as SnapshotData;

  // Compute scope changes
  const scopeChanges = computeScopeChanges(baseData.scopeSelections, compareData.scopeSelections);

  // Compute classification changes
  const classificationChanges = computeClassificationChanges(
    baseData.stepResponses,
    compareData.stepResponses
  );

  // Compute gap resolution changes
  const gapResolutionChanges = computeGapResolutionChanges(
    baseData.gapResolutions,
    compareData.gapResolutions
  );

  // Compute integration changes (if present in snapshot)
  const integrationChanges = computeIntegrationChanges(
    (baseData as any).integrations ?? [],
    (compareData as any).integrations ?? []
  );

  // Compute sign-off changes
  const signOffChanges = computeSignOffChanges(
    (baseData as any).signOffs ?? [],
    (compareData as any).signOffs ?? []
  );

  const summary: DeltaSummary = {
    totalChanges:
      scopeChanges.length +
      classificationChanges.length +
      gapResolutionChanges.length +
      integrationChanges.length +
      signOffChanges.length,
    scopeAdded: scopeChanges.filter((c) => c.changeType === "ADDED").length,
    scopeRemoved: scopeChanges.filter((c) => c.changeType === "REMOVED").length,
    scopeModified: scopeChanges.filter((c) => c.changeType === "MODIFIED").length,
    classificationsChanged: classificationChanges.length,
    gapsAdded: gapResolutionChanges.filter((c) => c.changeType === "ADDED").length,
    gapsRemoved: gapResolutionChanges.filter((c) => c.changeType === "REMOVED").length,
    gapsModified: gapResolutionChanges.filter((c) => c.changeType === "MODIFIED").length,
    integrationsAdded: integrationChanges.filter((c) => c.changeType === "ADDED").length,
    integrationsRemoved: integrationChanges.filter((c) => c.changeType === "REMOVED").length,
    integrationsModified: integrationChanges.filter((c) => c.changeType === "MODIFIED").length,
    signOffsAdded: signOffChanges.length,
  };

  const deltaReport: DeltaReport = {
    baseSnapshotVersion: baseVersion,
    compareSnapshotVersion: compareVersion,
    generatedAt: new Date().toISOString(),
    summary,
    scopeChanges,
    classificationChanges,
    gapResolutionChanges,
    integrationChanges,
    signOffChanges,
  };

  // Cache the result
  await prisma.snapshotComparison.create({
    data: {
      assessmentId,
      baseSnapshotId: baseSnapshot.id,
      compareSnapshotId: compareSnapshot.id,
      deltaReport: deltaReport as unknown as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
    },
  });

  return deltaReport;
}

function computeScopeChanges(
  baseScopeSelections: ScopeSelectionSnapshot[],
  compareScopeSelections: ScopeSelectionSnapshot[]
): ScopeChange[] {
  const changes: ScopeChange[] = [];
  const baseMap = new Map(baseScopeSelections.map((s) => [s.scopeItemId, s]));
  const compareMap = new Map(compareScopeSelections.map((s) => [s.scopeItemId, s]));

  // Find added and modified
  for (const [scopeItemId, compareItem] of compareMap) {
    const baseItem = baseMap.get(scopeItemId);
    if (!baseItem) {
      changes.push({
        scopeItemId,
        scopeItemName: scopeItemId, // Resolved later via lookup
        changeType: "ADDED",
        after: { selected: compareItem.selected, relevance: compareItem.relevance },
      });
    } else if (
      baseItem.selected !== compareItem.selected ||
      baseItem.relevance !== compareItem.relevance
    ) {
      changes.push({
        scopeItemId,
        scopeItemName: scopeItemId,
        changeType: "MODIFIED",
        before: { selected: baseItem.selected, relevance: baseItem.relevance },
        after: { selected: compareItem.selected, relevance: compareItem.relevance },
      });
    }
  }

  // Find removed
  for (const [scopeItemId, baseItem] of baseMap) {
    if (!compareMap.has(scopeItemId)) {
      changes.push({
        scopeItemId,
        scopeItemName: scopeItemId,
        changeType: "REMOVED",
        before: { selected: baseItem.selected, relevance: baseItem.relevance },
      });
    }
  }

  return changes;
}

function computeClassificationChanges(
  baseResponses: StepResponseSnapshot[],
  compareResponses: StepResponseSnapshot[]
): ClassificationChange[] {
  const changes: ClassificationChange[] = [];
  const baseMap = new Map(baseResponses.map((r) => [r.processStepId, r]));
  const compareMap = new Map(compareResponses.map((r) => [r.processStepId, r]));

  for (const [stepId, compareResp] of compareMap) {
    const baseResp = baseMap.get(stepId);
    if (!baseResp) {
      changes.push({
        processStepId: stepId,
        scopeItemId: "",
        actionTitle: "",
        changeType: "NEW",
        after: { fitStatus: compareResp.fitStatus, clientNote: compareResp.clientNote },
      });
    } else if (baseResp.fitStatus !== compareResp.fitStatus) {
      changes.push({
        processStepId: stepId,
        scopeItemId: "",
        actionTitle: "",
        changeType: "CHANGED",
        before: { fitStatus: baseResp.fitStatus, clientNote: baseResp.clientNote },
        after: { fitStatus: compareResp.fitStatus, clientNote: compareResp.clientNote },
      });
    }
  }

  for (const [stepId] of baseMap) {
    if (!compareMap.has(stepId)) {
      const baseResp = baseMap.get(stepId)!;
      changes.push({
        processStepId: stepId,
        scopeItemId: "",
        actionTitle: "",
        changeType: "REMOVED",
        before: { fitStatus: baseResp.fitStatus, clientNote: baseResp.clientNote },
      });
    }
  }

  return changes;
}
```

### Change Request Workflow

```typescript
export const CHANGE_REQUEST_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  REQUESTED:   ["APPROVED", "REJECTED"],
  APPROVED:    ["IN_PROGRESS"],
  IN_PROGRESS: ["RE_SIGNED"],
  RE_SIGNED:   [],           // Terminal
  REJECTED:    [],           // Terminal
};

async function createChangeRequest(
  assessmentId: string,
  userId: string,
  input: z.infer<typeof CreateChangeRequestSchema>
): Promise<ChangeRequest> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
  });

  // Validate: assessment must be signed off
  if (assessment.status !== "signed_off" && assessment.status !== "handed_off") {
    throw new ApiError(
      422,
      "INVALID_STATUS",
      "Change requests can only be created for signed-off or handed-off assessments"
    );
  }

  // Check no other CR is IN_PROGRESS
  const activeChangeRequest = await prisma.changeRequest.findFirst({
    where: {
      assessmentId,
      status: { in: ["REQUESTED", "APPROVED", "IN_PROGRESS"] },
    },
  });

  if (activeChangeRequest) {
    throw new ApiError(
      409,
      "ACTIVE_CR_EXISTS",
      `Change request "${activeChangeRequest.title}" is already active. Complete or reject it before creating a new one.`
    );
  }

  // Auto-create a snapshot before any changes
  const snapshot = await createAssessmentSnapshot(
    assessmentId,
    userId,
    `Pre-Change-Request: ${input.title}`,
    `Automatic snapshot before change request: ${input.reason.substring(0, 200)}`
  );

  // Auto-compute impact summary
  const impactSummary = await computeImpactSummary(assessmentId, input.unlockedEntities);

  return prisma.changeRequest.create({
    data: {
      assessmentId,
      requestedById: userId,
      title: input.title,
      reason: input.reason,
      impactSummary: impactSummary as unknown as Prisma.InputJsonValue,
      status: "REQUESTED",
      unlockedEntities: input.unlockedEntities as unknown as Prisma.InputJsonValue,
      previousSnapshotId: snapshot.id,
      expeditedSignOff: input.expeditedSignOff,
    },
  });
}

async function computeImpactSummary(
  assessmentId: string,
  unlockedEntities: UnlockedEntity[]
): Promise<ImpactSummary> {
  const entityTypes = unlockedEntities.map((e) => e.entityType);
  const entityIds = unlockedEntities.map((e) => e.entityId);

  // Determine affected functional areas
  const affectedAreas = new Set<string>();
  const affectedStepCount = unlockedEntities.filter((e) => e.entityType === "StepResponse").length;
  const affectedGapCount = unlockedEntities.filter((e) => e.entityType === "GapResolution").length;
  const affectedIntegrationCount = unlockedEntities.filter(
    (e) => e.entityType === "IntegrationEntry"
  ).length;

  // Look up scope items for affected entities to determine functional areas
  if (entityTypes.includes("StepResponse")) {
    const stepIds = unlockedEntities
      .filter((e) => e.entityType === "StepResponse")
      .map((e) => e.entityId);
    const steps = await prisma.stepResponse.findMany({
      where: { id: { in: stepIds } },
      include: { processStep: { include: { scopeItem: { select: { functionalArea: true } } } } },
    });
    steps.forEach((s) => affectedAreas.add(s.processStep.scopeItem.functionalArea));
  }

  if (entityTypes.includes("ScopeSelection")) {
    const selectionIds = unlockedEntities
      .filter((e) => e.entityType === "ScopeSelection")
      .map((e) => e.entityId);
    const selections = await prisma.scopeSelection.findMany({
      where: { id: { in: selectionIds } },
      include: { assessment: false },
    });
    for (const sel of selections) {
      const scopeItem = await prisma.scopeItem.findUnique({
        where: { id: sel.scopeItemId },
        select: { functionalArea: true },
      });
      if (scopeItem) affectedAreas.add(scopeItem.functionalArea);
    }
  }

  // Determine risk level based on scope of change
  const totalAffected = unlockedEntities.length;
  let riskLevel: ImpactSummary["riskLevel"];
  if (totalAffected <= 3) riskLevel = "LOW";
  else if (totalAffected <= 10) riskLevel = "MEDIUM";
  else if (totalAffected <= 30) riskLevel = "HIGH";
  else riskLevel = "CRITICAL";

  // Determine estimated effort
  let estimatedEffort: string;
  if (totalAffected <= 5) estimatedEffort = "Minimal";
  else if (totalAffected <= 20) estimatedEffort = "Moderate";
  else estimatedEffort = "Significant";

  // Determine which sign-off layers need re-execution
  const affectedSignOffLayers: string[] = [];
  if (affectedAreas.size > 0) affectedSignOffLayers.push("AREA_VALIDATION");
  if (entityTypes.includes("IntegrationEntry") || entityTypes.includes("DmEntry")) {
    affectedSignOffLayers.push("TECHNICAL_VALIDATION");
  }
  if (affectedAreas.size > 1) affectedSignOffLayers.push("CROSS_FUNCTIONAL");

  return {
    affectedAreas: Array.from(affectedAreas),
    affectedStepCount,
    affectedGapCount,
    affectedIntegrationCount,
    riskLevel,
    estimatedEffort,
    requiresReSign: true,
    affectedSignOffLayers,
  };
}

async function approveChangeRequest(
  crId: string,
  userId: string
): Promise<ChangeRequest> {
  const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id: crId } });

  if (cr.status !== "REQUESTED") {
    throw new ApiError(422, "INVALID_TRANSITION", "Only REQUESTED change requests can be approved");
  }

  return prisma.changeRequest.update({
    where: { id: crId },
    data: {
      status: "APPROVED",
      approvedById: userId,
      approvedAt: new Date(),
    },
  });
}

async function startChangeRequest(crId: string): Promise<ChangeRequest> {
  const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id: crId } });

  if (cr.status !== "APPROVED") {
    throw new ApiError(
      422,
      "INVALID_TRANSITION",
      "Only APPROVED change requests can move to IN_PROGRESS"
    );
  }

  return prisma.changeRequest.update({
    where: { id: crId },
    data: { status: "IN_PROGRESS" },
  });
}

async function completeChangeRequest(
  crId: string,
  userId: string
): Promise<ChangeRequest> {
  const cr = await prisma.changeRequest.findUniqueOrThrow({
    where: { id: crId },
    include: { previousSnapshot: true },
  });

  if (cr.status !== "IN_PROGRESS") {
    throw new ApiError(
      422,
      "INVALID_TRANSITION",
      "Only IN_PROGRESS change requests can be completed"
    );
  }

  // 1. Create a new snapshot capturing post-change state
  const newSnapshot = await createAssessmentSnapshot(
    cr.assessmentId,
    userId,
    `Post-Change-Request: ${cr.title}`,
    `Snapshot after change request completion: ${cr.title}`
  );

  // 2. Compute the diff between pre-CR and post-CR snapshots
  const diff = await computeDeltaReport(
    cr.assessmentId,
    cr.previousSnapshot.version,
    newSnapshot.version
  );

  // 3. Update the change request
  const updated = await prisma.changeRequest.update({
    where: { id: crId },
    data: {
      newSnapshotId: newSnapshot.id,
      changes: diff as unknown as Prisma.InputJsonValue,
      status: cr.expeditedSignOff ? "IN_PROGRESS" : "RE_SIGNED",
      // If expedited sign-off is required, the status stays IN_PROGRESS
      // until the expedited sign-off completes (handled by sign-off callback)
    },
  });

  // 4. If expedited sign-off, initiate sign-off for affected areas only
  if (cr.expeditedSignOff) {
    await initiateExpeditedSignOff(cr.assessmentId, cr.id, diff.summary);
  }

  return updated;
}
```

### Entity Lock Enforcement

```typescript
/**
 * Check whether a specific entity is editable given the assessment's current state.
 * Post-sign-off, entities are locked by default. They become editable only when
 * an approved, in-progress change request explicitly lists them as unlocked.
 */
async function isEntityEditable(
  assessmentId: string,
  entityType: UnlockedEntity["entityType"],
  entityId: string
): Promise<{ editable: boolean; reason?: string }> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    select: { status: true },
  });

  // Pre-sign-off: normal rules apply (based on assessment status)
  if (!["signed_off", "handed_off"].includes(assessment.status)) {
    return { editable: true };
  }

  // Post-sign-off: check for active change request with this entity unlocked
  const activeChangeRequest = await prisma.changeRequest.findFirst({
    where: {
      assessmentId,
      status: "IN_PROGRESS",
    },
  });

  if (!activeChangeRequest) {
    return { editable: false, reason: "Assessment is signed off. Create a change request to modify." };
  }

  const unlockedEntities = activeChangeRequest.unlockedEntities as unknown as UnlockedEntity[];
  const isUnlocked = unlockedEntities.some(
    (e) => e.entityType === entityType && e.entityId === entityId
  );

  if (!isUnlocked) {
    return {
      editable: false,
      reason: `This entity is not included in change request "${activeChangeRequest.title}". Only unlocked entities can be modified.`,
    };
  }

  return { editable: true };
}
```

### Re-Baseline Against New SAP Version

```typescript
async function reBaselineAssessment(
  assessmentId: string,
  userId: string,
  input: z.infer<typeof ReBaselineSchema>
): Promise<{
  snapshotVersion: number;
  changeRequestId?: string;
  baselineDelta: BaselineDelta;
  triggerId: string;
}> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    include: { scopeSelections: true },
  });

  // 1. Create snapshot of current state
  const snapshot = await createAssessmentSnapshot(
    assessmentId,
    userId,
    `Pre-Rebaseline: ${assessment.sapVersion} -> ${input.newSapVersion}`,
    input.reason
  );

  // 2. Compare current scope items against new SAP version catalog
  const currentScopeItemIds = assessment.scopeSelections
    .filter((s) => s.selected)
    .map((s) => s.scopeItemId);

  const newVersionScopeItems = await prisma.scopeItem.findMany({
    where: { version: input.newSapVersion },
    select: { id: true, name: true, totalSteps: true },
  });

  const newVersionIds = new Set(newVersionScopeItems.map((s) => s.id));
  const currentIds = new Set(currentScopeItemIds);

  const baselineDelta: BaselineDelta = {
    newScopeItems: newVersionScopeItems.filter((s) => !currentIds.has(s.id)).length,
    removedScopeItems: currentScopeItemIds.filter((id) => !newVersionIds.has(id)).length,
    modifiedProcessSteps: 0, // Computed by comparing step counts
    newProcessSteps: 0,
    removedProcessSteps: 0,
  };

  // Compute process step differences for common scope items
  for (const scopeItemId of currentScopeItemIds) {
    if (newVersionIds.has(scopeItemId)) {
      const currentItem = await prisma.scopeItem.findFirst({
        where: { id: scopeItemId, version: assessment.sapVersion },
        select: { totalSteps: true },
      });
      const newItem = newVersionScopeItems.find((s) => s.id === scopeItemId);
      if (currentItem && newItem && currentItem.totalSteps !== newItem.totalSteps) {
        const diff = newItem.totalSteps - currentItem.totalSteps;
        if (diff > 0) baselineDelta.newProcessSteps += diff;
        else baselineDelta.removedProcessSteps += Math.abs(diff);
        baselineDelta.modifiedProcessSteps++;
      }
    }
  }

  // 3. Create reassessment trigger
  const trigger = await prisma.reassessmentTrigger.create({
    data: {
      assessmentId,
      triggerType: "SAP_VERSION_UPDATE",
      title: `SAP S/4HANA Cloud ${input.newSapVersion} Update`,
      description: `Re-baseline from version ${assessment.sapVersion} to ${input.newSapVersion}. ${baselineDelta.newScopeItems} new scope items, ${baselineDelta.modifiedProcessSteps} modified scope items.`,
      sourceReference: `SAP Best Practices ${input.newSapVersion}`,
      detectedById: userId,
      status: "IN_PROGRESS",
    },
  });

  // 4. Optionally create a change request
  let changeRequestId: string | undefined;
  if (input.createChangeRequest) {
    const cr = await createChangeRequest(assessmentId, userId, {
      title: `Re-baseline to SAP ${input.newSapVersion}`,
      reason: input.reason,
      unlockedEntities: assessment.scopeSelections.map((s) => ({
        entityType: "ScopeSelection" as const,
        entityId: s.id,
        reason: "Re-baseline scope review",
      })),
      expeditedSignOff: true,
    });
    changeRequestId = cr.id;

    // Link trigger to change request
    await prisma.reassessmentTrigger.update({
      where: { id: trigger.id },
      data: { changeRequestId: cr.id },
    });
  }

  return {
    snapshotVersion: snapshot.version,
    changeRequestId,
    baselineDelta,
    triggerId: trigger.id,
  };
}

interface BaselineDelta {
  newScopeItems: number;
  removedScopeItems: number;
  modifiedProcessSteps: number;
  newProcessSteps: number;
  removedProcessSteps: number;
}
```

### Expedited Sign-Off

```typescript
/**
 * Initiate an expedited sign-off that only requires re-validation of changed areas.
 * Rather than running the full 5-layer sign-off, only the layers affected by the
 * change request are executed.
 */
async function initiateExpeditedSignOff(
  assessmentId: string,
  changeRequestId: string,
  deltaSummary: DeltaSummary
): Promise<void> {
  const impactSummary = await prisma.changeRequest.findUniqueOrThrow({
    where: { id: changeRequestId },
    select: { impactSummary: true },
  });

  const impact = impactSummary.impactSummary as unknown as ImpactSummary;

  // Create a lightweight sign-off process that only covers affected layers
  // This reuses the Phase 30 SignOffProcess model but with a subset of layers
  // The sign-off callback will mark the CR as RE_SIGNED when complete

  // For now, we create area validations only for affected functional areas
  // rather than all areas in the assessment
  const latestSnapshot = await prisma.assessmentSnapshot.findFirst({
    where: { assessmentId },
    orderBy: { version: "desc" },
  });

  if (!latestSnapshot) {
    throw new ApiError(500, "NO_SNAPSHOT", "No snapshot available for expedited sign-off");
  }

  // The expedited sign-off follows the same Phase 30 flow but is scoped
  // to the affected areas identified in the impact summary
  await prisma.decisionLogEntry.create({
    data: {
      assessmentId,
      entityType: "change_request",
      entityId: changeRequestId,
      action: "EXPEDITED_SIGNOFF_INITIATED",
      oldValue: null,
      newValue: {
        affectedLayers: impact.affectedSignOffLayers,
        affectedAreas: impact.affectedAreas,
        snapshotVersion: latestSnapshot.version,
      },
      actor: "SYSTEM",
      actorRole: "platform_admin",
      reason: "Expedited sign-off initiated after change request completion",
    },
  });
}
```

---

## 7. Permissions & Access Control

| Action | platform_admin | partner_lead | consultant | project_manager | solution_architect | process_owner | it_lead | data_migration_lead | executive_sponsor | client_admin | viewer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Clone assessment | Yes | Yes (own org) | Yes (own assessment) | No | No | No | No | No | No | No | No |
| Preview clone | Yes | Yes (own org) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | No | No | No | No | No | No |
| Create snapshot | Yes | Yes (own org) | Yes (own assessment) | No | No | No | No | No | No | No | No |
| View snapshots | Yes | Yes (own org) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) |
| Compare snapshots (delta) | Yes | Yes (own org) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) |
| Create change request | Yes | Yes (own org) | Yes (own assessment) | No | No | No | No | No | No | No | No |
| View change requests | Yes | Yes (own org) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) |
| Approve/reject CR | Yes | Yes (own org) | No | Yes (own assessment) | No | No | No | No | Yes (own assessment) | No | No |
| Edit unlocked entities (during CR) | Yes | Yes (own org) | Yes (own assessment) | No | Yes (own assessment, technical notes only) | Yes (own area only) | Yes (technical entities only) | Yes (DM entities only) | No | No | No |
| Complete CR | Yes | Yes (own org) | Yes (own assessment) | No | No | No | No | No | No | No | No |
| Create reassessment trigger | Yes | Yes (own org) | Yes (own assessment) | No | Yes (own assessment) | No | No | No | No | No | No |
| View triggers | Yes | Yes (own org) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | No | No | No | Yes (own assessment) | No | No |
| Update trigger status | Yes | Yes (own org) | Yes (own assessment) | No | No | No | No | No | No | No | No |
| Re-baseline assessment | Yes | Yes (own org) | Yes (own assessment) | No | No | No | No | No | No | No | No |
| Save as template | Yes | Yes (own org) | Yes (own assessment) | No | Yes (own assessment) | No | No | No | No | No | No |

### Change Request Approval Rules

- The user who created the change request **cannot** approve their own request (four-eyes principle).
- At least one of `partner_lead`, `project_manager`, or `executive_sponsor` must approve.
- `platform_admin` can approve any change request (override capability).

### Entity Edit Rules During Active Change Request

- Only entities explicitly listed in `unlockedEntities` are editable.
- Normal role-based area locking still applies (a `process_owner` can only edit unlocked entities within their assigned functional areas).
- All edits during a CR are logged in the decision log with the CR ID as context.

---

## 8. Notification Triggers

| Event | Recipients | Channel | Priority |
|---|---|---|---|
| Change request created | Assessment stakeholders with approval authority (`partner_lead`, `project_manager`, `executive_sponsor`) | Email, in-app | High |
| Change request approved | CR requester, all assessment stakeholders | In-app | High |
| Change request rejected | CR requester | Email, in-app | High |
| Change request moved to IN_PROGRESS | All assessment stakeholders | In-app | Normal |
| Change request completed (RE_SIGNED) | All assessment stakeholders | Email, in-app | High |
| Expedited sign-off initiated | Affected area validators (`process_owner`), `it_lead`, `solution_architect` | Email, in-app | High |
| Assessment cloned for next phase | All stakeholders on both source and new assessment | Email, in-app | High |
| Clone completed | Clone initiator | In-app toast | Normal |
| Reassessment trigger detected (system) | `consultant`, `partner_lead`, `solution_architect` on assessment | Email, in-app | High |
| Reassessment trigger created (manual) | All assessment stakeholders | In-app | Normal |
| Reassessment trigger resolved | All assessment stakeholders | In-app | Normal |
| SAP version update available | All assessments on affected SAP version: `consultant`, `partner_lead` | Email (batch digest), in-app | Normal |
| Re-baseline initiated | All assessment stakeholders | Email, in-app | High |
| Re-baseline completed | All assessment stakeholders | In-app | Normal |
| Snapshot created | Assessment `consultant`, `partner_lead` | In-app | Low |
| Delta report generated | Requesting user | In-app toast | Low |

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Clone attempt on assessment that is not signed off | Return `422`: "Assessment must be signed off or handed off before cloning to a new phase." |
| Clone attempt when a child assessment for the same phase already exists | Return `409`: "A Phase {n} assessment already exists for this client. Use the existing assessment or archive it first." |
| Change request created while another CR is active | Return `409`: "Change request '{title}' is already active. Complete or reject it before creating a new one." |
| User tries to edit a locked entity without active CR | Return `403`: "Assessment is signed off. Create a change request to modify this entity." |
| User tries to edit an entity not in the CR's unlocked list | Return `403`: "This entity is not included in the active change request. Only unlocked entities can be modified." |
| CR creator tries to approve their own CR | Return `403`: "You cannot approve your own change request (four-eyes principle)." |
| Delta report for non-existent snapshot version | Return `404`: "Snapshot version {n} not found for this assessment." |
| Comparing same snapshot version to itself | Return `400`: "Cannot compare a snapshot with itself." |
| Re-baseline with SAP version that has no catalog data | Return `422`: "SAP Best Practice version {version} catalog has not been ingested. Import the catalog first." |
| Cross-phase dependency where Phase 1 scope item was DEFERRED | Include in dependency list with warning: "Phase 1 prerequisite was deferred. Review dependency before proceeding." |
| Clone carries forward stakeholder who has been deactivated | Skip deactivated stakeholders. Include count in response: "2 deactivated stakeholders were excluded." |
| Snapshot data exceeds 10MB | Compress `snapshotData` JSON with gzip before storage. Decompress on read. Log warning for monitoring. |
| Concurrent delta report requests for same snapshot pair | First request computes and caches. Second request reads from `SnapshotComparison` cache. Race condition handled by unique constraint on `[baseSnapshotId, compareSnapshotId]` with `skipDuplicates`. |
| Template creation from assessment with no gap resolutions | Allowed. Template will have empty `commonGapPatterns`. |
| Re-baseline detects scope items exist in new version but with different IDs | Return advisory: "N scope items may have changed IDs in the new version. Manual mapping required." |
| Change request completed but expedited sign-off not finished | CR remains in `IN_PROGRESS` until expedited sign-off completes. CR auto-transitions to `RE_SIGNED` when sign-off callback fires. |
| Assessment with 50+ snapshots | Paginate snapshot list. Cache delta reports in `SnapshotComparison`. Consider archiving old snapshots to cold storage after 12 months. |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Delta report computation for large snapshots (500+ steps) | Compute on first request, cache in `SnapshotComparison` table. Subsequent requests read from cache. Cache invalidation is not needed because snapshots are immutable. |
| Clone operation with large carry-forward (100+ integrations, 200+ DM objects) | Use `createMany` with batch sizes of 100. Run within a single Prisma transaction. Total clone time target: under 5 seconds. |
| Cross-phase dependency detection | Dependency mappings are loaded from a static configuration. O(n*m) where n = Phase 1 scope items and m = Phase 2 scope items. For typical assessments (50-100 items), this is sub-millisecond. |
| Change request entity lock checks on every edit | Single indexed query on `[assessmentId, status]` to find active CR, then in-memory scan of `unlockedEntities` JSON array. JSON array is bounded by the 200-entity limit on CR creation. |
| Snapshot list query for assessments with many snapshots | Index on `[assessmentId, version]`. Paginate with cursor. Maximum 100 snapshots per assessment recommended. |
| Impact summary computation | Requires lookups of step responses and scope items to determine functional areas. Use `Promise.all` for parallel queries. Target: under 500ms. |
| `SnapshotComparison` table growth | One row per unique snapshot pair compared. For an assessment with 10 snapshots, maximum 45 pairs. Total rows bounded. No cleanup needed. |
| Re-baseline catalog comparison | Reads from already-indexed `ScopeItem` table filtered by version. Index on `[version]` ensures fast lookup. |
| Template save with anonymization | Reuses Phase 26 anonymization engine. Synchronous but lightweight. Under 1 second for typical assessments. |
| Concurrent clone requests for same assessment | Prevented by unique constraint check on `[parentAssessmentId, phaseNumber]`. Second request returns `409`. |

---

## 11. Testing Strategy

### Unit Tests

| Test | File |
|---|---|
| Change request state machine transitions (all valid/invalid) | `__tests__/lib/lifecycle/change-request-state-machine.test.ts` |
| Impact summary computation (area detection, risk level, effort estimation) | `__tests__/lib/lifecycle/impact-summary.test.ts` |
| Delta report scope change detection (added, removed, modified) | `__tests__/lib/lifecycle/delta-scope-changes.test.ts` |
| Delta report classification change detection | `__tests__/lib/lifecycle/delta-classification-changes.test.ts` |
| Delta report gap resolution change detection | `__tests__/lib/lifecycle/delta-gap-changes.test.ts` |
| Cross-phase dependency detection | `__tests__/lib/lifecycle/cross-phase-dependencies.test.ts` |
| Entity lock enforcement (locked, unlocked, not in CR list) | `__tests__/lib/lifecycle/entity-lock.test.ts` |
| Carry-forward config validation (all combinations) | `__tests__/lib/lifecycle/carry-forward-config.test.ts` |
| Reassessment trigger type validation | `__tests__/lib/lifecycle/trigger-types.test.ts` |
| Re-baseline delta computation (new items, removed items, modified steps) | `__tests__/lib/lifecycle/re-baseline-delta.test.ts` |
| Four-eyes principle enforcement for CR approval | `__tests__/lib/lifecycle/four-eyes-principle.test.ts` |
| Zod schema validation (all lifecycle schemas) | `__tests__/lib/validation/lifecycle.test.ts` |

### Integration Tests

| Test | File |
|---|---|
| Full clone workflow (create, verify carry-forward, verify new scope) | `__tests__/api/assessments/clone.test.ts` |
| Clone with all carry-forward options enabled | `__tests__/api/assessments/clone-carry-forward.test.ts` |
| Clone with no carry-forward (minimal clone) | `__tests__/api/assessments/clone-minimal.test.ts` |
| Clone rejects non-signed-off assessment | `__tests__/api/assessments/clone-validation.test.ts` |
| Snapshot comparison (delta report) via API | `__tests__/api/assessments/snapshot-compare.test.ts` |
| Delta report caching (second request reads from cache) | `__tests__/api/assessments/snapshot-compare-cache.test.ts` |
| Change request lifecycle (create, approve, start, complete, re-sign) | `__tests__/api/assessments/change-request-lifecycle.test.ts` |
| Change request rejection flow | `__tests__/api/assessments/change-request-rejection.test.ts` |
| Entity lock enforcement during active CR | `__tests__/api/assessments/entity-lock-enforcement.test.ts` |
| Four-eyes principle blocks self-approval | `__tests__/api/assessments/cr-self-approval.test.ts` |
| Concurrent CR prevention | `__tests__/api/assessments/cr-concurrent.test.ts` |
| Reassessment trigger CRUD | `__tests__/api/assessments/triggers.test.ts` |
| Re-baseline against new SAP version | `__tests__/api/assessments/re-baseline.test.ts` |
| Re-baseline with missing catalog data | `__tests__/api/assessments/re-baseline-missing-catalog.test.ts` |
| Save as template (with anonymization) | `__tests__/api/assessments/save-as-template.test.ts` |
| Permission enforcement (all 11 roles x all endpoints) | `__tests__/api/assessments/lifecycle-permissions.test.ts` |

### E2E Tests

| Test | File |
|---|---|
| Full clone wizard: select carry-forward, pick scope, review dependencies, create | `e2e/assessment-clone.spec.ts` |
| Snapshot comparison: select two versions, view delta report tabs | `e2e/snapshot-comparison.spec.ts` |
| Change request: create CR, approve, edit entities, complete, verify re-sign | `e2e/change-request-flow.spec.ts` |
| Change request banner visibility during active CR | `e2e/change-request-banner.spec.ts` |
| Entity lock indicators on step response rows | `e2e/entity-lock-indicators.spec.ts` |
| Reassessment trigger list and resolution | `e2e/reassessment-triggers.spec.ts` |
| Re-baseline wizard with delta preview | `e2e/re-baseline.spec.ts` |

---

## 12. Migration & Seed Data

### Prisma Migration

```bash
# Migration creates:
# 1. Assessment table extensions: parentAssessmentId, phaseNumber, currentSnapshotId,
#    clonedFromSnapshotId, carryForwardConfig
# 2. ChangeRequest table with ChangeRequestStatus enum
# 3. ReassessmentTrigger table with ReassessmentTriggerType enum
# 4. SnapshotComparison table (delta report cache)
# 5. Self-referencing Assessment relation (AssessmentPhases)
# 6. Indexes on all foreign keys and query patterns
pnpm prisma migrate dev --name add-lifecycle-continuity-models
```

### Migration SQL

```sql
-- AlterTable: Assessment extensions
ALTER TABLE "Assessment" ADD COLUMN "parentAssessmentId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "phaseNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Assessment" ADD COLUMN "currentSnapshotId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "clonedFromSnapshotId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "carryForwardConfig" JSONB;

-- CreateEnum: ChangeRequestStatus
CREATE TYPE "ChangeRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'IN_PROGRESS', 'RE_SIGNED', 'REJECTED');

-- CreateEnum: ReassessmentTriggerType
CREATE TYPE "ReassessmentTriggerType" AS ENUM ('SAP_VERSION_UPDATE', 'NEW_GAP_DISCOVERED', 'SCOPE_EXPANSION', 'REGULATORY_CHANGE', 'PARTNER_RE_BASELINE');

-- CreateTable: ChangeRequest
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "impactSummary" JSONB NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "changes" JSONB,
    "unlockedEntities" JSONB NOT NULL,
    "previousSnapshotId" TEXT NOT NULL,
    "newSnapshotId" TEXT,
    "expeditedSignOff" BOOLEAN NOT NULL DEFAULT true,
    "signOffCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReassessmentTrigger
CREATE TABLE "ReassessmentTrigger" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "triggerType" "ReassessmentTriggerType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceReference" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "changeRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReassessmentTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SnapshotComparison
CREATE TABLE "SnapshotComparison" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "baseSnapshotId" TEXT NOT NULL,
    "compareSnapshotId" TEXT NOT NULL,
    "deltaReport" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "Assessment_parentAssessmentId_idx" ON "Assessment"("parentAssessmentId");
CREATE INDEX "Assessment_phaseNumber_idx" ON "Assessment"("phaseNumber");
CREATE INDEX "ChangeRequest_assessmentId_idx" ON "ChangeRequest"("assessmentId");
CREATE INDEX "ChangeRequest_assessmentId_status_idx" ON "ChangeRequest"("assessmentId", "status");
CREATE INDEX "ChangeRequest_status_idx" ON "ChangeRequest"("status");
CREATE INDEX "ChangeRequest_requestedById_idx" ON "ChangeRequest"("requestedById");
CREATE INDEX "ReassessmentTrigger_assessmentId_idx" ON "ReassessmentTrigger"("assessmentId");
CREATE INDEX "ReassessmentTrigger_assessmentId_status_idx" ON "ReassessmentTrigger"("assessmentId", "status");
CREATE INDEX "ReassessmentTrigger_triggerType_idx" ON "ReassessmentTrigger"("triggerType");
CREATE UNIQUE INDEX "SnapshotComparison_baseSnapshotId_compareSnapshotId_key" ON "SnapshotComparison"("baseSnapshotId", "compareSnapshotId");
CREATE INDEX "SnapshotComparison_assessmentId_idx" ON "SnapshotComparison"("assessmentId");

-- AddForeignKeys
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_parentAssessmentId_fkey" FOREIGN KEY ("parentAssessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_previousSnapshotId_fkey" FOREIGN KEY ("previousSnapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_newSnapshotId_fkey" FOREIGN KEY ("newSnapshotId") REFERENCES "AssessmentSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReassessmentTrigger" ADD CONSTRAINT "ReassessmentTrigger_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### Backfill Existing Assessments

```typescript
/**
 * Backfill existing assessments with Phase 31 fields.
 * All existing assessments are Phase 1 by default.
 * No parent-child relationships exist yet.
 */
async function backfillLifecycleContinuity(): Promise<void> {
  // Set phaseNumber = 1 for all existing assessments (already handled by default)
  // Set currentSnapshotId to latest snapshot (if any) for signed-off assessments
  const signedOffAssessments = await prisma.assessment.findMany({
    where: { status: { in: ["signed_off", "handed_off"] } },
    select: { id: true },
  });

  for (const assessment of signedOffAssessments) {
    const latestSnapshot = await prisma.assessmentSnapshot.findFirst({
      where: { assessmentId: assessment.id },
      orderBy: { version: "desc" },
      select: { id: true },
    });

    if (latestSnapshot) {
      await prisma.assessment.update({
        where: { id: assessment.id },
        data: { currentSnapshotId: latestSnapshot.id },
      });
    }
  }

  console.log(`Backfilled ${signedOffAssessments.length} signed-off assessments with currentSnapshotId`);
}
```

### Seed Data

```typescript
// In prisma/seed.ts -- add lifecycle continuity demo data

// 1. Create a signed-off Phase 1 assessment (if not already seeded by Phase 30)
const phase1Assessment = await prisma.assessment.upsert({
  where: { id: "asmt-demo-phase1" },
  create: {
    id: "asmt-demo-phase1",
    companyName: "Acme Manufacturing Sdn Bhd",
    industry: "manufacturing",
    country: "MY",
    operatingCountries: ["MY", "SG", "TH"],
    companySize: "midsize",
    sapVersion: "2508",
    status: "signed_off",
    createdBy: "user-consultant-demo",
    organizationId: "org-partner-demo",
    phaseNumber: 1,
  },
  update: { phaseNumber: 1 },
});

// 2. Create a Phase 2 clone (draft)
const phase2Assessment = await prisma.assessment.upsert({
  where: { id: "asmt-demo-phase2" },
  create: {
    id: "asmt-demo-phase2",
    companyName: "Acme Manufacturing Sdn Bhd",
    industry: "manufacturing",
    country: "MY",
    operatingCountries: ["MY", "SG", "TH"],
    companySize: "midsize",
    sapVersion: "2602",
    status: "draft",
    createdBy: "user-consultant-demo",
    organizationId: "org-partner-demo",
    parentAssessmentId: "asmt-demo-phase1",
    phaseNumber: 2,
    carryForwardConfig: {
      companyProfile: true,
      stakeholders: true,
      integrationRegister: true,
      dmRegister: true,
      ocmRegister: false,
      scopeItemsAsReference: true,
      lessonsLearned: true,
    },
  },
  update: {},
});

// 3. Seed a change request on the Phase 1 assessment
const demoCR = await prisma.changeRequest.upsert({
  where: { id: "cr-demo-001" },
  create: {
    id: "cr-demo-001",
    assessmentId: "asmt-demo-phase1",
    requestedById: "user-consultant-demo",
    title: "Add intercompany reconciliation scope",
    reason: "Client discovered during implementation that intercompany reconciliation is required for their multi-entity structure across MY, SG, and TH operations.",
    impactSummary: {
      affectedAreas: ["Finance"],
      affectedStepCount: 8,
      affectedGapCount: 2,
      affectedIntegrationCount: 0,
      riskLevel: "MEDIUM",
      estimatedEffort: "Moderate",
      requiresReSign: true,
      affectedSignOffLayers: ["AREA_VALIDATION", "CROSS_FUNCTIONAL"],
    },
    status: "APPROVED",
    approvedById: "user-partner-lead-demo",
    approvedAt: new Date("2026-02-15T10:00:00Z"),
    unlockedEntities: [
      { entityType: "ScopeSelection", entityId: "scope-ic-001", reason: "Add IC scope item" },
      { entityType: "StepResponse", entityId: "step-ic-010", reason: "Classify IC steps" },
      { entityType: "StepResponse", entityId: "step-ic-011", reason: "Classify IC steps" },
      { entityType: "GapResolution", entityId: "gap-ic-001", reason: "IC reporting gap" },
    ],
    previousSnapshotId: "snap-demo-v3",
    expeditedSignOff: true,
  },
  update: {},
});

// 4. Seed reassessment triggers
await prisma.reassessmentTrigger.upsert({
  where: { id: "trigger-demo-sap" },
  create: {
    id: "trigger-demo-sap",
    assessmentId: "asmt-demo-phase1",
    triggerType: "SAP_VERSION_UPDATE",
    title: "SAP S/4HANA Cloud 2602 Available",
    description: "SAP has released S/4HANA Cloud 2602 with updated best practices for Finance and Procurement modules. 5 new scope items and 18 modified process steps detected.",
    sourceReference: "SAP Best Practices 2602",
    detectedById: null,
    status: "OPEN",
  },
  update: {},
});

await prisma.reassessmentTrigger.upsert({
  where: { id: "trigger-demo-reg" },
  create: {
    id: "trigger-demo-reg",
    assessmentId: "asmt-demo-phase1",
    triggerType: "REGULATORY_CHANGE",
    title: "Malaysian e-Invoicing Mandate (Phase 2)",
    description: "LHDN has announced Phase 2 of mandatory e-invoicing for companies with annual turnover above RM25 million, effective January 2026. Assessment scope may need to include e-invoicing capabilities.",
    sourceReference: "LHDN e-Invoice Phase 2 Guidelines",
    detectedById: "user-consultant-demo",
    status: "ACKNOWLEDGED",
  },
  update: {},
});
```

---

## 13. Open Questions

| # | Question | Impact | Recommended Answer | Owner |
|---|---|---|---|---|
| 1 | Should change requests support multiple approvers (e.g., both PM and executive must approve)? | Medium -- affects approval workflow complexity | **No for V2.** Single approval is sufficient. If multi-approval is needed, implement in a future iteration. The four-eyes principle (requester != approver) provides adequate control. | Product |
| 2 | Should the delta report include visual diff of process flow diagrams (SVG comparison)? | Medium -- significant UI effort for visual diffs | **Defer.** Text-based delta reports are sufficient for V2. Visual diagram diffs would require an SVG diff library and custom rendering. Add in V3 if requested. | Engineering + Product |
| 3 | How should cross-phase dependencies be maintained? Static configuration or dynamic analysis? | Medium -- affects accuracy and maintenance burden | **Static configuration for V2.** Load dependency mappings from a JSON configuration file that is updated when new SAP versions are ingested. Dynamic analysis (parsing SAP documentation) is a V3 AI-assisted feature. | Engineering |
| 4 | Should the expedited sign-off reuse the Phase 30 `SignOffProcess` model or create a separate lightweight model? | Medium -- affects schema design and code reuse | **Reuse Phase 30 `SignOffProcess` model.** Create a new `SignOffProcess` record with a flag (`isExpedited: true`) and only create `AreaValidation` records for affected areas. This maximizes code reuse. | Engineering |
| 5 | What is the maximum number of snapshots per assessment before archival? | Low -- affects storage costs | **100 snapshots.** After 100, oldest snapshots (excluding sign-off snapshots) can be archived to cold storage. Sign-off snapshots are never archived. | Engineering + Finance |
| 6 | Should change requests be visible to `viewer` role stakeholders? | Low -- affects information access | **Yes.** Viewers can see change request metadata and status, but not the detailed diff or unlocked entity list. This keeps auditors informed without exposing operational details. | Product |
| 7 | Should re-baseline auto-detect SAP version updates, or should it be manually triggered? | Medium -- affects automation complexity | **Manually triggered for V2.** Add a nightly job that checks for new SAP catalog versions and creates `SAP_VERSION_UPDATE` triggers. The actual re-baseline remains a manual consultant action. | Engineering |
| 8 | Should cloned assessments inherit the parent's sign-off certificate as an appendix? | Low -- affects certificate content | **No.** The cloned assessment is a new engagement. The parent's certificate should be accessible as a reference link, not embedded in the new assessment. | Product + Legal |
| 9 | When a change request is rejected, should the requester be able to re-submit a modified version? | Medium -- affects workflow flexibility | **Yes.** Rejection is terminal for the specific CR, but the requester can create a new CR addressing the rejection feedback. The rejected CR's `rejectedReason` is visible to inform the new request. | Product |
| 10 | Should template generation from Phase 31 assessments include cross-phase metadata (parent link, carry-forward config)? | Low -- affects template reusability | **No.** Templates should be standalone. Cross-phase metadata is specific to the source engagement and would not be meaningful for a new client. Only scope patterns and gap patterns are relevant. | Product |

---

## 14. Acceptance Criteria (Given/When/Then)

### AC-31.1: Snapshot Versioning

```
Given an assessment "ASM-001" with snapshots at versions 1, 2, and 3
When I navigate to the snapshots list page
Then I see all three snapshots with version numbers, labels, and creation timestamps
  And each snapshot shows its SHA-256 hash and creator name
  And the most recent snapshot (v3) is marked as "Current"
```

### AC-31.2: Delta Report Between Snapshots

```
Given snapshots v1 and v3 exist for assessment "ASM-001"
  And v1 has 40 scope items with 30 classified as FIT
  And v3 has 43 scope items with 35 classified as FIT and 2 new gap resolutions
When I compare v1 to v3 via the delta report
Then the summary shows: 3 scope items added, 5 classification changes, 2 gaps added
  And the "Scope Changes" tab lists 3 items with changeType "ADDED"
  And the "Classifications" tab lists 5 items with before/after fitStatus values
  And the "Gap Resolutions" tab lists 2 new gap resolutions with full detail
```

### AC-31.3: Delta Report Caching

```
Given I have already generated a delta report comparing v1 to v3
When I request the same comparison again
Then the response is served from the SnapshotComparison cache
  And the response time is under 100ms
  And the data matches the original computation exactly
```

### AC-31.4: Clone Assessment for Phase 2

```
Given assessment "ASM-001" is signed off (Phase 1) with:
  - 42 scope selections, 8 stakeholders, 12 integrations, 24 DM objects
  - 7 items with relevance "deferred"
When I clone for Phase 2 with carry-forward: companyProfile, stakeholders, integrationRegister, dmRegister, scopeItemsAsReference
  And I select 5 new scope items including 3 DEFERRED items from Phase 1
Then a new assessment "ASM-002" is created in "draft" status with phaseNumber 2
  And parentAssessmentId points to "ASM-001"
  And 8 stakeholders are cloned (excluding any deactivated users)
  And 42 scope selections are carried as read-only reference (currentState = "phase1_reference")
  And 5 new scope selections are created with relevance "to_be_assessed"
  And 12 integration entries are cloned
  And 24 DM objects are cloned
  And 3 DEFERRED items are highlighted as "Previously deferred from Phase 1"
```

### AC-31.5: Cross-Phase Dependency Detection

```
Given Phase 1 assessment includes scope items J60 (Accounts Payable) and J14 (Procurement)
  And Phase 2 includes new scope items 1YB (Intercompany) and BKP (Supplier Management)
  And the dependency map links J60 -> 1YB and J14 -> BKP
When I review the clone preview
Then I see 2 cross-phase dependencies:
  - "Intercompany postings depend on AP master data from Phase 1" (DATA_DEPENDENCY)
  - "Supplier management requires procurement configuration from Phase 1" (PREREQUISITE)
  And each dependency shows both the Phase 1 and Phase 2 scope item names
```

### AC-31.6: Create Change Request on Signed-Off Assessment

```
Given assessment "ASM-001" is signed off
When I create a change request titled "Add intercompany scope" with reason and 4 unlocked entities
Then a ChangeRequest record is created with status "REQUESTED"
  And an automatic snapshot is created labeled "Pre-Change-Request: Add intercompany scope"
  And impactSummary is auto-computed showing affected areas, risk level, and effort estimate
  And all assessment stakeholders with approval authority are notified
```

### AC-31.7: Change Request Approval (Four-Eyes Principle)

```
Given consultant "James" created change request "CR-001" on assessment "ASM-001"
When James attempts to approve CR-001
Then the API returns 403: "You cannot approve your own change request (four-eyes principle)"
But when partner_lead "Sarah" approves CR-001
Then the CR status transitions to "APPROVED"
  And James is notified that the CR was approved
```

### AC-31.8: Entity Lock Enforcement During Change Request

```
Given change request "CR-001" is IN_PROGRESS with unlocked entities:
  - StepResponse "step-ic-010"
  - StepResponse "step-ic-011"
When the consultant tries to edit step response "step-ic-010" (unlocked)
Then the edit is allowed and saved
When the consultant tries to edit step response "step-fi-005" (not unlocked)
Then the API returns 403: "This entity is not included in the active change request"
  And the edit is blocked
```

### AC-31.9: Change Request Banner

```
Given change request "CR-001" has status "IN_PROGRESS"
When any user navigates to any page of assessment "ASM-001"
Then a persistent banner is shown at the top:
  "Change Request Active: 'Add intercompany scope' -- 4 entities unlocked for editing"
  And the banner links to the change request detail page
  And locked entities show a lock icon with tooltip "Locked -- not part of active change request"
```

### AC-31.10: Change Request Completion and Re-Sign

```
Given change request "CR-001" is IN_PROGRESS and all changes have been made
When the consultant clicks "Complete Change Request"
Then a new snapshot is created capturing the post-change state
  And a delta report is auto-generated comparing pre-CR and post-CR snapshots
  And the changes JSON field is populated with the computed diff
  And an expedited sign-off is initiated for affected areas only
  And the CR remains in "IN_PROGRESS" until expedited sign-off completes
When the expedited sign-off is completed
Then the CR status transitions to "RE_SIGNED"
  And all assessment stakeholders are notified
```

### AC-31.11: Reassessment Trigger -- SAP Version Update

```
Given assessment "ASM-001" uses SAP version 2508
  And SAP catalog version 2602 has been ingested into the system
When a system job detects the new version
Then a ReassessmentTrigger is created with triggerType "SAP_VERSION_UPDATE"
  And the trigger title is "SAP S/4HANA Cloud 2602 Available"
  And the consultant and partner_lead are notified via email and in-app
  And the trigger appears on the assessment's triggers page with status "OPEN"
```

### AC-31.12: Re-Baseline Assessment

```
Given assessment "ASM-001" has a reassessment trigger for SAP 2602
When the consultant initiates a re-baseline to version 2602
Then a snapshot is created of the current state
  And the system compares current scope against SAP 2602 catalog
  And the response shows: 5 new scope items, 1 removed, 18 modified process steps
  And a change request is auto-created (if createChangeRequest = true)
  And the trigger status is updated to "IN_PROGRESS"
```

### AC-31.13: Prevent Concurrent Change Requests

```
Given change request "CR-001" is in status "APPROVED" for assessment "ASM-001"
When the consultant tries to create a new change request "CR-002"
Then the API returns 409: "Change request 'Add intercompany scope' is already active"
  And the new CR is not created
```

### AC-31.14: Save Assessment as Template

```
Given assessment "ASM-001" is signed off with 42 scope selections and 15 gap resolutions
When the consultant clicks "Save as Template" with name "Manufacturing Standard MY v2"
Then an AssessmentTemplate is created in the organization
  And all client-specific data (company name, emails, names) is anonymized
  And the template contains 42 scope selection patterns and anonymized gap patterns
  And the template's timesUsed counter starts at 0
```

### AC-31.15: Clone Rejects Non-Signed-Off Assessment

```
Given assessment "ASM-003" is in status "in_progress"
When the consultant attempts to clone it for Phase 2
Then the API returns 422: "Assessment must be signed off or handed off before cloning to a new phase"
```

### AC-31.16: Viewer Can See Change Requests But Not Edit

```
Given a user with role "viewer" is a stakeholder on assessment "ASM-001"
  And change request "CR-001" exists
When the viewer navigates to the change requests list
Then they can see CR-001's title, status, and requester
  But they cannot approve, reject, or create change requests
  And the "Create Change Request" button is not visible
```

---

## 15. Size Estimate

**Size: L (Large)**

| Component | Effort |
|---|---|
| Prisma schema changes (Assessment extensions, ChangeRequest, ReassessmentTrigger, SnapshotComparison) | 1.5 days |
| Migration script and backfill | 1 day |
| Clone assessment API and business logic | 3 days |
| Cross-phase dependency detection engine | 1.5 days |
| Delta report computation and caching | 2.5 days |
| Change request CRUD API (create, approve, reject, complete) | 2.5 days |
| Entity lock enforcement middleware | 1.5 days |
| Impact summary auto-computation | 1 day |
| Expedited sign-off integration (with Phase 30) | 2 days |
| Reassessment trigger CRUD and detection job | 1.5 days |
| Re-baseline API and SAP version comparison | 2 days |
| Save-as-template integration (with Phase 26) | 1 day |
| Clone wizard UI (4-step wizard) | 3 days |
| Delta report viewer UI (5-tab view with tables) | 3 days |
| Change request list/detail pages and banner | 2.5 days |
| Entity lock indicators and partial unlock UI | 1.5 days |
| Reassessment trigger list/detail UI | 1.5 days |
| Re-baseline wizard UI | 1.5 days |
| Zod schemas and TypeScript types | 1 day |
| Unit tests (12 test files) | 3 days |
| Integration tests (16 test files) | 4 days |
| E2E tests (7 test files) | 2.5 days |
| Seed data and demo fixtures | 0.5 day |
| **Total** | **~44 days (~9 weeks)** |

---

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `Assessment` extensions (`parentAssessmentId`, `phaseNumber`, `currentSnapshotId`, `clonedFromSnapshotId`, `carryForwardConfig`)
- [ ] Prisma schema includes `ChangeRequest` model with `ChangeRequestStatus` enum
- [ ] Prisma schema includes `ReassessmentTrigger` model with `ReassessmentTriggerType` enum
- [ ] Prisma schema includes `SnapshotComparison` model for delta report caching
- [ ] Self-referencing `Assessment` relation (`parentAssessment` / `childAssessments`) works correctly
- [ ] Migration applied successfully in development and staging
- [ ] Existing assessments backfilled with `phaseNumber = 1` and `currentSnapshotId`
- [ ] Clone API creates new assessment with correct `parentAssessmentId` and `phaseNumber`
- [ ] Clone carry-forward correctly copies stakeholders, integration register, DM register
- [ ] Clone carries scope selections as read-only reference (`currentState = "phase1_reference"`)
- [ ] DEFERRED items from Phase 1 are highlighted as Phase 2 candidates
- [ ] Cross-phase dependency detection identifies known dependencies between scope items
- [ ] Clone wizard UI walks through 4 steps: carry-forward, scope, dependencies, confirm
- [ ] Delta report computes scope changes (added/removed/modified) between two snapshots
- [ ] Delta report computes classification changes with before/after fitStatus
- [ ] Delta report computes gap resolution changes (added/removed/modified)
- [ ] Delta report computes integration changes
- [ ] Delta report computes sign-off changes
- [ ] Delta reports are cached in `SnapshotComparison` table
- [ ] Delta report viewer UI has 5 tabs with data tables for each change type
- [ ] Summary stat cards show total changes across all dimensions
- [ ] Change request creation validates assessment is signed off
- [ ] Change request creation prevents concurrent CRs on same assessment
- [ ] Change request creation auto-snapshots before changes
- [ ] Change request creation auto-computes impact summary
- [ ] Change request approval enforces four-eyes principle
- [ ] Change request status machine enforces valid transitions only
- [ ] Entity lock enforcement blocks edits to entities not in CR `unlockedEntities`
- [ ] Entity lock enforcement allows edits to explicitly unlocked entities
- [ ] Normal role-based area locking still applies within CR scope
- [ ] Change request banner shown on all assessment pages during active CR
- [ ] Lock/unlock indicators shown on entity rows
- [ ] Change request completion creates new snapshot and computes diff
- [ ] Expedited sign-off initiated for affected areas after CR completion
- [ ] CR transitions to `RE_SIGNED` when expedited sign-off completes
- [ ] Reassessment trigger CRUD supports all 5 trigger types
- [ ] Reassessment trigger status machine (OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED/DISMISSED)
- [ ] Re-baseline compares current scope against new SAP version catalog
- [ ] Re-baseline reports: new scope items, removed items, modified process steps
- [ ] Re-baseline optionally creates change request for scope review
- [ ] Save-as-template creates anonymized `AssessmentTemplate` via Phase 26 engine
- [ ] All API routes have Zod validation on request bodies
- [ ] Permission matrix enforced for all 11 roles across all endpoints
- [ ] Notification triggers fire for all lifecycle events
- [ ] Decision log entries created for all significant actions (clone, CR create/approve/complete, trigger resolution)
- [ ] Unit tests pass (state machine, delta computation, lock enforcement, dependency detection)
- [ ] Integration tests pass (all API routes, clone flow, CR lifecycle, re-baseline)
- [ ] E2E tests pass (clone wizard, delta viewer, CR flow, entity locking, triggers)
- [ ] No TypeScript strict-mode errors introduced
- [ ] No ESLint warnings in new or modified files
- [ ] PR reviewed and approved
