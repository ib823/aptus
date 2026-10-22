// @vitest-environment node
/**
 * A changed contract never publishes the old contract's schema or mock (P0.4, A38).
 *
 * THE DEFECT, as the audit reproduced it. Interface I reads A_BusinessPartner
 * and has a captured schema and a data fixture. A builder changes the entity
 * set to A_BusinessPartnerAddress; the version goes to v2. The app's GET
 * /schema then answered {entitySet: A_BusinessPartnerAddress, version: 2,
 * responseSchema: <BusinessPartner fields>, schemaCaptured: true}, the kit's
 * client.ts typed `ABusinessPartnerAddress` with BusinessPartner's fields
 * "CAPTURED from 5 live rows", and `npm run mock` served BusinessPartner rows.
 *
 * Here that sequence runs through the real routes — capture-schema,
 * capture-fixture, the Studio PATCH, the northbound /schema route and the
 * scaffold route — over an in-memory store, and the acceptance is asserted as
 * a property: whatever version and stamp a stored schema carries, /schema
 * never serves one that is not the interface's current contract.
 */

import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { store } = vi.hoisted(() => ({
  store: {
    iface: null as Row | null,
    fixtures: [] as Row[],
    audits: [] as Row[],
    /** Runs once, between capture-fixture's lookup of an existing recording and its write. */
    afterFixtureLookup: null as null | (() => Promise<void>),
  },
}));

/** Does a stored row satisfy a Prisma `where` of plain equalities (and the one Json filter used)? */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "responseSchema" && v && typeof v === "object" && "not" in (v as Row))
      return row[k] !== null && row[k] !== undefined;
    if (v && typeof v === "object" && !(v instanceof Date)) return true; // relation filters are not used on these paths
    return row[k] === v;
  });
}
function apply(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (k === "version" && v && typeof v === "object") row.version = (row.version as number) + 1;
    else row[k] = v === Prisma.DbNull ? null : v;
  }
}

vi.mock("@/lib/db/prisma", async () => {
  const { capturedSchemaFactRows, fixtureBodyTextRows, fixtureFactRows, isFixtureBodiesQuery, isFixtureFactsQuery } = await import("../../helpers/captured-schema-facts");
  const prisma: Row = {
    interface: {
      findFirst: async ({ where }: { where: Row }) =>
        store.iface && matches(store.iface, where) ? { ...store.iface } : null,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        if (!store.iface || !matches(store.iface, where)) {
          throw new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "test" });
        }
        apply(store.iface, data);
        return { ...store.iface };
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (!store.iface || !matches(store.iface, where)) return { count: 0 };
        apply(store.iface, data);
        return { count: 1 };
      },
    },
    mockFixture: {
      findFirst: async ({ where }: { where: Row }) => {
        const found = store.fixtures.find((f) => matches(f, where)) ?? null;
        const hook = store.afterFixtureLookup;
        store.afterFixtureLookup = null;
        if (hook) await hook();
        return found;
      },
      findMany: async ({ where }: { where: Row }) =>
        store.fixtures.filter((f) => matches(f, where)).map((f) => ({ ...f })),
      create: async ({ data }: { data: Row }) => {
        const row = { id: `fx_${store.fixtures.length + 1}`, capturedAt: new Date(), ...data };
        store.fixtures.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = store.fixtures.find((f) => matches(f, where));
        if (!row) throw new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "test" });
        apply(row, data);
        return row;
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = store.fixtures.length;
        store.fixtures = store.fixtures.filter((f) => !matches(f, where));
        return { count: before - store.fixtures.length };
      },
    },
    configAudit: {
      create: async ({ data }: { data: Row }) => {
        store.audits.push(data);
        return { id: `a${store.audits.length}` };
      },
    },
    // P1.3: no compiled contract in this sequence (the kit and /schema read
    // snapshots; a capture records a sampled one, which is not asserted here).
    contractSnapshot: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async ({ data }: { data: Row }) => ({ id: "snap_1", createdAt: new Date(), ...data }),
    },
    apiAccessGrant: { findMany: async () => [] },
  };
  // The readers learn a stored schema's stamp and size first (response-schema-states.ts), then read it by id.
  (prisma.interface as Row).findMany = async ({ where }: { where: Row }) =>
    store.iface && matches(store.iface, where) ? [{ id: store.iface.id, responseSchema: store.iface.responseSchema ?? null }] : [];
  prisma.$queryRaw = async (q: unknown) =>
    isFixtureBodiesQuery(q)
      ? fixtureBodyTextRows(store.fixtures, q)
      : isFixtureFactsQuery(q)
        ? fixtureFactRows(store.fixtures, q)
        : store.iface
          ? capturedSchemaFactRows([store.iface], q)
          : [];
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  // A fixture body written from its text (json-text.ts), and a capture's schema, in the row's own transaction.
  const { applyRawWrite } = await import("../../helpers/raw-sql-standin");
  prisma.$executeRaw = async (q: unknown) =>
    applyRawWrite({ snapshots: [], interfaces: store.iface ? [store.iface] : [], fixtures: store.fixtures }, q);
  return { prisma };
});
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => ({
    id: "u1",
    email: "dev@abeam.com",
    role: "consultant",
    organizationId: "org_a",
    authMethod: "session",
  }),
}));
vi.mock("@/lib/northbound/auth", () => ({
  authenticateClientToken: async () => ({
    ok: true,
    client: {
      clientId: "cl_1",
      organizationId: "org_a",
      solutionId: "sol_1",
      environment: "PROD",
      sapClient: null,
      scope: { organizationId: "org_a" },
    },
  }),
  extractBearer: (h: string | null) => h,
  touchClientLastUsed: vi.fn(),
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  RATE_LIMITS: { northbound: { limit: 60 } },
}));

import { GET as getSchema } from "@/app/api/northbound/interfaces/[id]/schema/route";
import { POST as captureFixture } from "@/app/api/studio/interfaces/[id]/capture-fixture/route";
import { POST as captureSchema } from "@/app/api/studio/interfaces/[id]/capture-schema/route";
import { GET as scaffold } from "@/app/api/studio/interfaces/[id]/scaffold/route";
import { PATCH } from "@/app/api/studio/interfaces/route";
import {
  artifactState,
  captureContractMismatch,
  currentResponseSchema,
  partitionFixtures,
  responseSchemaState,
} from "@/lib/studio/contract-provenance";
import { servedFixture, servedFixtures, SCENARIO_STATUS } from "@/lib/studio/fixtures";
import { inferResponseSchema } from "@/lib/studio/schema-capture";
import { LIMITS } from "@/lib/contracts/budget";
import { isFixtureBodiesQuery } from "../../helpers/captured-schema-facts";

const ctx = { params: Promise.resolve({ id: "if_1" }) };
const post = (url: string, body: unknown) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const BP_ROWS = Array.from({ length: 5 }, (_, i) => ({
  BusinessPartner: String(1000 + i),
  BusinessPartnerFullName: "Acme",
}));

function freshInterface(): Row {
  return {
    id: "if_1",
    organizationId: "org_a",
    solutionId: "sol_1",
    name: "BP read",
    externalId: "API_BUSINESS_PARTNER",
    sapProduct: "s4hana",
    operation: "READ",
    mode: "READ",
    entitySet: "A_BusinessPartner",
    version: 1,
    status: "DRAFT",
    mappingVersion: null,
    requestSchemaStamp: null,
    responseSchema: null,
    servicePath: null,
    odataVersion: null,
    serviceVerifiedAt: null,
    serviceVerifications: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    grantMatchChangedAt: null,
    solution: { name: "Finance" },
  };
}

async function schemaEndpoint() {
  const res = await getSchema(new NextRequest("http://localhost/api/northbound/interfaces/if_1/schema"), ctx);
  return ((await res.json()) as { data: Row }).data;
}
async function kit(): Promise<Record<string, string>> {
  const res = await scaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), ctx);
  const files = ((await res.json()) as { data: { files: { path: string; contents: string }[] } }).data.files;
  return Object.fromEntries(files.map((f) => [f.path, f.contents]));
}

beforeEach(() => {
  store.iface = freshInterface();
  store.fixtures = [];
  store.audits = [];
  store.afterFixtureLookup = null;
});

describe("the audit's sequence, through the routes", () => {
  it("a new entity set clears the old contract's schema and fixtures, and nothing serves them", async () => {
    // v1: capture a schema and a data fixture from a run of A_BusinessPartner.
    const run = { interfaceVersion: 1, entitySet: "A_BusinessPartner" };
    expect((await captureSchema(post("http://localhost/x", { rows: BP_ROWS, ...run }), ctx)).status).toBe(200);
    expect(
      (
        await captureFixture(
          post("http://localhost/x", { readStatus: "OK", sourceStatus: 200, rows: BP_ROWS, ...run }),
          ctx,
        )
      ).status,
    ).toBe(200);
    const before = await schemaEndpoint();
    expect(before.schemaCaptured).toBe(true);
    expect(JSON.stringify(before.responseSchema)).toContain("BusinessPartnerFullName");

    // The builder changes the dataset: a new contract, v2.
    const patched = await PATCH(
      new NextRequest("http://localhost/api/studio/interfaces", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "if_1", entitySet: "A_BusinessPartnerAddress" }),
      }),
    );
    const result = ((await patched.json()) as { data: Row }).data;
    expect(result).toMatchObject({ version: 2, contractChanged: true, schemaCleared: true, fixturesCleared: 1 });
    expect(store.iface!.responseSchema).toBeNull();
    expect(store.fixtures).toEqual([]);
    // …and the audit says what went.
    expect(store.audits.at(-1)!.after).toMatchObject({ schemaCleared: true, fixturesCleared: 1 });

    // /schema: the new contract, honestly uncaptured.
    const after = await schemaEndpoint();
    expect(after).toMatchObject({
      entitySet: "A_BusinessPartnerAddress",
      version: 2,
      responseSchema: null,
      schemaCaptured: false,
      schemaState: "none",
    });

    // The kit: no captured header, no BusinessPartner fields, no fixture of the old set.
    const files = await kit();
    expect(files["client.ts"]).not.toContain("CAPTURED");
    expect(files["client.ts"]).not.toContain("BusinessPartnerFullName");
    expect(files["fixtures.json"]).not.toContain("BusinessPartnerFullName");
  });

  it("a rename is not a contract change and clears nothing", async () => {
    await captureSchema(post("http://localhost/x", { rows: BP_ROWS }), ctx);
    await PATCH(
      new NextRequest("http://localhost/api/studio/interfaces", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "if_1", name: "Renamed" }),
      }),
    );
    expect((await schemaEndpoint()).schemaCaptured).toBe(true);
  });

  it("refuses a capture from a run of an earlier contract (409), for the schema and the fixture", async () => {
    store.iface!.version = 2;
    store.iface!.entitySet = "A_BusinessPartnerAddress";
    const stale = { interfaceVersion: 1, entitySet: "A_BusinessPartner" };
    const schema = await captureSchema(post("http://localhost/x", { rows: BP_ROWS, ...stale }), ctx);
    expect(schema.status).toBe(409);
    const fixture = await captureFixture(
      post("http://localhost/x", { readStatus: "OK", rows: BP_ROWS, ...stale }),
      ctx,
    );
    expect(fixture.status).toBe(409);
    expect(store.iface!.responseSchema).toBeNull();
    expect(store.fixtures).toEqual([]);
  });

  it("a contract change that lands mid-capture deletes the recording being replaced: 409, not a 500", async () => {
    const run = { interfaceVersion: 1, entitySet: "A_BusinessPartner" };
    expect(
      (await captureFixture(post("http://localhost/x", { readStatus: "OK", rows: BP_ROWS, ...run }), ctx)).status,
    ).toBe(200);
    expect(store.fixtures).toHaveLength(1);
    const auditsBefore = store.audits.length;

    // The second capture finds that recording; before it writes, another
    // builder saves a new entity set, and that PATCH deletes every fixture.
    store.afterFixtureLookup = async () => {
      const patched = await PATCH(
        new NextRequest("http://localhost/api/studio/interfaces", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "if_1", entitySet: "A_BusinessPartnerAddress" }),
        }),
      );
      expect(patched.status).toBe(200);
    };
    const res = await captureFixture(post("http://localhost/x", { readStatus: "OK", rows: BP_ROWS, ...run }), ctx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string; message: string } }).error).toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("contract changed while the fixture was being captured"),
    });
    // Nothing of the old contract came back, and no capture was audited.
    expect(store.fixtures).toEqual([]);
    expect(store.audits.slice(auditsBefore).map((a) => (a.after as Row).event)).not.toContain("mock_fixture_captured");
  });

  it("stamps what it captures with the contract it was read under", async () => {
    await captureSchema(post("http://localhost/x", { rows: BP_ROWS }), ctx);
    await captureFixture(post("http://localhost/x", { readStatus: "EMPTY", rows: [] }), ctx);
    expect((store.iface!.responseSchema as { "x-captured": Row })["x-captured"]).toMatchObject({
      interfaceVersion: 1,
      entitySet: "A_BusinessPartner",
    });
    expect(store.fixtures[0]).toMatchObject({ interfaceVersion: 1, entitySet: "A_BusinessPartner" });
  });

  it("the kit names a fixture of another contract as withheld and never serves it", async () => {
    store.fixtures.push(
      {
        id: "fx_old",
        organizationId: "org_a",
        interfaceId: "if_1",
        scenario: "data",
        status: 200,
        body: { records: [{ Old: 1 }] },
        sourceStatus: 200,
        capturedAt: new Date(),
        interfaceVersion: 1,
        entitySet: "A_BusinessPartner",
      },
      {
        id: "fx_legacy",
        organizationId: "org_a",
        interfaceId: "if_1",
        scenario: "empty",
        status: 200,
        body: { records: [] },
        sourceStatus: 200,
        capturedAt: new Date(),
        interfaceVersion: null,
        entitySet: null,
      },
      {
        id: "fx_now",
        organizationId: "org_a",
        interfaceId: "if_1",
        scenario: "needs_setup",
        status: 403,
        body: { error: { code: "FORBIDDEN", message: "x", correlationId: "y" } },
        sourceStatus: 403,
        capturedAt: new Date(),
        interfaceVersion: 2,
        entitySet: "A_BusinessPartnerAddress",
      },
    );
    store.iface!.version = 2;
    store.iface!.entitySet = "A_BusinessPartnerAddress";
    const fixtures = JSON.parse((await kit())["fixtures.json"]!) as {
      fixtures: { scenario: string }[];
      withheld: { scenario: string; reason: string }[];
    };
    expect(fixtures.fixtures.map((f) => f.scenario)).toEqual(["needs_setup"]);
    expect(fixtures.withheld.map((w) => w.scenario).sort()).toEqual(["data", "empty"]);
    expect(JSON.stringify(fixtures.fixtures)).not.toContain("Old");
  });
});

/*
 * Structural hardening round 3: capture-fixture read its body with no bound
 * and stored 25 rows of any width, and every kit download then loaded every
 * stored body whole — tens of MB of engine CPU and a pooled connection —
 * before the kit's own bounds refused it. A fixture is now bounded where it
 * is written, and read by size first where it is served.
 */
describe("a fixture is bounded where it is written and where the kit reads it", () => {
  const wideRows = (rows: number, width: number) => Array.from({ length: rows }, (_, i) => ({ Id: String(i), Photo: "A".repeat(width) }));

  it("capture-fixture refuses a body past its stated size before parsing it, and stores nothing", async () => {
    const res = await captureFixture(post("http://localhost/x", { readStatus: "OK", rows: wideRows(25, 200_000) }), ctx);
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string; message: string } }).error).toMatchObject({ code: "TOO_LARGE" });
    expect(store.fixtures).toHaveLength(0);
  });

  it("capture-fixture still records a wide recording inside the bound (25 photos of 150 KB)", async () => {
    const ok = await captureFixture(post("http://localhost/x", { readStatus: "OK", rows: wideRows(25, 150_000) }), ctx);
    expect(ok.status).toBe(200);
    expect(store.fixtures).toHaveLength(1);
    expect(JSON.stringify(store.fixtures[0]!.body).length).toBeLessThanOrEqual(LIMITS.fixture.bytes);
  });

  it("the kit reads fixtures by size first: one past what a kit carries is named, too large, and its body is never read", async () => {
    const { prisma } = await import("@/lib/db/prisma");
    const reads = vi.spyOn(prisma, "$queryRaw");
    const stamp = { interfaceVersion: 1, entitySet: "A_BusinessPartner", sourceStatus: 200, capturedAt: new Date() };
    store.fixtures.push(
      { id: "fx_huge", organizationId: "org_a", interfaceId: "if_1", scenario: "data", status: 200, body: { records: [{ Photo: "A".repeat(LIMITS.fixture.storedTextBytes) }] }, ...stamp },
      { id: "fx_empty", organizationId: "org_a", interfaceId: "if_1", scenario: "empty", status: 200, body: { records: [] }, ...stamp },
    );
    const res = await scaffold(new NextRequest("http://localhost/api/studio/interfaces/if_1/scaffold"), ctx);
    // Before: every body loaded, then the kit refused as larger than 32 MB.
    expect(res.status).toBe(200);
    const files = ((await res.json()) as { data: { files: { path: string; contents: string }[] } }).data.files;
    const fixtures = JSON.parse(files.find((f) => f.path === "fixtures.json")!.contents) as {
      fixtures: { scenario: string }[];
      withheld: { scenario: string; reason: string }[];
    };
    expect(fixtures.fixtures.map((f) => f.scenario)).toEqual(["empty"]);
    expect(fixtures.withheld).toEqual([{ scenario: "data", reason: expect.stringContaining("larger than the 8 MB") as string }]);
    expect(files.find((f) => f.path === "README.md")!.contents).toContain("larger than the recorded fixtures a\nstarter kit carries");
    // Only the bodies that fit were asked for.
    // (The bodies are read as their stored text: fixture-store.ts, structural hardening round 4.)
    const asked = reads.mock.calls
      .filter(([q]) => isFixtureBodiesQuery(q))
      .flatMap(([q]) => ((q as unknown as { values: unknown[] }).values ?? []).slice(2));
    expect(asked).toEqual(["fx_empty"]);
  });
});

describe("acceptance: the schema endpoint never serves an older version", () => {
  it("for every stored stamp against every current contract", async () => {
    const sets = ["A_BusinessPartner", "A_BusinessPartnerAddress", null];
    for (const version of [1, 2, 3, 5])
      for (const entitySet of sets)
        for (const stampVersion of [null, 1, 2, 3, 5])
          for (const stampSet of sets) {
            const schema = inferResponseSchema(
              BP_ROWS,
              new Date(),
              stampVersion === null ? undefined : { version: stampVersion, entitySet: stampSet },
            );
            store.iface = { ...freshInterface(), version, entitySet, responseSchema: schema };
            const served = await schemaEndpoint();
            const current = stampVersion === version && stampSet === entitySet;
            const label = `v${version}/${entitySet} with stamp v${stampVersion}/${stampSet}`;
            expect(served.schemaCaptured, label).toBe(current);
            expect(served.responseSchema !== null, label).toBe(current);
            expect(served.schemaState, label).toBe(
              current ? "current" : stampVersion === null ? "unverified" : "stale",
            );
            if (!current) expect(typeof served.schemaNote, label).toBe("string");
          }
  });
});

describe("the provenance rules", () => {
  const iface = { version: 3, entitySet: "A_Set" };

  it("judges a stamp current only on the same version AND entity set", () => {
    expect(artifactState({ interfaceVersion: 3, entitySet: "A_Set" }, iface)).toBe("current");
    expect(artifactState({ interfaceVersion: 2, entitySet: "A_Set" }, iface)).toBe("stale");
    expect(artifactState({ interfaceVersion: 3, entitySet: "B_Set" }, iface)).toBe("stale");
    expect(artifactState({}, iface)).toBe("unverified");
    expect(artifactState({ interfaceVersion: null }, iface)).toBe("unverified");
  });

  it("publishes no schema at all when there is none", () => {
    expect(responseSchemaState(null, iface)).toBe("none");
    expect(currentResponseSchema(null, iface)).toBeNull();
  });

  it("refuses a claimed contract that is not the current one; an older console that claims none passes", () => {
    expect(captureContractMismatch({}, iface)).toBeNull();
    expect(captureContractMismatch({ interfaceVersion: 3, entitySet: "A_Set" }, iface)).toBeNull();
    expect(captureContractMismatch({ interfaceVersion: 2 }, iface)).toMatch(/v2.*now v3/);
    expect(captureContractMismatch({ interfaceVersion: 3, entitySet: "B_Set" }, iface)).toMatch(/Run it again/);
  });

  it("partitions fixtures into this contract's and the withheld, with the reason", () => {
    const { current, withheld } = partitionFixtures(
      [
        { scenario: "data", interfaceVersion: 3, entitySet: "A_Set" },
        { scenario: "empty", interfaceVersion: 2, entitySet: "A_Set" },
        { scenario: "error", interfaceVersion: null, entitySet: null },
      ],
      iface,
    );
    expect(current.map((f) => f.scenario)).toEqual(["data"]);
    expect(withheld).toEqual([
      { scenario: "empty", state: "stale" },
      { scenario: "error", state: "unverified" },
    ]);
  });
});

describe("a stored 404 'error' fixture is served as the broker's 404 (A57, stored data)", () => {
  const legacy = {
    scenario: "error",
    status: 502,
    body: {
      error: { code: "UPSTREAM_ERROR", message: "The tenant could not be reached.", correlationId: "fixture-error" },
    },
    sourceStatus: 404,
    capturedAt: "2026-09-01T00:00:00.000Z",
  };

  it("is reconciled on the way out", () => {
    const served = servedFixture(legacy);
    expect(served.scenario).toBe("not_found");
    expect(served.status).toBe(SCENARIO_STATUS.not_found);
    expect((served.body as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  it("a real 502 stays a 502", () => {
    expect(servedFixture({ ...legacy, sourceStatus: 502 })).toEqual({ ...legacy, sourceStatus: 502 });
  });

  it("yields to a newer real not_found recording", () => {
    const newer = {
      scenario: "not_found",
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "m", correlationId: "c" } },
      sourceStatus: 404,
      capturedAt: "2026-10-01T00:00:00.000Z",
    };
    expect(servedFixtures([legacy, newer])).toEqual([newer]);
  });
});
