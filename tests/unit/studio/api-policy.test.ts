// @vitest-environment node
/**
 * The SAP API Policy §1.2 sign-off (P1.2, lib/studio/api-policy.ts): which
 * interfaces need one, when a stored one still counts, what each mode of
 * COREEDGE_API_POLICY_SIGNOFF refuses — at the broker's decision and at a
 * grant decision — and the route that records it: segregation from the
 * person who registered the interface, the passkey step-up, and the field and
 * its audit row in one transaction.
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorisesHere, type AuthorisableInterface } from "@/lib/northbound/authorisation";
import {
  API_POLICY_ID,
  apiPolicySignOffMode,
  currentSignOff,
  policySignOffMissing,
  policySignOffRequired,
  signOffInputSchema,
} from "@/lib/studio/api-policy";
import { grantPolicyCheck } from "@/lib/studio/grant-policy";

const { mocks, db } = vi.hoisted(() => ({
  mocks: { user: vi.fn() },
  db: {
    iface: null as Record<string, unknown> | null,
    createdBy: null as string | null,
    writes: [] as { op: string; args: unknown }[],
    transactions: 0,
  },
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db/prisma", () => {
  const tx = {
    interface: {
      updateMany: vi.fn(async (args: { where: Record<string, unknown> }) => {
        db.writes.push({ op: "interface.updateMany", args });
        return { count: db.iface && (args.where.externalId === undefined || args.where.externalId === db.iface.externalId) ? 1 : 0 };
      }),
    },
    configAudit: { create: vi.fn(async (args: unknown) => (db.writes.push({ op: "configAudit.create", args }), {})) },
  };
  return {
    prisma: {
      interface: { findFirst: vi.fn(async () => db.iface) },
      configAudit: {
        findFirst: vi.fn(async () => (db.createdBy ? { actorId: db.createdBy } : null)),
        create: vi.fn(async () => ({})),
      },
      platformAuditEvent: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        db.transactions += 1;
        return fn(tx);
      }),
    },
  };
});

const route = await import("@/app/api/studio/interfaces/[id]/policy-sign-off/route");

const CUSTOM = { sapProduct: "s4hana", externalId: "custom:/sap/opu/odata/sap/yy1_salesbonus_cds", servicePath: "/sap/opu/odata/sap/YY1_SALESBONUS_CDS" };
const signedFor = (externalId: string) => ({
  policy: API_POLICY_ID,
  serviceIdentity: externalId,
  basis: "DOCUMENTATION",
  reference: "",
  statementHash: "a".repeat(64),
  signedById: "u_2",
  signedAt: "2026-10-23T00:00:00.000Z",
});

afterEach(() => vi.unstubAllEnvs());

describe("which interfaces need a sign-off", () => {
  it("a customer's own service on S/4HANA Cloud Public Edition, by path or by a customer name", () => {
    expect(policySignOffRequired(CUSTOM)).toBe(true);
    expect(policySignOffRequired({ sapProduct: "s4hana", externalId: "ZUI_TRAVEL_O2" })).toBe(true);
    expect(policySignOffRequired({ sapProduct: "s4hana", externalId: "API_BUSINESS_PARTNER" })).toBe(false);
    // Private cloud and on-premise: SAP's own example permits custom ABAP interfaces there.
    expect(policySignOffRequired({ ...CUSTOM, sapProduct: "cloud-erp-private" })).toBe(false);
    expect(policySignOffRequired({ ...CUSTOM, sapProduct: "s4hana-onprem" })).toBe(false);
  });

  it("a stored sign-off counts only for the service it was given for, under this policy", () => {
    expect(currentSignOff({ externalId: CUSTOM.externalId, apiPolicySignOff: signedFor(CUSTOM.externalId) })).not.toBeNull();
    expect(currentSignOff({ externalId: CUSTOM.externalId, apiPolicySignOff: signedFor("custom:/sap/opu/odata/sap/other") })).toBeNull();
    expect(currentSignOff({ externalId: CUSTOM.externalId, apiPolicySignOff: { ...signedFor(CUSTOM.externalId), policy: "older" } })).toBeNull();
    expect(policySignOffMissing({ ...CUSTOM, apiPolicySignOff: null })).toBe(true);
    expect(policySignOffMissing({ ...CUSTOM, apiPolicySignOff: signedFor(CUSTOM.externalId) })).toBe(false);
  });

  it("asks a reference for every basis but SAP's own documentation", () => {
    expect(signOffInputSchema.safeParse({ basis: "DOCUMENTATION", acknowledge: true }).success).toBe(true);
    expect(signOffInputSchema.safeParse({ basis: "SAP_AUTHORIZATION", acknowledge: true }).success).toBe(false);
    expect(signOffInputSchema.safeParse({ basis: "OTHER", reference: "TICKET-1", acknowledge: true }).success).toBe(true);
    expect(signOffInputSchema.safeParse({ basis: "DOCUMENTATION", acknowledge: false }).success).toBe(false);
  });

  it("observes by default", () => {
    expect(apiPolicySignOffMode()).toBe("observe");
    vi.stubEnv("COREEDGE_API_POLICY_SIGNOFF", "enforce");
    expect(apiPolicySignOffMode()).toBe("enforce");
    vi.stubEnv("COREEDGE_API_POLICY_SIGNOFF", "nonsense");
    expect(apiPolicySignOffMode()).toBe("observe");
  });
});

describe("the broker's decision", () => {
  const iface = (signOff: unknown): AuthorisableInterface => ({
    id: "if_1",
    name: "Bonus",
    ...CUSTOM,
    entitySet: "Bonus",
    operation: "READ",
    mode: "READ",
    version: 1,
    status: "ACTIVE",
    solutionId: "sol_1",
    createdAt: new Date("2026-10-01"),
    grantMatchChangedAt: null,
    apiPolicySignOff: signOff,
  });
  const grant = { id: "g1", decision: "APPROVED", expiresAt: null, operation: "READ", revokedAt: null, interfaceId: "if_1", sapProduct: "s4hana", createdAt: new Date("2026-10-02"), unboundCutoffAt: null };
  const decide = (signOff: unknown) =>
    authorisesHere({ iface: iface(signOff), solutionId: "sol_1", environment: "DEV", route: "read", grants: [grant], now: new Date("2026-10-23") });

  it("observe and off serve the call", () => {
    expect(decide(null).ok).toBe(true);
    vi.stubEnv("COREEDGE_API_POLICY_SIGNOFF", "off");
    expect(decide(null).ok).toBe(true);
  });

  it("enforce refuses it with API_POLICY_SIGN_OFF_REQUIRED until a sign-off is recorded", () => {
    vi.stubEnv("COREEDGE_API_POLICY_SIGNOFF", "enforce");
    const refused = decide(null);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe("API_POLICY_SIGN_OFF_REQUIRED");
    expect(decide(signedFor(CUSTOM.externalId)).ok).toBe(true);
  });
});

describe("a grant decision", () => {
  const db1 = (row: Record<string, unknown> | null) => ({ interface: { findFirst: vi.fn(async () => row) } });

  it("enforce refuses an approval without a sign-off, and a rejection is never held", async () => {
    vi.stubEnv("COREEDGE_API_POLICY_SIGNOFF", "enforce");
    const unsigned = db1({ ...CUSTOM, apiPolicySignOff: null });
    expect((await grantPolicyCheck(unsigned as never, { organizationId: "o", interfaceId: "if_1", decision: "APPROVED" })).ok).toBe(false);
    expect((await grantPolicyCheck(unsigned as never, { organizationId: "o", interfaceId: "if_1", decision: "READ_ONLY" })).ok).toBe(false);
    expect((await grantPolicyCheck(unsigned as never, { organizationId: "o", interfaceId: "if_1", decision: "REJECTED" })).ok).toBe(true);
  });

  it("observe allows it and says what enforce would refuse", async () => {
    const check = await grantPolicyCheck(db1({ ...CUSTOM, apiPolicySignOff: null }) as never, { organizationId: "o", interfaceId: "if_1", decision: "APPROVED" });
    expect(check).toEqual({ ok: true, policySignOffMissing: true });
  });
});

describe("POST and DELETE /api/studio/interfaces/[id]/policy-sign-off", () => {
  const ctx = { params: Promise.resolve({ id: "if_1" }) };
  const post = (body: unknown) =>
    route.POST(new NextRequest("http://localhost/api/studio/interfaces/if_1/policy-sign-off", { method: "POST", body: JSON.stringify(body) }), ctx);
  const SIGNER = { id: "u_2", role: "consultant", organizationId: "org_a", email: "s@x.test", authMethod: "session", hasWebAuthn: true, passkeyAssertedAt: new Date() };

  beforeEach(() => {
    db.iface = { id: "if_1", ...CUSTOM, apiPolicySignOff: null };
    db.createdBy = "u_1";
    db.writes = [];
    db.transactions = 0;
    mocks.user.mockResolvedValue(SIGNER);
  });

  it("records the sign-off and its audit row in one transaction", async () => {
    const res = await post({ basis: "SAP_AUTHORIZATION", reference: "SAP incident 123", acknowledge: true });
    expect(res.status).toBe(200);
    const { signOff } = (await res.json()).data;
    expect(signOff).toMatchObject({ policy: API_POLICY_ID, serviceIdentity: CUSTOM.externalId, basis: "SAP_AUTHORIZATION", signedById: "u_2" });
    expect(signOff.statementHash).toMatch(/^[0-9a-f]{64}$/);
    expect(db.transactions).toBe(1);
    expect(db.writes.map((w) => w.op)).toEqual(["interface.updateMany", "configAudit.create"]);
    expect((db.writes[1]!.args as { data: { action: string } }).data.action).toBe("POLICY_SIGN_OFF");
  });

  it("refuses the person who registered the interface", async () => {
    db.createdBy = "u_2";
    const res = await post({ basis: "DOCUMENTATION", acknowledge: true });
    expect(res.status).toBe(403);
    expect(db.transactions).toBe(0);
  });

  it("asks for a fresh passkey where the step-up is enforced", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    mocks.user.mockResolvedValue({ ...SIGNER, passkeyAssertedAt: null });
    const res = await post({ basis: "DOCUMENTATION", acknowledge: true });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("STEP_UP_REQUIRED");
    expect(db.transactions).toBe(0);
  });

  it("refuses an interface that needs none", async () => {
    db.iface = { id: "if_1", sapProduct: "s4hana", externalId: "API_BUSINESS_PARTNER", servicePath: null, apiPolicySignOff: null };
    expect((await post({ basis: "DOCUMENTATION", acknowledge: true })).status).toBe(400);
  });

  it("withdraws it, with its own audit row", async () => {
    db.iface = { id: "if_1", ...CUSTOM, apiPolicySignOff: signedFor(CUSTOM.externalId) };
    const res = await route.DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect((db.writes[1]!.args as { data: { action: string } }).data.action).toBe("POLICY_SIGN_OFF_WITHDRAWN");
  });
});
