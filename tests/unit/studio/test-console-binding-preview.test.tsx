/**
 * Two places the Test Console said something untrue, or nothing, about a run:
 *
 *  - WHERE IT WILL GO. The top-bar picker said it "applies to Discover and
 *    Test Console"; a run binds by the solution credential's environment. One
 *    session showed the picker on X5M/080 DEV while the run reported "Bound
 *    to Customizing X5M/100 · TEST" — and the only way to learn which system
 *    a run would reach was to run it. The console now says the binding before
 *    Run, from the same selection function the broker applies.
 *
 *  - WHAT A SAVED PASS PROVES. Cases saved before runs carried the tenant's
 *    HTTP status sit in the list as "PASS 29 Jul" for services that 403 on
 *    every tenant today. Such a PASS is history, not evidence, and renders as
 *    unevidenced with Replay as the cure.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fireEvent } from "@testing-library/react";

import { TestConsoleClient, type CredentialOption, type TestableInterface } from "@/components/studio/TestConsoleClient";

const BASE: Omit<TestableInterface, "credentials"> = {
  id: "i1",
  name: "Purchase orders",
  externalId: "CE_PURCHASEORDER_0001",
  sapProduct: "s4hana",
  entitySet: "PurchaseOrder",
  operation: "READ",
  solutionName: "QA-E2E-Main",
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubCases(cases: unknown[]) {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { testCases: cases } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => stubCases([]));
afterEach(() => vi.unstubAllGlobals());

describe("the binding is stated before Run", () => {
  it("names the credential and the connection it selects", () => {
    render(
      <TestConsoleClient
        tenantKey="development"
        canSave
        interfaces={[
          {
            ...BASE,
            credentials: [
              {
                clientId: "cl_test",
                binding: {
                  kind: "bound",
                  credential: { label: "QA-E2E-Main · TEST", environment: "TEST", sapClient: "100" },
                  connection: { label: "Customizing X5M/100", environment: "TEST", sapClient: "100" },
                  bindingUnverified: false,
                },
              },
            ],
          },
        ]}
      />,
    );
    const line = screen.getByTestId("binding-preview");
    expect(line.textContent).toContain("QA-E2E-Main · TEST (TEST/100)");
    expect(line.textContent).toContain("will bind to Customizing X5M/100 · TEST/100");
    // The picker's tenant (development) is NOT what the run follows, and the card says so.
    expect(screen.getByText(/applies to Discover, not to this run/)).toBeTruthy();
  });

  it("states the refusal a run would get, so nobody has to run to learn it", () => {
    render(
      <TestConsoleClient
        tenantKey={null}
        canSave
        interfaces={[
          {
            ...BASE,
            credentials: [
              {
                clientId: "cl_prod",
                binding: {
                  kind: "refused",
                  credential: { label: "QA-E2E-Main · PROD", environment: "PROD", sapClient: null },
                  reason: "NO_MATCH_FOR_ENVIRONMENT",
                  message: "No SAP connection declares the PROD environment.",
                },
              },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByTestId("binding-preview").textContent).toMatch(/will be refused at the binding: No SAP connection declares the PROD environment/);
  });

  it("says when there is no credential to run as", () => {
    render(<TestConsoleClient tenantKey={null} canSave interfaces={[{ ...BASE, credentials: [] }]} />);
    expect(screen.getByTestId("binding-preview").textContent).toMatch(/no live runtime credential/);
  });

  it("with one credential per environment (AD-11), the developer picks which to run as and the preview follows", async () => {
    const dev: CredentialOption = {
      clientId: "cl_dev",
      binding: {
        kind: "bound",
        credential: { label: "QA-E2E-Main · DEV", environment: "DEV", sapClient: "080" },
        connection: { label: "Development X5M/080", environment: "DEV", sapClient: "080" },
        bindingUnverified: false,
      },
    };
    const test: CredentialOption = {
      clientId: "cl_test",
      binding: {
        kind: "bound",
        credential: { label: "QA-E2E-Main · TEST", environment: "TEST", sapClient: "100" },
        connection: { label: "Customizing X5M/100", environment: "TEST", sapClient: "100" },
        bindingUnverified: false,
      },
    };
    render(<TestConsoleClient tenantKey={null} canSave interfaces={[{ ...BASE, credentials: [dev, test] }]} />);

    // Defaults to the first; the picker exists only because there is a choice.
    expect(screen.getByTestId("binding-preview").textContent).toContain("will bind to Development X5M/080");
    const picker = screen.getByRole("combobox", { name: "Run as credential" }) as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "cl_test" } });
    expect(screen.getByTestId("binding-preview").textContent).toContain("will bind to Customizing X5M/100");

    // …and the run names that credential, so what was previewed is what runs.
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("broker-run"))).toBe(true));
    const runCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("broker-run"))!;
    expect(JSON.parse((runCall[1] as { body: string }).body).clientId).toBe("cl_test");
  });
});

describe("a saved PASS without a status is unevidenced", () => {
  it("renders the pre-provenance PASS as unevidenced and the evidenced one as PASS · HTTP 200", async () => {
    stubCases([
      { id: "old", name: "Bank - Read", interfaceId: "i1", request: null, lastOutcome: "PASS", httpStatus: null, lastRunAt: "2026-07-29T10:00:00Z" },
      { id: "new", name: "PO - Read", interfaceId: "i1", request: null, lastOutcome: "PASS", httpStatus: 200, lastRunAt: "2026-09-11T08:00:00Z" },
    ]);
    render(<TestConsoleClient tenantKey={null} canSave interfaces={[{ ...BASE, credentials: [] }]} />);
    await waitFor(() => expect(screen.getByText("Bank - Read")).toBeTruthy());

    // Each summary is one span built from several JSX expressions, so match on
    // the row's whole text rather than one text node.
    const rowText = (name: string) => screen.getByText(name).closest("li")?.textContent ?? "";
    expect(rowText("Bank - Read")).toContain("last: PASS · unevidenced · 29 Jul 2026 — recorded before runs carried their status; replay to check");
    expect(rowText("PO - Read")).toContain("last: PASS · HTTP 200 · 11 Sept 2026");
    expect(rowText("PO - Read")).not.toContain("unevidenced");
  });
});
