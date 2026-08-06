/**
 * Raising an access request.
 *
 * WHY THIS SCREEN NEEDED A DIALOG AT ALL: `POST /api/studio/access-grants` has
 * been complete and tested since the ledger shipped, and nothing in the product
 * called it. No grant could be created without hand-editing the database, so the
 * decision queue was permanently empty and the runtime's grant check could never
 * pass.
 *
 * WHY THE CAPABILITY IS PICKED, NOT TYPED — the invariant these tests exist for:
 * the broker matches a grant on solutionId + externalId + operation +
 * environment, all four exact. A grant whose externalId differs from a real
 * interface's by a character is approved, listed in the ledger, counted in the
 * portfolio — and authorises nothing, with no diagnostic anywhere. A free-text
 * field would manufacture exactly that. So the dialog derives both fields from a
 * chosen Interface row, and the assertions below check the SUBMITTED BODY rather
 * than the rendering.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { fireEvent, render, screen } from "@testing-library/react";

import {
  AccessGrantsClient,
  type RequestableInterface,
} from "@/components/studio/AccessGrantsClient";

const READ_IFACE: RequestableInterface = {
  id: "if_read",
  name: "Business Partner read",
  solutionId: "sol_1",
  solutionName: "Acme Portal",
  externalId: "API_BUSINESS_PARTNER",
  operation: "READ",
};

const WRITE_IFACE: RequestableInterface = {
  id: "if_write",
  name: "Sales Order create",
  solutionId: "sol_1",
  solutionName: "Acme Portal",
  externalId: "API_SALES_ORDER_SRV",
  operation: "CREATE",
};

function renderScreen(interfaces: RequestableInterface[], canRequest = true) {
  return render(
    <AccessGrantsClient
      grants={[]}
      currentUserId="u_1"
      highestApproved={null}
      canDecide={true}
      canRequest={canRequest}
      requestableInterfaces={interfaces}
    />,
  );
}

/** Open the dialog and select an interface. */
function openWith(iface: RequestableInterface) {
  fireEvent.click(screen.getByRole("button", { name: "Request access" }));
  fireEvent.change(screen.getByLabelText("Capability"), { target: { value: iface.id } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  vi.stubGlobal("fetch", fetchMock);
  // The component reloads on success; the jsdom stub must not throw.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: vi.fn() },
  });
});

describe("the request dialog is gated like every other builder action", () => {
  it("is absent for a role that cannot author", () => {
    renderScreen([READ_IFACE], false);
    expect(screen.queryByRole("button", { name: "Request access" })).toBeNull();
  });

  it("refuses to offer a free-text fallback when there is nothing to request against", () => {
    // The honest answer is "add an interface first", not a text box that would
    // let someone invent a capability the runtime will never match.
    renderScreen([]);
    expect(screen.getByText(/Nothing to request access for yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request access" })).toBeNull();
  });
});

describe("the capability is derived from the interface, never typed", () => {
  it("submits the interface's own externalId, operation and solutionId", async () => {
    renderScreen([READ_IFACE]);
    openWith(READ_IFACE);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The portal lists partners on its account screen." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Raise request" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/studio/access-grants");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.externalId).toBe(READ_IFACE.externalId);
    expect(body.operation).toBe(READ_IFACE.operation);
    expect(body.solutionId).toBe(READ_IFACE.solutionId);
  });

  it("carries the CREATE operation for a write interface, not a defaulted READ", async () => {
    // One catalogue service can back several interfaces at different operations.
    // A READ grant raised against a CREATE interface passes approval and is then
    // refused at the first call, long after anyone is looking.
    renderScreen([WRITE_IFACE]);
    openWith(WRITE_IFACE);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The portal raises sales orders on behalf of the customer." },
    });
    fireEvent.change(screen.getByLabelText(/Expires/i), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Raise request" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.operation).toBe("CREATE");
    expect(body.externalId).toBe(WRITE_IFACE.externalId);
  });
});

describe("a write request arrives bounded", () => {
  it("cannot be submitted without an expiry", () => {
    // Not the control — evaluateDecision is. This keeps the APPROVER unblocked:
    // a write grant cannot be approved without an expiry, and the approver
    // cannot supply one themselves, so an unbounded write request would strand.
    renderScreen([WRITE_IFACE]);
    openWith(WRITE_IFACE);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The portal raises sales orders on behalf of the customer." },
    });

    const submit = screen.getByRole("button", { name: "Raise request" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Expires/i), { target: { value: "2026-12-31" } });
    expect((screen.getByRole("button", { name: "Raise request" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not demand an expiry for a read", () => {
    renderScreen([READ_IFACE]);
    openWith(READ_IFACE);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The portal lists partners on its account screen." },
    });
    expect((screen.getByRole("button", { name: "Raise request" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("the justification bound is mirrored, not trusted", () => {
  it("blocks a justification below the server's 10-character floor", () => {
    renderScreen([READ_IFACE]);
    openWith(READ_IFACE);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "too short" } });
    expect((screen.getByRole("button", { name: "Raise request" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
