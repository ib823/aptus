/**
 * R4, interim guard: a WRITE interface cannot be marked ACTIVE until its
 * solution holds a write credential — and the button says why before the
 * click. The route is the control (interfaces-patch.test.ts); this is the
 * affordance that keeps a developer from building toward a call the broker
 * refuses.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InterfacesClient, type StudioInterface } from "@/components/studio/InterfacesClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const WRITE_IFACE: StudioInterface = {
  id: "if_w",
  name: "Sales order create",
  version: 1,
  sapProduct: "s4hana",
  externalId: "API_SALES_ORDER_SRV",
  operation: "CREATE",
  entitySet: "A_SalesOrder",
  mode: "WRITE",
  status: "DRAFT",
  mappingVersion: null,
  hasRequestSchema: false,
  hasResponseSchema: false,
  solutionId: "sol_1",
  solutionName: "Order Portal",
};

function markActive() {
  return screen.getByRole("button", { name: "Mark ACTIVE" }) as HTMLButtonElement;
}

describe("Mark ACTIVE on a WRITE interface", () => {
  it("is disabled, and says why, while the solution has no write credential", () => {
    render(<InterfacesClient interfaces={[{ ...WRITE_IFACE, writeCredentialIssued: false }]} canAuthor />);
    expect(markActive().disabled).toBe(true);
    expect(markActive().title).toMatch(/Issue the solution's write credential first/);
    expect(screen.getByText(/not issued — the broker refuses every write without one/)).toBeTruthy();
  });

  it("treats an unknown credential state as not issued — never as permission", () => {
    render(<InterfacesClient interfaces={[WRITE_IFACE]} canAuthor />);
    expect(markActive().disabled).toBe(true);
  });

  it("is enabled once the write credential is issued", () => {
    render(<InterfacesClient interfaces={[{ ...WRITE_IFACE, writeCredentialIssued: true }]} canAuthor />);
    expect(markActive().disabled).toBe(false);
    expect(screen.getByText(/issued — the solution can write once this interface is ACTIVE/)).toBeTruthy();
  });

  it("never gates a READ interface on a write credential", () => {
    render(
      <InterfacesClient
        interfaces={[{ ...WRITE_IFACE, operation: "READ", mode: "READ", writeCredentialIssued: false }]}
        canAuthor
      />,
    );
    expect(markActive().disabled).toBe(false);
    expect(screen.queryByText(/Write credential/)).toBeNull();
  });
});
