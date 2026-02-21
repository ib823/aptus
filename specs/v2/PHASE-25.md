# Phase 25: Report Generation V2

## 1. Overview

Enhance the existing report generation system to include reports for the three new assessment registers (Integration, Data Migration, OCM), add an Assessment Readiness Scorecard, upgrade the Executive Summary with integration/DM/OCM sections, enable report branding with partner logo and colors, and implement server-side ZIP packaging for the complete assessment download.

### Current State
The existing report system (`src/components/report/ReportClient.tsx`) generates 9 reports:
1. Executive Summary (PDF)
2. Scope Catalog (XLSX)
3. Process Step Detail (XLSX)
4. Gap Register (XLSX)
5. Configuration Workbook (XLSX)
6. Effort Estimate (PDF)
7. Decision Audit Trail (XLSX)
8. Process Flow Atlas (PDF)
9. Remaining Items Register (XLSX)

Existing infrastructure: `xlsx-generator.ts`, `pdf-generator.ts`, `flow-diagram.ts`, `report-data.ts`.

### New in V2
1. **Integration Register XLSX** -- All integration points with summary sheet, grouped by type and status
2. **Data Migration Register XLSX** -- All DM objects with volume/effort summary by source system
3. **OCM Impact Report XLSX** -- All OCM impacts with training needs summary by impact severity
4. **Enhanced Executive Summary PDF** -- Now includes integration landscape, data migration scope, OCM impact summary, and timeline visualization
5. **Assessment Readiness Scorecard PDF** -- New report showing completion percentages per phase, risk areas, recommendations, and go/no-go assessment
6. **Report Branding** -- Partner logo on PDF headers, partner primary/secondary colors in headers and accents, custom footer text
7. **Server-Side ZIP Packaging** -- Complete assessment package generated as a single ZIP on the server, streamed to client

## 2. Dependencies

### Upstream (must exist before this phase)
- **Phase 1-13 (Core Assessment + Reports)**: Existing report infrastructure, all current report types
- **Phase 14 (Integration Register)**: `IntegrationPoint` model for integration register report
- **Phase 15 (Data Migration Register)**: `DataMigrationObject` model for DM register report
- **Phase 16 (OCM Impact Register)**: `OcmImpact` model for OCM impact report
- **Phase 17 (Role System)**: Organization model with partner branding fields

### Downstream (phases that depend on this)
- None (terminal feature phase)

### External Dependencies
- `archiver` (npm) -- for server-side ZIP generation (already commonly used with Node.js streams)
- Existing: `exceljs` (for XLSX), `pdfkit` or `@react-pdf/renderer` (for PDF), whichever is currently used

## 3. Data Model Changes

### New Models

```prisma
model ReportGeneration {
  id           String    @id @default(cuid())
  assessmentId String
  reportType   String    // See reportTypeSchema enum
  status       String    @default("generating") // "generating" | "completed" | "failed"
  fileUrl      String?   // Blob storage URL or local path
  fileSize     Int?      // File size in bytes
  fileName     String?   // Original filename with extension
  generatedBy  String
  errorMessage String?   @db.Text
  generatedAt  DateTime  @default(now())
  expiresAt    DateTime? // Auto-delete after this date (30 days default)

  assessment Assessment @relation(fields: [assessmentId], references: [id])
  @@index([assessmentId])
  @@index([assessmentId, reportType])
  @@index([expiresAt])
}

model ReportBranding {
  id              String  @id @default(cuid())
  organizationId  String  @unique
  logoUrl         String? // URL to partner logo (PNG/SVG, max 500KB)
  primaryColor    String  @default("#1a1a2e") // Hex color for PDF headers
  secondaryColor  String  @default("#16213e") // Hex color for accents
  footerText      String? @db.Text // Custom footer text for PDFs
  companyName     String? // Override organization name on reports
  isActive        Boolean @default(true)

  organization Organization @relation(fields: [organizationId], references: [id])
}
```

### Schema Changes to Existing Models

Add `reportGenerations` relation to `Assessment`:
```prisma
// Add to Assessment model:
reportGenerations ReportGeneration[]
```

Add `reportBranding` relation to `Organization`:
```prisma
// Add to Organization model:
reportBranding ReportBranding?
```

### Zod Schemas

```typescript
import { z } from "zod";

export const reportTypeSchema = z.enum([
  // Existing reports
  "executive_summary",
  "scope_catalog",
  "step_detail",
  "gap_register",
  "config_workbook",
  "effort_estimate",
  "audit_trail",
  "flow_atlas",
  "remaining_register",
  // New V2 reports
  "integration_register",
  "dm_register",
  "ocm_report",
  "readiness_scorecard",
  // Package
  "complete_package",
]);

export const reportStatusSchema = z.enum(["generating", "completed", "failed"]);

export const reportBrandingSchema = z.object({
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").default("#1a1a2e"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").default("#16213e"),
  footerText: z.string().max(500).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
});

export const generateReportSchema = z.object({
  reportType: reportTypeSchema,
  includeComments: z.boolean().default(false),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).optional(),
});

// Integration Register XLSX structure
export const integrationRegisterRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  direction: z.string(),
  sourceSystem: z.string(),
  targetSystem: z.string(),
  frequency: z.string(),
  protocol: z.string().optional(),
  dataVolume: z.string().optional(),
  status: z.string(),
  priority: z.string(),
  owner: z.string().optional(),
  scopeItemId: z.string(),
  scopeItemName: z.string(),
  notes: z.string().optional(),
});

// DM Register XLSX structure
export const dmRegisterRowSchema = z.object({
  id: z.string(),
  objectName: z.string(),
  objectType: z.string(),
  sourceSystem: z.string(),
  recordCount: z.number().nullable(),
  volumeCategory: z.string(),
  complexity: z.string(),
  migrationApproach: z.string(),
  estimatedEffortDays: z.number().nullable(),
  status: z.string(),
  owner: z.string().optional(),
  scopeItemId: z.string(),
  scopeItemName: z.string(),
  notes: z.string().optional(),
});

// OCM Report XLSX structure
export const ocmReportRowSchema = z.object({
  id: z.string(),
  impactArea: z.string(),
  impactDescription: z.string(),
  severity: z.string(),
  affectedRoles: z.array(z.string()),
  affectedUserCount: z.number().nullable(),
  changeType: z.string(),
  trainingRequired: z.boolean(),
  trainingDays: z.number().nullable(),
  communicationNeeded: z.boolean(),
  status: z.string(),
  scopeItemId: z.string(),
  scopeItemName: z.string(),
  notes: z.string().optional(),
});

// Readiness Scorecard structure
export const readinessScoreSchema = z.object({
  category: z.string(),
  score: z.number().min(0).max(100),
  status: z.enum(["green", "amber", "red"]),
  findings: z.array(z.string()),
  recommendations: z.array(z.string()),
});

export const readinessScorecardSchema = z.object({
  overallScore: z.number().min(0).max(100),
  overallStatus: z.enum(["green", "amber", "red"]),
  categories: z.array(readinessScoreSchema),
  goNoGo: z.enum(["go", "conditional_go", "no_go"]),
  executiveSummary: z.string(),
});
```

### Migration

```sql
-- CreateTable: ReportGeneration
CREATE TABLE "ReportGeneration" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "fileName" TEXT,
    "generatedBy" TEXT NOT NULL,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "ReportGeneration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReportGeneration_assessmentId_idx"
    ON "ReportGeneration"("assessmentId");
CREATE INDEX "ReportGeneration_assessmentId_reportType_idx"
    ON "ReportGeneration"("assessmentId", "reportType");
CREATE INDEX "ReportGeneration_expiresAt_idx"
    ON "ReportGeneration"("expiresAt");

ALTER TABLE "ReportGeneration"
  ADD CONSTRAINT "ReportGeneration_assessmentId_fkey"
  FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE;

-- CreateTable: ReportBranding
CREATE TABLE "ReportBranding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "secondaryColor" TEXT NOT NULL DEFAULT '#16213e',
    "footerText" TEXT,
    "companyName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ReportBranding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportBranding_organizationId_key"
    ON "ReportBranding"("organizationId");

ALTER TABLE "ReportBranding"
  ADD CONSTRAINT "ReportBranding_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
```

## 4. API Routes

### `GET /api/assessments/[id]/report/integration-register`
Generate and download the Integration Register XLSX.

**Auth**: Requires authenticated session. User must have access to the assessment. Minimum role: `consultant`, `it_lead`, `solution_architect`, `partner_lead`, `platform_admin`, `project_manager`.

**Response**: `200` with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, streamed XLSX file.

**XLSX Structure**:
- **Sheet 1: Summary** -- Integration count by type (file, API, middleware, manual), by direction (inbound/outbound/bidirectional), by status (identified/analyzed/approved), by priority (critical/high/medium/low).
- **Sheet 2: All Integration Points** -- Full detail rows per `integrationRegisterRowSchema`.
- **Sheet 3: By Source System** -- Grouped by source system with subtotals.

### `GET /api/assessments/[id]/report/dm-register`
Generate and download the Data Migration Register XLSX.

**Auth**: Same as integration register, plus `data_migration_lead`.

**XLSX Structure**:
- **Sheet 1: Summary** -- Object count by type, total record volume, effort summary, by source system.
- **Sheet 2: All Migration Objects** -- Full detail rows per `dmRegisterRowSchema`.
- **Sheet 3: By Source System** -- Grouped by source system with volume and effort subtotals.
- **Sheet 4: Effort Breakdown** -- Effort by complexity category with histogram data.

### `GET /api/assessments/[id]/report/ocm-report`
Generate and download the OCM Impact Report XLSX.

**Auth**: Requires assessment access. Minimum role: `consultant`, `project_manager`, `partner_lead`, `platform_admin`, `executive_sponsor`.

**XLSX Structure**:
- **Sheet 1: Summary** -- Impact count by severity (high/medium/low), by change type, training days total, affected user count total.
- **Sheet 2: All OCM Impacts** -- Full detail rows per `ocmReportRowSchema`.
- **Sheet 3: Training Plan** -- Filtered to items where `trainingRequired: true`, with training days and affected roles.
- **Sheet 4: Communication Plan** -- Filtered to items where `communicationNeeded: true`.

### `GET /api/assessments/[id]/report/readiness-scorecard`
Generate and download the Assessment Readiness Scorecard PDF.

**Auth**: Requires assessment access. Minimum role: `consultant`, `project_manager`, `partner_lead`, `platform_admin`, `executive_sponsor`.

**PDF Structure**:
- **Page 1: Cover** -- Assessment name, company logo (if branded), date, "Assessment Readiness Scorecard" title.
- **Page 2: Overall Score** -- Large circular gauge with overall readiness percentage, go/conditional/no-go recommendation, executive summary paragraph.
- **Page 3-4: Category Scores** -- Radar chart or bar chart showing scores across categories:
  - Scope Completeness (% scope items decided)
  - Step Review Progress (% steps reviewed)
  - Gap Resolution (% gaps resolved)
  - Integration Readiness (% integrations analyzed)
  - Data Migration Readiness (% DM objects with approach defined)
  - OCM Readiness (% impacts with mitigation plan)
  - Stakeholder Engagement (% stakeholders who have been active in last 7 days)
  - Sign-Off Progress (% sign-offs completed)
- **Page 5: Risk Summary** -- Top 10 risk items across all categories with recommendations.
- **Page 6: Recommendations** -- Prioritized list of actions to improve readiness.

### `GET /api/assessments/[id]/report/complete-package`
Generate all reports and package them in a single ZIP download.

**Auth**: Requires assessment access. Minimum role: `consultant`, `partner_lead`, `platform_admin`, `project_manager`.

**Response**: `200` with `Content-Type: application/zip`, streamed ZIP file.

**ZIP Contents**:
```
[CompanyName]_Assessment_Package/
  01_Executive_Summary.pdf
  02_Scope_Catalog.xlsx
  03_Step_Detail.xlsx
  04_Gap_Register.xlsx
  05_Configuration_Workbook.xlsx
  06_Effort_Estimate.pdf
  07_Integration_Register.xlsx
  08_DM_Register.xlsx
  09_OCM_Impact_Report.xlsx
  10_Readiness_Scorecard.pdf
  11_Flow_Atlas.pdf
  12_Remaining_Items.xlsx
  13_Audit_Trail.xlsx
  README.txt
```

### `PUT /api/assessments/[id]/report/branding`
Set report branding configuration for the assessment's organization.

**Auth**: `partner_lead`, `platform_admin`, `client_admin`.

**Request Body**: `reportBrandingSchema`

**Response** `200`:
```typescript
{
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    footerText: string | null;
    companyName: string | null;
    isActive: boolean;
  };
}
```

### `POST /api/assessments/[id]/report/branding/logo`
Upload a partner logo for report branding.

**Auth**: `partner_lead`, `platform_admin`, `client_admin`.

**Request**: `multipart/form-data` with `logo` field (PNG, SVG, or JPEG, max 500KB).

**Response** `200`:
```typescript
{
  logoUrl: string;
}
```

### `GET /api/assessments/[id]/report/history`
List previously generated reports for the assessment.

**Auth**: Requires assessment access.

**Response** `200`:
```typescript
{
  reports: Array<{
    id: string;
    reportType: string;
    status: "generating" | "completed" | "failed";
    fileName: string | null;
    fileSize: number | null;
    generatedBy: string;
    generatedAt: string;
    expiresAt: string | null;
    downloadUrl: string | null; // Signed URL if completed
  }>;
}
```

## 5. UI Components

### Updated ReportClient
Location: `src/components/report/ReportClient.tsx` (existing, modified)

Extend the existing REPORTS array with the 4 new reports. Add a "Branding" section below the download list. The "Complete Blueprint Package" section now uses server-side ZIP generation instead of opening multiple tabs.

Changes to existing component:
- Add Integration Register, DM Register, OCM Report, Readiness Scorecard to the reports list
- Replace multi-tab download with single ZIP download for "Download All"
- Add report generation status indicators (spinner while generating, checkmark when done)
- Add branding section

### ReportBrandingEditor
Location: `src/components/report/ReportBrandingEditor.tsx`

A card-based form for configuring report branding: logo upload with preview, color pickers for primary/secondary colors, footer text input, company name override.

```typescript
interface ReportBrandingEditorProps {
  assessmentId: string;
  currentBranding: ReportBranding | null;
  onSave: (branding: ReportBrandingInput) => void;
}
```

Uses: `Card`, `Input`, `Button`, `Label` (shadcn/ui), native `<input type="color">` for color picker (or a simple hex input), file upload input for logo.

### ReportGenerationStatus
Location: `src/components/report/ReportGenerationStatus.tsx`

Inline status indicator for each report in the download list. Shows a spinner during generation, checkmark on success, error icon on failure. For the complete package, shows a progress bar with the count of reports being generated.

```typescript
interface ReportGenerationStatusProps {
  status: "idle" | "generating" | "completed" | "failed";
  fileName?: string;
  fileSize?: number;
  errorMessage?: string;
}
```

Uses: `Badge`, `Button` (retry), Lucide icons (`Loader2`, `CheckCircle`, `XCircle`), `Progress` (shadcn/ui for ZIP generation).

### ReportHistoryTable
Location: `src/components/report/ReportHistoryTable.tsx`

Table showing previously generated reports with download links. Allows re-downloading and viewing generation history.

```typescript
interface ReportHistoryTableProps {
  reports: ReportHistoryItem[];
  onDownload: (reportId: string) => void;
}
```

Uses: `Table` (shadcn/ui), `Badge` (status), `Button` (download), relative time formatting.

## 6. Business Logic

### Enhanced Executive Summary

The existing executive summary PDF is extended with new sections:

```typescript
interface EnhancedExecutiveSummary {
  // Existing sections
  companyOverview: { name: string; industry: string; country: string; size: string };
  scopeSummary: { total: number; selected: number; excluded: number };
  fitDistribution: { fit: number; configure: number; gap: number; na: number; fitPercent: number };
  gapSummary: { total: number; resolved: number; totalEffortDays: number; byType: Record<string, number> };

  // New V2 sections
  integrationLandscape: {
    totalIntegrations: number;
    byType: Record<string, number>; // { "API": 12, "File": 8, "Middleware": 5, "Manual": 3 }
    criticalIntegrations: Array<{ name: string; type: string; sourceSystem: string }>;
    topSourceSystems: Array<{ system: string; integrationCount: number }>;
  };
  dataMigrationScope: {
    totalObjects: number;
    totalRecordVolume: string; // "~2.5M records"
    byComplexity: Record<string, number>; // { "High": 5, "Medium": 12, "Low": 8 }
    estimatedMigrationDays: number;
    topSourceSystems: Array<{ system: string; objectCount: number }>;
  };
  ocmImpactSummary: {
    totalImpacts: number;
    bySeverity: Record<string, number>; // { "High": 8, "Medium": 15, "Low": 10 }
    totalTrainingDays: number;
    affectedUserCount: number;
    topImpactAreas: Array<{ area: string; impactCount: number }>;
  };
  timelineVisualization: {
    estimatedStartDate: string | null;
    estimatedEndDate: string | null;
    phases: Array<{ name: string; durationDays: number; dependencies: string[] }>;
  };
}
```

### Readiness Scorecard Calculation

```typescript
function calculateReadinessScore(assessment: AssessmentWithRelations): ReadinessScorecard {
  const categories: ReadinessScore[] = [
    {
      category: "Scope Completeness",
      score: calculateScopeCompleteness(assessment),
      // 100% if all scope items have selected/excluded decision, 0 if all "maybe"
    },
    {
      category: "Step Review Progress",
      score: calculateStepReviewProgress(assessment),
      // (reviewed steps / total steps in selected scope items) * 100
    },
    {
      category: "Gap Resolution",
      score: calculateGapResolution(assessment),
      // (resolved gaps / total gaps) * 100
    },
    {
      category: "Integration Readiness",
      score: calculateIntegrationReadiness(assessment),
      // (integrations with status "approved" or "analyzed") / total * 100
    },
    {
      category: "Data Migration Readiness",
      score: calculateDmReadiness(assessment),
      // (DM objects with approach defined and effort estimated) / total * 100
    },
    {
      category: "OCM Readiness",
      score: calculateOcmReadiness(assessment),
      // (OCM impacts with mitigation plan) / total * 100
    },
    {
      category: "Stakeholder Engagement",
      score: calculateStakeholderEngagement(assessment),
      // (stakeholders active in last 7 days) / total * 100
    },
    {
      category: "Sign-Off Progress",
      score: calculateSignOffProgress(assessment),
      // (completed sign-offs / required sign-offs) * 100
    },
  ];

  // Status thresholds
  for (const cat of categories) {
    cat.status = cat.score >= 80 ? "green" : cat.score >= 50 ? "amber" : "red";
    cat.findings = generateFindings(cat.category, cat.score, assessment);
    cat.recommendations = generateRecommendations(cat.category, cat.score, assessment);
  }

  const overallScore = Math.round(
    categories.reduce((sum, c) => sum + c.score, 0) / categories.length,
  );

  const redCount = categories.filter((c) => c.status === "red").length;
  const goNoGo = redCount === 0
    ? "go"
    : redCount <= 2
      ? "conditional_go"
      : "no_go";

  return {
    overallScore,
    overallStatus: overallScore >= 80 ? "green" : overallScore >= 50 ? "amber" : "red",
    categories,
    goNoGo,
    executiveSummary: generateExecutiveSummary(overallScore, goNoGo, categories),
  };
}
```

### Report Branding Application

Branding is applied to all PDF reports at generation time:

```typescript
function applyBranding(doc: PDFDocument, branding: ReportBranding | null): void {
  const brand = branding ?? {
    primaryColor: "#1a1a2e",
    secondaryColor: "#16213e",
    footerText: "Generated by Aptus - SAP S/4HANA Cloud Assessment Platform",
    companyName: null,
    logoUrl: null,
  };

  // Header: partner logo (left) + "Aptus" wordmark (right)
  if (brand.logoUrl) {
    // Fetch and embed logo image in top-left
    // Max dimensions: 150px wide x 50px tall
  }

  // Header bar: uses primaryColor
  // Section headers: uses secondaryColor
  // Footer: brand.footerText on every page
  // Company name override: used in place of organization.name where applicable
}
```

### ZIP Package Generation

```typescript
import archiver from "archiver";

async function generateCompletePackage(
  assessmentId: string,
  userId: string,
  branding: ReportBranding | null,
): Promise<ReadableStream> {
  const archive = archiver("zip", { zlib: { level: 6 } });
  const companyName = /* from assessment */;
  const prefix = `${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_Assessment_Package`;

  // Generate each report and add to archive
  const reportGenerators = [
    { name: "01_Executive_Summary.pdf", fn: generateExecutiveSummaryPdf },
    { name: "02_Scope_Catalog.xlsx", fn: generateScopeCatalogXlsx },
    { name: "03_Step_Detail.xlsx", fn: generateStepDetailXlsx },
    { name: "04_Gap_Register.xlsx", fn: generateGapRegisterXlsx },
    { name: "05_Configuration_Workbook.xlsx", fn: generateConfigWorkbookXlsx },
    { name: "06_Effort_Estimate.pdf", fn: generateEffortEstimatePdf },
    { name: "07_Integration_Register.xlsx", fn: generateIntegrationRegisterXlsx },
    { name: "08_DM_Register.xlsx", fn: generateDmRegisterXlsx },
    { name: "09_OCM_Impact_Report.xlsx", fn: generateOcmReportXlsx },
    { name: "10_Readiness_Scorecard.pdf", fn: generateReadinessScorecardPdf },
    { name: "11_Flow_Atlas.pdf", fn: generateFlowAtlasPdf },
    { name: "12_Remaining_Items.xlsx", fn: generateRemainingRegisterXlsx },
    { name: "13_Audit_Trail.xlsx", fn: generateAuditTrailXlsx },
  ];

  for (const { name, fn } of reportGenerators) {
    const buffer = await fn(assessmentId, branding);
    archive.append(buffer, { name: `${prefix}/${name}` });
  }

  // Add README
  archive.append(generateReadmeText(companyName), { name: `${prefix}/README.txt` });

  archive.finalize();
  return archive;
}
```

### Report Expiry Cleanup

A scheduled task (cron job or Vercel cron) runs daily to clean up expired report files:

```typescript
async function cleanupExpiredReports(): Promise<void> {
  const expired = await prisma.reportGeneration.findMany({
    where: {
      expiresAt: { lt: new Date() },
      status: "completed",
    },
  });

  for (const report of expired) {
    if (report.fileUrl) {
      // Delete from blob storage
    }
    await prisma.reportGeneration.delete({ where: { id: report.id } });
  }
}
```

## 7. Permissions & Access Control

| Action | Roles Allowed |
|--------|---------------|
| Download existing reports (V1) | All roles with assessment access (per existing behavior) |
| Download Integration Register | `consultant`, `it_lead`, `solution_architect`, `partner_lead`, `platform_admin`, `project_manager` |
| Download DM Register | `consultant`, `it_lead`, `data_migration_lead`, `solution_architect`, `partner_lead`, `platform_admin`, `project_manager` |
| Download OCM Report | `consultant`, `project_manager`, `partner_lead`, `platform_admin`, `executive_sponsor` |
| Download Readiness Scorecard | `consultant`, `project_manager`, `partner_lead`, `platform_admin`, `executive_sponsor` |
| Download Complete Package | `consultant`, `partner_lead`, `platform_admin`, `project_manager` |
| Configure report branding | `partner_lead`, `platform_admin`, `client_admin` |
| Upload partner logo | `partner_lead`, `platform_admin`, `client_admin` |
| View report history | All roles with assessment access |
| Delete generated reports | `platform_admin` |

### Report Access Conditions
- Reports (except Audit Trail) require assessment status to be `completed`, `reviewed`, or `signed_off`.
- Audit Trail is available at any assessment status.
- Readiness Scorecard is available at any status (useful during the assessment to check progress).

## 8. Notification Triggers

| Event | Recipients | Channel |
|-------|-----------|---------|
| Complete package generation finished | User who requested it | In-app notification |
| Complete package generation failed | User who requested it | In-app notification + email |
| Report branding updated | All consultants in organization | In-app notification |
| Report about to expire (24h before) | User who generated it | In-app notification |

## 9. Edge Cases & Error Handling

| Edge Case | Handling |
|-----------|----------|
| Assessment has no integration points | Integration Register XLSX generated with summary showing 0 items; detail sheet has header row only with "No integration points identified" message |
| Assessment has no DM objects | Same pattern as integration register: summary with zeros, detail sheet with header only |
| Assessment has no OCM impacts | Same pattern: summary with zeros, detail sheet with header only |
| Logo upload exceeds 500KB | Reject with 400: "Logo must be under 500KB" |
| Logo is invalid format | Reject with 400: "Logo must be PNG, SVG, or JPEG" |
| Report generation fails mid-way | `ReportGeneration.status` set to `failed`, `errorMessage` populated, user shown retry option |
| ZIP generation: one report fails | Continue generating other reports; failed report replaced with `[ReportName]_FAILED.txt` containing error message |
| Very large assessment (1000+ steps) | XLSX generation uses streaming writes to avoid memory issues; ZIP streams each report as it is generated |
| Concurrent report generation requests | Allow concurrent requests; each creates its own `ReportGeneration` record |
| Report downloaded after expiry | Return 410 Gone with message "This report has expired. Please generate a new one." |
| Organization has no branding configured | Use default branding (Aptus logo, default colors, default footer) |
| Custom footer text contains HTML | Strip HTML tags before embedding in PDF footer |
| Report requested for draft assessment | Return 400: "Reports are available when the assessment is completed" (except Audit Trail and Readiness Scorecard) |

## 10. Performance Considerations

- **Streaming XLSX Generation**: Use ExcelJS streaming write API for large datasets. Integration/DM/OCM registers are typically <500 rows, but step detail can be 1000+ rows.
- **ZIP Streaming**: Use `archiver` with pipe-to-response streaming so the ZIP is not buffered entirely in memory. Each report is generated, added to the archive, and its buffer released.
- **Parallel Report Generation**: For the complete package, reports that don't share data dependencies can be generated in parallel using `Promise.all` (e.g., XLSX reports can run concurrently with PDF reports).
- **Report Caching**: Store generated reports in blob storage with 30-day TTL. If the same report type is requested again and no assessment data has changed since last generation, serve the cached version.
- **Data Query Optimization**: Report data queries use the same optimized patterns as existing reports (single query per report type with joins, not N+1).
- **Logo Caching**: Partner logos are fetched once during report generation and reused across all PDFs in the package. Logo fetched from blob storage URL, not from the database on every page.
- **Complete Package Size**: Typical complete package is 2-5MB. Maximum expected: 20MB for very large assessments with many flow diagrams.

## 11. Testing Strategy

### Unit Tests
- Readiness score calculation: verify correct scores for fully complete, partially complete, and empty assessments
- Branding color validation: valid hex colors accepted, invalid rejected
- Report type schema: all 14 report types + complete_package validated
- ZIP file structure: correct file naming and directory structure
- Executive summary enrichment: verify integration/DM/OCM sections populated correctly

### Integration Tests
- `GET /api/assessments/[id]/report/integration-register`: generates valid XLSX with correct sheet structure and data
- `GET /api/assessments/[id]/report/dm-register`: generates valid XLSX with summary and detail sheets
- `GET /api/assessments/[id]/report/ocm-report`: generates valid XLSX with training plan sheet
- `GET /api/assessments/[id]/report/readiness-scorecard`: generates valid PDF with correct scores
- `GET /api/assessments/[id]/report/complete-package`: generates ZIP containing all 13 reports + README
- `PUT /api/assessments/[id]/report/branding`: saves branding config, logo URL persists
- Permission checks: process owner cannot download integration register, executive can download OCM report
- Draft assessment: reports return 400 (except Audit Trail and Readiness Scorecard)

### E2E Tests
- Consultant generates complete package, downloads ZIP, verifies it contains all files
- Partner lead uploads logo, sets colors, generates executive summary PDF, verifies branding appears
- IT Lead downloads integration register XLSX, opens it, verifies data matches UI
- Executive downloads readiness scorecard, verifies go/no-go recommendation

### Performance Tests
- Generate complete package for assessment with 500 steps, 50 gaps, 20 integrations: target <30s
- XLSX generation for 1000-row step detail: target <5s
- ZIP streaming: first bytes should arrive within 2s of request

## 12. Migration & Seed Data

### Migration Steps
1. Run `npx prisma migrate dev --name add_report_v2` to create `ReportGeneration` and `ReportBranding` tables, and add relation fields to `Assessment` and `Organization`.
2. No data migration for existing reports (they are generated on-demand, not stored).

### Seed Data
```typescript
// Sample branding for demo organization
const sampleBranding = {
  primaryColor: "#1a1a2e",
  secondaryColor: "#e94560",
  footerText: "Confidential - Prepared by Aptus Consulting",
  companyName: "Aptus Consulting Pte. Ltd.",
  logoUrl: null, // No logo in seed data
};
```

### Report Expiry Cron
Add a Vercel cron job or scheduled function:
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-reports",
      "schedule": "0 3 * * *"
    }
  ]
}
```

## 13. Open Questions

1. **Blob Storage**: Where should generated report files be stored? Options: (a) Vercel Blob, (b) PostgreSQL `bytea` column, (c) S3-compatible storage. Current setup uses `bytea` for setup guides and flow PDFs. For larger report packages, Vercel Blob is preferred. Recommended: Vercel Blob for generated reports.
2. **Report Regeneration Policy**: Should we auto-regenerate reports when assessment data changes, or always generate on demand? Auto-regeneration adds complexity but ensures reports are always fresh. Recommended: generate on demand, show "Data changed since last generation" warning if applicable.
3. **Custom Report Templates**: Should partner leads be able to customize the report layout beyond branding (e.g., custom sections, custom cover page text)? Recommended: defer to V3. For V2, branding covers logo + colors + footer.
4. **Timeline Visualization in PDF**: The executive summary timeline requires rendering a Gantt-like chart in a PDF. Options: (a) server-side SVG rendering, (b) simple table-based timeline, (c) ASCII-art timeline. Recommended: simple horizontal bar chart rendered as colored rectangles.
5. **Report Localization**: Should reports support languages other than English? Report data (scope item names, gap descriptions) is in whatever language the user entered. But headers, labels, and boilerplate text could be localized. Recommended: English only for V2, add i18n framework for V3.
6. **Async Generation vs. Sync**: Should large reports (especially complete package) be generated asynchronously with webhook/polling, or synchronously with streaming response? Recommended: synchronous streaming for individual reports, asynchronous with polling for complete package (could take 30+ seconds).

## 14. Acceptance Criteria (Given/When/Then)

### AC-25.1: Integration Register XLSX
```
Given an assessment with 15 integration points
  And 5 are type "API", 4 are "File", 3 are "Middleware", 3 are "Manual"
When the IT Lead downloads the Integration Register
Then an XLSX file is downloaded with filename "[CompanyName]_Integration_Register.xlsx"
  And Sheet 1 (Summary) shows:
    - Total: 15
    - By Type: API=5, File=4, Middleware=3, Manual=3
    - By Direction breakdown
    - By Status breakdown
  And Sheet 2 (Detail) has 15 data rows with all columns from integrationRegisterRowSchema
  And Sheet 3 (By Source System) groups integrations by sourceSystem
```

### AC-25.2: DM Register XLSX
```
Given an assessment with 25 data migration objects
  And total record count across all objects is 2,500,000
  And estimated total effort is 45 days
When the Data Migration Lead downloads the DM Register
Then an XLSX file is downloaded
  And Sheet 1 (Summary) shows total objects: 25, total volume: ~2.5M, total effort: 45 days
  And Sheet 2 (Detail) has 25 data rows
  And Sheet 4 (Effort Breakdown) shows effort by complexity category
```

### AC-25.3: Readiness Scorecard PDF
```
Given an assessment where:
  - 95% of scope items are decided (green)
  - 80% of steps are reviewed (green)
  - 60% of gaps are resolved (amber)
  - 30% of integrations are analyzed (red)
  - 0% of DM objects have approaches (red)
  - No sign-offs completed (red)
When the PM downloads the Readiness Scorecard
Then a PDF is generated with:
  - Overall score: approximately 44% (average of category scores)
  - Overall status: RED
  - Go/No-Go: "no_go" (3+ red categories)
  - Recommendations including "Define migration approaches for all data objects"
```

### AC-25.4: Enhanced Executive Summary
```
Given an assessment with 15 integrations, 25 DM objects, and 10 OCM impacts
When the consultant downloads the Executive Summary PDF
Then it includes the existing sections (scope, fit distribution, gap summary)
  And a new "Integration Landscape" section showing:
    - Total: 15, top 5 critical integrations listed
  And a new "Data Migration Scope" section showing:
    - Total objects: 25, total volume category
  And a new "OCM Impact Summary" section showing:
    - Total: 10, by severity, total training days
```

### AC-25.5: Report Branding
```
Given a partner lead has configured branding:
  - Logo: partner-logo.png
  - Primary color: #2d3436
  - Secondary color: #0984e3
  - Footer: "Prepared by GlobalTech Consulting"
When any PDF report is generated for assessments in that organization
Then the PDF header includes the partner logo (left) and "Aptus" wordmark (right)
  And section headers use #0984e3 (secondary color)
  And the header bar uses #2d3436 (primary color)
  And every page footer shows "Prepared by GlobalTech Consulting"
```

### AC-25.6: Complete Package ZIP
```
Given an assessment in "completed" status
When the consultant clicks "Download All"
Then a progress indicator shows reports being generated
  And a ZIP file is downloaded with filename "[CompanyName]_Assessment_Package.zip"
  And the ZIP contains 13 report files + README.txt in a named subfolder
  And all PDFs in the ZIP include branding if configured
```

### AC-25.7: Report with No Data
```
Given an assessment with 0 integration points
When the IT Lead downloads the Integration Register
Then an XLSX file is generated with:
  - Sheet 1 (Summary) showing all counts as 0
  - Sheet 2 (Detail) with header row and a merged cell reading "No integration points identified"
```

### AC-25.8: Draft Assessment Report Restriction
```
Given an assessment with status "draft"
When a user requests the Executive Summary
Then a 400 error is returned with message "Reports are available when the assessment is completed"
  And the report is not generated
```

### AC-25.9: Report History
```
Given a consultant has generated the Executive Summary 3 times over the past week
When they view the Report History
Then they see 3 entries with generation timestamps
  And each has a download link (if not expired)
  And expired entries show "Expired" badge
```

### AC-25.10: Logo Upload Validation
```
Given a partner lead uploads a 600KB PNG as the report logo
When the upload request is processed
Then it is rejected with error "Logo must be under 500KB"
  And no file is stored
```

## 15. Size Estimate

**Size: M (Medium)**

| Component | Effort |
|-----------|--------|
| Data model + migration | 0.5 days |
| Integration Register XLSX generator | 1 day |
| DM Register XLSX generator | 1 day |
| OCM Impact Report XLSX generator | 1 day |
| Enhanced Executive Summary PDF sections | 1 day |
| Readiness Scorecard PDF (score calculation + PDF rendering) | 1.5 days |
| Report branding system (logo upload, color application) | 1 day |
| ZIP package generation with streaming | 1 day |
| Report history API + UI | 0.5 days |
| Updated ReportClient UI (new reports, branding editor) | 1 day |
| Report expiry cleanup cron | 0.25 days |
| Unit + integration tests | 1.5 days |
| E2E tests | 0.75 days |
| **Total** | **~12 days** |

## 16. Phase Completion Checklist

- [ ] `ReportGeneration` and `ReportBranding` tables created and migrated
- [ ] Zod schemas for all report types, branding, and readiness scoring validated
- [ ] Integration Register XLSX: generates with 3 sheets (summary, detail, by source system)
- [ ] DM Register XLSX: generates with 4 sheets (summary, detail, by source, effort breakdown)
- [ ] OCM Impact Report XLSX: generates with 4 sheets (summary, detail, training plan, comms plan)
- [ ] Enhanced Executive Summary PDF: includes integration, DM, OCM, and timeline sections
- [ ] Readiness Scorecard PDF: calculates scores across 8 categories, renders gauge and charts
- [ ] Go/No-Go recommendation logic verified for green/amber/red thresholds
- [ ] Report branding: logo, colors, and footer applied to all PDF outputs
- [ ] Logo upload endpoint: validates format and size, stores URL
- [ ] Complete package ZIP: streams 13 reports + README in a named folder
- [ ] ZIP generation handles individual report failures gracefully
- [ ] Report history API: lists past generations with download links
- [ ] ReportClient UI: updated with 4 new reports in download list
- [ ] ReportBrandingEditor: renders form with color pickers and logo upload
- [ ] ReportGenerationStatus: shows progress for ZIP generation
- [ ] Report expiry cleanup cron configured and tested
- [ ] Permission checks: role-based access to each report type verified
- [ ] Draft assessment restriction: reports blocked except Audit Trail and Readiness Scorecard
- [ ] Empty data handling: reports generate correctly with zero records
- [ ] Unit tests: readiness scoring, branding validation, XLSX structure
- [ ] Integration tests: all report endpoints generate correct output
- [ ] E2E tests: download, branding, ZIP package
- [ ] Performance: complete package generation <30s for typical assessment
