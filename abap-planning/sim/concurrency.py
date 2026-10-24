"""S8: submission-deadline concurrency for different edit/lock granularities.

Synthetic peak: 300 preparers (5 cost centres each, 60 departments of 5 people) plus 10 central
finance users who adjust any cost centre. Edit sessions arrive as a Poisson process over an
8-hour peak; durations are lognormal (median 12 min). A session edits a handful of cells
(40 accounts x 12 periods per cost centre, skewed towards popular accounts).

Designs:
  L-ORG   one exclusive draft for the whole budget version
  L-DEPT  exclusive draft per department version (RAP root = department x version)
  L-CC    exclusive draft per cost-centre sheet (RAP root = cost centre x version)
  O-CC    no draft lock; optimistic ETag per cost-centre sheet (any overlapping save -> reject)
  O-CELL  no draft lock; conflict only if an overlapping session saved one of the same cells
  LWW     no check at all: last writer wins silently (lost updates counted)
"""
from __future__ import annotations

import json
import sys

import numpy as np


def generate(rng, preparers=300, central=10, cc_per_prep=5, hours=8.0, rate_prep=4.0, rate_central=20.0):
    n_cc = preparers * cc_per_prep
    sessions = []
    accounts_p = 1 / np.arange(1, 41) ** 1.1
    accounts_p /= accounts_p.sum()
    for u in range(preparers + central):
        rate = rate_prep if u < preparers else rate_central
        t = float(rng.uniform(0, 60.0 / rate))
        while True:
            if t > hours * 60:
                break
            if u < preparers and rng.random() < 0.9:
                cc = u * cc_per_prep + int(rng.integers(cc_per_prep))          # own cost centre
            elif u < preparers:
                cc = int(rng.integers(n_cc))                                     # colleague's sheet
            else:
                cc = int(rng.integers(n_cc))                                     # central finance
            dur = float(rng.lognormal(np.log(12), 0.8))
            k = int(min(40 * 12, rng.geometric(1 / 15)))
            accts = rng.choice(40, size=k, p=accounts_p)
            periods = rng.integers(12, size=k)
            cells = frozenset(int(a) * 12 + int(p) for a, p in zip(accts, periods))
            sessions.append((t, t + dur, u, cc, cells))
            t += dur + rng.exponential(60.0 / rate)          # one user works one session at a time
    sessions.sort()
    return sessions, n_cc, cc_per_prep


def lock_design(sessions, key):
    """Exclusive lock per resource; a blocked user waits FIFO until the resource is free."""
    free_at = {}
    blocked = 0
    waits = []
    for start, end, u, cc, cells in sessions:
        r = key(u, cc)
        avail = free_at.get(r, 0.0)
        if avail > start:
            blocked += 1
            waits.append(avail - start)
            start, end = avail, avail + (end - start)
        free_at[r] = end
    n = len(sessions)
    return dict(blocked_pct=round(100 * blocked / n, 2),
                mean_wait_min_when_blocked=round(float(np.mean(waits)), 1) if waits else 0.0,
                p95_wait_min_when_blocked=round(float(np.percentile(waits, 95)), 1) if waits else 0.0)


def optimistic(sessions, cell_level):
    """A save is rejected if another session on the same sheet saved inside this session's window
    (and, at cell level, touched an overlapping cell)."""
    by_cc = {}
    for s in sessions:
        by_cc.setdefault(s[3], []).append(s)
    rejected = lost = 0
    for lst in by_cc.values():
        for i, (st, en, u, cc, cells) in enumerate(lst):
            for (st2, en2, u2, _, cells2) in lst:
                if (st2, en2, u2) == (st, en, u):
                    continue
                if st < en2 < en:                       # the other one saved while this one was open
                    overlap = bool(cells & cells2)
                    if not cell_level or overlap:
                        rejected += 1
                        break
        for i, (st, en, u, cc, cells) in enumerate(lst):  # lost updates under last-writer-wins
            for (st2, en2, u2, _, cells2) in lst:
                if st2 < en < en2 and st2 < en and (st2, en2, u2) != (st, en, u) and cells & cells2:
                    lost += 1                           # this save is later overwritten by a stale writer
                    break
    n = len(sessions)
    return rejected, lost, n


def run(seed=801):
    rng = np.random.default_rng(seed)
    sessions, n_cc, cpp = generate(rng)
    dept = lambda u, cc: (cc // cpp) // 5
    out = dict(sessions=len(sessions), cost_centres=n_cc)
    out["L-ORG whole-version draft"] = lock_design(sessions, lambda u, cc: 0)
    out["L-DEPT department draft"] = lock_design(sessions, dept)
    out["L-CC cost-centre draft"] = lock_design(sessions, lambda u, cc: cc)
    rej_cc, lost, n = optimistic(sessions, cell_level=False)
    rej_cell, _, _ = optimistic(sessions, cell_level=True)
    out["O-CC sheet ETag, saves rejected pct"] = round(100 * rej_cc / n, 2)
    out["O-CELL cell-level check, saves rejected pct"] = round(100 * rej_cell / n, 2)
    out["LWW no check, saves silently overwritten pct"] = round(100 * lost / n, 2)
    return out


if __name__ == "__main__":
    print(json.dumps(run(int(sys.argv[1]) if len(sys.argv) > 1 else 801), indent=1))
