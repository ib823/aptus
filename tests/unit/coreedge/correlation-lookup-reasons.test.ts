/**
 * A quoted correlation id says where the call really stopped (roadmap P0.5).
 *
 * Two kinds of row read as SAP's fault on the lookup: a call refused because
 * the rate limiter was down (503 LIMITER_UNAVAILABLE — "Failed with status
 * 503", blamed on the SAP read), and a call whose connection's token endpoint
 * failed (502 TOKEN_HTTP_503 — "SAP returned an error"). In neither was SAP
 * asked anything, and the person reading the answer is about to tell the
 * customer's Basis team.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
const consoleFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({
  prisma: { northboundAuditEvent: { findFirst }, platformConsoleRead: { findFirst: consoleFindFirst } },
}));

import { lookupCorrelationId } from "@/lib/coreedge/correlation-lookup";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const row = (over: Record<string, unknown>) => ({
  correlationId: "corr_1",
  at: new Date("2026-10-20T11:00:00.000Z"),
  status: 200,
  operation: "READ",
  externalId: "API_BUSINESS_PARTNER",
  environment: "PROD",
  rowCount: null,
  durationMs: null,
  dryRun: false,
  bindingRefusal: null,
  failureReason: null,
  connectionId: null,
  replayed: false,
  ...over,
});

async function lookup(over: Record<string, unknown>) {
  findFirst.mockResolvedValue(row(over));
  const r = await lookupCorrelationId("org_a", "corr_1", NOW);
  if (r.kind !== "found") throw new Error(`expected a call, got ${r.kind}`);
  return r.call;
}

beforeEach(() => {
  findFirst.mockReset();
  consoleFindFirst.mockReset();
  consoleFindFirst.mockResolvedValue(null);
});

describe("correlation lookup", () => {
  it("a limiter outage stopped at the key's hop, and nothing was sent to SAP", async () => {
    const call = await lookup({ status: 503, failureReason: "LIMITER_UNAVAILABLE" });
    expect(call.brokenHop).toBe("key");
    expect(call.outcome).toContain("could not check its rate limits");
    expect(call.outcome).toContain("Nothing was sent to SAP");
  });

  it("a token endpoint that failed is not 'SAP returned an error'", async () => {
    const call = await lookup({ status: 502, failureReason: "TOKEN_HTTP_503" });
    expect(call.outcome).not.toBe("SAP returned an error.");
    expect(call.outcome).toContain("token endpoint");
  });

  it("a token endpoint that timed out is not 'SAP did not answer in time'", async () => {
    const call = await lookup({ status: 504, failureReason: "TOKEN_TIMEOUT" });
    expect(call.outcome).toContain("token endpoint did not answer in time");
  });

  it("SAP's own failures still read as SAP's", async () => {
    expect((await lookup({ status: 502, failureReason: "HTTP_500" })).outcome).toBe("SAP returned an error.");
    expect((await lookup({ status: 504, failureReason: "TIMEOUT" })).outcome).toBe("SAP did not answer in time.");
    expect((await lookup({ status: 429, failureReason: null })).brokenHop).toBe("key");
  });
});

/*
 * A REFUSAL COREEDGE GAVE IS NOT SAP'S ANSWER (P0.14 review). The search
 * went live in Operations with P0.14, and read every 403 without a binding
 * refusal, every 404 and every 400 or 409 as "SAP's answer to the read" — so
 * a missing grant sent the operator to the customer's SAP admin. The row
 * holds the facts that tell them apart: a call that reached SAP has a
 * duration (or the upstream failure that ended it, or is a replay of one that
 * did); one that was bound has a connection.
 */
describe("a refusal before SAP is attributed to the hop that gave it", () => {
  it("a grant refusal is the access hop, and nothing was sent to SAP", async () => {
    const call = await lookup({ status: 403 });
    expect(call.brokenHop).toBe("access");
    expect(call.outcome).toContain("Nothing was sent to SAP");
  });

  it("an interface not found is the access hop, not 'not found on this SAP system'", async () => {
    const call = await lookup({ status: 404 });
    expect(call.brokenHop).toBe("access");
    expect(call.outcome).not.toContain("SAP system");
    expect(call.outcome).toContain("Nothing was sent to SAP");
  });

  it("an invalid request or an idempotency conflict is the request's hop", async () => {
    for (const status of [400, 409]) {
      const call = await lookup({ status, operation: "WRITE" });
      expect(call.brokenHop).toBe("request");
      expect(call.outcome).toContain("Nothing was sent to SAP");
    }
    // Bound to a connection first, then refused for the feed's definition.
    expect((await lookup({ status: 400, connectionId: "conn_1" })).brokenHop).toBe("request");
  });

  it("writes disabled on the bound connection is the connection's hop", async () => {
    const call = await lookup({ status: 403, operation: "WRITE", connectionId: "conn_1" });
    expect(call.brokenHop).toBe("binding");
    expect(call.outcome).toContain("Nothing was sent to SAP");
  });

  it("the console's grant ceiling on a named connection is the access hop", async () => {
    const call = await lookup({ status: 403, operation: "READ", connectionId: "conn_1", dryRun: true });
    expect(call.brokenHop).toBe("access");
  });

  it("SAP's own refusals still read as SAP's", async () => {
    const refused = await lookup({ status: 403, connectionId: "conn_1", durationMs: 120, failureReason: "HTTP_403" });
    expect(refused.brokenHop).toBe("sapDataRead");
    expect(refused.outcome).toBe("Refused.");
    const missing = await lookup({ status: 404, connectionId: "conn_1", durationMs: 80, failureReason: "HTTP_404" });
    expect(missing.brokenHop).toBe("sapDataRead");
    expect(missing.outcome).toBe("Not found on this SAP system.");
  });

  it("a replayed write is SAP's earlier answer, and says it was replayed", async () => {
    const call = await lookup({ status: 502, operation: "WRITE", connectionId: "conn_1", replayed: true });
    expect(call.brokenHop).toBe("sapDataRead");
    expect(call.outcome).toMatch(/^Replayed/);
    expect(call.outcome).toContain("SAP returned an error.");
  });

  it("selects the facts it attributes from", async () => {
    await lookup({ status: 200 });
    expect(findFirst.mock.calls.at(-1)![0].select).toMatchObject({ connectionId: true, replayed: true, durationMs: true });
  });
});

/*
 * AN ID THE ARIBA CONSOLE HANDED OUT IS FOUND (wave 2 integration review
 * round 4). Every console call quotes its correlation id, but only an OData
 * read files the organization's row; an Ariba call leaves only its
 * platform-scope PlatformConsoleRead. The search read only the organization's
 * trail and told a member of the organization that no call in it had the id.
 */
describe("a console call with no organization row", () => {
  const consoleRow = (over: Record<string, unknown>) => ({
    correlationId: "corr_ariba",
    at: new Date("2026-10-20T11:30:00.000Z"),
    product: "ariba",
    serviceKey: "sourcing-events",
    outcome: "SUCCEEDED",
    status: 200,
    reason: null,
    durationMs: 140,
    detail: { principal: "console", environment: "ariba", connectionId: null, rowCount: 3, status: 200 },
    ...over,
  });

  async function find(over: Record<string, unknown>) {
    findFirst.mockResolvedValue(null);
    consoleFindFirst.mockResolvedValue(consoleRow(over));
    const r = await lookupCorrelationId("org_a", " corr_ariba ", NOW);
    if (r.kind !== "found") throw new Error(`expected a call, got ${r.kind}`);
    return r.call;
  }

  it("is looked up on the console's platform trail, keyed on the searcher's organization", async () => {
    const call = await find({});
    expect(consoleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorOrganizationId: "org_a", correlationId: "corr_ariba" } }),
    );
    expect(call).toMatchObject({
      correlationId: "corr_ariba",
      status: 200,
      operation: "READ",
      externalId: "sourcing-events",
      environment: null,
      environmentRaw: "ariba",
      brokenHop: null,
      rowCount: 3,
      durationMs: 140,
      dryRun: true,
    });
    expect(call.outcome).toBe("Succeeded, 3 rows.");
  });

  it("never selects what was read", async () => {
    await find({});
    const select = consoleFindFirst.mock.calls.at(-1)![0].select as Record<string, unknown>;
    for (const forbidden of ["payloadFields", "payloadSha256", "servicePath", "tenantKey", "actorEmail"]) {
      expect(select, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it("a host refusal is the binding hop, and nothing was sent", async () => {
    const call = await find({
      outcome: "BLOCKED",
      status: null,
      reason: "HOST_NOT_ALLOWED",
      durationMs: null,
      detail: { environment: "ariba", status: 403 },
    });
    expect(call.status).toBe(403);
    expect(call.brokenHop).toBe("binding");
    expect(call.outcome).toContain("host allow-list");
    expect(call.durationMs).toBeNull();
  });

  it("a gate's own reason (a sandbox developer) is not mistaken for SAP's answer", async () => {
    const call = await find({
      outcome: "BLOCKED",
      status: null,
      reason: "SANDBOX_ONLY",
      durationMs: null,
      detail: { environment: "ariba", status: 403 },
    });
    expect(call.brokenHop).toBe("access");
    expect(call.outcome).toContain("Nothing was sent to SAP");
  });

  it("SAP's own failure stays SAP's", async () => {
    const call = await find({
      outcome: "FAILED",
      status: 502,
      reason: "HTTP_500",
      durationMs: 900,
      detail: { environment: "ariba", status: 502 },
    });
    expect(call.brokenHop).toBe("sapDataRead");
    expect(call.outcome).toBe("SAP returned an error.");
  });

  it("is outside the window like any other call", async () => {
    findFirst.mockResolvedValue(null);
    consoleFindFirst.mockResolvedValue(consoleRow({ at: new Date("2026-09-01T00:00:00.000Z") }));
    expect(await lookupCorrelationId("org_a", "corr_ariba", NOW)).toEqual({ kind: "outside-window", windowDays: 30 });
  });

  it("is not asked when the organization's own row answers", async () => {
    findFirst.mockResolvedValue(row({}));
    await lookupCorrelationId("org_a", "corr_1", NOW);
    expect(consoleFindFirst).not.toHaveBeenCalled();
  });

  it("is still not found when neither trail has it", async () => {
    findFirst.mockResolvedValue(null);
    expect(await lookupCorrelationId("org_a", "corr_none", NOW)).toEqual({ kind: "not-found" });
  });
});

/*
 * P1.4: a query CoreEdge refused carries its rule in queryRule, never in
 * failureReason, which the lookup reads as "the upstream call failed". So a
 * refused query is the request's, with nothing sent to SAP, whatever its
 * status — a 400 POLICY_FIELD_NOT_GRANTED, a 409 stale cursor, a 500 for a
 * ring that cannot be read — and SAP's own refusal of a query reached SAP.
 */
describe("correlation lookup on the query surface", () => {
  it.each([
    [400, "FIELD_NOT_FILTERABLE"],
    [400, "CURSOR_INVALID"],
    [409, "EXPIRED"],
    [409, "CURSOR_GRANT_CHANGED"],
    [500, "TOKEN_RING_UNAVAILABLE"],
  ])("a %i query refusal (%s) is the request's, and nothing was sent to SAP", async (status, queryRule) => {
    const call = await lookup({ status, queryRule });
    expect(call.brokenHop).toBe("request");
    expect(call.outcome).toContain(queryRule);
    expect(call.outcome).toContain("Nothing was sent to SAP");
    expect(call.outcome).not.toContain("Idempotency-Key");
  });

  it("SAP's own refusal of a query reached SAP", async () => {
    const call = await lookup({ status: 422, queryRule: "SAP_REJECTED", failureReason: "HTTP_400", durationMs: 40 });
    expect(call.brokenHop).toBe("sapDataRead");
  });

  it("an answer too large to return is the request's, though SAP answered", async () => {
    const legacy = await lookup({ status: 413, queryRule: "RESPONSE_TOO_LARGE", durationMs: 900 });
    expect(legacy.brokenHop).toBe("request");
    expect(legacy.outcome).toContain("larger than CoreEdge can return");
    const row = await lookup({ status: 422, queryRule: "ROW_TOO_LARGE", durationMs: 900 });
    expect(row.brokenHop).toBe("request");
    expect(row.outcome).toContain("one record is larger");
  });

  it("a row with no queryRule reads exactly as before", async () => {
    const call = await lookup({ status: 409 });
    expect(call.outcome).toContain("Idempotency-Key");
  });
});
