/**
 * Scaffold artifacts.
 *
 * These files leave the building and get compiled in someone else's repository,
 * so "it rendered" is not the bar — the OpenAPI has to parse and be structurally
 * valid, and the TypeScript must not contain a duplicate declaration that only
 * shows up when the developer runs tsc. (It did, on the first draft: the error
 * envelope and the error class were both called CoreEdgeError.)
 */

import { describe, expect, it } from "vitest";

import {
  buildEnvExample,
  buildOpenApi,
  buildReadme,
  buildScaffold,
  buildTypeScriptClient,
  toTypeName,
  type ScaffoldInterface,
} from "@/lib/studio/scaffold";

const IFACE: ScaffoldInterface = {
  id: "if_abc123",
  name: "Business Partner read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BusinessPartner",
  version: 2,
  solutionName: "Finance Accelerator",
};

describe("OpenAPI document", () => {
  const doc = JSON.parse(buildOpenApi(IFACE)) as Record<string, unknown>;

  it("is valid JSON declaring OpenAPI 3.1", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("has the required top-level objects", () => {
    expect(doc.info).toBeTruthy();
    expect(doc.paths).toBeTruthy();
    expect(doc.components).toBeTruthy();
  });

  it("describes the NORTHBOUND path for this interface, not SAP's own", () => {
    // The whole value is that the developer codes against a stable contract we
    // own, rather than a tenant-specific SAP surface.
    const paths = doc.paths as Record<string, unknown>;
    expect(Object.keys(paths)).toEqual([`/interfaces/${IFACE.id}/data`]);
  });

  it("declares bearer auth and applies it globally", () => {
    const components = doc.components as { securitySchemes: Record<string, { type: string; scheme: string }> };
    const bearer = components.securitySchemes.bearerAuth;
    expect(bearer).toBeTruthy();
    expect(bearer!.type).toBe("http");
    expect(bearer!.scheme).toBe("bearer");
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it("documents ALL the honest states, not just the happy path", () => {
    // An OpenAPI that only describes 200 teaches consumers to treat everything
    // else as a crash — the exact confusion honest status exists to prevent.
    const paths = doc.paths as Record<string, { get: { responses: Record<string, unknown> } }>;
    const responses = paths[`/interfaces/${IFACE.id}/data`]!.get.responses;
    for (const code of ["200", "401", "403", "429", "5XX"]) {
      expect(responses[code], `response ${code} must be documented`).toBeTruthy();
    }
  });

  it("says in the 200 description that an empty array means 'no records'", () => {
    const paths = doc.paths as Record<string, { get: { responses: Record<string, { description: string }> } }>;
    const ok = paths[`/interfaces/${IFACE.id}/data`]!.get.responses["200"]!.description;
    expect(ok.toLowerCase()).toContain("no records");
  });

  it("does not claim a precise record shape it has not inspected", () => {
    // v1 does not read the tenant's $metadata at generation time. Asserting
    // fields we have not seen would be a confident lie inside a contract file.
    const components = doc.components as { schemas: Record<string, { additionalProperties?: boolean }> };
    const schema = components.schemas.ABusinessPartner;
    expect(schema).toBeTruthy();
    expect(schema!.additionalProperties).toBe(true);
  });

  it("uses the base URL it is given", () => {
    const custom = JSON.parse(buildOpenApi(IFACE, "https://acme.internal/api/northbound")) as {
      servers: { url: string }[];
    };
    expect(custom.servers[0]!.url).toBe("https://acme.internal/api/northbound");
  });
});

describe("TypeScript client", () => {
  const src = buildTypeScriptClient(IFACE);

  it("declares each exported name exactly once", () => {
    // The first draft declared CoreEdgeError twice (interface + class), which
    // only fails when the DEVELOPER compiles it — precisely the failure mode a
    // generator must not ship.
    const declared = [...src.matchAll(/export (?:interface|class|function|const) (\w+)/g)].map((m) => m[1]);
    expect(new Set(declared).size).toBe(declared.length);
  });

  it("exports a client factory and the error type", () => {
    expect(src).toContain("export function createClient");
    expect(src).toContain("export class CoreEdgeError");
    expect(src).toContain("export interface CoreEdgeErrorBody");
  });

  it("sends the token as a bearer header", () => {
    expect(src).toContain("Authorization: `Bearer ${options.token}`");
  });

  it("hard-codes this interface's id so the caller cannot point it elsewhere", () => {
    expect(src).toContain(`const interfaceId = "${IFACE.id}"`);
  });

  it("tells the reader that an empty array means no records", () => {
    expect(src.toLowerCase()).toContain("no records");
  });

  it("says it is a template, and points non-TS users at the OpenAPI", () => {
    expect(src).toContain("TEMPLATE");
    expect(src).toContain("openapi-generator-cli");
  });

  it("substituted every value it was given, leaving nothing stringified as undefined", () => {
    // NOTE the generated file legitimately CONTAINS `${...}` — those are the
    // developer's own runtime template literals (`${options.baseUrl}`), not
    // unresolved placeholders. What would signal a botched substitution is a
    // literal "undefined" where a value should be, or a missing real value.
    expect(src).not.toContain("undefined");
    expect(src).not.toContain("[object Object]");
    expect(src).toContain(IFACE.externalId);
    expect(src).toContain(IFACE.id);
    expect(src).toContain(`v${IFACE.version}`);
  });
});

describe("README sets the boundary", () => {
  const readme = buildReadme(IFACE);

  it("states that the application code lives in the developer's own repository", () => {
    expect(readme).toContain("YOUR repository");
  });

  it("says CoreEdge is not an IDE", () => {
    expect(readme.toLowerCase()).toContain("not an ide");
  });

  it("explains the mock⇆live switch is one variable", () => {
    expect(readme).toContain("COREEDGE_BASE_URL");
  });

  it("spells out the honest-status table, including that empty is not an error", () => {
    expect(readme).toContain("No records");
    expect(readme.toLowerCase()).toContain("not** an error");
  });
});

describe("env example", () => {
  it("ships no secret value", () => {
    const env = buildEnvExample();
    expect(env).toContain("COREEDGE_TOKEN=");
    expect(env).toMatch(/COREEDGE_TOKEN=\s*$/m);
  });

  it("warns the token is server-side only", () => {
    expect(buildEnvExample().toLowerCase()).toContain("server-side only");
  });
});

describe("the bundle", () => {
  it("is exactly what a developer needs to build AND to test offline", () => {
    // The contract half (openapi/client), the runnable half (demo/mock/fixtures/
    // package.json), and the two files that set expectations (README/.env).
    // Anything more would be us having opinions about their project layout.
    const files = buildScaffold(IFACE);
    expect(files.map((f) => f.path).sort()).toEqual([
      ".env.example",
      "README.md",
      "client.ts",
      "demo.mjs",
      "fixtures.json",
      "mock.mjs",
      "openapi.json",
      "package.json",
    ]);
  });

  it("produces non-empty contents for every file", () => {
    for (const f of buildScaffold(IFACE)) {
      expect(f.contents.length, `${f.path} must not be empty`).toBeGreaterThan(50);
    }
  });
});

describe("toTypeName", () => {
  it("produces a valid PascalCase identifier", () => {
    expect(toTypeName("A_BusinessPartner")).toBe("ABusinessPartner");
    expect(toTypeName("sales order items")).toBe("SalesOrderItems");
  });

  it("never starts with a digit", () => {
    expect(toTypeName("2024_Report")).toMatch(/^[A-Za-z_]/);
  });

  it("falls back rather than emitting an empty identifier", () => {
    expect(toTypeName("!!!")).toBe("CoreEdgeResource");
  });
});
