# Clickable Elements — Patterns & Primitives

This doc defines the canonical way to render clickable controls in Aptus. It
exists because we audited the codebase and found three recurring issues that
had been re-introduced ad-hoc in many places. Fixing them once at the
primitive layer is cheaper than playing whack-a-mole.

If you're adding a new button or button-like surface, read this first.

## Background — what went wrong

1. **Tailwind v3+ Preflight removes `cursor: pointer`** from the browser
   defaults for `<button>`. Tailwind v4 keeps that removal. Without an
   explicit `cursor-pointer` class (or a global rule) every native `<button>`
   silently shows a default arrow cursor on hover, which feels unresponsive.
2. **Disabled CTAs that absorb clicks silently** — e.g. a "Continue" button
   greyed out at the bottom of a form, with no tooltip and no helper text.
   Sighted users don't know what's blocking; keyboard users get no feedback;
   screen readers announce "button disabled" with no reason.
3. **`<span role="link">` and `<div role="button">` masquerading as
   buttons** — usually because the developer wanted a "disabled-looking"
   element that still received clicks (the native `disabled` attribute blocks
   click events). This is an a11y smell.

## Our solution — three layers

### Layer 1 — Global CSS (`src/app/globals.css`)

A single `@layer base` rule covers the cursor regression once for the whole
app:

```css
button:not(:disabled):not([aria-disabled="true"]),
[role="button"]:not([aria-disabled="true"]),
[role="link"]:not([aria-disabled="true"]) {
  cursor: pointer;
}
button:disabled,
[aria-disabled="true"] {
  cursor: not-allowed;
}
```

**Implication:** new components do **not** need to add `cursor-pointer` to
buttons. The cursor is handled. Don't sprinkle it manually.

### Layer 2 — `<GatedButton>` (`src/components/ui/gated-button.tsx`)

For any CTA whose enablement depends on **user-controlled state** (form
validation, profile gates, multi-step wizards), use `<GatedButton>` instead
of `<Button disabled>`.

```tsx
<GatedButton
  type="submit"                              // optional — auto-downgraded to "button" when gated
  gated={!email || !role}                    // soft-disabled when true
  gatedReason="Enter email and role."        // shown in tooltip + announced via aria-describedby
  onGatedClick={focusFirstInvalidField}      // optional helper, fires on click while gated
  disabled={isSubmitting}                    // hard-disable for transient async states
  onClick={handleSubmit}
>
  Send Invite
</GatedButton>
```

Three states:

| State | Behavior |
|---|---|
| `gated=false`, `disabled=false` | Plain enabled button |
| `gated=true`, `disabled=false` | Soft-disabled: `aria-disabled="true"`, tooltip on hover/focus, click → `onGatedClick`. Form-submit Enter is blocked (type downgraded to `button`). |
| `disabled=true` (regardless of gated) | Hard-disabled: native `disabled`, no clicks, no tooltip. |

**Use `gated` for** anything the user can resolve themselves: missing form
fields, incomplete profile, prerequisite step not done, scope not selected.

**Use `disabled` for** transient async states: `isSubmitting`, `isLoading`,
`isSaving`. The user can't do anything to resolve these except wait.

**Don't** combine `<Button disabled>` with `aria-disabled` — the native
`disabled` attribute already announces the state. Adding `aria-disabled` is
redundant and (worse) implies you wanted soft-disable but used the wrong
attribute.

### Layer 3 — Avoid masquerading

If you find yourself reaching for `<span role="link">`, `<div role="button">`,
or `<a aria-disabled>`, stop. The reason is almost always "I want a clickable
disabled thing" — which is what `<GatedButton>` exists for. The exceptions
are documented:

- `ScopeAreaGroup.tsx` — `<span role="button">` inside an accordion trigger.
  Necessary because nested `<button>` inside `<button>` causes React 19
  hydration errors and infinite re-render. Keyboard handlers (Enter/Space)
  are on the span. **Don't copy this pattern unless you have the same
  constraint.**
- `FlowViewerClient.tsx`, `ActivityCluster.tsx` — SVG `<g role="button">` for
  interactive chart nodes. SVG can't contain `<button>`; this is correct.
- `NotificationItem.tsx` — `<div role="button">` for a clickable list row.
  Pattern includes `tabIndex={0}` and `onKeyDown`. Acceptable.

## Authoring checklist

Before you submit a PR with a new clickable element, check:

- [ ] If the click target has a state where it should be disabled but the
      user can resolve it: use `<GatedButton>`, not `<Button disabled>`.
- [ ] Don't add `cursor-pointer` to `<button>` — the global rule has it.
- [ ] Don't add `cursor-pointer` to `<div onClick>` either — but **do** add
      `tabIndex={0}` + `onKeyDown` and prefer to use a real `<button>` if
      possible.
- [ ] Don't add `aria-disabled` to a `<Button>` that already has `disabled`.
- [ ] If the click target is in a `<form>`, give the submit button
      `type="submit"`. Other buttons in the form must have `type="button"`
      (otherwise they accidentally submit the form).
- [ ] Every disabled-state CTA should have a tooltip OR a visible helper
      text OR both, explaining what's blocking. `<GatedButton gatedReason>`
      gives you the tooltip for free.

## Companion concern — CSS layout containment

Late April 2026 a forensic audit of the live shell revealed a **CSS Grid
min-content blowout** on `.aptus-app`: the top-level grid had no
`grid-template-columns`, so its single implicit column track defaulted to
`auto` (= max-content), forcing the entire shell to its widest descendant's
width (~1432px). Every Tailwind `md:` breakpoint underneath was effectively
disabled because the parent container was always wider than the viewport.

The fix is structural and lives in three places:

1. **`src/components/aptus/AptusShell.tsx`** — the outer grid now declares
   `grid-template-columns: minmax(0, 1fr)` and `width: 100%; max-width: 100vw;
   overflow-x: hidden`. The inner `64px 1fr` shell-body grid was changed to
   `64px minmax(0, 1fr)` for the same reason.
2. **`src/styles/aptus-responsive-guards.css`** — global `:where()` rules
   (specificity 0,0,0) that default every grid/flex descendant of `.aptus-app`
   to `min-width: 0; min-height: 0`, cap media to `max-width: 100%`, and break
   long unbreakable strings via `overflow-wrap: anywhere`. Imported from
   `globals.css` immediately after Tailwind.
3. **`src/app/globals.css`** — the `.a-shell-body` / `.a-topbar` / `main`
   selectors gain `min-width: 0`; topbar gets a flex-row layout with a
   `.a-search` field that hides ≤640px; `.a-menu-toggle` (hamburger) reveals
   the off-canvas sidebar at ≤768px.

### Authoring rule for layout containers

If you create a new grid or flex container inside `.aptus-app`:

- **Grid columns:** prefer `minmax(0, 1fr)` over `1fr` for any track that
  contains long content (forms, tables, prose, breadcrumbs).
- **Direct grid/flex children:** add `min-w-0` (Tailwind) or `min-width: 0`
  if the child contains content that can overflow. The global guard handles
  this for `.aptus-app` descendants but explicit is better.
- **Tables, code, pre:** don't put naked `<table>` / `<pre>` in a card.
  Wrap in `<div className="overflow-x-auto">` or rely on the globals.css
  `.aptus-app table { display: block; overflow-x: auto }` rule.
- **Long URLs / IDs / tokens:** the global `overflow-wrap: anywhere` will
  break them. If you need the original behavior, override at the component
  level with `overflow-wrap: normal`.

### Regression test

`tests/e2e/responsive/responsive-shell.spec.ts` asserts at every viewport:

1. `document.documentElement.scrollWidth ≤ clientWidth + 1` (no horizontal
   overflow on the page).
2. `.aptus-app` bounding-box width ≤ viewport width + 1.
3. `.aptus-app` computed `grid-template-columns` is **not** a single fixed
   pixel value (which would mean the blowout returned).

Run via `pnpm test:responsive`.

### Stylelint guard

`.stylelintrc.json` forbids any layout container declaring:

- `grid-template-columns` made entirely of px values (e.g. `64px 1280px`)
- `width: 1234px` (4-digit pixel widths)

Run via `pnpm lint:css`. Add to CI for prevention.

## Migration history

### 2026-05-01 — CSS Grid min-content blowout fix

- Updated: `src/components/aptus/AptusShell.tsx` (outer + inner grid use
  `minmax(0, 1fr)`; off-canvas mobile sidebar with hamburger toggle + body-
  scroll lock + auto-close on route change)
- Updated: `src/components/aptus/AptusTopbar.tsx` (hamburger button at
  `.a-menu-toggle`, `.a-search` flexes 1 1 auto + collapses ≤640px,
  `.a-actions` group)
- New: `src/styles/aptus-responsive-guards.css` (4 global guard rules at
  zero specificity)
- Updated: `src/app/globals.css` (imports the guards file; `.a-topbar` flex
  + min-width:0; `.a-shell-body` uses `minmax(0,1fr)`; off-canvas sidebar
  CSS at `≤768px`; layout containment rules for `main`/`section`/`table`/
  `pre`/`code`)
- Updated: `src/components/profile/CompanyProfileForm.tsx` (`min-w-0` on
  the two-column grid + each section card)
- New: `tests/e2e/responsive/responsive-shell.spec.ts` (regression suite)
- New: `.stylelintrc.json` + `pnpm lint:css` script + `pnpm test:responsive`
  script

### 2026-04-30 — GatedButton + cursor a11y

The audit + cleanup shipped on 2026-04-30. Files touched:

- New: `src/components/ui/gated-button.tsx` (primitive)
- New: `docs/design/clickable-elements.md` (this file)
- Updated: `src/app/globals.css` (cursor rule)
- Updated: `src/components/profile/CompanyProfileForm.tsx` (lifted state,
  GatedButton with smart-scroll-to-incomplete-section helper)
- Updated: `src/components/templates/{Use,Create,CoreEdge}Dialog.tsx`,
  `src/components/admin/{InviteUser,AdminUsers}Client.tsx`,
  `src/components/workshop/WorkshopScheduleDialog.tsx`,
  `src/components/report/ReportClient.tsx` (silent-CTA fixes via
  GatedButton)
- Updated: `src/app/(auth)/login/page.tsx`,
  `src/components/assessment/NewAssessmentForm.tsx` (removed redundant
  `aria-disabled` on already-`disabled` `<Button>` — converted the latter
  to `<GatedButton>` since validation is user-resolvable)
