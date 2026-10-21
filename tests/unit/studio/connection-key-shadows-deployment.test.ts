/**
 * A new connection may not take a key the deployment already uses (audit A41).
 *
 * THE DEFECT. The console resolves a tenant key against the deployment's
 * `{PREFIX}_*` tenants as well as the organization's own connections. A
 * deployment configured with S4_TDD_BASE_URL has one tenant, keyed "default".
 * A consultant could save their customer's PROD connection as "default"; the
 * switcher then listed it as their own system, while every read went to the
 * shared demo host with the deployment's credentials and skipped the PROD
 * ceiling. Nothing told them their connection was never contacted.
 *
 * The read path now refuses such a key (tenant-registries.test.ts). This is the
 * other half: the collision is refused while the consultant is still on the
 * form, before anything is saved. The last block holds the two halves to each
 * other: the way out the read refusal names has to be one this route lets a
 * consultant take, in the order it names the steps.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstConnection: vi.fn(),
  updateConnection: vi.fn(),
  upsert: vi.fn(),
  writeConfigAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapConnection: { findFirst: mocks.findFirstConnection, updateMany: mocks.updateConnection } },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ConnectionResolverModule>();
  return { ...actual, upsertSapConnection: mocks.upsert };
});
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: mocks.writeConfigAudit }));

import { PATCH, POST } from "@/app/api/studio/connections/route";
import { readTenantRefusalResponse } from "@/lib/sap-public/tenant-for-read";

const CONSULTANT = { id: "u_1", role: "consultant", organizationId: "org_a", email: "c@abeam.com", authMethod: "session" };

function body(over: Record<string, unknown> = {}) {
  return {
    product: "s4hana",
    key: "default",
    label: "Org A PROD system",
    baseUrl: "https://my403706-api.s4hana.cloud.sap",
    authType: "basic",
    username: "COMM_USER",
    password: "pw",
    environment: "PROD",
    ...over,
  };
}

function request(payload: unknown, method = "POST") {
  return new Request("https://example.test/api/studio/connections", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }) as never;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
  mocks.findFirstConnection.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ id: "conn_new", product: "s4hana", key: "default" });
  mocks.writeConfigAudit.mockResolvedValue(undefined);
  // The single-tenant deployment the audit describes: one env tenant, "default".
  vi.stubEnv("S4_TDD_TENANTS_JSON", "");
  vi.stubEnv("S4_TDD_BASE_URL", "https://demo.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a new connection key that a deployment tenant already uses", () => {
  it("is refused before anything is saved, naming the key", async () => {
    const res = await POST(request(body()));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toContain('"default"');
    expect(json.error.message).toMatch(/configured on this deployment/);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("is refused in whatever spelling normalizes to it", async () => {
    // The key is normalized before it is stored, so " Default " IS "default".
    const res = await POST(request(body({ key: " Default " })));
    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("is accepted for another product, whose deployment has no such tenant", async () => {
    // Private cloud reads its own S4_PRIVATE_TDD prefix; only S4_TDD is set here.
    const res = await POST(request(body({ product: "cloud-erp-private" })));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
  });
});

describe("what is still allowed", () => {
  it("a key the deployment does not use", async () => {
    const res = await POST(request(body({ key: "acme-prod" })));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("re-saving a row that already has the key, which is how its credentials are rotated", async () => {
    // A row saved before this check existed. It may be serving northbound calls,
    // which never look at deployment tenants; the console read of it is refused
    // separately. Blocking the rotation would break the calls that work.
    mocks.findFirstConnection.mockResolvedValueOnce({ id: "conn_existing" }).mockResolvedValue(null);

    const res = await POST(request(body()));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("any key, when the deployment's tenant env is malformed", async () => {
    // One bad variable must not stop every connection being saved; the read
    // path refuses a collision once the env is readable again.
    vi.stubEnv("S4_TDD_TENANTS_JSON", "not json");

    const res = await POST(request(body()));
    expect(res.status).toBe(200);
  });
});

/*
 * THE WAY OUT THE READ REFUSAL NAMES, TAKEN ON THIS ROUTE.
 *
 * A row saved as "default" before the check above existed is still refused at
 * read time with TENANT_KEY_SHADOWED, and that message is the only place the
 * consultant learns what to do. It used to say "save the connection again
 * under a different key, then deactivate this one". The first step could not
 * be done: the twin check refuses a second active connection on the same
 * declared environment whatever its key, and the row A41 was about is PROD.
 * So these drive the route over rows it can actually read back, in both
 * orders, and hold the message to the one that works.
 */
describe("the TENANT_KEY_SHADOWED remedy, followed in the order it is given", () => {
  type Row = Record<string, unknown>;
  let rows: Row[];

  /** Applies the route's own `where`, including the twin check's NOT. */
  function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([field, expected]) =>
      field === "NOT" ? !matches(row, expected as Row) : (row[field] ?? null) === expected,
    );
  }

  beforeEach(() => {
    rows = [
      {
        id: "conn_old",
        organizationId: "org_a",
        product: "s4hana",
        key: "default",
        label: "Org A PROD system",
        environment: "PROD",
        client: null,
        isActive: true,
        writeEnabled: false,
      },
    ];
    mocks.findFirstConnection.mockImplementation(
      async ({ where }: { where: Row }) => rows.find((r) => matches(r, where)) ?? null,
    );
    // Conditional on the state the toggle judged (review round 4), so it counts the rows it changed.
    mocks.updateConnection.mockImplementation(async ({ where, data }: { where: Row; data: Row }) => {
      const matched = rows.filter((r) => matches(r, where));
      for (const row of matched) Object.assign(row, data);
      return { count: matched.length };
    });
    mocks.upsert.mockImplementation(async (input: Row) => {
      const row = { ...input, id: "conn_new", isActive: true };
      rows.push(row);
      return row;
    });
  });

  async function remedy(): Promise<string> {
    const res = readTenantRefusalResponse({ refused: "TENANT_KEY_SHADOWED" }, "default");
    return ((await res.json()) as { error: { message: string } }).error.message;
  }

  it("names deactivating this connection before saving it under another key", async () => {
    const message = await remedy();
    const deactivate = message.search(/deactivate this connection/i);
    const saveAgain = message.search(/save it again under a different key/i);

    expect(deactivate, message).toBeGreaterThanOrEqual(0);
    expect(saveAgain, message).toBeGreaterThan(deactivate);
  });

  it("works in that order: deactivated first, the connection saves under its new key", async () => {
    const off = await PATCH(request({ id: "conn_old", isActive: false }, "PATCH"));
    expect(off.status).toBe(200);

    const res = await POST(request(body({ key: "acme-prod" })));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(rows.filter((r) => r.isActive).map((r) => r.key)).toEqual(["acme-prod"]);
  });

  it("does not work the other way round: the new key is refused as the active row's twin", async () => {
    const res = await POST(request(body({ key: "acme-prod" })));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.message).toMatch(/already the active PROD connection/);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
