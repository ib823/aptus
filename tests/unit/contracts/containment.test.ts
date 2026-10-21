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
import {
  ENVELOPE_CONCURRENCY,
  ENVELOPE_LIMITS,
  ENVELOPE_QUEUE,
  ENVELOPE_TENANT_RUNNING,
  ENVELOPE_TENANT_WAITING,
  envelopeIsolates,
  envelopeQueueState,
  heapLimitBytes,
  runInEnvelope,
} from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { prepareContract, renderAndMeasure, renderForRead, type RenderJobInput } from "@/lib/contracts/pipeline";
import { RawJson, renderReadPath, renderReadPathLazy, requestThreadShare } from "@/lib/contracts/read-render";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { buildNorthboundOpenApi } from "@/lib/contracts/openapi";
import { buildScaffold } from "@/lib/studio/scaffold";
import { inferResponseSchema } from "@/lib/studio/schema-capture";

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
    expect(r.value.datasets).toMatchObject({ hasEntitySet: true, suggestion: null });
    expect(r.value.datasets.names).toContain("A_Partner");
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

/*
 * STRUCTURAL HARDENING, ROUND 1: the envelope's own edges — what crosses into
 * it, how its slots are shared, and the heap flag it did not cap — and the
 * two places outside it that did work in proportion to a hostile input.
 */
describe("structural hardening, round 1", () => {
  /** A contract of `n` properties: about 60 bytes of canonical JSON each. */
  function wideContract(n: number): InterfaceContract {
    const c = sliced("business-partner.v2.xml", "A_Partner");
    return {
      ...c,
      entityType: {
        ...c.entityType,
        properties: Array.from({ length: n }, (_, i) => ({ name: `Field${i}`, type: "x-json:string", nullable: false })),
      },
    };
  }

  it("inference stops past the field bound, before it sorts or builds anything", () => {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < 358_000; i++) row[`k${i}`] = 0;
    const started = performance.now();
    expect(() => inferResponseSchema([row])).toThrow(BudgetExceeded);
    // Counting stops at the bound: a fraction of what sorting 358,000 keys took (seconds).
    expect(performance.now() - started).toBeLessThan(1500);
    const ok: Record<string, unknown> = {};
    for (let i = 0; i < LIMITS.capturedSchema.properties; i++) ok[`k${i}`] = 0;
    expect(Object.keys(inferResponseSchema([ok])!.properties)).toHaveLength(LIMITS.capturedSchema.properties);
  });

  it("and refuses a schema of few fields whose names make it past the byte bound", () => {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < 400; i++) row[`${"N".repeat(1500)}${i}`] = "v";
    let refused: unknown = null;
    try {
      inferResponseSchema([row]);
    } catch (err) {
      refused = err;
    }
    expect(refused).toBeInstanceOf(BudgetExceeded);
    expect((refused as BudgetExceeded).budget).toBe("capturedSchema");
  });

  it("a contract past the cap never crosses into a worker: prepare answers TOO_LARGE before it is copied", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const contract = wideContract(60_000);
    expect(measureJson(contract)).toBeGreaterThan(LIMITS.contract.cap);
    // A heap the copy alone would exhaust: had it crossed, the worker would have died of it.
    const tight = { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4, stackSizeMb: 4, deadlineMs: 60_000 };
    const r = await runInEnvelope({ kind: "prepare", input: { contract, subject: null } }, tight);
    expect(r).toMatchObject({ ok: true, value: { ok: false, reason: "TOO_LARGE" } });
    const d = await runInEnvelope({ kind: "diff", input: { previous: [contract], next: contract } }, tight);
    expect(d).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT" });
  }, 60_000);

  it("the solution document's build stops at the interface that passes its budget", () => {
    const ifaces = Array.from({ length: 2000 }, (_, i) => ({
      id: `if_${i}`,
      name: `Interface ${i}`,
      externalId: "API_X",
      sapProduct: "s4hana",
      operation: "READ",
      mode: "READ",
      entitySet: `Set${i}`,
      version: 1,
      contract: { source: "none" as const },
    }));
    const budget = new OutputBudget("document", 256 * 1024);
    const doc = { version: "3.1.0" as const, baseUrl: "https://x", title: "t", description: "d", infoVersion: "1.0.0", interfaces: ifaces };
    expect(() => buildNorthboundOpenApi({ ...doc, budget })).toThrow(BudgetExceeded);
    // It stopped within one interface's part of its limit, not after building all 2,000.
    expect(budget.spent).toBeLessThan(budget.limit + 64 * 1024);
    // With room to spare, the same document as without a budget.
    expect(buildNorthboundOpenApi({ ...doc, interfaces: ifaces.slice(0, 3) })).toEqual(
      buildNorthboundOpenApi({ ...doc, interfaces: ifaces.slice(0, 3), budget: new OutputBudget("document", 32 * 1024 * 1024) }),
    );
  });

  it("one organisation cannot hold every slot and queue place: another's job runs at once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const slow = { kind: "compile" as const, input: { body: largeDescription(300, 110), entitySet: "T1", subject: null } };
    const quick = { kind: "diff" as const, input: { previous: [], next: sliced("z-travel-booking.v2.xml", "BookingSet") } };
    const limits = { ...ENVELOPE_LIMITS.compile, deadlineMs: 600_000 };
    const done: string[] = [];
    const track = <T>(name: string, p: Promise<T>) =>
      p.then((r) => {
        done.push(name);
        return r;
      });
    const a = Array.from({ length: ENVELOPE_TENANT_RUNNING + ENVELOPE_TENANT_WAITING + 2 }, (_, i) =>
      track(`a${i}`, runInEnvelope(slow, limits, { tenant: "org_a" })),
    );
    const b = track("b", runInEnvelope(quick, { ...ENVELOPE_LIMITS.diff, deadlineMs: 600_000 }, { tenant: "org_b" }));
    const [aResults, bResult] = await Promise.all([Promise.all(a), b]);
    // Past its share, the organisation's own jobs are refused at once…
    const busy = aResults.filter((r) => !r.ok && r.reason === "BUSY");
    expect(busy).toHaveLength(2);
    for (const r of busy) expect(r.ms).toBeLessThan(1000);
    expect(aResults.filter((r) => r.ok)).toHaveLength(ENVELOPE_TENANT_RUNNING + ENVELOPE_TENANT_WAITING);
    // …and the other organisation's job took the slot left for it, ahead of the first one's queue.
    expect(bResult.ok).toBe(true);
    expect(done.indexOf("b")).toBeLessThan(done.indexOf("a1"));
    expect(envelopeQueueState()).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
  }, 300_000);

  it("a job whose wait ends leaves the queue at once, so no stale waiter holds a place", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const slow = { kind: "compile" as const, input: { body: largeDescription(300, 110), entitySet: "T1", subject: null } };
    const running = Array.from({ length: ENVELOPE_CONCURRENCY }, () => runInEnvelope(slow, { ...ENVELOPE_LIMITS.compile, deadlineMs: 600_000 }));
    const waiters = Array.from({ length: 3 }, () => runInEnvelope(slow, { ...ENVELOPE_LIMITS.compile, deadlineMs: 150 }));
    for (const r of await Promise.all(waiters)) expect(r).toMatchObject({ ok: false, reason: "BUSY" });
    // The slots are still taken; the places those three held are free again.
    expect(envelopeQueueState()).toMatchObject({ running: ENVELOPE_CONCURRENCY, waiting: 0 });
    await Promise.all(running);
    expect(envelopeQueueState()).toMatchObject({ running: 0, waiting: 0 });
  }, 300_000);

  it("compiles in a process started with --max-semi-space-size, which V8 also lets override a worker's limits", async () => {
    // As under NODE_OPTIONS="--max-semi-space-size=64": a worker otherwise gets 3 × 64 MB of young generation.
    v8.setFlagsFromString("--max-semi-space-size=64");
    try {
      const r = await runInEnvelope({ kind: "compile", input: { body: fixture("business-partner.v2.xml"), entitySet: "A_Partner", subject: null } });
      expect(r).toMatchObject({ ok: true, value: { ok: true } });
    } finally {
      v8.setFlagsFromString("--max-semi-space-size=0");
    }
  }, 60_000);
});

/*
 * STRUCTURAL HARDENING, ROUND 2: the envelope's slots count isolates, not
 * results; and a read path renders on the request thread only what is cheap
 * by construction, in the envelope otherwise, with the same bytes either way.
 */
describe("structural hardening, round 2", () => {
  it("a slot is free only once its worker has exited: never more live isolates than slots", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(envelopeIsolates().live).toBe(0);
    const slow = { kind: "compile" as const, input: { body: largeDescription(300, 110), entitySet: "T1", subject: null } };
    const quick = { kind: "diff" as const, input: { previous: [], next: sliced("z-travel-booking.v2.xml", "BookingSet") } };
    // Slots held by jobs that end at their deadline, then handed on to queued jobs that run to the end.
    const ended = Array.from({ length: ENVELOPE_CONCURRENCY }, () => runInEnvelope(slow, { ...ENVELOPE_LIMITS.compile, deadlineMs: 500 }));
    const queued = Array.from({ length: ENVELOPE_CONCURRENCY + 2 }, () => runInEnvelope(quick, { ...ENVELOPE_LIMITS.diff, deadlineMs: 600_000 }));
    const [endedResults, queuedResults] = await Promise.all([Promise.all(ended), Promise.all(queued)]);
    for (const r of endedResults) expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT" });
    for (const r of queuedResults) expect(r.ok).toBe(true);
    // Answered only once exited: nothing awaited is still alive, and no slot outlived its isolate.
    expect(envelopeIsolates()).toEqual({ live: 0, peak: expect.any(Number) as number });
    expect(envelopeQueueState()).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
  }, 120_000);

  it("and the peak of live isolates in such a burst never passes the slots", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    envelopeIsolates();
    const slow = { kind: "compile" as const, input: { body: largeDescription(300, 110), entitySet: "T1", subject: null } };
    const quick = { kind: "diff" as const, input: { previous: [], next: sliced("z-travel-booking.v2.xml", "BookingSet") } };
    const ended = Array.from({ length: ENVELOPE_CONCURRENCY }, () => runInEnvelope(slow, { ...ENVELOPE_LIMITS.compile, deadlineMs: 500 }));
    const queued = Array.from({ length: ENVELOPE_CONCURRENCY + 2 }, () => runInEnvelope(quick, { ...ENVELOPE_LIMITS.diff, deadlineMs: 600_000 }));
    await Promise.all([...ended, ...queued]);
    expect(envelopeIsolates().peak).toBeLessThanOrEqual(ENVELOPE_CONCURRENCY);
  }, 120_000);

  const schemaInput = (limit: number): RenderJobInput => ({
    path: "schema",
    contract: sliced("business-partner.v2.xml", "A_Partner"),
    entitySet: "A_Partner",
    snapshotId: "snap_1",
    requestSchema: null,
    iface: { version: 1, entitySet: "A_Partner" },
    limit,
  });
  const asText = (t: string | Uint8Array) => (typeof t === "string" ? t : new TextDecoder().decode(t));
  /** Lets the request thread's share of render time refill. */
  const refilled = () => new Promise((resolve) => setTimeout(resolve, 500));

  it("a read whose stored input is past what the request thread renders renders in the envelope, the same bytes as here", async () => {
    await refilled();
    const here = renderForRead(schemaInput(LIMITS.schema.cap));
    expect(here.ok).toBe(true);
    const load = () => Promise.resolve({ ok: true as const, input: schemaInput(LIMITS.schema.cap) });
    const small = await renderReadPathLazy({ inputBytes: LIMITS.inlineRender.inputBytes }, load, { tenant: null });
    expect(small).toMatchObject({ ok: true, where: "request" });
    const large = await renderReadPathLazy({ inputBytes: LIMITS.inlineRender.inputBytes + 1 }, load, { tenant: null });
    expect(large).toMatchObject({ ok: true, where: "envelope" });
    if (!here.ok || !large.ok || !small.ok) throw new Error("not rendered");
    // From the envelope: the same text, as transferred bytes.
    expect(large.texts.every((t) => t instanceof Uint8Array)).toBe(true);
    expect(large.texts.map(asText)).toEqual(here.texts);
    expect(small.texts).toEqual(here.texts);
    // Its budget still stops it, wherever it renders.
    expect(await renderReadPath(schemaInput(1000), { tenant: null })).toMatchObject({ ok: false, reason: "TOO_LARGE" });
  }, 60_000);

  it("a render that meets the request thread's clock, or finds its share spent, is handed to the envelope, not refused", async () => {
    // A contract with enough in it for the writer to look at the clock while it writes.
    const compiled = compileContract(largeDescription(1, 1500));
    if (!compiled.ok) throw new Error("not compiled");
    const slice = sliceForEntitySet(compiled.ir, "T0", compiled.sourceLength);
    if (!slice.ok) throw new Error("not sliced");
    const input: RenderJobInput = {
      path: "schema",
      contract: slice.contract,
      entitySet: "T0",
      snapshotId: "snap_1",
      requestSchema: null,
      iface: { version: 1, entitySet: "T0" },
      limit: LIMITS.schema.cap,
    };
    expect(renderForRead(input).ok).toBe(true);
    // On this thread a clock that has run out stops it…
    expect(renderForRead(input, Date.now() - 60_000)).toMatchObject({ ok: false, reason: "TIME" });
    // …and with the thread's share of render time spent, the envelope renders it.
    await refilled();
    requestThreadShare(10_000);
    expect(await renderReadPath(input, { tenant: null })).toMatchObject({ ok: true, where: "envelope" });
  }, 60_000);

  it("what a render is handed is measured before it is copied: past the bound it never reaches a worker, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const input: RenderJobInput = {
      path: "kit",
      iface: { id: "if_1", name: "x", externalId: "custom:/x", sapProduct: "s4hana", operation: "READ", entitySet: "X", version: 1, solutionName: "S" },
      baseUrl: "https://x",
      fixtures: [{ scenario: "success", status: 200, body: { value: "x".repeat(LIMITS.renderInput.bytes) }, sourceStatus: 200, capturedAt: "2026-10-01T00:00:00.000Z" }],
      withheld: [],
      limit: LIMITS.kit.cap,
    };
    const before = envelopeIsolates().live;
    const started = Date.now();
    // Its own reason — what it was handed — never the output's budget.
    expect(await renderReadPath(input, { tenant: null })).toMatchObject({ ok: false, reason: "INPUT_TOO_LARGE" });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(envelopeIsolates().peak).toBe(before);
  });

  it("renders have slots of their own: a read is not refused behind every compile, and waits only for an isolate", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const slow = { kind: "compile" as const, input: { body: largeDescription(300, 110), entitySet: "T1", subject: null } };
    // Two other organisations' compiles hold both compile slots — and, the instance's isolates
    // being shared since round 4 (envelopeIsolateSlots), the isolates they need.
    const compiles = ["org_b", "org_c"].map((tenant) =>
      runInEnvelope(slow, { ...ENVELOPE_LIMITS.compile, deadlineMs: 600_000 }, { tenant }),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(envelopeQueueState("compile").running).toBe(ENVELOPE_CONCURRENCY);
    const r = await renderReadPathLazy({ inputBytes: null }, () => Promise.resolve({ ok: true as const, input: schemaInput(LIMITS.schema.cap) }), {
      tenant: "org_a",
    });
    // Its render slot was its own; it waited for an isolate, and was served.
    expect(r).toMatchObject({ ok: true, where: "envelope" });
    await Promise.all(compiles);
    expect(envelopeQueueState("render")).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
    expect(envelopeQueueState("isolate")).toEqual({ running: 0, waiting: 0, runningByTenant: {} });
  }, 300_000);

  it("rendered text is spliced in verbatim: the answer is what JSON.stringify writes of the value", () => {
    const value = { a: [1, "two", { three: null }], b: "\u0000raw:not-a-slot:0\u0000" };
    const raw = new RawJson();
    const out = raw.stringify({ data: { x: raw.slot(JSON.stringify(value)), y: raw.slot("null"), name: "\u0000raw:guess:1\u0000" } });
    expect(out).toBe(JSON.stringify({ data: { x: value, y: null, name: "\u0000raw:guess:1\u0000" } }));
    expect(JSON.parse(out)).toEqual({ data: { x: value, y: null, name: "\u0000raw:guess:1\u0000" } });
    // A slot of bytes (a worker's, transferred) is written as it is: the same answer, as UTF-8.
    const bytes = new RawJson();
    const answer = bytes.bytes({ data: { x: bytes.slot(new TextEncoder().encode(JSON.stringify(value))), é: "ü" } });
    expect(new TextDecoder().decode(answer)).toBe(JSON.stringify({ data: { x: value, é: "ü" } }));
  });
});
