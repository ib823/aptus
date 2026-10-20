/**
 * The Workbench write-backs panel on /operations/writes (P0.7).
 *
 * Two lies it must not tell: a refusal shown as an empty table (which says no
 * write happened), and a write whose outcome was never recorded shown as one
 * still in progress (which says there is nothing to check).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { WorkbenchWritesClient } from "@/components/ops/WorkbenchWritesClient";

function serve(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status < 400, status, json: async () => body })),
  );
}

const OUTCOMES = {
  SUCCEEDED: "SAP accepted the write",
  BLOCKED: "refused before any write was sent to SAP — nothing was written",
  SAP_REFUSED: "SAP answered and refused the write — nothing was written",
  OUTCOME_UNKNOWN: "SAP failed or did not answer — the write may have been applied; check SAP",
  LEFT_BEHIND: "the test record was created and NOT deleted — it is still in SAP",
  PENDING: "recorded moments ago, before SAP was called — the request may still be running",
  UNRESOLVED: "the write was about to be sent and its outcome was never recorded — check SAP before repeating it",
};

const row = (id: string, state: string, at: string) => ({
  id,
  at,
  action: "SAP_WORKBENCH_WRITE",
  actorEmail: "admin@abeam.test",
  actorRole: "platform_admin",
  product: "s4hana",
  tenantKey: "customizing",
  tenantLabel: "Customizing",
  serviceKey: "business-partner",
  entitySet: "A_BusinessPartner",
  state,
  sapStatus: state === "SUCCEEDED" ? 201 : null,
  reason: null,
  correlationId: `${id}-0000-0000`,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Workbench write-backs panel", () => {
  it("names the person and flags a write whose outcome was never recorded", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    serve(200, {
      data: {
        windowHours: 24,
        total: 2,
        counts: { SUCCEEDED: 1, BLOCKED: 0, SAP_REFUSED: 0, OUTCOME_UNKNOWN: 0, LEFT_BEHIND: 0, PENDING: 0, UNRESOLVED: 1 },
        truncated: false,
        provenance: {
          outcomes: OUTCOMES,
          pendingUnresolvedAfterMinutes: 15,
          cannotTell: ["What was written."],
          rowsAreAPage: { returned: 2, of: 2, limit: 100 },
        },
        rows: [row("e1", "UNRESOLVED", old), row("e2", "SUCCEEDED", old)],
      },
    });
    render(<WorkbenchWritesClient />);
    await waitFor(() => expect(screen.getByText("never recorded")).toBeTruthy());
    expect(screen.getAllByText("admin@abeam.test")).toHaveLength(2);
    expect(screen.getByText("succeeded")).toBeTruthy();
    // The "Check SAP" figure counts the unresolved write.
    expect(screen.getByText("Check SAP").parentElement?.textContent).toContain("1");
  });

  it("shows a refusal as a refusal, never as an empty table", async () => {
    serve(403, { error: { code: "FORBIDDEN", message: "Admin access required" } });
    render(<WorkbenchWritesClient />);
    await waitFor(() => expect(screen.getByText("Workbench write-backs could not be shown")).toBeTruthy());
    expect(screen.getByText(/visible to platform admins only/)).toBeTruthy();
    expect(screen.queryByText(/No Workbench write-back in this window/)).toBeNull();
  });
});
