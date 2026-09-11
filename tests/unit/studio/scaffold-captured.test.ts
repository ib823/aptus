/**
 * The generated artifacts, with and without a captured schema.
 *
 * The pair of behaviours is the point: precise when we have seen the data,
 * openly ignorant when we have not — and never a confident description of
 * fields nobody has observed.
 */

import { describe, expect, it } from "vitest";

import { buildOpenApi, buildTypeScriptClient, type ScaffoldInterface } from "@/lib/studio/scaffold";
import { inferResponseSchema, MIN_SAMPLE_FOR_REQUIRED } from "@/lib/studio/schema-capture";

const BASE: ScaffoldInterface = {
  id: "if_1",
  name: "Business Partner read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BusinessPartner",
  version: 2,
  solutionName: "Finance Accelerator",
};

// Twenty rows — the floor above which "present in every row" may be asserted
// as `required` (MIN_SAMPLE_FOR_REQUIRED). `Note` is absent from one row and
// null in another, so it is optional AND nullable.
const SAMPLE = Array.from({ length: MIN_SAMPLE_FOR_REQUIRED }, (_, i) => ({
  BusinessPartner: String(1000 + i),
  BusinessPartnerName: i % 2 ? "Acme" : "Globex",
  IsBlocked: i % 3 === 0,
  ...(i === 1 ? {} : { Note: i === 0 ? null : "n" }),
}));
const CAPTURED = inferResponseSchema(SAMPLE, new Date("2026-07-25T12:00:00Z"));

// The same shape from two rows: too few to assert anything required.
const CAPTURED_SMALL = inferResponseSchema(
  [
    { BusinessPartner: "1000", BusinessPartnerName: "Acme", IsBlocked: false, Note: null },
    { BusinessPartner: "1001", BusinessPartnerName: "Globex", IsBlocked: true },
  ],
  new Date("2026-07-25T12:00:00Z"),
);

function schemaOf(doc: string, name = "ABusinessPartner") {
  const parsed = JSON.parse(doc) as {
    components: { schemas: Record<string, Record<string, unknown>> };
  };
  return parsed.components.schemas[name]!;
}

describe("OpenAPI without a captured schema", () => {
  const doc = buildOpenApi(BASE);

  it("still parses and stays open", () => {
    const s = schemaOf(doc);
    expect(s.additionalProperties).toBe(true);
    expect(s.properties).toBeUndefined();
  });

  it("says plainly that nobody has looked yet", () => {
    // So a reader can tell "this entity has no fields" from "no run has happened".
    expect(String(schemaOf(doc).description).toLowerCase()).toContain("no live response");
    expect(String(schemaOf(doc).description).toLowerCase()).toContain("test console");
  });
});

describe("OpenAPI with a captured schema", () => {
  const doc = buildOpenApi({ ...BASE, responseSchema: CAPTURED });

  it("describes the observed fields", () => {
    const props = schemaOf(doc).properties as Record<string, { type?: string }>;
    expect(props.BusinessPartner?.type).toBe("string");
    expect(props.IsBlocked?.type).toBe("boolean");
  });

  it("marks only the always-present fields as required", () => {
    // `Note` was absent from one row of twenty.
    expect(schemaOf(doc).required).toEqual(["BusinessPartner", "BusinessPartnerName", "IsBlocked"]);
  });

  it("asserts nothing required from a two-row sample", () => {
    const small = buildOpenApi({ ...BASE, responseSchema: CAPTURED_SMALL });
    expect(schemaOf(small).required).toEqual([]);
    const captured = schemaOf(small)["x-captured"] as { alwaysPresent: string[] };
    expect(captured.alwaysPresent).toEqual(["BusinessPartner", "BusinessPartnerName", "IsBlocked"]);
  });

  it("speaks OpenAPI 3.1 for a nullable field — a type array, never the 3.0 `nullable` keyword", () => {
    // The document declares 3.1.0; `nullable: true` is a 3.0 keyword that 3.1
    // generators ignore silently, so every nullable date came out untyped.
    const props = schemaOf(doc).properties as Record<string, Record<string, unknown>>;
    expect(props.Note?.type).toEqual(["string", "null"]);
    expect(props.Note).not.toHaveProperty("nullable");
    expect(props.BusinessPartner?.type).toBe("string");
    expect(doc).not.toContain('"nullable"');
  });

  it("keeps additionalProperties true even when precise", () => {
    expect(schemaOf(doc).additionalProperties).toBe(true);
  });

  it("carries its provenance into the document", () => {
    expect(schemaOf(doc)["x-captured"]).toBeTruthy();
  });

  it("still parses as valid JSON with the required OpenAPI objects", () => {
    const parsed = JSON.parse(doc) as Record<string, unknown>;
    expect(parsed.openapi).toBe("3.1.0");
    expect(parsed.paths).toBeTruthy();
  });
});

describe("TypeScript client without a captured schema", () => {
  const src = buildTypeScriptClient(BASE);

  it("falls back to an index signature", () => {
    expect(src).toContain("[field: string]: unknown;");
  });

  it("declares each exported name exactly once", () => {
    const declared = [...src.matchAll(/export (?:interface|class|function|const) (\w+)/g)].map((m) => m[1]);
    expect(new Set(declared).size).toBe(declared.length);
  });
});

describe("TypeScript client with a captured schema", () => {
  const src = buildTypeScriptClient({ ...BASE, responseSchema: CAPTURED });

  it("emits the real fields with their types", () => {
    expect(src).toContain("BusinessPartner: string;");
    expect(src).toContain("IsBlocked: boolean;");
  });

  it("marks fields absent from some rows as optional", () => {
    expect(src).toContain("Note?:");
  });

  it("types a nullable field as `| null`", () => {
    expect(src).toMatch(/Note\?: string \| null;/);
  });

  it("the header says the shape was CAPTURED, not that it is an open template", () => {
    // "This is a TEMPLATE … the record shape is intentionally open" sat directly
    // above 54 typed fields. The header follows the schema now.
    expect(src).toContain("CAPTURED from 20 live rows");
    expect(src).not.toContain("This is a TEMPLATE");
    expect(buildTypeScriptClient(BASE)).toContain("This is a TEMPLATE");
  });

  it("KEEPS the index signature, because the sample is not a census", () => {
    // A consumer meeting an unlisted field should get a value, not a type error.
    expect(src).toContain("[field: string]: unknown;");
  });

  it("still declares each exported name exactly once", () => {
    const declared = [...src.matchAll(/export (?:interface|class|function|const) (\w+)/g)].map((m) => m[1]);
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("quotes a field name that is not a valid identifier", () => {
    // SAP emits names like `Sales-Order` and `2ndAddress`; emitting those bare
    // would produce TypeScript that does not compile in the developer's repo.
    // (`@odata.*` is not tested here — it is filtered as envelope noise before
    // it ever reaches the schema.)
    const odd = inferResponseSchema([{ "Sales-Order": "1", "2ndAddress": "x", ok: 1 }], new Date());
    const out = buildTypeScriptClient({ ...BASE, responseSchema: odd });
    expect(out).toContain('"Sales-Order"');
    expect(out).toContain('"2ndAddress"');
    // A normal name stays unquoted.
    expect(out).toMatch(/^\s+ok\??: number;/m);
  });
});
