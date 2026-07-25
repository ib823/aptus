/**
 * Schema inference from observed rows.
 *
 * The whole value of this module is restraint. Every test below is really
 * asking the same question: does it claim more than it saw? A contract that
 * over-claims is worse than one that admits ignorance, because the consumer
 * only discovers the lie when their generated code breaks on real data.
 */

import { describe, expect, it } from "vitest";

import { inferResponseSchema, isCapturedSchema } from "@/lib/studio/schema-capture";

const AT = new Date("2026-07-25T12:00:00Z");

describe("what it describes", () => {
  it("records the fields it saw, with their types", () => {
    const s = inferResponseSchema(
      [{ BusinessPartner: "1000", IsBlocked: false, CreditLimit: 5000 }],
      AT,
    );
    expect(s).not.toBeNull();
    expect(s!.properties.BusinessPartner).toEqual({ type: "string" });
    expect(s!.properties.IsBlocked).toEqual({ type: "boolean" });
    expect(s!.properties.CreditLimit).toEqual({ type: "integer" });
  });

  it("distinguishes integer from number", () => {
    const s = inferResponseSchema([{ Count: 3, Rate: 1.5 }], AT);
    expect(s!.properties.Count?.type).toBe("integer");
    expect(s!.properties.Rate?.type).toBe("number");
  });

  it("recognises the OData v2 /Date(…)/ form as a date-time STRING", () => {
    // The wire value really is a string; claiming type "date" would be wrong.
    const s = inferResponseSchema([{ CreatedAt: "/Date(1690000000000)/" }], AT);
    expect(s!.properties.CreatedAt).toEqual({ type: "string", format: "date-time" });
  });

  it("drops OData envelope noise", () => {
    // __metadata describes the envelope, not the entity.
    const s = inferResponseSchema([{ __metadata: { uri: "x" }, Real: "y" }], AT);
    expect(s!.properties).not.toHaveProperty("__metadata");
    expect(s!.properties).toHaveProperty("Real");
  });

  it("sorts fields, so regenerating produces a stable diff", () => {
    const s = inferResponseSchema([{ Zebra: 1, Apple: 2, Mango: 3 }], AT);
    expect(Object.keys(s!.properties)).toEqual(["Apple", "Mango", "Zebra"]);
  });
});

describe("what it refuses to claim", () => {
  it("marks a field required ONLY if it appeared in every row", () => {
    // SAP omits nulls in OData v2 rather than sending them, so a field missing
    // from one row of three is genuinely optional in THIS tenant.
    const s = inferResponseSchema(
      [{ A: 1, B: 2 }, { A: 1 }, { A: 1, B: 3 }],
      AT,
    );
    expect(s!.required).toEqual(["A"]);
  });

  it("declares NO type when a field arrived as two different types", () => {
    // "number" would break the consumer's generated code on the string row.
    const s = inferResponseSchema([{ Amount: 5 }, { Amount: "5.00" }], AT);
    expect(s!.properties.Amount?.type).toBeUndefined();
  });

  it("treats null as telling us nothing about the type", () => {
    const s = inferResponseSchema([{ Note: null }, { Note: "hello" }], AT);
    expect(s!.properties.Note?.type).toBe("string");
    expect(s!.properties.Note?.nullable).toBe(true);
  });

  it("marks a field nullable when a null was actually observed", () => {
    const s = inferResponseSchema([{ Note: null }], AT);
    expect(s!.properties.Note?.nullable).toBe(true);
    expect(s!.properties.Note?.type).toBeUndefined();
  });

  it("ALWAYS leaves additionalProperties true — a sample is not a census", () => {
    // A field that only appears on unusual records must not make the document
    // invalid for those records.
    const s = inferResponseSchema([{ A: 1 }], AT);
    expect(s!.additionalProperties).toBe(true);
  });

  it("returns null for an empty sample rather than an empty schema", () => {
    // The caller then keeps the honest "nobody has looked yet" shape instead of
    // publishing something that looks captured but describes nothing.
    expect(inferResponseSchema([], AT)).toBeNull();
  });

  it("returns null when the rows carried nothing describable", () => {
    expect(inferResponseSchema([{ __metadata: { uri: "x" } }], AT)).toBeNull();
  });
});

describe("provenance", () => {
  it("records the sample size and when it was captured", () => {
    const s = inferResponseSchema([{ A: 1 }, { A: 2 }], AT);
    expect(s!["x-captured"].sampleSize).toBe(2);
    expect(s!["x-captured"].capturedAt).toBe(AT.toISOString());
  });

  it("states in the note that fields outside the sample are not described", () => {
    // A reader must be able to tell how much to trust it.
    const s = inferResponseSchema([{ A: 1 }], AT);
    expect(s!["x-captured"].note.toLowerCase()).toContain("not described");
  });
});

describe("isCapturedSchema", () => {
  it("recognises a schema this module produced", () => {
    expect(isCapturedSchema(inferResponseSchema([{ A: 1 }], AT))).toBe(true);
  });

  it("rejects anything else", () => {
    for (const v of [null, undefined, {}, "x", 42, { type: "string" }, { type: "object" }]) {
      expect(isCapturedSchema(v), JSON.stringify(v)).toBe(false);
    }
  });
});
