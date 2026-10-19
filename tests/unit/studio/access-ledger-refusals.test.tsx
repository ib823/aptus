/**
 * Studio > API Access: the ledger says a decision is refused BEFORE the click.
 *
 * TWO DEFECTS PINNED HERE, both the ledger offering a decision the server
 * always refuses:
 *
 *  - On a row whose app the viewer owns, all four decision buttons were
 *    enabled and every click came back 403 OWN_APP. The page loaded the owner
 *    ids for the credentials panel and never passed them to the ledger.
 *  - On a pending CREATE or UPDATE row, "Approve read-only" was enabled and
 *    came back 403 READ_ONLY_ON_WRITE.
 *
 * The page is rendered for real, from the rows its query returns, so the
 * chain from the solution's owner slots to the sentence on the row is what is
 * tested — not a prop handed to the client by the test.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({ id: "u_me", role: "consultant", organizationId: "org1" }),
}));
vi.mock("@/components/studio/ClientCredentials", () => ({ ClientCredentials: () => null }));

const grantRows = vi.fn();
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    apiAccessGrant: { findMany: (...a: unknown[]) => grantRows(...a) },
    solutionClient: { findMany: async () => [] },
    solution: { findMany: async () => [] },
    interface: { findMany: async () => [] },
    sapConnection: { findMany: async () => [] },
  },
}));

const OTHERS = { technicalOwnerId: "u_x", businessOwnerId: "u_y", supportOwnerId: "u_z" };

function grant(externalId: string, operation: string, owners: Record<string, string | null>) {
  return {
    id: `g_${externalId}`,
    externalId,
    operation,
    environment: "PROD",
    justification: "Needed for the client's month-end close.",
    decision: "REQUESTED",
    requestedById: "u_colleague",
    decidedById: null,
    decidedAt: null,
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    solution: { name: "Order portal", ...owners },
  };
}

async function renderLedger() {
  const { default: StudioAccessPage } = await import("@/app/(studio)/studio/access/page");
  render((await StudioAccessPage()) as never);
}

/** The table row that carries this capability. */
function row(externalId: string): HTMLElement {
  const tr = screen.getByText(externalId).closest("tr");
  if (!tr) throw new Error(`no row for ${externalId}`);
  return tr;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  grantRows.mockReset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a row on the viewer's own app", () => {
  it("says why instead of offering four buttons that each come back 403", async () => {
    grantRows.mockResolvedValue([
      grant("API_OWN_APP", "READ", { technicalOwnerId: null, businessOwnerId: "u_me", supportOwnerId: null }),
      grant("API_SOMEONE_ELSES", "READ", OTHERS),
    ]);
    await renderLedger();

    const own = within(row("API_OWN_APP"));
    expect(own.getByText(/You own this app/)).toBeTruthy();
    expect(own.queryByRole("button")).toBeNull();

    // A colleague's app, in the same render, still offers every decision.
    const theirs = within(row("API_SOMEONE_ELSES"));
    expect(theirs.queryByText(/You own this app/)).toBeNull();
    for (const name of ["Approve", "Approve for sandbox only", "Approve read-only", "Reject"]) {
      expect((theirs.getByRole("button", { name }) as HTMLButtonElement).disabled, name).toBe(false);
    }
  });

  it("puts your own request first, as the server does", async () => {
    // SELF_APPROVAL is checked before OWN_APP, so a request you raised on your
    // own app reads as your request.
    grantRows.mockResolvedValue([
      { ...grant("API_BOTH", "READ", { ...OTHERS, supportOwnerId: "u_me" }), requestedById: "u_me" },
    ]);
    await renderLedger();

    const both = within(row("API_BOTH"));
    expect(both.getByText(/You raised this request/)).toBeTruthy();
    expect(both.queryByText(/You own this app/)).toBeNull();
  });
});

describe("read-only on a write row", () => {
  it("is disabled with its reason on screen, and the click sends nothing", async () => {
    grantRows.mockResolvedValue([grant("API_SALES_ORDER_SRV", "CREATE", OTHERS)]);
    await renderLedger();

    const write = within(row("API_SALES_ORDER_SRV"));
    const readOnly = write.getByRole("button", { name: "Approve read-only" }) as HTMLButtonElement;
    expect(readOnly.disabled).toBe(true);
    const reasonId = readOnly.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)?.textContent).toContain("Read-only can't narrow a write request");

    fireEvent.click(readOnly);
    expect(fetchMock).not.toHaveBeenCalled();

    // The decisions a write CAN take stay offered.
    expect((write.getByRole("button", { name: "Approve" }) as HTMLButtonElement).disabled).toBe(false);
    expect((write.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("stays offered on a read row", async () => {
    grantRows.mockResolvedValue([grant("API_BUSINESS_PARTNER", "READ", OTHERS)]);
    await renderLedger();

    const read = within(row("API_BUSINESS_PARTNER"));
    expect((read.getByRole("button", { name: "Approve read-only" }) as HTMLButtonElement).disabled).toBe(false);
    expect(read.queryByText(/Read-only can't narrow a write request/)).toBeNull();
  });
});
