/**
 * The Test Console's query run (P1.4, 3.15): the query the deployed app
 * would send, run through the broker.
 *
 *   - an empty query field leaves the ?limit run exactly as it was;
 *   - with parameters, the run sends them, shows what was sent to SAP
 *     (service path and options, never the host) and the first page's
 *     state, and offers no Capture schema or Capture fixture;
 *   - a refusal shows its rule, as `error.query` gives it to the app;
 *   - a record SAP does not have is said in words, not as a failure;
 *   - the builder reads the policy only when opened, and writes the
 *     parameters into the raw field.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TestConsoleClient, type TestableInterface } from "@/components/studio/TestConsoleClient";

const IFACE: TestableInterface = {
  id: "i1",
  name: "Order lines",
  externalId: "custom:/sap/opu/odata/sap/ZPAGING_ORDERS_SRV",
  sapProduct: "s4hana",
  entitySet: "OrderLines",
  operation: "READ",
  solutionName: "Portal",
  credentials: [],
};

const COMMON = {
  outcome: "ran",
  contract: { version: 1, entitySet: "OrderLines" },
  draft: false,
  boundTo: { label: "S/4HANA DEV", environment: "DEV", sapClient: "100", bindingUnverified: false },
};

let brokerAnswer: unknown;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  brokerAnswer = {
    ...COMMON,
    queryStatus: "OK",
    httpStatus: 200,
    records: [{ Order: "O0001", Customer: "C2" }],
    count: 1,
    note: "1 record.",
    totalCount: 7,
    query: {
      kind: "LIST",
      sent: "/sap/opu/odata/sap/ZPAGING_ORDERS_SRV/OrderLines?$select=Order,Customer,Line&$filter=Customer%20eq%20'C2'&$top=51&$format=json",
      page: { index: 0, size: 50, rowsServed: 1, nextCursor: null, complete: false, stopped: null },
      rule: null,
    },
  };
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.includes("/api/studio/test/broker-run")
        ? { data: brokerAnswer }
        : url.includes("/query-policy")
          ? {
              data: {
                flagEnabled: true,
                compiled: {
                  state: "READY",
                  key: ["Order", "Line"],
                  fields: [
                    { n: "Order", ops: ["eq", "in"], sort: true },
                    { n: "Line", ops: ["eq"], sort: true },
                    { n: "Customer", ops: ["eq", "in"], sort: false },
                    { n: "Note", ops: [], sort: false },
                  ],
                },
              },
            }
          : { data: { testCases: [] } },
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const runBodies = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes("broker-run")).map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);

describe("the Test Console's query run", () => {
  it("leaves the ?limit run as it was when the query field is empty", async () => {
    brokerAnswer = { ...COMMON, status: "OK", httpStatus: 200, records: [{ Order: "O0001" }], note: "1 record read." };
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await screen.findByRole("button", { name: "Capture fixture" });
    expect(runBodies()[0]).not.toHaveProperty("query");
    expect(screen.getByRole("button", { name: "Capture schema" })).toBeTruthy();
  });

  it("sends the query, shows what was sent and the first page, and offers no capture", async () => {
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    fireEvent.change(screen.getByLabelText(/Query parameters/), { target: { value: "select=Order,Customer&filter.Customer.eq=C2" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const sent = await screen.findByTestId("query-run");
    expect(runBodies()[0]).toMatchObject({ query: "select=Order,Customer&filter.Customer.eq=C2" });
    expect(sent.textContent).toContain("Sent to SAP (a list): /sap/opu/odata/sap/ZPAGING_ORDERS_SRV/OrderLines?$select=Order,Customer,Line");
    expect(sent.textContent).toContain("more rows remain: the deployed app pages on nextCursor");
    expect(sent.textContent).toContain("total count 7");
    expect(screen.queryByRole("button", { name: "Capture schema" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Capture fixture" })).toBeNull();
    expect(screen.getByText(/Capture is offered for \?limit runs/)).toBeTruthy();
    expect(screen.getByRole("status", { name: /Activated/ })).toBeTruthy();
  });

  it("shows a refusal's rule, and what the policy allows instead", async () => {
    brokerAnswer = {
      outcome: "refused",
      refusal: {
        kind: "POLICY_FIELD_NOT_GRANTED",
        message: "filter.NetAmount: this interface does not allow filtering on NetAmount. (This is the refusal the deployed application would receive.)",
        query: { rule: "FIELD_NOT_FILTERABLE", parameter: "filter.NetAmount.gt", field: "NetAmount", allowed: ["Order", "Customer"] },
      },
    };
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    fireEvent.change(screen.getByLabelText(/Query parameters/), { target: { value: "filter.NetAmount.gt=1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const rule = await screen.findByTestId("query-rule");
    expect(rule.textContent).toBe("Rule FIELD_NOT_FILTERABLE on filter.NetAmount.gt · allowed: Order, Customer");
    expect(screen.getByRole("heading", { name: "Refused by governance" })).toBeTruthy();
  });

  it("says a record SAP does not have in words, as an answer", async () => {
    brokerAnswer = {
      ...COMMON,
      queryStatus: "NO_RECORD",
      httpStatus: 404,
      records: [],
      count: 0,
      note: "SAP has no record with this key.",
      query: { kind: "KEY", sent: "/sap/opu/odata/sap/ZPAGING_ORDERS_SRV/OrderLines(Order='X',Line=1)?$format=json", page: null, rule: null },
    };
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    fireEvent.change(screen.getByLabelText(/Query parameters/), { target: { value: "key.Order=X&key.Line=1" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("status", { name: /No record — the service answered: no record has this key/ })).toBeTruthy();
    expect(screen.getByText("SAP has no record with this key.")).toBeTruthy();
    // The app is answered 404 RECORD_NOT_FOUND, not an empty 200: not told to treat it as data.
    expect(screen.queryByText(/This is an empty resource/)).toBeNull();
  });

  /*
   * Save as test case records what the run sent, never the field as it is at
   * Save: a refused query run was saved with no query (so it replayed as a
   * ?limit read), and a query edited after a run was stored beside the
   * outcome of the one before.
   */
  const savedCase = () => {
    const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/api/studio/test-cases") && (init as RequestInit | undefined)?.method === "POST");
    return call ? (JSON.parse((call[1] as RequestInit).body as string) as { name: string; request: Record<string, unknown>; lastOutcome: string }) : null;
  };

  it("saves a refused query run as the query that was refused", async () => {
    brokerAnswer = {
      outcome: "refused",
      refusal: { kind: "POLICY_FIELD_NOT_GRANTED", message: "filter.NetAmount: not allowed.", query: { rule: "FIELD_NOT_FILTERABLE", parameter: "filter.NetAmount.gt" } },
    };
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    fireEvent.change(screen.getByLabelText(/Query parameters/), { target: { value: " filter.NetAmount.gt=1 " } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save as test case" }));
    await waitFor(() => expect(savedCase()).not.toBeNull());
    expect(savedCase()).toMatchObject({ name: "Order lines — filter.NetAmount.gt=1", request: { query: "filter.NetAmount.gt=1" }, lastOutcome: "FAIL" });
  });

  it("saves the query that ran, not the field as edited after the run", async () => {
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    const field = screen.getByLabelText(/Query parameters/);
    fireEvent.change(field, { target: { value: "filter.Customer.eq=C2" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await screen.findByTestId("query-run");
    fireEvent.change(field, { target: { value: "filter.Customer.eq=C9&count=true" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as test case" }));
    await waitFor(() => expect(savedCase()).not.toBeNull());
    expect(savedCase()).toMatchObject({ name: "Order lines — filter.Customer.eq=C2", request: { query: "filter.Customer.eq=C2" }, lastOutcome: "PASS" });
  });

  it("reads the policy only when the builder is opened, and writes its parameters into the field", async () => {
    render(<TestConsoleClient tenantKey="development" canSave interfaces={[IFACE]} />);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/query-policy"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Build from the query policy" }));
    const builder = await screen.findByRole("group", { name: "Build from the query policy" });
    await waitFor(() => expect(within(builder).getByLabelText("Filter on")).toBeTruthy());
    // Only fields the policy lets a caller filter on are offered.
    const options = within(within(builder).getByLabelText("Filter on")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Choose a field", "Order", "Line", "Customer"]);
    fireEvent.change(within(builder).getByLabelText("Filter on"), { target: { value: "Customer" } });
    fireEvent.change(within(builder).getByLabelText("Operator"), { target: { value: "in" } });
    fireEvent.change(within(builder).getByLabelText("Value"), { target: { value: "C 1+2" } });
    fireEvent.click(within(builder).getByRole("button", { name: "Add filter" }));
    expect((screen.getByLabelText(/Query parameters/) as HTMLInputElement).value).toBe("filter.Customer.in=C+1%2B2");

    fireEvent.change(within(builder).getByLabelText("Key Order"), { target: { value: "O0001" } });
    fireEvent.change(within(builder).getByLabelText("Key Line"), { target: { value: "2" } });
    fireEvent.click(within(builder).getByRole("button", { name: "Look up by key" }));
    expect((screen.getByLabelText(/Query parameters/) as HTMLInputElement).value).toBe("key.Order=O0001&key.Line=2");
  });
});
