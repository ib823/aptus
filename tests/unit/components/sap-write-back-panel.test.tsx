import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SapWriteBackPanel } from "@/components/sap/SapWriteBackPanel";

const WRITE_STATUS = { data: { enabled: true, writeSecretRequired: false } };
const CATALOG = {
  data: {
    tenants: [{ key: "development", label: "X5M / 080 · Development" }],
    services: [{ key: "svc", label: "Supplier Invoice", scenario: "SAP_COM_0057", domain: "Finance" }],
  },
};
const ENTITIES = { data: { entitySets: [{ name: "A_SupplierInvoice" }], probes: [] } };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.includes("/api/sap/tdd/write")
        ? WRITE_STATUS
        : url.includes("/api/sap/tdd/catalog")
          ? CATALOG
          : ENTITIES;
      return Promise.resolve({ ok: true, json: async () => body });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("SapWriteBackPanel — write honesty (WS5)", () => {
  it("labels the action 'Create record', not 'Post to SAP'", async () => {
    render(<SapWriteBackPanel product="s4hana" />);
    expect(await screen.findByRole("button", { name: /Create record/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Post to SAP/i })).toBeNull();
  });

  it("shows a standing destructive callout naming the real write-target tenant", async () => {
    render(<SapWriteBackPanel product="s4hana" />);
    // The danger note states it is a live, persisted write…
    expect(await screen.findByText(/Live write/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    // …and names the active tenant so the target is unmistakable (appears in
    // both the callout and the tenant selector).
    expect(screen.getAllByText(/X5M \/ 080 · Development/).length).toBeGreaterThan(0);
  });
});
