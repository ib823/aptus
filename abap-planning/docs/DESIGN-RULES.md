# Design rules

Each rule comes from a simulation in `sim/` (results in `sim/results/`). Inputs are synthetic; fault
rates and workloads are stated assumptions, so the direction of a result is the finding, not the
exact percentage. Rules marked **built** are implemented and tested in `src/`.

## Allocation and spreading (`sim/alloc.py`, 60,000 cases)

| Variant | What goes wrong |
|---|---|
| Round each share independently | Total not conserved in 63% of cases |
| Put the rounding residual in the last row | Result depends on row order in 57%; off by more than one cent in 35% (up to 11.5); sign flips in 4.7% |
| Largest remainder, ties by row order | Order dependent in 25%; a reversal does not cancel in 29% |
| **Largest remainder on the absolute total, ties by member key, sign re-applied** | No failures. The only side effect: raising a total by one cent can lower one leaf by one cent in 2% of cases |

- **built** Every split conserves the total exactly, stays within one minor unit of the exact share,
  is independent of input order, and a reversal cancels leaf by leaf.
- **built** A parent total is allocated once over all eligible leaves. Level-by-level allocation
  weighted by subtree totals rejected 52% of feasible requests and moved up to 65% of the change to the
  wrong leaves (15,000 random hierarchies).
- **built** Reject a target below the locked total for non-negative measures (otherwise eligible
  leaves go negative); reject when all leaves are locked; reject a change with no driver; a zero change
  always succeeds.
- **built** Locked months keep their value when an annual amount is spread (11% of random requests
  were infeasible and are rejected).
- Mixed-sign drivers are rejected: in random mixed-sign weight sets a leaf reached at least 10 times
  the total in 4.8% of cases (worst 999 times).

## Reciprocal allocation (`sim/reciprocal.py`)

- Use an exact linear solve. With 20% of service cost flowing between service departments, the order
  chosen for step-down alone moved a charge by a median 3.2% of total service cost (9.2% at 50%).
  Iteration needed 13 rounds at 20% and over 20,000 at 99.9%.
- Reject closed loops (services that only serve each other): the system is singular.

## Money (`sim/numerics.py`)

- **built** Amounts are integers in minor units of their currency. SAP's internal CURR value times 100
  equals the minor units for every currency (JPY 1,250,000 is stored as 12,500.00; KWD 1,234.567 as
  12,345.67). Ignoring the shift is a factor-100 error.
- **built** Convert each leaf with one rate snapshot and report the parent as the sum of converted
  leaves. Converting the parent instead differed in 87% of 100-leaf parents (worst 10 cents; 34 cents
  at 1,000 leaves).
- **built** Round half away from zero (ABAP, Excel ROUND). Banker's rounding disagrees on half of all
  ties; JavaScript `Math.round` disagrees on every negative tie, so totals are computed on the server.
- Never convert back. Round trips through stored rates were not exact in 99.6-99.9% of cases, and
  converting through a reference currency differed from a direct cross rate in 99%. Follow the
  client's S/4 triangulation rule when reconciling.

## Calendars (`sim/calendar_sim.py`)

- Store the fiscal year variant per client. In 4-4-5 calendars the 53-week years (2025, 2031, 2036,
  2042) make period 12 jump 20% year on year from calendar effects alone; flag or normalise them.
- An equal-per-period spread misstates a 4-4-5 period by up to 13.3% against a day-weighted spread.
- April-March years have two labelling conventions that differ by one year for every month.

## Workflow (`sim/workflow_mc.py`, every reachable state explored)

- **built** Segregation of duties is checked against the user who executes the action. Checking the
  assigned approver lets a delegation route approval back to the preparer.
- **built** Values change only in draft or returned; approved data changes only through an amendment.
- **built** Approval requires a recommendation made on the current values.
- **built** When no eligible reviewer or approver exists (role revoked, one-person department), the
  guard asks for an audited substitute. Without this, budgets got stuck in every weaker design.
- Only this combination had no violations and no stuck states in all four role configurations.

## Concurrency (`sim/concurrency.py`, deadline peak, 3 seeds)

- One draft per department blocked about 98.7% of edit sessions. Lock per cost centre and version
  (2.6-3.0% blocked, about 15 minutes' wait when blocked).
- Detect conflicts per cell for shared sheets (1.4-1.6% of saves). With no check at all, the same
  share of saves was silently overwritten.

## Release to S/4 (`sim/release_sim.py`, 200,000 scopes; fault rates assumed)

- Delta postings with naive retry left 10.8% of scopes wrong; looking the release up before retrying
  halved that but cannot stop duplicate delivery. An idempotency key brought it to zero.
- Replace-style uploads are immune to duplicates, but 1% of scopes ended wrong when an older release
  arrived after a newer one. A sequence fence brought it to zero.
- Preflight the replacement scope: a scope wider than the payload deletes plans the payload never
  mentioned.

## Simulation inputs and forecasts (`sim/mc_forecast.py`)

- Validate driver correlations: entered pairwise, they were invalid in 54% of 5-driver models and
  essentially all models with 8 or more drivers. Show any repair for approval.
- Forecasts fitted per node were incoherent in every case; reconcile them. Accuracy gains were small
  and depended on the method, so backtest per client. Measure accuracy with MASE: 31% of leaf series
  contained zero actuals, which breaks MAPE.
