// @vitest-environment node
/**
 * Tier 2's verdicts (P1.4, 3.21 item 7), run against the in-repo OData stub
 * standing in for the Hub sandbox: a service that behaves as tier 1 says gets
 * verdicts that all agree, on V2 and V4; one that ignores $skip, or refuses a
 * doubled quote, gets the verdict that says so. Nothing SAP returns appears
 * in a verdict.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runTarget, type LiveTarget } from "../../../scripts/lib/odata-conformance-live";
import { odataStub, type StubRow } from "../../helpers/odata-sap-stub";

const ORIGIN = "https://sandbox.example.invalid";
const BASE = `${ORIGIN}/s4hanacloud`;
const FIXTURES = path.resolve(__dirname, "../../fixtures/odata");
const XML = { V2: readFileSync(path.join(FIXTURES, "paging-orders.v2.xml"), "utf8"), V4: readFileSync(path.join(FIXTURES, "paging-orders.v4.xml"), "utf8") };
const PATHS = { V2: "/s4hanacloud/sap/opu/odata/sap/ZPAGING_ORDERS_SRV", V4: "/s4hanacloud/sap/opu/odata4/sap/zpaging_orders/srvd_a2x/sap/zpaging_orders/0001" };
const TYPES = { Order: "S", Line: "I", Customer: "S", CompanyCode: "S", Status: "S", NetAmount: "D", CreatedOn: "DATE", Note: "S" } as const;
const ROWS: StubRow[] = Array.from({ length: 20 }, (_, i) => ({
  Order: `O${String(Math.floor(i / 2) + 1).padStart(3, "0")}`,
  Line: (i % 2) + 1,
  Customer: "SECRET-CUSTOMER-VALUE",
  CompanyCode: "1010",
  Status: "A",
  NetAmount: "1.00",
  CreatedOn: "2026-01-01",
  Note: "SECRET-NOTE-VALUE",
}));

function sandbox(version: "V2" | "V4", opts: { ignoreSkip?: boolean; refuseQuote?: boolean } = {}) {
  const stub = odataStub({
    odata: version,
    origin: ORIGIN,
    servicePath: PATHS[version],
    entitySet: "OrderLines",
    keys: ["Order", "Line"],
    types: TYPES,
    rows: () => ROWS,
    failWhen: (u) => (opts.refuseQuote && (u.searchParams.get("$filter") ?? "").includes("''") ? 400 : null),
  });
  const keys: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    keys.push(new Headers(init?.headers).get("APIKey") ?? "");
    if (href.endsWith("/$metadata")) return new Response(XML[version], { status: 200, headers: { "content-type": "application/xml" } });
    // A service that ignores $skip answers every page from the start.
    const url = new URL(href);
    if (opts.ignoreSkip) url.searchParams.delete("$skip");
    return stub.fetch(opts.ignoreSkip ? url.href.replace(/'/g, "%27") : href, init);
  }) as typeof fetch;
  return { fetchImpl, keys };
}

const target = (version: "V2" | "V4"): LiveTarget => ({ name: `ZPAGING_${version}`, odata: version, servicePath: PATHS[version].replace("/s4hanacloud", ""), entitySet: "OrderLines" });

describe("tier 2 against a service that behaves as tier 1 says", () => {
  it.each(["V2", "V4"] as const)("%s: every case agrees, and the API key goes on every request", async (version) => {
    const { fetchImpl, keys } = sandbox(version);
    const verdicts = await runTarget(target(version), { fetch: fetchImpl, baseUrl: BASE, headers: { APIKey: "k-123" } });
    expect(verdicts.map((v) => v.case)).toEqual(["C-INLINE", "P-SKIP-TOP-PEEK", "S-SELECT", "L-STRING-QUOTE"]);
    for (const v of verdicts) expect(v, v.case).toMatchObject({ agrees: true, status: 200 });
    expect(verdicts[0]!.countType).toBe(version === "V2" ? "string" : "number");
    expect(keys.every((k) => k === "k-123")).toBe(true);
    // Verdicts only: no value SAP returned.
    expect(JSON.stringify(verdicts)).not.toMatch(/SECRET|O00\d/);
  });
});

describe("tier 2 says where a service differs", () => {
  it("a service that ignores $skip repeats the first page: P-SKIP-TOP-PEEK differs", async () => {
    const { fetchImpl } = sandbox("V2", { ignoreSkip: true });
    const verdicts = await runTarget(target("V2"), { fetch: fetchImpl, baseUrl: BASE, headers: {} });
    expect(verdicts.find((v) => v.case === "P-SKIP-TOP-PEEK")).toMatchObject({ agrees: false, noRowRepeated: false });
  });

  it("a service that refuses a doubled quote: L-STRING-QUOTE differs", async () => {
    const { fetchImpl } = sandbox("V4", { refuseQuote: true });
    const verdicts = await runTarget(target("V4"), { fetch: fetchImpl, baseUrl: BASE, headers: {} });
    expect(verdicts.find((v) => v.case === "L-STRING-QUOTE")).toMatchObject({ agrees: false, status: 400, quoteHonoured: false });
  });
});
