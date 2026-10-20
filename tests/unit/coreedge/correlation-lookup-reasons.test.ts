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
