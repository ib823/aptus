// @vitest-environment node
/**
 * The per-interface OpenAPI describes the query surface's real answers
 * (P1.4, 3.16 and 3.21 item 9), on PostgreSQL.
 *
 * The document is built from the interface rows as the solution document
 * route reads them (the compiled policy included), and validated against
 * the OpenAPI 3.1 and 3.0 specifications. Then the real data route answers a
 * list page, a key lookup, a key SAP does not have, a filter the policy does
 * not allow, a query SAP refuses and a cursor whose policy changed: every
 * parameter sent is one the document lists, every status is documented for
 * the operation, and every body validates against the documented schema.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { buildNorthboundOpenApi } from "@/lib/contracts/openapi";
import { prisma } from "@/lib/db/prisma";

import { source } from "../helpers/odata-query";
import { odataStub, type StubRow } from "../helpers/odata-sap-stub";
import { validateOpenApi30, validateOpenApi31 } from "../helpers/openapi-validate";
import {
  CANARY_ORIGIN,
  ENTITY_SET,
  enableQueries,
  ORDER_LINE_TYPES,
  removeQueryWorld,
  seedQueryApp,
  seedQueryWorld,
  SERVICE_PATH,
  type QueryApp,
  type QueryWorld,
} from "../helpers/query-world";

type Obj = Record<string, unknown>;

const RUN = `p14o-${randomUUID().slice(0, 8)}`;
const ROWS: StubRow[] = Array.from({ length: 12 }, (_, i) => ({
  Order: `O${String(Math.floor(i / 2) + 1).padStart(4, "0")}`,
  Line: (i % 2) + 1,
  Customer: `C${(i % 3) + 1}`,
  CompanyCode: "1010",
  Status: "AB"[i % 2]!,
  NetAmount: (5 + i).toFixed(2),
  CreatedOn: `2026-03-${String(i + 1).padStart(2, "0")}`,
  Note: `note ${i}`,
}));
const POLICY = source({
  filter: [
    { field: "Order", ops: ["eq", "in"] },
    { field: "Customer", ops: ["eq", "in"] },
    { field: "CreatedOn", ops: ["ge", "lt"] },
  ],
  sort: ["Order", "Line", "CreatedOn"],
  count: true,
});
const stub = odataStub({
  odata: "V2",
  origin: CANARY_ORIGIN,
  servicePath: SERVICE_PATH.V2,
  entitySet: ENTITY_SET,
  keys: ["Order", "Line"],
  types: ORDER_LINE_TYPES,
  rows: () => ROWS,
  failWhen: (u) => (u.searchParams.get("$filter")?.includes("'REJECT'") ? 400 : null),
});

let world: QueryWorld;
let app: QueryApp;
let doc: Obj;
let ajv: Ajv2020;

async function buildDoc(version: "3.1.0" | "3.0.3"): Promise<Obj> {
  const ifaces = await prisma.interface.findMany({
    where: { organizationId: world.organizationId, solutionId: app.solutionId },
    select: { id: true, name: true, externalId: true, sapProduct: true, operation: true, mode: true, entitySet: true, version: true, status: true, queryPolicyCompiled: true },
  });
  return buildNorthboundOpenApi({
    version,
    baseUrl: "http://localhost/api/northbound",
    title: "query conformance",
    description: "query conformance",
    infoVersion: "1.0.0",
    interfaces: ifaces.map(({ queryPolicyCompiled, ...i }) => ({ ...i, contract: { source: "none" as const }, queryPolicy: queryPolicyCompiled })),
    discovery: true,
  });
}

async function get(qs: string) {
  const id = app.iface.V2;
  const res = await readRoute(new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data?${qs}`, { headers: { authorization: `Bearer ${app.token}` } }), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status, json: (await res.json()) as Obj };
}

function deref(node: Obj): Obj {
  const ref = node.$ref as string | undefined;
  if (!ref) return node;
  let cur: unknown = doc;
  for (const p of ref.replace(/^#\//, "").split("/")) cur = (cur as Obj)[p];
  return cur as Obj;
}

const operation = () => ((doc.paths as Obj)[`/interfaces/${app.iface.V2}/data`] as Obj).get as Obj;

/** Why an answer, or a parameter sent, is not the documented one; empty when they are. */
function problems(qs: string, status: number, body: unknown): string[] {
  const out: string[] = [];
  const documented = new Set((operation().parameters as Obj[]).map((p) => deref(p).name as string));
  for (const name of new URLSearchParams(qs).keys()) if (!documented.has(name)) out.push(`${name} is not a documented parameter`);
  const responses = operation().responses as Obj;
  const entry = (responses[String(status)] ?? responses[`${String(status)[0]}XX`]) as Obj | undefined;
  if (!entry) return [...out, `${status} is not documented`];
  const schema = (((deref(entry).content as Obj)["application/json"] as Obj).schema as Obj).$ref as string;
  const validate = ajv.getSchema(`doc#/components/schemas/${schema.split("/").pop()}`)!;
  if (!validate(body)) out.push(...(validate.errors ?? []).map((e) => `${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`));
  return out;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("the per-interface OpenAPI describes the query surface's answers (P1.4)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return href.includes(SERVICE_PATH.V2) ? stub.fetch(input, init) : real(input, init);
    });
    world = await seedQueryWorld(RUN);
    app = await seedQueryApp(world, "Documented");
    expect(await enableQueries(world, app.iface.V2, "V2", POLICY)).toBe("READY");
    doc = await buildDoc("3.1.0");
    ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    ajv.addSchema({ ...doc, $id: "doc" });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (world) await removeQueryWorld(world);
  });

  it("the document, with this interface's query parameters, validates against both specifications", async () => {
    expect(validateOpenApi31(doc).errors).toEqual([]);
    expect(validateOpenApi30(await buildDoc("3.0.3")).errors).toEqual([]);
    const names = (operation().parameters as Obj[]).map((p) => deref(p).name);
    expect(names).toEqual(expect.arrayContaining(["select", "filter.Customer.in", "filter.CreatedOn.ge", "orderby", "key.Order", "key.Line", "count", "pageSize", "cursor"]));
    // The V4 interface of the same app has no policy: ?limit only.
    const v4 = ((doc.paths as Obj)[`/interfaces/${app.iface.V4}/data`] as Obj).get as Obj;
    expect((v4.parameters as Obj[]).every((p) => "$ref" in p)).toBe(true);
  });

  it("a list page, a key lookup and a key SAP does not have answer as documented", async () => {
    for (const qs of ["select=Order,Line,Customer&filter.Customer.in=C1&filter.Customer.in=C2&orderby=-CreatedOn&count=true&pageSize=3", "key.Order=O0002&key.Line=1", "key.Order=O9999&key.Line=1"]) {
      const r = await get(qs);
      expect(r.status, qs).toBe(qs.startsWith("key.Order=O9999") ? 404 : 200);
      expect(problems(qs, r.status, r.json), qs).toEqual([]);
    }
  });

  it("a refusal by the policy, a query SAP refuses, and a cursor whose policy changed answer as documented", async () => {
    const refused = await get("filter.NetAmount.gt=1");
    expect(refused.status).toBe(400);
    expect((refused.json.error as Obj).query).toMatchObject({ rule: "FIELD_NOT_FILTERABLE" });
    // Not a documented parameter, as the refusal says.
    expect(problems("", refused.status, refused.json)).toEqual([]);

    const rejected = await get("filter.Customer.eq=REJECT");
    expect(rejected.status).toBe(422);
    expect(problems("filter.Customer.eq=REJECT", rejected.status, rejected.json)).toEqual([]);

    const first = await get("pageSize=2");
    const cursor = ((first.json.data as Obj).page as Obj).nextCursor as string;
    expect(await enableQueries(world, app.iface.V2, "V2", { ...POLICY, sort: ["Order", "Line"] })).toBe("READY");
    const stale = await get(`pageSize=2&cursor=${cursor}`);
    expect(stale.status).toBe(409);
    expect(problems(`pageSize=2&cursor=${cursor}`, stale.status, stale.json)).toEqual([]);
  });
});
