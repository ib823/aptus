// @vitest-environment node
/**
 * STRUCTURAL HARDENING, ROUND 5 (P1.3): the envelope's own resources, over
 * time and across the instance, bounded by construction —
 *
 *   the allowance    an organisation's worker time over the hour and the
 *                    day, and the deployment's over the day, charged as it
 *                    is used: past it a job is refused BUSY before any slot,
 *                    and a verify answers with its contract NOT_COMPILED,
 *                    while another organisation's compile runs;
 *   the CPUs         the isolates live at once leave the request thread a
 *                    CPU: one on a one- or two-CPU instance;
 *   the verdict      whether a contract renders "in time" at record time is
 *                    read on its worker's CPU clock, so it is the same on a
 *                    busy instance as on an idle one;
 *   what crosses     a compile's prepared contract, and a diff's stored
 *                    changes, come back as their text — never as an object
 *                    graph rebuilt on the request thread.
 *
 * Their PostgreSQL halves are tests/integration/hardening-round5.test.ts.
 */

import os from "node:os";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compileContract } from "@/lib/contracts/compile";
import {
  ALLOWANCE_CAUSE,
  compileInEnvelope,
  envelopeIsolateSlots,
  instanceCpus,
  runInEnvelope,
} from "@/lib/contracts/envelope";
import {
  chargeEnvelopeAllowance,
  ENVELOPE_ALLOWANCE,
  envelopeAllowanceLimits,
  memoryAllowanceStore,
  setEnvelopeAllowanceForTest,
} from "@/lib/contracts/envelope-allowance";
import type { InterfaceContract } from "@/lib/contracts/ir";
import { prepareContract, renderAndMeasure } from "@/lib/contracts/pipeline";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { isJsonTextRef, jsonTextOf } from "@/lib/contracts/render-input";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

vi.setConfig({ testTimeout: 120_000 });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setEnvelopeAllowanceForTest(null);
});

const FIXTURES = path.resolve(__dirname, "../../fixtures/contracts/edmx");
const PARTNER = readFileSync(path.join(FIXTURES, "business-partner.v2.xml"), "utf8");

function sliced(file: string, set: string): InterfaceContract {
  const r = compileContract(readFileSync(path.join(FIXTURES, file), "utf8"));
  if (!r.ok) throw new Error(r.detail);
  const s = sliceForEntitySet(r.ir, set, r.sourceLength);
  if (!s.ok) throw new Error(s.detail);
  return s.contract;
}

/** A store and a clock the test owns, and an allowance sized in seconds (the deployment's variables). */
function ownAllowance(seconds: { hour: number; day: number; deployment: number }) {
  vi.stubEnv("COREEDGE_ENVELOPE_TENANT_SECONDS_PER_HOUR", String(seconds.hour));
  vi.stubEnv("COREEDGE_ENVELOPE_TENANT_SECONDS_PER_DAY", String(seconds.day));
  vi.stubEnv("COREEDGE_ENVELOPE_DEPLOYMENT_SECONDS_PER_DAY", String(seconds.deployment));
  const clock = { now: Date.UTC(2026, 9, 21, 10, 0, 0) };
  const store = memoryAllowanceStore(() => clock.now);
  setEnvelopeAllowanceForTest({ store, clock: () => clock.now });
  return { clock, store };
}

const windowKeys = (tenant: string, at: number) => [
  `coreedge:envelope:time:t:${tenant}:h:${Math.floor(at / 3_600_000)}`,
  `coreedge:envelope:time:t:${tenant}:d:${Math.floor(at / 86_400_000)}`,
  `coreedge:envelope:time:all:d:${Math.floor(at / 86_400_000)}`,
];

describe("the envelope's allowance: an organisation's worker time over the hour and the day", () => {
  it("is sized to keep a deployment inside a fraction of a metered plan, and read from the deployment's variables", () => {
    vi.stubEnv("COREEDGE_ENVELOPE_TENANT_SECONDS_PER_HOUR", "");
    vi.stubEnv("COREEDGE_ENVELOPE_TENANT_SECONDS_PER_DAY", "");
    vi.stubEnv("COREEDGE_ENVELOPE_DEPLOYMENT_SECONDS_PER_DAY", "");
    expect(envelopeAllowanceLimits()).toEqual(ENVELOPE_ALLOWANCE);
    // A Hobby plan's Active CPU is 4 CPU-hours a month: the envelope's whole deployment at most a quarter of it.
    expect((ENVELOPE_ALLOWANCE.deploymentDayMs * 31) / 3_600_000).toBeLessThanOrEqual(1);
    // One organisation cannot spend the deployment's day alone.
    expect(ENVELOPE_ALLOWANCE.tenantDayMs).toBeLessThan(ENVELOPE_ALLOWANCE.deploymentDayMs);
    vi.stubEnv("COREEDGE_ENVELOPE_TENANT_SECONDS_PER_HOUR", "90");
    expect(envelopeAllowanceLimits().tenantHourMs).toBe(90_000);
  });

  it("charges each job's worker time to its organisation's hour and day, and the deployment's day", async () => {
    const { clock, store } = ownAllowance({ hour: 3600, day: 3600, deployment: 3600 });
    const r = await runInEnvelope({ kind: "compile", input: { body: PARTNER, entitySet: "A_Partner", subject: null } }, undefined, { tenant: "org_meter" });
    expect(r.ok).toBe(true);
    // Charged when the job ended (asynchronously): its thread's CPU time, more than nothing.
    await vi.waitFor(async () => expect((await store.spent(windowKeys("org_meter", clock.now)))[0]).toBeGreaterThan(0));
    const [hour, day, deployment] = await store.spent(windowKeys("org_meter", clock.now));
    expect(day).toBe(hour);
    expect(deployment).toBe(hour);
    // A job with no organisation (a test, a script) is outside the allowance.
    await runInEnvelope({ kind: "compile", input: { body: PARTNER, entitySet: "A_Partner", subject: null } });
    expect((await store.spent(windowKeys("org_meter", clock.now)))[2]).toBe(deployment);
  });

  it("a builder who has spent the hour gets BUSY — the verify's contract NOT_COMPILED — while another organisation's compile runs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { clock } = ownAllowance({ hour: 60, day: 120, deployment: 300 });
    // The hostile builder's loop of verifies has used its hour.
    await chargeEnvelopeAllowance("org_hostile", 60_000);

    const hostile = await compileInEnvelope(PARTNER, "A_Partner", null, "org_hostile");
    expect(hostile).toMatchObject({ ok: false, reason: "BUSY" });
    if (hostile.ok) throw new Error("compiled");
    expect(hostile.detail).toMatch(/This organisation has used all the contract compiler's time it may use this hour/);
    expect(hostile.detail).toMatch(/available again in about 60 minutes/);
    // The verify still answers; its contract is what is refused.
    const outcome = await recordVerifiedContract({
      scope: tenantScopeOf("org_hostile"),
      iface: { id: "if_h", version: 1, externalId: "API_BUSINESS_PARTNER", entitySet: "A_Partner", operation: "READ", mode: "READ" },
      compiled: hostile,
      environment: "DEV",
      connectionId: "conn",
      actorId: "u1",
    });
    expect(outcome).toMatchObject({ status: "NOT_COMPILED" });

    // Another organisation is untouched.
    const other = await compileInEnvelope(PARTNER, "A_Partner", null, "org_other");
    expect(other).toMatchObject({ ok: true, dataset: { ok: true } });

    // Refused before any slot or worker: the refusal's cause is the allowance.
    const r = await runInEnvelope({ kind: "compile", input: { body: PARTNER, entitySet: null, subject: null } }, undefined, { tenant: "org_hostile" });
    expect(r).toMatchObject({ ok: false, reason: "BUSY", cause: ALLOWANCE_CAUSE });

    // The next hour, it compiles again — until its day is spent too.
    clock.now += 3_600_000;
    expect(await compileInEnvelope(PARTNER, "A_Partner", null, "org_hostile")).toMatchObject({ ok: true });
    await chargeEnvelopeAllowance("org_hostile", 60_000);
    clock.now += 3_600_000;
    const dayOver = await compileInEnvelope(PARTNER, "A_Partner", null, "org_hostile");
    expect(dayOver).toMatchObject({ ok: false, reason: "BUSY" });
    expect(!dayOver.ok && dayOver.detail).toMatch(/may use this day/);
  });

  it("the deployment's day bounds every organisation together", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    ownAllowance({ hour: 60, day: 120, deployment: 100 });
    await chargeEnvelopeAllowance("org_1", 50_000);
    await chargeEnvelopeAllowance("org_2", 50_000);
    const third = await compileInEnvelope(PARTNER, "A_Partner", null, "org_3");
    expect(third).toMatchObject({ ok: false, reason: "BUSY" });
    expect(!third.ok && third.detail).toMatch(/used all the time it may use today on this deployment/);
  });
});

describe("the instance's CPUs: the isolates leave the request thread one", () => {
  it("a one- or two-CPU instance runs one isolate at a time; more CPUs, what the memory holds", () => {
    vi.stubEnv("COREEDGE_INSTANCE_MEMORY_MB", "8192");
    vi.stubEnv("COREEDGE_INSTANCE_CPUS", "1");
    expect(instanceCpus()).toBe(1);
    expect(envelopeIsolateSlots()).toBe(1);
    vi.stubEnv("COREEDGE_INSTANCE_CPUS", "2");
    expect(envelopeIsolateSlots()).toBe(1);
    vi.stubEnv("COREEDGE_INSTANCE_CPUS", "3");
    expect(envelopeIsolateSlots()).toBe(2);
    // Unset: what Node reports.
    vi.stubEnv("COREEDGE_INSTANCE_CPUS", "");
    vi.spyOn(os, "availableParallelism").mockReturnValue(1);
    expect(envelopeIsolateSlots()).toBe(1);
    vi.spyOn(os, "availableParallelism").mockReturnValue(16);
    // The 2 GB Hobby instance's memory still holds two.
    vi.stubEnv("COREEDGE_INSTANCE_MEMORY_MB", "");
    expect(envelopeIsolateSlots()).toBe(2);
  });
});

describe("the record's render-time verdict is read on CPU time", () => {
  it("a contract renders in time however far the wall clock moves while it does (another tenant's load)", () => {
    const c = sliced("sales-order-rap.v4.xml", "SalesOrder");
    // The instance is busy: every look at the wall clock finds ten more seconds gone.
    let wall = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => (wall += 10_000));
    expect(() => renderAndMeasure(c, 50_000, null)).not.toThrow();
    const p = prepareContract({ contract: c, subject: null });
    expect(p).toMatchObject({ ok: true });
  });
});

describe("what crosses back from the worker is text", () => {
  it("a compile's prepared contract is its JSON text, beside the facts the record needs", async () => {
    const r = await compileInEnvelope(PARTNER, "A_Partner", null, null);
    if (!r.ok || !r.dataset?.ok) throw new Error("not compiled");
    expect(isJsonTextRef(r.dataset.contract)).toBe(true);
    const parsed = JSON.parse(jsonTextOf(r.dataset.contract)) as InterfaceContract;
    expect(parsed.entitySet.name).toBe("A_Partner");
    expect(r.dataset.facts).toMatchObject({ source: "METADATA", odataVersion: "V2", irVersion: parsed.irVersion });
  });

  it("a diff's stored changes are their JSON text, beside its bump and its headline", async () => {
    const a = sliced("sales-order-rap.v4.xml", "SalesOrder");
    const b: InterfaceContract = { ...a, entityType: { ...a.entityType, properties: a.entityType.properties.slice(1) } };
    const r = await runInEnvelope({ kind: "diff", input: { previous: [a], next: b } });
    if (!r.ok) throw new Error(r.reason);
    const [d] = r.value;
    expect(d!.bump).toBe("major");
    expect(isJsonTextRef(d!.stored)).toBe(true);
    expect((JSON.parse(jsonTextOf(d!.stored)) as { bump: string }).bump).toBe("major");
    expect(d!.headline[0]).toMatch(/removed/);
  });
});
