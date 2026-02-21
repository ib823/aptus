# Phase 10: Company Profile Enrichment

## 1. Overview

Enrich the assessment company profile beyond the current basic fields (companyName, industry, country, operatingCountries, companySize, revenueBand, currentErp). Add structured data capture for: number of employees, annual revenue with currency, ERP go-live timeline, deployment model (cloud/hybrid/on-prem target), SAP modules of interest, key business processes, geographic distribution details, language requirements, regulatory environment, IT landscape summary, current ERP version, and migration approach (greenfield/brownfield/selective).

The enriched profile serves two purposes:
1. **Assessment context**: Richer metadata drives smarter scope pre-selection, effort estimation, and reporting.
2. **Gating mechanism**: Profile completeness gates the transition from "draft" to "in_progress", ensuring consultants and stakeholders have sufficient context before beginning scope selection.

**Source**: V2 Brief Section A5.1

## 2. Dependencies

| Dependency | Type | Status | Notes |
|---|---|---|---|
| Prisma schema (Assessment model) | Internal | Exists | Add new nullable columns to existing model |
| `PUT /api/assessments/[id]` route | Internal | Exists | Currently only handles status transitions; extend or add sibling route |
| `canTransitionStatus` permission check | Internal | Exists | Must add profile completeness gate for `draft -> in_progress` |
| `CompanyProfileForm` component | Internal | Exists | Currently captures only basic fields; replace with enriched form |
| shadcn/ui form primitives | External | Exists | `Input`, `Select`, `Textarea`, `Checkbox`, `DatePicker` |
| ISO 4217 currency codes | External | Static | Embed a subset (~30 common currencies) as a constant |
| ISO 639-1 language codes | External | Static | Embed a subset (~20 common languages) as a constant |

No blocking external dependencies. All changes are additive (new nullable columns).

## 3. Data Model Changes (Prisma syntax)

```prisma
// Add to existing Assessment model

model Assessment {
  // ... existing fields ...

  // ── V2 Phase 10: Company Profile Enrichment ──
  employeeCount        Int?
  annualRevenue        Float?
  currencyCode         String?    @default("USD")
  targetGoLiveDate     DateTime?
  deploymentModel      String?    // "public_cloud" | "private_cloud" | "hybrid"
  sapModules           String[]   @default([])
  keyProcesses         String[]   @default([])
  languageRequirements String[]   @default([])
  regulatoryFrameworks String[]   @default([])
  itLandscapeSummary   String?    @db.Text
  currentErpVersion    String?
  migrationApproach    String?    // "greenfield" | "brownfield" | "selective"
  profileCompletedAt   DateTime?
  profileCompletedBy   String?
}
```

**Migration notes**:
- All new columns are nullable or have defaults, so migration is non-destructive.
- No new tables required.
- No new indexes required (these fields are not queried in WHERE clauses at scale).

## 4. API Routes (method, path, request/response with Zod schemas)

### GET /api/assessments/[id]/profile

Returns the enriched company profile for an assessment.

```typescript
// Request: No body. Path param: id (assessment CUID)
// Headers: Cookie session token

// Response 200:
interface ProfileResponse {
  data: {
    id: string;
    companyName: string;
    industry: string;
    country: string;
    operatingCountries: string[];
    companySize: string;
    revenueBand: string | null;
    currentErp: string | null;
    sapVersion: string;
    // V2 enrichment fields
    employeeCount: number | null;
    annualRevenue: number | null;
    currencyCode: string | null;
    targetGoLiveDate: string | null; // ISO 8601
    deploymentModel: string | null;
    sapModules: string[];
    keyProcesses: string[];
    languageRequirements: string[];
    regulatoryFrameworks: string[];
    itLandscapeSummary: string | null;
    currentErpVersion: string | null;
    migrationApproach: string | null;
    profileCompletedAt: string | null;
    profileCompletedBy: string | null;
    // Computed
    completenessScore: number; // 0-100
    completenessBreakdown: Record<string, boolean>;
  };
}

// Response 401: { error: { code: "UNAUTHORIZED", message: string } }
// Response 403: { error: { code: "FORBIDDEN" | "MFA_REQUIRED", message: string } }
// Response 404: { error: { code: "NOT_FOUND", message: string } }
```

### PUT /api/assessments/[id]/profile

Updates the enriched company profile.

```typescript
// Zod request schema
const profileUpdateSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  industry: z.string().min(1).max(100).optional(),
  country: z.string().min(2).max(10).optional(),
  operatingCountries: z.array(z.string().min(2).max(10)).optional(),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]).optional(),
  revenueBand: z.string().max(50).nullable().optional(),
  currentErp: z.string().max(100).nullable().optional(),
  employeeCount: z.number().int().min(1).max(10_000_000).nullable().optional(),
  annualRevenue: z.number().min(0).max(1_000_000_000_000).nullable().optional(),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).nullable().optional(),
  targetGoLiveDate: z.string().datetime().nullable().optional(),
  deploymentModel: z.enum(["public_cloud", "private_cloud", "hybrid"]).nullable().optional(),
  sapModules: z.array(z.string().max(50)).max(50).optional(),
  keyProcesses: z.array(z.string().max(100)).max(50).optional(),
  languageRequirements: z.array(z.string().min(2).max(10)).max(20).optional(),
  regulatoryFrameworks: z.array(z.string().max(100)).max(20).optional(),
  itLandscapeSummary: z.string().max(10_000).nullable().optional(),
  currentErpVersion: z.string().max(50).nullable().optional(),
  migrationApproach: z.enum(["greenfield", "brownfield", "selective"]).nullable().optional(),
});

// Response 200:
interface ProfileUpdateResponse {
  data: {
    // Same shape as GET response data
    id: string;
    // ... all profile fields ...
    completenessScore: number;
    completenessBreakdown: Record<string, boolean>;
  };
}

// Response 400: { error: { code: "VALIDATION_ERROR", message: string, details: Record<string, string> } }
// Response 401: { error: { code: "UNAUTHORIZED", message: string } }
// Response 403: { error: { code: "FORBIDDEN" | "MFA_REQUIRED", message: string } }
// Response 404: { error: { code: "NOT_FOUND", message: string } }
```

## 5. UI Components (component tree, props, state)

### Component Tree

```
AssessmentProfilePage (RSC)
└── CompanyProfileFormV2 (client)
    ├── ProfileCompletenessBar
    │   └── Progress (shadcn)
    ├── BasicInfoSection
    │   ├── Input (companyName)
    │   ├── IndustrySelect (industry — links to IndustryProfile codes)
    │   ├── CountrySelect (country)
    │   ├── MultiCountrySelect (operatingCountries)
    │   ├── CompanySizeSelect (companySize)
    │   └── RevenueBandSelect (revenueBand)
    ├── FinancialSection
    │   ├── Input (employeeCount — number)
    │   ├── Input (annualRevenue — number)
    │   └── CurrencySelect (currencyCode)
    ├── SAPStrategySection
    │   ├── DatePicker (targetGoLiveDate)
    │   ├── DeploymentModelRadioGroup (deploymentModel)
    │   ├── MigrationApproachRadioGroup (migrationApproach)
    │   ├── ModuleMultiSelect (sapModules — checkbox list)
    │   └── Input (currentErpVersion)
    ├── OperationalSection
    │   ├── TagInput (keyProcesses — free-text tags)
    │   ├── LanguageMultiSelect (languageRequirements)
    │   └── TagInput (regulatoryFrameworks — free-text tags)
    ├── ITLandscapeSection
    │   └── Textarea (itLandscapeSummary)
    └── FormActions
        ├── Button "Save Draft"
        └── Button "Save & Continue to Scope Selection" (disabled if completeness < threshold)
```

### Key Props & State

```typescript
interface CompanyProfileFormV2Props {
  assessmentId: string;
  initialData: ProfileData;
  assessmentStatus: AssessmentStatus;
  isReadOnly: boolean; // true for signed_off/reviewed
}

// Internal state
interface ProfileFormState {
  formData: Partial<ProfileUpdatePayload>;
  isDirty: boolean;
  isSaving: boolean;
  completenessScore: number;
  completenessBreakdown: Record<string, boolean>;
  validationErrors: Record<string, string>;
}
```

### ProfileCompletenessBar

```typescript
interface ProfileCompletenessBarProps {
  score: number;             // 0-100
  breakdown: Record<string, boolean>;
  requiredThreshold: number; // default 60
}
```

Renders a segmented progress bar where each segment represents a profile field group (basic, financial, SAP strategy, operational, IT landscape). Segments light up as groups are completed. Shows "X% complete" label and lists missing fields when hovered.

## 6. Business Logic (algorithms, state machines, validation rules)

### Profile Completeness Score

The completeness score is computed as a weighted percentage across field groups:

```typescript
interface FieldWeight {
  field: string;
  weight: number;
  check: (assessment: Assessment) => boolean;
}

const PROFILE_FIELDS: FieldWeight[] = [
  // Basic (30% total)
  { field: "companyName",        weight: 8,  check: (a) => !!a.companyName },
  { field: "industry",           weight: 6,  check: (a) => !!a.industry },
  { field: "country",            weight: 6,  check: (a) => !!a.country },
  { field: "companySize",        weight: 5,  check: (a) => !!a.companySize },
  { field: "operatingCountries", weight: 5,  check: (a) => a.operatingCountries.length > 0 },

  // Financial (15% total)
  { field: "employeeCount",      weight: 8,  check: (a) => a.employeeCount !== null && a.employeeCount > 0 },
  { field: "annualRevenue",      weight: 7,  check: (a) => a.annualRevenue !== null && a.annualRevenue > 0 },

  // SAP Strategy (30% total)
  { field: "targetGoLiveDate",   weight: 8,  check: (a) => a.targetGoLiveDate !== null },
  { field: "deploymentModel",    weight: 8,  check: (a) => !!a.deploymentModel },
  { field: "migrationApproach",  weight: 7,  check: (a) => !!a.migrationApproach },
  { field: "sapModules",         weight: 7,  check: (a) => a.sapModules.length > 0 },

  // Operational (15% total)
  { field: "keyProcesses",         weight: 5,  check: (a) => a.keyProcesses.length > 0 },
  { field: "languageRequirements", weight: 5,  check: (a) => a.languageRequirements.length > 0 },
  { field: "regulatoryFrameworks", weight: 5,  check: (a) => a.regulatoryFrameworks.length > 0 },

  // IT Landscape (10% total)
  { field: "itLandscapeSummary", weight: 5,  check: (a) => !!a.itLandscapeSummary && a.itLandscapeSummary.length >= 50 },
  { field: "currentErpVersion",  weight: 5,  check: (a) => !!a.currentErpVersion },
];

function computeCompletenessScore(assessment: Assessment): {
  score: number;
  breakdown: Record<string, boolean>;
} {
  let totalWeight = 0;
  let achievedWeight = 0;
  const breakdown: Record<string, boolean> = {};

  for (const field of PROFILE_FIELDS) {
    totalWeight += field.weight;
    const passed = field.check(assessment);
    breakdown[field.field] = passed;
    if (passed) achievedWeight += field.weight;
  }

  return {
    score: Math.round((achievedWeight / totalWeight) * 100),
    breakdown,
  };
}
```

### Draft-to-InProgress Gating

The existing `canTransitionStatus` function must be augmented with a profile completeness check:

```typescript
// In canTransitionStatus, add for "draft->in_progress":
if (fromStatus === "draft" && toStatus === "in_progress") {
  const { score } = computeCompletenessScore(assessment);
  if (score < MINIMUM_PROFILE_COMPLETENESS) {
    return {
      allowed: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `Profile must be at least ${MINIMUM_PROFILE_COMPLETENESS}% complete to begin assessment. Current: ${score}%.`,
    };
  }
}

const MINIMUM_PROFILE_COMPLETENESS = 60;
```

### Validation Rules

| Field | Rule |
|---|---|
| employeeCount | Integer, 1 <= value <= 10,000,000 |
| annualRevenue | Float, >= 0 |
| currencyCode | Exactly 3 uppercase ASCII letters (ISO 4217) |
| targetGoLiveDate | Must be a future date (at least 30 days from now) |
| deploymentModel | One of: "public_cloud", "private_cloud", "hybrid" |
| migrationApproach | One of: "greenfield", "brownfield", "selective" |
| sapModules | Array of strings, max 50 items, each max 50 chars |
| keyProcesses | Array of strings, max 50 items, each max 100 chars |
| languageRequirements | Array of ISO 639-1 codes (2 chars), max 20 |
| regulatoryFrameworks | Array of strings, max 20 items, each max 100 chars |
| itLandscapeSummary | Free text, max 10,000 chars |
| currentErpVersion | String, max 50 chars |

### Auto-save Behavior

The form implements debounced auto-save (1500ms after last keystroke) on every field change, using the existing pattern from `ScopeSelectionClient`. A "Save" indicator appears in the header showing save state: idle / saving / saved / error.

## 7. Permissions & Access Control (role x action matrix)

| Action | admin | consultant | process_owner | it_lead | executive |
|---|---|---|---|---|---|
| View profile | Yes | Yes (own org) | Yes (own assessment) | Yes (own assessment) | Yes (own assessment) |
| Edit profile (basic fields) | Yes | Yes | No | No | No |
| Edit profile (enrichment fields) | Yes | Yes | No | No | No |
| Trigger draft->in_progress | Yes | Yes | No | No | No |

**Notes**:
- Process owners, IT leads, and executives can view the profile but cannot edit it. The form renders in read-only mode for these roles.
- Organization isolation: consultants can only access assessments within their organization. This is enforced by the existing `organizationId` check.

## 8. Notification Triggers (event -> channel -> recipient matrix)

| Event | Channel | Recipients | Template |
|---|---|---|---|
| Profile completeness reaches 100% | In-app toast | Current user | "Company profile is complete. You can now start the assessment." |
| Profile saved (auto-save) | In-app status indicator | Current user | "Saved" / "Saving..." / "Error saving" |
| Draft->in_progress blocked by profile | In-app toast + inline error | Current user | "Profile must be at least 60% complete. Missing: [field list]" |

No email notifications in this phase. All notifications are UI-only.

## 9. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User enters targetGoLiveDate in the past | Client-side validation rejects; server-side Zod refine rejects with message "Go-live date must be at least 30 days in the future" |
| User enters annualRevenue = 0 | Allowed (some pre-revenue companies). Completeness check requires > 0 for credit. |
| User pastes HTML into itLandscapeSummary | Server strips HTML tags before storage; sanitize on render. |
| User enters non-ISO currency code | Zod regex rejects; client-side Select component constrains to valid options. |
| Concurrent edits by two consultants | Last-write-wins with updatedAt timestamp. No optimistic locking in this phase. DecisionLogEntry captures both edits for audit. |
| Assessment is in "signed_off" status | Profile is read-only. PUT returns 403 with message "Cannot modify a signed-off assessment." |
| Network failure during auto-save | UI shows error indicator with "Retry" button. Unsaved changes are preserved in local state. |
| sapModules contains duplicates | Server de-duplicates array before storage. |
| operatingCountries is empty | Allowed but reduces completeness score. At least `country` (primary) is required. |

## 10. Performance Considerations

- **Query efficiency**: The GET endpoint selects only the profile columns needed, not the full assessment with relations. Use Prisma `select` to avoid loading stakeholders, scopeSelections, etc.
- **Auto-save throttling**: Debounce at 1500ms to avoid excessive PUT requests during rapid typing.
- **No new indexes**: The enriched fields are not used in WHERE clauses or JOINs. The existing `@@index([status])` and `@@index([organizationId])` are sufficient.
- **Payload size**: The profile response is ~2KB max. No pagination needed.
- **Array fields**: sapModules, keyProcesses, etc. are stored as PostgreSQL text arrays. These are efficient for small arrays (<50 items) but should not be used in WHERE clauses with `@>` operators at scale.

## 11. Testing Strategy (unit, integration, e2e scenarios)

### Unit Tests

```
describe("computeCompletenessScore", () => {
  it("returns 0 for empty assessment")
  it("returns 100 for fully populated assessment")
  it("correctly weights basic fields at ~30%")
  it("correctly weights SAP strategy fields at ~30%")
  it("marks itLandscapeSummary incomplete if < 50 chars")
  it("marks employeeCount incomplete if null or 0")
  it("handles edge case of annualRevenue = 0 (valid but incomplete)")
})

describe("profileUpdateSchema (Zod)", () => {
  it("accepts valid partial update with only companyName")
  it("rejects employeeCount = -1")
  it("rejects employeeCount = 10_000_001")
  it("rejects currencyCode = 'us' (not 3 uppercase)")
  it("rejects targetGoLiveDate in the past")
  it("accepts targetGoLiveDate null (clearing the field)")
  it("rejects sapModules with > 50 entries")
  it("de-duplicates sapModules array")
  it("rejects deploymentModel = 'on_prem' (invalid enum)")
  it("accepts all fields as optional (empty object is valid)")
})
```

### Integration Tests

```
describe("PUT /api/assessments/[id]/profile", () => {
  it("updates enrichment fields and returns updated profile")
  it("returns completeness score in response")
  it("rejects unauthenticated request with 401")
  it("rejects executive role with 403")
  it("rejects process_owner role with 403")
  it("returns 404 for non-existent assessment")
  it("returns 403 for assessment in different organization")
  it("returns 403 for signed_off assessment")
  it("logs decision entry for profile update")
  it("strips HTML from itLandscapeSummary")
})

describe("GET /api/assessments/[id]/profile", () => {
  it("returns profile with completeness score")
  it("returns completeness breakdown with field-level booleans")
  it("returns 401 for unauthenticated request")
  it("allows process_owner to read profile")
})

describe("draft->in_progress transition with profile gate", () => {
  it("blocks transition when profile completeness < 60%")
  it("allows transition when profile completeness >= 60%")
  it("returns helpful error listing missing fields")
})
```

### E2E Tests (Playwright)

```
describe("Company Profile Enrichment Flow", () => {
  it("consultant fills out enriched profile, sees completeness increase, transitions to in_progress")
  it("process_owner sees read-only profile")
  it("auto-save triggers after 1500ms of inactivity")
  it("form preserves unsaved changes after network error")
  it("cannot proceed to scope selection until profile is 60% complete")
})
```

## 12. Migration & Seed Data

### Prisma Migration

```sql
-- AlterTable: Add enrichment columns to Assessment
ALTER TABLE "Assessment" ADD COLUMN "employeeCount" INTEGER;
ALTER TABLE "Assessment" ADD COLUMN "annualRevenue" DOUBLE PRECISION;
ALTER TABLE "Assessment" ADD COLUMN "currencyCode" TEXT DEFAULT 'USD';
ALTER TABLE "Assessment" ADD COLUMN "targetGoLiveDate" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN "deploymentModel" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "sapModules" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Assessment" ADD COLUMN "keyProcesses" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Assessment" ADD COLUMN "languageRequirements" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Assessment" ADD COLUMN "regulatoryFrameworks" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Assessment" ADD COLUMN "itLandscapeSummary" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "currentErpVersion" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "migrationApproach" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "profileCompletedAt" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN "profileCompletedBy" TEXT;
```

### Seed Data

Extend the existing seed script to populate enrichment fields on demo assessments:

```typescript
// In prisma/seed.ts — update demo assessments
await prisma.assessment.update({
  where: { id: "demo-assessment-1" },
  data: {
    employeeCount: 2500,
    annualRevenue: 450_000_000,
    currencyCode: "USD",
    targetGoLiveDate: new Date("2027-01-01"),
    deploymentModel: "public_cloud",
    sapModules: ["FI", "CO", "MM", "SD", "PP", "HCM"],
    keyProcesses: ["Procure to Pay", "Order to Cash", "Record to Report"],
    languageRequirements: ["EN", "MS", "ZH"],
    regulatoryFrameworks: ["IFRS", "SST", "PDPA"],
    itLandscapeSummary: "Current landscape includes SAP ECC 6.0 EHP8, SuccessFactors for HR, Ariba for procurement, and a custom warehouse management system built on .NET. Integration via SAP PI/PO.",
    currentErpVersion: "SAP ECC 6.0 EHP8",
    migrationApproach: "brownfield",
  },
});
```

### Backfill for Existing Assessments

No backfill needed. All new fields are nullable. Existing assessments will have `completenessScore` based only on original fields (companyName, industry, country, etc.), which will yield ~25-30% completeness. This is by design: existing assessments in "in_progress" or later statuses are not affected by the gating rule (gate only applies to `draft -> in_progress` transition).

## 13. Open Questions (numbered, with recommended answers)

1. **Should the 60% completeness threshold be configurable per organization?**
   - Recommended: No. Use a fixed 60% threshold for V2. Make it a constant `MINIMUM_PROFILE_COMPLETENESS` that can be easily changed later. Configurable thresholds add UI complexity for marginal benefit.

2. **Should we allow targetGoLiveDate to be in the past for historical/completed assessments?**
   - Recommended: Yes. Validation enforces "future date" only for assessments in "draft" status. Once an assessment is beyond draft, the go-live date is treated as historical data.

3. **Should sapModules use free-text tags or a predefined list?**
   - Recommended: Predefined list. Use the standard SAP S/4HANA Cloud module codes (FI, CO, MM, SD, PP, PM, QM, HCM, PS, WM, etc.). Store as string codes. Display with human-readable labels in the UI.

4. **Should regulatory frameworks be standardized or free-text?**
   - Recommended: Free-text tags. Regulatory landscapes vary too much by country and industry to pre-populate. Allow users to type and add tags. Consider adding a curated suggestion list in a later phase.

5. **Should profile edits be tracked in DecisionLogEntry?**
   - Recommended: Yes. Log a single "PROFILE_UPDATED" decision entry per save, capturing changed fields as `oldValue` / `newValue`. This provides audit trail for when company details change mid-assessment.

## 14. Acceptance Criteria (Given/When/Then)

### AC-10.1: View enriched profile
```
Given I am a stakeholder on assessment "ASM-001" in any role
When I navigate to the assessment profile page
Then I see all enrichment fields displayed
And the profile completeness bar shows the current score
And the completeness breakdown shows which fields are filled
```

### AC-10.2: Edit enriched profile as consultant
```
Given I am a consultant on assessment "ASM-001" in "draft" status
When I update the employeeCount to 5000
And I update the deploymentModel to "public_cloud"
Then the changes are auto-saved after 1500ms
And the completeness score updates in real-time
And a DecisionLogEntry is created for the profile update
```

### AC-10.3: Read-only profile for non-editors
```
Given I am a process_owner on assessment "ASM-001"
When I navigate to the assessment profile page
Then all fields are displayed in read-only mode
And no "Save" button is visible
And the completeness bar is still visible
```

### AC-10.4: Profile completeness gates draft-to-in_progress
```
Given assessment "ASM-001" is in "draft" status
And the profile completeness score is 45%
When a consultant attempts to transition the status to "in_progress"
Then the transition is rejected with HTTP 400
And the error message lists the missing fields
And the profile page highlights the incomplete sections
```

### AC-10.5: Successful draft-to-in_progress with complete profile
```
Given assessment "ASM-001" is in "draft" status
And the profile completeness score is 72%
When a consultant transitions the status to "in_progress"
Then the transition succeeds
And profileCompletedAt is set to the current timestamp
And profileCompletedBy is set to the consultant's email
```

### AC-10.6: Validation rejects invalid field values
```
Given I am a consultant editing the profile
When I set employeeCount to -5
Then the field shows a validation error "Employee count must be at least 1"
And the form does not auto-save
```

### AC-10.7: Signed-off assessment profile is immutable
```
Given assessment "ASM-001" is in "signed_off" status
When I attempt to PUT /api/assessments/ASM-001/profile
Then the request returns 403
And the message is "Cannot modify a signed-off assessment"
```

## 15. Size Estimate

| Category | Estimate |
|---|---|
| **T-shirt size** | **S** |
| Schema changes | 0.5 day |
| API routes (GET + PUT) | 1 day |
| Completeness logic | 0.5 day |
| UI (CompanyProfileFormV2) | 1.5 days |
| Draft gating integration | 0.5 day |
| Tests (unit + integration) | 1 day |
| **Total** | **5 days** |

## 16. Phase Completion Checklist

- [ ] Prisma migration adds all 14 new columns to Assessment
- [ ] `computeCompletenessScore` function implemented and unit tested
- [ ] `GET /api/assessments/[id]/profile` returns enriched fields + completeness
- [ ] `PUT /api/assessments/[id]/profile` validates and persists enrichment fields
- [ ] `canTransitionStatus` blocks `draft -> in_progress` when completeness < 60%
- [ ] `CompanyProfileFormV2` renders all field sections with proper input types
- [ ] `ProfileCompletenessBar` renders segmented progress with breakdown tooltip
- [ ] Auto-save with 1500ms debounce and save status indicator
- [ ] Read-only mode for process_owner, it_lead, executive roles
- [ ] Signed-off assessment returns 403 on profile edit
- [ ] DecisionLogEntry logged for profile updates
- [ ] Seed data updated with enriched demo assessment
- [ ] Unit tests pass for completeness scoring and Zod validation
- [ ] Integration tests pass for GET/PUT profile routes
- [ ] Integration test confirms draft gating behavior
- [ ] E2E test covers full profile enrichment flow
