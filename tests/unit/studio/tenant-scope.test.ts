/**
 * Structural tenant scoping.
 *
 * The bug this replaces has shipped here three times in one audit — a lookup by
 * caller-supplied id that forgot `where: { organizationId }`. Every one of those
 * routes had passing tests; the tests simply did not test the thing that was
 * missing. So the fix is not another test, it is removing the ability to express
 * the mistake, and these tests pin that the ability is really gone.
 */

import { describe, expect, it } from "vitest";

import {
  MissingTenantScopeError,
  TENANT_ANCHORED_MODELS,
  organizationIdOf,
  scopedById,
  scopedCreateData,
  scopedWhere,
  tenantScopeFor,
  tenantScopeGuard,
  tenantScopeOf,
} from "@/lib/studio/tenant-scope";

describe("obtaining a scope", () => {
  it("gives a scope to a user with an organization", () => {
    const r = tenantScopeFor({ organizationId: "org_a", role: "consultant" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(organizationIdOf(r.scope)).toBe("org_a");
  });

  it("refuses a user with no organization", () => {
    const r = tenantScopeFor({ organizationId: null, role: "consultant" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_ORGANIZATION");
  });

  it("refuses an ADMIN with no organization, distinctly", () => {
    // A global admin legitimately has no org — and that is exactly the case that
    // must not silently widen a query to every tenant. Reported separately so a
    // caller can say "pick an organization" rather than "forbidden".
    const r = tenantScopeFor({ organizationId: null, role: "platform_admin" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ADMIN_WITHOUT_ORGANIZATION");
  });
});

describe("a scope cannot be widened or redirected by request input", () => {
  const scope = tenantScopeOf("org_a");

  it("overwrites an organizationId supplied in the filter", () => {
    // The worst a caller can do is agree with the truth.
    const where = scopedWhere(scope, { organizationId: "org_victim", name: "x" });
    expect(where.organizationId).toBe("org_a");
    expect(where.name).toBe("x");
  });

  it("overwrites an organizationId supplied in create data", () => {
    // Otherwise a caller could plant a record inside someone else's tenant.
    const data = scopedCreateData(scope, { organizationId: "org_victim", name: "x" });
    expect(data.organizationId).toBe("org_a");
  });

  it("always pins the organization on an id lookup", () => {
    const where = scopedById(scope, "rec_1");
    expect(where).toEqual({ id: "rec_1", organizationId: "org_a" });
  });

  it("keeps extra criteria while still pinning the organization", () => {
    const where = scopedById(scope, "rec_1", { status: "ACTIVE", organizationId: "org_victim" });
    expect(where.organizationId).toBe("org_a");
    expect(where.status).toBe("ACTIVE");
  });

  it("produces criteria another tenant's row cannot match", () => {
    // "not yours" and "does not exist" become indistinguishable, so a caller
    // cannot probe for the existence of other tenants' records.
    const where = scopedById(scope, "rec_in_org_b");
    expect(where.organizationId).toBe("org_a");
  });
});

describe("the fail-closed Prisma guard", () => {
  const guard = tenantScopeGuard();

  async function run(model: string, operation: string, args: unknown) {
    const q = guard.query.$allModels.$allOperations;
    return q({ model, operation, args, query: async (a: unknown) => a });
  }

  it("throws when a tenant-anchored model is queried with no organizationId", async () => {
    await expect(run("Solution", "findFirst", { where: { id: "s1" } })).rejects.toBeInstanceOf(
      MissingTenantScopeError,
    );
  });

  it("throws for every tenant-anchored model", async () => {
    for (const model of TENANT_ANCHORED_MODELS) {
      await expect(
        run(model, "findMany", { where: { id: "x" } }),
        `${model} must be guarded`,
      ).rejects.toBeInstanceOf(MissingTenantScopeError);
    }
  });

  it("allows a query that IS scoped", async () => {
    await expect(
      run("Solution", "findFirst", { where: { id: "s1", organizationId: "org_a" } }),
    ).resolves.toBeTruthy();
  });

  it("accepts scoping through a nested relation filter", async () => {
    // e.g. { bundle: { organizationId } } — still a tenant boundary.
    await expect(
      run("Interface", "findMany", { where: { solution: { organizationId: "org_a" } } }),
    ).resolves.toBeTruthy();
  });

  it("ignores models that are not tenant-anchored", async () => {
    await expect(run("User", "findFirst", { where: { id: "u1" } })).resolves.toBeTruthy();
  });

  it("ignores operations where a where-clause is not the boundary", async () => {
    // `create` carries its tenant in `data`, which scopedCreateData stamps.
    await expect(run("Solution", "create", { data: { name: "x" } })).resolves.toBeTruthy();
  });

  it("names the model and operation so the failure is actionable", async () => {
    await expect(run("TestCase", "deleteMany", { where: {} })).rejects.toThrow(
      /TestCase\.deleteMany/,
    );
  });
});

describe("the guarded model list", () => {
  it("covers every organization-anchored table, including the Phase D ones", () => {
    for (const model of [
      "Solution",
      "Interface",
      "ApiAccessGrant",
      "TestCase",
      "ConfigAudit",
      "SapConnection",
      "SolutionClient",
      "NorthboundAuditEvent",
      "MockFixture",
    ]) {
      expect(TENANT_ANCHORED_MODELS as readonly string[]).toContain(model);
    }
  });
});
