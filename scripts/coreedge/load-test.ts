/**
 * The governed broker under load, with SAP mocked (P0.19).
 *
 *   LOAD_TEST_DATABASE_URL=postgresql://… pnpm coreedge:load-test [options]
 *
 *   --rps=<n>               calls a second, open loop (default 20)
 *   --duration=<s>          seconds of load (default 10)
 *   --write-ratio=<0..1>    share of calls that are writes (default 0.1)
 *   --sap-latency-ms=<n>    how long the mocked SAP takes to answer (default 50)
 *   --connection-limit=<n>  the Prisma pool, as one serverless instance has it (default 5)
 *   --json                  print the report as JSON
 *
 * WHAT RUNS. The real northbound read and write route handlers, in this
 * process, through the whole governed pipeline: the credential lookup, the
 * rate limit (in memory: no Upstash here), the access load, the binding, the
 * circuit breaker (observe), the idempotency store, the audit insert. SAP is
 * a stub answering after `--sap-latency-ms` (the Tenant Twin, P1.6, does not
 * exist yet). Calls are fired on a fixed schedule whatever the latency (an
 * open loop), so a slow database shows as queueing, not as a lower rate.
 *
 * WHAT IT REPORTS. Achieved rate; latency p50, p95, p99 and max; the error
 * rate (any status the scenario did not expect); and the database round
 * trips per call: SQL statements (Prisma's query events, BEGIN and COMMIT
 * included) over calls, and Prisma operations per call by path, attributed to
 * each call (a query extension running in the call's own async context;
 * a raw statement is one operation, as it is one statement).
 *
 * WHAT IT IS NOT. One Node process with one pool is one instance, not a
 * fleet, and the database is whatever LOAD_TEST_DATABASE_URL names — a
 * laptop's Postgres says nothing about Neon's latency. The roadmap's target,
 * 50 calls a second sustained before P3, is to be run against a
 * production-like environment (docs/runbooks/coreedge-db-budget.md).
 *
 * SAFETY. It writes: an organisation of its own (`loadtest-<run>`), its
 * users, apps, keys, grants, a connection, audit rows and idempotency keys,
 * and deletes all of it when it finishes (the organisation cascades). It
 * reads only LOAD_TEST_DATABASE_URL — never DATABASE_URL — and refuses to run
 * with NODE_ENV=production. Nothing leaves the process: SAP is a stub.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const USAGE =
  "usage: LOAD_TEST_DATABASE_URL=postgresql://… tsx scripts/coreedge/load-test.ts [--rps=20] [--duration=10] [--write-ratio=0.1] [--sap-latency-ms=50] [--connection-limit=5] [--json]";

interface Options {
  rps: number;
  durationS: number;
  writeRatio: number;
  sapLatencyMs: number;
  connectionLimit: number;
  json: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = { rps: 20, durationS: 10, writeRatio: 0.1, sapLatencyMs: 50, connectionLimit: 5, json: false };
  for (const arg of argv) {
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const m = /^--([a-z-]+)=(.+)$/.exec(arg);
    const value = m ? Number(m[2]) : Number.NaN;
    if (!m || !Number.isFinite(value) || value < 0) throw new Error(`${USAGE}\nunrecognised: ${arg}`);
    if (m[1] === "rps" && value > 0) options.rps = value;
    else if (m[1] === "duration" && value > 0) options.durationS = value;
    else if (m[1] === "write-ratio" && value <= 1) options.writeRatio = value;
    else if (m[1] === "sap-latency-ms") options.sapLatencyMs = value;
    else if (m[1] === "connection-limit" && value >= 1) options.connectionLimit = Math.floor(value);
    else throw new Error(`${USAGE}\nunrecognised: ${arg}`);
  }
  return options;
}

/** The URL with the pool size one instance has. */
function withPool(url: string, connectionLimit: number): string {
  const u = new URL(url);
  u.searchParams.set("connection_limit", String(connectionLimit));
  u.searchParams.set("application_name", "coreedge-load-test");
  return u.toString();
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

interface CallResult {
  kind: "read" | "write";
  status: number;
  ok: boolean;
  latencyMs: number;
  operations: number;
}

export interface LoadReport {
  options: Options;
  calls: number;
  achievedRps: number;
  errorRate: number;
  statusCounts: Record<string, number>;
  latencyMs: { p50: number; p95: number; p99: number; max: number };
  latencyByKindMs: Record<string, { p50: number; p95: number }>;
  /** SQL statements Prisma sent while the load ran, over calls. */
  statementsPerCall: number;
  /** Prisma operations attributed to each call, by kind. */
  operationsPerCall: Record<string, { mean: number; max: number }>;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = process.env.LOAD_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error(`LOAD_TEST_DATABASE_URL is not set.\n${USAGE}`);
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run with NODE_ENV=production.");

  /*
   * THE COUNTED CLIENT. lib/db/prisma keeps its singleton on globalThis
   * outside production, so the app's own modules use this client once it is
   * placed there before they load: the same extensions (content-release
   * scope, tenant guard), plus the counters.
   */
  const callContext = new AsyncLocalStorage<{ operations: number }>();
  let statements = 0;
  const base = new PrismaClient({
    datasourceUrl: withPool(databaseUrl, options.connectionLimit),
    log: [{ emit: "event", level: "query" }],
  });
  base.$on("query", () => {
    statements += 1;
  });
  const { contentReleaseScope } = await import("@/lib/db/content-release-scope");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const counted = base
    .$extends(contentReleaseScope())
    .$extends(tenantScopeGuard())
    .$extends({
      name: "loadTestCounter",
      query: {
        async $allOperations({ args, query }: { args: unknown; query: (args: unknown) => Promise<unknown> }) {
          const store = callContext.getStore();
          if (store) store.operations += 1;
          return query(args);
        },
      },
    });
  (globalThis as unknown as { prisma: unknown }).prisma = counted;

  const { NextRequest } = await import("next/server");
  const { GET: readRoute } = await import("@/app/api/northbound/interfaces/[id]/data/route");
  const { POST: writeRoute } = await import("@/app/api/northbound/interfaces/[id]/data/write/route");
  const { hashClientToken } = await import("@/lib/northbound/auth");
  const { generateClientToken } = await import("@/lib/northbound/issue");
  const { setWriteCredential } = await import("@/lib/northbound/write-credential");
  const { upsertSapConnection } = await import("@/lib/sap-public/connection-resolver");
  const { tenantScopeOf } = await import("@/lib/studio/tenant-scope");
  const { RATE_LIMITS } = await import("@/lib/security/rate-limit");
  const prisma = counted as unknown as PrismaClient;

  /*
   * SAP, mocked. The connection's secrets are sealed with the deployment's
   * key; a local run with none set uses a throwaway one.
   */
  if (!process.env.SAP_CONNECTION_ENCRYPTION_KEY && !process.env.SAP_CONNECTION_ENCRYPTION_KEYS) {
    process.env.SAP_CONNECTION_ENCRYPTION_KEY = "c".repeat(64);
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    await sleep(options.sapLatencyMs);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && new Headers(init?.headers).get("x-csrf-token") === "Fetch") {
      return new Response("{}", { status: 200, headers: { "x-csrf-token": "csrf", "content-type": "application/json" } });
    }
    if (method === "POST") {
      return new Response(JSON.stringify({ d: { SupplierInvoice: "5100000001" } }), { status: 201, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ d: { results: [{ PurchaseOrder: "4500000001" }] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  /*
   * THE ESTATE. The per-credential limit is 60 calls a minute for reads and
   * 60 for writes (RATE_LIMITS.northbound), so the load is spread over
   * enough apps, each with its own DEV key, that no key is throttled: the
   * test measures the broker, not the limiter.
   */
  const run = `loadtest-${randomUUID().slice(0, 8)}`;
  const org = run;
  const user = `${run}-user`;
  const totalCalls = Math.round(options.rps * options.durationS);
  const perKeyMinute = RATE_LIMITS.northbound.limit - 5;
  const apps = Math.max(1, Math.ceil((options.rps * Math.min(60, options.durationS)) / perKeyMinute));
  const DAY = 86_400_000;

  const log = (line: string) => {
    if (!options.json) console.log(line);
  };
  log(`seeding ${apps} app(s) under ${org} …`);
  await prisma.organization.create({ data: { id: org, name: "Load test (deleted after the run)", type: "client" } });
  await prisma.user.create({ data: { id: user, email: `${run}@loadtest.invalid`, name: "Load test", role: "consultant", organizationId: org } });
  await upsertSapConnection({
    organizationId: org,
    product: "s4hana",
    key: `${run}-dev`,
    label: "S/4HANA DEV (mocked)",
    baseUrl: "https://my000001-api.s4hana.cloud.sap",
    authType: "basic",
    secrets: { username: "LOAD_TEST", password: "not-a-real-password" },
    environment: "DEV",
    writeEnabled: true,
  });
  const fleet: { token: string; writeKey: string; read: string; write: string }[] = [];
  for (let i = 0; i < apps; i++) {
    const solution = await prisma.solution.create({
      data: {
        organizationId: org,
        name: `Load ${i}`,
        slug: `${run}-${i}`,
        classification: "CLIENT_APP",
        businessProblem: "Load test.",
        dataClass: "INTERNAL",
        status: "ACTIVE",
      },
    });
    const iface = (externalId: string, operation: string, mode: string, entitySet: string) =>
      prisma.interface.create({
        data: { organizationId: org, solutionId: solution.id, name: externalId, sapProduct: "s4hana", externalId, operation, mode, entitySet, status: "ACTIVE" },
      });
    const read = await iface("purchase-orders", "READ", "READ", "A_PurchaseOrder");
    const write = await iface("supplier-invoices", "CREATE", "WRITE", "A_SupplierInvoice");
    for (const [i2, externalId, operation] of [
      [read, "purchase-orders", "READ"],
      [write, "supplier-invoices", "CREATE"],
    ] as const) {
      await prisma.apiAccessGrant.create({
        data: {
          organizationId: org,
          solutionId: solution.id,
          interfaceId: i2.id,
          sapProduct: "s4hana",
          externalId,
          operation,
          environment: "DEV",
          justification: "Load test.",
          decision: "APPROVED",
          decidedAt: new Date(),
          expiresAt: new Date(Date.now() + DAY),
        },
      });
    }
    const token = generateClientToken("DEV");
    const client = await prisma.solutionClient.create({
      data: {
        organizationId: org,
        solutionId: solution.id,
        label: "Load test",
        createdById: user,
        tokenHash: hashClientToken(token),
        environment: "DEV",
        isActive: true,
        expiresAt: new Date(Date.now() + DAY),
      },
    });
    const writeKey = `cew_${run}_${i}_write_key_0000000000`;
    if (!(await setWriteCredential(tenantScopeOf(org), client.id, writeKey))) throw new Error("could not seal the write key");
    fleet.push({ token, writeKey, read: read.id, write: write.id });
  }

  const callRead = (app: (typeof fleet)[number]) =>
    readRoute(
      new NextRequest(`http://localhost/api/northbound/interfaces/${app.read}/data`, { headers: { authorization: `Bearer ${app.token}` } }),
      { params: Promise.resolve({ id: app.read }) },
    );
  const callWrite = (app: (typeof fleet)[number]) =>
    writeRoute(
      new NextRequest(`http://localhost/api/northbound/interfaces/${app.write}/data/write`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${app.token}`,
          "x-coreedge-write-key": app.writeKey,
          "idempotency-key": `${run}-${randomUUID()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ record: { SupplierInvoice: "1" } }),
      }),
      { params: Promise.resolve({ id: app.write }) },
    );

  // Warm up: one read and one write per app, outside the measurement.
  for (const app of fleet) {
    await callRead(app);
    if (options.writeRatio > 0) await callWrite(app);
  }

  log(`load: ${options.rps}/s for ${options.durationS}s (${totalCalls} calls), ${Math.round(options.writeRatio * 100)}% writes, SAP ${options.sapLatencyMs} ms, pool ${options.connectionLimit}`);
  const results: CallResult[] = [];
  const statementsBefore = statements;
  const started = performance.now();
  const interval = 1000 / options.rps;
  const pending: Promise<void>[] = [];
  let writesSoFar = 0;
  for (let i = 0; i < totalCalls; i++) {
    const due = started + i * interval;
    const wait = due - performance.now();
    if (wait > 0) await sleep(wait);
    const app = fleet[i % fleet.length]!;
    // Deterministic mix: the i-th call is a write when the running share is below the ratio.
    const kind: "read" | "write" = writesSoFar < Math.floor((i + 1) * options.writeRatio) ? "write" : "read";
    if (kind === "write") writesSoFar += 1;
    pending.push(
      callContext.run({ operations: 0 }, async () => {
        const t0 = performance.now();
        let status = 0;
        try {
          status = (await (kind === "read" ? callRead(app) : callWrite(app))).status;
        } catch {
          status = 0;
        }
        const latencyMs = performance.now() - t0;
        const expected = kind === "read" ? 200 : 201;
        results.push({ kind, status, ok: status === expected, latencyMs, operations: callContext.getStore()!.operations });
      }),
    );
  }
  await Promise.all(pending);
  const elapsedS = (performance.now() - started) / 1000;
  const statementsDuring = statements - statementsBefore;

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const byKind = (kind: string) => results.filter((r) => r.kind === kind);
  const statusCounts: Record<string, number> = {};
  for (const r of results) statusCounts[String(r.status)] = (statusCounts[String(r.status)] ?? 0) + 1;
  const report: LoadReport = {
    options,
    calls: results.length,
    achievedRps: Number((results.length / elapsedS).toFixed(1)),
    errorRate: Number((results.filter((r) => !r.ok).length / Math.max(1, results.length)).toFixed(4)),
    statusCounts,
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(1)),
      p95: Number(percentile(latencies, 95).toFixed(1)),
      p99: Number(percentile(latencies, 99).toFixed(1)),
      max: Number((latencies.at(-1) ?? 0).toFixed(1)),
    },
    latencyByKindMs: Object.fromEntries(
      ["read", "write"].flatMap((kind) => {
        const sorted = byKind(kind).map((r) => r.latencyMs).sort((a, b) => a - b);
        return sorted.length === 0 ? [] : [[kind, { p50: Number(percentile(sorted, 50).toFixed(1)), p95: Number(percentile(sorted, 95).toFixed(1)) }]];
      }),
    ),
    statementsPerCall: Number((statementsDuring / Math.max(1, results.length)).toFixed(2)),
    operationsPerCall: Object.fromEntries(
      ["read", "write"].flatMap((kind) => {
        const ops = byKind(kind).map((r) => r.operations);
        return ops.length === 0
          ? []
          : [[kind, { mean: Number((ops.reduce((a, b) => a + b, 0) / ops.length).toFixed(2)), max: Math.max(...ops) }]];
      }),
    ),
  };

  // Clean up: the organisation cascades to everything seeded under it.
  await base.northboundAuditEvent.deleteMany({ where: { organizationId: org } });
  await base.northboundIdempotencyKey.deleteMany({ where: { organizationId: org } });
  await base.developerJourneyEvent.deleteMany({ where: { organizationId: org } });
  await base.organization.delete({ where: { id: org } });
  await base.user.deleteMany({ where: { id: user } });
  await base.$disconnect();

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  log("");
  log(`calls            ${report.calls} in ${elapsedS.toFixed(1)}s (${report.achievedRps}/s achieved)`);
  log(`errors           ${(report.errorRate * 100).toFixed(2)}%  ${JSON.stringify(report.statusCounts)}`);
  log(`latency          p50 ${report.latencyMs.p50} ms, p95 ${report.latencyMs.p95} ms, p99 ${report.latencyMs.p99} ms, max ${report.latencyMs.max} ms`);
  for (const [kind, l] of Object.entries(report.latencyByKindMs)) log(`  ${kind.padEnd(14)} p50 ${l.p50} ms, p95 ${l.p95} ms`);
  log(`db statements    ${report.statementsPerCall} per call (all SQL, over all calls)`);
  for (const [kind, o] of Object.entries(report.operationsPerCall)) log(`  ${kind.padEnd(14)} ${o.mean} Prisma operations per call (max ${o.max})`);
}

// Run as a script, not when a test imports `percentile`.
if (process.argv[1]?.endsWith("load-test.ts")) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
