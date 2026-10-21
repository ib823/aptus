// @vitest-environment node
/**
 * What the compiled JSON Schemas and the northbound OpenAPI promise, checked
 * against data rather than against themselves:
 *
 *   - a record schema accepts the row SAP's V2 or V4 JSON actually carries, and
 *     refuses the other version's shape for the same field;
 *   - a create body leaves out what the client may not send and requires only
 *     what the service marks mandatory; an update leaves out keys, computed,
 *     immutable and non-updatable fields; requestSchema describes the body;
 *   - the documents name every header and every error code, draw only the
 *     operations the broker serves, and the validators used for the goldens
 *     really do reject an invalid document.
 */

import { readFileSync } from "fs";
import path from "path";

import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { compileContract } from "@/lib/contracts/compile";
import type { ContractIR, InterfaceContract } from "@/lib/contracts/ir";
import { standaloneSchemas } from "@/lib/contracts/json-schema";
import { ALL_ERROR_CODES, NORTHBOUND_REFUSAL_REASONS } from "@/lib/contracts/northbound-errors";
import { buildNorthboundOpenApi, northboundServers, type InterfaceForDoc } from "@/lib/contracts/openapi";
import { personalDataCoverage } from "@/lib/contracts/personal-data";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { NORTHBOUND_API_VERSIONS } from "@/lib/northbound/version-policy";

import { validateOpenApi30, validateOpenApi31 } from "../../helpers/openapi-validate";
import { evaluateDescription } from "../../../scripts/lib/contract-corpus";

const EDMX = path.resolve(__dirname, "../../fixtures/contracts/edmx");
const read = (f: string) => readFileSync(path.join(EDMX, f), "utf8");

function ir(file: string): ContractIR {
  const r = compileContract(read(file));
  if (!r.ok) throw new Error(r.detail);
  return r.ir;
}

function slice(file: string, set: string): InterfaceContract {
  const s = sliceForEntitySet(ir(file), set);
  if (!s.ok) throw new Error(s.detail);
  return s.contract;
}

function validator() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv;
}

describe("the record schema follows the wire format of the service's version", () => {
  const v2 = standaloneSchemas(slice("business-partner.v2.xml", "A_Partner"), "APartner");
  const v4 = standaloneSchemas(slice("sales-order-rap.v4.xml", "SalesOrder"), "SalesOrder");

  it("accepts a V2 row as SAP Gateway sends it", () => {
    const ok = validator().compile(v2.record);
    const row = {
      Partner: "1000123",
      PartnerFullName: "Ana Example",
      BirthDate: "/Date(631152000000)/",
      PartnerUUID: "0f0e0d0c-0b0a-4908-8706-050403020100",
      IsBlocked: false,
      CreationTime: "PT12H30M00S",
      LastChangeDateTime: "/Date(1717171717000+0000)/",
      CreditLimit: "15000.00",
      ExternalRef: "9007199254740993",
      EmployeeCount: 12,
    };
    expect(ok(row), JSON.stringify(ok.errors)).toBe(true);
  });

  it("refuses the V4 shapes of the same fields in a V2 record", () => {
    const ok = validator().compile(v2.record);
    expect(ok({ Partner: "1", CreditLimit: 15000 })).toBe(false); // V2 Decimal is a string
    expect(ok({ Partner: "1", BirthDate: "1990-01-01T00:00:00Z" })).toBe(false); // V2 DateTime is /Date()/
    expect(ok({ Partner: "1", ExternalRef: 42 })).toBe(false); // V2 Int64 is a string
    expect(ok({ PartnerFullName: "no key" })).toBe(false); // the key is required
  });

  it("accepts a V4 row as RAP sends it, and refuses V2 shapes", () => {
    const ok = validator().compile(v4.record);
    const row = {
      SalesOrder: "0000000042",
      SalesOrderUUID: "0f0e0d0c-0b0a-4908-8706-050403020100",
      TotalNetAmount: 1234.5,
      ItemCount: 3,
      RequestedDeliveryDate: "2026-11-01",
      CreatedAt: "2026-10-20T10:00:00.1234567Z",
      DeliveryTime: "10:30:00",
      Status: "Open",
      NetValue: { Amount: 10.5, Currency: "EUR" },
      Tags: ["urgent"],
    };
    expect(ok(row), JSON.stringify(ok.errors)).toBe(true);
    expect(ok({ ...row, TotalNetAmount: "1234.5" })).toBe(false);
    expect(ok({ ...row, Status: "Unknown" })).toBe(false);
    expect(ok({ ...row, RequestedDeliveryDate: "/Date(1)/" })).toBe(false);
  });

  it("stays open to fields the description does not name (a customer's extension fields)", () => {
    expect(validator().compile(v4.record)({ SalesOrder: "1", YY1_Extension_SDH: "x" })).toBe(true);
  });
});

describe("the write bodies", () => {
  const so = standaloneSchemas(slice("sales-order-rap.v4.xml", "SalesOrder"), "SalesOrder");

  it("a create leaves out computed fields and requires only what is mandatory", () => {
    const props = Object.keys(so.create!.properties as object);
    expect(props).not.toContain("SalesOrderUUID"); // Core.Computed
    expect(props).not.toContain("CreatedAt");
    expect(props).toContain("SalesOrderType"); // immutable: set on create
    expect(so.create!.required).toEqual(["SoldToParty", "PurchaseOrderByCustomer"]);
    expect(so.create!.additionalProperties).toBe(false);
    const ok = validator().compile(so.create!);
    expect(ok({ SoldToParty: "17100001", PurchaseOrderByCustomer: "PO-1", SalesOrderType: "OR" })).toBe(true);
    expect(ok({ SoldToParty: "17100001" })).toBe(false);
    expect(ok({ SoldToParty: "1", PurchaseOrderByCustomer: "x", SalesOrderUUID: "0f0e0d0c-0b0a-4908-8706-050403020100" })).toBe(false);
  });

  it("an update leaves out the key, computed and immutable fields", () => {
    const props = Object.keys(so.update!.properties as object);
    expect(props).not.toContain("SalesOrder");
    expect(props).not.toContain("SalesOrderType");
    expect(props).not.toContain("LastChangedAt");
    expect(so.update!.required).toBeUndefined();
  });

  it("V2 sap:creatable=false and SuccessFactors sap:required are honoured", () => {
    const bp = standaloneSchemas(slice("business-partner.v2.xml", "A_Partner"), "APartner");
    expect(Object.keys(bp.create!.properties as object)).not.toContain("PartnerFullName");
    expect(Object.keys(bp.update!.properties as object)).not.toContain("PartnerCategory");
    const sf = standaloneSchemas(slice("successfactors-style.v2.xml", "cust_TravelRequest"), "CustTravelRequest");
    expect(sf.create!.required).toEqual(["externalCode", "effectiveStartDate"]);
  });

  it("a dataset SAP marks read-only has no write bodies", () => {
    const yy1 = standaloneSchemas(slice("yy1-sales-bonus.v2.xml", "YY1_SALESBONUS"), "YY1SALESBONUS");
    expect(yy1.create).toBeNull();
    expect(yy1.update).toBeNull();
    expect(yy1.key).not.toBeNull();
  });
});

/** A generated document, read as the JSON it is serialised to. */
type Doc = ReturnType<typeof JSON.parse>;

const BASE_DOC = {
  baseUrl: "https://coreedge.example/api/northbound",
  title: "T",
  description: "D",
  infoVersion: "1.0.0",
};

function iface(over: Partial<InterfaceForDoc>): InterfaceForDoc {
  return {
    id: "if_1",
    name: "Sales orders",
    externalId: "X",
    sapProduct: "s4hana",
    operation: "READ",
    mode: "READ",
    entitySet: "SalesOrder",
    version: 1,
    contract: { source: "metadata", contract: slice("sales-order-rap.v4.xml", "SalesOrder"), semver: "1.0.0" },
    ...over,
  };
}

describe("the northbound document", () => {
  it("draws the read for a read interface, the write for a create interface, and neither for an update", () => {
    const doc = buildNorthboundOpenApi({
      ...BASE_DOC,
      version: "3.1.0",
      interfaces: [
        iface({ id: "if_r" }),
        iface({ id: "if_c", operation: "CREATE", mode: "WRITE" }),
        iface({ id: "if_u", operation: "UPDATE", mode: "WRITE" }),
      ],
    }) as { paths: Record<string, Record<string, unknown>>; "x-coreedge-interfaces": { id: string; operations: Record<string, { served: boolean }> }[] };
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/interfaces/if_c/data/write",
      "/interfaces/if_c/schema",
      "/interfaces/if_r/data",
      "/interfaces/if_r/schema",
      "/interfaces/if_u/schema",
      "/versions",
    ]);
    const ops = Object.fromEntries(doc["x-coreedge-interfaces"].map((i) => [i.id, i.operations]));
    expect(ops.if_u!.update!.served).toBe(false);
    expect(ops.if_r!.getByKey!.served).toBe(false);
    expect(ops.if_c!.create!.served).toBe(true);
  });

  it("a write needs the bearer token, the write key and an Idempotency-Key, and its body is the compiled create schema", () => {
    const doc = buildNorthboundOpenApi({ ...BASE_DOC, version: "3.1.0", interfaces: [iface({ operation: "CREATE", mode: "WRITE" })] }) as Doc;
    const post = doc.paths["/interfaces/if_1/data/write"].post;
    expect(post.security).toEqual([{ bearerAuth: [], writeKey: [] }]);
    expect(post.parameters).toEqual([
      { $ref: "#/components/parameters/IdempotencyKey" },
      { $ref: "#/components/parameters/CoreEdgeVersion" },
    ]);
    expect(doc.components.parameters.IdempotencyKey).toMatchObject({ in: "header", name: "Idempotency-Key", required: true });
    expect(doc.components.securitySchemes.writeKey).toMatchObject({ type: "apiKey", in: "header", name: "X-CoreEdge-Write-Key" });
    const body = doc.components.schemas[post.requestBody.content["application/json"].schema.$ref.split("/").pop()];
    expect(body.properties.record).toEqual({ $ref: "#/components/schemas/SalesOrder_Create" });
    expect(Object.keys(post.responses).sort()).toEqual(["201", "400", "401", "403", "404", "409", "422", "429", "502", "503", "504", "5XX"]);
    expect(post.responses["409"].headers["Retry-After"]).toBeTruthy();
    expect(post.responses["201"].headers["Idempotency-Replayed"]).toBeTruthy();
  });

  it("every answer carries the correlation id, the request id and the rate-limit header", () => {
    const doc = buildNorthboundOpenApi({ ...BASE_DOC, version: "3.1.0", interfaces: [iface({})] }) as Doc;
    const get = doc.paths["/interfaces/if_1/data"].get;
    for (const [status, r] of Object.entries<Doc>(get.responses)) {
      const resolved = r.$ref ? doc.components.responses[r.$ref.split("/").pop()] : r;
      expect(Object.keys(resolved.headers), status).toEqual(expect.arrayContaining(["x-correlation-id", "X-Request-Id", "X-RateLimit-Remaining"]));
    }
    expect(doc.components.responses.RateLimited.headers["Retry-After"]).toBeTruthy();
    expect(doc.components.responses.LimiterUnavailable.headers["Retry-After"]).toBeTruthy();
  });

  it.each(["3.1.0", "3.0.3"] as const)("describes API versioning as P1.10 serves it (%s)", (version) => {
    const doc = buildNorthboundOpenApi({
      ...BASE_DOC,
      version,
      discovery: true,
      interfaces: [iface({ id: "if_r" }), iface({ id: "if_c", operation: "CREATE", mode: "WRITE" })],
    }) as Doc;
    // The versioned path is the recommended server; the original stays listed.
    expect(doc.servers.map((s: { url: string }) => s.url)).toEqual([
      "https://coreedge.example/api/northbound/v1",
      "https://coreedge.example/api/northbound",
    ]);
    expect(doc.components.parameters.CoreEdgeVersion).toMatchObject({ name: "CoreEdge-Version", in: "header", required: false });
    expect(doc.components.parameters.CoreEdgeVersion.description).toContain(NORTHBOUND_API_VERSIONS[0]!.version);
    for (const [route, ops] of Object.entries<Doc>(doc.paths)) {
      for (const [method, op] of Object.entries<Doc>(ops)) {
        const where = `${method.toUpperCase()} ${route}`;
        expect(op.parameters, where).toContainEqual({ $ref: "#/components/parameters/CoreEdgeVersion" });
        // Every operation documents the version refusal under its 400.
        const bad = op.responses["400"].$ref ? doc.components.responses[op.responses["400"].$ref.split("/").pop()] : op.responses["400"];
        expect(bad["x-coreedge-error-codes"].map((c: { code: string }) => c.code), where).toContain("UNSUPPORTED_VERSION");
        // Every answer a version served names it; the version refusal does not.
        for (const [status, r] of Object.entries<Doc>(op.responses)) {
          const resolved = r.$ref ? doc.components.responses[r.$ref.split("/").pop()] : r;
          const codes = (resolved["x-coreedge-error-codes"] ?? []).map((c: { code: string }) => c.code);
          const onlyVersionRefusal = codes.length === 1 && codes[0] === "UNSUPPORTED_VERSION";
          expect(Boolean(resolved.headers["CoreEdge-Version"]), `${where} ${status}`).toBe(!onlyVersionRefusal);
        }
      }
    }
    for (const h of ["CoreEdgeVersion", "Deprecation", "Sunset", "Link"]) expect(doc.components.headers[h], h).toBeTruthy();
    // The refusal's own fields, and the changelog route with no credential.
    expect(Object.keys(doc.components.schemas.Error.properties.error.properties)).toEqual(
      expect.arrayContaining(["requestedVersion", "supportedVersions"]),
    );
    expect(doc.paths["/versions"].get.security).toEqual([]);
    expect(doc.paths["/versions"].get.responses["200"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/Versions" });
  });

  it("lists a base URL that is not a CoreEdge path as given", () => {
    expect(northboundServers("http://localhost:4010")).toEqual([{ url: "http://localhost:4010" }]);
    expect(northboundServers("https://ce.example/api/northbound/").map((s) => s.url)).toEqual([
      "https://ce.example/api/northbound/v1",
      "https://ce.example/api/northbound",
    ]);
  });

  it("the error envelope lists every code the broker can send, and the reasons behind them", () => {
    const doc = buildNorthboundOpenApi({ ...BASE_DOC, version: "3.0.3", interfaces: [iface({})] }) as Doc;
    expect(doc.components.schemas.Error.properties.error.properties.code.enum).toEqual(ALL_ERROR_CODES);
    for (const code of ["LIMITER_UNAVAILABLE", "CONNECTION_NOT_CONFIGURED", "RATE_LIMITED_ADDRESS", "CONFLICT"]) {
      expect(ALL_ERROR_CODES).toContain(code);
    }
    const reasons = (doc.components.schemas.Error["x-coreedge-refusal-reasons"] as { reason: string; code: string; status: number }[]).map((r) => r.reason);
    // P0.1, P0.5 and P0.11's refusals are all documented with the code they surface as.
    expect(reasons).toEqual(expect.arrayContaining(["GRANT_NEEDS_REAPPROVAL", "TOKEN_TIMEOUT", "TOKEN_REJECTED", "ROTATED_OUT", "EXPIRED", "REVOKED", "LIMITER_UNAVAILABLE"]));
    expect(NORTHBOUND_REFUSAL_REASONS.find((r) => r.reason === "ROTATED_OUT")).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(NORTHBOUND_REFUSAL_REASONS.find((r) => r.reason === "GRANT_NEEDS_REAPPROVAL")).toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("notes the environments whose approved grants cover each operation", () => {
    const doc = buildNorthboundOpenApi({
      ...BASE_DOC,
      version: "3.1.0",
      interfaces: [iface({ grants: [{ operation: "READ", environment: "TEST" }, { operation: "READ", environment: "DEV" }, { operation: "CREATE", environment: "PROD" }] })],
    }) as Doc;
    expect(doc["x-coreedge-interfaces"][0].operations.list.grantedIn).toEqual(["DEV", "TEST"]);
  });

  it("a write on a dataset SAP marks not creatable is not drawn, and says why", () => {
    const yy1 = slice("yy1-sales-bonus.v2.xml", "YY1_SALESBONUS");
    const doc = buildNorthboundOpenApi({
      ...BASE_DOC,
      version: "3.1.0",
      interfaces: [iface({ operation: "CREATE", mode: "WRITE", entitySet: "YY1_SALESBONUS", contract: { source: "metadata", contract: yy1, semver: "1.0.0" } })],
    }) as Doc;
    expect(doc.paths["/interfaces/if_1/data/write"]).toBeUndefined();
    expect(doc["x-coreedge-interfaces"][0].operations.create).toMatchObject({ served: false, allowedBySap: false });
  });

  it("without a compiled contract the record stays open and says so", () => {
    const doc = buildNorthboundOpenApi({ ...BASE_DOC, version: "3.1.0", interfaces: [iface({ contract: { source: "none" } })] }) as Doc;
    expect(doc.components.schemas.SalesOrder.additionalProperties).toBe(true);
    expect(doc.components.schemas.SalesOrder.properties).toBeUndefined();
    expect(validateOpenApi31(doc).errors).toEqual([]);
  });
});

describe("the specification validators are not vacuous", () => {
  const good = () => buildNorthboundOpenApi({ ...BASE_DOC, version: "3.1.0", interfaces: [iface({})] }) as Doc;

  it("3.1 rejects a document with a missing info and a malformed schema", () => {
    const doc = good();
    delete doc.info;
    doc.components.schemas.SalesOrder.type = "nothing";
    const v = validateOpenApi31(doc);
    expect(v.valid).toBe(false);
    expect(v.errors.join("\n")).toMatch(/info/);
    expect(v.errors.join("\n")).toMatch(/components\/schemas\/SalesOrder/);
  });

  it("3.0 rejects a 3.1 type array", () => {
    const doc = buildNorthboundOpenApi({ ...BASE_DOC, version: "3.0.3", interfaces: [iface({})] }) as Doc;
    expect(validateOpenApi30(doc).valid).toBe(true);
    doc.components.schemas.SalesOrder.properties.ContactEmail.type = ["string", "null"];
    expect(validateOpenApi30(doc).valid).toBe(false);
  });
});

/**
 * A 3.0.3 document's components compiled the way 3.0 tooling compiles them:
 * ajv with OpenAPI's `nullable` keyword (draft-07 underneath), references
 * rewritten to the root they are compiled under.
 */
function oas30Validator(doc: Doc, name: string) {
  const defs = JSON.parse(JSON.stringify(doc.components.schemas).replaceAll("#/components/schemas/", "#/definitions/"));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  return ajv.compile({ definitions: defs, $ref: `#/definitions/${name}` });
}

const V4_NULLABLE_REFS =
  '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
  '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
  '<EnumType Name="Level"><Member Name="Low"/><Member Name="High"/></EnumType>' +
  '<ComplexType Name="Money"><Property Name="Amount" Type="Edm.Decimal"/></ComplexType>' +
  '<EntityType Name="T"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/>' +
  '<Property Name="Net" Type="ns.Money"/><Property Name="Level" Type="ns.Level"/>' +
  '<Property Name="Gross" Type="ns.Money" Nullable="false"/></EntityType>' +
  '<EntityContainer Name="C"><EntitySet Name="TSet" EntityType="ns.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';

describe("OpenAPI 3.0.3 schemas mean what they say", () => {
  const contract = (() => {
    const r = compileContract(V4_NULLABLE_REFS);
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, "TSet");
    if (!s.ok) throw new Error(s.detail);
    return s.contract;
  })();
  const doc30 = (c: InterfaceContract = contract, entitySet = "TSet") =>
    buildNorthboundOpenApi({
      ...BASE_DOC,
      version: "3.0.3",
      interfaces: [
        iface({ id: "if_r", entitySet, contract: { source: "metadata", contract: c, semver: "1.0.0" } }),
        iface({ id: "if_c", entitySet, operation: "CREATE", mode: "WRITE", contract: { source: "metadata", contract: c, semver: "1.0.0" } }),
      ],
    }) as Doc;

  it("a nullable complex or enum property admits null, and only where the description allows it", () => {
    const doc = doc30();
    expect(validateOpenApi30(doc).errors).toEqual([]);
    const ok = oas30Validator(doc, "TSet");
    expect(ok({ Id: "1", Net: null, Level: null, Gross: { Amount: 1 } }), JSON.stringify(ok.errors)).toBe(true);
    expect(ok({ Id: "1", Net: { Amount: 2 }, Level: "High", Gross: { Amount: 1 } })).toBe(true);
    expect(ok({ Id: "1", Gross: null })).toBe(false); // not nullable
    expect(ok({ Id: "1", Level: "Medium" })).toBe(false); // not a member
    expect(ok({ Id: "1", Net: "x" })).toBe(false);
  });

  it("a create's result carries a null record when SAP answered without a body", () => {
    const doc = buildNorthboundOpenApi({
      ...BASE_DOC,
      version: "3.0.3",
      interfaces: [
        iface({ entitySet: "TSet", operation: "CREATE", mode: "WRITE", contract: { source: "metadata", contract, semver: "1.0.0" } }),
      ],
    }) as Doc;
    const ok = oas30Validator(doc, "TSet_CreateResult");
    const data = { created: true, location: null, interface: { id: "if_c", name: "x", version: 1 }, note: "n" };
    expect(ok({ data: { ...data, record: null } }), JSON.stringify(ok.errors)).toBe(true);
    expect(ok({ data: { ...data, record: { Id: "1" } } })).toBe(true);
    expect(ok({ data: { ...data, record: "x" } })).toBe(false);
  });

  it("every component of every golden service compiles under 3.0 tooling", () => {
    for (const [file, set] of [
      ["business-partner.v2.xml", "A_Partner"],
      ["sales-order-rap.v4.xml", "SalesOrder"],
      ["successfactors-style.v2.xml", "cust_TravelRequest"],
      ["z-travel-booking.v2.xml", "BookingSet"],
      ["yy1-sales-bonus.v2.xml", "YY1_SALESBONUS"],
      ["z-bonus-plan-rap.v4.xml", "BonusPlan"],
    ] as const) {
      const doc = doc30(slice(file, set), set);
      for (const name of Object.keys(doc.components.schemas)) expect(() => oas30Validator(doc, name), `${file} ${name}`).not.toThrow();
    }
    const so = oas30Validator(doc30(slice("sales-order-rap.v4.xml", "SalesOrder"), "SalesOrder"), "SalesOrder");
    expect(so({ SalesOrder: "1", NetValue: null }), JSON.stringify(so.errors)).toBe(true);
  });
});

describe("Edm.Binary", () => {
  const BINARY = (version: "1.0" | "4.0") =>
    version === "4.0"
      ? '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
        '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
        '<EntityType Name="T"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/>' +
        '<Property Name="Hash" Type="Edm.Binary" MaxLength="16"/></EntityType>' +
        '<EntityContainer Name="C"><EntitySet Name="TSet" EntityType="ns.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>'
      : '<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">' +
        '<edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="ns" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">' +
        '<EntityType Name="T"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/>' +
        '<Property Name="Hash" Type="Edm.Binary" MaxLength="16"/></EntityType>' +
        '<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="TSet" EntityType="ns.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
  const contractOf = (version: "1.0" | "4.0") => {
    const r = compileContract(BINARY(version));
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, "TSet");
    if (!s.ok) throw new Error(s.detail);
    return s.contract;
  };

  it("bounds the encoded value, not the byte count: a value at its full length is valid", () => {
    for (const version of ["1.0", "4.0"] as const) {
      const schemas = standaloneSchemas(contractOf(version), "TSet");
      const full = Buffer.alloc(16, 0xfb);
      const encoded = version === "4.0" ? full.toString("base64url") : full.toString("base64");
      for (const s of [schemas.record, schemas.create!]) {
        const ok = validator().compile(s);
        expect(ok({ Id: "1", Hash: encoded }), `${version} ${JSON.stringify(ok.errors)}`).toBe(true);
        // Padded base64 of the same bytes is accepted on either version.
        expect(ok({ Id: "1", Hash: full.toString("base64") })).toBe(true);
        // Past the encoded bound (19 bytes: 28 characters) is still refused.
        expect(ok({ Id: "1", Hash: Buffer.alloc(19, 0xfb).toString("base64") })).toBe(false);
      }
      expect((schemas.record.properties as Record<string, Record<string, unknown>>).Hash).toMatchObject({ maxLength: 24, "x-odata-max-length": 16 });
    }
  });

  it("does the same in the 3.0.3 document", () => {
    const doc = buildNorthboundOpenApi({
      ...BASE_DOC,
      version: "3.0.3",
      interfaces: [iface({ entitySet: "TSet", contract: { source: "metadata", contract: contractOf("1.0"), semver: "1.0.0" } })],
    }) as Doc;
    const ok = oas30Validator(doc, "TSet");
    expect(ok({ Id: "1", Hash: Buffer.alloc(16, 1).toString("base64") }), JSON.stringify(ok.errors)).toBe(true);
  });
});

describe("slicing", () => {
  it("names a dataset the service does not declare as such", () => {
    expect(sliceForEntitySet(ir("sales-order-rap.v4.xml"), "Nope")).toMatchObject({ ok: false, reason: "NO_SUCH_ENTITY_SET" });
  });

  it("folds a base type's key and properties into the entity type", () => {
    const doc =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
      '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
      '<EntityType Name="Base" Abstract="true"><Key><PropertyRef Name="ID"/></Key><Property Name="ID" Type="Edm.Int32" Nullable="false"/></EntityType>' +
      '<EntityType Name="Child" BaseType="ns.Base"><Property Name="Name" Type="Edm.String"/></EntityType>' +
      '<EntityType Name="Loop" BaseType="ns.Loop"><Property Name="X" Type="Edm.String"/></EntityType>' +
      '<EntityContainer Name="C"><EntitySet Name="Children" EntityType="ns.Child"/><EntitySet Name="Loops" EntityType="ns.Loop"/>' +
      '<Singleton Name="Me" Type="ns.Child"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
    const r = compileContract(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = sliceForEntitySet(r.ir, "Children");
    expect(s.ok && s.contract.entityType.key).toEqual(["ID"]);
    expect(s.ok && s.contract.entityType.properties.map((p) => p.name)).toEqual(["ID", "Name"]);
    // A type that names itself as its base does not loop.
    const loop = sliceForEntitySet(r.ir, "Loops");
    expect(loop.ok && loop.contract.entityType.properties.map((p) => p.name)).toEqual(["X"]);
    expect(r.ir.entitySets.find((e) => e.name === "Me")?.singleton).toBe(true);
  });

  it("keeps a V2 import that acts on the dataset's type (sap:action-for), and none that acts on another", () => {
    const partner = slice("business-partner.v2.xml", "A_Partner");
    expect(partner.operations.map((o) => o.name).sort()).toEqual(["BlockPartner", "ReleasePartner"]);
    expect(partner.operations.find((o) => o.name === "ReleasePartner")).toMatchObject({
      actionFor: "API_PARTNER_DEMO.A_PartnerType",
      kind: "action",
      parameters: [{ name: "Partner" }],
    });
    expect(slice("business-partner.v2.xml", "A_Customer").operations).toEqual([]);
  });

  it("still folds an ordinary complex base type into each type that derives from it", () => {
    const doc =
      '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
      '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
      '<ComplexType Name="Address"><Property Name="City" Type="Edm.String"/></ComplexType>' +
      '<ComplexType Name="Home" BaseType="ns.Address"><Property Name="Floor" Type="Edm.Int32"/></ComplexType>' +
      '<ComplexType Name="Work" BaseType="ns.Address"><Property Name="Desk" Type="Edm.String"/></ComplexType>' +
      '<EntityType Name="T"><Key><PropertyRef Name="K"/></Key><Property Name="K" Type="Edm.String" Nullable="false"/>' +
      '<Property Name="H" Type="ns.Home"/><Property Name="W" Type="ns.Work"/></EntityType>' +
      '<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
    const r = compileContract(doc);
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, "S");
    if (!s.ok) throw new Error(s.detail);
    expect(Object.fromEntries(s.contract.complexTypes.map((t) => [t.name, t.properties.map((p) => p.name)]))).toEqual({
      Home: ["City", "Floor"],
      Work: ["City", "Desk"],
    });
  });
});

describe("SuccessFactors' sap: namespace", () => {
  // SuccessFactors binds the sap: prefix to its own URI. Attributes are matched
  // by URI, so the same description under either URI must compile the same.
  it("reads sap: attributes under SuccessFactors' URI exactly as under SAP Gateway's", () => {
    const sf = read("successfactors-style.v2.xml");
    expect(sf).toContain('xmlns:sap="http://www.successfactors.com/edm/sap"');
    const gateway = sf.replace('xmlns:sap="http://www.successfactors.com/edm/sap"', 'xmlns:sap="http://www.sap.com/Protocols/SAPData"');
    const a = compileContract(sf);
    const b = compileContract(gateway);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.ir).toEqual(b.ir);

    const contract = slice("successfactors-style.v2.xml", "cust_TravelRequest");
    const lm = contract.entityType.properties.find((p) => p.name === "lastModifiedDateTime");
    expect(lm).toMatchObject({ label: "Last Modified Date", capabilities: { creatable: false, updatable: false } });
    const create = standaloneSchemas(contract, "CustTravelRequest").create!;
    expect(create.required).toEqual(["externalCode", "effectiveStartDate"]);
    expect(Object.keys(create.properties as object)).not.toContain("lastModifiedDateTime");
  });
});

describe("component names", () => {
  // Price_Info and PriceInfo both normalise to PriceInfo, and a type called
  // Create lands on the create body's name: one schema overwrote the other.
  const COLLIDING =
    '<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices>' +
    '<Schema Namespace="ns" xmlns="http://docs.oasis-open.org/odata/ns/edm">' +
    '<ComplexType Name="Price_Info"><Property Name="Amount" Type="Edm.Int32"/></ComplexType>' +
    '<ComplexType Name="PriceInfo"><Property Name="Currency" Type="Edm.String"/></ComplexType>' +
    '<ComplexType Name="Create"><Property Name="Foo" Type="Edm.String"/></ComplexType>' +
    '<EnumType Name="Key"><Member Name="One"/></EnumType>' +
    '<EntityType Name="T"><Key><PropertyRef Name="K"/></Key><Property Name="K" Type="Edm.String" Nullable="false"/>' +
    '<Property Name="A" Type="ns.Price_Info"/><Property Name="B" Type="ns.PriceInfo"/>' +
    '<Property Name="C" Type="ns.Create"/><Property Name="E" Type="ns.Key"/></EntityType>' +
    '<EntityContainer Name="C"><EntitySet Name="S" EntityType="ns.T"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
  const contract = (() => {
    const r = compileContract(COLLIDING);
    if (!r.ok) throw new Error(r.detail);
    const s = sliceForEntitySet(r.ir, "S");
    if (!s.ok) throw new Error(s.detail);
    return s.contract;
  })();
  const record = { K: "1", A: { Amount: 1 }, B: { Currency: "EUR" }, C: { Foo: "x" }, E: "One" };

  it("give each type its own schema, so a valid record and a valid create body validate", () => {
    const schemas = standaloneSchemas(contract, "S");
    const ajv = validator();
    const rec = ajv.compile(schemas.record);
    expect(rec(record), JSON.stringify(rec.errors)).toBe(true);
    const create = validator().compile(schemas.create!);
    expect(create(record), JSON.stringify(create.errors)).toBe(true);
    expect(create({ ...record, A: { Currency: "EUR" } })).toBe(false);
  });

  it("hold in both documents, and a dataset called Error does not replace the error envelope", () => {
    for (const version of ["3.1.0", "3.0.3"] as const) {
      const doc = buildNorthboundOpenApi({
        ...BASE_DOC,
        version,
        interfaces: [
          iface({ id: "if_r", entitySet: "S", contract: { source: "metadata", contract, semver: "1.0.0" } }),
          iface({ id: "if_c", entitySet: "S", operation: "CREATE", mode: "WRITE", contract: { source: "metadata", contract, semver: "1.0.0" } }),
          iface({ id: "if_e", entitySet: "Error", contract: { source: "none" } }),
        ],
      }) as Doc;
      expect((version === "3.1.0" ? validateOpenApi31 : validateOpenApi30)(doc).errors).toEqual([]);
      expect(doc.components.schemas.Error["x-coreedge-codes"]).toBeDefined();
      expect(doc.paths["/interfaces/if_e/data"].get.responses["200"].content["application/json"].schema.$ref).toBe(
        "#/components/schemas/Error2_ReadResult",
      );
      if (version === "3.0.3") {
        const ok = oas30Validator(doc, "S_Create");
        expect(ok(record), JSON.stringify(ok.errors)).toBe(true);
      }
    }
  });
});

describe("personal-data coverage (the measure P1.5 decides on)", () => {
  it("counts annotations and V2 semantics, never lists them", () => {
    const c = personalDataCoverage(ir("business-partner.v2.xml"));
    expect(c).toMatchObject({ entityTypesWithSemantics: 1, potentiallyPersonal: 2, potentiallySensitive: 1, withFieldSemantics: 1 });
    expect(c.personalSemantics).toBeGreaterThanOrEqual(6);
    expect(Object.values(c).every((v) => typeof v === "number")).toBe(true);
  });

  it("the corpus job's evaluation compiles, validates both documents per dataset, and reports numbers only", () => {
    const report = evaluateDescription(read("sales-order-rap.v4.xml"));
    expect(report).toMatchObject({ compiled: true, odataVersion: "V4", entitySets: 3, documentsValid: 3, documentsInvalid: 0 });
    expect(JSON.stringify(report)).not.toMatch(/SalesOrder|SoldToParty/);
    expect(evaluateDescription("<html/>")).toMatchObject({ compiled: false, refusal: "NOT_EDMX" });
  });
});
