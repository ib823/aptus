/**
 * No sequence of PATCHes reaches ACTIVE without the activation gates and a
 * PROMOTE audit row (P0.1, audit A46).
 *
 * THE DEFECT. The gates — an entity set is set, UPDATE is never activated, a
 * write holds the full write chain in some environment — ran only on the
 * status transition. A READ interface could be activated (it needs only an
 * entity set) and then, already ACTIVE, be PATCHed to CREATE or UPDATE or have
 * its entity set cleared: 200, still ACTIVE, no grant or credential query,
 * and the audit row said UPDATE.
 *
 * The route is driven against an in-memory interface row that each PATCH
 * really updates, so a SEQUENCE of PATCHes is what is tested, and the
 * property below walks every sequence of up to three edits.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findManyClients: vi.fn(),
  findManyGrants: vi.fn(),
  audits: [] as { action: string; after: Record<string, unknown> }[],
  row: null as null | Record<string, unknown>,
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: {
      findFirst: vi.fn(async () => (mocks.row ? { ...mocks.row } : null)),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const next = { ...mocks.row };
        for (const [k, v] of Object.entries(data)) {
          if (k === "version" && v && typeof v === "object") next.version = (next.version as number) + 1;
          else next[k] = v;
        }
        mocks.row = next;
        return { ...next };
      }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    solution: { findFirst: vi.fn() },
    solutionClient: { findMany: mocks.findManyClients },
    apiAccessGrant: { findMany: mocks.findManyGrants },
    configAudit: {
      create: vi.fn(async ({ data }: { data: { action: string; after: Record<string, unknown> } }) => {
        mocks.audits.push({ action: data.action, after: data.after });
        return { id: `a${mocks.audits.length}` };
      }),
    },
  },
}));

import { PATCH } from "@/app/api/studio/interfaces/route";
import { UPDATE_NOT_EXECUTABLE } from "@/lib/studio/write-readiness";

const BUILDER = { id: "u1", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };

const DRAFT_READ = {
  id: "if_1",
  name: "Business Partner read",
  version: 1,
  operation: "READ",
  entitySet: "A_BusinessPartner",
  mode: "READ",
  status: "DRAFT",
  mappingVersion: null,
  solutionId: "sol_1",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  servicePath: null,
  odataVersion: null,
  serviceVerifiedAt: null,
  serviceVerifications: null,
};

function req(body: unknown) {
  return new Request("http://localhost:3003/api/studio/interfaces", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

/** A TEST credential carrying a write key, and an approved TEST CREATE grant bound to this interface. */
function fullWriteChainInTest() {
  mocks.findManyClients.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      "NOT" in where
        ? [{ id: "cl_test" }]
        : [{ id: "cl_test", environment: "TEST", expiresAt: null, sapClient: null }],
    ),
  );
  mocks.findManyGrants.mockImplementation(({ where }: { where: { operation: string } }) =>
    Promise.resolve(
      where.operation === "CREATE"
        ? [
            {
              environment: "TEST",
              decision: "APPROVED",
              expiresAt: null,
              revokedAt: null,
              interfaceId: "if_1",
              sapProduct: "s4hana",
            },
          ]
        : [],
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.audits.length = 0;
  mocks.row = { ...DRAFT_READ };
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findManyClients.mockResolvedValue([]);
  mocks.findManyGrants.mockResolvedValue([]);
});

const activeRead = () => {
  mocks.row = { ...DRAFT_READ, status: "ACTIVE" };
};

describe("a contract change to an ACTIVE interface runs the activation gates", () => {
  it("refuses switching an ACTIVE READ to CREATE without the write chain", async () => {
    activeRead();
    const res = await PATCH(req({ id: "if_1", operation: "CREATE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/cannot be activated until some environment holds the full write chain/);
    // The write-chain queries ran — they never did before.
    expect(mocks.findManyGrants).toHaveBeenCalled();
    expect(mocks.row).toMatchObject({ status: "ACTIVE", operation: "READ", mode: "READ" });
  });

  it("refuses switching an ACTIVE READ to UPDATE — UPDATE is never executable", async () => {
    activeRead();
    const res = await PATCH(req({ id: "if_1", operation: "UPDATE" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe(UPDATE_NOT_EXECUTABLE);
    expect(mocks.row).toMatchObject({ operation: "READ" });
  });

  it("refuses clearing the entity set of an ACTIVE interface", async () => {
    activeRead();
    const res = await PATCH(req({ id: "if_1", entitySet: null }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/without an entity set/);
    expect(mocks.row).toMatchObject({ entitySet: "A_BusinessPartner" });
  });

  it("lets a contract change through once the gates pass, and audits it as PROMOTE", async () => {
    activeRead();
    fullWriteChainInTest();
    const res = await PATCH(req({ id: "if_1", operation: "CREATE" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data.repromoted).toBe(true);
    expect(mocks.row).toMatchObject({ status: "ACTIVE", operation: "CREATE", mode: "WRITE", version: 2 });
    expect(mocks.audits.at(-1)).toMatchObject({ action: "PROMOTE", after: { repromoted: true } });
  });

  it("audits a new entity set on an ACTIVE read as PROMOTE too", async () => {
    activeRead();
    const res = await PATCH(req({ id: "if_1", entitySet: "A_Supplier" }));
    expect(res.status).toBe(200);
    expect(mocks.audits.at(-1)?.action).toBe("PROMOTE");
  });

  it("leaves a rename of an ACTIVE interface an ordinary UPDATE, with no gate queries", async () => {
    activeRead();
    const res = await PATCH(req({ id: "if_1", name: "Partners" }));
    expect(res.status).toBe(200);
    expect(mocks.audits.at(-1)?.action).toBe("UPDATE");
    expect(mocks.findManyGrants).not.toHaveBeenCalled();
  });

  it("ignores a product in the body: the product is not editable, so it cannot move a live interface", async () => {
    activeRead();
    const res = await PATCH(req({ id: "if_1", sapProduct: "s4hana-onprem", name: "Partners" }));
    expect(res.status).toBe(200);
    expect(mocks.row).toMatchObject({ sapProduct: "s4hana" });
  });

  it("counts only grants bound to THIS interface on its product toward the write chain", async () => {
    activeRead();
    fullWriteChainInTest();
    await PATCH(req({ id: "if_1", operation: "CREATE" }));
    const where = mocks.findManyGrants.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({
      organizationId: "org_a",
      solutionId: "sol_1",
      externalId: "API_BUSINESS_PARTNER",
      operation: "CREATE",
      OR: [{ interfaceId: "if_1", sapProduct: "s4hana" }, { interfaceId: null }],
    });
  });
});

/*
 * THE PROPERTY. From a DRAFT READ interface with no write chain anywhere,
 * every sequence of up to three PATCHes drawn from the edits below is applied
 * in order. Whenever the stored row is ACTIVE after a PATCH that changed its
 * status or its contract, the gates must hold of what is stored, and that
 * PATCH's audit row must say PROMOTE.
 */
const EDITS: readonly Record<string, unknown>[] = [
  { status: "ACTIVE" },
  { status: "DRAFT" },
  { operation: "CREATE" },
  { operation: "UPDATE" },
  { operation: "READ" },
  { entitySet: null },
  { entitySet: "A_Supplier" },
  { status: "ACTIVE", operation: "CREATE" },
  { status: "ACTIVE", entitySet: null },
];

function* sequences(length: number): Generator<Record<string, unknown>[]> {
  if (length === 0) {
    yield [];
    return;
  }
  for (const head of sequences(length - 1)) {
    for (const edit of EDITS) yield [...head, edit];
  }
}

describe("property: no PATCH order reaches ACTIVE without the gates and a PROMOTE row", () => {
  it("holds for every sequence of up to three edits", async () => {
    let checked = 0;
    for (let length = 1; length <= 3; length++) {
      for (const sequence of sequences(length)) {
        mocks.row = { ...DRAFT_READ };
        mocks.audits.length = 0;
        for (const edit of sequence) {
          const before = { ...mocks.row } as Record<string, unknown>;
          const res = await PATCH(req({ id: "if_1", ...edit }));
          const after = mocks.row as Record<string, unknown>;
          const label = JSON.stringify(sequence);
          if (res.status !== 200) {
            expect(after, label).toEqual(before);
            continue;
          }
          const statusOrContractMoved =
            before.status !== after.status ||
            before.operation !== after.operation ||
            before.entitySet !== after.entitySet;
          if (after.status === "ACTIVE" && statusOrContractMoved) {
            // The gates, with no write chain in any environment:
            expect(after.entitySet, label).not.toBeNull();
            expect(after.operation, label).toBe("READ");
            expect(mocks.audits.at(-1)?.action, label).toBe("PROMOTE");
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
