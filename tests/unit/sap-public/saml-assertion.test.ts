// @vitest-environment node
/**
 * The SuccessFactors SAML assertion CoreEdge signs — and the proof that the
 * signature is one a real XML-DSig verifier accepts.
 *
 * WHY THE PROOF IS STRUCTURED LIKE THIS. A signature that is subtly wrong
 * (canonicalisation off by one namespace declaration) fails only at the
 * customer's token endpoint, as an opaque 401. So "it verifies" cannot rest on
 * this code checking itself:
 *
 *   1. xmlsec1 — the reference XML-DSig implementation that many SAML stacks
 *      build on — verifies every assertion here when it is installed, with a
 *      tampered copy as the control that it can say no. CI does not install it,
 *      so that block is skipped there and says so.
 *   2. What CI CAN check without it: that removing the Signature element from
 *      the SENT document reproduces exactly the bytes that were digested (the
 *      enveloped-signature transform), that the signature verifies over the
 *      canonical SignedInfo with ds rendered on it, and that the canonical
 *      bytes for fixed inputs have not moved — a pinned vector whose
 *      correctness xmlsec1 established.
 *
 * No private key is committed: every key here is generated per run. The
 * pinned vector covers the key-independent bytes, which are the ones a
 * canonicalisation change would move.
 */
import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, createVerify, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  exchangeSamlBearerAssertion,
  missingSamlBearerFields,
  sanitizeSuccessFactorsError,
  SamlBearerExchangeError,
} from "@/lib/sap-public/oauth-saml-bearer";
import {
  buildSignedSamlAssertion,
  buildSignedSamlAssertionXml,
  canonicalUnsignedAssertionForTest,
  parseSamlPrivateKey,
  SamlKeyError,
} from "@/lib/sap-public/saml-assertion";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PKCS8_PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const PKCS1_PEM = privateKey.export({ type: "pkcs1", format: "pem" }) as string;
const PKCS8_B64 = (privateKey.export({ type: "pkcs8", format: "der" }) as Buffer).toString("base64");
const PKCS1_B64 = (privateKey.export({ type: "pkcs1", format: "der" }) as Buffer).toString("base64");

const BASE = {
  clientId: "MzM4ZmQ3ZTQ0OGU2",
  userId: "sfadmin",
  tokenUrl: "https://api4.successfactors.com/oauth/token",
};
const NOW = new Date("2026-10-18T05:00:00.000Z");

const DS = "http://www.w3.org/2000/09/xmldsig#";
const XS = "http://www.w3.org/2001/XMLSchema";
const XSI = "http://www.w3.org/2001/XMLSchema-instance";

/** Pull one element's text out of our own serialisation (no attributes on these). */
function text(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  if (!m) throw new Error(`no <${tag}>`);
  return m[1]!;
}

/** Recompute both halves of the signature from the document as a verifier would. */
function verifyLikeAVerifier(xml: string, pub: KeyObject): { digestOk: boolean; signatureOk: boolean } {
  const signature = /<ds:Signature xmlns:ds="[^"]+">[\s\S]*<\/ds:Signature>/.exec(xml)?.[0];
  if (!signature) throw new Error("no Signature");
  // Enveloped-signature transform: the assertion without its Signature, then
  // exclusive c14n — which, for this tree, does exactly two things (as
  // xmlsec1's pre-digest buffer shows): drops xs and xsi from the root, where
  // neither is visibly used, and renders xsi on the AttributeValue whose
  // xsi:type uses it. xs vanishes entirely: it appears only inside a value.
  const enveloped = xml
    .replace(signature, "")
    .replace(` xmlns:xs="${XS}" xmlns:xsi="${XSI}"`, "")
    .replace("<saml2:AttributeValue xsi:type=", `<saml2:AttributeValue xmlns:xsi="${XSI}" xsi:type=`);
  const digest = createHash("sha256").update(enveloped, "utf8").digest("base64");
  // SignedInfo canonicalised in context: ds is rendered on it, saml2 is not.
  const signedInfo = /<ds:SignedInfo>[\s\S]*<\/ds:SignedInfo>/.exec(signature)?.[0] ?? "";
  const signedInfoC14n = signedInfo.replace("<ds:SignedInfo>", `<ds:SignedInfo xmlns:ds="${DS}">`);
  const signatureOk = createVerify("RSA-SHA256")
    .update(signedInfoC14n, "utf8")
    .verify(pub, text(signature, "ds:SignatureValue"), "base64");
  return { digestOk: digest === text(signature, "ds:DigestValue"), signatureOk };
}

describe("the private key, in the shapes an administrator will have", () => {
  it.each([
    ["PKCS#8 PEM", PKCS8_PEM],
    ["PKCS#1 PEM", PKCS1_PEM],
    ["headerless base64 PKCS#8 (SAP's offline tool's shape)", PKCS8_B64],
    ["headerless base64 PKCS#1", PKCS1_B64],
    ["base64 with line breaks", PKCS8_B64.replace(/(.{64})/g, "$1\n")],
  ])("accepts %s", (_, raw) => {
    const key = parseSamlPrivateKey(raw);
    expect(key.asymmetricKeyType).toBe("rsa");
  });

  it("takes the key block out of a file that also carries the certificate", () => {
    const cert = "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIU\n-----END CERTIFICATE-----\n";
    expect(parseSamlPrivateKey(`${cert}${PKCS8_PEM}`).asymmetricKeyType).toBe("rsa");
  });

  it("refuses an encrypted key with a sentence that says so", () => {
    const encrypted = privateKey.export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "x" }) as string;
    expect(() => parseSamlPrivateKey(encrypted)).toThrow(/passphrase-encrypted/);
  });

  it("refuses a certificate on its own", () => {
    expect(() => parseSamlPrivateKey("-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----")).toThrow(
      /no private key block/,
    );
  });

  it("refuses a key that is not RSA, and RSA under 2048 bits", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => parseSamlPrivateKey(ec)).toThrow(/ec key/);
    const small = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    expect(() => parseSamlPrivateKey(small)).toThrow(/1024-bit/);
  });

  it("never puts any of the key into the error", () => {
    const garbage = `${PKCS8_B64.slice(0, 120)}!!!not-a-key`;
    try {
      parseSamlPrivateKey(garbage);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SamlKeyError);
      expect((error as Error).message).not.toContain(PKCS8_B64.slice(10, 40));
      expect((error as SamlKeyError).code).toBe("SAML_PRIVATE_KEY_UNUSABLE");
    }
  });
});

/**
 * SuccessFactors' own key format, as the research found it in SAP's generator
 * and in clients proven against SuccessFactors: Certificate.pem labels the key
 * block ENCRYPTED PRIVATE KEY and the body is
 * base64( base64(PKCS#8 DER) + "###" + suffix ). Synthetic here, from a key
 * generated per run — the same construction, no real key committed.
 */
const sfWrap = (der: Buffer, suffix = "SFCPART000000") =>
  Buffer.from(`${der.toString("base64")}###${suffix}`, "latin1").toString("base64");
const PKCS8_DER = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
const pem = (label: string, body: string) =>
  `-----BEGIN ${label}-----\n${body.replace(/(.{64})/g, "$1\n")}\n-----END ${label}-----\n`;

const openssl = (() => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** A real self-signed certificate for `key`, as DER — so the pairing check has something true to check. */
function certificateDerFor(key: KeyObject): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "saml-cert-"));
  try {
    writeFileSync(join(dir, "k.pem"), key.export({ type: "pkcs8", format: "pem" }));
    execFileSync("openssl", ["req", "-x509", "-new", "-key", join(dir, "k.pem"), "-subj", "/CN=coreedge-test", "-days", "1", "-outform", "DER", "-out", join(dir, "c.der")], { stdio: "ignore" });
    return readFileSync(join(dir, "c.der"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the key SuccessFactors itself issues", () => {
  it("reads Certificate.pem's key block, which is labelled ENCRYPTED and is not", () => {
    const key = parseSamlPrivateKey(pem("ENCRYPTED PRIVATE KEY", sfWrap(PKCS8_DER)));
    expect(createPublicKey(key).export({ type: "spki", format: "pem" })).toBe(
      publicKey.export({ type: "spki", format: "pem" }),
    );
  });

  it("reads the one-line blob SAP's offline tool takes, with either suffix", () => {
    for (const suffix of ["SFCPART000027", "false"]) {
      expect(parseSamlPrivateKey(sfWrap(PKCS8_DER, suffix)).asymmetricKeyType).toBe("rsa");
    }
  });

  it("reads the blob after one decode, as an administrator might paste it", () => {
    expect(parseSamlPrivateKey(`${PKCS8_DER.toString("base64")}###SFCPART000000`).asymmetricKeyType).toBe("rsa");
  });

  it("signs with it, and the signature verifies against the original key", () => {
    const xml = buildSignedSamlAssertionXml({ ...BASE, privateKey: pem("ENCRYPTED PRIVATE KEY", sfWrap(PKCS8_DER)) });
    expect(verifyLikeAVerifier(xml, publicKey)).toEqual({ digestOk: true, signatureOk: true });
  });

  it("still refuses a key that genuinely needs a passphrase — legacy PEM included", () => {
    const legacy = privateKey.export({ type: "pkcs1", format: "pem", cipher: "aes-256-cbc", passphrase: "x" }) as string;
    expect(() => parseSamlPrivateKey(legacy)).toThrow(/passphrase-encrypted/);
  });
});

describe.skipIf(!openssl)("the pair is checked when the file carries the certificate", () => {
  const ownCert = certificateDerFor(privateKey);
  const otherCert = certificateDerFor(generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);

  it("accepts Certificate.pem whose certificate belongs to the key — plain or SuccessFactors-wrapped", () => {
    const keyBlock = pem("ENCRYPTED PRIVATE KEY", sfWrap(PKCS8_DER));
    expect(parseSamlPrivateKey(keyBlock + pem("CERTIFICATE", ownCert.toString("base64"))).asymmetricKeyType).toBe("rsa");
    expect(parseSamlPrivateKey(keyBlock + pem("CERTIFICATE", sfWrap(ownCert, "false"))).asymmetricKeyType).toBe("rsa");
  });

  it("refuses a key that does not belong to the certificate beside it — the 401 said before it happens", () => {
    const file = pem("ENCRYPTED PRIVATE KEY", sfWrap(PKCS8_DER)) + pem("CERTIFICATE", otherCert.toString("base64"));
    expect(() => parseSamlPrivateKey(file)).toThrow(/does not belong to the certificate/);
  });
});

describe("the assertion's contents", () => {
  const xml = buildSignedSamlAssertionXml({ ...BASE, privateKey: PKCS8_PEM, now: NOW, id: "_fixedid", sessionIndex: "_fixedsession" });

  it("names the user, the API key, the token endpoint and SuccessFactors as audience", () => {
    expect(xml).toContain(`<saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified">sfadmin</saml2:NameID>`);
    expect(xml).toContain(`Recipient="${BASE.tokenUrl}"`);
    expect(xml).toContain("<saml2:Audience>www.successfactors.com</saml2:Audience>");
    expect(xml).toContain("<saml2:Issuer>www.successfactors.com</saml2:Issuer>");
    expect(xml).toContain(
      `<saml2:Attribute Name="api_key"><saml2:AttributeValue xsi:type="xs:string">${BASE.clientId}</saml2:AttributeValue></saml2:Attribute>`,
    );
    expect(xml).toMatch(/^<saml2:Assertion xmlns:saml2="[^"]+" xmlns:xs="[^"]+" xmlns:xsi="[^"]+" ID="_fixedid"/);
    expect(xml).toContain('SessionIndex="_fixedsession"');
    expect(xml).toContain('Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"');
  });

  it("is short-lived, and backdated ten minutes as SAP's generator does", () => {
    // A NotBefore in the future comes back from SuccessFactors as "expired".
    expect(xml).toContain('IssueInstant="2026-10-18T05:00:00.000Z"');
    expect(xml).toContain('<saml2:Conditions NotBefore="2026-10-18T04:50:00.000Z" NotOnOrAfter="2026-10-18T05:10:00.000Z">');
    expect(xml).toContain('<saml2:SubjectConfirmationData NotOnOrAfter="2026-10-18T05:10:00.000Z"');
  });

  it("puts the Signature immediately after Issuer, as the SAML schema requires", () => {
    expect(xml).toMatch(/<\/saml2:Issuer><ds:Signature /);
  });

  it("signs a fresh, unique assertion each time, with a session index of its own", () => {
    const one = buildSignedSamlAssertionXml({ ...BASE, privateKey: PKCS8_PEM });
    const two = buildSignedSamlAssertionXml({ ...BASE, privateKey: PKCS8_PEM });
    const id = (x: string) => /ID="([^"]+)"/.exec(x)?.[1];
    const session = (x: string) => /SessionIndex="([^"]+)"/.exec(x)?.[1];
    expect(id(one)).toMatch(/^_[0-9a-f]{32}$/);
    expect(id(one)).not.toBe(id(two));
    expect(session(one)).toMatch(/^_[0-9a-f]{32}$/);
    expect(session(one)).not.toBe(id(one));
  });

  it("escapes a user id that XML would otherwise misread", () => {
    const tricky = buildSignedSamlAssertionXml({ ...BASE, userId: 'a&b<c>"d', privateKey: PKCS8_PEM, now: NOW });
    expect(tricky).toContain(">a&amp;b&lt;c&gt;\"d</saml2:NameID>");
    expect(verifyLikeAVerifier(tricky, publicKey)).toEqual({ digestOk: true, signatureOk: true });
  });

  it("refuses to build one without a user, an API key or a token URL", () => {
    for (const field of ["clientId", "userId", "tokenUrl"] as const) {
      expect(() => buildSignedSamlAssertionXml({ ...BASE, [field]: " ", privateKey: PKCS8_PEM })).toThrow(field);
    }
  });
});

describe("the signature, checked the way a verifier checks it", () => {
  it("reads the clock ONCE, so the digest describes the bytes sent", () => {
    /*
     * The regression xmlsec1 caught: the digested tree and the sent tree each
     * read the clock, so with millisecond timestamps they differed and every
     * signature failed. Twenty-five runs on the real clock, none pinned.
     */
    for (let i = 0; i < 25; i++) {
      const xml = buildSignedSamlAssertionXml({ ...BASE, privateKey: PKCS8_PEM });
      expect(verifyLikeAVerifier(xml, publicKey)).toEqual({ digestOk: true, signatureOk: true });
    }
  });

  it("digests exactly the bytes the enveloped transform leaves, and the signature verifies", () => {
    for (const key of [PKCS8_PEM, PKCS1_PEM, PKCS8_B64]) {
      const xml = buildSignedSamlAssertionXml({ ...BASE, privateKey: key });
      expect(verifyLikeAVerifier(xml, publicKey)).toEqual({ digestOk: true, signatureOk: true });
    }
  });

  it("detects a changed byte — the check is not vacuous", () => {
    const xml = buildSignedSamlAssertionXml({ ...BASE, privateKey: PKCS8_PEM });
    expect(verifyLikeAVerifier(xml.replace(">sfadmin<", ">sfadmiN<"), publicKey).digestOk).toBe(false);
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey;
    expect(verifyLikeAVerifier(xml, other).signatureOk).toBe(false);
  });

  it("keeps the canonical bytes xmlsec1 verified — a canonicalisation change must fail here", () => {
    /*
     * Key-independent: this is what is digested. If an edit moves these bytes,
     * re-run the xmlsec1 block below on a machine that has it before updating
     * the vector — a vector updated to match new output proves nothing.
     */
    const canonical = canonicalUnsignedAssertionForTest(
      { ...BASE, privateKey: PKCS8_PEM, now: NOW },
      "_fixedid",
      "_fixedsession",
    );
    expect(createHash("sha256").update(canonical, "utf8").digest("hex")).toBe(PINNED_CANONICAL_SHA256);
  });
});

/**
 * The canonical unsigned assertion for BASE at NOW, ID "_fixedid", session "_fixedsession".
 * Established 2026-10-18 with xmlsec1 1.2.39: the assertion built from these
 * inputs verified, and xmlsec1's own pre-digest buffer (--store-references
 * --print-debug) was byte-identical to this canonical form.
 */
const PINNED_CANONICAL_SHA256 = "60a0665dc677d4b0d1f6350ff082826eab910a13c4eee04259ce6064b26d90d1";

const xmlsec1 = (() => {
  try {
    execFileSync("xmlsec1", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!xmlsec1)("xmlsec1, the reference XML-DSig implementation, accepts the signature", () => {
  const dir = mkdtempSync(join(tmpdir(), "saml-xmlsec-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const pubPath = join(dir, "pub.pem");
  writeFileSync(pubPath, createPublicKey(privateKey).export({ type: "spki", format: "pem" }));

  const verify = (xml: string): boolean => {
    const file = join(dir, `a-${Math.random().toString(36).slice(2)}.xml`);
    writeFileSync(file, xml);
    try {
      execFileSync(
        "xmlsec1",
        ["--verify", "--pubkey-pem", pubPath, "--id-attr:ID", "urn:oasis:names:tc:SAML:2.0:assertion:Assertion", file],
        { stdio: "ignore" },
      );
      return true;
    } catch {
      return false;
    }
  };

  it("verifies assertions signed with each accepted key shape", () => {
    for (const key of [PKCS8_PEM, PKCS1_PEM, PKCS8_B64, PKCS1_B64]) {
      expect(verify(buildSignedSamlAssertionXml({ ...BASE, privateKey: key }))).toBe(true);
    }
  });

  it("verifies the pinned-input assertion and one with characters that need escaping", () => {
    expect(
      verify(buildSignedSamlAssertionXml({ ...BASE, privateKey: PKCS8_PEM, now: NOW, id: "_fixedid", sessionIndex: "_fixedsession" })),
    ).toBe(true);
    expect(verify(buildSignedSamlAssertionXml({ ...BASE, userId: 'ops&"<qa>', privateKey: PKCS8_PEM }))).toBe(true);
  });

  it("rejects a tampered copy — the control that it can say no", () => {
    const xml = buildSignedSamlAssertionXml({ ...BASE, privateKey: PKCS8_PEM });
    expect(verify(xml.replace(">sfadmin<", ">sfadmiN<"))).toBe(false);
  });
});

if (!xmlsec1) {
  // Said out loud, so a green run without xmlsec1 is not mistaken for one with it.
  console.info("[saml-assertion.test] xmlsec1 not installed — the independent-verifier block was skipped.");
}

describe("the token exchange signs a fresh assertion when it holds the key", () => {
  const ok = () =>
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 1800 }) });

  it("sends a base64 assertion that verifies, and never the stored one", async () => {
    const fetchImpl = ok();
    const result = await exchangeSamlBearerAssertion(
      { ...BASE, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin", samlAssertion: "STALE" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    );
    expect(result).toEqual({ accessToken: "tok", ttlMs: 1_800_000 });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(BASE.tokenUrl);
    const body = new URLSearchParams(String((init as RequestInit).body));
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:saml2-bearer");
    expect(body.get("client_id")).toBe(BASE.clientId);
    expect(body.get("company_id")).toBe("acmeT1");
    expect(body.get("assertion")).not.toBe("STALE");
    const xml = Buffer.from(body.get("assertion")!, "base64").toString("utf8");
    expect(verifyLikeAVerifier(xml, publicKey)).toEqual({ digestOk: true, signatureOk: true });
    expect(new Headers((init as RequestInit).headers).get("authorization")).toBeNull();
  });

  it("still uses a pasted assertion when no key is held", async () => {
    const fetchImpl = ok();
    await exchangeSamlBearerAssertion(
      { ...BASE, companyId: "acmeT1", samlAssertion: "PRESIGNED" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    );
    expect(new URLSearchParams(String((fetchImpl.mock.calls[0]![1] as RequestInit).body)).get("assertion")).toBe("PRESIGNED");
  });

  it("names the missing user when it holds a key, and the missing credential when it holds neither", () => {
    expect(missingSamlBearerFields({ ...BASE, companyId: "c", samlPrivateKey: PKCS8_PEM })).toEqual([
      "samlUserId (the SuccessFactors user the assertion is issued for)",
    ]);
    expect(missingSamlBearerFields({ ...BASE, companyId: "c" })).toEqual([
      "samlPrivateKey + samlUserId (or a pre-signed samlAssertion)",
    ]);
  });

  it("refuses an unusable key before any request, without echoing it", async () => {
    const fetchImpl = ok();
    await expect(
      exchangeSamlBearerAssertion(
        { ...BASE, companyId: "c", samlPrivateKey: "not a key at all", samlUserId: "sfadmin" },
        "Connection zvcsf",
        { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
      ),
    ).rejects.toThrow(SamlKeyError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("points a refusal of a signed assertion at the key, the user and the company id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(
      exchangeSamlBearerAssertion(
        { ...BASE, companyId: "c", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
        "Connection zvcsf",
        { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
      ),
    ).rejects.toThrow(/does not match the certificate registered for this API key/);
  });

  it("carries SuccessFactors' own words, bounded, when it refuses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        errorHttpCode: "401",
        errorMessage: `Unable to verify the signature of the SAML assertion. Echo: ${"A".repeat(60)}`,
      }),
    });
    try {
      await exchangeSamlBearerAssertion(
        { ...BASE, companyId: "c", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
        "Connection zvcsf",
        { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SamlBearerExchangeError);
      const e = error as SamlBearerExchangeError;
      expect(e.httpStatus).toBe(401);
      expect(e.publicDetail).toContain("Unable to verify the signature of the SAML assertion");
      expect(e.publicDetail).not.toContain("A".repeat(41));
      expect(e.publicDetail).not.toContain(BASE.tokenUrl);
    }
  });

  it("bounds what it will repeat: whitespace, long base64-looking runs, length", () => {
    expect(sanitizeSuccessFactorsError(42)).toBeNull();
    expect(sanitizeSuccessFactorsError("  \n ")).toBeNull();
    expect(sanitizeSuccessFactorsError("a\n\n b")).toBe("a b");
    expect(sanitizeSuccessFactorsError(`x ${"Q".repeat(50)} y`)).toBe("x […] y");
    expect(sanitizeSuccessFactorsError("z".repeat(10) + " " + "w ".repeat(400))!.length).toBeLessThanOrEqual(300);
  });

  it("the base64 form is the XML form, encoded", () => {
    const fixed = { ...BASE, privateKey: PKCS8_PEM, now: NOW, id: "_fixedid", sessionIndex: "_fixedsession" };
    const b64 = buildSignedSamlAssertion(fixed);
    const xml = buildSignedSamlAssertionXml(fixed);
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe(xml);
  });
});

describe("the connection test shows SuccessFactors' words, not a generic failure", () => {
  /*
   * The Test button is how the first SuccessFactors exchange is attempted, and
   * it used to answer every auth failure with "The connection could not be
   * established." — a dead end for exactly the configuration errors this flow
   * produces. Driven here through the real probe, with only fetch stubbed.
   */
  afterAll(() => vi.unstubAllGlobals());

  it("reports a SuccessFactors refusal as UNAUTHORIZED with its sanitised message, and never probes", async () => {
    const { probeConnection } = await import("@/lib/studio/connection-health");
    const { clearOAuthTokenCache } = await import("@/lib/sap-public/connection-resolver");
    clearOAuthTokenCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ errorHttpCode: "401", errorMessage: 'Unable to validate "Recipient" in the SAML assertion' }),
      }),
    );
    const metadataFetch = vi.fn();
    const result = await probeConnection(
      {
        source: "db",
        id: "conn_zvcsf",
        organizationId: "org_a",
        product: "successfactors",
        key: "zvcsf",
        label: "SuccessFactors",
        baseUrl: "https://api4.successfactors.com",
        authType: "oauth-saml-bearer",
        secrets: { clientId: BASE.clientId, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
        oauthTokenUrl: BASE.tokenUrl,
        writeEnabled: false,
        apiPath: null,
        timeoutMs: null,
        environment: "DEV",
        client: null,
      },
      metadataFetch as unknown as typeof fetch,
    );
    expect(result.status).toBe("UNAUTHORIZED");
    expect(result.httpStatus).toBe(401);
    expect(result.detail).toContain('Unable to validate "Recipient" in the SAML assertion');
    expect(result.detail).not.toContain(BASE.tokenUrl);
    expect(metadataFetch).not.toHaveBeenCalled();
  });
});
