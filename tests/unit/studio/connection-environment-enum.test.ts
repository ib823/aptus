/**
 * One ACTIVE connection per (org, product, environment) (audit E15 P1, decision D1).
 *
 * THE DEFECT. `resolveSapConnectionForEnvironment` refuses `AMBIGUOUS` when two
 * active connections both declare the environment a credential asks for — correct,
 * but late: the pair was created days earlier and the first symptom is an
 * integration going dark. A partial unique index stops the ambiguity being
 * WRITTEN, but Prisma cannot express a partial index, so it lives only in
 * migration SQL — and `ci.yml`'s fast jobs build their database with
 * `prisma db push`, which never runs migrations. A database provisioned that way
 * silently lacks the invariant.
 *
 * So it is enforced TWICE, and this file pins both halves:
 *
 *   - In the DATABASE, for every environment built from migration history. The
 *     migration that retypes the column also rebuilds the index, because Postgres
 *     drops an index when its column's type changes.
 *   - In the API, which refuses the twin with a sentence naming the other
 *     connection while the consultant is still looking at the form. This is the
 *     half a db-push database actually has, which is why it is not optional.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A namespace type import, matching probe-one-connection.test.ts. An inline
// `typeof import(...)` is what @typescript-eslint/consistent-type-imports
// forbids, and this repo runs that rule as an error.
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

const ROOT = process.cwd();
const SCHEMA = readFileSync(path.resolve(ROOT, "prisma/schema.prisma"), "utf8");
const ENUM_MIGRATION = readFileSync(
  path.resolve(ROOT, "prisma/migrations/20260912010000_sap_environment_enum/migration.sql"),
  "utf8",
);

const CONSULTANT = { id: "u_1", role: "consultant", organizationId: "org_a", email: "c@abeam.com" };

function body(over: Record<string, unknown> = {}) {
  return {
    product: "s4hana",
    key: "x5m-dev",
    label: "X5M Development",
    baseUrl: "https://my403706-api.s4hana.cloud.sap",
    authType: "basic",
    username: "COMM_USER",
    password: "pw",
    environment: "DEV",
    ...over,
  };
}

function request(payload: unknown) {
  return new Request("https://example.test/api/studio/connections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.getCurrentUser.mockResolvedValue(CONSULTANT);
  mocks.findFirstConnection.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ id: "conn_new", product: "s4hana", key: "x5m-dev" });
  mocks.writeConfigAudit.mockResolvedValue(undefined);
});

describe("the column is an enum", () => {
  it("SapEnvironment declares exactly the four trust levels", () => {
    const block = /enum SapEnvironment \{([^}]*)\}/.exec(SCHEMA)?.[1] ?? "";
    const values = block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("/"));
    expect(values).toEqual(["SANDBOX", "DEV", "TEST", "PROD"]);
  });

  it("SapConnection.environment uses it, and stays nullable", () => {
    // Nullable is load-bearing: "undeclared" is a state the resolver already
    // models (a read proceeds flagged bindingUnverified, a write refuses with
    // UNDECLARED_ENVIRONMENT_WRITE). Making it required would delete that state.
    expect(SCHEMA).toMatch(/environment\s+SapEnvironment\?/);
  });
});

describe("the partial unique index survives the retype", () => {
  it("is dropped and recreated by the migration that changes the column's type", () => {
    // Postgres drops an index when its column's type changes. A migration that
    // retyped the column and walked away would leave the invariant silently gone
    // from every environment that ran it.
    expect(ENUM_MIGRATION).toContain('DROP INDEX IF EXISTS "SapConnection_active_binding_tuple"');
    expect(ENUM_MIGRATION).toContain('CREATE UNIQUE INDEX "SapConnection_active_binding_tuple"');
  });

  it("keeps all three scoping decisions", () => {
    // ACTIVE only (the resolver filters isActive), DECLARED only (NULL is the
    // documented undeclared state), NULLS NOT DISTINCT (two active DEV rows with
    // no SAP client are precisely the indistinguishable pair).
    expect(ENUM_MIGRATION).toContain("NULLS NOT DISTINCT");
    expect(ENUM_MIGRATION).toMatch(/WHERE "isActive" AND "environment" IS NOT NULL/);
  });

  it("converts an unrecognised landscape to NULL rather than guessing", () => {
    // Silently calling someone's "STAGING" row PROD is how an accidental
    // production write happens.
    expect(ENUM_MIGRATION).toMatch(/ELSE NULL/);
  });
});

describe("the API refuses the twin — the half a db-push database has", () => {
  it("refuses a second ACTIVE connection for the same (org, product, environment)", async () => {
    mocks.findFirstConnection
      // the "is this a replace?" lookup
      .mockResolvedValueOnce(null)
      // the twin lookup
      .mockResolvedValueOnce({ key: "x5m-dev-old", label: "X5M Development (old)" });

    const res = await POST(request(body()));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };

    // It names the OTHER connection, because the consultant is still looking at
    // the form and can act on it.
    expect(json.error.message).toContain("X5M Development (old)");
    expect(json.error.message).toContain("x5m-dev-old");
    expect(json.error.message).toContain("DEV");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("scopes the twin lookup to ACTIVE rows with a DECLARED environment", async () => {
    mocks.findFirstConnection.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await POST(request(body()));

    const twinCall = mocks.findFirstConnection.mock.calls[1]![0] as {
      where: Record<string, unknown>;
    };
    expect(twinCall.where).toMatchObject({
      organizationId: "org_a",
      product: "s4hana",
      isActive: true,
      environment: "DEV",
    });
    // Re-saving the same KEY is replacement, not duplication — the documented
    // way to rotate a connection's credentials.
    expect(twinCall.where.NOT).toEqual({ key: "x5m-dev" });
  });

  it("allows a second connection in a DIFFERENT environment", async () => {
    mocks.findFirstConnection.mockResolvedValue(null);
    const res = await POST(request(body({ key: "x5m-test", environment: "TEST" })));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ environment: "TEST" }));
  });

  it("does not run the twin check at all for an undeclared environment", async () => {
    // Blocking a second undeclared row would punish an estate for not having
    // been migrated yet, and the resolver already quarantines them.
    mocks.findFirstConnection.mockResolvedValue(null);
    const res = await POST(request(body({ environment: undefined })));
    expect(res.status).toBe(200);
    expect(mocks.findFirstConnection).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ environment: null }));
  });
});

describe("an unrecognised environment is refused, not coerced", () => {
  it("refuses 'Staging' rather than storing it as undeclared", async () => {
    // Silently downgrading it would leave the consultant believing the
    // connection is declared while the broker refuses every write against it
    // with UNDECLARED_ENVIRONMENT_WRITE.
    const res = await POST(request(body({ environment: "Staging" })));
    expect(res.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("accepts the aliases the migration accepts, normalised", async () => {
    mocks.findFirstConnection.mockResolvedValue(null);
    const res = await POST(request(body({ environment: " qas " })));
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ environment: "TEST" }));
  });
});
