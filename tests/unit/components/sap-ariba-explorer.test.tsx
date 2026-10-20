import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SapAribaExplorer, resultBadgeLabel } from "@/components/sap/SapAribaExplorer";

/**
 * Roadmap P0.6 — the Ariba explorer shows what the routes say: a path pinned
 * to v1 is marked (A71), a malformed realm configuration is shown and Run is
 * off (A72), and a call that stopped at the token step says so (A74).
 *
 * The token-step case checks the badge's label function rather than clicking
 * Run: a click that starts a call hangs this component under jsdom (it did so
 * before P0.6 too, with the Radix Select mounted), so the click is not used.
 */

const ENDPOINT = {
  key: "sourcing-events",
  label: "Sourcing Events",
  group: "Sourcing + Supplier",
  path: "/api/sourcing-eventmanagement/v1/prod/events",
  description: "RFx (Event Management API 1.0.0, deprecated; pinned by ARIBA_SOURCING_V1).",
  pinnedLegacy: true,
};

function stubCatalog(catalog: Record<string, unknown>) {
  const fetchMock = vi.fn((input: string) => {
    const body = String(input).startsWith("/api/sap/ariba/catalog") ? { data: catalog } : { data: null };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SapAribaExplorer", () => {
  it("marks a v1-pinned path", async () => {
    stubCatalog({ configured: true, realms: [{ key: "acme-T", label: "Test" }], realmsError: null, endpoints: [ENDPOINT] });
    render(<SapAribaExplorer />);
    expect(await screen.findByText("v1 pinned by ARIBA_SOURCING_V1")).toBeTruthy();
    expect(screen.getByText(ENDPOINT.path)).toBeTruthy();
  });

  it("does not mark a path nothing pinned", async () => {
    stubCatalog({
      configured: true,
      realms: [{ key: "acme-T", label: "Test" }],
      realmsError: null,
      endpoints: [{ ...ENDPOINT, path: "/api/sourcing-eventmanagement/v2/prod/events", pinnedLegacy: undefined }],
    });
    render(<SapAribaExplorer />);
    await screen.findByText("/api/sourcing-eventmanagement/v2/prod/events");
    expect(screen.queryByText("v1 pinned by ARIBA_SOURCING_V1")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a malformed realm configuration and never calls the route", async () => {
    const fetchMock = stubCatalog({
      configured: false,
      realms: [],
      realmsError: "ARIBA_REALMS_JSON is invalid: it is not valid JSON",
      endpoints: [ENDPOINT],
    });
    render(<SapAribaExplorer />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ARIBA_REALMS_JSON is invalid");
    const run = screen.getByRole("button", { name: /run/i });
    expect((run as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(run);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).startsWith("/api/sap/ariba/call"))).toBe(false);
  });
});

describe("resultBadgeLabel", () => {
  it("names a call that stopped at the token step, with no realm status", () => {
    expect(resultBadgeLabel({ status: 0, durationMs: 12, stage: "token" })).toBe("token step failed · 12ms");
  });

  it("shows the realm's status once the realm was asked", () => {
    expect(resultBadgeLabel({ status: 404, durationMs: 30, stage: "request" })).toBe("HTTP 404 · 30ms");
    expect(resultBadgeLabel({ status: 0, durationMs: 30, stage: "request" })).toBe("error · 30ms");
  });
});
