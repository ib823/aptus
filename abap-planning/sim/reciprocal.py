"""S4: service-department (reciprocal) allocation variants: direct, step-down, iterative and
exact linear solve. Truth = exact reciprocal solution. Report section 18.3 lists reciprocal
allocations as untested; catalogue item C26 asks for a convergence policy."""
from __future__ import annotations

import itertools
import json
import sys

import numpy as np


def make_case(rng, k, m, loop_strength):
    """k service departments, m production departments. Row i of [S | P] = shares of service i's
    total cost sent to other services (S) and production (P); each row sums to 1."""
    S = rng.uniform(0, 1, (k, k)) * (rng.uniform(0, 1, (k, k)) < 0.6)
    np.fill_diagonal(S, 0)
    P = rng.uniform(0, 1, (k, m))
    has_s = S.sum(1, keepdims=True) > 0
    keep = np.where(has_s, loop_strength, 0.0)                              # share kept inside services
    S = np.where(has_s, S / S.sum(1, keepdims=True).clip(min=1e-12), 0) * keep
    P = P / P.sum(1, keepdims=True) * (1 - keep)
    c = rng.integers(10_000, 5_000_000, k).astype(float)                  # service direct costs
    return S, P, c


def reciprocal_exact(S, P, c):
    k = len(c)
    A = np.eye(k) - S.T
    cond = np.linalg.cond(A)
    x = np.linalg.solve(A, c)                    # total cost of each service incl. reciprocal charges
    return x @ P, cond


def reciprocal_iterative(S, P, c, tol=0.005, max_iter=100_000):
    x = c.copy()
    for it in range(1, max_iter + 1):
        nx = c + S.T @ x
        if np.max(np.abs(nx - x)) < tol:
            return nx @ P, it, True
        x = nx
    return x @ P, max_iter, False


def direct_method(S, P, c):
    return (c / P.sum(1)) @ P                     # ignore inter-service flows entirely


def step_down(S, P, c, order):
    cost = c.copy()
    out = np.zeros(P.shape[1])
    done = set()
    for i in order:
        targets_s = [j for j in order if j not in done and j != i]
        w_s = S[i, targets_s]
        denom = w_s.sum() + P[i].sum()
        for j, w in zip(targets_s, w_s):
            cost[j] += cost[i] * w / denom
        out += cost[i] * P[i] / denom
        done.add(i)
    return out


def run(cases, seed):
    rng = np.random.default_rng(seed)
    res = dict(cases=cases, conservation_fail=dict(exact=0, iterative=0, direct=0, step_down=0),
               iterations_by_loop_strength={}, nonconverged_iterative=0, by_loop_strength={})
    for loop in (0.2, 0.5, 0.8, 0.95, 0.99, 0.999):
        its = []
        acc = dict(step_down_order_spread_pct_of_total=[], direct_vs_exact_pct_of_total=[],
                   step_down_vs_exact_pct_of_total=[])
        for _ in range(cases):
            k, m = int(rng.integers(2, 7)), int(rng.integers(2, 9))
            S, P, c = make_case(rng, k, m, loop)
            ex, _ = reciprocal_exact(S, P, c)
            it_res, it, ok = reciprocal_iterative(S, P, c)
            its.append(it)
            res["nonconverged_iterative"] += not ok
            dm = direct_method(S, P, c)
            for name, v in (("exact", ex), ("iterative", it_res), ("direct", dm)):
                res["conservation_fail"][name] += abs(v.sum() - c.sum()) > 0.5
            orders = list(itertools.permutations(range(k)))
            sd = np.array([step_down(S, P, c, o) for o in orders])
            res["conservation_fail"]["step_down"] += int(np.any(np.abs(sd.sum(1) - c.sum()) > 0.5))
            tot = c.sum()
            acc["step_down_order_spread_pct_of_total"].append(float(100 * (sd.max(0) - sd.min(0)).max() / tot))
            acc["direct_vs_exact_pct_of_total"].append(float(100 * np.abs(dm - ex).max() / tot))
            acc["step_down_vs_exact_pct_of_total"].append(float(100 * np.abs(sd - ex).max() / tot))
        res["iterations_by_loop_strength"][str(loop)] = dict(median=int(np.median(its)), max=int(np.max(its)))
        res["by_loop_strength"][str(loop)] = {
            key: dict(median=round(float(np.median(a)), 2), p95=round(float(np.percentile(a, 95)), 2))
            for key, a in ((k, np.array(v)) for k, v in acc.items())}
    # closed loop: two services that only serve each other -> singular system, must be rejected
    S = np.array([[0, 1.0], [1.0, 0]])
    P = np.zeros((2, 3))
    c = np.array([100.0, 200.0])
    A = np.eye(2) - S.T
    res["closed_loop_case"] = dict(spectral_radius=float(max(abs(np.linalg.eigvals(S)))),
                                   determinant=float(np.linalg.det(A)),
                                   iterative_converges=reciprocal_iterative(S, P, c, max_iter=10_000)[2])
    return res


if __name__ == "__main__":
    print(json.dumps(run(int(sys.argv[1]) if len(sys.argv) > 1 else 300, 401), indent=1, default=int))
