"""S10-S11: simulation inputs and forecast reconciliation.

S10  user-entered driver correlations: how often is the matrix not a valid correlation matrix
     (not positive semi-definite), and how far is the nearest valid one (Higham 2002 alternating
     projections)?
S11  hierarchical forecasts (catalogue C36): incoherence of independent base forecasts and the
     effect of bottom-up and OLS reconciliation; why MAPE breaks on sparse series.
"""
from __future__ import annotations

import json

import numpy as np


def nearest_corr(a, iters=200):
    y = a.copy()
    ds = np.zeros_like(a)
    for _ in range(iters):
        r = y - ds
        w, v = np.linalg.eigh(r)
        x = v @ np.diag(np.clip(w, 0, None)) @ v.T
        ds = x - r
        y = x.copy()
        np.fill_diagonal(y, 1.0)
    return y


def s10(seed=1001, trials=4000):
    rng = np.random.default_rng(seed)
    out = {}
    for k in (3, 5, 8, 12):
        for label, lo, hi in (("any in [-0.9,0.9]", -0.9, 0.9), ("mostly positive [-0.3,0.8]", -0.3, 0.8)):
            bad = 0
            dist = []
            for _ in range(trials):
                c = np.eye(k)
                iu = np.triu_indices(k, 1)
                c[iu] = rng.uniform(lo, hi, len(iu[0]))
                c = c + c.T - np.eye(k)
                if np.linalg.eigvalsh(c).min() < -1e-12:
                    bad += 1
                    if len(dist) < 200:
                        dist.append(float(np.abs(nearest_corr(c) - c).max()))
            out[f"k={k} {label}"] = dict(not_valid_pct=round(100 * bad / trials, 1),
                                         median_max_entry_change_when_repaired=round(float(np.median(dist)), 3) if dist else 0)
    return out


def ses_seasonal(series, h):
    """Multiplicative seasonal indices + simple exponential smoothing with alpha fitted per series."""
    n = len(series)
    mean = series.mean() if series.mean() > 0 else 1.0
    idx = np.array([series[m::12].mean() / mean for m in range(12)])
    idx[idx <= 0] = 1.0
    adj = series / idx[np.arange(n) % 12]
    best = None
    for alpha in np.linspace(0.05, 0.95, 19):
        lvl, sse = adj[0], 0.0
        for t in range(1, n):
            sse += (adj[t] - lvl) ** 2
            lvl = alpha * adj[t] + (1 - alpha) * lvl
        if best is None or sse < best[0]:
            best = (sse, lvl)
    return best[1] * idx[(np.arange(n, n + h)) % 12]


def s11(seed=1101, reps=300, h=12, n=48):
    rng = np.random.default_rng(seed)
    groups, per = 4, 4
    m = groups * per
    # summing matrix S: rows = total, groups, leaves
    S = np.vstack([np.ones((1, m)), np.kron(np.eye(groups), np.ones((1, per))), np.eye(m)])
    P_ols = np.linalg.solve(S.T @ S, S.T)                  # bottom-level weights from OLS reconciliation
    err = {"base": [], "bottom_up": [], "ols": []}
    incoherent = 0
    zero_actual_leaf_series = 0
    for _ in range(reps):
        season = rng.normal(0, 1, 12)
        level = rng.uniform(5, 50, m)
        gshock = np.repeat(rng.normal(0, 3, (groups, n + h)), per, axis=0)
        y = level[:, None] * (1 + 0.15 * season[np.arange(n + h) % 12][None, :]) + gshock + rng.normal(0, 4, (m, n + h))
        sparse = rng.random(m) < 0.25                      # a quarter of leaves are intermittent
        y[sparse] = np.where(rng.random((sparse.sum(), n + h)) < 0.6, 0, np.abs(y[sparse]))
        y = np.clip(y, 0, None)
        all_y = S @ y
        train, test = all_y[:, :n], all_y[:, n:]
        base = np.array([ses_seasonal(row, h) for row in train])   # fitted independently per node
        incoherent += not np.allclose(base[0], base[1 + groups:].sum(0), rtol=1e-6)
        bu = S @ base[-m:]
        ols = S @ (P_ols @ base)
        scale = np.mean(np.abs(train[:, 12:] - train[:, :-12]), axis=1)
        scale[scale == 0] = 1
        for name, f in (("base", base), ("bottom_up", bu), ("ols", ols)):
            err[name].append(np.mean(np.abs(f - test), axis=1) / scale)     # MASE per node
        zero_actual_leaf_series += int(np.any(test[-m:] == 0, axis=1).sum())
    levels = {"total": slice(0, 1), "groups": slice(1, 1 + groups), "leaves": slice(1 + groups, None)}
    out = {"base_forecasts_incoherent_pct": round(100 * incoherent / reps, 1),
           "base_method": "per-node multiplicative seasonal indices + SES with fitted alpha"}
    for name, arrs in err.items():
        a = np.array(arrs)
        out[f"MASE {name}"] = {lv: round(float(a[:, sl].mean()), 3) for lv, sl in levels.items()}
    out["leaf_series_with_a_zero_actual_in_holdout_pct"] = round(100 * zero_actual_leaf_series / (reps * m), 1)
    return out


if __name__ == "__main__":
    print(json.dumps({"S10_correlation_inputs": s10(), "S11_hierarchical_forecast": s11()}, indent=1))
