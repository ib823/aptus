# ABEAM V2 — PRE-IMPLEMENTATION DATA EXTRACTION REPORT

> Generated: 2026-03-01
> Scope: READ-ONLY data extraction from codebase static analysis
> Purpose: Determine whether actual data shapes support 3 planned UX enhancements

---

## Table of Contents

1. [Extraction 1: Hierarchy Trees](#extraction-1-hierarchy-trees)
2. [Extraction 2: parsedContent Data Quality](#extraction-2-parsedcontent-data-quality)
3. [Extraction 3: PROCESS_LANDSCAPES Complete Content](#extraction-3-process_landscapes-complete-content)
4. [Extraction 4: StepReviewCard Complete Interface](#extraction-4-stepreviewcard-complete-interface)
5. [Extraction 5: ReviewShell Rendering Logic](#extraction-5-reviewshell-rendering-logic)
6. [Extraction 6: ConversationTemplate Table State](#extraction-6-conversationtemplate-table-state)
7. [Extraction 7: Key Type Interfaces](#extraction-7-key-type-interfaces)
8. [Implementation Readiness Verdict](#implementation-readiness-verdict)

---

## Extraction 1: Hierarchy Trees

### Architecture: How Hierarchies Are Built

The hierarchy is **not** stored as pre-defined JSON. It is dynamically extracted from flat `ProcessStep` columns ingested from SAP Best Practices XLSX files.

**Pipeline:**

1. `scripts/ingest-sap-zip.ts` reads `{SCOPE_ID}_S4CLD2508_BPD_EN_{COUNTRY}.xlsx` from `S4C/Library/TestScripts/`, parses "Test Cases" sheet (header row 4, data from row 5), inserts `ProcessStep` rows with:
   - Column 5 → `solutionProcessName`
   - Column 7 → `solutionProcessFlowName`
   - Column 14 → `activityTitle`

2. `scripts/extract-hierarchy-entities.ts` runs 5 SQL passes over flat `ProcessStep` table to create normalized entities:
   - Pass 1: Extract unique `SolutionProcess` records
   - Pass 2: Extract unique `ProcessFlow` records (per SolutionProcess)
   - Pass 3: Extract unique `Activity` records (per ProcessFlow)
   - Pass 4: Backfill `ProcessStep.activityId` FK
   - Pass 5: Verify referential integrity

3. `GET /api/catalog/scope-items/[scopeItemId]/hierarchy` queries `prisma.solutionProcess.findMany` with nested includes and returns `HierarchyTree` JSON.

### Type Definition

```typescript
// src/types/hierarchy.ts

interface HierarchyTree {
  scopeItemId: string;
  scopeItemName: string;
  processes: ProcessNode[];        // SolutionProcess entities
}

interface ProcessNode {
  id: string;
  name: string;                    // e.g. "Invoice Receipt"
  guid: string | null;
  sequence: number;
  flows: FlowNode[];               // ProcessFlow entities
}

interface FlowNode {
  id: string;
  name: string;                    // e.g. "Accounts Payable Flow"
  guid: string | null;
  flowDiagramGuid: string | null;
  flowDiagramName: string | null;
  sequence: number;
  activities: ActivityNode[];      // Activity entities
}

interface ActivityNode {
  id: string;
  title: string;                   // e.g. "Post Vendor Invoice"
  guid: string | null;
  targetUrl: string | null;
  sequence: number;
  stepCount: number;               // total steps in this activity
  classifiableCount: number;       // steps requiring classification
  reviewedCount: number;           // steps with non-PENDING status
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
}
```

### Confirmed Real Data Point

From `tests/factories/step.factory.ts` — the only confirmed real SAP hierarchy example in the codebase:

```
solutionProcessName:     "Invoice Receipt"
solutionProcessFlowName: "Accounts Payable Flow"
activityTitle:           "Post Vendor Invoice"
scopeItemId:             "J60"
```

### Hierarchy Trees per Scope Item

> **Note:** The actual `SolutionProcess` and `ProcessFlow` names come from SAP XLSX column 5/7, which are only available in the live database after ingestion. The full-screen content markdown files reveal **activity names** in `## Activity N: [ProcessFlow]: [ActivityTitle]` format, which exposes the ProcessFlow layer embedded in the colon-separated naming.

---

#### J60 — Accounts Payable

| Metric | Value |
|--------|-------|
| Total Steps | 714 |
| Classifiable Steps | 460 |
| Hidden (non-classifiable) | 254 |
| Activities | 86–89 |

**ProcessFlow groupings (inferred from activity name prefixes):**

| ProcessFlow Name (inferred) | Sample Activities |
|---|---|
| Additional Information / Preliminary Steps | BRF+ settings, eDocument prelims (Activities 1–12) |
| Preparation of Payments | Maintain Business Partner, Display Supplier List, Netting of AR/AP |
| Invoice Entry without Purchase Order | Invoice Entry Without PO, Invoice Entry for One-Time Supplier |
| Park and Post Invoice | Park Invoice, Post Invoice |
| Recurring Supplier Invoices | Create, Review, Schedule |
| Mass Upload | Mass Import for Supplier Invoices |
| Invoice Payment Preparation | View Supplier Line Items, Manage Payment Blocks, View Supplier Balance |
| Payment Run | Schedule Proposals, Revise Proposal, Release Proposal, Mass Reverse, View Payment List, Payment Plans |
| Single Outgoing Payment | Create Single Outgoing (Indirect), Create Single Payment (Direct) |
| Online Payments | Free Form Payment Request, Review/Edit, Process Free Form |
| Manual Payment Online | Post Outgoing Payment |
| Payment Approval | Bank Payment Approval, Approval by 1st/2nd Approver, Rejection |
| Payment Media | Create Payment Media |
| Payment Advices | Print/Email Payment Advice, Schedule Payment Advices |
| Correspondence | Correspondence |
| Incorrect Posting | Reset Cleared Items, Reset and Reverse Cleared Items |
| Down Payments | Create Down Payment Request, Post Down Payment, Invoice Entry, Clear Open Items (10+ activities) |
| Optional: Interest Calculation | Schedule Jobs, Manage Interest Runs, Display Interest Runs |
| Guarantees Received | Guarantees Received |
| Periodic Activities | Check Open Balances, Create/Manage/Print Supplier Balance Confirmation |
| Invoice Management Reporting | AP Overview, Days Payable Outstanding, Overdue Payables, Future Payables, Cash Discount Forecast/Utilization, Invoice Processing Analysis, Aging Analysis, Automatic/Manual Payments Analysis, Supplier Payments Analysis, Item Change Log |
| eDocument Cockpit | eDocument Cockpit |
| Additional Information: Appendix | Display Process Flow Accounts Payable |

---

#### J59 — Accounts Receivable

| Metric | Value |
|--------|-------|
| Total Steps | 613 |
| Classifiable Steps | 397 |
| Hidden (non-classifiable) | 216 |
| Activities | 72–76 |

**ProcessFlow groupings (inferred from activity name prefixes):**

| ProcessFlow Name (inferred) | Sample Activities |
|---|---|
| Additional Information / Preliminary Steps | Define Accounting Clerk, BRF+ Settings (14 activities) |
| Test Procedures | Test Procedures |
| Preparation of Payments | Maintain Business Partners, Display Customer List |
| Enter Invoice Without Sales Order | Enter Invoice Without Sales Order |
| Mass Upload | Mass Import of Customer Invoices |
| Invoice Reporting | Invoice Reporting |
| Create Dunning Notices | Create Dunning Notices |
| Manage My Dunning Proposals | Manage My Dunning Proposals |
| Display Dunning History | Display Dunning History |
| Open Correspondence | Open Correspondence |
| Display Correspondence History | Display Correspondence History |
| Invoice Management Reporting | AR Overview, Monitor Overdue Receivables, Overdue by Risk Class, Future Receivables, Total Receivables, Days Sales Outstanding, Dunning Level Distribution, Days Beyond Terms, Item Change Log, Cash Collection Tracker |
| Down Payments | Create Down Payment Request, Display, Post, Enter Invoice, Post Incoming Payments, Clear Open Items |
| Incoming Payment with Electronic Bank Statement | Daily Cash Operations, Cash Application Intelligence, Reprocess Bank Statement Items, Manage Processing Rules, Payment Advices, Clear Open Items/Credit-Debit Memos |
| Incoming Payment without Electronic Bank Statement | Post Incoming Payments |
| Incorrect Posting | Reset Cleared Items, Reset and Reverse, Reverse Individual Documents |
| Invoice Collection Preparation | Manage Customer Line Items |
| Interest Calculation | Schedule Jobs, Manage/Display Interest Runs |
| Guarantees Made | Guarantees Made, Reverse Guarantees |
| Periodic Activities | Check Open Balances, Create/Manage/Print Balance Confirmation, Bad Debt Write-Off |
| Malaysia eInvoice | One-Time Customer (Optional) |
| eDocument Cockpit | eDocument Cockpit |
| Additional Information: Appendix | Display Process Flow Accounts Receivable |

---

#### J45 — Procurement of Direct Materials

| Metric | Value |
|--------|-------|
| Total Steps | 626 |
| Classifiable Steps | 338 |
| Hidden (non-classifiable) | 288 |
| Activities | 78–86 |

**ProcessFlow groupings (inferred from activity name prefixes):**

| ProcessFlow Name (inferred) | Sample Activities |
|---|---|
| Additional Information / Preliminary Steps | Create Purchasing Info Record, Purchase Requisition, Workflow Config, BRF+ Settings, eDocument Process setup (17 activities) |
| Test Procedures | Test Procedures |
| Procurement of Stock Material | Convert PR to PO, Create PO, Approve PO, Preview/Change/Monitor PO, Post Goods Receipt, Preview GR Slip, Check GR Details, Reverse GR, Analyze Stock/Material Document, Manage Stock |
| Option A: Invoice with PO/GR | Create Supplier Invoice with PO/GR Relation |
| Option B: Invoice with Reduction | Create Supplier Invoice with Invoice Reduction, Print Complaint Letter |
| Invoice without PO/GR | Create Supplier Invoice without PO/GR |
| Cash Discount / Credit / Invoice Management | Detect Critical Cash Discount, Create Credit Memo, Check Invoice List, Approve/Reverse Invoice, Clear GR/IR, Cancel Journal Entry |
| Monitor Down Payment Process | Create PO for Down Payment, Monitor, Create Request, Create Payment, Post GR, Create Invoice |
| Automatic PO Creation | Automatic PO from PR, Create PR, Auto Conversion, Post GR, Create Invoice |
| eDocument Cockpit | eDocument Cockpit |
| Additional Information (various) | GR Blocked Stock, Mail Notification, Deadline Config, Free Goods, Quantity Optimization, Rework Workflow, Dunning Reminder, Custom Attributes, Task Cards, Workflow Review |

---

#### 1NT — Project Control - Finance

| Metric | Value |
|--------|-------|
| Total Steps | 147 |
| Classifiable Steps | 58 |
| Hidden (non-classifiable) | 89 |
| Activities | 36–37 |

**Complete activity list:**

| # | Activity |
|---|---|
| 1–3 | Additional Information / Manage Teams / Manage Situation Types |
| 4 | Test Procedures |
| 5–6 | Create Project / Create Project Using Copy |
| 7–9 | Project Review / Update Project / Mass Changes |
| 10–13 | Capture Planned Costs / Capture Budget / Upload Budget / Manage Budget |
| 14 | Define Demand |
| 15 | Release Projects/Project Parts |
| 16 | Direct Activity Allocation |
| 17 | Post General Journal Entry |
| 18 | Time Recording |
| 19 | Project Control Procurement |
| 20–27 | Monitor Projects (7 variants: Financial Controller, Projects App, Cost Report, Budget Report, Procurement, P&L) |
| 28–30 | Settlement Rules (Check/Update, Overhead, Investment) |
| 31–34 | Period End Closing (Apply Overhead, Run Settlements, Monitor Financials) |
| 35–36 | Complete/Close Project Parts and Project |
| 37 | Additional Information |

---

#### BDW — Returnables Processing

| Metric | Value |
|--------|-------|
| Total Steps | 250 |
| Classifiable Steps | 129 |
| Hidden (non-classifiable) | 121 |
| Activities | 27–39 |

**Complete activity list:**

| # | Activity |
|---|---|
| 1–3 | Additional Information / Test Procedures |
| 4–16 | Forward flow: Display Pallets Stock → Create Sales Order → Create Delivery → Execute Picking → Check Batches → Post Goods Issue → Display Stock → Create Billing → Post Incoming Payment |
| 17–18 | Delivery Process for Returnable Materials / Outbound Delivery w/o Order Reference |
| 19–26 | Return flow: Create Pallets Return Sales Order → Post Goods Receipt → Display Stock → Return Process (2nd Variant) → Outbound Delivery w/o Order Reference |
| 27–33 | Pallets Issue: Create Issue Order → Post Goods Issue → Create Billing → Post Incoming Payment → Display Stock |
| 34–39 | Additional Information: Job Scheduling (Delivery/GI/Billing Creation, Billing Release, Billing Output) |

---

#### 2ET — Sales Order Processing for Non-Stock Material

| Metric | Value |
|--------|-------|
| Total Steps | 142 |
| Classifiable Steps | 80 |
| Hidden (non-classifiable) | 62 |
| Activities | 17–19 |

**Complete activity list:**

| # | Activity |
|---|---|
| 1–4 | Additional Information / Preliminary Steps (POD Relevance, BP Master Data) |
| 5 | Test Procedures |
| 6 | Basic Credit Management (BD6) - Set Credit Limit (Optional) |
| 7 | Sales Quotation (BDG) (Optional) |
| 8 | Sales Contract (Optional) |
| 9 | Create Sales Order |
| 10 | Process Sales Order Approval (Optional) |
| 11 | Basic Credit Management (BD6) - Review Blocked Sales Orders (Optional) |
| 12 | Create Delivery |
| 13 | Split Outbound Delivery (Optional) |
| 14 | Add Freight Cost (Optional) |
| 15 | Post Goods Issue |
| 16 | Proof of Delivery (Optional) |
| 17 | Create Billing Document |
| 18 | Create Pro Forma Invoice (Optional) |
| 19 | Additional Information |

### Summary: Hierarchy Data for All 6 Scope Items

| Scope Item | Total Steps | Classifiable | Activities | Complexity |
|---|---|---|---|---|
| **J60** (Accounts Payable) | 714 | 460 | 86–89 | Very High |
| **J59** (Accounts Receivable) | 613 | 397 | 72–76 | Very High |
| **J45** (Procurement - Direct) | 626 | 338 | 78–86 | Very High |
| **1NT** (Project Control) | 147 | 58 | 36–37 | Medium |
| **BDW** (Returnables) | 250 | 129 | 27–39 | Medium |
| **2ET** (Non-Stock Sales) | 142 | 80 | 17–19 | Low |

### Key Finding: No Pre-Parsed Hierarchy JSON

- No JSON fixture files exist with full hierarchy trees.
- The hierarchy data lives exclusively in the PostgreSQL database, built by the ingestion pipeline.
- Test seed files (`tests/seed/`) use synthetic scope item IDs and mock data, not real SAP hierarchies.
- The SAP XLSX source files are in the ZIP at `fit-portal-transfer/SAP_Best_Practices_for_SAP_S4HANA_Cloud_Public_Edition_2508_MY_SAPCUSTOMER.zip` (not parsed in repo).

---

## Extraction 2: parsedContent Data Quality

### ParsedStepContent Interface

```typescript
// src/lib/assessment/content-parser.ts

export interface ParsedStepContent {
  purpose: string | null;           // SAP "Purpose" section
  prerequisites: string | null;     // SAP "Prerequisites" section
  systemAccess: string | null;      // SAP "System Access" or "LogOn" section
  roles: string | null;             // SAP "Roles" section
  masterData: string | null;        // SAP "Master Data" section
  expectedResult: string | null;    // SAP "Expected Result" section
  procedure: string | null;         // SAP "Procedure" or "Procedure Steps" section
  mainInstructions: string;         // Remainder after all named sections stripped
  rawHtml: string;                  // Original untouched HTML
  hasMeaningfulContent: boolean;    // true if any section has >50 chars of plain text
}
```

### Parsing Logic

1. **Input:** `actionInstructionsHtml` (a `String @db.Text` column on `ProcessStep`)
2. **Boilerplate stripping:** Removes SAP test administration noise:
   - `Test Case ID:`, `Tester Name:`, `Testing Date:`, `Duration:`
   - `Business Role(s):`, `Responsibility:`, `Pass / Fail / Comment`
   - `Test Administration`, `Customer project:`
3. **Section extraction:** Regex looks for `<p>SectionName</p>` markers using lookahead boundary at next section header or end-of-string
4. **Fallback:** If no section markers found, entire HTML goes to `mainInstructions`, all other fields are `null`
5. **Meaningful check:** `hasMeaningfulContent = true` if any section has >50 chars after HTML tag stripping

**Section labels matched (regex patterns):**
- `Purpose`
- `Prerequisite[s]?`
- `System\s*Access` or `Log\s*On`
- `Role[s]?`
- `Master\s*Data`
- `Expected\s*Result`
- `Procedure(?:\s*Steps)?`

### Representative Example 1: No Section Markers (Fallback)

**Input HTML:**
```html
<p>Navigate to transaction FB60. Enter the vendor number in the <b>Vendor</b> field.
Enter the invoice date and amount. Select the appropriate payment terms.
Enter the G/L account assignment on the line items. Click <b>Post</b>.</p>
```

**Output parsedContent:**
```json
{
  "purpose": null,
  "prerequisites": null,
  "systemAccess": null,
  "roles": null,
  "masterData": null,
  "expectedResult": null,
  "procedure": null,
  "mainInstructions": "<p>Navigate to transaction FB60. Enter the vendor number in the <b>Vendor</b> field. Enter the invoice date and amount. Select the appropriate payment terms. Enter the G/L account assignment on the line items. Click <b>Post</b>.</p>",
  "rawHtml": "(same as input)",
  "hasMeaningfulContent": true
}
```

**Source:** `tests/factories/step.factory.ts` `createWithRealSAPContent()`, confirmed by test T-CSP-007.

### Representative Example 2: Full Section Set (Richest Fixture)

**Input HTML (SAP_CASH_JOURNAL_FIXTURE):**
```html
<p class="heading">Purpose</p>
<p>Post petty cash receipts and payments using the Cash Journal.</p>
<p class="heading">Prerequisites</p>
<p>A cash journal must be configured for the relevant company code.
G/L accounts for cash transactions must be set up.</p>
<p class="heading">System Access</p>
<table><tr><th>Transaction</th><th>Description</th></tr>
<tr><td>FBCJ</td><td>Cash Journal</td></tr></table>
<p class="heading">Roles</p>
<table><tr><th>Role</th><th>Description</th></tr>
<tr><td>SAP_FI_AP_ACCOUNTANT</td><td>Accounts Payable Accountant</td></tr>
<tr><td>SAP_FI_GL_ACCOUNTANT</td><td>General Ledger Accountant</td></tr></table>
<p class="heading">Master Data</p>
<p>Vendor 300100 - Office Supplies Vendor</p>
<p>G/L Account 100000 - Petty Cash</p>
```

**Output parsedContent:**
```json
{
  "purpose": "<p>Post petty cash receipts and payments using the Cash Journal.</p>",
  "prerequisites": "<p>A cash journal must be configured for the relevant company code. G/L accounts for cash transactions must be set up.</p>",
  "systemAccess": "<table>...(FBCJ transaction table)...</table>",
  "roles": "<table>...(SAP_FI_AP_ACCOUNTANT, SAP_FI_GL_ACCOUNTANT)...</table>",
  "masterData": "<p>Vendor 300100 - Office Supplies Vendor</p><p>G/L Account 100000 - Petty Cash</p>",
  "expectedResult": null,
  "procedure": null,
  "mainInstructions": "",
  "rawHtml": "(original full HTML)",
  "hasMeaningfulContent": true
}
```

**Source:** test T-CSP-015 in `tests/unit/parsers/content-section-parser.test.ts`.

### Representative Example 3: Boilerplate-Contaminated Input

**Input HTML:**
```html
<p>Purpose</p>
<p>Test Case ID: TC-001</p>
<p>Tester Name: John</p>
<p>Create a purchase order with the following details.</p>
```

**Output parsedContent (after boilerplate stripping):**
```json
{
  "purpose": "<p>Create a purchase order with the following details.</p>",
  "prerequisites": null,
  "systemAccess": null,
  "roles": null,
  "masterData": null,
  "expectedResult": null,
  "procedure": null,
  "mainInstructions": "",
  "rawHtml": "(original with boilerplate intact)",
  "hasMeaningfulContent": true
}
```

**Source:** test T-CSP-020 in `tests/unit/parsers/content-section-parser.test.ts`.

### Data Quality Assessment

**Storage:**
- `ProcessStep.parsedContent` is `Json?` (nullable JSONB) in Prisma schema
- Column is `null` until backfill script (`scripts/parse-step-content.ts`) is run
- Backfill calls `parseStepContent()` and stores the `ParsedStepContent` object directly as JSON

**API exposure:**
- **Neither steps API route currently selects `parsedContent`:**
  - `GET /api/catalog/scope-items/[scopeItemId]/steps/` — does NOT select it
  - `GET /api/catalog/scope-items/[scopeItemId]/activities/[activityId]/steps` — does NOT select it
- `StepReviewCard` handles this: if `step.parsedContent` is null, it calls `parseStepContent(step.actionInstructionsHtml)` on the fly in the browser

**Quality issues:**
1. Most SAP steps lack section markers → fallback to `mainInstructions` only (all structured fields `null`)
2. `masterData` field populated only when SAP HTML includes a `<p>Master Data</p>` header — many steps reference master data in-line without the section marker
3. `roles` field contains HTML tables when present, not structured role arrays
4. `prerequisites` field is free-text HTML, not a parseable list
5. No field for "affected SAP modules" or "configuration objects" — key data for Enhancement C (implications panel)

**Test factory divergence:**
The step factory (`tests/factories/step.factory.ts`) uses a **different shape** than `ParsedStepContent`:
```typescript
// Factory mock shape (does NOT match real ParsedStepContent):
parsedContent: {
  type: "BusinessProcess",
  transaction: "FB60",
  entity: "Vendor Invoice",
  action: "Create",
  fields: ["Vendor", "Invoice Date", "Amount", "Payment Terms", "G/L Account"],
}
```

This mock was written to satisfy Prisma's `Json?` type without importing the parser. The real 9-field shape only appears in the parser test fixtures.

---

## Extraction 3: PROCESS_LANDSCAPES Complete Content

### Source: `src/constants/process-chains.ts`

**Type definitions:**

```typescript
interface ChainStep {
  scopeItemId: string;
  businessName: string;
  roleInChain: string;
  position: "start" | "middle" | "end" | "branch";
  followsStepIndex?: number;      // only for position="branch"
}

interface ProcessChain {
  key: string;                     // URL-safe identifier
  name: string;                    // e.g. "Record to Report"
  abbreviation: string;            // e.g. "R2R"
  description: string;
  type: "core" | "supporting" | "specialized";
  steps: ChainStep[];
}

interface FunctionalAreaLandscape {
  area: string;                    // matches functional area name
  businessDescription: string;
  chains: ProcessChain[];
}
```

### Complete Data (all 7 areas, 19 chains)

#### Finance (5 chains)

| Chain | Abbreviation | Type | Steps (scope items) |
|---|---|---|---|
| Record to Report | R2R | core | J63 → J58 → J58A, branch: 2NV (from J58) |
| Procure to Pay (Finance) | P2P | core | J60 → 1EG → BFB |
| Order to Cash (Finance) | O2C | core | J59 → 1EZ |
| Treasury & Cash Management | TCM | supporting | J61 → 1EG |
| Asset Lifecycle | ALM | supporting | J77 |

#### Procurement (4 chains)

| Chain | Abbreviation | Type | Steps (scope items) |
|---|---|---|---|
| Procure to Pay | P2P | core | 1FC → J14 → BNX |
| Travel & Expense | T&E | supporting | BD2 |
| Strategic Sourcing | SRC | specialized | BNL |
| Self-Service Procurement | SSP | supporting | BNX |

#### Sales (2 chains)

| Chain | Abbreviation | Type | Steps (scope items) |
|---|---|---|---|
| Order to Cash | O2C | core | BKP → J56 |
| Returns & Credits | RET | supporting | BEF |

#### Warehouse (2 chains)

| Chain | Abbreviation | Type | Steps (scope items) |
|---|---|---|---|
| Warehouse Operations | WHO | core | J45 |
| Basic Warehouse Management | BWM | supporting | 1YB |

#### Production (1 chain)

| Chain | Abbreviation | Type | Steps (scope items) |
|---|---|---|---|
| Plan to Produce | P2P | core | J44 → J46 |

#### Maintenance (1 chain)

| Chain | Abbreviation | Type | Steps (scope items) |
|---|---|---|---|
| Maintain to Operate | M2O | core | BHR |

#### Services (1 chain)

| Chain | Abbreviation | Type | Steps (scope items) |
|---|---|---|---|
| Service Management | SVC | core | BKC |

### Mapping of 6 Target Scope Items to Chains

| Scope Item | Appears in Chain(s) | Position |
|---|---|---|
| **J60** | Finance → Procure to Pay (P2P) | start |
| **J59** | Finance → Order to Cash (O2C) | start |
| **J45** | Warehouse → Warehouse Operations (WHO) | start |
| **1NT** | **NOT IN ANY CHAIN** | — |
| **BDW** | **NOT IN ANY CHAIN** | — |
| **2ET** | **NOT IN ANY CHAIN** | — |

**Key finding:** Only 3 of the 6 target scope items are mapped to process chains. `1NT` (Project Control), `BDW` (Returnables), and `2ET` (Non-Stock Sales) have no chain representation. The landscape data covers 22 unique scope item IDs total; the full catalog has many more scope items unmapped.

### Helper Functions

```typescript
getLandscape(area: string): FunctionalAreaLandscape | null
// Returns the landscape for a functional area name, or null

getChainScopeItemIds(chain: ProcessChain): string[]
// Returns all scope item IDs in a single chain

getAreaScopeItemIds(landscape: FunctionalAreaLandscape): string[]
// Returns deduplicated scope item IDs across all chains in an area
```

---

## Extraction 4: StepReviewCard Complete Interface

### Source: `src/components/review/StepReviewCard.tsx` (495 lines)

### Props Interface

```typescript
interface StepData {
  id: string;
  sequence: number;
  actionTitle: string;
  actionInstructionsHtml: string;
  actionExpectedResult: string | null;
  stepType: string;
  processFlowGroup: string | null;
  activityTitle: string | null;
  activityTargetUrl: string | null;
  fitStatus: string;               // "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING"
  clientNote: string | null;
  currentProcess: string | null;
  confidence?: string | null;       // "high" | "medium" | "low"
  evidenceUrls?: string[];
  stepCategory?: string | null;
  parsedContent?: Record<string, unknown> | null;
  isClassifiable?: boolean | null;
}

interface ConfigItem {
  id: string;
  configKey: string;
  configValue: string;
  category: string;
  guidance: string;
  isSelfService: boolean;
}

// Component props:
{
  step: StepData;
  configs: ConfigItem[];
  onResponseChange: (stepId: string, data: {
    fitStatus?: string;
    clientNote?: string;
    confidence?: string;
  }) => void;
  isReadOnly: boolean;
  isItLead: boolean;
  assessmentId: string;
  currentUserId: string;
  commentCount?: number;
}
```

### Classification Logic

**4 classification buttons (lines 176-198):**

| Value | Icon | Label | Button Color (selected) |
|---|---|---|---|
| `"FIT"` | `"✓"` | `"Matches"` | `bg-green-50 border-green-300 text-green-700` |
| `"CONFIGURE"` | `"⚙"` | `"Needs Adjustment"` | `bg-blue-50 border-blue-300 text-blue-700` |
| `"GAP"` | `"⚠"` | `"Doesn't Match"` | `bg-amber-50 border-amber-300 text-amber-700` |
| `"NA"` | `"—"` | `"Not Relevant"` | `bg-slate-50 border-slate-300 text-slate-600` |

**Classification flow:**
1. User clicks a classification button
2. If changing from current → calls `onResponseChange(stepId, { fitStatus: newValue })`
3. If `GAP` selected → amber textarea appears, requires `clientNote.length >= 10`
4. If `CONFIGURE` selected → blue textarea appears (optional note)
5. Note changes debounced at 1000ms before calling `onResponseChange`

### State Management

```typescript
// Internal state (per card instance):
saveStatus: "idle" | "saving" | "saved"    // visual indicator
localNote: string                           // debounced note text
sapContentOverride: Map<string, boolean>    // expand/collapse per step+fitStatus combo
```

### API Pattern

**No direct API calls.** The component uses the `onResponseChange` callback exclusively. The parent (`ReviewShell`) handles:
- `PUT /api/assessments/{assessmentId}/steps/{stepId}` for individual saves
- `POST /api/assessments/{assessmentId}/steps/bulk-all` for bulk "Accept All SAP Standard"

### Rendering Behavior

1. **Technical details section:** Collapsed by default. Auto-expanded when `fitStatus === "PENDING"`. Toggle via ChevronDown/ChevronRight button.
2. **IT Lead mode:** `isItLead=true` → notes-only view, cannot change fitStatus
3. **Read-only mode:** `isReadOnly=true` → no interaction at all
4. **Config rendering (lines 424-457):** Maps `configs` array, shows category Badge with tooltip, Self-Service badge, guidance text
5. **Confidence display:** Shows `high/medium/low` with user-friendly labels
6. **Comment indicator:** Shows comment count badge when `commentCount > 0`

### Insertion Points for Enhancements

- **Enhancement A (Business Process Area grouping):** Not visible at card level — this would be a layer above in ReviewShell
- **Enhancement B (Business question abstraction):** The card already shows `step.actionTitle` as the heading. A business question mode would replace `actionInstructionsHtml` display with the conversation question UI
- **Enhancement C (Implications panel):** Could insert after the classification buttons and before the note textarea. The card already has `parsedContent` and `configs` data available for implications derivation

---

## Extraction 5: ReviewShell Rendering Logic

### Source: `src/components/review/ReviewShell.tsx` (803 lines)

### Props

```typescript
{
  assessmentId: string;
  assessmentStatus: string;
  userRole: string;
  scopeItems: ScopeItemNav[];      // { id, name, relevance, stepCount, reviewedCount }
  initialProgress: Record<string, number>;
  initialScopeItemId?: string;     // from URL query param ?scopeItem=
}
```

### Component Structure

```
<ReviewShell>
  └─ <HierarchyProvider>         // Context provider for tree navigation state
       └─ <ReviewShellInner>     // Actual rendering logic
            ├─ Sidebar
            │   ├─ Current scope item progress
            │   ├─ <HierarchyTreeSidebar>   // Nested tree navigation
            │   └─ Other scope items list
            └─ Main content area
                ├─ view="map" → <ProcessMap>          // Visual process flow diagram
                └─ view="step" → <StepReviewCard>     // Individual step review
```

### Data Loading (5 @tanstack/react-query queries)

| Query | Endpoint | Stale Time |
|---|---|---|
| Hierarchy tree | `GET /api/catalog/scope-items/${scopeItemId}/hierarchy?assessmentId=...` | 5 min |
| Activity progress | `GET /api/assessments/${assessmentId}/hierarchy/progress?scopeItemId=...` | 2 min |
| Activity steps | `GET /api/catalog/scope-items/${scopeItemId}/activities/${activityId}/steps?limit=200` | 5 min |
| Step responses | `GET /api/assessments/${assessmentId}/steps?scopeItemId=...&limit=200` | 1 min |
| Configs | `GET /api/catalog/scope-items/${scopeItemId}/configs?assessmentId=...` | 5 min |

### Client-Side Data Merging

Steps are assembled client-side from 3 sources:
1. **Catalog steps** (from activity steps API) — the SAP reference data
2. **Step responses** (from assessment steps API) — user classifications
3. **localStepOverrides** (`Map<string, Partial<StepData>>`) — unsaved optimistic updates

Merge logic: catalog step fields are the base, response fields override `fitStatus`/`clientNote`/`confidence`, local overrides take highest priority.

### View Modes

Controlled by `useHierarchy()` context — **no explicit mode toggle exists in UI:**

| Mode | Trigger | Renders |
|---|---|---|
| `"map"` | Initial load, Esc key, clicking scope item | `<ProcessMap>` — visual diagram of process flows |
| `"step"` | Clicking a step in the map or sidebar | `<StepReviewCard>` — individual step review card |

**Key finding:** There is no "detailed vs. summary" toggle and no "business question mode" toggle. This is the primary insertion point for Enhancement B.

### Navigation System

**Keyboard shortcuts:**

| Key | Action |
|---|---|
| `←` / `→` | Previous / next step within activity |
| `[` / `]` | Previous / next activity |
| `Tab` | Next activity (same as `]`) |
| `Esc` | Back to process map view |
| `F` | Classify as FIT |
| `C` | Classify as CONFIGURE |
| `G` | Classify as GAP |
| `N` | Classify as NA |

**Auto-advance behavior:** When classifying a `PENDING` step → after 200ms delay → auto-navigates to the next `PENDING` classifiable step in the current activity. If all steps in the activity are classified → shows `<ActivityCompletionCard>`.

### Filtering

- Shows only classifiable steps by default
- Toggle "Show technical steps" reveals all steps including SYSTEM_ACCESS, REFERENCE, TEST_INFO
- Non-classifiable steps render with a gray badge and no classification buttons

### Bulk Actions

- **"Accept All SAP Standard"** button → `POST /api/assessments/${assessmentId}/steps/bulk-all` → marks all PENDING classifiable steps as FIT
- Requires confirmation dialog

### URL Structure

- Uses `initialScopeItemId` from query param `?scopeItem=XXX`
- No dynamic route segment changes during navigation (stays on same page, uses React state)
- Activity and step selection tracked in component state only (not URL)

---

## Extraction 6: ConversationTemplate Table State

### Prisma Model

```prisma
// prisma/schema.prisma (lines 1415-1430)

model ConversationTemplate {
  id              String   @id @default(cuid())
  scopeItemId     String
  processStepId   String
  questionFlow    Json                           // JSONB column
  language        String   @default("en")
  version         Int      @default(1)
  createdBy       String                         // email string, no FK
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([scopeItemId, processStepId, language])  // one active per step per language
  @@index([scopeItemId])
  @@index([isActive])
}

model ConversationSession {
  id              String   @id @default(cuid())
  assessmentId    String
  scopeItemId     String
  userId          String
  templateId      String
  status          String   @default("in_progress")  // "in_progress" | "completed" | "abandoned"
  responses       Json     @default("[]")            // ConversationResponse[]
  classifications Json     @default("[]")            // DerivedClassification[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  completedAt     DateTime?

  @@index([assessmentId, scopeItemId])
  @@index([userId])
}
```

### TABLE STATE: EMPTY

**The ConversationTemplate table starts empty.** Evidence:

1. **No seed data exists:** No `prisma/seed.ts`, no seed scripts reference `ConversationTemplate`
2. **No migration-time inserts:** Migration `20250222400000_wave6_conversation_dashboard_onboarding/migration.sql` creates DDL only, no INSERT statements
3. **No seeding scripts:** All 13 scripts in `scripts/` directory — none reference `ConversationTemplate`
4. **No test seeds:** All 12 scenario seed files in `tests/seed/` (seed-001 through seed-012) — zero references to `ConversationTemplate`
5. **Spec planned but unimplemented:** `specs/v2/PHASE-22.md` (line 551) calls for "3 sample conversation templates for common scope items (J60, J14, BD2)" — **never implemented**

Templates must be created by an admin/consultant through:
- `POST /api/admin/conversation-templates` endpoint
- Admin UI: `src/components/admin/ConversationTemplateEditor.tsx` (visual decision-tree editor)

### QuestionFlow JSON Structure

**Canonical types:**

```typescript
// src/types/conversation.ts

type ClassificationValue = "FIT" | "CONFIGURE" | "GAP" | "NA";

interface ConversationAnswer {
  id: string;
  text: string;
  nextQuestionId?: string;          // link to next question (non-terminal)
  classification?: ClassificationValue; // terminal classification (leaf)
}

interface ConversationQuestion {
  id: string;
  text: string;
  helpText?: string;
  answers: ConversationAnswer[];
}

interface QuestionFlow {
  rootQuestionId: string;
  questions: ConversationQuestion[];   // ARRAY, not a map
}
```

**Spec divergence:** The Phase-22 spec defines `questions` as `z.record(string, questionSchema)` (a **map** keyed by id). The actual implementation uses an **array**. The tree-engine uses `flow.questions.find((q) => q.id === ...)`.

### Concrete QuestionFlow Example (from tests)

```json
{
  "rootQuestionId": "q1",
  "questions": [
    {
      "id": "q1",
      "text": "Does your company process invoices?",
      "answers": [
        { "id": "a1-yes", "text": "Yes", "nextQuestionId": "q2" },
        { "id": "a1-no",  "text": "No",  "classification": "NA" }
      ]
    },
    {
      "id": "q2",
      "text": "Do you use 3-way matching?",
      "answers": [
        { "id": "a2-yes",     "text": "Yes, exactly as SAP describes",    "classification": "FIT" },
        { "id": "a2-partial", "text": "Partially, with some differences", "nextQuestionId": "q3" },
        { "id": "a2-no",      "text": "No, we have a different process",  "classification": "GAP" }
      ]
    },
    {
      "id": "q3",
      "text": "Can the differences be handled by SAP configuration?",
      "answers": [
        { "id": "a3-yes", "text": "Yes", "classification": "CONFIGURE" },
        { "id": "a3-no",  "text": "No",  "classification": "GAP" }
      ]
    }
  ]
}
```

Source: `tests/unit/tree-engine.test.ts`

### Tree Engine: `src/lib/conversation/tree-engine.ts`

```typescript
getNextQuestion(flow, currentQuestionId, selectedAnswerId, processStepId)
// Traverses tree: returns { nextQuestion } or { classification }
// processStepId param is reserved (unused) for future step-specific logic

validateQuestionFlow(flow)
// Validates: root exists, no dangling refs, all leaf answers have classification, no cycles (DFS)

estimateRemainingQuestions(flow, answeredQuestionIds)
// Computes max depth of unanswered subtree
```

### Classification Applier: `src/lib/conversation/classification-applier.ts`

```typescript
applyClassifications(assessmentId, userId, userName, userRole, sessionId, classifications)
// Runs in Prisma transaction:
// - Upserts StepResponse (skips already-classified non-PENDING steps)
// - Auto-creates GapResolution for GAP classifications
// - Logs to DecisionLogEntry and activity log
// Returns: { applied: number, skipped: number, gapsCreated: number }
```

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/conversation-templates` | POST | Create template (admin only) |
| `/api/admin/conversation-templates/[templateId]` | PUT | Update template |
| `/api/assessments/[id]/conversation/[scopeItemId]` | GET | Get templates + active session |
| `/api/assessments/[id]/conversation/[scopeItemId]/respond` | POST | Submit one answer, advance tree |
| `/api/assessments/[id]/conversation/[scopeItemId]/complete` | POST | Finalize session, apply classifications |
| `/api/assessments/[id]/conversation/sessions` | GET | List user's sessions |

---

## Extraction 7: Key Type Interfaces

### assessment.ts — Complete Enums

```typescript
// V2 lifecycle (12 states):
type AssessmentStatusV2 =
  | "draft" | "scoping" | "in_progress" | "workshop_active"
  | "review_cycle" | "gap_resolution" | "pending_validation"
  | "validated" | "pending_sign_off" | "signed_off"
  | "handed_off" | "archived";

// 11-role RBAC system:
type UserRole =
  | "platform_admin" | "partner_lead" | "consultant"
  | "project_manager" | "solution_architect"
  | "process_owner" | "it_lead" | "data_migration_lead"
  | "executive_sponsor" | "viewer" | "client_admin";

// Role hierarchy (higher = more authority):
// platform_admin: 100, partner_lead: 90, consultant: 80,
// solution_architect: 75, project_manager: 70, client_admin: 65,
// process_owner: 60, it_lead: 55, data_migration_lead: 50,
// executive_sponsor: 45, viewer: 10

// Classification:
type FitStatus = "FIT" | "CONFIGURE" | "GAP" | "NA" | "PENDING";

// Step categories (7):
type StepCategory =
  | "BUSINESS_PROCESS" | "CONFIGURATION" | "REPORTING" | "MASTER_DATA"
  | "REFERENCE" | "SYSTEM_ACCESS" | "TEST_INFO";

// Gap resolution types (8):
type ResolutionType =
  | "FIT" | "CONFIGURE" | "KEY_USER_EXT" | "BTP_EXT"
  | "ISV" | "CUSTOM_ABAP" | "ADAPT_PROCESS" | "OUT_OF_SCOPE";

// Company profile:
type CompanySize = "small" | "midsize" | "large" | "enterprise";
type DeploymentModel = "public_cloud" | "private_cloud" | "hybrid";
type MigrationApproach = "greenfield" | "brownfield" | "selective";
type Relevance = "YES" | "NO" | "MAYBE";
type CurrentState = "MANUAL" | "SYSTEM" | "OUTSOURCED" | "NA";

// Assessment phases (8):
type AssessmentPhase =
  | "scoping" | "process_review" | "gap_resolution" | "integration"
  | "data_migration" | "ocm" | "validation" | "sign_off";

// Decision actions (56 total, key ones):
type DecisionAction =
  | "MARKED_FIT" | "MARKED_GAP" | "RESOLUTION_SELECTED" | "SCOPE_INCLUDED"
  | "SCOPE_EXCLUDED" | "NOTE_ADDED" | "APPROVED" | "SIGNED_OFF"
  | "CONVERSATION_STARTED" | "CONVERSATION_COMPLETED"
  | "CONVERSATION_CLASSIFICATION_APPLIED" | "BULK_MARK_ALL_FIT"
  | ... (56 total);

PROFILE_COMPLETENESS_GATE = 60;  // % required to proceed from company profile
```

### step-classifier.ts — Complete Mapping

```typescript
// Step type → category mapping (both uppercase DB format and lowercase SAP tag format):

LOGON           → SYSTEM_ACCESS      // non-classifiable
LOGOFF          → SYSTEM_ACCESS      // non-classifiable
ACCESS_APP      → SYSTEM_ACCESS      // non-classifiable
INFORMATION     → REFERENCE          // non-classifiable
NAVIGATION      → REFERENCE          // non-classifiable
DATA_ENTRY      → BUSINESS_PROCESS   // classifiable
ACTION          → BUSINESS_PROCESS   // classifiable
VERIFICATION    → BUSINESS_PROCESS   // classifiable
PROCESS_STEP    → BUSINESS_PROCESS   // classifiable
logon           → SYSTEM_ACCESS
logoff          → SYSTEM_ACCESS
information     → REFERENCE
testprocedure   → TEST_INFO          // non-classifiable
businessprocess → BUSINESS_PROCESS   // classifiable
configuration   → CONFIGURATION      // classifiable
reporting       → REPORTING          // classifiable
masterdata      → MASTER_DATA        // classifiable

// null/empty stepType defaults to BUSINESS_PROCESS (classifiable)

// Classifiable categories: BUSINESS_PROCESS, CONFIGURATION, REPORTING, MASTER_DATA
// Non-classifiable categories: REFERENCE, SYSTEM_ACCESS, TEST_INFO
```

### step-grouper.ts — Grouping Interfaces

```typescript
interface StepInGroup {
  id: string;
  sequence: number;
  actionTitle: string;
  stepType: string;
  activityTitle: string | null;
  fitStatus: string;
  isClassifiable: boolean;
  stepCategory: StepCategory;
}

interface StepGroup {
  key: string;           // e.g. "activity:Post Vendor Invoice" or "__category__:SYSTEM_ACCESS"
  label: string;
  category: StepCategory;
  steps: StepInGroup[];
  classifiableCount: number;
}

// New FK-based grouping (preferred):
interface ActivityStepGroup {
  activityId: string;
  activityTitle: string;
  processFlowName: string | null;
  solutionProcessName: string | null;
  steps: StepInGroup[];
  classifiableCount: number;
}

// groupStepsLegacy(steps) — groups by string matching (deprecated, remove after May 2026)
// groupStepsByActivity(steps) — groups by activityId FK (preferred)
// computeClassifiableProgress(groups) — returns { totalClassifiable, totalClassified, totalSteps, percentage }
```

### business-context.ts — Complete Hint System

```typescript
// 15 keyword-pattern hints (pattern → plain English guidance):
/import.*bank\s*statement/i   → "If your company receives electronic bank statements..."
/create.*purchase\s*(order|requisition)/i → "This step is about how purchase requests are created..."
/goods\s*receipt/i             → "This step records when ordered goods physically arrive..."
/invoice\s*(verification|receipt|processing)/i → "This step is about processing supplier invoices..."
/payment\s*(run|processing|execution)/i → "This step executes payments to your suppliers..."
/journal\s*entry/i             → "This step is about recording financial transactions..."
/period[- ]end\s*clos/i        → "This step is part of your month-end or year-end closing..."
/financial\s*statement/i       → "This step generates your financial reports..."
/credit\s*memo/i               → "This step handles issuing credit notes to customers..."
/dunning/i                     → "This step sends payment reminders to customers..."
/depreciation/i                → "This step calculates how much value your fixed assets..."
/foreign\s*currency/i          → "This step revalues balances in foreign currencies..."
/intercompany/i                → "This step handles transactions between entities..."
/sales\s*order/i               → "This step creates a customer order in the system..."
/delivery/i                    → "This step handles shipping goods to customers..."
/logon|log on|access app/i    → null (no hint, system access step)
/navigate|navigation/i         → null (no hint, navigation step)

// 4 category fallback hints:
BUSINESS_PROCESS → "Review the description below. Does your company have a similar process?..."
CONFIGURATION    → "This is a system setting that controls how SAP behaves..."
REPORTING        → "This is a standard SAP report. Think about: does your company need this report?..."
MASTER_DATA      → "This is about maintaining reference data..."

// Ultimate fallback (no keyword match, no category match):
→ "Review the SAP process step described below. Compare it to how your company handles this today."

// Function: getBusinessContextHint(actionTitle, stepCategory) → string | null
```

### conversation.ts — Complete Types

```typescript
type ClassificationValue = "FIT" | "CONFIGURE" | "GAP" | "NA";
type ConversationSessionStatus = "in_progress" | "completed" | "abandoned";

interface ConversationAnswer {
  id: string;
  text: string;
  nextQuestionId?: string;
  classification?: ClassificationValue;
}

interface ConversationQuestion {
  id: string;
  text: string;
  helpText?: string;
  answers: ConversationAnswer[];
}

interface QuestionFlow {
  rootQuestionId: string;
  questions: ConversationQuestion[];  // ARRAY (not map, despite spec)
}

interface ConversationResponse {
  questionId: string;
  answerId: string;
  answeredAt: string;
}

interface DerivedClassification {
  processStepId: string;
  classification: ClassificationValue;
  confidence: "high" | "medium" | "low";
  derivedFrom: string[];
}

interface NextQuestionResult {
  nextQuestion?: ConversationQuestion;
  classification?: ClassificationValue;
}

interface FlowValidationResult {
  valid: boolean;
  errors: string[];
}
```

### hierarchy.ts — Complete Types

```typescript
interface HierarchyTree {
  scopeItemId: string;
  scopeItemName: string;
  processes: ProcessNode[];
}

interface ProcessNode {
  id: string;
  name: string;
  guid: string | null;
  sequence: number;
  flows: FlowNode[];
}

interface FlowNode {
  id: string;
  name: string;
  guid: string | null;
  flowDiagramGuid: string | null;
  flowDiagramName: string | null;
  sequence: number;
  activities: ActivityNode[];
}

interface ActivityNode {
  id: string;
  title: string;
  guid: string | null;
  targetUrl: string | null;
  sequence: number;
  stepCount: number;
  classifiableCount: number;
  reviewedCount: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
}

interface ActivityProgress {
  total: number;
  reviewed: number;
  fit: number;
  configure: number;
  gap: number;
  na: number;
  pending: number;
}

interface ActivityProgressMap {
  [activityId: string]: ActivityProgress;
}
```

---

## Implementation Readiness Verdict

### Enhancement A: Business Process Area Grouping Layer

> Add a grouping layer above activities/steps that organizes by business process area

**Verdict: READY**

**Supporting data:**
- `PROCESS_LANDSCAPES` constant already maps scope items into named process chains (19 chains across 7 functional areas)
- `ProcessChain.steps[].scopeItemId` directly links to the hierarchy tree's `scopeItemId`
- `FunctionalAreaLandscape.area` provides the area name, `ProcessChain.name` provides the chain name
- `getLandscape()` helper already exists for area lookup
- `HierarchyTree` → `ProcessNode` → `FlowNode` → `ActivityNode` provides the full nested structure
- `ActivityStepGroup` (from step-grouper.ts) already carries `processFlowName` and `solutionProcessName`

**Blockers: NONE critical, one gap:**
- 3 of 6 target scope items (1NT, BDW, 2ET) are **not mapped** in `PROCESS_LANDSCAPES`. Enhancement A works for mapped items but needs an "Other" or "Unmapped" fallback for the 22+ scope items without chain assignment.

**Insertion point:** Above `<HierarchyTreeSidebar>` in ReviewShell — add a process chain selector/filter that groups scope items by their chain membership.

---

### Enhancement B: Business Question Abstraction

> Collapse SAP test steps into 20-40 business decisions via conversation mode

**Verdict: BLOCKED BY MISSING DATA**

**Supporting infrastructure (exists and works):**
- `ConversationTemplate` Prisma model with JSONB `questionFlow` column
- `QuestionFlow` type system (questions array, answers with nextQuestionId or classification)
- `tree-engine.ts` — `getNextQuestion()`, `validateQuestionFlow()`, `estimateRemainingQuestions()`
- `classification-applier.ts` — `applyClassifications()` with transaction, gap auto-creation, audit logging
- Full API route set (GET templates, POST respond, POST complete, GET sessions)
- Admin editor UI (`ConversationTemplateEditor.tsx`) for visual tree building
- `business-context.ts` — 15 keyword-pattern hints that reframe SAP jargon as plain business questions

**Blockers:**
1. **ConversationTemplate table is EMPTY.** No seed data, no migration inserts, no seeding scripts. The spec planned 3 sample templates (J60, J14, BD2) — never implemented.
2. **Template authoring is entirely manual.** Each template must be hand-crafted per scope item per step via the admin API or editor UI. For 460+ classifiable steps in J60 alone, this requires massive authoring effort.
3. **No auto-generation pipeline.** There is no script or AI-assisted tool to generate `QuestionFlow` JSON from `parsedContent` or `actionInstructionsHtml`.
4. **ReviewShell has no mode toggle.** No UI mechanism exists to switch between "step-by-step review" and "conversation mode" — the insertion point exists but the toggle needs to be built.

**To unblock:**
- Build an auto-generation pipeline that converts `parsedContent` + `business-context.ts` hints into `QuestionFlow` JSON
- Add a mode toggle to ReviewShell (step mode vs. conversation mode)
- Seed at least 3 templates (J60, J59, J45) for validation

---

### Enhancement C: Implications Panel

> Show modules, config, master data, and dependencies per classification

**Verdict: PARTIALLY READY — BLOCKED BY DATA GAPS**

**Supporting infrastructure (exists):**
- `ParsedStepContent` has `masterData`, `roles`, `systemAccess`, `prerequisites` fields
- `ConfigItem[]` data is already loaded per scope item in ReviewShell
- `StepReviewCard` receives both `step.parsedContent` and `configs` props
- `PROCESS_LANDSCAPES` chains show cross-scope-item dependencies
- `GapResolution` model has `resolutionType` (8 types including BTP_EXT, ISV, CUSTOM_ABAP)
- Step grouper carries `processFlowName` and `solutionProcessName` for context

**Blockers:**
1. **parsedContent quality is poor for implications.** Most SAP steps lack section markers → all structured fields are `null`, everything falls into `mainInstructions`. The `masterData` field is only populated when SAP HTML has a `<p>Master Data</p>` header — many steps reference master data inline.
2. **No "affected SAP modules" field exists.** Neither `ParsedStepContent` nor `ProcessStep` has a module/component identifier (e.g., "FI-AP", "MM-PUR"). This is critical for an implications panel.
3. **No "configuration objects" field.** `ConfigItem` data exists but is keyed per scope item, not per step. There is no step-level config impact mapping.
4. **No cross-step dependency data.** While `PROCESS_LANDSCAPES` shows chain-level scope item relationships, there is no step-level dependency graph (e.g., "if Step 42 is GAP, Steps 43-45 are affected").
5. **API routes don't return parsedContent.** Neither catalog steps endpoint selects `parsedContent` — it would need to be added or parsed client-side (which already works as a fallback in StepReviewCard).

**To unblock:**
- Run the `scripts/parse-step-content.ts` backfill to populate `parsedContent` in DB
- Add `parsedContent` to the steps API response
- Enrich `ProcessStep` with an `affectedModules` field (could be derived from `solutionProcessName` + scope item area mapping)
- Build a step-level config mapping (which config items apply to which steps, not just scope items)
- For cross-step dependencies: derive from ProcessFlow groupings — steps within the same flow are implicitly dependent

---

### Summary Table

| Enhancement | Status | Key Blocker |
|---|---|---|
| A: Business Process Area Grouping | **READY** | Minor: 3/6 target scope items unmapped in PROCESS_LANDSCAPES |
| B: Business Question Abstraction | **BLOCKED** | ConversationTemplate table is empty; no auto-generation pipeline; no mode toggle UI |
| C: Implications Panel | **PARTIALLY READY** | parsedContent quality insufficient; no module/config-per-step mapping; no cross-step dependencies |
