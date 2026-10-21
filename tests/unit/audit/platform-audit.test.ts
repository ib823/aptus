// @vitest-environment node
/**
 * The platform audit module (P0.7): fail-closed before SAP, never-throwing
 * after, no payload values, and an outcome vocabulary that says what each
 * result means for the record in SAP.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventCreate: vi.fn(),
  outcomeCreate: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    platformAuditEvent: { create: mocks.eventCreate },
    platformAuditOutcome: { create: mocks.outcomeCreate },
    $executeRaw: mocks.executeRaw,
  },
}));

import {
  PlatformAuditUnavailableError,
  beginPlatformAudit,
  completePlatformAudit,
  fingerprintPayload,
  outcomeForSapCreate,
  outcomeForThrown,
  outcomeForWriteTest,
  platformAuditUnavailable,
  recordPlatformConsoleRead,
} from "@/lib/audit/platform-audit";
import { TENANT_ANCHORED_MODELS, tenantScopeGuard } from "@/lib/db/tenant-guard";

const INPUT = {
  action: "SAP_WORKBENCH_WRITE" as const,
  actor: { id: "u_admin", email: "admin@abeam.test", role: "platform_admin", organizationId: null },
  target: {
    product: "s4hana",
    tenantKey: "customizing",
    tenantLabel: "Customizing",
    serviceKey: "business-partner",
    servicePath: "/sap/opu/odata/sap/API_BUSINESS_PARTNER",
    entitySet: "A_BusinessPartner",
  },
  payload: { FirstName: "Ada", LastName: "Lovelace", BusinessPartnerCategory: "1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventCreate.mockResolvedValue({ id: "pae_1" });
  mocks.outcomeCreate.mockResolvedValue({ id: "pao_1" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("beginPlatformAudit — before SAP is called", () => {
  it("records the person, the target and a fingerprint of the payload", async () => {
    const handle = await beginPlatformAudit(INPUT);
    expect(handle.id).toBe("pae_1");
    expect(handle.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    const data = mocks.eventCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      action: "SAP_WORKBENCH_WRITE",
      actorUserId: "u_admin",
      actorEmail: "admin@abeam.test",
      actorRole: "platform_admin",
      // A platform admin with no organization is recorded as such, not refused.
      actorOrganizationId: null,
      product: "s4hana",
      tenantKey: "customizing",
      serviceKey: "business-partner",
      entitySet: "A_BusinessPartner",
      correlationId: handle.correlationId,
      payloadFields: ["BusinessPartnerCategory", "FirstName", "LastName"],
    });
    expect(data.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never stores a payload value", async () => {
    await beginPlatformAudit(INPUT);
    const stored = JSON.stringify(mocks.eventCreate.mock.calls[0]![0]);
    expect(stored).not.toContain("Ada");
    expect(stored).not.toContain("Lovelace");
  });

  it("THROWS when the row cannot be written, so the caller sends nothing", async () => {
    mocks.eventCreate.mockRejectedValue(new Error("connection refused"));
    await expect(beginPlatformAudit(INPUT)).rejects.toBeInstanceOf(PlatformAuditUnavailableError);
  });

  it("answers 503 AUDIT_UNAVAILABLE, saying nothing was changed", async () => {
    const res = platformAuditUnavailable();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("AUDIT_UNAVAILABLE");
    expect(body.error.message).toMatch(/not sent to SAP/);
  });
});

describe("completePlatformAudit — after SAP has acted", () => {
  it("records the outcome as its own row, keyed to the event", async () => {
    await completePlatformAudit({ id: "pae_1", correlationId: "c" }, { outcome: "SUCCEEDED", sapStatus: 201, durationMs: 80 });
    expect(mocks.outcomeCreate).toHaveBeenCalledWith({
      data: { eventId: "pae_1", outcome: "SUCCEEDED", sapStatus: 201, reason: null, durationMs: 80 },
    });
  });

  it("never throws — SAP has acted and the caller must still get the answer", async () => {
    // e.g. the unique eventId refusing a second outcome, or the database gone.
    mocks.outcomeCreate.mockRejectedValue(new Error("Unique constraint failed on the fields: (`eventId`)"));
    await expect(
      completePlatformAudit({ id: "pae_1", correlationId: "c" }, { outcome: "SUCCEEDED" }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("outcomes say what happened to the record in SAP", () => {
  it("a create: 2xx succeeded, 4xx refused (nothing written), 5xx unknown (may be written)", () => {
    expect(outcomeForSapCreate({ ok: true, status: 201 })).toEqual({ outcome: "SUCCEEDED", sapStatus: 201 });
    expect(outcomeForSapCreate({ ok: false, status: 403 })).toMatchObject({ outcome: "SAP_REFUSED", reason: "HTTP_403" });
    expect(outcomeForSapCreate({ ok: false, status: 504 })).toMatchObject({ outcome: "OUTCOME_UNKNOWN", reason: "HTTP_504" });
  });

  it("a write-test that created and could not delete is LEFT_BEHIND, with where the record is", () => {
    expect(
      outcomeForWriteTest({ created: true, deleted: false, createStatus: 201, deleteStatus: null, location: "/A(1)" }),
    ).toMatchObject({ outcome: "LEFT_BEHIND", reason: "DELETE_NOT_SENT", detail: { location: "/A(1)" } });
    expect(
      outcomeForWriteTest({ created: true, deleted: false, createStatus: 201, deleteStatus: 500, location: "/A(1)" }),
    ).toMatchObject({ outcome: "LEFT_BEHIND", reason: "DELETE_HTTP_500" });
    expect(
      outcomeForWriteTest({ created: true, deleted: true, createStatus: 201, deleteStatus: 204, location: "/A(1)" }),
    ).toMatchObject({ outcome: "SUCCEEDED" });
    expect(
      outcomeForWriteTest({ created: false, deleted: false, createStatus: 400, deleteStatus: null, location: null }),
    ).toMatchObject({ outcome: "SAP_REFUSED" });
  });

  it("a thrown call is OUTCOME_UNKNOWN with a bounded reason, never the message", () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND my-tenant.s4hana.cloud.sap"), { code: "ENOTFOUND" });
    expect(outcomeForThrown(err)).toEqual({ outcome: "OUTCOME_UNKNOWN", reason: "ENOTFOUND" });
  });

  it("the fingerprint is stable and order-independent in its field list", () => {
    expect(fingerprintPayload({ b: 1, a: 2 }).payloadFields).toEqual(["a", "b"]);
    expect(fingerprintPayload({ a: 1 }).payloadSha256).toBe(fingerprintPayload({ a: 1 }).payloadSha256);
  });
});

describe("platform scope and the tenant guard", () => {
  it("the platform tables are not tenant-anchored — there is no tenant to scope them to", () => {
    expect(TENANT_ANCHORED_MODELS as readonly string[]).not.toContain("PlatformAuditEvent");
    expect(TENANT_ANCHORED_MODELS as readonly string[]).not.toContain("PlatformAuditOutcome");
  });

  it("so a platform admin with no organization can read them, even with the guard throwing", async () => {
    const ext = tenantScopeGuard() as unknown as {
      query: {
        $allModels: {
          $allOperations: (ctx: { model?: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown>;
        };
      };
    };
    const before = process.env.TENANT_SCOPE_GUARD;
    process.env.TENANT_SCOPE_GUARD = "throw";
    try {
      await expect(
        ext.query.$allModels.$allOperations({
          model: "PlatformAuditEvent",
          operation: "findMany",
          args: { where: {} },
          query: async () => "rows",
        }),
      ).resolves.toBe("rows");
    } finally {
      if (before === undefined) delete process.env.TENANT_SCOPE_GUARD;
      else process.env.TENANT_SCOPE_GUARD = before;
    }
  });
});

describe("recordPlatformConsoleRead — a console read's row (P0.14b review round 3)", () => {
  const READ = {
    actor: { id: "u_dev", email: "dev@abeam.test", role: "consultant", organizationId: "org_1" },
    target: { product: "s4hana", tenantKey: "x5m-100", tenantLabel: null, serviceKey: "purchase-orders", servicePath: null, entitySet: "A_PurchaseOrder" },
    request: { entity: "A_PurchaseOrder", limit: 2 },
    correlationId: "corr-1",
    outcome: "SUCCEEDED" as const,
    status: 200,
    reason: null,
    durationMs: 12,
    detail: { principal: "console", route: "/api/sap/tdd/preview" },
  };

  it("writes the event and its outcome in ONE statement, with no transaction around it", async () => {
    /*
     * A nested create was BEGIN, two INSERTs, a SELECT and COMMIT: five round
     * trips on the response path of every console call (P0.19's budget).
     */
    mocks.executeRaw.mockResolvedValue(1);
    await recordPlatformConsoleRead(READ);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    const statement = mocks.executeRaw.mock.calls[0]![0] as { sql: string; values: unknown[] };
    expect(statement.sql).toMatch(/INSERT INTO "PlatformAuditEvent"/);
    expect(statement.sql).toMatch(/INSERT INTO "PlatformAuditOutcome"/);
    expect(statement.sql).not.toMatch(/\bBEGIN\b/i);
    // The payload's values never reach it, only their fingerprint and field names.
    expect(statement.values).toContain(JSON.stringify(["entity", "limit"]));
    expect(statement.values).not.toContain(2);
  });

  it("never throws: the read is answered though the row could not be written", async () => {
    mocks.executeRaw.mockRejectedValue(new Error("database unavailable"));
    await expect(recordPlatformConsoleRead(READ)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
