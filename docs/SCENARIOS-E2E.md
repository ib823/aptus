# ABeam Platform — End-to-End Scenarios

> Detailed scenario walkthroughs tracing the ideal path through the entire SAP Fit-to-Standard assessment lifecycle, touching all 11 actors.

---

## Table of Contents

- [Scenario Cast](#scenario-cast)
- [Scenario 1: Greenfield SAP Assessment — Ideal Path](#scenario-1-greenfield-sap-assessment--ideal-path)
  - [Act 1: Platform Setup & Onboarding](#act-1-platform-setup--onboarding)
  - [Act 2: Subscription & Team Assembly](#act-2-subscription--team-assembly)
  - [Act 3: Assessment Creation & Company Profile](#act-3-assessment-creation--company-profile)
  - [Act 4: Scoping](#act-4-scoping)
  - [Act 5: Process Review & Classification](#act-5-process-review--classification)
  - [Act 6: Workshop Session](#act-6-workshop-session)
  - [Act 7: Gap Resolution & Registers](#act-7-gap-resolution--registers)
  - [Act 8: Validation](#act-8-validation)
  - [Act 9: Sign-Off — 5 Validation Layers](#act-9-sign-off--5-validation-layers)
  - [Act 10: Handoff & Archive](#act-10-handoff--archive)
- [Scenario 2: Phase 2 Carry-Forward & Change Control](#scenario-2-phase-2-carry-forward--change-control)
- [Scenario 3: Trial-to-Enterprise Upgrade Journey](#scenario-3-trial-to-enterprise-upgrade-journey)
- [Timeline Summary](#timeline-summary)
- [Actor Touchpoint Matrix](#actor-touchpoint-matrix)

---

## Scenario Cast

A mid-size manufacturing company, **NovaTech Industries** (Germany, 2,500 employees), is adopting SAP Cloud. Their SAP implementation partner is **Meridian Consulting**.

| Actor | Name | Role | Organization |
|---|---|---|---|
| Platform Admin | **Sarah Chen** | `platform_admin` | ABeam (Platform) |
| Partner Lead | **Marcus Weber** | `partner_lead` | Meridian Consulting (Partner) |
| Consultant | **Priya Sharma** | `consultant` | Meridian Consulting (Partner) |
| Solution Architect | **Daniel Kim** | `solution_architect` | Meridian Consulting (Partner) |
| Project Manager | **Laura Martinez** | `project_manager` | NovaTech Industries (Client) |
| Client Admin | **Thomas Braun** | `client_admin` | NovaTech Industries (Client) |
| Process Owner (Finance) | **Katrin Hofmann** | `process_owner` | NovaTech Industries (Client) |
| Process Owner (Logistics) | **Stefan Richter** | `process_owner` | NovaTech Industries (Client) |
| IT Lead | **Jan Kowalski** | `it_lead` | NovaTech Industries (Client) |
| Data Migration Lead | **Anna Fischer** | `data_migration_lead` | NovaTech Industries (Client) |
| Executive Sponsor | **Dr. Klaus Meier** | `executive_sponsor` | NovaTech Industries (Client) |
| Viewer | **Elena Schulz** | `viewer` | NovaTech Industries (Client) |

---

## Scenario 1: Greenfield SAP Assessment — Ideal Path

### Act 1: Platform Setup & Onboarding

#### Step 1.1 — Platform Admin bootstraps the environment

> **Actor: Sarah Chen** (Platform Admin)

Sarah is the first user registered on ABeam and is automatically assigned `platform_admin`.

```
Action:    Register on ABeam platform
Trigger:   First-user auto-assignment
Result:    Sarah becomes platform_admin (hierarchy: 100)
Audit:     ONBOARDING_STARTED
```

Sarah completes her onboarding flow:
1. **Welcome** — Platform overview
2. **Review org settings** — Configures ABeam platform defaults
3. **Invite team** — Prepares to onboard partner organizations
4. **Explore admin dashboard** — Familiarizes with admin panel

```
Redirect:  /admin
Audit:     ONBOARDING_COMPLETED
```

#### Step 1.2 — Platform Admin onboards the partner organization

> **Actor: Sarah Chen** (Platform Admin)

Sarah creates Meridian Consulting's organization and invites Marcus as Partner Lead.

```
Action:    Create organization "Meridian Consulting" (type: PARTNER)
Action:    Invite marcus.weber@meridian.com as partner_lead
Audit:     USER_INVITED, ORG_UPDATED
```

#### Step 1.3 — Partner Lead onboards

> **Actor: Marcus Weber** (Partner Lead)

Marcus receives a magic link email (valid 15 minutes), clicks to authenticate.

```
Auth:      Magic link → email verification → session created
Session:   24-hour max age, concurrent session limit = 1
MFA:       Optional (internal partner role)
```

Marcus completes his onboarding:
1. **Welcome** — Platform introduction
2. **Create first assessment** — Guided assessment creation
3. **Invite team** — Add consultants and architects
4. **Review dashboard** — Overview of partner workspace

```
Redirect:  /dashboard
Audit:     ONBOARDING_STARTED, ONBOARDING_COMPLETED
```

---

### Act 2: Subscription & Team Assembly

#### Step 2.1 — Partner Lead selects a plan

> **Actor: Marcus Weber** (Partner Lead)

Marcus starts on the Trial plan (1 assessment, 5 users). For the NovaTech engagement he upgrades to Professional.

```
Action:    Upgrade subscription: Trial → Professional
Payment:   Stripe checkout → payment processed
Result:    TRIALING → ACTIVE
Limits:    10 active assessments, 30 partner users
Features:  core_assessment, standard_reports, registers, workshop_mode, analytics
Audit:     SUBSCRIPTION_UPGRADED
```

#### Step 2.2 — Partner Lead assembles the partner team

> **Actor: Marcus Weber** (Partner Lead)

```
Action:    Invite priya.sharma@meridian.com as consultant
Action:    Invite daniel.kim@meridian.com as solution_architect
Audit:     USER_INVITED (×2)
```

Priya and Daniel receive magic links and complete their onboarding flows:

- **Priya (Consultant):** Welcome → Complete profile → Understand scope → Classification guide → Explore tools → `/assessments`
- **Daniel (Solution Architect):** Welcome → Gap analysis → Integration review → Conflict resolution → `/assessments`

#### Step 2.3 — Client Admin onboards the client team

> **Actor: Thomas Braun** (Client Admin)

Thomas is invited by Marcus to manage NovaTech's side.

```
Action:    Marcus invites thomas.braun@novatech.de as client_admin
Auth:      Thomas receives magic link → authenticates
MFA:       Required (client-facing role) → enrolls TOTP
Onboard:   Welcome → Team setup → Dashboard → Deadlines → /dashboard
```

Thomas then invites the NovaTech team:

```
Action:    Invite laura.martinez@novatech.de    as project_manager
Action:    Invite katrin.hofmann@novatech.de     as process_owner    → assigned area: Finance
Action:    Invite stefan.richter@novatech.de     as process_owner    → assigned area: Logistics
Action:    Invite jan.kowalski@novatech.de       as it_lead
Action:    Invite anna.fischer@novatech.de       as data_migration_lead
Action:    Invite dr.klaus.meier@novatech.de     as executive_sponsor
Action:    Invite elena.schulz@novatech.de       as viewer
Audit:     USER_INVITED (×7)
```

All client users authenticate via magic link and enroll MFA (required for all client roles).

**Onboarding flows by role:**

| Person | Role | Onboarding Steps | Redirect |
|---|---|---|---|
| Laura Martinez | Project Manager | Welcome → Dashboard overview → Set deadlines → Team management | `/dashboard` |
| Katrin Hofmann | Process Owner | Welcome → Review assigned scope → Learn classification → Notes & comments | `/assessments/{id}` |
| Stefan Richter | Process Owner | Welcome → Review assigned scope → Learn classification → Notes & comments | `/assessments/{id}` |
| Jan Kowalski | IT Lead | Welcome → Technical notes → Data migration → Integration points | `/assessments/{id}` |
| Anna Fischer | DM Lead | Welcome → Migration objects → Deadlines | `/assessments/{id}` |
| Dr. Klaus Meier | Exec Sponsor | Welcome → KPI dashboard → Reports | `/dashboard` |
| Elena Schulz | Viewer | Welcome → Navigation | `/dashboard` |

---

### Act 3: Assessment Creation & Company Profile

#### Step 3.1 — Consultant creates the assessment

> **Actor: Priya Sharma** (Consultant)

```
Action:    Create assessment "NovaTech SAP Fit-to-Standard — Phase 1"
Status:    → draft
Audit:     STATUS_TRANSITIONED (draft)
```

#### Step 3.2 — Consultant completes the company profile

> **Actor: Priya Sharma** (Consultant)

Priya fills in NovaTech's company profile to unlock scoping. The profile requires ≥60% completeness (weighted).

```
Section: Basic (30% weight)
  ├─ Company name: NovaTech Industries GmbH
  ├─ Industry: Manufacturing (Discrete)
  ├─ Country: Germany
  ├─ Company size: large (2,500 employees)
  └─ SAP version target: S/4HANA Cloud 2508

Section: Financial (15% weight)
  ├─ Revenue: €450M
  ├─ Currency: EUR
  └─ Fiscal year: Calendar year

Section: SAP Strategy (30% weight)
  ├─ Deployment model: public_cloud
  ├─ Migration approach: greenfield
  ├─ Go-live target: Q4 2026
  └─ Prior SAP experience: ECC 6.0 (15 years)

Section: Operational (15% weight)
  ├─ Operating countries: Germany, Poland, Czech Republic
  ├─ Languages: DE, EN, PL, CS
  └─ Manufacturing type: discrete + process

Section: IT Landscape (10% weight)
  ├─ Current ERP: SAP ECC 6.0 EHP8
  ├─ Key integrations: Salesforce CRM, MES, WMS
  └─ Cloud readiness: moderate

Profile completeness: 85% ✓ (exceeds 60% gate)
Audit: PROFILE_UPDATED
```

#### Step 3.3 — Project Manager sets deadlines

> **Actor: Laura Martinez** (Project Manager)

```
Action:    Set deadline: Scoping complete by Week 2
Action:    Set deadline: Process review complete by Week 6
Action:    Set deadline: Gap resolution complete by Week 10
Action:    Set deadline: Validation complete by Week 12
Action:    Set deadline: Sign-off target: Week 14
Audit:     DEADLINE_CREATED (×5)
```

#### Step 3.4 — Viewer confirms read-only access

> **Actor: Elena Schulz** (Viewer)

Elena logs in to verify she can see the dashboard and reports. She has exactly 2 operations available: `view_dashboard` and `view_reports`. She cannot comment, edit, or interact.

```
Action:    View dashboard — sees assessment listed
Action:    View reports — sees placeholder (no data yet)
Result:    Read-only confirmed, no edit capabilities
```

---

### Act 4: Scoping

#### Step 4.1 — Consultant initiates scoping

> **Actor: Priya Sharma** (Consultant)

```
Action:    Transition: draft → scoping
Audit:     STATUS_TRANSITIONED
Phase:     scoping → in_progress
```

#### Step 4.2 — Consultant selects SAP scope items

> **Actor: Priya Sharma** (Consultant)

Priya selects the relevant SAP best-practice scope items from the SAP 2508 content library.

```
Selected scope items (50 items across 6 areas):
  Finance (12 items):
    ├─ General Ledger Accounting
    ├─ Accounts Payable
    ├─ Accounts Receivable
    ├─ Asset Accounting
    ├─ Bank Account Management
    ├─ Cost Center Accounting
    ├─ Profit Center Accounting
    ├─ Project Cost Accounting
    ├─ Travel & Expense Management
    ├─ Tax Management
    ├─ Financial Close
    └─ Intercompany Accounting

  Logistics - Procurement (8 items):
    ├─ Purchase Requisition
    ├─ Purchase Order Processing
    ├─ Goods Receipt
    ├─ Invoice Verification
    ├─ Supplier Evaluation
    ├─ Contract Management
    ├─ Source of Supply Determination
    └─ Returns Processing

  Logistics - Sales (8 items):
    ├─ Sales Order Processing
    ├─ Delivery Processing
    ├─ Billing
    ├─ Credit Management
    ├─ Returns & Refunds
    ├─ Pricing & Conditions
    ├─ Available-to-Promise
    └─ Output Management

  Manufacturing (10 items):
    ├─ Production Planning
    ├─ Shop Floor Execution
    ├─ Quality Management
    ├─ Maintenance Planning
    ├─ Bill of Materials
    ├─ Routing Management
    ├─ Capacity Planning
    ├─ Material Requirements Planning
    ├─ Production Orders
    └─ Product Costing

  Warehouse (6 items):
    ├─ Inbound Processing
    ├─ Outbound Processing
    ├─ Internal Movements
    ├─ Physical Inventory
    ├─ Stock Overview
    └─ Batch Management

  Human Resources (6 items):
    ├─ Employee Central
    ├─ Time Management
    ├─ Payroll Integration
    ├─ Organizational Management
    ├─ Recruiting Integration
    └─ Training Management

Relevance: YES for all selected items
Audit:     SCOPE_INCLUDED (×50)
```

#### Step 4.3 — Consultant locks scope

> **Actor: Priya Sharma** (Consultant)

```
Prerequisite: ≥1 scoped item (50 items ✓)
Action:       Transition: scoping → in_progress
Result:       Scope locked — 50 items across 6 functional areas
Audit:        STATUS_TRANSITIONED
Phase:        scoping → completed
Phase:        process_review → in_progress
```

#### Step 4.4 — Project Manager monitors scoping progress

> **Actor: Laura Martinez** (Project Manager)

```
Action:    View dashboard — scoping phase shows 100% complete
Action:    Verify deadline: Scoping completed in Week 1 (ahead of Week 2 target)
Note:      Laura cannot edit scope items — monitoring only
```

---

### Act 5: Process Review & Classification

Each scoped item expands to detailed SAP process steps (200 steps total across the 50 scope items). Steps are categorized into classifiable types (BUSINESS_PROCESS, CONFIGURATION, REPORTING, MASTER_DATA) and non-classifiable types (REFERENCE, SYSTEM_ACCESS, TEST_INFO).

#### Step 5.1 — Process Owner (Finance) classifies her area

> **Actor: Katrin Hofmann** (Process Owner — Finance)

Katrin can only see and classify steps within her assigned area (Finance). She is area-locked.

```
Action:    Acquire editing lock on Finance area
Action:    Classify 45 Finance process steps:
           ├─ 30 steps → FIT (standard SAP covers this)
           ├─ 8 steps  → CONFIGURE (needs configuration, not customization)
           ├─ 5 steps  → GAP (SAP standard doesn't support NovaTech's process)
           └─ 2 steps  → NA (not applicable to NovaTech)
Notes:     Adds business context to each GAP:
           ├─ "German tax regulation requires specific reporting format"
           ├─ "Intercompany billing requires 3-way matching not in standard"
           ├─ "Currency conversion for Polish subsidiary has specific rules"
           ├─ "Custom approval workflow for CAPEX above €50K"
           └─ "Legacy pricing logic for long-term contracts"
Audit:     MARKED_FIT (×30), MARKED_GAP (×5), NOTE_ADDED (×5)
```

#### Step 5.2 — Process Owner (Logistics) classifies his area

> **Actor: Stefan Richter** (Process Owner — Logistics)

Stefan is area-locked to Logistics (Procurement, Sales, Warehouse).

```
Action:    Acquire editing lock on Logistics areas
Action:    Classify 65 Logistics process steps:
           ├─ 40 steps → FIT
           ├─ 12 steps → CONFIGURE
           ├─ 10 steps → GAP
           └─ 3 steps  → NA
Notes:     Adds notes to GAPs:
           ├─ "Custom batch determination logic for chemical raw materials"
           ├─ "EDI integration with 3 major customers uses non-standard format"
           ├─ "Returns process requires quality inspection before credit"
           └─ (7 more specific GAP justifications)
Audit:     MARKED_FIT (×40), MARKED_GAP (×10), NOTE_ADDED (×10)
```

#### Step 5.3 — Consultant classifies remaining areas

> **Actor: Priya Sharma** (Consultant)

Priya has cross-area authority and classifies Manufacturing, HR, and fills gaps where Process Owners need guidance.

```
Action:    Classify 70 Manufacturing/HR process steps:
           ├─ 45 steps → FIT
           ├─ 15 steps → CONFIGURE
           ├─ 8 steps  → GAP
           └─ 2 steps  → NA
Action:    Review and validate PO classifications across all areas
Action:    Override 3 classifications where POs were uncertain:
           ├─ Step "Goods Receipt Reversal" changed: GAP → CONFIGURE (standard reversal works)
           ├─ Step "Batch Split" changed: CONFIGURE → GAP (needs custom extension)
           └─ Step "Quality Certificate" changed: PENDING → FIT (standard output)
Audit:     MARKED_FIT (×45), MARKED_GAP (×8), NOTE_ADDED (×8)
```

#### Step 5.4 — IT Lead adds technical notes

> **Actor: Jan Kowalski** (IT Lead)

Jan cannot change fitStatus but adds technical context to steps.

```
Action:    Acquire editing lock on technical fields
Action:    Add technical notes to 25 key steps:
           ├─ "This step requires RFC connection to legacy MES system"
           ├─ "IDoc interface needed for EDI partner X"
           ├─ "ODATA service for Salesforce integration point"
           └─ (22 more technical annotations)
Note:      Jan CANNOT change any FIT/CONFIGURE/GAP classification
Audit:     NOTE_ADDED (×25)
```

#### Step 5.5 — Solution Architect reviews conflicts

> **Actor: Daniel Kim** (Solution Architect)

Daniel reviews cross-functional impacts and resolves classification disagreements.

```
Action:    Review cross-area step classifications
Action:    Identify 2 classification conflicts:
           ├─ Conflict 1: Finance PO marked "Intercompany Settlement" as GAP,
           │   but Consultant sees CONFIGURE option → resolved as CONFIGURE
           └─ Conflict 2: Logistics PO marked "Advanced ATP" as FIT,
               but SA sees integration dependency → kept as FIT with technical note
Action:    Add cross-area architectural notes on 8 steps
Audit:     NOTE_ADDED (×8)
```

#### Step 5.6 — Project Manager tracks progress

> **Actor: Laura Martinez** (Project Manager)

```
Action:    View dashboard — process_review phase progress:
           ├─ Finance: 45/45 classified (100%)
           ├─ Logistics: 65/65 classified (100%)
           ├─ Manufacturing: 55/55 classified (100%)
           ├─ HR: 15/15 classified (100%)
           ├─ Overall: 180/180 classifiable steps done
           └─ 20 non-classifiable steps (REFERENCE, SYSTEM_ACCESS) excluded from count
Action:    Verify deadline: Process review completed Week 5 (ahead of Week 6 target)
```

---

### Act 6: Workshop Session

A collaborative workshop is held to finalize the 23 GAP items and align all stakeholders.

#### Step 6.1 — Consultant creates the workshop

> **Actor: Priya Sharma** (Consultant)

```
Action:    Transition: in_progress → workshop_active
Action:    Create workshop session "NovaTech Gap Review Workshop"
Session:   Code: X7K2M9 (6-char alphanumeric, excludes O/I/L/0/1)
Audit:     WORKSHOP_CREATED, STATUS_TRANSITIONED
```

#### Step 6.2 — Participants join

| Participant | Role | Workshop Role | Connection |
|---|---|---|---|
| **Priya Sharma** | Consultant | `facilitator` | `connected` |
| **Daniel Kim** | Solution Architect | `attendee` | `connected` |
| **Katrin Hofmann** | Process Owner (Finance) | `attendee` | `connected` |
| **Stefan Richter** | Process Owner (Logistics) | `attendee` | `connected` |
| **Jan Kowalski** | IT Lead | `observer` | `connected` |
| **Laura Martinez** | Project Manager | `observer` | `connected` |

```
Audit:     WORKSHOP_STARTED
```

#### Step 6.3 — Facilitator walks through GAP items

> **Actor: Priya Sharma** (Facilitator)

Priya presents each of the 23 GAP steps on the agenda. For each step, attendees vote.

**Example — GAP Step: "Intercompany Billing 3-Way Match"**

```
Agenda item: "Intercompany Billing 3-Way Match" → status: in_progress

Votes:
  ├─ Priya Sharma:    GAP    (confidence: high)
  ├─ Daniel Kim:      GAP    (confidence: high)
  ├─ Katrin Hofmann:  GAP    (confidence: high)
  └─ Stefan Richter:  GAP    (confidence: medium)

Tally:
  ├─ GAP:       4 votes (100%)  ← consensus (>50%)
  ├─ FIT:       0 votes (0%)
  ├─ CONFIGURE: 0 votes (0%)
  └─ NA:        0 votes (0%)

Result: Consensus reached → GAP confirmed
Action item created:
  ├─ Title: "Evaluate BTP extension for 3-way intercompany matching"
  ├─ Assigned to: Daniel Kim
  ├─ Due date: Week 8
  ├─ Priority: high
  └─ Status: open
```

**Example — Contested Step: "Custom Batch Determination"**

```
Votes:
  ├─ Priya Sharma:    CONFIGURE  (confidence: medium)
  ├─ Daniel Kim:      GAP        (confidence: medium)
  ├─ Katrin Hofmann:  GAP        (confidence: low)
  └─ Stefan Richter:  GAP        (confidence: high)

Tally:
  ├─ GAP:       3 votes (75%) ← consensus reached
  └─ CONFIGURE: 1 vote  (25%)

Result: Consensus → GAP (75% > 50% threshold)
Discussion: Stefan explains chemical batch traceability requirements
            cannot be met by standard configuration alone.
Action item: "Research ISV solutions for batch determination" → Stefan Richter, Week 7
```

After reviewing all 23 GAP items:
- **20 confirmed as GAP** (consensus reached)
- **3 reclassified to CONFIGURE** (workshop discussion revealed standard options)

#### Step 6.4 — Workshop concludes with minutes

> **Actor: Priya Sharma** (Facilitator)

```
Action:    Complete all agenda items
Action:    Generate workshop minutes (auto-generated markdown):
           ├─ Header: session details, date, code
           ├─ Attendees table: 6 participants with roles and join times
           ├─ Agenda checklist: 23 items reviewed
           ├─ Decisions table: 23 classification decisions with vote counts
           ├─ Action items table: 15 action items with assignees and due dates
           └─ Statistics:
               ├─ Total steps reviewed: 23
               ├─ FIT: 0, CONFIGURE: 3, GAP: 20, NA: 0
               └─ Average consensus: 82%

Action:    Transition: workshop_active → in_progress
Audit:     WORKSHOP_COMPLETED, STATUS_TRANSITIONED
```

---

### Act 7: Gap Resolution & Registers

Four parallel workstreams proceed simultaneously after process review.

#### Step 7.1 — Consultant advances to gap resolution

> **Actor: Priya Sharma** (Consultant)

```
Action:    Transition: in_progress → gap_resolution
Audit:     STATUS_TRANSITIONED
Phase:     gap_resolution → in_progress
Phase:     integration → in_progress (parallel)
Phase:     data_migration → in_progress (parallel)
Phase:     ocm → in_progress (parallel)
```

#### Step 7.2 — Consultant resolves gaps

> **Actor: Priya Sharma** (Consultant)

For each of the 20 confirmed GAP items, Priya selects a resolution type.

```
Gap resolutions (20 items):
  ├─ CONFIGURE (4):        Standard config covers it after workshop clarification
  ├─ KEY_USER_EXT (3):     Key-user extensibility (no-code/low-code BTP tools)
  ├─ BTP_EXT (5):          BTP extension (side-by-side)
  ├─ ISV (2):              Third-party ISV solution
  ├─ CUSTOM_ABAP (1):      Custom ABAP development (last resort)
  ├─ ADAPT_PROCESS (4):    Client adapts business process to standard
  └─ OUT_OF_SCOPE (1):     Deferred to Phase 2

Each resolution includes:
  ├─ Priority: critical (3), high (8), medium (7), low (2)
  ├─ Risk category: technical (6), business (8), compliance (4), integration (2)
  ├─ Cost estimate: one-time cost, recurring cost, implementation days
  └─ Client approval status: pending (awaiting PO confirmation)

Auto-suggest engine used:
  ├─ 5 gaps matched known patterns (Jaccard similarity >15%)
  └─ Top suggestions accepted for 3 gaps, modified for 2

Cost rollup:
  ├─ Total one-time cost: €285,000
  ├─ Total recurring cost: €42,000/year
  ├─ Total implementation days: 180
  └─ Highest cost bucket: BTP_EXT (€120,000 one-time)

Risk score: gapDensity(0.4) × 0.11 + unresolvedRatio(0.3) × 0.0
            + avgComplexity(0.2) × 0.55 + pendingRatio(0.1) × 0.0
          = 0.154 (Low-Medium risk)

Audit: RESOLUTION_SELECTED (×20), GAP_APPROVAL_ADDED (×20)
```

#### Step 7.3 — Process Owners approve gap resolutions

> **Actors: Katrin Hofmann & Stefan Richter** (Process Owners)

Each PO reviews the gap resolutions in their area and provides client approval.

```
Katrin (Finance):
  Action:    Review 5 Finance gap resolutions
  Action:    Approve 4 resolutions
  Action:    Request modification on 1:
             "CUSTOM_ABAP for CAPEX approval → prefer ADAPT_PROCESS instead"
  Priya:     Updates resolution type: CUSTOM_ABAP → ADAPT_PROCESS
  Katrin:    Approves updated resolution
  Audit:     APPROVED (×5)

Stefan (Logistics):
  Action:    Review 10 Logistics gap resolutions
  Action:    Approve all 10 resolutions
  Action:    Add business notes: "Batch determination ISV already evaluated
             by procurement team — vendor shortlist attached"
  Audit:     APPROVED (×10), NOTE_ADDED (×1)
```

#### Step 7.4 — IT Lead builds the Integration Register

> **Actor: Jan Kowalski** (IT Lead)

```
Integration points created (12):
  ├─ INT-001: Salesforce CRM → S/4HANA (Sales Orders)
  │   Direction: INBOUND, Interface: ODATA, Frequency: NEAR_REAL_TIME
  │   Middleware: SAP_CPI, Complexity: MEDIUM
  │   Status: identified → analyzed
  │
  ├─ INT-002: S/4HANA → MES (Production Orders)
  │   Direction: OUTBOUND, Interface: RFC, Frequency: REAL_TIME
  │   Middleware: SAP_CPI, Complexity: HIGH
  │   Status: identified → analyzed
  │
  ├─ INT-003: WMS ↔ S/4HANA (Inventory Sync)
  │   Direction: BIDIRECTIONAL, Interface: IDOC, Frequency: BATCH_DAILY
  │   Middleware: SAP_PO, Complexity: HIGH
  │   Status: identified
  │
  ├─ INT-004: Bank ↔ S/4HANA (Payment Files)
  │   Direction: BIDIRECTIONAL, Interface: FILE, Frequency: BATCH_DAILY
  │   Middleware: SAP_CPI, Complexity: LOW
  │   Status: identified → analyzed → designed
  │
  └─ (8 more integration points covering EDI, tax reporting, HR, etc.)

Audit: INTEGRATION_CREATED (×12), INTEGRATION_UPDATED (×6)
```

#### Step 7.5 — Data Migration Lead builds the Migration Register

> **Actor: Anna Fischer** (Data Migration Lead)

```
Migration objects created (18):
  ├─ DM-001: Customer Master Data
  │   Type: MASTER_DATA, Source: SAP_TABLE (KNA1/KNVV)
  │   Volume: LARGE (45,000 records), Mapping: MODERATE
  │   Approach: AUTOMATED, Tool: LTMC
  │   Status: identified → mapped → cleansed
  │
  ├─ DM-002: Vendor Master Data
  │   Type: MASTER_DATA, Source: SAP_TABLE (LFA1/LFB1)
  │   Volume: MEDIUM (8,500 records), Mapping: MODERATE
  │   Approach: AUTOMATED, Tool: LTMC
  │   Status: identified → mapped
  │
  ├─ DM-003: Material Master Data
  │   Type: MASTER_DATA, Source: SAP_TABLE (MARA/MARC)
  │   Volume: VERY_LARGE (120,000 records), Mapping: COMPLEX
  │   Approach: SEMI_AUTOMATED, Tool: LTMC + CUSTOM
  │   Status: identified → mapped
  │
  ├─ DM-004: Open Sales Orders
  │   Type: TRANSACTION_DATA, Source: SAP_TABLE (VBAK/VBAP)
  │   Volume: MEDIUM (3,200 records), Mapping: COMPLEX
  │   Approach: MANUAL, Tool: LSMW
  │   Status: identified
  │
  ├─ DM-005: GL Account Balances
  │   Type: TRANSACTION_DATA, Source: SAP_TABLE (BSEG)
  │   Volume: LARGE (2.1M records), Mapping: COMPLEX
  │   Approach: AUTOMATED, Tool: BODS
  │   Status: identified → mapped
  │
  └─ (13 more objects covering BOM, routing, pricing, bank data, etc.)

Dependency analysis:
  ├─ DM-003 (Materials) blocks DM-008 (BOMs) and DM-009 (Routings)
  ├─ DM-001 (Customers) blocks DM-004 (Open Sales Orders)
  ├─ DM-002 (Vendors) blocks DM-006 (Open Purchase Orders)
  ├─ No circular dependencies detected (DFS check passed)
  └─ Critical path: DM-003 → DM-008 → DM-009 → DM-014 (38 days)

Audit: DATA_MIGRATION_CREATED (×18), DATA_MIGRATION_UPDATED (×8)
```

#### Step 7.6 — Consultant documents OCM impacts

> **Actor: Priya Sharma** (Consultant)

```
OCM impacts created (10):
  ├─ OCM-001: Procurement process redesign
  │   Type: PROCESS_CHANGE, Severity: HIGH
  │   Training: INSTRUCTOR_LED + ON_THE_JOB
  │   Resistance risk: MEDIUM
  │   Affected roles: Buyers, Procurement Manager
  │   Status: identified → assessed → planned
  │
  ├─ OCM-002: New S/4HANA Fiori UI adoption
  │   Type: TECHNOLOGY_CHANGE, Severity: TRANSFORMATIONAL
  │   Training: INSTRUCTOR_LED + E_LEARNING + WORKSHOP
  │   Resistance risk: HIGH
  │   Affected roles: All operational users (200+ people)
  │   Status: identified → assessed
  │
  ├─ OCM-003: Warehouse management role changes
  │   Type: ROLE_CHANGE, Severity: MEDIUM
  │   Training: ON_THE_JOB
  │   Resistance risk: LOW
  │   Affected roles: Warehouse operators, shift leads
  │   Status: identified → assessed → planned
  │
  └─ (7 more OCM impacts)

OCM scoring:
  ├─ Severity-weighted readiness average:
  │   (TRANSFORMATIONAL×4 + HIGH×3 + MEDIUM×2 + LOW×1) / total weight
  │   = (1×4 + 3×3 + 4×2 + 2×1) / 10 = 2.3 (Moderate readiness risk)
  └─ Heatmap: Finance × Process Owner = HIGH impact (3 items)

Audit: OCM_CREATED (×10), OCM_UPDATED (×5)
```

#### Step 7.7 — Solution Architect validates integration design

> **Actor: Daniel Kim** (Solution Architect)

```
Action:    Review all 12 integration points for technical feasibility
Action:    Edit gap resolutions with technical recommendations:
           ├─ BTP_EXT gap #3: "Recommend CAP-based side-by-side extension
           │   with event-driven architecture via SAP Event Mesh"
           ├─ ISV gap #1: "Shortlisted 2 vendors; recommend Vendor A
           │   based on S/4HANA Cloud certification"
           └─ (3 more technical recommendations)
Action:    Add cross-area architectural notes:
           "Integration points INT-002 and INT-003 share middleware
            — recommend consolidating on SAP CPI for both"
Audit:     NOTE_ADDED (×5), INTEGRATION_UPDATED (×3)
```

#### Step 7.8 — Project Manager reviews all workstream progress

> **Actor: Laura Martinez** (Project Manager)

```
Action:    View dashboard — parallel workstreams:
           ├─ gap_resolution: 20/20 resolved, all client-approved ✓
           ├─ integration: 12 points documented, 6 analyzed, 1 designed ✓
           ├─ data_migration: 18 objects documented, 8 mapped ✓
           └─ ocm: 10 impacts documented, 8 assessed, 3 planned ✓
Action:    Verify deadline: Gap resolution completed Week 9 (ahead of Week 10 target)
Action:    Generate risk report:
           ├─ Risk score: 0.154 (Low-Medium)
           ├─ 0 unresolved gaps
           └─ 0 critical items without resolution
Audit:     REPORT_GENERATED
```

---

### Act 8: Validation

#### Step 8.1 — Consultant advances to validation

> **Actor: Priya Sharma** (Consultant)

All four parallel workstreams must be complete before validation can begin.

```
Workstream check:
  ├─ GAP_RESOLUTION:          completed ✓
  ├─ INTEGRATION_ASSESSMENT:  completed ✓
  ├─ DATA_MIGRATION_ASSESSMENT: completed ✓
  └─ OCM_ASSESSMENT:          completed ✓

Action:    Transition: gap_resolution → pending_validation
Audit:     STATUS_TRANSITIONED
Phase:     validation → in_progress
```

#### Step 8.2 — Consultant and Partner Lead validate

> **Actors: Priya Sharma** (Consultant) & **Marcus Weber** (Partner Lead)

```
Priya:
  Action:    Review complete assessment for consistency
  Action:    Verify all gap resolutions have client approval
  Action:    Verify cost rollups are accurate
  Action:    Confirm registers are complete

Marcus:
  Action:    Partner Lead review — commercial viability check
  Action:    Verify scope alignment with SOW
  Action:    Transition: pending_validation → validated
  Audit:     STATUS_TRANSITIONED
  Phase:     validation → completed
```

#### Step 8.3 — Consultant initiates sign-off

> **Actor: Priya Sharma** (Consultant)

```
Action:    Transition: validated → pending_sign_off
Audit:     STATUS_TRANSITIONED, SIGNOFF_INITIATED
Phase:     sign_off → in_progress

Snapshot created:
  ├─ Full assessment state captured
  ├─ All scope selections, step responses, gap resolutions
  ├─ All register data (integration, DM, OCM)
  ├─ Assessment statistics computed
  └─ SHA-256 canonical hash generated for tamper detection
Audit:     SNAPSHOT_CREATED
```

---

### Act 9: Sign-Off — 5 Validation Layers

The sign-off process is a strict linear sequence. Each layer is gated by a specific role. The Consultant advances between layers.

#### Layer 1: Area Validation

> **Actors: Katrin Hofmann & Stefan Richter** (Process Owners)

```
Sign-off status: VALIDATION_NOT_STARTED → AREA_VALIDATION_IN_PROGRESS

Katrin (Finance PO):
  Action:    Review all Finance steps and gap resolutions
  Action:    Verify data integrity: snapshot hash matches current data ✓
  Action:    Validate area sign-off for Finance
  Result:    Finance area validated ✓
  Audit:     AREA_VALIDATED

Stefan (Logistics PO):
  Action:    Review all Logistics steps and gap resolutions
  Action:    Validate area sign-off for Logistics
  Result:    Logistics area validated ✓
  Audit:     AREA_VALIDATED

Manufacturing/HR areas:
  Action:    Validated by Priya (Consultant acts as PO proxy for areas
             without dedicated PO)
  Result:    All remaining areas validated ✓
  Audit:     AREA_VALIDATED

All areas validated:
  Sign-off status: AREA_VALIDATION_IN_PROGRESS → AREA_VALIDATION_COMPLETE

Consultant advances:
  Sign-off status: AREA_VALIDATION_COMPLETE → TECHNICAL_VALIDATION_IN_PROGRESS
```

#### Layer 2: Technical Validation

> **Actor: Jan Kowalski** (IT Lead)

```
Sign-off status: TECHNICAL_VALIDATION_IN_PROGRESS

Action:    Review all integration points for technical feasibility
Action:    Review data migration plan and dependency chain
Action:    Verify technical notes on all GAP resolutions
Action:    Confirm middleware selections and interface designs
Action:    Validate technical sign-off
Result:    Technical validation passed ✓
Audit:     TECHNICAL_VALIDATED

Sign-off status: TECHNICAL_VALIDATION_IN_PROGRESS → TECHNICAL_VALIDATION_COMPLETE

Consultant advances:
  Sign-off status: TECHNICAL_VALIDATION_COMPLETE
                   → CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS
```

#### Layer 3: Cross-Functional Validation

> **Actor: Daniel Kim** (Solution Architect)

```
Sign-off status: CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS

Action:    Review end-to-end process flows across all functional areas
Action:    Verify integration architecture is consistent
Action:    Check for cross-area dependencies and conflicts
Action:    Validate that all BTP extensions and ISV solutions are feasible
Action:    Review OCM readiness assessment
Action:    Validate cross-functional sign-off
Result:    Cross-functional validation passed ✓
Audit:     CROSS_FUNC_VALIDATED

Sign-off status: CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS
                 → CROSS_FUNCTIONAL_VALIDATION_COMPLETE

Consultant advances:
  Sign-off status: CROSS_FUNCTIONAL_VALIDATION_COMPLETE
                   → EXECUTIVE_SIGN_OFF_PENDING
```

#### Layer 4: Executive Sign-Off

> **Actor: Dr. Klaus Meier** (Executive Sponsor)

```
Sign-off status: EXECUTIVE_SIGN_OFF_PENDING

Action:    Review executive summary:
           ├─ 200 process steps assessed
           ├─ 115 FIT (57.5%), 35 CONFIGURE (17.5%), 20 GAP (10%), 10 NA (5%)
           ├─ 20 non-classifiable reference/system steps
           ├─ 20 gaps fully resolved and client-approved
           ├─ Total cost: €285,000 one-time + €42,000/year recurring
           ├─ Risk score: 0.154 (Low-Medium)
           ├─ 12 integration points, 18 migration objects, 10 OCM impacts
           └─ All parallel workstreams completed
Action:    Verify snapshot integrity: hash matches ✓
Action:    Approve executive sign-off
Result:    Executive signed ✓
Audit:     EXECUTIVE_SIGNED

Sign-off status: EXECUTIVE_SIGN_OFF_PENDING → EXECUTIVE_SIGNED

Auto-advance:
  Sign-off status: EXECUTIVE_SIGNED → PARTNER_COUNTERSIGN_PENDING
```

#### Layer 5: Partner Countersign

> **Actor: Marcus Weber** (Partner Lead)

```
Sign-off status: PARTNER_COUNTERSIGN_PENDING

Action:    Review complete assessment as final partner validation
Action:    Verify executive has signed off ✓
Action:    Verify snapshot integrity: hash matches ✓
Action:    Countersign as partner
Result:    Partner countersigned ✓
Audit:     PARTNER_SIGNED

Sign-off status: PARTNER_COUNTERSIGN_PENDING → COMPLETED (terminal)

Assessment status: pending_sign_off → signed_off
Audit: STATUS_TRANSITIONED
Phase: sign_off → completed

Certificate PDF generated ✓
```

---

### Act 10: Handoff & Archive

#### Step 10.1 — Partner Lead initiates handoff

> **Actor: Marcus Weber** (Partner Lead)

```
Action:    Transition: signed_off → handed_off
Audit:     STATUS_TRANSITIONED
```

#### Step 10.2 — Exports to ALM systems

> **Actors: Priya Sharma** (Consultant) & **Jan Kowalski** (IT Lead)

```
Priya:
  Action:    Export to Jira (gap items as Jira issues)
  Action:    Export to CSV (full data export for offline analysis)
  Audit:     REPORT_GENERATED (×2)

Jan:
  Action:    Export to Azure DevOps (integration tasks as work items)
  Action:    Export to SAP Cloud ALM (roadmap items)
  Audit:     REPORT_GENERATED (×2)

Export statuses: PENDING → IN_PROGRESS → COMPLETED (all 4)
```

#### Step 10.3 — Handoff package delivered

> **Actor: Marcus Weber** (Partner Lead)

```
Handoff package types generated:
  ├─ FULL:              Complete assessment with all details
  ├─ TECHNICAL:         Integration + DM + gap resolutions
  ├─ EXECUTIVE_SUMMARY: KPI dashboard + cost summary
  └─ SCOPE_ONLY:        Scope selections for implementation team

Action:    Deliver to NovaTech project team
```

#### Step 10.4 — Platform Admin archives

> **Actor: Sarah Chen** (Platform Admin)

```
Action:    Transition: handed_off → archived (terminal)
Audit:     STATUS_TRANSITIONED
Result:    Assessment is now read-only and archived
```

#### Step 10.5 — Viewer confirms final state

> **Actor: Elena Schulz** (Viewer)

```
Action:    View dashboard — assessment shows "Archived" status
Action:    View final reports — all data preserved in read-only state
```

---

## Scenario 2: Phase 2 Carry-Forward & Change Control

After the Phase 1 assessment is signed off, NovaTech needs to add Manufacturing Execution (MES integration) and Quality Management enhancements in Phase 2.

### Step 1 — Consultant clones the assessment

> **Actor: Priya Sharma** (Consultant)

```
Action:    Clone assessment "NovaTech SAP — Phase 1"
           → "NovaTech SAP — Phase 2"
Result:    New assessment created in draft status
Carry-forward data:
  ├─ Company profile (100%)
  ├─ Scope selections (carry forward, adjustable)
  ├─ Previous gap resolutions (reference)
  ├─ Integration register (carry forward)
  └─ Data migration register (carry forward)
Audit:     ASSESSMENT_CLONED, CROSS_PHASE_LINKED
```

### Step 2 — Scope adjustment for Phase 2

> **Actor: Priya Sharma** (Consultant)

```
Action:    draft → scoping
Action:    Add 15 new scope items (MES, advanced QM)
Action:    Remove 10 completed scope items (already implemented)
Action:    scoping → in_progress
Audit:     SCOPE_INCLUDED (×15), SCOPE_EXCLUDED (×10), STATUS_TRANSITIONED
```

### Step 3 — Post-sign-off change request (on Phase 1)

Meanwhile, a regulatory change requires modifying a signed-off Phase 1 gap resolution.

> **Actor: Katrin Hofmann** (Process Owner)

```
Action:    Create change request on Phase 1 assessment:
           "EU VAT reporting regulation change effective 2027 —
            requires modification to tax reporting gap resolution"
Audit:     CHANGE_REQUEST_CREATED
```

> **Actor: Dr. Klaus Meier** (Executive Sponsor)

```
Action:    Approve change request (budget authority for compliance items)
Audit:     CHANGE_REQUEST_APPROVED
```

> **Actor: Priya Sharma** (Consultant)

```
Action:    With approved change request, trigger reassessment
           signed_off → REASSESSMENT_NEEDED (requires change request ID)
Action:    REASSESSMENT_NEEDED → scoping (only affected area reassessed)
Audit:     STATUS_TRANSITIONED
```

---

## Scenario 3: Trial-to-Enterprise Upgrade Journey

A new partner firm, **Alpine Digital**, discovers ABeam and grows from Trial to Enterprise.

### Phase 1: Trial (Month 1)

> **Actor: New Partner Lead**

```
Action:    Sign up → Trial plan (1 assessment, 5 users)
Status:    TRIALING
Action:    Create 1 assessment, invite 3 team members
Result:    Hits assessment limit immediately
```

### Phase 2: Starter (Month 2)

```
Action:    Upgrade: Trial → Starter
Payment:   Stripe → TRIALING → ACTIVE
Limits:    3 assessments, 10 users
Features:  + standard_reports
Action:    Create 2 more assessments for different clients
```

### Phase 3: Professional (Month 4)

```
Action:    Upgrade: Starter → Professional
Limits:    10 assessments, 30 users
Features:  + registers, workshop_mode, analytics
Action:    Run first workshop session
Action:    Create integration and data migration registers
```

### Phase 4: Payment hiccup (Month 6)

```
Event:     Credit card expires → payment fails
Status:    ACTIVE → PAST_DUE
Day 1-3:   Low severity — notification sent
Day 7:     Medium severity — email reminder
Action:    Partner Lead updates payment method
Status:    PAST_DUE → ACTIVE (payment success)
```

### Phase 5: Enterprise (Month 9)

```
Action:    Upgrade: Professional → Enterprise
Limits:    Unlimited assessments, unlimited users
Features:  + sso_scim, custom_branding, api_access, audit_export, dedicated_csm
Action:    Configure SAML SSO with corporate IdP
Action:    Enable SCIM provisioning (automated user lifecycle)
Action:    Apply custom branding (logo, colors)
Action:    Enable API access for CI/CD integration
```

### Downgrade scenario (not ideal, but documented)

```
Action:    Enterprise → Starter (hypothetical)
Result:    15 active assessments, limit = 3
           → 12 oldest assessments become read-only
           → User notified of read-only assessment IDs
Features:  registers, workshop_mode, analytics, SSO → removed
```

---

## Timeline Summary

**Scenario 1 — NovaTech Assessment (Ideal Path)**

```
Week  1  ██████░░░░░░░░░░░░░░░░░░░░░░  Act 1-3: Setup, onboard, profile
Week  2  ░░████░░░░░░░░░░░░░░░░░░░░░░  Act 4: Scoping
Week  3  ░░░░░░████░░░░░░░░░░░░░░░░░░  Act 5: Classification begins
Week  4  ░░░░░░████░░░░░░░░░░░░░░░░░░  Act 5: Classification continues
Week  5  ░░░░░░░░░░██░░░░░░░░░░░░░░░░  Act 5: Classification complete
Week  6  ░░░░░░░░░░░░██░░░░░░░░░░░░░░  Act 6: Workshop session
Week  7  ░░░░░░░░░░░░░░████░░░░░░░░░░  Act 7: Gap resolution
Week  8  ░░░░░░░░░░░░░░████░░░░░░░░░░  Act 7: Registers (parallel)
Week  9  ░░░░░░░░░░░░░░░░░░██░░░░░░░░  Act 7: All workstreams complete
Week 10  ░░░░░░░░░░░░░░░░░░░░██░░░░░░  Act 8: Validation
Week 11  ░░░░░░░░░░░░░░░░░░░░░░████░░  Act 9: Sign-off layers 1-3
Week 12  ░░░░░░░░░░░░░░░░░░░░░░░░██░░  Act 9: Sign-off layers 4-5
Week 13  ░░░░░░░░░░░░░░░░░░░░░░░░░░██  Act 10: Handoff & archive
```

**Actor engagement across timeline:**

```
                    Wk1  Wk2  Wk3  Wk4  Wk5  Wk6  Wk7  Wk8  Wk9  Wk10 Wk11 Wk12 Wk13
Platform Admin      ██── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ───█
Partner Lead        ████ ──── ──── ──── ──── ──── ──── ──── ──── ──█─ ──── ───█ ──██
Consultant          ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ████ ──── ────
Solution Architect  ──── ──── ──█─ ──█─ ──█─ ████ ──── ──█─ ──── ──── ──█─ ──── ────
Project Manager     ──█─ ──█─ ──█─ ──█─ ──█─ ──█─ ──█─ ──█─ ──█─ ──█─ ──── ──── ────
Client Admin        ████ ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ────
Process Owner (F)   ──── ──── ████ ████ ──── ████ ──█─ ──── ──── ──── ██── ──── ────
Process Owner (L)   ──── ──── ████ ████ ──── ████ ──█─ ──── ──── ──── ██── ──── ────
IT Lead             ──── ──── ──█─ ──█─ ──── ──█─ ──── ████ ──── ──── ──█─ ──── ──█─
DM Lead             ──── ──── ──── ──── ──── ──── ──── ████ ──── ──── ──── ──── ────
Exec Sponsor        ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ██── ────
Viewer              ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──── ──█─
```

---

## Actor Touchpoint Matrix

Every point where an actor performs a meaningful action in the ideal path.

| Act | Step | Platform Admin | Partner Lead | Consultant | Solution Arch | Project Mgr | Client Admin | Process Owner(s) | IT Lead | DM Lead | Exec Sponsor | Viewer |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | Bootstrap | **P** | | | | | | | | | | |
| 1 | Invite partner | **P** | | | | | | | | | | |
| 1 | Partner onboard | | **P** | | | | | | | | | |
| 2 | Upgrade plan | | **P** | | | | | | | | | |
| 2 | Invite partner team | | **P** | | | | | | | | | |
| 2 | Partner team onboard | | | **P** | **P** | | | | | | | |
| 2 | Invite client team | | | | | | **P** | | | | | |
| 2 | Client team onboard | | | | | **P** | | **P** | **P** | **P** | **P** | **P** |
| 3 | Create assessment | | | **P** | | | | | | | | |
| 3 | Company profile | | | **P** | | | | | | | | |
| 3 | Set deadlines | | | | | **P** | | | | | | |
| 3 | Verify access | | | | | | | | | | | **P** |
| 4 | Scope selection | | | **P** | | | | | | | | |
| 4 | Lock scope | | | **P** | | | | | | | | |
| 4 | Monitor progress | | | | | **P** | | | | | | |
| 5 | Classify (Finance) | | | | | | | **P** | | | | |
| 5 | Classify (Logistics) | | | | | | | **P** | | | | |
| 5 | Classify (remaining) | | | **P** | | | | | | | | |
| 5 | Technical notes | | | | | | | | **P** | | | |
| 5 | Resolve conflicts | | | | **P** | | | | | | | |
| 5 | Track progress | | | | | **P** | | | | | | |
| 6 | Create workshop | | | **P** | | | | | | | | |
| 6 | Attend workshop | | | **P** | **P** | | | **P** | **P** | | | |
| 6 | Vote on steps | | | **P** | **P** | | | **P** | | | | |
| 6 | Generate minutes | | | **P** | | | | | | | | |
| 7 | Resolve gaps | | | **P** | | | | | | | | |
| 7 | Approve gaps | | | | | | | **P** | | | | |
| 7 | Integration register | | | | **P** | | | | **P** | | | |
| 7 | Migration register | | | | | | | | | **P** | | |
| 7 | OCM register | | | **P** | | | | | | | | |
| 7 | Review progress | | | | | **P** | | | | | | |
| 8 | Validate | | **P** | **P** | | | | | | | | |
| 8 | Initiate sign-off | | | **P** | | | | | | | | |
| 9 | Area validation | | | **P** | | | | **P** | | | | |
| 9 | Technical validation | | | | | | | | **P** | | | |
| 9 | Cross-func validation | | | | **P** | | | | | | | |
| 9 | Executive sign-off | | | | | | | | | | **P** | |
| 9 | Partner countersign | | **P** | | | | | | | | | |
| 10 | Handoff | | **P** | | | | | | | | | |
| 10 | ALM exports | | | **P** | | | | | **P** | | | |
| 10 | Archive | **P** | | | | | | | | | | |
| 10 | Verify final state | | | | | | | | | | | **P** |

**Legend:** **P** = Primary action at this step

**Actor action counts (ideal path):**

| Actor | Actions | Peak Engagement |
|---|---|---|
| Consultant | 22 | Weeks 1–11 (most active actor) |
| Partner Lead | 8 | Weeks 1–2, 10, 12–13 |
| Process Owners | 7 | Weeks 3–4, 6–7, 11 |
| IT Lead | 5 | Weeks 3–4, 8, 11, 13 |
| Solution Architect | 5 | Weeks 3, 6, 8, 11 |
| Project Manager | 6 | Weeks 1–10 (monitoring) |
| Platform Admin | 3 | Week 1, Week 13 |
| Client Admin | 2 | Week 1 |
| Executive Sponsor | 2 | Week 12 |
| DM Lead | 1 | Week 8 |
| Viewer | 2 | Week 1, Week 13 |
