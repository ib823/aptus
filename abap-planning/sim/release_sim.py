"""S9: releasing approved plans to the ERP under faults.

Target semantics:
  REPLACE  delete the scope, insert the payload (financial plan data upload style)
  DELTA    post an additive document (budget entry / transfer style)
Client strategies:
  naive     resend on timeout
  query     on timeout, look the release up in the target by its reference before resending
  key       the target de-duplicates on an idempotency key
  key+fence key, and the target (or a pre-check) refuses a sequence number older than the last applied
Faults per attempt: request lost (2%), acknowledgement lost after commit (2%), middleware
duplicate delivery (1%); per release: overtaken by the next release of the same scope (1%).
A release that still times out after 3 attempts is reported as FAILED (visible, not silent).
"""
from __future__ import annotations

import json
import random

P_LOST_REQ, P_LOST_ACK, P_DUP, P_REORDER = 0.02, 0.02, 0.01, 0.01


def simulate(target, strategy, scopes, seed, k=3):
    rng = random.Random(seed)
    silent_wrong = visible_failed = duplicates = stale = 0
    for _ in range(scopes):
        state_seq, state_val, delta_sum = 0, None, 0
        applied_keys = set()
        intended_total = 0
        deferred = None
        statuses = []

        def apply(seq, payload, delta, key):
            nonlocal state_seq, state_val, delta_sum, duplicates, stale
            if strategy in ("key", "key+fence") and key in applied_keys:
                return
            if strategy == "key+fence" and seq < state_seq:
                return
            if target == "REPLACE":
                if seq < state_seq:
                    stale += 1
                state_seq, state_val = seq, payload
            else:
                if key in applied_keys:
                    duplicates += 1
                delta_sum += delta
            applied_keys.add(key)

        for seq in range(1, k + 1):
            payload = rng.randint(1, 10**9)
            delta = rng.randint(-10**6, 10**6)
            intended_total += delta
            key = (seq, payload)
            ok = False
            reorder = rng.random() < P_REORDER and seq < k
            for _attempt in range(3):
                r = rng.random()
                if reorder and deferred is None:
                    deferred = (seq, payload, delta, key)       # arrives after the next release
                    r = 1.0 - P_LOST_ACK / 2                     # client sees a timeout
                    timed_out = True
                elif r < P_LOST_REQ:
                    timed_out = True
                elif r < P_LOST_REQ + P_LOST_ACK:
                    apply(seq, payload, delta, key)
                    timed_out = True
                elif r < P_LOST_REQ + P_LOST_ACK + P_DUP:
                    apply(seq, payload, delta, key)
                    apply(seq, payload, delta, key)
                    timed_out = False
                else:
                    apply(seq, payload, delta, key)
                    timed_out = False
                if not timed_out:
                    ok = True
                    break
                if strategy == "query" and key in applied_keys:
                    ok = True
                    break
            statuses.append(ok)
            if deferred is not None and deferred[0] != seq:
                apply(*deferred)
                deferred = None
        if deferred is not None:
            apply(*deferred)
        visible_failed += not all(statuses)
        if all(statuses):
            if target == "REPLACE" and state_seq != k:
                silent_wrong += 1
            if target == "DELTA" and delta_sum != intended_total:
                silent_wrong += 1
    return dict(scopes=scopes, silent_wrong_pct=round(100 * silent_wrong / scopes, 3),
                visible_failed_pct=round(100 * visible_failed / scopes, 3),
                duplicate_postings=duplicates, stale_overwrites=stale)


def scope_mismatch_example():
    """Deterministic: REPLACE scope = (version, fiscal year, company code) holds 40 cost centres;
    the approved payload covers 38 because two were split out for later approval."""
    before = {f"CC{i:02d}": 100_000 for i in range(40)}
    payload = {f"CC{i:02d}": 110_000 for i in range(38)}
    after = dict(payload)                       # delete scope, insert payload
    lost = sorted(set(before) - set(after))
    return dict(cost_centres_in_scope=40, in_payload=38, plans_deleted=lost,
                value_deleted=sum(before[c] for c in lost))


if __name__ == "__main__":
    out = {}
    for target in ("REPLACE", "DELTA"):
        for strategy in ("naive", "query", "key", "key+fence"):
            out[f"{target} / {strategy}"] = simulate(target, strategy, 200_000, 901)
    out["scope_mismatch_example"] = scope_mismatch_example()
    print(json.dumps(out, indent=1))
