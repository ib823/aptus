// @vitest-environment node
/**
 * THE CONTRACT COMPILER'S ONE GATE (P1.3, lib/contracts/envelope.ts), and the
 * verify's fetch gate in front of it (service-verify.ts).
 *
 *   slots          COREEDGE_CONTRACT_ISOLATES workers at once (default 1; 0
 *                  turns the compiler off);
 *   fairness       per organisation one running and three waiting, 32
 *                  waiting in all, a freed slot to the organisation served
 *                  least recently — so a fresh organisation waits behind at
 *                  most one job per other organisation;
 *   slot first     a job's inputs are loaded only once it holds its slot;
 *   deadlines      a waiter leaves the queue when its wait ends, and the
 *                  caller's deadline bounds the wait and the run together;
 *   fetch gate     at most three verifies of one organisation, and sixteen
 *                  of the process, in flight, with no queue.
 *
 * Most cases hold the gate with a loader that waits (a job holds its slot
 * while its inputs load), so they need no worker and assert on order, not on
 * wall-clock time.
 */

import { readFileSync } from "fs";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

const time = vi.hoisted(() => ({ check: vi.fn(async () => ({ ok: true as const })), charge: vi.fn(async () => {}) }));
vi.mock("@/lib/contracts/contract-time", () => ({ checkContractTime: time.check, chargeContractTime: time.charge }));

import {
  CONTRACT_JOB_LIMITS,
  ContractGate,
  contractGateState,
  contractIsolates,
  envelopeIsolates,
  GATE,
  heapLimitBytes,
  runContractJob,
  runJobInEnvelope,
} from "@/lib/contracts/envelope";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { FETCH_GATE, verifyServiceMetadata } from "@/lib/studio/service-verify";

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const FIXTURES = path.resolve(__dirname, "../../fixtures/contracts/edmx");
const description = readFileSync(path.join(FIXTURES, "business-partner.v2.xml"), "utf8");
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A loader that holds the job's slot until released, then declines the job (no worker). */
function holding() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const load = vi.fn(async () => {
    await released;
    return null;
  });
  return { load, release };
}

describe("dispatch: the organisation served least recently", () => {
  it("organisations A and B loop long jobs; a fresh organisation C starts after at most one job", async () => {
    const gate = new ContractGate(() => 1);
    const started: string[] = [];
    const releases: (() => void)[] = [];
    const job = (org: string) =>
      gate.acquire(org, 60_000).then((release) => {
        if (!release) throw new Error(`${org} refused`);
        started.push(org);
        releases.push(release);
      });
    // A takes the slot; A and B each keep three more waiting, as a loop of verifies does.
    const jobs = [job("A"), job("A"), job("A"), job("A"), job("B"), job("B"), job("B")];
    await tick();
    expect(started).toEqual(["A"]);
    releases.shift()!();
    await tick();
    // B, never served, before A's next.
    expect(started).toEqual(["A", "B"]);
    // C arrives while B runs, behind A's three and B's two waiting jobs.
    jobs.push(job("C"));
    await tick();
    releases.shift()!();
    await tick();
    // C next: one job (B's) ran between its arrival and its start.
    expect(started).toEqual(["A", "B", "C"]);
    // Then A and B alternate, first in first out within each.
    while (releases.length > 0) {
      releases.shift()!();
      await tick();
    }
    await Promise.all(jobs);
    expect(started).toEqual(["A", "B", "C", "A", "B", "A", "B", "A"]);
    expect(gate.state()).toEqual({ running: 0, waiting: 0, runningByOrg: {} });
  });

  it("one organisation runs one job at a time even with slots free; another organisation takes the free slot", async () => {
    const gate = new ContractGate(() => 2);
    const a1 = await gate.acquire("A", 60_000);
    const a2 = gate.acquire("A", 60_000);
    const b1 = await gate.acquire("B", 60_000);
    expect(b1).not.toBeNull();
    expect(gate.state()).toEqual({ running: 2, waiting: 1, runningByOrg: { A: 1, B: 1 } });
    a1!();
    const release = await a2;
    expect(release).not.toBeNull();
    release!();
    b1!();
    expect(gate.state()).toEqual({ running: 0, waiting: 0, runningByOrg: {} });
  });
});

describe("the gate's bounds, before anything is loaded", () => {
  it("an organisation's 5th job is BUSY at once, its inputs never loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = holding();
    const running = runContractJob("render", first.load, { tenant: "org_five" });
    await tick();
    const waiting = Array.from({ length: GATE.perOrgWaiting }, () => holding());
    const queued = waiting.map((h) => runContractJob("render", h.load, { tenant: "org_five" }));
    await tick();
    const fifth = vi.fn(async () => null);
    const startedAt = Date.now();
    expect(await runContractJob("render", fifth, { tenant: "org_five" })).toMatchObject({ ok: false, reason: "BUSY" });
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(fifth).not.toHaveBeenCalled();
    // Waiting, the other three have loaded nothing either.
    for (const h of waiting) expect(h.load).not.toHaveBeenCalled();
    first.release();
    for (const h of waiting) h.release();
    await Promise.all([running, ...queued]);
    expect(contractGateState()).toEqual({ running: 0, waiting: 0, runningByOrg: {} });
  });

  it("the 33rd waiter of the process is BUSY at once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = holding();
    const running = runContractJob("render", first.load, { tenant: null });
    await tick();
    const waiting = Array.from({ length: GATE.maxWaiting }, () => holding());
    const queued = waiting.map((h) => runContractJob("render", h.load, { tenant: null }));
    await tick();
    expect(contractGateState()).toMatchObject({ running: 1, waiting: GATE.maxWaiting });
    const extra = vi.fn(async () => null);
    expect(await runContractJob("render", extra, { tenant: null })).toMatchObject({ ok: false, reason: "BUSY" });
    expect(extra).not.toHaveBeenCalled();
    first.release();
    for (const h of waiting) h.release();
    await Promise.all([running, ...queued]);
  });

  it("a waiter whose wait ends leaves the queue at once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = holding();
    const running = runContractJob("render", first.load, { tenant: "org_holder" });
    await tick();
    const late = vi.fn(async () => null);
    const r = await runContractJob("render", late, { tenant: "org_late", deadlineAt: Date.now() + 150 });
    expect(r).toMatchObject({ ok: false, reason: "BUSY", cause: "request-deadline" });
    expect(late).not.toHaveBeenCalled();
    expect(contractGateState()).toMatchObject({ running: 1, waiting: 0 });
    first.release();
    await running;
  });

  it("the caller's deadline bounds the wait and the run together", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A job that would run for seconds: its run is cut at what is left of the caller's time, and it is BUSY, not RESOURCE_LIMIT.
    const big = largeDescription(400, 110);
    const startedAt = Date.now();
    const r = await runJobInEnvelope(
      { kind: "record", input: { description: big, entitySet: "T1", previous: [], unchangedHashes: [] } },
      { tenant: "org_deadline", deadlineAt: Date.now() + 400 },
    );
    expect(r).toMatchObject({ ok: false, reason: "BUSY", cause: "request-deadline" });
    // The deadline, then the worker's exit.
    expect(Date.now() - startedAt).toBeLessThan(400 + 5_000);
    // Charged the wall time it ran.
    expect(time.charge).toHaveBeenCalledWith("org_deadline", expect.any(Number));
  });

  it("live isolates never pass COREEDGE_CONTRACT_ISOLATES (1 by default)", async () => {
    expect(contractIsolates()).toBe(1);
    envelopeIsolates();
    const jobs = ["org_1", "org_2", "org_3"].map((tenant) =>
      runJobInEnvelope({ kind: "record", input: { description, entitySet: "A_Partner", previous: [], unchangedHashes: [] } }, { tenant }),
    );
    for (const r of await Promise.all(jobs)) expect(r).toMatchObject({ ok: true, value: { ok: true } });
    expect(envelopeIsolates()).toEqual({ live: 0, peak: 1 });
    expect(contractGateState()).toEqual({ running: 0, waiting: 0, runningByOrg: {} });
  });
});

describe("the compiler turned off, and the allowance, are answered before the gate", () => {
  it("COREEDGE_CONTRACT_ISOLATES=0: every job is DISABLED, nothing loaded or charged", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("COREEDGE_CONTRACT_ISOLATES", "0");
    const load = vi.fn(async () => null);
    expect(await runContractJob("render", load, { tenant: "org_off" })).toMatchObject({ ok: false, reason: "DISABLED" });
    expect(load).not.toHaveBeenCalled();
    expect(time.check).not.toHaveBeenCalledWith("org_off", expect.anything());
  });

  it("an organisation whose time is spent is refused with its own words and 00:00 UTC, its inputs never loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    time.check.mockResolvedValueOnce({ ok: false, detail: "your organisation has used its 40 s of contract compile time for today.", retryAfterMs: 3_600_000 } as never);
    const load = vi.fn(async () => null);
    const r = await runContractJob("render", load, { tenant: "org_spent" });
    expect(r).toMatchObject({ ok: false, reason: "ALLOWANCE", retryAfterMs: 3_600_000 });
    expect(r && !r.ok && r.detail).toContain("40 s of contract compile time");
    expect(load).not.toHaveBeenCalled();
  });
});

describe("the instance's memory", () => {
  it("the server, the isolates at their caps and every in-flight description fit a 2 GB Hobby function", () => {
    const MiB = 1024 * 1024;
    // A worker's heap cap (old + young generation) and its own code and buffers: 402-472 MB of RSS measured.
    const perIsolateMb = heapLimitBytes(CONTRACT_JOB_LIMITS) / MiB + 48;
    expect(perIsolateMb).toBeLessThanOrEqual(544);
    // The server (617 MB measured), the isolates, and FETCH_GATE.perProcess descriptions of 8 MiB (16 MiB as UTF-16).
    expect(768 + contractIsolates() * 544 + FETCH_GATE.perProcess * 16).toBeLessThanOrEqual(2048);
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
  timeoutMs: 4000,
  environment: "DEV",
  client: "100",
} as unknown as ResolvedSapConnection;

const ONE_SET =
  '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">' +
  '<edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="NS" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="TType"><Key><PropertyRef Name="Id"/></Key><Property Name="Id" Type="Edm.String" Nullable="false"/></EntityType>' +
  '<EntityContainer Name="C" m:IsDefaultEntityContainer="true"><EntitySet Name="T" EntityType="NS.TType"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>';
const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/xml" } });

describe("the verify's fetch gate: no queue, before SAP is asked", () => {
  it("a 4th concurrent verify of one organisation is BUSY with no SAP fetch, while another organisation proceeds", async () => {
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const slow = vi.fn(async () => {
      await answered;
      return xml(ONE_SET);
    });
    const verify = (organizationId: string, fetchImpl: unknown) =>
      verifyServiceMetadata(
        { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_SRV", declaredVersion: "V2", entitySet: "T", organizationId },
        fetchImpl as typeof fetch,
      );
    const three = Array.from({ length: FETCH_GATE.perOrganization }, () => verify("org_burst", slow));
    await tick();
    expect(slow).toHaveBeenCalledTimes(FETCH_GATE.perOrganization);
    const fourthFetch = vi.fn(async () => xml(ONE_SET));
    const fourth = await verify("org_burst", fourthFetch);
    expect(fourth).toMatchObject({ status: "BUSY", verified: false, httpStatus: null, entitySets: [], auditStatus: 429 });
    expect(fourthFetch).not.toHaveBeenCalled();
    // Another organisation is not behind them.
    const other = await verify("org_other", vi.fn(async () => xml(ONE_SET)));
    expect(other).toMatchObject({ status: "OK", verified: true });
    answer();
    for (const r of await Promise.all(three)) expect(r).toMatchObject({ status: "OK", verified: true });
    // Out of the gate again: the next one is fetched.
    expect(await verify("org_burst", vi.fn(async () => xml(ONE_SET)))).toMatchObject({ status: "OK" });
  });

  it("a hung SAP holds one of an organisation's three, and a teammate's verify of a healthy system proceeds", async () => {
    const hung = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const first = verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_ONE_SRV", declaredVersion: "V2", entitySet: "T", organizationId: "org_team" },
      hung as unknown as typeof fetch,
    );
    await tick();
    const healthy = vi.fn(async () => xml(ONE_SET));
    const second = await verifyServiceMetadata(
      { connection: CONNECTION, servicePath: "/sap/opu/odata/sap/Z_TWO_SRV", declaredVersion: "V2", entitySet: "T", organizationId: "org_team" },
      healthy as unknown as typeof fetch,
    );
    expect(second).toMatchObject({ status: "OK", verified: true });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect((await first).status).toBe("TIMEOUT");
  });
});

/** A V2 description of `types` entity types of `props` properties each: seconds to compile at 400 × 110. */
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
