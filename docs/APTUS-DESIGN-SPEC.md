# Aptus — Product Design Specification v1.0

> A complete, designer-ready specification for the Aptus FIT-to-Standard
> analyzer. This document is the single source of truth for layout, IA,
> interactions, components, copy, and visual system. A senior product
> designer should be able to start producing high-fidelity Figma frames
> from this without needing further clarification.

**Status**: Draft 1.0 · Anchor for redesign work
**Owner**: Aptus product team
**Audience**: Product designers, UI engineers, copywriters

---

## §0 — How to read this document

- **§1–§3** establish the product, the user, and the job-to-be-done.
- **§4–§7** define the design system (visual + interaction primitives).
- **§8** is the heart: surface-by-surface specifications.
- **§9–§13** cover microcopy, responsive, accessibility, motion, and implementation notes.
- **§14** is the appendix with glossary + personas.

If a designer is working on a single screen, jump straight to §8.X for that surface — each section is self-contained and references the system primitives.

---

## §1 — Product overview

### What Aptus is

A **progressive FIT-to-Standard analyzer** for SAP S/4HANA Cloud Public Edition implementations. A consultant runs an engagement (typically 2–8 weeks of analysis, never workshops in our model) and produces a 14-document deliverable bundle for the client.

### What Aptus is NOT

- Not a workshop facilitation tool
- Not a multi-actor collaboration platform
- Not a project management system
- Not Cloud ALM
- Not a fully-automated SaaS analyzer (that's a future tier)

### One-line frame

**"A consultant brings either a client requirements spreadsheet OR no spreadsheet, and Aptus walks them through 5 steps to produce a publish-ready FIT-to-Standard report."**

Everything else (workshops, sign-off ceremonies, multi-tenant orgs, role hierarchies) is residual complexity from earlier ambitions and should be hidden by default.

---

## §2 — Personas (real, primary)

### Persona 1: Maya — the Lead Consultant (PRIMARY)

- 8 years SAP, 2 years on Cloud ERP Public Edition specifically
- Runs 4–6 engagements per year, each producing one deliverable
- Lives in: Maya's laptop browser + Excel + her notes app
- Pain: every engagement is currently a custom Excel project; deliverables look unprofessional next to Big-4 outputs
- Wants: a tool that produces Big-4-quality deliverables in 1/4 the time
- Expert at: SAP terminology, gap analysis, scope-item navigation
- Beginner at: design tools, project management software, anything fancy

### Persona 2: David — the Project Manager (SECONDARY)

- Oversees Maya across multiple engagements
- Lives in: dashboards, status reports, weekly reviews
- Pain: never has a clean view of "where is each engagement"
- Wants: status visibility without having to ask Maya
- Expert at: portfolio management
- Beginner at: SAP terminology

### Persona 3: Aliya — the Client SME (TERTIARY)

- A subject-matter expert at the client (e.g., Bursa Malaysia's Treasury team lead)
- Receives a share-link from Maya to review the assessment
- Visits Aptus 2–3 times in the engagement; never logs in beyond that
- Pain: doesn't know what FIT-to-Standard means; intimidated by SAP detail
- Wants: a clean read-only view of "what's in scope, what's out of scope"
- Expert at: their domain
- Beginner at: SAP, the Aptus tool itself

### What this means for design

**Optimize for Maya.** David is "good if reachable in 2 clicks from anywhere." Aliya is "read-only mode, large type, plain language." Stop optimizing for any other persona — there isn't one.

---

## §3 — Jobs-to-be-done (the prescribed flow)

### The 5 Steps (this is the spine of the entire product)

| # | Step | Maya's job-statement | Output artifact |
|---|---|---|---|
| 1 | **Define** | "Capture engagement basics — client, country, edition." | Profile (5 fields) |
| 2 | **Bring requirements** | "Either I upload the client's RFP, or I pick scope items myself." | Scope + Requirements list |
| 3 | **Analyze** | "Map each requirement to SAP 2602 inventory; classify FIT/Config/Gap." | Classification per requirement |
| 4 | **Adjust** | "Refine the analysis — override AI, add notes, drill into specifics." | Verdict + notes per scope item |
| 5 | **Export** | "Produce the deliverable bundle to send to the client." | 14-document ZIP |

**Every product surface either advances one of these 5 steps OR exits the flow.** If a screen does neither, it shouldn't be in the default UI.

---

## §4 — Design principles (5, in priority order)

1. **One canonical surface per concept.** A scope item lives in exactly one place. A requirement lives in exactly one place. No duplicated views.
2. **Status visible always.** Maya should always know which step she's on and what unlocks next.
3. **Progressive disclosure or it's noise.** 30 form fields → 5 visible + "More." 14 reports → 1 button + "Individual reports." 96k steps → drill down on demand.
4. **Forgive everything.** No invisible gates. No silent blocks. Every "can't do that yet" preceded by a clear "do this first."
5. **Apple-class polish or none.** If a surface can't be polished to Apple/Linear/Stripe quality this release, **hide it from the default nav**. Don't ship half-polish.

These principles override any single-screen design choice. When in conflict, principle 1 wins.

---

## §5 — Visual system

### 5.1 Typography

| Role | Font | Size | Weight | Line height |
|---|---|---|---|---|
| Display (page title, hero) | Geist Sans | 32 / 28 / 24 px (responsive) | 600 | 1.15 |
| Heading 1 (section) | Geist Sans | 22 px | 600 | 1.2 |
| Heading 2 (sub-section) | Geist Sans | 18 px | 600 | 1.3 |
| Body | Geist Sans | 14 px | 400 | 1.5 |
| Body small (helper, caption) | Geist Sans | 12 px | 400 | 1.4 |
| Mono (scope item IDs, code) | Geist Mono | 12 / 13 px | 500 | 1.4 |

**Rule**: never more than 4 font sizes in one screen. If you need a 5th, simplify the layout.

### 5.2 Color palette

**Neutral scale** (the chrome — 90% of pixels):

| Token | Light mode hex | Dark mode hex | Usage |
|---|---|---|---|
| `bg` | `#FAFAFA` | `#0B0B0F` | App background |
| `surface` | `#FFFFFF` | `#15151A` | Cards, drawers, modals |
| `surface-2` | `#F4F4F6` | `#1D1D24` | Hover, secondary panels |
| `border` | `#E4E4E7` | `#27272A` | Dividers, input borders |
| `text` | `#0B0B0F` | `#FAFAFA` | Primary text |
| `text-muted` | `#52525B` | `#A1A1AA` | Helper, captions |
| `text-subtle` | `#71717A` | `#71717A` | Disabled, placeholders |

**Accent (single brand color, sparingly)**:

| Token | Hex | Usage |
|---|---|---|
| `brand` | `#0B0B0F` (matches Aptus mark) | Primary buttons, focused state, brand emphasis |
| `brand-text` | `#FFFFFF` | Text on brand-filled surfaces |

**Status colors** (granularity tiers + verdicts + classification):

| Token | Hex | Usage |
|---|---|---|
| `status-success` | `#15803D` (emerald-700) | Coarse / FIT / OOTB / OK |
| `status-warning` | `#B45309` (amber-700) | Medium / Has Gaps / Configuration / Pending |
| `status-info` | `#1D4ED8` (blue-700) | Fine / In progress / Information |
| `status-danger` | `#B91C1C` (red-700) | Gap / Error / Mandatory missing |
| `status-neutral` | `#52525B` (zinc-600) | NA / Out of Scope / Inactive |

**Backgrounds for status pills are 50-tone of each (e.g. `emerald-50` for success).** Border at 200-tone. Text at 700-tone. Pattern is consistent across all 5 statuses.

### 5.3 Spacing scale (8px grid)

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96` px.

**Page-level rule**: between major sections use `48px` (top/bottom). Between sibling cards: `16px`. Inside a card: `12–16px`. Form field gap: `12px`.

### 5.4 Border radius

| Element | Radius |
|---|---|
| Buttons, inputs, pills | `6px` |
| Cards, modals, drawers | `8px` |
| Avatars, status dots | full |
| App container | `0` (full bleed) |

### 5.5 Shadows

Two only:
- `sm`: `0 1px 2px rgba(0,0,0,0.06)` — buttons, hover states
- `md`: `0 4px 12px rgba(0,0,0,0.08)` — drawers, modals, dropdowns

Apple-class lesson: **avoid heavy shadows.** They date a UI fastest.

### 5.6 Motion

| Pattern | Duration | Easing | Use |
|---|---|---|---|
| Hover | `100ms` | `ease-out` | Color shifts on buttons, links |
| State change | `200ms` | `ease-in-out` | Tab switch, pill color change |
| Drawer open | `240ms` | `cubic-bezier(0.32, 0.72, 0, 1)` | Side panel slide-in |
| Modal | `180ms` | `ease-out` | Fade + tiny scale |
| Toast | `150ms` in, `200ms` out | `ease-out` | Notification slide |
| Page transition | `none` (default) — Next.js handles | — | — |

**Apple-class rule**: motion clarifies hierarchy. No motion for vanity. No "loading shimmer" if data loads in <200ms.

### 5.7 Iconography

Lucide React icons (already in repo). Icon sizes pinned:
- Inline with text: `16px`
- Button leading icon: `16px`
- Standalone (e.g., empty state): `40px` or `48px`
- Hero/feature: `64px`

**Stroke weight 1.5 throughout.** Don't mix weights.

### 5.8 Density

**Aptus is medium-density.** Not Bloomberg (financial-pro), not Notion (writer-relaxed). Roughly **Stripe Dashboard** as the reference.

Concrete: a typical scope-list row is 56px tall with 16px horizontal padding. A typical form field is 40px tall. A typical card has 16–24px internal padding. Tables can dip to 44px row height for 100+ rows.

---

## §6 — Layout system

### 6.1 App shell (every authenticated page)

```
┌──────────────────────────────────────────────────────────────┐
│ ┌─Logo─┐  Aptus    [Search ⌘K]              [User menu ▾]   │  ← top bar (56px)
├──────────────────────────────────────────────────────────────┤
│ ┌─Side─┐  ┌──────────────────────────────────────────────┐ │
│ │ rail │  │                                              │ │
│ │      │  │           Content area                       │ │
│ │ 64px │  │  (24px padding, max-width 1280px,           │ │
│ │      │  │   centered on >1280, full bleed below)      │ │
│ │      │  │                                              │ │
│ └──────┘  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Top bar**: logo + product name + global search trigger + user menu. **Always 56px tall.** No tabs in the top bar.

**Side rail**: collapsed by default (icons only, 64px wide). Expands on hover/click to 240px showing labels. Items:
- Home (dashboard)
- Assessments (list)
- Templates
- Settings
- *Spacer*
- Help

That's it. 6 items max. **No assessment-specific nav lives here** — that lives inside the assessment.

**Content area**: where everything happens. Max 1280px width on large screens. Full-bleed on tablet/mobile.

### 6.2 Page templates (5 only)

1. **List/index** — table or grid + filter bar. Used for `/assessments`, `/templates`.
2. **Detail/shell** — header + tabs + content panel. Used for `/assessment/[id]/*`.
3. **Form** — single-column, max 720px wide. Used for profile, settings, new assessment.
4. **Wizard** — full-screen step-by-step. Used for `/assessments/new`.
5. **Empty/system** — full-screen messages. Used for 404, error, offline.

### 6.3 Drawer/modal/dialog conventions

- **Drawer** (right-side slide-in, 480–640px wide): for editing one entity (a scope item, a requirement). Closes via X, Escape, or outside-click.
- **Modal** (centered, 480–600px wide): for confirmation, destructive actions, important decisions. Locks the page behind a 50% black overlay.
- **Dialog** (small popover, ≤320px wide): for short confirmations ("Are you sure?"), non-destructive choices.
- **Toast** (top-right): for transient feedback after an action ("Saved", "3 requirements analyzed").

**Rule**: never stack drawers. If editing inside a drawer requires opening another drawer, redesign.

### 6.4 The status pill (used everywhere)

**Status pill** — 24px tall, rounded-full, `bg-{status}-50` + `text-{status}-700` + `border border-{status}-200`. Always shows current status + chevron-down if clickable for transitions.

Used in:
- Top of every assessment page (current status: "In Analyze" / "Ready to Export")
- Per-row in the scope list (granularity)
- Per-row in the requirements list (Mandatory / Non-Mandatory)
- Per-row in the gaps list (resolution type)
- Per-row in the report list (downloadable / locked)

**One single component, used everywhere.** Designer: spec it once, reuse forever.

---

## §7 — Interaction patterns (single paradigm wins)

### 7.1 Primary action conventions

- **Every screen has 0 or 1 primary action.** Filled brand-color button. Anchored top-right of the page header OR bottom-right of a form.
- **Secondary actions** are outlined buttons (border, transparent fill).
- **Tertiary actions** are text links (no border, no fill).
- **Destructive actions** use `status-danger` color — only on confirmation modals, never as primary.

### 7.2 Inline edit paradigm (the chosen one)

Aptus has 5 paradigms today. Pick **ONE**: **click-row-to-open-side-drawer**.

- Hover a row → row gets a subtle `surface-2` background + a chevron appears
- Click anywhere on the row → drawer opens on the right with a form
- All editable fields in the drawer
- Save button at the bottom OR auto-save on blur (designer's choice — be consistent)
- Escape or X closes the drawer (with "unsaved changes" prompt if dirty)

This applies to: scope items, requirements, gaps, integrations, data migration, OCM.

### 7.3 Cmd-K command palette

Triggered by `⌘K` (Mac) / `Ctrl+K` (Windows/Linux).

**Layout**: full-screen modal dim with a centered 600px card. Single search input. Below: contextual results grouped by type.

**Always-available commands**:
- `Go to assessment > [name]` — navigate
- `Open scope item > [name or ID]` — opens the scope drawer for that item
- `Search requirements > [text]` — search across all reqs in current assessment
- `Run AI Analysis` (if API key set)
- `Export report bundle`
- `Switch account` (if multi-tenant)
- `Settings`
- `Help / docs`

Power-user shortcut. Maya types `g a sc` → finds "Go to: assessment > Bursa Malaysia". Two taps.

### 7.4 Keyboard shortcuts (minimum set)

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘/` | Toggle help shortcuts overlay |
| `Esc` | Close drawer / modal / palette |
| `j` / `k` | Move down / up in lists (table rows) |
| `Enter` | Open selected row |
| `e` | Edit selected row (when one is highlighted) |
| `⌘S` / `Ctrl+S` | Save current form |
| `?` | Show shortcut help |

Linear-class table stakes. No custom training needed for power users.

### 7.5 Search behavior (consistency rule)

**Every list has ONE filter bar.** Pattern: input on left, dropdown filter chips beside, "Showing N" count at right. Always. No exceptions.

```
[🔍 Search...                    ] [All modules ▾] [All verdicts ▾]   Showing 142
```

### 7.6 Toast / notification system

- Toasts appear top-right
- Stack vertically (max 3 visible, oldest auto-dismisses after 4s)
- 4 variants: `default`, `success`, `warning`, `error`
- Each has icon + message + optional "Undo" button
- Animations: 150ms slide-in, 200ms slide-out

**Rule**: **after any save, show a toast.** Don't rely on visual cues alone.

---

## §8 — Surface specifications

### 8.1 Sign-in (`/login`)

**Purpose**: get Maya into the app.

**Layout**: single-column, centered. Logo at top (40px). One H1 ("Sign in to Aptus"). One email input. One primary button ("Send sign-in link"). Below, link "Sign in with passkey instead." Below that, link "Use Dev Login" (only visible if `DEV_LOGIN_SECRET` env set).

**No marketing column**. The 2-column layout in current design is dead weight. A login screen is a transit stop — get out of the way.

**States**:
- Default: just the form
- Sent: replace form with a confirmation card ("We sent a link to maya@abeam.com. Check your inbox.")
- Error: inline error below the input ("This email isn't authorized. Contact your administrator.")

### 8.2 Onboarding (`/onboarding`)

**Purpose**: first-run experience. Single flow. Maya sees this once.

**Layout**: full-screen, centered, max 480px. 3 steps:
1. **Welcome** — one sentence + their name + "Continue."
2. **Tell us about your work** — 2 questions: "What's your role?" (5 options) "How many SAP engagements per year?" (slider 1–20). Used for personalization, never blocks anything.
3. **You're ready** — "Create your first assessment" primary CTA + "Skip for now" tertiary.

That's it. **No 12 role-specific flows. No tooltips overlay. No tour.** A 30-second flow.

### 8.3 Home / Dashboard (`/`)

**Purpose**: where Maya lands after login. Shows what's active + a clear next action.

**Default layout** (after first assessment created):

```
┌──────────────────────────────────────────────────────────────┐
│  Welcome back, Maya                                          │
│                                                              │
│  ┌─ Active assessments ─────────────────────────────────┐    │
│  │  Bursa Malaysia Berhad    [In Adjust]      62% OOTB │    │
│  │  Last touched 2h ago                                 │    │
│  │                                          [Open →]    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Quick actions ──────────────────────────────────────┐    │
│  │  [+ New assessment]  [Browse templates]              │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Recent reports                                              │
│  • Bursa_Malaysia_Berhad_Bundle.zip (1.3 MB) · 2h ago [⬇]   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Three sections only: active assessments, quick actions, recent reports. **No widgets grid.** No "customize your dashboard." If Maya wants more views, she can add them via a settings preference — hidden by default.

**Empty state** (no assessments yet):

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              [Big triangle icon, 64px]                       │
│                                                              │
│           Welcome to Aptus, Maya.                            │
│                                                              │
│           Your first assessment takes ~5 minutes to set up.  │
│                                                              │
│              [+ Create your first assessment]                │
│                                                              │
│              Or [Browse templates] for a head start.         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 8.4 Assessments list (`/assessments`)

**Purpose**: Maya manages her portfolio.

**Layout**: standard list-template. Filter bar at top. Table below:

| Column | Width | Notes |
|---|---|---|
| Client | 25% | Bold |
| Status | 15% | Status pill (one of 3: Draft / Active / Archived) |
| Coverage | 15% | "62% OOTB / 17% Config / 21% Gap" mini stacked bar |
| Last touched | 15% | Relative time |
| Owner | 15% | Avatar + name |
| Actions | 15% | Open / Archive / Duplicate dropdown |

**Top-right**: `+ New assessment` button (primary).

**Status simplification**: collapse the 12 enum values to 3 visible states:
- `Draft` (status in: draft, scoping)
- `Active` (status in: in_progress through pending_validation)
- `Done` (status in: signed_off, handed_off, archived)

Keep the 12 internal values; just don't show them.

**Empty state**: same as dashboard empty state but without "Welcome" copy.

### 8.5 New assessment wizard (`/assessments/new`)

**Purpose**: get a new assessment into a usable state in <2 minutes.

**Layout**: full-screen wizard. 3 screens. Progress dots at top.

**Screen 1 — Basics**:
- Company name
- Country (dropdown, defaulted to user's country)
- Industry (dropdown)
- Edition (Public Cloud / Private Cloud / On-Prem — dropdown, defaulted to Public Cloud)
- Continue button

**Screen 2 — Starting point**:
Three big cards (radio-card pattern):
- 📄 "I have a requirements spreadsheet" (RFP / RFI / functional spec) → Upload
- 🔍 "We'll discover scope as we go" (consultant-led discovery) → Scope picker
- ✏️ "Use a template" (copy from a prior engagement)

**Screen 3 — Review & create**:
- Summary of choices
- "Create assessment" primary CTA
- Lands user inside the assessment shell (§8.6)

**Time target**: 90 seconds, no scrolling, no "advanced options."

### 8.6 Assessment shell (`/assessment/[id]/*`) — THE CANONICAL SURFACE

This is where Maya spends 95% of her time. Get this right and Aptus feels like a product.

#### 8.6.1 Shell layout

```
┌──────────────────────────────────────────────────────────────┐
│ Aptus  [⌘K Search]                              [Maya ▾]    │  ← global top bar
├──────────────────────────────────────────────────────────────┤
│  ←  Bursa Malaysia Berhad    [Status: In Adjust ▾]   [Export]│  ← assessment top bar
│     62% OOTB · 17% Config · 21% Gap                          │
├──────────────────────────────────────────────────────────────┤
│ ┌── Step rail ──┐  ┌─────────────────────────────────────┐  │
│ │ ◉ 1. Profile  │  │                                     │  │
│ │ ◉ 2. Scope    │  │       Active step content           │  │
│ │ ● 3. Analyze  │  │                                     │  │
│ │ ○ 4. Adjust   │  │                                     │  │
│ │ ○ 5. Export   │  │                                     │  │
│ └───────────────┘  └─────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Assessment top bar**: back arrow, client name, **status pill (always visible, click to view transitions)**, primary action button (changes per step — usually "Export" once unlocked).

**Step rail (left, 200px)**: 5 numbered steps. Visual states:
- ◉ filled = complete
- ● half = current
- ○ empty = not started
- 🔒 lock = blocked (with tooltip "Complete Profile to unlock")

Click any step to navigate. Steps unlock in order, but allow re-visit.

**Content area**: shows the active step's content. One step = one page = one job.

**No tabs.** No sub-tabs. No 27 routes per assessment. Just 5 steps.

#### 8.6.2 Step 1 — Profile

**Purpose**: capture engagement basics.

**Layout**: form template, single column, max 600px wide.

**Visible fields (5, top of form)**:
1. Company name
2. Industry
3. Country (primary)
4. Edition (Public Cloud / Private / On-Prem)
5. Target SAP release (defaults to 2602)

**Below**: collapsed "Show all 25 fields ▾" link.

When expanded: company size, employee count, annual revenue, currency, target go-live date, deployment model, sap modules, key processes, language requirements, regulatory frameworks, IT landscape summary, current ERP, current ERP version, migration approach, operational sites.

**Save**: auto-saved on blur of any field. "Saved 2s ago" indicator near "Show all."

**Completion meter**: top-right of the form: a quiet line "5 of 5 essential · 8 of 25 total." No gate, no block. Step 2 is always reachable.

#### 8.6.3 Step 2 — Scope

**Purpose**: pick or upload requirements / scope items.

**Layout**: two-pane.

**Left pane (320px wide)** — Source picker:
- "📄 Upload spreadsheet" (drag-drop zone)
- "🔍 Browse 2602 catalog" (clicks into the picker)
- "✏️ Build manually" (starts a blank list to add scope items one by one)
- Below: "Imported requirements: 778" (or "0 yet")

**Right pane** — Scope grid:
- Filter bar (search + functional area + status filter)
- List of scope items grouped by functional area
- Each row: [scope ID badge] [name] [step count] [granularity pill] [edit button]

**Click a row** → opens drawer (§7.2) with: granularity tier selector + verdict + notes + drill-down to per-step detail (only visible at Fine granularity).

**Critical**: this single surface replaces the current `/scope`, `/granularity`, `/review`, `/config`, `/process-map`, `/flows`, `/remaining`, `/gaps`, `/integrations`, `/data-migration`, `/ocm`. **All 11 routes collapse here.**

**Empty state**: just the source picker on the left, illustrated empty state on the right ("No scope yet. Pick a starting point on the left.").

#### 8.6.4 Step 3 — Analyze

**Purpose**: classify each requirement / scope item against the 2602 inventory.

**Layout**: top — a banner showing the analysis progress + "Run AI Analysis" button (if API key set) OR "Connect AI" link (if not). Below — the requirements/scope-items list (same data as step 2 but filtered to "needs analysis").

**Per-row**: [code] [requirement text snippet] [classification dropdown: O/C/G] [remarks textarea, expandable] [save indicator].

**Filter chips at top**: All / Pending / OOTB / Configuration / Gap.

**Bulk actions** (visible when ≥1 row selected): "Set classification to..." / "Apply to all in module..." / "Export selection."

This is also the surface Maya uses if she's running Claude Code outside Aptus — she can paste classifications back via a "Bulk paste" button. Format: CSV or JSON with `requirementId, classification, remarks`.

**Empty state**: "Nothing to analyze yet. Go back to Step 2 to bring in requirements."

#### 8.6.5 Step 4 — Adjust

**Purpose**: refine — override AI, add notes, drill into specifics, capture register entries (integrations / data migration / OCM).

**Layout**: same scope-items list as Step 2, but the focus is on per-item depth.

**Per-row**: same scope item card, but the drawer (when opened) has additional tabs:
- **Verdict** (granularity + assessment verdict + notes — same as Step 2)
- **Step-level** (the Fine drill-down)
- **Integrations** (related IntegrationPoint entries)
- **Data Migration** (related DataMigrationObject entries)
- **OCM** (related OcmImpact entries)
- **Gaps** (auto-listed from any GAP-classified items)

**Top of step**: a coverage chart updates live (62% OOTB / 17% Config / 21% Gap). Visual: stacked horizontal bar, click any segment to filter the list below.

#### 8.6.6 Step 5 — Export

**Purpose**: produce the deliverable.

**Layout**: single big card, centered.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│        Bursa Malaysia Berhad — Ready to export               │
│                                                              │
│        62% OOTB · 17% Config · 21% Gap                       │
│        778 requirements analyzed · 142 scope items           │
│                                                              │
│        ┌──────────────────────────────────────────┐          │
│        │  ⬇ Download report bundle (1.3 MB ZIP)   │          │
│        └──────────────────────────────────────────┘          │
│                                                              │
│        Includes 14 documents — Executive Summary, Gap        │
│        Register, Scope Catalog, and 11 supporting reports.   │
│                                                              │
│        Individual reports ⏵                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**One primary CTA.** The bundle download.

**Below the fold**: "Individual reports ⏵" expands to show the 14 individual files (the current `/report` grid). Default-collapsed.

**Below that**: "Share with client" — generates a read-only URL that lets a client SME (Aliya) view the assessment without an account. Token-based, expires in N days.

**Locked state** (status not yet ready): replace the big card with:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│        Reports unlock once the assessment is reviewed.       │
│                                                              │
│        Currently: In Analyze (step 3 of 5)                   │
│        Next: complete Step 4 — Adjust                        │
│                                                              │
│        [Continue to Adjust →]                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Always show the path forward.** No invisible gates.

### 8.7 Cmd-K palette (global)

**Trigger**: `⌘K` / `Ctrl+K` from anywhere.

**Layout**: 600×400 modal centered, 50% black overlay.

```
┌──────────────────────────────────────────┐
│ 🔍 Type a command or search...          │
├──────────────────────────────────────────┤
│ Recent                                    │
│   • Bursa Malaysia · Step 4              │
│   • J60 Accounts Payable                 │
│                                           │
│ Commands                                  │
│   ⌘N  New assessment                     │
│   ⌘E  Export current assessment          │
│   ⌘.  Toggle theme                       │
│                                           │
│ Navigate                                  │
│   Home                                    │
│   Templates                               │
│   Settings                                │
└──────────────────────────────────────────┘
```

Type-ahead search across: scope items, requirements, assessments, commands, navigation. Up/Down to highlight, Enter to execute, Escape to close.

### 8.8 User menu

**Trigger**: top-right avatar.

**Items**:
- Profile (settings)
- Notifications
- Theme: Light / Dark / Auto
- *Spacer*
- Help & docs
- Keyboard shortcuts (`?`)
- *Spacer*
- Sign out

That's it. **No org switcher, no admin flag, no role badge** — those go in `/settings` if needed.

### 8.9 Settings (`/settings`)

**Purpose**: account-level preferences, NOT per-assessment.

**Layout**: side rail (settings nav) + form area.

**Settings nav** (4 sections only):
- Profile (name, email, avatar)
- Notifications (toggles)
- Theme & display (light/dark, density, language)
- Account (subscription, sign-out, delete)

**Hidden by default but reachable**: Organization, Members, Roles, API keys (only if user has admin permissions).

### 8.10 Empty / Error / Loading states (system-wide)

**Empty state pattern**:

```
┌────────────────────────────────────────┐
│                                        │
│         [Lucide icon, 48px, muted]     │
│                                        │
│       <Title — 1 line, 18px>           │
│                                        │
│   <Description — 1–2 lines, 14px>      │
│                                        │
│       [Primary CTA button]             │
│                                        │
└────────────────────────────────────────┘
```

**Error state pattern**: same shape, red icon, "Something went wrong." + tech detail toggle + "Retry" CTA + "Contact support" link.

**Loading state pattern**: skeleton blocks matching the final layout. Fade-in animation 200ms. **Never spinners.** Spinners convey "we don't know how long" — in a B2B tool, that's anxiety-inducing.

### 8.11 Notifications / Toasts (already specified §7.6)

---

## §9 — Microcopy guidelines

### 9.1 Tone of voice

| Trait | Yes | No |
|---|---|---|
| Direct | "Save", "Continue", "Export bundle" | "Click here to save your changes" |
| Confident | "Reports ready in 14 documents." | "We've prepared some reports for you." |
| Plain | "Out of the box" | "Native to the standard SAP delivery configuration" |
| Honest | "You can't skip Profile yet — 3 fields remaining." | "Some prerequisites may be incomplete." |
| Warm but not chatty | "Welcome back, Maya." | "Hey Maya! 🎉 Glad to see you again!" |

### 9.2 Specific copy patterns

**Buttons**: imperative verbs. "Save", "Continue", "Export", "Open", "Run analysis", "Share". Never "Click to save."

**Empty states**: state the situation + offer the next action.
- ❌ "No data."
- ✅ "No scope items yet. Bring in a requirements spreadsheet to get started."

**Errors**: state what failed + what to do.
- ❌ "An error occurred."
- ✅ "We couldn't reach the inventory. Retry, or check your network."

**Confirmations**: state the action + consequence + escape.
- ❌ "Are you sure?"
- ✅ "Archive Bursa Malaysia? It'll move to Archived. You can restore it anytime from there."

**Status pills**:
- "Draft" / "Active" / "Done" (assessment-level)
- "Coarse" / "Medium" / "Fine" (granularity)
- "OOTB" / "Configuration" / "Gap" (classification)
- "Mandatory" / "Optional" (requirement type)

Never abbreviated to single letters. Never "OOTB" without context.

---

## §10 — Responsive behavior

### 10.1 Breakpoints

| Name | Width | Behavior |
|---|---|---|
| Mobile | < 640px | Single column, side rail collapses to bottom nav |
| Tablet | 640–1024px | Side rail icons-only, content full-width |
| Desktop | 1024–1440px | Side rail expandable on hover, content max 1280px |
| Wide | > 1440px | Same as desktop, content stays 1280px centered |

### 10.2 Mobile considerations (acceptance: "view + light edit")

- Maya rarely uses mobile for full work
- Aliya (client SME) might view share-link on mobile
- David (PM) checks status on mobile

**Mobile is read-first.** Edits possible but less ergonomic. The drawer becomes a full-screen sheet on mobile.

**Tables → cards on mobile.** Horizontal scrolling on a complex table is bad UX. Convert each row to a stacked card.

### 10.3 What we don't ship on mobile (v1)

- Cmd-K (no keyboard)
- Bulk operations
- Drag-drop file upload
- Step Review fine-grained classifier (too dense)

These get a "Open on desktop for full editing" prompt.

---

## §11 — Accessibility

### 11.1 Contrast

WCAG AA minimum throughout:
- Text on background: 4.5:1
- Large text (>18px): 3:1
- Active state borders / focus rings: 3:1

Test palette in light + dark.

### 11.2 Keyboard navigation

Every interactive element reachable via Tab. Focus ring visible — 2px solid `brand` color, 4px offset. Skip-to-content link at top of every page.

Drawer: Escape closes. Tab cycles within the drawer (focus trap).

### 11.3 Screen reader

- All icons have aria-labels
- Status pills announce status: "Status: In Analyze, click to view transitions"
- Form inputs have associated labels (no placeholder-only)
- Toasts use `role="status"` for non-critical, `role="alert"` for errors

### 11.4 Motion preferences

Respect `prefers-reduced-motion`. Disable all non-essential motion (drawer slides become fades; toast slides become fades).

---

## §12 — Implementation notes

### 12.1 Tech stack designer should know

- Next.js 15 App Router (server components by default, client only when needed)
- Tailwind v4 + shadcn/ui as the base component layer
- Lucide React icons
- Geist Sans + Geist Mono fonts
- Prisma + Postgres backend (Neon)
- Vercel deployment

### 12.2 Existing components to lean on

These already exist in `src/components/` and should be evolved, not replaced:

- `EmptyState` (from `src/components/shared/EmptyState.tsx`)
- `PageHeader` (`src/components/layout/PageHeader.tsx`)
- `ABeamLogo` (yes, name kept; renders the Aptus mark — `src/components/shared/ABeamLogo.tsx`)
- shadcn/ui primitives: Button, Input, Select, Dialog, Sheet (for drawer), DropdownMenu, Popover, Tooltip, Toast (sonner)

### 12.3 Components to BUILD fresh

- `<StatusPill>` — single component, drives all status display (assessment, granularity, classification, requirement type)
- `<StepRail>` — the 5-step assessment nav
- `<CommandPalette>` — cmd-K
- `<ScopeItemCard>` — the canonical per-item row (currently 5 different ones)
- `<CoverageBar>` — stacked horizontal bar showing OOTB/Config/Gap %
- `<ShareLinkDialog>` — for read-only client share links

### 12.4 Components to RETIRE

These exist in code but should not appear in the redesigned UI:

- `WorkshopSession`, `WorkshopVote`, `WorkshopAttendee`, `WorkshopMinutes` UIs
- `SignOffProcess` multi-stage validator UI
- `ChangeRequest`, `ReassessmentTrigger` UIs
- `ConfigMatrixClient` (collapses into scope drawer)
- `ProcessFlowDiagram` viewer (collapses into scope drawer)
- The 12 role-specific onboarding screens
- The `OnboardingTooltip` system

Keep the Prisma models (no DB migration churn). Just don't render the UI.

### 12.5 Performance targets

- Initial page load: < 2.5s on 4G
- Scope list with 142 items: < 100ms render after data
- Cmd-K open: < 50ms
- Drawer open: 240ms (bound by motion spec)
- Drawer save: < 300ms server roundtrip

If a list approaches 1000+ rows, virtualize.

---

## §13 — Visual reference (described, since this doc has no images)

### 13.1 What an Apple-class scope item row looks like

```
┌────────────────────────────────────────────────────────────────────┐
│  J60   Accounts Payable                          [Coarse]  [→]    │
│        Finance · 741 steps · last reviewed 3 days ago              │
└────────────────────────────────────────────────────────────────────┘
```

- 56px row height
- Mono ID badge on the left (12px Geist Mono)
- Bold name (14px) + muted meta line (12px)
- Status pill on the right
- Subtle chevron suggesting click-to-open
- Hover: full row gets `surface-2` background
- 16px horizontal padding
- 1px bottom border in `border` color

### 13.2 What an Apple-class header looks like

```
┌────────────────────────────────────────────────────────────────────┐
│  ←  Bursa Malaysia Berhad        [In Analyze ▾]      [Export ⬇]   │
│     Last touched 2h ago                                            │
└────────────────────────────────────────────────────────────────────┘
```

- 64px tall
- Back chevron + client name (display size)
- Status pill (clickable for transitions)
- Primary action right-aligned
- Subtle "last touched" line below in muted text

### 13.3 What an Apple-class drawer looks like

```
┌─────────────────────────────────────────────────┐
│  Edit J60 Accounts Payable                  ✕  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Granularity                                    │
│  ◉ Coarse                                       │
│  ○ Medium                                       │
│  ○ Fine                                         │
│                                                 │
│  Verdict                                        │
│  [Mostly FIT ▾]                                 │
│                                                 │
│  Notes                                          │
│  ┌─────────────────────────────────────────┐    │
│  │ Bursa AP processes are well-covered by  │    │
│  │ J60 + 2EJ. Vendor portal needs Ariba    │    │
│  │ SLP — flagged as Gap.                   │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  [Drill into 741 steps ⏵]                      │
│                                                 │
├─────────────────────────────────────────────────┤
│                          [Cancel] [Save]        │
└─────────────────────────────────────────────────┘
```

- 480px wide on desktop, full-screen on mobile
- 24px padding
- Header with title + close button
- Sections separated by 24px vertical gap
- Footer with Cancel (secondary) + Save (primary)

---

## §14 — Appendix

### 14.1 Glossary

| Term | Plain definition |
|---|---|
| **2602** | The current SAP S/4HANA Cloud Public Edition release (Feb 2026 GA). Aptus's source of truth for "what's standard." |
| **Scope item** | A unit of SAP capability (e.g., J60 Accounts Payable). The 2602 catalog has 582 of them. |
| **Process step** | A specific user action within a scope item. There are ~96k across all 582 scope items. |
| **Granularity** | How deeply a consultant has reviewed a scope item: Coarse (auto-FIT) / Medium (verdict + notes) / Fine (per-step). |
| **Verdict** | The consultant's judgment on a scope item: Mostly FIT / Mostly Configuration / Has Gaps / Needs Workshop. |
| **OOTB** | "Out of the box" — covered by 2602 baseline, no customization. |
| **Configuration** | Covered by 2602 baseline but requires SSCUI / Key User Extensibility / Output Mgmt / Workflow setup. |
| **Gap** | Requires a separate SAP product (SuccessFactors, Ariba, SAC) or a 3rd-party tool. |
| **FIT-to-Standard** | The methodology of comparing client requirements to SAP standard, identifying deltas. Aptus's product category. |

### 14.2 Personas — extended

(See §2 — three personas, prioritized as Maya > David > Aliya. All design decisions in this document optimize for Maya unless explicitly noted.)

### 14.3 The 5-step flow — extended

```
1. Define              ┐
                       │  These three are
2. Bring requirements  │  Maya's setup work.
                       │  Target: 90 sec.
3. Analyze             ┘
                       
4. Adjust              ← The bulk of the work. Hours to days.

5. Export              ← The deliverable moment.
```

Steps 1–3 are sequential. Step 4 unlocks once Step 3 has any classifications. Step 5 unlocks once Step 4 reaches some completion threshold (configurable, default 80%).

---

## §15 — What this document is NOT

- It is not a Figma file. A senior designer should produce one from this spec.
- It is not a code spec. Engineering can use it for component contracts, but routing/data layer details are in `src/`.
- It is not a marketing brief.
- It is not a complete brand identity. Logo + palette + typography only.
- It is not exhaustive — settings, admin, billing, and edge flows are out of scope here. They follow the same principles.

---

## §16 — Acceptance criteria for the redesign

The redesign is **done** when:

- [ ] The simplified app shell ships (top bar + 6-item side rail).
- [ ] Every assessment lives in the 5-step shell. The 27 sub-routes are gone from default UI.
- [ ] One canonical edit paradigm is in use (click-row → drawer).
- [ ] Status pill is visible on every assessment page.
- [ ] Cmd-K palette ships and indexes scope items + assessments + commands.
- [ ] Empty / loading / error states cover 100% of pages.
- [ ] Onboarding is a single 30-second flow.
- [ ] Reports collapses to one primary CTA + advanced expansion.
- [ ] No tab nav exceeds 6 items.
- [ ] No client component exceeds 400 lines.
- [ ] All status string-fields normalized to ≤5 user-visible labels.
- [ ] Mobile: tables convert to cards, drawer becomes sheet, primary actions reachable.

When all 12 are checked: **Aptus is shippable to a Big-4 client engagement with credibility.**

---

## §17 — Out of scope for v1.0 redesign

Will be addressed in later versions:

- Client share-link branded portal (Aliya's experience deeper)
- Real-time collaboration
- Offline / PWA
- Mobile native app
- Internationalization (English-only for v1)
- White-labeling for partner firms
- Custom report templates (only the 14 default reports for v1)
- AI co-pilot inside the drawer (suggesting verdicts as you type)

---

*End of Aptus Product Design Specification v1.0.*

*Open issues, questions, or change requests against this document should be filed
in the design backlog. Material changes require a version bump (v1.1, v2.0).*
