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
vi.mock("@/lib/db/prisma", () => ({ prisma: { northboundAuditEvent: { findFirst } } }));

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

beforeEach(() => findFirst.mockReset());

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
