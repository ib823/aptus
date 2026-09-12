# PR-2 — the CoreEdge component library

Fourteen components, one status vocabulary, one copy deck. Nothing bespoke to a
screen, and no screen yet — those are PR-4.

---

## 1 · `src/lib/coreedge/status-vocabulary.ts` — the only status mapping

The audit found **87 distinct status literals** across at least four spelling
conventions, mapped to colour in **nine different components**. A lane's status is
the most consequential thing this console says, and it was being decided nine
times.

Everything resolves through this file. Its test fails when an 88th literal
appears and nobody says what it is.

### The eighteen, and what they cost

Eighteen statuses, five tokens. The handoff's rule for why there are this many:
*"A status earns its own wording only when it changes who fixes it — that is why
401 and 403 are separate, and why System off is not SAP unavailable."* So `owner`
is load-bearing, not annotation.

**There is deliberately no "checking" status.** A lane keeps its last known status
while a re-check runs — the same rule as "loading never blanks a known state". A
test asserts no label is ever `checking`, `loading`, `pending` or `refreshing`.

### A reconciliation the sources forced

A1 and the handoff's WhyTrace entry both name six hops: Key → Access → Binding →
SAP metadata → SAP data read → App. But the handoff's own section 5 table fills
its *Broken hop* column with two labels that are not among them — `Traffic` and
`SAP system` — and files a third status under `Binding` that is plainly the same
hop as the `SAP system` ones. **The handoff carries two vocabularies** and this
file had to pick one.

| Handoff label | Resolved to | Why |
|---|---|---|
| `SAP system` | `binding` | The binding hop *is* "is there exactly one usable SAP system for this environment". All four statuses filed under `SAP system` and `Binding` are that question failing four ways, and share one owner. |
| `Traffic` | `null` | It appears once, on `No data`, whose own row says *"SAP answered and had nothing to return. A success."* Nothing broke, so no hop is named. Recording it would put a failure marker on a lane that worked. |

Every status keeps the handoff's verbatim column value in `handoffHopLabel`, so
the mapping is auditable and nothing is silently discarded.

### Why a third of the 87 map to `null`

Four are environments, four are operations, three are trigger kinds, five are
audit action names, seven are assessment sign-off states from presales, and nine
are **severity words** (`good`, `bad`, `critical`, `minor`) that encode a colour
rather than a condition. Forcing `SANDBOX` or `cron` onto one of the eighteen
would print a false claim on a chip.

`null` means *"this never becomes a lane chip"* — a mapping decision, not a
missing one — and the test holds it to the same standard as any other answer: it
must explain itself in a note. `undefined`, returned for a literal the file has
never heard of, is a different answer and callers can tell them apart.

The severity words deserve their own note, because they are the habit this file
exists to end: the old console decided colour from a severity word passed down by
a caller. The new one derives colour from the status via its token, so a severity
word has nowhere to go and nothing to say.

### ⚠ Two findings, pinned as tests

**Seven of the eighteen have no backend literal behind them.** `bindingRefused`,
`circuitOpen`, `noKey`, `noSapSystem`, `rateLimited`, `secretUnreadable`,
`systemOff` — every one is a PR-5 capability. Until those land, those chips can
only be shown from fixtures. The test names all seven and fails when the set
changes, so closing the gap forces someone to update the story.

**Six literals the eighteen cannot express.** Three domains spell a 404 and one
spells a business-rule write rejection:

| Literal | Why no chip fits |
|---|---|
| `NOT_FOUND` (catalogue badge, connection health, read, write) | A 404 on the dataset. The nearest chip, `SAP refused`, is explicitly a 403 — it would send the user to their SAP admin over something a different dataset would fix. **A6 already has the copy** (*"{dataset} doesn't exist on {system}"*, owner Builder, action *Choose another dataset*) — the words exist and the status does not. |
| `DEPRECATED` (interface) | A5 gives the refusal copy (*"Feed retired"*) but no chip. The nearest, `No access`, says *"No approved access for this feed in this environment"* and its action is *Request access* — sending the user to a reviewer who cannot help, for a feed that is gone. |
| `REJECTED (write)` | SAP accepted the call and refused the **content**. Not an authorisation failure. `SAP refused` would send the user to their SAP admin to fix a payload their own app sent. |

Each needs a design decision. None was guessed at.

### One invention, flagged

`status-expired` is a real A2 token but **not one of the five gate tokens**, and no
glyph is specified for it anywhere in the bundle. Since "every status carries a
glyph" is a contract, an app chip could not ship without one. **`✕` is the
choice** — a retired app's calls are refused outright, so the chip makes the same
hard-stop claim `gate-bad` makes. The alternative considered was `–` (gate-off's
"nothing here"), which understates it: a retired app is not dormant, it actively
refuses. The type was widened rather than the value cast, so the distinction
survives.

### DECISION D3, as settled

Restricted is an **app** status and never a nineteenth lane status. It renders once
at app level as *"Restricted · no new access"*, gate-wait, owner platform admin.
Existing lanes keep serving and keep their own statuses.

This diverges from A5, which labels RESTRICTED *"Needs an owner"*. The divergence
is deliberate and settled: "Needs an owner" describes the cause, "no new access"
describes the consequence, and the consequence is what the reader has to act on.
A5's row is left intact so the two can be compared.

`AppStatusChip` is a separate component rather than a variant, because a shared
component with a union prop is how that distinction gets lost in six months.

---

## 2 · `src/lib/coreedge/copy.ts` — the only source of user-facing strings

The audit found **57 user-facing message strings** written inline across
components, several saying the same thing in different words and a few
contradicting each other. Copy next to markup gets edited by whoever is touching
the markup.

**The test is a transcription check, not a restatement.** It reads
`A6-CoreEdge-Copy-Deck.md` from disk and asserts every button, toast, disabled
reason, empty state, confirmation, Why? headline and Why? body appears in it
verbatim. Editing a string fails with the key and the offending text named.
Verified non-vacuous: changing *"Collect key"* to *"Get key"* fails the run.

Three things the deck forced:

- **Counted sentences are functions, not constants.** *"All 11 lanes are live"* and
  *"4 lanes use this system and will stop reading: …"* cannot be constants without
  the count becoming a lie. The deactivation dialog **lists the lanes by name**,
  because "4 lanes" is a number and "Purchase orders · Test" is a consequence.
- **Placeholders degrade to a vaguer true sentence, never to `undefined`.** A Why?
  trace is shown at the moment something broke — exactly when a value is most
  likely missing. A test renders every case with no facts at all and asserts no
  `undefined`, no `NaN`, no stray `{`.
- **The Why? cases are keyed by case, not by hop.** Two of A6's rows share a hop
  and differ in owner and action (Access vs Access-expired, Binding vs
  Binding-ambiguous). Keying on the hop would lose exactly the distinction the
  table was drawn to make.

### Copy that must not ship

The build brief: items 4 and 9 *"are referenced in shipped copy: until they exist,
that copy must not ship."* `COPY_BLOCKED_ON_BACKEND` **names** those phrases rather
than writing them, and a test greps `src/` and fails if any appears:

- *"Key ready · link expired"* / *"Send a new link"* — the one-time claim link. The
  shown-once guarantee rests on the key not existing before the link is opened.
  Claiming it over a key minted earlier makes a UI convention read as a guarantee.
- *"coreedge pull"* — the CLI, offered as an equal path in Home, the claim screen
  and the key rows. Shipping the link alone makes every "or" in that copy false.

---

## 3 · The fourteen components

`StatusChip` · `GateStrip` · `LaneCard` · `NeedsYouRow` · `CheckList` ·
`DecisionBar` · `FieldPicker` · `MaskedKey` · `WhyTrace` · `OpsTable` ·
`ConfirmDialog` · `Rail` · `CommandBar` · `SkeletonRow`

The contracts are checked at **source level, against every file in the folder** —
because a contract only one component honours is not a contract.

### Every status carries a glyph

`StatusChip` has no prop to turn the glyph off and no prop to override the label;
tests assert both absences. The status *is* the label, so two screens cannot call
one condition two things.

The glyph hangs off the **token**, not off the status, so it cannot be omitted for
one status and not another. PR-1 measured why this is a contract: in dark mode the
fifteen pairwise contrasts between the six status grounds sit between 1.01:1 and
1.10:1. Colour alone does not distinguish them — for anyone.

### Disabled controls keep their reason and their tab stop

Both rules live in `src/lib/coreedge/disabled.ts`, and the three components with
disabled states route through it:

1. **The reason is a sibling string, never a `title`.** A tooltip is unreachable by
   touch and keyboard and is not reliably announced. The existing console does
   exactly this — `components/sap/capability/StatusBadge.tsx` carries every
   explanation in a `tip` prop — which is why it is written down rather than
   assumed.
2. **`aria-disabled`, never `disabled`.** The `disabled` attribute removes the
   element from the tab order, so a keyboard user tabs past the thing they cannot
   use and never learns why or who to ask. The click is refused in the handler.

Tests scan every file for a bare `disabled=` and for any `title=`, with comments
stripped first so prose describing a rule is not mistaken for breaking it.

### MaskedKey renders a reference, never a key

There is no `full` prop, no `reveal` prop, and no code path that renders a whole
key. `value` is typed as the two halves — prefix and tail — so **a caller cannot
hand it a secret even by mistake, because the type has nowhere to put one.**

The one-time reveal, where the key really is shown once at creation, is a different
surface with a different guarantee behind it (PR-5 item 4) and is deliberately not
this component. Keeping them apart is what lets this one be audited by reading its
props.

### Loading never blanks a known state

`KeepLastKnown` renders the last known value, dimmed and `aria-busy`, while a
refresh is in flight. The skeleton is reached only when there is genuinely nothing
to show. `SkeletonRow` is for what has **never** loaded — the handoff: *"skeletons
appear only where nothing has ever loaded."*

`OpsTable` keeps **empty and loading apart**. "No lanes match this filter" is a fact
about the filter; a skeleton is a fact about us. Collapsing them is how an operator
concludes the estate is empty during an outage.

### Optimistic updates, all three of them

Permitted for rail badge counts, flow step position, and text the user typed —
never a lane status, key, approval or revocation. A test asserts `useOptimistic`
appears in **exactly one file** (`Rail.tsx`) and never in `StatusChip`, `LaneCard`,
`MaskedKey`, `DecisionBar` or `ConfirmDialog`.

The distinction is that a badge count off by one is a cosmetic error that corrects
itself; a lane status off by one is a lie about the system.

### The two name collisions

`OpsTable` also exists at `components/ops/OpsChrome.tsx:291`, and `ConfirmDialog`
at `components/shared/ConfirmDialog.tsx`. The brief chose to keep the new ones in
this folder rather than rename either, so the safety comes from **neither side
importing the other** — asserted in both directions.

The guard checks import statements, not the bare string: its first version flagged
`lib/coreedge/disabled.ts` for naming the folder in a doc comment, and a test that
punishes the comments explaining a rule is the wrong test.

### Role gating never removes a place

`Rail` renders all six places for everyone; only the actions change, each disabled
one carrying its reason. A test asserts there is no `places.filter`, `canSee`,
`hasRole`, `visibleFor` or `permitted` anywhere in it. A rail that hides what you
cannot do leaves you unable to find out that it exists, or who to ask.

---

## 4 · Two small things PR-1 left for PR-2

- **`@keyframes coreedge-skeleton`** added to `src/app/coreedge-tokens.css` —
  keyframes cannot live inside a selector block, so the one animation the console
  uses sits beside the token that times it. It animates **opacity**, not a colour,
  so the pulse cannot fall out of step with the theme.
- **PR-1's lint rule was exercised for the first time on real component code** and
  caught a `w-[220px]` in `Rail.tsx`. A `--rail-width: 220px` token already
  existed. Verified live: a hex and a px literal injected into `StatusChip.tsx`
  produce two errors, each naming where the right value lives.

## 5 · Still open from PR-1

**`--border-strong` in light is 1.84:1 on `--surface-paper`**, below the 3:1
non-text floor the dark value was raised to clear. `FieldPicker` and `MaskedKey`
both use it for their input edges, as the handoff specifies. The value is
unchanged and still pinned by PR-1's test — **this needs a product-owner
decision.**

---

## Files

| Added | |
|---|---|
| `src/lib/coreedge/status-vocabulary.ts` | The eighteen, the six hops, the 87 literals |
| `src/lib/coreedge/copy.ts` | Every user-facing string, from A6 |
| `src/lib/coreedge/disabled.ts` | The disabled-control contract |
| `src/components/coreedge/*.tsx` | The fourteen components |
| `tests/unit/coreedge/status-vocabulary.test.ts` | 27 assertions |
| `tests/unit/coreedge/copy.test.ts` | 26 assertions |
| `tests/unit/coreedge/components.test.ts` | 21 assertions |
| `docs/coreedge/design/PR-2-COMPONENTS.md` | This file |

| Changed | |
|---|---|
| `src/app/coreedge-tokens.css` | `@keyframes coreedge-skeleton` |

No route, screen or schema is touched.
