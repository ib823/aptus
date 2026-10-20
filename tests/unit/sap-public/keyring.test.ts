/**
 * The master-key ring (P0.10) — and the promise that a deployment configuring
 * nothing new sees nothing new.
 *
 * The legacy single key must keep meaning exactly what it meant: same key, same
 * validation, same message. Everything else here is the new ring refusing to be
 * half-read — a skipped or misread entry is a key that silently stops opening
 * the rows sealed under it.
 */
import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";

import { envelopeSealingEnabled } from "@/lib/sap-public/keys/key-provider";
import {
  KeyringConfigError,
  LEGACY_KEY_MESSAGE,
  legacyFormatPolicy,
  legacySealingKey,
  legacySealingKeyConfigured,
  preEnvelopeLegacyKeyConfigured,
  readKeyring,
} from "@/lib/sap-public/keys/keyring";

const hex = () => randomBytes(32).toString("hex");

describe("the legacy key alone — behaviour as before P0.10", () => {
  it("is the sealing key, and is the ring's v1", () => {
    const k = hex();
    const env = { SAP_CONNECTION_ENCRYPTION_KEY: k };
    expect(legacySealingKey(env).toString("hex")).toBe(k);
    const ring = readKeyring(env);
    expect([...ring.keys.keys()]).toEqual(["v1"]);
    expect(ring.keys.get("v1")?.toString("hex")).toBe(k);
    expect(ring.active).toBeNull();
  });

  it("does not switch on envelope sealing", () => {
    expect(envelopeSealingEnabled({ SAP_CONNECTION_ENCRYPTION_KEY: hex() })).toBe(false);
    expect(envelopeSealingEnabled({})).toBe(false);
  });

  it("throws the same sentence as before when missing or the wrong length", () => {
    expect(() => legacySealingKey({})).toThrow(LEGACY_KEY_MESSAGE);
    expect(() => legacySealingKey({ SAP_CONNECTION_ENCRYPTION_KEY: "" })).toThrow(LEGACY_KEY_MESSAGE);
    expect(() => legacySealingKey({ SAP_CONNECTION_ENCRYPTION_KEY: "too-short" })).toThrow(/64-character hex/);
  });

  it("reports configured exactly when the old predicate did", () => {
    expect(legacySealingKeyConfigured({ SAP_CONNECTION_ENCRYPTION_KEY: hex() })).toBe(true);
    expect(legacySealingKeyConfigured({ SAP_CONNECTION_ENCRYPTION_KEY: "z".repeat(64) })).toBe(false);
    expect(legacySealingKeyConfigured({ SAP_CONNECTION_ENCRYPTION_KEY: "" })).toBe(false);
    expect(legacySealingKeyConfigured({})).toBe(false);
  });

  it("is not affected by a broken ring while it is set", () => {
    // The ring is new and may be mistyped; the key every existing row was
    // sealed with must not be taken away by that mistake.
    const k = hex();
    const env = { SAP_CONNECTION_ENCRYPTION_KEY: k, SAP_CONNECTION_ENCRYPTION_KEYS: "v2:nothex" };
    expect(legacySealingKey(env).toString("hex")).toBe(k);
  });
});

describe("the versioned ring", () => {
  it("reads every entry and the active version", () => {
    const [a, b] = [hex(), hex()];
    const ring = readKeyring({
      SAP_CONNECTION_ENCRYPTION_KEYS: ` v1:${a} , v2:${b} `,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2",
    });
    expect(ring.keys.get("v1")?.toString("hex")).toBe(a);
    expect(ring.keys.get("v2")?.toString("hex")).toBe(b);
    expect(ring.active).toBe("v2");
  });

  it("adds the legacy key as implicit v1 beside the ring", () => {
    const [legacy, v2] = [hex(), hex()];
    const ring = readKeyring({
      SAP_CONNECTION_ENCRYPTION_KEY: legacy,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${v2}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2",
    });
    expect(ring.keys.get("v1")?.toString("hex")).toBe(legacy);
    expect(ring.keys.get("v2")?.toString("hex")).toBe(v2);
  });

  it("lets the old key move into the ring as v1 and the old variable retire", () => {
    const k = hex();
    expect(legacySealingKey({ SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${k}` }).toString("hex")).toBe(k);
  });

  it("refuses a legacy key and a v1 entry that disagree", () => {
    expect(() =>
      readKeyring({ SAP_CONNECTION_ENCRYPTION_KEY: hex(), SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${hex()}` }),
    ).toThrow(/different keys/);
  });

  it("accepts a legacy key and a v1 entry that agree", () => {
    const k = hex();
    expect(
      readKeyring({ SAP_CONNECTION_ENCRYPTION_KEY: k, SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${k}` }).keys.size,
    ).toBe(1);
  });

  it.each([
    ["a bad version label", `key1:${"a".repeat(64)}`, /version/],
    ["a short key", "v1:abcd", /64-character hex/],
    ["a duplicate version", `v1:${"a".repeat(64)},v1:${"b".repeat(64)}`, /twice/],
    ["no separator", "a".repeat(64), /version/],
  ])("refuses %s rather than skipping it", (_label, ring, message) => {
    expect(() => readKeyring({ SAP_CONNECTION_ENCRYPTION_KEYS: ring })).toThrow(message);
    expect(() => readKeyring({ SAP_CONNECTION_ENCRYPTION_KEYS: ring })).toThrow(KeyringConfigError);
  });

  it("refuses an active version the ring does not hold", () => {
    expect(() =>
      readKeyring({ SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${hex()}`, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v3" }),
    ).toThrow(/v3, which is not a key/);
  });

  it("never puts key material in an error message", () => {
    const secret = "f".repeat(63) + "g"; // 64 chars, not hex
    try {
      readKeyring({ SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${secret}` });
      throw new Error("expected a throw");
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it("needs v1 for a legacy blob once the old variable is gone", () => {
    expect(() =>
      legacySealingKey({ SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${hex()}`, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2" }),
    ).toThrow(/needs key v1/);
  });

  it("switches envelope sealing on by naming an active key, or a non-env provider", () => {
    expect(envelopeSealingEnabled({ SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2" })).toBe(true);
    expect(envelopeSealingEnabled({ SAP_CONNECTION_KEY_PROVIDER: "aws-kms" })).toBe(true);
    expect(envelopeSealingEnabled({ SAP_CONNECTION_KEY_PROVIDER: "env" })).toBe(false);
    // A ring with no active key is staged, not switched on.
    expect(envelopeSealingEnabled({ SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${hex()}` })).toBe(false);
  });
});

describe("the key a rollback needs — what pre-P0.10 code reads", () => {
  it("is SAP_CONNECTION_ENCRYPTION_KEY itself, never the ring's v1", () => {
    const old = hex();
    expect(preEnvelopeLegacyKeyConfigured({ SAP_CONNECTION_ENCRYPTION_KEY: old })).toBe(true);
    // Moved into the ring and the variable dropped: this code still seals and
    // opens legacy blobs with it, but the rolled-back code would throw.
    const moved = { SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${old},v2:${hex()}` };
    expect(legacySealingKey(moved).toString("hex")).toBe(old);
    expect(preEnvelopeLegacyKeyConfigured(moved)).toBe(false);
  });

  it("is 64 hex characters exactly as the old helper read them", () => {
    expect(preEnvelopeLegacyKeyConfigured({})).toBe(false);
    expect(preEnvelopeLegacyKeyConfigured({ SAP_CONNECTION_ENCRYPTION_KEY: "" })).toBe(false);
    expect(preEnvelopeLegacyKeyConfigured({ SAP_CONNECTION_ENCRYPTION_KEY: ` ${hex()}` })).toBe(false);
    expect(preEnvelopeLegacyKeyConfigured({ SAP_CONNECTION_ENCRYPTION_KEY: "q".repeat(64) })).toBe(false);
  });
});

describe("which legacy-format blobs still open", () => {
  it("is every one by default, as before P0.10", () => {
    expect(legacyFormatPolicy({})).toBe("any");
    expect(legacyFormatPolicy({ SAP_CONNECTION_ACCEPT_LEGACY_FORMAT: "" })).toBe("any");
  });

  it("narrows to bound, or none, when the operator says so", () => {
    expect(legacyFormatPolicy({ SAP_CONNECTION_ACCEPT_LEGACY_FORMAT: "bound" })).toBe("bound");
    expect(legacyFormatPolicy({ SAP_CONNECTION_ACCEPT_LEGACY_FORMAT: " none " })).toBe("none");
  });

  it("refuses a value it does not know rather than widening back to any", () => {
    for (const value of ["NONE", "no", "false"]) {
      expect(() => legacyFormatPolicy({ SAP_CONNECTION_ACCEPT_LEGACY_FORMAT: value })).toThrow(KeyringConfigError);
    }
  });
});
