// @vitest-environment node
/**
 * The Contract Compiler's golden set (P1.3).
 *
 * Six service descriptions written for this repository — shaped like
 * API_BUSINESS_PARTNER (V2), a RAP sales-order service (V4), a SuccessFactors
 * dataset (V2), and three customer-built services: a Z* SEGW service (V2), a
 * YY1_* key-user CDS view (V2) and a Z* RAP service (V4, in XML and in CSDL
 * JSON). SAP's own $metadata is not bundled (roadmap §9.1 #17); the corpus job
 * runs over that (scripts/contract-corpus.ts).
 *
 * For each, four goldens under tests/fixtures/contracts/golden/<name>/:
 *   ir.json           the whole Contract IR (canonical key order)
 *   schemas.json      the dataset's JSON Schemas, 2020-12 and OpenAPI 3.0
 *   openapi-3.1.json  a solution document with a read and a create interface
 *   openapi-3.0.json  the same, in 3.0.3
 * and both documents must validate against their specification. Update the
 * goldens deliberately with `pnpm vitest run tests/unit/contracts -u` and read
 * the diff: it IS the contract change.
 */

import { readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { buildContractSchemas, standaloneSchemas } from "@/lib/contracts/json-schema";
import { toTypeName } from "@/lib/contracts/names";
import { buildNorthboundOpenApi, type OpenApiVersion } from "@/lib/contracts/openapi";
import { sliceForEntitySet } from "@/lib/contracts/slice";

import { validateOpenApi30, validateOpenApi31 } from "../../helpers/openapi-validate";

const EDMX = path.resolve(__dirname, "../../fixtures/contracts/edmx");
const GOLDEN = "../../fixtures/contracts/golden";

const CASES = [
  { file: "business-partner.v2.xml", entitySet: "A_Partner", version: "V2" },
  { file: "sales-order-rap.v4.xml", entitySet: "SalesOrder", version: "V4" },
  { file: "successfactors-style.v2.xml", entitySet: "cust_TravelRequest", version: "V2" },
  { file: "z-travel-booking.v2.xml", entitySet: "BookingSet", version: "V2" },
  { file: "yy1-sales-bonus.v2.xml", entitySet: "YY1_SALESBONUS", version: "V2" },
  { file: "z-bonus-plan-rap.v4.xml", entitySet: "BonusPlan", version: "V4" },
] as const;

function compile(file: string) {
  const r = compileContract(readFileSync(path.join(EDMX, file), "utf8"));
  if (!r.ok) throw new Error(`${file}: ${r.reason} ${r.detail}`);
  return r.ir;
}

const pretty = (v: unknown) => `${JSON.stringify(JSON.parse(canonicalJson(v)), null, 2)}\n`;

function solutionDoc(file: string, entitySet: string, version: OpenApiVersion) {
  const slice = sliceForEntitySet(compile(file), entitySet);
  if (!slice.ok) throw new Error(slice.detail);
  const contract = { source: "metadata" as const, contract: slice.contract, semver: "1.0.0", snapshotId: "snap_golden", contentHash: "0".repeat(64) };
  return buildNorthboundOpenApi({
    version,
    baseUrl: "https://coreedge.example/api/northbound",
    title: "Golden solution — CoreEdge northbound",
    description: "Golden document.",
    infoVersion: "1.0.0",
    discovery: true,
    interfaces: [
      {
        id: "if_read",
        name: `${entitySet} read`,
        externalId: "GOLDEN",
        sapProduct: "s4hana",
        operation: "READ",
        mode: "READ",
        entitySet,
        version: 3,
        status: "ACTIVE",
        contract,
        grants: [
          { operation: "READ", environment: "DEV" },
          { operation: "READ", environment: "TEST" },
        ],
      },
      {
        id: "if_create",
        name: `${entitySet} create`,
        externalId: "GOLDEN",
        sapProduct: "s4hana",
        operation: "CREATE",
        mode: "WRITE",
        entitySet,
        version: 1,
        status: "DRAFT",
        contract,
        grants: [{ operation: "CREATE", environment: "DEV" }],
      },
    ],
  });
}

describe.each(CASES)("$file", ({ file, entitySet, version }) => {
  const base = file.replace(/\.(xml|json)$/, "");

  it("compiles to the golden IR", async () => {
    const ir = compile(file);
    expect(ir.odataVersion).toBe(version);
    await expect(pretty(ir)).toMatchFileSnapshot(`${GOLDEN}/${base}/ir.json`);
  });

  it("slices to the dataset and yields the golden JSON Schemas", async () => {
    const slice = sliceForEntitySet(compile(file), entitySet);
    expect(slice.ok).toBe(true);
    if (!slice.ok) return;
    const stem = toTypeName(entitySet);
    const schemas = {
      "json-schema-2020-12": standaloneSchemas(slice.contract, stem),
      "openapi-3.0": buildContractSchemas(slice.contract, { dialect: "oas30", stem, ref: (n) => `#/components/schemas/${n}` }),
    };
    await expect(pretty(schemas)).toMatchFileSnapshot(`${GOLDEN}/${base}/schemas.json`);
  });

  it("renders the golden OpenAPI 3.1 document, which validates against the 3.1 specification", async () => {
    const doc = solutionDoc(file, entitySet, "3.1.0");
    const v = validateOpenApi31(doc);
    expect(v.errors).toEqual([]);
    // 3.1 says null with a type array; `nullable` is a 3.0 keyword 3.1 tools ignore.
    expect(JSON.stringify(doc)).not.toContain('"nullable"');
    await expect(`${JSON.stringify(doc, null, 2)}\n`).toMatchFileSnapshot(`${GOLDEN}/${base}/openapi-3.1.json`);
  });

  it("renders the golden OpenAPI 3.0.3 document, which validates against the 3.0 specification", async () => {
    const doc = solutionDoc(file, entitySet, "3.0.3");
    const v = validateOpenApi30(doc);
    expect(v.errors).toEqual([]);
    // 3.0 has no type arrays.
    expect(JSON.stringify(doc)).not.toMatch(/"type":\[/);
    await expect(`${JSON.stringify(doc, null, 2)}\n`).toMatchFileSnapshot(`${GOLDEN}/${base}/openapi-3.0.json`);
  });
});

describe("one service in two forms", () => {
  it("CSDL JSON compiles to the same IR as the same service in CSDL XML", () => {
    const xml = compile("z-bonus-plan-rap.v4.xml");
    const json = compile("z-bonus-plan-rap.v4.json");
    expect(canonicalJson(json)).toBe(canonicalJson(xml));
  });
});

describe("what the golden set covers", () => {
  it("at least three customer-built services (Z*, YY1_*), V2 and V4", () => {
    const custom = CASES.filter((c) => /^(z|yy1)-/.test(c.file));
    expect(custom.length).toBeGreaterThanOrEqual(3);
    expect(new Set(custom.map((c) => c.version))).toEqual(new Set(["V2", "V4"]));
  });
});
