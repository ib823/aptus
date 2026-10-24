"""S5: money arithmetic across the layers a planning product actually has (ABAP backend, Excel,
browser JavaScript, Python reference). Oracle = exact Decimal arithmetic.

Rounding conventions emulated:
  ABAP packed assignment / round() default, Excel ROUND  -> half away from zero
  Python round(), numpy.round, IEEE default            -> half to even (banker's)
  JavaScript Math.round                                 -> half towards +infinity
SAP stores CURR amounts with 2 decimals regardless of the currency; TCURX holds the real number of
decimals, so internal = external * 10**(currdec - 2)  (JPY 0 -> /100, KWD 3 -> *10).
"""
from __future__ import annotations

import json
import math
import random
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal, getcontext

import numpy as np

getcontext().prec = 34                              # decfloat34-like working precision
CURRDEC = {"MYR": 2, "EUR": 2, "USD": 2, "JPY": 0, "KWD": 3, "IDR": 2}


def q(dec):
    return Decimal(1).scaleb(-dec)


def r_abap(x: Decimal, dec: int) -> Decimal:       # half away from zero
    return x.quantize(q(dec), rounding=ROUND_HALF_UP)


def r_even(x: Decimal, dec: int) -> Decimal:
    return x.quantize(q(dec), rounding=ROUND_HALF_EVEN)


def r_js(x: Decimal, dec: int) -> Decimal:         # Math.round(x * 10**dec) / 10**dec, exact-decimal version
    s = x.scaleb(dec)
    return Decimal(math.floor(s + Decimal("0.5"))).scaleb(-dec)


def to_internal(ext: Decimal, cur: str) -> Decimal:
    return (ext * Decimal(10) ** (CURRDEC[cur] - 2)).quantize(q(2))


def to_external(internal: Decimal, cur: str) -> Decimal:
    return (internal / Decimal(10) ** (CURRDEC[cur] - 2)).quantize(q(CURRDEC[cur]))


def convert(ext: Decimal, src: str, dst: str, rate: Decimal) -> Decimal:
    return r_abap(ext * rate, CURRDEC[dst])


def run(seed=501, n=200_000):
    rng = random.Random(seed)
    out = {}

    # (a) forgetting the TCURX shift
    rate_jpy_myr = Decimal("0.03021")                # 1 JPY in MYR, 5 decimals like TCURR
    ext_jpy = Decimal(1_250_000)                     # JPY 1,250,000
    internal = to_internal(ext_jpy, "JPY")           # 12,500.00 stored
    right = convert(to_external(internal, "JPY"), "JPY", "MYR", rate_jpy_myr)
    wrong = convert(internal, "JPY", "MYR", rate_jpy_myr)
    out["a_currency_shift_example"] = dict(stored_internal=str(internal), correct_MYR=str(right),
                                           shift_forgotten_MYR=str(wrong), error_factor=float(right / wrong))
    kwd = Decimal("1234.567")
    out["a_kwd_roundtrip_internal"] = dict(external=str(kwd), internal=str(to_internal(kwd, "KWD")),
                                           back=str(to_external(to_internal(kwd, "KWD"), "KWD")))

    # (b) round trip and triangulation, rates held to 6 significant digits (TCURR rate plus ratio factors)
    def sig6(x: Decimal) -> Decimal:
        return x.quantize(Decimal(1).scaleb(x.adjusted() - 5), rounding=ROUND_HALF_UP)

    pairs = [("MYR", "JPY", Decimal("33.1250")), ("MYR", "KWD", Decimal("0.0731400")),
             ("MYR", "EUR", Decimal("0.204650")), ("JPY", "KWD", Decimal("0.00220803"))]
    rt = {}
    for a, b, base in pairs:
        bad = 0
        worst_ppm = 0.0
        for _ in range(n // 10):
            amt = r_abap(Decimal(rng.randint(1, 10**9)) / Decimal(10) ** CURRDEC[a], CURRDEC[a])
            r = sig6(base * Decimal(rng.uniform(0.8, 1.2)))
            back = convert(convert(amt, a, b, r), b, a, sig6(Decimal(1) / r))
            if back != amt:
                bad += 1
                worst_ppm = max(worst_ppm, float(abs(back - amt) / amt) * 1e6)
        rt[f"{a}->{b}->{a}"] = dict(cases=n // 10, not_equal_pct=round(100 * bad / (n // 10), 1),
                                    worst_relative_error_ppm=round(worst_ppm, 2))
    out["b_round_trip"] = rt
    tri_bad = 0
    for _ in range(n // 10):
        amt = Decimal(rng.randint(1, 10**9)) / 100
        r1 = sig6(Decimal("0.204650") * Decimal(rng.uniform(0.8, 1.2)))      # MYR->EUR
        r2 = sig6(Decimal("161.870") * Decimal(rng.uniform(0.8, 1.2)))       # EUR->JPY
        via = convert(convert(amt, "MYR", "EUR", r1), "EUR", "JPY", r2)
        cross = convert(amt, "MYR", "JPY", sig6(r1 * r2))
        tri_bad += via != cross
    out["b_triangulation_vs_cross_rate_mismatch_pct"] = round(100 * tri_bad / (n // 10), 2)

    # (c) convert-then-sum vs sum-then-convert at parent level
    agg = {}
    for leaves_n in (2, 10, 100, 1000):
        diff = 0
        worst = 0
        trials = 2000 if leaves_n < 1000 else 300
        for _ in range(trials):
            r = Decimal(rng.randint(1, 10**7)) / Decimal(10**5)
            vals = [Decimal(rng.randint(-10**8, 10**8)) / 100 for _ in range(leaves_n)]
            leaf_sum = sum(convert(v, "MYR", "USD", r) for v in vals)
            parent = convert(sum(vals), "MYR", "USD", r)
            d = abs(leaf_sum - parent) * 100
            diff += d != 0
            worst = max(worst, int(d))
        agg[str(leaves_n)] = dict(trials=trials, parent_differs_pct=round(100 * diff / trials, 1), worst_cents=worst)
    out["c_convert_then_sum_vs_sum_then_convert"] = agg

    # (d) rounding-mode disagreement on exact ties (e.g. halving an odd number of cents)
    ties = [Decimal(rng.randint(-10**7, 10**7) * 2 + 1) / 200 for _ in range(n)]   # x.xx5 exactly
    out["d_ties"] = dict(
        cases=n,
        half_even_vs_abap_pct=round(100 * sum(r_even(t, 2) != r_abap(t, 2) for t in ties) / n, 2),
        js_vs_abap_pct=round(100 * sum(r_js(t, 2) != r_abap(t, 2) for t in ties) / n, 2),
        js_vs_abap_on_negative_ties_pct=round(100 * sum(r_js(t, 2) != r_abap(t, 2) for t in ties if t < 0)
                                              / max(1, sum(1 for t in ties if t < 0)), 2),
        numpy_round_vs_abap_pct=round(100 * float(np.mean(np.round(np.array([float(t) for t in ties]), 2)
                                                          != np.array([float(r_abap(t, 2)) for t in ties]))), 2),
    )

    # (e) binary floating point accumulation in a browser grid / spreadsheet
    acc = {}
    nrng = np.random.default_rng(seed)
    for count in (1_000, 100_000, 1_000_000):
        trials = 200 if count < 1_000_000 else 20
        bad = 0
        worst = 0.0
        for _ in range(trials):
            cents = nrng.integers(-10**9, 10**9, count)                 # up to 10 million currency units
            exact = int(cents.sum())
            seq = float(np.cumsum(cents / 100.0)[-1])                     # naive left-to-right float sum
            got = round(seq * 100)
            bad += got != exact
            worst = max(worst, abs(seq * 100 - exact))
        acc[str(count)] = dict(trials=trials, cent_total_wrong_pct=round(100 * bad / trials, 1),
                               worst_error_cents=round(worst, 3))
    out["e_float_accumulation"] = acc
    return out


if __name__ == "__main__":
    print(json.dumps(run(), indent=1))
