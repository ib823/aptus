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

describe("SapCapabilityCatalogue — DEPRECATED rows (2608 WS3)", () => {
  it("shows the Deprecated badge with SAP's successor in the tooltip, and a Deprecated facet", async () => {
    const payload = {
      data: {
        ...PAYLOAD.data,
        items: [
          ...PAYLOAD.data.items,
          {
            id: "2", contentType: "API", externalId: "API_OLD", title: "Old Billing", description: "retired",
            packageId: "Procurement", apiType: "ODATAV2", communicationScenarios: [], scopeItemCodes: [],
            itemCount: null, hubUrl: "https://api.sap.com/api/API_OLD", status: "DEPRECATED", availabilityNote: null,
            hubState: "DEPRECATED", hubVersion: "2608", successorExternalId: "API_BILLING_DOCUMENT_SRV",
          },
        ],
        total: 2,
        // byStatus from an OLDER server payload (no DEPRECATED key) must not break the client.
        counts: { ...PAYLOAD.data.counts, byTypeDeprecated: { API: 56 } },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    render(<SapCapabilityCatalogue product="s4hana" />);
    expect(await screen.findByText("Old Billing")).toBeInTheDocument();

    // The row badge (not the legend swatch) carries the successor tooltip.
    const badges = screen.getAllByLabelText("Deprecated");
    expect(badges.some((b) => b.getAttribute("title") === "Deprecated by SAP — successor: API_BILLING_DOCUMENT_SRV")).toBe(true);
    expect(screen.getByText(/deprecated by SAP — build on the successor/i)).toBeInTheDocument();
    // Tiles carry "of which N deprecated" from byTypeDeprecated.
    expect(screen.getByRole("tab", { name: /APIs: .*56 deprecated/i })).toBeInTheDocument();
    // Scorecard still sums every bucket (DEPRECATED defaulted to 0 from the old payload).
    expect(screen.getAllByText(/941/).length).toBeGreaterThan(0);
  });
});

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

  it("faceted status toolbar shows counts and hides empty facets (but not Not-probeable)", async () => {
    render(<SapCapabilityCatalogue product="s4hana" />);

    // Not-probeable (~470) is always surfaced WITH its count — never hidden.
    const notProbeable = await screen.findByRole("tab", { name: /Not probeable/i });
    expect(notProbeable.textContent).toMatch(/470/);

    // ALL facet shows the edition-wide total (sum of byStatus = 941).
    const all = screen.getByRole("tab", { name: /^All/i });
    expect(all.textContent).toMatch(/941/);

    // Zero-count facets (AVAILABLE:0, REFERENCE:0) are decluttered away.
    expect(screen.queryByRole("tab", { name: /Available/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /Reference/i })).toBeNull();
  });
});
