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
  SF_BASIC_AUTH_SUNSET_ISO,
  assertSuccessFactorsBasicAuthAllowed,
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

describe("SuccessFactors Basic auth sunset", () => {
  const before = new Date("2026-11-19T23:59:59Z");
  const onTheDay = new Date(`${SF_BASIC_AUTH_SUNSET_ISO}T00:00:00Z`);

  it("warns while Basic still works and refuses from the sunset date", () => {
    const warn = successFactorsBasicAuthVerdict("successfactors", "basic", before);
    expect(warn.kind).toBe("allowed");
    const refused = successFactorsBasicAuthVerdict("successfactors", "basic", onTheDay);
    expect(refused.kind).toBe("refused");
    if (refused.kind === "refused") expect(refused.reason).toContain("oauth-saml-bearer");
  });

  it("never touches another product, before or after the date", () => {
    // Breaking S/4HANA to protect SuccessFactors would be the worse bug.
    for (const when of [before, onTheDay]) {
      expect(successFactorsBasicAuthVerdict("s4hana", "basic", when).kind).toBe("not-applicable");
      expect(successFactorsBasicAuthVerdict("ariba", "basic", when).kind).toBe("not-applicable");
      expect(successFactorsBasicAuthVerdict(null, "basic", when).kind).toBe("not-applicable");
    }
  });

  it("ignores SuccessFactors connections that already moved off Basic", () => {
    for (const t of ["oauth-saml-bearer", "bearer", "oauth-client-credentials"]) {
      expect(successFactorsBasicAuthVerdict("successfactors", t, onTheDay).kind).toBe("not-applicable");
    }
  });

  it("throws from the assert helper only where the verdict refuses", () => {
    expect(() => assertSuccessFactorsBasicAuthAllowed("successfactors", "basic", "t", onTheDay)).toThrow(
      /2026-11-20/,
    );
    expect(() =>
      assertSuccessFactorsBasicAuthAllowed("successfactors", "oauth-saml-bearer", "t", onTheDay),
    ).not.toThrow();
    expect(() => assertSuccessFactorsBasicAuthAllowed("s4hana", "basic", "t", onTheDay)).not.toThrow();
  });
});
