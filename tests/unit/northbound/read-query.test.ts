// @vitest-environment node
/**
 * The query surface's executor (P1.4, 3.8.1 and 3.8.2): readQuery sends the
 * URL compiled from the checked AST through the same bounded GET as the
 * legacy read, and reads SAP's answer by the kind of query that was sent.
 *
 *   - a redirect is never followed (D24): fetch is asked for "manual", and a
 *     3xx is ERROR, so nothing SAP says can send the credentials elsewhere;
 *   - V4 asks for OData-MaxVersion 4.0, which keeps control information
 *     under the `odata.` prefix the stripper knows;
 *   - SAP's refusal of a query, a missing record and an oversized page are
 *     outcomes of their own, and SAP's text is never in the detail.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { circuitOutcomeForQuery } from "@/lib/governed/pipeline";
import { MAX_READ_BODY_BYTES, readQuery } from "@/lib/northbound/read";
import { buildQueryUrl, compileQuery, type SapQuery } from "@/lib/odata/operation-compiler";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";

import { basisOf, prepared, source } from "../../helpers/odata-query";

const BASE = "https://sap-host-canary.example.invalid:44300";
const SERVICE = "/sap/opu/odata/sap/ZORDERS_SRV";

const conn = (): ResolvedSapConnection => ({
  source: "db",
  id: "conn_1",
  organizationId: "org_a",
  product: "s4hana",
  key: "dev",
  label: "DEV",
  baseUrl: BASE,
  authType: "basic",
  secrets: { username: "COMM_USER", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: false,
  apiPath: SERVICE,
  timeoutMs: null,
  environment: "DEV",
  client: "100",
});

const auth = async () => ({ Authorization: "Basic Q09NTV9VU0VSOnA=" });

function built(odata: "V2" | "V4", kind: "LIST" | "KEY") {
  const policy = prepared(
    basisOf([{ n: "Order" }, { n: "Amount", t: "D", edm: "Edm.Decimal" }], ["Order"], { odata }),
    source({ filter: [{ field: "Order", ops: ["eq", "in"] }], sort: ["Order"], count: true }),
  );
  const ast =
    kind === "LIST"
      ? ({ v: 1, kind: "LIST", select: null, filter: [], orderby: [], key: null, count: true, pageSize: 2 } as const)
      : ({ v: 1, kind: "KEY", select: null, filter: [], orderby: [], key: [{ f: "Order", v: { t: "S", v: "1" } }], count: false, pageSize: null } as const);
  const query = compileQuery(ast, policy, kind === "LIST" ? { skip: 0, top: 3, page0: true } : { skip: 0, top: null, page0: true });
  const b = buildQueryUrl(query, { baseUrl: BASE, servicePath: SERVICE, entitySet: "Orders", client: "100" });
  if (!b.ok) throw new Error("not built");
  return { url: b.url, query: b.query as SapQuery };
}

const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function run(odata: "V2" | "V4", kind: "LIST" | "KEY", response: Response | (() => Promise<Response>)) {
  const f = vi.fn(typeof response === "function" ? response : async () => response);
  const r = await readQuery({ connection: conn(), built: built(odata, kind), countAsked: kind === "LIST" }, f as unknown as typeof fetch, auth);
  return { r, f };
}

describe("what readQuery sends", () => {
  it("the built URL as it is, with redirects refused and the credential step's headers", async () => {
    const { f } = await run("V2", "LIST", answer({ d: { results: [] } }));
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(built("V2", "LIST").url);
    expect(init.redirect).toBe("manual");
    expect(init.headers).toEqual({ Authorization: "Basic Q09NTV9VU0VSOnA=", Accept: "application/json" });
  });

  it("OData-MaxVersion 4.0 on V4 only", async () => {
    const { f } = await run("V4", "LIST", answer({ value: [] }));
    const [, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(init.headers).toEqual({
      Authorization: "Basic Q09NTV9VU0VSOnA=",
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
    });
  });
});

describe("what readQuery makes of SAP's answer", () => {
  it("a V2 list: rows, the count as SAP gave it, the next link as a yes, and no host anywhere", async () => {
    const { r } = await run(
      "V2",
      "LIST",
      answer({
        d: {
          __count: "7",
          __next: `${BASE}${SERVICE}/Orders?$skiptoken=3`,
          results: [{ __metadata: { uri: `${BASE}${SERVICE}/Orders('1')` }, Order: "1", Amount: "2.50" }],
        },
      }),
    );
    expect(r.status).toBe("OK");
    expect(r.answer?.rows.map((x) => ({ ...x.record }))).toEqual([{ Order: "1", Amount: "2.50" }]);
    expect(r.answer).toMatchObject({ more: true, totalCount: 7 });
    expect(JSON.stringify(r)).not.toContain("canary");
  });

  it("an empty list is EMPTY, a successful read", async () => {
    const { r } = await run("V4", "LIST", answer({ value: [] }));
    expect(r.status).toBe("EMPTY");
    expect(circuitOutcomeForQuery(r)).toBe("ok");
  });

  it("a V4 key: the entity itself, a property named value included", async () => {
    const { r } = await run("V4", "KEY", answer({ "@odata.context": `${BASE}/$metadata#Orders/$entity`, "@id": `${BASE}/Orders('1')`, Order: "1", Amount: 2.5 }));
    expect(r.status).toBe("OK");
    expect(r.answer?.rows).toHaveLength(1);
    expect({ ...r.answer!.rows[0]!.record }).toEqual({ Order: "1", Amount: 2.5 });
  });

  it("a key SAP answers 404 is NO_RECORD; a list it answers 404 names a dataset SAP does not have", async () => {
    expect((await run("V2", "KEY", answer("Not found", 404))).r).toMatchObject({ status: "NO_RECORD", failureReason: "HTTP_404" });
    expect((await run("V2", "LIST", answer("Not found", 404))).r.status).toBe("NOT_FOUND");
  });

  it.each([400, 405, 406, 412, 422, 501])("SAP refusing the query (%i) is SAP_REJECTED, without SAP's text, and not a circuit failure", async (status) => {
    const { r } = await run("V2", "LIST", answer({ error: { message: { value: `Invalid filter near 'secret-${status}'` } } }, status));
    expect(r).toMatchObject({ status: "SAP_REJECTED", httpStatus: status, failureReason: `HTTP_${status}`, answer: null });
    expect(r.detail).toContain(`HTTP ${status}`);
    expect(r.detail).not.toContain("secret");
    expect(circuitOutcomeForQuery(r)).toBe("refused");
  });

  it("a 401 and a 403 are NEEDS_SETUP, as on the legacy read", async () => {
    expect((await run("V2", "LIST", answer("", 401))).r.status).toBe("NEEDS_SETUP");
    expect((await run("V2", "LIST", answer("", 403))).r.status).toBe("NEEDS_SETUP");
  });

  it("a redirect is ERROR and is never followed", async () => {
    const { r, f } = await run("V2", "LIST", answer("", 302, { location: "https://elsewhere.example/steal" }));
    expect(r).toMatchObject({ status: "ERROR", httpStatus: 302, failureReason: "HTTP_302" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(circuitOutcomeForQuery(r)).toBe("refused");
  });

  it("a gateway's 502, 503 and 504 count against the system; a short dump's 500 does not", async () => {
    for (const status of [502, 503, 504]) expect(circuitOutcomeForQuery((await run("V2", "LIST", answer("", status))).r)).toBe("upstream-error");
    expect(circuitOutcomeForQuery((await run("V2", "LIST", answer("", 500))).r)).toBe("refused");
  });

  it("a body of the wrong shape is ERROR INVALID_UPSTREAM_BODY", async () => {
    const { r } = await run("V2", "LIST", answer({ value: [] }));
    expect(r).toMatchObject({ status: "ERROR", failureReason: "INVALID_UPSTREAM_BODY", answer: null });
  });

  it("a body nested too deep to read is ERROR, as on the legacy read, and is not thrown", async () => {
    const depth = 20_000;
    const { r } = await run("V2", "LIST", answer(`{"d":{"results":[{"Order":"1","Amount":${"[".repeat(depth)}${"]".repeat(depth)}}]}}`));
    expect(r).toMatchObject({ status: "ERROR", httpStatus: null, answer: null, detail: "The read could not be completed.", failureReason: "FETCH_FAILED" });
    expect(circuitOutcomeForQuery(r)).toBe("upstream-error");
  });

  it("a page past the 16 MiB bound is TOO_LARGE, which the caller can change", async () => {
    const huge = `{"d":{"results":[{"Order":"${"x".repeat(MAX_READ_BODY_BYTES)}"}]}}`;
    const { r } = await run("V2", "LIST", answer(huge));
    expect(r).toMatchObject({ status: "TOO_LARGE", failureReason: "INVALID_UPSTREAM_BODY", answer: null });
    expect(circuitOutcomeForQuery(r)).toBe("refused");
  });

  it("no answer at all counts against the system, and says nothing of the host", async () => {
    const { r } = await run("V2", "LIST", async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED", message: `connect ECONNREFUSED ${BASE}` } });
    });
    expect(r).toMatchObject({ status: "ERROR", httpStatus: null });
    expect(r.detail).not.toContain("canary");
    expect(circuitOutcomeForQuery(r)).toBe("upstream-error");
  });
});
