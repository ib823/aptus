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
  audits: [] as { status: number }[],
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
  completeIdempotencyKey: async () => undefined,
  releaseIdempotencyKey: async () => undefined,
}));
vi.mock("@/lib/northbound/read", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readEntitySet: async () => ({ status: "OK", httpStatus: 200, records: [{ a: 1 }], detail: "1 record.", durationMs: 1, failureReason: null }),
}));
vi.mock("@/lib/northbound/write", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeEntitySet: async () => ({
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
  },
}));
vi.mock("@/lib/sap-public/probe-guard", () => ({ refuseUnlessMayProbeTenant: async () => null }));
vi.mock("@/lib/sap-public/tenant-for-read", async (importOriginal) => ({
  ...(await importOriginal<typeof TenantForRead>()),
  resolveReadTenant: async () => ({
    tenant: { key: "dev", label: "DEV", baseUrl: "https://my000001-api.s4hana.cloud.sap" },
    source: "connection",
    connection: { id: "conn_1", environment: "DEV" },
  }),
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
import { __setGovernedCircuitStore, governedCircuitBreaker } from "@/lib/governed/containment";
import { REFUSAL_STATUS, type RefusalReason } from "@/lib/governed/pipeline";
import { FAILURE_THRESHOLD, MemoryCircuitStore } from "@/lib/northbound/circuit-breaker";

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
    audits: [],
    writeBody: undefined,
    noKey: false,
    runEntity: undefined,
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
