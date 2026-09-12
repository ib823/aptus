# Handoff: CoreEdge Console Redesign

## Overview

CoreEdge is an internal ABeam platform that lets consultants build small apps against a client's
SAP S/4HANA system without learning SAP. This redesign replaces a capability-and-grant model with
one organising idea: **the lane** — one data feed in one environment, with six gates that must all
pass for data to flow.

The product's job is to answer three questions honestly, at a glance:

1. Does this work right now, and how do we know?
2. If not, which gate broke and **who fixes it**?
3. What is leaving the client's SAP system, and who approved it?

Every design decision follows from that. A status is never shown without the age of the proof
behind it. A failure always names an owner. Two failures that need different people are never
given the same words (a SAP 401 and a SAP 403 are the canonical case).

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended
look and behaviour, not production code to copy directly. They are Design Components: inline-styled
single files, deliberately free of any build step or component library.

The task is to **recreate these designs in the target codebase's existing environment** (React,
Vue, or whatever the CoreEdge console actually uses) with its established patterns, routing and
component primitives. If no front-end environment exists yet, choose the framework that fits the
rest of the stack and implement the designs there.

Do not ship the HTML. Do lift the exact values: hex codes, type sizes, spacing, radii, copy.

## Fidelity

**High-fidelity.** Final colours, typography, spacing, states and copy. Every string in these files
is intended production copy and has been reviewed line by line — including refusal messages,
disabled-button reasons and toast text. Recreate the UI faithfully, and treat the copy as a
specification rather than placeholder text.

Two caveats on the data:

- Content tagged `example` in a mono badge is invented to fill out a screen. Real fixtures come
  from A7. Anything untagged is from the provided data.
- The five core screens are 1440×900. Phone screens are 375 px wide and grow to their content.

## Read This First

`CoreEdge Engineering Handoff.dc.html` is the primary document. It contains, in order:

1. **Component inventory** — 14 components with variants, props, states and the tokens each uses.
2. **Screen list** — 14 routes with role, components and the scenario IDs each covers.
3. **Tokens added or changed** — 6 tokens, light and dark, with the contrast reason for each.
4. **Interaction notes** — focus order, shortcuts, loading, empty, error, toast copy, optimistic updates.
5. **Lane status vocabulary** — all 18 statuses with chip, token, broken hop, owner and meaning.
6. **Backend gaps** — 10 capabilities the designs assume that the current backend does not have.
   **This is the estimating section.**
7. **Open questions** — 10 questions for the product owner, each with what we assumed and what changes.

Section 6 matters more than the rest. The UI is not the expensive part of this work.

## Screens / Views

Full markup for every screen is in the bundled files; this section gives the shape and the rules
that are not obvious from reading the HTML.

### Rail / navigation (every screen)

- 220 px fixed left rail on desktop, `--surface-rail` #0A1F3D (light **and** dark — the rail is the
  one surface that does not invert).
- Six places, always visible and always enabled: Home, Apps, Catalogue, Requests, Operations,
  SAP systems. Badge counts on Home, Requests and Operations.
- On phone it becomes a six-tab bottom bar, 56 px tall, current tab filled with a 2 px inset
  #8FB4E8 top edge. Labels at 11 px — the floor, and the reason "Requests" and "Ops" are shortened.
- **Role gating is never a redirect.** Every route renders for every signed-in user; what changes is
  which actions are enabled and what reason the disabled ones carry.

### 01 · Home — "Needs you"

Four rows, most urgent first, each with a 4 px left accent (`--danger` broken now, `--warning`
expiring, `--status-inreview-fg` in review, `--success` ready to collect). Each row is a lane, a
state, and exactly one action. Below: "My apps" cards with feed and lane counts.

The order is the design. Broken-now outranks expiring-soon, which outranks waiting-on-someone-else.

### 02 · App › lane board

Feed tabs (36 px chips), then a 4-up grid of LaneCards — one per environment. Each card: environment,
SAP system, StatusChip, a compact gate strip (`A✓ S✓ K– T–`), one line of detail, one action. A side
sheet opens on selection with the field list, the end date and the approver.

Prod's action is `Promote →` **disabled with the reason** "Promote after Dev works" — "Blocked" is
not a state in this product.

### 03 · Requests › review

Four checks in a list, each pass/fail/running with its own detail line and owner. Then the decision:
primary Approve, one or two narrower options, and Reject last behind a dialog.

**Approve is disabled by exactly one thing at a time**, with the reason directly beneath it, never in
a tooltip. Where two rules apply (R03: the reviewer both raised the request and owns the app), both
are listed, in order, and either alone would be enough.

### 04 · Lane › Why? + timeline

Six hop chips on one line at 880 px — Key, Access, Binding, SAP metadata, SAP data read, Your app —
and they must never wrap. The broken hop gets a 2 px border and 700 weight; hops after it are dashed
and read "never reached". Below: the plain-language explanation, the correlation ID, the owner, one
action, and a timeline.

### 05 · Operations board

Nine-column table, 11 rows, sorted by what needs a human then by age of proof. Every row carries the
age of its own check. The legend above the table states "11 lanes · 4 from the live X5M landscape,
7 marked example" — it sits above, not below, because it is a legend.

Row left-edge follows status: red refused, amber no key, grey Unknown. **Never red for Unknown** — we
do not know it is broken, only that we cannot tell.

## Interactions & Behavior

See section 4 of the handoff document for the full set. The rules most likely to be lost in
translation:

- **Loading never blanks a known state.** A row being re-checked keeps its previous status *and its
  age* until its own check returns. Skeletons only where nothing has ever loaded. There is no
  "checking" status.
- **Disabled controls stay in the tab order** and announce their reason.
- **Optimistic updates are limited to three things**: rail badge counts, flow step position, and text
  the user typed. Never a lane status, a key, an approval or a revoke. A lane that flashes green
  before SAP answers is the exact lie this design exists to prevent.
- **Toasts confirm, never explain.** Anything re-readable belongs on the screen or the timeline.
- **Red is only for irreversible actions** (revoke a key, retire an app). Deactivating a SAP system is
  navy, because it can be switched back. The focus ring is navy in both themes.
- **Concurrency**: reviewers are not assigned. First decision wins; a second attempt is refused and
  the dialog becomes the record.
- **Time**: store one UTC instant, render in the reader's zone with the zone named, and show the
  resolution before submit ("10 Dec 2026" → "10 Dec 2026, 23:59 MYT").

## State Management

Per lane: `{feed, env, systemId, status, gates[6], checkedAt, proofAge}` — `status` is derived from
`gates`, never set directly. Per request: `{checks[], decision, decidedBy, decidedAt, terms}`.
Per key: `{appId, env, prefix, tail, issuedAt, lastUsedAt, revokedAt?}` — one key per app per
environment, shared by every feed the app is approved for.

The one non-obvious requirement: **`checkedAt` must be stored, not computed at render.** The 24-hour
fade to Unknown, every "proven N minutes ago" line and the whole Operations board depend on a
persisted proof timestamp.

## Design Tokens

A2 (`A2-coreedge-tokens-v2.css`) is the source of truth; light is `:root`, dark is
`[data-theme="dark"]`. Section 3 of the handoff document lists the six tokens this work added or
corrected, with values for both themes and the measured contrast reason for each. Three were A2 bugs
found by mapping the light screens to dark mechanically:

- `--ink-disabled` dark #5A5A5A → **#A3A09A** (was 2.26:1, now 5.55:1)
- `--border-strong` dark #3A4454 → **#6B7789** (was 1.72:1, now 3.73:1)

The rail hover and current-place fills are named as tokens too, and are **alpha over the rail ground**
(white at 8% and 12% over `--surface-rail`) rather than hexes — one value that works in both themes.
The phone tab bar diverges deliberately: its current tab is opaque #002B5C with a 2 px inset #8FB4E8
top edge, because a 12% wash cannot mark position on a 56 px tab.
- in-review accent #1E40AF → **#9CC6EA** in dark (was 1.94:1, now 8.15:1)

One finding worth carrying into implementation: across all fifteen pairs of the six dark status
grounds, separation runs 1.01:1 to 1.10:1. In dark the chip background carries almost no
information, so **the glyph and foreground are the entire signal** — every status must render its
glyph (✓ i … ✕ –). This is a component contract, not a styling preference.

Spacing is the A2 `--space-*` scale (2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48) with no off-scale
values. Type: Geist, Geist Mono for identifiers, Source Serif 4 for headings. Minimum type size is
11 px, and only for mono eyebrows and tab labels. Minimum touch target is 44 px.

## Assets

None. No images, no icon font, no SVG illustration. Status glyphs are text characters
(✓ ✕ – … i) and the fonts load from Google Fonts. If the codebase has an icon set, the glyphs are
the one place to substitute it — keep one glyph per status.

## Files

| File | What it is |
|---|---|
| `CoreEdge Engineering Handoff.dc.html` | **Start here.** Components, routes, tokens, interactions, vocabulary, backend gaps, open questions |
| `CoreEdge Core Screens.dc.html` | The five core screens, 1440×900, light |
| `CoreEdge Core Screens Dark.dc.html` | Same five in dark, plus the measured contrast audit and token changelog |
| `CoreEdge Phone Screens.dc.html` | The five screens at 375 px |
| `CoreEdge Flows.dc.html` | Two clickable flows — builder golden path (12 steps), operator failure (6 steps) |
| `CoreEdge Design System.dc.html` | Design system v1.2 — colour, type, spacing, component specimens |
| `CoreEdge Builder P0 Scenarios.dc.html` | S03–S12: the builder states that must work |
| `CoreEdge Builder P1 Scenarios.dc.html` | S01, S02, S10, S13–S16 |
| `CoreEdge Reviewer Scenarios.dc.html` | R01–R07, plus E1 narrower approval and E2 revoke |
| `CoreEdge Operator Admin Scenarios.dc.html` | O01–O09, A01–A06, and the lane status vocabulary frame |
| `CoreEdge Cross-cutting Scenarios.dc.html` | X01–X06: rights, phone, command bar, keyboard, time zone, client passport |

Every scenario frame carries an `id` matching its A4 ID (`#s03`, `#r01`, `#o02`, `#x06`), so links
from the flows and from this README resolve directly to the frame.

44 scenarios from A4 are covered. The scenario files are the specification for edge cases — when
implementing a screen, read its scenario frames before writing the happy path, because the states
are where the design work actually is.
