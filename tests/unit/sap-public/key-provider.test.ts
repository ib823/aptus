/**
 * The KeyProvider seam (P0.10): the env provider's wrap/unwrap, and the
 * registry a cloud KMS adapter plugs into.
 */
import { randomBytes } from "crypto";
import { afterEach, describe, expect, it } from "vitest";

import {
  KeyOperationUnsupportedError,
  envKeyProvider,
  getKeyProvider,
  registerKeyProvider,
  resetKeyProviders,
  wrapContext,
  type KeyProvider,
} from "@/lib/sap-public/keys/key-provider";

const hex = () => randomBytes(32).toString("hex");
const CTX = { organizationId: "org_a", dataKeyVersion: 1 };

afterEach(() => resetKeyProviders());

describe("the env provider", () => {
  const [v1, v2] = [hex(), hex()];
  const ring = (active: string, keys = `v1:${v1},v2:${v2}`) =>
    envKeyProvider({ SAP_CONNECTION_ENCRYPTION_KEYS: keys, SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: active });

  it("wraps under the active version and unwraps to the same key", async () => {
    const dk = randomBytes(32);
    const wrapped = await ring("v2").wrapDataKey(dk, CTX);
    expect(wrapped.keyVersion).toBe("v2");
    expect(wrapped.wrappedKey).not.toContain(dk.toString("base64"));
    expect((await ring("v2").unwrapDataKey(wrapped, CTX)).equals(dk)).toBe(true);
  });

  it("unwraps a key wrapped under an older version while that version is in the ring", async () => {
    const dk = randomBytes(32);
    const wrapped = await ring("v1").wrapDataKey(dk, CTX);
    expect((await ring("v2").unwrapDataKey(wrapped, CTX)).equals(dk)).toBe(true);
  });

  it("cannot unwrap once the wrapping version leaves the ring", async () => {
    const wrapped = await ring("v1").wrapDataKey(randomBytes(32), CTX);
    await expect(ring("v2", `v2:${v2}`).unwrapDataKey(wrapped, CTX)).rejects.toThrow(/v1 is not in/);
  });

  it("binds the wrap to its organisation and version", async () => {
    const wrapped = await ring("v2").wrapDataKey(randomBytes(32), CTX);
    await expect(ring("v2").unwrapDataKey(wrapped, { ...CTX, organizationId: "org_b" })).rejects.toThrow();
    await expect(ring("v2").unwrapDataKey(wrapped, { ...CTX, dataKeyVersion: 2 })).rejects.toThrow();
    expect(wrapContext(CTX)).toBe("orgdk:v1:org_a:1");
  });

  it("rejects a wrapped key whose bytes were altered", async () => {
    const wrapped = await ring("v2").wrapDataKey(randomBytes(32), CTX);
    const buf = Buffer.from(wrapped.wrappedKey, "base64");
    buf[14] = (buf[14] ?? 0) ^ 0xff;
    await expect(
      ring("v2").unwrapDataKey({ ...wrapped, wrappedKey: buf.toString("base64") }, CTX),
    ).rejects.toThrow();
  });

  it("is not configured, and will not wrap, without an active key", async () => {
    const p = envKeyProvider({ SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${v1}` });
    expect(p.isConfigured()).toBe(false);
    await expect(p.wrapDataKey(randomBytes(32), CTX)).rejects.toThrow(/ACTIVE_KEY is not set/);
    expect(p.hasKeyVersion("v1")).toBe(true);
    expect(p.hasKeyVersion("v9")).toBe(false);
  });

  it("refuses sign / verify / JWKS rather than signing with an undecided key", async () => {
    const p = ring("v2");
    await expect(p.sign("k", Buffer.from("x"))).rejects.toBeInstanceOf(KeyOperationUnsupportedError);
    await expect(p.verify("k", Buffer.from("x"), Buffer.from("y"))).rejects.toBeInstanceOf(
      KeyOperationUnsupportedError,
    );
    await expect(p.publicJwks()).rejects.toBeInstanceOf(KeyOperationUnsupportedError);
  });
});

describe("the provider registry", () => {
  it("defaults to the env provider", () => {
    expect(getKeyProvider().name).toBe("env");
    expect(getKeyProvider("env").name).toBe("env");
  });

  it("refuses a provider nothing registered instead of falling back to env", () => {
    expect(() => getKeyProvider("aws-kms")).toThrow(/not registered/);
  });

  it("serves a registered adapter by name", () => {
    const fake = { ...envKeyProvider({}), name: "fake-kms" } satisfies KeyProvider;
    registerKeyProvider("fake-kms", () => fake);
    expect(getKeyProvider("fake-kms")).toBe(fake);
  });

  it("rejects a provider name that could not be stored cleanly", () => {
    expect(() => registerKeyProvider("AWS KMS", () => envKeyProvider({}))).toThrow(/lowercase/);
  });
});
