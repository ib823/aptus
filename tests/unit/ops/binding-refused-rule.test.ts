/**
 * The critical rule watches something that can actually happen.
 *
 * WHAT THIS REPLACES. `binding-mismatch` fired when "an audited call has a
 * connection environment that differs from the credential's". It was written
 * against a real defect: the broker once could serve a PROD connection while the
 * audit row sincerely said SANDBOX.
 *
 * That defect was then fixed by making the mismatch IMPOSSIBLE rather than
 * detectable. `resolveSapConnectionForEnvironment` returns a connection only
 * when its environment EQUALS the credential's, or when a single undeclared
 * connection exists — recorded as unverified, never as agreement. Every other
 * case refuses. The two operands became equal by construction.
 *
 * NOBODY REMOVED THE DETECTOR. The product went on advertising a CRITICAL
 * control it was architecturally incapable of firing, reporting `mismatch: 0` as
 * though that meant something, across four separate test runs that each went
 * looking for it. Establishing the negative took a controlled experiment — one
 * credential reissued from PROD to DEV against the same interface, the
 * connection following the credential both times — plus a control proving two
 * sibling rules at the same threshold DID fire in the same window.
 *
 * A detector that outlives its defect is worse than none, because it occupies
 * the space where a working one would go and reports silence as safety.
 *
 * The binding guarantee turned mismatches into REFUSALS, and refusals were
 * scored by nothing: they audit as HTTP 403 with a null connection, identical to
 * a grant-gate refusal, until `bindingRefusal` carried the reason. That is the
 * real, observable, previously-invisible event this rule now watches.
 */

import { describe, expect, it } from "vitest";

import { INCIDENT_RULES, INCIDENT_THRESHOLDS, deriveIncidents } from "@/lib/ops/incidents";

const NONE = {
  bindingRefusals: 0,
  unhealthyConnections: 0,
  upstreamErrors: 0,
  throttled: 0,
  expiringCredentials: 0,
  // The real field name. It was 'undeclaredEnvironments' here and vitest passed
  // anyway: a missing property is undefined, undefined >= 1 is false, so 'stays
  // silent when nothing was refused' was green for the wrong reason. Vitest does
  // not typecheck, so a malformed fixture sails straight through — only
  // tsc --noEmit caught it. A guard can be green and wrong in its own setup.
  undeclaredEnvironmentConnections: 0,
    unboundedGrants: 0,
    credentialsWithoutExpiry: 0,
    unaccountableProdGrants: 0,
} as const;

describe("the replaced rule is gone, and its replacement is still critical", () => {
  it("no longer defines a rule that compares two equal-by-construction columns", () => {
    const ids = Object.values(INCIDENT_RULES).map((r) => r.id);
    expect(
      ids,
      "binding-mismatch cannot fire: the resolver refuses rather than serving a " +
        "mismatched connection, so the comparison is never unequal",
    ).not.toContain("binding-mismatch");
    expect(ids).toContain("binding-refused");
  });

  it("keeps the severity, because the product should not quietly lose a critical", () => {
    expect(INCIDENT_RULES.bindingRefused.severity).toBe("critical");
    // Was "exactly one critical rule". Two standing-access rules joined it:
    // an unbounded grant and an unaccountable PROD grant are both past-tense
    // and irreversible, which is what the critical band means here.
    const criticalIds = Object.values(INCIDENT_RULES)
      .filter((r) => r.severity === "critical")
      .map((r) => r.id)
      .sort();
    expect(criticalIds).toEqual([
      "binding-refused",
      "unaccountable-prod-grant",
      "unbounded-grant",
    ]);
  });

  it("describes a refusal, not a comparison", () => {
    const when = INCIDENT_RULES.bindingRefused.firesWhen.toLowerCase();
    expect(when).toContain("refused");
    expect(
      when,
      "the wording must not describe an environment that DIFFERS — that is the " +
        "condition the architecture prevents",
    ).not.toContain("differs");
  });

  it("keeps every rule reachable from the exported map", () => {
    // Six original rules plus the three standing-access rules. The count is
    // asserted so a rule cannot be dropped in a refactor without a test saying
    // so — the failure mode this whole file exists to prevent.
    expect(Object.keys(INCIDENT_RULES)).toHaveLength(9);
  });
});

describe("it fires on what actually happens", () => {
  it("stays silent when nothing was refused", () => {
    expect(deriveIncidents({ ...NONE })).toHaveLength(0);
  });

  it("fires on a single refusal — one broken integration is enough", () => {
    const out = deriveIncidents({ ...NONE, bindingRefusals: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("binding-refused");
    expect(out[0]!.severity).toBe("critical");
  });

  it("threshold is 1, so silence means silence and not 'below the bar'", () => {
    // The old rule's threshold was also 1, which is how it was established that
    // the threshold was never the reason for the silence.
    expect(INCIDENT_THRESHOLDS.bindingRefused).toBe(1);
  });

  it("carries remediation that names the AMBIGUOUS case, not only the missing one", () => {
    // Two active connections claiming one environment refuse just as hard as
    // none, and the fix is the opposite action — deactivate rather than create.
    const r = INCIDENT_RULES.bindingRefused.remediation.toLowerCase();
    expect(r).toContain("ambiguous");
    expect(r).toMatch(/one active|exactly one/);
  });
});
