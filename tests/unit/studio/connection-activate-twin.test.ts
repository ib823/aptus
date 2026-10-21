/**
 * "Activate" on a twin connection is a typed 409, never an empty 500 (P0.1, audit A52).
 *
 * THE DEFECT. POST refuses a second ACTIVE connection with the same product,
 * environment and SAP client. PATCH — what Studio's "Activate" sends — did
 * not: create B (DEV), deactivate it, create A (DEV), then activate B. The
 * partial unique index (migration 20260731010000) raised P2002 inside an
 * unguarded update, Next returned a bare 500 with no body, and the console
 * showed "Unexpected end of JSON input".
 *
 * The index itself is not in a `db push` schema, so the database's half is
 * simulated here with the P2002 the client raises.
 */

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  // findMany: deactivating asks whether the product's other rows still read
  // "will not open" (P0.2 review round 5); none do here.
  prisma: { sapConnection: { findFirst: mocks.findFirst, findMany: mocks.findMany, update: mocks.update } },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: vi.fn() }));

import { PATCH } from "@/app/api/studio/connections/route";

/** B: the deactivated DEV connection someone is reactivating. */
const B = {
  id: "conn_b",
  writeEnabled: false,
  isActive: false,
  product: "cloud-erp-private",
  environment: "DEV",
  client: "100",
};
/** A: the DEV connection that replaced it and is active now. */
const A = { key: "x5m-dev-new", label: "X5M Development (new)" };

const activate = (id = B.id) =>
  PATCH(
    new Request("https://app.test/api/studio/connections", {
      method: "PATCH",
      body: JSON.stringify({ id, isActive: true }),
    }) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COREEDGE_STEP_UP", "off");
  mocks.findMany.mockResolvedValue([]);
  mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "consultant", organizationId: "org1", authMethod: "session" });
  mocks.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: B.id, isActive: data.isActive ?? false, writeEnabled: false }),
  );
});

describe("activating a connection the binding could not tell apart from an active one", () => {
  it("is refused with a typed 409 naming the active twin, and nothing is written", async () => {
    mocks.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("isActive" in where ? A : B),
    );
    const res = await activate();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string; correlationId: string } };
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain(`"${A.label}" (${A.key}) is already the active DEV client 100 connection`);
    expect(body.error.correlationId).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();

    // The twin lookup is the binding tuple, tenant-scoped, excluding B itself.
    const twinQuery = mocks.findFirst.mock.calls.find((c) => "isActive" in (c[0] as { where: object }).where)?.[0] as {
      where: Record<string, unknown>;
    };
    expect(twinQuery.where).toEqual({
      organizationId: "org1",
      product: "cloud-erp-private",
      isActive: true,
      environment: "DEV",
      client: "100",
      NOT: { id: B.id },
    });
  });

  it("turns the index's P2002, when a twin is activated in between, into the same typed 409", async () => {
    mocks.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("isActive" in where ? null : B),
    );
    mocks.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    const res = await activate();
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("CONFLICT");
  });

  it("activates a connection that has no twin", async () => {
    mocks.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve("isActive" in where ? null : B),
    );
    const res = await activate();
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("never looks for a twin when deactivating, or for a connection with no declared environment", async () => {
    mocks.findFirst.mockResolvedValue({ ...B, isActive: true });
    const off = await PATCH(
      new Request("https://app.test/api/studio/connections", {
        method: "PATCH",
        body: JSON.stringify({ id: B.id, isActive: false }),
      }) as never,
    );
    expect(off.status).toBe(200);
    mocks.findFirst.mockResolvedValue({ ...B, environment: null });
    expect((await activate()).status).toBe(200);
    expect(mocks.findFirst.mock.calls.every((c) => !("isActive" in (c[0] as { where: object }).where))).toBe(true);
  });
});
