/**
 * The Test Console's result rows take keyboard focus.
 *
 * A run's rows render as up to eight unwrapped columns, so the box scrolls
 * sideways at desktop width and well past it on a phone, and a box that
 * scrolls must take keyboard focus or a keyboard user cannot reach the
 * columns past its edge (axe scrollable-region-focusable, WCAG 2.1.1). It is a
 * region named for what it holds; the global [tabindex]:focus-visible rule
 * draws its ring. The e2e scan in tests/e2e/accessibility.coreedge.auth.spec.ts
 * measures it rendered.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TestConsoleClient, type TestableInterface } from "@/components/studio/TestConsoleClient";

const IFACE: TestableInterface = {
  id: "i1",
  name: "Purchase orders",
  externalId: "CE_PURCHASEORDER_0001",
  sapProduct: "s4hana",
  entitySet: "A_PurchaseOrder",
  operation: "READ",
  solutionName: "QA-E2E-Main",
  credentials: [],
};

const RAN = {
  outcome: "ran",
  status: "OK",
  httpStatus: 200,
  contract: { version: 1, entitySet: "A_PurchaseOrder" },
  records: [{ PurchaseOrder: "4500000001", CompanyCode: "1710", Supplier: "17300001" }],
  note: "1 record read.",
  draft: false,
  boundTo: { label: "S/4HANA DEV", environment: "DEV", sapClient: "100", bindingUnverified: false },
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes("/api/studio/test/broker-run") ? { data: RAN } : { data: { testCases: [] } }),
    })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("the Test Console's result rows", () => {
  it("are a focusable region named for what it holds", async () => {
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const region = await screen.findByRole("region", { name: "Rows read" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.querySelector("table")).not.toBeNull();
    expect(region.textContent).toContain("4500000001");
  });
});
