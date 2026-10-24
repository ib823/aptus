"""S7: exhaustive (bounded) model checking of the budget approval workflow.

One budget sheet, three users, requested / recommended / approved value layers (FI-PB-003),
delegation, role revocation and one amendment cycle. Every reachable state is explored by BFS;
invariants are checked on every transition and liveness on the full reachable graph.

Design variants (each adds controls to the previous one):
  V0 role checks only (edits allowed after submit, admin may edit approved data, delegation free)
  V1 + segregation of duties checked against the *assigned* approver (the usual first implementation)
  V2 + no edits after submit; approved data changes only through an amendment revision
  V3 + SoD checked against the *executing* user (covers delegation) for reviewer and approver,
       and approval requires a current recommendation
  V4 + an audited escalation path: whenever no eligible reviewer/approver exists, an administrator
       assigns a substitute who did not edit (or recommend) this revision
"""
from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass, replace

USERS = ("u1", "u2", "u3")
ROLE_CONFIGS = {
    "K1 separate people": {("u1", "P"), ("u2", "R"), ("u3", "A"), ("u3", "X")},
    "K2 preparer also approver": {("u1", "P"), ("u1", "A"), ("u2", "R"), ("u3", "A"), ("u3", "X")},
    "K3 reviewer also approver": {("u1", "P"), ("u2", "R"), ("u2", "A"), ("u3", "X")},
    "K4 one-person department": {("u1", "P"), ("u1", "R"), ("u1", "A"), ("u2", "X")},
}


@dataclass(frozen=True)
class S:
    status: str = "Draft"            # Draft Submitted Reviewed Approved Released Returned
    rev: int = 0
    req: int = 0                     # version counter of the requested values
    rec: int = -1                    # requested version the recommendation was based on
    editors: frozenset = frozenset()
    recommender: str | None = None
    approved: tuple | None = None    # (req, rec) frozen at approval
    roles: frozenset = frozenset()
    deleg: frozenset = frozenset()   # (from, to)
    revoked: int = 0
    escalated: int = 0


def has(s, u, r):
    return (u, r) in s.roles


def step(s: S, v: int):
    """Yield (label, next_state, violation or None)."""
    st = s.status
    for u in USERS:
        # ---- edit requested values
        can_edit_states = {"Draft", "Returned"} if v >= 2 else {"Draft", "Returned", "Submitted", "Reviewed"}
        if has(s, u, "P") and st in can_edit_states and s.req < 2:
            yield f"{u}:edit", replace(s, req=s.req + 1, editors=s.editors | {u}), None
        if v < 2 and has(s, u, "X") and st == "Approved" and s.req < 2:
            yield f"{u}:admin-edit-approved", replace(s, req=s.req + 1, editors=s.editors | {u}), \
                "I2 approved data changed in place"
        # ---- submit
        if has(s, u, "P") and st in {"Draft", "Returned"} and s.req >= 1:
            yield f"{u}:submit", replace(s, status="Submitted"), None
        # ---- recommend
        if has(s, u, "R") and st == "Submitted":
            if v >= 3 and u in s.editors:
                pass
            else:
                yield f"{u}:recommend", replace(s, status="Reviewed", rec=s.req, recommender=u), None
        # ---- approve (directly or as delegate)
        if st == "Reviewed":
            principals = [u] if has(s, u, "A") else []
            principals += [a for (a, b) in s.deleg if b == u and has(s, a, "A")]
            for a in principals:
                assigned, executing = a, u
                if v >= 3:
                    if executing in s.editors or executing == s.recommender or s.rec != s.req:
                        continue
                elif v >= 1:
                    if assigned in s.editors:
                        continue
                viol = None
                if executing in s.editors:
                    viol = "I1 approver edited the values they approved (SoD)"
                elif s.rec != s.req:
                    viol = "I5 approved a stale recommendation"
                yield f"{u}:approve(for {a})", replace(s, status="Approved", approved=(s.req, s.rec)), viol
        # ---- reject
        if (has(s, u, "R") or has(s, u, "A")) and st in {"Submitted", "Reviewed"}:
            yield f"{u}:reject", replace(s, status="Returned", rec=-1, recommender=None), None
        # ---- release
        if has(s, u, "X") and st == "Approved":
            viol = None if (s.req, s.rec) == s.approved else "I3 released values differ from approved snapshot"
            yield f"{u}:release", replace(s, status="Released"), viol
        # ---- amend: new revision, previous approval stays immutable
        if (has(s, u, "P") or has(s, u, "X")) and st in {"Approved", "Released"} and s.rev < 1:
            yield f"{u}:amend", replace(s, status="Draft", rev=s.rev + 1, req=0, rec=-1, editors=frozenset(),
                                         recommender=None, approved=None), None
        # ---- delegate approval authority
        if has(s, u, "A") and not s.deleg:
            for w in USERS:
                if w != u:
                    yield f"{u}:delegate->{w}", replace(s, deleg=frozenset({(u, w)})), None
    # ---- environment: an administrator revokes one role assignment (once per trace)
    if s.revoked == 0:
        for (u, r) in sorted(s.roles):
            if r == "A":
                yield f"env:revoke {u}:A", replace(s, roles=s.roles - {(u, r)}, revoked=1), None
    # ---- V4 escalation: audited assignment of a substitute who did not edit or recommend
    if v >= 4 and st in {"Submitted", "Reviewed"}:
        role = "R" if st == "Submitted" else "A"
        eligible = [u for u in USERS if u not in s.editors and (role == "R" or u != s.recommender)]
        if not any(has(s, u, role) for u in eligible):
            for u in eligible:
                yield f"esc:assign substitute {role} {u}", replace(s, roles=s.roles | {(u, role)},
                                                                     escalated=min(s.escalated + 1, 3)), None


def check(v: int, roles: set):
    init = S(roles=frozenset(roles))
    parent = {init: None}
    edges = {}
    q = deque([init])
    violations = {}
    while q:
        s = q.popleft()
        edges[s] = []
        for label, n, viol in step(s, v):
            edges[s].append(n)
            if viol and viol not in violations:
                violations[viol] = trace(parent, s) + [label]
            if n not in parent:
                parent[n] = (s, label)
                q.append(n)
    # liveness: which reachable states can still reach Released?
    good = {s for s in edges if s.status == "Released"}
    changed = True
    while changed:
        changed = False
        for s, outs in edges.items():
            if s not in good and any(n in good for n in outs):
                good.add(s)
                changed = True
    stuck = [s for s in edges if s not in good]
    first_stuck = min(stuck, key=lambda s: len(trace(parent, s))) if stuck else None
    return dict(states=len(edges),
                violations={k: " > ".join(t) for k, t in sorted(violations.items())},
                states_that_can_never_reach_release=len(stuck),
                shortest_trace_to_dead_end=" > ".join(trace(parent, first_stuck)) if first_stuck else None)


def trace(parent, s):
    out = []
    while parent[s] is not None:
        s, label = parent[s]
        out.append(label)
    return out[::-1]


if __name__ == "__main__":
    res = {}
    for v in range(5):
        for name, roles in ROLE_CONFIGS.items():
            res[f"V{v} | {name}"] = check(v, roles)
    print(json.dumps(res, indent=1))
