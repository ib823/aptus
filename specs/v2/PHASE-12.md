# Phase 12: Step Response Enrichment & Content Presentation

## 1. Overview

This is a **major phase** combining two closely related concerns into a single deliverable:

### Part A: Step Response Enrichment
Extend the `StepResponse` model beyond the current `fitStatus` + `clientNote` pattern to capture richer assessment data: confidence level (how certain the respondent is about their classification), evidence URLs (links to supporting documents/screenshots), and reviewer identity and timestamp (for consultant review sign-off on individual step responses).

### Part B: Content Presentation Overhaul (Addendum 3)
Fundamentally redesign how SAP Best Practice step content is displayed during review. The current `StepReviewCard` renders raw `actionInstructionsHtml` as a single block of HTML. The overhaul introduces:

1. **Step type classification engine**: Categorize each process step into one of seven categories (BUSINESS_PROCESS, CONFIGURATION, REPORTING, REFERENCE, SYSTEM_ACCESS, TEST_INFO, MASTER_DATA) based on its `stepType` field. Only classifiable steps require a FIT/GAP decision.
2. **Content parser**: Regex-based section detection on `actionInstructionsHtml` to split content into structured sections (Purpose, Prerequisites, System Access, Roles, Master Data, Expected Result) with appropriate collapse/expand behavior.
3. **Decision-first card layout**: Move the FIT/CONFIGURE/GAP/NA classification buttons ABOVE the SAP content, so the respondent's decision is the primary action and SAP reference material is secondary.
4. **Step grouping**: Group steps by category + activity field for logical navigation through large scope items.
5. **Enhanced progress indicator**: Show "6 of 35 classifiable steps reviewed" (not "6 of 56 total steps"), giving accurate progress.
6. **Compact reference step rendering**: Non-classifiable steps (Information, LogOn/LogOff, TestProcedure) are rendered as collapsed single-line items, not full cards.
7. **Configuration activity contextualization**: De-duplicate config activities shown per step, explain Self-Service flag.

**Source**: V2 Brief Section A5.3 + Addendum 3 (all 8 sections)

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| `StepResponse` model | Internal | Exists | Add confidence, evidenceUrls, reviewedBy, reviewedAt |
| `ProcessStep` model | Internal | Exists | Add stepCategory, parsedContent, isClassifiable, groupKey, groupLabel |
| `StepReviewCard` component | Internal | Exists | Complete redesign required |
| `ReviewClient` component | Internal | Exists | Major enhancement for step grouping and progress |
| `ReviewSidebar` component | Internal | Exists | Update for group-based navigation |
| `sanitizeHtmlContent` utility | Internal | Exists | Used for HTML rendering |
| `PUT /api/assessments/[id]/steps/[stepId]` | Internal | Exists | Extend with V2 fields |
| `GET /api/assessments/[id]/steps` | Internal | Exists | Extend with classification and grouping |
| Phase 11 (Scope Selection V2) | Internal | Phase 11 | Classifiable step count used in impact preview |

## 3. Data Model Changes (Prisma syntax)

```prisma
// ── Add to StepResponse model ──

model StepResponse {
  // ... existing fields ...

  // V2 Phase 12: Response Enrichment
  confidence     String?    // "high" | "medium" | "low"
  evidenceUrls   String[]   @default([])
  reviewedBy     String?
  reviewedAt     DateTime?
}

// ── Add to ProcessStep model ──

model ProcessStep {
  // ... existing fields ...

  // V2 Phase 12: Content Presentation
  stepCategory     String?    // "BUSINESS_PROCESS" | "CONFIGURATION" | "REPORTING" | "REFERENCE" | "SYSTEM_ACCESS" | "TEST_INFO" | "MASTER_DATA"
  parsedContent    Json?      // ParsedStepContent — cached structured parse of actionInstructionsHtml
  isClassifiable   Boolean    @default(true)
  groupKey         String?    // Derived group identifier: "{stepCategory}:{activityTitle}"
  groupLabel       String?    // Human-readable group name: "Business Process — Sales Order Processing"
}
```

### TypeScript Types for ParsedContent

```typescript
interface ParsedStepContent {
  purpose: string | null;          // Extracted purpose/overview paragraph
  prerequisites: string | null;    // Extracted prerequisites section
  systemAccess: string | null;     // Extracted system access / login info
  roles: string | null;            // Extracted role requirements
  masterData: string | null;       // Extracted master data references
  mainInstructions: string;        // Core instruction content (always present)
  expectedResult: string | null;   // From actionExpectedResult field
  rawHtml: string;                 // Original actionInstructionsHtml (fallback)
}

type StepCategory =
  | "BUSINESS_PROCESS"
  | "CONFIGURATION"
  | "REPORTING"
  | "REFERENCE"
  | "SYSTEM_ACCESS"
  | "TEST_INFO"
  | "MASTER_DATA";
```

### Indexes

```prisma
// Add to ProcessStep
@@index([stepCategory])
@@index([groupKey])
@@index([scopeItemId, stepCategory])
```

## 4. API Routes (method, path, request/response with Zod schemas)

### PUT /api/assessments/[id]/steps/[stepId] (extended)

Extend existing route to accept enrichment fields.

```typescript
// Zod request schema (extends existing responseSchema)
const responseSchemaV2 = z
  .object({
    fitStatus: z.enum(["FIT", "CONFIGURE", "GAP", "NA", "PENDING"]),
    clientNote: z.string().max(5000).optional(),
    currentProcess: z.string().max(5000).optional(),
    overrideReason: z.string().optional(),
    // V2 enrichment
    confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
    evidenceUrls: z
      .array(z.string().url().max(2048))
      .max(10)
      .optional(),
  })
  .refine(
    (data) => data.fitStatus !== "GAP" || (data.clientNote && data.clientNote.length >= 10),
    { message: "Gap note is required (min 10 characters) when status is GAP", path: ["clientNote"] },
  );

// Response 200:
interface StepResponseV2 {
  data: {
    id: string;
    assessmentId: string;
    processStepId: string;
    fitStatus: string;
    clientNote: string | null;
    currentProcess: string | null;
    confidence: string | null;
    evidenceUrls: string[];
    respondent: string | null;
    respondedAt: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
}
```

### PUT /api/assessments/[id]/steps/[stepId]/review

New route for consultant review sign-off on an individual step response.

```typescript
// Zod request schema
const reviewSchema = z.object({
  approved: z.boolean(),
  reviewNote: z.string().max(2000).optional(),
});

// Response 200:
interface ReviewResponse {
  data: {
    processStepId: string;
    reviewedBy: string;
    reviewedAt: string;
    approved: boolean;
  };
}

// Response 403: Only consultants and admins can review responses
// Response 404: Step response not found (must have a response to review)
```

### GET /api/assessments/[id]/steps (extended)

Extend to include classification, grouping, and parsed content.

```typescript
// Query params:
//   scopeItemId: string (required)
//   includeNonClassifiable: "true" | "false" (default: "true")
//   groupBy: "category" | "activity" | "none" (default: "category")

// Response 200:
interface StepsResponseV2 {
  data: {
    groups: StepGroup[];
    progress: {
      totalSteps: number;
      classifiableSteps: number;
      respondedClassifiable: number;  // classifiable steps with non-PENDING status
      respondedTotal: number;
      reviewedCount: number;
    };
    summary: {
      fitCount: number;
      configureCount: number;
      gapCount: number;
      naCount: number;
      pendingCount: number;
    };
  };
}

interface StepGroup {
  groupKey: string;
  groupLabel: string;
  category: StepCategory;
  isClassifiable: boolean;
  steps: StepWithResponse[];
}

interface StepWithResponse {
  id: string;
  sequence: number;
  actionTitle: string;
  stepType: string;
  stepCategory: StepCategory;
  isClassifiable: boolean;
  parsedContent: ParsedStepContent;
  activityTitle: string | null;
  activityTargetUrl: string | null;
  processFlowGroup: string | null;
  // Response data (null if no response yet)
  response: {
    fitStatus: string;
    clientNote: string | null;
    currentProcess: string | null;
    confidence: string | null;
    evidenceUrls: string[];
    respondent: string | null;
    respondedAt: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  } | null;
  // Related config activities
  configActivities: Array<{
    id: string;
    configItemName: string;
    category: string;
    selfService: boolean;
    activityDescription: string;
  }>;
}
```

### POST /api/admin/process-steps/classify

Admin endpoint to run the classification engine on all process steps (or a subset).

```typescript
// Zod request schema
const classifySchema = z.object({
  scopeItemIds: z.array(z.string()).optional(),  // null = all
  force: z.boolean().default(false),             // re-classify even if already classified
});

// Response 200:
interface ClassifyResponse {
  data: {
    classified: number;
    skipped: number;    // already classified and force=false
    breakdown: Record<StepCategory, number>;
  };
}
```

### POST /api/admin/process-steps/parse-content

Admin endpoint to run the content parser on all process steps.

```typescript
// Zod request schema
const parseContentSchema = z.object({
  scopeItemIds: z.array(z.string()).optional(),
  force: z.boolean().default(false),
});

// Response 200:
interface ParseContentResponse {
  data: {
    parsed: number;
    skipped: number;
    errors: number;
  };
}
```

## 5. UI Components (component tree, props, state)

### Component Tree

```
StepReviewPage (RSC)
└── ReviewClientV2 (client)
    ├── ReviewHeader
    │   ├── ScopeItemInfo (name, ID, functional area)
    │   └── ClassifiableProgressBar
    │       ├── SegmentedBar (one segment per group, colored by completion)
    │       └── Label "{responded} of {classifiable} classifiable steps reviewed"
    ├── ReviewSidebarV2
    │   ├── StepGroupNav
    │   │   └── GroupNavItem[] (one per step group)
    │   │       ├── GroupIcon (category icon)
    │   │       ├── GroupLabel
    │   │       ├── GroupProgress "{n}/{m}"
    │   │       └── CollapsedStepList (step titles within group)
    │   └── SummaryStats
    │       ├── Badge "FIT: {n}"
    │       ├── Badge "CONFIGURE: {n}"
    │       ├── Badge "GAP: {n}"
    │       └── Badge "NA: {n}"
    └── ReviewContent
        ├── StepGroupContainer[] (one per group)
        │   ├── GroupHeader
        │   │   ├── GroupLabel + GroupIcon
        │   │   ├── GroupProgress
        │   │   └── CollapseToggle (for non-classifiable groups)
        │   └── StepCard[] (conditional rendering based on classifiability)
        │       ├── [if classifiable] StepReviewCardV2
        │       │   ├── DecisionSection (ABOVE content — decision-first)
        │       │   │   ├── FitStatusRadioGroup (FIT / CONFIGURE / GAP / NA)
        │       │   │   ├── ConfidenceBadgeGroup (high / medium / low)
        │       │   │   └── ContextualInputs
        │       │   │       ├── [if GAP] GapNoteTextarea (required, min 10 chars)
        │       │   │       ├── [if CONFIGURE] ConfigNoteTextarea
        │       │   │       └── [if any] CurrentProcessTextarea
        │       │   ├── SAPContentSection (BELOW decision — expandable)
        │       │   │   ├── PurposeBlock (always visible)
        │       │   │   ├── CollapsibleSection "Prerequisites" (collapsed by default)
        │       │   │   ├── CollapsibleSection "System Access" (collapsed by default)
        │       │   │   ├── CollapsibleSection "Roles" (collapsed by default)
        │       │   │   ├── CollapsibleSection "Master Data" (collapsed by default)
        │       │   │   ├── MainInstructionsBlock (always visible)
        │       │   │   └── [if test step] ExpectedResultBlock (always visible)
        │       │   ├── EvidenceSection
        │       │   │   ├── EvidenceUrlList (existing URLs)
        │       │   │   └── AddEvidenceButton → EvidenceUrlInput
        │       │   ├── ConfigActivitySummary (de-duplicated)
        │       │   │   └── ConfigActivityBadge[] (with SelfService explanation tooltip)
        │       │   └── ReviewStatusBadge (reviewed by / at)
        │       └── [if non-classifiable] ReferenceStepCard (compact)
        │           ├── StepSequence
        │           ├── ActionTitle
        │           ├── StepTypeBadge (REFERENCE / SYSTEM_ACCESS / TEST_INFO)
        │           └── ExpandToggle → InlineContentPreview
        └── NavigationFooter
            ├── Button "Previous Scope Item"
            ├── ProgressIndicator
            └── Button "Next Scope Item"
```

### Key Props

```typescript
interface ReviewClientV2Props {
  assessmentId: string;
  scopeItemId: string;
  scopeItemName: string;
  assessmentStatus: AssessmentStatus;
  groups: StepGroup[];
  progress: StepProgress;
  summary: StepSummary;
  userRole: UserRole;
  isReadOnly: boolean;
}

interface StepReviewCardV2Props {
  step: StepWithResponse;
  onResponseChange: (stepId: string, data: StepResponsePayload) => void;
  onReview: (stepId: string, approved: boolean) => void;
  isReadOnly: boolean;
  isItLead: boolean;
  isReviewer: boolean; // consultant/admin can review
}

interface ReferenceStepCardProps {
  step: StepWithResponse;
  isExpanded: boolean;
  onToggle: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  content: string; // HTML
  defaultOpen: boolean;
  icon?: React.ReactNode;
}
```

### State Management

```typescript
interface ReviewState {
  groups: StepGroup[];
  activeGroupKey: string;       // Currently visible group
  activeStepId: string | null;  // Currently focused step
  expandedRefSteps: Set<string>; // Expanded non-classifiable steps
  expandedSections: Map<string, Set<string>>; // stepId -> set of expanded section names
  progress: StepProgress;
  summary: StepSummary;
  pendingSaves: Map<string, NodeJS.Timeout>;
}
```

## 6. Business Logic (algorithms, state machines, validation rules)

### Step Type Classification Engine

```typescript
const STEP_TYPE_CLASSIFICATION: Record<string, { category: StepCategory; classifiable: boolean }> = {
  // Non-classifiable types
  "Information":     { category: "REFERENCE",      classifiable: false },
  "LogOn":           { category: "SYSTEM_ACCESS",   classifiable: false },
  "LogOff":          { category: "SYSTEM_ACCESS",   classifiable: false },
  "TestProcedure":   { category: "TEST_INFO",       classifiable: false },

  // Classifiable types
  "BusinessProcess": { category: "BUSINESS_PROCESS", classifiable: true },
  "Configuration":   { category: "CONFIGURATION",    classifiable: true },
  "Reporting":       { category: "REPORTING",         classifiable: true },
  "MasterData":      { category: "MASTER_DATA",       classifiable: true },  // conditionally classifiable

  // Fallback mappings for observed stepType variants
  "LOGON":           { category: "SYSTEM_ACCESS",   classifiable: false },
  "ACCESS_APP":      { category: "SYSTEM_ACCESS",   classifiable: false },
  "INFORMATION":     { category: "REFERENCE",       classifiable: false },
  "DATA_ENTRY":      { category: "BUSINESS_PROCESS", classifiable: true },
  "ACTION":          { category: "BUSINESS_PROCESS", classifiable: true },
  "VERIFICATION":    { category: "BUSINESS_PROCESS", classifiable: true },
  "NAVIGATION":      { category: "REFERENCE",       classifiable: false },
  "PROCESS_STEP":    { category: "BUSINESS_PROCESS", classifiable: true },
};

function classifyStep(step: { stepType: string; actionTitle: string }): {
  category: StepCategory;
  isClassifiable: boolean;
} {
  const mapping = STEP_TYPE_CLASSIFICATION[step.stepType];
  if (mapping) {
    return { category: mapping.category, isClassifiable: mapping.classifiable };
  }

  // Heuristic fallback for unknown step types
  const title = step.actionTitle.toLowerCase();
  if (title.includes("log on") || title.includes("logon") || title.includes("log off")) {
    return { category: "SYSTEM_ACCESS", isClassifiable: false };
  }
  if (title.includes("information") || title.includes("note:") || title.includes("reference")) {
    return { category: "REFERENCE", isClassifiable: false };
  }

  // Default: classifiable business process
  return { category: "BUSINESS_PROCESS", isClassifiable: true };
}
```

### Content Parser

```typescript
const SECTION_PATTERNS = [
  {
    name: "purpose" as const,
    patterns: [
      /(?:^|\n)\s*(?:purpose|overview|objective|description)\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*(?:prerequisite|system\s*access|role|master\s*data|step|instruction|procedure)|$)/i,
    ],
  },
  {
    name: "prerequisites" as const,
    patterns: [
      /(?:^|\n)\s*prerequisite[s]?\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*(?:system\s*access|role|master\s*data|step|instruction|procedure)|$)/i,
    ],
  },
  {
    name: "systemAccess" as const,
    patterns: [
      /(?:^|\n)\s*(?:system\s*access|log[io]n\s*(?:to|information))\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*(?:role|master\s*data|step|instruction|procedure)|$)/i,
    ],
  },
  {
    name: "roles" as const,
    patterns: [
      /(?:^|\n)\s*(?:role[s]?|authorization[s]?|required\s*role)\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*(?:master\s*data|step|instruction|procedure)|$)/i,
    ],
  },
  {
    name: "masterData" as const,
    patterns: [
      /(?:^|\n)\s*(?:master\s*data|data\s*requirement[s]?)\s*[:\-]?\s*\n?([\s\S]*?)(?=\n\s*(?:step|instruction|procedure)|$)/i,
    ],
  },
];

function parseStepContent(
  actionInstructionsHtml: string,
  actionExpectedResult: string | null,
): ParsedStepContent {
  // Strip HTML for regex matching, but preserve for display
  const plainText = stripHtml(actionInstructionsHtml);

  const extracted: Record<string, string | null> = {
    purpose: null,
    prerequisites: null,
    systemAccess: null,
    roles: null,
    masterData: null,
  };

  // Track matched ranges to extract remaining as mainInstructions
  const matchedRanges: Array<{ start: number; end: number }> = [];

  for (const section of SECTION_PATTERNS) {
    for (const pattern of section.patterns) {
      const match = pattern.exec(plainText);
      if (match && match[1]?.trim()) {
        extracted[section.name] = match[1].trim();
        matchedRanges.push({ start: match.index, end: match.index + match[0].length });
        break;
      }
    }
  }

  // mainInstructions = content not matched by any section
  // In practice, this is the bulk of the content for most steps
  const mainInstructions = removeMatchedRanges(actionInstructionsHtml, matchedRanges);

  return {
    purpose: extracted.purpose,
    prerequisites: extracted.prerequisites,
    systemAccess: extracted.systemAccess,
    roles: extracted.roles,
    masterData: extracted.masterData,
    mainInstructions: mainInstructions || actionInstructionsHtml,
    expectedResult: actionExpectedResult,
    rawHtml: actionInstructionsHtml,
  };
}
```

### Step Grouping Algorithm

```typescript
function computeStepGroups(
  steps: Array<{
    id: string;
    stepCategory: StepCategory;
    isClassifiable: boolean;
    activityTitle: string | null;
    sequence: number;
  }>,
): StepGroup[] {
  const groupMap = new Map<string, StepGroup>();

  for (const step of steps) {
    // Group key: "{category}:{activityTitle}"
    const activityKey = step.activityTitle ?? "ungrouped";
    const groupKey = `${step.stepCategory}:${activityKey}`;

    if (!groupMap.has(groupKey)) {
      const label = step.activityTitle
        ? `${formatCategory(step.stepCategory)} — ${step.activityTitle}`
        : formatCategory(step.stepCategory);

      groupMap.set(groupKey, {
        groupKey,
        groupLabel: label,
        category: step.stepCategory,
        isClassifiable: step.isClassifiable,
        steps: [],
      });
    }

    groupMap.get(groupKey)!.steps.push(step as StepWithResponse);
  }

  // Sort groups: classifiable first, then by first step sequence
  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => {
    if (a.isClassifiable !== b.isClassifiable) return a.isClassifiable ? -1 : 1;
    const aFirst = a.steps[0]?.sequence ?? 0;
    const bFirst = b.steps[0]?.sequence ?? 0;
    return aFirst - bFirst;
  });

  // Sort steps within each group by sequence
  for (const group of groups) {
    group.steps.sort((a, b) => a.sequence - b.sequence);
  }

  return groups;
}

function formatCategory(category: StepCategory): string {
  const labels: Record<StepCategory, string> = {
    BUSINESS_PROCESS: "Business Process",
    CONFIGURATION: "Configuration",
    REPORTING: "Reporting",
    REFERENCE: "Reference Information",
    SYSTEM_ACCESS: "System Access",
    TEST_INFO: "Test Information",
    MASTER_DATA: "Master Data",
  };
  return labels[category] ?? category;
}
```

### Enhanced Progress Counter

```typescript
function computeClassifiableProgress(
  steps: Array<{ isClassifiable: boolean; fitStatus: string }>,
): {
  totalSteps: number;
  classifiableSteps: number;
  respondedClassifiable: number;
  respondedTotal: number;
  percentComplete: number;
} {
  const classifiable = steps.filter((s) => s.isClassifiable);
  const respondedClassifiable = classifiable.filter((s) => s.fitStatus !== "PENDING").length;

  return {
    totalSteps: steps.length,
    classifiableSteps: classifiable.length,
    respondedClassifiable,
    respondedTotal: steps.filter((s) => s.fitStatus !== "PENDING").length,
    percentComplete: classifiable.length > 0
      ? Math.round((respondedClassifiable / classifiable.length) * 100)
      : 100,
  };
}
```

### Config Activity De-duplication

```typescript
function deduplicateConfigs(
  configs: Array<{ id: string; configItemName: string; scopeItemId: string; selfService: boolean }>,
): Array<{ id: string; configItemName: string; selfService: boolean; count: number }> {
  const seen = new Map<string, { id: string; configItemName: string; selfService: boolean; count: number }>();

  for (const config of configs) {
    const key = config.configItemName.toLowerCase().trim();
    const existing = seen.get(key);
    if (existing) {
      existing.count++;
    } else {
      seen.set(key, {
        id: config.id,
        configItemName: config.configItemName,
        selfService: config.selfService,
        count: 1,
      });
    }
  }

  return Array.from(seen.values());
}
```

## 7. Permissions & Access Control (role x action matrix)

| Action | admin | consultant | process_owner | it_lead | executive |
|---|---|---|---|---|---|
| View steps + parsed content | Yes | Yes | Yes (own area) | Yes (own assessment) | Yes (own assessment) |
| Set fitStatus | Yes | Yes | Yes (own area) | No | No |
| Set confidence | Yes | Yes | Yes (own area) | No | No |
| Add evidence URLs | Yes | Yes | Yes (own area) | Yes (notes-only) | No |
| Set clientNote | Yes | Yes | Yes (own area) | Yes | No |
| Review (sign-off) a step | Yes | Yes | No | No | No |
| Run classification engine | Yes | No | No | No | No |
| Run content parser | Yes | No | No | No | No |

**Notes**:
- IT leads can add evidence URLs and client notes but cannot change fitStatus or confidence. This extends the existing pattern where IT leads have notes-only access.
- Review sign-off is a consultant/admin function that marks a step response as reviewed. This is separate from the overall assessment status transitions.
- The classification engine and content parser are admin-only batch operations run during or after data import.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients | Template |
|---|---|---|---|
| Step response saved | In-app status indicator | Current user | "Saved" (auto-save indicator) |
| Step reviewed by consultant | In-app toast | Current user | "Step '{title}' marked as reviewed" |
| All classifiable steps reviewed for a scope item | In-app toast + badge | Current user | "All classifiable steps reviewed for {scopeItem}!" |
| Low confidence response submitted | In-app inline indicator | Current user + reviewers | Yellow "Low confidence" badge on step card |
| GAP response without evidence | In-app inline suggestion | Current user | "Consider adding evidence URLs to support this gap assessment" |
| Classification engine completed | In-app toast (admin) | Admin user | "Classified {N} process steps. Breakdown: {summary}" |

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| `stepType` not found in classification map | Fallback heuristic based on `actionTitle` keywords. If no match, default to BUSINESS_PROCESS + classifiable=true. Log as warning for admin review. |
| `actionInstructionsHtml` contains no parseable sections | `parsedContent.mainInstructions` = full HTML. All section fields are null. Card renders with full content visible (no collapsible sections). |
| `actionInstructionsHtml` is empty | Show "No content available for this step" placeholder. Step is still classifiable if its stepType maps to a classifiable category. |
| Evidence URL is not a valid URL | Zod rejects with validation error. Client-side validates before submission with `URL` constructor. |
| Evidence URL returns 404 after being added | URLs are stored as-is without validation of reachability. The evidence section shows a "link may be broken" indicator if a user reports it, but no automatic checking. |
| Step response reviewed, then fitStatus changed | Clear `reviewedBy` and `reviewedAt` when fitStatus changes. Response must be re-reviewed. |
| MasterData step classified as "conditionally classifiable" | MasterData steps default to classifiable=true. If the step's actionTitle contains "reference only" or "informational", set classifiable=false. This is handled by the classification engine. |
| Content parser regex matches overlap | Prioritize later section matches over earlier ones. Use non-greedy matching. If overlaps persist, the first match wins and the remaining content goes to mainInstructions. |
| Extremely long `actionInstructionsHtml` (>100KB) | Truncate parsed content sections at 10KB each. The rawHtml is preserved in full. UI shows "Content truncated" indicator. |
| Process step belongs to a scope item not in the assessment's scope | Should not happen (steps are loaded per selected scope item). If it does, skip the step and log a warning. |
| Admin runs classification on 5000+ steps | Use batched processing with `prisma.$transaction` in chunks of 100. Show progress indicator. |

## 10. Performance Considerations

- **Pre-computation**: The classification engine and content parser run at import time (or via admin batch endpoint), storing results in `stepCategory`, `isClassifiable`, `parsedContent`, `groupKey`, `groupLabel`. This avoids runtime computation on every page load.
- **Lazy loading of parsedContent**: The `parsedContent` JSON column can be large. The GET endpoint should not include `rawHtml` in the response unless specifically requested. Use Prisma `select` to exclude it.
- **Group-based pagination**: For scope items with 100+ steps, load groups lazily. Initially load the first group; load subsequent groups on demand as the user scrolls or clicks in the sidebar navigation.
- **Config activity query**: Use a single batch query with `scopeItemId IN (...)` to load all config activities for a scope item's steps, then distribute to steps client-side. Avoid N+1 queries.
- **Debounced auto-save**: Continue using the existing 1000ms debounce pattern for step response saves.
- **Parsed content cache**: `parsedContent` is stored as JSON in Prisma. For a typical step, this is 2-5KB. For 60 steps in a scope item, the total payload is ~200KB, which is acceptable.
- **Step classification index**: `@@index([scopeItemId, stepCategory])` enables efficient queries for "all BUSINESS_PROCESS steps in scope item J14".

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

```
describe("classifyStep", () => {
  it("classifies 'Information' as REFERENCE, non-classifiable")
  it("classifies 'LogOn' as SYSTEM_ACCESS, non-classifiable")
  it("classifies 'LogOff' as SYSTEM_ACCESS, non-classifiable")
  it("classifies 'TestProcedure' as TEST_INFO, non-classifiable")
  it("classifies 'BusinessProcess' as BUSINESS_PROCESS, classifiable")
  it("classifies 'Configuration' as CONFIGURATION, classifiable")
  it("classifies 'Reporting' as REPORTING, classifiable")
  it("classifies 'MasterData' as MASTER_DATA, classifiable")
  it("falls back to heuristic for unknown stepType 'CustomAction'")
  it("handles case-insensitive stepType matching")
  it("handles uppercase stepType variants (LOGON, INFORMATION, etc.)")
})

describe("parseStepContent", () => {
  it("extracts purpose section from HTML content")
  it("extracts prerequisites section")
  it("extracts system access section")
  it("extracts roles section")
  it("extracts master data section")
  it("puts remaining content in mainInstructions")
  it("returns full HTML as mainInstructions when no sections detected")
  it("handles empty actionInstructionsHtml")
  it("preserves HTML formatting in extracted sections")
  it("handles content with multiple section markers")
  it("does not extract from within HTML attributes or script tags")
})

describe("computeStepGroups", () => {
  it("groups steps by category + activityTitle")
  it("sorts groups with classifiable first")
  it("sorts steps within groups by sequence")
  it("creates 'ungrouped' group for steps without activityTitle")
  it("handles single-step groups")
  it("handles all steps in same category")
})

describe("computeClassifiableProgress", () => {
  it("counts only classifiable steps for progress")
  it("returns 100% when all classifiable steps are responded")
  it("returns 0% when no classifiable steps are responded")
  it("excludes non-classifiable steps from percentage")
  it("returns 100% when there are no classifiable steps")
})

describe("deduplicateConfigs", () => {
  it("deduplicates by configItemName (case-insensitive)")
  it("preserves selfService flag from first occurrence")
  it("counts duplicates correctly")
  it("handles empty config array")
})
```

### Integration Tests

```
describe("PUT /api/assessments/[id]/steps/[stepId] (V2)", () => {
  it("accepts and persists confidence field")
  it("accepts and persists evidenceUrls array")
  it("rejects evidenceUrls with invalid URLs")
  it("rejects more than 10 evidence URLs")
  it("clears reviewedBy/reviewedAt when fitStatus changes")
  it("preserves existing behavior for GAP note validation")
})

describe("PUT /api/assessments/[id]/steps/[stepId]/review", () => {
  it("sets reviewedBy and reviewedAt on step response")
  it("returns 403 for process_owner role")
  it("returns 404 when step has no response to review")
  it("logs decision entry for review action")
})

describe("GET /api/assessments/[id]/steps (V2)", () => {
  it("returns grouped steps with classification data")
  it("includes parsed content in step data")
  it("returns accurate classifiable progress counts")
  it("filters non-classifiable steps when includeNonClassifiable=false")
  it("groups by category by default")
  it("groups by activity when groupBy=activity")
})

describe("POST /api/admin/process-steps/classify", () => {
  it("classifies all steps and returns breakdown")
  it("skips already-classified steps when force=false")
  it("re-classifies all steps when force=true")
  it("handles unknown step types with fallback")
  it("returns 403 for non-admin role")
})

describe("POST /api/admin/process-steps/parse-content", () => {
  it("parses all step content and stores as JSON")
  it("handles steps with no parseable sections")
  it("returns error count for unparseable content")
})
```

### E2E Tests (Playwright)

```
describe("Step Review V2 Flow", () => {
  it("renders decision buttons above SAP content (decision-first layout)")
  it("shows segmented progress bar counting only classifiable steps")
  it("groups steps by category with collapsible group headers")
  it("renders non-classifiable steps as compact reference cards")
  it("expands reference step card on click to show content preview")
  it("collapses Prerequisites section by default, expands on click")
  it("shows confidence selector after fitStatus selection")
  it("allows adding evidence URLs with validation")
  it("consultant can review/sign-off on individual step responses")
  it("review badge appears after consultant review")
  it("config activities are de-duplicated with count badge")
  it("Self-Service config activity shows tooltip explanation")
  it("progress bar updates correctly when classifying steps")
  it("sidebar navigation scrolls to group on click")
})
```

## 12. Migration & Seed Data

### Prisma Migration

```sql
-- AlterTable: Add enrichment columns to StepResponse
ALTER TABLE "StepResponse" ADD COLUMN "confidence" TEXT;
ALTER TABLE "StepResponse" ADD COLUMN "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "StepResponse" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "StepResponse" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- AlterTable: Add classification columns to ProcessStep
ALTER TABLE "ProcessStep" ADD COLUMN "stepCategory" TEXT;
ALTER TABLE "ProcessStep" ADD COLUMN "parsedContent" JSONB;
ALTER TABLE "ProcessStep" ADD COLUMN "isClassifiable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ProcessStep" ADD COLUMN "groupKey" TEXT;
ALTER TABLE "ProcessStep" ADD COLUMN "groupLabel" TEXT;

-- CreateIndex: Classification indexes
CREATE INDEX "ProcessStep_stepCategory_idx" ON "ProcessStep"("stepCategory");
CREATE INDEX "ProcessStep_groupKey_idx" ON "ProcessStep"("groupKey");
CREATE INDEX "ProcessStep_scopeItemId_stepCategory_idx" ON "ProcessStep"("scopeItemId", "stepCategory");
```

### Post-Migration Data Population

After migration, run the classification engine and content parser as admin batch operations:

```typescript
// Step 1: Classify all process steps
// POST /api/admin/process-steps/classify { force: true }

// Step 2: Parse all step content
// POST /api/admin/process-steps/parse-content { force: true }
```

This populates `stepCategory`, `isClassifiable`, `parsedContent`, `groupKey`, and `groupLabel` for all existing process steps. For the MY/2508 catalog (~5000 steps), this should complete in <30 seconds.

### Seed Data Updates

```typescript
// Update seed script to include classification data on demo steps
// The classification engine will be run automatically post-seed
```

## 13. Open Questions (numbered, with recommended answers)

1. **Should the content parser run at import time or on-demand?**
   - Recommended: At import time. Store the parsed content in the `parsedContent` JSON column during the ingest pipeline. This avoids runtime regex execution on every page load and ensures consistent parsing across all users. Provide the admin batch endpoint as a fallback for re-parsing.

2. **Should MasterData steps always be classifiable?**
   - Recommended: Default to classifiable=true, with a heuristic exception. If the step's `actionTitle` contains phrases like "reference only", "informational", "note:", or "see also", set classifiable=false. This handles the common case where MasterData steps are informational rather than actionable.

3. **Should the decision-first layout be configurable (some users might prefer content-first)?**
   - Recommended: No. Use decision-first as the default and only layout. User research on FTS worksheets shows that users scan content, then make a decision. Placing the decision controls first reduces scroll distance and speeds up the review process. If feedback strongly favors content-first, this can be revisited as a user preference toggle in a future phase.

4. **Should evidence URLs support file uploads in addition to URLs?**
   - Recommended: URLs only for V2. File upload introduces storage infrastructure (S3/Vercel Blob), file type validation, and size limits. URLs can point to SharePoint, Google Drive, or any shared document. File upload can be added in a later phase.

5. **How should the classification engine handle the same stepType mapping differently across SAP versions?**
   - Recommended: The current classification map is version-agnostic. If different SAP versions introduce new step types, add them to the map. The fallback heuristic ensures new types are handled gracefully. Version-specific classification is not needed for V2.

6. **Should the review sign-off be per step or per scope item?**
   - Recommended: Per step. Per-scope-item review is too coarse — a consultant may want to approve some responses while flagging others for rework. Per-step granularity gives precise control.

7. **Should non-classifiable steps still be visible by default or hidden behind a toggle?**
   - Recommended: Visible but collapsed. Non-classifiable steps are rendered as compact single-line items within their group. The group itself is collapsible. This ensures consultants can still see the full step list but non-classifiable steps don't dominate the UI.

8. **What is the performance impact of storing parsedContent as JSONB for ~5000 rows?**
   - Recommended: Negligible. At ~3KB per row average, 5000 rows = ~15MB of JSONB data. PostgreSQL handles this efficiently. The JSONB column is only loaded when viewing individual scope item steps (typically 30-80 rows at a time).

## 14. Acceptance Criteria (Given/When/Then)

### AC-12.1: Decision-first card layout
```
Given I am reviewing step "Create Sales Order" (classifiable, BUSINESS_PROCESS)
When the StepReviewCardV2 renders
Then the FIT/CONFIGURE/GAP/NA radio buttons appear at the top of the card
And the SAP content sections appear below the decision buttons
And the Prerequisites section is collapsed by default
And the Purpose section is visible by default
```

### AC-12.2: Non-classifiable step compact rendering
```
Given scope item "J14" has 56 total steps, 35 of which are classifiable
And 21 steps are Information/LogOn/LogOff/TestProcedure types
When I view the step review page
Then the 35 classifiable steps render as full StepReviewCardV2 components
And the 21 non-classifiable steps render as compact ReferenceStepCard components
And the progress bar shows "0 of 35 classifiable steps reviewed"
```

### AC-12.3: Step grouping and navigation
```
Given scope item "J14" has steps in categories: SYSTEM_ACCESS (3), BUSINESS_PROCESS (25), CONFIGURATION (5), REFERENCE (2)
When the review page loads
Then the sidebar shows 4 group entries (classifiable groups first)
And I can click a group to scroll to that section
And each group header shows the group progress (e.g., "0/25" for Business Process)
```

### AC-12.4: Confidence and evidence on step response
```
Given I am a process_owner reviewing step "Create Sales Order"
When I select fitStatus = "GAP" and enter a gap note
And I set confidence to "medium"
And I add two evidence URLs
Then the response is saved with all fields
And the confidence badge shows "Medium confidence"
And the evidence URLs are displayed as clickable links
```

### AC-12.5: Consultant review sign-off
```
Given a process_owner has submitted a step response with fitStatus = "GAP"
When a consultant clicks "Review" on that step
Then the response is marked as reviewed with the consultant's identity and timestamp
And a "Reviewed by {name}" badge appears on the step card
And a DecisionLogEntry is created for the review action
```

### AC-12.6: Review cleared on fitStatus change
```
Given step "Create Sales Order" has been reviewed by consultant
When the process_owner changes fitStatus from "GAP" to "CONFIGURE"
Then reviewedBy is cleared to null
And reviewedAt is cleared to null
And the "Reviewed" badge disappears
And the step must be re-reviewed by a consultant
```

### AC-12.7: Classifiable progress accuracy
```
Given scope item "J14" has 56 total steps (35 classifiable)
And 20 classifiable steps have been responded to
When I view the progress indicator
Then it shows "20 of 35" (not "20 of 56")
And the percentage shows 57% (not 36%)
```

### AC-12.8: Content parser extracts sections
```
Given a process step's actionInstructionsHtml contains sections labeled "Prerequisites:", "System Access:", "Roles:", and main content
When the content parser runs
Then parsedContent.prerequisites contains the prerequisites text
And parsedContent.systemAccess contains the system access text
And parsedContent.roles contains the roles text
And parsedContent.mainInstructions contains the remaining content
And the UI renders prerequisites in a collapsed CollapsibleSection
```

### AC-12.9: Config activity de-duplication
```
Given step "Create Sales Order" is associated with 3 config activities
And 2 of them share the same configItemName "Sales Document Types"
When the config activities section renders
Then only 2 unique config activities are shown
And "Sales Document Types" shows a "(x2)" count badge
And Self-Service activities show a tooltip: "This activity can be configured by key users in the Self-Service Configuration UI"
```

## 15. Size Estimate

| Category | Estimate |
|---|---|
| **T-shirt size** | **L** |
| Schema changes + migration | 1 day |
| Classification engine + content parser | 2 days |
| Step grouping algorithm | 0.5 day |
| API route extensions (steps, review) | 2 days |
| Admin batch endpoints (classify, parse) | 1 day |
| StepReviewCardV2 (decision-first layout) | 2 days |
| ReferenceStepCard (compact rendering) | 0.5 day |
| CollapsibleSection component | 0.5 day |
| ReviewClientV2 (grouping, sidebar, progress) | 2.5 days |
| Evidence URL management | 0.5 day |
| Config activity de-duplication + tooltips | 0.5 day |
| Tests (unit + integration + e2e) | 3 days |
| **Total** | **16 days** |

## 16. Phase Completion Checklist

- [ ] Prisma migration adds confidence, evidenceUrls, reviewedBy, reviewedAt to StepResponse
- [ ] Prisma migration adds stepCategory, parsedContent, isClassifiable, groupKey, groupLabel to ProcessStep
- [ ] New indexes created for stepCategory, groupKey, scopeItemId+stepCategory
- [ ] `classifyStep` function implemented with complete stepType mapping + fallback heuristics
- [ ] `parseStepContent` function implemented with regex-based section extraction
- [ ] `computeStepGroups` function groups steps by category + activity
- [ ] `computeClassifiableProgress` counts only classifiable steps
- [ ] `deduplicateConfigs` removes duplicate config activities
- [ ] `PUT /api/assessments/[id]/steps/[stepId]` extended with confidence and evidenceUrls
- [ ] `PUT /api/assessments/[id]/steps/[stepId]/review` implemented for consultant review
- [ ] `GET /api/assessments/[id]/steps` extended with groups, progress, and parsed content
- [ ] `POST /api/admin/process-steps/classify` batch classification endpoint
- [ ] `POST /api/admin/process-steps/parse-content` batch parsing endpoint
- [ ] `StepReviewCardV2` renders decision-first layout
- [ ] `ReferenceStepCard` renders compact single-line for non-classifiable steps
- [ ] `CollapsibleSection` component for Prerequisites, Roles, etc.
- [ ] `ReviewClientV2` with group-based navigation sidebar
- [ ] `ClassifiableProgressBar` shows accurate classifiable-only progress
- [ ] Evidence URL list with add/remove functionality
- [ ] Config activities de-duplicated with count badges
- [ ] Self-Service tooltip on config activity badges
- [ ] Review sign-off badge on reviewed steps
- [ ] Review cleared when fitStatus changes
- [ ] IT lead can add evidence URLs and notes but not change fitStatus/confidence
- [ ] Admin batch endpoints work for full catalog (~5000 steps)
- [ ] All unit tests pass (classifyStep, parseStepContent, computeStepGroups, etc.)
- [ ] All integration tests pass (API routes)
- [ ] E2E tests cover decision-first layout, grouping, progress, evidence, and review flows
