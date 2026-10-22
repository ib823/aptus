// @vitest-environment node
/**
 * Probe before swap on the connection save path (P0.14), as settled in wave 2
 * final review round 3: COREEDGE_ROTATION_PROBE = observe (default) | enforce | off.
 *
 * Through the real Connections route (POST /api/studio/connections) against
 * real PostgreSQL, SAP stood in for by `fetch`. Every scenario of the eight
 * review findings that would not converge, under observe AND enforce:
 *
 *   - a correct secret always saves: from the form and from the API, on a
 *     slow tenant, at SuccessFactors' slow default service, with a custom
 *     probe path, on ECC, over a stored row that will not open, over a stale OK;
 *   - a mistyped secret: under observe it saves, with the warning and a
 *     truthful audit row; under enforce it is refused only when SAP refused
 *     the sign-in (the P0.14 acceptance: it never replaces a working one);
 *   - no audit row claims a probe that did not reach SAP.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { prisma } from "@/lib/db/prisma";
import { POST as testConnection } from "@/app/api/studio/connections/[id]/test/route";
import { POST as saveConnection } from "@/app/api/studio/connections/route";
import { resolveSapConnection } from "@/lib/sap-public/connection-resolver";
import { connectionSaveBody, storedFormSettings } from "@/lib/studio/connection-form";

const RUN = `p014r-${randomUUID().slice(0, 8)}`;
const KEY = "c".repeat(64);

const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

/**
 * The SAP system. It accepts one password; it releases the $metadata of the
 * services in `released` only (403 elsewhere, after the sign-in, as S/4HANA
 * Cloud answers a service outside the arrangement); it may be down (503),
 * slow (`delayMs` before any answer) or silent at one path (`silentAt`).
 */
const sap = {
  password: "Old-Password-1",
  released: null as string[] | null,
  down: false,
  delayMs: 0,
  silentAt: null as string | null,
};

function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

const fakeSap = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const href = String(url);
  if (sap.silentAt && href.includes(sap.silentAt)) {
    await wait(10 * 60_000, init?.signal);
  }
  if (sap.delayMs > 0) await wait(sap.delayMs, init?.signal);
  if (sap.down) return new Response("", { status: 503 });
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  if (auth !== `Basic ${Buffer.from(`COMM_USER:${sap.password}`).toString("base64")}`) return new Response("", { status: 401 });
  if (sap.released && !sap.released.some((path) => href.includes(`${path}/$metadata`))) return new Response("", { status: 403 });
  return new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } });
});

type Product = "s4hana" | "successfactors" | "ecc";
const BASE_URL: Record<Product, string> = {
  s4hana: "https://my000001-api.s4hana.cloud.sap",
  successfactors: "https://api17.sapsf.com",
  ecc: "https://ecc.example.com",
};

interface Fixture {
  readonly org: string;
  readonly key: string;
  readonly product: Product;
}

let n = 0;
/** A fresh organization and builder, so each scenario has the one active DEV connection of its product. */
async function fixture(product: Product): Promise<Fixture> {
  n += 1;
  const org = `${RUN}-o${n}`;
  const user = { id: `${RUN}-u${n}`, email: `${RUN}-u${n}@abeam.com`, name: "Dev", role: "consultant", organizationId: org, authMethod: "session" };
  await prisma.organization.create({ data: { id: org, name: `Rotation ${n}`, type: "client" } });
  await prisma.user.create({ data: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: org } });
  session.user = user;
  return { org, key: `${RUN}-k${n}`, product };
}

/** A save as an API caller sends it: what is not sent is cleared (the API's semantics, unchanged). */
function apiSave(f: Fixture, password: string, extra: Record<string, unknown> = {}) {
  return post({
    product: f.product,
    key: f.key,
    label: `${f.product} DEV`,
    baseUrl: BASE_URL[f.product],
    authType: "basic",
    username: "COMM_USER",
    password,
    environment: "DEV",
    ...(f.product === "ecc" ? { client: "100" } : {}),
    ...extra,
  });
}

/** A re-save as the Connections form sends it: the stored settings loaded, the new password typed. */
async function formSave(f: Fixture, password: string) {
  const row = await prisma.sapConnection.findFirst({
    where: { organizationId: f.org, product: f.product, key: f.key },
    select: {
      label: true, baseUrl: true, authType: true, environment: true, client: true, oauthTokenUrl: true,
      apiPath: true, timeoutMs: true, isActive: true, writeEnabled: true,
    },
  });
  const stored = storedFormSettings(row);
  return post(
    connectionSaveBody(
      {
        ...stored,
        product: f.product,
        key: f.key,
        apiKey: "", apiKeyHeader: "apikey", username: "COMM_USER", password, bearerToken: "", clientId: "",
        clientSecret: "", companyId: "", samlAssertion: "", samlSigning: "key", samlPrivateKey: "", samlUserId: "",
        allowWrites: Boolean(row?.writeEnabled),
      },
      row ? { isActive: row.isActive, writeEnabled: row.writeEnabled } : null,
    ),
  );
}

function post(body: Record<string, unknown>) {
  return saveConnection(
    new NextRequest("http://localhost/api/studio/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const rowOf = (f: Fixture) =>
  prisma.sapConnection.findFirst({ where: { organizationId: f.org, product: f.product, key: f.key } });

/** The Test button: the stored secret is then working by the system's own record. */
async function prove(f: Fixture) {
  const row = await rowOf(f);
  const tested = await testConnection(new NextRequest("http://localhost/x", { method: "POST" }), {
    params: Promise.resolve({ id: row!.id }),
  });
  expect(((await tested.json()) as { data: { status: string } }).data.status).toBe("OK");
}

const storedPassword = async (f: Fixture) => (await resolveSapConnection(f.org, f.product, f.key))?.secrets.password;

/** The save's audit row (its rotationProbe), or a refused save's TEST_CONNECT row. */
async function lastAudit(f: Fixture, action: "UPDATE" | "TEST_CONNECT" = "UPDATE") {
  const row = await rowOf(f);
  const audit = await prisma.configAudit.findFirst({
    where: { organizationId: f.org, entityId: row!.id, action },
    orderBy: { at: "desc" },
    select: { after: true },
  });
  return (audit?.after ?? null) as Record<string, unknown> | null;
}

interface SaveData {
  data?: { rotationProbe?: { mode: string; ran: boolean; outcome: string; reason: string; warning: string | null } };
  error?: { message: string };
}

async function ok(res: Response): Promise<NonNullable<SaveData["data"]>> {
  const json = (await res.json()) as SaveData;
  expect(res.status, JSON.stringify(json)).toBe(200);
  return json.data!;
}

/** Whether any request reached SAP (the Test's own calls are cleared before the save). */
const metadataCalls = () => fakeSap.mock.calls.filter(([url]) => String(url).includes("$metadata"));

describe.skipIf(!process.env.TEST_DATABASE_URL)("probe before swap on the connection save path (P0.14)", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", fakeSap);
  });
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", KEY);
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubEnv("SAP_HOST_ALLOWLIST_EXTRA", "example.com");
    Object.assign(sap, { password: "Old-Password-1", released: null, down: false, delayMs: 0, silentAt: null });
    fakeSap.mockClear();
  });
  afterEach(() => {
    session.user = null;
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    const orgs = { organizationId: { startsWith: RUN } };
    await prisma.sapConnectionProbeEvent.deleteMany({ where: orgs });
    await prisma.configAudit.deleteMany({ where: orgs });
    await prisma.sapConnection.deleteMany({ where: orgs });
    await prisma.user.deleteMany({ where: { id: { startsWith: RUN } } });
    await prisma.organization.deleteMany({ where: { id: { startsWith: RUN } } });
  });

  describe.each(["observe", "enforce"] as const)("COREEDGE_ROTATION_PROBE=%s", (mode) => {
    beforeEach(() => {
      // observe is also the default: it is set explicitly here only to name the case.
      vi.stubEnv("COREEDGE_ROTATION_PROBE", mode);
    });

    /*
     * THE P0.14 ACCEPTANCE, and what observe does instead. Under enforce a
     * mistyped rotated secret never replaces a working one: SAP refused the
     * sign-in, so nothing is written and the broker still opens the working
     * password. Under observe it is saved, and the response, the form's
     * warning and the audit row all say SAP refused it.
     */
    it("a mistyped secret: refused under enforce only, and never claimed as proven", async () => {
      const f = await fixture("s4hana");
      await ok(await apiSave(f, "Old-Password-1"));
      await prove(f);
      const before = (await rowOf(f))!.secretsCiphertext;
      sap.password = "New-Password-2";

      const res = await formSave(f, "New-Pasword-2");
      if (mode === "enforce") {
        expect(res.status).toBe(400);
        const body = (await res.json()) as SaveData;
        expect(body.error!.message).toContain("SAP refused the new password");
        expect(body.error!.message).toContain("nothing was changed");
        expect(body.error!.message).not.toContain("New-Pasword-2");
        expect((await rowOf(f))!.secretsCiphertext).toBe(before);
        expect(await storedPassword(f)).toBe("Old-Password-1");
        const refused = await lastAudit(f, "TEST_CONNECT");
        expect(refused).toMatchObject({
          event: "connection_rotation_refused",
          rotationProbe: { mode: "enforce", ran: true, outcome: "rejected", reason: "sap_http_401" },
        });
        expect(JSON.stringify(refused)).not.toContain("New-Pasword-2");
      } else {
        const data = await ok(res);
        expect(data.rotationProbe).toMatchObject({ mode: "observe", ran: true, outcome: "rejected", reason: "sap_http_401" });
        expect(data.rotationProbe!.warning).toContain(
          "SAP refused the new password; calls through this connection will fail until it is corrected",
        );
        expect(await storedPassword(f)).toBe("New-Pasword-2");
        const saved = await lastAudit(f);
        expect(saved).toMatchObject({ rotationProbe: { mode: "observe", ran: true, outcome: "rejected" } });
        expect(saved).not.toHaveProperty("rotationProbed");
      }

      // The right new password then saves, in either mode. Under enforce the
      // refused attempt changed nothing, so the working record stands and it
      // is probed and passes; under observe the typo's save cleared it.
      const right = await ok(await formSave(f, "New-Password-2"));
      expect(await storedPassword(f)).toBe("New-Password-2");
      if (mode === "enforce") expect(right.rotationProbe).toMatchObject({ ran: true, outcome: "passed", warning: null });
    });

    /*
     * Wave 2 final review round 1 (high). The connection is proven at a
     * custom service; the product's default service is not in the
     * arrangement (403). The form now sends the stored probe path back, and
     * an API caller that leaves it out is probed at the stored one.
     */
    it("a correct secret with a custom probe path saves, from the form and from the API", async () => {
      const f = await fixture("s4hana");
      sap.released = ["/sap/opu/odata/sap/ZCUSTOM_SRV"];
      await ok(await apiSave(f, "Old-Password-1", { apiPath: "/sap/opu/odata/sap/ZCUSTOM_SRV", timeoutMs: 20_000 }));
      await prove(f);

      sap.password = "New-Password-2";
      const fromForm = await ok(await formSave(f, "New-Password-2"));
      expect(fromForm.rotationProbe).toMatchObject({ ran: true, outcome: "passed" });
      // The form kept the stored settings.
      expect(await rowOf(f)).toMatchObject({ apiPath: "/sap/opu/odata/sap/ZCUSTOM_SRV", timeoutMs: 20_000 });
      expect(await storedPassword(f)).toBe("New-Password-2");

      await prove(f);
      sap.password = "New-Password-3";
      fakeSap.mockClear();
      const fromApi = await ok(await apiSave(f, "New-Password-3"));
      expect(fromApi.rotationProbe).toMatchObject({ ran: true, outcome: "passed" });
      expect(String(metadataCalls()[0]![0])).toContain("/sap/opu/odata/sap/ZCUSTOM_SRV/$metadata");
      expect(await storedPassword(f)).toBe("New-Password-3");
      // The API's semantics are unchanged: what it leaves out is cleared.
      expect(await rowOf(f)).toMatchObject({ apiPath: null, timeoutMs: null });

      // A save that moves the probe path to a service the arrangement does not
      // release gets SAP's 403 after an accepted sign-in: no verdict, saved.
      // (Working by the record: its last probe was OK.)
      await prisma.sapConnection.updateMany({ where: { organizationId: f.org, key: f.key }, data: { lastValidationStatus: "OK" } });
      sap.password = "New-Password-4";
      const moved = await ok(await apiSave(f, "New-Password-4", { apiPath: "/sap/opu/odata/sap/API_NOT_RELEASED" }));
      expect(moved.rotationProbe).toMatchObject({ ran: true, outcome: "noAnswer", reason: "sap_http_403" });
      expect(await storedPassword(f)).toBe("New-Password-4");
    });

    /*
     * Wave 2 final review round 3. A slow tenant saved with Timeout 30000:
     * probed with the form's blank timeout (10 s), every correct re-save timed
     * out and was refused. The form now sends the stored timeout; SAP answers
     * in 10.5 s, within it.
     */
    it("a correct secret on a slow tenant saves, probed with the stored timeout", async () => {
      const f = await fixture("s4hana");
      await ok(await apiSave(f, "Old-Password-1", { timeoutMs: 30_000 }));
      await prove(f);
      sap.password = "New-Password-2";
      sap.delayMs = 10_500;
      const data = await ok(await formSave(f, "New-Password-2"));
      expect(data.rotationProbe).toMatchObject({ ran: true, outcome: "passed" });
      expect(await storedPassword(f)).toBe("New-Password-2");
      expect((await rowOf(f))!.timeoutMs).toBe(30_000);
    }, 60_000);

    /*
     * Wave 2 final review round 3. SuccessFactors' default probe path is the
     * whole /odata/v2 API, whose $metadata a large tenant does not serve in
     * time. No answer is not a refusal: saved, with the warning that it could
     * not be checked, and audited as noAnswer.
     */
    it("a correct secret at SuccessFactors' slow default service saves, said to be unchecked", async () => {
      const f = await fixture("successfactors");
      await ok(await apiSave(f, "Old-Password-1", { timeoutMs: 1_000 }));
      await prove(f);
      sap.password = "New-Password-2";
      sap.silentAt = "/odata/v2/$metadata";
      const data = await ok(await formSave(f, "New-Password-2"));
      expect(String(metadataCalls().at(-1)![0])).toContain("/odata/v2/$metadata");
      expect(data.rotationProbe).toMatchObject({ ran: true, outcome: "noAnswer", reason: "sap_timeout" });
      expect(data.rotationProbe!.warning).toContain("could not be checked");
      expect(await storedPassword(f)).toBe("New-Password-2");
      expect(await lastAudit(f)).toMatchObject({ rotationProbe: { mode, ran: true, outcome: "noAnswer" } });
    }, 30_000);

    it("SAP down (503): a correct or a mistyped secret saves, said to be unchecked", async () => {
      const f = await fixture("s4hana");
      await ok(await apiSave(f, "Old-Password-1"));
      await prove(f);
      sap.down = true;
      const data = await ok(await formSave(f, "Typo-Password"));
      expect(data.rotationProbe).toMatchObject({ ran: true, outcome: "noAnswer", reason: "sap_http_503" });
      expect(await storedPassword(f)).toBe("Typo-Password");
    });

    /*
     * ECC (no default service). Round 3 (high): with no probe path anywhere
     * no request can be made; it was saved as `rotationProbed: true`. Now it
     * is skipped, and says so. With a stored probe path it is probed there,
     * from the form, like any other.
     */
    it("ECC: probed at its stored path from the form; with no path anywhere, skipped and never claimed", async () => {
      const f = await fixture("ecc");
      await ok(await apiSave(f, "Old-Password-1", { apiPath: "/sap/opu/odata/sap/ZECC_SRV" }));
      await prove(f);
      sap.password = "New-Password-2";
      expect((await ok(await formSave(f, "New-Password-2"))).rotationProbe).toMatchObject({ ran: true, outcome: "passed" });

      // The path gone (a row re-saved before the form kept it), its OK kept.
      await prove(f);
      await prisma.sapConnection.updateMany({ where: { organizationId: f.org, key: f.key }, data: { apiPath: null } });
      sap.password = "New-Password-3";
      fakeSap.mockClear();
      const typo = await ok(await formSave(f, "New-Pasword-3"));
      expect(fakeSap).not.toHaveBeenCalled();
      expect(typo.rotationProbe).toMatchObject({ ran: false, outcome: "skipped", reason: "no_probe_path" });
      expect(typo.rotationProbe!.warning).toContain("could not be checked");
      const audit = await lastAudit(f);
      expect(audit).toMatchObject({ rotationProbe: { mode, ran: false, outcome: "skipped", reason: "no_probe_path" } });
      expect(audit).not.toHaveProperty("rotationProbed");
    });

    /*
     * Wave 2 final review round 2. A stored row whose secret will not open
     * (a keyring mix-up, a restore) cannot be serving: the broker cannot
     * open it either. A correct secret saves; a mistyped one is said to be
     * refused, and saved even under enforce.
     */
    it("a stored row that will not open: a correct secret saves; nothing is refused", async () => {
      const f = await fixture("s4hana");
      await ok(await apiSave(f, "Old-Password-1"));
      await prove(f);
      vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "d".repeat(64));
      await expect(resolveSapConnection(f.org, f.product, f.key)).rejects.toThrow();
      sap.password = "New-Password-2";
      const typo = await ok(await formSave(f, "New-Pasword-2"));
      expect(typo.rotationProbe).toMatchObject({ ran: true, outcome: "rejected" });
      await prisma.sapConnection.updateMany({ where: { organizationId: f.org, key: f.key }, data: { lastValidationStatus: "OK" } });
      const right = await ok(await formSave(f, "New-Password-2"));
      expect(right.rotationProbe).toMatchObject({ ran: true, outcome: "passed" });
      expect(await storedPassword(f)).toBe("New-Password-2");
    });

    /*
     * Wave 2 final review round 2. An OK observed before the last save (the
     * code before wave 2 never cleared it), from settings the row no longer
     * has. A correct secret saves: SAP accepts it wherever it is probed.
     */
    it("a stale OK: a correct secret saves", async () => {
      const f = await fixture("s4hana");
      sap.released = ["/sap/opu/odata/sap/ZCUSTOM_SRV"];
      await ok(await apiSave(f, "Old-Password-1"));
      await prisma.sapConnection.updateMany({
        where: { organizationId: f.org, key: f.key },
        data: { lastValidationStatus: "OK", lastValidatedAt: new Date("2026-01-01T00:00:00Z") },
      });
      sap.password = "New-Password-2";
      const data = await ok(await formSave(f, "New-Password-2"));
      // The default service is not released: a 403 after the sign-in, which is no refusal.
      expect(data.rotationProbe).toMatchObject({ ran: true, outcome: "noAnswer", reason: "sap_http_403" });
      expect(await storedPassword(f)).toBe("New-Password-2");
    });

    it("a save that keeps the credentials, a new connection and one SAP last refused send nothing", async () => {
      const f = await fixture("s4hana");
      fakeSap.mockClear();
      const created = await ok(await apiSave(f, "Old-Password-1"));
      expect(created.rotationProbe).toMatchObject({ ran: false, outcome: "skipped", reason: "new_connection", warning: null });
      await prove(f);
      fakeSap.mockClear();
      sap.down = true;
      const kept = await ok(await formSave(f, "Old-Password-1"));
      expect(kept.rotationProbe).toMatchObject({ ran: false, outcome: "skipped", reason: "credentials_unchanged" });
      expect(fakeSap).not.toHaveBeenCalled();

      await prisma.sapConnection.updateMany({ where: { organizationId: f.org, key: f.key }, data: { lastValidationStatus: "UNAUTHORIZED" } });
      const refusedBefore = await ok(await formSave(f, "Anything-1"));
      expect(refusedBefore.rotationProbe).toMatchObject({ ran: false, outcome: "skipped", reason: "last_probe_refused" });
      expect(fakeSap).not.toHaveBeenCalled();
      expect(await storedPassword(f)).toBe("Anything-1");
    });
  });

  it("COREEDGE_ROTATION_PROBE=off: no probe, and the audit row says so", async () => {
    vi.stubEnv("COREEDGE_ROTATION_PROBE", "off");
    const f = await fixture("s4hana");
    await ok(await apiSave(f, "Old-Password-1"));
    await prove(f);
    fakeSap.mockClear();
    const data = await ok(await formSave(f, "Typo"));
    expect(fakeSap).not.toHaveBeenCalled();
    expect(data.rotationProbe).toMatchObject({ mode: "off", ran: false, outcome: "skipped", reason: "probe_off" });
    expect(await storedPassword(f)).toBe("Typo");
  });

  it("an unrecognised value observes: a typo is saved, never refused", async () => {
    vi.stubEnv("COREEDGE_ROTATION_PROBE", "enforced");
    const f = await fixture("s4hana");
    await ok(await apiSave(f, "Old-Password-1"));
    await prove(f);
    const data = await ok(await formSave(f, "Typo"));
    expect(data.rotationProbe).toMatchObject({ mode: "observe", ran: true, outcome: "rejected" });
  });
});
