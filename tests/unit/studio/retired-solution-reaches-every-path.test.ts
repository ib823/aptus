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
  findFirstClient: vi.fn(),
  upsertClient: vi.fn(),
  updateClient: vi.fn(),
  closeLinks: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => {
  const client = {
    interface: { findFirst: mocks.findFirstInterface },
    solution: { findFirst: mocks.findFirstSolution },
    solutionClient: {
      findMany: mocks.findManyClients,
      findFirst: mocks.findFirstClient,
      upsert: mocks.upsertClient,
      update: mocks.updateClient,
    },
    // Every owner named here is a live member of the organization (A69).
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })),
    },
    apiAccessGrant: { findMany: mocks.findManyGrants },
    configAudit: { create: mocks.createAudit },
    keyClaimLink: { updateMany: mocks.closeLinks },
  };
  // Each key change is one transaction under the app lock (P0.1).
  return {
    prisma: { ...client, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ ...client, $queryRaw: async () => [] }) },
  };
});
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
import { PATCH as changeToken, POST as issueToken } from "@/app/api/studio/clients/route";

const BUILDER = { id: "u_builder", email: "dev@abeam.com", role: "consultant", organizationId: "org_a", authMethod: "session" };

const IFACE = {
  id: "if_1",
  name: "Business Partner read",
  solutionId: "sol_1",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  entitySet: "A_BusinessPartner",
};

/** Live, and inside its expiry: a TEST key must have one (P0.11), and the write key follows it. */
const LIVE_TEST_CLIENT = {
  id: "cli_test",
  environment: "TEST",
  sapClient: null,
  isActive: true,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 30 * 86_400_000),
};

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
      {
        id: "cli_dev",
        environment: "DEV",
        sapClient: null,
        isActive: true,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      },
      LIVE_TEST_CLIENT,
    ]);

    // With DEV expired, TEST is the only live row — and naming it still works.
    const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

    expect(out.data?.writeKey).toBe("cew_generated");
    expect(mocks.setWriteCredential).toHaveBeenCalledWith(expect.anything(), "cli_test", "cew_generated", {
      issuerId: BUILDER.id,
    });
  });

  it("refuses a write key onto a TEST key with no expiry — it would never end either (P0.11)", async () => {
    mocks.findManyClients.mockResolvedValue([{ ...LIVE_TEST_CLIENT, expiresAt: null }]);

    const res = await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body));
    const out = await json(res);

    expect(res.status).toBe(400);
    expect(out.error?.message).toMatch(/no expiry/i);
    expect(out.error?.message).toMatch(/Rotate the credential first/);
    expect(out.error?.message).toMatch(/keeps working for up to 24 hours/);
    expect(mocks.setWriteCredential).not.toHaveBeenCalled();
  });

  // Review round 2: the advice read "keeps working for 0 hours ... so nothing
  // fails" with the overlap switched off, where the rotation cuts over at once.
  it("does not promise an overlap that is switched off", async () => {
    vi.stubEnv("COREEDGE_KEY_ROTATION_OVERLAP_HOURS", "0");
    try {
      mocks.findManyClients.mockResolvedValue([{ ...LIVE_TEST_CLIENT, expiresAt: null }]);

      const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

      expect(out.error?.message).toMatch(/Rotate the credential first/);
      expect(out.error?.message).not.toMatch(/nothing fails|0 hours/);
      expect(out.error?.message).toMatch(/stops at once/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("an expiry in the future is still live", async () => {
    mocks.findManyClients.mockResolvedValue([
      { ...LIVE_TEST_CLIENT, expiresAt: new Date(Date.now() + 86_400_000) },
    ]);

    const out = await json(await issueWriteKey(post("http://localhost/api/studio/clients/write-credential", body)));

    expect(out.data?.writeKey).toBe("cew_generated");
  });
});

/*
 * The runtime token's own two doors. Both minted a fresh `ce_` token for a
 * RETIRED solution and answered "Copy this token now" — a token that works the
 * moment one ungated PATCH sets the solution back to DRAFT, alongside any
 * write key still sealed on its row.
 */
describe("the runtime token is not minted for a retired solution", () => {
  function patch(body: unknown) {
    return new Request("http://localhost/api/studio/clients", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }) as never;
  }

  beforeEach(() => {
    mocks.closeLinks.mockResolvedValue({ count: 0 });
    mocks.findFirstSolution.mockResolvedValue({ ...OWNED_SOLUTION, status: "RETIRED" });
    mocks.findFirstClient.mockResolvedValue({
      id: "cli_test",
      solutionId: "sol_1",
      environment: "TEST",
      isActive: false,
      revokedAt: new Date("2026-09-01T00:00:00Z"),
      expiresAt: null,
    });
  });

  it("refuses to issue one", async () => {
    const out = await json(
      await issueToken(
        post("http://localhost/api/studio/clients", { solutionId: "sol_1", label: "x", environment: "TEST" }),
      ),
    );

    expect(out.error?.code).toBe("FORBIDDEN");
    expect(out.error?.message).toMatch(/RETIRED/);
    expect(mocks.upsertClient).not.toHaveBeenCalled();
  });

  it("refuses to rotate one", async () => {
    const out = await json(await changeToken(patch({ clientId: "cli_test", action: "rotate" })));

    expect(out.error?.code).toBe("FORBIDDEN");
    expect(out.error?.message).toMatch(/RETIRED/);
    expect(mocks.updateClient).not.toHaveBeenCalled();
  });

  it("still lets it be revoked — stopping a credential is never the dangerous direction", async () => {
    mocks.updateClient.mockResolvedValue({ id: "cli_test", solutionId: "sol_1" });

    const out = await json(await changeToken(patch({ clientId: "cli_test", action: "revoke" })));

    expect(out.error).toBeUndefined();
    expect(mocks.updateClient).toHaveBeenCalled();
  });
});
