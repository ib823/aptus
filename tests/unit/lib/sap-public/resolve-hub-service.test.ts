import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { sapHubContent: { findFirst: mocks.findFirst } } }));

const { resolveHubService } = await import("@/lib/sap-public/resolve-hub-service");

// Curated service uses a known-good path; the resolver must keep it authoritative.
const CURATED = { key: "purchase-order", label: "Purchase Order", scenario: "SAP_COM_0053", path: "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV", domain: "procurement" };
// The catalogue fallback is scoped to the product's OWN edition now, so the
// fixture must be a real edition product — an edition-less mock resolves only
// its curated services, which is the SF/Ariba behaviour tested below.
const PRODUCT = { key: "s4hana", edition: "PUBLIC", envPrefix: "S4", services: [CURATED] } as unknown as Parameters<typeof resolveHubService>[0];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveHubService (Entity Explorer — spot-read any activated service)", () => {
  it("returns the curated service for a curated key WITHOUT hitting the catalogue", async () => {
    const svc = await resolveHubService(PRODUCT, "purchase-order");
    expect(svc).toEqual(CURATED);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("resolves ANY activated V2 apiId via SapHubContent → a probe target", async () => {
    mocks.findFirst.mockResolvedValue({
      contentType: "API",
      apiType: "ODATAV2",
      externalId: "API_OPLACCTGDOCITEMCUBE_SRV",
      title: "Accounting Document – Read",
      packageId: "Finance",
      communicationScenarios: [],
    });
    const svc = await resolveHubService(PRODUCT, "API_OPLACCTGDOCITEMCUBE_SRV");
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { externalId: "API_OPLACCTGDOCITEMCUBE_SRV", appliesToPublic: true } }),
    );
    expect(svc?.key).toBe("API_OPLACCTGDOCITEMCUBE_SRV");
    expect(svc?.path).toContain("API_OPLACCTGDOCITEMCUBE_SRV");
  });

  it("returns null for an unknown apiId (nothing to inspect → caller 400s honestly)", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await resolveHubService(PRODUCT, "API_DOES_NOT_EXIST")).toBeNull();
  });

  it("scopes the catalogue fallback to the product's own edition", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const PRIVATE = { ...(PRODUCT as object), key: "cloud-erp-private", edition: "PRIVATE" } as typeof PRODUCT;
    await resolveHubService(PRIVATE, "API_SOMETHING");
    // An on-prem/private product must never resolve a PUBLIC-edition row.
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ appliesToPrivate: true }) }),
    );
  });

  it("a non-edition product resolves curated services ONLY — no manufactured S/4 paths", async () => {
    // SuccessFactors rows have no derivable OData path; falling back to the
    // catalogue would build /sap/opu/odata/sap/<id> against an SF host, a URL
    // that is wrong by construction (dynamic-catalog.ts's own warning).
    const SF = { ...(PRODUCT as object), key: "successfactors", edition: null } as typeof PRODUCT;
    expect(await resolveHubService(SF, "API_ANYTHING")).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for a non-probeable row (apiType null → no valid OData path)", async () => {
    mocks.findFirst.mockResolvedValue({
      contentType: "API",
      apiType: null,
      externalId: "SomeCamelCaseService",
      title: "x",
      packageId: null,
      communicationScenarios: [],
    });
    expect(await resolveHubService(PRODUCT, "SomeCamelCaseService")).toBeNull();
  });

  it("returns null for an empty key", async () => {
    expect(await resolveHubService(PRODUCT, "")).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
