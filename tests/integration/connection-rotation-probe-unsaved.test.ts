// @vitest-environment node
/**
 * A rotation probe that reached SAP is on the record even when the save then
 * does not happen (wave 2 integration review round 3).
 *
 * The probe sends the new credentials to the client's SAP (sign-in and the
 * probe path's $metadata). The only row that said so was the
 * save's own audit row, written after the upsert, so a save that failed to
 * seal (500) or lost its row three times (409) after a passing probe left
 * SAP requests that nothing recorded, although the A.3 #9 exemption for the
 * Connections route says the probe is recorded
 * (tests/unit/security/no-side-doors.test.ts).
 *
 * Through the real Connections route against real PostgreSQL, SAP stood in
 * for by `fetch`. The conflict path wraps the real upsert so a test can make
 * it lose the row. Opt-in like the other integration tests: skipped without
 * TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolver from "@/lib/sap-public/connection-resolver";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
const upsertHook = vi.hoisted(() => ({ loseRow: false }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ConnectionResolver>();
  return {
    ...actual,
    // The row changes under every attempt: what a save racing other saves meets.
    upsertSapConnection: async (...args: Parameters<typeof actual.upsertSapConnection>) => {
      if (upsertHook.loseRow) throw new actual.SapConnectionChangedError();
      return actual.upsertSapConnection(...args);
    },
  };
});

import { prisma } from "@/lib/db/prisma";
import { POST as testConnection } from "@/app/api/studio/connections/[id]/test/route";
import { POST as saveConnection } from "@/app/api/studio/connections/route";
import { resolveSapConnection } from "@/lib/sap-public/connection-resolver";

const RUN = `p014u-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const USER = { id: `${RUN}-dev`, email: `${RUN}-dev@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG, authMethod: "session" };
const KEY = "c".repeat(64);

const sap = { password: "Pw-1" };
const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';
const fakeSap = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  if (auth !== `Basic ${Buffer.from(`COMM_USER:${sap.password}`).toString("base64")}`) return new Response("", { status: 401 });
  if (String(url).includes("$metadata")) {
    return new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } });
  }
  return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

const save = (key: string, password: string) =>
  saveConnection(
    new NextRequest("http://localhost/api/studio/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product: "s4hana",
        key,
        label: "S/4HANA DEV",
        baseUrl: "https://my000001-api.s4hana.cloud.sap",
        authType: "basic",
        username: "COMM_USER",
        password,
        environment: "DEV",
      }),
    }),
  );

/** A connection saved and proven by its Test, so the next re-save is probed. */
async function provenConnection(key: string): Promise<string> {
  sap.password = "Pw-1";
  expect((await save(key, "Pw-1")).status).toBe(200);
  const row = await prisma.sapConnection.findFirst({ where: { organizationId: ORG, product: "s4hana", key }, select: { id: true } });
  const tested = await testConnection(new NextRequest("http://localhost/x", { method: "POST" }), {
    params: Promise.resolve({ id: row!.id }),
  });
  expect(((await tested.json()) as { data: { validated: boolean } }).data.validated).toBe(true);
  return row!.id;
}

const probedRows = (connectionId: string) =>
  prisma.configAudit.findMany({
    where: { organizationId: ORG, entityId: connectionId, action: "TEST_CONNECT", after: { path: ["event"], equals: "connection_rotation_probed" } },
    select: { after: true },
  });

describe.skipIf(!process.env.TEST_DATABASE_URL)("a rotation probe that reached SAP is recorded when the save does not happen", () => {
  beforeAll(async () => {
    await prisma.organization.create({ data: { id: ORG, name: "Rotation probe unsaved", type: "client" } });
    await prisma.user.create({ data: { id: USER.id, email: USER.email, name: USER.name, role: USER.role, organizationId: ORG } });
    session.user = USER;
  });
  beforeEach(async () => {
    // One active DEV connection at a time: two would be twins the save refuses.
    await prisma.sapConnection.updateMany({ where: { organizationId: ORG }, data: { isActive: false } });
    vi.unstubAllEnvs();
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", KEY);
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubGlobal("fetch", fakeSap);
    upsertHook.loseRow = false;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.sapConnectionProbeEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.sapConnection.deleteMany({ where: { organizationId: ORG } });
    await prisma.user.delete({ where: { id: USER.id } });
    await prisma.organization.delete({ where: { id: ORG } });
  });

  it("a save that cannot be sealed after a passing probe leaves the probe on the record (500)", async () => {
    const id = await provenConnection(`${RUN}-seal`);
    sap.password = "Pw-2";
    fakeSap.mockClear();
    // The key breaks between the probe and the seal: the probe needs no key, the upsert does.
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "");
    const res = await save(`${RUN}-seal`, "Pw-2");
    expect(res.status).toBe(500);
    expect(fakeSap.mock.calls.some(([url]) => String(url).includes("$metadata"))).toBe(true);
    const rows = await probedRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.after).toMatchObject({
      probes: 1,
      saved: false,
      reason: "seal_or_persist_failed",
      rotationProbe: { ran: true, outcome: "passed" },
    });
    // Never what was typed.
    expect(JSON.stringify(rows[0]!.after)).not.toContain("Pw-2");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", KEY);
    expect((await resolveSapConnection(ORG, "s4hana", `${RUN}-seal`))?.secrets.password).toBe("Pw-1");
  });

  it("a save whose row keeps changing after passing probes leaves every probe on the record (409)", async () => {
    const id = await provenConnection(`${RUN}-race`);
    sap.password = "Pw-2";
    upsertHook.loseRow = true;
    const res = await save(`${RUN}-race`, "Pw-2");
    expect(res.status).toBe(409);
    const rows = await probedRows(id);
    expect(rows).toHaveLength(1);
    // Judged, and probed, once per attempt.
    expect(rows[0]!.after).toMatchObject({ probes: 3, saved: false, reason: "conflict" });
  });

  it("a save that goes through records its probe on its own row, and no second one", async () => {
    const id = await provenConnection(`${RUN}-ok`);
    sap.password = "Pw-2";
    expect((await save(`${RUN}-ok`, "Pw-2")).status).toBe(200);
    expect(await probedRows(id)).toHaveLength(0);
    const saved = await prisma.configAudit.findFirst({
      where: { organizationId: ORG, entityId: id, action: "UPDATE" },
      orderBy: { at: "desc" },
      select: { after: true },
    });
    expect(saved?.after).toMatchObject({
      event: "connection_replaced",
      rotationProbe: { mode: "observe", ran: true, outcome: "passed", reason: "metadata_ok" },
    });
    // The misleading boolean is gone (wave 2 final review round 3).
    expect(saved?.after).not.toHaveProperty("rotationProbed");
  });
});
