/**
 * A SAML 2.0 bearer assertion for SuccessFactors' OAuth token endpoint, signed
 * here with the key from the customer's OAuth client registration.
 *
 * WHY SIGN HERE AT ALL. A pasted, pre-signed assertion expires — SAP's offline
 * generator defaults to ten minutes — and SuccessFactors' own /oauth/idp
 * generator is deprecated. A stored connection that holds one therefore works
 * for minutes and then fails every token exchange until a person pastes a new
 * one. Holding the private key instead lets every exchange carry a fresh,
 * short-lived assertion, which is also the safer shape: nothing long-lived and
 * replayable sits in the database, only the key that SuccessFactors already
 * trusts for this one API key.
 *
 * CANONICAL BY CONSTRUCTION. XML-DSig signs the exclusive canonical form
 * (xml-exc-c14n) of the assertion and of SignedInfo, and a verifier recomputes
 * both from the bytes it receives. Rather than parse XML and canonicalise it —
 * which needs a general XML library and its CVE history — this builds the tree
 * itself and serialises it twice from the same model: once as the document,
 * once under the exclusive-c14n rules (namespace declarations rendered only
 * where visibly used, attributes in canonical order, c14n escaping, no empty-
 * element shorthand). The digest and the signature are computed over the second.
 *
 * VERIFIED INDEPENDENTLY, not by reading this file twice. The tests check every
 * assertion this produces with xmlsec1 — the reference XML-DSig implementation —
 * when it is installed, and pin a deterministic test vector (RSA PKCS#1 v1.5 is
 * deterministic) that xmlsec1 verified, so CI catches any change to the bytes.
 *
 * Node's crypto only. No XML dependency, so nothing new for the audit gate.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  randomBytes,
  X509Certificate,
  type KeyObject,
} from "node:crypto";

/* ─────────────────────────────────────────────────────────────────────────────
 * What SuccessFactors matches
 * ────────────────────────────────────────────────────────────────────────── */

const SAML_NS = "urn:oasis:names:tc:SAML:2.0:assertion";
const XS_NS = "http://www.w3.org/2001/XMLSchema";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
const EXC_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

/** Issuer and Audience. SuccessFactors' own IdP and SAP's offline tool use this value for both. */
export const SF_ISSUER = "www.successfactors.com";
export const SF_AUDIENCE = "www.successfactors.com";
const NAMEID_UNSPECIFIED = "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified";
const BEARER = "urn:oasis:names:tc:SAML:2.0:cm:bearer";
const PASSWORD_PROTECTED = "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";
/** The attribute that carries the API key, as SuccessFactors-issued assertions name it. */
const API_KEY_ATTRIBUTE = "api_key";

/** SAP's offline generator defaults to ten minutes; an assertion here is used within seconds. */
export const DEFAULT_ASSERTION_LIFETIME_MS = 10 * 60 * 1000;
/**
 * NotBefore is backdated by this much — SAP's own generator's value.
 * SuccessFactors reports a NotBefore still in the future as an EXPIRED
 * assertion (400 OAUTH2_ERROR_SAML_ASSERTION_EXPIRED), so a clock slightly
 * ahead of SuccessFactors' would otherwise fail every exchange with a message
 * pointing the wrong way.
 */
const CLOCK_SKEW_MS = 10 * 60 * 1000;

/* ─────────────────────────────────────────────────────────────────────────────
 * A tree small enough to canonicalise without a parser
 * ────────────────────────────────────────────────────────────────────────── */

interface Attr {
  /** Prefixed attributes (e.g. xsi:type) carry their prefix; SAML's own attributes are unprefixed. */
  readonly prefix?: string;
  readonly name: string;
  readonly value: string;
}

interface El {
  readonly prefix: string;
  readonly name: string;
  /** Namespace declarations made ON this element in the document, prefix → URI. */
  readonly ns?: Readonly<Record<string, string>>;
  readonly attrs?: readonly Attr[];
  readonly children?: readonly (El | string)[];
}

function el(
  prefix: string,
  name: string,
  attrs: readonly Attr[] = [],
  children: readonly (El | string)[] = [],
  ns?: Record<string, string>,
): El {
  return { prefix, name, attrs, children, ...(ns ? { ns } : {}) };
}

const a = (name: string, value: string): Attr => ({ name, value });

/** c14n text escaping: &, <, > and CR. */
function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}

/** c14n attribute escaping: &, <, " and the three whitespace controls. */
function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

/**
 * Serialise exactly as the tree declares it — the document that is sent.
 *
 * Attribute order here is the canonical one too (see `canonical`), so for this
 * tree the two forms differ only in WHERE namespace declarations appear.
 */
function serialize(e: El): string {
  const nsAttrs = Object.entries(e.ns ?? {})
    .sort(([p1], [p2]) => (p1 < p2 ? -1 : p1 > p2 ? 1 : 0))
    .map(([p, uri]) => ` ${p ? `xmlns:${p}` : "xmlns"}="${escAttr(uri)}"`)
    .join("");
  const attrs = sortedAttrs(e.attrs ?? [], (p) => p)
    .map((x) => ` ${x.prefix ? `${x.prefix}:` : ""}${x.name}="${escAttr(x.value)}"`)
    .join("");
  const q = e.prefix ? `${e.prefix}:${e.name}` : e.name;
  const body = (e.children ?? []).map((c) => (typeof c === "string" ? escText(c) : serialize(c))).join("");
  return `<${q}${nsAttrs}${attrs}>${body}</${q}>`;
}

/**
 * Canonical attribute order: unprefixed (no-namespace) attributes first by
 * local name, then namespaced ones by (namespace URI, local name).
 */
function sortedAttrs(attrs: readonly Attr[], uriOf: (prefix: string) => string): Attr[] {
  const key = (x: Attr) => [x.prefix ? uriOf(x.prefix) : "", x.name] as const;
  return [...attrs].sort((x, y) => {
    const [u1, n1] = key(x);
    const [u2, n2] = key(y);
    if (u1 !== u2) return u1 < u2 ? -1 : 1;
    return n1 < n2 ? -1 : n1 > n2 ? 1 : 0;
  });
}

/**
 * Exclusive XML canonicalisation (without comments) of the subtree at `e`.
 *
 * `inScope` is every namespace declared on `e`'s ancestors in the DOCUMENT —
 * needed because a subtree is canonicalised in its document context (SignedInfo
 * sits inside Signature, which declares ds). `rendered` is what output
 * ancestors have already emitted; the exclusive rule renders a declaration
 * only on an element that visibly utilises the prefix (its own name or one of
 * its attributes) and only when no output ancestor already rendered the same
 * binding.
 */
function canonical(
  e: El,
  inScope: Readonly<Record<string, string>> = {},
  rendered: Readonly<Record<string, string>> = {},
): string {
  const scope = { ...inScope, ...(e.ns ?? {}) };
  const uriOf = (p: string) => {
    const uri = scope[p];
    if (uri === undefined) throw new Error(`namespace prefix "${p}" is not declared`);
    return uri;
  };

  const utilized = new Set<string>([e.prefix]);
  for (const x of e.attrs ?? []) if (x.prefix) utilized.add(x.prefix);

  const toRender: [string, string][] = [];
  for (const p of utilized) {
    const uri = p ? uriOf(p) : (scope[""] ?? "");
    if (rendered[p] !== uri && !(p === "" && uri === "" && rendered[""] === undefined)) {
      toRender.push([p, uri]);
    }
  }
  toRender.sort(([p1], [p2]) => (p1 < p2 ? -1 : p1 > p2 ? 1 : 0));
  const nextRendered = { ...rendered, ...Object.fromEntries(toRender) };

  const nsAttrs = toRender.map(([p, uri]) => ` ${p ? `xmlns:${p}` : "xmlns"}="${escAttr(uri)}"`).join("");
  const attrs = sortedAttrs(e.attrs ?? [], uriOf)
    .map((x) => ` ${x.prefix ? `${x.prefix}:` : ""}${x.name}="${escAttr(x.value)}"`)
    .join("");
  const q = e.prefix ? `${e.prefix}:${e.name}` : e.name;
  const body = (e.children ?? [])
    .map((c) => (typeof c === "string" ? escText(c) : canonical(c, scope, nextRendered)))
    .join("");
  return `<${q}${nsAttrs}${attrs}>${body}</${q}>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The private key
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A key that cannot be used, said without echoing any of it.
 *
 * Carries a bounded `code`, like the URL guard, so an audit row names the
 * refusal rather than a generic failure.
 */
export class SamlKeyError extends Error {
  readonly code = "SAML_PRIVATE_KEY_UNUSABLE";
  constructor(reason: string) {
    super(`The SuccessFactors signing key cannot be used: ${reason}`);
    this.name = "SamlKeyError";
  }
}

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/g;

/** Every PEM block in the text, by label, with its body's whitespace removed. */
function pemBlocks(text: string): { label: string; body: string }[] {
  return [...text.matchAll(PEM_BLOCK)].map((m) => ({ label: m[1]!, body: m[2]!.replace(/\s+/g, "") }));
}

/**
 * The DER a base64 body ultimately encodes — UNWRAPPING SUCCESSFACTORS' OWN
 * ENCODING when it is present.
 *
 * What "Generate X.509 Certificate" downloads (Certificate.pem) labels its key
 * block ENCRYPTED PRIVATE KEY, and the key is NOT encrypted: the body is
 *
 *     base64( base64(PKCS#8 DER) + "###" + suffix )      suffix: company id, or "false"
 *
 * SAP's own offline generator and the open-source clients proven against
 * SuccessFactors (NAV, Nango, SAP's Insomnia plugin) all decode it that way;
 * the certificate block carries the same wrapping. Three shapes therefore
 * reach here, and all three resolve to the same DER:
 *
 *   - the wrapped body itself (decodes to ASCII "MII…###…");
 *   - that ASCII pasted directly, already decoded once ("MII…###SFCPART…");
 *   - ordinary base64 DER, which decodes to bytes beginning 0x30 — never to
 *     text beginning "M", so the two cannot be confused.
 */
function unwrapDer(base64Body: string): Buffer {
  const outer = Buffer.from(base64Body.split("###")[0]!.replace(/\s+/g, ""), "base64");
  const asText = outer.toString("latin1");
  if (/^MII[A-Za-z0-9+/=\s]+(###[\s\S]*)?$/.test(asText)) {
    return Buffer.from(asText.split("###")[0]!.replace(/\s+/g, ""), "base64");
  }
  return outer;
}

/** Load DER as PKCS#8, then PKCS#1; say "encrypted" only for a key that genuinely is. */
function loadKeyDer(der: Buffer): KeyObject {
  let encrypted = false;
  for (const type of ["pkcs8", "pkcs1"] as const) {
    try {
      return createPrivateKey({ key: der, format: "der", type });
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_MISSING_PASSPHRASE") encrypted = true;
    }
  }
  throw new SamlKeyError(
    encrypted
      ? "it is passphrase-encrypted. Export it without a passphrase — it is sealed at rest like every other secret here."
      : "it is neither SuccessFactors' Certificate.pem key, PEM, nor base64-encoded PKCS#8 / PKCS#1.",
  );
}

/**
 * Refuse a key that belongs to none of the certificates in the same file.
 *
 * SuccessFactors verifies every assertion against the certificate registered
 * for the API key — KeyInfo is ignored — so a mismatched pair fails as a 401
 * "unable to verify the signature" on the first exchange: the most common
 * production failure of this flow. When the pasted file carries the
 * certificate, that 401 can be said now instead.
 *
 * ANY certificate may be the key's: a chain or a PFX export can list the
 * issuing CA before the leaf, and comparing with the first block alone refused
 * a correct key with no way round it. An unreadable certificate block is not
 * treated as a refusal either: the check is a courtesy, and the key may still
 * be the right one. So it refuses only when at least one certificate was read
 * and none of them matched.
 */
function assertKeyMatchesACertificate(key: KeyObject, certDers: Buffer[]): void {
  const fromKey = createPublicKey(key).export({ type: "spki", format: "der" });
  let readable = 0;
  for (const der of certDers) {
    let cert: X509Certificate;
    try {
      cert = new X509Certificate(der);
    } catch {
      continue;
    }
    readable++;
    if (fromKey.equals(cert.publicKey.export({ type: "spki", format: "der" }))) return;
  }
  if (readable > 0) {
    throw new SamlKeyError(
      "it does not belong to the certificate in the same file, so SuccessFactors would refuse every assertion it signs.",
    );
  }
}

/**
 * Accept the key in the shapes an administrator will actually have.
 *
 * - SuccessFactors' Certificate.pem, as downloaded — its misleadingly
 *   labelled ENCRYPTED PRIVATE KEY block and its certificate, which is used to
 *   check the pair (see `unwrapDer`, `assertKeyMatchesACertificate`);
 * - the one-line blob from that block, which is what SAP's offline tool's
 *   `privateKey` property takes;
 * - PEM PKCS#8 (`BEGIN PRIVATE KEY`) or PKCS#1 (`BEGIN RSA PRIVATE KEY`), for a
 *   key pair the customer generated and registered themselves — the path SAP
 *   recommends — and headerless base64 of either;
 * - any of these with its line breaks written as the two characters `\n`.
 *
 * Refused: a key that genuinely needs a passphrase, and any key that is not
 * RSA of at least 2048 bits, which is what RSA-SHA256 signing requires.
 */
export function parseSamlPrivateKey(raw: string): KeyObject {
  // A key copied out of a .env file or a hosting dashboard often carries its
  // line breaks as the two characters `\n`. Base64 and PEM never contain a
  // backslash, so decoding them is safe — and it is done here, for every
  // caller, so the Studio form accepts what the env path accepts.
  const text = raw.replace(/\\r\\n|\\n|\\r/g, "\n").trim();
  if (!text) throw new SamlKeyError("no key was supplied.");

  let key: KeyObject;
  const blocks = pemBlocks(text);
  if (blocks.length > 0) {
    const keyBlock = blocks.find((b) => b.label.endsWith("PRIVATE KEY"));
    if (!keyBlock) {
      throw new SamlKeyError("the PEM text contains no private key block (a certificate alone is not enough).");
    }
    // Legacy OpenSSL encryption puts its marker in a header inside the block.
    if (keyBlock.body.includes("Proc-Type:")) {
      throw new SamlKeyError(
        "it is passphrase-encrypted. Export it without a passphrase — it is sealed at rest like every other secret here.",
      );
    }
    key = loadKeyDer(unwrapDer(keyBlock.body));
    assertKeyMatchesACertificate(
      key,
      blocks.filter((b) => b.label === "CERTIFICATE").map((b) => unwrapDer(b.body)),
    );
  } else if (text.includes("-----BEGIN")) {
    throw new SamlKeyError("the PEM text is incomplete — a BEGIN line without its matching END line.");
  } else {
    key = loadKeyDer(unwrapDer(text));
  }

  if (key.asymmetricKeyType !== "rsa") {
    throw new SamlKeyError(`it is ${key.asymmetricKeyType ?? "an unknown"} key; SuccessFactors signs with RSA.`);
  }
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (bits < 2048) throw new SamlKeyError(`it is ${bits}-bit RSA; at least 2048 bits is required.`);
  return key;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * The assertion
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A value the assertion cannot carry, said without repeating it.
 *
 * A field problem is a configuration fix, so it is named — publicSamlFailure
 * lets this sentence through to the Test result — and the value is not echoed.
 */
export class SamlAssertionInputError extends Error {
  readonly code = "SAML_ASSERTION_INPUT_INVALID";
  constructor(reason: string) {
    super(`The SuccessFactors assertion cannot be built: ${reason}`);
    this.name = "SamlAssertionInputError";
  }
}

/**
 * Characters XML 1.0 forbids outright: C0 controls other than tab, line feed
 * and carriage return, and U+FFFE / U+FFFF. Escaping cannot carry them — a
 * character reference such as `&#x1;` is just as illegal — so a value holding
 * one would make every assertion a document no parser accepts. A vertical tab
 * pasted from a spreadsheet cell is the realistic way one arrives.
 */
export const XML_ILLEGAL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

export interface SamlAssertionInput {
  /** The SuccessFactors API key — the OAuth client id. */
  readonly clientId: string;
  /** The SuccessFactors user the token is issued for. */
  readonly userId: string;
  /** The token endpoint, e.g. https://apiNN.successfactors.com/oauth/token — the Recipient. */
  readonly tokenUrl: string;
  /** A KeyObject from `parseSamlPrivateKey`, or the raw key text. */
  readonly privateKey: KeyObject | string;
  /** Overrides for tests: the clock, the lifetime, the assertion ID and the session index. */
  readonly now?: Date;
  readonly lifetimeMs?: number;
  readonly id?: string;
  readonly sessionIndex?: string;
}

/**
 * xs:dateTime in UTC with milliseconds — the form SAP's documentation example,
 * SAP's generator and the proven open-source signers all emit.
 */
function samlTime(ms: number): string {
  return new Date(ms).toISOString();
}

/** An NCName: SAML IDs may not start with a digit. Used for the ID and, separately, the SessionIndex. */
function newSamlId(): string {
  return `_${randomBytes(16).toString("hex")}`;
}

function assertionTree(
  input: SamlAssertionInput,
  id: string,
  sessionIndex: string,
  signature: El | null,
): El {
  const now = (input.now ?? new Date()).getTime();
  const issueInstant = samlTime(now);
  const notBefore = samlTime(now - CLOCK_SKEW_MS);
  const notOnOrAfter = samlTime(now + (input.lifetimeMs ?? DEFAULT_ASSERTION_LIFETIME_MS));

  const issuer = el("saml2", "Issuer", [], [SF_ISSUER]);
  return el(
    "saml2",
    "Assertion",
    [a("ID", id), a("IssueInstant", issueInstant), a("Version", "2.0")],
    [
      issuer,
      // The schema puts the enveloped Signature immediately after Issuer.
      ...(signature ? [signature] : []),
      el("saml2", "Subject", [], [
        el("saml2", "NameID", [a("Format", NAMEID_UNSPECIFIED)], [input.userId]),
        el("saml2", "SubjectConfirmation", [a("Method", BEARER)], [
          el("saml2", "SubjectConfirmationData", [
            a("NotOnOrAfter", notOnOrAfter),
            a("Recipient", input.tokenUrl),
          ]),
        ]),
      ]),
      el("saml2", "Conditions", [a("NotBefore", notBefore), a("NotOnOrAfter", notOnOrAfter)], [
        el("saml2", "AudienceRestriction", [], [el("saml2", "Audience", [], [SF_AUDIENCE])]),
      ]),
      el("saml2", "AuthnStatement", [a("AuthnInstant", issueInstant), a("SessionIndex", sessionIndex)], [
        el("saml2", "AuthnContext", [], [el("saml2", "AuthnContextClassRef", [], [PASSWORD_PROTECTED])]),
      ]),
      el("saml2", "AttributeStatement", [], [
        el("saml2", "Attribute", [a("Name", API_KEY_ATTRIBUTE)], [
          /*
           * TYPED, as SAP's documentation and generator type it. Under
           * exclusive c14n this is what moves the xsi declaration onto this
           * element and drops xs entirely (it appears only inside an
           * attribute VALUE, which is not "visible utilisation") — so the
           * document and its canonical form differ here, and only here.
           */
          el("saml2", "AttributeValue", [{ prefix: "xsi", name: "type", value: "xs:string" }], [input.clientId]),
        ]),
      ]),
    ],
    { saml2: SAML_NS, xs: XS_NS, xsi: XSI_NS },
  );
}

function signedInfoTree(id: string, digest: string): El {
  return el("ds", "SignedInfo", [], [
    el("ds", "CanonicalizationMethod", [a("Algorithm", EXC_C14N)]),
    el("ds", "SignatureMethod", [a("Algorithm", RSA_SHA256)]),
    el("ds", "Reference", [a("URI", `#${id}`)], [
      el("ds", "Transforms", [], [
        el("ds", "Transform", [a("Algorithm", ENVELOPED)]),
        el("ds", "Transform", [a("Algorithm", EXC_C14N)]),
      ]),
      el("ds", "DigestMethod", [a("Algorithm", SHA256)]),
      el("ds", "DigestValue", [], [digest]),
    ]),
  ]);
}

/**
 * The signed assertion as XML. Exported for tests and for the verification
 * step; callers that send it want `buildSignedSamlAssertion`.
 */
export function buildSignedSamlAssertionXml(input: SamlAssertionInput): string {
  // The user id is trimmed — surrounding whitespace in NameID is a user no
  // SuccessFactors tenant has, refused as "invalid user" — and checked as sent.
  const userId = input.userId.trim();
  for (const [field, value] of [
    ["the API key", input.clientId],
    ["the user id", userId],
    ["the token URL", input.tokenUrl],
  ] as const) {
    if (!value || !value.trim()) throw new SamlAssertionInputError(`${field} is missing.`);
    if (XML_ILLEGAL_CHARACTER.test(value)) {
      throw new SamlAssertionInputError(
        `${field} contains a control character, which XML cannot carry. Type it again rather than pasting it.`,
      );
    }
  }
  const key = typeof input.privateKey === "string" ? parseSamlPrivateKey(input.privateKey) : input.privateKey;
  const id = input.id ?? newSamlId();
  const sessionIndex = input.sessionIndex ?? newSamlId();
  /*
   * ONE INSTANT FOR BOTH TREES. The digested tree and the sent tree are built
   * separately, and each used to read the clock: with second precision they
   * almost always agreed, so it passed — and failed whenever signing straddled
   * a second. With milliseconds they never agree. xmlsec1 caught it as "data
   * and digest do not match"; the digest must describe the bytes sent.
   */
  const at: SamlAssertionInput = { ...input, userId, now: input.now ?? new Date() };

  // 1 · Digest the assertion WITHOUT its signature: the enveloped-signature
  //     transform removes it before the verifier canonicalises.
  const unsigned = assertionTree(at, id, sessionIndex, null);
  const digest = createHash("sha256").update(canonical(unsigned), "utf8").digest("base64");

  // 2 · Sign SignedInfo in its document context: inside Signature, which
  //     declares ds, inside Assertion, which declares saml2 (not rendered —
  //     SignedInfo does not use it).
  const signedInfo = signedInfoTree(id, digest);
  const signedInfoC14n = canonical(signedInfo, { saml2: SAML_NS, xs: XS_NS, xsi: XSI_NS, ds: DSIG_NS });
  const signatureValue = createSign("RSA-SHA256").update(signedInfoC14n, "utf8").sign(key, "base64");

  const signature = el(
    "ds",
    "Signature",
    [],
    [signedInfo, el("ds", "SignatureValue", [], [signatureValue])],
    { ds: DSIG_NS },
  );
  return serialize(assertionTree(at, id, sessionIndex, signature));
}

/** The base64 assertion the token endpoint's `assertion` parameter takes. */
export function buildSignedSamlAssertion(input: SamlAssertionInput): string {
  return Buffer.from(buildSignedSamlAssertionXml(input), "utf8").toString("base64");
}

/** Exposed for tests: the exclusive canonical form of the unsigned assertion. */
export function canonicalUnsignedAssertionForTest(input: SamlAssertionInput, id: string, sessionIndex: string): string {
  return canonical(assertionTree(input, id, sessionIndex, null));
}
