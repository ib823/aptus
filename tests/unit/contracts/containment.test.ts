// @vitest-environment node
/**
 * STRUCTURAL CONTAINMENT of the Contract Compiler (P1.3).
 *
 * Not another shape that is expensive, but the mechanisms that bound every
 * shape, found or not:
 *
 *   the envelope   every job runs in a worker with a capped heap, a capped
 *                  stack and a deadline (envelope.ts) — and the cap holds
 *                  even in a process started with --max-old-space-size or
 *                  --max-semi-space-size, which V8 otherwise lets override a
 *                  worker's own limits; a job's slot is free only once its
 *                  worker has exited;
 *   the budget     one writer counts every byte of contract-derived output as
 *                  it is written and stops at a stated limit (budget.ts),
 *                  writing exactly what JSON.stringify wrote before.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import v8 from "node:v8";

import { afterEach, describe, expect, it, vi } from "vitest";

import { longestStall } from "../../helpers/stall";

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
import { CONTRACT_JOB_LIMITS, contractGateState, envelopeIsolates, heapLimitBytes, runJobInEnvelope } from "@/lib/contracts/envelope";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { recordableContract, textOf, type Job } from "@/lib/contracts/jobs";
import { RawJson } from "@/lib/contracts/raw-json";
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

describe("the record job's budgets", () => {
  it("a real contract's /schema texts are well inside their budget", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    const p = recordableContract(c, undefined, "SalesOrder", { previous: [], unchangedHashes: [] });
    if (!p.ok) throw new Error(p.reason);
    const total = p.texts.schemas.byteLength + (p.texts.create?.byteLength ?? 0) + (p.texts.update?.byteLength ?? 0);
    expect(total).toBeLessThan(schemaLimit(p.bytes) / 4);
  });

  it("a contract over the contract budget is refused (TOO_LARGE), with its size", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    for (let i = 0; i < 40_000; i++) c.entityType.properties.push({ name: `ZZ1_FIELD_${i}`, type: "Edm.String", nullable: true, label: "x".repeat(40) });
    const p = recordableContract(c, undefined, "SalesOrder", { previous: [], unchangedHashes: [] });
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

const record = (description: string, entitySet: string | null): Job => ({
  kind: "record",
  input: { description, entitySet, previous: [], unchangedHashes: [] },
});

describe("the envelope", () => {
  it("compiles a real description, its dataset sliced, digested and rendered, and sends back no IR of the service", async () => {
    const r = await runJobInEnvelope(record(fixture("business-partner.v2.xml"), "A_Partner"));
    if (!r.ok || r.value === null || !("ok" in r.value) || !r.value.ok) throw new Error("not compiled");
    const v = r.value as Extract<typeof r.value, { format: string }>;
    expect(v.datasets).toMatchObject({ hasEntitySet: true, suggestion: null });
    expect(v.datasets.names).toContain("A_Partner");
    expect(v.dataset).toMatchObject({ ok: true, hash: contractDigest(sliced("business-partner.v2.xml", "A_Partner")).hash });
    // Texts crossed as transferred bytes.
    expect(v.dataset?.ok && v.dataset.texts.schemas).toBeInstanceOf(Uint8Array);
    expect(JSON.parse(textOf((v.dataset as { texts: { schemas: Uint8Array<ArrayBuffer> } }).texts.schemas))).toHaveProperty("record");
    expect(Object.keys(v)).not.toContain("ir");
  }, 30_000);

  it("a job that needs more heap than its cap ends its own worker (RESOURCE_LIMIT), whatever the process's own flag", async () => {
    // As in a process started with NODE_OPTIONS=--max-old-space-size=4096:
    // V8 lets that flag override a worker's own resource limits.
    v8.setFlagsFromString("--max-old-space-size=4096");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runJobInEnvelope(record(largeDescription(300, 110), "T1"), {
      limits: { maxOldGenerationSizeMb: 16, maxYoungGenerationSizeMb: 4, stackSizeMb: 4, deadlineMs: 60_000 },
    });
    expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT" });
    // The request thread's own heap is the one it started with.
    expect(v8.getHeapStatistics().heap_size_limit).toBeGreaterThan(heapLimitBytes(CONTRACT_JOB_LIMITS));
  }, 60_000);

  it("a heap of 64 MB is a worker out of memory, never this thread's", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runJobInEnvelope(record(csdlJsonMembers(7.3 * 1024 * 1024), "Set0"), {
      limits: { ...CONTRACT_JOB_LIMITS, maxOldGenerationSizeMb: 64, deadlineMs: 60_000 },
    });
    expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT", cause: "ERR_WORKER_OUT_OF_MEMORY" });
  }, 90_000);

  it("a job past its deadline is terminated wherever it is (RESOURCE_LIMIT), and the thread is never blocked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = largeDescription(300, 110);
    const started = performance.now();
    const { value: r, ms: maxStall } = await longestStall(() => runJobInEnvelope(record(body, "T1"), { limits: { ...CONTRACT_JOB_LIMITS, deadlineMs: 300 } }));
    expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT", cause: "deadline" });
    expect(performance.now() - started).toBeLessThan(300 + 5_000);
    // The thread only waited while the worker compiled: its own CPU between ticks stayed small.
    expect(maxStall).toBeLessThan(200);
  }, 30_000);

  it("7.3 MB of CSDL JSON members ends ok or RESOURCE_LIMIT inside its deadline, while the event loop ticks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const body = csdlJsonMembers(7.3 * 1024 * 1024);
    expect(body.length).toBeGreaterThan(7 * 1024 * 1024);
    const started = performance.now();
    const { value: r, ms: maxStall } = await longestStall(() => runJobInEnvelope(record(body, "Set0")));
    // The default limits: whatever it does, it ends by its 10 s deadline (and its worker's exit).
    expect(performance.now() - started).toBeLessThan(CONTRACT_JOB_LIMITS.deadlineMs + 5_000);
    expect(r.ok || r.reason === "RESOURCE_LIMIT").toBe(true);
    expect(maxStall).toBeLessThan(200);
  }, 60_000);

  it("a job that throws is INTERNAL, never a rejected promise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runJobInEnvelope(record(7 as unknown as string, null));
    expect(r).toMatchObject({ ok: false, reason: "INTERNAL" });
  }, 30_000);

  it("compiles in a process started with --max-semi-space-size, which V8 also lets override a worker's limits", async () => {
    // As under NODE_OPTIONS="--max-semi-space-size=64": a worker otherwise gets 3 × 64 MB of young generation.
    v8.setFlagsFromString("--max-semi-space-size=64");
    try {
      const r = await runJobInEnvelope(record(fixture("business-partner.v2.xml"), "A_Partner"));
      expect(r).toMatchObject({ ok: true, value: { ok: true } });
    } finally {
      v8.setFlagsFromString("--max-semi-space-size=0");
    }
  }, 60_000);

  it("a slot is free only once its worker has exited: never more live isolates than the one slot", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    envelopeIsolates();
    const slow = record(largeDescription(300, 110), "T1");
    const quick = record(fixture("z-travel-booking.v2.xml"), "BookingSet");
    // Slots held by jobs that end at their deadline, then handed on to queued jobs that run to the end.
    const ended = Array.from({ length: 2 }, () => runJobInEnvelope(slow, { limits: { ...CONTRACT_JOB_LIMITS, deadlineMs: 500 } }));
    const queued = Array.from({ length: 2 }, () => runJobInEnvelope(quick));
    const [endedResults, queuedResults] = await Promise.all([Promise.all(ended), Promise.all(queued)]);
    for (const r of endedResults) expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT" });
    for (const r of queuedResults) expect(r.ok).toBe(true);
    // Answered only once exited: nothing awaited is still alive, and no slot outlived its isolate.
    expect(envelopeIsolates()).toEqual({ live: 0, peak: 1 });
    expect(contractGateState()).toEqual({ running: 0, waiting: 0, runningByOrg: {} });
  }, 120_000);
});

/* What a capture infers is bounded, and so is the solution document's build. */
describe("bounded inputs and builds", () => {
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

});

describe("spliced text, and the stall measure", () => {
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

  it("a thread kept off the CPU (what a loaded runner does to it) is not a stall; a loop with no await is", async () => {
    // Off the CPU for 300 ms without running: the wall-clock gap a busy machine makes.
    const parked = await longestStall(async () => {
      await new Promise((r) => setTimeout(r, 20));
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(parked.wallMs).toBeGreaterThanOrEqual(250);
    expect(parked.ms).toBeLessThan(100);
    // 300 ms of this thread's CPU in synchronous work: a real stall, however idle or busy the machine.
    const usage = (process as unknown as { threadCpuUsage: () => { user: number; system: number } }).threadCpuUsage;
    const cpu = () => {
      const u = usage.call(process);
      return (u.user + u.system) / 1000;
    };
    const busy = await longestStall(async () => {
      await new Promise((r) => setTimeout(r, 20));
      const until = cpu() + 300;
      let spin = 0;
      while (cpu() < until) spin += 1;
      expect(spin).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(busy.ms).toBeGreaterThanOrEqual(150);
  });
});

/** CSDL JSON of one entity type with as many members as fit in `chars`: the most expensive description found. */
function csdlJsonMembers(chars: number): string {
  const head = '{"$Version":"4.0","NS":{"T0":{"$Kind":"EntityType","$Key":["P0"]';
  const parts: string[] = [head];
  let n = head.length;
  for (let i = 0; n < chars - 200; i++) {
    const p = `,"P${i}":{"$Type":"Edm.String","$MaxLength":40}`;
    parts.push(p);
    n += p.length;
  }
  parts.push('},"C":{"$Kind":"EntityContainer","Set0":{"$Collection":true,"$Type":"NS.T0"}}}}');
  return parts.join("");
}
