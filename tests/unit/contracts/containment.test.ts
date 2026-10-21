// @vitest-environment node
/**
 * STRUCTURAL CONTAINMENT of the Contract Compiler (P1.3, after three
 * hostile-input review rounds that each found a new superlinear path).
 *
 * Not another shape that is expensive, but the mechanisms that bound every
 * shape, found or not:
 *
 *   the envelope   the whole compile runs in a worker with a capped heap, a
 *                  capped stack and a deadline (envelope.ts) — and the cap
 *                  holds even in a process started with --max-old-space-size,
 *                  which V8 otherwise lets override a worker's own limits;
 *   the budget     one writer counts every byte of contract-derived output as
 *                  it is written and stops at a stated limit (budget.ts),
 *                  writing exactly what JSON.stringify wrote before;
 *   record time    every read path's output is rendered under that read
 *                  path's budget inside the envelope before a contract is
 *                  stored (pipeline.ts), so no read meets an unrendered one.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import v8 from "node:v8";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BudgetExceeded,
  documentLimit,
  jsonText,
  kitLimit,
  LIMITS,
  measureJson,
  OutputBudget,
  schemaLimit,
  UNLIMITED,
  utf8Length,
} from "@/lib/contracts/budget";
import { boundedContractDigest, canonicalJson, contractDigest, MAX_CONTRACT_BYTES, normalizeContract } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { ENVELOPE_CONCURRENCY, ENVELOPE_LIMITS, ENVELOPE_QUEUE, heapLimitBytes, runInEnvelope } from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { prepareContract, renderAndMeasure } from "@/lib/contracts/pipeline";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { buildScaffold } from "@/lib/studio/scaffold";

const FIXTURES = path.resolve(__dirname, "../../fixtures/contracts/edmx");
const fixture = (f: string) => readFileSync(path.join(FIXTURES, f), "utf8");

function sliced(file: string, set: string): InterfaceContract {
  const r = compileContract(fixture(file));
  if (!r.ok) throw new Error(r.detail);
  const s = sliceForEntitySet(r.ir, set, r.sourceLength);
  if (!s.ok) throw new Error(s.detail);
  return s.contract;
}

/** canonical.ts as it was before the budgeted writer: the oracle every stored content hash was taken with. */
function oldSortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(oldSortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = oldSortKeys(v);
    }
    return out;
  }
  return value;
}

/** A seeded generator (mulberry32): the same values on every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random JSON-ish values, with the corners JSON.stringify has: undefined members, holes, -0, NaN, lone surrogates, integer keys. */
function randomValue(r: () => number, depth = 0): unknown {
  const pick = Math.floor(r() * (depth > 4 ? 7 : 10));
  const strings = ["", "a", "é", "\u0000", "\ud800", "\udc00x", "😀", '"\\', "\n\t", "1", "10", "02", "__proto__", "toJSON", "x".repeat(40)];
  switch (pick) {
    case 0:
      return null;
    case 1:
      return r() < 0.5;
    case 2:
      return [0, -0, 1.5, -1e21, 1e-7, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53][Math.floor(r() * 8)];
    case 3:
    case 4:
      return strings[Math.floor(r() * strings.length)];
    case 5:
      return undefined;
    case 6:
      return Math.floor(r() * 1000);
    case 7: {
      const a: unknown[] = [];
      const n = Math.floor(r() * 5);
      for (let i = 0; i < n; i++) a.push(randomValue(r, depth + 1));
      return a;
    }
    default: {
      const o: Record<string, unknown> = {};
      const n = Math.floor(r() * 6);
      for (let i = 0; i < n; i++) o[strings[Math.floor(r() * strings.length)]! + (r() < 0.3 ? String(i) : "")] = randomValue(r, depth + 1);
      return o;
    }
  }
}

afterEach(() => vi.restoreAllMocks());

describe("the one budgeted writer writes what JSON.stringify wrote", () => {
  it("compact, indented and canonical, for 3,000 seeded random values", () => {
    const r = rng(1303);
    for (let i = 0; i < 3000; i++) {
      const v = randomValue(r);
      expect(jsonText(v, UNLIMITED())).toBe(JSON.stringify(v) ?? "");
      expect(jsonText(v, UNLIMITED(), { indent: 2 })).toBe(JSON.stringify(v, null, 2) ?? "");
      expect(canonicalJson(v)).toBe(JSON.stringify(oldSortKeys(v)) ?? "");
      expect(measureJson(v)).toBe(utf8Length(JSON.stringify(v) ?? ""));
    }
  });

  it("so every content hash recorded before is the hash of the same contract", () => {
    for (const [file, set] of [
      ["business-partner.v2.xml", "A_Partner"],
      ["sales-order-rap.v4.xml", "SalesOrder"],
      ["successfactors-style.v2.xml", "cust_TravelRequest"],
      ["z-bonus-plan-rap.v4.json", "BonusPlan"],
    ] as const) {
      const c = sliced(file, set);
      const old = JSON.stringify(oldSortKeys(normalizeContract(c)));
      const d = contractDigest(c);
      expect(d.hash).toBe(createHash("sha256").update(old).digest("hex"));
      expect(d.bytes).toBe(Buffer.byteLength(old, "utf8"));
    }
  });
});

describe("the budget stops the writer at its limit, however much the value shares", () => {
  // One 1 MB string referenced 10,000 times: 10 GB as JSON, 1 MB in memory.
  const big = "x".repeat(1024 * 1024);
  const shared = { items: Array.from({ length: 10_000 }, () => ({ label: big })) };

  it.each([
    ["compact", {}],
    ["indented", { indent: 2 }],
    ["canonical", { sortKeys: true }],
  ] as const)("%s", (_label, opts) => {
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    let caught: unknown;
    try {
      jsonText(shared, new OutputBudget("document", 4 * 1024 * 1024), opts);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BudgetExceeded);
    expect((caught as BudgetExceeded).budget).toBe("document");
    // Stopped within one member of the limit: a few MB of work, never 10 GB.
    expect((caught as BudgetExceeded).spent).toBeLessThan(4 * 1024 * 1024 + 2 * big.length);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(64 * 1024 * 1024);
  });

  it("a measure stops the same way, keeping nothing", () => {
    expect(() => measureJson(shared, 1024 * 1024)).toThrow(BudgetExceeded);
  });

  it("nesting past the writer's depth is a typed refusal, never a RangeError", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 200_000; i++) deep = [deep];
    for (const opts of [{}, { indent: 2 }, { sortKeys: true }]) {
      expect(() => jsonText(deep, UNLIMITED(), opts)).toThrow(BudgetExceeded);
    }
  });

  it("a budget with a deadline stops on the clock as well", () => {
    const budget = new OutputBudget("document", Number.POSITIVE_INFINITY, Date.now() - 1);
    const many = { a: Array.from({ length: 50_000 }, (_, i) => ({ i, more: [i, i] })) };
    expect(() => jsonText(many, budget, { indent: 2 })).toThrow(expect.objectContaining({ budget: "time" }));
  });

  it("the canonical digest of a contract past its budget is refused while it is written", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    const label = "l".repeat(1024 * 1024);
    // Every property shares one long label: tens of MB as JSON, a few KB in memory.
    for (const p of c.entityType.properties) p.label = label;
    for (let i = 0; i < 64; i++) c.operations.push({ name: `op${i}`, kind: "action", entitySet: "SalesOrder", parameters: [], label });
    const started = performance.now();
    const r = boundedContractDigest(c);
    expect(r.ok).toBe(false);
    expect(r.bytes).toBeGreaterThan(MAX_CONTRACT_BYTES);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("the limits are proportional to what they are made from, and capped", () => {
    expect(schemaLimit(0)).toBe(LIMITS.schema.floor);
    expect(schemaLimit(1000)).toBe(LIMITS.schema.floor + 16 * 1000);
    expect(schemaLimit(MAX_CONTRACT_BYTES)).toBe(LIMITS.schema.cap);
    expect(kitLimit(1000, 10)).toBe(LIMITS.kit.floor + 32 * 1000 + 8 * 10);
    expect(kitLimit(MAX_CONTRACT_BYTES)).toBe(LIMITS.kit.cap);
    expect(documentLimit([1000, 2000])).toBe(LIMITS.document.floor + 2 * LIMITS.document.perInterface + 16 * 3000);
    expect(documentLimit(Array.from({ length: 1000 }, () => MAX_CONTRACT_BYTES))).toBe(LIMITS.document.cap);
  });
});

describe("every read path's output is rendered and measured at record time", () => {
  it("a real contract renders well inside every read path's budget", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    const p = prepareContract({ contract: c, subject: null });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.rendered.schema).toBeLessThan(schemaLimit(p.bytes));
    expect(p.rendered.kit).toBeLessThan(kitLimit(p.bytes));
    expect(p.rendered.document).toBeLessThan(documentLimit([p.bytes]));
  });

  it("a contract whose outputs would not fit its read path's budget is refused before it is stored (OUTPUT_TOO_LARGE)", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    // The same contract against budgets a tenth of the size: whatever shape
    // grows past a budget — found or not — ends here, not on a read.
    const tight = {
      schema: { ...LIMITS.schema, floor: 1024, perContractByte: 1 },
      kit: { ...LIMITS.kit, floor: 1024, perContractByte: 1 },
      document: { ...LIMITS.document, floor: 1024, perInterface: 0, perContractByte: 1 },
    };
    expect(prepareContract({ contract: c, subject: null, limits: tight })).toMatchObject({ ok: false, reason: "OUTPUT_TOO_LARGE" });
    expect(() => renderAndMeasure(c, 1, null, tight)).toThrow(BudgetExceeded);
  });

  it("a contract over the contract budget is refused (TOO_LARGE), with its size", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    for (let i = 0; i < 40_000; i++) c.entityType.properties.push({ name: `ZZ1_FIELD_${i}`, type: "Edm.String", nullable: true, label: "x".repeat(40) });
    const p = prepareContract({ contract: c, subject: null });
    expect(p).toMatchObject({ ok: false, reason: "TOO_LARGE" });
    expect(!p.ok && p.bytes).toBeGreaterThan(MAX_CONTRACT_BYTES);
  });

  it("the kit stops at its budget as it is written", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    const iface = {
      id: "if_1",
      name: "x",
      externalId: "custom:/x",
      sapProduct: "s4hana",
      operation: "CREATE",
      mode: "WRITE",
      entitySet: "SalesOrder",
      version: 1,
      solutionName: "s",
      compiled: { semver: "1.0.0", snapshotId: "s", contentHash: "0", compiledAt: "2026-10-21T00:00:00.000Z", contract: c },
    };
    // A recorded fixture nested deep enough that its indentation alone is quadratic.
    let body: unknown = { leaf: true };
    for (let i = 0; i < 900; i++) body = { next: body };
    const fixtures = [{ scenario: "data", status: 200, body, sourceStatus: 200, capturedAt: "2026-10-21T00:00:00.000Z" }];
    expect(() => buildScaffold(iface, "https://x", fixtures, [], new OutputBudget("kit", kitLimit(contractDigest(c).bytes, measureJson(body))))).toThrow(
      BudgetExceeded,
    );
    // Without that fixture, the same kit is well inside it.
    expect(() => buildScaffold(iface, "https://x", [], [], new OutputBudget("kit", kitLimit(contractDigest(c).bytes)))).not.toThrow();
  });
});

/** A V2 description of `types` entity types of `props` properties each: about 15 KB per type at 110 properties. */
function largeDescription(types: number, props: number): string {
  let s =
    '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData"><edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="NS" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">';
  const sets: string[] = [];
  for (let t = 0; t < types; t++) {
    s += `<EntityType Name="T${t}Type" sap:label="Type ${t}"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false" MaxLength="10"/>`;
    for (let p = 0; p < props; p++) s += `<Property Name="Field${p}" Type="Edm.String" MaxLength="40" sap:label="Field label ${p}" sap:quickinfo="Quick info for field ${p}"/>`;
    s += "</EntityType>";
    sets.push(`<EntitySet Name="T${t}" EntityType="NS.T${t}Type"/>`);
  }
  return `${s}<EntityContainer Name="C" m:IsDefaultEntityContainer="true">${sets.join("")}</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
}

describe("the envelope", () => {
  it("compiles a real description, its dataset sliced, digested and measured, and sends back no IR", async () => {
    const r = await runInEnvelope({ kind: "compile", input: { body: fixture("business-partner.v2.xml"), entitySet: "A_Partner", subject: null } });
    expect(r.ok).toBe(true);
    if (!r.ok || !r.value.ok) throw new Error("not compiled");
    expect(r.value.entitySets.map((e) => e.name)).toContain("A_Partner");
    expect(r.value.dataset).toMatchObject({ ok: true, hash: contractDigest(sliced("business-partner.v2.xml", "A_Partner")).hash });
    expect(Object.keys(r.value)).not.toContain("ir");
  }, 30_000);

  it("a compile that needs more heap than its cap ends its own worker (RESOURCE_LIMIT), whatever the process's own flag", async () => {
    // As in a process started with NODE_OPTIONS=--max-old-space-size=4096:
    // V8 lets that flag override a worker's own resource limits.
    v8.setFlagsFromString("--max-old-space-size=4096");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runInEnvelope(
      { kind: "compile", input: { body: largeDescription(300, 110), entitySet: "T1", subject: null } },
      { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4, stackSizeMb: 4, deadlineMs: 60_000 },
    );
    expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT" });
    // The request thread's own heap is the one it started with.
    expect(v8.getHeapStatistics().heap_size_limit).toBeGreaterThan(heapLimitBytes(ENVELOPE_LIMITS.compile));
  }, 60_000);

  it("a compile past its deadline is terminated wherever it is (RESOURCE_LIMIT), and the thread is never blocked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let maxGap = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 5);
    const started = performance.now();
    const r = await runInEnvelope(
      { kind: "compile", input: { body: largeDescription(300, 110), entitySet: "T1", subject: null } },
      { ...ENVELOPE_LIMITS.compile, deadlineMs: 300 },
    );
    clearInterval(ticker);
    expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT" });
    expect(performance.now() - started).toBeLessThan(2000);
    // The ticker kept running while the worker compiled: the request thread only waited.
    expect(maxGap).toBeLessThan(250);
  }, 30_000);

  it("past its concurrency and queue, a compile is refused at once (BUSY), and every queued one still runs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const job = { kind: "diff" as const, input: { previous: [], next: sliced("z-travel-booking.v2.xml", "BookingSet") } };
    // A deadline long enough that waiting for a turn never ends one, however loaded the runner.
    const limits = { ...ENVELOPE_LIMITS.diff, deadlineMs: 600_000 };
    const all = Array.from({ length: ENVELOPE_CONCURRENCY + ENVELOPE_QUEUE + 1 }, () => runInEnvelope(job, limits));
    const results = await Promise.all(all);
    expect(results.filter((r) => !r.ok && r.reason === "BUSY")).toHaveLength(1);
    expect(results.filter((r) => r.ok)).toHaveLength(ENVELOPE_CONCURRENCY + ENVELOPE_QUEUE);
  }, 300_000);

  it("a job that throws is INTERNAL, never a rejected promise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runInEnvelope({ kind: "compile", input: { body: 7 as unknown as string, entitySet: null, subject: null } });
    expect(r).toMatchObject({ ok: false, reason: "INTERNAL" });
  }, 30_000);
});
