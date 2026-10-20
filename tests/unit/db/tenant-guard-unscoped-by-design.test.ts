/**
 * The tenant guard's credential lookups — the ONLY queries that may run on a
 * tenant-anchored model with no organizationId — and nothing wider.
 *
 * Each entry is a model, an operation and an exact where-shape. P0.11 added
 * the second one, the rotation overlap's lookup by `previousTokenHash`;
 * without it the guard in throw mode would fail every call made with a key
 * inside its overlap window. Both are `@unique` columns, so either lookup
 * returns only the row whose key was presented.
 */

import { describe, expect, it } from "vitest";

import { isUnscopedByDesign, MissingTenantScopeError, tenantScopeGuard } from "@/lib/db/tenant-guard";

type GuardRunner = (ctx: {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

const guard = (tenantScopeGuard() as unknown as { query: { $allModels: { $allOperations: GuardRunner } } }).query
  .$allModels.$allOperations;
const ok = async () => "row";

describe("the credential lookups are exempt, exactly", () => {
  it.each(["tokenHash", "previousTokenHash"])("SolutionClient.findUnique by %s alone", (field) => {
    expect(isUnscopedByDesign("SolutionClient", "findUnique", { where: { [field]: "h" } })).toBe(true);
  });

  it("lets both through the live guard in throw mode", async () => {
    for (const field of ["tokenHash", "previousTokenHash"]) {
      await expect(
        guard({ model: "SolutionClient", operation: "findUnique", args: { where: { [field]: "h" } }, query: ok }),
      ).resolves.toBe("row");
    }
  });

  // Wave 1a final review: the third lookup, of a key a row has dropped.
  it("RetiredClientToken.findUnique by its hash alone, and nothing wider", async () => {
    expect(isUnscopedByDesign("RetiredClientToken", "findUnique", { where: { tokenHash: "h" } })).toBe(true);
    await expect(
      guard({ model: "RetiredClientToken", operation: "findUnique", args: { where: { tokenHash: "h" } }, query: ok }),
    ).resolves.toBe("row");
    expect(isUnscopedByDesign("RetiredClientToken", "findMany", { where: { tokenHash: "h" } })).toBe(false);
    expect(isUnscopedByDesign("RetiredClientToken", "findUnique", { where: { clientId: "c1" } })).toBe(false);
    await expect(
      guard({ model: "RetiredClientToken", operation: "findMany", args: { where: { clientId: "c1" } }, query: ok }),
    ).rejects.toThrow(MissingTenantScopeError);
  });
});

describe("anything wider is not", () => {
  const cases: [string, string, unknown][] = [
    ["another field beside the hash", "findUnique", { where: { previousTokenHash: "h", id: "c1" } }],
    ["both hashes at once", "findUnique", { where: { tokenHash: "h", previousTokenHash: "h" } }],
    ["a findFirst by the previous hash", "findFirst", { where: { previousTokenHash: "h" } }],
    ["a findMany by the previous hash", "findMany", { where: { previousTokenHash: "h" } }],
    ["an update by the previous hash", "update", { where: { previousTokenHash: "h" }, data: {} }],
    ["a filter rather than an equality", "findUnique", { where: { previousTokenHash: { not: null } } }],
    ["any other field", "findUnique", { where: { previousValidUntil: new Date() } }],
    ["no where at all", "findUnique", {}],
  ];

  it.each(cases)("%s", (_name, operation, args) => {
    expect(isUnscopedByDesign("SolutionClient", operation, args)).toBe(false);
  });

  it("is SolutionClient only — the same shape on another model is a violation", async () => {
    expect(isUnscopedByDesign("KeyClaimLink", "findUnique", { where: { previousTokenHash: "h" } })).toBe(false);
    await expect(
      guard({ model: "ApiAccessGrant", operation: "findUnique", args: { where: { previousTokenHash: "h" } }, query: ok }),
    ).rejects.toThrow(MissingTenantScopeError);
  });

  it("refuses a wider previous-hash query in throw mode", async () => {
    await expect(
      guard({ model: "SolutionClient", operation: "findMany", args: { where: { previousTokenHash: "h" } }, query: ok }),
    ).rejects.toThrow(MissingTenantScopeError);
    await expect(
      guard({
        model: "SolutionClient",
        operation: "findUnique",
        args: { where: { previousTokenHash: "h", isActive: true } },
        query: ok,
      }),
    ).rejects.toThrow(MissingTenantScopeError);
  });
});
