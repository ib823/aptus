"""Generate ZCL_PLN_MONEY's ABAP Unit test include. Expected values come from Python's exact
Decimal / integer arithmetic with rounding half away from zero (ABAP commercial rounding)."""
import random
from decimal import ROUND_HALF_UP, Decimal, getcontext
from fractions import Fraction
from pathlib import Path

getcontext().prec = 50
OUT = Path(__file__).resolve().parents[1] / "src" / "zcl_pln_money.clas.testclasses.abap"
rng = random.Random(20261021)


def half_away(fr: Fraction) -> int:
    n, d = abs(fr.numerator), fr.denominator
    q, r = divmod(n, d)
    if 2 * r >= d:
        q += 1
    return q if fr >= 0 else -q


def fmt(x: Decimal) -> str:
    s = format(x, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


import os
EMULATOR = os.environ.get("EMULATOR") == "1"
LIMIT = 2**53                     # the open-abap emulator computes DIV/MOD and / in float64
round_cases, minor_cases, convert_cases, convert_large = [], [], [], []
for _ in range(600):
    d = rng.randint(0, 3)
    if rng.random() < 0.5:   # exact ties at the rounding position, positive and negative
        v = (Decimal(rng.randint(-10**9, 10**9)) + Decimal("0.5")).scaleb(-d)
    else:
        v = Decimal(rng.randint(-10**12, 10**12)).scaleb(-rng.randint(d + 1, 6))
    round_cases.append(f"{fmt(v)}|{d}|{fmt(v.quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP))}")
for _ in range(300):
    d = rng.choice([0, 2, 3])
    minor = rng.randint(-10**13, 10**13)
    amount = Decimal(minor).scaleb(-d)
    internal = Decimal(minor).scaleb(-2)
    minor_cases.append(f"{fmt(amount)}|{d}|{minor}|{fmt(internal)}")
while len(convert_cases) < 400 or len(convert_large) < 300:
    ds, dt = rng.choice([0, 2, 3]), rng.choice([0, 2, 3])
    small = len(convert_cases) < 400
    minor = rng.randint(-10**6, 10**6) if small else rng.randint(-10**12, 10**12)
    rate = Decimal(rng.randint(1, 10**7 if small else 10**13)).scaleb(-9)
    ff, tf = rng.choice([1, 1, 10, 100, 1000]), rng.choice([1, 1, 100])
    numerator = abs(minor) * int(rate.scaleb(9)) * tf * 10**dt
    exp = half_away(Fraction(minor) * Fraction(rate) * tf * 10**dt / (10**ds * ff))
    row = f"{minor}|{ds}|{dt}|{fmt(rate)}|{ff}|{tf}|{exp}"
    if numerator < LIMIT and len(convert_cases) < 400:
        convert_cases.append(row)
    elif numerator >= LIMIT and len(convert_large) < 300:
        convert_large.append(row)


def method(name, rows):
    body = "\n".join(f"    APPEND `{r}` TO rt_cases." for r in rows)
    return f"  METHOD {name}.\n{body}\n  ENDMETHOD."


blocks = []
for prefix, rows in (("round", round_cases), ("minor", minor_cases), ("convert", convert_cases),
                     ("kernel", [] if EMULATOR else convert_large)):
    for i in range(0, len(rows), 100):
        blocks.append((f"{prefix}_cases_{i // 100 + 1:02d}", rows[i:i + 100]))

decl = "\n".join(f"    METHODS {n} RETURNING VALUE(rt_cases) TYPE string_table." for n, _ in blocks if not n.startswith("kernel"))
impl = "\n\n".join(method(n, r) for n, r in blocks if not n.startswith("kernel"))
calls = {p: "\n".join(f"    APPEND LINES OF {n}( ) TO lt_cases." for n, _ in blocks if n.startswith(p))
         for p in ("round", "minor", "convert", "kernel")}

tmpl = Path(__file__).resolve().parent.joinpath("templates", "zcl_pln_money.tests.tmpl").read_text()
OUT.write_text(tmpl.replace("{{DECL}}", decl).replace("{{IMPL}}", impl)
               .replace("{{ROUND_CALLS}}", calls["round"]).replace("{{MINOR_CALLS}}", calls["minor"])
               .replace("{{CONVERT_CALLS}}", calls["convert"]).replace("{{KERNEL_CALLS}}", calls["kernel"])
               .replace("{{KERNEL_DECL}}", "\n".join(f"    METHODS {n} RETURNING VALUE(rt_cases) TYPE string_table." for n, _ in blocks if n.startswith("kernel")))
               .replace("{{KERNEL_IMPL}}", "\n\n".join(method(n, r) for n, r in blocks if n.startswith("kernel"))))
print(f"wrote {OUT.name}: {len(round_cases)} rounding, {len(minor_cases)} minor/internal, {len(convert_cases)} conversion cases"
      f" + {0 if EMULATOR else len(convert_large)} kernel-only large-magnitude cases")
