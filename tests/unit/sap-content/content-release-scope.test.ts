/**
 * 2608 WS1 — content-release scoping of SAP-content reads.
 *
 * The rule under test: a read of ScopeItem / ProcessStep / ConfigActivity that
 * names neither releaseId nor catalogVersionId sees only the active release.
 * Everything else passes through untouched.
 */

import { describe, expect, it } from "vitest";

import { RELEASE_SCOPED_MODELS, releaseWhere, scopeArgsToRelease } from "@/lib/db/content-release-scope";

describe("releaseWhere", () => {
  it("treats pre-tracking rows (releaseId null) as 2602", () => {
    expect(releaseWhere("2602")).toEqual({ OR: [{ releaseId: null }, { contentRelease: { release: "2602" } }] });
  });
  it("selects 2608 purely by relation, no id lookup", () => {
    expect(releaseWhere("2608")).toEqual({ contentRelease: { release: "2608" } });
  });
});

describe("scopeArgsToRelease", () => {
  it("scopes a bare findMany on every release-scoped model", () => {
    for (const model of RELEASE_SCOPED_MODELS) {
      expect(scopeArgsToRelease(model, "findMany", undefined, "2602")).toEqual({ where: releaseWhere("2602") });
      expect(scopeArgsToRelease(model, "count", {}, "2608")).toEqual({ where: releaseWhere("2608") });
    }
  });

  it("ANDs the caller's where with the release scope", () => {
    const out = scopeArgsToRelease("ScopeItem", "findMany", { where: { functionalArea: "Finance" }, take: 5 }, "2608");
    expect(out).toEqual({ where: { AND: [{ functionalArea: "Finance" }, releaseWhere("2608")] }, take: 5 });
  });

  it("leaves a read alone when it already pins a release or a catalogue version", () => {
    const pinned = { where: { catalogVersionId: "v1" } };
    expect(scopeArgsToRelease("ScopeItem", "findMany", pinned, "2608")).toBe(pinned);
    const byRelease = { where: { releaseId: "r2608" } };
    expect(scopeArgsToRelease("ConfigActivity", "count", byRelease, "2602")).toBe(byRelease);
    const nested = { where: { OR: [{ catalogVersionId: "v1" }, { scopeCode: "J60" }] } };
    expect(scopeArgsToRelease("ScopeItem", "findFirst", nested, "2602")).toBe(nested);
  });

  it("never touches writes, unique lookups, or other models", () => {
    const create = { data: { scopeCode: "X" } };
    expect(scopeArgsToRelease("ScopeItem", "create", create, "2608")).toBe(create);
    const upd = { where: { id: "J60" }, data: { totalSteps: 1 } };
    expect(scopeArgsToRelease("ScopeItem", "update", upd, "2608")).toBe(upd);
    const uniq = { where: { id: "J60" } };
    expect(scopeArgsToRelease("ScopeItem", "findUnique", uniq, "2608")).toBe(uniq);
    const other = { where: {} };
    expect(scopeArgsToRelease("Assessment", "findMany", other, "2608")).toBe(other);
    expect(scopeArgsToRelease(undefined, "findMany", other, "2608")).toBe(other);
  });

  it("groupBy and aggregate are scoped like findMany", () => {
    const out = scopeArgsToRelease("ScopeItem", "groupBy", { by: ["functionalArea"], _count: true }, "2602");
    expect(out).toEqual({ by: ["functionalArea"], _count: true, where: releaseWhere("2602") });
  });
});
