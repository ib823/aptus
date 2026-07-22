import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActivatedServicesList } from "@/components/sap/operations/ActivatedServicesList";

/**
 * WS2 — "All activated services": the full activated set for a tenant, beyond
 * the curated 4, as collapsed cards. The load discipline is the point:
 *   • the LIST render must issue ZERO tenant reads (no /preview, no per-item
 *     detail probe) until a card is expanded;
 *   • expanding a non-curated activated card opens WS1's detail → live rows;
 *   • switching tenant re-derives the whole set from that tenant's ACTIVATED ids.
 */

// One activated item per tenant, so a tenant switch is observable.
const ITEMS: Record<string, Array<Record<string, unknown>>> = {
  X5M_100: [
    { id: "hc_bp", externalId: "API_BUSINESS_PARTNER", title: "Business Partner (A2X)", contentType: "API", apiType: "ODATAV2", status: "ACTIVATED", capability: { read: true, write: false }, itemCount: 1, packageId: "pkg" },
  ],
  X5M_200: [
    { id: "hc_so", externalId: "API_SALES_ORDER_SRV", title: "Sales Order (A2X)", contentType: "API", apiType: "ODATAV2", status: "ACTIVATED", capability: { read: true, write: true }, itemCount: 1, packageId: "pkg" },
  ],
};

// Detail payload for GET /hub-content/[id] — one readable entity set.
const DETAIL = (title: string, externalId: string) => ({
  data: {
    item: { id: "x", contentType: "API", externalId, title, description: "", packageId: "pkg", apiType: "ODATAV2", communicationScenarios: [], hubUrl: "https://api.sap.com" },
    status: "ACTIVATED",
    ladder: "readable",
    entities: [{ name: "A_Root", readable: true, creatable: false, updatable: false, deletable: false, pageable: true }],
    capability: { read: true, write: false },
    metadataFlavor: null,
    probeStatus: 200,
    dependencies: { communicationScenarios: [], prerequisiteScopeItems: [], prerequisiteNote: null, debugHint: "HTTP 200." },
    steps: [],
  },
});

function classify(url: string): "list" | "detail" | "preview" | "other" {
  if (url.includes("/preview")) return "preview";
  if (/\/hub-content\/[^?]/.test(url)) return "detail"; // /hub-content/<id>
  if (url.includes("/hub-content?")) return "list"; // /hub-content?...
  return "other";
}

function mockFetch() {
  return vi.fn((input: string) => {
    const url = String(input);
    switch (classify(url)) {
      case "list": {
        const tenant = new URL(url, "http://t").searchParams.get("tenant") ?? "";
        const items = ITEMS[tenant] ?? [];
        return Promise.resolve({ json: () => Promise.resolve({ data: { items, total: items.length } }) } as Response);
      }
      case "detail":
        return Promise.resolve({ json: () => Promise.resolve(DETAIL("Business Partner (A2X)", "API_BUSINESS_PARTNER")) } as Response);
      case "preview":
        return Promise.resolve({ json: () => Promise.resolve({ data: { ok: true, status: 200, durationMs: 30, fields: ["Id"], rows: [{ Id: "42" }] } }) } as Response);
      default:
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }
  });
}

function calls(kind: "list" | "detail" | "preview") {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => classify(String(c[0])) === kind);
}

beforeEach(() => vi.stubGlobal("fetch", mockFetch()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivatedServicesList — load discipline (WS2)", () => {
  it("renders the activated cards but issues ZERO /preview (and zero detail) reads on list render", async () => {
    render(<ActivatedServicesList product="s4hana" tenantKey="X5M_100" />);
    await screen.findByText("Business Partner (A2X)");
    // The list fetched exactly its own page, and NOTHING that touches the tenant.
    expect(calls("list")).toHaveLength(1);
    expect(calls("detail")).toHaveLength(0);
    expect(calls("preview")).toHaveLength(0);
  });

  it("expanding a non-curated activated card opens the detail, then reads live rows on demand", async () => {
    render(<ActivatedServicesList product="s4hana" tenantKey="X5M_100" />);
    const card = await screen.findByRole("button", { name: /Business Partner/ });
    // Still no tenant reads before the click.
    expect(calls("preview")).toHaveLength(0);
    fireEvent.click(card);
    // Expand mounts CapabilityDetail → one detail probe, still zero preview.
    await waitFor(() => expect(calls("detail")).toHaveLength(1));
    expect(calls("preview")).toHaveLength(0);
    // Now open the entity's rows → exactly one preview read.
    fireEvent.click(await screen.findByRole("button", { name: /A_Root/ }));
    await waitFor(() => expect(screen.getByText("42")).toBeTruthy());
    expect(calls("preview")).toHaveLength(1);
  });

  it("switching tenant re-derives the activated set from the new tenant", async () => {
    const { rerender } = render(<ActivatedServicesList product="s4hana" tenantKey="X5M_100" />);
    await screen.findByText("Business Partner (A2X)");
    rerender(<ActivatedServicesList product="s4hana" tenantKey="X5M_200" />);
    // The other tenant's activated service replaces the first — a fresh list read.
    await screen.findByText("Sales Order (A2X)");
    expect(screen.queryByText("Business Partner (A2X)")).toBeNull();
    const listUrls = calls("list").map((c) => String(c[0]));
    expect(listUrls.some((u) => u.includes("tenant=X5M_100"))).toBe(true);
    expect(listUrls.some((u) => u.includes("tenant=X5M_200"))).toBe(true);
  });
});
