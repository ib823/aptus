# Phase 30: Assessment Handoff, Sign-Off & ALM Integration

## 1. Overview

Implement a legally rigorous, multi-layer sign-off workflow for Aptus assessments with cryptographic integrity verification, immutable assessment snapshots, a formal sign-off certificate PDF, ALM export adapters (SAP Cloud ALM, Jira Cloud, Azure DevOps, Confluence), and a handoff package generator. This phase transforms the assessment from an internal working document into a contractually significant deliverable suitable for enterprise governance and regulatory audit.

**Source**: Addendum 2 Section 2 (Subsections 2.1 through 2.6)

### Multi-Layer Validation Workflow

```
Layer 1: Area Validation       — Each process owner confirms their functional area is accurate
Layer 2: Technical Validation   — IT Lead + Data Migration Lead confirm technical feasibility
Layer 3: Cross-Functional       — Solution Architect confirms no cross-area contradictions
Layer 4: Executive Sign-Off     — Executive Sponsor authorizes (the legally binding signature)
Layer 5: Partner Countersign    — Partner Lead confirms assessment completeness and quality
```

### Validation State Machine

```
VALIDATION_NOT_STARTED
  → AREA_VALIDATION_IN_PROGRESS
  → AREA_VALIDATION_COMPLETE
  → TECHNICAL_VALIDATION_IN_PROGRESS
  → TECHNICAL_VALIDATION_COMPLETE
  → CROSS_FUNCTIONAL_IN_PROGRESS
  → CROSS_FUNCTIONAL_COMPLETE
  → PENDING_EXECUTIVE
  → EXECUTIVE_SIGNED
  → PENDING_PARTNER
  → FULLY_SIGNED_OFF
  → REJECTED (can go back to any previous state with reason)
```

### Goals

- Provide a structured, multi-layer validation workflow that mirrors enterprise governance requirements
- Create immutable, SHA-256-verified snapshots of assessment data at sign-off
- Generate a professional sign-off certificate PDF with all signatures, hashes, and verification URL
- Build pluggable ALM export adapters for SAP Cloud ALM, Jira, Azure DevOps, and Confluence
- Create a comprehensive handoff package (ZIP) containing all assessment artifacts
- Maintain a complete audit trail of every validation action for compliance

**Size**: XL

---

## 2. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Phase 17 (Role System & Organization Model) | Phase | 11-role model for role-gated validation layers |
| Phase 18 (Assessment Lifecycle) | Phase | Status machine; `signed_off` and `handed_off` states |
| Phase 25 (Report Infrastructure) | Phase | PDF/XLSX generators for certificate and handoff package |
| Prisma 6 + PostgreSQL | Infrastructure | Schema migration for snapshot, sign-off, and ALM models |
| Existing `Assessment` model | Schema | Extended with snapshot relation |
| Existing `AssessmentSignOff` model | Schema | Replaced by `SignOffProcess` + `SignatureRecord` (more granular) |
| `@react-pdf/renderer` or `pdf-lib` | Library | Certificate PDF generation |
| `crypto` (Node.js built-in) | Library | SHA-256 hashing for data integrity |
| `archiver` | Library | ZIP archive creation for handoff packages |
| Zod 3.x | Library | Validation schemas for all sign-off operations |
| External ALM APIs (optional) | External Service | SAP Cloud ALM REST API, Jira Cloud REST API, Azure DevOps REST API, Confluence REST API |

---

## 3. Data Model Changes

### New: `AssessmentSnapshot`

```prisma
model AssessmentSnapshot {
  id              String   @id @default(cuid())
  assessmentId    String
  version         Int      // Auto-incrementing per assessment (1, 2, 3, ...)
  label           String?  // Human-readable label, e.g., "Final for Sign-Off", "Post-Change-Request v2"
  snapshotData    Json     // Complete frozen copy of assessment state (scope, responses, gaps, resolutions)
  dataHash        String   // SHA-256 of canonicalized JSON snapshotData
  createdById     String
  reason          String   @db.Text // Why this snapshot was created
  createdAt       DateTime @default(now())

  assessment      Assessment    @relation(fields: [assessmentId], references: [id])
  signOffProcess  SignOffProcess?

  @@unique([assessmentId, version])
  @@index([assessmentId])
  @@index([assessmentId, version])
}
```

### New: `SignOffProcess`

```prisma
model SignOffProcess {
  id                    String   @id @default(cuid())
  assessmentId          String   @unique
  snapshotId            String   @unique
  status                String   @default("VALIDATION_NOT_STARTED")
  // Status values: "VALIDATION_NOT_STARTED" | "AREA_VALIDATION_IN_PROGRESS" |
  //   "AREA_VALIDATION_COMPLETE" | "TECHNICAL_VALIDATION_IN_PROGRESS" |
  //   "TECHNICAL_VALIDATION_COMPLETE" | "CROSS_FUNCTIONAL_IN_PROGRESS" |
  //   "CROSS_FUNCTIONAL_COMPLETE" | "PENDING_EXECUTIVE" |
  //   "EXECUTIVE_SIGNED" | "PENDING_PARTNER" | "FULLY_SIGNED_OFF" | "REJECTED"
  rejectedToStatus      String?  // Which status to return to after rejection
  rejectionReason       String?  @db.Text

  areaValidations       AreaValidation[]
  technicalValidation   TechnicalValidation?
  crossFuncValidation   CrossFunctionalValidation?
  signatures            SignatureRecord[]

  certificatePdfUrl     String?
  certificateHash       String?  // SHA-256 of the certificate PDF bytes
  verificationToken     String?  @unique // For public verification URL: /verify/[token]

  initiatedById         String
  createdAt             DateTime @default(now())
  completedAt           DateTime?

  assessment Assessment        @relation(fields: [assessmentId], references: [id])
  snapshot   AssessmentSnapshot @relation(fields: [snapshotId], references: [id])

  @@index([assessmentId])
  @@index([status])
  @@index([verificationToken])
}
```

### New: `AreaValidation`

```prisma
model AreaValidation {
  id              String   @id @default(cuid())
  signOffId       String
  functionalArea  String   // e.g., "Finance", "Procurement", "Sales"
  validatedById   String
  validatorName   String
  validatorEmail  String
  validatorRole   String   // Expected: "process_owner"
  status          String   // "PENDING" | "APPROVED" | "REJECTED"
  comments        String?  @db.Text
  rejectionReason String?  @db.Text
  validatedAt     DateTime?
  createdAt       DateTime @default(now())

  signOff SignOffProcess @relation(fields: [signOffId], references: [id])

  @@unique([signOffId, functionalArea])
  @@index([signOffId])
  @@index([signOffId, status])
}
```

### New: `TechnicalValidation`

```prisma
model TechnicalValidation {
  id              String    @id @default(cuid())
  signOffId       String    @unique

  itLeadId        String?
  itLeadName      String?
  itLeadEmail     String?
  itLeadStatus    String?   // "PENDING" | "APPROVED" | "REJECTED"
  itLeadComments  String?   @db.Text
  itLeadAt        DateTime?

  dmLeadId        String?
  dmLeadName      String?
  dmLeadEmail     String?
  dmLeadStatus    String?   // "PENDING" | "APPROVED" | "REJECTED"
  dmLeadComments  String?   @db.Text
  dmLeadAt        DateTime?

  createdAt       DateTime  @default(now())

  signOff SignOffProcess @relation(fields: [signOffId], references: [id])
}
```

### New: `CrossFunctionalValidation`

```prisma
model CrossFunctionalValidation {
  id                  String   @id @default(cuid())
  signOffId           String   @unique
  validatedById       String
  validatorName       String
  validatorEmail      String
  status              String   // "PENDING" | "APPROVED" | "REJECTED"
  comments            String?  @db.Text
  conflictsReviewed   Boolean  @default(false)
  conflictCount       Int      @default(0)
  conflictsResolved   Int      @default(0)
  validatedAt         DateTime?
  createdAt           DateTime @default(now())

  signOff SignOffProcess @relation(fields: [signOffId], references: [id])
}
```

### New: `SignatureRecord`

```prisma
model SignatureRecord {
  id                  String   @id @default(cuid())
  signOffId           String
  signatureType       String   // "EXECUTIVE" | "PARTNER"
  signerId            String
  signerName          String
  signerEmail         String
  signerRole          String   // Role at time of signing
  signerOrganization  String   // Organization name at time of signing
  signerTitle         String?  // Job title
  authorityStatement  String   @db.Text // "I, [Name], in my capacity as [Title], authorize..."
  ipAddress           String
  userAgent           String   @db.Text
  authMethod          String   // "sso" | "magic_link+totp" | "magic_link" | "password+totp"
  mfaVerified         Boolean
  documentHash        String   // SHA-256 of snapshotData at sign time (must match snapshot.dataHash)
  signedAt            DateTime
  status              String   @default("PENDING") // "PENDING" | "SIGNED" | "DECLINED"
  declineReason       String?  @db.Text

  signOff SignOffProcess @relation(fields: [signOffId], references: [id])

  @@index([signOffId])
  @@index([signOffId, signatureType])
}
```

### New: `AlmExportRecord`

```prisma
model AlmExportRecord {
  id              String   @id @default(cuid())
  assessmentId    String
  targetSystem    String   // "SAP_CLOUD_ALM" | "JIRA" | "AZURE_DEVOPS" | "CONFLUENCE"
  status          String   @default("PENDING") // "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED"
  exportedById    String
  exportConfig    Json     // Target-specific configuration (project key, credentials ref, etc.)
  exportMapping   Json?    // Mapping of Aptus entities to ALM entities
  resultSummary   Json?    // { created: N, updated: N, failed: N, errors: [...] }
  errorMessage    String?  @db.Text
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime @default(now())

  @@index([assessmentId])
  @@index([assessmentId, targetSystem])
}
```

### New: `HandoffPackage`

```prisma
model HandoffPackage {
  id              String   @id @default(cuid())
  assessmentId    String
  snapshotVersion Int
  packageType     String   @default("FULL") // "FULL" | "TECHNICAL" | "EXECUTIVE"
  contents        String[] // List of included artifacts
  fileSize        Int?     // Bytes
  blobUrl         String?  // Cloud storage URL
  generatedById   String
  generatedAt     DateTime @default(now())

  @@index([assessmentId])
}
```

### TypeScript Types (`src/types/signoff.ts`)

```typescript
export type SignOffStatus =
  | "VALIDATION_NOT_STARTED"
  | "AREA_VALIDATION_IN_PROGRESS"
  | "AREA_VALIDATION_COMPLETE"
  | "TECHNICAL_VALIDATION_IN_PROGRESS"
  | "TECHNICAL_VALIDATION_COMPLETE"
  | "CROSS_FUNCTIONAL_IN_PROGRESS"
  | "CROSS_FUNCTIONAL_COMPLETE"
  | "PENDING_EXECUTIVE"
  | "EXECUTIVE_SIGNED"
  | "PENDING_PARTNER"
  | "FULLY_SIGNED_OFF"
  | "REJECTED";

export type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED";

export type SignatureType = "EXECUTIVE" | "PARTNER";

export type AlmTarget = "SAP_CLOUD_ALM" | "JIRA" | "AZURE_DEVOPS" | "CONFLUENCE";

export type HandoffPackageType = "FULL" | "TECHNICAL" | "EXECUTIVE";

export interface SnapshotData {
  assessmentId: string;
  companyName: string;
  industry: string;
  country: string;
  sapVersion: string;
  capturedAt: string; // ISO timestamp
  scopeSelections: ScopeSelectionSnapshot[];
  stepResponses: StepResponseSnapshot[];
  gapResolutions: GapResolutionSnapshot[];
  stakeholders: StakeholderSnapshot[];
  statistics: AssessmentStatistics;
}

export interface AssessmentStatistics {
  totalScopeItems: number;
  selectedScopeItems: number;
  totalSteps: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
  gapResolutionCount: number;
  completionPercentage: number;
}
```

### Zod Schemas (`src/lib/validation/signoff.ts`)

```typescript
import { z } from "zod";

export const SignOffStatusSchema = z.enum([
  "VALIDATION_NOT_STARTED",
  "AREA_VALIDATION_IN_PROGRESS",
  "AREA_VALIDATION_COMPLETE",
  "TECHNICAL_VALIDATION_IN_PROGRESS",
  "TECHNICAL_VALIDATION_COMPLETE",
  "CROSS_FUNCTIONAL_IN_PROGRESS",
  "CROSS_FUNCTIONAL_COMPLETE",
  "PENDING_EXECUTIVE",
  "EXECUTIVE_SIGNED",
  "PENDING_PARTNER",
  "FULLY_SIGNED_OFF",
  "REJECTED",
]);

export const CreateSnapshotSchema = z.object({
  label: z.string().max(200).optional(),
  reason: z.string().min(1).max(2000),
});

export const StartSignOffSchema = z.object({
  snapshotVersion: z.number().int().positive(),
});

export const AreaValidationSubmitSchema = z.object({
  functionalArea: z.string().min(1).max(100),
  status: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().max(5000).optional(),
  rejectionReason: z.string().max(2000).optional(),
});

export const TechnicalValidationSubmitSchema = z.object({
  role: z.enum(["it_lead", "data_migration_lead"]),
  status: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().max(5000).optional(),
});

export const CrossFunctionalValidationSubmitSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  comments: z.string().max(5000).optional(),
  conflictsReviewed: z.boolean(),
  conflictCount: z.number().int().min(0).optional(),
  conflictsResolved: z.number().int().min(0).optional(),
});

export const ExecutiveSignatureSchema = z.object({
  authorityStatement: z.string().min(10).max(2000),
  signerTitle: z.string().max(200).optional(),
  acknowledgement: z.boolean().refine((v) => v === true, {
    message: "Executive must acknowledge the sign-off",
  }),
});

export const PartnerSignatureSchema = z.object({
  authorityStatement: z.string().min(10).max(2000),
  acknowledgement: z.boolean().refine((v) => v === true, {
    message: "Partner must acknowledge the countersign",
  }),
});

export const DeclineSignatureSchema = z.object({
  reason: z.string().min(10).max(2000),
});

export const AlmExportSchema = z.object({
  targetSystem: z.enum(["SAP_CLOUD_ALM", "JIRA", "AZURE_DEVOPS", "CONFLUENCE"]),
  config: z.object({
    baseUrl: z.string().url().max(2048),
    projectKey: z.string().max(100).optional(),
    apiToken: z.string().max(500).optional(),
    credentialRef: z.string().max(200).optional(), // Reference to stored credential
    mappingOverrides: z.record(z.string()).optional(),
  }),
});

export const HandoffPackageSchema = z.object({
  packageType: z.enum(["FULL", "TECHNICAL", "EXECUTIVE"]).default("FULL"),
  includeArtifacts: z.array(z.enum([
    "executive_summary",
    "scope_catalog",
    "step_detail",
    "gap_register",
    "effort_estimate",
    "config_workbook",
    "process_flow_diagrams",
    "sign_off_certificate",
    "audit_trail",
    "remaining_items",
    "raw_data_json",
  ])).min(1),
});
```

---

## 4. API Routes

### Snapshots

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/snapshots` | Create immutable snapshot of current assessment state | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/snapshots` | List all snapshots for an assessment (paginated) | Any assessment stakeholder |
| `GET` | `/api/assessments/[id]/snapshots/[version]` | Get specific snapshot by version number | Any assessment stakeholder |

### Sign-Off Process

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/sign-off/start` | Initiate sign-off process (pins to a snapshot) | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/sign-off` | Get current sign-off process status and all validations | Any assessment stakeholder |
| `POST` | `/api/assessments/[id]/sign-off/area-validation` | Submit area validation (approve/reject) | `process_owner` (assigned to that area) |
| `POST` | `/api/assessments/[id]/sign-off/technical-validation` | Submit technical validation (IT Lead or DM Lead) | `it_lead`, `data_migration_lead` |
| `POST` | `/api/assessments/[id]/sign-off/cross-functional` | Submit cross-functional validation | `solution_architect` |
| `POST` | `/api/assessments/[id]/sign-off/executive` | Executive sign-off (legally binding signature) | `executive_sponsor` |
| `POST` | `/api/assessments/[id]/sign-off/executive/decline` | Executive declines sign-off | `executive_sponsor` |
| `POST` | `/api/assessments/[id]/sign-off/partner` | Partner countersign | `partner_lead` |
| `POST` | `/api/assessments/[id]/sign-off/partner/decline` | Partner declines countersign | `partner_lead` |
| `POST` | `/api/assessments/[id]/sign-off/reject` | Reject sign-off (return to previous validation layer) | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` |

### Certificate & Verification

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/assessments/[id]/sign-off/certificate` | Download sign-off certificate PDF | Any assessment stakeholder |
| `GET` | `/api/verify/[token]` | Public verification endpoint (no auth required) | Public |

### Handoff & ALM Export

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/assessments/[id]/handoff/export` | Generate handoff package (ZIP) | `consultant`, `partner_lead`, `platform_admin` |
| `GET` | `/api/assessments/[id]/handoff/packages` | List generated handoff packages | Any assessment stakeholder |
| `GET` | `/api/assessments/[id]/handoff/packages/[packageId]/download` | Download handoff package | Any assessment stakeholder |
| `POST` | `/api/assessments/[id]/handoff/alm-export` | Export to ALM tool | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` |
| `GET` | `/api/assessments/[id]/handoff/alm-exports` | List ALM export records | Any assessment stakeholder |
| `GET` | `/api/assessments/[id]/handoff/alm-exports/[exportId]` | Get ALM export status/result | Any assessment stakeholder |

### Request/Response Examples

**POST `/api/assessments/[id]/snapshots`**
```json
// Request
{
  "label": "Final for Sign-Off",
  "reason": "All areas reviewed, gap resolutions approved, ready for executive sign-off"
}

// Response 201
{
  "id": "clx_snap_123",
  "assessmentId": "clx_asmt_456",
  "version": 3,
  "label": "Final for Sign-Off",
  "dataHash": "sha256:a1b2c3d4e5f6...64chars",
  "createdAt": "2026-02-21T14:30:00Z",
  "statistics": {
    "totalScopeItems": 50,
    "selectedScopeItems": 42,
    "totalSteps": 487,
    "fitCount": 310,
    "configureCount": 95,
    "gapCount": 52,
    "naCount": 20,
    "pendingCount": 10,
    "completionPercentage": 97.9
  }
}
```

**POST `/api/assessments/[id]/sign-off/executive`**
```json
// Request
{
  "authorityStatement": "I, Maria Santos, in my capacity as Chief Operating Officer of GlobalTech Industries, authorize this SAP S/4HANA Cloud Fit-to-Standard assessment as an accurate representation of our requirements and readiness.",
  "signerTitle": "Chief Operating Officer",
  "acknowledgement": true
}

// Response 200
{
  "signatureId": "clx_sig_789",
  "signatureType": "EXECUTIVE",
  "signerName": "Maria Santos",
  "documentHash": "sha256:a1b2c3d4e5f6...64chars",
  "signedAt": "2026-02-21T15:00:00Z",
  "authMethod": "magic_link+totp",
  "mfaVerified": true,
  "signOffStatus": "EXECUTIVE_SIGNED"
}
```

---

## 5. UI Components

### New Pages

| Page | Route | Description |
|---|---|---|
| `SignOffDashboard` | `/assessments/[id]/sign-off` | Overview of sign-off process with all validation layers and progress |
| `AreaValidationView` | `/assessments/[id]/sign-off/areas` | Grid of functional areas with validation status per area |
| `TechnicalValidationView` | `/assessments/[id]/sign-off/technical` | IT Lead and DM Lead validation panels |
| `CrossFunctionalView` | `/assessments/[id]/sign-off/cross-functional` | Cross-functional conflict review interface |
| `ExecutiveSignView` | `/assessments/[id]/sign-off/executive` | Executive sign-off form with authority statement and legal acknowledgement |
| `PartnerSignView` | `/assessments/[id]/sign-off/partner` | Partner countersign form |
| `CertificateView` | `/assessments/[id]/sign-off/certificate` | Certificate preview with download button |
| `VerificationPage` | `/verify/[token]` | Public verification page showing certificate validity |
| `HandoffPage` | `/assessments/[id]/handoff` | Handoff package generator and ALM export interface |
| `SnapshotListPage` | `/assessments/[id]/snapshots` | List of all snapshots with version comparison |

### New Components

| Component | Location | Description |
|---|---|---|
| `SignOffProgressTracker` | `src/components/signoff/SignOffProgressTracker.tsx` | Vertical stepper showing all 5 validation layers with current status |
| `AreaValidationCard` | `src/components/signoff/AreaValidationCard.tsx` | Card for each functional area showing validation status, validator, comments |
| `ValidationStatusBadge` | `src/components/signoff/ValidationStatusBadge.tsx` | Badge for PENDING / APPROVED / REJECTED with appropriate colors |
| `TechnicalValidationPanel` | `src/components/signoff/TechnicalValidationPanel.tsx` | Side-by-side panels for IT Lead and DM Lead validation |
| `ConflictReviewPanel` | `src/components/signoff/ConflictReviewPanel.tsx` | Panel listing cross-area conflicts for solution architect review |
| `SignatureForm` | `src/components/signoff/SignatureForm.tsx` | Form with authority statement, acknowledgement checkbox, MFA verification |
| `SignatureDisplay` | `src/components/signoff/SignatureDisplay.tsx` | Read-only display of a completed signature with all metadata |
| `DataIntegrityBadge` | `src/components/signoff/DataIntegrityBadge.tsx` | Badge showing SHA-256 hash verification status (valid/tampered) |
| `CertificatePreview` | `src/components/signoff/CertificatePreview.tsx` | PDF preview component for the sign-off certificate |
| `SnapshotCard` | `src/components/signoff/SnapshotCard.tsx` | Card showing snapshot version, label, hash, creation date |
| `SnapshotDiffViewer` | `src/components/signoff/SnapshotDiffViewer.tsx` | Side-by-side diff viewer for comparing two snapshots |
| `HandoffArtifactSelector` | `src/components/handoff/HandoffArtifactSelector.tsx` | Checklist of artifacts to include in handoff package |
| `AlmExportForm` | `src/components/handoff/AlmExportForm.tsx` | Form for configuring ALM export target, credentials, mapping |
| `AlmExportStatusCard` | `src/components/handoff/AlmExportStatusCard.tsx` | Card showing ALM export progress and results |
| `HandoffPackageCard` | `src/components/handoff/HandoffPackageCard.tsx` | Card for each generated handoff package with download link |
| `RejectionDialog` | `src/components/signoff/RejectionDialog.tsx` | Dialog for entering rejection reason and selecting return-to layer |

### Modified Components

| Component | Changes |
|---|---|
| Assessment detail header | Add sign-off status indicator and "Start Sign-Off" action button |
| Assessment status badge | Support `PENDING_SIGN_OFF`, `SIGNED_OFF`, `HANDED_OFF` states |
| Assessment list page | Show sign-off status column for assessments in validation/sign-off states |
| Navigation sidebar | Add "Sign-Off" and "Handoff" links when assessment is in relevant states |

---

## 6. Business Logic

### Snapshot Creation

```typescript
import { createHash } from "crypto";

async function createAssessmentSnapshot(
  assessmentId: string,
  userId: string,
  label: string | undefined,
  reason: string
): Promise<AssessmentSnapshot> {
  // 1. Gather complete assessment state
  const snapshotData = await gatherSnapshotData(assessmentId);

  // 2. Compute canonical hash
  const canonicalJson = JSON.stringify(snapshotData, Object.keys(snapshotData).sort());
  const dataHash = createHash("sha256").update(canonicalJson).digest("hex");

  // 3. Determine next version number
  const lastSnapshot = await prisma.assessmentSnapshot.findFirst({
    where: { assessmentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (lastSnapshot?.version ?? 0) + 1;

  // 4. Create immutable snapshot
  return prisma.assessmentSnapshot.create({
    data: {
      assessmentId,
      version: nextVersion,
      label,
      snapshotData: snapshotData as unknown as Prisma.InputJsonValue,
      dataHash: `sha256:${dataHash}`,
      createdById: userId,
      reason,
    },
  });
}

async function gatherSnapshotData(assessmentId: string): Promise<SnapshotData> {
  const assessment = await prisma.assessment.findUniqueOrThrow({
    where: { id: assessmentId },
    include: {
      scopeSelections: true,
      stepResponses: { include: { processStep: true } },
      gapResolutions: true,
      stakeholders: true,
    },
  });

  const fitCount = assessment.stepResponses.filter((r) => r.fitStatus === "FIT").length;
  const configureCount = assessment.stepResponses.filter((r) => r.fitStatus === "CONFIGURE").length;
  const gapCount = assessment.stepResponses.filter((r) => r.fitStatus === "GAP").length;
  const naCount = assessment.stepResponses.filter((r) => r.fitStatus === "NA").length;
  const pendingCount = assessment.stepResponses.filter((r) => r.fitStatus === "PENDING").length;
  const totalSteps = assessment.stepResponses.length;

  return {
    assessmentId: assessment.id,
    companyName: assessment.companyName,
    industry: assessment.industry,
    country: assessment.country,
    sapVersion: assessment.sapVersion,
    capturedAt: new Date().toISOString(),
    scopeSelections: assessment.scopeSelections.map((s) => ({
      scopeItemId: s.scopeItemId,
      selected: s.selected,
      relevance: s.relevance,
      notes: s.notes,
    })),
    stepResponses: assessment.stepResponses.map((r) => ({
      processStepId: r.processStepId,
      fitStatus: r.fitStatus,
      clientNote: r.clientNote,
    })),
    gapResolutions: assessment.gapResolutions.map((g) => ({
      processStepId: g.processStepId,
      gapDescription: g.gapDescription,
      resolutionType: g.resolutionType,
      resolutionDescription: g.resolutionDescription,
      effortDays: g.effortDays,
    })),
    stakeholders: assessment.stakeholders.map((s) => ({
      name: s.name,
      email: s.email,
      role: s.role,
      assignedAreas: s.assignedAreas,
    })),
    statistics: {
      totalScopeItems: assessment.scopeSelections.length,
      selectedScopeItems: assessment.scopeSelections.filter((s) => s.selected).length,
      totalSteps,
      fitCount,
      configureCount,
      gapCount,
      naCount,
      pendingCount,
      gapResolutionCount: assessment.gapResolutions.length,
      completionPercentage:
        totalSteps > 0
          ? Math.round(((totalSteps - pendingCount) / totalSteps) * 1000) / 10
          : 0,
    },
  };
}
```

### Sign-Off State Machine

```typescript
export const SIGNOFF_TRANSITIONS: Record<SignOffStatus, SignOffStatus[]> = {
  VALIDATION_NOT_STARTED:           ["AREA_VALIDATION_IN_PROGRESS"],
  AREA_VALIDATION_IN_PROGRESS:      ["AREA_VALIDATION_COMPLETE", "REJECTED"],
  AREA_VALIDATION_COMPLETE:         ["TECHNICAL_VALIDATION_IN_PROGRESS"],
  TECHNICAL_VALIDATION_IN_PROGRESS: ["TECHNICAL_VALIDATION_COMPLETE", "REJECTED"],
  TECHNICAL_VALIDATION_COMPLETE:    ["CROSS_FUNCTIONAL_IN_PROGRESS"],
  CROSS_FUNCTIONAL_IN_PROGRESS:     ["CROSS_FUNCTIONAL_COMPLETE", "REJECTED"],
  CROSS_FUNCTIONAL_COMPLETE:        ["PENDING_EXECUTIVE"],
  PENDING_EXECUTIVE:                ["EXECUTIVE_SIGNED", "REJECTED"],
  EXECUTIVE_SIGNED:                 ["PENDING_PARTNER"],
  PENDING_PARTNER:                  ["FULLY_SIGNED_OFF", "REJECTED"],
  FULLY_SIGNED_OFF:                 [],  // Terminal
  REJECTED:                         [
    "AREA_VALIDATION_IN_PROGRESS",
    "TECHNICAL_VALIDATION_IN_PROGRESS",
    "CROSS_FUNCTIONAL_IN_PROGRESS",
    "PENDING_EXECUTIVE",
    "PENDING_PARTNER",
  ],
};
```

### Auto-Transition Logic

```typescript
async function checkAndAdvanceSignOff(signOffId: string): Promise<void> {
  const signOff = await prisma.signOffProcess.findUniqueOrThrow({
    where: { id: signOffId },
    include: {
      areaValidations: true,
      technicalValidation: true,
      crossFuncValidation: true,
    },
  });

  // Layer 1: Check if all areas are validated
  if (signOff.status === "AREA_VALIDATION_IN_PROGRESS") {
    const allApproved = signOff.areaValidations.every((v) => v.status === "APPROVED");
    const anyRejected = signOff.areaValidations.some((v) => v.status === "REJECTED");

    if (anyRejected) {
      await transitionSignOff(signOffId, "REJECTED", "One or more areas were rejected");
    } else if (allApproved && signOff.areaValidations.length > 0) {
      await transitionSignOff(signOffId, "AREA_VALIDATION_COMPLETE");
    }
  }

  // Layer 2: Check if both technical leads validated
  if (signOff.status === "TECHNICAL_VALIDATION_IN_PROGRESS" && signOff.technicalValidation) {
    const tv = signOff.technicalValidation;
    const itDone = tv.itLeadStatus === "APPROVED" || tv.itLeadStatus === "REJECTED";
    const dmDone = tv.dmLeadStatus === "APPROVED" || tv.dmLeadStatus === "REJECTED";
    const anyRejected = tv.itLeadStatus === "REJECTED" || tv.dmLeadStatus === "REJECTED";

    if (anyRejected) {
      await transitionSignOff(signOffId, "REJECTED", "Technical validation rejected");
    } else if (itDone && dmDone) {
      await transitionSignOff(signOffId, "TECHNICAL_VALIDATION_COMPLETE");
    }
  }

  // Layer 3: Cross-functional is a single validator
  // (handled directly in the submit endpoint)
}
```

### Data Integrity Verification

```typescript
async function verifySnapshotIntegrity(snapshotId: string): Promise<{
  valid: boolean;
  expectedHash: string;
  computedHash: string;
}> {
  const snapshot = await prisma.assessmentSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
  });

  const canonicalJson = JSON.stringify(
    snapshot.snapshotData,
    Object.keys(snapshot.snapshotData as object).sort()
  );
  const computedHash = `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}`;

  return {
    valid: computedHash === snapshot.dataHash,
    expectedHash: snapshot.dataHash,
    computedHash,
  };
}
```

### Certificate PDF Generation

```typescript
async function generateSignOffCertificate(signOffId: string): Promise<Buffer> {
  const signOff = await prisma.signOffProcess.findUniqueOrThrow({
    where: { id: signOffId },
    include: {
      assessment: true,
      snapshot: true,
      areaValidations: true,
      technicalValidation: true,
      crossFuncValidation: true,
      signatures: true,
    },
  });

  // Certificate contains:
  // 1. Header with Aptus logo and certificate title
  // 2. Assessment summary (company, industry, scope stats)
  // 3. Classification breakdown (FIT/CONFIGURE/GAP/NA counts)
  // 4. Area validations table (area, validator, status, date)
  // 5. Technical validation (IT Lead + DM Lead status)
  // 6. Cross-functional validation (SA status, conflicts reviewed)
  // 7. Executive signature block (name, title, org, authority statement, IP, auth method, timestamp)
  // 8. Partner countersign block (name, org, authority statement, IP, auth method, timestamp)
  // 9. Data integrity section (snapshot version, SHA-256 hash)
  // 10. Verification URL: https://app.aptus.io/verify/{verificationToken}
  // 11. Footer with generation timestamp and Aptus branding

  const pdfBuffer = await renderCertificatePdf(signOff);

  // Store and compute certificate hash
  const certificateHash = `sha256:${createHash("sha256").update(pdfBuffer).digest("hex")}`;

  await prisma.signOffProcess.update({
    where: { id: signOffId },
    data: {
      certificatePdfUrl: await uploadToStorage(pdfBuffer, `certificates/${signOffId}.pdf`),
      certificateHash,
    },
  });

  return pdfBuffer;
}
```

### ALM Export Adapter Interface

```typescript
interface AlmExportAdapter {
  readonly targetSystem: AlmTarget;

  validateConnection(config: AlmExportConfig): Promise<{ valid: boolean; error?: string }>;
  exportAssessment(assessment: AssessmentExportPayload, config: AlmExportConfig): Promise<AlmExportResult>;
}

interface AlmExportConfig {
  baseUrl: string;
  projectKey?: string;
  apiToken?: string;
  credentialRef?: string;
  mappingOverrides?: Record<string, string>;
}

interface AssessmentExportPayload {
  assessment: Assessment;
  snapshot: SnapshotData;
  gapResolutions: GapResolution[];
  stakeholders: AssessmentStakeholder[];
}

interface AlmExportResult {
  created: number;
  updated: number;
  failed: number;
  entityMapping: Array<{ aptusId: string; almId: string; almUrl: string; entityType: string }>;
  errors: Array<{ entity: string; error: string }>;
}
```

### Jira Export Adapter (Example)

```typescript
class JiraExportAdapter implements AlmExportAdapter {
  readonly targetSystem = "JIRA" as const;

  async exportAssessment(
    payload: AssessmentExportPayload,
    config: AlmExportConfig
  ): Promise<AlmExportResult> {
    const jira = new JiraClient(config.baseUrl, config.apiToken!);
    const result: AlmExportResult = { created: 0, updated: 0, failed: 0, entityMapping: [], errors: [] };

    // 1. Create Epic per functional area
    const areas = groupByFunctionalArea(payload.snapshot.scopeSelections);
    for (const [area, items] of Object.entries(areas)) {
      const epic = await jira.createIssue({
        projectKey: config.projectKey!,
        issueType: "Epic",
        summary: `[Aptus] ${area}`,
        description: `Functional area from Fit-to-Standard assessment: ${payload.assessment.companyName}`,
      });
      result.created++;
      result.entityMapping.push({
        aptusId: area,
        almId: epic.key,
        almUrl: `${config.baseUrl}/browse/${epic.key}`,
        entityType: "Epic",
      });

      // 2. Create Story per GAP item
      for (const gap of payload.gapResolutions.filter((g) => items.some((i) => i.scopeItemId === g.scopeItemId))) {
        const story = await jira.createIssue({
          projectKey: config.projectKey!,
          issueType: "Story",
          summary: `[GAP] ${gap.gapDescription.slice(0, 200)}`,
          description: formatGapForJira(gap),
          epicKey: epic.key,
        });
        result.created++;
        result.entityMapping.push({
          aptusId: gap.id,
          almId: story.key,
          almUrl: `${config.baseUrl}/browse/${story.key}`,
          entityType: "Story",
        });
      }
    }

    return result;
  }
}
```

### Handoff Package Generation

```typescript
async function generateHandoffPackage(
  assessmentId: string,
  userId: string,
  options: HandoffPackageOptions
): Promise<string> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const buffers: Buffer[] = [];
  archive.on("data", (data) => buffers.push(data));

  // Include selected artifacts
  if (options.includeArtifacts.includes("executive_summary")) {
    const pdf = await generateExecutiveSummaryPdf(assessmentId);
    archive.append(pdf, { name: "01-Executive-Summary.pdf" });
  }
  if (options.includeArtifacts.includes("scope_catalog")) {
    const xlsx = await generateScopeCatalogXlsx(assessmentId);
    archive.append(xlsx, { name: "02-Scope-Catalog.xlsx" });
  }
  if (options.includeArtifacts.includes("step_detail")) {
    const xlsx = await generateStepDetailXlsx(assessmentId);
    archive.append(xlsx, { name: "03-Step-Detail.xlsx" });
  }
  if (options.includeArtifacts.includes("gap_register")) {
    const xlsx = await generateGapRegisterXlsx(assessmentId);
    archive.append(xlsx, { name: "04-Gap-Register.xlsx" });
  }
  if (options.includeArtifacts.includes("sign_off_certificate")) {
    const pdf = await getSignOffCertificatePdf(assessmentId);
    if (pdf) archive.append(pdf, { name: "10-Sign-Off-Certificate.pdf" });
  }
  if (options.includeArtifacts.includes("raw_data_json")) {
    const snapshot = await getLatestSnapshot(assessmentId);
    if (snapshot) {
      archive.append(JSON.stringify(snapshot.snapshotData, null, 2), {
        name: "99-Raw-Assessment-Data.json",
      });
    }
  }

  await archive.finalize();
  const zipBuffer = Buffer.concat(buffers);

  // Store and record
  const blobUrl = await uploadToStorage(zipBuffer, `handoff/${assessmentId}/${Date.now()}.zip`);

  await prisma.handoffPackage.create({
    data: {
      assessmentId,
      snapshotVersion: (await getLatestSnapshot(assessmentId))?.version ?? 0,
      packageType: options.packageType,
      contents: options.includeArtifacts,
      fileSize: zipBuffer.length,
      blobUrl,
      generatedById: userId,
    },
  });

  return blobUrl;
}
```

---

## 7. Permissions & Access Control

| Action | Allowed Roles | Conditions |
|---|---|---|
| Create snapshot | `consultant`, `partner_lead`, `platform_admin` | Assessment must not be in `archived` state |
| View snapshots | Any assessment stakeholder | Read-only access |
| Initiate sign-off process | `consultant`, `partner_lead`, `platform_admin` | Assessment must be in `pending_sign_off` status (from Phase 18 lifecycle) |
| Submit area validation | `process_owner` | Must be assigned to the specific functional area as stakeholder |
| Submit technical validation (IT) | `it_lead` | Must be a stakeholder on the assessment |
| Submit technical validation (DM) | `data_migration_lead` | Must be a stakeholder on the assessment |
| Submit cross-functional validation | `solution_architect` | Must be a stakeholder on the assessment |
| Executive sign-off | `executive_sponsor` | Must be a stakeholder; MFA required |
| Partner countersign | `partner_lead` | Must be from the partner organization; MFA required |
| Decline signature | `executive_sponsor`, `partner_lead` | Must provide decline reason |
| Reject sign-off (return to earlier layer) | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` | Must provide rejection reason |
| Download certificate | Any assessment stakeholder | Sign-off must be `FULLY_SIGNED_OFF` |
| View public verification | Public | No auth; requires valid `verificationToken` |
| Generate handoff package | `consultant`, `partner_lead`, `platform_admin` | Assessment must be `signed_off` or `handed_off` |
| Export to ALM | `consultant`, `partner_lead`, `solution_architect`, `platform_admin` | Assessment must be `signed_off` or `handed_off` |

### MFA Requirement for Signatures

Both executive sign-off and partner countersign require MFA verification in the current session. If the session does not have `mfaVerified = true`, the API returns `403 Forbidden` with error code `MFA_REQUIRED`.

---

## 8. Notification Triggers

| Event | Recipients | Channel | Priority |
|---|---|---|---|
| Sign-off process initiated | All assessment stakeholders | Email, in-app | High |
| Area validation requested | Assigned `process_owner` for each area | Email, in-app | High |
| Area validation completed (all areas) | `consultant`, `partner_lead` | In-app | Normal |
| Area validation rejected | `consultant`, `partner_lead`, rejecting `process_owner` | Email, in-app | High |
| Technical validation requested | `it_lead`, `data_migration_lead` stakeholders | Email, in-app | High |
| Technical validation completed | `consultant`, `partner_lead` | In-app | Normal |
| Cross-functional validation requested | `solution_architect` stakeholders | Email, in-app | High |
| Cross-functional validation completed | `consultant`, `partner_lead` | In-app | Normal |
| Executive sign-off requested | `executive_sponsor` stakeholders | Email, in-app, push | High |
| Executive signed | All stakeholders | Email, in-app | High |
| Executive declined | `consultant`, `partner_lead` | Email, in-app | High |
| Partner countersign requested | `partner_lead` | Email, in-app | High |
| Fully signed off | All stakeholders | Email, in-app | High |
| Sign-off rejected (any layer) | All stakeholders | Email, in-app | High |
| Certificate generated | `executive_sponsor`, `partner_lead`, `consultant` | Email (with attachment), in-app | Normal |
| ALM export completed | Exporting user, `consultant`, `partner_lead` | In-app | Normal |
| ALM export failed | Exporting user, `consultant`, `partner_lead` | In-app, email | High |
| Handoff package generated | Generating user, `partner_lead` | In-app | Normal |

---

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Snapshot created while another user is editing | Snapshot captures state at instant of creation; concurrent edits after snapshot do not affect it |
| Sign-off initiated but snapshot data has changed since snapshot creation | Warn user that assessment has been modified since snapshot; recommend creating a new snapshot |
| Process owner not assigned for a functional area | Block transition to `AREA_VALIDATION_IN_PROGRESS` with error: "All functional areas must have an assigned process_owner stakeholder" |
| Executive declines sign-off | Status moves to `REJECTED`; reason recorded; consultant must address concerns and re-initiate |
| Partner declines countersign | Status moves to `REJECTED`; reason recorded; consultant must address concerns |
| MFA not enabled for executive sponsor | Block sign-off with `422`: "Executive sign-off requires MFA to be enabled. Please set up TOTP or WebAuthn." |
| SHA-256 hash mismatch during verification | Display "Integrity verification FAILED" on public verification page with red warning |
| ALM target system unreachable | Mark export as `FAILED` with error message; allow retry; do not block sign-off process |
| ALM export partially completes (some entities created, some failed) | Record partial results in `resultSummary`; status = `COMPLETED` with errors logged |
| Duplicate sign-off attempt (executive signs twice) | Reject with `409 Conflict`: "Executive signature already recorded" |
| Sign-off on assessment with pending (unclassified) steps | Block with `422`: "Assessment has N pending steps. All steps must be classified before sign-off." |
| Certificate PDF generation fails | Log error; return `500`; allow retry; sign-off status remains `FULLY_SIGNED_OFF` |
| Handoff package too large (>500MB) | Stream to blob storage; never buffer entire ZIP in memory |
| Verification token collision | Use cuid() which has negligible collision probability; if collision detected, regenerate |
| Concurrent area validations submitted simultaneously | Each area has `@@unique([signOffId, functionalArea])`; upsert semantics prevent duplicates |

---

## 10. Performance Considerations

| Concern | Mitigation |
|---|---|
| Snapshot data can be very large (500+ steps, resolutions, etc.) | Store `snapshotData` as `Json` in PostgreSQL (JSONB); compress if >5MB; lazy-load in UI |
| SHA-256 computation for large snapshots | Compute server-side; hash computation is fast (<100ms for typical assessments) |
| Certificate PDF generation latency | Generate asynchronously; cache generated PDF; return URL immediately |
| ALM export to external systems (network latency) | Run exports as background jobs; poll for status; timeout after 5 minutes per entity |
| Handoff package ZIP generation (multiple large reports) | Stream ZIP creation to blob storage; do not buffer in memory; use `archiver` streaming API |
| Snapshot list query for assessments with many snapshots | Index on `[assessmentId, version]`; paginate with cursor; limit to 100 snapshots per assessment |
| Public verification endpoint (potential abuse) | Rate-limit to 10 requests per minute per IP; cache verification result with 1-hour TTL |
| Area validation status aggregation | Query `AreaValidation` with `GROUP BY status` rather than loading all records |

---

## 11. Testing Strategy

### Unit Tests

| Test | File |
|---|---|
| Sign-off state machine transitions (all valid/invalid) | `__tests__/lib/signoff/state-machine.test.ts` |
| SHA-256 hash computation (canonical JSON determinism) | `__tests__/lib/signoff/hash-integrity.test.ts` |
| Snapshot data gathering (complete capture) | `__tests__/lib/signoff/snapshot-data.test.ts` |
| Auto-transition logic (area validation complete, technical complete) | `__tests__/lib/signoff/auto-transition.test.ts` |
| Certificate PDF content structure | `__tests__/lib/signoff/certificate-pdf.test.ts` |
| ALM export adapter interface compliance | `__tests__/lib/handoff/alm-adapter.test.ts` |
| Jira export mapping (epics, stories, sub-tasks) | `__tests__/lib/handoff/jira-adapter.test.ts` |
| Azure DevOps export mapping | `__tests__/lib/handoff/azdo-adapter.test.ts` |
| SAP Cloud ALM export mapping | `__tests__/lib/handoff/calm-adapter.test.ts` |
| Handoff package content selection | `__tests__/lib/handoff/package-generator.test.ts` |
| Zod schema validation (all sign-off schemas) | `__tests__/lib/validation/signoff.test.ts` |

### Integration Tests

| Test | File |
|---|---|
| Full snapshot lifecycle (create, list, get, verify integrity) | `__tests__/api/assessments/snapshots.test.ts` |
| Complete sign-off workflow (all 5 layers) | `__tests__/api/assessments/signoff-workflow.test.ts` |
| Area validation CRUD via API | `__tests__/api/assessments/area-validation.test.ts` |
| Technical validation via API (IT Lead + DM Lead) | `__tests__/api/assessments/technical-validation.test.ts` |
| Executive sign-off with MFA enforcement | `__tests__/api/assessments/executive-signoff.test.ts` |
| Sign-off rejection and re-initiation | `__tests__/api/assessments/signoff-rejection.test.ts` |
| Certificate generation and download | `__tests__/api/assessments/certificate.test.ts` |
| Public verification endpoint | `__tests__/api/verify/verification.test.ts` |
| Handoff package generation | `__tests__/api/assessments/handoff-package.test.ts` |
| ALM export (mocked external APIs) | `__tests__/api/assessments/alm-export.test.ts` |

### E2E Tests

| Test | File |
|---|---|
| Full sign-off workflow from initiation to certificate download | `e2e/assessment-signoff.spec.ts` |
| Handoff package generation and download | `e2e/handoff-package.spec.ts` |
| Public verification page | `e2e/certificate-verification.spec.ts` |

---

## 12. Migration & Seed Data

### Prisma Migration

```bash
# Migration creates:
# 1. AssessmentSnapshot table with unique constraint on [assessmentId, version]
# 2. SignOffProcess table with unique constraint on assessmentId
# 3. AreaValidation table with unique constraint on [signOffId, functionalArea]
# 4. TechnicalValidation table with unique constraint on signOffId
# 5. CrossFunctionalValidation table with unique constraint on signOffId
# 6. SignatureRecord table
# 7. AlmExportRecord table
# 8. HandoffPackage table
# 9. Indexes on all foreign keys and query patterns
pnpm prisma migrate dev --name add-signoff-handoff-models
```

### Migration from Existing `AssessmentSignOff`

```typescript
/**
 * Migrate existing V1 sign-off records to the new model:
 * 1. For each AssessmentSignOff record, create a basic SignOffProcess
 * 2. Create a snapshot from the current assessment state
 * 3. Convert the sign-off record to a SignatureRecord
 * 4. Mark as FULLY_SIGNED_OFF (grandfather existing sign-offs)
 */
async function migrateV1SignOffs(): Promise<void> {
  const existingSignOffs = await prisma.assessmentSignOff.findMany({
    include: { assessment: true },
  });

  // Group by assessmentId (one SignOffProcess per assessment)
  const grouped = groupBy(existingSignOffs, "assessmentId");

  for (const [assessmentId, signOffs] of Object.entries(grouped)) {
    // Create snapshot from current state
    const snapshot = await createAssessmentSnapshot(
      assessmentId,
      "system",
      "V1 Migration Snapshot",
      "Migrated from V1 sign-off model"
    );

    // Create SignOffProcess
    const process = await prisma.signOffProcess.create({
      data: {
        assessmentId,
        snapshotId: snapshot.id,
        status: "FULLY_SIGNED_OFF",
        initiatedById: "system",
        completedAt: signOffs[0].signedAt,
        verificationToken: generateVerificationToken(),
      },
    });

    // Convert each signOff to a SignatureRecord
    for (const so of signOffs) {
      await prisma.signatureRecord.create({
        data: {
          signOffId: process.id,
          signatureType: so.signatoryRole === "partner_lead" ? "PARTNER" : "EXECUTIVE",
          signerId: "system",
          signerName: so.signatoryName,
          signerEmail: so.signatoryEmail,
          signerRole: so.signatoryRole,
          signerOrganization: "Migrated",
          authorityStatement: "Migrated from V1 sign-off",
          ipAddress: so.ipAddress ?? "unknown",
          userAgent: so.userAgent ?? "unknown",
          authMethod: "magic_link",
          mfaVerified: false,
          documentHash: snapshot.dataHash,
          signedAt: so.signedAt,
          status: "SIGNED",
        },
      });
    }
  }
}
```

### Seed Data

```typescript
// Seed a demo sign-off process for development
const demoSnapshot = await createAssessmentSnapshot(
  demoAssessmentId,
  systemUserId,
  "Demo Sign-Off Snapshot",
  "Seeded for development"
);

const demoSignOff = await prisma.signOffProcess.create({
  data: {
    assessmentId: demoAssessmentId,
    snapshotId: demoSnapshot.id,
    status: "AREA_VALIDATION_IN_PROGRESS",
    initiatedById: systemUserId,
    verificationToken: "demo-verify-token-12345",
  },
});

// Seed area validations (2 approved, 1 pending)
const areas = ["Finance", "Procurement", "Sales", "Manufacturing", "Warehouse Management", "Quality Management"];
for (let i = 0; i < areas.length; i++) {
  await prisma.areaValidation.create({
    data: {
      signOffId: demoSignOff.id,
      functionalArea: areas[i],
      validatedById: i < 2 ? processOwnerUserId : "pending",
      validatorName: i < 2 ? "Demo Process Owner" : "Pending",
      validatorEmail: i < 2 ? "po@demo.com" : "pending@demo.com",
      validatorRole: "process_owner",
      status: i < 2 ? "APPROVED" : "PENDING",
      comments: i < 2 ? "Reviewed and confirmed accurate" : null,
      validatedAt: i < 2 ? new Date() : null,
    },
  });
}
```

---

## 13. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| 1 | Should the sign-off certificate include a QR code linking to the verification URL? | Low -- UX enhancement for physical printouts | Design |
| 2 | Should we support digital signatures (e.g., DocuSign, Adobe Sign) in addition to the in-app signature? | High -- legal validity varies by jurisdiction | Legal + Product |
| 3 | What is the retention policy for snapshots? Should old snapshots be archivable to cold storage? | Medium -- storage cost implications for large assessments | Engineering + Finance |
| 4 | Should ALM export credentials be stored per-organization or per-assessment? | Medium -- affects security model and reusability | Security + Product |
| 5 | Should the handoff package include process flow diagrams (SVGs/PDFs)? They can be large. | Low -- affects package size; may need streaming | Product |
| 6 | Is the 5-layer validation always required, or can layers be skipped for smaller assessments? | Medium -- affects workflow flexibility | Product |
| 7 | Should we support Confluence Cloud only, or also Confluence Data Center (on-prem)? | Medium -- affects authentication approach | Product + Engineering |
| 8 | Should the verification page display the full assessment summary or only a validity confirmation? | Low -- privacy implications if full summary is shown publicly | Legal + Product |
| 9 | Should change requests (Phase 31) invalidate the sign-off certificate? If so, how is the old certificate marked? | Medium -- affects certificate lifecycle | Product + Legal |
| 10 | What is the maximum number of functional areas supported for area validation? | Low -- affects UI layout | Product |

---

## 14. Acceptance Criteria (Given/When/Then)

### AC-30.1: Snapshot Creation

```
Given an assessment in status "pending_validation" or later
  And the current user has role "consultant"
When the user creates a snapshot with label "Final for Sign-Off" and reason "Ready for review"
Then an AssessmentSnapshot record is created with auto-incremented version number
  And snapshotData contains complete assessment state (scope, responses, gaps, resolutions, stakeholders)
  And dataHash contains a SHA-256 hash of the canonically serialized snapshot data
  And the snapshot is immutable (no update/delete endpoint exists)
```

### AC-30.2: Snapshot Integrity Verification

```
Given an existing snapshot with a known dataHash
When the verification function recomputes the hash from snapshotData
Then the computed hash matches the stored dataHash
  And the verification result indicates "valid"
```

### AC-30.3: Sign-Off Process Initiation

```
Given an assessment in status "pending_sign_off"
  And at least one snapshot exists
  And all functional areas have assigned process_owner stakeholders
When the consultant initiates the sign-off process pinned to snapshot version 3
Then a SignOffProcess record is created with status "VALIDATION_NOT_STARTED"
  And AreaValidation records are created with status "PENDING" for each unique functional area
  And TechnicalValidation record is created (fields null, awaiting IT Lead and DM Lead)
  And CrossFunctionalValidation record is created with status "PENDING"
  And a unique verificationToken is generated
```

### AC-30.4: Area Validation Workflow

```
Given a sign-off process in status "AREA_VALIDATION_IN_PROGRESS"
  And the current user is a process_owner assigned to the "Finance" functional area
When the user submits area validation with status "APPROVED" and comments "Confirmed"
Then the AreaValidation for "Finance" is updated to status "APPROVED"
When all assigned areas have status "APPROVED"
Then the sign-off process auto-transitions to "AREA_VALIDATION_COMPLETE"
```

### AC-30.5: Area Validation Rejection

```
Given a sign-off process in status "AREA_VALIDATION_IN_PROGRESS"
  And the current user is a process_owner assigned to the "Sales" functional area
When the user submits area validation with status "REJECTED" and rejectionReason "Step 45 is inaccurate"
Then the AreaValidation for "Sales" is updated to status "REJECTED"
  And the sign-off process transitions to "REJECTED"
  And all stakeholders are notified of the rejection with the reason
```

### AC-30.6: Technical Validation

```
Given a sign-off process in status "TECHNICAL_VALIDATION_IN_PROGRESS"
  And the current user has role "it_lead"
When the IT Lead submits validation with status "APPROVED"
  And the Data Migration Lead has already submitted with status "APPROVED"
Then the sign-off process auto-transitions to "TECHNICAL_VALIDATION_COMPLETE"
```

### AC-30.7: Executive Sign-Off with MFA

```
Given a sign-off process in status "PENDING_EXECUTIVE"
  And the current user has role "executive_sponsor"
  And the user's session has mfaVerified = true
When the user submits an executive signature with authority statement and acknowledgement
Then a SignatureRecord is created with signatureType "EXECUTIVE"
  And the record captures ipAddress, userAgent, authMethod, mfaVerified, documentHash
  And documentHash matches the snapshot's dataHash
  And the sign-off process transitions to "EXECUTIVE_SIGNED"
```

### AC-30.8: MFA Required for Executive Sign-Off

```
Given a sign-off process in status "PENDING_EXECUTIVE"
  And the current user has role "executive_sponsor"
  And the user's session has mfaVerified = false
When the user attempts to submit an executive signature
Then the API returns 403 Forbidden with error code "MFA_REQUIRED"
  And the sign-off status remains "PENDING_EXECUTIVE"
```

### AC-30.9: Partner Countersign Completes Sign-Off

```
Given a sign-off process in status "PENDING_PARTNER"
  And the executive has already signed
When the partner_lead submits a countersign with authority statement and acknowledgement
Then a SignatureRecord is created with signatureType "PARTNER"
  And the sign-off process transitions to "FULLY_SIGNED_OFF"
  And a sign-off certificate PDF is automatically generated
  And the assessment status (Phase 18) transitions to "signed_off"
```

### AC-30.10: Certificate Generation

```
Given a sign-off process in status "FULLY_SIGNED_OFF"
When the certificate PDF is generated
Then the PDF contains assessment summary, classification breakdown, all validation records,
     executive signature details, partner signature details, SHA-256 data hash, and verification URL
  And certificateHash is computed and stored
  And the certificate is downloadable by any assessment stakeholder
```

### AC-30.11: Public Verification

```
Given a valid verificationToken for a fully signed-off assessment
When a visitor navigates to /verify/[token] (no authentication required)
Then the page displays:
  - Assessment company name and sign-off date
  - "Certificate is VALID" with green indicator
  - Executive signer name and organization
  - Partner signer name and organization
  - SHA-256 data integrity hash
  - Snapshot version and creation date
```

### AC-30.12: Handoff Package Generation

```
Given a signed-off assessment
  And the user selects artifacts: executive_summary, scope_catalog, gap_register, sign_off_certificate
When the user generates a handoff package
Then a ZIP file is created containing the selected artifacts
  And the HandoffPackage record is created with the artifact list and file size
  And the ZIP is downloadable from the handoff packages list
```

### AC-30.13: ALM Export to Jira

```
Given a signed-off assessment with 6 functional areas and 15 gap resolutions
  And valid Jira Cloud credentials and project key
When the user exports to Jira
Then an Epic is created in Jira for each functional area
  And a Story is created under the appropriate Epic for each gap resolution
  And the AlmExportRecord is created with status "COMPLETED" and entity mapping
  And the result summary shows 6 epics created and 15 stories created
```

---

## 15. Size Estimate

**Size: XL (Extra Large)**

| Component | Effort |
|---|---|
| Prisma schema migration (8 new tables) | 1.5 days |
| Snapshot creation and integrity verification | 2 days |
| Sign-off state machine and auto-transition logic | 3 days |
| Validation layer APIs (area, technical, cross-functional) | 3 days |
| Executive sign-off + MFA enforcement | 1.5 days |
| Partner countersign | 1 day |
| Certificate PDF generation | 3 days |
| Public verification endpoint and page | 1 day |
| ALM export adapter interface + Jira adapter | 3 days |
| ALM export adapter: SAP Cloud ALM | 2 days |
| ALM export adapter: Azure DevOps | 2 days |
| ALM export adapter: Confluence | 1.5 days |
| Handoff package generation (ZIP) | 2 days |
| UI pages (10 new pages) | 5 days |
| UI components (16 new components) | 4 days |
| V1 sign-off migration script | 1 day |
| Unit tests | 3 days |
| Integration tests | 3.5 days |
| E2E tests | 2 days |
| **Total** | **~44 days** |

---

## 16. Phase Completion Checklist

- [ ] Prisma schema updated with `AssessmentSnapshot`, `SignOffProcess`, `AreaValidation`, `TechnicalValidation`, `CrossFunctionalValidation`, `SignatureRecord`, `AlmExportRecord`, `HandoffPackage`
- [ ] Migration applied successfully in development and staging
- [ ] Existing V1 `AssessmentSignOff` records migrated to new model
- [ ] Snapshot creation captures complete assessment state as immutable JSON
- [ ] SHA-256 hash computed deterministically from canonicalized JSON
- [ ] Snapshot integrity verification returns valid/invalid result
- [ ] Sign-off state machine enforces all valid transitions and blocks invalid ones
- [ ] Area validation requires all functional areas to be approved before advancing
- [ ] Technical validation requires both IT Lead and DM Lead approval
- [ ] Cross-functional validation captures conflict count and resolution status
- [ ] Executive sign-off enforces MFA requirement
- [ ] Executive sign-off captures IP address, user agent, auth method, document hash
- [ ] Partner countersign completes the sign-off process and triggers certificate generation
- [ ] Decline functionality records reason and transitions to `REJECTED`
- [ ] Rejection allows return to any previous validation layer
- [ ] Auto-transition logic advances sign-off when layer criteria are met
- [ ] Certificate PDF contains all required sections (summary, validations, signatures, hash, verification URL)
- [ ] Certificate hash computed and stored on `SignOffProcess`
- [ ] Public verification endpoint displays certificate validity without authentication
- [ ] Verification page shows signer names, organizations, sign-off date, hash
- [ ] Jira export adapter creates Epics per area and Stories per gap
- [ ] SAP Cloud ALM export adapter creates Projects, Requirements, Tasks
- [ ] Azure DevOps export adapter creates Work Items with Area Paths
- [ ] Confluence export adapter creates structured page hierarchy
- [ ] ALM export records track status, entity mapping, and errors
- [ ] Handoff package generator creates ZIP with selected artifacts
- [ ] Handoff package supports FULL, TECHNICAL, and EXECUTIVE package types
- [ ] All API routes have Zod validation on request bodies
- [ ] Sign-off dashboard shows all 5 validation layers with progress
- [ ] Notification triggers fire for all sign-off events
- [ ] Assessment transitions to `signed_off` (Phase 18) upon `FULLY_SIGNED_OFF`
- [ ] Assessment transitions to `handed_off` (Phase 18) upon ALM export completion
- [ ] Unit tests pass (state machine, hash, snapshot, auto-transition, adapters)
- [ ] Integration tests pass (all API routes, workflow, certificate, verification)
- [ ] E2E tests pass (full sign-off workflow, handoff, verification)
- [ ] No TypeScript strict-mode errors introduced
- [ ] PR reviewed and approved
