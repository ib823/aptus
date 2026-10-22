// @vitest-environment node
/**
 * The console's environment ceiling counts the grants the broker's rules
 * still honour (wave 2 integration review round 3), read against PostgreSQL
 * through the console's own connection load.
 *
 * An organization whose only PROD approval belongs to an app it RETIRED, or
 * is a legacy unbound grant under COREEDGE_GRANT_BINDING=strict, is refused
 * by the broker, the lane board and discovery; the console's ceiling still
 * answered "allowed", so every builder could keep previewing live PROD data.
 * The load now carries each grant's interface and its app's status, and the
 * ceiling sets those grants aside under COREEDGE_CONSOLE_GRANTS=enforce, and
 * reports them (allowing the read) under the default, observe.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { loadConsoleConnection } from "@/lib/governed/call-loads";
import { decideConsoleRead } from "@/lib/sap-public/console-read-guard";

const RUN = `ceil-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 86_400_000;

describe.skipIf(!process.env.TEST_DATABASE_URL)("the console ceiling, on the grants the broker honours", () => {
  let retiredApp: string;
  let liveApp: string;
  let ifaceId: string;

  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Console ceiling", type: "client" } });
    const app = async (slug: string, status: "ACTIVE" | "RETIRED") =>
      (
        await prisma.solution.create({
          data: { organizationId: ORG, name: slug, slug: `${RUN}-${slug}`, classification: "CLIENT_APP", businessProblem: "p", dataClass: "INTERNAL", status },
        })
      ).id;
    retiredApp = await app("retired", "RETIRED");
    liveApp = await app("live", "ACTIVE");
    ifaceId = (
      await prisma.interface.create({
        data: {
          organizationId: ORG,
          solutionId: retiredApp,
          name: "PO",
          sapProduct: "s4hana",
          externalId: "purchase-orders",
          operation: "READ",
          mode: "READ",
          entitySet: "A_PurchaseOrder",
          status: "ACTIVE",
        },
      })
    ).id;
    for (const [key, environment] of [
      ["prod", "PROD"],
      ["test", "TEST"],
    ] as const) {
      await prisma.sapConnection.create({
        data: {
          organizationId: ORG,
          product: "s4hana",
          key: `${RUN}-${key}`,
          label: key,
          baseUrl: "https://my000001-api.s4hana.cloud.sap",
          authType: "basic",
          secretsCiphertext: "sealed",
          environment,
          isActive: true,
        },
      });
    }
    const grant = (solutionId: string, environment: string, interfaceId: string | null) =>
      prisma.apiAccessGrant.create({
        data: {
          organizationId: ORG,
          solutionId,
          externalId: "purchase-orders",
          operation: "READ",
          environment,
          justification: "j",
          decision: "APPROVED",
          expiresAt: new Date(Date.now() + 30 * DAY),
          interfaceId,
          sapProduct: interfaceId ? "s4hana" : null,
        },
      });
    // PROD: only a RETIRED app's approval. TEST: only a live app's unbound legacy one.
    await grant(retiredApp, "PROD", ifaceId);
    await grant(liveApp, "TEST", null);
  });
  afterAll(async () => {
    const where = { organizationId: ORG };
    await prisma.apiAccessGrant.deleteMany({ where });
    await prisma.interface.deleteMany({ where });
    await prisma.sapConnection.deleteMany({ where });
    await prisma.solution.deleteMany({ where });
    await prisma.organization.delete({ where: { id: ORG } });
  });

  const ceiling = async (key: string, mode: "observe" | "enforce", bindingMode: "legacy" | "strict" = "legacy") => {
    const load = await loadConsoleConnection(ORG, "s4hana", `${RUN}-${key}`);
    return decideConsoleRead({
      organizationId: ORG,
      environment: load.connection!.environment as "PROD" | "TEST",
      grants: load.grants,
      mode,
      bindingMode,
    });
  };

  it("loads each grant with its interface and its app's status", async () => {
    const load = await loadConsoleConnection(ORG, "s4hana", `${RUN}-prod`);
    expect(load.grants).toEqual([expect.objectContaining({ decision: "APPROVED", interfaceId: ifaceId, solutionStatus: "RETIRED" })]);
  });

  it("a RETIRED app's PROD approval no longer opens PROD under enforce", async () => {
    const refused = await ceiling("prod", "enforce");
    expect(refused).toMatchObject({ allowed: false, refusal: "NO_APPROVED_GRANT" });
    expect(refused.message).toMatch(/retired/);
  });

  it("under the default, observe, the same read goes ahead and says what enforce would do", async () => {
    expect(await ceiling("prod", "observe")).toEqual({ allowed: true, refusal: null, message: null, observed: "SOLUTION_RETIRED" });
  });

  it("an unbound legacy approval opens TEST under legacy binding, and not under strict with enforce", async () => {
    expect(await ceiling("test", "enforce", "legacy")).toEqual({ allowed: true, refusal: null, message: null });
    expect(await ceiling("test", "enforce", "strict")).toMatchObject({ allowed: false, refusal: "NO_APPROVED_GRANT" });
    expect((await ceiling("test", "observe", "strict")).observed).toBe("GRANT_NEEDS_REAPPROVAL");
  });
});
