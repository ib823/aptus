// @vitest-environment node
/**
 * A connection probe and a re-save, against a real PostgreSQL database
 * (P0.2 review round 2).
 *
 * THE RACE. A probe opens a connection, then waits on SAP. A re-save in the
 * meantime keeps the row's id, points it at another system and clears its
 * probe status ("never tested"). The probe of the OLD settings then finished
 * and wrote OK — and a last-success time — onto the row that now holds the
 * NEW settings, which nobody had probed: Healthy for up to 48 hours on the
 * old tenant's 200. The lane checks had a revision guard for exactly this;
 * the three probe writers did not.
 *
 * Proved here, on the real table and the real re-save transaction:
 *   1. "Probe now" and the nightly sweep record nothing — no status, no probe
 *      event — when the connection was re-saved while they probed;
 *   2. the healthy-to-failing drift alert still fires on the first failing
 *      probe after a re-save (a mistyped password in a rotation), judged
 *      against the last probe that ran, as it did before P0.2;
 *   3. when one connection of a product will not open, only that row reads
 *      UNREADABLE; a sibling whose own secret opens reads GROUP_UNREADABLE,
 *      so the operator is not sent to re-enter a secret that is fine.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ResolverModule from "@/lib/sap-public/connection-resolver";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

const hooks = vi.hoisted(() => ({
  org: "",
  duringProbe: null as null | (() => Promise<void>),
  probedHosts: [] as string[],
  status: "OK" as string,
  captureMessage: vi.fn(),
}));

/*
 * The sweep is fleet-wide. Other tests share this database, so the resolver
 * answers for THIS test's organization only — every other tenant's rows are
 * left exactly as they are.
 */
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const real = await importOriginal<typeof ResolverModule>();
  return {
    ...real,
    resolveSapConnections: (organizationId: string, product: string) =>
      organizationId === hooks.org ? real.resolveSapConnections(organizationId, product) : Promise.resolve([]),
    resolveSapConnection: (organizationId: string, product: string, key?: string | null) =>
      organizationId === hooks.org ? real.resolveSapConnection(organizationId, product, key) : Promise.resolve(null),
  };
});
vi.mock("@/lib/studio/connection-health", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    resolveProbePath: () => "/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata",
    probeConnection: async (conn: { baseUrl: string }) => {
      hooks.probedHosts.push(conn.baseUrl);
      const during = hooks.duringProbe;
      hooks.duringProbe = null;
      if (during) await during();
      const ok = hooks.status === "OK";
      return { status: hooks.status, httpStatus: ok ? 200 : 401, durationMs: 5, detail: ok ? "ok" : "refused" };
    },
  };
});
vi.mock("@sentry/nextjs", () => ({ captureMessage: hooks.captureMessage }));
vi.mock("@/lib/email/brevo", () => ({ sendEmail: vi.fn() }));

import { prisma } from "@/lib/db/prisma";
import { probeOneConnection, sweepConnectionProbes } from "@/lib/ops/connection-probe-sweep";
import { countedProbeEvents } from "@/lib/ops/probe-event-source";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { clearDataKeyCache } from "@/lib/sap-public/keys/org-data-key";

const KEY_VARS = [
  "SAP_CONNECTION_ENCRYPTION_KEY",
  "SAP_CONNECTION_ENCRYPTION_KEYS",
  "SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY",
  "SAP_CONNECTION_KEY_PROVIDER",
  "SAP_CONNECTION_ACCEPT_LEGACY_FORMAT",
] as const;

describe.skipIf(!process.env.TEST_DATABASE_URL)("a connection probe and a re-save, on a real database", () => {
  const org = `org_p02_probe_${randomUUID().slice(0, 8)}`;
  const savedEnv: Record<string, string | undefined> = {};

  const save = (key: string, baseUrl: string) =>
    upsertSapConnection({
      organizationId: org,
      product: "s4hana",
      key,
      label: `S/4 ${key}`,
      baseUrl,
      authType: "basic",
      secrets: { username: "comm_user", password: "secret" },
      environment: key.endsWith("prod") ? "PROD" : "DEV",
    });

  const stored = (id: string) =>
    prisma.sapConnection.findFirst({
      where: { id, organizationId: org },
      select: { baseUrl: true, revision: true, lastValidationStatus: true, lastValidatedAt: true },
    });

  /** The connection's probe HISTORY — what drift and incidents read. */
  const events = (connectionId: string) =>
    prisma.sapConnectionProbeEvent.count({ where: { organizationId: org, connectionId, ...countedProbeEvents } });
  /** Every request that reached SAP, superseded or not. */
  const sources = async (connectionId: string) =>
    (
      await prisma.sapConnectionProbeEvent.findMany({
        where: { organizationId: org, connectionId },
        orderBy: { at: "asc" },
        select: { source: true },
      })
    ).map((e) => e.source);

  beforeAll(async () => {
    for (const k of KEY_VARS) savedEnv[k] = process.env[k];
    for (const k of KEY_VARS) delete process.env[k];
    process.env.SAP_CONNECTION_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    clearDataKeyCache();
    hooks.org = org;
    await prisma.organization.create({ data: { id: org, name: `P0.2 probe ${org}`, type: "client" } });
  });

  beforeEach(async () => {
    hooks.duringProbe = null;
    hooks.probedHosts = [];
    hooks.status = "OK";
    hooks.captureMessage.mockReset();
    await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: org } });
    await prisma.sapConnection.deleteMany({ where: { organizationId: org } });
  });

  afterAll(async () => {
    await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: org } });
    await prisma.sapConnection.deleteMany({ where: { organizationId: org } });
    await prisma.organization.deleteMany({ where: { id: org } });
    for (const k of KEY_VARS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    clearDataKeyCache();
    await prisma.$disconnect();
  });

  describe("a probe of the previous settings records nothing", () => {
    it("Probe now: the new settings stay 'never tested', with no probe event", async () => {
      const saved = await save("acme-dev", "https://old-tenant.example.com");
      hooks.duringProbe = async () => {
        await save("acme-dev", "https://new-tenant.example.com");
      };

      const out = await probeOneConnection(org, saved.id, "manual");

      expect(hooks.probedHosts).toEqual(["https://old-tenant.example.com"]);
      expect(out.outcome).toBe("superseded");
      expect(await stored(saved.id)).toMatchObject({
        baseUrl: "https://new-tenant.example.com",
        revision: 2,
        lastValidationStatus: null,
        lastValidatedAt: null,
      });
      expect(await events(saved.id)).toBe(0);
      // But the request that reached the old tenant is not erased (round 3).
      expect(await sources(saved.id)).toEqual(["manual:superseded"]);
    });

    it("the nightly sweep: the same race leaves the new settings 'never tested'", async () => {
      const saved = await save("acme-dev", "https://tenant-a.example.com");
      hooks.duringProbe = async () => {
        await save("acme-dev", "https://tenant-b.example.com");
      };

      await sweepConnectionProbes();

      expect(hooks.probedHosts).toEqual(["https://tenant-a.example.com"]);
      expect(await stored(saved.id)).toMatchObject({
        baseUrl: "https://tenant-b.example.com",
        lastValidationStatus: null,
        lastValidatedAt: null,
      });
      expect(await events(saved.id)).toBe(0);
      expect(await sources(saved.id)).toEqual(["cron:superseded"]);
    });

    it("a probe with no re-save still records as before", async () => {
      const saved = await save("acme-dev", "https://tenant-a.example.com");
      const out = await probeOneConnection(org, saved.id, "manual");
      expect(out).toMatchObject({ outcome: "probed", status: "OK" });
      expect((await stored(saved.id))?.lastValidationStatus).toBe("OK");
      expect(await events(saved.id)).toBe(1);
    });
  });

  describe("the drift alert survives a re-save", () => {
    it("OK, then a re-save with a mistyped password, then UNAUTHORIZED: the admins are told", async () => {
      const saved = await save("acme-prod", "https://prod.example.com");
      await sweepConnectionProbes(); // OK: the established baseline
      expect((await stored(saved.id))?.lastValidationStatus).toBe("OK");

      await save("acme-prod", "https://prod.example.com"); // the rotation
      expect((await stored(saved.id))?.lastValidationStatus).toBeNull();

      hooks.status = "UNAUTHORIZED";
      const result = await sweepConnectionProbes();

      expect(result.transitions).toEqual([{ connectionId: saved.id, from: "OK", to: "UNAUTHORIZED" }]);
      expect(hooks.captureMessage).toHaveBeenCalledTimes(1);
      // The screens still say what the new settings are: failing, not "was OK".
      expect((await stored(saved.id))?.lastValidationStatus).toBe("UNAUTHORIZED");
    });

    it("a superseded probe's trace is never the drift baseline (round 3)", async () => {
      // OK, then a Probe now of the OLD settings that SAP refuses, superseded
      // by a re-save mid-probe. Its trace says UNAUTHORIZED; read as history
      // it would make the next failure "UNAUTHORIZED → UNAUTHORIZED" and
      // swallow the alert.
      const saved = await save("acme-prod", "https://prod.example.com");
      await sweepConnectionProbes();
      hooks.status = "UNAUTHORIZED";
      hooks.duringProbe = async () => {
        await save("acme-prod", "https://prod.example.com");
      };
      expect((await probeOneConnection(org, saved.id, "manual")).outcome).toBe("superseded");

      const result = await sweepConnectionProbes();

      expect(result.transitions).toEqual([{ connectionId: saved.id, from: "OK", to: "UNAUTHORIZED" }]);
      expect(await sources(saved.id)).toEqual(["cron", "manual:superseded", "cron"]);
    });

    it("a brand-new connection's first failing probe is still not a drift", async () => {
      await save("acme-dev", "https://dev.example.com");
      hooks.status = "UNAUTHORIZED";
      const result = await sweepConnectionProbes();
      expect(result.transitions).toEqual([]);
      expect(hooks.captureMessage).not.toHaveBeenCalled();
    });

    it("a connection already failing before the re-save is not mailed again", async () => {
      const saved = await save("acme-prod", "https://prod.example.com");
      hooks.status = "UNAUTHORIZED";
      await sweepConnectionProbes();
      await save("acme-prod", "https://prod.example.com");
      const result = await sweepConnectionProbes();
      expect(result.transitions).toEqual([]);
      expect((await stored(saved.id))?.lastValidationStatus).toBe("UNAUTHORIZED");
    });
  });

  describe("one connection that will not open", () => {
    async function brokenSibling() {
      const good = await save("acme-prod", "https://prod.example.com");
      const bad = await save("acme-dev", "https://dev.example.com");
      // Sealed under a key this deployment no longer holds.
      await prisma.sapConnection.update({
        where: { id: bad.id, organizationId: org },
        data: { secretsCiphertext: "v1:not-a-sealed-bundle" },
      });
      return { good, bad };
    }

    it("the sweep marks only that row UNREADABLE; its sibling reads GROUP_UNREADABLE", async () => {
      const { good, bad } = await brokenSibling();

      const result = await sweepConnectionProbes();

      expect(result.unreadable).toBe(2);
      expect((await stored(bad.id))?.lastValidationStatus).toBe("UNREADABLE");
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");
      expect(hooks.probedHosts).toEqual([]);
    });

    it("Probe now on the sibling names the other connection as the one to fix", async () => {
      const { good } = await brokenSibling();

      const out = await probeOneConnection(org, good.id, "manual");

      expect(out.outcome).toBe("unreadable");
      if (out.outcome === "unreadable") {
        expect(out.detail).toMatch(/another active connection for this product/i);
        expect(out.detail).toContain("S/4 acme-dev");
      }
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");
    });
  });
});
