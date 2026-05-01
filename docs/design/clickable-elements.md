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

## Companion concern — silent client-side navigation failures

When `router.push(url)` triggers an RSC payload fetch (`?_rsc=...`) and the
server returns 5xx, Next.js App Router rejects the navigation action's
Promise, drains the queue, and **the user sees nothing** — URL doesn't
change, no toast, no console banner. This was traced to intermittent 503s
on RSC requests for auth/DB-touching routes (likely cold-start timeouts or
DB pool exhaustion when 5–8 prefetches fire in parallel on layout mount).

The front end can't fix the 503 source, but it can stop swallowing it.
Two primitives, both shipped 2026-05-01:

### `safePush(router, url)` — `src/lib/navigation/safe-push.ts`

Drop-in replacement for `router.push`. Pre-warms the destination via a
manual `fetch(url, {RSC:'1'})`, falls back to `window.location.href` if
the pre-warm 5xxs, and runs a 1500 ms watchdog that hard-navigates if the
URL hasn't changed (catches cases where the App Router silently fails
despite a healthy server response, e.g. cached error state).

**Use it for any user-initiated navigation:** sidebar links, stepper
buttons, post-save redirects, gated CTAs. Currently wired into
`AptusAssessmentShell` (stepper), `AptusCmdK` (palette commands), and
`CompanyProfileForm` (Continue CTA).

### `<NavigationFailsafe />` — `src/components/layout/NavigationFailsafe.tsx`

Mounted once in the portal layout. Listens for `unhandledrejection` at the
window level, recognises the navigation-failure signature, shows a sonner
toast ("Couldn't load the next page — please retry"), and hard-navigates
to the rejection's target URL when one is present. Catches cases that slip
through `safePush` (third-party prefetch failures, race conditions).

### Authoring rule

For any new navigation call:
- **User-initiated** (button click, form submit) → `safePush(router, url)`,
  not `router.push(url)`.
- **Programmatic / non-blocking** (e.g. post-save redirect that the user
  doesn't directly trigger) → `safePush` with `{ skipPrewarm: true }` is OK.
- **Refresh after mutation** → `router.refresh()` is fine; it's a different
  code path that doesn't hit this trap.

## Migration history

### 2026-05-01 — Navigation resilience + minimal shell fix

After the 2026-04-30 shell rewrite (`eb2c149`) caused a regression where
client-side navigation silently failed in production, root cause was traced
to **intermittent RSC 503s, not the shell change**. The shell rewrite was
reverted (`64fc540`) and replaced with a much smaller, targeted change set:

- New: `src/lib/navigation/safe-push.ts` (RSC pre-warm + watchdog + hard-nav fallback)
- New: `src/components/layout/NavigationFailsafe.tsx` (global unhandled-rejection listener with sonner toast)
- Updated: `src/app/(portal)/layout.tsx` (mounts `<NavigationFailsafe />`)
- Updated: `src/components/aptus/AptusShell.tsx` (re-applied **only** the inline `minmax(0, 1fr)` on outer + inner grids — none of the wrapper-div / off-canvas-sidebar / global-guards / Playwright/stylelint scaffolding from the reverted commit)
- Updated: `src/components/aptus/AptusAssessmentShell.tsx`, `AptusCmdK.tsx`, `src/components/profile/CompanyProfileForm.tsx` (router.push → safePush)
- Updated: `src/components/aptus/AptusSideRail.tsx` (removed phantom `/help` Link that was 404-ing on every prefetch)

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
