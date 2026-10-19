/**
 * The Control Tower audit trail survives the REAL tenant-scope guard.
 *
 * THE PAGE WAS SCOPED AND THE FOLLOW-UP WAS NOT. The trail resolved Solution ids
 * to names with `where: { id: { in: ids } }` and no organizationId. The ids came
 * from a scoped page, so nothing foreign could come back — but the guard on the
 * live client judges the query, not where its ids came from. For a tenant-scoped
 * reader (no declared cross-tenant context) it threw MissingTenantScopeError the
 * moment the page held a Solution entry, which every solution create, update or
 * promote writes. The governance trail answered 500 to the people it exists for.
 *
 * WHY A FILE OF ITS OWN. control-tower-endpoints.test.ts mocks the client without
 * the guard, so every case there passed while the real route threw. And it also
 * runs a global-admin request, whose `permitCrossTenantReads` (enterWith) leaks
 * into the rest of that file's test context — which would make the guard here
 * permit everything and this test pass for the wrong reason. A separate file is a
 * separate module graph with a fresh context; the first case pins that.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  crossTenantPermission,
  MissingTenantScopeError,
  tenantScopeGuard,
} from "@/lib/db/tenant-guard";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  solutionFindMany: vi.fn(),
  userFindMany: vi.fn(),
  auditFindMany: vi.fn(),
  auditCount: vi.fn(),
  auditGroupBy: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solution: { findMany: mocks.solutionFindMany },
    user: { findMany: mocks.userFindMany },
    configAudit: {
      findMany: mocks.auditFindMany,
      count: mocks.auditCount,
      groupBy: mocks.auditGroupBy,
    },
  },
}));

import { GET as audit } from "@/app/api/control-tower/audit/route";

type GuardRunner = (ctx: {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

// The SAME hook lib/db/prisma attaches to the live client.
const guarded = (tenantScopeGuard() as unknown as { query: { $allModels: { $allOperations: GuardRunner } } })
  .query.$allModels.$allOperations;

/** Route a mocked model call through the real guard, as the live client would. */
function throughGuard(model: string, operation: string, rows: unknown) {
  return (args: unknown) => guarded({ model, operation, args, query: async () => rows });
}

const PARTNER_LEAD = { id: "u_p", email: "pl@abeam.test", role: "partner_lead", organizationId: "org_a" };

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  vi.stubEnv("TENANT_SCOPE_GUARD", "throw");
  mocks.getCurrentUser.mockResolvedValue(PARTNER_LEAD);
  mocks.auditCount.mockImplementation(throughGuard("ConfigAudit", "count", 1));
  mocks.auditGroupBy.mockImplementation(throughGuard("ConfigAudit", "groupBy", []));
  mocks.auditFindMany.mockImplementation(
    throughGuard("ConfigAudit", "findMany", [
      { id: "ca_1", actorId: "u_p", entityType: "Solution", entityId: "sol_1", action: "CREATE", at: new Date() },
    ]),
  );
  mocks.userFindMany.mockResolvedValue([{ id: "u_p", name: "Pat Lead", email: "pl@abeam.test" }]);
  mocks.solutionFindMany.mockImplementation(throughGuard("Solution", "findMany", [{ id: "sol_1", name: "Acme" }]));
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/control-tower/audit under the tenant-scope guard", () => {
  it("runs with no cross-tenant context declared, so the guard is live", async () => {
    expect(crossTenantPermission()).toBeNull();
    await expect(
      guarded({
        model: "Solution",
        operation: "findMany",
        // The exact shape the route used to send.
        args: { where: { id: { in: ["sol_1"] } }, select: { id: true, name: true } },
        query: async () => [],
      }),
    ).rejects.toThrow(MissingTenantScopeError);
  });

  it("labels a Solution entry for a partner lead instead of throwing", async () => {
    const res = await audit(new NextRequest("https://x.test/api/control-tower/audit"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entries[0].entityLabel).toBe("Acme");
    expect(body.data.entries[0].actorLabel).toBe("Pat Lead");
    // Scoped by the caller's organization, the same way the page itself is.
    const where = mocks.solutionFindMany.mock.calls[0]?.[0]?.where;
    expect(where?.organizationId).toBe("org_a");
    expect(where?.id).toEqual({ in: ["sol_1"] });
  });
});
