# Readiness register

Status of every capability (C01-C80), requirement (FI-PB-001 to 054), gate (G0-G9) and risk (R01-R18)
of the assessed report *Alternative SAC Budget: Feasibility, Premium Scope and Validation Report*
(20 October 2026), and the design changes made since. This is the report's own C80 ("every capability
linked to build, tests, defects and acceptance"). Update it with every increment.

As of 21 October 2026.

## Status codes

| Code | Meaning | Evidence |
|---|---|---|
| **E** | Engine rule built in ABAP and verified on MY1 (real kernel: ABAP Unit passes, ATC clean, release gate passes) | `src/`, CI |
| **M** | Rule decided and verified in a reference model or simulation; not yet in ABAP | `sim/`, `docs/DESIGN-RULES.md` |
| **D** | Designed for slice 1; not built | `docs/SLICE-1-DESIGN.md` |
| **R** | Platform and API facts established; no design yet | `docs/research/`, `docs/ARCHITECTURE.md` |
| **P** | Planned for a later slice; not designed | roadmap below |
| **X** | ERP responsibility (S/4HANA budget control); product integrates, does not replace | |
| **–** | Not started | |

No capability is complete: **E** means the rule at the heart of a capability exists and is proven;
the business object, screens and integration around it are still to be built.

## Summary

| | Engine built and verified (E) | Model-verified (M) | Designed, slice 1 (D) | Researched (R) | ERP (X) | Planned later (P) | Not started | Total |
|---|---|---|---|---|---|---|---|---|
| Capabilities, by most advanced status | 16 | 7 | 16 | 5 | (C64, counted under R) | 11 | 25 | 80 |
| FI-PB requirements, by most advanced status | 6 | – | 19 | – | 12 | 17 | – | 54 |

Built so far is the calculation and control engine (allocation, spreading, top-down, money, workflow
decisions) plus the tooling that keeps it portable and tested. Nothing a business user can open exists
yet: the first business objects and screens are slice 1.

## What exists today

| Item | Where | Verified by |
|---|---|---|
| `ZCL_PLN_ALLOCATOR`: conserving split, set total with locks, spreading with locked months, hierarchy node total, cycle detection | MY1 `ZIKMAL_PLAN`; `src/` | 15 test methods on MY1 incl. 1,800 differential + 400 large-magnitude cases and a 300-case property test |
| `ZCL_PLN_MONEY`: integer minor units, SAP internal CURR format, conversion with rate snapshot and ratio factors, half-away rounding, overflow guard | MY1; `src/` | 11 test methods on MY1 incl. 1,300 differential + 300 large-magnitude cases |
| `ZCL_PLN_WORKFLOW_GUARD`: decision for edit, submit, recommend, approve, reject, release, amend; delegation; SoD on executing user; stale-recommendation check; escalation signal; reason codes | MY1; `src/` | 7 test methods on MY1 incl. 3,270 decisions and 482 escalation states taken from the model-checked workflow |
| `ZCX_PLN_ERROR` | MY1; `src/` | used by all tests |
| Release gate (objects released on BTP, Public, Private 2023 and 2025) | `tools/portability_check.py` | CI on every change; negative control |
| CI: gate, ABAP Cloud and S/4HANA 2023 syntax, reference models, generated-test freshness, ABAP Unit in emulator | `.github/workflows/abap-planning.yml` | green on PR ib823/aptus#309 |
| Reference models and 11 design simulations | `sim/`, `sim/results/` | `tools/check_reference_models.py` |
| Architecture, design rules, slice 1 design, source research | `docs/` | |

Mutation testing: 7 injected defects, all caught.

## Capabilities

### Foundation and planning

| ID | Capability | Status | Detail |
|---|---|---|---|
| C01 | Tenant and client isolation | R | On-stack in each client's S/4 is the default deployment; SAP states multitenant ABAP SaaS isolation is not complete by itself. No negative tests yet |
| C02 | Model/dimension metadata | P | Slice 1 has fixed dimensions (version, cost centre, account, month). Configurable models are a later slice |
| C03 | Member validity and hierarchies | E, D | Cycle detection built. Hierarchy snapshot per version designed. Orphan policy not yet |
| C04 | Fiscal calendars and periods | M, D | 4-4-5, 53-week, April-March and shortened years simulated. Fiscal year variant per version designed (released `I_FiscalYearPeriodForVariant`) |
| C05 | Measures, units and currencies | E | Currency decimals, invalid rates, overflow rejected. Units not started |
| C06 | Sparse fact storage | D | Slice 1 stores wide monthly lines instead of the report's sparse fact table (design change 3). Performance not measured |
| C07 | Actuals import and reconciliation | D, R | Actuals connector designed; demo data on MY1; S/4 source is `I_GLAccountLineItem` |
| C08 | Departmental input grid | D, M | Account lines with 12 months; totals on the server (browser rounding differs on negative ties) |
| C09 | Requested / recommended / approved | E, D | Transitions enforced by the guard; value layers and approved snapshot designed |
| C10 | Private scenarios and shared versions | P | Versions in slice 1; private scenarios later |
| C11 | Annual / monthly / quarterly spread | E, D | Spread with locked months built; quarterly spread not yet |
| C12 | Prior actual / budget seeding | D | Seed action excluding one-time items designed |
| C13 | OPEX and cost-centre planning | D | Slice 1 scope |
| C14 | Revenue quantity / price planning | P | |
| C15 | Position and workforce cost planning | P | |
| C16 | CapEx / project planning | P | |
| C17 | Integrated P&L planning | P | |
| C18 | Balance-sheet planning | P | |
| C19 | Direct / indirect cash planning | P | |
| C20 | Multi-year and rolling forecasts | P | |

### Calculation and intelligence

| ID | Capability | Status | Detail |
|---|---|---|---|
| C21 | Versioned formula registry | P | |
| C22 | Dependency graph and solve order | P | Only hierarchy cycle detection exists |
| C23 | Currency conversion | E | Rate snapshot, ratio factors, leaf-then-sum, half-away rounding. Rate source (`CL_EXCHANGE_RATES`, released everywhere) and multi-currency versions in slice 2 |
| C24 | Unit conversion | – | |
| C25 | Direct and driver allocations | E | Conservation, residuals, locks, zero drivers, negative and mixed-sign drivers rejected |
| C26 | Reciprocal allocations | M | Exact linear solve and closed-loop rejection decided; not in ABAP |
| C27 | Top-down disaggregation | E | Leaf-level single allocation, locked leaves and subtrees kept, infeasible requests rejected |
| C28 | Inverse planning | – | |
| C29 | Cross-model actions | – | |
| C30 | Restartable calculation jobs | D, R | Release job designed; application jobs restart from the interrupted step (SAP) |
| C31 | Value-driver scenario workspace | – | |
| C32 | Deterministic sensitivity | – | |
| C33 | Monte Carlo uncertainty | M | Correlation validation and convergence findings; not built |
| C34 | Stress and reverse-stress tests | – | |
| C35 | Predictive time-series forecast | M, R | HANA predictive libraries not callable from ABAP Cloud today; MASE as metric |
| C36 | Hierarchical forecast reconciliation | M | Reconciliation simulated; not built |
| C37 | Anomaly and data-quality alerts | – | |
| C38 | AI-assisted explanations | R | ABAP AI SDK released on BTP, Public and Private 2025, not Private 2023: optional feature |
| C39 | Optimisation and constraints | – | |
| C40 | Industry economics and planning packs | – | |

### Governance and experience

| ID | Capability | Status | Detail |
|---|---|---|---|
| C41 | Multi-level approvals | E, D | Guard with delegation and escalation built; workflow actions designed (one review and one approval level in slice 1) |
| C42 | Period and data-slice locks | E, D | Locked months and leaves built; version lock date designed; every write path goes through the guard |
| C43 | Segregation of duties | E | Checked on the executing user; model-checked across four role configurations |
| C44 | Line narratives and attachments | D | Narratives designed; attachments later |
| C45 | Immutable approval snapshot | E, D | Guard refuses release when values differ from the approved snapshot; snapshot table and hash designed |
| C46 | Change audit and lineage | D | Append-only audit table designed |
| C47 | Preparation progress and calendar | D | Progress by department designed; calendar process later |
| C48 | Budget amendments and transfers | D | Amendments as revisions designed; transfers later |
| C49 | Budget book and board pack | R | PDF rendering (`CL_FP_ADS_UTIL`) released everywhere; later slice |
| C50 | Variance and comparison reporting | D | Prior-year columns and revision comparison designed; variance reports later |
| C51 | Excel round-trip planning | D, R | Upload with staging designed; `XCO_CP_XLSX` released everywhere; export later |
| C52 | Configurable forms and layouts | – | |
| C53 | Multilingual / localised experience | E | Guard returns reason codes for translatable messages; message class with the slice |
| C54 | Mobile approval experience | – | |
| C55 | Administration and support console | D | Responsibilities and release monitor designed |
| C56 | Entitlements and feature flags | – | |
| C57 | Explainable calculation trace | – | |
| C58 | Scenario comparison and branching | D | Revision comparison designed; branching later |
| C59 | Notifications and escalation | E | Escalation signal built; notifications later |
| C60 | Accessible interaction | – | Fiori elements provides the base; not tested |

### Integration and product operations

| ID | Capability | Status | Detail |
|---|---|---|---|
| C61 | Source adapters and mapping registry | D | Connector interfaces, factory and configuration designed; mapping registry later |
| C62 | Staging and data-quality rules | D | Import staging with row-level rejection designed |
| C63 | ERP plan export | D, R | Plan target connector designed; S/4 API replaces everything inside its scope |
| C64 | ERP budget enforcement | X, R | Budget availability control (cost centre / project), public-sector control and Funds Management mapped by edition; budget-control connector later |
| C65 | Release outbox and deduplication | M, D | Idempotency key, sequence fence, scope preflight simulated and designed |
| C66 | Observability and alerting | – | |
| C67 | Backup, restore and recovery | – | Platform responsibility; rehearsal not started |
| C68 | Configuration packaging | – | |
| C69 | Schema and data migrations | – | |
| C70 | Client onboarding / offboarding | – | |
| C71 | Performance envelope | – | No measurements yet |
| C72 | Release and security lifecycle | E | CI with release gate, syntax checks, model checks, pinned toolchain; ATC on MY1. Dependency scanning not yet |
| C73 | Metering and cost attribution | – | |
| C74 | Self-service model designer | – | |
| C75 | ERP / industry accelerator library | – | |
| C76 | External statistical compute adapter | R | Needed for advanced forecasting while HANA predictive libraries are not callable |
| C77 | Retention and data export | – | |
| C78 | Operational runbooks and service desk | – | |
| C79 | Client-specific regression suite | E, D | Generated suites and model check in CI; connector contract suite designed |
| C80 | Evidence and readiness register | E | This document |

## Requirements (FI-PB-001 to 054)

| ID | Requirement (short) | Status | Where |
|---|---|---|---|
| 001 | Budget at cost-centre level | D | Sheet per cost centre and version |
| 002 | Unlimited narrative printed on budget document | D | Narrative on line; printing with budget book later |
| 003 | Requested, recommended, approved budget | E, D | Guard built; layers designed |
| 004 | Budget items per account | D | Line per account and item |
| 005 | Account-listing entry | D | Line table |
| 006 | Entry by account range or segment | P | Add as list filter in slice 1 or 2 |
| 007 | Progress by department | D | |
| 008 | Approve all requested amounts at once | D | Mass approve |
| 009 | Access by department / organisation | E, D | Guard; responsibilities and access control designed |
| 010 | Department-specific scenarios | P | |
| 011 | Global changes (fringe, merit) | P | Workforce slice |
| 012 | Comments per line | D | |
| 013 | Monthly / quarterly spread with adjustment | E, D | Spread engine built |
| 014 | Base budget without one-time items | D | |
| 015 | Restrict changes after a point; authority | E, D | Guard; version lock date designed |
| 016 | Import offline budgets | D | |
| 017 | Budget book | P | |
| 018 | Position-type benefit fields | P | Workforce slice |
| 019 | Vacant position budgeting | P | Workforce slice |
| 020 | Multiple years concurrently | P | |
| 021 | Periodic projections, actual vs estimate | P | |
| 022 | Scenarios from department assumptions | P | |
| 023 | Transfer positions between departments / funds | P | Workforce slice |
| 024 | Salary and benefit adjustments in forecasts | P | Workforce slice |
| 025 | Projections by merit date | P | Workforce slice |
| 026 | Salary scenarios without touching live data | P | Workforce slice |
| 027 | Distributed revenue estimation | P | |
| 028 | Automated allocations and transfers | E, P | Allocation engine built; transfer actions later |
| 029 | Distributed entry, multi-level approval | E, D | |
| 030 | Extended comments on revision requests | D | Amendment reason |
| 031 | Replace budget, system calculates adjustments | D | Revision comparison |
| 032 | In-year amendments | D | |
| 033 | Amendment link to document / minutes | D | |
| 034 | Override amendments | D | Override flag, guard-controlled |
| 035 | One-time vs permanent adjustment | D | |
| 036 | Change one or more budgets at once | P | Mass change |
| 037 | Commission approval of adjustments | P | Additional approval level |
| 038 | Transfer request attached to a PO | X, P | Budget-control connector |
| 039 | Funds availability check (project, grant, cost centre, department) | X | S/4 budget control |
| 040 | Available budget during PR / PO / JE / invoice entry | X | S/4 budget control (messages and reports) |
| 041 | Transfers between cost centres and divisions | X | S/4 budget control |
| 042 | Overspend rules and tolerances | X | S/4 budget control |
| 043 | Control rules by account | X | S/4 budget control |
| 044 | Warnings at cost centre, grant, project | X | S/4 budget control |
| 045 | Checks on all transactions | X | S/4 budget control |
| 046 | Restrict transfers to / from accounts | X | Not confirmed as native in S/4 |
| 047 | Base from prior-year actuals | D | Seed action |
| 048 | Base from prior-year budget | D | Seed action |
| 049 | Prior year visible while planning | D | Prior-year columns |
| 050 | Encumbrance roll-over with budget | X | S/4 Funds Management |
| 051 | Roll-over shown separately | X | S/4 Funds Management |
| 052 | Liquidate roll-over without adding to current budget | X | S/4 Funds Management |
| 053 | Budget uploaded to ERP and checked at GR / accrual | X, D | Release designed; checks in S/4 |
| 054 | Accruals linked to Single Buyer programme milestones | P | Client extension |

## Gates

| Gate | Report status | Now |
|---|---|---|
| G0 Identity and baseline | Open | Partly closed: repository, build (MY1 `ZIKMAL_PLAN`) and CI exist. Agreed premium / improvement register still missing |
| G1 Business semantics | Proposed | In progress: design rules and slice 1 requirement mapping. Finance-owned golden examples missing |
| G2 Architecture and rights | Open | Partly closed: ABAP Cloud, develop on BTP, deploy on-stack (Public, Private 2023 / 2025), release gate. Licensing, partner and IP review not done |
| G3 Vertical slice | Not executed | Designed; build waiting for approval |
| G4 Engine correctness | Reference study only | Engine part met: implemented property, differential and mutation tests on MY1. Independent finance review missing |
| G5 Security and privacy | Not established | SoD model-checked and enforced in the guard. Threat model and application-level negative tests missing |
| G6 Scale and resilience | Not established | Simulations only (release faults, deadline concurrency). No load, restart or restore tests |
| G7 Client pilot | Not established | Not started; S/4 sandbox after slice completion on MY1 |
| G8 Reuse | Not established | Prepared: connector architecture and release gate. Second client not started |
| G9 Commercial release | Not established | Not started |

## Risks

| Risk | Now |
|---|---|
| R01 Baseline not recovered | Open. Slice 1 scope written down; premium register still needed |
| R02 Forms mistaken for engine | Treated: engine built and proven first |
| R03 Universal fit claim | Treated: explicit targets and positioning (SAP-native governed budgeting) |
| R04 Rounding or sign defects | Treated at engine level (verified on MY1); finance golden data still needed |
| R05 Hierarchy / formula change corrupts history | Designed (snapshot per version); not built |
| R06 Silent lost updates | Designed (draft per cost centre and version, ETag); simulated |
| R07 Tenant or workforce data exposure | On-stack per client; access control designed; not built |
| R08 Duplicate or wrong-scope release | Designed (idempotency key, fence, preflight); simulated |
| R09 Simulation gives false confidence | Treated: coverage critique of the 10-million study; emulator limits found and moved to real-kernel tests |
| R10 Forecast accuracy overstated | Rule set (MASE, backtest per client); nothing built |
| R11 Client forks destroy reuse | Treated by design: connectors, release gate, contract suite |
| R12 Build cost exceeds licence saving | Open |
| R13 Licensing / distribution rights assumed | Open; add-on route needs a partner agreement |
| R14 Heavy jobs block interactive use | Designed (application jobs); not built |
| R15 Operational ownership absent | Open |
| R16 AI unsupported numbers or actions | Not applicable yet (no AI built) |
| R17 Documentation differs by release | Treated: release gate pinned to SAP's repository; research dated |
| R18 Incomplete search as baseline | Open |

## Design changes since the report

| # | Report | Now | Why |
|---|---|---|---|
| 1 | ABAP/BTP, CAP and Power Platform as candidates | ABAP Cloud; developed on BTP (MY1), deployed on-stack in S/4 Public and Private 2023 / 2025 | Targets confirmed; on-stack gives live S/4 data and onshore hosting |
| 2 | Generic source adapters | Connector interfaces; S/4-only objects confined to the S/4 connector; release gate profiles `core` and `s4` | S/4 finance views are not available on BTP |
| 3 | Sparse fact table with coordinate keys | Slice 1: sheet per cost centre and version, wide monthly lines | Account-listing entry and draft locking; generic models stay open for C02 / C06 |
| 4 | Requested / recommended / approved as workflow states | Value layers plus an immutable approved snapshot | FI-PB-003 needs all three amounts at once |
| 5 | Draft → Submitted → Reviewed → Approved → Released | Adds Returned; SoD on the executing user; stale-recommendation check; audited escalation | Model checking found delegation bypass, stale approvals and stuck budgets |
| 6 | Allocation policy (locks, residuals, infeasible all-locked) | Plus: ties by member key, sign-symmetric, one leaf-level allocation, reject below locked total, reject mixed-sign drivers, zero change always succeeds | Simulation and differential tests |
| 7 | Declared decimal rules | Integer minor units; CURR × 100 = minor units; convert leaves then sum; never convert back; half away from zero on the server | Simulation; real-kernel tests |
| 8 | Release with idempotency key | Plus sequence fence and scope preflight | S/4 plan upload replaces its whole scope; reordered releases |
| 9 | Conflict-aware editing | Lock per cost centre and version; cell-level conflict detection for shared sheets | Deadline simulation |
| 10 | Denial texts unspecified | Reason codes mapped to translatable messages | ATC finding on MY1 |
| 11 | Predictive in platform | HANA predictive libraries not callable from ABAP Cloud; ABAP-coded methods or external compute (C76) | SAP roadmap |
| 12 | Hosting not decided | On-stack onshore for Malaysian public sector; MY1 for development only | No Malaysia BTP region; JDN guideline |

## Proposed roadmap (to be agreed)

| Slice | Content | Capabilities | Requirements |
|---|---|---|---|
| 1 (designed) | Departmental OPEX end to end on MY1 | C03, C04, C07-C09, C11-C13, C25, C27, C30, C41-C48, C51, C55, C58, C61-C63, C65 | 001-005, 007-009, 012-016, 029-035, 047-049 |
| 2 | Multi-currency and units, revenue, transfers, extra approval levels, variance reports, Excel export, budget book, notifications, private scenarios | C05, C10, C14, C23, C24, C48, C49, C50, C51, C59 | 006, 010, 017, 022, 027, 028, 036, 037 |
| 3 | Workforce and positions, multi-year and rolling forecast, formula registry, reciprocal allocation | C15, C20, C21, C22, C26 | 011, 018-021, 023-026 |
| 4 | Budget-control connector (cost centre / project control, public-sector control, Funds Management) and pre-release funds check | C64 integration | 038-046, 050-053 |
| 5 | Intelligence: forecasting, reconciliation, Monte Carlo, sensitivity, stress, drivers, anomalies, explanations, trace, optimisation | C28, C31-C39, C57, C76 | |
| 6 | Integrated statements, cross-model, configurable models and forms | C02, C06, C16-C19, C29, C52, C74 | |
| Parallel | Enterprise operations and evidence | C01, C53, C54, C56, C60, C66-C73, C77-C80 | |
| Packs | Client and industry content | C40, C75 | 054 |
