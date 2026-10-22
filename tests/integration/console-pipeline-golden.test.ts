// @vitest-environment node
/**
 * P0.14b: the Workbench console on the governed pipeline. Golden audit rows
 * for every console route, BEFORE and AFTER the port.
 *
 * WHAT IS RECORDED. For every scenario below, through the shipped route: the
 * HTTP status, the error code (or "ok"), the sentence the caller was given,
 * every NorthboundAuditEvent row the call wrote (the organization's console
 * trail, `dryRun: true`), every PlatformAuditEvent row with its outcome (the
 * write-back's trail, P0.7) and every PlatformConsoleRead row (the console's
 * platform-scope trail), with the fields that change on every call
 * removed (`id`, `at`, `correlationId`, `durationMs`, `eventId`) and
 * run-specific ids replaced by names.
 *
 * TWO FILES, AND WHAT EACH PROVES.
 *   - tests/fixtures/console-pipeline/golden-before.json was recorded by this
 *     test against the routes before P0.14b (commit c6c40001, with
 *     CONSOLE_GOLDEN_UPDATE=before) and is never rewritten.
 *   - tests/fixtures/console-pipeline/golden-after.json is what the ported
 *     routes answer (CONSOLE_GOLDEN_UPDATE=after); a difference from it is a
 *     behaviour change.
 * The test checks the routes against `after`, and checks `after` against
 * `before`: every answer, every organization row and every write-back row is
 * the same; the ONLY difference allowed is the platform-scope row each console
 * call now adds (`consoleReads`, principal "console"). It is a
 * PlatformConsoleRead, never a PlatformAuditEvent: the code before P0.14b
 * reads every row of that table as a Workbench write, so a rollback would
 * have listed each console read as one (integration review round 4).
 *
 * WHAT IS REAL: every route, the role gates, the console ceilings, the
 * connection resolver and sealing, the Workbench connector, the audit inserts,
 * the tenant guard in throw mode, and PostgreSQL. WHAT IS STOOD IN: the
 * session, SAP and Ariba themselves (`fetch`), and the probe-all candidate
 * query, narrowed to this run's catalogue rows so a test running beside it
 * cannot change the count.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as DynamicCatalog from "@/lib/sap-public/dynamic-catalog";

const RUN_TAG = `P014B${randomUUID().slice(0, 6).toUpperCase()}`;

const h = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  /** "429"/"400": SAP refuses everything (in OData's JSON); "data503": $metadata answers, every data read is a 503. */
  sap: "ok" as "ok" | "500" | "401" | "429" | "400" | "data503",
  runTag: "",
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/sap-public/dynamic-catalog", async (importOriginal) => {
  const real = await importOriginal<typeof DynamicCatalog>();
  return {
    ...real,
    // Only this run's rows: the count probe-all audits must not depend on
    // what another test has put in the shared catalogue table.
    probeAllCandidateWhere: (...args: Parameters<typeof real.probeAllCandidateWhere>) => ({
      AND: [real.probeAllCandidateWhere(...args), { externalId: { contains: h.runTag } }],
    }),
  };
});

import { prisma } from "@/lib/db/prisma";
import { GET as previewRoute } from "@/app/api/sap/tdd/preview/route";
import { GET as entitiesRoute } from "@/app/api/sap/tdd/entities/route";
import { GET as operationsRoute } from "@/app/api/sap/tdd/operations/route";
import { GET as capabilitiesRoute } from "@/app/api/sap/tdd/capabilities/route";
import { GET as hubListRoute } from "@/app/api/sap/tdd/hub-content/route";
import { GET as hubItemRoute } from "@/app/api/sap/tdd/hub-content/[id]/route";
import { POST as probeAllRoute } from "@/app/api/sap/tdd/hub-content/probe-all/route";
import { POST as writeTestRoute } from "@/app/api/sap/tdd/hub-content/write-test/route";
import { POST as writeRoute } from "@/app/api/sap/tdd/write/route";
import { GET as aribaCallRoute } from "@/app/api/sap/ariba/call/route";
import { lookupCorrelationId } from "@/lib/coreedge/correlation-lookup";
import { forgetRecordedJourneyMilestones } from "@/lib/coreedge/journey";
import {
  __setGovernedCircuitStore,
  circuitKeyForConnection,
  circuitKeyForConsoleRead,
  governedCircuitBreaker,
} from "@/lib/governed/containment";
import { FAILURE_THRESHOLD, MemoryCircuitStore } from "@/lib/northbound/circuit-breaker";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";

const GOLDEN_DIR = join(process.cwd(), "tests/fixtures/console-pipeline");
const BEFORE = join(GOLDEN_DIR, "golden-before.json");
const AFTER = join(GOLDEN_DIR, "golden-after.json");
const UPDATE = process.env.CONSOLE_GOLDEN_UPDATE; // "before" | "after" | undefined

const RUN = `p014b-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 24 * 60 * 60 * 1000;

/** Run-specific strings -> stable names, so the golden files hold no random ids. */
const names = new Map<string, string>([
  [ORG, "<org>"],
  [RUN, "<run>"],
  [RUN_TAG, "<tag>"],
]);
const name = (id: string, label: string) => {
  names.set(id, `<${label}>`);
  return id;
};

const users = {
  dev: { id: `${RUN}-user-dev`, email: `${RUN}-user-dev@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG, authMethod: "session", mfaVerified: true },
  sandbox: {
    id: `${RUN}-user-sandbox`,
    email: `${RUN}-user-sandbox@abeam.com`,
    name: "Sandbox developer",
    role: "sandbox_developer",
    organizationId: ORG,
    authMethod: "session",
    mfaVerified: true,
  },
  // A platform admin with no organization: the deployment tenant's reader, and the write-back's writer.
  admin: {
    id: `${RUN}-user-admin`,
    email: `${RUN}-user-admin@abeam.com`,
    name: "Platform admin",
    role: "platform_admin",
    organizationId: null,
    authMethod: "session",
    mfaVerified: true,
  },
};
const USER_IDS = Object.values(users).map((u) => u.id);

const ENV_TENANT = `${RUN}-env`;
const UNLISTED_TENANT = `${RUN}-unlisted`;
const ENV_HOST = "https://my000002-api.s4hana.cloud.sap";
/** A deployment tenant on a host the stored-connection allow-list does not admit. */
const UNLISTED_HOST = "https://s4.landscape.example.net";
const WRITE_SECRET = "golden-write-secret";

const hub = { s4: "", sf: "" };

function edmx(): string {
  return (
    '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">' +
    '<edmx:DataServices><Schema xmlns="http://schemas.microsoft.com/ado/2008/09/edm" xmlns:sap="http://www.sap.com/Protocols/SAPData">' +
    '<EntityContainer Name="C">' +
    '<EntitySet Name="A_PurchaseOrder" EntityType="X.A_PurchaseOrderType" sap:creatable="true" sap:updatable="true" sap:deletable="true"/>' +
    "</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>"
  );
}

/** SAP and Ariba, as each scenario needs them to answer. */
async function fakeSap(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method ?? "GET").toUpperCase();
  if (url.includes("ariba.com")) {
    if (url.includes("oauth/token")) {
      return new Response(JSON.stringify({ access_token: "ariba-token" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ content: [{ EventId: "Doc1" }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (h.sap === "401") return new Response("no", { status: 401, headers: { "content-type": "text/plain" } });
  if (h.sap === "500") return new Response("boom", { status: 500, headers: { "content-type": "text/plain" } });
  if (h.sap === "429" || h.sap === "400") {
    const status = Number(h.sap);
    return new Response(JSON.stringify({ error: { code: String(status), message: { value: "refused" } } }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  if (h.sap === "data503" && !url.includes("$metadata")) {
    return new Response("unavailable", { status: 503, headers: { "content-type": "text/plain" } });
  }
  if (url.includes("$metadata")) {
    return new Response(edmx(), { status: 200, headers: { "content-type": "application/xml" } });
  }
  if (method === "GET" && new Headers(init?.headers).get("x-csrf-token") === "Fetch") {
    return new Response("{}", { status: 200, headers: { "x-csrf-token": "csrf-1", "content-type": "application/json" } });
  }
  if (method === "POST") {
    const origin = new URL(url).origin;
    return new Response(JSON.stringify({ d: { PurchaseOrder: "4500000009" } }), {
      status: 201,
      headers: {
        "content-type": "application/json",
        location: `${origin}/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder('4500000009')`,
      },
    });
  }
  if (method === "DELETE") return new Response(null, { status: 204 });
  return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

interface Observed {
  status: number;
  answer: string;
  message: string | null;
  /** The organization's console trail (NorthboundAuditEvent, dryRun). */
  audits: unknown[];
  /** The write-back's trail (PlatformAuditEvent + its outcome). */
  platform: unknown[];
  /** The console's platform-scope trail (PlatformConsoleRead). Absent from the "before" file: P0.14b added it. */
  consoleReads?: unknown[];
}

const STRIPPED = new Set(["id", "at", "correlationId", "durationMs", "eventId"]);

/** Replace every run-specific string with its name, at any depth; drop the volatile fields. */
function anonymise(value: unknown): unknown {
  if (typeof value === "string") {
    let s = value;
    for (const [raw, label] of [...names.entries()].sort((a, b) => b[0].length - a[0].length)) {
      if (s.includes(raw)) s = s.split(raw).join(label);
    }
    return s;
  }
  if (Array.isArray(value)) return value.map(anonymise);
  if (value instanceof Date) return "<date>";
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !STRIPPED.has(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, anonymise(v)]),
    );
  }
  return value;
}

const seenNorthbound = new Set<string>();
const seenPlatform = new Set<string>();
const seenConsole = new Set<string>();

async function newRows(): Promise<{ audits: unknown[]; platform: unknown[]; consoleReads: unknown[] }> {
  const nb = await prisma.northboundAuditEvent.findMany({
    where: { organizationId: { in: [ORG, "-deployment-"] }, actorUserId: { in: USER_IDS } },
    orderBy: [{ at: "asc" }, { externalId: "asc" }],
  });
  const audits = nb.filter((r) => !seenNorthbound.has(r.id));
  for (const r of audits) seenNorthbound.add(r.id);
  const pl = await prisma.platformAuditEvent.findMany({
    where: { actorUserId: { in: USER_IDS } },
    include: { result: true },
    orderBy: [{ at: "asc" }, { serviceKey: "asc" }],
  });
  const platform = pl.filter((r) => !seenPlatform.has(r.id));
  for (const r of platform) seenPlatform.add(r.id);
  const cr = await prisma.platformConsoleRead.findMany({
    where: { actorUserId: { in: USER_IDS } },
    orderBy: [{ at: "asc" }, { serviceKey: "asc" }],
  });
  const consoleReads = cr.filter((r) => !seenConsole.has(r.id));
  for (const r of consoleReads) seenConsole.add(r.id);
  return { audits: audits.map(anonymise), platform: platform.map(anonymise), consoleReads: consoleReads.map(anonymise) };
}

async function observe(res: Response): Promise<Observed> {
  const json = (await res.json()) as { error?: { code: string; message: string } };
  return {
    status: res.status,
    answer: json.error?.code ?? "ok",
    message: json.error?.message ? (anonymise(json.error.message) as string) : null,
    ...(await newRows()),
  };
}

const get = (route: (r: NextRequest) => Promise<Response>, path: string) => route(new NextRequest(`http://localhost${path}`));
const post = (route: (r: NextRequest) => Promise<Response>, path: string, body: unknown) =>
  route(
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const preview = (q: string) => get(previewRoute, `/api/sap/tdd/preview?${q}`);
const entities = (q: string) => get(entitiesRoute, `/api/sap/tdd/entities?${q}`);
const operations = (q: string) => get(operationsRoute, `/api/sap/tdd/operations?${q}`);
const capabilities = (q: string) => get(capabilitiesRoute, `/api/sap/tdd/capabilities?${q}`);
const hubList = (q: string) => get(hubListRoute, `/api/sap/tdd/hub-content?${q}`);
const hubItem = (id: string, q: string) =>
  hubItemRoute(new NextRequest(`http://localhost/api/sap/tdd/hub-content/${id}?${q}`), { params: Promise.resolve({ id }) });
const probeAll = (body: Record<string, unknown>) =>
  post(probeAllRoute, "/api/sap/tdd/hub-content/probe-all", { confirmation: "PROBE ALL SAP SERVICES", ...body });
const write = () =>
  post(writeRoute, "/api/sap/tdd/write", {
    product: "s4hana",
    tenant: ENV_TENANT,
    service: "purchase-orders",
    entity: "A_PurchaseOrder",
    payload: { CompanyCode: "1010", PurchaseOrderType: "NB" },
    confirmation: "WRITE TO SAP TDD",
    writeSecret: WRITE_SECRET,
  });
const writeTest = () =>
  post(writeTestRoute, "/api/sap/tdd/hub-content/write-test", {
    product: "s4hana",
    tenant: ENV_TENANT,
    service: "purchase-orders",
    entity: "A_PurchaseOrder",
    payload: { CompanyCode: "1010" },
    confirmation: "WRITE TO SAP TDD",
    writeSecret: WRITE_SECRET,
  });
const ariba = (q: string) => get(aribaCallRoute, `/api/sap/ariba/call?${q}`);

const S4 = "product=s4hana";
const SF = "product=successfactors";
const PO = "service=purchase-orders&entity=A_PurchaseOrder";

/** Each scenario: who calls, how SAP answers, then the call. Order matters: rows accumulate. */
const SCENARIOS: readonly { name: string; user: keyof typeof users | null; sap?: typeof h.sap; call: () => Promise<Response> }[] = [
  // ── preview ─────────────────────────────────────────────────────────
  { name: "preview: DEV connection served", user: "dev", call: () => preview(`${S4}&tenant=${RUN}-dev&${PO}&limit=2`) },
  { name: "preview: deployment tenant, reader with an organization", user: "dev", call: () => preview(`${S4}&tenant=${ENV_TENANT}&${PO}`) },
  { name: "preview: deployment tenant, platform admin without one", user: "admin", call: () => preview(`${S4}&tenant=${ENV_TENANT}&${PO}`) },
  { name: "preview: deployment tenant on an unlisted host", user: "dev", call: () => preview(`${S4}&tenant=${UNLISTED_TENANT}&${PO}`) },
  { name: "preview: PROD connection without a grant", user: "dev", call: () => preview(`${S4}&tenant=${RUN}-prod&${PO}`) },
  { name: "preview: sandbox developer on a DEV connection", user: "sandbox", call: () => preview(`${S4}&tenant=${RUN}-dev&${PO}`) },
  { name: "preview: SAP 500", user: "dev", sap: "500", call: () => preview(`${S4}&tenant=${RUN}-dev&${PO}`) },
  // ── entities ────────────────────────────────────────────────────────
  { name: "entities: DEV connection metadata", user: "dev", call: () => entities(`${S4}&tenant=${RUN}-dev&service=purchase-orders&refresh=1`) },
  { name: "entities: DEV connection probe fan-out", user: "dev", call: () => entities(`${S4}&tenant=${RUN}-dev&service=purchase-orders&probe=1&refresh=1`) },
  { name: "entities: PROD connection without a grant", user: "dev", call: () => entities(`${S4}&tenant=${RUN}-prod&service=purchase-orders&refresh=1`) },
  { name: "entities: sandbox developer on the SANDBOX deployment tenant", user: "sandbox", call: () => entities(`${S4}&tenant=${ENV_TENANT}&service=purchase-orders&refresh=1`) },
  { name: "entities: SAP 401", user: "dev", sap: "401", call: () => entities(`${S4}&tenant=${RUN}-dev&service=purchase-orders&refresh=1`) },
  // ── operations ──────────────────────────────────────────────────────
  { name: "operations: DEV connection", user: "dev", call: () => operations(`${S4}&tenant=${RUN}-dev&refresh=1`) },
  { name: "operations: the default deployment tenant", user: "admin", call: () => operations(`${S4}&refresh=1`) },
  { name: "operations: PROD connection without a grant", user: "dev", call: () => operations(`${S4}&tenant=${RUN}-prod&refresh=1`) },
  // ── capabilities ────────────────────────────────────────────────────
  { name: "capabilities: SuccessFactors DEV connection", user: "dev", call: () => capabilities(`${SF}&tenant=${RUN}-sf-dev`) },
  { name: "capabilities: sandbox developer on a DEV connection", user: "sandbox", call: () => capabilities(`${SF}&tenant=${RUN}-sf-dev`) },
  { name: "capabilities: PROD connection without a grant", user: "dev", call: () => capabilities(`${S4}&tenant=${RUN}-prod`) },
  // ── hub-content list overlay ────────────────────────────────────────
  { name: "hub-content: live overlay on a DEV connection", user: "dev", call: () => hubList(`${SF}&tenant=${RUN}-sf-dev&dataProbe=1`) },
  { name: "hub-content: overlay refused on a PROD connection", user: "dev", call: () => hubList(`${S4}&tenant=${RUN}-prod&dataProbe=1&q=${RUN_TAG}`) },
  // ── hub-content detail ──────────────────────────────────────────────
  { name: "hub-content/[id]: live probe on a DEV connection", user: "dev", call: () => hubItem(hub.s4, `${S4}&tenant=${RUN}-dev`) },
  { name: "hub-content/[id]: PROD connection without a grant", user: "dev", call: () => hubItem(hub.s4, `${S4}&tenant=${RUN}-prod`) },
  { name: "hub-content/[id]: sandbox developer on the SANDBOX deployment tenant", user: "sandbox", call: () => hubItem(hub.s4, `${S4}&tenant=${ENV_TENANT}`) },
  // ── probe-all ───────────────────────────────────────────────────────
  { name: "probe-all: PROD connection without a grant", user: "dev", call: () => probeAll({ product: "s4hana", tenant: `${RUN}-prod` }) },
  { name: "probe-all: DEV connection", user: "dev", call: () => probeAll({ product: "s4hana", tenant: `${RUN}-dev` }) },
  { name: "probe-all: deployment tenant by a platform admin", user: "admin", call: () => probeAll({ product: "s4hana", tenant: ENV_TENANT }) },
  // ── Ariba ───────────────────────────────────────────────────────────
  { name: "ariba: a call to the configured realm", user: "dev", call: () => ariba("endpoint=sourcing-events&realm=myrealm-T&limit=2") },
  { name: "ariba: refused to a sandbox developer", user: "sandbox", call: () => ariba("endpoint=sourcing-events&realm=myrealm-T") },
  // ── the write-back (P0.7) ───────────────────────────────────────────
  { name: "write: the deployment tenant", user: "admin", call: () => write() },
  { name: "write: SAP 500", user: "admin", sap: "500", call: () => write() },
  { name: "write-test: the deployment tenant", user: "admin", call: () => writeTest() },
];

describe.skipIf(!process.env.TEST_DATABASE_URL)("the Workbench console on the governed pipeline (P0.14b)", () => {
  beforeAll(async () => {
    h.runTag = RUN_TAG;
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubEnv(
      "S4_TDD_TENANTS_JSON",
      JSON.stringify([
        { key: ENV_TENANT, label: "Env sandbox", baseUrl: ENV_HOST, environment: "SANDBOX" },
        { key: UNLISTED_TENANT, label: "Env unlisted", baseUrl: UNLISTED_HOST, environment: "DEV" },
      ]),
    );
    vi.stubEnv("S4_TDD_AUTH_TYPE", "basic");
    vi.stubEnv("S4_TDD_USERNAME", "ENV_USER");
    vi.stubEnv("S4_TDD_PASSWORD", "not-a-real-password");
    vi.stubEnv("S4_TDD_WRITE_ENABLED", "true");
    vi.stubEnv("S4_TDD_WRITE_SECRET", WRITE_SECRET);
    vi.stubEnv("S4_TDD_WRITE_TEST_ENABLED", "true");
    vi.stubEnv("S4_TDD_WRITE_TEST_ENTITYSETS", "A_PurchaseOrder");
    vi.stubEnv("ARIBA_BASE_URL", "https://openapi.ariba.com");
    vi.stubEnv("ARIBA_API_KEY", "ariba-key");
    vi.stubEnv("ARIBA_OAUTH_TOKEN_URL", "https://api.ariba.com/v2/oauth/token");
    vi.stubEnv("ARIBA_CLIENT_ID", "ariba-client");
    vi.stubEnv("ARIBA_CLIENT_SECRET", "ariba-secret");
    vi.stubEnv("ARIBA_REALM", "myrealm-T");
    vi.stubEnv("ARIBA_REALMS_JSON", "");
    vi.stubGlobal("fetch", vi.fn(fakeSap));
    forgetRecordedJourneyMilestones();

    await prisma.organization.create({ data: { id: ORG, name: "Console golden rows", type: "client" } });
    for (const u of Object.values(users)) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: u.organizationId } });
      names.set(u.id, `<user:${u.role}>`);
    }

    const connection = async (product: string, key: string, environment: "DEV" | "PROD", baseUrl: string) => {
      const saved = await upsertSapConnection({
        organizationId: ORG,
        product,
        key: `${RUN}-${key}`,
        label: `${product} ${environment}`,
        baseUrl,
        authType: "basic",
        secrets: { username: "COMM_USER", password: "not-a-real-password" },
        environment,
        writeEnabled: false,
      });
      name(saved.id, `connection:${product}:${environment}`);
    };
    await connection("s4hana", "dev", "DEV", "https://my000001-api.s4hana.cloud.sap");
    await connection("s4hana", "prod", "PROD", "https://my000003-api.s4hana.cloud.sap");
    await connection("successfactors", "sf-dev", "DEV", "https://api17.sapsf.com");

    const row = (externalId: string, data: Record<string, unknown>) =>
      prisma.sapHubContent.create({
        data: {
          contentType: "API",
          externalId,
          title: externalId,
          description: "",
          status: "Released",
          hubUrl: "u",
          apiType: "ODATAV2",
          ...data,
        },
        select: { id: true },
      });
    hub.s4 = name((await row(`API_${RUN_TAG}_SRV`, { appliesToPublic: true })).id, "hub:s4");
    hub.sf = name(
      (await row(`SF_${RUN_TAG}`, { appliesToPublic: false, productTags: "successfactors" })).id,
      "hub:sf",
    );
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.platformAuditOutcome.deleteMany({ where: { event: { actorUserId: { in: USER_IDS } } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: USER_IDS } } });
    await prisma.platformConsoleRead.deleteMany({ where: { actorUserId: { in: USER_IDS } } });
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: "-deployment-", actorUserId: { in: USER_IDS } } });
    await prisma.catalogueAddressVerification
      .deleteMany({ where: { organizationId: { in: [ORG, "-deployment-"] }, tenantKey: { startsWith: RUN } } })
      .catch(() => undefined);
    await prisma.sapHubContent.deleteMany({ where: { externalId: { contains: RUN_TAG } } });
    await prisma.sapConnection.deleteMany({ where: { organizationId: ORG } });
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  });

  it("answers and audits every console scenario as recorded", async () => {
    const observed: Record<string, Observed> = {};
    for (const s of SCENARIOS) {
      h.sap = s.sap ?? "ok";
      h.user = s.user ? users[s.user] : null;
      observed[s.name] = await observe(await s.call());
    }

    const target = UPDATE === "before" ? BEFORE : UPDATE === "after" ? AFTER : null;
    if (target) {
      if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(observed, null, 2)}\n`);
    }
    if (UPDATE === "before") return;

    const after = JSON.parse(readFileSync(AFTER, "utf8")) as Record<string, Observed>;
    expect(Object.keys(observed)).toEqual(Object.keys(after));
    for (const key of Object.keys(after)) expect(observed[key], key).toEqual(after[key]);
    // Every scenario in turn against PostgreSQL: under a second idle, past the
    // 5 s default under a full parallel run. Timed out, its loop ran on into
    // the next tests' rows and failed them too.
  }, 60_000);

  /*
   * ONE TEST PER ROUTE MOVED, for the new refusal: with
   * COREEDGE_ENV_TENANT_HOSTS=enforce, every console route refuses a
   * deployment tenant configured on a host the stored-connection allow-list
   * does not admit, before anything is sent to it, and audits the refusal. The
   * default (observe) is the golden run above, where the same tenant is served.
   */
  describe("under COREEDGE_ENV_TENANT_HOSTS=enforce", () => {
    const sentToUnlisted = () =>
      (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(([input]) =>
        String(input instanceof Request ? input.url : input).startsWith(UNLISTED_HOST),
      ).length;
    const T = `tenant=${UNLISTED_TENANT}`;

    const CASES: readonly { route: string; user: keyof typeof users; call: () => Promise<Response>; status: number; trail: "read" | "write" }[] = [
      { route: "preview", user: "dev", call: () => preview(`${S4}&${T}&${PO}`), status: 403, trail: "read" },
      { route: "entities", user: "dev", call: () => entities(`${S4}&${T}&service=purchase-orders&refresh=1`), status: 403, trail: "read" },
      { route: "operations", user: "dev", call: () => operations(`${S4}&${T}&refresh=1`), status: 403, trail: "read" },
      { route: "capabilities", user: "dev", call: () => capabilities(`${S4}&${T}`), status: 403, trail: "read" },
      // The catalogue's live parts fall back to stored results when refused: the browse still answers.
      { route: "hub-content", user: "dev", call: () => hubList(`${S4}&${T}&dataProbe=1&q=${RUN_TAG}`), status: 200, trail: "read" },
      { route: "hub-content/[id]", user: "dev", call: () => hubItem(hub.s4, `${S4}&${T}`), status: 200, trail: "read" },
      { route: "probe-all", user: "admin", call: () => probeAll({ product: "s4hana", tenant: UNLISTED_TENANT }), status: 403, trail: "read" },
      {
        route: "write",
        user: "admin",
        call: () =>
          post(writeRoute, "/api/sap/tdd/write", {
            product: "s4hana",
            tenant: UNLISTED_TENANT,
            service: "purchase-orders",
            entity: "A_PurchaseOrder",
            payload: { CompanyCode: "1010" },
            confirmation: "WRITE TO SAP TDD",
            writeSecret: WRITE_SECRET,
          }),
        status: 403,
        trail: "write",
      },
      {
        route: "write-test",
        user: "admin",
        call: () =>
          post(writeTestRoute, "/api/sap/tdd/hub-content/write-test", {
            product: "s4hana",
            tenant: UNLISTED_TENANT,
            service: "purchase-orders",
            entity: "A_PurchaseOrder",
            payload: { CompanyCode: "1010" },
            confirmation: "WRITE TO SAP TDD",
            writeSecret: WRITE_SECRET,
          }),
        status: 403,
        trail: "write",
      },
    ];

    it.each(CASES)("$route refuses the unlisted deployment tenant before anything is sent", async (c) => {
      vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
      try {
        h.sap = "ok";
        h.user = users[c.user];
        const before = sentToUnlisted();
        const res = await c.call();
        expect(res.status).toBe(c.status);
        expect(sentToUnlisted()).toBe(before);
        const { audits, platform, consoleReads } = await newRows();
        if (c.trail === "read") {
          expect(audits).toEqual([expect.objectContaining({ status: 403, failureReason: "HOST_NOT_ALLOWED", rowCount: null })]);
          expect(consoleReads).toEqual([expect.objectContaining({ outcome: "BLOCKED", reason: "HOST_NOT_ALLOWED", status: null })]);
          expect(platform).toEqual([]);
        } else {
          // P0.7's row, written first, says the write was refused before any was sent.
          expect(audits).toEqual([]);
          expect(consoleReads).toEqual([]);
          expect(platform).toEqual([
            expect.objectContaining({ result: expect.objectContaining({ outcome: "BLOCKED", reason: "HOST_NOT_ALLOWED" }) }),
          ]);
        }
      } finally {
        vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "");
      }
    });

    it("ariba refuses a realm configured on an unlisted host before the token exchange", async () => {
      vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
      vi.stubEnv("ARIBA_BASE_URL", "https://ariba.landscape.example.net");
      try {
        h.user = users.dev;
        const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
        const res = await ariba("endpoint=sourcing-events&realm=myrealm-T");
        expect(res.status).toBe(403);
        expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.length).toBe(calls);
        const { audits, platform, consoleReads } = await newRows();
        expect(audits).toEqual([]);
        expect(platform).toEqual([]);
        expect(consoleReads).toEqual([expect.objectContaining({ product: "ariba", outcome: "BLOCKED", reason: "HOST_NOT_ALLOWED" })]);

        /*
         * THE ID IT WAS HANDED IS FOUND (integration review round 4). An Ariba
         * call files no organization row, so Operations' correlation search
         * used to tell this member of the organization that no call in it had
         * the id the refusal quoted.
         */
        const quoted = ((await res.json()) as { error: { correlationId?: string } }).error.correlationId;
        expect(quoted).toMatch(/\S/);
        const found = await lookupCorrelationId(ORG, quoted!);
        expect(found).toMatchObject({
          kind: "found",
          call: { correlationId: quoted, status: 403, operation: "READ", externalId: "sourcing-events", brokenHop: "binding", dryRun: true },
        });
        expect(found.kind === "found" && found.call.outcome).toMatch(/host allow-list/);
        // Still this organization's alone: another organization's search does not see it.
        expect(await lookupCorrelationId(`${ORG}-other`, quoted!)).toEqual({ kind: "not-found" });
      } finally {
        vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "");
        vi.stubEnv("ARIBA_BASE_URL", "https://openapi.ariba.com");
      }
    });
  });

  it("changes nothing the routes did before, and adds only the console's platform-scope row", () => {
    const before = JSON.parse(readFileSync(BEFORE, "utf8")) as Record<string, Observed>;
    const after = JSON.parse(readFileSync(AFTER, "utf8")) as Record<string, Observed>;
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const key of Object.keys(before)) {
      const b = before[key]!;
      const a = after[key]!;
      // The answer and the organization's own console rows: unchanged.
      expect({ status: a.status, answer: a.answer, message: a.message, audits: a.audits }, key).toEqual({
        status: b.status,
        answer: b.answer,
        message: b.message,
        audits: b.audits,
      });
      // The write-back's fail-closed rows (P0.7): unchanged, and nothing else
      // on those tables (integration review round 4).
      expect(a.platform, key).toEqual(b.platform);
      expect(b.consoleReads, key).toBeUndefined();
    }
  });

  /*
   * THE SHARED CONSOLE CIRCUIT COUNTS ONLY A FAILING SYSTEM (P0.14b review).
   * Every console read of one system in one organization shares one circuit
   * (circuitKeyForConsoleRead), so under COREEDGE_CIRCUIT_BREAKER=enforce what
   * one route tells it decides whether the preview, entities, operations,
   * capabilities, the catalogue and Probe all answer at all. The preview's
   * rule holds for every route: SAP's own 4xx (its 429 and 400 included) is
   * SAP answering, not failing, and counts nothing; a fan-out against a system
   * that is down is a failure, never the "ok" that closes the circuit.
   *
   * Each case gets its own stored connection, so its circuit and Probe all's
   * per-tenant limit start clean.
   */
  describe("the console circuit, under COREEDGE_CIRCUIT_BREAKER=enforce", () => {
    let n = 0;
    const fresh = async (product: "s4hana" | "successfactors") => {
      const key = `${RUN}-circuit-${n++}`;
      const saved = await upsertSapConnection({
        organizationId: ORG,
        product,
        key,
        label: `circuit ${n}`,
        baseUrl: product === "s4hana" ? "https://my000001-api.s4hana.cloud.sap" : "https://api17.sapsf.com",
        authType: "basic",
        secrets: { username: "COMM_USER", password: "not-a-real-password" },
        environment: "DEV",
        writeEnabled: false,
      });
      return { tenant: key, circuit: circuitKeyForConsoleRead(ORG, circuitKeyForConnection(saved.id)) };
    };
    /** The circuit one short of opening: the preview has failed FAILURE_THRESHOLD - 1 times. */
    const almostOpen = async (circuit: string) => {
      for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) await governedCircuitBreaker().recordOutcome(circuit, "upstream-error");
    };
    const state = async (circuit: string) => {
      const s = await governedCircuitBreaker().snapshot(circuit);
      return { state: s?.state ?? "closed", failures: s?.consecutiveFailures ?? 0 };
    };

    beforeAll(() => {
      vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      vi.spyOn(console, "error").mockImplementation(() => undefined);
    });
    beforeEach(() => {
      __setGovernedCircuitStore(new MemoryCircuitStore());
      h.user = users.dev;
    });
    afterEach(async () => {
      h.sap = "ok";
      await newRows();
    });
    afterAll(() => {
      vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "");
      __setGovernedCircuitStore(null);
      vi.restoreAllMocks();
    });

    it.each(["429", "400"] as const)("entities: SAP's %s to $metadata is not a failing system", async (answer) => {
      const t = await fresh("s4hana");
      await almostOpen(t.circuit);
      h.sap = answer;
      expect((await entities(`${S4}&tenant=${t.tenant}&service=purchase-orders&refresh=1`)).status).toBe(502);
      expect(await state(t.circuit)).toEqual({ state: "closed", failures: FAILURE_THRESHOLD - 1 });
      // And the preview the organization shares the circuit with still answers.
      h.sap = "ok";
      expect((await preview(`${S4}&tenant=${t.tenant}&${PO}`)).status).toBe(200);
    });

    it.each(["429", "400"] as const)("operations: every section answered %s is not a failing system", async (answer) => {
      const t = await fresh("s4hana");
      await almostOpen(t.circuit);
      h.sap = answer;
      expect((await operations(`${S4}&tenant=${t.tenant}&refresh=1`)).status).toBe(200);
      expect(await state(t.circuit)).toEqual({ state: "closed", failures: FAILURE_THRESHOLD - 1 });
      h.sap = "ok";
      expect((await preview(`${S4}&tenant=${t.tenant}&${PO}`)).status).toBe(200);
    });

    it("operations: every section failing 5xx is still one failure", async () => {
      const t = await fresh("s4hana");
      await almostOpen(t.circuit);
      h.sap = "500";
      await operations(`${S4}&tenant=${t.tenant}&refresh=1`);
      expect((await state(t.circuit)).state).toBe("open");
    });

    const deadFanOuts: readonly { route: string; product: "s4hana" | "successfactors"; call: (tenant: string) => Promise<Response> }[] = [
      { route: "capabilities", product: "s4hana", call: (tenant) => capabilities(`${S4}&tenant=${tenant}`) },
      { route: "hub-content overlay", product: "successfactors", call: (tenant) => hubList(`${SF}&tenant=${tenant}&dataProbe=1`) },
      { route: "probe-all", product: "s4hana", call: (tenant) => probeAll({ product: "s4hana", tenant }) },
    ];

    it.each(deadFanOuts)("$route: a fan-out against a system that is down counts as a failure, never as ok", async (c) => {
      const t = await fresh(c.product);
      await almostOpen(t.circuit);
      h.sap = "500";
      await c.call(t.tenant);
      expect(await state(t.circuit)).toEqual({ state: "open", failures: FAILURE_THRESHOLD });
      // So the next console read is refused before anything is sent, as it would have been.
      expect((await governedCircuitBreaker().beforeCall(t.circuit)).allowed).toBe(false);
      if (c.product === "s4hana") expect((await preview(`${S4}&tenant=${t.tenant}&${PO}`)).status).toBe(503);
    });

    it("entities: a probe fan-out whose every read failed counts, after the $metadata that answered", async () => {
      const t = await fresh("s4hana");
      h.sap = "data503";
      expect((await entities(`${S4}&tenant=${t.tenant}&service=purchase-orders&probe=1&refresh=1`)).status).toBe(200);
      expect(await state(t.circuit)).toEqual({ state: "closed", failures: 1 });
    });

    it("a fan-out the system answered still closes the circuit", async () => {
      const t = await fresh("s4hana");
      await almostOpen(t.circuit);
      h.sap = "ok";
      expect((await capabilities(`${S4}&tenant=${t.tenant}`)).status).toBe(200);
      expect(await state(t.circuit)).toEqual({ state: "closed", failures: 0 });
    });
  });
});
