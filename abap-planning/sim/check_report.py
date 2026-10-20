"""Mechanical consistency checks on the assessed report (converted to Markdown) and an
independent re-run of its declared E1 'business-risk' model.

Usage: python3 -I check_report.py <doc.md>
"""
import json
import math
import re
import sys
from collections import Counter

import numpy as np

doc = open(sys.argv[1], encoding="utf-8").read()
out = {}

# ---------------------------------------------------------------- catalogue and annex
cap_rows = re.findall(r"^\| (C\d\d) \| (Core|Advanced|Pack|External)\s*\| ([^|]+?)\s*\|", doc, re.M)
caps = {c: (tier, name) for c, tier, name in cap_rows}
out["capabilities_found"] = len(caps)
out["capabilities_missing"] = [f"C{i:02d}" for i in range(1, 81) if f"C{i:02d}" not in caps]
out["capability_tiers"] = Counter(t for t, _ in caps.values())

req_rows = re.findall(r"^\| (FI-PB-\d{3}) \| (.+?) \| (.+?) \| (.+?) \|$", doc, re.M)
reqs = {r[0]: r for r in req_rows}
out["requirements_found"] = len(reqs)
out["requirements_missing"] = [f"FI-PB-{i:03d}" for i in range(1, 55) if f"FI-PB-{i:03d}" not in reqs]

refs, bad_refs, external_only = Counter(), [], []
for rid, text, resp, proof in req_rows:
    ids = re.findall(r"C\d\d", resp)
    refs.update(ids)
    bad_refs += [(rid, c) for c in ids if c not in caps]
    if ids and all(caps.get(c, ("",))[0] == "External" for c in ids):
        external_only.append(rid)
out["mapping_refs_to_unknown_capabilities"] = bad_refs
out["requirements_mapped_only_to_External_C64"] = external_only
out["capabilities_never_referenced_by_a_requirement"] = sorted(set(caps) - set(refs))
out["most_referenced_capabilities"] = refs.most_common(8)

# Stated workbook counts: 24 native + 18 template + 11 partial + 1 gap = 54
out["workbook_fit_counts_sum"] = 24 + 18 + 11 + 1

# ---------------------------------------------------------------- E1 business-risk model, re-run
# Declared in report section 18.2. Two readings of "independent +/-5% variation" are possible;
# both are run so the sensitivity of the published statistics to that ambiguity is visible.
stated = {"mean": 87361.50, "p05": -52540.94, "median": 95755.55, "p95": 203408.79, "loss_fraction": 0.1540685}


def run(n, seed, reading):
    rng = np.random.default_rng(seed)
    s = rng.uniform(-1, 1, n)
    if reading == "uniform_multiplicative":      # factor (1+u), u ~ U[-0.05, 0.05]
        e1, e2 = rng.uniform(-0.05, 0.05, n), rng.uniform(-0.05, 0.05, n)
    else:                                          # "normal sd 5%" alternative reading
        e1, e2 = rng.normal(0, 0.05, n), rng.normal(0, 0.05, n)
    vol = 10_000 * (1 + 0.20 * s)
    price = 100 * (1 - 0.10 * s) * (1 + e1)
    cost = 60 * (1 + 0.15 * s) * (1 + e2)
    fixed = rng.uniform(250_000, 350_000, n)
    profit = vol * (price - cost) - fixed
    return {"mean": float(profit.mean()), "p05": float(np.percentile(profit, 5)),
            "median": float(np.median(profit)), "p95": float(np.percentile(profit, 95)),
            "loss_fraction": float((profit < 0).mean()), "sd": float(profit.std())}


analytic_mean = 1e6 * (1 - 0.02 / 3) - 6e5 * (1 + 0.03 / 3) - 300_000
out["e1_analytic_mean"] = analytic_mean
rerun = {}
for reading in ("uniform_multiplicative", "normal_sd5"):
    r = run(2_000_000, 7, reading)
    se_mean = r["sd"] / math.sqrt(2_000_000)
    se_lossfrac = math.sqrt(r["loss_fraction"] * (1 - r["loss_fraction"]) / 2_000_000)
    rerun[reading] = {k: round(v, 4) for k, v in r.items()} | {
        "z_mean_vs_stated": round((stated["mean"] - r["mean"]) / se_mean, 2),
        "z_lossfrac_vs_stated": round((stated["loss_fraction"] - r["loss_fraction"]) / se_lossfrac, 2),
    }
out["e1_rerun_2M"] = rerun

# How many draws are needed for the decision-relevant tail (P05) to settle within +/-1%?
rng_n = {}
base = run(2_000_000, 11, "uniform_multiplicative")["p05"]
for n in (1_000, 10_000, 100_000, 1_000_000):
    p05s = [run(n, 100 + k, "uniform_multiplicative")["p05"] for k in range(30)]
    rng_n[n] = {"p05_sd_across_30_runs": round(float(np.std(p05s)), 1),
                "relative_sd_pct": round(100 * float(np.std(p05s)) / abs(base), 2)}
out["e1_p05_convergence"] = rng_n

# ---------------------------------------------------------------- coverage saturation
# Family D: 8 Boolean guards = 256 states. Expected samples to see all states (coupon collector).
H = sum(1 / k for k in range(1, 257))
out["familyD_expected_draws_to_cover_all_256_states"] = round(256 * H)
out["familyD_mean_repeats_per_state_at_2M"] = round(2_000_000 / 256)
# Family C: cut-offs 0..12 = 13 structural classes.
out["familyC_structural_classes"] = 13
out["familyC_mean_repeats_per_class_at_2M"] = round(2_000_000 / 13)

print(json.dumps(out, indent=1, default=str))
