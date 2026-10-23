// @vitest-environment node
/**
 * P1.2, the SAP API Policy §1.2 sign-off's segregation against PostgreSQL and
 * the shipped routes: the person who chose the service an interface calls
 * never signs it off.
 *
 *   - the registrant is refused, and someone else signs;
 *   - a builder who re-points the interface to a new service (a PATCH whose
 *     audit row says serviceChanged) is that service's requester: refused,
 *     while the registrant, who did not choose it, may sign;
 *   - an interface whose service-changing row is missing (the trail was best
 *     effort) is signed with `requesterUnknown`, never against the registrant
 *     of a service it no longer calls.
 *
 * WHAT IS REAL: the create, PATCH and sign-off routes, the audit rows they
 * write, the JSON filter that finds the requester, the tenant guard in throw
 * mode. WHAT IS STOOD IN: the session. Skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { PATCH as patchInterface, POST as createInterface } from "@/app/api/studio/interfaces/route";
import { POST as signOff } from "@/app/api/studio/interfaces/[id]/policy-sign-off/route";
import { customExternalId } from "@/lib/sap-public/service-path";

const RUN = `p12so-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
// A passkey asserted now: the step-up passes, so each case tests segregation alone.
const builder = (key: string) => ({
  id: `${RUN}-${key}`,
  email: `${RUN}-${key}@abeam.com`,
  name: key,
  role: "consultant",
  organizationId: ORG,
  authMethod: "session",
  hasWebAuthn: true,
  passkeyAssertedAt: new Date(),
});
const users = { a: builder("a"), b: builder("b"), c: builder("c") };
const USER_IDS = Object.values(users).map((u) => u.id);

let solutionId = "";

const as = (user: Record<string, unknown>) => {
  h.user = { ...user, passkeyAssertedAt: new Date() };
};
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function register(name: string, servicePath: string): Promise<string> {
  const res = await createInterface(
    json("/api/studio/interfaces", "POST", { solutionId, sapProduct: "s4hana", name, operation: "READ", servicePath, odataVersion: "V2" }),
  );
  const body = (await res.json()) as { data?: { id: string }; error?: { message: string } };
  expect(res.status, body.error?.message).toBe(201);
  return body.data!.id;
}

const sign = async (id: string) => {
  const res = await signOff(json(`/api/studio/interfaces/${id}/policy-sign-off`, "POST", { basis: "DOCUMENTATION", acknowledge: true }), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, body: (await res.json()) as { error?: { message: string } } };
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("the §1.2 sign-off's segregation (P1.2)", () => {
  beforeAll(async () => {
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    await prisma.organization.create({ data: { id: ORG, name: "Sign-off", type: "client" } });
    for (const u of Object.values(users)) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
    }
    solutionId = (
      await prisma.solution.create({
        data: {
          organizationId: ORG,
          name: "Sign-off",
          slug: `${RUN}-sign-off`,
          classification: "CLIENT_APP",
          businessProblem: "Segregation of the §1.2 sign-off.",
          dataClass: "INTERNAL",
          status: "ACTIVE",
        },
      })
    ).id;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  });

  it("refuses the registrant, and someone else signs", async () => {
    as(users.a);
    const id = await register(`${RUN} registrant`, "/sap/opu/odata/sap/ZHR_LEAVE_SRV");
    expect((await sign(id)).status).toBe(403);
    as(users.b);
    expect((await sign(id)).status).toBe(200);
  });

  it("refuses the builder who re-pointed the interface to a new service, and lets the registrant sign it", async () => {
    as(users.a);
    const id = await register(`${RUN} re-pointed`, "/sap/opu/odata/sap/ZHR_TIME_SRV");
    as(users.b);
    const patched = await patchInterface(json("/api/studio/interfaces", "PATCH", { id, servicePath: "/sap/opu/odata/sap/ZHR_PAYROLL_SRV" }));
    expect(patched.status).toBe(200);
    const refused = await sign(id);
    expect(refused.status).toBe(403);
    expect(refused.body.error?.message).toMatch(/chose the service this interface calls/);
    // The registrant did not choose this service: the second person here.
    as(users.a);
    expect((await sign(id)).status).toBe(200);
    const row = await prisma.configAudit.findFirst({ where: { organizationId: ORG, entityId: id, action: "POLICY_SIGN_OFF" } });
    expect(row!.actorId).toBe(users.a.id);
    expect((row!.after as { requesterUnknown?: boolean }).requesterUnknown).toBeUndefined();
  });

  it("signs with requesterUnknown when the row that set the current service is missing", async () => {
    as(users.a);
    const id = await register(`${RUN} untraced`, "/sap/opu/odata/sap/ZHR_TRAVEL_SRV");
    // A path changed with no audit row (writeConfigAudit is best effort): the registrant chose another service.
    await prisma.interface.updateMany({
      where: { id, organizationId: ORG },
      data: { servicePath: "/sap/opu/odata/sap/ZHR_EXPENSE_SRV", externalId: customExternalId("/sap/opu/odata/sap/ZHR_EXPENSE_SRV") },
    });
    expect((await sign(id)).status).toBe(200);
    const row = await prisma.configAudit.findFirst({ where: { organizationId: ORG, entityId: id, action: "POLICY_SIGN_OFF" } });
    expect((row!.after as { requesterUnknown?: boolean }).requesterUnknown).toBe(true);
  });
});
