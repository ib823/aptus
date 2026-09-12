# CoreEdge — design brief for the Lanes redesign

Version 1 · 11 Sep 2026 · Owner: Ikmal Baharudin, ABeam Consulting Malaysia

## 1. What CoreEdge is

CoreEdge is ABeam's governed broker between client apps and a client's SAP S/4HANA Cloud.

- A client app calls the **CoreEdge API** with its own key.
- CoreEdge calls SAP with a stored communication user, so the app never sees SAP credentials.
- Every call is checked against an approved access record for that exact data and environment, and is audited.

The engine works: the checks, the environment binding, the audit trail and the sealed secrets all hold up. **The interface does not.** Getting one working read takes 6 screens, 3 account switches and 4 rules nobody is told about. The same state is also worded differently on different screens.

## 2. Who we are designing for (in priority order)

| Role | What they are trying to do | Their home screen |
|---|---|---|
| **Builder**: an ABeam consultant building a client app | "Get me this client's purchase orders in my app today." | Home: Needs you + My apps |
| **Reviewer**: another ABeam consultant or lead who approves access | "Let me decide safely in one minute, with evidence." | Requests |
| **Operator**: CoreEdge support | "Show me what's breaking, for which client, and who to tell." | Operations board |
| **Platform admin**: connects each client's SAP systems | "Keep SAP systems connected, healthy and rotated." | SAP systems |

A person can hold more than one role. Segregation of duties is a hard rule: the person who requested access can't approve it, and an app's owner can't approve their own app's access.

## 3. The core idea: lanes

> An **app** has **data feeds**. Each data feed has one **lane** per **environment** (Sandbox · Dev · Test · Prod).
> A lane has four **gates**, always in this order: **A**ccess · **S**AP system · **K**ey · **T**raffic.

- The environment belongs to the lane, not to each object separately. So access, key and SAP system can never disagree, and this whole class of error disappears by construction.
- Each gate is either proven (with its age), waiting, broken (naming its owner and the fix), or not started.
- A lane moves right with **Promote**. That opens an access review, pre-filled and with automatic checks, for the next environment.

## 4. Information architecture: six places

1. **Home**: a "Needs you" queue (reviews, keys to collect, failing lanes, expiring access) plus My apps, each shown as a strip of four environment gates.
2. **Apps**: the app page is a **lane board**, a grid of feeds × environments. Selecting a cell opens the lane panel: its gates, Try it, Download SDK, Timeline, Promote.
3. **Catalogue**: find SAP data in plain words, see where it is proven, and add it to an app as a feed. Pick fields from `$metadata`.
4. **Requests**: access reviews with checks, the change being requested, requester, expiry and history.
5. **SAP systems**: connections per environment, with separate metadata and data-read checks, and which lanes depend on each system.
6. **Operations**: one board of every lane across clients, sorted by what needs a human, with drill-downs into traffic, keys, audit and writes.

Today's 26 screens map onto these six. The mapping is in the Screens sheet of A10.

## 5. Vocabulary: use these words in the UI

| Say | Instead of (today) |
|---|---|
| App | Solution |
| Data feed | Interface / capability / catalogue service |
| Dataset *(in details only)* | Entity set |
| Access | Grant / API access |
| Key | Credential / client token |
| SAP system | Connection / tenant |
| Lane | Environment + binding |
| CoreEdge API | Broker / northbound |
| Try it | Test Console |

SAP identifiers (`CE_PURCHASEORDER_0001`, `A_BankDetail`, `X5M/100`) stay visible in mono type, in a secondary position or a "details" disclosure. Consultants read them fluently; they must never be the only label.

## 6. Design principles (non-negotiable)

1. **Organise around the job, not the table.** Objects only appear inside the job that needs them.
2. **Make mismatches impossible, not explained.**
3. **Everyone starts from "what needs me".** Work arrives; nobody hunts for it.
4. **Proof with its age.** Every status shows what was checked and when, e.g. "data read 200 · 2 m ago". Anything older than its TTL fades to *Unknown*. Metadata-reachable and data-readable are two different facts; never merge them.
5. **Every refusal routes to its fix.** A failed call shows the hop-by-hop trace (Key → Access → Binding → SAP metadata → SAP data read → App), the broken hop, its owner and one action.
6. **Plain words up front, SAP terms one click away.**
7. **Empty is not an error.** "No records" is a success state with its own design.
8. **Red is for irreversible commits only** (revoke, delete, replace key). Status reds use the status tokens, not the CTA red.

## 7. Hard constraints

- Use only the tokens in **A2/A3**. No new colours. If a new token is needed, name it and justify it on the design system page.
- Type: Geist (UI), Geist Mono (identifiers, keys, IDs, numbers in tables), Source Serif 4 (page and section titles only).
- Desktop first at 1440 × 900 with a 220 px navy rail. Every screen also gets a **375 px phone** version: tables become cards and actions stay visible. Every screen also gets a **dark theme** check.
- WCAG 2.2 AA: text contrast ≥ 4.5:1, targets ≥ 32 px, visible focus. Everything clickable is keyboard-reachable, including table rows. Colour never carries meaning alone: pair every chip with an icon or word.
- Keys (`ce_…`) are never shown in full after issue. Show a masked key plus the last 4 characters.
- Controls a role can't use are shown **disabled with a reason** ("A colleague must approve this"), never hidden.
- Times are shown in the viewer's time zone with the zone named. Expiry means end of day in that zone, e.g. "until 10 Dec 2026, 23:59 MYT".

## 8. What exists today (for reference, do not copy)

- `reference-current-design/CoreEdge Developer Studio.dc.html` is the v1 design the current console was built from.
- `reference-current-design/CoreEdge-Studio-Design-Book.html` is the v1 visual language.
- Keep from v1: the navy rail, cream ground, honest-status chips and the mono identifiers.
- Drop: tab-per-table navigation, long explanatory paragraphs above every page, and one generic badge per item.

## 9. Real context to use in every screen

- Client landscape **X5M**. SAP systems: **Development X5M/080** (DEV, reachable, procurement data empty) and **Customizing X5M/100** (TEST, reachable, has purchase orders). There is **no Prod system yet**.
- App **Purchase Order Tracker** (an example name). Feeds: **Purchase orders** (`CE_PURCHASEORDER_0001 / PurchaseOrder`, live in Test with 5 rows) and **Bank details** (`API_BANKDETAIL_SRV / A_BankDetail`). SAP refuses Bank data reads with a 403 on both systems, although metadata returns 200.
- More realistic data (lanes, requests, timeline, ops rows) is in **A7**.

## 9b. Decisions settled 11 Sep 2026 (v1.1 — these close the open questions)

1. **SAP data-read 403**: the **S** gate is bad (owner: client SAP admin); **T** is off. Metadata 200 is still stated in the detail line.
2. **A lane that reads 0 rows**: **T** is `gate-info` — "No data · not an error". Never `gate-bad`, never `gate-off`.
3. **Staleness**: lane checks fade to **Unknown after 24 h**; age is always shown. Catalogue badges fade after **7 days**.
4. **Key collection**: the **claim link is the primary action**; the CLI command is shown as the alternative. A7 updated to match.
5. **"Blocked" is not a lane state.** A lane that can't be promoted yet shows **"Promote →" disabled** with the reason "Promote after Dev works".
6. **The Prod review is designed as Nadia (reviewer)**: Approve is disabled by the failing check only ("There's no Prod SAP system yet…"). Segregation of duties has its own frame (R03). If both apply, reasons stack with **SoD first**.
7. **Client integration passport (X06): out of this round.**
8. **Rail**: all six places are always visible and enabled; individual screens disable *actions* with a reason.
9. **Operations board**: 7 additional rows are added to reach 11 lanes, labelled *example data*.
10. **Focus ring is navy**: new token `--focus-ring-navy` (light `#002B5C`, dark `#8FB4E8`). CTA red remains reserved for irreversible actions.

## 10. Out of scope for this round

- Visual field-mapping canvases.
- Workflow or BPA builders.
- Anything that implies SAP BTP / Integration Suite.
- Marketing pages.
- The write path beyond the reviewer's write checklist (scenario R04).
