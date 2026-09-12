# PR-1 — the CoreEdge token scope

Tailwind v4, CSS-first, no config file. Four things land: the design bundle, the token
scope, a lint rule that keeps the new console out of raw literals, and a contrast test
that checks the design's own arithmetic.

---

## 1 · The design bundle is now in the repo

`docs/coreedge/design/` — A1–A8 plus the eleven `.dc.html` design files and the handoff
README. Every later PR cites these, so they are committed rather than left in a zip.

**Three files the build brief names do not exist under those names.** Flagged rather than
guessed at:

| Brief says | Actually | Resolution |
|---|---|---|
| `12-CoreEdge-P6-Handoff.dc.html` | `CoreEdge Engineering Handoff.dc.html` | Same document — component inventory, routes, tokens, interactions, the 18-status vocabulary, backend gaps, open questions. Used as authoritative. |
| `A5b` | `A5-CoreEdge-Status-Vocabulary.csv` | Same content. PR-2 generates `status-vocabulary.ts` from it. |
| `A2-tokens-v2.1-patch.css` | **does not ship at all** | Written as `docs/coreedge/design/A2-tokens-v2.1-patch.css`, transcribed from the handoff's section 3 table (Token / Light / Dark / Why), which carries all seven tokens with values and contrast reasons. Nothing invented; the file's header records exactly where each value came from. |

## 2 · The scope — `src/app/coreedge-tokens.css`

A2, with the v2.1 patch applied, under `.coreedge`.

**Why a scope and not `:root`.** These names collide with what already ships in
`globals.css` — `--brand-navy`, `--ink-primary`, `--border-default`, the seven
`--status-*-bg/-fg` pairs. At `:root` they would repaint the Aptus portal, the Workbench,
presales, affirm and discovery in one commit, none of which this redesign touches. Under
`.coreedge` the two vocabularies can differ where the redesign deliberately moved a value
— `--ink-disabled` is `#C4C4C4` outside and `#6B6B6B` inside.

**Dark is selected by two selectors, and both are load-bearing:**

```css
.coreedge[data-theme="dark"],   /* the design's own contract (A2 declares this) */
.dark .coreedge                  /* the app's real theme mechanism */
```

next-themes runs with `attribute="class"` (`components/shared/Providers.tsx:34`), so a user
who picks dark gets `.dark` on `<html>` and **nothing sets `data-theme` anywhere**. Without
the second selector the console's dark palette would be exactly as unreachable as the one
this PR is fixing — declared, correct, and never applied. The first is what lets
`/coreedge/design-system` (PR-3) put a light and a dark specimen on one page; there is a
matching `.dark .coreedge[data-theme="light"]` block so an explicit light choice wins over
an ambient `.dark`.

**The dark block restates only what changes.** A value repeated in both places is a value
someone can edit in one and not the other. A test asserts this directly: every token the
dark block declares must differ from its light value.

## 3 · The unreachable dark palette, re-scoped

`globals.css` declared the CoreEdge status tokens' dark values under
`.dark [data-cap-catalogue]`, and `data-cap-catalogue` is set on **exactly one element** in
the codebase (`components/sap/SapCapabilityCatalogue.tsx:454`). So in dark mode a Studio,
Operations or Control Tower chip kept its light background against a dark page.

The attribute selector is dropped; the block becomes `.dark`. The catalogue renders exactly
as before — it sits inside `.dark` like everything else — and every other surface stops
rendering a light chip on a dark ground.

The scope was not wrong when written: it was a hedge to avoid re-baselining
visual-regression snapshots. The comment recording that hedge also records why it bought
nothing — *"the entire snapshot suite is 43 images covering assessments, dashboard, login
and the report contact sheets. NOTHING covers affirm, workbench, studio, control tower,
operations, presales or discovery."*

**This does not serve the new console.** `.coreedge` carries its own complete pair and does
not inherit from here, because the redesign moved several of these values.

## 4 · `@theme` — which utilities exist

Twenty token references added to the `@theme inline` block, so `bg-gate-ok-bg`,
`text-status-inreview-fg`, `bg-rail-hover` and the rest are real utility classes rather
than inline `var(--…)` in component code — which is the habit the lint rule exists to
break. The **values** stay in the scope: `@theme` decides which utilities exist, the scope
decides what they mean.

## 5 · The lint rule

`no-restricted-syntax` over `src/components/coreedge/**` and `src/app/(coreedge)/**`,
refusing raw hex, `rgb()`/`rgba()` and `px` literals in both string and template-literal
nodes. Each message names where the right value lives.

Two things worth knowing:

- **Scoped deliberately.** The audit counted 239 raw hex values, 27 `rgb()` calls and 1343
  `px` literals across the existing components. Running this everywhere would produce ~1600
  errors on code this work does not touch, and a rule that cannot be satisfied is a rule
  everyone learns to disable.
- **What it cannot catch**, stated so nobody trusts it further than it goes: a *unitless*
  number in a React style object (`fontSize: 11.5`) is rendered as px by React and is
  invisible to a string-literal rule. That is precisely how the existing console screens
  are written. PR-3's design-system page is what covers it.

**`files` patterns list one extension at a time, never `*.{ts,tsx}`.** This repo's pnpm
overrides pin `brace-expansion` to `>=5`, whose API `minimatch@3` (still used by
`@eslint/config-array`) cannot call — a braced pattern throws *"expand is not a function"*
and crashes the **entire** lint run rather than merely failing to match. Every other block
in the config already avoids braces; now a test says why.

**The test lints virtual paths, and had to.** `tests/unit/coreedge/no-raw-literals-lint.test.ts`
runs real ESLint — a test that greps the config proves the block was typed, not that its
selectors match anything. The first version wrote fixture files into
`src/app/(coreedge)/__fixtures__` so a file would pick the rule up by virtue of where it
lived, and that **created a real route group on disk**. `tests/unit/routing/route-group-gating.test.ts`
enumerates route groups from disk and fails on any with no access decision — so it failed,
exactly as designed. Teardown would not have saved it: vitest runs files in parallel, so
the fixture only had to exist for the instant that test collected.

`ESLint#lintText` takes a `filePath` that config resolution honours **without the file
existing**, so the `files` patterns are still what decides the outcome — the property
actually under test — while nothing is written under `src/`. A final assertion checks
`src/app/(coreedge)` does not exist, so the day someone reintroduces fixtures they find out
here rather than in an unrelated security test. The route group is PR-4's to create, with
the layout that gates it.

## 6 · The contrast test

`tests/unit/coreedge/token-contrast.test.ts` — 43 assertions.

Every ratio the patch states has been **recomputed and reproduces exactly**:

| Token | Theme | Ground | Stated | Measured |
|---|---|---|---|---|
| `--focus-ring-navy` | dark | `--surface-cream` | 8.67:1 | ✓ 8.67 |
| `--ink-disabled` | dark | `--status-nocheck-bg` | 5.55:1 | ✓ 5.55 |
| `--border-strong` | dark | `--surface-paper` | 3.73:1 | ✓ 3.73 |
| `--status-inreview-fg` | dark | `--status-sent-bg` | 8.15:1 | ✓ 8.15 |
| *(before)* `#5A5A5A` | dark | `--surface-ink-tint` | 2.26:1 | ✓ 2.26 |
| *(before)* `#3A4454` | dark | `--surface-paper` | 1.72:1 | ✓ 1.72 |
| *(before)* `#1E40AF` | dark | `--surface-paper` | 1.94:1 | ✓ 1.94 |

**Each is measured against the surface the token actually renders on**, not the page
ground — which is why `--ink-disabled` is quoted on the nocheck chip and
`--status-inreview-fg` on the sent chip. The figures reproduce to the second decimal only
on the right grounds, which is itself evidence they were measured honestly. Measuring a
chip foreground against the page *behind* the chip reports a number nobody ever sees.

Also asserted: every status pair and every ink value clears 4.5:1 in **both** themes; the
focus ring clears 3:1 on all three surfaces in both; and the fifteen pairwise contrasts
between the six dark status grounds all sit between 1.01:1 and 1.10:1 — the finding that
makes *"every status renders a glyph"* a component contract rather than a styling
preference.

### ⚠ One gap, pinned rather than hidden

**`--border-strong` in LIGHT is 1.84:1 on `--surface-paper` — below the same 3:1 non-text
floor the dark value was raised to clear.** The patch fixed dark with the reason *"so
inputs read as plain text"*; that reason applies equally to light, and the handoff does not
address it.

Not fixed here: choosing a replacement is a design decision, not a transcription, and
inventing one would put a colour in the product no design review has seen. Instead the test
pins the measured value, so the number is visible in CI rather than only in a document —
and the day someone changes it, in either direction, the assertion fails and says what to
do next.

**This needs a product-owner decision before PR-2 builds `FieldPicker` and `MaskedKey`,**
both of which the handoff lists as using `--border-strong` for their input edges.

---

## Files

| Added | |
|---|---|
| `docs/coreedge/design/**` | The bundle: A1–A8, eleven `.dc.html`, README |
| `docs/coreedge/design/A2-tokens-v2.1-patch.css` | Transcribed; does not ship in the bundle |
| `docs/coreedge/design/PR-1-TOKENS.md` | This file |
| `src/app/coreedge-tokens.css` | The `.coreedge` scope |
| `tests/unit/coreedge/token-contrast.test.ts` | 43 assertions |
| `tests/unit/coreedge/no-raw-literals-lint.test.ts` | 10 assertions, runs ESLint for real |

| Changed | |
|---|---|
| `src/app/globals.css` | Import the scope; 20 `@theme` entries; re-scope `.dark [data-cap-catalogue]` → `.dark` |
| `eslint.config.mjs` | The raw-literal rule |

Nothing else. No component, route or schema is touched — those are PR-2 and PR-4.
