/**
 * The write gate — credential and authorization.
 *
 * With human oversight sitting at grant approval rather than per call, these
 * checks ARE the runtime control. Each is tested for the thing it stops:
 * a leaked read token writing, a READ grant being stretched into a write, a
 * DRAFT interface changing a client's system, and an expired approval living on.
 */

import { randomBytes } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirstClient: vi.fn(),
  updateClient: vi.fn(),
  findFirstInterface: vi.fn(),
  findManyGrants: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    solutionClient: { findFirst: mocks.findFirstClient, update: mocks.updateClient },
    interface: { findFirst: mocks.findFirstInterface },
    apiAccessGrant: { findMany: mocks.findManyGrants },
  },
}));

import { resolveWritableInterface } from "@/lib/northbound/access";
import {
  generateWriteCredential,
  verifyWriteCredential,
  WRITE_KEY_PREFIX,
} from "@/lib/northbound/write-credential";
import { sealSecrets, solutionClientAad } from "@/lib/sap-public/connection-crypto";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const SCOPE = tenantScopeOf("org_a");
const NOW = new Date("2026-07-25T12:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");

const KEY_ENV = "SAP_CONNECTION_ENCRYPTION_KEY";
let originalKey: string | undefined;

beforeAll(() => {
  originalKey = process.env[KEY_ENV];
  process.env[KEY_ENV] = randomBytes(32).toString("hex");
});
afterAll(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
});

const WRITE_IFACE = {
  id: "if_1",
  name: "Create BP",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  entitySet: "A_BusinessPartner",
  operation: "CREATE",
  mode: "WRITE",
  version: 1,
  solutionId: "sol_1",
  status: "ACTIVE",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirstInterface.mockResolvedValue(WRITE_IFACE);
  mocks.findManyGrants.mockResolvedValue([
    { decision: "APPROVED", expiresAt: null, operation: "CREATE" },
  ]);
});

describe("the write credential is a SECOND secret", () => {
  const raw = "cew_testkey_abcdefghijklmnop";

  function sealed(org = "org_a", sol = "sol_1") {
    return sealSecrets({ writeSecret: raw }, solutionClientAad(org, sol));
  }

  it("is generated with its own distinct prefix", () => {
    const k = generateWriteCredential();
    expect(k.startsWith(WRITE_KEY_PREFIX)).toBe(true);
    // Distinct from the read token's `ce_`, so the two are never confused in a log.
    expect(k.startsWith("ce_")).toBe(false);
    expect(k).not.toBe(generateWriteCredential());
  });

  it("accepts the correct key", async () => {
    mocks.findFirstClient.mockResolvedValue({ secretsCiphertext: sealed() });
    expect(await verifyWriteCredential(SCOPE, "sol_1", raw)).toBe(true);
  });

  it("rejects a wrong key", async () => {
    mocks.findFirstClient.mockResolvedValue({ secretsCiphertext: sealed() });
    expect(await verifyWriteCredential(SCOPE, "sol_1", "cew_wrong_aaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("rejects an absent header — a read token alone must not write", async () => {
    mocks.findFirstClient.mockResolvedValue({ secretsCiphertext: sealed() });
    expect(await verifyWriteCredential(SCOPE, "sol_1", null)).toBe(false);
  });

  it("rejects when no credential is configured, without saying so", async () => {
    // "No write key is set" would tell an attacker they need only find one secret.
    mocks.findFirstClient.mockResolvedValue({ secretsCiphertext: null });
    expect(await verifyWriteCredential(SCOPE, "sol_1", raw)).toBe(false);
  });

  it("rejects a blob sealed for a DIFFERENT solution", async () => {
    // AAD binding: lifting a ciphertext onto another row does not work.
    mocks.findFirstClient.mockResolvedValue({ secretsCiphertext: sealed("org_a", "sol_other") });
    expect(await verifyWriteCredential(SCOPE, "sol_1", raw)).toBe(false);
  });

  it("rejects a blob sealed for a different ORGANIZATION", async () => {
    mocks.findFirstClient.mockResolvedValue({ secretsCiphertext: sealed("org_b", "sol_1") });
    expect(await verifyWriteCredential(SCOPE, "sol_1", raw)).toBe(false);
  });

  it("scopes the lookup to the caller's organization", async () => {
    mocks.findFirstClient.mockResolvedValue({ secretsCiphertext: sealed() });
    await verifyWriteCredential(SCOPE, "sol_1", raw);
    const where = mocks.findFirstClient.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.organizationId).toBe("org_a");
  });
});

describe("only an ACTIVE write interface may write", () => {
  it("allows an ACTIVE WRITE interface with a live grant", async () => {
    expect((await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW)).ok).toBe(true);
  });

  it("refuses a READ-mode interface", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...WRITE_IFACE, mode: "READ" });
    const r = await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("READ_ONLY_INTERFACE");
  });

  it("refuses a DRAFT interface", async () => {
    // A draft has not been through review. Reading from one is premature;
    // WRITING from one changes a client's system on nobody's authority.
    mocks.findFirstInterface.mockResolvedValue({ ...WRITE_IFACE, status: "DRAFT" });
    const r = await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INTERFACE_NOT_ACTIVE");
  });

  it("refuses a DEPRECATED interface", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...WRITE_IFACE, status: "DEPRECATED" });
    expect((await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW)).ok).toBe(false);
  });

  it("refuses a sibling solution's interface with the same message as absent", async () => {
    mocks.findFirstInterface.mockResolvedValue({ ...WRITE_IFACE, solutionId: "sol_other" });
    const r = await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("No such interface.");
  });
});

describe("the grant must actually authorise a WRITE", () => {
  it("refuses when a READ grant is all that exists", async () => {
    // The entire reason `operation` is recorded on a grant.
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: null, operation: "READ" },
    ]);
    const r = await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("NO_APPROVED_GRANT");
  });

  it("refuses an unapproved write request", async () => {
    for (const decision of ["REQUESTED", "REJECTED", "EXPIRED"]) {
      mocks.findManyGrants.mockResolvedValue([{ decision, expiresAt: null, operation: "CREATE" }]);
      const r = await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
      expect(r.ok, decision).toBe(false);
    }
  });

  it("queries grants for the CLIENT'S environment, not any environment", async () => {
    await resolveWritableInterface(SCOPE, "sol_1", "if_1", "SANDBOX", NOW);
    const where = mocks.findManyGrants.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where.environment).toBe("SANDBOX");
    expect(where.organizationId).toBe("org_a");
  });

  it("refuses an EXPIRED grant at CALL time", async () => {
    // With no per-call human step, expiry is what stops "approved once" becoming
    // "approved forever".
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: PAST, operation: "CREATE" },
    ]);
    const r = await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("GRANT_EXPIRED");
  });

  it("accepts a grant that has not expired", async () => {
    mocks.findManyGrants.mockResolvedValue([
      { decision: "APPROVED", expiresAt: FUTURE, operation: "UPDATE" },
    ]);
    expect((await resolveWritableInterface(SCOPE, "sol_1", "if_1", "PROD", NOW)).ok).toBe(true);
  });
});
