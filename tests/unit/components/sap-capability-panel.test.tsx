import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SapCapabilityPanel } from "@/components/sap/SapCapabilityPanel";

/*
 * AUDIT A28 — a service whose probe never left, because the tenant's
 * credential could not be obtained, is not "not activated" and not "no
 * response (timeout/network)". The panel used to say both, and its footer
 * then told the reader to request each SAP_COM arrangement.
 */
afterEach(() => vi.unstubAllGlobals());

describe("SapCapabilityPanel — a credential that could not be obtained", () => {
  it("labels the row and the breakdown 'could not authenticate', never 'not activated' or 'timeout/network'", async () => {
    const payload = {
      data: {
        tenant: "ABeam TDD",
        published: 1,
        exposed: 0,
        notActivated: 0,
        byStatus: { auth: 1 },
        catalogueImported: true,
        rows: [
          {
            service: "API_BUSINESS_PARTNER",
            label: "Business Partner",
            scenario: "SAP_COM_0008",
            exposed: false,
            status: 0,
            credentialError: "refused",
            error: "This connection is basic auth but is missing its username or password. Save it again with both filled in.",
          },
        ],
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    render(<SapCapabilityPanel product="s4hana" />);

    const row = (await screen.findByText("Business Partner")).closest("tr")!;
    // The breakdown chip.
    expect(screen.getByText(/could not authenticate to tenant/)).toBeInTheDocument();
    expect(screen.queryByText(/no response \(timeout\/network\)/)).not.toBeInTheDocument();
    // The row: its own badge and the reason, never "not activated" or an HTTP status.
    expect(within(row).getByText(/could not authenticate/)).toBeInTheDocument();
    expect(within(row).getByText(/missing its username or password/)).toBeInTheDocument();
    expect(within(row).queryByText(/not activated/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/HTTP/)).not.toBeInTheDocument();
  });
});
