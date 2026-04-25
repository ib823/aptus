---
title: Aptus — Report Bundle Design Specification v1.2
companion-to: APTUS-DESIGN-SPEC.md
audience: visual designer producing static mocks for the 16-document export bundle
changelog:
  - v1.2 (2026-04-25): clarified §5.7 brand-override mechanism (Aptus mark/cover band/table headers always Aptus; client color exposed only as `--client-accent` for chart accents); added "OData / API" to §2.5 glossary; expanded §5.4 voice ladder rule to forbid SAP module-code abbreviations (FI/CO, MM, etc.) in client-facing tier.
  - v1.1 (2026-04-25): added Requirements Findings PDF (#04) + Requirements Traceability Matrix XLSX (#05); added §2.5 plain-language terminology block; renumbered subsequent files and sections.
  - v1.0 (2026-04-25): initial 14-document bundle.
---

# Aptus — Report Bundle Design Specification v1.2

> **Read `APTUS-DESIGN-SPEC.md` first.** This document inherits its visual system (color, typography, spacing, voice). It only describes how those tokens apply to printed/exported deliverables — and the layout for each of the 16 reports in the bundle.

---

## §0 — How to read this document

- **Scope**: the 16-file `Download report bundle (~1.5 MB ZIP)` produced from `/assessment/[id]/export` (Step 5).
- **Output**: static HTML mocks (one file per report) that I will translate into jsPDF + jspdf-autotable code (PDFs) and ExcelJS code (XLSX).
- **Page model**: A4 portrait, `210 × 297 mm`, `20 mm` outer margin, page-numbered footer. Landscape only where the table demands it (called out per-report).
- **Anti-goal**: do not redesign the app inside the report. The report is a **print artifact**; it ships to a client's email, gets printed on a hotel printer, gets attached to a steering-committee deck. Optimize for that, not for screen.

---

## §1 — Why the reports matter (and who reads them)

The app is for the **consultant** (Maya). The **report bundle is for the client** (Aliya, plus her CFO/CIO/PMO).

That distinction drives every design choice below:

| Audience | Reads on | Wants |
|---|---|---|
| Client steering committee | Printed A4, projected slide | One-screen verdict, big numbers, no jargon |
| Client functional lead (Aliya) | PDF on laptop | Per-process detail, traceability to source requirement |
| Client PMO | XLSX in Excel | Filterable rows, copy-paste-able into project plan |
| ABeam internal QA | All formats | Audit trail, who-changed-what, source citations |

**The bundle is the only artifact most of the client org will ever see of Aptus.** The polish here is the brand.

### 1.1 The "we heard you" promise

The client gave us a list of requirements (typically a spreadsheet of 500–1500 rows, often in their own internal language). They want to see, **for every single requirement they sent**, what we did with it. Not just the gaps. Not just the totals. **Every row, traced through.**

This is the job of `04_Requirements_Findings.pdf` (the narrative) and `05_Requirements_Traceability_Matrix.xlsx` (the searchable proof). Without these two files, the bundle reads like a deliverable produced *about* the client rather than *for* them.

---

## §2 — Print visual system (deltas from the app spec)

Inherit everything in `APTUS-DESIGN-SPEC.md §5`. The deltas below exist because print ≠ screen.

### 2.1 Typography (print)

| Role | Font | Size | Weight |
|---|---|---|---|
| Cover title | Geist Sans | 28 pt | 600 |
| Cover subtitle | Geist Sans | 14 pt | 400 |
| Section H1 | Geist Sans | 16 pt | 600 |
| Section H2 | Geist Sans | 12 pt | 600 |
| Body | Geist Sans | 10 pt | 400 |
| Table header | Geist Sans | 9 pt | 600 |
| Table body | Geist Sans | 9 pt | 400 |
| Caption / footnote | Geist Sans | 8 pt | 400 |
| Mono (IDs) | Geist Mono | 9 pt | 500 |

> **Why smaller than screen**: print pixels are sharper. 10 pt prints like 14 px reads. Going larger looks like a brochure, not a deliverable.

### 2.2 Color (print)

Same tokens as the app. Two extra rules:

1. **Backgrounds are white or near-white only.** No cards-on-canvas effect. Use `border` (`#E4E4E7`) hairlines instead of fills to separate sections — saves toner, prints crisply.
2. **Status pills lose their fill in print.** Print pill = colored 6 mm dot + 9 pt label, no background, no border. Saves ink and reproduces in monochrome printers as a grey dot at known position.

Status dot palette (matches app):

| Status | Dot color |
|---|---|
| FIT / OOTB / OK | `#15803D` |
| CONFIGURE / Pending | `#B45309` |
| GAP / Mandatory missing | `#B91C1C` |
| In progress / Info | `#1D4ED8` |
| N/A / Out of Scope | `#52525B` |

### 2.3 Margins, gutters, page furniture

| Element | Spec |
|---|---|
| Outer margin | `20 mm` left/right, `25 mm` top, `22 mm` bottom |
| Header band | top `0–18 mm`: brand-color fill (`#0B0B0F`), white type |
| Footer band | bottom `277–287 mm`: hairline rule `0.25 pt #E4E4E7`, then 8 pt muted text |
| Section gap | `12 mm` between H1 sections; `8 mm` between H2 sub-sections |
| Table → next section | `12 mm`, but **always page-break if remaining height < 30 mm** |

### 2.4 Cover page (every PDF)

Every PDF report opens with the **same cover layout**. This is the single biggest brand cue across the bundle.

```
┌──────────────────────────────────────────────────────────────┐
│ ████████████ brand-color fill (#0B0B0F), full-bleed top 90mm │
│                                                              │
│  Aptus                          (mark, 14 pt white, top-L)   │
│                                                              │
│                                                              │
│  Executive Summary              (28 pt white, semibold)      │
│  Bursa Malaysia Berhad          (14 pt white, regular)       │
│                                                              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  (white area below — 90mm to footer)                         │
│                                                              │
│   Industry        Banking & Capital Markets                  │
│   Country         Malaysia                                   │
│   Company size    Large enterprise (>10,000)                 │
│   Report date     April 25, 2026                             │
│   Prepared by     ABeam Consulting                           │
│                                                              │
│                                                              │
│   ─────────────────────────────────────────                  │
│                                                              │
│   This document summarizes the SAP S/4HANA fit-to-standard   │
│   assessment for Bursa Malaysia Berhad, covering 778         │
│   business requirements across 142 in-scope process items.   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                                      Aptus · Confidential · 1
```

- Brand-color block: top `90 mm`. Cover title baseline at `60 mm`. Subtitle at `72 mm`.
- Metadata table: starts at `110 mm`, two-column (`label 40 mm`, `value flex`), 6 mm row height.
- Hairline separator at `170 mm`.
- Lead paragraph: max `170 mm` width, 10 pt, line-height 14 pt.
- Footer (every page): `Aptus · Confidential · {pageNum}`.

### 2.5 Plain-language terminology (the canonical glossary)

This is the **single source of truth** for SAP-term-to-client-language translations. Used in:
- `04_Requirements_Findings.pdf` (printed in full as the "How to read this report" page).
- Tooltips / column headers in every XLSX (`Outcome` column shows the plain term, with a comment-balloon containing the SAP term).
- Microcopy on the `/assessment/[id]/scope` and `/requirements` pages in the app, when the user hovers a status pill.

**The translation table** — designer must reproduce this verbatim on the Findings cover page (page 2).

| SAP / consulting term | Plain-language label | One-line explanation (≤ 18 words) |
|---|---|---|
| OOTB / FIT | **Standard SAP** | The software does this exactly as you described, with no setup or code needed. |
| CONFIGURE | **Configurable** | The software does this, but our team needs to set it up for you. No code is written. |
| ADAPT_PROCESS | **Adapt to SAP** | We recommend adjusting how your team works to match SAP's standard way. Cheaper, future-proof. |
| ISV (gap resolution) | **Trusted add-on** | A third-party product certified for SAP fills this gap. Less risk than building from scratch. |
| KEY_USER_EXT | **Power-user extension** | One of your business users can build this in SAP's no-code tool — no developer needed. |
| BTP_EXT | **Cloud add-on (BTP)** | We build a small companion app on SAP's cloud platform. Modern, modular, decoupled from core SAP. |
| CUSTOM_ABAP | **Custom build** | We write new code inside SAP. Reserved for unique competitive advantage — used sparingly. |
| OUT_OF_SCOPE | **Out of scope** | Not addressed in this phase. May be revisited later or handled outside SAP. |
| GAP (status) | **Needs work** | SAP doesn't do this as standard — we've chosen one of the resolution options above. |
| NA (status) | **Not applicable** | This requirement doesn't apply to your business model. Closed with no further action. |
| Mandatory | **Must-have** | You flagged this requirement as non-negotiable. We've prioritised it accordingly. |
| L1 / L2 / L3 / L4 | **Process area / family / group / step** | SAP organises business processes in a 4-level tree. L4 is the most detailed (e.g., "Create sales order"). |
| Fit-to-standard | **Fit assessment** | The structured exercise of comparing your needs against what SAP does as standard. |
| Granularity | **Detail level** | How deeply we analysed each process — coarse (whole area), medium (sub-area), fine (each step). |
| Workstream | **Project track** | A parallel band of work (Finance, HR, Logistics, etc.) inside the overall project. |
| ECC / S/4HANA | **Old SAP / new SAP** | ECC is the prior generation. S/4HANA is what you're moving to — faster, simpler, cloud-ready. |
| SmartForms / Adobe Forms | **Document templates** | The SAP feature for designing printable / emailable documents (invoices, POs). |
| Transaction code (Tcode) | **SAP screen** | A short-code shortcut that opens a specific SAP screen. Power users still use them. |
| Fiori | **Modern SAP screens** | The new web-based SAP user interface. Mobile-friendly, role-based. |
| OData / API | **Data feed** | A standard way for one system to read or update data in another. Used by add-ons and portals. |

> **Designer note**: this table, on page 2 of `04_Requirements_Findings.pdf`, is the most important page in the entire bundle for client trust. **It's the page where the client realises we speak their language, not just SAP's.** Set it with care — generous line-height (14 pt), zebra striping at `#FAFAFA`, and a single-sentence intro: *"Throughout this document we use plain-language labels for SAP concepts. Here's the dictionary."*

---

## §3 — The 16 reports — inventory

| # | Filename in ZIP | Format | Audience | Pages (typical) |
|---|---|---|---|---|
| 1 | `01_Executive_Summary.pdf` | PDF portrait | Steering committee | 2–3 |
| 2 | `02_Effort_Estimate.pdf` | PDF portrait | PM, CFO | 2 |
| 3 | `03_Readiness_Scorecard.pdf` | PDF portrait | Steering committee | 3–4 |
| **4** | **`04_Requirements_Findings.pdf`** | **PDF portrait** | **Client functional lead, sponsor** | **8–24 (depends on req count)** |
| **5** | **`05_Requirements_Traceability_Matrix.xlsx`** | **XLSX** | **Client PMO, ABeam QA** | **1 sheet, 1 row per requirement** |
| 6 | `06_Scope_Catalog.xlsx` | XLSX | Functional lead | 1 sheet, 142 rows |
| 7 | `07_Step_Detail.xlsx` | XLSX | Functional lead | 1 sheet, ~3,000 rows |
| 8 | `08_Gap_Register.xlsx` | XLSX | PM, functional | 1 sheet, ~150 rows |
| 9 | `09_Config_Workbook.xlsx` | XLSX | Basis / Config team | 1 sheet, ~600 rows |
| 10 | `10_Integration_Register.xlsx` | XLSX | Tech lead | 4 sheets |
| 11 | `11_Data_Migration_Register.xlsx` | XLSX | Data lead | 5 sheets |
| 12 | `12_OCM_Report.xlsx` | XLSX | OCM lead | 4 sheets |
| 13 | `13_Flow_Atlas.pdf` | PDF landscape | Functional lead | N pages (1 per L4) |
| 14 | `14_Audit_Trail.xlsx` | XLSX | QA, compliance | 1 sheet |
| 15 | `15_Remaining_Items.xlsx` | XLSX | PM | 1 sheet |
| 16 | `16_Sign_Off.pdf` | PDF portrait | Client signatory | 2 |

The bundle ZIP contains all 16 plus a `README.txt` and the company branding (logo, color) the report was generated with.

---

## §4 — Per-report layout specs

For each PDF you'll produce **one HTML mock per page**. For each XLSX you'll produce **one HTML mock per sheet** showing column header style, row banding, and the freeze-panes rule.

### 4.1 `01_Executive_Summary.pdf`

**Purpose**: one document the CIO reads end-to-end in 5 minutes and decides whether the project is on track.

**Pages**:
- **Page 1**: Cover (per §2.4), then **the verdict block**.
- **Page 2**: Scope, Fit Analysis, Gap Resolution.
- **Page 3** (overflow): Configuration Activities + sign-off line.

**The verdict block (page 1, below cover content)**:

```
┌──────────────────────────────────────────────────────────────┐
│   Verdict                                                    │
│                                                              │
│      62%       17%       21%                                 │
│      OOTB      Config    Gap                                 │
│                                                              │
│   778 requirements analyzed across 142 in-scope items.       │
│   Estimated effort: 693 days.                                │
│                                                              │
│   Confidence: High (94% of process steps reviewed)           │
└──────────────────────────────────────────────────────────────┘
```

Three big numbers, 28 pt, brand color. Caption underneath, 9 pt muted.

**Page 2 sections** — each is an H1 + a single small table. Tables are 2-column or 3-column. **No charts on this page** — the verdict block already did the visual work.

**Page 3 — Configuration Activities** (the section that previously overlapped — now always page-broken when prior section can't accommodate it):
- H1 "Configuration Activities"
- One sentence: "{n} configuration activities for selected scope items, distributed across {k} workstreams."
- Mini-table: workstream / count.
- Sign-off line at bottom: `Prepared by ___________ · Approved by ___________ · Date ___________`.

**Mock deliverables**: 3 HTML files (`exec_p1.html`, `exec_p2.html`, `exec_p3.html`).

---

### 4.2 `02_Effort_Estimate.pdf`

**Purpose**: defensible bottom-up estimate the PM hands the CFO.

**Pages**:
- Page 1: Cover.
- Page 2: **Effort by Resolution Type** table + **Phase Breakdown** stacked-bar.
- Page 3 (overflow): **Confidence Assessment** + assumptions list.

**Effort by Resolution Type** (page 2, primary table):

| Resolution Type | Count | Avg days/item | Total days |
|---|---:|---:|---:|
| ISV | 138 | 5.0 | 690 |
| ADAPT_PROCESS | 1 | 3.0 | 3 |
| OUT_OF_SCOPE | 19 | 0.0 | 0 |
| KEY_USER_EXT | 0 | 2.0 | 0 |
| BTP_EXT | 0 | 8.0 | 0 |
| CUSTOM_ABAP | 0 | 12.0 | 0 |
| **Total** | **158** | — | **693** |

**Phase Breakdown** — horizontal stacked bar, full width, 24 mm tall, with phase labels on each segment ≥10% wide. Below the bar: 5-row table (Implementation 30%, Configuration 25%, Extensions 20%, Testing 15%, Training 10%) with day totals.

**Confidence Assessment**:
```
Steps reviewed: 94%        → Confidence: HIGH
```
Single line, 12 pt, with a colored dot (matches §2.2 status palette).

**Assumptions list** (always page 3 footer, even if it fits on page 2):
- Effort estimates use industry-standard heuristics by resolution type (ISV 5d, ADAPT 3d, BTP_EXT 8d, CUSTOM_ABAP 12d, KEY_USER_EXT 2d, OUT_OF_SCOPE 0d).
- Phase split is indicative; actual will vary by complexity.
- Excludes infrastructure provisioning, training material development, and post-go-live support.

**Mock deliverables**: 3 HTML files.

---

### 4.3 `03_Readiness_Scorecard.pdf`

**Purpose**: go / conditional-go / no-go recommendation, scored by category.

**Pages**:
- Page 1: Cover + **the headline** (a single big GO / CONDITIONAL GO / NO GO label).
- Page 2: Overall score + per-category breakdown.
- Page 3+: One page per category — findings + recommendations.

**The headline** (page 1, replaces the verdict block):

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                    CONDITIONAL GO                            │
│                    ●  72 / 100                               │
│                                                              │
│   Proceed with mitigation plan for the 3 amber categories.   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Label color: green (GO ≥85), amber (CONDITIONAL 60–84), red (NO GO <60). Filled rounded rect, 60 mm wide, centered. 18 pt white type.

**Per-category page** (one per category — Process, Data, Integration, Change, Tech, Org):

```
┌──────────────────────────────────────────────────────────────┐
│   Process Readiness                                ●  82/100 │
│   ──────────────────────────────────────────────────────────│
│                                                              │
│   Findings                                                   │
│   • 142 of 142 in-scope process items have been classified.  │
│   • 138 gaps remain in resolution-type ISV; backlog = 0.     │
│   • 4 process areas (Treasury, AR, AP, GL) at 100% reviewed. │
│                                                              │
│   Recommendations                                            │
│   ① Schedule a workshop with Treasury lead before May 15.    │
│   ② Lock the granularity decision at Coarse for Phase 1.     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

H1 with score-pill on the right. Two H2 sections (Findings, Recommendations) as bullet lists. **No tables on these pages** — they're meant to be skim-readable.

**Mock deliverables**: cover + headline + 1 generic per-category template = **3 HTML files** (the designer doesn't need to mock all 6 categories, just the template).

---

### 4.4 `04_Requirements_Findings.pdf` ★ NEW — the client-facing centerpiece

**Purpose**: close the loop with the client. For every requirement they sent, in their own ID and their own wording, show what we did with it — in plain English, with context for why.

**Why it exists**: the rest of the bundle is *evidence* (registers, audit trails, scorecards). This is the *answer*. If the client only opens one PDF, this is the one.

**Voice rule**: **zero SAP jargon in body copy.** All SAP terms appear only via the labels in §2.5. Where a SAP term genuinely cannot be replaced (e.g., "S/4HANA"), it appears with a 1-line explanation on first use, then plain language thereafter.

**Pages**:

- **Page 1** — Cover (per §2.4). Subtitle: *"Findings on every requirement you submitted."*
- **Page 2** — **How to read this report** (the §2.5 glossary, full table). One paragraph intro:
  > *"You submitted 778 requirements. We assessed each one against standard SAP S/4HANA. Throughout this document we use plain-language labels for SAP concepts — here is the dictionary so nothing reads as jargon."*
- **Page 3** — **Your requirements at a glance** (the headline stats, in human language).
- **Pages 4 to N** — **Findings by functional area** (one section per L1, with detail cards per requirement).
- **Last page** — **Why we recommend what we recommend** (the SAP best-practice education page).

#### Page 3 — "Your requirements at a glance"

```
┌──────────────────────────────────────────────────────────────┐
│  Your requirements at a glance                               │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  You sent us 778 requirements across 9 functional areas.     │
│                                                              │
│  Of those 778:                                               │
│    ●  482  (62%)  — Standard SAP. Nothing to build.          │
│    ●  132  (17%)  — Configurable in SAP. We'll set it up.    │
│    ●   41  (5%)   — Recommend adapting your process to SAP.  │
│    ●  138  (18%)  — Need an add-on, extension, or build.     │
│                                                              │
│  Bottom line: SAP covers 79% of what you asked for with no   │
│  new code. The remaining 21% is handled with a mix of        │
│  trusted add-ons and minimal custom development.             │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  By functional area                                          │
│                                                              │
│  Finance & Treasury           142 reqs   ●●●●●○○○○○ (89%)   │
│  Sales & Distribution         118 reqs   ●●●●●●○○○○ (76%)   │
│  Procurement                   97 reqs   ●●●●○○○○○○ (71%)   │
│  Supply Chain                  88 reqs   ●●●○○○○○○○ (62%)   │
│  Human Resources               73 reqs   ●●●●●●●○○○ (84%)   │
│  ...                                                         │
│                                                              │
│  (filled circles = % of reqs met by Standard SAP + Config.)  │
└──────────────────────────────────────────────────────────────┘
```

- The big-numbers block uses §4.1's verdict-block style — **but** the labels are the plain-language ones from §2.5.
- The per-area bar uses 10-segment Unicode-style dots (designer can ship as filled SVG circles instead).

#### Pages 4 to N — Per-area findings

One H1 page break per L1 area. Each area opens with a 60 mm summary box, then renders one **finding card** per requirement. Cards are designed to fit 4 per page (about 60 mm tall each).

**Area summary box**:
```
─────────────────────────────────────────────────────────
Finance & Treasury                            142 requirements
─────────────────────────────────────────────────────────

Headline: 89% of your finance requirements are met by
standard SAP. The remaining 11% are handled through
configuration — no custom code needed.

Standard SAP   ●●●●●●●●●●●●●●●  118  (83%)
Configurable   ●●●●●            10   (7%)
Adapt to SAP   ●                2   (1%)
Trusted add-on ●●               7   (5%)
Custom build   ●                3   (2%)
Out of scope   ●                2   (1%)
```

**Finding card** (one per requirement) — the most important element in the entire bundle:

```
┌──────────────────────────────────────────────────────────────┐
│  REQ-FIN-001                          ●  Standard SAP        │
│  ──────────────────────────────────────────────────────────  │
│  Your ask        Generate monthly trial balance with         │
│                  comparative prior-period analysis.          │
│                                                              │
│  What SAP does   Standard SAP produces this report           │
│                  exactly as described, with built-in         │
│                  comparison-period selection.                │
│                                                              │
│  What it means   Nothing for your team to build. Available   │
│  for you         from day one of go-live.                    │
└──────────────────────────────────────────────────────────────┘
```

- **Card width**: full content width (170 mm).
- **Card height**: variable by content; typical ~55 mm; 4 per page is the design target.
- **Top-right pill**: the plain-language outcome label (§2.5) with status dot.
- **Three labelled rows** — *Your ask* / *What SAP does* / *What it means for you*. The labels are constants in 9 pt mono `text-muted`; the values are 10 pt body.
- **No SAP transaction codes, no module abbreviations, no "Tcode F.01"** in the card body unless the client originally used those terms in their requirement (and even then, gloss them with a parenthetical).

**Variant cards by outcome** (designer should mock each):

1. **Standard SAP** (FIT) — the green-dot card above. *"What it means for you"* = "Nothing to build."
2. **Configurable** (CONFIGURE) — amber dot. *"What it means"* = "Our team configures it once. Future changes are admin-level — no developer needed."
3. **Adapt to SAP** (ADAPT_PROCESS) — amber dot. *"What it means"* = "We recommend adjusting how this is handled today. Why: SAP's standard approach is more efficient and avoids ongoing customisation cost."
4. **Trusted add-on** (ISV) — blue dot. *"What it means"* = "We deploy a certified third-party product (e.g., Kyriba). License cost: ~MYR X / year. Lower risk than custom code."
5. **Power-user extension** (KEY_USER_EXT) — blue dot. *"What it means"* = "One of your power users builds it in SAP's no-code tool. ~half a day of work."
6. **Cloud add-on** (BTP_EXT) — blue dot. *"What it means"* = "We build a small companion app on SAP's cloud platform. ~8 days. Stays separate from core SAP — easier upgrades."
7. **Custom build** (CUSTOM_ABAP) — red dot. *"What it means"* = "Unique to your business, so we build it in SAP. ~12 days. We've kept these to a minimum (only X% of your reqs)."
8. **Out of scope** (OUT_OF_SCOPE) — grey dot. *"What it means"* = "Not addressed in this phase. Reason: [out-of-scope reason from the data]. Can be revisited in a later phase."

#### Last page — "Why we recommend what we recommend"

```
┌──────────────────────────────────────────────────────────────┐
│  Why we recommend what we recommend                          │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  SAP's design philosophy is "configure, don't customize."    │
│  Every line of custom code creates future maintenance        │
│  burden, upgrade risk, and dependency on the developer       │
│  who wrote it.                                               │
│                                                              │
│  So when we evaluate each of your requirements, we follow    │
│  this hierarchy:                                             │
│                                                              │
│    1.  Can SAP do this as standard?                          │
│        → Use it. Cheapest, safest, upgrade-friendly.         │
│                                                              │
│    2.  Can we configure SAP to do this?                      │
│        → Configure it. Still upgrade-safe, no code.          │
│                                                              │
│    3.  Can your process adapt to SAP best practice?          │
│        → Recommend the adaptation. Often improves the        │
│          process; certainly cheaper to maintain.             │
│                                                              │
│    4.  Is there a trusted add-on (ISV)?                      │
│        → Use the add-on. Maintained by the vendor;           │
│          your team doesn't carry the support burden.         │
│                                                              │
│    5.  Can a power user build it?                            │
│        → Empower the user. SAP's no-code tools are mature.   │
│                                                              │
│    6.  Last resort: custom build (ABAP or BTP).              │
│        → Build it carefully. Reserved for genuine            │
│          competitive differentiation.                        │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│                                                              │
│  This is why most of your requirements land in categories    │
│  1–2. That isn't us being lazy — that's us protecting your   │
│  investment in SAP for the next 10 years.                    │
└──────────────────────────────────────────────────────────────┘
```

Single text page. 11 pt body, 16 pt line-height. Numbered steps with hanging indent. No graphics.

**Mock deliverables**: **6 HTML files**:
- `findings_p1_cover.html`
- `findings_p2_glossary.html`
- `findings_p3_glance.html`
- `findings_p4_area_summary.html`
- `findings_p5_card_variants.html` (single page showing all 8 card variants stacked)
- `findings_pN_recommendations.html`

---

### 4.5 `05_Requirements_Traceability_Matrix.xlsx` ★ NEW — the searchable companion

**Purpose**: every requirement, every column, filterable. This is the spreadsheet the client's PMO will actually open and search.

**Sheet structure** (1 sheet, "Requirements"):

| Column | Width | Type | Notes |
|---|---:|---|---|
| Req ID | 12 | mono | Client's original ID, preserved verbatim |
| Source File | 18 | text | Excel filename / sheet they came in via |
| Source Row | 8 | int | Original row number — for client to cross-check |
| Functional Area | 18 | text | L1 area (Finance, Sales, …) |
| Sub-area | 22 | text | L2 |
| Process | 28 | text | L4 step name |
| Mandatory | 10 | enum | Must-have / Nice-to-have |
| Your Ask | 60 | text | The verbatim requirement text |
| Outcome | 18 | enum | Plain label (`Standard SAP`, `Configurable`, …), status dot |
| What it means | 60 | text | The "What it means for you" sentence (auto-generated per outcome) |
| Effort (days) | 10 | int | Right-aligned, 0 for Standard SAP |
| Owner | 18 | text | ABeam consultant |
| Notes | flex | text | Free-form, often empty |

- **Header row**: brand-color fill `#0B0B0F`, white 11 pt bold, **frozen**.
- **Filter row**: enabled.
- **Outcome column**: conditional format — light tint of the status palette (`#15803D` → `#DCFCE7` background, etc.).
- **Mandatory column**: `Must-have` rows get a 1 mm left-border accent in `#B91C1C` (red), so the PMO can scan for must-haves.
- **Sort default**: by Functional Area, then Mandatory desc, then Req ID asc.

**Mock deliverable**: 1 HTML file showing the sheet at default zoom with ~12 visible rows demonstrating all outcome variants.

---

### 4.6 `06_Scope_Catalog.xlsx`

**Purpose**: master list of every L4 process item in scope.

**Sheet structure** (1 sheet, "Scope"):

| Column | Width | Type | Style note |
|---|---:|---|---|
| L1 | 18 | text | Bold first-row only |
| L2 | 24 | text | |
| L3 | 28 | text | |
| L4 | 36 | text | Wraps, 60-char limit |
| Decision | 14 | enum | Status dot + label (`● Selected`, `● Maybe`, `● Out`) |
| Granularity | 14 | enum | Coarse / Medium / Fine |
| Steps | 8 | int | Right-aligned |
| Reviewed % | 12 | int | Right-aligned, with `%` |
| Owner | 18 | text | Initials avatar + name |

- **Header row**: brand color fill `#0B0B0F`, white text, 11 pt bold, frozen.
- **Row banding**: every other row `#FAFAFA`.
- **Filter row**: enabled on row 1.
- **Conditional format**: Reviewed % → 3-color scale (red 0 → amber 50 → green 100).

**Mock deliverable**: 1 HTML file rendered as a screenshot of the sheet.

---

### 4.7 `07_Step_Detail.xlsx`

**Purpose**: row-per-step traceability — the level the functional lead lives in.

**Sheet structure** (1 sheet, "Steps"):

| Column | Width | Type |
|---|---:|---|
| Step ID | 12 | mono |
| L4 process | 28 | text |
| Step name | 32 | text |
| Verdict | 12 | enum (FIT / CONFIGURE / GAP / NA) with status dot |
| Resolution Type | 16 | enum |
| Source Reqs | 14 | mono, comma-list |
| Reviewed | 10 | enum (✓ / —) |
| Last edit | 14 | datetime |
| Notes | flex | text, wraps |

Same header / banding / freeze rules as Scope Catalog. **Verdict column conditionally formatted** with light tint of status color.

**Mock deliverable**: 1 HTML file.

---

### 4.8 `08_Gap_Register.xlsx`

**Purpose**: one row per gap with the resolution decision and effort.

**Columns**:

| Column | Width | Type |
|---|---:|---|
| Gap ID | 12 | mono |
| L4 process | 28 | text |
| Step | 28 | text |
| Resolution Type | 16 | enum (status dot) |
| Implementation days | 12 | int, right-aligned |
| Effort days | 12 | int, right-aligned |
| Risk Level | 12 | enum (Low / Medium / High) |
| Owner | 14 | text |
| Status | 12 | enum (Pending / Resolved) |
| Notes | flex | text |

Row banding + freeze + filter as before. **Effort days and Risk Level** get conditional 3-color scales.

**Mock deliverable**: 1 HTML file.

---

### 4.9 `09_Config_Workbook.xlsx`

**Purpose**: handover document for the configuration team.

**Single sheet "Configuration"**, columns:

| Column | Width | Type |
|---|---:|---|
| Config ID | 12 | mono |
| Module | 12 | enum (FI, CO, MM, SD, …) |
| Object | 24 | text |
| L4 Process | 28 | text |
| Field / Setting | 24 | text |
| Value | 18 | text |
| Owner | 14 | text |
| Target client | 10 | enum (DEV/QAS/PRD) |
| Status | 12 | enum |

**Mock deliverable**: 1 HTML file.

---

### 4.10 `10_Integration_Register.xlsx`

**Purpose**: every system-to-system touchpoint.

**4 sheets**: `Integrations`, `Endpoints`, `DataFlows`, `Errors`.

Each sheet follows the same header / band / freeze convention. The **`Integrations` sheet is the entry point** — first column is `Integration ID` (mono), and a row should fit on one screen at default Excel zoom.

**Mock deliverable**: 1 HTML file showing the `Integrations` overview sheet.

---

### 4.11 `11_Data_Migration_Register.xlsx`

**Purpose**: per-object migration plan.

**5 sheets**: `Objects`, `Mappings`, `Cleansing`, `Cutover`, `Reconciliation`.

`Objects` is the entry sheet. Same conventions.

**Mock deliverable**: 1 HTML file showing the `Objects` overview sheet.

---

### 4.12 `12_OCM_Report.xlsx`

**Purpose**: organisational change impact, role mapping, training plan.

**4 sheets**: `Stakeholders`, `Impact`, `Training`, `Comms`.

Same conventions. `Impact` is the entry sheet.

**Mock deliverable**: 1 HTML file showing the `Impact` sheet.

---

### 4.13 `13_Flow_Atlas.pdf`

**Purpose**: one printable swim-lane per L4 process.

**Pages**: cover + N pages (one per L4). **Landscape**.

**Per-page layout**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Flow Atlas — Order to Cash > Sales Order Processing      Aptus · Page 7  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Customer  ──┐                                                             │
│              ▼                                                             │
│  Sales      [Create SO]──[Check credit]──[Confirm]──┐                     │
│                                                      ▼                     │
│  Warehouse                                       [Pick & pack]──┐          │
│                                                                  ▼         │
│  Finance                                                    [Bill]         │
│                                                                            │
│  ─────────────────────────────────────────────────────────────────────────│
│  Verdict: ● CONFIGURE   Steps: 12   Gaps: 2 (ISV)   Owner: M. Tan         │
└────────────────────────────────────────────────────────────────────────────┘
```

- Swim-lanes: rows are roles (Customer, Sales, Warehouse, Finance). Columns are auto-laid-out by step order.
- Step boxes: 32 mm × 12 mm, 1 pt border, status dot in top-left corner.
- Connectors: 0.75 pt grey lines with arrowheads.
- Footer line under the diagram: verdict pill + step count + gap count + owner.

**Mock deliverable**: 1 cover HTML + 1 example landscape page HTML.

---

### 4.14 `14_Audit_Trail.xlsx`

**Purpose**: who-did-what, for QA and SOC2-style compliance evidence.

**Single sheet "Audit"**, columns:

| Column | Width | Type |
|---|---:|---|
| Timestamp | 18 | datetime |
| Actor | 18 | text (email) |
| Action | 16 | enum |
| Entity Type | 16 | enum |
| Entity ID | 14 | mono |
| Before | 28 | text (truncated 80c) |
| After | 28 | text (truncated 80c) |
| IP | 14 | text |

Sort default: timestamp DESC. Header conventions as before.

**Mock deliverable**: 1 HTML file.

---

### 4.15 `15_Remaining_Items.xlsx`

**Purpose**: punch-list of unresolved scope items, gaps, and decisions.

**Single sheet "Remaining"**, columns:

| Column | Width | Type |
|---|---:|---|
| Type | 12 | enum (Scope / Step / Gap / Decision) |
| ID | 12 | mono |
| Description | flex | text |
| Blocking | 10 | enum (Yes / No) — Yes rows in red tint |
| Owner | 14 | text |
| Due | 12 | date |
| Notes | flex | text |

**Mock deliverable**: 1 HTML file.

---

### 4.16 `16_Sign_Off.pdf`

**Purpose**: physical or digital signature page.

**Pages**:
- Page 1: Cover.
- Page 2: Sign-off block.

**Sign-off block** (page 2, the only meaningful content):

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   This document confirms that the SAP S/4HANA fit-to-        │
│   standard assessment for Bursa Malaysia Berhad has been     │
│   reviewed and accepted as the basis for project planning.   │
│                                                              │
│   ┌─────────────────────────┬─────────────────────────┐     │
│   │ Client signatory        │ ABeam signatory         │     │
│   │                         │                         │     │
│   │ Name:                   │ Name:                   │     │
│   │ Title:                  │ Title:                  │     │
│   │                         │                         │     │
│   │ Signature: ___________  │ Signature: ___________  │     │
│   │                         │                         │     │
│   │ Date: ____ / ____ / ___ │ Date: ____ / ____ / ___ │     │
│   └─────────────────────────┴─────────────────────────┘     │
│                                                              │
│   Bundle hash (SHA-256):                                     │
│   a1b2c3d4… (full hash, mono 8 pt)                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- Two-up signature blocks, 80 mm × 70 mm each.
- Bundle hash printed at the foot — proves the signed bundle hasn't been tampered with.
- Footer: same brand line as every other PDF.

**Mock deliverable**: 1 HTML file (page 2 only — page 1 is the standard cover).

---

## §5 — Cross-cutting design rules

### 5.1 Charts (apply only to Executive Summary, Effort Estimate, Readiness Scorecard, Requirements Findings)

**Chart library**: a single SVG style. **No 3D, no gradients, no drop shadows.**

| Chart | Use | Color |
|---|---|---|
| Horizontal stacked bar (effort phases) | Effort Estimate | brand `#0B0B0F` for primary, neutral `#52525B` for secondary, status palette for categorical splits |
| Donut (verdict mix) | Optional — Executive Summary | three-segment, brand + warning + danger |
| Score gauge (semi-circle) | Readiness Scorecard | green / amber / red, single value |
| 10-segment dot bar (per-area progress) | Requirements Findings | filled `#15803D` for met, hollow `#E4E4E7` for unmet |

**No legend if the labels can sit inline.** Labels inside segments where the segment width allows; otherwise, callouts with leader lines.

### 5.2 Numbers

- Right-align all numeric columns in tables.
- Thousands separator: `,` (en-US locale).
- Currency: `MYR 1,234,567` (3-letter ISO, space, formatted number). No decimals unless cents matter.
- Percentages: `62%` (no decimal), `0.4%` (one decimal only when <10%).
- Days: `693 days`, never `693d`.

### 5.3 Empty / zero / N/A handling

- Empty cell in XLSX: blank, not `—` or `null`.
- Zero in PDF table: `0` (not `—`). Zero is information.
- N/A: `—` (em-dash). Reserve for "doesn't apply", not "missing".

### 5.4 Voice — the jargon ladder

A simple, mandatory 3-level ladder for every word that appears in any client-facing report:

| Level | Where it can appear | Example |
|---|---|---|
| **Plain** | Body copy of `04_Requirements_Findings.pdf`, all card "What it means" sentences, every chart caption, every executive page in any PDF | "Standard SAP", "Configurable", "Trusted add-on", "Cloud add-on" |
| **Hybrid** | Column headers in XLSX (where space is tight), section headers in PDFs aimed at functional leads | "Outcome", "Resolution Type", "Effort (days)" |
| **Technical** | Audit Trail, Config Workbook, Integration Register, Step Detail (sheets aimed at SAP-literate ABeam staff and the client tech team only) | "Tcode", "ABAP", "BAdI", "iDoc", "BTP" |

**The rule**: a technical term that escapes its level (e.g., "ABAP" in the Findings PDF body) is a bug. Reviewer should treat it like a typo.

**No SAP module-code abbreviations in client-facing tier.** "FI/CO", "MM", "SD", "PP/WM", "HR" etc. are technical-tier shorthand — they may not appear in the Executive Summary, Effort Estimate, Readiness Scorecard, or Findings PDFs even as parentheticals. Use the full workstream name ("Finance & Treasury", "Procurement", "Sales & Distribution", "Supply Chain", "Human Resources").

**No abbreviated outcome labels.** Always spell out "Power-user extension", never "Power-user ext"; always "Cloud add-on", never "BTP add-on" without context. The labels in §2.5 are the canonical strings.

### 5.5 Localization (out of scope for v1)

English-only for the v1 bundle. **But**: don't bake English into the chart library or the cover template. Strings should sit in a single dictionary so localization is a string swap, not a redesign. **The §2.5 glossary is the prime candidate for early localisation** — it's the most read, most translated table in the bundle.

### 5.6 Accessibility (print)

- Status indicators always combine **color + shape + label** (dot + word). Color-blind clients still get the signal.
- Minimum body type 9 pt. Minimum table type 8 pt for footnotes only.
- Tables: 1 pt borders, never 0.5 pt — copy machines drop the latter.

### 5.7 Branding override (Aptus mark always stays Aptus)

**Aptus is the solution brand.** The client (e.g., Bursa Malaysia Berhad) is whose data the report is about — they are not the brand of the tool. The bundle uses the assessment's `BrandingConfig` only to expose **one** value: a single client-accent color that may appear on chart accents and one optional secondary rule. Everything else is locked Aptus.

**Locked Aptus brand identity (never overridden):**

| Element | Always Aptus |
|---|---|
| The Aptus mark on every cover | `#0B0B0F` (or white on the dark band) |
| The dark cover band fill (top 90 mm) | `#0B0B0F` |
| XLSX table headers | `#0B0B0F` background, white text |
| Contact-sheet thumbnail bands | `#0B0B0F` |
| Footer text | `text-muted` |

**Where the client accent (`--client-accent`) MAY appear:**
- Score-gauge ring stroke (Readiness Scorecard)
- Phase-bar segments (Effort Estimate) — only if explicitly requested
- One optional 2pt top-rule on covers (a subtle "this report was prepared for X" cue)

**CSS pattern (canonical):** the variable defaults to Aptus brand and is overridden via inline style on the page element:

```html
<!-- Default Aptus brand -->
<div class="page">…</div>

<!-- Client brand-accent override (any color) -->
<div class="page" style="--client-accent: #003DA5;">…</div>
```

The CSS uses `var(--client-accent, var(--brand))` everywhere it wants the optional accent. **Never** select on the value (i.e., no `[data-brand="bursa"]` rules — the override mechanism must work for any client color without naming it).

**Required mock variants:** one default-brand cover (Aptus only) and one client-accent variant (e.g., `#003DA5` Bursa blue) — proves the system tolerates colour swaps without bleeding into Aptus identity.

---

## §6 — Mock deliverable summary (for the designer)

Total HTML mocks: **27**.

| Report | Mocks |
|---|---|
| Executive Summary | 3 (cover-with-verdict, page 2, page 3) |
| Effort Estimate | 3 (cover, page 2, page 3) |
| Readiness Scorecard | 3 (cover-with-headline, score page, category template) |
| **Requirements Findings** ★ | **6 (cover, glossary, at-a-glance, area-summary, card-variants, recommendations)** |
| **Requirements Traceability Matrix** ★ | **1 (sheet view with all outcome variants visible)** |
| Scope Catalog | 1 |
| Step Detail | 1 |
| Gap Register | 1 |
| Config Workbook | 1 |
| Integration Register | 1 |
| Data Migration Register | 1 |
| OCM Report | 1 |
| Flow Atlas | 2 (cover, landscape example) |
| Audit Trail | 1 |
| Remaining Items | 1 |
| Sign-off | 1 (signature page) |

**Plus** one branding-override variant of the cover and one chart, per §5.7.

**Format**: each mock as a self-contained `.html` file with inline CSS. A4 dimensions in CSS (`width: 210mm; height: 297mm; padding: 20mm 20mm 22mm 20mm;`) so it prints to a real PDF at 1:1.

---

## §7 — Acceptance criteria

A report mock is "done" when:

1. It uses the typography, color, and spacing tokens from `APTUS-DESIGN-SPEC.md` §5 (with the print deltas in §2 here).
2. The cover follows the layout in §2.4 exactly — same brand block dimensions, same metadata grid.
3. Tables use the header / banding / freeze rules from §4 (XLSX) or the borderless 0.5 pt convention from §2 (PDF tables).
4. Every page has the standard footer: `Aptus · Confidential · {pageNum}` (centered, 8 pt, muted).
5. No motion, no shadows, no gradients, no rounded corners >4 pt.
6. The mock prints from a browser (`Cmd+P → Save as PDF`) at 1:1 with no clipping.
7. **Voice check (Findings PDF only)**: scan body copy and card content for any term not on the §2.5 glossary's "Plain-language label" column. Each violation is a bug.

---

## §8 — What this document is NOT

- It is not a re-spec of the visual system. The system lives in `APTUS-DESIGN-SPEC.md`. This is the *application* of that system to printed deliverables.
- It is not a content spec. What goes inside the tables (which fields, which calculations) is governed by `src/lib/report/report-data.ts` and is fixed.
- It is not the designer's brief for the app screens. That is `APTUS-DESIGN-SPEC.md` §8.

---

*End of v1.1. Open a comment on this file for changes.*
