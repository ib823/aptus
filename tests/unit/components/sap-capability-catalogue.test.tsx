import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SapCapabilityCatalogue } from "@/components/sap/SapCapabilityCatalogue";

const PAYLOAD = {
  data: {
    items: [
      {
        id: "1", contentType: "API", externalId: "API_PO", title: "Purchase Order", description: "Create/read POs",
        packageId: "Procurement", apiType: "ODATAV2", communicationScenarios: ["SAP_COM_0053"], scopeItemCodes: [],
        itemCount: null, hubUrl: "https://api.sap.com/api/API_PO", status: "NOT_CHECKED", availabilityNote: null,
      },
    ],
    total: 1,
    page: 1,
    limit: 50,
    counts: { byType: { API: 941 }, byStatus: { ACTIVATED: 5, NEEDS_SETUP: 12, NOT_FOUND: 3, NOT_CHECKED: 451, NOT_PROBEABLE: 470, AVAILABLE: 0, REFERENCE: 0 }, probeableRuntime: 128, probed: 60, lastProbedAt: "2026-02-02T00:00:00Z" },
    catalogueImported: true,
    tenant: "ABeam TDD",
    isAdmin: true,
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => PAYLOAD }));
});
afterEach(() => vi.unstubAllGlobals());

describe("SapCapabilityCatalogue (CatalogueList) smoke", () => {
  it("mounts with scorecard + type tiles + LoB-grouped list", async () => {
    const { container } = render(<SapCapabilityCatalogue product="s4hana" />);

    // Scorecard — real exposed count from the stored probe + separate catalogue scale.
    expect(await screen.findByText(/authorized of/i)).toBeInTheDocument();
    expect(screen.getByText(/last probed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/941/).length).toBeGreaterThan(0);

    // Content-type tiles show ALL types (APIs present, Events/CDS dimmed).
    expect(screen.getByRole("tab", { name: /All types/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /APIs/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Events/i })).toBeInTheDocument();

    // LoB group header + the item row.
    expect(screen.getByText("Procurement")).toBeInTheDocument();
    expect(screen.getByText("Purchase Order")).toBeInTheDocument();

    // Admin rebuild control is always available in the header (populated state).
    expect(screen.getByRole("button", { name: /Rebuild from API reference/i })).toBeInTheDocument();

    // Search input: no stray autofilled value on load, readonly-until-focus,
    // randomized (non-guessable) name so the browser can't autofill it.
    const searchInput = screen.getByPlaceholderText(/Search title/i) as HTMLInputElement;
    expect(searchInput.value).toBe("");
    expect(searchInput).toHaveAttribute("readonly");
    expect(searchInput.getAttribute("name")).toMatch(/^cap-search-/);
    expect(searchInput.getAttribute("name")).not.toBe("capability-search");

    // The dark-mode scope hook is present on the root.
    expect(container.querySelector("[data-cap-catalogue]")).not.toBeNull();
    // No hardcoded hex leaked into the rendered markup.
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
