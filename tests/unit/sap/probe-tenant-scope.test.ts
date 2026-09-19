/**
 * A probe belongs to the tenant that was probed — and to its OWNER.
 *
 * THE LEAK THIS CLOSES is invisible in any single file, which is why it
 * survived. Three facts have to be held at once:
 *
 *   1. `SapHubContent` has NO organizationId — `@@unique([contentType,
 *      externalId])`, one global row per SAP content item, shared by every
 *      organization on the deployment.
 *   2. Probe results are merged into `rawMetadataJson.probes[…]` on those rows.
 *   3. `SapConnection` is `@@unique([organizationId, product, key])` — a tenant
 *      key is unique WITHIN an organization, not across them.
 *
 * So two clients who both name a connection "x5m-100" shared one slot on a
 * shared row. The second probe overwrote the first, and the first client's
 * Discover then showed the second client's verdicts about the second client's
 * SAP system under its own tenant name. Which services are live on a named
 * client's estate is that client's information.
 *
 * `requireAdmin` on the probe route never prevented this. It made it rarer.
 */

import { describe, expect, it } from "vitest";

import { mergeStoredProbe, probeStorageKey, readStoredProbe } from "@/lib/sap-public/hub-content";

const PROBE_A = { http: 200, at: "2026-09-18T00:00:00.000Z", read: true, write: false } as const;
const PROBE_B = { http: 403, at: "2026-09-18T01:00:00.000Z", read: false, write: false } as const;

/** The same tenant NAME, owned by two different organizations. Legal today. */
const ORG_A = probeStorageKey({
  source: "connection",
  organizationId: "org-a",
  product: "s4hana",
  tenantKey: "x5m-100",
});
const ORG_B = probeStorageKey({
  source: "connection",
  organizationId: "org-b",
  product: "s4hana",
  tenantKey: "x5m-100",
});

describe("two organizations that name a connection the same", () => {
  it("do not share a slot", () => {
    expect(ORG_A).not.toBe(ORG_B);
  });

  it("cannot read each other's verdict", () => {
    // The whole defect, in four lines: A probes, B probes, and each must still
    // see only their own answer about their own SAP system.
    let raw: unknown = {};
    raw = mergeStoredProbe(raw, ORG_A, PROBE_A);
    raw = mergeStoredProbe(raw, ORG_B, PROBE_B);

    expect(readStoredProbe(raw, ORG_A)?.http).toBe(200);
    expect(readStoredProbe(raw, ORG_B)?.http).toBe(403);
  });

  it("does not let the second probe overwrite the first", () => {
    // Before the owner was part of the key this is exactly what happened: B's
    // run replaced A's, and A's console reported B's tenant as its own.
    let raw: unknown = mergeStoredProbe({}, ORG_A, PROBE_A);
    raw = mergeStoredProbe(raw, ORG_B, PROBE_B);
    const probes = (raw as { probes: Record<string, unknown> }).probes;
    expect(Object.keys(probes).sort()).toEqual([ORG_A, ORG_B].sort());
  });

  it("would have collided on the bare key — the shape of the old bug", () => {
    /*
     * Pinned deliberately: this is what the code used to do. If someone ever
     * keys a probe by the bare tenant name again, the test above goes red and
     * this one explains why.
     */
    let raw: unknown = mergeStoredProbe({}, "x5m-100", PROBE_A);
    raw = mergeStoredProbe(raw, "x5m-100", PROBE_B);
    expect(readStoredProbe(raw, "x5m-100")?.http).toBe(403); // A's 200 is gone
  });
});

describe("a deployment tenant keeps its bare key", () => {
  it("is filed under the plain name, not an organization", () => {
    /*
     * These come from {PREFIX}_* env config and are genuinely shared: every
     * organization reading one is reading the same true thing about the same
     * system. Namespacing them per organization would fragment one fact into
     * N copies and make the first reader's probe invisible to the second.
     */
    const key = probeStorageKey({
      source: "deployment",
      organizationId: "org-a",
      product: "s4hana",
      tenantKey: "x5m-100",
    });
    expect(key).toBe("x5m-100");
  });

  it("is not reachable from a connection-scoped key of the same name", () => {
    const raw = mergeStoredProbe({}, "x5m-100", PROBE_A);
    expect(readStoredProbe(raw, ORG_A)).toBeNull();
  });

  it("still serves the legacy singular slot to the default tenant only", () => {
    // The pre-`probes` storage. It was already scoped correctly; this pins that
    // the owner change did not quietly widen it.
    const legacy = { probe: PROBE_A };
    expect(readStoredProbe(legacy, "x5m-100", "x5m-100")?.http).toBe(200);
    expect(readStoredProbe(legacy, "other-tenant", "x5m-100")).toBeNull();
    expect(readStoredProbe(legacy, ORG_A, "x5m-100")).toBeNull();
  });
});

describe("the key carries everything that makes a tenant distinct", () => {
  it("separates the same name under different products", () => {
    // One organization may run "prod" on S/4 and on SuccessFactors; they are
    // different systems and their probes are different facts.
    const s4 = probeStorageKey({
      source: "connection",
      organizationId: "org-a",
      product: "s4hana",
      tenantKey: "prod",
    });
    const sf = probeStorageKey({
      source: "connection",
      organizationId: "org-a",
      product: "successfactors",
      tenantKey: "prod",
    });
    expect(s4).not.toBe(sf);
  });

  it("never files a connection under the shared bare-key slot", () => {
    // A connection with no organization cannot exist; if one is ever passed,
    // it must not land where every organization reads.
    const orphan = probeStorageKey({
      source: "connection",
      organizationId: null,
      product: "s4hana",
      tenantKey: "x5m-100",
    });
    expect(orphan).not.toBe("x5m-100");
  });

  it("is stable for the same inputs, so a write and a read agree", () => {
    const once = probeStorageKey({
      source: "connection",
      organizationId: "org-a",
      product: "s4hana",
      tenantKey: "x5m-100",
    });
    expect(once).toBe(ORG_A);
  });
});
