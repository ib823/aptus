// @vitest-environment node
/**
 * The tenant-scope guard's log-mode burn-in is RECORDED, not only logged
 * (roadmap P0.12: "0 recorded guard violations in 7 days before throw mode").
 *
 * Runtime logs are kept for one to three days, so a console line cannot show
 * seven days of zero. These tests pin that a log-mode violation reaches the
 * durable recorder, sampled so a hot path cannot write per query; that throw
 * mode and scoped queries record nothing; that the live client registers the
 * recorder; and, against real PostgreSQL, that the recorder counts per model,
 * operation and call site.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  setTenantGuardViolationRecorder,
  tenantScopeGuard,
  violationCallSite,
  type TenantGuardViolationSample,
} from "@/lib/db/tenant-guard";
import { tenantGuardViolationRecorder } from "@/lib/db/tenant-guard-violations";

type GuardRunner = (ctx: {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

const run = (tenantScopeGuard() as unknown as { query: { $allModels: { $allOperations: GuardRunner } } }).query
  .$allModels.$allOperations;
const ok = async () => "rows";
const unscoped = () => run({ model: "Solution", operation: "findMany", args: { where: {} }, query: ok });

describe("a log-mode violation reaches the durable recorder", () => {
  const recorded: TenantGuardViolationSample[] = [];

  beforeEach(() => {
    recorded.length = 0;
    setTenantGuardViolationRecorder(async (sample) => {
      recorded.push(sample);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    setTenantGuardViolationRecorder(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("records the first violation at once, with its model, operation and call site", async () => {
    vi.stubEnv("TENANT_SCOPE_GUARD", "log");

    await expect(unscoped()).resolves.toBe("rows");

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ model: "Solution", operation: "findMany", count: 1 });
    expect(recorded[0]?.callSite).toContain("tenant-guard-violations.test");
  });

  it("samples: repeats inside a minute are counted into the next write, not written each", async () => {
    vi.stubEnv("TENANT_SCOPE_GUARD", "log");
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    const site = () => unscoped();

    for (let i = 0; i < 5; i += 1) await site();
    expect(recorded.map((r) => r.count)).toEqual([1]);

    now.mockReturnValue(start + 61_000);
    await site();
    expect(recorded.map((r) => r.count)).toEqual([1, 5]);
  });

  it("records nothing in throw mode, or for a scoped query", async () => {
    vi.stubEnv("TENANT_SCOPE_GUARD", "throw");
    await expect(unscoped()).rejects.toThrow();
    vi.stubEnv("TENANT_SCOPE_GUARD", "log");
    await run({ model: "Solution", operation: "findMany", args: { where: { organizationId: "o" } }, query: ok });

    expect(recorded).toHaveLength(0);
  });

  it("a failing recorder never fails the query it observed", async () => {
    vi.stubEnv("TENANT_SCOPE_GUARD", "log");
    setTenantGuardViolationRecorder(async () => {
      throw new Error("database unavailable");
    });

    await expect(unscoped()).resolves.toBe("rows");
  });
});

describe("the call site", () => {
  it("is the first frame outside the guard, Prisma and Node, trimmed to the app path", () => {
    const stack = [
      "Error",
      "    at noteViolation (/var/task/src/lib/db/tenant-guard.ts:150:20)",
      "    at Object.$allOperations (/var/task/src/lib/db/tenant-guard.ts:220:15)",
      "    at /var/task/node_modules/@prisma/client/runtime/library.js:1:2",
      "    at async GET (/var/task/.next/server/app/api/studio/solutions/route.js:1:4242)",
    ].join("\n");
    expect(violationCallSite(stack)).toBe("/.next/server/app/api/studio/solutions/route.js");
    expect(violationCallSite(undefined)).toBe("unknown");
  });
});

describe("the live client registers the recorder", () => {
  it("lib/db/prisma hands the guard a recorder on the unextended client", () => {
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/db/prisma.ts"), "utf8");
    expect(src).toContain("setTenantGuardViolationRecorder(tenantGuardViolationRecorder(base))");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("the recorder against real PostgreSQL", () => {
  const client = new PrismaClient({
    datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
  });
  const model = `test-${randomUUID().slice(0, 8)}`;

  afterAll(async () => {
    await client.tenantGuardViolation.deleteMany({ where: { model } });
    await client.$disconnect();
  });

  it("keeps one row per model, operation and call site, and adds up the counts", async () => {
    const record = tenantGuardViolationRecorder(client);

    await record({ model, operation: "findMany", callSite: "/src/a.ts", count: 1 });
    const first = await client.tenantGuardViolation.findFirstOrThrow({ where: { model } });
    await record({ model, operation: "findMany", callSite: "/src/a.ts", count: 4 });
    await record({ model, operation: "findMany", callSite: "/src/b.ts", count: 1 });

    const rows = await client.tenantGuardViolation.findMany({ where: { model }, orderBy: { callSite: "asc" } });
    expect(rows.map((r) => [r.callSite, r.count])).toEqual([
      ["/src/a.ts", 5],
      ["/src/b.ts", 1],
    ]);
    expect(rows[0]?.firstSeenAt).toEqual(first.firstSeenAt);
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt.getTime());
  });
});
