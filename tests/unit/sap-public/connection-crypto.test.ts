/**
 * SAP connection secret sealing — the security-critical half of the keystone.
 *
 * These tests are what stop a per-Organization SAP credential from ever being
 * stored or leaked in plaintext: round-trip fidelity, empty-field pruning,
 * no-plaintext-in-ciphertext, GCM tamper rejection, and wrong-key rejection.
 */
import { randomBytes } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  openSecrets,
  sealSecrets,
  type SapConnectionSecrets,
} from "@/lib/sap-public/connection-crypto";

const KEY = "SAP_CONNECTION_ENCRYPTION_KEY";
let original: string | undefined;

beforeAll(() => {
  original = process.env[KEY];
  process.env[KEY] = randomBytes(32).toString("hex");
});

afterAll(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("connection-crypto", () => {
  it("round-trips a secrets bundle and prunes empty fields", () => {
    const secrets: SapConnectionSecrets = {
      username: "comm_user",
      password: "S3cr3t!pw",
      clientSecret: "cs-123",
      bearerToken: "",
    };
    const opened = openSecrets(sealSecrets(secrets));
    expect(opened.username).toBe("comm_user");
    expect(opened.password).toBe("S3cr3t!pw");
    expect(opened.clientSecret).toBe("cs-123");
    expect("bearerToken" in opened).toBe(false); // empty string dropped
  });

  it("round-trips EVERY field the secrets type declares", () => {
    /*
     * openSecrets reads back through an allow-list, and an allow-list that
     * tracks a type by hand drifts: it once dropped samlAssertion and
     * companyId, so a SuccessFactors connection sealed fine and then failed
     * every exchange. `Required<>` makes this a compile error the moment a
     * field is added to the type without being added here — and the
     * assertion below fails if it is added here but not to the allow-list.
     */
    const all: Required<SapConnectionSecrets> = {
      username: "u",
      password: "p",
      bearerToken: "b",
      clientId: "ci",
      clientSecret: "cs",
      samlAssertion: "PHNhbWw+",
      companyId: "acmeT1",
      samlPrivateKey: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      samlUserId: "sfadmin",
      apiKey: "k",
      apiKeyHeader: "apikey",
      writeSecret: "w",
    };
    expect(openSecrets(sealSecrets(all))).toEqual(all);
  });

  it("never leaks plaintext into the ciphertext", () => {
    const blob = sealSecrets({ password: "TopSecretValue" });
    expect(blob).not.toContain("TopSecretValue");
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const blob = encryptSecret("hello world");
    const buf = Buffer.from(blob, "base64");
    buf[13] = (buf[13] ?? 0) ^ 0xff; // flip a ciphertext byte
    expect(() => decryptSecret(buf.toString("base64"))).toThrow();
  });

  it("cannot decrypt with a different key", () => {
    const blob = encryptSecret("hello world");
    process.env[KEY] = randomBytes(32).toString("hex");
    expect(() => decryptSecret(blob)).toThrow();
  });

  it("treats an empty/absent blob as no secrets", () => {
    expect(openSecrets(null)).toEqual({});
    expect(openSecrets(undefined)).toEqual({});
    expect(openSecrets("")).toEqual({});
  });

  it("requires a 64-char hex key", () => {
    process.env[KEY] = "too-short";
    expect(() => encryptSecret("x")).toThrow(/64-character hex/);
  });
});
