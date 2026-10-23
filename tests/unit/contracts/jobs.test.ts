// @vitest-environment node
/**
 * THE CONTRACT COMPILER'S JOBS (P1.3, lib/contracts/jobs.ts): what each
 * makes of tenant-supplied bytes, and that what the read paths serve is
 * byte for byte what they served before /schema stopped rendering.
 *
 *   byte identity  GET /schema spliced from the texts the record stored is
 *                  f54c6f5a's rendered /schema (tests/helpers/schema-reference.ts),
 *                  with and without a current stamp; the starter kit and the
 *                  solution document of every golden dataset are f54c6f5a's
 *                  bytes (their sha-256, tests/fixtures/contracts/golden/
 *                  read-paths.f54c6f5a.json) but for the one deliberate
 *                  change (asAtF54c6f5a), and so is every content hash;
 *   record         the contract digested, its /schema texts under 1 MiB, the
 *                  diffs only when the hash is not certainly unchanged;
 *   capture        the request parsed, validated and inferred in the job;
 *   fixture        the request parsed, validated, stripped and bounded;
 *   the verify     the datasets cross back as a bounded summary, and when no
 *                  job ran, this thread reads them in slices.
 */

import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { longestStall } from "../../helpers/stall";
import { referenceSchemaMembers } from "../../helpers/schema-reference";

import { contractLimit, documentLimit, kitLimit, LIMITS, OutputBudget } from "@/lib/contracts/budget";
import { contractDigest } from "@/lib/contracts/canonical";
import { documentJson } from "@/lib/contracts/openapi";
import { compileContract } from "@/lib/contracts/compile";
import { DATASET_SLICE_CHARS, MAX_LISTED_DATASETS, readDatasets, readDatasetsSliced } from "@/lib/contracts/datasets";
import { runJobInEnvelope } from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import {
  captureJob,
  fixtureJob,
  recordableContract,
  recordJob,
  renderJob,
  renderSchemaTexts,
  textOf,
  type RenderJobInput,
} from "@/lib/contracts/jobs";
import { RawJson } from "@/lib/contracts/raw-json";
import { hydrateJsonTexts, inputBytesUpTo, jsonTextRef } from "@/lib/contracts/render-input";
import { requestSchemaText, type RequestSchemaStamp } from "@/lib/contracts/request-schema";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { safeName } from "@/lib/studio/scaffold";
import { buildFixtureBody } from "@/lib/studio/fixtures";
import { inferResponseSchema } from "@/lib/studio/schema-capture";
import { MAX_STORED_ENTITY_SETS, VERIFY_REQUEST_BUDGET_MS, VERIFY_RESPONSE_MARGIN_MS, verifyServiceMetadata } from "@/lib/studio/service-verify";

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const FIXTURES = path.resolve(__dirname, "../../fixtures/contracts/edmx");
const fixture = (f: string) => readFileSync(path.join(FIXTURES, f), "utf8");
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const NO_HEADS = { previous: [], unchangedHashes: [] };

/** Every dataset of every golden description, sliced as a verify slices it. */
function goldenContracts(): { name: string; contract: InterfaceContract; entitySet: string; sourceLength: number }[] {
  const out: { name: string; contract: InterfaceContract; entitySet: string; sourceLength: number }[] = [];
  for (const f of readdirSync(FIXTURES).sort()) {
    const r = compileContract(fixture(f));
    if (!r.ok) throw new Error(f);
    for (const set of r.ir.entitySets) {
      const s = sliceForEntitySet(r.ir, set.name, r.sourceLength);
      if (s.ok) out.push({ name: `${f}/${set.name}`, contract: s.contract, entitySet: set.name, sourceLength: r.sourceLength });
    }
  }
  return out;
}

/** GET /schema's two members as the route splices them from the stored texts. */
function servedMembers(texts: { schemas: string; create: string | null; update: string | null }, stamp: RequestSchemaStamp | null): string {
  const raw = new RawJson();
  const body = stamp ? requestSchemaText(stamp.operation === "UPDATE" ? texts.update : texts.create, stamp) : null;
  return raw.stringify({ schemas: raw.slot(texts.schemas), requestSchema: body === null ? null : raw.slot(body) });
}

const stampOf = (entitySet: string, operation: string, hash: string): RequestSchemaStamp => ({
  semver: "1.2.3",
  entitySet,
  operation,
  snapshotId: "snap_1",
  contentHash: hash,
  interfaceVersion: 3,
});

/**
 * The one deliberate difference in every generated OpenAPI document (the
 * kit's two, the solution document): /schema's `schemasOmitted` enum, whose
 * UNAVAILABLE (never deployed) became NOT_RENDERED. Put back, the bytes are
 * f54c6f5a's.
 */
const NOT_RENDERED_DESCRIPTION = "NOT_RENDERED, its schemas were not rendered when it was recorded, and verifying the service again renders them.";
const asAtF54c6f5a = (t: string) =>
  t.split(NOT_RENDERED_DESCRIPTION).join("UNAVAILABLE, it could not be rendered just now, and a retry may succeed.").split("NOT_RENDERED").join("UNAVAILABLE");

/**
 * The second deliberate difference (P1 onto Phase 0b wave 2): the documents
 * name the codes the governed pipeline added (P0.14). CIRCUIT_OPEN joins the
 * error table and the refusal reasons, CONNECTION_NOT_CONFIGURED is also a
 * 503 (a Tenant Twin this deployment does not have), and the two data
 * operations' 503 is SapUnavailable, which lists them. Taken back out of the
 * parsed document and written again by the same writer (documentJson), the
 * bytes are f54c6f5a's.
 */
type Json = Record<string, unknown>;
function withoutWave2Codes(text: string): string {
  const doc = JSON.parse(text) as Json;
  const components = doc.components as Json;
  const responses = components.responses as Json;
  delete responses.SapUnavailable;
  for (const ops of Object.values(doc.paths as Record<string, Json>)) {
    for (const op of Object.values(ops) as Json[]) {
      const r = op.responses as Json | undefined;
      if (r && (r["503"] as Json | undefined)?.$ref === "#/components/responses/SapUnavailable") {
        r["503"] = { $ref: "#/components/responses/LimiterUnavailable" };
      }
    }
  }
  const error = (components.schemas as Json).Error as Json;
  const code = (((error.properties as Json).error as Json).properties as Json).code as { enum: string[] };
  code.enum = code.enum.filter((c) => c !== "CIRCUIT_OPEN");
  const codes = error["x-coreedge-codes"] as Record<string, Json>;
  delete codes.CIRCUIT_OPEN;
  codes.CONNECTION_NOT_CONFIGURED!.statuses = [403];
  codes.CONNECTION_NOT_CONFIGURED!.meaning = "The customer's SAP connection cannot be bound for this credential's environment yet.";
  error["x-coreedge-refusal-reasons"] = (error["x-coreedge-refusal-reasons"] as { reason: string }[]).filter((r) => r.reason !== "CIRCUIT_OPEN");
  withoutQuerySurfaceCodes(error);
  return documentJson(doc);
}

/**
 * The third deliberate difference (P1.4): the error table names the query
 * surface's three codes and its six refusal reasons, VALIDATION_ERROR is also
 * a 413 and a query's 422, and UPSTREAM_ERROR says when a retry will not
 * help. Taken back out, as above.
 */
const QUERY_SURFACE_CODES = ["POLICY_FIELD_NOT_GRANTED", "CURSOR_STALE", "RECORD_NOT_FOUND"];
function withoutQuerySurfaceCodes(error: Json): void {
  const code = (((error.properties as Json).error as Json).properties as Json).code as { enum: string[] };
  code.enum = code.enum.filter((c) => !QUERY_SURFACE_CODES.includes(c));
  const codes = error["x-coreedge-codes"] as Record<string, Json>;
  for (const c of QUERY_SURFACE_CODES) delete codes[c];
  codes.VALIDATION_ERROR!.statuses = [400, 422];
  codes.VALIDATION_ERROR!.meaning =
    "400: the request or the interface's definition cannot be used as it stands (no dataset, an invalid service path, a missing Idempotency-Key, a body that is not { record }, an unverified own service). 422: SAP rejected the record itself.";
  codes.UPSTREAM_ERROR!.meaning = "The SAP system, or the connection's token endpoint, failed or answered in a way the broker could not use.";
  error["x-coreedge-refusal-reasons"] = (error["x-coreedge-refusal-reasons"] as { origin?: string }[]).filter((r) => r.origin !== "P1.4");
}

/** The kit as it was at f54c6f5a: its two OpenAPI files without wave 2's codes. */
function kitWithoutWave2Codes(text: string): string {
  const files = JSON.parse(text) as { path: string; contents: string }[];
  return JSON.stringify(files.map((f) => (/^openapi(-3\.0)?\.json$/.test(f.path) ? { ...f, contents: withoutWave2Codes(f.contents) } : f)));
}

describe("byte identity with f54c6f5a", () => {
  const golden = JSON.parse(readFileSync(path.resolve(__dirname, "../../fixtures/contracts/golden/read-paths.f54c6f5a.json"), "utf8")) as Record<
    string,
    Record<string, string | number>
  >;

  it("GET /schema spliced from the stored texts is the rendered /schema, with and without a current stamp", () => {
    let compared = 0;
    for (const c of goldenContracts()) {
      const p = recordableContract(c.contract, c.sourceLength, c.entitySet, NO_HEADS);
      if (!p.ok) throw new Error(`${c.name}: ${p.reason}`);
      const texts = { schemas: textOf(p.texts.schemas), create: p.texts.create && textOf(p.texts.create), update: p.texts.update && textOf(p.texts.update) };
      const iface = { version: 3, entitySet: c.entitySet };
      for (const op of [null, "CREATE", "UPDATE"]) {
        const stamp = op === null ? null : stampOf(c.entitySet, op, p.hash);
        const stored = stamp ? { "x-contract": stamp } : null;
        expect(servedMembers(texts, stamp), `${c.name} ${op}`).toBe(referenceSchemaMembers(c.contract, c.entitySet, "snap_1", stored, iface));
        compared += 1;
      }
      // A stamp of an earlier interface version is not current: no body, as before.
      const stale = { "x-contract": { ...stampOf(c.entitySet, "CREATE", p.hash), interfaceVersion: 2 } };
      expect(servedMembers(texts, null)).toBe(referenceSchemaMembers(c.contract, c.entitySet, "snap_1", stale, iface));
    }
    expect(compared).toBeGreaterThanOrEqual(3 * 14);
  });

  it("an empty body splices to exactly what JSON.stringify writes of it with its stamp", () => {
    const stamp = stampOf("X", "CREATE", "0".repeat(64));
    for (const body of [{}, { type: "object" }, { a: [1, { b: "é\u0000" }] }]) {
      expect(requestSchemaText(JSON.stringify(body), stamp)).toBe(JSON.stringify({ ...body, "x-contract": stamp }));
    }
    expect(requestSchemaText(null, stamp)).toBeNull();
  });

  it("every golden content hash, and the starter kit and solution document of every golden dataset, are f54c6f5a's bytes", () => {
    const captured = {
      type: "object",
      properties: { Id: { type: "string" }, Amount: { type: "number" } },
      required: ["Id"],
      "x-captured": { interfaceVersion: 3, entitySet: "X", sampleSize: 2, capturedAt: "2026-10-01T00:00:00.000Z" },
    };
    const cases = goldenContracts();
    expect(cases.map((c) => c.name).sort()).toEqual(Object.keys(golden).sort());
    for (const c of cases) {
      const want = golden[c.name]!;
      const digest = contractDigest(c.contract, new OutputBudget("contract", contractLimit(c.sourceLength)));
      expect(digest, c.name).toEqual({ hash: want.hash, bytes: want.bytes });
      for (const op of ["READ", "CREATE", "UPDATE"]) {
        for (const withSchema of [false, true]) {
          const iface = {
            id: "if_1",
            name: "Iface <x>",
            externalId: "custom:/sap/opu/odata/sap/ZX_SRV",
            sapProduct: "s4hana-onprem",
            operation: op,
            mode: op === "READ" ? "READ" : "WRITE",
            entitySet: c.entitySet,
            version: 3,
            status: "ACTIVE",
            solutionName: "Sol",
            compiled: { semver: "1.2.3", snapshotId: "snap_1", contentHash: digest.hash, compiledAt: "2026-10-01T00:00:00.000Z", contract: c.contract },
            grants: [{ operation: "READ", environment: "DEV" }],
            ...(withSchema ? { responseSchema: captured } : {}),
          };
          const fixtures = [{ scenario: "success", status: 200, body: { records: [{ Id: "1" }] }, sourceStatus: 200, capturedAt: "2026-10-01T00:00:00.000Z" }];
          const k = renderJob({ path: "kit", iface, baseUrl: "https://coreedge.example/api/northbound", fixtures, withheld: [], limit: kitLimit(digest.bytes, 100) });
          if (!k.ok) throw new Error(`${c.name}: kit refused`);
          expect(sha(asAtF54c6f5a(kitWithoutWave2Codes(textOf(k.text)))), `${c.name} kit ${op} ${withSchema}`).toBe(want[`kit:${op}:${withSchema}`]);
        }
      }
      for (const version of ["3.1.0", "3.0.3"] as const) {
        const d = renderJob({
          path: "document",
          doc: {
            version,
            baseUrl: "https://coreedge.example/api/northbound",
            title: `${safeName("Sol")} — CoreEdge northbound`,
            infoVersion: "1.2.3+abc",
            description: "Doc.",
            discovery: true,
            interfaces: [
              {
                id: "if_r", name: "R", externalId: "X", sapProduct: "s4hana", operation: "READ", mode: "READ", entitySet: c.entitySet, version: 3, status: "ACTIVE",
                contract: { source: "metadata", contract: c.contract, semver: "1.2.3", snapshotId: "s", contentHash: digest.hash, compiledAt: "2026-10-01T00:00:00.000Z" },
                grants: [],
              },
              {
                id: "if_c", name: "C", externalId: "X", sapProduct: "s4hana", operation: "CREATE", mode: "WRITE", entitySet: c.entitySet, version: 1, status: "DRAFT",
                contract: { source: "sampled", schema: captured as never },
                grants: [{ operation: "CREATE", environment: "DEV" }],
              },
              { id: "if_n", name: "N", externalId: "X", sapProduct: "s4hana", operation: "READ", mode: "READ", entitySet: null, version: 1, status: "ACTIVE", contract: { source: "none" }, grants: [] },
            ],
          },
          limit: documentLimit([digest.bytes, 0, 0]),
        });
        if (!d.ok) throw new Error(`${c.name}: document refused`);
        expect(sha(asAtF54c6f5a(withoutWave2Codes(textOf(d.text)))), `${c.name} document ${version}`).toBe(want[`doc:${version}`]);
      }
    }
  });
});

/** A contract of `properties` decimal fields, as a large real dataset's slice looks. */
function wide(properties: number): { contract: InterfaceContract; bytes: number; description: string } {
  const props = Array.from(
    { length: properties },
    (_, i) => `<Property Name="Field${i}" Type="Edm.Decimal" Precision="9" Scale="2" sap:label="Field label ${i}" sap:quickinfo="Quick info ${i}"/>`,
  ).join("");
  const description =
    `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" ` +
    `xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData"><edmx:DataServices m:DataServiceVersion="2.0">` +
    `<Schema Namespace="S" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="EmpJobType"><Key><PropertyRef Name="Field0"/></Key>${props}</EntityType>` +
    `<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="EmpJob" EntityType="S.EmpJobType"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
  const r = compileContract(description);
  if (!r.ok) throw new Error(r.detail);
  const s = sliceForEntitySet(r.ir, "EmpJob", r.sourceLength);
  if (!s.ok) throw new Error(s.detail);
  return { contract: s.contract, bytes: contractDigest(s.contract).bytes, description };
}

describe("the record job", () => {
  it("sends back the IR and the /schema texts as bytes, and no IR of the whole service", () => {
    const r = recordJob({ description: fixture("business-partner.v2.xml"), entitySet: "A_Partner", ...NO_HEADS });
    if (!r.ok || !r.dataset?.ok) throw new Error("not recorded");
    expect(r.dataset.ir).toBeInstanceOf(Uint8Array);
    const compiled = compileContract(fixture("business-partner.v2.xml"));
    if (!compiled.ok) throw new Error(compiled.detail);
    const slice = sliceForEntitySet(compiled.ir, "A_Partner", compiled.sourceLength);
    if (!slice.ok) throw new Error(slice.detail);
    expect(textOf(r.dataset.ir)).toBe(JSON.stringify(slice.contract));
    expect(r.dataset.hash).toBe(contractDigest(slice.contract).hash);
    expect(r.dataset.texts.schemas).toBeInstanceOf(Uint8Array);
    expect(r.dataset.facts).toMatchObject({ source: "METADATA", odataVersion: "V2", bodies: { create: true } });
    expect(Object.keys(r)).not.toContain("ir");
  });

  it("diffs against the previous heads, and not when the hash is one whose record is certainly unchanged", () => {
    const before = recordJob({ description: fixture("business-partner.v2.xml"), entitySet: "A_Partner", ...NO_HEADS });
    if (!before.ok || !before.dataset?.ok) throw new Error("not recorded");
    const previous = [textOf(before.dataset.ir)];
    const same = recordJob({ description: fixture("business-partner.v2.xml"), entitySet: "A_Partner", previous, unchangedHashes: [before.dataset.hash] });
    expect(same.ok && same.dataset?.ok && same.dataset.diffs).toBeNull();
    const changed = recordJob({ description: fixture("business-partner.v2.xml").replace('<Property Name="LastName" Type="Edm.String" MaxLength="40"', '<Property Name="LastName" Type="Edm.String" MaxLength="80"'), entitySet: "A_Partner", previous, unchangedHashes: [before.dataset.hash] });
    if (!changed.ok || !changed.dataset?.ok) throw new Error("not recorded");
    expect(changed.dataset.diffs).toHaveLength(1);
    expect(changed.dataset.diffs![0]!.bump).not.toBeNull();
    expect(JSON.parse(textOf(changed.dataset.diffs![0]!.stored))).toMatchObject({ bump: changed.dataset.diffs![0]!.bump });
  });

  it("refuses OUTPUT_TOO_LARGE a contract whose /schema texts pass 1 MiB together, and a real-shaped wide one fits", () => {
    const huge = wide(13_500);
    expect(huge.bytes).toBeLessThanOrEqual(LIMITS.contract.cap);
    expect(recordableContract(huge.contract, undefined, "EmpJob", NO_HEADS)).toMatchObject({ ok: false, reason: "OUTPUT_TOO_LARGE" });
    expect(() => renderSchemaTexts(huge.contract, "EmpJob", huge.bytes)).toThrow();
    // Consolidated review round 1: every /schema read copies the texts (about 23 ms of CPU per MB), so they are capped at
    // 1 MiB, not 4: a dataset of 1,500 labelled fields (about 1.8 MB of texts) is refused at record.
    expect(LIMITS.schema.cap).toBe(1024 * 1024);
    expect(recordableContract(wide(1_500).contract, undefined, "EmpJob", NO_HEADS)).toMatchObject({ ok: false, reason: "OUTPUT_TOO_LARGE" });
    // EmpJob-sized (about 750 fields): inside.
    const real = wide(750);
    const p = recordableContract(real.contract, undefined, "EmpJob", NO_HEADS);
    if (!p.ok) throw new Error(p.reason);
    const total = p.texts.schemas.byteLength + (p.texts.create?.byteLength ?? 0) + (p.texts.update?.byteLength ?? 0);
    expect(total).toBeLessThan(1024 * 1024);
  });

  it("its description in and its texts back leave the event loop ticking, against four 1.9 MB previous heads", async () => {
    const c = wide(13_500);
    const previous = Array.from({ length: 4 }, () => JSON.stringify(c.contract));
    // A narrower version of the same dataset: four diffs of 12,800 removed fields each (its /schema texts under their 1 MiB), parsed and taken in the worker.
    const changed = wide(700);
    const r = await longestStall(() =>
      runJobInEnvelope({ kind: "record", input: { description: changed.description, entitySet: "EmpJob", previous, unchangedHashes: [] } }),
    );
    expect(r.value).toMatchObject({ ok: true, value: { ok: true, dataset: { ok: true } } });
    if (!r.value.ok || !r.value.value.ok || !r.value.value.dataset?.ok) throw new Error("not recorded");
    expect(r.value.value.dataset.diffs).toHaveLength(4);
    expect(r.value.value.dataset.diffs![0]!.bump).toBe("major");
    // The request thread copied strings in and received transferred bytes back: never a walk of the IRs.
    expect(r.ms).toBeLessThan(200);
  });
});

describe("the capture job", () => {
  const rows = [{ Id: "1", Amount: 2 }, { Id: "2", Amount: null }];
  const input = (body: unknown, record = true, declaredVersion: string | null = "V2") => ({
    body: typeof body === "string" ? body : JSON.stringify(body),
    capturedAt: "2026-10-21T00:00:00.000Z",
    iface: { version: 3, entitySet: "Rows" },
    declaredVersion,
    record,
    ...NO_HEADS,
  });

  it("infers what the route used to infer, and makes the sampled contract with its /schema texts", () => {
    const r = captureJob(input({ rows, interfaceVersion: 3, entitySet: "Rows" }));
    if (!r.ok) throw new Error(r.reason);
    const schema = inferResponseSchema(rows, new Date("2026-10-21T00:00:00.000Z"), { version: 3, entitySet: "Rows" })!;
    expect(textOf(r.schema)).toBe(JSON.stringify(schema));
    expect(r).toMatchObject({ fields: 2, sampleSize: 2, claimed: { interfaceVersion: 3, entitySet: "Rows" } });
    expect(r.contract).toMatchObject({ ok: true, facts: { source: "SAMPLED", odataVersion: "V2" } });
  });

  it("refuses what is not rows, rows past the field bound, and rows with nothing to describe", () => {
    expect(captureJob(input("{not json"))).toEqual({ ok: false, reason: "INVALID" });
    expect(captureJob(input({ rows: [] }))).toEqual({ ok: false, reason: "INVALID" });
    const wideRow: Record<string, unknown> = {};
    for (let i = 0; i < 5000; i++) wideRow[`k${i}`] = 0;
    expect(captureJob(input({ rows: [wideRow] }))).toEqual({ ok: false, reason: "TOO_MANY_FIELDS" });
    expect(captureJob(input({ rows: [{ __metadata: { uri: "x" } }] }))).toEqual({ ok: false, reason: "NO_FIELDS" });
  });

  it("says when the rows' OData version cannot be told, and makes no contract when none is wanted", () => {
    expect(captureJob(input({ rows }, true, null))).toMatchObject({ ok: true, contract: { ok: false, reason: "NO_VERSION" } });
    expect(captureJob(input({ rows }, false))).toMatchObject({ ok: true, contract: null });
  });
});

describe("the fixture job", () => {
  it("stores the body the route used to store, decided by the broker's outcome", () => {
    const rows = [{ Id: "1", __metadata: { uri: "x" } }];
    const r = fixtureJob({ body: JSON.stringify({ readStatus: "OK", rows, sourceStatus: 200, interfaceVersion: 2 }) });
    if (!r.ok) throw new Error(r.reason);
    expect(r).toMatchObject({ scenario: "data", status: 200, rows: 1, sourceStatus: 200, claimed: { interfaceVersion: 2 } });
    expect(textOf(r.body)).toBe(JSON.stringify(buildFixtureBody("data", rows, undefined)));
  });

  it("refuses an invalid payload, an outcome that is no scenario, and a body past 4.5 MiB", () => {
    expect(fixtureJob({ body: "[" })).toEqual({ ok: false, reason: "INVALID" });
    expect(fixtureJob({ body: JSON.stringify({ honestStatus: "LOCAL_FAILURE" }) })).toEqual({ ok: false, reason: "NOT_RECORDABLE" });
    const big = Array.from({ length: 25 }, (_, i) => ({ Id: String(i), photo: "A".repeat(200_000) }));
    expect(fixtureJob({ body: JSON.stringify({ readStatus: "OK", rows: big }) })).toEqual({ ok: false, reason: "TOO_LARGE" });
  });
});

describe("the render job", () => {
  it("a kit with 4.2 MB of recorded fixtures is built inside its budget, not refused for its input", async () => {
    const records = Array.from({ length: 25 }, (_, i) => ({ PhotoId: String(i), photo: "A".repeat(168_000) }));
    const body = { records };
    const fixtureBytes = Buffer.byteLength(JSON.stringify(body));
    expect(fixtureBytes).toBeGreaterThan(4_200_000);
    expect(fixtureBytes).toBeLessThanOrEqual(LIMITS.fixture.bytes);
    const input: RenderJobInput = {
      path: "kit",
      iface: { id: "if_1", name: "Photos", externalId: "custom:/x", sapProduct: "successfactors", operation: "READ", entitySet: "Photo", version: 1, solutionName: "S" },
      baseUrl: "https://x",
      fixtures: [{ scenario: "data", status: 200, body: jsonTextRef(JSON.stringify(body)), sourceStatus: 200, capturedAt: "2026-10-01T00:00:00.000Z" }],
      withheld: [],
      limit: kitLimit(0, fixtureBytes),
    };
    const r = await longestStall(() => runJobInEnvelope({ kind: "render", input }));
    expect(r.value).toMatchObject({ ok: true, value: { ok: true } });
    if (!r.value.ok || !r.value.value.ok) throw new Error("not rendered");
    const files = JSON.parse(textOf(r.value.value.text)) as { path: string; contents: string }[];
    expect(files.find((f) => f.path === "fixtures.json")!.contents.length).toBeGreaterThan(4_200_000);
    // The fixtures crossed as their text, parsed in the worker.
    expect(r.ms).toBeLessThan(200);
  });

  it("what a render is handed is measured before it is copied: past the bound it never reaches a worker, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const input: RenderJobInput = {
      path: "kit",
      iface: { id: "if_1", name: "x", externalId: "custom:/x", sapProduct: "s4hana", operation: "READ", entitySet: "X", version: 1, solutionName: "S" },
      baseUrl: "https://x",
      fixtures: [{ scenario: "data", status: 200, body: jsonTextRef("x".repeat(LIMITS.renderInput.bytes)), sourceStatus: 200, capturedAt: "2026-10-01T00:00:00.000Z" }],
      withheld: [],
      limit: LIMITS.kit.cap,
    };
    expect(await runJobInEnvelope({ kind: "render", input })).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT", cause: "input" });
  });

  it("a reference stands for its value, is counted by its length, and is parsed only where it is used", () => {
    const value = { records: [{ a: 1 }, { b: "x" }] };
    const text = JSON.stringify(value);
    const input = { path: "kit", fixtures: [{ scenario: "data", body: jsonTextRef<unknown>(text) }] };
    expect(inputBytesUpTo(input, 1e9)).toBeGreaterThanOrEqual(text.length);
    const hydrated = hydrateJsonTexts(input);
    expect(hydrated.fixtures[0]!.body).toEqual(value);
    // Not in place: the caller's input still carries its text.
    expect(input.fixtures[0]!.body).not.toEqual(value);
    // Stored data shaped like a reference is never ours to fail on…
    const lookalike = { a: { __coreedgeStoredJsonText: "not json" }, b: { __coreedgeStoredJsonText: "1", other: 2 } };
    expect(hydrateJsonTexts(lookalike)).toEqual(lookalike);
    // …and a key "__proto__" is set as a member, never as a prototype.
    const proto = JSON.parse('{"__proto__": {"__coreedgeStoredJsonText": "{\\"x\\": 1}"}}') as Record<string, unknown>;
    const out = hydrateJsonTexts(proto);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(out, "__proto__")?.value).toEqual({ x: 1 });
  });
});

const CONNECTION = {
  source: "db",
  id: "conn_dev",
  organizationId: "org_a",
  product: "s4hana-onprem",
  key: "dev",
  label: "ERP DEV",
  baseUrl: "https://erp.example.internal:44300",
  authType: "basic",
  secrets: { username: "u", password: "p" },
  oauthTokenUrl: null,
  writeEnabled: false,
  apiPath: null,
  timeoutMs: null,
  environment: "DEV",
  client: "100",
} as unknown as ResolvedSapConnection;

/** A V2 description declaring `sets` entity sets (T0…), of one small type each. */
function manySets(sets: number, extra = ""): string {
  let types = "";
  let container = "";
  for (let i = 0; i < sets; i++) {
    types += `<EntityType Name="T${i}Type"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/></EntityType>`;
    container += `<EntitySet Name="T${i}" EntityType="NS.T${i}Type"/>`;
  }
  return (
    '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">' +
    `<edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="NS" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">${types}${extra}` +
    `<EntityContainer Name="C" m:IsDefaultEntityContainer="true">${container}</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`
  );
}

/** 8 MiB of `<EntitySet>` tags (185,000 of them, one shared type). */
function eightMiBOfSets(): string {
  const head =
    '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"><edmx:DataServices><Schema Namespace="NS" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="T"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String"/></EntityType><EntityContainer Name="C">';
  const parts: string[] = [head];
  let n = head.length;
  for (let i = 0; n < 8 * 1024 * 1024 - 200; i++) {
    const tag = `<EntitySet Name="S${i}" EntityType="NS.T"/>`;
    parts.push(tag);
    n += tag.length;
  }
  parts.push("</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>");
  return parts.join("");
}

const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/xml" } });

describe("the verify: a bounded summary, and no description-sized work on this thread", () => {
  it("the datasets cross back from the job as a bounded summary, the interface's dataset found past the listed ones", async () => {
    const body = manySets(2000);
    const r = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "T1999" },
      (async () => xml(body)) as unknown as typeof fetch,
    );
    expect(r).toMatchObject({ status: "OK", verified: true, entitySetCount: 2000 });
    expect(r.compiled).toMatchObject({ ok: true, datasets: { count: 2000, hasEntitySet: true } });
    expect(r.entitySets).toHaveLength(MAX_STORED_ENTITY_SETS);
    expect(r.entitySets.length).toBe(MAX_LISTED_DATASETS);
    const t = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "t1999" },
      (async () => xml(body)) as unknown as typeof fetch,
    );
    expect(t).toMatchObject({ status: "ENTITY_SET_MISSING", suggestedEntitySet: "T1999" });
  });

  it("a description the compiler refuses is read by the older reader inside the job", async () => {
    const body = manySets(3, '<EntityType Name="Doc"><Documentation><Summary>a\u0000b</Summary></Documentation></EntityType>');
    expect(compileContract(body).ok).toBe(false);
    const r = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "T2" },
      (async () => xml(body)) as unknown as typeof fetch,
    );
    expect(r.compiled).toMatchObject({ ok: false, datasets: { names: ["T0", "T1", "T2"], count: 3, hasEntitySet: true } });
    expect(r).toMatchObject({ status: "OK", verified: true, entitySets: ["T0", "T1", "T2"], entitySetCount: 3 });
  });

  it("when a job that was fetched for did not run (BUSY, RESOURCE_LIMIT), this thread reads the datasets in slices, and the event loop keeps ticking", async () => {
    const body = eightMiBOfSets();
    const slices: number[] = [];
    const sliced = await longestStall(() => readDatasetsSliced(body, "S184000", (n) => slices.push(n)));
    expect(sliced.value).toEqual(readDatasets(body, "S184000"));
    expect(sliced.value.count).toBeGreaterThan(180_000);
    for (const n of slices) expect(n).toBeLessThanOrEqual(DATASET_SLICE_CHARS + 64);
    expect(sliced.ms).toBeLessThan(150);
  });

  /*
   * Consolidated review round 1: with the compiler off (or the organisation's
   * time spent), the verify fetched the description (up to 8 MiB) and read
   * its datasets on this thread, uncharged — so the kill switch moved the
   * parse onto the request thread instead of stopping it. The job's first
   * step is now asked before SAP is.
   */
  it("with the compiler off, SAP is never asked: COMPILER_UNAVAILABLE, with the interface's stored datasets", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("COREEDGE_CONTRACT_ISOLATES", "0");
    const fetchImpl = vi.fn(async () => xml(eightMiBOfSets()));
    const r = await verifyServiceMetadata(
      {
        connection: CONNECTION,
        servicePath: "/sap/opu/odata/sap/Z_SRV",
        declaredVersion: null,
        entitySet: "S184000",
        organizationId: "org_off",
        storedEntitySets: ["S1", "S184000"],
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: "COMPILER_UNAVAILABLE", verified: false, entitySets: ["S1", "S184000"], entitySetCount: 2, httpStatus: null, auditStatus: 503 });
    expect(r.compiled).toMatchObject({ ok: false, reason: "DISABLED" });
    expect(r.detail).toMatch(/SAP was not asked: the contract compiler is turned off/);
  });

  it("the verify's budget and its margin fit the route's platform limit", () => {
    const route = readFileSync(path.resolve(__dirname, "../../../src/app/api/studio/interfaces/[id]/verify-service/route.ts"), "utf8");
    const maxDuration = Number(/export const maxDuration = (\d+);/.exec(route)?.[1]);
    expect(maxDuration).toBeGreaterThan(0);
    expect(VERIFY_REQUEST_BUDGET_MS + VERIFY_RESPONSE_MARGIN_MS).toBeLessThanOrEqual(maxDuration * 1000);
    // The margin covers a worker cut at the deadline (its exit grace, 5 s) and the route's own writes.
    expect(VERIFY_RESPONSE_MARGIN_MS).toBeGreaterThanOrEqual(10_000);
  });
});
