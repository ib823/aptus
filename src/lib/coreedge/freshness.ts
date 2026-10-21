/**
 * How old a claim may be before the console stops making it.
 *
 * THE LOAD-BEARING CAPABILITY. The handoff is explicit: "Scheduled checks with a
 * stored age are the load-bearing one. Eleven of the eighteen statuses, the
 * entire Operations board, the 24 h fade to Unknown and every 'proven N minutes
 * ago' line depend on it. If only one item on this list ships, it should be that
 * one — the rest degrade gracefully, and this one does not."
 *
 * WHAT WAS ALREADY THERE, and what was not. The audit (F19) found the prober:
 * `sweepConnectionProbes` runs nightly, writes `lastValidationStatus` and
 * `lastValidatedAt`, appends an append-only `SapConnectionProbeEvent` and alerts
 * on the healthy-to-failing transition. What it found MISSING was the TTL — "no
 * code compares lastValidatedAt against a maximum age and no status decays to
 * stale or unknown". So a connection probed once in March still reads green in
 * September.
 *
 * That is the whole bug: green meaning "it worked once" rather than "it worked
 * recently". This module is the comparison that was never written, and the
 * statuses it produces are deliberately Unknown rather than failure — an
 * expired check is a claim about OUR evidence, not about SAP.
 */

/**
 * A lane's proof expires at 24 hours. From the vocabulary's own definition of
 * Unknown: "No check within 24 h. A claim about us, not the lane."
 */
export const LANE_PROOF_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A catalogue badge expires at 7 days, not 24 hours.
 *
 * RESOLVED, not merely recorded. A5's note on the NOT_CHECKED/STALE row reads
 * "TTL 30 d" and the handoff's capability row says "Catalogue badges expire at
 * 7 days". PR-5 took 7 days and left the disagreement standing as an open
 * question; it is now settled at 7 — the tighter of the two, and the one stated
 * as a requirement rather than as an observation.
 *
 * Consumed by the catalogue and the add-feed picker, which render a badge older
 * than this as stale rather than dropping it: "it worked last month" and "it has
 * never worked" are different facts for someone deciding whether to build on a
 * feed.
 */
export const CATALOGUE_BADGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Freshness = "fresh" | "stale" | "never";

/**
 * Whether a stored check is still worth repeating to a user.
 *
 * `never` and `stale` are different answers on purpose: "we have never looked"
 * and "we looked, a while ago" lead to different next steps, and collapsing them
 * is how a brand-new connection looks like a neglected one.
 */
export function freshnessOf(at: Date | null | undefined, ttlMs: number, now: Date = new Date()): Freshness {
  if (at === null || at === undefined) return "never";
  return now.getTime() - at.getTime() <= ttlMs ? "fresh" : "stale";
}

/** Shorthand for the 24-hour lane rule. */
export function laneProofIsFresh(at: Date | null | undefined, now: Date = new Date()): boolean {
  return freshnessOf(at, LANE_PROOF_TTL_MS, now) === "fresh";
}

/**
 * "2 m ago", "4 h ago", "12 d ago".
 *
 * EVERY STATUS IN THIS PRODUCT IS RENDERED WITH AN AGE, and the honesty of the
 * whole board depends on the age being real. This deliberately has no "just now"
 * shortcut below a minute: a claim that something was proven "just now" when it
 * was proven fifty seconds ago is a small lie in the one place the product
 * cannot afford one.
 */
export function describeAge(at: Date | null | undefined, now: Date = new Date()): string | null {
  if (at === null || at === undefined) return null;
  const ms = now.getTime() - at.getTime();
  if (ms < 0) {
    /*
     * A future timestamp means a clock disagreement, not freshness. Saying
     * "in 3 minutes" would be absurd and saying "0 m ago" would be a guess, so
     * it reports the disagreement.
     */
    return "clock skew";
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/**
 * The sentence a stale check earns.
 *
 * Not "unknown" on its own — that is the status. This is the line under it, and
 * it has to say that the absence is ours: an operator who reads Unknown as "SAP
 * is down" will go and wake the wrong team.
 */
export function stalenessReason(at: Date | null | undefined, ttlMs: number, now: Date = new Date()): string | null {
  switch (freshnessOf(at, ttlMs, now)) {
    case "fresh":
      return null;
    case "never":
      return "No check has ever run. This says nothing about SAP — only that we have not looked.";
    case "stale": {
      const age = describeAge(at, now) ?? "some time ago";
      const window = ttlMs === LANE_PROOF_TTL_MS ? "24 hours" : `${Math.round(ttlMs / 86_400_000)} days`;
      return `Last proven ${age}, past the ${window} we are willing to claim it for.`;
    }
  }
}

/**
 * The age of proof as a screen renders it — always a phrase, never nothing.
 *
 * `describeAge` returns null when there is no instant, which a caller can only
 * turn into an omitted age; an omitted age is indistinguishable from a fresh
 * one at a glance, and that is the exact overclaim this product exists to
 * prevent. So "never checked" is a phrase rather than an absence.
 *
 * Use this wherever a status is rendered. The handoff's rule is unqualified:
 * "Every status renders with the age of the check behind it."
 */
export function proofAge(at: Date | null | undefined, now: Date = new Date()): string {
  return describeAge(at, now) ?? "never checked";
}

/* ── connection health (P0.2, A19, A50) ──────────────────────────────────── */

/**
 * A connection's probe proof expires at 48 hours: comfortably more than the
 * nightly probe's interval, so one missed run does not turn the fleet amber,
 * and short enough that a connection nobody has probed since March cannot read
 * green in September (A50). `lastValidatedAt` moves only on a real 200, so an
 * "OK" older than this means no probe has succeeded — or run — since.
 */
export const CONNECTION_PROOF_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * The status the probe sweep and "Probe now" record when a connection's
 * stored secret will not open (A50). No request reached SAP, so it is not a
 * probe outcome; it is recorded anyway, because leaving the previous "OK"
 * standing called a connection healthy that the broker refuses on every call
 * (CONNECTION_UNREADABLE). `lastValidatedAt` is left alone: it is the last
 * time SAP answered.
 */
export const CONNECTION_UNREADABLE_STATUS = "UNREADABLE";

/**
 * The status recorded on a connection whose OWN secret opens, when another
 * active connection for the same product will not (P0.2 review). The broker
 * fails closed on the whole (organization, product) set, so every call through
 * this connection is refused too — but re-entering THIS row's secret fixes
 * nothing, and saying "the secret would not open" here sent the operator to
 * re-save the wrong row. The fix is on the row marked UNREADABLE.
 */
export const CONNECTION_GROUP_UNREADABLE_STATUS = "GROUP_UNREADABLE";

/**
 * Statuses a connection can hold that no probe produced: no request reached
 * SAP. The drift rule never treats one as "was healthy" (incidents.ts
 * `isDriftTransition`), and the probe sweep judges a transition against the
 * last probe that actually ran instead.
 */
export const CONNECTION_NOT_PROBED_STATUSES: readonly string[] = [
  CONNECTION_UNREADABLE_STATUS,
  CONNECTION_GROUP_UNREADABLE_STATUS,
];

/** Probe outcomes that mean SAP is not answering this connection as it should. */
export const CONNECTION_NEEDS_ATTENTION: readonly string[] = ["UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "ERROR"];

export type ConnectionHealthVerdict =
  | "healthy"
  /** The last probe said OK, longer ago than CONNECTION_PROOF_TTL_MS: a claim about our evidence, not SAP. */
  | "stale"
  | "needsAttention"
  /**
   * CoreEdge cannot open a stored secret — this row's (UNREADABLE) or a
   * sibling's for the same product (GROUP_UNREADABLE): ours to fix, and every
   * call is refused.
   */
  | "unreadable"
  /** NO_PROBE_PATH, or a value nobody defined: never assumed healthy. */
  | "unknown"
  | "neverTested";

/**
 * THE ONE READING of a connection's health, for every screen and count that
 * states one (the connections-health route, the topology lens, the SAP systems
 * screen). "OK" alone is not healthy: it must be recent.
 */
export function connectionHealthVerdict(
  c: { readonly lastValidationStatus: string | null; readonly lastValidatedAt: Date | null },
  now: Date = new Date(),
): ConnectionHealthVerdict {
  const status = c.lastValidationStatus;
  if (status === null) return "neverTested";
  if (CONNECTION_NOT_PROBED_STATUSES.includes(status)) return "unreadable";
  if (CONNECTION_NEEDS_ATTENTION.includes(status)) return "needsAttention";
  if (status === "OK") {
    return freshnessOf(c.lastValidatedAt, CONNECTION_PROOF_TTL_MS, now) === "fresh" ? "healthy" : "stale";
  }
  return "unknown";
}

/**
 * The SAP systems screen's "Last probe" cell (A19). Whether a connection was
 * ever checked is decided by its STATUS, not by `lastValidatedAt`: that moves
 * only on a 200, so a connection the sweep probes and finds failing every
 * night read "Never", with its failing status hidden.
 */
export function describeLastProbe(
  c: { readonly lastValidationStatus: string | null; readonly lastValidatedAt: Date | null },
  now: Date = new Date(),
): { readonly headline: string; readonly detail: string | null } {
  if (c.lastValidationStatus === null) return { headline: "Never checked", detail: null };
  const verdict = connectionHealthVerdict(c, now);
  const headline =
    verdict === "stale"
      ? `${c.lastValidationStatus} · stale`
      : c.lastValidationStatus === CONNECTION_GROUP_UNREADABLE_STATUS
        ? `${c.lastValidationStatus} · another connection for this product will not open`
        : verdict === "unreadable"
          ? `${c.lastValidationStatus} · the secret would not open`
          : c.lastValidationStatus;
  return { headline, detail: `last succeeded ${describeAge(c.lastValidatedAt, now) ?? "never"}` };
}
