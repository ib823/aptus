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

function renderScreen(
  interfaces: RequestableInterface[],
  canRequest = true,
  connectedEnvironments: readonly string[] = ["SANDBOX", "DEV", "TEST", "PROD"],
) {
  return render(
    <AccessGrantsClient
      grants={[]}
      currentUserId="u_1"
      highestApproved={null}
      canDecide={true}
      canRequest={canRequest}
      requestableInterfaces={interfaces}
      connectedEnvironments={connectedEnvironments}
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

  it("submits the chosen expiry as the END of that day in UTC, not its first instant", async () => {
    // A date input yields "2026-12-31"; sent bare, the server parsed it as
    // midnight UTC, so a grant approved to run "until the 31st" was expired for
    // the whole of the 31st. The ledger then showed the date the requester chose
    // next to a status that contradicted it.
    renderScreen([WRITE_IFACE]);
    openWith(WRITE_IFACE);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The portal raises sales orders on behalf of the customer." },
    });
    fireEvent.change(screen.getByLabelText(/Expires/i), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Raise request" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.expiresAt).toBe("2026-12-31T23:59:59.999Z");
  });
});

describe("the environment picker says which environments a connection serves", () => {
  it("marks an environment no active connection declares, and warns when it is chosen", () => {
    // A grant for PROD can be approved with nothing bound to PROD; every call
    // under it is then refused with a binding message the requester never saw
    // coming. The picker carries the fact the resolver will act on.
    renderScreen([READ_IFACE], true, ["TEST"]);
    openWith(READ_IFACE);

    const picker = screen.getByRole("combobox", { name: /^Environment/ }) as HTMLSelectElement;
    const labels = Array.from(picker.options).map((o) => o.textContent);
    expect(labels).toContain("TEST");
    expect(labels).toContain("PROD — no connection");

    fireEvent.change(picker, { target: { value: "PROD" } });
    expect(screen.getByText(/No active SAP connection declares PROD/)).toBeTruthy();

    fireEvent.change(picker, { target: { value: "TEST" } });
    expect(screen.queryByText(/No active SAP connection declares/)).toBeNull();
  });
});

describe("a write request arrives bounded", () => {
  it("cannot be submitted with the expiry cleared", () => {
    // Not the control — evaluateDecision is. This keeps the APPROVER unblocked:
    // no grant can be approved without an expiry, and the approver cannot supply
    // one themselves, so an unbounded request would leave them able only to
    // reject it.
    renderScreen([WRITE_IFACE]);
    openWith(WRITE_IFACE);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The portal raises sales orders on behalf of the customer." },
    });

    // The field is defaulted, so it has to be emptied to reach the guard at all.
    fireEvent.change(screen.getByLabelText(/Expires/i), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Raise request" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Expires/i), { target: { value: "2026-12-31" } });
    expect((screen.getByRole("button", { name: "Raise request" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("demands an expiry for a READ as well — this test asserted the opposite", () => {
    /*
     * IT USED TO READ "does not demand an expiry for a read", and passed.
     *
     * That was the defect written down as an expectation. The rule in grants.ts
     * widened from writes to reads — its own DecisionRefusal comment records the
     * rename — but the dialog kept letting a read through unbounded, so the
     * request reached an approver who could neither approve it nor add the date.
     * Rejecting and re-raising was always available and nothing said so.
     */
    renderScreen([READ_IFACE]);
    openWith(READ_IFACE);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The portal lists partners on its account screen." },
    });
    fireEvent.change(screen.getByLabelText(/Expires/i), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Raise request" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens with an expiry already filled, so the default path is a bounded grant", () => {
    // A blank field could only ever produce a request an approver must reject.
    // Ninety days is a nudge with a sane value in it, not a policy.
    renderScreen([READ_IFACE]);
    openWith(READ_IFACE);
    const expiry = screen.getByLabelText(/Expires/i) as HTMLInputElement;
    expect(expiry.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(expiry.value).getTime()).toBeGreaterThan(Date.now());
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
