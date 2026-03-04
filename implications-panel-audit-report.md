# ABEAM V2 — ImplicationsPanel Rendering Pipeline Audit Report

**Date**: 2026-03-02
**Auditor**: Source code analysis (no browser, no HTTP)
**Files Audited**: 4 components + 1 constants file + 1 unit test

---

## EXECUTIVE SUMMARY

The ImplicationsPanel **does show different, meaningful, type-specific content** for each of the 4 classification types (FIT, CONFIGURE, GAP, NA). Headers, effort badges, description text, and several structural sections change correctly per fitStatus. However, the panel has **one significant structural gap**: CONFIGURE shows no effort escalation from FIT (both get the activity's base `effortCategory`), which is a design inconsistency since GAP correctly escalates effort. Additionally, there is no "What Happens Next" guidance section in any type — guidance is limited to the `descriptionText` pulled from `defaultImplications`.

**Verdict: The panel is functionally correct with real data differentiation across all 4 types, but has 3 missing sections and 2 logic gaps that should be fixed before client demos.**

---

## COMPONENT DETAILS

| Property | Value |
|---|---|
| File path | `src/components/review/ImplicationsPanel.tsx` |
| Line count | 303 |
| Parent component | `BusinessQuestionCard.tsx` (line 368) |
| Grandparent | `ReviewShell.tsx` (line 900) |
| Props interface | `ImplicationsPanelProps` (8 props) |
| Data assembly fn | `assembleImplicationsData()` (exported, unit tested) |
| Unit tests | `tests/unit/implications-assembly.test.ts` (8 tests) |
| Data sources | `scope-item-metadata.ts` (6 scope items, 179 activity patterns) |

---

## RENDERING TREE

```
ReviewShell.tsx
  └─ BusinessQuestionCard.tsx (per activity)
       ├─ Activity header (title, step counts, aggregate status badge)
       ├─ Business question text (from activityMetadata.businessQuestion)
       ├─ "Think about" hint (from activityMetadata.thinkAbout)
       ├─ 4 classification buttons (FIT / CONFIGURE / GAP / NA)
       ├─ Conflict warning (if steps have mixed classifications)
       ├─ Notes section (CONDITIONAL per fitStatus):
       │    ├─ GAP: amber box, "Tell Us How Your Process Differs", required ≥10 chars
       │    └─ CONFIGURE: blue box, "What Configuration Do You Need?", optional
       └─ ImplicationsPanel.tsx (shows ONLY when aggregateStatus ≠ PENDING/MIXED)
            ├─ Toggle header bar (colored per type + effort badge)
            └─ Expanded content (when isExpanded=true):
                 ├─ Description text (per-type from defaultImplications)
                 ├─ [NA only] "Impact of Excluding" warning box
                 ├─ [NOT NA] Modules + Config/RICEFW grid:
                 │    ├─ Left column: "Affected Modules" (code badge + business name)
                 │    └─ Right column:
                 │         ├─ [FIT/CONFIGURE] "Configuration Areas" bullet list
                 │         └─ [GAP] "RICEFW Considerations" text + config areas
                 ├─ [NOT NA] "Master Data Required" (name + SAP code badge + description)
                 └─ Dependencies ("Scope Dependencies" or "Related Decisions" for NA)
```

---

## CONTENT BY CLASSIFICATION TYPE

### FIT (Matches)

| Section | Renders? | Content Source | Content Quality | Notes |
|---|---|---|---|---|
| Header text | YES | `STATUS_CONFIG.FIT.label` | Hardcoded: **"✓ Standard Implementation"** | Green bg, green text |
| Effort badge | YES | `actMeta.effortCategory` (no escalation) | Data-driven from metadata | Shows activity's base effort (low/medium) |
| Description | YES | `implications.fitDescription` | Scope-level, business language | e.g., "SAP standard accounts payable processing will be configured as-is..." |
| Modules | YES | `actMeta.modules` filtered against `scopeMeta.modules` | Code badge + business name | e.g., `FI-AP` Accounts Payable |
| Config areas | YES | `actMeta.configAreas` | Bullet list, business-readable | e.g., "Tolerance groups", "Tax codes" |
| Master data | YES | `actMeta.masterDataNeeded` filtered against `scopeMeta.masterData` | Name + SAP code + description | e.g., "Supplier Master `BND` — Vendors with payment terms..." |
| Dependencies | YES | `scopeMeta.dependencies` (scope-level, same for all activities) | Badge + name + reason | Color-coded by type (required/recommended/optional) |
| RICEFW | NO | N/A | N/A | Correct — not applicable for FIT |
| Exclusion impact | NO | N/A | N/A | Correct — not applicable for FIT |
| "What Happens Next" | **NO** | **Not implemented** | **MISSING** | No guidance on next steps |
| Notes field | NO (in ImplicationsPanel) | Handled by parent `BusinessQuestionCard` | Not visible for FIT | Correct — notes are optional/hidden for FIT |

### CONFIGURE (Needs Adjustment)

| Section | Renders? | Content Source | Content Quality | Notes |
|---|---|---|---|---|
| Header text | YES | `STATUS_CONFIG.CONFIGURE.label` | Hardcoded: **"⚙ Configuration Required"** | Blue bg, blue text — **DIFFERENT from FIT** |
| Effort badge | YES | `actMeta.effortCategory` (no escalation) | Data-driven | **SAME as FIT** — no escalation for CONFIGURE |
| Description | YES | `implications.configureDescription` | Scope-level, business language | **DIFFERENT from FIT**: e.g., "...with configuration adjustments. Typically involves modifying payment terms, approval thresholds..." |
| Modules | YES | Same logic as FIT | Same content as FIT (correct) | Modules are activity-specific, not status-specific |
| Config areas | YES | Same as FIT | Same content, same label | Label: "Configuration Areas" — same as FIT |
| Master data | YES | Same as FIT | Same content | Correct — master data doesn't change by status |
| Dependencies | YES | Same as FIT | Same content | Correct — dependencies are scope-level |
| Notes field | YES (in parent) | `BusinessQuestionCard` line 349-361 | Blue box: "What Configuration Do You Need?" | Optional, no minimum length |

**Differences from FIT**: Header (text + color), description text. Everything else identical.

### GAP (Doesn't Match)

| Section | Renders? | Content Source | Content Quality | Notes |
|---|---|---|---|---|
| Header text | YES | `STATUS_CONFIG.GAP.label` | Hardcoded: **"⚠ Custom Development / Alternative"** | Amber bg, amber text — **DIFFERENT** |
| Effort badge | YES | **ESCALATED**: low→medium, medium→high | Code at line 70-72 | **DIFFERENT from FIT/CONFIGURE** |
| Description | YES | `implications.gapDescription` | **DIFFERENT**: "...differs significantly from SAP standard. Requires gap resolution workshop..." | Mentions gap resolution workshop |
| Modules | YES | Same activity-based logic | Same content (correct) | Still shows affected modules |
| RICEFW section | **YES** | Hardcoded explanatory text + configAreas | "A gap resolution workshop will determine whether this requires a Report, Interface, Conversion, Enhancement, Form, or Workflow (RICEFW) object." | **UNIQUE TO GAP** — config areas shown under RICEFW heading |
| Config areas | Merged into RICEFW | Shown as bullet list under RICEFW | Same data, different framing | Label changes from "Configuration Areas" to "RICEFW Considerations" |
| Master data | YES | Same as FIT | Same content | Correct |
| Dependencies | YES | Same as FIT | Same content | Correct |
| Impact assessment | **NO** | **Not implemented** | **MISSING** | No timeline/budget impact section |
| Resolution options | **NO** | **Not implemented** | **MISSING** | No list of resolution types (Custom ABAP, BTP, ISV, etc.) |
| Notes field | YES (in parent) | `BusinessQuestionCard` line 333-348 | Amber box: "Tell Us How Your Process Differs" | **REQUIRED ≥10 chars**, validation shown |

### NA (Not Relevant)

| Section | Renders? | Content Source | Content Quality | Notes |
|---|---|---|---|---|
| Header text | YES | `STATUS_CONFIG.NA.label` | Hardcoded: **"— Out of Scope"** | Slate bg, slate text — **DIFFERENT** |
| Effort badge | YES | `actMeta.effortCategory` (no escalation) | Shows base effort | **BUG**: Should show "None" or hide entirely for NA |
| Description | YES | `implications.naDescription` | **DIFFERENT**: "This accounts payable capability is not needed for your organization." | Short, clear |
| Exclusion impact | **YES** | `implications.naImpact` | Amber warning box: "Impact of Excluding" | **UNIQUE TO NA** — e.g., "Excluding AP capabilities may affect your ability to process supplier invoices..." |
| Modules | **NO** | Hidden by `fitStatus !== "NA"` condition (line 177) | Correct — modules not relevant for excluded items | |
| Config areas | **NO** | Hidden (same condition) | Correct | |
| Master data | **NO** | Hidden by `fitStatus !== "NA"` condition (line 237) | Correct | |
| Dependencies | YES | `scopeMeta.dependencies` | Label changes to **"Related Decisions"** | **DIFFERENT label** + different sub-text: "Verify that {dep.name} covers this scenario if it is in scope." |
| Reversibility | **NO** | **Not implemented** | **MISSING** | No "you can change this later" reassurance |
| Notes field | NO (in parent) | Not shown for NA in `BusinessQuestionCard` | Correct — no notes needed for exclusion | |

---

## CONTENT DIFFERENTIATION MATRIX

| Section | FIT | CONFIGURE | GAP | NA | Different Across Types? |
|---|---|---|---|---|---|
| Header text | "✓ Standard Implementation" | "⚙ Configuration Required" | "⚠ Custom Development / Alternative" | "— Out of Scope" | **YES** (all 4 different) |
| Header color | Green | Blue | Amber | Slate | **YES** |
| Effort level | Base (from metadata) | Base (from metadata) | **Escalated** (+1 level) | Base (from metadata) | **PARTIAL** — GAP escalates, but CONFIGURE doesn't, and NA shows effort when it shouldn't |
| Description text | `fitDescription` | `configureDescription` | `gapDescription` | `naDescription` | **YES** (all 4 different, scope-specific) |
| Modules | Activity-filtered list | Same | Same | **Hidden** | **YES** (NA hides) |
| Config areas | "Configuration Areas" | "Configuration Areas" | "RICEFW Considerations" | **Hidden** | **YES** (GAP reframes, NA hides) |
| RICEFW explainer | Not shown | Not shown | **Shown** (hardcoded paragraph) | Not shown | **YES** (GAP only) |
| Master data | Activity-filtered list | Same | Same | **Hidden** | **YES** (NA hides) |
| Dependencies label | "Scope Dependencies" | "Scope Dependencies" | "Scope Dependencies" | **"Related Decisions"** | **YES** (NA relabeled) |
| Dependencies sub-text | `dep.reason` | `dep.reason` | `dep.reason` | "Verify that {name} covers this scenario" | **YES** (NA different) |
| Exclusion impact | Not shown | Not shown | Not shown | **Shown** (amber warning) | **YES** (NA only) |
| Notes (in parent) | Hidden | Optional (blue box) | Required ≥10 chars (amber box) | Hidden | **YES** |

**Verdict: 11 of 12 sections differentiate across types. The panel is NOT identical — it genuinely changes per classification choice.**

---

## SAMPLE ACTIVITY TRACES (3 Activities × 4 Types)

### Activity 1: J60 — "Invoice Entry without Purchase Order"

**Metadata match**: YES → pattern `"Invoice Entry without Purchase Order"` at line 165

| Field | Value |
|---|---|
| businessQuestion | "Do you receive invoices that don't reference a purchase order?" |
| thinkAbout | "Think about: do you get invoices for services, utilities, rent, or other expenses that aren't tied to a purchase order?" |
| modules | `["FI-AP", "FI-GL"]` |
| configAreas | `["Tolerance groups", "Tax codes", "G/L account determination"]` |
| masterDataNeeded | `["Supplier Master", "G/L Account Master"]` |
| effortCategory | `"low"` |

#### FIT Panel
- **Header**: "✓ Standard Implementation" (green)
- **Effort**: "Low Effort" (green badge)
- **Description**: "SAP standard accounts payable processing will be configured as-is. Your AP team will follow SAP best practice workflows for invoice entry, payment processing, and reporting."
- **Modules**: `FI-AP` Accounts Payable, `FI-GL` General Ledger (2 of 4 scope modules, correctly filtered)
- **Config areas**: Tolerance groups, Tax codes, G/L account determination (3 items)
- **Master data**: Supplier Master (`BND`) — "Vendors with payment terms...", G/L Account Master (`BNG`) — "Expense and balance sheet accounts..."
- **Dependencies**: J58 (required), J45 (recommended), BFB (required), 1EG (recommended), J77 (optional)
- **Notes**: Hidden

#### CONFIGURE Panel
- **Header**: "⚙ Configuration Required" (blue)
- **Effort**: "Low Effort" (green badge) — **same as FIT, no escalation**
- **Description**: "Your accounts payable process will use SAP standard with configuration adjustments. This typically involves modifying payment terms, approval thresholds, tolerance groups, or output formats to match your specific requirements."
- **Modules/Config/MasterData/Dependencies**: Same as FIT
- **Notes**: Blue box "What Configuration Do You Need?" — optional

#### GAP Panel
- **Header**: "⚠ Custom Development / Alternative" (amber)
- **Effort**: "Medium Effort" (amber badge) — **escalated from low to medium**
- **Description**: "Your accounts payable process differs significantly from SAP standard. This will require a gap resolution workshop to determine the best approach: custom development, a third-party solution, or adapting your process to align closer with SAP."
- **Modules**: Same 2 modules (FI-AP, FI-GL)
- **RICEFW section**: "A gap resolution workshop will determine whether this requires a Report, Interface, Conversion, Enhancement, Form, or Workflow (RICEFW) object." + bullet list: Tolerance groups, Tax codes, G/L account determination
- **Master data/Dependencies**: Same
- **Notes**: Amber box "Tell Us How Your Process Differs" — **required ≥10 chars**

#### NA Panel
- **Header**: "— Out of Scope" (slate)
- **Effort**: "Low Effort" — **BUG: should be hidden or "None"**
- **Description**: "This accounts payable capability is not needed for your organization."
- **Exclusion impact**: "Excluding AP capabilities may affect your ability to process supplier invoices, make payments, and generate AP reports within SAP. Verify that an alternative system or process will handle these functions."
- **Modules/Config/Master data**: All hidden (correct)
- **Dependencies**: Relabeled "Related Decisions" with text "Verify that Accounting & Financial Close covers this scenario if it is in scope."
- **Notes**: Hidden

---

### Activity 2: J59 — "Create Dunning Notices" (matches pattern "Dunning")

**Metadata match**: YES → pattern `"Dunning"` at line 707

| Field | Value |
|---|---|
| businessQuestion | "Do you send payment reminders to customers who haven't paid on time?" |
| thinkAbout | "Think about: how many dunning levels do you use? Do you send letters, emails, or both? What escalation path do you follow?" |
| modules | `["FI-AR"]` |
| configAreas | `["Dunning procedures", "Dunning levels", "Output templates", "Dunning areas"]` |
| masterDataNeeded | `["Customer Master"]` |
| effortCategory | `"medium"` |

#### FIT Panel
- **Header**: "✓ Standard Implementation" (green)
- **Effort**: "Medium Effort" (amber badge)
- **Modules**: `FI-AR` Accounts Receivable (1 of 3 scope modules, correctly filtered)
- **Config areas**: 4 items (Dunning procedures, Dunning levels, Output templates, Dunning areas)
- **Master data**: Customer Master (`BND`) — "Customers with payment terms, credit limits, and dunning procedures"
- **Description**: "SAP standard accounts receivable processing will be configured as-is..."

#### CONFIGURE Panel
- **Effort**: "Medium Effort" — same as FIT (no escalation)
- **Description**: "...with configuration adjustments. Typically involves modifying dunning procedures, payment terms, credit limits, or output formats."

#### GAP Panel
- **Effort**: "High Effort" (red badge) — **escalated from medium to high**
- **RICEFW section**: Present with 4 config areas listed under RICEFW heading

#### NA Panel
- **Effort**: "Medium Effort" — **BUG: should be hidden/None**
- **Exclusion impact**: "Excluding AR capabilities may affect your ability to invoice customers, collect payments, and generate receivables reports within SAP."

---

### Activity 3: J45 — "Create Purchase Order" (matches pattern "Create Purchase Order")

**Metadata match**: YES → pattern `"Create Purchase Order"` at line 1004

| Field | Value |
|---|---|
| businessQuestion | "How are purchase orders created in your company?" |
| thinkAbout | "Think about: do you create POs manually, from requisitions, or from contracts?" |
| modules | `["MM-PUR"]` |
| configAreas | `["PO types", "Number ranges", "Output determination"]` |
| masterDataNeeded | `["Supplier Master", "Material Master", "Purchasing Info Record"]` |
| effortCategory | `"medium"` |

#### FIT Panel
- **Modules**: `MM-PUR` Purchasing (1 of 4 scope modules)
- **Config areas**: 3 items
- **Master data**: 3 items (Supplier Master, Material Master, Purchasing Info Record)
- **Dependencies**: J60 (required), J58 (required), 1YB (recommended)

#### GAP Panel
- **Effort**: "High Effort" — escalated from medium
- **RICEFW**: Present with PO types, Number ranges, Output determination listed

#### NA Panel
- **Exclusion impact**: "Excluding procurement capabilities may affect your ability to manage purchase orders, track goods receipts, and verify supplier invoices within SAP."

---

## DATA FLOW GAPS

| Section | Component Expects | Data Source | Data Exists? | Severity |
|---|---|---|---|---|
| Effort for NA | Shows activity's base effort | `assembleImplicationsData` returns base effort for NA | YES but **wrong** — NA should show "None" | **HIGH** — misleading to show "Medium Effort" for an excluded process |
| Effort for CONFIGURE | Shows base effort (no escalation) | `assembleImplicationsData` only escalates for GAP | YES but **incomplete** — CONFIGURE should show at least equal or +0 with visual differentiation | **MEDIUM** — not misleading but inconsistent with GAP behavior |
| "What Happens Next" | Not implemented | N/A | N/A | **MEDIUM** — would help user understand the workflow |
| GAP impact assessment | Not implemented | N/A | N/A | **MEDIUM** — no timeline/budget guidance |
| GAP resolution options | Not implemented | N/A | N/A | **LOW** — RICEFW text partially covers this |
| NA reversibility | Not implemented | N/A | N/A | **LOW** — would reduce user anxiety about excluding |
| Config area label for CONFIGURE | Shows "Configuration Areas" (same as FIT) | Hardcoded label | Exists but **could be better** | **LOW** — could say "Areas Needing Adjustment" for CONFIGURE |

---

## IMPLEMENTATION STATUS

| Required Section | FIT | CONFIGURE | GAP | NA |
|---|---|---|---|---|
| Header with type-specific text | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Header with type-specific color | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Effort level (correct per type) | IMPLEMENTED | PARTIAL (no escalation) | IMPLEMENTED (escalated) | **BUG** (shows effort, should show None) |
| Description (type-specific) | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED |
| Modules with business names | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | N/A (hidden, correct) |
| Config areas (readable) | IMPLEMENTED | IMPLEMENTED | N/A (reframed as RICEFW) | N/A (hidden, correct) |
| Master data requirements | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | N/A (hidden, correct) |
| Dependencies with reasons | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED (relabeled) |
| RICEFW considerations | N/A | N/A | IMPLEMENTED | N/A |
| Exclusion impact | N/A | N/A | N/A | IMPLEMENTED |
| Notes field (correct validation) | N/A (hidden) | IMPLEMENTED (optional) | IMPLEMENTED (required ≥10) | N/A (hidden) |
| "What Happens Next" guidance | **MISSING** | **MISSING** | **MISSING** | **MISSING** |
| Resolution options list | N/A | N/A | **MISSING** | N/A |
| Reversibility reassurance | N/A | N/A | N/A | **MISSING** |

---

## CONDITIONAL RENDERING LOGIC (Complete)

| Line | Condition | Controls | Behavior |
|---|---|---|---|
| 123 | `fitStatus === "PENDING" \|\| !statusCfg` | Entire panel | Returns null — panel invisible for PENDING |
| 126-130 | `fitStatus === "FIT"/"CONFIGURE"/"GAP"/"NA"` | `descriptionText` variable | Selects correct description from `implications` |
| 158 | `descriptionText && (...)` | Description paragraph | Hidden if no implications data |
| 165 | `fitStatus === "NA" && implications?.naImpact` | "Impact of Excluding" box | **NA only** — shows amber warning |
| 177 | `fitStatus !== "NA" && (modules \|\| configs)` | Modules + config grid | **Hidden for NA** |
| 199 | `fitStatus === "GAP"` | RICEFW section vs Config section | **GAP gets RICEFW**, FIT/CONFIGURE get plain config list |
| 218 | `data.configAreas.length > 0` (else branch) | Config area list | Shows only if config data exists |
| 237 | `fitStatus !== "NA" && masterData.length > 0` | Master data section | **Hidden for NA** |
| 259 | `data.dependencies.length > 0` | Dependencies section | Shows for ALL types (with label variation) |
| 262 | `fitStatus === "NA"` | Dependencies label | "Related Decisions" vs "Scope Dependencies" |
| 282 | `fitStatus === "NA"` | Dependencies sub-text | "Verify that {name} covers this..." vs `dep.reason` |

**In `BusinessQuestionCard.tsx` (parent):**

| Line | Condition | Controls | Behavior |
|---|---|---|---|
| 331 | `!isReadOnly && status !== "PENDING" && status !== "MIXED"` | Notes section visibility | Notes appear only after classification |
| 333 | `aggregateStatus === "GAP"` | GAP notes box | Amber box, required ≥10 chars |
| 349 | `aggregateStatus === "CONFIGURE"` | CONFIGURE notes box | Blue box, optional |
| 366 | `aggregateStatus !== "PENDING" && !== "MIXED"` | ImplicationsPanel mounting | Panel only mounts after classification |

---

## CRITICAL FINDINGS

### 1. NA Shows Effort Badge (BUG — HIGH)
When a user marks an activity as "Not Relevant", the panel displays an effort badge like "Medium Effort" or "Low Effort". This is misleading — if the process is excluded, there IS no effort. The effort badge should either be hidden for NA or display "None".

**Location**: `ImplicationsPanel.tsx` line 149 — effort badge always renders, no NA check.
**Fix**: Add `fitStatus !== "NA"` condition before rendering the effort badge, or set effort to a "none" value for NA in `assembleImplicationsData`.

### 2. CONFIGURE Does Not Escalate Effort (DESIGN GAP — MEDIUM)
The `assembleImplicationsData` function at line 70-72 only escalates effort for GAP (low→medium, medium→high). CONFIGURE gets the same effort as FIT. This means a user who clicks "Needs Adjustment" sees the same effort badge as "Matches", which may confuse expectations about implementation complexity.

**Location**: `ImplicationsPanel.tsx` line 68-72.
**Consider**: Whether CONFIGURE should also escalate (e.g., low stays low, but medium stays medium with visual differentiation).

### 3. No "What Happens Next" Section (MISSING — MEDIUM)
None of the 4 panel types include guidance on what happens after the user makes their choice. This would help users understand the workflow:
- FIT: "This will be included in your standard configuration workbook."
- CONFIGURE: "Your configuration needs will be captured in the config workbook for the implementation team."
- GAP: "This will be added to the gap register. A resolution workshop will determine the approach."
- NA: "This process will not be included in the SAP implementation. You can change this decision at any time during the assessment."

### 4. `__main_process__` / `__main_flow__` Correctly Hidden (GOOD)
The `ReviewShell.tsx` at lines 887-889 correctly hides placeholder names:
```tsx
const displayProcess = processName.startsWith("__") ? null : processName;
const displayFlow = flowName.startsWith("__") ? null : flowName;
```
This means the placeholder hierarchy data never reaches the user. **Not a bug.**

---

## RECOMMENDATIONS

### Must Fix (panel is misleading)
1. **Hide effort badge for NA**: Add `{fitStatus !== "NA" && (...)}` around the Badge at line 149, or render "Not Applicable" text instead.

### Should Fix (panel is incomplete)
2. **Add "What Happens Next" guidance**: Add a small section at the bottom of the expanded content with type-specific guidance text. 4 hardcoded strings, ~15 lines of JSX.
3. **Consider CONFIGURE effort escalation**: Discuss whether CONFIGURE should show elevated effort or visual indicator vs. FIT. If yes, add escalation logic for CONFIGURE in `assembleImplicationsData`.
4. **Differentiate config area labels**: For CONFIGURE, change "Configuration Areas" to "Areas Needing Adjustment" to signal that these aren't just informational — they need work.

### Implementation Needed (section doesn't exist yet)
5. **GAP resolution options list** (LOW effort): Below the RICEFW text, add a short list of resolution approaches: "Custom Development", "Third-party Solution (ISV)", "BTP Extension", "Process Adaptation". These could be hardcoded or data-driven. ~20 lines of JSX.
6. **NA reversibility reassurance** (LOW effort): Add a small text: "You can change this decision at any time during the assessment." ~5 lines of JSX.
7. **GAP impact assessment** (MEDIUM effort): Add timeline/budget impact guidance. Could be effort-category-driven (medium → "Moderate impact on timeline", high → "Significant impact"). ~15 lines of JSX.

---

## UNIT TEST COVERAGE

The `assembleImplicationsData` function has 8 unit tests covering:
- Module filtering by activity metadata
- Config areas from activity
- Master data filtering
- Dependency passthrough
- **GAP effort escalation** (low→medium, medium→high, high stays high)
- **FIT/CONFIGURE no escalation** (verified)
- Null activity metadata (falls back to all scope modules/master data)
- Null scope metadata (returns empty arrays)
- Real J60 data integration test

**Missing test**: NA effort should be "none" (once the bug is fixed).

---

## FILES REFERENCED

| File | Lines | Role |
|---|---|---|
| `src/components/review/ImplicationsPanel.tsx` | 303 | The audited component |
| `src/components/review/BusinessQuestionCard.tsx` | 460 | Parent — handles classification buttons, notes, panel mounting |
| `src/components/review/ReviewShell.tsx` | ~1080 | Grandparent — fetches data, passes metadata, handles activity classification |
| `src/constants/scope-item-metadata.ts` | 1961 | Authoritative data source — 6 scope items, 179 patterns, 6 defaultImplications |
| `tests/unit/implications-assembly.test.ts` | 225 | Unit tests for data assembly logic |
