/**
 * The tenant-scope guard is ATTACHED, not merely exported.
 *
 * `tenantScopeGuard()` existed as a factory with zero attachments — a declared
 * control the runtime did not enforce. These tests pin three things: the live
 * client applies it, the modes behave as documented, and the one sanctioned
 * escape (a declared cross-tenant context) works — because if it did not, the
 * fix would be weakening the guard.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MissingTenantScopeError,
  permitCrossTenantReads,
  tenantGuardMode,
  tenantScopeGuard,
} from "@/lib/db/tenant-guard";

type GuardRunner = (ctx: {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

function runner(): GuardRunner {
  const ext = tenantScopeGuard() as unknown as {
    query: { $allModels: { $allOperations: GuardRunner } };
  };
  return ext.query.$allModels.$allOperations;
}

const ok = async () => "rows";

describe("the live client attaches the guard", () => {
  it("lib/db/prisma applies tenantScopeGuard via $extends", () => {
    // Source-level: the attachment is the point. A future refactor that drops
    // the $extends silently reverts the control; this makes it fail a test.
    const src = readFileSync(path.resolve(process.cwd(), "src/lib/db/prisma.ts"), "utf8");
    expect(src).toContain("$extends(tenantScopeGuard())");
  });
});

describe("guard modes", () => {
  const envBefore = process.env.TENANT_SCOPE_GUARD;
  afterEach(() => {
    if (envBefore === undefined) delete process.env.TENANT_SCOPE_GUARD;
    else process.env.TENANT_SCOPE_GUARD = envBefore;
    vi.restoreAllMocks();
  });

  it("throws on an unscoped anchored-model query in the test default", async () => {
    delete process.env.TENANT_SCOPE_GUARD;
    expect(tenantGuardMode()).toBe("throw");
    await expect(
      runner()({ model: "Solution", operation: "findMany", args: { where: {} }, query: ok }),
    ).rejects.toThrow(MissingTenantScopeError);
  });

  it("passes a scoped query through untouched", async () => {
    await expect(
      runner()({
        model: "Solution",
        operation: "findMany",
        args: { where: { organizationId: "org-1" } },
        query: ok,
      }),
    ).resolves.toBe("rows");
  });

  it("still honors the narrow token-hash exemption", async () => {
    await expect(
      runner()({
        model: "SolutionClient",
        operation: "findUnique",
        args: { where: { tokenHash: "abc" } },
        query: ok,
      }),
    ).resolves.toBe("rows");
  });

  it("ignores non-anchored models entirely", async () => {
    await expect(
      runner()({ model: "Organization", operation: "findMany", args: {}, query: ok }),
    ).resolves.toBe("rows");
  });

  it("logs instead of throwing in log mode — the production burn-in", async () => {
    process.env.TENANT_SCOPE_GUARD = "log";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runner()({ model: "SapConnection", operation: "count", args: {}, query: ok }),
    ).resolves.toBe("rows");
    expect(spy).toHaveBeenCalledOnce();
    expect(String(spy.mock.calls[0]?.[0])).toContain("SapConnection.count");
  });

  // LAST in the file on purpose: permitCrossTenantReads marks the ambient
  // async context, and everything after this line inherits the permission.
  it("permits a declared cross-tenant context — the ops global-admin branch and the sweeps", async () => {
    delete process.env.TENANT_SCOPE_GUARD;
    permitCrossTenantReads("test: declared context");
    await expect(
      runner()({ model: "NorthboundAuditEvent", operation: "findMany", args: {}, query: ok }),
    ).resolves.toBe("rows");
  });
});
