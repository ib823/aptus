// @vitest-environment node
/**
 * The starter kit and queries (P1.4, 3.16).
 *
 *   - The kit's mock serves recorded rows and evaluates no query, so a
 *     request carrying a reserved name is REFUSED (400 VALIDATION_ERROR,
 *     error.query.rule NOT_ENABLED), never served with the name ignored;
 *     ?limit and ?scenario are as they were. Run as the developer runs it:
 *     `node mock.mjs`, over HTTP.
 *   - The kit's client gains query() and pages(): the parameters as the
 *     route reads them (a list of values repeats its name), the next page
 *     by its cursor with the same parameters, and a refusal's rule on the
 *     error. Run as the developer runs it: transpiled and imported.
 *   - The kit's OpenAPI lists the policy's parameters when it has one.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildOpenApi, buildScaffold, buildTypeScriptClient, type ScaffoldInterface } from "@/lib/studio/scaffold";

import { basisOf, compiled, source } from "../../helpers/odata-query";

const IFACE: ScaffoldInterface = {
  id: "if_q",
  name: "Order lines",
  externalId: "custom:/sap/opu/odata/sap/ZPAGING_ORDERS_SRV",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "OrderLines",
  version: 2,
  solutionName: "Portal",
};

const dir = mkdtempSync(join(tmpdir(), "coreedge-kit-query-"));
let mock: ChildProcess | null = null;
let base = "";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      s.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

beforeAll(async () => {
  // The kit's own mock and fixtures, as it ships them.
  const kit = buildScaffold(IFACE, undefined, [
    { scenario: "data", status: 200, body: { records: [{ Order: "O1" }, { Order: "O2" }], count: 2, empty: false, note: "2 records." }, sourceStatus: 200 },
  ]);
  for (const name of ["mock.mjs", "fixtures.json"]) writeFileSync(join(dir, name), kit.find((f) => f.path === name)!.contents, "utf8");
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  mock = spawn(process.execPath, [join(dir, "mock.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the mock did not start")), 10_000);
    mock!.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("CoreEdge mock on")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
});

afterAll(() => {
  mock?.kill();
  rmSync(dir, { recursive: true, force: true });
});

async function mockGet(qs: string) {
  const res = await fetch(`${base}/interfaces/if_q/data${qs}`, { headers: { authorization: "Bearer x" } });
  return { status: res.status, body: (await res.json()) as { data?: { records: unknown[] }; error?: { code: string; message: string; query?: { rule: string } } } };
}

describe("the kit's mock refuses queries, never ignores them", () => {
  it.each(["?filter.Customer.eq=C1", "?select=Order", "?key.Order=O1", "?pageSize=5", "?cursor=cec1.t1.x", "?expand=to_Item", "?filter=x"])("%s is 400 NOT_ENABLED", async (qs) => {
    const r = await mockGet(qs);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: "VALIDATION_ERROR", query: { rule: "NOT_ENABLED" } });
    expect(r.body.error!.message).toContain("does not evaluate queries");
  });

  it("serves ?limit and ?scenario as before", async () => {
    const r = await mockGet("?limit=1&scenario=data");
    expect(r.status).toBe(200);
    expect(r.body.data!.records).toEqual([{ Order: "O1" }]);
  });
});

describe("the kit's client: query() and pages()", () => {
  type Client = {
    query(params: Record<string, unknown>, cursor?: string): Promise<{ records: unknown[]; page?: { nextCursor: string | null } }>;
    pages(params: Record<string, unknown>): AsyncGenerator<{ records: unknown[] }>;
  };
  let createClient: (o: { baseUrl: string; token: string; fetchImpl: typeof fetch }) => Client;
  let QueryError: new (...a: unknown[]) => Error & { rule: string | null; code: string; status: number };

  beforeAll(async () => {
    const js = ts.transpileModule(buildTypeScriptClient(IFACE, "https://coreedge.example/api/northbound"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const file = join(dir, "client.mjs");
    writeFileSync(file, js, "utf8");
    const mod = (await import(pathToFileURL(file).href)) as { createClient: typeof createClient; CoreEdgeQueryError: typeof QueryError };
    createClient = mod.createClient;
    QueryError = mod.CoreEdgeQueryError;
  });

  it("sends the parameters as the route reads them, and pages by cursor with the same ones", async () => {
    const urls: string[] = [];
    const pages = [
      { records: [{ Order: "O1" }], count: 1, empty: false, note: "", interface: { id: "if_q", name: "x", version: 2 }, page: { index: 0, size: 1, rowsServed: 1, nextCursor: "cec1.t1.AAA", complete: false, stopped: null } },
      { records: [{ Order: "O2" }], count: 1, empty: false, note: "", interface: { id: "if_q", name: "x", version: 2 }, page: { index: 1, size: 1, rowsServed: 2, nextCursor: null, complete: true, stopped: null } },
    ];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ data: pages[urls.length - 1] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createClient({ baseUrl: "https://coreedge.example/api/northbound", token: "t", fetchImpl });
    const seen: unknown[] = [];
    for await (const page of client.pages({ "filter.Status.in": ["A", "B"], "filter.Note.eq": "O'Neil & Co+", pageSize: 1 })) seen.push(...page.records);
    expect(seen).toEqual([{ Order: "O1" }, { Order: "O2" }]);
    expect(urls).toEqual([
      "https://coreedge.example/api/northbound/interfaces/if_q/data?filter.Status.in=A&filter.Status.in=B&filter.Note.eq=O%27Neil+%26+Co%2B&pageSize=1",
      "https://coreedge.example/api/northbound/interfaces/if_q/data?filter.Status.in=A&filter.Status.in=B&filter.Note.eq=O%27Neil+%26+Co%2B&pageSize=1&cursor=cec1.t1.AAA",
    ]);
    // What the server reads back is what was meant: a + survives as itself.
    expect(new URL(urls[0]!).searchParams.get("filter.Note.eq")).toBe("O'Neil & Co+");
  });

  it("throws a refusal with its rule", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: "POLICY_FIELD_NOT_GRANTED", message: "no", correlationId: "c1", query: { rule: "FIELD_NOT_FILTERABLE" } } }), {
        status: 400,
      })) as unknown as typeof fetch;
    const client = createClient({ baseUrl: "https://coreedge.example/api/northbound", token: "t", fetchImpl });
    const err = await client.query({ "filter.NetAmount.gt": 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QueryError);
    expect(err).toMatchObject({ status: 400, code: "POLICY_FIELD_NOT_GRANTED", rule: "FIELD_NOT_FILTERABLE", correlationId: "c1" });
  });
});

describe("the kit's OpenAPI follows the policy", () => {
  it("lists the policy's parameters with one, and ?limit alone without", () => {
    const policy = compiled(basisOf([{ n: "Order" }, { n: "Line", t: "I32" }], ["Order", "Line"], { entitySet: "OrderLines" }), source({ filter: [{ field: "Order", ops: ["eq"] }], sort: ["Order", "Line"] }));
    const names = (doc: string) =>
      ((((JSON.parse(doc) as { paths: Record<string, { get: { parameters: { name?: string }[] } }> }).paths["/interfaces/if_q/data"]!.get.parameters) ?? []).map((p) => p.name).filter(Boolean));
    expect(names(buildOpenApi({ ...IFACE, queryPolicy: policy }))).toEqual(["select", "filter.Order.eq", "orderby", "key.Order", "key.Line", "pageSize", "cursor"]);
    expect(names(buildOpenApi(IFACE))).toEqual([]);
  });
});
