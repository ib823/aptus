// @vitest-environment node
/**
 * 2608 WS8 — the wired-API registry and the SuccessFactors Basic sunset.
 *
 * The registry's whole job is to be checkable against the Hub, so these tests
 * check it against the same harvested catalogue the RECON reads rather than
 * against a fixture. A fixture would let the registry drift from reality,
 * which is the failure this workstream exists to prevent.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  isAribaSourcingV1Pinned,
  resolveAribaEndpoints,
  ARIBA_ENDPOINTS,
} from "@/lib/sap-public/ariba-connector";
import {
  SF_BASIC_AUTH_DEPRECATED_ISO,
  SF_BASIC_AUTH_DELETION_DEFAULT_ISO,
  SF_BASIC_AUTH_DELETION_ENV,
  assertSuccessFactorsBasicAuthAllowed,
  resolveDeletionDateIso,
  successFactorsBasicAuthVerdict,
} from "@/lib/sap-public/sf-basic-auth-sunset";
import { WIRED_APIS, artefactBoundApis, packageBoundApis } from "@/lib/sap-public/wired-apis";

interface Artefact {
  apiId: string;
  packageId?: string;
  status?: string;
  hubState?: string;
  version?: string;
}
const CATALOGUE = JSON.parse(
  readFileSync(path.join(process.cwd(), "sap-references", "api-hub-catalog.json"), "utf8"),
) as { apis: Artefact[] };
const BY_ID = new Map(CATALOGUE.apis.map((a) => [a.apiId, a]));
const state = (a: Artefact): string => (a.hubState ?? a.status ?? "UNKNOWN").toUpperCase();

describe("wired-API registry", () => {
  it("binds every exact entry to an artefact that exists and is ACTIVE on the Hub", () => {
    for (const w of artefactBoundApis()) {
      const a = BY_ID.get(w.apiId!);
      expect(a, `${w.key} → ${w.apiId} missing from the harvested catalogue`).toBeDefined();
      expect(state(a!), `${w.key} → ${w.apiId}`).toBe("ACTIVE");
      expect(a!.packageId, `${w.key} package`).toBe(w.packageId);
    }
  });

  it("records a package and an entity set for every entry it cannot bind exactly", () => {
    // An unmapped entry must say what it is instead of looking like an oversight.
    for (const w of packageBoundApis()) {
      expect(w.entitySet, `${w.key} has no apiId and no entitySet`).toBeTruthy();
      expect(CATALOGUE.apis.some((a) => a.packageId === w.packageId), `${w.key} package`).toBe(true);
    }
  });

  it("does not still point at the two Ariba APIs the Hub deprecated", () => {
    const ids = WIRED_APIS.map((w) => w.apiId);
    expect(ids).not.toContain("sourcing_event");
    expect(ids).not.toContain("sourcing_project_management");
    // …and the successors it does point at are the deprecated ones' replacements.
    expect(state(BY_ID.get("sourcing_event")!)).toBe("DEPRECATED");
    expect(state(BY_ID.get("sourcing_project_management")!)).toBe("DEPRECATED");
    expect(ids).toContain("sourcing_event_v2");
    expect(ids).toContain("sourcing_project_management_v2");
  });

  it("pins the procurement reporting view to v2, whose v1 is deprecated", () => {
    expect(WIRED_APIS.map((w) => w.apiId)).toContain("procurement_reporting_view_v2");
    expect(state(BY_ID.get("procurement_eventstatus")!)).toBe("DEPRECATED");
  });
});

describe("Ariba endpoints", () => {
  it("calls v2 for both sourcing APIs by default", () => {
    const byKey = Object.fromEntries(resolveAribaEndpoints({}).map((e) => [e.key, e.path]));
    expect(byKey["sourcing-events"]).toContain("/v2/");
    expect(byKey["sourcing-projects"]).toContain("/v2/");
  });

  it("restores the v1 paths only when explicitly pinned", () => {
    expect(isAribaSourcingV1Pinned({})).toBe(false);
    expect(isAribaSourcingV1Pinned({ ARIBA_SOURCING_V1: "true" })).toBe(true);
    const pinned = Object.fromEntries(
      resolveAribaEndpoints({ ARIBA_SOURCING_V1: "true" }).map((e) => [e.key, e.path]),
    );
    expect(pinned["sourcing-events"]).toBe("/api/sourcing-eventmanagement/v1/prod/events");
    expect(pinned["sourcing-projects"]).toBe("/api/sourcing-projectmanagement/v1/prod/projects");
    // Nothing else moves when the flag is on.
    expect(pinned["suppliers"]).toBe("/api/supplierdatapagination/v4/prod/vendors");
  });

  it("splits operational reporting into the two APIs the Hub actually publishes", () => {
    const keys = ARIBA_ENDPOINTS.map((e) => e.key);
    expect(keys).not.toContain("operational-views");
    expect(keys).toContain("sourcing-reporting-views");
    expect(keys).toContain("procurement-reporting-views");
  });
});

describe("SuccessFactors Basic auth lifecycle", () => {
  /*
   * TWO DATES, AND THE WINDOW BETWEEN THEM IS THE POINT.
   *
   * The previous guard threw on 2026-11-20 — SAP's RETIREMENT milestone, not the
   * day Basic stops working. SAP's OAuth FAQ puts deletion at a tentative
   * 2027-11-12. Refusing on the earlier date would have taken working customer
   * integrations down roughly a year before SAP did. These tests pin the window.
   */
  const noEnv: Record<string, string | undefined> = {};
  const beforeRetirement = new Date("2026-11-19T23:59:59Z");
  const onRetirement = new Date(`${SF_BASIC_AUTH_DEPRECATED_ISO}T00:00:00Z`);
  const inWindow = new Date("2027-06-01T00:00:00Z");
  const onDeletion = new Date(`${SF_BASIC_AUTH_DELETION_DEFAULT_ISO}T00:00:00Z`);

  it("still WORKS across the retirement window — the regression that mattered", () => {
    // The whole point: retired is not deleted. Neither of these may refuse.
    for (const when of [onRetirement, inWindow]) {
      const v = successFactorsBasicAuthVerdict("successfactors", "basic", when, "t", noEnv);
      expect(v.kind).toBe("deprecated");
    }
    expect(() =>
      assertSuccessFactorsBasicAuthAllowed("successfactors", "basic", "t", onRetirement, noEnv),
    ).not.toThrow();
    expect(() =>
      assertSuccessFactorsBasicAuthAllowed("successfactors", "basic", "t", inWindow, noEnv),
    ).not.toThrow();
  });

  it("warns before retirement, warns harder after it, refuses only from deletion", () => {
    expect(successFactorsBasicAuthVerdict("successfactors", "basic", beforeRetirement, "t", noEnv).kind).toBe("allowed");
    const deprecated = successFactorsBasicAuthVerdict("successfactors", "basic", onRetirement, "t", noEnv);
    expect(deprecated.kind).toBe("deprecated");
    if (deprecated.kind === "deprecated") {
      expect(deprecated.warning).toContain(SF_BASIC_AUTH_DELETION_DEFAULT_ISO);
      expect(deprecated.daysUntilDeletion).toBeGreaterThan(0);
    }
    const refused = successFactorsBasicAuthVerdict("successfactors", "basic", onDeletion, "t", noEnv);
    expect(refused.kind).toBe("refused");
    if (refused.kind === "refused") expect(refused.reason).toContain("oauth-saml-bearer");
  });

  it("tracks SAP when the tentative deletion date moves", () => {
    const moved = { [SF_BASIC_AUTH_DELETION_ENV]: "2028-03-01" };
    // The old default would have refused here; the override must not.
    expect(successFactorsBasicAuthVerdict("successfactors", "basic", onDeletion, "t", moved).kind).toBe("deprecated");
    expect(successFactorsBasicAuthVerdict("successfactors", "basic", new Date("2028-03-01T00:00:00Z"), "t", moved).kind).toBe(
      "refused",
    );
  });

  it("ignores an unparseable override rather than obeying it", () => {
    for (const bad of ["", "soon", "2027-13-45", "11/12/2027"]) {
      expect(resolveDeletionDateIso({ [SF_BASIC_AUTH_DELETION_ENV]: bad })).toBe(
        SF_BASIC_AUTH_DELETION_DEFAULT_ISO,
      );
    }
  });

  it("never touches another product, at any point in the lifecycle", () => {
    // Breaking S/4HANA to protect SuccessFactors would be the worse bug.
    for (const when of [beforeRetirement, onRetirement, inWindow, onDeletion]) {
      expect(successFactorsBasicAuthVerdict("s4hana", "basic", when, "t", noEnv).kind).toBe("not-applicable");
      expect(successFactorsBasicAuthVerdict("ariba", "basic", when, "t", noEnv).kind).toBe("not-applicable");
      expect(successFactorsBasicAuthVerdict(null, "basic", when, "t", noEnv).kind).toBe("not-applicable");
    }
  });

  it("ignores SuccessFactors connections that already moved off Basic", () => {
    for (const t of ["oauth-saml-bearer", "bearer", "oauth-client-credentials"]) {
      expect(successFactorsBasicAuthVerdict("successfactors", t, onDeletion, "t", noEnv).kind).toBe("not-applicable");
    }
  });

  it("throws from the assert helper only once Basic is actually deleted", () => {
    expect(() => assertSuccessFactorsBasicAuthAllowed("successfactors", "basic", "t", onDeletion, noEnv)).toThrow(
      new RegExp(SF_BASIC_AUTH_DELETION_DEFAULT_ISO),
    );
    expect(() =>
      assertSuccessFactorsBasicAuthAllowed("successfactors", "oauth-saml-bearer", "t", onDeletion, noEnv),
    ).not.toThrow();
    expect(() => assertSuccessFactorsBasicAuthAllowed("s4hana", "basic", "t", onDeletion, noEnv)).not.toThrow();
  });
});
