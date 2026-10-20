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
  publicSamlFailure,
  sanitizeSuccessFactorsError,
  SamlBearerConfigError,
  SamlBearerExchangeError,
} from "@/lib/sap-public/oauth-saml-bearer";
import {
  buildSignedSamlAssertion,
  buildSignedSamlAssertionXml,
  canonicalUnsignedAssertionForTest,
  parseSamlPrivateKey,
  SamlAssertionInputError,
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

  it("reads a key whose line breaks arrive as the two characters \\n — on every path, not only env", () => {
    // What a key looks like copied out of a .env file or a hosting dashboard.
    const escaped = (t: string) => t.replace(/\r?\n/g, "\\n");
    for (const file of [PKCS8_PEM, PKCS1_PEM, pem("ENCRYPTED PRIVATE KEY", sfWrap(PKCS8_DER))]) {
      expect(escaped(file)).not.toContain("\n");
      expect(createPublicKey(parseSamlPrivateKey(escaped(file))).export({ type: "spki", format: "pem" })).toBe(
        publicKey.export({ type: "spki", format: "pem" }),
      );
    }
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

  it("accepts a chain that lists the issuing CA before the key's own certificate", () => {
    // A PFX export or CA bundle: comparing with the first certificate alone
    // refused a correct key with no way round it.
    const ca = pem("CERTIFICATE", otherCert.toString("base64"));
    const leaf = pem("CERTIFICATE", ownCert.toString("base64"));
    expect(parseSamlPrivateKey(ca + PKCS8_PEM + leaf).asymmetricKeyType).toBe("rsa");
    expect(parseSamlPrivateKey(PKCS8_PEM + leaf + ca).asymmetricKeyType).toBe("rsa");
    // None of several readable certificates matching is still a refusal.
    expect(() => parseSamlPrivateKey(ca + PKCS8_PEM + ca)).toThrow(/does not belong to the certificate/);
  });

  it("skips a certificate whose public key this runtime cannot decode, rather than aborting the search", () => {
    // X509Certificate parses the key lazily: a certificate with an algorithm
    // OpenSSL does not know constructs, then throws on .publicKey. One placed
    // before the key's own certificate used to refuse a correct key.
    const rsaEncryption = Buffer.from("06092a864886f70d010101", "hex");
    const at = otherCert.indexOf(rsaEncryption);
    expect(at).toBeGreaterThan(0);
    const undecodable = Buffer.from(otherCert);
    undecodable[at + rsaEncryption.length - 1] = 0x7f;
    const odd = pem("CERTIFICATE", undecodable.toString("base64"));
    const leaf = pem("CERTIFICATE", ownCert.toString("base64"));
    expect(parseSamlPrivateKey(odd + PKCS8_PEM + leaf).asymmetricKeyType).toBe("rsa");
    expect(() => parseSamlPrivateKey(odd + PKCS8_PEM + pem("CERTIFICATE", otherCert.toString("base64")))).toThrow(
      /does not belong to the certificate/,
    );
  });

  it("does not refuse over a certificate block it cannot read", () => {
    expect(parseSamlPrivateKey(PKCS8_PEM + pem("CERTIFICATE", "bm90IGEgY2VydGlmaWNhdGU=")).asymmetricKeyType).toBe("rsa");
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
    for (const [field, named] of [
      ["clientId", "the API key"],
      ["userId", "the user id"],
      ["tokenUrl", "the token URL"],
    ] as const) {
      expect(() => buildSignedSamlAssertionXml({ ...BASE, [field]: " ", privateKey: PKCS8_PEM })).toThrow(
        new SamlAssertionInputError(`${named} is missing.`),
      );
    }
  });

  it("trims the user id: whitespace in NameID is a user SuccessFactors does not have", () => {
    const padded = buildSignedSamlAssertionXml({ ...BASE, userId: " sfadmin\n", privateKey: PKCS8_PEM, now: NOW });
    expect(padded).toMatch(/">sfadmin<\/saml2:NameID>/);
    expect(verifyLikeAVerifier(padded, publicKey)).toEqual({ digestOk: true, signatureOk: true });
  });

  it.each(["\u0000", "\u0001", "\u000b", "\u000c", "\u001f", "\ufffe", "\uffff"])(
    "refuses a character XML 1.0 cannot carry (%j), naming the field and never the value",
    (bad) => {
      for (const [field, named] of [
        ["clientId", "the API key"],
        ["userId", "the user id"],
        ["tokenUrl", "the token URL"],
      ] as const) {
        const value = `${BASE[field]}${bad}secretish`;
        let caught: unknown;
        try {
          buildSignedSamlAssertionXml({ ...BASE, [field]: value, privateKey: PKCS8_PEM });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(SamlAssertionInputError);
        expect((caught as Error).message).toContain(`${named} contains a control character`);
        expect((caught as Error).message).not.toContain("secretish");
        // The Test result says it, rather than "could not be established".
        expect(publicSamlFailure(caught)?.detail).toBe((caught as Error).message);
      }
    },
  );

  it.each(["\t", "\n", "\r"])("refuses a token URL holding %j, which fetch would delete from the URL it posts to", (ws) => {
    expect(() =>
      buildSignedSamlAssertionXml({ ...BASE, tokenUrl: `https://api4.successfactors.com/oauth/${ws}token`, privateKey: PKCS8_PEM }),
    ).toThrow(new SamlAssertionInputError("the token URL contains a tab or line break. Type it again rather than pasting it."));
  });

  it("still accepts tab, line feed and carriage return, which XML can carry", () => {
    const xml = buildSignedSamlAssertionXml({ ...BASE, clientId: "a\tb\rc\nd", privateKey: PKCS8_PEM, now: NOW });
    expect(verifyLikeAVerifier(xml, publicKey)).toEqual({ digestOk: true, signatureOk: true });
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
    expect(verify(buildSignedSamlAssertionXml({ ...BASE, userId: " sfadmin\n", privateKey: PKCS8_PEM }))).toBe(true);
    expect(verify(buildSignedSamlAssertionXml({ ...BASE, clientId: "a\tb\rc\nd", privateKey: PKCS8_PEM }))).toBe(true);
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
    // Whitespace is absent, not present: " " passes a truthiness check and
    // is then refused by SuccessFactors as an unknown user.
    expect(missingSamlBearerFields({ ...BASE, companyId: "c", samlPrivateKey: PKCS8_PEM, samlUserId: "  " })).toEqual([
      "samlUserId (the SuccessFactors user the assertion is issued for)",
    ]);
  });

  it("signs and posts to the SAME token URL, trimmed — a trailing newline cannot split them", async () => {
    const fetchImpl = ok();
    await exchangeSamlBearerAssertion(
      {
        ...BASE,
        tokenUrl: `${BASE.tokenUrl}\n`,
        clientId: ` ${BASE.clientId}\n`,
        companyId: "acmeT1\n",
        samlPrivateKey: PKCS8_PEM,
        samlUserId: "sfadmin",
      },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(BASE.tokenUrl);
    const body = new URLSearchParams(String((init as RequestInit).body));
    expect(body.get("client_id")).toBe(BASE.clientId);
    expect(body.get("company_id")).toBe("acmeT1");
    const xml = Buffer.from(body.get("assertion")!, "base64").toString("utf8");
    expect(xml).toContain(`Recipient="${BASE.tokenUrl}"`);
    expect(xml).toContain(`<saml2:AttributeValue xsi:type="xs:string">${BASE.clientId}</saml2:AttributeValue>`);
  });

  it.each([
    ["an invisible character in the host", "https://api4.success\u200Bfactors.com/oauth/token"],
    ["an upper-case host", "https://API4.SuccessFactors.com/oauth/token"],
    ["a default port", "https://api4.successfactors.com:443/oauth/token"],
    ["a dot segment", "https://api4.successfactors.com/oauth/./token"],
    ["a fragment, which is never sent", "https://api4.successfactors.com/oauth/token#x"],
    ["a tab, which fetch deletes", "https://api4.successfactors.com/oauth/\ttoken"],
  ])("signs the Recipient as the URL actually posted to, given %s", async (_, tokenUrl) => {
    const fetchImpl = ok();
    await exchangeSamlBearerAssertion(
      { ...BASE, tokenUrl, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(BASE.tokenUrl);
    const xml = Buffer.from(new URLSearchParams(String((init as RequestInit).body)).get("assertion")!, "base64").toString("utf8");
    expect(xml).toContain(`Recipient="${BASE.tokenUrl}"`);
    expect(verifyLikeAVerifier(xml, publicKey)).toEqual({ digestOk: true, signatureOk: true });
  });

  it.each([
    ["a user name and password", "https://svc:Secr3t@api4.successfactors.com/oauth/token"],
    ["no scheme separator", "https//api4.successfactors.com/oauth/token"],
    ["plain http", "http://api4.successfactors.com/oauth/token"],
  ])("refuses a token URL fetch could never send (%s), without repeating it", async (_, tokenUrl) => {
    const fetchImpl = ok();
    const error = await exchangeSamlBearerAssertion(
      { ...BASE, tokenUrl, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SamlBearerConfigError);
    expect((error as Error).message).not.toContain("api4");
    expect(publicSamlFailure(error)?.detail).toMatch(/valid https oauthTokenUrl/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the URL out of a fetch failure's message", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError(`fetch failed: ${BASE.tokenUrl}`));
    const error = await exchangeSamlBearerAssertion(
      { ...BASE, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    ).catch((e: unknown) => e);
    expect((error as Error).message).toBe("SAML bearer token request for Connection zvcsf could not be sent.");
  });

  it("reads no more than 64 KB of the token response, however much is sent", async () => {
    // fetch inflates gzip without a limit; read whole, a 255 KB reply reached
    // 1.1 GB. An endless body must settle at once, as a refusal that said nothing.
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(new TextEncoder().encode('{"errorMessage":"' + "a".repeat(16 * 1024)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(endless, { status: 401 }));
    const error = await exchangeSamlBearerAssertion(
      { ...BASE, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SamlBearerExchangeError);
    expect((error as SamlBearerExchangeError).publicDetail).toMatch(/^SuccessFactors refused the token request \(HTTP 401\)\. /);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);

    // A declared length over the limit is not read at all.
    const declared = vi.fn().mockResolvedValue(
      new Response("{}", { status: 401, headers: { "content-length": String(10 * 1024 * 1024) } }),
    );
    await expect(
      exchangeSamlBearerAssertion(
        { ...BASE, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
        "Connection zvcsf",
        { fetchImpl: declared as unknown as typeof fetch, timeoutMs: 5000 },
      ),
    ).rejects.toThrow(SamlBearerExchangeError);
  });

  it("still reads a real, small token response from a stream", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ access_token: "tok", expires_in: 60 }), { status: 200 }));
    const result = await exchangeSamlBearerAssertion(
      { ...BASE, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    );
    expect(result).toEqual({ accessToken: "tok", ttlMs: 60_000 });
  });

  it("names a missing field in the Test result, without the label or any value", async () => {
    const fetchImpl = ok();
    const error = await exchangeSamlBearerAssertion(
      { ...BASE, companyId: "   ", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
      "Connection zvcsf",
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5000 },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SamlBearerConfigError);
    expect((error as Error).message).toBe("Connection zvcsf is SAML bearer auth but missing companyId.");
    // UNAUTHORIZED, not ERROR (audit A20): a field the connection lacks is a
    // sign-in that could not happen — the platform admin's fix — and ERROR is
    // "SAP unavailable", the client Basis team's lane, for a tenant never called.
    expect(publicSamlFailure(error)).toEqual({
      status: "UNAUTHORIZED",
      httpStatus: null,
      detail: "This connection is missing companyId. Save it again with that filled in.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
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
    expect(sanitizeSuccessFactorsError(`x ${"aB3+/9zQ".repeat(7)} y`)).toBe("x […] y");
    expect(sanitizeSuccessFactorsError(`x ${"aB3_-9zQ".repeat(7)} y`)).toBe("x […] y");
    expect(sanitizeSuccessFactorsError("z".repeat(10) + " " + "w ".repeat(400))!.length).toBeLessThanOrEqual(300);
  });

  it("keeps SuccessFactors' own error codes, which name the failure class", () => {
    expect(sanitizeSuccessFactorsError("OAUTH2_ERROR_UNABLE_TO_VERIFY_SAML_ASSERTION")).toBe(
      "OAUTH2_ERROR_UNABLE_TO_VERIFY_SAML_ASSERTION",
    );
    expect(
      sanitizeSuccessFactorsError("OAUTH2_ERROR_UNABLE_TO_COLLECT_SAML_ASSERTION: The SAML assertion is not Base64 encoded"),
    ).toBe("OAUTH2_ERROR_UNABLE_TO_COLLECT_SAML_ASSERTION: The SAML assertion is not Base64 encoded");
  });

  it("is linear in practice: a megabyte from a hostile token endpoint costs milliseconds, not minutes", () => {
    /*
     * The link and host patterns backtrack. Run over the whole answer they took
     * minutes on a megabyte of "a.", with the event loop blocked — on the Test
     * button, every northbound call and the fleet-wide sweep. The text is cut to
     * a window first; only 300 characters are ever shown.
     */
    // Whitespace-dense too: the collapse is linear, but a gzip reply of 61 KB
    // inflates to 64 MB, and at a tenth of a second per megabyte that stalled
    // the event loop for seconds before the raw text was cut first.
    for (const unit of ["a.", "A.", "a-", "+", "a:", "a ", " a", "a\t\n", "1.1.", "<>"]) {
      const started = performance.now();
      const said = sanitizeSuccessFactorsError(unit.repeat(1_000_000 / unit.length), { clientId: BASE.clientId, companyId: "acmeT1", samlUserId: "sfadmin" });
      expect(performance.now() - started, `${JSON.stringify(unit)} took too long`).toBeLessThan(250);
      // Null when nothing is left to show — "<>" alone normalises to nothing.
      expect(said?.length ?? 0).toBeLessThanOrEqual(300);
    }
  });

  it("does not even read past its limit: 64 MB of whitespace-dense text costs milliseconds", () => {
    const huge = "a ".repeat(32 * 1024 * 1024);
    const started = performance.now();
    sanitizeSuccessFactorsError(huge, { companyId: "acmeT1" });
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("still shows the start of a long refusal, cut at a word", () => {
    const said = sanitizeSuccessFactorsError(`Unable to validate "Recipient" ${"word ".repeat(5000)}`)!;
    expect(said.startsWith('Unable to validate "Recipient" word word')).toBe(true);
  });

  it("carries no link, host or markup — the detail reaches an email and people not shown where it points", () => {
    const said = sanitizeSuccessFactorsError(
      'Re-authenticate <a href="https://evil.example/login">here</a>, or see help.sap.com/docs or http://x.ondemand.com/a?b=c',
    )!;
    expect(said).not.toMatch(/https?:|evil\.example|help\.sap\.com|ondemand\.com|[<>]/);
    expect(said).toContain("[link]");
    expect(said).toContain("[host]");
    // A sentence missing its space is not a host name.
    expect(sanitizeSuccessFactorsError("Unable to verify the SAML assertion.Please retry")).toBe(
      "Unable to verify the SAML assertion.Please retry",
    );
  });

  it.each([
    "Re-authenticate at 1HTTPS://EVIL.EXAMPLE/sf-login",
    "Re-authenticate at _https://evil.example/login",
    "Re-authenticate at WWW.EVIL-LOGIN.COM",
    "Re-authenticate at evil.COM",
    "Re-authenticate at Www.Evil-Login.Com",
    "Re-authenticate at 10.0.0.1/login",
    "Re-authenticate at аррӏе.com/login",
    "Re-authenticate at evil。example",
    "Write to MAILTO:PHISH@EVIL.EXAMPLE",
    "Write to phish@evil.example",
    // Split so no pattern sees it whole, then rejoined by the markup strip.
    "Sign in again at https:<>//evil<>.example<>.com/login",
    "Sign in again at evil<>.example<>.com",
    "Write to mai<>lto:phish@evil",
    "Access denied for 10<>.0.0.1",
    // Shapes the patterns used to miss.
    "Access denied for IP address 10.0.0.1.",
    "Access denied for 2001:db8:85a3::8a2e:370:7334",
    "Sign in again at .evil.example.com/reset",
    "Sign in again at _evil.example.com/reset",
    "See...evil.example.com",
    "Sign in at evil.भारत",
    "Sign in at evil\u00AD.com",
    "Sign in at evil\u200B.com",
    "Sign in at evil\u200E.example\u200E.com",
    "Access denied for 10\u2063.0.0.1",
  ])("removes the host or link in %j", (message) => {
    const said = sanitizeSuccessFactorsError(message)!;
    expect(said).not.toMatch(/evil|EVIL|Evil|10\.0\.0\.1|аррӏе|2001:db8|https?:|mailto/i);
    expect(said).toMatch(/\[(host|link)\]/);
  });

  it.each([
    "Unable to map user at 12:30:45 UTC",
    "Unable to validate BizX.User in SAML2.0",
    "Use X.509 certificates, e.g. version v1.2.3",
    'Unable to validate "Conditions.NotBefore"',
    "Unable to verify the SAML assertion.Please retry",
  ])("keeps %j, which is SuccessFactors' words, not a host", (message) => {
    expect(sanitizeSuccessFactorsError(message)).toBe(message);
  });

  it("replaces the sealed API key, company id and user id SuccessFactors echoes back", () => {
    const sealed = { clientId: BASE.clientId, companyId: "acmeT1", samlUserId: "sfadmin" };
    expect(
      sanitizeSuccessFactorsError(`API key "${BASE.clientId}" does not exist in company "ACMET1". User SFAdmin unmapped.`, sealed),
    ).toBe('API key "[API key]" does not exist in company "[company id]". User [user id] unmapped.');
    // A company id inside the API key cannot leave half of the key behind.
    expect(
      sanitizeSuccessFactorsError("key abcdefgh0123 refused", { clientId: "abcdefgh0123", companyId: "defgh" }),
    ).toBe("key [API key] refused");
    // Too short to replace without hiding ordinary words.
    expect(sanitizeSuccessFactorsError("company c is inactive", { companyId: "c" })).toBe("company c is inactive");
  });

  it("replaces a sealed value as a whole word only, so a short user id cannot rewrite SuccessFactors' message", () => {
    // "sam" inside SAML used to come out as "[user id]L" — which both broke the
    // documented message and told the reader the value.
    const sealed = { samlUserId: "sam", companyId: "api" };
    for (const documented of [
      "Unable to verify the signature of the SAML assertion",
      "OAUTH2_ERROR_SAML_ASSERTION_EXPIRED",
      'Unable to validate "api_key" in the SAML assertion',
    ]) {
      expect(sanitizeSuccessFactorsError(documented, sealed)).toBe(documented);
    }
    expect(sanitizeSuccessFactorsError('Login failed - invalid user "SAM"', sealed)).toBe(
      'Login failed - invalid user "[user id]"',
    );
  });

  it("replaces a sealed value echoed inside markup — the bracket stays a word boundary until it is redacted", () => {
    const sealed = { companyId: "acmeT1", samlUserId: "sfadmin" };
    expect(
      sanitizeSuccessFactorsError("Unable to map <saml2:NameID>sfadmin</saml2:NameID> to a valid BizX User ID", sealed),
    ).not.toContain("sfadmin");
    expect(sanitizeSuccessFactorsError("Company <CompanyId>acmeT1</CompanyId> does not exist.", sealed)).not.toContain("acmeT1");
    expect(sanitizeSuccessFactorsError("company<acmeT1>", sealed)).not.toContain("acmeT1");
    expect(sanitizeSuccessFactorsError('Invalid company "a<b>c1"', { companyId: "a<b>c1" })).toBe('Invalid company "[company id]"');
  });

  it("replaces a sealed value with whitespace inside, as SuccessFactors echoes it", () => {
    // The refusal is collapsed before it is matched, so the value must be too.
    for (const companyId of ["acme\tT1", "acme  T1", "acme\u00A0T1", "ACME\u3000CORP"]) {
      expect(
        sanitizeSuccessFactorsError(`API key "k" does not exist in company "${companyId}"`, { companyId }),
      ).toBe('API key "k" does not exist in company "[company id]"');
    }
    expect(sanitizeSuccessFactorsError("Unable to map Jane  Doe to a valid BizX User ID", { samlUserId: "Jane Doe" })).toBe(
      "Unable to map [user id] to a valid BizX User ID",
    );
  });

  it("replaces a sealed value whose lower-case form is not its own (İ, ẞ), and one with pattern characters", () => {
    expect(
      sanitizeSuccessFactorsError("Unable to map İPEK.YILMAZ to a valid BizX User ID", { samlUserId: "İPEK.YILMAZ" }),
    ).toBe("Unable to map [user id] to a valid BizX User ID");
    expect(sanitizeSuccessFactorsError('Invalid company "GROẞHANDEL01"', { companyId: "GROẞHANDEL01" })).toBe(
      'Invalid company "[company id]"',
    );
    expect(sanitizeSuccessFactorsError('Invalid company "ACME(Corp)*/1"', { companyId: "ACME(Corp)*/1" })).toBe(
      'Invalid company "[company id]"',
    );
  });

  it("never repeats the sealed identifiers through SuccessFactors' refusal — in the detail or the message", async () => {
    const creds = { ...BASE, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" };
    for (const errorMessage of [
      `API key "${BASE.clientId}" does not exist in company "acmeT1"`,
      `API key "${BASE.clientId}" has been disabled in company "acmeT1"`,
      "Unable to map sfadmin to a valid BizX User ID",
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ errorMessage }) });
      const error = await exchangeSamlBearerAssertion(creds, "Connection zvcsf", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 5000,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SamlBearerExchangeError);
      const e = error as SamlBearerExchangeError;
      for (const sealed of [BASE.clientId, "acmeT1", "sfadmin"]) {
        expect(e.publicDetail).not.toContain(sealed);
        expect(e.message).not.toContain(sealed);
      }
      expect(e.publicDetail).toMatch(/\[(API key|company id|user id)\]/);
    }
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

  it("after a re-save under the same key, Test signs with the NEW key — not the cached token", async () => {
    /*
     * The runbook's rotation step is "save the connection again with the new
     * key, then press Test". A re-save keeps the row id, and the cache keyed by
     * id alone answered that Test with the old credentials' token for about a
     * day, so a key that did not match the certificate still showed OK.
     */
    const { probeConnection } = await import("@/lib/studio/connection-health");
    const { clearOAuthTokenCache } = await import("@/lib/sap-public/connection-resolver");
    clearOAuthTokenCache();
    const tokenFetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ access_token: "tok", expires_in: 86399 }) });
    vi.stubGlobal("fetch", tokenFetch);
    const metadataFetch = vi.fn().mockResolvedValue({ status: 200 });
    const conn = {
      source: "db" as const,
      id: "conn_zvcsf",
      organizationId: "org_a",
      product: "successfactors",
      key: "zvcsf",
      label: "SuccessFactors",
      baseUrl: "https://api4.successfactors.com",
      authType: "oauth-saml-bearer" as const,
      secrets: { clientId: BASE.clientId, companyId: "acmeT1", samlPrivateKey: PKCS8_PEM, samlUserId: "sfadmin" },
      oauthTokenUrl: BASE.tokenUrl,
      writeEnabled: false,
      apiPath: null,
      timeoutMs: null,
      environment: "DEV" as const,
      client: null,
    };
    await probeConnection(conn, metadataFetch as unknown as typeof fetch);
    await probeConnection(conn, metadataFetch as unknown as typeof fetch);
    expect(tokenFetch).toHaveBeenCalledTimes(1);

    const newKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const rotated = { ...conn, secrets: { ...conn.secrets, samlPrivateKey: newKey.export({ type: "pkcs8", format: "pem" }) as string } };
    await probeConnection(rotated, metadataFetch as unknown as typeof fetch);
    expect(tokenFetch).toHaveBeenCalledTimes(2);
    const sent = new URLSearchParams(String((tokenFetch.mock.calls[1]![1] as RequestInit).body)).get("assertion")!;
    const xml = Buffer.from(sent, "base64").toString("utf8");
    expect(verifyLikeAVerifier(xml, createPublicKey(newKey))).toEqual({ digestOk: true, signatureOk: true });
  });
});
