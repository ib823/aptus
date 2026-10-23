// @vitest-environment node
/**
 * Literals: caller text to a typed canonical value, and that value as each
 * OData version writes it (P1.4, 3.7.2-3.7.4).
 *
 * Table-driven per type and version: what is accepted and refused (signs,
 * leading zeros, exponents, NaN, bounds at ±1, precision and scale, calendar
 * dates, clocks, offsets), the canonical form, and the frozen emission per
 * version. encLit's output is checked against the regular language the
 * compiler's guarantee rests on.
 */

import { describe, expect, it } from "vitest";

import type { LitType } from "@/lib/odata/ast";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import { encLit, expectedForm, literalForm, parseLiteral, serialiseLiteral, type LiteralFacets } from "@/lib/odata/literals";

const ENCODED_CONTENT = /^(?:[A-Za-z0-9\-._~]|%[0-9A-F]{2}|'')*$/;

function accepts(t: LitType, text: string, facets: LiteralFacets = {}, allowEmpty = false): string {
  const r = parseLiteral(t, text, facets, { allowEmpty });
  if (!r.ok) throw new Error(`${t} refused ${JSON.stringify(text)}`);
  expect(r.lit.t).toBe(t);
  return r.lit.v;
}

function refuses(t: LitType, text: string, facets: LiteralFacets = {}, allowEmpty = false) {
  const r = parseLiteral(t, text, facets, { allowEmpty });
  expect(r.ok, `${t} accepted ${JSON.stringify(text)}`).toBe(false);
  return r.ok ? null : r;
}

describe("parsing caller text", () => {
  it("S: as sent, no trim or folding; empty only where allowed; MaxLength in code points", () => {
    expect(accepts("S", " O'Neil & Co ")).toBe(" O'Neil & Co ");
    expect(accepts("S", "", {}, true)).toBe("");
    refuses("S", "");
    expect(accepts("S", "ab", { ml: 2 })).toBe("ab");
    expect(refuses("S", "abc", { ml: 2 })?.rule).toBe("VALUE_TOO_LONG");
    // One astral character is one character to SAP's MaxLength.
    expect(accepts("S", "\u{1F600}a", { ml: 2 })).toBe("\u{1F600}a");
    expect(accepts("S", "x".repeat(256))).toHaveLength(256);
    expect(refuses("S", "x".repeat(257))?.rule).toBe("VALUE_TOO_LONG");
    refuses("S", "a\uD800b");
  });

  it("G: the 8-4-4-4-12 form, canonicalised to lower case", () => {
    expect(accepts("G", "0050568D-393C-1EE8-AB8E-8E8E2B4C5B6A")).toBe("0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a");
    for (const bad of ["0050568D393C1EE8AB8E8E8E2B4C5B6A", "{0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a}", "0050568d-393c-1ee8-ab8e-8e8e2b4c5b6", "g050568d-393c-1ee8-ab8e-8e8e2b4c5b6a", ""]) {
      refuses("G", bad);
    }
  });

  it("B: true or false only", () => {
    expect(accepts("B", "true")).toBe("true");
    expect(accepts("B", "false")).toBe("false");
    for (const bad of ["TRUE", "1", "0", "yes", ""]) refuses("B", bad);
  });

  it.each([
    ["U8", "0", "255", ["256", "-1", "-0", "01", "1e2"]],
    ["I8", "-128", "127", ["-129", "128", "-0", "007"]],
    ["I16", "-32768", "32767", ["-32769", "32768"]],
    ["I32", "-2147483648", "2147483647", ["-2147483649", "2147483648", "1.0", "NaN", "INF", "1e3", "+1", " 1"]],
    ["I64", "-9223372036854775808", "9223372036854775807", ["-9223372036854775809", "9223372036854775808", "-0", "1L"]],
  ] as const)("%s: bounds checked with BigInt, at and one past each end", (t, min, max, bad) => {
    expect(accepts(t, min)).toBe(min);
    expect(accepts(t, max)).toBe(max);
    expect(accepts(t, "0")).toBe("0");
    for (const b of bad) refuses(t, b);
  });

  it("D: no exponent, no -0, precision and scale when the contract gives them", () => {
    expect(accepts("D", "12.5")).toBe("12.5");
    expect(accepts("D", "-12.5")).toBe("-12.5");
    expect(accepts("D", "10")).toBe("10");
    expect(accepts("D", "0.5", { p: 1, s: 1 })).toBe("0.5");
    expect(accepts("D", "123.45", { p: 5, s: 2 })).toBe("123.45");
    refuses("D", "1234.5", { p: 4, s: 2 });
    refuses("D", "1.234", { p: 10, s: 2 });
    refuses("D", "1.5", { p: 5, s: 0 });
    for (const bad of ["-0", "-0.0", "-0.000", "1e5", "1E5", "1.", ".5", "01.5", "NaN", "INF", "-INF", "1,5", "+1.5", "12.5M", ""]) {
      refuses("D", bad);
    }
    expect(accepts("D", "0")).toBe("0");
    expect(accepts("D", "0.0")).toBe("0.0");
  });

  it("DT, date only: YYYY-MM-DD or midnight, canonical with T00:00:00", () => {
    const dateOnly = { dateOnly: true } as const;
    expect(accepts("DT", "2024-02-29", dateOnly)).toBe("2024-02-29T00:00:00");
    expect(accepts("DT", "2026-01-01T00:00:00", dateOnly)).toBe("2026-01-01T00:00:00");
    refuses("DT", "2026-02-29", dateOnly);
    refuses("DT", "2026-01-01T10:00:00", dateOnly);
    refuses("DT", "0000-01-01", dateOnly);
    refuses("DT", "2026-13-01", dateOnly);
    refuses("DT", "2026-1-01", dateOnly);
  });

  it("DT: a date and a time without an offset, seconds added when absent", () => {
    expect(accepts("DT", "2026-01-01T10:15")).toBe("2026-01-01T10:15:00");
    expect(accepts("DT", "2026-01-01T10:15:30")).toBe("2026-01-01T10:15:30");
    expect(accepts("DT", "2026-01-01T10:15:30.1234567")).toBe("2026-01-01T10:15:30.1234567");
    expect(accepts("DT", "0001-01-01T00:00")).toBe("0001-01-01T00:00:00");
    expect(accepts("DT", "9999-12-31T23:59:59")).toBe("9999-12-31T23:59:59");
    for (const bad of ["2026-01-01", "2026-01-01T24:00:00", "2026-01-01T10:60:00", "2026-01-01T10:00:60", "2026-01-01T10:00:00Z", "2026-01-01T10:00:00.12345678", "2026-02-30T00:00", "2026-01-01 10:00"]) {
      refuses("DT", bad);
    }
  });

  it("DTO: an offset within ±14:00, as sent", () => {
    expect(accepts("DTO", "2026-01-01T10:00:00Z")).toBe("2026-01-01T10:00:00Z");
    expect(accepts("DTO", "2026-01-01T10:00:00+02:00")).toBe("2026-01-01T10:00:00+02:00");
    expect(accepts("DTO", "2026-01-01T10:00:00.5-14:00")).toBe("2026-01-01T10:00:00.5-14:00");
    expect(accepts("DTO", "2026-01-01T10:00:00+14:00")).toBe("2026-01-01T10:00:00+14:00");
    for (const bad of ["2026-01-01T10:00:00+14:01", "2026-01-01T10:00:00+15:00", "2026-01-01T10:00:00+02:60", "2026-01-01T10:00:00", "2026-01-01T10:00Z", "2026-01-01T10:00:00z", "2026-02-29T10:00:00Z"]) {
      refuses("DTO", bad);
    }
  });

  it("DA: a real calendar date", () => {
    expect(accepts("DA", "2024-02-29")).toBe("2024-02-29");
    expect(accepts("DA", "2000-02-29")).toBe("2000-02-29");
    refuses("DA", "1900-02-29");
    refuses("DA", "2026-02-29");
    refuses("DA", "2026-04-31");
    refuses("DA", "2026-01-01T00:00:00");
  });

  it("a refusal names the expected form and never the value", () => {
    const r = refuses("DA", "2026-02-30-secret");
    expect(r?.expected).toBe("a date, YYYY-MM-DD");
    expect(JSON.stringify(r)).not.toContain("secret");
    expect(expectedForm("I32")).toBe("a whole number from -2147483648 to 2147483647");
    expect(expectedForm("D", { p: 5, s: 2 })).toContain("at most 5 digits with at most 2 after the point");
  });
});

describe("encLit", () => {
  it("doubles a quote, keeps unreserved characters and percent-encodes every other byte", () => {
    expect(encLit("O'Neil & Co")).toBe("O''Neil%20%26%20Co");
    expect(encLit("a-b.c_d~e")).toBe("a-b.c_d~e");
    expect(encLit("+:/?#[]@!$&'()*,;=%")).toBe("%2B%3A%2F%3F%23%5B%5D%40%21%24%26''%28%29%2A%2C%3B%3D%25");
    expect(encLit("é")).toBe("%C3%A9");
    expect(encLit("\u{1F600}")).toBe("%F0%9F%98%80");
    expect(encLit("")).toBe("");
  });

  it("always writes the regular language the compiler's guarantee rests on", () => {
    const samples = ["' or 1 eq 1 or 'a' eq '", "&$expand=x", "%27", "\r\n", " ", " ", "‍", "‮", "é", "''''", "\\", "a b"];
    for (const s of samples) expect(encLit(s)).toMatch(ENCODED_CONTENT);
  });

  it("refuses a lone surrogate rather than encoding a replacement", () => {
    expect(() => encLit("a\uDC00")).toThrow(QueryCompilerInvariantError);
  });
});

describe("serialising per version (frozen)", () => {
  const cases: [LitType, string, string, string][] = [
    ["S", "O'Neil & Co", "'O''Neil%20%26%20Co'", "'O''Neil%20%26%20Co'"],
    ["S", "", "''", "''"],
    ["G", "0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a", "guid'0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a'", "0050568d-393c-1ee8-ab8e-8e8e2b4c5b6a"],
    ["B", "true", "true", "true"],
    ["B", "false", "false", "false"],
    ["U8", "255", "255", "255"],
    ["I32", "-42", "-42", "-42"],
    ["I64", "9223372036854775807", "9223372036854775807L", "9223372036854775807"],
    ["D", "10", "10.0M", "10"],
    ["D", "-2.5", "-2.5M", "-2.5"],
    ["DTO", "2026-01-01T10:00:00+02:00", "datetimeoffset'2026-01-01T10%3A00%3A00%2B02%3A00'", "2026-01-01T10%3A00%3A00%2B02%3A00"],
  ];
  it.each(cases)("%s %s", (t, v, v2, v4) => {
    expect(serialiseLiteral({ t, v }, "V2")).toBe(v2);
    expect(serialiseLiteral({ t, v }, "V4")).toBe(v4);
  });

  it("DT exists only in V2 and DA only in V4", () => {
    expect(serialiseLiteral({ t: "DT", v: "2026-01-01T00:00:00" }, "V2")).toBe("datetime'2026-01-01T00%3A00%3A00'");
    expect(serialiseLiteral({ t: "DA", v: "2026-01-01" }, "V4")).toBe("2026-01-01");
    expect(literalForm("DT", "V4")).toBeNull();
    expect(literalForm("DA", "V2")).toBeNull();
    expect(() => serialiseLiteral({ t: "DT", v: "2026-01-01T00:00:00" }, "V4")).toThrow(QueryCompilerInvariantError);
    expect(() => serialiseLiteral({ t: "DA", v: "2026-01-01" }, "V2")).toThrow(QueryCompilerInvariantError);
  });

  it("a boolean is a compiler constant, never the value's bytes", () => {
    expect(() => serialiseLiteral({ t: "B", v: "true or 1 eq 1" }, "V4")).toThrow(QueryCompilerInvariantError);
  });
});
