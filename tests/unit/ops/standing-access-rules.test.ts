/**
 * Standing access — the conditions nothing was watching.
 *
 * Two governance controls were tightened after rows had already been written
 * under the looser ones, and neither tightening is retroactive. The gap that
 * left is invisible by construction: `expiring-credential` fires on a
 * credential inside its expiry runway, so a credential with NO expiry is never
 * inside any runway, and the one rule that looks at credential lifetimes is
 * precisely blind to the worst case.
 *
 * These rules exist to make that state reportable. The tests pin the predicates
 * AND the severities, because a severity nobody can reproduce from source is the
 * thing this module's header refuses to ship.
 */

import { describe, expect, it } from "vitest";

import {
  INCIDENT_RULES,
  INCIDENT_THRESHOLDS,
  deriveIncidents,
  type IncidentSignals,
} from "@/lib/ops/incidents";

const NONE: IncidentSignals = {
  bindingRefusals: 0,
  unhealthyConnections: 0,
  upstreamErrors: 0,
  throttled: 0,
  expiringCredentials: 0,
  undeclaredEnvironmentConnections: 0,
  unboundedGrants: 0,
  credentialsWithoutExpiry: 0,
  unaccountableProdGrants: 0,
};

function idsFrom(signals: Partial<IncidentSignals>): string[] {
  return deriveIncidents({ ...NONE, ...signals }).map((i) => i.id);
}

describe("unbounded-grant", () => {
  it("fires on a single grant, because one permanent grant is the whole problem", () => {
    expect(INCIDENT_THRESHOLDS.unboundedGrant).toBe(1);
    expect(idsFrom({ unboundedGrants: 1 })).toContain("unbounded-grant");
  });

  it("stays silent when every granting decision is bounded", () => {
    expect(idsFrom({ unboundedGrants: 0 })).not.toContain("unbounded-grant");
  });

  it("is critical, because there is no path to undo it", () => {
    // A settled grant cannot be re-decided and there is no revocation path, so
    // this is past-tense and irreversible — the definition of the band.
    expect(INCIDENT_RULES.unboundedGrant.severity).toBe("critical");
  });

  it("does not promise a remedy the product does not have", () => {
    const remedy = INCIDENT_RULES.unboundedGrant.remediation.toLowerCase();
    expect(remedy).toContain("no in-product way");
  });
});

describe("credential-without-expiry", () => {
  it("fires on a single never-expiring live credential", () => {
    expect(idsFrom({ credentialsWithoutExpiry: 1 })).toContain("credential-without-expiry");
  });

  it("is the case the expiring-credential rule structurally cannot see", () => {
    // Zero credentials inside the runway AND one with no expiry at all: the
    // old rule reports nothing, the new one reports the exposure.
    const ids = idsFrom({ expiringCredentials: 0, credentialsWithoutExpiry: 1 });
    expect(ids).not.toContain("expiring-credential");
    expect(ids).toContain("credential-without-expiry");
  });

  it("is major rather than critical, because rotation is available today", () => {
    expect(INCIDENT_RULES.credentialWithoutExpiry.severity).toBe("major");
  });
});

describe("unaccountable-prod-grant", () => {
  it("fires on a single PROD grant held by an unowned or non-ACTIVE solution", () => {
    expect(idsFrom({ unaccountableProdGrants: 1 })).toContain("unaccountable-prod-grant");
  });

  it("is critical — nobody is accountable for reads of live client data", () => {
    expect(INCIDENT_RULES.unaccountableProdGrant.severity).toBe("critical");
  });

  it("points at the ownership gate as the remedy", () => {
    const remedy = INCIDENT_RULES.unaccountableProdGrant.remediation.toLowerCase();
    expect(remedy).toContain("owner");
  });
});

describe("the three rules together", () => {
  it("are independent — each fires on its own signal only", () => {
    expect(idsFrom({ unboundedGrants: 1 })).toEqual(["unbounded-grant"]);
    expect(idsFrom({ credentialsWithoutExpiry: 1 })).toEqual(["credential-without-expiry"]);
    expect(idsFrom({ unaccountableProdGrants: 1 })).toEqual(["unaccountable-prod-grant"]);
  });

  it("all fire at once on a solution that is every kind of wrong", () => {
    // The QA-Delivery-Tracker shape: a draft, unowned solution holding an
    // unbounded PROD grant and a never-expiring credential.
    const ids = idsFrom({
      unboundedGrants: 1,
      credentialsWithoutExpiry: 1,
      unaccountableProdGrants: 1,
    });
    expect(ids).toHaveLength(3);
  });

  it("sorts criticals ahead of the major one", () => {
    const out = deriveIncidents({
      ...NONE,
      unboundedGrants: 1,
      credentialsWithoutExpiry: 1,
      unaccountableProdGrants: 1,
    });
    expect(out[out.length - 1]!.id).toBe("credential-without-expiry");
  });

  it("reports the observed count beside the threshold, not just a badge", () => {
    const [incident] = deriveIncidents({ ...NONE, unboundedGrants: 4 });
    expect(incident!.observed).toBe(4);
    expect(incident!.threshold).toBe(1);
  });

  it("says nothing at all when standing access is clean", () => {
    expect(deriveIncidents(NONE)).toHaveLength(0);
  });
});
