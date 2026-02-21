# Phase 26: Analytics, Benchmarking & Templates

## 1. Overview

XL-sized phase combining five interconnected analytics and reuse capabilities for the Aptus platform:

1. **Assessment Templates**: Save completed assessments as reusable, anonymized templates stored at organization level. Partners can bootstrap new client engagements from proven scope patterns, reducing assessment startup time from days to hours.

2. **Cross-Phase Analytics**: For clients with Phase 1 + Phase 2 assessments, show trend analysis and scope expansion tracking — how scope grew, which gaps persisted, and which classifications changed between assessment iterations.

3. **Partner Portfolio Dashboard**: Aggregate metrics across all partner assessments — average FIT rate by industry, most common gaps, integration pattern frequency, assessment duration, and consultant utilization. Provides partner leadership with strategic visibility.

4. **Benchmarking**: Compare current assessment against anonymized aggregates from assessments across the platform ("Your FIT rate for Finance (72%) is below industry average (81%)"). Surfaces actionable insights during assessment execution.

5. **Return Client Analytics**: Track assessment-to-implementation outcomes for clients who return for subsequent phases, enabling long-term engagement intelligence.

**Source**: V2 Brief Section A10 items 3-4 + Addendum 2 Section 4

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| Phase 29 (Organization Model) | Internal | Required | Organization-scoped templates require the enriched Organization model with `slug`, `type`, `ssoEnabled`, `primaryColor`, `logoUrl` fields |
| Phase 31 (Assessment Versioning) | Internal | Required | Cross-phase analytics requires the ability to link Phase 1 and Phase 2 assessments together via versioning |
| Assessment model | Internal | Exists | Core assessment data is the source for all analytics computations |
| ScopeSelection model | Internal | Exists | Scope selections drive FIT rate benchmarks and template scope patterns |
| StepResponse model | Internal | Exists | Step classifications are the basis for gap frequency analysis |
| GapResolution model | Internal | Exists | Gap patterns feed into template common gap data and portfolio metrics |
| Organization model | Internal | Exists | Templates are organization-scoped; portfolio metrics are per-organization |
| IndustryProfile model | Internal | Exists | Industry codes used for benchmark segmentation |
| Report infrastructure (`pdf-generator.ts`, `xlsx-generator.ts`) | Internal | Exists | Portfolio dashboard exports reuse existing report generation patterns |
| Prisma 6 | External | Exists | Aggregation queries (`groupBy`, `aggregate`) used for benchmark computation |
| shadcn/ui Charts (Recharts) | External | Add | `BarChart`, `LineChart`, `RadarChart` for portfolio dashboard visualizations |
| node-cron or Vercel Cron | External | Add | Scheduled jobs for nightly benchmark and portfolio metric computation |

## 3. Data Model Changes

```prisma
// ── Phase 26: Assessment Templates ──

model AssessmentTemplate {
  id                  String   @id @default(cuid())
  organizationId      String
  name                String
  description         String?  @db.Text
  industry            String
  companySize         String?
  modules             String[]
  geography           String?
  scopeSelections     Json     // Anonymized scope item relevance patterns: [{scopeItemId, relevance, selected}]
  commonGapPatterns   Json?    // Frequently seen gaps: [{description, resolutionType, frequency}]
  integrationPatterns Json?    // Common integration types: [{type, system, direction}]
  dmPatterns          Json?    // Common data migration objects: [{objectType, complexity, volume}]
  workshopTemplate    Json?    // Default workshop schedule: [{name, duration, participants, agenda}]
  roleTemplate        Json?    // Default stakeholder roles: [{role, assignedAreas, description}]
  sourceAssessmentId  String?  // Original assessment (null if manually created)
  isPublished         Boolean  @default(false)
  timesUsed           Int      @default(0)
  createdById         String
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  createdBy    User         @relation(fields: [createdById], references: [id])

  @@index([organizationId])
  @@index([organizationId, industry])
  @@index([organizationId, isPublished])
}

// ── Phase 26: Benchmark Snapshots ──

model BenchmarkSnapshot {
  id                 String   @id @default(cuid())
  industry           String
  companySize        String?
  sampleSize         Int
  avgFitRate         Float
  avgGapRate         Float
  avgConfigRate      Float
  avgNaRate          Float
  medianFitRate      Float?
  p25FitRate         Float?   // 25th percentile
  p75FitRate         Float?   // 75th percentile
  commonGaps         Json     // [{description: string, frequency: number, resolutionType: string}]
  commonIntegrations Json     // [{type: string, system: string, frequency: number}]
  avgAssessmentDays  Float?
  avgScopeItemCount  Float?
  computedAt         DateTime @default(now())

  @@unique([industry, companySize])
  @@index([industry])
}

// ── Phase 26: Portfolio Metrics ──

model PortfolioMetric {
  id             String   @id @default(cuid())
  organizationId String
  metricType     String   // "fit_rate" | "avg_duration" | "gap_distribution" | "consultant_utilization" | "scope_coverage" | "assessment_volume"
  metricValue    Json     // Shape varies by metricType
  period         String   // "2025-Q1", "2025-02", etc.
  computedAt     DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, metricType, period])
  @@index([organizationId, metricType])
  @@index([organizationId, period])
}

// ── Phase 26: Cross-Phase Link ──

model AssessmentPhaseLink {
  id                String   @id @default(cuid())
  clientIdentifier  String   // Normalized company name or client code
  phase1AssessmentId String
  phase2AssessmentId String
  linkedById        String
  scopeDelta        Json?    // {added: string[], removed: string[], changed: [{scopeItemId, from, to}]}
  classificationDelta Json?  // {fitToGap: number, gapToFit: number, newItems: number}
  linkedAt          DateTime @default(now())

  @@unique([phase1AssessmentId, phase2AssessmentId])
  @@index([clientIdentifier])
  @@index([phase1AssessmentId])
  @@index([phase2AssessmentId])
}
```

**Migration notes**:
- Four new tables; no existing tables modified.
- `BenchmarkSnapshot` uses a unique constraint on `[industry, companySize]` to support upsert during nightly recomputation.
- `PortfolioMetric` uses a unique constraint on `[organizationId, metricType, period]` so each metric is stored once per period.
- `AssessmentPhaseLink` connects two assessments for cross-phase analysis. The `clientIdentifier` allows grouping even if company names differ slightly across assessments.

## 4. API Routes

### POST /api/templates

Create a template from an existing assessment.

```typescript
// Zod request schema
const createTemplateSchema = z.object({
  assessmentId: z.string().cuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  includeGapPatterns: z.boolean().default(true),
  includeIntegrationPatterns: z.boolean().default(true),
  includeDmPatterns: z.boolean().default(true),
  includeWorkshopTemplate: z.boolean().default(false),
  includeRoleTemplate: z.boolean().default(false),
});

// Response 201
interface CreateTemplateResponse {
  data: {
    id: string;
    name: string;
    description: string | null;
    industry: string;
    companySize: string | null;
    modules: string[];
    geography: string | null;
    scopeSelectionCount: number;
    gapPatternCount: number;
    timesUsed: number;
    createdAt: string;
  };
}

// Response 400: { error: { code: "VALIDATION_ERROR", message: string, details: Record<string, string> } }
// Response 401: { error: { code: "UNAUTHORIZED", message: string } }
// Response 403: { error: { code: "FORBIDDEN", message: string } }
// Response 404: { error: { code: "NOT_FOUND", message: string } }
```

### GET /api/templates

List templates for the authenticated user's organization.

```typescript
// Query params
const listTemplatesSchema = z.object({
  industry: z.string().optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Response 200
interface ListTemplatesResponse {
  data: TemplateListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  industry: string;
  companySize: string | null;
  modules: string[];
  geography: string | null;
  timesUsed: number;
  createdBy: { id: string; name: string };
  createdAt: string;
}
```

### DELETE /api/templates/[templateId]

```typescript
// Response 204: No content
// Response 403: { error: { code: "FORBIDDEN", message: string } }
// Response 404: { error: { code: "NOT_FOUND", message: string } }
```

### POST /api/assessments/from-template/[templateId]

Create a new assessment pre-populated from a template.

```typescript
const createFromTemplateSchema = z.object({
  companyName: z.string().min(1).max(200),
  industry: z.string().min(1).max(100),
  country: z.string().min(2).max(10),
  operatingCountries: z.array(z.string().min(2).max(10)).default([]),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]),
  overrideScopeSelections: z.boolean().default(false),
});

// Response 201
interface CreateFromTemplateResponse {
  data: {
    assessmentId: string;
    templateId: string;
    scopeItemsApplied: number;
    gapPatternsApplied: number;
    message: string;
  };
}
```

### GET /api/analytics/portfolio

Partner portfolio dashboard data.

```typescript
// Query params
const portfolioQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(Q[1-4]|\d{2})$/).optional(), // e.g., "2025-Q1" or "2025-02"
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

// Response 200
interface PortfolioDashboardResponse {
  data: {
    summary: {
      totalAssessments: number;
      activeAssessments: number;
      completedAssessments: number;
      avgFitRate: number;
      avgAssessmentDurationDays: number;
      totalScopeItems: number;
    };
    fitRateByIndustry: Array<{ industry: string; avgFitRate: number; assessmentCount: number }>;
    topGaps: Array<{ description: string; frequency: number; resolutionType: string }>;
    integrationFrequency: Array<{ type: string; count: number; percentage: number }>;
    assessmentTimeline: Array<{ period: string; count: number; avgFitRate: number }>;
    consultantUtilization: Array<{ consultantId: string; name: string; activeAssessments: number; completedAssessments: number }>;
    periodMetrics: PortfolioMetric[];
  };
}
```

### GET /api/analytics/benchmarks/[assessmentId]

Benchmark comparison for a specific assessment.

```typescript
// Response 200
interface BenchmarkComparisonResponse {
  data: {
    assessmentId: string;
    assessmentFitRate: number;
    assessmentGapRate: number;
    assessmentConfigRate: number;
    benchmark: {
      industry: string;
      companySize: string | null;
      sampleSize: number;
      avgFitRate: number;
      avgGapRate: number;
      avgConfigRate: number;
      medianFitRate: number | null;
      p25FitRate: number | null;
      p75FitRate: number | null;
    } | null;
    comparison: {
      fitRateDelta: number;        // positive = above average
      fitRatePercentile: string;   // "above_average" | "average" | "below_average"
      gapRateDelta: number;
      insights: string[];          // Human-readable insights
    } | null;
    commonGaps: Array<{ description: string; frequency: number; presentInAssessment: boolean }>;
  };
}

// Response 404: No benchmark data available for this industry
```

### GET /api/analytics/cross-phase/[assessmentId]

Cross-phase analytics for assessments linked via AssessmentPhaseLink.

```typescript
// Response 200
interface CrossPhaseAnalyticsResponse {
  data: {
    assessmentId: string;
    linkedAssessmentId: string;
    phase1Summary: PhaseSummary;
    phase2Summary: PhaseSummary;
    scopeDelta: {
      added: Array<{ scopeItemId: string; name: string }>;
      removed: Array<{ scopeItemId: string; name: string }>;
      changed: Array<{ scopeItemId: string; name: string; fromRelevance: string; toRelevance: string }>;
    };
    classificationDelta: {
      fitToGap: number;
      gapToFit: number;
      fitToConfig: number;
      configToFit: number;
      newItems: number;
      removedItems: number;
    };
    trendInsights: string[];
  };
}

interface PhaseSummary {
  assessmentId: string;
  completedAt: string | null;
  totalSteps: number;
  fitCount: number;
  gapCount: number;
  configCount: number;
  naCount: number;
  fitRate: number;
  scopeItemCount: number;
}
```

### POST /api/analytics/cross-phase

Link two assessments for cross-phase analysis.

```typescript
const linkAssessmentsSchema = z.object({
  phase1AssessmentId: z.string().cuid(),
  phase2AssessmentId: z.string().cuid(),
  clientIdentifier: z.string().min(1).max(200).optional(),
});

// Response 201
// Response 400: Assessments belong to different organizations
// Response 409: Link already exists
```

## 5. UI Components

### Component Tree

```
AnalyticsLayout (RSC — tabs container)
├── PortfolioDashboardPage (RSC)
│   └── PortfolioDashboard (client)
│       ├── PortfolioSummaryCards
│       │   ├── StatCard (totalAssessments)
│       │   ├── StatCard (avgFitRate)
│       │   ├── StatCard (avgDuration)
│       │   └── StatCard (activeAssessments)
│       ├── FitRateByIndustryChart (Recharts BarChart)
│       ├── TopGapsTable
│       │   └── DataTable (shadcn)
│       ├── IntegrationFrequencyChart (Recharts PieChart)
│       ├── AssessmentTimelineChart (Recharts LineChart)
│       ├── ConsultantUtilizationTable
│       │   └── DataTable (shadcn)
│       └── PeriodSelector
│           └── Select (shadcn)
│
├── BenchmarkComparisonPage (RSC)
│   └── BenchmarkComparison (client)
│       ├── BenchmarkHeader
│       │   ├── FitRateGauge (RadialBarChart)
│       │   └── PercentileIndicator
│       ├── BenchmarkDeltaCards
│       │   ├── DeltaCard (fitRate)
│       │   ├── DeltaCard (gapRate)
│       │   └── DeltaCard (configRate)
│       ├── IndustryComparisonChart (Recharts BarChart — your vs average)
│       ├── CommonGapsComparison
│       │   └── DataTable (shadcn — with "Present in your assessment" column)
│       └── InsightsList
│
├── CrossPhaseAnalyticsPage (RSC)
│   └── CrossPhaseAnalytics (client)
│       ├── PhaseLinkSelector
│       │   └── Combobox (shadcn)
│       ├── PhaseComparisonHeader
│       │   ├── PhaseSummaryCard (Phase 1)
│       │   └── PhaseSummaryCard (Phase 2)
│       ├── ScopeDeltaTable
│       │   └── DataTable (added/removed/changed rows with color coding)
│       ├── ClassificationSankeyDiagram (Recharts or custom SVG)
│       └── TrendInsightsList
│
└── TemplatesPage (RSC)
    └── TemplatesManager (client)
        ├── TemplateListView
        │   ├── TemplateCard (per template)
        │   │   ├── Badge (industry)
        │   │   ├── Badge (companySize)
        │   │   ├── Badge (timesUsed)
        │   │   └── DropdownMenu (Use, Edit, Delete)
        │   └── EmptyState
        ├── CreateTemplateDialog
        │   └── Dialog (shadcn)
        │       ├── AssessmentSelector (Combobox)
        │       ├── Input (name)
        │       ├── Textarea (description)
        │       ├── Checkbox (includeGapPatterns)
        │       ├── Checkbox (includeIntegrationPatterns)
        │       ├── Checkbox (includeDmPatterns)
        │       └── Button ("Create Template")
        └── UseTemplateDialog
            └── Dialog (shadcn)
                ├── Input (companyName)
                ├── IndustrySelect
                ├── CountrySelect
                ├── CompanySizeSelect
                └── Button ("Create Assessment from Template")
```

### Key Props & State

```typescript
interface PortfolioDashboardProps {
  organizationId: string;
  initialData: PortfolioDashboardResponse["data"];
}

interface PortfolioDashboardState {
  period: string | null;
  isLoading: boolean;
  data: PortfolioDashboardResponse["data"];
}

interface BenchmarkComparisonProps {
  assessmentId: string;
  initialData: BenchmarkComparisonResponse["data"];
}

interface CrossPhaseAnalyticsProps {
  assessmentId: string;
  linkedAssessments: Array<{ id: string; companyName: string; phase: string }>;
}

interface TemplatesManagerProps {
  organizationId: string;
  initialTemplates: TemplateListItem[];
  assessments: Array<{ id: string; companyName: string; status: string }>;
}
```

## 6. Business Logic

### Template Anonymization

When creating a template from an assessment, all client-specific data must be stripped:

```typescript
interface AnonymizationConfig {
  stripFields: string[];
  redactPatterns: RegExp[];
}

const ANONYMIZATION_CONFIG: AnonymizationConfig = {
  stripFields: [
    "companyName",
    "createdBy",
    "respondent",
    "respondedAt",
    "clientNote",
    "currentProcess",
    "decidedBy",
    "decidedAt",
    "signatoryName",
    "signatoryEmail",
  ],
  redactPatterns: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // email addresses
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,                     // phone numbers
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,                       // proper names (heuristic)
  ],
};

function anonymizeScopeSelections(
  selections: ScopeSelection[]
): AnonymizedScopePattern[] {
  return selections.map((s) => ({
    scopeItemId: s.scopeItemId,
    relevance: s.relevance,
    selected: s.selected,
    // Notes, respondent, and timestamps are stripped
  }));
}

function anonymizeGapPatterns(
  gaps: GapResolution[]
): AnonymizedGapPattern[] {
  const frequencyMap = new Map<string, number>();
  for (const gap of gaps) {
    const key = `${gap.resolutionType}::${gap.gapDescription.substring(0, 100)}`;
    frequencyMap.set(key, (frequencyMap.get(key) ?? 0) + 1);
  }

  return Array.from(frequencyMap.entries()).map(([key, frequency]) => {
    const [resolutionType, description] = key.split("::");
    return {
      description: redactPII(description, ANONYMIZATION_CONFIG.redactPatterns),
      resolutionType,
      frequency,
    };
  });
}

function redactPII(text: string, patterns: RegExp[]): string {
  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
```

### Benchmark Computation (Nightly Job)

```typescript
async function computeBenchmarks(): Promise<void> {
  const industries = await prisma.assessment.findMany({
    where: { status: { in: ["completed", "signed_off"] }, deletedAt: null },
    select: { industry: true, companySize: true },
    distinct: ["industry", "companySize"],
  });

  for (const { industry, companySize } of industries) {
    const assessments = await prisma.assessment.findMany({
      where: { industry, companySize, status: { in: ["completed", "signed_off"] }, deletedAt: null },
      include: {
        stepResponses: { select: { fitStatus: true } },
        gapResolutions: { select: { gapDescription: true, resolutionType: true } },
      },
    });

    if (assessments.length < MINIMUM_SAMPLE_SIZE) continue; // Require at least 5 assessments

    const fitRates = assessments.map((a) => {
      const total = a.stepResponses.length;
      if (total === 0) return 0;
      const fit = a.stepResponses.filter((s) => s.fitStatus === "fit").length;
      return (fit / total) * 100;
    });

    const sorted = [...fitRates].sort((a, b) => a - b);

    await prisma.benchmarkSnapshot.upsert({
      where: { industry_companySize: { industry, companySize: companySize ?? "__null__" } },
      create: {
        industry,
        companySize,
        sampleSize: assessments.length,
        avgFitRate: mean(fitRates),
        avgGapRate: computeAvgRate(assessments, "gap"),
        avgConfigRate: computeAvgRate(assessments, "configure"),
        avgNaRate: computeAvgRate(assessments, "not_applicable"),
        medianFitRate: median(sorted),
        p25FitRate: percentile(sorted, 25),
        p75FitRate: percentile(sorted, 75),
        commonGaps: aggregateGaps(assessments),
        commonIntegrations: aggregateIntegrations(assessments),
        avgAssessmentDays: computeAvgDuration(assessments),
        avgScopeItemCount: mean(assessments.map((a) => a.stepResponses.length)),
      },
      update: {
        sampleSize: assessments.length,
        avgFitRate: mean(fitRates),
        avgGapRate: computeAvgRate(assessments, "gap"),
        avgConfigRate: computeAvgRate(assessments, "configure"),
        avgNaRate: computeAvgRate(assessments, "not_applicable"),
        medianFitRate: median(sorted),
        p25FitRate: percentile(sorted, 25),
        p75FitRate: percentile(sorted, 75),
        commonGaps: aggregateGaps(assessments),
        commonIntegrations: aggregateIntegrations(assessments),
        avgAssessmentDays: computeAvgDuration(assessments),
        avgScopeItemCount: mean(assessments.map((a) => a.stepResponses.length)),
        computedAt: new Date(),
      },
    });
  }
}

const MINIMUM_SAMPLE_SIZE = 5;
```

### Portfolio Metric Computation

```typescript
type MetricType =
  | "fit_rate"
  | "avg_duration"
  | "gap_distribution"
  | "consultant_utilization"
  | "scope_coverage"
  | "assessment_volume";

async function computePortfolioMetrics(organizationId: string, period: string): Promise<void> {
  const assessments = await prisma.assessment.findMany({
    where: {
      organizationId,
      deletedAt: null,
      createdAt: { gte: periodStart(period), lte: periodEnd(period) },
    },
    include: {
      stepResponses: true,
      stakeholders: true,
      scopeSelections: true,
    },
  });

  const metrics: Array<{ type: MetricType; value: unknown }> = [
    {
      type: "fit_rate",
      value: {
        avg: mean(assessments.map(computeFitRate)),
        min: Math.min(...assessments.map(computeFitRate)),
        max: Math.max(...assessments.map(computeFitRate)),
        count: assessments.length,
      },
    },
    {
      type: "assessment_volume",
      value: {
        total: assessments.length,
        draft: assessments.filter((a) => a.status === "draft").length,
        in_progress: assessments.filter((a) => a.status === "in_progress").length,
        completed: assessments.filter((a) => ["completed", "signed_off"].includes(a.status)).length,
      },
    },
    {
      type: "consultant_utilization",
      value: computeConsultantUtilization(assessments),
    },
  ];

  for (const metric of metrics) {
    await prisma.portfolioMetric.upsert({
      where: {
        organizationId_metricType_period: { organizationId, metricType: metric.type, period },
      },
      create: { organizationId, metricType: metric.type, metricValue: metric.value as any, period },
      update: { metricValue: metric.value as any, computedAt: new Date() },
    });
  }
}
```

### Cross-Phase Delta Computation

```typescript
function computeScopeDelta(
  phase1Selections: ScopeSelection[],
  phase2Selections: ScopeSelection[]
): ScopeDelta {
  const p1Map = new Map(phase1Selections.map((s) => [s.scopeItemId, s]));
  const p2Map = new Map(phase2Selections.map((s) => [s.scopeItemId, s]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ scopeItemId: string; from: string; to: string }> = [];

  for (const [id, sel] of p2Map) {
    if (!p1Map.has(id)) {
      added.push(id);
    } else {
      const p1 = p1Map.get(id)!;
      if (p1.relevance !== sel.relevance) {
        changed.push({ scopeItemId: id, from: p1.relevance, to: sel.relevance });
      }
    }
  }

  for (const [id] of p1Map) {
    if (!p2Map.has(id)) {
      removed.push(id);
    }
  }

  return { added, removed, changed };
}
```

## 7. Permissions & Access Control

| Action | platform_admin | partner_lead | consultant | project_manager | solution_architect | process_owner | it_lead | data_migration_lead | executive_sponsor | client_admin | viewer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Create template | Yes | Yes (own org) | Yes (own org) | No | Yes (own org) | No | No | No | No | No | No |
| List templates | Yes | Yes (own org) | Yes (own org) | Yes (own org) | Yes (own org) | No | No | No | No | Yes (own org) | No |
| Delete template | Yes | Yes (own org) | Only own | No | Only own | No | No | No | No | No | No |
| Use template | Yes | Yes (own org) | Yes (own org) | No | Yes (own org) | No | No | No | No | No | No |
| View portfolio dashboard | Yes | Yes (own org) | No | No | No | No | No | No | No | Yes (own org) | No |
| View benchmarks | Yes | Yes (own org) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) | No | No | No | Yes (own assessment) | Yes (own org) | No |
| View cross-phase analytics | Yes | Yes (own org) | Yes (own assessments) | Yes (own assessments) | Yes (own assessments) | No | No | No | No | Yes (own org) | No |
| Link assessments (cross-phase) | Yes | Yes (own org) | Yes (own org) | No | Yes (own org) | No | No | No | No | No | No |

**Notes**:
- "Own org" means the user's `organizationId` must match the resource's `organizationId`.
- Portfolio dashboard is restricted to partner_lead and above because it reveals aggregate data across all client engagements.
- Benchmarks are available to assessment-level stakeholders because the data is anonymized.

## 8. Notification Triggers

| Event | Channel | Recipients | Template |
|---|---|---|---|
| Template created from assessment | In-app toast | Creator | "Template '{name}' created successfully from assessment '{companyName}'." |
| Assessment created from template | In-app toast | Creator | "Assessment '{companyName}' created from template '{templateName}'. {scopeItemsApplied} scope items applied." |
| Benchmark data available | In-app badge | Assessment stakeholders | "Benchmark comparison available — see how your assessment compares to {sampleSize} similar assessments." |
| Portfolio metrics updated (nightly) | In-app badge | Partner leads | "Portfolio metrics for {period} have been updated." |
| Cross-phase link created | Email + In-app | Assessment stakeholders (both assessments) | "Assessment '{companyName}' has been linked to a previous assessment for trend analysis." |
| Benchmark position changes | Email (weekly digest) | Partner leads | "Weekly benchmark update: {assessmentCount} assessments, average FIT rate moved from {old}% to {new}%." |

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Template created from assessment with zero scope selections | Return 400: "Assessment must have at least one scope selection to create a template." |
| Template created from draft assessment | Return 400: "Assessment must be in 'in_progress' or later status to create a template." |
| Benchmark requested but fewer than 5 assessments exist for industry | Return 200 with `benchmark: null` and `comparison: null`. UI shows "Not enough data for benchmarking yet." |
| Cross-phase link between assessments in different organizations | Return 400: "Both assessments must belong to the same organization." |
| Cross-phase link for assessment with no scope selections | Allowed. Delta will show all Phase 2 selections as "added". |
| Template name conflicts within organization | Allowed. Names are not unique. Templates are identified by CUID. |
| Assessment deleted after template created | Template remains valid. `sourceAssessmentId` points to soft-deleted assessment. UI shows "(source assessment deleted)" label. |
| Portfolio metrics for organization with zero assessments | Metrics computed with zero values. Dashboard shows empty state. |
| Nightly job fails mid-computation | Each benchmark/metric is computed independently in its own transaction. Partial completion is acceptable — stale data for failed segments, fresh data for successful ones. |
| Template with extremely large scope (200+ items) | Template `scopeSelections` JSON capped at 500 items. If assessment exceeds this, return 400: "Assessment scope too large for template." |
| Concurrent benchmark computation requests | Prevented by unique constraint on `[industry, companySize]`. Upsert handles race conditions. |
| User tries to link same assessment to multiple Phase 1 assessments | Allowed. An assessment can be the Phase 2 in multiple links (e.g., different departments did separate Phase 1 assessments). |

## 10. Performance Considerations

- **Nightly computation**: Benchmark and portfolio metric jobs run during off-peak hours (02:00 UTC). Use Vercel Cron or a dedicated worker. Each benchmark computation is O(n) where n is assessments in that industry/size segment. Total job duration target: under 5 minutes for 10,000 assessments.
- **Portfolio dashboard queries**: Read precomputed `PortfolioMetric` rows, not raw assessment data. Dashboard API should respond in under 200ms.
- **Benchmark comparison**: Single read from `BenchmarkSnapshot` plus one assessment query. Should respond in under 100ms.
- **Template creation**: Anonymization is synchronous but lightweight. The heaviest operation is reading all scope selections and gap resolutions for the source assessment. Use Prisma `select` to minimize payload.
- **Template JSON size**: `scopeSelections` JSON for a large assessment could be 50-100KB. This is within PostgreSQL's JSON column limits but should be monitored. Consider compression for templates with 300+ scope items.
- **Cross-phase delta**: Computed on-demand (not precomputed) because it is accessed infrequently. Cache the result in `AssessmentPhaseLink.scopeDelta` after first computation.
- **Index strategy**: Indexes on `[organizationId, metricType]` and `[organizationId, period]` for PortfolioMetric ensure fast dashboard queries. No full-table scans.
- **Pagination**: Template listing and activity feed use cursor-based pagination. Portfolio dashboard metrics are returned as a single payload (bounded by period count).

## 11. Testing Strategy

### Unit Tests

```
describe("anonymizeScopeSelections", () => {
  it("strips respondent, notes, and timestamps from selections")
  it("preserves scopeItemId, relevance, and selected status")
  it("handles empty selections array")
})

describe("anonymizeGapPatterns", () => {
  it("aggregates duplicate gaps by resolution type")
  it("redacts email addresses from gap descriptions")
  it("redacts phone numbers from gap descriptions")
  it("redacts proper names from gap descriptions")
  it("returns empty array for zero gaps")
})

describe("computeBenchmarks", () => {
  it("computes correct average FIT rate for 10 assessments")
  it("computes median and percentiles correctly")
  it("skips industries with fewer than 5 assessments")
  it("handles assessments with zero step responses")
  it("aggregates common gaps across assessments")
})

describe("computeScopeDelta", () => {
  it("identifies added scope items in Phase 2")
  it("identifies removed scope items from Phase 1")
  it("identifies changed relevance between phases")
  it("handles identical scope selections (no delta)")
  it("handles disjoint scope selections (all added/removed)")
})

describe("computePortfolioMetrics", () => {
  it("computes fit_rate metric with avg, min, max")
  it("computes assessment_volume by status")
  it("computes consultant_utilization across assessments")
  it("handles empty period with zero assessments")
})
```

### Integration Tests

```
describe("POST /api/templates", () => {
  it("creates template from completed assessment with anonymized data")
  it("increments timesUsed on source assessment template count")
  it("rejects template from draft assessment")
  it("rejects template from assessment with zero scope selections")
  it("rejects unauthenticated request with 401")
  it("rejects viewer role with 403")
  it("rejects cross-organization access with 403")
  it("strips email addresses from gap descriptions in template")
})

describe("GET /api/templates", () => {
  it("returns paginated templates for user's organization")
  it("filters by industry parameter")
  it("searches by name with partial match")
  it("excludes templates from other organizations")
  it("returns empty list for organization with no templates")
})

describe("POST /api/assessments/from-template/[templateId]", () => {
  it("creates assessment with scope selections from template")
  it("increments template timesUsed counter")
  it("does not copy anonymized gap patterns into assessment")
  it("rejects template from different organization")
  it("creates assessment in draft status")
})

describe("GET /api/analytics/portfolio", () => {
  it("returns portfolio summary for partner organization")
  it("filters by period parameter")
  it("rejects non-partner-lead roles with 403")
  it("returns empty data for organization with no assessments")
})

describe("GET /api/analytics/benchmarks/[assessmentId]", () => {
  it("returns benchmark comparison with delta and percentile")
  it("returns null benchmark when sample size insufficient")
  it("includes common gaps with presence indicator")
  it("rejects unauthorized access with 403")
})

describe("GET /api/analytics/cross-phase/[assessmentId]", () => {
  it("returns scope and classification deltas between linked assessments")
  it("returns 404 when no phase link exists")
  it("caches computed delta in AssessmentPhaseLink")
})
```

### E2E Tests (Playwright)

```
describe("Analytics, Benchmarking & Templates Flow", () => {
  it("partner_lead creates template from completed assessment, sees it in template list")
  it("consultant creates new assessment from template, scope items are pre-populated")
  it("partner_lead views portfolio dashboard with FIT rate chart and top gaps table")
  it("consultant views benchmark comparison showing assessment vs industry average")
  it("consultant links two assessments for cross-phase analysis and views scope delta")
  it("template list filters by industry correctly")
  it("empty state renders correctly when no templates exist")
})
```

## 12. Migration & Seed Data

### Prisma Migration

```sql
-- CreateTable: AssessmentTemplate
CREATE TABLE "AssessmentTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "industry" TEXT NOT NULL,
    "companySize" TEXT,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "geography" TEXT,
    "scopeSelections" JSONB NOT NULL,
    "commonGapPatterns" JSONB,
    "integrationPatterns" JSONB,
    "dmPatterns" JSONB,
    "workshopTemplate" JSONB,
    "roleTemplate" JSONB,
    "sourceAssessmentId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: BenchmarkSnapshot
CREATE TABLE "BenchmarkSnapshot" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "companySize" TEXT,
    "sampleSize" INTEGER NOT NULL,
    "avgFitRate" DOUBLE PRECISION NOT NULL,
    "avgGapRate" DOUBLE PRECISION NOT NULL,
    "avgConfigRate" DOUBLE PRECISION NOT NULL,
    "avgNaRate" DOUBLE PRECISION NOT NULL,
    "medianFitRate" DOUBLE PRECISION,
    "p25FitRate" DOUBLE PRECISION,
    "p75FitRate" DOUBLE PRECISION,
    "commonGaps" JSONB NOT NULL,
    "commonIntegrations" JSONB NOT NULL,
    "avgAssessmentDays" DOUBLE PRECISION,
    "avgScopeItemCount" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PortfolioMetric
CREATE TABLE "PortfolioMetric" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "metricValue" JSONB NOT NULL,
    "period" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AssessmentPhaseLink
CREATE TABLE "AssessmentPhaseLink" (
    "id" TEXT NOT NULL,
    "clientIdentifier" TEXT NOT NULL,
    "phase1AssessmentId" TEXT NOT NULL,
    "phase2AssessmentId" TEXT NOT NULL,
    "linkedById" TEXT NOT NULL,
    "scopeDelta" JSONB,
    "classificationDelta" JSONB,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentPhaseLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "AssessmentTemplate_organizationId_idx" ON "AssessmentTemplate"("organizationId");
CREATE INDEX "AssessmentTemplate_organizationId_industry_idx" ON "AssessmentTemplate"("organizationId", "industry");
CREATE INDEX "AssessmentTemplate_organizationId_isPublished_idx" ON "AssessmentTemplate"("organizationId", "isPublished");
CREATE INDEX "BenchmarkSnapshot_industry_idx" ON "BenchmarkSnapshot"("industry");
CREATE UNIQUE INDEX "BenchmarkSnapshot_industry_companySize_key" ON "BenchmarkSnapshot"("industry", "companySize");
CREATE UNIQUE INDEX "PortfolioMetric_organizationId_metricType_period_key" ON "PortfolioMetric"("organizationId", "metricType", "period");
CREATE INDEX "PortfolioMetric_organizationId_metricType_idx" ON "PortfolioMetric"("organizationId", "metricType");
CREATE INDEX "PortfolioMetric_organizationId_period_idx" ON "PortfolioMetric"("organizationId", "period");
CREATE UNIQUE INDEX "AssessmentPhaseLink_phase1AssessmentId_phase2AssessmentId_key" ON "AssessmentPhaseLink"("phase1AssessmentId", "phase2AssessmentId");
CREATE INDEX "AssessmentPhaseLink_clientIdentifier_idx" ON "AssessmentPhaseLink"("clientIdentifier");
CREATE INDEX "AssessmentPhaseLink_phase1AssessmentId_idx" ON "AssessmentPhaseLink"("phase1AssessmentId");
CREATE INDEX "AssessmentPhaseLink_phase2AssessmentId_idx" ON "AssessmentPhaseLink"("phase2AssessmentId");

-- AddForeignKeys
ALTER TABLE "AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortfolioMetric" ADD CONSTRAINT "PortfolioMetric_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### Seed Data

```typescript
// In prisma/seed.ts — add demo templates and benchmark data

// Demo template
await prisma.assessmentTemplate.create({
  data: {
    id: "tmpl-demo-manufacturing",
    organizationId: "org-partner-demo",
    name: "Manufacturing Standard (MY)",
    description: "Standard template for Malaysian manufacturing companies migrating from SAP ECC to S/4HANA Cloud. Covers core modules: FI, CO, MM, PP, SD, QM.",
    industry: "manufacturing",
    companySize: "midsize",
    modules: ["FI", "CO", "MM", "PP", "SD", "QM"],
    geography: "MY",
    scopeSelections: [
      { scopeItemId: "J60", relevance: "must_have", selected: true },
      { scopeItemId: "J14", relevance: "must_have", selected: true },
      { scopeItemId: "1YB", relevance: "nice_to_have", selected: true },
      { scopeItemId: "BKP", relevance: "not_relevant", selected: false },
    ],
    commonGapPatterns: [
      { description: "Custom pricing logic for local distributors", resolutionType: "key_user_extensibility", frequency: 4 },
      { description: "Multi-currency intercompany reconciliation", resolutionType: "configure", frequency: 3 },
    ],
    isPublished: true,
    timesUsed: 7,
    createdById: "user-consultant-demo",
  },
});

// Demo benchmark snapshot
await prisma.benchmarkSnapshot.create({
  data: {
    industry: "manufacturing",
    companySize: "midsize",
    sampleSize: 23,
    avgFitRate: 68.4,
    avgGapRate: 18.2,
    avgConfigRate: 10.1,
    avgNaRate: 3.3,
    medianFitRate: 70.0,
    p25FitRate: 62.5,
    p75FitRate: 75.8,
    commonGaps: [
      { description: "Custom quality inspection workflows", frequency: 15, resolutionType: "side_by_side_extensibility" },
      { description: "Legacy batch numbering scheme", frequency: 12, resolutionType: "key_user_extensibility" },
    ],
    commonIntegrations: [
      { type: "inbound", system: "MES", frequency: 18 },
      { type: "outbound", system: "WMS", frequency: 14 },
    ],
    avgAssessmentDays: 32.5,
    avgScopeItemCount: 45.0,
  },
});

// Demo portfolio metric
await prisma.portfolioMetric.create({
  data: {
    organizationId: "org-partner-demo",
    metricType: "fit_rate",
    metricValue: { avg: 71.2, min: 58.0, max: 85.5, count: 12 },
    period: "2025-Q4",
  },
});
```

### Backfill

No backfill required for existing data. Benchmark snapshots and portfolio metrics will be populated on the first nightly computation run. Templates start empty — partners create them from existing assessments.

## 13. Open Questions

1. **Should templates be shareable across organizations (e.g., a "public template library")?**
   - Recommended: No for V2. Templates are organization-scoped. A future V3 feature could introduce a curated public library managed by platform_admin. The `isPublished` flag is included in the schema to support this later.

2. **Should benchmark data be single-firm (intra-organization) or cross-firm (platform-wide)?**
   - Recommended: Platform-wide for V2. All completed assessments contribute to benchmarks regardless of organization. This maximizes sample size. Add an organization-scoped benchmark view in a future iteration for partners who want to compare against only their own portfolio.

3. **What is the minimum sample size for meaningful benchmarks?**
   - Recommended: 5 assessments per industry/size segment. Below this threshold, benchmarks are not shown. The `sampleSize` field in `BenchmarkSnapshot` enables the UI to display confidence messaging like "Based on 23 similar assessments."

4. **Should cross-phase analytics require explicit linking or auto-detect based on company name?**
   - Recommended: Explicit linking via `POST /api/analytics/cross-phase`. Auto-detection is unreliable due to company name variations. The `clientIdentifier` field allows manual normalization.

5. **Should the nightly benchmark job run on Vercel Cron or an external scheduler?**
   - Recommended: Vercel Cron for simplicity. The computation is bounded (5-minute target) and fits within Vercel function execution limits. If computation grows beyond 10 minutes, migrate to a background worker.

6. **Should portfolio metrics include cost/revenue data (e.g., assessment billing)?**
   - Recommended: No for V2. Financial data is out of scope. Portfolio metrics focus on assessment quality and velocity. Revenue tracking is a separate V3 feature.

## 14. Acceptance Criteria (Given/When/Then)

### AC-26.1: Create template from assessment
```
Given I am a consultant in organization "Acme Partners"
And assessment "ASM-001" is in "completed" status with 45 scope selections and 12 gap resolutions
When I click "Save as Template" and enter name "Manufacturing Standard MY"
Then a new AssessmentTemplate is created in my organization
And the template contains 45 anonymized scope selection patterns
And all email addresses and proper names are stripped from gap descriptions
And the template appears in my organization's template list
```

### AC-26.2: Create assessment from template
```
Given I am a consultant in organization "Acme Partners"
And template "Manufacturing Standard MY" exists with 45 scope selections
When I click "Use Template" and enter company name "Widget Corp" with industry "manufacturing" and country "MY"
Then a new assessment is created in "draft" status
And 45 scope selections are pre-populated from the template
And the template's timesUsed counter increments by 1
And I am redirected to the new assessment's profile page
```

### AC-26.3: View portfolio dashboard
```
Given I am a partner_lead in organization "Acme Partners"
And my organization has 15 completed assessments across 3 industries
When I navigate to the portfolio dashboard
Then I see summary cards showing total assessments (15), average FIT rate, and average duration
And I see a bar chart of FIT rates by industry
And I see a table of top 10 most common gaps across all assessments
And I see consultant utilization data
```

### AC-26.4: View benchmark comparison
```
Given I am a consultant on assessment "ASM-001" in industry "manufacturing" with FIT rate 72%
And the benchmark for manufacturing/midsize has avgFitRate 81% and sampleSize 23
When I navigate to the benchmark comparison page
Then I see "Your FIT rate (72%) is below industry average (81%)"
And I see delta cards showing -9% for FIT rate
And I see common gaps listed with checkmarks indicating which are present in my assessment
```

### AC-26.5: Benchmark not available for small sample
```
Given I am a consultant on assessment "ASM-002" in industry "aerospace"
And fewer than 5 completed assessments exist for "aerospace"
When I navigate to the benchmark comparison page
Then I see "Not enough data for benchmarking yet. At least 5 completed assessments in your industry are needed."
And no comparison charts are displayed
```

### AC-26.6: Cross-phase analytics
```
Given assessment "ASM-001" (Phase 1) and "ASM-002" (Phase 2) are linked
And ASM-001 had 40 scope selections with 65% FIT rate
And ASM-002 has 52 scope selections with 71% FIT rate
When I navigate to cross-phase analytics for ASM-002
Then I see Phase 1 summary (40 items, 65% FIT) and Phase 2 summary (52 items, 71% FIT)
And I see 12 scope items listed as "added" in Phase 2
And I see classification changes (e.g., "5 items moved from GAP to FIT")
And I see trend insight "FIT rate improved by 6 percentage points between phases"
```

### AC-26.7: Template anonymization
```
Given assessment "ASM-001" has gap description "John Smith (john.smith@acme.com) requires custom pricing for distributor XYZ"
When I create a template from this assessment
Then the gap pattern description in the template reads "[REDACTED] ([REDACTED]) requires custom pricing for distributor [REDACTED]"
And no email addresses appear anywhere in the template JSON
```

### AC-26.8: Organization isolation for templates
```
Given I am a consultant in organization "Alpha Partners"
And organization "Beta Partners" has template "Retail Standard"
When I request GET /api/templates
Then the response does not include "Retail Standard"
And if I request POST /api/assessments/from-template/{beta-template-id}
Then the response is 403 Forbidden
```

## 15. Size Estimate

| Category | Estimate |
|---|---|
| **T-shirt size** | **XL** |
| Schema changes (4 new tables) | 1 day |
| Template CRUD API (3 routes) | 2 days |
| Template anonymization engine | 1.5 days |
| Assessment-from-template creation | 1 day |
| Portfolio dashboard API + UI | 3 days |
| Benchmark computation job | 2 days |
| Benchmark comparison API + UI | 2 days |
| Cross-phase analytics API + UI | 2.5 days |
| Nightly cron job setup | 0.5 day |
| Charts (Recharts integration) | 2 days |
| Tests (unit + integration + e2e) | 3 days |
| **Total** | **~20.5 days (4 weeks)** |

## 16. Phase Completion Checklist

- [ ] Prisma migration creates `AssessmentTemplate`, `BenchmarkSnapshot`, `PortfolioMetric`, `AssessmentPhaseLink` tables
- [ ] `POST /api/templates` creates anonymized template from assessment
- [ ] `GET /api/templates` returns paginated, organization-scoped template list
- [ ] `DELETE /api/templates/[templateId]` removes template with authorization check
- [ ] `POST /api/assessments/from-template/[templateId]` creates pre-populated assessment
- [ ] Template anonymization strips emails, phone numbers, and proper names from all text fields
- [ ] Template `timesUsed` counter increments on each use
- [ ] `GET /api/analytics/portfolio` returns precomputed portfolio metrics
- [ ] Portfolio dashboard UI renders summary cards, FIT rate chart, top gaps table, and consultant utilization
- [ ] `GET /api/analytics/benchmarks/[assessmentId]` returns comparison with industry benchmark
- [ ] Benchmark comparison UI renders gauge, delta cards, and common gaps table
- [ ] Benchmark comparison gracefully handles missing data (sample size < 5)
- [ ] `POST /api/analytics/cross-phase` links two assessments for cross-phase analysis
- [ ] `GET /api/analytics/cross-phase/[assessmentId]` returns scope and classification deltas
- [ ] Cross-phase UI renders side-by-side phase summaries and delta tables
- [ ] Nightly cron job computes benchmark snapshots and portfolio metrics
- [ ] Organization isolation enforced on all template and analytics endpoints
- [ ] Role-based access control enforced per permissions matrix
- [ ] Seed data includes demo template, benchmark snapshot, and portfolio metric
- [ ] Unit tests pass for anonymization, benchmark computation, and delta logic
- [ ] Integration tests pass for all API routes
- [ ] E2E test covers template creation, use, portfolio dashboard, and benchmark comparison
