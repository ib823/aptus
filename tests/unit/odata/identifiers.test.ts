// @vitest-environment node
/**
 * The names CoreEdge writes into an OData URL (P1.4, N2).
 *
 * A `$metadata` property name is the SAP system's text, or a builder-named
 * host's, and CSDL allows almost anything in it. Only plain ASCII identifiers
 * are addressable; everything else is shown as a field CoreEdge cannot
 * address, and emitName refuses it once more at the moment of emission.
 */

import { describe, expect, it } from "vitest";

import { emitName, isQueryIdentifier, QueryCompilerInvariantError } from "@/lib/odata/identifiers";

describe("the identifier rule", () => {
  it.each(["SalesOrder", "_x", "A_1", "a", "Z".repeat(128), "IsActiveEntity", "constructor"])("accepts %s", (name) => {
    expect(isQueryIdentifier(name)).toBe(true);
  });

  it.each([
    ["a quote", "a'b"],
    ["an injected option", "x&$expand=y"],
    ["511 characters", "a".repeat(511)],
    ["129 characters", "a".repeat(129)],
    ["non-ASCII", "Straße"],
    ["a fullwidth letter", "Ａ"],
    ["a leading digit", "1abc"],
    ["a space", "a b"],
    ["a path", "to_Item/Material"],
    ["a dot", "a.b"],
    ["__proto__", "__proto__"],
    ["the empty string", ""],
    ["a NUL", "a\u0000"],
    ["a trailing newline", "abc\n"],
  ])("refuses %s", (_label, name) => {
    expect(isQueryIdentifier(name)).toBe(false);
  });

  it("refuses what is not a string", () => {
    expect(isQueryIdentifier(undefined)).toBe(false);
    expect(isQueryIdentifier(42)).toBe(false);
    expect(isQueryIdentifier({ toString: () => "a" })).toBe(false);
  });

  it("emitName passes an identifier through and throws on anything else, naming no value", () => {
    expect(emitName("SalesOrder")).toBe("SalesOrder");
    expect(() => emitName("a'b")).toThrow(QueryCompilerInvariantError);
    try {
      emitName("x&$expand=y");
    } catch (err) {
      expect((err as Error).message).not.toContain("expand");
    }
  });
});
