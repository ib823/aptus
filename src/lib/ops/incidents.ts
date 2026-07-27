/**
 * What counts as an incident, and how serious it is.
 *
 * WHY THIS IS A MODULE AND NOT A FEW `if`s IN A ROUTE. Severity is a product
 * decision, and a severity a reader cannot reproduce from the source is a
 * fabricated judgement dressed as a measurement. An operator seeing "CRITICAL"
 * is entitled to know exactly what produced it and at what threshold. So every
 * rule below is a named, exported constant with its threshold, its reasoning and
 * its remediation attached, and `deriveIncidents` is pure — given the same
 * signals it returns the same incidents, and it can be tested without a
 * database.
 *
 * THE SCALE, and what separates the bands:
 *
 *   critical — something has already happened that cannot be undone or that
 *              breaks the product's central promise. Not "very bad", but
 *              "past tense and irreversible".
 *   major    — traffic is failing or a control is unavailable now. Recoverable,
 *              but someone should be looking at it today.
 *   minor    — work queued up. Nothing is broken; something will break, or a
 *              backlog is not clearing.
 *
 * NOTHING HERE INVENTS A SIGNAL. Every input is a count this deployment
 * actually records. Where a feed under-reports — and the broker audit feed does,
 * see `provenance.floorNotCensus` on the traffic endpoints — an incident derived
 * from it is a floor too, which is why no rule fires on the ABSENCE of activity.
 * "No errors in the window" and "no rows in the window" are indistinguishable
 * here, so neither is ever reported as health.
 */

export type IncidentSeverity = "critical" | "major" | "minor";

/** Firing thresholds, named so a number on a screen traces back to a line here. */
export const INCIDENT_THRESHOLDS = {
  /** One is too many: it means a call was served from an undeclared landscape. */
  bindingMismatch: 1,
  /** One unhealthy connection is one integration that is down. */
  connectionUnhealthy: 1,
  /**
   * Upstream 5xx are noisy by nature — SAP systems have transient failures, and
   * paging on a single one trains people to ignore the screen. Five in the
   * window is a pattern rather than a blip.
   */
  upstreamErrors: 5,
  /**
   * Throttling is the system working as designed, so it is only worth raising
   * once it is sustained enough to mean a client is misconfigured or looping.
   */
  throttled: 10,
  /** Any credential inside its expiry runway. */
  expiringCredential: 1,
  /** Any connection still undeclared. The backlog is meant to reach zero. */
  undeclaredEnvironment: 1,
} as const;

export interface IncidentRule {
  id: string;
  severity: IncidentSeverity;
  title: string;
  /** The exact predicate, in words a reader can check against the code. */
  firesWhen: string;
  whyThisSeverity: string;
  remediation: string;
}

export const INCIDENT_RULES = {
  bindingMismatch: {
    id: "binding-mismatch",
    severity: "critical",
    title: "A call was served from a different landscape than the credential declared",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.bindingMismatch} audited call in the window has a connection environment that differs from the credential's`,
    whyThisSeverity:
      "Past tense and unrepeatable. The call already happened, data already moved, and the audit row records the credential's environment — so the record itself understates what occurred. This is the exact failure the environment binding exists to prevent.",
    remediation:
      "Check the connection's declared environment in Studio against the credential's. Reads through a mismatched pair are refused now; rows in the window predate that or came from a connection whose declaration changed.",
  },
  connectionUnhealthy: {
    id: "connection-unhealthy",
    severity: "major",
    title: "A SAP connection's last probe did not succeed",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.connectionUnhealthy} active connection has a last validation status of UNAUTHORIZED, NOT_FOUND, TIMEOUT or ERROR`,
    whyThisSeverity:
      "Traffic through that connection is failing now, and it is recoverable. It is not critical because nothing incorrect has been written — the calls are simply not landing.",
    remediation: "Re-test the connection in Studio. UNAUTHORIZED usually means rotated SAP credentials.",
  },
  upstreamErrors: {
    id: "upstream-errors",
    severity: "major",
    title: "The upstream SAP system is returning errors",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.upstreamErrors} audited calls in the window returned 5xx`,
    whyThisSeverity:
      "Sustained failure of live traffic. Below the threshold this is transient and paging on it would teach people to ignore the screen.",
    remediation: "Check the SAP tenant's own health before changing anything here — a 5xx is the tenant's answer, not the broker's.",
  },
  throttled: {
    id: "throttled",
    severity: "minor",
    title: "A credential is being rate limited repeatedly",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.throttled} audited calls in the window returned 429`,
    whyThisSeverity:
      "The throttle is working as designed, so nothing is broken. Sustained throttling means a client is looping or under-configured, which is work rather than an outage.",
    remediation: "Identify the credential in the throttle view and check the calling application's retry behaviour.",
  },
  expiringCredential: {
    id: "expiring-credential",
    severity: "minor",
    title: "A credential expires soon",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.expiringCredential} active credential expires within the runway`,
    whyThisSeverity:
      "Nothing is failing yet. It becomes an outage on a known date, which is exactly the kind of thing a console should catch while it is still cheap.",
    remediation: "Rotate the credential in Studio before the expiry. Rotation is immediate and has no overlap window.",
  },
  undeclaredEnvironment: {
    id: "undeclared-environment",
    severity: "minor",
    title: "A connection has not declared its environment",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.undeclaredEnvironment} active connection has no environment set`,
    whyThisSeverity:
      "Reads through it are served but marked unverified, and writes are refused outright — so it is a backlog with a known consequence rather than a failure. It is listed because a count that never falls is the signal that the permissive read rule has quietly become permanent.",
    remediation: "Set the environment on the connection in Studio.",
  },
} as const satisfies Record<string, IncidentRule>;

/** Every signal a rule can fire on. Counts this deployment actually records. */
export interface IncidentSignals {
  bindingMismatches: number;
  unhealthyConnections: number;
  upstreamErrors: number;
  throttled: number;
  expiringCredentials: number;
  undeclaredEnvironmentConnections: number;
}

export interface Incident {
  id: string;
  severity: IncidentSeverity;
  title: string;
  /** What was actually counted, so the number and the rule sit side by side. */
  observed: number;
  threshold: number;
  firesWhen: string;
  whyThisSeverity: string;
  remediation: string;
}

const SEVERITY_ORDER: Record<IncidentSeverity, number> = { critical: 0, major: 1, minor: 2 };

/**
 * Turn signals into incidents. Pure: same input, same output, no clock, no
 * database. Every branch is a threshold comparison against a named constant.
 */
export function deriveIncidents(signals: IncidentSignals): Incident[] {
  const pairs: Array<[IncidentRule, number, number]> = [
    [INCIDENT_RULES.bindingMismatch, signals.bindingMismatches, INCIDENT_THRESHOLDS.bindingMismatch],
    [
      INCIDENT_RULES.connectionUnhealthy,
      signals.unhealthyConnections,
      INCIDENT_THRESHOLDS.connectionUnhealthy,
    ],
    [INCIDENT_RULES.upstreamErrors, signals.upstreamErrors, INCIDENT_THRESHOLDS.upstreamErrors],
    [INCIDENT_RULES.throttled, signals.throttled, INCIDENT_THRESHOLDS.throttled],
    [
      INCIDENT_RULES.expiringCredential,
      signals.expiringCredentials,
      INCIDENT_THRESHOLDS.expiringCredential,
    ],
    [
      INCIDENT_RULES.undeclaredEnvironment,
      signals.undeclaredEnvironmentConnections,
      INCIDENT_THRESHOLDS.undeclaredEnvironment,
    ],
  ];

  return pairs
    .filter(([, observed, threshold]) => observed >= threshold)
    .map(([rule, observed, threshold]) => ({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      observed,
      threshold,
      firesWhen: rule.firesWhen,
      whyThisSeverity: rule.whyThisSeverity,
      remediation: rule.remediation,
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
