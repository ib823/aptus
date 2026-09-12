# PR-4 — the five screens

The five the bundle calls *"the screens the console turns on"*, in its order, plus
the derivation everything on them resolves through.

| | Screen | Route |
|---|---|---|
| a | Home — *"Work arrives. Nobody hunts for it."* | `/coreedge` |
| b | App › lane board — *"Feeds × environments. One cell is one lane."* | `/coreedge/apps/:app` |
| c | Requests › review — *"Ikmal raised this, so he can't approve it."* | `/coreedge/requests[/:id]` |
| d | Lane › Why? — *"The refusal routes to its fix."* | `/coreedge/apps/:app/:feed/:env` |
| e | Operations board — *"Every lane across clients."* | `/coreedge/operations` |

The brief names PR-4's screens "a–e" without listing them. Rather than guess, the
set was taken from `CoreEdge Core Screens.dc.html`, which is titled *"The five
screens the console turns on"* and numbers them 01–05.

---

## 1 · A lane is derived, never stored

`src/lib/coreedge/lanes.ts`. A lane is one app × one data feed × one
environment, and it is **not a table and must never become one**: every fact it
reports already lives in a `SolutionClient`, an `ApiAccessGrant`, a
`SapConnection` or a probe row. A lane record would be a cached opinion about
those — wrong the moment any of them changes, and confidently wrong, which is the
bad kind.

**The first failing hop decides.** Key → Access → Binding → SAP metadata → SAP
data read → App. Nothing below a failed hop is consulted, because nothing below
it was attempted: a lane with no key *and* no SAP system is one problem for the
app owner, not two, and reporting the later hop would blame the platform admin
for a call that never left the building.

**Access is checked before Key**, even though Key is the first hop a *call*
travels. "No key" means access is approved and none was collected; showing it to
someone with no approval sends them to fetch something they cannot be given.

### ⚠️ Live is deliberately hard to reach

**A green metadata probe does not make a lane Live.** Reachable and readable are
different claims, and conflating them is exactly what the old console did — a 403
on the entity set is the most common failure in this system. Without a proven
read inside 24 hours the honest answer is `Unknown`, whose own definition is *"a
claim about us, not the lane."*

The largest group of assertions in `lanes.test.ts` is about the ways a lane must
**refuse** to claim Live.

### What it will not produce

`rateLimited`, `circuitOpen` and `systemOff` need capabilities PR-5 adds. This
file could fake them from adjacent data and must not: a chip claiming rate
limiting is enforced, where it is not, is a promise about where a call stopped
that nothing keeps. A test asserts they never appear.

## 2 · Reading real rows

`src/lib/coreedge/queries.ts`, `server-only`.

- **Every query is scoped to the session's organization** — never to a URL
  segment, query string or header. A test asserts no screen reads a tenant from
  params.
- **Free-text environments are parsed, never compared raw.** `environment` is a
  free-text column on `SapConnection`, `SolutionClient` and `ApiAccessGrant`,
  written by different code paths over time. `"prod"` and `"PROD"` being two
  environments is how a lane silently matches nothing. A value nobody can name
  parses to `null` and is counted under no lane — it cannot support a claim about
  one.
- **The most recent grant decides.** Grants accumulate; a renewal is a new row.
  An older `REVOKED` beside a newer `APPROVED` must not make a lane look dead.
- **The cartesian product is the point.** Every app × feed × four environments,
  including cells nothing has happened in. That is what makes `Not started` a
  status and what lets the board show promotion at a glance.

### ⚠️ Why most lanes will read Unknown today

No probe or read evidence is joined into the board query, **deliberately**. The
probe table is per-connection, not per-lane, and there is no per-lane read ledger
at all — so a board-wide Live would be inferred from a connection-level green,
which is precisely the reachable-means-readable overclaim the model exists to
prevent.

Operations says so in words rather than letting the board read as measured fact:

> *N of M lanes have no proven read behind them. Reachable is not the same as
> readable, so those read Unknown rather than Live.*

The per-lane read ledger is PR-5's.

## 3 · Role gating never redirects

`(coreedge)/layout.tsx` redirects an anonymous caller and **nobody else**. Every
`/coreedge` route renders for every signed-in user; only the actions change, each
disabled one carrying its reason.

A test scans every page and layout in the group for `canAccessOperations`,
`isAdminRole`, `RoleGatedEmptyState` and `lacksStudioTenantScope`, and asserts no
`redirect(...)` mentions a role. It covers the screens nobody has written yet,
which is the point.

## 4 · The review screen — the refusal is the feature

*"Ikmal raised this, so he can't be the one to approve it. That separation is the
point of the screen."*

- **The refusal is rendered, not only enforced in the API.** A reviewer shown an
  enabled Approve button who then gets a 403 has been misled by the screen.
- **The button is present, focusable, and carries its reason** — never hidden. A
  hidden button leaves the reader unsure whether they lack a permission or the
  product lacks a feature; a disabled one with its reason answers both.
- **Every check is computed from a real row.** A checklist that says "green"
  without something behind it is decoration. The write-checklist row reads
  *skipped* with a reason rather than passing by default.
- **DECISION D2 in the open:** sandbox-only approval is **absent** from the bar
  rather than present-and-disabled — a control nobody should ever use again is
  not a control. The page says existing grants keep working and render as
  *"Approved for Sandbox (historical)"*.

**This screen does not decide.** Approving, rejecting and requesting changes are
PR-5 capabilities, and each control says so. Wiring a button to nothing would be
worse than a button that explains why it cannot act.

## 5 · Honesty rules carried from the audit

| Rule | Where |
|---|---|
| An absence is a reason, never a blank cell | Operations renders *"None connected"*; the audit found blanks that read as bugs |
| A count counts rows that exist | Every figure computed from the lanes listed; the audit found a page length presented as a total |
| The legend is not optional | A dense table's glyphs do real work; a glyph nobody was told the meaning of is worse than a word |
| Urgency comes from the status's own token | So the sort and the chips cannot disagree |
| Whose problem it is decides how a row reads | A lane waiting on the client's Basis team is not yours to fix, and saying so beats an alarming colour |

## 6 · DECISION D3 where it shows

`Restricted` renders once at app level on the lane board, with the consequence
spelled out: *"Existing lanes keep serving. No new access can be requested or
approved."* The lanes below keep their own statuses. It is not a nineteenth lane
status.

---

## Files

| Added | |
|---|---|
| `src/lib/coreedge/lanes.ts` | The derivation — six hops, pure, testable |
| `src/lib/coreedge/queries.ts` | Tenant-scoped reads |
| `src/app/(coreedge)/coreedge/CoreEdgeShell.tsx` | Rail + tab bar chrome |
| `.../coreedge/page.tsx` | (a) Home |
| `.../coreedge/apps/[app]/page.tsx` | (b) Lane board |
| `.../coreedge/requests/page.tsx` · `[id]/page.tsx` | (c) Requests + review |
| `.../coreedge/apps/[app]/[feed]/[env]/page.tsx` | (d) Why? trace |
| `.../coreedge/operations/page.tsx` | (e) Operations board |
| `tests/unit/coreedge/lanes.test.ts` | 28 assertions |
| `tests/unit/coreedge/screens.test.ts` | 13 assertions |
| `docs/coreedge/design/PR-4-SCREENS.md` | This file |

## Not in this PR, and why

- **`/claim/:token`** — depends on PR-5's one-time claim link. Its copy is in
  `COPY_BLOCKED_ON_BACKEND` and must not ship before the capability: the
  shown-once guarantee rests on the key not existing before the link is opened.
  It also needs its **own** `WORKBENCH_PATHS` entry — the `/coreedge` prefix does
  not cover it.
- **`/apps/:app/add-feed`, `/apps/:app/settings`, `/operations/keys`** — in the
  namespace, not among the five core screens, and not linked from the rail.

## The three rail places that are not built

`/coreedge/catalogue`, `/sap-systems` and `/passport` are in the rail but are not
core screens. They **render** rather than 404, because the handoff's rail rule is
exact: *"all always visible and enabled. A place you cannot act in still opens."*
A rail entry that 404s breaks that rule as surely as one that redirects on role —
the reader cannot tell whether they lack a permission, took a wrong turn, or the
feature does not exist.

Each says plainly that it is not built. None fakes a screen: no rows, no skeleton
implying something is loading, and no chip claiming a status nothing measured. An
empty screen that lies is worse than one that admits it is empty. A test asserts
every rail destination resolves to a page on disk, and that these three contain
neither `StatusChip` nor `SkeletonRow`.

## Still open

**`--border-strong` at 1.84:1 in light**, below the 3:1 non-text floor. Unchanged
and still pinned by PR-1's test.
