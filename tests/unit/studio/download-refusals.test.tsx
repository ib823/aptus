/**
 * A REFUSED DOWNLOAD IS SAID, NOT DROPPED (consolidated containment review
 * round 1).
 *
 * The starter kit and the solution document are refused by design — the
 * organisation's compile time for the day spent (429, Retry-After), the
 * compiler busy (503, Retry-After) or turned off, a document past its budget.
 * The Test Console's Generate read only `data`, so a refusal left an empty
 * panel; the solution document was a plain download link, so a refusal was
 * saved as the document. Both now show the route's message and when to retry.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { SolutionsClient, type StudioSolution } from "@/components/studio/SolutionsClient";
import { TestConsoleClient, type TestableInterface } from "@/components/studio/TestConsoleClient";
import { refusalMessage, retryAfterSentence } from "@/lib/studio/refusal-message";

const ALLOWANCE =
  "This starter kit could not be generated: your organisation has used its 40 s of contract compile time for today. It is available again at 00:00 UTC.";

function refusal(status: number, message: string, retryAfter: string | null) {
  return {
    ok: false,
    status,
    headers: new Headers(retryAfter === null ? {} : { "retry-after": retryAfter }),
    json: async () => ({ error: { code: status === 429 ? "RATE_LIMITED" : "UNAVAILABLE", message } }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("the Test Console's Generate", () => {
  const iface: TestableInterface = {
    id: "i1",
    name: "Purchase orders",
    externalId: "CE_PURCHASEORDER_0001",
    sapProduct: "s4hana",
    entitySet: "PurchaseOrder",
    operation: "READ",
    solutionName: "Sol",
    credentials: [],
  };

  it.each([
    [429, ALLOWANCE, "41000", ALLOWANCE],
    [503, "This starter kit could not be generated just now: the contract compiler is busy. Try again in a few seconds.", "5", "Try again in 5 s."],
    [503, "This starter kit could not be generated: the contract compiler is turned off on this deployment.", null, "turned off on this deployment"],
  ])("a %i refusal is shown with its message and its retry time", async (status, message, retryAfter, shown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/scaffold") ? refusal(status, message, retryAfter) : { ok: true, json: async () => ({ data: { testCases: [] } }) },
      ),
    );
    render(<TestConsoleClient tenantKey={null} canSave interfaces={[iface]} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    const error = await waitFor(() => screen.getByTestId("scaffold-error"));
    expect(error.textContent).toContain("Failed: ");
    expect(error.textContent).toContain(shown);
  });
});

describe("the solution document", () => {
  const solution: StudioSolution = {
    id: "sol_1",
    name: "Order portal",
    slug: "order-portal",
    classification: "CLIENT_APP",
    businessProblem: "Orders.",
    status: "ACTIVE",
    dataClass: "INTERNAL",
    technicalOwnerId: null,
    businessOwnerId: null,
    supportOwnerId: null,
    repoUrl: null,
    packagingNote: null,
    reuseIntent: null,
    interfaceCount: 2,
    grantCount: 0,
  };

  it("is fetched, and a refusal is said with its retry time instead of being saved as the document", async () => {
    const fetchMock = vi.fn(async () => refusal(503, "This solution document could not be generated just now: the contract compiler is busy. Try again in a few seconds.", "5"));
    vi.stubGlobal("fetch", fetchMock);
    render(<SolutionsClient solutions={[solution]} canAuthor currentUserId="u1" people={[]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Functional" }));
    fireEvent.click(screen.getByRole("button", { name: "OpenAPI 3.1" }));
    await waitFor(() => expect(screen.getByText(/solution document could not be generated just now/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/studio/solutions/sol_1/openapi?version=3.1");
    expect(screen.getByText(/Try again in 5 s\./)).toBeTruthy();
    // No link that would save a refusal as the file.
    expect(document.querySelector('a[href*="/openapi"]')).toBeNull();
  });
});

describe("refusalMessage", () => {
  it("adds the wait, unless the message already names 00:00 UTC", () => {
    const h = (v: string | null) => ({ headers: new Headers(v === null ? {} : { "retry-after": v }) });
    expect(refusalMessage(h("5"), { error: { message: "Busy." } }, "x")).toBe("Busy. Try again in 5 s.");
    expect(refusalMessage(h("300"), { error: { message: "Busy." } }, "x")).toBe("Busy. Try again in 5 min.");
    expect(refusalMessage(h("41000"), { error: { message: ALLOWANCE } }, "x")).toBe(ALLOWANCE);
    expect(refusalMessage(h(null), null, "Fallback.")).toBe("Fallback.");
    expect(retryAfterSentence("7200", new Date("2026-10-21T10:00:00Z"))).toBe("Try again at 12:00 UTC.");
    expect(retryAfterSentence("soon")).toBeNull();
  });
});
