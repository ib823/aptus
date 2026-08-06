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
// `openSecretsImpl` is swappable so one test can make a row unreadable.
const cryptoMocks = vi.hoisted(() => ({
  openSecretsImpl: (() => ({ username: "u", password: "p" })) as () => Record<string, string>,
}));
vi.mock("@/lib/sap-public/connection-crypto", () => ({
  connectionAad: () => "aad",
  openSecrets: () => cryptoMocks.openSecretsImpl(),
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
    client: null,
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
      "NO_MATCH_FOR_CLIENT",
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

describe("the SAP client completes the binding", () => {
  /*
   * WHY THIS EXISTS. `environment` names a landscape. On-premise and RISE put
   * several data containers INSIDE one landscape — X5M/100 and X5M/080 share a
   * baseUrl and differ only by SAP client. Before the client became part of the
   * binding, both rows matched a DEV credential, the resolver could not choose,
   * and such an estate got AMBIGUOUS on every call: correct, and unusable.
   */
  const DEV_100 = row({ id: "c100", key: "x5m100", environment: "DEV", client: "100" });
  const DEV_080 = row({ id: "c080", key: "x5m080", environment: "DEV", client: "080" });

  it("picks the connection carrying the credential's client", async () => {
    mocks.findMany.mockResolvedValue([DEV_100, DEV_080]);

    const result = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ", "100");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.connection.key).toBe("x5m100");
    // A fully-specified binding is verified, not merely permitted.
    expect(result.bindingUnverified).toBe(false);
  });

  it("still refuses when the credential names no client and two containers match", async () => {
    mocks.findMany.mockResolvedValue([DEV_100, DEV_080]);

    const result = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");

    expect(result).toEqual({ ok: false, reason: "AMBIGUOUS" });
  });

  it("NEVER falls back to a client-less connection — absence is a different container, not a wildcard", async () => {
    mocks.findMany.mockResolvedValue([row({ id: "any", key: "x5m", environment: "DEV", client: null })]);

    const result = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ", "100");

    expect(result).toEqual({ ok: false, reason: "NO_MATCH_FOR_CLIENT" });
  });

  it("distinguishes a wrong client from an unserved environment", async () => {
    mocks.findMany.mockResolvedValue([DEV_100]);

    // The landscape IS configured; the container is not. Different fix, so a
    // different reason — merging these two would send the operator to the
    // wrong screen.
    const wrongClient = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ", "200");
    expect(wrongClient).toEqual({ ok: false, reason: "NO_MATCH_FOR_CLIENT" });

    const wrongEnv = await resolveSapConnectionForEnvironment("org_a", "s4hana", "PROD", "READ", "100");
    expect(wrongEnv).toEqual({ ok: false, reason: "NO_MATCH_FOR_ENVIRONMENT" });
  });

  it("a lone UNDECLARED row still serves a read — missing information, not contradiction", async () => {
    mocks.findMany.mockResolvedValue([row({ id: "legacy", environment: null, client: null })]);

    const result = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ", "100");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The unbackfilled-estate allowance survives: the row says nothing about
    // its client, so nothing contradicts the caller.
    expect(result.bindingUnverified).toBe(true);
  });

  it("…but a lone undeclared row that names a DIFFERENT client is refused", async () => {
    mocks.findMany.mockResolvedValue([row({ id: "legacy", environment: null, client: "080" })]);

    // This row affirmatively says 080. Serving it to a credential bound to 100
    // would be exactly the cross-container read the client field prevents —
    // and bindingUnverified would understate it as a mere gap in metadata.
    const result = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ", "100");

    expect(result).toEqual({ ok: false, reason: "NO_MATCH_FOR_CLIENT" });
  });

  it("products without a client are unaffected — omitting the argument changes nothing", async () => {
    mocks.findMany.mockResolvedValue([row({ id: "pub", environment: "PROD", client: null })]);

    const omitted = await resolveSapConnectionForEnvironment("org_a", "s4hana", "PROD", "READ");
    const explicitNull = await resolveSapConnectionForEnvironment("org_a", "s4hana", "PROD", "READ", null);
    const blank = await resolveSapConnectionForEnvironment("org_a", "s4hana", "PROD", "READ", "  ");

    expect(omitted.ok).toBe(true);
    expect(explicitNull).toEqual(omitted);
    expect(blank).toEqual(omitted);
  });
});

describe("one fact, one representation", () => {
  /*
   * The audit trail infers "binding unverified" from connectionEnvironment
   * being null on a served call, while the resolver ALSO returns a
   * bindingUnverified flag — two representations of one fact, the exact shape
   * the schema warns about. This pins their equivalence: the flag is true
   * exactly when the bound connection's environment is undeclared. If the
   * resolver ever gains a second way to be unverified, this test forces the
   * audit inference to be revisited at the same time.
   */
  it("bindingUnverified ⇔ the bound connection's environment is null", async () => {
    mocks.findMany.mockResolvedValue([row({ id: "only", environment: null })]);
    const unverified = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");
    expect(unverified.ok).toBe(true);
    if (unverified.ok) {
      expect(unverified.bindingUnverified).toBe(true);
      expect(unverified.connection.environment).toBeNull();
    }

    mocks.findMany.mockResolvedValue([row({ id: "dev", environment: "DEV" })]);
    const verified = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.bindingUnverified).toBe(false);
      expect(verified.connection.environment).not.toBeNull();
    }
  });
});

describe("a row that cannot be resolved refuses, never crashes", () => {
  it("returns CONNECTION_UNREADABLE when secrets fail to open", async () => {
    /*
     * The throw used to escape the northbound routes as an unhandled 500 with
     * no audit row — an organization whose row went bad (key rotation, AAD
     * mismatch, an authType outside the vocabulary) lost its whole northbound
     * surface invisibly. Fail-closed on the whole set, deliberately: skipping
     * just the bad row could bind the call to a DIFFERENT connection than the
     * estate intended.
     */
    mocks.findMany.mockResolvedValue([row({ id: "bad", environment: "DEV" })]);
    cryptoMocks.openSecretsImpl = () => {
      throw new Error("unsupported state or unable to authenticate data");
    };
    try {
      const result = await resolveSapConnectionForEnvironment("org_a", "s4hana", "DEV", "READ");
      expect(result).toEqual({ ok: false, reason: "CONNECTION_UNREADABLE" });
      expect(connectionRefusalMessage("CONNECTION_UNREADABLE", "DEV")).toContain("Re-save");
    } finally {
      cryptoMocks.openSecretsImpl = () => ({ username: "u", password: "p" });
    }
  });
});
