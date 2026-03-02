# APTUS V2 — Content Quality + Decision Experience Audit Report

**Date**: 2026-03-02
**Assessment**: cmm8ll1z104o776v34aydbefg (pending_validation, 6 scope items)
**Data**: 316 activities, 1,462 classifiable steps across 6 scope items

---

## EXECUTIVE SUMMARY

APTUS has **94% metadata coverage** across 316 real activities, with **72% Excellent+Good** question quality and **100% jargon-free** questions. 100% of questions are answerable by a business user. **APTUS is conditionally ready for demos** — the curated scope items have strong content, but uncovered activities show raw SAP data.

---

## DEMO READINESS SCORECARD

| Criterion | Score | Target | Status |
|---|---|---|---|
| Metadata coverage (% of activities with content) | 94% | ≥80% | PASS |
| Question quality (% Excellent + Good) | 72% | ≥80% | FAIL |
| Jargon-free (% with zero SAP jargon in questions) | 100% | 100% | PASS |
| Answerability (% CLEAR + NEEDS_CONTEXT) | 100% | ≥90% | PASS |
| Implications panel completeness | 100% | ≥90% | PASS |
| Cross-scope differentiation | 100% | 100% | PASS |
| Estimated assessment time per scope item | 32m, 26m, 15m, 16m, 9m, 7m | 15-30 min | CHECK |

---

## PART 1: METADATA COVERAGE

| Scope Item | Real Activities | Metadata Patterns | Matched | Unmatched Activities | Orphan Patterns | Coverage % |
|---|---|---|---|---|---|---|
| J60 (Accounts Payable) | 86 | 53 | 77 | 9 | 4 | 88% |
| J59 (Accounts Receivable) | 72 | 32 | 72 | 0 | 0 | 100% |
| J45 (Procurement of Direct Materials) | 78 | 31 | 70 | 8 | 0 | 79% |
| 1NT (Project Financial Control) | 36 | 29 | 35 | 1 | 1 | 97% |
| BDW (Returnables Processing) | 27 | 18 | 25 | 2 | 0 | 90% |
| 2ET (Non-Stock Sales Orders) | 17 | 16 | 17 | 0 | 0 | 100% |
| **TOTAL** | **316** | **179** | **296** | **20** | **5** | **94%** |

### Unmatched Activities (no business question — user sees raw SAP data)

**J60** (9 unmatched):
- Schedule Payment Proposals ← BUSINESS ACTIVITY (needs content)
- Revise Payment Proposal ← BUSINESS ACTIVITY (needs content)
- Release Payment Proposal ← BUSINESS ACTIVITY (needs content)
- Approval by First Approver ← BUSINESS ACTIVITY (needs content)
- Rejection ← BUSINESS ACTIVITY (needs content)
- Approval by Second Approver ← BUSINESS ACTIVITY (needs content)
- Create Team ← BUSINESS ACTIVITY (needs content)
- Create Workflow ← BUSINESS ACTIVITY (needs content)
- Generic Withholding Tax Report ← BUSINESS ACTIVITY (needs content)

**J59**: All activities matched.

**J45** (8 unmatched):
- Procurement of Stock Material: Check Goods Receipt Details (Optional) ← BUSINESS ACTIVITY (needs content)
- Procurement of Stock Material: Analyze Material Document (Optional) ← BUSINESS ACTIVITY (needs content)
- Procurement of Stock Material: Detect Critical Cash Discount Situations (Optional) ← BUSINESS ACTIVITY (needs content)
- Procurement of Stock Material: React to Critical Cash Discount Situations (Optional) ← BUSINESS ACTIVITY (needs content)
- Procurement of Stock Material: Check Supplier Invoice List (Optional) ← BUSINESS ACTIVITY (needs content)
- Procurement of Stock Material: Approve Supplier Invoice (Optional) ← BUSINESS ACTIVITY (needs content)
- Procurement of Stock Material: Reverse Invoice (Optional) ← BUSINESS ACTIVITY (needs content)
- Procurement of Stock Material: Cancel Journal Entry (Optional) ← BUSINESS ACTIVITY (needs content)

**1NT** (1 unmatched):
- Monitor Notification (Optional) ← BUSINESS ACTIVITY (needs content)

**BDW** (2 unmatched):
- Delivery Process for Returnable Materials (Optional) ← BUSINESS ACTIVITY (needs content)
- Create Outbound Delivery w/o Order Reference ← BUSINESS ACTIVITY (needs content)

**2ET**: All activities matched.

### Orphan Patterns (metadata written but never displayed)

**J60**: Schedule Proposal, Revise Proposal, Release Proposal, AP Overview
**J59**: No orphan patterns.
**J45**: No orphan patterns.
**1NT**: P&L Plan
**BDW**: No orphan patterns.
**2ET**: No orphan patterns.

---

## PART 2: QUESTION QUALITY

| Scope Item | Total Qs | Excellent | Good | Generic | Jargon | Missing | E+G % |
|---|---|---|---|---|---|---|---|
| J60 (Accounts Payable) | 77 | 52 | 13 | 12 | 0 | 0 | 84% |
| J59 (Accounts Receivable) | 72 | 11 | 41 | 20 | 0 | 0 | 72% |
| J45 (Procurement of Direct Materials) | 70 | 23 | 8 | 39 | 0 | 0 | 44% |
| 1NT (Project Financial Control) | 35 | 9 | 23 | 3 | 0 | 0 | 91% |
| BDW (Returnables Processing) | 25 | 14 | 5 | 6 | 0 | 0 | 76% |
| 2ET (Non-Stock Sales Orders) | 17 | 7 | 7 | 3 | 0 | 0 | 82% |
| **TOTAL** | **296** | **116** | **97** | **83** | **0** | **0** | **72%** |

### Top 10 Best Questions
1. **J60** — Preparation of Payments: Netting of AR/AP Items (Optional): "Does your company offset receivables against payables for the same business partner?"
2. **J60** — Preparation of Payments: Available Amounts for Payment Program (Optional): "Do you need to check available cash before processing payments?"
3. **J60** — Park and Post Invoice: Park Invoice: "Do invoices go through a parking/approval step before posting?"
4. **J60** — Park and Post Invoice: Post Invoice: "Do invoices go through a parking/approval step before posting?"
5. **J60** — Recurring Supplier Invoices: Create Recurring Supplier Invoice: "Do you have recurring supplier invoices (e.g., rent, subscriptions, maintenance contracts)?"
6. **J60** — Recurring Supplier Invoices: Review Recurring Supplier Invoice: "Do you have recurring supplier invoices (e.g., rent, subscriptions, maintenance contracts)?"
7. **J60** — Recurring Supplier Invoices: Schedule Recurring Supplier Invoice Posting: "Do you have recurring supplier invoices (e.g., rent, subscriptions, maintenance contracts)?"
8. **J60** — Mass Upload: Mass Import for Supplier Invoices: "Do you need to upload large batches of supplier invoices from external systems?"
9. **J60** — Invoice Payment Preparation: View Supplier Line Items: "How does your AP team review open supplier invoices?"
10. **J60** — Payment Run: "How do you batch-process payments to suppliers?"

### Top 10 Worst Questions (with suggested rewrites)


### Answerability Assessment
| Rating | Count | % | Target |
|---|---|---|---|
| CLEAR | 154 | 52% | — |
| NEEDS_CONTEXT | 142 | 48% | — |
| CONFUSING | 0 | 0% | — |
| IMPOSSIBLE | 0 | 0% | 0% |
| **CLEAR + NEEDS_CONTEXT** | **296** | **100%** | **≥90%** |

---

## PART 3: IMPLICATIONS PANEL ACCURACY

| Scope Item | Modules Correct | Config Readable | Config Jargon | Effort LOW/MED/HIGH | Distribution OK? |
|---|---|---|---|---|---|
| J60 | 77/77 | 173/173 | 0 | 53/24/0 (69% LOW) | YES |
| J59 | 72/72 | 164/164 | 0 | 49/23/0 (68% LOW) | YES |
| J45 | 70/70 | 226/226 | 0 | 52/18/0 (74% LOW) | YES |
| 1NT | 35/35 | 68/68 | 0 | 17/18/0 (49% LOW) | YES |
| BDW | 25/25 | 31/31 | 0 | 19/6/0 (76% LOW) | YES |
| 2ET | 17/17 | 36/36 | 0 | 9/8/0 (53% LOW) | YES |

### Dependency Map
| J60 (Accounts Payable) | J58 Accounting & Financial Close; J45 Procurement of Direct Materials; BFB Basic Cash Operations; 1EG Bank Statement Integration; J77 Advanced Bank Account Management | YES | YES | YES |
| J59 (Accounts Receivable) | J58 Accounting & Financial Close; BKP Sales Order Processing; 1EG Bank Statement Integration; 1EZ Credit Memo Processing | YES | YES | YES |
| J45 (Procurement of Direct Materials) | J60 Accounts Payable; J58 Accounting & Financial Close; 1YB Basic Warehouse Management | YES | YES | YES |
| 1NT (Project Financial Control) | J58 Accounting & Financial Close; J63 Cost Center Accounting; J45 Procurement of Direct Materials | YES | YES | YES |
| BDW (Returnables Processing) | BKP Sales Order Processing; J59 Accounts Receivable | YES | YES | YES |
| 2ET (Non-Stock Sales Orders) | J59 Accounts Receivable; J58 Accounting & Financial Close; BD6 Basic Credit Management | YES | YES | YES |

---

## PART 4: CROSS-SCOPE DIFFERENTIATION

| Comparison | J60 Content | J59 Content | J45 Content | Different? |
|---|---|---|---|---|
| Invoice | Do you receive invoices that don't reference a purchase order? | Do you create customer invoices that are not linked to a sales order? | How do you process supplier invoices for purchased materials? | YES |
| Payment | How do you batch-process payments to suppliers? | (none) | (n/a) | YES |
| Down Payment | Does your company make advance payments to suppliers before receiving goods or s | Does your company receive advance payments from customers before delivering good | (n/a) | YES |

### Scope Item Personality Scores
| Scope Item | Avg Primary Domain Terms/Q | Avg Wrong-Domain Terms/Q | Personality Score |
|---|---|---|---|
| J60 (Accounts Payable) | 2.81 | 0.03 | STRONG |
| J59 (Accounts Receivable) | 1.86 | 0 | STRONG |
| J45 (Procurement of Direct Materials) | 3 | 0 | STRONG |
| 1NT (Project Financial Control) | 1.81 | 0.03 | STRONG |
| BDW (Returnables Processing) | 2.28 | 0 | STRONG |
| 2ET (Non-Stock Sales Orders) | 2.23 | 0 | STRONG |

---

## PART 5: SAP JARGON AUDIT

| Severity | Count | Target | Status |
|---|---|---|---|
| CRITICAL | 2 | 0 | FAIL |
| HIGH | 107 | 0 | FAIL |
| MEDIUM | 105 | <15 | FAIL |
| LOW | 0 | <30 | PASS |

### CRITICAL Jargon Instances
- **[Placeholder process name in API]** in `hierarchy API`: "J60 process: __main_process__"
- **[Placeholder flow name in API]** in `hierarchy API`: "J60 flow: __main_flow__"

### HIGH Jargon Instances
- **[BRF+ reference]** in `J60/Additional Information/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps: Define Payment Medium Format Variants (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps: Define Payment Medium Format Variants (Optional)/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Payment Advice/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Supplier Balance Confirmation/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Payment List/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps: BRF+ Settings for Payment List/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps: Add Fields to Items (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps: Add Fields to Items (Optional)/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps: Maintain Business Users/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps: Maintain Business Users/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data/configArea`: "eDocument settings"
- **[eDocument reference]** in `J60/eDocument Cockpit/configArea`: "eDocument framework"
- **[BRF+ reference]** in `J60/Additional Information: Appendix: Display Process Flow Accounts Payable/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Appendix: Display Process Flow Accounts Payable/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J60/Additional Information: Monitor Payments/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J60/Additional Information: Monitor Payments/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: Define Accounting Clerk/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: Define Accounting Clerk/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: BRF+ Settings for Customer Balance Confirmation/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: BRF+ Settings for Item Interest Calculation/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Download Standard Template/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Upload Custom Template/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Assign Form Template/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: BRF+ Settings for Dunning Notice (Optional): Dunning Output Determination/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: BRF+ Settings for FI Customer Invoice/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: Manage Situation Types (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: Manage Situation Types (Optional)/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: Business Partner Master Data Maintenance for Electronic Invoicing (Optional)/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: Value Mapping for Electronic Invoicing (Optional)/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: Preliminary Steps for Electronic Invoicing/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: Add Fields to Items (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: Add Fields to Items (Optional)/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps: Assign Reason Codes For Write-Off/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps for eDocument Process: Maintain Business Partner Master Data/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Preliminary Steps for eDocument Process: Maintain Company Code Data/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Business Partner Master Data Maintenance for Electronic Invoicing (Optional)/configArea`: "eDocument settings"
- **[BRF+ reference]** in `J59/Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional)/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Value Mapping Maintenance for Electronic Invoicing (Optional)/configArea`: "eDocument settings"
- **[eDocument reference]** in `J59/Malaysia eInvoice: One-Time Customer (Optional)/configArea`: "eDocument framework"
- **[eDocument reference]** in `J59/eDocument Cockpit/configArea`: "eDocument monitoring"
- **[BRF+ reference]** in `J59/Additional Information: Appendix: Display Process Flow Accounts Receivable/configArea`: "BRF+ rules"
- **[eDocument reference]** in `J59/Additional Information: Appendix: Display Process Flow Accounts Receivable/configArea`: "eDocument settings"
- **[eDocument reference]** in `J45/Additional Information/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Create Purchasing Info Record (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Create Purchase Requisition/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Check Flexible Workflow for Purchase Order Approval/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Configure Flexible Workflow for Purchase Order/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Manage Conditions to Restart Flexible Workflow/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Create Ready-to-Use Situation Type for Cash Discount at Risk (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Create Team and Responsibilities (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Change Material Master Data - Purchasing Data/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Change Supplier Master Data - Purchasing Organization Data/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Generate Source List/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps: Edit User-Specific Parameters for Supplier Invoices (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Business Partner Master Data/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps for eDocument Process (Optional): Maintain Company Code Data/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps for eDocument Process (Optional): Define Process Communication Through Cloud Services/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Preliminary Steps for eDocument Process (Optional): Value Mapping Maintenance for Electronic Invoicing (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/eDocument Cockpit/configArea`: "eDocument monitoring"
- **[eDocument reference]** in `J45/Additional Information: Post Goods Receipt Blocked Stock/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Release Goods Receipt Blocked Stock/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Setup Mail Notification for Purchase Order Workflow/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Setup Mail Notification for Purchase Order Deadline/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Configure Deadline in Manage Workflows for Purchase Orders/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Change Material Master Data – For Free Goods/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Change Supplier Master Data - For Free Goods/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Create Purchase Order Manually for Free Goods/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Quantity Optimization for Purchase Order: Setup a Static Rounding Profile/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Quantity Optimization for Purchase Order: Maintain a Rounding Profile in the Purchasing Info Record/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Quantity Optimization for Purchase Order: Create Purchase Order with Quantity Optimization/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Quantity Optimization for Purchase Order: Simulate Quantity Optimizing/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Rework Flexible Workflow for Purchase Orders: Activate Inquiry Workflow for Purchase Orders/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Rework Flexible Workflow for Purchase Orders: Configure Rework Flexible Workflow for Purchase Orders/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Rework Flexible Workflow for Purchase Orders: Rework Purchase Order/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Output Parameter Determination for Purchase Orders Dunning Reminder/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Create Purchase Order for Dunning Reminder/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Dunning Reminder on Purchase Orders Advanced/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Schedule Dunning Reminder Output for Purchase Orders (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Maintain CDS Based Custom Attributes for Purchase Order Workflow (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Approve Purchase Order through Task Cards (Optional)/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Purchase Order Workflow Review: Configure Purchase Order Flexible Workflow for Review/configArea`: "eDocument setup"
- **[eDocument reference]** in `J45/Additional Information: Purchase Order Workflow Review: Review Purchase Order Items (Optional)/configArea`: "eDocument setup"

### Placeholder Audit (__main_process__ / __main_flow__)
| Where Found | Visible to Users? | Severity |
|---|---|---|
| Hierarchy API process.name (all 6 scope items) | Depends on UI rendering | CRITICAL if shown, OK if hidden |
| Hierarchy API flow.name (all 6 scope items) | Depends on UI rendering | CRITICAL if shown, OK if hidden |

> **Note:** The placeholders `__main_process__` and `__main_flow__` exist in the API because the SAP BPD 2508 XLSX source files lack solution process/flow data. They are a **data source limitation**, not a code bug. The UI should hide or relabel these levels.

---

## PART 6: PERSONA WALK-THROUGHS

### Farah — Finance Director (AP) (J60)
| Metric | Value |
|---|---|
| Business questions shown | 64 |
| Excellent + Good | 64 (100%) |
| Generic | 0 (0%) |
| Jargon | 0 (0%) |
| Estimated completion time | 32 min |
| Could complete in 15-30 min? | **NO** |

<details><summary>All 64 business questions (click to expand)</summary>

Q1: [GOOD] "How do you manage your supplier records?"
   Think about: "Think about: who creates and maintains supplier records in your company? What information do you track for each supplier..."
   If Matches: modules=[FI-AP], effort=low, config=[Business partner roles, Number ranges, Account groups]

Q2: [GOOD] "Do you need a centralized view of all your suppliers?"
   Think about: "Think about: how does your AP team currently look up supplier information? Do you need to search by name, location, or p..."
   If Matches: modules=[FI-AP], effort=low, config=[]

Q3: [EXCELLENT] "Does your company offset receivables against payables for the same business partner?"
   Think about: "Think about: do any of your business partners act as both a customer and a supplier? If so, do you net the amounts befor..."
   If Matches: modules=[FI-AP, FI-AR], effort=medium, config=[Netting agreements, Clearing rules]

Q4: [EXCELLENT] "Do you need to check available cash before processing payments?"
   Think about: "Think about: does your finance team check bank balances or cash availability before scheduling payment runs?..."
   If Matches: modules=[FI-AP, FI-BL], effort=low, config=[Cash position, Liquidity forecast]

Q5: [GOOD] "Do you receive invoices that don't reference a purchase order?"
   Think about: "Think about: do you get invoices for services, utilities, rent, or other expenses that aren't tied to a purchase order? ..."
   If Matches: modules=[FI-AP, FI-GL], effort=low, config=[Tolerance groups, Tax codes, G/L account determination]

Q6: [GOOD] "Do you receive invoices that don't reference a purchase order?"
   Think about: "Think about: do you get invoices for services, utilities, rent, or other expenses that aren't tied to a purchase order? ..."
   If Matches: modules=[FI-AP, FI-GL], effort=low, config=[Tolerance groups, Tax codes, G/L account determination]

Q7: [EXCELLENT] "Do invoices go through a parking/approval step before posting?"
   Think about: "Think about: can your AP clerks post invoices directly, or do they need to be reviewed and approved first? What are your..."
   If Matches: modules=[FI-AP], effort=medium, config=[Parking workflow, Approval rules, Authorization limits]

Q8: [EXCELLENT] "Do invoices go through a parking/approval step before posting?"
   Think about: "Think about: can your AP clerks post invoices directly, or do they need to be reviewed and approved first? What are your..."
   If Matches: modules=[FI-AP], effort=medium, config=[Parking workflow, Approval rules, Authorization limits]

Q9: [EXCELLENT] "Do you have recurring supplier invoices (e.g., rent, subscriptions, maintenance contracts)?"
   Think about: "Think about: do you receive the same invoice amount from certain suppliers every month? How do you handle these today - ..."
   If Matches: modules=[FI-AP], effort=medium, config=[Recurring entry templates, Schedule parameters]

Q10: [EXCELLENT] "Do you have recurring supplier invoices (e.g., rent, subscriptions, maintenance contracts)?"
   Think about: "Think about: do you receive the same invoice amount from certain suppliers every month? How do you handle these today - ..."
   If Matches: modules=[FI-AP], effort=medium, config=[Recurring entry templates, Schedule parameters]

Q11: [EXCELLENT] "Do you have recurring supplier invoices (e.g., rent, subscriptions, maintenance contracts)?"
   Think about: "Think about: do you receive the same invoice amount from certain suppliers every month? How do you handle these today - ..."
   If Matches: modules=[FI-AP], effort=medium, config=[Recurring entry templates, Schedule parameters]

Q12: [EXCELLENT] "Do you need to upload large batches of supplier invoices from external systems?"
   Think about: "Think about: do you receive invoice files from other systems, scanning solutions, or EDI? How many invoices per month do..."
   If Matches: modules=[FI-AP], effort=medium, config=[Upload templates, Mapping rules, Error handling]

Q13: [EXCELLENT] "How does your AP team review open supplier invoices?"
   Think about: "Think about: how do you currently check what you owe to each supplier? Do you need to filter by due date, amount, or agi..."
   If Matches: modules=[FI-AP], effort=low, config=[Line item display variants]

Q14: [GOOD] "Do you sometimes block invoices from being paid?"
   Think about: "Think about: are there situations where you hold payment on an invoice (disputes, quality issues, missing documentation)..."
   If Matches: modules=[FI-AP], effort=low, config=[Block reasons, Release procedures]

Q15: [GOOD] "Do you need to see the total balance owed to each supplier?"
   Think about: "Think about: how does your finance team check the overall position with a supplier, including open items and cleared ite..."
   If Matches: modules=[FI-AP], effort=low, config=[]

Q16: [EXCELLENT] "How do you batch-process payments to suppliers?"
   Think about: "Think about: how often do you run payments (daily, weekly, monthly)? What payment methods do you use (bank transfer, che..."
   If Matches: modules=[FI-AP, FI-BL], effort=medium, config=[Payment methods, Bank determination, Payment batches]

Q17: [EXCELLENT] "How do you batch-process payments to suppliers?"
   Think about: "Think about: how often do you run payments (daily, weekly, monthly)? What payment methods do you use (bank transfer, che..."
   If Matches: modules=[FI-AP, FI-BL], effort=medium, config=[Payment methods, Bank determination, Payment batches]

Q18: [EXCELLENT] "Do you need to track and report on completed payment runs?"
   Think about: "Think about: how do you currently confirm which payments were made? Do you need a record for audit purposes?..."
   If Matches: modules=[FI-AP], effort=low, config=[]

Q19: [EXCELLENT] "Do you use payment plans for large supplier invoices?"
   Think about: "Think about: do you ever split a large invoice into multiple installment payments? How do you track the payment schedule..."
   If Matches: modules=[FI-AP], effort=medium, config=[Installment plans, Payment terms]

Q20: [EXCELLENT] "Do you make individual ad-hoc payments outside of the regular payment run?"
   Think about: "Think about: are there urgent payments that can't wait for the next batch run? How do you handle emergency supplier paym..."
   If Matches: modules=[FI-AP, FI-BL], effort=low, config=[Manual payment methods, Bank account selection]

Q21: [EXCELLENT] "Do you make individual ad-hoc payments outside of the regular payment run?"
   Think about: "Think about: are there urgent payments that can't wait for the next batch run? How do you handle emergency supplier paym..."
   If Matches: modules=[FI-AP, FI-BL], effort=low, config=[Manual payment methods, Bank account selection]

Q22: [EXCELLENT] "Do you make individual ad-hoc payments outside of the regular payment run?"
   Think about: "Think about: are there urgent payments that can't wait for the next batch run? How do you handle emergency supplier paym..."
   If Matches: modules=[FI-AP, FI-BL], effort=low, config=[Manual payment methods, Bank account selection]

Q23: [EXCELLENT] "Do you process online payments that aren't linked to a specific invoice?"
   Think about: "Think about: do you make payments directly from your bank portal for one-off expenses, refunds, or transfers?..."
   If Matches: modules=[FI-AP, FI-BL], effort=low, config=[Online payment settings]

Q24: [EXCELLENT] "Do you process online payments that aren't linked to a specific invoice?"
   Think about: "Think about: do you make payments directly from your bank portal for one-off expenses, refunds, or transfers?..."
   If Matches: modules=[FI-AP, FI-BL], effort=low, config=[Online payment settings]

Q25: [EXCELLENT] "Do you process online payments that aren't linked to a specific invoice?"
   Think about: "Think about: do you make payments directly from your bank portal for one-off expenses, refunds, or transfers?..."
   If Matches: modules=[FI-AP, FI-BL], effort=low, config=[Online payment settings]

Q26: [EXCELLENT] "Do you manually record outgoing payments?"
   Think about: "Think about: do you sometimes post payments manually (e.g., for cash payments or payments made outside the system)?..."
   If Matches: modules=[FI-AP], effort=low, config=[Payment posting rules]

Q27: [EXCELLENT] "Do outgoing payments require manager approval before release?"
   Think about: "Think about: what are your approval thresholds? Who can approve payments of different amounts? Do you need dual signatur..."
   If Matches: modules=[FI-AP, FI-BL], effort=medium, config=[Approval thresholds, Signatory assignments, Multi-level approval]

Q28: [EXCELLENT] "Do outgoing payments require manager approval before release?"
   Think about: "Think about: what are your approval thresholds? Who can approve payments of different amounts? Do you need dual signatur..."
   If Matches: modules=[FI-AP, FI-BL], effort=medium, config=[Approval thresholds, Signatory assignments, Multi-level approval]

Q29: [EXCELLENT] "How do you generate payment files for your bank?"
   Think about: "Think about: what file format does your bank require (ISO 20022, local format)? Do you generate check prints or electron..."
   If Matches: modules=[FI-AP, FI-BL], effort=medium, config=[Payment media formats, Bank file specifications]

Q30: [EXCELLENT] "Do you send payment notifications to your suppliers?"
   Think about: "Think about: do your suppliers expect a remittance advice when you pay them? By email or printed letter?..."
   If Matches: modules=[FI-AP], effort=low, config=[Advice output channels, Email templates]

Q31: [EXCELLENT] "Do you send payment notifications to your suppliers?"
   Think about: "Think about: do your suppliers expect a remittance advice when you pay them? By email or printed letter?..."
   If Matches: modules=[FI-AP], effort=low, config=[Advice output channels, Email templates]

Q32: [GOOD] "Do you send formal correspondence to suppliers (account statements, balance confirmations)?"
   Think about: "Think about: do you send periodic statements to suppliers? Do auditors require supplier balance confirmations?..."
   If Matches: modules=[FI-AP], effort=low, config=[Correspondence types, Output templates]

Q33: [EXCELLENT] "Do you sometimes need to reverse or correct payment postings?"
   Think about: "Think about: how do you handle situations where a payment was applied to the wrong invoice or needs to be reversed?..."
   If Matches: modules=[FI-AP], effort=low, config=[Reversal reasons, Clearing reset procedures]

Q34: [GOOD] "Do you need to both reset and reverse cleared items?"
   Think about: "Think about: do you need to not only undo the clearing but also reverse the original document?..."
   If Matches: modules=[FI-AP], effort=low, config=[Reversal reasons]

Q35: [EXCELLENT] "Does your company make advance payments to suppliers before receiving goods or services?"
   Think about: "Think about: do you pay deposits or advances for large purchases? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules, Workflow for approval]

Q36: [EXCELLENT] "Does your company make advance payments to suppliers before receiving goods or services?"
   Think about: "Think about: do you pay deposits or advances for large purchases? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules, Workflow for approval]

Q37: [EXCELLENT] "Does your company make advance payments to suppliers before receiving goods or services?"
   Think about: "Think about: do you pay deposits or advances for large purchases? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules, Workflow for approval]

Q38: [EXCELLENT] "Does your company make advance payments to suppliers before receiving goods or services?"
   Think about: "Think about: do you pay deposits or advances for large purchases? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules, Workflow for approval]

Q39: [EXCELLENT] "Does your company make advance payments to suppliers before receiving goods or services?"
   Think about: "Think about: do you pay deposits or advances for large purchases? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules, Workflow for approval]

Q40: [EXCELLENT] "Does your company make advance payments to suppliers before receiving goods or services?"
   Think about: "Think about: do you pay deposits or advances for large purchases? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules, Workflow for approval]

Q41: [EXCELLENT] "Do you manually record outgoing payments?"
   Think about: "Think about: do you sometimes post payments manually (e.g., for cash payments or payments made outside the system)?..."
   If Matches: modules=[FI-AP], effort=low, config=[Payment posting rules]

Q42: [EXCELLENT] "Does your company make advance payments to suppliers before receiving goods or services?"
   Think about: "Think about: do you pay deposits or advances for large purchases? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules, Workflow for approval]

Q43: [GOOD] "Do you calculate interest on overdue supplier balances?"
   Think about: "Think about: do your supplier contracts include late payment interest clauses? Do you need to calculate interest for tax..."
   If Matches: modules=[FI-AP], effort=medium, config=[Interest calculation rules, Interest rates, Job scheduling]

Q44: [GOOD] "Do you calculate interest on overdue supplier balances?"
   Think about: "Think about: do your supplier contracts include late payment interest clauses? Do you need to calculate interest for tax..."
   If Matches: modules=[FI-AP], effort=medium, config=[Interest calculation rules, Interest rates, Job scheduling]

Q45: [GOOD] "Do you calculate interest on overdue supplier balances?"
   Think about: "Think about: do your supplier contracts include late payment interest clauses? Do you need to calculate interest for tax..."
   If Matches: modules=[FI-AP], effort=medium, config=[Interest calculation rules, Interest rates, Job scheduling]

Q46: [GOOD] "Do you receive bank guarantees or letters of credit from suppliers?"
   Think about: "Think about: do your contracts require suppliers to provide performance guarantees? How do you track guarantee validity ..."
   If Matches: modules=[FI-AP], effort=low, config=[Guarantee types, Validity tracking]

Q47: [EXCELLENT] "What month-end activities do you perform for accounts payable?"
   Think about: "Think about: what closing tasks does your AP team do at month-end? Do you send balance confirmations? Do you check open ..."
   If Matches: modules=[FI-AP, FI-GL], effort=low, config=[Balance confirmation, Reconciliation procedures]

Q48: [EXCELLENT] "What month-end activities do you perform for accounts payable?"
   Think about: "Think about: what closing tasks does your AP team do at month-end? Do you send balance confirmations? Do you check open ..."
   If Matches: modules=[FI-AP, FI-GL], effort=low, config=[Balance confirmation, Reconciliation procedures]

Q49: [EXCELLENT] "What month-end activities do you perform for accounts payable?"
   Think about: "Think about: what closing tasks does your AP team do at month-end? Do you send balance confirmations? Do you check open ..."
   If Matches: modules=[FI-AP, FI-GL], effort=low, config=[Balance confirmation, Reconciliation procedures]

Q50: [EXCELLENT] "What month-end activities do you perform for accounts payable?"
   Think about: "Think about: what closing tasks does your AP team do at month-end? Do you send balance confirmations? Do you check open ..."
   If Matches: modules=[FI-AP, FI-GL], effort=low, config=[Balance confirmation, Reconciliation procedures]

Q51: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q52: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q53: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q54: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q55: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q56: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q57: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q58: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q59: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q60: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q61: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q62: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q63: [EXCELLENT] "What reports do you need for monitoring payables?"
   Think about: "Think about: what information does your management need? Overdue payables, aging analysis, cash discount utilization, pa..."
   If Matches: modules=[FI-AP], effort=low, config=[Report variants, Dashboard layouts]

Q64: [GOOD] "Do you process electronic invoices (e-invoicing)?"
   Think about: "Think about: does your country require electronic invoicing? Do you receive invoices in electronic formats (XML, EDI, Pe..."
   If Matches: modules=[FI-AP], effort=medium, config=[eDocument framework, Electronic format mapping]

</details>

### Ravi — AR Manager (J59)
| Metric | Value |
|---|---|
| Business questions shown | 51 |
| Excellent + Good | 51 (100%) |
| Generic | 0 (0%) |
| Jargon | 0 (0%) |
| Estimated completion time | 26 min |
| Could complete in 15-30 min? | **YES** |

<details><summary>All 51 business questions (click to expand)</summary>

Q1: [GOOD] "How do you manage your customer records?"
   Think about: "Think about: who creates and maintains customer records? What customer information is critical (credit terms, contact de..."
   If Matches: modules=[FI-AR], effort=low, config=[Business partner roles, Account groups]

Q2: [GOOD] "Do you need a centralized view of all your customers?"
   Think about: "Think about: how does your AR team currently look up customer information?..."
   If Matches: modules=[FI-AR], effort=low, config=[]

Q3: [EXCELLENT] "Do you create customer invoices that are not linked to a sales order?"
   Think about: "Think about: do you invoice for consulting, one-off services, or other items not managed through the sales order process..."
   If Matches: modules=[FI-AR, FI-GL], effort=low, config=[Invoice types, Tax codes, G/L account determination]

Q4: [EXCELLENT] "Do you need to upload large batches of customer invoices?"
   Think about: "Think about: do you generate invoices in bulk from external systems that need to be imported into SAP?..."
   If Matches: modules=[FI-AR], effort=medium, config=[Upload templates, Mapping rules]

Q5: [GOOD] "Do you need reports on customer invoicing activity?"
   Think about: "Think about: what invoice-related reports does your team need? Volume, trends, aging?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q6: [GOOD] "Do you send payment reminders to customers who haven't paid on time?"
   Think about: "Think about: how many dunning levels do you use? Do you send letters, emails, or both? What escalation path do you follo..."
   If Matches: modules=[FI-AR], effort=medium, config=[Dunning procedures, Dunning levels, Output templates]

Q7: [GOOD] "Do you send payment reminders to customers who haven't paid on time?"
   Think about: "Think about: how many dunning levels do you use? Do you send letters, emails, or both? What escalation path do you follo..."
   If Matches: modules=[FI-AR], effort=medium, config=[Dunning procedures, Dunning levels, Output templates]

Q8: [GOOD] "Do you send payment reminders to customers who haven't paid on time?"
   Think about: "Think about: how many dunning levels do you use? Do you send letters, emails, or both? What escalation path do you follo..."
   If Matches: modules=[FI-AR], effort=medium, config=[Dunning procedures, Dunning levels, Output templates]

Q9: [GOOD] "Do you send formal correspondence to customers (statements, confirmations)?"
   Think about: "Think about: do you send account statements or other correspondence to customers regularly?..."
   If Matches: modules=[FI-AR], effort=low, config=[Correspondence types, Output channels]

Q10: [GOOD] "Do you send formal correspondence to customers (statements, confirmations)?"
   Think about: "Think about: do you send account statements or other correspondence to customers regularly?..."
   If Matches: modules=[FI-AR], effort=low, config=[Correspondence types, Output channels]

Q11: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q12: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q13: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q14: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q15: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q16: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q17: [GOOD] "Do you send payment reminders to customers who haven't paid on time?"
   Think about: "Think about: how many dunning levels do you use? Do you send letters, emails, or both? What escalation path do you follo..."
   If Matches: modules=[FI-AR], effort=medium, config=[Dunning procedures, Dunning levels, Output templates]

Q18: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q19: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q20: [GOOD] "What reports do you need for monitoring receivables?"
   Think about: "Think about: what metrics matter to your AR team? Overdue receivables, DSO, aging analysis, collection tracking?..."
   If Matches: modules=[FI-AR], effort=low, config=[Report variants]

Q21: [GOOD] "Does your company receive advance payments from customers before delivering goods or services?"
   Think about: "Think about: do customers pay deposits? How do you track and clear these against final invoices?..."
   If Matches: modules=[FI-AR, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules]

Q22: [GOOD] "Does your company receive advance payments from customers before delivering goods or services?"
   Think about: "Think about: do customers pay deposits? How do you track and clear these against final invoices?..."
   If Matches: modules=[FI-AR, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules]

Q23: [GOOD] "Does your company receive advance payments from customers before delivering goods or services?"
   Think about: "Think about: do customers pay deposits? How do you track and clear these against final invoices?..."
   If Matches: modules=[FI-AR, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules]

Q24: [EXCELLENT] "Do you create customer invoices that are not linked to a sales order?"
   Think about: "Think about: do you invoice for consulting, one-off services, or other items not managed through the sales order process..."
   If Matches: modules=[FI-AR, FI-GL], effort=low, config=[Invoice types, Tax codes, G/L account determination]

Q25: [GOOD] "Does your company receive advance payments from customers before delivering goods or services?"
   Think about: "Think about: do customers pay deposits? How do you track and clear these against final invoices?..."
   If Matches: modules=[FI-AR, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules]

Q26: [GOOD] "Does your company receive advance payments from customers before delivering goods or services?"
   Think about: "Think about: do customers pay deposits? How do you track and clear these against final invoices?..."
   If Matches: modules=[FI-AR, FI-GL], effort=medium, config=[Down payment account determination, Clearing rules]

Q27: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q28: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q29: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q30: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q31: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q32: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q33: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q34: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q35: [GOOD] "Do you receive electronic bank statements for matching incoming payments?"
   Think about: "Think about: does your bank provide daily electronic statements? How do you match bank transactions to open invoices?..."
   If Matches: modules=[FI-AR, FI-BL], effort=medium, config=[Bank statement processing rules, Matching algorithms, Cash application]

Q36: [GOOD] "Do you sometimes need to reverse or correct payment postings?"
   Think about: "Think about: how do you handle situations where a payment was applied incorrectly?..."
   If Matches: modules=[FI-AR], effort=low, config=[Reversal reasons]

Q37: [GOOD] "Do you sometimes need to reverse or correct payment postings?"
   Think about: "Think about: how do you handle situations where a payment was applied incorrectly?..."
   If Matches: modules=[FI-AR], effort=low, config=[Reversal reasons]

Q38: [GOOD] "Do you sometimes need to reverse or correct payment postings?"
   Think about: "Think about: how do you handle situations where a payment was applied incorrectly?..."
   If Matches: modules=[FI-AR], effort=low, config=[Reversal reasons]

Q39: [EXCELLENT] "How does your AR team review open customer items?"
   Think about: "Think about: how do you currently check what customers owe? Do you need aging views, filtering by amount or date?..."
   If Matches: modules=[FI-AR], effort=low, config=[Line item display variants]

Q40: [GOOD] "Do you calculate interest on overdue customer balances?"
   Think about: "Think about: do you charge late payment interest? Is this required by law or contract in your markets?..."
   If Matches: modules=[FI-AR], effort=medium, config=[Interest rates, Calculation rules, Job scheduling]

Q41: [GOOD] "Do you calculate interest on overdue customer balances?"
   Think about: "Think about: do you charge late payment interest? Is this required by law or contract in your markets?..."
   If Matches: modules=[FI-AR], effort=medium, config=[Interest rates, Calculation rules, Job scheduling]

Q42: [GOOD] "Do you calculate interest on overdue customer balances?"
   Think about: "Think about: do you charge late payment interest? Is this required by law or contract in your markets?..."
   If Matches: modules=[FI-AR], effort=medium, config=[Interest rates, Calculation rules, Job scheduling]

Q43: [EXCELLENT] "Do you issue bank guarantees or letters of credit for customers?"
   Think about: "Think about: do you provide performance guarantees or letters of credit to your customers?..."
   If Matches: modules=[FI-AR], effort=low, config=[Guarantee types]

Q44: [GOOD] "Do you need to reverse individual financial documents?"
   Think about: "Think about: how do you handle posting errors that need complete reversal?..."
   If Matches: modules=[FI-AR], effort=low, config=[Reversal reasons]

Q45: [EXCELLENT] "What month-end activities do you perform for accounts receivable?"
   Think about: "Think about: what closing tasks does your AR team do? Balance confirmations, bad debt write-offs, reconciliation?..."
   If Matches: modules=[FI-AR, FI-GL], effort=low, config=[Balance confirmation, Write-off reasons]

Q46: [EXCELLENT] "What month-end activities do you perform for accounts receivable?"
   Think about: "Think about: what closing tasks does your AR team do? Balance confirmations, bad debt write-offs, reconciliation?..."
   If Matches: modules=[FI-AR, FI-GL], effort=low, config=[Balance confirmation, Write-off reasons]

Q47: [EXCELLENT] "What month-end activities do you perform for accounts receivable?"
   Think about: "Think about: what closing tasks does your AR team do? Balance confirmations, bad debt write-offs, reconciliation?..."
   If Matches: modules=[FI-AR, FI-GL], effort=low, config=[Balance confirmation, Write-off reasons]

Q48: [EXCELLENT] "What month-end activities do you perform for accounts receivable?"
   Think about: "Think about: what closing tasks does your AR team do? Balance confirmations, bad debt write-offs, reconciliation?..."
   If Matches: modules=[FI-AR, FI-GL], effort=low, config=[Balance confirmation, Write-off reasons]

Q49: [EXCELLENT] "What month-end activities do you perform for accounts receivable?"
   Think about: "Think about: what closing tasks does your AR team do? Balance confirmations, bad debt write-offs, reconciliation?..."
   If Matches: modules=[FI-AR, FI-GL], effort=low, config=[Balance confirmation, Write-off reasons]

Q50: [GOOD] "Do you process electronic invoices for customers?"
   Think about: "Think about: does your country require electronic invoicing? Do you send invoices in electronic formats?..."
   If Matches: modules=[FI-AR], effort=medium, config=[eDocument framework]

Q51: [GOOD] "Do you need to monitor electronic document processing?"
   Think about: "Think about: if you use e-invoicing, do you need a central dashboard to track document status?..."
   If Matches: modules=[FI-AR], effort=low, config=[eDocument monitoring]

</details>

### Ahmad — Procurement Head (J45)
| Metric | Value |
|---|---|
| Business questions shown | 30 |
| Excellent + Good | 30 (100%) |
| Generic | 0 (0%) |
| Jargon | 0 (0%) |
| Estimated completion time | 15 min |
| Could complete in 15-30 min? | **YES** |

<details><summary>All 30 business questions (click to expand)</summary>

Q1: [EXCELLENT] "How do your employees request materials to be purchased?"
   Think about: "Think about: who creates purchase requests? Is there an approval workflow? Do you have spending limits by department?..."
   If Matches: modules=[MM-PUR], effort=medium, config=[Requisition types, Approval workflow, Spending limits]

Q2: [EXCELLENT] "How are purchase orders created in your company?"
   Think about: "Think about: do you create POs manually, from requisitions, or from contracts? What information must be on each PO?..."
   If Matches: modules=[MM-PUR], effort=medium, config=[PO types, Number ranges, Output determination]

Q3: [EXCELLENT] "Do purchase orders require approval before being sent to suppliers?"
   Think about: "Think about: what are your approval thresholds? Who can approve POs of different amounts? Is there a multi-level approva..."
   If Matches: modules=[MM-PUR], effort=medium, config=[Flexible workflow, Approval thresholds, Multi-level approval]

Q4: [EXCELLENT] "Do you preview purchase orders before sending them to suppliers?"
   Think about: "Think about: do you need to review the PO document format before it goes to the supplier?..."
   If Matches: modules=[MM-PUR], effort=low, config=[PO output formats]

Q5: [EXCELLENT] "Do you frequently need to modify purchase orders after creation?"
   Think about: "Think about: how often do you change quantities, delivery dates, or prices on existing POs?..."
   If Matches: modules=[MM-PUR], effort=low, config=[Change authorization]

Q6: [EXCELLENT] "How do you track and monitor open purchase orders?"
   Think about: "Think about: how does your procurement team check PO status, delivery dates, and outstanding quantities?..."
   If Matches: modules=[MM-PUR], effort=low, config=[Monitoring views]

Q7: [EXCELLENT] "Do you need to update multiple purchase orders at once?"
   Think about: "Think about: do you ever need to change delivery dates, prices, or other fields across many POs simultaneously?..."
   If Matches: modules=[MM-PUR], effort=low, config=[Mass change authorization]

Q8: [EXCELLENT] "How do you record when purchased materials arrive?"
   Think about: "Think about: who confirms goods receipt? Do you check quantities and quality against the PO? Do you use barcode scanning..."
   If Matches: modules=[MM-IM], effort=medium, config=[GR processing, Movement types, Tolerance checks]

Q9: [EXCELLENT] "Do you print goods receipt slips or labels for received materials?"
   Think about: "Think about: do you need printed labels for warehouse storage or tracking purposes?..."
   If Matches: modules=[MM-IM], effort=low, config=[GR slip format, Label printing]

Q10: [GOOD] "Do you sometimes need to reverse a goods receipt?"
   Think about: "Think about: how do you handle situations where materials are returned or a goods receipt was posted in error?..."
   If Matches: modules=[MM-IM], effort=low, config=[Reversal movement types]

Q11: [GOOD] "Do you need to check current stock levels?"
   Think about: "Think about: how does your team check what's in stock? Do you need to see stock by warehouse, batch, or valuation type?..."
   If Matches: modules=[MM-IM], effort=low, config=[Stock display variants]

Q12: [GOOD] "How do you manage and adjust inventory?"
   Think about: "Think about: do you perform stock transfers, adjustments, or scrapping? How are these authorized?..."
   If Matches: modules=[MM-IM], effort=low, config=[Movement types, Authorization]

Q13: [EXCELLENT] "How do you process supplier invoices for purchased materials?"
   Think about: "Think about: do you match invoices against POs and goods receipts (3-way match)? What tolerance levels do you use?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Invoice verification, Tolerance groups, Tax codes]

Q14: [EXCELLENT] "How do you process supplier invoices for purchased materials?"
   Think about: "Think about: do you match invoices against POs and goods receipts (3-way match)? What tolerance levels do you use?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Invoice verification, Tolerance groups, Tax codes]

Q15: [GOOD] "Do you reduce invoice amounts when they don't match the PO?"
   Think about: "Think about: what happens when a supplier invoices more than the PO amount? Do you automatically reduce or reject?..."
   If Matches: modules=[FI-AP], effort=low, config=[Invoice reduction rules]

Q16: [EXCELLENT] "How do you process supplier invoices for purchased materials?"
   Think about: "Think about: do you match invoices against POs and goods receipts (3-way match)? What tolerance levels do you use?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Invoice verification, Tolerance groups, Tax codes]

Q17: [GOOD] "Do you process supplier credit memos?"
   Think about: "Think about: how do you handle refunds, returns, or pricing adjustments from suppliers?..."
   If Matches: modules=[FI-AP], effort=low, config=[Credit memo types]

Q18: [GOOD] "Do you need to clear the GR/IR clearing account?"
   Think about: "Think about: do you monitor the difference between goods received and invoices received?..."
   If Matches: modules=[FI-AP, FI-GL], effort=low, config=[GR/IR clearing rules]

Q19: [EXCELLENT] "How are purchase orders created in your company?"
   Think about: "Think about: do you create POs manually, from requisitions, or from contracts? What information must be on each PO?..."
   If Matches: modules=[MM-PUR], effort=medium, config=[PO types, Number ranges, Output determination]

Q20: [EXCELLENT] "Do you make advance payments to suppliers for direct materials?"
   Think about: "Think about: do suppliers require deposits before shipping? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Down payment handling, Clearing rules]

Q21: [EXCELLENT] "Do you make advance payments to suppliers for direct materials?"
   Think about: "Think about: do suppliers require deposits before shipping? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Down payment handling, Clearing rules]

Q22: [EXCELLENT] "Do you make advance payments to suppliers for direct materials?"
   Think about: "Think about: do suppliers require deposits before shipping? How do you track these against final invoices?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Down payment handling, Clearing rules]

Q23: [EXCELLENT] "How do you record when purchased materials arrive?"
   Think about: "Think about: who confirms goods receipt? Do you check quantities and quality against the PO? Do you use barcode scanning..."
   If Matches: modules=[MM-IM], effort=medium, config=[GR processing, Movement types, Tolerance checks]

Q24: [EXCELLENT] "How do you process supplier invoices for purchased materials?"
   Think about: "Think about: do you match invoices against POs and goods receipts (3-way match)? What tolerance levels do you use?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Invoice verification, Tolerance groups, Tax codes]

Q25: [EXCELLENT] "How do your employees request materials to be purchased?"
   Think about: "Think about: who creates purchase requests? Is there an approval workflow? Do you have spending limits by department?..."
   If Matches: modules=[MM-PUR], effort=medium, config=[Requisition types, Approval workflow, Spending limits]

Q26: [EXCELLENT] "How do your employees request materials to be purchased?"
   Think about: "Think about: who creates purchase requests? Is there an approval workflow? Do you have spending limits by department?..."
   If Matches: modules=[MM-PUR], effort=medium, config=[Requisition types, Approval workflow, Spending limits]

Q27: [EXCELLENT] "How do your employees request materials to be purchased?"
   Think about: "Think about: who creates purchase requests? Is there an approval workflow? Do you have spending limits by department?..."
   If Matches: modules=[MM-PUR], effort=medium, config=[Requisition types, Approval workflow, Spending limits]

Q28: [EXCELLENT] "How do you record when purchased materials arrive?"
   Think about: "Think about: who confirms goods receipt? Do you check quantities and quality against the PO? Do you use barcode scanning..."
   If Matches: modules=[MM-IM], effort=medium, config=[GR processing, Movement types, Tolerance checks]

Q29: [EXCELLENT] "How do you process supplier invoices for purchased materials?"
   Think about: "Think about: do you match invoices against POs and goods receipts (3-way match)? What tolerance levels do you use?..."
   If Matches: modules=[FI-AP, MM-PUR], effort=medium, config=[Invoice verification, Tolerance groups, Tax codes]

Q30: [GOOD] "Do you need to monitor electronic document processing for procurement?"
   Think about: "Think about: if you use e-invoicing with suppliers, do you need a dashboard to track document status?..."
   If Matches: modules=[MM-PUR], effort=low, config=[eDocument monitoring]

</details>

### Mei — Project Controller (1NT)
| Metric | Value |
|---|---|
| Business questions shown | 31 |
| Excellent + Good | 31 (100%) |
| Generic | 0 (0%) |
| Jargon | 0 (0%) |
| Estimated completion time | 16 min |
| Could complete in 15-30 min? | **YES** |

<details><summary>All 31 business questions (click to expand)</summary>

Q1: [GOOD] "How do you create and set up new projects?"
   Think about: "Think about: who creates projects? What information is captured at creation (name, dates, responsible person, project ty..."
   If Matches: modules=[PS], effort=medium, config=[Project profiles, WBS templates, Number ranges]

Q2: [GOOD] "How do you create and set up new projects?"
   Think about: "Think about: who creates projects? What information is captured at creation (name, dates, responsible person, project ty..."
   If Matches: modules=[PS], effort=medium, config=[Project profiles, WBS templates, Number ranges]

Q3: [GOOD] "Do you conduct periodic project reviews?"
   Think about: "Think about: how do you review project health, milestones, and budget consumption?..."
   If Matches: modules=[PS], effort=low, config=[]

Q4: [GOOD] "How do you update project details as things change?"
   Think about: "Think about: who can modify project scope, timelines, and assignments?..."
   If Matches: modules=[PS], effort=low, config=[Change authorization]

Q5: [GOOD] "Do you need to update multiple projects or work packages at once?"
   Think about: "Think about: do you ever need to change dates, statuses, or responsible persons across many projects simultaneously?..."
   If Matches: modules=[PS], effort=low, config=[Mass change authorization]

Q6: [EXCELLENT] "How do you plan and estimate project costs?"
   Think about: "Think about: do you create detailed cost plans by work package? What cost elements do you track?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Cost planning layout, Cost elements]

Q7: [EXCELLENT] "How do you manage project budgets?"
   Think about: "Think about: do you set spending limits per project? What happens when a project exceeds its budget?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Budget profiles, Availability control, Tolerance limits]

Q8: [EXCELLENT] "How do you manage project budgets?"
   Think about: "Think about: do you set spending limits per project? What happens when a project exceeds its budget?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Budget profiles, Availability control, Tolerance limits]

Q9: [EXCELLENT] "How do you manage project budgets?"
   Think about: "Think about: do you set spending limits per project? What happens when a project exceeds its budget?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Budget profiles, Availability control, Tolerance limits]

Q10: [GOOD] "How do you define resource and material demands for projects?"
   Think about: "Think about: do you plan what resources and materials each project needs in advance?..."
   If Matches: modules=[PS], effort=medium, config=[Demand management]

Q11: [GOOD] "How do you authorize projects to start spending?"
   Think about: "Think about: is there a formal release process before project costs can be incurred? Can you release parts of a project?..."
   If Matches: modules=[PS], effort=low, config=[Status management, Release procedures]

Q12: [GOOD] "Do you allocate internal activities (labor hours) directly to projects?"
   Think about: "Think about: do your employees charge their time to projects? How do you value internal labor on projects?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Activity types, Price calculation]

Q13: [GOOD] "Do you post manual journal entries to projects?"
   Think about: "Think about: are there project-related costs that need to be posted manually (e.g., accruals, adjustments)?..."
   If Matches: modules=[PS, FI-GL], effort=low, config=[Account assignment]

Q14: [GOOD] "How do your employees record time spent on projects?"
   Think about: "Think about: do you use timesheets? How do you track hours by project and work package?..."
   If Matches: modules=[PS], effort=medium, config=[Time recording profiles]

Q15: [GOOD] "How do you procure materials and services for projects?"
   Think about: "Think about: do project managers create purchase requisitions? How are procurement costs tracked against the project bud..."
   If Matches: modules=[PS, MM-PUR], effort=medium, config=[Account assignment to WBS]

Q16: [GOOD] "How do you monitor project progress and financials?"
   Think about: "Think about: what KPIs do you track? Budget vs. actual? Earned value? Completion percentage?..."
   If Matches: modules=[PS, CO], effort=low, config=[Monitoring views, Report variants]

Q17: [GOOD] "How do you monitor project progress and financials?"
   Think about: "Think about: what KPIs do you track? Budget vs. actual? Earned value? Completion percentage?..."
   If Matches: modules=[PS, CO], effort=low, config=[Monitoring views, Report variants]

Q18: [GOOD] "How do you monitor project progress and financials?"
   Think about: "Think about: what KPIs do you track? Budget vs. actual? Earned value? Completion percentage?..."
   If Matches: modules=[PS, CO], effort=low, config=[Monitoring views, Report variants]

Q19: [GOOD] "How do you monitor project progress and financials?"
   Think about: "Think about: what KPIs do you track? Budget vs. actual? Earned value? Completion percentage?..."
   If Matches: modules=[PS, CO], effort=low, config=[Monitoring views, Report variants]

Q20: [EXCELLENT] "How do you manage project budgets?"
   Think about: "Think about: do you set spending limits per project? What happens when a project exceeds its budget?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Budget profiles, Availability control, Tolerance limits]

Q21: [GOOD] "How do you monitor project progress and financials?"
   Think about: "Think about: what KPIs do you track? Budget vs. actual? Earned value? Completion percentage?..."
   If Matches: modules=[PS, CO], effort=low, config=[Monitoring views, Report variants]

Q22: [GOOD] "How do you monitor project progress and financials?"
   Think about: "Think about: what KPIs do you track? Budget vs. actual? Earned value? Completion percentage?..."
   If Matches: modules=[PS, CO], effort=low, config=[Monitoring views, Report variants]

Q23: [EXCELLENT] "How do you settle project costs to final receivers?"
   Think about: "Think about: where do project costs end up? Cost centers, fixed assets, profitability segments?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Settlement profiles, Settlement receivers]

Q24: [EXCELLENT] "How do you settle project costs to final receivers?"
   Think about: "Think about: where do project costs end up? Cost centers, fixed assets, profitability segments?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Settlement profiles, Settlement receivers]

Q25: [EXCELLENT] "How do you settle project costs to final receivers?"
   Think about: "Think about: where do project costs end up? Cost centers, fixed assets, profitability segments?..."
   If Matches: modules=[PS, CO], effort=medium, config=[Settlement profiles, Settlement receivers]

Q26: [GOOD] "What period-end activities do you perform for projects?"
   Think about: "Think about: do you run overhead calculations, settlements, and reconciliation at month-end?..."
   If Matches: modules=[PS, CO, FI-GL], effort=medium, config=[Overhead rates, Settlement rules, Closing schedule]

Q27: [GOOD] "What period-end activities do you perform for projects?"
   Think about: "Think about: do you run overhead calculations, settlements, and reconciliation at month-end?..."
   If Matches: modules=[PS, CO, FI-GL], effort=medium, config=[Overhead rates, Settlement rules, Closing schedule]

Q28: [GOOD] "What period-end activities do you perform for projects?"
   Think about: "Think about: do you run overhead calculations, settlements, and reconciliation at month-end?..."
   If Matches: modules=[PS, CO, FI-GL], effort=medium, config=[Overhead rates, Settlement rules, Closing schedule]

Q29: [GOOD] "What period-end activities do you perform for projects?"
   Think about: "Think about: do you run overhead calculations, settlements, and reconciliation at month-end?..."
   If Matches: modules=[PS, CO, FI-GL], effort=medium, config=[Overhead rates, Settlement rules, Closing schedule]

Q30: [GOOD] "How do you formally complete project phases or entire projects?"
   Think about: "Think about: what happens when a project is finished? Do you have a formal sign-off process?..."
   If Matches: modules=[PS], effort=low, config=[Status management]

Q31: [GOOD] "How do you close projects and prevent further postings?"
   Think about: "Think about: after final settlement, how do you lock projects against further cost postings?..."
   If Matches: modules=[PS], effort=low, config=[Closing procedures]

</details>

### Siti — Logistics Coordinator (BDW)
| Metric | Value |
|---|---|
| Business questions shown | 18 |
| Excellent + Good | 18 (100%) |
| Generic | 0 (0%) |
| Jargon | 0 (0%) |
| Estimated completion time | 9 min |
| Could complete in 15-30 min? | **YES** |

<details><summary>All 18 business questions (click to expand)</summary>

Q1: [EXCELLENT] "Do you need to track the stock of returnable packaging?"
   Think about: "Think about: how do you currently track how many pallets, crates, or containers you have in stock vs. with customers?..."
   If Matches: modules=[MM-IM], effort=low, config=[]

Q2: [EXCELLENT] "How do you process sales orders that include returnable packaging?"
   Think about: "Think about: when you ship goods on pallets, how do you track which pallets went to which customer?..."
   If Matches: modules=[SD-SLS], effort=medium, config=[Order types, Item categories for returnables]

Q3: [GOOD] "Do you attach documents to sales, delivery, or billing records?"
   Think about: "Think about: do you need to attach contracts, photos, or other documents to your sales transactions?..."
   If Matches: modules=[SD-SLS], effort=low, config=[]

Q4: [GOOD] "How do you create delivery documents for shipments?"
   Think about: "Think about: is delivery creation automatic from the sales order or manual? How do you handle partial deliveries?..."
   If Matches: modules=[SD-DLV], effort=medium, config=[Delivery types, Shipping points]

Q5: [GOOD] "Do you attach documents to sales, delivery, or billing records?"
   Think about: "Think about: do you need to attach contracts, photos, or other documents to your sales transactions?..."
   If Matches: modules=[SD-SLS], effort=low, config=[]

Q6: [EXCELLENT] "Do you add returnable packaging as a separate line item on deliveries?"
   Think about: "Think about: when shipping, do you explicitly add the pallet or container as a delivery line item?..."
   If Matches: modules=[SD-DLV], effort=low, config=[Item categories]

Q7: [EXCELLENT] "How do you pick goods and returnable packaging for shipment?"
   Think about: "Think about: does your warehouse pick pallets as part of the order fulfillment process?..."
   If Matches: modules=[SD-DLV], effort=low, config=[Picking rules]

Q8: [EXCELLENT] "Do you use batch management for returnable packaging?"
   Think about: "Think about: do you track individual batches or lots of packaging materials?..."
   If Matches: modules=[MM-IM], effort=low, config=[Batch management]

Q9: [GOOD] "How do you record goods leaving your warehouse?"
   Think about: "Think about: when pallets ship out, how is your inventory updated? Automatically from the delivery?..."
   If Matches: modules=[MM-IM], effort=low, config=[Movement types]

Q10: [EXCELLENT] "How do you bill customers for returnable packaging?"
   Think about: "Think about: do you charge customers for pallets? Is it a deposit that gets refunded on return?..."
   If Matches: modules=[SD-BIL], effort=medium, config=[Billing types, Pricing conditions]

Q11: [GOOD] "Do you attach documents to sales, delivery, or billing records?"
   Think about: "Think about: do you need to attach contracts, photos, or other documents to your sales transactions?..."
   If Matches: modules=[SD-SLS], effort=low, config=[]

Q12: [EXCELLENT] "How do you process incoming payments for returnables?"
   Think about: "Think about: how do customers pay for returnable packaging deposits?..."
   If Matches: modules=[FI-AR], effort=low, config=[Payment methods]

Q13: [EXCELLENT] "Do you ship returnable packaging without a formal sales order?"
   Think about: "Think about: are there situations where you ship pallets directly without going through the order process?..."
   If Matches: modules=[SD-DLV], effort=low, config=[Delivery types]

Q14: [EXCELLENT] "How do you process the return of packaging from customers?"
   Think about: "Think about: how do customers return pallets? Do you create a return order? Who initiates the return process?..."
   If Matches: modules=[SD-SLS, MM-IM], effort=medium, config=[Return order types, Return movement types]

Q15: [EXCELLENT] "How do you record returned packaging arriving at your warehouse?"
   Think about: "Think about: when pallets come back, how do you update inventory? Do you inspect returned packaging?..."
   If Matches: modules=[MM-IM], effort=low, config=[Movement types]

Q16: [EXCELLENT] "Do you use an alternative return process for returnable materials?"
   Think about: "Think about: do you have a second variant for handling returns (e.g., direct return without a return order)?..."
   If Matches: modules=[SD-SLS, MM-IM], effort=low, config=[Alternative return handling]

Q17: [EXCELLENT] "Do you issue returnable packaging through a separate issue process?"
   Think about: "Think about: do you manage pallet issuance separately from the main sales process?..."
   If Matches: modules=[SD-SLS], effort=medium, config=[Issue order types]

Q18: [EXCELLENT] "How do you bill customers for returnable packaging?"
   Think about: "Think about: do you charge customers for pallets? Is it a deposit that gets refunded on return?..."
   If Matches: modules=[SD-BIL], effort=medium, config=[Billing types, Pricing conditions]

</details>

### Kumar — Sales Operations Lead (2ET)
| Metric | Value |
|---|---|
| Business questions shown | 13 |
| Excellent + Good | 13 (100%) |
| Generic | 0 (0%) |
| Jargon | 0 (0%) |
| Estimated completion time | 7 min |
| Could complete in 15-30 min? | **YES** |

<details><summary>All 13 business questions (click to expand)</summary>

Q1: [EXCELLENT] "Do you check customer credit limits before accepting sales orders?"
   Think about: "Think about: do you set credit limits per customer? What happens when a customer exceeds their limit?..."
   If Matches: modules=[SD-SLS, FI-AR], effort=medium, config=[Credit management, Credit limits, Block rules]

Q2: [EXCELLENT] "Do you create formal quotations for customers before they place orders?"
   Think about: "Think about: do customers request quotes? How long are quotes valid? Can customers accept partial quotes?..."
   If Matches: modules=[SD-SLS], effort=medium, config=[Quotation types, Validity periods, Pricing]

Q3: [GOOD] "Do you use long-term sales contracts or agreements with customers?"
   Think about: "Think about: do you have framework agreements, blanket orders, or scheduled agreements with customers?..."
   If Matches: modules=[SD-SLS], effort=medium, config=[Contract types, Release orders]

Q4: [EXCELLENT] "How do customer orders for non-stock items enter your system?"
   Think about: "Think about: how do orders arrive (phone, email, web portal, EDI)? What information is captured on each order?..."
   If Matches: modules=[SD-SLS], effort=medium, config=[Order types, Item categories, Pricing]

Q5: [EXCELLENT] "Do sales orders require approval before processing?"
   Think about: "Think about: do certain orders (large value, new customers, special terms) need manager approval?..."
   If Matches: modules=[SD-SLS], effort=medium, config=[Approval workflow, Threshold rules]

Q6: [EXCELLENT] "Do you check customer credit limits before accepting sales orders?"
   Think about: "Think about: do you set credit limits per customer? What happens when a customer exceeds their limit?..."
   If Matches: modules=[SD-SLS, FI-AR], effort=medium, config=[Credit management, Credit limits, Block rules]

Q7: [GOOD] "How do you create delivery documents for non-stock items?"
   Think about: "Think about: is delivery creation automatic from the sales order? How do you handle partial deliveries?..."
   If Matches: modules=[SD-DLV], effort=medium, config=[Delivery types, Shipping points, Route determination]

Q8: [GOOD] "Do you split deliveries across multiple shipments?"
   Think about: "Think about: do you sometimes ship an order in multiple packages or from different locations?..."
   If Matches: modules=[SD-DLV], effort=low, config=[Delivery split criteria]

Q9: [GOOD] "Do you add freight charges to deliveries?"
   Think about: "Think about: how do you calculate and charge shipping costs? Do you pass freight to the customer or absorb it?..."
   If Matches: modules=[SD-DLV], effort=low, config=[Freight condition types, Freight determination]

Q10: [GOOD] "How do you record goods leaving your location for non-stock items?"
   Think about: "Think about: for non-stock items, goods issue typically triggers revenue recognition. Is this your process?..."
   If Matches: modules=[SD-DLV, MM-IM], effort=low, config=[Goods issue posting]

Q11: [GOOD] "Do you use proof of delivery confirmation?"
   Think about: "Think about: do your customers or drivers confirm delivery receipt? Do you need electronic proof of delivery?..."
   If Matches: modules=[SD-DLV], effort=low, config=[POD configuration, POD relevance]

Q12: [EXCELLENT] "How do you create customer invoices for non-stock items?"
   Think about: "Think about: is billing triggered automatically after delivery? Do you combine multiple deliveries into one invoice?..."
   If Matches: modules=[SD-BIL], effort=medium, config=[Billing types, Billing schedules, Output determination]

Q13: [GOOD] "Do you issue pro forma invoices before actual billing?"
   Think about: "Think about: do customers need a pro forma invoice for customs, banking, or pre-payment purposes?..."
   If Matches: modules=[SD-BIL], effort=low, config=[Pro forma billing types]

</details>


---

## CONTENT ISSUES TO FIX

### Must Fix (blocks client demo)
1. **Placeholder names visible in API**: `__main_process__` and `__main_flow__` are returned by the hierarchy API for all scope items. If the UI renders these literally, users see meaningless text. **Fix**: Hide or relabel process/flow levels in the review shell when names are placeholders.

### Should Fix (degrades experience)
1. **83 generic questions** that are too vague for informed decisions. Rewrite with domain-specific language.
2. **107 HIGH-severity jargon instances** in metadata (BRF+, eDocument, Fiori references, module codes without names). Replace with business-readable alternatives.
3. **5 orphan metadata patterns** (content written but never displayed because no matching activity exists). Clean up or remap.

### Nice to Have (polish)
1. Increase metadata coverage for remaining 20 unmatched activities (many are technical "Additional Information" subsections).
2. Add more domain-specific keywords to questions to improve "personality scores" for each scope item.
3. Consider adding effort estimates for HIGH complexity activities (currently 0 HIGH across all scope items).

---

## RAW DATA

- Activity coverage matrix: `/tmp/activity-coverage-matrix.csv` (316 rows)
- Full audit results: `/tmp/content-quality-audit-results.json`
