/**
 * POST /api/sap/tdd/hub-content/harvest-import — the route, not just its parts.
 *
 * hub-harvest-remote.test.ts pins the pure helpers. This exercises the endpoint
 * itself, because the defects that shipped in this area were never in the pure
 * functions: a documented harvest→import chain that had never once run, an
 * audit helper that never recorded the field it took, an incident rule blind to
 * a refusal it claimed to count. Each unit was fine; nothing ran the whole path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  logDecision: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  isAdminError: (r: unknown) => typeof r === "object" && r !== null && "status" in (r as Record<string, unknown>),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapHubContent: { findMany: mocks.findMany, createMany: mocks.createMany, update: mocks.update } },
}));
vi.mock("@/lib/audit/decision-logger", () => ({ logDecision: mocks.logDecision }));

const { POST } = await import("@/app/api/sap/tdd/hub-content/harvest-import/route");

const CONFIRM = "REBUILD SAP HUB CATALOGUE";
const SHA = "0123456789abcdef0123456789abcdef01234567";

const makeRequest = (body: unknown) => ({ json: async () => body }) as Parameters<typeof POST>[0];

const ROWS = Array.from({ length: 5 }, (_, i) => ({
  externalId: `EVT_${i}`,
  title: `Event ${i}`,
  description: "d",
  packageId: "Supply Chain",
  status: "ACTIVE",
  illustrative: false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  process.env.VERCEL_GIT_REPO_OWNER = "ib823";
  process.env.VERCEL_GIT_REPO_SLUG = "aptus";
  process.env.VERCEL_GIT_COMMIT_SHA = SHA;
  delete process.env.HUB_HARVEST_REF;
  delete process.env.HUB_HARVEST_REPO;

  mocks.requireAdmin.mockResolvedValue({ user: { id: "a", email: "a@b.co", role: "platform_admin" } });
  mocks.findMany.mockResolvedValue([]);
  mocks.createMany.mockResolvedValue({ count: 0 });
  mocks.update.mockResolvedValue({});
  // A NEW Response PER CALL. A body can only be consumed once, so a shared
  // object makes the second call in a test fail with "Body has already been
  // read" — an error about the harness that reads like an error about the route.
  mocks.fetch.mockImplementation(async () => new Response(JSON.stringify(ROWS), { status: 200 }));
});

describe("the gates hold before anything is written", () => {
  it("refuses a non-admin, and fetches nothing", async () => {
    mocks.requireAdmin.mockResolvedValue({ status: 401 });
    const res = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("400 without the confirmation phrase", async () => {
    const res = await POST(makeRequest({ confirmation: "nope", contentType: "EVENT" }));
    expect(res.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("names the accepted types, and why CDS_VIEW is not one", async () => {
    const res = await POST(makeRequest({ confirmation: CONFIRM, contentType: "CDS_VIEW" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/INTEGRATION/);
    expect(body.error.message).toMatch(/counts-only/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses an unpinned deployment BEFORE fetching, and says how to fix it", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const res = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    // A known state, not a failure — the console draws the same distinction.
    expect(body.error.state).toBe("NOT_CONFIGURED");
    expect(body.error.message).toMatch(/HUB_HARVEST_REF|sap:hub:import/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("it fetches the pinned commit and writes what it got", () => {
  it("asks raw.githubusercontent for this deployment's SHA", async () => {
    await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0]![0]).toBe(
      `https://raw.githubusercontent.com/ib823/aptus/${SHA}/sap-references/hub-harvest/EVENT.json`,
    );
  });

  it("inserts new rows in ONE createMany, not one call per row", async () => {
    mocks.createMany.mockResolvedValue({ count: 5 });
    const res = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    expect(res.status).toBe(200);
    /*
     * 4,439 integrations at two round trips each is 8,878 queries over a pooled
     * serverless connection. Timing out halfway leaves a partial import that
     * looks exactly like a finished one, which is why the batch shape is pinned
     * and not left as an optimisation detail.
     */
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany.mock.calls[0]![0].data).toHaveLength(5);
    expect(mocks.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
    const body = await res.json();
    expect(body.data).toMatchObject({ inserted: 5, updated: 0, processed: 5, total: 5, complete: true, nextOffset: null });
  });

  it("stamps the commit into every row, so the snapshot stays identifiable", async () => {
    await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    const row = mocks.createMany.mock.calls[0]![0].data[0];
    expect(row.contentType).toBe("EVENT");
    expect(row.rawMetadataJson).toMatchObject({ ref: SHA, repo: "ib823/aptus", refSource: "VERCEL_GIT_COMMIT_SHA" });
    expect(row.rawMetadataJson.source).toBe(`harvest:EVENT@${SHA.slice(0, 7)}`);
  });

  it("updates rows that already exist instead of duplicating them", async () => {
    mocks.findMany.mockResolvedValue([{ id: "row-1", externalId: "EVT_2", illustrative: false }]);
    mocks.createMany.mockResolvedValue({ count: 4 });
    const res = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    const body = await res.json();
    expect(body.data).toMatchObject({ inserted: 4, updated: 1 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]![0].where).toEqual({ id: "row-1" });
    expect(mocks.createMany.mock.calls[0]![0].data).toHaveLength(4);
  });

  it("NEVER lets an illustrative row demote a real one", async () => {
    // The #216 rule travels with the upsert key, not with the caller. Harvested
    // rows are illustrative:false today; this is here so that stops being
    // something a future change has to remember.
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify([{ externalId: "EVT_0", title: "placeholder", illustrative: true }]), { status: 200 }),
    );
    mocks.findMany.mockResolvedValue([{ id: "row-0", externalId: "EVT_0", illustrative: false }]);
    const res = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    const body = await res.json();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(body.data.skippedReal).toBe(1);
    expect(body.data.updated).toBe(0);
  });
});

describe("it says whether the import finished", () => {
  it("reports nextOffset while rows remain, and null when done", async () => {
    const first = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT", limit: 2 }));
    const a = await first.json();
    expect(a.data).toMatchObject({ offset: 0, processed: 2, nextOffset: 2, complete: false, total: 5 });

    const last = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT", offset: 4, limit: 2 }));
    const b = await last.json();
    expect(b.data).toMatchObject({ offset: 4, processed: 1, nextOffset: null, complete: true });
  });

  it("a bad gateway answer is 502 and never claims completion", async () => {
    mocks.fetch.mockResolvedValue(new Response("<!DOCTYPE html>", { status: 200 }));
    const res = await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.message).toMatch(/did not return JSON/);
    expect(body.data).toBeUndefined();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("records the import in the decision log", async () => {
    await POST(makeRequest({ confirmation: CONFIRM, contentType: "EVENT" }));
    expect(mocks.logDecision).toHaveBeenCalledTimes(1);
    expect(mocks.logDecision.mock.calls[0]![0]).toMatchObject({
      entityId: "hub-harvest-import",
      action: "SAP_HUB_TYPE_IMPORTED",
    });
  });
});

describe("nothing is bundled", () => {
  it("the route fetches at request time and imports no harvest file", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../../../src/app/api/sap/tdd/hub-content/harvest-import/route.ts"),
      "utf8",
    );
    /*
     * A static import IS the bundling instruction — 2.4MB into every function.
     *
     * Matched against IMPORT AND REQUIRE STATEMENTS, not against the whole
     * file. A bare `expect(src).not.toMatch(/sap-references/)` fails on the
     * header comment that explains why nothing is imported, which would have
     * made the honest documentation of the rule break the test enforcing it.
     */
    const specifiers = [...src.matchAll(/(?:^import\s[^;]*?from\s*|\brequire\(\s*)["']([^"']+)["']/gm)].map((m) => m[1]!);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => /sap-references|hub-harvest\//.test(s))).toEqual([]);
    // And nothing reaches the files by a dynamic path either.
    expect(src).not.toMatch(/import\(\s*["'][^"']*sap-references/);
  });
});
