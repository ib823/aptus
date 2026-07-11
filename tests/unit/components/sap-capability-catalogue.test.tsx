import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SapCapabilityCatalogue } from "@/components/sap/SapCapabilityCatalogue";

const PAYLOAD = {
  data: {
    items: [
      {
        id: "1", contentType: "API", externalId: "API_PO", title: "Purchase Order", description: "Create/read POs",
        packageId: "Procurement", apiType: "ODATAV2", communicationScenarios: ["SAP_COM_0053"], scopeItemCodes: [],
        itemCount: null, hubUrl: "https://api.sap.com/api/API_PO", status: "AVAILABLE", availabilityNote: null,
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
    counts: { byType: { API: 941 }, byStatus: { ACTIVATED: 5, AVAILABLE: 936, REFERENCE: 0 }, probeableRuntime: 128, probed: 60 },
    catalogueImported: true,
    tenant: "ABeam TDD",
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => PAYLOAD }));
});
afterEach(() => vi.unstubAllGlobals());

describe("SapCapabilityCatalogue (CatalogueList) smoke", () => {
  it("mounts with scorecard + type tiles + LoB-grouped list", async () => {
    const { container } = render(<SapCapabilityCatalogue product="s4hana" />);

    // Scorecard — real exposed count as a probe sample + separate catalogue scale.
    expect(await screen.findByText(/activated of/i)).toBeInTheDocument();
    expect(screen.getByText(/live probe sample/i)).toBeInTheDocument();
    expect(screen.getAllByText(/941/).length).toBeGreaterThan(0);

    // Content-type tiles show ALL types (APIs present, Events/CDS dimmed).
    expect(screen.getByRole("tab", { name: /All types/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /APIs/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Events/i })).toBeInTheDocument();

    // LoB group header + the item row.
    expect(screen.getByText("Procurement")).toBeInTheDocument();
    expect(screen.getByText("Purchase Order")).toBeInTheDocument();

    // The dark-mode scope hook is present on the root.
    expect(container.querySelector("[data-cap-catalogue]")).not.toBeNull();
    // No hardcoded hex leaked into the rendered markup.
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
