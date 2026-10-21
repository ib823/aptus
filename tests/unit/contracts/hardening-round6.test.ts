// @vitest-environment node
/**
 * STRUCTURAL HARDENING, ROUND 6 (P1.3): what the envelope SHARES between
 * organisations is never spent by one or two of them for everyone —
 *
 *   the deployment's day   a shared window refuses only an organisation that
 *                          has used more than its own floor of it: two
 *                          organisations at their caps leave a third's
 *                          compile running, with the real defaults;
 *   reads and compiles     read-path renders spend an allowance of their own,
 *                          never the one that gates a builder's verify, and
 *                          never the deployment's day;
 *   what is charged        a job's own work, not the start of its isolate;
 *   the verify's diff      part of the verify its compile was admitted for:
 *                          charged, never refused for the allowance after the
 *                          compile was paid for;
 *   the isolate            a job holds the instance's only isolate at most a
 *                          turn while another organisation waits for it;
 *   what a refusal says    an allowance refusal says whose time is spent and
 *                          when there is more — never "in a moment".
 *
 * The routes' halves (/schema, the kit, the solution document with the
 * allowance spent) are in routes.test.ts.
 */

import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import type * as WorkerThreads from "node:worker_threads";

import { afterEach, describe, expect, it, vi } from "vitest";

import { longestStall } from "../../helpers/stall";

import { LIMITS, schemaLimit } from "@/lib/contracts/budget";
import { contractDigest } from "@/lib/contracts/canonical";
import { compileContract } from "@/lib/contracts/compile";
import { ALLOWANCE_CAUSE, compileInEnvelope, runInEnvelope } from "@/lib/contracts/envelope";
import {
  chargeEnvelopeAllowance,
  ENVELOPE_ALLOWANCE,
  envelopeAllowanceLimits,
  memoryAllowanceStore,
  setEnvelopeAllowanceForTest,
} from "@/lib/contracts/envelope-allowance";
import type { Job, RenderJobInput } from "@/lib/contracts/pipeline";
import { renderReadPath, requestThreadShare } from "@/lib/contracts/read-render";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ snapshots: [] as Record<string, unknown>[] }));

// The record's rows, as round 4's stand-in keeps them: enough for a verify to record a contract and diff the next.
vi.mock("@/lib/db/prisma", async () => {
  const { applyJsonTextUpdate, isSnapshotSummariesQuery, jsonTextUpdateTable, snapshotSummaryRows } = await import("../../helpers/raw-sql-standin");
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([k, v]) =>
      v !== null && typeof v === "object" && "in" in (v as Row) ? ((v as { in: unknown[] }).in).includes(row[k]) : (row[k] ?? null) === v,
    );
  const newestFirst = (a: Row, b: Row) =>
    (b.semverMajor as number) - (a.semverMajor as number) || (b.semverMinor as number) - (a.semverMinor as number);
  const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k] ?? null])) : { ...row });
  return {
    prisma: {
      contractSnapshot: {
        findFirst: async ({ where, select }: { where: Row; select?: Row }) => {
          const hit = store.snapshots.filter((r) => matches(r, where)).sort(newestFirst)[0];
          return hit ? pick(hit, select) : null;
        },
        findMany: async ({ where, select, skip }: { where: Row; select?: Row; skip?: number }) =>
          store.snapshots.filter((r) => matches(r, where)).sort(newestFirst).slice(skip ?? 0).map((r) => pick(r, select)),
        create: async ({ data, select }: { data: Row; select?: Row }) => {
          const row = { id: `snap_${store.snapshots.length}`, createdAt: new Date(), ...data };
          store.snapshots.push(row);
          return pick(row, select);
        },
        deleteMany: async () => ({ count: 0 }),
      },
      interface: { update: async () => ({}), updateMany: async () => ({ count: 1 }) },
      $queryRaw: async (q: { strings?: readonly string[]; sql?: string; values?: unknown[] }) => {
        if (isSnapshotSummariesQuery(q)) return snapshotSummaryRows(store.snapshots, q);
        const [org, ...ids] = q.values ?? [];
        return store.snapshots
          .filter((r) => r.organizationId === org && ids.includes(r.id))
          .map((r) => ({ id: r.id, ir: typeof r.ir === "string" ? r.ir : JSON.stringify(r.ir) }));
      },
      $executeRaw: async (q: unknown) => (jsonTextUpdateTable(q) === "ContractSnapshot" ? applyJsonTextUpdate(store.snapshots, q) : 0),
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn((await import("@/lib/db/prisma")).prisma),
    },
  };
});

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.doUnmock("node:worker_threads");
  setEnvelopeAllowanceForTest(null);
});

const FIXTURES = path.resolve(__dirname, "../../fixtures/contracts/edmx");
const PARTNER = readFileSync(path.join(FIXTURES, "business-partner.v2.xml"), "utf8");

/** The allowance exactly as a deployment that sets nothing has it, with a store and a clock the test owns. */
function defaultAllowance() {
  for (const name of [
    "COREEDGE_ENVELOPE_TENANT_SECONDS_PER_HOUR",
    "COREEDGE_ENVELOPE_TENANT_SECONDS_PER_DAY",
    "COREEDGE_ENVELOPE_DEPLOYMENT_SECONDS_PER_DAY",
    "COREEDGE_ENVELOPE_TENANT_FLOOR_SECONDS_PER_DAY",
    "COREEDGE_ENVELOPE_READ_SECONDS_PER_HOUR",
    "COREEDGE_ENVELOPE_READ_SECONDS_PER_DAY",
  ]) {
    vi.stubEnv(name, "");
  }
  const clock = { now: Date.UTC(2026, 9, 21, 10, 0, 0) };
  const windows = memoryAllowanceStore(() => clock.now);
  setEnvelopeAllowanceForTest({ store: windows, clock: () => clock.now });
  return { clock, windows };
}

const hourOf = (at: number) => Math.floor(at / 3_600_000);
const dayOf = (at: number) => Math.floor(at / 86_400_000);
/** A compile's windows: the organisation's hour and day, and the deployment's day. */
const compileKeys = (tenant: string, at: number) => [
  `coreedge:envelope:time:t:${tenant}:h:${hourOf(at)}`,
  `coreedge:envelope:time:t:${tenant}:d:${dayOf(at)}`,
  `coreedge:envelope:time:all:d:${dayOf(at)}`,
];
/** A read's windows: the organisation's own, and nothing of the deployment's. */
const readKeys = (tenant: string, at: number) => [
  `coreedge:envelope:read:t:${tenant}:h:${hourOf(at)}`,
  `coreedge:envelope:read:t:${tenant}:d:${dayOf(at)}`,
];

/** A wide contract over the inline bound: every read of it renders in the envelope. */
function wideSchemaInput(properties: number): Extract<RenderJobInput, { path: "schema" }> {
  const props = Array.from({ length: properties }, (_, i) => `<Property Name="F${i}" Type="Edm.Decimal" Precision="9" Scale="2"/>`).join("");
  const description =
    `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" ` +
    `xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"><edmx:DataServices m:DataServiceVersion="2.0">` +
    `<Schema Namespace="S" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="WType"><Key><PropertyRef Name="F0"/></Key>${props}</EntityType>` +
    `<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="W" EntityType="S.WType"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
  const compiled = compileContract(description);
  if (!compiled.ok) throw new Error("not compiled");
  const slice = sliceForEntitySet(compiled.ir, "W", description.length);
  if (!slice.ok) throw new Error("not sliced");
  const bytes = contractDigest(slice.contract).bytes;
  return { path: "schema", contract: slice.contract, entitySet: "W", snapshotId: "snap_w", requestSchema: null, iface: { version: 1, entitySet: "W" }, limit: schemaLimit(bytes) };
}

describe("the deployment's day: a shared window never refuses an organisation inside its own floor", () => {
  it("with the real defaults, two organisations at their caps leave a third organisation's compile running", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    defaultAllowance();
    expect(envelopeAllowanceLimits()).toEqual(ENVELOPE_ALLOWANCE);
    // Two organisations spend their whole day: together more than the deployment's.
    await chargeEnvelopeAllowance("org_cap_1", ENVELOPE_ALLOWANCE.tenantDayMs);
    await chargeEnvelopeAllowance("org_cap_2", ENVELOPE_ALLOWANCE.tenantDayMs);
    expect(2 * ENVELOPE_ALLOWANCE.tenantDayMs).toBeGreaterThan(ENVELOPE_ALLOWANCE.deploymentDayMs);

    // A third, which has used nothing, compiles.
    expect(await compileInEnvelope(PARTNER, "A_Partner", null, "org_victim")).toMatchObject({ ok: true, dataset: { ok: true } });
    // The two that spent it are refused for their own day.
    const capped = await compileInEnvelope(PARTNER, "A_Partner", null, "org_cap_1");
    expect(capped).toMatchObject({ ok: false, reason: "BUSY" });
    expect(!capped.ok && capped.detail).toMatch(/This organisation has used all the contract compiler's time it may use this day/);
    // And one past its floor of the spent deployment day is refused for the deployment's.
    await chargeEnvelopeAllowance("org_heavy", ENVELOPE_ALLOWANCE.tenantFloorDayMs);
    const heavy = await compileInEnvelope(PARTNER, "A_Partner", null, "org_heavy");
    expect(heavy).toMatchObject({ ok: false, reason: "BUSY" });
    expect(!heavy.ok && heavy.detail).toMatch(/today on this deployment/);
  });

  it("a floor is a real day's work: well over a hundred verifies of a real service for each organisation", () => {
    // A real verify's compile and diff, charged for their own work (below), cost tens of milliseconds.
    expect(ENVELOPE_ALLOWANCE.tenantFloorDayMs).toBeGreaterThanOrEqual(10_000);
    expect(ENVELOPE_ALLOWANCE.tenantFloorDayMs).toBeLessThan(ENVELOPE_ALLOWANCE.tenantDayMs);
  });
});

describe("what is charged: a job's own work, not the start of its isolate", () => {
  it("a trivial job charges its own few milliseconds, not the worker's start and the compiler's load", async () => {
    const { clock, windows } = defaultAllowance();
    const quick: Job = { kind: "diff", input: { previous: [], next: wideSchemaInput(10).contract } };
    const r = await runInEnvelope(quick, undefined, { tenant: "org_charge" });
    expect(r.ok).toBe(true);
    await vi.waitFor(async () => expect((await windows.spent(compileKeys("org_charge", clock.now)))[0]).toBeGreaterThan(0));
    const [hour] = await windows.spent(compileKeys("org_charge", clock.now));
    // From source, the worker's start (tsx loading the compiler) is hundreds of ms of CPU; the diff itself, a few.
    expect(hour).toBeLessThan(100);
  });
});

describe("reads and compiles: a read-path render spends an allowance of its own", () => {
  it("a large read charges the organisation's read windows, never its compile windows nor the deployment's day", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { clock, windows } = defaultAllowance();
    const input = wideSchemaInput(9_000);
    expect(JSON.stringify(input.contract).length).toBeGreaterThan(LIMITS.inlineRender.inputBytes);
    const r = await renderReadPath(input, { tenant: "org_reader" });
    expect(r).toMatchObject({ ok: true, where: "envelope" });
    await vi.waitFor(async () => expect((await windows.spent(readKeys("org_reader", clock.now)))[0]).toBeGreaterThan(0));
    expect(await windows.spent(compileKeys("org_reader", clock.now))).toEqual([0, 0, 0]);
  });

  it("an organisation whose consumers spent its read time still compiles; its large reads say the time is spent and when it returns", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    defaultAllowance();
    // Its northbound consumer has polled a large /schema all hour.
    await chargeEnvelopeAllowance("org_polled", ENVELOPE_ALLOWANCE.readTenantHourMs, "read");
    // Its builder's verify is untouched…
    expect(await compileInEnvelope(PARTNER, "A_Partner", null, "org_polled")).toMatchObject({ ok: true });
    // …and another organisation's compile and reads too.
    expect(await compileInEnvelope(PARTNER, "A_Partner", null, "org_other")).toMatchObject({ ok: true });
    // Its own large read is refused for the allowance, and says so: not "in a moment".
    requestThreadShare(1000, "org_polled");
    const read = await renderReadPath(wideSchemaInput(9_000), { tenant: "org_polled" });
    expect(read).toMatchObject({ ok: false, reason: "ALLOWANCE" });
    if (read.ok || read.reason !== "ALLOWANCE") throw new Error("not refused for the allowance");
    expect(read.detail).toMatch(/used all the time the contract compiler may spend rendering/);
    expect(read.detail).toMatch(/this hour/);
    expect(read.detail).toMatch(/available again in about 60 minutes/);
    expect(read.detail).not.toMatch(/in a moment/);
    expect(read.retryAfterSeconds).toBe(3600);
  });

  it("a compile refused for the allowance carries its cause and when there is more", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    defaultAllowance();
    await chargeEnvelopeAllowance("org_spent", ENVELOPE_ALLOWANCE.tenantHourMs);
    const r = await runInEnvelope({ kind: "compile", input: { body: PARTNER, entitySet: null, subject: null } }, undefined, { tenant: "org_spent" });
    expect(r).toMatchObject({ ok: false, reason: "BUSY", cause: ALLOWANCE_CAUSE, retryAfterMs: 3_600_000 });
  });
});

describe("the verify's diff is part of the verify its compile was admitted for", () => {
  it("a verify whose compile used the last of the hour still records its contract, diffed against the last one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { clock } = defaultAllowance();
    store.snapshots = [];
    const iface = { id: "if_r6", version: 1, externalId: "API_BUSINESS_PARTNER", entitySet: "A_Partner", operation: "READ", mode: "READ" } as const;
    const record = (compiled: Awaited<ReturnType<typeof compileInEnvelope>>) =>
      recordVerifiedContract({ scope: tenantScopeOf("org_last"), iface, compiled, environment: "DEV", connectionId: "conn", actorId: "u1" });

    const first = await compileInEnvelope(PARTNER, "A_Partner", null, "org_last");
    expect(await record(first)).toMatchObject({ status: "RECORDED" });

    // The next description drops a field: a major change, so the record must diff it against the first.
    const changed = PARTNER.replace(/<Property Name="ExternalRef"[^>]*\/>/, "");
    expect(changed).not.toBe(PARTNER);
    const second = await compileInEnvelope(changed, "A_Partner", null, "org_last");
    expect(second).toMatchObject({ ok: true });
    // That compile was admitted, ran, and its charge took the organisation past its hour.
    await chargeEnvelopeAllowance("org_last", ENVELOPE_ALLOWANCE.tenantHourMs);
    void clock;
    const outcome = await record(second);
    expect(outcome).toMatchObject({ status: "RECORDED" });
    expect(store.snapshots).toHaveLength(2);
  });
});

/**
 * THE ONLY ISOLATE. A worker that never answers stands for a hostile
 * description that runs to its deadline (the 8.4 MB CSDL JSON one takes 8-15
 * s); every other job runs in a real worker.
 */
const SLOW = "<!-- a description that runs until it is stopped -->";

async function envelopeWithIsolates(cpus: 1 | 4 = 1) {
  vi.resetModules();
  vi.stubEnv("COREEDGE_INSTANCE_CPUS", String(cpus));
  vi.stubEnv("COREEDGE_INSTANCE_MEMORY_MB", "2048");
  vi.stubEnv("COREEDGE_ENVELOPE_ISOLATE_TURN_MS", "1000");
  const real = await vi.importActual<typeof WorkerThreads>("node:worker_threads");
  function SlowOrRealWorker(this: unknown, src: string | URL, options: { workerData: { job: Job } }) {
    const job = options.workerData.job;
    if (!(job.kind === "compile" && job.input.body === SLOW)) return new real.Worker(src, options as never);
    const fake = new EventEmitter() as EventEmitter & { terminate: () => Promise<number> };
    let exited = false;
    fake.terminate = () => {
      if (!exited) {
        exited = true;
        setImmediate(() => fake.emit("exit", 1));
      }
      return Promise.resolve(1);
    };
    setImmediate(() => fake.emit("online"));
    return fake;
  }
  vi.doMock("node:worker_threads", () => ({ ...real, Worker: SlowOrRealWorker }));
  const envelope = await import("@/lib/contracts/envelope");
  expect(envelope.envelopeIsolateSlots()).toBe(cpus === 1 ? 1 : 2);
  return envelope;
}

describe("the stall measure the containment suites assert on: this thread's work, not a loaded machine", () => {
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

describe("the instance's only isolate: a job holds it at most a turn while another organisation waits", () => {
  it("two other organisations' long jobs ahead: a third organisation's small render and compile are still served", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const envelope = await envelopeWithIsolates();
    const long = { ...envelope.ENVELOPE_LIMITS.compile, deadlineMs: 15_000 };
    const slow: Job = { kind: "compile", input: { body: SLOW, entitySet: null, subject: null } };
    const t0 = Date.now();
    const a = envelope.runInEnvelope(slow, long, { tenant: "org_attacker" });
    await new Promise((r) => setTimeout(r, 100));
    const a2 = envelope.runInEnvelope(slow, long, { tenant: "org_attacker2" });
    await new Promise((r) => setTimeout(r, 200));
    const small: RenderJobInput = wideSchemaInput(20);
    // B's render may wait 8 s; C's verify has 11 s left. Behind the attackers' 30 s of jobs, neither would be served.
    const b = envelope.runInEnvelope({ kind: "render", input: small }, { ...envelope.ENVELOPE_LIMITS.render, deadlineMs: 8_000 }, { tenant: "org_b" });
    const c = envelope.compileInEnvelope(PARTNER, "A_Partner", null, "org_c", Date.now() + 11_000);
    const [ra, ra2, rb, rc] = await Promise.all([a, a2, b, c]);
    expect(rb).toMatchObject({ ok: true });
    expect(rc).toMatchObject({ ok: true });
    // The attackers' jobs gave up the isolate when their turn was used and another organisation waited.
    expect(ra).toMatchObject({ ok: false, reason: "BUSY", cause: envelope.ISOLATE_TURN_CAUSE });
    expect(ra2).toMatchObject({ ok: false, reason: "BUSY", cause: envelope.ISOLATE_TURN_CAUSE });
    expect(Date.now() - t0).toBeLessThan(15_000);
  }, 60_000);

  it("a long job with no other organisation waiting keeps the isolate until its own deadline", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const envelope = await envelopeWithIsolates();
    const slow: Job = { kind: "compile", input: { body: SLOW, entitySet: null, subject: null } };
    const started = Date.now();
    const r = await envelope.runInEnvelope(slow, { ...envelope.ENVELOPE_LIMITS.compile, deadlineMs: 1_500 }, { tenant: "org_alone" });
    expect(r).toMatchObject({ ok: false, reason: "RESOURCE_LIMIT", cause: "deadline" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_400);
  }, 30_000);

  it("with two isolates, two organisations' long compiles hold every compile slot: a third organisation's compile is still served", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const envelope = await envelopeWithIsolates(4);
    const long = { ...envelope.ENVELOPE_LIMITS.compile, deadlineMs: 14_000 };
    const slow: Job = { kind: "compile", input: { body: SLOW, entitySet: null, subject: null } };
    const a = envelope.runInEnvelope(slow, long, { tenant: "org_attacker" });
    const a2 = envelope.runInEnvelope(slow, long, { tenant: "org_attacker2" });
    await new Promise((r) => setTimeout(r, 200));
    // Both compile slots and both isolates are the attackers'; the victim waits for a compile slot, not an isolate.
    expect(envelope.envelopeQueueState("compile").running).toBe(2);
    const c = envelope.compileInEnvelope(PARTNER, "A_Partner", null, "org_c", Date.now() + 12_000);
    const [ra, ra2, rc] = await Promise.all([a, a2, c]);
    expect(rc).toMatchObject({ ok: true });
    // One attacker gave up its turn (and its slot) to the waiting organisation; the other, with nobody waiting, ran on.
    expect([ra, ra2].filter((r) => !r.ok && r.cause === envelope.ISOLATE_TURN_CAUSE)).toHaveLength(1);
  }, 60_000);
});
