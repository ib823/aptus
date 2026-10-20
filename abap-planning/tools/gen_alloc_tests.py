"""Generate ZCL_PLN_ALLOCATOR's ABAP Unit test include: hand-written behaviour tests, an in-ABAP
property test, and a differential table of cases whose expected results come from the Python
reference implementation (simulation suite, strategy R6 / bound-checked leaf-level)."""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
from alloc import r_hamilton_key_signed  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "src" / "zcl_pln_allocator.clas.testclasses.abap"
rng = random.Random(20261020)
import os
EMULATOR = os.environ.get("EMULATOR") == "1"
LIMIT = 2**53
large_split = []


def literal_lines(var, text, indent="    "):
    chunks = [text[i:i + 110] for i in range(0, len(text), 110)] or [""]
    first = f"{indent}APPEND `{chunks[0]}`"
    rest = "".join(f"\n{indent}    && `{c}`" for c in chunks[1:])
    return f"{first}{rest} TO {var}."


def split_cases(n):
    lines = []
    for _ in range(n):
        k = rng.randint(1, 14)
        style = rng.random()
        if style < 0.3:
            w = [1] * k
        elif style < 0.5:
            w = [rng.randint(0, 12) for _ in range(k)]
        else:
            w = [0 if rng.random() < 0.2 else rng.randint(1, 999_999) for _ in range(k)]
        if sum(w) == 0:
            w[rng.randrange(k)] = 1
        total = rng.choice([rng.randint(-3 * k, 3 * k), rng.randint(-10**12, 10**12)])
        keys = [f"K{x:06d}" for x in rng.sample(range(10**6), k)]
        exp = r_hamilton_key_signed(total, w, keys)
        row = f"{total}|" + ",".join(f"{a}:{b}" for a, b in zip(keys, w)) + "|" + ",".join(map(str, exp))
        if abs(total) * max(w) >= LIMIT:
            large_split.append(row)
            continue
        lines.append(row)
    return lines


def set_total_cases(n):
    lines = []
    for _ in range(n):
        k = rng.randint(1, 12)
        vals = [0 if rng.random() < 0.1 else rng.randint(1, 5_000_000) for _ in range(k)]
        locked = [rng.random() < 0.25 for _ in range(k)]
        keys = [f"L{x:06d}" for x in rng.sample(range(10**6), k)]
        cur = sum(vals)
        target = max(0, cur + rng.randint(-cur // 2 - 1, cur // 2 + 1)) if rng.random() < 0.85 else rng.randint(0, cur + 1)
        fixed = sum(v for v, lk in zip(vals, locked) if lk)
        elig = [(kk, v) for kk, v, lk in zip(keys, vals, locked) if not lk]
        delta = target - cur
        if delta == 0:
            exp = "OK:" + ",".join(map(str, vals))
        elif not elig:
            exp = "ERR:ALL_LOCKED"
        elif target - fixed < 0:
            exp = "ERR:BELOW_LOCKED_TOTAL"
        elif sum(v for _, v in elig) == 0:
            exp = "ERR:NO_DRIVER"
        else:
            sh = dict(zip([kk for kk, _ in elig], r_hamilton_key_signed(delta, [v for _, v in elig], [kk for kk, _ in elig])))
            exp = "OK:" + ",".join(str(v + sh.get(kk, 0)) for kk, v in zip(keys, vals))
        lines.append(f"{target}|" + ",".join(f"{a}:{v}:{'X' if lk else ''}" for a, v, lk in zip(keys, vals, locked)) + "|" + exp)
    return lines


split_lines = []
while len(split_lines) < 1200:
    split_lines += split_cases(1200 - len(split_lines))
large_split = large_split[:400]
set_lines = set_total_cases(600)

case_methods = []
for name, lines in (("split", split_lines), ("set_total", set_lines), ("kernel", [] if EMULATOR else large_split)):
    for part in range(0, len(lines), 100):
        body = "\n".join(literal_lines("rt_cases", ln) for ln in lines[part:part + 100])
        case_methods.append((f"{name}_cases_{part // 100 + 1:02d}", body))

main = [(m, b) for m, b in case_methods if not m.startswith("kernel")]
kern = [(m, b) for m, b in case_methods if m.startswith("kernel")]
decl = "\n".join(f"    METHODS {m} RETURNING VALUE(rt_cases) TYPE string_table." for m, _ in main)
impl = "\n\n".join(f"  METHOD {m}.\n{b}\n  ENDMETHOD." for m, b in main)
kdecl = "\n".join(f"    METHODS {m} RETURNING VALUE(rt_cases) TYPE string_table." for m, _ in kern)
kimpl = "\n\n".join(f"  METHOD {m}.\n{b}\n  ENDMETHOD." for m, b in kern)
kcalls = "\n".join(f"    APPEND LINES OF {m}( ) TO lt_cases." for m, _ in kern)
split_calls = "\n".join(f"    APPEND LINES OF {m}( ) TO lt_cases." for m, _ in case_methods if m.startswith("split"))
set_calls = "\n".join(f"    APPEND LINES OF {m}( ) TO lt_cases." for m, _ in case_methods if m.startswith("set_total"))

template = Path(__file__).resolve().parent.joinpath("templates", "zcl_pln_allocator.tests.tmpl").read_text()
OUT.write_text(template.replace("{{DECL}}", decl).replace("{{IMPL}}", impl)
               .replace("{{SPLIT_CALLS}}", split_calls).replace("{{SET_CALLS}}", set_calls)
               .replace("{{KERNEL_DECL}}", kdecl).replace("{{KERNEL_IMPL}}", kimpl).replace("{{KERNEL_CALLS}}", kcalls))
print(f"wrote {OUT.name}: {len(split_lines)} split cases, {len(set_lines)} set_total cases"
      f" + {0 if EMULATOR else len(large_split)} kernel-only large-magnitude split cases")
