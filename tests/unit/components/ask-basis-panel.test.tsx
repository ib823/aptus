/**
 * "Ask Basis for SAP_COM_xxxx" (roadmap P1.2), rendered.
 *
 * The scenario join itself is tested against PostgreSQL
 * (tests/integration/comm-scenarios.test.ts) and through the detail route in
 * e2e (tests/e2e/discover-tenant.consultant.spec.ts). This is the panel that
 * renders that answer: a call to action naming the scenario while the service
 * is not shown as activated, a copied request with nothing sent anywhere, and
 * one line of information once it is.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AskBasisPanel, type AskBasisData } from "@/components/sap/capability/AskBasisPanel";

const SUPPLIER_INVOICE: AskBasisData = {
  action: true,
  technicalId: "API_SUPPLIERINVOICE_PROCESS_SRV_0001",
  scenarios: [{ id: "SAP_COM_0057", name: "Supplier Invoice Integration", direction: "Inbound", interfaceCount: 4 }],
  release: "2608",
  source: "SAP Help Portal, Available Interfaces for Your Selected Scope",
};

afterEach(() => vi.unstubAllGlobals());

describe("the Ask Basis panel", () => {
  it("names the one scenario to ask for, and what else it opens", () => {
    render(<AskBasisPanel data={SUPPLIER_INVOICE} serviceLabel="Supplier Invoice" />);
    const panel = screen.getByRole("region", { name: "Ask your Basis team" });
    expect(panel).toHaveTextContent("Ask Basis for SAP_COM_0057");
    expect(panel).toHaveTextContent("API_SUPPLIERINVOICE_PROCESS_SRV_0001");
    expect(panel).toHaveTextContent("also enables 3 other interfaces");
    expect(screen.getByRole("button", { name: "Copy a request to Basis for SAP_COM_0057" })).toBeInTheDocument();
  });

  it("copies the request to the clipboard and says so, sending nothing", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<AskBasisPanel data={SUPPLIER_INVOICE} serviceLabel="Supplier Invoice" connectionLabel="S/4HANA DEV" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy a request to Basis for SAP_COM_0057" }));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0]![0];
    expect(text).toContain("communication scenario SAP_COM_0057 (Supplier Invoice Integration)");
    expect(text).toContain('our connection "S/4HANA DEV"');
    expect(text).toContain("API_SUPPLIERINVOICE_PROCESS_SRV_0001 (Supplier Invoice)");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("with several scenarios, says any one of them enables the service", () => {
    render(
      <AskBasisPanel
        data={{
          ...SUPPLIER_INVOICE,
          scenarios: [
            ...SUPPLIER_INVOICE.scenarios,
            { id: "SAP_COM_0369", name: null, direction: "Inbound", interfaceCount: 1 },
          ],
        }}
      />,
    );
    expect(screen.getByRole("region", { name: "Ask your Basis team" })).toHaveTextContent(
      "Ask Basis for one of these communication scenarios",
    );
    expect(screen.getAllByRole("button", { name: /^Copy a request to Basis for SAP_COM_/ })).toHaveLength(2);
  });

  it("once the service is activated, is one line of information with no call to action", () => {
    render(<AskBasisPanel data={{ ...SUPPLIER_INVOICE, action: false }} />);
    expect(screen.queryByRole("region", { name: "Ask your Basis team" })).toBeNull();
    expect(screen.getByTestId("ask-basis-info")).toHaveTextContent("Enabled by SAP_COM_0057");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
