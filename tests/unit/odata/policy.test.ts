// @vitest-environment node
/**
 * The query policy's source schema and the compiled form's reader (P1.4,
 * 3.5.2 and 3.5.5): strict, bounded, and never trusting what it reads.
 */

import { describe, expect, it } from "vitest";

import { basisOf, compiled, source } from "../../helpers/odata-query";

import { parseCompiledPolicy, parseQueryPolicySource, QUERY_POLICY_SOURCE_MAX_BYTES } from "@/lib/odata/policy";

describe("the source schema", () => {
  it("accepts Studio's safe default", () => {
    const r = parseQueryPolicySource(source());
    expect(r.ok).toBe(true);
  });

  it("refuses an unknown key rather than dropping it", () => {
    const r = parseQueryPolicySource({ ...source(), expand: ["to_Item"] });
    expect(r.ok).toBe(false);
    const nested = parseQueryPolicySource({ ...source(), page: { ...source().page, unknown: 1 } });
    expect(nested.ok).toBe(false);
  });

  it("checks the page limits and their order", () => {
    const page = source().page;
    for (const bad of [
      { ...page, maxSize: 1001 },
      { ...page, defaultSize: 0 },
      { ...page, defaultSize: 600 },
      { ...page, rowCap: 100_001 },
      { ...page, rowCap: 100 },
      { ...page, byteCap: 262_143 },
      { ...page, byteCap: 4_000_001 },
      { ...page, maxSize: 1.5 },
    ]) {
      expect(parseQueryPolicySource({ ...source(), page: bad }).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(parseQueryPolicySource({ ...source(), page: { defaultSize: 1, maxSize: 1000, rowCap: 100_000, byteCap: 262_144 } }).ok).toBe(true);
  });

  it("only names CoreEdge can address, deduplicated; a filter field listed twice is refused", () => {
    expect(parseQueryPolicySource({ ...source(), sort: ["a b"] }).ok).toBe(false);
    const r = parseQueryPolicySource({ ...source(), sort: ["A", "B", "A"], filter: [{ field: "A", ops: ["in", "eq", "in"] }] });
    expect(r.ok && r.source.sort).toEqual(["A", "B"]);
    expect(r.ok && r.source.filter[0]?.ops).toEqual(["eq", "in"]);
    expect(parseQueryPolicySource({ ...source(), filter: [{ field: "A", ops: ["eq"] }, { field: "A", ops: ["in"] }] }).ok).toBe(false);
    expect(parseQueryPolicySource({ ...source(), filter: [{ field: "A", ops: ["ne"] }] }).ok).toBe(false);
    expect(parseQueryPolicySource({ ...source(), filter: [{ field: "A", ops: [] }] }).ok).toBe(false);
  });

  it("bounds the lists and the JSON text", () => {
    expect(parseQueryPolicySource({ ...source(), requireFilterOn: Array.from({ length: 9 }, (_, i) => `F${i}`) }).ok).toBe(false);
    const big = parseQueryPolicySource({ ...source(), select: Array.from({ length: 400 }, (_, i) => `F${i}_${"x".repeat(100)}`) });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors[0]?.message).toContain(`${QUERY_POLICY_SOURCE_MAX_BYTES / 1024} KiB`);
    expect(parseQueryPolicySource({ ...source(), v: 2 }).ok).toBe(false);
  });

  it("names where each error is", () => {
    const r = parseQueryPolicySource({ ...source(), page: { ...source().page, rowCap: 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.field).toBe("page.rowCap");
  });
});

describe("reading the compiled form", () => {
  const good = () => JSON.parse(JSON.stringify(compiled(basisOf([{ n: "Id" }, { n: "Name" }], ["Id"]), source({ page: { defaultSize: 3, maxSize: 33, rowCap: 333, byteCap: 262_144 } })))) as Record<string, unknown>;

  it("builds null-prototype-safe lookups", () => {
    const p = parseCompiledPolicy(good());
    if ("unreadable" in p) throw new Error("unreadable");
    expect(p.fields.get("__proto__")).toBeUndefined();
    expect(p.fields.get("constructor")).toBeUndefined();
    expect(p.fields.get("Id")?.key).toBe(true);
    expect(p.readable).toEqual(["Id", "Name"]);
  });

  it.each([
    ["not an object", () => "x"],
    ["another version", () => ({ ...good(), v: 2 })],
    ["a hostile field name", () => ({ ...good(), fields: [{ n: "a'b", t: "S" }] })],
    ["a key naming no field", () => ({ ...good(), key: ["Nope"] })],
    ["an unknown type", () => ({ ...good(), fields: [{ n: "Id", t: "X" }] })],
    ["too many warnings", () => ({ ...good(), warnings: Array.from({ length: 11 }, () => "w") })],
    ["over 64 KiB", () => ({ ...good(), warnings: ["w".repeat(70_000)] })],
    ["page limits out of order", () => ({ ...good(), page: { defaultSize: 50, maxSize: 10, rowCap: 100, byteCap: 262_144 } })],
  ])("refuses %s", (_label, make) => {
    // Under a rev never cached: a cached rev is served from the cache (equal revs are equal content).
    const raw = make();
    expect(parseCompiledPolicy(typeof raw === "object" ? { ...raw, rev: "qp1:ZZZZZZZZZZZZZZZZZZZZZZ" } : raw)).toEqual({ unreadable: true });
  });
});
