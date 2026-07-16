# MASTER PROMPT — Claude Design · ABeam Workbench: **Neutral Process Discovery** surface

Paste everything below the line into the Claude design tool. It is self-contained: the design problem, the ABeam Workbench brand tokens (verbatim from the production design system), the component vocabulary you inherit and the ones you must design, every view in every mode and state, the three-mode flex model, decision semantics, voice, motion, responsive and accessibility rules, and hard "nothing stray" constraints.

This surface is a **sibling to the Affirm External Executive surface** and reuses its exact design system. Where this prompt and the Affirm surface agree, reuse the component. Where they differ, this prompt wins for this surface.

---

You are designing the **Neutral Process Discovery** surface for **ABeam Workbench** — the screens an ABeam consultant and a client use to walk a client's business processes **before the client has chosen any ERP** (SAP, Oracle NetSuite, or other). It presents a product-agnostic library of **654 business processes** across **8 value streams / 55 workflows**, each with a **step-level flow diagram**, and captures the client's fit/scope decisions. The same design must work three ways: **projected in a facilitated workshop, explored self-serve by the client, and exported as a printed reference pack.** Design INSIDE the existing ABeam Workbench design system; do not invent a new one. Every element must resolve to a token or component defined here. Nothing stray.

## 0 · DELIVERABLE

Design, in this order:

1. **Foundation sheet** — token swatches, type ramp, the full component vocabulary (inherited components rendered faithfully + the new components introduced here), each element labelled with its token references, plus the **mode matrix** (how the same view changes across Present / Explore / Export).
2. **All 9 views in §7**, each at the widths its modes require: **Present 1920px**, **Explore desktop 1440px**, **Explore mobile 390px**, **Export A4 (794px @96dpi, black-on-white)**. Include every specified state (default, in-progress, decided/sealed, empty/fallback, loading skeleton, facilitator-live).
3. **A final annotation pass**: on each view call out any NEW component or token introduced and justify it in one line; and confirm which of the three modes the view was designed for.

Use real copy from §10 (never lorem ipsum). Use realistic pre-selection data: client **"Asia Meals Group"** (FMCG, fictionalized), value streams **Lead-to-Cash / Source-to-Pay / Record-to-Report**, processes **"Requisition to Pay"**, **"Sell from Stock"**, **"Customer Returns"**, roles **Purchaser / Billing Clerk / Shipping Specialist**, a decision like *"We invoice in stages tied to delivery milestones, not all at once."*

---

## 1 · THE DESIGN PROBLEM — one core, three modes, layered audience

This is **not** the Affirm surface's committed-to-SAP journey. It runs **earlier**: the client is deciding *how they run* and *what "standard" looks like* before any product is on the table. Three consequences shape every screen:

**A · Product-agnostic, always — for the client.** No SAP/Oracle/NetSuite name appears anywhere the client can see, in any mode (Present, Explore, Export). Product identity exists only as a **consultant-only Product-Mapping surface inside the internal workbench** (§6, component 24) — the consultant's private Rosetta from neutral process to each product's building block. It is never projected, never exported, never in the client's hands. The client's default — and only — reading is "your business process," never "the vendor's transaction."

**B · One core, three modes.** The same content and tokens render in three chromes. The mode is a top-level switch (new component 22):

| Mode | Who | Optimised for | Chrome / density |
|---|---|---|---|
| **Present** | Consultant facilitates, room watches (projected ≥1920) | One idea at a time, big legible type, keyboard-driven, live decision tally visible to all | Minimal chrome, hero flow, high contrast, no scrolling within a step |
| **Explore** | Client self-serve (laptop/tablet, async or in-room) | Wayfinding, search, self-explanation, progress, no facilitator needed | Full navigation, breadcrumbs, sidebars, calm reading density |
| **Export** | Leave-behind / pre-read (A4 PDF, print) | Readability black-on-white, no interaction, survives a printer | No chrome, no color-dependence, page-per-section |

Design each view for its native mode(s); the Foundation sheet's mode matrix states which components appear, hide, or transform per mode.

**C · Layered audience — one journey, exec to SME.** The same IA serves everyone by *progressive depth*, never by separate apps:

- **Executive sponsor** (CFO/COO) lives at **L0** — the value-stream ribbon, coverage, and the "where we differ" heatmap. Outcomes, not steps.
- **Process owner** (functional lead) lives at **L1–L2** — workflows, process stories, flow diagrams, decisions.
- **SME / analyst** drills to **L2 detail** — the full step flow, roles, and (if opened) product mapping.
- **ABeam consultant** is the **facilitator** — drives Present mode, captures decisions, exports.

Depth is opt-in: every screen opens at the shallowest useful level and reveals detail on demand. An executive never has to see a step; an SME is never blocked from one.

## 2 · BRAND FOUNDATION — ABeam Workbench tokens (exact production values)

**Hard rule: every color, radius, shadow, font, and duration MUST come from this sheet** (the workbench `globals.css` token system). If a need can't be met, define AT MOST **3 new tokens** across the whole deliverable, each derived from a listed value (tint/alpha), and flag each in the annotation pass.

### Colors
| Token | Value | Use |
|---|---|---|
| `--brand-navy` | `#002B5C` | structure: rails, headings accents, step numerals, ribbon fills |
| `--brand-navy-hover` | `#001E40` | navy hover |
| `--brand-navy-soft` | `#E6EBF1` | navy-tinted fills, nav highlight, avatar bg |
| `--brand-navy-border` | `#CFD7E0` | hairlines on navy-tinted elements, step-strip chevrons |
| `--cta-red` | `#C8102E` | THE primary action color — buttons only, ≤1 primary per viewport |
| `--cta-red-hover` | `#A30D26` | |
| `--cta-red-focus` | `#FBE9EC` | focus-ring tint, danger banner bg |
| `--surface-cream` | `#FAF9F5` | **page background — always** (never pure white) |
| `--surface-paper` | `#FFFFFE` | cards, modals |
| `--surface-ink-tint` | `#F4F2EB` | secondary surface, zebra, hover, verbatim boxes |
| `--surface-banner-warn` | `#FDF7E6` | "we differ" reason box, soft warnings |
| `--ink-primary` | `#1A1A1A` | body text |
| `--ink-secondary` | `#4A4A4A` | secondary text |
| `--ink-muted` | `#8A8A8A` | captions, metadata |
| `--ink-disabled` | `#C4C4C4` | disabled |
| `--ink-on-navy` | `#FFFFFF` / muted `rgba(255,255,255,.72)` | text on navy |
| `--border-default` | `#E5E1D6` | standard 1px borders (warm gray) |
| `--border-strong` | `#C4BFAE` | emphasized borders, flow arrows |
| **Decision — reused for fit/scope semantics (see §9)** | | |
| `--decision-standard` | `#0F766E` (teal) | **In scope — Standard fit** |
| `--decision-configure` | `#1D4ED8` (blue) | **Discuss in workshop** |
| `--decision-custom` | `#B45309` (amber) | **In scope — We differ** |
| `--decision-open` | `#8A8A8A` | **Undecided** / Out-of-scope neutral |
| `--success` `#166534` · `--warning` `#B45309` · `--danger` `#991B1B` · `--info` `#1E40AF` | | functional text |
| Status pills | `draft #F4F2EB/#4A4A4A` · `sent #E0EBF4/#1A4D6F` · `awaiting #FBE9D1/#8B5A00` · `signed #DCEBE3/#166534` · `expired #EAEAE6/#6B6B6B` · `revoked #F4DEDB/#8E2A26` | session/scope status |

Decision colors also at **15% alpha** (badge fills), **5%** (soft boxes), **30%** (soft borders); navy at **10%** for navy badges. These alpha steps are the ONLY permitted derived fills.

### Radii — only these four
`--radius-input 8px` (buttons, inputs, inset boxes) · `--radius-card 12px` (cards, modals) · `--radius-pill 9999px` (chips, pills, tracks) · `10px` (flow/process-step boxes only).

### Shadows — only these
`--shadow-card 0 1px 2px rgba(20,20,20,.04),0 1px 0 rgba(20,20,20,.02)` · `--shadow-card-hover 0 4px 10px rgba(20,20,20,.06),0 2px 4px rgba(20,20,20,.04)` · `--shadow-pop 0 10px 24px rgba(20,20,20,.10),0 4px 10px rgba(20,20,20,.06)` (sticky bars, facilitator bar) · `--shadow-focus-ring 0 0 0 3px var(--cta-red-focus)`.

### Motion
`--dur-snap 100ms / --ease-snap cubic-bezier(.2,0,.13,1)` (presses, chip toggles, step advance) · `--dur-calm 200ms / --ease-calm cubic-bezier(.4,0,.2,1)` (hovers, crossfades, reveals) · `--dur-hero 320ms / --ease-hero cubic-bezier(.16,1,.3,1)` (mode switch, ribbon fill, Present-mode step transitions). Button press `scale(.98)`. Reduced-motion → 0ms. **Present mode**: step-to-step advance uses `--dur-hero` slide; nothing auto-plays.

### Spacing
4px grid only. Card `22/20`, inset `14/10`, page gutter desktop `32`, mobile `16`. **Present mode** uses a `48` outer margin and `32` inter-block rhythm — generous, readable across a room.

## 3 · TYPOGRAPHY (exact ramp — no other sizes)

Families: **Source Serif 4** (display serif, 400/500/600; Tiempos Headline is the licensed production face, Source Serif the fallback — design to Source Serif metrics) · **Geist Sans** (UI/body) · **Geist Mono** (metadata, scope IDs, step numerals).

| Role | Spec |
|---|---|
| Page H1 | serif 30/40, 500, `--ink-primary` |
| Hero H1 (home / terminal) | serif 32/38, 500 |
| **Present H1 (projected)** | serif **44/52**, 500 — one per Present view |
| Section / chapter head | serif 20, 500, `--brand-navy`, bottom border `--border-default` |
| Card title | serif 18, 500 |
| Stat number | serif 28 (Present: 40), 500, colored by decision token |
| Question / prompt | sans 15/22 (Present: 20/28), `--ink-primary` |
| Body | sans 14, `--ink-secondary` |
| Support | sans 13/19, `--ink-secondary` |
| Caption / helper | sans 11/16, `--ink-muted` |
| Eyebrow | sans 11, 600, uppercase, tracking .08em, `--ink-muted` |
| Badge | sans 9–10, 700, uppercase, tracking-wider |
| Mono metadata / scope ID | mono 11, `--ink-muted` |

Mobile (≤767): H1 26/32; inputs render 16px (iOS zoom defeat); touch targets ≥44×44. **Export/print**: body 10.5pt, headings serif, pure black `#000` on white, decision states carry a **text label + shape**, never color alone (§11).

## 4 · DESIGN PRINCIPLES (the spine — resolve every trade-off here)

1. **Product-agnostic first.** The client sees *their* process, not a vendor's screen. Vendor identity is a deliberate, reversible reveal — never the default frame.
2. **One accent, calm paper.** Navy is structure; `--cta-red` is the single action color; decision colors carry meaning only. No decoration, no gradients (except navy-family ribbon fills), no stock imagery. Max one serif display moment per view.
3. **Progressive depth.** Open shallow (value stream → outcome), reveal deep (workflow → process → step → mapping) only on intent. The executive and the SME share one artifact.
4. **Honesty over polish.** 16 of 654 processes have no flow, roles are indicative, no product is chosen — say so with honest fallbacks and footnotes, never invented detail. Reuse the Affirm surface's fallback discipline.
5. **Mode-aware, not mode-forked.** The same component transforms across Present/Explore/Export; it is never rebuilt. If a component can't survive all three modes, redesign it until it can.
6. **The room is the user in Present mode.** Legibility at 3 metres, keyboard-only operation, live shared state — the facilitator never fights the tool in front of a client.

## 5 · INFORMATION ARCHITECTURE

```
L0  Value-stream overview ........ 8 streams · coverage · "where we differ" heatmap        (exec)
      └ L1  Stream / workflow index ... workflows + process story cards                    (owner)
             └ L2  Process detail ...... description · FLOW DIAGRAM · fit/scope decision    (owner/SME)
      └ Scope Summary ............... decisions rolled up: standard / differ / discuss / out (exec)
      └ (Present) Facilitator deck ... any L0–L2 view driven live + tally + park            (consultant)

  ══ CONSULTANT-ONLY · internal workbench · NEVER in any client mode ══
  Product Mapping ............ neutral process → SAP ✓ / Oracle ○ / NetSuite ○ building block  (consultant)
```

Every process carries its immutable **scope ID** (mono chip) for traceability, but the ID is never the title. Breadcrumb is always `STREAM / WORKFLOW / PROCESS`. Search is global (Explore) and jump-to (Present).

## 6 · COMPONENT VOCABULARY

### 6A — INHERIT verbatim from the ABeam Workbench / Affirm system (render exactly)
1. **Wordmark** — navy rounded square + "ABeam Workbench" serif; sizes sm/md/lg.
2. **Scope chip** — navy fill, radius 5, height 22, mono 11 bold white (e.g. `18J`). Never the title.
3. **Choice chips** — radiogroup row, min-width 140, height 36 pill, 12 semibold; unselected paper + `--border-default`; selected solid decision color + white; helper caption under each. (Repurposed as the fit/scope selector, §9.)
4. **Standard-means box** (teal 30% border / 5% fill) — "WHAT 'RUNS AS STANDARD' MEANS HERE".
5. **Verbatim collapsible** — chevron toggle → ink-tint panel; mono label. (Repurposed as the Product-Mapping reveal, component 24.)
6. **"We differ" reason block** — `--surface-banner-warn`, amber-tint border, "WHY WE DIFFER" label, borderless textarea.
7. **Stat tile** — paper card, serif 28 number colored by decision token, 11 uppercase muted label; grid 2-col mobile / 5-col desktop.
8. **Stacked progress bar** — height 8 pill, ink-tint track, teal/blue/amber segments, 8px legend dots.
9. **Status pills** — the six spec pairs.
10. **Buttons** — primary `--cta-red` fill white, height 40, radius 8; secondary paper + border; danger-confirm modal pattern.
11. **Stat strip / summary bucket cards** — three cards (Standard teal / Discuss blue / Differ amber): 15% header band + serif 28 count + item list with scope chips; differ bucket shows each reason in a banner-warn inset.
12. **Attribution footer line** — mono 10 uppercase muted. **Client-facing (all client modes):** "SOURCE: ESTABLISHED ERP BEST-PRACTICE REFERENCES · CURATED BY ABEAM · RENDERED PRODUCT-NEUTRAL" — no vendor named. **Internal/consultant record only:** retains the precise citation "SAP Best Practices · S/4HANA Cloud Public 2602" for traceability. Shown, never hidden — but the client sees the neutral form.
13. **What-happens-next strip** — Discover → Workshop → Shortlist → Decide, dots + hairline, current node navy.
14. **Terminal / skeleton** shells.

### 6B — NEW components (same DNA, token-only) — design these
15. **Value-stream ribbon (neutral L0 hero).** The 8 end-to-end streams as connected horizontal segments (navy family), each: stream name (sans 13 semibold on soft) + **progress ring** (component 16) + a thin **fit bar** (component 17) showing the standard/differ/discuss/undecided mix. States per segment: untouched (ink-tint), in-progress (navy-soft + navy border), reviewed (teal 15% + teal ring). One accent — never rainbow. Mobile: vertical stack. Present: full-bleed, 44px labels, current segment lifts with `--shadow-pop`.
16. **Progress ring** — 28–40px (Present 64px), ink-tint track, teal fill, center mono count "24/61".
17. **Fit bar** — a slim stacked bar (variant of component 8) reading the four fit states for a stream/workflow: teal standard · amber differ · blue discuss · gray undecided. Always with a count legend; never color-only.
18. **Process story card (L1 index).** Paper card radius 12: scope chip + serif 18 neutral process name + one-line best-practice description (13/19) + meta row (badge "N STEPS", role count, fit state dot) + chevron. **Fallback variant** (no flow): compact — chip + name + description + "no step flow catalogued" caption; never a fake flow.
19. **Flow diagram — role-laned (the L2 & Present hero).** The process's ordered steps rendered as a horizontal **swimlane**: left rail = role lanes (sans 12 semibold on ink-tint band, colored 3px left edge per role); each step a box (radius 10, paper, `--brand-navy-border`, 1px) with a navy numeral chip, step name (13/18 semibold, Present 20/26), placed in its role's lane; connected by `--border-strong` arrows that elbow across lanes; **START** navy circle, **END** taupe circle. Long flows (>12 steps): Explore wraps to rows; Present paginates step-groups with `--dur-hero` slide; Export scales to fit A4 landscape. Blank-role steps sit in a "System / Automatic" lane. Footnote line: "Steps are the standard happy-path; roles indicative — refine with client." **This is the component that answers "there were no diagrams."**
20. **Flow step drill (Present).** On a step, ⏎/click reveals a slide-over: sub-steps (from the activity list) + the role + an editable "we do this differently here" capture — so the room can red-line a single step live.
21. **Fit / scope selector.** The choice-chip row (component 3) bound to the four fit states (§9), sitting under each process (Explore) or beneath the flow (Present). Selecting "We differ" reveals the reason block (6); "Discuss" reveals a parked note. Autosave tick. In Present the selector is oversized and keyboard-bound (1/2/3/4).
22. **Mode switch.** Segmented control top-right of the app bar: `Present · Explore · Export`. Pill segments, selected = navy fill white; switching animates chrome density with `--dur-hero`. Persists per session. Keyboard `P/E/X`.
23. **Facilitator bar (Present only).** Sticky bottom bar (`--shadow-pop`, paper): ◀ Prev / Next ▶ (process), a slim **live tally** (fit-bar for the current stream), a **Park for workshop** button (blue), a **jump-to** search, and a step counter mono. High contrast, ≥56px tall, keyboard-mirrored (←/→ steps, ⇧←/⇧→ processes, Space reveal, P park).
24. **Product-Mapping panel (consultant-only Rosetta) — internal workbench, NEVER client-facing.** Lives only in the consultant's internal workbench (V6/V9), never in Present, Explore, Export, or any surface the client can see, project, or receive. A panel per process: a 3-row mini-table — **SAP** `✓ scope 18J` (populated), **Oracle** `○ map` (empty), **NetSuite** `○ map` (empty) — each row a product name, a fit glyph, and the building-block reference or an empty slot. Purpose: the consultant's private bridge from the neutral discovery to whichever product is later shortlisted. Render inside the workbench chrome (not the client app), under a persistent guard label "Consultant only — not shared with the client."
25. **"Where we differ" heatmap (L0 exec).** A compact grid: rows = value streams, cells = workflows, cell fill = dominant fit state (teal/amber/blue/gray at 15%). Hover/tap → count. One-glance answer to "where is this client non-standard?" Print-safe via label+pattern.
26. **Coverage / provenance chip row (L0).** Three stat tiles: "654 processes", "638 with flows", "60 industry-specific" — the credibility line, muted, factual.

## 7 · THE VIEWS (all views × modes × states)

Shared chrome (Explore): cream bg; slim top bar (56px paper, 1px bottom border) — Wordmark md left, **mode switch** center-right, client name + engagement label right. Footer line every view: "Prepared by ABeam Consulting · product-agnostic process discovery · Confidential". Content column max-w 1040 (index/detail), 1280 (Present).

**V1 · Value-stream overview (L0)** — *modes: all.* Eyebrow "PROCESS DISCOVERY · {CLIENT}" → serif H1 "Your business on one page — before you pick a system." → **coverage chip row** (26) → **value-stream ribbon** (15) with per-segment progress + fit bar → **"where we differ" heatmap** (25) → what-happens-next strip. States: (a) fresh 0%; (b) mid-progress; (c) all-reviewed → teal banner "Every stream reviewed — ready for the workshop."; (d) Present variant (ribbon full-bleed, one stream focused, facilitator bar); (e) Export variant (ribbon + heatmap static, black-on-white, page 1 of the pack); (f) skeleton.

**V2 · Stream / workflow index (L1)** — *modes: Explore, Export.* Breadcrumb "OVERVIEW / SOURCE-TO-PAY" → serif H1 stream + support line + stream **fit bar** → workflows as sections (serif 20 head + count), each expanding to **process story cards** (18, 1-col mobile / 2-col desktop). Include full + fallback card variants. Stream-complete: teal 15% banner.

**V3 · Process detail (L2)** — *modes: all — THE core screen.* Sticky **journey progress bar** (breadcrumb + scope chip + process name + fit state) → serif H1 neutral process name (scope ID in chip, never the title) → one-line best-practice description → **flow diagram** (19) as the centrepiece → below it the **fit/scope selector** (21) with standard-means box, "we differ" reason on select, autosave → attribution footer (12). **No product mapping on this or any client view — it is consultant-only (§6/24).** States: (a) undecided; (b) decided-standard; (c) differ-with-reason (amber expectation note: "Noted — a difference here usually means extra build and testing, whichever product you choose. We'll size it in the workshop. Nothing is committed."); (d) discuss-parked (navy-soft note "Parked for the workshop agenda."); (e) **fallback** — no flow: honest "No step flow catalogued for this process" panel, selector still available; (f) Present variant — flow diagram is the 1920 hero, selector oversized + keyboard, step-drill (20) enabled, facilitator bar; (g) Export variant — flow scaled to A4 landscape, decision printed as label; (h) skeleton.

**V4 · Scope summary** — *modes: all.* Eyebrow "DISCOVERY SUMMARY · {CLIENT} · {DATE}" → serif H1 "Here's how {Client} runs — and where you differ." → **stat strip** (Standard / Discuss / Differ / Out / Total) → three **summary bucket cards** (11) → per-stream **fit bars** → what-happens-next (node 2 Workshop current) → primary "Export the pack". Export variant is the print-clean closing pages. This is the artifact the client keeps.

**V5 · Present deck shell** — *mode: Present only.* Full-bleed 1920 canvas: top strip (client name + stream + step counter mono) → the focused view (V1 ribbon, or V3 flow hero) → **facilitator bar** (23). No browser chrome feel. Transitions `--dur-hero`. Design: (a) stream-focus; (b) process flow-hero; (c) step-drill open; (d) live-tally moment (fit bar enlarges as room decides).

**V6 · Product-Mapping panel (CONSULTANT-ONLY — internal workbench)** — *not a client mode; never Present/Explore/Export.* The panel (24) inside the workbench chrome, showing the 3-product Rosetta for one process with empty Oracle/NetSuite rows "to be mapped", under a persistent "Consultant only — not shared with the client" guard. Annotation: "Same discovery — bind to any product later." This surface must be impossible to reach from any client session.

**V7 · Export pack (print)** — *mode: Export.* A4 portrait sequence: cover (client + provenance), L0 ribbon + heatmap, per-stream fit summary, then per-process one-liners with mini-flow thumbnails and the recorded decision. Black-on-white, decision states as label+pattern, page numbers, footer provenance. No interactive affordances rendered.

**V8 · Empty / onboarding** — first-open state before any stream is touched: the ribbon at 0%, a single primary "Start with {first stream}", and a one-line "or explore any stream" — no fake progress.

**V9 · Consultant setup (internal)** — a section in the existing workbench chrome (not a full external page): choose client + engagement, pick which value streams are in play (multi-select chips), maintain the **consultant-only Product-Mapping** (V6/24 — never exposed to the client), generate the session / export. Reuse the Affirm S9 panel patterns (table rows, status pills, primary "Create session").

## 8 · THE THREE MODES — how one view flexes (mode matrix rules)

For every component, the Foundation sheet states its behaviour in each mode. The rules:

- **Present** — hide: top nav, breadcrumbs, sidebars, search bars (replaced by jump-to in the facilitator bar). Show: facilitator bar, oversized type (§3 Present rows), one focal block, keyboard hints (subtle, bottom-left, fade after 4s). Interaction: keyboard-first; the flow diagram and fit selector are the only large touch targets. Never scroll inside a step — paginate.
- **Explore** — the full IA: nav, breadcrumbs, search, progress, calm reading density, hover states, autosave. The default mode.
- **Export** — strip all chrome and interaction; linearise (ribbon → streams → processes → summary); enforce black-on-white with label+pattern for decisions; every color-carried meaning gets a redundant text label; page breaks between streams; provenance + confidentiality on every page footer.

A component that cannot honour all three (e.g. a hover-only reveal) must gain a non-hover equivalent (Export: always-expanded; Present: keyboard-revealed).

## 9 · DECISION MODEL — neutral fit/scope (reuses the decision tokens)

The Affirm surface's "adopt / discuss / differ" becomes a **fit-to-standard + scope** capture, product-agnostic:

| State | Token | Chip label | Helper caption | Reveals |
|---|---|---|---|---|
| In scope — standard | `--decision-standard` teal | **Runs as standard** | "The standard flow fits how we work." | standard-means box |
| In scope — we differ | `--decision-custom` amber | **We do this differently** | "We have a specific requirement here." | "why we differ" reason block + expectation note |
| Needs discussion | `--decision-configure` blue | **Discuss in workshop** | "Unsure — raise it in the workshop." | parked note |
| Out of scope | `--decision-open` gray | **Not applicable** | "We don't run this process." | dims the row |
| (unset) | `--decision-open` gray | — | — | — |

Rules: exactly one state per process; "we differ" requires a reason before summary counts it as complete (honest gap capture); the four states drive every **fit bar**, **heatmap** cell, **stat tile**, and **summary bucket**. Never introduce a fifth color or a decorative use of a decision color.

## 10 · VOICE & COPY

Second person, plain business English, **zero vendor jargon** anywhere in the default reading (product terms appear only inside the Product-Mapping overlay). Buttons are verbs. Never "please note". Never invent process detail — unreviewed/absent content shows the honest fallback. Present-mode copy is shorter and spoken-friendly.

Verbatim promises (use exactly):
- "Your business on one page — before you pick a system."
- "See how the standard runs your process, then tell us where you differ."
- "Nothing is committed — this is discovery, not a decision."
- Differ expectation note: "Noted — a difference here usually means extra build and testing, whichever product you choose. We'll size it in the workshop. Nothing is committed."
- Provenance (client-facing): "Source: established ERP best-practice references, curated by ABeam and rendered product-neutral. The process is yours; the reference names no vendor." (The precise SAP citation is kept only in the internal record — see §6/12.)
- Fallback: "No step flow is catalogued for this process yet — we'll map it with you."

## 11 · ACCESSIBILITY & PRESENT-MODE LEGIBILITY

- Contrast ≥4.5:1 body / ≥3:1 large; visible focus = `--shadow-focus-ring` + navy border on every interactive element; choice/fit chips are real radiogroup semantics; `aria-live=polite` on autosave + progress; modal focus trap; touch ≥44px on ≤1023px.
- **Decisions never rely on color alone** — every fit state carries a text label and, in Export, a fill pattern (teal=solid, amber=diagonal, blue=dots, gray=open). Colorblind-safe by construction.
- **Present mode**: minimum on-screen type 20px; the flow hero legible at 3 m (test at 1920 scaled to a 55" panel); full keyboard operation with visible focus; no reliance on hover; motion respects reduced-motion (advance becomes instant).
- Export: real text (selectable), not rasterised; logical reading order; alt text on flow thumbnails.

## 12 · HARD CONSTRAINTS — "nothing stray" (verify before finishing)

1. No color outside §2 (+ permitted alphas and ≤3 flagged derived tokens). Forbidden: any Tailwind default palette (slate/emerald/…), pure `#FFFFFF` page backgrounds (page is cream, paper is `#FFFFFE`), the legacy Aptus hexes.
2. Fonts only: Source Serif 4 / Geist Sans / Geist Mono. No Inter, no JetBrains Mono.
3. Only the four radii; only the listed shadows; spacing on the 4px grid (Present rhythm 32/48).
4. Icons: hand-drawn inline-stroke, 24 viewBox, stroke 2–2.5, round caps, currentColor, 11–18px. No icon-library glyphs, no filled icons, no emoji.
5. One CTA color: `--cta-red` for primary actions only (≤1 primary per viewport). Decision colors for fit/scope semantics only — never decorative. Navy is structure, not a button fill (except selected chips/segments).
6. **Product-agnostic is a hard rule for every client surface**: no SAP/Oracle/NetSuite name in ANY client-facing view in ANY mode (Present/Explore/Export). The only place a product name may appear is the **consultant-only Product-Mapping panel in the internal workbench** (24). Verify every client screen shows zero product names — including the provenance line (see §10, neutralised for the client).
7. Light mode only. No dark mode.
8. Every state in §7 exists — fallback, decided, sealed, Present, Export, skeleton are first-class, not afterthoughts.
9. **Mode parity**: every view is designed (or explicitly N/A-annotated) for each of its declared modes; the mode matrix on the Foundation sheet is complete.
10. Density: calm, paper-like, executive reading — not a dashboard. Max one serif display moment per view. No decorative illustration, no gradients except navy-family ribbon fills.
11. Honesty: indicative roles footnoted; absent flows shown as fallback; empty Oracle/NetSuite mapping rows shown as "to map", never faked.
12. Annotate every view: element → token/component reference, NEW-token justifications, and the mode(s) the view serves.

---

### Appendix A — Wireframes (structure only; design to the tokens above)

**V1 · Value-stream overview (Explore desktop 1440)**
```
┌───────────────────────────────────────────────────────────────────────────┐
│ [A] ABeam Workbench          ‹ Present · Explore · Export ›   Asia Meals ▾  │
├───────────────────────────────────────────────────────────────────────────┤
│ PROCESS DISCOVERY · ASIA MEALS GROUP                                        │
│ Your business on one page — before you pick a system.            (serif H1) │
│                                                                             │
│ [ 654 processes ] [ 638 with flows ] [ 60 industry-specific ]   (stat row)  │
│                                                                             │
│  Concept→Market  Source→Pay  Plan→Fulfill  Lead→Cash  …   (value-stream     │
│   ◔ 0/24          ◑ 24/61     ◔ 8/140      ● 61/106       ribbon segments)  │
│   ▭ fit bar       ▭▭▭ fit bar  ▭ fit bar    ▭▭▭▭ fit bar                     │
│                                                                             │
│  WHERE YOU DIFFER            (heatmap: streams × workflows, fit-tinted)     │
│   S2P [teal][amber][gray][teal]   L2C [teal][teal][blue][amber] …           │
│                                                                             │
│  Discover ─ Workshop ─ Shortlist ─ Decide        (what-happens-next)        │
└───────────────────────────────────────────────────────────────────────────┘
```

**V3 · Process detail (L2) — the core, Explore 1440**
```
┌───────────────────────────────────────────────────────────────────────────┐
│ ‹ OVERVIEW / SOURCE-TO-PAY / [18J]  Requisition to Pay      ● We differ ▾   │
├───────────────────────────────────────────────────────────────────────────┤
│ Requisition to Pay                                             (serif H1)   │
│ Raise a request, approve it, order, receive, and pay — end to end. (desc)   │
│                                                                             │
│  ┌─ FLOW ─────────────────────────────────────────────────────────────┐    │
│  │ Requester │▶①Create PR ─┐                                           │    │
│  │ Approver  │     └──────②Approve PR ─┐                               │    │
│  │ Purchaser │            └──③Convert to PO ─┐   ⑥Change PO ─┐         │    │
│  │ Receiving │                     └─④Confirm receipt ─┐     └─…       │    │
│  │ AP Clerk  │                              └────────⑤Create invoice→✓ │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│  Steps are the standard happy-path; roles indicative.        (footnote)     │
│                                                                             │
│  HOW DOES THIS FIT?   ( Runs as standard · We differ · Discuss · N/A )      │
│   ▸ WHY WE DIFFER  [ we invoice in stages tied to delivery… ]  (on amber)   │
│                                                                             │
│  ▸ SEE HOW PRODUCTS DELIVER THIS      (Product-Mapping overlay, collapsed)  │
│  SOURCE: SAP BEST PRACTICES 2602 — RENDERED PRODUCT-AGNOSTIC                 │
└───────────────────────────────────────────────────────────────────────────┘
```

**V5 · Present mode — process flow-hero (1920, projected)**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ASIA MEALS · SOURCE-TO-PAY                                   step 3 of 9       │
│                                                                                │
│   Requisition to Pay                                        (serif 44)         │
│                                                                                │
│      [ large role-laned FLOW diagram — current step lifted, others calm ]      │
│                  