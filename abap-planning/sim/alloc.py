"""S1-S3: allocation, spreading and top-down disaggregation variants.

All amounts are integers in minor units (cents). Weights are non-negative integers unless a
test says otherwise, so every exact share is a rational number and the oracle is exact.
"""
from __future__ import annotations

import random
from fractions import Fraction

# ------------------------------------------------------------------ rounding strategies


def half_away(x: Fraction) -> int:
    """ABAP default commercial rounding for packed numbers: half away from zero."""
    n = abs(x)
    q = int(n)
    if n - q >= Fraction(1, 2):
        q += 1
    return q if x >= 0 else -q


def exact_shares(total: int, weights: list[int]) -> list[Fraction]:
    w = sum(weights)
    return [Fraction(total * wi, w) for wi in weights]


def r_independent(total, weights, keys):
    return [half_away(s) for s in exact_shares(total, weights)]


def r_plug_last(total, weights, keys):
    out = r_independent(total, weights, keys)
    out[-1] += total - sum(out)
    return out


def r_plug_largest(total, weights, keys):
    out = r_independent(total, weights, keys)
    i = max(range(len(weights)), key=lambda j: weights[j])  # first max in row order
    out[i] += total - sum(out)
    return out


def _hamilton(total, weights, tiebreak):
    w = sum(weights)
    q = [(total * wi) // w for wi in weights]           # floor, also for negative totals
    rem = [total * wi - qi * w for wi, qi in zip(weights, q)]
    left = total - sum(q)                               # 0 <= left < n
    order = sorted(range(len(weights)), key=lambda j: (-rem[j], tiebreak(j)))
    for j in order[:left]:
        q[j] += 1
    return q


def r_hamilton_roworder(total, weights, keys):
    return _hamilton(total, weights, lambda j: j)


def r_hamilton_key(total, weights, keys):
    return _hamilton(total, weights, lambda j: keys[j])


def r_hamilton_key_signed(total, weights, keys):
    """Allocate |total| and re-apply the sign: reversals cancel leaf by leaf."""
    a = _hamilton(abs(total), weights, lambda j: keys[j])
    return a if total >= 0 else [-x for x in a]


STRATEGIES = {
    "R1 independent rounding": r_independent,
    "R2 plug residual into last row": r_plug_last,
    "R3 plug residual into largest weight": r_plug_largest,
    "R4 largest remainder, ties by row order": r_hamilton_roworder,
    "R5 largest remainder, ties by member key": r_hamilton_key,
    "R6 R5 on |total| with sign re-applied": r_hamilton_key_signed,
}


def random_case(rng: random.Random):
    n = rng.randint(2, 24)
    style = rng.random()
    if style < 0.25:                      # many ties: equal weights (straight-line spread)
        weights = [1] * n
    elif style < 0.45:                    # seasonality-like small integers
        weights = [rng.randint(0, 12) for _ in range(n)]
    else:
        weights = [0 if rng.random() < 0.2 else rng.randint(1, 100_000) for _ in range(n)]
    if sum(weights) == 0:
        weights[rng.randrange(n)] = 1
    total = rng.choice([rng.randint(-n * 3, n * 3), rng.randint(-10**9, 10**9)])
    keys = rng.sample(range(10**6), n)    # stable member identifiers, not row positions
    return total, weights, keys


def eval_strategies(cases: int, seed: int):
    rng = random.Random(seed)
    stats = {name: dict(conservation_fail=0, dev_gt_1_unit=0, max_dev_units=0.0, order_dependent=0,
                        reversal_not_cancelling=0, sign_flip=0, alabama=0) for name in STRATEGIES}
    for _ in range(cases):
        total, weights, keys = random_case(rng)
        ex = exact_shares(total, weights)
        perm = list(range(len(weights)))
        rng.shuffle(perm)
        pw, pk = [weights[i] for i in perm], [keys[i] for i in perm]
        for name, fn in STRATEGIES.items():
            st = stats[name]
            a = fn(total, weights, keys)
            if sum(a) != total:
                st["conservation_fail"] += 1
            dev = max(abs(ai - e) for ai, e in zip(a, ex))
            st["max_dev_units"] = max(st["max_dev_units"], float(dev))
            if dev > 1:                   # more than one minor unit away from the exact share
                st["dev_gt_1_unit"] += 1
            if any((e > 0 and ai < 0) or (e < 0 and ai > 0) for ai, e in zip(a, ex)):
                st["sign_flip"] += 1
            b = fn(total, pw, pk)
            by_key_a = dict(zip(keys, a))
            if any(by_key_a[k] != v for k, v in zip(pk, b)):
                st["order_dependent"] += 1
            neg = fn(-total, weights, keys)
            if any(x != -y for x, y in zip(neg, a)):
                st["reversal_not_cancelling"] += 1
            if total >= 0:
                up = fn(total + 1, weights, keys)
                if any(u < v for u, v in zip(up, a)):
                    st["alabama"] += 1
    return stats


# ------------------------------------------------------------------ mixed-sign weights (S3)


def mixed_sign(cases: int, seed: int):
    rng = random.Random(seed)
    zero_sum = amplified_10x = amplified_100x = 0
    worst = 0.0
    for _ in range(cases):
        n = rng.randint(2, 12)
        w = [rng.randint(-1000, 1000) for _ in range(n)]
        if not (any(x > 0 for x in w) and any(x < 0 for x in w)):
            w[0] = -abs(w[0]) - 1
            w[-1] = abs(w[-1]) + 1
        s = sum(w)
        if s == 0:
            zero_sum += 1
            continue
        amp = max(abs(Fraction(x, s)) for x in w)       # largest |leaf| per unit of total
        worst = max(worst, float(amp))
        amplified_10x += amp >= 10
        amplified_100x += amp >= 100
    return dict(cases=cases, weights_sum_to_zero=zero_sum, leaf_at_least_10x_total=amplified_10x,
                leaf_at_least_100x_total=amplified_100x, worst_amplification=worst)


# ------------------------------------------------------------------ multi-level disaggregation (S2)


class Node:
    __slots__ = ("key", "children", "value", "locked")

    def __init__(self, key):
        self.key, self.children, self.value, self.locked = key, [], 0, False


def random_tree(rng: random.Random):
    counter = iter(range(10**7))
    root = Node(next(counter))
    depth = rng.randint(2, 6)

    def grow(node, d):
        if d == depth or (d > 1 and rng.random() < 0.25):      # ragged hierarchy
            node.value = 0 if rng.random() < 0.1 else rng.randint(1, 5_000_000)
            node.locked = rng.random() < 0.2
            return
        for _ in range(rng.randint(1, 5)):
            c = Node(next(counter))
            node.children.append(c)
            grow(c, d + 1)
        node.locked = d > 0 and rng.random() < 0.05            # locked intermediate node

    grow(root, 0)
    return root


def leaves(node, under_locked=False):
    lk = under_locked or node.locked
    if not node.children:
        yield node, lk
    for c in node.children:
        yield from leaves(c, lk)


def total(node):
    return node.value if not node.children else sum(total(c) for c in node.children)


def leaf_level(root, target, nonnegative=True):
    """Recommended: one allocation over all eligible leaves, weights = current values.
    nonnegative=True rejects a target below the locked total (it would force negative leaves)."""
    ls = list(leaves(root))
    fixed = sum(n.value for n, lk in ls if lk)
    elig = [n for n, lk in ls if not lk]
    residual = target - fixed
    if nonnegative and residual < 0:
        return None
    if not elig:
        return None if residual != total(root) - fixed else {}
    w = [n.value for n in elig]
    delta = target - total(root)
    if delta == 0:
        return {n.key: n.value for n in elig}                    # no-op must succeed even with no driver
    if sum(w) == 0:
        return None                                              # zero-driver policy: reject
    shares = r_hamilton_key_signed(delta, w, [n.key for n in elig])
    return {n.key: n.value + s for n, s in zip(elig, shares)}


def level_by_level(root, target, eligible_aware: bool):
    """Common implementation: push the delta down one level at a time."""
    result = {}

    def eligible_weight(node):
        return sum(n.value for n, lk in leaves(node, node.locked) if not lk)

    def push(node, delta, locked):
        if not node.children:
            if locked:
                if delta != 0:
                    raise ValueError("delta reached a locked leaf")
                return
            result[node.key] = node.value + delta
            return
        kids = node.children
        w = [eligible_weight(c) if eligible_aware else (0 if c.locked else total(c)) for c in kids]
        if sum(w) == 0:
            if delta != 0:
                raise ValueError("no eligible weight below an intermediate node")
            for c in kids:
                push(c, 0, locked or c.locked)
            return
        shares = r_hamilton_key_signed(delta, w, [c.key for c in kids])
        for c, s in zip(kids, shares):
            push(c, s, locked or c.locked)

    try:
        push(root, target - total(root), root.locked)
    except ValueError:
        return None
    return result


def disaggregation(cases: int, seed: int):
    rng = random.Random(seed)
    names = ("leaf-level, bound-checked (recommended)", "leaf-level, no bound check",
             "level-by-level, eligible-aware weights", "level-by-level, subtree-total weights")
    out = {v: dict(feasible_rejected=0, infeasible_accepted=0, root_mismatch=0, locked_changed=0,
                   negative_leaf=0, max_dev_vs_exact_units=0.0, max_dev_pct_of_delta=0.0) for v in names}
    feasible = infeasible = 0
    for _ in range(cases):
        root = random_tree(rng)
        cur = total(root)
        target = max(0, cur + rng.randint(-cur // 2 - 1, cur // 2 + 1)) if rng.random() < 0.9 else rng.randint(0, cur + 1)
        ls = list(leaves(root))
        fixed = sum(n.value for n, lk in ls if lk)
        elig_w = sum(n.value for n, lk in ls if not lk)
        is_feasible = (target == cur) or (elig_w > 0 and target >= fixed)
        feasible += is_feasible
        infeasible += not is_feasible
        exact = None
        if is_feasible and target != cur:
            delta = target - cur
            exact = {n.key: n.value + Fraction(delta * n.value, elig_w) for n, lk in ls if not lk}
        variants = {
            "leaf-level, bound-checked (recommended)": lambda: leaf_level(root, target, True),
            "leaf-level, no bound check": lambda: leaf_level(root, target, False),
            "level-by-level, eligible-aware weights": lambda: level_by_level(root, target, True),
            "level-by-level, subtree-total weights": lambda: level_by_level(root, target, False),
        }
        for name, fn in variants.items():
            st = out[name]
            res = fn()
            if res is None:
                if is_feasible:
                    st["feasible_rejected"] += 1
                continue
            if not is_feasible:
                st["infeasible_accepted"] += 1
            new_total = fixed + sum(res.get(n.key, n.value) for n, lk in ls if not lk)
            if new_total != target:
                st["root_mismatch"] += 1
            if any(n.key in res and res[n.key] != n.value for n, lk in ls if lk):
                st["locked_changed"] += 1
            if any(v < 0 for v in res.values()):
                st["negative_leaf"] += 1
            if exact:
                dev = max(abs(res.get(k, 0) - v) for k, v in exact.items())
                st["max_dev_vs_exact_units"] = max(st["max_dev_vs_exact_units"], float(dev))
                st["max_dev_pct_of_delta"] = max(st["max_dev_pct_of_delta"], round(100 * float(dev) / abs(target - cur), 3))
    return dict(cases=cases, feasible=feasible, infeasible=infeasible, variants=out)


def spread_with_locked_months(cases: int, seed: int):
    """Annual -> 12 months with some months locked (FI-PB-013 with manual overrides)."""
    rng = random.Random(seed)
    res = dict(cases=cases, infeasible_detected=0, conservation_fail=0, locked_changed=0,
               negative_month_when_allowed_naive=0)
    for _ in range(cases):
        annual = rng.randint(0, 10**8)
        season = [rng.randint(0, 20) for _ in range(12)]
        if sum(season) == 0:
            season = [1] * 12
        locked = {m: rng.randint(0, annual // 3 + 1) for m in rng.sample(range(12), rng.randint(0, 6))}
        free = [m for m in range(12) if m not in locked]
        residual = annual - sum(locked.values())
        w = [season[m] for m in free]
        if residual < 0 or not free or sum(w) == 0:
            res["infeasible_detected"] += 1
            # what a naive implementation does: spread the (negative) residual anyway
            if free and residual < 0:
                naive = r_independent(residual, [1] * len(free), free)
                res["negative_month_when_allowed_naive"] += any(x < 0 for x in naive)
            continue
        alloc = r_hamilton_key_signed(residual, w, free)
        months = dict(locked)
        months.update(zip(free, alloc))
        res["conservation_fail"] += sum(months.values()) != annual
        res["locked_changed"] += any(months[m] != v for m, v in locked.items())
    return res


if __name__ == "__main__":
    import json
    import sys
    import time

    t = time.time()
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
    print(json.dumps({
        "S1_rounding_strategies": eval_strategies(n, 101),
        "S1b_spread_with_locked_months": spread_with_locked_months(n, 102),
        "S2_multilevel_disaggregation": disaggregation(max(n // 4, 1000), 103),
        "S3_mixed_sign_weights": mixed_sign(n, 104),
        "seconds": round(time.time() - t, 1),
    }, indent=1))
