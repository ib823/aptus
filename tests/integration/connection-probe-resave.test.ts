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
 *      so the operator is not sent to re-enter a secret that is fine;
 *   4. the Studio "Test connectivity" judges the group the same way, so it
 *      cannot write a fresh OK over GROUP_UNREADABLE while the broker
 *      refuses every call for the product (P0.2 review round 4);
 *   5. the remedy that answer names (re-save or deactivate the row that will
 *      not open) clears GROUP_UNREADABLE on the healthy siblings at once, so
 *      the screens stop saying "refused" while the broker serves, and the
 *      Studio test audits the status it records (P0.2 review round 5);
 *   6. that clear cannot erase a failure SAP reported, cannot be outrun by a
 *      re-save landing mid-attribution, reaches a sibling that was inactive
 *      when the remedy ran, and re-saving the wrong row does not make it read
 *      "never tested" while the broker still refuses (P0.2 review round 6).
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as JourneyModule from "@/lib/coreedge/journey";
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
  /** Runs once, right after a row of the group fails to open on its own (round 6). */
  afterBadOpen: null as null | (() => Promise<void>),
  probedHosts: [] as string[],
  status: "OK" as string,
  captureMessage: vi.fn(),
  noteConnectionProbe: vi.fn(),
  writeConfigAudit: vi.fn(),
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
    resolveSapConnection: async (organizationId: string, product: string, key?: string | null) => {
      if (organizationId !== hooks.org) return null;
      try {
        return await real.resolveSapConnection(organizationId, product, key);
      } catch (err) {
        const after = hooks.afterBadOpen;
        hooks.afterBadOpen = null;
        if (after) await after();
        throw err;
      }
    },
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
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({
    id: "u_builder",
    email: "builder@abeam.com",
    role: "consultant",
    organizationId: hooks.org,
    authMethod: "session",
  }),
}));
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: hooks.writeConfigAudit }));
// The journey milestone is the real one, watched: a Studio test that ends the
// SAP set-up wait for a product the broker refuses is the defect.
vi.mock("@/lib/coreedge/journey", async (importOriginal) => {
  const real = await importOriginal<typeof JourneyModule>();
  return {
    ...real,
    noteConnectionProbe: (input: Parameters<typeof real.noteConnectionProbe>[0]) => {
      hooks.noteConnectionProbe(input);
      return real.noteConnectionProbe(input);
    },
  };
});

import { POST as studioTest } from "@/app/api/studio/connections/[id]/test/route";
import { PATCH as patchConnections } from "@/app/api/studio/connections/route";
import {
  CONNECTION_NEEDS_ATTENTION,
  CONNECTION_NOT_PROBED_STATUSES,
  connectionHealthVerdict,
} from "@/lib/coreedge/freshness";
import { prisma } from "@/lib/db/prisma";
import { probeOneConnection, sweepConnectionProbes } from "@/lib/ops/connection-probe-sweep";
import { countedProbeEvents } from "@/lib/ops/probe-event-source";
import { resolveSapConnectionForEnvironment, upsertSapConnection } from "@/lib/sap-public/connection-resolver";
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
    hooks.afterBadOpen = null;
    hooks.probedHosts = [];
    hooks.status = "OK";
    hooks.captureMessage.mockReset();
    hooks.noteConnectionProbe.mockReset();
    hooks.writeConfigAudit.mockReset();
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

    const studioTestOf = (id: string) =>
      studioTest(new Request(`http://localhost/api/studio/connections/${id}/test`, { method: "POST" }) as never, {
        params: Promise.resolve({ id }),
      });

    it("Studio 'Test connectivity' on the sibling leaves GROUP_UNREADABLE standing (round 4)", async () => {
      // The broker fails closed on the whole product: every PROD call is
      // refused. The Studio test opened only the named row, probed SAP, got a
      // 200 and wrote a fresh OK over GROUP_UNREADABLE — Healthy on every
      // screen, and the SAP set-up wait ended, while nothing could be served.
      const { good } = await brokenSibling();
      await sweepConnectionProbes();
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");
      hooks.noteConnectionProbe.mockReset();

      const res = await studioTestOf(good.id);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.message).toMatch(/another active connection for this product/i);
      expect(body.error.message).toContain("S/4 acme-dev");
      // No request reached SAP, so nothing is recorded as a probe of it.
      expect(hooks.probedHosts).toEqual([]);
      const after = await stored(good.id);
      expect(after).toMatchObject({ lastValidationStatus: "GROUP_UNREADABLE", lastValidatedAt: null });
      expect(await sources(good.id)).toEqual([]);
      expect(hooks.noteConnectionProbe).not.toHaveBeenCalled();
      // The screens and the broker agree.
      expect(connectionHealthVerdict(after!, new Date())).not.toBe("healthy");
      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toEqual({
        ok: false,
        reason: "CONNECTION_UNREADABLE",
      });
    });

    it("Studio 'Test connectivity' on a sibling never probed before records GROUP_UNREADABLE, not OK", async () => {
      const { good } = await brokenSibling();

      const res = await studioTestOf(good.id);

      expect(res.status).toBe(409);
      expect(hooks.probedHosts).toEqual([]);
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");
      expect(hooks.noteConnectionProbe).not.toHaveBeenCalled();
    });

    it("Studio 'Test connectivity' on the row that will not open records UNREADABLE on it alone", async () => {
      const { good, bad } = await brokenSibling();

      const res = await studioTestOf(bad.id);

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.message).toMatch(/could not be read/i);
      expect((await stored(bad.id))?.lastValidationStatus).toBe("UNREADABLE");
      // The sibling was not the one asked about: left as it was.
      expect((await stored(good.id))?.lastValidationStatus).toBeNull();
    });

    it("Studio 'Test connectivity' that records GROUP_UNREADABLE names the builder in the audit (round 5)", async () => {
      // The 409 path changes the row's status — it raises the unhealthy-
      // connection incident and flips the row on every screen — so who caused
      // it must be answerable, as on every other path of the route.
      const { good } = await brokenSibling();

      const res = await studioTestOf(good.id);

      expect(res.status).toBe(409);
      expect(hooks.writeConfigAudit).toHaveBeenCalledTimes(1);
      expect(hooks.writeConfigAudit).toHaveBeenCalledWith({
        organizationId: org,
        actorId: "u_builder",
        entityType: "Connection",
        entityId: good.id,
        action: "TEST_CONNECT",
        after: { status: "GROUP_UNREADABLE", reachedSap: false },
      });
    });

    /** The incidents route's count of unhealthy connections (UNHEALTHY). */
    const unhealthyCount = () =>
      prisma.sapConnection.count({
        where: {
          organizationId: org,
          isActive: true,
          lastValidationStatus: { in: [...CONNECTION_NEEDS_ATTENTION, ...CONNECTION_NOT_PROBED_STATUSES] },
        },
      });

    const patchConnection = (body: Record<string, unknown>) =>
      patchConnections(
        new Request("http://localhost/api/studio/connections", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }) as never,
      );

    it("re-saving the broken sibling clears GROUP_UNREADABLE on the healthy one (round 5)", async () => {
      // The 409 says "re-save that connection's secrets, or deactivate it".
      // Done: the broker serves again — and the healthy sibling must stop
      // reading refused, and stop raising the incident, before the next
      // nightly probe (up to 24 h later).
      const { good } = await brokenSibling();
      await sweepConnectionProbes();
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");
      const before = await stored(good.id);

      await save("acme-dev", "https://dev.example.com");

      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toMatchObject({ ok: true });
      const after = await stored(good.id);
      // "Never tested", not refused; the last success time and the drift
      // history are left as they were.
      expect(after).toMatchObject({ lastValidationStatus: null, lastValidatedAt: before!.lastValidatedAt });
      expect(connectionHealthVerdict(after!, new Date())).toBe("neverTested");
      expect(await unhealthyCount()).toBe(0);
    });

    it("deactivating the broken sibling in Studio clears GROUP_UNREADABLE on the healthy one (round 5)", async () => {
      const { good, bad } = await brokenSibling();
      await sweepConnectionProbes();
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");

      const res = await patchConnection({ id: bad.id, isActive: false });

      expect(res.status).toBe(200);
      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toMatchObject({ ok: true });
      const after = await stored(good.id);
      expect(after?.lastValidationStatus).toBeNull();
      expect(connectionHealthVerdict(after!, new Date())).toBe("neverTested");
      expect(await unhealthyCount()).toBe(0);
    });

    it("while another sibling still will not open, GROUP_UNREADABLE stays: the broker still refuses (round 5)", async () => {
      const { good } = await brokenSibling();
      const other = await save("acme-qa", "https://qa.example.com");
      await prisma.sapConnection.update({
        where: { id: other.id, organizationId: org },
        data: { secretsCiphertext: "v1:not-a-sealed-bundle" },
      });
      await sweepConnectionProbes();
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");

      await save("acme-dev", "https://dev.example.com");

      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toEqual({
        ok: false,
        reason: "CONNECTION_UNREADABLE",
      });
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");
      expect((await stored(other.id))?.lastValidationStatus).toBe("UNREADABLE");
    });

    it("once the broken sibling is deactivated, the Studio test records the 200 again", async () => {
      const { good, bad } = await brokenSibling();
      await sweepConnectionProbes();
      await prisma.sapConnection.update({ where: { id: bad.id, organizationId: org }, data: { isActive: false } });

      const res = await studioTestOf(good.id);

      expect(res.status).toBe(200);
      expect(hooks.probedHosts).toEqual(["https://prod.example.com"]);
      expect((await stored(good.id))?.lastValidationStatus).toBe("OK");
      expect(hooks.noteConnectionProbe).toHaveBeenCalledTimes(1);
    });

    it("a refusal SAP reported on the sibling survives the group's failure and its fix (round 6)", async () => {
      // SAP answers 401 through acme-prod: needs attention, in the incident.
      const good = await save("acme-prod", "https://prod.example.com");
      hooks.status = "UNAUTHORIZED";
      await sweepConnectionProbes();
      expect((await stored(good.id))?.lastValidationStatus).toBe("UNAUTHORIZED");

      // A second connection arrives sealed under a key this deployment lacks.
      const bad = await save("acme-dev", "https://dev.example.com");
      await prisma.sapConnection.update({
        where: { id: bad.id, organizationId: org },
        data: { secretsCiphertext: "v1:not-a-sealed-bundle" },
      });
      await sweepConnectionProbes();
      // The broken row says so; the 401 on the sibling is not traded for a
      // statement about another row — one the remedy would later erase.
      expect((await stored(bad.id))?.lastValidationStatus).toBe("UNREADABLE");
      expect((await stored(good.id))?.lastValidationStatus).toBe("UNAUTHORIZED");
      // Nor by the Studio test: 409 naming the row to fix, nothing recorded.
      const res = await studioTestOf(good.id);
      expect(res.status).toBe(409);
      expect((await res.json()).error.message).toContain("S/4 acme-dev");
      expect((await stored(good.id))?.lastValidationStatus).toBe("UNAUTHORIZED");
      expect(hooks.writeConfigAudit).not.toHaveBeenCalled();

      // The documented remedy. SAP still answers 401 through acme-prod, and
      // every screen and the incident must still say so.
      await save("acme-dev", "https://dev.example.com");

      const after = await stored(good.id);
      expect(after?.lastValidationStatus).toBe("UNAUTHORIZED");
      expect(connectionHealthVerdict(after!, new Date())).toBe("needsAttention");
      expect(await unhealthyCount()).toBe(1);
    });

    it("a re-save of the broken row landing while the sweep attributes the group leaves no sibling refused (round 6)", async () => {
      const { good, bad } = await brokenSibling();
      // The fix commits between the sweep opening the rows and writing their
      // statuses: the re-save's own clear finds nothing marked yet.
      hooks.afterBadOpen = async () => {
        await save("acme-dev", "https://dev.example.com");
      };

      await sweepConnectionProbes();

      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toMatchObject({ ok: true });
      expect((await stored(good.id))?.lastValidationStatus).toBeNull();
      expect((await stored(bad.id))?.lastValidationStatus).toBeNull();
      expect(await unhealthyCount()).toBe(0);
    });

    it("the same race through Probe now leaves no sibling refused (round 6)", async () => {
      const { good } = await brokenSibling();
      hooks.afterBadOpen = async () => {
        await save("acme-dev", "https://dev.example.com");
      };

      const out = await probeOneConnection(org, good.id, "manual");

      expect(out.outcome).toBe("unreadable");
      // Whatever it wrote did not stand: the set opened again before it returned.
      if (out.outcome === "unreadable") expect(out.recorded).toBeUndefined();
      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toMatchObject({ ok: true });
      expect((await stored(good.id))?.lastValidationStatus).toBeNull();
      expect(await unhealthyCount()).toBe(0);
    });

    it("a sibling inactive when the remedy ran stops reading refused once it is reactivated (round 6)", async () => {
      const { good } = await brokenSibling();
      await sweepConnectionProbes();
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");

      expect((await patchConnection({ id: good.id, isActive: false })).status).toBe(200);
      await save("acme-dev", "https://dev.example.com");
      expect((await patchConnection({ id: good.id, isActive: true })).status).toBe(200);

      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toMatchObject({ ok: true });
      const after = await stored(good.id);
      expect(after?.lastValidationStatus).toBeNull();
      expect(connectionHealthVerdict(after!, new Date())).toBe("neverTested");
      expect(await unhealthyCount()).toBe(0);
    });

    it("reactivating a sibling while the broken row still will not open keeps GROUP_UNREADABLE (round 6)", async () => {
      const { good } = await brokenSibling();
      await sweepConnectionProbes();
      expect((await patchConnection({ id: good.id, isActive: false })).status).toBe(200);
      expect((await patchConnection({ id: good.id, isActive: true })).status).toBe(200);

      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toEqual({
        ok: false,
        reason: "CONNECTION_UNREADABLE",
      });
      expect((await stored(good.id))?.lastValidationStatus).toBe("GROUP_UNREADABLE");
    });

    it("re-saving the GROUP_UNREADABLE row instead of the broken one changes nothing (round 6)", async () => {
      // Re-entering the secret is the natural reaction to a refused row. It
      // is the wrong row: the broker still refuses every call for the product,
      // so the row must not turn neutral ("never tested"), lose the line that
      // names the row to fix, or leave the unhealthy-connection count.
      const { good } = await brokenSibling();
      await sweepConnectionProbes();
      expect(await unhealthyCount()).toBe(2);

      await save("acme-prod", "https://prod.example.com");

      expect(await resolveSapConnectionForEnvironment(org, "s4hana", "PROD", "READ", null)).toEqual({
        ok: false,
        reason: "CONNECTION_UNREADABLE",
      });
      const after = await stored(good.id);
      expect(after).toMatchObject({ revision: 2, lastValidationStatus: "GROUP_UNREADABLE" });
      expect(connectionHealthVerdict(after!, new Date())).toBe("unreadable");
      expect(await unhealthyCount()).toBe(2);

      // Then the right row: the set opens, and the re-saved settings, never
      // probed, read "never tested".
      await save("acme-dev", "https://dev.example.com");
      expect((await stored(good.id))?.lastValidationStatus).toBeNull();
      expect(await unhealthyCount()).toBe(0);
    });
  });
});
