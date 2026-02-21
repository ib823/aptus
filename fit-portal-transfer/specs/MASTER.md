# Bound Fit Portal — Master Specification

## Document Index

| # | Document | Purpose | Status |
|---|----------|---------|--------|
| 00 | **MASTER.md** (this file) | Index, product vision, success criteria | Active |
| 01 | **AGENT-PROTOCOL.md** | Rules governing ALL AI agents building this project | Active |
| 02 | **DATA-CONTRACT.md** | Exact ZIP contents, schemas, row counts, integrity checks | Active |
| 03 | **DATA-MODEL.md** | Complete Prisma schema for the database | Active |
| 04 | **ARCHITECTURE.md** | Tech stack, folder structure, environment setup | Active |
| 05 | **SCREENS.md** | Every screen, every component, every interaction | Active |
| 06 | **DESIGN-SYSTEM.md** | Visual design: colors, typography, spacing, components | Active |
| 07 | **API-CONTRACT.md** | Every API endpoint with request/response schemas | Active |
| 08 | **DECISION-FRAMEWORK.md** | Fit/Configure/Extend/Build/Adapt logic codified | Active |
| 09 | **BUILD-PHASES.md** | Phase-by-phase plan with quality gates | Active |
| 10 | **VERIFICATION.md** | Data completeness checks, test specs, acceptance criteria | Active |

---

## Product Vision

**Bound Fit Portal** is a standalone web application that enables SAP implementation clients to self-assess their business processes against SAP S/4HANA Cloud Public Edition best practices, identify gaps, make informed decisions about each gap, and produce an auditable scope document that drives accurate estimation.

### What It Is

A decision journal that systematically walks clients through every SAP best practice process step relevant to their business, captures their current state, identifies gaps, presents resolution options with cost/risk tradeoffs, and generates a complete, traceable, auditable report.

### What It Is NOT

- NOT an estimation calculator (estimation is a downstream consumer of the output)
- NOT a replacement for consultants (consultants manage the Intelligence Layer and review gaps)
- NOT a general-purpose questionnaire (every question traces to a specific SAP BPD step)
- NOT a demo or prototype (this is a production-grade enterprise tool)

---

## Users

### External Users (Client-Side)

Per-company access. MFA (TOTP) enrollment mandatory before accessing any assessment data.

| Persona | Access Level | Primary Actions |
|---------|-------------|-----------------|
| **Process Owner** | Area-locked edit | Reviews process steps for their ASSIGNED functional areas only. Can mark fit/gap and add notes. Editing is restricted to assigned areas — no visibility into or ability to modify steps outside their scope. |
| **IT Lead** | Read-only + technical notes | Read-only access to all assessment data across all functional areas. Can add technical notes to any step. Cannot change fit status or resolution decisions. |
| **Executive** | Dashboard-only | Dashboard-only view showing company progress by area and by person. Can download reports and sign off on completed assessments. No access to individual step editing. |

### Internal Users (Bound Team)

| Persona | Access Level | Primary Actions |
|---------|-------------|-----------------|
| **Consultant** | Full cross-assessment | Manages Intelligence Layer, reviews gap resolutions. Can override area-locked editing restrictions (all overrides are audit-logged). Full visibility across all assessments and all companies. |
| **Admin** | Full system access | Manages assessments, ingests new SAP releases, manages users and organizations. Full CRUD on all entities. |

---

## Success Criteria (Measurable)

1. **100% data coverage**: Every file from the SAP ZIP (1,527 files) is represented in the database
2. **100% step coverage**: All 102,261 process steps are reviewable in the portal
3. **100% config coverage**: All 4,703 configuration activities are displayed and categorized
4. **Audit trail completeness**: Every user action is logged with who/when/what/why
5. **Report generation**: PDF/XLSX output contains every decision made during assessment
6. **Zero SAP jargon in client-facing UI**: All SAP codes hidden behind human-readable labels
7. **Save/resume**: Clients can stop and resume at any point without data loss
8. **Multi-stakeholder**: Multiple users work on the same assessment simultaneously
9. **MFA**: All external users must complete TOTP MFA enrollment before accessing assessment data
10. **Area-locked editing**: Process owners can only edit steps in their assigned functional areas
11. **Concurrent session**: No account sharing — one active session per user enforced
12. **Process Flow Atlas**: Sequential annotated flow diagrams generated per scope item, exportable as SVG/PDF
13. **Remaining Items Register**: Auto-generated list of all items needing post-assessment resolution
14. **Per-company dashboard**: Each company sees their team's progress by area and by person

---

## Source Data

**Single source of truth**: `/workspaces/cockpit/SAP_Best_Practices_for_SAP_S4HANA_Cloud_Public_Edition_2508_MY_SAPCUSTOMER.zip`

All data specifications are in `DATA-CONTRACT.md`. No data may be fabricated, estimated, or assumed. If a value cannot be derived from the ZIP, it must be marked as requiring manual input in the Intelligence Layer.

---

## Constraints

1. **Separate codebase**: Not embedded in the main Bound portal. Own Next.js app, own database.
2. **Same tech stack**: Next.js 15, TypeScript, Prisma, PostgreSQL, Tailwind CSS, shadcn/ui
3. **Apple HIG-inspired design**: Clean, spacious, system fonts, minimal chrome
4. **No third-party AI/LLM at runtime**: The portal does not call AI APIs. All logic is deterministic.
5. **Offline-capable data**: Once SAP data is ingested, the portal works without external dependencies.
6. **GDPR-aware**: Client data (company name, stakeholder emails, process notes) is stored with encryption and retention policies.
7. **MFA mandatory for all external users**: TOTP-based multi-factor authentication required before any assessment data access.
8. **One active session per user**: Concurrent session blocking enforced — no account sharing permitted.
9. **Area-locked editing enforced at API layer**: Process owner editing restrictions are enforced server-side, not merely hidden in the UI.

---

## Blueprint Output Package

The following deliverables are generated from each completed assessment:

| # | Deliverable | Format | Description |
|---|-------------|--------|-------------|
| 1 | Executive Summary | PDF | High-level overview of assessment results, key decisions, and recommendations |
| 2 | Scope Item Catalog | PDF/XLSX | Complete list of scope items with inclusion/exclusion status and rationale |
| 3 | Process Step Detail | XLSX | Full breakdown of all process steps with fit status, notes, and decisions |
| 4 | Gap Register | XLSX | All identified gaps with resolution paths, owners, and effort indicators |
| 5 | Configuration Workbook | XLSX | All configuration activities categorized by mandatory/recommended/optional |
| 6 | Extension Register | XLSX | All gaps resolved via extension with technical specifications |
| 7 | Adaptation Register | XLSX | All gaps resolved via adaptation with change descriptions |
| 8 | Effort Estimate | PDF | Aggregated effort estimates derived from resolution decisions |
| 9 | Decision Audit Trail | XLSX | Complete immutable log of every decision made during the assessment |
| 10 | SAP Reference Pack | ZIP | Relevant SAP BPD source documents bundled for reference |
| 11 | Process Flow Atlas | PDF | Sequential annotated process flow diagrams per scope item, color-coded by fit status (green=FIT, blue=CONFIGURE, amber=GAP, gray=N/A). Exportable as SVG/PDF. |
| 12 | Remaining Items Register | XLSX | All items requiring post-assessment resolution: unreviewed steps, MAYBE scope items, excluded recommended configs, out-of-scope gaps, integration points, data migration requirements |

---

## Terminology

| Term | Definition |
|------|-----------|
| **Scope Item** | An SAP-defined business process unit (e.g., "Accounts Payable" = J60). 550 in this release. |
| **Process Step** | A single action within a scope item's BPD test script. 102,261 total. |
| **Configuration Activity** | A system setting that must be configured. 4,703 total, categorized as Mandatory/Recommended/Optional. |
| **BPD** | Business Process Document — SAP's test script for a scope item (DOCX + XLSX pair). |
| **Assessment** | A single client engagement — the complete review of their processes against SAP best practices. |
| **Gap** | A process step where the client's current practice differs from SAP best practice. |
| **Resolution** | The chosen path for addressing a gap: FIT, CONFIGURE, EXTEND, BUILD, or ADAPT. |
| **Intelligence Layer** | Internally maintained data: effort baselines, industry profiles, extensibility catalog, adaptation patterns. Not from the ZIP. |
| **Decision Log** | Immutable append-only audit trail of every action taken during an assessment. |
| **Process Flow Atlas** | Collection of sequential annotated process flow diagrams generated from assessment data, color-coded by fit status (green=FIT, blue=CONFIGURE, amber=GAP, gray=N/A). One diagram per scope item. |
| **Remaining Items Register** | Comprehensive list of items that need resolution after the assessment: unreviewed steps, MAYBE scope items, excluded recommended configs, out-of-scope gaps, integration points, data migration requirements. |
| **Area-Locked Editing** | Permission model where process owners can only edit data within their assigned functional areas. Enforced at the API layer, not just the UI. |
| **MFA** | Multi-Factor Authentication via TOTP (Time-Based One-Time Password), mandatory for all external users before accessing assessment data. |
