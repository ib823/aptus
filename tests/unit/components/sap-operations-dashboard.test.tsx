import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The shared custom <Select> (a native-select bridge) churns register/unregister
// effects on every PARENT re-render under jsdom, which loops the test worker.
// It's irrelevant to WS3 (auto-refresh + freshness), so stub it to a trivial
// passthrough — we exercise the REAL SapOperationsDashboard around it. The
// tenant is chosen from /catalog, not by clicking the select, so this loses no
// coverage of the behavior under test.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}));

import { SapOperationsDashboard } from "@/components/sap/SapOperationsDashboard";

/**
 * WS3 — Workbench data freshness. Auto-refresh is opt-in, gentle, and
 * cache-reusing, and it re-reads ONLY the always-visible Featured read. The
 * activated list's collapsed cards must issue ZERO tenant reads (no /preview,
 * no per-item detail probe) across an auto-refresh cycle — and the manual
 * Refresh, and only it, forces ?refresh=1.
 */

const ACTIVATED = { id: "hc_bp", externalId: "API_BUSINESS_PARTNER", title: "Business Partner (A2X)", contentType: "API", apiType: "ODATAV2", status: "ACTIVATED", capability: { read: true, write: false }, itemCount: 1, packageId: "pkg" };

function classify(url: string): "catalog" | "operations" | "list" | "detail" | "preview" | "other" {
  if (url.includes("/tdd/catalog")) return "catalog";
  if (url.includes("/tdd/operations")) return "operations";
  if (url.includes("/preview")) return "preview";
  if (/\/hub-content\/[^?]/.test(url)) return "detail";
  if (url.includes("/hub-content?")) return "list";
  return "other";
}
function calls(kind: ReturnType<typeof classify>) {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => classify(String(c[0])) === kind);
}

function mockFetch() {
  return vi.fn((input: string) => {
    const url = String(input);
    switch (classify(url)) {
      case "catalog":
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { tenants: [{ key: "X5M_100", label: "X5M 100" }] } }) } as Response);
      case "operations":
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { tenant: { key: "X5M_100", label: "X5M 100" }, generatedAt: "2026-07-22T00:00:00.000Z", fromCache: url.includes("refresh=1") ? false : true, sections: [] } }) } as Response);
      case "list":
        return Promise.resolve({ json: () => Promise.resolve({ data: { items: [ACTIVATED], total: 1, isAdmin: false, counts: { lastProbedAt: null } } }) } as Response);
      default:
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }
  });
}

beforeEach(() => vi.stubGlobal("fetch", mockFetch()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SapOperationsDashboard — auto-refresh discipline (WS3)", () => {
  it("auto-refresh re-reads Featured (cache-reusing) and issues ZERO reads for collapsed activated cards", async () => {
    render(<SapOperationsDashboard product="s4hana" />);
    // Both surfaces loaded: the collapsed activated card is present.
    await screen.findByText("Business Partner (A2X)");
    expect(calls("operations")).toHaveLength(1);

    // Enable auto-refresh, then simulate the tab regaining focus.
    fireEvent.click(screen.getByRole("checkbox", { name: /Auto-refresh/ }));
    fireEvent(window, new Event("focus"));

    // Featured re-read fired...
    await waitFor(() => expect(calls("operations")).toHaveLength(2));
    // ...as a CACHE-REUSING read (no forced refresh=1)...
    expect(String(calls("operations")[1]?.[0])).not.toContain("refresh=1");
    // ...and the collapsed card triggered NO tenant reads.
    expect(calls("preview")).toHaveLength(0);
    expect(calls("detail")).toHaveLength(0);
  });

  it("manual Refresh — and only it — forces a live re-read (?refresh=1)", async () => {
    render(<SapOperationsDashboard product="s4hana" />);
    await screen.findByText("Business Partner (A2X)");
    // The initial mount read reused the cache (no refresh=1).
    expect(String(calls("operations")[0]?.[0])).not.toContain("refresh=1");

    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    await waitFor(() => expect(calls("operations")).toHaveLength(2));
    expect(String(calls("operations")[1]?.[0])).toContain("refresh=1");
    // Still no collapsed-card fan-out.
    expect(calls("preview")).toHaveLength(0);
    expect(calls("detail")).toHaveLength(0);
  });
});
