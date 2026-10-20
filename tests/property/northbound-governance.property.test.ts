// @vitest-environment node
/**
 * The broker's governance decision, against an independent oracle (P0.15).
 *
 * WHAT IS UNDER TEST. The two northbound routes — the read
 * (`GET /api/northbound/interfaces/[id]/data`) and the create
 * (`POST .../data/write`) — run for real, with the real credential check
 * (auth.ts, key-policy.ts), the real access check (access.ts, grants.ts,
 * grant-binding.ts), the real connection binding (connection-resolver.ts) and
 * the real service resolution. Only the edges are replaced: the database is an
 * in-memory fake that evaluates the broker's own `where` clauses, and the
 * limiter, the write-key check, the idempotency store, the audit insert and the
 * two SAP executors are stubs that record what they were asked.
 *
 * THE ORACLE (`expected` below) is written from
 * docs/runbooks/coreedge-governance-decision-table.md, which collects the
 * rules from the credential, grant-binding and rate-limit runbooks. It imports
 * nothing from src/: if it reused the broker's predicates, a wrong predicate
 * would agree with itself.
 *
 * THE CASES are generated: four exhaustive grids (credential states, grants
 * and policy, interfaces and connections, the write switches) and a seeded
 * random sample over every factor at once, with several grants and
 * connections per case. More than 10,000 combinations in all, asserted below.
 * For each, the broker's answer (allowed or refused, the HTTP status and the
 * refusal reason) must equal the oracle's, nothing may reach SAP on a refusal,
 * and every refusal after authentication must leave exactly one audit row.
 */

import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AccessModule from "@/lib/northbound/access";
import type * as IdempotencyModule from "@/lib/northbound/idempotency";
import type * as ResolverModule from "@/lib/sap-public/connection-resolver";

/* ── the world one case runs in ───────────────────────────────────────── */

type Row = Record<string, unknown>;
interface World {
  clients: Row[];
  retired: { tokenHash: string; client: Row }[];
  solutions: Row[];
  interfaces: Row[];
  grants: Row[];
  connections: Row[];
}

const h = vi.hoisted(() => ({
  world: null as unknown as World,
  rate: { allowed: true, remaining: 59, resetMs: 0 } as Record<string, unknown>,
  writeKeyValid: true,
  observed: {
    authReason: null as string | null,
    accessReason: null as string | null,
    bindingReason: null as string | null,
    bindingCalled: false,
    accessCalled: false,
    rateCalled: false,
    executorCalls: 0,
    audits: [] as Record<string, unknown>[],
  },
}));

/**
 * Evaluate a Prisma `where` the way the database would, for the shapes the
 * broker uses: equality (null included) and OR. Anything else throws, so a
 * broker query this fake cannot judge fails the test instead of passing it.
 */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some((w) => matches(row, w));
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      throw new Error(`fake prisma: unsupported where on ${key}: ${JSON.stringify(value)}`);
    }
    return (row[key] ?? null) === value;
  });
}

vi.mock("@/lib/db/prisma", () => {
  const w = () => h.world;
  return {
    prisma: {
      solutionClient: {
        findUnique: async ({ where }: { where: Row }) => w().clients.find((c) => matches(c, where)) ?? null,
        update: async () => ({}),
      },
      retiredClientToken: {
        findUnique: async ({ where }: { where: Row }) => {
          const r = w().retired.find((x) => x.tokenHash === where.tokenHash);
          return r ? { client: r.client } : null;
        },
      },
      solution: { findFirst: async ({ where }: { where: Row }) => w().solutions.find((s) => matches(s, where)) ?? null },
      interface: { findFirst: async ({ where }: { where: Row }) => w().interfaces.find((i) => matches(i, where)) ?? null },
      apiAccessGrant: {
        findMany: async ({ where }: { where: Row }) => w().grants.filter((g) => matches(g, where)),
        updateMany: async () => ({ count: 0 }),
      },
      sapConnection: { findMany: async ({ where }: { where: Row }) => w().connections.filter((c) => matches(c, where)) },
    },
  };
});

vi.mock("@/lib/sap-public/secret-envelope", () => ({
  openSecretsForOrg: async () => ({ username: "comm_user", password: "secret" }),
  sealSecretsForOrg: async () => "sealed",
}));
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  checkRateLimit: async () => {
    h.observed.rateCalled = true;
    return h.rate;
  },
}));
vi.mock("@/lib/northbound/write-credential", () => ({ verifyWriteCredential: async () => h.writeKeyValid }));
vi.mock("@/lib/northbound/auth-failures", () => ({
  noteFailedCredential: async (_headers: unknown, _bearer: unknown, reason: string) => {
    h.observed.authReason = reason;
  },
}));
vi.mock("@/lib/northbound/audit", () => ({
  recordNorthboundCall: async (row: Record<string, unknown>) => {
    h.observed.audits.push(row);
  },
}));
vi.mock("@/lib/northbound/idempotency", async (importOriginal) => ({
  ...(await importOriginal<typeof IdempotencyModule>()),
  reserveIdempotencyKey: async () => ({ outcome: "proceed", recordId: "rec_1" }),
  completeIdempotencyKey: async () => undefined,
  releaseIdempotencyKey: async () => undefined,
}));
vi.mock("@/lib/northbound/read", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readEntitySet: async () => {
    h.observed.executorCalls++;
    return { status: "OK", httpStatus: 200, records: [{ id: "1" }], detail: "1 record.", durationMs: 1, failureReason: null };
  },
}));
vi.mock("@/lib/northbound/write", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeEntitySet: async () => {
    h.observed.executorCalls++;
    return {
      status: "CREATED",
      httpStatus: 201,
      record: { id: "1" },
      location: "/A_X('1')",
      detail: "Created.",
      durationMs: 1,
      failureReason: null,
      attempted: true,
    };
  },
}));
// Observe, never replace: the real access check and the real binding run.
vi.mock("@/lib/northbound/access", async (importOriginal) => {
  const real = await importOriginal<typeof AccessModule>();
  const observe =
    (fn: typeof real.resolveReadableInterface) =>
    async (...args: Parameters<typeof real.resolveReadableInterface>) => {
      h.observed.accessCalled = true;
      const result = await fn(...args);
      if (!result.ok) h.observed.accessReason = result.reason;
      return result;
    };
  return {
    ...real,
    resolveReadableInterface: observe(real.resolveReadableInterface),
    resolveWritableInterface: observe(real.resolveWritableInterface),
  };
});
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const real = await importOriginal<typeof ResolverModule>();
  return {
    ...real,
    resolveSapConnectionForEnvironment: async (...args: Parameters<typeof real.resolveSapConnectionForEnvironment>) => {
      h.observed.bindingCalled = true;
      const result = await real.resolveSapConnectionForEnvironment(...args);
      if (!result.ok) h.observed.bindingReason = result.reason;
      return result;
    },
  };
});

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { POST as writeRoute } from "@/app/api/northbound/interfaces/[id]/data/write/route";

/* ── the factors ──────────────────────────────────────────────────────── */

const ENVS = ["SANDBOX", "DEV", "TEST", "PROD"] as const;
type Env = (typeof ENVS)[number];
const DECISIONS = ["REQUESTED", "APPROVED", "SANDBOX_ONLY", "READ_ONLY", "REJECTED", "EXPIRED"] as const;
type Decision = (typeof DECISIONS)[number];
const LOOKUPS = ["none", "unknown", "current", "previous", "dropped"] as const;
const SOLUTION_STATES = ["DRAFT", "ACTIVE", "RESTRICTED", "RETIRED", "MISSING"] as const;
const RATES = ["allowed", "limited", "unavailable"] as const;
const BINDINGS = ["this", "thisOtherProduct", "otherInterface", "unboundMatched", "unboundUnstampedMatched", "unboundLater"] as const;

interface Credential {
  lookup: (typeof LOOKUPS)[number];
  revoked: boolean;
  active: boolean;
  expired: boolean;
  /** Previous key only: the overlap window is still open. */
  windowOpen: boolean;
  /** Previous key only: the overlap still belongs to the current key. */
  overlapBound: boolean;
  env: Env;
  sapClient: string | null;
}
interface Grant {
  binding: (typeof BINDINGS)[number];
  sameEnv: boolean;
  sameSolution: boolean;
  sameOperation: boolean;
  decision: Decision;
  revoked: boolean;
  expired: boolean;
}
interface Iface {
  where: "mine" | "otherSolution" | "missing";
  mode: "READ" | "WRITE";
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  operation: "READ" | "CREATE" | "UPDATE";
  product: "s4hana" | "bogus";
  custom: boolean;
}
interface Connection {
  env: Env | null;
  client: string | null;
  writeEnabled: boolean;
  readable: boolean;
  active: boolean;
  /** The interface's own service was verified in the credential's environment through this connection. */
  verified: boolean;
}
interface Case {
  route: "read" | "write";
  cred: Credential;
  solution: (typeof SOLUTION_STATES)[number];
  writeKey: boolean;
  rate: (typeof RATES)[number];
  idempotencyKey: boolean;
  iface: Iface;
  grants: Grant[];
  mode: "legacy" | "strict";
  connections: Connection[];
}

/* ── the oracle, from the decision-table runbook ──────────────────────── */

interface Decision_ {
  allow: boolean;
  status: number;
  reason: string;
}
const refuse = (status: number, reason: string): Decision_ => ({ allow: false, status, reason });

function expected(c: Case): Decision_ {
  // Stage 1: the credential (401 for every reason).
  const k = c.cred;
  if (k.lookup === "none") return refuse(401, "NO_TOKEN");
  if (k.lookup === "unknown") return refuse(401, "UNKNOWN_TOKEN");
  if (k.revoked) return refuse(401, "REVOKED");
  if (!k.active) return refuse(401, "INACTIVE");
  if (k.lookup === "dropped") return refuse(401, "ROTATED_OUT");
  if (k.lookup === "previous" && (!k.windowOpen || !k.overlapBound)) return refuse(401, "ROTATED_OUT");
  if (k.expired) return refuse(401, "EXPIRED");
  if (c.solution === "MISSING") return refuse(401, "SOLUTION_MISSING");
  if (c.solution === "RETIRED") return refuse(401, "SOLUTION_RETIRED");

  const write = c.route === "write";
  // Stage 2: the write key.
  if (write && !c.writeKey) return refuse(403, "WRITE_KEY_INVALID");
  // Stage 3: the credential's own limit.
  if (c.rate === "limited") return refuse(429, "RATE_LIMITED");
  if (c.rate === "unavailable") return refuse(503, "LIMITER_UNAVAILABLE");
  // Stage 4: the idempotency key.
  if (write && !c.idempotencyKey) return refuse(400, "IDEMPOTENCY_KEY_REQUIRED");

  // Stage 5: the interface.
  const i = c.iface;
  if (i.where === "missing") return refuse(404, "INTERFACE_NOT_FOUND");
  if (i.where === "otherSolution") return refuse(404, "NOT_THIS_SOLUTION");
  if (!write) {
    if (i.mode === "WRITE") return refuse(403, "WRITE_NOT_SERVED");
    if (i.status === "DEPRECATED") return refuse(403, "INTERFACE_DEPRECATED");
  } else {
    if (i.mode !== "WRITE") return refuse(403, "READ_ONLY_INTERFACE");
    if (i.status !== "ACTIVE") return refuse(403, "INTERFACE_NOT_ACTIVE");
    if (i.operation !== "CREATE") return refuse(400, "OPERATION_NOT_SUPPORTED");
  }

  // Stage 6: the grant. Considered: this app, this environment, this service and operation.
  const considered = c.grants.filter((g) => g.sameSolution && g.sameEnv && g.sameOperation);
  const counts = (g: Grant): boolean => {
    if (g.binding === "this") return true;
    if (g.binding === "thisOtherProduct" || g.binding === "otherInterface") return false;
    if (c.mode === "strict") return false;
    return g.binding === "unboundMatched" || g.binding === "unboundUnstampedMatched";
  };
  const authorises = (g: Grant): boolean => {
    if (write) {
      if (g.decision === "APPROVED") return true;
      return g.decision === "SANDBOX_ONLY" && k.env === "SANDBOX";
    }
    if (g.decision === "APPROVED" || g.decision === "READ_ONLY") return true;
    return g.decision === "SANDBOX_ONLY" && k.env === "SANDBOX";
  };
  const fetched = considered.filter((g) => g.binding !== "thisOtherProduct" && g.binding !== "otherInterface");
  const granting = fetched.filter((g) => counts(g) && authorises(g));
  if (granting.length === 0) {
    const setAside = fetched.some((g) => !counts(g) && authorises(g) && !g.revoked && !g.expired);
    return refuse(403, setAside ? "GRANT_NEEDS_REAPPROVAL" : "NO_APPROVED_GRANT");
  }
  if (granting.every((g) => g.revoked)) return refuse(403, "GRANT_REVOKED");
  if (!granting.some((g) => !g.revoked && !g.expired)) return refuse(403, "GRANT_EXPIRED");

  // Stage 7: the connection (only active ones count).
  if (i.product === "bogus") return refuse(403, "UNKNOWN_PRODUCT");
  const active = c.connections.filter((x) => x.active);
  if (active.some((x) => !x.readable)) return refuse(403, "CONNECTION_UNREADABLE");
  if (active.length === 0) return refuse(403, "NO_CONNECTION");
  const forEnv = active.filter((x) => x.env === k.env);
  const exact = k.sapClient ? forEnv.filter((x) => x.client === k.sapClient) : forEnv;
  let bound: Connection;
  if (exact.length === 1) bound = exact[0]!;
  else if (exact.length > 1) return refuse(403, "AMBIGUOUS");
  else if (k.sapClient && forEnv.length > 0) return refuse(403, "NO_MATCH_FOR_CLIENT");
  else {
    const undeclared = active.filter((x) => x.env === null);
    if (undeclared.length === 0) return refuse(403, "NO_MATCH_FOR_ENVIRONMENT");
    if (write) return refuse(403, "UNDECLARED_ENVIRONMENT_WRITE");
    if (active.length !== 1) return refuse(403, "NO_DECLARED_CANDIDATE");
    const only = active[0]!;
    if (k.sapClient && only.client !== null && only.client !== k.sapClient) return refuse(403, "NO_MATCH_FOR_CLIENT");
    bound = only;
  }

  // Stage 8: the write switches.
  if (write) {
    if (!bound.writeEnabled) return refuse(403, "WRITES_DISABLED");
    if (i.custom && !bound.verified) return refuse(400, "CUSTOM_SERVICE_UNVERIFIED");
  }
  return { allow: true, status: write ? 201 : 200, reason: "ALLOWED" };
}

/* ── building the world for a case ────────────────────────────────────── */

const ORG = "org_a";
const SOLUTION = "sol_1";
const IFACE = "if_1";
const TOKEN = "ce_test_property_token";
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");
const NOW = Date.now();
const HOUR = 3_600_000;
const T0 = new Date(NOW - 30 * 24 * HOUR); // when the interface was created
const at = (offsetHours: number) => new Date(T0.getTime() + offsetHours * HOUR);
const future = () => new Date(NOW + 30 * 24 * HOUR);
const past = () => new Date(NOW - HOUR);
const CUSTOM_PATH = "/sap/opu/odata/sap/ZUI_TRAVEL_O2";

function otherEnv(env: Env): Env {
  return env === "PROD" ? "DEV" : "PROD";
}

function buildWorld(c: Case): World {
  const k = c.cred;
  const client: Row = {
    id: "cli_1",
    organizationId: ORG,
    solutionId: SOLUTION,
    environment: k.env,
    sapClient: k.sapClient,
    isActive: k.active,
    revokedAt: k.revoked ? past() : null,
    expiresAt: k.expired ? past() : future(),
    previousValidUntil: k.windowOpen ? new Date(NOW + HOUR) : past(),
    tokenHash: k.lookup === "current" ? TOKEN_HASH : "hash_of_the_current_key",
    previousTokenHash: k.lookup === "previous" ? TOKEN_HASH : null,
    overlapForTokenHash: null,
  };
  client.overlapForTokenHash = k.overlapBound ? client.tokenHash : "hash_of_some_other_key";

  const i = c.iface;
  const externalId = i.custom ? `custom:${CUSTOM_PATH}` : "supplier-invoices";
  const interfaces: Row[] =
    i.where === "missing"
      ? []
      : [
          {
            id: IFACE,
            organizationId: ORG,
            solutionId: i.where === "mine" ? SOLUTION : "sol_2",
            name: "Supplier invoices",
            externalId,
            sapProduct: i.product,
            entitySet: "A_SupplierInvoice",
            operation: i.operation,
            mode: i.mode,
            version: 1,
            status: i.status,
            servicePath: i.custom ? CUSTOM_PATH : null,
            odataVersion: i.custom ? "V2" : null,
            serviceVerifiedAt: null,
            serviceVerifications: Object.fromEntries(
              c.connections
                .map((x, n) => [x, n] as const)
                .filter(([x]) => x.verified)
                .map(([x, n]) => [
                  `${k.env}::${x.client ?? ""}`,
                  { environment: k.env, at: T0.toISOString(), connectionId: `conn_${n}`, sapClient: x.client, baseUrl: `https://my${n}.s4hana.ondemand.com` },
                ]),
            ),
            createdAt: T0,
            grantMatchChangedAt: null,
          },
        ];

  const grants: Row[] = c.grants.map((g, n) => {
    const bound = g.binding === "this" || g.binding === "thisOtherProduct" || g.binding === "otherInterface";
    return {
      id: `grant_${n}`,
      organizationId: ORG,
      solutionId: g.sameSolution ? SOLUTION : "sol_2",
      environment: g.sameEnv ? k.env : otherEnv(k.env),
      externalId,
      operation: g.sameOperation ? i.operation : i.operation === "READ" ? "CREATE" : "READ",
      decision: g.decision,
      revokedAt: g.revoked ? past() : null,
      expiresAt: g.expired ? past() : future(),
      interfaceId: bound ? (g.binding === "otherInterface" ? "if_9" : IFACE) : null,
      sapProduct: bound ? (g.binding === "thisOtherProduct" ? "s4hana-onprem" : i.product) : null,
      unboundLastUsedAt: null,
      // Unbound: matched at the cut-off (the deploy stamp, or the grant's own
      // creation when unstamped), or the interface began to match only later.
      createdAt: g.binding === "unboundUnstampedMatched" ? at(1) : at(-48),
      unboundCutoffAt: g.binding === "unboundMatched" ? at(2) : g.binding === "unboundLater" ? at(-1) : null,
    };
  });

  const connections: Row[] = c.connections.map((x, n) => ({
    id: `conn_${n}`,
    organizationId: ORG,
    // A bogus interface product never reaches the binding; keep rows on the real one.
    product: i.product === "bogus" ? "s4hana" : i.product,
    key: `conn-${n}`,
    label: `Connection ${n}`,
    baseUrl: `https://my${n}.s4hana.ondemand.com`,
    authType: x.readable ? "basic" : "kerberos",
    secretsCiphertext: "sealed",
    oauthTokenUrl: null,
    writeEnabled: x.writeEnabled,
    apiPath: null,
    timeoutMs: null,
    environment: x.env,
    client: x.client,
    isActive: x.active,
    createdAt: at(n),
  }));

  return {
    clients: k.lookup === "current" || k.lookup === "previous" ? [client] : [],
    retired: k.lookup === "dropped" ? [{ tokenHash: TOKEN_HASH, client }] : [],
    solutions: c.solution === "MISSING" ? [] : [{ id: SOLUTION, organizationId: ORG, status: c.solution }],
    interfaces,
    grants,
    connections,
  };
}

/* ── running the broker on a case ─────────────────────────────────────── */

interface Observed {
  allow: boolean;
  status: number;
  reason: string;
  audits: number;
  draftHeader: boolean;
}

async function runBroker(c: Case): Promise<Observed> {
  h.world = buildWorld(c);
  h.rate =
    c.rate === "allowed"
      ? { allowed: true, remaining: 59, resetMs: 0 }
      : { allowed: false, remaining: 0, resetMs: 9_000, reason: c.rate === "limited" ? "limited" : "unavailable" };
  h.writeKeyValid = c.writeKey;
  h.observed = {
    authReason: null,
    accessReason: null,
    bindingReason: null,
    bindingCalled: false,
    accessCalled: false,
    rateCalled: false,
    executorCalls: 0,
    audits: [],
  };
  vi.stubEnv("COREEDGE_GRANT_BINDING", c.mode);

  const headers: Record<string, string> = {};
  if (c.cred.lookup !== "none") headers.authorization = `Bearer ${TOKEN}`;
  const params = { params: Promise.resolve({ id: IFACE }) };
  let res: Response;
  if (c.route === "read") {
    res = await readRoute(new NextRequest(`http://localhost/api/northbound/interfaces/${IFACE}/data`, { headers }), params);
  } else {
    headers["x-coreedge-write-key"] = "cew_property";
    headers["content-type"] = "application/json";
    if (c.idempotencyKey) headers["idempotency-key"] = "property-key-0001";
    res = await writeRoute(
      new NextRequest(`http://localhost/api/northbound/interfaces/${IFACE}/data/write`, {
        method: "POST",
        headers,
        body: JSON.stringify({ record: { Supplier: "1000" } }),
      }),
      params,
    );
  }

  const o = h.observed;
  const allow = o.executorCalls > 0;
  // A binding refusal is read from the broker's own audit row, which names it
  // (an unknown product is refused by the route before the resolver runs);
  // when the resolver did run, the two must agree.
  const auditedBinding = (o.audits.at(-1)?.bindingRefusal as string | null | undefined) ?? null;
  if (o.bindingReason !== null && o.bindingReason !== auditedBinding) {
    return { allow, status: res.status, reason: `AUDIT_DISAGREES_${o.bindingReason}_${auditedBinding}`, audits: o.audits.length, draftHeader: false };
  }
  // The stage that refused, read from what each stage reported.
  let reason = "ALLOWED";
  if (o.authReason) reason = o.authReason;
  else if (c.route === "write" && !o.rateCalled && res.status === 403) reason = "WRITE_KEY_INVALID";
  else if (o.rateCalled && h.rate.allowed !== true) reason = h.rate.reason === "unavailable" ? "LIMITER_UNAVAILABLE" : "RATE_LIMITED";
  else if (c.route === "write" && o.rateCalled && !o.accessCalled && res.status === 400) reason = "IDEMPOTENCY_KEY_REQUIRED";
  else if (o.accessReason) reason = o.accessReason;
  else if (auditedBinding) reason = auditedBinding;
  else if (!allow && o.bindingCalled && res.status === 403) reason = "WRITES_DISABLED";
  else if (!allow && o.bindingCalled && res.status === 400) reason = "CUSTOM_SERVICE_UNVERIFIED";
  else if (!allow) reason = `UNEXPLAINED_${res.status}`;
  return {
    allow,
    status: res.status,
    reason,
    audits: o.audits.length,
    draftHeader: res.headers.get("x-coreedge-interface-status") === "DRAFT",
  };
}

/* ── generating the cases ─────────────────────────────────────────────── */

const LIVE_CRED: Credential = {
  lookup: "current",
  revoked: false,
  active: true,
  expired: false,
  windowOpen: true,
  overlapBound: true,
  env: "TEST",
  sapClient: null,
};
const GOOD_GRANT: Grant = {
  binding: "this",
  sameEnv: true,
  sameSolution: true,
  sameOperation: true,
  decision: "APPROVED",
  revoked: false,
  expired: false,
};
const GOOD_CONNECTION = (env: Env | null, client: string | null = null): Connection => ({
  env,
  client,
  writeEnabled: true,
  readable: true,
  active: true,
  verified: true,
});

function baseCase(route: Case["route"]): Case {
  return {
    route,
    cred: LIVE_CRED,
    solution: "ACTIVE",
    writeKey: true,
    rate: "allowed",
    idempotencyKey: true,
    iface: {
      where: "mine",
      mode: route === "write" ? "WRITE" : "READ",
      status: "ACTIVE",
      operation: route === "write" ? "CREATE" : "READ",
      product: "s4hana",
      custom: false,
    },
    grants: [GOOD_GRANT],
    mode: "legacy",
    connections: [GOOD_CONNECTION("TEST")],
  };
}

const bools = [false, true] as const;
const ROUTES = ["read", "write"] as const;

/** Grid A: every credential state, app state and limiter answer. */
function credentialGrid(): Case[] {
  const out: Case[] = [];
  for (const route of ROUTES)
    for (const lookup of LOOKUPS)
      for (const revoked of bools)
        for (const active of bools)
          for (const expired of bools)
            for (const windowOpen of bools)
              for (const overlapBound of bools)
                for (const solution of SOLUTION_STATES)
                  for (const rate of RATES)
                    out.push({
                      ...baseCase(route),
                      cred: { ...LIVE_CRED, lookup, revoked, active, expired, windowOpen, overlapBound },
                      solution,
                      rate,
                    });
  return out;
}

/** Grid B: every single-grant shape, under both binding modes, in every environment. */
function grantGrid(): Case[] {
  const out: Case[] = [];
  for (const route of ROUTES)
    for (const binding of BINDINGS)
      for (const sameEnv of bools)
        for (const sameOperation of bools)
          for (const decision of DECISIONS)
            for (const revoked of bools)
              for (const expired of bools)
                for (const mode of ["legacy", "strict"] as const)
                  for (const env of ENVS) {
                    const c = baseCase(route);
                    out.push({
                      ...c,
                      cred: { ...LIVE_CRED, env },
                      mode,
                      grants: [{ ...GOOD_GRANT, binding, sameEnv, sameOperation, decision, revoked, expired }],
                      connections: [GOOD_CONNECTION(env)],
                    });
                  }
  return out;
}

const CONNECTION_SETS: ReadonlyArray<(env: Env) => Connection[]> = [
  () => [],
  (e) => [GOOD_CONNECTION(e)],
  (e) => [GOOD_CONNECTION(otherEnv(e))],
  () => [GOOD_CONNECTION(null)],
  () => [GOOD_CONNECTION(null, "080")],
  (e) => [GOOD_CONNECTION(e), GOOD_CONNECTION(e)],
  (e) => [GOOD_CONNECTION(e, "100"), GOOD_CONNECTION(e, "080")],
  (e) => [GOOD_CONNECTION(e, "080")],
  (e) => [GOOD_CONNECTION(otherEnv(e)), GOOD_CONNECTION(null)],
  (e) => [{ ...GOOD_CONNECTION(e), readable: false }],
  (e) => [{ ...GOOD_CONNECTION(e), active: false }],
  (e) => [{ ...GOOD_CONNECTION(e), active: false }, GOOD_CONNECTION(e)],
];

/** Grid C: every interface shape against every connection estate. */
function interfaceGrid(): Case[] {
  const out: Case[] = [];
  for (const route of ROUTES)
    for (const where of ["mine", "otherSolution", "missing"] as const)
      for (const mode of ["READ", "WRITE"] as const)
        for (const status of ["DRAFT", "ACTIVE", "DEPRECATED"] as const)
          for (const operation of ["READ", "CREATE", "UPDATE"] as const)
            for (const product of ["s4hana", "bogus"] as const)
              for (const sapClient of [null, "100"])
                for (const connections of CONNECTION_SETS) {
                  const c = baseCase(route);
                  out.push({
                    ...c,
                    cred: { ...LIVE_CRED, sapClient },
                    iface: { ...c.iface, where, mode, status, operation, product },
                    connections: connections(LIVE_CRED.env),
                  });
                }
  return out;
}

/** Grid D: the write switches, the write key and the idempotency key. */
function writeSwitchGrid(): Case[] {
  const out: Case[] = [];
  for (const route of ROUTES)
    for (const writeKey of bools)
      for (const idempotencyKey of bools)
        for (const writeEnabled of bools)
          for (const custom of bools)
            for (const verified of bools)
              for (const rate of RATES) {
                const c = baseCase(route);
                out.push({
                  ...c,
                  writeKey,
                  idempotencyKey,
                  rate,
                  iface: { ...c.iface, custom },
                  connections: [{ ...GOOD_CONNECTION("TEST"), writeEnabled, verified }],
                });
              }
  return out;
}

/** A seeded generator, so a failure names a case that can be run again. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The random sample: every factor at once, with up to three grants and three connections. */
function randomCases(count: number, seed = 0x0015_c0de): Case[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const flip = (pTrue = 0.5) => rnd() < pTrue;
  const out: Case[] = [];
  for (let n = 0; n < count; n++) {
    const env = pick(ENVS);
    const sapClient = flip(0.3) ? pick(["100", "080"]) : null;
    const grants: Grant[] = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
      binding: pick(BINDINGS),
      sameEnv: flip(0.8),
      sameSolution: flip(0.9),
      sameOperation: flip(0.85),
      decision: pick(DECISIONS),
      revoked: flip(0.2),
      expired: flip(0.2),
    }));
    const connections: Connection[] = Array.from({ length: Math.floor(rnd() * 4) }, () => ({
      env: flip(0.2) ? null : flip(0.7) ? env : pick(ENVS),
      client: flip(0.6) ? null : pick(["100", "080"]),
      writeEnabled: flip(0.8),
      readable: flip(0.95),
      active: flip(0.9),
      verified: flip(0.7),
    }));
    out.push({
      route: pick(ROUTES),
      cred: {
        lookup: flip(0.75) ? "current" : pick(LOOKUPS),
        revoked: flip(0.1),
        active: flip(0.9),
        expired: flip(0.1),
        windowOpen: flip(0.7),
        overlapBound: flip(0.8),
        env,
        sapClient,
      },
      solution: flip(0.8) ? "ACTIVE" : pick(SOLUTION_STATES),
      writeKey: flip(0.9),
      rate: flip(0.9) ? "allowed" : pick(RATES),
      idempotencyKey: flip(0.9),
      iface: {
        where: flip(0.9) ? "mine" : pick(["otherSolution", "missing"] as const),
        mode: pick(["READ", "WRITE"] as const),
        status: pick(["DRAFT", "ACTIVE", "DEPRECATED"] as const),
        operation: pick(["READ", "CREATE", "UPDATE"] as const),
        product: flip(0.95) ? "s4hana" : "bogus",
        custom: flip(0.3),
      },
      grants,
      mode: pick(["legacy", "strict"] as const),
      connections,
    });
  }
  return out;
}

/* ── the test ─────────────────────────────────────────────────────────── */

const GRIDS: Array<[string, () => Case[]]> = [
  ["credential states", credentialGrid],
  ["grants and binding policy", grantGrid],
  ["interfaces and connection estates", interfaceGrid],
  ["write switches", writeSwitchGrid],
  ["random sample over every factor", () => randomCases(12_000)],
];

beforeAll(() => {
  // The broker logs every refusal; 10,000 of them would bury a real failure.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("the broker's governance decision agrees with the decision-table oracle", () => {
  it("covers more than 10,000 generated combinations", () => {
    const total = GRIDS.reduce((sum, [, gen]) => sum + gen().length, 0);
    expect(total).toBeGreaterThan(10_000);
  });

  it.each(GRIDS)("%s", async (_name, generate) => {
    const cases = generate();
    const failures: string[] = [];
    const reasons = new Map<string, number>();
    for (const c of cases) {
      const want = expected(c);
      const got = await runBroker(c);
      reasons.set(want.reason, (reasons.get(want.reason) ?? 0) + 1);
      const problems: string[] = [];
      if (got.allow !== want.allow) problems.push(`allow ${got.allow}, oracle ${want.allow}`);
      if (got.status !== want.status) problems.push(`status ${got.status}, oracle ${want.status}`);
      if (got.reason !== want.reason) problems.push(`reason ${got.reason}, oracle ${want.reason}`);
      // Every refusal after authentication leaves exactly one audit row; an
      // allowed call leaves one too. A refused credential leaves none (it is
      // logged and counted, not audited).
      const wantAudits = want.status === 401 ? 0 : 1;
      if (got.audits !== wantAudits) problems.push(`audit rows ${got.audits}, expected ${wantAudits}`);
      const wantDraft = want.allow && c.route === "read" && c.iface.status === "DRAFT";
      if (got.draftHeader !== wantDraft) problems.push(`draft header ${got.draftHeader}, expected ${wantDraft}`);
      if (problems.length > 0 && failures.length < 5) failures.push(`${problems.join("; ")}\n  case: ${JSON.stringify(c)}`);
      else if (problems.length > 0) failures.push("");
    }
    expect(failures.length, `${failures.length} disagreements; first:\n${failures.filter(Boolean).join("\n")}`).toBe(0);
    // Not vacuous: the grid reaches both answers.
    expect(reasons.get("ALLOWED") ?? 0).toBeGreaterThan(0);
    expect(reasons.size).toBeGreaterThan(2);
  });

  it("reaches every refusal reason in the decision table", async () => {
    const all = GRIDS.flatMap(([, gen]) => gen());
    const seen = new Set(all.map((c) => expected(c).reason));
    for (const reason of [
      "NO_TOKEN",
      "UNKNOWN_TOKEN",
      "REVOKED",
      "INACTIVE",
      "ROTATED_OUT",
      "EXPIRED",
      "SOLUTION_MISSING",
      "SOLUTION_RETIRED",
      "WRITE_KEY_INVALID",
      "RATE_LIMITED",
      "LIMITER_UNAVAILABLE",
      "IDEMPOTENCY_KEY_REQUIRED",
      "INTERFACE_NOT_FOUND",
      "NOT_THIS_SOLUTION",
      "WRITE_NOT_SERVED",
      "INTERFACE_DEPRECATED",
      "READ_ONLY_INTERFACE",
      "INTERFACE_NOT_ACTIVE",
      "OPERATION_NOT_SUPPORTED",
      "GRANT_NEEDS_REAPPROVAL",
      "NO_APPROVED_GRANT",
      "GRANT_REVOKED",
      "GRANT_EXPIRED",
      "UNKNOWN_PRODUCT",
      "CONNECTION_UNREADABLE",
      "NO_CONNECTION",
      "AMBIGUOUS",
      "NO_MATCH_FOR_CLIENT",
      "NO_MATCH_FOR_ENVIRONMENT",
      "UNDECLARED_ENVIRONMENT_WRITE",
      "NO_DECLARED_CANDIDATE",
      "WRITES_DISABLED",
      "CUSTOM_SERVICE_UNVERIFIED",
      "ALLOWED",
    ]) {
      expect(seen, reason).toContain(reason);
    }
  });
});
