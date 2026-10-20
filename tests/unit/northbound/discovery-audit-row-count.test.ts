/**
 * Discovery reads no SAP record, so its audit row says so (audit A09).
 *
 * `GET /api/northbound/interfaces` lists a solution's interfaces from
 * CoreEdge's own tables. It audited each call as READ / 200 with
 * `rowCount = interfaces.length`, and the usage rollup sums rowCount over
 * served reads into "Rows read" — so an app that listed ten interfaces on every
 * boot was recorded as reading ten SAP rows per boot. `rowCount` is null here,
 * as it is on the schema route, for the same reason.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/northbound/interfaces/route";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const mocks = vi.hoisted(() => ({
  findManyInterfaces: vi.fn(),
  findManyGrants: vi.fn(),
  auditCreate: vi.fn(),
  authenticate: vi.fn(),
  touch: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findMany: mocks.findManyInterfaces },
    apiAccessGrant: { findMany: mocks.findManyGrants },
    northboundAuditEvent: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: mocks.authenticate,
  extractBearer: (h: string | null) => h?.replace(/^Bearer /, "") ?? null,
  touchClientLastUsed: mocks.touch,
}));

const iface = (i: number) => ({
  id: `if_${i}`,
  name: `Feed ${i}`,
  externalId: `API_${i}`,
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: `Set${i}`,
  mode: "READ",
  version: 1,
  status: "ACTIVE",
  solutionId: "sol_1",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    ok: true,
    client: {
      clientId: "cl_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      environment: "PROD",
      scope: tenantScopeOf("org_a"),
    },
  });
  mocks.touch.mockResolvedValue(undefined);
  mocks.findManyInterfaces.mockResolvedValue([iface(1), iface(2), iface(3)]);
  mocks.findManyGrants.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
});

describe("the discovery audit row", () => {
  it("is a served READ with no SAP rows read", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/northbound/interfaces", {
        headers: { authorization: "Bearer ce_live_x" },
      }),
    );
    expect(res.status).toBe(200);

    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
    const data = (mocks.auditCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ operation: "READ", externalId: "-discovery-", status: 200 });
    expect(data.rowCount, "three interfaces listed is not three SAP rows read").toBeNull();
  });
});
