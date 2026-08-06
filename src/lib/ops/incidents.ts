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

import type { ConnectionBindingFailure } from "@/lib/sap-public/connection-resolver";

export type IncidentSeverity = "critical" | "major" | "minor";

/** Firing thresholds, named so a number on a screen traces back to a line here. */
export const INCIDENT_THRESHOLDS = {
  /** One is too many: it means a call was served from an undeclared landscape. */
  bindingRefused: 1,
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
  /**
   * Any grant that authorises access and has no expiry. Expiry is the ONLY end
   * a grant has, so one without an expiry never ends.
   */
  unboundedGrant: 1,
  /**
   * Any live credential with no expiry. One is enough: it is the state the
   * expiring-credential rule structurally cannot see.
   */
  credentialWithoutExpiry: 1,
  /** Any PROD grant whose solution is unowned or not ACTIVE. */
  unaccountableProdGrant: 1,
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

/*
 * WHAT HAPPENED TO `binding-mismatch`, AND WHY ITS REPLACEMENT IS NOT A RENAME.
 *
 * The old rule read: "at least 1 audited call has a connection environment that
 * differs from the credential's". It was written against a real defect — the
 * broker once could serve a PROD connection while the audit row sincerely said
 * SANDBOX, and nothing in the trail could reveal it.
 *
 * That defect was then fixed, by making the mismatch IMPOSSIBLE rather than
 * merely detectable: `resolveSapConnectionForEnvironment` returns a connection
 * only when its environment equals the credential's, or when a single undeclared
 * connection exists (recorded as unverified, never as agreement). Every other
 * case refuses. So the two operands the rule compared became equal by
 * construction, and the rule could never evaluate true again.
 *
 * IT WAS NEVER REMOVED. For months the product advertised a CRITICAL control it
 * was architecturally incapable of firing, and reported `mismatch: 0` as though
 * that were evidence of something. Four separate test runs went looking for it.
 * It took an agent proving the negative — same interface, same solution, one
 * credential reissued from PROD to DEV, the connection following the credential
 * both times — to establish that the silence was the rule and not the engine.
 *
 * A detector outliving the defect it was built for is worse than no detector,
 * because it occupies the space where a real one would go.
 *
 * SO THIS SCORES WHAT ACTUALLY HAPPENS. The binding guarantee turned mismatches
 * into REFUSALS, and refusals were scored by nothing at all — they audit as a
 * 403 with a null connection, indistinguishable from a grant-gate refusal until
 * `bindingRefusal` was added to carry the reason. That is the real, observable,
 * currently-invisible event: a live credential with an approved grant, calling
 * an environment no connection serves, failing every time.
 */
export const INCIDENT_RULES = {
  bindingRefused: {
    id: "binding-refused",
    severity: "critical",
    title: "A call could not be bound to a connection for its environment",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.bindingRefused} audited call in the window was refused because no connection matched the credential's environment, or because several could and none could be chosen`,
    whyThisSeverity:
      "A solution that believes it is integrated is not, and the failure is silent from the client's side beyond a 403 it cannot act on. It is critical rather than major because the broker is REFUSING to serve rather than serving something wrong — which is the safe behaviour, and is exactly why nothing else will ever surface it. Left unwatched, a credential can be live, granted and useless for as long as nobody calls it.",
    remediation:
      "Declare a connection for that environment in Studio, or point the credential at an environment you have. AMBIGUOUS means two or more active connections claim the same environment for one product: leave exactly one active, because the broker refuses to guess which client system to send a call to.",
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
  /*
   * THE THREE RULES BELOW WATCH STANDING ACCESS, WHICH NOTHING WATCHED.
   *
   * Two controls were tightened after rows had already been written under the
   * looser ones, and neither tightening is retroactive: `evaluateDecision` now
   * refuses a granting decision with no expiry, and credential issue/rotate now
   * refuse an unowned solution. Both are enforced going forward and neither
   * says anything about what already exists.
   *
   * That gap is invisible by construction. `expiring-credential` fires on a
   * credential inside its expiry runway — a credential with NO expiry is never
   * inside any runway, so the one rule that looks at credential lifetimes is
   * precisely blind to the worst case. A count that reads zero because the
   * predicate cannot be satisfied is the failure mode this file already has a
   * long comment about.
   */
  unboundedGrant: {
    id: "unbounded-grant",
    severity: "critical",
    title: "A grant authorises access with no end date",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.unboundedGrant} settled grant confers access and has no expiry date`,
    whyThisSeverity:
      "A settled grant cannot be re-decided, so unless somebody revokes it by hand, nothing will close it. One without an expiry is standing access to a client's SAP system, reachable by leaving a field blank. It stays critical now that revocation exists, because nothing degrades to make it visible: until somebody reads this rule it looks healthy forever.",
    remediation:
      "Revoke the grant in Control Tower with a stated reason, then raise a fresh request bounded by an expiry. Revocation does not re-decide the grant — the original decision stands in the ledger and the withdrawal is recorded beside it.",
  },
  credentialWithoutExpiry: {
    id: "credential-without-expiry",
    severity: "major",
    title: "A live credential has no expiry",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.credentialWithoutExpiry} active, unrevoked credential has no expiry date`,
    whyThisSeverity:
      "A working token that never lapses is a standing key to a client's SAP system, and it is the exact case 'a credential expires soon' cannot report — that rule needs an expiry to compare against. Major rather than critical because the fix is one action by the builder who already holds it: rotation replaces the token in place, without the fresh request an unbounded grant needs.",
    remediation:
      "Rotate the credential in Studio with an expiry set. Rotation replaces the token immediately and has no overlap window.",
  },
  unaccountableProdGrant: {
    id: "unaccountable-prod-grant",
    severity: "critical",
    title: "A production grant is held by a solution nobody owns",
    firesWhen: `at least ${INCIDENT_THRESHOLDS.unaccountableProdGrant} grant conferring PROD access belongs to a solution that is not ACTIVE or has an empty owner slot`,
    whyThisSeverity:
      "The product states that a solution cannot reach ACTIVE without all three owners, and a credential is a stronger thing than ACTIVE status. A DRAFT or unowned solution holding production access means there is no accountable party for reads of a client's live financial data, and no one to ask when the access is questioned.",
    remediation:
      "Assign the technical, business and support owners in Studio, or raise a fresh bounded request against a solution that has them. Check whether the holder is a test artefact that should not exist in this environment at all.",
  },
} as const satisfies Record<string, IncidentRule>;

/**
 * Which binding refusals the `binding-refused` rule counts — and, just as
 * importantly, which it deliberately does not.
 *
 * THIS LIST USED TO LIVE INLINE IN THE OPS QUERY, and drifted the moment a new
 * refusal reason existed. `NO_MATCH_FOR_CLIENT` was added to the resolver when
 * credentials learned to name an SAP client; the query's `in` array was not
 * updated, so a credential bound to a client no connection carries failed every
 * call while this CRITICAL rule reported zero. Exactly the failure mode the
 * comment above describes — a detector that cannot see the thing it exists for.
 *
 * `bindingRefusalCoverage` below forces the choice to be made explicitly for
 * every reason the resolver can return, and a test reconciles the two, so the
 * next reason cannot be added silently.
 */
export const BINDING_REFUSAL_COVERAGE = {
  /** No connection serves the caller's environment. The rule's original case. */
  NO_MATCH_FOR_ENVIRONMENT: "counted",
  /** Several could serve it and none could be chosen. */
  AMBIGUOUS: "counted",
  /**
   * The environment is served, but no connection carries the credential's SAP
   * client. Counted for the same reason as the other two: the credential is
   * live, the grant is approved, and every call fails.
   */
  NO_MATCH_FOR_CLIENT: "counted",
  /**
   * The organization has no connection at all for this product. Excluded
   * deliberately: that is "has not started", not "misconfigured", and the
   * Connections screen already says so plainly.
   */
  NO_CONNECTION: "excluded",
  /**
   * A write against a connection that never declared its landscape. Excluded
   * deliberately: it is the undeclared-environment rule's business, and
   * counting it in both would double-report one estate problem.
   */
  UNDECLARED_ENVIRONMENT_WRITE: "excluded",
  /**
   * A stored connection row could not be resolved (secrets failed to open, or
   * an authType outside the vocabulary). Counted: the credential is live, the
   * grant may be approved, and every call fails on estate state an operator
   * must fix — the same shape as NO_MATCH_FOR_CLIENT. Before this reason
   * existed the failure was an unhandled 500 with no audit row, which no rule
   * could ever see.
   */
  CONNECTION_UNREADABLE: "counted",
} as const satisfies Record<ConnectionBindingFailure, "counted" | "excluded">;

/** The reasons the ops query filters on. Derived, never hand-maintained. */
export const COUNTED_BINDING_REFUSALS = Object.entries(BINDING_REFUSAL_COVERAGE)
  .filter(([, v]) => v === "counted")
  .map(([k]) => k);

/** Every signal a rule can fire on. Counts this deployment actually records. */
export interface IncidentSignals {
  bindingRefusals: number;
  unhealthyConnections: number;
  upstreamErrors: number;
  throttled: number;
  expiringCredentials: number;
  undeclaredEnvironmentConnections: number;
  /** Settled grants that confer access and carry no expiry. */
  unboundedGrants: number;
  /** Active, unrevoked credentials with no expiry date. */
  credentialsWithoutExpiry: number;
  /** PROD grants whose solution is not ACTIVE or has an empty owner slot. */
  unaccountableProdGrants: number;
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
    [INCIDENT_RULES.bindingRefused, signals.bindingRefusals, INCIDENT_THRESHOLDS.bindingRefused],
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
    [
      INCIDENT_RULES.unboundedGrant,
      signals.unboundedGrants,
      INCIDENT_THRESHOLDS.unboundedGrant,
    ],
    [
      INCIDENT_RULES.credentialWithoutExpiry,
      signals.credentialsWithoutExpiry,
      INCIDENT_THRESHOLDS.credentialWithoutExpiry,
    ],
    [
      INCIDENT_RULES.unaccountableProdGrant,
      signals.unaccountableProdGrants,
      INCIDENT_THRESHOLDS.unaccountableProdGrant,
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
