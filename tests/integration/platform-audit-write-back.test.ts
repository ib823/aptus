// @vitest-environment node
/**
 * The Workbench write-back against a REAL PostgreSQL (P0.7).
 *
 * The unit tests prove the order of calls with stand-ins. What only a database
 * can prove:
 *   - the event row is COMMITTED before SAP is called — read back from inside
 *     the SAP stand-in, it is already there, with no outcome yet;
 *   - a platform admin with no organization can be recorded, through the live
 *     client with the tenant-scope guard attached and throwing;
 *   - an insert the database refuses stops the write: nothing reaches SAP;
 *   - the outcome is write-once: the unique `eventId` refuses a second one.
 *
 * Only the session, the env-tenant lookups and SAP itself are stand-ins.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createSapEntitySetRecord: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));
vi.mock("@/lib/sap-public/tdd-connector", () => ({
  getSapProduct: () => ({ key: "s4hana", label: "S/4", envPrefix: "S4_TDD" }),
  isSapTddWriteEnabled: () => true,
  getSapTddWriteSecret: () => "secret-value",
  getSapTddWriteSecretRequired: () => true,
  getSapTenant: (_p: string, key: string) => ({ key, label: "Customizing", baseUrl: "https://sap.example" }),
  getSapService: (_p: unknown, key: string) => ({ key, path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" }),
  createSapEntitySetRecord: mocks.createSapEntitySetRecord,
}));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { POST } from "@/app/api/sap/tdd/write/route";

// Opt in explicitly; never fall back to an application's DATABASE_URL.
describe.skipIf(!process.env.TEST_DATABASE_URL)("Workbench write-back audit on real PostgreSQL", () => {
  const actorUserId = `p07-admin-${randomUUID()}`;
  const admin = { id: actorUserId, email: "admin@abeam.test", role: "platform_admin", organizationId: null };
  const body = {
    product: "s4hana",
    tenant: "customizing",
    service: "business-partner",
    entity: "A_BusinessPartner",
    payload: { FirstName: "Ada" },
    confirmation: "WRITE TO SAP TDD",
    writeSecret: "secret-value",
  };
  const request = () => POST({ json: async () => body } as Parameters<typeof POST>[0]);
  const events = () =>
    prisma.platformAuditEvent.findMany({ where: { actorUserId }, include: { result: true }, orderBy: { at: "asc" } });

  beforeEach(() => {
    vi.clearAllMocks();
    // Whatever the environment says, the guard must not get in the way.
    process.env.TENANT_SCOPE_GUARD = "throw";
    mocks.requireAdmin.mockResolvedValue({ user: admin });
  });

  afterAll(async () => {
    // Test-database housekeeping for this run's namespace only.
    const ids = (await prisma.platformAuditEvent.findMany({ where: { actorUserId }, select: { id: true } })).map((e) => e.id);
    await prisma.platformAuditOutcome.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.platformAuditEvent.deleteMany({ where: { id: { in: ids } } });
    delete process.env.TENANT_SCOPE_GUARD;
  });

  it("commits the event, naming the person, before SAP is called — and the outcome after", async () => {
    let seenFromInsideSap: Awaited<ReturnType<typeof events>> = [];
    mocks.createSapEntitySetRecord.mockImplementation(async () => {
      seenFromInsideSap = await events();
      return { entitySet: "A_BusinessPartner", ok: true, status: 201, durationMs: 5, location: null, body: null };
    });

    const res = await request();
    expect(res.status).toBe(200);

    expect(seenFromInsideSap).toHaveLength(1);
    expect(seenFromInsideSap[0]).toMatchObject({
      action: "SAP_WORKBENCH_WRITE",
      actorUserId,
      actorEmail: "admin@abeam.test",
      actorOrganizationId: null,
      tenantKey: "customizing",
      entitySet: "A_BusinessPartner",
      result: null,
    });

    const [event] = await events();
    expect(event!.result).toMatchObject({ outcome: "SUCCEEDED", sapStatus: 201 });
    expect(res.headers.get("x-correlation-id")).toBe(event!.correlationId);
    // The payload's field names, never its values.
    expect(JSON.stringify(event)).not.toContain("Ada");
  });

  it("refuses to write the outcome twice — the database holds the trail append-only", async () => {
    const [event] = await events();
    await expect(
      prisma.platformAuditOutcome.create({ data: { eventId: event!.id, outcome: "SAP_REFUSED" } }),
    ).rejects.toThrow(/Unique constraint/);
    const [again] = await events();
    expect(again!.result).toMatchObject({ outcome: "SUCCEEDED" });
  });

  it("sends nothing to SAP when the database refuses the event row", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // A row that cannot be inserted: the actor's email is required.
    mocks.requireAdmin.mockResolvedValue({ user: { ...admin, email: null } });
    const res = await request();
    expect(res.status).toBe(503);
    expect(mocks.createSapEntitySetRecord).not.toHaveBeenCalled();
    expect(await events()).toHaveLength(1);
  });
});
