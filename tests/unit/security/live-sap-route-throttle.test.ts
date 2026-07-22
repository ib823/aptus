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

  it("does NOT throttle stored-only catalogue reads (no tenant amplification)", () => {
    // hub-content list/detail read Postgres, not the tenant → normal apiRead bucket.
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content")).toBe(false);
    expect(isLiveSapTenantRoute("/api/sap/tdd/hub-content/hc_1")).toBe(false);
    expect(isLiveSapTenantRoute("/api/assessments")).toBe(false);
  });
});
