/**
 * A RETIRED solution, on the two paths that did not ask.
 *
 * `authenticateClientToken` refuses a retired solution's credential, so every
 * call the deployed application makes 401s. Two surfaces never went through
 * that function and so never learned the rule:
 *
 *   • the Test Console's dry run resolves a credential ROW rather than a bearer
 *     token, so a retired solution still ran green in the console while every
 *     real call against it was already being refused — the console was the one
 *     place the decommissioning had no effect, which is precisely the failure
 *     the gate exists to close;
 *
 *   • the write-key route checked owners, segregation and grants, but not
 *     whether the solution was still callable, so it would mint a secret that
 *     authorises nothing today and everything the moment someone reactivates.
 *
 * The same file also pins the write key's OTHER missing predicate: a runtime
 * credential's expiry. A key sealed onto an expired credential can never be
 * presented, because the bearer token it travels with is refused first.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstInterface: vi.fn(),
  findFirstSolution: vi.fn(),
  findManyClients: vi.fn(),
  findManyGrants: vi.fn(),
  createAudit: vi.fn(),
  resolveReadableInterface: vi.fn(),
  recordNorthboundCall: vi.fn(),
  setWriteCredential: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findFirst: mocks.findFirstInterface },
    solution: { findFirst: mocks.findFirstSolution },
    solutionClient: { findMany: mocks.findManyClients },
    apiAccessGrant: { findMany: mocks.findManyGrants },
    configAudit: { create: mocks.createAudit },
  },
}));
vi.mock("@/lib/northbound/access", () => ({
  resolveReadableInterface: mocks.resolveReadableInterface,
}));
vi.mock("@/lib/northbound/audit", () => ({ recordNorthboundCall: mocks.recordNorthboundCall }));
vi.mock("@/lib/northbound/write-credential", () => ({
  generateWriteCredential: () => "cew_generated",
  setWriteCredential: mocks.setWriteCredential,
}));

import { POST as brokerRun } from "@/app/api/studio/test/broker-run/route";
import { POST as issueWriteKey } from "@/app/api/studio/clients/write-credential/route";

const BUILDER = { id: "u_builder", email: "dev@abeam.com", role: "consultant", organizationId: "org_a" };

const IFACE = {
  id: "if_1",
  name: "Business Partner read",
  solutionId: "sol_1",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  entitySet: "A_BusinessPartner",
};

const LIVE_TEST_CLIENT = { id: "cli_test", environment: "TEST", sapClient: null, expiresAt: null };

/** A solution whose owners are all named and none of them is the caller. */
const OWNED_SOLUTION = {
  id: "sol_1",
  name: "QA-E2E-Main",
  status: "ACTIVE",
  technicalOwnerId: "u_tech",
  businessOwnerId: "u_biz",
  supportOwnerId: "u_sup",
};

const APPROVED_WRITE_GRANT = {
  decision: "APPROVED",
  operation: "CREATE",
  environment: "TEST",
  expiresAt: null,
  revokedAt: null,
};

function post(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

async function json(res: Response) {
  return (await res.json()) as {
    data?: { outcome?: string; refusal?: { kind: string; message: string }; writeKey?: string };
    error?: { code?: string; message?: string };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstInterface.mockResolvedValue(IFACE);
  mocks.findFirstSolution.mockResolvedValue(OWNED_SOLUTION);
  mocks.findManyClients.mockResolvedValue([LIVE_TEST_CLIENT]);
  mocks.findManyGrants.mockResolvedValue([APPROVED_WRITE_GRANT]);
  mocks.createAudit.mockResolvedValue({ id: "a1" });
  mocks.recordNorthboundCall.mockResolvedValue(undefined);
  mocks.setWriteCredential.mockResolvedValue(true);
  mocks.resolveReadableInterface.mockResolvedValue({
    ok: false,
    reason: "NO_GRANT",
    message: "No approved grant covers this interface.",
  });
});

describe("the Test Console's dry run applies the solution gate", () => {
  it("refuses a RETIRED solution before it considers the credential at all", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...OWNED_SOLUTION, status: "RETIRED" });

    const out = await json(
      await brokerRun(post("http://localhost/api/studio/test/broker-run", { interfaceId: "if_1" })),
    );

    expect(out.data?.outcome).toBe("refused");
    expect(out.data?.refusal?.kind).toBe("SOLUTION_RETIRED");
    expect(out.data?.refusal?.message).toMatch(/RETIRED/);
    // Before the credential: the run never asked which credential to be.
    expect(mocks.findManyClients).not.toHaveBeenCalled();
    expect(mocks.resolveReadableInterface).not.toHaveBeenCalled();
  });

  it("refuses when the solution row is gone rather than running an orphan", async () => {
    mocks.findFirstSolution.mockResolvedValue(null);

    const out = await json(
      await brokerRun(post("http://localhost/api/studio/test/broker-run", { interfaceId: "if_1" })),
    );

    expect(out.data?.refusal?.kind).toBe("SOLUTION_MISSING");
  });

  it("lets an ACTIVE solution through to the credential and grant checks", async () => {
    const out = await json(
      await brokerRun(post("http://localhost/api/studio/test/broker-run", { interfaceId: "if_1" })),
    );

    // The grant refusal, not the solution one — the gate is a gate, not a wall.
    expect(out.data?.refusal?.kind).toBe("NO_GRANT");
    expect(mocks.resolveReadableInterface).toHaveBeenCalled();
  });
});

describe("the write key is not minted onto a dead credential", () => {
  const body = { solutionId: "sol_1", environment: "TEST" };

  it("issues one when the solution is live, owned by others, and granted", async () => {
    const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

    expect(out.data?.writeKey).toBe("cew_generated");
    expect(mocks.setWriteCredential).toHaveBeenCalled();
  });

  it("refuses on a RETIRED solution — the credential it would seal onto is already refused", async () => {
    mocks.findFirstSolution.mockResolvedValue({ ...OWNED_SOLUTION, status: "RETIRED" });

    const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

    expect(out.error?.code).toBe("FORBIDDEN");
    expect(out.error?.message).toMatch(/RETIRED/);
    expect(mocks.setWriteCredential).not.toHaveBeenCalled();
  });

  it("treats an EXPIRED runtime credential as no credential, not as one to seal onto", async () => {
    mocks.findManyClients.mockResolvedValue([
      { ...LIVE_TEST_CLIENT, expiresAt: new Date(Date.now() - 60_000) },
    ]);

    const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

    expect(out.error?.code).toBe("FORBIDDEN");
    expect(out.error?.message).toMatch(/expired/i);
    expect(mocks.setWriteCredential).not.toHaveBeenCalled();
  });

  it("seals onto the unexpired credential when one environment's has lapsed", async () => {
    mocks.findManyClients.mockResolvedValue([
      { id: "cli_dev", environment: "DEV", sapClient: null, expiresAt: new Date(Date.now() - 60_000) },
      LIVE_TEST_CLIENT,
    ]);

    // With DEV expired, TEST is the only live row — and naming it still works.
    const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

    expect(out.data?.writeKey).toBe("cew_generated");
    expect(mocks.setWriteCredential).toHaveBeenCalledWith(expect.anything(), "cli_test", "cew_generated");
  });

  it("an expiry in the future is still live", async () => {
    mocks.findManyClients.mockResolvedValue([
      { ...LIVE_TEST_CLIENT, expiresAt: new Date(Date.now() + 86_400_000) },
    ]);

    const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

    expect(out.data?.writeKey).toBe("cew_generated");
  });
});
