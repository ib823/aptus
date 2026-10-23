/**
 * GET /api/studio/interfaces never reads or returns a request schema
 * (hostile-input review round 2), nor a response schema (P1.3 structural
 * containment): a list's work is bounded by its small columns.
 *
 * P1.3 began writing Interface.requestSchema on verify, and this list selected
 * it for every interface of the organisation and returned it whole: twenty
 * write interfaces of one hostile service were a 160 MB response, 12 s of CPU
 * and 3 GB of RSS per load. The list says whether there is one, from a query
 * that selects ids only; GET …/schema serves the body of one interface.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findMany: mocks.findMany },
    sapConnection: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: mocks.queryRaw,
  },
}));

import { GET } from "@/app/api/studio/interfaces/route";

const BUILDER = { id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };

const ROW = {
  id: "if_1",
  name: "Orders create",
  version: 2,
  sapProduct: "s4hana",
  externalId: "CE_SALESORDER_0001",
  operation: "CREATE",
  entitySet: "SalesOrder",
  mode: "WRITE",
  status: "DRAFT",
  mappingVersion: null,
  responseSchema: null,
  solutionId: "sol_1",
  updatedAt: new Date("2026-10-20T00:00:00.000Z"),
  servicePath: null,
  odataVersion: null,
  serviceVerifiedAt: null,
  serviceVerifiedEnvironment: null,
  serviceVerifications: null,
  solution: { name: "s" },
};

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findMany.mockReset();
  mocks.queryRaw.mockReset();
  mocks.queryRaw.mockResolvedValue([]);
  mocks.findMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
    // The list's own query, or the id-only one that asks which have a request schema.
    Object.keys(args.select).length === 1 ? [{ id: "if_1" }] : [{ ...ROW }, { ...ROW, id: "if_2", operation: "READ", mode: "READ" }],
  );
});

describe("GET /api/studio/interfaces", () => {
  it("selects no request schema, and says per interface whether there is one", async () => {
    const res = await GET(new NextRequest("http://localhost/api/studio/interfaces"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { interfaces: Record<string, unknown>[] } };
    for (const call of mocks.findMany.mock.calls) {
      expect((call[0] as { select: Record<string, unknown> }).select).not.toHaveProperty("requestSchema");
    }
    // The presence query filters on the column and selects only ids.
    const presence = mocks.findMany.mock.calls.map((c) => c[0] as { where: unknown; select: Record<string, unknown> }).find((a) => Object.keys(a.select).length === 1);
    expect(presence?.select).toEqual({ id: true });
    expect(JSON.stringify(presence?.where)).toContain("requestSchemaStamp");
    expect(body.data.interfaces.map((i) => [i.id, i.hasRequestSchema])).toEqual([
      ["if_1", true],
      ["if_2", false],
    ]);
    for (const i of body.data.interfaces) expect(i).not.toHaveProperty("requestSchema");
  });

  it("selects no response schema either: where each stands is read from its stamp, in the database", async () => {
    // if_1's capture is of this contract (v2, SalesOrder); if_2's of an earlier one; if_3 has none.
    mocks.findMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
      Object.keys(args.select).length === 1
        ? []
        : [{ ...ROW }, { ...ROW, id: "if_2" }, { ...ROW, id: "if_3" }].map(({ responseSchema: _r, ...row }) => row),
    );
    mocks.queryRaw.mockResolvedValue([
      { id: "if_1", captured: true, stampVersion: 2, stampEntitySet: "SalesOrder" },
      { id: "if_2", captured: true, stampVersion: 1, stampEntitySet: "SalesOrder" },
    ]);
    const res = await GET(new NextRequest("http://localhost/api/studio/interfaces"));
    const body = (await res.json()) as { data: { interfaces: Record<string, unknown>[] } };
    for (const call of mocks.findMany.mock.calls) {
      const select = (call[0] as { select: Record<string, unknown> }).select;
      expect(select).not.toHaveProperty("responseSchema");
      expect(select).not.toHaveProperty("requestSchema");
    }
    // One query of the stamps' facts, scoped to the organisation: never the schema.
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    const sql = mocks.queryRaw.mock.calls[0]![0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join("?")).toContain("'x-captured'");
    expect(sql.strings.join("?")).not.toMatch(/SELECT\s+\*|"responseSchema"\s*(AS|,|FROM)/);
    expect(sql.values).toContain("org_a");
    expect(body.data.interfaces.map((i) => [i.id, i.responseSchemaState])).toEqual([
      ["if_1", "current"],
      ["if_2", "stale"],
      ["if_3", "none"],
    ]);
    for (const i of body.data.interfaces) expect(i).not.toHaveProperty("responseSchema");
  });
});
