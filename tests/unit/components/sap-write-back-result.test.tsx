/**
 * The write-back panel's result box takes keyboard focus.
 *
 * A created record's answer runs past the box's 360px (an OData create returns
 * the whole entity), so the box scrolls, and a box that scrolls must take
 * keyboard focus or a keyboard user cannot read the rest (axe
 * scrollable-region-focusable, WCAG 2.1.1). It is a region named for what it
 * holds; the global [tabindex]:focus-visible rule draws its ring. The e2e scan
 * in tests/e2e/accessibility.auth.spec.ts measures it rendered, with the real
 * selects.
 *
 * The selects are stood in for here: under jsdom, Radix Select hangs the
 * re-render that typing the confirmation causes, and the result box is not
 * about them.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/select", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { Select: Pass, SelectContent: Pass, SelectItem: Pass, SelectTrigger: Pass, SelectValue: () => null };
});

import { SapWriteBackPanel } from "@/components/sap/SapWriteBackPanel";

const WRITE_STATUS = { data: { enabled: true, writeSecretRequired: false } };
const CATALOG = {
  data: {
    tenants: [{ key: "development", label: "X5M / 080 · Development" }],
    services: [{ key: "commercial-projects", label: "Commercial Projects", scenario: "SAP_COM_0054", domain: "Projects" }],
  },
};
const ENTITIES = { data: { entitySets: [{ name: "ProjectSet" }], probes: [] } };
const CREATED = { ok: true, status: 201, durationMs: 412, location: null, body: { d: { ProjectID: "P-000123" } } };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const body =
        url.includes("/api/sap/tdd/write") && init?.method === "POST"
          ? { data: CREATED }
          : url.includes("/api/sap/tdd/write")
            ? WRITE_STATUS
            : url.includes("/api/sap/tdd/catalog")
              ? CATALOG
              : ENTITIES;
      return Promise.resolve({ ok: true, json: async () => body });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("SapWriteBackPanel — the write result", () => {
  it("is a focusable region named for what it holds", async () => {
    render(<SapWriteBackPanel product="s4hana" />);
    await screen.findByText(/Live write/i);
    fireEvent.change(screen.getByPlaceholderText("WRITE TO SAP TDD"), { target: { value: "WRITE TO SAP TDD" } });
    fireEvent.click(screen.getByRole("button", { name: /Create record/i }));
    const region = await screen.findByRole("region", { name: "Write result" });
    expect(region.tagName).toBe("PRE");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.textContent).toContain("P-000123");
  });
});
