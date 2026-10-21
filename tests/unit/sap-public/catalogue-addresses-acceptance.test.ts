/**
 * P0.8 acceptance, over the catalogue itself.
 *
 * The fixture is the committed API catalogue snapshot
 * (sap-references/api-hub-catalog.json, SAP's anonymous catalog.svc harvested
 * 2026-09-05), projected exactly as the importer and the Rebuild project it —
 * normalizeRow, the edition mapper, classifyApiTypeById for a missing type —
 * and narrowed to S/4HANA Cloud Public Edition: 919 of its rows are the rows
 * production serves. A synthetic sample could only show the rules work on the
 * cases someone thought of; this shows they hold for every row SAP publishes.
 *
 *   1. 0 wrapper rows are probeable (and there ARE wrapper rows to test).
 *   2. Every DEPRECATED row shows a successor LINE — SAP's named successor
 *      where one is recorded, otherwise an explicit "none recorded" — and the
 *      deploy-time stamp marks each of them DEPRECATED. This is the roadmap's
 *      criterion as amended, not as first written ("each shows a successor"):
 *      SAP names a successor for only a few of them (6 of 61 in production),
 *      and a "none recorded" line passes here. Naming the rest is an open
 *      decision in docs/runbooks/coreedge-catalogue-addresses.md.
 *   3. A V4 row's address reads "verified" only after a recorded 200 at that
 *      exact address, on that system.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeRow, parseJson } from "@/lib/sap-public/api-reference-import";
import {
  addressVerificationScope,
  currentAddressVerification,
} from "@/lib/sap-public/catalogue-address-verification";
import { mapEditionFromProductTags } from "@/lib/sap-public/edition-tags";
import {
  catalogueAddress,
  classifyApiTypeById,
  deprecationHint,
  hubApiToService,
  isProbeable,
  isWrapperApiId,
  resolveHubStatus,
} from "@/lib/sap-public/hub-content";
import { HUB_LIFECYCLE_SNAPSHOT_PATH, parseHubLifecycleSnapshot } from "@/lib/sap-public/hub-lifecycle-snapshot";
import { successorFor } from "@/lib/sap-public/hub-successors";

const ROOT = join(__dirname, "../../..");
const raw = JSON.parse(readFileSync(join(ROOT, HUB_LIFECYCLE_SNAPSHOT_PATH), "utf8")) as unknown;

/** The S/4 Public API rows, as SapHubContent holds them after a Rebuild. */
const CATALOGUE = parseJson(JSON.stringify(raw))
  .map((r) => normalizeRow(r))
  .filter((n): n is NonNullable<typeof n> => n !== null)
  .filter((n) => mapEditionFromProductTags(n.productTags).appliesToPublic)
  .map((n) => ({
    contentType: "API" as const,
    externalId: n.apiId,
    title: n.apiName,
    packageId: null,
    communicationScenarios: n.communicationScenarios,
    apiType: n.apiType ?? classifyApiTypeById(n.apiId),
    hubState: n.hubState,
    successorExternalId: n.successorExternalId,
  }));

describe("P0.8 acceptance over the committed S/4 Public catalogue", () => {
  it("is the catalogue production serves, not a toy", () => {
    expect(CATALOGUE.length).toBeGreaterThan(900);
  });

  describe("1. no wrapper row is probeable", () => {
    const wrappers = CATALOGUE.filter((r) => isWrapperApiId(r.externalId));
    const odataWrappers = wrappers.filter((r) => r.apiType === "ODATAV2" || r.apiType === "ODATAV4");

    it("there are OData-typed wrapper rows to test (production had 148)", () => {
      expect(odataWrappers.length).toBeGreaterThan(100);
    });

    it("0 of them are probeable, resolvable or badged from a stored outcome", () => {
      expect(odataWrappers.filter((r) => isProbeable(r))).toHaveLength(0);
      expect(odataWrappers.filter((r) => hubApiToService(r) !== null)).toHaveLength(0);
      expect(odataWrappers.filter((r) => catalogueAddress(r) !== null)).toHaveLength(0);
      for (const r of odataWrappers) {
        // Whatever an earlier Probe all stored for the malformed address.
        for (const http of [200, 404]) {
          const status = resolveHubStatus(r, new Map([[r.externalId, http]]));
          expect(["NOT_PROBEABLE", "DEPRECATED"]).toContain(status);
        }
      }
    });

    it("every non-wrapper OData row is still probeable — the exclusion took nothing else", () => {
      const others = CATALOGUE.filter(
        (r) => !isWrapperApiId(r.externalId) && (r.apiType === "ODATAV2" || r.apiType === "ODATAV4"),
      );
      expect(others.length).toBeGreaterThan(400);
      expect(others.every((r) => isProbeable(r))).toBe(true);
    });
  });

  describe("2. every DEPRECATED row shows a successor line (SAP-named where recorded, else 'none recorded')", () => {
    const deprecated = CATALOGUE.filter((r) => r.hubState === "DEPRECATED");
    const stamp = new Map(parseHubLifecycleSnapshot(raw).records.map((r) => [r.externalId, r]));

    it("there are deprecated S/4 Public APIs (production showed 0 of 61)", () => {
      expect(deprecated.length).toBeGreaterThanOrEqual(56);
    });

    it("the deploy-time stamp marks each one DEPRECATED, with the same successor", () => {
      for (const r of deprecated) {
        expect(stamp.get(r.externalId)?.hubState, r.externalId).toBe("DEPRECATED");
        expect(stamp.get(r.externalId)?.successorExternalId ?? null, r.externalId).toBe(r.successorExternalId ?? null);
      }
    });

    it("each one renders a successor line: SAP's successor where named, else an explicit none-recorded", () => {
      for (const r of deprecated) {
        const successor = r.successorExternalId ?? successorFor(r.externalId);
        const line = deprecationHint(successor);
        if (successor) expect(line, r.externalId).toContain(`successor: ${successor}`);
        else expect(line, r.externalId).toMatch(/no successor is recorded/);
      }
      // The SAP-named pairs that apply to S/4 Public are named, not "none".
      const named = deprecated.filter((r) => r.successorExternalId);
      expect(named.map((r) => r.externalId)).toEqual(
        expect.arrayContaining(["API_PURCHASEORDER_PROCESS_SRV", "API_PURCHASEREQ_PROCESS_SRV", "API_MAINTENANCEORDER"]),
      );
    });

    it("a deprecated row is DEPRECATED whatever a probe says, and is never counted callable by Probe all", () => {
      for (const r of deprecated) expect(resolveHubStatus(r, new Map([[r.externalId, 200]]))).toBe("DEPRECATED");
    });
  });

  describe("3. a V4 address reads verified only after a recorded 200", () => {
    const v4 = CATALOGUE.filter((r) => catalogueAddress(r)?.protocol === "ODATAV4");
    const scope = addressVerificationScope({
      source: "connection",
      organizationId: "org-a",
      product: "s4hana",
      tenantKey: "x5m-dev",
      connectionId: "conn-dev",
      baseUrl: "https://x5m.example",
    })!;
    const at = new Date("2026-10-20T10:00:00.000Z");

    it("every V4 row is unverified with no record, and verified with a 200 recorded at its address on this system", () => {
      expect(v4.length).toBeGreaterThan(250);
      for (const r of v4) {
        const path = catalogueAddress(r)!.path;
        expect(currentAddressVerification(undefined, { path, scope })).toBeNull();
        const entry = { externalId: r.externalId, servicePath: path, verifiedAt: at, connectionId: "conn-dev", baseUrl: "https://x5m.example" };
        expect(currentAddressVerification(entry, { path, scope })).toEqual(at);
        // …and not by a 200 at another address, on another connection or host.
        expect(currentAddressVerification({ ...entry, servicePath: `${path}x` }, { path, scope })).toBeNull();
        expect(currentAddressVerification({ ...entry, connectionId: "conn-prod" }, { path, scope })).toBeNull();
        expect(currentAddressVerification({ ...entry, baseUrl: "https://other.example" }, { path, scope })).toBeNull();
      }
    });

    it("only the one recorded binding is not a guess; every other V4 address is derived", () => {
      const bases = new Set(v4.map((r) => catalogueAddress(r)!.basis));
      expect([...bases].sort()).toEqual(["derived", "known-binding"]);
      expect(v4.filter((r) => catalogueAddress(r)!.basis === "known-binding").map((r) => r.externalId)).toEqual([
        "CE_PURCHASEORDER_0001",
      ]);
    });
  });
});
