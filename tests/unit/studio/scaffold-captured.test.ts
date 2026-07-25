/**
 * The generated artifacts, with and without a captured schema.
 *
 * The pair of behaviours is the point: precise when we have seen the data,
 * openly ignorant when we have not — and never a confident description of
 * fields nobody has observed.
 */

import { describe, expect, it } from "vitest";

import { buildOpenApi, buildTypeScriptClient, type ScaffoldInterface } from "@/lib/studio/scaffold";
import { inferResponseSchema } from "@/lib/studio/schema-capture";

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

const CAPTURED = inferResponseSchema(
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
    // `Note` appeared in one row of two.
    expect(schemaOf(doc).required).toEqual(["BusinessPartner", "BusinessPartnerName", "IsBlocked"]);
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
    expect(src).toMatch(/Note\?: unknown \| null;/);
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
    expect(out).toMatch(/^\s+ok: number;/m);
  });
});
