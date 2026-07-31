/**
 * Two active connections must not be indistinguishable to the binding.
 *
 * THE GAP THIS CLOSES. resolveSapConnectionForEnvironment refuses AMBIGUOUS
 * when several connections match a caller's environment — correct, but late.
 * The pair was created days before, and the first symptom is an integration
 * going dark with a refusal that names no cause. Nothing stopped the pair
 * being created: `20260730070000_sap_connection_client` says so in its own
 * header ("No unique constraint here… adding it before checking live rows
 * would turn a detected ambiguity into a failed migration").
 *
 * Production was checked (5 rows, 2026-07-31): active rows are clean, and
 * deactivated qa-conn-* fixtures DO collide — which is why both the index and
 * the check below are scoped to active rows only.
 *
 * These tests cover the route-level refusal (the sentence a consultant reads).
 * The partial unique index is the backstop for anything that bypasses the
 * route; its exact scope is asserted in the migration-shape test at the end.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolver from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => {
  const findFirst = vi.fn();
  const getCurrentUser = vi.fn();
  const upsertSapConnection = vi.fn();
  return {
    findFirst,
    getCurrentUser,
    upsertSapConnection,
    prismaMock: { sapConnection: { findFirst } },
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/sap-public/connection-resolver", async (orig) => {
  // normalizeEnvironment is REAL here on purpose: the route must normalize
  // exactly the way the write path does, and mocking it would hide a drift
  // that only shows up as a twin slipping through in production.
  const actual = await orig<typeof ConnectionResolver>();
  return { ...actual, upsertSapConnection: mocks.upsertSapConnection };
});
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: vi.fn() }));

import { POST } from "@/app/api/studio/connections/route";

const BODY = {
  product: "cloud-erp-private",
  key: "x5m-dev",
  label: "X5M Development",
  baseUrl: "https://x5m.example.com",
  authType: "basic" as const,
  username: "u",
  password: "p",
  environment: "DEV",
  client: "100",
};

function post(body: Record<string, unknown>): Request {
  return new Request("https://app.test/api/studio/connections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: "u1",
    role: "consultant",
    organizationId: "org1",
  });
  mocks.upsertSapConnection.mockResolvedValue({ id: "c1", key: BODY.key });
  mocks.findFirst.mockResolvedValue(null);
});

describe("the twin refusal", () => {
  it("refuses a second active connection for the same environment + client", async () => {
    mocks.findFirst
      .mockResolvedValueOnce(null) // same-key lookup: this is a new key
      .mockResolvedValueOnce({ key: "x5m100-customizing", label: "X5M Customizing" });

    const res = await POST(post(BODY) as never);
    const body = (await res.json()) as { error?: { message?: string } };

    expect(res.status).toBe(400);
    expect(body.error?.message).toContain("x5m100-customizing");
    expect(body.error?.message).toContain("DEV client 100");
    // The refusal must say what to DO, not merely that it refused.
    expect(body.error?.message).toMatch(/deactivate/i);
    expect(mocks.upsertSapConnection).not.toHaveBeenCalled();
  });

  it("normalizes before comparing — 'dev' must not slip past a stored 'DEV'", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await POST(post({ ...BODY, environment: "  dev  " }) as never);

    const twinQuery = mocks.findFirst.mock.calls[1]?.[0] as {
      where: { environment: string };
    };
    expect(twinQuery.where.environment).toBe("DEV");
  });

  it("scopes the search to ACTIVE rows and excludes the same key", async () => {
    await POST(post(BODY) as never);

    const twinQuery = mocks.findFirst.mock.calls[1]?.[0] as {
      where: { isActive: boolean; NOT: { key: string }; client: string | null };
    };
    // Deactivated fixtures collide in production; the resolver ignores them
    // and so must this.
    expect(twinQuery.where.isActive).toBe(true);
    // Re-saving one connection is replacement, the documented rotation path.
    expect(twinQuery.where.NOT).toEqual({ key: "x5m-dev" });
    expect(twinQuery.where.client).toBe("100");
  });

  it("a different SAP client on the same system is NOT a twin", async () => {
    // X5M/100 and X5M/080 are different data containers at one baseUrl —
    // the entire reason the client column exists.
    mocks.findFirst.mockResolvedValue(null);
    const res = await POST(post({ ...BODY, client: "080" }) as never);

    expect(res.status).toBe(200);
    const twinQuery = mocks.findFirst.mock.calls[1]?.[0] as { where: { client: string } };
    expect(twinQuery.where.client).toBe("080");
    expect(mocks.upsertSapConnection).toHaveBeenCalled();
  });

  it("skips the check entirely when no environment is declared", async () => {
    const { environment: _drop, ...noEnv } = BODY;
    const res = await POST(post(noEnv) as never);

    expect(res.status).toBe(200);
    // Only the same-key lookup ran. An undeclared environment is the
    // documented unbackfilled state, not a collision.
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("the index that backstops the route", () => {
  it("is partial, NULLS NOT DISTINCT, and scoped to active declared rows", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const sql = readFileSync(
      resolve(__dirname, "../../../prisma/migrations/20260731010000_connection_binding_tuple/migration.sql"),
      "utf8",
    );

    // NULLS NOT DISTINCT is the load-bearing clause: without it, two active
    // DEV rows with a NULL client are accepted silently and the index looks
    // like it is working.
    expect(sql).toMatch(/NULLS NOT DISTINCT/);
    expect(sql).toMatch(/WHERE\s+"isActive"\s+AND\s+"environment"\s+IS NOT NULL/);
    expect(sql).toMatch(/"organizationId",\s*"product",\s*"environment",\s*"client"/);
  });
});
