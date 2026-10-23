// @vitest-environment node
/**
 * A form re-save that moves a writing connection, or that was opened before
 * the row changed, is judged as what it does (P0.3 review round 2) — against
 * real PostgreSQL, through the real route, with the form's own request body.
 *
 * DEFECT 1: WRITES WERE JUDGED PER ROW, NOT PER SYSTEM. The route decided that
 * a save turned writes on only when the row was not writable before. A DEV
 * connection that allowed writes, re-saved from the form with Environment
 * PROD and the client's PROD host and Allow writes still ticked (the form's
 * default for a writing row), switched writes on in PROD for the first time —
 * asked for as `connection.save_secrets`, audited with no `writesEnabled`, no
 * environment before and no host at all. Writes are allowed for a system
 * (environment, SAP host, SAP client); a save that keeps them on while
 * pointing the row at another one is `connection.enable_writes`.
 *
 * DEFECT 2: A STALE FORM RE-ARMED A DEACTIVATED CONNECTION. The form's
 * "Allow writes" default comes from the list loaded with the page. Opened
 * before an operator deactivated a writing connection, a later save sent
 * writes on and brought the row back active with its writes, with nothing on
 * the screen or in the response saying so. The form now sends what it showed
 * for the row (`expected`), and the route refuses with 409 when the row has
 * changed since; a save that reactivates a row says so in its response and
 * its audit row.
 *
 * DEFECT 3: THE CHECK AND THE WRITE WERE NOT ONE STEP (review round 3). The
 * row was read, judged and compared with `expected` first; the upsert then
 * wrote by (organization, product, key) whatever had happened since. An
 * operator's Deactivate landing in that gap — while the route asked for the
 * passkey, sealed and read the row again — was undone: the row came back
 * active and writing, the response said nothing, the passkey was asked as a
 * secret save and the audit row said isActiveBefore: true. The upsert now
 * locks the row and writes only when it is still the row that was judged;
 * otherwise the save is judged again on what is there now (a form that
 * showed the old row is then refused with 409).
 *
 * DEFECT 4: A GATEWAY PATH IS A SYSTEM (review round 3). The write target
 * compared base URLs by origin only, but the base URL's path is joined into
 * every request, so behind one API-management host `/s4-dev` and `/s4-prod`
 * are two SAP systems. Moving a writing connection between them was a plain
 * secret save.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));
/*
 * The gap between judging a save (or a toggle) and writing it, made
 * deterministic: a hook that runs once, right after the route has read the
 * row it judges (review rounds 3 and 4). Everything the route decides — the
 * stale-form check, the twin check, the passkey, PATCH's write-secret
 * refusal — is decided on that read, so whatever the hook does lands inside
 * the gap.
 */
const gap = vi.hoisted(() => ({ afterRowRead: null as null | (() => Promise<void>) }));

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  const hooked = base.$extends({
    query: {
      sapConnection: {
        async findFirst({ args, query }) {
          const read = await query(args);
          const hook = gap.afterRowRead;
          gap.afterRowRead = null;
          if (hook) await hook();
          return read;
        },
      },
    },
  });
  return { prisma: hooked.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { PATCH as patchConnection, POST as saveConnection } from "@/app/api/studio/connections/route";
import { connectionSaveBody, type ConnectionFormFields } from "@/lib/studio/connection-form";

const RUN = `p03r2-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const BUILDER = {
  id: `${RUN}-builder`,
  email: `${RUN}-builder@abeam.com`,
  name: "Builder",
  role: "consultant",
  organizationId: ORG,
  authMethod: "session",
};
const OPERATOR = { ...BUILDER, id: `${RUN}-operator`, email: `${RUN}-operator@abeam.com`, name: "Incident Operator" };

const DEV_HOST = "https://my000001-api.s4hana.cloud.sap";
const PROD_HOST = "https://my999999-api.s4hana.cloud.sap";
/** One API-management host routing by path to two SAP systems. */
const GATEWAY = "https://apim-acme.prod.apimanagement.eu10.hana.ondemand.com";

function req(value: unknown, method = "POST") {
  return new NextRequest("http://localhost/api/studio/connections", {
    method,
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  });
}

function form(key: string, over: Partial<ConnectionFormFields> = {}): ConnectionFormFields {
  return {
    product: "s4hana",
    client: "",
    key,
    label: "S/4HANA",
    baseUrl: DEV_HOST,
    environment: "DEV",
    authType: "basic",
    apiKey: "",
    apiKeyHeader: "apikey",
    username: "COMM_USER",
    password: "not-a-real-password",
    bearerToken: "",
    clientId: "",
    clientSecret: "",
    oauthTokenUrl: "",
    companyId: "",
    samlAssertion: "",
    samlSigning: "key",
    samlPrivateKey: "",
    samlUserId: "",
    apiPath: "",
    timeoutMs: "",
    allowWrites: true,
    ...over,
  };
}

/** What the form shows for a row that is active and allows writes. */
const LIVE_WRITING = { isActive: true, writeEnabled: true } as const;

async function writingDevConnection(key: string, over: Partial<ConnectionFormFields> = {}): Promise<string> {
  vi.stubEnv("COREEDGE_STEP_UP", "off");
  session.user = BUILDER;
  // One active DEV connection per product: the previous test's row steps aside.
  await prisma.sapConnection.updateMany({ where: { organizationId: ORG }, data: { isActive: false } });
  const saved = await saveConnection(req(connectionSaveBody(form(key, over), null)));
  expect(saved.status, await saved.clone().text()).toBe(200);
  return ((await saved.json()) as { data: { connection: { id: string } } }).data.connection.id;
}

async function stepUpAction(res: Response): Promise<string> {
  expect(res.status).toBe(403);
  return ((await res.json()) as { error: { stepUp: { action: string } } }).error.stepUp.action;
}

async function lastAudit(entityId: string, action: string) {
  return prisma.configAudit.findFirst({
    where: { organizationId: ORG, entityType: "Connection", entityId, action },
    orderBy: { at: "desc" },
    select: { after: true },
  });
}

const row = (id: string) =>
  prisma.sapConnection.findFirst({
    where: { id, organizationId: ORG },
    select: { environment: true, baseUrl: true, isActive: true, writeEnabled: true },
  });

describe.skipIf(!process.env.TEST_DATABASE_URL)("a form re-save that moves or outlives a writing connection (P0.3 review round 2)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "d".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "");
    await prisma.organization.create({ data: { id: ORG, name: "Resave write target", type: "client" } });
    for (const u of [BUILDER, OPERATOR]) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
    }
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    gap.afterRowRead = null;
    await prisma.configAudit.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: [BUILDER.id, OPERATOR.id] } } });
  });

  describe("moving a writing connection to another system", () => {
    it("DEV to PROD with writes kept asks for connection.enable_writes, and changes nothing without it", async () => {
      const id = await writingDevConnection(`${RUN}-a`);
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");

      const res = await saveConnection(
        req(connectionSaveBody(form(`${RUN}-a`, { environment: "PROD", baseUrl: PROD_HOST }), LIVE_WRITING)),
      );
      expect(await stepUpAction(res)).toBe("connection.enable_writes");
      expect(await row(id)).toMatchObject({ environment: "DEV", baseUrl: DEV_HOST });
    });

    it("a new SAP host in the same environment is enabling writes there too", async () => {
      await writingDevConnection(`${RUN}-b`);
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");

      const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-b`, { baseUrl: PROD_HOST }), LIVE_WRITING)));
      expect(await stepUpAction(res)).toBe("connection.enable_writes");
    });

    it("records what the row pointed at before, and that writes were switched on for the new system", async () => {
      const id = await writingDevConnection(`${RUN}-c`);
      vi.stubEnv("COREEDGE_STEP_UP", "warn");

      const res = await saveConnection(
        req(connectionSaveBody(form(`${RUN}-c`, { environment: "PROD", baseUrl: PROD_HOST }), LIVE_WRITING)),
      );
      expect(res.status, await res.clone().text()).toBe(200);
      expect(await row(id)).toMatchObject({ environment: "PROD", writeEnabled: true, isActive: true });

      expect((await lastAudit(id, "STEP_UP_MISSING"))?.after).toMatchObject({
        governanceAction: "connection.enable_writes",
      });
      expect((await lastAudit(id, "UPDATE"))?.after).toMatchObject({
        environment: "PROD",
        environmentBefore: "DEV",
        baseUrl: PROD_HOST,
        baseUrlBefore: DEV_HOST,
        client: null,
        clientBefore: null,
        writeEnabled: true,
        writeEnabledBefore: true,
        writesEnabled: true,
        writeTargetChanged: ["environment", "baseUrl"],
      });
    });

    it("rotating the password on the same system stays a secret save", async () => {
      await writingDevConnection(`${RUN}-d`);
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");

      // A probe path and a different case in the environment are the same system.
      const res = await saveConnection(
        req(
          connectionSaveBody(
            form(`${RUN}-d`, { environment: "dev", baseUrl: `${DEV_HOST}/`, apiPath: "/sap/opu/odata/sap/API_X", password: "rotated" }),
            LIVE_WRITING,
          ),
        ),
      );
      expect(await stepUpAction(res)).toBe("connection.save_secrets");
    });

    it("another backend behind the same gateway host is another system (review round 3)", async () => {
      const id = await writingDevConnection(`${RUN}-gw`, { baseUrl: `${GATEWAY}/s4-dev` });
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");

      const moved = form(`${RUN}-gw`, { baseUrl: `${GATEWAY}/s4-prod` });
      expect(await stepUpAction(await saveConnection(req(connectionSaveBody(moved, LIVE_WRITING))))).toBe(
        "connection.enable_writes",
      );
      expect(await row(id)).toMatchObject({ baseUrl: `${GATEWAY}/s4-dev` });

      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      const res = await saveConnection(req(connectionSaveBody(moved, LIVE_WRITING)));
      expect(res.status, await res.clone().text()).toBe(200);
      expect((await lastAudit(id, "UPDATE"))?.after).toMatchObject({
        baseUrlBefore: `${GATEWAY}/s4-dev`,
        baseUrl: `${GATEWAY}/s4-prod`,
        writesEnabled: true,
        writeTargetChanged: ["baseUrl"],
      });

      // The same backend with a trailing slash is not a move.
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      const same = form(`${RUN}-gw`, { baseUrl: `${GATEWAY}/s4-prod/`, password: "rotated" });
      expect(await stepUpAction(await saveConnection(req(connectionSaveBody(same, LIVE_WRITING))))).toBe(
        "connection.save_secrets",
      );
    });
  });

  describe("a deactivation landing while a save is in flight (review round 3)", () => {
    /** The operator's Deactivate, run in the gap between the save's judgement and its write. */
    function deactivateDuringStepUp(id: string) {
      gap.afterRowRead = async () => {
        session.user = OPERATOR;
        const off = await patchConnection(req({ id, isActive: false }, "PATCH"));
        expect(off.status, await off.clone().text()).toBe(200);
        session.user = BUILDER;
      };
    }

    it("is not undone by a form that showed the row active: the save is refused with 409", async () => {
      const id = await writingDevConnection(`${RUN}-j`);
      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      deactivateDuringStepUp(id);

      const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-j`, { password: "rotated" }), LIVE_WRITING)));
      expect(gap.afterRowRead).toBeNull();
      expect(res.status, await res.clone().text()).toBe(409);
      const message = ((await res.json()) as { error: { message: string } }).error.message;
      expect(message).toMatch(/deactivated/i);
      expect(message).toContain("Incident Operator");

      expect(await row(id)).toMatchObject({ isActive: false, writeEnabled: true });
      // The last word in the trail is the operator's toggle, not a save over it.
      expect((await lastAudit(id, "UPDATE"))?.after).toMatchObject({ event: "connection_toggled", isActive: false });
    });

    it("is judged on the row it overwrites for an API caller: reactivated, writes enabled, said and recorded", async () => {
      const id = await writingDevConnection(`${RUN}-k`);
      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      deactivateDuringStepUp(id);

      // No `expected`: an API caller is not refused, but is told what the save did.
      const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-k`, { password: "rotated" }))));
      expect(res.status, await res.clone().text()).toBe(200);
      const { data } = (await res.json()) as { data: { reactivated?: boolean; reactivatedNotice?: string } };
      expect(data.reactivated).toBe(true);
      expect(data.reactivatedNotice).toMatch(/with writes on/);

      expect((await lastAudit(id, "UPDATE"))?.after).toMatchObject({
        event: "connection_replaced",
        isActiveBefore: false,
        reactivated: true,
        writesEnabled: true,
      });
      /*
       * ONE warn-mode record, for what the save did (review round 4). The
       * first judgement — a secret save over the row as it had been — was
       * never written, and recording it left a governance action in the
       * trail that did not happen.
       */
      const missing = await prisma.configAudit.findMany({
        where: { organizationId: ORG, entityType: "Connection", entityId: id, action: "STEP_UP_MISSING" },
        select: { after: true },
      });
      expect(missing.map((m) => (m.after as { governanceAction: string }).governanceAction)).toEqual([
        "connection.enable_writes",
      ]);
    });

    it("a real concurrent Deactivate and form save always leave the connection deactivated", async () => {
      for (let i = 0; i < 8; i += 1) {
        const key = `${RUN}-race${i}`;
        const id = await writingDevConnection(key);
        vi.stubEnv("COREEDGE_STEP_UP", "warn");
        session.user = BUILDER;
        const [save, off] = await Promise.all([
          saveConnection(req(connectionSaveBody(form(key, { password: "rotated" }), LIVE_WRITING))),
          patchConnection(req({ id, isActive: false }, "PATCH")),
        ]);
        expect(off.status).toBe(200);
        // The save either landed first (and the Deactivate after it), or was refused.
        expect([200, 409]).toContain(save.status);
        expect(await row(id)).toMatchObject({ isActive: false });
      }
    });
  });

  /*
   * DEFECT 5: PATCH JUDGED ITS GATES ON A ROW IT DID NOT WRITE (review round
   * 4). It read the row, decided whether the toggle turned writes on (the
   * passkey) and whether it enabled writes without the secret (refused), and
   * then updated by id whatever had happened since. A builder with no passkey
   * whose PATCH {isActive: true} read the row while it was still active and
   * writing undid an operator's Deactivate landing after that read — no
   * passkey asked, writes live again.
   */
  describe("a toggle landing while another toggle is in flight (review round 4)", () => {
    /** The operator's change, run in the gap between the builder's read and its update. */
    function operatorAfterRead(id: string, change: Record<string, boolean>) {
      gap.afterRowRead = async () => {
        session.user = OPERATOR;
        const res = await patchConnection(req({ id, ...change }, "PATCH"));
        expect(res.status, await res.clone().text()).toBe(200);
        session.user = BUILDER;
      };
    }

    it("a stale Activate does not undo a Deactivate: judged again, it needs the passkey", async () => {
      const id = await writingDevConnection(`${RUN}-pa`);
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      operatorAfterRead(id, { isActive: false });

      // The builder has no passkey. Its read saw the row active and writing.
      session.user = BUILDER;
      const res = await patchConnection(req({ id, isActive: true }, "PATCH"));
      expect(gap.afterRowRead).toBeNull();
      expect(await stepUpAction(res)).toBe("connection.enable_writes");
      expect(await row(id)).toMatchObject({ isActive: false, writeEnabled: true });
      expect((await lastAudit(id, "UPDATE"))?.after).toMatchObject({ event: "connection_toggled", isActive: false });
    });

    it("a stale request cannot switch writes back on through the toggle", async () => {
      const id = await writingDevConnection(`${RUN}-pw`);
      vi.stubEnv("COREEDGE_STEP_UP", "enforce");
      operatorAfterRead(id, { writeEnabled: false });

      session.user = BUILDER;
      const res = await patchConnection(req({ id, isActive: true, writeEnabled: true }, "PATCH"));
      expect(res.status, await res.clone().text()).toBe(400);
      expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/switched on by saving the connection/);
      expect(await row(id)).toMatchObject({ isActive: true, writeEnabled: false });
    });

    it("records one warn-mode admission, for the toggle it made", async () => {
      const id = await writingDevConnection(`${RUN}-pk`);
      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      operatorAfterRead(id, { isActive: false });

      session.user = BUILDER;
      const res = await patchConnection(req({ id, isActive: true }, "PATCH"));
      expect(res.status, await res.clone().text()).toBe(200);
      expect(await row(id)).toMatchObject({ isActive: true, writeEnabled: true });
      const missing = await prisma.configAudit.findMany({
        where: { organizationId: ORG, entityType: "Connection", entityId: id, action: "STEP_UP_MISSING" },
        select: { after: true },
      });
      expect(missing.map((m) => (m.after as { governanceAction: string }).governanceAction)).toEqual([
        "connection.enable_writes",
      ]);
    });

    it("a builder without a passkey hammering Activate never undoes a concurrent Deactivate", async () => {
      for (let i = 0; i < 8; i += 1) {
        const id = await writingDevConnection(`${RUN}-prace${i}`);
        vi.stubEnv("COREEDGE_STEP_UP", "enforce");
        // The session is read when each request starts.
        session.user = BUILDER;
        const activations = Array.from({ length: 10 }, () => patchConnection(req({ id, isActive: true }, "PATCH")));
        await new Promise((resolve) => setTimeout(resolve, 2));
        session.user = OPERATOR;
        const off = patchConnection(req({ id, isActive: false }, "PATCH"));
        const settled = await Promise.all([...activations, off]);
        expect(settled.at(-1)?.status).toBe(200);
        for (const res of settled.slice(0, -1)) expect([200, 403]).toContain(res.status);
        expect(await row(id)).toMatchObject({ isActive: false, writeEnabled: true });
      }
    });
  });

  describe("a form opened before the row changed", () => {
    it("is refused with 409, naming who changed it, instead of reactivating the connection with its writes", async () => {
      const id = await writingDevConnection(`${RUN}-e`);
      // The operator deactivates it during an incident.
      session.user = OPERATOR;
      const off = await patchConnection(req({ id, isActive: false }, "PATCH"));
      expect(off.status, await off.clone().text()).toBe(200);

      // The builder's form still shows it active and writing.
      session.user = BUILDER;
      vi.stubEnv("COREEDGE_STEP_UP", "warn");
      const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-e`, { password: "rotated" }), LIVE_WRITING)));
      expect(res.status).toBe(409);
      const message = ((await res.json()) as { error: { message: string } }).error.message;
      expect(message).toMatch(/deactivated/i);
      expect(message).toContain("Incident Operator");
      expect(message).toMatch(/reload/i);

      expect(await row(id)).toMatchObject({ isActive: false, writeEnabled: true });
    });

    it("is refused when the form believed the key was new and someone saved it meanwhile", async () => {
      await writingDevConnection(`${RUN}-f`);
      const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-f`, { allowWrites: false }), null)));
      expect(res.status).toBe(409);
    });

    it("a form that saw the row as it is goes through", async () => {
      const id = await writingDevConnection(`${RUN}-g`);
      const off = await patchConnection(req({ id, isActive: false }, "PATCH"));
      expect(off.status).toBe(200);

      // Reloaded: the form shows it deactivated, Allow writes unticked.
      const res = await saveConnection(
        req(connectionSaveBody(form(`${RUN}-g`, { allowWrites: false }), { isActive: false, writeEnabled: true })),
      );
      expect(res.status, await res.clone().text()).toBe(200);
    });
  });

  describe("a save that reactivates a connection says so", () => {
    it("in its response and its audit row", async () => {
      const id = await writingDevConnection(`${RUN}-h`);
      const off = await patchConnection(req({ id, isActive: false }, "PATCH"));
      expect(off.status).toBe(200);

      // An API caller sends no `expected`: not refused, but told.
      const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-h`, { allowWrites: false }))));
      expect(res.status, await res.clone().text()).toBe(200);
      const { data } = (await res.json()) as { data: { reactivated?: boolean; reactivatedNotice?: string } };
      expect(data.reactivated).toBe(true);
      expect(data.reactivatedNotice).toMatch(/active again/i);
      expect((await lastAudit(id, "UPDATE"))?.after).toMatchObject({ reactivated: true, isActiveBefore: false });
    });

    it("and a save of an active row does not", async () => {
      await writingDevConnection(`${RUN}-i`);
      const res = await saveConnection(req(connectionSaveBody(form(`${RUN}-i`), LIVE_WRITING)));
      expect(res.status, await res.clone().text()).toBe(200);
      const { data } = (await res.json()) as { data: Record<string, unknown> };
      expect(data).not.toHaveProperty("reactivated");
    });
  });
});
