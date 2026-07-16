# MASTER PROMPT — Claude Design · ABeam Workbench: **Consultant Internal Workbench** surface

Paste everything below the line into the Claude design tool. This is the **second half** of the Neutral Process Discovery design — the internal, consultant-only surface that sits behind the client experience specified in `DESIGN-BRIEF-Neutral-Process-Discovery.md`. Read that brief first: this one **inherits its entire token system, type ramp, motion, and component DNA** and only specifies what is different for the consultant. Where the two briefs agree, reuse the component. Where they differ, this brief wins for the consultant surface.

The two surfaces are one product: the client sees the calm discovery journey; the consultant runs, curates, maps, and facilitates it from here.

---

You are designing the **Consultant Internal Workbench** for **ABeam Workbench** — the back-office surface where an ABeam consultant **curates the neutral process library, governs its completeness and coverage, maps it privately to products, sets up and facilitates client sessions, and turns client decisions into hand-off outputs.** It is never seen by the client. Design INSIDE the existing ABeam Workbench design system; the client surface is calm executive reading — **this surface is the opposite: an efficient, dense professional tool.** Same tokens, different density. Every element resolves to a token or component from the client brief or defined here. Nothing stray.

## 0 · DELIVERABLE

Design, in this order:

1. **Foundation delta sheet** — reuse the client brief's token/type/component sheet; add ONLY the new dense-UI components introduced here (data grid, editor forms, flow editor, coverage matrix, mapping matrix, facilitation console), each labelled with token references. State the **density contract** (§4) — how this surface is denser than the client surface while staying on-brand.
2. **All 10 consultant views in §7**, desktop **1440px** and **1024px** (consultants work on laptops; no mobile requirement — note "desktop tool" explicitly). Include every state (default, empty, editing, saving/saved, validation-error, loading skeleton, permission-locked).
3. **The client↔consultant seam (§8)** drawn explicitly: the split-screen Present mode (consultant driver + projected client view), and the flow of a client decision back into the consultant's review.
4. **Annotation pass**: each view labelled with token/component refs, new-component justifications, and a **trust marker** confirming what on the view is consultant-only vs shared.

Use realistic data: consultant **"Ikmal (ABeam MY)"**, client **"Asia Meals Group"**, library metrics (654 processes, 638 flows, 332 detailed, APQC 7-of-13 gaps), processes like "Requisition to Pay (18J)", product-map rows SAP ✓ / Oracle ○ / NetSuite ○.

## 1 · WHAT THIS SURFACE IS — and its relationship to the client surface

The client surface (that brief) is **read-mostly and calm**: an executive walks 8 value streams, sees flows, and records fit/scope. This surface is **write-heavy and dense**: the consultant is the author, governor, mapper, and facilitator behind it.

Four consultant jobs, four zones:

| Job | Zone | What the consultant does |
|---|---|---|
| **Curate** | Library manager + Process/Flow editor | Maintain the 654 neutral processes: names, descriptions, flows, sub-steps, roles, provenance/completeness (P1). Add client-captured processes (P4). |
| **Govern** | Coverage & Gaps (APQC) + Overlay manager | Watch APQC coverage, work the gap register, run overlays (P3): industry frameworks, other-vendor libs, ABeam IP. |
| **Map** | Product-mapping matrix (Rosetta) | Privately bind each neutral process to SAP / Oracle / NetSuite building blocks. **Consultant-only — never client-facing.** |
| **Run** | Session setup + Facilitation console + Decisions/outputs | Configure a client engagement, drive Present mode live, review the client's decisions, export the hand-off. |

**The density inversion (design tension to resolve deliberately):** the client brief's principle 10 says "calm, paper-like, not a dashboard." **Here, it IS a dashboard/tool** — tables, inline edit, keyboard efficiency, multi-pane. Same palette, same warmth, but information-dense. Do not carry the client surface's generous whitespace here; carry its *tokens and calm colour discipline* instead.

## 2 · BRAND FOUNDATION — inherit, plus dense-UI notes

Use the **exact token system from the client brief §2** (brand-navy `#002B5C`, cta-red `#C8102E`, cream `#FAF9F5`, paper `#FFFFFE`, ink-tint `#F4F2EB`, decision teal/blue/amber/gray, status pills, borders, shadows, motion, radii). No new colours. Dense-UI usages:

- **Data grids** use `--surface-ink-tint` for the header row and zebra rows; `--border-default` hairlines; row hover `--brand-navy-soft` at low weight. No new greys.
- **The siderail** (this surface has one — the client surface does not): deep `--brand-navy` rail, white stroke icons, **3px `--cta-red` active indicator** (per the Workbench Design-Restoration brief §1). This is the workbench chrome.
- **Editable fields** follow the financial-model input convention adapted: an editable cell/field carries a subtle `--brand-navy-soft` fill on focus + navy border; read-only source-of-truth fields stay paper. A **"consultant-only" element** (product-mapping) carries a persistent `--surface-banner-warn` hairline + guard label.
- Decision colours keep their meaning (fit states in the decisions review); completeness uses teal/navy/gray (detailed+variants / detailed / outline) as already shipped in the Excel and explorer.

## 3 · TYPOGRAPHY — inherit + data-grid scale

Reuse the client ramp (Source Serif 4 display, Geist Sans UI, Geist Mono metadata/IDs). Additions for density:

| Role | Spec |
|---|---|
| Grid header | mono 10, 700, uppercase, tracking .06em, `--ink-muted` |
| Grid cell | sans 12/16, `--ink-secondary` |
| Grid primary cell (process name) | sans 12.5, 600, `--ink-primary` |
| Editor field label | sans 11, 600, `--ink-muted`, uppercase |
| Editor field value | sans 13/19, `--ink-primary` |
| Panel/section title | serif 16, 500, `--brand-navy` (one serif moment per pane, not per view — density allows more than the client surface's "one per screen", but keep restraint) |

## 4 · DESIGN PRINCIPLES (consultant-specific)

1. **Efficiency over calm.** This is a tool used daily. Dense grids, inline edit, bulk actions, keyboard shortcuts, multi-select. Whitespace serves scanning, not reading.
2. **Provenance-first.** Every process shows where it came from, how complete it is, and when it was last touched. Nothing is edited blind. Source and completeness are always one glance away.
3. **Trust separation is visible and absolute.** Every element is unmistakably either *shared with the client* or *consultant-only*. The product-mapping is fenced (guard label + banner-warn hairline) and can never leak into a client surface. A persistent header chip states the current context ("Editing library" / "Live session — projecting to client").
4. **Governed, not freeform.** Coverage and gaps are managed against APQC; overlays are provenance-tagged and dedupe-checked; edits are audited. The consultant curates a system of record, not a scratchpad.
5. **One system, two densities.** Same tokens and warmth as the client surface; opposite information density. The consultant should feel they're behind the same product, not in a different app.
6. **Facilitate without friction.** In a live client session the console is glanceable and keyboard-driven; the consultant never fights the tool in front of a client (mirror of the client brief's Present-mode discipline, from the driver's side).

## 5 · INFORMATION ARCHITECTURE + siderail

Workbench chrome: **navy siderail** (64px, white stroke icons, 3px cta-red active bar, wordmark glyph top) + top bar (paper, 56px: breadcrumb left, **context chip** center — "Library" or "Session: {Client}", global search, consultant avatar right). Siderail sections:

```
◇ Home            C1  workbench dashboard — library health + engagements
▤ Library         C2  the 654-process catalogue (data grid)  → C3 process/flow editor
◔ Coverage        C4  APQC coverage & gap register (governance)
⧉ Sources         C5  overlay / source manager (P3 · P4 intake)
⇄ Product map     C6  the Rosetta matrix (CONSULTANT-ONLY, fenced)
▶ Sessions        C7  engagement setup + reviewer grants  → C8 facilitation console
⇩ Outputs         C9  decisions review + export/hand-off
⚙ Library health  C10 provenance audit + completeness governance
```

Content area max-w fluid (grids use full width); editor/detail panes open as a right-side drawer (640px) or full page for deep edits.

## 6 · COMPONENT VOCABULARY

### 6A — INHERIT (from the client brief + workbench)
Wordmark · scope chip · status pills · buttons (primary cta-red, secondary paper, danger-confirm modal) · fit bars & stat tiles · stacked progress bar · the **flow diagram (role-laned)** (component 19) — reused read-only in review and editable in C3 · choice chips · attribution/provenance line · skeletons. The **completeness badge** (Outline / Detailed / Detailed+variants) and **APQC coverage map** already exist as shipped artifacts — render them faithfully.

### 6B — NEW consultant components (token-only)
1. **Library data grid.** The curation workhorse: sortable/filterable rows — checkbox · scope chip · process name · value stream · workflow · APQC code · tier badge · industry · completeness badge · #steps · flow ✓/– · last-edited (dual-line relative+absolute per the restoration brief §2.7). Sticky header (mono grid-header), zebra `--surface-ink-tint`, row hover navy-soft, inline row actions (edit · map · history) on hover. Toolbar: search, facet filters (stream/workflow/APQC/completeness/tier/industry/has-flow), bulk-select action bar, "Add process" (P4). Column-config. Empty/filtered-empty states.
2. **Process editor (drawer/page).** Form: neutral name, best-practice description, tier, industry, **APQC category** (select), value stream/workflow placement. Right column: **provenance panel** (component 4). Read-only source fields visibly distinct from editable. Save = autosave tick + explicit "Save changes"; validation-error state; "unsaved changes" guard.
3. **Flow editor.** The role-laned flow made editable: reorder main steps (drag handle), edit step text/role (role from a **role palette** chip-picker), toggle optional, expand a step to **edit its sub-steps** (add/edit/reorder/mark-optional), and a live preview of the swimlane. "Roles indicative" reminder. States: editing, reordering, added-from-client-capture (a step tagged `client` in a distinct chip).
4. **Provenance panel.** Source (SAP Best Practices 2602 / APQC / industry / ABeam IP / **client-captured**), confidence, completeness label, activities-available count, last-refreshed + release, edit history link. Editable only where the consultant authored content; source-of-truth rows locked.
5. **APQC coverage matrix (interactive).** The shipped coverage map made interactive: 13 category rows, count bars, coverage badge (Strong/Partial/Thin/Minimal/None); click a category → drawer with its processes + the **gap detail** (what's missing) + **fill-source assignment** (pick a P3 source) + fill-progress. The governance cockpit.
6. **Gap register list.** The 7 gap categories as work items: category · coverage · what's missing · assigned fill-source · owner · status (open / sourcing / drafting / filled) · target. This is the P3 backlog, designed as a tracker.
7. **Overlay import wizard (P3/P4).** Stepper: (1) choose source → (2) map incoming items to value stream/workflow/APQC → (3) dedupe & conflict resolution (side-by-side existing vs incoming, keep/merge/skip) → (4) provenance-tag → (5) commit. Honest counts at each step. Client-capture (P4) is a lightweight variant of this: promote a session's "we differ" note into a new/edited process.
8. **Product-mapping matrix (Rosetta) — CONSULTANT-ONLY, fenced.** A grid: rows = processes (or one process detail), columns = **SAP ✓ (scope id) · Oracle ○ · NetSuite ○ · other**; each cell = a fit glyph + building-block reference or an empty "map" slot, editable. Persistent guard: `--surface-banner-warn` top hairline + "CONSULTANT ONLY — never shared with the client" label + a lock glyph. Bulk "mark mapped", coverage meter per product. This component must be visually impossible to mistake for a client surface.
9. **Facilitation console (Present driver).** The consultant's live control panel (paired with the projected client Present view, §8): current stream/process/flow thumbnail, **live fit tally**, **park list**, jump-to search, prev/next, a **notes capture** field (private), and step counter. `--shadow-pop`, high-legibility, fully keyboard-mirrored. A prominent **context banner**: "LIVE — projecting to {Client}" so the consultant always knows the client can see the paired screen.
10. **Engagement setup form + reviewer grants table.** Reuse the Affirm S9 pattern: client + engagement fields, value-stream multi-select (which streams are in play), reviewer rows (name/role/email + stream scope chips + status pill invited/verified/in-progress/submitted), "Send invite", export toggles. A **launch** action opens the client session.
11. **Library-health tiles.** Dashboard stats: total processes, % with flows, completeness distribution (mini stacked bar), APQC gap count, source breakdown, staleness (release 2602 · age), open gap-register items. Each tile links to its governance view.
12. **Context chip (top bar).** A persistent pill stating the current mode/scope: "Library" (navy-soft) or "Live session — {Client}" (cta-red-tinted when projecting). The consultant's constant orientation + trust cue.

## 7 · THE CONSULTANT VIEWS (all states)

**C1 · Workbench home** — greeting + **library-health tiles** (11) + an **engagements** table (client · streams · reviewers · status · last activity · open) + quick actions ("Curate library", "New session", "Work the gaps"). States: populated; first-run empty ("Import the base library" CTA); skeleton.

**C2 · Library manager** — the **data grid** (1) over 654 processes with facet filters and bulk actions. Default sort by value stream → workflow. States: default; filtered; filtered-empty; bulk-selected (action bar: set APQC · set tier · export · map · delete-captured); "Add process" open; skeleton.

**C3 · Process / flow editor** — opened from a grid row. Left: **process editor** (2) + **flow editor** (3); right: **provenance panel** (4) + a collapsed **product-map** shortcut (8, fenced). States: viewing; editing; reordering flow; editing sub-steps; client-captured content tagged; validation error; saving → saved; unsaved-changes guard on exit.

**C4 · Coverage & gaps** — the **APQC coverage matrix** (5) + the **gap register** (6). The governance cockpit: see where the library is thin, open a gap, assign a fill-source, track progress. States: overview; category drawer open (with process list + gap detail + fill assignment); gap item in each status; all-strong celebratory (aspirational, likely never — honest).

**C5 · Sources / overlay manager** — list of content sources with counts and last-import; the **overlay import wizard** (7) for P3; the **client-capture intake** (P4 variant). States: source list; wizard steps 1–5; dedupe/conflict resolution; commit summary; empty.

**C6 · Product map (Rosetta)** — the **product-mapping matrix** (8), fenced, consultant-only. Views: all-processes coverage (per-product % mapped) and single-process detail. States: unmapped; SAP-mapped/Oracle-empty; fully mapped; bulk-mark; the ever-present guard treatment. **Must never be reachable from a client session.**

**C7 · Session setup** — the **engagement setup form + grants table** (10). Configure client, streams, reviewers, mode, exports; **Launch session**. States: new; configured; invites sent (grants statuses); session live (link to C8); closed.

**C8 · Facilitation console** — the **facilitation console** (9), the driver side of Present mode. States: pre-start; live (tally moving as the room decides); step-drill open; parked-item added; session paused; ended → jump to C9. Always shows the "LIVE — projecting" banner.

**C9 · Decisions & outputs** — the client's rolled-up fit/scope decisions (reuse the client **summary buckets** + stat strip), the "we differ" reasons, flagged gaps, and **export/hand-off**: the client scope pack (neutral) + the **internal solutioning pack** (adds the consultant-only product-map). Two clearly separated exports: "Client pack (neutral)" vs "Internal pack (with product map)". States: in-progress (session live); final; exported; promote-to-library action (send a "we differ" into C5/P4).

**C10 · Library health / audit** — provenance & completeness governance: completeness distribution, source breakdown, staleness vs release, edit audit trail, refresh/version tools. States: healthy; stale-release warning; audit list.

## 8 · THE CLIENT ↔ CONSULTANT SEAM (draw this explicitly)

- **Launch:** C7 "Launch session" creates the client session (client surface V1–V9) scoped to the chosen streams; reviewers get grants (Affirm-style).
- **Present split:** in a facilitated workshop, the **consultant drives C8** (private console — tally, park, notes, jump) while the **client sees the projected client Present view** (client brief V5). Design the pair side-by-side; the console's "LIVE — projecting" banner mirrors exactly what the room sees. The consultant screen shows control + notes the client never sees; the projected screen shows only the calm client view.
- **Decision flow-back:** a client fit/scope decision (client V3 selector) lands in C9 in real time; a "we differ" reason becomes a candidate for C5/P4 promotion.
- **The wall:** the product-map (C6) and the internal pack (C9) sit on the consultant side of a hard wall — draw the boundary. No client view ever renders a product name (client brief constraint 6).

## 9 · TRUST & SAFETY (the consultant-only wall)

1. Persistent **context chip** (12) tells the consultant whether the current surface is internal-only or paired with a client projection.
2. Product-mapping (C6) and any product name: fenced with guard label + banner-warn hairline + lock; never present on any client-facing view or export-labelled-client.
3. Two-lane export in C9: "Client pack (neutral)" and "Internal pack (with product map)" — never one toggle that could ship the wrong thing; distinct buttons, distinct confirm copy.
4. Notes in C8 are private by construction; the console never mirrors them to the projection.

## 10 · VOICE & COPY

Consultant-facing: precise, tool-like, verb-first, no marketing tone. Field labels are nouns; actions are verbs. Provenance and completeness are stated plainly ("Outline · happy-path only · Source: SAP BP 2602"). Guard copy is unambiguous: "Consultant only — never shared with the client." Session banner: "LIVE — projecting to Asia Meals Group." Honest counts everywhere; no invented completeness.

## 11 · ACCESSIBILITY & EFFICIENCY

- Full keyboard operability: grid navigation (arrows, space to select, ⏎ to open), editor save (⌘S), console prev/next (←/→), search focus (/). Visible focus = `--shadow-focus-ring` + navy border.
- Contrast ≥4.5:1; grids readable at density; no color-only meaning (completeness + coverage carry labels).
- This is a **desktop tool** — state that; 1440 primary, 1024 supported; no mobile requirement (unlike the client surface). Touch not required.
- `aria-live` on autosave/import progress; data grids are real tables with headers; drawers trap focus.

## 12 · HARD CONSTRAINTS — "nothing stray"

1. Tokens only (client brief §2); no new colours, no Tailwind defaults, no pure-white page (cream), no legacy hexes.
2. Fonts only: Source Serif 4 / Geist Sans / Geist Mono.
3. Four radii; listed shadows; 4px grid (density may use 8/12/16 rhythm, never off-grid).
4. Icons: hand-drawn inline-stroke, currentColor, no icon-library glyphs, no emoji.
5. One CTA colour (`--cta-red`) for primary actions; decision colours for fit/coverage/completeness semantics only; navy is structure (rail, headers) — not a button fill.
6. **Consultant-only wall is absolute**: product-mapping and internal packs never appear on, or are reachable from, any client surface. Every view annotated shared vs consultant-only.
7. Light mode only.
8. Every state in §7 exists — empty, editing, saving, error, permission-locked, live, skeleton are first-class.
9. **Density belongs here** (this is the tool), but stays on-brand — same tokens/warmth as the client surface; the two must feel like one product at two densities.
10. Provenance and completeness are visible on every process, everywhere the consultant touches one.
11. Annotate every view: token/component refs, new-component justifications, and the shared-vs-consultant-only trust marker.

---

### Appendix A — Consultant view wireframes (structure only; design to the tokens)

**C2 · Library manager (1440)**
```
┌──┬──────────────────────────────────────────────────────────────────────────────┐
│◇ │ Library ▸ 654 processes            [ Library ]        ⌕ search        (IB) ▾   │
│▤ ├──────────────────────────────────────────────────────────────────────────────┤
│◔ │ ⌕ filter   [Stream▾][Workflow▾][APQC▾][Completeness▾][Tier▾][✓has-flow]  +Add │
│⧉ │ ┌─┬─────┬───────────────────────┬───────────┬────┬──────┬──────────┬─────┬───┐ │
│⇄ │ │☐│18J  │ Requisition to Pay    │Source-Pay │4.0 │Core  │Detailed  │ 24  │✓  │ │
│▶ │ │☐│BD9  │ Sell from Stock       │Lead-Cash  │3.0 │Core  │Outline   │ 6   │✓  │ │
│⇩ │ │☐│J45  │ Direct Procurement    │Source-Pay │4.0 │Core  │Detailed+ │ 41  │✓  │ │
│⚙ │ └─┴─────┴───────────────────────┴───────────┴────┴──────┴──────────┴─────┴───┘ │
│  │ 3 selected → [Set APQC] [Set tier] [Map product] [Export] [Delete captured]   │
└──┴──────────────────────────────────────────────────────────────────────────────┘
```

**C3 · Process / flow editor (drawer)**
```
│ 18J · Requisition to Pay                              ⟲ history   ✕            │
│ Name [ Requisition to Pay ]   Stream [Source-to-Pay▾] Workflow [Invoice Mgmt▾]│
│ APQC [4.0 Supply Chain▾]  Tier [Core▾]  Industry [Cross-industry▾]            │  ┌ PROVENANCE ┐
│ Description [ Raise a request, approve, order, receive, pay … ]               │  │ Src: SAP BP │
│ ── FLOW (drag to reorder · click a step to edit sub-steps) ──────────────────│  │ 2602        │
│ ⣿ ①Create PR  ⣿ ②Approve PR  ⣿ ③Convert PO  … [＋ step]                       │  │ Detailed    │
│      └ sub: Create PR w/ Cost Center · Create PR w/ Unknown Product (opt)     │  │ 24 of 66    │
│ roles indicative ·  [＋ from client capture]                                  │  │ edited 2d   │
│ ▸ Product map (SAP ✓ · Oracle ○ · NetSuite ○)   ⚠ consultant only            │  └────────────┘
│                                                   [Cancel]  [Save changes ✓] │
```

**C8 · Facilitation console (driver) ‖ projected client view (§8)**
```
 CONSULTANT (private)                           │  CLIENT (projected — brief V5)
 ┌───────────────────────────────────────────┐ │  ┌──────────────────────────────┐
 │ ● LIVE — projecting to Asia Meals Group    │ │  │ ASIA MEALS · SOURCE-TO-PAY   │
 │ Now: Requisition to Pay        step 3/9    │ │  │  Requisition to Pay          │
 │ tally ▭▭▭ 12 std · 3 differ · 1 discuss    │ │  │  [ large role-laned flow ]   │
 │ park: [Customer Returns] [+]               │ │  │  ① ② ③ …                     │
 │ notes: “stage-billing on milestones” ____  │ │  │  Fit? standard·differ·disc.  │
 │ ◀ Prev   Next ▶    ⌕ jump-to               │ │  └──────────────────────────────┘
 └───────────────────────────────────────────┘ │
```

### Appendix B — Build sequence for ClaudeDesign
Foundation delta → **C2 Library manager** (the workhorse; proves the dense grid) → **C3 Process/flow editor** (proves editing + provenance) → **C4 Coverage & gaps** (proves the APQC governance) → **C6 Product map** (proves the fenced consultant-only treatment) → **C7+C8 session/facilitation + the §8 seam** (proves the client pairing) → C1/C5/C9/C10 → annotation + trust-marker audit.

*Pairs with `DESIGN-BRIEF-Neutral-Process-Discovery.md` (client surface). Data source of truth: `vendor-neutral-process-library.json` (654 processes · enriched flows · provenance/completeness · APQC tags). Shipped reference artifacts to render faithfully: `process-flow-explorer.html`, `flow-diagrams/` swimlanes, `apqc-coverage-map.svg`, the Excel's Process Library + APQC Coverage tabs.*
