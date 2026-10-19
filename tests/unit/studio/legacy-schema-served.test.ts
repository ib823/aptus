// @vitest-environment node
/**
 * A schema captured before the envelope was stripped is served as the rows can
 * satisfy it.
 *
 * Capture used to drop only a top-level `__metadata`, so every V2
 * `to_X: { __deferred }` navigation was recorded as `{ type: "object" }` and —
 * present in every row of a 20-row sample — put in `required`. The broker now
 * strips those navigations from every row it serves, and the kit's mock serves
 * stripped fixtures, while the stored Interface.responseSchema went out as it
 * was: openapi.json `required` and client.ts non-optional `to_X` both named a
 * key no served row has, so a consumer's validator rejected every row. Fixtures
 * stored before the strip are cleaned on the way out (stripFixtureEnvelope);
 * stored schemas were not.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stripODataEnvelope } from "@/lib/sap-public/odata-envelope";
import { buildOpenApi, buildScaffold, buildTypeScriptClient, type ScaffoldInterface } from "@/lib/studio/scaffold";
import {
  type CapturedSchema,
  inferResponseSchema,
  MIN_SAMPLE_FOR_REQUIRED,
  servedResponseSchema,
} from "@/lib/studio/schema-capture";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "client_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      scope: { organizationId: "org_a" },
      environment: "SANDBOX",
    },
  }),
  extractBearer: (s: string | null) => s,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: {} },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { interface: { findFirst } } }));

import { GET as getSchema } from "@/app/api/northbound/interfaces/[id]/schema/route";

const SVC = "https://my403706-api.s4hana.cloud.sap/sap/opu/odata/sap/API_BUSINESS_PARTNER";

/** A row as SAP Gateway sends it for a V2 read with no $expand. */
function sapRow(i: number): Record<string, unknown> {
  const entity = `${SVC}/A_BusinessPartner('${1000 + i}')`;
  return {
    __metadata: { id: entity, uri: entity, type: "API_BUSINESS_PARTNER.A_BusinessPartnerType" },
    BusinessPartner: String(1000 + i),
    BusinessPartnerName: "Acme",
    to_BusinessPartnerAddress: { __deferred: { uri: `${entity}/to_BusinessPartnerAddress` } },
    to_Role: { __deferred: { uri: `${entity}/to_Role` } },
  };
}

/** What the broker serves for that row (read.ts runs every row through this). */
const SERVED_ROW = stripODataEnvelope(sapRow(0));

/*
 * Exactly what Capture schema stored from twenty of those rows before it used
 * the broker's envelope rule — the output of the pre-fix inferResponseSchema,
 * byte for byte. No `envelope` marker: that did not exist yet.
 */
const LEGACY: CapturedSchema = {
  type: "object",
  properties: {
    BusinessPartner: { type: "string" },
    BusinessPartnerName: { type: "string" },
    to_BusinessPartnerAddress: { type: "object" },
    to_Role: { type: "object" },
  },
  required: ["BusinessPartner", "BusinessPartnerName", "to_BusinessPartnerAddress", "to_Role"],
  additionalProperties: true,
  "x-captured": {
    sampleSize: 20,
    capturedAt: "2026-09-01T00:00:00.000Z",
    note:
      "Inferred from 20 live rows returned by this tenant. Fields absent from the sample are not described, " +
      "and additionalProperties stays true. 4 fields were present in every sampled row and are marked required.",
    alwaysPresent: ["BusinessPartner", "BusinessPartnerName", "to_BusinessPartnerAddress", "to_Role"],
  },
};

const IFACE: ScaffoldInterface = {
  id: "if_1",
  name: "BP - Read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BusinessPartner",
  version: 1,
  solutionName: "QA-Solution",
};

function recordSchema(openapi: string): { required: string[]; properties: Record<string, unknown> } {
  const doc = JSON.parse(openapi) as {
    components: { schemas: Record<string, { required: string[]; properties: Record<string, unknown> }> };
  };
  return doc.components.schemas.ABusinessPartner!;
}

/** The keys `required` names that a row does not carry — what a validator rejects it for. */
function missingRequired(required: readonly string[], row: Record<string, unknown>): string[] {
  return required.filter((name) => !(name in row));
}

describe("a schema captured before the envelope was stripped", () => {
  it("openapi.json requires nothing a served row does not carry", () => {
    const record = recordSchema(buildOpenApi({ ...IFACE, responseSchema: LEGACY }));
    expect(missingRequired(record.required, SERVED_ROW)).toEqual([]);
    expect(record.required).toEqual(["BusinessPartner", "BusinessPartnerName"]);
  });

  it("client.ts no longer declares the deferred navigations as always there", () => {
    const src = buildTypeScriptClient({ ...IFACE, responseSchema: LEGACY });
    expect(src).toContain("to_BusinessPartnerAddress?: Record<string, unknown>;");
    expect(src).not.toContain("to_BusinessPartnerAddress: Record<string, unknown>;");
    expect(src).toContain("BusinessPartner: string;");
  });

  it("the kit's contract accepts the rows its own mock serves", () => {
    // The scenario as reported: the same kit's fixtures.json (stripped on the
    // way out) and openapi.json (served as stored) disagreed.
    const files = buildScaffold({ ...IFACE, responseSchema: LEGACY }, undefined, [
      {
        scenario: "data",
        status: 200,
        body: { records: [sapRow(0), sapRow(1)], count: 2, empty: false, note: "2 records." },
        sourceStatus: 200,
        capturedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const contents = (path: string) => files.find((f) => f.path === path)!.contents;
    const { required } = recordSchema(contents("openapi.json"));
    const fixtures = JSON.parse(contents("fixtures.json")) as {
      fixtures: { body: { records: Record<string, unknown>[] } }[];
    };
    for (const row of fixtures.fixtures[0]!.body.records) {
      expect(missingRequired(required, row)).toEqual([]);
    }
  });

  it("drops the navigations from alwaysPresent too, and the note says why", () => {
    const served = servedResponseSchema(LEGACY) as CapturedSchema;
    expect(served["x-captured"].alwaysPresent).toEqual(["BusinessPartner", "BusinessPartnerName"]);
    expect(served["x-captured"].note).toContain(LEGACY["x-captured"].note);
    expect(served["x-captured"].note).toMatch(/Capture schema again/);
    // Provenance is kept: it is still the same capture.
    expect(served["x-captured"].sampleSize).toBe(20);
    expect(served["x-captured"].capturedAt).toBe(LEGACY["x-captured"].capturedAt);
  });

  it("still describes an object-typed field — a complex type is real data — but no longer requires it", () => {
    const withComplex: CapturedSchema = {
      ...LEGACY,
      properties: { ...LEGACY.properties, PostalAddress: { type: "object" } },
      required: [...LEGACY.required, "PostalAddress"],
    };
    const served = servedResponseSchema(withComplex) as CapturedSchema;
    expect(served.properties.PostalAddress).toEqual({ type: "object" });
    expect(served.properties.to_Role).toEqual({ type: "object" });
    expect(served.required).not.toContain("PostalAddress");
  });

  it("stops describing an envelope key the old list let through", () => {
    // The old list named @odata.etag and @odata.context; every other @odata.*
    // key was recorded as a string field present in every row.
    const withLink: CapturedSchema = {
      ...LEGACY,
      properties: { ...LEGACY.properties, "@odata.id": { type: "string" } },
      required: [...LEGACY.required, "@odata.id"],
    };
    const served = servedResponseSchema(withLink) as CapturedSchema;
    expect(served.properties).not.toHaveProperty("@odata.id");
    expect(served.required).not.toContain("@odata.id");
  });

  it("does not modify the stored value", () => {
    const before = structuredClone(LEGACY);
    servedResponseSchema(LEGACY);
    expect(LEGACY).toEqual(before);
  });
});

describe("a schema captured since", () => {
  // Twenty rows whose object field is a complex type the broker DOES serve.
  const rows = Array.from({ length: MIN_SAMPLE_FOR_REQUIRED }, (_, i) => ({
    ...sapRow(i),
    PostalAddress: { Street: "Main St", City: "Berlin" },
  }));
  const fresh = inferResponseSchema(rows, new Date("2026-10-01T00:00:00Z"))!;

  it("carries the marker that says its rows were stripped first", () => {
    expect(fresh["x-captured"].envelope).toBe("stripped");
  });

  it("is served exactly as captured: an object field present in every row stays required", () => {
    expect(servedResponseSchema(fresh)).toBe(fresh);
    expect(recordSchema(buildOpenApi({ ...IFACE, responseSchema: fresh })).required).toEqual([
      "BusinessPartner",
      "BusinessPartnerName",
      "PostalAddress",
    ]);
  });
});

describe("GET /api/northbound/interfaces/{id}/schema", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  async function servedSchema(responseSchema: unknown) {
    findFirst.mockResolvedValue({
      id: "if_1",
      name: "BP - Read",
      externalId: "API_BUSINESS_PARTNER",
      sapProduct: "s4hana",
      operation: "READ",
      entitySet: "A_BusinessPartner",
      mode: "LIVE",
      version: 1,
      requestSchema: null,
      responseSchema,
      solutionId: "sol_1",
    });
    const res = await getSchema(
      new NextRequest("https://coreedge.example/api/northbound/interfaces/if_1/schema", {
        headers: { authorization: "Bearer t" },
      }),
      { params: Promise.resolve({ id: "if_1" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { responseSchema: CapturedSchema | null; schemaCaptured: boolean } };
    return body.data;
  }

  it("serves a legacy schema as the rows can satisfy it", async () => {
    const data = await servedSchema(LEGACY);
    expect(missingRequired(data.responseSchema!.required, SERVED_ROW)).toEqual([]);
    expect(data.responseSchema!.properties).toHaveProperty("to_BusinessPartnerAddress");
    expect(data.schemaCaptured).toBe(true);
  });

  it("still answers null when nothing has been captured", async () => {
    const data = await servedSchema(null);
    expect(data.responseSchema).toBeNull();
    expect(data.schemaCaptured).toBe(false);
  });
});
