// @vitest-environment node
/**
 * A4, tier 1: the query surface's V2 and V4 conformance suite (P1.4a, spec
 * 3.21 item 7), the gate on every PR.
 *
 * Each case (cases.ts) runs through the real /data route, on PostgreSQL with
 * the tenant guard throwing, against a strict-replay SAP on 127.0.0.1
 * (replay.ts) with real sockets, gzip and chunked bodies. Each asserts:
 *
 *   - the golden SAP request: exactly the recorded method, path, decoded
 *     query in order, and Accept and OData-MaxVersion headers, and no other
 *     request (an unrecorded one fails with a diff against the recording);
 *   - that every request as it arrived on the socket parses under the
 *     injection fuzz's independent oracle (tests/property/odata-oracle/),
 *     names only the set's fields and is percent-encoded exactly once;
 *   - the parse of SAP's answer and the exact northbound answer: status,
 *     code and rule, records, page, totalCount, the audit row's flags, and
 *     whether the circuit counted SAP's answer;
 *   - no SAP host, SAP text or replay address in anything the caller gets.
 *
 * Every recording is written for this repository (provenance
 * "spec-derived"); no SAP data is committed (D17). Tiers 2 and 3 (live,
 * secret-gated, and the operator's lab run) re-ask the same requests and
 * record verdicts only.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as RateLimit from "@/lib/security/rate-limit";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const base = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused" });
  return { prisma: base.$extends(tenantScopeGuard()) };
});
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimit>()),
  checkRateLimit: async () => ({ allowed: true, remaining: 59, resetMs: 60_000 }),
}));

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { recordJob } from "@/lib/contracts/jobs";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { loadRecordHeads } from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { __setGovernedCircuitStore } from "@/lib/governed/containment";
import { MemoryCircuitStore } from "@/lib/northbound/circuit-breaker";
import { customExternalId } from "@/lib/sap-public/service-path";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

import { parseFilter, parseKeyPredicate, parseOrderby, parseSelect } from "../../property/odata-oracle/odata";
import { splitQuery, splitUri, strictPercentDecode } from "../../property/odata-oracle/uri";
import { hostIn, removeQueryWorld, seedQueryWorld, type QueryWorld } from "../../helpers/query-world";
import { CASES, NAMED_IDS, ORACLE_TYPES, POLICIES, POLICY_SET, SAP_CLIENT, SERVICE, type ConformanceCase, type PolicyName, type Version } from "./cases";
import { startReplay, type Exchange, type Replay } from "./replay";

const RUN = `p14c-${randomUUID().slice(0, 8)}`;
const DESCRIPTION: Record<Version, string> = {
  V2: readFileSync(path.join(__dirname, "fixtures/conformance.v2.xml"), "utf8"),
  V4: readFileSync(path.join(__dirname, "fixtures/conformance.v4.xml"), "utf8"),
};
const KEYS: Record<string, string[]> = {
  Items: ["ItemId"],
  Lines: ["OrderId", "LineNo"],
  ByGuid: ["Id"],
  ByNumber: ["Num"],
  NoPaging: ["Id"],
  Effective: ["externalCode", "effectiveStartDate"],
  Drafts: ["Id", "IsActiveEntity"],
};
const DAY = 86_400_000;
const PAGE_TAIL = 8192;

let replay: Replay;
let world: QueryWorld;
let solutionId = "";
let token = "";
const interfaces = new Map<string, string>();
const store = new MemoryCircuitStore();

/** One READ interface per version and policy: the policy's source on the row, then a verify, which compiles it. */
async function interfaceFor(v: Version, name: PolicyName): Promise<string> {
  const cached = interfaces.get(`${v}:${name}`);
  if (cached) return cached;
  const { organizationId } = world;
  const externalId = customExternalId(SERVICE[v]);
  const entitySet = POLICY_SET[name];
  const row = await prisma.interface.create({
    data: {
      organizationId,
      solutionId,
      name: `${v} ${name}`,
      sapProduct: "s4hana",
      externalId,
      servicePath: SERVICE[v],
      odataVersion: v,
      entitySet,
      operation: "READ",
      mode: "READ",
      status: "ACTIVE",
      queryPolicy: POLICIES[name](v) as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true, odataVersion: true },
  });
  await prisma.apiAccessGrant.create({
    data: {
      organizationId,
      solutionId,
      externalId,
      operation: "READ",
      environment: "DEV",
      justification: "Conformance.",
      requestedById: world.userId,
      decision: "APPROVED",
      decidedById: world.userId,
      decidedAt: new Date(),
      expiresAt: new Date(Date.now() + DAY),
      interfaceId: row.id,
      sapProduct: "s4hana",
    },
  });
  const scope = tenantScopeOf(organizationId);
  const target = { ...row, entitySet };
  const heads = await loadRecordHeads(scope, target, "DEV");
  const outcome = await recordVerifiedContract({
    scope,
    iface: target,
    compiled: recordJob({ description: DESCRIPTION[v], entitySet, ...heads }),
    heads,
    environment: "DEV",
    connectionId: world.connectionId,
    actorId: world.userId,
  });
  expect(outcome, `${v} ${name}`).toMatchObject({ queryPolicy: { state: "READY" } });
  interfaces.set(`${v}:${name}`, row.id);
  return row.id;
}

/**
 * The request as it arrived parses under the oracle: one strict decode of
 * the path and of each parameter, a key predicate, $filter, $orderby and
 * $select in the v1 grammar, every name one of the set's fields.
 */
function oracleAccepts(target: string, v: Version, set: string): void {
  const uri = splitUri(`${replay.origin}${target}`);
  expect(uri.fragment).toBeNull();
  const decodedPath = strictPercentDecode(uri.path);
  const root = `${SERVICE[v]}/${set}`;
  expect(decodedPath.startsWith(root), decodedPath).toBe(true);
  const typeOf = (f: string) => ORACLE_TYPES(v)[set]?.[f];
  const rest = decodedPath.slice(root.length);
  if (rest !== "") parseKeyPredicate(rest, v, KEYS[set]!, typeOf);
  const params = splitQuery(uri.query ?? "");
  expect(params.filter(([n]) => n === "sap-client")).toEqual([["sap-client", SAP_CLIENT]]);
  expect(params.at(-1)).toEqual(["sap-client", SAP_CLIENT]);
  for (const [name, value] of params) {
    switch (name) {
      case "$filter":
        parseFilter(value, v, typeOf);
        break;
      case "$orderby":
        for (const t of parseOrderby(value)) expect(typeOf(t.f), t.f).toBeDefined();
        break;
      case "$select":
        for (const f of parseSelect(value)) expect(typeOf(f), f).toBeDefined();
        break;
      case "$top":
      case "$skip":
        expect(value).toMatch(/^[0-9]+$/);
        break;
      default:
        expect(["$format", "$inlinecount", "$count", "sap-client"]).toContain(name);
    }
  }
}

/** Fill in what a recording can only know from the previous page: where it was cut, and the $top asked next (3.9.5, 3.9.6). */
function resolved(exchanges: readonly Exchange[], previous: { records: Record<string, unknown>[] } | null, c: ConformanceCase): Exchange[] {
  return exchanges.map((e) => {
    if (!e.request.query.some(([, value]) => value.startsWith("<"))) return e;
    const records = previous!.records;
    const k = records.length;
    const bytes = records.reduce((sum, r, i) => sum + Buffer.byteLength(JSON.stringify(r)) + (i > 0 ? 1 : 0), 0);
    const rb = Math.max(1, Math.round(bytes / k));
    const policy = POLICIES[c.policy](c.odata);
    const eff = Math.min(200, policy.page.rowCap - k);
    const top = Math.max(1, Math.min(eff, Math.floor((0.9 * (Math.min(policy.page.byteCap, 4_000_000) - PAGE_TAIL)) / rb)));
    return {
      ...e,
      request: {
        ...e.request,
        query: e.request.query.map(([n, value]) => [n, value === "<cut>" ? String(k) : value === "<adaptive>" ? String(top + 1) : value] as const),
      },
    };
  });
}

type Body = {
  data?: { records: Record<string, unknown>[]; page?: Record<string, unknown> & { nextCursor: string | null }; totalCount?: number | null };
  error?: { code: string; message: string; query?: { rule: string } };
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("A4 tier 1: the query surface's V2 and V4 conformance (P1.4a)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "e".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
    __setGovernedCircuitStore(store);
    replay = await startReplay();
    world = await seedQueryWorld(RUN, replay.origin, SAP_CLIENT);
    const { organizationId } = world;
    solutionId = (
      await prisma.solution.create({
        data: { organizationId, name: "Conformance", slug: `${RUN}-c`, classification: "CLIENT_APP", businessProblem: "Conformance.", dataClass: "INTERNAL", status: "ACTIVE" },
        select: { id: true },
      })
    ).id;
    const { hashClientToken } = await import("@/lib/northbound/auth");
    token = `ce_test_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
    await prisma.solutionClient.create({
      data: { organizationId, solutionId, label: "Conformance DEV", tokenHash: hashClientToken(token), tokenPrefix: "ce_test_", environment: "DEV", createdById: world.userId, expiresAt: new Date(Date.now() + DAY) },
    });
  }, 120_000);

  afterAll(async () => {
    __setGovernedCircuitStore(null);
    vi.unstubAllEnvs();
    if (world) await removeQueryWorld(world);
    if (replay) await replay.close();
  });

  it("names every case of the spec's table, on each version it applies to, and marks its provenance", () => {
    const ids = new Set(CASES.map((c) => c.id));
    expect(ids.size).toBe(CASES.length);
    for (const named of NAMED_IDS) {
      // A name that carries its version (V2-…, V4-…, V2SF-…, E-V2-…, E-V4-…, E-V401-…) is one case; any other is one per version.
      const wanted = /^(V[24](SF)?-|E-V(2|4|401)-)/.test(named) ? [named] : [`V2-${named}`, `V4-${named}`];
      expect(wanted.filter((id) => !ids.has(id)), named).toEqual([]);
    }
    for (const c of CASES) expect(c.provenance).toMatch(/^(spec-derived|live-verdict:\d{4}-\d{2}-\d{2})$/);
  });

  it("the replay refuses a request that differs from its recording, with a diff, and the case would fail", async () => {
    const c = CASES.find((x) => x.id === "V2-L-STRING-QUOTE")!;
    const id = await interfaceFor(c.odata, c.policy);
    const recorded = c.steps[0]!.exchanges[0]!;
    // The same recording, but for a quote SAP would read wrongly: not doubled.
    replay.expect([{ ...recorded, request: { ...recorded.request, query: recorded.request.query.map(([n, value]) => [n, value.replace("''", "'")] as const) } }]);
    const res = await readRoute(
      new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data?${c.steps[0]!.query}`, { headers: { authorization: `Bearer ${token}` } }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(502);
    expect(replay.mismatches).toHaveLength(1);
    expect(replay.mismatches[0]).toContain(`query[0]: got ["$filter","Name eq 'O''Neil'"], want ["$filter","Name eq 'O'Neil'"]`);
    expect(replay.pending()).toBe(1);
  });

  it.each(CASES.map((c) => [c.id, c] as const))("%s", async (_id, c) => {
    const id = await interfaceFor(c.odata, c.policy);
    store.clear();
    let previous: { records: Record<string, unknown>[] } | null = null;
    let cursor: string | null = null;
    for (const [i, step] of c.steps.entries()) {
      const exchanges = resolved(step.exchanges, previous, c);
      replay.expect(exchanges);
      const qs = step.next ? `${step.query}&cursor=${cursor}` : step.query;
      const res = await readRoute(
        new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data?${qs}`, { headers: { authorization: `Bearer ${token}` } }),
        { params: Promise.resolve({ id }) },
      );
      const text = await res.text();
      const body = JSON.parse(text) as Body;
      const label = `${c.id} step ${i}`;

      // The golden SAP request, and nothing else.
      expect(replay.mismatches, label).toEqual([]);
      expect(replay.pending(), label).toBe(0);
      expect(replay.received.length, label).toBe(exchanges.length);
      if (!c.legacy) for (const r of replay.received) oracleAccepts(r.target, c.odata, POLICY_SET[c.policy]);

      // The northbound answer.
      const e = step.expect;
      expect(res.status, `${label}: ${text.slice(0, 300)}`).toBe(e.status);
      if (e.code !== undefined) expect(body.error?.code, label).toBe(e.code);
      if (e.rule !== undefined) expect(body.error?.query?.rule, label).toBe(e.rule);
      if (e.records !== undefined) expect(body.data?.records, label).toEqual(e.records);
      if (e.page !== undefined) expect(body.data?.page, label).toMatchObject(e.page);
      if (e.totalCount !== undefined) expect(body.data?.totalCount, label).toBe(e.totalCount);
      if (e.hasPage === false) expect(body.data, label).not.toHaveProperty("page");
      if (e.flags !== undefined) {
        const row = await prisma.northboundAuditEvent.findFirst({ where: { organizationId: world.organizationId, correlationId: res.headers.get("x-correlation-id")! } });
        expect(row?.queryFlags ?? null, label).toBe(e.flags);
      }
      if (e.circuit !== undefined) {
        const raw = await store.read(`connection:${world.connectionId}`);
        // The breaker's record: [state, consecutiveFailures, …] (circuit-breaker.ts serialise).
        const failures = raw === null ? 0 : (JSON.parse(raw) as [string, number])[1];
        expect(failures > 0 ? "counted" : "not counted", label).toBe(e.circuit);
      }

      // Nothing of SAP's: no host, no text, no address of the system behind it.
      const sent = [text, ...[...res.headers.entries()].map(([k, v]) => `${k}: ${v}`)].join("\n");
      expect(hostIn(sent), label).toEqual([]);
      expect(sent, label).not.toContain("secret-path");
      expect(sent, label).not.toContain("127.0.0.1");
      expect(sent, label).not.toContain("/IWBEP/");

      previous = body.data ? { records: body.data.records } : null;
      cursor = body.data?.page?.nextCursor ?? null;
    }
  });
});
