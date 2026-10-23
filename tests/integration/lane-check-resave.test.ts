// @vitest-environment node
/**
 * A re-save and a lane check, against a real PostgreSQL database (P0.2, A18).
 *
 * THE RACE. The lane sweep opens a product's connections once and then reads
 * SAP for seconds to minutes. A re-save in the meantime keeps the row's id,
 * points it at another system and drops the checks made through it — and a
 * read still running then wrote the OLD system's answer under that id, after
 * the drop, where the board took it as proof for the new system.
 *
 * What is proved here, on the real table, the real `SELECT ... FOR SHARE` and
 * the real re-save transaction:
 *   1. a re-save bumps the connection's revision, drops its lane checks and
 *      service health, and clears its probe status;
 *   2. a check loaded before the re-save records nothing after it;
 *   3. a re-save that arrives while a check is being recorded WAITS for it,
 *      and then drops what it wrote — the two serialise, in either order.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { recordLaneCheck } from "@/lib/ops/lane-check-sweep";
import {
  resolveSapConnections,
  upsertSapConnection,
  type UpsertSapConnectionInput,
} from "@/lib/sap-public/connection-resolver";
import { clearDataKeyCache } from "@/lib/sap-public/keys/org-data-key";

const KEY_VARS = [
  "SAP_CONNECTION_ENCRYPTION_KEY",
  "SAP_CONNECTION_ENCRYPTION_KEYS",
  "SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY",
  "SAP_CONNECTION_KEY_PROVIDER",
  "SAP_CONNECTION_ACCEPT_LEGACY_FORMAT",
] as const;

describe.skipIf(!process.env.TEST_DATABASE_URL)("a re-save and a lane check, on a real database", () => {
  const org = `org_p02_resave_${randomUUID().slice(0, 8)}`;
  const saved: Record<string, string | undefined> = {};

  const save = (baseUrl: string): Promise<unknown> => {
    const input: UpsertSapConnectionInput = {
      organizationId: org,
      product: "s4hana",
      key: "acme-dev",
      label: "S/4 DEV",
      baseUrl,
      authType: "basic",
      secrets: { username: "comm_user", password: "secret" },
      environment: "DEV",
    };
    return upsertSapConnection(input);
  };

  /** The check's two writes, as `checkOneLane` makes them. */
  const writeCheck = (connectionId: string) => async (tx: Prisma.TransactionClient) => {
    const at = new Date();
    await tx.laneCheck.upsert({
      where: { solutionId_interfaceId_environment: { solutionId: "sol_1", interfaceId: "if_1", environment: "DEV" } },
      create: {
        organizationId: org,
        solutionId: "sol_1",
        interfaceId: "if_1",
        environment: "DEV",
        connectionId,
        entitySet: "A_BusinessPartner",
        interfaceVersion: 1,
        probeStatus: "OK",
        probeAt: at,
        readStatus: "OK",
        readAt: at,
        readRowCount: 1,
      },
      update: { connectionId, readStatus: "OK", readAt: at },
    });
    await tx.sapServiceHealth.upsert({
      where: {
        connectionId_serviceName_entitySet: {
          connectionId,
          serviceName: "API_BUSINESS_PARTNER",
          entitySet: "A_BusinessPartner",
        },
      },
      create: {
        organizationId: org,
        connectionId,
        serviceName: "API_BUSINESS_PARTNER",
        entitySet: "A_BusinessPartner",
        readStatus: "OK",
        readAt: at,
        readRowCount: 1,
      },
      update: { readStatus: "OK", readAt: at },
    });
  };

  const evidence = async (connectionId: string) => ({
    checks: await prisma.laneCheck.count({ where: { organizationId: org, connectionId } }),
    services: await prisma.sapServiceHealth.count({ where: { organizationId: org, connectionId } }),
  });

  const loadConnection = async () => {
    const [c] = await resolveSapConnections(org, "s4hana");
    if (c === undefined) throw new Error("the connection was not saved");
    return c;
  };

  beforeAll(async () => {
    for (const k of KEY_VARS) saved[k] = process.env[k];
    for (const k of KEY_VARS) delete process.env[k];
    process.env.SAP_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    clearDataKeyCache();
    await prisma.organization.create({ data: { id: org, name: `p02-resave-test ${org}`, type: "client" } });
  });

  afterAll(async () => {
    await prisma.laneCheck.deleteMany({ where: { organizationId: org } });
    await prisma.sapServiceHealth.deleteMany({ where: { organizationId: org } });
    await prisma.organization.deleteMany({ where: { id: org } });
    for (const k of KEY_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    clearDataKeyCache();
  });

  it("a check loaded before a re-save records nothing after it; one loaded after records", async () => {
    await save("https://old-tenant.s4hana.ondemand.com");
    const before = await loadConnection();
    expect(before.revision).toBe(1);

    expect(await recordLaneCheck(before, writeCheck(before.id))).toBe(true);
    expect(await evidence(before.id)).toEqual({ checks: 1, services: 1 });
    await prisma.sapConnection.update({
      where: { id: before.id, organizationId: org },
      data: { lastValidationStatus: "OK", lastValidatedAt: new Date() },
    });

    // The re-save: same row id, another tenant.
    await save("https://new-tenant.s4hana.ondemand.com");
    const row = await prisma.sapConnection.findFirst({
      where: { id: before.id, organizationId: org },
      select: { revision: true, lastValidationStatus: true, lastValidatedAt: true },
    });
    expect(row).toEqual({ revision: 2, lastValidationStatus: null, lastValidatedAt: null });
    expect(await evidence(before.id)).toEqual({ checks: 0, services: 0 });

    // The check that was reading the old tenant finishes now: nothing lands.
    expect(await recordLaneCheck(before, writeCheck(before.id))).toBe(false);
    expect(await evidence(before.id)).toEqual({ checks: 0, services: 0 });

    // A check made through the new settings is recorded.
    const after = await loadConnection();
    expect(after.revision).toBe(2);
    expect(await recordLaneCheck(after, writeCheck(after.id))).toBe(true);
    expect(await evidence(after.id)).toEqual({ checks: 1, services: 1 });
  });

  it("a re-save arriving while a check is recorded waits for it, then drops what it wrote", async () => {
    const loaded = await loadConnection();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const holding = new Promise<void>((r) => (locked = r));

    // The check takes the row lock, writes, and holds the transaction open.
    const recording = recordLaneCheck(loaded, async (tx) => {
      await writeCheck(loaded.id)(tx);
      locked();
      await gate;
    });
    await holding;

    let resaved = false;
    const resave = save("https://third-tenant.s4hana.ondemand.com").then(() => {
      resaved = true;
    });
    // The re-save's UPDATE waits on the check's FOR SHARE lock.
    await new Promise((r) => setTimeout(r, 300));
    expect(resaved).toBe(false);

    release();
    expect(await recording).toBe(true);
    await resave;
    // The re-save committed after the check and dropped what it wrote.
    expect(await evidence(loaded.id)).toEqual({ checks: 0, services: 0 });
    expect((await loadConnection()).revision).toBe((loaded.revision ?? 0) + 1);
  });
});
