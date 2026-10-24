# Slice 1: departmental OPEX budget, end to end

Scope follows the assessed report's first-pilot definition (§20.2): one actuals flow, annual and
monthly planning, one allocation rule, competing edits, requested / recommended / approved values, one
amendment, a controlled release with reconciliation, and the failure cases (failed import, revoked
permission, stale approval, timeout and retry, restart). Everything runs on MY1 with the demo
connector and fake or uploaded data; the same objects later run on-stack with the S/4 connector.

## Requirements covered

| FI-PB | Requirement (short) | Where |
|---|---|---|
| 001, 004, 005 | Budget per cost centre, items per account, account-listing entry | Sheet + line entities, list-style object page |
| 002, 012 | Unlimited narrative per item, comments per line | `narrative` (string) on line |
| 003 | Requested, recommended, approved budget | Requested and recommended columns; approved = immutable snapshot |
| 007 | Progress by department | Progress view by department and status |
| 008 | Approve all requested amounts at once | Mass approve on the sheet list |
| 009 | Access by department / organisation | Planning responsibilities + CDS access control |
| 013 | Monthly spread: straight line or historical, then adjust months | Spread action; edited months kept |
| 014, 035, 047, 048 | Base budget without one-time items; one-time vs permanent; base from prior actuals or prior budget | Seed action on version; `one_time` flag on line |
| 015 | Restrict changes after a point; authority to change | Version lock date; guard |
| 016 | Import offline budgets | Excel upload with staging and row-level rejection |
| 029, 030, 032, 033, 034 | Distributed entry, multi-level approval, amendments with comments and document link, override | Workflow actions; amendment revision with reason and link |
| 031 | Replace budget and show adjustments | Revision comparison (delta per line and period) |
| 049 | See prior year while planning | Prior-year actual and budget columns on lines |

Not in slice 1: positions and workforce (011, 018-019, 023-026), revenue (027), funds availability and
encumbrances (039-046, 050-053: ERP budget control connector), budget book PDF (017), multi-year (020).

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | One budget **sheet per cost centre and version** is the RAP root; its draft is the edit lock | Simulation: department-level drafts blocked ~98.7% of deadline sessions; cost-centre level 2.6-3.0% |
| D2 | **Lines are wide**: one row per account and item with 12 monthly columns for requested and 12 for recommended | Account-listing entry (FI-PB-005) in a Fiori table; periods 13-16 are not planned |
| D3 | **Approved values are an immutable snapshot** written at approval (per sheet and revision) | Approved data never changes in place; amendments create a new revision |
| D4 | Amounts stored as `CURR` with currency key; all arithmetic in minor units through `ZCL_PLN_MONEY` | SAP-standard storage and Fiori formatting; exact engine arithmetic |
| D5 | One planning currency per version in slice 1 | Multi-currency conversion arrives with the rate snapshot in slice 2 |
| D6 | **Planning responsibilities** (user, role, cost-centre range or department) and delegations are application data; CDS access control limits rows to the user's responsibilities | Department-scoped roles change every cycle; the guard needs them as data |
| D7 | All SAP-system access through **connector interfaces**; the implementation is chosen per client in configuration | Same core on MY1 (demo connector) and on-stack (S/4 connector) |
| D8 | Release goes through an **outbox** processed by an application job: idempotency key, sequence fence, scope preflight, receipt, reconciliation | Simulation: naive retry left 10.8% of delta scopes wrong; reorder left 1% of replace scopes wrong |
| D9 | Semantic keys (version + cost centre), no number range | Avoids the number-range buffering issues met in the first app |

## Data model (tables, all client-dependent, package `ZIKMAL_PLAN`)

| Table | Key | Main fields |
|---|---|---|
| `ZPLN_VERSION` | version | fiscal year, fiscal year variant, currency, base source (prior actuals / prior budget), status (open / locked / closed), lock date, hierarchy snapshot id |
| `ZPLN_SHEET` | sheet uuid | version, cost centre, department, status, revision, requested / recommended totals, recommender, approver, approved at, approved hash, editors of this revision, ETag fields |
| `ZPLN_LINE` | line uuid | sheet uuid, G/L account, item text, narrative, one-time flag, spread profile, manual-month mask, requested P01-P12, recommended P01-P12, prior-year actual, prior-year budget |
| `ZPLN_APPROVED` | sheet uuid, revision, line uuid | account, item, approved P01-P12, approved by / at |
| `ZPLN_AMEND` | sheet uuid, revision | reason, document link, one-time or permanent, override flag, requested by / at |
| `ZPLN_RESP` | user, role, scope id | role (preparer, reviewer, approver, admin), cost-centre range or department |
| `ZPLN_DELEG` | from user, to user | role, valid from / to |
| `ZPLN_RELEASE` | release uuid | sheet, revision, scope, payload hash, idempotency key, sequence, status, attempts, receipt, reconciliation result |
| `ZPLN_AUDIT` | event uuid | entity, key, action, user, timestamp, before / after, reason (append only) |
| `ZPLN_IMPORT` / `ZPLN_IMPORT_ROW` | import uuid / row | file, status; row data, validation messages, promoted flag |
| `ZPLN_CONNECTOR` | client role (masterdata, actuals, plan target) | implementation class |
| `ZPLN_DEMO_*` | (demo connector only) | cost centres, hierarchy, accounts, fiscal periods, actuals, simulated plan target with replace semantics and fault switches |

## Business objects and actions

**Version** (`ZPLN_R_VERSION`, managed): create; *seed* (build sheets and lines for every cost centre
in the hierarchy snapshot from prior actuals or prior budget, leaving out one-time items); *lock*,
*close*; *set department total* (allocator `set_node_total`, leaf level, locked sheets kept).

**Sheet** (`ZPLN_R_SHEET`, managed, draft, ETag) with **Line** child:

| Action | Who | Engine rule |
|---|---|---|
| edit requested values | preparer, sheet open | guard `EDIT`; editor recorded for the revision |
| *spread* (line or sheet): straight line or historical, keep edited months | preparer | allocator `spread`; reject below locked total |
| *set sheet total* | preparer | allocator `set_total` over lines, locked lines kept |
| *submit* | preparer | guard `SUBMIT` |
| edit recommended values | reviewer, sheet submitted | reviewer must not be an editor of the revision |
| *recommend* | reviewer | guard `RECOMMEND`; recommendation tied to current requested values |
| *approve* (single and mass) | approver or delegate | guard `APPROVE` on the executing user; writes `ZPLN_APPROVED` snapshot and hash |
| *reject* (with reason) | reviewer or approver | guard `REJECT` |
| *amend* (reason, link, one-time / permanent, override) | preparer or admin | guard `AMEND`; new revision, previous approval untouched |
| *release* | admin / job | guard `RELEASE`; payload hash must equal the approved hash; creates outbox entry |

Feature control and authorization on every action call the same guard, so the UI, uploads, jobs and
direct OData calls follow one rule set. Denials return message class `ZPLN` texts keyed by the guard's
reason codes.

Validations: accounts and cost centre exist in the version's snapshot; monthly values sum to the annual
value; non-negative amounts for expense lines; version not locked (unless authorised).

## Connectors (interfaces in the core)

| Interface | Methods | Demo (MY1) | S/4 on-stack (later) |
|---|---|---|---|
| `ZIF_PLN_MASTERDATA` | cost centres, cost-centre hierarchy, G/L accounts, fiscal periods | `ZPLN_DEMO_*` tables | `I_CostCenter`, `I_CostCenterHierarchyNode`, `I_GLAccountHierarchyNode`, `I_FiscalYearPeriodForVariant` |
| `ZIF_PLN_ACTUALS` | actuals by cost centre, account, year, period | `ZPLN_DEMO_ACT` (generated or uploaded) | `I_GLAccountLineItem` |
| `ZIF_PLN_PLAN_TARGET` | preflight, post (idempotent), status, read back | simulated replace-scope target with fault injection | Financial Plan Data - Write (`API_FINPLANNINGDATA_SRV`) |

A connector **contract test suite** runs the same ABAP Unit checks against every implementation.

## Applications (Fiori elements, OData V4)

1. Budget sheets: list report (filters by version, department, status; mass approve) and object page
   (lines with 12 months requested / recommended, prior year, narrative, actions).
2. Versions: create, seed, lock, department totals, progress by department.
3. Responsibilities and delegations (admin).
4. Releases: outbox monitor with receipts and reconciliation.
5. Imports: upload Excel, see rejected rows, promote.

## Scenario catalogue (end-to-end through OData, plus ABAP Unit)

| Id | Scenario | Expected |
|---|---|---|
| B1 | Seed FY version from prior actuals | One sheet per cost centre; one-time items left out; prior-year columns filled |
| B2 | Seed from prior approved budget | Base equals prior approved snapshot minus one-time items |
| E1 | Enter annual amount, spread straight line | 12 months sum exactly to annual |
| E2 | Spread by historical profile | Months follow prior-year actual pattern; exact sum |
| E3 | Edit one month, re-spread | Edited month kept; others absorb the difference |
| E4 | Spread below the edited months' total | Rejected (below locked total), nothing changed |
| E5 | Set department total with one sheet locked | Change spread over unlocked sheets in proportion; locked sheet unchanged; exact total |
| C1 | Two preparers open the same sheet | Second is blocked by the draft lock; other sheets free |
| C2 | Save with a stale ETag | Refused (412/428) |
| W1 | Submit, reviewer adjusts and recommends, approver approves | Approved snapshot equals recommended values; hash stored |
| W2 | Reviewer who edited requested values tries to recommend | Refused |
| W3 | Approver is the preparer | Refused |
| W4 | Approval delegated to the preparer, preparer approves | Refused (SoD on executing user) |
| W5 | Requested values change after recommendation, then approve | Refused (stale recommendation) |
| W6 | Reject with reason, edit, resubmit | Returned, then submitted; reason recorded |
| W7 | Mass approve all sheets of a department | Each sheet approved or individually refused with reason |
| W8 | Approver role revoked while sheet reviewed | Escalation reported; substitute assignment unblocks |
| W9 | Version locked | Edits refused for preparers |
| A1 | Amend an approved sheet with reason and document link | Revision 2 open; revision 1 snapshot unchanged |
| A2 | Approve revision 2 | Comparison shows adjustments per line and month |
| R1 | Release approved sheet | Target holds approved values; reconciliation green |
| R2 | Timeout after the target committed, retry | No duplicate (idempotency key); status reconciled |
| R3 | Older release arrives after a newer one | Refused by the sequence fence |
| R4 | Release scope wider than payload | Preflight blocks it; target unchanged |
| R5 | Values changed after approval, then release | Refused (payload hash differs) |
| I1 | Upload Excel with one bad account | Bad row rejected with message; nothing promoted until fixed |
| S1 | Preparer of department A reads department B | No rows returned |
| S2 | Permission revoked while a release is queued | Job rechecks and refuses |
| P1 | Progress by department | Counts by status match sheets |

Each scenario is also an ABAP Unit test at the guard / engine level where possible; the end-to-end run
uses the OData service exactly as the Fiori apps do.

## Build increments

1. **Foundation:** tables, connector interfaces, demo connector and demo data generator, version BO with
   seeding. Scenarios B1-B2.
2. **Entry:** sheet and line BO with draft, totals, spreading, set totals, validations, sheet app.
   Scenarios E1-E5, C1-C2, I1.
3. **Approval:** workflow actions through the guard, responsibilities, delegation, escalation, access
   control, mass approve. Scenarios W1-W9, S1, P1.
4. **Amend and release:** revisions, comparison, outbox, job, simulated target, reconciliation.
   Scenarios A1-A2, R1-R5, S2.

After each increment: ABAP Unit, end-to-end scenarios, ATC, release gate, screenshots.
