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
 * form, before anything is saved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolverModule from "@/lib/sap-public/connection-resolver";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstConnection: vi.fn(),
  upsert: vi.fn(),
  writeConfigAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapConnection: { findFirst: mocks.findFirstConnection } },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ConnectionResolverModule>();
  return { ...actual, upsertSapConnection: mocks.upsert };
});
vi.mock("@/lib/studio/audit", () => ({ writeConfigAudit: mocks.writeConfigAudit }));

import { POST } from "@/app/api/studio/connections/route";

const CONSULTANT = { id: "u_1", role: "consultant", organizationId: "org_a", email: "c@abeam.com" };

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

function request(payload: unknown) {
  return new Request("https://example.test/api/studio/connections", {
    method: "POST",
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
