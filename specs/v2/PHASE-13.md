# Phase 13: Gap Resolution V2

## 1. Overview

Enhance the gap resolution workflow with six capabilities:

1. **Structured cost estimation**: Replace the opaque `costEstimate: Json?` field with explicit one-time cost, recurring annual cost, implementation days, and currency code fields. Enable per-gap and rolled-up cost totals for the assessment.
2. **Risk assessment matrix**: Add priority classification, structured risk categorization (technical, business, compliance, integration), and an upgrade strategy field that classifies each resolution's maintainability across SAP upgrades.
3. **Client approval workflow**: Extend the existing `clientApproved: Boolean` with structured approval data: approval note, approval timestamp, and a gating mechanism where all gaps must be client-approved before the assessment can transition from "in_progress" to "completed".
4. **Resolution comparison ("What if")**: Side-by-side view of two alternative resolution approaches for the same gap, with cost/effort/risk comparison.
5. **Auto-suggest resolution from intelligence layer**: When a gap is created, match against `ExtensibilityPattern` and `AdaptationPattern` data to suggest relevant resolution approaches.
6. **Cost and risk rollups**: Aggregate cost, effort, and risk data across all gap resolutions in an assessment for executive-level summaries.

**Source**: V2 Brief Section A5.4

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| `GapResolution` model | Internal | Exists | Extend with new fields |
| `ExtensibilityPattern` model | Internal | Exists | Used for auto-suggestion |
| `AdaptationPattern` model | Internal | Exists | Used for auto-suggestion |
| `PUT /api/assessments/[id]/gaps/[gapId]` | Internal | Exists | Extend with V2 fields |
| `GET /api/assessments/[id]/gaps` | Internal | Exists | Extend with rollup data |
| `GapCard` component | Internal | Exists | Major enhancement required |
| `GapSummary` component | Internal | Exists | Enhance with cost/risk rollups |
| `GapResolutionClient` component | Internal | Exists | Add comparison view, approval UI |
| Phase 12 (Step Response Enrichment) | Internal | Phase 12 | Gap is auto-created when step marked as GAP |
| `canTransitionStatus` permission check | Internal | Exists | Must add gap approval gate for `in_progress -> completed` |

## 3. Data Model Changes (Prisma syntax)

```prisma
// ── Extend GapResolution model ──

model GapResolution {
  // ... existing fields (id, assessmentId, processStepId, scopeItemId,
  //   gapDescription, resolutionType, resolutionDescription, effortDays,
  //   costEstimate, riskLevel, upgradeImpact, decidedBy, decidedAt,
  //   clientApproved, rationale, createdAt, updatedAt) ...

  // V2 Phase 13: Structured Cost Estimation
  priority               String?    // "critical" | "high" | "medium" | "low"
  oneTimeCost            Float?
  recurringCost          Float?
  costCurrency           String?    @default("USD")
  implementationDays     Float?

  // V2 Phase 13: Risk Assessment
  riskCategory           String?    // "technical" | "business" | "compliance" | "integration"
  upgradeStrategy        String?    // "standard_upgrade" | "needs_revalidation" | "custom_maintenance"

  // V2 Phase 13: Client Approval Workflow
  clientApprovalNote     String?    @db.Text
  clientApprovedBy       String?
  clientApprovedAt       DateTime?

  // V2 Phase 13: Intelligence Layer References
  extensibilityPatternId String?
  adaptationPatternId    String?

  // V2 Phase 13: Alternative resolution for "What if" comparison
  alternativeResolutions GapAlternative[]
}

// ── New model for alternative resolution comparison ──

model GapAlternative {
  id                    String    @id @default(cuid())
  gapResolutionId       String
  label                 String    // "Option A", "Option B", or descriptive label
  resolutionType        String    // Same enum as GapResolution.resolutionType
  resolutionDescription String    @db.Text
  oneTimeCost           Float?
  recurringCost         Float?
  costCurrency          String?   @default("USD")
  implementationDays    Float?
  riskLevel             String?   // "LOW" | "MEDIUM" | "HIGH"
  riskCategory          String?
  upgradeStrategy       String?
  upgradeSafe           Boolean?
  rationale             String?   @db.Text
  pros                  String[]  @default([])
  cons                  String[]  @default([])
  createdBy             String
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  gapResolution GapResolution @relation(fields: [gapResolutionId], references: [id], onDelete: Cascade)

  @@index([gapResolutionId])
}
```

### Indexes

```prisma
// Add to GapResolution
@@index([assessmentId, priority])
@@index([assessmentId, riskCategory])
@@index([assessmentId, clientApproved])
@@index([extensibilityPatternId])
@@index([adaptationPatternId])
```

## 4. API Routes (method, path, request/response with Zod schemas)

### PUT /api/assessments/[id]/gaps/[gapId] (extended)

Extend existing route with V2 fields.

```typescript
// Zod request schema (extends existing gapUpdateSchema)
const gapUpdateSchemaV2 = z
  .object({
    gapDescription: z.string().min(10).max(5000).optional(),
    resolutionType: z.enum([
      "PENDING", "FIT", "CONFIGURE", "KEY_USER_EXT", "BTP_EXT",
      "ISV", "CUSTOM_ABAP", "ADAPT_PROCESS", "OUT_OF_SCOPE",
    ]),
    resolutionDescription: z.string().max(5000).optional(),
    effortDays: z.number().min(0).optional(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    upgradeImpact: z.string().max(5000).optional(),
    rationale: z.string().max(5000).optional(),
    clientApproved: z.boolean().optional(),
    // V2 fields
    priority: z.enum(["critical", "high", "medium", "low"]).nullable().optional(),
    oneTimeCost: z.number().min(0).max(100_000_000).nullable().optional(),
    recurringCost: z.number().min(0).max(100_000_000).nullable().optional(),
    costCurrency: z.string().length(3).regex(/^[A-Z]{3}$/).nullable().optional(),
    implementationDays: z.number().min(0).max(10_000).nullable().optional(),
    riskCategory: z.enum(["technical", "business", "compliance", "integration"]).nullable().optional(),
    upgradeStrategy: z.enum(["standard_upgrade", "needs_revalidation", "custom_maintenance"]).nullable().optional(),
    clientApprovalNote: z.string().max(5000).nullable().optional(),
    extensibilityPatternId: z.string().nullable().optional(),
    adaptationPatternId: z.string().nullable().optional(),
  })
  .refine(
    (data) =>
      data.resolutionType === "PENDING" ||
      data.resolutionType === "FIT" ||
      (data.rationale && data.rationale.length >= 20),
    {
      message: "Rationale is required (min 20 characters) for non-FIT resolutions",
      path: ["rationale"],
    },
  );

// Response 200:
interface GapResolutionResponseV2 {
  data: {
    id: string;
    assessmentId: string;
    processStepId: string;
    scopeItemId: string;
    gapDescription: string;
    resolutionType: string;
    resolutionDescription: string;
    effortDays: number | null;
    costEstimate: Record<string, unknown> | null;  // legacy, preserved
    riskLevel: string | null;
    upgradeImpact: string | null;
    rationale: string | null;
    clientApproved: boolean;
    decidedBy: string | null;
    decidedAt: string | null;
    // V2 fields
    priority: string | null;
    oneTimeCost: number | null;
    recurringCost: number | null;
    costCurrency: string | null;
    implementationDays: number | null;
    riskCategory: string | null;
    upgradeStrategy: string | null;
    clientApprovalNote: string | null;
    clientApprovedBy: string | null;
    clientApprovedAt: string | null;
    extensibilityPatternId: string | null;
    adaptationPatternId: string | null;
    // Computed
    suggestedPatterns: SuggestedPattern[];
  };
}
```

### POST /api/assessments/[id]/gaps/[gapId]/approve

Client approval endpoint for a gap resolution.

```typescript
// Zod request schema
const approvalSchema = z.object({
  approved: z.boolean(),
  note: z.string().max(5000).optional(),
});

// Response 200:
interface ApprovalResponse {
  data: {
    id: string;
    clientApproved: boolean;
    clientApprovedBy: string;
    clientApprovedAt: string;
    clientApprovalNote: string | null;
  };
}

// Response 403: Only process_owner, executive, consultant, admin can approve
// Response 400: Resolution must not be PENDING to approve
```

### POST /api/assessments/[id]/gaps/[gapId]/alternatives

Create an alternative resolution for comparison.

```typescript
// Zod request schema
const alternativeSchema = z.object({
  label: z.string().min(1).max(100),
  resolutionType: z.enum([
    "FIT", "CONFIGURE", "KEY_USER_EXT", "BTP_EXT",
    "ISV", "CUSTOM_ABAP", "ADAPT_PROCESS", "OUT_OF_SCOPE",
  ]),
  resolutionDescription: z.string().min(10).max(5000),
  oneTimeCost: z.number().min(0).nullable().optional(),
  recurringCost: z.number().min(0).nullable().optional(),
  costCurrency: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
  implementationDays: z.number().min(0).nullable().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  riskCategory: z.enum(["technical", "business", "compliance", "integration"]).nullable().optional(),
  upgradeStrategy: z.enum(["standard_upgrade", "needs_revalidation", "custom_maintenance"]).nullable().optional(),
  upgradeSafe: z.boolean().nullable().optional(),
  rationale: z.string().max(5000).optional(),
  pros: z.array(z.string().max(500)).max(10).optional(),
  cons: z.array(z.string().max(500)).max(10).optional(),
});

// Response 201:
interface AlternativeResponse {
  data: {
    id: string;
    gapResolutionId: string;
    label: string;
    resolutionType: string;
    // ... all fields ...
  };
}

// Response 400: Max 5 alternatives per gap resolution
```

### GET /api/assessments/[id]/gaps/[gapId]/alternatives

List all alternatives for a gap resolution.

```typescript
// Response 200:
interface AlternativesListResponse {
  data: Array<{
    id: string;
    label: string;
    resolutionType: string;
    resolutionDescription: string;
    oneTimeCost: number | null;
    recurringCost: number | null;
    costCurrency: string | null;
    implementationDays: number | null;
    riskLevel: string | null;
    riskCategory: string | null;
    upgradeStrategy: string | null;
    upgradeSafe: boolean | null;
    rationale: string | null;
    pros: string[];
    cons: string[];
    createdBy: string;
    createdAt: string;
  }>;
}
```

### DELETE /api/assessments/[id]/gaps/[gapId]/alternatives/[altId]

Delete an alternative resolution.

```typescript
// Response 200: { data: { deleted: true } }
// Response 404: Alternative not found
```

### GET /api/assessments/[id]/gaps/suggest

Get auto-suggested patterns for all gaps in an assessment.

```typescript
// Response 200:
interface SuggestionsResponse {
  data: Record<string, SuggestedPattern[]>;  // keyed by gapResolutionId
}

interface SuggestedPattern {
  type: "extensibility" | "adaptation";
  patternId: string;
  matchScore: number;         // 0.0-1.0 relevance score
  resolutionType: string;
  description: string;
  effortDays: number;
  upgradeSafe: boolean;
  riskLevel: string;
  sapSupported: boolean;      // only for ExtensibilityPattern
}
```

### GET /api/assessments/[id]/gaps/rollup

Get aggregated cost, effort, and risk data.

```typescript
// Response 200:
interface GapRollupResponse {
  data: {
    totalGaps: number;
    resolvedGaps: number;     // resolutionType != "PENDING"
    approvedGaps: number;     // clientApproved = true
    pendingApproval: number;  // resolved but not approved

    // Cost rollup
    totalOneTimeCost: number;
    totalRecurringCost: number;
    costCurrency: string;     // assessment's primary currency
    costByCurrency: Record<string, { oneTime: number; recurring: number }>;

    // Effort rollup
    totalEffortDays: number;
    totalImplementationDays: number;
    effortByResolutionType: Record<string, number>;

    // Risk rollup
    riskDistribution: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      unclassified: number;
    };
    riskByCategory: Record<string, number>;  // technical, business, compliance, integration

    // Upgrade impact
    upgradeUnsafeCount: number;
    upgradeStrategyCounts: Record<string, number>;  // standard_upgrade, needs_revalidation, custom_maintenance

    // Resolution type distribution
    resolutionTypeCounts: Record<string, number>;

    // Per-scope-item breakdown
    byScoveItem: Array<{
      scopeItemId: string;
      scopeItemName: string;
      gapCount: number;
      totalOneTimeCost: number;
      totalRecurringCost: number;
      totalEffortDays: number;
      highRiskCount: number;
    }>;
  };
}
```

## 5. UI Components (component tree, props, state)

### Component Tree

```
GapResolutionPage (RSC)
└── GapResolutionClientV2 (client)
    ├── GapRollupDashboard
    │   ├── StatCard (Total Gaps: {N} resolved, {M} pending)
    │   ├── StatCard (Total One-Time Cost: ${X})
    │   ├── StatCard (Total Annual Recurring: ${Y})
    │   ├── StatCard (Total Effort: {Z} days)
    │   ├── RiskHeatMap
    │   │   └── HeatMapCell[riskCategory x riskLevel] (colored grid with counts)
    │   └── UpgradeImpactSummary
    │       ├── Badge "Upgrade-safe: {N}"
    │       ├── Badge "Needs revalidation: {M}"
    │       └── Badge "Custom maintenance: {K}"
    ├── GapFilterBar
    │   ├── Input (search by gap description)
    │   ├── ResolutionTypeFilter (multi-select)
    │   ├── PriorityFilter (critical / high / medium / low)
    │   ├── ApprovalStatusFilter (all / approved / pending)
    │   └── ScopeItemFilter (select)
    ├── GapList
    │   └── GapCardV2[] (one per gap)
    │       ├── GapHeader
    │       │   ├── ScopeItemBadge
    │       │   ├── StepTitle
    │       │   ├── PriorityBadge (colored: critical=red, high=orange, medium=yellow, low=green)
    │       │   └── ApprovalBadge (approved/pending/not-resolved)
    │       ├── GapDescriptionBlock
    │       ├── ResolutionSection
    │       │   ├── ResolutionTypeSelector (radio group with icons)
    │       │   ├── ResolutionDescriptionTextarea
    │       │   └── SuggestedPatternChips (auto-suggested, clickable to apply)
    │       ├── CostEstimationSection
    │       │   ├── Input (oneTimeCost — currency-prefixed)
    │       │   ├── Input (recurringCost — currency-prefixed)
    │       │   ├── CurrencySelect (costCurrency)
    │       │   └── Input (implementationDays)
    │       ├── RiskAssessmentSection
    │       │   ├── RiskLevelSelect (LOW / MEDIUM / HIGH)
    │       │   ├── RiskCategorySelect (technical / business / compliance / integration)
    │       │   └── UpgradeStrategySelect (standard_upgrade / needs_revalidation / custom_maintenance)
    │       ├── RationaleTextarea
    │       ├── PatternReferenceSection (if linked to extensibility/adaptation pattern)
    │       │   ├── PatternCard (from intelligence layer)
    │       │   └── Button "View Pattern Details"
    │       ├── AlternativesSection
    │       │   ├── AlternativeCard[] (side-by-side comparison)
    │       │   │   ├── AlternativeHeader (label, type badge)
    │       │   │   ├── CostComparison (bar chart)
    │       │   │   ├── RiskComparison (badge comparison)
    │       │   │   ├── ProsCons (two-column list)
    │       │   │   └── Button "Select This Option" / "Remove"
    │       │   └── Button "Add Alternative"
    │       └── ApprovalSection
    │           ├── ApprovalStatus (approved/pending indicator)
    │           ├── Textarea (approval note)
    │           └── Button "Approve Resolution" / "Revoke Approval"
    └── ComparisonModal (full-screen side-by-side comparison)
        ├── ComparisonHeader (gap description)
        ├── ComparisonGrid
        │   ├── ComparisonColumn "Primary Resolution"
        │   │   └── ResolutionDetail (all fields)
        │   └── ComparisonColumn "Alternative: {label}"[]
        │       └── ResolutionDetail (all fields, with diff highlighting)
        └── ComparisonSummary
            ├── CostComparisonChart (bar chart)
            ├── EffortComparisonChart (bar chart)
            └── RiskComparisonTable
```

### Key Props

```typescript
interface GapResolutionClientV2Props {
  assessmentId: string;
  assessmentStatus: AssessmentStatus;
  assessmentCurrency: string;     // from enriched profile
  gaps: GapResolutionV2[];
  rollup: GapRollup;
  suggestions: Record<string, SuggestedPattern[]>;
  userRole: UserRole;
  isReadOnly: boolean;
}

interface GapCardV2Props {
  gap: GapResolutionV2;
  alternatives: GapAlternativeData[];
  suggestions: SuggestedPattern[];
  assessmentCurrency: string;
  onUpdate: (gapId: string, data: GapUpdatePayload) => void;
  onApprove: (gapId: string, approved: boolean, note?: string) => void;
  onAddAlternative: (gapId: string, data: AlternativePayload) => void;
  onRemoveAlternative: (gapId: string, altId: string) => void;
  onSelectAlternative: (gapId: string, altId: string) => void;
  isReadOnly: boolean;
  canApprove: boolean;
  canEdit: boolean;
}

interface RiskHeatMapProps {
  data: Array<{
    riskCategory: string;
    riskLevel: string;
    count: number;
  }>;
}
```

## 6. Business Logic (algorithms, state machines, validation rules)

### Auto-Suggest Resolution Engine

```typescript
interface SuggestMatch {
  type: "extensibility" | "adaptation";
  patternId: string;
  matchScore: number;
  pattern: ExtensibilityPattern | AdaptationPattern;
}

async function suggestResolutions(
  gapDescription: string,
  scopeItemId: string,
  currentResolutionType: string,
): Promise<SuggestedPattern[]> {
  // 1. Fetch all extensibility patterns and adaptation patterns
  const [extPatterns, adaptPatterns] = await Promise.all([
    prisma.extensibilityPattern.findMany(),
    prisma.adaptationPattern.findMany(),
  ]);

  const suggestions: SuggestMatch[] = [];

  // 2. Score extensibility patterns by keyword overlap
  const gapTokens = tokenize(gapDescription.toLowerCase());

  for (const pattern of extPatterns) {
    const patternTokens = tokenize(pattern.gapPattern.toLowerCase());
    const overlap = computeJaccardSimilarity(gapTokens, patternTokens);

    // Also boost score if resolution type matches
    const typeBoost = pattern.resolutionType === currentResolutionType ? 0.2 : 0;

    const score = overlap + typeBoost;
    if (score > 0.15) {
      suggestions.push({
        type: "extensibility",
        patternId: pattern.id,
        matchScore: Math.min(score, 1.0),
        pattern,
      });
    }
  }

  // 3. Score adaptation patterns
  for (const pattern of adaptPatterns) {
    const patternTokens = tokenize(pattern.commonGap.toLowerCase());
    const overlap = computeJaccardSimilarity(gapTokens, patternTokens);

    if (overlap > 0.15) {
      suggestions.push({
        type: "adaptation",
        patternId: pattern.id,
        matchScore: overlap,
        pattern,
      });
    }
  }

  // 4. Sort by score descending, limit to top 5
  suggestions.sort((a, b) => b.matchScore - a.matchScore);
  return suggestions.slice(0, 5).map(toSuggestedPattern);
}

function tokenize(text: string): Set<string> {
  const stopWords = new Set(["the", "a", "an", "is", "are", "in", "of", "to", "for", "and", "or", "not", "with"]);
  return new Set(
    text
      .split(/\W+/)
      .filter((w) => w.length > 2 && !stopWords.has(w)),
  );
}

function computeJaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function toSuggestedPattern(match: SuggestMatch): SuggestedPattern {
  if (match.type === "extensibility") {
    const p = match.pattern as ExtensibilityPattern;
    return {
      type: "extensibility",
      patternId: p.id,
      matchScore: match.matchScore,
      resolutionType: p.resolutionType,
      description: p.resolutionDescription,
      effortDays: p.effortDays,
      upgradeSafe: p.upgradeSafe,
      riskLevel: p.riskLevel,
      sapSupported: p.sapSupported,
    };
  }
  const p = match.pattern as AdaptationPattern;
  return {
    type: "adaptation",
    patternId: p.id,
    matchScore: match.matchScore,
    resolutionType: p.recommendation,
    description: p.sapApproach,
    effortDays: parseFloat(p.adaptEffort) || 0,
    upgradeSafe: true,  // adaptation patterns are by definition upgrade-safe
    riskLevel: "LOW",
    sapSupported: true,
  };
}
```

### Cost Rollup Computation

```typescript
interface CostRollup {
  totalOneTimeCost: number;
  totalRecurringCost: number;
  costCurrency: string;
  costByCurrency: Record<string, { oneTime: number; recurring: number }>;
  totalEffortDays: number;
  totalImplementationDays: number;
  effortByResolutionType: Record<string, number>;
}

async function computeCostRollup(
  assessmentId: string,
  primaryCurrency: string,
): Promise<CostRollup> {
  const gaps = await prisma.gapResolution.findMany({
    where: {
      assessmentId,
      resolutionType: { not: "PENDING" },
    },
    select: {
      oneTimeCost: true,
      recurringCost: true,
      costCurrency: true,
      effortDays: true,
      implementationDays: true,
      resolutionType: true,
    },
  });

  const rollup: CostRollup = {
    totalOneTimeCost: 0,
    totalRecurringCost: 0,
    costCurrency: primaryCurrency,
    costByCurrency: {},
    totalEffortDays: 0,
    totalImplementationDays: 0,
    effortByResolutionType: {},
  };

  for (const gap of gaps) {
    const currency = gap.costCurrency ?? primaryCurrency;

    // Accumulate by currency
    if (!rollup.costByCurrency[currency]) {
      rollup.costByCurrency[currency] = { oneTime: 0, recurring: 0 };
    }
    rollup.costByCurrency[currency].oneTime += gap.oneTimeCost ?? 0;
    rollup.costByCurrency[currency].recurring += gap.recurringCost ?? 0;

    // Accumulate totals (in primary currency — no conversion in V2)
    if (currency === primaryCurrency) {
      rollup.totalOneTimeCost += gap.oneTimeCost ?? 0;
      rollup.totalRecurringCost += gap.recurringCost ?? 0;
    }

    // Effort
    rollup.totalEffortDays += gap.effortDays ?? 0;
    rollup.totalImplementationDays += gap.implementationDays ?? 0;

    // By resolution type
    const rt = gap.resolutionType;
    rollup.effortByResolutionType[rt] = (rollup.effortByResolutionType[rt] ?? 0) + (gap.effortDays ?? 0);
  }

  return rollup;
}
```

### Risk Heat Map Computation

```typescript
interface RiskHeatMapCell {
  riskCategory: string;
  riskLevel: string;
  count: number;
  gapIds: string[];
}

async function computeRiskHeatMap(assessmentId: string): Promise<RiskHeatMapCell[]> {
  const gaps = await prisma.gapResolution.findMany({
    where: {
      assessmentId,
      resolutionType: { not: "PENDING" },
      riskCategory: { not: null },
      riskLevel: { not: null },
    },
    select: {
      id: true,
      riskCategory: true,
      riskLevel: true,
    },
  });

  const cells = new Map<string, RiskHeatMapCell>();
  const categories = ["technical", "business", "compliance", "integration"];
  const levels = ["LOW", "MEDIUM", "HIGH"];

  // Initialize grid
  for (const cat of categories) {
    for (const level of levels) {
      cells.set(`${cat}:${level}`, { riskCategory: cat, riskLevel: level, count: 0, gapIds: [] });
    }
  }

  // Populate
  for (const gap of gaps) {
    const key = `${gap.riskCategory}:${gap.riskLevel}`;
    const cell = cells.get(key);
    if (cell) {
      cell.count++;
      cell.gapIds.push(gap.id);
    }
  }

  return Array.from(cells.values());
}
```

### Client Approval Gating

The existing `canTransitionStatus` function must be augmented with a gap approval check:

```typescript
// In canTransitionStatus, add for "in_progress->completed":
if (fromStatus === "in_progress" && toStatus === "completed") {
  const unapprovedGaps = await prisma.gapResolution.count({
    where: {
      assessmentId,
      resolutionType: { not: "PENDING" },
      clientApproved: false,
    },
  });

  if (unapprovedGaps > 0) {
    return {
      allowed: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `${unapprovedGaps} gap resolution(s) require client approval before completing the assessment.`,
    };
  }

  // Also check for unresolved gaps
  const unresolvedGaps = await prisma.gapResolution.count({
    where: {
      assessmentId,
      resolutionType: "PENDING",
    },
  });

  if (unresolvedGaps > 0) {
    return {
      allowed: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `${unresolvedGaps} gap(s) have no resolution. All gaps must be resolved before completing the assessment.`,
    };
  }
}
```

### Upgrade Impact Analysis

```typescript
interface UpgradeImpactSummary {
  upgradeUnsafeCount: number;
  upgradeStrategyCounts: Record<string, number>;
  upgradeUnsafeResolutions: Array<{
    gapId: string;
    resolutionType: string;
    upgradeStrategy: string;
    description: string;
  }>;
}

function analyzeUpgradeImpact(
  gaps: Array<{
    id: string;
    resolutionType: string;
    upgradeStrategy: string | null;
    resolutionDescription: string;
  }>,
): UpgradeImpactSummary {
  const unsafeTypes = new Set(["CUSTOM_ABAP", "ISV"]);
  const revalidationTypes = new Set(["BTP_EXT", "KEY_USER_EXT"]);

  const result: UpgradeImpactSummary = {
    upgradeUnsafeCount: 0,
    upgradeStrategyCounts: {},
    upgradeUnsafeResolutions: [],
  };

  for (const gap of gaps) {
    // Determine upgrade strategy if not explicitly set
    const strategy = gap.upgradeStrategy ??
      (unsafeTypes.has(gap.resolutionType) ? "custom_maintenance" :
       revalidationTypes.has(gap.resolutionType) ? "needs_revalidation" :
       "standard_upgrade");

    result.upgradeStrategyCounts[strategy] = (result.upgradeStrategyCounts[strategy] ?? 0) + 1;

    if (strategy !== "standard_upgrade") {
      result.upgradeUnsafeCount++;
      result.upgradeUnsafeResolutions.push({
        gapId: gap.id,
        resolutionType: gap.resolutionType,
        upgradeStrategy: strategy,
        description: gap.resolutionDescription,
      });
    }
  }

  return result;
}
```

### "What If" Comparison Logic

When a user adds an alternative resolution, the comparison view displays both options side-by-side with delta highlighting:

```typescript
interface ComparisonDelta {
  field: string;
  primary: string | number | null;
  alternative: string | number | null;
  delta: number | null;          // numerical difference (for cost/effort)
  winner: "primary" | "alternative" | "tie";
}

function computeComparisonDeltas(
  primary: GapResolution,
  alternative: GapAlternative,
): ComparisonDelta[] {
  return [
    {
      field: "One-time Cost",
      primary: primary.oneTimeCost,
      alternative: alternative.oneTimeCost,
      delta: (alternative.oneTimeCost ?? 0) - (primary.oneTimeCost ?? 0),
      winner: compareLower(primary.oneTimeCost, alternative.oneTimeCost),
    },
    {
      field: "Annual Recurring Cost",
      primary: primary.recurringCost,
      alternative: alternative.recurringCost,
      delta: (alternative.recurringCost ?? 0) - (primary.recurringCost ?? 0),
      winner: compareLower(primary.recurringCost, alternative.recurringCost),
    },
    {
      field: "Implementation Days",
      primary: primary.implementationDays,
      alternative: alternative.implementationDays,
      delta: (alternative.implementationDays ?? 0) - (primary.implementationDays ?? 0),
      winner: compareLower(primary.implementationDays, alternative.implementationDays),
    },
    {
      field: "Risk Level",
      primary: primary.riskLevel,
      alternative: alternative.riskLevel,
      delta: null,
      winner: compareRisk(primary.riskLevel, alternative.riskLevel),
    },
    {
      field: "Upgrade Safe",
      primary: primary.upgradeStrategy === "standard_upgrade" ? "Yes" : "No",
      alternative: alternative.upgradeSafe ? "Yes" : "No",
      delta: null,
      winner: alternative.upgradeSafe && primary.upgradeStrategy !== "standard_upgrade"
        ? "alternative"
        : !alternative.upgradeSafe && primary.upgradeStrategy === "standard_upgrade"
          ? "primary"
          : "tie",
    },
  ];
}

function compareLower(a: number | null, b: number | null): "primary" | "alternative" | "tie" {
  if (a === null && b === null) return "tie";
  if (a === null) return "alternative";
  if (b === null) return "primary";
  if (a < b) return "primary";
  if (b < a) return "alternative";
  return "tie";
}

function compareRisk(a: string | null, b: string | null): "primary" | "alternative" | "tie" {
  const order: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const aVal = a ? order[a] ?? 1 : 1;
  const bVal = b ? order[b] ?? 1 : 1;
  if (aVal < bVal) return "primary";
  if (bVal < aVal) return "alternative";
  return "tie";
}
```

## 7. Permissions & Access Control (role x action matrix)

| Action | admin | consultant | process_owner | it_lead | executive |
|---|---|---|---|---|---|
| View gap resolutions | Yes | Yes (own org) | Yes (own area) | Yes (own assessment) | Yes (own assessment) |
| Edit gap resolution | Yes | Yes | No | No | No |
| Set priority | Yes | Yes | No | No | No |
| Set cost/effort fields | Yes | Yes | No | No | No |
| Set risk/upgrade fields | Yes | Yes | No | No | No |
| Approve gap resolution | Yes | Yes | Yes (own area) | No | Yes |
| Revoke gap approval | Yes | Yes | No | No | No |
| Add alternative resolution | Yes | Yes | No | No | No |
| Delete alternative | Yes | Yes (own) | No | No | No |
| View rollup dashboard | Yes | Yes | Yes | Yes | Yes |
| View risk heat map | Yes | Yes | Yes | Yes | Yes |
| View suggested patterns | Yes | Yes | Yes | Yes | Yes |
| Apply suggested pattern | Yes | Yes | No | No | No |

**Notes**:
- Gap resolution edits are restricted to consultants and admins because they involve technical decisions (resolution type, cost estimation, risk assessment).
- Client approval is intentionally opened to process_owners and executives, as they represent the client's voice in the assessment process. They can approve resolutions within their area.
- Revoking an approval is restricted to consultants/admins to prevent approval ping-pong.
- All stakeholder roles can view the rollup dashboard and risk heat map for transparency.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients | Template |
|---|---|---|---|
| Gap resolution updated (cost/risk fields) | In-app toast | Current user | "Gap resolution saved" |
| Gap approved by client | In-app toast + Decision Log | Current user + assessment consultant | "Gap '{description}' approved by {approver}" |
| Gap approval revoked | In-app toast + Decision Log | Current user + assessment consultant | "Gap '{description}' approval revoked" |
| All gaps approved | In-app banner | All assessment stakeholders | "All gap resolutions have been approved. Assessment can proceed to completion." |
| High-risk gap created | In-app badge | Assessment consultant(s) | Red "High Risk" badge on gap card |
| Upgrade-unsafe resolution selected | In-app inline warning | Current user | "This resolution type ({type}) requires custom maintenance during SAP upgrades" |
| Pattern suggestion available | In-app chip on gap card | Current user | "Suggested: {patternType} — {description}" |
| Transition blocked by unapproved gaps | In-app error toast | Current user | "{N} gaps require client approval before completing the assessment" |

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Gap has PENDING resolution type and user tries to approve | Return 400: "Resolution must be selected before approval. Current type: PENDING." |
| User approves gap, then consultant changes resolution type | Clear `clientApproved`, `clientApprovedBy`, `clientApprovedAt`. Gap must be re-approved. Decision log captures both the resolution change and the implicit approval revocation. |
| Cost values in different currencies across gaps | Rollup `costByCurrency` shows per-currency totals. The `totalOneTimeCost` / `totalRecurringCost` sums only gaps in the assessment's primary currency. Currency conversion is out of scope for V2. |
| No extensibility/adaptation patterns match the gap description | `suggestedPatterns` returns empty array. UI shows "No suggested patterns found" message. |
| ExtensibilityPattern referenced by gap is deleted from admin | The `extensibilityPatternId` FK is not enforced (nullable String, not a Prisma relation). The UI shows "Referenced pattern no longer available" if the pattern cannot be loaded. |
| Max 5 alternatives per gap | `POST /alternatives` returns 400 if limit exceeded. UI disables "Add Alternative" button at limit. |
| "Select This Option" on an alternative | Swap the primary resolution and the alternative: copy alternative fields to the primary GapResolution, move the previous primary data to a new GapAlternative. All in a single transaction. Log the swap in Decision Log. |
| Assessment in signed_off status | All gap operations return 403. UI is read-only. |
| Concurrent approval by two users | Last-write-wins. Both approvals are logged in Decision Log. The final state reflects the last approval. |
| Gap created by auto-creation (from step response GAP) has empty gapDescription | The auto-created gap uses the step's clientNote as gapDescription. If clientNote was empty (shouldn't happen due to validation), gapDescription defaults to "Gap identified at step: {stepTitle}". |

## 10. Performance Considerations

- **Rollup computation**: The `GET /api/assessments/[id]/gaps/rollup` endpoint performs aggregate queries. For assessments with <200 gaps (typical), this completes in <100ms. Use Prisma `groupBy` for resolution type distribution and risk distribution.
- **Pattern suggestion caching**: The suggestion engine loads all patterns (~50-100 rows) on each invocation. For V2, this is acceptable. If patterns grow beyond 1000, add a keyword index or full-text search.
- **Alternatives loading**: Alternatives are loaded per gap resolution via a separate endpoint, not eagerly with the gap list. This avoids loading alternative data for all gaps when only viewing the list.
- **Risk heat map**: Computed from a single aggregate query. Cache the result in the RSC page component (revalidated on each request).
- **Gap list pagination**: The existing cursor-based pagination on `GET /api/assessments/[id]/gaps` is preserved. V2 fields are returned alongside existing fields without additional queries.
- **Auto-suggestion batch**: The `GET /api/assessments/[id]/gaps/suggest` endpoint computes suggestions for all gaps in one pass by loading all patterns once, then scoring each gap against all patterns. This is O(G * P) where G = gaps and P = patterns. For 100 gaps and 100 patterns, this is 10,000 comparisons, each involving set operations on ~20 tokens — completes in <200ms.

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

```
describe("suggestResolutions", () => {
  it("returns extensibility patterns matching gap description keywords")
  it("returns adaptation patterns matching gap description keywords")
  it("boosts score for matching resolution type")
  it("limits results to top 5 suggestions")
  it("returns empty array when no patterns match (score < 0.15)")
  it("handles gap description with common stop words")
  it("handles empty gap description")
})

describe("computeJaccardSimilarity", () => {
  it("returns 1.0 for identical sets")
  it("returns 0.0 for disjoint sets")
  it("returns correct similarity for overlapping sets")
  it("returns 0.0 for two empty sets")
})

describe("computeCostRollup", () => {
  it("sums one-time costs across gaps in primary currency")
  it("sums recurring costs across gaps in primary currency")
  it("groups costs by currency")
  it("sums effort days by resolution type")
  it("excludes PENDING gaps from rollup")
  it("handles null cost values")
})

describe("computeRiskHeatMap", () => {
  it("produces 12 cells (4 categories x 3 levels)")
  it("counts gaps correctly in each cell")
  it("excludes gaps without risk category or level")
)

describe("analyzeUpgradeImpact", () => {
  it("flags CUSTOM_ABAP as custom_maintenance")
  it("flags ISV as custom_maintenance")
  it("flags BTP_EXT as needs_revalidation")
  it("flags KEY_USER_EXT as needs_revalidation")
  it("flags FIT, CONFIGURE, ADAPT_PROCESS as standard_upgrade")
  it("uses explicit upgradeStrategy when set")
  it("counts upgrade-unsafe resolutions correctly")
})

describe("computeComparisonDeltas", () => {
  it("identifies lower cost as winner")
  it("identifies lower risk as winner")
  it("handles null values in comparison")
  it("returns 'tie' when values are equal")
})
```

### Integration Tests

```
describe("PUT /api/assessments/[id]/gaps/[gapId] (V2)", () => {
  it("accepts and persists priority, oneTimeCost, recurringCost fields")
  it("accepts and persists riskCategory, upgradeStrategy fields")
  it("accepts and persists extensibilityPatternId reference")
  it("clears clientApproved when resolutionType changes")
  it("rejects negative cost values")
  it("rejects invalid priority value")
  it("logs decision entry with V2 fields")
})

describe("POST /api/assessments/[id]/gaps/[gapId]/approve", () => {
  it("approves gap resolution and sets clientApprovedBy/At")
  it("records approval note")
  it("rejects approval of PENDING resolution")
  it("allows process_owner to approve in their area")
  it("allows executive to approve any gap")
  it("rejects it_lead from approving")
  it("logs approval decision entry")
})

describe("POST /api/assessments/[id]/gaps/[gapId]/alternatives", () => {
  it("creates alternative resolution with all fields")
  it("enforces max 5 alternatives per gap")
  it("rejects invalid resolution type")
  it("returns 403 for non-consultant/admin")
})

describe("GET /api/assessments/[id]/gaps/rollup", () => {
  it("returns correct cost rollup across multiple gaps")
  it("returns per-currency breakdown")
  it("returns risk distribution counts")
  it("returns upgrade impact summary")
  it("returns per-scope-item breakdown")
  it("excludes PENDING gaps from rollup")
})

describe("GET /api/assessments/[id]/gaps/suggest", () => {
  it("returns suggestions keyed by gap resolution ID")
  it("returns empty suggestions for gaps with no matching patterns")
  it("limits suggestions to 5 per gap")
  it("includes match score in results")
})

describe("in_progress->completed transition with gap approval gate", () => {
  it("blocks transition when unapproved gaps exist")
  it("blocks transition when unresolved (PENDING) gaps exist")
  it("allows transition when all gaps are resolved and approved")
  it("returns helpful error with unapproved gap count")
})
```

### E2E Tests (Playwright)

```
describe("Gap Resolution V2 Flow", () => {
  it("consultant creates gap, sees auto-suggested patterns, applies one")
  it("consultant sets cost and risk fields, sees rollup dashboard update")
  it("consultant adds alternative resolution, compares side-by-side in modal")
  it("consultant selects alternative, swaps it with primary resolution")
  it("process_owner approves gap resolution in their area")
  it("executive approves gap resolution")
  it("approval clears when consultant changes resolution type")
  it("all gaps approved enables transition to 'completed'")
  it("risk heat map renders correctly with colored cells")
  it("upgrade impact summary shows correct counts")
  it("filtering by priority shows only matching gaps")
  it("filtering by approval status shows only pending/approved gaps")
})
```

## 12. Migration & Seed Data

### Prisma Migration

```sql
-- AlterTable: Add V2 columns to GapResolution
ALTER TABLE "GapResolution" ADD COLUMN "priority" TEXT;
ALTER TABLE "GapResolution" ADD COLUMN "oneTimeCost" DOUBLE PRECISION;
ALTER TABLE "GapResolution" ADD COLUMN "recurringCost" DOUBLE PRECISION;
ALTER TABLE "GapResolution" ADD COLUMN "costCurrency" TEXT DEFAULT 'USD';
ALTER TABLE "GapResolution" ADD COLUMN "implementationDays" DOUBLE PRECISION;
ALTER TABLE "GapResolution" ADD COLUMN "riskCategory" TEXT;
ALTER TABLE "GapResolution" ADD COLUMN "upgradeStrategy" TEXT;
ALTER TABLE "GapResolution" ADD COLUMN "clientApprovalNote" TEXT;
ALTER TABLE "GapResolution" ADD COLUMN "clientApprovedBy" TEXT;
ALTER TABLE "GapResolution" ADD COLUMN "clientApprovedAt" TIMESTAMP(3);
ALTER TABLE "GapResolution" ADD COLUMN "extensibilityPatternId" TEXT;
ALTER TABLE "GapResolution" ADD COLUMN "adaptationPatternId" TEXT;

-- CreateIndex
CREATE INDEX "GapResolution_assessmentId_priority_idx" ON "GapResolution"("assessmentId", "priority");
CREATE INDEX "GapResolution_assessmentId_riskCategory_idx" ON "GapResolution"("assessmentId", "riskCategory");
CREATE INDEX "GapResolution_assessmentId_clientApproved_idx" ON "GapResolution"("assessmentId", "clientApproved");
CREATE INDEX "GapResolution_extensibilityPatternId_idx" ON "GapResolution"("extensibilityPatternId");
CREATE INDEX "GapResolution_adaptationPatternId_idx" ON "GapResolution"("adaptationPatternId");

-- CreateTable: GapAlternative
CREATE TABLE "GapAlternative" (
    "id" TEXT NOT NULL,
    "gapResolutionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "resolutionType" TEXT NOT NULL,
    "resolutionDescription" TEXT NOT NULL,
    "oneTimeCost" DOUBLE PRECISION,
    "recurringCost" DOUBLE PRECISION,
    "costCurrency" TEXT DEFAULT 'USD',
    "implementationDays" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "riskCategory" TEXT,
    "upgradeStrategy" TEXT,
    "upgradeSafe" BOOLEAN,
    "rationale" TEXT,
    "pros" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GapAlternative_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GapAlternative_gapResolutionId_idx" ON "GapAlternative"("gapResolutionId");

-- AddForeignKey
ALTER TABLE "GapAlternative" ADD CONSTRAINT "GapAlternative_gapResolutionId_fkey"
  FOREIGN KEY ("gapResolutionId") REFERENCES "GapResolution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Seed Data

```typescript
// Update existing demo gap resolutions with V2 fields
const demoGaps = [
  {
    id: "demo-gap-1",
    priority: "critical",
    oneTimeCost: 50000,
    recurringCost: 12000,
    costCurrency: "USD",
    implementationDays: 20,
    riskCategory: "technical",
    upgradeStrategy: "needs_revalidation",
    clientApproved: true,
    clientApprovedBy: "client@example.com",
    clientApprovedAt: new Date(),
    clientApprovalNote: "Approved with condition: must be completed before go-live",
  },
  {
    id: "demo-gap-2",
    priority: "medium",
    oneTimeCost: 15000,
    recurringCost: 0,
    costCurrency: "USD",
    implementationDays: 5,
    riskCategory: "business",
    upgradeStrategy: "standard_upgrade",
    clientApproved: false,
  },
];

for (const gap of demoGaps) {
  await prisma.gapResolution.update({
    where: { id: gap.id },
    data: gap,
  });
}

// Add demo alternative
await prisma.gapAlternative.create({
  data: {
    gapResolutionId: "demo-gap-1",
    label: "BTP Extension Alternative",
    resolutionType: "BTP_EXT",
    resolutionDescription: "Build a BTP side-by-side extension to handle custom validation logic",
    oneTimeCost: 75000,
    recurringCost: 6000,
    costCurrency: "USD",
    implementationDays: 30,
    riskLevel: "MEDIUM",
    riskCategory: "technical",
    upgradeStrategy: "needs_revalidation",
    upgradeSafe: true,
    rationale: "BTP extension decouples custom logic from core, enabling clean upgrades",
    pros: ["Upgrade-safe", "SAP-supported", "Decoupled from core"],
    cons: ["Higher initial cost", "Longer implementation", "Requires BTP license"],
    createdBy: "consultant@example.com",
  },
});
```

## 13. Open Questions (numbered, with recommended answers)

1. **Should currency conversion be supported in V2 cost rollups?**
   - Recommended: No. V2 shows per-currency totals and only sums costs in the assessment's primary currency (from Phase 10 profile enrichment). Currency conversion requires exchange rate data and introduces complexity. Add multi-currency support in a future phase.

2. **Should the auto-suggestion engine use full-text search or the current Jaccard similarity?**
   - Recommended: Jaccard similarity for V2. It is simple, deterministic, and sufficient for ~100 patterns. If the pattern library grows or matching quality is insufficient, upgrade to PostgreSQL full-text search (tsvector/tsquery) or an embedding-based approach in a future phase.

3. **Should "Select This Option" on an alternative automatically approve the new primary resolution?**
   - Recommended: No. Swapping an alternative to primary clears the approval status (since the resolution has changed). The gap must be re-approved by the client. This ensures the client always approves the actual final resolution.

4. **Should the risk heat map include gaps with no risk assessment?**
   - Recommended: No. The heat map only displays gaps with both `riskCategory` and `riskLevel` set. Gaps without risk assessment are counted separately as "unclassified" in the risk distribution summary.

5. **Should the gap approval gate be enforced for all transition paths or just in_progress -> completed?**
   - Recommended: Only for `in_progress -> completed`. This is the transition where the assessment moves from active review to final state. Earlier transitions (draft -> in_progress) are governed by the profile completeness gate. Later transitions (completed -> reviewed -> signed_off) are executive/consultant actions that do not need additional gating.

6. **Should gap alternatives support file attachments?**
   - Recommended: No. Use text descriptions and URL links for V2. File attachments require storage infrastructure. Alternatives are meant to be quick comparison sketches, not detailed proposals.

7. **What happens to alternatives when the primary resolution is marked as PENDING (reset)?**
   - Recommended: Alternatives are preserved. Resetting the primary resolution does not delete alternatives. The user may want to revisit alternatives when reconsidering the resolution approach.

## 14. Acceptance Criteria (Given/When/Then)

### AC-13.1: Structured cost estimation on gap resolution
```
Given I am a consultant editing gap "GAP-001"
When I set oneTimeCost to 50000, recurringCost to 12000, costCurrency to "USD", implementationDays to 20
Then the cost fields are persisted via PUT /api/assessments/{id}/gaps/{gapId}
And the rollup dashboard shows updated totals
```

### AC-13.2: Risk assessment with category and upgrade strategy
```
Given I am editing gap "GAP-001" with resolutionType "CUSTOM_ABAP"
When I set riskCategory to "technical" and riskLevel to "HIGH"
And upgradeStrategy defaults to "custom_maintenance" based on resolution type
Then the risk heat map shows a count in the technical/HIGH cell
And the upgrade impact summary shows 1 "custom maintenance" resolution
And an inline warning appears: "Custom ABAP requires maintenance during SAP upgrades"
```

### AC-13.3: Client approval workflow
```
Given gap "GAP-001" has resolutionType "BTP_EXT" (not PENDING)
When a process_owner clicks "Approve Resolution" and enters note "Approved per steering committee decision"
Then clientApproved is set to true
And clientApprovedBy is set to the process_owner's email
And clientApprovedAt is set to the current timestamp
And clientApprovalNote stores the note
And a DecisionLogEntry is created for the approval
```

### AC-13.4: Transition blocked by unapproved gaps
```
Given assessment "ASM-001" has 5 gap resolutions
And 3 are approved, 1 is resolved but unapproved, 1 is PENDING
When a consultant transitions the assessment from "in_progress" to "completed"
Then the transition is rejected with HTTP 400
And the error message says "1 gap resolution(s) require client approval" and "1 gap(s) have no resolution"
```

### AC-13.5: Resolution comparison ("What if")
```
Given gap "GAP-001" has primary resolution "CUSTOM_ABAP" ($50K one-time, 20 days, HIGH risk)
And an alternative "BTP Extension" ($75K one-time, 30 days, MEDIUM risk)
When I click "Compare" to open the comparison modal
Then I see a side-by-side view with:
  - Cost comparison showing CUSTOM_ABAP is $25K cheaper
  - Effort comparison showing CUSTOM_ABAP is 10 days faster
  - Risk comparison showing BTP_EXT is lower risk
  - Upgrade comparison showing BTP_EXT is upgrade-safe, CUSTOM_ABAP is not
And each field highlights the "winner" in green
```

### AC-13.6: Auto-suggest resolution from intelligence layer
```
Given a gap with description "Custom approval workflow needed for purchase orders above 10,000 USD"
And an ExtensibilityPattern exists with gapPattern "custom approval workflow purchase order"
When the gap card renders
Then a suggestion chip appears: "Suggested: KEY_USER_EXT — Custom Approval Workflow via Business Rules"
And clicking the chip pre-fills the resolution fields from the pattern
```

### AC-13.7: Approval cleared on resolution change
```
Given gap "GAP-001" is approved by the client with resolutionType "BTP_EXT"
When a consultant changes resolutionType to "CUSTOM_ABAP"
Then clientApproved is cleared to false
And clientApprovedBy is cleared to null
And clientApprovedAt is cleared to null
And the gap requires re-approval
And a DecisionLogEntry captures both the resolution change and the implicit approval reset
```

### AC-13.8: Cost rollup dashboard accuracy
```
Given assessment "ASM-001" has 3 resolved gaps:
  - Gap 1: $50K one-time, $12K recurring, 20 implementation days (USD)
  - Gap 2: $15K one-time, $0 recurring, 5 implementation days (USD)
  - Gap 3: RM 30K one-time, RM 6K recurring, 10 implementation days (MYR)
When I view the rollup dashboard (primary currency USD)
Then Total One-Time Cost shows $65,000 (USD only)
And Total Recurring Cost shows $12,000 (USD only)
And Cost by Currency shows USD: $65K/$12K, MYR: RM30K/RM6K
And Total Implementation Days shows 35
```

## 15. Size Estimate

| Category | Estimate |
|---|---|
| **T-shirt size** | **M** |
| Schema changes + migration (GapResolution fields + GapAlternative table) | 1 day |
| Gap resolution API extensions (PUT, approve, alternatives CRUD) | 2 days |
| Auto-suggest engine (Jaccard matching) | 1 day |
| Rollup computation API | 1 day |
| Risk heat map computation | 0.5 day |
| Upgrade impact analysis | 0.5 day |
| Comparison logic (delta computation) | 0.5 day |
| GapCardV2 with cost/risk/approval sections | 2 days |
| GapRollupDashboard + RiskHeatMap component | 1.5 days |
| ComparisonModal (side-by-side view) | 1.5 days |
| AlternativeCard and CRUD UI | 1 day |
| Client approval UI and gating integration | 1 day |
| Tests (unit + integration + e2e) | 2.5 days |
| **Total** | **16 days** |

## 16. Phase Completion Checklist

- [ ] Prisma migration adds V2 columns to GapResolution (priority, oneTimeCost, recurringCost, costCurrency, implementationDays, riskCategory, upgradeStrategy, clientApprovalNote, clientApprovedBy, clientApprovedAt, extensibilityPatternId, adaptationPatternId)
- [ ] Prisma migration creates GapAlternative table with FK to GapResolution
- [ ] New indexes created for priority, riskCategory, clientApproved, extensibilityPatternId, adaptationPatternId
- [ ] `PUT /api/assessments/[id]/gaps/[gapId]` extended with all V2 fields
- [ ] `POST /api/assessments/[id]/gaps/[gapId]/approve` implements client approval with note
- [ ] `POST /api/assessments/[id]/gaps/[gapId]/alternatives` creates alternative resolution (max 5)
- [ ] `GET /api/assessments/[id]/gaps/[gapId]/alternatives` lists alternatives
- [ ] `DELETE /api/assessments/[id]/gaps/[gapId]/alternatives/[altId]` removes alternative
- [ ] `GET /api/assessments/[id]/gaps/rollup` returns cost, effort, risk aggregates
- [ ] `GET /api/assessments/[id]/gaps/suggest` returns auto-suggested patterns per gap
- [ ] `suggestResolutions` function implements Jaccard similarity matching
- [ ] `computeCostRollup` function sums costs by currency
- [ ] `computeRiskHeatMap` function produces 4x3 category/level grid
- [ ] `analyzeUpgradeImpact` function classifies resolutions by upgrade safety
- [ ] `computeComparisonDeltas` function produces side-by-side delta data
- [ ] `canTransitionStatus` blocks `in_progress -> completed` when unapproved or unresolved gaps exist
- [ ] Approval cleared automatically when resolution type changes
- [ ] `GapCardV2` renders cost estimation, risk assessment, and approval sections
- [ ] `GapRollupDashboard` with stat cards, risk heat map, and upgrade impact summary
- [ ] `ComparisonModal` renders side-by-side comparison with delta highlighting
- [ ] `AlternativeCard` with CRUD operations and "Select This Option" swap
- [ ] Suggested pattern chips on gap cards with click-to-apply
- [ ] Filter bar supports priority, approval status, scope item, resolution type filters
- [ ] Read-only mode for signed_off assessments
- [ ] Process owner and executive can approve; IT lead cannot
- [ ] Decision log entries for resolution updates, approvals, alternative swaps
- [ ] Seed data includes demo gaps with V2 fields and one alternative
- [ ] All unit tests pass (suggestion engine, rollup, heat map, comparison)
- [ ] All integration tests pass (API routes, approval gating)
- [ ] E2E tests cover cost entry, approval, comparison modal, rollup dashboard, and suggestion flows
