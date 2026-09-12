# PR-3 — the living reference at `/coreedge/design-system`

One route, and the first CoreEdge screen in the repo. **Living** means every
specimen is rendered by the real component from the real vocabulary: nothing here
is a screenshot, a hand-written chip, or a list of status names typed a second
time.

---

## 1 · Why "living" is a property worth testing

A design system that disagrees with the product is **worse than not having one**,
because people trust it: they read the page, build to it, and ship something that
does not match. That drift is rarely malice — it is arithmetic. Someone adds a
nineteenth status, and the page still shows eighteen because listing them was a
manual act.

So the page **derives** every section — it maps `LANE_STATUSES`, `GATE_TOKENS`,
`LANE_HOPS`, `APP_STATUSES`, `STATUS_LITERAL_MAP`, `DISABLED_REASONS` and
`WHY_CASE_HOP` — and `tests/unit/coreedge/design-system.test.tsx` asserts that it
still does. Two halves, because either alone can be quietly wrong:

- **It still iterates.** A test per source, failing if an iteration is replaced by
  a convenient hand-written list.
- **It still hard-codes nothing.** Every one of the eighteen labels is checked
  *not* to appear as a string literal in the page. A literal `"No access"` typed
  into the reference is a second source of truth for the one thing this console
  most needs a single source of truth for.
- **The derivation reaches the DOM.** An iteration over the right array that
  renders nothing is the other way to pass while being useless, so the render
  assertions confirm all eighteen statuses, every glyph, every hop label, every
  disabled reason and every Why? case actually appear.

## 2 · The route group

`src/app/(coreedge)/layout.tsx` — the first `/coreedge/*` route in the repo. Two
gates that work differently **on purpose**:

| Condition | Behaviour |
|---|---|
| No session | **Redirect.** There is nothing to render for someone not signed in. |
| Signed in, "wrong" role | **Render anyway.** |

`(studio)` and `(operations)` both swap in a `RoleGatedEmptyState` for the wrong
role. CoreEdge does not, and that is the rule the whole console is built around:
a person who cannot approve access still needs to see that the request exists,
what state it is in, and who can act on it. Bouncing them leaves them unable to
discover the screen or who to ask — and *"Ask in #coreedge-support"* becomes the
only route to learning the product has a Requests page.

`.coreedge` is applied **here, once, on the group**, which is what makes PR-1's
scoped token layer reach every CoreEdge surface and nothing else.

### ⚠️ One divergence from the brief, stated

The brief marks this page **"(consultant + platform_admin)"**. PR-4's rule for the
same namespace is that *"every /coreedge route renders for every signed-in user."*
Those are in tension.

**Implemented as: everyone signed in can read it; consultant and platform_admin
are who it is written for and who get it in their rail.** Reasons:

- The never-redirect rule is stated as an absolute for the namespace, and the
  parenthetical reads as an audience rather than a gate.
- There is nothing here to protect. The page renders no customer data, no keys
  and no tenant state — only the console's own vocabulary.
- Redirecting the others would mean the first CoreEdge route shipped contradicts
  the rule every later route must follow.

If the parenthetical was meant as a hard gate, this is a one-line change in the
page and a line in the test — but it would be the only `/coreedge` route that
redirects, and that seemed worth surfacing rather than deciding quietly.

## 3 · The route-group gating test, answered properly

Creating `(coreedge)` made `tests/unit/routing/route-group-gating.test.ts` demand
an access decision — which is exactly what it exists for. It is now classified
**SESSION**, with the reasoning recorded inline: its layout resolves a user and
redirects when there is none, which is precisely what that bucket means. The role
behaviour is a separate decision and is asserted in the CoreEdge tests.

This is the second time that test has done its job in this work. The first was in
PR-1, when the lint rule's fixtures created a real route group on disk.

## 4 · The route would have shipped unreachable

`tests/unit/routing/workbench-paths.test.ts` failed on the full run:

> *These (coreedge) pages exist but the middleware redirects them away:*
> `/coreedge/design-system`

The middleware redirects anything absent from `WORKBENCH_PATHS` **before the
route runs — before auth, before RBAC**. The page was complete, tested and
building, and sat behind a locked door.

That file's own header is the reason this matters:

> *"CoreEdge Console shipped across nineteen PRs and was unreachable in
> production the whole time, because `/studio` was missing here… **IT THEN
> HAPPENED AGAIN.** Operations Center and Control Tower shipped with route
> groups, layouts, RBAC and passing tests — and redirected to /workbench in
> production, because they were not added here either. The warning above was
> already written at the time."*

`/coreedge` is the **fifth** surface to need that line, and the first caught by
the test rather than by production. Added with the reasoning inline, and with one
thing recorded for later: the prefix covers every later `/coreedge/*` route, but
**not** the tokenised `/claim/:token` surface, which needs its own entry when PR-4
adds it.

## 5 · The axe scan — and the bug it found

`tests/e2e/accessibility.coreedge.auth.spec.ts`, wired into `test:a11y` **and**
`test:e2e:smoke`, which CI runs.

**It does not disable `color-contrast`.** Every other authenticated scan in that
folder carries `.disableRules(["color-contrast"])` with the note *"Allow minor
contrast issues in initial pass"* — a reasonable concession for palettes that
predate any contrast budget. CoreEdge has no such excuse: PR-1 computed every
ratio in the token scope and pinned them. Those are arithmetic on declared values;
this is the same claim measured on rendered pixels. **If the two ever disagree,
one of them is wrong about what the page does.**

### ⚠️ Two things went wrong, and both were worth catching

**The filename was load-bearing.** `playwright.config.ts` selects specs per
project by filename suffix — `authenticated` is `testMatch: /.*\.auth\.spec\.ts/`.
The spec was first written as `accessibility.coreedge.spec.ts`, which matches **no
project**: listing it in the npm scripts would have added a test that never ran
and never said so. Renamed to `accessibility.coreedge.auth.spec.ts`, and verified
with `--list` that all three tests are actually collected.

**The scan found a real contrast bug in PR-2's `Rail.tsx`** — the whole reason for
running it rather than wiring it up and pushing:

> `color-contrast` (serious): **1.57:1**, foreground `#4A4A4A` on background
> `#002B5C`. Expected 4.5:1.

The rail is the one surface A2 keeps navy in both themes, so the inks that serve
the page are wrong on it. `Rail.tsx` used `text-ink` and `text-ink-soft`
(`#1A1A1A` at 1.75:1, `#4A4A4A` at 1.57:1). **A2 already declares `--ink-on-navy`
and `--ink-on-navy-muted` for exactly this**, and both ship in the token scope —
the component simply did not use them. Every label in the desktop rail and the
phone tab bar was affected.

It failed in **light only**. Dark was correct all along, because `--ink-primary`
is already a light value there. A component reviewed in dark, or checked by
reading which tokens it names, looks right in both cases — which is why the token
arithmetic in PR-1 could not have caught it and a rendered scan could.

Fixed on PR-2's branch so that PR doesn't ship the bug, with a regression test
pinning it. Failure reproduced, fix applied, same scan confirmed passing in both
themes.

### What the scan cannot do

Stated so nobody reads more into a green run than it earns: axe measures what it
can compute. It cannot judge whether a disabled control's reason is a **useful**
sentence, only that it is associated. The unit tests carry that half.

## 6 · Verifying it locally at all

The e2e suite needs Postgres, a seeded DB, a dev server and stored auth state.
Rather than push an untested spec into CI's E2E Smoke gate, a local PostgreSQL 16
was stood up, the schema pushed, and the spec run for real. Four things had to be
solved, all local-only and none committed:

| Problem | Cause |
|---|---|
| `DIRECT_DATABASE_URL` not found | Prisma reads `.env`, not `.env.local` — passed inline instead. `.env*` is gitignored, so nothing local reaches the commit. |
| Browser missing | The container ships Chromium build 1194; `@playwright/test` 1.58.2 wants 1208. Overridden via `executablePath` in a scratchpad config. |
| `webServer` exit 1 | `webServer.cwd` defaults to the **config file's** directory — the scratchpad, which has no `package.json`. |
| Relative paths unresolved | `globalSetup`/`globalTeardown`/`testDir` resolve against the config file too. |

## 7 · The page's own accessibility

Caught by its own test and fixed in the page, not the test: **two of the three
tables had no `<caption>`.** The `OpsTable` specimen had one because the component
requires it; the two hand-written vocabulary tables did not.

Also asserted: one `h1` with no skipped heading level, `scope="col"` on every
column header, every blocked control still focusable with its reason reachable by
`aria-describedby` and no `title`, and **no whole key anywhere on the page** —
`MaskedKey` cannot render one, but a page can always paste one in as sample text,
which is how real keys end up in documentation.

### One vacuous assertion, found and replaced

The first version of the hop test compared a length to `>= 0` — true of every
array — against a regex that was empty for five of the six hops. **It would have
passed on a page with no hops at all.** It now checks each hop's own wording from
`HOP_LABELS`.

---

## Files

| Added | |
|---|---|
| `src/app/(coreedge)/layout.tsx` | The route group: session gate only |
| `src/app/(coreedge)/coreedge/design-system/page.tsx` | The route |
| `src/app/(coreedge)/coreedge/design-system/DesignSystemClient.tsx` | Every specimen, derived |
| `tests/unit/coreedge/design-system.test.tsx` | 20 assertions |
| `tests/e2e/accessibility.coreedge.auth.spec.ts` | axe, both themes, contrast enabled |
| `docs/coreedge/design/PR-3-DESIGN-SYSTEM.md` | This file |

| Changed | |
|---|---|
| `package.json` | The axe spec joins `test:a11y` and `test:e2e:smoke` |
| `tests/unit/routing/route-group-gating.test.ts` | `(coreedge)` classified SESSION, with reasoning |
| `tests/unit/coreedge/components.test.ts` | Cross-import guard allows the CoreEdge namespace |
| `tests/unit/coreedge/no-raw-literals-lint.test.ts` | Asserts no fixture dirs, not that a route group is absent |
| `src/lib/routing/workbench-paths.ts` | `/coreedge` added — without it the route is unreachable |

## Still open

**`--border-strong` in light is 1.84:1 on `--surface-paper`** — below the 3:1
non-text floor. Still pinned by PR-1's test, still needs a product-owner decision.
Note that axe did **not** flag it: `color-contrast` checks text, and this is a
border. The arithmetic test is what holds that one.
