// @vitest-environment node
/**
 * P1.2, acceptance A3 against PostgreSQL: the "ask Basis for SAP_COM_xxxx"
 * join reads SAP's communication scenario table by the exact technical id of
 * a service's address, from the NEWEST content release only, in one
 * statement; and the catalogue list carries each row's scenarios.
 *
 * Two releases are loaded with the same service under a different scenario
 * each: only the newer one may be answered (the to-be pack's read was
 * release-blind, and kept whichever row came last).
 *
 * Skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => null }));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { GET as hubListRoute } from "@/app/api/sap/tdd/hub-content/route";
import { currentScenarioRelease, scenariosForServices } from "@/lib/sap-public/comm-scenarios";

const TAG = `P12CS${randomUUID().slice(0, 6).toUpperCase()}`;
const LOCALISATION = `T-${TAG}`;
const SERVICE = `API_${TAG}_SRV`;
const releases = { older: "", newer: "" };

describe.skipIf(!process.env.TEST_DATABASE_URL)("the communication scenario join (P1.2, A3)", () => {
  beforeAll(async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("the catalogue list reads no SAP system here");
    });
    releases.older = (await prisma.sapContentRelease.create({ data: { release: "2602", localisation: LOCALISATION } })).id;
    releases.newer = (await prisma.sapContentRelease.create({ data: { release: "2608", localisation: LOCALISATION } })).id;
    await prisma.sapCommScenario.createMany({
      data: [
        { commScenarioId: `SAP_COM_${TAG}_OLD`, releaseId: releases.older, apiIds: [`${SERVICE}_0001`] },
        { commScenarioId: `SAP_COM_${TAG}_NEW`, name: "Newer scenario", direction: "Inbound", releaseId: releases.newer, apiIds: [`${SERVICE}_0001`, "API_OTHER_SRV_0001", "CO_SOMETHING"] },
        { commScenarioId: `SAP_COM_${TAG}_UNRELATED`, releaseId: releases.newer, apiIds: [`${SERVICE}_0002`] },
      ],
    });
    await prisma.sapHubContent.create({
      data: { contentType: "API", externalId: SERVICE, title: SERVICE, description: "", status: "Released", hubUrl: "u", apiType: "ODATAV2", appliesToPublic: true },
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.sapHubContent.deleteMany({ where: { externalId: { contains: TAG } } });
    await prisma.sapContentRelease.deleteMany({ where: { localisation: LOCALISATION } });
  });

  it("answers from the newest release only, by the exact id", async () => {
    expect(await currentScenarioRelease(prisma)).toMatchObject({ id: releases.newer, release: "2608" });
    const join = await scenariosForServices(prisma, [`${SERVICE}_0001`, `${SERVICE}`]);
    expect(join.release).toBe("2608");
    expect(join.byId.get(`${SERVICE}_0001`)).toEqual([{ id: `SAP_COM_${TAG}_NEW`, name: "Newer scenario", direction: "Inbound", interfaceCount: 3 }]);
    // The bare name and another version are not this service.
    expect(join.byId.has(SERVICE)).toBe(false);
    expect([...join.byId.values()].flat().some((s) => s.id === `SAP_COM_${TAG}_UNRELATED`)).toBe(false);
  });

  it("the catalogue list carries each row's scenarios, and names its source", async () => {
    const res = await hubListRoute(new NextRequest(`http://localhost/api/sap/tdd/hub-content?product=s4hana&q=${TAG}`));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { items: { externalId: string; commScenarios: { id: string }[] }[]; scenarioSource: string } };
    const row = data.items.find((i) => i.externalId === SERVICE)!;
    expect(row.commScenarios.map((s) => s.id)).toEqual([`SAP_COM_${TAG}_NEW`]);
    expect(data.scenarioSource).toContain("2608");
  });
});
