// @vitest-environment node
/**
 * Studio's query-policy route (P1.4, 3.5.7 and 3.5.8), on PostgreSQL with the
 * tenant guard throwing, and the lifecycle of the policy around it.
 *
 *   - Roles: anyone in Studio reads it; only a builder saves or removes it.
 *   - A save is compiled against the basis under the row lock, and refused
 *     when the revision or the basis the card was drawn from has moved (409),
 *     when no verify has described the contract (409), and when the source
 *     asks for what the contract does not allow (400, one sentence each).
 *   - Every save is config-audited, PROMOTE when it widens bulk reading.
 *   - A save that narrows an ACTIVE interface is written only once confirmed.
 *   - DELETE removes it, and the next query call is QUERY_NOT_AVAILABLE.
 *   - A verify rebuilds the basis and recompiles: narrowed when a field
 *     goes, STALE when the key changes.
 *   - A PATCH contract change clears the basis and the compiled policy: the
 *     next query call is QUERY_NOT_AVAILABLE / NO_CONTRACT.
 *   - A save and a verify running at once, on two connections: whichever
 *     order PostgreSQL gives them, the compiled policy is compiled against
 *     the basis stored beside it.
 *
 * WHY TWO PRISMA CLIENTS: see owner-lock-two-process.test.ts. In the race,
 * the save and the verify run on independent clients, so only PostgreSQL's
 * row lock orders them.
 *
 * Opt-in on TEST_DATABASE_URL.
 */

import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

const processes = vi.hoisted(() => ({
  as: null as null | (<T>(which: "one" | "two", run: () => Promise<T>) => Promise<T>),
  disconnect: null as null | (() => Promise<void>),
}));

vi.mock("@/lib/db/prisma", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const { PrismaClient } = await import("@prisma/client");
  const { tenantScopeGuard } = await import("@/lib/db/tenant-guard");
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused";
  const make = () => new PrismaClient({ datasourceUrl: url }).$extends(tenantScopeGuard());
  const clients = { one: make(), two: make() };
  const current = new AsyncLocalStorage<"one" | "two">();
  processes.as = (which, run) => current.run(which, run);
  processes.disconnect = async () => {
    await Promise.all([clients.one.$disconnect(), clients.two.$disconnect()]);
  };
  const prisma = new Proxy(
    {},
    {
      get(_target, prop) {
        const client = clients[current.getStore() ?? "one"] as unknown as Record<string | symbol, unknown>;
        const value = client[prop];
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
      },
    },
  );
  return { prisma };
});

import { GET as readRoute } from "@/app/api/northbound/interfaces/[id]/data/route";
import { DELETE, GET, PUT } from "@/app/api/studio/interfaces/[id]/query-policy/route";
import { PATCH as patchInterface } from "@/app/api/studio/interfaces/route";
import { recordJob } from "@/lib/contracts/jobs";
import { recordVerifiedContract } from "@/lib/contracts/record";
import { loadRecordHeads } from "@/lib/contracts/snapshot";
import { prisma } from "@/lib/db/prisma";
import { parseQueryBasis } from "@/lib/odata/basis";
import { parseCompiledPolicy, type QueryPolicySourceV1 } from "@/lib/odata/policy";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

import { source } from "../helpers/odata-query";
import { DESCRIPTION, ENTITY_SET, removeQueryWorld, seedQueryApp, seedQueryWorld, type QueryApp, type QueryWorld } from "../helpers/query-world";

const RUN = `p14p-${randomUUID().slice(0, 8)}`;
const as = <T,>(which: "one" | "two", run: () => Promise<T>) => processes.as!(which, run);

let world: QueryWorld;
let app: QueryApp;

const builder = () => ({ id: world.userId, email: "b@example.test", role: "consultant", organizationId: world.organizationId, authMethod: "session" });

type Answer = { status: number; body: { data?: Record<string, unknown>; error?: { code: string; message: string; errors?: { field?: string; rule: string; message: string }[] } } };

async function answer(res: Response): Promise<Answer> {
  return { status: res.status, body: (await res.json()) as Answer["body"] };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function getPolicy(id: string): Promise<Answer> {
  return answer(await GET(new NextRequest(`http://localhost/api/studio/interfaces/${id}/query-policy`), params(id)));
}

async function putPolicy(id: string, body: unknown): Promise<Answer> {
  return answer(
    await PUT(
      new NextRequest(`http://localhost/api/studio/interfaces/${id}/query-policy`, { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      params(id),
    ),
  );
}

async function deletePolicy(id: string, body: unknown): Promise<Answer> {
  return answer(
    await DELETE(
      new NextRequest(`http://localhost/api/studio/interfaces/${id}/query-policy`, { method: "DELETE", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      params(id),
    ),
  );
}

/** Save as the card does: the revision and basis the GET returned. */
async function save(id: string, src: QueryPolicySourceV1, extra: Record<string, unknown> = {}): Promise<Answer> {
  const current = await getPolicy(id);
  const data = current.body.data as { revision: number; basisHash: string };
  return putPolicy(id, { source: src, expected: { revision: data.revision, basisHash: data.basisHash }, ...extra });
}

/** A verify of the service with `description`, as the verify route records it. */
async function verify(interfaceId: string, description: string = DESCRIPTION.V2) {
  const scope = tenantScopeOf(world.organizationId);
  const iface = await prisma.interface.findFirstOrThrow({
    where: { id: interfaceId, organizationId: world.organizationId },
    select: { id: true, version: true, externalId: true, entitySet: true, operation: true, mode: true, odataVersion: true },
  });
  const target = { ...iface, entitySet: iface.entitySet! };
  const heads = await loadRecordHeads(scope, target, "DEV");
  return recordVerifiedContract({
    scope,
    iface: target,
    compiled: recordJob({ description, entitySet: ENTITY_SET, ...heads }),
    heads,
    environment: "DEV",
    connectionId: world.connectionId,
    actorId: world.userId,
  });
}

async function row(id: string) {
  return prisma.interface.findFirstOrThrow({
    where: { id, organizationId: world.organizationId },
    select: { queryPolicy: true, queryBasis: true, queryPolicyCompiled: true, queryPolicyRevision: true, version: true, status: true },
  });
}

async function audits(id: string) {
  return prisma.configAudit.findMany({ where: { organizationId: world.organizationId, entityId: id, entityType: "Interface" }, orderBy: { at: "asc" } });
}

/** A query call through the real data route, as the deployed app makes it. */
async function queryCall(id: string, qs: string) {
  const res = await readRoute(new NextRequest(`http://localhost/api/northbound/interfaces/${id}/data?${qs}`, { headers: { authorization: `Bearer ${app.token}` } }), params(id));
  return (await res.json()) as { error?: { code: string; query?: { rule: string } } };
}

/** A fresh READ interface on the V2 service with its own grant, verified once. */
async function freshInterface(): Promise<string> {
  const fresh = await seedQueryApp(world, `App ${randomUUID().slice(0, 6)}`);
  await verify(fresh.iface.V2);
  return fresh.iface.V2;
}

const FILTERED = source({ filter: [{ field: "Order", ops: ["eq", "in"] }, { field: "Customer", ops: ["eq"] }], sort: ["Order", "Line"] });

describe.skipIf(!process.env.TEST_DATABASE_URL)("Studio's query-policy route (P1.4)", () => {
  beforeAll(async () => {
    vi.stubEnv("SAP_CONNECTION_ENCRYPTION_KEY", "c".repeat(64));
    vi.stubEnv("COREEDGE_JOURNEY_EVENTS", "off");
    world = await seedQueryWorld(RUN);
    app = await seedQueryApp(world, "Portal");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (world) {
      await prisma.configAudit.deleteMany({ where: { organizationId: world.organizationId } });
      await removeQueryWorld(world);
    }
    await processes.disconnect?.();
  });

  beforeEach(() => {
    session.user = builder();
    vi.stubEnv("COREEDGE_QUERY_SURFACE", "on");
  });

  it("asks for a verify before anything can be saved, and offers no default until there is a basis", async () => {
    const before = await getPolicy(app.iface.V4);
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject({ basis: null, basisHash: null, source: null, compiled: null, revision: 0, suggested: null, flagEnabled: true, canEdit: true });
    const refused = await putPolicy(app.iface.V4, { source: source(), expected: { revision: 0, basisHash: "x" } });
    expect(refused.status).toBe(409);
    expect(refused.body.error!.message).toContain("Verify the service");
  });

  it("lets anyone in Studio read the policy, and only a builder change it", async () => {
    const id = await freshInterface();
    session.user = { ...builder(), id: `${RUN}-viewer`, role: "sandbox_developer" };
    const read = await getPolicy(id);
    expect(read.status).toBe(200);
    expect(read.body.data).toMatchObject({ canEdit: false });
    expect((await putPolicy(id, { source: source(), expected: { revision: 0, basisHash: "x" } })).status).toBe(403);
    expect((await deletePolicy(id, { expected: { revision: 0 } })).status).toBe(403);
    session.user = null;
    expect((await getPolicy(id)).status).toBe(401);
    session.user = { ...builder(), organizationId: `${RUN}-elsewhere` };
    expect((await getPolicy(id)).status).toBe(404);
  });

  it("saves the safe default against the basis, at revision + 1, config-audited as an update", async () => {
    const id = await freshInterface();
    const got = await getPolicy(id);
    const data = got.body.data as { basis: { keys: string[] }; suggested: QueryPolicySourceV1; revision: number; basisHash: string };
    expect(data.basis.keys).toEqual(["Order", "Line"]);
    expect(data.suggested).toEqual({
      v: 1,
      select: "*",
      filter: [
        { field: "Order", ops: ["eq", "in"] },
        { field: "Line", ops: ["eq", "in"] },
      ],
      sort: ["Order", "Line"],
      requireFilterOn: [],
      keyLookup: true,
      count: false,
      page: { defaultSize: 100, maxSize: 500, rowCap: 10_000, byteCap: 4_000_000 },
    });

    const saved = await putPolicy(id, { source: data.suggested, expected: { revision: data.revision, basisHash: data.basisHash } });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ saved: true, revision: data.revision + 1, widened: [], compiled: { state: "READY", paging: "OFFSET", tieBreak: ["Order", "Line"], key: ["Order", "Line"] } });

    const stored = await row(id);
    expect(stored.queryPolicyRevision).toBe(data.revision + 1);
    expect(stored.queryPolicy).toEqual(data.suggested);
    const compiled = parseCompiledPolicy(stored.queryPolicyCompiled);
    expect("unreadable" in compiled).toBe(false);
    if (!("unreadable" in compiled)) expect(compiled.compiled.snapshot.contentHash).toBe(data.basisHash);
    // A policy edit is not a contract change.
    expect(stored.version).toBe(1);

    const trail = await audits(id);
    expect(trail.at(-1)).toMatchObject({ action: "UPDATE", actorId: world.userId });
    expect(trail.at(-1)!.after).toMatchObject({ event: "query_policy_save", revision: data.revision + 1, widened: [], narrowed: [] });
  });

  it("refuses a save drawn from an old revision or an old basis, and writes nothing", async () => {
    const id = await freshInterface();
    const data = (await getPolicy(id)).body.data as { revision: number; basisHash: string };
    expect((await putPolicy(id, { source: FILTERED, expected: { revision: data.revision, basisHash: data.basisHash } })).status).toBe(200);
    const stale = await putPolicy(id, { source: source(), expected: { revision: data.revision, basisHash: data.basisHash } });
    expect(stale.status).toBe(409);
    expect(stale.body.error!.message).toContain("Reload");
    const otherBasis = await putPolicy(id, { source: source(), expected: { revision: data.revision + 1, basisHash: "b".repeat(64) } });
    expect(otherBasis.status).toBe(409);
    expect((await row(id)).queryPolicy).toEqual(FILTERED);
  });

  it("refuses a source the contract does not allow, one sentence per problem", async () => {
    const id = await freshInterface();
    const refused = await save(id, source({ select: ["Order", "Line", "Missing"], filter: [{ field: "Note", ops: ["eq"] }] }));
    expect(refused.status).toBe(400);
    expect(refused.body.error!.code).toBe("VALIDATION_ERROR");
    expect(refused.body.error!.errors!.map((e) => e.rule)).toEqual(["FIELD_MISSING", "NOT_READABLE"]);
    expect(refused.body.error!.message).toBe(refused.body.error!.errors!.map((e) => e.message).join(" "));
    // A key the source does not know is refused by the schema, not dropped.
    const unknownKey = await save(id, { ...source(), expand: ["to_Item"] } as unknown as QueryPolicySourceV1);
    expect(unknownKey.status).toBe(400);
    expect((await row(id)).queryPolicy).toBeNull();
  });

  it("records a save that widens bulk reading as PROMOTE, with what it widened", async () => {
    const id = await freshInterface();
    expect((await save(id, FILTERED)).status).toBe(200);
    const widened = await save(id, { ...FILTERED, count: true, page: { defaultSize: 100, maxSize: 800, rowCap: 50_000, byteCap: 4_000_000 } });
    expect(widened.body.data).toMatchObject({ saved: true, widened: ["rowCap 50000", "maxSize 800", "count"] });
    const last = (await audits(id)).at(-1)!;
    expect(last.action).toBe("PROMOTE");
    expect(last.after).toMatchObject({ widened: ["rowCap 50000", "maxSize 800", "count"] });
  });

  /*
   * On a dataset SAP does not page, a row cap of 100,000 compiles to the page
   * size, so the save that asked for it was an UPDATE; the verify that later
   * finds the dataset pageable compiled the 100,000, and no PROMOTE row ever
   * recorded it. The save that asks is the PROMOTE.
   */
  it("records a save asking for a row cap above 10,000 as PROMOTE, while the dataset cannot page", async () => {
    const fresh = await seedQueryApp(world, `App ${randomUUID().slice(0, 6)}`);
    const id = fresh.iface.V2;
    await verify(id, DESCRIPTION.V2.replace('<EntitySet Name="OrderLines"', '<EntitySet Name="OrderLines" sap:pageable="false"'));
    const bulk = { ...FILTERED, page: { defaultSize: 100, maxSize: 500, rowCap: 100_000, byteCap: 4_000_000 } };
    const saved = await save(id, bulk);
    expect(saved.body.data).toMatchObject({ saved: true, widened: ["rowCap 100000"], compiled: { paging: "SINGLE" } });
    const last = (await audits(id)).at(-1)!;
    expect(last.action).toBe("PROMOTE");
    expect(last.after).toMatchObject({ widened: ["rowCap 100000"] });
    // The verify that finds it pageable compiles only what that save asked for.
    const pageable = await verify(id);
    expect(pageable).toMatchObject({ queryPolicy: { state: "READY" } });
    expect(parseCompiledPolicy((await row(id)).queryPolicyCompiled)).toMatchObject({ compiled: { paging: "OFFSET", page: { rowCap: 100_000 } } });
    // Saving the same request again widens nothing.
    expect((await save(id, bulk)).body.data).toMatchObject({ saved: true, widened: [] });
  });

  it("writes a save that narrows an ACTIVE interface only once the builder confirms it", async () => {
    const id = await freshInterface();
    expect((await row(id)).status).toBe("ACTIVE");
    expect((await save(id, FILTERED)).status).toBe(200);
    const narrower = source({ filter: [{ field: "Order", ops: ["eq"] }], sort: ["Order", "Line"] });

    const asked = await save(id, narrower);
    expect(asked.status).toBe(200);
    expect(asked.body.data).toMatchObject({
      saved: false,
      confirm: { narrowed: ["Order in", "Customer eq"], message: "Callers using these fields or operators will receive 400 POLICY_FIELD_NOT_GRANTED." },
    });
    expect((await row(id)).queryPolicy).toEqual(FILTERED);

    const confirmed = await save(id, narrower, { confirmNarrowing: true });
    expect(confirmed.body.data).toMatchObject({ saved: true, narrowed: ["Order in", "Customer eq"] });
    expect((await row(id)).queryPolicy).toEqual(narrower);
  });

  it("removes the policy: the columns clear, the revision moves, and the next query call is QUERY_NOT_AVAILABLE", async () => {
    const id = app.iface.V2;
    await verify(id);
    expect((await save(id, FILTERED)).status).toBe(200);
    const { revision } = (await getPolicy(id)).body.data as { revision: number };

    expect((await deletePolicy(id, { expected: { revision: revision - 1 } })).status).toBe(409);
    const removed = await deletePolicy(id, { expected: { revision } });
    expect(removed.body.data).toEqual({ removed: true, revision: revision + 1 });
    const stored = await row(id);
    expect(stored).toMatchObject({ queryPolicy: null, queryPolicyCompiled: null, queryPolicyRevision: revision + 1 });
    // The basis stays: it describes the contract, not the policy.
    expect(parseQueryBasis(stored.queryBasis)).not.toBeNull();
    expect((await audits(id)).at(-1)!.after).toMatchObject({ event: "query_policy_remove" });

    const call = await queryCall(id, "filter.Order.eq=O0001");
    expect(call.error).toMatchObject({ code: "VALIDATION_ERROR", query: { rule: "NO_POLICY" } });
  });

  it("a verify rebuilds the basis and recompiles the policy: narrowed when a field goes, STALE when the key changes", async () => {
    const id = await freshInterface();
    const withNote = source({ filter: [{ field: "Order", ops: ["eq"] }, { field: "Note", ops: ["eq"] }], sort: ["Order", "Line"] });
    expect((await save(id, withNote)).status).toBe(200);

    const noNote = DESCRIPTION.V2.replace(/\s*<Property Name="Note"[^>]*\/>/, "");
    const narrowed = await verify(id, noNote);
    expect(narrowed).toMatchObject({ queryBasisWritten: true, queryPolicy: { state: "READY" } });
    expect(("queryPolicy" in narrowed && narrowed.queryPolicy?.narrowed.join(" ")) || "").toContain("Note");
    const afterNarrow = (await getPolicy(id)).body.data as { compiled: { state: string; fields: { n: string }[] }; basis: { snapshot: { contentHash: string } } };
    expect(afterNarrow.compiled.fields.map((f) => f.n)).not.toContain("Note");

    const newKey = noNote.replace('<PropertyRef Name="Line"/>', "");
    const stale = await verify(id, newKey);
    expect(stale).toMatchObject({ queryPolicy: { state: "STALE" } });
    const shown = (await getPolicy(id)).body.data as { compiled: { state: string; stale: { reason: string; sentence: string } } };
    expect(shown.compiled).toMatchObject({ state: "STALE", stale: { reason: "KEY_CHANGED" } });
    expect(shown.compiled.stale.sentence).toContain("Review it and save it again");
  });

  it("a PATCH that changes the contract clears the basis and the compiled policy, and keeps the source: NO_CONTRACT", async () => {
    const id = app.iface.V2;
    await verify(id);
    expect((await save(id, FILTERED)).status).toBe(200);
    const patched = await patchInterface(
      new Request("http://localhost/api/studio/interfaces", {
        method: "PATCH",
        body: JSON.stringify({ id, entitySet: "OrderLinesArchive" }),
        headers: { "content-type": "application/json" },
      }) as never,
    );
    expect(patched.status).toBe(200);
    const stored = await row(id);
    expect(stored.queryBasis).toBeNull();
    expect(stored.queryPolicyCompiled).toBeNull();
    expect(stored.queryPolicy).toEqual(FILTERED);
    const call = await queryCall(id, "filter.Order.eq=O0001");
    expect(call.error).toMatchObject({ code: "VALIDATION_ERROR", query: { rule: "NO_CONTRACT" } });
    // The card offers a verify, not a save.
    expect((await getPolicy(id)).body.data).toMatchObject({ basis: null, source: FILTERED, compiled: null });
  });

  it("a save and a verify at once, on two connections, always leave the policy compiled against the basis beside it", async () => {
    const id = await freshInterface();
    expect((await save(id, FILTERED)).status).toBe(200);
    // Each round's verify records a new contract, so its basis names a new snapshot.
    for (let round = 0; round < 6; round++) {
      const data = (await getPolicy(id)).body.data as { revision: number; basisHash: string };
      const description = DESCRIPTION.V2.replace('sap:label="Note"', `sap:label="Note ${round}"`).replace('MaxLength="2000"', `MaxLength="${2000 + round + 1}"`);
      const [saved] = await Promise.all([
        as("one", () => putPolicy(id, { source: { ...FILTERED, sort: round % 2 === 0 ? ["Order"] : ["Order", "Line"] }, expected: { revision: data.revision, basisHash: data.basisHash } })),
        as("two", () => verify(id, description)),
      ]);
      expect([200, 409]).toContain(saved.status);
      const stored = await row(id);
      const basis = parseQueryBasis(stored.queryBasis)!;
      const compiled = parseCompiledPolicy(stored.queryPolicyCompiled);
      expect("unreadable" in compiled).toBe(false);
      if (!("unreadable" in compiled)) {
        expect(compiled.compiled.snapshot.contentHash).toBe(basis.snapshot.contentHash);
        expect(compiled.compiled.revision).toBe(stored.queryPolicyRevision);
      }
    }
  });

  it("refuses a body over 40 KiB and a source that is not one", async () => {
    const id = await freshInterface();
    // Refused by its size before it is parsed: a schema refusal of the source would name the source.
    const big = await putPolicy(id, { source: "x".repeat(41 * 1024), expected: { revision: 0, basisHash: "x" } });
    expect(big.status).toBe(400);
    expect(big.body.error!.message).toContain("at most 40 KiB");
    const notASource = await save(id, { v: 2 } as unknown as QueryPolicySourceV1);
    expect(notASource.status).toBe(400);
    expect(notASource.body.error!.errors!.length).toBeGreaterThan(0);
    expect((await row(id)).queryPolicy).toBeNull();
  });
});
