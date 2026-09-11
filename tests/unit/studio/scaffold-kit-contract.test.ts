/**
 * The starter kit, checked against the two findings a developer raised after
 * downloading one and taking it home:
 *
 *  R7 — the fixture file carried a real tenant's master data, the README called
 *       it "responses recorded from real runs", and nothing stopped it going
 *       into the developer's repository on the first commit.
 *
 *  R8 — the generated contract said less than the broker sends (no `empty`,
 *       `note` or `interface`; no 400, no 404, no DRAFT header) and, on a
 *       captured schema, more than it knew (every field required from a
 *       five-row sample; `nullable` in a 3.1 document).
 */

import { describe, expect, it } from "vitest";

import {
  buildGitignore,
  buildMockServer,
  buildOpenApi,
  buildReadme,
  buildScaffold,
  buildTypeScriptClient,
  type ScaffoldFixture,
  type ScaffoldInterface,
} from "@/lib/studio/scaffold";

const IFACE: ScaffoldInterface = {
  id: "if_po",
  name: "Purchase Order",
  externalId: "CE_PURCHASEORDER_0001",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "PurchaseOrder",
  version: 3,
  solutionName: "QA-E2E-Main",
};

const DATA_FIXTURE: ScaffoldFixture = {
  scenario: "data",
  status: 200,
  sourceStatus: 200,
  capturedAt: "2026-09-10T13:44:11.081Z",
  body: { records: [{ Supplier: "0000100214" }], count: 1, empty: false, note: "1 record." },
};
const EMPTY_FIXTURE: ScaffoldFixture = {
  scenario: "empty",
  status: 200,
  sourceStatus: 200,
  capturedAt: "2026-09-10T13:44:11.081Z",
  body: { records: [], count: 0, empty: true, note: "No records." },
};

function fixturesJson(fixtures: ScaffoldFixture[]) {
  const file = buildScaffold(IFACE, undefined, fixtures).find((f) => f.path === "fixtures.json")!;
  return JSON.parse(file.contents) as { warning: string; note: string };
}

describe("R7 — customer data does not reach a repository by default", () => {
  it("ships a .gitignore that excludes the token and the fixture file", () => {
    const ignore = buildGitignore();
    expect(ignore.split("\n")).toContain(".env");
    expect(ignore.split("\n")).toContain("fixtures.json");
    expect(ignore).toMatch(/live customer/i);
    expect(ignore).toMatch(/never redacted/);
  });

  it("the README names the fixture file as customer data and says what to do", () => {
    const readme = buildReadme(IFACE, [DATA_FIXTURE]);
    expect(readme).toMatch(/## The fixture file holds your customer's data/);
    expect(readme).toMatch(/truncated to a sample, never redacted/);
    expect(readme).toMatch(/listed in `\.gitignore`/);
    // The file table lists it, so a reader who only skims the table sees it.
    expect(readme).toMatch(/\| `\.gitignore` \|/);
  });

  it("fixtures.json opens with a warning when a data fixture is inside", () => {
    const out = fixturesJson([DATA_FIXTURE, EMPTY_FIXTURE]);
    expect(out.warning).toMatch(/^CUSTOMER DATA\./);
    expect(out.warning).toMatch(/live records read from a real tenant/);
    // First key, so it is the first line anyone opening the file reads.
    const raw = buildScaffold(IFACE, undefined, [DATA_FIXTURE]).find((f) => f.path === "fixtures.json")!.contents;
    expect(raw.indexOf('"warning"')).toBeLessThan(raw.indexOf('"note"'));
  });

  it("…and says so when it carries no records, rather than crying wolf", () => {
    const out = fixturesJson([EMPTY_FIXTURE]);
    expect(out.warning).toMatch(/carries no tenant records/);
    expect(out.warning).not.toMatch(/^CUSTOMER DATA/);
  });
});

describe("R8 — the contract says exactly what the broker sends", () => {
  const doc = JSON.parse(buildOpenApi(IFACE)) as {
    paths: Record<string, { get: { responses: Record<string, { headers?: Record<string, unknown>; content?: unknown }> } }>;
  };
  const get = doc.paths["/interfaces/if_po/data"]!.get;
  const ok = get.responses["200"]!;

  it("the 200 body names records, count, empty, note and interface — all required", () => {
    const data = (ok.content as { "application/json": { schema: { properties: { data: { required: string[]; properties: Record<string, unknown> } } } } })[
      "application/json"
    ].schema.properties.data;
    expect(data.required.sort()).toEqual(["count", "empty", "interface", "note", "records"]);
    expect(Object.keys(data.properties).sort()).toEqual(["count", "empty", "interface", "note", "records"]);
  });

  it("documents the DRAFT header and the correlation id on the 200", () => {
    expect(ok.headers).toHaveProperty("x-coreedge-interface-status");
    expect(ok.headers).toHaveProperty("x-correlation-id");
    expect(JSON.stringify(ok.headers!["x-coreedge-interface-status"])).toContain("DRAFT");
  });

  it("documents 400 and 404 beside the states it already documented", () => {
    expect(Object.keys(get.responses).sort()).toEqual(["200", "400", "401", "403", "404", "429", "5XX"]);
    expect(JSON.stringify(get.responses["400"])).toMatch(/no entity set/);
    expect(JSON.stringify(get.responses["404"])).toMatch(/does not belong to the solution|No interface with this id/);
  });

  it("the TypeScript ReadResult carries the same fields, plus the draft flag from the header", () => {
    const src = buildTypeScriptClient(IFACE);
    const block = src.slice(src.indexOf("export interface ReadResult"), src.indexOf("export interface CoreEdgeClientOptions"));
    for (const field of ["records:", "count: number;", "empty: boolean;", "note: string;", "interface: {", "draft: boolean;"]) {
      expect(block, field).toContain(field);
    }
    expect(src).toContain('res.headers.get("x-coreedge-interface-status") === "DRAFT"');
    // A 2xx with no envelope is an error, not an empty result.
    expect(src).toContain('"MALFORMED_RESPONSE"');
    expect(src).not.toContain("json.data ?? { records: [] }");
  });

  it("the mock serves the same envelope, `interface` included", () => {
    const mock = buildMockServer(IFACE);
    expect(mock).toContain('const INTERFACE = {"id":"if_po","name":"Purchase Order","version":3};');
    // `applyLimit` truncates to ?limit= and leaves a short body untouched, so
    // the envelope is the broker's either way.
    expect(mock).toContain("{ data: { interface: INTERFACE, ...applyLimit(fixture.body,");
  });
});
