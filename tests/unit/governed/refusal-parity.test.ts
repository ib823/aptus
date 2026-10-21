// @vitest-environment node
/**
 * P0.14 acceptance: a parity table of refusal reason by status code holds
 * across every ported route.
 *
 * Every governed entry point — the northbound read and write, the Studio
 * broker run and the Workbench preview — is driven into each refusal it can
 * reach, and the status it answers (the broker run answers inside a 200, so
 * for it the status its audit row records, which is what the deployed
 * application would have been told) must equal `REFUSAL_STATUS[reason]` in
 * src/lib/governed/pipeline.ts. So one reason can never mean 403 on one route
 * and 404 on the next. A refusal after authentication must also leave exactly
 * one audit row, at that status.
 *
 * The gates' own decisions are tested elsewhere (access, binding, console
 * guard); here they are stood in for, so each reason can be produced on
 * demand and the only thing under test is what the route does with it.
 */

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolver from "@/lib/sap-public/connection-resolver";
import type * as ConsoleReadGuard from "@/lib/sap-public/console-read-guard";
import type * as TddConnector from "@/lib/sap-public/tdd-connector";
import type * as TenantForRead from "@/lib/sap-public/tenant-for-read";

const h = vi.hoisted(() => ({
  auth: "ok" as "ok" | "fail",
  writeKey: true,
  rate: "ok" as "ok" | "limited" | "unavailable",
  access: null as null | string,
  binding: null as null | string,
  transport: "DIRECT" as "DIRECT" | "TWIN",
  writeEnabled: true,
  definition: null as null | string,
  service: true as boolean,
  servicePath: null as null | string,
  reservation: "proceed" as "proceed" | "PAYLOAD_MISMATCH" | "IN_FLIGHT",
  sandboxOnly: false,
  consoleRefusal: null as null | string,
  deploymentTenant: false,
  audits: [] as { status: number }[],
  /** What SAP answers a write with; null is the default success. */
  writeResult: null as null | Record<string, unknown>,
  idempotency: { completed: 0, released: 0 },
  user: { id: "u1", role: "consultant", organizationId: "org_a", email: "u@a.co", authMethod: "session" },
}));

const CONNECTION = () => ({
  source: "db",
  id: "conn_1",
  organizationId: "org_a",
  product: "s4hana",
  key: "dev",
  label: "DEV",
  baseUrl: "https://my000001-api.s4hana.cloud.sap",
  authType: "basic",
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: h.writeEnabled,
  apiPath: null,
  timeoutMs: null,
  environment: "DEV",
  client: null,
  transport: h.transport,
});

const IFACE = () => ({
  id: "if_1",
  name: "Feed",
  externalId: "purchase-orders",
  sapProduct: "s4hana",
  entitySet: "A_PurchaseOrder",
  operation: "READ",
  mode: "READ",
  version: 1,
  draft: false,
  servicePath: h.servicePath,
  odataVersion: null,
  serviceVerifiedAt: null,
  serviceVerifications: null,
});

vi.mock("@/lib/northbound/auth", () => ({
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: async () => undefined,
  checkSolutionRuntime: async () => ({ ok: true }),
  authenticateClientToken: async () =>
    h.auth === "ok"
      ? {
          ok: true,
          client: {
            clientId: "client_1",
            organizationId: "org_a",
            solutionId: "sol_1",
            environment: "DEV",
            sapClient: null,
            scope: { organizationId: "org_a" },
          },
        }
      : { ok: false, reason: "UNKNOWN_TOKEN" },
}));
vi.mock("@/lib/northbound/auth-failures", () => ({ noteFailedCredential: async () => undefined }));
vi.mock("@/lib/northbound/audit", () => ({
  recordNorthboundCall: async (row: { status: number }) => {
    h.audits.push(row);
  },
}));
vi.mock("@/lib/northbound/write-credential", () => ({ verifyWriteCredential: async () => h.writeKey }));
vi.mock("@/lib/security/rate-limit", () => ({
  RATE_LIMITS: { northbound: { limit: 60, windowMs: 60_000 } },
  checkRateLimit: async () =>
    h.rate === "ok"
      ? { allowed: true, remaining: 59, resetMs: 0 }
      : { allowed: false, remaining: 0, resetMs: 10_000, reason: h.rate === "limited" ? "limited" : "unavailable" },
}));
vi.mock("@/lib/northbound/access", () => {
  const answer = async () =>
    h.access === null ? { ok: true, iface: IFACE() } : { ok: false, reason: h.access, message: `refused: ${h.access}` };
  return { resolveReadableInterface: answer, resolveWritableInterface: answer };
});
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolver>()),
  resolveSapConnectionForEnvironment: async () =>
    h.binding === null ? { ok: true, connection: CONNECTION(), bindingUnverified: false } : { ok: false, reason: h.binding },
}));
vi.mock("@/lib/northbound/read-definition", () => ({
  resolveReadDefinition: async () =>
    h.definition === null
      ? { ok: true, service: { key: "purchase-orders", path: "/sap/opu/odata/sap/X" }, entitySet: "A_PurchaseOrder" }
      : { ok: false, reason: h.definition },
}));
vi.mock("@/lib/sap-public/interface-service", () => ({
  resolveInterfaceService: async () =>
    h.service ? { service: { key: "purchase-orders", path: "/sap/opu/odata/sap/X" }, source: h.servicePath ? "custom" : "catalogue" } : null,
}));
vi.mock("@/lib/sap-public/service-verifications", () => ({ isVerifiedForBinding: () => false }));
vi.mock("@/lib/northbound/idempotency", () => ({
  isValidIdempotencyKey: (k: string) => k.length >= 8,
  reserveIdempotencyKey: async () =>
    h.reservation === "proceed"
      ? { outcome: "proceed", recordId: "rec_1" }
      : { outcome: "conflict", reason: h.reservation },
  completeIdempotencyKey: async () => {
    h.idempotency.completed += 1;
  },
  releaseIdempotencyKey: async () => {
    h.idempotency.released += 1;
  },
}));
vi.mock("@/lib/northbound/read", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readEntitySet: async () => ({ status: "OK", httpStatus: 200, records: [{ a: 1 }], detail: "1 record.", durationMs: 1, failureReason: null }),
}));
vi.mock("@/lib/northbound/write", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeEntitySet: async () => h.writeResult ?? ({
    status: "CREATED",
    httpStatus: 201,
    record: { a: 1 },
    location: null,
    detail: "Created.",
    durationMs: 1,
    failureReason: null,
    attempted: true,
  }),
}));
vi.mock("@/lib/coreedge/journey", () => ({ noteFirstCall: async () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => h.user }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findFirst: async () => ({ ...IFACE(), solutionId: "sol_1" }) },
    solutionClient: { findMany: async () => [{ id: "client_1", environment: "DEV", sapClient: null, expiresAt: null }] },
    sapHubContent: { findFirst: async () => null },
    // The console's platform-scope row (P0.14b); its insert is not under test here.
    platformAuditEvent: { create: async () => ({ id: "pae_1" }) },
  },
}));
vi.mock("@/lib/sap-public/probe-guard", () => ({ refuseUnlessMayProbeTenant: async () => null }));
vi.mock("@/lib/sap-public/tenant-for-read", async (importOriginal) => ({
  ...(await importOriginal<typeof TenantForRead>()),
  resolveReadTenant: async () =>
    h.deploymentTenant
      ? // A deployment tenant (P0.14b): no connection, configured at a host the allow-list does not admit.
        { tenant: { key: "env", label: "Env", baseUrl: "https://s4.landscape.example.net" }, source: "deployment", connection: null }
      : {
          tenant: { key: "dev", label: "DEV", baseUrl: "https://my000001-api.s4hana.cloud.sap" },
          source: "connection",
          connection: { id: "conn_1", environment: "DEV" },
        },
}));
vi.mock("@/lib/sap-public/resolve-hub-service", () => ({
  resolveHubService: async () => ({ key: "purchase-orders", path: "/sap/opu/odata/sap/X" }),
}));
vi.mock("@/lib/sap-public/console-read-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof ConsoleReadGuard>()),
  decideSandboxDeveloperRead: () =>
    h.sandboxOnly ? { allowed: false, refusal: "SANDBOX_ONLY", message: "Sandbox only." } : { allowed: true, refusal: null, message: null },
  decideConsoleRead: async () =>
    h.consoleRefusal === null
      ? { allowed: true, refusal: null, message: null }
      : { allowed: false, refusal: h.consoleRefusal, message: `refused: ${h.consoleRefusal}` },
  recordConsoleRead: async (row: { status: number }) => {
    h.audits.push(row);
  },
}));
vi.mock("@/lib/sap-public/tdd-connector", async (importOriginal) => ({
  ...(await importOriginal<typeof TddConnector>()),
  previewSapEntitySet: async () => ({ entitySet: "A_PurchaseOrder", ok: true, status: 200, rows: [{ a: 1 }], fields: ["a"] }),
}));

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as writeRoute } from "@/app/api/northbound/interfaces/[id]/data/write/route";
import { GET as previewRoute } from "@/app/api/sap/tdd/preview/route";
import { POST as brokerRun } from "@/app/api/studio/test/broker-run/route";
import { attributeAuditRow, type CorrelatedCall } from "@/lib/coreedge/correlation-lookup";
import { __setGovernedCircuitStore, governedCircuitBreaker } from "@/lib/governed/containment";
import { REFUSAL_STATUS, type RefusalReason } from "@/lib/governed/pipeline";
import { FAILURE_THRESHOLD, MemoryCircuitStore, STORE_DEADLINE_MS } from "@/lib/northbound/circuit-breaker";

type Route = "read" | "write" | "broker-run" | "preview";

async function call(route: Route): Promise<{ status: number; reason: string | null }> {
  if (route === "read") {
    const res = await readRoute(
      new NextRequest("http://localhost/api/northbound/interfaces/if_1/data", { headers: { authorization: "Bearer k" } }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
    return { status: res.status, reason: null };
  }
  if (route === "write") {
    const body = (h as unknown as { writeBody?: unknown }).writeBody ?? { record: { a: 1 } };
    const res = await writeRoute(
      new NextRequest("http://localhost/api/northbound/interfaces/if_1/data/write", {
        method: "POST",
        headers: {
          authorization: "Bearer k",
          "x-coreedge-write-key": "cew_x",
          ...((h as unknown as { noKey?: boolean }).noKey ? {} : { "idempotency-key": "key-00000001" }),
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
    return { status: res.status, reason: null };
  }
  if (route === "broker-run") {
    const res = await brokerRun(
      new NextRequest("http://localhost/api/studio/test/broker-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interfaceId: "if_1", clientId: "client_1", ...((h as unknown as { runEntity?: string }).runEntity ? { entity: (h as unknown as { runEntity?: string }).runEntity } : {}) }),
      }),
    );
    const json = (await res.json()) as { data?: { outcome: string; refusal?: { kind: string } } };
    expect(res.status).toBe(200);
    expect(json.data?.outcome).toBe("refused");
    return { status: h.audits.at(-1)?.status ?? -1, reason: json.data?.refusal?.kind ?? null };
  }
  const res = await previewRoute(
    new NextRequest("http://localhost/api/sap/tdd/preview?product=s4hana&tenant=dev&service=purchase-orders&entity=A_PurchaseOrder"),
  );
  return { status: res.status, reason: null };
}

/** Each reason, how to produce it, and which routes can reach it. */
interface Case {
  readonly reason: RefusalReason;
  readonly routes: readonly Route[];
  readonly set: () => void;
  /** No audit row: there is no tenant to write it under. */
  readonly unaudited?: true;
}

const NB: readonly Route[] = ["read", "write"];
const ALL_BROKER: readonly Route[] = ["read", "write", "broker-run"];
const READS: readonly Route[] = ["read", "broker-run"];

const CASES: readonly Case[] = [
  { reason: "UNAUTHENTICATED", routes: NB, set: () => (h.auth = "fail"), unaudited: true },
  { reason: "WRITE_CREDENTIAL_INVALID", routes: ["write"], set: () => (h.writeKey = false) },
  { reason: "RATE_LIMITED", routes: ALL_BROKER, set: () => (h.rate = "limited") },
  { reason: "LIMITER_UNAVAILABLE", routes: ALL_BROKER, set: () => (h.rate = "unavailable") },
  { reason: "IDEMPOTENCY_KEY_INVALID", routes: ["write"], set: () => ((h as unknown as { noKey: boolean }).noKey = true) },
  { reason: "BODY_INVALID", routes: ["write"], set: () => ((h as unknown as { writeBody: unknown }).writeBody = { nope: 1 }) },
  // The grant gate. The two not-found reasons are unreachable from the
  // broker run, which loads the interface itself first.
  { reason: "INTERFACE_NOT_FOUND", routes: NB, set: () => (h.access = "INTERFACE_NOT_FOUND") },
  { reason: "NOT_THIS_SOLUTION", routes: NB, set: () => (h.access = "NOT_THIS_SOLUTION") },
  { reason: "NO_APPROVED_GRANT", routes: ALL_BROKER, set: () => (h.access = "NO_APPROVED_GRANT") },
  { reason: "GRANT_EXPIRED", routes: ALL_BROKER, set: () => (h.access = "GRANT_EXPIRED") },
  { reason: "GRANT_REVOKED", routes: ALL_BROKER, set: () => (h.access = "GRANT_REVOKED") },
  { reason: "GRANT_NEEDS_REAPPROVAL", routes: ALL_BROKER, set: () => (h.access = "GRANT_NEEDS_REAPPROVAL") },
  { reason: "WRITE_NOT_SERVED", routes: READS, set: () => (h.access = "WRITE_NOT_SERVED") },
  { reason: "INTERFACE_DEPRECATED", routes: READS, set: () => (h.access = "INTERFACE_DEPRECATED") },
  { reason: "READ_ONLY_INTERFACE", routes: ["write"], set: () => (h.access = "READ_ONLY_INTERFACE") },
  { reason: "INTERFACE_NOT_ACTIVE", routes: ["write"], set: () => (h.access = "INTERFACE_NOT_ACTIVE") },
  { reason: "OPERATION_NOT_SUPPORTED", routes: ["write"], set: () => (h.access = "OPERATION_NOT_SUPPORTED") },
  // The binding.
  ...(
    [
      "NO_CONNECTION",
      "NO_MATCH_FOR_CLIENT",
      "NO_MATCH_FOR_ENVIRONMENT",
      "AMBIGUOUS",
      "NO_DECLARED_CANDIDATE",
      "CONNECTION_UNREADABLE",
    ] as const
  ).map((reason) => ({ reason, routes: ALL_BROKER, set: () => (h.binding = reason) })),
  { reason: "UNDECLARED_ENVIRONMENT_WRITE", routes: ["write"], set: () => (h.binding = "UNDECLARED_ENVIRONMENT_WRITE") },
  { reason: "TRANSPORT_UNAVAILABLE", routes: ALL_BROKER, set: () => (h.transport = "TWIN") },
  { reason: "WRITES_DISABLED", routes: ["write"], set: () => (h.writeEnabled = false) },
  // What the interface names.
  { reason: "NO_ENTITY_SET", routes: READS, set: () => (h.definition = "NO_ENTITY_SET") },
  { reason: "SERVICE_PATH_INVALID", routes: READS, set: () => (h.definition = "SERVICE_PATH_INVALID") },
  { reason: "SERVICE_UNRESOLVED", routes: ["read", "broker-run", "write"], set: () => ((h.definition = "SERVICE_UNRESOLVED"), (h.service = false)) },
  {
    reason: "ENTITY_NOT_YOURS_TO_CHOOSE",
    routes: ["write", "broker-run"],
    set: () => {
      (h as unknown as { writeBody: unknown }).writeBody = { record: { a: 1 }, entity: "A_Other" };
      (h as unknown as { runEntity: string }).runEntity = "A_Other";
    },
  },
  { reason: "CUSTOM_SERVICE_UNVERIFIED", routes: ["write"], set: () => (h.servicePath = "/sap/opu/odata/sap/ZCUSTOM") },
  { reason: "IDEMPOTENCY_CONFLICT", routes: ["write"], set: () => (h.reservation = "PAYLOAD_MISMATCH") },
  { reason: "IDEMPOTENCY_IN_FLIGHT", routes: ["write"], set: () => (h.reservation = "IN_FLIGHT") },
  // The console's ceiling.
  { reason: "SANDBOX_ONLY", routes: ["preview"], set: () => (h.sandboxOnly = true) },
  { reason: "NO_APPROVED_GRANT", routes: ["preview"], set: () => (h.consoleRefusal = "NO_APPROVED_GRANT") },
  { reason: "UNDECLARED_ENVIRONMENT", routes: ["preview"], set: () => (h.consoleRefusal = "UNDECLARED_ENVIRONMENT") },
  // The deployment tenant's host check, enforced (P0.14b).
  {
    reason: "HOST_NOT_ALLOWED",
    routes: ["preview"],
    set: () => {
      h.deploymentTenant = true;
      vi.stubEnv("COREEDGE_ENV_TENANT_HOSTS", "enforce");
    },
  },
  // Containment, enforced.
  {
    reason: "CIRCUIT_OPEN",
    routes: ["read", "write", "broker-run", "preview"],
    set: () => vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce"),
  },
];

function reset(): void {
  Object.assign(h, {
    auth: "ok",
    writeKey: true,
    rate: "ok",
    access: null,
    binding: null,
    transport: "DIRECT",
    writeEnabled: true,
    definition: null,
    service: true,
    servicePath: null,
    reservation: "proceed",
    sandboxOnly: false,
    consoleRefusal: null,
    deploymentTenant: false,
    audits: [],
    writeBody: undefined,
    noKey: false,
    runEntity: undefined,
    writeResult: null,
    idempotency: { completed: 0, released: 0 },
  });
}

let store: MemoryCircuitStore;

beforeEach(async () => {
  reset();
  vi.unstubAllEnvs();
  store = new MemoryCircuitStore();
  __setGovernedCircuitStore(store);
  // An open circuit for the one connection every case binds to: it refuses
  // only where a case enforces the breaker, and is observed everywhere else.
  for (let i = 0; i < FAILURE_THRESHOLD; i++) await governedCircuitBreaker().recordOutcome("connection:conn_1", "timeout");
  // And the console's own circuit for it, in the viewer's organization (the
  // preview never counts into, or reads, the production one).
  for (let i = 0; i < FAILURE_THRESHOLD; i++) {
    await governedCircuitBreaker().recordOutcome("console:org_a:connection:conn_1", "timeout");
  }
});
afterAll(() => {
  __setGovernedCircuitStore(null);
  vi.unstubAllEnvs();
});

const ROWS = CASES.flatMap((c) => c.routes.map((route) => [c.reason, route, c] as const));

describe("the refusal table holds on every ported route", () => {
  it.each(ROWS)("%s on %s answers REFUSAL_STATUS", async (reason, route, c) => {
    c.set();
    const before = h.audits.length;
    const { status, reason: kind } = await call(route);
    expect(status).toBe(REFUSAL_STATUS[reason]);
    if (route === "broker-run" && reason !== "SERVICE_UNRESOLVED" && reason !== "SERVICE_PATH_INVALID") {
      // The console names the refusal by its pipeline reason (the three
      // definition gaps are shown as one, NO_ENTITY_SET).
      expect(kind).toBe(reason);
    }
    if (c.unaudited) {
      expect(h.audits.length).toBe(before);
    } else {
      expect(h.audits.length - before).toBe(1);
      expect(h.audits.at(-1)!.status).toBe(REFUSAL_STATUS[reason]);
    }
  });

  it("covers every reason in the table", () => {
    // A reason no route can produce is a row nobody tests: say which route
    // reaches it, or remove it. The console's NO_APPROVED_GRANT shares the
    // grant gate's name and status, so it is covered by that row.
    const covered = new Set(CASES.map((c) => c.reason));
    expect(Object.keys(REFUSAL_STATUS).filter((r) => !covered.has(r as RefusalReason) && r !== "UNKNOWN_PRODUCT")).toEqual([]);
  });

  it("UNKNOWN_PRODUCT is a binding refusal at 403 on every broker route", async () => {
    // Produced by the interface naming a product the registry does not know;
    // the golden rows record it through the real routes. Here the table says
    // it is the binding's 403, the same as every other binding reason.
    expect(REFUSAL_STATUS.UNKNOWN_PRODUCT).toBe(403);
    expect(REFUSAL_STATUS.UNKNOWN_PRODUCT).toBe(REFUSAL_STATUS.NO_CONNECTION);
  });
});

describe("the default breaker observes and never refuses", () => {
  it.each(["read", "write", "preview"] as const)("an open circuit lets %s through when not enforced", async (route) => {
    const { status } = await call(route);
    expect([200, 201]).toContain(status);
  });
});

/*
 * THE AUDITED DURATION IS SAP'S, NOT REDIS'S. Operations shows durationMs as
 * "how slow is this tenant" and the correlation search as "Took", so it is
 * timed around the upstream call only. Reporting the outcome to the breaker
 * is one or two round trips to Upstash; they must not be folded in, or a slow
 * Redis reads as a slow SAP tenant. Driven with a store that takes 150 ms per
 * command and an SAP stand-in that answers at once.
 */
describe("the audited duration leaves out the breaker's store", () => {
  class SlowStore extends MemoryCircuitStore {
    override async read(key: string) {
      await new Promise((r) => setTimeout(r, 150));
      return super.read(key);
    }
    override async compareAndSet(key: string, expected: string | null, next: string) {
      await new Promise((r) => setTimeout(r, 150));
      return super.compareAndSet(key, expected, next);
    }
  }

  it.each(["read", "write", "preview"] as const)("on %s", async (route) => {
    __setGovernedCircuitStore(new SlowStore({ shared: true }));
    const { status } = await call(route);
    expect([200, 201]).toContain(status);
    const row = h.audits.at(-1) as { durationMs?: number | null };
    expect(typeof row.durationMs).toBe("number");
    expect(row.durationMs!).toBeLessThan(100);
  });
});

/*
 * THE CORRELATION SEARCH READS EACH REFUSAL BACK AS WHAT IT WAS. Operations'
 * search (correlation-lookup.ts) turns the audit row a refusal left into
 * "Stopped at" and "Outcome". Every row here is the one the route itself
 * wrote, so the hop is checked against what the routes really record: none of
 * these calls reached SAP, so none may be attributed to SAP's answer, and
 * each must say nothing was sent.
 */
describe("the correlation search attributes every refusal to the hop that refused it", () => {
  const HOP: Readonly<Record<RefusalReason, CorrelatedCall["brokenHop"]>> = {
    UNAUTHENTICATED: "key",
    // The row cannot tell a bad write key from a grant refusal (both 403,
    // before binding); the outcome sentence names both.
    WRITE_CREDENTIAL_INVALID: "access",
    RATE_LIMITED: "key",
    LIMITER_UNAVAILABLE: "key",
    IDEMPOTENCY_KEY_INVALID: "request",
    BODY_INVALID: "request",
    NO_ENTITY_SET: "request",
    SERVICE_PATH_INVALID: "request",
    SERVICE_UNRESOLVED: "request",
    ENTITY_NOT_YOURS_TO_CHOOSE: "request",
    CUSTOM_SERVICE_UNVERIFIED: "request",
    INTERFACE_NOT_FOUND: "access",
    NOT_THIS_SOLUTION: "access",
    NO_APPROVED_GRANT: "access",
    GRANT_EXPIRED: "access",
    GRANT_REVOKED: "access",
    GRANT_NEEDS_REAPPROVAL: "access",
    WRITE_NOT_SERVED: "access",
    READ_ONLY_INTERFACE: "access",
    INTERFACE_NOT_ACTIVE: "access",
    INTERFACE_DEPRECATED: "access",
    OPERATION_NOT_SUPPORTED: "request",
    UNDECLARED_ENVIRONMENT: "access",
    SANDBOX_ONLY: "access",
    NO_CONNECTION: "binding",
    NO_MATCH_FOR_CLIENT: "binding",
    NO_MATCH_FOR_ENVIRONMENT: "binding",
    AMBIGUOUS: "binding",
    NO_DECLARED_CANDIDATE: "binding",
    UNDECLARED_ENVIRONMENT_WRITE: "binding",
    CONNECTION_UNREADABLE: "binding",
    UNKNOWN_PRODUCT: "binding",
    WRITES_DISABLED: "binding",
    TRANSPORT_UNAVAILABLE: "binding",
    CIRCUIT_OPEN: "binding",
    HOST_NOT_ALLOWED: "binding",
    IDEMPOTENCY_CONFLICT: "request",
    IDEMPOTENCY_IN_FLIGHT: "request",
  };

  const AUDITED = ROWS.filter(([, , c]) => !c.unaudited);

  it.each(AUDITED)("%s on %s", async (reason, route, c) => {
    c.set();
    await call(route);
    const row = h.audits.at(-1) as Record<string, unknown>;
    const { brokenHop, outcome } = attributeAuditRow({
      status: row.status as number,
      // A console read's row is written by recordConsoleRead, which names the operation itself.
      operation: (row.operation as string | undefined) ?? "READ",
      bindingRefusal: (row.bindingRefusal as string | null | undefined) ?? null,
      failureReason: (row.failureReason as string | null | undefined) ?? null,
      durationMs: (row.durationMs as number | null | undefined) ?? null,
      connectionId: (row.connectionId as string | null | undefined) ?? null,
      replayed: (row.replayed as boolean | undefined) ?? false,
    });
    expect(brokenHop).toBe(HOP[reason]);
    expect(outcome).toContain("Nothing was sent to SAP");
  });
});

/*
 * A BREAKER STORE THAT STOPS ANSWERING HOLDS NO CALL. The default mode only
 * observes, and a deploy with it must change no answer: so an Upstash that
 * accepts the connection and never replies must not hang the call, and on a
 * write must not strand the Idempotency-Key, or leave a write SAP performed
 * without its stored outcome and audit row. Every store operation is bounded
 * (circuit-breaker.ts STORE_DEADLINE_MS) and treated like a store error when
 * it runs out; the write's outcome reaches the breaker only after the key is
 * completed and the row written.
 */
describe("a breaker store that never answers (default observe)", () => {
  const never = new Promise<never>(() => undefined);

  /** Answers its first `answered` reads, then never answers again. */
  class HangingStore extends MemoryCircuitStore {
    reads = 0;
    seenAtRecord: { completed: number; audits: number } | null = null;
    constructor(private readonly answered: number) {
      super({ shared: true });
    }
    override async read(key: string): Promise<string | null> {
      this.reads += 1;
      if (this.reads === 2) this.seenAtRecord = { completed: h.idempotency.completed, audits: h.audits.length };
      if (this.reads > this.answered) return never;
      return super.read(key);
    }
    override async compareAndSet(): Promise<boolean> {
      return never;
    }
  }

  const BOUND = 2 * STORE_DEADLINE_MS + 1_500;

  it.each(["read", "write", "preview"] as const)(
    "%s is answered and audited when the store hangs from the start",
    async (route) => {
      __setGovernedCircuitStore(new HangingStore(0));
      const startedAt = Date.now();
      const { status } = await call(route);
      expect([200, 201]).toContain(status);
      expect(Date.now() - startedAt).toBeLessThan(BOUND);
      expect(h.audits.length).toBe(1);
      expect(h.audits[0]!.status).toBe(status);
      if (route === "write") expect(h.idempotency).toEqual({ completed: 1, released: 0 });
    },
    10_000,
  );

  it(
    "a write whose outcome cannot be reported still stores SAP's result and audits it first",
    async () => {
      // The first read (before the call) answers; reporting the outcome hangs.
      const store = new HangingStore(1);
      __setGovernedCircuitStore(store);
      const { status } = await call("write");
      expect(status).toBe(201);
      expect(store.reads).toBe(2);
      expect(h.idempotency).toEqual({ completed: 1, released: 0 });
      expect(h.audits.map((r) => r.status)).toEqual([201]);
      // Already stored and audited when the breaker was told.
      expect(store.seenAtRecord).toEqual({ completed: 1, audits: 1 });
    },
    10_000,
  );
});

/*
 * ONE SOLUTION'S WRITES CANNOT REFUSE ANOTHER'S CALLS. A write's payload is
 * the caller's choice, and SAP answers a bad one with a 500 (a Gateway
 * technical exception, a RAP short dump) as readily as with a 400; enough
 * writes get a 429. Counted, five such writes would open the circuit every
 * solution on the connection shares, and under enforce refuse their reads
 * while SAP is healthy. So a write SAP ANSWERED never counts; a write it did
 * not answer (timed out, unreachable, the credential step failed) does.
 */
describe("enforced, write outcomes SAP answered do not open the connection's circuit", () => {
  const sapAnswered = (httpStatus: number, attempted: boolean) => ({
    status: "ERROR",
    httpStatus,
    record: null,
    location: null,
    detail: `The tenant responded with HTTP ${httpStatus}.`,
    durationMs: 1,
    failureReason: `HTTP_${httpStatus}`,
    attempted,
  });

  beforeEach(() => {
    __setGovernedCircuitStore(new MemoryCircuitStore());
    vi.stubEnv("COREEDGE_CIRCUIT_BREAKER", "enforce");
  });

  it.each([
    ["SAP's 500 to the payload", sapAnswered(500, true)],
    ["SAP's 503 to the POST", sapAnswered(503, true)],
    ["SAP's 429", sapAnswered(429, false)],
  ])("%s, written past the threshold, leaves another solution's read served", async (_label, result) => {
    h.writeResult = result;
    for (let i = 0; i <= FAILURE_THRESHOLD; i++) expect((await call("write")).status).toBe(502);
    h.writeResult = null;
    expect((await call("read")).status).toBe(200);
  });

  it("writes SAP never answered still open it", async () => {
    h.writeResult = { ...sapAnswered(0, true), status: "TIMEOUT", httpStatus: null, failureReason: "TIMEOUT" };
    for (let i = 0; i < FAILURE_THRESHOLD; i++) expect((await call("write")).status).toBe(504);
    h.writeResult = null;
    expect((await call("read")).status).toBe(503);
    expect(h.audits.at(-1)).toMatchObject({ status: 503, failureReason: "CIRCUIT_OPEN" });
  });
});
