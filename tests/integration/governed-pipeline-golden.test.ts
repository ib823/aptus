// @vitest-environment node
/**
 * P0.14: the governed pipeline changed no behaviour. Golden audit rows and
 * answers, recorded from the routes BEFORE they were ported onto
 * src/lib/governed/pipeline.ts, and checked against the ported routes on
 * every run.
 *
 * WHAT IS RECORDED. For every scenario below, through the shipped route:
 * the HTTP status, the error code or the Test Console's refusal kind, and
 * every NorthboundAuditEvent row the call wrote, with `id`, `at`,
 * `correlationId` and `durationMs` removed (each changes on every call,
 * prisma/schema.prisma NorthboundAuditEvent) and run-specific ids replaced by
 * names. The file tests/fixtures/governed-pipeline/golden-audit-rows.json
 * was written by this test against the pre-port routes (commit 5bcaabb5) with
 * GOVERNED_GOLDEN_UPDATE=1, and is never rewritten to make a port pass: a
 * difference here is a behaviour change.
 *
 * The four entry points: the northbound read and write, the Studio broker
 * run, and the Workbench preview (src/app/api/sap/tdd/preview/route.ts).
 *
 * WHAT IS REAL: every route, the credential check, the grant gate, the
 * connection binding and sealing, the read and write executors, the
 * idempotency store, the audit insert, the tenant guard in throw mode, and
 * PostgreSQL. WHAT IS STOOD IN: the session, SAP itself (`fetch`), and the
 * limiter's answer where a scenario needs a refusal from it.
 *
 * P1.10 ON THE PIPELINE (P1 onto Phase 0b wave 2). The golden predates
 * API versioning, whose two audit columns (apiVersion, apiBasePath) every
 * northbound row now carries. They are compared apart from the golden: every
 * northbound row names the path and version that served it, every console
 * row (broker run, preview) names neither, and everything else is the golden.
 * Then every northbound scenario runs again through its /api/northbound/v1
 * alias and must answer and audit exactly as the golden says, its rows naming
 * the /v1 path: the alias runs the same pipeline, refusals included.
 *
 * P1.4 LIKEWISE. Its eleven query columns are younger than the golden too.
 * Every scenario here is a legacy read, a write or a console call, none of
 * which is on the query surface, so every row must leave all eleven null;
 * they are checked apart and the rest is the golden, unchanged. The query
 * surface's own rows are asserted in northbound-query-surface.test.ts.
 *
 * Opt-in like the other integration tests: skipped without TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "@/lib/security/rate-limit";

const h = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  rate: "real" as "real" | "limited" | "unavailable",
  sap: "ok" as "ok" | "500" | "403" | "timeout",
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
vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof RateLimit>();
  return {
    ...real,
    checkRateLimit: async (...args: Parameters<typeof real.checkRateLimit>) => {
      if (h.rate === "limited") return { allowed: false, remaining: 0, resetMs: 12_000, reason: "limited" as const };
      if (h.rate === "unavailable") return { allowed: false, remaining: 0, resetMs: 30_000, reason: "unavailable" as const };
      return real.checkRateLimit(...args);
    },
  };
});

import { prisma } from "@/lib/db/prisma";
import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as writeRoute } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { GET as readRouteV1 } from "@/app/api/northbound/v1/interfaces/[id]/data/route";
import { POST as writeRouteV1 } from "@/app/api/northbound/v1/interfaces/[id]/data/write/route";
import { GET as previewRoute } from "@/app/api/sap/tdd/preview/route";
import { POST as brokerRun } from "@/app/api/studio/test/broker-run/route";
import { forgetRecordedJourneyMilestones } from "@/lib/coreedge/journey";
import { hashClientToken } from "@/lib/northbound/auth";
import { generateClientToken } from "@/lib/northbound/issue";
import { setWriteCredential } from "@/lib/northbound/write-credential";
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const GOLDEN = join(process.cwd(), "tests/fixtures/governed-pipeline/golden-audit-rows.json");
const UPDATE = process.env.GOVERNED_GOLDEN_UPDATE === "1";

const RUN = `p014-${randomUUID().slice(0, 8)}`;
const ORG = `${RUN}-org`;
const DAY = 24 * 60 * 60 * 1000;

/** Run-specific id -> a stable name, so the golden file holds no random ids. */
const names = new Map<string, string>([[ORG, "<org>"]]);
const name = (id: string, label: string) => {
  names.set(id, `<${label}>`);
  return id;
};

const users = {
  dev: { id: `${RUN}-dev`, email: `${RUN}-dev@abeam.com`, name: "Dev", role: "consultant", organizationId: ORG, authMethod: "session" },
  sandbox: {
    id: `${RUN}-sandbox`,
    email: `${RUN}-sandbox@abeam.com`,
    name: "Sandbox developer",
    role: "sandbox_developer",
    organizationId: ORG,
    authMethod: "session",
  },
};

const ids = {
  solution: "",
  otherSolution: "",
  readIface: "",
  noGrantIface: "",
  noEntityIface: "",
  bogusIface: "",
  writeIface: "",
  otherIface: "",
};
const tokens = { dev: "", test: "", sandbox: "" };
const writeKeys = { dev: "", test: "", sandbox: "" };

const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

/** SAP, as each scenario needs it to answer. */
async function fakeSap(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method ?? "GET").toUpperCase();
  if (h.sap === "timeout") {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    throw error;
  }
  if (url.includes("$metadata")) {
    return new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } });
  }
  if (h.sap === "500") return new Response("boom", { status: 500, headers: { "content-type": "text/plain" } });
  if (h.sap === "403") return new Response("{}", { status: 403, headers: { "content-type": "application/json" } });
  if (method === "GET" && new Headers(init?.headers).get("x-csrf-token") === "Fetch") {
    return new Response("{}", { status: 200, headers: { "x-csrf-token": "csrf-1", "content-type": "application/json" } });
  }
  if (method === "POST") {
    return new Response(JSON.stringify({ d: { SupplierInvoice: "5100000001" } }), {
      status: 201,
      headers: { "content-type": "application/json", location: "https://my000001-api.s4hana.cloud.sap/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV/A_SupplierInvoice('5100000001')" },
    });
  }
  return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

interface Observed {
  status: number;
  /** The error code, the console refusal kind, or "ok". */
  answer: string;
  /** The sentence the caller was given, when it was refused or failed. */
  message: string | null;
  retryAfter: string | null;
  audits: Record<string, unknown>[];
}

const STRIPPED = new Set(["id", "at", "correlationId", "durationMs"]);
/** P1.10's columns, younger than the golden: compared apart from it (see the header). */
const SERVED_AS = ["apiBasePath", "apiVersion"] as const;
/** P1.4's columns, likewise: null on every row here. */
const QUERY_COLUMNS = [
  "queryKind",
  "queryShape",
  "queryHash",
  "requestedFields",
  "queryPolicyRev",
  "cursorChainId",
  "pageIndex",
  "chainRows",
  "responseBytes",
  "queryRule",
  "queryFlags",
] as const;
let seen = 0;
/** What each row the last call wrote said about the path and version that served it. */
let servedAs: string[] = [];
/** The query columns of each row the last call wrote that were not null. */
let queryColumnsSet: string[][] = [];

async function newAuditRows(): Promise<Record<string, unknown>[]> {
  const rows = await prisma.northboundAuditEvent.findMany({ where: { organizationId: ORG }, orderBy: { at: "asc" } });
  const fresh = rows.slice(seen);
  seen = rows.length;
  servedAs = fresh.map((row) => `${row.apiBasePath ?? "-"} ${row.apiVersion ?? "-"}`);
  queryColumnsSet = fresh.map((row) => QUERY_COLUMNS.filter((c) => row[c] !== null));
  return fresh.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([k]) => !STRIPPED.has(k) && !(SERVED_AS as readonly string[]).includes(k) && !(QUERY_COLUMNS as readonly string[]).includes(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, typeof v === "string" && names.has(v) ? names.get(v)! : v]),
    ),
  );
}

async function observe(res: Response): Promise<Observed> {
  const json = (await res.json()) as {
    data?: { outcome?: string; refusal?: { kind: string; message: string } };
    error?: { code: string; message: string };
  };
  const answer =
    json.error?.code ??
    (json.data?.outcome === "refused" ? `refused:${json.data.refusal?.kind}` : json.data?.outcome ?? "ok");
  return {
    status: res.status,
    answer,
    message: json.error?.message ?? json.data?.refusal?.message ?? null,
    retryAfter: res.headers.get("retry-after"),
    audits: await newAuditRows(),
  };
}

/** The northbound base path the read and write helpers call: the original, or its /v1 alias (P1.10). */
let base: "/api/northbound" | "/api/northbound/v1" = "/api/northbound";

const read = (token: string | null, id: string) =>
  (base === "/api/northbound/v1" ? readRouteV1 : readRoute)(
    new NextRequest(`http://localhost${base}/interfaces/${id}/data`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id }) },
  );

const write = (
  token: string | null,
  id: string,
  opts: { writeKey?: string | null; key?: string | null; body?: unknown } = {},
) => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.writeKey) headers["x-coreedge-write-key"] = opts.writeKey;
  if (opts.key) headers["idempotency-key"] = opts.key;
  return (base === "/api/northbound/v1" ? writeRouteV1 : writeRoute)(
    new NextRequest(`http://localhost${base}/interfaces/${id}/data/write`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? { record: { BusinessPartnerCategory: "1" } }),
    }),
    { params: Promise.resolve({ id }) },
  );
};

const run = (body: Record<string, unknown>) =>
  brokerRun(
    new NextRequest("http://localhost/api/studio/test/broker-run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const preview = (query: string) =>
  previewRoute(new NextRequest(`http://localhost/api/sap/tdd/preview?${query}`));

/** Each scenario: its setup knobs, then the call. Order matters: rows accumulate. */
const SCENARIOS: readonly { name: string; call: () => Promise<Response>; rate?: typeof h.rate; sap?: typeof h.sap; user?: keyof typeof users }[] = [
  // ── northbound read ────────────────────────────────────────────────
  { name: "read: no token", call: () => read(null, ids.readIface) },
  { name: "read: unknown token", call: () => read("ce_live_notarealtoken0000000000000000", ids.readIface) },
  { name: "read: rate limited", rate: "limited", call: () => read(tokens.dev, ids.readIface) },
  { name: "read: limiter unavailable", rate: "unavailable", call: () => read(tokens.dev, ids.readIface) },
  { name: "read: interface not found", call: () => read(tokens.dev, "no-such-interface") },
  { name: "read: another solution's interface", call: () => read(tokens.dev, ids.otherIface) },
  { name: "read: write interface", call: () => read(tokens.dev, ids.writeIface) },
  { name: "read: no grant", call: () => read(tokens.dev, ids.noGrantIface) },
  { name: "read: no connection for TEST", call: () => read(tokens.test, ids.readIface) },
  { name: "read: unknown product", call: () => read(tokens.dev, ids.bogusIface) },
  { name: "read: no entity set", call: () => read(tokens.dev, ids.noEntityIface) },
  { name: "read: served", call: () => read(tokens.dev, ids.readIface) },
  { name: "read: SAP 500", sap: "500", call: () => read(tokens.dev, ids.readIface) },
  { name: "read: SAP 403", sap: "403", call: () => read(tokens.dev, ids.readIface) },
  { name: "read: SAP timeout", sap: "timeout", call: () => read(tokens.dev, ids.readIface) },
  // ── northbound write ───────────────────────────────────────────────
  { name: "write: no token", call: () => write(null, ids.writeIface) },
  { name: "write: wrong write key", call: () => write(tokens.dev, ids.writeIface, { writeKey: "cew_wrong", key: "golden-key-0001" }) },
  { name: "write: rate limited", rate: "limited", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0002" }) },
  { name: "write: limiter unavailable", rate: "unavailable", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0003" }) },
  { name: "write: no idempotency key", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev }) },
  { name: "write: bad body", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0004", body: { nope: 1 } }) },
  { name: "write: interface not found", call: () => write(tokens.dev, "no-such-interface", { writeKey: writeKeys.dev, key: "golden-key-0005" }) },
  { name: "write: read-only interface", call: () => write(tokens.dev, ids.readIface, { writeKey: writeKeys.dev, key: "golden-key-0006" }) },
  { name: "write: no connection for TEST", call: () => write(tokens.test, ids.writeIface, { writeKey: writeKeys.test, key: "golden-key-0007" }) },
  { name: "write: writes disabled on the connection", call: () => write(tokens.sandbox, ids.writeIface, { writeKey: writeKeys.sandbox, key: "golden-key-0008" }) },
  {
    name: "write: entity chosen by the caller",
    call: () =>
      write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0009", body: { record: { a: 1 }, entity: "A_Other" } }),
  },
  { name: "write: created", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0010" }) },
  { name: "write: replayed", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0010" }) },
  {
    name: "write: same key, other payload",
    call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0010", body: { record: { other: true } } }),
  },
  { name: "write: SAP 500", sap: "500", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0011" }) },
  { name: "write: SAP timeout", sap: "timeout", call: () => write(tokens.dev, ids.writeIface, { writeKey: writeKeys.dev, key: "golden-key-0012" }) },
  // ── Studio broker run ──────────────────────────────────────────────
  { name: "broker-run: rate limited", user: "dev", rate: "limited", call: () => run({ interfaceId: ids.readIface, clientId: clientIds.dev }) },
  { name: "broker-run: limiter unavailable", user: "dev", rate: "unavailable", call: () => run({ interfaceId: ids.readIface, clientId: clientIds.dev }) },
  { name: "broker-run: ambiguous credential", user: "dev", call: () => run({ interfaceId: ids.readIface }) },
  { name: "broker-run: no grant", user: "dev", call: () => run({ interfaceId: ids.noGrantIface, clientId: clientIds.dev }) },
  { name: "broker-run: no connection for TEST", user: "dev", call: () => run({ interfaceId: ids.readIface, clientId: clientIds.test }) },
  { name: "broker-run: entity chosen by the caller", user: "dev", call: () => run({ interfaceId: ids.readIface, clientId: clientIds.dev, entity: "A_Other" }) },
  { name: "broker-run: no entity set", user: "dev", call: () => run({ interfaceId: ids.noEntityIface, clientId: clientIds.dev }) },
  { name: "broker-run: unknown product", user: "dev", call: () => run({ interfaceId: ids.bogusIface, clientId: clientIds.dev }) },
  { name: "broker-run: ran", user: "dev", call: () => run({ interfaceId: ids.readIface, clientId: clientIds.dev }) },
  { name: "broker-run: SAP 500", user: "dev", sap: "500", call: () => run({ interfaceId: ids.readIface, clientId: clientIds.dev }) },
  { name: "broker-run: sandbox developer on a DEV key", user: "sandbox", call: () => run({ interfaceId: ids.readIface, clientId: clientIds.dev }) },
  // ── Workbench preview ──────────────────────────────────────────────
  { name: "preview: unknown product", user: "dev", call: () => preview("product=bogus") },
  { name: "preview: no entity", user: "dev", call: () => preview(`product=s4hana&tenant=${RUN}-dev&service=purchase-orders`) },
  {
    name: "preview: DEV connection served",
    user: "dev",
    call: () => preview(`product=s4hana&tenant=${RUN}-dev&service=purchase-orders&entity=A_PurchaseOrder&limit=2`),
  },
  {
    name: "preview: SAP 500",
    user: "dev",
    sap: "500",
    call: () => preview(`product=s4hana&tenant=${RUN}-dev&service=purchase-orders&entity=A_PurchaseOrder`),
  },
  {
    name: "preview: SAP 403",
    user: "dev",
    sap: "403",
    call: () => preview(`product=s4hana&tenant=${RUN}-dev&service=purchase-orders&entity=A_PurchaseOrder`),
  },
  {
    name: "preview: PROD connection without a grant",
    user: "dev",
    call: () => preview(`product=s4hana&tenant=${RUN}-prod&service=purchase-orders&entity=A_PurchaseOrder`),
  },
  {
    name: "preview: sandbox developer on a DEV connection",
    user: "sandbox",
    call: () => preview(`product=s4hana&tenant=${RUN}-dev&service=purchase-orders&entity=A_PurchaseOrder`),
  },
];

const clientIds = { dev: "", test: "", sandbox: "" };

describe.skipIf(!process.env.TEST_DATABASE_URL)("the governed pipeline changes no behaviour (P0.14)", () => {
  beforeAll(async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "b".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubGlobal("fetch", vi.fn(fakeSap));
    forgetRecordedJourneyMilestones();

    await prisma.organization.create({ data: { id: ORG, name: "Golden rows", type: "client" } });
    for (const u of Object.values(users)) {
      await prisma.user.create({ data: { id: u.id, email: u.email, name: u.name, role: u.role, organizationId: ORG } });
      names.set(u.id, `<user:${u.role}>`);
    }
    const owners = { technicalOwnerId: users.dev.id, businessOwnerId: users.dev.id, supportOwnerId: users.dev.id };
    const solution = (slug: string) =>
      prisma.solution.create({
        data: {
          organizationId: ORG,
          name: slug,
          slug: `${RUN}-${slug}`,
          classification: "CLIENT_APP",
          businessProblem: "Golden audit rows for the governed pipeline.",
          dataClass: "INTERNAL",
          status: "ACTIVE",
          ...owners,
        },
        select: { id: true },
      });
    ids.solution = name((await solution("portal")).id, "solution");
    ids.otherSolution = name((await solution("other")).id, "solution:other");

    const iface = async (
      label: string,
      data: { solutionId?: string; sapProduct?: string; externalId?: string; operation?: string; mode?: string; entitySet?: string | null },
    ) => {
      const row = await prisma.interface.create({
        data: {
          organizationId: ORG,
          solutionId: data.solutionId ?? ids.solution,
          name: label,
          sapProduct: data.sapProduct ?? "s4hana",
          externalId: data.externalId ?? "purchase-orders",
          operation: data.operation ?? "READ",
          mode: data.mode ?? "READ",
          entitySet: data.entitySet === undefined ? "A_PurchaseOrder" : data.entitySet,
          status: "ACTIVE",
        },
        select: { id: true },
      });
      return name(row.id, `interface:${label}`);
    };
    ids.readIface = await iface("read", {});
    ids.noGrantIface = await iface("no-grant", { externalId: "purchase-contracts" });
    ids.noEntityIface = await iface("no-entity", { entitySet: null });
    ids.bogusIface = await iface("bogus-product", { sapProduct: "bogus" });
    ids.writeIface = await iface("write", {
      externalId: "supplier-invoices",
      operation: "CREATE",
      mode: "WRITE",
      entitySet: "A_SupplierInvoice",
    });
    ids.otherIface = await iface("other-solution", { solutionId: ids.otherSolution });

    const grant = (interfaceId: string, externalId: string, operation: string, environment: string, sapProduct = "s4hana") =>
      prisma.apiAccessGrant.create({
        data: {
          organizationId: ORG,
          solutionId: ids.solution,
          interfaceId,
          sapProduct,
          externalId,
          operation,
          environment,
          justification: "Golden rows.",
          decision: "APPROVED",
          decidedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * DAY),
        },
      });
    for (const env of ["DEV", "TEST", "SANDBOX"]) {
      await grant(ids.readIface, "purchase-orders", "READ", env);
      await grant(ids.noEntityIface, "purchase-orders", "READ", env);
      await grant(ids.bogusIface, "purchase-orders", "READ", env, "bogus");
      await grant(ids.writeIface, "supplier-invoices", "CREATE", env);
    }

    const client = async (env: string) => {
      const raw = generateClientToken(env);
      const row = await prisma.solutionClient.create({
        data: {
          organizationId: ORG,
          solutionId: ids.solution,
          label: `${env} key`,
          createdById: users.dev.id,
          tokenHash: hashClientToken(raw),
          environment: env,
          isActive: true,
          expiresAt: new Date(Date.now() + 30 * DAY),
        },
        select: { id: true },
      });
      return { raw, id: name(row.id, `client:${env}`) };
    };
    const scope = tenantScopeOf(ORG);
    for (const [k, env] of [["dev", "DEV"], ["test", "TEST"], ["sandbox", "SANDBOX"]] as const) {
      const c = await client(env);
      tokens[k] = c.raw;
      clientIds[k] = c.id;
      writeKeys[k] = `cew_${RUN}_${k}_write_key_000000000000`;
      expect(await setWriteCredential(scope, c.id, writeKeys[k])).toBe(true);
    }

    const connection = async (key: string, environment: "DEV" | "SANDBOX" | "PROD", writeEnabled: boolean) => {
      const saved = await upsertSapConnection({
        organizationId: ORG,
        product: "s4hana",
        key: `${RUN}-${key}`,
        label: `S/4HANA ${environment}`,
        baseUrl: "https://my000001-api.s4hana.cloud.sap",
        authType: "basic",
        secrets: { username: "COMM_USER", password: "not-a-real-password", ...(writeEnabled ? { writeSecret: "w" } : {}) },
        environment,
        writeEnabled,
      });
      name(saved.id, `connection:${environment}`);
    };
    await connection("dev", "DEV", true);
    await connection("sandbox", "SANDBOX", false);
    await connection("prod", "PROD", false);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.northboundAuditEvent.deleteMany({ where: { organizationId: ORG } });
    await prisma.northboundIdempotencyKey.deleteMany({ where: { organizationId: ORG } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: ORG } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } });
  });

  /** Northbound scenarios: their rows name the path and the version (P1.10); the console's name neither. */
  const isNorthbound = (scenario: string) => scenario.startsWith("read:") || scenario.startsWith("write:");

  it("answers and audits every scenario exactly as the routes did before the port", async () => {
    const observed: Record<string, Observed> = {};
    const served: Record<string, string[]> = {};
    for (const s of SCENARIOS) {
      h.rate = s.rate ?? "real";
      h.sap = s.sap ?? "ok";
      h.user = s.user ? users[s.user] : null;
      observed[s.name] = await observe(await s.call());
      served[s.name] = servedAs;
      expect(queryColumnsSet, `${s.name}: the query columns`).toEqual(queryColumnsSet.map(() => []));
    }
    for (const [scenario, rows] of Object.entries(served)) {
      const want = isNorthbound(scenario) ? "/api/northbound 2026-10" : "- -";
      expect(rows, scenario).toEqual(rows.map(() => want));
    }

    if (UPDATE) {
      if (!existsSync(dirname(GOLDEN))) mkdirSync(dirname(GOLDEN), { recursive: true });
      writeFileSync(GOLDEN, `${JSON.stringify(observed, null, 2)}\n`);
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Observed>;
    expect(Object.keys(observed)).toEqual(Object.keys(golden));
    for (const key of Object.keys(golden)) {
      expect(observed[key], key).toEqual(golden[key]);
    }
  });

  it("every northbound scenario answers and audits the same through its /v1 alias", async () => {
    // The write scenarios replay and conflict on their own keys: start them afresh.
    await prisma.northboundIdempotencyKey.deleteMany({ where: { organizationId: ORG } });
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Observed>;
    base = "/api/northbound/v1";
    try {
      let ran = 0;
      for (const s of SCENARIOS.filter((x) => isNorthbound(x.name))) {
        h.rate = s.rate ?? "real";
        h.sap = s.sap ?? "ok";
        h.user = null;
        const got = await observe(await s.call());
        expect(got, `v1 ${s.name}`).toEqual(golden[s.name]);
        expect(queryColumnsSet, `v1 ${s.name}: the query columns`).toEqual(queryColumnsSet.map(() => []));
        expect(servedAs, `v1 ${s.name}`).toEqual(servedAs.map(() => "/api/northbound/v1 2026-10"));
        ran += 1;
      }
      expect(ran).toBe(31);
    } finally {
      base = "/api/northbound";
    }
  });
});
