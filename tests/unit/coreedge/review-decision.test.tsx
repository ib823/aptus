/**
 * The review bar on a WRITE request.
 *
 * THE DEFECT THIS PINS. The bar never sent `writeChecklistAcknowledged`, so on a
 * CREATE or UPDATE request Approve could only come back 403 (checklist) and
 * "Approve read-only" was the one approval that went through — storing a grant
 * the broker matches on operation and therefore honours for nothing: no write
 * (READ_ONLY never writes) and no read (no read interface carries CREATE).
 *
 * So on a write: Approve waits on an explicit checklist acknowledgement and then
 * sends it, and read-only is blocked with its reason. On a read nothing changes.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewDecision } from "@/components/coreedge/actions/ReviewDecision";
import { ACTIONS } from "@/lib/coreedge/copy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function bar(isWrite: boolean) {
  render(
    <ReviewDecision
      requestId="g1"
      isWrite={isWrite}
      blockedBecause={null}
      narrowerBlockedBecause={null}
    />,
  );
  return {
    approve: screen.getByRole("button", { name: ACTIONS.approve.button }),
    readOnly: screen.getByRole("button", { name: ACTIONS.approveReadOnly.button }),
  };
}

/** The JSON body of the n-th POST the bar sent. */
function sent(n = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[n]?.[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("on a write request", () => {
  it("holds Approve until the write checklist is acknowledged, and says so", () => {
    const { approve } = bar(true);
    expect(approve.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/Confirm the write checklist/)).toBeTruthy();
    fireEvent.click(approve);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the acknowledgement with the approval once it is ticked", () => {
    bar(true);
    fireEvent.click(screen.getByRole("checkbox"));
    const approve = screen.getByRole("button", { name: ACTIONS.approve.button });
    expect(approve.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(approve);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sent()).toEqual({ decision: "APPROVED", writeChecklistAcknowledged: true });
  });

  it("blocks read-only with its reason, ticked or not — it would authorise nothing", () => {
    const { readOnly } = bar(true);
    expect(readOnly.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/Read-only can't narrow a write request/)).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox"));
    const after = screen.getByRole("button", { name: ACTIONS.approveReadOnly.button });
    expect(after.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(after);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("on a read request", () => {
  it("offers no checklist, and approves and narrows to read-only as before", () => {
    const { approve, readOnly } = bar(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(approve.getAttribute("aria-disabled")).toBeNull();
    expect(readOnly.getAttribute("aria-disabled")).toBeNull();

    fireEvent.click(readOnly);
    expect(sent()).toEqual({ decision: "READ_ONLY", writeChecklistAcknowledged: false });
  });
});
