import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CapabilityDetail } from "@/components/sap/capability/CapabilityDetail";

/**
 * WS1 — universal "show the data": CapabilityDetail lets a user read the LIVE
 * rows of any readable entity set on demand, with honest states (rows / "No
 * records" / "Not reachable" / error) that never conflate an empty result with
 * needs-setup, and only ever for the tenant it was handed (never a guess).
 */

// Detail payload from GET /hub-content/[id]: one readable + one non-readable set.
const DETAIL = {
  data: {
    item: {
      id: "hc_1",
      contentType: "API",
      externalId: "API_BUSINESS_PARTNER",
      title: "Business Partner (A2X)",
      description: "Read/maintain business partners.",
      packageId: "SAPS4HANACloud",
      apiType: "ODATAV2",
      communicationScenarios: [],
      hubUrl: "https://api.sap.com/api/API_BUSINESS_PARTNER",
    },
    status: "ACTIVATED",
    ladder: "readable",
    entities: [
      { name: "A_BusinessPartner", readable: true, creatable: false, updatable: false, deletable: false, pageable: true },
      { name: "A_Locked", readable: false, creatable: false, updatable: false, deletable: false, pageable: null },
    ],
    capability: { read: true, write: false },
    metadataFlavor: null,
    probeStatus: 200,
    dependencies: { communicationScenarios: [], prerequisiteScopeItems: [], prerequisiteNote: null, debugHint: "HTTP 200 OK." },
    steps: [],
  },
};

// Per-test preview response the mocked /preview call resolves to.
let previewResponse: unknown = null;

function mockFetch() {
  return vi.fn((input: string) => {
    const url = String(input);
    if (url.includes("/hub-content/")) {
      return Promise.resolve({ json: () => Promise.resolve(DETAIL) } as Response);
    }
    if (url.includes("/preview")) {
      return Promise.resolve({ json: () => Promise.resolve(previewResponse) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

beforeEach(() => {
  previewResponse = null;
  vi.stubGlobal("fetch", mockFetch());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderDetail(tenant: string | null = "X5M_100") {
  render(<CapabilityDetail id="hc_1" product="s4hana" tenant={tenant} />);
  // Wait for the detail probe to resolve (title shows).
  await screen.findByText("Business Partner (A2X)");
}

describe("CapabilityDetail — universal live row preview (WS1)", () => {
  it("offers 'view rows' for a readable entity set, plain text for a non-readable one", async () => {
    await renderDetail();
    expect(screen.getByRole("button", { name: /A_BusinessPartner/ })).toBeTruthy();
    // Non-readable set is present but not an actionable button.
    expect(screen.queryByRole("button", { name: /A_Locked/ })).toBeNull();
    expect(screen.getByText("A_Locked")).toBeTruthy();
  });

  it("without a tenant, live reads are disabled (no 'view rows' affordance)", async () => {
    await renderDetail(null);
    expect(screen.queryByRole("button", { name: /A_BusinessPartner/ })).toBeNull();
    expect(screen.getByText("A_BusinessPartner")).toBeTruthy();
  });

  it("reads and renders live rows on click, labelled as a live read from the tenant", async () => {
    previewResponse = {
      data: { ok: true, status: 200, durationMs: 42, fields: ["BusinessPartner", "BusinessPartnerName"], rows: [{ BusinessPartner: "1000001", BusinessPartnerName: "Acme GmbH" }] },
    };
    await renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /A_BusinessPartner/ }));
    await waitFor(() => expect(screen.getByText("Acme GmbH")).toBeTruthy());
    expect(screen.getByText("1000001")).toBeTruthy();
    // Live-read provenance, so stored-vs-live is unambiguous.
    expect(screen.getByText(/Live read/)).toBeTruthy();
    expect(screen.getByText(/X5M_100/)).toBeTruthy();
    // Fired exactly one preview read (on-demand, not per render).
    const previewCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes("/preview"));
    expect(previewCalls).toHaveLength(1);
    // ...and it targeted the item's service + tenant.
    const previewUrl = String(previewCalls[0]?.[0]);
    expect(previewUrl).toContain("service=API_BUSINESS_PARTNER");
    expect(previewUrl).toContain("tenant=X5M_100");
  });

  it("distinguishes an honest empty ('No records') from needs-setup", async () => {
    previewResponse = { data: { ok: true, status: 200, durationMs: 20, fields: [], rows: [] } };
    await renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /A_BusinessPartner/ }));
    await waitFor(() => expect(screen.getByText(/No records/)).toBeTruthy());
    expect(screen.queryByText(/not activated or needs setup/)).toBeNull();
  });

  it("shows 'Not reachable' (needs-setup) for a non-2xx read — never a fake empty", async () => {
    previewResponse = { data: { ok: false, status: 403, durationMs: 15, fields: [], rows: [] } };
    await renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /A_BusinessPartner/ }));
    await waitFor(() => expect(screen.getByText(/Not reachable/)).toBeTruthy());
    expect(screen.getByText(/HTTP 403/)).toBeTruthy();
    expect(screen.queryByText(/No records/)).toBeNull();
  });

  it("surfaces a read error honestly", async () => {
    previewResponse = { error: { message: "SAP preview request failed" } };
    await renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /A_BusinessPartner/ }));
    await waitFor(() => expect(screen.getByText(/Live read failed/)).toBeTruthy());
  });

  it("re-opening a previewed set does not re-read (cached)", async () => {
    previewResponse = { data: { ok: true, status: 200, durationMs: 30, fields: ["BusinessPartner"], rows: [{ BusinessPartner: "1000001" }] } };
    await renderDetail();
    const btn = () => screen.getByRole("button", { name: /A_BusinessPartner/ });
    fireEvent.click(btn());
    await waitFor(() => expect(screen.getByText("1000001")).toBeTruthy());
    fireEvent.click(btn()); // collapse
    fireEvent.click(btn()); // re-open — served from cache
    await waitFor(() => expect(screen.getByText("1000001")).toBeTruthy());
    const previewCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes("/preview"));
    expect(previewCalls).toHaveLength(1);
  });
});
