/**
 * AAD binding — a sealed secret belongs to ONE row.
 *
 * The attack this closes: without AAD, `secretsCiphertext` is a free-floating
 * secret. Anyone able to write to the table could copy tenant A's blob onto
 * tenant B's connection row, and the platform would decrypt it happily and then
 * authenticate to A's SAP system as B. GCM authenticates the AAD alongside the
 * ciphertext, so a blob sealed for one identity fails to open under another's.
 */

import { randomBytes } from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  connectionAad,
  decryptSecret,
  encryptSecret,
  openSecrets,
  sealSecrets,
  solutionClientAad,
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

describe("a blob sealed for one row will not open on another", () => {
  const aadA = connectionAad("org_a", "s4hana", "prod");
  const aadB = connectionAad("org_b", "s4hana", "prod");

  it("opens under its own AAD", () => {
    const blob = encryptSecret("super-secret", aadA);
    expect(decryptSecret(blob, aadA)).toBe("super-secret");
  });

  it("refuses to open under a DIFFERENT organization's AAD", () => {
    const blob = encryptSecret("super-secret", aadA);
    // The whole attack: copy A's ciphertext onto B's row.
    expect(() => decryptSecret(blob, aadB)).toThrow();
  });

  it("refuses when only the product differs", () => {
    const blob = encryptSecret("x", connectionAad("org_a", "s4hana", "prod"));
    expect(() => decryptSecret(blob, connectionAad("org_a", "successfactors", "prod"))).toThrow();
  });

  it("refuses when only the tenant key differs", () => {
    const blob = encryptSecret("x", connectionAad("org_a", "s4hana", "prod"));
    expect(() => decryptSecret(blob, connectionAad("org_a", "s4hana", "sandbox"))).toThrow();
  });

  it("binds a solution client to its own solution", () => {
    const blob = encryptSecret("x", solutionClientAad("org_a", "sol_1"));
    expect(decryptSecret(blob, solutionClientAad("org_a", "sol_1"))).toBe("x");
    expect(() => decryptSecret(blob, solutionClientAad("org_a", "sol_2"))).toThrow();
    expect(() => decryptSecret(blob, solutionClientAad("org_b", "sol_1"))).toThrow();
  });

  it("does not mix vocabularies — a connection AAD is not a client AAD", () => {
    const blob = encryptSecret("x", connectionAad("org_a", "s4hana", "prod"));
    expect(() => decryptSecret(blob, solutionClientAad("org_a", "s4hana"))).toThrow();
  });
});

describe("backward compatibility with rows sealed before AAD existed", () => {
  it("opens a legacy (unbound) blob even when an AAD is supplied", () => {
    // Introducing binding must not strand live connections. The fallback is a
    // migration bridge; re-sealing on next write closes it.
    const legacy = encryptSecret("legacy-secret");
    expect(decryptSecret(legacy, connectionAad("org_a", "s4hana", "prod"))).toBe("legacy-secret");
  });

  it("still opens a legacy blob with no AAD at all", () => {
    const legacy = encryptSecret("legacy-secret");
    expect(decryptSecret(legacy)).toBe("legacy-secret");
  });

  it("the fallback CANNOT weaken a blob that was sealed WITH an AAD", () => {
    // This is the property that makes the bridge safe: a bound blob fails
    // authentication without its AAD, so the retry-without-AAD path throws too
    // and a swapped row is still rejected.
    const bound = encryptSecret("bound-secret", connectionAad("org_a", "s4hana", "prod"));
    expect(() => decryptSecret(bound, connectionAad("org_b", "s4hana", "prod"))).toThrow();
    expect(() => decryptSecret(bound)).toThrow();
  });
});

describe("sealSecrets / openSecrets carry the AAD through", () => {
  const aad = connectionAad("org_a", "s4hana", "prod");

  it("round-trips a bundle under its AAD", () => {
    const blob = sealSecrets({ username: "u", password: "p" }, aad);
    const opened = openSecrets(blob, aad);
    expect(opened.username).toBe("u");
    expect(opened.password).toBe("p");
  });

  it("throws when opened under another row's AAD", () => {
    const blob = sealSecrets({ password: "p" }, aad);
    expect(() => openSecrets(blob, connectionAad("org_b", "s4hana", "prod"))).toThrow();
  });

  it("still prunes empty fields and leaks no plaintext", () => {
    const blob = sealSecrets({ password: "TopSecret", bearerToken: "" }, aad);
    expect(blob).not.toContain("TopSecret");
    expect("bearerToken" in openSecrets(blob, aad)).toBe(false);
  });
});
