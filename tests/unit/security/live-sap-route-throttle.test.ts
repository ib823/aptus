import { describe, expect, it } from "vitest";
import { isLiveSapTenantRoute } from "@/lib/security/rate-limit";

/**
 * WS4 guardrail — every route that reaches the live SAP tenant must fall into
 * the tight `sapLive` bucket. The universal show-data surface (WS1) fans
 * /preview + /entities out per activated service, so the throttle must cover
 * them regardless of query params — a fan-out must not slip the cap by dropping
 * probe=1.
 */
describe("isLiveSapTenantRoute — throttles everything that hits the tenant", () => {
  it.each([
    "/api/sap/tdd/operations",
    "/api/sap/tdd/preview",
    "/api/sap/tdd/entities",
    "/api/sap/tdd/hub-content/probe-all",
  ])("throttles %s", (p) => {
    expect(isLiveSapTenantRoute(p)).toBe(true);
  });

  it("throttles /preview and /entities independent of query params (pathname-only)", () => {
    // The predicate takes the pathname only; params like ?probe=0 can't dodge it.
    expect(isLiveSapTenantRoute("/api/sap/tdd/entities")).toBe(true);
    expect(isLiveSapTenantRoute("/api/sap/tdd/preview")).toBe(true);
  });

  it("throttles the catalogue routes that CAN go live", () => {
    /*
     * THE OLD PREMISE HERE WAS FALSE AND THIS TEST PINNED IT. "hub-content
     * list/detail read Postgres, not the tenant" was true of the default load
     * and not of the surface: ?dataProbe=1 on the list fires up to 60 live
     * $metadata probes plus 60 one-row data reads, the detail live-probes on
     * every expansion unless probe=0, and /capabilities probes ~60 services
     * per call. The predicate is pathname-only by design, so a route that can
     * go live takes the bucket on every call — a caller must not dodge the
     * throttle by the param it omits.
     */
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content")).toBe(true);
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content/hc_1")).toBe(true);
    expect(isLiveSapTenantRoute("/api/sap/tdd/capabilities")).toBe(true);
    expect(isLiveSapTenantRoute("/api/sap/ariba/call")).toBe(true);
  });

  it("does NOT throttle the admin import endpoints under the same prefix", () => {
    // seed/harvest-import/api-reference-import are DB-only (they fetch GitHub,
    // never the tenant), and the two imports are rapid client-driven chunk
    // loops that a 20/min bucket would break mid-import. api-reference-import
    // WAS caught by the detail-route pattern: the client drives ~12 chunks in
    // quick succession, so the throttle broke the import it was never meant to
    // touch.
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content/seed")).toBe(false);
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content/harvest-import")).toBe(false);
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content/api-reference-import")).toBe(false);
    expect(isLiveSapTenantRoute("/api/assessments")).toBe(false);
  });

  it("throttles every route that WRITES to, or probes, a tenant", () => {
    /*
     * These reached the tenant and sat in the generous default buckets:
     *   - write-test performs $metadata + create + delete — the most amplifying
     *     call under the hub-content prefix, and it was on the EXCLUSION list;
     *   - /write is a CSRF handshake plus a POST to a customer's system;
     *   - the Operations "Probe now" is the identical $metadata probe the
     *     Studio connection test is throttled for;
     *   - broker-run is a full entity-set read through the client's connection.
     */
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content/write-test")).toBe(true);
    expect(isLiveSapTenantRoute("/api/sap/tdd/write")).toBe(true);
    expect(isLiveSapTenantRoute("/api/ops/connections-health/probe")).toBe(true);
    expect(isLiveSapTenantRoute("/api/studio/test/broker-run")).toBe(true);
    expect(isLiveSapTenantRoute("/api/studio/connections/conn_1/test")).toBe(true);
  });
});
