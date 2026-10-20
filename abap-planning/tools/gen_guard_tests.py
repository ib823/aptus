"""Generate ZCL_PLN_WORKFLOW_GUARD's ABAP Unit test include. Expected decisions are read from the
transition relation of the model-checked workflow (variant V4, all four role configurations):
an action is allowed exactly when the verified model has that transition from that state."""
import random
import sys
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "sim"))
import workflow_mc as wm  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "src" / "zcl_pln_workflow_guard.clas.testclasses.abap"
STATUS = {"Draft": "DRAFT", "Submitted": "SUBMITTED", "Reviewed": "REVIEWED", "Approved": "APPROVED",
          "Released": "RELEASED", "Returned": "RETURNED"}
ACTIONS = {"edit": "EDIT", "submit": "SUBMIT", "recommend": "RECOMMEND", "approve": "APPROVE",
           "reject": "REJECT", "release": "RELEASE", "amend": "AMEND"}
rng = random.Random(20261022)


def reachable(roles):
    init = wm.S(roles=frozenset(roles))
    seen, q = {init}, deque([init])
    while q:
        s = q.popleft()
        for _, n, _ in wm.step(s, 4):
            if n not in seen:
                seen.add(n)
                q.append(n)
    return seen


def encode(s):
    return "|".join([
        STATUS[s.status],
        "X" if s.req >= 1 else "",
        "X" if s.rec == s.req else "",
        "X" if s.approved == (s.req, s.rec) else "",
        ";".join(sorted(s.editors)),
        s.recommender or "",
        ";".join(f"{u}:{r}" for u, r in sorted(s.roles)),
        ";".join(f"{a}>{b}" for a, b in sorted(s.deleg)),
        ";".join(wm.USERS),
    ])


allowed_rows, denied_rows, esc_rows = [], [], []
for roles in wm.ROLE_CONFIGS.values():
    for s in reachable(roles):
        labels = [lbl for lbl, _, _ in wm.step(s, 4)]
        for u in wm.USERS:
            for act, code in ACTIONS.items():
                if act == "edit" and s.req >= 2:        # bounded-model artefact, not a rule
                    continue
                if act == "amend" and s.rev >= 1:       # bounded-model artefact, not a rule
                    continue
                ok = any(lbl == f"{u}:{act}" or lbl.startswith(f"{u}:{act}(") for lbl in labels)
                row = f"{encode(s)}|{u}|{code}|{'X' if ok else ''}"
                (allowed_rows if ok else denied_rows).append(row)
        esc = sorted({lbl.split()[2] for lbl in labels if lbl.startswith("esc:")})   # "esc:assign substitute <role> <user>"
        esc_rows.append(f"{encode(s)}|{esc[0] if esc else ''}")

rows = sorted(set(allowed_rows))
denied = sorted(set(denied_rows))
rows += rng.sample(denied, min(len(denied), 2 * len(rows)))
rng.shuffle(rows)
esc_rows = sorted(set(esc_rows))


def methods(prefix, data):
    out = []
    for i in range(0, len(data), 100):
        name = f"{prefix}_{i // 100 + 1:02d}"
        body = "\n".join(f"    APPEND `{r}` TO rt_cases." for r in data[i:i + 100])
        out.append((name, f"  METHOD {name}.\n{body}\n  ENDMETHOD."))
    return out


dec_m, esc_m = methods("decision_cases", rows), methods("escalation_cases", esc_rows)
decl = "\n".join(f"    METHODS {n} RETURNING VALUE(rt_cases) TYPE string_table." for n, _ in dec_m + esc_m)
impl = "\n\n".join(b for _, b in dec_m + esc_m)
tmpl = Path(__file__).resolve().parent.joinpath("templates", "zcl_pln_workflow_guard.tests.tmpl").read_text()
OUT.write_text(tmpl.replace("{{DECL}}", decl).replace("{{IMPL}}", impl)
               .replace("{{DECISION_CALLS}}", "\n".join(f"    APPEND LINES OF {n}( ) TO lt_cases." for n, _ in dec_m))
               .replace("{{ESCALATION_CALLS}}", "\n".join(f"    APPEND LINES OF {n}( ) TO lt_cases." for n, _ in esc_m)))
print(f"wrote {OUT.name}: {len(rows)} decisions ({len(set(allowed_rows))} allowed, "
      f"{len(rows) - len(set(allowed_rows))} denied sampled from {len(denied)}), {len(esc_rows)} escalation states")
