/**
 * Binding a credential's declared environment to the SAP connection actually called.
 *
 * WHAT THIS GUARDS. Before `resolveSapConnectionForEnvironment`, the broker took
 * the OLDEST active connection for an org+product. An organization holding a PROD
 * connection created before its SANDBOX one served every call — reads and writes —
 * from PROD, while the audit row sincerely recorded "SANDBOX", because the grant
 * check compared the environment to the TOKEN and never to the connection.
 *
 * The first test here is the one that mattered: it fails against the old resolver.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { sapConnection: { findMany: mocks.findMany } },
}));

// The resolver decrypts each row's secrets; the seal is not what is under test.
vi.mock("@/lib/sap-public/connection-crypto", () => ({
  connectionAad: () => "aad",
  openSecrets: () => ({ username: "u", password: "p" }),
  sealSecrets: () => "sealed",
}));

import {
  connectionRefusalMessage,
  resolveSapConnectionForEnvironment,
} from "@/lib/sap-public/connection-resolver";

/** A stored row as Prisma would return it. `environment: null` = undeclared. */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "c1",
    organizationId: "org_a",
    product: "s4hana",
    key: "t1",
    label: "Acme S/4",
    baseUrl: "https://my1234-api.s4hana.cloud.sap",
    authType: "basic",
    secretsCiphertext: "x",
    oauthTokenUrl: null,
    writeEnabled: true,
    apiPath: null,
    timeoutMs: null,
    environment: null,
    ...over,
  };
}

beforeEach(() => {
  mocks.findMany.mockReset();
});

describe("a declared environment binds to its own connection", () => {
  it("REFUSES a SANDBOX credential when only a PROD connection exists — the original defect", async () => {
    // Oldest-first is exactly what the old resolver returned. It must not be used.
    mocks.findMany.mockResolvedValue([row({ id: "prod", environment: "PROD" })]);

    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "SANDBOX", "READ");

    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reason).toBe("NO_MATCH_FOR_ENVIRONMENT");
  });

  it("picks the connection whose environment matches, not the oldest row", async () => {
    mocks.findMany.mockResolvedValue([
      row({ id: "prod", key: "prod", environment: "PROD" }),
      row({ id: "sandbox", key: "sandbox", environment: "SANDBOX" }),
    ]);

    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "SANDBOX", "READ");

    expect(binding.ok).toBe(true);
    if (binding.ok) {
      expect(binding.connection.id).toBe("sandbox");
      expect(binding.bindingUnverified).toBe(false);
    }
  });

  it("matches case-insensitively, so 'prod' and 'PROD' are one landscape", async () => {
    mocks.findMany.mockResolvedValue([row({ id: "p", environment: "prod" })]);
    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "PROD", "READ");
    expect(binding.ok).toBe(true);
  });
});

describe("ambiguity is refused, never resolved by creation order", () => {
  it("refuses when two connections declare the same environment", async () => {
    mocks.findMany.mockResolvedValue([
      row({ id: "a", key: "a", environment: "DEV" }),
      row({ id: "b", key: "b", environment: "DEV" }),
    ]);

    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");

    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reason).toBe("AMBIGUOUS");
  });

  it("refuses an undeclared row when a declared one sits beside it", async () => {
    // We must not assume the undeclared connection is the DEV the caller wants.
    mocks.findMany.mockResolvedValue([
      row({ id: "prod", key: "prod", environment: "PROD" }),
      row({ id: "mystery", key: "mystery", environment: null }),
    ]);

    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");

    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reason).toBe("AMBIGUOUS");
  });
});

describe("an undeclared environment splits by operation", () => {
  it("ALLOWS a read on a sole undeclared connection, flagged unverified", async () => {
    // The estate is unbackfilled, not legacy: refusing here would break every
    // deployment on day one over a column nobody has had a chance to fill.
    mocks.findMany.mockResolvedValue([row({ id: "only", environment: null })]);

    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");

    expect(binding.ok).toBe(true);
    if (binding.ok) {
      expect(binding.connection.id).toBe("only");
      expect(binding.bindingUnverified).toBe(true);
      expect(binding.connection.environment).toBeNull();
    }
  });

  it("REFUSES a write on that same sole connection, even with writeEnabled true", async () => {
    // The asymmetry is the point: a read against an undeclared landscape is a
    // disclosure risk that already exists; a write is a record in a customer's
    // ledger with nobody having declared it production, and cannot be undone.
    mocks.findMany.mockResolvedValue([row({ id: "only", environment: null, writeEnabled: true })]);

    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "WRITE");

    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reason).toBe("UNDECLARED_ENVIRONMENT_WRITE");
  });

  it("treats whitespace as undeclared rather than as a landscape name", async () => {
    mocks.findMany.mockResolvedValue([row({ id: "only", environment: "   " })]);
    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "WRITE");
    expect(binding.ok).toBe(false);
  });
});

describe("no connection at all", () => {
  it("reports NO_CONNECTION distinctly from a mismatch", async () => {
    mocks.findMany.mockResolvedValue([]);
    const binding = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");
    expect(binding.ok).toBe(false);
    if (!binding.ok) expect(binding.reason).toBe("NO_CONNECTION");
  });
});

describe("refusal messages are safe", () => {
  it("never leaks a host, URL, or credential", () => {
    const reasons = [
      "NO_CONNECTION",
      "NO_MATCH_FOR_ENVIRONMENT",
      "AMBIGUOUS",
      "UNDECLARED_ENVIRONMENT_WRITE",
    ] as const;

    for (const reason of reasons) {
      const message = connectionRefusalMessage(reason, "PROD");
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/https?:\/\//);
      expect(message).not.toMatch(/s4hana\.cloud\.sap/);
      expect(message).not.toMatch(/password|secret|token/i);
    }
  });
});
