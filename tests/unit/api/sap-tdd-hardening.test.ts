import { describe, expect, it } from "vitest";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";

describe("WS2e — getSapProduct treats Ariba as known-but-unconfigured", () => {
  it("returns a placeholder (not null) for ariba, with no OData services", () => {
    const ariba = getSapProduct("ariba");
    expect(ariba).not.toBeNull();
    expect(ariba!.key).toBe("ariba");
    expect(ariba!.envPrefix).toBe("ARIBA_TDD"); // no configured OData tenants → "No SAP tenant"
    expect(ariba!.services).toEqual([]);
  });

  it("still returns null for a genuinely unknown product", () => {
    expect(getSapProduct("nope-not-a-product")).toBeNull();
  });

  it("resolves the real OData products", () => {
    expect(getSapProduct("s4hana")?.key).toBe("s4hana");
    expect(getSapProduct("successfactors")?.key).toBe("successfactors");
  });
});

describe("WS2f — /api catch-all returns the JSON error envelope", () => {
  it("404s with { error: { code: NOT_FOUND } } and no-store", async () => {
    const { GET } = await import("@/app/api/[...notFound]/route");
    const req = { nextUrl: { pathname: "/api/does/not/exist" } } as Parameters<typeof GET>[0];
    const res = GET(req);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
