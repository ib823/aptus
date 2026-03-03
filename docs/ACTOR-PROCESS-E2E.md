# ABeam Platform — End-to-End Process by Actor

> A comprehensive guide to every actor's journey through the SAP Fit-to-Standard assessment lifecycle, from platform setup through sign-off and handoff.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Actor Map](#2-actor-map)
3. [Platform Admin](#3-platform-admin)
4. [Partner Lead](#4-partner-lead)
5. [Consultant](#5-consultant)
6. [Solution Architect](#6-solution-architect)
7. [Project Manager](#7-project-manager)
8. [Client Admin](#8-client-admin)
9. [Process Owner](#9-process-owner)
10. [IT Lead](#10-it-lead)
11. [Data Migration Lead](#11-data-migration-lead)
12. [Executive Sponsor](#12-executive-sponsor)
13. [Viewer](#13-viewer)
14. [Cross-Actor Workflows](#14-cross-actor-workflows)
15. [Assessment Lifecycle — Complete State Diagram](#15-assessment-lifecycle--complete-state-diagram)
16. [Sign-Off Lifecycle — Validation Layers](#16-sign-off-lifecycle--validation-layers)
17. [Subscription & Plan Lifecycle](#17-subscription--plan-lifecycle)
18. [Appendix A: Permission Matrix](#appendix-a-permission-matrix)
19. [Appendix B: Audit Trail Actions](#appendix-b-audit-trail-actions)

---

## 1. Platform Overview

ABeam is a multi-tenant SaaS platform for SAP Fit-to-Standard assessments. It guides implementation partners and their clients through scoping, process review, gap analysis, validation, sign-off, and handoff — the full lifecycle of an SAP best-practice assessment.

### Organization Types

| Type | Description | Example |
|---|---|---|
| **PARTNER** | SAP implementation partner firm | Deloitte, Accenture, a boutique SAP consultancy |
| **DIRECT_CLIENT** | End-client company being assessed | A manufacturing company adopting SAP |
| **PLATFORM** | ABeam platform operator | The ABeam team itself |

### Plan Tiers

| Tier | Assessments | Users | Key Unlocks |
|---|---|---|---|
| **Trial** | 1 | 5 | Core assessment only |
| **Starter** | 3 | 10 | + Standard reports |
| **Professional** | 10 | 30 | + Registers, workshop mode, analytics |
| **Enterprise** | Unlimited | Unlimited | + SSO/SCIM, custom branding, API, audit export, dedicated CSM |

---

## 2. Actor Map

The platform uses an 11-role system across three organization types. Roles are listed by hierarchy (highest authority first).

```
PLATFORM ORG                PARTNER ORG                    CLIENT ORG
────────────                ───────────                    ──────────
Platform Admin (100)        Partner Lead (90)              Client Admin (65)
                            Consultant (80)                Process Owner (60)
                            Solution Architect (75)        IT Lead (55)
                            Project Manager (70)           Data Migration Lead (50)
                                                           Executive Sponsor (45)
                                                           Viewer (10) ← any org
```

### Authentication & Access

| Method | Availability | Details |
|---|---|---|
| **Magic Link** | All users | Email-based, expires in 15 minutes |
| **SSO (SAML/OIDC)** | Enterprise plan | Federated identity |
| **SCIM Provisioning** | Enterprise plan | Automated user lifecycle |
| **TOTP MFA** | All users | Required for client-facing roles, optional for internal |

**Session rules:** 24-hour max age, 1 concurrent session limit, new login revokes existing sessions.

---

## 3. Platform Admin

> **Org type:** PLATFORM | **Hierarchy:** 100 | **MFA:** Optional

The Platform Admin has unrestricted access to every feature and is responsible for platform governance, tenant management, and system configuration.

### End-to-End Journey

```
1. SIGN UP & BOOTSTRAP
   ├─ First user to register automatically becomes Platform Admin
   ├─ Onboarding: Welcome → Review org settings → Invite team → Explore admin dashboard
   └─ Redirect: /admin

2. TENANT & USER MANAGEMENT
   ├─ Create and manage partner organizations
   ├─ Configure SSO/SCIM for Enterprise tenants
   ├─ Invite users and assign any of the 11 roles
   ├─ Deactivate users (blocked at next sign-in)
   ├─ Manage subscriptions and plan tiers
   └─ Revoke sessions with audit reason

3. ASSESSMENT OVERSIGHT
   ├─ Create, clone, or delete any assessment
   ├─ Trigger any status transition (full override authority)
   ├─ Override step classifications
   ├─ Export to any ALM target (Jira, Azure DevOps, SAP Cloud ALM, CSV)
   └─ Archive assessments (only role that can archive directly from signed_off)

4. SIGN-OFF AUTHORITY
   ├─ Can perform executive sign-off (override)
   ├─ Can perform partner countersign (override)
   └─ Can approve change requests

5. SYSTEM CONFIGURATION
   ├─ Configure SSO providers
   ├─ Manage custom branding (Enterprise)
   ├─ Access audit export logs
   └─ Monitor platform-wide dashboards
```

### Exclusive Operations (Platform Admin only)

- `delete_assessment` — permanently remove an assessment
- `configure_sso` — set up SAML/OIDC identity providers
- Direct `signed_off → archived` transition

---

## 4. Partner Lead

> **Org type:** PARTNER | **Hierarchy:** 90 | **MFA:** Optional

The Partner Lead manages the partner firm's engagement with ABeam — assessments, team, billing, and client-facing sign-off.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Platform Admin or signs up (Trial)
   ├─ Onboarding: Welcome → Create first assessment → Invite team → Review dashboard
   └─ Redirect: /dashboard

2. SUBSCRIPTION MANAGEMENT
   ├─ Select plan tier (Trial → Starter → Professional → Enterprise)
   ├─ Manage billing and payment methods via Stripe
   ├─ Upgrade: features unlock immediately
   ├─ Downgrade: excess assessments become read-only (oldest first)
   └─ Monitor usage against plan limits

3. TEAM MANAGEMENT
   ├─ Invite consultants, solution architects, project managers
   ├─ Assign roles and manage team members
   └─ Remove team members

4. ASSESSMENT LIFECYCLE
   ├─ Create new assessments
   ├─ draft → scoping (initiate scoping)
   ├─ scoping → in_progress (start work)
   ├─ in_progress → scoping (revert if needed)
   ├─ pending_validation → validated (approve validation)
   ├─ validated → pending_sign_off (initiate sign-off)
   ├─ pending_sign_off → validated (reject back to validation)
   ├─ signed_off → handed_off (complete handoff)
   └─ Clone assessments for Phase 2 carry-forward

5. SIGN-OFF — PARTNER COUNTERSIGN
   ├─ After executive signs off, Partner Lead countersigns
   ├─ PARTNER_COUNTERSIGN_PENDING → COMPLETED
   ├─ Can reject (invalidates executive signature, restarts flow)
   └─ Countersignature recorded with hash integrity verification

6. EXPORTS & REPORTING
   ├─ Export assessments to Jira, Azure DevOps, Cloud ALM, CSV
   ├─ View dashboards and reports
   ├─ Download data exports
   └─ Create and approve change requests

7. COLLABORATION
   ├─ Add comments on assessments
   ├─ View activity feeds
   └─ Validate area sign-offs
```

### Key Limitations

- Cannot classify steps (not a "hands-on" assessment role)
- Cannot acquire editing locks
- Cannot delete assessments (Platform Admin only)

---

## 5. Consultant

> **Org type:** PARTNER | **Hierarchy:** 80 | **MFA:** Optional

The Consultant is the primary assessment worker — the hands-on role that drives scoping, classification, gap resolution, and validation through the entire lifecycle.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Partner Lead
   ├─ Onboarding: Welcome → Complete profile → Understand scope → Classification guide → Explore tools
   └─ Redirect: /assessments/{id} (if context) or /dashboard

2. COMPANY PROFILE SETUP
   ├─ Edit company profile (deployment model, migration approach, size, etc.)
   ├─ Profile completeness gate: must reach ≥60% before advancing from draft
   └─ Weighted sections: basic (30%), financial (15%), SAP strategy (30%), operational (15%), IT landscape (10%)

3. SCOPING PHASE
   ├─ Advance assessment: draft → scoping
   ├─ Select SAP best-practice scope items (include/exclude)
   ├─ Set relevance for each scope item (YES / NO / MAYBE)
   ├─ Add scoping notes
   ├─ Advance: scoping → in_progress (requires ≥1 scoped item)
   └─ Can revert: scoping → draft

4. PROCESS REVIEW & CLASSIFICATION
   ├─ Classify steps in own area AND other areas (cross-area authority)
   ├─ Mark each step: FIT / CONFIGURE / GAP / NA
   ├─ Override classifications from other users
   ├─ Add detailed notes per step
   ├─ Acquire editing locks to prevent concurrent edits
   ├─ Enter workshop mode: in_progress → workshop_active
   └─ Exit workshop mode: workshop_active → in_progress

5. WORKSHOP FACILITATION
   ├─ Initiate workshop sessions with session codes
   ├─ Facilitate live voting on step classifications
   ├─ Manage agenda items
   ├─ Create action items with assignees and due dates
   ├─ Generate workshop minutes (markdown format)
   └─ Apply consensus classifications from vote results

6. GAP RESOLUTION
   ├─ Advance: in_progress → gap_resolution
   ├─ Create gap records for each GAP classification
   ├─ Select resolution type: FIT, CONFIGURE, KEY_USER_EXT, BTP_EXT, ISV, CUSTOM_ABAP, ADAPT_PROCESS, OUT_OF_SCOPE
   ├─ Set priority (critical/high/medium/low) and risk category
   ├─ Use auto-suggest engine for resolution recommendations (Jaccard similarity)
   ├─ View cost rollups by resolution type, risk category, and priority
   └─ Can revert: gap_resolution → in_progress

7. REGISTER MANAGEMENT
   ├─ Integration Register: create/edit integration points (direction, interface type, frequency, middleware, complexity)
   ├─ Data Migration Register: create/edit migration objects (type, source format, volume, approach, tools)
   ├─ OCM Register: create/edit change impacts (type, severity, training plan, resistance risk)
   └─ Available on Professional and Enterprise plans

8. VALIDATION
   ├─ Advance: gap_resolution → pending_validation
   ├─ pending_validation → validated (complete validation)
   ├─ pending_validation → gap_resolution (reject back for rework)
   ├─ Validate area sign-offs during sign-off lifecycle
   └─ Advance through validation layers (initiates sign-off process)

9. SIGN-OFF SUPPORT
   ├─ Initiate sign-off: validated → pending_sign_off
   ├─ Advance sign-off lifecycle from VALIDATION_NOT_STARTED
   ├─ Advance between validation layers (AREA → TECHNICAL → CROSS_FUNCTIONAL)
   └─ Cannot perform executive or partner sign-off (different roles)

10. POST-SIGN-OFF
    ├─ Create change requests for post-sign-off modifications
    ├─ Clone assessments for Phase 2 carry-forward
    └─ Generate and export reports
```

### Unique Capabilities

- Only partner role that can classify steps across ALL areas
- Can override other users' classifications
- Can enter/exit workshop mode
- Drives the most status transitions of any role

---

## 6. Solution Architect

> **Org type:** PARTNER | **Hierarchy:** 75 | **MFA:** Optional

The Solution Architect focuses on technical aspects — integration design, gap analysis, cross-functional validation, and conflict resolution.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Partner Lead
   ├─ Onboarding: Welcome → Gap analysis → Integration review → Conflict resolution
   └─ Redirect: /assessments/{id} or /dashboard

2. PROCESS REVIEW
   ├─ Classify steps in own and other areas
   ├─ Acquire editing locks
   ├─ Add technical notes to steps
   └─ Enter/exit workshop mode alongside consultant

3. GAP ANALYSIS & INTEGRATION
   ├─ Review gap resolutions from technical perspective
   ├─ Edit gap resolutions with technical recommendations
   ├─ Create and manage integration points in the Integration Register
   ├─ Add cross-area notes for architectural concerns
   └─ Resolve classification conflicts between stakeholders

4. CROSS-FUNCTIONAL VALIDATION
   ├─ Act during CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS sign-off stage
   ├─ Validate that gaps, integrations, and data migrations are technically sound
   └─ Can reject (sends sign-off to REJECTED → restart)

5. COLLABORATION
   ├─ Add comments and @mentions
   ├─ Participate in workshops
   └─ View dashboards and reports
```

---

## 7. Project Manager

> **Org type:** PARTNER or CLIENT | **Hierarchy:** 70 | **MFA:** Required (if client-facing)

The Project Manager tracks progress, manages timelines, and coordinates across teams without direct assessment editing.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Partner Lead or Client Admin
   ├─ Onboarding: Welcome → Dashboard overview → Set deadlines → Team management
   └─ Redirect: /dashboard

2. TEAM COORDINATION
   ├─ Manage team members and assignments
   ├─ Track who has completed which areas
   ├─ Monitor activity feed (aggregated in 30-second windows)
   └─ Set and track deadlines for phases and milestones

3. PROGRESS MONITORING
   ├─ View dashboards with phase progress across 8 assessment phases
   ├─ Monitor risk scores: gapDensity×0.4 + unresolvedRatio×0.3 + avgComplexity×0.2 + pendingRatio×0.1
   ├─ View OCM heatmap (role × functional area, severity-weighted)
   ├─ Review readiness calculations
   └─ View reports and download exports

4. SIGN-OFF SUPPORT
   ├─ Validate area sign-offs
   ├─ Export to ALM targets
   └─ Create change requests

5. COLLABORATION
   ├─ Add comments on assessments
   └─ Cannot: classify steps, acquire editing locks, or edit gap resolutions
```

### Key Limitations

- No classification access whatsoever
- Cannot acquire editing locks
- Cannot create or delete assessments

---

## 8. Client Admin

> **Org type:** CLIENT | **Hierarchy:** 65 | **MFA:** Required

The Client Admin manages the client-side team and organization. They are the client's primary administrative contact.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Partner Lead or Platform Admin
   ├─ Onboarding: Welcome → Team setup → Dashboard → Deadlines
   └─ Redirect: /dashboard

2. CLIENT TEAM MANAGEMENT
   ├─ Invite client-side users: Process Owners, IT Leads, Data Migration Leads,
   │   Executive Sponsors, Viewers
   ├─ Assign roles and functional areas
   ├─ Deactivate/remove client team members
   └─ Set deadlines for client-side deliverables

3. ORGANIZATION SETUP
   ├─ Edit company profile details
   └─ Configure client-specific settings

4. MONITORING
   ├─ View dashboards and reports
   ├─ Track client team progress
   ├─ Add comments
   └─ Download data exports
```

### Key Limitations

- Cannot edit assessments directly
- Cannot classify steps or manage gaps
- Cannot participate in sign-off process

---

## 9. Process Owner

> **Org type:** CLIENT | **Hierarchy:** 60 | **MFA:** Required

The Process Owner is the client-side subject matter expert for specific functional areas. They classify steps, validate gaps, and provide area-level sign-off — but only within their assigned areas.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Client Admin or Partner Lead
   ├─ Onboarding: Welcome → Review assigned scope → Learn classification → Notes & comments
   └─ Redirect: /assessments/{id} or /dashboard

2. AREA-LOCKED CLASSIFICATION
   ├─ Classify steps within assigned functional areas ONLY
   │   (e.g., Finance PO can only classify Finance steps)
   ├─ Mark steps: FIT / CONFIGURE / GAP / NA
   ├─ Add business context notes
   ├─ Acquire editing locks within assigned areas
   └─ Cannot classify steps in other areas

3. GAP INPUT
   ├─ Create gap records within their areas
   ├─ Provide business justification for gaps
   ├─ Review proposed gap resolutions
   └─ Add comments on resolution alternatives

4. AREA VALIDATION (Sign-Off)
   ├─ Act during AREA_VALIDATION_IN_PROGRESS stage
   ├─ Validate that all steps in their area are correctly classified
   ├─ Confirm gap resolutions are business-appropriate
   ├─ Approve or reject area-level sign-off
   └─ If PO leaves, replacement PO must re-validate from scratch

5. WORKSHOP PARTICIPATION
   ├─ Attend workshop sessions (as attendee, not facilitator)
   ├─ Vote on step classifications
   └─ Provide domain expertise during discussions

6. COLLABORATION
   ├─ Add comments and respond to @mentions
   ├─ Create change requests
   └─ View dashboards and reports
```

### Critical Constraints

- **Area-locked**: Cannot see or modify data outside assigned functional areas
- Cannot override classifications
- Cannot manage integration or data migration registers
- Multiple POs can be assigned to different areas; all must validate

---

## 10. IT Lead

> **Org type:** CLIENT | **Hierarchy:** 55 | **MFA:** Required

The IT Lead provides technical perspective from the client side — integration design, data migration planning, and technical validation.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Client Admin
   ├─ Onboarding: Welcome → Technical notes → Data migration → Integration points
   └─ Redirect: /assessments/{id} or /dashboard

2. TECHNICAL ANNOTATION
   ├─ Add technical notes to process steps (CANNOT change fitStatus)
   ├─ Acquire editing locks for technical fields
   └─ Review and comment on classifications

3. INTEGRATION REGISTER
   ├─ Create and manage integration points
   │   ├─ Direction: INBOUND / OUTBOUND / BIDIRECTIONAL
   │   ├─ Interface type: API / IDOC / FILE / RFC / ODATA / EVENT
   │   ├─ Frequency: REAL_TIME / BATCH_DAILY / ON_DEMAND / etc.
   │   ├─ Middleware: SAP_CPI / MULESOFT / AZURE_INTEGRATION / etc.
   │   └─ Complexity: LOW / MEDIUM / HIGH / VERY_HIGH
   ├─ Track integration status: identified → analyzed → designed → approved
   └─ Map integration dependencies

4. DATA MIGRATION SUPPORT
   ├─ Add data migration objects
   ├─ Track migration status through lifecycle
   └─ Validate data cleansing and mapping

5. TECHNICAL VALIDATION (Sign-Off)
   ├─ Act during TECHNICAL_VALIDATION_IN_PROGRESS stage
   ├─ Validate technical feasibility of all gaps and integrations
   ├─ Can reject (sends sign-off to REJECTED → restart)
   └─ Technical sign-off required before cross-functional validation

6. COLLABORATION
   ├─ Validate area sign-offs
   ├─ Create change requests
   ├─ Add comments
   ├─ Export to ALM targets
   └─ View dashboards and reports
```

---

## 11. Data Migration Lead

> **Org type:** CLIENT | **Hierarchy:** 50 | **MFA:** Required

The Data Migration Lead manages the data migration register exclusively — planning, mapping, and tracking all data migration objects.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Client Admin
   ├─ Onboarding: Welcome → Migration objects → Deadlines
   └─ Redirect: /assessments/{id} or /dashboard

2. DATA MIGRATION REGISTER
   ├─ Create and manage data migration objects
   │   ├─ Object types: MASTER_DATA / TRANSACTION_DATA / CONFIG_DATA / HISTORICAL / REFERENCE
   │   ├─ Source format: SAP_TABLE / CSV / EXCEL / XML / DATABASE / API
   │   ├─ Volume estimate: SMALL / MEDIUM / LARGE / VERY_LARGE
   │   ├─ Mapping complexity: SIMPLE / MODERATE / COMPLEX / VERY_COMPLEX
   │   ├─ Migration approach: AUTOMATED / SEMI_AUTOMATED / MANUAL / HYBRID
   │   └─ Tools: LTMC / LSMW / BODS / CPI / CUSTOM
   ├─ Track lifecycle: identified → mapped → cleansed → validated → approved
   ├─ Define migration dependencies (circular dependency detection via DFS)
   ├─ Compute critical path (topological sort via Kahn's algorithm)
   └─ Set execution order and timelines

3. VALIDATION & SIGN-OFF SUPPORT
   ├─ Validate area sign-offs
   ├─ Create change requests
   └─ Acquire editing locks on migration register

4. COLLABORATION
   ├─ Add comments
   └─ View dashboards and reports
```

---

## 12. Executive Sponsor

> **Org type:** CLIENT | **Hierarchy:** 45 | **MFA:** Required

The Executive Sponsor provides executive authority — sign-off, high-value change request approval, and KPI-level visibility. They see summary views, not operational detail.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by Client Admin or Partner Lead
   ├─ Onboarding: Welcome → KPI dashboard → Reports
   └─ Redirect: /dashboard

2. EXECUTIVE OVERSIGHT
   ├─ View KPI/summary dashboards (not operational detail)
   ├─ View reports and download data exports
   └─ Monitor overall assessment progress

3. EXECUTIVE SIGN-OFF
   ├─ Act during EXECUTIVE_SIGN_OFF_PENDING stage
   ├─ Review the assessment snapshot (integrity-verified via SHA-256 hash)
   ├─ Approve: EXECUTIVE_SIGN_OFF_PENDING → EXECUTIVE_SIGNED
   ├─ Decline: EXECUTIVE_SIGN_OFF_PENDING → REJECTED (requires comments)
   │   ├─ Rejection restarts the entire sign-off flow from VALIDATION_NOT_STARTED
   │   └─ Comments are mandatory when declining
   └─ Assessment: pending_sign_off → signed_off

4. CHANGE REQUEST APPROVAL
   ├─ Approve or reject change requests (especially high-cost items)
   └─ Budget authority for post-sign-off modifications

5. COLLABORATION
   ├─ Add comments
   └─ Cannot: classify, edit, lock, export, or manage team
```

### Key Constraints

- No classification or editing capabilities
- Cannot acquire editing locks
- Cannot manage team or subscriptions
- KPI/summary view — deliberately shielded from operational complexity

---

## 13. Viewer

> **Org type:** ANY | **Hierarchy:** 10 | **MFA:** Required

The Viewer has strictly read-only access — dashboards and reports only. No comments, no edits, no interactions.

### End-to-End Journey

```
1. ONBOARDING
   ├─ Invited by any admin role
   ├─ Onboarding: Welcome → Navigation
   └─ Redirect: /dashboard

2. READ-ONLY ACCESS
   ├─ View dashboards
   ├─ View reports
   └─ That's it. No other operations permitted.
```

### Allowed Operations (2 of 25)

- `view_dashboard`
- `view_reports`

---

## 14. Cross-Actor Workflows

### Workflow A: Full Assessment — Happy Path

```
                     ┌─────────────────────────────────────────────────────────────────┐
                     │                    SETUP & SCOPING                               │
                     ├─────────────────────────────────────────────────────────────────┤
  Partner Lead ──────┤  Creates assessment (draft)                                     │
  Consultant ────────┤  Edits company profile → ≥60% completeness                     │
  Consultant ────────┤  draft → scoping → selects scope items → scoping → in_progress │
                     └────────────────────────────┬────────────────────────────────────┘
                                                  │
                     ┌────────────────────────────▼────────────────────────────────────┐
                     │              PROCESS REVIEW & CLASSIFICATION                    │
                     ├─────────────────────────────────────────────────────────────────┤
  Consultant ────────┤  Classifies steps: FIT / CONFIGURE / GAP / NA                  │
  Process Owner ─────┤  Classifies steps within assigned areas                        │
  Solution Arch ─────┤  Reviews technical aspects, resolves conflicts                 │
  Consultant ────────┤  Enters workshop mode for collaborative sessions               │
  All participants ──┤  Vote in workshops, create action items                        │
                     └────────────────────────────┬────────────────────────────────────┘
                                                  │
                     ┌────────────────────────────▼────────────────────────────────────┐
                     │           GAP RESOLUTION & REGISTER MANAGEMENT                  │
                     │                    (parallel workstreams)                        │
                     ├─────────────────────────────────────────────────────────────────┤
  Consultant ────────┤  Gap resolution: selects resolution type, priority, risk        │
  IT Lead ───────────┤  Integration register: defines integration points               │
  DM Lead ───────────┤  Data migration register: maps migration objects                │
  Consultant ────────┤  OCM register: documents change impacts                         │
                     └────────────────────────────┬────────────────────────────────────┘
                                                  │ (all workstreams complete)
                     ┌────────────────────────────▼────────────────────────────────────┐
                     │                      VALIDATION                                 │
                     ├─────────────────────────────────────────────────────────────────┤
  Consultant ────────┤  gap_resolution → pending_validation → validated                │
  Partner Lead ──────┤  Can approve validation                                         │
                     └────────────────────────────┬────────────────────────────────────┘
                                                  │
                     ┌────────────────────────────▼────────────────────────────────────┐
                     │                 SIGN-OFF (5 validation layers)                   │
                     ├─────────────────────────────────────────────────────────────────┤
  Consultant ────────┤  Initiates: validated → pending_sign_off                        │
  Process Owner ─────┤  Layer 1: Area validation (per functional area)                 │
  IT Lead ───────────┤  Layer 2: Technical validation                                  │
  Solution Arch ─────┤  Layer 3: Cross-functional validation                           │
  Exec Sponsor ──────┤  Layer 4: Executive sign-off                                    │
  Partner Lead ──────┤  Layer 5: Partner countersign → COMPLETED                       │
                     └────────────────────────────┬────────────────────────────────────┘
                                                  │
                     ┌────────────────────────────▼────────────────────────────────────┐
                     │                    HANDOFF & ARCHIVE                             │
                     ├─────────────────────────────────────────────────────────────────┤
  Partner Lead ──────┤  signed_off → handed_off                                        │
  Platform Admin ────┤  handed_off → archived (or signed_off → archived)               │
  Consultant ────────┤  Clone for Phase 2 carry-forward                                │
  Any ALM role ──────┤  Export to Jira / Azure DevOps / SAP Cloud ALM / CSV            │
                     └─────────────────────────────────────────────────────────────────┘
```

### Workflow B: Workshop Session

```
  Consultant ────────── Creates workshop, gets 6-char session code
       │
       ├─── Process Owners join as attendees
       ├─── Solution Architect joins as attendee
       ├─── IT Lead joins as observer
       │
       ├─── Facilitator presents each step on agenda
       │         │
       │         ├── All attendees vote: FIT / CONFIGURE / GAP / NA
       │         ├── Consensus reached (>50% majority) → auto-classify
       │         ├── No consensus → flag for consultant resolution
       │         └── Action items created with assignees
       │
       ├─── Minutes auto-generated (markdown)
       └─── workshop_active → in_progress (session ends)
```

### Workflow C: Post-Sign-Off Change Request

```
  Any authorized role ── Creates change request with justification
       │
       ├── Executive Sponsor approves (required for high-cost items)
       │         │
       │         ├── signed_off → REASSESSMENT_NEEDED (V2 spec)
       │         ├── Loops back to scoping phase
       │         └── Only the affected areas are reassessed
       │
       └── Change request rejected → no state change
```

### Workflow D: Trial-to-Paid Upgrade

```
  Partner Lead ── Signs up (Trial: 1 assessment, 5 users)
       │
       ├── Hits assessment limit → prompted to upgrade
       ├── Selects plan (Starter / Professional / Enterprise)
       ├── Stripe payment processed
       │       │
       │       ├── TRIALING → ACTIVE
       │       ├── Features unlock immediately
       │       └── Assessment and user limits increased
       │
       ├── Payment failure → ACTIVE → PAST_DUE (grace period)
       │       ├── Days 1-3: low severity
       │       ├── Days 4-14: medium
       │       ├── Days 15-25: high
       │       └── Days 26+: critical → CANCELED
       │
       └── Downgrade → excess assessments become read-only (oldest first)
```

---

## 15. Assessment Lifecycle — Complete State Diagram

```
                    ┌───────┐
                    │ draft │
                    └───┬───┘
                        │  (platform_admin, partner_lead, consultant)
                    ┌───▼────┐
               ┌────│scoping │◄────────────────────────────────────┐
               │    └───┬────┘                                     │
               │        │  (platform_admin, partner_lead,          │
               │        │   consultant)                            │
               │    ┌───▼────────┐                                 │
               │    │in_progress │◄──────────┬──────────┐          │
               │    └─┬──┬───┬──┘            │          │          │
               │      │  │   │               │          │          │
               │      │  │   │  ┌────────────┴───┐  ┌──┴────────┐ │
               │      │  │   └──│workshop_active  │  │review_cycle│ │
               │      │  │      └────────────────┘  └───────────┘  │
               │      │  │                                         │
               │      │  └── (revert to scoping) ──────────────────┘
               │      │
               │  ┌───▼───────────┐
               │  │gap_resolution │
               │  └───┬───────────┘
               │      │
               │  ┌───▼──────────────┐     ┌──────────────┐
               │  │pending_validation │────▶│gap_resolution│ (reject)
               │  └───┬──────────────┘     └──────────────┘
               │      │
               │  ┌───▼──────┐
               │  │validated  │
               │  └───┬──────┘
               │      │
               │  ┌───▼──────────────┐     ┌─────────┐
               │  │pending_sign_off  │────▶│validated│ (reject)
               │  └───┬──────────────┘     └─────────┘
               │      │
               │  ┌───▼──────┐
               │  │signed_off │──────────┐
               │  └───┬──────┘           │
               │      │             ┌────▼────┐
               │  ┌───▼──────┐      │archived │ (terminal)
               │  │handed_off │────▶│         │
               │  └──────────┘      └─────────┘
               │
               └── (revert: scoping → draft)
```

### Phase Prerequisites (parallel workstreams)

```
scoping ──► process_review ──► gap_resolution ──► validation ──► sign_off
   │
   ├──► integration (parallel)
   ├──► data_migration (parallel)
   └──► ocm (parallel)
```

---

## 16. Sign-Off Lifecycle — Validation Layers

The sign-off process is a **strict linear sequence** of 5 validation layers, each gated by a specific role. Any rejection at any layer restarts the entire flow.

```
Layer  Status                                  Actor              Can Reject?
─────  ──────────────────────────────────────  ─────────────────  ──────────
  0    VALIDATION_NOT_STARTED                  consultant         –
  1    AREA_VALIDATION_IN_PROGRESS             process_owner      ✓ → REJECTED
       AREA_VALIDATION_COMPLETE                (auto-advance)
  2    TECHNICAL_VALIDATION_IN_PROGRESS        it_lead            ✓ → REJECTED
       TECHNICAL_VALIDATION_COMPLETE           (auto-advance)
  3    CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS solution_architect ✓ → REJECTED
       CROSS_FUNCTIONAL_VALIDATION_COMPLETE    (auto-advance)
  4    EXECUTIVE_SIGN_OFF_PENDING              executive_sponsor  ✓ → REJECTED
       EXECUTIVE_SIGNED                        (auto-advance)
  5    PARTNER_COUNTERSIGN_PENDING             partner_lead       ✓ → REJECTED
       COMPLETED                               (terminal)

       REJECTED → VALIDATION_NOT_STARTED       (restart all 5 layers)
```

### Sign-Off Data Integrity

| Mechanism | Description |
|---|---|
| **Snapshot** | Full assessment state captured at sign-off time |
| **Canonical hash** | SHA-256 of recursively-sorted JSON — key order independent |
| **Hash verification** | Any post-sign-off data modification triggers hash mismatch detection |
| **Tamper detection** | Modified data after sign-off = invalid signature |
| **Optimistic locking** | Concurrent sign-off attempts — exactly one wins |
| **Session validation** | Expired sessions blocked — re-authentication required |
| **Mobile sign-off** | Requires touch signature OR checkbox confirmation |
| **Certificate PDF** | PDF generation failure prevents sign-off advancement |

### Rejection Rules

- **Executive declines**: must provide comments, goes to REJECTED
- **Partner declines**: invalidates executive signature (cannot be preserved per policy), goes to REJECTED
- **PO replacement**: if a Process Owner leaves, replacement PO must re-validate from scratch
- **Data modification**: if data changes after PO validation via API, PO validation is automatically invalidated (hash mismatch)

---

## 17. Subscription & Plan Lifecycle

```
 ┌──────────┐    payment    ┌────────┐
 │ TRIALING ├──────────────▶│ ACTIVE │◄──────────────────────┐
 └────┬─────┘               └───┬────┘                       │
      │                         │                             │
      │ timeout                 │ payment failure    payment  │
      │                         │                    success  │
 ┌────▼──────────┐         ┌───▼──────┐                      │
 │ TRIAL_EXPIRED ├────────▶│ PAST_DUE ├──────────────────────┘
 └───────────────┘ upgrade └────┬─────┘
                                │
                                │ final failure
                                │
                           ┌────▼─────┐
                           │ CANCELED │ (terminal)
                           └──────────┘
```

### Plan Feature Matrix

| Feature | Trial | Starter | Professional | Enterprise |
|---|:---:|:---:|:---:|:---:|
| Core assessment | ✓ | ✓ | ✓ | ✓ |
| Standard reports | | ✓ | ✓ | ✓ |
| Registers (Int/DM/OCM) | | | ✓ | ✓ |
| Workshop mode | | | ✓ | ✓ |
| Analytics | | | ✓ | ✓ |
| SSO / SCIM | | | | ✓ |
| Custom branding | | | | ✓ |
| API access | | | | ✓ |
| Audit export | | | | ✓ |
| Dedicated CSM | | | | ✓ |

### Access During Subscription States

| State | Access Level |
|---|---|
| TRIALING / ACTIVE | Full access per plan tier |
| PAST_DUE | Full access (grace period) |
| TRIAL_EXPIRED / CANCELED | Read-only: dashboards, reports, data export only |

---

## Appendix A: Permission Matrix

25 operations across 11 roles. ✓ = allowed, – = denied.

| Operation | Platform Admin | Partner Lead | Consultant | Solution Arch | Project Mgr | Client Admin | Process Owner | IT Lead | DM Lead | Exec Sponsor | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| create_assessment | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – |
| delete_assessment | ✓ | – | – | – | – | – | – | – | – | – | – |
| edit_company_profile | ✓ | ✓ | ✓ | – | ✓ | ✓ | – | – | – | – | – |
| classify_step_own_area | ✓ | – | ✓ | ✓ | – | – | ✓ | – | – | – | – |
| classify_step_other_area | ✓ | – | ✓ | ✓ | – | – | – | – | – | – | – |
| override_classification | ✓ | – | ✓ | – | – | – | – | – | – | – | – |
| create_gap | ✓ | – | ✓ | – | – | – | ✓ | – | – | – | – |
| add_integration_point | ✓ | – | ✓ | ✓ | – | – | – | ✓ | – | – | – |
| add_dm_object | ✓ | – | ✓ | – | – | – | – | – | ✓ | – | – |
| add_ocm_impact | ✓ | – | ✓ | – | – | – | – | – | – | – | – |
| validate_area_sign_off | ✓ | ✓ | ✓ | – | ✓ | – | – | ✓ | ✓ | – | – |
| executive_sign_off | ✓ | – | – | – | – | – | – | – | – | ✓ | – |
| partner_countersign | ✓ | ✓ | – | – | – | – | – | – | – | – | – |
| export_to_alm | ✓ | ✓ | ✓ | – | ✓ | – | – | ✓ | – | – | – |
| view_dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| view_reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| download_data_export | ✓ | ✓ | ✓ | – | ✓ | – | – | – | – | ✓ | – |
| manage_team | ✓ | ✓ | – | – | ✓ | ✓ | – | – | – | – | – |
| configure_sso | ✓ | – | – | – | – | – | – | – | – | – | – |
| manage_subscription | ✓ | ✓ | – | – | – | – | – | – | – | – | – |
| create_change_request | ✓ | ✓ | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | – | – |
| approve_change_request | ✓ | ✓ | – | – | – | – | – | – | – | ✓ | – |
| clone_assessment | ✓ | ✓ | ✓ | – | – | – | – | – | – | – | – |
| add_comment | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| acquire_editing_lock | ✓ | – | ✓ | ✓ | – | – | ✓ | ✓ | ✓ | – | – |

### Access Control Enforcement Order

```
1. Unauthenticated?           → 401 UNAUTHORIZED
2. Session expired?           → 401 SESSION_EXPIRED
3. Wrong tenant?              → 403 CROSS_TENANT_DENIED
4. Subscription expired?      → 403 SUBSCRIPTION_EXPIRED (read-only ops still OK)
5. Role not authorized?       → 403 FORBIDDEN
```

---

## Appendix B: Audit Trail Actions

The platform records **52 discrete actions** in a decision audit trail, organized by domain.

| Domain | Actions |
|---|---|
| **Assessment** | MARKED_FIT, MARKED_GAP, RESOLUTION_SELECTED, RESOLUTION_CHANGED, SCOPE_INCLUDED, SCOPE_EXCLUDED, NOTE_ADDED, APPROVED, SIGNED_OFF, REMAINING_ITEM_ADDED, FLOW_DIAGRAM_GENERATED, CONFIG_INCLUDED, CONFIG_EXCLUDED, GAP_APPROVAL_ADDED, GAP_ALTERNATIVE_ADDED, PROFILE_UPDATED, STATUS_TRANSITIONED, PHASE_UPDATED, SNAPSHOT_CREATED, ASSESSMENT_CLONED, TEMPLATE_CREATED, ASSESSMENT_FROM_TEMPLATE, CROSS_PHASE_LINKED |
| **Stakeholder** | STAKEHOLDER_ADDED, STAKEHOLDER_REMOVED, ROLE_CHANGED, USER_INVITED, USER_DEACTIVATED |
| **Security** | MFA_ENROLLED, SESSION_REVOKED, PERMISSION_OVERRIDE |
| **Registers** | INTEGRATION_CREATED/UPDATED/DELETED, DATA_MIGRATION_CREATED/UPDATED/DELETED, OCM_CREATED/UPDATED/DELETED |
| **Organization** | ORG_UPDATED |
| **Workshop** | WORKSHOP_CREATED, WORKSHOP_STARTED, WORKSHOP_COMPLETED |
| **Collaboration** | CONVERSATION_STARTED, CONVERSATION_COMPLETED, CONVERSATION_CLASSIFICATION_APPLIED |
| **Dashboard/UI** | DASHBOARD_WIDGET_UPDATED, DEADLINE_CREATED, DEADLINE_UPDATED |
| **Onboarding** | ONBOARDING_STARTED, ONBOARDING_COMPLETED |
| **Reporting** | REPORT_GENERATED, REPORT_BRANDING_UPDATED |
| **Commercial** | SUBSCRIPTION_UPGRADED, SUBSCRIPTION_CANCELED, DEMO_PROVISIONED |
| **Sign-Off** | SIGNOFF_INITIATED, AREA_VALIDATED, TECHNICAL_VALIDATED, CROSS_FUNC_VALIDATED, EXECUTIVE_SIGNED, PARTNER_SIGNED, SIGNOFF_REJECTED, CHANGE_REQUEST_CREATED, CHANGE_REQUEST_APPROVED, TRIGGER_CREATED |
| **PWA/Offline** | PUSH_SUBSCRIBED, OFFLINE_SYNCED |
