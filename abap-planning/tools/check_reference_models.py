"""Fast regression of the reference models the ABAP tests are generated from. If a change to sim/
breaks a property the design relies on, the generated ABAP expectations would be wrong too, so
this runs before the generators in CI."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
import alloc  # noqa: E402
import workflow_mc  # noqa: E402

failures = []


def expect(cond, msg):
    print(("ok    " if cond else "FAIL  ") + msg)
    if not cond:
        failures.append(msg)


s = alloc.eval_strategies(3000, 101)["R6 R5 on |total| with sign re-applied"]
for key in ("conservation_fail", "dev_gt_1_unit", "order_dependent", "reversal_not_cancelling", "sign_flip"):
    expect(s[key] == 0, f"allocation R6: {key} = {s[key]}")
expect(s["max_dev_units"] < 1, f"allocation R6: max deviation {s['max_dev_units']:.3f} < 1 unit")

d = alloc.disaggregation(1500, 103)["variants"]["leaf-level, bound-checked (recommended)"]
for key in ("feasible_rejected", "infeasible_accepted", "root_mismatch", "locked_changed", "negative_leaf"):
    expect(d[key] == 0, f"disaggregation leaf-level: {key} = {d[key]}")

sp = alloc.spread_with_locked_months(3000, 102)
expect(sp["conservation_fail"] == 0 and sp["locked_changed"] == 0, "spread with locked months conserves and keeps locks")

for name, roles in workflow_mc.ROLE_CONFIGS.items():
    r = workflow_mc.check(4, roles)
    expect(not r["violations"] and r["states_that_can_never_reach_release"] == 0,
           f"workflow V4 | {name}: {len(r['violations'])} violations, {r['states_that_can_never_reach_release']} dead ends")
weaker = workflow_mc.check(2, workflow_mc.ROLE_CONFIGS["K1 separate people"])
expect(bool(weaker["violations"]), "workflow V2 still shows the delegation SoD counterexample (model is not vacuous)")

print(f"\n{len(failures)} failure(s)")
sys.exit(1 if failures else 0)
