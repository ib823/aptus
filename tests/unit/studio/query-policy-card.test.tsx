/**
 * Studio's Query policy card (P1.4, 3.15), and the lines beside it: the
 * Runtime card's corrected defaults and the Verify panel's query-policy line.
 *
 *   - each state the card can be in says what it means for a caller, in
 *     words (not by colour): needs verify, off, ready, stale, unreadable,
 *     and the switch being off on this deployment;
 *   - "Enable queries" saves the safe default with the revision and the
 *     basis it was drawn from;
 *   - in the editor, unticking Read clears the field's filters and sort, a
 *     key part stays readable while key lookup or paging needs it, and every
 *     control the contract rules out says why in text;
 *   - a save that narrows an ACTIVE interface is confirmed before it is
 *     written, a 409 offers a reload, a refusal lists its reasons;
 *   - Remove is confirmed, and sends the revision.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { InterfacesClient, type StudioInterface } from "@/components/studio/InterfacesClient";
import { QueryPolicyCard, queryCardState, type QueryPolicyView } from "@/components/studio/QueryPolicyCard";
import { queryPolicySentence } from "@/components/studio/ServiceVerifyPanel";
import type { QueryBasisV1 } from "@/lib/odata/basis";
import type { QueryPolicySourceV1 } from "@/lib/odata/policy";
import type { CompiledSummary } from "@/lib/studio/query-policy";

const BASIS: QueryBasisV1 = {
  v: 1,
  snapshot: { id: "snap_1", semver: "2.1.0", contentHash: `ab12${"0".repeat(60)}` },
  entitySet: "OrderLines",
  odata: "V2",
  source: "METADATA",
  set: {},
  keys: ["Order", "Line"],
  properties: [
    { n: "Order", edm: "Edm.String", t: "S", nullable: false, ml: 10, label: "Order" },
    { n: "Line", edm: "Edm.Int32", t: "I32", nullable: false },
    { n: "Customer", edm: "Edm.String", t: "S", nullable: true, requiredInFilter: true },
    { n: "Blocked", edm: "Edm.Boolean", t: "B", nullable: true },
    { n: "Note", edm: "Edm.String", t: "S", nullable: true, filterable: false, sortable: false },
    { n: "Duration", edm: "Edm.Time", t: "OTHER", nullable: true },
    { n: "x'y", edm: "Edm.String", t: "S", nullable: true, bad: "NAME" },
  ],
};

const SUGGESTED: QueryPolicySourceV1 = {
  v: 1,
  select: "*",
  filter: [
    { field: "Order", ops: ["eq", "in"] },
    { field: "Line", ops: ["eq", "in"] },
    { field: "Customer", ops: ["eq", "in"] },
  ],
  sort: ["Order", "Line"],
  requireFilterOn: [],
  keyLookup: true,
  count: false,
  page: { defaultSize: 100, maxSize: 500, rowCap: 10_000, byteCap: 4_000_000 },
};

const COMPILED: CompiledSummary = {
  state: "READY",
  stale: null,
  rev: "qp1:AAAAAAAAAAAAAAAAAAAAAA",
  revision: 4,
  compiledAt: "2026-10-30T09:00:00.000Z",
  snapshot: BASIS.snapshot,
  warnings: [],
  paging: "OFFSET",
  tieBreak: ["Order", "Line"],
  key: ["Order", "Line"],
  pinned: [],
  requireFilterOn: ["Customer"],
  count: false,
  page: SUGGESTED.page,
  fields: [
    { n: "Order", ops: ["eq", "in"], sort: true },
    { n: "Line", ops: ["eq", "in"], sort: true },
    { n: "Customer", ops: ["eq", "in"], sort: false },
    { n: "Blocked", ops: [], sort: false },
  ],
};

function view(overrides: Partial<QueryPolicyView> = {}): QueryPolicyView {
  return {
    interfaceId: "if_1",
    interfaceStatus: "ACTIVE",
    basis: BASIS,
    basisHash: BASIS.snapshot.contentHash,
    source: SUGGESTED,
    sourceUnreadable: false,
    compiled: COMPILED,
    revision: 4,
    flagEnabled: true,
    canEdit: true,
    suggested: SUGGESTED,
    ...overrides,
  };
}

type Reply = { status: number; body: unknown };
let current: QueryPolicyView;
let replies: { PUT: Reply[]; DELETE: Reply[] };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  current = view();
  replies = { PUT: [], DELETE: [] };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (!url.endsWith("/query-policy")) return { ok: true, status: 200, json: async () => ({ data: {} }) };
    if (method === "GET") return { ok: true, status: 200, json: async () => ({ data: current }) };
    const reply = replies[method as "PUT" | "DELETE"].shift() ?? { status: 200, body: { data: { saved: true, revision: current.revision + 1, widened: [], narrowed: [] } } };
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body };
  });
  vi.stubGlobal("fetch", fetchMock);
});

const writes = (method: "PUT" | "DELETE") =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method).map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);

async function renderCard(v: QueryPolicyView, canAuthor = true) {
  current = v;
  render(<QueryPolicyCard interfaceId="if_1" canAuthor={canAuthor} />);
  await screen.findByRole("heading", { name: /Query policy/ });
  await waitFor(() => expect(screen.queryByText("Loading the query policy…")).toBeNull());
}

describe("the card's states, in words", () => {
  it("asks for a verify when the contract has not been described for queries", async () => {
    await renderCard(view({ basis: null, basisHash: null, source: null, compiled: null, suggested: null, revision: 0 }));
    expect(screen.getByText(/Verify the service to describe its fields before offering queries\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Verify" }).getAttribute("href")).toBe("#service-verify");
    expect(screen.getByRole("status", { name: /needs verify/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable queries" })).toBeNull();
  });

  it("treats a contract inferred from sampled rows as needing a verify", () => {
    expect(queryCardState(view({ basis: { ...BASIS, source: "SAMPLED" } }))).toBe("NEEDS_VERIFY");
  });

  it("says queries are off, and Enable queries saves the safe default against the basis it was drawn from", async () => {
    await renderCard(view({ source: null, compiled: null, revision: 2 }));
    expect(screen.getByText(/Queries are off/)).toBeTruthy();
    expect(screen.getByRole("status", { name: /queries off/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Enable queries" }));
    await waitFor(() => expect(writes("PUT")).toHaveLength(1));
    expect(writes("PUT")[0]).toEqual({ source: SUGGESTED, expected: { revision: 2, basisHash: BASIS.snapshot.contentHash } });
    await screen.findByText(/Saved as revision 3\./);
  });

  it("shows what callers are held to when ready, with where it was compiled from", async () => {
    await renderCard(view());
    expect(screen.getByRole("status", { name: /queries on/ })).toBeTruthy();
    expect(screen.getByText("Compiled against contract 2.1.0 (sha ab12…) on 30 Oct 2026 · revision 4 · qp1:AAAAAAAAAAAAAAAAAAAAAA")).toBeTruthy();
    expect(screen.getByText("Order (= any of), Line (= any of), Customer (= any of)")).toBeTruthy();
    expect(screen.getByText("on: key.Order, key.Line")).toBeTruthy();
    expect(screen.getByText(/Offset, tie-break Order, Line/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("offers a viewer no edit", async () => {
    await renderCard(view({ canEdit: false }), false);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("says a stale policy refuses every query, why, and offers to review it", async () => {
    await renderCard(
      view({
        compiled: { ...COMPILED, state: "STALE", stale: { reason: "KEY_CHANGED", at: "2026-10-30T09:00:00.000Z", sentence: "The dataset's key changed. Review it and save it again." } },
      }),
    );
    expect(screen.getByRole("status", { name: /stale/ })).toBeTruthy();
    expect(screen.getByText("Every query is refused until this policy is saved again.")).toBeTruthy();
    expect(screen.getByText(/The dataset's key changed\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    expect(screen.getByRole("form", { name: "Edit the query policy" })).toBeTruthy();
  });

  it("treats a policy CoreEdge cannot read as needing a save", () => {
    expect(queryCardState(view({ sourceUnreadable: true, source: null }))).toBe("UNREADABLE");
    expect(queryCardState(view({ compiled: { ...COMPILED, state: "UNREADABLE" } }))).toBe("UNREADABLE");
  });

  it("says when this deployment does not serve queries, whatever the policy", async () => {
    await renderCard(view({ flagEnabled: false }));
    expect(screen.getByText(/This deployment does not serve queries yet/)).toBeTruthy();
    expect(screen.getByText("COREEDGE_QUERY_SURFACE")).toBeTruthy();
  });
});

describe("the field table", () => {
  async function openEditor(v: QueryPolicyView = view()) {
    await renderCard(v);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    return screen.getByRole("form", { name: "Edit the query policy" });
  }

  it("keeps a key part readable while key lookup or paging needs it, and says so", async () => {
    await openEditor();
    const order = screen.getByRole("checkbox", { name: "Read Order" }) as HTMLInputElement;
    expect(order.checked).toBe(true);
    expect(order.disabled).toBe(true);
    expect(screen.getAllByText("kept: key lookup and paging need it")).toHaveLength(2);
  });

  it("turning key lookup back on ticks the key parts it locks, on a dataset SAP does not page", async () => {
    await renderCard(view({ basis: { ...BASIS, set: { pageable: false } }, source: null, compiled: null, revision: 0, interfaceStatus: "DRAFT" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose fields first" }));
    const form = screen.getByRole("form", { name: "Edit the query policy" });
    const keyLookup = within(form).getByRole("checkbox", { name: /Key lookup/ });
    fireEvent.click(keyLookup);
    fireEvent.click(within(form).getByRole("checkbox", { name: "Read Order" }));
    expect((within(form).getByRole("checkbox", { name: "Read Order" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(keyLookup);
    const order = within(form).getByRole("checkbox", { name: "Read Order" }) as HTMLInputElement;
    expect(order.disabled).toBe(true);
    expect(order.checked).toBe(true);
    fireEvent.click(within(form).getByRole("button", { name: "Save the policy" }));
    await waitFor(() => expect(writes("PUT")).toHaveLength(1));
    const sent = writes("PUT")[0]!.source as QueryPolicySourceV1;
    expect(sent.keyLookup).toBe(true);
    expect(sent.select === "*" || sent.select.includes("Order")).toBe(true);
  });

  it("unticking Read clears the field's filters and sort (a hidden field is never a filter)", async () => {
    await openEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "Read Customer" }));
    expect(screen.queryByRole("group", { name: "Filters on Customer" })).toBeNull();
    expect(screen.getAllByText("Not filterable: make it readable first").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Save the policy" }));
    await waitFor(() => expect(writes("PUT")).toHaveLength(1));
    const sent = writes("PUT")[0]!.source as QueryPolicySourceV1;
    expect(sent.select).toEqual(["Order", "Line", "Blocked", "Note", "Duration"]);
    expect(sent.filter.map((f) => f.field)).toEqual(["Order", "Line"]);
  });

  it("states every reason a control is unavailable in text, and offers = only on a Boolean", async () => {
    await openEditor();
    expect(screen.getByText("Not filterable: SAP does not allow filtering on it")).toBeTruthy();
    expect(screen.getByText("Not sortable: SAP does not allow sorting on it")).toBeTruthy();
    expect(screen.getByText("Not filterable: its type (Edm.Time) cannot be filtered on")).toBeTruthy();
    expect(screen.getByText("CoreEdge cannot address a field with this name or type.")).toBeTruthy();
    const blocked = screen.getByRole("group", { name: "Filters on Blocked" });
    expect(within(blocked).getAllByRole("button").map((b) => b.textContent)).toEqual(["="]);
    expect(within(blocked).getByText("true or false: = only")).toBeTruthy();
    // Badges in words: the key, SAP's requirement, SAP's restrictions.
    expect(screen.getAllByText("key")).toHaveLength(2);
    expect(screen.getByText("required by SAP", { selector: "span[style*='border']" })).toBeTruthy();
  });

  it("marks a chip that is on by its tick and aria-pressed, and any-of brings = with it", async () => {
    await openEditor();
    const blocked = screen.getByRole("group", { name: "Filters on Line" });
    const range = within(blocked).getByRole("button", { name: "Filter Line: a range (greater or less than)" });
    expect(range.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(range);
    expect(range.getAttribute("aria-pressed")).toBe("true");
    expect(range.textContent).toBe("✓ range");
    fireEvent.click(screen.getByRole("button", { name: "Save the policy" }));
    await waitFor(() => expect(writes("PUT")).toHaveLength(1));
    const sent = writes("PUT")[0]!.source as QueryPolicySourceV1;
    expect(sent.filter.find((f) => f.field === "Line")!.ops).toEqual(["eq", "in", "gt", "ge", "lt", "le"]);
    // Every field still readable: "*", so fields the contract gains later are readable too.
    expect(sent.select).toBe("*");
  });

  it("labels every paging input, and sends the page limit in bytes", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Page size limit (MB)"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Maximum page size"), { target: { value: "800" } });
    expect(screen.getByLabelText("Default page size")).toBeTruthy();
    expect(screen.getByLabelText("Rows per paging run")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save the policy" }));
    await waitFor(() => expect(writes("PUT")).toHaveLength(1));
    expect((writes("PUT")[0]!.source as QueryPolicySourceV1).page).toEqual({ defaultSize: 100, maxSize: 800, rowCap: 10_000, byteCap: 1_500_000 });
  });

  it("locks SAP's required filters on, and leaves them out of the source the compiler adds them to", async () => {
    await openEditor();
    const required = within(screen.getByRole("group", { name: "Required filters" }));
    const customer = required.getByRole("checkbox", { name: /Customer/ }) as HTMLInputElement;
    expect(customer.checked).toBe(true);
    expect(customer.disabled).toBe(true);
    fireEvent.click(required.getByRole("checkbox", { name: /Order/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save the policy" }));
    await waitFor(() => expect(writes("PUT")).toHaveLength(1));
    expect((writes("PUT")[0]!.source as QueryPolicySourceV1).requireFilterOn).toEqual(["Order"]);
  });
});

describe("saving, as the route answers", () => {
  it("asks before a save that narrows an ACTIVE interface, and sends the confirmation", async () => {
    replies.PUT.push({ status: 200, body: { data: { saved: false, confirm: { narrowed: ["Customer in"], widened: [], message: "Callers using these fields or operators will receive 400 POLICY_FIELD_NOT_GRANTED." } } } });
    await renderCard(view());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the policy" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Customer in");
    expect(alert.textContent).toContain("Callers using these fields or operators will receive 400 POLICY_FIELD_NOT_GRANTED.");
    fireEvent.click(within(alert).getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(writes("PUT")).toHaveLength(2));
    expect(writes("PUT")[1]).toMatchObject({ confirmNarrowing: true });
    expect(writes("PUT")[0]).not.toHaveProperty("confirmNarrowing");
  });

  it("offers a reload on a 409, and lists each reason of a refusal", async () => {
    replies.PUT.push({ status: 400, body: { error: { message: "A. B.", errors: [{ rule: "X", message: "A." }, { rule: "Y", message: "B." }] } } });
    replies.PUT.push({ status: 409, body: { error: { message: "The query policy or the service's contract changed while you were editing. Reload, then make your change again." } } });
    await renderCard(view());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the policy" }));
    const refused = await screen.findByRole("alert");
    expect(within(refused).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["A.", "B."]);
    fireEvent.click(screen.getByRole("button", { name: "Save the policy" }));
    await screen.findByText(/changed while you were editing/);
    const gets = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === undefined).length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === undefined).length).toBe(gets + 1));
  });

  it("confirms Remove, and sends the revision it was shown", async () => {
    replies.DELETE.push({ status: 200, body: { data: { removed: true, revision: 5 } } });
    await renderCard(view());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("receives 400 VALIDATION_ERROR (error.query.rule NO_POLICY)");
    expect(writes("DELETE")).toHaveLength(0);
    fireEvent.click(within(alert).getByRole("button", { name: "Remove the policy" }));
    await waitFor(() => expect(writes("DELETE")).toEqual([{ expected: { revision: 4 } }]));
    await screen.findByText(/Queries are off: callers sending query parameters now receive 400 VALIDATION_ERROR \(error\.query\.rule NO_POLICY\)\./);
  });
});

describe("a Remove that gets no answer", () => {
  it("says it failed, as a failed save does, and leaves the policy as it was", async () => {
    await renderCard(view());
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Remove the policy" }));
    await screen.findByText("The query policy could not be removed. Try again.");
    expect(screen.getByRole("button", { name: "Remove the policy" })).toBeTruthy();
    expect(screen.queryByText(/Queries are off/)).toBeNull();
  });
});

describe("the Interfaces screen around it", () => {
  const BASE: StudioInterface = {
    id: "if_1",
    name: "Order lines",
    version: 1,
    sapProduct: "s4hana",
    externalId: "custom:/sap/opu/odata/sap/ZPAGING_ORDERS_SRV",
    operation: "READ",
    entitySet: "OrderLines",
    mode: "READ",
    status: "ACTIVE",
    mappingVersion: null,
    hasRequestSchema: false,
    responseSchemaState: "none",
    solutionId: "sol_1",
    solutionName: "Portal",
  };

  it("mounts the Query policy card on a read interface only", async () => {
    const { unmount } = render(<InterfacesClient interfaces={[BASE]} canAuthor={true} />);
    expect(await screen.findByRole("heading", { name: /Query policy/ })).toBeTruthy();
    unmount();
    render(<InterfacesClient interfaces={[{ ...BASE, operation: "CREATE", mode: "WRITE" }]} canAuthor={true} />);
    expect(screen.queryByRole("heading", { name: /Query policy/ })).toBeNull();
  });

  it("states the runtime's real timeout, quota and response limit", async () => {
    render(<InterfacesClient interfaces={[BASE]} canAuthor={true} />);
    expect(screen.getByText("15 s, or the connection's override (at most 30 s)")).toBeTruthy();
    expect(screen.getByText("60 calls a minute per credential, shared by data reads, /schema and Test Console runs")).toBeTruthy();
    expect(screen.getByText("4.5 MB on ?limit reads; the query policy's page limit on queries")).toBeTruthy();
    await screen.findByRole("heading", { name: /Query policy/ });
  });
});

describe("the Verify panel's query-policy line", () => {
  it("says nothing when no policy was recompiled", () => {
    expect(queryPolicySentence(null)).toBeNull();
    expect(queryPolicySentence(undefined)).toBeNull();
  });

  it("says a recompile, a narrowing in full, and a stale policy with why", () => {
    expect(queryPolicySentence({ state: "READY", revision: 5, narrowed: [], warnings: [] })).toBe("Query policy recompiled against this contract (revision 5).");
    expect(queryPolicySentence({ state: "READY", revision: 6, narrowed: ["CreationDate removed: it is no longer in the contract."], warnings: [] })).toBe(
      "Query policy recompiled (revision 6) and narrowed: CreationDate removed: it is no longer in the contract.",
    );
    expect(queryPolicySentence({ state: "STALE", revision: 7, narrowed: [], warnings: ["The dataset's key changed since the policy was saved."] })).toBe(
      "Query policy now stale: The dataset's key changed since the policy was saved. Queries are refused until a builder saves it again.",
    );
    expect(queryPolicySentence({ state: "UNREADABLE", revision: 8, narrowed: [], warnings: [] })).toContain("could not be read");
  });
});
